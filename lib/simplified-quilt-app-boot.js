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
  /** Fixed display order for the reflection archive's "By theme" view (matches the Notion prompt_theme categories). */
  const REFLECTION_ARCHIVE_THEME_ORDER = [
    'process', 'courage', 'doubt', 'attention', 'voice', 'belonging', 'resilience', 'identity', 'trust'
  ];
  class SimplifiedQuiltAppV2Boot {
    _isCapacitorNativeClient() {
      return (
        typeof globalThis !== 'undefined' &&
        typeof globalThis.odqIsCapacitorNative === 'function' &&
        globalThis.odqIsCapacitorNative()
      );
    }

    /**
     * Defer DOM-heavy lower-section paints until scroll settles so WKWebView does not hitch mid-gesture.
     */
    _runAfterQuiltScrollQuiet(fn, options = {}) {
      if (typeof fn !== 'function') return;
      const maxWaitMs = Math.max(120, Number(options.maxWaitMs) || 720);
      if (!this._parallaxScrollActive) {
        fn();
        return;
      }
      if (!this._quiltScrollQuietQueue) this._quiltScrollQuietQueue = [];
      this._quiltScrollQuietQueue.push(fn);
      if (this._quiltScrollQuietFlushTimer != null) return;
      const started = Date.now();
      const tick = () => {
        this._quiltScrollQuietFlushTimer = null;
        if (this._parallaxScrollActive && Date.now() - started < maxWaitMs) {
          this._quiltScrollQuietFlushTimer = setTimeout(tick, 64);
          return;
        }
        this._flushQuiltScrollQuietQueue();
      };
      this._quiltScrollQuietFlushTimer = setTimeout(tick, 64);
    }

    _flushQuiltScrollQuietQueue() {
      if (this._quiltScrollQuietFlushTimer != null) {
        clearTimeout(this._quiltScrollQuietFlushTimer);
        this._quiltScrollQuietFlushTimer = null;
      }
      const queue = Array.isArray(this._quiltScrollQuietQueue) ? this._quiltScrollQuietQueue : [];
      this._quiltScrollQuietQueue = [];
      queue.forEach((job) => {
        try {
          job();
        } catch (error) {
          this.logger?.warn?.('Deferred quilt scroll work failed:', error);
        }
      });
    }

    _schedulePostLaunchIdleTask(key, task, options = {}) {
      const taskKey = String(key || '').trim();
      if (!taskKey || typeof task !== 'function') return null;
      if (!this._postLaunchIdleTasks) this._postLaunchIdleTasks = new Map();
      if (this._postLaunchIdleTasks.has(taskKey)) return this._postLaunchIdleTasks.get(taskKey);

      const delayMs = Math.max(0, Number(options.delayMs) || 0);
      const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 6000);
      const label = String(options.label || taskKey);
      const urgent = options.urgent === true || this._isCapacitorNativeClient();
      const state = {
        timer: null,
        idleId: null,
        listener: null,
        promise: null
      };

      const run = () => {
        state.timer = null;
        state.idleId = null;
        state.listener = null;
        state.promise = Promise.resolve()
          .then(task)
          .catch((error) => {
            this.logger?.warn?.(`${label} failed:`, error);
          })
          .finally(() => {
            this._postLaunchIdleTasks?.delete(taskKey);
          });
      };

      const scheduleIdle = () => {
        if (state.timer || state.idleId || state.promise) return;
        state.timer = setTimeout(() => {
          state.timer = null;
          // Native: requestIdleCallback often fires mid-scroll and causes hitching.
          if (urgent || typeof requestIdleCallback !== 'function') {
            state.timer = setTimeout(run, urgent ? 0 : 1);
            return;
          }
          state.idleId = requestIdleCallback(run, { timeout: timeoutMs });
        }, delayMs);
      };

      if (this._portalSplashDismissed || options.allowBeforeSplash === true) {
        scheduleIdle();
      } else {
        state.listener = () => scheduleIdle();
        document.addEventListener('odqPortalLaunchReady', state.listener, { once: true });
      }

      this._postLaunchIdleTasks.set(taskKey, state);
      return state;
    }

    _notifyPortalLaunchReadyForIdleWork() {
      try {
        document.dispatchEvent(new CustomEvent('odqPortalLaunchReady'));
      } catch (_) {
        /* */
      }
    }

    scheduleReflectionThemesArchivePrefetch() {
      if (this._reflectionArchivePrefetchLaunchScheduled) return;
      this._reflectionArchivePrefetchLaunchScheduled = true;
      const schedule = () => {
        this._schedulePostLaunchIdleTask(
          'reflection-archive-prefetch',
          () => this.prefetchReflectionThemesArchivePage?.(),
          {
            delayMs: 0,
            timeoutMs: 12000,
            label: 'Reflection archive prefetch'
          }
        );
      };
      if (window.db && window.firestore?.getDoc) {
        schedule();
        return;
      }
      document.addEventListener('firebaseReady', schedule, { once: true });
    }

    _scheduleReflectionThemesForLaunch() {
      if (this._reflectionThemesLaunchLoadScheduled) return;
      this._reflectionThemesLaunchLoadScheduled = true;
      // Native: start immediately during portal dwell. Web: idle so quilt paint stays first.
      if (this._isCapacitorNativeClient()) {
        void this.loadReflectionThemesForToday?.();
        return;
      }
      this._schedulePostLaunchIdleTask(
        'reflection-themes-today',
        () => this.loadReflectionThemesForToday?.(),
        {
          delayMs: 0,
          timeoutMs: 4000,
          allowBeforeSplash: true,
          label: 'Reflection themes load'
        }
      );
    }

    _scheduleLaunchSharePrep(dateKey) {
      const key = String(dateKey || Utils.getTodayKey?.() || '').trim();
      if (!key) return;
      this._schedulePostLaunchIdleTask(
        `layout-b-share-prep:${key}`,
        async () => {
          await this.ensureLayoutBComposeReady();
          void globalThis.odqPrefetchLayoutBKeywordEmphasis?.(key);
          void globalThis.odqPrefetchSpeakerCutoutTweak?.(key);
          void globalThis.odqPrefetchMirrorTune?.(key);
        },
        {
          delayMs: 3200,
          timeoutMs: 9000,
          label: 'Layout B share prep'
        }
      );
    }

    _scheduleSpeakerImageCanvasPrepForLaunch(cutoutUrl, quote) {
      const url = String(cutoutUrl || '').trim();
      if (!url || !this.archiveService?._prepareSpeakerImageUrlForCanvas) return;
      this._schedulePostLaunchIdleTask(
        `speaker-canvas-prep:${url}`,
        () =>
          this.archiveService._prepareSpeakerImageUrlForCanvas(url, {
            quote,
            skipCutoutExportFinalize: true
          }),
        {
          delayMs: 2400,
          timeoutMs: 9000,
          label: 'Speaker canvas prep'
        }
      );
    }

    _mergeAppSlicePrototype(SliceCtor) {
      if (typeof SliceCtor !== 'function') return false;
      const proto = Object.getPrototypeOf(this);
      for (const name of Object.getOwnPropertyNames(SliceCtor.prototype)) {
        if (name === 'constructor') continue;
        proto[name] = SliceCtor.prototype[name];
      }
      return true;
    }

    _loadDeferredScript(src, globalName, timeoutMs = 15000) {
      if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
      if (!this._deferredScriptPromises) this._deferredScriptPromises = new Map();
      if (this._deferredScriptPromises.has(src)) return this._deferredScriptPromises.get(src);
      const promise = new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          this._deferredScriptPromises.delete(src);
          reject(new Error(`Timed out loading ${src} after ${timeoutMs}ms`));
        }, timeoutMs);
        const settle = (fn, arg) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn(arg);
        };
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          existing.addEventListener('load', () => settle(resolve, globalThis[globalName]), { once: true });
          existing.addEventListener('error', () => settle(reject, new Error(`Failed to load ${src}`)), { once: true });
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => settle(resolve, globalThis[globalName]);
        script.onerror = () => settle(reject, new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
      this._deferredScriptPromises.set(src, promise);
      return promise;
    }

    async loadDeferredAdminSlice() {
      if (this._deferredAdminSliceReady) return true;
      const SliceCtor = await this._loadDeferredScript(
        'lib/simplified-quilt-app-admin.js?v=41',
        'SimplifiedQuiltAppV2Admin'
      );
      if (!this._mergeAppSlicePrototype(SliceCtor)) return false;
      this._deferredAdminSliceReady = true;
      this.checkSecretAdminAccess?.();
      this.setupArchiveEventHandlers?.();
      if (CONFIG.APP.enableAdminTools) this.setupLongPressAdminAccess?.();
      this._scheduleAdminTuneReminderAfterAdminReady();
      this.refreshReflectionWallForAdminControls?.();
      return true;
    }

    _adminTuneReminderDateKey() {
      return String(
        this.getDailyVisitDateKey?.() ||
          this.getEffectiveAppDateKey?.() ||
          Utils.getTodayKey?.() ||
          ''
      ).trim();
    }

    _isAdminTuneReminderEnabledForThisDevice() {
      try {
        return localStorage.getItem('ourDailyIsAdmin') === 'true';
      } catch (_) {
        return false;
      }
    }

    _adminTuneReminderStorageKey() {
      return ['odq', 'AdminTuneReminderSeenDate'].join('');
    }

    _setLocalAdminTuneReminderCompleted(dateKey) {
      try {
        localStorage.setItem(this._adminTuneReminderStorageKey(), dateKey);
      } catch (_) {
        /* localStorage may be unavailable in private browsing */
      }
    }

    _isLocalAdminTuneReminderCompleted(dateKey) {
      try {
        return localStorage.getItem(this._adminTuneReminderStorageKey()) === dateKey;
      } catch (_) {
        return false;
      }
    }

    _adminTuneReminderDocRef(dateKey) {
      if (!window.db || !window.firestore?.doc) return null;
      return window.firestore.doc(window.db, 'adminTuneReminders', dateKey);
    }

    async _waitForAdminTuneReminderFirestoreReady(timeoutMs = 2500) {
      if (window.db && window.firestore) return true;
      return new Promise((resolve) => {
        let settled = false;
        const finish = (ready) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          document.removeEventListener('firebaseReady', onReady);
          resolve(ready);
        };
        const onReady = () => finish(!!(window.db && window.firestore));
        const timer = window.setTimeout(() => finish(!!(window.db && window.firestore)), timeoutMs);
        document.addEventListener('firebaseReady', onReady, { once: true });
      });
    }

    async _waitForAdminTuneReminderAuthReady(timeoutMs = 2500) {
      const auth = window.firebaseAuth;
      if (!auth) return false;
      try {
        if (typeof auth.authStateReady === 'function') {
          await Promise.race([
            auth.authStateReady(),
            new Promise((resolve) => window.setTimeout(resolve, timeoutMs))
          ]);
        }
      } catch (_) {
        /* authStateReady is best effort for this non-critical marker */
      }
      return !!auth.currentUser;
    }

    async _isSharedAdminTuneReminderCompleted(dateKey) {
      if (this._isLocalAdminTuneReminderCompleted(dateKey)) return true;

      await this._waitForAdminTuneReminderFirestoreReady();
      const ref = this._adminTuneReminderDocRef(dateKey);
      const readDoc = window.firestore?.getDocFromServer || window.firestore?.getDoc;
      if (!ref || typeof readDoc !== 'function') return false;

      try {
        const snap = await readDoc(ref);
        const completed = !!(snap.exists?.() && snap.data?.()?.completed);
        if (completed) this._setLocalAdminTuneReminderCompleted(dateKey);
        return completed;
      } catch (error) {
        this.logger?.warn?.('Shared admin tune reminder read failed:', error);
        return false;
      }
    }

    async _markSharedAdminTuneReminderCompleted(dateKey) {
      this._setLocalAdminTuneReminderCompleted(dateKey);

      await this._waitForAdminTuneReminderFirestoreReady();
      await this._waitForAdminTuneReminderAuthReady();
      const ref = this._adminTuneReminderDocRef(dateKey);
      if (!ref || typeof window.firestore?.setDoc !== 'function') return false;

      try {
        await window.firestore.setDoc(
          ref,
          {
            completed: true,
            completedAtIso: new Date().toISOString(),
            source: 'admin_tune_modal'
          },
          { merge: true }
        );
        return true;
      } catch (error) {
        this.logger?.warn?.('Shared admin tune reminder write failed:', error);
        return false;
      }
    }

    _adminDailyTaskDateKey() {
      // Always anchor checklist state to calendar today — never admin preview date.
      return String(
        this.quoteService?.getQuoteCalendarKeyNow?.() ||
          Utils.getTodayKey?.() ||
          ''
      ).trim();
    }

    _adminDailyTaskStorageKey(dateKey) {
      return ['odq', 'AdminDailyTasks:', dateKey].join('');
    }

    _normalizeAdminDailyTasks(data = {}) {
      return {
        igPostCompleted: !!data.igPostCompleted,
        previewTomorrowCompleted: !!data.previewTomorrowCompleted,
        previewTomorrowDateKey: String(data.previewTomorrowDateKey || '').trim()
      };
    }

    _mergeAdminDailyTasks(...sources) {
      const merged = this._normalizeAdminDailyTasks();
      for (const source of sources) {
        if (!source) continue;
        const next = this._normalizeAdminDailyTasks(source);
        merged.igPostCompleted = merged.igPostCompleted || next.igPostCompleted;
        merged.previewTomorrowCompleted =
          merged.previewTomorrowCompleted || next.previewTomorrowCompleted;
        if (next.previewTomorrowDateKey) {
          merged.previewTomorrowDateKey = next.previewTomorrowDateKey;
        }
      }
      return merged;
    }

    _adminDailyTaskPushPatch(tasks = {}) {
      const normalized = this._normalizeAdminDailyTasks(tasks);
      const patch = {};
      if (normalized.igPostCompleted) patch.igPostCompleted = true;
      if (normalized.previewTomorrowCompleted) {
        patch.previewTomorrowCompleted = true;
        if (normalized.previewTomorrowDateKey) {
          patch.previewTomorrowDateKey = normalized.previewTomorrowDateKey;
        }
      }
      return patch;
    }

    async _readAdminDailyTasksFromFirestore(dateKey) {
      await this._waitForAdminTuneReminderFirestoreReady();
      const ref = this._adminDailyTaskDocRef(dateKey);
      const readDoc = window.firestore?.getDocFromServer || window.firestore?.getDoc;
      if (!ref || typeof readDoc !== 'function') return null;

      try {
        const snap = await readDoc(ref);
        if (!snap.exists?.()) return this._normalizeAdminDailyTasks();
        return this._normalizeAdminDailyTasks(snap.data?.() || {});
      } catch (error) {
        this.logger?.warn?.('Admin daily task status read failed:', error);
        return null;
      }
    }

    _readLocalAdminDailyTasks(dateKey) {
      try {
        const raw = localStorage.getItem(this._adminDailyTaskStorageKey(dateKey));
        return raw ? this._normalizeAdminDailyTasks(JSON.parse(raw)) : this._normalizeAdminDailyTasks();
      } catch (_) {
        return this._normalizeAdminDailyTasks();
      }
    }

    _writeLocalAdminDailyTasks(dateKey, patch = {}) {
      // Completion flags are sticky for the day — never let a partial remote
      // payload with explicit `false` wipe a locally completed task.
      const current = this._readLocalAdminDailyTasks(dateKey);
      const next = this._mergeAdminDailyTasks(current, patch);
      try {
        localStorage.setItem(this._adminDailyTaskStorageKey(dateKey), JSON.stringify(next));
      } catch (_) {
        /* localStorage may be unavailable in private browsing */
      }
      return next;
    }

    _adminDailyTaskDocRef(dateKey) {
      if (!window.db || !window.firestore?.doc) return null;
      return window.firestore.doc(window.db, 'adminDailyTasks', dateKey);
    }

    _adminDailyTaskApiBaseUrl() {
      const configured = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (configured) return configured;
      try {
        return String(window.location?.origin || '').replace(/\/$/, '');
      } catch (_) {
        return '';
      }
    }

    async _readAdminDailyTasksViaBackend(dateKey) {
      const baseUrl = this._adminDailyTaskApiBaseUrl();
      if (!baseUrl || typeof fetch !== 'function') return null;
      try {
        const res = await fetch(`${baseUrl}/api/admin-daily-tasks/${encodeURIComponent(dateKey)}`, {
          cache: 'no-store'
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) return null;
        return this._normalizeAdminDailyTasks(data.tasks || {});
      } catch (error) {
        this.logger?.warn?.('Admin daily task backend read failed:', error);
        return null;
      }
    }

    async _writeAdminDailyTasksViaBackend(dateKey, patch = {}) {
      const baseUrl = this._adminDailyTaskApiBaseUrl();
      if (!baseUrl || typeof fetch !== 'function') return null;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer =
        controller != null ? window.setTimeout(() => controller.abort(), 5000) : null;
      try {
        const res = await fetch(`${baseUrl}/api/admin-daily-tasks/${encodeURIComponent(dateKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
          signal: controller?.signal
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) return null;
        return this._normalizeAdminDailyTasks(data.tasks || patch);
      } catch (error) {
        this.logger?.warn?.('Admin daily task backend write failed:', error);
        return null;
      } finally {
        if (timer != null) window.clearTimeout(timer);
      }
    }

    _ensureAdminDailyTaskBannerMounted() {
      const banner = document.getElementById('adminDailyTaskBanner');
      if (!banner || banner.parentElement === document.body) return;
      document.body.appendChild(banner);
    }

    _setupAdminDailyTaskBannerHandlers() {
      if (this._adminDailyTaskBannerHandlersReady) return;
      const banner = document.getElementById('adminDailyTaskBanner');
      if (!banner) return;
      this._ensureAdminDailyTaskBannerMounted();
      this._adminDailyTaskBannerHandlersReady = true;
      banner.addEventListener(
        'click',
        (e) => {
          const btn = e.target.closest('[data-admin-task-action]');
          if (!btn || !banner.contains(btn)) return;
          e.preventDefault();
          e.stopPropagation();
          const action = String(btn.dataset.adminTaskAction || '').trim();
          if (action === 'previewTomorrow') {
            void this._handleAdminDailyTaskPreviewTomorrowTap();
          }
        },
        { capture: true }
      );
    }

    async _handleAdminDailyTaskPreviewTomorrowTap() {
      if (!CONFIG.APP.enableAdminTools || !this._isAdminTuneReminderEnabledForThisDevice()) return;
      await this.loadDeferredAdminSlice?.().catch(() => false);
      if (!this.isCurrentUserAdmin?.()) {
        const ok = await this.requestAdminAccess?.();
        if (!ok || !this.isCurrentUserAdmin?.()) return;
      }
      await this.handleAdminPreviewTomorrowQuiltScreen?.();
    }

    _renderAdminDailyTaskBanner(state = null) {
      const banner = document.getElementById('adminDailyTaskBanner');
      if (!banner) return;
      this._ensureAdminDailyTaskBannerMounted();
      this._setupAdminDailyTaskBannerHandlers?.();
      const onQuiltScreen = document.getElementById('screen-quilt')?.classList.contains('active');
      const show =
        onQuiltScreen &&
        CONFIG.APP.enableAdminTools &&
        this._isAdminTuneReminderEnabledForThisDevice();
      banner.hidden = !show;
      banner.setAttribute('aria-hidden', show ? 'false' : 'true');
      if (!show) return;

      const dateKey = this._adminDailyTaskDateKey();
      const tasks = state || this._readLocalAdminDailyTasks(dateKey);
      const igEl = banner.querySelector('[data-admin-task-item="igPost"]');
      const previewEl = banner.querySelector('[data-admin-task-item="previewTomorrow"]');
      igEl?.classList.toggle('is-complete', !!tasks.igPostCompleted);
      previewEl?.classList.toggle('is-complete', !!tasks.previewTomorrowCompleted);
      const doneCount = (tasks.igPostCompleted ? 1 : 0) + (tasks.previewTomorrowCompleted ? 1 : 0);
      banner.setAttribute(
        'aria-label',
        `Admin tasks today: ${doneCount} of 2 complete. IG post ${
          tasks.igPostCompleted ? 'complete' : 'not complete'
        }. Preview tomorrow ${tasks.previewTomorrowCompleted ? 'complete' : 'not complete'}.`
      );
    }

    async refreshAdminDailyTaskBanner() {
      if (!CONFIG.APP.enableAdminTools || !this._isAdminTuneReminderEnabledForThisDevice()) {
        this._detachAdminDailyTaskListener?.();
        this._renderAdminDailyTaskBanner();
        return;
      }

      const dateKey = this._adminDailyTaskDateKey();
      if (!dateKey) return;
      const localTasks = this._readLocalAdminDailyTasks(dateKey);
      this._renderAdminDailyTaskBanner(localTasks);

      let remoteTasks = await this._readAdminDailyTasksViaBackend(dateKey);
      if (!remoteTasks) {
        remoteTasks = await this._readAdminDailyTasksFromFirestore(dateKey);
      }

      const merged = this._mergeAdminDailyTasks(localTasks, remoteTasks);
      const tasks = this._writeLocalAdminDailyTasks(dateKey, merged);
      this._renderAdminDailyTaskBanner(tasks);

      const pushPatch = this._adminDailyTaskPushPatch(tasks);
      const remote = this._normalizeAdminDailyTasks(remoteTasks || {});
      const needsPush =
        (pushPatch.igPostCompleted && !remote.igPostCompleted) ||
        (pushPatch.previewTomorrowCompleted && !remote.previewTomorrowCompleted);
      if (needsPush) {
        await this._writeAdminDailyTasksViaBackend(dateKey, pushPatch);
      }

      void this._attachAdminDailyTaskListener?.(dateKey);
    }

    _detachAdminDailyTaskListener() {
      if (typeof this._adminDailyTaskUnsub === 'function') {
        try {
          this._adminDailyTaskUnsub();
        } catch (_) {
          /* listener teardown is best effort */
        }
      }
      this._adminDailyTaskUnsub = null;
      this._adminDailyTaskListenerDateKey = '';
    }

    async _attachAdminDailyTaskListener(dateKey) {
      const dk = String(dateKey || '').trim();
      if (!dk) return;
      if (this._adminDailyTaskListenerDateKey === dk && this._adminDailyTaskUnsub) return;

      this._detachAdminDailyTaskListener();
      await this._waitForAdminTuneReminderFirestoreReady();
      const ref = this._adminDailyTaskDocRef(dk);
      const onSnapshot = window.firestore?.onSnapshot;
      if (!ref || typeof onSnapshot !== 'function') return;

      this._adminDailyTaskListenerDateKey = dk;
      this._adminDailyTaskUnsub = onSnapshot(
        ref,
        (snap) => {
          const remote = snap.exists?.()
            ? this._normalizeAdminDailyTasks(snap.data?.() || {})
            : this._normalizeAdminDailyTasks();
          const local = this._readLocalAdminDailyTasks(dk);
          const merged = this._mergeAdminDailyTasks(local, remote);
          const tasks = this._writeLocalAdminDailyTasks(dk, merged);
          this._renderAdminDailyTaskBanner(tasks);
        },
        (error) => {
          this.logger?.warn?.('Admin daily task listener failed:', error);
          this._detachAdminDailyTaskListener();
        }
      );
    }

    _clearAdminDailyTaskBannerPolling() {
      if (this._adminDailyTaskBannerPollTimer) {
        window.clearInterval(this._adminDailyTaskBannerPollTimer);
        this._adminDailyTaskBannerPollTimer = 0;
      }
      this._detachAdminDailyTaskListener?.();
    }

    _scheduleAdminDailyTaskBannerPolling() {
      if (!CONFIG.APP.enableAdminTools || !this._isAdminTuneReminderEnabledForThisDevice()) {
        this._clearAdminDailyTaskBannerPolling();
        return;
      }
      const dateKey = this._adminDailyTaskDateKey();
      if (dateKey) {
        void this._attachAdminDailyTaskListener?.(dateKey);
      }
      if (this._adminDailyTaskBannerPollTimer) return;
      this._adminDailyTaskBannerPollTimer = window.setInterval(() => {
        const isQuiltScreenActive = document.querySelector('.screen.active')?.id === 'screen-quilt';
        if (!isQuiltScreenActive) {
          this._clearAdminDailyTaskBannerPolling();
          return;
        }
        if (document.visibilityState === 'hidden') return;
        void this.refreshAdminDailyTaskBanner?.();
      }, 12000);
    }

    async markAdminDailyTaskCompleted(task, meta = {}) {
      const dateKey = String(meta.adminTaskDateKey || this._adminDailyTaskDateKey() || '').trim();
      if (!dateKey) return false;

      const nowIso = new Date().toISOString();
      const patch = { updatedAtIso: nowIso };
      if (task === 'igPost') {
        patch.igPostCompleted = true;
        patch.igPostCompletedAtIso = nowIso;
        patch.igPostSource = String(meta.source || 'admin').trim();
      } else if (task === 'previewTomorrow') {
        patch.previewTomorrowCompleted = true;
        patch.previewTomorrowCompletedAtIso = nowIso;
        patch.previewTomorrowDateKey = String(meta.previewDateKey || '').trim();
      } else {
        return false;
      }

      const tasks = this._writeLocalAdminDailyTasks(dateKey, patch);
      this._renderAdminDailyTaskBanner(tasks);

      let wroteRemote = false;
      const backendTasks = await this._writeAdminDailyTasksViaBackend(dateKey, patch);
      if (backendTasks) {
        const syncedTasks = this._writeLocalAdminDailyTasks(dateKey, backendTasks);
        this._renderAdminDailyTaskBanner(syncedTasks);
        wroteRemote = true;
      } else {
        await this._waitForAdminTuneReminderFirestoreReady();
        await this._waitForAdminTuneReminderAuthReady();
        const ref = this._adminDailyTaskDocRef(dateKey);
        if (ref && typeof window.firestore?.setDoc === 'function') {
          try {
            await window.firestore.setDoc(ref, patch, { merge: true });
            wroteRemote = true;
          } catch (error) {
            this.logger?.warn?.('Admin daily task status write failed:', error);
          }
        }
      }

      const latest = this._readLocalAdminDailyTasks(dateKey);
      this._renderAdminDailyTaskBanner(latest);
      if (latest.igPostCompleted && latest.previewTomorrowCompleted) {
        await this._markSharedAdminTuneReminderCompleted(dateKey);
      }
      // Pull/merge again so other devices / listeners stay aligned after a mark.
      void this.refreshAdminDailyTaskBanner?.();
      return wroteRemote || latest.igPostCompleted || latest.previewTomorrowCompleted;
    }

    _scheduleAdminTuneReminderAfterAdminReady() {
      if (this._adminTuneReminderScheduled) return;
      if (!CONFIG.APP.enableAdminTools) return;
      if (!this._isAdminTuneReminderEnabledForThisDevice()) return;
      this._adminTuneReminderScheduled = true;
      void this.refreshAdminDailyTaskBanner?.();
    }

    async loadDeferredSocialSlice() {
      if (this._deferredSocialSliceReady) return true;
      const SliceCtor = await this._loadDeferredScript(
        'lib/simplified-quilt-app-social.js?v=4',
        'SimplifiedQuiltAppV2Social'
      );
      if (!this._mergeAppSlicePrototype(SliceCtor)) return false;
      this._deferredSocialSliceReady = true;
      this.setupSocialEventHandlers?.();
      void this.checkForUnseenSocialPosts?.();
      void this.refreshDailyQuotePushRegistration?.();
      if (document.getElementById('screen-social-posts')?.classList.contains('active')) {
        void this.initializeSocialPostsFeedScreen?.();
      }
      return true;
    }

    async ensureLayoutBComposeReady() {
      if (this._layoutBComposeReady) return true;
      await this._loadDeferredScript('lib/layout-b-compose.js?v=170', 'composeInstagramLayoutBFromQuiltBlob');
      await this._loadDeferredScript('lib/layout-b-carousel-strips.js?v=71', 'odqInitCarouselStripLayout');
      this._layoutBComposeReady = true;
      globalThis.ensureLayoutBComposeReady = () => this.ensureLayoutBComposeReady();
      return true;
    }

    scheduleDeferredAppSlices() {
      if (CONFIG.APP.enableAdminTools) {
        if (this._isAdminTuneReminderEnabledForThisDevice()) {
          this._schedulePostLaunchIdleTask(
            'admin-daily-task-sync',
            () => this.refreshAdminDailyTaskBanner?.(),
            {
              delayMs: 1200,
              timeoutMs: 8000,
              label: 'Admin daily task sync',
              allowBeforeSplash: true
            }
          );
        }
        this._schedulePostLaunchIdleTask(
          'deferred-admin-slice',
          () => this.loadDeferredAdminSlice(),
          {
            delayMs: 7000,
            timeoutMs: 12000,
            label: 'Deferred admin slice'
          }
        );
      }
      if (CONFIG.APP.socialPostsEnabled === true) {
        this._schedulePostLaunchIdleTask(
          'deferred-social-slice',
          () => this.loadDeferredSocialSlice(),
          {
            delayMs: 9000,
            timeoutMs: 12000,
            label: 'Deferred social slice'
          }
        );
      }
    }

    isCurrentUserAdmin() {
      return false;
    }

    canManageSocialPosts() {
      return false;
    }

    canAccessSocialPosts() {
      return false;
    }

    guardSocialPostsManageAccess({ redirect = true } = {}) {
      if (redirect) {
        this.uiService?.showToast?.('Admin access required');
        this.uiService?.showScreen?.('screen-quilt');
      }
      return false;
    }

    guardSocialPostsAccess(options = {}) {
      return this.guardSocialPostsManageAccess(options);
    }

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
        this._applyPickerStartupHSV();
        this.colorHasBeenSelected = false;
        queueMicrotask(() => {
          if (typeof this.updateColorWheel === 'function') this.updateColorWheel();
        });
      } catch (_) {
        /* */
      }
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

    _revealNativeLaunchShell() {
      this._dismissBootSplash();
      this._notifyNativeLaunchCoverReady();
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
      this._revealNativeLaunchShell();
    }

    _showConnectionProblemFailed(_reason) {
      this._clearLaunchSyncWatchdog();
      this._clearConnectionProblemSlowDelay();
      document.body.classList.add('odq-live-daily-pending');
      this._setConnectionProblemUi({
        message: "Couldn't load today's quilt. Please check your connection and try again.",
        showRetry: true,
        retryDisabled: false
      });
      this.uiService?.showScreen?.('screen-connection-problem');
      if (window.odqPerfMark) window.odqPerfMark('launch-sync-failed');
      this._revealNativeLaunchShell();
    }

    _clearLaunchSyncWatchdog() {
      if (this._launchSyncWatchdogTimer) {
        clearTimeout(this._launchSyncWatchdogTimer);
        this._launchSyncWatchdogTimer = null;
      }
    }

    /** Never leave the native launch cover up indefinitely while Firestore is slow. */
    _startLaunchSyncWatchdog() {
      this._clearLaunchSyncWatchdog();
      const isNative =
        typeof window.odqIsCapacitorNative === 'function' && window.odqIsCapacitorNative();
      const timeoutMs = isNative ? 28000 : 22000;
      this._launchSyncWatchdogTimer = setTimeout(() => {
        this._launchSyncWatchdogTimer = null;
        if (this._liveDailyDataConfirmed || this._postLiveSyncInitialized) return;
        this.logger.warn('Launch sync watchdog: live daily never confirmed');
        if (this._hasCachedTodayQuilt()) {
          void this._finishLaunchWithCachedQuilt('sync_timeout');
          return;
        }
        this._showConnectionProblemFailed('sync_timeout');
      }, timeoutMs);
    }

    async _finishLaunchWithCachedQuilt(reason) {
      if (this._liveDailyDataConfirmed || this._postLiveSyncInitialized) return;
      this.logger.warn('Launch sync failed; continuing with cached quilt:', reason);
      await this._ensureTodayQuotePinnedForLaunch({ quiltOnlyLaunch: true });
      if (!this.quoteService?.hasTodayQuotePinned?.()) {
        this.logger.warn('Cached quilt fallback blocked: today quote not pinned');
        this._showConnectionProblemFailed('quote_assignment');
        return;
      }
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
        if (!retry.ok) {
          this._scheduleResumeQuiltSyncRetry?.();
          return;
        }
        this.updateSquareCounter();
        this.quoteService.displayQuote();
        this.renderQuilt?.();
      });
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

      await this.quoteService.loadSeamsideEpisodesFromFirestore({ requireServer: false });

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
      const submittedViaSig = (q) =>
        String(q?.submittedVia ?? q?.submitted_via ?? q?.submittedViaSnapshot ?? '')
          .trim()
          .toLowerCase();
      const unchanged =
        String(beforeQuote?.text || '').trim() === String(afterQuote?.text || '').trim() &&
        moodSig(beforeQuote) === moodSig(afterQuote) &&
        watchSig(beforeQuote) === watchSig(afterQuote) &&
        speakerSig(beforeQuote) === speakerSig(afterQuote) &&
        submittedViaSig(beforeQuote) === submittedViaSig(afterQuote);
      if (unchanged) return;
      this.quoteService.displayQuote();
      void this._primeQuiltQuoteChrome();
      this.updateBeforeYouGoSection?.();
      this.refreshSeamsidePodcastWidget?.(afterQuote);
    }

    _reflectionWallContentKey(themeEntries = [], myReflection = null) {
        const serializeEntry = (entry) => {
        if (entry?.split && Array.isArray(entry.strips)) {
          return {
            split: true,
            strips: entry.strips.map((strip) => ({
              text: String(strip?.text || '').trim(),
              author: String(strip?.author || '').trim(),
              responseId: String(strip?.responseId || '').trim(),
              heartCount: Math.max(0, Number(strip?.heartCount) || 0),
              adminHighlight: strip?.adminHighlight === true
            }))
          };
        }
        return {
          text: String(entry?.text || '').trim(),
          author: String(entry?.author || '').trim(),
          responseId: String(entry?.responseId || '').trim(),
          heartCount: Math.max(0, Number(entry?.heartCount) || 0),
          adminHighlight: entry?.adminHighlight === true,
          mergedResponseIds: Array.isArray(entry?.mergedResponseIds)
            ? entry.mergedResponseIds.map((id) => String(id || '').trim()).filter(Boolean)
            : []
        };
      };
      return JSON.stringify({
        themes: (Array.isArray(themeEntries) ? themeEntries : []).map(serializeEntry),
        mine: String(myReflection?.responseId || '').trim()
      });
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
        const quote = qs?.getTodayQuote?.() || null;
        void qs?.loadSeamsideEpisodesFromFirestore?.({ requireServer: false });
        qs?.populateReflectionPromptCard?.();
        // Paint scrap / podcast chrome from cache during portal dwell — do not wait for quilt render.
        this.refreshQuiltReflectionScrapWidget?.(quote);
        this.refreshSeamsidePodcastWidget?.(quote);
        this._primeQuiltMoodAndClippingEarly?.(quote, dateKey);
        this.updateBeforeYouGoSection?.();
        this.mountQuiltNameLeaderboard?.();
        this._scheduleReflectionThemesForLaunch?.();
        this.prewarmQuiltScrollPaperImages?.();
        return;
      }

      if (phase === 'rendered') {
        if (this._seamsidePreviewActive && this._seamsidePreviewQuote) return;
        const quote = this.quoteService?.getTodayQuote?.() || null;
        this.refreshQuiltReflectionScrapWidget?.(quote);
        this.refreshSeamsidePodcastWidget?.(quote);
        this._primeQuiltMoodAndClippingEarly?.(quote, dateKey);
        // Quilt is up — finish themes now if idle work has not already claimed them.
        this._ensureQuiltLowerSections({ phase: 'network' });
        this.prewarmQuiltScrollPaperImages?.();
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
      this._layoutBStoryPreviewLaunchScheduled = true;
      this._schedulePostLaunchIdleTask(
        'layout-b-story-preview-launch',
        async () => {
          this.scheduleLayoutBStoryPreviewRefresh?.();
        },
        {
          delayMs: 5200,
          timeoutMs: 10000,
          label: 'Layout B story preview'
        }
      );
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
          this._scheduleSpeakerImageCanvasPrepForLaunch?.(cutoutUrl, quote);
          const quiltScreenActive = document.getElementById('screen-quilt')?.classList?.contains('active') === true;
          const quiltAlreadyPainted = Number(this.renderer?.quiltSVG?.childElementCount || 0) > 0;
          if (
            options.refresh !== true &&
            quiltScreenActive &&
            quiltAlreadyPainted &&
            this._launchQuiltPipelineRendered
          ) {
            this._ensureQuiltLowerSections({ phase: 'rendered', scheduleStoryPreview: true });
            return;
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
    async _ensureTodayQuotePinnedForLaunch(options = {}) {
      const quiltOnlyLaunch = options.quiltOnlyLaunch === true;
      const isNative =
        typeof window.odqIsCapacitorNative === 'function' && window.odqIsCapacitorNative();
      this.quoteService.primeTodayQuoteFromLocalAssignment();
      if (this.quoteService.hasTodayQuotePinned()) {
        if (isNative && quiltOnlyLaunch) return true;
        const todayKey = this.quoteService.getQuoteCalendarKeyNow();
        const stillValid = await this.quoteService.reconcilePinWithFirestoreAssignment(todayKey);
        if (stillValid && this.quoteService.hasTodayQuotePinned()) return true;
      }

      if (isNative) {
        const todayKey = this.quoteService.getQuoteCalendarKeyNow();
        const viaApi = await this.quoteService._resolveTodayQuoteForLaunchViaServerApi(todayKey);
        if (viaApi || this.quoteService.hasTodayQuotePinned()) return true;
      }

      const slimOk = await this.quoteService.resolveTodayQuoteForLaunch();
      if (slimOk) {
        if (window.odqPerfMark) window.odqPerfMark('launch-quote-slim');
        return true;
      }

      if (quiltOnlyLaunch) {
        return this.quoteService.hasTodayQuotePinned?.() || false;
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
      if (this.isAdminTomorrowPreviewActive?.()) {
        return { ok: false, reason: 'admin_preview_active', transient: true };
      }
      if (this._liveDailySyncInFlight) {
        return { ok: false, reason: 'sync_in_flight', transient: true };
      }
      this._liveDailySyncInFlight = true;
      const syncStartedAt = Date.now();
      const mode = options.mode || 'full';
      try {
        const isNative =
          typeof window.odqIsCapacitorNative === 'function' && window.odqIsCapacitorNative();
        const firebaseWaitMs = quiltOnly
          ? options.mode === 'resume'
            ? 8000
            : isNative
              ? 20000
              : 12000
          : 20000;
        const firebaseReady = await LiveDailyDataSync.waitForFirebaseReady(firebaseWaitMs);
        if (!firebaseReady && !(isNative && quiltOnly)) {
          return { ok: false, reason: 'firebase_unavailable' };
        }

        const todayKey = Utils.getTodayKey();
        let quiltResult;
        let quotesPinned = false;
        if (quiltOnly) {
          [quiltResult, quotesPinned] = await Promise.all([
            this.dataService.loadQuiltFromServer(todayKey),
            this._ensureTodayQuotePinnedForLaunch({ quiltOnlyLaunch: true })
          ]);
        } else {
          [quiltResult, quotesPinned] = await Promise.all([
            this.dataService.loadQuiltFromServer(todayKey),
            this._ensureTodayQuotePinnedForLaunch()
          ]);
        }
        if (!quiltResult.ok) {
          return { ok: false, reason: quiltResult.reason || 'quilt' };
        }
        if (this.isAdminTomorrowPreviewActive?.()) {
          return { ok: false, reason: 'admin_preview_active', transient: true };
        }
        this._reconcileMirrorTuneFromRemotePayload(todayKey, quiltResult.data);
        await this.applyQuiltDataFromPayload(quiltResult.data);
        this._kickLaunchQuiltPipeline?.({ refresh: true });
        this.attachQuiltLiveListener?.(todayKey);
        void this._maybeScheduleQuiltScreenIgCatchUpFromFirestore?.(todayKey);

        if (!quotesPinned) {
          quotesPinned = this.quoteService?.hasTodayQuotePinned?.() || false;
        }
        if (!quotesPinned) {
          return { ok: false, reason: 'quote_assignment' };
        }

        if (quiltOnly) {
          this._liveDailyDataConfirmed = true;
          this._clearConnectionProblemSlowDelay();
          document.body.classList.remove('odq-live-daily-pending');
          LiveDailyDataSync.recordSuccessfulSync(todayKey);
          this._refreshQuoteScreenIfActive();
          void this._primeQuiltQuoteChrome();
          this._scheduleLaunchSharePrep?.(todayKey);
          return { ok: true, quiltOnly: true };
        }

        this._liveDailyDataConfirmed = true;
        this._clearConnectionProblemSlowDelay();
        document.body.classList.remove('odq-live-daily-pending');
        LiveDailyDataSync.recordSuccessfulSync(todayKey);
        this._refreshQuoteScreenIfActive();
        void this._primeQuiltQuoteChrome();
        this._scheduleLaunchSharePrep?.(todayKey);
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
      const result = await this.syncLiveDailyData({ mode: 'launch-core' });
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

    /** Dev/preview: ?screen=zak|mission|welcome|bridge|first-name|portal|quote|leaderboard|qnlb=submissions|birthdayPreview=tomorrow */
    _getPreviewScreenIdFromQuery() {
      try {
        const params = new URLSearchParams(window.location.search || '');
        const qnlbPreview = String(
          params.get('qnlbPreview') || params.get('qnlbPhase') || ''
        ).trim().toLowerCase();
        const qnlb = String(params.get('qnlb') || '').trim().toLowerCase();
        if (
          qnlbPreview === 'submissions' || qnlbPreview === 'submission' ||
          qnlbPreview === 'voting' || qnlbPreview === 'vote' ||
          qnlb === 'submissions' || qnlb === 'submission' ||
          qnlb === 'voting' || qnlb === 'vote'
        ) {
          this._previewQuiltNameLeaderboard = true;
          return document.getElementById('quiltNameLeaderboardWrap') ? 'screen-quilt' : null;
        }
        if (params.get('qnlb') === '1' || params.get('leaderboard') === '1') {
          this._previewQuiltNameLeaderboard = true;
          return document.getElementById('quiltNameLeaderboardWrap') ? 'screen-quilt' : null;
        }
        const raw = String(params.get('screen') || params.get('preview') || '').trim().toLowerCase();
        if (!raw) return null;
        const map = {
          portal: 'screen-portal',
          'first-name': 'screen-first-name',
          firstname: 'screen-first-name',
          zak: 'screen-intro-zak',
          mission: 'screen-intro-mission',
          welcome: 'screen-welcome',
          bridge: 'screen-first-quote-bridge',
          quote: 'screen-quote',
          leaderboard: 'screen-quilt',
          qnlb: 'screen-quilt',
          'quilt-name-leaderboard': 'screen-quilt'
        };
        const screenId = map[raw] || (raw.startsWith('screen-') ? raw : null);
        if (!screenId || !document.getElementById(screenId)) return null;
        if (
          screenId === 'screen-quilt' &&
          (raw === 'leaderboard' || raw === 'qnlb' || raw === 'quilt-name-leaderboard')
        ) {
          this._previewQuiltNameLeaderboard = true;
        }
        return screenId;
      } catch (_) {
        return null;
      }
    }

    _birthdayPreviewRequestedFromQuery() {
      try {
        const raw = String(
          new URLSearchParams(window.location.search || '').get('birthdayPreview') || ''
        )
          .trim()
          .toLowerCase();
        return raw === '1' || raw === 'true' || raw === 'tomorrow';
      } catch (_) {
        return false;
      }
    }

    _applyBirthdayPreviewDevOverrideFromQuery() {
      if (!this._birthdayPreviewRequestedFromQuery()) return;
      this._birthdayPreviewTomorrowRequested = true;
      const qs = this.quoteService;
      if (!qs || typeof qs.getQuoteCalendarKeyUtc7FromAdjustedToday !== 'function') return;
      const tomorrowKey = qs.getQuoteCalendarKeyUtc7FromAdjustedToday(1);
      qs.devForceBirthdayForDateKey?.(tomorrowKey);
      this.logger?.log?.('Birthday preview dev override active for tomorrow', { dateKey: tomorrowKey });
    }

    async _activateBirthdayPreviewTomorrowIfNeeded() {
      if (!this._birthdayPreviewTomorrowRequested || this._birthdayPreviewTomorrowActivated) return;
      const qs = this.quoteService;
      if (!qs || typeof qs.getQuoteCalendarKeyUtc7FromAdjustedToday !== 'function') return;
      const tomorrowKey = qs.getQuoteCalendarKeyUtc7FromAdjustedToday(1);
      qs.devForceBirthdayForDateKey?.(tomorrowKey);
      if (this.isAdminTomorrowPreviewActive?.() && this.getEffectiveAppDateKey?.() === tomorrowKey) {
        this._birthdayPreviewTomorrowActivated = true;
        this._refreshQuoteSpeakerWidgetNow?.();
        return;
      }
      if (typeof this.activateAdminDatePreview !== 'function') return;
      let host = '';
      try {
        host = String(window.location?.hostname || '').toLowerCase();
      } catch (_) {
        /* ignore */
      }
      const localhostDev = host === 'localhost' || host === '127.0.0.1';
      const result = await this.activateAdminDatePreview(tomorrowKey, {
        requireAdmin: !(localhostDev && this._birthdayPreviewTomorrowRequested),
        showBanner: true,
        navigateToQuilt: true,
        showToast: true,
        markPreviewTomorrowDailyTask: false
      });
      if (result?.ok) {
        this._birthdayPreviewTomorrowActivated = true;
        qs.devForceBirthdayForDateKey?.(tomorrowKey);
        this._refreshQuoteSpeakerWidgetNow?.();
      }
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
      this._notifyPortalLaunchReadyForIdleWork();
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

    /**
     * Mirror tune fields ride on the same quilt doc as blocks. Some devices can't
     * reach Firestore's client SDK reliably for one-shot reads/listeners (falls
     * back to the Railway REST quilt endpoint instead — see loadQuiltFromServer),
     * so reconcile from whatever payload actually succeeded rather than depending
     * on a direct Firestore read. Only call this with a payload known to carry
     * (or deliberately omit) mirror fields as source of truth — not with
     * hand-built partial payloads that never included them.
     */
    _reconcileMirrorTuneFromRemotePayload(dateKey, payload) {
      if (this._mirrorTuneModalOpen) return;
      if (typeof QuiltMirrorLayout === 'undefined') return;
      const key = String(dateKey || '').trim();
      if (!key || !payload || typeof payload !== 'object') return;
      try {
        const remoteTune = QuiltMirrorLayout.odqMirrorTuneFromQuiltData(payload);
        const localTune = QuiltMirrorLayout.odqReadMirrorTuneFromLocal(key);
        const remoteHasFields =
          Object.prototype.hasOwnProperty.call(payload, 'mirrorFlipX') ||
          Object.prototype.hasOwnProperty.call(payload, 'mirrorFlipY') ||
          Object.prototype.hasOwnProperty.call(payload, 'mirrorBottomLayout') ||
          Object.prototype.hasOwnProperty.call(payload, 'mirrorTuneUpdatedAt');
        if (!remoteHasFields) return;
        const remoteAt = String(remoteTune?.updatedAt || payload.mirrorTuneUpdatedAt || '').trim();
        const localAt = String(localTune?.updatedAt || '').trim();
        const remoteTs = Date.parse(remoteAt);
        const localTs = Date.parse(localAt);
        const serverIsNewer =
          Number.isFinite(remoteTs) && (!Number.isFinite(localTs) || remoteTs > localTs);
        if (
          !serverIsNewer &&
          QuiltMirrorLayout.odqMirrorTuneSnapshotsEqual(remoteTune, localTune)
        ) {
          return;
        }
        QuiltMirrorLayout.odqWriteMirrorTuneLocal(key, remoteTune);
        this.renderQuilt?.({ viewportOnly: true });
      } catch (err) {
        this.logger?.warn?.('Mirror tune reconcile from payload failed:', err);
      }
    }

    async applyQuiltDataFromPayload(data, options = {}) {
      const incomingDateKey = String(data?.dateKey || data?.date || Utils.getTodayKey()).trim();
      const adminPreviewBackground = options.adminPreviewBackground === true;
      if (
        this.isAdminTomorrowPreviewActive?.() &&
        incomingDateKey !== this.getEffectiveAppDateKey?.() &&
        !adminPreviewBackground
      ) {
        this.logger?.log?.('Skipped live quilt payload during admin preview', {
          incomingDateKey,
          previewDateKey: this.getEffectiveAppDateKey?.()
        });
        return;
      }
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
              this.quiltEngine._normalizeMacroOriginalBounds(block.macroOriginalBounds) || undefined,
            contributorColor:
              typeof block.contributorColor === 'string' && block.contributorColor.match(/^#[0-9A-Fa-f]{6}$/)
                ? block.contributorColor
                : undefined,
            cohesionPending: block.cohesionPending === true ? true : undefined
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
          this.quiltEngine.recordColorReplayEvents = true;
        } else {
          this.quiltEngine.submissionCount = this._deriveSubmissionCountFromPayload(data);
          this.quiltEngine.setColorReplayEvents(data.colorReplayEvents || []);
          this.quiltEngine.hydrateMacroFreezeFromPersistence(data.macroStructureFrozen === true);
          this.quiltEngine.maybeApplyMacroFreezeAfterHydrate();
          this.quiltEngine.repairMacroRegionIdsAfterLoadIfFrozen();
          this.quiltEngine.applyHarmonyRetroPreviewPass?.();
          this.backfillContributorColorsOnLoadedBlocks?.();
        }
        this.quiltEngine.recalculateDimensionsForCurrentViewport();
      } else {
        this.quiltEngine.initialize();
        this.quiltEngine.recordColorReplayEvents = true;
      }
      this.ensureCurrentUserContributorListed?.();
      this.renderQuiltContributorList?.();
      this._reconcileMirrorTuneFromRemotePayload?.(incomingDateKey, data);
      this._portalQuiltLoaded = true;
    }

    /** When previewing a future/past day, paint today's live quilt behind tomorrow's quote chrome. */
    async _primeAdminPreviewBackgroundQuiltForDatePreview(previewDateKey, prefetchedPayload = null) {
      const previewKey = String(previewDateKey || '').trim();
      if (!previewKey || !this.isAdminTomorrowPreviewActive?.()) return false;

      const qs = this.quoteService;
      const todayKey = String(
        qs?.getQuoteCalendarKeyUtc7FromAdjustedToday?.(0) ||
          qs?.getQuoteCalendarKeyNow?.() ||
          Utils.getTodayKey?.() ||
          ''
      ).trim();
      if (!todayKey || previewKey === todayKey) return false;

      let payload = prefetchedPayload;
      if (!payload?.blocks?.length && this.dataService?.loadQuiltFromServer) {
        try {
          const result = await this.dataService.loadQuiltFromServer(todayKey);
          if (result?.ok && Array.isArray(result.data?.blocks) && result.data.blocks.length > 0) {
            payload = result.data;
          }
        } catch (error) {
          this.logger?.warn?.('Admin preview background quilt load failed:', error?.message || error);
        }
      }
      if (!payload?.blocks?.length) {
        try {
          const saved = JSON.parse(localStorage.getItem('ourDailyQuilt') || 'null');
          const savedDate = String(saved?.date || saved?.dateKey || '').trim();
          if (
            saved &&
            savedDate === todayKey &&
            Array.isArray(saved.blocks) &&
            saved.blocks.length > 0
          ) {
            payload = {
              dateKey: todayKey,
              date: savedDate || todayKey,
              blocks: saved.blocks,
              contributorCount: saved.contributorCount || 1,
              colorReplayEvents: Array.isArray(saved.colorReplayEvents) ? saved.colorReplayEvents : [],
              contributors: Array.isArray(saved.contributors) ? saved.contributors : [],
              macroStructureFrozen: saved.macroStructureFrozen === true
            };
          }
        } catch (_) {
          /* ignore */
        }
      }
      if (!payload?.blocks?.length) return false;

      await this.applyQuiltDataFromPayload(payload, { adminPreviewBackground: true });
      if (this._adminPreview) {
        this._adminPreview.backgroundQuiltDateKey = todayKey;
      }
      this.logger?.log?.('Admin preview using today quilt as background', {
        previewDateKey: previewKey,
        backgroundQuiltDateKey: todayKey,
        blockCount: payload.blocks.length
      });
      return true;
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
        await Promise.race([
          greetingTask,
          new Promise((resolve) => setTimeout(resolve, 2500))
        ]);
      }
      Utils.setPortalGreetingReady?.(true);
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
      const notificationOpenIntent = await this._awaitColdStartNotificationIntent(500);
      const rememberViewDateKey =
        notificationOpenIntent?.kind === 'remember_today'
          ? notificationOpenIntent.dateKey
          : null;
      const openedFromDailyQuoteNotification = notificationOpenIntent?.kind === 'daily_quote';
      const rememberViewAlreadyActive = document
        .getElementById('screen-remember-today-view')
        ?.classList.contains('active');
      const previewScreenId = this._getPreviewScreenIdFromQuery();
      if (this._birthdayPreviewTomorrowRequested) {
        void this._activateBirthdayPreviewTomorrowIfNeeded();
      }
      if (rememberViewDateKey) {
        this._clearNotificationOpenNavigationGuards?.();
        this._rememberTodayViewTrackSource = 'notification';
        this.prepareRememberTodayViewScreen(rememberViewDateKey);
        this._maybeTrackViewSavedReminder(rememberViewDateKey, 'notification');
        this._rememberTodayViewTrackSource = null;
        this.uiService?.showScreen?.('screen-remember-today-view');
      } else if (openedFromDailyQuoteNotification) {
        this._clearNotificationOpenNavigationGuards?.();
        this.uiService?.showScreen?.(this._dailyQuoteNotificationTargetScreenId?.());
      } else {
        if (previewScreenId) {
          this.clearPortalToQuoteIntroTimer();
          this.clearIntroPersonaAdvanceTimer();
          this.clearFirstQuoteBridgeTimer();
          if (previewScreenId === 'screen-intro-zak') {
            const nameEl = document.getElementById('introZakName');
            if (nameEl) {
              nameEl.textContent =
                typeof Utils.getNameThanksDisplayName === 'function'
                  ? Utils.getNameThanksDisplayName()
                  : 'Friend';
            }
          }
          if (this._previewQuiltNameLeaderboard) {
            void this.openQuiltNameLeaderboard?.();
          } else {
            this.uiService?.showScreen?.(previewScreenId);
          }
        } else if (!rememberViewAlreadyActive) {
          const activeScreenId = document.querySelector('.screen.active')?.id;
          const userAlreadyPastPortal = activeScreenId === 'screen-quilt';
          if (!userAlreadyPastPortal) {
            this.uiService?.showScreen?.('screen-portal');
          }
        }
      }
      this._maybeSnapPickerToDailyFirstPalette();
      await this._preparePortalLaunchHandoff();
      this._clearLaunchSyncWatchdog();
      this._kickPortalIntroFadeAfterSplash();
      this._revealNativeLaunchShell();
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
        !openedFromDailyQuoteNotification &&
        !previewScreenId &&
        !this._skipFastPathForRememberToday &&
        this._shouldFastPathReturningSameDayQuote();
      this._scheduleDeferredQuiltRenderForIdle({ urgent: fastReturningToday && !this._launchQuiltPipelineRendered });
      if (!this._launchQuiltPipelineRendered) {
        this._kickLaunchQuiltPipeline?.();
      } else {
        this._ensureQuiltLowerSections({ phase: 'rendered' });
      }
      this._maybeRunSeamsidePreviewFromQuery();
      if (fastReturningToday) {
        this.clearPortalToQuoteIntroTimer();
        this._portalToQuoteIntroScheduled = false;
        this._blockPortalScrollNav = true;
        this._portalToQuoteTimer = setTimeout(() => {
          this._portalToQuoteTimer = null;
          this._blockPortalScrollNav = false;
          if (this._skipFastPathForRememberToday) return;
          if (previewScreenId) return;
          if (document.getElementById('screen-remember-today-view')?.classList.contains('active')) {
            return;
          }
          if (this._previewQuiltNameLeaderboard) return;
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
        this.incrementAppVisitCount();
        this._reportDayVisitOnce?.();
        this._liveDailyDataConfirmed = false;
        this._postLiveSyncInitialized = false;
        this._portalSplashDismissed = false;
        this._preparePortalJoinLineForLoad();
        this.setupEventListeners();
        this._applyBirthdayPreviewDevOverrideFromQuery();

        await this.dataService.initialize();
        this.quiltEngine.initialize();

        const bootstrapped = await this._tryBootstrapTodayQuiltFromLocalStorage();
        if (bootstrapped && window.odqPerfMark) window.odqPerfMark('bootstrap-quilt-cache');
        if (bootstrapped) {
          this.quoteService.primeTodayQuoteFromLocalAssignment();
          this._ensureQuiltLowerSections({ phase: 'bootstrap' });
          this._kickLaunchQuiltPipeline?.();
          this._revealNativeLaunchShell();
        } else if (typeof window.odqIsCapacitorNative === 'function' && window.odqIsCapacitorNative()) {
          // Do not keep iOS on the native launch cover while live Firestore/Railway reads run.
          // The portal already shows an awaiting join line until live daily data is confirmed.
          requestAnimationFrame(() => this._revealNativeLaunchShell());
        }

        this._beginLiveDailyPending();
        this._startLaunchSyncWatchdog();

        const finishLaunchAfterQuilt = async (live) => {
          if (!live.ok) {
            if (live.reason === 'sync_in_flight' || live.transient === true) {
              setTimeout(() => {
                void this.syncLiveDailyData({ mode: 'launch-core' }).then(finishLaunchAfterQuilt);
              }, 400);
              return;
            }
            if (this._hasCachedTodayQuilt()) {
              await this._finishLaunchWithCachedQuilt(live.reason);
              return;
            }
            this._showConnectionProblemFailed(live.reason);
            return;
          }
          this._clearLaunchSyncWatchdog();
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

    _bindFooterInstagramAnalytics(link) {
      if (!link || link.dataset.odqAnalyticsBound === '1') return;
      link.dataset.odqAnalyticsBound = '1';
      link.addEventListener('click', () => {
        if (typeof window.odqTrack === 'function') {
          window.odqTrack('open_instagram');
        }
      });
    }

    _bindStudioFloorAnalytics(btn) {
      if (!btn || btn.dataset.odqStudioAnalyticsBound === '1') return;
      btn.dataset.odqStudioAnalyticsBound = '1';
      btn.addEventListener('click', () => {
        if (typeof window.odqTrack !== 'function') return;
        const screen = btn.closest('[id^="screen-"]');
        const source = screen ? screen.id.replace(/^screen-/, '') : 'unknown';
        const had_unread = btn.classList.contains('quilt-studio-floor-icon-btn--unread') ? 1 : 0;
        window.odqTrack('open_studio_floor', { source, had_unread });
      });
    }

    _mountViewportFixedFooterIconBars() {
      const tpl = document.getElementById('odqViewportFooterIconBarTpl');
      if (!tpl?.content?.firstElementChild) return;
      [
        'screen-settings',
        'screen-about',
        'screen-remember-today',
        'screen-remember-today-view',
        'screen-reflection-themes-archive'
      ].forEach((screenId) => {
        const screen = document.getElementById(screenId);
        if (!screen || screen.querySelector(':scope > .quilt-viewport-footer-icon-row')) return;
        const row = tpl.content.firstElementChild.cloneNode(true);
        screen.appendChild(row);
      });
      this._applyFooterRemindersIconVisibility();
    }

    _footerRemindersIconEnabled() {
      return CONFIG.APP?.footerRemindersIconEnabled !== false;
    }

    _applyFooterRemindersIconVisibility() {
      const enabled = this._footerRemindersIconEnabled();
      document.querySelectorAll('.quilt-footer-icon-row').forEach((row) => {
        row.classList.toggle('quilt-footer-icon-row--reminders-hidden', !enabled);
      });
      document.querySelectorAll('.quilt-remember-icon-btn').forEach((btn) => {
        if (enabled) {
          btn.hidden = false;
          btn.removeAttribute('aria-hidden');
          btn.tabIndex = 0;
        } else {
          btn.hidden = true;
          btn.setAttribute('aria-hidden', 'true');
          btn.tabIndex = -1;
        }
      });
    }

    setupEventListeners() {
      this._mountViewportFixedFooterIconBars();

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

      document.querySelectorAll('.reflection-themes-archive-instagram-link').forEach((link) => {
        this._bindFooterInstagramAnalytics(link);
      });

      document.querySelectorAll('.quilt-studio-floor-icon-btn').forEach((btn) => {
        this._bindStudioFloorAnalytics(btn);
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
          this._rememberTodayViewTrackSource = 'archive';
          this.prepareRememberTodayViewScreen(dateKey);
          this._maybeTrackViewSavedReminder(dateKey, 'archive');
          this._rememberTodayViewTrackSource = null;
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
        if (e?.detail?.screenId !== 'screen-quilt') {
          globalThis.SeamsidePodcastWidget?.pauseForNavigation?.();
        }
        if (e?.detail?.screenId === 'screen-social-posts' && !this._deferredSocialSliceReady) {
          void this.loadDeferredSocialSlice?.();
        }
        if (e?.detail?.screenId === 'screen-quilt') {
          this.refreshRememberTodayFooterVisibility();
          this.ensureFooterIconStripHandCut();
          void this.refreshAdminDailyTaskBanner?.();
          this._scheduleAdminDailyTaskBannerPolling?.();
          if (!this._footerIconChromePrewarmResult) {
            this._resetFooterIconChromePending();
            this.prewarmFooterIconChrome();
          }
          this.flushFooterIconPaperChrome();
          this.scheduleFooterIconChromeUpdate?.();
          this._scheduleFooterIconChromeActivationPass();
        } else {
          this._clearAdminDailyTaskBannerPolling?.();
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
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (document.querySelector('.screen.active')?.id !== 'screen-quilt') return;
        void this.refreshAdminDailyTaskBanner?.();
        this._scheduleAdminDailyTaskBannerPolling?.();
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
      this.setupQuiltContributorStageLongPress();
      this.setupLayoutBStoryPreviewLongPressShare();
      this.setupReflectionResponsePrototype();
      this.setupQuiltMoodWidget();

      const firstNameContinueBtn = document.getElementById('firstNameContinueBtn');
      const firstNameInput = document.getElementById('firstNameInput');

      const setupIntroPersonaTapAdvance = () => {
        const introTapScreens = [
          { id: 'screen-intro-zak', next: 'screen-intro-mission' },
          { id: 'screen-intro-mission', next: 'screen-welcome' }
        ];
        introTapScreens.forEach(({ id, next }) => {
          const el = document.getElementById(id);
          if (!el || el.dataset.introTapBound) return;
          el.dataset.introTapBound = '1';
          const nextBtn = el.querySelector('[data-intro-next]');
          if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
              e.preventDefault();
              this.advanceIntroPersonaTo(next, id);
            });
          }
          el.addEventListener('click', (e) => {
            if (!el.classList.contains('active')) return;
            if (e.target.closest('button, a, input, textarea, select, label, [data-next], [role="button"]')) {
              return;
            }
            e.preventDefault();
            this.advanceIntroPersonaTo(next, id);
          });
        });
      };
      setupIntroPersonaTapAdvance();
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
          this.beginIntroPersonaSequence();
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
      const settingsDailyQuoteEnabled = document.getElementById('settingsDailyQuoteEnabled');
      const settingsDailyQuoteHourSelect = document.getElementById('settingsDailyQuoteHourSelect');
      if (settingsDailyQuoteEnabled) {
        settingsDailyQuoteEnabled.addEventListener('change', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this.handleSettingsDailyQuoteToggleChange(!!settingsDailyQuoteEnabled.checked);
        });
      }
      if (settingsDailyQuoteHourSelect) {
        settingsDailyQuoteHourSelect.addEventListener('change', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this.handleSettingsDailyQuoteHourChange(settingsDailyQuoteHourSelect.value);
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
      

      

      
      // Optional slices attach these handlers after native launch.
      this.setupArchiveEventHandlers?.();
      this.setupSocialEventHandlers?.();
      this.setupFeatureFeedbackFeed?.();
      void this.checkForUnseenSocialPosts?.();

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
        this.setupLongPressAdminAccess?.();
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

    _bindSustainHoldGesture(target, options = {}) {
      const {
        isEnabled = () => true,
        holdMsTouch = 480,
        holdMsDefault = 650,
        moveCancelPx = 14,
        onPrime = () => {},
        onHoldStart = () => {},
        onHoldEnd = () => {},
        shouldStartHold = () => true,
        blockTextSelection = false,
        suppressClickMs = 450,
        attachKeyHold = true,
        preventDefaultOnDown = true
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
        if (!shouldStartHold(event)) return;
        if (preventDefaultOnDown && event.pointerType === 'touch' && event.cancelable) {
          event.preventDefault();
        }
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
      if (!wrap || !sheet || sheet.dataset.listenerAttached === '1') return;
      sheet.dataset.listenerAttached = '1';

      const canShareLayoutBStoryPreview = () => {
        const img = document.getElementById('quiltLayoutBPreviewImg');
        return !!(img && !img.hidden && (img.naturalWidth > 0 || String(img.currentSrc || img.src || '').trim()));
      };

      let shareTimer = null;
      let suppressNextClick = false;
      let pressStartX = 0;
      let pressStartY = 0;
      const clearShareTimer = () => {
        if (!shareTimer) return;
        clearTimeout(shareTimer);
        shareTimer = null;
      };
      const cancelSharePress = () => {
        clearShareTimer();
        pressStartX = 0;
        pressStartY = 0;
      };

      sheet.setAttribute('role', 'button');
      sheet.setAttribute('tabindex', '0');
      sheet.setAttribute('aria-label', 'Story preview. Press and hold to share on Instagram.');

      sheet.addEventListener('contextmenu', (event) => {
        if (!suppressNextClick) return;
        event.preventDefault();
      });

      sheet.addEventListener('pointerdown', (event) => {
        if (!canShareLayoutBStoryPreview()) return;
        cancelSharePress();
        suppressNextClick = false;
        pressStartX = event.clientX;
        pressStartY = event.clientY;
        void this._ensureLayoutBStoryPreviewShareBlob?.();
        shareTimer = window.setTimeout(async () => {
          shareTimer = null;
          suppressNextClick = true;
          window.setTimeout(() => {
            suppressNextClick = false;
          }, 1200);
          try {
            await this.shareLayoutBStoryPreviewFromLongPress?.();
          } catch (error) {
            this.errorHandler.handleError(error, 'layoutBPreviewShare');
          }
        }, 650);
      });
      sheet.addEventListener('pointermove', (event) => {
        if (!shareTimer) return;
        const dx = event.clientX - pressStartX;
        const dy = event.clientY - pressStartY;
        if (Math.hypot(dx, dy) > 10) cancelSharePress();
      });
      sheet.addEventListener('pointerup', cancelSharePress);
      sheet.addEventListener('pointercancel', cancelSharePress);
      sheet.addEventListener('pointerleave', cancelSharePress);
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

    reflectionWallThemeRenderable(entry) {
      const normalized = this.normalizeReflectionWallTheme(entry);
      if (!normalized) return false;
      if (normalized.split) return normalized.strips?.length >= 2;
      return !!normalized.text;
    }

    normalizeReflectionWallTheme(entry) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        if (entry.split === true && Array.isArray(entry.strips)) {
          const strips = entry.strips
            .map((strip) => this.normalizeReflectionWallTheme(strip))
            .filter((strip) => strip?.text && !strip.split);
          if (strips.length >= 2) return { split: true, strips: strips.slice(0, 2) };
          if (strips.length === 1) return strips[0];
          return null;
        }
        const text = this.normalizeReflectionIdeaText(entry.text ?? entry.body ?? entry.theme ?? '');
        if (!text) return null;
        const author = String(entry.author ?? entry.authorDisplayName ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        const responseId = String(entry.responseId ?? entry.response_id ?? '').trim();
        const heartCount = Math.max(0, Number(entry.heartCount) || 0);
        const adminHighlight = entry.adminHighlight === true;
        const adminHighlightAtIso = String(entry.adminHighlightAtIso || '').trim();
        const mergedResponseIds = Array.isArray(entry.mergedResponseIds)
          ? entry.mergedResponseIds.map((id) => String(id || '').trim()).filter(Boolean)
          : [];
        const base = responseId ? { text, author, responseId } : { text, author };
        if (heartCount > 0) base.heartCount = heartCount;
        if (adminHighlight) {
          base.adminHighlight = true;
          if (adminHighlightAtIso) base.adminHighlightAtIso = adminHighlightAtIso;
        }
        if (mergedResponseIds.length) base.mergedResponseIds = mergedResponseIds;
        return base;
      }
      const text = this.normalizeReflectionIdeaText(entry);
      if (!text) return null;
      return { text, author: '' };
    }

    _readMyReflectionCache(dateKey) {
      const key = String(dateKey || '').trim();
      if (!key) return null;
      try {
        const raw = localStorage.getItem('odqMyReflectionByDate');
        if (!raw) return null;
        const map = JSON.parse(raw);
        const entry = map?.[key];
        if (!entry || typeof entry !== 'object') return null;
        const responseId = String(entry.responseId || '').trim();
        if (!responseId) return null;
        return {
          responseId,
          appDateKey: key,
          rawText: String(entry.rawText || entry.text || '').trim(),
          text: String(entry.text || '').trim(),
          author: String(entry.author || '').trim()
        };
      } catch (_) {
        return null;
      }
    }

    _writeMyReflectionCache(dateKey, entry) {
      const key = String(dateKey || '').trim();
      if (!key) return;
      try {
        const raw = localStorage.getItem('odqMyReflectionByDate');
        const map = raw ? JSON.parse(raw) : {};
        if (!entry || !entry.responseId) {
          delete map[key];
        } else {
          map[key] = {
            responseId: String(entry.responseId || '').trim(),
            rawText: String(entry.rawText || entry.text || '').trim(),
            text: String(entry.text || '').trim(),
            author: String(entry.author || '').trim()
          };
        }
        localStorage.setItem('odqMyReflectionByDate', JSON.stringify(map));
      } catch (_) {
        /* */
      }
    }

    reflectionThemeBodyKeysForMine(myReflection) {
      const keys = new Set();
      if (!myReflection) return keys;
      for (const candidate of [
        myReflection,
        { text: myReflection.text, author: myReflection.author },
        { text: myReflection.rawText, author: myReflection.author },
        myReflection.rawText,
        myReflection.text
      ]) {
        const key = this.reflectionThemeBodyKey(candidate);
        if (key) keys.add(key);
      }
      return keys;
    }

    reflectionThemeTextsMatch(themeText, mineKeys) {
      const normalized = this.reflectionThemeBodyKey({ text: themeText });
      if (!normalized || !mineKeys?.size) return false;
      if (mineKeys.has(normalized)) return true;
      for (const mineKey of mineKeys) {
        if (mineKey.includes(normalized) || normalized.includes(mineKey)) return true;
      }
      return false;
    }

    reflectionThemeMatchesMine(theme, myReflection) {
      if (!myReflection?.responseId) return false;
      const normalized = this.normalizeReflectionWallTheme(theme);
      if (!normalized) return false;
      if (normalized.split && Array.isArray(normalized.strips)) {
        return normalized.strips.some((strip) => this.reflectionThemeMatchesMine(strip, myReflection));
      }
      if (Array.isArray(normalized.mergedResponseIds) && normalized.mergedResponseIds.length) {
        if (normalized.mergedResponseIds.includes(myReflection.responseId)) return true;
      }
      if (normalized.responseId && normalized.responseId === myReflection.responseId) return true;
      const themeText = this.reflectionThemeBodyKey(normalized);
      const mineKeys = this.reflectionThemeBodyKeysForMine(myReflection);
      if (!themeText || !this.reflectionThemeTextsMatch(themeText, mineKeys)) return false;
      // Server confirmed ownership — wall author may differ from first_response label.
      return true;
    }

    async fetchMyReflectionForDate(dateKey) {
      const baseUrl = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (!baseUrl) return null;
      const appDateKey = String(dateKey || Utils.getTodayKey() || '').trim();
      const clientId = this.currentUserId || Utils.getOrCreateUserId();
      const params = new URLSearchParams({ appDateKey, clientId });
      const res = await fetch(`${baseUrl}/api/reflection-response/mine?${params.toString()}`, {
        cache: 'no-store'
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.found) return null;
      const entry = {
        responseId: String(data.responseId || '').trim(),
        appDateKey: String(data.appDateKey || appDateKey).trim(),
        rawText: String(data.rawText || data.text || '').trim(),
        text: String(data.text || '').trim(),
        author: String(data.author || '').trim()
      };
      if (!entry.responseId) return null;
      this._writeMyReflectionCache(entry.appDateKey, entry);
      return entry;
    }

    async syncMyReflectionForToday(dateKey, options = {}) {
      const key =
        String(dateKey || '').trim() ||
        (typeof this.getEffectiveAppDateKey === 'function' && this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveAppDateKey()
          : Utils.getTodayKey());
      if (!key) return null;
      const force = options.force === true;
      if (!force && this._readMyReflectionCache(key)) return this._readMyReflectionCache(key);
      try {
        return await this.fetchMyReflectionForDate(key);
      } catch (error) {
        this.logger?.warn?.('My reflection sync failed:', error);
        return this._readMyReflectionCache(key);
      }
    }

    _resetReflectionResponseForm() {
      const form = document.getElementById('quiltReflectionResponseForm');
      const input = document.getElementById('quiltReflectionResponseInput');
      const submit = document.getElementById('quiltReflectionResponseSubmit');
      if (!form) return;
      form.classList.remove('is-submitted', 'is-confirmed-collapsed');
      if (input) {
        input.value = '';
        input.removeAttribute('readonly');
      }
      this._reflectionEditContext = null;
      if (submit) {
        this._setReflectionSubmitLabel(submit, 'Add a thought');
        submit.disabled = false;
      }
    }

    async openReflectionEditFromCarousel(myReflection) {
      const form = document.getElementById('quiltReflectionResponseForm');
      const input = document.getElementById('quiltReflectionResponseInput');
      const submit = document.getElementById('quiltReflectionResponseSubmit');
      if (!form || !input || !myReflection?.responseId) return;
      let reflection = myReflection;
      if (!reflection.rawText) {
        const cached = this._readMyReflectionCache(reflection.appDateKey || Utils.getTodayKey());
        if (cached?.responseId === reflection.responseId && cached.rawText) {
          reflection = cached;
        } else {
          try {
            const fetched = await this.fetchMyReflectionForDate(reflection.appDateKey || Utils.getTodayKey());
            if (fetched?.responseId === reflection.responseId) reflection = fetched;
          } catch (_) {
            /* use text fallback */
          }
        }
      }
      form.classList.remove('is-submitted', 'is-confirmed-collapsed');
      input.removeAttribute('readonly');
      input.value = reflection.rawText || reflection.text || '';
      this._reflectionEditContext = {
        responseId: reflection.responseId,
        appDateKey: reflection.appDateKey || Utils.getTodayKey()
      };
      if (submit) {
        this._setReflectionSubmitLabel(submit, 'Save changes');
        submit.disabled = false;
      }
      try {
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {
        /* */
      }
      try {
        input.focus({ preventScroll: false });
      } catch (_) {
        input.focus();
      }
    }

    bindReflectionCarouselMineActions() {
      if (this._reflectionMineClickBound) return;
      this._reflectionMineClickBound = true;
      document.addEventListener('click', (event) => {
        const editBtn = event.target?.closest?.('#screen-quilt .quilt-reflection-carousel-edit-btn');
        if (editBtn) {
          event.preventDefault();
          event.stopPropagation();
          const slide = editBtn.closest('[data-reflection-theme-slide], [data-reflection-mine-invite="1"]');
          const responseId = String(slide?.dataset?.reflectionResponseId || '').trim();
          const dateKey = Utils.getTodayKey();
          const cached = this._readMyReflectionCache(dateKey);
          const myReflection =
            cached?.responseId === responseId
              ? cached
              : {
                  responseId,
                  appDateKey: dateKey,
                  rawText: '',
                  text: '',
                  author: ''
                };
          this.openReflectionEditFromCarousel(myReflection);
          return;
        }
        const heartBtn = event.target?.closest?.('#screen-quilt .quilt-reflection-carousel-heart');
        if (heartBtn) {
          event.preventDefault();
          event.stopPropagation();
          const slide = heartBtn.closest('[data-reflection-theme-slide]');
          if (!slide) return;
          const splitCard = heartBtn.closest('[data-reflection-split-card]');
          const engagement = heartBtn.closest('.quilt-reflection-carousel-engagement');
          const responseId = String(
            heartBtn.dataset.reflectionResponseId ||
              engagement?.dataset?.reflectionResponseId ||
              splitCard?.dataset?.reflectionResponseId ||
              slide.dataset.reflectionResponseId ||
              ''
          ).trim();
          const carousel = slide.closest('[data-reflection-carousel]');
          const dateKey = String(carousel?.dataset?.reflectionHandCutDateKey || Utils.getTodayKey() || '').trim();
          this.toggleReflectionCarouselHeart({ responseId, dateKey, slideEl: slide, buttonEl: heartBtn });
          return;
        }
        const highlightBtn = event.target?.closest?.('#screen-quilt .quilt-reflection-carousel-highlight');
        if (highlightBtn) {
          event.preventDefault();
          event.stopPropagation();
          const slide = highlightBtn.closest('[data-reflection-theme-slide], [data-reflection-split-card]');
          if (!slide) return;
          const responseId = String(
            highlightBtn.dataset.reflectionResponseId ||
              slide.dataset.reflectionResponseId ||
              ''
          ).trim();
          if (!responseId) return;
          const carousel = slide.closest('[data-reflection-carousel]');
          const dateKey = String(carousel?.dataset?.reflectionHandCutDateKey || Utils.getTodayKey() || '').trim();
          this.toggleReflectionAdminHighlight({ responseId, dateKey, slideEl: slide, buttonEl: highlightBtn });
          return;
        }
        const deleteBtn = event.target?.closest?.('#screen-quilt .quilt-reflection-carousel-delete-btn');
        if (!deleteBtn) return;
        event.preventDefault();
        event.stopPropagation();
        const slide = deleteBtn.closest('[data-reflection-theme-slide], [data-reflection-mine-invite="1"]');
        const responseId = String(slide?.dataset?.reflectionResponseId || '').trim();
        if (!responseId) return;
        if (!window.confirm('Remove your reflection from the wall?')) return;
        deleteBtn.disabled = true;
        this.deleteReflectionResponse(responseId)
          .then(() => {
            const dateKey = Utils.getTodayKey();
            this._writeMyReflectionCache(dateKey, null);
            this._resetReflectionResponseForm();
            this._reflectionWallLastContentKey = null;
            if (this._reflectionThemesNotFoundKeys) this._reflectionThemesNotFoundKeys.delete(dateKey);
            // Remove slide immediately for instant feedback
            slide?.remove();
            this._ensureQuiltLowerSections({ phase: 'network' });
          })
          .catch((error) => {
            this.logger?.warn?.('Reflection delete failed:', error);
            window.alert('Could not remove your reflection. Please try again.');
          })
          .finally(() => {
            deleteBtn.disabled = false;
          });
      });
    }

    reflectionWallThemeText(entry) {
      const normalized = this.normalizeReflectionWallTheme(entry);
      if (!normalized) return '';
      if (normalized.split && Array.isArray(normalized.strips)) {
        return normalized.strips.map((strip) => strip.text).filter(Boolean).join(' / ');
      }
      return normalized.text || '';
    }

    formatReflectionCarouselStripHtml(strip, dateKey, stripIndex = 0, slideIndex = 0, baseRgb = null) {
      const normalized = this.normalizeReflectionWallTheme(strip);
      const text = normalized?.text || this.normalizeReflectionIdeaText(strip);
      const bodyHtml = this.escapeQuiltFortuneText(text);
      const author = String(normalized?.author || '').trim();
      const authorHtml = author ? this.escapeQuiltFortuneText(author) : '';
      const responseId = String(normalized?.responseId || '').trim();
      const isHighlighted = normalized?.adminHighlight === true;
      const heartId = responseId ? this._reflectionHeartId(responseId, dateKey) : '';
      const heartMarkup = heartId
        ? this.renderReflectionCarouselEngagementHtml(heartId, normalized?.heartCount || 0, {
            responseId,
            adminHighlight: isHighlighted
          })
        : '';
      const cardClass =
        (stripIndex === 0
          ? 'quilt-reflection-carousel-split-card quilt-reflection-carousel-split-card--top'
          : 'quilt-reflection-carousel-split-card quilt-reflection-carousel-split-card--bottom') +
        (isHighlighted ? ' quilt-reflection-carousel-split-card--admin-highlight' : '');
      const handCutSeed = `${dateKey}:reflection-split:${slideIndex}:${stripIndex}`;
      const cardRgb = baseRgb
        ? isHighlighted
          ? this.brightenReflectionHighlightPatchRgb(baseRgb)
          : this.washReflectionCarouselPatchRgb(baseRgb)
        : '';
      const cardStyleAttr = cardRgb ? ` style="--reflection-fabric-rgb: ${cardRgb};"` : '';
      return `<div class="${cardClass}" data-reflection-split-card${responseId ? ` data-reflection-response-id="${this.escapeQuiltFortuneText(responseId)}"` : ''} data-reflection-hand-cut-seed="${this.escapeQuiltFortuneText(handCutSeed)}"${cardStyleAttr}>
        <div class="quilt-reflection-carousel-split-card-copy quilt-reflection-carousel-copy">
          <span class="quilt-reflection-carousel-body">${bodyHtml}</span>
          <div class="quilt-reflection-carousel-card-footer">
            ${author ? `<span class="quilt-reflection-carousel-author">— ${authorHtml}</span>` : ''}
            ${heartMarkup}
          </div>
        </div>
      </div>`;
    }

    formatReflectionCarouselTextHtml(entry, slideIndex = 0, options = {}) {
      const normalized = this.normalizeReflectionWallTheme(entry);
      if (normalized?.split && Array.isArray(normalized.strips)) {
        const dateKey = String(Utils.getTodayKey() || 'nodate').trim() || 'nodate';
        const top = this.formatReflectionCarouselStripHtml(normalized.strips[0], dateKey, 0, slideIndex, options.rgb);
        const bottom = this.formatReflectionCarouselStripHtml(normalized.strips[1], dateKey, 1, slideIndex, options.rgb);
        return `<div class="quilt-reflection-carousel-split-stack">
          ${top}
          <span class="quilt-reflection-carousel-split-tape" aria-hidden="true"></span>
          ${bottom}
        </div>`;
      }
      const text = normalized?.text || this.normalizeReflectionIdeaText(entry);
      const bodyHtml = this.escapeQuiltFortuneText(text);
      const author = String(normalized?.author || '').trim();
      const authorHtml = author ? this.escapeQuiltFortuneText(author) : '';
      const heartMarkup = options.heartMarkup || '';
      if (options.inlineAuthor && author) {
        return `<span class="quilt-reflection-carousel-body quilt-reflection-carousel-body--inline-author" style="text-align:left">${bodyHtml}<span class="quilt-reflection-carousel-author quilt-reflection-carousel-author--inline"> — ${authorHtml}</span></span>`;
      }
      const authorPart = author ? `<span class="quilt-reflection-carousel-author">— ${authorHtml}</span>` : '';
      const footerPart =
        authorPart || heartMarkup
          ? `<div class="quilt-reflection-carousel-card-footer">${authorPart}${heartMarkup}</div>`
          : '';
      return `<span class="quilt-reflection-carousel-body" style="text-align:left">${bodyHtml}</span>${footerPart}`;
    }

    syncReflectionCarouselCopyAlign(slides) {
      const list = Array.isArray(slides) ? slides : [];
      list.forEach((slide) => {
        if (!slide?.classList?.contains?.('quilt-reflection-carousel-slide--clipping')) return;
        if (slide.classList.contains('quilt-reflection-carousel-slide--ig-prompt')) {
          slide.querySelectorAll('.quilt-reflection-carousel-text').forEach((copyEl) => {
            copyEl.style.textAlign = 'center';
          });
          slide.querySelectorAll('.quilt-reflection-carousel-body').forEach((bodyEl) => {
            bodyEl.style.textAlign = 'center';
          });
          return;
        }
        const copyTargets = slide.classList.contains('quilt-reflection-carousel-slide--split')
          ? slide.querySelectorAll('.quilt-reflection-carousel-split-card-copy')
          : slide.querySelectorAll('.quilt-reflection-carousel-text');
        copyTargets.forEach((copyEl) => {
          copyEl.style.textAlign = 'left';
        });
        slide.querySelectorAll('.quilt-reflection-carousel-body').forEach((bodyEl) => {
          bodyEl.style.textAlign = 'left';
        });
        if (slide.querySelector('.quilt-reflection-carousel-author--inline')) {
          slide.querySelectorAll('.quilt-reflection-carousel-author--inline').forEach((authorEl) => {
            authorEl.style.display = 'inline';
            authorEl.style.textAlign = 'inherit';
            authorEl.style.width = 'auto';
          });
          return;
        }
        slide.querySelectorAll('.quilt-reflection-carousel-author').forEach((authorEl) => {
          authorEl.style.textAlign = 'right';
          authorEl.style.display = 'block';
          authorEl.style.width = '100%';
        });
      });
    }

    /** Wider newsprint column for longer reflections — avoids justify rivers in a skinny measure. */
    reflectionCarouselNeedsWideCopy(theme) {
      const normalized = this.normalizeReflectionWallTheme(theme);
      if (normalized?.split && Array.isArray(normalized.strips)) {
        return normalized.strips.some((strip) => this.reflectionCarouselNeedsWideCopy(strip));
      }
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
      this.bindReflectionCarouselMineActions();
      const form = document.getElementById('quiltReflectionResponseForm');
      const input = document.getElementById('quiltReflectionResponseInput');
      if (!form || !input || form.dataset.listenerAttached === '1') return;
      form.dataset.listenerAttached = '1';
      const helper = form.querySelector('.quilt-reflection-response-helper');
      const submit = form.querySelector('.quilt-reflection-response-submit');
      const idleSubmitLabel = 'Add a thought';
      const editSubmitLabel = 'Save changes';
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
          const label = this._reflectionEditContext?.responseId ? editSubmitLabel : idleSubmitLabel;
          this._setReflectionSubmitLabel(submit, label);
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
        const isEdit = Boolean(this._reflectionEditContext?.responseId);
        if (submit) {
          submit.disabled = true;
          this._setReflectionSubmitLabel(submit, isEdit ? 'Saving…' : 'Adding…');
        }
        setHelper('One moment…');
        try {
          const result = isEdit
            ? await this.updateReflectionResponse(
                this._reflectionEditContext.responseId,
                responseText,
                { appDateKey: this._reflectionEditContext.appDateKey }
              )
            : await this.submitReflectionResponse(responseText);
          const dateKey = result?.appDateKey || Utils.getTodayKey();
          if (result?.responseId) {
            this._writeMyReflectionCache(dateKey, {
              responseId: result.responseId,
              rawText: result.rawText || responseText,
              text: result.text || result.rawText || responseText,
              author: result.author || Utils.getNameThanksDisplayName?.() || ''
            });
          }
          void this.fetchMyReflectionForDate(dateKey).catch(() => {});
          this._reflectionEditContext = null;
        } catch (error) {
          this.logger?.warn?.('Reflection response submit failed:', error);
          if (error?.status === 409 && error?.existingResponseId) {
            const dateKey = Utils.getTodayKey();
            let existing = this._readMyReflectionCache(dateKey);
            if (!existing) {
              existing = {
                responseId: String(error.existingResponseId).trim(),
                appDateKey: dateKey,
                rawText: responseText,
                text: responseText,
                author: Utils.getNameThanksDisplayName?.() || ''
              };
            }
            try {
              existing = (await this.fetchMyReflectionForDate(dateKey)) || existing;
            } catch (_) {
              /* keep fallback */
            }
            if (existing?.responseId) {
              this._writeMyReflectionCache(dateKey, existing);
              this.openReflectionEditFromCarousel(existing);
              setHelper('You already shared today — update your patch below.', 'error');
              this._reflectionWallLastContentKey = null;
              void this.loadReflectionThemesForToday?.();
            } else {
              setHelper(error.message || 'You already shared a reflection today.', 'error');
            }
          } else if (error?.rejected) {
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
            const label = this._reflectionEditContext?.responseId ? editSubmitLabel : idleSubmitLabel;
            this._setReflectionSubmitLabel(submit, label);
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
        this._reflectionWallLastContentKey = null;
        // Render immediately from local cache — don't wait for the in-flight network load.
        this._paintReflectionWallBootstrap(todayKey);
        if (!this._reflectionWallLastContentKey) {
          this.renderReflectionAnonymousWall([], this._readMyReflectionCache(todayKey));
        }
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

    reflectionThemeIsAdminHighlighted(entry) {
      const normalized = this.normalizeReflectionWallTheme(entry);
      if (!normalized) return false;
      if (normalized.split && Array.isArray(normalized.strips)) {
        return normalized.strips.some((strip) => strip.adminHighlight === true);
      }
      return normalized.adminHighlight === true;
    }

    orderReflectionThemesWithAdminHighlights(themes = []) {
      const highlighted = [];
      const rest = [];
      (Array.isArray(themes) ? themes : []).forEach((entry) => {
        if (this.reflectionThemeIsAdminHighlighted(entry)) highlighted.push(entry);
        else rest.push(entry);
      });
      highlighted.sort((a, b) => {
        const aTs = this.reflectionThemeAdminHighlightAtIso(a);
        const bTs = this.reflectionThemeAdminHighlightAtIso(b);
        return bTs.localeCompare(aTs);
      });
      return [...highlighted, ...rest];
    }

    reflectionThemeAdminHighlightAtIso(entry) {
      const normalized = this.normalizeReflectionWallTheme(entry);
      if (!normalized) return '';
      if (normalized.split && Array.isArray(normalized.strips)) {
        const strip = normalized.strips.find((row) => row.adminHighlight === true);
        return String(strip?.adminHighlightAtIso || '').trim();
      }
      return String(normalized.adminHighlightAtIso || '').trim();
    }

    buildReflectionWallThemes(
      communityThemes = [],
      firstResponseOverride = null,
      firstResponseAuthor = REFLECTION_FIRST_PATCH_AUTHOR,
      myReflection = null,
      firstHeartCount = 0,
      firstHighlightMeta = null
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
      const firstHC = Math.max(0, Number(firstHeartCount) || 0);
      const firstAdminHighlight = firstHighlightMeta?.adminFirstResponseHighlight === true;
      const firstAdminHighlightAtIso = String(firstHighlightMeta?.adminFirstResponseHighlightAtIso || '').trim();
      const first = firstRaw
        ? {
            text: this.formatFirstResponsePatchText(firstRaw),
            author: firstAuthor,
            responseId: 'first',
            ...(firstHC > 0 ? { heartCount: firstHC } : {}),
            ...(firstAdminHighlight
              ? {
                  adminHighlight: true,
                  ...(firstAdminHighlightAtIso ? { adminHighlightAtIso: firstAdminHighlightAtIso } : {})
                }
              : {})
          }
        : null;
      const community = this.orderReflectionThemesWithAdminHighlights(
        this.orderReflectionCommunityThemesNewestFirst(
          (Array.isArray(communityThemes) ? communityThemes : [])
            .map((theme) => this.normalizeReflectionWallTheme(theme))
            .filter((entry) => this.reflectionWallThemeRenderable(entry))
        )
      );
      if (!first) return community;
      const firstKey = this.reflectionThemeBodyKey(first);
      const rest = community.filter((entry) => {
        if (myReflection?.responseId) {
          if (entry.split && Array.isArray(entry.strips)) {
            if (entry.strips.some((strip) => String(strip.responseId || '').trim() === myReflection.responseId)) {
              return true;
            }
            if (entry.strips.some((strip) => this.reflectionThemeMatchesMine(strip, myReflection))) return true;
          } else if (String(entry.responseId || '').trim() === myReflection.responseId) {
            return true;
          } else if (this.reflectionThemeMatchesMine(entry, myReflection)) {
            return true;
          }
        }
        if (entry.split && Array.isArray(entry.strips)) {
          return !entry.strips.some((strip) => this.reflectionThemeBodyKey(strip) === firstKey);
        }
        return this.reflectionThemeBodyKey(entry) !== firstKey;
      });
      if (first.adminHighlight) return [first, ...rest];
      return [...rest, first];
    }

    /** IG / archive export — reflection wall for a specific quilt day (not necessarily today). */
    async buildReflectionWallThemesForDateKey(dateKey, quoteObj = null) {
      const dk = String(dateKey || Utils.getTodayKey() || '').trim();
      const prompt =
        (typeof this.getQuiltReflectionPromptText === 'function' &&
          this.getQuiltReflectionPromptText(quoteObj)) ||
        String(
          quoteObj?.communityPrompt ||
            quoteObj?.community_prompt ||
            quoteObj?.reflectionPrompt ||
            quoteObj?.reflection_prompt ||
            ''
        ).trim();
      if (!dk) return { prompt, wallThemes: [] };

      let todayThemes = null;
      if (typeof this._readReflectionThemesForDate === 'function') {
        try {
          todayThemes = await this._readReflectionThemesForDate(dk);
        } catch (_) {
          /* non-fatal */
        }
      }
      const cached = this._readLocalReflectionThemesCache?.(dk);
      let communityThemes = todayThemes?.themes?.length
        ? todayThemes.themes
        : Array.isArray(cached?.themes)
          ? cached.themes
          : [];
      let firstResponse = String(
        todayThemes?.first_response || cached?.first_response || ''
      ).trim();
      let userName = String(todayThemes?.user_name || cached?.user_name || '').trim();
      let firstHeartCount = Math.max(
        0,
        Number(todayThemes?.firstResponseHeartCount ?? cached?.firstResponseHeartCount) || 0
      );
      let highlightMeta = {
        adminFirstResponseHighlight:
          todayThemes?.adminFirstResponseHighlight === true ||
          cached?.adminFirstResponseHighlight === true,
        adminFirstResponseHighlightAtIso: String(
          todayThemes?.adminFirstResponseHighlightAtIso ||
            cached?.adminFirstResponseHighlightAtIso ||
            ''
        ).trim()
      };

      if (!firstResponse && window.db && window.firestore?.doc) {
        try {
          const readDoc = window.firestore.getDoc || window.firestore.getDocFromServer;
          const snap = await readDoc(window.firestore.doc(window.db, 'dailyQuoteAssignments', dk));
          if (snap.exists()) {
            const data = snap.data() || {};
            firstResponse = this._firstResponseFromPayload(data);
            userName = this._userNameFromPayload(data) || userName;
          }
        } catch (_) {
          /* non-fatal */
        }
      }

      if (todayThemes?.adminHighlightByResponseId && communityThemes.length) {
        communityThemes = this._applyAdminHighlightsToThemes(
          communityThemes,
          todayThemes.adminHighlightByResponseId
        );
      } else if (cached?.adminHighlightByResponseId && communityThemes.length) {
        communityThemes = this._applyAdminHighlightsToThemes(
          communityThemes,
          cached.adminHighlightByResponseId
        );
      }

      const wallThemes =
        typeof this.buildReflectionWallThemes === 'function'
          ? this.buildReflectionWallThemes(
              communityThemes,
              firstResponse || null,
              userName,
              null,
              firstHeartCount,
              highlightMeta
            )
          : communityThemes;
      return { prompt, wallThemes: Array.isArray(wallThemes) ? wallThemes : [] };
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
      const firestoreReady = await this.waitForReflectionFirestore(
        window.db && window.firestore?.doc ? 0 : 400
      );
      if (firestoreReady && window.db && window.firestore?.doc) {
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

    async resolveReflectionWallThemes(communityThemes = [], firstResponseContext = null, myReflection = null) {
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
      const firstHC = Math.max(0, Number(ctx.firstResponseHeartCount) || 0);
      const firstHighlightMeta = {
        adminFirstResponseHighlight: ctx.adminFirstResponseHighlight === true,
        adminFirstResponseHighlightAtIso: String(ctx.adminFirstResponseHighlightAtIso || '').trim()
      };
      return this.buildReflectionWallThemes(
        communityThemes,
        first,
        userName,
        myReflection,
        firstHC,
        firstHighlightMeta
      );
    }

    _mineReflectionCarouselActionsMarkup(responseId) {
      const rid = this.escapeQuiltFortuneText(String(responseId || '').trim());
      return `<div class="quilt-reflection-carousel-mine-actions">
              <button type="button" class="quilt-reflection-carousel-edit-btn">Edit</button>
              <span class="quilt-reflection-carousel-mine-sep" aria-hidden="true">·</span>
              <button type="button" class="quilt-reflection-carousel-delete-btn">Remove</button>
            </div>`;
    }

    getReflectionHeartStorageKey() {
      return 'odqReflectionHearts';
    }

    isReflectionHeartedLocally(heartId) {
      try {
        const raw = localStorage.getItem(this.getReflectionHeartStorageKey());
        if (!raw) return false;
        const ids = JSON.parse(raw);
        return Array.isArray(ids) && ids.includes(String(heartId || ''));
      } catch (_) {
        return false;
      }
    }

    setReflectionHeartedLocally(heartId, hearted) {
      try {
        const raw = localStorage.getItem(this.getReflectionHeartStorageKey());
        const ids = new Set(raw ? JSON.parse(raw) : []);
        if (hearted) ids.add(String(heartId || ''));
        else ids.delete(String(heartId || ''));
        localStorage.setItem(this.getReflectionHeartStorageKey(), JSON.stringify(Array.from(ids)));
      } catch (_) {
        /* */
      }
    }

    _reflectionHeartId(responseId, dateKey) {
      const rid = String(responseId || '').trim();
      const dk = String(dateKey || '').trim();
      return rid ? `${dk}:${rid}` : `${dk}:first`;
    }

    renderReflectionCarouselHeartHtml(heartId, heartCount, responseId = '') {
      const hearted = this.isReflectionHeartedLocally(heartId);
      const count = Math.max(0, Number(heartCount) || 0);
      const countHtml = count > 0
        ? `<span class="quilt-reflection-carousel-heart-count">${count}</span>`
        : `<span class="quilt-reflection-carousel-heart-count" hidden aria-hidden="true">0</span>`;
      const rid = String(responseId || '').trim();
      const responseAttr = rid
        ? ` data-reflection-response-id="${this.escapeQuiltFortuneText(rid)}"`
        : '';
      return `<button type="button" class="quilt-reflection-carousel-heart${hearted ? ' quilt-reflection-carousel-heart--active' : ''}"${responseAttr} aria-label="${hearted ? 'Unlike' : 'Like'}" aria-pressed="${hearted ? 'true' : 'false'}">
        <span class="material-symbols-outlined" aria-hidden="true" translate="no">favorite</span>
        ${countHtml}
      </button>`;
    }

    _isReflectionWallAdminViewer() {
      if (!CONFIG.APP.enableAdminTools) return false;
      try {
        if (localStorage.getItem('ourDailyIsAdmin') === 'true') return true;
      } catch (_) {
        /* */
      }
      return !!this.isCurrentUserAdmin?.();
    }

    refreshReflectionWallForAdminControls() {
      if (!this._isReflectionWallAdminViewer()) return;
      this._reflectionWallLastContentKey = null;
      const dateKey =
        typeof this.getEffectiveAppDateKey === 'function' && this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveAppDateKey()
          : Utils.getTodayKey();
      if (this._paintReflectionWallBootstrap(dateKey)) return;
      void this.loadReflectionThemesForToday?.();
    }

    renderReflectionCarouselHighlightHtml(responseId, adminHighlighted = false) {
      if (!this._isReflectionWallAdminViewer()) return '';
      const rid = this.escapeQuiltFortuneText(String(responseId || '').trim());
      if (!rid) return '';
      const active = adminHighlighted === true;
      return `<button type="button" class="quilt-reflection-carousel-highlight${active ? ' quilt-reflection-carousel-highlight--active' : ''}" data-reflection-response-id="${rid}" aria-label="${active ? 'Remove highlight' : 'Highlight reflection'}" aria-pressed="${active ? 'true' : 'false'}">
        <span aria-hidden="true">+</span>
      </button>`;
    }

    renderReflectionCarouselEngagementHtml(heartId, heartCount, options = {}) {
      const responseId = String(options.responseId || '').trim();
      const heartHtml = this.renderReflectionCarouselHeartHtml(heartId, heartCount, responseId);
      const highlightHtml = this.renderReflectionCarouselHighlightHtml(
        responseId,
        options.adminHighlight === true
      );
      if (!highlightHtml) return heartHtml;
      return `<span class="quilt-reflection-carousel-engagement">${highlightHtml}${heartHtml}</span>`;
    }

    syncReflectionCarouselHighlight(slideEl, { adminHighlight } = {}) {
      const btn =
        slideEl?.matches?.('.quilt-reflection-carousel-highlight')
          ? slideEl
          : slideEl?.querySelector?.('.quilt-reflection-carousel-highlight');
      const active = adminHighlight === true;
      if (btn) {
        btn.classList.toggle('quilt-reflection-carousel-highlight--active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.setAttribute('aria-label', active ? 'Remove highlight' : 'Highlight reflection');
      }
      const applyRgb = (el) => {
        const currentRgb = el?.style?.getPropertyValue?.('--reflection-fabric-rgb')?.trim?.();
        if (!currentRgb) return;
        el.style.setProperty(
          '--reflection-fabric-rgb',
          active
            ? this.brightenReflectionHighlightPatchRgb(currentRgb)
            : this.washReflectionCarouselPatchRgb(currentRgb)
        );
      };
      if (slideEl?.matches?.('[data-reflection-split-card]')) {
        slideEl.classList.toggle('quilt-reflection-carousel-split-card--admin-highlight', active);
        applyRgb(slideEl);
        return;
      }
      const themeSlide = slideEl?.closest?.('[data-reflection-theme-slide]') || slideEl;
      themeSlide?.classList.toggle('quilt-reflection-carousel-slide--admin-highlight', active);
      applyRgb(themeSlide);
    }

    _scrollReflectionCarouselToFront() {
      const notes = document.getElementById('quiltReflectionWallNotes');
      const viewport = notes?.querySelector?.('[data-reflection-carousel-viewport]');
      if (viewport) viewport.scrollLeft = 0;
    }

    _moveReflectionThemeSlideToFront(slideEl) {
      const themeSlide = slideEl?.matches?.('[data-reflection-theme-slide]')
        ? slideEl
        : slideEl?.closest?.('[data-reflection-theme-slide]');
      const track = themeSlide?.closest?.('[data-reflection-carousel-track]');
      if (!themeSlide || !track || themeSlide.parentElement !== track) return false;
      if (track.firstElementChild !== themeSlide) {
        track.insertBefore(themeSlide, track.firstElementChild);
      }
      const slides = Array.from(track.querySelectorAll(':scope > .quilt-reflection-carousel-slide'));
      slides.forEach((slide, index) => {
        slide.style.setProperty('--reflection-slide-z', String(index + 1));
        slide.dataset.reflectionSlide = String(index);
      });
      this.syncReflectionCarouselEdgeFray?.(slides);
      this.syncReflectionCarouselJoinTape?.(slides);
      this.syncReflectionCarouselSplitTape?.(slides);
      this._scrollReflectionCarouselToFront();
      return true;
    }

    _repaintReflectionWallFromLocalHighlight(dateKey, { scrollToFront = false } = {}) {
      const dk = String(dateKey || '').trim();
      if (!dk) return false;
      this._reflectionWallLastContentKey = null;
      const painted = this._paintReflectionWallBootstrap(dk);
      if (scrollToFront) this._scrollReflectionCarouselToFront();
      return painted;
    }

    _readLocalReflectionHighlightAtIso(dateKey, responseId) {
      const key = String(dateKey || '').trim();
      const rid = String(responseId || '').trim();
      if (!key || !rid) return '';
      const cache = this._readLocalReflectionThemesCache(key);
      const map = this._normalizeReflectionAdminHighlightMap(cache?.adminHighlightByResponseId);
      if (map[rid]) return map[rid];
      if (rid === 'first') {
        return String(cache?.adminFirstResponseHighlightAtIso || '').trim();
      }
      return '';
    }

    async toggleReflectionAdminHighlight({ responseId, dateKey, slideEl, buttonEl } = {}) {
      const dk = String(dateKey || Utils.getTodayKey() || '').trim();
      const rid = String(responseId || '').trim();
      if (!rid) return;
      if (!this._reflectionHighlightPending) this._reflectionHighlightPending = Object.create(null);
      if (this._reflectionHighlightPending[rid]) return;
      const btn = buttonEl || slideEl?.querySelector?.('.quilt-reflection-carousel-highlight');
      const wasHighlighted = btn?.classList?.contains?.('quilt-reflection-carousel-highlight--active');
      const previousAtIso = this._readLocalReflectionHighlightAtIso(dk, rid);
      const optimisticHighlighted = !wasHighlighted;
      this._reflectionHighlightPending[rid] = true;
      // Instant UI: brighten + jump the live card to the front before any network/re-paint.
      this.syncReflectionCarouselHighlight(slideEl, { adminHighlight: optimisticHighlighted });
      if (optimisticHighlighted) this._moveReflectionThemeSlideToFront(slideEl);
      const optimisticAt = optimisticHighlighted ? new Date().toISOString() : '';
      this._patchLocalReflectionThemeHighlight(dk, rid, optimisticHighlighted, optimisticAt);
      if (!optimisticHighlighted) {
        this._repaintReflectionWallFromLocalHighlight(dk, { scrollToFront: false });
      }
      const baseUrl = String(
        (typeof CONFIG !== 'undefined' && CONFIG.BACKEND?.baseUrl) ||
          (typeof root.odqBackendBaseUrl === 'function' ? root.odqBackendBaseUrl() : '') ||
          ''
      ).replace(/\/$/, '');
      try {
        const token = await this.getAdminServerMutationToken?.();
        if (!baseUrl) throw new Error('Reflection highlight API is not configured');
        if (!token) throw new Error('Missing admin token');
        const res = await fetch(`${baseUrl}/api/admin/reflection-response/highlight`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-reset-token': token
          },
          body: JSON.stringify({ responseId: rid, appDateKey: dk })
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          try {
            localStorage.removeItem('ourDailyResetToken');
          } catch (_) {
            /* */
          }
        }
        if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
        this._patchLocalReflectionThemeHighlight(
          dk,
          rid,
          data.adminHighlight === true,
          data.adminHighlightAtIso
        );
        this._reflectionWallLastContentKey = null;
        await this.loadReflectionThemesForToday?.({ force: true, skipCachePaint: true });
        if (data.adminHighlight === true) this._scrollReflectionCarouselToFront();
        this.uiService?.showToast?.(
          data.adminHighlight ? 'Reflection highlighted' : 'Highlight removed'
        );
      } catch (error) {
        this.logger?.warn?.('Reflection highlight save failed:', error);
        this._patchLocalReflectionThemeHighlight(dk, rid, wasHighlighted, previousAtIso);
        this._repaintReflectionWallFromLocalHighlight(dk, { scrollToFront: false });
        this.uiService?.showToast?.(error?.message || 'Highlight did not save. Try again?');
      } finally {
        delete this._reflectionHighlightPending[rid];
      }
    }

    syncReflectionCarouselHeart(slideEl, { hearted, heartCount, buttonEl } = {}) {
      const btn = buttonEl || slideEl?.querySelector?.('.quilt-reflection-carousel-heart');
      if (!btn) return;
      const active = !!hearted;
      const count = Math.max(0, Number(heartCount) || 0);
      btn.classList.toggle('quilt-reflection-carousel-heart--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.setAttribute('aria-label', active ? 'Unlike' : 'Like');
      const countEl = btn.querySelector('.quilt-reflection-carousel-heart-count');
      if (countEl) {
        countEl.textContent = String(count);
        countEl.hidden = count <= 0;
        countEl.setAttribute('aria-hidden', count <= 0 ? 'true' : 'false');
      }
    }

    async toggleReflectionCarouselHeart({ responseId, dateKey, slideEl, buttonEl } = {}) {
      const dk = String(dateKey || Utils.getTodayKey() || '').trim();
      const rid = String(responseId || '').trim();
      const heartId = this._reflectionHeartId(rid, dk);
      const btn = buttonEl || slideEl?.querySelector?.('.quilt-reflection-carousel-heart');
      if (btn?.dataset?.heartPending === '1') return;
      const wasHearted = btn?.classList?.contains?.('quilt-reflection-carousel-heart--active');
      const priorCount = Math.max(0, Number(btn?.querySelector?.('.quilt-reflection-carousel-heart-count')?.textContent) || 0);
      const optimisticHearted = !wasHearted;
      const optimisticCount = Math.max(0, priorCount + (optimisticHearted ? 1 : -1));
      if (btn) btn.dataset.heartPending = '1';
      this.syncReflectionCarouselHeart(slideEl, {
        hearted: optimisticHearted,
        heartCount: optimisticCount,
        buttonEl: btn
      });
      const baseUrl = String(
        (typeof CONFIG !== 'undefined' && CONFIG.BACKEND?.baseUrl) ||
          (typeof root.odqBackendBaseUrl === 'function' ? root.odqBackendBaseUrl() : '') ||
          ''
      ).replace(/\/$/, '');
      try {
        const clientId =
          String(this.currentUserId || this.quiltEngine?.deviceId || '').trim() ||
          (typeof Utils !== 'undefined' && Utils.getOrCreateUserId?.()) ||
          (typeof UtilsCore !== 'undefined' && UtilsCore.getOrCreateUserId?.()) ||
          '';
        if (!baseUrl) throw new Error('Reflection heart API is not configured');
        if (!clientId) throw new Error('Reflection heart client ID is not available');
        const apiResponseId = rid || 'first';
        const res = await fetch(
          `${baseUrl}/api/reflection-response/${encodeURIComponent(apiResponseId)}/heart`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, dateKey: dk })
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
        this.syncReflectionCarouselHeart(slideEl, {
          hearted: !!data.hearted,
          heartCount: data.heartCount,
          buttonEl: btn
        });
        this.setReflectionHeartedLocally(heartId, !!data.hearted);
      } catch (error) {
        this.logger?.warn?.('Reflection heart save failed:', error);
        this.syncReflectionCarouselHeart(slideEl, {
          hearted: wasHearted,
          heartCount: priorCount,
          buttonEl: btn
        });
        this.setReflectionHeartedLocally(heartId, wasHearted);
        this.uiService?.showToast?.('Heart did not save. Try again?');
      } finally {
        if (btn) delete btn.dataset.heartPending;
      }
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

    /** Admin highlight: same neutral paper as other patches, just brighter. */
    brightenReflectionHighlightPatchRgb(rgbCsv) {
      const washed = this.washReflectionCarouselPatchRgb(rgbCsv);
      const parts = String(washed || '')
        .split(',')
        .map((value) => parseInt(String(value).trim(), 10));
      if (parts.length < 3 || parts.some((channel) => !Number.isFinite(channel))) {
        return washed || REFLECTION_NEWSPAPER_PATCH_RGB;
      }
      const lift = 0.11;
      return parts
        .map((channel) => Math.round(channel + (255 - channel) * lift))
        .join(', ');
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
      if (normalized?.split && Array.isArray(normalized.strips)) {
        return normalized.strips.reduce((sum, strip) => {
          const author = String(strip.author || '').trim();
          return sum + strip.text.length + (author ? author.length + 3 : 0);
        }, 0);
      }
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

    _cssLengthToPx(raw, el) {
      const value = String(raw || '').trim();
      if (!value) return 0;
      if (value.endsWith('px')) return parseFloat(value) || 0;
      const host = el && el.isConnected ? el : document.body;
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;';
      const measure = document.createElement('div');
      measure.style.width = value;
      probe.appendChild(measure);
      host.appendChild(probe);
      const px = measure.getBoundingClientRect().width;
      probe.remove();
      return px || 0;
    }

    _parseReflectionSlideTransform(sourceEl) {
      const cs = sourceEl ? getComputedStyle(sourceEl) : null;
      const tiltRaw = cs?.getPropertyValue('--reflection-fabric-tilt')?.trim() || '0deg';
      const yRaw = cs?.getPropertyValue('--reflection-fabric-y')?.trim() || '0rem';
      return {
        tiltDeg: parseFloat(tiltRaw) || 0,
        yPx: this._cssLengthToPx(yRaw, sourceEl)
      };
    }

    async _drawIgReflectionClippingPaperCanvas(w, h, slide, dateKey, scale) {
      const QNC = globalThis.QuiltNewspaperClipping;
      if (!QNC?.buildNewsprintPerforatedRing || !QNC?.drawNewsprintSurfaceStack || !QNC?.hashDateKeySeed) {
        return null;
      }

      const iw = Math.max(1, Math.round(Number(w) || 1));
      const ih = Math.max(1, Math.round(Number(h) || 1));
      if (iw < 40 || ih < 32) return null;

      const rgbCsv =
        (slide.style?.getPropertyValue('--reflection-fabric-rgb') || '').trim() ||
        getComputedStyle(slide).getPropertyValue('--reflection-fabric-rgb').trim();
      const index = String(slide.dataset.reflectionSlide || '0').trim();
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const seedKey =
        String(slide.dataset.reflectionHandCutSeed || '').trim() ||
        `${dk}:reflection-patch:${index}`;
      const seedKeyNorm =
        typeof QNC.moodSpreadHandCutDateKey === 'function'
          ? QNC.moodSpreadHandCutDateKey(seedKey)
          : seedKey;
      const seed = QNC.hashDateKeySeed(seedKeyNorm);
      const clippingCfg = { ...this._reflectionClippingEdgeCfg(), width: iw, exportScale: 1 };
      const ring = QNC.buildNewsprintPerforatedRing(iw, ih, seed, clippingCfg);
      if (!ring?.length) return null;

      try {
        await QNC.ensureClippingSurfaceAssets?.({
          paperTextureUrl: 'assets/quilt-paper-card-texture.png'
        });
      } catch (_) {
        /* optional texture preload */
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(iw * scale));
      canvas.height = Math.max(1, Math.ceil(ih * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.scale(scale, scale);
      if (typeof QNC.tracePolygon === 'function') QNC.tracePolygon(ctx, ring);
      else {
        ctx.beginPath();
        ctx.moveTo(ring[0].x, ring[0].y);
        for (let i = 1; i < ring.length; i += 1) ctx.lineTo(ring[i].x, ring[i].y);
        ctx.closePath();
      }
      ctx.clip();
      const isIgPrompt = slide.classList?.contains?.('quilt-reflection-carousel-slide--ig-prompt');
      const paperHex = isIgPrompt ? '#fffefb' : this.reflectionFabricRgbCsvToHex(rgbCsv);
      QNC.drawNewsprintSurfaceStack(ctx, iw, ih, {
        paper: paperHex,
        paperTextureUrl: isIgPrompt ? null : 'assets/quilt-paper-card-texture.png',
        width: iw,
        exportScale: 1,
        cardGrainOpacity: isIgPrompt ? 0 : undefined
      });
      return canvas;
    }

    _igReflectionHighlightBorderSvgUrl() {
      return (
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cpath fill='none' stroke='%235a4f44' stroke-opacity='.32' stroke-width='3.15' stroke-linecap='round' stroke-linejoin='round' stroke-dasharray='0 7.2' vector-effect='non-scaling-stroke' d='M7.4 6.3 49.2 5.1 93.1 6.8 94.4 50.2 93.5 94.1 49.6 95.3 6.7 93.8 5.4 49.4Z'/%3E%3Cpath fill='none' stroke='%233d342c' stroke-opacity='.48' stroke-width='1.55' stroke-linecap='round' stroke-linejoin='round' stroke-dasharray='0 5.8' vector-effect='non-scaling-stroke' d='M7.6 6.5 49.4 5.3 92.9 7 94.2 50.4 93.3 93.9 49.4 95.1 6.9 94 5.6 49.6Z'/%3E%3C/svg%3E"
      );
    }

    async _loadIgReflectionHighlightBorderImage() {
      if (this._igReflectionHighlightBorderImg?.naturalWidth) {
        return this._igReflectionHighlightBorderImg;
      }
      const img = new Image();
      img.decoding = 'sync';
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = this._igReflectionHighlightBorderSvgUrl();
      });
      this._igReflectionHighlightBorderImg = img;
      return img;
    }

    async _drawIgReflectionHighlightBorderCanvas(w, h, scale, sourceEl) {
      if (
        !sourceEl?.classList?.contains?.('quilt-reflection-carousel-slide--admin-highlight') ||
        sourceEl.classList.contains('quilt-reflection-carousel-slide--split')
      ) {
        return null;
      }
      const img = await this._loadIgReflectionHighlightBorderImage();
      if (!img?.naturalWidth) return null;

      const srcCs = getComputedStyle(sourceEl);
      const edgeY = this._cssLengthToPx(
        srcCs.getPropertyValue('--reflection-clipping-edge-y').trim() || '0.72rem',
        sourceEl
      );
      const sideBleed = this._cssLengthToPx(
        srcCs.getPropertyValue('--reflection-patch-side-bleed').trim() || '0.13rem',
        sourceEl
      );
      const inset = this._cssLengthToPx(
        srcCs.getPropertyValue('--reflection-highlight-border-inset').trim() || '0.55rem',
        sourceEl
      );

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(w * scale));
      canvas.height = Math.max(1, Math.ceil(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const bx = (-sideBleed + inset) * scale;
      const by = (-edgeY + inset) * scale;
      const bw = Math.max(1, (w + 2 * sideBleed - 2 * inset) * scale);
      const bh = Math.max(1, (h + 2 * edgeY - 2 * inset) * scale);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, bx, by, bw, bh);
      return canvas;
    }

    _mergeIgReflectionClippingCaptureLayers(
      paperCanvas,
      textCanvas,
      w,
      h,
      scale,
      highlightBorderCanvas = null
    ) {
      if (!paperCanvas && !textCanvas && !highlightBorderCanvas) return null;
      if (!paperCanvas && !highlightBorderCanvas) return textCanvas || null;
      if (!textCanvas && !highlightBorderCanvas) return paperCanvas;

      const merged = document.createElement('canvas');
      const widths = [paperCanvas, textCanvas, highlightBorderCanvas]
        .filter(Boolean)
        .map((layer) => layer.width);
      const heights = [paperCanvas, textCanvas, highlightBorderCanvas]
        .filter(Boolean)
        .map((layer) => layer.height);
      merged.width = Math.max(1, ...widths, Math.ceil(w * scale));
      merged.height = Math.max(1, ...heights, Math.ceil(h * scale));
      const ctx = merged.getContext('2d');
      if (!ctx) return textCanvas || paperCanvas;

      if (paperCanvas) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
        ctx.shadowBlur = Math.max(8, 10 * (scale / 2));
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = Math.max(2, 3 * (scale / 2));
        ctx.drawImage(paperCanvas, 0, 0);
        ctx.restore();
        ctx.drawImage(paperCanvas, 0, 0);
      }
      if (textCanvas) ctx.drawImage(textCanvas, 0, 0);
      if (highlightBorderCanvas) ctx.drawImage(highlightBorderCanvas, 0, 0);
      return merged;
    }

    _syncIgReflectionSlideExportCopyWrap(slides) {
      const list = Array.isArray(slides) ? slides : [];
      list.forEach((slide) => {
        if (!slide?.classList?.contains?.('quilt-reflection-carousel-slide--clipping')) return;
        const cs = getComputedStyle(slide);
        const copyW = cs.getPropertyValue('--reflection-clipping-copy-w').trim();
        const targetW = copyW || '100%';
        slide
          .querySelectorAll('.quilt-reflection-carousel-text, .quilt-reflection-carousel-copy')
          .forEach((el) => {
            el.style.width = targetW;
            el.style.maxWidth = '100%';
            el.style.whiteSpace = 'normal';
            el.style.overflowWrap = 'break-word';
            el.style.wordBreak = 'normal';
          });
        slide.querySelectorAll('.quilt-reflection-carousel-body').forEach((el) => {
          el.style.display = 'block';
          el.style.whiteSpace = 'normal';
          el.style.overflowWrap = 'break-word';
        });
      });
    }

    /** IG Playwright capture — keep answer copy inside the dotted highlight frame. */
    _syncIgReflectionCaptureResponseCopyWrap(slides) {
      const list = Array.isArray(slides) ? slides : [];
      list.forEach((slide) => {
        if (!slide?.classList?.contains?.('quilt-reflection-carousel-slide--clipping')) return;
        if (slide.classList.contains('quilt-reflection-carousel-slide--ig-prompt')) return;
        slide
          .querySelectorAll('.quilt-reflection-carousel-text, .quilt-reflection-carousel-copy')
          .forEach((el) => {
            el.style.width = '100%';
            el.style.maxWidth = '100%';
            el.style.boxSizing = 'border-box';
            el.style.whiteSpace = 'normal';
            el.style.overflowWrap = 'break-word';
            el.style.wordBreak = 'normal';
          });
        slide.querySelectorAll('.quilt-reflection-carousel-body').forEach((el) => {
          el.style.display = 'block';
          el.style.width = '100%';
          el.style.maxWidth = '100%';
          el.style.boxSizing = 'border-box';
          el.style.whiteSpace = 'normal';
          el.style.overflowWrap = 'break-word';
          el.style.wordBreak = 'normal';
        });
        slide.querySelectorAll('.quilt-reflection-carousel-card-footer').forEach((el) => {
          el.style.width = '100%';
          el.style.maxWidth = '100%';
          el.style.boxSizing = 'border-box';
        });
      });
    }

    _rotateIgReflectionCaptureCanvas(canvas, w, h, scale, tiltDeg, yPx) {
      if (!canvas || (!tiltDeg && !yPx)) return canvas;
      const rad = (tiltDeg * Math.PI) / 180;
      const sw = w * scale;
      const sh = h * scale;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const rw = Math.ceil(sw * cos + sh * sin);
      const rh = Math.ceil(sw * sin + sh * cos);
      const out = document.createElement('canvas');
      out.width = Math.max(1, rw);
      out.height = Math.max(1, rh);
      const ctx = out.getContext('2d');
      if (!ctx) return canvas;
      ctx.translate(out.width / 2, out.height / 2);
      ctx.rotate(rad);
      ctx.translate(0, yPx * scale);
      ctx.drawImage(canvas, -sw / 2, -sh / 2, sw, sh);
      return out;
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

    getReflectionFabricPatchStyle(index, themeText, allThemes, rgbOverride, options = {}) {
      const palette = this.getReflectionFabricPatchPalette();
      const rawRgb =
        rgbOverride || palette[index % palette.length] || REFLECTION_NEWSPAPER_PATCH_RGB;
      const rgb = options.adminHighlight
        ? this.brightenReflectionHighlightPatchRgb(rawRgb)
        : this.washReflectionCarouselPatchRgb(rawRgb);
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

    buildReflectionInvitePatchSlide(index, allThemesForHeight = [], rgbOverride, myReflection = null) {
      const rawRgb = rgbOverride || this.pickReflectionFabricPatchRgb(index, null);
      const washedRgb = this.washReflectionCarouselPatchRgb(rawRgb);
      const lightClass =
        this.getReflectionFabricPatchWeaveStrength(washedRgb) < 1 ? ' quilt-reflection-carousel-slide--light' : '';
      const heightThemes = allThemesForHeight.length ? allThemesForHeight : ['add yours ?'];
      const dateKey = String(Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const style = this.getReflectionFabricPatchStyle(index, 'add yours ?', heightThemes, rawRgb);
      const responseId = String(myReflection?.responseId || '').trim();
      if (responseId) {
        return `
            <article class="quilt-reflection-carousel-slide quilt-reflection-carousel-slide--clipping quilt-reflection-carousel-slide--invite quilt-reflection-carousel-slide--mine-invite${lightClass}" data-reflection-invite-slide data-reflection-mine-invite="1" data-reflection-response-id="${this.escapeQuiltFortuneText(responseId)}" data-reflection-slide="${index}" data-reflection-hand-cut-seed="${dateKey}:reflection-invite:${index}" style="${style}">
              ${this._mineReflectionCarouselActionsMarkup(responseId)}
            </article>
          `;
      }
      return `
            <article class="quilt-reflection-carousel-slide quilt-reflection-carousel-slide--clipping quilt-reflection-carousel-slide--invite${lightClass}" data-reflection-invite-slide data-reflection-slide="${index}" data-reflection-hand-cut-seed="${dateKey}:reflection-invite:${index}" style="${style}">
              <button type="button" class="quilt-reflection-carousel-invite-btn" aria-label="Add your reflection?">add yours ?</button>
            </article>
          `;
    }

    buildReflectionThemePatchSlide(
      slideIndex,
      theme,
      allThemes,
      rgb,
      edgeFray = {},
      myReflection = null,
      dateKeyOverride = null,
      patchOptions = {}
    ) {
      const igExport = !!patchOptions.igExport;
      const dateKey =
        String(dateKeyOverride || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const normalized = this.normalizeReflectionWallTheme(theme);
      const isSplit = !!(normalized?.split && Array.isArray(normalized.strips));
      const adminHighlighted = this.reflectionThemeIsAdminHighlighted(theme);
      /** Split pairs carry their own per-card highlight (below); the shared article never brightens as a whole. */
      const highlightForArticle = isSplit ? false : adminHighlighted;
      const previewRgb = highlightForArticle
        ? this.brightenReflectionHighlightPatchRgb(rgb)
        : this.washReflectionCarouselPatchRgb(rgb);
      const lightClass =
        this.getReflectionFabricPatchWeaveStrength(previewRgb) < 1
          ? ' quilt-reflection-carousel-slide--light'
          : '';
      const wideCopyClass = this.reflectionCarouselNeedsWideCopy(theme)
        ? ' quilt-reflection-carousel-slide--wide-copy'
        : '';
      const isMine = this.reflectionThemeMatchesMine(theme, myReflection);
      const responseId = isMine
        ? String(myReflection?.responseId || '').trim()
        : isSplit
          ? String(normalized.strips.find((strip) => strip.responseId)?.responseId || '').trim()
          : String(normalized?.responseId || '').trim();
      const mineAttrs = isMine
        ? ` data-reflection-mine="1" data-reflection-response-id="${this.escapeQuiltFortuneText(responseId)}"`
        : responseId
          ? ` data-reflection-response-id="${this.escapeQuiltFortuneText(responseId)}"`
          : '';
      const mineActions = isMine
        ? this._mineReflectionCarouselActionsMarkup(responseId)
        : '';
      const heartId = this._reflectionHeartId(responseId, dateKey);
      const heartMarkup = isSplit
        ? ''
        : this.renderReflectionCarouselEngagementHtml(heartId, normalized?.heartCount || 0, {
            responseId: responseId || 'first',
            adminHighlight: adminHighlighted
          });
      const splitClass = isSplit ? ' quilt-reflection-carousel-slide--split' : '';
      const highlightClass = highlightForArticle ? ' quilt-reflection-carousel-slide--admin-highlight' : '';
      const igExportClass = igExport ? ' quilt-reflection-carousel-slide--ig-export-response' : '';
      const footerMarkup = mineActions
        ? `<div class="quilt-reflection-carousel-footer">${mineActions}</div>`
        : '';
      return `
            <article class="quilt-reflection-carousel-slide quilt-reflection-carousel-slide--clipping${splitClass}${wideCopyClass}${lightClass}${highlightClass}${igExportClass}" data-reflection-theme-slide data-reflection-slide="${slideIndex}" data-reflection-hand-cut-seed="${dateKey}:reflection-response:${slideIndex}"${mineAttrs} style="${this.getReflectionFabricPatchStyle(slideIndex, theme, allThemes, rgb, { adminHighlight: highlightForArticle, igExport })}">
              <div class="quilt-reflection-carousel-text">${this.formatReflectionCarouselTextHtml(theme, slideIndex, { heartMarkup: igExport ? '' : heartMarkup, rgb })}</div>
              ${footerMarkup}
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

    getReflectionCarouselMarkup(themeTexts, myReflection = null, options = {}) {
      const ideas = Array.isArray(themeTexts) ? themeTexts.filter(Boolean) : [];
      const dateKey =
        String(options.dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const omitInviteSlide = options.omitInviteSlide === true;
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
          this.buildReflectionThemePatchSlide(slideIndex, ideas[i], ideas, themeRgbs[i], {}, myReflection, dateKey)
        );
        slideIndex += 1;
      }
      if (!omitInviteSlide) {
        slideParts.push(
          this.buildReflectionInvitePatchSlide(
            slideIndex,
            ideas.length ? [...ideas, 'add yours ?'] : ['add yours ?'],
            inviteRgb,
            myReflection
          )
        );
      }
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

    /** IG export — prompt strip height scales with question length (wide column). */
    getIgReflectionPromptStripHeight(promptText) {
      const len = String(promptText || '').trim().length;
      if (len <= 42) return '6.75rem';
      if (len <= 68) return '7.25rem';
      if (len <= 92) return '8rem';
      return '8.75rem';
    }

    _syncIgReflectionPromptStripHeight(scope) {
      const slide =
        scope?.classList?.contains?.('quilt-reflection-carousel-slide--ig-prompt')
          ? scope
          : scope?.querySelector?.('.quilt-reflection-carousel-slide--ig-prompt');
      const text = slide?.querySelector?.('.quilt-reflection-carousel-text');
      if (!slide || !text) return;
      void slide.offsetHeight;
      void text.offsetHeight;
      const cs = getComputedStyle(slide);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const edgeY = this._cssLengthToPx(cs.getPropertyValue('--reflection-clipping-edge-y'), slide);
      const textH = Math.ceil(text.getBoundingClientRect().height || text.scrollHeight || 0);
      const h = Math.max(72, Math.ceil(textH + padY + edgeY * 2 + 6));
      slide.style.setProperty('--reflection-patch-h', `${h}px`);
      slide.style.setProperty('--reflection-patch-h-base', `${h}px`);
      slide.style.minHeight = `${h}px`;
      slide.style.height = `${h}px`;
    }

    buildIgReflectionPromptStripSlide(reflectionPrompt, dateKey) {
      const promptText = String(reflectionPrompt || '').trim();
      if (!promptText) return '';
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const promptHtml =
        typeof this.quoteService?.formatQuoteLineForQuiltDisplay === 'function'
          ? this.quoteService.formatQuoteLineForQuiltDisplay(promptText)
          : this.escapeQuiltFortuneText(promptText);
      const rgb = '255, 255, 254';
      const textColor = this.getReflectionFabricPatchTextColor(rgb);
      const weaveStrength = 0.35;
      const style = [
        `--reflection-fabric-rgb: ${rgb}`,
        `--reflection-fabric-text: ${textColor}`,
        `--reflection-fabric-weave: ${weaveStrength}`,
        `--reflection-patch-w: 84vw`,
        `--reflection-patch-h: ${this.getIgReflectionPromptStripHeight(promptText)}`,
        `--reflection-fabric-tilt: -0.55deg`,
        `--reflection-fabric-y: 0rem`,
        `--reflection-slide-z: 1`
      ].join('; ');
      return `
            <article class="quilt-reflection-carousel-slide quilt-reflection-carousel-slide--clipping quilt-reflection-carousel-slide--ig-prompt" data-reflection-ig-prompt-slide data-reflection-slide="0" data-reflection-hand-cut-seed="${this.escapeQuiltFortuneText(dk)}:reflection-ig-prompt" style="${style}">
              <div class="quilt-reflection-carousel-text">
                <span class="quilt-reflection-carousel-body quilt-reflection-carousel-body--ig-prompt">${promptHtml}</span>
              </div>
            </article>
          `;
    }

    buildIgYesterdayStatsStripSlide(contributorCount, dateKey) {
      const count = Math.max(1, Math.floor(Number(contributorCount) || 1));
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const plainText = `Yesterday ${count} people read that quote and then added their color to this quilt.`;
      const bodyHtml = `Yesterday <strong class="quilt-reflection-carousel-yesterday-count">${count}</strong> people read that quote and then added their color to this quilt.`;
      const rgb = '246, 244, 241';
      const textColor = this.getReflectionFabricPatchTextColor(rgb);
      const weaveStrength = 0.92;
      const style = [
        `--reflection-fabric-rgb: ${rgb}`,
        `--reflection-fabric-text: ${textColor}`,
        `--reflection-fabric-weave: ${weaveStrength}`,
        `--reflection-patch-w: 84vw`,
        `--reflection-patch-h: ${this.getIgReflectionPromptStripHeight(plainText)}`,
        `--reflection-fabric-tilt: -0.55deg`,
        `--reflection-fabric-y: 0rem`,
        `--reflection-slide-z: 1`
      ].join('; ');
      return `
            <article class="quilt-reflection-carousel-slide quilt-reflection-carousel-slide--clipping quilt-reflection-carousel-slide--ig-prompt quilt-reflection-carousel-slide--ig-yesterday-stats" data-reflection-ig-prompt-slide data-reflection-slide="0" data-reflection-hand-cut-seed="${this.escapeQuiltFortuneText(dk)}:ig-yesterday-stats" style="${style}">
              <div class="quilt-reflection-carousel-text">
                <span class="quilt-reflection-carousel-body quilt-reflection-carousel-body--ig-prompt">${bodyHtml}</span>
              </div>
            </article>
          `;
    }

    _ensureIgYesterdayStatsPlaywrightCaptureStyles() {
      this._ensureIgReflectionPlaywrightCaptureStyles(1);
      if (document.getElementById('ig-yesterday-stats-playwright-capture-styles')) return;
      const exportW = this._igReflectionPlaywrightCaptureViewportWidth();
      const columnW = this._igReflectionExportColumnWidth(exportW);
      const style = document.createElement('style');
      style.id = 'ig-yesterday-stats-playwright-capture-styles';
      style.textContent = `
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-stack--yesterday-stats {
          min-height: 1280px;
          justify-content: center;
          align-items: center;
          width: ${columnW}px;
          max-width: ${columnW}px;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-yesterday-count {
          font-weight: 600 !important;
          font-variation-settings: 'wght' 600 !important;
        }
      `;
      document.head.appendChild(style);
    }

    _syncIgYesterdayStatsPlaywrightCaptureLayout(captureScreen, dateKey) {
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const exportW = this._igReflectionPlaywrightCaptureViewportWidth();
      const columnW = this._igReflectionExportColumnWidth(exportW);
      const promptW = this._igReflectionCapturePromptMaxWidth(exportW);
      const stack = captureScreen.querySelector('.quilt-reflection-ig-capture-stack');
      const host = captureScreen.closest('#ig-reflection-playwright-capture-host');

      this._syncIgReflectionPromptStripHeight(stack || captureScreen);
      const promptSlide = captureScreen.querySelector('.quilt-reflection-carousel-slide--ig-prompt');
      if (promptSlide) {
        promptSlide.style.width = `${promptW}px`;
        promptSlide.style.maxWidth = `${promptW}px`;
        promptSlide.style.setProperty('--reflection-patch-w', `${promptW}px`);
        promptSlide.style.marginLeft = 'auto';
        promptSlide.style.marginRight = 'auto';
      }

      if (stack) {
        stack.style.transform = 'none';
        stack.style.width = `${columnW}px`;
        stack.style.minHeight = '1280px';
        stack.style.justifyContent = 'center';
        stack.style.alignItems = 'center';
        stack.style.background = 'transparent';
      }
      if (host) {
        host.style.width = `${exportW}px`;
        host.style.height = 'auto';
        host.style.background = 'transparent';
      }
      if (captureScreen) {
        captureScreen.style.background = 'transparent';
      }

      const slides = promptSlide ? [promptSlide] : [];
      this.syncReflectionCarouselEdgeFray(slides);
      this.syncReflectionCarouselHandCuts(slides, dk);
      this.syncReflectionCarouselCopyAlign(slides);
      this._applyIgReflectionCaptureCardJitter(captureScreen, dk);
      this.syncIgReflectionCapturePromptEdgeTape(stack, dk);
      this.syncReflectionCarouselSplitTape(slides);

      if (host && stack) {
        void stack.offsetHeight;
        host.style.height = `${Math.ceil(stack.getBoundingClientRect().height) + 8}px`;
      }
    }

    /** IG carousel slide 4 — centered yesterday stats card for Playwright screenshot. */
    async prepareIgYesterdayStatsSlidePlaywrightCapture(options = {}) {
      if (typeof document === 'undefined') return null;
      const contributorCount = Math.max(1, Math.floor(Number(options.contributorCount) || 1));
      const dateKey = String(options.dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';

      this.teardownIgReflectionSlidePlaywrightCapture?.();
      this._ensureIgYesterdayStatsPlaywrightCaptureStyles();

      let host = document.getElementById('ig-reflection-playwright-capture-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'ig-reflection-playwright-capture-host';
        host.setAttribute('aria-hidden', 'true');
        document.body.appendChild(host);
      }

      const cardSlide = this.buildIgYesterdayStatsStripSlide(contributorCount, dateKey);
      const escapedDateKey = this.escapeQuiltFortuneText(dateKey);

      host.innerHTML = `
        <div id="screen-quilt-ig-playwright" class="screen active is-ig-reflection-playwright-capture">
          <div class="quilt-reflection-scrap-widget" data-ig-reflection-capture-root>
            <section class="quilt-reflection-wall">
              <div class="quilt-reflection-theme-cards-shell">
                <div class="quilt-reflection-wall-notes">
                  <div class="quilt-reflection-ig-capture-stack quilt-reflection-ig-capture-stack--yesterday-stats" data-reflection-hand-cut-date-key="${escapedDateKey}">
                    ${cardSlide}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      `;

      const liveScreen = document.getElementById('screen-quilt');
      const captureScreen = host.querySelector('#screen-quilt-ig-playwright');
      if (!captureScreen) return null;

      this._igReflectionPlaywrightPrevLiveId = liveScreen?.getAttribute?.('id') || 'screen-quilt';
      if (liveScreen && liveScreen !== captureScreen) {
        liveScreen.id = 'screen-quilt-live-suspended';
      }
      captureScreen.id = 'screen-quilt';

      document.documentElement.classList.add('is-ig-reflection-playwright-capture-active');
      document.body.classList.add('is-ig-reflection-playwright-capture-active');

      this._syncIgYesterdayStatsPlaywrightCaptureLayout(captureScreen, dateKey);
      await this._waitForIgReflectionExportImages(captureScreen);
      this._syncIgYesterdayStatsPlaywrightCaptureLayout(captureScreen, dateKey);

      const stack = captureScreen.querySelector('.quilt-reflection-ig-capture-stack');
      const rect = stack?.getBoundingClientRect?.() || captureScreen.getBoundingClientRect();
      this._igReflectionPlaywrightCaptureActive = true;

      return {
        selector: '#ig-reflection-playwright-capture-host .quilt-reflection-ig-capture-stack',
        hostSelector: '#ig-reflection-playwright-capture-host',
        logicalWidth: Math.max(1, Math.round(rect.width) || this._igReflectionExportColumnWidth()),
        logicalHeight: Math.max(1, Math.round(rect.height) || 1),
        contributorCount
      };
    }

    /** IG slide 2 export — prompt strip + response patches, stable dateKey for hand-cut seeds. */
    buildIgReflectionCarouselMarkupForExport(themeEntries, dateKey, reflectionPrompt = '') {
      const ideas = (Array.isArray(themeEntries) ? themeEntries : [])
        .map((theme) => this.normalizeReflectionWallTheme(theme))
        .filter((entry) => this.reflectionWallThemeRenderable(entry));
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const themeRgbs = [];
      let previousRgb = null;
      ideas.forEach((_, index) => {
        const rgb = this.pickReflectionFabricPatchRgb(index, previousRgb);
        themeRgbs.push(rgb);
        previousRgb = rgb;
      });
      const slideParts = [];
      const promptSlide = this.buildIgReflectionPromptStripSlide(reflectionPrompt, dk);
      if (promptSlide) slideParts.push(promptSlide);
      const responseSlides = [];
      for (let i = 0; i < ideas.length; i += 1) {
        responseSlides.push(
          this.buildReflectionThemePatchSlide(i, ideas[i], ideas, themeRgbs[i], {}, null, dk, {
            igExport: true
          })
        );
      }
      const promptHtml = slideParts.join('');
      const responsesHtml = responseSlides.join('');
      const responsesTrack = responsesHtml
        ? `<div class="quilt-reflection-carousel-ig-responses-track" data-reflection-carousel-track data-reflection-ig-responses-track>${responsesHtml}</div>`
        : '';
      return `
        <div class="quilt-reflection-carousel" data-reflection-carousel data-reflection-hand-cut-date-key="${this.escapeQuiltFortuneText(dk)}">
          <div class="quilt-reflection-carousel-viewport" data-reflection-carousel-viewport aria-hidden="true">
            <div class="quilt-reflection-carousel-track" data-reflection-carousel-track>${promptHtml}${responsesTrack}</div>
          </div>
        </div>
      `;
    }

    /** IG slide 2 raster width — match 1080 panel so patches can fill the slide. */
    _igReflectionExportViewportWidth() {
      return 1080;
    }

    _igReflectionExportPatchBodyPx() {
      return 51;
    }

    _igReflectionExportAuthorPx() {
      return 38;
    }

    _igReflectionExportColumnWidth(exportViewportWidth) {
      return Math.max(1, (exportViewportWidth || this._igReflectionExportViewportWidth()) - 48);
    }

    _igReflectionCapturePromptMaxWidth(exportViewportWidth) {
      const exportW = exportViewportWidth || this._igReflectionExportViewportWidth();
      return Math.floor(exportW * 0.7);
    }

    _igReflectionCaptureStackTargetHeight(responseCount) {
      const n = Math.max(1, Math.min(6, Math.floor(Number(responseCount) || 1)));
      if (n <= 1) return 680;
      if (n === 2) return 780;
      if (n === 3) return 900;
      if (n === 4) return 980;
      if (n === 5) return 1040;
      return 1100;
    }

    _igReflectionCaptureRowOverlapPx() {
      return 32;
    }

    /** Row sizes for IG capture — max 2 patches per row (1–6). */
    _igReflectionCaptureGridRowSizes(count) {
      const n = Math.max(0, Math.min(6, Math.floor(Number(count) || 0)));
      if (n <= 0) return [];
      if (n === 1) return [1];
      if (n === 2) return [2];
      if (n === 3) return [2, 1];
      if (n === 4) return [2, 2];
      if (n === 5) return [2, 2, 1];
      return [2, 2, 2];
    }

    _igReflectionCapturePromptResponsesGap() {
      return '7.5rem';
    }

    _igReflectionCaptureStackGap(responseCount) {
      return '0';
    }

    _igReflectionExportPatchOverlapPx() {
      return 10;
    }

    _vwCssToPx(vwCss, viewportW) {
      const n = parseFloat(String(vwCss || '').trim());
      if (!Number.isFinite(n)) return 0;
      return (n / 100) * (viewportW || this._igReflectionExportViewportWidth());
    }

    /** Scale app-like patch widths/heights so every response fits in one row on slide 2. */
    _computeIgReflectionResponsePatchLayout(ideas, exportW, measureEl) {
      const list = Array.isArray(ideas) ? ideas : [];
      const count = list.length;
      if (!count) return [];
      const columnW = this._igReflectionExportColumnWidth(exportW);
      const overlapPx = this._igReflectionExportPatchOverlapPx();
      const host = measureEl?.isConnected ? measureEl : document.body;

      const naturalWidths = list.map((theme) =>
        this._vwCssToPx(this.getReflectionFabricPatchWidth(theme, list), exportW)
      );
      let totalW =
        naturalWidths.reduce((sum, width) => sum + width, 0) - overlapPx * Math.max(0, count - 1);
      const widthScale = totalW > columnW ? columnW / totalW : 1;

      const naturalHeights = list.map((theme) =>
        this._cssLengthToPx(this.getReflectionFabricPatchHeight(theme, list), host)
      );
      const maxNaturalH = Math.max(...naturalHeights, 1);
      const maxResponseH = 520;
      const heightScale = maxNaturalH > maxResponseH ? maxResponseH / maxNaturalH : 1;

      const rowW = columnW + overlapPx * Math.max(0, count - 1);
      const equalW = Math.floor(rowW / count);

      return list.map((theme, index) => ({
        widthPx:
          count <= 3
            ? equalW
            : Math.max(148, Math.round(naturalWidths[index] * widthScale)),
        heightPx: Math.max(148, Math.round(naturalHeights[index] * heightScale))
      }));
    }

    _getIgReflectionCaptureSlideCopyWeight(slide) {
      const text =
        slide?.querySelector?.('.quilt-reflection-carousel-text')?.textContent?.trim() || '';
      return Math.max(12, text.length);
    }

    /** Per-row patch widths from copy length — longer answers get wider rectangles. */
    _computeIgReflectionCaptureRowPatchWidths(rowSlides, columnW, overlapPx) {
      const slides = Array.isArray(rowSlides) ? rowSlides.filter(Boolean) : [];
      const n = slides.length;
      if (!n) return [];
      const minW = 120;
      const maxW = n === 1 ? Math.floor(columnW * 0.84) : Math.floor(columnW * 0.62);
      const tapeGutterPx = 18;

      let widths = slides.map((slide) => {
        const chars = this._getIgReflectionCaptureSlideCopyWeight(slide);
        const raw = 68 + chars * 7.1 + tapeGutterPx;
        return Math.max(minW, Math.min(maxW, Math.round(raw)));
      });

      const visibleWidth = () =>
        widths.reduce((sum, w) => sum + w, 0) - overlapPx * Math.max(0, n - 1);

      let vis = visibleWidth();
      if (vis > columnW) {
        const scale = columnW / vis;
        widths = widths.map((w) => Math.max(minW, Math.floor(w * scale)));
        vis = visibleWidth();
        if (n > 1) {
          let diff = columnW - vis;
          const weights = slides.map((slide) => this._getIgReflectionCaptureSlideCopyWeight(slide));
          const order = weights
            .map((w, i) => i)
            .sort((a, b) => weights[b] - weights[a]);
          let guard = 0;
          while (diff !== 0 && guard < 240) {
            const i = order[guard % order.length];
            if (diff > 0) {
              widths[i] += 1;
              diff -= 1;
            } else if (widths[i] > minW) {
              widths[i] -= 1;
              diff += 1;
            }
            guard += 1;
          }
        }
      }

      return widths;
    }

    _fitIgReflectionResponsePatchHeights(responseSlides) {
      const list = Array.isArray(responseSlides) ? responseSlides : [];
      list.forEach((slide) => {
        if (!slide) return;
        slide.style.removeProperty('--reflection-patch-h');
        slide.style.removeProperty('--reflection-patch-h-base');
        slide.style.height = 'auto';
        slide.style.minHeight = '0';
        void slide.offsetHeight;
        const textEl = slide.querySelector('.quilt-reflection-carousel-text');
        const cs = getComputedStyle(slide);
        const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        const edgeY = this._cssLengthToPx(cs.getPropertyValue('--reflection-clipping-edge-y'), slide);
        const contentH = Math.ceil(
          Math.max(slide.scrollHeight, textEl?.scrollHeight || 0, textEl?.getBoundingClientRect().height || 0)
        );
        const needed = Math.max(118, Math.ceil(contentH + edgeY * 2 + 8));
        slide.style.minHeight = `${needed}px`;
        slide.style.height = `${needed}px`;
        slide.style.setProperty('--reflection-patch-h', `${needed}px`);
        slide.style.setProperty('--reflection-patch-h-base', `${needed}px`);
      });
    }

    _igReflectionExportResponseSlides(scope) {
      const track =
        scope?.querySelector?.('[data-reflection-ig-responses-track]') ||
        scope?.closest?.('[data-reflection-ig-responses-track]');
      if (track) {
        return Array.from(track.querySelectorAll('.quilt-reflection-carousel-slide'));
      }
      return Array.from(scope?.querySelectorAll?.('.quilt-reflection-carousel-slide--ig-export-response') || []);
    }

    _ensureIgReflectionExportStyles() {
      const exportW = this._igReflectionExportViewportWidth();
      const patchW = this._igReflectionExportColumnWidth(exportW);
      const promptW = this._igReflectionCapturePromptMaxWidth(exportW);
      const overlapPx = this._igReflectionExportPatchOverlapPx();
      const patchBodyPx = this._igReflectionExportPatchBodyPx();
      const authorPx = this._igReflectionExportAuthorPx();
      const kickerPx = Math.max(22, Math.round(patchBodyPx * 0.55));
      const prev = document.getElementById('ig-reflection-export-styles');
      if (prev) prev.remove();
      const style = document.createElement('style');
      style.id = 'ig-reflection-export-styles';
      style.textContent = `
        #screen-quilt-ig-export-host {
          position: fixed;
          left: -99999px;
          top: 0;
          width: ${exportW}px;
          max-width: ${exportW}px;
          pointer-events: none;
          z-index: -1;
          overflow: visible;
        }
        #ig-reflection-capture-clone {
          position: fixed;
          left: -9999px;
          top: 0;
          width: ${exportW}px;
          max-width: ${exportW}px;
          pointer-events: none;
          z-index: -1;
          opacity: 1;
          overflow: visible;
        }
        #ig-reflection-capture-clone .quilt-reflection-carousel-engagement,
        #ig-reflection-capture-clone .quilt-reflection-carousel-heart {
          display: none !important;
        }
        #screen-quilt.is-ig-export {
          display: block !important;
          opacity: 1 !important;
          position: relative !important;
          pointer-events: none !important;
          width: ${exportW}px;
          max-width: ${exportW}px;
          padding: 0;
          margin: 0;
          background: transparent;
          overflow: visible;
          --quilt-quote-copy-size: ${patchBodyPx}px;
          --quilt-reflection-theme-size: ${patchBodyPx - 2}px;
          --reflection-clipping-card-max: ${patchW}px;
          --reflection-patch-w: ${patchW}px;
          --reflection-patch-overlap: ${overlapPx}px;
          --reflection-clipping-pad-y: calc(6px + var(--reflection-clipping-edge-y));
          --reflection-clipping-pad-x-outer: 28px;
          --reflection-clipping-edge-y: 8px;
          --reflection-panel-top-gutter: 0px;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-slide--ig-export-response {
          flex: 0 0 auto !important;
          box-sizing: border-box !important;
          --reflection-clipping-pad-y: calc(5px + var(--reflection-clipping-edge-y));
          --reflection-clipping-pad-x-outer: 22px;
          --reflection-clipping-edge-y: 7px;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-slide--ig-prompt {
          width: ${promptW}px !important;
          max-width: ${promptW}px !important;
          flex: 0 0 auto !important;
          --reflection-patch-w: ${promptW}px;
          --reflection-patch-h-base: auto;
          min-height: 0 !important;
          height: auto !important;
          align-items: center !important;
          padding-block: calc(5px + var(--reflection-clipping-edge-y)) !important;
          --reflection-clipping-pad-y: calc(5px + var(--reflection-clipping-edge-y));
          --reflection-clipping-edge-y: 8px;
        }
        #screen-quilt.is-ig-export .quilt-reflection-scrap-widget,
        #screen-quilt.is-ig-export .quilt-reflection-wall,
        #screen-quilt.is-ig-export .quilt-reflection-theme-cards-shell,
        #screen-quilt.is-ig-export .quilt-reflection-wall-notes,
        #screen-quilt.is-ig-export .quilt-reflection-carousel {
          width: ${patchW}px !important;
          max-width: ${patchW}px !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-card-footer .quilt-reflection-carousel-author {
          font-size: ${authorPx}px !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-slide--ig-prompt .quilt-reflection-carousel-text {
          text-align: center !important;
          padding-top: 0.15rem;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-slide--ig-prompt .quilt-reflection-carousel-body {
          display: block !important;
          text-align: center !important;
          font-size: ${patchBodyPx}px !important;
          line-height: 1.18 !important;
          width: 100% !important;
          max-width: 100% !important;
          white-space: normal !important;
          overflow-wrap: break-word !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-slide--ig-export-response .quilt-reflection-carousel-body {
          font-size: ${patchBodyPx}px !important;
          line-height: 1.18 !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-ig-prompt-kicker {
          display: block;
          font-size: ${kickerPx}px !important;
          line-height: 1.1 !important;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.62;
          margin: 0 0 0.2rem;
          text-align: center;
        }
        #screen-quilt.is-ig-export .quilt-reflection-scrap-kicker,
        #screen-quilt.is-ig-export .quilt-reflection-response-form,
        #screen-quilt.is-ig-export .quilt-reflection-archive-link,
        #screen-quilt.is-ig-export .quilt-reflection-scraps-after,
        #screen-quilt.is-ig-export .quilt-reflection-carousel-engagement,
        #screen-quilt.is-ig-export .quilt-reflection-carousel-heart {
          display: none !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-viewport {
          overflow: visible !important;
          scroll-snap-type: none !important;
          cursor: default !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-track {
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          gap: clamp(0.35rem, 1.2vw, 0.55rem) !important;
          transform: none !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-ig-responses-track {
          display: flex !important;
          flex-direction: row !important;
          align-items: flex-end !important;
          flex-wrap: nowrap !important;
          width: 100% !important;
          max-width: 100% !important;
          position: relative !important;
          overflow: visible !important;
          gap: 0 !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-ig-responses-track .quilt-reflection-carousel-slide:not(:first-child) {
          margin-left: calc(-1 * var(--reflection-patch-overlap, ${overlapPx}px)) !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-track > .quilt-reflection-carousel-slide {
          margin-left: 0 !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-slide {
          flex: 0 0 auto !important;
          scroll-snap-align: unset !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-text,
        #screen-quilt.is-ig-export .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-copy,
        #screen-quilt.is-ig-export .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-body {
          width: 100% !important;
          max-width: 100% !important;
          white-space: normal !important;
          overflow-wrap: break-word !important;
          word-break: normal !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-body {
          display: block !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-wall {
          margin-left: 0 !important;
          margin-right: 0 !important;
          width: 100% !important;
        }
        #screen-quilt.is-ig-export .quilt-reflection-scrap-widget {
          padding-top: 0 !important;
        }
      `;
      document.head.appendChild(style);
    }

    _igReflectionCaptureStyleFilter(text) {
      return /quilt-reflection|reflection-prompt|reflection-question|reflection-scrap|reflection-clipping|reflection-patch|reflection-fabric|reflection-join|reflection-split|reflection-card|reflection-fray|reflection-highlight|quilt-byg|join-tape|split-tape|question-paper|quilt-quote-copy-size|quilt-reflection-prompt|scrap-text|prompt-question|odq-paper-tape|before-you-go-tape|odq-artifact|quilt-float|quilt-paper-column/i.test(
        String(text || '')
      );
    }

    _collectStylesheetRules(out, ruleList) {
      if (!ruleList) return;
      for (const rule of ruleList) {
        if (rule.cssRules && rule.cssRules.length) {
          this._collectStylesheetRules(out, rule.cssRules);
          continue;
        }
        if (rule.cssText) out.push(rule);
      }
    }

    /** Mirror quilt-screen reflection CSS onto the html2canvas capture clone. */
    _ensureIgReflectionCaptureStyles() {
      const exportW = this._igReflectionExportViewportWidth();
      const patchW = this._igReflectionExportColumnWidth(exportW);
      const promptW = this._igReflectionCapturePromptMaxWidth(exportW);
      const overlapPx = this._igReflectionExportPatchOverlapPx();
      const patchBodyPx = this._igReflectionExportPatchBodyPx();
      const kickerPx = Math.max(22, Math.round(patchBodyPx * 0.55));
      const prev = document.getElementById('ig-reflection-capture-styles');
      if (prev) prev.remove();
      const ROOT = '#ig-reflection-capture-clone';
      const rules = [];
      for (const sheet of document.styleSheets) {
        try {
          this._collectStylesheetRules(rules, sheet.cssRules);
        } catch (_) {
          /* cross-origin stylesheets */
        }
      }
      let css = '';
      rules.forEach((rule) => {
        const text = rule.cssText || '';
        if (!text.includes('#screen-quilt')) return;
        const selector = String(rule.selectorText || '');
        if (selector === '#screen-quilt' || selector === '#screen-quilt.screen') {
          css += `${text.replace(/#screen-quilt/g, ROOT)}\n`;
          return;
        }
        if (!this._igReflectionCaptureStyleFilter(text)) return;
        css += `${text.replace(/#screen-quilt/g, ROOT)}\n`;
      });
      css += `
        ${ROOT} {
          width: ${exportW}px;
          max-width: ${exportW}px;
          position: relative;
          background: transparent;
          overflow: visible;
          --quilt-quote-copy-size: ${patchBodyPx}px;
          --quilt-reflection-theme-size: ${patchBodyPx - 2}px;
          --reflection-clipping-card-max: ${patchW}px;
          --reflection-patch-w: ${patchW}px;
          --reflection-patch-overlap: ${overlapPx}px;
        }
        ${ROOT} .quilt-reflection-carousel-slide--ig-prompt .quilt-reflection-carousel-text {
          text-align: center !important;
        }
        ${ROOT} .quilt-reflection-carousel-slide--ig-prompt .quilt-reflection-carousel-body {
          display: block !important;
          text-align: center !important;
          font-size: ${patchBodyPx}px !important;
          line-height: 1.18 !important;
          width: 100% !important;
          max-width: 100% !important;
          white-space: normal !important;
          overflow-wrap: break-word !important;
        }
        ${ROOT} .quilt-reflection-carousel-slide--ig-export-response .quilt-reflection-carousel-body {
          font-size: ${patchBodyPx}px !important;
          line-height: 1.18 !important;
        }
        ${ROOT} .quilt-reflection-carousel-ig-prompt-kicker {
          display: block;
          font-size: ${kickerPx}px !important;
          line-height: 1.1 !important;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.62;
          margin: 0 0 0.2rem;
          text-align: center;
        }
        ${ROOT} .quilt-reflection-carousel-slide--ig-prompt {
          width: ${promptW}px !important;
          max-width: ${promptW}px !important;
          flex: 0 0 auto !important;
          --reflection-patch-w: ${promptW}px;
          --reflection-patch-h-base: auto;
          min-height: 0 !important;
          height: auto !important;
        }
        ${ROOT} .quilt-reflection-scrap-kicker,
        ${ROOT} .quilt-reflection-response-form,
        ${ROOT} .quilt-reflection-archive-link,
        ${ROOT} .quilt-reflection-scraps-after,
        ${ROOT} .quilt-reflection-carousel-engagement,
        ${ROOT} .quilt-reflection-carousel-heart {
          display: none !important;
        }
        ${ROOT} .quilt-reflection-carousel-viewport {
          overflow: visible !important;
          scroll-snap-type: none !important;
          cursor: default !important;
        }
        ${ROOT} .quilt-reflection-carousel-track {
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          gap: clamp(0.35rem, 1.2vw, 0.55rem) !important;
          transform: none !important;
        }
        ${ROOT} .quilt-reflection-carousel-ig-responses-track {
          display: flex !important;
          flex-direction: row !important;
          align-items: flex-end !important;
          flex-wrap: nowrap !important;
          width: 100% !important;
          position: relative !important;
          overflow: visible !important;
        }
        ${ROOT} .quilt-reflection-carousel-ig-responses-track .quilt-reflection-carousel-slide:not(:first-child) {
          margin-left: calc(-1 * var(--reflection-patch-overlap, ${overlapPx}px)) !important;
        }
        ${ROOT} .quilt-reflection-carousel-track > .quilt-reflection-carousel-slide {
          margin-left: 0 !important;
        }
        ${ROOT} .quilt-reflection-carousel-slide {
          flex: 0 0 auto !important;
          scroll-snap-align: unset !important;
        }
        ${ROOT} .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-text,
        ${ROOT} .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-copy,
        ${ROOT} .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-body {
          width: 100% !important;
          max-width: 100% !important;
          white-space: normal !important;
          overflow-wrap: break-word !important;
          word-break: normal !important;
        }
        ${ROOT} .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-body {
          display: block !important;
        }
        ${ROOT} .quilt-reflection-wall {
          margin-left: 0 !important;
          margin-right: 0 !important;
          width: 100% !important;
        }
        ${ROOT} .quilt-reflection-scrap-widget {
          padding-top: 0.25rem;
        }
        ${ROOT} .is-ig-export-flat-paper::before {
          display: none !important;
        }
        ${ROOT} .is-ig-export-flat-highlight::after {
          display: none !important;
        }
        ${ROOT} .quilt-reflection-carousel-slide--clipping {
          background-color: transparent !important;
        }
        #ig-reflection-piece-capture {
          position: fixed;
          left: -9999px;
          top: 0;
          opacity: 1;
          overflow: visible;
          pointer-events: none;
          z-index: -1;
        }
      `;
      const style = document.createElement('style');
      style.id = 'ig-reflection-capture-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }

    _syncIgReflectionCaptureClone(captureClone, dateKey) {
      const slides = Array.from(captureClone.querySelectorAll('.quilt-reflection-carousel-slide'));
      const responseSlides = this._igReflectionExportResponseSlides(captureClone);
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      this.syncReflectionCarouselEdgeFray(slides);
      this.syncReflectionCarouselJoinTape(responseSlides);
      this.syncReflectionCarouselSplitTape(slides);
      this.syncReflectionCarouselHandCuts(slides, dk);
      this.syncReflectionCarouselCopyAlign(slides);
      this._syncIgReflectionSlideExportCopyWrap(slides);
    }

    _igReflectionPaperTextureUrl() {
      const fromRoot = getComputedStyle(document.documentElement)
        .getPropertyValue('--quilt-paper-card-texture')
        .trim();
      return fromRoot || 'url("assets/quilt-paper-card-texture.png")';
    }

    /** html2canvas ignores ::before paper — paper is rasterized via QuiltNewspaperClipping. */
    _flattenIgReflectionClippingSlide(slide, sourceSlide) {
      if (!slide?.classList?.contains?.('quilt-reflection-carousel-slide--clipping')) return;
      const srcEl = sourceSlide || slide;
      const srcCs = getComputedStyle(srcEl);
      const edgeY = srcCs.getPropertyValue('--reflection-clipping-edge-y').trim() || '0.72rem';
      const sideBleed = srcCs.getPropertyValue('--reflection-patch-side-bleed').trim() || '0.13rem';

      slide.classList.add('is-ig-export-flat-paper');
      slide.style.position = 'relative';
      slide.style.isolation = 'isolate';
      slide.style.backgroundColor = 'transparent';
      slide.style.overflow = 'visible';
      slide.querySelector('.ig-reflection-export-paper')?.remove();

      slide
        .querySelectorAll(
          '.quilt-reflection-carousel-text, .quilt-reflection-carousel-copy, .quilt-reflection-carousel-footer'
        )
        .forEach((el) => {
          el.style.position = 'relative';
          el.style.zIndex = '3';
        });

      if (
        slide.classList.contains('quilt-reflection-carousel-slide--admin-highlight') &&
        !slide.classList.contains('quilt-reflection-carousel-slide--split') &&
        !slide.querySelector('.ig-reflection-export-highlight')
      ) {
        const inset = srcCs.getPropertyValue('--reflection-highlight-border-inset').trim() || '0.55rem';
        const borderArt = srcCs.getPropertyValue('--reflection-highlight-border-art').trim();
        const border = document.createElement('div');
        border.className = 'ig-reflection-export-highlight';
        border.setAttribute('aria-hidden', 'true');
        border.style.cssText = [
          'position:absolute',
          'pointer-events:none',
          'z-index:4',
          `top:calc((-1 * ${edgeY}) + ${inset})`,
          `bottom:calc((-1 * ${edgeY}) + ${inset})`,
          `left:calc((-1 * ${sideBleed}) + ${inset})`,
          `right:calc((-1 * ${sideBleed}) + ${inset})`,
          'opacity:0.9',
          borderArt ? `background-image:${borderArt}` : '',
          'background-size:100% 100%',
          'background-repeat:no-repeat'
        ]
          .filter(Boolean)
          .join(';');
        slide.appendChild(border);
        slide.classList.add('is-ig-export-flat-highlight');
      }
    }

    async _captureIgReflectionExportElement(sourceEl, dateKey) {
      if (!sourceEl) return null;
      const html2canvas = await this._ensureHtml2CanvasForExport();
      if (typeof html2canvas !== 'function') return null;

      if (sourceEl.classList.contains('quilt-reflection-carousel-slide--ig-prompt')) {
        this._syncIgReflectionPromptStripHeight(sourceEl);
      }

      const rect = sourceEl.getBoundingClientRect();
      const w = Math.max(1, Math.ceil(rect.width));
      const h = Math.max(1, Math.ceil(rect.height), Math.ceil(sourceEl.scrollHeight || 0));
      if (w < 2 || h < 2) return null;

      let sandbox = document.getElementById('ig-reflection-piece-capture');
      if (!sandbox) {
        sandbox = document.createElement('div');
        sandbox.id = 'ig-reflection-piece-capture';
        sandbox.setAttribute('aria-hidden', 'true');
        document.body.appendChild(sandbox);
      }
      sandbox.innerHTML = '';

      const wrapper = document.createElement('div');
      wrapper.id = 'ig-reflection-capture-clone';
      wrapper.style.cssText = `position:relative;width:${w}px;min-height:${h}px;overflow:visible;`;

      const mount = document.createElement('div');
      mount.innerHTML = sourceEl.outerHTML;
      const root = mount.firstElementChild;
      if (!root) return null;

      wrapper.appendChild(root);
      sandbox.appendChild(wrapper);
      this._ensureIgReflectionCaptureStyles();

      if (root.classList.contains('quilt-reflection-carousel-slide--clipping')) {
        root.style.width = `${w}px`;
        root.style.minHeight = `${h}px`;
        root.style.margin = '0';
        root.style.boxSizing = 'border-box';
        if (sourceEl.getAttribute('style')) {
          root.setAttribute(
            'style',
            `${sourceEl.getAttribute('style')};${root.getAttribute('style') || ''}`
          );
        }

        this.syncReflectionCarouselHandCuts([root], dateKey);
        this.syncReflectionCarouselCopyAlign([root]);
        this._syncIgReflectionSlideExportCopyWrap([root]);
        this._flattenIgReflectionClippingSlide(root, sourceEl);

        await this._waitForIgReflectionExportImages(root);

        const scale = Math.max(2, window.devicePixelRatio || 2);
        const { tiltDeg, yPx } = this._parseReflectionSlideTransform(sourceEl);
        let captureCanvas = null;
        try {
          const paperCanvas = await this._drawIgReflectionClippingPaperCanvas(w, h, root, dateKey, scale);
          const highlightBorderCanvas = await this._drawIgReflectionHighlightBorderCanvas(
            w,
            h,
            scale,
            sourceEl
          );
          const textCanvas = await html2canvas(root, {
            backgroundColor: null,
            scale,
            useCORS: true,
            logging: false,
            width: w,
            height: h,
            windowWidth: this._igReflectionExportViewportWidth(),
            windowHeight: document.documentElement.clientHeight || 932
          });
          const merged = this._mergeIgReflectionClippingCaptureLayers(
            paperCanvas,
            textCanvas,
            w,
            h,
            scale,
            highlightBorderCanvas
          );
          captureCanvas = this._rotateIgReflectionCaptureCanvas(merged, w, h, scale, tiltDeg, yPx);
        } finally {
          sandbox.innerHTML = '';
        }
        return captureCanvas;
      } else if (root.classList.contains('quilt-reflection-carousel-join-tape')) {
        root.style.position = 'relative';
        root.style.margin = '0';
      }

      await this._waitForIgReflectionExportImages(root);

      const scale = Math.max(2, window.devicePixelRatio || 2);
      try {
        return await html2canvas(root, {
          backgroundColor: null,
          scale,
          useCORS: true,
          logging: false,
          width: w,
          height: h,
          windowWidth: this._igReflectionExportViewportWidth(),
          windowHeight: document.documentElement.clientHeight || 932
        });
      } finally {
        sandbox.innerHTML = '';
      }
    }

    async _compositeIgReflectionWidgetCapture(sourceWidget, dateKey) {
      const widgetRect = sourceWidget.getBoundingClientRect();
      const layers = [];

      const slides = Array.from(sourceWidget.querySelectorAll('.quilt-reflection-carousel-slide'));
      for (let i = 0; i < slides.length; i += 1) {
        const slide = slides[i];
        const rect = slide.getBoundingClientRect();
        const canvas = await this._captureIgReflectionExportElement(slide, dateKey);
        if (!canvas) continue;
        const slideCs = getComputedStyle(slide);
        const z = parseInt(slideCs.getPropertyValue('--reflection-slide-z'), 10) || i + 2;
        layers.push({
          canvas,
          x: rect.left - widgetRect.left,
          y: rect.top - widgetRect.top,
          w: rect.width,
          h: rect.height,
          z
        });
      }

      const tapes = Array.from(
        sourceWidget.querySelectorAll('.quilt-reflection-carousel-join-tape.is-visible')
      );
      for (const tape of tapes) {
        const rect = tape.getBoundingClientRect();
        const canvas = await this._captureIgReflectionExportElement(tape, dateKey);
        if (!canvas) continue;
        layers.push({
          canvas,
          x: rect.left - widgetRect.left,
          y: rect.top - widgetRect.top,
          w: rect.width,
          h: rect.height,
          z: 200
        });
      }

      if (!layers.length) return null;

      let logicalW = 0;
      let logicalH = 0;
      layers.forEach((layer) => {
        logicalW = Math.max(logicalW, layer.x + layer.w);
        logicalH = Math.max(logicalH, layer.y + layer.h);
      });
      logicalW = Math.max(1, Math.ceil(logicalW));
      logicalH = Math.max(1, Math.ceil(logicalH));

      const scale = Math.max(2, window.devicePixelRatio || 2);
      const master = document.createElement('canvas');
      master.width = Math.ceil(logicalW * scale);
      master.height = Math.ceil(logicalH * scale);
      const ctx = master.getContext('2d');
      if (!ctx) return null;

      layers.sort((a, b) => a.z - b.z);
      layers.forEach((layer) => {
        ctx.drawImage(
          layer.canvas,
          layer.x * scale,
          layer.y * scale,
          layer.w * scale,
          layer.h * scale
        );
      });

      return { canvas: master, logicalWidth: logicalW, logicalHeight: logicalH };
    }

    async _ensureHtml2CanvasForExport() {
      if (globalThis.html2canvas) return globalThis.html2canvas;
      await this._loadDeferredScript(
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        'html2canvas',
        20000
      );
      return globalThis.html2canvas;
    }

    _buildIgReflectionSlideExportMarkup(reflectionPrompt, themeEntries, dateKey) {
      const carouselMarkup = this.buildIgReflectionCarouselMarkupForExport(
        themeEntries,
        dateKey,
        reflectionPrompt
      );
      return `
        <div id="screen-quilt-ig-export" class="is-ig-export">
          <div class="quilt-reflection-scrap-widget">
            <section class="quilt-reflection-wall">
              <div class="quilt-reflection-theme-cards-shell">
                <div class="quilt-reflection-wall-notes">${carouselMarkup}</div>
              </div>
            </section>
          </div>
        </div>
      `;
    }

    _syncIgReflectionSlideExportLayout(exportScreen, dateKey, themeEntries) {
      const slides = Array.from(exportScreen.querySelectorAll('.quilt-reflection-carousel-slide'));
      const responseSlides = this._igReflectionExportResponseSlides(exportScreen);
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const exportW = this._igReflectionExportViewportWidth();
      const ideas = (Array.isArray(themeEntries) ? themeEntries : [])
        .map((theme) => this.normalizeReflectionWallTheme(theme))
        .filter((entry) => this.reflectionWallThemeRenderable(entry));
      const layout = this._computeIgReflectionResponsePatchLayout(ideas, exportW, exportScreen);
      const bodyPx =
        responseSlides.length >= 3
          ? Math.max(40, this._igReflectionExportPatchBodyPx() - 7)
          : this._igReflectionExportPatchBodyPx();
      exportScreen.style.setProperty('--quilt-quote-copy-size', `${bodyPx}px`);
      exportScreen.style.setProperty('--quilt-reflection-theme-size', `${bodyPx - 2}px`);
      responseSlides.forEach((slide, index) => {
        const dims = layout[index];
        if (!dims) return;
        slide.style.width = `${dims.widthPx}px`;
        slide.style.maxWidth = `${dims.widthPx}px`;
        slide.style.minHeight = `${dims.heightPx}px`;
        slide.style.height = `${dims.heightPx}px`;
        slide.style.flex = '0 0 auto';
        slide.style.setProperty('--reflection-patch-w', `${dims.widthPx}px`);
        slide.style.setProperty('--reflection-patch-h', `${dims.heightPx}px`);
        slide.style.setProperty('--reflection-patch-h-base', `${dims.heightPx}px`);
      });
      this._fitIgReflectionResponsePatchHeights(responseSlides);
      this.syncReflectionCarouselEdgeFray(slides);
      this.syncReflectionCarouselJoinTape(responseSlides);
      this.syncReflectionCarouselSplitTape(slides);
      this.syncReflectionCarouselHandCuts(slides, dk);
      this.syncReflectionCarouselCopyAlign(slides);
      this._syncIgReflectionSlideExportCopyWrap(slides);
      const promptSlide = exportScreen.querySelector('.quilt-reflection-carousel-slide--ig-prompt');
      if (promptSlide) {
        const promptW = this._igReflectionCapturePromptMaxWidth(exportW);
        promptSlide.style.width = `${promptW}px`;
        promptSlide.style.maxWidth = `${promptW}px`;
        promptSlide.style.setProperty('--reflection-patch-w', `${promptW}px`);
      }
      this._syncIgReflectionPromptStripHeight(exportScreen);
    }

    async _waitForIgReflectionExportImages(root) {
      const images = Array.from(root.querySelectorAll('img'));
      const preloadUrls = ['assets/before-you-go-tape-alpha.png'];
      await Promise.all([
        ...images.map(
          (img) =>
            new Promise((resolve) => {
              if (img.complete && img.naturalWidth > 0) {
                resolve();
                return;
              }
              const done = () => resolve();
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
            })
        ),
        ...preloadUrls.map(
          (src) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = img.onerror = () => resolve();
              try {
                img.src = new URL(src, window.location.href).href;
              } catch (_) {
                resolve();
              }
            })
        )
      ]);
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch (_) {
          /* */
        }
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    /**
     * Rasterize quilt-screen reflection cards (prompt + patches) for IG slide 2.
     * Expects a Playwright PNG capture (see scripts/ig-reflection-playwright-capture.cjs).
     */
    async rasterizeIgReflectionSlideCardsLayer(options = {}) {
      const b64 = String(
        options.cardsPngBase64 || globalThis.__igReflectionPlaywrightCardsPng || ''
      ).trim();
      if (!b64) return null;
      return this._igReflectionCardsLayerFromPngBase64(b64, {
        logicalWidth: options.logicalWidth,
        logicalHeight: options.logicalHeight,
        deviceScaleFactor: options.deviceScaleFactor,
        cardPieceRects: options.cardPieceRects,
        stackLogicalWidth: options.stackLogicalWidth ?? options.logicalWidth,
        stackLogicalHeight: options.stackLogicalHeight ?? options.logicalHeight
      });
    }

    _trimIgReflectionCardsCanvas(sourceCanvas) {
      const ctx = sourceCanvas.getContext('2d');
      if (!ctx) {
        return { canvas: sourceCanvas, trimMinX: 0, trimMinY: 0, sourceWidth: sourceCanvas.width, sourceHeight: sourceCanvas.height };
      }
      const w = sourceCanvas.width;
      const h = sourceCanvas.height;
      if (!w || !h) {
        return { canvas: sourceCanvas, trimMinX: 0, trimMinY: 0, sourceWidth: w, sourceHeight: h };
      }
      const data = ctx.getImageData(0, 0, w, h).data;
      let minX = w;
      let minY = h;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 12) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (maxX < minX || maxY < minY) {
        return { canvas: sourceCanvas, trimMinX: 0, trimMinY: 0, sourceWidth: w, sourceHeight: h };
      }
      const pad = Math.max(2, Math.round(Math.min(w, h) * 0.008));
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(w - 1, maxX + pad);
      maxY = Math.min(h - 1, maxY + pad);
      const tw = maxX - minX + 1;
      const th = maxY - minY + 1;
      const trimmed = document.createElement('canvas');
      trimmed.width = tw;
      trimmed.height = th;
      const tctx = trimmed.getContext('2d');
      if (!tctx) {
        return { canvas: sourceCanvas, trimMinX: 0, trimMinY: 0, sourceWidth: w, sourceHeight: h };
      }
      tctx.drawImage(sourceCanvas, minX, minY, tw, th, 0, 0, tw, th);
      return { canvas: trimmed, trimMinX: minX, trimMinY: minY, sourceWidth: w, sourceHeight: h };
    }

    _collectIgReflectionCapturePieceRects(stackEl) {
      if (!stackEl?.getBoundingClientRect) return [];
      const stackRect = stackEl.getBoundingClientRect();
      const pad = 2;
      const slides = stackEl.querySelectorAll(
        '[data-reflection-ig-prompt-slide], [data-reflection-theme-slide]'
      );
      const out = [];
      slides.forEach((el, index) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        out.push({
          x: Math.max(0, r.left - stackRect.left - pad),
          y: Math.max(0, r.top - stackRect.top - pad),
          width: r.width + pad * 2,
          height: r.height + pad * 2,
          index
        });
      });
      return out;
    }

    _mapIgReflectionCardPieceRectsToTrimmedCanvas(pieceRects, stackW, stackH, imgW, imgH, trimMinX, trimMinY, trimW, trimH) {
      if (!Array.isArray(pieceRects) || !pieceRects.length || !stackW || !stackH || !imgW || !imgH) return [];
      const scaleX = imgW / stackW;
      const scaleY = imgH / stackH;
      return pieceRects
        .map((rect) => {
          const minX = Math.round(rect.x * scaleX) - trimMinX;
          const minY = Math.round(rect.y * scaleY) - trimMinY;
          const width = Math.max(1, Math.round(rect.width * scaleX));
          const height = Math.max(1, Math.round(rect.height * scaleY));
          return { minX, minY, width, height, maxX: minX + width, maxY: minY + height };
        })
        .filter((rect) => rect.width > 4 && rect.height > 4 && rect.minX < trimW && rect.minY < trimH);
    }

    async _igReflectionCardsLayerFromPngBase64(b64, sizeHints = {}) {
      const clean = String(b64 || '')
        .replace(/^data:image\/png;base64,/, '')
        .trim();
      if (!clean || typeof document === 'undefined') return null;
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const w = Math.max(1, img.naturalWidth || img.width);
          const h = Math.max(1, img.naturalHeight || img.height);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const trimInfo = this._trimIgReflectionCardsCanvas(canvas);
          const trimmed = trimInfo.canvas || canvas;
          const tw = trimmed.width || w;
          const th = trimmed.height || h;
          const dpr = Math.max(1, Number(sizeHints.deviceScaleFactor) || window.devicePixelRatio || 1);
          const hintW = Number(sizeHints.logicalWidth);
          const hintH = Number(sizeHints.logicalHeight);
          const stackW = Number(sizeHints.stackLogicalWidth) || hintW || tw;
          const stackH = Number(sizeHints.stackLogicalHeight) || hintH || th;
          const logicalFromHint =
            hintW > 0 && hintH > 0 && w > 0 && h > 0
              ? {
                  logicalWidth: Math.max(1, Math.round((hintW * tw) / w)),
                  logicalHeight: Math.max(1, Math.round((hintH * th) / h))
                }
              : null;
          const cardPieceRects = this._mapIgReflectionCardPieceRectsToTrimmedCanvas(
            sizeHints.cardPieceRects,
            stackW,
            stackH,
            trimInfo.sourceWidth || w,
            trimInfo.sourceHeight || h,
            trimInfo.trimMinX || 0,
            trimInfo.trimMinY || 0,
            tw,
            th
          );
          resolve({
            canvas: trimmed,
            logicalWidth:
              logicalFromHint?.logicalWidth || Math.max(1, Math.round(tw / dpr)),
            logicalHeight:
              logicalFromHint?.logicalHeight || Math.max(1, Math.round(th / dpr)),
            cardPieceRects
          });
        };
        img.onerror = () => resolve(null);
        img.src = `data:image/png;base64,${clean}`;
      });
    }

    _igReflectionPlaywrightCaptureViewportWidth() {
      return this._igReflectionExportViewportWidth();
    }

    _igReflectionCapturePatchBodyPxForCount(responseCount) {
      const n = Math.max(1, Math.min(6, Math.floor(Number(responseCount) || 1)));
      if (n >= 6) return Math.max(34, this._igReflectionExportPatchBodyPx() - 14);
      if (n >= 5) return Math.max(38, this._igReflectionExportPatchBodyPx() - 10);
      if (n >= 4) return Math.max(42, this._igReflectionExportPatchBodyPx() - 6);
      return this._igReflectionExportPatchBodyPx();
    }

    _ensureIgReflectionPlaywrightCaptureStyles(responseCount = 3) {
      const exportW = this._igReflectionPlaywrightCaptureViewportWidth();
      const columnW = this._igReflectionExportColumnWidth(exportW);
      const promptW = this._igReflectionCapturePromptMaxWidth(exportW);
      const patchBodyPx = this._igReflectionCapturePatchBodyPxForCount(responseCount);
      const stackGap = this._igReflectionCaptureStackGap(responseCount);
      const promptResponsesGap = this._igReflectionCapturePromptResponsesGap();
      const rowOverlapPx = this._igReflectionCaptureRowOverlapPx();
      const prev = document.getElementById('ig-reflection-playwright-capture-styles');
      if (prev) prev.remove();
      const style = document.createElement('style');
      style.id = 'ig-reflection-playwright-capture-styles';
      style.textContent = `
        html.is-ig-reflection-playwright-capture-active,
        body.is-ig-reflection-playwright-capture-active {
          background: transparent !important;
          background-color: transparent !important;
        }
        body.is-ig-reflection-playwright-capture-active > :not(#ig-reflection-playwright-capture-host) {
          visibility: hidden !important;
        }
        body.is-ig-reflection-playwright-capture-active #ig-reflection-playwright-capture-host,
        body.is-ig-reflection-playwright-capture-active #ig-reflection-playwright-capture-host * {
          visibility: visible !important;
        }
        #ig-reflection-playwright-capture-host {
          position: fixed;
          left: 0;
          top: 0;
          width: ${exportW}px;
          max-width: ${exportW}px;
          height: auto;
          min-height: 1px;
          display: block;
          pointer-events: none;
          z-index: 2147483000;
          overflow: visible;
          background: transparent !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture {
          display: block !important;
          opacity: 1 !important;
          pointer-events: none !important;
          position: relative !important;
          top: auto !important;
          left: auto !important;
          right: auto !important;
          bottom: auto !important;
          width: ${exportW}px;
          max-width: ${exportW}px;
          padding: 0;
          margin: 0;
          background: transparent !important;
          background-color: transparent !important;
          overflow: visible;
          --reflection-panel-top-gutter: 0px;
          --reflection-clipping-font: 'Chivo Mono', ui-monospace, monospace;
          --quilt-clipping-font: 'Chivo Mono', ui-monospace, monospace;
          --quilt-quote-copy-size: ${patchBodyPx}px;
          --quilt-reflection-theme-size: ${patchBodyPx - 2}px;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-stack .quilt-reflection-carousel-text,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-stack .quilt-reflection-carousel-body,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-stack .quilt-reflection-carousel-author,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-stack .quilt-reflection-carousel-copy,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-stack .quilt-reflection-carousel-card-footer {
          font-family: 'Chivo Mono', ui-monospace, monospace !important;
          font-weight: 250 !important;
          font-variation-settings: 'wght' 250 !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-scrap-widget,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-wall,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-theme-cards-shell,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-wall-notes,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-stack,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid-row {
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-scrap-kicker,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-response-form,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-archive-link,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-scraps-after,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-scrap-widget > .quilt-reflection-prompt-card,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-engagement,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-heart {
          display: none !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-scrap-widget,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-wall,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-theme-cards-shell,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-wall-notes {
          width: ${columnW}px !important;
          max-width: ${columnW}px !important;
          min-height: 0 !important;
          height: auto !important;
          background: transparent !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-stack {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: flex-start;
          gap: ${stackGap};
          width: ${columnW}px;
          max-width: ${columnW}px;
          position: relative;
          --reflection-join-tape-thickness: clamp(2.2rem, 6.2vw, 4.6rem);
          --reflection-join-tape-opacity: 0.62;
          --quilt-byg-tape: var(--odq-paper-tape, #f2eee6);
          --quilt-byg-tape-strip: url("assets/before-you-go-tape-alpha.png");
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid {
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          flex: 0 0 auto;
          gap: 0;
          position: relative;
          width: ${columnW}px;
          max-width: ${columnW}px;
          --reflection-join-tape-thickness: clamp(2.2rem, 6.2vw, 4.6rem);
          --reflection-join-tape-opacity: 0.62;
          --quilt-byg-tape: var(--odq-paper-tape, #f2eee6);
          --quilt-byg-tape-strip: url("assets/before-you-go-tape-alpha.png");
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid-row + .quilt-reflection-ig-capture-grid-row {
          margin-top: -${rowOverlapPx}px;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid-row {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          width: 100%;
          gap: 0;
          position: relative;
          overflow: visible;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-join-tape.is-visible {
          display: block !important;
          mix-blend-mode: normal !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-join-tape::before {
          mix-blend-mode: normal !important;
          background-color: rgba(242, 238, 230, 0.52);
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-join-tape:not(.quilt-reflection-carousel-join-tape--cross-row) {
          transform: translateX(-50%)
            translate(var(--reflection-join-tape-jitter-x, 0), var(--reflection-join-tape-jitter-y, 0))
            rotate(
              calc(var(--reflection-fabric-tilt, 0deg) + var(--reflection-join-tape-tilt-jitter, 0deg))
            )
            translateY(var(--reflection-fabric-y, 0));
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-join-tape--prompt-edge {
          z-index: 48 !important;
          --reflection-join-tape-opacity: 0.78;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-join-tape--prompt-edge::before {
          background-color: rgba(242, 238, 230, 0.72);
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-join-tape--cross-row {
          width: var(--reflection-join-tape-span, 100%) !important;
          height: calc(var(--reflection-join-tape-thickness) * var(--reflection-join-tape-width-scale, 1)) !important;
          transform: translate(-50%, -50%)
            translate(var(--reflection-join-tape-jitter-x, 0), var(--reflection-join-tape-jitter-y, 0))
            rotate(var(--reflection-join-tape-tilt-jitter, 0deg));
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid-row--single,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid-row--center {
          justify-content: center;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid-row .quilt-reflection-carousel-slide--clipping {
          --reflection-clipping-edge-y: 7px;
          --reflection-clipping-pad-y: calc(8px + var(--reflection-clipping-edge-y));
          --reflection-clipping-pad-x-outer: 21px;
          --reflection-clipping-pad-x-outer-left: 28px;
          --reflection-clipping-pad-x-join: 26px;
          --reflection-clipping-pad-x-join-left: 36px;
          --reflection-patch-side-bleed: 0.08rem;
          padding-block: var(--reflection-clipping-pad-y) !important;
          padding-left: var(--reflection-clipping-pad-x-outer-left) !important;
          padding-right: var(--reflection-clipping-pad-x-outer) !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid-row .quilt-reflection-carousel-slide--clipping:not(:first-child) {
          padding-left: var(--reflection-clipping-pad-x-join-left) !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid-row .quilt-reflection-carousel-slide--clipping:not(:last-child) {
          padding-right: var(--reflection-clipping-pad-x-join) !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid-row:not(:last-child) .quilt-reflection-carousel-slide--clipping {
          padding-bottom: calc(var(--reflection-clipping-pad-y) + 8px) !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid-row:not(:first-child) .quilt-reflection-carousel-slide--clipping {
          padding-top: calc(var(--reflection-clipping-pad-y) + 8px) !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-slide--clipping.quilt-reflection-carousel-slide--admin-highlight {
          --reflection-highlight-border-inset: 12px;
          --reflection-highlight-text-pad: 10px;
          --reflection-highlight-text-pad-left: 16px;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-grid .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-text {
          line-height: 1.32 !important;
          gap: 0.14em !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-slide--clipping.quilt-reflection-carousel-slide--admin-highlight:not(.quilt-reflection-carousel-slide--split) .quilt-reflection-carousel-text {
          width: 100% !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
          padding: var(--reflection-highlight-text-pad) var(--reflection-highlight-text-pad)
            var(--reflection-highlight-text-pad) var(--reflection-highlight-text-pad-left) !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-body,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-slide--clipping .quilt-reflection-carousel-card-footer {
          max-width: 100% !important;
          box-sizing: border-box !important;
          overflow-wrap: break-word !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-slide--ig-prompt {
          width: ${promptW}px !important;
          max-width: ${promptW}px !important;
          flex: 0 0 auto !important;
          --reflection-patch-w: ${promptW}px;
          align-self: center;
          margin-inline: auto;
          margin-left: auto !important;
          margin-right: auto !important;
          margin-bottom: 0 !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-ig-capture-responses-cluster {
          position: relative;
          width: ${columnW}px;
          max-width: ${columnW}px;
          margin-top: ${promptResponsesGap};
          flex: 0 0 auto;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-slide--clipping {
          filter: none !important;
          -webkit-filter: none !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-slide--clipping::before,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-slide--clipping::after {
          filter: none !important;
          box-shadow: none !important;
        }
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-slide--ig-prompt,
        #screen-quilt.is-ig-reflection-playwright-capture .quilt-reflection-carousel-slide--clipping {
          transform: translate(
            var(--reflection-ig-capture-jitter-x, 0),
            var(--reflection-ig-capture-jitter-y, 0)
          );
        }
      `;
      document.head.appendChild(style);
    }

    _igReflectionCaptureCardJitter(dateKey, salt) {
      const QNC = globalThis.QuiltNewspaperClipping;
      let seed = 0;
      if (QNC?.hashDateKeySeed) {
        seed = QNC.hashDateKeySeed(`${dateKey}:ig-capture-jitter:${salt}`);
      } else {
        let h = 0;
        const s = `${dateKey}:ig-capture-jitter:${salt}`;
        for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        seed = h;
      }
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
      };
      return {
        tiltExtra: (rnd() - 0.5) * 2.6,
        x: (rnd() - 0.5) * 12,
        y: (rnd() - 0.5) * 10
      };
    }

    _parseReflectionFabricTiltDeg(slide) {
      const raw =
        slide.style.getPropertyValue('--reflection-fabric-tilt') ||
        (typeof getComputedStyle === 'function'
          ? getComputedStyle(slide).getPropertyValue('--reflection-fabric-tilt')
          : '') ||
        '0deg';
      const n = parseFloat(String(raw).replace('deg', '').trim());
      return Number.isFinite(n) ? n : 0;
    }

    _applyIgReflectionCaptureCardJitter(captureScreen, dateKey) {
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const slides = Array.from(
        captureScreen.querySelectorAll(
          '.quilt-reflection-carousel-slide--clipping, .quilt-reflection-carousel-slide--ig-prompt'
        )
      );
      slides.forEach((slide, index) => {
        const isPrompt = slide.classList.contains('quilt-reflection-carousel-slide--ig-prompt');
        const handCutSeed = slide.getAttribute('data-reflection-hand-cut-seed') || '';
        const salt = isPrompt ? 'prompt' : handCutSeed.split(':').pop() || `r${index}`;
        const { tiltExtra, x, y } = this._igReflectionCaptureCardJitter(dk, salt);
        const baseTilt = this._parseReflectionFabricTiltDeg(slide);
        slide.style.setProperty('--reflection-fabric-tilt', `${(baseTilt + tiltExtra).toFixed(2)}deg`);
        slide.style.setProperty('--reflection-ig-capture-jitter-x', `${x.toFixed(1)}px`);
        slide.style.setProperty('--reflection-ig-capture-jitter-y', `${y.toFixed(1)}px`);
      });
    }

    _syncIgReflectionPlaywrightCaptureLayout(captureScreen, dateKey) {
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      const exportW = this._igReflectionPlaywrightCaptureViewportWidth();
      const columnW = this._igReflectionExportColumnWidth(exportW);
      const promptW = this._igReflectionCapturePromptMaxWidth(exportW);
      const stack = captureScreen.querySelector('.quilt-reflection-ig-capture-stack');
      const host = captureScreen.closest('#ig-reflection-playwright-capture-host');

      this._syncIgReflectionPromptStripHeight(stack || captureScreen);
      const promptSlide = captureScreen.querySelector('.quilt-reflection-carousel-slide--ig-prompt');
      if (promptSlide) {
        promptSlide.style.width = `${promptW}px`;
        promptSlide.style.maxWidth = `${promptW}px`;
        promptSlide.style.setProperty('--reflection-patch-w', `${promptW}px`);
        promptSlide.style.marginLeft = 'auto';
        promptSlide.style.marginRight = 'auto';
      }

      const slides = Array.from(captureScreen.querySelectorAll('.quilt-reflection-carousel-slide'));
      const responseSlides = slides.filter(
        (slide) => !slide.classList.contains('quilt-reflection-carousel-slide--ig-prompt')
      );

      if (stack) {
        stack.style.transform = 'none';
        stack.style.width = `${columnW}px`;
        stack.style.minHeight = '0';
        stack.style.background = 'transparent';
      }
      if (host) {
        host.style.width = `${exportW}px`;
        host.style.height = 'auto';
        host.style.background = 'transparent';
      }
      if (captureScreen) {
        captureScreen.style.background = 'transparent';
      }

      const overlapPx = this._igReflectionExportPatchOverlapPx();
      const gridRows = Array.from(
        captureScreen.querySelectorAll('.quilt-reflection-ig-capture-grid-row')
      );
      const maxRowCount = gridRows.reduce((max, rowEl) => {
        const n = rowEl.querySelectorAll(
          '.quilt-reflection-carousel-slide:not(.quilt-reflection-carousel-slide--ig-prompt)'
        ).length;
        return Math.max(max, n);
      }, 1);

      gridRows.forEach((rowEl, rowIndex) => {
        const rowSlides = Array.from(
          rowEl.querySelectorAll(
            '.quilt-reflection-carousel-slide:not(.quilt-reflection-carousel-slide--ig-prompt)'
          )
        );
        const n = rowSlides.length;
        if (!n) return;

        const rowWidths = this._computeIgReflectionCaptureRowPatchWidths(
          rowSlides,
          columnW,
          overlapPx
        );
        rowEl._igCaptureRowWidths = rowWidths;

        if (n === 1) {
          const soloW = rowWidths[0];
          rowSlides[0].style.width = `${soloW}px`;
          rowSlides[0].style.maxWidth = `${soloW}px`;
          rowSlides[0].style.flex = `0 0 ${soloW}px`;
          rowSlides[0].style.setProperty('--reflection-patch-w', `${soloW}px`);
          rowSlides[0].style.marginLeft = '0';

          const prevRow = rowIndex > 0 ? gridRows[rowIndex - 1] : null;
          const prevWidths = prevRow?._igCaptureRowWidths;
          const prevCount = prevRow
            ? prevRow.querySelectorAll(
                '.quilt-reflection-carousel-slide:not(.quilt-reflection-carousel-slide--ig-prompt)'
              ).length
            : 0;
          if (prevRow && prevCount >= 2 && prevWidths?.length >= 2) {
            const seamX = prevWidths[0] - overlapPx;
            rowEl.style.justifyContent = 'flex-start';
            rowEl.classList.remove('quilt-reflection-ig-capture-grid-row--center');
            rowSlides[0].style.marginLeft = `${Math.max(0, Math.round(seamX - soloW / 2))}px`;
          } else {
            const visibleW = soloW;
            const extra = columnW - visibleW;
            if (extra > 4) {
              rowEl.style.justifyContent = 'flex-start';
              rowEl.classList.remove('quilt-reflection-ig-capture-grid-row--center');
              rowSlides[0].style.marginLeft = `${Math.floor(extra / 2)}px`;
            } else if (n < maxRowCount) {
              rowEl.classList.add('quilt-reflection-ig-capture-grid-row--center');
            }
          }
          return;
        }

        rowSlides.forEach((slide, index) => {
          const w = rowWidths[index];
          slide.style.width = `${w}px`;
          slide.style.maxWidth = `${w}px`;
          slide.style.flex = `0 0 ${w}px`;
          slide.style.setProperty('--reflection-patch-w', `${w}px`);
          slide.style.marginLeft = index > 0 ? `-${overlapPx}px` : '0';
        });

        const visibleW =
          rowWidths.reduce((sum, w) => sum + w, 0) - overlapPx * Math.max(0, n - 1);
        const extra = columnW - visibleW;
        if (extra > 4) {
          rowEl.style.justifyContent = 'flex-start';
          rowSlides[0].style.marginLeft = `${Math.floor(extra / 2)}px`;
          rowEl.classList.remove('quilt-reflection-ig-capture-grid-row--center');
        } else if (n < maxRowCount) {
          rowEl.classList.add('quilt-reflection-ig-capture-grid-row--center');
        } else {
          rowEl.classList.remove('quilt-reflection-ig-capture-grid-row--center');
        }
      });

      this.syncReflectionCarouselEdgeFray(slides);
      const gridEl = captureScreen.querySelector('.quilt-reflection-ig-capture-grid');
      this._syncIgReflectionCaptureResponseCopyWrap(responseSlides);
      this._fitIgReflectionResponsePatchHeights(responseSlides);
      this.syncReflectionCarouselHandCuts(slides, dk);
      this.syncReflectionCarouselCopyAlign(slides);
      this._applyIgReflectionCaptureCardJitter(captureScreen, dk);
      this.syncIgReflectionCaptureClusterJoinTape(gridEl, dk);
      this.syncReflectionCarouselSplitTape(slides);

      if (host && stack) {
        void stack.offsetHeight;
        host.style.height = `${Math.ceil(stack.getBoundingClientRect().height) + 8}px`;
      }
    }

    /**
     * Mount live reflection markup for Playwright screenshot (same CSS/paper/tape as quilt screen).
     * Call teardownIgReflectionSlidePlaywrightCapture after Node-side screenshot.
     */
    async prepareIgReflectionSlidePlaywrightCapture(options = {}) {
      if (typeof document === 'undefined') return null;
      const reflectionPrompt = String(options.reflectionPrompt || '').trim();
      const themeEntries = Array.isArray(options.themeEntries) ? options.themeEntries : [];
      const dateKey = String(options.dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      if (!reflectionPrompt || !themeEntries.length) return null;

      this.teardownIgReflectionSlidePlaywrightCapture?.();

      const ideas = themeEntries
        .map((theme) => this.normalizeReflectionWallTheme(theme))
        .filter((entry) => this.reflectionWallThemeRenderable(entry))
        .slice(0, 6);
      if (!ideas.length) return null;

      this._ensureIgReflectionPlaywrightCaptureStyles(ideas.length);

      const themeRgbs = [];
      let previousRgb = null;
      ideas.forEach((_, index) => {
        const rgb = this.pickReflectionFabricPatchRgb(index, previousRgb);
        themeRgbs.push(rgb);
        previousRgb = rgb;
      });

      let host = document.getElementById('ig-reflection-playwright-capture-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'ig-reflection-playwright-capture-host';
        host.setAttribute('aria-hidden', 'true');
        document.body.appendChild(host);
      }

      const promptSlide = this.buildIgReflectionPromptStripSlide(reflectionPrompt, dateKey);
      const patchSlides = ideas.map((theme, index) =>
        this.buildReflectionThemePatchSlide(index, theme, ideas, themeRgbs[index], {}, null, dateKey)
      );
      const rowSizes = this._igReflectionCaptureGridRowSizes(ideas.length);
      const maxRowCount = rowSizes[0] || 1;
      let patchIndex = 0;
      const gridRowsHtml = rowSizes
        .map((rowCount) => {
          const rowPatches = patchSlides.slice(patchIndex, patchIndex + rowCount);
          patchIndex += rowCount;
          const rowClasses = ['quilt-reflection-ig-capture-grid-row'];
          if (rowCount === 1) rowClasses.push('quilt-reflection-ig-capture-grid-row--single');
          else if (rowCount < maxRowCount) rowClasses.push('quilt-reflection-ig-capture-grid-row--center');
          return `<div class="${rowClasses.join(' ')}">${rowPatches.join('')}</div>`;
        })
        .join('');
      const escapedDateKey = this.escapeQuiltFortuneText(dateKey);

      host.innerHTML = `
        <div id="screen-quilt-ig-playwright" class="screen active is-ig-reflection-playwright-capture">
          <div class="quilt-reflection-scrap-widget" data-ig-reflection-capture-root>
            <section class="quilt-reflection-wall">
              <div class="quilt-reflection-theme-cards-shell">
                <div class="quilt-reflection-wall-notes">
                  <div class="quilt-reflection-ig-capture-stack">
                    ${promptSlide}
                    <div class="quilt-reflection-ig-capture-responses-cluster">
                      <div class="quilt-reflection-ig-capture-grid quilt-reflection-carousel" data-reflection-carousel data-reflection-carousel-track data-reflection-hand-cut-date-key="${escapedDateKey}">
                        ${gridRowsHtml}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      `;

      const liveScreen = document.getElementById('screen-quilt');
      const captureScreen = host.querySelector('#screen-quilt-ig-playwright');
      if (!captureScreen) return null;

      this._igReflectionPlaywrightPrevLiveId = liveScreen?.getAttribute?.('id') || 'screen-quilt';
      if (liveScreen && liveScreen !== captureScreen) {
        liveScreen.id = 'screen-quilt-live-suspended';
      }
      captureScreen.id = 'screen-quilt';

      document.documentElement.classList.add('is-ig-reflection-playwright-capture-active');
      document.body.classList.add('is-ig-reflection-playwright-capture-active');

      const notes = captureScreen.querySelector('.quilt-reflection-wall-notes');
      this._syncIgReflectionPlaywrightCaptureLayout(captureScreen, dateKey);
      await this._waitForIgReflectionExportImages(captureScreen);
      this._syncIgReflectionPlaywrightCaptureLayout(captureScreen, dateKey);

      const stack = captureScreen.querySelector('.quilt-reflection-ig-capture-stack');
      const rect = stack?.getBoundingClientRect?.() || captureScreen.getBoundingClientRect();
      const cardPieceRects = stack ? this._collectIgReflectionCapturePieceRects(stack) : [];
      this._igReflectionPlaywrightCaptureActive = true;

      return {
        selector: '#ig-reflection-playwright-capture-host .quilt-reflection-ig-capture-stack',
        hostSelector: '#ig-reflection-playwright-capture-host',
        logicalWidth: Math.max(1, Math.round(rect.width) || this._igReflectionExportColumnWidth()),
        logicalHeight: Math.max(1, Math.round(rect.height) || 1),
        responseCount: ideas.length,
        cardPieceRects
      };
    }

    teardownIgReflectionSlidePlaywrightCapture() {
      document.documentElement.classList.remove('is-ig-reflection-playwright-capture-active');
      document.body.classList.remove('is-ig-reflection-playwright-capture-active');
      const liveScreen = document.getElementById('screen-quilt-live-suspended');
      if (liveScreen) {
        liveScreen.id = this._igReflectionPlaywrightPrevLiveId || 'screen-quilt';
      }
      document.getElementById('ig-reflection-playwright-capture-host')?.remove();
      document.getElementById('ig-reflection-playwright-capture-styles')?.remove();
      document.getElementById('ig-yesterday-stats-playwright-capture-styles')?.remove();
      this._igReflectionPlaywrightCaptureActive = false;
      this._igReflectionPlaywrightPrevLiveId = null;
    }

    /** @deprecated Use prepareIgReflectionSlidePlaywrightCapture + Playwright screenshot. */
    async _rasterizeIgReflectionSlideCardsLayerHtml2Canvas(options = {}) {
      if (typeof document === 'undefined') return null;
      const reflectionPrompt = String(options.reflectionPrompt || '').trim();
      const themeEntries = Array.isArray(options.themeEntries) ? options.themeEntries : [];
      const dateKey = String(options.dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      if (!reflectionPrompt || !themeEntries.length) return null;

      this._ensureIgReflectionExportStyles();
      let host = document.getElementById('screen-quilt-ig-export-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'screen-quilt-ig-export-host';
        host.setAttribute('aria-hidden', 'true');
        document.body.appendChild(host);
      }
      host.innerHTML = this._buildIgReflectionSlideExportMarkup(
        reflectionPrompt,
        themeEntries,
        dateKey
      );
      const exportScreen = host.querySelector('#screen-quilt-ig-export');
      if (!exportScreen) return null;

      const liveScreen = document.getElementById('screen-quilt');
      const prevLiveId = liveScreen?.getAttribute?.('id');
      if (liveScreen && liveScreen !== exportScreen) {
        liveScreen.setAttribute('id', 'screen-quilt-live-suspended');
      }
      const prevExportId = exportScreen.id;
      exportScreen.id = 'screen-quilt';

      let captureCanvas = null;
      const exportW = this._igReflectionExportViewportWidth();
      let logicalW = exportW;
      let logicalH = 1;
      const captureTarget = exportScreen.querySelector('.quilt-reflection-scrap-widget') || exportScreen;
      try {
        this._syncIgReflectionSlideExportLayout(exportScreen, dateKey, themeEntries);
        await this._waitForIgReflectionExportImages(exportScreen);
        this._syncIgReflectionSlideExportLayout(exportScreen, dateKey, themeEntries);

        const layoutRect = captureTarget.getBoundingClientRect();
        logicalW = Math.max(1, Math.round(layoutRect.width) || captureTarget.offsetWidth || exportW);

        const html2canvas = await this._ensureHtml2CanvasForExport();
        if (typeof html2canvas !== 'function') return null;

        const composited = await this._compositeIgReflectionWidgetCapture(captureTarget, dateKey);
        if (composited?.canvas) {
          captureCanvas = composited.canvas;
          logicalW = composited.logicalWidth;
          logicalH = composited.logicalHeight;
        }
      } finally {
        exportScreen.id = prevExportId;
        if (liveScreen && prevLiveId) liveScreen.setAttribute('id', prevLiveId);
      }
      if (!captureCanvas) return null;

      return {
        canvas: captureCanvas,
        logicalWidth: logicalW,
        logicalHeight: logicalH
      };
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

    _reflectionJoinTapeRng(seedKey = '') {
      const QNC = globalThis.QuiltNewspaperClipping;
      let seed = 0;
      if (QNC?.hashDateKeySeed) {
        seed = QNC.hashDateKeySeed(String(seedKey || 'reflection-join-tape').trim() || 'reflection-join-tape');
      } else {
        for (const ch of String(seedKey || 'nodate')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      }
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };
    }

    /** Hand-cut vertical tape scrap — convex trapezoid only (angled top/bottom ends). */
    _buildReflectionJoinTapeScrapClipPath(seedKey = '') {
      const rnd = this._reflectionJoinTapeRng(seedKey);
      const pct = (value) => `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
      const topLeftX = 4 + rnd() * 10;
      const topRightX = 86 + rnd() * 10;
      const topLeftY = rnd() * 10;
      const topRightY = rnd() * 10;
      const botLeftX = 3 + rnd() * 12;
      const botRightX = 85 + rnd() * 12;
      const botLeftY = 90 + rnd() * 9;
      const botRightY = 90 + rnd() * 9;
      // Optional peak/dip confined to top or bottom edge — never side nicks (those read as mid-strip slices).
      if (rnd() > 0.38) {
        const peakX = 34 + rnd() * 32;
        if (rnd() > 0.5) {
          const peakY = rnd() * 5;
          return `polygon(${pct(topLeftX)} ${pct(topLeftY)}, ${pct(peakX)} ${pct(peakY)}, ${pct(topRightX)} ${pct(topRightY)}, ${pct(botRightX)} ${pct(botRightY)}, ${pct(botLeftX)} ${pct(botLeftY)})`;
        }
        const valleyY = 95 + rnd() * 4;
        return `polygon(${pct(topLeftX)} ${pct(topLeftY)}, ${pct(topRightX)} ${pct(topRightY)}, ${pct(botRightX)} ${pct(botRightY)}, ${pct(peakX)} ${pct(valleyY)}, ${pct(botLeftX)} ${pct(botLeftY)})`;
      }
      return `polygon(${pct(topLeftX)} ${pct(topLeftY)}, ${pct(topRightX)} ${pct(topRightY)}, ${pct(botRightX)} ${pct(botRightY)}, ${pct(botLeftX)} ${pct(botLeftY)})`;
    }

    /** Hand-cut horizontal tape scrap — convex trapezoid with angled left/right ends. */
    _buildReflectionJoinTapeHorizontalScrapClipPath(seedKey = '') {
      const rnd = this._reflectionJoinTapeRng(seedKey);
      const pct = (value) => `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
      const leftTopX = rnd() * 10;
      const leftBotX = rnd() * 10;
      const leftTopY = 4 + rnd() * 10;
      const leftBotY = 86 + rnd() * 10;
      const rightTopX = 90 + rnd() * 9;
      const rightBotX = 90 + rnd() * 9;
      const rightTopY = 3 + rnd() * 12;
      const rightBotY = 85 + rnd() * 12;
      // Peaks/dips on top or bottom long edge only — never left/right ends (those read as mid-strip slices).
      if (rnd() > 0.38) {
        const peakX = 34 + rnd() * 32;
        if (rnd() > 0.5) {
          const peakY = rnd() * 5;
          return `polygon(${pct(leftTopX)} ${pct(leftTopY)}, ${pct(peakX)} ${pct(peakY)}, ${pct(rightTopX)} ${pct(rightTopY)}, ${pct(rightBotX)} ${pct(rightBotY)}, ${pct(leftBotX)} ${pct(leftBotY)})`;
        }
        const valleyY = 95 + rnd() * 4;
        return `polygon(${pct(leftTopX)} ${pct(leftTopY)}, ${pct(rightTopX)} ${pct(rightTopY)}, ${pct(rightBotX)} ${pct(rightBotY)}, ${pct(peakX)} ${pct(valleyY)}, ${pct(leftBotX)} ${pct(leftBotY)})`;
      }
      return `polygon(${pct(leftTopX)} ${pct(leftTopY)}, ${pct(rightTopX)} ${pct(rightTopY)}, ${pct(rightBotX)} ${pct(rightBotY)}, ${pct(leftBotX)} ${pct(leftBotY)})`;
    }

    _reflectionJoinTapeVariant(seedKey = '', overlapSpanPx = 0, options = {}) {
      const rnd = this._reflectionJoinTapeRng(`${seedKey}:variant`);
      const overlap = Math.max(1, Number(overlapSpanPx) || 1);
      const widthScale = 0.68 + rnd() * 0.76;
      const spanScale = 0.46 + rnd() * 0.48;
      const spanPx = Math.max(28, Math.round(overlap * spanScale));
      const slack = Math.max(0, overlap - spanPx);
      const verticalShift = slack > 0 ? (rnd() - 0.5) * slack * 0.92 : 0;
      const horizontal = options?.orientation === 'horizontal';
      return {
        widthScale: widthScale.toFixed(3),
        spanPx,
        verticalShift,
        offsetXPx: ((rnd() - 0.5) * 7).toFixed(1),
        offsetYPx: ((rnd() - 0.5) * 5).toFixed(1),
        tiltJitterDeg: ((rnd() - 0.5) * 5).toFixed(2),
        opacity: (0.58 + rnd() * 0.14).toFixed(3),
        textureY: `${Math.round(rnd() * 100)}%`,
        clipPath: horizontal
          ? this._buildReflectionJoinTapeHorizontalScrapClipPath(`${seedKey}:clip`)
          : this._buildReflectionJoinTapeScrapClipPath(`${seedKey}:clip`)
      };
    }

    _readReflectionCssLengthPx(el, varNames = []) {
      const list = Array.isArray(varNames) ? varNames : [varNames];
      const host = el?.nodeType === 1 ? el : null;
      if (!host) return 0;
      const style = getComputedStyle(host);
      for (const name of list) {
        const raw = String(style.getPropertyValue(name) || '').trim();
        if (!raw) continue;
        const probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        probe.style.height = raw;
        host.appendChild(probe);
        const px = probe.getBoundingClientRect().height;
        probe.remove();
        if (px > 0) return px;
      }
      return 0;
    }

    _readReflectionPatchPaperEdgeY(slide) {
      return this._readReflectionCssLengthPx(slide, [
        '--reflection-clipping-edge-y',
        '--reflection-split-card-edge-y'
      ]);
    }

    _readReflectionPatchSideBleedPx(slide) {
      return this._readReflectionCssLengthPx(slide, ['--reflection-patch-side-bleed']);
    }

    _readReflectionJoinTapeThicknessPx(hostEl, widthScale = 1) {
      const host =
        hostEl?.closest?.('.is-ig-reflection-playwright-capture') ||
        hostEl?.closest?.('#screen-quilt') ||
        hostEl;
      if (!host) return 52;
      const probe = document.createElement('span');
      probe.className =
        'quilt-reflection-carousel-join-tape quilt-reflection-carousel-join-tape--cross-row';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.position = 'absolute';
      probe.style.left = '0';
      probe.style.top = '0';
      probe.style.setProperty('--reflection-join-tape-width-scale', String(widthScale || 1));
      probe.style.setProperty('--reflection-join-tape-span', '120px');
      host.appendChild(probe);
      const px = probe.getBoundingClientRect().height;
      probe.remove();
      return px > 0 ? px : 52;
    }

    _applyReflectionJoinTapeJitterStyles(tape, variant) {
      if (!tape || !variant) return;
      tape.style.setProperty('--reflection-join-tape-jitter-x', `${variant.offsetXPx}px`);
      tape.style.setProperty('--reflection-join-tape-jitter-y', `${variant.offsetYPx}px`);
      tape.style.setProperty('--reflection-join-tape-tilt-jitter', `${variant.tiltJitterDeg}deg`);
    }

    _readReflectionSlideZ(slide) {
      if (!slide) return 0;
      const raw = getComputedStyle(slide).getPropertyValue('--reflection-slide-z').trim() || '';
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : 0;
    }

    /** Horizontal tape vertical center — anchored to the upper-z card’s junction edge. */
    _reflectionJoinTapeSeamYForPair(patchA, patchB) {
      if (!patchA || !patchB) return 0;
      const zA = this._readReflectionSlideZ(patchA);
      const zB = this._readReflectionSlideZ(patchB);
      const upperPatch = zA >= zB ? patchA : patchB;
      const lowerPatch = zA >= zB ? patchB : patchA;
      const upperR = upperPatch.getBoundingClientRect();
      const lowerR = lowerPatch.getBoundingClientRect();
      const upperEdgeY = this._readReflectionPatchPaperEdgeY(upperPatch);
      const lowerEdgeY = this._readReflectionPatchPaperEdgeY(lowerPatch);
      const upperCenterY = upperR.top + upperR.height / 2;
      const lowerCenterY = lowerR.top + lowerR.height / 2;

      if (upperCenterY >= lowerCenterY) {
        return upperR.top - upperEdgeY;
      }
      return lowerR.bottom + lowerEdgeY;
    }

    syncReflectionCarouselSplitTape(slides) {
      const list = Array.isArray(slides) ? slides : [];
      list.forEach((slide) => {
        const stack = slide.querySelector('.quilt-reflection-carousel-split-stack');
        if (!stack) return;
        const topCard = stack.querySelector('.quilt-reflection-carousel-split-card--top');
        const bottomCard = stack.querySelector('.quilt-reflection-carousel-split-card--bottom');
        const tape = stack.querySelector('.quilt-reflection-carousel-split-tape');
        if (!topCard || !bottomCard || !tape) return;

        const stackRect = stack.getBoundingClientRect();
        const topRect = topCard.getBoundingClientRect();
        const bottomRect = bottomCard.getBoundingClientRect();
        if (!stackRect.height || !topRect.height || !bottomRect.height) return;

        const topEdgeY = this._readReflectionCssLengthPx(topCard, [
          '--reflection-split-card-edge-y',
          '--reflection-clipping-edge-y'
        ]);
        const bottomEdgeY = this._readReflectionCssLengthPx(bottomCard, [
          '--reflection-split-card-edge-y',
          '--reflection-clipping-edge-y'
        ]);
        const visualTopPaperBottom = topRect.bottom + topEdgeY;
        const visualBottomPaperTop = bottomRect.top - bottomEdgeY;
        const seamY = (visualTopPaperBottom + visualBottomPaperTop) / 2 - stackRect.top;
        tape.style.setProperty('--reflection-split-tape-top', `${seamY}px`);
      });
    }

    /** IG capture — tape patches into one cluster (horizontal + vertical seams). */
    syncIgReflectionCaptureClusterJoinTape(gridEl, dateKey) {
      if (!gridEl) return;
      const carousel = gridEl.closest?.('[data-reflection-carousel]') || gridEl;
      const dk = String(dateKey || carousel?.dataset?.reflectionHandCutDateKey || Utils.getTodayKey() || 'nodate').trim();
      gridEl.querySelectorAll('.quilt-reflection-carousel-join-tape').forEach((el) => el.remove());
      carousel?.querySelectorAll('.quilt-reflection-carousel-join-tape').forEach((el) => el.remove());

      const patches = Array.from(
        gridEl.querySelectorAll(
          '.quilt-reflection-carousel-slide:not(.quilt-reflection-carousel-slide--ig-prompt)'
        )
      );
      if (patches.length < 2) return;

      void gridEl.offsetHeight;
      const gridRect = gridEl.getBoundingClientRect();
      if (!gridRect.width || !gridRect.height) return;

      const readFabricTiltDeg = (slide) => {
        const raw = getComputedStyle(slide).getPropertyValue('--reflection-fabric-tilt').trim() || '0deg';
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : 0;
      };

      const tapeZ = patches.length + 4;
      gridEl.style.setProperty('--reflection-join-tape-z', String(tapeZ));

      const appendVerticalTape = (prev, next, seedKey) => {
        const prevR = prev.getBoundingClientRect();
        const nextR = next.getBoundingClientRect();
        const overlapTop = Math.max(prevR.top, nextR.top);
        const overlapBottom = Math.min(prevR.bottom, nextR.bottom);
        let spanPx = overlapBottom - overlapTop;
        if (spanPx <= 0) {
          spanPx = Math.min(prevR.height, nextR.height);
        }
        const variant = this._reflectionJoinTapeVariant(seedKey, spanPx);
        const tapeTop =
          (overlapBottom > overlapTop ? overlapTop : Math.min(prevR.top, nextR.top)) +
          (Math.max(spanPx, variant.spanPx) - variant.spanPx) / 2 +
          variant.verticalShift -
          gridRect.top;
        const joinLeft = nextR.left - gridRect.left;
        const avgTilt = (readFabricTiltDeg(prev) + readFabricTiltDeg(next)) / 2;
        const nextStyle = getComputedStyle(next);
        const tape = document.createElement('span');
        tape.className = 'quilt-reflection-carousel-join-tape is-visible';
        tape.setAttribute('aria-hidden', 'true');
        tape.style.setProperty('--reflection-join-tape-left', `${joinLeft}px`);
        tape.style.setProperty('--reflection-join-tape-top', `${tapeTop}px`);
        tape.style.setProperty('--reflection-join-tape-span', `${variant.spanPx}px`);
        tape.style.setProperty('--reflection-join-tape-width-scale', variant.widthScale);
        tape.style.setProperty('--reflection-join-tape-clip', variant.clipPath);
        tape.style.setProperty('--reflection-join-tape-texture-y', variant.textureY);
        tape.style.setProperty('--reflection-join-tape-strip-opacity', variant.opacity);
        this._applyReflectionJoinTapeJitterStyles(tape, variant);
        tape.style.setProperty('--reflection-fabric-tilt', `${avgTilt}deg`);
        tape.style.setProperty(
          '--reflection-fabric-y',
          nextStyle.getPropertyValue('--reflection-fabric-y').trim() || '0rem'
        );
        gridEl.appendChild(tape);
        return variant;
      };

      const rowVerticalTapeVariants = new Map();

      const horizontalTapeVariantFromVertical = (verticalVariant, seedKey) => {
        if (!verticalVariant) return null;
        const jitterVariant = this._reflectionJoinTapeVariant(`${seedKey}:jitter`, verticalVariant.spanPx, {
          orientation: 'horizontal'
        });
        return {
          ...verticalVariant,
          offsetXPx: jitterVariant.offsetXPx,
          offsetYPx: jitterVariant.offsetYPx,
          tiltJitterDeg: jitterVariant.tiltJitterDeg,
          clipPath: this._buildReflectionJoinTapeHorizontalScrapClipPath(`${seedKey}:clip`)
        };
      };

      const appendHorizontalTape = (topPatch, bottomPatch, tapeVariant, joinLeftOverride = null) => {
        const topR = topPatch.getBoundingClientRect();
        const bottomR = bottomPatch.getBoundingClientRect();
        const overlapLeft = Math.max(topR.left, bottomR.left);
        const overlapRight = Math.min(topR.right, bottomR.right);
        const overlapW = overlapRight - overlapLeft;
        if (overlapW < 24 || !tapeVariant) return;

        const seamY = this._reflectionJoinTapeSeamYForPair(topPatch, bottomPatch);
        const joinLeft =
          joinLeftOverride != null
            ? joinLeftOverride
            : overlapLeft + overlapW / 2 + tapeVariant.verticalShift - gridRect.left;
        const joinTop = seamY - gridRect.top;
        const tape = document.createElement('span');
        tape.className =
          'quilt-reflection-carousel-join-tape quilt-reflection-carousel-join-tape--cross-row is-visible';
        tape.setAttribute('aria-hidden', 'true');
        tape.style.setProperty('--reflection-join-tape-left', `${joinLeft}px`);
        tape.style.setProperty('--reflection-join-tape-top', `${joinTop}px`);
        tape.style.setProperty('--reflection-join-tape-span', `${tapeVariant.spanPx}px`);
        tape.style.setProperty('--reflection-join-tape-width-scale', tapeVariant.widthScale);
        tape.style.setProperty('--reflection-join-tape-clip', tapeVariant.clipPath);
        tape.style.setProperty('--reflection-join-tape-texture-y', tapeVariant.textureY);
        tape.style.setProperty('--reflection-join-tape-strip-opacity', tapeVariant.opacity);
        this._applyReflectionJoinTapeJitterStyles(tape, tapeVariant);
        gridEl.appendChild(tape);
      };

      const appendHorizontalTapeAtTopSeam = (topPatches, bottomPatch, tapeVariant, dateKey) => {
        const above = Array.isArray(topPatches) ? topPatches.filter(Boolean) : [];
        if (!above.length || !bottomPatch || !tapeVariant) return;

        const anchorTop = above[0];
        const topR = anchorTop.getBoundingClientRect();
        const bottomR = bottomPatch.getBoundingClientRect();
        const overlapLeft = Math.max(topR.left, bottomR.left);
        const overlapRight = Math.min(topR.right, bottomR.right);
        const overlapW = overlapRight - overlapLeft;
        if (overlapW < 24) {
          appendHorizontalTape(anchorTop, bottomPatch, tapeVariant);
          return;
        }

        const dk = String(dateKey || 'nodate').trim() || 'nodate';
        const QNC = globalThis.QuiltNewspaperClipping;
        let seed = 0;
        if (QNC?.hashDateKeySeed) {
          seed = QNC.hashDateKeySeed(`${dk}:ig-capture-join-v-offset`);
        } else {
          for (const ch of dk) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
        }
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const rnd = seed / 0xffffffff;
        const overlapCenter = overlapLeft + overlapW / 2;
        const jitterPx = (rnd - 0.5) * Math.min(36, overlapW * 0.22);
        const joinLeft = overlapCenter + jitterPx + tapeVariant.verticalShift - gridRect.left;

        appendHorizontalTape(anchorTop, bottomPatch, tapeVariant, joinLeft);
      };

      const rows = Array.from(gridEl.querySelectorAll('.quilt-reflection-ig-capture-grid-row'));
      rows.forEach((rowEl, rowIndex) => {
        const rowPatches = Array.from(
          rowEl.querySelectorAll(
            '.quilt-reflection-carousel-slide:not(.quilt-reflection-carousel-slide--ig-prompt)'
          )
        );
        for (let i = 1; i < rowPatches.length; i += 1) {
          const variant = appendVerticalTape(
            rowPatches[i - 1],
            rowPatches[i],
            `${dk}:ig-capture-join-h:${rowIndex}:${i}`
          );
          if (variant) rowVerticalTapeVariants.set(rowIndex, variant);
        }
        if (!rowVerticalTapeVariants.has(rowIndex) && rowPatches.length === 1) {
          const soloR = rowPatches[0].getBoundingClientRect();
          const spanPx = soloR.height > 0 ? soloR.height : 0;
          if (spanPx > 0) {
            rowVerticalTapeVariants.set(
              rowIndex,
              this._reflectionJoinTapeVariant(`${dk}:ig-capture-join-h:${rowIndex}:solo`, spanPx)
            );
          }
        }
      });

      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const above = Array.from(
          rows[rowIndex - 1].querySelectorAll(
            '.quilt-reflection-carousel-slide:not(.quilt-reflection-carousel-slide--ig-prompt)'
          )
        );
        const below = Array.from(
          rows[rowIndex].querySelectorAll(
            '.quilt-reflection-carousel-slide:not(.quilt-reflection-carousel-slide--ig-prompt)'
          )
        );
        const verticalVariant = rowVerticalTapeVariants.get(rowIndex - 1);
        if (below.length === 1 && above.length >= 2) {
          const seedKey = `${dk}:ig-capture-join-v:${rowIndex}:0`;
          appendHorizontalTapeAtTopSeam(
            above,
            below[0],
            horizontalTapeVariantFromVertical(verticalVariant, seedKey),
            dk
          );
        } else {
          below.forEach((bottomPatch, bottomIndex) => {
            const topPatch = above[Math.min(bottomIndex, above.length - 1)];
            if (!topPatch) return;
            const seedKey = `${dk}:ig-capture-join-v:${rowIndex}:${bottomIndex}`;
            appendHorizontalTape(
              topPatch,
              bottomPatch,
              horizontalTapeVariantFromVertical(verticalVariant, seedKey)
            );
          });
        }
      }
    }

    /** IG capture — vertical tape straddling the question card’s left and right edges. */
    syncIgReflectionCapturePromptEdgeTape(stackEl, dateKey) {
      if (!stackEl) return;
      const dk = String(dateKey || Utils.getTodayKey() || 'nodate').trim() || 'nodate';
      stackEl
        .querySelectorAll('.quilt-reflection-carousel-join-tape--prompt-edge')
        .forEach((el) => el.remove());

      const prompt = stackEl.querySelector('.quilt-reflection-carousel-slide--ig-prompt');
      if (!prompt) return;

      void stackEl.offsetHeight;
      const stackRect = stackEl.getBoundingClientRect();
      const promptR = prompt.getBoundingClientRect();
      if (!stackRect.width || !promptR.width || !promptR.height) return;

      const readFabricTiltDeg = (slide) => {
        const raw = getComputedStyle(slide).getPropertyValue('--reflection-fabric-tilt').trim() || '0deg';
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : 0;
      };

      const promptStyle = getComputedStyle(prompt);
      const spanPx = Math.max(32, Math.round(promptR.height * 0.9));
      const tapeZ = 18;

      const appendEdgeTape = (edge, seedKey) => {
        const variant = this._reflectionJoinTapeVariant(seedKey, spanPx);
        const tapeTop =
          promptR.top +
          (promptR.height - variant.spanPx) / 2 +
          variant.verticalShift -
          stackRect.top;
        const joinLeft =
          (edge === 'left' ? promptR.left : promptR.right) - stackRect.left;
        const tape = document.createElement('span');
        tape.className =
          'quilt-reflection-carousel-join-tape quilt-reflection-carousel-join-tape--prompt-edge is-visible';
        tape.setAttribute('aria-hidden', 'true');
        tape.style.setProperty('--reflection-join-tape-left', `${joinLeft}px`);
        tape.style.setProperty('--reflection-join-tape-top', `${tapeTop}px`);
        tape.style.setProperty('--reflection-join-tape-span', `${variant.spanPx}px`);
        tape.style.setProperty('--reflection-join-tape-width-scale', variant.widthScale);
        // Full-width strip — scrap clip narrows short ends and can erase the half over open bg.
        tape.style.setProperty('--reflection-join-tape-clip', 'none');
        tape.style.setProperty('--reflection-join-tape-texture-y', variant.textureY);
        const stripOpacity = Math.min(0.9, parseFloat(variant.opacity) + 0.2).toFixed(3);
        tape.style.setProperty('--reflection-join-tape-strip-opacity', stripOpacity);
        tape.style.setProperty('--reflection-join-tape-z', String(tapeZ));
        this._applyReflectionJoinTapeJitterStyles(tape, variant);
        tape.style.setProperty('--reflection-fabric-tilt', `${readFabricTiltDeg(prompt)}deg`);
        tape.style.setProperty(
          '--reflection-fabric-y',
          promptStyle.getPropertyValue('--reflection-fabric-y').trim() || '0rem'
        );
        stackEl.appendChild(tape);
      };

      appendEdgeTape('left', `${dk}:ig-capture-prompt-tape:left`);
      appendEdgeTape('right', `${dk}:ig-capture-prompt-tape:right`);
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

      // Slides use --reflection-slide-z: index + 1; tape must sit above every patch.
      const tapeZ = list.length + 2;
      track.style.setProperty('--reflection-join-tape-z', String(tapeZ));

      const readFabricTiltDeg = (slide) => {
        const raw = getComputedStyle(slide).getPropertyValue('--reflection-fabric-tilt').trim() || '0deg';
        const n = parseFloat(raw);
        return Number.isFinite(n) ? n : 0;
      };
      const dateKey = String(
        carousel?.dataset?.reflectionHandCutDateKey || Utils.getTodayKey() || 'nodate'
      ).trim();

      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const next = list[i];
        const prevH = prev.offsetHeight;
        const nextH = next.offsetHeight;
        if (!prevH || !nextH) continue;

        let overlapTop = Math.max(prev.offsetTop, next.offsetTop);
        let overlapBottom = Math.min(
          prev.offsetTop + prev.offsetHeight,
          next.offsetTop + next.offsetHeight
        );
        if (overlapBottom <= overlapTop) {
          const shorterH = Math.min(prevH, nextH);
          const tallerTop = prevH >= nextH ? prev.offsetTop : next.offsetTop;
          const tallerH = Math.max(prevH, nextH);
          overlapTop = tallerTop + (tallerH - shorterH) / 2;
          overlapBottom = overlapTop + shorterH;
        }

        const overlapSpan = overlapBottom - overlapTop;
        const variant = this._reflectionJoinTapeVariant(`${dateKey}:reflection-join:${i}`, overlapSpan);
        const tapeTop = overlapTop + (overlapSpan - variant.spanPx) / 2 + variant.verticalShift;
        const joinLeft = next.offsetLeft;
        const avgTilt = (readFabricTiltDeg(prev) + readFabricTiltDeg(next)) / 2;
        const nextStyle = getComputedStyle(next);
        const tape = document.createElement('span');
        tape.className = 'quilt-reflection-carousel-join-tape is-visible';
        tape.setAttribute('aria-hidden', 'true');
        tape.style.setProperty('--reflection-join-tape-left', `${joinLeft}px`);
        tape.style.setProperty('--reflection-join-tape-top', `${tapeTop}px`);
        tape.style.setProperty('--reflection-join-tape-span', `${variant.spanPx}px`);
        tape.style.setProperty('--reflection-join-tape-width-scale', variant.widthScale);
        tape.style.setProperty('--reflection-join-tape-clip', variant.clipPath);
        tape.style.setProperty('--reflection-join-tape-texture-y', variant.textureY);
        tape.style.setProperty('--reflection-join-tape-strip-opacity', variant.opacity);
        this._applyReflectionJoinTapeJitterStyles(tape, variant);
        tape.style.setProperty('--reflection-join-tape-z', String(tapeZ));
        tape.style.setProperty('--reflection-fabric-tilt', `${avgTilt}deg`);
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
        '.quilt-screen-icon-btn, .quilt-about-icon-link, .quilt-instagram-icon-link, .quilt-remember-icon-btn, .quilt-settings-icon-btn, .quilt-studio-floor-icon-btn'
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

    /** True when scroll position is at/near the icon-bar dock (scroll-end settle zone). */
    _isQuiltFooterDockZone(scroller = null, thresholdPx = 96) {
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen?.classList.contains('active')) return false;
      const el =
        scroller ||
        (typeof this.getQuiltScrollContainer === 'function' ? this.getQuiltScrollContainer() : null) ||
        this._footerIconPaperScrollers()[0];
      if (!el) return false;
      const stopTop = this.getQuiltFooterScrollStopTop(el);
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const delta = (el.scrollTop || 0) - stopTop;
      return (
        Math.abs(delta) <= thresholdPx ||
        maxScroll - (el.scrollTop || 0) <= Math.max(48, thresholdPx * 0.5)
      );
    }

    /** Snap to the dock when the user lands near it (undershoot or overshoot). */
    snapQuiltScrollToFooterStop(scroller = null, thresholdPx = 80) {
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen?.classList.contains('active')) return false;

      const scrollers = (
        scroller
          ? [scroller]
          : this._footerIconPaperScrollers()
      ).filter(Boolean);

      let snapped = false;
      const seen = new Set();
      scrollers.forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const stopTop = this.getQuiltFooterScrollStopTop(el);
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        const delta = (el.scrollTop || 0) - stopTop;
        if (Math.abs(delta) <= 0.5) return;
        const nearStop = Math.abs(delta) <= thresholdPx;
        const atNativeEnd = maxScroll - (el.scrollTop || 0) <= 48;
        if (nearStop || (atNativeEnd && delta > 0.5)) {
          el.scrollTop = stopTop;
          snapped = true;
        }
      });
      return snapped;
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
      if (control?.classList?.contains('quilt-screen-icon-btn')) return 'quilt';
      if (control?.classList?.contains('quilt-about-icon-link')) return 'about';
      if (control?.classList?.contains('quilt-instagram-icon-link')) return 'instagram';
      if (control?.classList?.contains('quilt-remember-icon-btn')) return 'remember';
      if (control?.classList?.contains('quilt-settings-icon-btn')) return 'settings';
      if (control?.classList?.contains('quilt-studio-floor-icon-btn')) return 'studio';
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
        quilt: 0.88,
        about: 0.87,
        instagram: 0.89,
        remember: 0.86,
        settings: 0.88,
        studio: 0.87
      };
      return map[role] || 0.87;
    }

    _footerIconPaperSizeScale(role) {
      const map = {
        quilt: { widthScale: 1.0, topPadScale: 1.0, bottomExtra: 4 },
        about: { widthScale: 0.97, topPadScale: 1.06, bottomExtra: 2 },
        instagram: { widthScale: 1.05, topPadScale: 0.94, bottomExtra: 5 },
        remember: { widthScale: 1.0, topPadScale: 1.1, bottomExtra: 3 },
        settings: { widthScale: 1.03, topPadScale: 1.0, bottomExtra: 7 },
        studio: { widthScale: 1.02, topPadScale: 1.02, bottomExtra: 5 }
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

    _footerIconPaperHasSizedLayout(paper) {
      const layout = this._readFooterIconPaperLayout(paper);
      return !!(layout && layout.height >= 28);
    }

    _footerIconPaperNeedsDockProjection() {
      return [...this._footerIconPaperElements()].some((paper) => {
        const control = this._footerIconPaperControlForPaper(paper);
        if (!control || control.hidden || control.getAttribute('aria-hidden') === 'true') return false;
        return !this._footerIconPaperHasSizedLayout(paper);
      });
    }

    _footerIconDockScrollDelta() {
      const scroller = this._footerIconPaperScrollers()[0];
      if (!scroller) return 0;
      const stopTop = this.getQuiltFooterScrollStopTop(scroller);
      return Math.max(0, stopTop - (scroller.scrollTop || 0));
    }

    _quiltScrollPaperImageSelector() {
      return [
        '#screen-quilt .quilt-reflection-question-paper__sheet img',
        '#screen-quilt .quilt-user-shape-card__tag-paper',
        '#screen-quilt .quilt-mood-duo__quote-img',
        '#screen-quilt .quilt-mood-spread__quote-img',
        '#screen-quilt .quilt-mood-collage img',
        '#screen-quilt .quilt-mood-triptych img',
        '#screen-quilt .quote-speaker-image',
        '#screen-quilt .seamside-podcast-widget__cover',
        '#screen-quilt .quilt-contributor-frame__art img',
        '#screen-quilt .quilt-layout-b-preview-img',
        '#screen-quilt .quilt-quote-clipping__image'
      ].join(', ');
    }

    _collectQuiltScrollPaperImages() {
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen) return [];
      return Array.from(quiltScreen.querySelectorAll(this._quiltScrollPaperImageSelector())).filter(
        (el) => el instanceof HTMLImageElement && String(el.currentSrc || el.src || '').trim()
      );
    }

    _staticQuiltPaperAssetUrls() {
      const moodBuild =
        String(globalThis.QuiltMoodCollageWidget?.COLLAGE_BUILD || 'v148').trim() || 'v148';
      return [
        'assets/contributor-cloud-frame.webp?v=2',
        'assets/reflection-prompt-card.webp?v=5',
        'assets/color-card-boutique-tag.webp?v=1',
        'assets/before-you-go-tape-alpha.png',
        'assets/quilt-paper-card-texture.png',
        `assets/mood-collage/mood-card.webp?${moodBuild}`,
        `assets/mood-collage/tape-good-marks.webp?${moodBuild}`,
        `assets/mood-collage/tape-rough-marks.webp?${moodBuild}`,
        `assets/mood-collage/tape-cosmos.webp?${moodBuild}`
      ];
    }

    /**
     * Start mood collage + quote clipping during portal dwell so scroll does not outrun compose.
     * Safe with a cached quote before full live sync finishes.
     */
    _primeQuiltMoodAndClippingEarly(quote = null, dateKey = '') {
      if (this._seamsidePreviewActive && this._seamsidePreviewQuote) return;
      const q =
        quote ||
        this.getEffectiveQuiltQuote?.() ||
        this.quoteService?.getTodayQuote?.() ||
        null;
      if (!q) return;
      try {
        globalThis.QuiltMoodCollageWidget?.preloadAssets?.();
      } catch (_) {
        /* */
      }
      this.refreshQuiltMoodWidget?.(q);
      const dk =
        String(dateKey || '').trim() ||
        (typeof this.getEffectiveAppDateKey === 'function'
          ? String(this.getEffectiveAppDateKey() || '').trim()
          : '') ||
        (typeof Utils !== 'undefined' && typeof Utils.getTodayKey === 'function'
          ? Utils.getTodayKey()
          : '');
      if (!dk || typeof this.applyQuoteScreenClipping !== 'function') return;
      if (this._quoteScreenClippingMountedKey === dk) return;
      void this.applyQuoteScreenClipping({ dateKey: dk, quote: q }).catch(() => {});
    }

    async _pinQuiltScrollPaperImage(img) {
      if (!(img instanceof HTMLImageElement)) return;
      const src = String(img.currentSrc || img.src || '').trim();
      if (!src) return;
      if (img.naturalWidth < 1) {
        try {
          if (typeof img.decode === 'function') await img.decode();
        } catch (_) {
          /* */
        }
      }
      if (img.naturalWidth < 1) {
        await new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          // Nudge load even when the host stage is still [hidden].
          if (!img.complete) {
            const bump = img.getAttribute('src') || img.src;
            if (bump) img.src = bump;
          } else {
            resolve();
          }
        });
      }
      if (img.naturalWidth < 1) return;
      try {
        if (typeof img.decode === 'function') await img.decode();
      } catch (_) {
        /* decode can reject for broken sources */
      }
      // createImageBitmap is expensive on WKWebView and hitchy if it runs during scroll.
      if (this._isCapacitorNativeClient()) return;
      if (typeof createImageBitmap !== 'function') return;
      if (!this._quiltPinnedScrollBitmaps) this._quiltPinnedScrollBitmaps = new Map();
      try {
        const bmp = await createImageBitmap(img);
        const prev = this._quiltPinnedScrollBitmaps.get(src);
        if (prev && prev !== bmp && typeof prev.close === 'function') {
          try {
            prev.close();
          } catch (_) {
            /* */
          }
        }
        this._quiltPinnedScrollBitmaps.set(src, bmp);
      } catch (_) {
        /* CORS / tainted canvases — decode() above is still useful */
      }
    }

    /** Force-decode static paper/tape assets used by leaderboard + hidden stages. */
    _prewarmStaticQuiltPaperAssets() {
      this._staticQuiltPaperAssetUrls().forEach((url) => {
        const probe = new Image();
        probe.decoding = 'async';
        probe.onload = () => {
          void this._pinQuiltScrollPaperImage(probe);
        };
        probe.src = url;
      });
    }

    /**
     * Keep quilt paper images warm so scroll-back does not flash blank while WKWebView
     * re-decodes purged bitmaps. Pins ImageBitmaps and re-decodes before re-entry.
     */
    prewarmQuiltScrollPaperImages() {
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen) return false;
      this._ensureQuiltScrollPaperKeepWarmObserver();
      this._prewarmStaticQuiltPaperAssets();
      const images = this._collectQuiltScrollPaperImages();
      // Native: avoid a decode storm at launch — warm a few now, rest after scroll settles.
      const warmNow = this._isCapacitorNativeClient() ? images.slice(0, 3) : images;
      warmNow.forEach((img) => {
        void this._pinQuiltScrollPaperImage(img);
      });
      return images.length > 0;
    }

    _ensureQuiltScrollPaperKeepWarmObserver() {
      if (this._quiltScrollPaperKeepWarmBound) return;
      this._quiltScrollPaperKeepWarmBound = true;
      const quiltScreen = document.getElementById('screen-quilt');
      if (!quiltScreen) return;

      const warmNearViewport = (img) => {
        if (!(img instanceof HTMLImageElement)) return;
        if (img.naturalWidth < 1) return;
        if (this._parallaxScrollActive) {
          this._runAfterQuiltScrollQuiet(() => this._pinQuiltScrollPaperImage(img), {
            maxWaitMs: 900
          });
          return;
        }
        void this._pinQuiltScrollPaperImage(img);
      };

      if (typeof IntersectionObserver !== 'undefined') {
        const scrollRoot =
          (typeof this.getQuiltScrollContainer === 'function' && this.getQuiltScrollContainer()) ||
          quiltScreen;
        this._quiltScrollPaperKeepWarmObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              warmNearViewport(entry.target);
            });
          },
          {
            root: scrollRoot,
            // Start re-decode before the card is on screen again.
            rootMargin: '80% 0px 80% 0px',
            threshold: 0.01
          }
        );
        this._collectQuiltScrollPaperImages().forEach((img) => {
          this._quiltScrollPaperKeepWarmObserver.observe(img);
        });
      }

      // Mood / speaker / podcast imgs often get src after first paint.
      quiltScreen.addEventListener(
        'load',
        (event) => {
          const img = event.target;
          if (!(img instanceof HTMLImageElement)) return;
          if (!img.matches?.(this._quiltScrollPaperImageSelector())) return;
          void this._pinQuiltScrollPaperImage(img);
          this._quiltScrollPaperKeepWarmObserver?.observe(img);
        },
        true
      );
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
          if (!projectAtDock && !this._footerIconPaperHasSizedLayout(paper)) {
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
          // Footer is off-screen — keep prewarmed strip sizes instead of clearing them.
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
          this.updateFooterIconPaperLayout({ projectAtDock: true });
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
        const needsDockProjection = this._footerIconPaperNeedsDockProjection();
        if (needsDockProjection || !this.prewarmFooterIconChrome()) {
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
      const projectAtDock =
        this._footerIconPaperAtScrollStop() && this._footerIconPaperNeedsDockProjection();
      this.updateFooterIconPaperLayout(projectAtDock ? { projectAtDock: true } : undefined);
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
        this._footerIconPullPastDock = false;
        this._footerIconPullAccum = 0;
        this._footerTouchLastY = null;
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
      // Mid-scroll layout + clamp hitch WKWebView; scrollend/settle refresh chrome instead.
      if (this._parallaxScrollActive && this._isCapacitorNativeClient()) return;
      if (this._footerIconChromeRaf != null) return;
      this._footerIconChromeRaf = requestAnimationFrame(() => {
        this._footerIconChromeRaf = null;
        if (this._footerIconClampLock) return;
        if (this._parallaxScrollActive && this._isCapacitorNativeClient()) return;
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

    settleQuiltFooterScrollDock(scroller = null) {
      if (this._footerIconClampLock) return;
      if (!this._footerIconChromeNearViewport() && !this._isQuiltFooterDockZone(scroller)) return;
      this._footerIconClampLock = true;
      try {
        this.snapQuiltScrollToFooterStop(scroller);
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
        if (this._footerScrollSettleTimer != null) {
          clearTimeout(this._footerScrollSettleTimer);
        }
        this._footerScrollSettleTimer = window.setTimeout(() => {
          this._footerScrollSettleTimer = null;
          this.settleQuiltFooterScrollDock();
        }, 150);
      };
      const onScrollSettle = () => {
        if (!document.getElementById('screen-quilt')?.classList.contains('active')) return;
        this.settleQuiltFooterScrollDock();
      };
      const onTouchSettle = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.settleQuiltFooterScrollDock();
          });
        });
      };
      const scroller =
        typeof this.getQuiltScrollContainer === 'function' ? this.getQuiltScrollContainer() : screen;
      if (scroller) {
        scroller.addEventListener('scroll', onLayoutChange, { passive: true });
        scroller.addEventListener('scrollend', onScrollSettle, { passive: true });
        scroller.addEventListener('touchend', onTouchSettle, { passive: true });
        scroller.addEventListener('touchcancel', onTouchSettle, { passive: true });
      }
      const onViewportChange = () => {
        this.updateFooterIconChrome();
        this.settleQuiltFooterScrollDock();
      };
      window.visualViewport?.addEventListener('resize', onViewportChange, {
        passive: true
      });
      window.visualViewport?.addEventListener('scroll', onViewportChange, {
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
          if (slide.classList.contains('quilt-reflection-carousel-slide--split')) {
            slide.querySelectorAll('[data-reflection-split-card]').forEach((card, cardIndex) => {
              const cardSeed =
                String(card.dataset.reflectionHandCutSeed || '').trim() ||
                `${dk}:reflection-split:${String(slide.dataset.reflectionSlide || index).trim()}:${cardIndex}`;
              const rect = card.getBoundingClientRect();
              const cw = Math.max(1, Math.round(rect.width));
              const ch = Math.max(1, Math.round(rect.height));
              if (cw < 40 || ch < 24) return;
              const clip = QNC?.buildNewsprintPerforatedCssClipPath?.(cw, ch, cardSeed, clippingCfg);
              if (clip) card.style.setProperty('--reflection-fabric-cut', clip);
              else card.style.setProperty('--reflection-fabric-cut', 'none');
            });
            slide.style.setProperty('--reflection-fabric-cut', 'none');
            return;
          }
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

    /** Fire-and-forget once-per-device/day when reflections are actually seen. */
    _reportReflectionReadOnce() {
      const dk = String(
        (typeof Utils !== 'undefined' && Utils.getTodayKey?.()) ||
          this.getDailyVisitDateKey?.() ||
          ''
      ).trim();
      if (!dk) return;
      const storageKey = 'ourDailyQuiltReflectionReadV1';
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (String(parsed?.dateKey || '') === dk && parsed?.reported === true) return;
        }
      } catch (_) {
        /* continue */
      }
      if (this._reflectionReadReportInFlightKey === dk) return;
      const clientId = String(
        this.currentUserId ||
          (typeof Utils !== 'undefined' && Utils.getOrCreateUserId?.()) ||
          (typeof UtilsCore !== 'undefined' && UtilsCore.getOrCreateUserId?.()) ||
          ''
      ).trim();
      if (!clientId) return;
      const baseUrl = String(
        (typeof this._getPublicQuiltNameApiBaseUrl === 'function'
          ? this._getPublicQuiltNameApiBaseUrl()
          : '') ||
          (typeof CONFIG !== 'undefined' && CONFIG.BACKEND?.baseUrl) ||
          ''
      ).replace(/\/$/, '');
      if (!baseUrl) return;

      this._reflectionReadReportInFlightKey = dk;
      void fetch(`${baseUrl}/api/reflection-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appDateKey: dk,
          clientId,
          source: 'reflection_wall'
        }),
        keepalive: true
      })
        .then((res) => {
          if (!res.ok) return;
          try {
            localStorage.setItem(storageKey, JSON.stringify({ dateKey: dk, reported: true }));
          } catch (_) {
            /* ignore */
          }
        })
        .catch(() => {
          /* non-blocking */
        })
        .finally(() => {
          if (this._reflectionReadReportInFlightKey === dk) {
            this._reflectionReadReportInFlightKey = '';
          }
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
        this.syncReflectionCarouselSplitTape(slides);
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
              this.syncReflectionCarouselSplitTape(list);
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
        const targetLeft =
          slide.offsetLeft - Math.max(0, (viewport.clientWidth - slide.offsetWidth) / 2);
        const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        return Math.max(0, Math.min(targetLeft, maxLeft));
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
      const markUserScrolled = () => {
        if (!userScrolledCarousel) {
          userScrolledCarousel = true;
          cancelScrollHint();
          if (typeof window.odqTrack === 'function') {
            window.odqTrack('reflection_carousel_scroll');
          }
        }
      };
      viewport.addEventListener('pointerdown', (event) => {
        if (event.target?.closest?.('.quilt-reflection-carousel-invite-btn, button, a, input, textarea, select, label')) {
          return;
        }
        this.suppressQuiltSpotlightGestures?.(900);
        if (this.isQuiltSpotlightActive?.()) {
          this._finishMyBlockSpotlight?.();
        } else {
          this.cancelQuiltSingleTapSpotlight?.();
        }
        if (event.pointerType !== 'mouse') return;
        markUserScrolled();
        isDragging = true;
        dragStartX = event.clientX;
        dragStartScrollLeft = viewport.scrollLeft;
        viewport.setPointerCapture?.(event.pointerId);
      });
      const quiltScrollEl = document.getElementById('screen-quilt');
      viewport.addEventListener('touchstart', (event) => {
        if (event.touches?.length !== 1) return;
        if (
          event.target?.closest?.(
            '.quilt-reflection-carousel-invite-btn, button, a, input, textarea, select, label'
          )
        ) {
          return;
        }
        this.suppressQuiltSpotlightGestures?.(900);
        if (this.isQuiltSpotlightActive?.()) {
          this._finishMyBlockSpotlight?.();
        } else {
          this.cancelQuiltSingleTapSpotlight?.();
        }
        markUserScrolled();
      }, { passive: true });
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
        viewport.scrollLeft = dragStartScrollLeft - (event.clientX - dragStartX);
      });
      const stopDrag = (event) => {
        if (!isDragging) return;
        isDragging = false;
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
      if ('onscrollend' in viewport) {
        viewport.addEventListener('scrollend', syncCurrentIndex, { passive: true });
      }
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
            this._reportReflectionReadOnce?.();
            this._reflectionCarouselScrollHintObserver?.disconnect();
            this._reflectionCarouselScrollHintObserver = null;
          });
        }, { threshold: [0.35] });
        this._reflectionCarouselScrollHintObserver.observe(viewport);
      } else {
        scheduleScrollHintBounce();
        this._reportReflectionReadOnce?.();
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

    renderReflectionAnonymousWall(themes = null, myReflectionOverride = undefined) {
      Utils.removeLegacyReflectionWallHeadings();
      const wall = document.getElementById('quiltReflectionWall');
      const notes = document.getElementById('quiltReflectionWallNotes');
      if (!wall || !notes) return;
      const themeEntries = (Array.isArray(themes) ? themes : [])
        .map((theme) => this.normalizeReflectionWallTheme(theme))
        .filter((entry) => this.reflectionWallThemeRenderable(entry));
      const dateKey =
        typeof this.getEffectiveAppDateKey === 'function' && this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveAppDateKey()
          : Utils.getTodayKey();
      const myReflection =
        myReflectionOverride !== undefined
          ? myReflectionOverride
          : this._readMyReflectionCache(dateKey);
      const contentKey = this._reflectionWallContentKey(themeEntries, myReflection);
      if (contentKey === this._reflectionWallLastContentKey) return;
      this._reflectionWallLastContentKey = contentKey;
      const wallVisibleBefore = this._quiltLayoutAnchorInViewport(wall);
      const applyWall = () => {
        notes.innerHTML = this.getReflectionCarouselMarkup(themeEntries, myReflection);
        this.initReflectionCarouselLoop(notes);
        wall.hidden = false;
      };
      const paint = () => {
        if (wallVisibleBefore) {
          this._preserveQuiltScrollThroughLayout(applyWall, wall);
        } else {
          applyWall();
        }
      };
      // Native: network paint mid-scroll hitches WKWebView — wait for the gesture to settle.
      if (this._parallaxScrollActive && this._isCapacitorNativeClient?.()) {
        this._runAfterQuiltScrollQuiet(paint);
        return;
      }
      paint();
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
        if (Number(entry.schemaVersion) !== 3) return null;
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
          schemaVersion: 3,
          themes: Array.isArray(payload.themes) ? payload.themes : [],
          first_response: String(payload.first_response || '').trim(),
          user_name: String(payload.user_name || '').trim(),
          firstResponseHeartCount: Math.max(0, Number(payload.firstResponseHeartCount) || 0),
          adminFirstResponseHighlight: payload.adminFirstResponseHighlight === true,
          adminFirstResponseHighlightAtIso: String(payload.adminFirstResponseHighlightAtIso || '').trim(),
          adminHighlightByResponseId: this._normalizeReflectionAdminHighlightMap(payload.adminHighlightByResponseId),
          responseCount: Math.max(0, Number(payload.responseCount) || 0),
          cachedAt: Date.now()
        };
        localStorage.setItem('odqReflectionThemesByDate', JSON.stringify(map));
      } catch (_) {
        /* */
      }
    }

    _reflectionThemesRichnessScore(themes = []) {
      return (Array.isArray(themes) ? themes : []).reduce((sum, entry) => {
        const normalized = this.normalizeReflectionWallTheme(entry);
        if (!normalized) return sum;
        if (normalized.split && Array.isArray(normalized.strips)) return sum + normalized.strips.length;
        if (Array.isArray(normalized.mergedResponseIds) && normalized.mergedResponseIds.length) {
          return sum + normalized.mergedResponseIds.length;
        }
        return sum + 1;
      }, 0);
    }

    _reflectionThemesSourceRank(source = '') {
      if (source === 'backend') return 3;
      if (source === 'sdk') return 2;
      if (source === 'rest') return 1;
      return 0;
    }

    _claimRicherReflectionThemesPayload(winnerState, data, source) {
      const normalized = this._normalizeReflectionThemesPayload(winnerState.key, data);
      if (!normalized) return winnerState;
      const score = this._reflectionThemesRichnessScore(normalized.themes);
      const priorScore = winnerState.winner
        ? this._reflectionThemesRichnessScore(winnerState.winner.themes)
        : -1;
      const sourceRank = this._reflectionThemesSourceRank(source);
      const priorSourceRank = this._reflectionThemesSourceRank(winnerState.winnerSource);
      if (
        !winnerState.winner ||
        score > priorScore ||
        (score === priorScore && sourceRank > priorSourceRank)
      ) {
        return { ...winnerState, winner: normalized, winnerSource: source };
      }
      return winnerState;
    }

    _reflectionThemeEntryResponseId(entry) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
      return String(entry.responseId || entry.response_id || '').trim();
    }

    _normalizeReflectionAdminHighlightMap(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const map = {};
      Object.entries(raw).forEach(([responseId, atIso]) => {
        const rid = String(responseId || '').trim();
        const ts = String(atIso || '').trim();
        if (rid && ts) map[rid] = ts;
      });
      return map;
    }

    _collectReflectionAdminHighlightMapFromThemes(themes, seed = {}) {
      const map = this._normalizeReflectionAdminHighlightMap(seed);
      const visit = (entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
        const rid = this._reflectionThemeEntryResponseId(entry);
        if (entry.adminHighlight === true && rid) {
          const atIso = String(entry.adminHighlightAtIso || map[rid] || '').trim();
          if (atIso) map[rid] = atIso;
        }
      };
      (Array.isArray(themes) ? themes : []).forEach((entry) => {
        const normalized = this.normalizeReflectionWallTheme(entry);
        if (!normalized) return;
        if (normalized.split && Array.isArray(normalized.strips)) normalized.strips.forEach(visit);
        else visit(normalized);
      });
      return map;
    }

    _resolveReflectionAdminHighlightMap(data) {
      const payload = data && typeof data === 'object' ? data : {};
      const map = this._collectReflectionAdminHighlightMapFromThemes(
        Array.isArray(payload.themes) ? payload.themes : [],
        this._normalizeReflectionAdminHighlightMap(payload.adminHighlightByResponseId)
      );
      if (payload.adminFirstResponseHighlight === true) {
        const atIso = String(payload.adminFirstResponseHighlightAtIso || map.first || '').trim();
        if (atIso) map.first = atIso;
      }
      return map;
    }

    _themeEntryAdminHighlightAtIso(entry, highlightMap = {}) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
      const ids = [];
      const rid = this._reflectionThemeEntryResponseId(entry);
      if (rid) ids.push(rid);
      if (Array.isArray(entry.mergedResponseIds)) {
        entry.mergedResponseIds.forEach((id) => {
          const nextId = String(id || '').trim();
          if (nextId) ids.push(nextId);
        });
      }
      for (const id of ids) {
        const atIso = String(highlightMap[id] || '').trim();
        if (atIso) return atIso;
      }
      return '';
    }

    _applyAdminHighlightToThemeEntry(entry, highlightMap = {}) {
      const normalized = this.normalizeReflectionWallTheme(entry);
      if (!normalized) return null;
      if (normalized.split && Array.isArray(normalized.strips)) {
        const strips = normalized.strips.map((strip) => this._applyAdminHighlightToThemeEntry(strip, highlightMap));
        return { split: true, strips: strips.filter(Boolean).slice(0, 2) };
      }
      const atIso = this._themeEntryAdminHighlightAtIso(normalized, highlightMap);
      if (!atIso) {
        if (!normalized.adminHighlight) return normalized;
        const nextEntry = { ...normalized };
        delete nextEntry.adminHighlight;
        delete nextEntry.adminHighlightAtIso;
        return nextEntry;
      }
      return { ...normalized, adminHighlight: true, adminHighlightAtIso: atIso };
    }

    _applyAdminHighlightsToThemes(themes, highlightMap = {}) {
      const map = this._normalizeReflectionAdminHighlightMap(highlightMap);
      return (Array.isArray(themes) ? themes : [])
        .map((entry) => this._applyAdminHighlightToThemeEntry(entry, map))
        .filter((entry) => this.reflectionWallThemeRenderable(entry));
    }

    _firstResponseHighlightMetaFromMap(highlightMap = {}) {
      const atIso = String(highlightMap?.first || '').trim();
      return {
        adminFirstResponseHighlight: !!atIso,
        adminFirstResponseHighlightAtIso: atIso
      };
    }

    _normalizeReflectionThemesPayload(key, data) {
      if (!data || typeof data !== 'object') return null;
      const highlightMap = this._resolveReflectionAdminHighlightMap(data);
      const firstHighlightMeta = this._firstResponseHighlightMetaFromMap(highlightMap);
      const themes = this._applyAdminHighlightsToThemes(
        Array.isArray(data.themes) ? data.themes : [],
        highlightMap
      );
      const first_response = this._firstResponseFromPayload(data);
      const user_name = this._userNameFromPayload(data);
      const firstResponseHeartCount = Math.max(0, Number(data.firstResponseHeartCount) || 0);
      if (!themes.length && !first_response && !user_name) return null;
      return {
        key,
        themes,
        first_response,
        user_name,
        firstResponseHeartCount,
        adminFirstResponseHighlight: firstHighlightMeta.adminFirstResponseHighlight,
        adminFirstResponseHighlightAtIso: firstHighlightMeta.adminFirstResponseHighlightAtIso,
        adminHighlightByResponseId: highlightMap,
        responseCount: Math.max(0, Number(data.responseCount) || 0)
      };
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
      const firstHC = Math.max(0, Number(early?.firstResponseHeartCount || cached?.firstResponseHeartCount) || 0);
      const firstHighlightMeta = {
        adminFirstResponseHighlight:
          early?.adminFirstResponseHighlight === true || cached?.adminFirstResponseHighlight === true,
        adminFirstResponseHighlightAtIso:
          String(early?.adminFirstResponseHighlightAtIso || cached?.adminFirstResponseHighlightAtIso || '').trim()
      };
      if (!themes.length && !first) return false;
      const wallThemes = this.buildReflectionWallThemes(
        themes,
        first || null,
        user,
        this._readMyReflectionCache(key),
        firstHC,
        firstHighlightMeta
      );
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
      let winnerState = { key: k, winner: null, winnerSource: '' };
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
            winnerState = this._claimRicherReflectionThemesPayload(winnerState, snap.data(), 'sdk');
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
          winnerState = this._claimRicherReflectionThemesPayload(winnerState, data, 'rest');
        }
      })();
      const backendRead = (async () => {
        const data = await this.fetchReflectionThemesViaBackend(k);
        if (data) {
          winnerState = this._claimRicherReflectionThemesPayload(winnerState, data, 'backend');
        }
      })();
      await Promise.race([
        Promise.allSettled([sdkRead, restRead, backendRead]),
        new Promise((res) => setTimeout(res, 8000))
      ]);
      const winner = winnerState.winner;
      const winnerSource = winnerState.winnerSource;
      if (winner) {
        return { ...winner, source: winnerSource };
      }
      return null;
    }

    async loadReflectionThemesForToday(options = {}) {
      const force = options.force === true;
      const skipCachePaint = options.skipCachePaint === true;
      if (this._reflectionThemesLoadInFlight) {
        if (!force) return this._reflectionThemesLoadInFlight;
        await this._reflectionThemesLoadInFlight.catch(() => {});
      }
      this._reflectionThemesLoadInFlight = (async () => {
      const dateKey =
        typeof this.getEffectiveAppDateKey === 'function' && this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveAppDateKey()
          : Utils.getTodayKey();
      if (!this._reflectionThemesNotFoundKeys) this._reflectionThemesNotFoundKeys = new Set();
      // Phase 1: render from localStorage cache immediately so returning users see the wall
      // without waiting for Firestore (which can take 15s on mobile cold launch).
      const lsCache = this._readLocalReflectionThemesCache(dateKey);
      const lsAssign = this._reflectionAssignmentContextFromLocal(dateKey);
      if (!skipCachePaint && (lsCache || lsAssign.first_response)) {
        const lsThemes = lsCache?.themes || [];
        const lsResponseCount = Math.max(0, Number(lsCache?.responseCount) || 0);
        const lsLooksStale =
          lsResponseCount > 0 &&
          this._reflectionThemesRichnessScore(lsThemes) < Math.max(6, Math.floor(lsResponseCount * 0.45));
        if (!lsLooksStale) {
          const lsFirst = lsAssign.first_response || lsCache?.first_response || '';
          const lsUser = lsAssign.user_name || lsCache?.user_name || '';
          const lsFirstHC = Math.max(0, Number(lsCache?.firstResponseHeartCount) || 0);
          const lsFirstHighlightMeta = {
            adminFirstResponseHighlight: lsCache?.adminFirstResponseHighlight === true,
            adminFirstResponseHighlightAtIso: String(lsCache?.adminFirstResponseHighlightAtIso || '').trim()
          };
          const lsMine = this._readMyReflectionCache(dateKey);
          const lsWallThemes = this.buildReflectionWallThemes(
            lsThemes,
            lsFirst || null,
            lsUser,
            lsMine,
            lsFirstHC,
            lsFirstHighlightMeta
          );
          if (lsWallThemes.length) {
            this.renderReflectionAnonymousWall(lsWallThemes, lsMine);
          } else if (lsMine?.responseId) {
            this.renderReflectionAnonymousWall([], lsMine);
          }
        }
      }
      // Phase 2: fetch from network; re-render only if content differs from what we painted.
      // Don't block on the user's own reflection sync — /api/reflection-response/mine can stall on mobile.
      const myReflectionSync = this.syncMyReflectionForToday(dateKey, { force: true });
      const [todayThemes, assignmentFirst] = await Promise.all([
        this._readReflectionThemesForDate(dateKey),
        this.fetchTodayFirstResponseFields()
      ]);
      const communityThemes = todayThemes?.themes || [];
      const mergedFirst =
        assignmentFirst.first_response ||
        todayThemes?.first_response ||
        lsAssign.first_response ||
        '';
      const mergedUser =
        assignmentFirst.user_name ||
        todayThemes?.user_name ||
        lsAssign.user_name ||
        '';
      const mergedFirstHC = Math.max(0, Number(todayThemes?.firstResponseHeartCount) || 0);
      const mergedFirstHighlightMeta = {
        adminFirstResponseHighlight: todayThemes?.adminFirstResponseHighlight === true,
        adminFirstResponseHighlightAtIso: String(todayThemes?.adminFirstResponseHighlightAtIso || '').trim()
      };
      if (communityThemes.length || mergedFirst) {
        this._writeLocalReflectionThemesCache(dateKey, {
          themes: communityThemes,
          first_response: mergedFirst,
          user_name: mergedUser,
          firstResponseHeartCount: mergedFirstHC,
          adminFirstResponseHighlight: mergedFirstHighlightMeta.adminFirstResponseHighlight,
          adminFirstResponseHighlightAtIso: mergedFirstHighlightMeta.adminFirstResponseHighlightAtIso,
          adminHighlightByResponseId: this._normalizeReflectionAdminHighlightMap(
            todayThemes?.adminHighlightByResponseId
          ),
          responseCount: Math.max(0, Number(todayThemes?.responseCount) || 0)
        });
      }
      const cachedReflection = this._readMyReflectionCache(dateKey);
      const wallThemes = await this.resolveReflectionWallThemes(
        communityThemes,
        {
          first_response: mergedFirst,
          user_name: mergedUser,
          firstResponseHeartCount: mergedFirstHC,
          adminFirstResponseHighlight: mergedFirstHighlightMeta.adminFirstResponseHighlight,
          adminFirstResponseHighlightAtIso: mergedFirstHighlightMeta.adminFirstResponseHighlightAtIso
        },
        cachedReflection
      );
      if (wallThemes.length) {
        this.renderReflectionAnonymousWall(wallThemes, cachedReflection);
      } else if (cachedReflection?.responseId || !this._reflectionWallLastContentKey) {
        this.renderReflectionAnonymousWall([], cachedReflection);
      }
      // After network wall is painted, wait for mine sync and re-render if result differs.
      const myReflection = await myReflectionSync.catch(() => null);
      if (myReflection && myReflection.responseId !== cachedReflection?.responseId) {
        const updatedWallThemes = await this.resolveReflectionWallThemes(
          communityThemes,
          {
            first_response: mergedFirst,
            user_name: mergedUser,
            firstResponseHeartCount: mergedFirstHC,
            adminFirstResponseHighlight: mergedFirstHighlightMeta.adminFirstResponseHighlight,
            adminFirstResponseHighlightAtIso: mergedFirstHighlightMeta.adminFirstResponseHighlightAtIso
          },
          myReflection
        );
        if (updatedWallThemes.length) {
          this.renderReflectionAnonymousWall(updatedWallThemes, myReflection);
        } else {
          this.renderReflectionAnonymousWall([], myReflection);
        }
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

    _patchLocalReflectionThemeHighlight(dateKey, responseId, highlighted, highlightAtIso = '') {
      const key = String(dateKey || '').trim();
      const rid = String(responseId || '').trim();
      if (!key || !rid) return;
      const nowIso = String(highlightAtIso || '').trim();
      const patchEntry = (entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        if (entry.split === true && Array.isArray(entry.strips)) {
          let changed = false;
          const strips = entry.strips.map((strip) => {
            if (String(strip?.responseId || '').trim() !== rid) return strip;
            changed = true;
            if (highlighted) {
              return {
                ...strip,
                adminHighlight: true,
                ...(nowIso ? { adminHighlightAtIso: nowIso } : {})
              };
            }
            const next = { ...strip };
            delete next.adminHighlight;
            delete next.adminHighlightAtIso;
            return next;
          });
          return changed ? { ...entry, strips } : entry;
        }
        if (String(entry.responseId || '').trim() !== rid) return entry;
        if (highlighted) {
          return {
            ...entry,
            adminHighlight: true,
            ...(nowIso ? { adminHighlightAtIso: nowIso } : {})
          };
        }
        const next = { ...entry };
        delete next.adminHighlight;
        delete next.adminHighlightAtIso;
        return next;
      };
      const applyHighlightPayload = (payload) => {
        if (!payload || typeof payload !== 'object') return null;
        const themes = (Array.isArray(payload.themes) ? payload.themes : []).map(patchEntry);
        const highlightMap = this._normalizeReflectionAdminHighlightMap(payload.adminHighlightByResponseId);
        if (highlighted) {
          if (rid === 'first') highlightMap.first = nowIso || new Date().toISOString();
          else if (nowIso) highlightMap[rid] = nowIso;
        } else if (rid === 'first') {
          delete highlightMap.first;
        } else {
          delete highlightMap[rid];
        }
        const next = {
          ...payload,
          themes: this._applyAdminHighlightsToThemes(themes, highlightMap),
          adminHighlightByResponseId: highlightMap
        };
        if (rid === 'first') {
          next.adminFirstResponseHighlight = highlighted === true;
          if (highlighted && (nowIso || highlightMap.first)) {
            next.adminFirstResponseHighlightAtIso = nowIso || highlightMap.first;
          } else {
            delete next.adminFirstResponseHighlightAtIso;
          }
        }
        return next;
      };
      const cache = this._readLocalReflectionThemesCache(key);
      if (cache) {
        const nextCache = applyHighlightPayload(cache);
        if (nextCache) this._writeLocalReflectionThemesCache(key, nextCache);
      }
      // Keep early prefetch in sync so bootstrap paint does not overwrite the optimistic order.
      if (this._reflectionThemesEarlyCache?.key === key && this._reflectionThemesEarlyCache?.data) {
        const nextEarly = applyHighlightPayload(this._reflectionThemesEarlyCache.data);
        if (nextEarly) {
          this._reflectionThemesEarlyCache = {
            ...this._reflectionThemesEarlyCache,
            data: nextEarly,
            at: Date.now()
          };
        }
      }
    }

    async fetchReflectionThemesViaBackend(dateKey) {
      const key = String(dateKey || '').trim();
      const baseUrl = String(
        (typeof root.odqBackendBaseUrl === 'function' ? root.odqBackendBaseUrl() : '') ||
          CONFIG.BACKEND?.baseUrl ||
          ''
      ).replace(/\/$/, '');
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
          firstResponseHeartCount: Math.max(0, Number(data.firstResponseHeartCount) || 0),
          adminFirstResponseHighlight: data.adminFirstResponseHighlight === true,
          adminFirstResponseHighlightAtIso: String(data.adminFirstResponseHighlightAtIso || '').trim(),
          adminHighlightByResponseId: this._normalizeReflectionAdminHighlightMap(data.adminHighlightByResponseId),
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

    decodeReflectionThemeRestMapFields(mapFields) {
      if (!mapFields || typeof mapFields !== 'object') return null;
      const isSplit = mapFields.split?.booleanValue === true;
      const stripValues = mapFields.strips?.arrayValue?.values;
      if (isSplit && Array.isArray(stripValues)) {
        const strips = stripValues
          .map((stripItem) => this.decodeReflectionThemeRestMapFields(stripItem?.mapValue?.fields))
          .filter((strip) => strip?.text);
        if (strips.length >= 2) return { split: true, strips: strips.slice(0, 2) };
        if (strips.length === 1) return strips[0];
        return null;
      }
      const responseId = String(
        mapFields.responseId?.stringValue || mapFields.response_id?.stringValue || ''
      ).trim();
      const heartCount = Math.max(
        0,
        Number(mapFields.heartCount?.integerValue || mapFields.heartCount?.doubleValue) || 0
      );
      const adminHighlight = mapFields.adminHighlight?.booleanValue === true;
      const adminHighlightAtIso = String(mapFields.adminHighlightAtIso?.stringValue || '').trim();
      const text = String(mapFields.text?.stringValue || mapFields.body?.stringValue || '').trim();
      const author = String(
        mapFields.author?.stringValue || mapFields.authorDisplayName?.stringValue || ''
      ).trim();
      if (!text) return null;
      const entry = { text, author };
      if (responseId) entry.responseId = responseId;
      if (heartCount > 0) entry.heartCount = heartCount;
      if (adminHighlight) {
        entry.adminHighlight = true;
        if (adminHighlightAtIso) entry.adminHighlightAtIso = adminHighlightAtIso;
      }
      const mergedValues = mapFields.mergedResponseIds?.arrayValue?.values;
      if (Array.isArray(mergedValues) && mergedValues.length) {
        entry.mergedResponseIds = mergedValues
          .map((item) => String(item?.stringValue || '').trim())
          .filter(Boolean);
      }
      return entry;
    }

    decodeReflectionThemeRestDocument(payload) {
      const fields = payload?.fields || {};
      const themes = fields.themes?.arrayValue?.values || [];
      const adminHighlightByResponseId = {};
      const highlightField = fields.adminHighlightByResponseId?.mapValue?.fields || {};
      Object.entries(highlightField).forEach(([responseId, value]) => {
        const rid = String(responseId || '').trim();
        const atIso = String(value?.stringValue || '').trim();
        if (rid && atIso) adminHighlightByResponseId[rid] = atIso;
      });
      return {
        themes: themes
          .map((item) => {
            const mapFields = item?.mapValue?.fields;
            if (mapFields) return this.decodeReflectionThemeRestMapFields(mapFields);
            const text = String(item?.stringValue || '').trim();
            return text ? { text, author: '' } : null;
          })
          .filter((entry) => this.reflectionWallThemeRenderable(entry)),
        first_response: String(
          fields.first_response?.stringValue || fields.firstResponse?.stringValue || ''
        ).trim(),
        user_name:
          String(fields.user_name?.stringValue || fields.userName?.stringValue || '').trim(),
        firstResponseHeartCount:
          Math.max(0, Number(fields.firstResponseHeartCount?.integerValue || fields.firstResponseHeartCount?.doubleValue) || 0),
        adminFirstResponseHighlight: fields.adminFirstResponseHighlight?.booleanValue === true,
        adminFirstResponseHighlightAtIso: String(
          fields.adminFirstResponseHighlightAtIso?.stringValue || ''
        ).trim(),
        adminHighlightByResponseId,
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

    /** Firestore instagram-images: prefer carousel slide 1, else legacy classicUrl/imageStorageUrl. */
    pickClassicImageUrlFromInstagramDoc(data) {
      if (!data || typeof data !== 'object') return '';
      return String(
        data.carouselSlide1Url ||
          data.carouselSlide1ImageStorageUrl ||
          data.classicUrl ||
          data.imageStorageUrl ||
          ''
      ).trim();
    }

    pickQuiltStoryImageUrlFromInstagramDoc(data) {
      if (!data || typeof data !== 'object') return '';
      return String(
        data.quiltStoryUrl ||
          data.quiltStoryImageStorageUrl ||
          data.storyQuiltUrl ||
          data.storyQuiltImageStorageUrl ||
          data.quiltScreen9x16Url ||
          data.quiltScreen9x16ImageStorageUrl ||
          data.quiltScreenUrl ||
          ''
      ).trim();
    }

    pickNewspaperClippingUrlFromInstagramDoc(data) {
      if (!data || typeof data !== 'object') return '';
      return String(data.newspaperClippingUrl || data.newspaperClippingImageStorageUrl || '').trim();
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
        const quiltStoryUrl = this.pickQuiltStoryImageUrlFromInstagramDoc(igData);
        /**
         * Reflection archive uses the quilt-only 9:16 story image, rotated horizontal by CSS.
         * Layout B/classic is a quote post and should not drive this archive image.
         */
        if (quiltStoryUrl) {
          return {
            quiltImageUrl: quiltStoryUrl,
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

    async resolveNewspaperClippingForReflectionArchive(dateKey) {
      const key = String(dateKey || '').trim();
      if (!key) return '';
      try {
        const igResult = await this.getReflectionArchiveFirestoreDoc('instagram-images', key);
        return this.pickNewspaperClippingUrlFromInstagramDoc(igResult.data || {});
      } catch (error) {
        this.logger?.warn?.(`resolveNewspaperClippingForReflectionArchive(${key}):`, error);
        return '';
      }
    }

    buildReflectionArchiveSectionKickerHtml(label) {
      const text = this.escapeQuiltFortuneText(String(label || '').trim());
      if (!text) return '';
      return `<p class="reflection-themes-archive-kicker">${text}</p>`;
    }

    buildReflectionArchiveQuoteClippingHtml(newspaperClippingUrl, quote = null) {
      const url = String(newspaperClippingUrl || '').trim();
      if (!url) return '';
      const safeUrl = this.escapeQuiltFortuneText(url);
      const quoteText = String(quote?.text || '').trim();
      const quoteAuthor = String(quote?.author || '').trim();
      const altLabel = [quoteText, quoteAuthor ? `— ${quoteAuthor}` : ''].filter(Boolean).join(' ');
      const alt = altLabel ? this.escapeQuiltFortuneText(altLabel) : 'Daily quote clipping';
      return `<div class="reflection-themes-archive-quote-clipping">
        <img class="reflection-themes-archive-quote-clipping__image" src="${safeUrl}" alt="${alt}" loading="lazy" />
      </div>`;
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
        day: 'numeric',
        year: 'numeric'
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
            .filter((entry) => this.reflectionWallThemeRenderable(entry))
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
      const [context, quiltImage, newspaperClippingUrl] = await Promise.all([
        this.loadReflectionArchiveContextForDate(entry.dateKey, entry),
        this.resolveQuiltImageForReflectionArchive(entry.dateKey, entry),
        entry.newspaperClippingUrl
          ? Promise.resolve(String(entry.newspaperClippingUrl).trim())
          : this.resolveNewspaperClippingForReflectionArchive(entry.dateKey)
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
        quiltImageIsClassic: !!quiltImage.quiltImageIsClassic,
        newspaperClippingUrl: String(newspaperClippingUrl || entry.newspaperClippingUrl || '').trim()
      };
    }

    mapReflectionArchiveApiEntries(rows) {
      const entries = (Array.isArray(rows) ? rows : [])
        .map((row) => {
          const dateKey = String(row.dateKey || row.appDateKey || '').trim();
          const communityThemes = this.orderReflectionCommunityThemesNewestFirst(
            (Array.isArray(row.themes) ? row.themes : [])
              .map((theme) => this.normalizeReflectionWallTheme(theme))
              .filter((entry) => this.reflectionWallThemeRenderable(entry))
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
            quiltImageIsClassic,
            newspaperClippingUrl: String(row.newspaperClippingUrl || '').trim()
          };
        })
        .filter(Boolean);
      entries.forEach((entry) => {
        if (entry.quiltImageFallbackBlocks) {
          this._reflectionArchiveQuiltBlocksCache?.set(entry.dateKey, entry.quiltImageFallbackBlocks);
        }
      });
      return entries;
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
        const entries = this.mapReflectionArchiveApiEntries(data.entries);
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

    async fetchReflectionThemeSectionPageViaBackend(theme, cursorDateKey = null) {
      const baseUrl = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (!baseUrl || typeof fetch !== 'function') return null;
      const limit = this._reflectionThemesArchivePageSize || 7;
      const params = new URLSearchParams({ theme: String(theme || '').trim(), limit: String(limit) });
      const cursor = String(cursorDateKey || '').trim();
      if (cursor) params.set('cursorDateKey', cursor);
      try {
        const res = await fetch(`${baseUrl}/api/reflection-themes/archive-by-theme?${params.toString()}`, {
          cache: 'no-store'
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Archive-by-theme API failed (${res.status})`);
        }
        const entries = this.mapReflectionArchiveApiEntries(data.entries);
        return {
          entries,
          cursor: null,
          cursorDateKey: String(data.cursorDateKey || entries[entries.length - 1]?.dateKey || '').trim(),
          hasOlder: data.hasOlder === true
        };
      } catch (error) {
        this.logger?.warn?.(`Reflection theme section "${theme}" page failed:`, error);
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
      if (!details) return;

      details.querySelector('.reflection-themes-archive-quote-strip')?.remove();
      details.querySelector('.reflection-themes-archive-quilt-name')?.remove();
      [...details.querySelectorAll('.reflection-themes-archive-kicker')].forEach((el) => {
        const label = String(el.textContent || '').trim().toLowerCase();
        if (label === 'quilt' || label === 'quote') el.remove();
      });

      const quoteInsertAnchor = () => details.querySelector('.reflection-themes-archive-quote-clipping');
      const detailsTopAnchor = () =>
        details.querySelector('.reflection-themes-archive-kicker') ||
        details.querySelector('.reflection-themes-archive-themes') ||
        details.firstElementChild;

      const quiltUrl = String(entry.quiltImageUrl || '').trim();
      let img = details.querySelector('.reflection-themes-archive-quilt-image');
      if (quiltUrl) {
        if (!img) {
          const frame = document.createElement('div');
          frame.className = 'reflection-themes-archive-quilt-frame';
          frame.innerHTML = `<div class="reflection-themes-archive-quilt-rotate">
              <img class="reflection-themes-archive-quilt-image" alt="" loading="lazy" data-date-key="${this.escapeQuiltFortuneText(key)}" />
            </div>`;
          const anchor = detailsTopAnchor();
          if (anchor) details.insertBefore(frame, anchor);
          else details.appendChild(frame);
          img = frame.querySelector('.reflection-themes-archive-quilt-image');
        } else {
          const frame = img.closest('.reflection-themes-archive-quilt-frame');
          const anchor = detailsTopAnchor();
          if (frame && anchor && frame !== anchor && frame.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) {
            details.insertBefore(frame, anchor);
          }
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
        const anchor = detailsTopAnchor();
        if (anchor) details.insertBefore(frame, anchor);
        else details.appendChild(frame);
      }

      const clippingUrl = String(entry.newspaperClippingUrl || '').trim();
      let clippingFrame = details.querySelector('.reflection-themes-archive-quote-clipping');
      if (clippingUrl) {
        const clippingHtml = this.buildReflectionArchiveQuoteClippingHtml(clippingUrl, entry.quote);
        if (clippingFrame) {
          clippingFrame.outerHTML = clippingHtml;
        } else {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = clippingHtml;
          const node = wrapper.firstElementChild;
          if (node) details.appendChild(node);
        }
      } else if (clippingFrame) {
        clippingFrame.remove();
      }
    }

    warmReflectionThemesArchiveCache() {
      this.prefetchReflectionThemesArchivePage();
    }

    prefetchReflectionThemesArchivePage() {
      if (this._reflectionThemesArchiveLoaded) return;
      if (this._reflectionThemesArchivePages?.[0]?.entries?.length) return;
      if (this._reflectionArchivePrefetchPromise) return;
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
      this.bindReflectionThemesArchiveModeToggle();
      if (!this._reflectionArchiveMode) this._reflectionArchiveMode = 'chronological';
      this.applyReflectionArchiveModeVisibility();
      if (this._reflectionArchiveMode === 'thematic') {
        this.renderReflectionThemeSectionsSkeleton();
        return;
      }
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

    buildReflectionThemeArchiveEntryHtml(entry, index, idPrefix = 'reflectionThemesArchiveDetails') {
      const dateLabel = this.formatReflectionThemeArchiveDate(entry.dateKey);
      const prompt = this.escapeQuiltFortuneText(entry.prompt);
      const ideaEntries = entry.themes
        .map((theme) => this.normalizeReflectionWallTheme(theme))
        .filter((item) => item?.text || (item?.split && item.strips?.length));
      const themes = ideaEntries
        .map((item) => {
          if (item.split && Array.isArray(item.strips)) {
            return item.strips
              .map((strip) => {
                const body = this.escapeQuiltFortuneText(strip.text);
                const author = String(strip.author || '').trim();
                const byline = author
                  ? ` <span class="reflection-themes-archive-theme-author">— ${this.escapeQuiltFortuneText(author)}</span>`
                  : '';
                return `<li class="reflection-themes-archive-theme-split">${body}${byline}</li>`;
              })
              .join('');
          }
          const body = this.escapeQuiltFortuneText(item.text);
          const author = String(item.author || '').trim();
          const byline = author
            ? ` <span class="reflection-themes-archive-theme-author">— ${this.escapeQuiltFortuneText(author)}</span>`
            : '';
          return `<li>${body}${byline}</li>`;
        })
        .join('');
      const detailsId = `${idPrefix}-${index}`;
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
      const quoteClippingHtml = this.buildReflectionArchiveQuoteClippingHtml(
        entry.newspaperClippingUrl,
        entry.quote
      );
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
            <p class="reflection-themes-archive-date">${this.escapeQuiltFortuneText(dateLabel)}</p>
            ${quiltImageHtml}
            ${this.buildReflectionArchiveSectionKickerHtml('Responses')}
            <ul class="reflection-themes-archive-themes">${themes}</ul>
            ${quoteClippingHtml}
          </div>
        </article>
      `;
    }

    renderReflectionThemeArchiveEntries(entries) {
      const feed = document.getElementById('reflectionThemesArchiveFeed');
      if (!feed) return;
      const archiveEntries = Array.isArray(entries) ? entries : [];
      if (!archiveEntries.length) {
        this.setReflectionThemesArchiveStatus('No reflection themes have been archived yet.');
        return;
      }
      feed.innerHTML = archiveEntries
        .map((entry, index) => this.buildReflectionThemeArchiveEntryHtml(entry, index))
        .join('');
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
          const dateKey = String(entry.getAttribute('data-date-key') || '').trim();
          if (dateKey && typeof window.odqTrack === 'function') {
            window.odqTrack('expand_archive_item', { date_key: dateKey });
          }
        }
      });
    }

    bindReflectionThemesArchiveModeToggle() {
      const toggle = document.getElementById('reflectionThemesArchiveModeToggle');
      if (!toggle || toggle.dataset.bound === '1') return;
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', (event) => {
        const btn = event.target.closest('.reflection-themes-archive-mode-btn');
        if (!btn || !toggle.contains(btn)) return;
        const mode = btn.getAttribute('data-mode');
        if (!mode || mode === this._reflectionArchiveMode) return;
        this._reflectionArchiveMode = mode;
        toggle.querySelectorAll('.reflection-themes-archive-mode-btn').forEach((el) => {
          const active = el === btn;
          el.classList.toggle('reflection-themes-archive-mode-btn--active', active);
          el.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        this.applyReflectionArchiveModeVisibility();
        if (mode === 'thematic') {
          this.renderReflectionThemeSectionsSkeleton();
        } else {
          void this.initializeReflectionThemesArchiveScreen();
        }
      });
    }

    applyReflectionArchiveModeVisibility() {
      const feed = document.getElementById('reflectionThemesArchiveFeed');
      const controls = document.getElementById('reflectionThemesArchiveControls');
      const sections = document.getElementById('reflectionThemesArchiveThemeSections');
      const isThematic = (this._reflectionArchiveMode || 'thematic') === 'thematic';
      if (feed) feed.hidden = isThematic;
      if (controls) controls.hidden = isThematic;
      if (sections) sections.hidden = !isThematic;
    }

    renderReflectionThemeSectionsSkeleton() {
      const container = document.getElementById('reflectionThemesArchiveThemeSections');
      if (!container) return;
      if (container.dataset.rendered === '1') return;
      container.dataset.rendered = '1';
      container.innerHTML = REFLECTION_ARCHIVE_THEME_ORDER.map((theme) => `
        <div class="reflection-themes-archive-theme-section" data-theme="${theme}">
          <button type="button" class="reflection-themes-archive-theme-section-header" aria-expanded="false" aria-controls="reflectionThemeSection-${theme}-body">
            <span>${theme}</span>
            <span class="reflection-themes-archive-theme-section-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img" focusable="false" width="18" height="18">
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </span>
          </button>
          <div class="reflection-themes-archive-theme-section-body" id="reflectionThemeSection-${theme}-body" hidden></div>
        </div>
      `).join('');
      this.bindReflectionThemeSectionsAccordion();
    }

    bindReflectionThemeSectionsAccordion() {
      const container = document.getElementById('reflectionThemesArchiveThemeSections');
      if (!container || container.dataset.accordionBound === '1') return;
      container.dataset.accordionBound = '1';

      container.addEventListener(
        'load',
        (event) => {
          const img = event.target;
          if (!img?.classList?.contains('reflection-themes-archive-quilt-image')) return;
          if (img.dataset.classicMatte !== '1' || img.dataset.matteApplied === '1') return;
          void this.applyWarmNeutralMatteToReflectionQuiltImage(img);
        },
        true
      );
      container.addEventListener(
        'error',
        (event) => {
          const img = event.target;
          if (!img?.classList?.contains('reflection-themes-archive-quilt-image')) return;
          const dateKey = String(img.getAttribute('data-date-key') || '').trim();
          if (dateKey) void this.ensureReflectionArchiveQuiltImage(dateKey, img);
        },
        true
      );

      container.addEventListener('click', async (event) => {
        const sectionHeader = event.target.closest('.reflection-themes-archive-theme-section-header');
        if (sectionHeader && container.contains(sectionHeader)) {
          await this.toggleReflectionThemeSection(sectionHeader);
          return;
        }
        const entryTrigger = event.target.closest('.reflection-themes-archive-question');
        if (entryTrigger && container.contains(entryTrigger)) {
          const entry = entryTrigger.closest('.reflection-themes-archive-entry');
          const details = entry?.querySelector('.reflection-themes-archive-details');
          if (!details) return;
          const isOpen = entryTrigger.getAttribute('aria-expanded') === 'true';
          if (isOpen) {
            entryTrigger.setAttribute('aria-expanded', 'false');
            details.hidden = true;
            entry.classList.remove('reflection-themes-archive-entry--open');
          } else {
            entryTrigger.setAttribute('aria-expanded', 'true');
            details.hidden = false;
            entry.classList.add('reflection-themes-archive-entry--open');
            this.hydrateReflectionArchiveQuiltImagesInEntry(entry);
          }
        }
      });
    }

    async toggleReflectionThemeSection(header) {
      const section = header.closest('.reflection-themes-archive-theme-section');
      const theme = section?.getAttribute('data-theme');
      const body = section?.querySelector('.reflection-themes-archive-theme-section-body');
      if (!theme || !body) return;

      const isOpen = header.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        header.setAttribute('aria-expanded', 'false');
        body.hidden = true;
        return;
      }
      header.setAttribute('aria-expanded', 'true');
      body.hidden = false;

      if (!this._reflectionThemeSectionPages) this._reflectionThemeSectionPages = {};
      if (!this._reflectionThemeSectionPageIndex) this._reflectionThemeSectionPageIndex = {};
      const cachedPages = this._reflectionThemeSectionPages[theme];
      if (cachedPages) {
        const cachedPage = cachedPages[this._reflectionThemeSectionPageIndex[theme] || 0];
        this.renderReflectionThemeSectionEntries(theme, cachedPage?.entries || []);
        return;
      }

      await this.loadReflectionThemeSectionFirstPage(theme, body);
    }

    async loadReflectionThemeSectionFirstPage(theme, body) {
      body.innerHTML = `<div class="reflection-themes-archive-theme-section-loading">Loading ${this.escapeQuiltFortuneText(theme)} reflections...</div>`;
      try {
        const page = await this.fetchReflectionThemeSectionPageViaBackend(theme, null);
        if (!this._reflectionThemeSectionPages) this._reflectionThemeSectionPages = {};
        if (!this._reflectionThemeSectionPageIndex) this._reflectionThemeSectionPageIndex = {};
        if (!this._reflectionThemeSectionHasOlder) this._reflectionThemeSectionHasOlder = {};
        if (!page) {
          body.innerHTML = `<p class="reflection-themes-archive-theme-section-empty">Could not load this section.</p>`;
          return;
        }
        if (!page.entries.length) {
          this._reflectionThemeSectionPages[theme] = [];
          body.innerHTML = `<p class="reflection-themes-archive-theme-section-empty">No reflections tagged &ldquo;${this.escapeQuiltFortuneText(theme)}&rdquo; yet.</p>`;
          return;
        }
        this._reflectionThemeSectionPages[theme] = [page];
        this._reflectionThemeSectionPageIndex[theme] = 0;
        this._reflectionThemeSectionHasOlder[theme] = page.hasOlder;
        this.renderReflectionThemeSectionEntries(theme, page.entries);
      } catch (error) {
        this.logger?.warn?.(`Reflection theme section "${theme}" failed to load:`, error);
        body.innerHTML = `<p class="reflection-themes-archive-theme-section-empty">Could not load this section.</p>`;
      }
    }

    renderReflectionThemeSectionEntries(theme, entries) {
      const body = document.getElementById(`reflectionThemeSection-${theme}-body`);
      if (!body) return;
      const sectionEntries = Array.isArray(entries) ? entries : [];
      if (!sectionEntries.length) {
        body.innerHTML = `<p class="reflection-themes-archive-theme-section-empty">No reflections tagged &ldquo;${this.escapeQuiltFortuneText(theme)}&rdquo; yet.</p>`;
        return;
      }
      body.innerHTML = sectionEntries
        .map((entry, index) => this.buildReflectionThemeArchiveEntryHtml(entry, index, `reflectionThemeSection-${theme}-details`))
        .join('');
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
        err.existingResponseId = data?.existingResponseId || '';
        throw err;
      }
      if (typeof window.odqTrack === 'function') {
        window.odqTrack('add_reflection', {
          char_count: String(responseText || '').trim().length
        });
      }
      return data;
    }

    _reflectionResponsePayload(responseText, options = {}) {
      const todayQuote = this.quoteService?.getTodayQuote?.() || null;
      const displayName =
        Object.prototype.hasOwnProperty.call(options, 'displayName')
          ? String(options.displayName ?? '').trim()
          : Utils.getNameThanksDisplayName();
      const payload = {
        responseText,
        appDateKey: options.appDateKey || Utils.getTodayKey(),
        clientId: options.clientId || this.currentUserId || Utils.getOrCreateUserId(),
        reflectionPromptSnapshot: this.getQuiltReflectionPromptText(todayQuote).slice(0, 500)
      };
      if (displayName) payload.displayName = displayName.slice(0, 80);
      return payload;
    }

    async updateReflectionResponse(responseId, responseText, options = {}) {
      const baseUrl = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (!baseUrl) throw new Error('CONFIG.BACKEND.baseUrl is not set');
      const id = String(responseId || '').trim();
      if (!id) throw new Error('responseId is required');
      const payload = this._reflectionResponsePayload(responseText, options);
      const patchReflection = () =>
        fetch(`${baseUrl}/api/reflection-response/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      let res = await patchReflection();
      let data = await res.json().catch(() => null);
      if (res.status === 503) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        res = await patchReflection();
        data = await res.json().catch(() => null);
      }
      if (!res.ok || !data?.success) {
        const err = new Error(data?.error || `Reflection update failed (${res.status})`);
        err.status = res.status;
        err.rejected = res.status === 422 || data?.rejected === true;
        throw err;
      }
      if (typeof window.odqTrack === 'function') {
        window.odqTrack('edit_reflection', {
          char_count: String(responseText || '').trim().length
        });
      }
      return data;
    }

    async deleteReflectionResponse(responseId, options = {}) {
      const baseUrl = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (!baseUrl) throw new Error('CONFIG.BACKEND.baseUrl is not set');
      const id = String(responseId || '').trim();
      if (!id) throw new Error('responseId is required');
      const payload = {
        clientId: options.clientId || this.currentUserId || Utils.getOrCreateUserId()
      };
      const res = await fetch(`${baseUrl}/api/reflection-response/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        const err = new Error(data?.error || `Reflection delete failed (${res.status})`);
        err.status = res.status;
        throw err;
      }
      if (typeof window.odqTrack === 'function') {
        window.odqTrack('delete_reflection', {});
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

    normalizeQuoteSpeakerLinkUrl(value) {
      const url = String(value || '').trim();
      if (!url) return '';
      if (/^javascript:/i.test(url)) return '';
      if (!/^https?:\/\//i.test(url)) return '';
      return url;
    }

    quoteHasSpeakerImageAttribute(quote) {
      if (!quote || typeof quote !== 'object') return false;
      return [
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
      ].some((key) => !!this.normalizeQuoteSpeakerImageUrl(quote[key]));
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
      if (!cutoutUrl) {
        cutoutUrl = this.normalizeQuoteSpeakerImageUrl(
          this.getQuoteSpeakerField(quote, [
            'speakerCutoutUrl',
            'speaker_cutout_url',
            'speakerCutoutUrlSnapshot',
            'speaker_cutout_url_snapshot'
          ])
        );
      }
      const imageUrl = cutoutUrl || portraitUrl;
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
      const speakerLink = this.normalizeQuoteSpeakerLinkUrl(
        this.getQuoteSpeakerField(quote, [
          'speakerLink',
          'speaker_link',
          'speakerLinkSnapshot',
          'speaker_link_snapshot'
        ]) ||
          (this.quoteService?.isSeamsideQuote?.(quote)
            ? this.quoteService.lookupSeamsideSpeakerLinkForAuthor?.(name)
            : '')
      );
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
      return { name, imageUrl, portraitUrl, cutoutUrl, dates, guideLine, speakerLink, speakerKeywords, imageAttribution };
    }

    _shouldShowSeamsideSpeakerGuideLearnMore(quote, profile) {
      if (!profile) return false;
      if (this.quoteService?.isSeamsideQuote?.(quote) !== true) return false;
      if (!this.normalizeQuoteSpeakerLinkUrl(profile.speakerLink)) return false;
      return !!String(profile.name || '').trim();
    }

    _appendSeamsideSpeakerGuideLearnMoreLink(guideEl, quote, profile) {
      if (!guideEl) return false;
      guideEl.querySelector('.quote-speaker-guide__learn-more')?.remove();
      if (!this._shouldShowSeamsideSpeakerGuideLearnMore(quote, profile)) return false;
      const speakerLink = this.normalizeQuoteSpeakerLinkUrl(profile.speakerLink);
      const speakerName = String(profile.name || '').trim();
      if (guideEl.textContent.trim()) guideEl.appendChild(document.createElement('br'));
      const link = document.createElement('a');
      link.className = 'quote-speaker-guide__learn-more';
      link.href = speakerLink;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `Learn more about ${speakerName}.`;
      guideEl.appendChild(link);
      return true;
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

    _quoteSpeakerImageUrlKey(url) {
      return String(url || '')
        .trim()
        .split('?')[0]
        .replace(/%2F/gi, '/')
        .toLowerCase();
    }

    _quoteSpeakerImageUrlsMatch(a, b) {
      const left = this._quoteSpeakerImageUrlKey(a);
      const right = this._quoteSpeakerImageUrlKey(b);
      return !!(left && right && left === right);
    }

    /** Firebase Storage cutouts omit ACAO — display-only loads must not set crossOrigin. */
    _quoteSpeakerImageCrossOriginMode(url, { forCanvas = false } = {}) {
      const src = String(url || '').trim();
      if (!forCanvas && this._quoteSpeakerShouldStripFringe(src)) return null;
      if (/^https?:\/\//i.test(src) && !this._quoteSpeakerCanvasPipelineBlocked()) {
        return 'anonymous';
      }
      return null;
    }

    _applyQuoteSpeakerImageCrossOrigin(img, url, options = {}) {
      if (!img) return;
      const mode = this._quoteSpeakerImageCrossOriginMode(url, options);
      if (mode) img.crossOrigin = mode;
      else img.removeAttribute('crossorigin');
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

    _loadQuoteSpeakerImageElement(url, options = {}) {
      const src = String(url || '').trim();
      if (!src) return Promise.resolve(null);
      const forCanvas = options.forCanvas === true;
      return new Promise((resolve) => {
        const img = new Image();
        const corsMode = this._quoteSpeakerImageCrossOriginMode(src, { forCanvas });
        if (corsMode) img.crossOrigin = corsMode;
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => {
          if (!forCanvas && !options.noCorsRetry && this._quoteSpeakerShouldStripFringe(src)) {
            void this._loadQuoteSpeakerImageElement(src, { ...options, noCorsRetry: true }).then(resolve);
            return;
          }
          resolve(null);
        };
        img.src = src;
      });
    }

    /** Fresh decode for canvas — never trust naturalWidth on an <img> whose src just changed. */
    async _ensureQuoteSpeakerImageForCanvas(url) {
      const src = String(url || '').trim();
      if (!src) return null;
      let img = await this._loadQuoteSpeakerImageElement(src, { forCanvas: true });
      if (!img?.naturalWidth && this._quoteSpeakerShouldStripFringe(src) && this.archiveService?._prepareSpeakerImageUrlForCanvas) {
        try {
          const proxied = await this.archiveService._prepareSpeakerImageUrlForCanvas(src);
          if (proxied && proxied !== src) {
            img = await this._loadQuoteSpeakerImageElement(proxied, { forCanvas: true });
          }
        } catch (_) {
          /* ignore */
        }
      }
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
      if (!src) return src;
      // Storage PNGs are halo-stripped on upload; in-app strip ate collar/shoulder pixels in margin bands.
      if (this._quoteSpeakerShouldStripFringe(src)) return src;
      if (this._quoteSpeakerCanvasPipelineBlocked()) return src;
      const tryClean = async (loadUrl) => {
        const img = await this._loadQuoteSpeakerImageElement(loadUrl, { forCanvas: true });
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

    /** Subject ink bounds — connected portrait blob only (drops remove.bg mattes / grey fringe). */
    _quoteSpeakerMeasureSubjectBounds(img) {
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
      let imageData;
      try {
        imageData = ctx.getImageData(0, 0, scanW, scanH);
      } catch (_) {
        return null;
      }
      const d = new Uint8ClampedArray(imageData.data);
      const usedMask = this._quoteSpeakerMaskSubjectComponent(d, scanW, scanH);
      const isSubject = (o) => {
        if (d[o + 3] <= 28) return false;
        if (usedMask) return true;
        return this._quoteSpeakerPixelIsSubject(d[o], d[o + 1], d[o + 2], d[o + 3]);
      };
      let minX = scanW;
      let minY = scanH;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < scanH; y += 1) {
        for (let x = 0; x < scanW; x += 1) {
          const o = (y * scanW + x) * 4;
          if (!isSubject(o)) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX || maxY < minY) return null;
      const sx = iw / scanW;
      const sy = ih / scanH;
      return {
        minX: minX * sx,
        minY: minY * sy,
        maxX: maxX * sx,
        maxY: maxY * sy,
        width: (maxX - minX + 1) * sx,
        height: (maxY - minY + 1) * sy
      };
    }

    /** Natural frame height when the cutout is width-filled to boxW. */
    _quoteSpeakerCutoutFrameHeight(naturalW, naturalH, boxW) {
      const iw = Math.max(1, naturalW);
      const ih = Math.max(1, naturalH);
      return Math.ceil((ih * Math.max(1, boxW)) / iw);
    }

    /** Width-fill using subject ink bounds — drops empty PNG margins on plain cutouts. */
    _quoteSpeakerCutoutSubjectFraming(naturalW, naturalH, boxW, subjectBounds) {
      const iw = Math.max(1, naturalW);
      const ih = Math.max(1, naturalH);
      const sw = Math.max(1, subjectBounds.width);
      const sh = Math.max(1, subjectBounds.height);
      /** Scale so opaque subject width fills the 90% name-strip column. */
      const scale = boxW / sw;
      const drawW = iw * scale;
      const drawH = ih * scale;
      let offsetX = -subjectBounds.minX * scale;
      offsetX = Math.max(boxW - drawW, Math.min(0, offsetX));
      const padTop = 8;
      const downNudge = 28;
      const frameH = Math.max(120, Math.ceil(padTop + downNudge + sh * scale + 4));
      const offsetY = frameH - drawH - 2;
      return { offsetX, offsetY, drawW, drawH, scale, frameH };
    }

    /** Plain cutout layout: prefer subject-fill so the figure reads at 90% strip width. */
    _applyQuoteSpeakerPlainCutoutLayout(cutout, img, boxW = 0) {
      if (!cutout || !img?.naturalWidth) return;
      const width = Math.max(1, Math.round(boxW || this._quoteSpeakerLayoutBoxW(cutout)));
      const layoutImg = this._quoteSpeakerLayoutImg(cutout, img) || img;
      const boundsSig = `${layoutImg.naturalWidth}x${layoutImg.naturalHeight}:${String(
        layoutImg.currentSrc || layoutImg.src || cutout._plainCutoutSourceUrl || ''
      ).trim()}`;
      if (cutout._speakerSubjectBoundsSig !== boundsSig) {
        cutout._speakerSubjectBounds = null;
        cutout._speakerSubjectCrop = null;
        cutout._speakerOpaqueBounds = null;
        cutout._speakerSubjectBoundsSig = boundsSig;
      }
      const subjectBounds =
        cutout._speakerSubjectBounds ||
        this._quoteSpeakerMeasureSubjectBounds(layoutImg);
      if (subjectBounds?.width > 0) {
        cutout._speakerSubjectBounds = subjectBounds;
        cutout._speakerSubjectCrop = subjectBounds;
        if (!cutout._speakerOpaqueBounds) {
          cutout._speakerOpaqueBounds =
            this._quoteSpeakerMeasureOpaqueBounds(layoutImg) || subjectBounds;
        }
        this._applyQuoteSpeakerCutoutFrameHeight(
          cutout,
          layoutImg,
          width,
          cutout._speakerOpaqueBounds,
          subjectBounds
        );
        return;
      }
      cutout.classList.remove('quote-speaker-cutout--subject-fill');
      delete cutout._speakerSubjectCrop;
      cutout._speakerSubjectBounds = null;
      this._applyQuoteSpeakerPlainCutoutFit(cutout, img, width);
      this._scheduleQuoteSpeakerPlainCutoutBoundsRetry(cutout, img, width);
    }

    /** Canvas read can fail on first paint (CORS / Capacitor) — remeasure from a decoded copy. */
    _scheduleQuoteSpeakerPlainCutoutBoundsRetry(cutout, img, boxW = 0, attempt = 0) {
      if (!cutout || cutout.hidden || attempt >= 4) return;
      if (cutout.classList.contains('quote-speaker-cutout--subject-fill')) return;
      const width = Math.max(1, Math.round(boxW || this._quoteSpeakerLayoutBoxW(cutout)));
      const imgSrc = String(img?.currentSrc || img?.src || '').trim();
      const loadUrl = /^data:/i.test(imgSrc)
        ? imgSrc
        : String(
            cutout._plainCutoutSourceUrl ||
              cutout._plainCutoutSourceImage?.src ||
              imgSrc ||
              ''
          ).trim();
      if (!loadUrl) return;
      const retryKey = `${width}|${loadUrl}|${attempt}`;
      if (cutout._speakerBoundsRetryKey === retryKey) return;
      cutout._speakerBoundsRetryKey = retryKey;
      const delayMs = attempt === 0 ? 0 : 120 * attempt;
      const run = () => {
        if (!cutout.isConnected || cutout.hidden) return;
        if (cutout.classList.contains('quote-speaker-cutout--subject-fill')) return;
        void this._loadQuoteSpeakerImageElement(loadUrl).then((decoded) => {
          if (!decoded?.naturalWidth || cutout.hidden) return;
          cutout._plainCutoutSourceImage = decoded;
          cutout._plainCutoutSourceImage._loadedUrl = loadUrl;
          cutout._speakerSubjectBounds = null;
          cutout._speakerSubjectCrop = null;
          cutout._speakerOpaqueBounds = null;
          cutout._speakerSubjectBoundsSig = '';
          const bounds = this._quoteSpeakerMeasureSubjectBounds(decoded);
          if (!bounds?.width) {
            this._scheduleQuoteSpeakerPlainCutoutBoundsRetry(cutout, img, width, attempt + 1);
            return;
          }
          this._applyQuoteSpeakerPlainCutoutLayout(cutout, img, width);
          this._syncQuoteSpeakerNameTuck(cutout, img);
        });
      };
      if (delayMs > 0) setTimeout(run, delayMs);
      else requestAnimationFrame(run);
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
      const minOffset = boxH - drawH - padBottom;
      const naturalFitH = padTop + downNudge + drawH;
      if (boxH > naturalFitH + 10) {
        return { offsetX, offsetY: minOffset, drawW, drawH, scale };
      }
      let offsetY = padTop - bounds.minY * scale + downNudge;
      const maxOffset = padTop + downNudge;
      offsetY = Math.min(maxOffset, Math.max(minOffset, offsetY));
      return { offsetX, offsetY, drawW, drawH, scale };
    }

    _quoteSpeakerImageContainRect(naturalW, naturalH, boxW, boxH, bounds = null) {
      return this._quoteSpeakerCutoutFraming(naturalW, naturalH, boxW, boxH, bounds);
    }

    /** Extra cutout height so the portrait bottom tucks behind the identity name slab. */
    _quoteSpeakerBottomAlignCutout(cutout) {
      if (!cutout) return;
      const frameH = Math.max(
        cutout.clientHeight || 0,
        parseFloat(String(cutout.style.height || '').replace(/px$/, '')) || 0
      );
      const rawDrawH = String(cutout.style.getPropertyValue('--speaker-cutout-bg-h') || '').trim();
      const drawH = parseFloat(rawDrawH.replace(/px$/, '')) || 0;
      if (frameH < 1 || drawH < 1) return;
      cutout.style.setProperty('--speaker-cutout-pos-y', `${Math.max(0, Math.round(frameH - drawH - 2))}px`);
    }

    /** Plain cutout: baked pale-quilt newsprint composite (subject shape only — no white mat). */
    _applyQuoteSpeakerPlainCutoutWidgetDisplay(cutout, img, sourceUrl = '') {
      if (!cutout || cutout.hidden || !img?.naturalWidth) return;
      this._applyQuoteSpeakerPlainCutoutBacking(cutout, img, sourceUrl);
    }

    _quoteSpeakerPlainCutoutPaperSeed() {
      return (
        (this.quoteService && typeof this.quoteService.getQuoteCalendarKeyNow === 'function'
          ? this.quoteService.getQuoteCalendarKeyNow()
          : '') ||
        (typeof Utils !== 'undefined' && typeof Utils.getTodayKey === 'function'
          ? Utils.getTodayKey()
          : 'odq')
      );
    }

    _quoteSpeakerPlainCutoutLayoutSig(cutout, sourceImg = null, boxW = 0) {
      if (!cutout) return '';
      const src =
        sourceImg ||
        cutout._plainCutoutSourceImage ||
        cutout.querySelector?.('.quote-speaker-image');
      const wrap = cutout.closest?.('.quote-speaker-portrait-wrap');
      const w = Math.max(
        1,
        Math.round(boxW || wrap?.clientWidth || cutout.clientWidth || 0)
      );
      const subj = cutout._speakerSubjectBounds || cutout._speakerSubjectCrop;
      const subjKey = subj?.width
        ? `${Math.round(subj.minX)}:${Math.round(subj.minY)}:${Math.round(subj.width)}:${Math.round(subj.height)}`
        : '';
      return [w, src?.naturalWidth || 0, src?.naturalHeight || 0, subjKey].join('|');
    }

    _showQuoteSpeakerPlainCutoutFallback(cutout, portraitImg) {
      if (!cutout || !portraitImg) return;
      cutout.classList.add('quote-speaker-cutout--plain-fallback');
      cutout.classList.remove('quote-speaker-cutout--plain-composite');
      delete portraitImg.dataset.plainCutoutComposite;
      delete portraitImg.dataset.plainCutoutDirect;
      portraitImg.hidden = false;
      portraitImg.classList.add('is-loaded');
      portraitImg.style.removeProperty('opacity');
      if (portraitImg.naturalWidth) {
        this._applyQuoteSpeakerPlainCutoutFit(cutout, portraitImg);
      }
    }

    /** Firebase cutout PNG is already toned — show it directly; skip canvas multiply/flatten. */
    _applyQuoteSpeakerPlainCutoutDirectDisplay(cutout, portraitImg) {
      if (!cutout || !portraitImg) return;
      cutout.classList.remove('quote-speaker-cutout--plain-fallback', 'quote-speaker-cutout--plain-composite');
      delete portraitImg.dataset.plainCutoutComposite;
      portraitImg.dataset.plainCutoutDirect = '1';
      portraitImg.hidden = false;
      portraitImg.classList.add('is-loaded');
      portraitImg.style.removeProperty('opacity');
      cutout.style.setProperty('--speaker-image-url', 'none');
    }

    /** Plain cutout: contain the full PNG inside the 90% portrait column. */
    _clearQuoteSpeakerPortraitImgInlineLayout(cutout) {
      const portraitImg = cutout?.querySelector?.('.quote-speaker-image');
      if (!portraitImg) return;
      portraitImg.style.removeProperty('width');
      portraitImg.style.removeProperty('height');
      portraitImg.style.removeProperty('max-width');
      portraitImg.style.removeProperty('left');
      portraitImg.style.removeProperty('top');
      portraitImg.style.removeProperty('object-fit');
      portraitImg.style.removeProperty('object-position');
    }

    _applyQuoteSpeakerPlainCutoutFit(cutout, img, boxW = 0) {
      if (!cutout || !img?.naturalWidth) return;
      const width = Math.max(1, Math.round(boxW || this._quoteSpeakerLayoutBoxW(cutout)));
      const iw = Math.max(1, img.naturalWidth);
      const ih = Math.max(1, img.naturalHeight);
      const drawH = Math.max(120, Math.ceil((ih * width) / iw));
      const frameH = Math.max(120, drawH + 8);
      cutout.classList.remove('quote-speaker-cutout--subject-fill');
      delete cutout._speakerSubjectCrop;
      cutout._speakerSubjectBounds = null;
      this._clearQuoteSpeakerPortraitImgInlineLayout(cutout);
      cutout.style.height = `${frameH}px`;
      cutout.style.setProperty('--speaker-cutout-pos-x', '0px');
      cutout.style.setProperty('--speaker-cutout-pos-y', `${Math.max(0, frameH - drawH - 2)}px`);
      cutout.style.setProperty('--speaker-cutout-bg-w', `${width}px`);
      cutout.style.setProperty('--speaker-cutout-bg-h', `${drawH}px`);
    }

    _applyQuoteSpeakerPlainCutoutDirectFit(cutout, img, boxW = 0) {
      this._applyQuoteSpeakerPlainCutoutFit(cutout, img, boxW);
    }

    _clearQuoteSpeakerPlainCutoutPaperBacking(cutout, neutralSilhouette) {
      if (cutout) cutout.classList.remove('quote-speaker-cutout--paper-backed');
      if (neutralSilhouette) {
        neutralSilhouette.hidden = true;
        neutralSilhouette.setAttribute('hidden', '');
        neutralSilhouette.classList.remove('quote-speaker-cutout-backing--filled');
        delete neutralSilhouette.dataset.plainCutoutPaper;
        neutralSilhouette.style.removeProperty('background-image');
        neutralSilhouette.style.removeProperty('background-color');
        neutralSilhouette.style.removeProperty('filter');
      }
      if (cutout) {
        cutout.style.removeProperty('--speaker-cutout-paper-color');
        cutout._plainCutoutPaperSig = '';
        cutout.classList.remove('quote-speaker-cutout--plain-composite');
        delete cutout._plainCutoutPaperColor;
      }
      const widget = document.getElementById('quoteSpeakerWidget');
      if (widget) widget.style.removeProperty('--speaker-cutout-paper-color');
    }

    _quoteSpeakerLayoutImg(cutout, img) {
      if (!cutout || !img) return img;
      if (
        cutout.classList.contains('quote-speaker-cutout--plain-cutout') ||
        cutout.classList.contains('quote-speaker-cutout--plain-composite') ||
        img.dataset?.plainCutoutComposite === '1' ||
        img.dataset?.plainCutoutDirect === '1'
      ) {
        return this._quoteSpeakerPlainCutoutSourceImg(cutout, img) || img;
      }
      return img;
    }

    _syncQuoteSpeakerNameTuck(cutout, img) {
      if (!cutout || cutout.hidden || !img?.naturalWidth) return;
      const layoutImg = this._quoteSpeakerLayoutImg(cutout, img);
      if (!layoutImg?.naturalWidth) return;
      const wrap = cutout.closest('.quote-speaker-portrait-wrap');
      const boxW = this._quoteSpeakerLayoutBoxW(cutout);
      const tuckSig = `${layoutImg.naturalWidth}x${layoutImg.naturalHeight}:${boxW}`;
      if (cutout._speakerTuckAnchorSig !== tuckSig) {
        cutout._speakerTuckAnchorSig = tuckSig;
        this._applyQuoteSpeakerCutoutAnchor(cutout, layoutImg);
        if (cutout.classList.contains('quote-speaker-cutout--plain-cutout')) {
          const directReady =
            cutout.querySelector('.quote-speaker-image')?.dataset?.plainCutoutDirect === '1';
          if (!directReady) {
            this._applyQuoteSpeakerPlainCutoutWidgetDisplay(
              cutout,
              layoutImg,
              cutout._plainCutoutSourceUrl
            );
          }
        }
        return;
      }
      if (!wrap) return;
      requestAnimationFrame(() => {
        const wrapRect = wrap.getBoundingClientRect();
        const cutoutRect = cutout.getBoundingClientRect();
        if (wrapRect.width < 1 || cutoutRect.width < 1) return;
        this._applyQuoteSpeakerIdentityTuck(cutout, wrapRect, cutoutRect);
      });
    }

    _quoteSpeakerLayoutBoxW(imageWrap) {
      const widget = imageWrap?.closest('.quote-speaker-widget');
      const wrap = imageWrap?.closest('.quote-speaker-portrait-wrap');
      if (widget) this._syncQuoteSpeakerPortraitWidthFromNameStrip(widget);
      if (wrap) void wrap.offsetWidth;
      return Math.max(1, Math.round(wrap?.clientWidth || 0));
    }

    _applyQuoteSpeakerCutoutFrameHeight(imageWrap, img, boxW, bounds, subjectBounds = null) {
      const wrap = imageWrap.closest('.quote-speaker-portrait-wrap');
      const useSubjectFraming = subjectBounds?.width > 0;
      let offsetX = 0;
      let offsetY = 0;
      let drawW = boxW;
      let drawH = this._quoteSpeakerCutoutFrameHeight(img.naturalWidth, img.naturalHeight, boxW);
      let frameH = Math.max(120, Math.ceil(drawH + 8));

      if (useSubjectFraming) {
        imageWrap.classList.add('quote-speaker-cutout--subject-fill');
        imageWrap._speakerSubjectCrop = subjectBounds;
        ({ offsetX, offsetY, drawW, drawH, frameH } = this._quoteSpeakerCutoutSubjectFraming(
          img.naturalWidth,
          img.naturalHeight,
          boxW,
          subjectBounds
        ));
      } else {
        imageWrap.classList.remove('quote-speaker-cutout--subject-fill');
        delete imageWrap._speakerSubjectCrop;
        const naturalFrameH = drawH;
        if (bounds) {
          const draftH = Math.max(120, naturalFrameH + 32);
          ({ offsetX, offsetY, drawW, drawH } = this._quoteSpeakerCutoutFraming(
            img.naturalWidth,
            img.naturalHeight,
            boxW,
            draftH,
            bounds
          ));
          frameH = Math.max(120, Math.ceil(offsetY + drawH + 4));
          if (frameH !== draftH) {
            ({ offsetX, offsetY, drawW, drawH } = this._quoteSpeakerCutoutFraming(
              img.naturalWidth,
              img.naturalHeight,
              boxW,
              frameH,
              bounds
            ));
          }
        } else {
          offsetY = Math.max(0, frameH - drawH - 4);
        }
      }

      imageWrap.style.height = `${frameH}px`;
      imageWrap.style.setProperty('--speaker-cutout-pos-x', `${offsetX}px`);
      imageWrap.style.setProperty('--speaker-cutout-pos-y', `${offsetY}px`);
      imageWrap.style.setProperty('--speaker-cutout-bg-w', `${drawW}px`);
      imageWrap.style.setProperty('--speaker-cutout-bg-h', `${drawH}px`);
      if (useSubjectFraming) {
        this._clearQuoteSpeakerPortraitImgInlineLayout(imageWrap);
      }
      if (!useSubjectFraming) {
        this._quoteSpeakerBottomAlignCutout(imageWrap);
      }
    }

    _applyQuoteSpeakerCutoutAnchor(imageWrap, img) {
      if (!imageWrap || !img?.naturalWidth) return;
      const boxW = this._quoteSpeakerLayoutBoxW(imageWrap);
      if (boxW < 48) {
        requestAnimationFrame(() => {
          if (imageWrap.isConnected && img?.naturalWidth) {
            this._applyQuoteSpeakerCutoutAnchor(imageWrap, img);
          }
        });
        return;
      }
      const wrap = imageWrap.closest('.quote-speaker-portrait-wrap');
      const plainCutout = imageWrap.classList.contains('quote-speaker-cutout--plain-cutout');
      const opaqueBounds = this._quoteSpeakerMeasureOpaqueBounds(img);
      imageWrap._speakerOpaqueBounds = opaqueBounds;
      if (plainCutout) {
        this._applyQuoteSpeakerPlainCutoutLayout(imageWrap, img, boxW);
        this._refineQuoteSpeakerPortraitWidthAfterLayout(
          imageWrap.closest('.quote-speaker-widget'),
          imageWrap,
          img
        );
      } else {
        imageWrap._speakerSubjectBounds = null;
        delete imageWrap._speakerSubjectCrop;
        this._applyQuoteSpeakerCutoutFrameHeight(
          imageWrap,
          img,
          boxW,
          opaqueBounds,
          null
        );
        this._pinQuoteSpeakerSingleLayerOverlays(imageWrap);
        this._refineQuoteSpeakerPortraitWidthAfterLayout(
          imageWrap.closest('.quote-speaker-widget'),
          imageWrap,
          img
        );
      }
      const widgetEl = imageWrap.closest('.quote-speaker-widget');
      if (widgetEl) {
        requestAnimationFrame(() => {
          if (imageWrap.hidden || !img?.naturalWidth) return;
          if (this._enforceQuoteSpeakerPortraitVisualCap(widgetEl, imageWrap, img)) {
            this._syncQuoteSpeakerNameTuck(imageWrap, img);
          }
        });
      }
      if (wrap) {
        requestAnimationFrame(() => {
          const wrapRect = wrap.getBoundingClientRect();
          const cutoutRect = imageWrap.getBoundingClientRect();
          if (wrapRect.width < 1 || cutoutRect.width < 1) return;
          this._applyQuoteSpeakerIdentityTuck(imageWrap, wrapRect, cutoutRect);
        });
      }
    }

    /** Pull name strip up so opaque cutout bottom tucks slightly behind it (px from widget var). */
    _quoteSpeakerCutoutWidthFrac(widget) {
      const style = widget && typeof getComputedStyle === 'function' ? getComputedStyle(widget) : null;
      const fracRaw = String(style?.getPropertyValue('--quote-speaker-cutout-width-frac') || '').trim();
      if (fracRaw) {
        const frac = parseFloat(fracRaw);
        if (Number.isFinite(frac)) {
          return Math.max(0.5, Math.min(1, frac > 1 ? frac / 100 : frac));
        }
      }
      const raw = String(style?.getPropertyValue('--quote-speaker-cutout-width') || '90%').trim();
      if (raw.endsWith('%')) {
        const n = parseFloat(raw);
        return Number.isFinite(n) ? Math.max(0.5, Math.min(1, n / 100)) : 0.9;
      }
      // Layout widths use calc(...); that is not a fraction.
      if (/calc\s*\(/i.test(raw)) return 0.9;
      const n = parseFloat(raw);
      return Number.isFinite(n) && n > 0 && n <= 1 ? Math.max(0.5, Math.min(1, n)) : 0.9;
    }

    /** Portrait tilt (`.quote-speaker-portrait-tilt`) widens the painted bbox — reserve that bleed. */
    _quoteSpeakerPortraitTiltBleedPx(widget, heightPx = 0) {
      const h = Math.max(0, Number(heightPx) || 0);
      if (h < 1) return 0;
      const tilt = widget?.querySelector('.quote-speaker-portrait-tilt');
      let angleDeg = 1.35;
      if (tilt && typeof getComputedStyle === 'function') {
        const tr = getComputedStyle(tilt).transform;
        if (tr && tr !== 'none') {
          const m = tr.match(/matrix\(([^)]+)\)/);
          if (m) {
            const parts = m[1].split(',').map((v) => parseFloat(v.trim()));
            if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
              angleDeg = Math.abs((Math.atan2(parts[1], parts[0]) * 180) / Math.PI);
            }
          }
        }
      }
      return h * Math.sin((angleDeg * Math.PI) / 180);
    }

    /** Center tape band between side caps — matches the visible name strip field. */
    _quoteSpeakerIdentityNameStripWidth(widget, identity) {
      const outerW = Math.max(identity?.offsetWidth || 0, identity?.clientWidth || 0);
      if (outerW < 48) return 0;
      const style =
        widget && typeof getComputedStyle === 'function'
          ? getComputedStyle(widget)
          : identity && typeof getComputedStyle === 'function'
            ? getComputedStyle(identity)
            : null;
      const capRaw = String(style?.getPropertyValue('--quilt-byg-tape-cap') || '13%').trim();
      let capFrac = 0.13;
      if (capRaw.endsWith('%')) {
        const n = parseFloat(capRaw);
        if (Number.isFinite(n)) capFrac = Math.max(0, Math.min(0.45, n / 100));
      }
      return Math.max(48, outerW * (1 - 2 * capFrac));
    }

    _quoteSpeakerPortraitLayoutWidth(widget, stripW, heightPx = 0) {
      const maxVisualW = stripW * this._quoteSpeakerCutoutWidthFrac(widget);
      const bleed = this._quoteSpeakerPortraitTiltBleedPx(widget, heightPx);
      return Math.max(48, Math.round(maxVisualW - bleed));
    }

    /** Speaker card: portrait column fits inside 90% of the center name tape after tilt bleed. */
    _syncQuoteSpeakerPortraitWidthFromNameStrip(widget, heightPx = 0) {
      if (!widget || widget.hidden) return false;
      const identity = widget.querySelector('.quote-speaker-slab--identity');
      const wrap = widget.querySelector('.quote-speaker-portrait-wrap');
      if (!identity || !wrap) return false;
      const stripW = this._quoteSpeakerIdentityNameStripWidth(widget, identity);
      if (stripW < 48) return false;
      let estH = Math.max(0, Number(heightPx) || 0);
      if (estH < 1) {
        const cutout = widget.querySelector('.quote-speaker-cutout');
        estH = Math.max(
          cutout?.clientHeight || 0,
          parseFloat(String(cutout?.style?.height || '').replace(/px$/, '')) || 0
        );
      }
      const target = this._quoteSpeakerPortraitLayoutWidth(widget, stripW, estH);
      const prev = wrap._speakerPortraitWidthPx || 0;
      wrap.style.width = `${target}px`;
      wrap.style.maxWidth = `${target}px`;
      wrap._speakerPortraitWidthPx = target;
      return prev !== target;
    }

    _refineQuoteSpeakerPortraitWidthAfterLayout(widget, cutout, img) {
      if (!widget || !cutout || !img?.naturalWidth || cutout._speakerPortraitWidthRefined) return;
      const frameH = Math.max(
        parseFloat(String(cutout.style.height || '').replace(/px$/, '')) || 0,
        cutout.clientHeight || 0
      );
      if (frameH < 48) return;
      const boxW = this._quoteSpeakerLayoutBoxW(cutout);
      this._syncQuoteSpeakerPortraitWidthFromNameStrip(widget, frameH);
      const nextBoxW = this._quoteSpeakerLayoutBoxW(cutout);
      if (Math.abs(nextBoxW - boxW) <= 1) return;
      cutout._speakerPortraitWidthRefined = true;
      if (cutout.classList.contains('quote-speaker-cutout--plain-cutout')) {
        this._applyQuoteSpeakerPlainCutoutLayout(cutout, img, nextBoxW);
      } else {
        this._applyQuoteSpeakerCutoutFrameHeight(
          cutout,
          img,
          nextBoxW,
          cutout._speakerOpaqueBounds,
          null
        );
        this._pinQuoteSpeakerSingleLayerOverlays(cutout);
      }
      delete cutout._speakerPortraitWidthRefined;
    }

    /** Final pass: keep layout column at/under 90% of the center name-tape band. */
    _enforceQuoteSpeakerPortraitVisualCap(widget, cutout, img) {
      if (!widget || !cutout || !img?.naturalWidth) return false;
      const identity = widget.querySelector('.quote-speaker-slab--identity');
      const wrap = widget.querySelector('.quote-speaker-portrait-wrap');
      if (!identity || !wrap) return false;
      const innerStripW = this._quoteSpeakerIdentityNameStripWidth(widget, identity);
      if (innerStripW < 48) return false;
      const maxVisualW = innerStripW * this._quoteSpeakerCutoutWidthFrac(widget);
      // Cap the layout column only — subject-fill may paint transparent PNG margins outside.
      const visualW = Math.max(wrap.clientWidth || 0, parseFloat(wrap.style.width) || 0);
      if (visualW <= maxVisualW + 0.5) return false;
      const currentLayoutW = Math.max(1, wrap.clientWidth || parseFloat(wrap.style.width) || 0);
      const nextW = Math.max(48, Math.floor(maxVisualW));
      if (Math.abs(nextW - currentLayoutW) <= 1) return false;
      wrap.style.width = `${nextW}px`;
      wrap.style.maxWidth = `${nextW}px`;
      wrap._speakerPortraitWidthPx = nextW;
      if (cutout.classList.contains('quote-speaker-cutout--plain-cutout')) {
        this._applyQuoteSpeakerPlainCutoutLayout(cutout, img, nextW);
      } else {
        this._applyQuoteSpeakerCutoutFrameHeight(
          cutout,
          img,
          nextW,
          cutout._speakerOpaqueBounds,
          null
        );
        this._pinQuoteSpeakerSingleLayerOverlays(cutout);
      }
      return true;
    }

    _applyQuoteSpeakerIdentityTuck(cutout, wrapRect, cutoutRect) {
      const widget = cutout?.closest('.quote-speaker-widget');
      const identity = widget?.querySelector('.quote-speaker-slab--identity');
      const wrap = cutout?.closest('.quote-speaker-portrait-wrap');
      const wrapH = Math.max(wrap?.offsetHeight || 0, wrapRect?.height || 0);
      if (!identity || cutout?.hidden || wrapH < 1) {
        identity?.style.removeProperty('margin-top');
        return;
      }
      const widgetStyle = widget && typeof getComputedStyle === 'function' ? getComputedStyle(widget) : null;
      const tuckPxRaw = parseFloat(widgetStyle?.getPropertyValue('--quote-speaker-identity-tuck-px') || '');
      const tuckPx = Number.isFinite(tuckPxRaw) ? tuckPxRaw : 14;
      const img = cutout.querySelector('.quote-speaker-image');
      const layoutImg = this._quoteSpeakerLayoutImg(cutout, img);
      const bounds = cutout._speakerSubjectBounds || cutout._speakerOpaqueBounds;
      const offsetY = parseFloat(String(cutout.style.getPropertyValue('--speaker-cutout-pos-y') || '0')) || 0;
      const bgW =
        parseFloat(String(cutout.style.getPropertyValue('--speaker-cutout-bg-w') || '0').replace(/px$/, '')) ||
        0;
      const scale =
        bgW > 0 && layoutImg?.naturalWidth
          ? bgW / Math.max(1, layoutImg.naturalWidth)
          : 0;
      let opaqueBottomLayout;
      if (bounds && scale > 0 && Number.isFinite(Number(bounds.maxY))) {
        opaqueBottomLayout = offsetY + Number(bounds.maxY) * scale;
      } else {
        opaqueBottomLayout = Math.max(cutout.offsetHeight || 0, wrapH);
      }
      // Tilt translateY is visual-only — include it so tuck tracks the painted edge.
      let tiltY = 0;
      const tilt = cutout.closest('.quote-speaker-portrait-tilt');
      if (tilt && typeof getComputedStyle === 'function') {
        const tr = getComputedStyle(tilt).transform;
        if (tr && tr !== 'none') {
          const m = tr.match(/matrix\(([^)]+)\)/);
          if (m) {
            const parts = m[1].split(',').map((v) => parseFloat(v.trim()));
            if (parts.length >= 6 && Number.isFinite(parts[5])) tiltY = parts[5];
          }
        }
      }
      const marginTop = Math.round(opaqueBottomLayout + tiltY - wrapH - tuckPx);
      identity.style.marginTop = `${marginTop}px`;
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
      this._syncQuoteSpeakerNameTuck(cutout, img);
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

    _quoteSpeakerCutoutPaintRect(cutout, img, boxW, boxH, bounds = null) {
      if (cutout?.classList.contains('quote-speaker-cutout--subject-fill')) {
        const readPx = (name, fallback = 0) => {
          const raw = String(cutout.style.getPropertyValue(name) || '').trim();
          const n = parseFloat(raw.replace(/px$/, ''));
          return Number.isFinite(n) ? n : fallback;
        };
        const offsetX = readPx('--speaker-cutout-pos-x');
        const offsetY = readPx('--speaker-cutout-pos-y');
        const drawW = readPx('--speaker-cutout-bg-w', boxW);
        const drawH = readPx('--speaker-cutout-bg-h', boxH);
        const scale = drawW / Math.max(1, img?.naturalWidth || 1);
        return { offsetX, offsetY, drawW, drawH, scale };
      }
      return this._quoteSpeakerImageContainRect(
        img.naturalWidth,
        img.naturalHeight,
        boxW,
        boxH,
        bounds
      );
    }

    _quoteSpeakerSilhouetteRightEdge(img, boxW, boxH, bounds = null, cutout = null) {
      if (!img?.naturalWidth || !img?.naturalHeight) return null;
      const canvas = document.createElement('canvas');
      canvas.width = boxW;
      canvas.height = boxH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      const { offsetX, offsetY, drawW, drawH, scale } = this._quoteSpeakerCutoutPaintRect(
        cutout,
        img,
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

    _quoteSpeakerAttributionNameCardClearancePx(wrap, cutout = null) {
      const identitySlab = document.getElementById('quoteSpeakerIdentitySlab');
      if (!identitySlab || identitySlab.hidden) return 0;
      const anchorEl = cutout || wrap;
      if (!anchorEl) return 0;
      const anchorRect = anchorEl.getBoundingClientRect();
      const slabRect = identitySlab.getBoundingClientRect();
      const gap = 8;
      const overlapPx = anchorRect.bottom - slabRect.top - gap;
      if (!Number.isFinite(overlapPx) || overlapPx <= 0) return 0;
      return Math.min(overlapPx, anchorRect.height * 0.5);
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

    _quoteSpeakerAttributionVisualBottomY(img, boxW, boxH, bounds, cutout) {
      const { offsetY, drawH, scale } = this._quoteSpeakerCutoutPaintRect(
        cutout,
        img,
        boxW,
        boxH,
        bounds
      );
      const isPlain = cutout?.classList.contains('quote-speaker-cutout--plain-cutout');
      const subjectBounds = isPlain ? cutout?._speakerSubjectBounds : null;
      const anchorBounds = isPlain && subjectBounds ? subjectBounds : bounds;
      if (anchorBounds?.maxY != null && Number.isFinite(scale)) {
        return offsetY + anchorBounds.maxY * scale;
      }
      return offsetY + drawH;
    }

    _quoteSpeakerAttributionBottomEdge(edge, img, boxW, boxH, text, fontSize, wrap, bounds = null, cutout = null) {
      if (!edge?.length) return null;
      const resolvedCutout =
        cutout ||
        wrap?.querySelector('.quote-speaker-cutout') ||
        document.getElementById('quoteSpeakerImageWrap');
      const imageBottom = this._quoteSpeakerAttributionVisualBottomY(
        img,
        boxW,
        boxH,
        bounds,
        resolvedCutout
      );
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
      const clearancePx = this._quoteSpeakerAttributionNameCardClearancePx(wrap, resolvedCutout);
      const hugGap = Math.max(2, fontSize * 0.12);
      const maxBottomY = Math.max(
        edge[0].y + neededHeight,
        Math.min(boxH - 1, imageBottom - clearancePx)
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
      const cutout =
        attributionEl.closest('.quote-speaker-cutout') ||
        wrap?.querySelector('.quote-speaker-cutout') ||
        document.getElementById('quoteSpeakerImageWrap');
      const img = cutout?.querySelector('.quote-speaker-image');
      if (cutout && img?.naturalWidth) {
        const boxW = Math.max(1, Math.round(cutout.clientWidth || 0));
        const boxH = Math.max(1, Math.round(cutout.clientHeight || 0));
        const bounds = cutout._speakerSubjectBounds || cutout._speakerOpaqueBounds || null;
        const visualBottom = this._quoteSpeakerAttributionVisualBottomY(img, boxW, boxH, bounds, cutout);
        const bottomInset = Math.max(0, boxH - visualBottom);
        attributionEl.style.setProperty('--quote-speaker-attribution-bottom-inset', `${bottomInset}px`);
      } else {
        attributionEl.style.removeProperty('--quote-speaker-attribution-bottom-inset');
      }
      const portraitWrap = wrap || attributionEl.closest('.quote-speaker-portrait-wrap');
      this._applyQuoteSpeakerAttributionLift(
        attributionEl,
        portraitWrap,
        this._quoteSpeakerAttributionNameCardClearancePx(portraitWrap, cutout)
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
        const bounds = cutout?._speakerSubjectBounds || cutout?._speakerOpaqueBounds || null;
        const edge = this._quoteSpeakerSilhouetteRightEdge(img, boxW, boxH, bounds, cutout);
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
          bounds,
          cutout
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
        attributionEl.style.removeProperty('--quote-speaker-attribution-bottom-inset');

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
        if (widget) this._syncQuoteSpeakerPortraitWidthFromNameStrip(widget);
        if (!attributionEl || attributionEl.hidden) {
          if (cutout && img?.naturalWidth) this._applyQuoteSpeakerCutoutAnchor(cutout, img);
          return;
        }
        if (cutout && img?.naturalWidth) this._applyQuoteSpeakerCutoutAnchor(cutout, img);
        this._scheduleQuoteSpeakerAttributionLayout(attributionEl, img, cutout);
        this._syncQuoteSpeakerNameTuck(cutout, img);
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
      const silent = opts.silent === true;
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
        const cutout = document.getElementById('quoteSpeakerImageWrap');
        const img = cutout?.querySelector('.quote-speaker-image');
        if (cutout && img?.naturalWidth) this._syncQuoteSpeakerNameTuck(cutout, img);
      };
      const runFit = () => {
        try {
          applyFit();
        } catch (_) {
          revealName();
        }
      };

      // Resize/scroll remounts must not blank the name (silent used to do this; wire was lost).
      if (silent) {
        requestAnimationFrame(runFit);
        return;
      }

      /* Hide only on first fit so max font size does not flash before measure. */
      nameEl.style.opacity = '0';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const fonts = typeof document !== 'undefined' ? document.fonts : null;
          if (!fonts || fonts.status === 'loaded' || typeof fonts.ready?.then !== 'function') {
            runFit();
            return;
          }
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            runFit();
          };
          // Cap wait — Google Fonts can leave fonts.ready pending and hide the name for seconds.
          const timer = setTimeout(finish, 120);
          fonts.ready
            .then(() => {
              clearTimeout(timer);
              if (!settled) {
                finish();
                return;
              }
              // Fallback metrics already shown — refine without blanking.
              this.fitQuoteSpeakerNameToOneLine(nameEl, { silent: true });
            })
            .catch(() => {
              clearTimeout(timer);
              finish();
            });
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
          this._syncQuoteSpeakerPortraitWidthFromNameStrip(widget);
          const img = cutout?.querySelector('.quote-speaker-image');
          if (cutout && img?.naturalWidth) {
            this._applyQuoteSpeakerCutoutAnchor(cutout, img);
          }
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
      if (
        cutout?.classList?.contains('quote-speaker-cutout--plain-cutout') &&
        options.forcePopArt !== true
      ) {
        return;
      }
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
      const wantsPopArtStack = this._quoteSpeakerWantsFirebasePopArt(null, null);
      const isSpeakerCutout =
        (options.forcePopArt === true && this._quoteSpeakerPopArtEnabled()) ||
        (cutout.classList.contains('quote-speaker-cutout--single-layer') && wantsPopArtStack) ||
        wantsPopArtStack;
      if (wantsPopArtStack) {
        cutout.classList.add('quote-speaker-cutout--single-layer');
      } else {
        cutout.classList.remove('quote-speaker-cutout--single-layer');
      }
      if (isSpeakerCutout && SCR.applySpeakerCutoutPlanToCutout) {
        SCR.applySpeakerCutoutPlanToCutout(cutout, plan);
        if (cutout.classList.contains('quote-speaker-cutout--baked-storage')) {
          const contourEl = cutout.querySelector('.quote-speaker-contour');
          if (contourEl) {
            contourEl.hidden = true;
            contourEl.setAttribute('hidden', '');
          }
        }
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
      if (colorWash) colorWash.hidden = true;
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
      this._ensureQuoteSpeakerPlainCutoutPaperShell(cutout, neutralSilhouette);
      const portraitImg = cutout?.querySelector?.('.quote-speaker-image');
      const remote = String(cutout?._plainCutoutSourceUrl || '').trim();
      if (portraitImg) {
        delete portraitImg.dataset.plainCutoutComposite;
        if (remote) portraitImg.src = remote;
        portraitImg.hidden = false;
        portraitImg.style.opacity = '1';
        portraitImg.classList.add('is-loaded');
      }
    }

    /** Sync pale-quilt paper color vars only — no full-rect fill (quilt shows through). */
    _ensureQuoteSpeakerPlainCutoutPaperShell(cutout, neutralSilhouette = null) {
      if (!cutout) return null;
      const widget = document.getElementById('quoteSpeakerWidget');
      const paper = this.getPaleQuiltPaperColor?.() || '#f2eee6';
      if (widget) widget.style.setProperty('--speaker-cutout-paper-color', paper);
      cutout.style.setProperty('--speaker-cutout-paper-color', paper);
      cutout.classList.add('quote-speaker-cutout--paper-backed');
      const neutral =
        neutralSilhouette || document.getElementById('quoteSpeakerNeutralSilhouette');
      if (neutral) {
        neutral.hidden = true;
        neutral.setAttribute('hidden', '');
        neutral.classList.remove('quote-speaker-cutout-backing--filled');
        delete neutral.dataset.plainCutoutPaper;
        neutral.style.removeProperty('background-color');
        neutral.style.removeProperty('background-image');
      }
      return { paper, neutralSilhouette: neutral };
    }

    _ensureQuoteSpeakerPlainCutoutLayersHidden(cutout) {
      if (!cutout) return;
      cutout.classList.remove('quote-speaker-cutout--paper-shapes', 'quote-speaker-cutout--single-layer');
      const hide = (sel) => {
        const el = cutout.querySelector(sel);
        if (el) el.hidden = true;
      };
      hide('.quote-speaker-neutral-silhouette');
      hide('.quote-speaker-color-wash');
      hide('.quote-speaker-paper-layer');
      hide('.quote-speaker-paper-shape--backdrop');
      hide('.quote-speaker-contour');
      const grain = cutout.querySelector('.quote-speaker-xerox-grain');
      if (grain) {
        grain.hidden = false;
        grain.removeAttribute('hidden');
      }
      const scannerBed = cutout.querySelector('.odq-scanner-bed');
      if (scannerBed) scannerBed.hidden = true;
    }

    _quoteSpeakerPlainCutoutSourceImg(cutout, img) {
      if (cutout?._plainCutoutSourceImage?.naturalWidth) return cutout._plainCutoutSourceImage;
      const portraitImg = cutout?.querySelector?.('.quote-speaker-image');
      const paintSrc = String(portraitImg?.currentSrc || portraitImg?.src || img?.currentSrc || img?.src || '').trim();
      if (/^data:image\//i.test(paintSrc)) {
        return cutout._plainCutoutSourceImage || img;
      }
      return img?.naturalWidth ? img : cutout._plainCutoutSourceImage || img;
    }

    /** Card must be measured before baking — width-fill at 168×200 squashes landscape cutouts. */
    _resolveQuoteSpeakerPlainCutoutBakeLayout(cutout, sourceImg) {
      if (!cutout || !sourceImg?.naturalWidth) return null;
      const wrap = cutout.closest('.quote-speaker-portrait-wrap');
      const boxW = this._quoteSpeakerLayoutBoxW(cutout);
      if (boxW < 48) return null;

      let subjectCrop = cutout._speakerSubjectCrop || cutout._speakerSubjectBounds || null;
      const boundsSig = `${sourceImg.naturalWidth}x${sourceImg.naturalHeight}:${String(
        sourceImg.currentSrc || sourceImg.src || cutout._plainCutoutSourceUrl || ''
      ).trim()}`;
      if (cutout._speakerSubjectBoundsSig !== boundsSig) {
        subjectCrop = null;
        cutout._speakerSubjectBounds = null;
        cutout._speakerSubjectCrop = null;
        cutout._speakerOpaqueBounds = null;
        cutout._speakerSubjectBoundsSig = boundsSig;
      }
      if (!subjectCrop?.width) {
        const subjectBounds = this._quoteSpeakerMeasureSubjectBounds(sourceImg);
        if (subjectBounds?.width > 0) {
          subjectCrop = subjectBounds;
          cutout._speakerSubjectBounds = subjectBounds;
          cutout._speakerSubjectCrop = subjectBounds;
        }
      }

      let drawW;
      let drawH;
      if (subjectCrop?.width > 0) {
        const framed = this._quoteSpeakerCutoutSubjectFraming(
          sourceImg.naturalWidth,
          sourceImg.naturalHeight,
          boxW,
          subjectCrop
        );
        drawW = boxW;
        drawH = framed.drawH;
      } else {
        const iw = Math.max(1, sourceImg.naturalWidth);
        const ih = Math.max(1, sourceImg.naturalHeight);
        const frameH = Math.max(
          120,
          Math.ceil(this._quoteSpeakerCutoutFrameHeight(iw, ih, boxW) + 8)
        );
        const scale = Math.min(boxW / iw, frameH / ih);
        drawW = Math.max(1, Math.round(iw * scale));
        drawH = Math.max(1, Math.round(ih * scale));
      }

      if (drawH < 48) return null;

      cutout._speakerTuckAnchorSig = `${sourceImg.naturalWidth}x${sourceImg.naturalHeight}:${boxW}`;
      this._applyQuoteSpeakerCutoutAnchor(cutout, sourceImg);

      if (subjectCrop?.width > 0) {
        return {
          drawW,
          drawH,
          compositeLayout: 'subject-fill',
          subjectCrop
        };
      }

      return {
        drawW,
        drawH,
        compositeLayout: 'contain',
        subjectCrop: null
      };
    }

    _scheduleQuoteSpeakerPlainCutoutBackingRetry(cutout, img, sourceUrl = '', attempt = 0) {
      if (!cutout || cutout.hidden || attempt >= 16) return;
      if (cutout._plainCutoutLayoutRetryTimer) return;
      cutout._plainCutoutLayoutRetryTimer = requestAnimationFrame(() => {
        cutout._plainCutoutLayoutRetryTimer = 0;
        if (cutout.hidden) return;
        const sourceImg = this._quoteSpeakerPlainCutoutSourceImg(cutout, img);
        if (this._resolveQuoteSpeakerPlainCutoutBakeLayout(cutout, sourceImg)) {
          this._applyQuoteSpeakerPlainCutoutBacking(cutout, img, sourceUrl);
          return;
        }
        this._scheduleQuoteSpeakerPlainCutoutBackingRetry(cutout, img, sourceUrl, attempt + 1);
      });
    }

    _applyQuoteSpeakerPlainCutoutBacking(cutout, img, sourceUrl = '') {
      if (!cutout || cutout.hidden || !img?.naturalWidth) return;
      this._ensureQuoteSpeakerPlainCutoutLayersHidden(cutout);
      const neutralSilhouette = document.getElementById('quoteSpeakerNeutralSilhouette');
      const shell = this._ensureQuoteSpeakerPlainCutoutPaperShell(cutout, neutralSilhouette);
      const portraitImg = cutout.querySelector('.quote-speaker-image') || img;
      const sourceImg = this._quoteSpeakerPlainCutoutSourceImg(cutout, img);
      const boxW = this._quoteSpeakerLayoutBoxW(cutout);
      const bakeLayout = this._resolveQuoteSpeakerPlainCutoutBakeLayout(cutout, sourceImg);
      const layoutSig = this._quoteSpeakerPlainCutoutLayoutSig(cutout, sourceImg, boxW);
      const paper = shell?.paper || this.getPaleQuiltPaperColor?.() || '#f2eee6';

      const remote = String(
        sourceUrl ||
          cutout._plainCutoutSourceUrl ||
          portraitImg.currentSrc ||
          portraitImg.src ||
          ''
      ).trim();
      if (remote) {
        cutout._plainCutoutSourceUrl = remote;
      }

      const paperSig = `${layoutSig}|${paper}|plain-direct-v2`;
      const directReady =
        portraitImg?.dataset?.plainCutoutDirect === '1' &&
        portraitImg.complete &&
        portraitImg.naturalWidth > 0;
      if (cutout._plainCutoutPaperSig === paperSig && directReady) return;

      if (!bakeLayout) {
        if (portraitImg && remote) {
          portraitImg.hidden = false;
          portraitImg.classList.add('is-loaded');
          if (portraitImg.src !== remote) portraitImg.src = remote;
        }
        this._scheduleQuoteSpeakerPlainCutoutBackingRetry(cutout, img, sourceUrl);
        return;
      }

      const prevPaperSig = cutout._plainCutoutPaperSig || '';
      cutout._plainCutoutPaperSig = paperSig;
      const paperGen = (cutout._plainCutoutPaperGen = (cutout._plainCutoutPaperGen || 0) + 1);

      if (portraitImg && prevPaperSig !== paperSig) {
        delete portraitImg.dataset.plainCutoutComposite;
        delete portraitImg.dataset.plainCutoutDirect;
        cutout.classList.remove('quote-speaker-cutout--plain-composite');
      }
      if (portraitImg) {
        portraitImg.hidden = false;
        portraitImg.classList.add('is-loaded');
      }
      cutout.style.setProperty('--speaker-image-url', 'none');

      const resolveSourceImg = async () => {
        let loadUrl = String(cutout._plainCutoutSourceUrl || remote || '').trim();
        if (!loadUrl) {
          if (img?.naturalWidth) return img;
          if (portraitImg?.naturalWidth) return portraitImg;
          return null;
        }
        if (
          cutout._plainCutoutSourceImage?.naturalWidth &&
          this._quoteSpeakerImageUrlsMatch(cutout._plainCutoutSourceImage._loadedUrl, loadUrl)
        ) {
          return cutout._plainCutoutSourceImage;
        }
        if (portraitImg?.naturalWidth) {
          const portraitSrc = String(portraitImg.currentSrc || portraitImg.src || '').trim();
          if (this._quoteSpeakerImageUrlsMatch(portraitSrc, loadUrl)) {
            cutout._plainCutoutSourceImage = portraitImg;
            cutout._plainCutoutSourceImage._loadedUrl = loadUrl;
            return portraitImg;
          }
        }
        if (img?.naturalWidth && img !== portraitImg) {
          const imgSrc = String(img.currentSrc || img.src || '').trim();
          if (this._quoteSpeakerImageUrlsMatch(imgSrc, loadUrl)) {
            cutout._plainCutoutSourceImage = img;
            cutout._plainCutoutSourceImage._loadedUrl = loadUrl;
            return img;
          }
        }
        const decoded = await this._loadQuoteSpeakerImageElement(loadUrl);
        if (decoded?.naturalWidth) {
          decoded._loadedUrl = loadUrl;
          cutout._plainCutoutSourceImage = decoded;
          return decoded;
        }
        return null;
      };

      const applyDirectCutoutDisplay = async (sourceImg) => {
        if (paperGen !== cutout._plainCutoutPaperGen || cutout.hidden || !portraitImg) return;
        const srcImg =
          sourceImg ||
          (portraitImg?.naturalWidth ? portraitImg : null) ||
          (img?.naturalWidth ? img : null);
        if (!srcImg?.naturalWidth) {
          this._showQuoteSpeakerPlainCutoutFallback(cutout, portraitImg);
          return;
        }
        if (portraitImg.dataset.plainCutoutDirect === '1' && portraitImg.naturalWidth) {
          portraitImg.style.removeProperty('opacity');
          this._applyQuoteSpeakerPlainCutoutLayout(cutout, srcImg || portraitImg);
          this._syncQuoteSpeakerNameTuck(cutout, srcImg || portraitImg);
          return;
        }
        this._applyQuoteSpeakerPlainCutoutDirectDisplay(cutout, portraitImg);
        if (neutralSilhouette) {
          neutralSilhouette.hidden = true;
          neutralSilhouette.setAttribute('hidden', '');
        }
        requestAnimationFrame(() => {
          if (!cutout.hidden && portraitImg?.naturalWidth) {
            const layoutSource = this._quoteSpeakerPlainCutoutSourceImg(cutout, srcImg) || srcImg;
            if (layoutSource?.naturalWidth) {
              this._applyQuoteSpeakerCutoutAnchor(cutout, layoutSource);
            }
          }
        });
      };

      void resolveSourceImg()
        .then((sourceImg) => applyDirectCutoutDisplay(sourceImg))
        .catch(() => {
          this._showQuoteSpeakerPlainCutoutFallback(cutout, portraitImg);
        });
    }

    _applyQuoteSpeakerPlainCutoutStack(cutout, img) {
      if (!cutout || cutout.hidden || !img?.naturalWidth) return;
      this._ensureQuoteSpeakerPlainCutoutLayersHidden(cutout);
      cutout.classList.add('quote-speaker-cutout--loaded', 'quote-speaker-cutout--plain-cutout');
      this._ensureQuoteSpeakerPlainCutoutPaperShell(cutout);
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
      this._applyQuoteSpeakerPlainCutoutWidgetDisplay(cutout, img, cutout._plainCutoutSourceUrl);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cutout.hidden && img?.naturalWidth) {
            this._syncQuoteSpeakerNameTuck(cutout, img);
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
      if (/^data:/i.test(display) && this._quoteSpeakerShouldStripFringe(remote)) return display;
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
        imageWrap.classList.toggle('quote-speaker-cutout--baked-storage', isSpeakerCutout);
        imageWrap.classList.toggle('quote-speaker-cutout--img-paint', useDataUrlPaint);
        if (!usePlainCutout) imageWrap.classList.remove('quote-speaker-cutout--plain-cutout');
        imageWrap.style.setProperty('--speaker-image-url', speakerImageCssUrl);
      }
      if (neutralSilhouette) {
        neutralSilhouette.hidden = useDataUrlPaint || isSpeakerCutout;
      }
      const cutoutMat = document.getElementById('quoteSpeakerCutoutMat');
      if (cutoutMat) cutoutMat.hidden = usePopArtStack || useDataUrlPaint || usePlainCutout;
      if (colorWash) {
        colorWash.hidden = true;
      }
      if (img) {
        const displaySrc = String(displayUrl || cssPaintUrl).trim();
        if (usePlainCutout && imageWrap) {
          imageWrap._plainCutoutSourceUrl = String(displaySrc || remoteUrlForCss || cutoutSourceUrl || '').trim();
          imageWrap._plainCutoutSourceImage = null;
          this._ensureQuoteSpeakerPlainCutoutPaperShell(imageWrap, neutralSilhouette);
          imageWrap.classList.toggle(
            'quote-speaker-cutout--plain-fallback',
            this._quoteSpeakerCanvasPipelineBlocked()
          );
        }
        if (/^https?:\/\//i.test(displaySrc)) {
          this._applyQuoteSpeakerImageCrossOrigin(img, displaySrc);
        } else {
          img.removeAttribute('crossorigin');
        }
        delete img.dataset.cutoutNoCorsRetry;
        delete img.dataset.cutoutProxyRetry;
        delete img.dataset.plainCutoutComposite;
        delete img.dataset.plainCutoutDirect;
        if (usePlainCutout) {
          imageWrap?.classList.remove('quote-speaker-cutout--plain-composite');
          img.style.opacity = '0';
        } else {
          img.style.opacity = '1';
        }
        const syncLoadedSpeakerImage = () => {
          if (imageWrap) this._syncQuoteSpeakerCutoutLayout(imageWrap, img, sourceQuote);
          this.scheduleLayoutBStoryPreviewRefreshAfterSpeaker?.(paintUrl);
        };
        img.onload = () => {
          syncLoadedSpeakerImage();
          requestAnimationFrame(() => syncLoadedSpeakerImage());
        };
        img.onerror = () => {
          const failedSrc = String(img.currentSrc || img.src || displaySrc || '').trim();
          if (
            !img.dataset.cutoutNoCorsRetry &&
            this._quoteSpeakerShouldStripFringe(failedSrc)
          ) {
            img.dataset.cutoutNoCorsRetry = '1';
            img.removeAttribute('crossorigin');
            img.src = failedSrc;
            return;
          }
          if (
            !img.dataset.cutoutProxyRetry &&
            this._quoteSpeakerShouldStripFringe(failedSrc) &&
            this.archiveService?._prepareSpeakerImageUrlForCanvas
          ) {
            img.dataset.cutoutProxyRetry = '1';
            void this.archiveService
              ._prepareSpeakerImageUrlForCanvas(failedSrc, {
                quote: sourceQuote,
                retry: true,
                skipCutoutExportFinalize: true
              })
              .then((proxied) => {
                const next = String(proxied || '').trim();
                if (!next || next === failedSrc) {
                  img.onerror?.();
                  return;
                }
                this._applyQuoteSpeakerImageCrossOrigin(img, next);
                img.src = next;
              })
              .catch(() => img.onerror?.());
            return;
          }
          const fallbackSrc = String(profile?.portraitUrl || '').trim();
          if (
            fallbackSrc &&
            !this._quoteSpeakerImageUrlsMatch(failedSrc, fallbackSrc) &&
            /^https?:/i.test(fallbackSrc)
          ) {
            imageWrap?.classList.remove(
              'quote-speaker-cutout--plain-cutout',
              'quote-speaker-cutout--plain-fallback'
            );
            img.style.opacity = '1';
            img.src = fallbackSrc;
            return;
          }
          this._showQuoteSpeakerAvatarFallback(imageWrap, img, neutralSilhouette, colorWash, avatar);
        };
        img.src = displaySrc;
        img.hidden = false;
        img.classList.toggle('is-loaded', usePopArtStack || usePlainCutout || useDataUrlPaint);
        if (img.complete && img.naturalWidth > 0) {
          requestAnimationFrame(() => syncLoadedSpeakerImage());
        }
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
          'quote-speaker-cutout--plain-cutout',
          'quote-speaker-cutout--subject-fill'
        );
        imageWrap.style.removeProperty('--speaker-image-url');
        imageWrap.style.removeProperty('--speaker-cutout-pos-y');
        imageWrap.style.removeProperty('--speaker-cutout-pos-x');
        imageWrap.style.removeProperty('--speaker-cutout-bg-w');
        imageWrap.style.removeProperty('--speaker-cutout-bg-h');
        imageWrap.style.removeProperty('height');
        imageWrap._speakerOpaqueBounds = null;
        imageWrap._speakerSubjectBounds = null;
        delete imageWrap._speakerSubjectCrop;
        imageWrap._plainCutoutSourceUrl = '';
        imageWrap._plainCutoutSourceImage = null;
        this._clearQuoteSpeakerSingleLayerOverlayPins(imageWrap);
      }
      document.getElementById('quoteSpeakerIdentitySlab')?.style.removeProperty('margin-top');
      if (img) {
        img.hidden = true;
        img.classList.remove('is-loaded');
        delete img.dataset.plainCutoutComposite;
        delete img.dataset.plainCutoutDirect;
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
      if (!quote && this._seamsidePreviewActive && this._seamsidePreviewQuote) {
        quote = this._seamsidePreviewQuote;
      }
      if (this.isAdminTomorrowPreviewActive?.() && !this.getEffectiveQuiltQuote?.()?.text) {
        return;
      }
      if (this._quoteSpeakerRefreshTimer) clearTimeout(this._quoteSpeakerRefreshTimer);
      this._quoteSpeakerRefreshTimer = setTimeout(() => {
        this._quoteSpeakerRefreshTimer = null;
        const resolved =
          this.isAdminTomorrowPreviewActive?.()
            ? this.getEffectiveQuiltQuote?.() || quote
            : quote;
        void this._refreshQuoteSpeakerWidgetEntry(resolved);
      }, 100);
    }

    refreshSeamsidePodcastWidget(quote = null) {
      if (!quote && this._seamsidePreviewActive && this._seamsidePreviewQuote) {
        quote = this._seamsidePreviewQuote;
      }
      void this._refreshSeamsidePodcastWidgetEntry(quote);
    }

    _isSeamsidePodcastWidgetVisible() {
      const host = document.getElementById('seamsidePodcastWidget');
      return !!(host && !host.hidden);
    }

    async _refreshSeamsidePodcastWidgetEntry(quote = null) {
      const host = document.getElementById('seamsidePodcastWidget');
      const widget = globalThis.SeamsidePodcastWidget;
      if (!host || !widget || typeof widget.refresh !== 'function') return;
      await this.quoteService?.ensureSeamsideEpisodesLoaded?.({ requireServer: false });
      const resolvedQuote =
        quote ||
        this.getEffectiveQuiltQuote?.() ||
        this.quoteService?.getTodayQuote?.() ||
        null;
      widget.refresh(host, resolvedQuote, this.quoteService);
      if (host && !host.hidden) {
        const stage = document.getElementById('quoteSpeakerStage');
        stage?.classList?.add?.('quote-speaker-stage--visible');
        this._scrollSeamsidePodcastWidgetIntoView?.(host);
      }
    }

    _scrollSeamsidePodcastWidgetIntoView(host, { flashPreview = false } = {}) {
      if (!host || host.hidden) return;
      const screen = document.getElementById('screen-quilt');
      if (screen) {
        const hostTop =
          host.getBoundingClientRect().top -
          screen.getBoundingClientRect().top +
          screen.scrollTop;
        screen.scrollTo({
          top: Math.max(0, hostTop - screen.clientHeight * 0.22),
          behavior: 'smooth'
        });
      } else {
        host.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }
      if (!flashPreview) return;
      host.classList.add('seamside-podcast-widget-host--preview-flash');
      window.setTimeout(() => {
        host.classList.remove('seamside-podcast-widget-host--preview-flash');
      }, 3200);
    }

    /** Dev/preview: ?previewSeamside=1 or ?previewSeamside=Demetri+Broxton */
    _getSeamsidePreviewAuthorFromQuery() {
      try {
        const params = new URLSearchParams(window.location.search || '');
        const raw = String(
          params.get('previewSeamside') ?? params.get('seamsidePreview') ?? ''
        ).trim();
        if (!raw || raw === '0' || raw === 'false') return null;
        if (raw === '1' || raw === 'true' || raw === 'yes') return 'Demetri Broxton';
        return decodeURIComponent(raw.replace(/\+/g, ' '));
      } catch (_) {
        return null;
      }
    }

    _buildSeamsidePreviewQuote(authorName = 'Demetri Broxton') {
      const author = String(authorName || 'Demetri Broxton').trim();
      const formattedAuthor = author.startsWith('—') ? author : `— ${author}`;
      const episode = this.quoteService?.lookupSeamsideEpisodeForAuthor?.(formattedAuthor);
      const portraitUrl = String(
        episode?.episodeImageUrl ?? episode?.episode_image_url ?? ''
      ).trim();
      return {
        text: 'SEAMSIDE preview — one color changes the whole quilt.',
        author: formattedAuthor,
        submitted_via: 'SEAMSIDE',
        speaker_guide_line:
          'Makes mixed-media work about heritage, identity, and how objects carry memory',
        speaker_keywords: 'heritage, identity, memory',
        ...(portraitUrl ? { speaker_image_url: portraitUrl, speakerImageUrl: portraitUrl } : {})
      };
    }

    _maybeRunSeamsidePreviewFromQuery() {
      const author = this._getSeamsidePreviewAuthorFromQuery();
      if (!author) return;
      window.setTimeout(() => {
        void this.previewSeamsideSpeakerChrome(author);
      }, 600);
    }

    /** Console/URL preview: speaker bio + learn-more link + podcast player together. */
    async previewSeamsideSpeakerChrome(authorName = 'Demetri Broxton') {
      const author = String(authorName || 'Demetri Broxton').trim();
      this._seamsidePreviewActive = true;
      this._liveDailyDataConfirmed = true;
      await this.quoteService?.ensureSeamsideEpisodesLoaded?.({ requireServer: false });
      const previewQuote = this._buildSeamsidePreviewQuote(author);
      this._seamsidePreviewQuote = previewQuote;
      this.uiService?.showScreen?.('screen-quilt');
      await this._refreshQuoteSpeakerWidgetEntry(previewQuote);
      await this._refreshSeamsidePodcastWidgetEntry(previewQuote);
      const host = document.getElementById('seamsidePodcastWidget');
      const profile = this.getQuoteSpeakerProfile?.(previewQuote);
      if (host?.hidden) {
        console.warn(
          '[SEAMSIDE preview] player hidden — episodes loaded:',
          this.quoteService?._seamsideEpisodes?.length || 0,
          'lookup:',
          !!this.quoteService?.lookupSeamsideEpisodeForAuthor?.(author)
        );
      }
      if (host && !host.hidden) {
        this._scrollSeamsidePodcastWidgetIntoView(host, { flashPreview: true });
      } else {
        document.getElementById('quoteSpeakerStage')?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'center'
        });
      }
      console.info('[SEAMSIDE preview]', {
        author,
        playerVisible: !host?.hidden,
        learnMoreLink: profile?.speakerLink || '(none — add speaker_link in SEAMSIDE > ODQ and sync)'
      });
      return true;
    }

    /** @deprecated Use previewSeamsideSpeakerChrome — kept for console callers. */
    async previewSeamsidePodcastWidget(authorName = 'Demetri Broxton') {
      return this.previewSeamsideSpeakerChrome(authorName);
    }

    async _refreshQuoteSpeakerWidgetEntry(quote = null) {
      let resolvedQuote = null;
      if (this.isAdminTomorrowPreviewActive?.()) {
        const dk = this.getEffectiveAppDateKey?.() || '';
        resolvedQuote = this.getEffectiveQuiltQuote?.() || quote || null;
        if (!resolvedQuote?.text) return;
        if (dk && this.quoteService) {
          let merged = { ...resolvedQuote };
          merged =
            (await this.quoteService._mergeSpeakerFieldsFromFirestoreSource(dk, merged)) || merged;
          merged =
            (await this.quoteService.hydrateSpeakerCutoutFieldsForCalendarKey(dk, merged)) ||
            merged;
          merged =
            (await this.quoteService.hydrateSpeakerGuideFieldsForCalendarKey(dk, merged)) ||
            merged;
          merged._pinResolution =
            String(this._adminPreview?.resolution || merged._pinResolution || '').trim() ||
            merged._pinResolution;
          if (this._adminPreview) {
            this._adminPreview.quote = merged;
          }
          this.quoteService._pinnedByDateKey[dk] = merged;
          resolvedQuote = merged;
        }
      } else {
        const dk = this.getEffectiveAppDateKey?.() || this.quoteService?.getQuoteCalendarKeyNow?.() || '';
        resolvedQuote =
          quote || this.getEffectiveQuiltQuote?.() || this.quoteService?.getTodayQuote?.() || null;
        if (resolvedQuote?.text && dk && this.quoteService) {
          const isNativeSpeakerHydrate =
            typeof window !== 'undefined' &&
            typeof window.odqIsCapacitorNative === 'function' &&
            window.odqIsCapacitorNative();
          const hasUsableSpeakerImage =
            !!String(
              resolvedQuote?.speakerCutoutUrl ??
                resolvedQuote?.speaker_cutout_url ??
                resolvedQuote?.speakerImageUrl ??
                resolvedQuote?.speaker_image_url ??
                ''
            ).trim();
          if (isNativeSpeakerHydrate && hasUsableSpeakerImage) {
            void this.quoteService
              ._mergeSpeakerFieldsFromFirestoreSource(dk, resolvedQuote)
              .then((merged) => {
                if (merged?.text) {
                  this.quoteService._pinnedByDateKey[dk] = merged;
                  this._refreshQuoteSpeakerWidgetNow(merged);
                }
              })
              .catch(() => {});
          } else {
            resolvedQuote =
              (await this.quoteService._mergeSpeakerFieldsFromFirestoreSource(dk, resolvedQuote)) ||
              resolvedQuote;
          }
          if (isNativeSpeakerHydrate && hasUsableSpeakerImage) {
            void this.quoteService
              .hydrateSpeakerCutoutFieldsForCalendarKey(dk, resolvedQuote)
              .then((merged) => {
                if (merged?.text) {
                  this.quoteService._pinnedByDateKey[dk] = merged;
                  this._refreshQuoteSpeakerWidgetNow(merged);
                }
              })
              .catch(() => {});
          } else {
            resolvedQuote =
              (await this.quoteService.hydrateSpeakerCutoutFieldsForCalendarKey(dk, resolvedQuote)) ||
              resolvedQuote;
          }
        }
      }
      if (resolvedQuote?.text && this.quoteService?.isSeamsideQuote?.(resolvedQuote)) {
        await this.quoteService.ensureSeamsideEpisodesLoaded?.({ requireServer: false });
      }
      this._refreshQuoteSpeakerWidgetNow(resolvedQuote);
    }

    _refreshQuoteSpeakerWidgetNow(quote = null) {
      this._preserveQuiltScrollThroughLayout(() => this._refreshQuoteSpeakerWidgetNowInner(quote));
    }

    /**
     * Builds the birthday-placement sparkle dots once per element lifetime (guarded by
     * childElementCount so repeat widget refreshes don't rebuild/rescatter them). Scattered in
     * a halo band around the cutout rather than across it, so they surround the speaker instead
     * of overlapping their face.
     */
    _ensureQuoteSpeakerGlitterSparkles(glitterEl) {
      if (!glitterEl || glitterEl.childElementCount) return;
      const COUNT = 68;
      const COLORS = ['#ffffff', '#f7f7f7', '#ececec'];
      const frag = document.createDocumentFragment();
      for (let i = 0; i < COUNT; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 26 + Math.random() * 22;
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        const el = document.createElement('span');
        el.className = 'quote-speaker-sparkle';
        el.style.setProperty('--sx', `${x.toFixed(1)}%`);
        el.style.setProperty('--sy', `${y.toFixed(1)}%`);
        el.style.setProperty('--sd', `${(Math.random() * 1).toFixed(2)}s`);
        el.style.setProperty('--sdur', `${(0.6 + Math.random() * 0.5).toFixed(2)}s`);
        el.style.setProperty('--scolor', COLORS[Math.floor(Math.random() * COLORS.length)]);
        frag.appendChild(el);
      }
      glitterEl.appendChild(frag);
    }

    /**
     * Dedicated live listener for `dailyQuoteAssignments/{dateKey}.isBirthdayPlacement`, wired
     * directly to a widget refresh — deliberately independent of the general quote-pin/hydration
     * pipeline. That pipeline has several distinct resolution paths (launch, background catalog
     * sync, resolveAndPinCalendarKey, admin preview...), each with its own narrow field-copying
     * logic that doesn't know about this flag; threading it through all of them individually
     * proved fragile (the hat/glitter would silently vanish whenever a re-pin used a path that
     * didn't carry the flag forward). A standalone listener sidesteps that entirely: whatever the
     * pipeline is doing with the rest of the quote object, this always reflects the live Firestore
     * value and repaints the widget the moment it changes.
     */
    _watchBirthdayPlacementForDateKey(dateKey) {
      const dk = String(dateKey || '').trim();
      if (!dk) return;
      if (!window.db || !window.firestore?.doc || typeof window.firestore.onSnapshot !== 'function') return;
      if (this._birthdayPlacementListenerKey === dk && this._birthdayPlacementListenerUnsub) return;
      if (typeof this._birthdayPlacementListenerUnsub === 'function') {
        try {
          this._birthdayPlacementListenerUnsub();
        } catch (_) {
          /* ignore */
        }
      }
      this._birthdayPlacementListenerKey = dk;
      const ref = window.firestore.doc(window.db, 'dailyQuoteAssignments', dk);
      this._birthdayPlacementListenerUnsub = window.firestore.onSnapshot(
        ref,
        (snap) => {
          const isBirthday = !!(snap.exists() && snap.data()?.isBirthdayPlacement);
          if (this.quoteService) {
            if (this.quoteService._devForceBirthdayDateKeys?.has?.(dk)) {
              this.quoteService._birthdayPlacementByDateKey[dk] = true;
            } else {
              this.quoteService._birthdayPlacementByDateKey[dk] = isBirthday;
            }
          }
          this._refreshQuoteSpeakerWidgetNow();
        },
        (error) => {
          this.logger?.warn?.('Birthday placement listener error:', error?.message || error);
        }
      );
    }

    _refreshQuoteSpeakerWidgetNowInner(quote = null) {
      const widget = document.getElementById('quoteSpeakerWidget');
      if (!widget) return;
      const resolvedQuote =
        (this.isAdminTomorrowPreviewActive?.()
          ? this.getEffectiveQuiltQuote?.()
          : null) ||
        quote ||
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
      const confettiEl = document.getElementById('quoteSpeakerBirthdayConfetti');
      const glitterEl = document.getElementById('quoteSpeakerGlitter');
      const birthdayCaptionEl = document.getElementById('quoteSpeakerBirthdayCaption');
      if (!profile) {
        widget.hidden = true;
        widget.classList.remove('quote-speaker-widget--no-image');
        widget.dataset.handCutDateKey = '';
        if (imageWrap) {
          imageWrap.style.removeProperty('clip-path');
          imageWrap.style.removeProperty('-webkit-clip-path');
          delete imageWrap._speakerTuckAnchorSig;
        }
        const portraitWrap = widget.querySelector('.quote-speaker-portrait-wrap');
        if (portraitWrap) {
          portraitWrap.style.removeProperty('width');
          portraitWrap.style.removeProperty('max-width');
          delete portraitWrap._speakerPortraitWidthPx;
        }
        if (stage && !this._isSeamsidePodcastWidgetVisible?.()) {
          stage.classList.remove('quote-speaker-stage--visible');
        }
        if (confettiEl) confettiEl.hidden = true;
        if (glitterEl) glitterEl.hidden = true;
        if (birthdayCaptionEl) birthdayCaptionEl.hidden = true;
        this._quoteSpeakerLastFitName = null;
        return;
      }

      const showSpeakerImage =
        this.quoteHasSpeakerImageAttribute(resolvedQuote) && !!profile.imageUrl;

      if (stage) stage.classList.add('quote-speaker-stage--visible');
      widget.hidden = false;
      widget.classList.toggle('quote-speaker-widget--no-image', !showSpeakerImage);
      if (confettiEl || glitterEl || birthdayCaptionEl) {
        const birthdayDateKey = this.getEffectiveAppDateKey?.() || this.quoteService?.getQuoteCalendarKeyNow?.();
        this._watchBirthdayPlacementForDateKey(birthdayDateKey);
        const isBirthday =
          showSpeakerImage &&
          !!this.quoteService?.isBirthdayPlacementForDateKey?.(birthdayDateKey);
        if (confettiEl) confettiEl.hidden = !isBirthday;
        if (glitterEl) {
          if (isBirthday) this._ensureQuoteSpeakerGlitterSparkles(glitterEl);
          glitterEl.hidden = !isBirthday;
        }
        if (birthdayCaptionEl) birthdayCaptionEl.hidden = !isBirthday;
      }
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
        this._syncQuoteSpeakerPortraitWidthFromNameStrip(widget);
      }
      if (datesEl) {
        datesEl.textContent = profile.dates;
        datesEl.hidden = !profile.dates;
      }
      if (guideEl) {
        const guideText = String(profile.guideLine || '').trim();
        const showSeamsideLearnMore = this._shouldShowSeamsideSpeakerGuideLearnMore(
          resolvedQuote,
          profile
        );
        guideEl.querySelector('.quote-speaker-guide__learn-more')?.remove();
        if (guideText && globalThis.SpeakerGuideMarker?.applySpeakerGuideMarker) {
          globalThis.SpeakerGuideMarker.applySpeakerGuideMarker(
            guideEl,
            guideText,
            profile.speakerKeywords
          );
        } else {
          guideEl.textContent = guideText;
        }
        const learnMoreAdded = this._appendSeamsideSpeakerGuideLearnMoreLink(
          guideEl,
          resolvedQuote,
          profile
        );
        guideEl.hidden = !guideText && !learnMoreAdded;
        if (bioSlab) bioSlab.hidden = !guideText && !showSeamsideLearnMore;
      } else if (bioSlab) {
        bioSlab.hidden =
          !String(profile.guideLine || '').trim() &&
          !this._shouldShowSeamsideSpeakerGuideLearnMore(resolvedQuote, profile);
      }
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
          const plain = imageWrap.classList.contains('quote-speaker-cutout--plain-cutout');
          const paperBacked = imageWrap.classList.contains('quote-speaker-cutout--paper-backed');
          neutralSilhouette.hidden =
            imageWrap.classList.contains('quote-speaker-cutout--single-layer') || (plain && !paperBacked);
        }
        const cutoutMat = document.getElementById('quoteSpeakerCutoutMat');
        if (cutoutMat) {
          cutoutMat.hidden =
            imageWrap.classList.contains('quote-speaker-cutout--paper-shapes') ||
            imageWrap.classList.contains('quote-speaker-cutout--plain-cutout');
        }
        if (colorWash) {
          colorWash.hidden = true;
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
            'quote-speaker-cutout--plain-cutout',
            'quote-speaker-cutout--baked-storage',
            'quote-speaker-cutout--subject-fill'
          );
          imageWrap.style.removeProperty('--speaker-image-url');
          imageWrap.style.removeProperty('--speaker-cutout-pos-y');
          imageWrap.style.removeProperty('--speaker-cutout-pos-x');
          imageWrap.style.removeProperty('--speaker-cutout-bg-w');
          imageWrap.style.removeProperty('--speaker-cutout-bg-h');
          imageWrap.style.removeProperty('height');
          imageWrap._speakerOpaqueBounds = null;
        imageWrap._speakerSubjectBounds = null;
          delete imageWrap._speakerSubjectCrop;
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
          this._clearQuoteSpeakerPlainCutoutPaperBacking?.(imageWrap, neutralSilhouette);
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
          const preserveLoadedCutout =
            typeof window !== 'undefined' &&
            typeof window.odqIsCapacitorNative === 'function' &&
            window.odqIsCapacitorNative() &&
            widget?.dataset.firebaseSpeakerCutout === '1' &&
            /speaker-cutouts(?:%2F|\/)/i.test(String(img.currentSrc || img.src || this._quoteSpeakerCutoutUrl || '')) &&
            (img.naturalWidth > 0 || String(img.currentSrc || img.src || '').trim());
          if (!preserveLoadedCutout) {
            img.classList.remove('is-loaded');
            img.hidden = true;
            delete img.dataset.plainCutoutComposite;
        delete img.dataset.plainCutoutDirect;
            img.removeAttribute('src');
          }
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
          const existingCutout = String(this._quoteSpeakerCutoutUrl || '').trim();
          const isNativeSpeaker =
            typeof window !== 'undefined' &&
            typeof window.odqIsCapacitorNative === 'function' &&
            window.odqIsCapacitorNative();
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
          if (/speaker-cutouts(?:%2F|\/)/i.test(String(profile.cutoutUrl || '').trim())) {
            return profile.cutoutUrl;
          }
          if (isNativeSpeaker) {
            if (resolveDisplay) {
              const resolved = await resolveDisplay({
                portraitUrl: portraitForResolve,
                cutoutUrl: profile.cutoutUrl || '',
                cutoutSnap,
                speakerName: profile.name
              });
              if (resolved) return resolved;
            }
            return portraitForResolve || profile.imageUrl || '';
          }
          if (arch && typeof arch.resolveLayoutBSpeakerCutoutUrl === 'function') {
            const cutout = await arch.resolveLayoutBSpeakerCutoutUrl(resolvedQuote, profile.name);
            if (cutout) {
              return cutout;
            }
          }
          if (resolveDisplay) {
            const resolved = await resolveDisplay({
              portraitUrl: portraitForResolve,
              cutoutUrl: profile.cutoutUrl || '',
              cutoutSnap,
              speakerName: profile.name
            });
            return resolved;
          }
          const fallbackUrl = portraitForResolve || profile.cutoutUrl || profile.imageUrl || '';
          return fallbackUrl;
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
              if (
                this._quoteSpeakerCanvasPipelineBlocked() &&
                this._quoteSpeakerShouldStripFringe(base) &&
                this.archiveService?._prepareSpeakerImageUrlForCanvas
              ) {
                const proxiedCutout = await this.archiveService._prepareSpeakerImageUrlForCanvas(base, {
                  quote: resolvedQuote,
                  retry: true,
                  skipCutoutExportFinalize: true
                });
                display = proxiedCutout || base;
              } else if (this._quoteSpeakerCanvasPipelineBlocked()) {
                display = base;
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

    _quiltMoodSpreadMode() {
      try {
        const params = new URLSearchParams(window.location.search || '');
        const q = String(params.get('moodSpread') || '').trim().toLowerCase();
        if (q === 'triptych' || q === 'collage') return q;
      } catch (_) {
        /* */
      }
      return CONFIG.APP?.moodSpreadMode === 'triptych' ? 'triptych' : 'collage';
    }

    _quiltMoodSpreadWidgetMod() {
      return this._quiltMoodSpreadMode() === 'collage'
        ? globalThis.QuiltMoodCollageWidget
        : globalThis.QuiltMoodTriptychWidget;
    }

    _quiltMoodSpreadApi(host) {
      return host?._moodSpreadWidget || host?._moodTriptychWidget || host?._moodCollageWidget || null;
    }

    _quiltMoodSpreadQuoteImg(host) {
      const duoImg = document.querySelector('.quilt-mood-duo__quote-img');
      if (duoImg) return duoImg;
      if (!host) return null;
      return host.querySelector(
        '.quilt-mood-spread__quote-img, .quilt-mood-triptych__quote-img, .quilt-mood-collage__quote img'
      );
    }

    _quoteImgSrcMatches(src, url) {
      const left = String(src || '').trim();
      const right = String(url || '').trim();
      if (!left || !right) return false;
      if (left === right) return true;
      try {
        const base = window.location.href;
        return new URL(left, base).href === new URL(right, base).href;
      } catch (_) {
        return false;
      }
    }

    _quiltMoodSpreadEnabled() {
      if (this._quiltMoodSpreadMode?.() === 'collage') {
        globalThis.QuiltMoodCollageWidget?.preloadAssets?.();
      }
      const SpreadW = this._quiltMoodSpreadWidgetMod?.();
      const hasSpread = typeof SpreadW?.mount === 'function';
      const hasNightlySource = !!(window.db && window.firestore);
      const hasComposeFallback =
        typeof globalThis.QuiltNewspaperClipping?.composeDataUrl === 'function';
      return hasSpread && (hasNightlySource || hasComposeFallback);
    }

    /** True when mood spread is mounted and quote PNG decoded (replaces legacy peek clipping). */
    _quiltMoodSpreadIsLive() {
      const spreadHost = document.getElementById('quiltMoodSpread');
      if (
        !spreadHost ||
        !spreadHost.classList.contains('is-ready') ||
        !this._quiltMoodSpreadApi(spreadHost)
      ) {
        return false;
      }
      const img = this._quiltMoodSpreadQuoteImg(spreadHost);
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

    /** Mood spread replaces peek clipping whenever the widget is active or loading. */
    _moodSpreadOwnsQuoteUi() {
      if (!this._quiltMoodSpreadEnabled()) return false;
      const duoQuote = document.querySelector('.quilt-mood-duo__quote-img');
      const host = document.getElementById('quiltMoodSpread');
      if (duoQuote?.naturalWidth > 0) return true;
      if (duoQuote?.src && duoQuote.src.length > 32) return true;
      if (document.getElementById('quiltMoodDuo')?.classList.contains('is-duo-ready')) {
        return !!(duoQuote?.naturalWidth > 0 || (duoQuote?.src && duoQuote.src.length > 32));
      }
      if (!host) return false;
      const quoteImg = this._quiltMoodSpreadQuoteImg(host);
      const src = String(quoteImg?.currentSrc || quoteImg?.src || '').trim();
      return !!(quoteImg?.naturalWidth > 0 || src.length > 32);
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
        stack.setAttribute(
          'data-quote-ui',
          this._quiltMoodSpreadMode() === 'collage' ? 'mood-collage' : 'mood-triptych'
        );
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
      const raw = quote || this._quoteForMoodWidget() || null;
      if (!raw || typeof raw !== 'object') return null;
      const q = this._quoteForMoodWidget(raw) || raw;
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
      const flc =
        globalThis.QuiltNewspaperClipping?.firstLineCountFromQuoteFields?.(q) ??
        (() => {
          let n = Number(q.first_line_count ?? q.firstLineCount);
          if (!Number.isFinite(n) || n <= 0) {
            n = Number(q.firstLineCountSnapshot ?? q.first_line_count_snapshot);
          }
          if (!Number.isFinite(n) || n <= 0) {
            n = Number(q.notionProperties?.first_line_count?.value ?? q.notionProperties?.firstLineCount?.value);
          }
          return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
        })();
      const payload = { text, author, dateKey: dateKeyOut };
      if (flc != null) {
        payload.firstLineCount = flc;
        payload.first_line_count = flc;
      }
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
        resolveQuoteClippingUrl: async (dateKey) => {
          const dk = String(dateKey || '').trim();
          if (!dk) return '';
          const meta = await this.fetchNewspaperClippingMeta(dk, { waitForFirebaseMs: 8000 });
          return String(meta?.url || '').trim();
        },
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
      const spreadHost = document.getElementById('quiltMoodSpread');
      if (spreadHost?.dataset?.goodDay) host.dataset.goodDay = spreadHost.dataset.goodDay;
      if (spreadHost?.dataset?.roughDay) host.dataset.roughDay = spreadHost.dataset.roughDay;
      if (spreadHost?.dataset?.contentSig) host.dataset.contentSig = spreadHost.dataset.contentSig;
      host.classList.add('is-active');
      host.classList.toggle('is-good', mood === 'good');
      host.classList.toggle('is-rough', mood === 'rough');
      this._saveQuiltMoodPickToStorage(host, mood, stampAt);
      const SpreadW = this._quiltMoodSpreadWidgetMod?.();
      const spreadApi = this._quiltMoodSpreadApi(spreadHost);
      if (spreadApi && SpreadW?.moodToPanel) {
        const spreadDone =
          spreadApi.getMood?.() === mood && spreadHost.classList.contains('is-open');
        if (!spreadDone && spreadApi.getMood?.() !== mood) {
          spreadApi.setMood(mood, { instant: !!meta.instant });
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
      globalThis.QuiltMoodCollageWidget?.unmount?.(spreadHost);
      globalThis.QuiltMoodTriptychWidget?.unmount?.(spreadHost);
    }

    remeasureQuiltMoodSpread() {
      const spreadHost = document.getElementById('quiltMoodSpread');
      this._quiltMoodSpreadApi(spreadHost)?.remeasure?.();
    }

    /** Collage: resolve quote PNG quickly — reuse cache, short Firebase peek, then local compose. */
    async _resolveCollageQuoteFast(dk, quotePayload, { canComposeQuote = false } = {}) {
      const QNC = globalThis.QuiltNewspaperClipping;
      const dateKey = String(dk || quotePayload?.dateKey || '').trim();
      if (dateKey) {
        const reused = this._reuseLoadedNewspaperClippingSrc?.(dateKey);
        if (reused) {
          return { quoteDataUrl: reused, quoteDisplayWidthPx: 0, composed: null, source: 'reuse' };
        }
        const nightly = await this.fetchNewspaperClippingMeta(dateKey, {
          waitForFirebaseMs: 900
        });
        if (nightly?.url) {
          return {
            quoteDataUrl: nightly.url,
            quoteDisplayWidthPx: 0,
            composed: null,
            source: 'nightly',
            clippingDisplayMeta: {
              renderWidth: Number(nightly.renderWidth) || 0,
              effectiveBodyDomPx: Number(nightly.effectiveBodyDomPx) || 0
            }
          };
        }
      }
      if (!canComposeQuote || typeof QNC?.composeDataUrl !== 'function') return null;
      const composeFn = QNC.composeDataUrlWithLayout || QNC.composeDataUrl;
      const composed = await composeFn({
        yesterday: null,
        tomorrow: null,
        today: {
          text: quotePayload.text,
          author: quotePayload.author,
          dateKey,
          firstLineCount: quotePayload.firstLineCount,
          keyword: quotePayload.keyword
        },
        dateKey,
        paperTextureUrl: QNC.resolveClippingPaperTextureUrl?.() || null,
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
        return { quoteDataUrl: composed, quoteDisplayWidthPx: 0, composed: null, source: 'compose' };
      }
      if (composed?.dataUrl) {
        return {
          quoteDataUrl: composed.dataUrl,
          quoteDisplayWidthPx: Number(composed.displayWidthPx) || 0,
          composed,
          source: 'compose',
          clippingDisplayMeta: {
            renderWidth: Number(composed.renderWidth) || 0,
            effectiveBodyDomPx: Number(composed.effectiveBodyDomPx) || 0
          }
        };
      }
      return null;
    }

    _quiltMoodSpreadQuoteOnReady(spreadHost) {
      return () => {
        this._clearLegacyQuoteClippingPng();
        this._markQuiltMoodSpreadQuoteUi();
        if (document.getElementById('screen-quilt')?.classList.contains('active')) {
          if (this._quiltUserColorCardVisible?.() && !this._quiltFabricPeekHintPlayed) {
            this.scheduleFabricScrollPeekHint?.();
          } else if (!this._quiltScrollCuePlayed) {
            this.scheduleQuiltScrollCue?.(1000);
          }
        }
      };
    }

    _quiltMoodSpreadInstantRestore(mood, sig, dateKey) {
      if (mood !== 'good' && mood !== 'rough') return false;
      if (this._quiltMoodSpreadMode?.() !== 'collage') return true;
      const dk = String(dateKey || '').trim();
      const contentSig = String(sig || '').trim();
      if (!dk || !contentSig) return false;
      return !!globalThis.QuiltMoodCollageWidget?.isZoneScratchComplete?.(dk, contentSig, mood);
    }

    _buildQuiltMoodSpreadMountOpts({
      spreadHost,
      quoteDataUrl,
      g,
      r,
      dk,
      mountMood,
      moodHost,
      sig,
      quoteDisplayWidthPx = 0,
      quoteRenderWidth = 0,
      quoteEffectiveBodyDomPx = 0,
      spreadMode
    }) {
      const mountMoodFinal =
        typeof this._resolveEffectiveQuiltMoodPick === 'function'
          ? this._resolveEffectiveQuiltMoodPick(moodHost, spreadHost, sig, mountMood)
          : mountMood;
      const mountOpts = {
        quoteDataUrl: quoteDataUrl || '',
        goodDay: g,
        roughDay: r,
        dateKey: dk,
        initialMood:
          mountMoodFinal === 'good' || mountMoodFinal === 'rough' ? mountMoodFinal : null,
        instant: this._quiltMoodSpreadInstantRestore(mountMoodFinal, sig, dk),
        onReady: this._quiltMoodSpreadQuoteOnReady(spreadHost),
        onSelect: (pickedMood) => {
          const bodyText = String(pickedMood === 'good' ? g : r).trim();
          this._persistQuiltMoodPick?.(pickedMood, {
            goodDay: g,
            roughDay: r,
            dateKey: dk,
            stampAt: new Date()
          });
          const moodHostEl = moodHost || document.getElementById('quiltMoodWidget');
          if (moodHostEl) {
            this._onQuiltMoodTerminalPicked(moodHostEl, pickedMood, bodyText, {
              printedAt: new Date()
            });
          }
        },
        quoteDisplayWidthPx,
        quoteRenderWidth: Number(spreadHost.dataset.quoteRenderWidth) || quoteRenderWidth || 0,
        quoteEffectiveBodyDomPx:
          Number(spreadHost.dataset.quoteEffectiveBodyDomPx) || quoteEffectiveBodyDomPx || 0
      };
      if (spreadMode === 'collage') {
        mountOpts.quiltBlocks = this.quiltEngine?.blocks || [];
        mountOpts.overlayQuilt = true;
        mountOpts.macroStructureFrozen = this.quiltEngine?.macroStructureFrozen === true;
      }
      return mountOpts;
    }

    _stampQuiltMoodSpreadQuoteMeta(spreadHost, quoteDataUrl, composed, clippingDisplayMeta = null) {
      const renderWidth =
        Number(composed?.renderWidth) > 0
          ? Number(composed.renderWidth)
          : Number(clippingDisplayMeta?.renderWidth) > 0
            ? Number(clippingDisplayMeta.renderWidth)
            : 0;
      const effectiveBodyDomPx =
        Number(composed?.effectiveBodyDomPx) > 0
          ? Number(composed.effectiveBodyDomPx)
          : Number(clippingDisplayMeta?.effectiveBodyDomPx) > 0
            ? Number(clippingDisplayMeta.effectiveBodyDomPx)
            : 0;
      if (renderWidth > 0) {
        spreadHost.dataset.quoteRenderWidth = String(Math.round(renderWidth));
      }
      if (effectiveBodyDomPx > 0) {
        spreadHost.dataset.quoteEffectiveBodyDomPx = String(
          Math.round(effectiveBodyDomPx * 10) / 10
        );
      }
      if (String(quoteDataUrl || '').startsWith('http')) {
        spreadHost.dataset.quoteClippingStamp =
          quoteDataUrl.split('odq_t=')[1]?.split('&')[0] || quoteDataUrl;
      }
    }

    async _resolveQuiltMoodSpreadQuoteUrl(
      dk,
      quotePayload,
      todayQuote,
      canComposeQuote,
      { collageFastFirst = false } = {}
    ) {
      const QNC = globalThis.QuiltNewspaperClipping;
      let quoteDataUrl = null;
      let quoteDisplayWidthPx = 0;
      let composed = null;
      let source = null;
      let clippingDisplayMeta = null;

      if (collageFastFirst) {
        const fastQuote = await this._resolveCollageQuoteFast(dk, quotePayload, { canComposeQuote });
        if (fastQuote?.quoteDataUrl) {
          return {
            quoteDataUrl: fastQuote.quoteDataUrl,
            quoteDisplayWidthPx: fastQuote.quoteDisplayWidthPx || 0,
            composed: fastQuote.composed,
            source: fastQuote.source,
            clippingDisplayMeta: fastQuote.clippingDisplayMeta || null
          };
        }
      }

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
      if (quoteDataUrl && dk) {
        try {
          const meta = await this.fetchNewspaperClippingMeta(dk, { waitForFirebaseMs: 12000 });
          clippingDisplayMeta = {
            renderWidth: Number(meta?.renderWidth) || 0,
            effectiveBodyDomPx: Number(meta?.effectiveBodyDomPx) || 0
          };
        } catch (_) {
          /* */
        }
      }
      if (quoteDataUrl) {
        console.info('[our-daily] Triptych quote: nightly PNG (source of truth)');
        void this.applyQuoteScreenClipping({ dateKey: dk, quote: todayQuote, forceRefresh: true });
        source = 'nightly';
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
          source = 'compose';
        }
      } else {
        console.warn('[our-daily] Triptych quote unavailable: no nightly PNG and compose disabled');
      }

      return { quoteDataUrl, quoteDisplayWidthPx, composed, source, clippingDisplayMeta };
    }

    async _refreshQuiltMoodCollageSpread({
      spreadHost,
      sig,
      g,
      r,
      dk,
      quotePayload,
      todayQuote,
      canComposeQuote,
      mountMood,
      moodHost,
      SpreadW
    }) {
      if (spreadHost._moodSpreadComposePending !== sig) return;

      let quoteDataUrl = dk ? this._reuseLoadedNewspaperClippingSrc?.(dk) : null;
      let quoteDisplayWidthPx = 0;
      let composed = null;
      let clippingDisplayMeta = null;
      let collageFastSource = quoteDataUrl ? 'reuse' : null;

      spreadHost.dataset.contentSig = sig;
      spreadHost.dataset.moodSpreadDateKey = dk;
      spreadHost.dataset.goodDay = g;
      spreadHost.dataset.roughDay = r;

      const mountOpts = this._buildQuiltMoodSpreadMountOpts({
        spreadHost,
        quoteDataUrl,
        g,
        r,
        dk,
        mountMood,
        moodHost,
        sig,
        quoteDisplayWidthPx,
        spreadMode: 'collage'
      });
      const mounted = SpreadW.mount(spreadHost, mountOpts);
      if (!mounted) {
        console.warn('[our-daily] mood spread mount failed (collage)');
        delete spreadHost._moodSpreadComposePending;
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

      if (!quoteDataUrl) {
        const fastQuote = await this._resolveCollageQuoteFast(dk, quotePayload, { canComposeQuote });
        if (spreadHost._moodSpreadComposePending !== sig) return;
        if (fastQuote?.quoteDataUrl) {
          quoteDataUrl = fastQuote.quoteDataUrl;
          quoteDisplayWidthPx = fastQuote.quoteDisplayWidthPx || 0;
          composed = fastQuote.composed;
          clippingDisplayMeta = fastQuote.clippingDisplayMeta || null;
          collageFastSource = fastQuote.source;
        }
      }

      if (!quoteDataUrl) {
        const resolved = await this._resolveQuiltMoodSpreadQuoteUrl(
          dk,
          quotePayload,
          todayQuote,
          canComposeQuote
        );
        if (spreadHost._moodSpreadComposePending !== sig) return;
        quoteDataUrl = resolved.quoteDataUrl;
        quoteDisplayWidthPx = resolved.quoteDisplayWidthPx || 0;
        composed = resolved.composed;
        clippingDisplayMeta = resolved.clippingDisplayMeta || clippingDisplayMeta;
        collageFastSource = resolved.source;
      }

      if (spreadHost._moodSpreadComposePending !== sig) return;
      if (!quoteDataUrl) {
        console.warn('[our-daily] Collage quote image unavailable (Storage + compose failed)');
        if (spreadHost.classList.contains('is-layer-ready')) return;
        delete spreadHost._moodSpreadComposePending;
        this._unmountQuiltMoodSpread();
        this._fallbackQuiltQuoteClipping(todayQuote, dk);
        return;
      }

      this._stampQuiltMoodSpreadQuoteMeta(spreadHost, quoteDataUrl, composed, clippingDisplayMeta);
      const spreadApi = this._quiltMoodSpreadApi(spreadHost);
      const quoteImg = this._quiltMoodSpreadQuoteImg(spreadHost);
      const quoteSrc = String(quoteImg?.currentSrc || quoteImg?.src || '').trim();
      const quoteAlreadyLive =
        spreadHost.classList.contains('is-ready') &&
        this._quoteImgSrcMatches(quoteSrc, quoteDataUrl);
      if (!quoteAlreadyLive) {
        const applied = spreadApi?.setQuote?.({
          quoteDataUrl,
          quoteDisplayWidthPx,
          quoteRenderWidth: Number(spreadHost.dataset.quoteRenderWidth) || 0,
          quoteEffectiveBodyDomPx: Number(spreadHost.dataset.quoteEffectiveBodyDomPx) || 0,
          onReady: this._quiltMoodSpreadQuoteOnReady(spreadHost)
        });
        if (applied === false) {
          console.warn('[our-daily] Collage setQuote failed — keeping collage layers');
        }
      }

      if (String(quoteDataUrl || '').startsWith('data:') && dk) {
        const upgrade = () => {
          void this._upgradeTriptychQuoteToNightlyClipping(dk, g, r);
        };
        globalThis.setTimeout(upgrade, 2000);
        document.addEventListener('firebaseReady', upgrade, { once: true });
      } else if (collageFastSource === 'compose' && dk) {
        globalThis.setTimeout(() => {
          void this._upgradeTriptychQuoteToNightlyClipping(dk, g, r);
        }, 2500);
      }
    }

    async _refreshQuiltMoodSpread(
      quote = null,
      goodDay = '',
      roughDay = '',
      { initialMood = null, instant = false } = {}
    ) {
      const spreadHost = document.getElementById('quiltMoodSpread');
      if (!spreadHost) return;
      const SpreadW = this._quiltMoodSpreadWidgetMod?.();
      const QNC = globalThis.QuiltNewspaperClipping;
      const todayQuote = this._quoteForMoodWidget(quote);
      const canComposeQuote = typeof QNC?.composeDataUrl === 'function';
      if (!SpreadW?.mount || !this._quiltMoodSpreadEnabled()) {
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
      if (spreadHost.dataset.contentSig === sig && this._quiltMoodSpreadApi(spreadHost) && spreadDateMatches) {
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
          const spreadApi = this._quiltMoodSpreadApi(spreadHost);
          const moodHost = document.getElementById('quiltMoodWidget');
          const effectiveMood =
            typeof this._resolveEffectiveQuiltMoodPick === 'function'
              ? this._resolveEffectiveQuiltMoodPick(moodHost, spreadHost, sig, initialMood)
              : initialMood;
          if (effectiveMood === 'good' || effectiveMood === 'rough') {
            if (spreadApi.getMood?.() !== effectiveMood) {
              spreadApi.setMood(effectiveMood, { instant: true });
            }
            if (moodHost) {
              moodHost.classList.add('is-active');
              moodHost.classList.toggle('is-good', effectiveMood === 'good');
              moodHost.classList.toggle('is-rough', effectiveMood === 'rough');
              const savedPick = this._readQuiltMoodPickFromStorage(sig);
              this._saveQuiltMoodPickToStorage(
                moodHost,
                effectiveMood,
                savedPick?.stampAt || new Date()
              );
            }
          } else if (spreadApi.getMood?.()) {
            spreadApi.setMood(null, { instant: true, force: true });
            if (moodHost) {
              this._resetQuiltMoodCardState?.(moodHost);
              moodHost.classList.remove('is-active', 'is-good', 'is-rough', 'quilt-mood-widget--paper-out');
            }
            spreadHost.classList.remove('is-open');
          }
          spreadApi.remeasure?.();
          if (
            spreadHost.classList.contains('is-ready') ||
            spreadHost.classList.contains('is-layer-ready')
          ) {
            this._clearLegacyQuoteClippingPng();
            if (spreadHost.classList.contains('is-ready')) {
              this._markQuiltMoodSpreadQuoteUi();
            }
          }
          return;
        }
      }

      if (spreadHost._moodSpreadComposePending === sig) {
        return;
      }

      const moodHost = document.getElementById('quiltMoodWidget');
      let mountMood =
        typeof this._resolveEffectiveQuiltMoodPick === 'function'
          ? this._resolveEffectiveQuiltMoodPick(moodHost, spreadHost, sig, initialMood)
          : initialMood;
      if (mountMood === 'good' || mountMood === 'rough') {
        if (moodHost) {
          moodHost.dataset.goodDay = g;
          moodHost.dataset.roughDay = r;
          moodHost.dataset.contentSig = sig;
          moodHost.classList.add('is-active');
          moodHost.classList.toggle('is-good', mountMood === 'good');
          moodHost.classList.toggle('is-rough', mountMood === 'rough');
          const savedPick = this._readQuiltMoodPickFromStorage(sig);
          this._saveQuiltMoodPickToStorage(
            moodHost,
            mountMood,
            savedPick?.stampAt || new Date()
          );
        }
      }

      SpreadW.unmount(spreadHost);
      SpreadW.injectStyles?.();
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
      const spreadMode = this._quiltMoodSpreadMode();
      try {
        if (spreadHost._moodSpreadComposePending !== sig) {
          return;
        }

        if (spreadMode === 'collage') {
          await this._refreshQuiltMoodCollageSpread({
            spreadHost,
            sig,
            g,
            r,
            dk,
            quotePayload,
            todayQuote,
            canComposeQuote,
            mountMood,
            moodHost,
            SpreadW
          });
          return;
        }

        const resolved = await this._resolveQuiltMoodSpreadQuoteUrl(
          dk,
          quotePayload,
          todayQuote,
          canComposeQuote
        );
        let quoteDataUrl = resolved.quoteDataUrl;
        let quoteDisplayWidthPx = resolved.quoteDisplayWidthPx || 0;
        let composed = resolved.composed;
        const clippingDisplayMeta = resolved.clippingDisplayMeta || null;

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
        this._stampQuiltMoodSpreadQuoteMeta(spreadHost, quoteDataUrl, composed, clippingDisplayMeta);

        const mountOpts = this._buildQuiltMoodSpreadMountOpts({
          spreadHost,
          quoteDataUrl,
          g,
          r,
          dk,
          mountMood,
          moodHost,
          sig,
          quoteDisplayWidthPx,
          quoteRenderWidth: Number(spreadHost.dataset.quoteRenderWidth) || 0,
          quoteEffectiveBodyDomPx: Number(spreadHost.dataset.quoteEffectiveBodyDomPx) || 0,
          spreadMode
        });
        const mounted = SpreadW.mount(spreadHost, mountOpts);
        if (!mounted) {
          console.warn(`[our-daily] mood spread mount failed (${spreadMode})`);
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
        console.warn('[our-daily] Mood spread refresh failed:', err);
        const keepExisting =
          (spreadHost.classList.contains('is-ready') ||
            spreadHost.classList.contains('is-layer-ready')) &&
          this._quiltMoodSpreadApi(spreadHost) &&
          spreadHost.dataset.contentSig === sig;
        if (!keepExisting) {
          delete spreadHost._moodSpreadComposePending;
          this._unmountQuiltMoodSpread();
          this._fallbackQuiltQuoteClipping(todayQuote, dk);
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
