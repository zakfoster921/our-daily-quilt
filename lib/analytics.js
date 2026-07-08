/**
 * Firebase Analytics event helper. Loaded before firebaseReady; queues until init.
 * Exposes globalThis.odqTrack(eventName, params) — returns true when logEvent ran.
 */
(function (root) {
  'use strict';

  const INTERNAL_FLAG_KEY = 'odqAnalyticsInternal';
  const MAX_INIT_ATTEMPTS = 6;

  const queue = [];
  let analytics = null;
  let logEventFn = null;
  let ready = false;
  let initInFlight = null;
  let initAttempt = 0;
  const readyWaiters = [];

  function isInternalAnalyticsDevice() {
    try {
      if (root.localStorage?.getItem(INTERNAL_FLAG_KEY) === '1') return true;
    } catch (_) {
      /* */
    }
    const allowlist = root.CONFIG?.ANALYTICS?.internalDeviceIds;
    if (!Array.isArray(allowlist) || !allowlist.length) return false;
    try {
      const ids = [
        root.localStorage?.getItem('quiltDeviceId'),
        root.localStorage?.getItem('ourDailyUserId'),
        root.localStorage?.getItem('ourDailyAppInstanceId')
      ]
        .map((id) => String(id || '').trim())
        .filter(Boolean);
      return ids.some((id) => allowlist.includes(id));
    } catch (_) {
      return false;
    }
  }

  function getPlatform() {
    try {
      return root.Capacitor?.getPlatform?.() || 'web';
    } catch (_) {
      return 'web';
    }
  }

  function getAppDateKey() {
    try {
      if (root.Utils?.getTodayKey) return root.Utils.getTodayKey();
      if (root.UtilsCore?.getTodayKey) return root.UtilsCore.getTodayKey();
    } catch (_) {
      /* */
    }
    return '';
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function dispatchEvent(name) {
    try {
      root.document?.dispatchEvent?.(new CustomEvent(name));
    } catch (_) {
      /* */
    }
  }

  function resolveReadyWaiters() {
    while (readyWaiters.length) {
      const resolve = readyWaiters.shift();
      try {
        resolve(true);
      } catch (_) {
        /* */
      }
    }
  }

  function rejectReadyWaiters() {
    while (readyWaiters.length) {
      const resolve = readyWaiters.shift();
      try {
        resolve(false);
      } catch (_) {
        /* */
      }
    }
  }

  function acknowledgeSent(name, payload) {
    if (name === 'daily_quote_seen') {
      const dateKey = String(payload?.app_date_key || getAppDateKey() || '').trim();
      if (dateKey) {
        try {
          root.app?.markDailyQuoteSeenAnalyticsSent?.(dateKey);
        } catch (_) {
          /* */
        }
      }
    }
  }

  function sendEvent(name, payload) {
    if (!analytics || !logEventFn) return false;
    try {
      logEventFn(analytics, name, payload);
      acknowledgeSent(name, payload);
      return true;
    } catch (err) {
      console.warn('[ODQ analytics] send failed:', name, err);
      return false;
    }
  }

  function flushQueue() {
    if (!analytics || !logEventFn || !queue.length) return;
    const pending = queue.splice(0, queue.length);
    for (const item of pending) {
      if (!sendEvent(item.name, item.payload)) {
        queue.push(item);
      }
    }
  }

  function track(eventName, params) {
    const name = String(eventName || '').trim();
    if (!name) return false;
    if (isInternalAnalyticsDevice()) return false;
    const payload = {
      app_date_key: getAppDateKey(),
      platform: getPlatform(),
      ...(params && typeof params === 'object' ? params : {})
    };
    if (analytics && logEventFn) {
      return sendEvent(name, payload);
    }
    queue.push({ name, payload });
    void initAnalytics();
    return false;
  }

  function notifyReady() {
    if (ready) return;
    ready = true;
    flushQueue();
    sendEvent('app_open', { init_attempt: initAttempt });
    resolveReadyWaiters();
    dispatchEvent('odqAnalyticsReady');
    try {
      root.app?.replayPendingAnalyticsEvents?.();
    } catch (err) {
      console.warn('[ODQ analytics] replay pending failed:', err);
    }
  }

  async function initAnalytics() {
    if (ready) return true;
    if (initInFlight) return initInFlight;

    initInFlight = (async () => {
      while (initAttempt < MAX_INIT_ATTEMPTS) {
        initAttempt += 1;
        if (!root.firebaseApp || !root.CONFIG?.FIREBASE?.measurementId) {
          await sleep(Math.min(400 * initAttempt, 2400));
          continue;
        }
        try {
          const mod = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js');
          const supported = typeof mod.isSupported === 'function' ? await mod.isSupported() : true;
          if (!supported) {
            console.warn('[ODQ analytics] not supported in this environment');
            return false;
          }
          analytics = mod.getAnalytics(root.firebaseApp);
          logEventFn = mod.logEvent;
          notifyReady();
          return true;
        } catch (err) {
          console.warn(`[ODQ analytics] init attempt ${initAttempt} failed:`, err);
          await sleep(Math.min(800 * initAttempt, 8000));
        }
      }
      console.warn('[ODQ analytics] init exhausted retries');
      rejectReadyWaiters();
      return false;
    })().finally(() => {
      initInFlight = null;
    });

    return initInFlight;
  }

  function whenReady() {
    if (ready) return Promise.resolve(true);
    return new Promise((resolve) => readyWaiters.push(resolve));
  }

  function onFirebaseReady() {
    void initAnalytics();
  }

  if (root.firebaseApp) {
    void initAnalytics();
  } else {
    root.document?.addEventListener?.('firebaseReady', onFirebaseReady, { once: true });
  }

  const SCREEN_OPEN_EVENTS = {
    'screen-portal': 'portal_seen',
    'screen-first-name': 'first_name_seen',
    'screen-intro-zak': 'intro_zak_seen',
    'screen-intro-mission': 'intro_mission_seen',
    'screen-welcome': 'welcome_seen',
    'screen-first-quote-bridge': 'quote_bridge_seen',
    'screen-about': 'open_about',
    'screen-settings': 'open_settings',
    'screen-remember-today': 'open_remember',
    'screen-reflection-themes-archive': 'open_archive',
    'screen-social-posts': 'open_social_posts'
  };

  function trackScreenOpen(screenId, previousId) {
    const next = String(screenId || '').trim();
    const prev = String(previousId || '').trim();
    if (!next || next === prev) return;
    const eventName = SCREEN_OPEN_EVENTS[next];
    if (eventName) track(eventName);
  }

  root.odqTrack = track;
  root.OdqAnalytics = {
    track,
    trackScreenOpen,
    init: initAnalytics,
    whenReady,
    isReady: () => ready,
    isInternalDevice: isInternalAnalyticsDevice,
    setInternalDevice(enabled) {
      try {
        if (enabled) root.localStorage?.setItem(INTERNAL_FLAG_KEY, '1');
        else root.localStorage?.removeItem(INTERNAL_FLAG_KEY);
      } catch (_) {
        /* */
      }
      return isInternalAnalyticsDevice();
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
