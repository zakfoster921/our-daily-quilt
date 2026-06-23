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

  function drawRightJustifiedQuilt(ctx, quiltImg, panelX, panelW, panelH) {
    const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    const innerW = panelW - QUILT_PAD * 2;
    const innerH = panelH - QUILT_PAD * 2;
    const scale = Math.min(innerW / iw, innerH / ih);
    const dw = Math.round(iw * scale);
    const dh = Math.round(ih * scale);
    const dx = panelX + panelW - QUILT_PAD - dw;
    const dy = QUILT_PAD + Math.round((innerH - dh) / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(panelX, 0, panelW, panelH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(quiltImg, 0, 0, iw, ih, dx, dy, dw, dh);
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

    const dateKey = String(options.dateKey || '').trim() || 'our-daily';
    const seamOverlapPx =
      Number(options.seamOverlapPx) > 0 ? Math.round(Number(options.seamOverlapPx)) : SEAM_OVERLAP_PX;
    const clippingWidth =
      Number(options.clippingWidth) > 0
        ? Math.round(Number(options.clippingWidth))
        : CLIPPING_TARGET_WIDTH;

    const clippingResult = await composeClipping({
      names,
      dateKey,
      width: clippingWidth,
      paperTextureUrl: options.paperTextureUrl
    });
    const clippingDataUrl =
      typeof clippingResult === 'string' ? clippingResult : clippingResult?.dataUrl || null;
    if (!clippingDataUrl) return null;

    const [quiltImg, clippingImg] = await Promise.all([
      loadImageFromBlob(quiltBlob),
      loadImageFromDataUrl(clippingDataUrl)
    ]);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = MASTER_W;
    canvas.height = MASTER_H;
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, MASTER_W, MASTER_H);

    drawRightJustifiedQuilt(ctx, quiltImg, PANEL_W, PANEL_W, MASTER_H);

    const clipW = Math.max(1, clippingImg.naturalWidth || clippingImg.width);
    const clipH = Math.max(1, clippingImg.naturalHeight || clippingImg.height);
    const clipRightX = PANEL_W + seamOverlapPx;
    const clipX = Math.round(clipRightX - clipW);
    const clipY = Math.round((MASTER_H - clipH) / 2);
    ctx.drawImage(clippingImg, clipX, clipY, clipW, clipH);

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
        clippingX: clipX,
        clippingY: clipY,
        nameCount: names.length,
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
    SEAM_OVERLAP_PX
  };
});
