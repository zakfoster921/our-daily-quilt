/**
 * Shared IG carousel quilt background — same cover-fill rect as layout B slide 1.
 * Browser: globalThis.CarouselQuiltBg
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CarouselQuiltBg = api;
    root.resolveLayoutBCarouselQuiltRect = api.resolveLayoutBCarouselQuiltRect;
    root.drawLayoutBCarouselQuiltBg = api.drawLayoutBCarouselQuiltBg;
    root.drawLayoutBCarouselQuiltBgFlipped = api.drawLayoutBCarouselQuiltBgFlipped;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function () {
  'use strict';

  const POST_QUILT_BLEED = 1.04;
  const QUILT_BG_ZOOM_MIN = 1.0;
  /** Inset around carousel slide 1 quilt so green mat peeks at the edges. */
  const CAROUSEL_SLIDE1_MAT_PEEK_PX = 36;

  function shrinkQuiltRectForMatPeek(rect, peekPx) {
    const pad = Math.max(0, Math.round(Number(peekPx) || 0));
    if (!pad || !rect?.width || !rect?.height) return rect;
    const maxPad = Math.floor(Math.min(rect.width, rect.height) * 0.1);
    const px = Math.min(pad, maxPad);
    if (px <= 0) return rect;
    return {
      x: Math.round(rect.x + px),
      y: Math.round(rect.y + px),
      width: Math.round(rect.width - px * 2),
      height: Math.round(rect.height - px * 2),
      sourceWidth: rect.sourceWidth,
      sourceHeight: rect.sourceHeight
    };
  }

  /**
   * Cover-fit quilt inside panel with a uniform mat border (carousel slide 1).
   */
  function resolveQuiltRectForPanelMatPeek(iw, ih, panelW, panelH, peekPx, options = {}) {
    const peek = Math.max(0, Math.round(Number(peekPx) || 0));
    const innerW = Math.max(1, panelW - peek * 2);
    const innerH = Math.max(1, panelH - peek * 2);
    const quiltBgZoom =
      Number(options.quiltBgZoom) > 0 ? Number(options.quiltBgZoom) : QUILT_BG_ZOOM_MIN;
    const layoutBQuiltBleed =
      Number(options.layoutBQuiltBleed) > 0
        ? Number(options.layoutBQuiltBleed) * quiltBgZoom
        : POST_QUILT_BLEED * quiltBgZoom;
    const inner = getAspectSafeCanvasRect(iw, ih, innerW, innerH, 'cover');
    let dw = Math.round(inner.width * layoutBQuiltBleed);
    let dh = Math.round(inner.height * layoutBQuiltBleed);
    let dx = Math.round(peek + inner.x - (dw - inner.width) / 2);
    let dy = Math.round(peek + inner.y - (dh - inner.height) / 2);
    const maxW = panelW - peek * 2;
    const maxH = panelH - peek * 2;
    if (dw > maxW || dh > maxH) {
      const scale = Math.min(maxW / dw, maxH / dh);
      dw = Math.round(dw * scale);
      dh = Math.round(dh * scale);
      dx = Math.round((panelW - dw) / 2);
      dy = Math.round((panelH - dh) / 2);
    }
    const quiltBgOffsetY = Number(options.quiltBgOffsetY);
    if (Number.isFinite(quiltBgOffsetY) && Math.abs(quiltBgOffsetY) > 0.0005) {
      dy = Math.round(dy + quiltBgOffsetY * panelH);
    }
    return {
      x: dx,
      y: dy,
      width: dw,
      height: dh,
      sourceWidth: iw,
      sourceHeight: ih
    };
  }

  function getAspectSafeCanvasRect(sourceW, sourceH, targetW, targetH, fit = 'contain') {
    const sw = Math.max(1, Number(sourceW) || 1);
    const sh = Math.max(1, Number(sourceH) || 1);
    const tw = Math.max(1, Number(targetW) || 1);
    const th = Math.max(1, Number(targetH) || 1);
    const scale =
      fit === 'cover' ? Math.max(tw / sw, th / sh) : Math.min(tw / sw, th / sh);
    const width = Math.round(sw * scale);
    const height = Math.round(sh * scale);
    return {
      x: Math.round((tw - width) / 2),
      y: Math.round((th - height) / 2),
      width,
      height
    };
  }

  function applyQuiltBgZoomToRect(x, y, w, h, quiltBgZoom) {
    const zoom = Number(quiltBgZoom) > 0 ? Number(quiltBgZoom) : QUILT_BG_ZOOM_MIN;
    if (zoom <= QUILT_BG_ZOOM_MIN + 0.0005) {
      return { x, y, width: w, height: h };
    }
    const width = Math.round(w * zoom);
    const height = Math.round(h * zoom);
    return {
      x: Math.round(x - (width - w) / 2),
      y: Math.round(y - (height - h) / 2),
      width,
      height
    };
  }

  function withTinyEdgeOverfill(rect, panelW, panelH, pad = 2) {
    let x = Math.round(Number(rect?.x) || 0);
    let y = Math.round(Number(rect?.y) || 0);
    let width = Math.round(Number(rect?.width) || 0);
    let height = Math.round(Number(rect?.height) || 0);
    if (width <= 0 || height <= 0) return { x, y, width, height };

    const right = x + width;
    const bottom = y + height;
    if (x > -pad && x < pad) {
      width += x + pad;
      x = -pad;
    }
    if (y > -pad && y < pad) {
      height += y + pad;
      y = -pad;
    }
    if (right > panelW - pad && right < panelW + pad) {
      width = panelW + pad - x;
    }
    if (bottom > panelH - pad && bottom < panelH + pad) {
      height = panelH + pad - y;
    }
    return { x, y, width, height };
  }

  /**
   * Match layout B 4:5 post quilt placement (carousel slide 1 default path).
   * @returns {{ rect: {x,y,width,height,sourceWidth,sourceHeight}, dedicationMessageY: number|null }}
   */
  function resolveLayoutBCarouselQuiltRect(quiltImg, panelW, panelH, options = {}) {
    const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    const quiltBgZoom =
      Number(options.quiltBgZoom) > 0 ? Number(options.quiltBgZoom) : QUILT_BG_ZOOM_MIN;
    const quiltFit = options.quiltFit;
    const dedicationBoxHeight = Math.max(0, Number(options.dedicationBoxHeight) || 0);
    const layoutBQuiltBleed =
      Number(options.layoutBQuiltBleed) > 0
        ? Number(options.layoutBQuiltBleed) * quiltBgZoom
        : POST_QUILT_BLEED * quiltBgZoom;

    const quiltBgOffsetY = Number(options.quiltBgOffsetY);

    let dx;
    let dy;
    let dw;
    let dh;
    let dedicationMessageY = null;

    if (dedicationBoxHeight > 0) {
      const marginX = 58;
      const marginTop = 46;
      const marginBottom = 46;
      const messageGap = 34;
      const maxQuiltW = panelW - marginX * 2;
      const maxQuiltH = panelH - marginTop - marginBottom - messageGap - dedicationBoxHeight;
      const postScale = Math.min(maxQuiltW / iw, maxQuiltH / ih) * 0.985;
      dw = Math.round(iw * postScale);
      dh = Math.round(ih * postScale);
      dx = Math.round((panelW - dw) / 2);
      dy = Math.round(marginTop + Math.max(0, (maxQuiltH - dh) / 2));
      ({ x: dx, y: dy, width: dw, height: dh } = applyQuiltBgZoomToRect(dx, dy, dw, dh, quiltBgZoom));
      dedicationMessageY = Math.round(dy + dh + messageGap);
    } else if (quiltFit === 'contain') {
      const marginX = 58;
      const marginY = 46;
      const maxQuiltW = panelW - marginX * 2;
      const maxQuiltH = panelH - marginY * 2;
      const postScale = Math.min(maxQuiltW / iw, maxQuiltH / ih);
      dw = Math.round(iw * postScale);
      dh = Math.round(ih * postScale);
      dx = Math.round((panelW - dw) / 2);
      dy = Math.round((panelH - dh) / 2);
      ({ x: dx, y: dy, width: dw, height: dh } = applyQuiltBgZoomToRect(dx, dy, dw, dh, quiltBgZoom));
    } else if (quiltFit === 'cover') {
      const rect = getAspectSafeCanvasRect(iw, ih, panelW, panelH, 'cover');
      dw = Math.round(rect.width * layoutBQuiltBleed);
      dh = Math.round(rect.height * layoutBQuiltBleed);
      dx = Math.round(rect.x - (dw - rect.width) / 2);
      dy = Math.round(rect.y - (dh - rect.height) / 2);
    } else {
      const postScale = Math.max(panelW / iw, panelH / ih) * POST_QUILT_BLEED * quiltBgZoom;
      dw = Math.round(iw * postScale);
      dh = Math.round(ih * postScale);
      dx = Math.round((panelW - dw) / 2);
      dy = Math.round((panelH - dh) / 2);
    }

    if (Number.isFinite(quiltBgOffsetY) && Math.abs(quiltBgOffsetY) > 0.0005) {
      dy = Math.round(dy + quiltBgOffsetY * panelH);
      if (dedicationMessageY != null) {
        dedicationMessageY = Math.round(dedicationMessageY + quiltBgOffsetY * panelH);
      }
    }

    const rect = {
      x: dx,
      y: dy,
      width: dw,
      height: dh,
      sourceWidth: iw,
      sourceHeight: ih
    };
    return { rect, dedicationMessageY };
  }

  function drawGreenCuttingMatUnderQuilt(ctx, panelW, panelH, options = {}) {
    const MatBg = globalThis.CarouselCuttingMatBg;
    const panX = Number(options.matPanX) || 0;
    const matImg = options.cuttingMatImg || null;
    if (MatBg?.drawCarouselCuttingMatBackground) {
      MatBg.drawCarouselCuttingMatBackground(ctx, matImg, panelW, panelH, panX);
      return;
    }
    if (MatBg?.drawProceduralCuttingMat) {
      MatBg.drawProceduralCuttingMat(ctx, panelW, panelH, panX);
      return;
    }
    ctx.fillStyle = '#174830';
    ctx.fillRect(0, 0, panelW, panelH);
  }

  function drawLayoutBCarouselQuiltBg(ctx, quiltImg, rect, panelW, panelH, options = {}) {
    const matPeek = Math.max(0, Number(options.quiltMatPeekPx) || 0);
    const matClip =
      options.greenCuttingMatUnderQuilt &&
      matPeek > 0 &&
      panelW > matPeek * 2 &&
      panelH > matPeek * 2;
    const PaperDepth = globalThis.IgCarouselPaperDepth;
    const usePaperFrame =
      matClip && PaperDepth?.drawPaperPieceWithDepth && PaperDepth?.rectToPoints;

    if (options.greenCuttingMatUnderQuilt) {
      drawGreenCuttingMatUnderQuilt(ctx, panelW, panelH, options);
    } else {
      ctx.fillStyle = options.matteFill || '#ffffff';
      ctx.fillRect(0, 0, panelW, panelH);
    }

    if (usePaperFrame) {
      const frameX = matPeek;
      const frameY = matPeek;
      const frameW = panelW - matPeek * 2;
      const frameH = panelH - matPeek * 2;
      const framePoints = PaperDepth.rectToPoints(frameX, frameY, frameW, frameH);
      const depthOpts =
        typeof PaperDepth.frameClusterDepthOptions === 'function'
          ? PaperDepth.frameClusterDepthOptions()
          : {};
      PaperDepth.drawPaperPieceWithDepth(
        ctx,
        framePoints,
        0,
        () => {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = options.smoothingQuality || 'high';
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
        },
        depthOpts
      );
      if (options.paperTextureImg && PaperDepth.drawClusterPaperTooth) {
        const toothSeed = options.paperToothSeed || 'carousel-slide-1';
        const quiltTooth =
          typeof PaperDepth.quiltFramePaperToothOptions === 'function'
            ? PaperDepth.quiltFramePaperToothOptions(toothSeed)
            : null;
        PaperDepth.drawClusterPaperTooth(
          ctx,
          frameX,
          frameY,
          frameW,
          frameH,
          options.paperTextureImg,
          toothSeed,
          quiltTooth
        );
      }
      return;
    }

    const drawRect =
      options.greenCuttingMatUnderQuilt || matPeek > 0
        ? rect
        : withTinyEdgeOverfill(rect, panelW, panelH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = options.smoothingQuality || 'high';
    if (matClip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(matPeek, matPeek, panelW - matPeek * 2, panelH - matPeek * 2);
      ctx.clip();
    }
    ctx.drawImage(
      quiltImg,
      0,
      0,
      rect.sourceWidth,
      rect.sourceHeight,
      drawRect.x,
      drawRect.y,
      drawRect.width,
      drawRect.height
    );
    if (matClip) {
      ctx.restore();
    }
  }

  /** Horizontal flip of layout-B quilt bg (carousel slide 3 contributor panel). */
  function drawLayoutBCarouselQuiltBgFlipped(ctx, quiltImg, rect, panelW, panelH, options = {}) {
    const drawRect = withTinyEdgeOverfill(rect, panelW, panelH);
    ctx.fillStyle = options.matteFill || '#ffffff';
    ctx.fillRect(0, 0, panelW, panelH);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = options.smoothingQuality || 'high';
    ctx.translate(panelW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      quiltImg,
      0,
      0,
      rect.sourceWidth,
      rect.sourceHeight,
      drawRect.x,
      drawRect.y,
      drawRect.width,
      drawRect.height
    );
    ctx.restore();
  }

  return {
    POST_QUILT_BLEED,
    CAROUSEL_SLIDE1_MAT_PEEK_PX,
    shrinkQuiltRectForMatPeek,
    resolveQuiltRectForPanelMatPeek,
    resolveLayoutBCarouselQuiltRect,
    drawLayoutBCarouselQuiltBg,
    drawLayoutBCarouselQuiltBgFlipped,
    drawGreenCuttingMatUnderQuilt
  };
});
