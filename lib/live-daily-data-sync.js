/**
 * Live daily quilt/quote sync helpers (Firebase readiness, timeouts, sync marker).
 * Loaded before the main app module; exposes globalThis.LiveDailyDataSync.
 */
(function (root) {
  'use strict';

  const LIVE_DAILY_SYNC_STORAGE_KEY = 'ourDailyLastLiveSyncAt';

  class LiveDailyDataSync {
    static withTimeout(promise, ms, label) {
      let timer = null;
      return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        })
      ]);
    }

    static async waitForFirebaseReady(maxWaitMs = 20000) {
      const started = Date.now();
      while (Date.now() - started < maxWaitMs) {
        if (root.db && root.firestore) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return !!(root.db && root.firestore);
    }

    static recordSuccessfulSync(todayKey) {
      try {
        root.localStorage.setItem(
          LIVE_DAILY_SYNC_STORAGE_KEY,
          JSON.stringify({ date: todayKey, at: new Date().toISOString() })
        );
      } catch (_) {
        /* ignore */
      }
    }
  }

  root.LiveDailyDataSync = LiveDailyDataSync;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
