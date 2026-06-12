/**
 * SimplifiedQuiltAppV2 quilt slice: render, contributors, reset countdown, color submit (Phase C3).
 * Methods merged onto SimplifiedQuiltAppV2.prototype in the main app module.
 */
(function (root) {
  'use strict';

  const CONTRIBUTOR_NAME_GLIMMER_EFFECT_ID = 'white-stamp';

  /** Firebase v9+ modular uses `exists` property; older snippets used `exists()`. */
  function firestoreSnapExists(snap) {
    if (!snap) return false;
    if (typeof snap.exists === 'function') return snap.exists();
    return !!snap.exists;
  }

  function readNewspaperClippingUrlFromDoc(data) {
    const row = data && typeof data === 'object' ? data : {};
    return String(row.newspaperClippingUrl || row.newspaperClippingImageStorageUrl || '').trim();
  }

  function newspaperClippingCacheStamp(data) {
    const row = data && typeof data === 'object' ? data : {};
    return String(
      row.newspaperClippingGeneratedAt || row.lastIgPushCompletedAt || row.lastUpdated || ''
    ).trim();
  }

  function readNewspaperClippingExportRevFromDoc(data) {
    const row = data && typeof data === 'object' ? data : {};
    return String(row.newspaperClippingExportRev || '').trim();
  }

  /** True when Firestore exportRev is older than bundled CLIPPING_EXPORT_REV (logging / regen hints only). */
  function isStoredClippingExportStale(storedExportRev) {
    const bundled = String(globalThis.QuiltNewspaperClipping?.CLIPPING_EXPORT_REV || '').trim();
    const stored = String(storedExportRev || '').trim();
    if (!bundled || !stored) return false;
    const b = Number(bundled);
    const s = Number(stored);
    if (!Number.isFinite(b) || !Number.isFinite(s)) return false;
    return b > s;
  }

  function readNewspaperClippingUrlOdqT(url) {
    const u = String(url || '').trim();
    const match = u.match(/[?&]odq_t=([^&]+)/);
    return match ? String(match[1]).trim() : '';
  }

  /** Force the browser to refetch Storage PNG bytes (same token URL can be overwritten in place). */
  function withNewspaperClippingBrowserCacheBust(url, rev = '') {
    const u = String(url || '').trim();
    if (!u || u.startsWith('data:') || u.startsWith('blob:')) return u;
    const bust = String(rev || Date.now()).trim();
    try {
      const parsed = new URL(u, typeof location !== 'undefined' ? location.href : 'https://local.invalid/');
      parsed.searchParams.set('odq_v', bust);
      return parsed.href;
    } catch (_) {
      const sep = u.includes('?') ? '&' : '?';
      return `${u}${sep}odq_v=${encodeURIComponent(bust)}`;
    }
  }

  function isRemoteNewspaperClippingUrl(url) {
    const u = String(url || '').trim();
    return /^https?:\/\//i.test(u);
  }

  class SimplifiedQuiltAppV2Quilt {
    _cancelDeferredQuiltRenderForIdle() {
      if (this._deferredQuiltRenderIdleId != null && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(this._deferredQuiltRenderIdleId);
        this._deferredQuiltRenderIdleId = null;
      }
      if (this._deferredQuiltRenderTimer) {
        clearTimeout(this._deferredQuiltRenderTimer);
        this._deferredQuiltRenderTimer = null;
      }
      this._deferredQuiltRenderQueued = false;
      const qc = document.querySelector('#screen-quilt .quilt-container');
      if (qc) qc.classList.remove('odq-quilt-shell--pending');
    }

    _scheduleDeferredQuiltRenderForIdle(options = {}) {
      if (this._deferredQuiltRenderQueued) return;
      this._deferredQuiltRenderQueued = true;
      if (window.odqPerfMark) window.odqPerfMark('quilt-render-idle-queued');
      const qc = document.querySelector('#screen-quilt .quilt-container');
      if (qc) qc.classList.add('odq-quilt-shell--pending');

      const run = async () => {
        this._deferredQuiltRenderIdleId = null;
        this._deferredQuiltRenderTimer = null;
        try {
          await this.renderQuilt();
          if (window.odqPerfMark) window.odqPerfMark('after-render-quilt');
          this.updateSquareCounter();
        } catch (err) {
          this.logger.warn('Deferred renderQuilt failed:', err);
        } finally {
          if (qc) qc.classList.remove('odq-quilt-shell--pending');
          this._deferredQuiltRenderQueued = false;
        }
      };

      const urgent = options.urgent === true;
      if (urgent) {
        this._deferredQuiltRenderTimer = setTimeout(() => {
          void run();
        }, 50);
        return;
      }
      if (typeof requestIdleCallback === 'function') {
        this._deferredQuiltRenderIdleId = requestIdleCallback(() => {
          void run();
        }, { timeout: 2500 });
      } else {
        this._deferredQuiltRenderTimer = setTimeout(() => {
          void run();
        }, 1);
      }
    }

    /**
     * Same-day returners who already completed today's color land on the quilt
     * after a brief portal view. Mirrors visit logic in `autoTransitionFromPortal`
     * (must stay in sync).
     */
    getDailyVisitDateKey() {
      if (typeof Utils !== 'undefined' && typeof Utils.getTodayKey === 'function') {
        return Utils.getTodayKey();
      }
      return new Date().toISOString().split('T')[0];
    }

    getEffectiveAppDateKey() {
      if (this._adminPreview?.dateKey) return this._adminPreview.dateKey;
      return (
        this.quoteService?.getQuoteCalendarKeyNow?.() ||
        (typeof Utils !== 'undefined' && Utils.getTodayKey ? Utils.getTodayKey() : '')
      );
    }

    getEffectiveQuiltQuote() {
      const previewKey = this._adminPreview?.dateKey;
      if (previewKey) {
        const pinned = this.quoteService?._pinnedByDateKey?.[previewKey];
        if (pinned?.text) return pinned;
        if (this._adminPreview?.quote?.text) return this._adminPreview.quote;
        return null;
      }
      return this.quoteService?.getTodayQuote?.() || null;
    }

    _syncAdminPreviewQuoteFromPin() {
      if (!this.isAdminTomorrowPreviewActive()) return;
      const dk = String(this._adminPreview?.dateKey || '').trim();
      if (!dk) return;
      const pinned = this.quoteService?._pinnedByDateKey?.[dk];
      if (pinned?.text) this._adminPreview.quote = pinned;
    }

    isAdminTomorrowPreviewActive() {
      return !!this._adminPreview?.dateKey;
    }

    /** Clear mood triptych + Layout B caches so a date preview cannot reuse today's chrome. */
    _invalidateQuiltChromeForAdminDatePreview() {
      this._invalidateLayoutBStoryPreviewForAppDayChange?.();
      this._unmountQuiltMoodSpread?.();
      const spreadHost = document.getElementById('quiltMoodSpread');
      if (spreadHost) {
        delete spreadHost.dataset.contentSig;
        delete spreadHost.dataset.moodSpreadDateKey;
        delete spreadHost.dataset.quoteClippingStamp;
        delete spreadHost.dataset.goodDay;
        delete spreadHost.dataset.roughDay;
        spreadHost.classList.remove('is-ready', 'is-open');
      }
      this._quoteScreenClippingMountedKey = '';
      this._quoteScreenClippingUrlStamp = '';
      const quoteClipping = document.querySelector('#screen-quote .quote-screen-clipping');
      const quoteClippingImg = document.querySelector('#screen-quote .quote-screen-clipping__image');
      if (quoteClipping) {
        quoteClipping.classList.remove('quote-screen-clipping--has-png', 'quote-screen-clipping--ready');
      }
      if (quoteClippingImg) {
        quoteClippingImg.hidden = true;
        quoteClippingImg.removeAttribute('src');
      }
      this._quoteSpeakerLastFitName = null;
      this._quoteSpeakerImageToken = null;
      this._quoteSpeakerLoadedToken = null;
      this._quoteSpeakerCutoutUrl = '';
      this._quoteSpeakerLoadGeneration = (this._quoteSpeakerLoadGeneration || 0) + 1;
      this._beforeYouGoHydratedDateKey = null;
    }

    hasSeenDailyQuoteToday(currentDate = this.getDailyVisitDateKey()) {
      try {
        return localStorage.getItem('ourDailyQuoteSeenDate') === currentDate;
      } catch (_) {
        return false;
      }
    }

    markDailyQuoteSeen(currentDate = this.getDailyVisitDateKey()) {
      const alreadySeen = this.hasSeenDailyQuoteToday(currentDate);
      try {
        localStorage.setItem('ourDailyQuoteSeenDate', currentDate);
      } catch (_) {
        /* */
      }
      if (!alreadySeen && typeof window.odqTrack === 'function') {
        window.odqTrack('daily_quote_seen', { app_date_key: currentDate });
      }
    }

    hasCompletedDailyColorToday(currentDate = this.getDailyVisitDateKey()) {
      try {
        return localStorage.getItem('ourDailyColorCompletedDate') === currentDate;
      } catch (_) {
        return false;
      }
    }

    markDailyColorCompleted(currentDate = this.getDailyVisitDateKey()) {
      try {
        localStorage.setItem('ourDailyColorCompletedDate', currentDate);
      } catch (_) {
        /* */
      }
    }

    resetFirstTimeUserState() {
      try {
        localStorage.removeItem('ourDailyHasVisited');
        localStorage.removeItem('ourDailyLastVisitDate');
        localStorage.removeItem('ourDailyQuoteSeenDate');
        localStorage.removeItem('ourDailyColorCompletedDate');
        localStorage.removeItem('ourDailyFriendTermQueue');
        localStorage.removeItem('ourDailyFriendTermPending');
        localStorage.removeItem(Utils.USER_FIRST_NAME_KEY || 'ourDailyUserFirstName');
        localStorage.removeItem(Utils.FIRST_NAME_SKIPPED_KEY || 'ourDailyFirstNameSkipped');
        localStorage.removeItem(Utils.QUILT_MOOD_PICK_KEY || 'ourDailyQuiltMoodPick');
        this.uiService?._clearQuiltMoodPickStorage?.();
      } catch (error) {
        this.logger?.warn?.('Could not clear first-time user state:', error);
      }
    }

    handleRunAsFirstTimeUser() {
      const ok = confirm(
        'Run the first-time sequence again? This clears only local onboarding/name state on this device. It will not reset the quilt.'
      );
      if (!ok) return;
      this.resetFirstTimeUserState();
      this.uiService.showToast('First-time sequence reset');
      setTimeout(() => {
        window.location.reload();
      }, 350);
    }

    _shouldFastPathReturningSameDayQuote() {
      try {
        if (typeof this.isIntroFlowEnabled === 'function' && this.isIntroFlowEnabled()) return false;
        const hasVisitedBefore = localStorage.getItem('ourDailyHasVisited');
        if (!hasVisitedBefore) return false;
        if (typeof Utils !== 'undefined' && typeof Utils.needsFirstNamePrompt === 'function' && Utils.needsFirstNamePrompt()) {
          return false;
        }
        const lastVisitDate = localStorage.getItem('ourDailyLastVisitDate');
        const currentDate = this.getDailyVisitDateKey();
        const isNewDay = lastVisitDate !== currentDate;
        return !isNewDay && this.hasCompletedDailyColorToday(currentDate);
      } catch (_) {
        return false;
      }
    }

    async autoTransitionFromPortal() {
      try {
        if (window.odqPerfMark) window.odqPerfMark('auto-transition-start');
        console.log('🔄 Starting auto-transition from portal...');
        
        const hasVisitedBefore = localStorage.getItem('ourDailyHasVisited');
        const lastVisitDate = localStorage.getItem('ourDailyLastVisitDate');

        const currentDate = this.getDailyVisitDateKey();
        const isNewDay = lastVisitDate !== currentDate;
        const hasSeenQuoteToday = this.hasSeenDailyQuoteToday(currentDate);
        const hasCompletedColorToday = this.hasCompletedDailyColorToday(currentDate);
        
        console.log('🔄 Visit check:', { hasVisitedBefore, lastVisitDate, currentDate, isNewDay, hasSeenQuoteToday, hasCompletedColorToday });
        
        if (!hasVisitedBefore) {
          console.log('🔄 First visit ever - showing first-name screen');
          localStorage.setItem('ourDailyHasVisited', 'true');
          localStorage.setItem('ourDailyLastVisitDate', currentDate);
          this.uiService.showScreen('screen-first-name');
        } else if (Utils.needsFirstNamePrompt()) {
          console.log('🔄 Visited before but no stored name — first-name screen');
          this.uiService.showScreen('screen-first-name');
        } else if (isNewDay) {
          console.log('🔄 Returning user on new day - showing quote screen');
          localStorage.setItem('ourDailyLastVisitDate', currentDate);
          this.uiService.showScreen('screen-quote');
        } else if (hasCompletedColorToday) {
          console.log('🔄 Returning user on same day after color - showing quilt screen directly');
          this.uiService.showScreen('screen-quilt');
        } else {
          console.log('🔄 Returning user on same day before color was completed - showing quote screen');
          this.uiService.showScreen('screen-quote');
        }
      } catch (error) {
        this.logger.error('❌ Auto transition failed:', error);
        this.uiService.showScreen('screen-quote');
      }
    }

    async resetQuiltForNewDay() {
      try {
        this.logger.log('🔄 Starting new day quilt reset...');
        
        // Get the current date key to verify which day we're resetting for
        const todayKey = Utils.getTodayKey();
        this.logger.log('🔄 Resetting quilt for date key:', todayKey);
        
        // Save empty quilt data to clear any existing data. The data layer refuses
        // this daily reset if today's server quilt already has user blocks.
        const didResetServer = await this.dataService.saveQuilt([], 1, [], { resetSource: 'daily' });
        if (!didResetServer) {
          this.logger.warn('⚠️ Daily reset skipped because server quilt is already active');
          await this.loadQuilt();
          this.renderQuilt();
          this.updateSquareCounter();
          return;
        }
        this.logger.log('🔄 Empty quilt data saved to clear previous day');

        // Only mutate the visible quilt after the guarded server reset succeeds.
        this.quiltEngine.initialize();
        this.dailyContributors = [];
        this._contributorNamesGlimmerActive = false;
        this.logger.log('🔄 Quilt engine reinitialized');
        try {
          this._maybeSnapPickerToDailyFirstPalette({ forceDaily: true });
        } catch (_) {
          /* */
        }

        // Clear any cached localStorage data to ensure fresh start
        try {
          localStorage.removeItem('ourDailyQuilt');
          localStorage.removeItem('quiltContributions');
          this.logger.log('🔄 Cleared localStorage cache');
        } catch (localError) {
          this.logger.warn('⚠️ Could not clear localStorage cache:', localError);
        }

        this._resetQuiltMoodForNewDay?.();
        
        // Re-render the quilt and update UI
        this.renderQuilt();
        this.updateSquareCounter();
        Utils.extinguishReflectionPatchStar();
        
        this.logger.log('✅ New day quilt reset completed successfully');
        
      } catch (error) {
        this.logger.error('❌ Failed to reset quilt for new day:', error);
        
        // Keep the current quilt visible; reload from the safest available source.
        try {
          await this.loadQuilt();
          this.renderQuilt();
          this.updateSquareCounter();
          this.logger.log('🔄 Reloaded quilt after failed reset');
        } catch (fallbackError) {
          this.logger.error('❌ Failed to reload quilt after reset error:', fallbackError);
        }
      }
    }

    async handleDailyAppDateChange({ source = 'resume' } = {}) {
      if (this._dailyDateChangeHandling) return true;
      const currentDate = this.getDailyVisitDateKey();
      const observedDate = this._lastObservedDailyDateKey;
      const loadedDate = String(this._loadedSharedQuiltDateKey || '').trim();
      let lastVisitDate = '';
      let hasVisitedBefore = '';
      try {
        lastVisitDate = localStorage.getItem('ourDailyLastVisitDate') || '';
        hasVisitedBefore = localStorage.getItem('ourDailyHasVisited') || '';
      } catch (_) {
        /* */
      }

      const isNewAppDay =
        (!!observedDate && observedDate !== currentDate) ||
        (!!loadedDate && loadedDate !== currentDate) ||
        (!!lastVisitDate && lastVisitDate !== currentDate);

      if (!isNewAppDay) {
        this._lastObservedDailyDateKey = currentDate;
        return false;
      }

      this._lastObservedDailyDateKey = currentDate;
      if (!hasVisitedBefore || Utils.needsFirstNamePrompt()) {
        return false;
      }

      this._dailyDateChangeHandling = true;
      try {
        this._invalidateLayoutBStoryPreviewForAppDayChange();
        this._resetQuiltMoodForNewDay?.();
        this.logger.log(`🔄 App-day changed (${source}); returning user to today's portal`);
        try {
          localStorage.setItem('ourDailyLastVisitDate', currentDate);
          localStorage.removeItem('ourDailyQuoteSeenDate');
          localStorage.removeItem('ourDailyColorCompletedDate');
        } catch (_) {
          /* */
        }

        this.clearPortalToQuoteIntroTimer();
        this.disableIntroFlow?.();
        if (this.uiService) this.uiService._flowTransitioning = false;
        this._portalToQuoteIntroScheduled = false;
        this._maybeSnapPickerToDailyFirstPalette({ forceDaily: true });
        Utils.refreshPortalDateText();

        this.uiService.showScreen('screen-portal');

        if (!this._isPersonalQuiltMode) {
          this._liveDailyDataConfirmed = false;
          const live = await this.syncLiveDailyData();
          if (!live.ok) {
            if (live.reason !== 'sync_in_flight' && live.transient !== true) {
              this._showConnectionProblemFailed(live.reason);
            }
            return true;
          }
          this.quoteService.displayQuote();
          this.populateQuiltQuote();
          this.updateSquareCounter();
          this._scheduleDeferredQuiltRenderForIdle();
        }
        Utils.syncReflectionPatchStarElement();

        if (!this._portalToQuoteIntroScheduled) {
          this._portalToQuoteIntroScheduled = true;
          this.schedulePortalToQuoteIntroFade(1300);
        }
        return true;
      } catch (error) {
        this.logger.warn('Daily app-date change handling failed:', error);
        return false;
      } finally {
        this._dailyDateChangeHandling = false;
      }
    }

    /**
     * Quilt hydration uses a one-shot Firestore getDoc (no snapshot listener). After a CI reset
     * (`resetBy: github-actions`) the community adds many splits while the app stays open or in
     * the background — the WebView keeps the early snapshot. Re-fetch when the app becomes visible.
     */
    setupQuiltResumeRefresh() {
      if (this._quiltResumeRefreshBound) return;
      this._quiltResumeRefreshBound = true;
      const schedule = () => {
        if (!this._portalQuiltLoaded) return;
        if (document.visibilityState !== 'visible') return;
        clearTimeout(this._resumeQuiltSyncTimer);
        this._resumeQuiltSyncTimer = setTimeout(async () => {
          if (document.visibilityState !== 'visible') return;
          const handledDayChange = await this.handleDailyAppDateChange({ source: 'resume' });
          if (handledDayChange) return;
          if (this._isPersonalQuiltMode) return;
          if (!window.db || !window.firestore) {
            return;
          }
          try {
            await this.syncLiveDailyDataOnResume();
          } catch (_) {
            return;
          }
        }, 450);
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') schedule();
      });
      window.addEventListener('focus', schedule);
      window.addEventListener('pageshow', (ev) => {
        if (ev.persisted) schedule();
      });
      try {
        const capacitorApp = window.Capacitor?.Plugins?.App;
        if (capacitorApp && typeof capacitorApp.addListener === 'function') {
          capacitorApp.addListener('appStateChange', (state) => {
            if (state?.isActive) schedule();
          });
        }
      } catch (_) {
        /* */
      }
    }

    setupDailyReset() {
      this.logger.log('🌙 Browser daily reset disabled; server / GitHub Actions owns destructive resets.');
      return;

      const scheduleDailyCycle = () => {
        const now = new Date();
        
        // Calculate next 6:30 AM UTC (archive)
        const nextArchive = new Date(now);
        nextArchive.setUTCHours(6, 30, 0, 0); // 6:30:00 AM UTC
        
        // If it's already past 6:30 AM UTC today, schedule for tomorrow
        if (now >= nextArchive) {
          nextArchive.setUTCDate(nextArchive.getUTCDate() + 1);
        }
        
        // Calculate next 7:00 AM UTC (reset)
        const nextReset = new Date(now);
        nextReset.setUTCHours(7, 0, 0, 0); // 7:00:00 AM UTC
        
        // If it's already past 7:00 AM UTC today, schedule for tomorrow
        if (now >= nextReset) {
          nextReset.setUTCDate(nextReset.getUTCDate() + 1);
        }
        
        const timeUntilArchive = nextArchive.getTime() - now.getTime();
        const timeUntilReset = nextReset.getTime() - now.getTime();
        
        this.logger.log(`📦 Next archive scheduled for: ${nextArchive.toISOString()} (6:30 AM UTC)`);
        this.logger.log(`🔄 Next reset scheduled for: ${nextReset.toISOString()} (7:00 AM UTC)`);
        
        // Schedule archive at 6:30 AM UTC
        if (timeUntilArchive > 0) {
          setTimeout(async () => {
            this.logger.log('📦 6:30 AM UTC reached - archiving current quilt');
            const archiveSuccess = await this.performDailyArchive();
            
            // Store archive status for reset check (using UTC date)
            const utcNow = new Date();
            const todayKey = utcNow.toISOString().split('T')[0];
            localStorage.setItem(`archiveStatus_${todayKey}`, archiveSuccess ? 'success' : 'failed');
          }, timeUntilArchive);
        }
        
        // Schedule reset at 7:00 AM UTC
        if (timeUntilReset > 0) {
          setTimeout(async () => {
            this.logger.log('🔄 7:00 AM UTC reached - checking archive status before reset');
            await this.performDailyReset();
            scheduleDailyCycle(); // Schedule next day's cycle
          }, timeUntilReset);
        }
      };
      
      // Schedule the first cycle
      scheduleDailyCycle();
    }

    getNextQuiltResetTime(from = new Date()) {
      const nextReset = new Date(from);
      nextReset.setUTCHours(7, 0, 0, 0);
      if (from >= nextReset) {
        nextReset.setUTCDate(nextReset.getUTCDate() + 1);
      }
      return nextReset;
    }

    formatQuiltResetCountdown(ms) {
      const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
      if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
      return `${seconds}s`;
    }

    updateQuiltResetCountdown() {
      const value = document.getElementById('quiltResetCountdownValue');
      const now = new Date();
      const nextReset = this.getNextQuiltResetTime(now);
      if (value) {
        value.textContent = this.formatQuiltResetCountdown(nextReset.getTime() - now.getTime());
      }
      this.updateBeforeYouGoClosingCountdown(nextReset, now);
    }

    /** Same reset instant as `quiltResetCountdownValue`; prose line for Before You Go card. */
    updateBeforeYouGoClosingCountdown(nextReset = null, now = null) {
      const el = document.getElementById('beforeYouGoClosing');
      if (!el) return;
      const n = now ?? new Date();
      const end = nextReset ?? this.getNextQuiltResetTime(n);
      const ms = end.getTime() - n.getTime();
      const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
      if (totalSeconds < 60) {
        el.textContent = "Today's quilt closes in less than a minute";
        return;
      }
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      let timePart;
      if (hours > 0) {
        const hu = hours === 1 ? 'hour' : 'hours';
        const mu = minutes === 1 ? 'minute' : 'minutes';
        timePart = `${hours} ${hu} and ${minutes} ${mu}`;
      } else {
        const mu = minutes === 1 ? 'minute' : 'minutes';
        timePart = `${minutes} ${mu}`;
      }
      el.textContent = `Today's quilt closes in ${timePart}`;
    }

    setupQuiltResetCountdown() {
      this.updateQuiltResetCountdown();
      if (this._quiltResetCountdownTimer) {
        clearInterval(this._quiltResetCountdownTimer);
      }
      this._quiltResetCountdownTimer = setInterval(() => this.updateQuiltResetCountdown(), 1000);
    }

    async performDailyArchive() {
      try {
        this.logger.log('📦 Performing daily archive...');
        
        // Create archive of current quilt
        if (this.quiltEngine.blocks.length > 1) { // Only archive if there are blocks beyond the initial one
          this.logger.log(`📦 Archiving quilt with ${this.quiltEngine.blocks.length} blocks...`);
          
          // SAFEGUARD 1: Backup current quilt data before archiving
          const utcNow = new Date();
          const backupDate = utcNow.toISOString().split('T')[0];
          const quiltBackup = {
            blocks: JSON.parse(JSON.stringify(this.quiltEngine.blocks)),
            submissionCount: this.quiltEngine.submissionCount,
            timestamp: new Date().toISOString()
          };
          localStorage.setItem('quiltBackup_' + backupDate, JSON.stringify(quiltBackup));
          this.logger.log('📦 Created quilt backup before archiving');
          
          // SAFEGUARD 2: Try archive with retry logic
          let archiveSuccess = false;
          let retryCount = 0;
          const maxRetries = 3;
          
          while (!archiveSuccess && retryCount < maxRetries) {
            try {
              await this.createArchiveSnapshot();
              archiveSuccess = true;
              this.logger.log(`📦 Archived current quilt successfully (attempt ${retryCount + 1})`);
            } catch (archiveError) {
              retryCount++;
              this.logger.error(`❌ Archive attempt ${retryCount} failed:`, archiveError);
              
              if (retryCount < maxRetries) {
                this.logger.log(`🔄 Retrying archive in 2 seconds... (${retryCount}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
          }
          
          if (!archiveSuccess) {
            // SAFEGUARD 3: If all retries fail, create a minimal archive entry
            this.logger.error('❌ All archive attempts failed - creating emergency backup');
            try {
              // Use UTC for emergency backup date
              const utcNow = new Date();
              const emergencyDate = utcNow.toISOString().split('T')[0];
              const emergencyEntry = {
                date: emergencyDate,
                blocks: this.quiltEngine.blocks,
                quote: this.quoteService.getQuoteForDate(emergencyDate),
                contributorCount: this.quiltEngine.submissionCount,
                thumbnail: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIiBmaWxsPSIjZmY2YjZiIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMjAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMDAwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiI+RW1lcmdlbmN5IEJhY2t1cDwvdGV4dD4KPC9zdmc+',
                isEmergencyBackup: true
              };
              
              // Store emergency backup in localStorage as fallback
              const emergencyKey = `emergencyArchive_${emergencyDate}`;
              localStorage.setItem(emergencyKey, JSON.stringify(emergencyEntry));
              this.logger.log('📦 Created emergency backup in localStorage');
              
              return false; // Archive failed but we have backup
            } catch (emergencyError) {
              this.logger.error('❌ Emergency backup also failed:', emergencyError);
              return false;
            }
          }
          
          // SAFEGUARD 4: Verify archive was actually created
          try {
            // Use UTC for verification
            const utcNow = new Date();
            const verifyDate = utcNow.toISOString().split('T')[0];
            const archives = await this.archiveService.getArchives(1);
            const todayArchive = archives.find(archive => archive.date === verifyDate);
            
            if (todayArchive) {
              this.logger.log('✅ Archive verification successful - archive found in database');
              return true;
            } else {
              this.logger.error('❌ Archive verification failed - archive not found in database');
              return false;
            }
          } catch (verifyError) {
            this.logger.error('❌ Archive verification error:', verifyError);
            return false;
          }
          
        } else {
          this.logger.log('📦 No quilt to archive (only initial block)');
          return true; // Consider this a success since there's nothing to archive
        }
        
      } catch (error) {
        this.logger.error('❌ Daily archive failed:', error);
        return false;
      }
    }

    async performDailyReset() {
      try {
        this.logger.log('🔄 Performing daily reset...');
        
        // Check if archive was successful before resetting (using UTC)
        const utcNow = new Date();
        const yesterday = new Date(utcNow);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yesterdayKey = yesterday.toISOString().split('T')[0];
        const archiveStatus = localStorage.getItem(`archiveStatus_${yesterdayKey}`);
        
        if (archiveStatus === 'failed') {
          this.logger.error('❌ Archive failed yesterday - skipping reset to preserve data');
          this.logger.error('❌ Manual intervention required to resolve archive issue');
          return false;
        }
        
        if (archiveStatus === 'success' || archiveStatus === null) {
          // Archive was successful or no archive was needed (first day)
          this.logger.log('✅ Archive check passed - proceeding with reset');
          
          // Reset the quilt
          await this.resetQuiltForNewDay();
          
          this.logger.log('✅ Daily reset completed successfully');
          return true;
        }
        
      } catch (error) {
        this.logger.error('❌ Daily reset failed:', error);
        return false;
      }
    }

    _scheduleResumeQuiltSyncRetry(delayMs = 8000) {
      clearTimeout(this._resumeQuiltSyncRetryTimer);
      this._resumeQuiltSyncRetryTimer = setTimeout(() => {
        this._resumeQuiltSyncRetryTimer = null;
        if (document.visibilityState !== 'visible') return;
        if (!this._hasCachedTodayQuilt()) return;
        void this.syncLiveDailyDataOnResume();
      }, delayMs);
    }

    /** Re-fetch today's quilt from the server (resume / reconnect). */
    async syncLiveDailyDataOnResume() {
      if (!this._liveDailyDataConfirmed) {
        return;
      }
      if (this._liveDailySyncInFlight) {
        return;
      }
      const beforeFp = Utils.computeQuiltFingerprint(this.quiltEngine?.blocks || []);
      const beforeQuote = this._snapshotTodayQuoteForUi();
      const hasCached = this._hasCachedTodayQuilt();
      const result = await this.syncLiveDailyData({ mode: 'resume' });
      if (!result.ok) {
        if (result.reason === 'sync_in_flight' || result.transient === true) return;
        if (hasCached) {
          this.logger.warn('Resume sync failed; keeping cached quilt:', result.reason);
          this._scheduleResumeQuiltSyncRetry();
          return;
        }
        this._liveDailyDataConfirmed = false;
        this._showConnectionProblemFailed(result.reason);
        return;
      }
      const afterFp = Utils.computeQuiltFingerprint(this.quiltEngine?.blocks || []);
      if (beforeFp !== afterFp) {
        this.logger.log('🔄 Quilt synced from Firestore after app became visible');
        this.renderQuilt();
      } else {
        this._refreshQuiltQuoteUiAfterPin(beforeQuote);
        this.ensureCurrentUserContributorListed?.();
        this.renderQuiltContributorList?.();
      }
      this.updateSquareCounter();
    }

    async loadQuilt() {
      if (!this._liveDailyDataConfirmed) {
        return;
      }
      this._preparePortalJoinLineForLoad();
      try {
        const quiltResult = await this.dataService.loadQuiltFromServer(Utils.getTodayKey());
        if (!quiltResult.ok) {
          this._liveDailyDataConfirmed = false;
          this._showConnectionProblemFailed(quiltResult.reason || 'quilt');
          return;
        }
        await this.applyQuiltDataFromPayload(quiltResult.data);
      } catch (error) {
        this.logger.error('❌ Failed to load quilt:', error);
        this._liveDailyDataConfirmed = false;
        this._showConnectionProblemFailed('quilt_server_read_failed');
      }
    }

    normalizeDailyContributors(items) {
      const normalized = [];
      const byUserId = new Map();
      (Array.isArray(items) ? items : []).forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const userId = String(item.userId || '').trim();
        const rawName = String(item.name || '').replace(/\s+/g, ' ').trim();
        const name = rawName || 'Friend';
        const firstContributedAt = String(item.firstContributedAt || item.timestamp || new Date().toISOString());
        const entry = {
          userId,
          name: name.slice(0, 40),
          firstContributedAt
        };
        if (userId) {
          const existingIndex = byUserId.get(userId);
          if (typeof existingIndex === 'number') {
            const existing = normalized[existingIndex];
            if (existing.name === 'Friend' && entry.name !== 'Friend') {
              existing.name = entry.name;
            }
            return;
          }
          byUserId.set(userId, normalized.length);
        }
        normalized.push(entry);
      });
      normalized.sort((a, b) => {
        const ta = Date.parse(String(a.firstContributedAt || '')) || 0;
        const tb = Date.parse(String(b.firstContributedAt || '')) || 0;
        if (tb !== ta) return tb - ta;
        return String(b.userId || '').localeCompare(String(a.userId || ''));
      });
      return normalized;
    }

    /** One cloud tag per display name (case-insensitive), even across different userIds. */
    dedupeContributorsByDisplayName(contributors, currentUserId = '') {
      const uid = String(currentUserId || '').trim();
      const pickPreferred = (a, b) => {
        if (uid) {
          const aCurrent = String(a.userId || '').trim() === uid;
          const bCurrent = String(b.userId || '').trim() === uid;
          if (aCurrent && !bCurrent) return a;
          if (bCurrent && !aCurrent) return b;
        }
        const ta = Date.parse(String(a.firstContributedAt || '')) || 0;
        const tb = Date.parse(String(b.firstContributedAt || '')) || 0;
        return ta <= tb ? a : b;
      };
      const byNameKey = new Map();
      const order = [];
      (Array.isArray(contributors) ? contributors : []).forEach((entry) => {
        const name = entry?.name || 'Friend';
        const key = String(name).trim().toLocaleLowerCase('en-US') || 'friend';
        const existing = byNameKey.get(key);
        if (!existing) {
          byNameKey.set(key, entry);
          order.push(key);
          return;
        }
        byNameKey.set(key, pickPreferred(existing, entry));
      });
      return order.map((key) => byNameKey.get(key));
    }

    getCurrentContributorDisplayName() {
      const stored = String(Utils.getUserFirstName?.() || '').trim();
      const raw = stored || String(Utils.getPortalGreetingName?.() || '').trim() || 'Friend';
      if (!raw || raw.toLowerCase() === 'friend') return 'Friend';
      return Utils.normalizeStoredFirstName(raw) || 'Friend';
    }

    recordDailyContributorForCurrentUser() {
      const userId = this.currentUserId || Utils.getOrCreateUserId();
      const name = this.getCurrentContributorDisplayName();
      const next = this.normalizeDailyContributors(this.dailyContributors);
      const existing = next.find((entry) => entry.userId && entry.userId === userId);
      if (existing) {
        if (existing.name === 'Friend' && name !== 'Friend') existing.name = name;
      } else {
        next.push({
          userId,
          name,
          firstContributedAt: new Date().toISOString()
        });
      }
      this.dailyContributors = next;
      this.renderQuiltContributorList();
    }

    /** If today's quilt already includes this user, keep them in the name cloud after server reloads. */
    ensureCurrentUserContributorListed() {
      if (this._isPersonalQuiltMode) return;
      const userId = String(this.currentUserId || Utils.getOrCreateUserId() || '').trim();
      if (!userId) return;
      const blocks = Array.isArray(this.quiltEngine?.blocks) ? this.quiltEngine.blocks : [];
      const hasUserBlock = blocks.some((block) => {
        const ids = [block?.contributorId, ...(Array.isArray(block?.contributorIds) ? block.contributorIds : [])]
          .map((id) => String(id || '').trim())
          .filter(Boolean);
        return ids.includes(userId);
      });
      if (!hasUserBlock) return;
      const name = this.getCurrentContributorDisplayName();
      const next = this.normalizeDailyContributors(this.dailyContributors);
      const existing = next.find((entry) => entry.userId && entry.userId === userId);
      if (existing) {
        if (existing.name === 'Friend' && name !== 'Friend') existing.name = name;
      } else {
        next.push({
          userId,
          name,
          firstContributedAt: new Date().toISOString()
        });
      }
      this.dailyContributors = next;
    }

    getAdminSampleContributorName(index = 0) {
      const names = [
        'Ada', 'Amina', 'Birdie', 'Camille', 'Cleo', 'Dara', 'Elio', 'Ezra',
        'Fern', 'Gus', 'Hana', 'Iris', 'June', 'Kai', 'Lena', 'Mara',
        'Milo', 'Nia', 'Noah', 'Owen', 'Paz', 'Quinn', 'Rafa', 'Sage',
        'Theo', 'Uma', 'Vera', 'Wren', 'Yara', 'Zoe'
      ];
      const displayOrder = [
        10, 2, 23, 5, 17, 8, 25, 1, 20, 14,
        27, 4, 12, 19, 6, 28, 9, 22, 15, 0,
        24, 7, 21, 13, 29, 3, 18, 11, 26, 16
      ];
      return names[displayOrder[Math.abs(index) % displayOrder.length]];
    }

    recordAdminGeneratedContributor(count = 1) {
      const next = this.normalizeDailyContributors(this.dailyContributors);
      const base = next.filter((entry) => String(entry.userId || '').startsWith('admin-sample-')).length;
      const normalizedCount = Math.max(1, Number(count) || 1);
      for (let i = 0; i < normalizedCount; i++) {
        const seq = base + i;
        next.push({
          userId: `admin-sample-${Date.now()}-${seq}`,
          name: this.getAdminSampleContributorName(seq),
          firstContributedAt: new Date().toISOString()
        });
      }
      this.dailyContributors = this.normalizeDailyContributors(next);
      this.renderQuiltContributorList();
    }

    getOrderedDisplayContributors() {
      const contributors = this.normalizeDailyContributors(this.dailyContributors);
      const currentUserId = String(this.currentUserId || '').trim();
      const displayContributors = this.dedupeContributorsByDisplayName(contributors, currentUserId);
      const hashString = (s) => {
        const str = String(s || '');
        let h = 5381;
        for (let i = 0; i < str.length; i++) {
          h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
      };
      return displayContributors
        .map((entry, idx) => {
          const nm = entry.name || 'Friend';
          return { entry, idx, rank: hashString(nm) };
        })
        .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
        .map(({ entry }) => entry);
    }

    getQuiltAverageLuminance(blocks = this.quiltEngine?.blocks) {
      const luminanceForHex = (hex) => {
        const normalized = String(hex || '').trim();
        if (!Utils.validateHexColor(normalized)) return null;
        const r = parseInt(normalized.slice(1, 3), 16);
        const g = parseInt(normalized.slice(3, 5), 16);
        const b = parseInt(normalized.slice(5, 7), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      };
      const colorsForBlock = (block) => {
        const colors = [];
        const seen = new Set();
        const addColor = (color) => {
          const normalized = String(color || '').trim();
          if (!Utils.validateHexColor(normalized)) return;
          const key = normalized.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          colors.push(normalized);
        };
        addColor(block?.color);
        addColor(block?.hstColorB);
        addColor(block?.insetInnerColor);
        addColor(block?.specialOriginalInnerColor);
        addColor(block?.diagonalAxisAccentColor);
        if (Array.isArray(block?.hstTriangles)) {
          block.hstTriangles.forEach((piece) => addColor(piece?.color));
        }
        if (Array.isArray(block?.polygonPieces)) {
          block.polygonPieces.forEach((piece) => addColor(piece?.color));
        }
        return colors;
      };

      let weightedLuminance = 0;
      let totalArea = 0;
      (Array.isArray(blocks) ? blocks : []).forEach((block) => {
        if (!block || typeof block !== 'object') return;
        const area = Math.max(0, Number(block.width) || 0) * Math.max(0, Number(block.height) || 0);
        if (!Number.isFinite(area) || area <= 0) return;
        const colors = colorsForBlock(block);
        if (!colors.length) return;
        const blockLuminance = colors.reduce((sum, color) => sum + luminanceForHex(color), 0) / colors.length;
        weightedLuminance += blockLuminance * area;
        totalArea += area;
      });
      return totalArea > 0 ? weightedLuminance / totalArea : 1;
    }

    getContributorNameContrastPalette() {
      const averageLuminance = this.getQuiltAverageLuminance();
      const quiltIsPrimarilyDark = averageLuminance < 0.5;
      return quiltIsPrimarilyDark
        ? {
            tone: 'dark',
            color: 'rgba(246, 244, 241, 0.84)',
            currentColor: 'rgba(255, 255, 255, 0.96)'
          }
        : {
            tone: 'light',
            color: 'rgba(0, 0, 0, 0.68)',
            currentColor: 'rgba(0, 0, 0, 0.86)'
          };
    }

    applyContributorNameContrast() {
      const palette = this.getContributorNameContrastPalette();
      const stage = document.getElementById('quiltContributors');
      if (stage) {
        stage.style.setProperty('--contributor-name-color', palette.color);
        stage.style.setProperty('--contributor-name-current-color', palette.currentColor);
        stage.dataset.quiltTone = palette.tone;
      }
    }

    static get CONTRIBUTOR_NAME_GLIMMER_EFFECT_ID() {
      return CONTRIBUTOR_NAME_GLIMMER_EFFECT_ID;
    }

    getContributorNameGlimmerEffectId() {
      return CONTRIBUTOR_NAME_GLIMMER_EFFECT_ID;
    }

    syncContributorNameGlimmerEffectMarkup() {
      const stage = document.getElementById('quiltContributors');
      const list = document.getElementById('quiltContributorList');
      const effectId = this.getContributorNameGlimmerEffectId();
      const active = !!this._contributorNamesGlimmerActive;
      [stage, list].forEach((el) => {
        if (!el) return;
        if (active) {
          el.dataset.glimmerEffect = effectId;
        } else {
          delete el.dataset.glimmerEffect;
        }
      });
    }

    renderContributorCloud(listEl, entries, variant, currentUserId) {
      if (!listEl) return;
      const sizeBuckets = [0.9, 1.0, 1.1, 1.22];
      const maxSize = sizeBuckets[sizeBuckets.length - 1];
      const uid = String(currentUserId || '').trim();
      const hashString = (s) => {
        const str = String(s || '');
        let h = 5381;
        for (let i = 0; i < str.length; i++) {
          h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
      };
      const glimmerActive = !!this._contributorNamesGlimmerActive;
      listEl.classList.toggle('quilt-contributor-list--glimmer', glimmerActive);
      if (glimmerActive) {
        listEl.dataset.glimmerEffect = this.getContributorNameGlimmerEffectId();
      } else {
        delete listEl.dataset.glimmerEffect;
      }
      listEl.innerHTML = '';
      (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
        const item = document.createElement('span');
        item.className = 'quilt-contributor-name';
        const entryUserId = String(entry.userId || '').trim();
        const name = entry.name || 'Friend';
        const isCurrent = !!(uid && entryUserId && entryUserId === uid);
        const styleHash = hashString(`${name}|${variant}`);
        const sizeIdx = styleHash % sizeBuckets.length;
        const tilt = (styleHash % 13) - 6;
        const nudgeX = ((styleHash % 9) - 4) * 0.35;
        const nudgeY = ((Math.floor(styleHash / 3) % 7) - 3) * 0.28;
        item.style.setProperty('--cloud-size', isCurrent ? maxSize : sizeBuckets[sizeIdx]);
        item.style.setProperty('--cloud-rot', `${tilt}deg`);
        item.style.setProperty('--tag-nudge-x', `${nudgeX}px`);
        item.style.setProperty('--tag-nudge-y', `${nudgeY}px`);
        if (glimmerActive) {
          item.style.setProperty('--glimmer-index', String(index));
        } else {
          item.style.removeProperty('--glimmer-index');
        }
        if (isCurrent) {
          item.classList.add('quilt-contributor-name--current');
        }
        item.setAttribute('role', 'listitem');
        item.textContent = name;
        listEl.appendChild(item);
      });
    }

    renderQuiltContributorList() {
      const wrap = document.getElementById('quiltContributors');
      const list = document.getElementById('quiltContributorList');
      if (!list) return;

      const currentUserId = String(this.currentUserId || '').trim();
      const ordered = this.getOrderedDisplayContributors();
      this.applyContributorNameContrast();
      list.classList.toggle(
        'quilt-contributor-list--glimmer',
        !!this._contributorNamesGlimmerActive
      );
      try {
        this.syncContributorNameGlimmerEffectMarkup();
      } catch (error) {
        this.logger?.warn?.('Contributor glimmer markup sync failed:', error);
      }
      this.renderContributorCloud(list, ordered, 'cloud', currentUserId);

      const show = ordered.length > 0;
      if (wrap) {
        wrap.hidden = !show;
        wrap.setAttribute('aria-hidden', show ? 'false' : 'true');
      }
    }

    prepareSettingsScreen({ renderPreview = true } = {}) {
      const input = document.getElementById('settingsNameInput');
      if (input) {
        const current = Utils.getUserFirstName() || Utils.getPortalGreetingName() || '';
        input.value = current && current.toLowerCase() !== 'friend' ? current : '';
      }
      if (renderPreview) this.renderSettingsPersonalQuiltPreview();
      try {
        this.renderColorCalendar();
      } catch (error) {
        this.logger?.warn?.('Color calendar render failed:', error);
      }
      this.refreshRememberTodayArchiveSettingsLink();
      this.hydrateSettingsDailyQuoteReminder();
      this._syncSettingsScrollFooter();
    }

    scheduleSettingsPersonalQuiltPreview(delayMs = 650) {
      try {
        this.renderColorCalendar();
      } catch (error) {
        this.logger?.warn?.('Color calendar render failed:', error);
      }
      if (!this.isPersonalQuiltEnabled()) {
        this.renderSettingsPersonalQuiltPreview();
        return;
      }
      if (this._settingsPersonalQuiltPreviewTimer) {
        clearTimeout(this._settingsPersonalQuiltPreviewTimer);
        this._settingsPersonalQuiltPreviewTimer = null;
      }
      const renderIfStillOpen = () => {
        this._settingsPersonalQuiltPreviewTimer = null;
        const settingsScreen = document.getElementById('screen-settings');
        if (!settingsScreen?.classList.contains('active')) return;
        try {
          this.renderSettingsPersonalQuiltPreview();
        } catch (error) {
          this.logger?.warn?.('Settings preview failed:', error);
        }
      };
      this._settingsPersonalQuiltPreviewTimer = setTimeout(() => {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(renderIfStillOpen, { timeout: 1200 });
        } else {
          renderIfStillOpen();
        }
      }, Math.max(0, Number(delayMs) || 0));
    }

    async updateCurrentContributorName(name) {
      const userId = this.currentUserId || Utils.getOrCreateUserId();
      const next = this.normalizeDailyContributors(this.dailyContributors);
      const existing = next.find((entry) => entry.userId && entry.userId === userId);
      if (!existing) return false;
      existing.name = name || 'Friend';
      this.dailyContributors = next;
      this.renderQuiltContributorList();
      return true;
    }

    async handleSettingsNameSave() {
      const input = document.getElementById('settingsNameInput');
      const raw = input ? input.value : '';
      const previousName = Utils.getUserFirstName();
      const normalized = Utils.normalizeStoredFirstName(raw) || 'Friend';
      Utils.setUserFirstName(normalized);
      Utils.clearPendingFriendTerm?.();
      Utils.refreshPortalGreeting();

      const updatedContributor = await this.updateCurrentContributorName(normalized);
      if (updatedContributor) {
        await this.saveQuilt();
      }

      if (
        previousName !== normalized &&
        typeof window.odqTrack === 'function'
      ) {
        window.odqTrack('update_name', {
          had_name_before: !!(previousName && String(previousName).trim().toLowerCase() !== 'friend')
        });
      }
      this.uiService.showToast('Name updated');
      this.uiService.showScreen('screen-quilt');
    }

    handleResetColorHistory() {
      const confirmed = window.confirm(
        'Reset the color history saved on this device? This will only clear the Settings preview. It will not remove your colors from today’s shared quilt.'
      );
      if (!confirmed) return;
      try {
        localStorage.removeItem('quiltContributionsLifetime');
        localStorage.removeItem(this.getPersonalQuiltCacheKey());
      } catch (_) {
        /* */
      }
      this._isPersonalQuiltMode = false;
      this._personalQuiltState = null;
      this._personalQuiltPreviewCache = null;
      this.renderSettingsPersonalQuiltPreview();
      try {
        this.renderColorCalendar();
      } catch (error) {
        this.logger?.warn?.('Color calendar render failed:', error);
      }
      this.uiService.showToast('Color history reset on this device');
    }

    createSimplePersonalQuiltPngBlob(blocks) {
      return new Promise((resolve, reject) => {
        try {
          const sourceBlocks = Array.isArray(blocks) ? blocks : [];
          if (!sourceBlocks.length) {
            reject(new Error('No personal quilt blocks to export'));
            return;
          }

          const minX = Math.min(...sourceBlocks.map((b) => Number(b.x) || 0));
          const minY = Math.min(...sourceBlocks.map((b) => Number(b.y) || 0));
          const maxX = Math.max(...sourceBlocks.map((b) => (Number(b.x) || 0) + Math.max(0, Number(b.width) || 0)));
          const maxY = Math.max(...sourceBlocks.map((b) => (Number(b.y) || 0) + Math.max(0, Number(b.height) || 0)));
          const quiltW = Math.max(1, maxX - minX);
          const quiltH = Math.max(1, maxY - minY);
          const maxEdge = 2400;
          const aspect = quiltW / quiltH;
          const outW = aspect >= 1 ? maxEdge : Math.round(maxEdge * aspect);
          const outH = aspect >= 1 ? Math.round(maxEdge / aspect) : maxEdge;
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not create canvas context'));
            return;
          }

          canvas.width = Math.max(1, outW);
          canvas.height = Math.max(1, outH);
          ctx.fillStyle = '#f6f4f1';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const scale = Math.min(canvas.width / quiltW, canvas.height / quiltH);
          const offsetX = (canvas.width - quiltW * scale) / 2;
          const offsetY = (canvas.height - quiltH * scale) / 2;

          sourceBlocks.forEach((block) => {
            const x = offsetX + ((Number(block.x) || 0) - minX) * scale;
            const y = offsetY + ((Number(block.y) || 0) - minY) * scale;
            const w = Math.max(0.5, (Number(block.width) || 0) * scale);
            const h = Math.max(0.5, (Number(block.height) || 0) * scale);
            const color = Utils.validateHexColor(block.color) ? block.color : '#d8d4cf';
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
          });

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Could not create personal quilt PNG'));
              return;
            }
            resolve(blob);
          }, 'image/png', 0.95);
        } catch (error) {
          reject(error);
        }
      });
    }

    createSettingsPersonalQuiltPngBlobFromSvg(svg) {
      return new Promise((resolve, reject) => {
        try {
          if (!svg) {
            reject(new Error('No personal quilt SVG to export'));
            return;
          }

          const svgClone = svg.cloneNode(true);
          svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          svgClone.querySelectorAll('.new-block').forEach((node) => {
            node.classList.remove('new-block');
            node.removeAttribute('opacity');
            node.style.animation = 'none';
          });

          const viewBox = (svg.getAttribute('viewBox') || '').trim();
          const parts = viewBox.split(/\s+/).map(Number);
          const sourceWidth = parts.length === 4 && parts.every(Number.isFinite) ? Math.max(1, parts[2]) : 1070;
          const sourceHeight = parts.length === 4 && parts.every(Number.isFinite) ? Math.max(1, parts[3]) : 1340;
          const maxEdge = 2400;
          const aspect = sourceWidth / sourceHeight;
          const outW = aspect >= 1 ? maxEdge : Math.round(maxEdge * aspect);
          const outH = aspect >= 1 ? Math.round(maxEdge / aspect) : maxEdge;
          svgClone.setAttribute('width', String(outW));
          svgClone.setAttribute('height', String(outH));
          svgClone.setAttribute('preserveAspectRatio', 'xMidYMid meet');

          const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
          style.textContent = `
            .quilt-parallax-block {
              filter:
                drop-shadow(0.8px 1.05px 0.55px rgba(45, 36, 29, 0.15))
                drop-shadow(-0.3px -0.3px 0 rgba(255, 255, 255, 0.11));
            }
          `;
          svgClone.insertBefore(style, svgClone.firstChild);

          const svgData = new XMLSerializer().serializeToString(svgClone);
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                reject(new Error('Could not create canvas context'));
                return;
              }
              canvas.width = outW;
              canvas.height = outH;
              ctx.fillStyle = '#f6f4f1';
              ctx.fillRect(0, 0, outW, outH);
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, outW, outH);
              canvas.toBlob((blob) => {
                if (!blob) {
                  reject(new Error('Could not create personal quilt PNG'));
                  return;
                }
                resolve(blob);
              }, 'image/png', 0.95);
            } catch (drawError) {
              reject(drawError);
            }
          };
          img.onerror = () => reject(new Error('Could not render personal quilt SVG'));
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;
        } catch (error) {
          reject(error);
        }
      });
    }

    async handleDownloadPersonalQuilt() {
      if (!this.isPersonalQuiltEnabled()) {
        this.uiService.showToast('Personal quilt coming soon.');
        return;
      }
      const personal = this.buildPersonalQuiltStateFromDeviceHistory();
      if (!personal || !Array.isArray(personal.blocks) || !personal.blocks.length) {
        this.uiService.showToast('Add a color first to download your quilt');
        return;
      }

      try {
        const svg = document.getElementById('settingsPersonalQuiltSvg');
        const blob = await this.createSettingsPersonalQuiltPngBlobFromSvg(svg);
        const filename = `our-daily-personal-quilt-${Utils.getTodayKey()}.png`;
        const imageFile =
          typeof File !== 'undefined'
            ? new File([blob], filename, { type: 'image/png' })
            : null;
        const shareData = imageFile
          ? {
              title: 'My OUR DAILY QUILT',
              text: 'My personal quilt',
              files: [imageFile]
            }
          : null;
        const canShareFile =
          shareData &&
          typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare(shareData);
        if (canShareFile) {
          this.uiService.showToast('Choose “Save Image” to add it to Photos');
          await navigator.share(shareData);
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.uiService.showToast('Personal quilt saved to Downloads');
      } catch (error) {
        this.logger.warn('Personal quilt download failed:', error);
        this.uiService.showToast('Could not download your quilt. Please try again.');
      }
    }

    async saveQuilt(saveOptions = null) {
      try {
        const options = saveOptions && typeof saveOptions === 'object' ? saveOptions : {};
        const resetSource = options.resetSource;
        const isIntentionalReset = resetSource === 'admin' || resetSource === 'daily';
        if (this.isAdminTomorrowPreviewActive() && !isIntentionalReset) {
          this.uiService.showToast('Exit preview to save.');
          return false;
        }
        const todayKey = Utils.getTodayKey();
        if (
          !isIntentionalReset &&
          !this._isPersonalQuiltMode &&
          this._loadedSharedQuiltDateKey &&
          this._loadedSharedQuiltDateKey !== todayKey
        ) {
          this.logger.warn(
            `⚠️ Refusing stale quilt save: loaded ${this._loadedSharedQuiltDateKey}, current app day is ${todayKey}. Reloading current quilt instead.`
          );
          await this.loadQuilt();
          this.renderQuilt();
          this.updateSquareCounter();
          return false;
        }

        const blocks = this.quiltEngine.blocks.map((block) => this.quiltEngine._serializeBlockForReplay(block));
        const persistOpts =
          saveOptions && typeof saveOptions === 'object' && !Array.isArray(saveOptions)
            ? { ...saveOptions }
            : {};
        persistOpts.macroStructureFrozen = this.quiltEngine.macroStructureFrozen === true;

        return await this.dataService.saveQuilt(
          blocks,
          this.quiltEngine.submissionCount,
          this.quiltEngine.getColorReplayEvents(),
          this.dailyContributors,
          persistOpts
        );
      } catch (error) {
        this.errorHandler.handleError(error, 'saveQuilt');
        throw error;
      }
    }

    setAdminQuiltActionButtonsDisabled(disabled) {
      const buttons = document.querySelectorAll('.admin-menu [data-admin-quilt-action="true"]');
      buttons.forEach((button) => {
        if (button.id === 'admin-quilt-undo-btn') return;
        button.disabled = disabled;
        button.style.opacity = disabled ? '0.55' : '1';
        button.style.cursor = disabled ? 'wait' : 'pointer';
      });
      if (!disabled) this._updateAdminUndoButtonState();
    }

    _pushAdminQuiltUndoSnapshot(label) {
      if (!this.quiltEngine?.blocks?.length) return;
      if (!Array.isArray(this._adminQuiltUndoStack)) this._adminQuiltUndoStack = [];
      this._adminQuiltUndoStack.push({
        label: String(label || 'change'),
        blocks: JSON.parse(JSON.stringify(this.quiltEngine.blocks)),
        submissionCount: this.quiltEngine.submissionCount
      });
      if (this._adminQuiltUndoStack.length > 20) {
        this._adminQuiltUndoStack.shift();
      }
      this._updateAdminUndoButtonState();
    }

    _updateAdminUndoButtonState() {
      const btn = document.getElementById('admin-quilt-undo-btn');
      if (!btn) return;
      const last = this._adminQuiltUndoStack?.[this._adminQuiltUndoStack.length - 1];
      const hasUndo = !!last;
      btn.disabled = !hasUndo;
      btn.style.opacity = hasUndo ? '1' : '0.55';
      btn.style.cursor = hasUndo ? 'pointer' : 'not-allowed';
      btn.textContent = hasUndo ? `Undo: ${last.label}` : 'Undo last change';
    }

    runAdminQuiltMutation(label, action, options = {}) {
      const ADMIN_ACTION_TIMEOUT_MS = 45000;
      const skipUndoSnapshot = !!options.skipUndoSnapshot;
      const run = this.adminQuiltMutationQueue
        .catch(() => {})
        .then(async () => {
          if (!skipUndoSnapshot) this._pushAdminQuiltUndoSnapshot(label);
          this.setAdminQuiltActionButtonsDisabled(true);
          try {
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(
                () => reject(new Error(`${label} timed out after ${ADMIN_ACTION_TIMEOUT_MS}ms`)),
                ADMIN_ACTION_TIMEOUT_MS
              );
            });
            return await Promise.race([action(), timeoutPromise]);
          } catch (e) {
            this.uiService.showToast(
              `${label} stalled or failed — buttons unlocked; check network or try again.`
            );
            throw e;
          } finally {
            this.setAdminQuiltActionButtonsDisabled(false);
          }
        });
      this.adminQuiltMutationQueue = run.catch((error) => {
        this.logger.warn(`Admin quilt action failed: ${label}`, error);
      });
      return run;
    }

    async saveAdminQuiltMutation(label) {
      if (this.isAdminTomorrowPreviewActive()) {
        return true;
      }
      const saved = await this.saveQuilt({ adminMutation: true });
      if (!saved) {
        this.uiService.showToast(`${label} was not saved. Reloading latest quilt.`);
        await this.loadQuilt();
        this.updateAdminStats();
        throw new Error(`${label} failed to save`);
      }
      return true;
    }

    async refreshSharedQuiltBeforeContribution() {
      if (!window.db || !window.firestore) return false;
      const beforeFingerprint = Utils.computeQuiltFingerprint(this.quiltEngine?.blocks || []);
      await this.loadQuilt();
      const afterFingerprint = Utils.computeQuiltFingerprint(this.quiltEngine?.blocks || []);
      if (beforeFingerprint && afterFingerprint && beforeFingerprint !== afterFingerprint) {
        this.logger.log('🔄 Refreshed shared quilt before adding color');
        return true;
      }
      return false;
    }

    normalizeHexColor(hex) {
      const raw = String(hex || '').trim();
      const match = /^#?([0-9a-f]{6})$/i.exec(raw);
      return match ? `#${match[1].toUpperCase()}` : '';
    }

    getQuiltBlockColorFamily(block) {
      const color = this.normalizeHexColor(block?.color);
      if (!color) return '';
      return String(
        block?.colorFamily ||
        (typeof ColorUtilsV2 !== 'undefined' && ColorUtilsV2.getColorFamilyName
          ? ColorUtilsV2.getColorFamilyName(color)
          : this.getFriendlyColorName(color)) ||
        ''
      ).trim().toLowerCase();
    }

    getQuiltColorFamilySubmissionBreakdown(blocks = this.quiltEngine?.blocks || []) {
      const submissions = new Map();
      (Array.isArray(blocks) ? blocks : []).forEach((block, index) => {
        const color = this.normalizeHexColor(block?.color);
        if (!color) return;
        const family = this.getQuiltBlockColorFamily(block);
        if (!family || family === 'unknown') return;
        const submissionIndex = Number.isFinite(Number(block.submissionIndex))
          ? Number(block.submissionIndex)
          : -Infinity;
        const submissionKey =
          Number.isFinite(submissionIndex) && submissionIndex > 0
            ? `submission:${submissionIndex}`
            : `legacy:${block?.contributorId || block?.id || index}`;
        const area = Math.max(0, Number(block.width) || 0) * Math.max(0, Number(block.height) || 0);
        const existingSubmission = submissions.get(submissionKey);
        if (!existingSubmission) {
          submissions.set(submissionKey, {
            family,
            color,
            area,
            submissionIndex,
            latestBlockIndex: index
          });
          return;
        }
        existingSubmission.area += area;
        if (
          submissionIndex > existingSubmission.submissionIndex ||
          (submissionIndex === existingSubmission.submissionIndex && index > existingSubmission.latestBlockIndex)
        ) {
          existingSubmission.family = family;
          existingSubmission.color = color;
          existingSubmission.submissionIndex = submissionIndex;
          existingSubmission.latestBlockIndex = index;
        }
      });

      const counts = new Map();
      submissions.forEach((submission) => {
        const existing = counts.get(submission.family) || {
          family: submission.family,
          color: submission.color,
          count: 0,
          area: 0,
          latestSubmissionIndex: -Infinity,
          latestBlockIndex: -1
        };
        existing.count += 1;
        existing.area += submission.area;
        if (
          submission.submissionIndex > existing.latestSubmissionIndex ||
          (submission.submissionIndex === existing.latestSubmissionIndex && submission.latestBlockIndex > existing.latestBlockIndex)
        ) {
          existing.color = submission.color;
        }
        existing.latestSubmissionIndex = Math.max(existing.latestSubmissionIndex, submission.submissionIndex);
        existing.latestBlockIndex = Math.max(existing.latestBlockIndex, submission.latestBlockIndex);
        counts.set(submission.family, existing);
      });

      const total = submissions.size;
      return Array.from(counts.values())
        .sort((a, b) =>
          b.count - a.count ||
          b.latestSubmissionIndex - a.latestSubmissionIndex ||
          b.area - a.area ||
          b.latestBlockIndex - a.latestBlockIndex
        )
        .map((item) => ({
          ...item,
          percent: total > 0 ? (item.count / total) * 100 : 0
        }));
    }

    getQuiltPaletteSummary(blocks = this.quiltEngine?.blocks || []) {
      const paletteItems = this.getQuiltColorFamilySubmissionBreakdown(blocks);
      const total = paletteItems.reduce((sum, item) => sum + item.count, 0);
      if (total < 15) return null;

      const ranked = paletteItems;
      const top = ranked[0] || null;
      if (!top) return null;

      const second = ranked[1] || null;
      const topShare = total > 0 ? top.count / total : 0;
      const secondShare = total > 0 && second ? second.count / total : 0;
      const topLead = topShare - secondShare;
      const hasClearWinner = topShare >= 0.35 && topLead >= 0.10;
      const hasTwoDominantColors =
        !!second &&
        (top.count + second.count) / total >= 0.50 &&
        topShare < 0.35 &&
        secondShare < 0.35;
      const topFour = ranked.slice(0, 4);
      const topFourWithinTen =
        topFour.length === 4 &&
        total > 0 &&
        (topFour[0].count - topFour[3].count) / total <= 0.10;

      if (hasClearWinner) {
        return { mode: 'single', total, colors: [top], palette: ranked };
      }

      if (hasTwoDominantColors) {
        return { mode: 'split', total, colors: [top, second], palette: ranked };
      }

      if (top.percent < 25 || topFourWithinTen) {
        return { mode: 'mosaic', total, colors: ranked.slice(0, 5), palette: ranked };
      }

      return { mode: 'mosaic', total, colors: ranked.slice(0, 5), palette: ranked };
    }

    getMostPopularQuiltColor(blocks = this.quiltEngine?.blocks || []) {
      return this.getQuiltPaletteSummary(blocks)?.colors?.[0] || null;
    }

    /** Bright, saturated hex from today's quilt blocks for keyword highlighter bands. */
    getBrightQuiltMarkerColor(blocks = this.quiltEngine?.blocks || []) {
      const isHex = (color) => /^#?[0-9a-f]{6}$/i.test(String(color || '').trim());
      const normalize = (color) => {
        const value = String(color || '').trim().toLowerCase();
        if (!isHex(value)) return '';
        return value.startsWith('#') ? value : `#${value}`;
      };
      const candidates = [];
      const addCandidate = (color, weight = 1) => {
        const hex = normalize(color);
        if (!hex) return;
        const hsv = Utils.hexToHsv(hex);
        if (hsv.s < 22 || hsv.v < 42) return;
        const score = (hsv.v * 0.62 + hsv.s * 0.38) * weight;
        candidates.push({ hex, score });
      };
      (this.getQuiltPaletteSummary(blocks)?.palette || []).forEach((item, index) => {
        addCandidate(item?.color, index === 0 ? 1.08 : 1);
      });
      blocks.forEach((block) => addCandidate(block?.color, 1));
      candidates.sort((a, b) => b.score - a.score);
      const picked = candidates[0]?.hex || normalize(this.getMostPopularQuiltColor(blocks)?.color);
      if (!picked) return '#ea9b9a';
      const hsv = Utils.hexToHsv(picked);
      return Utils.hsvToHex(
        hsv.h,
        Math.max(48, Math.min(90, hsv.s * 0.82 + 12)),
        Math.max(80, Math.min(97, hsv.v + (100 - hsv.v) * 0.38))
      );
    }

    /** Vintage newsbox card fills — softened from today's prominent quilt colors. */
    _normalizeQuiltMoodTriptychHex(color) {
      const value = String(color || '').trim();
      if (!/^#?[0-9a-f]{6}$/i.test(value)) return '';
      return value.startsWith('#') ? value.toLowerCase() : `#${value.toLowerCase()}`;
    }

    _softenQuiltMoodTriptychFill(hex) {
      const safe = this._normalizeQuiltMoodTriptychHex(hex);
      if (!safe) return '';
      const hsv = Utils.hexToHsv(safe);
      if (hsv.s < 8) {
        return Utils.hsvToHex(hsv.h, 18, Math.max(72, hsv.v));
      }
      return Utils.hsvToHex(
        hsv.h,
        Math.max(40, Math.min(76, hsv.s * 0.7 + 14)),
        Math.max(58, Math.min(86, hsv.v * 0.78 + 14))
      );
    }

    /** Light + dark ink from one quilt hue (halftone riso: paper shows light, dots carry dark). */
    _triptychRisoTones(hex) {
      const ink = this._softenQuiltMoodTriptychFill(hex) || this._normalizeQuiltMoodTriptychHex(hex);
      if (!ink) return { ink: '', light: '', dark: '' };
      const hsv = Utils.hexToHsv(ink);
      if (hsv.s < 10) {
        return {
          ink,
          light: Utils.hsvToHex(hsv.h, 14, 90),
          dark: Utils.hsvToHex(hsv.h, 24, 56)
        };
      }
      return {
        ink,
        light: Utils.hsvToHex(
          hsv.h,
          Math.max(26, Math.min(52, hsv.s * 0.48)),
          Math.max(80, Math.min(94, hsv.v * 1.02 + 20))
        ),
        dark: Utils.hsvToHex(
          hsv.h,
          Math.max(50, Math.min(88, hsv.s * 1.06 + 8)),
          Math.max(36, Math.min(64, hsv.v * 0.66))
        )
      };
    }

    _triptychLighterFill(hexA, hexB) {
      const a = this._normalizeQuiltMoodTriptychHex(hexA);
      const b = this._normalizeQuiltMoodTriptychHex(hexB);
      if (!a) return b || '';
      if (!b) return a || '';
      return Utils.hexToHsv(a).v >= Utils.hexToHsv(b).v ? a : b;
    }

    /** Same hue as quilt pick — good card lighter, rough card darker (not a second hue). */
    _triptychPairFromHue(hex) {
      const base = this._softenQuiltMoodTriptychFill(hex) || this._normalizeQuiltMoodTriptychHex(hex);
      if (!base) return { goodFill: '', roughFill: '' };
      const hsv = Utils.hexToHsv(base);
      if (hsv.s < 10) {
        return {
          goodFill: Utils.hsvToHex(hsv.h, 16, Math.min(88, hsv.v + 12)),
          roughFill: Utils.hsvToHex(hsv.h, 22, Math.max(46, hsv.v - 20))
        };
      }
      return {
        goodFill: Utils.hsvToHex(
          hsv.h,
          Math.max(34, Math.min(58, hsv.s * 0.62)),
          Math.max(74, Math.min(90, hsv.v * 1.1 + 8))
        ),
        roughFill: Utils.hsvToHex(
          hsv.h,
          Math.max(50, Math.min(84, hsv.s * 0.98 + 4)),
          Math.max(40, Math.min(60, hsv.v * 0.7 - 2))
        )
      };
    }

    _quiltMoodTriptychPaletteCandidates(blocks = this.quiltEngine?.blocks || []) {
      const ranked = this.getQuiltColorFamilySubmissionBreakdown(blocks)
        .map((item) => this._normalizeQuiltMoodTriptychHex(item?.color))
        .filter(Boolean);
      const unique = [];
      ranked.forEach((hex) => {
        if (!unique.includes(hex)) unique.push(hex);
      });
      (Array.isArray(blocks) ? blocks : []).forEach((block) => {
        const hex = this._normalizeQuiltMoodTriptychHex(block?.color);
        if (hex && !unique.includes(hex)) unique.push(hex);
      });
      if (!unique.length) {
        unique.push('#df9368', '#7eb0c8');
      }
      return unique;
    }

    _quiltMoodTriptychPickerHex() {
      if (
        !this.colorHasBeenSelected ||
        !Number.isFinite(this.selectedHue) ||
        !Number.isFinite(this.selectedSaturation) ||
        !Number.isFinite(this.selectedLightness)
      ) {
        return '';
      }
      return this._normalizeQuiltMoodTriptychHex(
        Utils.hsvToHex(this.selectedHue, this.selectedSaturation, this.selectedLightness)
      );
    }

    /** Today's quilt color pick for this device — submission, live picker, or placed block. */
    _getQuiltMoodTriptychUserPickHex(blocks = this.quiltEngine?.blocks || []) {
      const fromSaved = this._normalizeQuiltMoodTriptychHex(
        this.getDevicePersonalColorForDate?.(Utils.getTodayKey())
      );
      if (fromSaved) return fromSaved;

      const fromToday = this._normalizeQuiltMoodTriptychHex(this.getExitChamberTodayPieceData?.()?.color);
      if (fromToday) return fromToday;

      const fromDedicated = this._normalizeQuiltMoodTriptychHex(
        this._todayPieceFromDedicatedBlock?.(blocks)?.color
      );
      if (fromDedicated) return fromDedicated;

      const fromPicker = this._quiltMoodTriptychPickerHex();
      if (fromPicker) return fromPicker;

      const dedicatedId = this.getDedicatedBlockId?.();
      if (dedicatedId) {
        const block = (Array.isArray(blocks) ? blocks : []).find((item) => item?.id === dedicatedId);
        const fromBlock = this._normalizeQuiltMoodTriptychHex(block?.color);
        if (fromBlock) return fromBlock;
      }

      return '';
    }

    getQuiltMoodTriptychFills(blocks = this.quiltEngine?.blocks || []) {
      const DEFAULT_BASE = '#df9368';
      const fallback = this._triptychPairFromHue(DEFAULT_BASE);
      const DEFAULT_GOOD = fallback.goodFill || '#df9368';
      const DEFAULT_ROUGH = fallback.roughFill || '#b85a38';
      const userHex = this._getQuiltMoodTriptychUserPickHex(blocks);
      const candidates = this._quiltMoodTriptychPaletteCandidates(blocks);
      let baseHex = userHex;
      if (!baseHex && this.hasCompletedDailyColorToday?.()) {
        baseHex = this._normalizeQuiltMoodTriptychHex(
          this._todayPieceFromDedicatedBlock?.(blocks)?.color
        );
      }
      if (!baseHex) baseHex = candidates[0] || DEFAULT_BASE;
      const pair = this._triptychPairFromHue(baseHex);
      const sharedFill = this._triptychLighterFill(
        pair.goodFill || DEFAULT_GOOD,
        pair.roughFill || DEFAULT_ROUGH
      );
      return {
        goodFill: sharedFill,
        roughFill: sharedFill
      };
    }

    applyQuiltMoodTriptychPalette(blocks = this.quiltEngine?.blocks || []) {
      const { goodFill } = this.getQuiltMoodTriptychFills(blocks);
      const tones = this._triptychRisoTones(goodFill);
      const vars = {
        '--quilt-mood-good-fill': tones.ink || goodFill,
        '--quilt-mood-good-fill-light': tones.light,
        '--quilt-mood-good-fill-dark': tones.dark,
        '--quilt-mood-rough-fill': tones.ink || goodFill,
        '--quilt-mood-rough-fill-light': tones.light,
        '--quilt-mood-rough-fill-dark': tones.dark
      };
      for (const el of [
        document.getElementById('screen-quilt'),
        document.getElementById('quiltMoodSpread')
      ]) {
        if (!el) continue;
        for (const [name, value] of Object.entries(vars)) {
          if (value) el.style.setProperty(name, value);
        }
      }
    }

    getFriendlyColorName(hex) {
      const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
      if (!match) return 'this color';
      const raw = match[1];
      const r = parseInt(raw.slice(0, 2), 16) / 255;
      const g = parseInt(raw.slice(2, 4), 16) / 255;
      const b = parseInt(raw.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lightness = (max + min) / 2;
      const delta = max - min;
      const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
      let hue = 0;
      if (delta !== 0) {
        if (max === r) hue = ((g - b) / delta) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue = Math.round(hue * 60);
        if (hue < 0) hue += 360;
      }

      if (saturation < 0.12) {
        if (lightness > 0.88) return 'cream';
        if (lightness > 0.62) return 'gray';
        if (lightness > 0.28) return 'charcoal';
        return 'black';
      }
      if (hue < 16 || hue >= 345) return lightness > 0.58 ? 'pink' : 'red';
      if (hue < 38) return 'orange';
      if (hue < 72) return 'yellow';
      if (hue < 95) return 'chartreuse';
      if (hue < 155) return 'green';
      if (hue < 185) return 'teal';
      if (hue < 205) return 'cyan';
      if (hue < 245) return 'blue';
      if (hue < 275) return 'indigo';
      if (hue < 315) return 'purple';
      return 'magenta';
    }

    /** Stable seed from hex so the same color always gets the same paint-chip name. */
    _paintSampleColorSeed(hex) {
      const raw = String(hex || '').replace(/^#/, '').toUpperCase();
      let h = 2166136261;
      for (let i = 0; i < raw.length; i++) {
        h ^= raw.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    /** Poetic paint-sample style label from hex (offline, deterministic). */
    getPaintSampleColorName(hex) {
      const normalized = this.normalizeHexColor(hex);
      if (!normalized) return 'Worn Linen';
      const seed = this._paintSampleColorSeed(normalized);
      const r = parseInt(normalized.slice(1, 3), 16) / 255;
      const g = parseInt(normalized.slice(3, 5), 16) / 255;
      const b = parseInt(normalized.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lightness = (max + min) / 2;
      const delta = max - min;
      const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
      let hue = 0;
      if (delta !== 0) {
        if (max === r) hue = ((g - b) / delta) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue = Math.round(hue * 60);
        if (hue < 0) hue += 360;
      }

      const moodLight = ['Sunwashed', 'Morning', 'Pale', 'Chalked', 'Misted', 'Hushed', 'Quiet'];
      const moodMid = ['Quiet', 'Worn', 'Faded', 'Dusted', 'Toasted', 'Overcast', 'Misted'];
      const moodDark = ['Spent', 'Dusky', 'Worn', 'Weathered', 'Late', 'Faded'];
      const moodPool =
        lightness > 0.64 ? moodLight : lightness < 0.36 ? moodDark : moodMid;
      const mood = moodPool[(seed + Math.round(saturation * 6)) % moodPool.length];

      const hueNouns = {
        neutral: ['Linen', 'Clay', 'Mist', 'Stone', 'Dusk', 'Haze', 'Drift'],
        red: ['Ember', 'Plum Wine', 'Clay', 'Blush', 'Ember'],
        orange: ['Ember', 'Clay', 'Ember', 'Copper'],
        yellow: ['Linen', 'Meadow', 'Sun', 'Linen'],
        chartreuse: ['Chartreuse', 'Garden', 'Sedge', 'Meadow', 'Patina'],
        green: ['Meadow', 'Sage', 'Sedge', 'Garden', 'Patina'],
        teal: ['Tide', 'Harbor', 'Patina', 'Mist', 'Sage'],
        cyan: ['Tide', 'Patina', 'Harbor', 'Mist'],
        blue: ['Tide', 'Dusk', 'Harbor', 'Patina'],
        indigo: ['Dusk', 'Harbor', 'Tide', 'Mist'],
        purple: ['Dusk', 'Plum Wine', 'Blush', 'Mist'],
        magenta: ['Plum Wine', 'Blush', 'Dawn', 'Dusk']
      };

      let bucket = 'green';
      if (saturation < 0.12) bucket = 'neutral';
      else if (hue < 16 || hue >= 345) bucket = lightness > 0.58 ? 'magenta' : 'red';
      else if (hue < 38) bucket = 'orange';
      else if (hue < 72) bucket = 'yellow';
      else if (hue < 95) bucket = 'chartreuse';
      else if (hue < 155) bucket = 'green';
      else if (hue < 185) bucket = 'teal';
      else if (hue < 205) bucket = 'cyan';
      else if (hue < 245) bucket = 'blue';
      else if (hue < 275) bucket = 'indigo';
      else if (hue < 315) bucket = 'purple';
      else bucket = 'magenta';

      const nouns = hueNouns[bucket] || hueNouns.green;
      const noun = nouns[(seed >>> 8) % nouns.length];
      return `${mood} ${noun}`;
    }

    hasSavedPopularColorResponseToday(dateKey = Utils.getTodayKey()) {
      return this._popularColorResponseSavedDateKey === dateKey;
    }

    markPopularColorResponseSaved(dateKey = Utils.getTodayKey()) {
      this._popularColorResponseSavedDateKey = dateKey;
    }

    updatePopularColorResponseInputState() {
      const input = document.getElementById('popularColorResponseInput');
      const status = document.getElementById('popularColorResponseStatus');
      if (!input) return;
      const saved = this.hasSavedPopularColorResponseToday();
      input.disabled = saved;
      input.placeholder = saved ? '' : 'one word';
      if (saved) input.value = '';
      if (status) status.textContent = saved ? 'Thank you ♡' : '';
    }

    async savePopularColorResponse() {
      const input = document.getElementById('popularColorResponseInput');
      const status = document.getElementById('popularColorResponseStatus');
      const context = this._popularColorCardContext;
      const rawResponse = String(input?.value || '').trim().toLowerCase();
      const words = rawResponse.split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        if (status) status.textContent = 'Please choose just one word.';
        return false;
      }
      const response = words[0] || '';
      if (!input || !response || !context || this.hasSavedPopularColorResponseToday(context.dateKey)) return false;
      if (this._popularColorResponseSaving) return false;
      if (!window.db || !window.firestore?.addDoc || !window.firestore?.collection) {
        throw new Error('Firestore is not available for popular color response');
      }

      this._popularColorResponseSaving = true;
      try {
        const payload = {
          response,
          appDateKey: context.dateKey,
          createdAt: new Date().toISOString(),
          source: 'popular_color_card',
          paletteMode: context.paletteMode,
          title: context.title,
          question: context.question,
          colorBackground: context.background,
          colors: context.colors,
          quiltFingerprint: Utils.computeQuiltFingerprint(this.quiltEngine?.blocks || [])
        };
        const responsesRef = window.firestore.collection(
          window.db,
          'popularColorResponses',
          context.dateKey,
          'responses'
        );
        await window.firestore.addDoc(responsesRef, payload);
        this.markPopularColorResponseSaved(context.dateKey);
        this.updatePopularColorResponseInputState();
        this.uiService?.showToast?.('Saved');
        return true;
      } finally {
        this._popularColorResponseSaving = false;
      }
    }

    updatePopularColorCard() {
      const panel = document.getElementById('popularColorPanel');
      const card = document.getElementById('popularColorCard');
      const title = document.getElementById('popularColorTitle');
      const question = document.getElementById('popularColorQuestion');
      if (!panel || !card || !title || !question) return;
      const popularColorQuestionEnabled = false;
      if (!popularColorQuestionEnabled) {
        this._popularColorCardContext = null;
        panel.hidden = true;
        card.hidden = true;
        return;
      }

      const sourceBlocks =
        this._isPersonalQuiltMode && Array.isArray(this._personalQuiltState?.blocks)
          ? this._personalQuiltState.blocks
          : this.quiltEngine?.blocks;
      const summary = this.getQuiltPaletteSummary(sourceBlocks);
      if (!summary?.colors?.length) {
        this._popularColorCardContext = null;
        panel.hidden = true;
        card.hidden = true;
        return;
      }

      const colors = summary.colors.map((item) => item.color).filter(Boolean);
      const primary = colors[0] || '#ebe8e3';
      const ink = this.getReadableTextColorForBackground(primary);
      let background = primary;

      if (summary.mode === 'split' && colors.length >= 2) {
        background = `linear-gradient(90deg, ${colors[0]} 0 50%, ${colors[1]} 50% 100%)`;
        title.textContent = 'We have a tie';
        question.textContent = 'Why do you think these two showed up together?';
      } else if (summary.mode === 'mosaic') {
        const stops = colors.length
          ? colors.map((color, index) => {
              const start = Math.round((index / colors.length) * 100);
              const end = Math.round(((index + 1) / colors.length) * 100);
              return `${color} ${start}% ${end}%`;
            }).join(', ')
          : '#ebe8e3 0% 100%';
        background = `linear-gradient(135deg, ${stops})`;
        title.textContent = "Today's palette";
        question.textContent = 'No single mood today — what does that say?';
      } else {
        const colorName = summary.colors[0].family || this.getFriendlyColorName(primary);
        title.textContent = "Today's Most-Chosen Color";
        question.textContent = `Why do you think ${colorName} is so popular today?`;
      }

      card.dataset.paletteMode = summary.mode;
      card.style.background = background;
      card.style.color = ink;
      card.style.setProperty('--popular-color-bg', background);
      card.style.setProperty('--popular-color-ink', ink);
      this._popularColorCardContext = {
        dateKey: Utils.getTodayKey(),
        paletteMode: summary.mode,
        title: title.textContent,
        question: question.textContent,
        background,
        colors: summary.colors.map(({ family, color, count, percent }) => ({
          family,
          color,
          count,
          percent
        }))
      };
      this.updatePopularColorResponseInputState();
      panel.hidden = false;
      card.hidden = false;
    }

    /**
     * @param {{ viewportOnly?: boolean }} [opts]
     *   viewportOnly — iOS toolbar / visualViewport resize: reflow mosaic only, skip quote/speaker/preview chrome.
     */
    async renderQuilt(opts = {}) {
      const viewportOnly = opts.viewportOnly === true;
      // Debug logging removed to reduce console noise
      // Debug panel removed for production
      
      this.ensureQuiltFits();
      this.renderer?.setBacksidePreviewEnabled?.(this._isBacksidePreviewMode === true);
      
      const state = this.quiltEngine.getState();
      if (this._isPersonalQuiltMode && this._personalQuiltState?.blocks?.length) {
        this.renderer.renderBlocks(
          this._personalQuiltState.blocks,
          this._personalQuiltState.blocks,
          this._personalQuiltState.submissionCount || 0
        );
      } else {
        this.renderer.renderBlocks(state.blocks, state.userPieces, state.submissionCount);
      }
      this.resetQuiltParallaxVisualState();
      this.syncQuiltZoomAfterRender();
      requestAnimationFrame(() => {
        this.syncQuiltFilmGrainOverlay();
        this.flushFooterIconPaperChrome?.();
        this.scheduleFooterIconChromeUpdate?.();
      });
      this.updateSquareCounter();
      if (viewportOnly) {
        return;
      }
      this.renderQuiltContributorList();
      this.updatePopularColorCard();
      
      // Ensure quote is displayed on quilt screen
      this.populateQuiltQuote();
      
      // Auto-load random reveal image if not already loaded (non-blocking)
      // DISABLED: Causing CORS errors
      // if (!this.currentRevealImage || !this.currentRevealImage.url) {
      //   console.log('🎲 Auto-loading random reveal image...');
      //   // Don't await - let it load in background
      //   this.loadRandomRevealImage().catch(error => {
      //     console.log('Could not auto-load reveal image:', error);
      //   });
      // }

      const effectiveQuote = this.isAdminTomorrowPreviewActive() ? this.getEffectiveQuiltQuote() : null;
      if (!this.isAdminTomorrowPreviewActive() || effectiveQuote?.text) {
        this.refreshQuoteSpeakerWidget(effectiveQuote);
      }
      if (
        !this._layoutBStoryPreviewHeavyDoneThisVisit &&
        !this._layoutBStoryPreviewLaunchScheduled
      ) {
        this.scheduleLayoutBStoryPreviewRefresh();
      }
      this.refreshQuiltFortuneFrontImage();
      this.refreshQuiltMoodCardImages();
      this.applyQuiltMoodTriptychPalette();
      this.refreshQuiltMoodWidget(effectiveQuote);
      this.refreshQuiltReflectionScrapWidget(effectiveQuote);
      this.refreshQuiltUserShapeCard();
    }

    resetQuiltParallaxVisualState() {
      this.parallaxTargetShift = 0;
      this.parallaxCurrentShift = 0;
      this.parallaxAppliedSvgShift = 0;
      this._parallaxBlocksJittered = false;
      this._parallaxScrollActive = false;
      if (this._parallaxScrollEndTimer != null) {
        clearTimeout(this._parallaxScrollEndTimer);
        this._parallaxScrollEndTimer = null;
      }
      document.documentElement.style.setProperty('--quilt-base-shift', '0px');
      document.documentElement.style.setProperty('--quilt-overlay-shift', '0px');
      document.querySelectorAll('#quilt .quilt-parallax-block').forEach((node) => {
        node.setAttribute('transform', node.dataset.baseTransform || '');
      });
    }

    ensureQuiltScreenInteractive() {
      const screen = document.getElementById('screen-quilt');
      const quiltContainer = document.querySelector('#screen-quilt .quilt-container');
      const quiltSvg = document.getElementById('quilt');
      if (!screen) return;

      screen.style.overflowY = 'auto';
      screen.style.overflowX = 'hidden';
      screen.style.webkitOverflowScrolling = 'touch';
      screen.style.touchAction = 'pan-y';
      screen.style.pointerEvents = 'auto';
      screen.scrollTop = Math.max(0, screen.scrollTop || 0);
      const prefersScrollThroughQuilt = window.matchMedia?.('(max-width: 768px)')?.matches === true;

      if (this.quiltZoomState) {
        this.quiltZoomState.isPinching = false;
        this.quiltZoomState.isPanning = false;
        this.quiltZoomState.moved = false;
        this.quiltZoomState.activeFromQuilt = false;
        this.quiltZoomState.gestureStartClient = null;
      }
      if (quiltContainer) {
        quiltContainer.classList.remove('quilt-container--zooming');
        if (quiltSvg?.childElementCount > 0) {
          quiltContainer.classList.remove('odq-quilt-shell--pending');
        }
        quiltContainer.style.removeProperty('visibility');
        quiltContainer.style.removeProperty('opacity');
        quiltContainer.style.pointerEvents = prefersScrollThroughQuilt ? 'none' : '';
        quiltContainer.style.touchAction = 'pan-y manipulation';
      }
      if (quiltSvg) {
        quiltSvg.style.pointerEvents = prefersScrollThroughQuilt ? 'none' : '';
        quiltSvg.style.touchAction = 'pan-y manipulation';
      }
      if (!this.renderer?.quiltSVG && quiltSvg) {
        try {
          this.renderer?.initialize?.();
        } catch (error) {
          this.logger?.warn?.('Quilt renderer re-initialize failed:', error);
        }
      }
      requestAnimationFrame(() => this._reflowQuiltMoodPaperIfRestored());
      requestAnimationFrame(() => {
        const active = document.getElementById('screen-quilt')?.classList.contains('active');
        const svg = document.getElementById('quilt');
        if (!active || !svg || svg.childElementCount > 0) return;
        try {
          this.renderQuilt();
        } catch (error) {
          this.logger?.warn?.('Quilt self-heal render failed:', error);
        }
      });
      this.uiService?._syncRememberTodayFixedFooterLeakGuard?.();
      this._syncQuiltScrollIconFooterLeakGuard();
    }

    _revokeLayoutBPreviewObjectUrl() {
      if (this._layoutBPreviewObjectUrl) {
        try {
          URL.revokeObjectURL(this._layoutBPreviewObjectUrl);
        } catch (e) {
          /* ignore */
        }
        this._layoutBPreviewObjectUrl = null;
      }
    }

    _speakerPaintUrlMatchesQuoteAuthor(paintUrl, quote) {
      const url = String(paintUrl || '').trim();
      const author = String(quote?.author ?? '').trim();
      const qs = this.quoteService;
      if (!url || !author || typeof qs?.speakerStorageCutoutUrlMatchesAuthor !== 'function') {
        return true;
      }
      return qs.speakerStorageCutoutUrlMatchesAuthor(url, author);
    }

    /** Resolved cutout/portrait URL used for Layout B story preview (matches compose). */
    async _layoutBStoryPreviewSpeakerSig(quote) {
      const previewActive = this.isAdminTomorrowPreviewActive?.() === true;
      const q = quote && typeof quote === 'object' ? quote : {};
      let cached = String(
        this._layoutBStoryPreviewSpeakerPaintUrl ||
          (previewActive ? '' : this._quoteSpeakerCutoutUrl) ||
          ''
      ).trim();
      if (cached && !this._speakerPaintUrlMatchesQuoteAuthor(cached, q)) {
        this._layoutBStoryPreviewSpeakerPaintUrl = '';
        cached = '';
      }
      if (cached) return cached;
      const author = String(q.author ?? '').trim();
      const arch = this.archiveService;
      if (arch && typeof arch.resolveLayoutBSpeakerCutoutUrl === 'function') {
        const portrait =
          typeof arch._layoutBSpeakerPortraitUrlResolved === 'function'
            ? arch._layoutBSpeakerPortraitUrlResolved(q)
            : typeof arch._layoutBSpeakerPortraitUrl === 'function'
              ? arch._layoutBSpeakerPortraitUrl(q)
              : '';
        const cutout = await arch.resolveLayoutBSpeakerCutoutUrl(q, author);
        return String(cutout || portrait || '').trim();
      }
      return String(
        q.speakerCutoutUrl ??
          q.speaker_cutout_url ??
          q.speakerImageUrl ??
          q.speaker_image_url ??
          ''
      ).trim();
    }

    /** Cache key so story preview/share regen when quilt or speaker changes (not only once per visit). */
    _layoutBStoryPreviewContentKeyFor(blocks, dateKey, speakerSig, options = {}) {
      const dk = String(dateKey || '').trim();
      const fp =
        typeof Utils.computeQuiltFingerprint === 'function' && Array.isArray(blocks)
          ? Utils.computeQuiltFingerprint(blocks)
          : String((blocks || []).length);
      const speaker = String(speakerSig || '').trim();
      const speakerReady = options.speakerReady === true ? '1' : '0';
      return `${dk}|${fp}|${speaker}|${speakerReady}|stripRows2`;
    }

    /** Drop cached Layout B story preview so a new app-day cannot keep yesterday's bitmap. */
    _invalidateLayoutBStoryPreviewForAppDayChange() {
      this._layoutBStoryPreviewHeavyDoneThisVisit = false;
      this._layoutBStoryPreviewContentKey = '';
      this._layoutBStoryPreviewSatisfiedForDateKey = null;
      this._layoutBStoryPreviewShareBlob = null;
      this._layoutBStoryPreviewSpeakerPaintUrl = '';
      this._layoutBStoryPreviewSpeakerUpgradeDone = false;
      this._layoutBStoryPreviewRerunQueued = false;
      this._layoutBPreviewGeneration++;
      if (this._layoutBPreviewDebounceTimer) {
        clearTimeout(this._layoutBPreviewDebounceTimer);
        this._layoutBPreviewDebounceTimer = null;
      }
      this._revokeLayoutBPreviewObjectUrl();
      const img = document.getElementById('quiltLayoutBPreviewImg');
      if (img) {
        img.removeAttribute('src');
        img.hidden = true;
        img.onload = null;
        img.onerror = null;
      }
    }

    scheduleLayoutBStoryPreviewRefresh(options = {}) {
      if (this.isDesktopRedirect) return;
      if (options.force !== true && this._layoutBStoryPreviewHeavyDoneThisVisit) {
        return;
      }
      void this._scheduleLayoutBStoryPreviewRefreshDebounced();
    }

    /** Regenerate story preview once speaker cutout bytes are on-screen (card img loaded). */
    scheduleLayoutBStoryPreviewRefreshAfterSpeaker(paintUrl) {
      const url = String(paintUrl || '').trim();
      if (!url || !/speaker-cutouts(?:%2F|\/)/i.test(url)) return;
      const blocks = this.quiltEngine?.blocks;
      if (!Array.isArray(blocks) || blocks.length <= 1) return;

      const quote = this.isAdminTomorrowPreviewActive?.()
        ? this.getEffectiveQuiltQuote?.()
        : this.quoteService?.getTodayQuote?.();
      if (!this._speakerPaintUrlMatchesQuoteAuthor(url, quote)) return;

      this._layoutBStoryPreviewSpeakerPaintUrl = url;
      this.archiveService?._forgetProxyImageFailure?.(url);

      if (!this._layoutBStoryPreviewHeavyDoneThisVisit) {
        return;
      }
      if (this._layoutBStoryPreviewSpeakerUpgradeDone) {
        return;
      }
      if (!String(this._layoutBStoryPreviewContentKey || '').endsWith('|0')) {
        return;
      }

      this._layoutBStoryPreviewSpeakerUpgradeDone = true;
      this._layoutBStoryPreviewHeavyDoneThisVisit = false;
      this.scheduleLayoutBStoryPreviewRefresh({ force: true });
    }

    async _scheduleLayoutBStoryPreviewRefreshDebounced() {
      const blocks = this.quiltEngine?.blocks;
      const blockCount = Array.isArray(blocks) ? blocks.length : 0;
      if (blockCount <= 1) return;
      if (this._layoutBStoryPreviewHeavyDoneThisVisit) return;
      if (this._layoutBStoryPreviewInFlight) {
        this._layoutBStoryPreviewRerunQueued = true;
        return;
      }
      if (this._layoutBPreviewDebounceTimer) {
        clearTimeout(this._layoutBPreviewDebounceTimer);
      }
      const delayMs = this._layoutBStoryPreviewHeavyDoneThisVisit ? 400 : 0;
      this._layoutBPreviewDebounceTimer = setTimeout(() => {
        this._layoutBPreviewDebounceTimer = null;
        void this.refreshLayoutBStoryPreview();
      }, delayMs);
    }

    /** Reuse speaker cutout bytes already proxied for the on-screen speaker card. */
    async _layoutBStoryPreviewPreloadedSpeakerDataUrl(paintUrl, quote = null, options = {}) {
      const url = String(paintUrl || '').trim();
      if (!url) return '';
      const arch = this.archiveService;
      if (!arch) return '';
      const normalized =
        typeof arch._normalizeProxyImageSource === 'function'
          ? arch._normalizeProxyImageSource(url)
          : url;
      if (arch._proxyImageDataUrlCache?.has(normalized)) {
        const cached = String(arch._proxyImageDataUrlCache.get(normalized) || '').trim();
        if (cached && typeof arch._finalizeSpeakerCutoutExportDataUrl === 'function') {
          return String((await arch._finalizeSpeakerCutoutExportDataUrl(cached, url)) || cached).trim();
        }
        return cached;
      }
      const storagePath =
        typeof arch._firebaseStoragePathFromDownloadUrl === 'function'
          ? arch._firebaseStoragePathFromDownloadUrl(normalized)
          : '';
      if (storagePath && arch._proxyImageDataUrlCache?.has(`firebase-storage:${storagePath}`)) {
        const cached = String(
          arch._proxyImageDataUrlCache.get(`firebase-storage:${storagePath}`) || ''
        ).trim();
        if (cached && typeof arch._finalizeSpeakerCutoutExportDataUrl === 'function') {
          return String((await arch._finalizeSpeakerCutoutExportDataUrl(cached, url)) || cached).trim();
        }
        return cached;
      }
      if (/^(?:data|blob):/i.test(url)) return url;
      if (typeof arch._prepareSpeakerImageUrlForCanvas === 'function') {
        try {
          return String(
            (await arch._prepareSpeakerImageUrlForCanvas(url, {
              quote,
              retry: options.retry === true
            })) || ''
          ).trim();
        } catch (_) {
          /* ignore */
        }
      }
      return '';
    }

    /**
     * Resolved daily quote + optional speaker overlay for Layout B (matches on-quilt preview pixels).
     */
    async resolveLayoutBStoryQuoteAndComposeOptions(dateKey, blocks, aspect = 'story') {
      const dk = dateKey || Utils.getTodayKey();
      const tuneAspect = globalThis.odqNormalizeTuneAspect(aspect);
      const qt =
        (this.quoteService && typeof this.quoteService.getQuoteResolvedForInstagramDateKey === 'function'
          ? await this.quoteService.getQuoteResolvedForInstagramDateKey(dk)
          : this.quoteService?.getTodayQuote?.()) || { text: '', author: '' };
      const qText = String(qt.text ?? qt.body ?? '').trim();
      const qAuthor = String(qt.author ?? '').trim();
      let speakerOverlay = null;
      const speakerPortraitUrl =
        (this.archiveService && typeof this.archiveService._layoutBSpeakerPortraitUrl === 'function'
          ? this.archiveService._layoutBSpeakerPortraitUrl(qt)
          : '') ||
        String(qt.speakerImageUrl ?? qt.speaker_image_url ?? qt.speakerImageUrlSnapshot ?? '').trim();
      const speakerCutoutUrl =
        this.archiveService && typeof this.archiveService.resolveLayoutBSpeakerCutoutUrl === 'function'
          ? await this.archiveService.resolveLayoutBSpeakerCutoutUrl(qt, qAuthor)
          : '';
      if (speakerCutoutUrl || speakerPortraitUrl) {
        const arch = this.archiveService;
        const speakerImageForCanvas =
          arch && typeof arch._speakerOverlayImageUrlForLayoutBCompose === 'function'
            ? await arch._speakerOverlayImageUrlForLayoutBCompose(
                speakerCutoutUrl,
                speakerPortraitUrl,
                qt
              )
            : speakerCutoutUrl || speakerPortraitUrl;
        if (speakerImageForCanvas) {
          const speakerName = String(qt.speakerName ?? qt.speaker_name ?? qAuthor)
            .replace(/^\s*[—-]\s*/, '')
            .trim();
          const washColor = String(
            this.getMostPopularQuiltColor?.(blocks)?.color || CONFIG.APP.defaultColor || '#ea9b9a'
          ).trim();
          speakerOverlay = {
            enabled: true,
            imageUrl: speakerImageForCanvas,
            cutoutSourceUrl: speakerCutoutUrl || speakerPortraitUrl || '',
            name: speakerName,
            washColor
          };
        }
      }
      const composeExtras = { tuneAspect, speakerCutoutQuote: qt };
      if (speakerOverlay) composeExtras.speakerOverlay = speakerOverlay;
      if (tuneAspect === 'post') composeExtras.quiltFit = 'cover';
      try {
        const keywordEmphasis = await globalThis.odqReadLayoutBKeywordEmphasis(dk, tuneAspect, qt);
        if (keywordEmphasis) {
          composeExtras.keywordEmphasis = keywordEmphasis;
          composeExtras.keywordEmphasisExplicit = true;
        }
        const stripLayoutSeed = await globalThis.odqReadLayoutBStripLayoutSeed(dk, tuneAspect);
        composeExtras.stripLayoutSeed = stripLayoutSeed;
        composeExtras.stripLayoutSeedExplicit = true;
        if (
          composeExtras.speakerOverlay &&
          typeof globalThis.odqSpeakerCutoutTransformForDateAsync === 'function'
        ) {
          const presetTransform = await globalThis.odqSpeakerCutoutTransformForDateAsync(
            dk,
            tuneAspect
          );
          if (presetTransform) composeExtras.speakerOverlay.transform = presetTransform;
        }
      } catch (kwErr) {
        this.logger?.warn?.('Layout B tune settings read failed:', kwErr);
      }
      return { dk, qt, qText, qAuthor, composeExtras };
    }

    /** Stable day-of-quote rotation for Before You Go SHARE bullet (0..1). */
    _beforeYouGoShareIndexFromDateKey(dateKey) {
      let h = 0;
      const s = String(dateKey || '');
      for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
      }
      return Math.abs(h >>> 0) % 2;
    }

    _renderBeforeYouGoDom() {
      const qs = this.quoteService;
      if (!qs) return;
      const quote = this.isAdminTomorrowPreviewActive?.()
        ? this.getEffectiveQuiltQuote()
        : qs.getTodayQuote();
      const watchTape = document.getElementById('beforeYouGoWatchTape');
      const watchForBodyEl = document.getElementById('beforeYouGoWatchForBody');
      const exploreTitleEl = document.getElementById('beforeYouGoExploreTitle');
      const exploreDescEl = document.getElementById('beforeYouGoExploreDesc');
      const shareLeadEl = document.getElementById('beforeYouGoShareLead');
      const shareBtn = document.getElementById('beforeYouGoShareBtn');
      const watchForText = qs.getWatchForText(quote);
      if (watchForBodyEl) watchForBodyEl.textContent = watchForText;
      if (watchTape) {
        watchTape.hidden = !watchForText;
        watchTape.setAttribute('aria-hidden', watchForText ? 'false' : 'true');
      }
      const { titleLine, blurb, iconName } = qs.getArtRecBeforeYouGoParts(quote);
      if (exploreTitleEl) {
        // Clear + rebuild via DOM API so titleLine (Notion-authored) is never
        // interpreted as HTML. Icon prefix is added when art_recs_type is set.
        exploreTitleEl.replaceChildren();
        exploreTitleEl.classList.remove('art-rec-title--all-italic');
        if (iconName) {
          const iconEl = document.createElement('span');
          iconEl.className = 'material-symbols-outlined art-rec-icon';
          iconEl.setAttribute('aria-hidden', 'true');
          iconEl.translate = false;
          iconEl.textContent = iconName;
          exploreTitleEl.appendChild(iconEl);
        }
        if (titleLine) this._appendArtRecTitleColonItalic(exploreTitleEl, titleLine);
      }
      if (exploreDescEl) {
        if (blurb) {
          exploreDescEl.textContent = blurb;
          exploreDescEl.hidden = false;
        } else {
          exploreDescEl.textContent = '';
          exploreDescEl.hidden = true;
        }
      }
      const dk = this.isAdminTomorrowPreviewActive?.()
        ? this.getEffectiveAppDateKey()
        : qs.getQuoteCalendarKeyNow();
      const idx = this._beforeYouGoShareIndexFromDateKey(dk);
      /** 0 = friend, 1 = App Store review — index chosen from dateKey. */
      const variants = [
        { mode: 'friend', lead: 'Tell someone', label: 'Share with a friend' },
        { mode: 'review', lead: 'Help us grow', label: 'Leave a review' }
      ];
      const v = variants[idx];
      this._beforeYouGoShareMode = v.mode;
      if (shareLeadEl) shareLeadEl.textContent = v.lead;
      if (shareBtn) {
        shareBtn.textContent = v.label;
        shareBtn.classList.add('quilt-before-you-go__link');
        shareBtn.classList.remove('quilt-before-you-go__share-plain');
        shareBtn.disabled = false;
        shareBtn.removeAttribute('aria-disabled');
        shareBtn.removeAttribute('aria-label');
      }
    }

    updateBeforeYouGoSection() {
      if (this.isDesktopRedirect) return;
      const qs = this.quoteService;
      if (qs) {
        const dk = this.isAdminTomorrowPreviewActive?.()
        ? this.getEffectiveAppDateKey()
        : qs.getQuoteCalendarKeyNow();
        if (this._beforeYouGoHydratedDateKey && this._beforeYouGoHydratedDateKey !== dk) {
          this._beforeYouGoHydratedDateKey = null;
        }
      }
      this._renderBeforeYouGoDom();
      void this._hydrateBeforeYouGoFromFirestoreOnce();
      this.updateBeforeYouGoClosingCountdown();
    }

    async _hydrateBeforeYouGoFromFirestoreOnce() {
      const qs = this.quoteService;
      if (!qs) return;
      if (!window.db || !window.firestore) {
        setTimeout(() => this._hydrateBeforeYouGoFromFirestoreOnce(), 250);
        return;
      }
      const dateKey = this.isAdminTomorrowPreviewActive?.()
        ? this.getEffectiveAppDateKey()
        : qs.getQuoteCalendarKeyNow();
      if (!dateKey) return;
      if (this.isAdminTomorrowPreviewActive?.() && this._beforeYouGoHydratedDateKey === dateKey) {
        const pinned = qs._pinnedByDateKey?.[dateKey];
        if (pinned?.text) {
          this._syncAdminPreviewQuoteFromPin?.();
          this._renderBeforeYouGoDom();
          return;
        }
      }
      if (this._beforeYouGoHydratedDateKey === dateKey) return;
      try {
        const readQuoteDoc = async (docId) => {
          if (!docId) return null;
          const snap = await (window.firestore.getDocFromServer || window.firestore.getDoc)(
            window.firestore.doc(window.db, 'quotes', docId)
          );
          return snap.exists() ? snap.data() || {} : null;
        };
        const todayQuote = this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveQuiltQuote()
          : qs.getTodayQuote();
        const sourceId = String(todayQuote?.sourceId || '').trim();
        const byDate = await readQuoteDoc(dateKey);
        const bySource =
          sourceId && sourceId !== dateKey ? await readQuoteDoc(sourceId) : null;
        if (!byDate && !bySource) return;

        const prev = this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveQuiltQuote() || {}
          : qs._pinnedByDateKey[dateKey] || todayQuote || {};
        const data = qs._mergeFirestoreQuoteDocsForDay(byDate, bySource, sourceId, dateKey);
        const assignData = await qs._readDailyQuoteAssignmentData(dateKey);
        const dataWithAssign = assignData
          ? qs._mergeAssignmentArtRecSnapshotFields(
              qs._mergeAssignmentBygSnapshotFields(data, assignData),
              assignData
            )
          : data;
        const ref = String(dataWithAssign.reflection_prompt || dataWithAssign.reflectionPrompt || '').trim();
        const smallAct = String(dataWithAssign.small_act ?? dataWithAssign.smallAct ?? '').trim();
        const watchFor = String(
          dataWithAssign.watch_for ??
            dataWithAssign.watchFor ??
            dataWithAssign.watch_for_snapshot ??
            dataWithAssign.watchForSnapshot ??
            ''
        ).trim();
        const art = dataWithAssign.art_recs ?? dataWithAssign.artRecs ?? prev.art_recs ?? prev.artRecs;
        const artRecsType = String(
          dataWithAssign.art_recs_type ??
            dataWithAssign.artRecsType ??
            dataWithAssign.artRecsTypeSnapshot ??
            prev.art_recs_type ??
            prev.artRecsType ??
            ''
        )
          .trim()
          .toLowerCase();
        const goodDay = String(dataWithAssign.good_day ?? dataWithAssign.goodDay ?? '').trim();
        const roughDay = String(dataWithAssign.rough_day ?? dataWithAssign.roughDay ?? '').trim();
        qs._pinnedByDateKey[dateKey] = {
          ...prev,
          ...dataWithAssign,
          ...(ref ? { reflectionPrompt: ref, reflection_prompt: ref } : {}),
          ...(smallAct ? { smallAct, small_act: smallAct } : {}),
          ...(watchFor ? { watch_for: watchFor } : {}),
          ...(goodDay ? { goodDay, good_day: goodDay } : {}),
          ...(roughDay ? { roughDay, rough_day: roughDay } : {}),
          ...(art != null
            ? {
                art_recs: dataWithAssign.art_recs ?? dataWithAssign.artRecs ?? art,
                artRecs: dataWithAssign.artRecs ?? dataWithAssign.art_recs ?? art
              }
            : {}),
          ...(artRecsType ? { art_recs_type: artRecsType, artRecsType } : {})
        };
        if (this.isAdminTomorrowPreviewActive?.() && this._adminPreview?.dateKey === dateKey) {
          this._syncAdminPreviewQuoteFromPin?.();
        }
        this._beforeYouGoHydratedDateKey = dateKey;
        this._renderBeforeYouGoDom();
      } catch (e) {
        this.logger?.warn?.('Before You Go Firestore read failed:', e);
      }
    }

    async handleBeforeYouGoShareClick() {
      const mode = this._beforeYouGoShareMode;
      if (mode === 'friend') {
        const url = String(CONFIG.APP.shareAppUrl || '').trim();
        if (!url) {
          this.uiService.showToast('App link coming soon');
          return;
        }
        try {
          if (navigator.share) {
            await navigator.share({
              title: CONFIG.APP.name,
              text: "Here's OUR DAILY QUILT — add your color to today's quilt.",
              url
            });
          } else {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          this.uiService.showToast('Share was cancelled or unavailable.');
        }
        return;
      }
      if (mode === 'review') {
        const url = String(CONFIG.APP.appStoreReviewUrl || '').trim();
        if (!url) {
          this.uiService.showToast('App Store link coming soon');
          return;
        }
        if (typeof window.odqTrack === 'function') {
          window.odqTrack('app_store_review_tap');
        }
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }

    /** Downscale full-res story blob for fast `<img>` decode on iPhone; share keeps full blob. */
    async _layoutBStoryPreviewDisplayBlobFrom(fullBlob, maxWidth = 540) {
      if (typeof Utils.downscaleImageBlob === 'function') {
        try {
          return await Utils.downscaleImageBlob(fullBlob, maxWidth, 'image/png', 0.88);
        } catch (err) {
          this.logger?.warn?.('Layout B preview downscale failed, using full blob:', err);
        }
      }
      return fullBlob;
    }

    async refreshLayoutBStoryPreview() {
      if (this.isDesktopRedirect) return;
      if (this._layoutBStoryPreviewInFlight) {
        this._layoutBStoryPreviewRerunQueued = true;
        return;
      }
      this._layoutBStoryPreviewInFlight = true;
      try {
        await this._refreshLayoutBStoryPreviewCore();
      } finally {
        this._layoutBStoryPreviewInFlight = false;
        if (this._layoutBStoryPreviewRerunQueued && !this._layoutBStoryPreviewHeavyDoneThisVisit) {
          this._layoutBStoryPreviewRerunQueued = false;
          void this._scheduleLayoutBStoryPreviewRefreshDebounced();
        } else {
          this._layoutBStoryPreviewRerunQueued = false;
        }
      }
    }

    async _refreshLayoutBStoryPreviewCore() {
      if (this.isDesktopRedirect) return;
      const wrap = document.getElementById('quiltLayoutBPreviewWrap');
      const img = document.getElementById('quiltLayoutBPreviewImg');
      const hint = document.getElementById('quiltLayoutBPreviewHint');
      if (!wrap || !img) return;

      const blocks = this.quiltEngine?.blocks;
      const blockCount = Array.isArray(blocks) ? blocks.length : 0;
      if (blockCount <= 1) {
        this._layoutBStoryPreviewHeavyDoneThisVisit = false;
        this._layoutBStoryPreviewContentKey = '';
        this._layoutBStoryPreviewSatisfiedForDateKey = null;
        this._layoutBStoryPreviewShareBlob = null;
        this._revokeLayoutBPreviewObjectUrl();
        img.removeAttribute('src');
        img.hidden = true;
        wrap.setAttribute('aria-busy', 'false');
        wrap.classList.add('quilt-layout-b-preview-wrap--empty');
        if (hint) {
          hint.hidden = false;
          hint.textContent = "Add another color to see today's story collage preview.";
        }
        return;
      }

      const dk = this.getEffectiveAppDateKey();
      const arch = this.archiveService;
      let quote = this.isAdminTomorrowPreviewActive()
        ? this.getEffectiveQuiltQuote() || { text: '', author: '' }
        : this.quoteService?.getTodayQuote?.() || { text: '', author: '' };
      if (
        !String(quote?.text || '').trim() &&
        this.quoteService &&
        typeof this.quoteService.getQuoteResolvedForInstagramDateKey === 'function'
      ) {
        quote =
          (await this.quoteService.getQuoteResolvedForInstagramDateKey(dk)) ||
          quote ||
          { text: '', author: '' };
      }
      const speakerSig = await this._layoutBStoryPreviewSpeakerSig(quote);
      let cachedPaint = String(this._layoutBStoryPreviewSpeakerPaintUrl || '').trim();
      if (cachedPaint && !this._speakerPaintUrlMatchesQuoteAuthor(cachedPaint, quote)) {
        this._layoutBStoryPreviewSpeakerPaintUrl = '';
        cachedPaint = '';
      }
      const paintUrl = String(
        cachedPaint ||
          (this.isAdminTomorrowPreviewActive?.() ? '' : this._quoteSpeakerCutoutUrl) ||
          speakerSig ||
          ''
      ).trim();
      const expectsCutout = /speaker-cutouts(?:%2F|\/)/i.test(paintUrl);
      let preloadedSpeakerImageUrl = paintUrl
        ? await this._layoutBStoryPreviewPreloadedSpeakerDataUrl(paintUrl, quote)
        : '';
      if (expectsCutout && !preloadedSpeakerImageUrl && arch?._proxyImageInFlight) {
        const normalized =
          typeof arch._normalizeProxyImageSource === 'function'
            ? arch._normalizeProxyImageSource(paintUrl)
            : paintUrl;
        const inflight = arch._proxyImageInFlight.get(normalized);
        if (inflight) {
          preloadedSpeakerImageUrl = String((await inflight) || '').trim();
        }
      }
      if (expectsCutout && !preloadedSpeakerImageUrl) {
        arch?._forgetProxyImageFailure?.(paintUrl);
        preloadedSpeakerImageUrl = await this._layoutBStoryPreviewPreloadedSpeakerDataUrl(paintUrl, quote, {
          retry: true
        });
      }
      const speakerReady = !expectsCutout || !!preloadedSpeakerImageUrl;
      const previewContentKey = this._layoutBStoryPreviewContentKeyFor(blocks, dk, speakerSig, {
        speakerReady
      });
      if (this._layoutBStoryPreviewHeavyDoneThisVisit && this._layoutBStoryPreviewContentKey === previewContentKey) {
        return;
      }

      wrap.classList.remove('quilt-layout-b-preview-wrap--empty');
      const gen = ++this._layoutBPreviewGeneration;
      wrap.setAttribute('aria-busy', 'true');
      if (hint) {
        hint.hidden = false;
        hint.textContent = expectsCutout && !preloadedSpeakerImageUrl ? 'Loading speaker…' : 'Updating preview…';
      }

      try {
        if (gen !== this._layoutBPreviewGeneration) return;
        if (!arch || typeof arch.generateInstagramStoryLayoutBBlob !== 'function') {
          throw new Error('Layout B story export unavailable');
        }
        if (gen !== this._layoutBPreviewGeneration) return;
        const slowHintTimer = setTimeout(() => {
          if (gen !== this._layoutBPreviewGeneration) return;
          if (hint && wrap.getAttribute('aria-busy') === 'true') {
            hint.hidden = false;
            hint.textContent = 'Still rendering story…';
          }
        }, 4000);
        const composePromise = arch.generateInstagramStoryLayoutBBlob(blocks, quote, dk, {
          forPreview: true,
          preloadedSpeakerImageUrl
        });
        const lbBlob =
          typeof globalThis.odqPromiseWithTimeout === 'function'
            ? await globalThis.odqPromiseWithTimeout(composePromise, 90000, 'Story preview')
            : await composePromise;
        clearTimeout(slowHintTimer);
        if (gen !== this._layoutBPreviewGeneration) return;
        if (!lbBlob) {
          throw new Error('Layout B story preview blob was empty');
        }
        this._layoutBStoryPreviewShareBlob = lbBlob;
        const url = URL.createObjectURL(lbBlob);
        this._revokeLayoutBPreviewObjectUrl();
        this._layoutBPreviewObjectUrl = url;
        if (preloadedSpeakerImageUrl && expectsCutout) {
          this._layoutBStoryPreviewSpeakerPaintUrl = paintUrl;
        }

        const applyReady = () => {
          if (gen !== this._layoutBPreviewGeneration) return;
          const needsSpeakerUpgrade =
            String(previewContentKey || '').endsWith('|0') &&
            /speaker-cutouts(?:%2F|\/)/i.test(
              this._layoutBStoryPreviewSpeakerPaintUrl || paintUrl || ''
            );
          this._layoutBStoryPreviewHeavyDoneThisVisit = true;
          this._layoutBStoryPreviewContentKey = previewContentKey;
          this._layoutBStoryPreviewSatisfiedForDateKey = dk;
          if (String(previewContentKey || '').endsWith('|1')) {
            this._layoutBStoryPreviewSpeakerUpgradeDone = true;
          }
          wrap.setAttribute('aria-busy', 'false');
          if (hint) {
            hint.textContent = '';
            hint.hidden = true;
          }
          img.hidden = false;
          if (needsSpeakerUpgrade && !this._layoutBStoryPreviewSpeakerUpgradeDone) {
            this._layoutBStoryPreviewSpeakerUpgradeDone = true;
            this._layoutBStoryPreviewHeavyDoneThisVisit = false;
            queueMicrotask(() => this.scheduleLayoutBStoryPreviewRefresh({ force: true }));
          }
        };

        img.src = url;
        if (img.complete && img.naturalWidth > 0) {
          applyReady();
        } else {
          img.onload = () => applyReady();
          img.onerror = () => {
            if (gen !== this._layoutBPreviewGeneration) return;
            this._layoutBStoryPreviewShareBlob = null;
            wrap.setAttribute('aria-busy', 'false');
            if (hint) {
              hint.hidden = false;
              hint.textContent = 'Preview could not be displayed.';
            }
            this.logger.warn('Layout B preview image failed to load');
          };
          /** WKWebView often skips onload for large blob: URLs — trust the compose blob. */
          setTimeout(() => {
            if (gen !== this._layoutBPreviewGeneration) return;
            if (wrap.getAttribute('aria-busy') !== 'true') return;
            applyReady();
          }, 1800);
        }
      } catch (error) {
        if (gen !== this._layoutBPreviewGeneration) return;
        this._layoutBStoryPreviewShareBlob = null;
        this.logger.warn('Layout B story preview failed:', error);
        wrap.setAttribute('aria-busy', 'false');
        if (hint) {
          hint.hidden = false;
          hint.textContent = 'Preview unavailable.';
        }
      }
    }

    ensureQuiltFits() {
      if (!this.quiltEngine.blocks || this.quiltEngine.blocks.length === 0) return;
      
      const hasVisualViewport = window.visualViewport && window.visualViewport.width > 0;
      const availableWidth = hasVisualViewport ? window.visualViewport.width : window.innerWidth;
      const availableHeight = hasVisualViewport ? window.visualViewport.height : window.innerHeight;
      
      const minX = Math.min(...this.quiltEngine.blocks.map(b => b.x));
      const minY = Math.min(...this.quiltEngine.blocks.map(b => b.y));
      const maxX = Math.max(...this.quiltEngine.blocks.map(b => b.x + b.width));
      const maxY = Math.max(...this.quiltEngine.blocks.map(b => b.y + b.height));
      
      const currentWidth = maxX - minX;
      const currentHeight = maxY - minY;
      
      const scaleX = availableWidth / currentWidth;
      const scaleY = availableHeight / currentHeight;
      const optimalScale = Math.min(scaleX, scaleY, 1);
      
      this.quiltScale = optimalScale;
    }

    updateSquareCounter() {
      if (!this._isPersonalQuiltMode && !this._liveDailyDataConfirmed) {
        return;
      }
      const count =
        this._isPersonalQuiltMode && Array.isArray(this._personalQuiltState?.blocks)
          ? this._personalQuiltState.blocks.length
          : this.quiltEngine.blocks.length;
      const formatCounterCount = (value) => {
        const safe = Math.max(0, Number(value) || 0);
        return safe >= 1000 ? String(safe) : String(safe).padStart(3, '0');
      };
      const counterElement = document.getElementById('squareCounter');
      if (counterElement) {
        console.log('🔢 Counter update - blocks.length:', count);
        counterElement.textContent = formatCounterCount(count);
      }
      if (!this._portalQuiltLoaded) {
        return;
      }
      const joinOuter = document.getElementById('portalJoinLineOuter');
      if (this._isPortalFirstVisit()) {
        this._applyPortalFirstVisitJoinContent();
      }
      const joinLine = document.getElementById('portalJoinLine');
      if (joinLine && joinOuter) {
        const others = Math.max(0, count - 1);
        if (others > 0) {
          this._ensurePortalJoinLineShell();
          const middle = document.getElementById('portalJoinMiddle');
          if (middle) {
            middle.removeAttribute('aria-hidden');
            middle.removeAttribute('aria-busy');
            middle.textContent = String(others);
          }
        } else {
          joinLine.className = 'portal-join-line portal-join-line--solo';
          joinLine.textContent = "You're among the first today.";
        }
        const wasAwaiting = joinOuter.classList.contains('portal-join-line-outer--awaiting');
        if (wasAwaiting) {
          this._revealPortalJoinLineOuter();
        }
        if (wasAwaiting && this._portalSplashDismissed) {
          this._schedulePortalIntroFadeIfNeeded();
        }
      }
    }

    /**
     * Paint quilt quote card + speaker stage without waiting for idle `renderQuilt()`.
     * Avoids the quote card appearing first and the large speaker name popping in later.
     */
    async _primeQuiltQuoteChrome() {
      if (this._isPersonalQuiltMode) return;
      if (!this._liveDailyDataConfirmed && !this.isAdminTomorrowPreviewActive()) return;
      const dateKey = this.getEffectiveAppDateKey();
      let todayQ = this.isAdminTomorrowPreviewActive()
        ? this.getEffectiveQuiltQuote()
        : (dateKey &&
          this.quoteService &&
          typeof this.quoteService.getQuoteResolvedForInstagramDateKey === 'function'
            ? await this.quoteService.getQuoteResolvedForInstagramDateKey(dateKey)
            : null) || this.quoteService?.getTodayQuote?.();
      if (!todayQ) return;
      const mood = this.quoteService?._moodLinesFromQuote?.(todayQ) || { goodDay: '', roughDay: '' };
      if (dateKey && (!mood.goodDay || !mood.roughDay) && this.quoteService?.hydrateMoodFieldsForCalendarKey) {
        todayQ =
          (await this.quoteService.hydrateMoodFieldsForCalendarKey(dateKey, todayQ)) || todayQ;
      }
      const freshness = dateKey ? await this._readNightlyClippingFreshness(dateKey) : null;
      this.populateQuiltQuote();
      await this.applyQuoteScreenClipping({
        dateKey,
        quote: todayQ,
        forceRefresh:
          !!freshness?.assignmentNewerThanClippingMeta || !!this.isAdminTomorrowPreviewActive?.()
      });
      this.refreshQuoteSpeakerWidget(todayQ);
      this.refreshQuiltMoodWidget(todayQ);
      this.refreshQuiltReflectionScrapWidget?.(todayQ);
    }

    _quiltNewspaperClippingA11yText(quote) {
      const text = String(quote?.text ?? quote?.body ?? '').trim();
      const author = String(quote?.author ?? '').trim();
      if (!text) return '';
      return author ? `${text} — ${author}` : text;
    }

    async fetchMoodClippingUrl(dateKey, variant = 'good') {
      const dk = String(dateKey || this.getEffectiveAppDateKey?.() || '').trim();
      const v = String(variant || 'good').toLowerCase() === 'rough' ? 'rough' : 'good';
      if (!dk || !window.db || !window.firestore) return null;
      if (!this._moodClippingUrlCache) this._moodClippingUrlCache = {};
      const moodVer = Number(globalThis.QuiltMoodClipping?.MOOD_COMPOSER_VERSION ?? 0);
      const cacheKey = `${dk}:${v}:v${moodVer}`;
      if (this._moodClippingUrlCache[cacheKey]) return this._moodClippingUrlCache[cacheKey];
      try {
        const ref = window.firestore.doc(window.db, 'instagram-images', dk);
        const snap = await window.firestore.getDoc(ref);
        const data = snap.exists() ? snap.data() || {} : {};
        const storedVer = Number(data.moodClippingComposerVersion ?? 0);
        if (moodVer > 0 && storedVer < moodVer) {
          return null;
        }
        const url = String(
          v === 'rough'
            ? data.moodClippingRoughUrl ||
                data.moodClippingRoughImageStorageUrl ||
                ''
            : data.moodClippingGoodUrl ||
                data.moodClippingGoodImageStorageUrl ||
                ''
        ).trim();
        if (url) this._moodClippingUrlCache[cacheKey] = url;
        return url || null;
      } catch (e) {
        this.logger.warn('fetchMoodClippingUrl:', e?.message || e);
        return null;
      }
    }

    _moodClippingA11yLabel(line) {
      const body = String(line || '').replace(/\s+/g, ' ').trim();
      return body ? Utils.formatMoodReceiptBody(body) : '';
    }

    /** Stretch mood PNG to the quote clipping’s laid-out width (grid was shrink-wrapping cards). */
    _syncMoodClippingWidthToQuote(img, card) {
      const quoteImg = document.querySelector('.quilt-quote-clipping__image');
      const quoteMissing = !quoteImg?.src || quoteImg.naturalWidth <= 0;
      const rect = quoteImg?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const w = Math.round(rect.width || 0);
      const h = Math.round(rect.height || 0);
      const host = card || img?.closest?.('.quilt-mood-widget__card');
      if (host) {
        host.style.removeProperty('width');
        host.style.removeProperty('max-width');
      }
      if (img) {
        if (!quoteMissing && w >= 48) {
          img.style.width = `${w}px`;
          img.style.maxWidth = 'none';
          img.style.height = h > 0 ? 'auto' : '';
        } else {
          img.style.removeProperty('width');
          img.style.removeProperty('max-width');
          img.style.removeProperty('height');
        }
      }
      const moodNatW = img?.naturalWidth ?? 0;
      const moodNatH = img?.naturalHeight ?? 0;
      const moodRect = img?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const cardRect = host?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const stack = document.querySelector('.quote-card-stack');
      const sheetResolved = stack
        ? getComputedStyle(stack).getPropertyValue('--quilt-float-sheet-width').trim()
        : '';
    }

    async _loadMoodClippingOntoCard(card, img, { src, line, mood }) {
      if (!card || !img) return false;
      const clearPng = () => {
        card.classList.remove('quilt-mood-widget__card--has-png');
        img.hidden = true;
        img.removeAttribute('src');
      };
      const showPng = () => {
        card.classList.remove('quilt-mood-widget__card--text-fallback');
        card.classList.add('quilt-mood-widget__card--has-png');
        img.hidden = false;
        this._syncMoodClippingWidthToQuote(img, card);
        const label = this._moodClippingA11yLabel(line);
        if (label) card.setAttribute('aria-label', label);
      };
      if (!src) {
        clearPng();
        return false;
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          if (ok) showPng();
          else clearPng();
          resolve(ok);
        };
        img.onload = () => {
          finish(img.naturalWidth > 0);
        };
        img.onerror = () => finish(false);
        if (img.src === src && img.complete && img.naturalWidth > 0) {
          showPng();
          resolve(true);
          return;
        }
        img.src = src;
        if (img.complete) finish(img.naturalWidth > 0);
      });
    }

    async applyQuiltMoodClippings({ dateKey = null, quote = null } = {}) {
      if (this._quiltMoodSpreadIsLive()) {
        return;
      }
      const moodHost = document.getElementById('quiltMoodWidget');
      if (
        this._quiltMoodTerminalUiEnabled() &&
        moodHost?.classList.contains('quilt-mood-terminal-host') &&
        this._quiltMoodTerminalEnabled()
      ) {
        return;
      }

      const widget = document.getElementById('quiltMoodWidget');
      if (!widget || widget.hasAttribute('hidden')) return;
      if (this._isPersonalQuiltMode) return;

      const applyGen = ++this._moodClippingApplyGeneration;
      const dk = dateKey || this.quoteService?.getQuoteCalendarKeyNow?.();
      let todayQ =
        quote ||
        this.quoteService?.getTodayQuote?.() ||
        null;
      if (dk && todayQ && this.quoteService?.hydrateMoodFieldsForCalendarKey) {
        try {
          todayQ =
            (await this.quoteService.hydrateMoodFieldsForCalendarKey(dk, todayQ)) || todayQ;
        } catch (e) {
          this.logger.warn('applyQuiltMoodClippings hydrate:', e?.message || e);
        }
      }
      if (applyGen !== this._moodClippingApplyGeneration) return;

      const moods = this.quoteService?._moodLinesFromQuote?.(todayQ || {}) || {
        goodDay: '',
        roughDay: ''
      };
      const goodLine = String(moods.goodDay || widget.dataset.goodDay || '').trim();
      const roughLine = String(moods.roughDay || widget.dataset.roughDay || '').trim();

      const applyVariant = async (variant, line) => {
        const card = widget.querySelector(`.quilt-mood-widget__card--${variant}`);
        const img = card?.querySelector('.quilt-mood-widget__mood-clipping__image');
        const textEl = widget.querySelector(
          `.quilt-mood-widget__mood-text[data-mood-text="${variant}"]`
        );
        if (textEl) textEl.textContent = this._moodClippingA11yLabel(line);
        if (!card || !img || !line) {
          if (card) {
            card.classList.remove('quilt-mood-widget__card--has-png', 'quilt-mood-widget__card--text-fallback');
          }
          return;
        }

        card.classList.remove('quilt-mood-widget__card--has-png', 'quilt-mood-widget__card--text-fallback');

        const url = dk ? await this.fetchMoodClippingUrl(dk, variant) : null;
        if (applyGen !== this._moodClippingApplyGeneration) return;
        if (url && (await this._loadMoodClippingOntoCard(card, img, { src: url, line, mood: variant }))) {
          return;
        }

        try {
          const arch = this.archiveService;
          if (typeof arch?.generateMoodClippingImageData !== 'function') {
            this.logger.warn('generateMoodClippingImageData missing on archiveService');
          } else if (!globalThis.QuiltMoodClipping?.composeMoodDataUrl) {
            this.logger.warn('QuiltMoodClipping script missing — cannot compose mood PNG in browser');
          } else {
            let quoteH = 0;
            let quoteW = 0;
            if (typeof arch._measureDataUrlSizePx === 'function') {
              const quoteImg = document.querySelector('.quilt-quote-clipping__image');
              if (quoteImg?.src && quoteImg.naturalWidth > 0) {
                quoteW = quoteImg.naturalWidth;
                quoteH = quoteImg.naturalHeight;
              } else if (dk) {
                const quoteUrl = await this.fetchNewspaperClippingUrl(dk);
                if (applyGen !== this._moodClippingApplyGeneration) return;
                const size = quoteUrl ? await this._measureRemoteImageUrlPx(quoteUrl) : null;
                quoteW = size?.w ?? 0;
                quoteH = size?.h ?? 0;
              }
            }
            const dataUrl = await arch.generateMoodClippingImageData(dk, {
              variant,
              quoteClippingHeightPx: quoteH,
              quoteClippingWidthPx: quoteW
            });
            if (applyGen !== this._moodClippingApplyGeneration) return;
            if (dataUrl && (await this._loadMoodClippingOntoCard(card, img, { src: dataUrl, line, mood: variant }))) {
              return;
            }
          }
        } catch (e) {
          this.logger.warn(`Client mood clipping compose (${variant}) failed:`, e?.message || e);
        }

        if (applyGen !== this._moodClippingApplyGeneration) return;
        card.classList.remove('quilt-mood-widget__card--has-png');
        card.classList.add('quilt-mood-widget__card--text-fallback');
        img.hidden = true;
        img.removeAttribute('src');
      };

      await Promise.all([
        goodLine ? applyVariant('good', goodLine) : Promise.resolve(),
        roughLine ? applyVariant('rough', roughLine) : Promise.resolve()
      ]);
      requestAnimationFrame(() => {
        widget
          .querySelectorAll('.quilt-mood-widget__card--has-png .quilt-mood-widget__mood-clipping__image')
          .forEach((imgEl) => {
            this._syncMoodClippingWidthToQuote(
              imgEl,
              imgEl.closest('.quilt-mood-widget__card')
            );
          });
      });
    }

    /** Remote PNG natural size (nightly Storage clipping probe). */
    _measureRemoteImageUrlPx(url) {
      const src = String(url || '').trim();
      if (!src) return Promise.resolve(null);
      return new Promise((resolve) => {
        const img = new Image();
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          if (ok && img.naturalWidth > 0 && img.naturalHeight > 0) {
            resolve({ w: img.naturalWidth, h: img.naturalHeight });
          } else {
            resolve(null);
          }
        };
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        img.src = src;
        if (img.complete) finish(img.naturalWidth > 0);
      });
    }

    async fetchNewspaperClippingMeta(dateKey, { forceRefresh = false, waitForFirebaseMs = 5000 } = {}) {
      const dk = String(dateKey || this.quoteService?.getQuoteCalendarKeyNow?.() || '').trim();
      if (!dk) {
        console.warn('[our-daily] fetchNewspaperClippingMeta: missing dateKey');
        return { url: null, exportRev: '' };
      }
      if (!window.db || !window.firestore) {
        const waitMs = Math.max(0, Number(waitForFirebaseMs) || 0);
        if (waitMs > 0 && globalThis.LiveDailyDataSync?.waitForFirebaseReady) {
          await globalThis.LiveDailyDataSync.waitForFirebaseReady(waitMs);
        }
      }
      if (!window.db || !window.firestore) {
        console.warn('[our-daily] fetchNewspaperClippingMeta: Firebase not ready');
        return { url: null, exportRev: '' };
      }
      if (!this._newspaperClippingMetaCache) this._newspaperClippingMetaCache = {};
      if (forceRefresh) {
        Object.keys(this._newspaperClippingMetaCache).forEach((key) => {
          if (key === dk || key.startsWith(`${dk}:`)) delete this._newspaperClippingMetaCache[key];
        });
        if (this._newspaperClippingUrlCache) {
          Object.keys(this._newspaperClippingUrlCache).forEach((key) => {
            if (key === dk || key.startsWith(`${dk}:`)) delete this._newspaperClippingUrlCache[key];
          });
        }
      }
      try {
        const ref = window.firestore.doc(window.db, 'instagram-images', dk);
        const snap = await window.firestore.getDoc(ref);
        if (!firestoreSnapExists(snap)) {
          console.warn(`[our-daily] fetchNewspaperClippingMeta: no instagram-images/${dk} doc`);
          return { url: null, exportRev: '' };
        }
        const data = snap.data() || {};
        const stamp = newspaperClippingCacheStamp(data);
        const cacheKey = stamp ? `${dk}:${stamp}` : dk;
        if (!forceRefresh && this._newspaperClippingMetaCache[cacheKey]) {
          return this._newspaperClippingMetaCache[cacheKey];
        }
        const meta = {
          url: readNewspaperClippingUrlFromDoc(data) || null,
          exportRev: readNewspaperClippingExportRevFromDoc(data)
        };
        this._newspaperClippingMetaCache[cacheKey] = meta;
        if (meta.url) {
          if (!this._newspaperClippingUrlCache) this._newspaperClippingUrlCache = {};
          this._newspaperClippingUrlCache[cacheKey] = meta.url;
        }
        if (!meta.url) {
          console.warn(
            `[our-daily] fetchNewspaperClippingMeta: doc exists but no newspaperClippingUrl on instagram-images/${dk}`
          );
        }
        return meta;
      } catch (e) {
        console.warn('[our-daily] fetchNewspaperClippingMeta failed:', e?.message || e);
        return { url: null, exportRev: '' };
      }
    }

    async fetchNewspaperClippingUrl(dateKey, opts = {}) {
      const meta = await this.fetchNewspaperClippingMeta(dateKey, opts);
      return meta.url || null;
    }

    /**
     * Compare assignment vs instagram-images clipping metadata. Used for logging and client-compose
     * fallback — does not block Storage PNG (file may be replaced in place without updating generatedAt).
     */
    async _readNightlyClippingFreshness(dateKey) {
      const dk = String(dateKey || '').trim();
      if (!dk || !window.db || !window.firestore) return null;
      try {
        const fs = window.firestore;
        const [assignSnap, igSnap] = await Promise.all([
          fs.getDoc(fs.doc(window.db, 'dailyQuoteAssignments', dk)),
          fs.getDoc(fs.doc(window.db, 'instagram-images', dk))
        ]);
        if (!firestoreSnapExists(assignSnap) || !firestoreSnapExists(igSnap)) return null;
        const assignData = assignSnap.data() || {};
        const igData = igSnap.data() || {};
        const assignedAt = Date.parse(String(assignData.assignedAt || '').trim());
        const generatedAt = Date.parse(newspaperClippingCacheStamp(igData));
        const url = readNewspaperClippingUrlFromDoc(igData);
        const odqT = Date.parse(readNewspaperClippingUrlOdqT(url));
        const clippingStampMs = Math.max(
          Number.isFinite(generatedAt) ? generatedAt : 0,
          Number.isFinite(odqT) ? odqT : 0
        );
        return {
          assignedAt: Number.isFinite(assignedAt) ? assignedAt : 0,
          clippingStampMs,
          exportRev: readNewspaperClippingExportRevFromDoc(igData),
          assignmentAuthor: String(assignData.authorSnapshot || assignData.author || '').trim(),
          assignmentNewerThanClippingMeta:
            Number.isFinite(assignedAt) &&
            clippingStampMs > 0 &&
            assignedAt > clippingStampMs
        };
      } catch (_) {
        return null;
      }
    }

    async _resolveQuoteForClippingCenter(dateKey, quote = null, options = {}) {
      const dk = String(dateKey || '').trim();
      const qs = this.quoteService;
      const preferLiveAssignment = options.preferLiveAssignment === true;
      if (preferLiveAssignment && qs && dk && typeof qs.getQuoteResolvedForInstagramDateKey === 'function') {
        try {
          const live = await qs.getQuoteResolvedForInstagramDateKey(dk, { requireLive: true });
          if (live && String(live.text ?? live.body ?? '').trim()) return live;
        } catch (_) {
          /* */
        }
      }
      if (quote && String(quote.text ?? quote.body ?? '').trim()) {
        return quote;
      }
      if (qs && dk && typeof qs.getQuoteResolvedForInstagramDateKey === 'function') {
        try {
          const live = await qs.getQuoteResolvedForInstagramDateKey(dk, { requireLive: true });
          if (live && String(live.text ?? live.body ?? '').trim()) return live;
        } catch (_) {
          /* */
        }
      }
      return quote || qs?.getTodayQuote?.() || null;
    }

    /** HTTP Storage PNG already decoded for this dateKey (quote screen or triptych). */
    _reuseLoadedNewspaperClippingSrc(dateKey = '') {
      const dk = String(dateKey || '').trim();
      if (!dk) return null;
      const isHttp = (src) => /^https?:\/\//i.test(String(src || '').trim());
      const loadedHttpSrc = (img) => {
        if (!img) return null;
        const src = String(img.currentSrc || img.src || '').trim();
        if (!isHttp(src) || !(img.naturalWidth > 0 && img.naturalHeight > 0)) return null;
        return src;
      };

      if (this._quoteScreenClippingMountedKey === dk) {
        const src = loadedHttpSrc(
          document.querySelector('#screen-quote .quote-screen-clipping__image')
        );
        if (src) return src;
      }

      const spreadHost = document.getElementById('quiltMoodSpread');
      if (spreadHost?.dataset?.moodSpreadDateKey === dk) {
        const src = loadedHttpSrc(
          spreadHost.querySelector('.quilt-mood-triptych__quote-img')
        );
        if (src) return src;
      }

      return null;
    }

    async _waitForQuoteScreenClippingInflight(maxMs = 3500) {
      if (!this._quoteScreenClippingInflight) return;
      await Promise.race([
        this._quoteScreenClippingInflight.catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(maxMs) || 0)))
      ]);
    }

    /** Nightly Storage PNG — single source of truth for quote + triptych clippings. */
    async resolveNightlyNewspaperClippingUrl(dateKey, opts = {}) {
      const dk = String(dateKey || '').trim();
      const url = await this.fetchNewspaperClippingUrl(dateKey, opts);
      if (!url) return null;
      let meta = { exportRev: '' };
      if (dk) {
        try {
          meta = await this.fetchNewspaperClippingMeta(dk, opts);
        } catch (_) {
          /* */
        }
      }
      if (isStoredClippingExportStale(meta?.exportRev)) {
        console.info(
          `[our-daily] Nightly clipping PNG rev ${meta.exportRev} < bundled ${globalThis.QuiltNewspaperClipping?.CLIPPING_EXPORT_REV}; using Storage PNG`
        );
      }
      const rev =
        meta?.exportRev ||
        readNewspaperClippingUrlOdqT(url) ||
        '';
      const busted = withNewspaperClippingBrowserCacheBust(url, rev || Date.now());
      if (await this._probeRemoteImageUrl(busted)) {
        this._preloadQuoteScreenClippingUrl(busted);
        return busted;
      }
      if (busted !== url && (await this._probeRemoteImageUrl(url))) {
        this._preloadQuoteScreenClippingUrl(url);
        return url;
      }
      return null;
    }

    /** Swap triptych (and quote screen preload) to nightly PNG after client compose fallback. */
    async _upgradeTriptychQuoteToNightlyClipping(dk, goodDay, roughDay) {
      const spreadHost = document.getElementById('quiltMoodSpread');
      const img = spreadHost?.querySelector('.quilt-mood-triptych__quote-img');
      if (!spreadHost?._moodTriptychWidget || !img) return false;
      const src = String(img.currentSrc || img.src || '').trim();
      if (!src.startsWith('data:')) return false;
      const storageUrl = await this.resolveNightlyNewspaperClippingUrl(dk, {
        forceRefresh: true,
        waitForFirebaseMs: 8000
      });
      if (!storageUrl) return false;
      img.src = storageUrl;
      spreadHost._moodTriptychWidget.remeasure?.();
      void this.applyQuoteScreenClipping({ dateKey: dk, forceRefresh: true });
      console.info('[our-daily] Quote clipping upgraded to nightly Storage PNG');
      return true;
    }

    /** True when a remote PNG URL decodes (Storage clipping probe). */
    _probeRemoteImageUrl(url) {
      const src = String(url || '').trim();
      if (!src) return Promise.resolve(false);
      return new Promise((resolve) => {
        const img = new Image();
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          resolve(!!ok);
        };
        img.onload = () => finish(img.naturalWidth > 0);
        img.onerror = () => finish(false);
        img.src = src;
        if (img.complete) finish(img.naturalWidth > 0);
      });
    }

    async _composeQuiltNewspaperClippingDataUrl(dateKey, todayQ) {
      const QNC = globalThis.QuiltNewspaperClipping;
      const composeLayout = QNC?.composeDataUrlWithLayout;
      const compose = composeLayout || QNC?.composeDataUrl;
      if (typeof compose !== 'function') return null;
      const today = todayQ || this.quoteService?.getTodayQuote?.() || null;
      const text = String(today?.text ?? today?.body ?? '').trim();
      if (!text) return null;
      const dk =
        String(dateKey || '').trim() ||
        String(today?.dateKey || '').trim() ||
        this.quoteService?.getQuoteCalendarKeyNow?.() ||
        '';
      let yesterday = null;
      let tomorrow = null;
      const qs = this.quoteService;
      if (qs && dk && typeof qs.getAdjacentQuotesForClippingDateKey === 'function') {
        try {
          const adj = await qs.getAdjacentQuotesForClippingDateKey(dk);
          yesterday = adj?.yesterday || null;
          tomorrow = adj?.tomorrow || null;
        } catch (_) {
          /* */
        }
      } else if (qs?.getAdjacentQuotesForClipping) {
        const adj = qs.getAdjacentQuotesForClipping() || {};
        yesterday = adj.yesterday || null;
        tomorrow = adj.tomorrow || null;
      }
      const payload = {
        yesterday,
        today,
        tomorrow,
        dateKey: dk,
        width: 0,
        exportDensity:
          typeof window !== 'undefined'
            ? Math.min(Math.max(window.devicePixelRatio || 2, 2), 3)
            : 2
      };
      const composed = await compose(payload);
      if (typeof composed === 'string') return composed;
      return composed?.dataUrl || null;
    }

    _quoteScreenClippingSlotEl(img) {
      if (!img?.closest?.('#screen-quote .quote-screen-clipping')) return null;
      return (
        img.closest('.quote-stage-quote') ||
        img.closest('.quote-color-combined__quote') ||
        null
      );
    }

    _quoteScreenClippingSlotUsable(slot) {
      if (!slot) return false;
      const screen = document.getElementById('screen-quote');
      if (!screen?.classList.contains('active')) return false;
      if (screen.style.display === 'none') return false;
      const cs = getComputedStyle(slot);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const pad = 10;
      const minDim = 160;
      return slot.clientWidth >= minDim + pad && slot.clientHeight >= minDim + pad;
    }

    _scheduleQuoteScreenClippingReveal() {
      if (this._quoteScreenClippingRevealRaf) return;
      const tick = (retry = 0) => {
        this._quoteScreenClippingRevealRaf = 0;
        if (!this._quoteScreenClippingRevealPending) return;
        const revealed = this.remeasureQuoteScreenClipping();
        if (!revealed && retry < 48) {
          this._quoteScreenClippingRevealRaf = requestAnimationFrame(() => tick(retry + 1));
        }
      };
      this._quoteScreenClippingRevealRaf = requestAnimationFrame(() => tick(0));
    }

    _clippingLayoutOptsForImage(img, layout = {}) {
      const QNC = globalThis.QuiltNewspaperClipping;
      if (Number(layout?.displayWidthPx) > 0) return null;
      if (img?.closest?.('#screen-quote .quote-screen-clipping')) {
        return QNC?.resolveQuoteScreenClippingLayoutOpts?.() || null;
      }
      if (img?.closest?.('.quilt-mood-triptych__quote, #quiltMoodSpread')) {
        return QNC?.resolveTriptychClippingLayoutOpts?.() || null;
      }
      return QNC?.resolveClippingLayoutOpts?.() || null;
    }

    _resolveNewspaperClippingDisplayLayout(img, layout = {}) {
      const QNC = globalThis.QuiltNewspaperClipping;
      const preset = Number(layout?.displayWidthPx);
      if (preset > 0) return layout;
      const nw = Number(img?.naturalWidth) || 0;
      const nh = Number(img?.naturalHeight) || 0;
      if (!nw || !nh || typeof QNC?.resolveQuoteClippingDisplayLayout !== 'function') {
        return layout;
      }
      const exportScale = Number(QNC.DEFAULTS?.exportScale) > 0 ? Number(QNC.DEFAULTS.exportScale) : 2;
      const defaultRenderW = Math.round(428 * exportScale);
      const renderWidth =
        Number(layout?.renderWidth) > 0 ? Number(layout.renderWidth) : defaultRenderW;
      const layoutOpts = this._clippingLayoutOptsForImage(img, layout) || {};
      return (
        QNC.resolveQuoteClippingDisplayLayout(nw, nh, renderWidth, layoutOpts) || layout
      );
    }

    _fitClippingDisplayToSlot(img, resolved = {}) {
      const nw = Number(img?.naturalWidth) || 0;
      const nh = Number(img?.naturalHeight) || 0;
      let w = Number(resolved?.displayWidthPx) || 0;
      if (!img || !nw || !nh || !w) return { widthPx: 0, heightPx: 0 };

      let h = Number(resolved?.displayHeightPx) || Math.round((nh / nw) * w);
      const slot =
        img.closest?.('.quote-color-combined__quote') ||
        img.closest?.('.quote-stage-quote') ||
        img.closest?.('.quilt-mood-triptych__quote-wrap');
      if (slot) {
        const isQuoteScreen = !!img?.closest?.('#screen-quote .quote-screen-clipping');
        if (isQuoteScreen && !this._quoteScreenClippingSlotUsable(slot)) {
          return {
            widthPx: Math.max(1, Math.round(w)),
            heightPx: Math.max(1, Math.round(h))
          };
        }
        const pad = 10;
        const maxW = Math.max(96, slot.clientWidth - pad);
        const maxH = Math.max(96, slot.clientHeight - pad);
        const scale = Math.min(maxW / w, maxH / h);
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round((nh / nw) * w));
      }
      return { widthPx: Math.max(1, Math.round(w)), heightPx: Math.max(1, Math.round(h)) };
    }

    _applyNewspaperClippingDisplaySize(img, layout) {
      if (!img) return;
      const resolved = this._resolveNewspaperClippingDisplayLayout(img, layout || {});
      const fit = this._fitClippingDisplayToSlot(img, resolved);
      const w = Number(fit.widthPx) || Number(resolved?.displayWidthPx);
      const h = Number(fit.heightPx);
      if (w > 0) {
        img.style.width = `${Math.round(w)}px`;
        img.style.maxWidth = '100%';
        if (h > 0) {
          img.style.height = `${Math.round(h)}px`;
          img.style.maxHeight = '100%';
        } else {
          img.style.height = 'auto';
          img.style.removeProperty('max-height');
        }
        return;
      }
      img.style.removeProperty('width');
      img.style.removeProperty('height');
      img.style.removeProperty('max-height');
    }

    remeasureQuoteScreenClipping() {
      const img = document.querySelector('#screen-quote .quote-screen-clipping__image');
      const clipping = document.querySelector('#screen-quote .quote-screen-clipping');
      if (!img || !clipping || !(img.naturalWidth > 0)) return false;

      const renderWidth = Number(img.dataset.quoteRenderWidth) || 0;
      this._applyNewspaperClippingDisplaySize(img, renderWidth > 0 ? { renderWidth } : {});

      const needsReveal =
        this._quoteScreenClippingRevealPending ||
        !clipping.classList.contains('quote-screen-clipping--ready');
      if (!needsReveal) return true;

      const slot = this._quoteScreenClippingSlotEl(img);
      if (!this._quoteScreenClippingSlotUsable(slot)) return false;

      clipping.classList.add('quote-screen-clipping--has-png', 'quote-screen-clipping--ready');
      img.hidden = false;
      this._quoteScreenClippingRevealPending = false;
      if (document.getElementById('screen-quote')?.classList.contains('active')) {
        window.app?.notifyQuoteScreenLayoutBPainted?.();
      }
      return true;
    }

    async _composeQuiltNewspaperClippingLayout(dateKey, todayQ, options = {}) {
      const QNC = globalThis.QuiltNewspaperClipping;
      if (typeof QNC?.composeDataUrlWithLayout !== 'function') {
        const dataUrl = await this._composeQuiltNewspaperClippingDataUrl(dateKey, todayQ);
        return dataUrl ? { dataUrl, displayWidthPx: 0 } : null;
      }
      const today = todayQ || this.quoteService?.getTodayQuote?.() || null;
      const text = String(today?.text ?? today?.body ?? '').trim();
      if (!text) return null;
      const dk =
        String(dateKey || '').trim() ||
        String(today?.dateKey || '').trim() ||
        this.quoteService?.getQuoteCalendarKeyNow?.() ||
        '';
      let yesterday = null;
      let tomorrow = null;
      const qs = this.quoteService;
      if (qs && dk && typeof qs.getAdjacentQuotesForClippingDateKey === 'function') {
        try {
          const adj = await qs.getAdjacentQuotesForClippingDateKey(dk);
          yesterday = adj?.yesterday || null;
          tomorrow = adj?.tomorrow || null;
        } catch (_) {
          /* */
        }
      } else if (qs?.getAdjacentQuotesForClipping) {
        const adj = qs.getAdjacentQuotesForClipping() || {};
        yesterday = adj.yesterday || null;
        tomorrow = adj.tomorrow || null;
      }
      const centerOnly = options.centerOnly === true;
      return QNC.composeDataUrlWithLayout({
        yesterday: centerOnly ? null : yesterday,
        today,
        tomorrow: centerOnly ? null : tomorrow,
        dateKey: dk,
        width: 0,
        cropHorizontalBleedDomPx: 0,
        layoutProfile: 'triptych',
        centerOnly,
        exportDensity:
          typeof window !== 'undefined'
            ? Math.min(Math.max(window.devicePixelRatio || 2, 2), 3)
            : 2
      });
    }

    async applyQuoteScreenClipping({ dateKey = null, quote = null, forceRefresh = false } = {}) {
      if (this._quoteScreenClippingInflight && !forceRefresh) {
        return this._quoteScreenClippingInflight;
      }
      const work = this._applyQuoteScreenClippingWork({ dateKey, quote, forceRefresh });
      this._quoteScreenClippingInflight = work;
      try {
        return await work;
      } finally {
        if (this._quoteScreenClippingInflight === work) {
          this._quoteScreenClippingInflight = null;
        }
      }
    }

    _preloadQuoteScreenClippingUrl(url) {
      const href = String(url || '').trim();
      if (!href || href.startsWith('data:') || href.startsWith('blob:')) return;
      let absolute = href;
      try {
        const parsed = new URL(href, typeof location !== 'undefined' ? location.href : undefined);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
        absolute = parsed.href;
      } catch (_) {
        return;
      }
      const key = `quote-clipping:${absolute}`;
      if (this._quoteScreenClippingPreloadKey === key) return;
      if (!/^https?:\/\//i.test(absolute)) return;
      this._quoteScreenClippingPreloadKey = key;
      let link = document.querySelector('link[data-quote-screen-clipping-preload]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.setAttribute('data-quote-screen-clipping-preload', '1');
        document.head.appendChild(link);
      }
      link.href = absolute;
    }

    async _applyQuoteScreenClippingWork({ dateKey = null, quote = null, forceRefresh = false } = {}) {
      const clipping = document.querySelector('#screen-quote .quote-screen-clipping');
      const img = document.querySelector('#screen-quote .quote-screen-clipping__image');
      const a11y = document.querySelector('#screen-quote .quote-screen-clipping__a11y');
      const fallback = document.querySelector('#screen-quote .quote-screen-clipping__fallback');
      const fallbackText = document.querySelector('#screen-quote .quote-screen-clipping__text');
      const fallbackAuthor = document.querySelector('#screen-quote .quote-screen-clipping__author');
      if (!clipping) return false;

      const dk = String(dateKey || this.quoteService?.getQuoteCalendarKeyNow?.() || '').trim();
      const clippingMeta = dk
        ? await this.fetchNewspaperClippingMeta(dk, { forceRefresh, waitForFirebaseMs: 8000 })
        : { url: '', exportRev: '' };
      const freshness = dk ? await this._readNightlyClippingFreshness(dk) : null;
      const skipForStaleExport = isStoredClippingExportStale(clippingMeta.exportRev);
      const skipForAssignment = !!freshness?.assignmentNewerThanClippingMeta;
      const skipStoragePng = false;
      if (skipForStaleExport) {
        console.info(
          `[our-daily] Quote clipping: Storage rev ${clippingMeta.exportRev || '?'} < bundled ${globalThis.QuiltNewspaperClipping?.CLIPPING_EXPORT_REV}; using Storage PNG`
        );
      }
      if (skipForAssignment) {
        console.info(
          '[our-daily] Quote clipping: assignment newer than clipping meta; still using nightly Storage PNG when available'
        );
      }
      let todayQ = await this._resolveQuoteForClippingCenter(dk, quote, {
        preferLiveAssignment: skipForAssignment || skipForStaleExport
      });
      if (!todayQ) {
        todayQ =
          this.quoteService?.getTodayQuote?.() ||
          this.quoteService?.getQuoteScreenPreviewContent?.()?.activeQuote ||
          null;
      }
      const a11yText = this._quiltNewspaperClippingA11yText(todayQ);
      if (a11y) a11y.textContent = a11yText;
      if (a11yText) clipping.setAttribute('aria-label', a11yText);

      const quoteCard = document.querySelector('#screen-quote .quote-card');
      const urlStamp =
        readNewspaperClippingUrlOdqT(clippingMeta.url) ||
        String(clippingMeta.exportRev || '').trim();
      const imgUsesClientCompose = isRemoteNewspaperClippingUrl(img?.currentSrc || img?.src)
        ? false
        : String(img?.currentSrc || img?.src || '').startsWith('data:');
      if (
        !forceRefresh &&
        dk &&
        this._quoteScreenClippingMountedKey === dk &&
        urlStamp &&
        this._quoteScreenClippingUrlStamp === urlStamp &&
        !imgUsesClientCompose &&
        img?.naturalWidth > 0
      ) {
        if (this.quoteService?._quoteScreenClippingReady?.(quoteCard)) return true;
        this._quoteScreenClippingRevealPending = true;
        this._scheduleQuoteScreenClippingReveal();
        return true;
      }
      if (urlStamp && this._quoteScreenClippingUrlStamp && this._quoteScreenClippingUrlStamp !== urlStamp) {
        forceRefresh = true;
      }
      if (imgUsesClientCompose && clippingMeta.url) {
        forceRefresh = true;
      }

      const clearPng = () => {
        this._quoteScreenClippingMountedKey = '';
        this._quoteScreenClippingUrlStamp = '';
        this._quoteScreenClippingRevealPending = false;
        if (this._quoteScreenClippingRevealRaf) {
          cancelAnimationFrame(this._quoteScreenClippingRevealRaf);
          this._quoteScreenClippingRevealRaf = 0;
        }
        clipping.classList.remove('quote-screen-clipping--has-png', 'quote-screen-clipping--ready');
        if (img) {
          img.hidden = true;
          img.removeAttribute('src');
          img.style.removeProperty('width');
          img.style.removeProperty('height');
        }
      };

      const showTextFallback = () => {
        clearPng();
        const body = String(todayQ?.text ?? todayQ?.body ?? '').trim();
        const author = String(todayQ?.author ?? '').trim();
        if (!body) return false;
        if (fallbackText) {
          fallbackText.innerHTML = this.quoteService?.formatQuoteLineForDisplay
            ? this.quoteService.formatQuoteLineForDisplay(body)
            : body;
        }
        if (fallbackAuthor) fallbackAuthor.textContent = author;
        if (fallback) {
          fallback.hidden = false;
          fallback.removeAttribute('aria-hidden');
        }
        this._quoteScreenClippingMountedKey = dk;
        clipping.classList.add('quote-screen-clipping--ready');
        if (document.getElementById('screen-quote')?.classList.contains('active')) {
          window.app?.notifyQuoteScreenLayoutBPainted?.();
        }
        return true;
      };

      if (!img) {
        return showTextFallback();
      }

      const showPng = async (layoutMeta = null, stamp = '') => {
        if (fallback) {
          fallback.hidden = true;
          fallback.setAttribute('aria-hidden', 'true');
        }
        if (typeof img.decode === 'function') {
          try {
            await img.decode();
          } catch (_) {
            /* decode optional */
          }
        }
        if (Number(layoutMeta?.renderWidth) > 0) {
          img.dataset.quoteRenderWidth = String(Math.round(layoutMeta.renderWidth));
        }
        this._quoteScreenClippingMountedKey = dk;
        if (stamp) this._quoteScreenClippingUrlStamp = stamp;
        this._applyNewspaperClippingDisplaySize(
          img,
          Number(layoutMeta?.renderWidth) > 0
            ? { renderWidth: layoutMeta.renderWidth }
            : layoutMeta || {}
        );
        const slot = this._quoteScreenClippingSlotEl(img);
        if (!this._quoteScreenClippingSlotUsable(slot)) {
          this._quoteScreenClippingRevealPending = true;
          this._scheduleQuoteScreenClippingReveal();
          return;
        }
        clipping.classList.add('quote-screen-clipping--has-png', 'quote-screen-clipping--ready');
        img.hidden = false;
        this._quoteScreenClippingRevealPending = false;
        if (document.getElementById('screen-quote')?.classList.contains('active')) {
          window.app?.notifyQuoteScreenLayoutBPainted?.();
        }
      };

      const loadClippingSrc = (src, layout, stamp = '') =>
        new Promise((resolve) => {
          if (!src) {
            resolve(false);
            return;
          }
          let resolvedSrc = String(src);
          if (isRemoteNewspaperClippingUrl(resolvedSrc)) {
            resolvedSrc = withNewspaperClippingBrowserCacheBust(
              resolvedSrc,
              stamp || clippingMeta.exportRev || urlStamp || Date.now()
            );
          } else if (
            !forceRefresh &&
            img.src === resolvedSrc &&
            img.naturalWidth > 0
          ) {
            void showPng(layout, stamp).then(() => resolve(true));
            return;
          }
          this._preloadQuoteScreenClippingUrl(resolvedSrc);
          let settled = false;
          const finish = (ok) => {
            if (settled) return;
            settled = true;
            if (ok) {
              void showPng(layout, stamp).then(() => resolve(true));
              return;
            }
            clearPng();
            resolve(false);
          };
          img.onload = () => finish(img.naturalWidth > 0);
          img.onerror = () => finish(false);
          img.src = resolvedSrc;
          if (img.complete) finish(img.naturalWidth > 0);
        });

      if (forceRefresh && dk) {
        await this.fetchNewspaperClippingMeta(dk, { forceRefresh: true, waitForFirebaseMs: 4000 });
      }

      const url =
        !skipStoragePng && dk
          ? (await this.resolveNightlyNewspaperClippingUrl(dk, {
              forceRefresh,
              waitForFirebaseMs: 8000
            })) ||
            clippingMeta.url ||
            (await this.fetchNewspaperClippingUrl(dk))
          : null;
      if (url && (await loadClippingSrc(url, null, urlStamp))) {
        return true;
      }

      if (skipStoragePng) {
        todayQ =
          (await this._resolveQuoteForClippingCenter(dk, todayQ, { preferLiveAssignment: true })) ||
          todayQ;
      }

      try {
        const composed = await this._composeQuiltNewspaperClippingLayout(dk, todayQ, {
          centerOnly: skipForAssignment && !skipForStaleExport
        });
        if (composed?.dataUrl && (await loadClippingSrc(composed.dataUrl, composed))) {
          return true;
        }
      } catch (e) {
        this.logger.warn('Quote screen clipping compose failed:', e?.message || e);
      }

      return showTextFallback();
    }

    async applyQuiltNewspaperClipping({ dateKey = null, quote = null } = {}) {
      if (this._quiltMoodSpreadEnabled()) {
        this._stripLegacyQuoteClippingPng();
        if (this._quiltMoodSpreadIsLive() || this._moodSpreadOwnsQuoteUi()) {
          this._clearLegacyQuoteClippingPng();
          this._markQuiltMoodSpreadQuoteUi();
        } else {
          this._showQuiltQuoteTextFallback(quote || this.quoteService?.getTodayQuote?.());
        }
        return;
      }
      if (this._quiltMoodSpreadIsLive() || this._moodSpreadOwnsQuoteUi()) {
        return;
      }
      const moodHost = document.getElementById('quiltMoodWidget');
      if (
        this._quiltMoodTerminalUiEnabled() &&
        moodHost?.classList.contains('quilt-mood-terminal-host') &&
        this._quiltMoodTerminalEnabled()
      ) {
        const dk = dateKey || this.quoteService?.getQuoteCalendarKeyNow?.();
        void this._refreshQuiltMoodTerminalQuoteClipping({ forceRefresh: true, dateKey: dk });
        return;
      }

      const clipping = document.querySelector('.quilt-quote-clipping');
      const quoteShadow = clipping?.querySelector('.quilt-quote-clipping__shadow');
      const img = document.querySelector('.quilt-quote-clipping__image');
      const a11y = document.querySelector('.quilt-quote-clipping__a11y');
      if (!clipping) return;

      const todayQ =
        quote ||
        this.quoteService?.getTodayQuote?.() ||
        null;
      const a11yText = this._quiltNewspaperClippingA11yText(todayQ);
      if (a11y) a11y.textContent = a11yText;
      if (a11yText) clipping.setAttribute('aria-label', a11yText);

      const clearPng = () => {
        clipping.classList.remove('quilt-quote-clipping--has-png');
        if (quoteShadow) quoteShadow.hidden = true;
        if (img) {
          img.hidden = true;
          img.removeAttribute('src');
          img.style.removeProperty('width');
          img.style.removeProperty('height');
        }
      };

      if (this._isPersonalQuiltMode) {
        clearPng();
        return;
      }

      const dk = dateKey || this.quoteService?.getQuoteCalendarKeyNow?.();
      const refreshScannerBedPaper = () => {
        globalThis.OdqScannerBed?.bootstrapQuiltPaper?.(document, dk);
      };

      const showTextFallback = () => {
        clearPng();
        const body = String(todayQ?.text ?? todayQ?.body ?? '').trim();
        if (!body) return;
        clipping.classList.add('has-content');
        clipping.removeAttribute('hidden');
        clipping.removeAttribute('aria-hidden');
        refreshScannerBedPaper();
      };

      if (!img) {
        showTextFallback();
        return;
      }

      const showPng = () => {
        clipping.classList.add('quilt-quote-clipping--has-png', 'has-content');
        clipping.removeAttribute('hidden');
        clipping.removeAttribute('aria-hidden');
        if (quoteShadow) quoteShadow.hidden = false;
        img.hidden = false;
        refreshScannerBedPaper();
        if (
          !this._quiltMoodSpreadEnabled?.() ||
          !this._moodSpreadOwnsQuoteUi?.()
        ) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (document.getElementById('screen-quilt')?.classList.contains('active')) {
                this.scheduleQuiltScrollCue?.(500);
              }
            });
          });
        }
      };

      const loadClippingSrc = (src, layout) =>
        new Promise((resolve) => {
          if (!src) {
            resolve(false);
            return;
          }
          if (img.src === src && img.naturalWidth > 0) {
            this._applyNewspaperClippingDisplaySize(img, layout);
            showPng();
            resolve(true);
            return;
          }
          let settled = false;
          const finish = (ok) => {
            if (settled) return;
            settled = true;
            if (ok) {
              this._applyNewspaperClippingDisplaySize(img, layout);
              showPng();
            } else clearPng();
            resolve(ok);
          };
          img.onload = () => finish(img.naturalWidth > 0);
          img.onerror = () => finish(false);
          img.src = src;
          if (img.complete) finish(img.naturalWidth > 0);
        });

      const moodAfterQuote = () => {
        void this.applyQuiltMoodClippings({ dateKey: dk, quote: todayQ }).then(() => {
          requestAnimationFrame(() => {
            document
              .querySelectorAll(
                '.quilt-mood-widget__card--has-png .quilt-mood-widget__mood-clipping__image'
              )
              .forEach((imgEl) => {
                this._syncMoodClippingWidthToQuote(
                  imgEl,
                  imgEl.closest('.quilt-mood-widget__card')
                );
              });
          });
        });
      };

      const url = dk ? await this.resolveNightlyNewspaperClippingUrl(dk) : null;
      if (url && (await loadClippingSrc(url))) {
        moodAfterQuote();
        return;
      }

      if (dk) {
        this.logger.warn(
          'Newspaper clipping nightly PNG missing or unloadable; composing in browser as fallback'
        );
      }

      try {
        const composed = await this._composeQuiltNewspaperClippingLayout(dk, todayQ);
        if (composed?.dataUrl && (await loadClippingSrc(composed.dataUrl, composed))) {
          moodAfterQuote();
          return;
        }
        if (!globalThis.QuiltNewspaperClipping?.composeDataUrl) {
          console.warn('[our-daily] QuiltNewspaperClipping.composeDataUrl missing');
        } else {
          console.warn('[our-daily] Newspaper clipping PNG compose returned empty');
        }
      } catch (e) {
        console.warn('[our-daily] Client newspaper clipping compose failed:', e?.message || e);
      }

      showTextFallback();
      moodAfterQuote();
    }

    populateQuiltQuote() {
      if (!this._isPersonalQuiltMode && !this._liveDailyDataConfirmed && !this.isAdminTomorrowPreviewActive()) {
        return;
      }
      try {
        const quiltQuoteText = document.querySelector('.quilt-quote-text');
        const quiltQuoteAuthor = document.querySelector('.quilt-quote-author');
        const quiltQuoteDisplay = document.querySelector('.quilt-quote-display');
        if (this._isPersonalQuiltMode) {
          const personalLine = 'Your personal quilt, built from colors you chose over time.';
          const personalHtml =
            typeof this.quoteService?.formatQuoteLineForQuiltDisplay === 'function'
              ? this.quoteService.formatQuoteLineForQuiltDisplay(personalLine)
              : personalLine;
          if (quiltQuoteText) {
            if (typeof this.quoteService?.formatQuoteLineForQuiltDisplay === 'function') {
              quiltQuoteText.innerHTML = personalHtml;
            } else {
              quiltQuoteText.textContent = personalLine;
            }
          }
          if (quiltQuoteAuthor) quiltQuoteAuthor.textContent = '';
          if (quiltQuoteDisplay) quiltQuoteDisplay.classList.add('has-content');
          void this.applyQuiltNewspaperClipping({ quote: { text: personalLine, author: '' } });
          this.renderQuiltContributorList();
          return;
        }

        const todayQ = this.getEffectiveQuiltQuote();

        if (quiltQuoteText) quiltQuoteText.innerHTML = this.quoteService.formatQuiltQuoteWithAuthor(todayQ?.text, todayQ?.author, todayQ);
        if (quiltQuoteAuthor) quiltQuoteAuthor.textContent = '';

        if (
          quiltQuoteDisplay &&
          this.quoteService.quiltScreenHasBodyContent(todayQ) &&
          !this._moodSpreadOwnsQuoteUi()
        ) {
          quiltQuoteDisplay.classList.add('has-content');
        }
        if (!this._quiltMoodSpreadEnabled()) {
          void this.applyQuiltNewspaperClipping({
            dateKey: this.getEffectiveAppDateKey(),
            quote: todayQ
          });
        }
        void this.applyQuiltMoodClippings({ quote: todayQ });
        this.renderQuiltContributorList();
      } catch (error) {
        this.logger.warn('Failed to populate quilt quote:', error);
      }
    }

    getCapacitorPlugin(name) {
      const cap = window.Capacitor;
      if (!cap || !name) return null;
      const fromRegistry = cap.Plugins && cap.Plugins[name];
      if (fromRegistry) return fromRegistry;
      if (typeof cap.getPlugin === 'function') {
        try {
          return cap.getPlugin(name);
        } catch (_) {
          /* ignore */
        }
      }
      return null;
    }

    getFirebaseMessagingPlugin() {
      return this.getCapacitorPlugin('FirebaseMessaging');
    }

    getLocalNotificationsPlugin() {
      return this.getCapacitorPlugin('LocalNotifications');
    }

    getPushPlatform() {
      try {
        if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function') {
          return window.Capacitor.getPlatform();
        }
      } catch (_) {
        /* ignore */
      }
      return /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'web';
    }

    isNotificationPermissionPromptable(status) {
      return !status || status === 'prompt' || status === 'prompt-with-rationale';
    }

    getDailyQuotePreferredHour() {
      const stored = localStorage.getItem('ourDailyDailyQuotePreferredHour');
      const n = Number(stored);
      if (Number.isFinite(n) && n >= 0 && n <= 23) return Math.floor(n);
      return 8;
    }

    setDailyQuotePreferredHour(hour) {
      const h = Math.max(0, Math.min(23, Math.floor(Number(hour) || 8)));
      localStorage.setItem('ourDailyDailyQuotePreferredHour', String(h));
      return h;
    }

    formatDailyQuotePreferredHourLabel(hour) {
      const d = new Date();
      d.setHours(Math.max(0, Math.min(23, Math.floor(Number(hour) || 0))), 0, 0, 0);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    ensureSettingsDailyQuoteHourOptions() {
      const select = document.getElementById('settingsDailyQuoteHourSelect');
      if (!select || select.options.length > 0) return;
      for (let hour = 0; hour < 24; hour += 1) {
        const option = document.createElement('option');
        option.value = String(hour);
        option.textContent = this.formatDailyQuotePreferredHourLabel(hour);
        select.appendChild(option);
      }
    }

    hydrateSettingsDailyQuoteReminder() {
      void this._hydrateSettingsDailyQuoteReminderAsync();
    }

    async _hydrateSettingsDailyQuoteReminderAsync() {
      this.ensureSettingsDailyQuoteHourOptions();
      const toggle = document.getElementById('settingsDailyQuoteEnabled');
      const switchRow = document.getElementById('settingsDailyQuoteRemindersSwitch');
      const timeRow = document.getElementById('settingsDailyQuoteTimeRow');
      const hourSelect = document.getElementById('settingsDailyQuoteHourSelect');
      const status = document.getElementById('settingsDailyQuoteStatus');
      if (!toggle || !hourSelect) return;

      const hour = this.getDailyQuotePreferredHour();
      hourSelect.value = String(hour);
      const enabled = await this.isDailyQuoteReminderFullyEnabled();

      if (enabled) {
        if (switchRow) switchRow.hidden = true;
        toggle.checked = true;
        if (timeRow) timeRow.classList.remove('is-disabled');
        hourSelect.disabled = false;
        if (status) {
          status.hidden = false;
          status.textContent = `Arrives around ${this.formatDailyQuotePreferredHourLabel(hour)}.`;
        }
      } else {
        if (switchRow) switchRow.hidden = false;
        toggle.checked = false;
        if (timeRow) timeRow.classList.add('is-disabled');
        hourSelect.disabled = true;
        if (status) {
          status.hidden = true;
          status.textContent = '';
        }
      }
    }

    async cancelLocalDailyQuoteNotification() {
      const localNotifications = this.getLocalNotificationsPlugin();
      if (!localNotifications) return;
      try {
        await localNotifications.cancel({ notifications: [{ id: 9212026 }] });
      } catch (_) {
        /* no-op */
      }
      localStorage.setItem('ourDailyLocalDailyQuoteEnabled', '0');
    }

    async handleSettingsDailyQuoteToggleChange(enabled) {
      if (enabled) {
        try {
          const ok = await this.enableDailyQuotePushNotifications({ showSuccess: true });
          if (ok) {
            await this.cancelLocalDailyQuoteNotification();
          }
        } catch (error) {
          this.logger.warn('Settings daily quote enable failed:', error);
          this.uiService.showToast('Could not enable notifications yet.');
        }
      } else {
        localStorage.setItem('ourDailyPushDailyQuoteEnabled', '0');
        await this.cancelLocalDailyQuoteNotification();
        try {
          const messaging = this.getFirebaseMessagingPlugin();
          if (messaging) {
            const tokenResult = await messaging.getToken();
            const token = tokenResult && tokenResult.token;
            if (token) {
              await this.registerDailyQuotePushToken(token, { enabled: false });
            }
          }
        } catch (error) {
          this.logger.warn('Settings daily quote disable register failed:', error);
        }
        this.uiService.showToast('Daily quote reminders are off.');
      }
      await this._hydrateSettingsDailyQuoteReminderAsync();
    }

    async handleSettingsDailyQuoteHourChange(hour) {
      this.setDailyQuotePreferredHour(hour);
      if (localStorage.getItem('ourDailyPushDailyQuoteEnabled') !== '1') {
        await this._hydrateSettingsDailyQuoteReminderAsync();
        return;
      }
      try {
        await this.refreshDailyQuotePushRegistration();
        this.uiService.showToast('Reminder time updated.');
      } catch (error) {
        this.logger.warn('Settings daily quote hour update failed:', error);
        this.uiService.showToast('Could not update reminder time yet.');
      }
      await this._hydrateSettingsDailyQuoteReminderAsync();
    }

    async registerDailyQuotePushToken(token, { enabled = true } = {}) {
      const t = String(token || '').trim();
      if (!t) throw new Error('Missing push token');
      const baseUrl = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (!baseUrl) throw new Error('CONFIG.BACKEND.baseUrl is not set');

      const res = await fetch(`${baseUrl}/api/push/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: t,
          platform: this.getPushPlatform(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
          deviceId: this.currentUserId || this.quiltEngine?.deviceId || '',
          notificationTypes: ['daily_quote'],
          dailyQuotePreferredHour: this.getDailyQuotePreferredHour(),
          enabled: enabled !== false
        })
      });
      if (!res.ok) {
        throw new Error(`Push registration failed (${res.status})`);
      }
      if (enabled !== false) {
        localStorage.setItem('ourDailyPushDailyQuoteEnabled', '1');
        localStorage.setItem('ourDailyPushTokenRegisteredAt', new Date().toISOString());
      }
    }

    async enableDailyQuotePushNotifications({ showSuccess = true, requestPermission = true } = {}) {
      const messaging = this.getFirebaseMessagingPlugin();
      if (!messaging) {
        throw new Error('Firebase Messaging plugin unavailable');
      }

      const checked = await messaging.checkPermissions();
      let receive = checked && checked.receive;
      if (receive !== 'granted') {
        if (!requestPermission) return false;
        const requested = await messaging.requestPermissions();
        receive = requested && requested.receive;
      }
      if (receive !== 'granted') {
        localStorage.setItem('ourDailyPushDailyQuoteEnabled', '0');
        this.uiService.showToast('Notifications are off. You can enable them later in iPhone Settings.');
        return false;
      }

      const tokenResult = await messaging.getToken();
      const token = tokenResult && tokenResult.token;
      await this.registerDailyQuotePushToken(token);
      await this.cancelLocalDailyQuoteNotification();
      if (requestPermission && typeof window.odqTrack === 'function') {
        window.odqTrack('push_notifications_enabled', { channel: 'push' });
      }
      if (showSuccess) {
        this.uiService.showToast('Daily quote reminders are on for OUR DAILY QUILT.');
      }
      return true;
    }

    async enableLocalDailyQuoteNotification({ showSuccess = true, requestPermission = true } = {}) {
      const localNotifications = this.getLocalNotificationsPlugin();
      if (!localNotifications) {
        throw new Error('Local Notifications plugin unavailable');
      }

      const checked = await localNotifications.checkPermissions();
      let display = checked && checked.display;
      if (display !== 'granted') {
        if (!requestPermission) return false;
        const requested = await localNotifications.requestPermissions();
        display = requested && requested.display;
      }
      if (display !== 'granted') {
        localStorage.setItem('ourDailyLocalDailyQuoteEnabled', '0');
        this.uiService.showToast('Notifications are off. You can enable them later in iPhone Settings.');
        return false;
      }

      await localNotifications.cancel({ notifications: [{ id: 9212026 }] });
      const preferredHour = this.getDailyQuotePreferredHour();
      await localNotifications.schedule({
        notifications: [
          {
            id: 9212026,
            title: 'OUR DAILY QUILT',
            body: "Today's quote is ready.",
            schedule: {
              on: { hour: preferredHour, minute: 0 },
              repeats: true
            },
            extra: { type: 'daily_quote_local' }
          }
        ]
      });
      localStorage.setItem('ourDailyLocalDailyQuoteEnabled', '1');
      if (requestPermission && typeof window.odqTrack === 'function') {
        window.odqTrack('push_notifications_enabled', { channel: 'local' });
      }
      if (showSuccess) {
        this.uiService.showToast('Daily reminders are on for OUR DAILY QUILT.');
      }
      return true;
    }

    _notificationTextFromQuoteData(quoteData = {}) {
      return String(
        quoteData?.notificationText ??
          quoteData?.notification_text ??
          quoteData?.pushNotificationText ??
          quoteData?.push_notification_text ??
          ''
      ).trim();
    }

    async resolveDailyQuotePushPreviewSample() {
      if (this._dailyQuotePushPreviewSampleResolved) {
        return this._dailyQuotePushPreviewSampleResolved;
      }

      const quote = this.quoteService?.getTodayQuote?.() || null;
      let text = this._notificationTextFromQuoteData(quote || {});
      if (text) {
        this._dailyQuotePushPreviewSampleResolved = text;
        return text;
      }

      const dateKey =
        this.quoteService?.getQuoteCalendarKeyNow?.() ||
        (typeof Utils !== 'undefined' && Utils.getTodayKey ? Utils.getTodayKey() : '');
      const sourceId = String(quote?.sourceId || '').trim();

      if (window.db && window.firestore && dateKey) {
        try {
          const readDoc = window.firestore.getDoc || window.firestore.getDocFromServer;
          const quoteDoc = (id) => readDoc(window.firestore.doc(window.db, 'quotes', id));

          if (sourceId) {
            const quoteSnap = await quoteDoc(sourceId);
            if (quoteSnap?.exists?.()) {
              text = this._notificationTextFromQuoteData(quoteSnap.data() || {});
              if (text) {
                this._dailyQuotePushPreviewSampleResolved = text;
                return text;
              }
            }
          }

          const assignSnap = await readDoc(
            window.firestore.doc(window.db, 'dailyQuoteAssignments', dateKey)
          );
          if (assignSnap?.exists?.()) {
            const assignment = assignSnap.data() || {};
            text = this._notificationTextFromQuoteData(assignment);
            if (!text) {
              const assignmentSourceId = String(assignment.sourceId || '').trim();
              if (assignmentSourceId && assignmentSourceId !== sourceId) {
                const linkedSnap = await quoteDoc(assignmentSourceId);
                if (linkedSnap?.exists?.()) {
                  text = this._notificationTextFromQuoteData(linkedSnap.data() || {});
                }
              }
            }
            if (text) {
              this._dailyQuotePushPreviewSampleResolved = text;
              return text;
            }
          }
        } catch (error) {
          this.logger.warn('Daily quote push preview text lookup failed:', error);
        }
      }

      text = "Today's quote is ready.";
      this._dailyQuotePushPreviewSampleResolved = text;
      return text;
    }

    /** True when user opted in and iOS notification permission is actually granted. */
    async isDailyQuoteReminderFullyEnabled() {
      const pushEnabled = localStorage.getItem('ourDailyPushDailyQuoteEnabled') === '1';
      const localEnabled = localStorage.getItem('ourDailyLocalDailyQuoteEnabled') === '1';
      if (!pushEnabled && !localEnabled) return false;
      const messaging = this.getFirebaseMessagingPlugin();
      const local = this.getLocalNotificationsPlugin();
      try {
        if (messaging) {
          const checked = await messaging.checkPermissions();
          if (checked?.receive === 'granted') return true;
        }
        if (local) {
          const checked = await local.checkPermissions();
          if (checked?.display === 'granted') return true;
        }
      } catch (_) {
        /* ignore */
      }
      if (pushEnabled) {
        localStorage.setItem('ourDailyPushDailyQuoteEnabled', '0');
      }
      if (localEnabled) {
        localStorage.setItem('ourDailyLocalDailyQuoteEnabled', '0');
      }
      return false;
    }

    async maybePromptForDailyQuoteNotifications() {
      if (await this.isDailyQuoteReminderFullyEnabled()) return false;
      const promptedState = localStorage.getItem('ourDailyPushDailyQuotePrompted_v2');
      if (promptedState === 'declined') return false;
      if (promptedState === '1') {
        const messaging = this.getFirebaseMessagingPlugin();
        const localNotifications = this.getLocalNotificationsPlugin();
        try {
          const checked = messaging
            ? await messaging.checkPermissions()
            : await localNotifications?.checkPermissions?.();
          const status = messaging ? checked?.receive : checked?.display;
          if (!this.isNotificationPermissionPromptable(status)) return false;
          localStorage.removeItem('ourDailyPushDailyQuotePrompted_v2');
        } catch (_) {
          return false;
        }
      }
      if (!this.getFirebaseMessagingPlugin() && !this.getLocalNotificationsPlugin()) {
        this.logger.warn('Daily quote push prompt skipped: notification plugins unavailable');
        return false;
      }

      const sampleBody = await this.resolveDailyQuotePushPreviewSample();
      const ok = await this.uiService.showPushNotificationOptIn({
        sampleBody,
        iconUrl: CONFIG.APP.notificationIconUrl
      });
      if (!ok) {
        localStorage.setItem('ourDailyPushDailyQuotePrompted_v2', 'declined');
        localStorage.setItem('ourDailyPushDailyQuoteEnabled', '0');
        return true;
      }
      localStorage.setItem('ourDailyPushDailyQuotePrompted_v2', '1');

      try {
        await this.enableDailyQuotePushNotifications();
      } catch (error) {
        this.logger.warn('Daily quote push opt-in failed:', error);
        try {
          await this.enableLocalDailyQuoteNotification();
        } catch (localError) {
          this.logger.warn('Local daily quote reminder fallback failed:', localError);
          this.uiService.showToast('Could not enable notifications yet.');
        }
      }
      return true;
    }

    async refreshDailyQuotePushRegistration() {
      if (localStorage.getItem('ourDailyPushDailyQuoteEnabled') !== '1') return;
      const messaging = this.getFirebaseMessagingPlugin();
      if (!messaging) return;

      const checked = await messaging.checkPermissions();
      const receive = checked && checked.receive;
      if (receive !== 'granted') {
        localStorage.setItem('ourDailyPushDailyQuoteEnabled', '0');
        if (
          this.isNotificationPermissionPromptable(receive) &&
          localStorage.getItem('ourDailyPushDailyQuotePrompted_v2') !== 'declined'
        ) {
          localStorage.removeItem('ourDailyPushDailyQuotePrompted_v2');
        }
        return;
      }

      await this.enableDailyQuotePushNotifications({ showSuccess: false, requestPermission: false });
    }

    isNotificationDebugEnabled() {
      try {
        const params = new URLSearchParams(window.location.search || '');
        return params.get('odqNotifyDebug') === '1' || localStorage.getItem('odqNotifyDebug') === '1';
      } catch (_) {
        return false;
      }
    }

    getNotificationDebugSnapshot() {
      const scroller = this.getQuiltScrollContainer?.();
      const messaging = this.getFirebaseMessagingPlugin?.();
      const local = this.getLocalNotificationsPlugin?.();
      const platform = window.Capacitor?.getPlatform?.() || 'web';
      const isNative =
        typeof window.Capacitor?.isNativePlatform === 'function'
          ? window.Capacitor.isNativePlatform()
          : platform === 'ios' || platform === 'android';
      const pluginsOk = !!(messaging || local);
      const href = String(location?.href || '');
      let inspectorHint = 'OK — native app WebView';
      if (!isNative || !pluginsOk) {
        inspectorHint =
          'Wrong target: Safari is attached to a web page, not the installed app. ' +
          'Develop → [iPhone] → OUR DAILY / capacitor://localhost (with app open on device). ' +
          'Expect platform "ios" and plugins true.';
      }
      return {
        platform,
        isNative,
        href,
        inspectorHint,
        quiltActive: !!document.getElementById('screen-quilt')?.classList.contains('active'),
        plugins: { messaging: !!messaging, local: !!local },
        storage: {
          prompted: localStorage.getItem('ourDailyPushDailyQuotePrompted_v2'),
          enabled: localStorage.getItem('ourDailyPushDailyQuoteEnabled')
        },
        scroll: scroller
          ? {
              id: scroller.id || scroller.className?.split?.(' ')?.[0] || 'scroller',
              scrollTop: scroller.scrollTop,
              maxScroll: Math.max(0, scroller.scrollHeight - scroller.clientHeight)
            }
          : null,
        footerVisible: !!this.isQuiltFooterVisibleInViewport?.(),
        nearBottom: !!this.isQuiltScrolledNearBottom?.(),
        hasNewCode: document.documentElement.innerHTML.includes('setupQuiltNotificationScrollPrompt')
      };
    }

    refreshNotificationDebugPanel() {
      const pre = document.getElementById('odqNotifyDebugStatus');
      if (!pre) return;
      try {
        pre.textContent = JSON.stringify(this.getNotificationDebugSnapshot(), null, 2);
      } catch (error) {
        pre.textContent = String(error);
      }
    }

    setupNotificationDebugPanel() {
      if (!this.isNotificationDebugEnabled()) return;
      if (document.getElementById('odqNotifyDebugPanel')) {
        this.refreshNotificationDebugPanel();
        return;
      }

      const panel = document.createElement('div');
      panel.id = 'odqNotifyDebugPanel';
      panel.className = 'odq-notify-debug';
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'Notification debug');
      panel.innerHTML = `
        <p class="odq-notify-debug__title">Notify debug — hide gear, use wordmark ×5 or long-press</p>
        <pre class="odq-notify-debug__status" id="odqNotifyDebugStatus"></pre>
        <div class="odq-notify-debug__actions">
          <button type="button" class="odq-notify-debug__btn" data-odq-refresh>Refresh</button>
          <button type="button" class="odq-notify-debug__btn odq-notify-debug__btn--primary" data-odq-optin-ui>Show invite UI</button>
          <button type="button" class="odq-notify-debug__btn" data-odq-full-flow>Full flow</button>
          <button type="button" class="odq-notify-debug__btn" data-odq-layout-check>Layout check</button>
          <button type="button" class="odq-notify-debug__btn" data-odq-reset>Reset keys</button>
          <button type="button" class="odq-notify-debug__btn" data-odq-hide>Hide</button>
        </div>
      `;
      document.body.appendChild(panel);
      this.refreshNotificationDebugPanel();

      panel.addEventListener('click', async (e) => {
        const btn = e.target?.closest?.('[data-odq-refresh],[data-odq-optin-ui],[data-odq-full-flow],[data-odq-layout-check],[data-odq-reset],[data-odq-hide]');
        if (!btn) return;
        if (btn.hasAttribute('data-odq-hide')) {
          panel.hidden = true;
          return;
        }
        if (btn.hasAttribute('data-odq-refresh')) {
          this.refreshNotificationDebugPanel();
          return;
        }
        if (btn.hasAttribute('data-odq-reset')) {
          localStorage.removeItem('ourDailyPushDailyQuotePrompted_v2');
          localStorage.removeItem('ourDailyPushDailyQuoteEnabled');
          localStorage.removeItem('ourDailyLocalDailyQuoteEnabled');
          this._dailyQuotePromptedFromQuiltScroll = false;
          this.refreshNotificationDebugPanel();
          return;
        }
        if (btn.hasAttribute('data-odq-optin-ui')) {
          await this.uiService.showPushNotificationOptIn({
            sampleBody: "Debug — today's quote is ready.",
            iconUrl: CONFIG.APP.notificationIconUrl
          });
          this.refreshNotificationDebugPanel();
          return;
        }
        if (btn.hasAttribute('data-odq-layout-check')) {
          this.checkQuiltNotificationPromptFromLayout();
          this.refreshNotificationDebugPanel();
          return;
        }
        if (btn.hasAttribute('data-odq-full-flow')) {
          this._dailyQuotePromptedFromQuiltScroll = false;
          await this.maybePromptForDailyQuoteNotifications();
          this.refreshNotificationDebugPanel();
        }
      });

      window.__odqNotifyDebug = {
        refresh: () => this.refreshNotificationDebugPanel(),
        snapshot: () => this.getNotificationDebugSnapshot(),
        showOptIn: () =>
          this.uiService.showPushNotificationOptIn({
            sampleBody: "Debug — today's quote is ready.",
            iconUrl: CONFIG.APP.notificationIconUrl
          }),
        fullFlow: () => this.maybePromptForDailyQuoteNotifications(),
        layoutCheck: () => this.checkQuiltNotificationPromptFromLayout(),
        reset: () => {
          localStorage.removeItem('ourDailyPushDailyQuotePrompted_v2');
          localStorage.removeItem('ourDailyPushDailyQuoteEnabled');
          localStorage.removeItem('ourDailyLocalDailyQuoteEnabled');
          this._dailyQuotePromptedFromQuiltScroll = false;
        }
      };

      this.bindNotificationDebugReveal(
        document.querySelector('#screen-quilt .quilt-footer-icon-row')
      );
    }

    /** Secret reveal: 5× tap or ~1.2s press on quilt footer icon strip (not the settings gear). */
    bindNotificationDebugReveal(target) {
      if (!target || target._odqNotifyDebugRevealBound) return;
      target._odqNotifyDebugRevealBound = true;
      target.style.cursor = 'default';
      target.setAttribute('title', '');

      const reveal = () => {
        try {
          localStorage.setItem('odqNotifyDebug', '1');
        } catch (_) {
          /* ignore */
        }
        const panel = document.getElementById('odqNotifyDebugPanel');
        if (panel) {
          panel.hidden = false;
          this.refreshNotificationDebugPanel();
        } else {
          this.setupNotificationDebugPanel();
        }
      };

      let taps = 0;
      let tapTimer = null;
      let longPressTimer = null;

      const onTap = (e) => {
        taps += 1;
        clearTimeout(tapTimer);
        if (taps >= 5) {
          taps = 0;
          e.preventDefault();
          e.stopPropagation();
          reveal();
          return;
        }
        tapTimer = window.setTimeout(() => {
          taps = 0;
        }, 900);
      };

      const startLongPress = () => {
        clearTimeout(longPressTimer);
        longPressTimer = window.setTimeout(reveal, 1200);
      };
      const cancelLongPress = () => {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      };

      target.addEventListener('click', onTap);
      target.addEventListener('touchstart', startLongPress, { passive: true });
      target.addEventListener('touchend', cancelLongPress, { passive: true });
      target.addEventListener('touchcancel', cancelLongPress, { passive: true });
    }

    getColorMilestoneMessage(count) {
      const milestones = CONFIG.COLOR_MILESTONES || {};
      return milestones[String(count)] || milestones[count] || '';
    }

    getLifetimeColorSubmissionCountForCurrentDevice() {
      const userId = this.quiltEngine?.deviceId || this.currentUserId || Utils.getOrCreateUserId();
      const lifetime = this.quiltEngine?.getLifetimeUserContributions?.();
      const submissions = Array.isArray(lifetime?.submissions) ? lifetime.submissions : [];
      return submissions.filter((submission) => !submission?.userId || submission.userId === userId).length;
    }

    readColorMilestoneState() {
      try {
        const raw = localStorage.getItem('ourDailyColorMilestoneNotifications');
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) {
        return {};
      }
    }

    writeColorMilestoneState(state) {
      try {
        localStorage.setItem('ourDailyColorMilestoneNotifications', JSON.stringify(state || {}));
      } catch (_) {
        /* ignore local notification-state failures */
      }
    }

    _getPersonalQuiltMilestoneCount() {
      const configured = Number(CONFIG.PERSONAL_QUILT?.MILESTONE_COUNT);
      return Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : 5;
    }

    async maybeCreateColorMilestoneNotification(color) {
      if (!this.isMilestoneQuiltsEnabled()) return null;
      const count = this.getLifetimeColorSubmissionCountForCurrentDevice();
      const message = this.getColorMilestoneMessage(count);
      if (!message) return null;

      const userId = this.quiltEngine?.deviceId || this.currentUserId || Utils.getOrCreateUserId();
      const storageKey = `${userId}:${count}`;
      const state = this.readColorMilestoneState();
      if (state[storageKey]) return null;

      const now = new Date().toISOString();
      const personalQuiltMilestoneCount = this._getPersonalQuiltMilestoneCount();
      const isPersonalQuiltMilestone = count === personalQuiltMilestoneCount;
      const notificationKind = isPersonalQuiltMilestone ? 'personal_quilt_milestone' : 'color_milestone';
      const payload = {
        userId,
        deviceId: userId,
        milestone: count,
        color,
        body: message,
        message,
        status: 'pending_push',
        deliveryReady: false,
        createdAt: now,
        appDateKey: Utils.getTodayKey(),
        source: 'color_milestone',
        notificationKind,
        kind: notificationKind
      };

      state[storageKey] = {
        milestone: count,
        message,
        color,
        createdAt: now,
        status: payload.status,
        notificationKind
      };
      this.writeColorMilestoneState(state);

      // The personal-quilt milestone is deferred to a one-shot local
      // notification scheduled ~CONFIG.PERSONAL_QUILT.DELAY_MS later, so
      // the reveal lands as a "gift" rather than colliding with the
      // celebratory moment of just picking the milestone color. The
      // in-session milestone card is suppressed for this count only.
      if (isPersonalQuiltMilestone) {
        try {
          const scheduledAt = await this._schedulePersonalQuiltLocalNotification(message);
          if (scheduledAt) {
            payload.scheduledAt = scheduledAt;
            payload.localNotifId = CONFIG.PERSONAL_QUILT?.LOCAL_NOTIF_ID || 9212077;
            state[storageKey].scheduledAt = scheduledAt;
            this.writeColorMilestoneState(state);
          }
        } catch (error) {
          this.logger.warn('Personal quilt local notification scheduling failed:', error);
        }
      }

      if (window.db && window.firestore) {
        try {
          const docId = `${userId}_${count}`.replace(/[^A-Za-z0-9_-]/g, '_');
          await window.firestore.setDoc(
            window.firestore.doc(window.db, 'colorMilestoneNotifications', docId),
            payload,
            { merge: true }
          );
        } catch (error) {
          this.logger.warn('Color milestone notification saved locally only:', error);
        }
      }

      if (!isPersonalQuiltMilestone) {
        this.uiService.showInAppNotification({
          body: message,
          accentColor: color
        });
      }
      return payload;
    }

    /**
     * Schedule a one-shot local notification CONFIG.PERSONAL_QUILT.DELAY_MS
     * in the future, carrying the personal-quilt-milestone routing
     * payload. Uses the cancel-then-schedule pattern so re-runs (e.g.
     * force-reset in QA) don't stack duplicates. Returns the fire-at ISO
     * string on success, null otherwise. The notification body is the
     * milestone message; no title is set (iOS renders just the app name
     * header above the body).
     *
     * Permission policy: if notification permission is not granted, we do
     * NOT prompt mid-color-pick (would disrupt the celebratory moment).
     * The reveal falls back to `maybeShowPersonalQuiltFallback` on next
     * app open.
     */
    async _schedulePersonalQuiltLocalNotification(message) {
      const localNotifications = this.getLocalNotificationsPlugin();
      if (!localNotifications) return null;

      let display;
      try {
        const perm = await localNotifications.checkPermissions();
        display = perm?.display;
      } catch (error) {
        this.logger.warn('LocalNotifications.checkPermissions failed:', error);
        return null;
      }
      if (display !== 'granted') return null;

      const notifId = CONFIG.PERSONAL_QUILT?.LOCAL_NOTIF_ID || 9212077;
      const delayMs = Math.max(
        1000,
        Number(CONFIG.PERSONAL_QUILT?.DELAY_MS) || (2 * 60 * 60 * 1000)
      );
      const fireAt = new Date(Date.now() + delayMs);

      try {
        await localNotifications.cancel({ notifications: [{ id: notifId }] });
      } catch (_) {
        /* no-op if nothing pending */
      }

      try {
        await localNotifications.schedule({
          notifications: [{
            id: notifId,
            title: '',
            body: message,
            schedule: { at: fireAt, allowWhileIdle: true },
            extra: { type: 'color_milestone', kind: 'personal_quilt_milestone' }
          }]
        });
      } catch (error) {
        this.logger.warn('LocalNotifications.schedule failed:', error);
        return null;
      }

      const isoFireAt = fireAt.toISOString();
      try {
        localStorage.setItem('ourDailyPersonalQuiltScheduledAt', isoFireAt);
      } catch (_) { /* ignore storage errors */ }
      return isoFireAt;
    }

    /**
     * Render the user's personal-quilt milestone reveal in a full-screen
     * modal where the rendered quilt is the visual hero (centered, large)
     * with the milestone message below it. Idempotent via the
     * `ourDailyPersonalQuiltSeen` localStorage flag.
     *
     * Reads the device's chronological color history, slices the first N
     * picks (N = CONFIG.PERSONAL_QUILT.MILESTONE_COUNT), fills the
     * slot-based template, rasterizes via the existing archive pipeline,
     * and presents the PNG full-screen.
     */
    async showPersonalQuiltReveal(opts = {}) {
      if (!this.isMilestoneQuiltsEnabled()) return false;
      const force = opts && opts.force === true;
      try {
        if (!force && localStorage.getItem('ourDailyPersonalQuiltSeen')) return false;
      } catch (_) { /* ignore */ }

      const milestoneCount = this._getPersonalQuiltMilestoneCount();
      const colors = (typeof this.getDevicePersonalColorHistory === 'function'
        ? this.getDevicePersonalColorHistory()
        : []
      ).slice(0, milestoneCount);
      if (colors.length < milestoneCount) return false;

      const template = CONFIG.PERSONAL_QUILT?.TEMPLATE;
      if (!template) return false;
      const blocks = Utils.fillTemplateWithColors(template, colors);
      if (!Array.isArray(blocks) || blocks.length === 0) return false;

      let pngBlob = null;
      let pngUrl = null;
      try {
        pngBlob = await this.archiveService?.generateQuiltRasterBlobFromBlocks?.(blocks, {
          targetAspect: template.width && template.height ? template.width / template.height : null,
          maxEdge: 1200,
          backgroundColor: '#eae7e1'
        });
        if (pngBlob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          pngUrl = URL.createObjectURL(pngBlob);
        }
      } catch (error) {
        this.logger.warn('Personal quilt render failed:', error);
      }

      if (!pngBlob || !pngUrl) {
        this.logger.warn('Personal quilt reveal aborted: rendering produced no image.');
        return false;
      }

      const message = this.getColorMilestoneMessage(milestoneCount) || 'Your first quilt is ready ♡';
      this._showPersonalQuiltModal({ pngUrl, pngBlob, message });

      const seenAt = new Date().toISOString();
      try {
        localStorage.setItem('ourDailyPersonalQuiltSeen', seenAt);
      } catch (_) { /* ignore */ }

      if (window.db && window.firestore) {
        try {
          const userId = this.quiltEngine?.deviceId || this.currentUserId || Utils.getOrCreateUserId();
          const docId = `${userId}_${milestoneCount}`.replace(/[^A-Za-z0-9_-]/g, '_');
          await window.firestore.setDoc(
            window.firestore.doc(window.db, 'colorMilestoneNotifications', docId),
            { status: 'revealed', revealedAt: seenAt, revealSource: String(opts.source || 'unknown') },
            { merge: true }
          );
        } catch (error) {
          this.logger.warn('Personal quilt reveal Firestore update failed (non-fatal):', error);
        }
      }

      return true;
    }

    /**
     * Mount the full-screen personal-quilt reveal modal. Handles
     * fade-in, dismiss on scrim/close-button click and Escape key,
     * and revokes the PNG object URL on close. Includes a subtle
     * "save your quilt" button that hands the PNG blob to the system
     * share sheet (which exposes "Save to Photos" on iOS) and falls
     * back to a download on the web.
     */
    _showPersonalQuiltModal({ pngUrl, pngBlob, message }) {
      if (!pngUrl) return null;

      // Remove any previously-mounted reveal modal (defensive: repeated
      // `force: true` calls during testing or rapid back-to-back triggers
      // would otherwise stack overlays on top of each other).
      try {
        document
          .querySelectorAll('.odq-personal-quilt-modal')
          .forEach((node) => { try { node.remove(); } catch (_) { /* ignore */ } });
      } catch (_) { /* ignore */ }

      const overlay = document.createElement('div');
      overlay.className = 'odq-personal-quilt-modal';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Your personal quilt');

      const scrim = document.createElement('div');
      scrim.className = 'odq-personal-quilt-modal__scrim';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'odq-personal-quilt-modal__close';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.textContent = '\u2715';

      const dialog = document.createElement('div');
      dialog.className = 'odq-personal-quilt-modal__dialog';

      const imageWrap = document.createElement('div');
      imageWrap.className = 'odq-personal-quilt-modal__image-wrap';

      const img = document.createElement('img');
      img.className = 'odq-personal-quilt-modal__image';
      img.alt = 'Your personal quilt made from your first color choices';
      img.src = pngUrl;

      const msg = document.createElement('p');
      msg.className = 'odq-personal-quilt-modal__message';
      msg.textContent = message;

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'odq-personal-quilt-modal__save';
      saveBtn.textContent = 'Save your quilt';

      imageWrap.appendChild(img);
      dialog.appendChild(imageWrap);
      dialog.appendChild(msg);
      if (pngBlob) dialog.appendChild(saveBtn);
      overlay.appendChild(scrim);
      overlay.appendChild(closeBtn);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      let dismissed = false;
      const onKey = (event) => {
        if (event.key === 'Escape') dismiss();
      };

      const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        overlay.classList.remove('odq-personal-quilt-modal--shown');
        overlay.classList.add('odq-personal-quilt-modal--leaving');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => {
          try { overlay.remove(); } catch (_) { /* ignore */ }
          try { URL.revokeObjectURL(pngUrl); } catch (_) { /* ignore */ }
        }, 420);
      };

      saveBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (saveBtn.disabled || !pngBlob) return;
        const originalLabel = saveBtn.textContent;
        const filename = 'our-daily-quilt-personal.png';
        const imageFile =
          typeof File !== 'undefined'
            ? new File([pngBlob], filename, { type: 'image/png' })
            : null;
        // Match the canonical save-to-photos shareData shape used by
        // handleDownloadPersonalQuilt elsewhere in the app. iOS WKWebView's
        // Web Share API needs at least one non-files field (title/text)
        // alongside the files entry — without them, canShare returns false
        // and navigator.share silently no-ops on some iOS versions.
        const shareData = imageFile
          ? {
              title: 'My OUR DAILY QUILT',
              text: 'My personal quilt',
              files: [imageFile]
            }
          : null;
        const canShareFile =
          shareData &&
          typeof navigator !== 'undefined' &&
          typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare(shareData);

        saveBtn.disabled = true;
        if (canShareFile) {
          try {
            await navigator.share(shareData);
            if (!dismissed) saveBtn.textContent = 'Shared ♡';
            return;
          } catch (error) {
            if (error && error.name === 'AbortError') {
              if (!dismissed) {
                saveBtn.textContent = originalLabel;
                saveBtn.disabled = false;
              }
              return;
            }
            this.logger.warn('Personal quilt navigator.share failed, falling back:', error);
            // Fall through to the download path below.
          }
        }

        // Desktop / unsupported-WebView fallback: trigger a download.
        try {
          const dlUrl = URL.createObjectURL(pngBlob);
          const a = document.createElement('a');
          a.href = dlUrl;
          a.download = filename;
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => {
            try { URL.revokeObjectURL(dlUrl); } catch (_) { /* ignore */ }
          }, 60_000);
          if (!dismissed) saveBtn.textContent = 'Saved ♡';
        } catch (error) {
          this.logger.warn('Personal quilt download fallback failed:', error);
          if (!dismissed) {
            saveBtn.textContent = 'Couldn’t save — try again';
            saveBtn.disabled = false;
            setTimeout(() => {
              if (!dismissed && saveBtn.textContent === 'Couldn’t save — try again') {
                saveBtn.textContent = originalLabel;
              }
            }, 2400);
          }
        }
      });

      // Tap anywhere outside the save button dismisses the modal.
      // This catches: scrim, dialog padding, the quilt image, the message,
      // and the close-X (any of which behave the same way — dismiss).
      // The save button has its own click handler with stopPropagation,
      // so its taps never reach this listener.
      overlay.addEventListener('click', (event) => {
        if (saveBtn.contains(event.target)) return;
        dismiss();
      });
      document.addEventListener('keydown', onKey);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.add('odq-personal-quilt-modal--shown');
        });
      });

      return { dismiss };
    }

    /**
     * Called on app init. If the scheduled local notification window has
     * elapsed and the user never opened the reveal (notif permission
     * denied, dismissed without tap, reinstall, etc.), fire the reveal
     * inline. Idempotent via the "seen" flag inside
     * `showPersonalQuiltReveal`.
     */
    async maybeShowPersonalQuiltFallback() {
      if (!this.isMilestoneQuiltsEnabled()) return false;
      try {
        if (localStorage.getItem('ourDailyPersonalQuiltSeen')) return false;
      } catch (_) { return false; }

      const userId = this.quiltEngine?.deviceId || this.currentUserId || Utils.getOrCreateUserId();
      const milestoneCount = this._getPersonalQuiltMilestoneCount();
      const state = this.readColorMilestoneState();
      const record = state[`${userId}:${milestoneCount}`];
      if (!record) return false;

      const createdAt = Date.parse(String(record.createdAt || ''));
      if (!Number.isFinite(createdAt)) return false;

      const delayMs = Math.max(
        1000,
        Number(CONFIG.PERSONAL_QUILT?.DELAY_MS) || (2 * 60 * 60 * 1000)
      );
      if (Date.now() < createdAt + delayMs) return false;

      return this.showPersonalQuiltReveal({ source: 'fallbackOnAppOpen' });
    }

    /**
     * One-time on-launch check for users who already crossed the
     * personal-quilt milestone BEFORE this feature shipped (or before the
     * milestone count was lowered). If there is no milestone record
     * locally, treat them as eligible right now: write the record (for
     * future idempotency) and surface the reveal inline. No schedule,
     * because the celebratory moment has already passed.
     */
    async maybeRunPersonalQuiltBackfill() {
      if (!this.isMilestoneQuiltsEnabled()) return false;
      try {
        if (localStorage.getItem('ourDailyPersonalQuiltSeen')) return false;
      } catch (_) { return false; }

      if (typeof this.getLifetimeColorSubmissionCountForCurrentDevice !== 'function') return false;
      const count = this.getLifetimeColorSubmissionCountForCurrentDevice();
      const milestoneCount = this._getPersonalQuiltMilestoneCount();
      if (count < milestoneCount) return false;

      const userId = this.quiltEngine?.deviceId || this.currentUserId || Utils.getOrCreateUserId();
      const state = this.readColorMilestoneState();
      if (state[`${userId}:${milestoneCount}`]) return false; // already tracked; fallback path handles it

      const colors = (typeof this.getDevicePersonalColorHistory === 'function'
        ? this.getDevicePersonalColorHistory()
        : []
      );
      if (colors.length < milestoneCount) return false;
      const firstColor = colors[0];
      const message = this.getColorMilestoneMessage(milestoneCount) || 'Your first quilt is ready ♡';
      const now = new Date().toISOString();

      state[`${userId}:${milestoneCount}`] = {
        milestone: milestoneCount,
        message,
        color: firstColor,
        createdAt: now,
        status: 'pending_push',
        notificationKind: 'personal_quilt_milestone',
        source: 'backfill'
      };
      this.writeColorMilestoneState(state);

      if (window.db && window.firestore) {
        try {
          const docId = `${userId}_${milestoneCount}`.replace(/[^A-Za-z0-9_-]/g, '_');
          await window.firestore.setDoc(
            window.firestore.doc(window.db, 'colorMilestoneNotifications', docId),
            {
              userId,
              deviceId: userId,
              milestone: milestoneCount,
              color: firstColor,
              body: message,
              message,
              status: 'pending_push',
              deliveryReady: false,
              createdAt: now,
              appDateKey: Utils.getTodayKey(),
              source: 'backfill',
              notificationKind: 'personal_quilt_milestone',
              kind: 'personal_quilt_milestone'
            },
            { merge: true }
          );
        } catch (error) {
          this.logger.warn('Personal quilt backfill Firestore write failed (non-fatal):', error);
        }
      }

      return this.showPersonalQuiltReveal({ source: 'backfill' });
    }

    isRememberTodayNativeAvailable() {
      const localNotifications = this.getLocalNotificationsPlugin();
      if (!localNotifications) return false;
      try {
        const cap = window.Capacitor;
        if (!cap) return false;
        if (typeof cap.isNativePlatform === 'function') {
          return cap.isNativePlatform() === true;
        }
        const platform =
          typeof cap.getPlatform === 'function' ? String(cap.getPlatform() || '') : '';
        return platform === 'ios' || platform === 'android';
      } catch (_) {
        return false;
      }
    }

    _rememberTodayDateKey() {
      return this.quoteService?.getQuoteCalendarKeyNow?.() || Utils.getTodayKey();
    }

    _rememberTodayStorageKey(dateKey) {
      const dk = String(dateKey || this._rememberTodayDateKey()).trim();
      return `ourDailyRememberToday_${dk}`;
    }

    readRememberTodayState(dateKey = this._rememberTodayDateKey()) {
      try {
        const raw = localStorage.getItem(this._rememberTodayStorageKey(dateKey));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (String(parsed.dateKey || '') !== String(dateKey)) return null;
        const kinds = Array.isArray(parsed.kinds)
          ? parsed.kinds.map((k) => String(k).trim()).filter(Boolean)
          : [];
        const segments =
          parsed.segments && typeof parsed.segments === 'object' ? parsed.segments : {};
        return {
          dateKey: String(dateKey),
          kinds,
          segments,
          thoughtsDraft: String(parsed.thoughtsDraft ?? '').trim(),
          fireAtIso: String(parsed.fireAtIso || '').trim(),
          viewedAt: String(parsed.viewedAt || '').trim()
        };
      } catch (_) {
        return null;
      }
    }

    writeRememberTodayState(state) {
      if (!state || !state.dateKey) return;
      try {
        localStorage.setItem(
          this._rememberTodayStorageKey(state.dateKey),
          JSON.stringify({
            dateKey: state.dateKey,
            kinds: Array.isArray(state.kinds) ? state.kinds : [],
            segments: state.segments && typeof state.segments === 'object' ? state.segments : {},
            thoughtsDraft: String(state.thoughtsDraft ?? '').trim(),
            fireAtIso: String(state.fireAtIso || '').trim(),
            viewedAt: String(state.viewedAt || '').trim()
          })
        );
      } catch (_) {
        /* ignore */
      }
    }

    markRememberTodayViewed(dateKey) {
      const dk = String(dateKey || this._rememberTodayDateKey()).trim();
      if (!dk) return;
      const state = this.readRememberTodayState(dk);
      if (!state || !state.kinds.length || state.viewedAt) return;
      this.writeRememberTodayState({ ...state, viewedAt: new Date().toISOString() });
    }

    _rememberTodayViewTitleLabel(dateKey = this._rememberTodayDateKey()) {
      const dk = String(dateKey || this._rememberTodayDateKey()).trim();
      const todayKey = this._rememberTodayDateKey();
      if (dk === todayKey) return 'From today';
      const yesterdayKey =
        this.quoteService?.getQuoteCalendarKeyUtc7FromAdjustedToday?.(-1) || '';
      if (yesterdayKey && dk === yesterdayKey) return 'From yesterday';
      const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dk);
      if (parts) {
        const d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
        if (!Number.isNaN(d.getTime())) {
          return `From ${d.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}`;
        }
      }
      return 'From that day';
    }

    _scanRememberTodayStorageDateKeys() {
      const dateKeys = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('ourDailyRememberToday_')) {
            dateKeys.push(key.slice('ourDailyRememberToday_'.length));
          }
        }
      } catch (_) {
        /* ignore */
      }
      return dateKeys;
    }

    listRememberTodayArchiveStates() {
      return this._scanRememberTodayStorageDateKeys()
        .map((dateKey) => this.readRememberTodayState(dateKey))
        .filter((state) => state && Array.isArray(state.kinds) && state.kinds.length > 0)
        .sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)));
    }

    _rememberTodayArchivePreview(state) {
      if (!state?.kinds?.length) return '';
      const body = this._buildRememberTodayNotificationBody(state.kinds, state.segments);
      if (body) return body;
      const entries = this._buildRememberTodayViewEntries(state.dateKey);
      const first = entries[0]?.text || '';
      return this._truncateRememberTodayBody(first, 120, true);
    }

    refreshRememberTodayArchiveSettingsLink() {
      const item = document.getElementById('settingsRememberTodayArchiveItem');
      const link = document.getElementById('settingsRememberTodayArchiveLink');
      if (!item || !link) return;
      const native = this.isRememberTodayNativeAvailable();
      const items = native ? this.listRememberTodayArchiveStates() : [];
      const show = native && items.length > 0;
      item.hidden = !show;
      item.setAttribute('aria-hidden', show ? 'false' : 'true');
      link.hidden = !show;
      link.setAttribute('aria-hidden', show ? 'false' : 'true');
    }

    async clearRememberTodayArchive(dateKey = null) {
      const target = String(dateKey || '').trim();
      if (target) {
        try {
          localStorage.removeItem(this._rememberTodayStorageKey(target));
        } catch (_) {
          /* ignore */
        }
      } else {
        this._scanRememberTodayStorageDateKeys().forEach((dk) => {
          try {
            localStorage.removeItem(this._rememberTodayStorageKey(dk));
          } catch (_) {
            /* ignore */
          }
        });
      }
      const todayState = this.readRememberTodayState();
      if (!todayState || !todayState.kinds.length) {
        await this._cancelRememberTodayNotification();
      }
      this.refreshRememberTodayArchiveSettingsLink();
      this.refreshRememberTodayFooterVisibility();
    }

    async maybeCancelRememberTodayForStaleDay() {
      const dk = this._rememberTodayDateKey();
      try {
        this._scanRememberTodayStorageDateKeys().forEach((keyDateKey) => {
          const state = this.readRememberTodayState(keyDateKey);
          if (state && Array.isArray(state.kinds) && state.kinds.length > 0) return;
          try {
            localStorage.removeItem(this._rememberTodayStorageKey(keyDateKey));
          } catch (_) {
            /* ignore */
          }
        });
      } catch (_) {
        /* ignore */
      }
      const state = this.readRememberTodayState(dk);
      if (!state || !state.kinds.length) {
        await this._cancelRememberTodayNotification();
      }
    }

    _normalizeRememberTodayThoughts(value) {
      return String(value || '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
        .trim()
        .slice(0, Number(CONFIG.REMEMBER_TODAY?.MAX_THOUGHTS_CHARS) || 280);
    }

    _readRememberTodayThoughtsFromInput() {
      const el = document.getElementById('rememberTodayThoughtsInput');
      return this._normalizeRememberTodayThoughts(el?.value || '');
    }

    _getRememberTodayQuote(quote = null) {
      const q = quote || this.quoteService?.getTodayQuote?.() || null;
      if (!q) return null;
      const fresh = this.quoteService?._hydrateQuoteFromCatalog?.(q);
      if (!fresh) return q;
      return this.quoteService._mergePinnedWithCatalogFields(fresh, q);
    }

    /**
     * Mood copy for remember-today: only the line for the tile the reader
     * picked (good or rough). Null when they have not picked yet.
     */
    _getRememberTodayMoodPick() {
      const moodKicker = 'MESSAGE FOR YOU';
      const snap = this._getQuiltMoodPickSnapshot();
      if (snap?.mood && snap?.body) {
        const mood = snap.mood === 'rough' ? 'rough' : 'good';
        return {
          mood,
          body: String(snap.body).trim(),
          kicker: moodKicker
        };
      }

      const todayQuote = this._getRememberTodayQuote();
      const { goodDay, roughDay } = this.quoteService?._moodLinesFromQuote?.(todayQuote || {}) || {
        goodDay: '',
        roughDay: ''
      };
      const saved = this._readQuiltMoodPickFromStorage('');
      if (!saved || (saved.mood !== 'good' && saved.mood !== 'rough')) return null;

      const raw =
        saved.mood === 'good'
          ? String(goodDay || '').trim()
          : String(roughDay || '').trim();
      const body = Utils.formatMoodReceiptBody(raw);
      if (!body) return null;

      return {
        mood: saved.mood,
        body,
        kicker: moodKicker
      };
    }

    _rememberTodayQuoteBody(quote = null) {
      const today = this._getRememberTodayQuote(quote);
      if (!today) return '';
      const full = String(today.text || today.quote || '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
      if (full) return full;
      return String(this._notificationTextFromQuoteData(today) || '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    _rememberTodayQuoteSpeakerName(quote = null) {
      const today = this._getRememberTodayQuote(quote);
      if (!today) return '';
      const profile = this.getQuoteSpeakerProfile?.(today);
      const fromProfile = String(profile?.name || '').trim();
      if (fromProfile) return fromProfile;
      const rawAuthor = String(today.author || today.authorSnapshot || '').trim();
      return rawAuthor.replace(/^[—–\-]\s*/, '').trim();
    }

    _rememberTodayQuoteSegment(quote = null) {
      const body = this._rememberTodayQuoteBody(quote);
      if (!body) return '';
      const speaker = this._rememberTodayQuoteSpeakerName(quote);
      if (!speaker) return body;
      return `${body.trimEnd()} \u2014 ${speaker}`;
    }

    _getRememberTodayColorPick(dateKey = this._rememberTodayDateKey()) {
      const dk = String(dateKey || this._rememberTodayDateKey()).trim() || this._rememberTodayDateKey();
      const data = this.getExitChamberTodayPieceData?.(dk);
      if (!data) return null;
      const hex = this.normalizeHexColor?.(data.color) || String(data.color || '').trim();
      if (!hex || !Utils.validateHexColor?.(hex)) return null;
      const name = String(this.getPaintSampleColorName?.(hex) || '').trim();
      return { hex, name };
    }

    _rememberTodayColorSegment(dateKey = this._rememberTodayDateKey()) {
      const pick = this._getRememberTodayColorPick(dateKey);
      if (!pick) return '';
      if (pick.name) return `${pick.name}\n${pick.hex}`;
      return pick.hex;
    }

    _syncRememberTodayColorPreview(item, pick) {
      if (!item || !pick) return;
      const swatch = item.querySelector('.remember-today-color-swatch');
      const nameEl = item.querySelector('.remember-today-color-name');
      const hexEl = item.querySelector('.remember-today-color-hex');
      if (swatch) swatch.style.setProperty('--remember-today-swatch-color', pick.hex);
      if (nameEl) {
        nameEl.textContent = pick.name || '';
        nameEl.hidden = !pick.name;
      }
      if (hexEl) hexEl.textContent = pick.hex;
    }

    _rememberTodaySegment(kind, quote = null) {
      const qs = this.quoteService;
      const today = this._getRememberTodayQuote(quote);
      const k = String(kind || '').trim();
      if (!today || !k) return '';

      if (k === 'quote') {
        return this._rememberTodayQuoteSegment(quote);
      }
      if (k === 'color') {
        return this._rememberTodayColorSegment(this._rememberTodayDateKey());
      }
      if (k === 'watch_for') {
        return qs?.getWatchForText?.(today) || '';
      }
      if (k === 'companion') {
        const { titleLine, blurb } = this._getRememberTodayCompanionParts(today);
        const fallback = CONFIG.REMEMBER_TODAY?.COMPANION_FALLBACK_TITLE || '';
        if (!titleLine || titleLine === fallback) return '';
        const b = String(blurb || '').replace(/\s+/g, ' ').trim();
        return b ? `${titleLine}\n${b}` : titleLine;
      }
      if (k === 'mood') {
        return this._getRememberTodayMoodPick()?.body || '';
      }
      if (k === 'thoughts') {
        return this._readRememberTodayThoughtsFromInput();
      }
      return '';
    }

    isRememberTodayKindAvailable(kind, quote = null) {
      const k = String(kind || '').trim();
      if (k === 'mood') return !!this._getRememberTodayMoodPick();
      if (k === 'thoughts') return !!this._readRememberTodayThoughtsFromInput();
      if (k === 'color') return !!this._getRememberTodayColorPick();
      return !!this._rememberTodaySegment(k, quote);
    }

    _truncateRememberTodayBody(text, maxChars, preserveLines = false) {
      const max = Math.max(40, Number(maxChars) || 320);
      const raw = String(text || '').trim();
      if (!raw) return '';
      if (preserveLines) {
        const lines = raw.split('\n').map((ln) => ln.replace(/\s+/g, ' ').trim()).filter(Boolean);
        let out = '';
        for (const line of lines) {
          const next = out ? `${out}\n${line}` : line;
          if (next.length <= max) {
            out = next;
            continue;
          }
          const room = max - out.length - 1;
          if (room > 12) out = `${out}\n${line.slice(0, room - 1).trim()}…`;
          break;
        }
        if (out.length <= max) return out;
      }
      const t = raw.replace(/\s+/g, ' ').trim();
      if (t.length <= max) return t;
      return `${t.slice(0, max - 1).trim()}…`;
    }

    _buildRememberTodayNotificationBody(kinds, segments) {
      const priority = CONFIG.REMEMBER_TODAY?.SEGMENT_PRIORITY || [
        'mood',
        'watch_for',
        'quote',
        'companion'
      ];
      const ordered = [];
      priority.forEach((k) => {
        if (kinds.includes(k) && segments[k]) ordered.push({ kind: k, text: segments[k] });
      });
      kinds.forEach((k) => {
        if (!ordered.some((o) => o.kind === k) && segments[k]) {
          ordered.push({ kind: k, text: segments[k] });
        }
      });
      if (!ordered.length) return '';
      const maxTotal = Number(CONFIG.REMEMBER_TODAY?.MAX_BODY_CHARS) || 320;
      const pick = ordered[0];
      let text = String(pick.text || '').trim();
      if (pick.kind === 'watch_for' && text) {
        text = /^watch\s+for\b/i.test(text) ? text : `Watch for ${text}`;
      }
      if (!text) return '';
      return this._truncateRememberTodayBody(text, maxTotal, true);
    }

    _rememberTodayCutoffHourLocal() {
      return Number(CONFIG.REMEMBER_TODAY?.CUTOFF_HOUR_LOCAL) || 22;
    }

    _rememberTodayLateNightDelayMs() {
      return Math.max(
        60_000,
        Number(CONFIG.REMEMBER_TODAY?.LATE_NIGHT_DELAY_MS) || 7 * 60 * 1000
      );
    }

    _isSameLocalCalendarDay(a, b) {
      if (!a || !b) return false;
      return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
      );
    }

    _localTodayAtHour(hour, minute = 0) {
      const d = new Date();
      d.setHours(hour, minute, 0, 0);
      return d;
    }

    _isLocalTimeAtOrAfterRememberTodayCutoff(date = new Date()) {
      return date.getHours() >= this._rememberTodayCutoffHourLocal();
    }

    _getRememberTodayScheduleStatusMessage() {
      return 'Reminder set. It\u2019s heading your way later today \u2661';
    }

    _computeRememberTodayFireAt(existingIso, now = new Date()) {
      const lateNightMs = this._rememberTodayLateNightDelayMs();
      const cutoffToday = this._localTodayAtHour(this._rememberTodayCutoffHourLocal(), 0);

      if (this._isLocalTimeAtOrAfterRememberTodayCutoff(now)) {
        return new Date(now.getTime() + lateNightMs);
      }

      const existing = String(existingIso || '').trim();
      if (existing) {
        const parsed = new Date(existing);
        if (
          !Number.isNaN(parsed.getTime()) &&
          parsed.getTime() > now.getTime() &&
          this._isSameLocalCalendarDay(parsed, now) &&
          parsed.getTime() <= cutoffToday.getTime()
        ) {
          return parsed;
        }
      }

      const minMs = Math.max(
        60_000,
        Number(CONFIG.REMEMBER_TODAY?.MIN_DELAY_MS) || 2 * 60 * 60 * 1000
      );
      const maxMs = Math.max(
        minMs + 60_000,
        Number(CONFIG.REMEMBER_TODAY?.MAX_DELAY_MS) || 8 * 60 * 60 * 1000
      );
      const span = maxMs - minMs;
      const delay = minMs + Math.floor(Math.random() * (span > 0 ? span : 1));
      let fireAt = new Date(now.getTime() + delay);

      if (fireAt.getTime() > cutoffToday.getTime()) {
        fireAt = new Date(cutoffToday);
      }

      if (fireAt.getTime() <= now.getTime()) {
        fireAt = new Date(now.getTime() + lateNightMs);
      }

      return fireAt;
    }

    async _cancelRememberTodayNotification() {
      const localNotifications = this.getLocalNotificationsPlugin();
      if (!localNotifications) return;
      const notifId = CONFIG.REMEMBER_TODAY?.LOCAL_NOTIF_ID || 9212088;
      try {
        await localNotifications.cancel({ notifications: [{ id: notifId }] });
      } catch (_) {
        /* no-op */
      }
    }

    async ensureRememberTodayNotificationPermission(previewBody = '') {
      const localNotifications = this.getLocalNotificationsPlugin();
      if (!localNotifications) return false;

      let display;
      try {
        const perm = await localNotifications.checkPermissions();
        display = perm?.display;
      } catch (error) {
        this.logger.warn('Remember-today checkPermissions failed:', error);
        return false;
      }
      if (display === 'granted') return true;

      const sample = String(previewBody || '').trim() || 'Something from today you wanted to keep.';
      const ok = await this.uiService.showPushNotificationOptIn({
        sampleBody: sample,
        iconUrl: CONFIG.APP.notificationIconUrl
      });
      if (!ok) {
        this.uiService.showToast('Notifications are off. You can enable them in iPhone Settings.');
        return false;
      }

      try {
        const requested = await localNotifications.requestPermissions();
        display = requested?.display;
      } catch (error) {
        this.logger.warn('Remember-today requestPermissions failed:', error);
        return false;
      }
      if (display !== 'granted') {
        this.uiService.showToast('Notifications are off. You can enable them in iPhone Settings.');
        return false;
      }
      return true;
    }

    async _syncRememberTodayNotification() {
      const dk = this._rememberTodayDateKey();
      const state = this.readRememberTodayState(dk) || {
        dateKey: dk,
        kinds: [],
        segments: {},
        thoughtsDraft: '',
        fireAtIso: ''
      };

      if (!state.kinds.length) {
        await this._cancelRememberTodayNotification();
        this.writeRememberTodayState({ dateKey: dk, kinds: [], segments: {}, fireAtIso: '' });
        return null;
      }

      const body = this._buildRememberTodayNotificationBody(state.kinds, state.segments);
      if (!body) {
        await this._cancelRememberTodayNotification();
        this.writeRememberTodayState({ dateKey: dk, kinds: [], segments: {}, fireAtIso: '' });
        return null;
      }

      const permitted = await this.ensureRememberTodayNotificationPermission(body);
      if (!permitted) return null;

      const localNotifications = this.getLocalNotificationsPlugin();
      if (!localNotifications) return null;

      const fireAt = this._computeRememberTodayFireAt(state.fireAtIso);
      const notifId = CONFIG.REMEMBER_TODAY?.LOCAL_NOTIF_ID || 9212088;

      try {
        await localNotifications.cancel({ notifications: [{ id: notifId }] });
      } catch (_) {
        /* no-op */
      }

      try {
        await localNotifications.schedule({
          notifications: [{
            id: notifId,
            title: '',
            body,
            schedule: { at: fireAt, allowWhileIdle: true },
            extra: {
              type: 'remember_today',
              dateKey: dk,
              kinds: JSON.stringify(state.kinds)
            }
          }]
        });
      } catch (error) {
        this.logger.warn('Remember-today schedule failed:', error);
        return null;
      }

      const iso = fireAt.toISOString();
      this.writeRememberTodayState({
        dateKey: dk,
        kinds: state.kinds,
        segments: state.segments,
        fireAtIso: iso
      });
      return iso;
    }

    refreshRememberTodayFooterVisibility() {
      const native = this.isRememberTodayNativeAvailable();
      const state = native ? this.readRememberTodayState() : null;
      const scheduled = !!(state && state.kinds && state.kinds.length);
      ['quiltRememberTodayBtn'].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.removeAttribute('hidden');
        btn.setAttribute('aria-pressed', native && scheduled ? 'true' : 'false');
      });
    }

    _getRememberTodayCompanionParts(quote = null) {
      const qs = this.quoteService;
      const today = this._getRememberTodayQuote(quote);
      return qs?.getArtRecBeforeYouGoParts?.(today) || { titleLine: '', blurb: '', iconName: '' };
    }

    /** Title line: roman up through the colon; italic everything after it. */
    _appendArtRecTitleColonItalic(container, title) {
      const t = String(title || '').trim();
      if (!t || !container) return;
      const idx = t.indexOf(':');
      if (idx === -1) {
        container.classList.add('art-rec-title--all-italic');
        container.appendChild(document.createTextNode(t));
        return;
      }
      const before = t.slice(0, idx + 1);
      const after = t.slice(idx + 1);
      if (before) {
        const prefix = document.createElement('span');
        prefix.className = 'art-rec-title-prefix';
        prefix.textContent = before;
        container.appendChild(prefix);
      }
      if (after) {
        const suffix = document.createElement('span');
        suffix.className = 'art-rec-title-after-colon';
        suffix.textContent = after;
        container.appendChild(suffix);
      }
    }

    /** DOM for companion (art_recs) — icon from art_recs_type, then title; blurb on next line. */
    _mountRememberTodayArtRecText(el, { titleLine = '', blurb = '', iconName = '' } = {}) {
      if (!el) return;
      const title = String(titleLine || '').trim();
      const b = String(blurb || '').replace(/\s+/g, ' ').trim();
      el.replaceChildren();
      el.classList.remove('art-rec-title--all-italic');
      if (!title && !b) return;
      const line = document.createElement('span');
      line.className = 'remember-today-art-rec-line';
      if (iconName) {
        const iconEl = document.createElement('span');
        iconEl.className = 'material-symbols-outlined art-rec-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.translate = false;
        iconEl.textContent = iconName;
        line.appendChild(iconEl);
      }
      if (title) this._appendArtRecTitleColonItalic(line, title);
      el.appendChild(line);
      if (b) {
        el.appendChild(document.createElement('br'));
        el.appendChild(document.createTextNode(b));
      }
    }

    _rememberTodayKickerLabel(kind) {
      const k = String(kind || '').trim();
      if (k === 'mood') {
        const pick = this._getRememberTodayMoodPick();
        return pick?.kicker || 'MESSAGE FOR YOU';
      }
      const labels = {
        quote: "Today's Quote",
        color: 'Your color',
        watch_for: 'Watch for',
        companion: 'Companion piece:',
        thoughts: 'Something else'
      };
      return labels[k] || '';
    }

    _buildRememberTodayViewEntries(dateKey = this._rememberTodayDateKey()) {
      const state = this.readRememberTodayState(dateKey);
      const kinds = Array.isArray(state?.kinds) ? state.kinds : [];
      if (!kinds.length) return [];

      const priority = CONFIG.REMEMBER_TODAY?.SEGMENT_PRIORITY || [
        'mood',
        'watch_for',
        'quote',
        'color',
        'companion',
        'thoughts'
      ];
      const ordered = [];
      priority.forEach((k) => {
        if (kinds.includes(k)) ordered.push(k);
      });
      kinds.forEach((k) => {
        if (!ordered.includes(k)) ordered.push(k);
      });

      const isToday = dateKey === this._rememberTodayDateKey();
      const quote = isToday
        ? this._getRememberTodayQuote()
        : this.quoteService?.getQuoteForDate?.(dateKey) || null;
      const entries = [];
      ordered.forEach((kind) => {
        let text = String(state.segments?.[kind] || '').trim();
        if (!text) {
          if (kind === 'quote') {
            text = String(this._rememberTodayQuoteSegment(quote) || '').trim();
          } else if (kind === 'color') {
            text = String(this._rememberTodayColorSegment(dateKey) || '').trim();
          } else {
            text = String(this._rememberTodaySegment(kind, quote) || '').trim();
          }
        }
        if (!text) return;
        entries.push({
          kind,
          kicker: this._rememberTodayKickerLabel(kind),
          text
        });
      });
      return entries;
    }

    prepareRememberTodayArchiveScreen() {
      const feed = document.getElementById('rememberTodayArchiveFeed');
      const emptyEl = document.getElementById('rememberTodayArchiveEmpty');
      const clearBtn = document.getElementById('rememberTodayArchiveClearBtn');
      if (!feed) return;

      const items = this.listRememberTodayArchiveStates();
      feed.replaceChildren('');

      items.forEach((state) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'remember-today-archive-row';
        row.setAttribute('role', 'listitem');
        row.setAttribute('data-remember-date-key', state.dateKey);
        const unread = !String(state.viewedAt || '').trim();
        if (unread) row.classList.add('remember-today-archive-row--unread');

        const head = document.createElement('div');
        head.className = 'remember-today-archive-row__head';
        const title = document.createElement('p');
        title.className = 'remember-today-archive-row__title';
        title.textContent = this._rememberTodayViewTitleLabel(state.dateKey);
        head.appendChild(title);
        if (unread) {
          const dot = document.createElement('span');
          dot.className = 'remember-today-archive-row__unread';
          dot.setAttribute('aria-hidden', 'true');
          head.appendChild(dot);
        }

        const preview = document.createElement('p');
        preview.className = 'remember-today-archive-row__preview';
        preview.textContent = this._rememberTodayArchivePreview(state);

        row.append(head, preview);
        feed.appendChild(row);
      });

      const hasItems = items.length > 0;
      if (emptyEl) emptyEl.hidden = hasItems;
      if (clearBtn) {
        clearBtn.hidden = !hasItems;
        clearBtn.setAttribute('aria-hidden', hasItems ? 'false' : 'true');
      }
      this.refreshRememberTodayArchiveSettingsLink();
    }

    _maybeTrackViewSavedReminder(dateKey, source) {
      const dk = String(dateKey || '').trim();
      if (!dk || typeof window.odqTrack !== 'function') return;
      const state = this.readRememberTodayState(dk);
      if (!Array.isArray(state?.kinds) || !state.kinds.length) return;
      window.odqTrack('view_saved_reminder', {
        date_key: dk,
        source: String(source || 'direct').slice(0, 32)
      });
    }

    prepareRememberTodayViewScreen(dateKey = this._rememberTodayDateKey()) {
      const dk = String(dateKey || this._rememberTodayDateKey()).trim() || this._rememberTodayDateKey();
      this._rememberTodayViewOpenDateKey = dk;
      const titleEl = document.getElementById('rememberTodayViewTitle');
      if (titleEl) titleEl.textContent = this._rememberTodayViewTitleLabel(dk);
      const root = document.getElementById('rememberTodayViewItems');
      const emptyEl = document.getElementById('rememberTodayViewEmpty');
      const entries = this._buildRememberTodayViewEntries(dk);

      if (!root) return;
      root.replaceChildren('');
      entries.forEach(({ kind, kicker, text }) => {
        const block = document.createElement('article');
        block.className = 'remember-today-view-block';
        block.setAttribute('role', 'listitem');
        block.setAttribute('data-remember-kind', kind);
        const slab = document.createElement('div');
        slab.className = 'remember-today-view-block__slab';
        const head = document.createElement('div');
        head.className = 'remember-today-view-block__head';
        const kickerEl = document.createElement('p');
        kickerEl.className = 'remember-today-view-block__kicker';
        kickerEl.textContent = kicker;
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'remember-today-view-copy-btn';
        copyBtn.setAttribute('aria-label', `Copy ${kicker}`);
        const copyIcon = document.createElement('span');
        copyIcon.className = 'material-symbols-outlined';
        copyIcon.setAttribute('aria-hidden', 'true');
        copyIcon.setAttribute('translate', 'no');
        copyIcon.textContent = 'content_copy';
        copyBtn.append(copyIcon);
        head.append(kickerEl, copyBtn);

        if (kind === 'color') {
          const pick = this._getRememberTodayColorPick(dk);
          const preview = document.createElement('div');
          preview.className = 'remember-today-color-preview';
          const swatch = document.createElement('div');
          swatch.className = 'remember-today-color-swatch';
          swatch.setAttribute('aria-hidden', 'true');
          const meta = document.createElement('div');
          meta.className = 'remember-today-color-meta';
          const nameEl = document.createElement('p');
          nameEl.className = 'remember-today-color-name';
          const hexEl = document.createElement('p');
          hexEl.className = 'remember-today-color-hex';
          meta.append(nameEl, hexEl);
          preview.append(swatch, meta);
          if (pick) this._syncRememberTodayColorPreview(preview, pick);
          const copySource = document.createElement('p');
          copySource.className =
            'remember-today-view-block__text remember-today-view-block__text--copy-source';
          copySource.textContent = text;
          slab.append(head, preview, copySource);
        } else if (kind === 'companion') {
          const textEl = document.createElement('p');
          textEl.className = 'remember-today-view-block__text';
          const quoteForDay =
            dk === this._rememberTodayDateKey()
              ? this._getRememberTodayQuote()
              : this.quoteService?.getQuoteForDate?.(dk) || null;
          const liveParts = this._getRememberTodayCompanionParts(quoteForDay);
          let parts = liveParts;
          if (text) {
            const lines = String(text).split('\n');
            parts = {
              titleLine: String(lines[0] || '').trim(),
              blurb: lines.slice(1).join('\n').replace(/\s+/g, ' ').trim(),
              iconName: liveParts.iconName
            };
          }
          this._mountRememberTodayArtRecText(textEl, parts);
          const copySource = document.createElement('p');
          copySource.className =
            'remember-today-view-block__text remember-today-view-block__text--copy-source';
          copySource.hidden = true;
          copySource.textContent = text;
          slab.append(head, textEl, copySource);
        } else {
          const textEl = document.createElement('p');
          textEl.className = 'remember-today-view-block__text';
          textEl.textContent = text;
          slab.append(head, textEl);
        }

        block.append(slab);
        root.append(block);
      });

      if (emptyEl) emptyEl.hidden = entries.length > 0;
      if (entries.length > 0) {
        this.markRememberTodayViewed(dk);
        this.refreshRememberTodayArchiveSettingsLink();
      }
      this._bindRememberTodayViewCopy();
      this._syncRememberTodayScrollFooter('screen-remember-today-view');
    }

    _bindRememberTodayViewCopy() {
      const root = document.getElementById('rememberTodayViewItems');
      if (!root || root.dataset.copyBound === '1') return;
      root.dataset.copyBound = '1';
      root.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('.remember-today-view-copy-btn');
        if (!btn || btn.disabled) return;
        const text = btn
          .closest('.remember-today-view-block')
          ?.querySelector(
            '.remember-today-view-block__text--copy-source, .remember-today-view-block__text'
          )
          ?.textContent
          ?.trim();
        if (!text) return;
        void this._copyRememberTodayViewText(text, btn);
      });
    }

    async _copyRememberTodayViewText(text, btn) {
      const value = String(text || '').trim();
      if (!value) return;

      const copied = await this._writeTextToClipboard(value);
      if (copied) {
        this.uiService.showToast('Copied');
        const prevLabel = btn.getAttribute('aria-label') || 'Copy';
        btn.setAttribute('aria-label', 'Copied');
        window.setTimeout(() => btn.setAttribute('aria-label', prevLabel), 1500);
        return;
      }
      this.uiService.showToast('Couldn’t copy — try selecting the text.');
    }

    async _writeTextToClipboard(text) {
      const value = String(text || '');
      if (!value) return false;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch (error) {
        this.logger.warn('Clipboard API failed:', error);
      }

      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return !!ok;
      } catch (error) {
        this.logger.warn('execCommand copy failed:', error);
        return false;
      }
    }

    _syncRememberTodayScrollFooter(screenId = 'screen-remember-today') {
      this._syncScrollScreenFooter(screenId, {
        footerSelector: '.remember-today-footer',
        sentinelSelector: '.remember-today-scroll-end',
        visibleClass: 'remember-today-footer--visible',
        innerSelector: '.remember-today-inner, .remember-today-view-inner'
      });
    }

    _syncSettingsScrollFooter() {
      this._syncScrollScreenFooter('screen-settings', {
        footerSelector: '.settings-footer',
        sentinelSelector: '.settings-scroll-end',
        visibleClass: 'settings-footer--visible',
        innerSelector: '.settings-inner'
      });
    }

    _syncScrollScreenFooter(screenId, {
      footerSelector,
      sentinelSelector,
      visibleClass,
      innerSelector
    } = {}) {
      const screen = document.getElementById(screenId);
      const footer = screen?.querySelector(footerSelector);
      const sentinel = screen?.querySelector(sentinelSelector);
      if (!screen || !footer || !sentinel || !visibleClass) return;

      const update = () => {
        if (!screen.classList.contains('active')) {
          footer.classList.remove(visibleClass);
          return;
        }
        const noOverflow = screen.scrollHeight <= screen.clientHeight + 2;
        if (noOverflow) {
          footer.classList.add(visibleClass);
          return;
        }
        const rect = sentinel.getBoundingClientRect();
        const rootRect = screen.getBoundingClientRect();
        const atBottom = rect.top <= rootRect.bottom + 4;
        footer.classList.toggle(visibleClass, atBottom);
        if (screenId === 'screen-remember-today' || screenId === 'screen-remember-today-view') {
          this._syncRememberTodayFixedFooterLeakGuard();
        } else if (screenId === 'screen-settings') {
          this._syncSettingsFixedFooterLeakGuard();
        }
      };

      const bindKey =
        screenId === 'screen-settings'
          ? 'settingsScrollFooterBound'
          : screenId === 'screen-remember-today-view'
            ? 'rememberViewScrollFooterBound'
            : 'rememberScrollFooterBound';
      if (screen.dataset[bindKey] !== '1') {
        screen.dataset[bindKey] = '1';
        screen.addEventListener('scroll', update, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
          const ro = new ResizeObserver(() => requestAnimationFrame(update));
          ro.observe(screen);
          const inner = innerSelector
            ? screen.querySelector(innerSelector.split(',').map((s) => s.trim()).join(', '))
            : null;
          if (inner) ro.observe(inner);
          this._scrollScreenFooterResizeObservers =
            this._scrollScreenFooterResizeObservers || [];
          this._scrollScreenFooterResizeObservers.push(ro);
        }
      }
      requestAnimationFrame(update);
    }

    _syncSettingsFixedFooterLeakGuard() {
      try {
        const screen = document.getElementById('screen-settings');
        const footer = screen?.querySelector?.('.settings-footer');
        if (!screen || !footer) return;
        if (screen.classList.contains('active')) {
          footer.style.removeProperty('display');
          footer.style.removeProperty('visibility');
          footer.style.removeProperty('pointer-events');
          footer.style.removeProperty('opacity');
        } else {
          footer.classList.remove('settings-footer--visible');
          footer.style.setProperty('display', 'none', 'important');
          footer.style.setProperty('visibility', 'hidden', 'important');
          footer.style.setProperty('pointer-events', 'none', 'important');
          footer.style.setProperty('opacity', '0', 'important');
        }
      } catch (_) {
        /* ignore */
      }
    }

    prepareRememberTodayScreen() {
      void this.maybeCancelRememberTodayForStaleDay();
      this._bindRememberTodayThoughtsInput();
      this.refreshRememberTodayScreen();
      this.refreshRememberTodayFooterVisibility();
      this._syncRememberTodayScrollFooter('screen-remember-today');
    }

    refreshRememberTodayScreen() {
      const itemsRoot = document.getElementById('rememberTodayItems');

      const quote = this._getRememberTodayQuote();
      const dk = this._rememberTodayDateKey();
      let state = this.readRememberTodayState(dk) || {
        dateKey: dk,
        kinds: [],
        segments: {},
        thoughtsDraft: '',
        fireAtIso: ''
      };

      const thoughtsInput = document.getElementById('rememberTodayThoughtsInput');
      if (thoughtsInput && document.activeElement !== thoughtsInput) {
        thoughtsInput.value = String(
          state.thoughtsDraft || state.segments?.thoughts || ''
        ).trim();
      }

      if (!itemsRoot) return;
      let mutated = false;
      let visibleCount = 0;
      itemsRoot.querySelectorAll('.remember-today-item').forEach((item) => {
        const kind = String(item.getAttribute('data-remember-kind') || '').trim();
        const textEl = item.querySelector('.remember-today-item__text');
        const kickerEl = item.querySelector('.remember-today-item__kicker');
        const includeBtn = item.querySelector('.remember-today-item__include');
        let segment = this._rememberTodaySegment(kind, quote);
        const selected = state.kinds.includes(kind);

        if (kind === 'thoughts') {
          visibleCount += 1;
          item.hidden = false;
          const thoughtsText = this._readRememberTodayThoughtsFromInput();
          state.thoughtsDraft = thoughtsText;
          if (includeBtn) {
            includeBtn.disabled = !thoughtsText;
            includeBtn.setAttribute('aria-pressed', selected ? 'true' : 'false');
            includeBtn.textContent = selected ? 'Included' : 'Include';
          }
          item.classList.toggle('is-selected', selected && !!thoughtsText);
          if (!thoughtsText && selected) {
            state.kinds = state.kinds.filter((k) => k !== 'thoughts');
            delete state.segments.thoughts;
            mutated = true;
          } else if (selected && thoughtsText && state.segments.thoughts !== thoughtsText) {
            state.segments.thoughts = thoughtsText;
            mutated = true;
          }
          return;
        }

        if (kind === 'mood') {
          const pick = this._getRememberTodayMoodPick();
          if (!pick) {
            item.hidden = true;
            item.classList.remove('is-selected');
            if (selected) {
              state.kinds = state.kinds.filter((k) => k !== kind);
              delete state.segments[kind];
              mutated = true;
            }
            return;
          }
          segment = pick.body;
          if (kickerEl) kickerEl.textContent = pick.kicker || 'MESSAGE FOR YOU';
        }

        if (kind === 'color') {
          const pick = this._getRememberTodayColorPick(dk);
          if (!pick) {
            item.hidden = true;
            item.classList.remove('is-selected');
            if (selected) {
              state.kinds = state.kinds.filter((k) => k !== kind);
              delete state.segments[kind];
              mutated = true;
            }
            return;
          }
          segment = this._rememberTodayColorSegment(dk);
          this._syncRememberTodayColorPreview(item, pick);
          visibleCount += 1;
          item.hidden = false;
          if (textEl) textEl.textContent = segment;
          if (includeBtn) {
            includeBtn.disabled = false;
            includeBtn.setAttribute('aria-pressed', selected ? 'true' : 'false');
            includeBtn.textContent = selected ? 'Included' : 'Include';
          }
          item.classList.toggle('is-selected', selected);
          if (selected && state.segments[kind] !== segment) {
            state.segments[kind] = segment;
            mutated = true;
          }
          return;
        }

        if (!segment) {
          item.hidden = true;
          item.classList.remove('is-selected');
          if (selected) {
            state.kinds = state.kinds.filter((k) => k !== kind);
            delete state.segments[kind];
            mutated = true;
          }
          return;
        }

        visibleCount += 1;
        item.hidden = false;
        if (textEl) {
          if (kind === 'companion') {
            this._mountRememberTodayArtRecText(textEl, this._getRememberTodayCompanionParts(quote));
          } else {
            textEl.textContent = segment;
          }
        }
        if (includeBtn) {
          includeBtn.disabled = false;
          includeBtn.setAttribute('aria-pressed', selected ? 'true' : 'false');
          includeBtn.textContent = selected ? 'Included' : 'Include';
        }
        item.classList.toggle('is-selected', selected);
        if (selected && state.segments[kind] !== segment) {
          state.segments[kind] = segment;
          mutated = true;
        }
      });

      this.writeRememberTodayState(state);
      if (mutated) {
        void this._syncRememberTodayNotification();
      }

      this._syncRememberTodayScrollFooter('screen-remember-today');
    }

    async handleRememberTodayChipToggle(kind, shouldSelect) {
      if (!this.isRememberTodayNativeAvailable()) {
        this.uiService.showToast('Reminders are available in the app on your phone.');
        return;
      }

      const k = String(kind || '').trim();
      const dk = this._rememberTodayDateKey();
      const quote = this._getRememberTodayQuote();
      const state = this.readRememberTodayState(dk) || {
        dateKey: dk,
        kinds: [],
        segments: {},
        thoughtsDraft: '',
        fireAtIso: ''
      };

      if (shouldSelect) {
        if (!this.isRememberTodayKindAvailable(k, quote)) {
          this.uiService.showToast(
            k === 'thoughts'
              ? 'Write a random thought first.'
              : 'Nothing to remember for that yet today.'
          );
          this.refreshRememberTodayScreen();
          return;
        }
        const segment = this._rememberTodaySegment(k, quote);
        if (!state.kinds.includes(k)) state.kinds.push(k);
        state.segments[k] = segment;
      } else {
        state.kinds = state.kinds.filter((x) => x !== k);
        delete state.segments[k];
      }

      this.writeRememberTodayState(state);
      this.refreshRememberTodayScreen();

      const iso = await this._syncRememberTodayNotification();
      if (shouldSelect && typeof window.odqTrack === 'function') {
        window.odqTrack('set_reminder', { kind: k });
      }
      this.refreshRememberTodayFooterVisibility();
      this.refreshRememberTodayArchiveSettingsLink();
      if (iso && state.kinds.length) {
        this.uiService.showToast(this._getRememberTodayScheduleStatusMessage());
      } else if (!state.kinds.length) {
        this.uiService.showToast('Reminder cleared.');
      }
    }

    _rememberTodayScheduledNotificationId() {
      return Number(CONFIG.REMEMBER_TODAY?.LOCAL_NOTIF_ID || 9212088);
    }

    _rememberTodayNotificationPayloadFromEvent(event) {
      const action = event || {};
      const notification = action.notification || action || {};
      const nestedExtra =
        notification.extra && typeof notification.extra === 'object'
          ? notification.extra.extra || notification.extra.cap_extra || null
          : null;
      if (nestedExtra && typeof nestedExtra === 'object' && !notification.extra?.type) {
        return { ...notification, extra: { ...notification.extra, ...nestedExtra } };
      }
      return notification;
    }

    _rememberTodayNotificationBodyMatchesScheduled(body) {
      const text = String(body || '').trim();
      if (!text) return false;
      const dk = this._rememberTodayDateKey();
      const state = this.readRememberTodayState(dk);
      if (!state?.kinds?.length) return false;
      const scheduledBody = this._buildRememberTodayNotificationBody(state.kinds, state.segments);
      return !!scheduledBody && scheduledBody === text;
    }

    _rememberTodayDateKeyFromNotification(notification) {
      const n = notification || {};
      const extra = n.extra || {};
      const data = n.data || {};
      return (
        String(extra.dateKey || data.dateKey || '').trim() || this._rememberTodayDateKey()
      );
    }

    _isRememberTodayNotificationPayload(notification) {
      const n = notification || {};
      const extra = n.extra || {};
      const data = n.data || {};
      const type = String(extra.type || data.type || '').trim();
      if (type === 'remember_today') return true;
      const notifId = this._rememberTodayScheduledNotificationId();
      const id = Number(n.id ?? extra.id ?? data.id);
      if (Number.isFinite(id) && id === notifId) return true;
      const title = String(n.title ?? extra.title ?? data.title ?? '').trim();
      const body = String(n.body ?? extra.body ?? data.body ?? '').trim();
      if (title === '' && body && this._rememberTodayNotificationBodyMatchesScheduled(body)) {
        return true;
      }
      return false;
    }

    _isRememberTodayNotificationAction(event) {
      const action = event || {};
      if (String(action.actionId || '').trim() === 'dismiss') return false;
      const notification = this._rememberTodayNotificationPayloadFromEvent(action);
      if (this._isRememberTodayNotificationPayload(notification)) return true;
      if (String(action.actionId || 'tap').trim() !== 'tap') return false;
      const body = String(notification.body || '').trim();
      return body && this._rememberTodayNotificationBodyMatchesScheduled(body);
    }

    _stashRememberTodayViewOpenIntent(dateKey) {
      const dk = String(dateKey || '').trim();
      if (!dk) return;
      this._pendingRememberTodayViewDateKey = dk;
      this._skipFastPathForRememberToday = true;
      try {
        sessionStorage.setItem(
          'odqRememberTodayOpen',
          JSON.stringify({ dateKey: dk, at: Date.now() })
        );
      } catch (_) {
        /* no-op */
      }
    }

    _takeRememberTodayViewOpenIntent() {
      const pending = String(this._pendingRememberTodayViewDateKey || '').trim();
      if (pending) {
        this._pendingRememberTodayViewDateKey = null;
        this._skipFastPathForRememberToday = true;
        return pending;
      }
      try {
        const raw = sessionStorage.getItem('odqRememberTodayOpen');
        sessionStorage.removeItem('odqRememberTodayOpen');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const dk = String(parsed?.dateKey || '').trim();
        const ageMs = Date.now() - Number(parsed?.at || 0);
        if (!dk || !Number.isFinite(ageMs) || ageMs > 120000) return null;
        this._skipFastPathForRememberToday = true;
        return dk;
      } catch (_) {
        return null;
      }
    }

    async _awaitRememberTodayNotificationOpenIntent(maxWaitMs = 150) {
      const immediate = this._takeRememberTodayViewOpenIntent();
      if (immediate) return immediate;

      const waitMs = Math.max(0, Number(maxWaitMs) || 0);
      if (!waitMs) return null;

      // Push/local notification tap handlers attach at init-start; intent is usually
      // stashed during live sync. Brief poll covers late bridge delivery only.
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        const dk = this._takeRememberTodayViewOpenIntent();
        if (dk) return dk;
        await this.wait(16);
      }
      return this._takeRememberTodayViewOpenIntent();
    }

    _openRememberTodayFromNotification(event) {
      const notification = this._rememberTodayNotificationPayloadFromEvent(event);
      const dk = this._rememberTodayDateKeyFromNotification(notification);
      if (typeof window.odqTrack === 'function') {
        window.odqTrack('remember_notification_tap', { date_key: dk });
      }
      this._rememberTodayViewTrackSource = 'notification';
      this._stashRememberTodayViewOpenIntent(dk);
      this.clearPortalToQuoteIntroTimer();
      if (!this._postLiveSyncInitialized) {
        return;
      }
      this.prepareRememberTodayViewScreen(dk);
      this._maybeTrackViewSavedReminder(dk, this._rememberTodayViewTrackSource);
      this._rememberTodayViewTrackSource = null;
      this.uiService.showScreen('screen-remember-today-view');
    }

    _bindRememberTodayThoughtsInput() {
      const input = document.getElementById('rememberTodayThoughtsInput');
      if (!input || input.dataset.bound === '1') return;
      input.dataset.bound = '1';
      let timer = null;
      const flush = () => {
        timer = null;
        const dk = this._rememberTodayDateKey();
        const state = this.readRememberTodayState(dk) || {
          dateKey: dk,
          kinds: [],
          segments: {},
          thoughtsDraft: '',
          fireAtIso: ''
        };
        const text = this._readRememberTodayThoughtsFromInput();
        state.thoughtsDraft = text;
        if (state.kinds.includes('thoughts')) {
          if (!text) {
            state.kinds = state.kinds.filter((k) => k !== 'thoughts');
            delete state.segments.thoughts;
          } else {
            state.segments.thoughts = text;
          }
          this.writeRememberTodayState(state);
          void this._syncRememberTodayNotification().then(() => {
            this.refreshRememberTodayFooterVisibility();
          });
        } else {
          this.writeRememberTodayState(state);
        }
        const item = input.closest('.remember-today-item');
        const includeBtn = item?.querySelector('.remember-today-item__include');
        if (includeBtn) includeBtn.disabled = !text;
      };
      input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 400);
      });
      input.addEventListener('blur', () => {
        if (timer) clearTimeout(timer);
        flush();
      });
    }

    setupPushNotificationListeners() {
      const messaging = this.getFirebaseMessagingPlugin();
      const localNotifications = this.getLocalNotificationsPlugin();
      if ((!messaging && !localNotifications) || this._pushNotificationListenersReady) return;
      this._pushNotificationListenersReady = true;

      const isPersonalQuiltAction = (event) => {
        const data = event?.notification?.data || {};
        const extra = event?.notification?.extra || {};
        const kind = String(extra.kind || data.kind || '').trim();
        const type = String(extra.type || data.type || '').trim();
        return kind === 'personal_quilt_milestone' ||
          (type === 'color_milestone' && kind === 'personal_quilt_milestone');
      };

      const isRememberTodayAction = (event) => this._isRememberTodayNotificationAction(event);

      messaging?.addListener('tokenReceived', async (event) => {
        try {
          await this.registerDailyQuotePushToken(event?.token);
        } catch (error) {
          this.logger.warn('Push token refresh registration failed:', error);
        }
      });
      messaging?.addListener('notificationActionPerformed', (event) => {
        if (isPersonalQuiltAction(event)) {
          this.showPersonalQuiltReveal({ source: 'fcmActionPerformed' }).catch((error) => {
            this.logger.warn('Personal quilt reveal (fcm action) failed:', error);
          });
          return;
        }
        if (isRememberTodayAction(event)) {
          void this._openRememberTodayFromNotification(event);
          return;
        }
        this.uiService.showScreen('screen-quote');
      });
      localNotifications?.addListener('localNotificationActionPerformed', (event) => {
        if (isPersonalQuiltAction(event)) {
          this.showPersonalQuiltReveal({ source: 'localNotificationActionPerformed' }).catch((error) => {
            this.logger.warn('Personal quilt reveal (local action) failed:', error);
          });
          return;
        }
        if (isRememberTodayAction(event)) {
          void this._openRememberTodayFromNotification(event);
          return;
        }
        this.uiService.showScreen('screen-quote');
      });
      localNotifications?.addListener?.('localNotificationReceived', (event) => {
        if (!isPersonalQuiltAction(event)) return;
        this.showPersonalQuiltReveal({ source: 'localNotificationReceived' }).catch((error) => {
          this.logger.warn('Personal quilt reveal (foreground receipt) failed:', error);
        });
      });

    }

    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
    }

    waitForNextPaint() {
      return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
    }

    formatOrdinalNumber(value) {
      const n = Math.max(1, Math.floor(Number(value) || 1));
      const mod100 = n % 100;
      if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
      switch (n % 10) {
        case 1:
          return `${n}st`;
        case 2:
          return `${n}nd`;
        case 3:
          return `${n}rd`;
        default:
          return `${n}th`;
      }
    }

    getColorSubmitPlacementMessage() {
      return 'Adding your color';
    }

    getReadableTextColorForBackground(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
      if (!m) return '#2f2925';
      const h = m[1];
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      return luminance < 132 ? '#f6f4f1' : '#2f2925';
    }

    showColorSubmitTransition(color, message = this.getColorSubmitPlacementMessage()) {
      let overlay = document.getElementById('colorSubmitTransition');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'colorSubmitTransition';
        overlay.className = 'color-submit-transition';
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.innerHTML = `
          <div class="color-submit-transition__message"></div>
          <div class="color-submit-transition__spinner" aria-hidden="true"></div>
        `;
        document.body.appendChild(overlay);
      }
      overlay.style.backgroundColor = color;
      overlay.style.color = this.getReadableTextColorForBackground(color);
      const messageEl = overlay.querySelector('.color-submit-transition__message');
      if (messageEl) messageEl.textContent = message;
      requestAnimationFrame(() => overlay.classList.add('color-submit-transition--visible'));
      return overlay;
    }

    updateColorSubmitTransition(message) {
      const overlay = document.getElementById('colorSubmitTransition');
      const messageEl = overlay?.querySelector('.color-submit-transition__message');
      if (messageEl) messageEl.textContent = message;
    }

    hideColorSubmitTransition() {
      const overlay = document.getElementById('colorSubmitTransition');
      if (!overlay) return;
      overlay.classList.remove('color-submit-transition--visible');
      setTimeout(() => overlay.remove(), 150);
    }

    async handleAddColor() {
      try {
        console.log('🎨 handleAddColor called');
        if (!this._isPersonalQuiltMode && !this._liveDailyDataConfirmed) {
          this.uiService.showToast('Still connecting to today\'s quilt. Try again in a moment.');
          return;
        }
        if (this.isAdminTomorrowPreviewActive()) {
          this.uiService.showToast('Exit preview to add your color.');
          return;
        }
        if (this._isPersonalQuiltMode) {
          this._isPersonalQuiltMode = false;
          this._personalQuiltState = null;
          this.updatePersonalQuiltToggleButton();
        }
        
        const selectedColor = Utils.hsvToHex(this.selectedHue, this.selectedSaturation, this.selectedLightness);
        console.log('🎨 Selected color:', selectedColor, 'HSV(h,s,v%):', this.selectedHue, this.selectedSaturation, this.selectedLightness);
        
        // Debug logging
        // console.log('Color selection debug');
        
        if (!selectedColor || !Utils.validateHexColor(selectedColor)) {
          this.logger.warn('Invalid color selected');
          console.log('❌ Color validation failed:', { selectedColor, isValid: Utils.validateHexColor(selectedColor) });
          return;
        }

        // Update color directly (no parent communication needed)
        if (this.isColorPickerActive()) {
          if (window.ODQ_onColorChange) {
            try {
              window.ODQ_onColorChange(selectedColor);
            } catch (themeErr) {
              this.logger.warn('Theme update during color submit failed (non-fatal):', themeErr);
            }
          }
        }

        const failureMessage = 'We hit a snag. Mind trying again?';
        this.showColorSubmitTransition(selectedColor, this.getColorSubmitPlacementMessage());
        /* "Adding your color" overlay: hold for at least ~1.2s so the message
           is readable even when placement + paint finish in a few ms. */
        const minimumTransitionHold = this.wait(1200);
        await this.waitForNextPaint();
        const showTryAgain = async () => {
          await minimumTransitionHold;
          this.updateColorSubmitTransition(failureMessage);
          await this.wait(1200);
          this.hideColorSubmitTransition();
        };

        const applySelectedColorToCurrentQuilt = () => {
          if (!this.quiltEngine || typeof this.quiltEngine.addColor !== 'function') {
            this.logger.warn('handleAddColor: quiltEngine not available');
            return false;
          }
          let result;
          try {
            result = this.quiltEngine.addColor(selectedColor);
          } catch (addErr) {
            this.logger.error('handleAddColor: addColor threw', addErr);
            return false;
          }

          if (result) {
            try {
              // Find the new block for animation
              let newBlockIndex = -1;
              const appliedColor = Utils.validateHexColor(result.appliedColor) ? result.appliedColor : selectedColor;
              if (result.newBlocks && result.newBlocks.length > 0) {
                const finalDedicatedBlock = result.dedicatedBlockId
                  ? this.quiltEngine.blocks.find(block => block.id === result.dedicatedBlockId)
                  : null;
                // If splitting occurred, find the final surviving user-contribution block.
                const newBlock =
                  finalDedicatedBlock ||
                  result.newBlocks.find(block => block.id === result.dedicatedBlockId) ||
                  result.newBlocks.find(block => block.color === appliedColor) ||
                  result.newBlocks.find(block => block.color === selectedColor);
                if (newBlock) {
                  newBlockIndex = this.quiltEngine.blocks.findIndex(block => block.id === newBlock.id);
                  if (newBlockIndex !== -1) {
                    this._latestDedicatedBlockId = newBlock.id || '';
                  }
                }
                if (newBlockIndex === -1) {
                  const userIds = [this.currentUserId, this.quiltEngine?.deviceId]
                    .map((id) => String(id || '').trim())
                    .filter(Boolean);
                  const newestUserBlock = this.quiltEngine.blocks.find((block) => {
                    const ids = Array.isArray(block.contributorIds) ? block.contributorIds : [];
                    return (
                      Number(block.submissionIndex) === Number(result.submissionIndex) &&
                      (
                        userIds.includes(String(block.contributorId || '').trim()) ||
                        ids.some((id) => userIds.includes(String(id || '').trim()))
                      )
                    );
                  });
                  if (newestUserBlock) {
                    newBlockIndex = this.quiltEngine.blocks.findIndex(block => block.id === newestUserBlock.id);
                    this._latestDedicatedBlockId = newestUserBlock.id || '';
                  }
                }
              } else if (result.id) {
                // If it's a single new block
                newBlockIndex = this.quiltEngine.blocks.findIndex(block => block.id === result.id);
                this._latestDedicatedBlockId = result.id || '';
              }
              if (this._latestDedicatedBlockId) {
                try {
                  localStorage.setItem('ourDailyLatestDedicatedBlockId', this._latestDedicatedBlockId);
                } catch (storageError) {
                  console.warn('Could not persist latest dedicated block id:', storageError);
                }
              }

              // Set the last added index for animation
              if (newBlockIndex !== -1) {
                console.log(`🎬 Animation: Setting newBlockIndex to ${newBlockIndex} for color ${selectedColor}`);
                this.renderer.setLastAddedIndex(newBlockIndex);
              } else {
                console.log(`🎬 Animation: No newBlockIndex found for color ${selectedColor}`);
              }

              this.recordDailyContributorForCurrentUser();
            } catch (postPlacementErr) {
              this.logger.warn(
                'handleAddColor: post-placement UI failed; quilt state may already include the new color:',
                postPlacementErr
              );
            }
          }

          return result;
        };

        let result = applySelectedColorToCurrentQuilt();
        if (!result) {
          try {
            const n = this.quiltEngine?.blocks?.length;
            const sub = this.quiltEngine?.submissionCount;
            this.logger.warn('handleAddColor: placement returned no result', {
              blocks: n,
              submissionCount: sub,
              color: selectedColor
            });
          } catch (_) {
            /* */
          }
          await showTryAgain();
          return;
        }

        if (result) {
          if (typeof window.odqTrack === 'function') {
            window.odqTrack('add_color', {
              block_count: Number(this.quiltEngine?.submissionCount) || 0,
              submission_index: Number(result.submissionIndex) || 0
            });
          }
          this.markDailyColorCompleted();
          await minimumTransitionHold;
          this._cancelDeferredQuiltRenderForIdle();
          this.uiService.showScreen('screen-quilt');
          await this.waitForNextPaint();
          this.hideColorSubmitTransition();
          await this.waitForNextPaint();
          try {
            this.renderQuilt();
            this.applyQuiltMoodTriptychPalette();
            this.refreshQuiltFortuneReveal();
          } catch (renderError) {
            this.logger.warn('Color was saved, but quilt refresh hit a non-blocking error:', renderError);
          } finally {
            this.ensureQuiltScreenInteractive();
          }
          this.scheduleQuiltScrollCue(500);
          if (this.isPersonalQuiltEnabled()) {
            this.schedulePersonalQuiltPreviewCacheWarmup();
          }
          this.maybeCreateColorMilestoneNotification(selectedColor).catch((error) => {
            this.logger.warn('Color milestone notification check failed:', error);
          });
          void (async () => {
            const saved = await this.saveQuilt();
            if (!saved) {
              this.uiService.showToast('Your color is here, but it may not have saved to the shared quilt yet.');
            }
          })().catch((saveError) => {
            this.logger.warn('Optimistic color save failed:', saveError);
            this.uiService.showToast('Your color is here, but it may not have saved to the shared quilt yet.');
          });
        }
        
      } catch (error) {
        this.updateColorSubmitTransition('We hit a snag. Mind trying again?');
        setTimeout(() => this.hideColorSubmitTransition(), 1200);
        this.errorHandler.handleError(error, 'handleAddColor');
      }
    }
  }

  SimplifiedQuiltAppV2Quilt.isStoredClippingExportStale = isStoredClippingExportStale;
  root.SimplifiedQuiltAppV2Quilt = SimplifiedQuiltAppV2Quilt;

  /** Console bypass when `window.app.fetchNewspaperClippingUrl` is stale or throws. */
  root.odqFetchNightlyClippingUrl = async function odqFetchNightlyClippingUrl(dateKey) {
    const dk = String(dateKey || '').trim();
    if (!dk || !root.db || !root.firestore?.doc || !root.firestore?.getDoc) return null;
    try {
      const snap = await root.firestore.getDoc(root.firestore.doc(root.db, 'instagram-images', dk));
      if (!firestoreSnapExists(snap)) return null;
      return readNewspaperClippingUrlFromDoc(snap.data()) || null;
    } catch (e) {
      console.warn('[our-daily] odqFetchNightlyClippingUrl failed:', e?.message || e);
      return null;
    }
  };
  root.withNewspaperClippingBrowserCacheBust = withNewspaperClippingBrowserCacheBust;
  root.readNewspaperClippingUrlOdqT = readNewspaperClippingUrlOdqT;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
