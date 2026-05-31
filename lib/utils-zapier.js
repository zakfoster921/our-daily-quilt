/**
 * Zapier reel guards, captions, and Firestore triangle serialization. Extends UtilsCore.
 */
(function (root) {
  'use strict';

  const UtilsCore = root.UtilsCore;
  if (!UtilsCore) {
    throw new Error('lib/utils-core.js must load before utils-zapier.js');
  }

  Object.assign(UtilsCore, {
    /** root.localStorage: YYYY-MM-DD for which we already uploaded a Zapier reel WebM (max one reel capture per day per browser). */
    ZAPIER_REEL_ONCE_STORAGE_KEY: 'ourDailyZapierReelSyncedDate',
    hasSyncedZapierReelForDate(dateKey) {
      try {
        return root.localStorage.getItem(UtilsCore.ZAPIER_REEL_ONCE_STORAGE_KEY) === dateKey;
      } catch (_) {
        return false;
      }
    },
    markSyncedZapierReelForDate(dateKey) {
      try {
        root.localStorage.setItem(UtilsCore.ZAPIER_REEL_ONCE_STORAGE_KEY, dateKey);
      } catch (_) {
        /* */
      }
    },
    async zapierReelDocAlreadyHasVideo(dateKey) {
      if (!root.db || !root.firestore) return false;
      try {
        const ref = root.firestore.doc(root.db, 'instagram-images', dateKey);
        const snap = await root.firestore.getDoc(ref);
        if (!snap.exists()) return false;
        const d = snap.data() || {};
        return !!(d.reelWebmStorageUrl || d.reelMp4StorageUrl || d.reelUrl);
      } catch (_) {
        return false;
      }
    },
    /** True if we should not record another reel for this calendar day (this browser or Firestore already has one). */
    async shouldSkipZapierReelCapture(dateKey) {
      if (UtilsCore.hasSyncedZapierReelForDate(dateKey)) return true;
      if (await UtilsCore.zapierReelDocAlreadyHasVideo(dateKey)) {
        UtilsCore.markSyncedZapierReelForDate(dateKey);
        return true;
      }
      return false;
    },
    /**
     * Serializes reel capture + upload so overlapping saves cannot start two MediaRecorders.
     * @param {() => Promise<void>} jobFn
     */
    enqueueZapierReelCapture(jobFn) {
      if (UtilsCore._zapierReelCaptureChain == null) {
        UtilsCore._zapierReelCaptureChain = Promise.resolve();
      }
      const run = UtilsCore._zapierReelCaptureChain.then(() => jobFn());
      UtilsCore._zapierReelCaptureChain = run.catch(() => {});
      return run;
    },
    /** Same string Zapier/IG should use as caption — must match PNG + reel (`getQuoteResolvedForInstagramDateKey`). */
    formatZapierCaptionFromQuote(q) {
      if (!q || typeof q !== 'object') return '';
      const t = String(q.text ?? q.body ?? '').trim();
      const a = String(q.author ?? '').trim();
      const wi = String(q.whatIf ?? q.what_if ?? '').trim();
      const core = t && a ? `${t} — ${a}` : t || a || '';
      let body = '';
      if (!wi) body = core;
      else if (!core) body = wi;
      else body = `${core}\n\nWhat if: ${wi}`;
      const trimmed = String(body).trim();
      if (!trimmed) return '';
      return `${trimmed}\n\nOUR DAILY QUILT`;
    },
    /**
     * Firestore forbids nested arrays. Persist triangle verts as {x,y}; normalize back on load.
     */
    normalizeHstTrianglesFromFirestore(raw) {
      if (!Array.isArray(raw) || raw.length === 0) return undefined;
      const out = [];
      for (const t of raw) {
        if (!t || typeof t !== 'object') continue;
        const pts = [];
        for (const p of t.points || []) {
          if (Array.isArray(p)) {
            pts.push([Number(p[0]), Number(p[1])]);
          } else if (p && typeof p === 'object') {
            pts.push([Number(p.x), Number(p.y)]);
          }
        }
        if (pts.length >= 3) out.push({ color: t.color, points: pts });
      }
      return out.length ? out : undefined;
    },
    hstTrianglesForFirestore(tris) {
      if (!Array.isArray(tris) || tris.length === 0) return undefined;
      return tris.map((t) => ({
        color: t.color,
        points: (t.points || []).map((p) => {
          const x = Array.isArray(p) ? p[0] : p.x;
          const y = Array.isArray(p) ? p[1] : p.y;
          return { x: Number(x), y: Number(y) };
        })
      }));
    },
    normalizePolygonPiecesFromFirestore(raw) {
      return UtilsCore.normalizeHstTrianglesFromFirestore(raw);
    },
    polygonPiecesForFirestore(pieces) {
      return UtilsCore.hstTrianglesForFirestore(pieces);
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
