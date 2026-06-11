/**
 * Firebase Analytics event helper. Loaded before firebaseReady; queues until init.
 * Exposes globalThis.odqTrack(eventName, params).
 */
(function (root) {
  'use strict';

  const INTERNAL_FLAG_KEY = 'odqAnalyticsInternal';

  const queue = [];
  let analytics = null;
  let logEventFn = null;
  let initStarted = false;

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

  function flushQueue() {
    if (!analytics || !logEventFn) return;
    while (queue.length) {
      const item = queue.shift();
      try {
        logEventFn(analytics, item.name, item.payload);
      } catch (err) {
        console.warn('[ODQ analytics] flush failed:', item.name, err);
      }
    }
  }

  function track(eventName, params) {
    const name = String(eventName || '').trim();
    if (!name) return;
    if (isInternalAnalyticsDevice()) return;
    const payload = {
      app_date_key: getAppDateKey(),
      platform: getPlatform(),
      ...(params && typeof params === 'object' ? params : {})
    };
    if (analytics && logEventFn) {
      try {
        logEventFn(analytics, name, payload);
      } catch (err) {
        console.warn('[ODQ analytics]', name, err);
      }
      return;
    }
    queue.push({ name, payload });
  }

  async function initAnalytics() {
    if (initStarted) return;
    if (!root.firebaseApp || !root.CONFIG?.FIREBASE?.measurementId) return;
    initStarted = true;
    try {
      const mod = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js');
      const supported = typeof mod.isSupported === 'function' ? await mod.isSupported() : true;
      if (!supported) {
        console.warn('[ODQ analytics] not supported in this environment');
        return;
      }
      analytics = mod.getAnalytics(root.firebaseApp);
      logEventFn = mod.logEvent;
      flushQueue();
    } catch (err) {
      console.warn('[ODQ analytics] init failed:', err);
    }
  }

  function onFirebaseReady() {
    void initAnalytics();
  }

  if (root.firebaseApp) {
    void initAnalytics();
  } else {
    root.document?.addEventListener?.('firebaseReady', onFirebaseReady, { once: true });
  }

  root.odqTrack = track;
  root.OdqAnalytics = {
    track,
    init: initAnalytics,
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
