/**
 * Seamless IG carousel master (2160×1350): contributor clipping + right-justified classic quilt.
 * Browser: globalThis.IgContributorCarouselCompose
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IgContributorCarouselCompose = api;
    root.composeInstagramContributorCarouselFromQuiltBlob =
      api.composeInstagramContributorCarouselFromQuiltBlob;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function (global) {
  'use strict';

  const MASTER_W = 2160;
  const MASTER_H = 1350;
  const PANEL_W = 1080;
  const SEAM_OVERLAP_PX = 220;
  const QUILT_PAD = 2;
  const CLIPPING_TARGET_WIDTH = 820;
  /** Mirrored quilt strip on slide 1 — strictly less than half the panel. */
  const MIRROR_EXT_MAX_PANEL_FRACTION = 0.46;
  const MIRROR_EXT_MIN_DEST_PX = 96;
  /** Cap source slice so the mirrored strip stays a narrow left accent (~15% of panel). */
  const MIRROR_EXT_MAX_SRC_FRACTION = 0.22;
  const DATE_STRIP_GAP_PX = 18;
  /** White mat on slide 2 quilt — top, right, bottom only (left keeps seam gutter). */
  const QUILT_FRAME_TOP_FRACTION = 0.045;
  const QUILT_FRAME_RIGHT_FRACTION = 0.036;
  const QUILT_FRAME_BOTTOM_FRACTION = 0.045;

  function resolveQuiltFrameInsets(panelW, panelH, minLeftGutterPx, options = {}) {
    const frameTop =
      Number(options.quiltFrameTopPx) >= 0
        ? Math.round(Number(options.quiltFrameTopPx))
        : Math.round(panelH * (Number(options.quiltFrameTopFraction) || QUILT_FRAME_TOP_FRACTION));
    const frameRight =
      Number(options.quiltFrameRightPx) >= 0
        ? Math.round(Number(options.quiltFrameRightPx))
        : Math.round(panelW * (Number(options.quiltFrameRightFraction) || QUILT_FRAME_RIGHT_FRACTION));
    const frameBottom =
      Number(options.quiltFrameBottomPx) >= 0
        ? Math.round(Number(options.quiltFrameBottomPx))
        : Math.round(
            panelH * (Number(options.quiltFrameBottomFraction) || QUILT_FRAME_BOTTOM_FRACTION)
          );
    return {
      top: Math.max(0, frameTop),
      right: Math.max(0, frameRight),
      bottom: Math.max(0, frameBottom),
      leftGutter: Math.max(0, Math.round(Number(minLeftGutterPx) || 0))
    };
  }

  /** Contributor clippings are alpha-trimmed in quilt-newspaper-clipping — no pixel scan needed. */
  function opaqueBoundsFromTrimmedCanvas(canvasLike) {
    if (!canvasLike) return null;
    const w = Math.max(1, canvasLike.width || canvasLike.naturalWidth || 1);
    const h = Math.max(1, canvasLike.height || canvasLike.naturalHeight || 1);
    return { x: 0, y: 0, width: w, height: h };
  }

  function resolveQuiltDrawBounds(quiltImg, panelX, panelW, panelH, minLeftGutterPx = 0, options = {}) {
    const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    const innerW = panelW - QUILT_PAD * 2;
    const innerH = panelH - QUILT_PAD * 2;
    const frame = resolveQuiltFrameInsets(panelW, panelH, minLeftGutterPx, options);
    const maxQuiltW = Math.max(1, innerW - frame.leftGutter - frame.right);
    const maxQuiltH = Math.max(1, innerH - frame.top - frame.bottom);
    const scale = Math.min(maxQuiltW / iw, maxQuiltH / ih);
    const dw = Math.round(iw * scale);
    const dh = Math.round(ih * scale);
    const dx = panelX + panelW - QUILT_PAD - frame.right - dw;
    const dy = QUILT_PAD + frame.top + Math.round((maxQuiltH - dh) / 2);
    return { dx, dy, dw, dh, frame, maxQuiltW, maxQuiltH };
  }

  function resolveContributorClippingPlacement(bounds, seamOverlapPx, quiltLeftX) {
    const contentW = Math.max(1, Number(bounds?.width) || 1);
    const contentH = Math.max(1, Number(bounds?.height) || 1);
    const seamRight = PANEL_W + seamOverlapPx;
    const quiltMargin = 8;
    // Bleed across the carousel seam into slide 2 white gutter — never past quilt pixels.
    const maxRight = Math.min(
      seamRight,
      Math.max(PANEL_W, Math.round(Number(quiltLeftX) || seamRight) - quiltMargin)
    );
    let destX = Math.round(maxRight - contentW);
    destX = Math.max(24, Math.min(destX, maxRight - contentW));
    const destY = Math.round((MASTER_H - contentH) / 2);
    return { destX, destY, contentW, contentH, clipRightX: maxRight, seamOverlapPx, quiltLeftX };
  }

  function resolveContributorClippingStackPlacement(
    mainOpaque,
    dateOpaque,
    seamOverlapPx,
    quiltLeftX,
    gapPx = DATE_STRIP_GAP_PX
  ) {
    const main = resolveContributorClippingPlacement(mainOpaque, seamOverlapPx, quiltLeftX);
    if (!dateOpaque?.width || !dateOpaque?.height) {
      return { main, dateStrip: null, stackHeight: main.contentH, gapPx: 0 };
    }
    const dateContentW = Math.max(1, Number(dateOpaque.width) || 1);
    const dateContentH = Math.max(1, Number(dateOpaque.height) || 1);
    const stackH = main.contentH + gapPx + dateContentH;
    const stackTop = Math.max(0, Math.round((MASTER_H - stackH) / 2));
    const dateDestX = Math.round(main.destX + (main.contentW - dateContentW) / 2);
    return {
      main: { ...main, destY: stackTop },
      dateStrip: {
        destX: dateDestX,
        destY: stackTop + main.contentH + gapPx,
        contentW: dateContentW,
        contentH: dateContentH
      },
      stackHeight: stackH,
      gapPx
    };
  }

  async function loadImageFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode quilt bitmap'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode clipping bitmap'));
      img.src = dataUrl;
    });
  }

  function resolveMirroredQuiltExtensionBounds(quiltImg, panelH, options = {}) {
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    const innerH = panelH - QUILT_PAD * 2;
    const scale = innerH / ih;
    const dh = Math.round(ih * scale);
    const dy = QUILT_PAD + Math.max(0, Math.round((innerH - dh) / 2));
    return { dy, dh, scale, innerH };
  }

  function resolveMirroredQuiltExtensionPlacement(quiltImg, mirrorBounds, options = {}) {
    const maxPanelFraction =
      Number(options.mirrorMaxPanelFraction) > 0
        ? Math.min(0.49, Number(options.mirrorMaxPanelFraction))
        : MIRROR_EXT_MAX_PANEL_FRACTION;
    const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    const scale = mirrorBounds.scale || mirrorBounds.dh / ih;
    const maxDestW = Math.max(
      MIRROR_EXT_MIN_DEST_PX,
      Math.floor(PANEL_W * maxPanelFraction)
    );
    let sliceSrcW = Math.max(1, Math.ceil(maxDestW / scale));
    sliceSrcW = Math.min(sliceSrcW, Math.max(1, Math.floor(iw * MIRROR_EXT_MAX_SRC_FRACTION)));
    const destW = Math.min(maxDestW, Math.max(1, Math.round(sliceSrcW * scale)));
    return {
      sx: iw - sliceSrcW,
      sy: 0,
      sliceSrcW,
      sliceSrcH: ih,
      destX: 0,
      destY: mirrorBounds.dy,
      destW,
      destH: mirrorBounds.dh,
      scale
    };
  }

  /** Right-edge source strip, mirrored L→R, left-justified on slide 1 (behind clipping). */
  function drawMirroredQuiltExtension(ctx, quiltImg, mirrorBounds, options = {}) {
    const placement = resolveMirroredQuiltExtensionPlacement(quiltImg, mirrorBounds, options);
    if (!placement.destW || !placement.destH) return null;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(placement.destX + placement.destW, placement.destY);
    ctx.scale(-1, 1);
    ctx.drawImage(
      quiltImg,
      placement.sx,
      placement.sy,
      placement.sliceSrcW,
      placement.sliceSrcH,
      0,
      0,
      placement.destW,
      placement.destH
    );
    ctx.restore();
    return placement;
  }

  function drawRightJustifiedQuilt(ctx, quiltImg, panelX, panelW, panelH, minLeftGutterPx = 0, boundsOverride, options = {}) {
    const bounds =
      boundsOverride ||
      resolveQuiltDrawBounds(quiltImg, panelX, panelW, panelH, minLeftGutterPx, options);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(panelX, 0, panelW, panelH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    ctx.drawImage(quiltImg, 0, 0, iw, ih, bounds.dx, bounds.dy, bounds.dw, bounds.dh);
    return bounds;
  }

  function cropCanvasRegion(source, sx, sy, sw, sh) {
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw));
    out.height = Math.max(1, Math.round(sh));
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), 'image/png', 0.95);
    });
  }

  function normalizeContributorNames(contributors) {
    const normalize = global.ContributorCloudCompose?.getOrderedDisplayContributors;
    if (typeof normalize === 'function') {
      return normalize(contributors).map((entry) => String(entry?.name || 'Friend').trim()).filter(Boolean);
    }
    return (Array.isArray(contributors) ? contributors : [])
      .map((entry) => {
        if (entry && typeof entry === 'object') return String(entry.name || '').trim();
        return String(entry || '').trim();
      })
      .filter(Boolean);
  }

  /**
   * @param {Blob} quiltBlob
   * @param {Array} contributors
   * @param {object} [options]
   * @returns {Promise<{ slide1Blob: Blob|null, slide2Blob: Blob|null, masterBlob: Blob|null, meta: object }|null>}
   */
  async function composeInstagramContributorCarouselFromQuiltBlob(
    quiltBlob,
    contributors,
    options = {}
  ) {
    if (!quiltBlob) return null;
    const names = normalizeContributorNames(contributors);
    if (!names.length) return null;

    const composeClipping = global.QuiltNewspaperClipping?.composeContributorListDataUrl;
    if (typeof composeClipping !== 'function') {
      throw new Error('QuiltNewspaperClipping.composeContributorListDataUrl missing');
    }
    const composeDateStrip = global.QuiltNewspaperClipping?.composeContributorDateStripDataUrl;

    const dateKey = String(options.dateKey || '').trim() || 'our-daily';
    const seamOverlapPx =
      Number(options.seamOverlapPx) > 0 ? Math.round(Number(options.seamOverlapPx)) : SEAM_OVERLAP_PX;
    const clippingWidth =
      Number(options.clippingWidth) > 0
        ? Math.round(Number(options.clippingWidth))
        : CLIPPING_TARGET_WIDTH;

    const composeOpts = {
      dateKey,
      width: clippingWidth,
      paperTextureUrl: options.paperTextureUrl,
      returnCanvas: true
    };
    const [clippingResult, dateStripResult] = await Promise.all([
      composeClipping({ ...composeOpts, names }),
      typeof composeDateStrip === 'function' ? composeDateStrip(composeOpts) : Promise.resolve(null)
    ]);
    let clippingCanvas =
      typeof clippingResult === 'string'
        ? null
        : clippingResult?.clippedCanvas || clippingResult?.canvas || null;
    if (!clippingCanvas) {
      const fallbackDataUrl =
        typeof clippingResult === 'string' ? clippingResult : clippingResult?.dataUrl || null;
      if (!fallbackDataUrl) return null;
      clippingCanvas = await loadImageFromDataUrl(fallbackDataUrl);
      if (!clippingCanvas) return null;
    }
    let dateStripCanvas =
      typeof dateStripResult === 'string'
        ? null
        : dateStripResult?.clippedCanvas || dateStripResult?.canvas || null;
    if (!dateStripCanvas && dateStripResult) {
      const dateStripDataUrl =
        typeof dateStripResult === 'string' ? dateStripResult : dateStripResult?.dataUrl || null;
      if (dateStripDataUrl) {
        dateStripCanvas = await loadImageFromDataUrl(dateStripDataUrl);
      }
    }

    const quiltImg = await loadImageFromBlob(quiltBlob);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = MASTER_W;
    canvas.height = MASTER_H;
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, MASTER_W, MASTER_H);

    const quiltBounds = resolveQuiltDrawBounds(quiltImg, PANEL_W, PANEL_W, MASTER_H, seamOverlapPx, options);
    const mirrorBounds = resolveMirroredQuiltExtensionBounds(quiltImg, MASTER_H, options);
    const mirrorPlacement = drawMirroredQuiltExtension(ctx, quiltImg, mirrorBounds, options);
    drawRightJustifiedQuilt(
      ctx,
      quiltImg,
      PANEL_W,
      PANEL_W,
      MASTER_H,
      seamOverlapPx,
      quiltBounds,
      options
    );

    const clipW = Math.max(1, clippingCanvas.width || clippingCanvas.naturalWidth || 1);
    const clipH = Math.max(1, clippingCanvas.height || clippingCanvas.naturalHeight || 1);
    const opaque = opaqueBoundsFromTrimmedCanvas(clippingCanvas);
    const dateOpaque = dateStripCanvas ? opaqueBoundsFromTrimmedCanvas(dateStripCanvas) : null;
    const stack = resolveContributorClippingStackPlacement(
      opaque,
      dateOpaque,
      seamOverlapPx,
      quiltBounds.dx,
      Number(options.dateStripGapPx) > 0 ? Math.round(Number(options.dateStripGapPx)) : DATE_STRIP_GAP_PX
    );
    const placement = stack.main;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, placement.clipRightX, MASTER_H);
    ctx.clip();
    ctx.drawImage(
      clippingCanvas,
      opaque.x,
      opaque.y,
      opaque.width,
      opaque.height,
      placement.destX,
      placement.destY,
      placement.contentW,
      placement.contentH
    );
    if (stack.dateStrip && dateStripCanvas && dateOpaque) {
      ctx.drawImage(
        dateStripCanvas,
        dateOpaque.x,
        dateOpaque.y,
        dateOpaque.width,
        dateOpaque.height,
        stack.dateStrip.destX,
        stack.dateStrip.destY,
        stack.dateStrip.contentW,
        stack.dateStrip.contentH
      );
    }
    ctx.restore();

    const slide1Canvas = cropCanvasRegion(canvas, 0, 0, PANEL_W, MASTER_H);
    const slide2Canvas = cropCanvasRegion(canvas, PANEL_W, 0, PANEL_W, MASTER_H);
    if (!slide1Canvas || !slide2Canvas) return null;

    const [slide1Blob, slide2Blob, masterBlob] = await Promise.all([
      canvasToBlob(slide1Canvas),
      canvasToBlob(slide2Canvas),
      options.includeMaster ? canvasToBlob(canvas) : Promise.resolve(null)
    ]);

    if (!slide1Blob || !slide2Blob) return null;

    return {
      slide1Blob,
      slide2Blob,
      masterBlob,
      meta: {
        masterWidth: MASTER_W,
        masterHeight: MASTER_H,
        seamOverlapPx,
        clippingWidth: clipW,
        clippingHeight: clipH,
        clippingContentWidth: opaque.width,
        clippingContentHeight: opaque.height,
        clippingX: placement.destX,
        clippingY: placement.destY,
        clipRightX: placement.clipRightX,
        quiltLeftX: placement.quiltLeftX,
        quiltFrameTopPx: quiltBounds.frame?.top ?? null,
        quiltFrameRightPx: quiltBounds.frame?.right ?? null,
        quiltFrameBottomPx: quiltBounds.frame?.bottom ?? null,
        mirrorExtensionX: mirrorPlacement?.destX ?? 0,
        mirrorExtensionY: mirrorPlacement?.destY ?? 0,
        mirrorExtensionW: mirrorPlacement?.destW ?? 0,
        mirrorExtensionH: mirrorPlacement?.destH ?? 0,
        mirrorExtensionSrcW: mirrorPlacement?.sliceSrcW ?? 0,
        dateStripGapPx: stack.gapPx,
        dateStripX: stack.dateStrip?.destX ?? null,
        dateStripY: stack.dateStrip?.destY ?? null,
        dateStripW: stack.dateStrip?.contentW ?? null,
        dateStripH: stack.dateStrip?.contentH ?? null,
        clippingStackHeight: stack.stackHeight,
        clippingContentX: opaque.x,
        clippingContentY: opaque.y,
        nameCount: names.length,
        ...(typeof dateStripResult === 'object' ? dateStripResult : {}),
        ...(typeof clippingResult === 'object' ? clippingResult : {})
      }
    };
  }

  /**
   * Duplicate a single 1080×1350 classic image to both carousel slides (empty-contributor fallback).
   * @param {string} classicDataUrl
   * @returns {Promise<{ slide1Blob: Blob|null, slide2Blob: Blob|null }|null>}
   */
  async function duplicateClassicToCarouselSlides(classicDataUrl) {
    if (!classicDataUrl) return null;
    const img = await loadImageFromDataUrl(classicDataUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = PANEL_W;
    canvas.height = MASTER_H;
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PANEL_W, MASTER_H);
    const iw = Math.max(1, img.naturalWidth || img.width);
    const ih = Math.max(1, img.naturalHeight || img.height);
    const scale = Math.min((PANEL_W - QUILT_PAD * 2) / iw, (MASTER_H - QUILT_PAD * 2) / ih);
    const dw = Math.round(iw * scale);
    const dh = Math.round(ih * scale);
    const dx = QUILT_PAD + Math.round((PANEL_W - QUILT_PAD * 2 - dw) / 2);
    const dy = QUILT_PAD + Math.round((MASTER_H - QUILT_PAD * 2 - dh) / 2);
    ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
    const blob = await canvasToBlob(canvas);
    if (!blob) return null;
    return { slide1Blob: blob, slide2Blob: blob, meta: { fallbackClassic: true } };
  }

  return {
    composeInstagramContributorCarouselFromQuiltBlob,
    duplicateClassicToCarouselSlides,
    MASTER_W,
    MASTER_H,
    PANEL_W,
    SEAM_OVERLAP_PX,
    MIRROR_EXT_MAX_PANEL_FRACTION,
    DATE_STRIP_GAP_PX,
    QUILT_FRAME_TOP_FRACTION,
    QUILT_FRAME_RIGHT_FRACTION,
    QUILT_FRAME_BOTTOM_FRACTION,
    resolveQuiltFrameInsets,
    resolveQuiltDrawBounds,
    resolveContributorClippingStackPlacement,
    resolveMirroredQuiltExtensionBounds,
    resolveMirroredQuiltExtensionPlacement,
    drawMirroredQuiltExtension
  };
});
