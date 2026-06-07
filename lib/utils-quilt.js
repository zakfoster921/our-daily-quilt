/**
 * Quilt viewport dimensions, HST triangle helpers, and stable fingerprints.
 * Extends UtilsCore static methods. Requires lib/utils-core.js first.
 */
(function (root) {
  'use strict';

  const UtilsCore = root.UtilsCore;
  if (!UtilsCore) {
    throw new Error('lib/utils-core.js must load before lib/utils-quilt.js');
  }

  const LEGACY_CANVAS_WIDTH = 1070;
  const LEGACY_CANVAS_HEIGHT = 1340;

  Object.assign(UtilsCore, {
    getQuiltDimensions(dateKey = null) {
      const key =
        String(dateKey || '').trim() ||
        (typeof UtilsCore.getTodayKey === 'function' ? UtilsCore.getTodayKey() : '');

      const width = LEGACY_CANVAS_WIDTH;
      let height = LEGACY_CANVAS_HEIGHT;

      if (typeof QuiltMirrorLayout !== 'undefined' && typeof QuiltMirrorLayout.getDailyCanvasHeight === 'function') {
        height = QuiltMirrorLayout.getDailyCanvasHeight(key);
      }

      return {
        width,
        height,
        viewBoxWidth: width,
        viewBoxHeight: height
      };
    },
    getHstRenderTriangles(block) {
      if (!block || block.patternType !== 'special' || block.specialPatternType !== 'hst') {
        return [];
      }
      if (Array.isArray(block.hstTriangles) && block.hstTriangles.length) {
        return block.hstTriangles.map((t) => ({
          color: t.color,
          points: (t.points || []).map((p) => {
            if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
            if (p && typeof p === 'object') return [Number(p.x), Number(p.y)];
            return [0, 0];
          })
        }));
      }
      const w = Number(block.width);
      const h = Number(block.height);
      const c1 = typeof block.color === 'string' ? block.color : '#c8c4bf';
      const c2 = typeof block.hstColorB === 'string' ? block.hstColorB : c1;
      const diag = block.hstDiagonal === 'ne-sw' ? 'ne-sw' : 'nw-se';
      if (diag === 'nw-se') {
        return [
          { color: c1, points: [[0, 0], [0, h], [w, h]] },
          { color: c2, points: [[0, 0], [w, 0], [w, h]] }
        ];
      }
      return [
        { color: c1, points: [[0, 0], [w, 0], [0, h]] },
        { color: c2, points: [[w, 0], [w, h], [0, h]] }
      ];
    },
    computeQuiltFingerprint(blocks) {
      if (!Array.isArray(blocks) || blocks.length === 0) return '';
      const normalized = blocks
        .filter((b) => b && typeof b.x === 'number' && b.width > 0 && b.height > 0)
        .map((b) => ({
          x: Math.round(b.x),
          y: Math.round(b.y),
          w: Math.round(b.width),
          h: Math.round(b.height),
          c: String(b.color || '').trim().toLowerCase(),
          hst:
            b.patternType === 'special' && b.specialPatternType === 'hst'
              ? (() => {
                  const tris = UtilsCore.getHstRenderTriangles(b);
                  if (tris.length && Array.isArray(b.hstTriangles) && b.hstTriangles.length) {
                    const enc = tris
                      .map((t) => ({
                        c: String(t.color || '').trim().toLowerCase(),
                        p: (t.points || []).map((pt) => [Math.round(pt[0] * 100) / 100, Math.round(pt[1] * 100) / 100])
                      }))
                      .sort((a, b) => a.c.localeCompare(b.c) || JSON.stringify(a.p).localeCompare(JSON.stringify(b.p)));
                    return `tri:${JSON.stringify(enc)}`;
                  }
                  return `${String(b.hstDiagonal || 'nw-se')}:${String(b.hstColorB || '').trim().toLowerCase()}`;
                })()
              : '',
          poly:
            Array.isArray(b.polygonPieces) && b.polygonPieces.length
              ? (() => {
                  const enc = b.polygonPieces
                    .map((piece) => ({
                      c: String(piece.color || '').trim().toLowerCase(),
                      p: (piece.points || []).map((pt) => {
                        const x = Array.isArray(pt) ? pt[0] : pt?.x;
                        const y = Array.isArray(pt) ? pt[1] : pt?.y;
                        return [Math.round(Number(x) * 100) / 100, Math.round(Number(y) * 100) / 100];
                      })
                    }))
                    .sort((a, b) => a.c.localeCompare(b.c) || JSON.stringify(a.p).localeCompare(JSON.stringify(b.p)));
                  return `poly:${JSON.stringify(enc)}`;
                })()
              : '',
          inset:
            b.patternType === 'special' && b.specialPatternType === 'insetCircle'
              ? `inset:${b.insetTier ?? 0}:${String(b.insetInnerColor || '').trim().toLowerCase()}:${Math.round(Number(b.insetCx) || 0)}:${Math.round(Number(b.insetCy) || 0)}:${Math.round(Number(b.insetR) || 0)}:${b.insetNextCutVertical === true ? '1' : b.insetNextCutVertical === false ? '0' : 'u'}`
              : ''
        }))
        .sort((a, b) =>
          a.x - b.x ||
          a.y - b.y ||
          a.w - b.w ||
          a.h - b.h ||
          a.c.localeCompare(b.c) ||
          a.hst.localeCompare(b.hst) ||
          a.poly.localeCompare(b.poly) ||
          a.inset.localeCompare(b.inset)
        );
      if (!normalized.length) return '';
      const canonical = normalized
        .map((b) => `${b.x},${b.y},${b.w},${b.h},${b.c},${b.hst},${b.poly},${b.inset}`)
        .join('|');
      // 32-bit FNV-1a (hex) with length prefix for quick mismatch checks.
      let h = 0x811c9dc5;
      for (let i = 0; i < canonical.length; i++) {
        h ^= canonical.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return `qfp-v1-${normalized.length}-${h.toString(16).padStart(8, '0')}`;
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
