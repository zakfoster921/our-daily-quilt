/**
 * IG carousel slides 2–3: shared layout-B quilt bg (A → flip(A) → A) + contributor clipping on slide 2.
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
    root.resolveCarouselSpeakerSeamRect = api.resolveCarouselSpeakerSeamRect;
    root.resolveCarouselSpeakerSeamRectFromImageUrl = api.resolveCarouselSpeakerSeamRectFromImageUrl;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function (global) {
  'use strict';

  const MASTER_W = 2160;
  const MASTER_H = 1350;
  const PANEL_W = 1080;
  const SEAM_OVERLAP_PX = 220;
  const CLIPPING_TARGET_WIDTH = 980;
  const DATE_STRIP_GAP_PX = 18;
  const QUILT_CLIPPING_GAP_PX = 0;
  const CONTRIBUTOR_TITLE_SLIDE1_MARGIN_PX = 20;
  const CONTRIBUTOR_CLIPPING_SAFE_MARGIN_PX = 24;
  /** Center contributor clipping on slide 2 right edge (seam into slide 3). */
  const CAROUSEL_SEAM_X = PANEL_W;
  /** Slide 3: full quilt on warm off-white mat over shared cover bg. */
  const SLIDE3_MATTE_FILL = '#f6f4f1';
  const SLIDE3_BG_GUTTER_PX = 16;
  /** Uniform mat width on all four sides of the contained quilt. */
  const SLIDE3_FRAME_PX = 28;
  /** Clockwise tilt so the bottom sits slightly left of the top. */
  const SLIDE3_FRAME_TILT_DEG = 2.25;
  /** Slightly inset framed quilt inside the mat (1 = max fit). */
  const SLIDE3_QUILT_SCALE = 0.95;
  /** Slide 3 quilt name strip — Layout B author strip style. */
  const SLIDE3_NAME_STRIP_FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
  const SLIDE3_NAME_STRIP_BG = '#636363';
  const SLIDE3_NAME_STRIP_INK = '#f3eee4';
  const SLIDE3_NAME_STRIP_FONT_PX = 58;
  const SLIDE3_NAME_STRIP_PAD_X = 52;
  const SLIDE3_NAME_STRIP_PAD_Y = 22;
  const SLIDE3_NAME_STRIP_LETTER_SPACING_EM = 0.12;
  const SLIDE3_NAME_STRIP_GAP_PX = 32;

  function resolveSharedQuiltRect(quiltImg, options = {}) {
    const preset = options.quiltCanvasRect;
    if (preset && Number.isFinite(Number(preset.x)) && Number(preset.width) > 0) {
      const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
      const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
      return {
        x: Math.round(Number(preset.x)),
        y: Math.round(Number(preset.y)),
        width: Math.round(Number(preset.width)),
        height: Math.round(Number(preset.height)),
        sourceWidth: Number(preset.sourceWidth) > 0 ? Math.round(Number(preset.sourceWidth)) : iw,
        sourceHeight: Number(preset.sourceHeight) > 0 ? Math.round(Number(preset.sourceHeight)) : ih
      };
    }
    const CQB = global.CarouselQuiltBg || globalThis.CarouselQuiltBg;
    if (typeof CQB?.resolveLayoutBCarouselQuiltRect === 'function') {
      const resolved = CQB.resolveLayoutBCarouselQuiltRect(quiltImg, PANEL_W, MASTER_H, {
        quiltBgZoom: options.quiltBgZoom,
        quiltFit: options.quiltFit
      });
      return resolved?.rect || null;
    }
    const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    const zoom = Number(options.quiltBgZoom) > 0 ? Number(options.quiltBgZoom) : 1;
    const postScale = Math.max(PANEL_W / iw, MASTER_H / ih) * 1.04 * zoom;
    const dw = Math.round(iw * postScale);
    const dh = Math.round(ih * postScale);
    return {
      x: Math.round((PANEL_W - dw) / 2),
      y: Math.round((MASTER_H - dh) / 2),
      width: dw,
      height: dh,
      sourceWidth: iw,
      sourceHeight: ih
    };
  }

  function drawSharedQuiltBg(ctx, quiltImg, rect, panelW, panelH, options = {}) {
    const CQB = global.CarouselQuiltBg || globalThis.CarouselQuiltBg;
    const drawOpts = { smoothingQuality: options.smoothingQuality || 'high' };
    if (options.flip === true && typeof CQB?.drawLayoutBCarouselQuiltBgFlipped === 'function') {
      CQB.drawLayoutBCarouselQuiltBgFlipped(ctx, quiltImg, rect, panelW, panelH, drawOpts);
      return;
    }
    if (typeof CQB?.drawLayoutBCarouselQuiltBg === 'function') {
      CQB.drawLayoutBCarouselQuiltBg(ctx, quiltImg, rect, panelW, panelH, drawOpts);
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, panelW, panelH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = drawOpts.smoothingQuality;
    if (options.flip === true) {
      ctx.save();
      ctx.translate(panelW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        quiltImg,
        0,
        0,
        rect.sourceWidth,
        rect.sourceHeight,
        rect.x,
        rect.y,
        rect.width,
        rect.height
      );
      ctx.restore();
      return;
    }
    ctx.drawImage(
      quiltImg,
      0,
      0,
      rect.sourceWidth,
      rect.sourceHeight,
      rect.x,
      rect.y,
      rect.width,
      rect.height
    );
  }

  function drawQuiltNameStrip(ctx, name, centerX, centerY, tiltRad, extraOpts = {}) {
    const draw = global.odqDrawLayoutBNameStrip || globalThis.odqDrawLayoutBNameStrip;
    if (typeof draw === 'function') {
      return draw(ctx, name, centerX, centerY, tiltRad, {
        fontPx: SLIDE3_NAME_STRIP_FONT_PX,
        padX: SLIDE3_NAME_STRIP_PAD_X,
        padY: SLIDE3_NAME_STRIP_PAD_Y,
        variant: 'light',
        ...extraOpts
      });
    }
    // Fallback if layout-b-compose not loaded
    const text = String(name || '').trim();
    if (!text) return null;
    ctx.save();
    ctx.font = `600 ${SLIDE3_NAME_STRIP_FONT_PX}px ${SLIDE3_NAME_STRIP_FONT}`;
    ctx.letterSpacing = `${SLIDE3_NAME_STRIP_FONT_PX * SLIDE3_NAME_STRIP_LETTER_SPACING_EM}px`;
    const textW = ctx.measureText(text).width;
    const stripW = textW + SLIDE3_NAME_STRIP_PAD_X * 2;
    const stripH = SLIDE3_NAME_STRIP_FONT_PX + SLIDE3_NAME_STRIP_PAD_Y * 2;
    if (Number.isFinite(extraOpts.rightEdgeX)) centerX = extraOpts.rightEdgeX - stripW / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(tiltRad);
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 14; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#f3eee4';
    ctx.fillRect(-stripW / 2, -stripH / 2, stripW, stripH);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#404040'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
    return { stripW, stripH, centerX, centerY };
  }

  /** Slide 3: shared cover bg + entire quilt with equal off-white mat on all sides. */
  function drawSlide3FramedFullQuilt(ctx, quiltImg, quiltBgRect, panelW, panelH, options = {}) {
    drawSharedQuiltBg(ctx, quiltImg, quiltBgRect, panelW, panelH, {
      flip: false,
      smoothingQuality: options.smoothingQuality || 'high'
    });

    const framePx = Math.max(
      12,
      Math.round(Number(options.slide3FramePx) || SLIDE3_FRAME_PX)
    );
    const bgGutter = Math.max(
      8,
      Math.round(Number(options.slide3BgGutterPx) || SLIDE3_BG_GUTTER_PX)
    );
    const matteFill = String(options.slide3MatteFill || SLIDE3_MATTE_FILL).trim() || SLIDE3_MATTE_FILL;

    const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    const maxCardW = Math.max(1, panelW - bgGutter * 2);
    const maxCardH = Math.max(1, panelH - bgGutter * 2);
    const maxQuiltW = Math.max(1, maxCardW - framePx * 2);
    const maxQuiltH = Math.max(1, maxCardH - framePx * 2);
    const scale = Math.min(maxQuiltW / iw, maxQuiltH / ih);
    const quiltScale =
      Number(options.slide3QuiltScale) > 0
        ? Number(options.slide3QuiltScale)
        : SLIDE3_QUILT_SCALE;
    const dw = Math.round(iw * scale * quiltScale);
    const dh = Math.round(ih * scale * quiltScale);
    const cardW = dw + framePx * 2;
    const cardH = dh + framePx * 2;
    const cardX = Math.round((panelW - cardW) / 2);
    const cardY = Math.round((panelH - cardH) / 2);
    const tiltDeg = Number(options.slide3FrameTiltDeg);
    const tiltRad =
      ((Number.isFinite(tiltDeg) ? tiltDeg : SLIDE3_FRAME_TILT_DEG) * Math.PI) / 180;

    ctx.save();
    ctx.translate(cardX + cardW / 2, cardY + cardH / 2);
    ctx.rotate(tiltRad);
    ctx.fillStyle = matteFill;
    ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = options.smoothingQuality || 'high';
    ctx.drawImage(
      quiltImg,
      0,
      0,
      iw,
      ih,
      -cardW / 2 + framePx,
      -cardH / 2 + framePx,
      dw,
      dh
    );
    ctx.restore();

    const quiltName = String(options.winningQuiltName || '').trim();
    let nameStripMeta = null;
    if (quiltName) {
      const stripH = SLIDE3_NAME_STRIP_FONT_PX + SLIDE3_NAME_STRIP_PAD_Y * 2;
      // Anchor right edge just slightly inside the white frame border; strip extends left onto slide 2
      const stripRightEdgeX = cardX + 5;
      const stripCY = cardY + Math.round(stripH * 0.5);
      nameStripMeta = drawQuiltNameStrip(ctx, quiltName, 0, stripCY, tiltRad, { rightEdgeX: stripRightEdgeX });
    }

    return {
      matteFill,
      framePx,
      bgGutterPx: bgGutter,
      tiltDeg: (tiltRad * 180) / Math.PI,
      quiltScale,
      cardX,
      cardY,
      cardW,
      cardH,
      quiltX: cardX + framePx,
      quiltY: cardY + framePx,
      quiltW: dw,
      quiltH: dh,
      nameStrip: nameStripMeta
    };
  }

  /** Contributor clippings are alpha-trimmed in quilt-newspaper-clipping — no pixel scan needed. */
  function opaqueBoundsFromTrimmedCanvas(canvasLike) {
    if (!canvasLike) return null;
    const w = Math.max(1, canvasLike.width || canvasLike.naturalWidth || 1);
    const h = Math.max(1, canvasLike.height || canvasLike.naturalHeight || 1);
    return { x: 0, y: 0, width: w, height: h };
  }

  function resolveContributorClippingPlacement(bounds, seamOverlapPx, _quiltLeftX, placementOpts = {}) {
    const contentW = Math.max(1, Number(bounds?.width) || 1);
    const contentH = Math.max(1, Number(bounds?.height) || 1);
    const seamRight = PANEL_W + seamOverlapPx;
    const quiltMargin = QUILT_CLIPPING_GAP_PX;
    const quiltCap = Math.max(PANEL_W, Math.round(PANEL_W) - quiltMargin);
    const maxDestRight =
      Number(placementOpts.maxDestRight) > 0
        ? Math.min(quiltCap, Math.round(Number(placementOpts.maxDestRight)))
        : quiltCap;
    const straddleSeam =
      placementOpts.straddleSeam !== false && placementOpts.straddleSeam !== 0;
    // Straddle slide 2–3: bleed to quilt edge; legacy: capped seam overlap only.
    const maxRight = straddleSeam ? maxDestRight : Math.min(seamRight, maxDestRight);
    const minDestX =
      Number(placementOpts.minDestX) >= 0 ? Math.round(Number(placementOpts.minDestX)) : 24;

    let destX;
    if (straddleSeam) {
      destX = Math.round(CAROUSEL_SEAM_X - contentW / 2);
      if (destX + contentW > maxRight) {
        destX = Math.round(maxRight - contentW);
      }
      destX = Math.max(minDestX, destX);
    } else {
      destX = Math.round(maxRight - contentW);
      destX = Math.max(minDestX, Math.min(destX, maxRight - contentW));
    }

    const titleEndX = Number(placementOpts.titleEndX);
    const titleSlackPx = Number(placementOpts.titleSlackPx) || 0;
    if (!straddleSeam && Number.isFinite(titleEndX) && titleEndX > 0) {
      const margin =
        Number(placementOpts.titleSlide1MarginPx) > 0
          ? Math.round(Number(placementOpts.titleSlide1MarginPx))
          : CONTRIBUTOR_TITLE_SLIDE1_MARGIN_PX;
      const opaqueX = Number(bounds?.x) || 0;
      const inkRight = titleEndX + titleSlackPx;
      const titleRightOnMaster = destX + inkRight - opaqueX;
      const maxTitleRight = PANEL_W - margin;
      if (titleRightOnMaster > maxTitleRight) {
        destX = Math.round(maxTitleRight - (inkRight - opaqueX));
        destX = Math.max(minDestX, destX);
      }
    }

    const destY = Math.round((MASTER_H - contentH) / 2);
    const titleRightOnMaster =
      Number.isFinite(titleEndX) && titleEndX > 0
        ? destX + titleEndX + titleSlackPx - (Number(bounds?.x) || 0)
        : null;
    return {
      destX,
      destY,
      contentW,
      contentH,
      clipRightX: maxRight,
      seamOverlapPx,
      quiltLeftX: PANEL_W,
      straddleSeam,
      seamX: CAROUSEL_SEAM_X,
      clippingCenterX: destX + contentW / 2,
      titleEndX: Number.isFinite(titleEndX) && titleEndX > 0 ? titleEndX : null,
      titleRightOnMaster
    };
  }

  function resolveContributorClippingStackPlacement(
    mainOpaque,
    dateOpaque,
    seamOverlapPx,
    quiltLeftX,
    gapPx = DATE_STRIP_GAP_PX,
    placementOpts = {}
  ) {
    const main = resolveContributorClippingPlacement(
      mainOpaque,
      seamOverlapPx,
      quiltLeftX,
      placementOpts
    );
    if (!dateOpaque?.width || !dateOpaque?.height) {
      return { main, dateStrip: null, stackHeight: main.contentH, gapPx: 0 };
    }
    const dateContentW = Math.max(1, Number(dateOpaque.width) || 1);
    const dateContentH = Math.max(1, Number(dateOpaque.height) || 1);
    const stackH = main.contentH + gapPx + dateContentH;
    const stackTop = Math.max(0, Math.round((MASTER_H - stackH) / 2));
    const minDateX =
      Number(placementOpts.minDestX) >= 0 ? Math.round(Number(placementOpts.minDestX)) : 0;
    const maxDateX = Math.max(minDateX, Math.round((main.clipRightX || PANEL_W) - dateContentW));
    const centeredDateX = Math.round(main.destX + (main.contentW - dateContentW) / 2);
    const dateDestX = Math.max(minDateX, Math.min(centeredDateX, maxDateX));
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

  function resolveMirroredQuiltExtensionBounds() {
    return null;
  }

  function resolveMirroredQuiltExtensionPlacement() {
    return null;
  }

  function drawMirroredQuiltExtension() {
    return null;
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
    const quiltRect = resolveSharedQuiltRect(quiltImg, options);
    if (!quiltRect) return null;

    const slide2Canvas = document.createElement('canvas');
    slide2Canvas.width = PANEL_W;
    slide2Canvas.height = MASTER_H;
    const slide2Ctx = slide2Canvas.getContext('2d');
    if (!slide2Ctx) return null;

    drawSharedQuiltBg(slide2Ctx, quiltImg, quiltRect, PANEL_W, MASTER_H, { flip: true });

    const clipW = Math.max(1, clippingCanvas.width || clippingCanvas.naturalWidth || 1);
    const clipH = Math.max(1, clippingCanvas.height || clippingCanvas.naturalHeight || 1);
    const opaque = opaqueBoundsFromTrimmedCanvas(clippingCanvas);
    const dateOpaque = dateStripCanvas ? opaqueBoundsFromTrimmedCanvas(dateStripCanvas) : null;
    const maxClippingW = Math.max(1, PANEL_W - CONTRIBUTOR_CLIPPING_SAFE_MARGIN_PX - seamOverlapPx);
    const widestClipping = Math.max(
      opaque.width,
      dateOpaque?.width || 0
    );
    const clippingScale = Math.min(1, maxClippingW / Math.max(1, widestClipping));
    const drawOpaque = {
      x: 0,
      y: 0,
      width: Math.max(1, Math.round(opaque.width * clippingScale)),
      height: Math.max(1, Math.round(opaque.height * clippingScale))
    };
    const drawDateOpaque = dateOpaque
      ? {
          x: 0,
          y: 0,
          width: Math.max(1, Math.round(dateOpaque.width * clippingScale)),
          height: Math.max(1, Math.round(dateOpaque.height * clippingScale))
        }
      : null;
    const titleEndX =
      typeof clippingResult === 'object' && clippingResult?.titleEndX != null
        ? Number(clippingResult.titleEndX)
        : null;
    const titlePx =
      typeof clippingResult === 'object' && clippingResult?.titlePx != null
        ? Number(clippingResult.titlePx)
        : null;
    const placementOpts = {
      straddleSeam: options.straddleSeam !== false,
      minDestX: seamOverlapPx,
      maxDestRight: PANEL_W - CONTRIBUTOR_CLIPPING_SAFE_MARGIN_PX
    };
    if (Number.isFinite(titleEndX) && titleEndX > 0) {
      placementOpts.titleEndX = titleEndX * clippingScale;
      if (Number.isFinite(titlePx) && titlePx > 0) {
        placementOpts.titleSlackPx = Math.max(8, Math.round(titlePx * clippingScale * 0.1));
      }
    }
    const stack = resolveContributorClippingStackPlacement(
      drawOpaque,
      drawDateOpaque,
      seamOverlapPx,
      PANEL_W,
      Number(options.dateStripGapPx) > 0 ? Math.round(Number(options.dateStripGapPx)) : DATE_STRIP_GAP_PX,
      placementOpts
    );
    const placement = stack.main;
    slide2Ctx.save();
    slide2Ctx.beginPath();
    slide2Ctx.rect(0, 0, placement.clipRightX, MASTER_H);
    slide2Ctx.clip();
    slide2Ctx.drawImage(
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
      slide2Ctx.drawImage(
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
    slide2Ctx.restore();

    const slide3Canvas = document.createElement('canvas');
    slide3Canvas.width = PANEL_W;
    slide3Canvas.height = MASTER_H;
    const slide3Ctx = slide3Canvas.getContext('2d');
    if (!slide3Ctx) return null;
    const slide3Frame = drawSlide3FramedFullQuilt(
      slide3Ctx,
      quiltImg,
      quiltRect,
      PANEL_W,
      MASTER_H,
      options
    );

    const [slide1Blob, slide2Blob] = await Promise.all([
      canvasToBlob(slide2Canvas),
      canvasToBlob(slide3Canvas)
    ]);

    if (!slide1Blob || !slide2Blob) return null;

    return {
      slide1Blob,
      slide2Blob,
      masterBlob: null,
      meta: {
        panelWidth: PANEL_W,
        panelHeight: MASTER_H,
        quiltCanvasRect: quiltRect,
        seamOverlapPx,
        clippingWidth: clipW,
        clippingHeight: clipH,
        clippingContentWidth: opaque.width,
        clippingContentHeight: opaque.height,
        clippingX: placement.destX,
        clippingY: placement.destY,
        clipRightX: placement.clipRightX,
        straddleSeam: placement.straddleSeam,
        seamX: placement.seamX,
        clippingCenterX: placement.clippingCenterX,
        quiltLeftX: PANEL_W,
        quiltClippingGapPx: QUILT_CLIPPING_GAP_PX,
        dateStripGapPx: stack.gapPx,
        dateStripX: stack.dateStrip?.destX ?? null,
        dateStripY: stack.dateStrip?.destY ?? null,
        dateStripW: stack.dateStrip?.contentW ?? null,
        dateStripH: stack.dateStrip?.contentH ?? null,
        clippingStackHeight: stack.stackHeight,
        clippingContentX: opaque.x,
        clippingContentY: opaque.y,
        titleEndX: stack.main.titleEndX,
        titleInkEndX:
          typeof clippingResult === 'object' ? clippingResult?.titleInkEndX ?? null : null,
        titleRightOnMaster: stack.main.titleRightOnMaster,
        nameCount: names.length,
        contributorList: clippingComposeMetaFields(clippingResult),
        dateStrip: clippingComposeMetaFields(dateStripResult),
        carouselQuiltBgMode: 'layout-b-shared-flip-a',
        slide3Frame: slide3Frame || null
      }
    };
  }

  /**
   * Duplicate a single 1080×1350 classic image to both carousel slides (empty-contributor fallback).
   * @param {string} classicDataUrl
   * @returns {Promise<{ slide1Blob: Blob|null, slide2Blob: Blob|null }|null>}
   */
  async function duplicateClassicToCarouselSlides(classicDataUrl, options = {}) {
    if (!classicDataUrl) return null;
    const img = await loadImageFromDataUrl(classicDataUrl);
    const quiltRect = resolveSharedQuiltRect(img, options);
    if (!quiltRect) return null;

    const slide2Canvas = document.createElement('canvas');
    slide2Canvas.width = PANEL_W;
    slide2Canvas.height = MASTER_H;
    const slide2Ctx = slide2Canvas.getContext('2d');
    if (!slide2Ctx) return null;
    drawSharedQuiltBg(slide2Ctx, img, quiltRect, PANEL_W, MASTER_H, { flip: true });

    const slide3Canvas = document.createElement('canvas');
    slide3Canvas.width = PANEL_W;
    slide3Canvas.height = MASTER_H;
    const slide3Ctx = slide3Canvas.getContext('2d');
    if (!slide3Ctx) return null;
    drawSlide3FramedFullQuilt(slide3Ctx, img, quiltRect, PANEL_W, MASTER_H, options);

    const [slide1Blob, slide2Blob] = await Promise.all([
      canvasToBlob(slide2Canvas),
      canvasToBlob(slide3Canvas)
    ]);
    if (!slide1Blob || !slide2Blob) return null;
    return {
      slide1Blob,
      slide2Blob,
      meta: { fallbackClassic: true, carouselQuiltBgMode: 'layout-b-shared-flip-a' }
    };
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
    overlapFraction = CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION,
    placement = {}
  ) {
    const shortQuote = !!placement.shortQuote;
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
    const y = Math.round(panelH - minPad - h);
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
    options = {}
  ) {
    let overlapFraction = CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION;
    let shortQuote = false;
    if (typeof options === 'number') {
      overlapFraction = options;
    } else if (options && typeof options === 'object') {
      overlapFraction = options.overlapFraction ?? overlapFraction;
      shortQuote = !!options.shortQuote;
    }
    const img = await loadImageFromUrl(imageUrl);
    return resolveCarouselSpeakerSeamRect(PANEL_W, MASTER_H, img, overlapFraction, { shortQuote });
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
      overlapFraction = CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION,
      shortQuote = false,
      composedSpeakerRect = null,
      skipSlide1SpeakerDraw = false
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

    const useComposedRect =
      skipSlide1SpeakerDraw &&
      composedSpeakerRect &&
      Number.isFinite(Number(composedSpeakerRect.width)) &&
      Number(composedSpeakerRect.width) > 0;
    const rect = useComposedRect
      ? (() => {
          const r = composedSpeakerRect;
          const overlap = Math.max(
            0.12,
            Math.min(0.38, Number(r.overlapFraction) || overlapFraction || CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION)
          );
          const overlapPx = Math.max(1, Math.round(Number(r.width) * overlap));
          return {
            x: Math.round(Number(r.x)),
            y: Math.round(Number(r.y)),
            width: Math.round(Number(r.width)),
            height: Math.round(Number(r.height)),
            angle: Number(r.angle || 0),
            contentX: Number.isFinite(Number(r.contentX)) ? Math.round(Number(r.contentX)) : Math.round(Number(r.x)),
            contentY: Number.isFinite(Number(r.contentY)) ? Math.round(Number(r.contentY)) : Math.round(Number(r.y)),
            contentWidth: Number.isFinite(Number(r.contentWidth))
              ? Math.round(Number(r.contentWidth))
              : Math.round(Number(r.width)),
            contentHeight: Number.isFinite(Number(r.contentHeight))
              ? Math.round(Number(r.contentHeight))
              : Math.round(Number(r.height)),
            overlapFraction: overlap,
            overlapPx
          };
        })()
      : resolveCarouselSpeakerSeamRect(PANEL_W, MASTER_H, speakerImg, overlapFraction, {
          shortQuote
        });
    const isCutoutPng = /speaker-cutouts(?:%2F|\/)/i.test(
      String(cutoutSourceUrl || speakerUrl)
    );
    const speakerDrawOpts = {
      washColor,
      seed: String(dateKey || 'carousel-seam'),
      isCutoutPng,
      newsprintSurface: false,
      compositeOverQuilt: true,
      drawScannerBed: false,
      skipScannerBed: true,
      bleedPhase: 'carousel-seam-slide2'
    };
    const speakerRect = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      angle: rect.angle || 0
    };

    const out1 = document.createElement('canvas');
    out1.width = PANEL_W;
    out1.height = MASTER_H;
    const ctx1 = out1.getContext('2d');
    if (!ctx1) return null;
    ctx1.drawImage(slide1Img, 0, 0, PANEL_W, MASTER_H);
    if (!skipSlide1SpeakerDraw) {
      const drawn = SCR.drawSpeakerCutoutStack(ctx1, speakerImg, speakerRect, speakerDrawOpts);
      if (!drawn) return null;
      if (!shortQuote) {
        const preserveW = Math.round(Math.min(rect.width * 0.62, PANEL_W - rect.x));
        const preserveH = Math.round(Math.max(56, rect.height * 0.11 + 36));
        const preserveX = Math.round(rect.x + rect.width / 2 - preserveW / 2);
        const preserveY = Math.round(rect.y + rect.height - preserveH * 0.58);
        const sx = Math.max(0, preserveX);
        const sy = Math.max(0, preserveY);
        const sw = Math.min(preserveW, PANEL_W - sx);
        const sh = Math.min(preserveH, MASTER_H - sy);
        if (sw > 8 && sh > 8) {
          ctx1.drawImage(slide1Img, sx, sy, sw, sh, sx, sy, sw, sh);
        }
      }
    }

    const out2 = document.createElement('canvas');
    out2.width = PANEL_W;
    out2.height = MASTER_H;
    const ctx2 = out2.getContext('2d');
    if (!ctx2) return null;
    ctx2.drawImage(slide2Img, 0, 0, PANEL_W, MASTER_H);
    const overlapPx = rect.overlapPx;
    /** Align speaker so its right overlapPx strip lands on slide 2's left edge (x=0). */
    const slide2SpeakerRect = {
      x: overlapPx - rect.width,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      angle: rect.angle || 0
    };
    ctx2.save();
    ctx2.beginPath();
    ctx2.rect(0, rect.y, overlapPx, rect.height);
    ctx2.clip();
    const drawnSeam = SCR.drawSpeakerCutoutStack(ctx2, speakerImg, slide2SpeakerRect, speakerDrawOpts);
    ctx2.restore();
    if (!drawnSeam) return null;

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
    resolveSharedQuiltRect,
    drawSharedQuiltBg,
    drawSlide3FramedFullQuilt,
    MASTER_W,
    MASTER_H,
    PANEL_W,
    SEAM_OVERLAP_PX,
    SLIDE3_MATTE_FILL,
    SLIDE3_BG_GUTTER_PX,
    SLIDE3_FRAME_PX,
    SLIDE3_FRAME_TILT_DEG,
    SLIDE3_QUILT_SCALE,
    CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION,
    CAROUSEL_SPEAKER_TARGET_AREA_FRAC,
    CAROUSEL_SPEAKER_MIN_SLIDE2_BLEED_FRAC,
    DATE_STRIP_GAP_PX,
    resolveContributorClippingPlacement,
    resolveContributorClippingStackPlacement,
    CONTRIBUTOR_TITLE_SLIDE1_MARGIN_PX
  };
});
