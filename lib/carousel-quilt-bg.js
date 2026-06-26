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
      const postScale = (panelW / iw) * POST_QUILT_BLEED * quiltBgZoom;
      dw = Math.round(iw * postScale);
      dh = Math.round(ih * postScale);
      dx = Math.round((panelW - dw) / 2);
      dy = Math.round((panelH - dh) / 2);
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

  function drawLayoutBCarouselQuiltBg(ctx, quiltImg, rect, panelW, panelH, options = {}) {
    ctx.fillStyle = options.matteFill || '#ffffff';
    ctx.fillRect(0, 0, panelW, panelH);
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
  }

  /** Horizontal flip of slide-1 quilt bg (carousel slide 2). */
  function drawLayoutBCarouselQuiltBgFlipped(ctx, quiltImg, rect, panelW, panelH, options = {}) {
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
      rect.x,
      rect.y,
      rect.width,
      rect.height
    );
    ctx.restore();
  }

  return {
    POST_QUILT_BLEED,
    resolveLayoutBCarouselQuiltRect,
    drawLayoutBCarouselQuiltBg,
    drawLayoutBCarouselQuiltBgFlipped
  };
});
