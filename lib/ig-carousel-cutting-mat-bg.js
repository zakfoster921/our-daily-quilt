/**
 * Shared green cutting-mat panorama for IG carousel slides 1–4.
 * Crops four side-by-side 4:5 rectangles (not narrow quarters) and height-fits
 * so grid squares stay proportional when scaled to the panel.
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
    const CAROUSEL_MAT_SLIDE_COUNT = 4;

    /** ~6px minor grid in ig-green-cutting-mat-wide source photos. */
    const MAT_SOURCE_GRID_PX = 6;

    const CAROUSEL_MAT_PAN = {
      SLIDE_1: 0,
      SLIDE_2: PANEL_W,
      SLIDE_3: PANEL_W * 2,
      SLIDE_4: PANEL_W * 3
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

    function snapMatGridPx(value, gridPx = MAT_SOURCE_GRID_PX) {
      const g = Math.max(1, Math.round(Number(gridPx) || MAT_SOURCE_GRID_PX));
      return Math.round(Number(value) / g) * g;
    }

    /**
     * One 4:5 panel-sized crop, panned horizontally across the wide mat source.
     * Four slides = four overlapping rectangles (~540×679 from 1024-wide), not 256px quarters.
     */
    function resolveCarouselMatSourceSlice(iw, ih, sliceIndex, panelW = PANEL_W, panelH = PANEL_H) {
      const cropH = ih;
      const cropW = snapMatGridPx(Math.min(iw, Math.round(cropH * (panelW / panelH))));
      const maxStart = Math.max(0, iw - cropW);
      const n = CAROUSEL_MAT_SLIDE_COUNT;
      let sx = n <= 1 ? 0 : Math.round((maxStart * sliceIndex) / (n - 1));
      sx = Math.min(snapMatGridPx(sx), maxStart);
      return {
        sx,
        sy: 0,
        sw: Math.max(1, cropW),
        sh: Math.max(1, cropH)
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
     * Draw one carousel mat panel — uniform height-fit (square grid), 4:5 source crop.
     */
    function drawCarouselCuttingMatBackground(ctx, matImg, panelW, panelH, panX = 0) {
      if (!matImg) {
        drawProceduralCuttingMat(ctx, panelW, panelH, panX);
        return;
      }

      const iw = Math.max(1, matImg.naturalWidth || matImg.width);
      const ih = Math.max(1, matImg.naturalHeight || matImg.height);
      const sliceIndex = resolveCarouselMatSliceIndex(panX, panelW);
      const { sx, sy, sw, sh } = resolveCarouselMatSourceSlice(iw, ih, sliceIndex, panelW, panelH);

      const scale = panelH / sh;
      const destW = sw * scale;
      const destH = panelH;
      const destX = (panelW - destW) / 2;
      const destY = 0;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(matImg, sx, sy, sw, sh, destX, destY, destW, destH);
    }

    return {
      PANEL_W,
      PANEL_H,
      CAROUSEL_MAT_SLIDE_COUNT,
      MAT_SOURCE_GRID_PX,
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
