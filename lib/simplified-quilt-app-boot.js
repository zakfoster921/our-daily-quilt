/**
 * SimplifiedQuiltAppV2 boot slice: portal, live sync, quote flow, mood widgets (Phase C2).
 * Methods merged onto SimplifiedQuiltAppV2.prototype in the main app module.
 */
(function (root) {
  'use strict';

  /** Zak's reflection wall byline — module constant (statics on Boot are not on SimplifiedQuiltAppV2 instances). */
  const REFLECTION_FIRST_PATCH_AUTHOR = 'Zak';
  /** Base newsprint — same family as quote/mood newspaper clippings (`#f6f4f1`). */
  const REFLECTION_NEWSPAPER_PATCH_RGB = '246, 244, 241';
  /** Newsprint stack shades for reflection wall patches (not live quilt block colors). */
  const REFLECTION_NEWSPAPER_PATCH_HEX = [
    '#f6f4f1',
    '#f2f1ee',
    '#f4f0e6',
    '#f0ebe4',
    '#ebe8e3',
    '#ede8e0',
    '#f3efec',
    '#f5f2eb'
  ];
  class SimplifiedQuiltAppV2Boot {
    _maybeSnapPickerToDailyFirstPalette(opts = {}) {
      const forceDaily = opts.forceDaily === true;
      try {
        const today =
          typeof Utils !== 'undefined' && typeof Utils.getTodayKey === 'function'
            ? Utils.getTodayKey()
            : '';
        if (!today && !forceDaily) return;
        const key = 'ourDailyFirstPalettePickerDate';
        if (typeof localStorage !== 'undefined' && !forceDaily && localStorage.getItem(key) === today) {
          return;
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, today || String(Date.now()));
        }
        this._applyPickerHSVFromHex(CONFIG.APP.defaultColor);
        this.colorHasBeenSelected = false;
        this._hsvWheelCanvasKey = '';
        queueMicrotask(() => {
          if (typeof this.updateColorWheel === 'function') this.updateColorWheel();
        });
      } catch (_) {
        /* */
      }
    }

    _applyPickerHSVFromHex(hex) {
      const safe = /^#[0-9A-Fa-f]{6}$/.test(String(hex || '').trim()) ? String(hex).trim() : CONFIG.APP.defaultColor;
      const hsv = Utils.hexToHsv(safe);
      this.selectedHue = hsv.h;
      this.selectedSaturation = hsv.s;
      this.selectedLightness = hsv.v;
      this._hsvWheelCanvasKey = '';
    }

    checkDeviceAndRedirect() {
      try {
        const host = String(window.location.hostname || '').toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') return false;
      } catch (_) {
        /* */
      }
      // Use only iframe dimensions to avoid cross-origin issues
      const iframeWidth = window.innerWidth;
      
      // Simple desktop detection based on iframe width only
      // If iframe is wide enough, assume it's desktop
      const isDesktop = iframeWidth >= 768;
      
      console.log('🖥️ Desktop Detection:', {
        iframeWidth,
        isDesktop
      });
      
      if (isDesktop) {
        this.showDesktopRedirect();
        return true; // Indicate that redirect happened
      }
      return false; // No redirect, continue with normal initialization
    }

    showDesktopRedirect() {
      // Hide all existing content
      document.body.innerHTML = '';
      
      // Create redirect screen styled like ABOUT screen
      const redirectHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background-color: #f6f4f1;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 2rem;
          text-align: center;
        ">
                <h1 style="
      font-size: 2.5rem;
      font-weight: 400;
      margin-bottom: -1.5rem;
      color: #333;
    ">Welcome to</h1>

    <h1 style="
      font-size: 2.5rem;
      font-weight: 600;
      margin-bottom: 2rem;
      color: #333;
    ">OUR DAILY QUILT</h1>

    <p style="
      font-size: 1.3rem;
      line-height: 1.6;
      margin-bottom: 0.5rem;
      color: #333;
      max-width: 400px;
    ">Please switch to your phone<br>to add your block</p>

    <p style="
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
      color: #666;
    ">↓</p>
          
          <div id="qr-code" style="
            display: flex;
            justify-content: center;
            margin-bottom: 1rem;
          "></div>

          

        </div>
      `;
      
      document.body.innerHTML = redirectHTML;
      
      // Generate QR code
      this.generateQRCode();
    }

    _loadQrcodeScript() {
      if (typeof qrcode !== 'undefined') return Promise.resolve(true);
      if (this._qrcodeScriptPromise) return this._qrcodeScriptPromise;
      this._qrcodeScriptPromise = new Promise((resolve) => {
        const existing = document.querySelector('script[data-odq-qrcode]');
        if (existing) {
          existing.addEventListener('load', () => resolve(typeof qrcode !== 'undefined'), { once: true });
          existing.addEventListener('error', () => resolve(false), { once: true });
          return;
        }
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
        s.dataset.odqQrcode = '1';
        s.onload = () => resolve(typeof qrcode !== 'undefined');
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      });
      return this._qrcodeScriptPromise;
    }

    async generateQRCode() {
      const qrContainer = document.getElementById('qr-code');
      console.log('QR Container found:', qrContainer);
      
      if (qrContainer) {
        // Create QR code using live website URL
        const currentURL = window.location.href;
        console.log('QR Code URL:', currentURL);
        
        // Clear container first
        qrContainer.innerHTML = '';

        await this._loadQrcodeScript();
        
        if (typeof qrcode !== 'undefined') {
          try {
            // Generate real QR code using qrcode-generator library
            const qr = qrcode(0, 'M');
            qr.addData(currentURL);
            qr.make();
            
            // Create QR code as SVG with transparent background
            const svg = qr.createSvgTag({
              cellSize: 8,
              margin: 4,
              scalable: true,
              color: '#000000',
              background: 'transparent'
            });
            
            // Create container for the SVG
            const qrCodeContainer = document.createElement('div');
            qrCodeContainer.style.cssText = `
              width: 200px;
              height: 200px;
              background: #f6f4f1;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 10px;
            `;
            
            qrCodeContainer.innerHTML = svg;
            qrContainer.appendChild(qrCodeContainer);
            console.log('Real QR Code generated successfully');
          } catch (error) {
            console.error('QR Code generation failed:', error);
            this.createFallbackQRCode(qrContainer, currentURL);
          }
        } else {
          console.log('QR code library not available, using fallback');
          this.createFallbackQRCode(qrContainer, currentURL);
        }
      } else {
        console.error('QR container not found');
      }
    }

    createFallbackQRCode(container, url) {
      // Fallback to simple text display
      container.innerHTML = `
        <div style="
          width: 200px;
          height: 200px;
          background: #f6f4f1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          color: #666;
          text-align: center;
          padding: 1rem;
        ">QR Code<br>${url}</div>
      `;
    }

    _setConnectionProblemUi({ message, showRetry, retryDisabled }) {
      const screen = document.getElementById('screen-connection-problem');
      const h = document.getElementById('connectionProblemHeading');
      const btn = document.getElementById('connectionProblemRetryBtn');
      if (h && message) h.textContent = message;
      if (screen) {
        screen.classList.toggle('connection-problem--retry', showRetry === true);
      }
      if (btn) {
        btn.hidden = !showRetry;
        btn.disabled = retryDisabled === true;
      }
    }

    _clearConnectionProblemSlowDelay() {
      if (this._connectionProblemSlowDelayTimer) {
        clearTimeout(this._connectionProblemSlowDelayTimer);
        this._connectionProblemSlowDelayTimer = null;
      }
    }

    _shouldDeferConnectionProblemSlowUi() {
      if (this._liveDailyDataConfirmed) return true;
      if (this._hasCachedTodayQuilt()) return true;
      if (this.quoteService?.hasTodayQuotePinned?.()) return true;
      return false;
    }

    _startConnectionProblemSlowDelay() {
      this._clearConnectionProblemSlowDelay();
      const delayMs = Math.max(1000, Number(this._connectionProblemSlowDelayMs) || 8000);
      this._connectionProblemSlowDelayTimer = setTimeout(() => {
        this._connectionProblemSlowDelayTimer = null;
        const defer = this._shouldDeferConnectionProblemSlowUi();
        const alreadyActive = document.getElementById('screen-connection-problem')?.classList.contains('active');
        if (defer) return;
        if (alreadyActive) return;
        this._showConnectionProblemConnecting('slow-delay-timer');
      }, delayMs);
    }

    _beginLiveDailyPending() {
      document.body.classList.add('odq-live-daily-pending');
      this._startConnectionProblemSlowDelay();
    }

    _showConnectionProblemConnecting(source = 'unknown') {
      this._clearConnectionProblemSlowDelay();
      document.body.classList.add('odq-live-daily-pending');
      this._setConnectionProblemUi({
        message: 'Slow connection. Hang tight.',
        showRetry: false,
        retryDisabled: false
      });
      this.uiService?.showScreen?.('screen-connection-problem');
    }

    _showConnectionProblemFailed(_reason) {
      const joinOuter = document.getElementById('portalJoinLineOuter');
      this._clearConnectionProblemSlowDelay();
      document.body.classList.add('odq-live-daily-pending');
      this._setConnectionProblemUi({
        message: "Couldn't load today's quilt. Please check your connection and try again.",
        showRetry: true,
        retryDisabled: false
      });
      this.uiService?.showScreen?.('screen-connection-problem');
      if (window.odqPerfMark) window.odqPerfMark('launch-sync-failed');
      this._dismissBootSplash();
      this._notifyNativeLaunchCoverReady();
    }

    _hasCachedTodayQuilt() {
      const todayKey = Utils.getTodayKey();
      const loadedKey = String(this._loadedSharedQuiltDateKey || '').trim();
      return this._portalQuiltLoaded === true && !!loadedKey && loadedKey === todayKey;
    }

    /** If portal is still waiting on join dots, route to connection UI (never stale cache). */
    _startPortalJoinLineWatchdog() {
      if (this._portalJoinWatchdogTimer) {
        clearTimeout(this._portalJoinWatchdogTimer);
      }
      this._portalJoinWatchdogTimer = setTimeout(() => {
        this._portalJoinWatchdogTimer = null;
        if (this._liveDailyDataConfirmed) return;
        if (this._hasCachedTodayQuilt() || this._shouldDeferConnectionProblemSlowUi()) {
          return;
        }
        const outer = document.getElementById('portalJoinLineOuter');
        if (!outer?.classList.contains('portal-join-line-outer--awaiting')) return;
        this.logger.warn('Portal join line watchdog: live daily never confirmed');
        this._showConnectionProblemFailed('sync_timeout');
      }, 15000);
    }

    _clearPortalJoinLineWatchdog() {
      if (this._portalJoinWatchdogTimer) {
        clearTimeout(this._portalJoinWatchdogTimer);
        this._portalJoinWatchdogTimer = null;
      }
    }

    _shouldShowConnectionProblemForSyncFailure(result) {
      if (!result || result.ok) return false;
      if (result.reason === 'sync_in_flight' || result.transient === true) return false;
      /* Always block on failed server read — do not show yesterday's quilt/quote from cache. */
      return true;
    }

    _isQuiltOnlyLiveDailySyncMode(mode) {
      return mode === 'resume' || mode === 'launch-core';
    }

    async _syncLiveDailyQuotes() {
      const catalogOk = await this.quoteService.loadQuotesFromFirestore({ requireServer: true });
      if (!catalogOk) {
        return { ok: false, reason: 'quote_catalog' };
      }

      const indexesOk = await this.quoteService.regenerateShuffledIndexes({ requireServer: true });
      if (indexesOk === false) {
        return { ok: false, reason: 'quote_indexes' };
      }

      const quoteDateKey = this.quoteService.getQuoteCalendarKeyNow();
      const todayQuote = await this.quoteService.resolveAndPinCalendarKey(quoteDateKey, { requireLive: true });
      if (!todayQuote) {
        return { ok: false, reason: 'quote_assignment' };
      }

      await this.quoteService.hydrateMoodFieldsForCalendarKey(quoteDateKey, todayQuote);
      await this.quoteService.hydrateSpeakerCutoutFieldsForCalendarKey(quoteDateKey, todayQuote);

      await this.quoteService.primeQuoteAssignmentsNearTerm();
      return { ok: true };
    }

    _snapshotTodayQuoteForUi() {
      return this.quoteService?.getTodayQuote?.() || null;
    }

    /** Repaint quote screen + quilt quote widgets when today's pin changes. */
    _refreshQuiltQuoteUiAfterPin(beforeQuote) {
      const afterQuote = this.quoteService?.getTodayQuote?.();
      if (!afterQuote) return;
      const moodSig = (q) =>
        `${String(q?.goodDay ?? q?.good_day ?? '').trim()}\u0001${String(q?.roughDay ?? q?.rough_day ?? '').trim()}`;
      const watchSig = (q) =>
        String(
          q?.watch_for ??
            q?.watchFor ??
            q?.watch_for_snapshot ??
            q?.watchForSnapshot ??
            ''
        ).trim();
      const speakerSig = (q) =>
        String(
          q?.speakerCutoutUrl ??
            q?.speaker_cutout_url ??
            q?.speakerImageUrl ??
            q?.speaker_image_url ??
            ''
        ).trim();
      const unchanged =
        String(beforeQuote?.text || '').trim() === String(afterQuote?.text || '').trim() &&
        moodSig(beforeQuote) === moodSig(afterQuote) &&
        watchSig(beforeQuote) === watchSig(afterQuote) &&
        speakerSig(beforeQuote) === speakerSig(afterQuote);
      if (unchanged) return;
      this.quoteService.displayQuote();
      void this._primeQuiltQuoteChrome();
      this.updateBeforeYouGoSection?.();
    }

    _reflectionWallContentKey(themeEntries = []) {
      return JSON.stringify(
        (Array.isArray(themeEntries) ? themeEntries : []).map((entry) => ({
          text: String(entry?.text || '').trim(),
          author: String(entry?.author || '').trim()
        }))
      );
    }

    /**
     * Single entry for quilt lower sections — bootstrap (sync cache paint), rendered (post-quilt), network (reflection fetch).
     */
    _ensureQuiltLowerSections(options = {}) {
      const phase = String(options.phase || 'bootstrap').trim();
      const dateKey =
        options.dateKey ||
        (typeof this.getEffectiveAppDateKey === 'function'
          ? this.getEffectiveAppDateKey()
          : Utils.getTodayKey());

      if (phase === 'bootstrap') {
        this._paintReflectionWallBootstrap(dateKey);
        const qs = this.quoteService;
        qs?.populateReflectionPromptCard?.();
        this.updateBeforeYouGoSection?.();
        void this.loadReflectionThemesForToday?.().catch((error) => {
          this.logger?.warn?.('Reflection themes load failed:', error);
        });
        return;
      }

      if (phase === 'rendered') {
        const quote = this.quoteService?.getTodayQuote?.() || null;
        this.refreshQuiltReflectionScrapWidget?.(quote);
        if (options.scheduleStoryPreview === true) {
          this._scheduleStoryPreviewOnce?.();
        }
        return;
      }

      if (phase === 'network') {
        void this.loadReflectionThemesForToday?.().catch((error) => {
          this.logger?.warn?.('Reflection themes load failed:', error);
        });
      }
    }

    _scheduleStoryPreviewOnce() {
      if (this._layoutBStoryPreviewLaunchScheduled) return;
      const blockCount = Array.isArray(this.quiltEngine?.blocks) ? this.quiltEngine.blocks.length : 0;
      if (blockCount <= 1) return;
      this._layoutBStoryPreviewLaunchScheduled = true;
      void globalThis.ensureOdqCanvasFontsReady?.();
      void globalThis.odqPrefetchLayoutBKeywordEmphasis?.(
        typeof this.getEffectiveAppDateKey === 'function'
          ? this.getEffectiveAppDateKey()
          : Utils.getTodayKey()
      );
      this.scheduleLayoutBStoryPreviewRefresh?.();
    }

    /** @deprecated Use _ensureQuiltLowerSections({ phase: 'rendered' }) */
    _primeQuiltLowerSections() {
      this._ensureQuiltLowerSections({ phase: 'rendered' });
    }

    /**
     * Start render + lower sections during portal dwell so fast scrollers do not outrun async work.
     * Safe to call from bootstrap cache, live sync, and fast-path show.
     */
    _kickLaunchQuiltPipeline(options = {}) {
      this._ensureQuiltLowerSections({ phase: 'bootstrap' });
      if (this._launchQuiltPipelinePromise) {
        if (options.refresh === true) {
          this._launchQuiltPipelineRerunQueued = true;
        }
        return this._launchQuiltPipelinePromise;
      }
      this._launchQuiltPipelinePromise = (async () => {
        try {
          if (!this.renderer?.quiltSVG) {
            try {
              this.renderer.initialize();
            } catch (error) {
              this.logger?.warn?.('Launch pipeline renderer init skipped:', error);
              return;
            }
          }
          if (this._deferredQuiltRenderQueued) {
            this._cancelDeferredQuiltRenderForIdle?.();
          }
          const quote = this.quoteService?.getTodayQuote?.() || null;
          const cutoutUrl = String(
            quote?.speakerCutoutUrl ??
              quote?.speaker_cutout_url ??
              quote?.speakerCutoutUrlSnapshot ??
              ''
          ).trim();
          if (cutoutUrl && this.archiveService?._prepareSpeakerImageUrlForCanvas) {
            void this.archiveService._prepareSpeakerImageUrlForCanvas(cutoutUrl, { quote }).catch(() => {});
          }
          await this.renderQuilt?.();
          this._launchQuiltPipelineRendered = true;
          this._ensureQuiltLowerSections({ phase: 'rendered', scheduleStoryPreview: true });
          this.prewarmFooterIconChrome?.();
        } catch (error) {
          this.logger?.warn?.('Launch quilt pipeline failed:', error);
        } finally {
          this._launchQuiltPipelinePromise = null;
          if (this._launchQuiltPipelineRerunQueued) {
            this._launchQuiltPipelineRerunQueued = false;
            this._kickLaunchQuiltPipeline();
          }
        }
      })();
      return this._launchQuiltPipelinePromise;
    }

    async _syncLiveDailyQuotesInBackground() {
      if (this._liveDailyQuoteSyncInFlight) return;
      this._liveDailyQuoteSyncInFlight = true;
      try {
        const beforeQuote = this._snapshotTodayQuoteForUi();
        const firebaseReady = await LiveDailyDataSync.waitForFirebaseReady(20000);
        if (!firebaseReady) {
          this.logger.warn('Background quote sync skipped: Firebase unavailable');
          return;
        }
        const quotes = await this._syncLiveDailyQuotes();
        if (!quotes.ok) {
          this.logger.warn('Background quote sync failed:', quotes.reason);
          return;
        }
        this._refreshQuiltQuoteUiAfterPin(beforeQuote);
        this._kickLaunchQuiltPipeline?.();
      } catch (error) {
        this.logger.warn('Background quote sync failed:', error?.message || error);
      } finally {
        this._liveDailyQuoteSyncInFlight = false;
      }
    }

    /**
     * Pin today's quote before `_liveDailyDataConfirmed`. Uses local assignment cache, then slim server reads, then full catalog sync.
     */
    async _ensureTodayQuotePinnedForLaunch() {
      this.quoteService.primeTodayQuoteFromLocalAssignment();
      if (this.quoteService.hasTodayQuotePinned()) {
        const todayKey = this.quoteService.getQuoteCalendarKeyNow();
        const stillValid = await this.quoteService.reconcilePinWithFirestoreAssignment(todayKey);
        if (stillValid && this.quoteService.hasTodayQuotePinned()) return true;
      }

      const slimOk = await this.quoteService.resolveTodayQuoteForLaunch();
      if (slimOk) {
        if (window.odqPerfMark) window.odqPerfMark('launch-quote-slim');
        return true;
      }

      const quotes = await this._syncLiveDailyQuotes();
      if (quotes.ok) {
        if (window.odqPerfMark) window.odqPerfMark('launch-quote-full-sync');
        return true;
      }
      const hadLocal = this.quoteService.primeTodayQuoteFromLocalAssignment();
      if (hadLocal) {
        this.logger.warn('Quote sync failed; using cached local assignment:', quotes.reason);
        return true;
      }
      return false;
    }

    async _tryBootstrapTodayQuiltFromLocalStorage() {
      try {
        const savedData = localStorage.getItem('ourDailyQuilt');
        if (!savedData) return false;
        const data = JSON.parse(savedData);
        const todayKey = Utils.getTodayKey();
        const savedDate = String(data.date || data.dateKey || '').trim();
        if (savedDate && savedDate !== todayKey) return false;
        const blocks = Array.isArray(data.blocks) ? data.blocks : [];
        if (blocks.length === 0) return false;
        await this.applyQuiltDataFromPayload({
          dateKey: todayKey,
          date: savedDate || todayKey,
          blocks,
          contributorCount: data.contributorCount || 1,
          colorReplayEvents: Array.isArray(data.colorReplayEvents) ? data.colorReplayEvents : [],
          contributors: Array.isArray(data.contributors) ? data.contributors : [],
          macroStructureFrozen: data.macroStructureFrozen === true
        });
        return true;
      } catch (error) {
        this.logger.warn('Local quilt bootstrap failed:', error?.message || error);
        return false;
      }
    }

    async syncLiveDailyData(options = {}) {
      const quiltOnly = this._isQuiltOnlyLiveDailySyncMode(options.mode);
      if (this._liveDailySyncInFlight) {
        return { ok: false, reason: 'sync_in_flight', transient: true };
      }
      this._liveDailySyncInFlight = true;
      const syncStartedAt = Date.now();
      const mode = options.mode || 'full';
      try {
        const firebaseWaitMs = quiltOnly ? (options.mode === 'resume' ? 8000 : 12000) : 20000;
        const firebaseReady = await LiveDailyDataSync.waitForFirebaseReady(firebaseWaitMs);
        if (!firebaseReady) {
          return { ok: false, reason: 'firebase_unavailable' };
        }

        const todayKey = Utils.getTodayKey();
        const [quiltResult, quotesPinned] = await Promise.all([
          this.dataService.loadQuiltFromServer(todayKey),
          this._ensureTodayQuotePinnedForLaunch()
        ]);
        if (!quiltResult.ok) {
          return { ok: false, reason: quiltResult.reason || 'quilt' };
        }
        await this.applyQuiltDataFromPayload(quiltResult.data);
        this._kickLaunchQuiltPipeline?.({ refresh: true });

        if (!quotesPinned) {
          const hasPinnedQuote = quiltOnly && this.quoteService?.hasTodayQuotePinned?.();
          if (!hasPinnedQuote) {
            return { ok: false, reason: 'quote_assignment' };
          }
        }

        if (quiltOnly) {
          this._liveDailyDataConfirmed = true;
          this._clearConnectionProblemSlowDelay();
          document.body.classList.remove('odq-live-daily-pending');
          LiveDailyDataSync.recordSuccessfulSync(todayKey);
          this._refreshQuoteScreenIfActive();
          void this._primeQuiltQuoteChrome();
          void globalThis.odqPrefetchLayoutBKeywordEmphasis?.(todayKey);
          void globalThis.odqPrefetchSpeakerCutoutTweak?.(todayKey);
          return { ok: true, quiltOnly: true };
        }

        this._liveDailyDataConfirmed = true;
        this._clearConnectionProblemSlowDelay();
        document.body.classList.remove('odq-live-daily-pending');
        LiveDailyDataSync.recordSuccessfulSync(todayKey);
        this._refreshQuoteScreenIfActive();
        void this._primeQuiltQuoteChrome();
        void globalThis.odqPrefetchLayoutBKeywordEmphasis?.(todayKey);
        void globalThis.odqPrefetchSpeakerCutoutTweak?.(todayKey);
        return { ok: true };
      } catch (error) {
        this.logger.warn('syncLiveDailyData failed:', error?.message || error);
        return { ok: false, reason: 'unknown' };
      } finally {
        this._liveDailySyncInFlight = false;
      }
    }

    async handleConnectionProblemRetry() {
      const btn = document.getElementById('connectionProblemRetryBtn');
      if (btn) btn.disabled = true;
      this._showConnectionProblemConnecting();
      const result = await this.syncLiveDailyData();
      if (result.ok) {
        if (!this._postLiveSyncInitialized) {
          await this._continueAfterLiveSync();
        } else {
          this.uiService?.showScreen?.('screen-portal');
          this.quoteService.displayQuote();
          this.updateSquareCounter();
          this.renderQuilt?.();
          this._dismissBootSplash();
          this._kickPortalIntroFadeAfterSplash();
          this._notifyNativeLaunchCoverReady();
        }
      } else {
        this._showConnectionProblemFailed(result?.reason || 'unknown');
        if (btn) btn.disabled = false;
      }
    }

    _portalJoinThinkingDotsHtml() {
      return (
        '<span class="portal-join-thinking" id="portalJoinLineThinking" aria-hidden="true">' +
        '<span class="portal-join-thinking__dot">.</span><span class="portal-join-thinking__dot">.</span><span class="portal-join-thinking__dot">.</span>' +
        '</span>'
      );
    }

    _isPortalFirstVisit() {
      return typeof Utils !== 'undefined' && Utils.needsFirstNamePrompt();
    }

    _applyPortalFirstVisitJoinContent() {
      Utils.applyPortalFirstVisitJoinContent();
    }

    _revealPortalJoinLineOuter() {
      const joinOuter = document.getElementById('portalJoinLineOuter');
      if (!joinOuter) return;
      joinOuter.classList.remove('portal-join-line-outer--awaiting');
      joinOuter.removeAttribute('aria-hidden');
      joinOuter.removeAttribute('aria-busy');
      void joinOuter.offsetWidth;
      joinOuter.classList.add('portal-join-line-outer--reveal');
    }

    _portalIntroDwellMs() {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return 0;
      return 1300;
    }

    _schedulePortalIntroFadeIfNeeded() {
      if (this._portalToQuoteIntroScheduled) return;
      if (!this._portalSplashDismissed) return;
      this._portalToQuoteIntroScheduled = true;
      this._clearPortalJoinLineWatchdog();
      this.schedulePortalToQuoteIntroFade(this._portalIntroDwellMs());
    }

    _kickPortalIntroFadeAfterSplash() {
      this._portalSplashDismissed = true;
      const joinOuter = document.getElementById('portalJoinLineOuter');
      if (!joinOuter || joinOuter.classList.contains('portal-join-line-outer--awaiting')) return;
      this.clearPortalToQuoteIntroTimer();
      this._portalToQuoteIntroScheduled = false;
      this._schedulePortalIntroFadeIfNeeded();
    }

    _setPortalJoinCountAwaiting() {
      const middle = document.getElementById('portalJoinMiddle');
      if (!middle) return;
      middle.setAttribute('aria-hidden', 'true');
      middle.setAttribute('aria-busy', 'true');
      middle.innerHTML = this._portalJoinThinkingDotsHtml();
    }

    _ensurePortalJoinLineShell() {
      const joinLine = document.getElementById('portalJoinLine');
      if (!joinLine) return null;
      if (this._isPortalFirstVisit()) {
        this._applyPortalFirstVisitJoinContent();
        return joinLine;
      }
      if (!joinLine.querySelector('.portal-join-line__lead')) {
        joinLine.className = 'portal-join-line portal-join-line--split';
        joinLine.innerHTML =
          '<span class="portal-join-line__lead">You\'re joining</span>' +
          '<span class="portal-join-line__count-row">' +
          '<span class="portal-join-line__middle" id="portalJoinMiddle" aria-hidden="true"></span>' +
          '<span class="portal-join-line__trail">others today</span>' +
          '</span>';
      } else {
        joinLine.className = 'portal-join-line portal-join-line--split';
      }
      return joinLine;
    }

    _preparePortalJoinLineForLoad() {
      this._portalQuiltLoaded = false;
      this._portalToQuoteIntroScheduled = false;
      this._portalSplashDismissed = false;
      this._ensurePortalJoinLineShell();
      if (this._isPortalFirstVisit()) {
        this._applyPortalFirstVisitJoinContent();
      }
      this._setPortalJoinCountAwaiting();
      const joinOuterPre = document.getElementById('portalJoinLineOuter');
      if (joinOuterPre) {
        joinOuterPre.classList.remove('portal-join-line-outer--reveal');
        joinOuterPre.classList.add('portal-join-line-outer--awaiting');
        joinOuterPre.removeAttribute('aria-hidden');
        joinOuterPre.removeAttribute('aria-busy');
      }
    }

    _deriveSubmissionCountFromPayload(data) {
      const blocks = Array.isArray(this.quiltEngine?.blocks) ? this.quiltEngine.blocks : [];
      let maxSubmissionIndex = null;
      for (const block of blocks) {
        const idx = Number(block?.submissionIndex);
        if (Number.isFinite(idx)) {
          maxSubmissionIndex =
            maxSubmissionIndex == null ? idx : Math.max(maxSubmissionIndex, idx);
        }
      }
      if (maxSubmissionIndex != null) {
        return maxSubmissionIndex;
      }
      const contributorCount = Number(data?.contributorCount);
      if (Number.isFinite(contributorCount) && contributorCount >= 0) {
        if (contributorCount <= 1 && blocks.length <= 1) return 0;
        return contributorCount;
      }
      if (blocks.length <= 1) return 0;
      return Math.max(0, blocks.length - 1);
    }

    async applyQuiltDataFromPayload(data) {
      this._loadedSharedQuiltDateKey = data.dateKey || data.date || Utils.getTodayKey();
      this.dailyContributors = this.normalizeDailyContributors(data.contributors || []);

      if (data.blocks && data.blocks.length > 0) {
        this.quiltEngine.blocks = data.blocks
          .map((block) => ({
            id: block.id || 'loaded_' + Math.random().toString(36).substr(2, 9),
            x: Number(block.x),
            y: Number(block.y),
            width: Number(block.width),
            height: Number(block.height),
            color: block.color,
            contributorId: block.contributorId != null ? block.contributorId : this.currentUserId,
            contributorIds: Array.isArray(block.contributorIds)
              ? block.contributorIds.map((id) => String(id || '').trim()).filter(Boolean)
              : undefined,
            submissionIndex: typeof block.submissionIndex === 'number' ? block.submissionIndex : 0,
            visualLayerIndex:
              typeof block.visualLayerIndex === 'number' && Number.isFinite(block.visualLayerIndex)
                ? block.visualLayerIndex
                : undefined,
            protectedAnchorId: block.protectedAnchorId != null ? String(block.protectedAnchorId) : undefined,
            protectedAnchorRootId:
              block.protectedAnchorRootId != null ? String(block.protectedAnchorRootId) : undefined,
            patternType: block.patternType,
            specialPatternType: block.specialPatternType,
            originalPatternId: block.originalPatternId,
            backsideRestoreId: block.backsideRestoreId != null ? String(block.backsideRestoreId) : undefined,
            backsideRestoreBounds:
              this.quiltEngine._normalizeMacroOriginalBounds(block.backsideRestoreBounds) || undefined,
            backsideRestoreColor: block.backsideRestoreColor,
            specialOriginalBounds:
              this.quiltEngine._normalizeMacroOriginalBounds(block.specialOriginalBounds) || undefined,
            specialOriginalColor: block.specialOriginalColor,
            specialOriginalInnerColor: block.specialOriginalInnerColor,
            specialOriginalInsetR:
              typeof block.specialOriginalInsetR === 'number' && Number.isFinite(block.specialOriginalInsetR)
                ? Number(block.specialOriginalInsetR)
                : undefined,
            starterAxisRegion: block.starterAxisRegion === true ? true : undefined,
            starterAxisRegionId: block.starterAxisRegionId != null ? String(block.starterAxisRegionId) : undefined,
            hstColorB: block.hstColorB,
            hstDiagonal: block.hstDiagonal,
            hstTriangles: Utils.normalizeHstTrianglesFromFirestore(block.hstTriangles),
            polygonPieces: Utils.normalizePolygonPiecesFromFirestore(block.polygonPieces),
            diagonalAxisAccentColor:
              typeof block.diagonalAxisAccentColor === 'string' &&
              block.diagonalAxisAccentColor.match(/^#[0-9A-Fa-f]{6}$/)
                ? block.diagonalAxisAccentColor
                : undefined,
            diagonalAxisUx:
              typeof block.diagonalAxisUx === 'number' && Number.isFinite(block.diagonalAxisUx)
                ? block.diagonalAxisUx
                : undefined,
            diagonalAxisUy:
              typeof block.diagonalAxisUy === 'number' && Number.isFinite(block.diagonalAxisUy)
                ? block.diagonalAxisUy
                : undefined,
            axisLayerMode: block.axisLayerMode === 'collage' ? 'collage' : undefined,
            axisOriginId: block.axisOriginId != null ? String(block.axisOriginId) : undefined,
            axisSourceBlockId: block.axisSourceBlockId != null ? String(block.axisSourceBlockId) : undefined,
            axisSourceSubmissionIndex:
              typeof block.axisSourceSubmissionIndex === 'number' && Number.isFinite(block.axisSourceSubmissionIndex)
                ? block.axisSourceSubmissionIndex
                : undefined,
            insetTier: typeof block.insetTier === 'number' ? block.insetTier : undefined,
            insetFrozen: block.insetFrozen === true ? true : undefined,
            insetInnerColor: block.insetInnerColor,
            insetCx: typeof block.insetCx === 'number' ? Number(block.insetCx) : undefined,
            insetCy: typeof block.insetCy === 'number' ? Number(block.insetCy) : undefined,
            insetR: typeof block.insetR === 'number' ? Number(block.insetR) : undefined,
            insetMask: typeof block.insetMask === 'string' ? block.insetMask : undefined,
            insetFirstCutVertical:
              block.insetFirstCutVertical === true || block.insetFirstCutVertical === false
                ? block.insetFirstCutVertical
                : undefined,
            insetNextCutVertical:
              block.insetNextCutVertical === true || block.insetNextCutVertical === false
                ? block.insetNextCutVertical
                : undefined,
            macroRegionId:
              typeof block.macroRegionId === 'number' && Number.isFinite(block.macroRegionId)
                ? block.macroRegionId
                : undefined,
            macroFrozenColor:
              typeof block.macroFrozenColor === 'string' && block.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)
                ? block.macroFrozenColor
                : undefined,
            macroFrozenOutline:
              this.quiltEngine._normalizeMacroFrozenOutline(block.macroFrozenOutline) || undefined,
            macroVisibleFlattened: block.macroVisibleFlattened === true ? true : undefined,
            macroOriginalBounds:
              this.quiltEngine._normalizeMacroOriginalBounds(block.macroOriginalBounds) || undefined
          }))
          .filter(
            (block) =>
              [block.x, block.y, block.width, block.height].every(Number.isFinite) &&
              block.width > 0 &&
              block.height > 0
          );
        if (this.quiltEngine.blocks.length === 0) {
          this.logger.warn('Loaded quilt contained no valid block geometry; reinitializing starter block');
          this.quiltEngine.initialize();
        } else {
          this.quiltEngine.submissionCount = this._deriveSubmissionCountFromPayload(data);
          this.quiltEngine.setColorReplayEvents(data.colorReplayEvents || []);
          this.quiltEngine.hydrateMacroFreezeFromPersistence(data.macroStructureFrozen === true);
          this.quiltEngine.maybeApplyMacroFreezeAfterHydrate();
          this.quiltEngine.repairMacroRegionIdsAfterLoadIfFrozen();
        }
        this.quiltEngine.recalculateDimensionsForCurrentViewport();
      } else {
        this.quiltEngine.initialize();
      }
      this.ensureCurrentUserContributorListed?.();
      this.renderQuiltContributorList?.();
      this._portalQuiltLoaded = true;
    }

    _waitForPortalJoinLineReady(maxMs = 3500) {
      return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const portal = document.getElementById('screen-portal');
          const joinOuter = document.getElementById('portalJoinLineOuter');
          const ready =
            portal?.classList.contains('portal-greeting-ready') &&
            joinOuter &&
            !joinOuter.classList.contains('portal-join-line-outer--awaiting');
          if (ready || Date.now() - started >= maxMs) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      });
    }

    async _preparePortalLaunchHandoff() {
      const dateText = document.getElementById('date-text');
      if (dateText && typeof Utils.formatDate === 'function') {
        dateText.textContent = Utils.formatDate();
      }
      const greetingTask = Utils.refreshPortalGreeting?.();
      if (greetingTask && typeof greetingTask.then === 'function') {
        await greetingTask;
      }
      this.updateSquareCounter();
      const native =
        typeof window.odqIsCapacitorNative === 'function' && window.odqIsCapacitorNative();
      if (!native) return;
      await this._waitForPortalJoinLineReady();
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
    }

    async _continueAfterLiveSync() {
      this._postLiveSyncInitialized = true;
      this._clearPortalJoinLineWatchdog();
      this._startPortalJoinLineWatchdog();
      // Capacitor push/local plugins may be unavailable at init-start; retry here after bridge is up.
      this.setupPushNotificationListeners();
      const rememberViewDateKey = await this._awaitRememberTodayNotificationOpenIntent(150);
      const rememberViewAlreadyActive = document
        .getElementById('screen-remember-today-view')
        ?.classList.contains('active');
      if (rememberViewDateKey) {
        this.prepareRememberTodayViewScreen(rememberViewDateKey);
        this.uiService?.showScreen?.('screen-remember-today-view');
      } else if (!rememberViewAlreadyActive) {
        this.uiService?.showScreen?.('screen-portal');
      }
      this._maybeSnapPickerToDailyFirstPalette();
      await this._preparePortalLaunchHandoff();
      this._dismissBootSplash();
      this._kickPortalIntroFadeAfterSplash();
      this._notifyNativeLaunchCoverReady();
      void this._syncLiveDailyQuotesInBackground();

      this.refreshRememberTodayFooterVisibility();
      this.refreshRememberTodayArchiveSettingsLink();
      this.uiService?._syncRememberTodayFixedFooterLeakGuard?.();
      this._syncQuiltScrollIconFooterLeakGuard();
      window.setTimeout(() => {
        this.refreshRememberTodayFooterVisibility();
        this.uiService?._syncRememberTodayFixedFooterLeakGuard?.();
        this._syncQuiltScrollIconFooterLeakGuard();
      }, 800);
      void this.maybeCancelRememberTodayForStaleDay();
      this.refreshDailyQuotePushRegistration().catch((error) => {
        this.logger.warn('Daily quote push refresh skipped:', error);
      });

      setTimeout(() => {
        this.maybeRunPersonalQuiltBackfill?.()
          .then((didBackfill) => {
            if (didBackfill) return null;
            return this.maybeShowPersonalQuiltFallback?.();
          })
          .catch((error) => {
            this.logger.warn('Personal quilt onboarding check failed:', error);
          });
      }, 3500);

      this.quoteService.displayQuote();
      void this._primeQuiltQuoteChrome();
      this.renderer.initialize();
      const fastReturningToday =
        !rememberViewDateKey &&
        !this._skipFastPathForRememberToday &&
        this._shouldFastPathReturningSameDayQuote();
      this._scheduleDeferredQuiltRenderForIdle({ urgent: fastReturningToday && !this._launchQuiltPipelineRendered });
      if (!this._launchQuiltPipelineRendered) {
        this._kickLaunchQuiltPipeline?.();
      } else {
        this._ensureQuiltLowerSections({ phase: 'rendered' });
      }
      if (fastReturningToday) {
        this.clearPortalToQuoteIntroTimer();
        this._portalToQuoteIntroScheduled = false;
        this._blockPortalScrollNav = true;
        this._portalToQuoteTimer = setTimeout(() => {
          this._portalToQuoteTimer = null;
          this._blockPortalScrollNav = false;
          if (this._skipFastPathForRememberToday) return;
          if (document.getElementById('screen-remember-today-view')?.classList.contains('active')) {
            return;
          }
          if (window.odqPerfMark) window.odqPerfMark('fast-path-quilt-visible');
          this._notifyNativeLaunchCoverReady();
          if (!this._launchQuiltPipelineRendered) {
            this._kickLaunchQuiltPipeline?.();
          }
          this.uiService.showScreen('screen-quilt');
          this.uiService?._syncRememberTodayFixedFooterLeakGuard?.();
          this._syncQuiltScrollIconFooterLeakGuard();
          if (this._launchQuiltPipelineRendered) {
            this.prewarmFooterIconChrome?.();
            this.flushFooterIconPaperChrome?.();
            this._scheduleFooterIconChromeActivationPass?.();
          }
        }, this._portalIntroDwellMs());
      }
      this.setupDailyReset();
      this.setupQuiltResumeRefresh();
      this.setupQuiltResetCountdown();
    }

    async initialize() {
      if (this._initializeInFlight) {
        return;
      }
      this._initializeInFlight = true;
      try {
        if (window.odqPerfMark) window.odqPerfMark('init-start');
        this._liveDailyDataConfirmed = false;
        this._postLiveSyncInitialized = false;
        this._portalSplashDismissed = false;
        this._preparePortalJoinLineForLoad();
        this.setupEventListeners();
        this.setupPushNotificationListeners();

        await this.dataService.initialize();
        this.quiltEngine.initialize();

        const bootstrapped = await this._tryBootstrapTodayQuiltFromLocalStorage();
        if (bootstrapped && window.odqPerfMark) window.odqPerfMark('bootstrap-quilt-cache');
        if (bootstrapped) {
          this.quoteService.primeTodayQuoteFromLocalAssignment();
          this._ensureQuiltLowerSections({ phase: 'bootstrap' });
          this._kickLaunchQuiltPipeline?.();
        }

        this._beginLiveDailyPending();

        const finishLaunchAfterQuilt = async (live) => {
          if (!live.ok) {
            if (live.reason === 'sync_in_flight' || live.transient === true) {
              setTimeout(() => {
                void this.syncLiveDailyData({ mode: 'launch-core' }).then(finishLaunchAfterQuilt);
              }, 400);
              return;
            }
            if (this._hasCachedTodayQuilt()) {
              this.logger.warn('Launch sync failed; continuing with cached quilt:', live.reason);
              this._liveDailyDataConfirmed = true;
              this._clearConnectionProblemSlowDelay();
              document.body.classList.remove('odq-live-daily-pending');
              if (window.odqPerfMark) window.odqPerfMark('after-load-quilt-cached-fallback');
              if (!this._postLiveSyncInitialized) {
                await this._continueAfterLiveSync();
              } else {
                this.updateSquareCounter();
                this.quoteService.displayQuote();
                this._scheduleDeferredQuiltRenderForIdle();
              }
              void this.syncLiveDailyData({ mode: 'launch-core' }).then((retry) => {
                if (!retry.ok) return;
                this.updateSquareCounter();
                this.quoteService.displayQuote();
                this.renderQuilt?.();
              });
              return;
            }
            this._showConnectionProblemFailed(live.reason);
            return;
          }
          if (window.odqPerfMark) window.odqPerfMark('after-load-quilt');
          if (!this._postLiveSyncInitialized) {
            await this._continueAfterLiveSync();
          } else {
            this.updateSquareCounter();
            this.quoteService.displayQuote();
            this._scheduleDeferredQuiltRenderForIdle();
          }
        };

        if (bootstrapped) {
          void this.syncLiveDailyData({ mode: 'launch-core' })
            .then(finishLaunchAfterQuilt)
            .catch((error) => {
              this.errorHandler.handleError(error, 'App live sync (bootstrap refresh)');
            });
        } else {
          void this.syncLiveDailyData({ mode: 'launch-core' })
            .then(finishLaunchAfterQuilt)
            .catch((error) => {
              this.errorHandler.handleError(error, 'App live sync');
              this.clearPortalToQuoteIntroTimer();
              this._showConnectionProblemFailed('unknown');
            });
        }
      } catch (error) {
        this.errorHandler.handleError(error, 'App initialization');
        this.clearPortalToQuoteIntroTimer();
        this._showConnectionProblemFailed('unknown');
      } finally {
        this._initializeInFlight = false;
      }
    }

    _notifyNativeLaunchCoverReady() {
      if (typeof window.odqNotifyNativeLaunchCoverReady === 'function') {
        window.odqNotifyNativeLaunchCoverReady();
      }
    }

    _dismissBootSplash() {
      if (window.OdqBootSplash && typeof window.OdqBootSplash.dismiss === 'function') {
        window.OdqBootSplash.dismiss();
      }
    }

    setupEventListeners() {
      const connectionRetryBtn = document.getElementById('connectionProblemRetryBtn');
      if (connectionRetryBtn && !connectionRetryBtn.dataset.bound) {
        connectionRetryBtn.dataset.bound = '1';
        connectionRetryBtn.addEventListener('click', () => {
          this.handleConnectionProblemRetry();
        });
      }

      window.addEventListener('odq-contribution-block-remap', (ev) => {
        const oldIds = ev.detail?.oldIds;
        const newId = ev.detail?.newId;
        if (!Array.isArray(oldIds) || typeof newId !== 'string') return;
        const oldSet = new Set(oldIds.map(String));
        const latest = String(this._latestDedicatedBlockId || '').trim();
        if (latest && oldSet.has(latest)) {
          this._latestDedicatedBlockId = newId;
          try {
            localStorage.setItem('ourDailyLatestDedicatedBlockId', newId);
          } catch (_) {
            /* ignore */
          }
        }
      });
      window.addEventListener('odq-contribution-block-swap', (ev) => {
        const aId = ev.detail?.aId;
        const bId = ev.detail?.bId;
        if (typeof aId !== 'string' || typeof bId !== 'string') return;
        const latest = String(this._latestDedicatedBlockId || '').trim();
        if (latest === aId || latest === bId) {
          const newId = latest === aId ? bId : aId;
          this._latestDedicatedBlockId = newId;
          try {
            localStorage.setItem('ourDailyLatestDedicatedBlockId', newId);
          } catch (_) {
            /* ignore */
          }
        }
      });

      const aboutScreen = document.getElementById('screen-about');
      if (aboutScreen) {
        const revealAboutLinesOnScroll = () => {
          if (!aboutScreen.classList.contains('active')) return;
          if (aboutScreen.classList.contains('about-lines-revealed')) return;
          aboutScreen.classList.add('about-lines-revealed');
        };
        aboutScreen.addEventListener('scroll', revealAboutLinesOnScroll, { passive: true });
        aboutScreen.addEventListener('wheel', revealAboutLinesOnScroll, { passive: true });
        aboutScreen.addEventListener('touchmove', revealAboutLinesOnScroll, { passive: true });
      }

      // Navigation
      const activateDataNextTarget = (el) => {
        if (!el || typeof el.getAttribute !== 'function') return;
        const targetId = el.getAttribute('data-next');
        if (!targetId) return;
        if (this.isIntroFlowEnabled() && this._introScreenIds.has(targetId)) {
          this.scrollIntroTo(targetId, 'smooth');
          return;
        }
        if (targetId === 'screen-settings') {
          this.prepareSettingsScreen({ renderPreview: false });
        }
        if (targetId === 'screen-milestone-quilts') {
          if (!this.isMilestoneQuiltsEnabled()) return;
          this.prepareMilestoneQuiltsScreen();
        }
        if (targetId === 'screen-remember-today-archive') {
          if (!this.isRememberTodayNativeAvailable()) return;
          this.prepareRememberTodayArchiveScreen();
        }
        if (targetId === 'screen-remember-today') {
          this.prepareRememberTodayScreen();
        }
        if (targetId === 'screen-remember-today-view') {
          this.prepareRememberTodayViewScreen();
        }
        this.uiService.showScreen(targetId);
        if (targetId === 'screen-quote-submission') {
          this.prepareQuoteSubmissionScreen();
        }
        if (targetId === 'screen-settings') {
          this.scheduleSettingsPersonalQuiltPreview();
        }
      };

      document.querySelectorAll("[data-next]").forEach(btn => {
        btn.addEventListener("click", e => {
          e.preventDefault();
          const tid = btn.getAttribute("data-next");
          if (
            tid === "screen-settings" &&
            btn.classList.contains("quilt-settings-icon-btn") &&
            Date.now() < (this._suppressNextSettingsGearDataNextClickUntil || 0)
          ) {
            return;
          }
          activateDataNextTarget(btn);
        });
      });

      const rememberItems = document.getElementById('rememberTodayItems');
      if (rememberItems && !rememberItems.dataset.bound) {
        rememberItems.dataset.bound = '1';
        rememberItems.addEventListener('click', (e) => {
          const includeBtn = e.target?.closest?.('.remember-today-item__include');
          if (!includeBtn || includeBtn.disabled) return;
          const item = includeBtn.closest('.remember-today-item');
          const kind = item?.getAttribute('data-remember-kind');
          const pressed = includeBtn.getAttribute('aria-pressed') === 'true';
          void this.handleRememberTodayChipToggle(kind, !pressed);
        });
      }

      this._bindRememberTodayViewCopy();

      const rememberArchiveFeed = document.getElementById('rememberTodayArchiveFeed');
      if (rememberArchiveFeed && !rememberArchiveFeed.dataset.bound) {
        rememberArchiveFeed.dataset.bound = '1';
        rememberArchiveFeed.addEventListener('click', (e) => {
          const row = e.target?.closest?.('[data-remember-date-key]');
          if (!row) return;
          const dateKey = String(row.getAttribute('data-remember-date-key') || '').trim();
          if (!dateKey) return;
          this._rememberTodayViewOpenDateKey = dateKey;
          this.prepareRememberTodayViewScreen(dateKey);
          this.uiService.showScreen('screen-remember-today-view');
        });
      }

      const rememberArchiveClearBtn = document.getElementById('rememberTodayArchiveClearBtn');
      if (rememberArchiveClearBtn && !rememberArchiveClearBtn.dataset.bound) {
        rememberArchiveClearBtn.dataset.bound = '1';
        rememberArchiveClearBtn.addEventListener('click', () => {
          const ok = window.confirm(
            'Clear all saved reminders on this device? This cannot be undone.'
          );
          if (!ok) return;
          void this.clearRememberTodayArchive().then(() => {
            this.prepareRememberTodayArchiveScreen();
            this.uiService.showToast('Saved reminders cleared.');
          });
        });
      }

      document.addEventListener('screenChange', (e) => {
        if (e?.detail?.screenId === 'screen-quilt') {
          this.refreshRememberTodayFooterVisibility();
          this.ensureFooterIconStripHandCut();
          if (!this._footerIconChromePrewarmResult) {
            this._resetFooterIconChromePending();
            this.prewarmFooterIconChrome();
          }
          this.flushFooterIconPaperChrome();
          this.scheduleFooterIconChromeUpdate?.();
          this._scheduleFooterIconChromeActivationPass();
        }
        if (e?.detail?.screenId === 'screen-remember-today') {
          this.prepareRememberTodayScreen();
        }
        if (e?.detail?.screenId === 'screen-remember-today-view') {
          this.prepareRememberTodayViewScreen(this._rememberTodayViewOpenDateKey || undefined);
        }
        if (e?.detail?.screenId === 'screen-remember-today-archive') {
          this.prepareRememberTodayArchiveScreen();
        }
      });

      /* WKWebView / local file: an invisible layer can sit above the gear so
         `click` target is not the button. Match **client coordinates** to the
         active gear rect in capture phase. Use **touch** for iOS and **mouse**
         for desktop `file://` testing (touch-only listeners never ran on mouse). */
      if (document.documentElement.dataset.odqSettingsGearRectNav !== '1') {
        document.documentElement.dataset.odqSettingsGearRectNav = '1';
        const pointInRect = (x, y, r) =>
          !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        const activeSettingsGearEl = () => {
          const quilt = document.getElementById('screen-quilt');
          if (quilt?.classList.contains('active')) {
            return document.getElementById('settingsGearBtn');
          }
          return null;
        };
        let mouseGearStart = null;
        let touchGearStart = null;
        let lastGearRectActivateAt = 0;

        const finishGearRect = (e, endX, endY, start) => {
          if (!start) return;
          const gear = activeSettingsGearEl();
          const r = gear?.getBoundingClientRect?.();
          if (!gear || !r) return;
          if (!pointInRect(start.x, start.y, r) || !pointInRect(endX, endY, r)) return;
          if (Math.hypot(endX - start.x, endY - start.y) > 26) return;
          const now = Date.now();
          if (now - lastGearRectActivateAt < 220) return;
          lastGearRectActivateAt = now;
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
          this._suppressNextSettingsGearDataNextClickUntil = Date.now() + 450;
          try {
            activateDataNextTarget(gear);
          } catch (err) {
            this.logger?.warn?.('Settings gear rect navigation failed:', err);
          }
        };

        document.addEventListener(
          'mousedown',
          (e) => {
            if (e.button !== 0) return;
            const gear = activeSettingsGearEl();
            const r = gear?.getBoundingClientRect?.();
            if (gear && r && pointInRect(e.clientX, e.clientY, r)) {
              mouseGearStart = { x: e.clientX, y: e.clientY };
            } else {
              mouseGearStart = null;
            }
          },
          { capture: true }
        );
        document.addEventListener(
          'mouseup',
          (e) => {
            if (e.button !== 0) return;
            if (!mouseGearStart) return;
            const start = mouseGearStart;
            mouseGearStart = null;
            finishGearRect(e, e.clientX, e.clientY, start);
          },
          { capture: true }
        );

        document.addEventListener(
          'touchstart',
          (e) => {
            const t = e.touches?.[0];
            if (!t || e.touches.length !== 1) {
              touchGearStart = null;
              return;
            }
            const gear = activeSettingsGearEl();
            const r = gear?.getBoundingClientRect?.();
            if (gear && r && pointInRect(t.clientX, t.clientY, r)) {
              touchGearStart = { x: t.clientX, y: t.clientY };
            } else {
              touchGearStart = null;
            }
          },
          { capture: true, passive: true }
        );
        document.addEventListener(
          'touchcancel',
          () => {
            touchGearStart = null;
          },
          { capture: true, passive: true }
        );
        document.addEventListener(
          'touchend',
          (e) => {
            if (!touchGearStart) return;
            if (!e.changedTouches || e.changedTouches.length !== 1) {
              touchGearStart = null;
              return;
            }
            const t = e.changedTouches[0];
            const start = touchGearStart;
            touchGearStart = null;
            finishGearRect(e, t.clientX, t.clientY, start);
          },
          { capture: true, passive: false }
        );
      }

      const beforeYouGoShareBtn = document.getElementById('beforeYouGoShareBtn');
      if (beforeYouGoShareBtn) {
        beforeYouGoShareBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.handleBeforeYouGoShareClick();
        });
      }

      const popularColorInput = document.getElementById('popularColorResponseInput');
      if (popularColorInput) {
        popularColorInput.addEventListener('input', () => {
          popularColorInput.value = String(popularColorInput.value || '').toLowerCase();
          const status = document.getElementById('popularColorResponseStatus');
          if (status) status.textContent = '';
        });
        popularColorInput.addEventListener('change', () => {
          this.savePopularColorResponse().catch((error) => {
            this.logger.warn('Popular color response save failed:', error);
          });
        });
        popularColorInput.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          popularColorInput.blur();
          this.savePopularColorResponse().catch((error) => {
            this.logger.warn('Popular color response save failed:', error);
          });
        });
      }

      this.setupQuiltFortuneReveal();
      this.setupQuiltUserColorTogetherNoteScrollWobble();
      this.setupQuiltUserColorTogetherNoteLongPress();
      this.setupQuiltContributorStageLongPress();
      this.setupLayoutBStoryPreviewLongPressShare();
      this.setupReflectionResponsePrototype();
      this.setupQuiltMoodWidget();

      const firstNameContinueBtn = document.getElementById('firstNameContinueBtn');
      const firstNameInput = document.getElementById('firstNameInput');
      const showNameThanksThenWelcome = () => {
        Utils.refreshPortalGreeting();
        const line = document.getElementById('nameThanksLine');
        if (line) {
          line.classList.remove('is-visible');
          const lead = document.createElement('span');
          lead.className = 'name-thanks-line__lead';
          lead.textContent = 'Welcome to ODQ';
          const name = document.createElement('span');
          name.className = 'name-thanks-line__name';
          name.textContent = Utils.getNameThanksDisplayName();
          line.replaceChildren(lead, name);
        }
        this.clearNameThanksAdvanceTimer();
        this.uiService.showScreen('screen-name-thanks');
        if (line) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => line.classList.add('is-visible'));
          });
        }
        /* #nameThanksLine uses opacity 700ms (see CSS); the outer delay must not overlap that
           or the line barely reaches full opacity before exit — feels like a flash. */
        const nameThanksLineFadeMs = window.matchMedia?.('(prefers-reduced-motion: reduce)')
          ?.matches
          ? 0
          : 700;
        const nameThanksDwellBeforeExitMs = 1400;
        this._nameThanksAdvanceTimer = setTimeout(() => {
          if (line) line.classList.remove('is-visible');
          this._nameThanksAdvanceTimer = setTimeout(() => {
            this._nameThanksAdvanceTimer = null;
            this.uiService.showScreen('screen-welcome');
          }, 720);
        }, nameThanksLineFadeMs + nameThanksDwellBeforeExitMs);
      };
      if (firstNameContinueBtn) {
        firstNameContinueBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const raw = firstNameInput ? firstNameInput.value : '';
          const t = (raw || '').trim();
          if (t) {
            if (typeof Utils.isPendingFriendTermInputValue === 'function' && Utils.isPendingFriendTermInputValue(t)) {
              const term = Utils.consumePendingFriendTerm();
              Utils.setUserFirstName(term?.name || 'Friend');
            } else {
              Utils.setUserFirstName(t);
              Utils.clearPendingFriendTerm();
            }
          } else {
            Utils.markFirstNameSkipped();
          }
          Utils.refreshPortalGreeting();
          showNameThanksThenWelcome();
        });
      }
      if (firstNameInput) {
        firstNameInput.addEventListener('focus', () => {
          if (firstNameInput.classList.contains('first-name-input--default')) {
            firstNameInput.value = '';
            firstNameInput.classList.remove('first-name-input--default');
          }
        });
        firstNameInput.addEventListener('input', () => {
          firstNameInput.classList.remove('first-name-input--default');
        });
        firstNameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            firstNameContinueBtn?.click();
          }
        });
      }

      const settingsNameInput = document.getElementById('settingsNameInput');
      const settingsSaveNameBtn = document.getElementById('settingsSaveNameBtn');
      const settingsBackBtn = document.getElementById('settingsBackBtn');
      const settingsResetColorHistoryBtn = document.getElementById('settingsResetColorHistoryBtn');
      const settingsDownloadPersonalQuiltBtn = document.getElementById('settingsDownloadPersonalQuiltBtn');
      this.ensureMilestoneQuiltsDisabled();
      if (settingsSaveNameBtn) {
        settingsSaveNameBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this.handleSettingsNameSave();
        });
      }
      if (settingsNameInput) {
        settingsNameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            settingsSaveNameBtn?.click();
          }
        });
      }
      if (settingsBackBtn) {
        settingsBackBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.uiService.showScreen('screen-quilt');
        });
      }
      if (settingsResetColorHistoryBtn) {
        settingsResetColorHistoryBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleResetColorHistory();
        });
      }
      if (settingsDownloadPersonalQuiltBtn) {
        settingsDownloadPersonalQuiltBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this.handleDownloadPersonalQuilt();
        });
      }

      // Add color button
      const addColorBtn = document.getElementById('addColorBtn');
      if (addColorBtn) {
        console.log('✅ Add color button found and event listener attached');
        addColorBtn.addEventListener('click', this.handleAddColor.bind(this));
      } else {
        console.error('❌ Add color button not found!');
      }

      // Share button
      const shareBtnCompleted = document.getElementById('shareBtnCompleted');
      if (shareBtnCompleted) {
        shareBtnCompleted.addEventListener('click', this.handleShare.bind(this));
      }

      const backsidePreviewToggleBtn = document.getElementById('backsidePreviewToggleBtn');
      if (backsidePreviewToggleBtn) {
        backsidePreviewToggleBtn.addEventListener('click', this.handleToggleBacksidePreview.bind(this));
      }

      const quoteSubmissionForm = document.getElementById('quoteSubmissionForm');
      if (quoteSubmissionForm) {
        quoteSubmissionForm.addEventListener('submit', this.handleQuoteSubmission.bind(this));
      }

      const showMyPieceBtn = document.getElementById('showMyPieceBtn');
      if (showMyPieceBtn) {
        showMyPieceBtn.addEventListener('click', this.handleShowMyPiece.bind(this));
      }

      const dedicateBlockBtn = document.getElementById('dedicateBlockBtn');
      if (dedicateBlockBtn) {
        dedicateBlockBtn.addEventListener('click', this.handleDedicateBlock.bind(this));
        dedicateBlockBtn.dataset.dedicationListenerAttached = '1';
      }

      const showPersonalQuiltBtn = document.getElementById('showPersonalQuiltBtn');
      if (showPersonalQuiltBtn) {
        showPersonalQuiltBtn.addEventListener('click', this.handleTogglePersonalQuilt.bind(this));
      }
      if (dedicateBlockBtn) {
        const dedicateGroup = dedicateBlockBtn.closest('.button-group');
        if (dedicateGroup) {
          dedicateGroup.hidden = true;
          dedicateGroup.setAttribute('aria-hidden', 'true');
        }
        dedicateBlockBtn.hidden = true;
        dedicateBlockBtn.setAttribute('aria-hidden', 'true');
      }
      this.updatePersonalQuiltToggleButton();
      this.updateBacksidePreviewToggleButton();

      // Color picker
      this.setupColorPicker();

      // Keyboard navigation
      document.addEventListener('keydown', this.handleKeyDown.bind(this));

      // Legacy gesture navigation is disabled when intro flow is enabled.
      this.setupScreenScrollNavigation();
      
      // Window resize handler
      window.addEventListener('resize', this.handleWindowResize.bind(this));
      
      // Visual viewport resize handler
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', this.handleWindowResize.bind(this));
      }
      

      

      
      // Archive event handlers
      this.setupArchiveEventHandlers();

      // Subtle quilt parallax setup
      this.setupQuiltParallax();
      this.setupQuiltNotificationScrollPrompt();
      this.setupNotificationDebugPanel();
      this.ensureFooterIconStripHandCut();
      this.ensureFooterIconInkContrast();

      // Pinch and pan for inspecting quilt details
      this.setupQuiltZoom();

      this.setupQuiltFilmGrainOverlay();
      
      if (CONFIG.APP.enableAdminTools) {
        this.setupLongPressAdminAccess();
      }
      
      if (!CONFIG.APP.enableAdminTools) {
        // Clear any existing admin flags in release builds.
        localStorage.removeItem('ourDailyIsAdmin');
      }
    }

    prepareQuoteSubmissionScreen(clearStatus = true) {
      const nameInput = document.getElementById('quoteSubmissionName');
      const status = document.getElementById('quoteSubmissionStatus');
      if (clearStatus) this.clearQuoteSubmissionReturnTimer();
      if (nameInput && !nameInput.value.trim()) {
        const storedName = Utils.getUserFirstName();
        if (storedName && storedName.toLowerCase() !== 'friend') {
          nameInput.value = storedName;
        }
      }
      if (clearStatus && status) status.textContent = '';
    }

    setupQuiltUserColorTogetherNoteScrollWobble() {
      const wrap = document.getElementById('quiltUserColorTogetherNoteWrap');
      const note = wrap?.querySelector('.quilt-user-color-together-note');
      if (!wrap || !note || wrap.dataset.wobbleListenerAttached === '1') return;
      wrap.dataset.wobbleListenerAttached = '1';

      const triggerGentleWobble = () => {
        if (wrap.hidden) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        note.classList.remove('is-gently-wobbling');
        void note.offsetWidth;
        note.classList.add('is-gently-wobbling');
        window.setTimeout(() => {
          note.classList.remove('is-gently-wobbling');
        }, 1400);
      };

      let lastWobbleAt = 0;
      const maybeWobbleIfVisible = () => {
        if (wrap.hidden) return;
        const rect = wrap.getBoundingClientRect();
        if (rect.height < 1) return;
        const viewportBottom =
          window.innerHeight || document.documentElement.clientHeight || 0;
        const visibleHeight = Math.min(rect.bottom, viewportBottom) - Math.max(rect.top, 0);
        const visibleRatio = visibleHeight / rect.height;
        const now = Date.now();
        if (visibleRatio < 0.35 || now - lastWobbleAt < 3800) return;
        lastWobbleAt = now;
        triggerGentleWobble();
      };

      this._maybeQuiltTogetherNoteWobble = maybeWobbleIfVisible;

      const scrollRoots = [
        document.getElementById('screen-quilt'),
        document.querySelector('#screen-quilt .button-container'),
        document.getElementById('app')
      ].filter(Boolean);
      const onScroll = () => maybeWobbleIfVisible();
      scrollRoots.forEach((el) => el.addEventListener('scroll', onScroll, { passive: true }));
      window.addEventListener('scroll', onScroll, { passive: true });

      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting || entry.intersectionRatio < 0.35) return;
              maybeWobbleIfVisible();
            });
          },
          { root: null, threshold: [0, 0.35, 0.55, 0.75, 1] }
        );
        observer.observe(wrap);
      }

      const attrObserver = new MutationObserver(() => {
        if (wrap.hidden) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(maybeWobbleIfVisible);
        });
      });
      attrObserver.observe(wrap, {
        attributes: true,
        attributeFilter: ['hidden', 'aria-hidden']
      });

      window.setTimeout(maybeWobbleIfVisible, 400);
    }

    _bindSustainHoldGesture(target, options = {}) {
      const {
        isEnabled = () => true,
        holdMsTouch = 480,
        holdMsDefault = 650,
        moveCancelPx = 14,
        onPrime = () => {},
        onHoldStart = () => {},
        onHoldEnd = () => {},
        blockTextSelection = false,
        suppressClickMs = 450,
        attachKeyHold = true
      } = options;

      if (!target || target.dataset.sustainHoldAttached === '1') return false;
      target.dataset.sustainHoldAttached = '1';

      let pressTimer = null;
      let suppressClick = false;
      let holdActive = false;
      let releaseOnWindow = null;
      let pressPointerId = null;
      let pressStartX = 0;
      let pressStartY = 0;

      const clearPressTimer = () => {
        if (!pressTimer) return;
        clearTimeout(pressTimer);
        pressTimer = null;
        pressPointerId = null;
      };

      const blockNativeTextGesture = (event) => {
        if (!isEnabled()) return;
        event.preventDefault();
      };

      const detachReleaseListeners = () => {
        if (!releaseOnWindow) return;
        window.removeEventListener('pointerup', releaseOnWindow);
        window.removeEventListener('pointercancel', releaseOnWindow);
        releaseOnWindow = null;
      };

      const endHold = () => {
        clearPressTimer();
        detachReleaseListeners();
        if (!holdActive) return;
        holdActive = false;
        onHoldEnd();
      };

      const attachReleaseListeners = () => {
        if (releaseOnWindow) return;
        releaseOnWindow = () => endHold();
        window.addEventListener('pointerup', releaseOnWindow);
        window.addEventListener('pointercancel', releaseOnWindow);
      };

      const onLongPress = () => {
        pressTimer = null;
        if (!isEnabled()) return;
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, suppressClickMs);
        holdActive = true;
        onHoldStart();
        attachReleaseListeners();
      };

      if (blockTextSelection) {
        target.addEventListener(
          'touchstart',
          (event) => {
            onPrime(event);
            blockNativeTextGesture(event);
          },
          { passive: false }
        );
        target.addEventListener('selectstart', blockNativeTextGesture);
        target.addEventListener('contextmenu', blockNativeTextGesture);
      }

      target.addEventListener('pointerdown', (event) => {
        if (!isEnabled()) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.pointerType === 'touch' && event.cancelable) event.preventDefault();
        onPrime(event);
        clearPressTimer();
        pressPointerId = event.pointerId;
        pressStartX = event.clientX;
        pressStartY = event.clientY;
        const holdMs = event.pointerType === 'touch' ? holdMsTouch : holdMsDefault;
        pressTimer = window.setTimeout(onLongPress, holdMs);
      });
      target.addEventListener('pointermove', (event) => {
        if (pressTimer == null || event.pointerId !== pressPointerId) return;
        const dx = event.clientX - pressStartX;
        const dy = event.clientY - pressStartY;
        if (Math.hypot(dx, dy) > moveCancelPx) clearPressTimer();
      });
      target.addEventListener('pointerup', (event) => {
        if (event.pointerId !== pressPointerId && pressPointerId != null && !holdActive) return;
        if (holdActive) endHold();
        else clearPressTimer();
      });
      target.addEventListener('pointercancel', (event) => {
        if (event.pointerId !== pressPointerId && pressPointerId != null && !holdActive) return;
        if (holdActive) endHold();
        else clearPressTimer();
      });
      target.addEventListener('click', (event) => {
        if (!suppressClick) return;
        event.preventDefault();
        suppressClick = false;
      });

      if (attachKeyHold) {
        target.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          if (event.repeat || !isEnabled() || holdActive) return;
          event.preventDefault();
          holdActive = true;
          onHoldStart();
        });
        target.addEventListener('keyup', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          endHold();
        });
        target.addEventListener('blur', endHold);
      }

      return true;
    }

    setupQuiltUserColorTogetherNoteLongPress() {
      const wrap = document.getElementById('quiltUserColorTogetherNoteWrap');
      const note = wrap?.querySelector('.quilt-user-color-together-note');
      if (!wrap || !note) return;

      note.setAttribute('role', 'button');
      note.setAttribute('tabindex', '0');
      note.setAttribute(
        'aria-label',
        'What else can we do together? Press and hold for name shimmer.'
      );

      const triggerGentleWobble = () => {
        if (wrap.hidden) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        note.classList.remove('is-gently-wobbling');
        void note.offsetWidth;
        note.classList.add('is-gently-wobbling');
        window.setTimeout(() => {
          note.classList.remove('is-gently-wobbling');
        }, 1400);
      };

      const togetherPaper = note.querySelector('.quilt-user-color-together-note__paper');
      const AudioCtxCtor = window.AudioContext || window.webkitAudioContext;
      let holdThumpAudioCtx = null;

      const prefersReducedMotion = () =>
        !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

      const primeHoldThumpFeedback = () => {
        if (prefersReducedMotion() || !AudioCtxCtor) return;
        if (!holdThumpAudioCtx) holdThumpAudioCtx = new AudioCtxCtor();
        if (holdThumpAudioCtx.state === 'suspended') {
          holdThumpAudioCtx.resume().catch(() => {});
        }
      };

      const playHoldThumpSound = () => {
        if (prefersReducedMotion() || !holdThumpAudioCtx) return;
        const ctx = holdThumpAudioCtx;
        if (ctx.state !== 'running') return;
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(92, t0);
        osc.frequency.exponentialRampToValueAtTime(48, t0 + 0.055);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(0.22, t0 + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.075);
      };

      const triggerHoldThumpVisual = () => {
        if (!togetherPaper || prefersReducedMotion()) return;
        togetherPaper.classList.remove('is-hold-thump');
        void togetherPaper.offsetWidth;
        togetherPaper.classList.add('is-hold-thump');
        window.setTimeout(() => {
          togetherPaper.classList.remove('is-hold-thump');
        }, 220);
      };

      const feedbackHoldThump = () => {
        if (wrap.hidden || prefersReducedMotion()) return;
        triggerHoldThumpVisual();
        playHoldThumpSound();
        if (typeof navigator?.vibrate === 'function') {
          try {
            navigator.vibrate([22, 8, 32]);
          } catch (_) {
            /* Unsupported or blocked. */
          }
        }
      };

      this._bindSustainHoldGesture(note, {
        isEnabled: () => !wrap.hidden,
        blockTextSelection: true,
        onPrime: () => primeHoldThumpFeedback(),
        onHoldStart: () => {
          feedbackHoldThump();
          triggerGentleWobble();
          this.setContributorNameGlimmerActive(true);
        },
        onHoldEnd: () => this.setContributorNameGlimmerActive(false)
      });
    }

    setupQuiltContributorStageLongPress() {
      const stage = document.getElementById('quiltContributors');
      const panelBody = stage?.querySelector('.quilt-contributor-panel-body');
      if (!stage || !panelBody) return;

      panelBody.setAttribute('role', 'button');
      panelBody.setAttribute('tabindex', '0');
      panelBody.setAttribute(
        'aria-label',
        'Contributor names. Press and hold for name shimmer.'
      );

      this._bindSustainHoldGesture(panelBody, {
        isEnabled: () => !stage.hidden,
        onHoldStart: () => this.setContributorNameGlimmerActive(true),
        onHoldEnd: () => this.setContributorNameGlimmerActive(false)
      });
    }

    setContributorNameGlimmerActive(active) {
      const next = !!active;
      if (this._contributorNamesGlimmerActive === next) return;
      this._contributorNamesGlimmerActive = next;
      const list = document.getElementById('quiltContributorList');
      if (list) {
        list.classList.toggle('quilt-contributor-list--glimmer', next);
      }
      this.syncContributorNameGlimmerEffectMarkup();
      this.renderQuiltContributorList();
    }

    setupQuiltFortuneReveal() {
      const reveal = document.getElementById('quiltFortuneReveal');
      if (!reveal || reveal.dataset.listenerAttached === '1') return;
      reveal.dataset.listenerAttached = '1';
      const triggerGentleWobble = () => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        reveal.classList.remove('is-gently-wobbling');
        void reveal.offsetWidth;
        reveal.classList.add('is-gently-wobbling');
        window.setTimeout(() => {
          reveal.classList.remove('is-gently-wobbling');
        }, 1500);
      };
      let lastWobbleAt = 0;
      const maybeWobbleIfVisible = () => {
        const panel = reveal.closest('.button-container');
        const rootRect = panel?.getBoundingClientRect?.() || { top: 0, bottom: window.innerHeight };
        const rect = reveal.getBoundingClientRect();
        const visibleHeight = Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top);
        const visibleRatio = visibleHeight / Math.max(1, rect.height);
        const now = Date.now();
        if (visibleRatio < 0.45 || now - lastWobbleAt < 5000) return;
        lastWobbleAt = now;
        triggerGentleWobble();
      };
      const panel = reveal.closest('.button-container');
      if (panel) {
        panel.addEventListener('scroll', maybeWobbleIfVisible, { passive: true });
        window.setTimeout(maybeWobbleIfVisible, 250);
      }
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting || entry.intersectionRatio < 0.45) return;
            maybeWobbleIfVisible();
          });
        }, { root: panel || null, threshold: [0.45] });
        observer.observe(reveal);
      }
      let shareTimer = null;
      let suppressNextClick = false;
      const clearShareTimer = () => {
        if (!shareTimer) return;
        clearTimeout(shareTimer);
        shareTimer = null;
      };
      reveal.addEventListener('pointerdown', () => {
        if (reveal.dataset.stage !== '1') return;
        clearShareTimer();
        suppressNextClick = false;
        shareTimer = setTimeout(async () => {
          shareTimer = null;
          suppressNextClick = true;
          setTimeout(() => {
            suppressNextClick = false;
          }, 1200);
          try {
            await this.shareQuiltFortuneStoryImage();
          } catch (error) {
            this.errorHandler.handleError(error, 'fortuneShareFlow');
          }
        }, 650);
      });
      reveal.addEventListener('pointerup', clearShareTimer);
      reveal.addEventListener('pointercancel', clearShareTimer);
      reveal.addEventListener('pointerleave', clearShareTimer);
      reveal.addEventListener('contextmenu', (event) => {
        if (!suppressNextClick) return;
        event.preventDefault();
      });
      reveal.addEventListener('click', (event) => {
        event.preventDefault();
        if (suppressNextClick) {
          suppressNextClick = false;
          return;
        }
        const currentStage = reveal.dataset.stage === '1' ? 1 : 0;
        const nextStage = currentStage === 1 ? 0 : 1;
        reveal.classList.remove('is-gently-wobbling');
        reveal.dataset.stage = String(nextStage);
        reveal.setAttribute(
          'aria-label',
          nextStage === 1 ? "Today's quilt blessing is revealed." : "Tap to flip today's quilt blessing"
        );
        // Reveal the "See you tomorrow" farewell 1.2s after the blessing
        // card is tapped. Once shown, it stays visible for the rest of the
        // chamber visit; refreshQuiltFortuneReveal() resets it on re-entry.
      });
    }

    /**
     * Long-press the Layout B preview (same timing as the blessing card) to open the system share sheet
     * with files — not the WebKit default image menu on `<img blob:…>`.
     */
    setupLayoutBStoryPreviewLongPressShare() {
      const wrap = document.getElementById('quiltLayoutBPreviewWrap');
      const sheet = wrap?.querySelector?.('.quilt-layout-b-preview-sheet');
      if (!sheet || sheet.dataset.listenerAttached === '1') return;
      sheet.dataset.listenerAttached = '1';

      let shareTimer = null;
      const clearShareTimer = () => {
        if (!shareTimer) return;
        clearTimeout(shareTimer);
        shareTimer = null;
      };

      const layoutBPreviewShareText = () =>
        `Today's OUR DAILY QUILT has ${this.quiltEngine?.submissionCount ?? 0} contributors — take a look!`;

      sheet.addEventListener('pointerdown', () => {
        const img = document.getElementById('quiltLayoutBPreviewImg');
        if (!img || img.hidden || !this._layoutBStoryPreviewShareBlob) return;
        clearShareTimer();
        shareTimer = setTimeout(async () => {
          shareTimer = null;
          try {
            const dateStr = new Date().toISOString().split('T')[0];
            await this.shareBlobWithSystem(
              this._layoutBStoryPreviewShareBlob,
              `our-daily-quilt-story-collage-${dateStr}.png`,
              'OUR DAILY QUILT — Story collage',
              layoutBPreviewShareText()
            );
          } catch (error) {
            this.errorHandler.handleError(error, 'layoutBPreviewShare');
          }
        }, 650);
      });
      sheet.addEventListener('pointerup', clearShareTimer);
      sheet.addEventListener('pointercancel', clearShareTimer);
      sheet.addEventListener('pointerleave', clearShareTimer);
      sheet.addEventListener('contextmenu', (event) => {
        event.preventDefault();
      });
    }

    escapeQuiltFortuneText(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    /** Split trailing " —Name" from published reflection text for separate styling. */
    splitReflectionPublishedText(value) {
      const raw = String(value || '').replace(/\s+/g, ' ').trim();
      if (!raw) return { body: '', author: '' };
      const match = raw.match(/^(.*?)\s+[—–-]\s*(.+)$/);
      if (!match) return { body: raw, author: '' };
      const body = String(match[1] || '').trim();
      const author = String(match[2] || '').trim();
      if (!body || !author) return { body: raw, author: '' };
      return { body, author };
    }

    normalizeReflectionWallTheme(entry) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const text = this.normalizeReflectionIdeaText(entry.text ?? entry.body ?? entry.theme ?? '');
        if (!text) return null;
        const author = String(entry.author ?? entry.authorDisplayName ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        return { text, author };
      }
      const text = this.normalizeReflectionIdeaText(entry);
      if (!text) return null;
      return { text, author: '' };
    }

    reflectionWallThemeText(entry) {
      return this.normalizeReflectionWallTheme(entry)?.text || '';
    }

    formatReflectionCarouselTextHtml(entry) {
      const normalized = this.normalizeReflectionWallTheme(entry);
      const text = normalized?.text || this.normalizeReflectionIdeaText(entry);
      const bodyHtml = this.escapeQuiltFortuneText(text);
      const author = String(normalized?.author || '').trim();
      if (!author) return bodyHtml;
      const authorHtml = this.escapeQuiltFortuneText(author);
      return `<span class="quilt-reflection-carousel-body" style="text-align:left">${bodyHtml}</span><span class="quilt-reflection-carousel-author">— ${authorHtml}</span>`;
    }

    syncReflectionCarouselCopyAlign(slides) {
      const list = Array.isArray(slides) ? slides : [];
      list.forEach((slide) => {
        if (!slide?.classList?.contains?.('quilt-reflection-carousel-slide--clipping')) return;
        slide.querySelectorAll('.quilt-reflection-carousel-text').forEach((copyEl) => {
          copyEl.style.textAlign = 'left';
        });
        slide.querySelectorAll('.quilt-reflection-carousel-body').forEach((bodyEl) => {
          bodyEl.style.textAlign = 'left';
        });
        slide.querySelectorAll('.quilt-reflection-carousel-author').forEach((authorEl) => {
          authorEl.style.textAlign = 'right';
          authorEl.style.display = 'block';
          authorEl.style.width = '100%';
        });
      });
    }

    /** Wider newsprint column for longer reflections — avoids justify rivers in a skinny measure. */
    reflectionCarouselNeedsWideCopy(theme) {
      const text = this.reflectionWallThemeText(theme);
      if (!text) return false;
      const words = text.trim().split(/\s+/).filter(Boolean);
      return text.length >= 64 || words.length >= 12;
    }

    /** @param {string} text */
    splitQuiltPromptClauses(text) {
      const normalized = String(text || '').replace(/\s+/g, ' ').trim();
      if (!normalized) return [];

      const clauses = [];
      const delimiter = /,\s+|;\s+|\s+—\s+|\s+–\s+/g;
      let start = 0;
      let match;
      while ((match = delimiter.exec(normalized)) !== null) {
        const chunk = normalized.slice(start, match.index).trim();
        const delim = match[0];
        if (chunk) {
          if (delim.startsWith(',') || delim.startsWith(';')) {
            clauses.push(`${chunk}${delim.trim().charAt(0)}`);
          } else {
            clauses.push(chunk);
          }
        }
        start = match.index + delim.length;
      }
      const tail = normalized.slice(start).trim();
      if (tail) clauses.push(tail);
      return clauses.length ? clauses : [normalized];
    }

    /**
     * Reflection prompts: break at commas / semicolons / dashes first; balance only long clauses.
     * @param {string} text
     * @param {number} [maxLines]
     */
    naturalQuiltDisplayLines(text, maxLines = 4) {
      const normalized = String(text || '').replace(/\s+/g, ' ').trim();
      if (!normalized) return '';

      const max = Math.max(1, Math.min(6, Math.floor(maxLines) || 4));
      const wordCount = (line) => String(line || '').trim().split(/\s+/).filter(Boolean).length;
      const longClauseWords = 11;

      let lines = this.splitQuiltPromptClauses(normalized).flatMap((clause) => {
        if (wordCount(clause) <= longClauseWords) return [clause];
        return this.balanceQuiltDisplayLines(clause, Math.min(2, max))
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean);
      });

      while (lines.length > max) {
        let mergeAt = 0;
        let bestScore = Infinity;
        for (let i = 0; i < lines.length - 1; i++) {
          const score = wordCount(lines[i]) + wordCount(lines[i + 1]);
          if (score < bestScore) {
            bestScore = score;
            mergeAt = i;
          }
        }
        lines[mergeAt] = `${lines[mergeAt]} ${lines[mergeAt + 1]}`.replace(/\s+/g, ' ').trim();
        lines.splice(mergeAt + 1, 1);
      }

      if (lines.length === 1 && wordCount(lines[0]) > longClauseWords) {
        return this.balanceQuiltDisplayLines(lines[0], Math.min(max, 3));
      }

      return lines.join('\n');
    }

    /**
     * Split prose into lines with roughly equal word counts (communal blessing flip).
     * @param {string} text
     * @param {number} [maxLines] When set (e.g. 2 for the flipped communal blessing), caps line count and balances words across those lines.
     */
    balanceQuiltDisplayLines(text, maxLines) {
      const words = String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (!words.length) return '';

      let n;
      if (maxLines != null && Number.isFinite(maxLines) && maxLines > 0) {
        n = Math.min(Math.floor(maxLines), words.length);
        if (n <= 1) return words.join(' ');
      } else {
        if (words.length <= 2) return words.join(' ');
        n = Math.min(5, Math.max(2, Math.round(Math.sqrt(words.length * 1.15))));
      }

      const base = Math.floor(words.length / n);
      let extra = words.length - base * n;
      const lines = [];
      let i = 0;
      for (let line = 0; line < n && i < words.length; line++) {
        const take = Math.max(1, base + (extra > 0 ? 1 : 0));
        if (extra > 0) extra -= 1;
        lines.push(words.slice(i, i + take).join(' '));
        i += take;
      }
      if (i < words.length && lines.length) {
        lines[lines.length - 1] = `${lines[lines.length - 1]} ${words.slice(i).join(' ')}`.trim();
      }
      return lines.filter(Boolean).join('\n');
    }

    escapeQuiltFortuneTextWithLineBreaks(value, maxLines, options = {}) {
      const text = String(value || '').trim();
      const formatted = options.natural
        ? this.naturalQuiltDisplayLines(text, maxLines ?? 4)
        : this.balanceQuiltDisplayLines(text, maxLines);
      if (!formatted) return '';
      return formatted
        .split(/\n+/)
        .map((line) => this.escapeQuiltFortuneText(line))
        .join('<br />');
    }

    bindReflectionCarouselInviteClicks() {
      if (this._reflectionInviteClickBound) return;
      this._reflectionInviteClickBound = true;
      document.addEventListener('click', (event) => {
        const inviteBtn = event.target?.closest?.('#screen-quilt .quilt-reflection-carousel-invite-btn');
        if (!inviteBtn) return;
        event.preventDefault();
        event.stopPropagation();
        this.openReflectionResponseFromInvite();
      });
    }

    setupReflectionResponsePrototype() {
      this.bindReflectionCarouselInviteClicks();
      const form = document.getElementById('quiltReflectionResponseForm');
      const input = document.getElementById('quiltReflectionResponseInput');
      if (!form || !input || form.dataset.listenerAttached === '1') return;
      form.dataset.listenerAttached = '1';
      const helper = form.querySelector('.quilt-reflection-response-helper');
      const submit = form.querySelector('.quilt-reflection-response-submit');
      const idleSubmitLabel = 'Add a thought';
      const reflectionPatchMaxChars = 200;
      const reflectionPatchLimitMessage = "That's all one patch can hold ! Mind shortening?";
      let reflectionPatchLimitTimer = null;
      input.setAttribute('maxlength', String(reflectionPatchMaxChars));
      const setHelper = (message, state = '') => {
        if (!helper) return;
        const text = String(message || '');
        helper.textContent = text;
        helper.classList.toggle('is-error', state === 'error');
        helper.classList.toggle('is-success', state === 'success');
        helper.classList.toggle('is-patch-limit', state === 'patch-limit');
        const show =
          Boolean(text.trim()) || state === 'error' || state === 'success' || state === 'patch-limit';
        if (show) helper.removeAttribute('hidden');
        else {
          helper.setAttribute('hidden', 'hidden');
          helper.textContent = '';
        }
      };
      const showReflectionPatchLimitMessage = () => {
        setHelper(reflectionPatchLimitMessage, 'patch-limit');
        if (reflectionPatchLimitTimer) clearTimeout(reflectionPatchLimitTimer);
        reflectionPatchLimitTimer = setTimeout(() => {
          reflectionPatchLimitTimer = null;
          if (helper?.textContent === reflectionPatchLimitMessage) {
            setHelper('', '');
          }
        }, 3200);
      };
      const reflectionWouldExceedPatchMax = (insertLength) => {
        const len = input.value.length;
        const start = input.selectionStart ?? len;
        const end = input.selectionEnd ?? len;
        const selected = Math.max(0, end - start);
        return len - selected + Math.max(0, insertLength) > reflectionPatchMaxChars;
      };
      input.addEventListener('beforeinput', (event) => {
        if (event.isComposing) return;
        if (event.inputType?.startsWith('delete')) return;
        if (event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop') return;
        const insertLen =
          event.inputType === 'insertText' || event.inputType === 'insertCompositionText'
            ? String(event.data || '').length
            : 0;
        if (!insertLen) return;
        if (reflectionWouldExceedPatchMax(insertLen)) {
          event.preventDefault();
          showReflectionPatchLimitMessage();
        }
      });
      input.addEventListener('keydown', (event) => {
        if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
        if (
          event.key === 'Backspace' ||
          event.key === 'Delete' ||
          event.key === 'Tab' ||
          event.key === 'Enter' ||
          event.key.startsWith('Arrow')
        ) {
          return;
        }
        if (event.key.length !== 1) return;
        if (reflectionWouldExceedPatchMax(1)) {
          event.preventDefault();
          showReflectionPatchLimitMessage();
        }
      });
      input.addEventListener('paste', (event) => {
        const pasted = event.clipboardData?.getData('text') || '';
        if (!pasted || !reflectionWouldExceedPatchMax(pasted.length)) return;
        event.preventDefault();
        const len = input.value.length;
        const start = input.selectionStart ?? len;
        const end = input.selectionEnd ?? len;
        const room = reflectionPatchMaxChars - (len - Math.max(0, end - start));
        if (room > 0) {
          const next = `${input.value.slice(0, start)}${pasted.slice(0, room)}${input.value.slice(end)}`;
          input.value = next;
          const caret = start + room;
          input.setSelectionRange(caret, caret);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        showReflectionPatchLimitMessage();
      });
      input.addEventListener('input', () => {
        form.classList.remove('is-submitted', 'is-confirmed-collapsed');
        input.removeAttribute('readonly');
        if (helper?.classList?.contains('is-patch-limit')) {
          if (input.value.length < reflectionPatchMaxChars) {
            if (reflectionPatchLimitTimer) clearTimeout(reflectionPatchLimitTimer);
            reflectionPatchLimitTimer = null;
            setHelper('', '');
          }
        } else {
          setHelper('', '');
        }
        if (submit) {
          this._setReflectionSubmitLabel(submit, idleSubmitLabel);
          submit.disabled = false;
        }
      });
      document.addEventListener('firebaseReady', () => {
        this._ensureQuiltLowerSections({ phase: 'network' });
      }, { once: true });
      Utils.syncReflectionPatchStarElement();
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const responseText = String(input.value || '').replace(/\s+/g, ' ').trim();
        if (!responseText) {
          setHelper('Add one small thought first.', 'error');
          input.focus();
          return;
        }
        const reflectionWordCount = responseText.split(/\s+/).filter(Boolean).length;
        if (reflectionWordCount < 2 || responseText.length < 8) {
          setHelper('A short sentence helps — even a few words about what you noticed.', 'error');
          input.focus();
          return;
        }
        if (submit) {
          submit.disabled = true;
          this._setReflectionSubmitLabel(submit, 'Adding…');
        }
        setHelper('One moment…');
        try {
          await this.submitReflectionResponse(responseText);
        } catch (error) {
          this.logger?.warn?.('Reflection response submit failed:', error);
          if (error?.rejected) {
            setHelper(
              error.message ||
                'Something here got flagged. Try a short full sentence about what you noticed.',
              'error'
            );
          } else if (error?.status === 503) {
            setHelper(
              error.message ||
                'Could not review your reflection right now. Please wait a moment and try again.',
              'error'
            );
          } else {
            setHelper('Could not share yet. Check your connection and try again.', 'error');
          }
          if (submit) {
            this._setReflectionSubmitLabel(submit, idleSubmitLabel);
            submit.disabled = false;
          }
          return;
        }
        form.classList.add('is-submitted');
        input.value = '';
        input.setAttribute('readonly', 'readonly');
        setHelper(Utils.getReflectionThankYouMessage(), 'success');
        setTimeout(() => {
          if (helper?.classList?.contains('is-success')) setHelper('', '');
        }, 2000);
        if (submit) {
          this._setReflectionSubmitLabel(submit, idleSubmitLabel);
          submit.disabled = true;
        }
        setTimeout(() => {
          form.classList.add('is-confirmed-collapsed');
        }, 1600);
        const todayKey = Utils.getTodayKey();
        if (this._reflectionThemesNotFoundKeys) this._reflectionThemesNotFoundKeys.delete(todayKey);
        this._ensureQuiltLowerSections({ phase: 'network' });
      });
    }

    normalizeReflectionIdeaText(value) {
      return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\.+$/g, '')
        .trim();
    }

    _firstResponseFromPayload(payload) {
      return this.quoteService?._firstResponseFromPayload?.(payload) || '';
    }

    _userNameFromPayload(payload) {
      const name = String(payload?.user_name ?? payload?.userName ?? '').trim();
      return name || 'Zak';
    }

    formatFirstResponsePatchText(firstResponse) {
      return this.normalizeReflectionIdeaText(firstResponse);
    }

    reflectionThemeBodyKey(value) {
      const text = this.reflectionWallThemeText(value) || this.normalizeReflectionIdeaText(value);
      return text ? text.toLowerCase() : '';
    }

    /** Firestore themes are append-only (oldest → newest); wall shows newest left. */
    orderReflectionCommunityThemesNewestFirst(themes) {
      return Array.isArray(themes) ? themes.slice().reverse() : [];
    }

    buildReflectionWallThemes(
      communityThemes = [],
      firstResponseOverride = null,
      firstResponseAuthor = REFLECTION_FIRST_PATCH_AUTHOR
    ) {
      const firstRaw =
        firstResponseOverride != null && String(firstResponseOverride).trim()
          ? String(firstResponseOverride)
          : this._firstResponseFromPayload(
              (typeof this.getEffectiveQuiltQuote === 'function' && this.isAdminTomorrowPreviewActive?.()
                ? this.getEffectiveQuiltQuote()
                : this.quoteService?.getTodayQuote?.()) || {}
            );
      const firstAuthor =
        String(firstResponseAuthor || REFLECTION_FIRST_PATCH_AUTHOR).trim() ||
        REFLECTION_FIRST_PATCH_AUTHOR;
      const first = firstRaw
        ? {
            text: this.formatFirstResponsePatchText(firstRaw),
            author: firstAuthor
          }
        : null;
      const community = this.orderReflectionCommunityThemesNewestFirst(
        (Array.isArray(communityThemes) ? communityThemes : [])
          .map((theme) => this.normalizeReflectionWallTheme(theme))
          .filter((entry) => entry?.text)
      );
      if (!first) return community;
      const firstKey = this.reflectionThemeBodyKey(first);
      const rest = community.filter((entry) => this.reflectionThemeBodyKey(entry) !== firstKey);
      return [...rest, first];
    }

    async fetchTodayFirstResponseFields() {
      if (typeof this.getEffectiveQuiltQuote === 'function' && this.isAdminTomorrowPreviewActive?.()) {
        const previewQuote = this.getEffectiveQuiltQuote();
        const fromPreview = this._firstResponseFromPayload(previewQuote || {});
        if (fromPreview) {
          return {
            first_response: fromPreview,
            user_name: this._userNameFromPayload(previewQuote) || REFLECTION_FIRST_PATCH_AUTHOR
          };
        }
      }
      const dateKey =
        typeof this.getEffectiveAppDateKey === 'function' && this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveAppDateKey()
          : Utils.getTodayKey();
      if (!dateKey) return { first_response: '', user_name: REFLECTION_FIRST_PATCH_AUTHOR };
      const localAssign = this._reflectionAssignmentContextFromLocal(dateKey);
      if (localAssign.first_response) {
        return {
          first_response: localAssign.first_response,
          user_name: localAssign.user_name || REFLECTION_FIRST_PATCH_AUTHOR
        };
      }
      if (window.db && window.firestore?.doc) {
        try {
          const readDoc = window.firestore.getDoc || window.firestore.getDocFromServer;
          const snap = await readDoc(window.firestore.doc(window.db, 'dailyQuoteAssignments', dateKey));
          if (snap.exists()) {
            const data = snap.data() || {};
            return {
              first_response: this._firstResponseFromPayload(data),
              user_name: this._userNameFromPayload(data)
            };
          }
        } catch (error) {
          this.logger?.warn?.('first_response assignment read failed:', error);
        }
      }
      return { first_response: '', user_name: REFLECTION_FIRST_PATCH_AUTHOR };
    }

    async resolveReflectionWallThemes(communityThemes = [], firstResponseContext = null) {
      const ctx =
        firstResponseContext && typeof firstResponseContext === 'object'
          ? firstResponseContext
          : firstResponseContext != null && String(firstResponseContext).trim()
            ? { first_response: String(firstResponseContext), user_name: '' }
            : {};
      const quotePayload =
        (typeof this.getEffectiveQuiltQuote === 'function' && this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveQuiltQuote()
          : this.quoteService?.getTodayQuote?.()) || {};
      let first = String(ctx.first_response ?? '').trim() || this._firstResponseFromPayload(quotePayload);
      let userName = this._userNameFromPayload(ctx);
      if (!first) {
        const assignment = await this.fetchTodayFirstResponseFields();
        first = assignment.first_response;
        userName = assignment.user_name || userName;
      } else if (!String(ctx.user_name ?? ctx.userName ?? '').trim()) {
        userName = this._userNameFromPayload(quotePayload);
      }
      return this.buildReflectionWallThemes(communityThemes, first, userName);
    }

    /** Gentle normalize: keep warm neutral clipping paper, slightly apart from quilt blocks. */
    washReflectionCarouselPatchRgb(rgbCsv) {
      const hex = this.reflectionFabricRgbCsvToHex(rgbCsv);
      const hsv = Utils.hexToHsv(hex);
      let hue = hsv.s < 6 ? 34 : hsv.h;
      if (hsv.s >= 10 && hue > 55 && hue < 185) {
        hue = 32 + (hue % 12);
      }
      const wash = Utils.hsvToHex(
        hue,
        Math.max(6, Math.min(16, hsv.s < 8 ? 9 : hsv.s * 0.65)),
        Math.max(88, Math.min(96, hsv.v < 88 ? hsv.v + (92 - hsv.v) * 0.35 : hsv.v))
      );
      const match = /^#?([0-9a-f]{6})$/i.exec(wash);
      if (!match) return REFLECTION_NEWSPAPER_PATCH_RGB;
      const h = match[1];
      const lighten = 0.04;
      const channels = [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16)
      ].map((channel) => Math.round(channel + (255 - channel) * lighten));
      return channels.join(', ');
    }

    getReflectionFabricPatchPalette() {
      const paletteRgb = REFLECTION_NEWSPAPER_PATCH_HEX.map((color) => {
        const match = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim());
        if (!match) return REFLECTION_NEWSPAPER_PATCH_RGB;
        const hex = match[1];
        return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
      });
      const seenRgb = new Set();
      return paletteRgb.filter((rgb) => {
        const key = this.normalizeReflectionFabricRgbKey(rgb);
        if (!key || seenRgb.has(key)) return false;
        seenRgb.add(key);
        return true;
      });
    }

    getReflectionFabricPatchLuminance(rgbCsv) {
      const parts = String(rgbCsv || '')
        .split(',')
        .map((value) => parseInt(String(value).trim(), 10));
      if (parts.length < 3 || parts.some((channel) => !Number.isFinite(channel))) return 0.72;
      const [r, g, b] = parts;
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    getReflectionFabricPatchTextColor(rgbCsv) {
      return this.getReflectionFabricPatchLuminance(rgbCsv) < 0.58
        ? 'rgba(255, 252, 247, 0.95)'
        : '#2f271f';
    }

    getReflectionFabricPatchWeaveStrength(rgbCsv) {
      const luminance = this.getReflectionFabricPatchLuminance(rgbCsv);
      if (luminance < 0.58) return 1;
      const t = Math.min(1, (luminance - 0.58) / 0.42);
      return Number((1 - t * 0.7).toFixed(2));
    }

    getReflectionFabricPatchHeight(themeText, allThemes = []) {
      const minRem = 11;
      const maxRem = 13.25;
      const normalizeLen = (value) => {
        const text = this.reflectionWallThemeText(value) || String(value || '').trim();
        return text.length;
      };
      const len = normalizeLen(themeText);
      const lengths = (Array.isArray(allThemes) ? allThemes : [])
        .map((item) => normalizeLen(item))
        .filter((count) => count > 0);
      if (!lengths.length) lengths.push(Math.max(len, 9));
      const minLen = Math.min(...lengths);
      const maxLen = Math.max(...lengths);
      let t;
      if (maxLen > minLen) {
        t = (Math.max(len, minLen) - minLen) / (maxLen - minLen);
      } else {
        t = Math.min(1, Math.max(0, (len - 6) / 48));
      }
      const heightRem = minRem + t * (maxRem - minRem);
      return `${heightRem.toFixed(2)}rem`;
    }

    getReflectionFabricPatchContentWeight(themeEntry) {
      if (themeEntry === 'add yours' || themeEntry === 'add yours ?') return 0;
      const normalized = this.normalizeReflectionWallTheme(themeEntry);
      if (normalized?.text) {
        const author = String(normalized.author || '').trim();
        return normalized.text.length + (author ? author.length + 3 : 0);
      }
      const text = this.reflectionWallThemeText(themeEntry) || String(themeEntry || '').trim();
      return text.length;
    }

    /** Grow with copy length; clipping CSS caps cards at --reflection-clipping-card-max (88vw). */
    getReflectionFabricPatchWidth(themeEntry, allThemes = []) {
      if (themeEntry === 'add yours' || themeEntry === 'add yours ?') return '44vw';
      const chars = this.getReflectionFabricPatchContentWeight(themeEntry);
      if (!chars) return '44vw';
      if (chars <= 62) return '54vw';
      if (chars <= 95) return '64vw';
      if (chars <= 125) return '72vw';
      if (chars <= 158) return '80vw';
      return '84vw';
    }

    getReflectionFabricPatchTilt(index) {
      const tilts = [-0.85, 0.72, -0.58, 0.9, -0.68, 0.55];
      return `${tilts[Math.abs(index) % tilts.length]}deg`;
    }

    normalizeReflectionFabricRgbKey(rgbCsv) {
      return String(rgbCsv || '')
        .split(',')
        .map((value) => parseInt(String(value).trim(), 10))
        .filter((channel) => Number.isFinite(channel))
        .join(',');
    }

    getReflectionFabricRgbDistance(aCsv, bCsv) {
      const read = (csv) =>
        String(csv || '')
          .split(',')
          .map((value) => parseInt(String(value).trim(), 10));
      const a = read(aCsv);
      const b = read(bCsv);
      if (a.length < 3 || b.length < 3) return 999;
      return Math.sqrt(
        (a[0] - b[0]) ** 2 +
        (a[1] - b[1]) ** 2 +
        (a[2] - b[2]) ** 2
      );
    }

    isReflectionFabricRgbDistinctFrom(candidateRgb, referenceRgb, minDistance = 34) {
      if (!referenceRgb) return true;
      if (this.normalizeReflectionFabricRgbKey(candidateRgb) === this.normalizeReflectionFabricRgbKey(referenceRgb)) {
        return false;
      }
      return this.getReflectionFabricRgbDistance(candidateRgb, referenceRgb) >= minDistance;
    }

    reflectionFabricRgbCsvToHex(rgbCsv) {
      const parts = String(rgbCsv || '')
        .split(',')
        .map((value) => parseInt(String(value).trim(), 10));
      if (parts.length < 3 || parts.some((channel) => !Number.isFinite(channel))) return '#f6f4f1';
      return `#${parts
        .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
        .join('')}`;
    }

    getReflectionFabricPatchToneVariant(rgbCsv, mode = 'lighter', delta = 22) {
      const parts = String(rgbCsv || '')
        .split(',')
        .map((value) => parseInt(String(value).trim(), 10));
      if (parts.length < 3 || parts.some((channel) => !Number.isFinite(channel))) {
        return rgbCsv || REFLECTION_NEWSPAPER_PATCH_RGB;
      }
      const shift = mode === 'lighter' ? Math.abs(delta) : -Math.abs(delta);
      const shifted = parts.map((channel) => Math.min(255, Math.max(0, channel + shift)));
      const key = shifted.join(',');
      if (key !== this.normalizeReflectionFabricRgbKey(rgbCsv)) return shifted.join(', ');
      const nudge = mode === 'lighter' ? Math.max(12, Math.round(Math.abs(delta) * 0.55)) : -Math.max(12, Math.round(Math.abs(delta) * 0.55));
      return parts.map((channel) => Math.min(255, Math.max(0, channel + nudge))).join(', ');
    }

    getReflectionFabricPatchHueVariant(rgbCsv, hueShiftDeg = 26) {
      const hex = this.reflectionFabricRgbCsvToHex(rgbCsv);
      const hsv = Utils.hexToHsv(hex);
      let hue = (hsv.h + hueShiftDeg + 360) % 360;
      if (hsv.s >= 10 && hue > 55 && hue < 185) {
        hue = 32 + (hue % 12);
      }
      const next = Utils.hsvToHex(
        hue,
        Math.max(6, Math.min(16, hsv.s < 8 ? 10 : hsv.s * 0.5)),
        Math.max(86, Math.min(95, hsv.v))
      );
      const match = /^#?([0-9a-f]{6})$/i.exec(next);
      if (!match) return rgbCsv || REFLECTION_NEWSPAPER_PATCH_RGB;
      const h = match[1];
      return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
    }

    ensureDistinctReflectionPatchRgb(referenceRgb, preferredIndex = 0) {
      const fallback = REFLECTION_NEWSPAPER_PATCH_RGB;
      if (!referenceRgb) return fallback;
      const toneSteps = [
        ['lighter', 26],
        ['darker', 26],
        ['lighter', 40],
        ['darker', 40]
      ];
      let candidate = referenceRgb;
      for (const [mode, delta] of toneSteps) {
        candidate = this.getReflectionFabricPatchToneVariant(referenceRgb, mode, delta);
        if (this.isReflectionFabricRgbDistinctFrom(candidate, referenceRgb)) return candidate;
      }
      const hueShifts = [24, -24, 42, -42];
      for (let i = 0; i < hueShifts.length; i++) {
        candidate = this.getReflectionFabricPatchHueVariant(referenceRgb, hueShifts[i]);
        if (this.isReflectionFabricRgbDistinctFrom(candidate, referenceRgb)) return candidate;
      }
      return this.getReflectionFabricPatchHueVariant(referenceRgb, 28 + (preferredIndex % 3) * 11);
    }

    pickReflectionFabricPatchRgb(preferredIndex, previousRgb, paletteOverride) {
      const palette = Array.isArray(paletteOverride) ? paletteOverride : this.getReflectionFabricPatchPalette();
      const fallback = REFLECTION_NEWSPAPER_PATCH_RGB;
      const pickAt = (idx) => {
        if (!palette.length) return fallback;
        const safe = ((idx % palette.length) + palette.length) % palette.length;
        return palette[safe] || fallback;
      };
      if (!previousRgb) return pickAt(preferredIndex);
      let candidate = pickAt(preferredIndex);
      if (this.isReflectionFabricRgbDistinctFrom(candidate, previousRgb)) return candidate;
      for (let offset = 1; offset < palette.length; offset++) {
        candidate = pickAt(preferredIndex + offset);
        if (this.isReflectionFabricRgbDistinctFrom(candidate, previousRgb)) return candidate;
      }
      return this.ensureDistinctReflectionPatchRgb(previousRgb, preferredIndex);
    }

    getReflectionFabricPatchStyle(index, themeText, allThemes, rgbOverride) {
      const palette = this.getReflectionFabricPatchPalette();
      const rawRgb =
        rgbOverride || palette[index % palette.length] || REFLECTION_NEWSPAPER_PATCH_RGB;
      const rgb = this.washReflectionCarouselPatchRgb(rawRgb);
      const textColor = this.getReflectionFabricPatchTextColor(rgb);
      const weaveStrength = this.getReflectionFabricPatchWeaveStrength(rgb);
      return [
        `--reflection-fabric-rgb: ${rgb}`,
        `--reflection-fabric-text: ${textColor}`,
        `--reflection-fabric-weave: ${weaveStrength}`,
        `--reflection-patch-w: ${this.getReflectionFabricPatchWidth(themeText, allThemes)}`,
        `--reflection-patch-h: ${this.getReflectionFabricPatchHeight(themeText, allThemes)}`,
        `--reflection-fabric-tilt: ${this.getReflectionFabricPatchTilt(index)}`,
        `--reflection-fabric-y: 0rem`,
        `--reflection-slide-z: ${index + 1}`
      ].join('; ');
    }

    getReflectionCarouselFrayMarkup({ left = false, right = false } = {}) {
      const parts = [
        '<span class="quilt-reflection-carousel-fray quilt-reflection-carousel-fray--bottom" aria-hidden="true"></span>'
      ];
      if (left) {
        parts.push(
          '<span class="quilt-reflection-carousel-fray quilt-reflection-carousel-fray--left" aria-hidden="true"></span>'
        );
      }
      if (right) {
        parts.push(
          '<span class="quilt-reflection-carousel-fray quilt-reflection-carousel-fray--right" aria-hidden="true"></span>'
        );
      }
      return parts.join('\n                ');
    }

    buildReflectionInvitePatchSlide(index, allThemesForHeight = [], rgbOverride) {
      const rawRgb = rgbOverride || this.pickReflectionFabricPatchRgb(index, null);
      const washedRgb = this.washReflectionCarouselPatchRgb(rawRgb);
      const lightClass =
        this.getReflectionFabricPatchWeaveStrength(washedRgb) < 1 ? ' quilt-reflection-carousel-slide--light' : '';
      const heightThemes = allThemesForHeight.length ? allThemesForHeight : ['add yours ?'];
      const dateKey = String(Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const style = this.getReflectionFabricPatchStyle(index, 'add yours ?', heightThemes, rawRgb);
      return `
            <article class="quilt-reflection-carousel-slide quilt-reflection-carousel-slide--clipping quilt-reflection-carousel-slide--invite${lightClass}" data-reflection-invite-slide data-reflection-slide="${index}" data-reflection-hand-cut-seed="${dateKey}:reflection-invite:${index}" style="${style}">
              <button type="button" class="quilt-reflection-carousel-invite-btn" aria-label="Add your reflection?">add yours ?</button>
            </article>
          `;
    }

    buildReflectionThemePatchSlide(slideIndex, theme, allThemes, rgb, edgeFray = {}) {
      const dateKey = String(Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const lightClass =
        this.getReflectionFabricPatchWeaveStrength(this.washReflectionCarouselPatchRgb(rgb)) < 1
          ? ' quilt-reflection-carousel-slide--light'
          : '';
      const wideCopyClass = this.reflectionCarouselNeedsWideCopy(theme)
        ? ' quilt-reflection-carousel-slide--wide-copy'
        : '';
      return `
            <article class="quilt-reflection-carousel-slide quilt-reflection-carousel-slide--clipping${wideCopyClass}${lightClass}" data-reflection-theme-slide data-reflection-slide="${slideIndex}" data-reflection-hand-cut-seed="${dateKey}:reflection-response:${slideIndex}" style="${this.getReflectionFabricPatchStyle(slideIndex, theme, allThemes, rgb)}">
              <div class="quilt-reflection-carousel-text quilt-reflection-carousel-copy">${this.formatReflectionCarouselTextHtml(theme)}</div>
            </article>
          `;
    }

    openReflectionResponseFromInvite() {
      const form = document.getElementById('quiltReflectionResponseForm');
      const input = document.getElementById('quiltReflectionResponseInput');
      if (!form || form.classList.contains('is-confirmed-collapsed')) return;
      if (!input) return;
      try {
        input.focus({ preventScroll: false });
      } catch (_) {
        input.focus();
      }
    }

    getReflectionCarouselMarkup(themeTexts) {
      const ideas = Array.isArray(themeTexts) ? themeTexts.filter(Boolean) : [];
      const dateKey = String(Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const responseCount = ideas.length;
      const themeRgbs = [];
      let previousRgb = null;
      ideas.forEach((_, index) => {
        const rgb = this.pickReflectionFabricPatchRgb(index, previousRgb);
        themeRgbs.push(rgb);
        previousRgb = rgb;
      });
      const inviteRgb = this.pickReflectionFabricPatchRgb(responseCount, previousRgb);
      const slideParts = [];
      let slideIndex = 0;
      for (let i = 0; i < responseCount; i++) {
        slideParts.push(
          this.buildReflectionThemePatchSlide(slideIndex, ideas[i], ideas, themeRgbs[i], {})
        );
        slideIndex += 1;
      }
      slideParts.push(
        this.buildReflectionInvitePatchSlide(
          slideIndex,
          ideas.length ? [...ideas, 'add yours ?'] : ['add yours ?'],
          inviteRgb
        )
      );
      const slides = slideParts.join('');
      const viewportAttrs =
        'role="region" tabindex="0" aria-label="Swipe through reflection theme patches and add yours"';
      return `
        <div class="quilt-reflection-carousel" data-reflection-carousel data-reflection-hand-cut-date-key="${dateKey}">
          <div class="quilt-reflection-carousel-viewport" data-reflection-carousel-viewport ${viewportAttrs}>
            <div class="quilt-reflection-carousel-track" data-reflection-carousel-track>${slides}</div>
          </div>
        </div>
      `;
    }

    syncReflectionCarouselEdgeFray(slides) {
      const list = Array.isArray(slides) ? slides : [];
      if (!list.length) return;
      list.forEach((slide) => {
        if (slide.classList.contains('quilt-reflection-carousel-slide--clipping')) {
          slide.querySelectorAll('.quilt-reflection-carousel-fray').forEach((el) => el.remove());
          return;
        }
        slide.querySelector('.quilt-reflection-carousel-fray--left')?.remove();
        slide.querySelector('.quilt-reflection-carousel-fray--right')?.remove();
      });
      const insertSideFray = (slide, side) => {
        if (!slide) return;
        const bottom = slide.querySelector('.quilt-reflection-carousel-fray--bottom');
        const fray = document.createElement('span');
        fray.className = `quilt-reflection-carousel-fray quilt-reflection-carousel-fray--${side}`;
        fray.setAttribute('aria-hidden', 'true');
        if (bottom?.nextSibling) slide.insertBefore(fray, bottom.nextSibling);
        else if (bottom) bottom.after(fray);
        else slide.prepend(fray);
      };
      if (!list[0].classList.contains('quilt-reflection-carousel-slide--clipping')) {
        insertSideFray(list[0], 'left');
      }
      const last = list[list.length - 1];
      if (!last.classList.contains('quilt-reflection-carousel-slide--clipping')) {
        insertSideFray(last, 'right');
      }
    }

    syncReflectionCarouselJoinTape(slides) {
      const list = Array.isArray(slides) ? slides : [];
      const track = list[0]?.closest?.('[data-reflection-carousel-track]');
      const carousel = list[0]?.closest?.('[data-reflection-carousel]');
      carousel?.querySelector('.quilt-reflection-carousel-join-tape--band')?.remove();
      list.forEach((slide) => {
        slide.querySelector('.quilt-reflection-carousel-seam--join')?.remove();
        slide.querySelector('.quilt-reflection-carousel-join-tape')?.remove();
        slide.classList.remove('has-join-tape-left');
      });
      track?.querySelectorAll('.quilt-reflection-carousel-join-tape').forEach((el) => el.remove());
      if (!track || list.length < 2) return;

      const isResponseSlide = (slide) => slide?.hasAttribute?.('data-reflection-theme-slide');

      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const next = list[i];
        if (!isResponseSlide(prev) && !isResponseSlide(next)) continue;
        const prevH = prev.offsetHeight;
        const nextH = next.offsetHeight;
        if (!prevH || !nextH) continue;

        const overlapTop = Math.max(prev.offsetTop, next.offsetTop);
        const overlapBottom = Math.min(
          prev.offsetTop + prev.offsetHeight,
          next.offsetTop + next.offsetHeight
        );
        if (overlapBottom <= overlapTop) continue;

        const joinLeft = next.offsetLeft;
        const tape = document.createElement('span');
        tape.className = 'quilt-reflection-carousel-join-tape is-visible';
        tape.setAttribute('aria-hidden', 'true');
        tape.style.setProperty('--reflection-join-tape-left', `${joinLeft}px`);
        tape.style.setProperty('--reflection-join-tape-top', `${overlapTop}px`);
        tape.style.setProperty('--reflection-join-tape-span', `${overlapBottom - overlapTop}px`);
        const nextStyle = getComputedStyle(next);
        tape.style.setProperty(
          '--reflection-fabric-tilt',
          nextStyle.getPropertyValue('--reflection-fabric-tilt').trim() || '0deg'
        );
        tape.style.setProperty(
          '--reflection-fabric-y',
          nextStyle.getPropertyValue('--reflection-fabric-y').trim() || '0rem'
        );
        track.appendChild(tape);
      }
    }

    /** Full-width strip: straight sides + bottom; one barely-there peak on the top edge. */
    _buildFooterIconStripTopCutClipPath(w, h, seedKey = '') {
      const iw = Math.max(1, Math.round(Number(w) || 0));
      const ih = Math.max(1, Math.round(Number(h) || 0));
      if (iw < 48 || ih < 14) return null;

      const QNC = globalThis.QuiltNewspaperClipping;
      let seed = 0;
      if (QNC?.hashDateKeySeed) {
        seed = QNC.hashDateKeySeed(String(seedKey || 'footer-icon-strip').trim() || 'footer-icon-strip');
      } else {
        for (const ch of String(seedKey || 'nodate')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      }
      const rnd = (() => {
        let s = seed >>> 0;
        return () => {
          s = (s * 1664525 + 1013904223) >>> 0;
          return s / 0xffffffff;
        };
      })();

      const leanLeft = rnd() < 0.5;
      const tabLiftPx = Math.max(1, Math.min(2, Math.round(ih * 0.03)));
      const cornerYPx = tabLiftPx;
      const xPeak = Math.round(
        iw * (leanLeft ? 0.22 + rnd() * 0.12 : 0.66 + rnd() * 0.12)
      );
      const pts = [
        `0px ${ih}px`,
        `0px ${cornerYPx}px`,
        `${xPeak}px 0px`,
        `${iw}px ${cornerYPx}px`,
        `${iw}px ${ih}px`
      ];
      return {
        clip: `polygon(${pts.join(', ')})`,
        peakOverhangPx: cornerYPx + 1
      };
    }

    _applyFooterIconStripHandCut(stripEl) {
      if (!stripEl) return;
      const row = stripEl.closest('.quilt-footer-icon-row');
      if (!row) {
        stripEl.style.removeProperty('--quilt-footer-icon-strip-cut');
        stripEl.style.removeProperty('--quilt-footer-icon-strip-peak-overhang');
        return;
      }
      const rect = stripEl.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w < 48 || h < 14) {
        stripEl.style.removeProperty('--quilt-footer-icon-strip-cut');
        stripEl.style.removeProperty('--quilt-footer-icon-strip-peak-overhang');
        return;
      }
      const dateKey = String(
        typeof Utils !== 'undefined' && typeof Utils.getTodayKey === 'function'
          ? Utils.getTodayKey()
          : ''
      ).trim() || 'nodate';
      const built = this._buildFooterIconStripTopCutClipPath(w, h, `${dateKey}:footer-icon-strip`);
      if (built?.clip) {
        const overhang = `${built.peakOverhangPx}px`;
        row.style.setProperty('--quilt-footer-icon-strip-peak-overhang', overhang);
        stripEl.style.setProperty('--quilt-footer-icon-strip-cut', built.clip);
        stripEl.style.setProperty('--quilt-footer-icon-strip-peak-overhang', overhang);
      } else {
        row.style.removeProperty('--quilt-footer-icon-strip-peak-overhang');
        stripEl.style.removeProperty('--quilt-footer-icon-strip-cut');
        stripEl.style.removeProperty('--quilt-footer-icon-strip-peak-overhang');
      }
    }

    ensureFooterIconStripHandCut() {
      document.querySelectorAll('.quilt-footer-icon-row').forEach((row) => {
        const strip = row.querySelector('.quilt-footer-icon-strip');
        if (!strip) return;
        const applyStripCut = () => this._applyFooterIconStripHandCut(strip);
        applyStripCut();
        requestAnimationFrame(() => {
          applyStripCut();
          requestAnimationFrame(applyStripCut);
        });
        if (typeof ResizeObserver === 'undefined') return;
        if (!this._footerIconStripHandCutObserver) {
          this._footerIconStripHandCutObserver = new ResizeObserver(() => {
            document
              .querySelectorAll('.quilt-footer-icon-row .quilt-footer-icon-strip')
              .forEach((el) => this._applyFooterIconStripHandCut(el));
          });
        }
        if (strip.dataset.footerIconStripObserved !== '1') {
          strip.dataset.footerIconStripObserved = '1';
          try {
            this._footerIconStripHandCutObserver.observe(strip);
          } catch (_) {
            /* ignore */
          }
        }
      });
    }

    _footerIconInkTokensForBackground(lightBackground) {
      if (lightBackground) {
        return {
          ink: 'rgba(36, 27, 20, 0.68)',
          inkStrong: 'rgba(36, 27, 20, 0.88)',
          inkPressed: 'rgba(36, 27, 20, 0.94)',
          pressedBg: 'rgba(255, 255, 255, 0.58)'
        };
      }
      return {
        ink: 'rgba(255, 248, 239, 0.72)',
        inkStrong: 'rgba(255, 252, 247, 0.95)',
        inkPressed: 'rgba(255, 252, 247, 0.98)',
        pressedBg: 'rgba(36, 27, 20, 0.32)'
      };
    }

    _applyFooterIconInkTokens(row, tokens) {
      if (!row || !tokens) return;
      row.style.setProperty('--quilt-footer-icon-ink', tokens.ink);
      row.style.setProperty('--quilt-footer-icon-ink-strong', tokens.inkStrong);
      row.style.setProperty('--quilt-footer-icon-ink-pressed', tokens.inkPressed);
      row.style.setProperty('--quilt-footer-icon-pressed-bg', tokens.pressedBg);
    }

    updateFooterIconInkContrast() {
      const rows = document.querySelectorAll('#screen-quilt .quilt-footer-icon-row');
      if (!rows.length) return;

      rows.forEach((row) => {
        this._applyFooterIconInkTokens(row, this._footerIconInkTokensForBackground(true));
      });
    }

    _footerIconPaperElements() {
      return document.querySelectorAll('#screen-quilt .quilt-footer-icon-paper');
    }

    _footerIconPaperControlForPaper(paper) {
      const slot = paper?.parentElement;
      if (!slot) return null;
      return slot.querySelector(
        '.quilt-about-icon-link, .quilt-instagram-icon-link, .quilt-remember-icon-btn, .quilt-settings-icon-btn'
      );
    }

    _footerIconPaperPadPx() {
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const narrow = window.matchMedia?.('(max-width: 420px)')?.matches === true;
      const edgeExtra = (narrow ? 0.18 : 0.21) * rootPx;
      return {
        widthExtra: (narrow ? 0.48 : 0.55) * rootPx,
        topExtra: edgeExtra,
        bottomExtra: edgeExtra
      };
    }

    /** CSS icon button size when the footer is not measurable (`display: none` off-screen). */
    _footerIconPaperFallbackControlSize() {
      const narrow = window.matchMedia?.('(max-width: 420px)')?.matches === true;
      return narrow ? 52.8 : 59.4;
    }

    _footerIconPaperViewportBottom() {
      if (window.visualViewport?.height != null) {
        return window.visualViewport.height + (window.visualViewport.offsetTop || 0);
      }
      return window.innerHeight || document.documentElement.clientHeight || 0;
    }

    /** Visible bottom edge of the quilt scroll container (reliable on fixed `inset: 0` screens). */
    _footerIconPaperScreenBottom() {
      const offsetTop = window.visualViewport?.offsetTop || 0;
      const layoutBottom =
        (window.innerHeight || document.documentElement.clientHeight || 0) + offsetTop;
      const quiltScreen = document.getElementById('screen-quilt');
      const quiltBottom = quiltScreen?.getBoundingClientRect?.()?.bottom || 0;
      return Math.max(layoutBottom, quiltBottom);
    }

    _footerIconPaperApplyHeightScale(heightPx) {
      return Math.max(28, Math.round(Number(heightPx) * 0.85));
    }

    _footerIconScrollStopAnchor() {
      return (
        document.querySelector('#screen-quilt .quilt-footer-icon-row') ||
        document.querySelector('#screen-quilt .quilt-scroll-icon-footer')
      );
    }

    /** ScrollTop where the icon row sits on the screen bottom. */
    getQuiltFooterScrollStopTop(scroller = null) {
      const quiltScreen = document.getElementById('screen-quilt');
      const anchor = this._footerIconScrollStopAnchor();
      const el =
        scroller ||
        (typeof this.getQuiltScrollContainer === 'function' ? this.getQuiltScrollContainer() : null) ||
        quiltScreen;
      if (!quiltScreen?.classList.contains('active') || !anchor || !el) return 0;

      const screenBottom = this._footerIconPaperScreenBottom();
      const anchorRect = anchor.getBoundingClientRect();
      const stopTop = Math.round(el.scrollTop + (anchorRect.bottom - screenBottom));
      const nativeMax = Math.max(0, el.scrollHeight - el.clientHeight);
      return Math.max(0, Math.min(nativeMax, stopTop));
    }

    /** True when an element was on-screen enough that scroll compensation is safe. */
    _quiltLayoutAnchorInViewport(anchor) {
      if (!anchor?.getBoundingClientRect) return false;
      const rect = anchor.getBoundingClientRect();
      const viewportTop = window.visualViewport?.offsetTop || 0;
      const viewportBottom =
        typeof this._footerIconPaperViewportBottom === 'function'
          ? this._footerIconPaperViewportBottom()
          : window.innerHeight || document.documentElement.clientHeight || 0;
      return rect.bottom >= viewportTop - 8 && rect.top <= viewportBottom + 24;
    }

    /** Keep the visible anchor fixed when speaker/reflection layout mutates off-screen height. */
    _preserveQuiltScrollThroughLayout(fn, anchorEl = null) {
      if (typeof fn !== 'function') return;
      const scroller = document.getElementById('screen-quilt');
      if (!scroller?.classList.contains('active')) {
        fn();
        return;
      }
      if (this._footerIconClampLock) {
        fn();
        return;
      }
      const anchor =
        anchorEl ||
        document.getElementById('quiltMoodSpread') ||
        document.querySelector('#screen-quilt .quote-card-stack') ||
        document.getElementById('quoteSpeakerStage');
      const anchorVisible = anchor ? this._quiltLayoutAnchorInViewport(anchor) : false;
      const scrollBefore = scroller.scrollTop;
      const anchorTopBefore = anchor?.getBoundingClientRect?.().top ?? null;
      fn();
      if (!anchorVisible || !anchor || anchorTopBefore == null) return;
      const stabilize = () => {
        if (!document.getElementById('screen-quilt')?.classList.contains('active')) return;
        if (Math.abs((scroller.scrollTop || 0) - scrollBefore) > 2) return;
        const drift = anchor.getBoundingClientRect().top - anchorTopBefore;
        if (Math.abs(drift) <= 1.5) return;
        const next = Math.max(0, scrollBefore + drift);
        scroller.scrollTop = next;
      };
      stabilize();
      requestAnimationFrame(() => requestAnimationFrame(stabilize));
    }

    clampQuiltScrollToFooterStop(scroller = null) {
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen?.classList.contains('active')) return false;

      const scrollers = (
        scroller
          ? [scroller]
          : this._footerIconPaperScrollers()
      ).filter(Boolean);

      let clamped = false;
      const seen = new Set();
      scrollers.forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const stopTop = this.getQuiltFooterScrollStopTop(el);
        if (el.scrollTop > stopTop + 0.5) {
          el.scrollTop = stopTop;
          clamped = true;
        }
      });
      return clamped;
    }

    _footerIconPaperScrollers() {
      const quiltScreen = document.getElementById('screen-quilt');
      const candidates = [
        typeof this.getQuiltScrollContainer === 'function' ? this.getQuiltScrollContainer() : null,
        quiltScreen,
        document.getElementById('app'),
        document.querySelector('#screen-quilt .button-container')
      ].filter(Boolean);
      const seen = new Set();
      return candidates.filter((el) => {
        if (seen.has(el)) return false;
        seen.add(el);
        return true;
      });
    }

    _footerIconPaperPastScrollStop() {
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen?.classList.contains('active')) return false;
      return this._footerIconPaperScrollers().some((el) => {
        const stopTop = this.getQuiltFooterScrollStopTop(el);
        return el.scrollTop > stopTop + 0.5;
      });
    }

    _footerIconPaperAtScrollStop() {
      if (this._footerIconPaperPastScrollStop()) return false;
      const anchor = this._footerIconScrollStopAnchor();
      if (!anchor) return false;
      const screenBottom = this._footerIconPaperScreenBottom();
      const anchorRect = anchor.getBoundingClientRect();
      return Math.abs(anchorRect.bottom - screenBottom) <= 8;
    }

    _footerIconPaperRole(paperOrControl) {
      const role = String(paperOrControl?.dataset?.footerPaperRole || '').trim();
      if (role) return role;
      const control = paperOrControl;
      if (control?.classList?.contains('quilt-about-icon-link')) return 'about';
      if (control?.classList?.contains('quilt-instagram-icon-link')) return 'instagram';
      if (control?.classList?.contains('quilt-remember-icon-btn')) return 'remember';
      if (control?.classList?.contains('quilt-settings-icon-btn')) return 'settings';
      return 'icon';
    }

    _footerIconPaperHandCutCfg(w) {
      return {
        width: w,
        exportScale: 1,
        handCutMarginDomPx: 0.08,
        handCutCornerChamferDomPx: 5,
        handCutMacroDomPx: 5,
        handCutBiteMaxDomPx: 6,
        handCutSecondaryBiteDomPx: 4,
        handCutSideInwardMaxDomPx: 5,
        handCutTopBottomTrimDomPx: 2,
        handCutNotchesEnabled: false
      };
    }

    _footerIconPaperTopWidthRatio(role) {
      const map = {
        about: 0.87,
        instagram: 0.89,
        remember: 0.86,
        settings: 0.88
      };
      return map[role] || 0.87;
    }

    _footerIconPaperSizeScale(role) {
      const map = {
        about: { widthScale: 0.97, topPadScale: 1.06, bottomExtra: 2 },
        instagram: { widthScale: 1.05, topPadScale: 0.94, bottomExtra: 5 },
        remember: { widthScale: 1.0, topPadScale: 1.1, bottomExtra: 3 },
        settings: { widthScale: 1.03, topPadScale: 1.0, bottomExtra: 7 }
      };
      return map[role] || { widthScale: 1, topPadScale: 1, bottomExtra: 0 };
    }

    _ringToCssClipPolygon(ring, w, h) {
      if (!ring?.length) return null;
      const iw = Math.max(1, Number(w) || 1);
      const ih = Math.max(1, Number(h) || 1);
      const pts = ring.map((p) => {
        const x = Math.max(0, Math.min(100, (p.x / iw) * 100));
        const y = Math.max(0, Math.min(100, (p.y / ih) * 100));
        return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
      });
      return `polygon(${pts.join(', ')})`;
    }

    _taperFooterIconPaperRing(ring, w, h, topWidthRatio = 0.91) {
      const cx = w / 2;
      const ih = Math.max(1, Number(h) || 1);
      const topScale = Math.max(0.86, Math.min(0.97, Number(topWidthRatio) || 0.91));
      return ring.map((p) => {
        const yNorm = Math.max(0, Math.min(1, p.y / ih));
        const xScale = topScale + (1 - topScale) * yNorm;
        return { x: cx + (p.x - cx) * xScale, y: p.y };
      });
    }

    _footerIconPaperTornStepRand(seedKey, idx, salt = 0) {
      const QNC = globalThis.QuiltNewspaperClipping;
      const base =
        typeof QNC?.hashDateKeySeed === 'function'
          ? QNC.hashDateKeySeed(`${seedKey}:torn:${idx}:${salt}`)
          : (idx * 997 + salt * 668265) >>> 0;
      return ((base & 0xffff) / 0xffff);
    }

    _footerIconPaperTornEdgeWaveCount(seedKey, edgeSalt) {
      const r = this._footerIconPaperTornStepRand(seedKey, edgeSalt, 0);
      if (r < 0.22) return 0;
      if (r < 0.58) return 1;
      return 2;
    }

    _footerIconPaperTornEdgeWavePositions(seedKey, edgeSalt, count) {
      if (count <= 0) return [];
      if (count === 1) {
        return [0.34 + this._footerIconPaperTornStepRand(seedKey, edgeSalt, 1) * 0.32];
      }
      const a = 0.28 + this._footerIconPaperTornStepRand(seedKey, edgeSalt, 2) * 0.2;
      const b = 0.56 + this._footerIconPaperTornStepRand(seedKey, edgeSalt, 3) * 0.24;
      return a < b ? [a, b] : [b, a];
    }

    /**
     * Torn edges like `.quilt-user-color-together-note` — each edge gets 0–2 bite
     * points max; bottom stays flat for the screen dock.
     */
    _buildFooterIconPaperTornEdgeClipPath(w, h, seedKey, topWidthRatio = 0.91) {
      const iw = Math.max(1, Math.round(Number(w) || 0));
      const ih = Math.max(1, Math.round(Number(h) || 0));
      if (iw < 20 || ih < 28) return null;

      const topScale = Math.max(0.84, Math.min(0.97, Number(topWidthRatio) || 0.87));
      const topInset = (1 - topScale) * 50;
      const sideAmp = 3.6;
      const topAmp = 1.4;
      const topLeft = topInset;
      const topRight = 100 - topInset;
      const leftBaseX = (t) => topInset * (1 - t);
      const rightBaseX = (t) => 100 - topInset * (1 - t);
      const pts = [];

      const topCount = this._footerIconPaperTornEdgeWaveCount(seedKey, 30);
      const rightCount = this._footerIconPaperTornEdgeWaveCount(seedKey, 10);
      const leftCount = this._footerIconPaperTornEdgeWaveCount(seedKey, 20);

      pts.push({ x: topLeft, y: 0 });
      this._footerIconPaperTornEdgeWavePositions(seedKey, 30, topCount).forEach((t, i) => {
        const x = topLeft + (topRight - topLeft) * t;
        const bite =
          (i % 2 === 0 ? -1 : 1) *
          topAmp *
          (0.78 + this._footerIconPaperTornStepRand(seedKey, 30 + i, 4) * 0.18);
        pts.push({
          x: Math.max(topLeft, Math.min(topRight, x)),
          y: Math.max(0, Math.min(2.8, bite))
        });
      });
      pts.push({ x: topRight, y: 0 });

      this._footerIconPaperTornEdgeWavePositions(seedKey, 10, rightCount).forEach((t, i) => {
        const y = t * 100;
        const bite =
          (i % 2 === 0 ? 1 : -1) *
          sideAmp *
          (0.8 + this._footerIconPaperTornStepRand(seedKey, 10 + i, 1) * 0.16);
        pts.push({
          x: Math.max(rightBaseX(t) - 0.8, Math.min(100, rightBaseX(t) + bite)),
          y
        });
      });
      pts.push({ x: 100, y: 100 });
      pts.push({ x: 0, y: 100 });

      this._footerIconPaperTornEdgeWavePositions(seedKey, 20, leftCount)
        .slice()
        .reverse()
        .forEach((t, i) => {
          const y = t * 100;
          const bite =
            (i % 2 === 0 ? -1 : 1) *
            sideAmp *
            (0.78 + this._footerIconPaperTornStepRand(seedKey, 20 + i, 2) * 0.18);
          pts.push({
            x: Math.max(0, Math.min(leftBaseX(t) + sideAmp + 0.8, leftBaseX(t) + bite)),
            y
          });
        });

      const clipped = pts.map((p) => ({
        x: Math.max(0, Math.min(100, p.x)),
        y: Math.max(0, Math.min(100, p.y))
      }));
      return `polygon(${clipped.map((p) => `${p.x.toFixed(2)}% ${p.y.toFixed(2)}%`).join(', ')})`;
    }

    _buildFooterIconPaperHandCutClipPath(w, h, seedKey, topWidthRatio = 0.67) {
      return this._buildFooterIconPaperTornEdgeClipPath(w, h, seedKey, topWidthRatio);
    }

    _readFooterIconPaperLayout(paper) {
      const height = parseFloat(paper.style.getPropertyValue('--quilt-footer-icon-paper-height'));
      const width = parseFloat(paper.style.getPropertyValue('--quilt-footer-icon-paper-width'));
      if (![height, width].every((value) => Number.isFinite(value))) return null;
      return {
        height: Math.max(1, Math.round(height)),
        width: Math.max(1, Math.round(width))
      };
    }

    _footerIconDockScrollDelta() {
      const scroller = this._footerIconPaperScrollers()[0];
      if (!scroller) return 0;
      const stopTop = this.getQuiltFooterScrollStopTop(scroller);
      return Math.max(0, stopTop - (scroller.scrollTop || 0));
    }

    /**
     * Size footer tape + icons for the docked scroll position before the user scrolls there.
     * Avoids `chrome-pending` flash for fast scrollers (layout no longer requires footer on-screen).
     */
    prewarmFooterIconChrome() {
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen) return false;
      if (this._footerIconChromePrewarmedThisVisit && this._footerIconChromePrewarmResult === true) {
        return true;
      }
      this._footerIconChromePrewarm = true;
      try {
        this.updateFooterIconPaperLayout({ projectAtDock: true });
        this.updateFooterIconPaperHandCut();
        this._syncFooterIconChromeReadyState();
        const row = document.querySelector('#screen-quilt .quilt-footer-icon-row');
        const ready = !row?.classList.contains('quilt-footer-icon-row--chrome-pending');
        if (ready) {
          this._footerIconChromePrewarmedThisVisit = true;
          this._footerIconChromePrewarmResult = true;
        }
        return ready;
      } finally {
        this._footerIconChromePrewarm = false;
      }
    }

    updateFooterIconPaperLayout(options = {}) {
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen) return;
      const projectAtDock =
        options.projectAtDock === true || this._footerIconChromePrewarm === true;
      if (!projectAtDock && !quiltScreen.classList.contains('active')) return;

      const viewportBottom = this._footerIconPaperViewportBottom();
      const pad = this._footerIconPaperPadPx();
      const scrollDelta = projectAtDock ? this._footerIconDockScrollDelta() : 0;

      this._footerIconPaperElements().forEach((paper) => {
        const control = this._footerIconPaperControlForPaper(paper);
        if (!control || control.hidden || control.getAttribute('aria-hidden') === 'true') {
          paper.style.setProperty('--quilt-footer-icon-paper-height', '0px');
          return;
        }

        const slot = paper.parentElement;
        const slotRect = slot?.getBoundingClientRect?.();
        const rect = control.getBoundingClientRect();
        let controlW = rect.width;
        let controlH = rect.height;
        if (projectAtDock && (controlW < 1 || controlH < 1)) {
          const fallback = this._footerIconPaperFallbackControlSize();
          controlW = fallback;
          controlH = fallback;
        }
        if (controlW < 1 || controlH < 1) {
          if (!projectAtDock) {
            paper.style.setProperty('--quilt-footer-icon-paper-height', '0px');
          }
          return;
        }

        const effectiveTop = (rect.height >= 1 ? rect.top : 0) - scrollDelta;
        if (
          !projectAtDock &&
          rect.height >= 1 &&
          (rect.bottom < 0 || rect.top > viewportBottom + 2)
        ) {
          paper.style.setProperty('--quilt-footer-icon-paper-height', '0px');
          return;
        }

        const role = this._footerIconPaperRole(paper);
        const size = this._footerIconPaperSizeScale(role);
        const widthPx = Math.ceil((controlW + pad.widthExtra) * size.widthScale);
        const squarePx = this._footerIconPaperApplyHeightScale(Math.max(28, widthPx));
        const slotTop = slotRect && slotRect.height >= 1 ? slotRect.top - scrollDelta : 0;
        const topPx =
          slotRect && slotRect.height >= 1
            ? Math.round(effectiveTop - slotTop + (controlH - squarePx) / 2)
            : Math.round((controlH - squarePx) / 2);
        const nextTop = `${topPx}px`;
        const nextHeight = `${squarePx}px`;
        const nextWidth = `${widthPx}px`;

        paper.classList.remove('quilt-footer-icon-paper--viewport-anchored');
        paper.classList.remove('quilt-footer-icon-paper--dock-square');
        paper.style.removeProperty('--quilt-footer-icon-paper-vp-top');
        paper.style.removeProperty('--quilt-footer-icon-paper-vp-left');
        if (paper.style.getPropertyValue('--quilt-footer-icon-paper-top') !== nextTop) {
          paper.style.setProperty('--quilt-footer-icon-paper-top', nextTop);
        }
        if (paper.style.getPropertyValue('--quilt-footer-icon-paper-height') !== nextHeight) {
          paper.style.setProperty('--quilt-footer-icon-paper-height', nextHeight);
        }
        if (paper.style.getPropertyValue('--quilt-footer-icon-paper-width') !== nextWidth) {
          paper.style.setProperty('--quilt-footer-icon-paper-width', nextWidth);
        }
      });
    }

    _syncFooterIconChromeReadyState() {
      const row = document.querySelector('#screen-quilt .quilt-footer-icon-row');
      if (!row?.classList.contains('quilt-footer-icon-row--chrome-pending')) return;

      const papers = [...this._footerIconPaperElements()];
      const controls = papers
        .map((paper) => this._footerIconPaperControlForPaper(paper))
        .filter((control) => control && !control.hidden && control.getAttribute('aria-hidden') !== 'true');
      if (!controls.length) return;

      const allReady = controls.every((control) => {
        const paper = control.parentElement?.querySelector('.quilt-footer-icon-paper');
        const height = parseFloat(paper?.style.getPropertyValue('--quilt-footer-icon-paper-height'));
        return Number.isFinite(height) && height >= 28;
      });
      if (allReady) row.classList.remove('quilt-footer-icon-row--chrome-pending');
    }

    _resetFooterIconChromePending() {
      const row = document.querySelector('#screen-quilt .quilt-footer-icon-row');
      if (!row) return;
      if (
        this._footerIconChromePrewarmedThisVisit &&
        !row.classList.contains('quilt-footer-icon-row--chrome-pending')
      ) {
        return;
      }
      row.classList.add('quilt-footer-icon-row--chrome-pending');
    }

    _scheduleFooterIconChromeActivationPass() {
      if (this._footerIconActivationPassRaf != null) return;
      this._footerIconActivationPassRaf = requestAnimationFrame(() => {
        this._footerIconActivationPassRaf = null;
        if (!document.getElementById('screen-quilt')?.classList.contains('active')) return;
        requestAnimationFrame(() => {
          if (!document.getElementById('screen-quilt')?.classList.contains('active')) return;
          this.updateFooterIconPaperLayout();
          this.updateFooterIconPaperHandCut();
          this._syncFooterIconChromeReadyState();
          if (!this._footerIconChromePrewarmResult) {
            this.prewarmFooterIconChrome();
          }
        });
      });
    }

    flushFooterIconPaperChrome() {
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen?.classList.contains('active')) return;
      if (!this._footerIconChromeNearViewport()) {
        if (!this.prewarmFooterIconChrome()) {
          this.updateFooterIconPaperLayout({ projectAtDock: true });
          this.updateFooterIconPaperHandCut();
          this._syncFooterIconChromeReadyState();
        }
        return;
      }

      const prevLock = this._footerIconClampLock;
      this._footerIconClampLock = true;
      try {
        this.clampQuiltScrollToFooterStop();
        this.updateFooterIconPaperChrome();
      } finally {
        this._footerIconClampLock = prevLock;
      }
    }

    _applyFooterIconPaperHandCut(paper) {
      if (!paper) return;
      const layout = this._readFooterIconPaperLayout(paper);
      if (!layout || layout.height < 28) {
        paper.style.removeProperty('--quilt-footer-icon-paper-cut');
        paper.dataset.footerPaperCutCache = '';
        return;
      }
      const w = layout.width;
      const h = layout.height;
      const cutCacheKey = `${w}x${h}:tornv4`;
      if (paper.dataset.footerPaperCutCache === cutCacheKey) return;
      if (w < 20 || h < 28) {
        paper.style.removeProperty('--quilt-footer-icon-paper-cut');
        paper.dataset.footerPaperCutCache = '';
        return;
      }
      paper.dataset.footerPaperCutCache = cutCacheKey;
      const dateKey = String(
        typeof Utils !== 'undefined' && typeof Utils.getTodayKey === 'function'
          ? Utils.getTodayKey()
          : ''
      ).trim() || 'nodate';
      const role = this._footerIconPaperRole(paper);
      const seed = `${dateKey}:footer-icon-paper:${role}`;
      const clip = this._buildFooterIconPaperHandCutClipPath(
        w,
        h,
        seed,
        this._footerIconPaperTopWidthRatio(role)
      );
      if (clip) paper.style.setProperty('--quilt-footer-icon-paper-cut', clip);
      else paper.style.removeProperty('--quilt-footer-icon-paper-cut');
    }

    updateFooterIconPaperHandCut() {
      this._footerIconPaperElements().forEach((paper) => {
        const control = this._footerIconPaperControlForPaper(paper);
        if (!control || control.hidden || control.getAttribute('aria-hidden') === 'true') return;
        this._applyFooterIconPaperHandCut(paper);
      });
    }

    updateFooterIconChrome() {
      this.updateFooterIconInkContrast();
      this.updateFooterIconPaperLayout();
      this.updateFooterIconPaperHandCut();
    }

    updateFooterIconPaperChrome() {
      this.updateFooterIconPaperLayout();
      this.updateFooterIconPaperHandCut();
      this._syncFooterIconChromeReadyState();
    }

    _bindFooterIconPullPastDock() {
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen || quiltScreen.dataset.footerPullPastDockBound === '1') return;
      quiltScreen.dataset.footerPullPastDockBound = '1';
      this._footerIconPullPastDock = false;
      this._footerIconPullAccum = 0;
      this._footerTouchLastY = null;

      const clearPull = () => {
        const wasPulling = this._footerIconPullPastDock || this._footerIconPullAccum > 0;
        this._footerIconPullPastDock = false;
        this._footerIconPullAccum = 0;
        this._footerTouchLastY = null;
        if (!wasPulling) return;
        this.settleQuiltFooterScrollDock();
      };

      quiltScreen.addEventListener(
        'touchstart',
        (event) => {
          const touch = event.touches?.[0];
          this._footerTouchLastY = touch ? touch.clientY : null;
          this._footerIconPullAccum = 0;
        },
        { passive: true }
      );

      quiltScreen.addEventListener(
        'touchmove',
        (event) => {
          if (!quiltScreen.classList.contains('active')) return;
          const touch = event.touches?.[0];
          if (!touch || this._footerTouchLastY == null) return;

          const dy = touch.clientY - this._footerTouchLastY;
          this._footerTouchLastY = touch.clientY;

          const scroller = this._footerIconPaperScrollers()[0];
          if (!scroller) return;
          const stopTop = this.getQuiltFooterScrollStopTop(scroller);
          const atOrPastStop = scroller.scrollTop >= stopTop - 2;
          if (!atOrPastStop) {
            this._footerIconPullAccum = 0;
            if (this._footerIconPullPastDock) {
              this._footerIconPullPastDock = false;
              this.scheduleFooterIconChromeUpdate();
            }
            return;
          }

          if (dy < 0) {
            this._footerIconPullAccum += -dy;
          } else if (dy > 0) {
            this._footerIconPullAccum = Math.max(0, this._footerIconPullAccum - dy);
          }

          const pulling = this._footerIconPullAccum > 6;
          if (pulling !== this._footerIconPullPastDock) {
            this._footerIconPullPastDock = pulling;
            this.scheduleFooterIconChromeUpdate();
          }
        },
        { passive: true }
      );

      quiltScreen.addEventListener('touchend', clearPull, { passive: true });
      quiltScreen.addEventListener('touchcancel', clearPull, { passive: true });
    }

    _footerIconChromeNearViewport() {
      const footer = document.querySelector('#screen-quilt .quilt-scroll-icon-footer');
      if (!footer) return true;
      const viewportBottom = this._footerIconPaperViewportBottom();
      const footerTop = footer.getBoundingClientRect().top;
      return footerTop <= viewportBottom + 120;
    }

    scheduleFooterIconChromeUpdate() {
      if (this._footerIconClampLock) return;
      if (!this._footerIconChromeNearViewport()) return;
      if (this._footerIconChromeRaf != null) return;
      this._footerIconChromeRaf = requestAnimationFrame(() => {
        this._footerIconChromeRaf = null;
        if (this._footerIconClampLock) return;
        this._footerIconClampLock = true;
        try {
          if (this._footerIconChromeNearViewport()) {
            this.clampQuiltScrollToFooterStop();
          }
          this.updateFooterIconPaperChrome();
        } finally {
          requestAnimationFrame(() => {
            this._footerIconClampLock = false;
          });
        }
      });
    }

    settleQuiltFooterScrollDock() {
      if (this._footerIconClampLock) return;
      if (!this._footerIconChromeNearViewport()) return;
      this._footerIconClampLock = true;
      try {
        this.clampQuiltScrollToFooterStop();
        this.updateFooterIconPaperChrome();
      } finally {
        requestAnimationFrame(() => {
          this._footerIconClampLock = false;
        });
      }
    }

    _bindQuiltFooterPaperLayoutSync() {
      const screen = document.getElementById('screen-quilt');
      if (!screen || screen.dataset.footerPaperLayoutBound === '1') return;
      screen.dataset.footerPaperLayoutBound = '1';

      const onLayoutChange = () => {
        if (this._footerIconClampLock) return;
        this.scheduleFooterIconChromeUpdate();
      };
      const onScrollSettle = () => {
        if (!document.getElementById('screen-quilt')?.classList.contains('active')) return;
        if (!this._footerIconChromeNearViewport()) return;
        this.settleQuiltFooterScrollDock();
      };
      const scroller =
        typeof this.getQuiltScrollContainer === 'function' ? this.getQuiltScrollContainer() : screen;
      if (scroller) {
        scroller.addEventListener('scroll', onLayoutChange, { passive: true });
        scroller.addEventListener('scrollend', onScrollSettle, { passive: true });
      }
      window.visualViewport?.addEventListener('resize', () => this.updateFooterIconChrome(), {
        passive: true
      });

      const footer = document.querySelector('#screen-quilt .quilt-scroll-icon-footer');
      if (footer && typeof IntersectionObserver !== 'undefined') {
        this._footerIconPaperFooterObserver = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              this.flushFooterIconPaperChrome();
              this.scheduleFooterIconChromeUpdate();
            }
          },
          { root: null, threshold: [0, 0.08, 0.2] }
        );
        try {
          this._footerIconPaperFooterObserver.observe(footer);
        } catch (_) {
          /* ignore */
        }
      }
    }

    ensureFooterIconInkContrast() {
      if (!this._footerIconChromeReady) {
        this._footerIconChromeReady = true;
        this._bindQuiltFooterPaperLayoutSync();
        this._bindFooterIconPullPastDock();
        if (typeof ResizeObserver !== 'undefined') {
          this._footerIconInkContrastObserver = new ResizeObserver(() => {
            this.scheduleFooterIconChromeUpdate();
          });
          const row = document.querySelector('#screen-quilt .quilt-footer-icon-row');
          const cluster = document.querySelector('#screen-quilt .quilt-footer-icon-cluster');
          [row, cluster].filter(Boolean).forEach((el) => {
            try {
              this._footerIconInkContrastObserver.observe(el);
            } catch (_) {
              /* ignore */
            }
          });
        }
      }
      this.flushFooterIconPaperChrome();
      this.scheduleFooterIconChromeUpdate();
    }

    _reflectionPatchHandCutCfg() {
      return {
        exportScale: 1,
        handCutMarginDomPx: 0.35,
        handCutCornerChamferDomPx: 10,
        handCutMacroDomPx: 8,
        handCutBiteMaxDomPx: 14,
        handCutSecondaryBiteDomPx: 9,
        handCutSideInwardMaxDomPx: 8,
        handCutTopBottomTrimDomPx: 7
      };
    }

    _reflectionClippingEdgeCfg() {
      return {
        exportScale: 1,
        newsprintEdgeToothPx: 9,
        newsprintEdgeToothDepthPx: 2.35,
        newsprintEdgeNotchDepthRatio: 0.52,
        newsprintEdgeGapRatio: 0.11,
        newsprintEdgeTabRatio: 0.82,
        newsprintEdgeTabCrownBulgeRatio: 0.28,
        newsprintEdgeCornerSoftRatio: 0.22,
        newsprintEdgeCornerSteps: 4,
        newsprintEdgeIrregularityRatio: 0.58,
        newsprintEdgeGapSagRatio: 0.05,
        newsprintEdgeSideInsetPx: 0.2
      };
    }

    syncReflectionCarouselHandCuts(slides, dateKey = '') {
      const list = Array.isArray(slides) ? slides : [];
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const QNC = globalThis.QuiltNewspaperClipping;
      const fabricCfg = this._reflectionPatchHandCutCfg();
      const clippingCfg = this._reflectionClippingEdgeCfg();
      list.forEach((slide, index) => {
        const seed =
          String(slide.dataset.reflectionHandCutSeed || '').trim() ||
          `${dk}:reflection-patch:${String(slide.dataset.reflectionSlide || index).trim()}`;
        const rect = slide.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        if (w < 40 || h < 32) return;

        if (slide.classList.contains('quilt-reflection-carousel-slide--clipping')) {
          const clip = QNC?.buildNewsprintPerforatedCssClipPath?.(w, h, seed, clippingCfg);
          if (clip) slide.style.setProperty('--reflection-fabric-cut', clip);
          else slide.style.setProperty('--reflection-fabric-cut', 'none');
          return;
        }

        if (!QNC?.buildHandCutCssClipPath) return;
        const clip = QNC.buildHandCutCssClipPath(w, h, seed, fabricCfg);
        if (clip) slide.style.setProperty('--reflection-fabric-cut', clip);
      });
    }

    initReflectionCarouselLoop(notes) {
      if (this._reflectionCarouselResizeHandler) {
        window.removeEventListener('resize', this._reflectionCarouselResizeHandler);
        this._reflectionCarouselResizeHandler = null;
      }
      if (this._reflectionCarouselHandCutObserver) {
        this._reflectionCarouselHandCutObserver.disconnect();
        this._reflectionCarouselHandCutObserver = null;
        this._reflectionCarouselHandCutObservedEl = null;
      }
      if (this._reflectionCarouselScrollHintObserver) {
        this._reflectionCarouselScrollHintObserver.disconnect();
        this._reflectionCarouselScrollHintObserver = null;
      }
      if (this._reflectionCarouselScrollHintFrame) {
        cancelAnimationFrame(this._reflectionCarouselScrollHintFrame);
        this._reflectionCarouselScrollHintFrame = null;
      }
      const viewport = notes?.querySelector?.('[data-reflection-carousel-viewport]');
      const priorTrack = notes?.querySelector?.('[data-reflection-carousel-track]');
      if (priorTrack) {
        priorTrack.style.transform = '';
        priorTrack.classList.remove('is-scroll-hint-shifting');
      }
      if (!viewport) return;
      const slides = Array.from(viewport.querySelectorAll('.quilt-reflection-carousel-slide'));
      if (!slides.length) return;
      viewport.classList.toggle('is-scrollable', slides.length > 1);
      const carousel = viewport.closest('[data-reflection-carousel]');
      const handCutDateKey = String(
        carousel?.dataset?.reflectionHandCutDateKey || Utils.getTodayKey() || 'nodate'
      ).trim();
      const layoutCarousel = () => {
        this.syncReflectionCarouselEdgeFray(slides);
        this.syncReflectionCarouselJoinTape(slides);
        this.syncReflectionCarouselHandCuts(slides, handCutDateKey);
        this.syncReflectionCarouselCopyAlign(slides);
      };
      layoutCarousel();
      requestAnimationFrame(layoutCarousel);
      if (typeof ResizeObserver !== 'undefined' && carousel) {
        if (this._reflectionCarouselHandCutObservedEl !== carousel) {
          if (this._reflectionCarouselHandCutObservedEl && this._reflectionCarouselHandCutObserver) {
            this._reflectionCarouselHandCutObserver.unobserve(this._reflectionCarouselHandCutObservedEl);
          }
          if (!this._reflectionCarouselHandCutObserver) {
            this._reflectionCarouselHandCutObserver = new ResizeObserver(() => {
              const vp = notes?.querySelector?.('[data-reflection-carousel-viewport]');
              const c = vp?.closest?.('[data-reflection-carousel]');
              const list = vp
                ? Array.from(vp.querySelectorAll('.quilt-reflection-carousel-slide'))
                : [];
              if (!list.length) return;
              this.syncReflectionCarouselEdgeFray(list);
              this.syncReflectionCarouselJoinTape(list);
              this.syncReflectionCarouselHandCuts(
                list,
                c?.dataset?.reflectionHandCutDateKey || ''
              );
            });
          }
          this._reflectionCarouselHandCutObserver.observe(carousel);
          this._reflectionCarouselHandCutObservedEl = carousel;
        }
      }
      let currentIndex = 0;
      let scrollHintPlayed = false;
      let userScrolledCarousel = false;
      const cancelScrollHint = () => {
        if (this._reflectionCarouselScrollHintFrame) {
          cancelAnimationFrame(this._reflectionCarouselScrollHintFrame);
          this._reflectionCarouselScrollHintFrame = null;
        }
        const track = viewport.querySelector('[data-reflection-carousel-track]');
        if (track) {
          track.style.transform = '';
          track.classList.remove('is-scroll-hint-shifting');
        }
        viewport.classList.remove('is-scroll-hinting');
      };
      const setActiveDot = (index) => {
        currentIndex = Math.max(0, Math.min(slides.length - 1, index));
      };
      const getScrollLeftForIndex = (index) => {
        const slide = slides[index];
        if (!slide) return 0;
        if (index === 0) return 0;
        const targetLeft = slide.offsetLeft - Math.max(0, (viewport.clientWidth - slide.offsetWidth) / 2);
        return Math.max(0, targetLeft);
      };
      const scrollToIndex = (index, behavior = 'smooth') => {
        const nextIndex = ((index % slides.length) + slides.length) % slides.length;
        viewport.scrollTo({
          left: getScrollLeftForIndex(nextIndex),
          behavior
        });
        setActiveDot(nextIndex);
      };
      const getScrollHintDistance = () => {
        const raw = parseFloat(
          getComputedStyle(viewport.closest('.quilt-reflection-carousel') || viewport)
            .getPropertyValue('--reflection-carousel-scroll-hint')
        );
        if (Number.isFinite(raw) && raw > 0) return raw;
        return Math.min(32, Math.max(24, viewport.clientWidth * 0.04));
      };
      const playScrollHintBounce = () => {
        if (scrollHintPlayed || userScrolledCarousel || slides.length <= 1) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        const track = viewport.querySelector('[data-reflection-carousel-track]');
        if (!track) return;
        cancelScrollHint();
        scrollHintPlayed = true;
        const peek = getScrollHintDistance();
        const durationMs = 520;
        const startAt = performance.now();
        const clearTrackShift = () => {
          track.style.transform = '';
          track.classList.remove('is-scroll-hint-shifting');
        };
        const finishScrollHint = () => {
          clearTrackShift();
          viewport.classList.remove('is-scroll-hinting');
        };
        const applyTrackShift = (px) => {
          if (px <= 0.25) {
            clearTrackShift();
            return;
          }
          track.classList.add('is-scroll-hint-shifting');
          track.style.transform = `translate3d(${px}px, 0, 0)`;
        };
        viewport.classList.add('is-scroll-hinting');
        viewport.scrollTo({ left: 0, behavior: 'auto' });
        clearTrackShift();
        const sampleShift = (progress) => peek * Math.sin(progress * Math.PI);
        const step = (now) => {
          if (userScrolledCarousel) {
            finishScrollHint();
            this._reflectionCarouselScrollHintFrame = null;
            return;
          }
          const progress = Math.min(1, (now - startAt) / durationMs);
          applyTrackShift(sampleShift(progress));
          if (progress < 1) {
            this._reflectionCarouselScrollHintFrame = requestAnimationFrame(step);
            return;
          }
          finishScrollHint();
          this._reflectionCarouselScrollHintFrame = null;
        };
        this._reflectionCarouselScrollHintFrame = requestAnimationFrame(step);
      };
      const scheduleScrollHintBounce = () => {
        if (scrollHintPlayed || userScrolledCarousel || slides.length <= 1) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => playScrollHintBounce());
        });
      };
      const syncCurrentIndex = () => {
        const viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
        let nearestIndex = currentIndex;
        let nearestDistance = Infinity;
        slides.forEach((slide, index) => {
          const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
          const distance = Math.abs(slideCenter - viewportCenter);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });
        setActiveDot(nearestIndex);
      };
      let dragStartX = 0;
      let dragStartScrollLeft = 0;
      let isDragging = false;
      let dragScrollFrame = null;
      let pendingDragScrollLeft = null;
      const markUserScrolled = () => {
        if (!userScrolledCarousel) {
          userScrolledCarousel = true;
          cancelScrollHint();
        }
      };
      const flushDragScroll = () => {
        dragScrollFrame = null;
        if (pendingDragScrollLeft == null) return;
        viewport.scrollLeft = pendingDragScrollLeft;
        pendingDragScrollLeft = null;
      };
      const queueDragScroll = (nextLeft) => {
        pendingDragScrollLeft = nextLeft;
        if (dragScrollFrame != null) return;
        dragScrollFrame = requestAnimationFrame(flushDragScroll);
      };
      viewport.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse') return;
        if (event.target?.closest?.('.quilt-reflection-carousel-invite-btn, button, a, input, textarea, select, label')) {
          return;
        }
        markUserScrolled();
        isDragging = true;
        dragStartX = event.clientX;
        dragStartScrollLeft = viewport.scrollLeft;
        viewport.setPointerCapture?.(event.pointerId);
      });
      const quiltScrollEl = document.getElementById('screen-quilt');
      const carouselTouchLockThreshold = 10;
      const carouselTouchAxisRatio = 1.65;
      let carouselTouchGesture = null;
      const isCarouselInteractiveTouchTarget = (target) =>
        Boolean(
          target?.closest?.(
            '.quilt-reflection-carousel-invite-btn, button, a, input, textarea, select, label'
          )
        );
      const resetCarouselTouchGesture = () => {
        carouselTouchGesture = null;
      };
      viewport.addEventListener(
        'touchstart',
        (event) => {
          if (event.touches?.length !== 1) {
            resetCarouselTouchGesture();
            return;
          }
          if (isCarouselInteractiveTouchTarget(event.target)) {
            resetCarouselTouchGesture();
            return;
          }
          markUserScrolled();
          const touch = event.touches[0];
          carouselTouchGesture = {
            startX: touch.clientX,
            startY: touch.clientY,
            axis: null
          };
        },
        { passive: true }
      );
      viewport.addEventListener(
        'touchmove',
        (event) => {
          if (!carouselTouchGesture || event.touches?.length !== 1) return;
          const touch = event.touches[0];
          const dx = touch.clientX - carouselTouchGesture.startX;
          const dy = touch.clientY - carouselTouchGesture.startY;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          if (
            !carouselTouchGesture.axis &&
            (absDx > carouselTouchLockThreshold || absDy > carouselTouchLockThreshold)
          ) {
            if (absDy > absDx * carouselTouchAxisRatio) {
              // Vertical intent — let #screen-quilt scroll natively.
              resetCarouselTouchGesture();
              return;
            }
            if (absDx > absDy * carouselTouchAxisRatio) {
              carouselTouchGesture.axis = 'x';
            }
          }
          if (carouselTouchGesture?.axis === 'x') {
            // Re-open vertical scroll if the finger turns downward/upward mid-gesture.
            if (absDy > absDx * carouselTouchAxisRatio) {
              resetCarouselTouchGesture();
              return;
            }
            event.preventDefault();
          }
        },
        { passive: false }
      );
      viewport.addEventListener('touchend', resetCarouselTouchGesture, { passive: true });
      viewport.addEventListener('touchcancel', resetCarouselTouchGesture, { passive: true });
      this._reflectionCarouselCancelScrollHint = cancelScrollHint;
      if (!this._reflectionCarouselQuiltScrollBound && quiltScrollEl) {
        this._reflectionCarouselQuiltScrollBound = true;
        quiltScrollEl.addEventListener(
          'scroll',
          () => {
            this._reflectionCarouselCancelScrollHint?.();
          },
          { passive: true }
        );
      }
      viewport.addEventListener('wheel', markUserScrolled, { passive: true });
      viewport.addEventListener('pointermove', (event) => {
        if (!isDragging) return;
        event.preventDefault();
        queueDragScroll(dragStartScrollLeft - (event.clientX - dragStartX));
      });
      const stopDrag = (event) => {
        if (!isDragging) return;
        isDragging = false;
        if (dragScrollFrame != null) {
          cancelAnimationFrame(dragScrollFrame);
          dragScrollFrame = null;
        }
        flushDragScroll();
        viewport.releasePointerCapture?.(event.pointerId);
        syncCurrentIndex();
        if (slides.length > 1) scrollToIndex(currentIndex, 'smooth');
      };
      viewport.addEventListener('pointerup', stopDrag);
      viewport.addEventListener('pointercancel', stopDrag);
      viewport.addEventListener('scroll', () => {
        if (viewport.scrollLeft > 2) markUserScrolled();
        requestAnimationFrame(syncCurrentIndex);
      }, { passive: true });
      viewport.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          scrollToIndex(currentIndex + 1, 'smooth');
          return;
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          scrollToIndex(currentIndex - 1, 'smooth');
          return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        scrollToIndex(currentIndex + 1, 'smooth');
      });
      scrollToIndex(0, 'auto');
      if ('IntersectionObserver' in window) {
        this._reflectionCarouselScrollHintObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting || entry.intersectionRatio < 0.35) return;
            scheduleScrollHintBounce();
            this._reflectionCarouselScrollHintObserver?.disconnect();
            this._reflectionCarouselScrollHintObserver = null;
          });
        }, { threshold: [0.35] });
        this._reflectionCarouselScrollHintObserver.observe(viewport);
      } else {
        scheduleScrollHintBounce();
      }
      let resizeTimer = null;
      this._reflectionCarouselResizeHandler = () => {
        layoutCarousel();
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          resizeTimer = null;
          scrollToIndex(currentIndex, 'auto');
        }, 120);
      };
      window.addEventListener('resize', this._reflectionCarouselResizeHandler, { passive: true });
    }

    renderReflectionAnonymousWall(themes = null) {
      Utils.removeLegacyReflectionWallHeadings();
      const wall = document.getElementById('quiltReflectionWall');
      const notes = document.getElementById('quiltReflectionWallNotes');
      if (!wall || !notes) return;
      const themeEntries = (Array.isArray(themes) ? themes : [])
        .map((theme) => this.normalizeReflectionWallTheme(theme))
        .filter((entry) => entry?.text);
      const contentKey = this._reflectionWallContentKey(themeEntries);
      if (contentKey === this._reflectionWallLastContentKey) return;
      this._reflectionWallLastContentKey = contentKey;
      const wallVisibleBefore = this._quiltLayoutAnchorInViewport(wall);
      const applyWall = () => {
        notes.innerHTML = this.getReflectionCarouselMarkup(themeEntries);
        this.initReflectionCarouselLoop(notes);
        wall.hidden = false;
      };
      if (wallVisibleBefore) {
        this._preserveQuiltScrollThroughLayout(applyWall, wall);
      } else {
        applyWall();
      }
    }

    _reflectionAssignmentContextFromLocal(dateKey) {
      const data = this.quoteService?._readLocalAssignment?.(dateKey);
      if (!data) return { first_response: '', user_name: '' };
      return {
        first_response: this._firstResponseFromPayload(data),
        user_name: this._userNameFromPayload(data)
      };
    }

    _readLocalReflectionThemesCache(dateKey) {
      try {
        const raw = localStorage.getItem('odqReflectionThemesByDate');
        if (!raw) return null;
        const map = JSON.parse(raw);
        const entry = map?.[String(dateKey || '').trim()];
        if (!entry || typeof entry !== 'object') return null;
        return entry;
      } catch (_) {
        return null;
      }
    }

    _writeLocalReflectionThemesCache(dateKey, payload) {
      const key = String(dateKey || '').trim();
      if (!key || !payload) return;
      try {
        const raw = localStorage.getItem('odqReflectionThemesByDate');
        const map = raw ? JSON.parse(raw) : {};
        map[key] = {
          themes: Array.isArray(payload.themes) ? payload.themes : [],
          first_response: String(payload.first_response || '').trim(),
          user_name: String(payload.user_name || '').trim(),
          cachedAt: Date.now()
        };
        localStorage.setItem('odqReflectionThemesByDate', JSON.stringify(map));
      } catch (_) {
        /* */
      }
    }

    _normalizeReflectionThemesPayload(key, data) {
      if (!data || typeof data !== 'object') return null;
      const themes = Array.isArray(data.themes)
        ? data.themes
            .map((theme) => this.normalizeReflectionWallTheme(theme))
            .filter((entry) => entry?.text)
        : [];
      const first_response = this._firstResponseFromPayload(data);
      const user_name = this._userNameFromPayload(data);
      if (!themes.length && !first_response) return null;
      return { key, themes, first_response, user_name };
    }

    _paintReflectionWallBootstrap(dateKey) {
      const key = String(dateKey || '').trim();
      if (!key) return false;
      const cached = this._readLocalReflectionThemesCache(key);
      const localAssign = this._reflectionAssignmentContextFromLocal(key);
      const quotePayload =
        (typeof this.getEffectiveQuiltQuote === 'function' && this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveQuiltQuote()
          : this.quoteService?.getTodayQuote?.()) || {};
      const early =
        this._reflectionThemesEarlyCache?.key === key
          ? this._normalizeReflectionThemesPayload(key, this._reflectionThemesEarlyCache.data)
          : null;
      const themes = early?.themes?.length ? early.themes : cached?.themes || [];
      const first =
        localAssign.first_response ||
        cached?.first_response ||
        early?.first_response ||
        this._firstResponseFromPayload(quotePayload);
      const user =
        localAssign.user_name ||
        cached?.user_name ||
        early?.user_name ||
        this._userNameFromPayload(quotePayload);
      if (!themes.length && !first) return false;
      const wallThemes = this.buildReflectionWallThemes(themes, first || null, user);
      if (!wallThemes.length) return false;
      this.renderReflectionAnonymousWall(wallThemes);
      return true;
    }

    async _readReflectionThemesForDate(key) {
      const k = String(key || '').trim();
      if (!k) return null;
      if (!this._reflectionThemesNotFoundKeys) this._reflectionThemesNotFoundKeys = new Set();
      if (this._reflectionThemesEarlyCache?.key === k && this._reflectionThemesEarlyCache?.data) {
        const fromEarly = this._normalizeReflectionThemesPayload(k, this._reflectionThemesEarlyCache.data);
        if (fromEarly) return { ...fromEarly, source: 'early-prefetch' };
      }
      let winner = null;
      let winnerSource = '';
      const claim = (data, source) => {
        if (winner) return;
        const normalized = this._normalizeReflectionThemesPayload(k, data);
        if (normalized) {
          winner = normalized;
          winnerSource = source;
        }
      };
      const sdkRead = (async () => {
        const firestoreReady = await this.waitForReflectionFirestore(
          window.db && window.firestore?.doc ? 0 : 400
        );
        if (!firestoreReady) return;
        try {
          const docRef = window.firestore.doc(window.db, 'reflectionThemes', k);
          const readDoc = window.firestore.getDoc || window.firestore.getDocFromServer;
          const snap = await readDoc(docRef);
          if (snap.exists()) {
            this._reflectionThemesNotFoundKeys.delete(k);
            claim(snap.data(), 'sdk');
          } else {
            this._reflectionThemesNotFoundKeys.add(k);
          }
        } catch (error) {
          this.logger?.warn?.(`Reflection themes SDK read failed for ${k}:`, error);
        }
      })();
      const restRead = (async () => {
        const data = await this.fetchReflectionThemesViaRest(k);
        if (data) {
          this._reflectionThemesEarlyCache = { key: k, data, at: Date.now() };
          claim(data, 'rest');
        }
      })();
      await Promise.allSettled([sdkRead, restRead]);
      if (!winner && !this._reflectionThemesNotFoundKeys.has(k)) {
        const backendData = await this.fetchReflectionThemesViaBackend(k);
        if (backendData) {
          const normalized = this._normalizeReflectionThemesPayload(k, backendData);
          if (normalized) {
            winner = normalized;
            winnerSource = 'backend';
          }
        }
      }
      if (winner) {
        return { ...winner, source: winnerSource };
      }
      return null;
    }

    async loadReflectionThemesForToday() {
      if (this._reflectionThemesLoadInFlight) return this._reflectionThemesLoadInFlight;
      this._reflectionThemesLoadInFlight = (async () => {
      const dateKey =
        typeof this.getEffectiveAppDateKey === 'function' && this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveAppDateKey()
          : Utils.getTodayKey();
      if (!this._reflectionThemesNotFoundKeys) this._reflectionThemesNotFoundKeys = new Set();
      const [todayThemes, assignmentFirst] = await Promise.all([
        this._readReflectionThemesForDate(dateKey),
        this.fetchTodayFirstResponseFields()
      ]);
      const communityThemes = todayThemes?.themes || [];
      const mergedFirst =
        assignmentFirst.first_response ||
        todayThemes?.first_response ||
        this._reflectionAssignmentContextFromLocal(dateKey).first_response ||
        '';
      const mergedUser =
        assignmentFirst.user_name ||
        todayThemes?.user_name ||
        this._reflectionAssignmentContextFromLocal(dateKey).user_name ||
        '';
      if (communityThemes.length || mergedFirst) {
        this._writeLocalReflectionThemesCache(dateKey, {
          themes: communityThemes,
          first_response: mergedFirst,
          user_name: mergedUser
        });
      }
      const wallThemes = await this.resolveReflectionWallThemes(communityThemes, {
        first_response: mergedFirst,
        user_name: mergedUser
      });
      if (wallThemes.length) {
        this.renderReflectionAnonymousWall(wallThemes);
        return;
      }
      if (!this._reflectionWallLastContentKey) {
        this.renderReflectionAnonymousWall([]);
      }
      })().finally(() => {
        this._reflectionThemesLoadInFlight = null;
      });
      return this._reflectionThemesLoadInFlight;
    }

    waitForReflectionFirestore(timeoutMs = 3500) {
      if (window.db && window.firestore?.doc && window.firestore?.getDoc) return Promise.resolve(true);
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          document.removeEventListener('firebaseReady', onReady);
          clearTimeout(timer);
          resolve(value);
        };
        const onReady = () => {
          finish(!!(window.db && window.firestore?.doc && window.firestore?.getDoc));
        };
        const timer = setTimeout(() => {
          finish(!!(window.db && window.firestore?.doc && window.firestore?.getDoc));
        }, timeoutMs);
        document.addEventListener('firebaseReady', onReady, { once: true });
      });
    }

    async fetchReflectionThemesViaRest(dateKey) {
      const key = String(dateKey || '').trim();
      const projectId = String(CONFIG.FIREBASE?.projectId || '').trim();
      const apiKey = String(CONFIG.FIREBASE?.apiKey || '').trim();
      if (!key || !projectId || !apiKey || typeof fetch !== 'function') return null;
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/reflectionThemes/${encodeURIComponent(key)}?key=${encodeURIComponent(apiKey)}`;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.status === 404) {
          if (!this._reflectionThemesNotFoundKeys) this._reflectionThemesNotFoundKeys = new Set();
          this._reflectionThemesNotFoundKeys.add(key);
          return null;
        }
        if (!res.ok) throw new Error(`Firestore REST read failed (${res.status})`);
        const payload = await res.json();
        return this.decodeReflectionThemeRestDocument(payload);
      } catch (error) {
        this.logger?.warn?.(`Reflection themes REST read failed for ${key}:`, error);
        return null;
      }
    }

    async fetchReflectionThemesViaBackend(dateKey) {
      const key = String(dateKey || '').trim();
      const baseUrl = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (!key || !baseUrl || typeof fetch !== 'function') return null;
      try {
        const res = await fetch(`${baseUrl}/api/reflection-themes/${encodeURIComponent(key)}`, { cache: 'no-store' });
        if (res.status === 404) {
          if (!this._reflectionThemesNotFoundKeys) this._reflectionThemesNotFoundKeys = new Set();
          this._reflectionThemesNotFoundKeys.add(key);
          return null;
        }
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Backend reflection themes read failed (${res.status})`);
        }
        return {
          themes: Array.isArray(data.themes) ? data.themes : [],
          first_response: String(data.first_response || data.firstResponse || '').trim(),
          user_name: String(data.user_name || data.userName || '').trim(),
          responseCount: Number(data.responseCount) || 0,
          reflectionPrompt: String(data.reflectionPrompt || data.communityPrompt || '').trim(),
          quiltImageUrl: String(data.quiltImageUrl || data.classicImageUrl || '').trim(),
          quiltImageSource: String(data.quiltImageSource || '').trim(),
          classicImageUrl: String(data.classicImageUrl || '').trim()
        };
      } catch (error) {
        this.logger?.warn?.(`Reflection themes backend read failed for ${key}:`, error);
        return null;
      }
    }

    decodeReflectionThemeRestDocument(payload) {
      const fields = payload?.fields || {};
      const themes = fields.themes?.arrayValue?.values || [];
      return {
        themes: themes
          .map((item) => {
            const mapFields = item?.mapValue?.fields;
            if (mapFields) {
              return {
                text: String(mapFields.text?.stringValue || '').trim(),
                author: String(mapFields.author?.stringValue || '').trim()
              };
            }
            const text = String(item?.stringValue || '').trim();
            return text ? { text, author: '' } : null;
          })
          .filter((entry) => entry?.text),
        first_response: String(
          fields.first_response?.stringValue || fields.firstResponse?.stringValue || ''
        ).trim(),
        user_name:
          String(fields.user_name?.stringValue || fields.userName?.stringValue || '').trim(),
        responseCount: Number(fields.responseCount?.integerValue || fields.responseCount?.doubleValue) || 0,
        reflectionPrompt: String(
          fields.reflectionPrompt?.stringValue ||
          fields.communityPrompt?.stringValue ||
          fields.reflectionPromptSnapshot?.stringValue ||
          ''
        ).trim()
      };
    }

    getReflectionPromptFromArchiveData(data) {
      return [
        data?.communityPrompt,
        data?.community_prompt,
        data?.communityPromptSnapshot,
        data?.reflectionPrompt,
        data?.reflection_prompt,
        data?.reflectionPromptSnapshot
      ]
        .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
        .find(Boolean) || '';
    }

    getReflectionArchiveQuoteFromData(data) {
      if (!data || typeof data !== 'object') return null;
      const text = [
        data.text,
        data.quoteText,
        data.textSnapshot,
        data.quoteTextSnapshot
      ]
        .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
        .find(Boolean) || '';
      const author = [
        data.author,
        data.quoteAuthor,
        data.authorSnapshot,
        data.quoteAuthorSnapshot
      ]
        .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
        .find(Boolean) || '';
      return text ? { text, author } : null;
    }

    pickQuiltImageUrlFromData(data) {
      if (!data || typeof data !== 'object') return '';
      return String(
        data.quiltImageUrl || data.classicUrl || data.imageStorageUrl || ''
      ).trim();
    }

    /** Zapier push / generate-instagram classicImageUrl (Firestore: classicUrl, imageStorageUrl). */
    pickClassicImageUrlFromInstagramDoc(data) {
      if (!data || typeof data !== 'object') return '';
      return String(data.classicUrl || data.imageStorageUrl || data.classicImageUrl || '').trim();
    }

    pickFinalArchiveQuiltImageUrlFromData(data) {
      if (!data || typeof data !== 'object') return '';
      const source = String(data.quiltImageSource || '').trim();
      if (source !== 'final_archive' && source !== 'classic') return '';
      return String(data.quiltImageUrl || data.classicImageUrl || '').trim();
    }

    buildReflectionArchiveClassicQuiltImageUrl(imageUrl) {
      const safeUrl = String(imageUrl || '').trim();
      if (!safeUrl) return '';
      if (/[?&]matte=warm\b/i.test(safeUrl)) return safeUrl;
      const baseUrl =
        typeof CONFIG !== 'undefined' && CONFIG.BACKEND?.baseUrl
          ? String(CONFIG.BACKEND.baseUrl).replace(/\/$/, '')
          : '';
      if (!baseUrl) return safeUrl;
      return `${baseUrl}/api/proxy-image?url=${encodeURIComponent(safeUrl)}&matte=warm`;
    }

    isUsableReflectionArchivePrompt(prompt) {
      const text = String(prompt || '').replace(/\s+/g, ' ').trim();
      return Boolean(text) && text !== '[Reflection prompt coming soon for this quote.]';
    }

    hasCompleteReflectionArchiveContext(themeData) {
      if (!themeData || typeof themeData !== 'object') return false;
      const prompt = this.getReflectionPromptFromArchiveData(themeData);
      const quote = this.getReflectionArchiveQuoteFromData(themeData);
      return this.isUsableReflectionArchivePrompt(prompt) && Boolean(quote?.text);
    }

    pickReflectionArchiveQuiltImageFromTheme(themeData) {
      if (!themeData || typeof themeData !== 'object') return '';
      const fromFinal = this.pickFinalArchiveQuiltImageUrlFromData(themeData);
      if (fromFinal) return fromFinal;
      return this.pickQuiltImageUrlFromData(themeData);
    }

    resolveQuiltImageFromThemeData(themeData) {
      const rawUrl = this.pickReflectionArchiveQuiltImageFromTheme(themeData);
      if (!rawUrl) {
        return { quiltImageUrl: '', quiltImageFallbackBlocks: null, quiltImageIsClassic: false };
      }
      const themeIsClassic = String(themeData?.quiltImageSource || '').trim() === 'classic';
      return {
        quiltImageUrl: themeIsClassic
          ? this.buildReflectionArchiveClassicQuiltImageUrl(rawUrl)
          : rawUrl,
        quiltImageFallbackBlocks: null,
        quiltImageIsClassic: themeIsClassic
      };
    }

    async getReflectionArchiveFirestoreDoc(collectionId, docId) {
      const collection = String(collectionId || '').trim();
      const id = String(docId || '').trim();
      if (!collection || !id || !window.db || !window.firestore?.doc || !window.firestore?.getDoc) {
        return { exists: false, data: null };
      }
      const cacheKey = `${collection}/${id}`;
      if (!this._reflectionArchiveDocCache) this._reflectionArchiveDocCache = new Map();
      if (this._reflectionArchiveDocCache.has(cacheKey)) {
        return this._reflectionArchiveDocCache.get(cacheKey);
      }
      try {
        const snap = await window.firestore.getDoc(
          window.firestore.doc(window.db, collection, id)
        );
        const result = {
          exists: snap.exists(),
          data: snap.exists() ? snap.data() || {} : null
        };
        this._reflectionArchiveDocCache.set(cacheKey, result);
        return result;
      } catch (error) {
        this.logger?.warn?.(`Reflection archive doc read failed (${cacheKey}):`, error);
        const miss = { exists: false, data: null };
        this._reflectionArchiveDocCache.set(cacheKey, miss);
        return miss;
      }
    }

    async resolveQuiltImageForReflectionArchive(dateKey, themeData = null) {
      const key = String(dateKey || '').trim();
      if (!key) {
        return { quiltImageUrl: '', quiltImageFallbackBlocks: null };
      }

      const fromThemeOnly = this.resolveQuiltImageFromThemeData(themeData);
      if (fromThemeOnly.quiltImageUrl) return fromThemeOnly;

      if (!window.db || !window.firestore?.doc || !window.firestore?.getDoc) {
        return { quiltImageUrl: '', quiltImageFallbackBlocks: null };
      }

      try {
        const [igResult, archiveResult] = await Promise.all([
          this.getReflectionArchiveFirestoreDoc('instagram-images', key),
          this.getReflectionArchiveFirestoreDoc('archives', key)
        ]);
        const igData = igResult.data || {};
        const archiveData = archiveResult.data || {};
        const classicUrl = this.pickClassicImageUrlFromInstagramDoc(igData);
        /**
         * Reflection archive must match the Zapier / classic card (app push).
         * Archive block arrays often disagree on block count with classicUrl even for the same day.
         */
        if (classicUrl) {
          return {
            quiltImageUrl: this.buildReflectionArchiveClassicQuiltImageUrl(classicUrl),
            quiltImageFallbackBlocks: null,
            quiltImageIsClassic: false
          };
        }

        const archiveUrl = this.pickFinalArchiveQuiltImageUrlFromData(archiveData);
        if (archiveUrl) {
          const archiveIsClassic =
            String(archiveData.quiltImageSource || '').trim() === 'classic';
          return {
            quiltImageUrl: archiveIsClassic
              ? this.buildReflectionArchiveClassicQuiltImageUrl(archiveUrl)
              : archiveUrl,
            quiltImageFallbackBlocks: null,
            quiltImageIsClassic: false
          };
        }

        const archiveBlocks = archiveData.quilt?.blocks || archiveData.blocks;
        if (Array.isArray(archiveBlocks) && archiveBlocks.length > 1) {
          return { quiltImageUrl: '', quiltImageFallbackBlocks: archiveBlocks };
        }
      } catch (error) {
        this.logger?.warn?.(`resolveQuiltImageForReflectionArchive(${key}):`, error);
      }

      return { quiltImageUrl: '', quiltImageFallbackBlocks: null };
    }

    async applyWarmNeutralMatteToReflectionQuiltImage(imgEl, sourceUrl) {
      if (!imgEl || imgEl.dataset.matteApplied === '1') return;
      const url = String(sourceUrl || imgEl.getAttribute('src') || '').trim();
      if (!url || url.startsWith('blob:')) return;
      if (!this.archiveService?.compositeImageUrlWithWarmNeutralMatte) return;
      try {
        const blob = await this.archiveService.compositeImageUrlWithWarmNeutralMatte(url);
        if (!blob) return;
        const prev = imgEl.dataset.blobUrl;
        if (prev) {
          try {
            URL.revokeObjectURL(prev);
          } catch (_) {
            /* ignore */
          }
        }
        const blobUrl = URL.createObjectURL(blob);
        imgEl.dataset.blobUrl = blobUrl;
        imgEl.src = blobUrl;
        imgEl.dataset.matteApplied = '1';
        imgEl.dataset.resolved = '1';
      } catch (error) {
        this.logger?.warn?.('Warm neutral matte for classic quilt failed:', error);
      }
    }

    async ensureReflectionArchiveQuiltImage(dateKey, imgEl) {
      const key = String(dateKey || '').trim();
      if (!key || !imgEl || imgEl.dataset.resolved === '1') return;

      if (imgEl.dataset.classicMatte === '1') {
        await this.applyWarmNeutralMatteToReflectionQuiltImage(imgEl);
        return;
      }

      const blocks = this._reflectionArchiveQuiltBlocksCache?.get(key);
      if (!Array.isArray(blocks) || blocks.length <= 1) {
        imgEl.remove();
        return;
      }
      if (!this.archiveService?.generateQuiltRasterBlobFromBlocks) return;

      try {
        const blob = await this.archiveService.generateQuiltRasterBlobFromBlocks(blocks, {
          targetAspect: typeof IG_QUILT_SCREEN_ASPECT === 'number' ? IG_QUILT_SCREEN_ASPECT : 9 / 16,
          instagramTrueWhiteMatte: false,
          backgroundColor: '#f6f4f1'
        });
        if (!blob) {
          imgEl.remove();
          return;
        }
        const prev = imgEl.dataset.blobUrl;
        if (prev) {
          try {
            URL.revokeObjectURL(prev);
          } catch (_) {
            /* ignore */
          }
        }
        const blobUrl = URL.createObjectURL(blob);
        imgEl.dataset.blobUrl = blobUrl;
        imgEl.src = blobUrl;
        imgEl.dataset.resolved = '1';
        imgEl.classList.remove('reflection-themes-archive-quilt-image--pending');
      } catch (error) {
        this.logger?.warn?.('Reflection archive quilt raster failed:', error);
        imgEl.remove();
      }
    }

    async loadReflectionArchiveContextForDate(dateKey, themeData = null) {
      const fromThemeDoc = this.getReflectionPromptFromArchiveData(themeData || {});
      const quoteFromThemeDoc = this.getReflectionArchiveQuoteFromData(themeData || {});
      const isUsablePrompt = (prompt) => this.isUsableReflectionArchivePrompt(prompt);
      let prompt = fromThemeDoc;
      let quote = quoteFromThemeDoc;
      let first_response = this._firstResponseFromPayload(themeData || {});

      const pickFirstResponse = (...payloads) => {
        for (const payload of payloads) {
          const value = this._firstResponseFromPayload(payload);
          if (value) return value;
        }
        return '';
      };

      if (this.hasCompleteReflectionArchiveContext(themeData)) {
        return {
          prompt: isUsablePrompt(prompt) ? prompt : this.getQuiltReflectionPromptText({}),
          quote,
          first_response
        };
      }

      if (!window.db || !window.firestore?.doc || !window.firestore?.getDoc) {
        return {
          prompt: isUsablePrompt(prompt) ? prompt : this.getQuiltReflectionPromptText({}),
          quote,
          first_response
        };
      }
      const readArchiveDoc = async (collectionId, docId) => {
        if (!docId) return { prompt: '', quote: null, data: null };
        const snap = await this.getReflectionArchiveFirestoreDoc(collectionId, docId);
        const data = snap.exists ? snap.data : null;
        return {
          prompt: data ? this.getReflectionPromptFromArchiveData(data) || this.getQuiltReflectionPromptText(data) : '',
          quote: data ? this.getReflectionArchiveQuoteFromData(data) : null,
          data
        };
      };

      const dailyQuote = await readArchiveDoc('quotes', dateKey);
      if (!quote) quote = dailyQuote.quote;
      if (!isUsablePrompt(prompt) && isUsablePrompt(dailyQuote.prompt)) prompt = dailyQuote.prompt;

      const assignment = await readArchiveDoc('dailyQuoteAssignments', dateKey);
      if (!quote) quote = assignment.quote;
      if (!isUsablePrompt(prompt) && isUsablePrompt(assignment.prompt)) prompt = assignment.prompt;
      const sourceId = String(assignment.data?.sourceId || assignment.data?.quoteId || '').trim();
      let sourceQuote = { prompt: '', quote: null, data: null };
      if (sourceId) {
        sourceQuote = await readArchiveDoc('quotes', sourceId);
        if (!quote) quote = sourceQuote.quote;
        if (!isUsablePrompt(prompt) && isUsablePrompt(sourceQuote.prompt)) prompt = sourceQuote.prompt;
      }

      first_response = pickFirstResponse(
        themeData,
        dailyQuote.data,
        assignment.data,
        sourceQuote.data
      );

      return {
        prompt: isUsablePrompt(prompt) ? prompt : this.getQuiltReflectionPromptText({}),
        quote,
        first_response
      };
    }

    formatReflectionThemeArchiveDate(dateKey) {
      const parts = String(dateKey || '').split('-').map((part) => parseInt(part, 10));
      if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
        return String(dateKey || '').trim() || 'Reflection';
      }
      return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });
    }

    setReflectionThemesArchiveStatus(message, options = {}) {
      const feed = document.getElementById('reflectionThemesArchiveFeed');
      if (!feed) return;
      const safeMessage = this.escapeQuiltFortuneText(message);
      feed.innerHTML = options.loading
        ? `<div class="reflection-themes-archive-status reflection-themes-archive-status--loading">
            <div class="reflection-themes-archive-status-message">${safeMessage}</div>
            <div class="reflection-themes-archive-status-spinner" aria-hidden="true"></div>
          </div>`
        : `<div class="reflection-themes-archive-status">${safeMessage}</div>`;
    }

    reflectionThemeDocToArchiveStub(snap) {
      const data = snap.data?.() ? snap.data() : snap.data || {};
      const dateKey = String(data.appDateKey || snap.id || '').trim();
      if (!dateKey) return null;
      const communityThemes = this.orderReflectionCommunityThemesNewestFirst(
        Array.isArray(data.themes)
          ? data.themes
            .map((theme) => this.normalizeReflectionWallTheme(theme))
            .filter((entry) => entry?.text)
          : []
      );
      return {
        dateKey,
        communityThemes,
        responseCount: Number(data.responseCount) || communityThemes.length,
        communityPrompt: data.communityPrompt,
        community_prompt: data.community_prompt,
        communityPromptSnapshot: data.communityPromptSnapshot,
        reflectionPrompt: data.reflectionPrompt,
        reflection_prompt: data.reflection_prompt,
        reflectionPromptSnapshot: data.reflectionPromptSnapshot,
        text: data.text,
        quoteText: data.quoteText,
        textSnapshot: data.textSnapshot,
        quoteTextSnapshot: data.quoteTextSnapshot,
        author: data.author,
        quoteAuthor: data.quoteAuthor,
        authorSnapshot: data.authorSnapshot,
        quoteAuthorSnapshot: data.quoteAuthorSnapshot,
        first_response: data.first_response,
        firstResponse: data.firstResponse,
        quiltImageUrl: this.pickReflectionArchiveQuiltImageFromTheme(data),
        quiltImageSource: String(data.quiltImageSource || '').trim(),
        classicImageUrl: String(data.classicImageUrl || '').trim()
      };
    }

    buildPartialReflectionArchiveEntry(stub) {
      if (!stub?.dateKey) return null;
      const promptRaw = this.getReflectionPromptFromArchiveData(stub);
      const quote = this.getReflectionArchiveQuoteFromData(stub);
      const first_response = this._firstResponseFromPayload(stub);
      const themes = this.buildReflectionWallThemes(stub.communityThemes, first_response);
      if (!themes.length) return null;
      const quiltFromTheme = this.resolveQuiltImageFromThemeData(stub);
      const prompt = this.isUsableReflectionArchivePrompt(promptRaw)
        ? promptRaw
        : promptRaw || '';
      return {
        ...stub,
        themes,
        prompt,
        quote,
        quiltImageUrl: quiltFromTheme.quiltImageUrl || stub.quiltImageUrl || '',
        quiltImageFallbackBlocks: null,
        quiltImageIsClassic: !!quiltFromTheme.quiltImageIsClassic
      };
    }

    async hydrateReflectionArchiveEntry(entry) {
      if (!entry?.dateKey) return null;
      if (!this._reflectionArchiveQuiltBlocksCache) {
        this._reflectionArchiveQuiltBlocksCache = new Map();
      }
      const [context, quiltImage] = await Promise.all([
        this.loadReflectionArchiveContextForDate(entry.dateKey, entry),
        this.resolveQuiltImageForReflectionArchive(entry.dateKey, entry)
      ]);
      if (quiltImage.quiltImageFallbackBlocks) {
        this._reflectionArchiveQuiltBlocksCache.set(
          entry.dateKey,
          quiltImage.quiltImageFallbackBlocks
        );
      }
      const themes = this.buildReflectionWallThemes(
        entry.communityThemes,
        context.first_response || ''
      );
      if (!themes.length) return null;
      return {
        ...entry,
        themes,
        prompt: context.prompt,
        quote: context.quote,
        quiltImageUrl: quiltImage.quiltImageUrl || entry.quiltImageUrl || '',
        quiltImageFallbackBlocks: quiltImage.quiltImageFallbackBlocks,
        quiltImageIsClassic: !!quiltImage.quiltImageIsClassic
      };
    }

    async fetchReflectionThemeArchivePageViaBackend(cursorDateKey = null) {
      const baseUrl = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (!baseUrl || typeof fetch !== 'function') return null;
      const limit = this._reflectionThemesArchivePageSize || 7;
      const params = new URLSearchParams({ limit: String(limit) });
      const cursor = String(cursorDateKey || '').trim();
      if (cursor) params.set('cursorDateKey', cursor);
      try {
        const res = await fetch(`${baseUrl}/api/reflection-themes/archive?${params.toString()}`, {
          cache: 'no-store'
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Archive API failed (${res.status})`);
        }
        const entries = (Array.isArray(data.entries) ? data.entries : [])
          .map((row) => {
            const dateKey = String(row.dateKey || row.appDateKey || '').trim();
            const communityThemes = this.orderReflectionCommunityThemesNewestFirst(
              (Array.isArray(row.themes) ? row.themes : [])
                .map((theme) => this.normalizeReflectionWallTheme(theme))
                .filter((entry) => entry?.text)
            );
            const first_response = String(row.first_response || row.firstResponse || '').trim();
            const themes = this.buildReflectionWallThemes(communityThemes, first_response);
            if (!themes.length) return null;
            const quoteText = String(row.quote?.text || row.quoteText || '').trim();
            const quoteAuthor = String(row.quote?.author || row.quoteAuthor || '').trim();
            const rawQuiltUrl = String(row.quiltImageUrl || '').trim();
            const quiltImageIsClassic = row.quiltImageIsClassic === true;
            return {
              dateKey,
              communityThemes,
              themes,
              prompt: String(row.prompt || row.reflectionPrompt || '').trim(),
              quote: quoteText ? { text: quoteText, author: quoteAuthor } : null,
              quiltImageUrl: quiltImageIsClassic
                ? this.buildReflectionArchiveClassicQuiltImageUrl(rawQuiltUrl)
                : rawQuiltUrl,
              quiltImageFallbackBlocks: Array.isArray(row.quiltImageFallbackBlocks)
                ? row.quiltImageFallbackBlocks
                : null,
              quiltImageIsClassic
            };
          })
          .filter(Boolean);
        if (entries.length) {
          entries.forEach((entry) => {
            if (entry.quiltImageFallbackBlocks) {
              this._reflectionArchiveQuiltBlocksCache?.set(
                entry.dateKey,
                entry.quiltImageFallbackBlocks
              );
            }
          });
        }
        return {
          entries,
          cursor: null,
          cursorDateKey: String(data.cursorDateKey || entries[entries.length - 1]?.dateKey || '').trim(),
          hasOlder: data.hasOlder === true
        };
      } catch (error) {
        this.logger?.warn?.('Reflection archive backend page failed:', error);
        return null;
      }
    }

    patchReflectionArchiveEntryInDom(dateKey, entry) {
      const key = String(dateKey || '').trim();
      if (!key || !entry) return;
      const feed = document.getElementById('reflectionThemesArchiveFeed');
      const article = feed?.querySelector(
        `.reflection-themes-archive-entry[data-date-key="${CSS.escape(key)}"]`
      );
      if (!article) return;

      const promptEl = article.querySelector('.reflection-themes-archive-prompt');
      if (promptEl && entry.prompt) {
        promptEl.textContent = entry.prompt;
      }

      const details = article.querySelector('.reflection-themes-archive-details');
      if (details) {
        const quoteText = String(entry.quote?.text || '').trim();
        const quoteAuthor = String(entry.quote?.author || '').trim();
        let quoteStrip = details.querySelector('.reflection-themes-archive-quote-strip');
        if (quoteText) {
          const quoteHtml = `${this.escapeQuiltFortuneText(quoteText)}${
            quoteAuthor
              ? ` <span class="reflection-themes-archive-quote-author">— ${this.escapeQuiltFortuneText(quoteAuthor)}</span>`
              : ''
          }`;
          if (quoteStrip) {
            quoteStrip.innerHTML = quoteHtml;
          } else {
            quoteStrip = document.createElement('div');
            quoteStrip.className = 'reflection-themes-archive-quote-strip';
            quoteStrip.innerHTML = quoteHtml;
            const dateEl = details.querySelector('.reflection-themes-archive-date');
            if (dateEl) details.insertBefore(quoteStrip, dateEl);
            else details.appendChild(quoteStrip);
          }
        }

        const quiltUrl = String(entry.quiltImageUrl || '').trim();
        let img = details.querySelector('.reflection-themes-archive-quilt-image');
        if (quiltUrl) {
          if (!img) {
            const frame = document.createElement('div');
            frame.className = 'reflection-themes-archive-quilt-frame';
            frame.innerHTML = `<div class="reflection-themes-archive-quilt-rotate">
              <img class="reflection-themes-archive-quilt-image" alt="" loading="lazy" data-date-key="${this.escapeQuiltFortuneText(key)}" />
            </div>`;
            const dateEl = details.querySelector('.reflection-themes-archive-date');
            if (dateEl) details.insertBefore(frame, dateEl);
            else details.appendChild(frame);
            img = frame.querySelector('.reflection-themes-archive-quilt-image');
          }
          if (img) {
            img.src = quiltUrl;
            img.dataset.dateKey = key;
            if (entry.quiltImageIsClassic) img.dataset.classicMatte = '1';
            img.classList.remove('reflection-themes-archive-quilt-image--pending');
            delete img.dataset.needsRaster;
          }
        } else if (entry.quiltImageFallbackBlocks && !img) {
          const frame = document.createElement('div');
          frame.className = 'reflection-themes-archive-quilt-frame';
          frame.innerHTML = `<div class="reflection-themes-archive-quilt-rotate">
            <img class="reflection-themes-archive-quilt-image reflection-themes-archive-quilt-image--pending" alt="" data-date-key="${this.escapeQuiltFortuneText(key)}" data-needs-raster="1" />
          </div>`;
          const dateEl = details.querySelector('.reflection-themes-archive-date');
          if (dateEl) details.insertBefore(frame, dateEl);
          else details.appendChild(frame);
        }
      }
    }

    prefetchReflectionThemesArchivePage() {
      if (this._reflectionThemesArchiveLoaded || this._reflectionArchivePrefetchPromise) return;
      this._reflectionArchivePrefetchPromise = this.loadReflectionThemeArchiveEntries(null, {
        prefetchOnly: true
      })
        .then((page) => {
          if (page?.entries?.length) {
            this._reflectionThemesArchivePages = [page];
            this._reflectionThemesArchivePageIndex = 0;
            this._reflectionThemesArchiveHasOlder = page.hasOlder;
          }
        })
        .catch((error) => {
          this.logger?.warn?.('Reflection archive prefetch failed:', error);
        })
        .finally(() => {
          this._reflectionArchivePrefetchPromise = null;
        });
    }

    async initializeReflectionThemesArchiveScreen() {
      this.uiService?._purgeReflectionArchiveGhostLayers?.();
      this.uiService?._syncQuoteLayoutBStripLeakGuard?.();
      requestAnimationFrame(() => {
        this.uiService?._purgeReflectionArchiveGhostLayers?.();
        this.uiService?._syncQuoteLayoutBStripLeakGuard?.();
      });
      this.bindReflectionThemesArchiveControls();
      if (this._reflectionThemesArchiveLoaded) {
        const currentPage = this._reflectionThemesArchivePages[this._reflectionThemesArchivePageIndex];
        if (currentPage) {
          this.renderReflectionThemeArchiveEntries(currentPage.entries);
          this.updateReflectionThemesArchiveControls();
        }
        return;
      }
      if (this._reflectionArchivePrefetchPromise) {
        await this._reflectionArchivePrefetchPromise.catch(() => {});
      }
      if (this._reflectionThemesArchivePages[0]?.entries?.length) {
        this._reflectionThemesArchivePageIndex = 0;
        this.renderReflectionThemeArchiveEntries(this._reflectionThemesArchivePages[0].entries);
        this.updateReflectionThemesArchiveControls();
        this._reflectionThemesArchiveLoaded = true;
        return;
      }
      this.setReflectionThemesArchiveStatus('Loading reflections...', { loading: true });
      if (window.odqPerfMark) window.odqPerfMark('reflection-archive-screen-open');
      try {
        const page = await this.loadReflectionThemeArchiveEntries(null, {
          onFirstPaint: (partialPage) => {
            if (window.odqPerfMark) window.odqPerfMark('reflection-archive-first-paint');
            if (partialPage?.entries?.length) {
              this.renderReflectionThemeArchiveEntries(partialPage.entries);
            }
          }
        });
        this._reflectionThemesArchivePages = [page];
        this._reflectionThemesArchivePageIndex = 0;
        this._reflectionThemesArchiveHasOlder = page.hasOlder;
        this.renderReflectionThemeArchiveEntries(page.entries);
        page.entries.forEach((entry) => this.patchReflectionArchiveEntryInDom(entry.dateKey, entry));
        this.updateReflectionThemesArchiveControls();
        this._reflectionThemesArchiveLoaded = true;
        if (window.odqPerfMark) window.odqPerfMark('reflection-archive-hydrate-done');
      } catch (error) {
        this.logger?.warn?.('Reflection themes archive failed to load:', error);
        this.setReflectionThemesArchiveStatus('Reflection themes are not available right now.');
        this.updateReflectionThemesArchiveControls();
      }
    }

    async loadReflectionThemeArchiveEntries(cursorSnap = null, options = {}) {
      const { onFirstPaint, prefetchOnly = false } = options;
      const cursorDateKey =
        String(options.cursorDateKey || '').trim() ||
        (cursorSnap && typeof cursorSnap.id === 'string' ? cursorSnap.id.trim() : '');

      if (window.odqPerfMark) window.odqPerfMark('reflection-archive-load-start');
      this._reflectionArchiveDocCache = new Map();

      const backendPage = await this.fetchReflectionThemeArchivePageViaBackend(cursorDateKey);
      if (backendPage) {
        if (window.odqPerfMark) window.odqPerfMark('reflection-archive-query-done');
        if (!prefetchOnly && onFirstPaint && backendPage.entries.length) {
          onFirstPaint({ entries: backendPage.entries, hasOlder: backendPage.hasOlder });
        }
        if (window.odqPerfMark && !prefetchOnly) window.odqPerfMark('reflection-archive-hydrate-done');
        return backendPage;
      }

      if (
        !window.db ||
        !window.firestore?.collection ||
        !window.firestore?.query ||
        !window.firestore?.orderBy ||
        !window.firestore?.limit ||
        !window.firestore?.startAfter ||
        !window.firestore?.getDocs ||
        !window.firestore?.doc ||
        !window.firestore?.getDoc
      ) {
        throw new Error('Firestore is not available for reflection themes archive');
      }

      const themesRef = window.firestore.collection(window.db, 'reflectionThemes');
      const archivePageSize = this._reflectionThemesArchivePageSize || 7;
      const queryConstraints = [window.firestore.orderBy('generatedAt', 'desc')];
      if (cursorSnap) {
        queryConstraints.push(window.firestore.startAfter(cursorSnap));
      } else if (cursorDateKey) {
        const cursorDoc = await window.firestore.getDoc(
          window.firestore.doc(window.db, 'reflectionThemes', cursorDateKey)
        );
        if (cursorDoc.exists()) {
          queryConstraints.push(window.firestore.startAfter(cursorDoc));
        }
      }
      queryConstraints.push(window.firestore.limit(archivePageSize));
      const themesQuery = window.firestore.query(themesRef, ...queryConstraints);
      const themesSnapshot = await window.firestore.getDocs(themesQuery);
      if (window.odqPerfMark) window.odqPerfMark('reflection-archive-query-done');

      const stubs = [];
      const snapshots = [];
      themesSnapshot.forEach((snap) => {
        snapshots.push(snap);
        const stub = this.reflectionThemeDocToArchiveStub(snap);
        if (stub) stubs.push(stub);
      });

      const partialEntries = stubs
        .map((stub) => this.buildPartialReflectionArchiveEntry(stub))
        .filter(Boolean);

      if (!prefetchOnly && onFirstPaint && partialEntries.length) {
        onFirstPaint({ entries: partialEntries, hasOlder: snapshots.length === archivePageSize });
      }

      if (!this._reflectionArchiveQuiltBlocksCache) {
        this._reflectionArchiveQuiltBlocksCache = new Map();
      }

      const entries = (
        await Promise.all(stubs.map((stub) => this.hydrateReflectionArchiveEntry(stub)))
      ).filter(Boolean);

      if (!prefetchOnly && onFirstPaint) {
        entries.forEach((entry) => this.patchReflectionArchiveEntryInDom(entry.dateKey, entry));
      }

      if (window.odqPerfMark && !prefetchOnly) window.odqPerfMark('reflection-archive-hydrate-done');

      return {
        entries,
        cursor: snapshots[snapshots.length - 1] || cursorSnap || null,
        cursorDateKey: entries[entries.length - 1]?.dateKey || cursorDateKey || '',
        hasOlder: snapshots.length === archivePageSize
      };
    }

    bindReflectionThemesArchiveControls() {
      if (this._reflectionThemesArchiveControlsBound) return;
      const newerBtn = document.getElementById('reflectionThemesArchiveNewer');
      const olderBtn = document.getElementById('reflectionThemesArchiveOlder');
      if (!newerBtn || !olderBtn) return;
      newerBtn.addEventListener('click', () => this.showNewerReflectionThemesArchivePage());
      olderBtn.addEventListener('click', () => this.showOlderReflectionThemesArchivePage());
      this._reflectionThemesArchiveControlsBound = true;
    }

    updateReflectionThemesArchiveControls() {
      const newerBtn = document.getElementById('reflectionThemesArchiveNewer');
      const olderBtn = document.getElementById('reflectionThemesArchiveOlder');
      if (!newerBtn || !olderBtn) return;
      const hasNewerPage = this._reflectionThemesArchivePageIndex > 0;
      const hasCachedOlderPage = this._reflectionThemesArchivePageIndex < this._reflectionThemesArchivePages.length - 1;
      const canLoadOlderPage = this._reflectionThemesArchiveHasOlder || hasCachedOlderPage;
      newerBtn.hidden = !hasNewerPage;
      olderBtn.hidden = !canLoadOlderPage;
      newerBtn.disabled = this._reflectionThemesArchiveLoading || !hasNewerPage;
      olderBtn.disabled = this._reflectionThemesArchiveLoading || !canLoadOlderPage;
    }

    scrollReflectionThemesArchiveToTop() {
      const screen = document.getElementById('screen-reflection-themes-archive');
      if (screen?.scrollTo) {
        screen.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    showNewerReflectionThemesArchivePage() {
      if (this._reflectionThemesArchiveLoading || this._reflectionThemesArchivePageIndex <= 0) return;
      this._reflectionThemesArchivePageIndex -= 1;
      const page = this._reflectionThemesArchivePages[this._reflectionThemesArchivePageIndex];
      this.renderReflectionThemeArchiveEntries(page?.entries || []);
      this.updateReflectionThemesArchiveControls();
      this.scrollReflectionThemesArchiveToTop();
    }

    async showOlderReflectionThemesArchivePage() {
      if (this._reflectionThemesArchiveLoading) return;
      const nextPage = this._reflectionThemesArchivePages[this._reflectionThemesArchivePageIndex + 1];
      if (nextPage) {
        this._reflectionThemesArchivePageIndex += 1;
        this.renderReflectionThemeArchiveEntries(nextPage.entries);
        this.updateReflectionThemesArchiveControls();
        this.scrollReflectionThemesArchiveToTop();
        return;
      }

      const currentPage = this._reflectionThemesArchivePages[this._reflectionThemesArchivePageIndex];
      if (!this._reflectionThemesArchiveHasOlder || !currentPage?.cursor) {
        this._reflectionThemesArchiveHasOlder = false;
        this.updateReflectionThemesArchiveControls();
        return;
      }

      this._reflectionThemesArchiveLoading = true;
      this.updateReflectionThemesArchiveControls();
      try {
        const page = await this.loadReflectionThemeArchiveEntries(currentPage.cursor, {
          cursorDateKey: currentPage.cursorDateKey,
          onFirstPaint: (partialPage) => {
            if (partialPage?.entries?.length) {
              this.renderReflectionThemeArchiveEntries(partialPage.entries);
            }
          }
        });
        if (!page.entries.length) {
          this._reflectionThemesArchiveHasOlder = false;
          this.updateReflectionThemesArchiveControls();
          return;
        }
        this._reflectionThemesArchivePages.push(page);
        this._reflectionThemesArchivePageIndex += 1;
        this._reflectionThemesArchiveHasOlder = page.hasOlder;
        this.renderReflectionThemeArchiveEntries(page.entries);
        this.scrollReflectionThemesArchiveToTop();
      } catch (error) {
        this.logger?.warn?.('Older reflection themes archive page failed to load:', error);
      } finally {
        this._reflectionThemesArchiveLoading = false;
        this.updateReflectionThemesArchiveControls();
      }
    }

    renderReflectionThemeArchiveEntries(entries) {
      const feed = document.getElementById('reflectionThemesArchiveFeed');
      if (!feed) return;
      const archiveEntries = Array.isArray(entries) ? entries : [];
      if (!archiveEntries.length) {
        this.setReflectionThemesArchiveStatus('No reflection themes have been archived yet.');
        return;
      }
      feed.innerHTML = archiveEntries.map((entry, index) => {
        const dateLabel = this.formatReflectionThemeArchiveDate(entry.dateKey);
        const prompt = this.escapeQuiltFortuneText(entry.prompt);
        const quoteText = String(entry.quote?.text || '').trim();
        const quoteAuthor = String(entry.quote?.author || '').trim();
        const quoteStrip = quoteText
          ? `<div class="reflection-themes-archive-quote-strip">${this.escapeQuiltFortuneText(quoteText)}${
              quoteAuthor ? ` <span class="reflection-themes-archive-quote-author">— ${this.escapeQuiltFortuneText(quoteAuthor)}</span>` : ''
            }</div>`
          : '';
        const ideaEntries = entry.themes
          .map((theme) => this.normalizeReflectionWallTheme(theme))
          .filter((item) => item?.text);
        const themes = ideaEntries
          .map((item) => {
            const body = this.escapeQuiltFortuneText(item.text);
            const author = String(item.author || '').trim();
            const byline = author
              ? ` <span class="reflection-themes-archive-theme-author">— ${this.escapeQuiltFortuneText(author)}</span>`
              : '';
            return `<li>${body}${byline}</li>`;
          })
          .join('');
        const detailsId = `reflectionThemesArchiveDetails-${index}`;
        const quiltImageUrl = String(entry.quiltImageUrl || '').trim();
        const hasQuiltVisual = quiltImageUrl || entry.quiltImageFallbackBlocks;
        const safeQuiltUrl = quiltImageUrl ? this.escapeQuiltFortuneText(quiltImageUrl) : '';
        const quiltImageHtml = hasQuiltVisual
          ? `<div class="reflection-themes-archive-quilt-frame">
              <div class="reflection-themes-archive-quilt-rotate">
              ${
                quiltImageUrl
                  ? `<img class="reflection-themes-archive-quilt-image" src="${safeQuiltUrl}" alt="" loading="lazy" data-date-key="${this.escapeQuiltFortuneText(entry.dateKey)}"${entry.quiltImageIsClassic ? ' data-classic-matte="1"' : ''} />`
                  : `<img class="reflection-themes-archive-quilt-image reflection-themes-archive-quilt-image--pending" alt="" data-date-key="${this.escapeQuiltFortuneText(entry.dateKey)}" data-needs-raster="1" />`
              }
              </div>
            </div>`
          : '';
        return `
          <article class="reflection-themes-archive-entry" data-date-key="${this.escapeQuiltFortuneText(entry.dateKey)}">
            <button type="button" class="reflection-themes-archive-question" aria-expanded="false" aria-controls="${detailsId}">
              <p class="reflection-themes-archive-prompt">${prompt}</p>
              <span class="reflection-themes-archive-question-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img" focusable="false">
                  <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </span>
            </button>
            <div class="reflection-themes-archive-details" id="${detailsId}" hidden>
              <ul class="reflection-themes-archive-themes">${themes}</ul>
              ${quiltImageHtml}
              ${quoteStrip}
              <p class="reflection-themes-archive-date">${this.escapeQuiltFortuneText(dateLabel)}</p>
            </div>
          </article>
        `;
      }).join('');
      this.bindReflectionThemesArchiveAccordion();
    }

    hydrateReflectionArchiveQuiltImagesInEntry(entry) {
      if (!entry) return;
      const dateKey = String(entry.getAttribute('data-date-key') || '').trim();
      entry.querySelectorAll('.reflection-themes-archive-quilt-image').forEach((img) => {
        if (img.dataset.resolved === '1') return;
        const imgDateKey = String(img.getAttribute('data-date-key') || dateKey).trim();
        if (img.dataset.classicMatte === '1') {
          void this.applyWarmNeutralMatteToReflectionQuiltImage(img);
          return;
        }
        if (img.dataset.needsRaster === '1' || !String(img.getAttribute('src') || '').trim()) {
          void this.ensureReflectionArchiveQuiltImage(imgDateKey, img);
        }
      });
    }

    bindReflectionThemesArchiveAccordion() {
      const feed = document.getElementById('reflectionThemesArchiveFeed');
      if (!feed) return;

      if (feed.dataset.quiltImageBound !== '1') {
        feed.dataset.quiltImageBound = '1';
        feed.addEventListener(
          'load',
          (event) => {
            const img = event.target;
            if (!img?.classList?.contains('reflection-themes-archive-quilt-image')) return;
            if (img.dataset.classicMatte !== '1' || img.dataset.matteApplied === '1') return;
            void this.applyWarmNeutralMatteToReflectionQuiltImage(img);
          },
          true
        );
        feed.addEventListener(
          'error',
          (event) => {
            const img = event.target;
            if (!img?.classList?.contains('reflection-themes-archive-quilt-image')) return;
            const dateKey = String(img.getAttribute('data-date-key') || '').trim();
            if (dateKey) void this.ensureReflectionArchiveQuiltImage(dateKey, img);
          },
          true
        );
      }

      if (feed.dataset.accordionBound === '1') return;
      feed.dataset.accordionBound = '1';
      feed.addEventListener('click', (event) => {
        const trigger = event.target.closest('.reflection-themes-archive-question');
        if (!trigger || !feed.contains(trigger)) return;
        const entry = trigger.closest('.reflection-themes-archive-entry');
        const details = entry?.querySelector('.reflection-themes-archive-details');
        if (!details) return;
        const isOpen = trigger.getAttribute('aria-expanded') === 'true';
        if (isOpen) {
          trigger.setAttribute('aria-expanded', 'false');
          details.hidden = true;
          entry.classList.remove('reflection-themes-archive-entry--open');
        } else {
          trigger.setAttribute('aria-expanded', 'true');
          details.hidden = false;
          entry.classList.add('reflection-themes-archive-entry--open');
          this.hydrateReflectionArchiveQuiltImagesInEntry(entry);
        }
      });
    }

    async submitReflectionResponse(responseText, options = {}) {
      const baseUrl = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (!baseUrl) throw new Error('CONFIG.BACKEND.baseUrl is not set');
      const todayQuote = this.quoteService?.getTodayQuote?.() || null;
      const displayName =
        Object.prototype.hasOwnProperty.call(options, 'displayName')
          ? String(options.displayName ?? '').trim()
          : Utils.getNameThanksDisplayName();
      const payload = {
        responseText,
        appDateKey: options.appDateKey || Utils.getTodayKey(),
        clientId: options.clientId || this.currentUserId || Utils.getOrCreateUserId(),
        quoteId: String(todayQuote?.id || todayQuote?.sourceId || todayQuote?.notionPageId || '').slice(0, 180),
        reflectionPromptSnapshot: this.getQuiltReflectionPromptText(todayQuote).slice(0, 500)
      };
      if (displayName) {
        payload.displayName = displayName.slice(0, 80);
      }
      const postReflection = () =>
        fetch(`${baseUrl}/api/reflection-response`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      let res = await postReflection();
      let data = await res.json().catch(() => null);
      if (res.status === 503) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        res = await postReflection();
        data = await res.json().catch(() => null);
      }
      if (!res.ok || !data?.success) {
        const err = new Error(data?.error || `Reflection response failed (${res.status})`);
        err.status = res.status;
        err.rejected = res.status === 422 || data?.rejected === true;
        throw err;
      }
      return data;
    }

    pickQuiltFortuneAnchorWord(quote) {
      const raw = [
        quote?.blessing,
        quote?.communityPrompt,
        quote?.community_prompt,
        quote?.whatIf,
        quote?.what_if,
        quote?.reflectionPrompt,
        quote?.reflection_prompt,
        quote?.text
      ].filter(Boolean).join(' ');
      const stopWords = new Set([
        'about', 'after', 'again', 'also', 'because', 'before', 'being', 'between',
        'could', 'every', 'first', 'from', 'have', 'into', 'just', 'like', 'more',
        'much', 'must', 'only', 'other', 'over', 'should', 'some', 'than', 'that',
        'their', 'there', 'these', 'they', 'this', 'through', 'today', 'under',
        'until', 'very', 'were', 'what', 'when', 'where', 'which', 'while', 'with',
        'would', 'your', 'youre'
      ]);
      const words = String(raw || '')
        .toLowerCase()
        .replace(/[^a-z\s'-]/g, ' ')
        .split(/\s+/)
        .map((word) => word.replace(/^'+|'+$/g, ''))
        .filter((word) => word.length >= 4 && !stopWords.has(word));
      if (!words.length) return 'wonder';
      const seed = Utils.hashStringToUint(`${Utils.getTodayKey()}:${raw}`);
      return words[seed % words.length];
    }

    getQuiltBlessingText(quote) {
      const direct = String(quote?.blessing ?? quote?.Blessing ?? quote?.BLESSING ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (direct) return Utils.formatBlessingWithDisplayName(direct);
      if (quote && typeof quote === 'object') {
        for (const key of Object.keys(quote)) {
          if (!String(key).toLowerCase().includes('blessing')) continue;
          const value = String(quote[key] || '').replace(/\s+/g, ' ').trim();
          if (value) return Utils.formatBlessingWithDisplayName(value);
        }
      }
      return "Today's blessing is still being stitched.";
    }

    getQuiltBlessingShareText(quote) {
      const direct = String(quote?.blessing ?? quote?.Blessing ?? quote?.BLESSING ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (direct) return direct;
      if (quote && typeof quote === 'object') {
        for (const key of Object.keys(quote)) {
          if (!String(key).toLowerCase().includes('blessing')) continue;
          const value = String(quote[key] || '').replace(/\s+/g, ' ').trim();
          if (value) return value;
        }
      }
      return "Today's blessing is still being stitched.";
    }

    getQuiltReflectionPromptText(quote) {
      const prompt = [
        quote?.communityPrompt,
        quote?.community_prompt,
        quote?.reflectionPrompt,
        quote?.reflection_prompt
      ]
        .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
        .find(Boolean) || '';
      return prompt || '[Reflection prompt coming soon for this quote.]';
    }

    getQuiltFortuneColors() {
      const colors = [];
      const pushColor = (color) => {
        const value = String(color || '').trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) colors.push(value);
      };
      (this.quiltEngine?.blocks || []).forEach((block) => {
        pushColor(block?.color);
        pushColor(block?.insetInnerColor);
        pushColor(block?.hstColorB);
        if (Array.isArray(block?.polygonPieces)) {
          block.polygonPieces.forEach((piece) => pushColor(piece?.color));
        }
      });
      if (!colors.length) {
        colors.push(CONFIG.APP.defaultColor, '#e7d8bc', '#c7b299', '#f6f4f1');
      }
      return Array.from({ length: 16 }, (_, i) => colors[i % colors.length]);
    }

    getQuiltFortuneBackingColor(colors) {
      const palette = Array.isArray(colors) && colors.length ? colors : [CONFIG.APP.defaultColor];
      const popularColor = this.getMostPopularQuiltColor()?.color;
      let source = String(popularColor || '').trim();
      const seed = Utils.hashStringToUint(`${Utils.getTodayKey()}:fortune-backing:${palette.join('|')}`);
      if (!/^#[0-9A-Fa-f]{6}$/.test(source)) {
        source = String(palette[seed % palette.length] || CONFIG.APP.defaultColor).trim();
      }
      if (!/^#[0-9A-Fa-f]{6}$/.test(source)) source = CONFIG.APP.defaultColor;
      const hsv = Utils.hexToHsv(source);
      return Utils.hsvToHex(
        hsv.h,
        Math.max(10, Math.min(34, hsv.s * 0.38)),
        Math.max(88, Math.min(97, hsv.v + (100 - hsv.v) * 0.78))
      );
    }

    getQuiltFortuneContainerColor(colors) {
      const palette = Array.isArray(colors) && colors.length ? colors : [CONFIG.APP.defaultColor];
      const popularColor = this.getMostPopularQuiltColor()?.color;
      const candidates = [];
      const addCandidate = (color, weight = 0) => {
        const value = String(color || '').trim();
        if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return;
        candidates.push({ color: value, hsv: Utils.hexToHsv(value), weight });
      };
      (this.getQuiltPaletteSummary()?.palette || []).forEach((item, index) => {
        addCandidate(item?.color, (Number(item?.count) || 0) + Math.max(0, 12 - index));
      });
      palette.forEach((color) => addCandidate(color));
      addCandidate(popularColor, 2);
      if (!candidates.length) addCandidate(CONFIG.APP.defaultColor);

      const selected = candidates
        .sort((a, b) =>
          b.hsv.s - a.hsv.s ||
          b.weight - a.weight ||
          Math.abs(72 - a.hsv.v) - Math.abs(72 - b.hsv.v)
        )[0];
      const hsv = selected?.hsv || Utils.hexToHsv(CONFIG.APP.defaultColor);
      return Utils.hsvToHex(
        hsv.h,
        Math.max(68, Math.min(96, hsv.s + 10)),
        Math.max(46, Math.min(82, hsv.v))
      );
    }

    getContrastingQuiltColorExcludingDominant() {
      const popularColor = String(this.getMostPopularQuiltColor()?.color || '').trim();
      const colors = [];
      const addColor = (color) => {
        const value = String(color || '').trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(value) && value.toLowerCase() !== popularColor.toLowerCase() && !colors.includes(value)) {
          colors.push(value);
        }
      };
      (this.getQuiltPaletteSummary()?.palette || []).forEach((item) => addColor(item?.color));
      this.getQuiltFortuneColors().forEach(addColor);
      if (!colors.length) {
        const hsv = Utils.hexToHsv(popularColor || CONFIG.APP.defaultColor);
        return Utils.hsvToHex((hsv.h + 180) % 360, Math.max(28, hsv.s * 0.55), Math.max(68, hsv.v));
      }
      const dominantHsv = Utils.hexToHsv(popularColor || colors[0] || CONFIG.APP.defaultColor);
      const hueDistanceFromDominant = (color) => {
        const hue = Utils.hexToHsv(color).h;
        const diff = Math.abs(hue - dominantHsv.h);
        return Math.min(diff, 360 - diff);
      };
      return colors
        .map((color) => ({ color, distance: hueDistanceFromDominant(color) }))
        .sort((a, b) => b.distance - a.distance)[0]?.color || colors[0] || CONFIG.APP.defaultColor;
    }

    getReadableTextColorForHex(hex) {
      const safe = /^#[0-9A-Fa-f]{6}$/.test(String(hex || '').trim()) ? String(hex).trim() : '#d8c1a4';
      const r = parseInt(safe.slice(1, 3), 16);
      const g = parseInt(safe.slice(3, 5), 16);
      const b = parseInt(safe.slice(5, 7), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.56 ? '#241b14' : '#fff8ef';
    }

    revokeQuiltFortuneFrontObjectUrl() {
      if (!this._quiltFortuneFrontObjectUrl) return;
      try {
        URL.revokeObjectURL(this._quiltFortuneFrontObjectUrl);
      } catch (_) {
        /* ignore */
      }
      this._quiltFortuneFrontObjectUrl = null;
    }

    revokeQuiltMoodCardObjectUrl() {
      if (!this._quiltMoodCardObjectUrl) return;
      try {
        URL.revokeObjectURL(this._quiltMoodCardObjectUrl);
      } catch (_) {
        /* ignore */
      }
      this._quiltMoodCardObjectUrl = null;
    }

    async refreshQuiltFortuneFrontImage() {
      const img = document.getElementById('quiltFortuneFrontImg');
      if (!img || this.isDesktopRedirect) return;
      const gen = ++this._quiltFortuneFrontGeneration;
      try {
        const blob = await this.getHighResQuiltBlobForShare();
        if (gen !== this._quiltFortuneFrontGeneration) return;
        const url = URL.createObjectURL(blob);
        this.revokeQuiltFortuneFrontObjectUrl();
        this._quiltFortuneFrontObjectUrl = url;
        img.onload = () => {
          if (gen === this._quiltFortuneFrontGeneration) img.hidden = false;
        };
        img.onerror = () => {
          if (gen === this._quiltFortuneFrontGeneration) img.hidden = true;
        };
        img.src = url;
        if (img.complete && img.naturalWidth > 0) img.hidden = false;
      } catch (error) {
        img.hidden = true;
        this.logger?.warn?.('Quilt fortune front image failed:', error);
      }
    }

    /** Non-cut speaker portrait URL for mood-card newspaper backs. */
    _moodCardSpeakerPortraitUrl(quote = null) {
      const q = quote || this.quoteService?.getTodayQuote?.() || null;
      if (!q) return '';
      const profile = this.getQuoteSpeakerProfile(q);
      let portrait = String(profile?.portraitUrl || '').trim();
      if (portrait && /speaker-cutouts(?:%2F|\/)/i.test(portrait)) portrait = '';
      if (!portrait && this.archiveService?._layoutBSpeakerPortraitUrl) {
        portrait = this.normalizeQuoteSpeakerImageUrl(this.archiveService._layoutBSpeakerPortraitUrl(q));
      }
      if (portrait && /speaker-cutouts(?:%2F|\/)/i.test(portrait)) portrait = '';
      return portrait;
    }

    async refreshQuiltMoodCardImages() {
      const widget = document.getElementById('quiltMoodWidget');
      if (!widget || this.isDesktopRedirect) return;
      const imgs = widget.querySelectorAll('.quilt-mood-widget__speaker-img');
      if (!imgs.length) return;
      const gen = ++this._quiltMoodCardGeneration;
      const quote = this._quoteForMoodWidget();
      const portraitRaw = this._moodCardSpeakerPortraitUrl(quote);
      if (!portraitRaw) {
        imgs.forEach((img) => {
          img.removeAttribute('src');
          img.classList.remove('is-loaded');
          img.setAttribute('hidden', 'hidden');
        });
        return;
      }
      try {
        let src = portraitRaw;
        const prepare = this.archiveService?._prepareSpeakerImageUrlForCanvas?.bind(this.archiveService);
        if (prepare) {
          src =
            (await prepare(portraitRaw, { fallbackUrl: '' })) ||
            portraitRaw;
        }
        if (!src || gen !== this._quiltMoodCardGeneration) return;
        imgs.forEach((img) => {
          const reveal = () => {
            if (gen !== this._quiltMoodCardGeneration) return;
            img.classList.add('is-loaded');
            img.removeAttribute('hidden');
          };
          img.onload = reveal;
          img.onerror = () => {
            if (gen === this._quiltMoodCardGeneration) {
              img.classList.remove('is-loaded');
              img.setAttribute('hidden', 'hidden');
            }
          };
          img.classList.remove('is-loaded');
          img.src = src;
          if (img.complete && img.naturalWidth > 0) reveal();
        });
      } catch (error) {
        imgs.forEach((img) => {
          img.classList.remove('is-loaded');
          img.setAttribute('hidden', 'hidden');
        });
        this.logger?.warn?.('Quilt mood card speaker clips failed:', error);
      }
    }

    getQuoteSpeakerField(quote, keys) {
      if (!quote || typeof quote !== 'object') return '';
      for (const key of keys) {
        const value = quote[key];
        if (value == null) continue;
        const text = String(value).replace(/\s+/g, ' ').trim();
        if (text) return text;
      }
      return '';
    }

    normalizeQuoteSpeakerImageUrl(value) {
      const url = String(value || '').trim();
      if (!url) return '';
      if (/^javascript:/i.test(url)) return '';
      if (/^data:/i.test(url) && !/^data:image\//i.test(url)) return '';
      // Only allow real, loadable image references. Notion/server backfill
      // sometimes writes placeholder strings like "needs manual lookup"
      // for missing portraits — those would otherwise be resolved as
      // relative file paths and trigger ERR_FILE_NOT_FOUND in the console.
      if (!/^(https?:|data:image\/|blob:|\/|\.{1,2}\/)/i.test(url)) return '';
      return url;
    }

    quoteHasSpeakerImageAttribute(quote) {
      return !!this.normalizeQuoteSpeakerImageUrl(
        this.getQuoteSpeakerField(quote, [
          'speakerImageUrlSnapshot',
          'speaker_image_url_snapshot',
          'speakerImageUrl',
          'speaker_image_url',
          'speakerImage',
          'speaker_image',
          'speakerCutoutUrlSnapshot',
          'speaker_cutout_url_snapshot',
          'speakerCutoutUrl',
          'speaker_cutout_url'
        ])
      );
    }

    getQuoteSpeakerProfile(quote) {
      const rawAuthor = this.getQuoteSpeakerField(quote, ['author', 'authorSnapshot']);
      const name = this.getQuoteSpeakerField(quote, ['speakerName', 'speaker_name']) ||
        rawAuthor.replace(/^\s*[—-]\s*/, '').trim();
      let portraitUrl = this.normalizeQuoteSpeakerImageUrl(
        this.getQuoteSpeakerField(quote, [
          'speakerImageUrlSnapshot',
          'speaker_image_url_snapshot',
          'speakerImageUrl',
          'speaker_image_url',
          'speakerImage',
          'speaker_image',
          'portraitUrl',
          'portrait_url',
          'imageUrl',
          'image_url'
        ])
      );
      if (!portraitUrl && this.quoteService?._speakerPortraitFromQuoteAndAssignment) {
        portraitUrl = this.normalizeQuoteSpeakerImageUrl(
          this.quoteService._speakerPortraitFromQuoteAndAssignment(quote)
        );
      }
      if (!portraitUrl && this.archiveService?._layoutBSpeakerPortraitUrl) {
        portraitUrl = this.normalizeQuoteSpeakerImageUrl(this.archiveService._layoutBSpeakerPortraitUrl(quote));
      }
      if (portraitUrl && /speaker-cutouts(?:%2F|\/)/i.test(portraitUrl)) portraitUrl = '';
      let cutoutUrl = this.quoteService
        ? this.normalizeQuoteSpeakerImageUrl(this.quoteService._resolveSpeakerCutoutForQuote(quote))
        : this.normalizeQuoteSpeakerImageUrl(
            this.getQuoteSpeakerField(quote, [
              'speakerCutoutUrl',
              'speaker_cutout_url',
              'speakerCutoutUrlSnapshot',
              'speaker_cutout_url_snapshot'
            ])
          );
      // Gating only — widget load uses the same resolver as Layout B story (cutout before portrait).
      const imageUrl = portraitUrl || cutoutUrl;
      const explicitDates = this.getQuoteSpeakerField(quote, ['speakerDates', 'speaker_dates', 'dates', 'speakerDatesSnapshot']);
      const born = this.getQuoteSpeakerField(quote, ['speakerBorn', 'speaker_born', 'born', 'speakerBornSnapshot']);
      const died = this.getQuoteSpeakerField(quote, ['speakerDied', 'speaker_died', 'died', 'speakerDiedSnapshot']);
      const guideLine = this.getQuoteSpeakerField(quote, [
        'speakerGuideLine',
        'speaker_guide_line',
        'guideLine',
        'guide_line',
        'whyGoodGuide',
        'why_good_guide',
        'speakerGuideLineSnapshot'
      ]);
      const speakerKeywords = this.getQuoteSpeakerField(quote, [
        'speakerKeywords',
        'speaker_keywords',
        'speakerKeyword',
        'speaker_keyword',
        'speakerKeywordsSnapshot'
      ]);
      const imageAttribution = this.getQuoteSpeakerField(quote, [
        'imageAttribution',
        'image_attribution',
        'imageCredit',
        'image_credit',
        'photoCredit',
        'photo_credit',
        'imageAttributionSnapshot'
      ]);
      const dates = explicitDates || (born && died ? `${born} - ${died}` : born ? `born ${born}` : died ? `died ${died}` : '');
      if (!name) return null;
      return { name, imageUrl, portraitUrl, cutoutUrl, dates, guideLine, speakerKeywords, imageAttribution };
    }

    getQuoteSpeakerInitials(name) {
      const words = String(name || '')
        .replace(/[—-]/g, ' ')
        .split(/\s+/)
        .map((word) => word.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, ''))
        .filter(Boolean);
      if (!words.length) return '?';
      const first = words[0][0] || '';
      const last = words.length > 1 ? words[words.length - 1][0] || '' : '';
      return `${first}${last}`.toUpperCase();
    }

    formatQuoteSpeakerImageAttribution(attribution) {
      const value = String(attribution || '').trim();
      if (!value) return '';
      return value.replace(/^image\s*:\s*/i, '').trim();
    }

    _quoteSpeakerAttributionFontSizePx() {
      const rootRem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      return Math.max(7, 0.58 * 1.1 * rootRem);
    }

    _quoteSpeakerShouldStripFringe(url) {
      const u = String(url || '').trim();
      return /speaker-cutouts(?:%2F|\/)/i.test(u);
    }

    /** Storage PNG cutout — not a plain Wikimedia portrait (drives single-layer pop-art stack). */
    _quoteSpeakerIsFirebaseCutoutPaint({
      paintUrl = '',
      remoteUrl = '',
      displayUrl = '',
      cutoutSourceUrl = '',
      profile = null,
      quote = null
    } = {}) {
      const urls = [
        cutoutSourceUrl,
        remoteUrl,
        paintUrl,
        displayUrl,
        profile?.cutoutUrl,
        profile?.portraitUrl,
        profile?.imageUrl,
        quote?.speakerCutoutUrl,
        quote?.speaker_cutout_url,
        quote?.speakerCutoutUrlSnapshot,
        quote?.speaker_cutout_url_snapshot
      ];
      if (urls.some((u) => this._quoteSpeakerShouldStripFringe(u))) return true;
      if (!quote) return false;
      const cutoutField = this.normalizeQuoteSpeakerImageUrl(
        this.getQuoteSpeakerField(quote, [
          'speakerCutoutUrlSnapshot',
          'speaker_cutout_url_snapshot',
          'speakerCutoutUrl',
          'speaker_cutout_url'
        ])
      );
      return this._quoteSpeakerShouldStripFringe(cutoutField);
    }

    _quoteSpeakerPopArtEnabled() {
      return globalThis.CONFIG?.APP?.speakerPopArtEnabled === true;
    }

    _quoteSpeakerWantsFirebasePopArt(profile, quote, extraUrl = '') {
      if (!this._quoteSpeakerPopArtEnabled()) return false;
      const widget = document.getElementById('quoteSpeakerWidget');
      if (widget?.dataset?.firebaseSpeakerCutout === '1') return true;
      return this._quoteSpeakerIsFirebaseCutoutPaint({
        cutoutSourceUrl: extraUrl,
        profile,
        quote
      });
    }

    /** file://, capacitor://, and null origin cannot read cross-origin pixels — proxy or display-only. */
    _quoteSpeakerCanvasPipelineBlocked() {
      if (typeof location === 'undefined') return true;
      const origin = String(location.origin || '').trim();
      const protocol = String(location.protocol || '').trim();
      if (!origin || origin === 'null' || protocol === 'file:') return true;
      if (protocol === 'capacitor:' || /^capacitor:/i.test(String(location.href || ''))) return true;
      try {
        if (typeof globalThis.odqIsCapacitorNative === 'function' && globalThis.odqIsCapacitorNative()) {
          return true;
        }
        if (globalThis.Utils?.getClientPlatformLabel?.() === 'capacitor-ios') return true;
      } catch (_) {
        /* */
      }
      return false;
    }

    /** Proxied data: URLs are same-origin — safe for canvas composite even on Capacitor. */
    _quoteSpeakerCanCanvasProcessImage(sourceImg, cutout, portraitImg) {
      const urls = [
        sourceImg?.src,
        sourceImg?.currentSrc,
        portraitImg?.src,
        portraitImg?.currentSrc,
        cutout?._plainCutoutSourceUrl
      ];
      if (urls.some((u) => /^data:/i.test(String(u || '').trim()))) return true;
      return !this._quoteSpeakerCanvasPipelineBlocked();
    }

    _loadQuoteSpeakerImageElement(url) {
      const src = String(url || '').trim();
      if (!src) return Promise.resolve(null);
      return new Promise((resolve) => {
        const img = new Image();
        if (/^https?:\/\//i.test(src) && !this._quoteSpeakerCanvasPipelineBlocked()) {
          img.crossOrigin = 'anonymous';
        }
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }

    /** Fresh decode for canvas — never trust naturalWidth on an <img> whose src just changed. */
    async _ensureQuoteSpeakerImageForCanvas(url) {
      const src = String(url || '').trim();
      if (!src) return null;
      const img = await this._loadQuoteSpeakerImageElement(src);
      return img?.naturalWidth ? img : null;
    }

    _quoteSpeakerPixelIsWhiteMatte(r, g, b, a) {
      if (a < 64) return false;
      const lum = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      return lum > 228 && sat < 38;
    }

    _quoteSpeakerPixelIsGreyHalo(r, g, b, a) {
      if (a < 48) return false;
      const lum = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      return lum > 88 && lum < 238 && sat < 52 && a < 252;
    }

    _quoteSpeakerInMarginBand(x, y, w, h) {
      return x < w * 0.2 || x > w * 0.8 || y < h * 0.1 || y > h * 0.9;
    }

    _quoteSpeakerPixelIsFillable(r, g, b, a) {
      if (a < 52) return false;
      return !this._quoteSpeakerPixelIsGreyHalo(r, g, b, a);
    }

    _quoteSpeakerPixelIsSubject(r, g, b, a) {
      if (a < 52) return false;
      return !this._quoteSpeakerPixelIsWhiteMatte(r, g, b, a) && !this._quoteSpeakerPixelIsGreyHalo(r, g, b, a);
    }

    /**
     * Keep only the subject blob connected to the portrait center — drops remove.bg polygon mattes.
     */
    _quoteSpeakerMaskSubjectComponent(d, iw, ih) {
      const keep = new Uint8Array(iw * ih);
      const x0 = Math.floor(iw * 0.22);
      const x1 = Math.ceil(iw * 0.78);
      const y0 = Math.floor(ih * 0.12);
      const y1 = Math.ceil(ih * 0.92);
      let seedX = -1;
      let seedY = -1;
      let bestLum = 999;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * iw + x) * 4;
          if (!this._quoteSpeakerPixelIsFillable(d[i], d[i + 1], d[i + 2], d[i + 3])) continue;
          const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (lum < bestLum) {
            bestLum = lum;
            seedX = x;
            seedY = y;
          }
        }
      }
      if (seedX < 0) return false;
      const queue = [[seedX, seedY]];
      keep[seedY * iw + seedX] = 1;
      const neighbors = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ];
      while (queue.length) {
        const [x, y] = queue.pop();
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
          const idx = ny * iw + nx;
          if (keep[idx]) continue;
          const i = idx * 4;
          if (!this._quoteSpeakerPixelIsFillable(d[i], d[i + 1], d[i + 2], d[i + 3])) continue;
          keep[idx] = 1;
          queue.push([nx, ny]);
        }
      }
      for (let y = 0; y < ih; y += 1) {
        for (let x = 0; x < iw; x += 1) {
          const i = (y * iw + x) * 4;
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const a = d[i + 3];
          let drop = seedX >= 0 && !keep[y * iw + x];
          if (
            !drop &&
            this._quoteSpeakerInMarginBand(x, y, iw, ih) &&
            (this._quoteSpeakerPixelIsGreyHalo(r, g, b, a) ||
              this._quoteSpeakerPixelIsWhiteMatte(r, g, b, a))
          ) {
            drop = true;
          }
          if (drop) d[i + 3] = 0;
        }
      }
      return true;
    }

    _quoteSpeakerStripFringeFromImageElement(img) {
      const iw = Math.max(1, img?.naturalWidth || 0);
      const ih = Math.max(1, img?.naturalHeight || 0);
      if (!iw || !ih) return '';
      const canvas = document.createElement('canvas');
      canvas.width = iw;
      canvas.height = ih;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return '';
      ctx.drawImage(img, 0, 0, iw, ih);
      let imageData;
      try {
        imageData = ctx.getImageData(0, 0, iw, ih);
      } catch (_) {
        return '';
      }
      const d = imageData.data;
      if (!this._quoteSpeakerMaskSubjectComponent(d, iw, ih)) return '';
      ctx.putImageData(imageData, 0, 0);
      try {
        return canvas.toDataURL('image/png');
      } catch (_) {
        return '';
      }
    }

    async _quoteSpeakerCleanCutoutDisplayUrl(url, quote = null) {
      const src = String(url || '').trim();
      if (!src || !this._quoteSpeakerShouldStripFringe(src)) return src;
      if (this._quoteSpeakerCanvasPipelineBlocked()) return src;
      const tryClean = async (loadUrl) => {
        const img = await this._loadQuoteSpeakerImageElement(loadUrl);
        if (!img?.naturalWidth) return '';
        return this._quoteSpeakerStripFringeFromImageElement(img);
      };
      let cleaned = await tryClean(src);
      if (!cleaned && this.archiveService?._prepareSpeakerImageUrlForCanvas) {
        try {
          const proxied = await this.archiveService._prepareSpeakerImageUrlForCanvas(src, { quote });
          if (proxied && proxied !== src) cleaned = await tryClean(proxied);
        } catch (_) {
          /* ignore */
        }
      }
      return cleaned || src;
    }

    /** Scan cutout alpha — maps to natural pixels (used for vertical anchor). */
    _quoteSpeakerMeasureOpaqueBounds(img) {
      const iw = img?.naturalWidth;
      const ih = img?.naturalHeight;
      if (!iw || !ih) return null;
      const scanW = Math.min(256, iw);
      const scanH = Math.max(1, Math.round(ih * (scanW / iw)));
      const canvas = document.createElement('canvas');
      canvas.width = scanW;
      canvas.height = scanH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, scanW, scanH);
      let data;
      try {
        data = ctx.getImageData(0, 0, scanW, scanH).data;
      } catch (_) {
        return null;
      }
      let minX = scanW;
      let minY = scanH;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < scanH; y += 1) {
        for (let x = 0; x < scanW; x += 1) {
          if (data[(y * scanW + x) * 4 + 3] <= 28) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX || maxY < minY) return null;
      const sx = iw / scanW;
      const sy = ih / scanH;
      const width = (maxX - minX + 1) * sx;
      const height = (maxY - minY + 1) * sy;
      return {
        minX: minX * sx,
        minY: minY * sy,
        maxX: maxX * sx,
        maxY: maxY * sy,
        width,
        height
      };
    }

    /** Natural frame height when the cutout is width-filled to boxW. */
    _quoteSpeakerCutoutFrameHeight(naturalW, naturalH, boxW) {
      const iw = Math.max(1, naturalW);
      const ih = Math.max(1, naturalH);
      return Math.ceil((ih * Math.max(1, boxW)) / iw);
    }

    /** Width-fill in a portrait-shaped frame (boxH from image aspect, not 1:1). */
    _quoteSpeakerCutoutFraming(naturalW, naturalH, boxW, boxH, bounds = null) {
      const iw = Math.max(1, naturalW);
      const ih = Math.max(1, naturalH);
      const scale = boxW / iw;
      const drawW = boxW;
      const drawH = ih * scale;
      const offsetX = 0;
      if (!bounds?.height) {
        return {
          offsetX,
          offsetY: Math.max(0, (boxH - drawH) / 2),
          drawW,
          drawH,
          scale
        };
      }
      const padTop = 8;
      const padBottom = 0;
      const downNudge = 28;
      let offsetY = padTop - bounds.minY * scale + downNudge;
      const maxOffset = padTop + downNudge;
      const minOffset = boxH - drawH - padBottom;
      offsetY = Math.min(maxOffset, Math.max(minOffset, offsetY));
      return { offsetX, offsetY, drawW, drawH, scale };
    }

    _quoteSpeakerImageContainRect(naturalW, naturalH, boxW, boxH, bounds = null) {
      return this._quoteSpeakerCutoutFraming(naturalW, naturalH, boxW, boxH, bounds);
    }

    _applyQuoteSpeakerCutoutAnchor(imageWrap, img) {
      if (!imageWrap || !img?.naturalWidth) return;
      const wrap = imageWrap.closest('.quote-speaker-portrait-wrap');
      const boxW = Math.max(
        1,
        Math.round(imageWrap.clientWidth || wrap?.clientWidth || 0)
      );
      if (boxW < 48) return;
      const bounds = this._quoteSpeakerMeasureOpaqueBounds(img);
      imageWrap._speakerOpaqueBounds = bounds;
      const naturalFrameH = this._quoteSpeakerCutoutFrameHeight(
        img.naturalWidth,
        img.naturalHeight,
        boxW
      );
      if (!bounds) {
        const drawW = boxW;
        const drawH = naturalFrameH;
        const frameH = Math.max(120, Math.ceil(drawH + 8));
        imageWrap.style.height = `${frameH}px`;
        imageWrap.style.setProperty('--speaker-cutout-pos-x', '0px');
        imageWrap.style.setProperty('--speaker-cutout-pos-y', '0px');
        imageWrap.style.setProperty('--speaker-cutout-bg-w', `${drawW}px`);
        imageWrap.style.setProperty('--speaker-cutout-bg-h', `${drawH}px`);
        this._pinQuoteSpeakerSingleLayerOverlays(imageWrap);
        return;
      }
      const draftH = Math.max(120, naturalFrameH + 32);
      let { offsetX, offsetY, drawW, drawH } = this._quoteSpeakerCutoutFraming(
        img.naturalWidth,
        img.naturalHeight,
        boxW,
        draftH,
        bounds
      );
      const frameH = Math.max(120, Math.ceil(offsetY + drawH + 4));
      if (frameH !== draftH) {
        ({ offsetX, offsetY, drawW, drawH } = this._quoteSpeakerCutoutFraming(
          img.naturalWidth,
          img.naturalHeight,
          boxW,
          frameH,
          bounds
        ));
      }
      imageWrap.style.height = `${frameH}px`;
      imageWrap.style.setProperty('--speaker-cutout-pos-x', `${offsetX}px`);
      imageWrap.style.setProperty('--speaker-cutout-pos-y', `${offsetY}px`);
      imageWrap.style.setProperty('--speaker-cutout-bg-w', `${drawW}px`);
      imageWrap.style.setProperty('--speaker-cutout-bg-h', `${drawH}px`);
      this._pinQuoteSpeakerSingleLayerOverlays(imageWrap);
    }

    /** Single-layer pop-art overlays need explicit px boxes — CSS `height: auto` collapses to 0. */
    _pinQuoteSpeakerSingleLayerOverlays(cutout) {
      if (!cutout?.classList.contains('quote-speaker-cutout--single-layer')) return;
      const computed = typeof getComputedStyle === 'function' ? getComputedStyle(cutout) : null;
      const readPx = (name, fallback = '') => {
        const raw = String(
          cutout.style.getPropertyValue(name) ||
            computed?.getPropertyValue(name) ||
            ''
        ).trim();
        if (!raw) return fallback;
        const n = parseFloat(raw.replace(/px$/, ''));
        return Number.isFinite(n) && n > 0 ? `${n}px` : raw || fallback;
      };
      const left = readPx('--speaker-cutout-pos-x', '0px');
      const top = readPx('--speaker-cutout-pos-y', '0px');
      const width = readPx('--speaker-cutout-bg-w', `${Math.max(1, cutout.clientWidth)}px`);
      const frameH = Math.max(
        1,
        Math.round(parseFloat(cutout.style.height) || cutout.clientHeight || parseFloat(width) || 1)
      );
      const height = readPx('--speaker-cutout-bg-h', `${frameH}px`);
      if (!width || !height) return;
      const pin = (el) => {
        if (!el) return;
        el.style.left = left;
        el.style.top = top;
        el.style.width = width;
        el.style.height = height;
      };
      pin(cutout.querySelector('.quote-speaker-color-wash'));
      pin(cutout.querySelector('.quote-speaker-paper-layer'));
      pin(cutout.querySelector('.quote-speaker-paper-shape--backdrop'));
      pin(cutout.querySelector('.quote-speaker-xerox-grain'));
      pin(cutout.querySelector('.quote-speaker-contour'));
    }

    _clearQuoteSpeakerSingleLayerOverlayPins(cutout) {
      if (!cutout) return;
      const clear = (el) => {
        if (!el) return;
        el.style.removeProperty('left');
        el.style.removeProperty('top');
        el.style.removeProperty('width');
        el.style.removeProperty('height');
      };
      clear(cutout.querySelector('.quote-speaker-color-wash'));
      clear(cutout.querySelector('.quote-speaker-paper-layer'));
      clear(cutout.querySelector('.quote-speaker-paper-shape--backdrop'));
      clear(cutout.querySelector('.quote-speaker-xerox-grain'));
      clear(cutout.querySelector('.quote-speaker-contour'));
    }

    _syncQuoteSpeakerCutoutLayoutOnly(cutout, img) {
      if (!cutout || cutout.hidden || !img?.naturalWidth) return;
      this._applyQuoteSpeakerCutoutAnchor(cutout, img);
      if (cutout.classList.contains('quote-speaker-cutout--plain-cutout')) {
        this._applyQuoteSpeakerPlainCutoutBacking(cutout, img);
      }
      if (cutout.classList.contains('quote-speaker-cutout--single-layer')) {
        this._pinQuoteSpeakerSingleLayerOverlays(cutout);
      }
    }

    _syncQuoteSpeakerCutoutLayout(cutout, img, quote = null) {
      if (!cutout || cutout.hidden || !img) return;
      const run = (layoutOnly = false) => {
        if (!img.naturalWidth) return;
        const resolvedQuote =
          quote || this.getEffectiveQuiltQuote?.() || this.quoteService?.getTodayQuote?.() || null;
        const profile = this.getQuoteSpeakerProfile(resolvedQuote);
        if (layoutOnly) {
          this._syncQuoteSpeakerCutoutLayoutOnly(cutout, img);
          return;
        }
        if (this._quoteSpeakerWantsFirebasePopArt(profile, resolvedQuote)) {
          this._finalizeQuoteSpeakerPopArtStack(cutout, img, resolvedQuote);
        } else if (
          !this._quoteSpeakerPopArtEnabled() &&
          this._quoteSpeakerIsFirebaseCutoutPaint({ profile, quote: resolvedQuote })
        ) {
          this._applyQuoteSpeakerPlainCutoutStack(cutout, img);
        } else {
          const widget = document.getElementById('quoteSpeakerWidget');
          this._applyQuoteSpeakerCutoutAnchor(cutout, img);
          if (widget) this._applyQuoteSpeakerWidgetWashVars(widget);
          this._applyQuoteSpeakerCutoutRenderPlan(cutout);
          this._applyQuoteSpeakerHandCut(
            cutout,
            widget?.dataset.handCutDateKey || '',
            'speaker-cutout'
          );
        }
        const attributionEl = document.getElementById('quoteSpeakerAttribution');
        if (attributionEl && !attributionEl.hidden) {
          this._scheduleQuoteSpeakerAttributionLayout(attributionEl, img, cutout);
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!img.naturalWidth || cutout.hidden) return;
            this._syncQuoteSpeakerCutoutLayoutOnly(cutout, img);
          });
        });
      };
      if (img.complete && img.naturalWidth) run(false);
      else img.addEventListener('load', () => run(false), { once: true });
    }

    _quoteSpeakerSilhouetteRightEdge(img, boxW, boxH, bounds = null) {
      if (!img?.naturalWidth || !img?.naturalHeight) return null;
      const canvas = document.createElement('canvas');
      canvas.width = boxW;
      canvas.height = boxH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      const { offsetX, offsetY, drawW, drawH, scale } = this._quoteSpeakerImageContainRect(
        img.naturalWidth,
        img.naturalHeight,
        boxW,
        boxH,
        bounds
      );
      ctx.clearRect(0, 0, boxW, boxH);
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
      let data;
      try {
        data = ctx.getImageData(0, 0, boxW, boxH).data;
      } catch (_) {
        return null;
      }
      const rowHasOpaque = (y) => {
        for (let x = 0; x < boxW; x += 1) {
          if (data[(y * boxW + x) * 4 + 3] > 28) return true;
        }
        return false;
      };
      let yStart = 0;
      let yEnd = boxH - 1;
      if (bounds?.height) {
        yStart = Math.max(0, Math.floor(offsetY + bounds.minY * scale) - 1);
        yEnd = Math.min(boxH - 1, Math.ceil(offsetY + bounds.maxY * scale) + 1);
      } else {
        while (yStart < boxH && !rowHasOpaque(yStart)) yStart += 1;
        while (yEnd > yStart && !rowHasOpaque(yEnd)) yEnd -= 1;
      }
      if (yEnd <= yStart) return null;
      const step = Math.max(1, Math.round((yEnd - yStart) / 140));
      const points = [];
      for (let y = yStart; y <= yEnd; y += step) {
        let rightX = -1;
        for (let x = boxW - 1; x >= 0; x -= 1) {
          if (data[(y * boxW + x) * 4 + 3] > 28) {
            rightX = x;
            break;
          }
        }
        if (rightX >= 0) points.push({ x: rightX, y });
      }
      if (points.length < 3) return null;
      const window = Math.min(5, Math.floor(points.length / 8) || 1);
      return points.map((p, i) => {
        let sum = 0;
        let count = 0;
        for (let j = i - window; j <= i + window; j += 1) {
          if (points[j]) {
            sum += points[j].x;
            count += 1;
          }
        }
        return { x: sum / count, y: p.y };
      });
    }

    _quoteSpeakerSilhouetteCaptionPath(points) {
      if (!points?.length) return '';
      const pts = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`);
      return `M ${pts[0]} L ${pts.slice(1).join(' L ')}`;
    }

    _quoteSpeakerAttributionNameCardClearancePx(wrap) {
      if (!wrap) return 0;
      const identitySlab = document.getElementById('quoteSpeakerIdentitySlab');
      if (!identitySlab || identitySlab.hidden) return 0;
      const wrapRect = wrap.getBoundingClientRect();
      const slabRect = identitySlab.getBoundingClientRect();
      const gap = 8;
      const overlapPx = wrapRect.bottom - slabRect.top - gap;
      if (!Number.isFinite(overlapPx) || overlapPx <= 0) return 0;
      return Math.min(overlapPx, wrapRect.height * 0.5);
    }

    _applyQuoteSpeakerAttributionLift(attributionEl, wrap, clearancePx) {
      if (!attributionEl) return;
      const lift = Math.max(0, Number(clearancePx) || 0);
      if (lift > 0) {
        attributionEl.style.setProperty('--quote-speaker-attribution-lift', `${lift}px`);
      } else {
        attributionEl.style.removeProperty('--quote-speaker-attribution-lift');
      }
    }

    _quoteSpeakerAttributionBottomEdge(edge, img, boxW, boxH, text, fontSize, wrap, bounds = null) {
      if (!edge?.length) return null;
      const { offsetY, drawH, offsetX, drawW } = this._quoteSpeakerImageContainRect(
        img.naturalWidth,
        img.naturalHeight,
        boxW,
        boxH,
        bounds
      );
      const imageBottom = offsetY + drawH;
      const lineHeight = fontSize * 1.4;
      const colWidth = fontSize * 1.1;
      const maxCols = 3;
      const edgeSpan = edge[edge.length - 1].y - edge[0].y;
      const charsPerCol = Math.max(1, Math.floor(edgeSpan / lineHeight));
      const columns = [];
      for (let i = 0; i < text.length && columns.length < maxCols; i += charsPerCol) {
        columns.push(text.slice(i, i + charsPerCol));
      }
      const longestCol = columns.reduce((max, col) => Math.max(max, col.length), 0);
      const neededHeight = Math.max(lineHeight * longestCol, lineHeight * 2.5);
      const clearancePx = this._quoteSpeakerAttributionNameCardClearancePx(wrap);
      const hugGap = Math.max(2, fontSize * 0.12);
      const maxBottomY = Math.max(
        edge[0].y + neededHeight,
        Math.min(boxH - 1, imageBottom - hugGap - clearancePx)
      );
      const cornerY = maxBottomY;
      const minY = Math.max(edge[0].y, cornerY - neededHeight - fontSize * 0.2);
      let segment = edge.filter((p) => p.y >= minY && p.y <= cornerY + 1);
      if (segment.length < 2) {
        segment = edge.filter((p) => p.y <= cornerY + 1).slice(-Math.max(2, Math.min(10, edge.length)));
      }

      /* Stay on the scanned silhouette edge — do not pull toward full PNG width. */
      segment = segment.map((p) => ({ x: p.x, y: Math.min(p.y, cornerY) }));
      const last = segment[segment.length - 1];
      const bottomX = last?.x ?? segment[0]?.x ?? hugGap;
      if (!last || last.y < cornerY - 1) {
        segment.push({ x: bottomX, y: cornerY });
      } else {
        segment[segment.length - 1] = { x: bottomX, y: cornerY };
      }
      return { segment, columns, colWidth, hugGap, clearancePx };
    }

    _setQuoteSpeakerAttributionFallback(attributionEl, text, wrap) {
      attributionEl.classList.add('quote-speaker-attribution--fallback');
      attributionEl.textContent = text;
      const portraitWrap = wrap || attributionEl.closest('.quote-speaker-portrait-wrap');
      this._applyQuoteSpeakerAttributionLift(
        attributionEl,
        portraitWrap,
        this._quoteSpeakerAttributionNameCardClearancePx(portraitWrap)
      );
    }

    _layoutQuoteSpeakerAttributionAlongSilhouette(attributionEl, imgEl, cutoutEl) {
      if (!attributionEl || attributionEl.hidden) return;
      const text = String(attributionEl.dataset.attributionText || '').trim();
      if (!text) {
        attributionEl.replaceChildren();
        attributionEl.classList.remove('quote-speaker-attribution--fallback');
        return;
      }
      const wrap = attributionEl.closest('.quote-speaker-portrait-wrap');
      const cutout = cutoutEl || document.getElementById('quoteSpeakerImageWrap');
      const img = imgEl || cutout?.querySelector('.quote-speaker-image');
      if (!wrap || !cutout || cutout.hidden) {
        this._setQuoteSpeakerAttributionFallback(attributionEl, text, wrap);
        return;
      }
      const paint = () => {
        if (!img?.src || !img.naturalWidth) {
          this._setQuoteSpeakerAttributionFallback(attributionEl, text, wrap);
          return;
        }
        if (cutout) {
          this._applyQuoteSpeakerCutoutAnchor(cutout, img);
        }
        const boxW = Math.max(
          1,
          Math.round(cutout.clientWidth || wrap.clientWidth)
        );
        const boxH = Math.max(
          1,
          Math.round(cutout.clientHeight || wrap.clientHeight)
        );
        if (boxW < 48 || boxH < 48) {
          this._setQuoteSpeakerAttributionFallback(attributionEl, text, wrap);
          return;
        }
        const bounds = cutout?._speakerOpaqueBounds ?? null;
        const edge = this._quoteSpeakerSilhouetteRightEdge(img, boxW, boxH, bounds);
        if (!edge?.length) {
          this._setQuoteSpeakerAttributionFallback(attributionEl, text, wrap);
          return;
        }
        const fontSize = this._quoteSpeakerAttributionFontSizePx();
        const layout = this._quoteSpeakerAttributionBottomEdge(
          edge,
          img,
          boxW,
          boxH,
          text,
          fontSize,
          wrap,
          bounds
        );
        const { segment, columns, colWidth, hugGap, clearancePx } = layout || {};
        const lineHeight = fontSize * 1.4;
        const segmentSpan =
          segment?.length > 1
            ? segment[segment.length - 1].y - segment[0].y
            : 0;
        if (!segment?.length || !columns?.length || segmentSpan < lineHeight * 0.65) {
          this._setQuoteSpeakerAttributionFallback(attributionEl, text, wrap);
          return;
        }
        this._applyQuoteSpeakerAttributionLift(attributionEl, wrap, clearancePx);

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'quote-speaker-attribution-svg');
        svg.setAttribute('viewBox', `0 0 ${boxW} ${boxH}`);
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('preserveAspectRatio', 'none');

        const defs = document.createElementNS(svgNS, 'defs');
        svg.appendChild(defs);

        columns.forEach((colText, colIdx) => {
          const offsetX = hugGap - colIdx * colWidth;
          const colPoints = segment.map((p) => ({
            x: Math.min(boxW - 2, Math.max(2, p.x + offsetX)),
            y: p.y
          }));
          const pathId = `quoteSpeakerAttrPath${colIdx}`;
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('id', pathId);
          path.setAttribute('d', this._quoteSpeakerSilhouetteCaptionPath(colPoints));
          path.setAttribute('fill', 'none');
          defs.appendChild(path);

          const textEl = document.createElementNS(svgNS, 'text');
          textEl.setAttribute('class', 'quote-speaker-attribution-label');
          textEl.setAttribute('font-size', String(fontSize));
          textEl.setAttribute(
            'font-family',
            "'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
          );
          textEl.setAttribute('fill', 'rgba(47, 39, 31, 0.52)');
          textEl.setAttribute('letter-spacing', '0.03em');
          textEl.setAttribute('text-anchor', 'end');
          textEl.style.textOrientation = 'upright';
          const textPath = document.createElementNS(svgNS, 'textPath');
          textPath.setAttribute('href', `#${pathId}`);
          textPath.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#${pathId}`);
          textPath.setAttribute('startOffset', '100%');
          textPath.textContent = colText;
          textEl.appendChild(textPath);
          svg.appendChild(textEl);
        });

        attributionEl.classList.remove('quote-speaker-attribution--fallback');
        attributionEl.replaceChildren(svg);
        attributionEl.setAttribute('aria-label', text);
      };

      if (img && img.src && (!img.complete || !img.naturalWidth)) {
        img.addEventListener('load', paint, { once: true });
        img.addEventListener(
          'error',
          () => this._setQuoteSpeakerAttributionFallback(attributionEl, text, wrap),
          { once: true }
        );
        return;
      }
      paint();
    }

    _scheduleQuoteSpeakerAttributionLayout(attributionEl, imgEl, cutoutEl) {
      if (!attributionEl) return;
      if (this._quoteSpeakerAttributionLayoutTimer) {
        clearTimeout(this._quoteSpeakerAttributionLayoutTimer);
      }
      this._quoteSpeakerAttributionLayoutTimer = setTimeout(() => {
        this._quoteSpeakerAttributionLayoutTimer = null;
        this._layoutQuoteSpeakerAttributionAlongSilhouette(attributionEl, imgEl, cutoutEl);
      }, 48);
    }

    _ensureQuoteSpeakerAttributionFit(widget) {
      const wrap = widget?.querySelector('.quote-speaker-portrait-wrap');
      if (!wrap || typeof ResizeObserver === 'undefined') return;
      const schedule = () => {
        const attributionEl = document.getElementById('quoteSpeakerAttribution');
        const cutout = document.getElementById('quoteSpeakerImageWrap');
        const img = cutout?.querySelector('.quote-speaker-image');
        if (!attributionEl || attributionEl.hidden) return;
        if (cutout && img?.naturalWidth) this._applyQuoteSpeakerCutoutAnchor(cutout, img);
        this._scheduleQuoteSpeakerAttributionLayout(attributionEl, img, cutout);
      };
      if (!this._quoteSpeakerAttributionObserver) {
        this._quoteSpeakerAttributionObserver = new ResizeObserver(schedule);
      }
      const cutout = document.getElementById('quoteSpeakerImageWrap');
      const identitySlab = document.getElementById('quoteSpeakerIdentitySlab');
      const targets = [wrap, cutout, identitySlab].filter(Boolean);
      targets.forEach((el) => {
        if (!this._quoteSpeakerAttributionObservedEls) {
          this._quoteSpeakerAttributionObservedEls = new Set();
        }
        if (!this._quoteSpeakerAttributionObservedEls.has(el)) {
          this._quoteSpeakerAttributionObserver.observe(el);
          this._quoteSpeakerAttributionObservedEls.add(el);
        }
      });
    }

    fitQuoteSpeakerNameToOneLine(nameEl, opts = {}) {
      if (!nameEl || !nameEl.isConnected) return;
      const copy = nameEl.closest('.quote-speaker-slab-body');
      if (!copy) return;
      const rootRem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const minPx = Math.max(11, 1.65 * rootRem);
      const quiltScreen = document.getElementById('screen-quilt');
      const revealName = () => nameEl.style.removeProperty('opacity');
      const applyFit = () => {
        void copy.offsetWidth;
        const available = Math.max(1, Math.floor(nameEl.clientWidth));
        nameEl.style.removeProperty('font-size');
        void nameEl.offsetWidth;
        const maxPx =
          parseFloat(getComputedStyle(nameEl).fontSize) ||
          3.25 * rootRem;
        nameEl.style.fontSize = `${maxPx}px`;
        if (nameEl.scrollWidth <= available) {
          revealName();
          return;
        }
        let lo = minPx;
        let hi = maxPx;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          nameEl.style.fontSize = `${mid}px`;
          if (nameEl.scrollWidth <= available) lo = mid;
          else hi = mid;
        }
        nameEl.style.fontSize = `${lo}px`;
        let guard = 0;
        while (nameEl.scrollWidth > available && parseFloat(nameEl.style.fontSize) > 8 && guard < 40) {
          nameEl.style.fontSize = `${parseFloat(nameEl.style.fontSize) - 0.5}px`;
          guard += 1;
        }
        revealName();
      };
      /* Hide during measure — silent used to skip this and briefly showed max font size on scroll. */
      nameEl.style.opacity = '0';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const done = () => {
            try {
              applyFit();
            } catch (_) {
              revealName();
            }
          };
          if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.ready?.then === 'function') {
            document.fonts.ready.then(done).catch(done);
          } else {
            done();
          }
        });
      });
    }

    _ensureQuoteSpeakerNameResizeFit() {
      if (this._quoteSpeakerNameResizeFitReady) return;
      const copy = document.querySelector(
        '#screen-quilt #quoteSpeakerIdentitySlab .quote-speaker-slab-body'
      );
      if (!copy || typeof ResizeObserver === 'undefined') return;
      this._quoteSpeakerNameResizeFitReady = true;
      let t = null;
      const ro = new ResizeObserver(() => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          const nameEl = document.getElementById('quoteSpeakerName');
          const cutout = document.getElementById('quoteSpeakerImageWrap');
          const widget = document.getElementById('quoteSpeakerWidget');
          if (!nameEl || !widget || widget.hidden || !String(nameEl.textContent || '').trim()) return;
          this.fitQuoteSpeakerNameToOneLine(nameEl, { silent: true });
          const img = cutout?.querySelector('.quote-speaker-image');
          if (cutout && img) this._syncQuoteSpeakerCutoutLayout(cutout, img);
        }, 48);
      });
      ro.observe(copy);
      this._quoteSpeakerNameResizeObserver = ro;
    }

    _quoteSpeakerHandCutCfg() {
      return {
        exportScale: 1,
        handCutMarginDomPx: 0.2,
        handCutCornerChamferDomPx: 9,
        handCutMacroDomPx: 8,
        handCutBiteMaxDomPx: 11,
        handCutSecondaryBiteDomPx: 7,
        handCutSideInwardMaxDomPx: 11,
        handCutTopBottomTrimDomPx: 9
      };
    }

    _applyQuoteSpeakerHandCut(target, dateKey = '', seedSuffix = '') {
      if (!target) return;
      const widget = document.getElementById('quoteSpeakerWidget');
      /** Speaker uses the PNG alpha silhouette only — newsprint hand-cut polygon reads as a stray light shape. */
      if (
        target.classList?.contains('quote-speaker-cutout') ||
        String(seedSuffix || '').trim() === 'speaker-cutout'
      ) {
        target.style.removeProperty('clip-path');
        target.style.removeProperty('-webkit-clip-path');
        if (target.classList.contains('quote-speaker-cutout')) {
          target.classList.add('quote-speaker-cutout--loaded');
        }
        return;
      }
      const QNC = globalThis.QuiltNewspaperClipping;
      if (!QNC?.buildHandCutCssClipPath || target.hidden || widget?.hidden) {
        target.classList.remove('quote-speaker-cutout--loaded');
        target.style.removeProperty('clip-path');
        target.style.removeProperty('-webkit-clip-path');
        return;
      }
      const rect = target.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w < 48 || h < 48) {
        target.classList.remove('quote-speaker-cutout--loaded');
        target.style.removeProperty('clip-path');
        target.style.removeProperty('-webkit-clip-path');
        return;
      }
      const seedKey = [String(dateKey || '').trim(), String(seedSuffix || '').trim()]
        .filter(Boolean)
        .join(':');
      const clip = QNC.buildHandCutCssClipPath(w, h, seedKey, this._quoteSpeakerHandCutCfg());
      if (!clip) {
        target.classList.remove('quote-speaker-cutout--loaded');
        target.style.removeProperty('clip-path');
        target.style.removeProperty('-webkit-clip-path');
        return;
      }
      target.style.clipPath = clip;
      target.style.webkitClipPath = clip;
      if (target.classList.contains('quote-speaker-cutout')) {
        target.classList.add('quote-speaker-cutout--loaded');
      }
    }

    _ensureQuoteSpeakerHandCutFit(widget, dateKey = '') {
      if (!widget) return;
      widget.dataset.handCutDateKey = String(dateKey || '').trim();
      const cutout = document.getElementById('quoteSpeakerImageWrap');
      if (typeof ResizeObserver !== 'undefined' && cutout) {
        if (!this._quoteSpeakerHandCutObserver) {
          this._quoteSpeakerHandCutObserver = new ResizeObserver(() => {
            const w = document.getElementById('quoteSpeakerWidget');
            const c = document.getElementById('quoteSpeakerImageWrap');
            if (!w || w.hidden || !c || c.hidden) return;
            const img = c.querySelector('.quote-speaker-image');
            if (img?.naturalWidth) this._syncQuoteSpeakerCutoutLayoutOnly(c, img);
            this._applyQuoteSpeakerHandCut(c, w.dataset.handCutDateKey || '', 'speaker-cutout');
          });
        }
        if (cutout !== this._quoteSpeakerHandCutObservedEl) {
          if (this._quoteSpeakerHandCutObservedEl) {
            this._quoteSpeakerHandCutObserver.unobserve(this._quoteSpeakerHandCutObservedEl);
          }
          this._quoteSpeakerHandCutObserver.observe(cutout);
          this._quoteSpeakerHandCutObservedEl = cutout;
        }
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cutout && !cutout.hidden) {
            const img = cutout.querySelector('.quote-speaker-image');
            if (img?.naturalWidth) this._syncQuoteSpeakerCutoutLayoutOnly(cutout, img);
          }
        });
      });
    }

    /** Washed quilt palette colors for speaker card (wash / face / torso). */
    getSpeakerCutoutCardColors() {
      if (typeof window !== 'undefined') {
        const preset = new URLSearchParams(window.location.search || '').get('speakerTestColors');
        const testPalettes = {
          vivid: { washColor: '#ff4d8d', faceColor: '#ffe566', torsoColor: '#56cfe1' },
          warhol: { washColor: '#e8488c', faceColor: '#f4c430', torsoColor: '#7ec8e3' },
          '1': { washColor: '#ff4d8d', faceColor: '#ffe566', torsoColor: '#56cfe1' },
          true: { washColor: '#ff4d8d', faceColor: '#ffe566', torsoColor: '#56cfe1' },
          yes: { washColor: '#ff4d8d', faceColor: '#ffe566', torsoColor: '#56cfe1' },
          test: { washColor: '#ff4d8d', faceColor: '#ffe566', torsoColor: '#56cfe1' },
          on: { washColor: '#ff4d8d', faceColor: '#ffe566', torsoColor: '#56cfe1' }
        };
        const test = testPalettes[String(preset || '').trim().toLowerCase()];
        if (test) {
          return {
            palette: [test.washColor, test.faceColor, test.torsoColor],
            washColor: test.washColor,
            faceColor: test.faceColor,
            torsoColor: test.torsoColor,
            washPlateColor: test.washColor,
            keepExplicitColors: true,
            colorTestMode: true
          };
        }
      }
      const palette = this.getSpeakerCutoutPaperPalette();
      const SCR = globalThis.SpeakerCutoutRender;
      const fallback = String(CONFIG.APP.defaultColor || '#ea9b9a').trim();
      if (SCR?.resolveSpeakerCardColorsFromQuilt) {
        const colors = SCR.resolveSpeakerCardColorsFromQuilt({
          palette,
          washColor: fallback,
          torsoFallback: fallback
        });
        return {
          palette,
          washColor: colors.washPlateColor,
          faceColor: colors.faceColor,
          torsoColor: colors.torsoColor,
          washPlateColor: colors.washPlateColor
        };
      }
      return {
        palette,
        washColor: fallback,
        faceColor: fallback,
        torsoColor: fallback,
        washPlateColor: fallback
      };
    }

    /** Complementary wash — now a washed second quilt swatch, not a synthetic complement. */
    getSpeakerCutoutWashColor() {
      return this.getSpeakerCutoutCardColors().washColor;
    }

    getSpeakerCutoutPaperPalette() {
      const blocks = this.quiltEngine?.blocks || [];
      const areaByColor = new Map();
      const order = [];
      const seen = new Set();
      (Array.isArray(blocks) ? blocks : []).forEach((block) => {
        const color = String(block?.color || '').trim();
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return;
        const key = color.toLowerCase();
        const area = Math.max(0, Number(block.width) || 0) * Math.max(0, Number(block.height) || 0);
        areaByColor.set(key, (areaByColor.get(key) || 0) + area);
        if (!seen.has(key)) {
          seen.add(key);
          order.push(color);
        }
      });
      if (order.length >= 2) {
        return order.sort(
          (a, b) => (areaByColor.get(b.toLowerCase()) || 0) - (areaByColor.get(a.toLowerCase()) || 0)
        );
      }
      return (this.getQuiltPaletteSummary?.()?.palette || [])
        .map((item) => String(item?.color || '').trim())
        .filter((color) => /^#[0-9A-Fa-f]{6}$/.test(color));
    }

    _quoteSpeakerWashHueRotateFromHex(hex) {
      const m = String(hex || '').trim().match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
      if (!m) return 304;
      const r = parseInt(m[1], 16) / 255;
      const g = parseInt(m[2], 16) / 255;
      const b = parseInt(m[3], 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      if (max !== min) {
        const d = max - min;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
      }
      return Math.round(h * 360);
    }

    _applyQuoteSpeakerWidgetWashVars(widget) {
      if (!widget) return;
      const cardColors = this.getSpeakerCutoutCardColors?.() || {};
      const keepRawColors = !!cardColors.keepExplicitColors;
      const safeWashColor = /^#[0-9A-Fa-f]{6}$/.test(String(cardColors.washColor || '').trim())
        ? String(cardColors.washColor).trim()
        : '#d4b8b0';
      const palette = cardColors.palette || this.getSpeakerCutoutPaperPalette?.() || [];
      const haloColor =
        (keepRawColors && cardColors.torsoColor) ||
        palette.find((color) => {
          const value = String(color || '').trim();
          return /^#[0-9A-Fa-f]{6}$/.test(value) && value.toLowerCase() !== safeWashColor.toLowerCase();
        }) ||
        cardColors.torsoColor ||
        CONFIG.APP.defaultColor ||
        '#d6977e';
      const SCR = globalThis.SpeakerCutoutRender;
      const safeHaloColor =
        keepRawColors && /^#[0-9A-Fa-f]{6}$/.test(String(haloColor || '').trim())
          ? String(haloColor).trim()
          : SCR?.washOutSpeakerQuiltColor
            ? SCR.washOutSpeakerQuiltColor(haloColor, 'torso')
            : /^#[0-9A-Fa-f]{6}$/.test(String(haloColor || '').trim())
              ? String(haloColor).trim()
              : '#d6977e';
      const markerColor = String(this.getBrightQuiltMarkerColor() || safeWashColor).trim();
      const safeMarkerColor = /^#[0-9A-Fa-f]{6}$/.test(markerColor) ? markerColor : safeWashColor;
      const washRgb = safeWashColor.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
      const markerRgb = safeMarkerColor.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
      widget.style.setProperty('--speaker-wash-color', safeWashColor);
      widget.style.setProperty('--speaker-halo-color', safeHaloColor);
      widget.style.setProperty('--speaker-wash-hue-rotate', `${this._quoteSpeakerWashHueRotateFromHex(safeWashColor)}deg`);
      if (washRgb) {
        const rgb = washRgb.slice(1).map((hex) => parseInt(hex, 16)).join(', ');
        widget.style.setProperty('--speaker-wash-color-fill', `rgba(${rgb}, 0.88)`);
        widget.style.setProperty('--speaker-wash-color-strong', `rgba(${rgb}, 0.46)`);
        widget.style.setProperty('--speaker-wash-color-medium', `rgba(${rgb}, 0.42)`);
        widget.style.setProperty('--speaker-wash-color-soft', `rgba(${rgb}, 0.36)`);
        widget.style.setProperty('--speaker-wash-color-faint', `rgba(${rgb}, 0.28)`);
      }
      if (markerRgb) {
        const rgb = markerRgb.slice(1).map((hex) => parseInt(hex, 16)).join(', ');
        const markerOpacity = '0.42';
        widget.style.setProperty('--speaker-guide-marker-rgb', rgb);
        widget.style.setProperty('--speaker-guide-marker-opacity', markerOpacity);
        widget.style.setProperty('--speaker-guide-marker-fill', `rgba(${rgb}, ${markerOpacity})`);
      }
    }

    _applyQuoteSpeakerWashColors(widget) {
      this._applyQuoteSpeakerWidgetWashVars(widget);
      const cutout = document.getElementById('quoteSpeakerImageWrap');
      if (
        cutout &&
        !cutout.hidden &&
        (cutout.classList.contains('quote-speaker-cutout--single-layer') ||
          this._quoteSpeakerWantsFirebasePopArt(null, null))
      ) {
        this._applyQuoteSpeakerCutoutRenderPlan(cutout, { forcePopArt: true });
      }
    }

    _applyQuoteSpeakerCutoutRenderPlan(cutout, options = {}) {
      const SCR = globalThis.SpeakerCutoutRender;
      if (!SCR?.buildSpeakerCutoutPlan || !SCR?.applySpeakerCutoutPlanToElement || !cutout) return;
      const widget = document.getElementById('quoteSpeakerWidget');
      const img = cutout.querySelector('.quote-speaker-image');
      const cardColors = this.getSpeakerCutoutCardColors?.() || {};
      const seed =
        String(widget?.dataset.handCutDateKey || '').trim() ||
        String(typeof Utils !== 'undefined' && Utils.getTodayKey ? Utils.getTodayKey() : '').trim() ||
        'odq';
      const boxW = Math.max(1, Math.round(cutout.clientWidth || 168));
      const boxH = Math.max(
        1,
        Math.round(parseFloat(cutout.style.height) || cutout.clientHeight || boxW * 1.2)
      );
      const parsePxVar = (name, fallback = 0) => {
        const raw = String(cutout.style.getPropertyValue(name) || '').trim();
        const n = parseFloat(raw.replace(/px$/, ''));
        return Number.isFinite(n) && n > 0 ? n : fallback;
      };
      const drawW = parsePxVar('--speaker-cutout-bg-w', boxW);
      const drawH = parsePxVar('--speaker-cutout-bg-h', boxH);
      const plan = SCR.buildSpeakerCutoutPlan({
        width: boxW,
        height: boxH,
        drawRect: { w: drawW, h: drawH },
        washColor: cardColors.washColor,
        faceColor: cardColors.faceColor,
        torsoColor: cardColors.torsoColor,
        seed,
        img: img?.naturalWidth ? img : null,
        palette: cardColors.keepExplicitColors ? [] : cardColors.palette || [],
        keepExplicitColors: !!cardColors.keepExplicitColors,
        colorTestMode: !!cardColors.colorTestMode
      });
      const isSpeakerCutout =
        options.forcePopArt === true ||
        cutout.classList.contains('quote-speaker-cutout--single-layer') ||
        this._quoteSpeakerWantsFirebasePopArt(null, null);
      if (isSpeakerCutout) {
        cutout.classList.add('quote-speaker-cutout--single-layer');
      }
      if (isSpeakerCutout && SCR.applySpeakerCutoutPlanToCutout) {
        SCR.applySpeakerCutoutPlanToCutout(cutout, plan);
      } else {
        cutout.classList.remove('quote-speaker-cutout--paper-shapes');
        const layer = cutout.querySelector('.quote-speaker-paper-layer');
        if (layer) layer.hidden = true;
        SCR.applySpeakerCutoutPlanToElement(cutout, plan);
        if (SCR.applyColorWashElement) {
          SCR.applyColorWashElement(cutout.querySelector('.quote-speaker-color-wash'), plan);
        }
        if (SCR.applyContourElement) {
          SCR.applyContourElement(cutout.querySelector('.quote-speaker-contour'), plan);
        }
      }
      if (widget) SCR.applySpeakerCutoutPlanToElement(widget, plan);
    }

    _finalizeQuoteSpeakerPopArtStack(cutout, img, quote = null) {
      if (!cutout || cutout.hidden || !img?.naturalWidth) return;
      const widget = document.getElementById('quoteSpeakerWidget');
      const profile = this.getQuoteSpeakerProfile(
        quote || this.getEffectiveQuiltQuote?.() || this.quoteService?.getTodayQuote?.() || null
      );
      if (!this._quoteSpeakerWantsFirebasePopArt(profile, quote)) return;
      cutout.classList.add('quote-speaker-cutout--single-layer', 'quote-speaker-cutout--loaded');
      cutout.classList.remove('quote-speaker-cutout--img-paint');
      const colorWash = document.getElementById('quoteSpeakerColorWash');
      if (colorWash) {
        colorWash.hidden = false;
        colorWash.removeAttribute('hidden');
      }
      const cutoutMat = document.getElementById('quoteSpeakerCutoutMat');
      if (cutoutMat) cutoutMat.hidden = true;
      if (widget) this._applyQuoteSpeakerWidgetWashVars(widget);
      this._applyQuoteSpeakerCutoutAnchor(cutout, img);
      this._applyQuoteSpeakerCutoutRenderPlan(cutout, { forcePopArt: true });
      this._applyQuoteSpeakerHandCut(
        cutout,
        widget?.dataset.handCutDateKey || '',
        'speaker-cutout'
      );
      this._pinQuoteSpeakerSingleLayerOverlays(cutout);
    }

    _clearQuoteSpeakerPlainCutoutBackingStyles(neutralSilhouette) {
      if (!neutralSilhouette) return;
      neutralSilhouette.classList.remove(
        'quote-speaker-cutout-backing--filled',
        'quote-speaker-cutout-backing--mask'
      );
      neutralSilhouette.style.removeProperty('background-image');
      neutralSilhouette.style.removeProperty('background-color');
      neutralSilhouette.style.removeProperty('-webkit-mask-image');
      neutralSilhouette.style.removeProperty('mask-image');
      neutralSilhouette.style.removeProperty('-webkit-mask-size');
      neutralSilhouette.style.removeProperty('mask-size');
      neutralSilhouette.style.removeProperty('-webkit-mask-position');
      neutralSilhouette.style.removeProperty('mask-position');
      neutralSilhouette.style.removeProperty('-webkit-mask-repeat');
      neutralSilhouette.style.removeProperty('mask-repeat');
      neutralSilhouette.style.removeProperty('filter');
    }

    _applyQuoteSpeakerPlainCutoutMaskFallback(cutout, neutralSilhouette) {
      const maskUrl = String(cutout?.style?.getPropertyValue('--speaker-image-url') || '').trim();
      if (!neutralSilhouette || !maskUrl || maskUrl === 'none') {
        if (neutralSilhouette) {
          neutralSilhouette.hidden = true;
          this._clearQuoteSpeakerPlainCutoutBackingStyles(neutralSilhouette);
        }
        return;
      }
      this._clearQuoteSpeakerPlainCutoutBackingStyles(neutralSilhouette);
      neutralSilhouette.hidden = false;
      neutralSilhouette.removeAttribute('hidden');
      neutralSilhouette.classList.add(
        'quote-speaker-cutout-backing--filled',
        'quote-speaker-cutout-backing--mask'
      );
      neutralSilhouette.style.backgroundImage = 'none';
      neutralSilhouette.style.backgroundColor = 'rgb(242, 238, 230)';
      neutralSilhouette.style.webkitMaskImage = maskUrl;
      neutralSilhouette.style.maskImage = maskUrl;
      neutralSilhouette.style.webkitMaskSize = '100% 100%';
      neutralSilhouette.style.maskSize = '100% 100%';
      neutralSilhouette.style.webkitMaskPosition = 'top left';
      neutralSilhouette.style.maskPosition = 'top left';
      neutralSilhouette.style.webkitMaskRepeat = 'no-repeat';
      neutralSilhouette.style.maskRepeat = 'no-repeat';
      neutralSilhouette.style.filter = 'none';
    }

    _applyQuoteSpeakerPlainCutoutBacking(cutout, img, sourceUrl = '') {
      if (!cutout || cutout.hidden || !img?.naturalWidth) return;
      const neutralSilhouette = document.getElementById('quoteSpeakerNeutralSilhouette');
      const portraitImg = cutout.querySelector('.quote-speaker-image') || img;
      if (portraitImg?.dataset?.plainCutoutComposite === '1') return;
      const cutoutMat = document.getElementById('quoteSpeakerCutoutMat');
      if (cutoutMat) cutoutMat.hidden = true;

      const parsePxVar = (name, fallback = 0) => {
        const raw = String(cutout.style.getPropertyValue(name) || '').trim();
        const n = parseFloat(raw.replace(/px$/, ''));
        return Number.isFinite(n) && n > 0 ? n : fallback;
      };
      const drawW = parsePxVar('--speaker-cutout-bg-w', cutout.clientWidth || 168);
      const drawH = parsePxVar('--speaker-cutout-bg-h', cutout.clientHeight || 200);

      const remote = String(
        sourceUrl ||
          cutout._plainCutoutSourceUrl ||
          (portraitImg.dataset.plainCutoutComposite === '1' ? '' : portraitImg.currentSrc || portraitImg.src) ||
          ''
      ).trim();
      if (remote && !cutout._plainCutoutSourceUrl) {
        cutout._plainCutoutSourceUrl = remote;
      }

      const resolveSourceImg = async () => {
        const dataSrc =
          portraitImg?.dataset?.plainCutoutComposite === '1'
            ? ''
            : String(portraitImg?.src || portraitImg?.currentSrc || '').trim();
        const url = String(cutout._plainCutoutSourceUrl || remote || dataSrc || '').trim();
        const loadUrl = /^data:/i.test(dataSrc) ? dataSrc : url;
        if (
          cutout._plainCutoutSourceImage?.naturalWidth &&
          cutout._plainCutoutSourceImage._loadedUrl === loadUrl
        ) {
          return cutout._plainCutoutSourceImage;
        }
        if (!loadUrl) return null;
        const loaded = await this._ensureQuoteSpeakerImageForCanvas(loadUrl);
        if (loaded?.naturalWidth) {
          cutout._plainCutoutSourceImage = loaded;
          cutout._plainCutoutSourceImage._loadedUrl = loadUrl;
        }
        return loaded;
      };

      const applyComposite = (sourceImg) => {
        if (!sourceImg?.naturalWidth) {
          this._applyQuoteSpeakerPlainCutoutMaskFallback(cutout, neutralSilhouette);
          return;
        }
        const canCanvas = this._quoteSpeakerCanCanvasProcessImage(sourceImg, cutout, portraitImg);
        if (!canCanvas) {
          this._applyQuoteSpeakerPlainCutoutMaskFallback(cutout, neutralSilhouette);
          return;
        }
        const SCR = globalThis.SpeakerCutoutRender;
        const composite =
          SCR?.buildSpeakerPlainCutoutCompositeDataUrl?.(sourceImg, drawW, drawH, 'width-fill') ||
          '';
        const compositeLooksValid = composite.length > 20000;
        if (!compositeLooksValid) {
          this._applyQuoteSpeakerPlainCutoutMaskFallback(cutout, neutralSilhouette);
          return;
        }
        if (neutralSilhouette) {
          neutralSilhouette.hidden = true;
          this._clearQuoteSpeakerPlainCutoutBackingStyles(neutralSilhouette);
        }
        portraitImg.dataset.plainCutoutComposite = '1';
        portraitImg.src = composite;
        portraitImg.hidden = false;
        portraitImg.classList.add('is-loaded');
      };

      void resolveSourceImg().then(applyComposite);
    }

    _applyQuoteSpeakerPlainCutoutStack(cutout, img) {
      if (!cutout || cutout.hidden || !img?.naturalWidth) return;
      cutout.classList.add('quote-speaker-cutout--loaded', 'quote-speaker-cutout--plain-cutout');
      cutout.classList.remove(
        'quote-speaker-cutout--single-layer',
        'quote-speaker-cutout--img-paint',
        'quote-speaker-cutout--paper-shapes'
      );
      this._clearQuoteSpeakerSingleLayerOverlayPins(cutout);
      const colorWash = document.getElementById('quoteSpeakerColorWash');
      if (colorWash) colorWash.hidden = true;
      const scannerBed = cutout.querySelector('.odq-scanner-bed');
      if (scannerBed) scannerBed.hidden = true;
      const paperLayer = cutout.querySelector('.quote-speaker-paper-layer');
      if (paperLayer) paperLayer.hidden = true;
      const paperBackdrop = cutout.querySelector('.quote-speaker-paper-shape--backdrop');
      if (paperBackdrop) paperBackdrop.hidden = true;
      const contourEl = cutout.querySelector('.quote-speaker-contour');
      if (contourEl) contourEl.hidden = true;
      const portraitImg = cutout.querySelector('.quote-speaker-image');
      if (portraitImg) {
        portraitImg.hidden = false;
        portraitImg.classList.add('is-loaded');
      }
      this._applyQuoteSpeakerCutoutAnchor(cutout, img);
      this._applyQuoteSpeakerPlainCutoutBacking(cutout, img, cutout._plainCutoutSourceUrl);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cutout.hidden && img?.naturalWidth) {
            this._applyQuoteSpeakerCutoutAnchor(cutout, img);
            this._applyQuoteSpeakerPlainCutoutBacking(cutout, img, cutout._plainCutoutSourceUrl);
          }
        });
      });
    }

    /**
     * CSS backgrounds on ::before cannot reliably use multi‑MB data: URLs; keep HTTPS Storage
     * URLs for --speaker-image-url and use the proxied data URL on <img> for decode/measurement.
     */
    _quoteSpeakerCssPaintUrl(displayUrl, profile, remoteUrl = '') {
      const display = String(displayUrl || '').trim();
      const remote = String(
        remoteUrl || profile?.cutoutUrl || profile?.imageUrl || ''
      ).trim();
      if (/^data:/i.test(display) && /^https?:\/\//i.test(remote)) return remote;
      return display;
    }

    _applyQuoteSpeakerImageLoaded(
      displayUrl,
      imageToken,
      profile,
      imageWrap,
      img,
      neutralSilhouette,
      colorWash,
      avatar,
      remoteUrlForCss = '',
      cutoutSourceUrl = '',
      sourceQuote = null
    ) {
      const widget = document.getElementById('quoteSpeakerWidget');
      const cssPaintUrl = this._quoteSpeakerCssPaintUrl(displayUrl, profile, remoteUrlForCss);
      const washPaintUrl = String(cssPaintUrl || displayUrl || '').trim();
      const speakerImageCssUrl = washPaintUrl
        ? `url("${washPaintUrl.replace(/"/g, '%22')}")`
        : 'none';
      const paintUrl = String(
        remoteUrlForCss || cutoutSourceUrl || cssPaintUrl || displayUrl || ''
      ).trim();
      const isSpeakerCutout =
        widget?.dataset.firebaseSpeakerCutout === '1' ||
        this._quoteSpeakerIsFirebaseCutoutPaint({
          paintUrl,
          remoteUrl: remoteUrlForCss,
          displayUrl,
          cutoutSourceUrl,
          profile,
          quote: sourceQuote
        });
      if (isSpeakerCutout && widget) widget.dataset.firebaseSpeakerCutout = '1';
      const usePopArtStack = isSpeakerCutout && this._quoteSpeakerPopArtEnabled();
      const usePlainCutout = isSpeakerCutout && !usePopArtStack;
      const useDataUrlPaint =
        !isSpeakerCutout &&
        /^data:/i.test(String(displayUrl || '').trim()) &&
        !/^https?:\/\//i.test(String(remoteUrlForCss || cssPaintUrl || '').trim());
      if (imageWrap) {
        imageWrap.hidden = false;
        imageWrap.classList.add('quote-speaker-cutout--loaded');
        imageWrap.classList.toggle('quote-speaker-cutout--single-layer', usePopArtStack);
        imageWrap.classList.toggle('quote-speaker-cutout--plain-cutout', usePlainCutout);
        imageWrap.classList.toggle('quote-speaker-cutout--img-paint', useDataUrlPaint);
        if (!usePlainCutout) imageWrap.classList.remove('quote-speaker-cutout--plain-cutout');
        imageWrap.style.setProperty('--speaker-image-url', speakerImageCssUrl);
      }
      if (neutralSilhouette) {
        neutralSilhouette.hidden = isSpeakerCutout || useDataUrlPaint;
      }
      const cutoutMat = document.getElementById('quoteSpeakerCutoutMat');
      if (cutoutMat) cutoutMat.hidden = usePopArtStack || useDataUrlPaint || usePlainCutout;
      if (colorWash) {
        colorWash.hidden = isSpeakerCutout ? !usePopArtStack : useDataUrlPaint ? true : !washPaintUrl;
      }
      if (img) {
        const displaySrc = String(displayUrl || cssPaintUrl).trim();
        if (usePlainCutout && imageWrap) {
          imageWrap._plainCutoutSourceUrl = String(
            remoteUrlForCss || cutoutSourceUrl || displaySrc || ''
          ).trim();
          imageWrap._plainCutoutSourceImage = null;
        }
        if (/^https?:\/\//i.test(displaySrc) && !this._quoteSpeakerCanvasPipelineBlocked()) {
          img.crossOrigin = 'anonymous';
        }
        delete img.dataset.plainCutoutComposite;
        img.src = displaySrc;
        img.hidden = false;
        img.classList.toggle('is-loaded', usePopArtStack || usePlainCutout || useDataUrlPaint);
      }
      if (avatar) avatar.hidden = true;
      this._quoteSpeakerCutoutUrl = displayUrl;
      this._quoteSpeakerLoadedToken = imageToken;
      if (imageWrap && img && !imageWrap.hidden) {
        this._syncQuoteSpeakerCutoutLayout(imageWrap, img, sourceQuote);
      }
      this.syncExitChamberSpeakerTextureFromWidget?.();
      if (
        usePopArtStack &&
        /^https?:\/\//i.test(paintUrl) &&
        this.archiveService?._prepareSpeakerImageUrlForCanvas
      ) {
        this.archiveService._forgetProxyImageFailure?.(paintUrl);
        void this.archiveService
          ._prepareSpeakerImageUrlForCanvas(paintUrl, {
            quote: this.isAdminTomorrowPreviewActive?.()
              ? this.getEffectiveQuiltQuote?.() || null
              : this.quoteService?.getTodayQuote?.() || null
          })
          .then((dataUrl) => {
            if (dataUrl && imageWrap && img?.naturalWidth) {
              this._finalizeQuoteSpeakerPopArtStack(imageWrap, img, sourceQuote);
            }
            if (dataUrl) this.scheduleLayoutBStoryPreviewRefreshAfterSpeaker?.(paintUrl);
          });
      } else if (isSpeakerCutout) {
        this.scheduleLayoutBStoryPreviewRefreshAfterSpeaker?.(paintUrl);
      }
    }

    _showQuoteSpeakerAvatarFallback(imageWrap, img, neutralSilhouette, colorWash, avatar) {
      if (imageWrap) {
        imageWrap.hidden = false;
        imageWrap.classList.remove(
          'quote-speaker-cutout--loaded',
          'quote-speaker-cutout--img-paint',
          'quote-speaker-cutout--single-layer',
          'quote-speaker-cutout--paper-shapes',
          'quote-speaker-cutout--plain-cutout'
        );
        imageWrap.style.removeProperty('--speaker-image-url');
        imageWrap.style.removeProperty('--speaker-cutout-pos-y');
        imageWrap.style.removeProperty('--speaker-cutout-pos-x');
        imageWrap.style.removeProperty('--speaker-cutout-bg-w');
        imageWrap.style.removeProperty('--speaker-cutout-bg-h');
        imageWrap.style.removeProperty('height');
        imageWrap._speakerOpaqueBounds = null;
        imageWrap._plainCutoutSourceUrl = '';
        imageWrap._plainCutoutSourceImage = null;
        this._clearQuoteSpeakerSingleLayerOverlayPins(imageWrap);
      }
      if (img) {
        img.hidden = true;
        img.classList.remove('is-loaded');
        delete img.dataset.plainCutoutComposite;
        img.removeAttribute('src');
      }
      if (neutralSilhouette) neutralSilhouette.hidden = true;
      const cutoutMat = document.getElementById('quoteSpeakerCutoutMat');
      if (cutoutMat) cutoutMat.hidden = true;
      if (colorWash) colorWash.hidden = true;
      const paperLayer = imageWrap?.querySelector('.quote-speaker-paper-layer');
      if (paperLayer) paperLayer.hidden = true;
      const paperBackdrop = imageWrap?.querySelector('.quote-speaker-paper-shape--backdrop');
      if (paperBackdrop) paperBackdrop.hidden = true;
      const contourEl = imageWrap?.querySelector('.quote-speaker-contour');
      if (contourEl) contourEl.hidden = true;
      if (avatar) avatar.hidden = false;
      if (imageWrap) {
        imageWrap.style.removeProperty('clip-path');
        imageWrap.style.removeProperty('-webkit-clip-path');
      }
      this._quoteSpeakerCutoutUrl = '';
      this._quoteSpeakerLoadedToken = '';
      const widget = document.getElementById('quoteSpeakerWidget');
      if (imageWrap && widget && !widget.hidden) {
        this._applyQuoteSpeakerHandCut(
          imageWrap,
          widget.dataset.handCutDateKey || '',
          'speaker-cutout'
        );
      }
      this.syncExitChamberSpeakerTextureFromWidget?.();
    }

    refreshQuoteSpeakerWidget(quote = null) {
      if (this.isAdminTomorrowPreviewActive?.() && !this.getEffectiveQuiltQuote?.()?.text) {
        return;
      }
      if (this._quoteSpeakerRefreshTimer) clearTimeout(this._quoteSpeakerRefreshTimer);
      this._quoteSpeakerRefreshTimer = setTimeout(() => {
        this._quoteSpeakerRefreshTimer = null;
        void this._refreshQuoteSpeakerWidgetEntry(quote);
      }, 100);
    }

    async _refreshQuoteSpeakerWidgetEntry(quote = null) {
      let resolvedQuote = null;
      if (this.isAdminTomorrowPreviewActive?.()) {
        const dk = this.getEffectiveAppDateKey?.() || '';
        resolvedQuote = quote || this.getEffectiveQuiltQuote?.() || null;
        if (!resolvedQuote?.text) return;
        if (dk && this.quoteService) {
          resolvedQuote =
            (await this.quoteService._mergeSpeakerFieldsFromFirestoreSource(dk, resolvedQuote)) ||
            resolvedQuote;
          resolvedQuote =
            (await this.quoteService.hydrateSpeakerCutoutFieldsForCalendarKey(dk, resolvedQuote)) ||
            resolvedQuote;
          resolvedQuote =
            (await this.quoteService.hydrateSpeakerGuideFieldsForCalendarKey(dk, resolvedQuote)) ||
            resolvedQuote;
          this.quoteService._pinnedByDateKey[dk] = resolvedQuote;
          this._syncAdminPreviewQuoteFromPin?.();
          resolvedQuote = this.getEffectiveQuiltQuote?.() || resolvedQuote;
        }
      } else {
        const dk = this.getEffectiveAppDateKey?.() || this.quoteService?.getQuoteCalendarKeyNow?.() || '';
        resolvedQuote =
          quote || this.getEffectiveQuiltQuote?.() || this.quoteService?.getTodayQuote?.() || null;
        if (resolvedQuote?.text && dk && this.quoteService) {
          resolvedQuote =
            (await this.quoteService._mergeSpeakerFieldsFromFirestoreSource(dk, resolvedQuote)) ||
            resolvedQuote;
          resolvedQuote =
            (await this.quoteService.hydrateSpeakerCutoutFieldsForCalendarKey(dk, resolvedQuote)) ||
            resolvedQuote;
        }
      }
      this._refreshQuoteSpeakerWidgetNow(resolvedQuote);
    }

    _refreshQuoteSpeakerWidgetNow(quote = null) {
      this._preserveQuiltScrollThroughLayout(() => this._refreshQuoteSpeakerWidgetNowInner(quote));
    }

    _refreshQuoteSpeakerWidgetNowInner(quote = null) {
      const widget = document.getElementById('quoteSpeakerWidget');
      if (!widget) return;
      const resolvedQuote =
        quote ||
        (this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveQuiltQuote?.()
          : null) ||
        (!this.isAdminTomorrowPreviewActive?.() ? this.getEffectiveQuiltQuote?.() : null) ||
        (!this.isAdminTomorrowPreviewActive?.()
          ? this.quoteService?.getTodayQuote?.()
          : null) ||
        null;
      if (this.isAdminTomorrowPreviewActive?.() && !resolvedQuote?.text) return;
      const profile = this.getQuoteSpeakerProfile(resolvedQuote);
      const img = document.getElementById('quoteSpeakerImage');
      const avatar = document.getElementById('quoteSpeakerAvatar');
      const imageWrap = document.getElementById('quoteSpeakerImageWrap');
      const neutralSilhouette = document.getElementById('quoteSpeakerNeutralSilhouette');
      const colorWash = document.getElementById('quoteSpeakerColorWash');
      const bioSlab = document.getElementById('quoteSpeakerBioSlab');
      const nameEl = document.getElementById('quoteSpeakerName');
      const datesEl = document.getElementById('quoteSpeakerDates');
      const guideEl = document.getElementById('quoteSpeakerGuide');
      const attributionEl = document.getElementById('quoteSpeakerAttribution');
      const stage = document.getElementById('quoteSpeakerStage');
      if (!profile) {
        widget.hidden = true;
        widget.classList.remove('quote-speaker-widget--no-image');
        widget.dataset.handCutDateKey = '';
        if (imageWrap) {
          imageWrap.style.removeProperty('clip-path');
          imageWrap.style.removeProperty('-webkit-clip-path');
        }
        if (stage) stage.classList.remove('quote-speaker-stage--visible');
        this._quoteSpeakerLastFitName = null;
        return;
      }

      const showSpeakerImage =
        this.quoteHasSpeakerImageAttribute(resolvedQuote) && !!profile.imageUrl;

      if (stage) stage.classList.add('quote-speaker-stage--visible');
      widget.hidden = false;
      widget.classList.toggle('quote-speaker-widget--no-image', !showSpeakerImage);
      const cutoutSnapEarly = this.getQuoteSpeakerField(resolvedQuote, [
        'speakerCutoutUrlSnapshot',
        'speaker_cutout_url_snapshot',
        'speakerCutoutUrl',
        'speaker_cutout_url'
      ]);
      widget.dataset.firebaseSpeakerCutout = this._quoteSpeakerIsFirebaseCutoutPaint({
        cutoutSourceUrl: cutoutSnapEarly || profile?.cutoutUrl || profile?.imageUrl || '',
        profile,
        quote: resolvedQuote
      })
        ? '1'
        : '0';
      this._applyQuoteSpeakerWidgetWashVars(widget);
      if (nameEl) {
        const speakerName = String(profile.name || '').trim();
        const nameChanged = speakerName !== this._quoteSpeakerLastFitName;
        if (nameEl.textContent !== speakerName) {
          nameEl.textContent = speakerName;
        }
        if (nameChanged) {
          this._quoteSpeakerLastFitName = speakerName;
        }
        this.fitQuoteSpeakerNameToOneLine(nameEl);
        this._ensureQuoteSpeakerNameResizeFit();
      }
      if (datesEl) {
        datesEl.textContent = profile.dates;
        datesEl.hidden = !profile.dates;
      }
      if (guideEl) {
        const guideText = String(profile.guideLine || '').trim();
        if (guideText && globalThis.SpeakerGuideMarker?.applySpeakerGuideMarker) {
          globalThis.SpeakerGuideMarker.applySpeakerGuideMarker(
            guideEl,
            guideText,
            profile.speakerKeywords
          );
        } else {
          guideEl.textContent = guideText;
        }
        guideEl.hidden = !guideText;
      }
      if (bioSlab) bioSlab.hidden = !profile.guideLine;
      const imageAttribution = showSpeakerImage
        ? this.formatQuoteSpeakerImageAttribution(profile.imageAttribution)
        : '';
      if (attributionEl) {
        attributionEl.dataset.attributionText = imageAttribution;
        attributionEl.hidden = !imageAttribution;
        if (!imageAttribution) {
          attributionEl.textContent = '';
          attributionEl.removeAttribute('aria-label');
          attributionEl.classList.remove('quote-speaker-attribution--fallback');
        } else {
          this._scheduleQuoteSpeakerAttributionLayout(attributionEl, img, imageWrap);
        }
      }
      const imageToken = `${profile.name}:${profile.imageUrl}`;
      const loadedToken = this._quoteSpeakerLoadedToken;
      const canKeepLoadedImage =
        showSpeakerImage &&
        imageWrap &&
        img &&
        loadedToken === imageToken &&
        !!String(img.currentSrc || img.src || '').trim() &&
        img.complete &&
        img.naturalWidth > 0 &&
        imageWrap.classList.contains('quote-speaker-cutout--loaded');

      this._quoteSpeakerImageToken = imageToken;

      if (canKeepLoadedImage) {
        imageWrap.hidden = false;
        img.hidden = false;
        if (neutralSilhouette) {
          neutralSilhouette.hidden =
            imageWrap.classList.contains('quote-speaker-cutout--single-layer') ||
            imageWrap.classList.contains('quote-speaker-cutout--plain-cutout');
        }
        const cutoutMat = document.getElementById('quoteSpeakerCutoutMat');
        if (cutoutMat) {
          cutoutMat.hidden =
            imageWrap.classList.contains('quote-speaker-cutout--paper-shapes') ||
            imageWrap.classList.contains('quote-speaker-cutout--plain-cutout');
        }
        if (colorWash) {
          colorWash.hidden = !imageWrap.classList.contains('quote-speaker-cutout--single-layer');
        }
        if (
          imageWrap.classList.contains('quote-speaker-cutout--plain-cutout')
        ) {
          this._applyQuoteSpeakerPlainCutoutStack(imageWrap, img);
        } else if (
          imageWrap.classList.contains('quote-speaker-cutout--single-layer') &&
          !imageWrap.classList.contains('quote-speaker-cutout--paper-shapes')
        ) {
          this._finalizeQuoteSpeakerPopArtStack(imageWrap, img, resolvedQuote);
        } else {
          this._syncQuoteSpeakerCutoutLayoutOnly(imageWrap, img);
        }
      } else if (showSpeakerImage && imageWrap) {
        if (
          this._quoteSpeakerImageToken === imageToken &&
          img &&
          String(img.currentSrc || img.src || '').trim() &&
          !img.complete
        ) {
          return;
        }
        const loadGeneration = this._quoteSpeakerLoadGeneration || 0;
        this._quoteSpeakerLoadedToken = '';
        if (imageWrap) {
          imageWrap.hidden = false;
          imageWrap.classList.remove(
            'quote-speaker-cutout--loaded',
            'quote-speaker-cutout--img-paint',
            'quote-speaker-cutout--single-layer',
            'quote-speaker-cutout--paper-shapes',
            'quote-speaker-cutout--plain-cutout'
          );
          imageWrap.style.removeProperty('--speaker-image-url');
          imageWrap.style.removeProperty('--speaker-cutout-pos-y');
          imageWrap.style.removeProperty('--speaker-cutout-pos-x');
          imageWrap.style.removeProperty('--speaker-cutout-bg-w');
          imageWrap.style.removeProperty('--speaker-cutout-bg-h');
          imageWrap.style.removeProperty('height');
          imageWrap._speakerOpaqueBounds = null;
          imageWrap._plainCutoutSourceUrl = '';
          imageWrap._plainCutoutSourceImage = null;
          this._clearQuoteSpeakerSingleLayerOverlayPins(imageWrap);
          imageWrap.style.removeProperty('clip-path');
          imageWrap.style.removeProperty('-webkit-clip-path');
          const paperLayer = imageWrap.querySelector('.quote-speaker-paper-layer');
          if (paperLayer) paperLayer.hidden = true;
          const paperBackdrop = imageWrap.querySelector('.quote-speaker-paper-shape--backdrop');
          if (paperBackdrop) paperBackdrop.hidden = true;
          const contourEl = imageWrap.querySelector('.quote-speaker-contour');
          if (contourEl) contourEl.hidden = true;
        }
        if (neutralSilhouette) {
          neutralSilhouette.hidden = true;
          this._clearQuoteSpeakerPlainCutoutBackingStyles?.(neutralSilhouette);
        }
        if (colorWash) colorWash.hidden = true;
        const cutoutMat = document.getElementById('quoteSpeakerCutoutMat');
        if (cutoutMat) cutoutMat.hidden = true;
        if (avatar) {
          avatar.textContent = this.getQuoteSpeakerInitials(profile.name);
          avatar.hidden = true;
        }
        if (img) {
          img.alt = `Portrait of ${profile.name}`;
          img.classList.remove('is-loaded');
          img.hidden = true;
          delete img.dataset.plainCutoutComposite;
          img.removeAttribute('src');
        }
        const applyLoaded = (displayUrl, remoteUrlForCss = '', cutoutSourceUrl = '') => {
          if ((this._quoteSpeakerLoadGeneration || 0) !== loadGeneration) return;
          if (this._quoteSpeakerImageToken !== imageToken) return;
          if (!displayUrl) {
            this._showQuoteSpeakerAvatarFallback(imageWrap, img, neutralSilhouette, colorWash, avatar);
            return;
          }
          this._applyQuoteSpeakerImageLoaded(
            displayUrl,
            imageToken,
            profile,
            imageWrap,
            img,
            neutralSilhouette,
            colorWash,
            avatar,
            remoteUrlForCss,
            cutoutSourceUrl,
            resolvedQuote
          );
        };
        const resolveDisplay =
          this.archiveService?.resolveSpeakerDisplayUrl?.bind(this.archiveService);
        const cutoutSnap = this.getQuoteSpeakerField(resolvedQuote, [
          'speakerCutoutUrlSnapshot',
          'speaker_cutout_url_snapshot'
        ]);
        const pickUrl = async () => {
          const arch = this.archiveService;
          if (arch && typeof arch.resolveLayoutBSpeakerCutoutUrl === 'function') {
            const cutout = await arch.resolveLayoutBSpeakerCutoutUrl(resolvedQuote, profile.name);
            if (cutout) return cutout;
          }
          const portraitForResolve =
            profile.portraitUrl ||
            (arch?._layoutBSpeakerPortraitUrlResolved
              ? arch._layoutBSpeakerPortraitUrlResolved(resolvedQuote)
              : arch?._layoutBSpeakerPortraitUrl
                ? arch._layoutBSpeakerPortraitUrl(resolvedQuote)
                : '') ||
            (this.quoteService?._speakerPortraitFromQuoteAndAssignment
              ? this.quoteService._speakerPortraitFromQuoteAndAssignment(resolvedQuote)
              : '') ||
            '';
          if (resolveDisplay) {
            return resolveDisplay({
              portraitUrl: portraitForResolve,
              cutoutUrl: profile.cutoutUrl || '',
              cutoutSnap,
              speakerName: profile.name
            });
          }
          return portraitForResolve || profile.cutoutUrl || profile.imageUrl || '';
        };
        pickUrl()
          .then((remoteUrl) => {
            const remote = String(remoteUrl || '').trim();
            if (this._quoteSpeakerShouldStripFringe(remote)) {
              widget.dataset.firebaseSpeakerCutout = '1';
            }
            if (!remote) return { remote: '', prepared: '' };
            return { remote, prepared: remote };
          })
          .then(async ({ remote, prepared }) => {
            const base = String(prepared || remote || '').trim();
            let display = base;
            if (/^https?:\/\//i.test(base)) {
              if (this._quoteSpeakerCanvasPipelineBlocked()) {
                try {
                  const proxied = await this.archiveService?._prepareSpeakerImageUrlForCanvas?.(base, {
                    quote: resolvedQuote
                  });
                  if (proxied) display = proxied;
                } catch (_) {
                  /* display-only fallback below */
                }
              } else {
                const cleaned = await this._quoteSpeakerCleanCutoutDisplayUrl(base, resolvedQuote);
                display = cleaned || base;
              }
            }
            return { remote, prepared: display, cutoutSource: base };
          })
          .then(({ remote, prepared, cutoutSource }) =>
            applyLoaded(prepared || remote, remote, cutoutSource)
          )
          .catch(() => applyLoaded(''));
      } else if (imageWrap) {
        imageWrap.hidden = true;
        if (img) {
          img.hidden = true;
          img.classList.remove('is-loaded');
        }
        if (neutralSilhouette) neutralSilhouette.hidden = true;
        if (colorWash) colorWash.hidden = true;
        const cutoutMat = document.getElementById('quoteSpeakerCutoutMat');
        if (cutoutMat) cutoutMat.hidden = true;
        if (avatar) avatar.hidden = !showSpeakerImage;
      }
      const speakerDateKey = String(
        this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveAppDateKey?.() || ''
          : resolvedQuote?.dateKey || this.quoteService?.getQuoteCalendarKeyNow?.() || ''
      ).trim();
      this._ensureQuoteSpeakerHandCutFit(widget, speakerDateKey);
      this._ensureQuoteSpeakerAttributionFit(widget);
      void this.refreshQuiltMoodCardImages();
    }

    refreshQuiltFortuneReveal(quote = null) {
      const reveal = document.getElementById('quiltFortuneReveal');
      if (!reveal) return;
      reveal.dataset.stage = '0';
      reveal.setAttribute('aria-label', "Tap to flip today's quilt blessing");
      const textEl = document.getElementById('quiltFortuneText');
      const todayQuote = quote || this.quoteService?.getTodayQuote?.() || null;
      if (textEl) {
        textEl.innerHTML = this.escapeQuiltFortuneTextWithLineBreaks(this.getQuiltBlessingText(todayQuote), 2);
      }
      reveal.style.setProperty('--fortune-container-color', 'transparent');
      reveal.style.setProperty('--fortune-container-ink', '#241b14');
      reveal.style.setProperty('--fortune-backing-color', '#f6f4f1');
      reveal.style.setProperty('--fortune-backing-ink', '#241b14');
      // Reset the underline so it can redraw on the next chamber visit.
    }

    /** Latest hex the current user placed on today's quilt (submissions, then device history). */
    _getLatestUserQuiltColor() {
      const stores = [
        this.quiltEngine?.getUserContributions?.()?.submissions,
        this.quiltEngine?.getLifetimeUserContributions?.()?.submissions
      ];
      for (const submissions of stores) {
        if (!Array.isArray(submissions)) continue;
        for (let i = submissions.length - 1; i >= 0; i--) {
          const color = String(submissions[i]?.color || '').trim();
          if (Utils.validateHexColor(color)) return color;
        }
      }
      const personalColors =
        typeof this.getDevicePersonalColorHistory === 'function'
          ? this.getDevicePersonalColorHistory()
          : [];
      const last = String(personalColors[personalColors.length - 1] || '').trim();
      return Utils.validateHexColor(last) ? last : '';
    }

    _applyQuiltMoodReceiptPaperTint(widget) {
      if (!widget) return;
      const paper = Utils.moodReceiptPaperFromUserColor(this._getLatestUserQuiltColor());
      widget.style.setProperty('--mood-receipt-bg', paper);
    }

    _quiltMoodTerminalEnabled() {
      return typeof globalThis.QuiltMoodTerminal?.createInteractiveTerminalElement === 'function';
    }

    /** CRT terminal UI retired — mood spread clipping is the live quilt quote UI. */
    _quiltMoodTerminalUiEnabled() {
      return false;
    }

    _quiltMoodSpreadEnabled() {
      const hasTriptych = typeof globalThis.QuiltMoodTriptychWidget?.mount === 'function';
      const hasNightlySource = !!(window.db && window.firestore);
      const hasComposeFallback =
        typeof globalThis.QuiltNewspaperClipping?.composeDataUrl === 'function';
      return hasTriptych && (hasNightlySource || hasComposeFallback);
    }

    /** True when mood triptych is mounted and quote PNG decoded (replaces legacy peek clipping). */
    _quiltMoodSpreadIsLive() {
      const spreadHost = document.getElementById('quiltMoodSpread');
      if (
        !spreadHost ||
        !spreadHost.classList.contains('is-ready') ||
        !spreadHost._moodTriptychWidget
      ) {
        return false;
      }
      const img = spreadHost.querySelector('.quilt-mood-triptych__quote-img');
      return !!(img?.naturalWidth);
    }

    _clearLegacyQuoteClippingPng() {
      this._stripLegacyQuoteClippingPng();
      const clipping = document.querySelector('.quilt-quote-clipping');
      if (!clipping) return;
      clipping.classList.remove('has-content');
      clipping.setAttribute('hidden', 'hidden');
      clipping.setAttribute('aria-hidden', 'true');
    }

    _stripLegacyQuoteClippingPng() {
      const clipping = document.querySelector('.quilt-quote-clipping');
      const img = document.querySelector('.quilt-quote-clipping__image');
      if (!clipping) return;
      clipping.classList.remove('quilt-quote-clipping--has-png');
      if (img) {
        img.hidden = true;
        img.removeAttribute('src');
      }
    }

    _showQuiltQuoteTextFallback(quote = null) {
      if (this._quiltMoodSpreadIsLive() || this._moodSpreadOwnsQuoteUi()) {
        return;
      }
      const clipping = document.querySelector('.quilt-quote-clipping');
      if (!clipping) return;
      const todayQ = quote || this.quoteService?.getTodayQuote?.() || null;
      const body = String(todayQ?.text ?? todayQ?.body ?? '').trim();
      if (!body) return;
      const quiltQuoteText = document.querySelector('.quilt-quote-text');
      const quiltQuoteAuthor = document.querySelector('.quilt-quote-author');
      if (quiltQuoteText && this.quoteService?.formatQuiltQuoteWithAuthor) {
        quiltQuoteText.innerHTML = this.quoteService.formatQuiltQuoteWithAuthor(
          todayQ?.text,
          todayQ?.author,
          todayQ
        );
      }
      if (quiltQuoteAuthor) quiltQuoteAuthor.textContent = '';
      const a11y = document.querySelector('.quilt-quote-clipping__a11y');
      const a11yText = this._quiltNewspaperClippingA11yText(todayQ);
      if (a11y) a11y.textContent = a11yText;
      if (a11yText) clipping.setAttribute('aria-label', a11yText);
      this._stripLegacyQuoteClippingPng();
      clipping.classList.add('has-content');
      clipping.removeAttribute('hidden');
      clipping.removeAttribute('aria-hidden');
    }

    /** Mood triptych replaces peek clipping whenever the widget is active or loading. */
    _moodSpreadOwnsQuoteUi() {
      if (!this._quiltMoodSpreadEnabled()) return false;
      const host = document.getElementById('quiltMoodSpread');
      if (!host?._moodTriptychWidget && !host?._moodSpreadComposePending) return false;
      if (host._moodSpreadComposePending) return true;
      if (host.classList.contains('is-ready')) return true;
      const src = host.querySelector('.quilt-mood-triptych__quote-img')?.src;
      return !!(src && src.length > 32);
    }

    _fallbackQuiltQuoteClipping(quote = null, dateKey = null) {
      if (this._quiltMoodSpreadIsLive() || this._moodSpreadOwnsQuoteUi()) return;
      const todayQuote = quote || this.quoteService?.getTodayQuote?.() || null;
      if (this._quiltMoodSpreadEnabled()) {
        this._stripLegacyQuoteClippingPng();
        this._showQuiltQuoteTextFallback(todayQuote);
        return;
      }
      void this.applyQuiltNewspaperClipping({
        dateKey: dateKey || this.quoteService?.getQuoteCalendarKeyNow?.(),
        quote: todayQuote
      });
    }

    _markQuiltMoodSpreadQuoteUi() {
      const stack = document.querySelector('#screen-quilt .quote-card-stack');
      if (!stack) return;
      if (this._quiltMoodSpreadIsLive()) {
        stack.setAttribute('data-quote-ui', 'mood-triptych');
      } else {
        stack.removeAttribute('data-quote-ui');
      }
    }

    _prepareQuiltMoodHostForSpread(host, { goodDay, roughDay, initialMood = null } = {}) {
      if (!host) return;
      const g = String(goodDay || '').trim();
      const r = String(roughDay || '').trim();
      if (!g || !r) return;
      const sig = `${g}\u0001${r}`;
      host.innerHTML = '';
      host.setAttribute('hidden', 'hidden');
      host.setAttribute('aria-hidden', 'true');
      host.classList.remove('is-hydrating');
      host.dataset.goodDay = g;
      host.dataset.roughDay = r;
      host.dataset.contentSig = sig;
      host.classList.remove('is-active', 'is-good', 'is-rough');
      if (initialMood === 'good' || initialMood === 'rough') {
        host.classList.add('is-active');
        host.classList.toggle('is-good', initialMood === 'good');
        host.classList.toggle('is-rough', initialMood === 'rough');
      }
    }

    _quiltMoodTerminalRecipientName() {
      if (typeof Utils !== 'undefined' && typeof Utils.getNameThanksDisplayName === 'function') {
        return String(Utils.getNameThanksDisplayName() || 'Friend').trim() || 'Friend';
      }
      return 'Friend';
    }

    _quiltMoodTerminalAccentColor() {
      const popular = this.getMostPopularQuiltColor?.()?.color;
      const hex = String(popular || CONFIG.APP?.defaultColor || '#ea9b9a').trim();
      return /^#?[0-9a-f]{6}$/i.test(hex)
        ? hex.startsWith('#')
          ? hex
          : `#${hex}`
        : '#ea9b9a';
    }

    _applyQuiltMoodTerminalTheme(term) {
      const T = globalThis.QuiltMoodTerminal;
      if (!term || !T?.applyTerminalQuiltTheme) return;
      const theme = T.applyTerminalQuiltTheme(term, this._quiltMoodTerminalAccentColor());
      if (theme && T.hydratePixelatedIcons) {
        void T.hydratePixelatedIcons(term, 'mood-terminal', {
          phosphor: theme.phosphor,
          phosphorCore: theme.phosphorCore,
          phosphorGlow: theme.phosphorGlow
        });
      }
    }

    _quiltMoodTerminalAnnounceText(bodyText, stampAt = new Date(), recipientName = '') {
      const lead = 'A SPECIAL MESSAGE FOR';
      const body = Utils.formatMoodReceiptBody(bodyText);
      const name = String(recipientName || this._quiltMoodTerminalRecipientName())
        .trim()
        .toUpperCase();
      const stamp = Utils.formatMoodReceiptStamp(stampAt);
      return [lead, body, name, stamp].filter(Boolean).join('. ');
    }

    _quiltMoodTerminalQuotePayload(quote, dateKey = null) {
      const q = quote || this._quoteForMoodWidget() || null;
      if (!q || typeof q !== 'object') return null;
      const text = String(q.text ?? q.body ?? '').trim();
      if (!text) return null;
      const author = String(q.author ?? q.authorSnapshot ?? '').trim();
      const dateKeyOut = String(
        dateKey ||
          (typeof this.getEffectiveAppDateKey === 'function' ? this.getEffectiveAppDateKey() : '') ||
          this.quoteService?.getQuoteCalendarKeyNow?.() ||
          q.dateKey ||
          ''
      ).trim();
      const flc = Number(q.first_line_count ?? q.firstLineCount);
      const payload = { text, author, dateKey: dateKeyOut };
      if (Number.isFinite(flc) && flc > 0) payload.firstLineCount = Math.round(flc);
      const keyword = String(q.keyword ?? q.keywordSnapshot ?? '').trim();
      if (keyword) payload.keyword = keyword;
      return payload;
    }

    _mountQuiltMoodTerminal(host, { quote, goodDay, roughDay, initialMood = null, instant = false } = {}) {
      const T = globalThis.QuiltMoodTerminal;
      if (!host || !T) return null;
      T.injectTerminalStyles();

      const quotePayload = this._quiltMoodTerminalQuotePayload(quote);
      if (!quotePayload) return null;

      const g = String(goodDay || '').trim();
      const r = String(roughDay || '').trim();
      if (!g || !r) return null;

      const sig = `${g}\u0001${r}`;
      const mood =
        initialMood === 'good' || initialMood === 'rough' ? initialMood : null;

      host.innerHTML = '';
      const term = T.createInteractiveTerminalElement({
        quote: quotePayload,
        goodDay: g,
        roughDay: r,
        recipientName: this._quiltMoodTerminalRecipientName(),
        quiltAccentColor: this._quiltMoodTerminalAccentColor(),
        initialMood: mood || undefined,
        typewriter: mood ? !instant : true,
        typewriterMs: 26,
        scrollRoot: document.getElementById('screen-quilt'),
        resolveQuoteClippingUrl: (dateKey) => this.fetchNewspaperClippingUrl(dateKey),
        onSelect: (pickedMood, line, meta) => {
          this._onQuiltMoodTerminalPicked(host, pickedMood, line, meta);
        }
      });
      if (!term) return null;

      this._applyQuiltMoodTerminalTheme(term);
      host.appendChild(term);
      void term.commitTerminalMount?.();
      host.dataset.goodDay = g;
      host.dataset.roughDay = r;
      host.dataset.contentSig = sig;
      host.classList.remove('is-hydrating');
      host.removeAttribute('hidden');

      if (mood) {
        host.classList.add('is-active');
        host.classList.toggle('is-good', mood === 'good');
        host.classList.toggle('is-rough', mood === 'rough');
      }

      const dk = String(quotePayload.dateKey || '').trim();
      if (dk) {
        void this.fetchNewspaperClippingUrl(dk).then((url) => {
          if (url) void term.refreshTerminalQuoteClipping?.();
        });
      }

      return term;
    }

    async _refreshQuiltMoodTerminalQuoteClipping({ forceRefresh = false, dateKey = null } = {}) {
      const host = document.getElementById('quiltMoodWidget');
      if (!host || !this._quiltMoodTerminalEnabled()) return;
      const term = host.querySelector('.mood-terminal');
      if (!term?.refreshTerminalQuoteClipping) return;
      const dk = String(dateKey || this.quoteService?.getQuoteCalendarKeyNow?.() || '').trim();
      if (forceRefresh && dk && this._newspaperClippingUrlCache) {
        delete this._newspaperClippingUrlCache[dk];
      }
      await term.refreshTerminalQuoteClipping();
    }

    _onQuiltMoodTerminalPicked(host, mood, line, meta = {}) {
      if (!host || (mood !== 'good' && mood !== 'rough')) return;
      const stampAt =
        meta.printedAt instanceof Date
          ? meta.printedAt
          : meta.printedAt
            ? new Date(meta.printedAt)
            : new Date();
      const recipient = String(
        meta.recipient || host.querySelector('.mood-terminal')?.dataset?.recipientName || ''
      ).trim() || this._quiltMoodTerminalRecipientName();
      host.classList.add('is-active');
      host.classList.toggle('is-good', mood === 'good');
      host.classList.toggle('is-rough', mood === 'rough');
      this._saveQuiltMoodPickToStorage(host, mood, stampAt);
      const spreadHost = document.getElementById('quiltMoodSpread');
      const TriptychW = globalThis.QuiltMoodTriptychWidget;
      if (spreadHost?._moodTriptychWidget && TriptychW?.moodToPanel) {
        const triptych = spreadHost._moodTriptychWidget;
        const spreadDone =
          triptych.getMood?.() === mood && spreadHost.classList.contains('is-open');
        if (!spreadDone) {
          triptych.setMood(mood, { instant: false });
        }
      }
      const announcer = document.getElementById('quiltMoodWidgetAnnouncer');
      const bodyText = String(line || '').trim() ||
        String(mood === 'good' ? host.dataset.goodDay : host.dataset.roughDay || '').trim();
      if (announcer && bodyText) {
        announcer.textContent = this._quiltMoodTerminalAnnounceText(bodyText, stampAt, recipient);
      }
      if (document.getElementById('screen-remember-today')?.classList.contains('active')) {
        this.refreshRememberTodayScreen?.();
      }
    }

    /**
     * CRT terminal: taped quote clipping + mood question + phosphor response.
     * Hidden when either mood field is missing.
     */
    refreshQuiltMoodWidget(quote = null) {
      try {
        this._refreshQuiltMoodWidgetImpl(quote);
      } catch (err) {
        this.logger?.warn?.('refreshQuiltMoodWidget failed:', err);
        this._clearQuiltMoodPickStorage();
      }
    }

    _quoteForMoodWidget(quote = null) {
      const todayQuote =
        quote || this.getEffectiveQuiltQuote?.() || this.quoteService?.getTodayQuote?.() || null;
      if (!todayQuote) return null;
      const fresh = this.quoteService?._hydrateQuoteFromCatalog?.(todayQuote);
      if (!fresh) return todayQuote;
      return this.quoteService._mergePinnedWithCatalogFields(fresh, todayQuote);
    }

    /** Placeholder mood copy for local / query-string UI preview before catalog backfill. */
    _quiltMoodPreviewForced() {
      try {
        if (window.__odqPreviewMoodWidget === true) return true;
        const params = new URLSearchParams(window.location.search || '');
        const v = params.get('previewMoodWidget');
        if (v === '1' || v === 'true') return true;
        if (String(window.location.pathname || '').includes('our-daily-beta')) return true;
        // Opening the single-file build from disk (file://) — show cards with placeholders.
        if (window.location.protocol === 'file:') return true;
        const host = String(window.location.hostname || '').toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') return true;
      } catch (_) {
        /* */
      }
      return false;
    }

    _scheduleQuiltMoodFieldsHydrate(quote, widget) {
      if (!widget || widget.dataset.moodHydratePending === '1') return;
      const qs = this.quoteService;
      if (!qs?.hydrateMoodFieldsForCalendarKey) return;
      widget.dataset.moodHydratePending = '1';
      void qs
        .hydrateMoodFieldsForCalendarKey(
          typeof this.getEffectiveAppDateKey === 'function'
            ? this.getEffectiveAppDateKey()
            : qs.getQuoteCalendarKeyNow(),
          quote
        )
        .finally(() => {
          delete widget.dataset.moodHydratePending;
        })
        .then((hydrated) => {
          if (hydrated) this._refreshQuiltMoodWidgetImpl(hydrated);
          else this._refreshQuiltMoodWidgetImpl(quote);
        })
        .catch(() => {
          delete widget.dataset.moodHydratePending;
        });
    }

    _unmountQuiltMoodSpread() {
      const spreadHost = document.getElementById('quiltMoodSpread');
      globalThis.QuiltMoodTriptychWidget?.unmount?.(spreadHost);
    }

    remeasureQuiltMoodSpread() {
      const spreadHost = document.getElementById('quiltMoodSpread');
      spreadHost?._moodTriptychWidget?.remeasure?.();
    }

    async _refreshQuiltMoodSpread(
      quote = null,
      goodDay = '',
      roughDay = '',
      { initialMood = null, instant = false } = {}
    ) {
      const spreadHost = document.getElementById('quiltMoodSpread');
      if (!spreadHost) return;
      const TriptychW = globalThis.QuiltMoodTriptychWidget;
      const QNC = globalThis.QuiltNewspaperClipping;
      const todayQuote = this._quoteForMoodWidget(quote);
      const canComposeQuote = typeof QNC?.composeDataUrl === 'function';
      if (!TriptychW?.mount || !this._quiltMoodSpreadEnabled()) {
        this._unmountQuiltMoodSpread();
        this._fallbackQuiltQuoteClipping(todayQuote);
        return;
      }
      if (!window.db || !window.firestore) {
        if (!canComposeQuote) {
          this._unmountQuiltMoodSpread();
          this._fallbackQuiltQuoteClipping(todayQuote);
          return;
        }
      }

      const g = String(goodDay || '').trim();
      const r = String(roughDay || '').trim();
      if (!g || !r) {
        this._unmountQuiltMoodSpread();
        this._fallbackQuiltQuoteClipping(todayQuote);
        return;
      }

      const sig = `${g}\u0001${r}`;
      const spreadDateKey =
        typeof this.getEffectiveAppDateKey === 'function' ? this.getEffectiveAppDateKey() : '';
      const spreadDateMatches =
        !spreadDateKey ||
        !spreadHost.dataset.moodSpreadDateKey ||
        spreadHost.dataset.moodSpreadDateKey === spreadDateKey;
      if (spreadHost.dataset.contentSig === sig && spreadHost._moodTriptychWidget && spreadDateMatches) {
        let remountForNewClipping = false;
        const earlyPayload = this._quiltMoodTerminalQuotePayload(todayQuote);
        const earlyDk = String(earlyPayload?.dateKey || '').trim();
        if (earlyDk) {
          const latestUrl = await this.fetchNewspaperClippingUrl(earlyDk, { waitForFirebaseMs: 4000 });
          const latestStamp = latestUrl?.includes('odq_t=')
            ? latestUrl.split('odq_t=')[1]?.split('&')[0]
            : '';
          remountForNewClipping =
            !!latestStamp &&
            !!spreadHost.dataset.quoteClippingStamp &&
            spreadHost.dataset.quoteClippingStamp !== latestStamp;
        }
        if (!remountForNewClipping) {
          this.applyQuiltMoodTriptychPalette?.();
          const triptych = spreadHost._moodTriptychWidget;
          if (initialMood === 'good' || initialMood === 'rough') {
            if (triptych.getMood?.() !== initialMood) {
              triptych.setMood(initialMood, { instant: true });
            }
          } else if (triptych.getMood?.() || spreadHost.classList.contains('is-open')) {
            triptych.setMood(null, { instant: true, force: true });
          }
          triptych.remeasure?.();
          if (spreadHost.classList.contains('is-ready')) {
            this._clearLegacyQuoteClippingPng();
            this._markQuiltMoodSpreadQuoteUi();
          }
          return;
        }
      }

      if (spreadHost._moodSpreadComposePending === sig) {
        return;
      }

      TriptychW.unmount(spreadHost);
      TriptychW.injectStyles?.();
      spreadHost._moodSpreadComposePending = sig;
      if (!this._moodSpreadOwnsQuoteUi()) {
        this._showQuiltQuoteTextFallback(todayQuote);
      }

      const quotePayload = this._quiltMoodTerminalQuotePayload(todayQuote);
      if (!quotePayload) {
        this._unmountQuiltMoodSpread();
        this._fallbackQuiltQuoteClipping(todayQuote);
        return;
      }

      const dk = String(quotePayload.dateKey || '').trim();
      try {
        let quoteDataUrl = null;
        let quoteDisplayWidthPx = 0;
        let composed = null;

        if (spreadHost._moodSpreadComposePending !== sig) {
          return;
        }

        const triptychClippingMeta = dk
          ? await this.fetchNewspaperClippingMeta(dk, { waitForFirebaseMs: 12000 })
          : { exportRev: '' };
        const triptychStorageStale =
          typeof SimplifiedQuiltAppV2Quilt?.isStoredClippingExportStale === 'function'
            ? SimplifiedQuiltAppV2Quilt.isStoredClippingExportStale(triptychClippingMeta.exportRev)
            : false;
        if (!triptychStorageStale) {
          quoteDataUrl = this._reuseLoadedNewspaperClippingSrc?.(dk);
          if (quoteDataUrl) {
            console.info('[our-daily] Triptych quote: reusing loaded Storage PNG');
          } else if (dk) {
            quoteDataUrl = await this.resolveNightlyNewspaperClippingUrl(dk, {
              waitForFirebaseMs: 12000
            });
          }
          if (!quoteDataUrl && dk) {
            await this._waitForQuoteScreenClippingInflight?.(3500);
            quoteDataUrl = this._reuseLoadedNewspaperClippingSrc?.(dk);
            if (quoteDataUrl) {
              console.info('[our-daily] Triptych quote: reusing quote-screen Storage PNG');
            }
          }
        } else {
          console.info(
            `[our-daily] Triptych quote: Storage rev ${triptychClippingMeta.exportRev || '?'} < bundled ${globalThis.QuiltNewspaperClipping?.CLIPPING_EXPORT_REV}; client compose`
          );
        }
        if (quoteDataUrl) {
          console.info('[our-daily] Triptych quote: nightly PNG (source of truth)');
          void this.applyQuoteScreenClipping({ dateKey: dk, quote: todayQuote, forceRefresh: true });
        } else if (canComposeQuote) {
          const liveQuote = (await this._resolveQuoteForClippingCenter?.(dk, todayQuote)) || todayQuote;
          const livePayload = this._quiltMoodTerminalQuotePayload(liveQuote) || quotePayload;
          let yesterday = null;
          let tomorrow = null;
          const qs = this.quoteService;
          if (dk && qs && typeof qs.getAdjacentQuotesForClippingDateKey === 'function') {
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
          const paperTextureUrl = QNC?.resolveClippingPaperTextureUrl?.() || null;
          const composeFn = QNC.composeDataUrlWithLayout || QNC.composeDataUrl;
          composed = await composeFn({
            yesterday,
            today: {
              text: livePayload.text,
              author: livePayload.author,
              dateKey: dk,
              firstLineCount: livePayload.firstLineCount,
              keyword: livePayload.keyword
            },
            tomorrow,
            dateKey: dk,
            paperTextureUrl,
            width: 0,
            cropHorizontalBleedDomPx: 0,
            layoutProfile: 'triptych',
            centerOnly: true,
            exportDensity:
              typeof window !== 'undefined'
                ? Math.min(Math.max(window.devicePixelRatio || 2, 2), 3)
                : 2
          });
          if (typeof composed === 'string') {
            quoteDataUrl = composed;
          } else if (composed?.dataUrl) {
            quoteDataUrl = composed.dataUrl;
            quoteDisplayWidthPx = Number(composed.displayWidthPx) || 0;
          }
          if (quoteDataUrl) {
            console.warn(
              '[our-daily] Triptych quote: client compose fallback (rerun nightly IG workflow for Storage PNG)'
            );
          }
        } else {
          console.warn(
            '[our-daily] Triptych quote unavailable: no nightly PNG and compose disabled'
          );
        }
        if (spreadHost._moodSpreadComposePending !== sig) {
          return;
        }
        if (!quoteDataUrl) {
          console.warn('[our-daily] Triptych quote image unavailable (Storage + compose failed)');
          this._unmountQuiltMoodSpread();
          this._fallbackQuiltQuoteClipping(todayQuote, dk);
          return;
        }

        spreadHost.dataset.contentSig = sig;
        spreadHost.dataset.moodSpreadDateKey = dk;
        spreadHost.dataset.goodDay = g;
        spreadHost.dataset.roughDay = r;
        if (Number(composed?.renderWidth) > 0) {
          spreadHost.dataset.quoteRenderWidth = String(Math.round(composed.renderWidth));
        }
        if (quoteDataUrl.startsWith('http')) {
          spreadHost.dataset.quoteClippingStamp = quoteDataUrl.split('odq_t=')[1]?.split('&')[0] || quoteDataUrl;
        }

        const moodHost = document.getElementById('quiltMoodWidget');
        const mounted = TriptychW.mount(spreadHost, {
          quoteDataUrl,
          quoteDisplayWidthPx,
          quoteRenderWidth: Number(spreadHost.dataset.quoteRenderWidth) || 0,
          goodDay: g,
          roughDay: r,
          dateKey: dk,
          initialMood: initialMood === 'good' || initialMood === 'rough' ? initialMood : null,
          instant: !!instant,
          onReady: () => {
            this._clearLegacyQuoteClippingPng();
            this._markQuiltMoodSpreadQuoteUi();
            if (document.getElementById('screen-quilt')?.classList.contains('active')) {
              this.scheduleQuiltScrollCue?.(500);
            }
          },
          onSelect: (pickedMood) => {
            if (!moodHost) return;
            const bodyText = String(pickedMood === 'good' ? g : r).trim();
            this._onQuiltMoodTerminalPicked(moodHost, pickedMood, bodyText, {
              printedAt: new Date()
            });
          }
        });
        if (!mounted) {
          console.warn('[our-daily] QuiltMoodTriptychWidget mount failed');
          this._unmountQuiltMoodSpread();
          this._fallbackQuiltQuoteClipping(todayQuote, dk);
          return;
        }
        mounted.remeasure?.();
        this.applyQuiltMoodTriptychPalette?.();
        globalThis.OdqScannerBed?.bootstrapQuiltPaper?.(document, dk);
        if (spreadHost.classList.contains('is-ready')) {
          this._clearLegacyQuoteClippingPng();
          this._markQuiltMoodSpreadQuoteUi();
        }
        if (String(quoteDataUrl || '').startsWith('data:') && dk) {
          const upgrade = () => {
            void this._upgradeTriptychQuoteToNightlyClipping(dk, g, r);
          };
          globalThis.setTimeout(upgrade, 2000);
          document.addEventListener('firebaseReady', upgrade, { once: true });
        }
      } catch (err) {
        console.warn('[our-daily] Mood triptych refresh failed:', err);
        const keepExisting =
          spreadHost.classList.contains('is-ready') &&
          spreadHost._moodTriptychWidget &&
          spreadHost.dataset.contentSig === sig;
        if (!keepExisting) {
          this._unmountQuiltMoodSpread();
          if (!this._moodSpreadOwnsQuoteUi()) {
            this._showQuiltQuoteTextFallback(todayQuote);
          }
        }
      } finally {
        if (spreadHost._moodSpreadComposePending === sig) {
          delete spreadHost._moodSpreadComposePending;
        }
      }
    }
  }

  root.SimplifiedQuiltAppV2Boot = SimplifiedQuiltAppV2Boot;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
