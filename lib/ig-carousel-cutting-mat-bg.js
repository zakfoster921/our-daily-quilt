/**
 * Shared green cutting-mat panorama for IG carousel slides 2–4.
 * Crops three contiguous columns from ig-green-cutting-mat-wide (no repeat tiling).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CarouselCuttingMatBg = api;
    root.drawCarouselCuttingMatBackground = api.drawCarouselCuttingMatBackground;
    root.loadCarouselCuttingMatImage = api.loadCarouselCuttingMatImage;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
  function () {
    'use strict';

    const PANEL_W = 1080;
    const PANEL_H = 1350;
    const CAROUSEL_MAT_SLIDE_COUNT = 3;

    /**
     * Source-image column boundaries as fractions of width [0..1].
     * Three slides = two internal cuts; grid on ig-green-cutting-mat-wide aligns at ~⅓ marks.
     */
    const CAROUSEL_MAT_SLICE_X_FRACS = [0, 1 / 3, 2 / 3, 1];

    const CAROUSEL_MAT_PAN = {
      SLIDE_2: 0,
      SLIDE_3: PANEL_W,
      SLIDE_4: PANEL_W * 2
    };

    const CUTTING_MAT_ASSETS = [
      'assets/ig-green-cutting-mat-wide.png',
      'assets/ig-green-cutting-mat.jpg',
      'assets/ig-green-cutting-mat.webp',
      'assets/ig-green-cutting-mat.png'
    ];

    let cuttingMatImagePromise = null;

    function loadImageFromUrl(url) {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }

    async function loadCarouselCuttingMatImage() {
      if (cuttingMatImagePromise) return cuttingMatImagePromise;
      cuttingMatImagePromise = (async () => {
        for (const path of CUTTING_MAT_ASSETS) {
          const img = await loadImageFromUrl(path);
          if (img) return img;
        }
        return null;
      })();
      return cuttingMatImagePromise;
    }

    function resolveCarouselMatSliceIndex(panX, panelW = PANEL_W) {
      return Math.min(
        CAROUSEL_MAT_SLIDE_COUNT - 1,
        Math.max(0, Math.round(Number(panX) / panelW))
      );
    }

    function resolveCarouselMatSourceSlice(iw, ih, sliceIndex, sliceXFracs = CAROUSEL_MAT_SLICE_X_FRACS) {
      const fracs = Array.isArray(sliceXFracs) && sliceXFracs.length >= 2 ? sliceXFracs : [0, 1];
      const leftFrac = fracs[sliceIndex] ?? 0;
      const rightFrac = fracs[sliceIndex + 1] ?? 1;
      const sx = Math.max(0, Math.floor(leftFrac * iw));
      const ex = Math.min(iw, Math.ceil(rightFrac * iw));
      return {
        sx,
        sy: 0,
        sw: Math.max(1, ex - sx),
        sh: ih
      };
    }

    function drawProceduralCuttingMat(ctx, panelW, panelH, panX = 0) {
      const grad = ctx.createLinearGradient(0, 0, panelW, panelH);
      grad.addColorStop(0, '#1b5238');
      grad.addColorStop(0.45, '#174830');
      grad.addColorStop(1, '#123c28');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, panelW, panelH);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
      ctx.lineWidth = 1;
      const minor = 24;
      const major = 120;
      const panMod = ((panX % major) + major) % major;
      for (let x = -panMod; x <= panelW + minor; x += minor) {
        const worldX = panX + x;
        ctx.globalAlpha = worldX % major === 0 ? 0.22 : 0.1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, panelH);
        ctx.stroke();
      }
      for (let y = 0; y <= panelH; y += minor) {
        ctx.globalAlpha = y % major === 0 ? 0.22 : 0.1;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(panelW, y + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /**
     * Draw one carousel mat column — uniform scale (square grid preserved), cover-crop to panel.
     * @param {CanvasRenderingContext2D} ctx
     * @param {HTMLImageElement|null} matImg
     * @param {number} panelW
     * @param {number} panelH
     * @param {number} panX — 0, 1080, or 2160
     */
    function drawCarouselCuttingMatBackground(ctx, matImg, panelW, panelH, panX = 0) {
      if (!matImg) {
        drawProceduralCuttingMat(ctx, panelW, panelH, panX);
        return;
      }

      const iw = Math.max(1, matImg.naturalWidth || matImg.width);
      const ih = Math.max(1, matImg.naturalHeight || matImg.height);
      const sliceIndex = resolveCarouselMatSliceIndex(panX, panelW);
      const { sx, sy, sw, sh } = resolveCarouselMatSourceSlice(iw, ih, sliceIndex);

      const scale = Math.max(panelW / sw, panelH / sh);
      const destW = sw * scale;
      const destH = sh * scale;
      const destX = (panelW - destW) / 2;
      const destY = (panelH - destH) / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(matImg, sx, sy, sw, sh, destX, destY, destW, destH);
    }

    return {
      PANEL_W,
      PANEL_H,
      CAROUSEL_MAT_SLIDE_COUNT,
      CAROUSEL_MAT_SLICE_X_FRACS,
      CAROUSEL_MAT_PAN,
      CUTTING_MAT_ASSETS,
      loadCarouselCuttingMatImage,
      drawCarouselCuttingMatBackground,
      drawProceduralCuttingMat,
      resolveCarouselMatSliceIndex,
      resolveCarouselMatSourceSlice
    };
  }
);
