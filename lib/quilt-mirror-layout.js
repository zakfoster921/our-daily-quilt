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
  /** Fold-touching blocks must keep at least this fraction of height outside the overlap band. */
  const SEAM_BLOCK_MIN_VISIBLE_FRACTION = 0.3;
  const SEAM_BLOCK_TOUCH_EPS_PX = 2;
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

  /**
   * Tightest overlapPercent so each fold-touching block keeps SEAM_BLOCK_MIN_VISIBLE_FRACTION
   * of its height outside the overlap band (overlapPx <= (1 - minVisible) * block.height).
   */
  function maxOverlapPercentForSeamBlocks(blocks, minY, quiltH) {
    if (!Array.isArray(blocks) || blocks.length === 0 || !(quiltH > 0)) return null;
    const foldY = minY + quiltH;
    const maxCoverFraction = 1 - SEAM_BLOCK_MIN_VISIBLE_FRACTION;
    let tightestCap = Infinity;
    let found = false;
    for (const block of blocks) {
      if (!block) continue;
      const y = Number(block.y);
      const h = Number(block.height);
      if (![y, h].every(Number.isFinite) || h <= 0) continue;
      if (y + h < foldY - SEAM_BLOCK_TOUCH_EPS_PX) continue;
      found = true;
      const cap = (maxCoverFraction * h) / quiltH;
      if (cap < tightestCap) tightestCap = cap;
    }
    return found && Number.isFinite(tightestCap) ? tightestCap : null;
  }

  function resolveEffectiveOverlapPercent(seededPercent, blocks, minY, quiltH) {
    const seeded = Math.max(
      OVERLAP_PERCENT_MIN,
      Math.min(OVERLAP_PERCENT_MAX, Number(seededPercent) || OVERLAP_PERCENT_MIN)
    );
    const shapeCap = maxOverlapPercentForSeamBlocks(blocks, minY, quiltH);
    let overlapPercent = Math.min(seeded, OVERLAP_PERCENT_MAX);
    let shapeCapped = false;
    if (shapeCap != null && shapeCap < overlapPercent) {
      overlapPercent = shapeCap;
      shapeCapped = true;
    }
    if (!shapeCapped || overlapPercent >= OVERLAP_PERCENT_MIN) {
      overlapPercent = Math.max(OVERLAP_PERCENT_MIN, overlapPercent);
    }
    return {
      overlapPercent,
      shapeCapped,
      shapeCap
    };
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
    const rawOverlap = Number(options.overlapPercent) || OVERLAP_PERCENT_MIN;
    const overlapPercent = options.shapeOverlapCapped && rawOverlap < OVERLAP_PERCENT_MIN
      ? Math.min(OVERLAP_PERCENT_MAX, rawOverlap)
      : Math.max(
          OVERLAP_PERCENT_MIN,
          Math.min(OVERLAP_PERCENT_MAX, rawOverlap)
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

  /**
   * 2×2 quadrant layout: primary stays top-left on parallax layer; returns transforms
   * for top-right (flip X), bottom-left (flip Y), bottom-right (flip X+Y).
   * Each mirror is across the seam between quadrants.
   */
  function quadrantFourUpTransforms(minX, minY, quiltW, quiltH) {
    void quiltW;
    void quiltH;
    const seamX = minX + quiltW;
    const seamY = minY + quiltH;
    return [
      `translate(${seamX} 0) scale(-1 1) translate(${-seamX} 0)`,
      `translate(0 ${seamY}) scale(1 -1) translate(0 ${-seamY})`,
      `translate(${seamX} ${seamY}) scale(-1 -1) translate(${-seamX} ${-seamY})`
    ];
  }

  /**
   * ViewBox for 4-up: start from the primary-safe crop, expand to viewport aspect, anchor top-left.
   */
  function solveViewBoxQuadrants(options) {
    const minX = Number(options.minX) || 0;
    const minY = Number(options.minY) || 0;
    const quiltW = Math.max(1e-6, Number(options.quiltW) || 1);
    const quiltH = Math.max(1e-6, Number(options.quiltH) || 1);
    const padding = Number.isFinite(options.padding)
      ? Number(options.padding)
      : screenEdgePadding(quiltW);
    const viewport = resolveViewport(options.viewportW, options.viewportH);
    const viewportAspect = viewport.width / Math.max(1, viewport.height);

    const base = solveViewBox({
      minX,
      minY,
      quiltW,
      quiltH,
      overlapPercent: options.overlapPercent,
      shapeOverlapCapped: options.shapeOverlapCapped,
      targetSeamFraction: options.targetSeamFraction,
      padding,
      viewportW: options.viewportW,
      viewportH: options.viewportH,
      horizontalStretch: options.horizontalStretch || HORIZONTAL_STRETCH,
      primaryFullyVisible: true
    });

    let contentVbW = base.width;
    let contentVbH = base.height;
    if (contentVbW / contentVbH > viewportAspect) {
      contentVbH = contentVbW / viewportAspect;
    } else {
      contentVbW = contentVbH * viewportAspect;
    }

    const scale = sliceScale(viewport.width, viewport.height, contentVbW, contentVbH);

    return {
      ...base,
      x: base.x,
      y: base.y,
      width: contentVbW,
      height: contentVbH,
      scale,
      primaryVisibleFraction: Math.min(1, quiltH / contentVbH)
    };
  }

  function computeFromBounds(bounds, options = {}) {
    const minX = Number(bounds?.minX) || 0;
    const minY = Number(bounds?.minY) || 0;
    const quiltW = Math.max(1e-6, Number(bounds?.width) || 1);
    const quiltH = Math.max(1e-6, Number(bounds?.height) || 1);
    const dailyLayout = getDailyLayout(options.dateKey);
    const effectiveOverlap = resolveEffectiveOverlapPercent(
      dailyLayout.overlapPercent,
      options.blocks,
      minY,
      quiltH
    );
    const layout = {
      ...dailyLayout,
      overlapPercent: effectiveOverlap.overlapPercent,
      mirrorSeamOffsetRatio: 1 - effectiveOverlap.overlapPercent,
      shapeOverlapCapped: effectiveOverlap.shapeCapped,
      shapeOverlapCap: effectiveOverlap.shapeCap
    };
    const mirrorTune = odqReadMirrorTuneFromLocal(options.dateKey);
    const nudgeSeamY = odqNormalizeMirrorSeamNudge(mirrorTune?.nudgeSeamY);
    const padding = options.forExport
      ? exportEdgePadding(quiltW, options.paddingRatio)
      : screenEdgePadding(quiltW);
    const viewBox = options.quadrantFourUp
      ? solveViewBoxQuadrants({
          minX,
          minY,
          quiltW,
          quiltH,
          overlapPercent: layout.overlapPercent,
          shapeOverlapCapped: layout.shapeOverlapCapped,
          targetSeamFraction: layout.targetSeamFraction,
          padding,
          viewportW: options.viewportW,
          viewportH: options.viewportH,
          horizontalStretch: options.horizontalStretch || HORIZONTAL_STRETCH
        })
      : (() => {
          const solved = solveViewBox({
            minX,
            minY,
            quiltW,
            quiltH,
            overlapPercent: layout.overlapPercent,
            shapeOverlapCapped: layout.shapeOverlapCapped,
            targetSeamFraction: layout.targetSeamFraction,
            padding,
            viewportW: options.viewportW,
            viewportH: options.viewportH,
            horizontalStretch: options.horizontalStretch || HORIZONTAL_STRETCH,
            primaryFullyVisible: options.primaryFullyVisible !== false
          });
          if (nudgeSeamY !== 0) {
            return { ...solved, y: solved.y + nudgeSeamY * solved.height };
          }
          return solved;
        })();
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
    return computeFromBounds({ minX, minY, width: quiltW, height: quiltH }, { ...options, blocks });
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

  /** Same seam/overlap band as mirror, but second field is a straight copy (no flip). */
  function duplicateTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset) {
    void minX;
    void minY;
    void quiltW;
    void quiltH;
    // Stack at the fold: second copy starts where the mirror overlap band begins.
    return `translate(0 ${mirrorSeamOffset - MIRROR_SEAM_OVERLAP_PX})`;
  }

  /** Nth straight duplicate below the fold (0 = first copy at seam). */
  function duplicateStackTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset, stackIndex) {
    void minX;
    void minY;
    void quiltW;
    const firstTy = mirrorSeamOffset - MIRROR_SEAM_OVERLAP_PX;
    const stackStep = quiltH + mirrorSeamOffset - 2 * MIRROR_SEAM_OVERLAP_PX;
    const index = Math.max(0, Number(stackIndex) || 0);
    return `translate(0 ${firstTy + index * stackStep})`;
  }

  /**
   * One tile in the dup×2 bottom row: offset horizontally, optional flip X/Y.
   */
  function duplicateBottomTileTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset, opts = {}) {
    const offsetX = Number(opts.offsetX) || 0;
    const flipX = odqNormalizeMirrorFlipFlag(opts.flipX, false);
    const flipY = odqNormalizeMirrorFlipFlag(opts.flipY, false);
    const firstTy = mirrorSeamOffset - MIRROR_SEAM_OVERLAP_PX;
    const cx = minX + quiltW / 2;
    const cy = minY + quiltH / 2;
    const foldY = minY + quiltH - MIRROR_SEAM_OVERLAP_PX;
    let transform = `translate(${offsetX} ${firstTy})`;
    if (!flipX && !flipY) return transform;
    if (!flipX && flipY) {
      return `${transform} translate(0 ${foldY}) scale(1 -1) translate(0 ${-foldY})`;
    }
    if (flipX && !flipY) {
      return `${transform} translate(${cx} 0) scale(-1 1) translate(${-cx} 0)`;
    }
    return `${transform} translate(${cx} ${cy}) scale(-1 -1) translate(${-cx} ${-cy})`;
  }

  function duplicateDoubleBottomTransformsFromFlags(
    minX,
    minY,
    quiltW,
    quiltH,
    mirrorSeamOffset,
    leftFlags = {},
    rightFlags = {}
  ) {
    const halfW = quiltW / 2;
    return [
      duplicateBottomTileTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset, {
        offsetX: 0,
        flipX: leftFlags.flipX,
        flipY: leftFlags.flipY
      }),
      duplicateBottomTileTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset, {
        offsetX: halfW,
        flipX: rightFlags.flipX,
        flipY: rightFlags.flipY
      })
    ];
  }

  /**
   * Primary on top; dup1 at fold; dup2 shifted right half a quilt width so both
   * fill the bottom half side-by-side within the standard single-quilt viewBox crop.
   */
  function duplicateDoubleBottomTransforms(minX, minY, quiltW, quiltH, mirrorSeamOffset) {
    void minX;
    void minY;
    void quiltH;
    const firstTy = mirrorSeamOffset - MIRROR_SEAM_OVERLAP_PX;
    const halfW = quiltW / 2;
    return [
      `translate(0 ${firstTy})`,
      `translate(${halfW} ${firstTy})`
    ];
  }

  /**
   * Same as duplicateDoubleBottomTransforms, but dup1 (bottom-left) is flipped on X.
   */
  function duplicateDoubleBottomFlipLeftTransforms(minX, minY, quiltW, quiltH, mirrorSeamOffset) {
    const firstTy = mirrorSeamOffset - MIRROR_SEAM_OVERLAP_PX;
    const halfW = quiltW / 2;
    const cx = minX + quiltW / 2;
    return [
      `translate(0 ${firstTy}) translate(${cx} 0) scale(-1 1) translate(${-cx} 0)`,
      `translate(${halfW} ${firstTy})`
    ];
  }

  /** Bottom field is a vertical reflection of the primary across the fold (no horizontal flip). */
  function duplicateFlipYTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset) {
    void minX;
    void quiltW;
    void mirrorSeamOffset;
    const foldY = minY + quiltH - MIRROR_SEAM_OVERLAP_PX;
    return `translate(0 ${foldY}) scale(1 -1) translate(0 ${-foldY})`;
  }

  /** Bottom field is stacked at the seam, then flipped horizontally only (not vertically). */
  function duplicateFlipXTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset) {
    void minY;
    void quiltH;
    const ty = mirrorSeamOffset - MIRROR_SEAM_OVERLAP_PX;
    const cx = minX + quiltW / 2;
    return `translate(0 ${ty}) translate(${cx} 0) scale(-1 1) translate(${-cx} 0)`;
  }

  /**
   * Compress the duplicate on Y only so every block fits below the fold at full quilt width.
   */
  function duplicateFitBottomTransform(minX, minY, quiltW, quiltH, viewBoxY, viewBoxHeight) {
    void quiltW;
    const foldY = minY + quiltH;
    const availableBottom = Math.max(1e-6, viewBoxY + viewBoxHeight - foldY);
    const fitScaleY = Math.min(1, availableBottom / quiltH);
    const ty = foldY - MIRROR_SEAM_OVERLAP_PX;
    return {
      transform: `translate(${minX} ${ty}) scale(1 ${fitScaleY}) translate(${-minX} ${-minY})`,
      fitScale: fitScaleY,
      fitScaleY,
      availableBottom
    };
  }

  function duplicateFitBottomScale(minX, minY, quiltH, viewBoxY, viewBoxHeight) {
    void minX;
    const foldY = minY + quiltH;
    const availableBottom = Math.max(1e-6, viewBoxY + viewBoxHeight - foldY);
    return Math.min(1, availableBottom / Math.max(1e-6, quiltH));
  }

  const MIRROR_BOTTOM_LAYOUT_SINGLE = 'single';
  const MIRROR_BOTTOM_LAYOUT_DOUBLE = 'doubleSideBySide';

  const MIRROR_TUNE_DEFAULT = Object.freeze({
    bottomLayout: MIRROR_BOTTOM_LAYOUT_SINGLE,
    flipX: true,
    flipY: true,
    leftFlipX: false,
    leftFlipY: false,
    rightFlipX: false,
    rightFlipY: false,
    nudgeSeamY: 0,
    nudgeMirrorY: 0
  });
  const MIRROR_SEAM_NUDGE_STEP = 0.02;
  const MIRROR_SEAM_BIG_NUDGE_MUL = 5;
  const MIRROR_SEAM_NUDGE_MIN = -0.35;
  const MIRROR_SEAM_NUDGE_MAX = 0.35;

  function odqNormalizeMirrorSeamNudge(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(MIRROR_SEAM_NUDGE_MIN, Math.min(MIRROR_SEAM_NUDGE_MAX, n));
  }

  function odqMirrorSeamNudgeStep(big) {
    return MIRROR_SEAM_NUDGE_STEP * (big ? MIRROR_SEAM_BIG_NUDGE_MUL : 1);
  }

  function odqAppendMirrorFieldNudgeTransform(transform, nudgeMirrorY, viewBoxHeight) {
    const dy = odqNormalizeMirrorSeamNudge(nudgeMirrorY) * Number(viewBoxHeight);
    if (!Number.isFinite(dy) || Math.abs(dy) < 1e-6) return transform;
    return `${transform} translate(0 ${dy})`;
  }

  function odqMirrorTuneStorageKey(dateKey) {
    return `odq.mirrorTune.${String(dateKey || '').trim()}`;
  }

  function odqNormalizeMirrorFlipFlag(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
    return fallback;
  }

  function odqNormalizeMirrorBottomLayout(value) {
    return String(value || '').trim() === MIRROR_BOTTOM_LAYOUT_DOUBLE
      ? MIRROR_BOTTOM_LAYOUT_DOUBLE
      : MIRROR_BOTTOM_LAYOUT_SINGLE;
  }

  function odqMirrorBottomLayoutIsDouble(tune) {
    return odqNormalizeMirrorBottomLayout(tune?.bottomLayout) === MIRROR_BOTTOM_LAYOUT_DOUBLE;
  }

  function odqMirrorTileFlipLabel(prefix, flipX, flipY) {
    const fx = odqNormalizeMirrorFlipFlag(flipX, false);
    const fy = odqNormalizeMirrorFlipFlag(flipY, false);
    if (!fx && !fy) return `${prefix}:—`;
    const parts = [];
    if (fx) parts.push('X');
    if (fy) parts.push('Y');
    return `${prefix}:${parts.join('')}`;
  }

  function odqParseMirrorTuneRaw(raw) {
    if (!raw || typeof raw !== 'object') return { ...MIRROR_TUNE_DEFAULT, updatedAt: '' };
    return {
      bottomLayout: odqNormalizeMirrorBottomLayout(raw.bottomLayout),
      flipX: odqNormalizeMirrorFlipFlag(raw.flipX, MIRROR_TUNE_DEFAULT.flipX),
      flipY: odqNormalizeMirrorFlipFlag(raw.flipY, MIRROR_TUNE_DEFAULT.flipY),
      leftFlipX: odqNormalizeMirrorFlipFlag(raw.leftFlipX, MIRROR_TUNE_DEFAULT.leftFlipX),
      leftFlipY: odqNormalizeMirrorFlipFlag(raw.leftFlipY, MIRROR_TUNE_DEFAULT.leftFlipY),
      rightFlipX: odqNormalizeMirrorFlipFlag(raw.rightFlipX, MIRROR_TUNE_DEFAULT.rightFlipX),
      rightFlipY: odqNormalizeMirrorFlipFlag(raw.rightFlipY, MIRROR_TUNE_DEFAULT.rightFlipY),
      nudgeSeamY: odqNormalizeMirrorSeamNudge(raw.nudgeSeamY),
      nudgeMirrorY: odqNormalizeMirrorSeamNudge(raw.nudgeMirrorY),
      updatedAt: String(raw.updatedAt || '').trim()
    };
  }

  function odqMirrorTuneFromQuiltData(data) {
    const d = data && typeof data === 'object' ? data : {};
    const hasFields =
      Object.prototype.hasOwnProperty.call(d, 'mirrorFlipX') ||
      Object.prototype.hasOwnProperty.call(d, 'mirrorFlipY') ||
      Object.prototype.hasOwnProperty.call(d, 'mirrorSeamNudgeY') ||
      Object.prototype.hasOwnProperty.call(d, 'mirrorFieldNudgeY') ||
      Object.prototype.hasOwnProperty.call(d, 'mirrorBottomLayout') ||
      Object.prototype.hasOwnProperty.call(d, 'mirrorBottomLeftFlipX') ||
      Object.prototype.hasOwnProperty.call(d, 'mirrorBottomLeftFlipY') ||
      Object.prototype.hasOwnProperty.call(d, 'mirrorBottomRightFlipX') ||
      Object.prototype.hasOwnProperty.call(d, 'mirrorBottomRightFlipY');
    if (!hasFields) return { ...MIRROR_TUNE_DEFAULT, updatedAt: '' };
    return {
      bottomLayout: odqNormalizeMirrorBottomLayout(d.mirrorBottomLayout),
      flipX: odqNormalizeMirrorFlipFlag(d.mirrorFlipX, MIRROR_TUNE_DEFAULT.flipX),
      flipY: odqNormalizeMirrorFlipFlag(d.mirrorFlipY, MIRROR_TUNE_DEFAULT.flipY),
      leftFlipX: odqNormalizeMirrorFlipFlag(d.mirrorBottomLeftFlipX, MIRROR_TUNE_DEFAULT.leftFlipX),
      leftFlipY: odqNormalizeMirrorFlipFlag(d.mirrorBottomLeftFlipY, MIRROR_TUNE_DEFAULT.leftFlipY),
      rightFlipX: odqNormalizeMirrorFlipFlag(d.mirrorBottomRightFlipX, MIRROR_TUNE_DEFAULT.rightFlipX),
      rightFlipY: odqNormalizeMirrorFlipFlag(d.mirrorBottomRightFlipY, MIRROR_TUNE_DEFAULT.rightFlipY),
      nudgeSeamY: odqNormalizeMirrorSeamNudge(d.mirrorSeamNudgeY),
      nudgeMirrorY: odqNormalizeMirrorSeamNudge(d.mirrorFieldNudgeY),
      updatedAt: String(d.mirrorTuneUpdatedAt || '').trim()
    };
  }

  function odqMirrorTuneIsCustomized(tune) {
    const t = tune || MIRROR_TUNE_DEFAULT;
    if (odqMirrorBottomLayoutIsDouble(t)) return true;
    return (
      t.flipX !== MIRROR_TUNE_DEFAULT.flipX ||
      t.flipY !== MIRROR_TUNE_DEFAULT.flipY ||
      odqNormalizeMirrorSeamNudge(t.nudgeSeamY) !== 0 ||
      odqNormalizeMirrorSeamNudge(t.nudgeMirrorY) !== 0
    );
  }

  function odqMirrorTuneModeLabel(tune) {
    const t = tune || MIRROR_TUNE_DEFAULT;
    if (odqMirrorBottomLayoutIsDouble(t)) {
      return `Dup ×2 (${odqMirrorTileFlipLabel('L', t.leftFlipX, t.leftFlipY)} ${odqMirrorTileFlipLabel('R', t.rightFlipX, t.rightFlipY)})`;
    }
    if (!t.flipX && !t.flipY) return 'Duplicate';
    if (!t.flipX && t.flipY) return 'Flip Y';
    if (t.flipX && !t.flipY) return 'Flip X';
    return 'Mirror';
  }

  const MIRROR_TUNE_HISTORY_MAX = 80;

  function odqMirrorTuneHistoryStorageKey(dateKey) {
    return `odq.mirrorTuneHistory.${String(dateKey || '').trim()}`;
  }

  function odqMirrorTuneSnapshotFields(tune) {
    const t = tune || MIRROR_TUNE_DEFAULT;
    return {
      bottomLayout: odqNormalizeMirrorBottomLayout(t.bottomLayout),
      flipX: odqNormalizeMirrorFlipFlag(t.flipX, MIRROR_TUNE_DEFAULT.flipX),
      flipY: odqNormalizeMirrorFlipFlag(t.flipY, MIRROR_TUNE_DEFAULT.flipY),
      leftFlipX: odqNormalizeMirrorFlipFlag(t.leftFlipX, MIRROR_TUNE_DEFAULT.leftFlipX),
      leftFlipY: odqNormalizeMirrorFlipFlag(t.leftFlipY, MIRROR_TUNE_DEFAULT.leftFlipY),
      rightFlipX: odqNormalizeMirrorFlipFlag(t.rightFlipX, MIRROR_TUNE_DEFAULT.rightFlipX),
      rightFlipY: odqNormalizeMirrorFlipFlag(t.rightFlipY, MIRROR_TUNE_DEFAULT.rightFlipY),
      nudgeSeamY: odqNormalizeMirrorSeamNudge(t.nudgeSeamY),
      nudgeMirrorY: odqNormalizeMirrorSeamNudge(t.nudgeMirrorY)
    };
  }

  /** Compact signature for Instagram quilt raster cache busting (mirror layout / nudges). */
  function odqMirrorTuneExportSignature(dateKey) {
    const snap = odqMirrorTuneSnapshotFields(odqReadMirrorTuneFromLocal(dateKey));
    return [
      snap.bottomLayout,
      snap.flipX ? 1 : 0,
      snap.flipY ? 1 : 0,
      snap.leftFlipX ? 1 : 0,
      snap.leftFlipY ? 1 : 0,
      snap.rightFlipX ? 1 : 0,
      snap.rightFlipY ? 1 : 0,
      snap.nudgeSeamY,
      snap.nudgeMirrorY
    ].join(':');
  }

  function odqMirrorTuneSnapshotsEqual(a, b) {
    const left = odqMirrorTuneSnapshotFields(a);
    const right = odqMirrorTuneSnapshotFields(b);
    return (
      left.bottomLayout === right.bottomLayout &&
      left.flipX === right.flipX &&
      left.flipY === right.flipY &&
      left.leftFlipX === right.leftFlipX &&
      left.leftFlipY === right.leftFlipY &&
      left.rightFlipX === right.rightFlipX &&
      left.rightFlipY === right.rightFlipY &&
      left.nudgeSeamY === right.nudgeSeamY &&
      left.nudgeMirrorY === right.nudgeMirrorY
    );
  }

  function odqBuildMirrorTuneHistoryEntry(beforeTune, afterTune, options = {}) {
    const before = odqMirrorTuneSnapshotFields(beforeTune);
    const after = odqMirrorTuneSnapshotFields(afterTune);
    if (odqMirrorTuneSnapshotsEqual(before, after)) return null;
    const at = String(options.at || new Date().toISOString()).trim();
    const action =
      String(options.action || '').trim() ||
      (odqMirrorTuneIsCustomized(after) ? 'save' : 'reset');
    return {
      at,
      action,
      source: String(options.source || 'admin-tune-modal').trim() || 'admin-tune-modal',
      before: { ...before, mode: odqMirrorTuneModeLabel(before) },
      after: { ...after, mode: odqMirrorTuneModeLabel(after) },
      customizedAfter: odqMirrorTuneIsCustomized(after),
      blockCount: Number.isFinite(options.blockCount) ? Math.floor(options.blockCount) : null
    };
  }

  function odqAppendMirrorTuneHistoryLocal(dateKey, entry) {
    if (!entry) return;
    const key = resolveDateKey(dateKey);
    if (!key) return;
    try {
      const storageKey = odqMirrorTuneHistoryStorageKey(key);
      const history = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(history)) return;
      history.push(entry);
      localStorage.setItem(
        storageKey,
        JSON.stringify(history.slice(-MIRROR_TUNE_HISTORY_MAX))
      );
    } catch (_) {
      /* ignore */
    }
  }

  function odqReadMirrorTuneHistoryLocal(dateKey) {
    const key = resolveDateKey(dateKey);
    if (!key) return [];
    try {
      const history = JSON.parse(
        localStorage.getItem(odqMirrorTuneHistoryStorageKey(key)) || '[]'
      );
      return Array.isArray(history) ? history : [];
    } catch (_) {
      return [];
    }
  }

  function odqIsoTimestampIsNewer(a, b) {
    const ta = Date.parse(String(a || ''));
    const tb = Date.parse(String(b || ''));
    if (!Number.isFinite(ta)) return false;
    if (!Number.isFinite(tb)) return true;
    return ta > tb;
  }

  function odqReadMirrorTuneFromLocal(dateKey) {
    const key = resolveDateKey(dateKey);
    try {
      const raw = localStorage.getItem(odqMirrorTuneStorageKey(key));
      if (raw) return odqParseMirrorTuneRaw(JSON.parse(raw));
    } catch (_) {
      /* ignore */
    }
    return { ...MIRROR_TUNE_DEFAULT, updatedAt: '' };
  }

  function odqWriteMirrorTuneLocal(dateKey, tune) {
    const key = resolveDateKey(dateKey);
    if (!key) return;
    const flipX = odqNormalizeMirrorFlipFlag(tune?.flipX, MIRROR_TUNE_DEFAULT.flipX);
    const flipY = odqNormalizeMirrorFlipFlag(tune?.flipY, MIRROR_TUNE_DEFAULT.flipY);
    const bottomLayout = odqNormalizeMirrorBottomLayout(tune?.bottomLayout);
    const leftFlipX = odqNormalizeMirrorFlipFlag(tune?.leftFlipX, MIRROR_TUNE_DEFAULT.leftFlipX);
    const leftFlipY = odqNormalizeMirrorFlipFlag(tune?.leftFlipY, MIRROR_TUNE_DEFAULT.leftFlipY);
    const rightFlipX = odqNormalizeMirrorFlipFlag(tune?.rightFlipX, MIRROR_TUNE_DEFAULT.rightFlipX);
    const rightFlipY = odqNormalizeMirrorFlipFlag(tune?.rightFlipY, MIRROR_TUNE_DEFAULT.rightFlipY);
    const nudgeSeamY = odqNormalizeMirrorSeamNudge(tune?.nudgeSeamY);
    const nudgeMirrorY = odqNormalizeMirrorSeamNudge(tune?.nudgeMirrorY);
    const payload = {
      bottomLayout,
      flipX,
      flipY,
      leftFlipX,
      leftFlipY,
      rightFlipX,
      rightFlipY,
      nudgeSeamY,
      nudgeMirrorY
    };
    const updatedAt = String(tune?.updatedAt || '').trim();
    if (updatedAt) payload.updatedAt = updatedAt;
    try {
      if (!odqMirrorTuneIsCustomized(payload)) {
        localStorage.removeItem(odqMirrorTuneStorageKey(key));
        return;
      }
      localStorage.setItem(odqMirrorTuneStorageKey(key), JSON.stringify(payload));
    } catch (_) {
      /* ignore */
    }
  }

  async function odqReadMirrorTune(dateKey) {
    const key = resolveDateKey(dateKey);
    const local = odqReadMirrorTuneFromLocal(key);
    if (!key || typeof window === 'undefined' || !window.db || !window.firestore) return local;
    const readQuiltDoc = async (preferServer) => {
      const ref = window.firestore.doc(window.db, 'quilts', key);
      if (preferServer && typeof window.firestore.getDocFromServer === 'function') {
        try {
          return await window.firestore.getDocFromServer(ref);
        } catch (serverErr) {
          console.warn('odqReadMirrorTune server read failed, using cache:', serverErr);
        }
      }
      return window.firestore.getDoc(ref);
    };
    try {
      const snap = await readQuiltDoc(true);
      if (!snap.exists()) return local;
      const remote = odqMirrorTuneFromQuiltData(snap.data() || {});
      const remoteCustom = odqMirrorTuneIsCustomized(remote);
      const localCustom = odqMirrorTuneIsCustomized(local);
      const remoteAt = remote.updatedAt;
      const localAt = local.updatedAt;
      let useRemote = false;
      if (remoteCustom && !localCustom) {
        useRemote = true;
      } else if (!remoteCustom && localCustom) {
        useRemote = odqIsoTimestampIsNewer(remoteAt, localAt);
      } else if (remoteCustom && localCustom) {
        if (odqIsoTimestampIsNewer(remoteAt, localAt)) useRemote = true;
        else if (!odqIsoTimestampIsNewer(localAt, remoteAt)) useRemote = true;
      }
      const winner = useRemote ? remote : local;
      if (useRemote) {
        odqWriteMirrorTuneLocal(key, {
          flipX: winner.flipX,
          flipY: winner.flipY,
          bottomLayout: winner.bottomLayout,
          leftFlipX: winner.leftFlipX,
          leftFlipY: winner.leftFlipY,
          rightFlipX: winner.rightFlipX,
          rightFlipY: winner.rightFlipY,
          nudgeSeamY: winner.nudgeSeamY,
          nudgeMirrorY: winner.nudgeMirrorY,
          updatedAt: winner.updatedAt || remoteAt || undefined
        });
      } else if (!odqMirrorTuneIsCustomized(winner) && localCustom) {
        odqWriteMirrorTuneLocal(key, { ...MIRROR_TUNE_DEFAULT });
      }
      return winner;
    } catch (err) {
      console.warn('odqReadMirrorTune Firestore read failed:', err);
      return local;
    }
  }

  async function odqPrefetchMirrorTune(dateKey) {
    const key = resolveDateKey(dateKey);
    if (!key) return { ok: false, reason: 'dateKey required' };
    const tune = await odqReadMirrorTune(key);
    const changed = odqMirrorTuneIsCustomized(tune);
    try {
      const app = typeof window !== 'undefined' ? window.app : null;
      if (changed && app && typeof app.renderQuilt === 'function') {
        app.renderQuilt({ viewportOnly: true });
      }
    } catch (_) {
      /* ignore */
    }
    return {
      ok: true,
      flipX: tune.flipX,
      flipY: tune.flipY,
      bottomLayout: tune.bottomLayout,
      leftFlipX: tune.leftFlipX,
      leftFlipY: tune.leftFlipY,
      rightFlipX: tune.rightFlipX,
      rightFlipY: tune.rightFlipY,
      nudgeSeamY: tune.nudgeSeamY,
      nudgeMirrorY: tune.nudgeMirrorY,
      customized: changed,
      updatedAt: tune.updatedAt || null
    };
  }

  async function odqWriteMirrorTuneViaServer(dateKey, tune, writeOptions = {}) {
    const key = resolveDateKey(dateKey);
    if (!key) throw new Error('dateKey required');
    const flipX = odqNormalizeMirrorFlipFlag(tune?.flipX, MIRROR_TUNE_DEFAULT.flipX);
    const flipY = odqNormalizeMirrorFlipFlag(tune?.flipY, MIRROR_TUNE_DEFAULT.flipY);
    const bottomLayout = odqNormalizeMirrorBottomLayout(tune?.bottomLayout);
    const leftFlipX = odqNormalizeMirrorFlipFlag(tune?.leftFlipX, MIRROR_TUNE_DEFAULT.leftFlipX);
    const leftFlipY = odqNormalizeMirrorFlipFlag(tune?.leftFlipY, MIRROR_TUNE_DEFAULT.leftFlipY);
    const rightFlipX = odqNormalizeMirrorFlipFlag(tune?.rightFlipX, MIRROR_TUNE_DEFAULT.rightFlipX);
    const rightFlipY = odqNormalizeMirrorFlipFlag(tune?.rightFlipY, MIRROR_TUNE_DEFAULT.rightFlipY);
    const nudgeSeamY = odqNormalizeMirrorSeamNudge(tune?.nudgeSeamY);
    const nudgeMirrorY = odqNormalizeMirrorSeamNudge(tune?.nudgeMirrorY);
    const updatedAt = String(tune?.updatedAt || new Date().toISOString()).trim();
    const afterTune = {
      bottomLayout,
      flipX,
      flipY,
      leftFlipX,
      leftFlipY,
      rightFlipX,
      rightFlipY,
      nudgeSeamY,
      nudgeMirrorY
    };
    const beforeTune =
      writeOptions.previous && typeof writeOptions.previous === 'object'
        ? writeOptions.previous
        : odqReadMirrorTuneFromLocal(key);
    const blockCount = Number.isFinite(writeOptions.blockCount)
      ? Math.floor(writeOptions.blockCount)
      : Array.isArray(writeOptions.blocks)
        ? writeOptions.blocks.length
        : null;
    const historyEntry = odqBuildMirrorTuneHistoryEntry(beforeTune, afterTune, {
      at: updatedAt,
      action: writeOptions.action,
      source: writeOptions.source,
      blockCount
    });
    const bases =
      typeof globalThis.odqProxyImageBases === 'function'
        ? globalThis.odqProxyImageBases()
        : [
            typeof globalThis.odqBackendBaseUrl === 'function'
              ? globalThis.odqBackendBaseUrl()
              : String(globalThis.CONFIG?.BACKEND?.baseUrl || '').replace(/\/$/, '')
          ].filter(Boolean);
    if (!bases.length) throw new Error('Backend base URL not configured');
    const body = JSON.stringify({
      dateKey: key,
      mirrorBottomLayout: bottomLayout,
      mirrorFlipX: flipX,
      mirrorFlipY: flipY,
      mirrorBottomLeftFlipX: leftFlipX,
      mirrorBottomLeftFlipY: leftFlipY,
      mirrorBottomRightFlipX: rightFlipX,
      mirrorBottomRightFlipY: rightFlipY,
      mirrorSeamNudgeY: nudgeSeamY,
      mirrorFieldNudgeY: nudgeMirrorY,
      mirrorTuneUpdatedAt: updatedAt,
      mirrorTuneUpdatedBy: writeOptions.updatedBy || 'admin-tune-modal',
      action: writeOptions.action,
      source: writeOptions.source || 'admin-tune-modal',
      previous: beforeTune ? odqMirrorTuneSnapshotFields(beforeTune) : undefined
    });
    let lastErr = null;
    for (const baseUrl of bases) {
      try {
        const res = await fetch(`${baseUrl}/api/push-quilt-mirror-tune`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success !== false) {
          odqWriteMirrorTuneLocal(key, {
            ...afterTune,
            updatedAt: data.mirrorTuneUpdatedAt || updatedAt
          });
          odqAppendMirrorTuneHistoryLocal(key, historyEntry);
          return data;
        }
        lastErr = new Error(data.error || `Mirror tune server save failed (${res.status})`);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Mirror tune server save failed');
  }

  /** Bottom mirror field transform from independent flip flags (admin tune). */
  function bottomFieldTransformFromFlags(minX, minY, quiltW, quiltH, mirrorSeamOffset, flags = {}) {
    const flipX = odqNormalizeMirrorFlipFlag(flags.flipX, MIRROR_TUNE_DEFAULT.flipX);
    const flipY = odqNormalizeMirrorFlipFlag(flags.flipY, MIRROR_TUNE_DEFAULT.flipY);
    if (!flipX && !flipY) {
      return duplicateTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset);
    }
    if (!flipX && flipY) {
      return duplicateFlipYTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset);
    }
    if (flipX && !flipY) {
      return duplicateFlipXTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset);
    }
    return mirrorTransform(minX, minY, quiltW, quiltH, mirrorSeamOffset);
  }

  function computeComposePlacements(outW, outH, sourceW, sourceH, dateKey, opts = {}) {
    const paddingRatio = opts.paddingRatio != null ? opts.paddingRatio : 0.02;
    const result = computeFromBounds(
      { minX: 0, minY: 0, width: sourceW, height: sourceH },
      {
        dateKey,
        viewportW: outW,
        viewportH: outH,
        forExport: true,
        paddingRatio,
        blocks: opts.blocks
      }
    );
    const layout = result.layout;
    const vb = result.viewBox;
    const horizontalStretch = result.horizontalStretch || HORIZONTAL_STRETCH;
    const scale = sliceScale(outW, outH, vb.width, vb.height);
    const drawW = sourceW * horizontalStretch * scale;
    const drawH = sourceH * scale;
    const viewBoxX = (outW - vb.width * scale) / 2;
    const startX = viewBoxX + (0 - vb.x) * scale;
    const primaryY = -vb.y * scale;
    const overlapDraw = layout.overlapPercent * drawH;
    const mirrorTune = odqReadMirrorTuneFromLocal(dateKey);
    const nudgeMirrorY = odqNormalizeMirrorSeamNudge(mirrorTune?.nudgeMirrorY);
    const mirrorFieldNudgeDraw = nudgeMirrorY * vb.height * scale;
    const mirrorY = primaryY + drawH - overlapDraw + mirrorFieldNudgeDraw;
    return {
      layout,
      horizontalStretch,
      scale,
      drawW,
      drawH,
      viewBoxX,
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
    SEAM_BLOCK_MIN_VISIBLE_FRACTION,
    SEAM_BLOCK_TOUCH_EPS_PX,
    maxOverlapPercentForSeamBlocks,
    resolveEffectiveOverlapPercent,
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
    duplicateTransform,
    duplicateStackTransform,
    duplicateDoubleBottomTransforms,
    duplicateDoubleBottomFlipLeftTransforms,
    duplicateDoubleBottomTransformsFromFlags,
    duplicateBottomTileTransform,
    quadrantFourUpTransforms,
    duplicateFlipYTransform,
    duplicateFlipXTransform,
    duplicateFitBottomTransform,
    duplicateFitBottomScale,
    computeComposePlacements,
    bottomFieldTransformFromFlags,
    MIRROR_TUNE_DEFAULT,
    MIRROR_BOTTOM_LAYOUT_SINGLE,
    MIRROR_BOTTOM_LAYOUT_DOUBLE,
    odqNormalizeMirrorBottomLayout,
    odqMirrorBottomLayoutIsDouble,
    odqMirrorTuneStorageKey,
    odqReadMirrorTuneFromLocal,
    odqWriteMirrorTuneLocal,
    odqReadMirrorTune,
    odqPrefetchMirrorTune,
    odqWriteMirrorTuneViaServer,
    odqMirrorTuneIsCustomized,
    odqMirrorTuneModeLabel,
    odqBuildMirrorTuneHistoryEntry,
    odqAppendMirrorTuneHistoryLocal,
    odqReadMirrorTuneHistoryLocal,
    odqMirrorTuneHistoryStorageKey,
    odqMirrorTuneSnapshotFields,
    odqMirrorTuneExportSignature,
    odqNormalizeMirrorSeamNudge,
    odqMirrorSeamNudgeStep,
    odqAppendMirrorFieldNudgeTransform,
    MIRROR_SEAM_NUDGE_STEP,
    MIRROR_SEAM_BIG_NUDGE_MUL
  };

  if (typeof root !== 'undefined') {
    root.odqReadMirrorTuneFromLocal = odqReadMirrorTuneFromLocal;
    root.odqWriteMirrorTuneLocal = odqWriteMirrorTuneLocal;
    root.odqReadMirrorTune = odqReadMirrorTune;
    root.odqPrefetchMirrorTune = odqPrefetchMirrorTune;
    root.odqWriteMirrorTuneViaServer = odqWriteMirrorTuneViaServer;
    root.odqMirrorTuneIsCustomized = odqMirrorTuneIsCustomized;
    root.odqMirrorTuneModeLabel = odqMirrorTuneModeLabel;
    root.odqMirrorSeamNudgeStep = odqMirrorSeamNudgeStep;
    root.odqBuildMirrorTuneHistoryEntry = odqBuildMirrorTuneHistoryEntry;
    root.odqAppendMirrorTuneHistoryLocal = odqAppendMirrorTuneHistoryLocal;
    root.odqReadMirrorTuneHistoryLocal = odqReadMirrorTuneHistoryLocal;
    root.odqNormalizeMirrorBottomLayout = odqNormalizeMirrorBottomLayout;
    root.odqMirrorBottomLayoutIsDouble = odqMirrorBottomLayoutIsDouble;
    root.odqMirrorTuneExportSignature = odqMirrorTuneExportSignature;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
