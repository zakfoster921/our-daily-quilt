/**
 * Mirror overlap + crop math for live quilt screen and exports.
 * Exposes globalThis.QuiltMirrorLayout.
 */
(function (root) {
  'use strict';

  const HORIZONTAL_STRETCH = 1.16;
  const MIRROR_SEAM_OVERLAP_PX = 8;
  const OVERLAP_PERCENT_MIN = 0.02;
  const OVERLAP_PERCENT_MAX = 0.4;
  const SEAM_VIEWPORT_MIN = 0.25;
  const SEAM_VIEWPORT_MAX = 0.75;
  const CANVAS_WIDTH = 1070;
  const CANVAS_HEIGHT_MIN = 900;
  const CANVAS_HEIGHT_MAX = 1300;
  const CANVAS_HEIGHT_REFERENCE = { width: 390, height: 720 };
  const DEFAULT_VIEWPORT = { width: 420, height: 720 };

  function hashUnit(input, salt) {
    let h = 2166136261;
    const s = `${String(input || '')}|${String(salt || '')}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }

  function resolveDateKey(dateKey) {
    const explicit = String(dateKey || '').trim();
    if (explicit) return explicit;
    if (typeof Utils !== 'undefined' && typeof Utils.getTodayKey === 'function') {
      return Utils.getTodayKey();
    }
    return '';
  }

  function getDailyLayout(dateKey) {
    const key = resolveDateKey(dateKey);
    const overlapPercent =
      OVERLAP_PERCENT_MIN + hashUnit(key, 'overlap') * (OVERLAP_PERCENT_MAX - OVERLAP_PERCENT_MIN);
    const targetSeamFraction =
      SEAM_VIEWPORT_MIN + hashUnit(key, 'seam') * (SEAM_VIEWPORT_MAX - SEAM_VIEWPORT_MIN);
    return {
      dateKey: key,
      overlapPercent,
      targetSeamFraction,
      mirrorSeamOffsetRatio: 1 - overlapPercent,
      canvasHeight: canvasHeightForLayout({
        targetSeamFraction,
        overlapPercent,
        dateKey: key
      })
    };
  }

  function canvasHeightForLayout(layout) {
    const targetSeamFraction = clampSeamTarget(layout?.targetSeamFraction);
    const overlapPercent = Math.max(
      OVERLAP_PERCENT_MIN,
      Math.min(OVERLAP_PERCENT_MAX, Number(layout?.overlapPercent) || OVERLAP_PERCENT_MIN)
    );
    const padding = screenEdgePadding(CANVAS_WIDTH);
    const ref = CANVAS_HEIGHT_REFERENCE;
    let bestH = CANVAS_HEIGHT_MIN;
    let bestErr = Infinity;

    for (let i = 0; i <= 48; i++) {
      const quiltH =
        CANVAS_HEIGHT_MIN + ((CANVAS_HEIGHT_MAX - CANVAS_HEIGHT_MIN) * i) / 48;
      const solved = solveViewBox({
        minX: 0,
        minY: 0,
        quiltW: CANVAS_WIDTH,
        quiltH,
        overlapPercent,
        targetSeamFraction,
        padding,
        viewportW: ref.width,
        viewportH: ref.height
      });
      const err = Math.abs(solved.seamFraction - targetSeamFraction);
      if (err < bestErr) {
        bestErr = err;
        bestH = quiltH;
      }
    }

    return Math.round(bestH);
  }

  function getDailyCanvasHeight(dateKey) {
    return canvasHeightForLayout(getDailyLayout(dateKey));
  }

  function mirroredFieldHeight(quiltH, overlapPercent) {
    const h = Math.max(0, Number(quiltH) || 0);
    const p = Math.max(0, Math.min(0.95, Number(overlapPercent) || 0));
    return h * (2 - p);
  }

  function mirrorSeamOffsetForHeight(quiltH, overlapPercent) {
    const h = Math.max(0, Number(quiltH) || 0);
    const p = Math.max(0, Math.min(0.95, Number(overlapPercent) || 0));
    return h * (1 - p);
  }

  function screenEdgePadding(quiltW) {
    return -Math.max(6, (Number(quiltW) || 0) * 0.02);
  }

  function exportEdgePadding(quiltW, paddingRatio = 0.02) {
    return Math.max(4, (Number(quiltW) || 0) * paddingRatio);
  }

  function sliceScale(viewportW, viewportH, vbW, vbH) {
    const w = Math.max(1, Number(viewportW) || 1);
    const h = Math.max(1, Number(viewportH) || 1);
    const vw = Math.max(1e-6, Number(vbW) || 1);
    const vh = Math.max(1e-6, Number(vbH) || 1);
    return Math.max(w / vw, h / vh);
  }

  function resolveViewport(viewportW, viewportH) {
    const w = Number(viewportW);
    const h = Number(viewportH);
    if (w > 0 && h > 0) return { width: w, height: h };
    if (typeof document !== 'undefined') {
      const container = document.querySelector('#screen-quilt .quilt-container')
        || document.querySelector('.quilt-container');
      const rect = container?.getBoundingClientRect?.();
      if (rect && rect.width > 0 && rect.height > 0) {
        return { width: rect.width, height: rect.height };
      }
    }
    if (typeof window !== 'undefined') {
      return {
        width: Math.max(320, window.innerWidth * 0.7),
        height: Math.max(480, window.innerHeight)
      };
    }
    return { ...DEFAULT_VIEWPORT };
  }

  function seamFractionFor(minY, quiltH, vbY, scale, viewportH) {
    const foldY = minY + quiltH;
    return (scale * (foldY - vbY)) / Math.max(1, viewportH);
  }

  function clampSeamTarget(targetSeamFraction) {
    return Math.max(SEAM_VIEWPORT_MIN, Math.min(SEAM_VIEWPORT_MAX, Number(targetSeamFraction) || 0.5));
  }

  function contentViewBoxWidth(quiltW, horizontalStretch, padding) {
    return quiltW * horizontalStretch + padding * 2;
  }

  function solveViewBox(options) {
    const minX = Number(options.minX) || 0;
    const minY = Number(options.minY) || 0;
    const quiltW = Math.max(1e-6, Number(options.quiltW) || 1);
    const quiltH = Math.max(1e-6, Number(options.quiltH) || 1);
    const overlapPercent = Math.max(
      OVERLAP_PERCENT_MIN,
      Math.min(OVERLAP_PERCENT_MAX, Number(options.overlapPercent) || OVERLAP_PERCENT_MIN)
    );
    const horizontalStretch = Number(options.horizontalStretch) || HORIZONTAL_STRETCH;
    const padding = Number.isFinite(options.padding) ? Number(options.padding) : screenEdgePadding(quiltW);
    const viewport = resolveViewport(options.viewportW, options.viewportH);
    const targetSeamFraction = clampSeamTarget(options.targetSeamFraction);
    const primaryFullyVisible = options.primaryFullyVisible !== false;

    const fieldH = mirroredFieldHeight(quiltH, overlapPercent);
    const vbY = minY;
    const vbX = minX - padding;
    const contentVbW = contentViewBoxWidth(quiltW, horizontalStretch, padding);
    const minCropH = primaryFullyVisible ? quiltH : quiltH * 0.85;
    const maxCropH = fieldH + Math.max(0, padding * 2);

    let best = null;
    let bestErr = Infinity;

    for (let i = 0; i <= 120; i++) {
      const cropH = minCropH + ((maxCropH - minCropH) * i) / 120;
      if (primaryFullyVisible && vbY + cropH + 1e-6 < minY + quiltH) continue;

      const scale = sliceScale(viewport.width, viewport.height, contentVbW, cropH);
      const seamFraction = seamFractionFor(minY, quiltH, vbY, scale, viewport.height);
      const err = Math.abs(seamFraction - targetSeamFraction);
      if (err < bestErr) {
        bestErr = err;
        best = {
          x: vbX,
          y: vbY,
          width: contentVbW,
          height: cropH,
          seamFraction,
          scale,
          overlapPercent,
          mirrorSeamOffset: mirrorSeamOffsetForHeight(quiltH, overlapPercent),
          mirroredFieldHeight: fieldH
        };
      }
    }

    if (!best) {
      const cropH = maxCropH;
      const scale = sliceScale(viewport.width, viewport.height, contentVbW, cropH);
      best = {
        x: vbX,
        y: vbY,
        width: contentVbW,
        height: cropH,
        seamFraction: seamFractionFor(minY, quiltH, vbY, scale, viewport.height),
        scale,
        overlapPercent,
        mirrorSeamOffset: mirrorSeamOffsetForHeight(quiltH, overlapPercent),
        mirroredFieldHeight: fieldH
      };
    }
    return best;
  }

  function computeFromBounds(bounds, options = {}) {
    const minX = Number(bounds?.minX) || 0;
    const minY = Number(bounds?.minY) || 0;
    const quiltW = Math.max(1e-6, Number(bounds?.width) || 1);
    const quiltH = Math.max(1e-6, Number(bounds?.height) || 1);
    const layout = getDailyLayout(options.dateKey);
    const padding = options.forExport
      ? exportEdgePadding(quiltW, options.paddingRatio)
      : screenEdgePadding(quiltW);
    const viewBox = solveViewBox({
      minX,
      minY,
      quiltW,
      quiltH,
      overlapPercent: layout.overlapPercent,
      targetSeamFraction: layout.targetSeamFraction,
      padding,
      viewportW: options.viewportW,
      viewportH: options.viewportH,
      horizontalStretch: options.horizontalStretch || HORIZONTAL_STRETCH,
      primaryFullyVisible: options.primaryFullyVisible !== false
    });
    return {
      layout,
      viewBox,
      mirrorSeamOffset: viewBox.mirrorSeamOffset,
      mirroredFieldHeight: viewBox.mirroredFieldHeight,
      mirrorSeamOverlapPx: MIRROR_SEAM_OVERLAP_PX,
      horizontalStretch: options.horizontalStretch || HORIZONTAL_STRETCH,
      padding
    };
  }

  function computeFromBlocks(blocks, options = {}) {
    if (!Array.isArray(blocks) || blocks.length === 0) return null;
    const minX = Math.min(...blocks.map((b) => Number(b.x)));
    const minY = Math.min(...blocks.map((b) => Number(b.y)));
    const maxX = Math.max(...blocks.map((b) => Number(b.x) + Number(b.width)));
    const maxY = Math.max(...blocks.map((b) => Number(b.y) + Number(b.height)));
    const quiltW = maxX - minX;
    const quiltH = maxY - minY;
    if (!(quiltW > 0) || !(quiltH > 0)) return null;
    return computeFromBounds({ minX, minY, width: quiltW, height: quiltH }, options);
  }

  function viewBoxPartsFromBlocks(blocks, options = {}) {
    const result = computeFromBlocks(blocks, options);
    if (!result) return null;
    const vb = result.viewBox;
    return [vb.x, vb.y, vb.width, vb.height];
  }

  function mirrorTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset) {
    const tx = minX + quiltW;
    const ty = minY + quiltH + mirrorSeamOffset - MIRROR_SEAM_OVERLAP_PX;
    return `translate(${tx} ${ty}) scale(-1 -1)`;
  }

  function computeComposePlacements(outW, outH, sourceW, sourceH, dateKey, opts = {}) {
    const layout = getDailyLayout(dateKey);
    const paddingRatio = opts.paddingRatio != null ? opts.paddingRatio : 0.02;
    const result = computeFromBounds(
      { minX: 0, minY: 0, width: sourceW, height: sourceH },
      {
        dateKey,
        viewportW: outW,
        viewportH: outH,
        forExport: true,
        paddingRatio
      }
    );
    const vb = result.viewBox;
    const scale = sliceScale(outW, outH, vb.width, vb.height);
    const drawW = sourceW * scale;
    const drawH = sourceH * scale;
    const startX = (outW - vb.width * scale) / 2;
    const primaryY = -vb.y * scale;
    const overlapDraw = layout.overlapPercent * drawH;
    const mirrorY = primaryY + drawH - overlapDraw;
    return {
      layout,
      scale,
      drawW,
      drawH,
      startX,
      primaryY,
      mirrorY,
      overlapDraw
    };
  }

  root.QuiltMirrorLayout = {
    HORIZONTAL_STRETCH,
    MIRROR_SEAM_OVERLAP_PX,
    OVERLAP_PERCENT_MIN,
    OVERLAP_PERCENT_MAX,
    SEAM_VIEWPORT_MIN,
    SEAM_VIEWPORT_MAX,
    CANVAS_WIDTH,
    CANVAS_HEIGHT_MIN,
    CANVAS_HEIGHT_MAX,
    getDailyLayout,
    getDailyCanvasHeight,
    canvasHeightForLayout,
    mirroredFieldHeight,
    mirrorSeamOffsetForHeight,
    screenEdgePadding,
    exportEdgePadding,
    sliceScale,
    solveViewBox,
    computeFromBounds,
    computeFromBlocks,
    viewBoxPartsFromBlocks,
    mirrorTransform,
    computeComposePlacements
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
