/**
 * IG carousel slides 2–3: slide 2 = framed quilt + title strip on flipped cover bg (speaker seam from slide 1);
 * slide 3 = contributor clipping centered on unflipped cover bg.
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
    root.resolveCarouselSpeakerSeamOverlapPx = api.resolveCarouselSpeakerSeamOverlapPx;
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
  /** Slide 2 (IG): framed quilt + winning-quilt title strip on flipped cover bg; speaker seam bleeds on left edge. */
  const CAROUSEL_SEAM_X = PANEL_W;
  /** Slide 2 / slide 3 shared mat + title strip styling (drawSlide3FramedFullQuilt). */
  const SLIDE3_MATTE_FILL = '#f6f4f1';
  const SLIDE3_BG_GUTTER_PX = 16;
  /** Uniform mat width on all four sides of the contained quilt. */
  const SLIDE3_FRAME_PX = 50;
  /** Clockwise tilt so the bottom sits slightly left of the top. */
  const SLIDE3_FRAME_TILT_DEG = 2.25;
  /** Slightly inset framed quilt inside the mat (1 = max fit). */
  const SLIDE3_QUILT_SCALE = 0.95;
  /** Soft lift under the tilted framed quilt card. */
  const SLIDE3_FRAME_SHADOW_COLOR = 'rgba(0,0,0,0.14)';
  const SLIDE3_FRAME_SHADOW_BLUR = 24;
  const SLIDE3_FRAME_SHADOW_OFFSET_X = 0;
  const SLIDE3_FRAME_SHADOW_OFFSET_Y = 10;
  /** Inset from quilt edges when placing the title strip on the framed quilt panel. */
  const SLIDE3_NAME_STRIP_EDGE_INSET_PX = 8;
  /** Slide 3 quilt name strip — Layout B author strip style. */
  const SLIDE3_NAME_STRIP_FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
  const SLIDE3_NAME_STRIP_BG = '#636363';
  const SLIDE3_NAME_STRIP_INK = '#f3eee4';
  const SLIDE3_NAME_STRIP_FONT_PX = 42;
  const SLIDE3_NAME_STRIP_PAD_X = 37;
  const SLIDE3_NAME_STRIP_PAD_Y = 16;
  const SLIDE3_NAME_STRIP_LETTER_SPACING_EM = 0.12;
  const SLIDE3_NAME_STRIP_GAP_PX = 23;

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
        quiltBgOffsetY: options.quiltBgOffsetY,
        quiltFit: options.quiltFit
      });
      return resolved?.rect || null;
    }
    const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    const zoom = Number(options.quiltBgZoom) > 0 ? Number(options.quiltBgZoom) : 1;
    const offsetY = Number(options.quiltBgOffsetY) || 0;
    const postScale = Math.max(PANEL_W / iw, MASTER_H / ih) * 1.04 * zoom;
    const dw = Math.round(iw * postScale);
    const dh = Math.round(ih * postScale);
    return {
      x: Math.round((PANEL_W - dw) / 2),
      y: Math.round((MASTER_H - dh) / 2 + offsetY * MASTER_H),
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

  function measureQuiltNameStripWidth(ctx, name) {
    const text = String(name || '').trim();
    if (!text) return 0;
    ctx.save();
    ctx.font = `600 ${SLIDE3_NAME_STRIP_FONT_PX}px ${SLIDE3_NAME_STRIP_FONT}`;
    ctx.letterSpacing = `${SLIDE3_NAME_STRIP_FONT_PX * SLIDE3_NAME_STRIP_LETTER_SPACING_EM}px`;
    const textW = ctx.measureText(text).width;
    ctx.restore();
    return textW + SLIDE3_NAME_STRIP_PAD_X * 2 + SLIDE3_NAME_STRIP_FONT_PX * SLIDE3_NAME_STRIP_LETTER_SPACING_EM;
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
    const bgQuiltImg = options.slide3BgQuiltImg || quiltImg;
    drawSharedQuiltBg(ctx, bgQuiltImg, quiltBgRect, panelW, panelH, {
      flip: options.slide3BgFlip === true,
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
    const maxQuiltW = Math.max(1, maxCardW);
    const maxQuiltH = Math.max(1, maxCardH);
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
    ctx.shadowColor = SLIDE3_FRAME_SHADOW_COLOR;
    ctx.shadowBlur = SLIDE3_FRAME_SHADOW_BLUR;
    ctx.shadowOffsetX = SLIDE3_FRAME_SHADOW_OFFSET_X;
    ctx.shadowOffsetY = SLIDE3_FRAME_SHADOW_OFFSET_Y;
    ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
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
      const stripW = measureQuiltNameStripWidth(ctx, quiltName);
      const quiltLeft = cardX + framePx;
      const quiltBottom = cardY + framePx + dh;
      const edgeInset = SLIDE3_NAME_STRIP_EDGE_INSET_PX;
      const bottomInset = SLIDE3_NAME_STRIP_GAP_PX;
      const stripCY = quiltBottom - Math.round(stripH * 0.5) - bottomInset;
      const minCenterX = quiltLeft + edgeInset + stripW / 2;
      const maxCenterX = quiltLeft + dw - edgeInset - stripW / 2;
      const stripCX =
        minCenterX >= maxCenterX
          ? quiltLeft + dw / 2
          : Math.min(maxCenterX, Math.max(minCenterX, quiltLeft + dw / 2));
      nameStripMeta = drawQuiltNameStrip(ctx, quiltName, stripCX, stripCY, tiltRad);
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
    const centerOnPanel = placementOpts.centerOnPanel === true;
    const safeMargin = Math.max(
      0,
      Math.round(
        Number(placementOpts.safeMarginPx) > 0
          ? Number(placementOpts.safeMarginPx)
          : CONTRIBUTOR_CLIPPING_SAFE_MARGIN_PX
      )
    );

    if (centerOnPanel) {
      const minX = safeMargin;
      const maxX = Math.max(minX, PANEL_W - safeMargin - contentW);
      const minY = safeMargin;
      const maxY = Math.max(minY, MASTER_H - safeMargin - contentH);
      const destX = Math.max(minX, Math.min(maxX, Math.round((PANEL_W - contentW) / 2)));
      const destY = Math.max(minY, Math.min(maxY, Math.round((MASTER_H - contentH) / 2)));
      return {
        destX,
        destY,
        contentW,
        contentH,
        clipRightX: PANEL_W,
        seamOverlapPx,
        quiltLeftX: PANEL_W,
        straddleSeam: false,
        seamX: CAROUSEL_SEAM_X,
        clippingCenterX: destX + contentW / 2,
        titleEndX: null,
        titleRightOnMaster: null
      };
    }

    const seamRight = PANEL_W + seamOverlapPx;
    const quiltMargin = QUILT_CLIPPING_GAP_PX;
    const quiltCap = Math.max(PANEL_W, Math.round(PANEL_W) - quiltMargin);
    const maxDestRight =
      Number(placementOpts.maxDestRight) > 0
        ? Math.min(quiltCap, Math.round(Number(placementOpts.maxDestRight)))
        : quiltCap;
    const straddleSeam =
      placementOpts.straddleSeam === true || placementOpts.straddleSeam === 1;
    const maxRight = straddleSeam ? maxDestRight : Math.min(seamRight, maxDestRight);
    const minDestX =
      Number(placementOpts.minDestX) >= 0
        ? Math.round(Number(placementOpts.minDestX))
        : straddleSeam
          ? 24
          : CONTRIBUTOR_CLIPPING_SAFE_MARGIN_PX;

    let destX;
    if (!straddleSeam) {
      const maxX = Math.max(minDestX, maxDestRight - contentW);
      destX = Math.round((PANEL_W - contentW) / 2);
      destX = Math.max(minDestX, Math.min(destX, maxX));
    } else {
      const pastSeamFrac =
        Number(placementOpts.pastSeamFraction) >= 0 &&
        Number(placementOpts.pastSeamFraction) <= 0.5
          ? Number(placementOpts.pastSeamFraction)
          : 0.5;
      destX = Math.round(CAROUSEL_SEAM_X - contentW * (1 - pastSeamFrac));
      if (destX + contentW > maxRight) {
        destX = Math.round(maxRight - contentW);
      }
      destX = Math.max(minDestX, destX);
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
      clipRightX: straddleSeam ? maxRight : PANEL_W,
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
    gapPxIn = DATE_STRIP_GAP_PX,
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
    const gapPx = Math.max(0, Math.round(Number(gapPxIn) || DATE_STRIP_GAP_PX));
    const stackH = main.contentH + gapPx + dateContentH;
    const safeMargin = Math.max(
      0,
      Math.round(
        Number(placementOpts.safeMarginPx) > 0
          ? Number(placementOpts.safeMarginPx)
          : CONTRIBUTOR_CLIPPING_SAFE_MARGIN_PX
      )
    );
    const stackTopIdeal = Math.round((MASTER_H - stackH) / 2);
    const stackTopMin = safeMargin;
    const stackTopMax = Math.max(stackTopMin, MASTER_H - safeMargin - stackH);
    const stackTop = Math.max(stackTopMin, Math.min(stackTopIdeal, stackTopMax));
    const centerOnPanel = placementOpts.centerOnPanel === true;
    const minDateX = centerOnPanel
      ? safeMargin
      : Number(placementOpts.minDestX) >= 0
        ? Math.round(Number(placementOpts.minDestX))
        : 0;
    const maxDateX = centerOnPanel
      ? Math.max(minDateX, PANEL_W - safeMargin - dateContentW)
      : Math.max(minDateX, Math.round((main.clipRightX || PANEL_W) - dateContentW));
    const centeredDateX = centerOnPanel
      ? Math.round((PANEL_W - dateContentW) / 2)
      : Math.round(main.destX + (main.contentW - dateContentW) / 2);
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

    const quiltImg = await loadImageFromBlob(quiltBlob);
    const quiltRect = resolveSharedQuiltRect(quiltImg, options);
    if (!quiltRect) return null;

    const slide2QuiltImg = options.slide3QuiltBlob
      ? await loadImageFromBlob(options.slide3QuiltBlob)
      : quiltImg;

    const slide2Canvas = document.createElement('canvas');
    slide2Canvas.width = PANEL_W;
    slide2Canvas.height = MASTER_H;
    const slide2Ctx = slide2Canvas.getContext('2d');
    if (!slide2Ctx) return null;
    const slide2QuiltFrame = drawSlide3FramedFullQuilt(
      slide2Ctx,
      slide2QuiltImg,
      quiltRect,
      PANEL_W,
      MASTER_H,
      { ...options, slide3BgQuiltImg: quiltImg, slide3BgFlip: true }
    );

    const slide3Canvas = document.createElement('canvas');
    slide3Canvas.width = PANEL_W;
    slide3Canvas.height = MASTER_H;
    const slide3Ctx = slide3Canvas.getContext('2d');
    if (!slide3Ctx) return null;
    drawSharedQuiltBg(slide3Ctx, quiltImg, quiltRect, PANEL_W, MASTER_H, { flip: false });

    const clipW = Math.max(1, clippingCanvas.width || clippingCanvas.naturalWidth || 1);
    const clipH = Math.max(1, clippingCanvas.height || clippingCanvas.naturalHeight || 1);
    const opaque = opaqueBoundsFromTrimmedCanvas(clippingCanvas);
    const maxStackW = Math.max(1, PANEL_W - CONTRIBUTOR_CLIPPING_SAFE_MARGIN_PX * 2);
    const maxStackH = Math.max(1, MASTER_H - CONTRIBUTOR_CLIPPING_SAFE_MARGIN_PX * 2);
    const clippingScale = Math.min(
      1,
      maxStackW / Math.max(1, opaque.width),
      maxStackH / Math.max(1, opaque.height)
    );
    const drawOpaque = {
      x: 0,
      y: 0,
      width: Math.max(1, Math.round(opaque.width * clippingScale)),
      height: Math.max(1, Math.round(opaque.height * clippingScale))
    };
    const placementOpts = {
      centerOnPanel: true,
      safeMarginPx: CONTRIBUTOR_CLIPPING_SAFE_MARGIN_PX
    };
    const placement = resolveContributorClippingPlacement(drawOpaque, 0, 0, placementOpts);
    slide3Ctx.save();
    slide3Ctx.beginPath();
    slide3Ctx.rect(0, 0, PANEL_W, MASTER_H);
    slide3Ctx.clip();
    slide3Ctx.drawImage(
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
    slide3Ctx.restore();

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
        dateStripGapPx: 0,
        dateStripX: null,
        dateStripY: null,
        dateStripW: null,
        dateStripH: null,
        clippingStackHeight: placement.contentH,
        clippingContentX: opaque.x,
        clippingContentY: opaque.y,
        titleEndX: placement.titleEndX,
        titleInkEndX:
          typeof clippingResult === 'object' ? clippingResult?.titleInkEndX ?? null : null,
        titleRightOnMaster: placement.titleRightOnMaster,
        nameCount: names.length,
        contributorList: clippingComposeMetaFields(clippingResult),
        dateStrip: null,
        carouselQuiltBgMode: 'layout-b-flipped-then-plain',
        slide2QuiltFrame: slide2QuiltFrame || null,
        slide3Frame: slide2QuiltFrame || null
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
    drawSlide3FramedFullQuilt(slide2Ctx, img, quiltRect, PANEL_W, MASTER_H, {
      ...options,
      slide3BgFlip: true
    });

    const slide3Canvas = document.createElement('canvas');
    slide3Canvas.width = PANEL_W;
    slide3Canvas.height = MASTER_H;
    const slide3Ctx = slide3Canvas.getContext('2d');
    if (!slide3Ctx) return null;
    drawSharedQuiltBg(slide3Ctx, img, quiltRect, PANEL_W, MASTER_H, { flip: false });

    const [slide1Blob, slide2Blob] = await Promise.all([
      canvasToBlob(slide2Canvas),
      canvasToBlob(slide3Canvas)
    ]);
    if (!slide1Blob || !slide2Blob) return null;
    return {
      slide1Blob,
      slide2Blob,
      meta: { fallbackClassic: true, carouselQuiltBgMode: 'layout-b-flipped-then-plain' }
    };
  }

  /** Fraction of speaker cutout width that bleeds from slide 1 (layout B) into slide 2. */
  const CAROUSEL_SPEAKER_SEAM_OVERLAP_FRACTION = 0.28;
  /** Layout B slide 1: target cutout area as fraction of 1080×1350 panel. */
  const CAROUSEL_SPEAKER_TARGET_AREA_FRAC = 0.36;
  const CAROUSEL_SPEAKER_MAX_W_FRAC = 0.62;
  const CAROUSEL_SPEAKER_MAX_H_FRAC = 0.72;
  /** Min bleed onto slide 2 (framed quilt mat / left edge beside speaker seam). */
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

  /**
   * One alpha scan: tight opaque bounds + bottom-left opaque pixel (lowest row, leftmost ink).
   * Used for strip avoid (bounds) and name-strip overlap (opaque bottom-left).
   */
  function measureSpeakerImageAlphaMetrics(img, minAlpha = 40) {
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
    let opaqueBottomLeftX = minX;
    let opaqueBottomLeftY = maxY;
    for (let y = ih - 1; y >= 0; y -= 1) {
      let rowMinX = iw;
      let rowFound = false;
      for (let x = 0; x < iw; x += 1) {
        if (data[(y * iw + x) * 4 + 3] < minAlpha) continue;
        rowFound = true;
        if (x < rowMinX) rowMinX = x;
      }
      if (rowFound) {
        opaqueBottomLeftX = rowMinX;
        opaqueBottomLeftY = y;
        break;
      }
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      opaqueBottomLeftX,
      opaqueBottomLeftY
    };
  }

  /** Tight alpha bounds inside the cutout PNG (drops transparent headroom above hair). */
  function measureSpeakerImageContentBounds(img, minAlpha = 40) {
    const metrics = measureSpeakerImageAlphaMetrics(img, minAlpha);
    if (!metrics) return null;
    return {
      minX: metrics.minX,
      minY: metrics.minY,
      maxX: metrics.maxX,
      maxY: metrics.maxY,
      width: metrics.width,
      height: metrics.height
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
    let opaqueAnchorX = null;
    let opaqueAnchorY = null;
    const alphaMetrics = measureSpeakerImageAlphaMetrics(speakerImg);
    if (alphaMetrics) {
      const sx = w / iw;
      const sy = h / ih;
      contentX = Math.round(x + alphaMetrics.minX * sx);
      contentY = Math.round(y + alphaMetrics.minY * sy);
      contentWidth = Math.round(alphaMetrics.width * sx);
      contentHeight = Math.round(alphaMetrics.height * sy);
      opaqueAnchorX = Math.round(x + alphaMetrics.opaqueBottomLeftX * sx);
      opaqueAnchorY = Math.round(y + alphaMetrics.opaqueBottomLeftY * sy);
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
      opaqueAnchorX,
      opaqueAnchorY,
      angle: 0,
      overlapFraction: overlap,
      overlapPx,
      minBleedPx
    };
  }

  /** How far past slide 1's right edge the cutout frame extends (handles admin nudge + rotate). */
  function resolveCarouselSpeakerSeamOverlapPx(rect, panelW = PANEL_W) {
    if (!rect) return 0;
    const x = Number(rect.x);
    const y = Number(rect.y);
    const w = Number(rect.width);
    const h = Number(rect.height);
    const angle = Number(rect.angle || 0);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return 0;
    let maxX = x + w;
    if (angle) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const hw = w / 2;
      const hh = h / 2;
      maxX = Math.max(
        ...[
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh]
        ].map(([px, py]) => cx + px * cos - py * sin)
      );
    }
    return Math.max(0, Math.round(maxX - panelW));
  }

  function resolveCarouselSpeakerSeamSlide2ClipBounds(rect, panelW = PANEL_W, panelH = MASTER_H) {
    const overlapPx = resolveCarouselSpeakerSeamOverlapPx(rect, panelW);
    if (overlapPx <= 0) return null;
    const x = Number(rect.x);
    const y = Number(rect.y);
    const w = Number(rect.width);
    const h = Number(rect.height);
    const angle = Number(rect.angle || 0);
    if (!angle) {
      return { x: 0, y, width: overlapPx, height: h };
    }
    const slide2X = x - panelW;
    const cx = slide2X + w / 2;
    const cy = y + h / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = w / 2;
    const hh = h / 2;
    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh]
    ].map(([px, py]) => ({
      x: cx + px * cos - py * sin,
      y: cy + px * sin + py * cos
    }));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const pad = 4;
    return {
      x: 0,
      y: Math.max(0, Math.floor(minY - pad)),
      width: overlapPx,
      height: Math.min(panelH, Math.ceil(maxY - minY + pad * 2))
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
      composedSpeakerRect &&
      Number.isFinite(Number(composedSpeakerRect.width)) &&
      Number(composedSpeakerRect.width) > 0;
    const skipSlide1Redraw = skipSlide1SpeakerDraw || useComposedRect;
    const rect = useComposedRect
      ? (() => {
          const r = composedSpeakerRect;
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
              : Math.round(Number(r.height))
          };
        })()
      : resolveCarouselSpeakerSeamRect(PANEL_W, MASTER_H, speakerImg, overlapFraction, {
          shortQuote
        });
    /**
     * Bleed amount MUST be the rect's actual overhang past the slide-1 canvas edge, not a fixed
     * fraction of width — an admin nudge/scale preset can reposition `rect` so it barely (or doesn't)
     * cross the seam, and a fraction-of-width bleed would then redraw already-visible face content
     * at the wrong offset, folding the portrait back on itself (looks like a mirrored double image).
     */
    const overlapPx = resolveCarouselSpeakerSeamOverlapPx(rect, PANEL_W);
    const slide2Clip = resolveCarouselSpeakerSeamSlide2ClipBounds(rect, PANEL_W, MASTER_H);
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
    if (!skipSlide1Redraw) {
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
    /** Exact continuation: shift left by one full panel so content picks up right where slide 1's canvas edge cut it off. */
    const slide2SpeakerRect = {
      x: rect.x - PANEL_W,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      angle: rect.angle || 0
    };
    let drawnSeam = true;
    if (slide2Clip && overlapPx > 0) {
      ctx2.save();
      ctx2.beginPath();
      ctx2.rect(slide2Clip.x, slide2Clip.y, slide2Clip.width, slide2Clip.height);
      ctx2.clip();
      drawnSeam = SCR.drawSpeakerCutoutStack(ctx2, speakerImg, slide2SpeakerRect, speakerDrawOpts);
      ctx2.restore();
    }
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
        overlapFraction: rect.width > 0 ? overlapPx / rect.width : 0,
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
    resolveCarouselSpeakerSeamOverlapPx,
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
