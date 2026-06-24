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
    root.applyCarouselSpeakerSeamOverlap = api.applyCarouselSpeakerSeamOverlap;
    root.resolveCarouselSpeakerSeamRectFromImageUrl = api.resolveCarouselSpeakerSeamRectFromImageUrl;
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

  function clippingComposeMetaFields(result) {
    if (!result || typeof result !== 'object') return {};
    const { dataUrl, clippedCanvas, canvas, ...safe } = result;
    return safe;
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
    const clippingResult = await composeClipping({ ...composeOpts, names });
    const dateStripResult =
      typeof composeDateStrip === 'function' ? await composeDateStrip(composeOpts) : null;
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
        contributorList: clippingComposeMetaFields(clippingResult),
        dateStrip: clippingComposeMetaFields(dateStripResult)
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

  /** Fraction of speaker cutout width that bleeds from slide 1 (layout B) into slide 2. */
  const CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION = 0.28;
  /** Layout B slide 1: target cutout area as fraction of 1080×1350 panel. */
  const CAROUSEL_SPEAKER_TARGET_AREA_FRAC = 0.36;
  const CAROUSEL_SPEAKER_MAX_W_FRAC = 0.62;
  const CAROUSEL_SPEAKER_MAX_H_FRAC = 0.72;
  /** Min bleed onto slide 2 (contributor paper / white gutter left of quilt). */
  const CAROUSEL_SPEAKER_MIN_SLIDE2_BLEED_FRAC = 0.2;
  const CAROUSEL_SPEAKER_DRAW_PAD_PX = 48;

  async function loadImageFromUrl(url) {
    const src = String(url || '').trim();
    if (!src) throw new Error('Missing speaker image URL');
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load speaker image'));
      img.src = src;
    });
  }

  /** Tight alpha bounds inside the cutout PNG (drops transparent headroom above hair). */
  function measureSpeakerImageContentBounds(img, minAlpha = 40) {
    const iw = Math.max(1, img.naturalWidth || img.width);
    const ih = Math.max(1, img.naturalHeight || img.height);
    const c = document.createElement('canvas');
    c.width = iw;
    c.height = ih;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, iw, ih);
    let data;
    try {
      data = ctx.getImageData(0, 0, iw, ih).data;
    } catch (_) {
      return null;
    }
    let minX = iw;
    let minY = ih;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    for (let y = 0; y < ih; y += 1) {
      for (let x = 0; x < iw; x += 1) {
        if (data[(y * iw + x) * 4 + 3] < minAlpha) continue;
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (!found) return null;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  function resolveCarouselSpeakerSeamRect(
    panelW,
    panelH,
    speakerImg,
    overlapFraction = CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION
  ) {
    const iw = Math.max(1, speakerImg.naturalWidth || speakerImg.width);
    const ih = Math.max(1, speakerImg.naturalHeight || speakerImg.height);
    const aspect = iw / ih;
    const canvasArea = panelW * panelH;
    const targetArea = canvasArea * CAROUSEL_SPEAKER_TARGET_AREA_FRAC;
    let w = Math.sqrt(targetArea * aspect);
    let h = w / aspect;
    const maxW = panelW * CAROUSEL_SPEAKER_MAX_W_FRAC;
    const maxH = panelH * CAROUSEL_SPEAKER_MAX_H_FRAC;
    const dimScale = Math.min(1, maxW / w, maxH / h);
    w *= dimScale;
    h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    w = Math.round(w);
    h = Math.round(h);
    const overlap = Math.max(
      0.12,
      Math.min(0.38, Number(overlapFraction) || CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION)
    );
    const minBleedPx = Math.round(panelW * CAROUSEL_SPEAKER_MIN_SLIDE2_BLEED_FRAC);
    const minWForBleed = minBleedPx / overlap;
    if (w < minWForBleed) {
      w = Math.min(Math.round(maxW), Math.round(minWForBleed));
      h = Math.round(w / aspect);
      if (h > maxH) {
        h = Math.round(maxH);
        w = Math.round(h * aspect);
      }
    }
    const minPad = 20;
    const x = Math.round(panelW - w * (1 - overlap));
    const y = Math.max(minPad, Math.min(panelH - minPad - h, Math.round(panelH * 0.34 - h / 2)));
    const overlapPx = Math.max(1, Math.round(w * overlap));
    let contentX = x;
    let contentY = y;
    let contentWidth = w;
    let contentHeight = h;
    const content = measureSpeakerImageContentBounds(speakerImg);
    if (content) {
      const sx = w / iw;
      const sy = h / ih;
      contentX = Math.round(x + content.minX * sx);
      contentY = Math.round(y + content.minY * sy);
      contentWidth = Math.round(content.width * sx);
      contentHeight = Math.round(content.height * sy);
    }
    return {
      x,
      y,
      width: w,
      height: h,
      contentX,
      contentY,
      contentWidth,
      contentHeight,
      angle: 0,
      overlapFraction: overlap,
      overlapPx,
      minBleedPx
    };
  }

  async function resolveCarouselSpeakerSeamRectFromImageUrl(
    imageUrl,
    overlapFraction = CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION
  ) {
    const img = await loadImageFromUrl(imageUrl);
    return resolveCarouselSpeakerSeamRect(PANEL_W, MASTER_H, img, overlapFraction);
  }

  /**
   * Draw speaker cutout on the right edge of layout B slide 1; bleed onto quilt slide 2.
   * @returns {Promise<{ slide1Blob, slide2Blob, meta }|null>}
   */
  async function applyCarouselSpeakerSeamOverlap(options = {}) {
    const {
      slide1Blob = null,
      slide1DataUrl = null,
      slide2Blob = null,
      slide2DataUrl = null,
      speakerImageUrl = '',
      cutoutSourceUrl = '',
      washColor = '#ea9b9a',
      dateKey = '',
      overlapFraction = CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION
    } = options;
    const speakerUrl = String(speakerImageUrl || '').trim();
    if (!speakerUrl) return null;
    if (!(slide1Blob || slide1DataUrl) || !(slide2Blob || slide2DataUrl)) return null;

    const SCR = global.SpeakerCutoutRender || globalThis.SpeakerCutoutRender;
    if (!SCR?.drawSpeakerCutoutStack) return null;

    const [slide1Img, slide2Img, speakerImg] = await Promise.all([
      slide1Blob ? loadImageFromBlob(slide1Blob) : loadImageFromDataUrl(slide1DataUrl),
      slide2Blob ? loadImageFromBlob(slide2Blob) : loadImageFromDataUrl(slide2DataUrl),
      loadImageFromUrl(speakerUrl)
    ]);
    if (!slide1Img || !slide2Img || !speakerImg) return null;

    const rect = resolveCarouselSpeakerSeamRect(PANEL_W, MASTER_H, speakerImg, overlapFraction);
    const isCutoutPng = /speaker-cutouts(?:%2F|\/)/i.test(
      String(cutoutSourceUrl || speakerUrl)
    );
    const pad = CAROUSEL_SPEAKER_DRAW_PAD_PX;
    const speakerCanvas = document.createElement('canvas');
    speakerCanvas.width = rect.width + pad * 2;
    speakerCanvas.height = rect.height + pad * 2;
    const sctx = speakerCanvas.getContext('2d');
    if (!sctx) return null;
    const localRect = { x: pad, y: pad, width: rect.width, height: rect.height, angle: rect.angle };
    const drawn = SCR.drawSpeakerCutoutStack(sctx, speakerImg, localRect, {
      washColor,
      seed: String(dateKey || 'carousel-seam'),
      isCutoutPng,
      newsprintSurface: false,
      drawScannerBed: false
    });
    if (!drawn) return null;

    const out1 = document.createElement('canvas');
    out1.width = PANEL_W;
    out1.height = MASTER_H;
    const ctx1 = out1.getContext('2d');
    if (!ctx1) return null;
    ctx1.drawImage(slide1Img, 0, 0, PANEL_W, MASTER_H);
    ctx1.drawImage(speakerCanvas, rect.x - pad, rect.y - pad);

    const out2 = document.createElement('canvas');
    out2.width = PANEL_W;
    out2.height = MASTER_H;
    const ctx2 = out2.getContext('2d');
    if (!ctx2) return null;
    ctx2.drawImage(slide2Img, 0, 0, PANEL_W, MASTER_H);
    const overlapPx = rect.overlapPx;
    ctx2.drawImage(
      speakerCanvas,
      pad + rect.width - overlapPx,
      pad,
      overlapPx,
      rect.height,
      0,
      rect.y,
      overlapPx,
      rect.height
    );

    const [slide1OutBlob, slide2OutBlob] = await Promise.all([
      canvasToBlob(out1),
      canvasToBlob(out2)
    ]);
    if (!slide1OutBlob || !slide2OutBlob) return null;

    return {
      slide1Blob: slide1OutBlob,
      slide2Blob: slide2OutBlob,
      meta: {
        overlapFraction: rect.overlapFraction,
        overlapPx,
        speakerX: rect.x,
        speakerY: rect.y,
        speakerWidth: rect.width,
        speakerHeight: rect.height,
        contentX: rect.contentX,
        contentY: rect.contentY,
        contentWidth: rect.contentWidth,
        contentHeight: rect.contentHeight
      }
    };
  }

  return {
    composeInstagramContributorCarouselFromQuiltBlob,
    duplicateClassicToCarouselSlides,
    applyCarouselSpeakerSeamOverlap,
    resolveCarouselSpeakerSeamRect,
    resolveCarouselSpeakerSeamRectFromImageUrl,
    MASTER_W,
    MASTER_H,
    PANEL_W,
    SEAM_OVERLAP_PX,
    CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION,
    CAROUSEL_SPEAKER_TARGET_AREA_FRAC,
    CAROUSEL_SPEAKER_MIN_SLIDE2_BLEED_FRAC,
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
