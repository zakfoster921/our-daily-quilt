/**
 * Shared green cutting-mat panorama for IG carousel slides 2–4.
 * One scaled mat spans three panel widths; panX selects the slide slice.
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
     * Draw a continuous mat slice for carousel slides 2–4.
     * @param {CanvasRenderingContext2D} ctx
     * @param {HTMLImageElement|null} matImg
     * @param {number} panelW
     * @param {number} panelH
     * @param {number} panX — horizontal offset in panel pixels (0, 1080, 2160)
     */
    function drawCarouselCuttingMatBackground(ctx, matImg, panelW, panelH, panX = 0) {
      if (!matImg) {
        drawProceduralCuttingMat(ctx, panelW, panelH, panX);
        return;
      }

      const iw = Math.max(1, matImg.naturalWidth || matImg.width);
      const ih = Math.max(1, matImg.naturalHeight || matImg.height);
      const scale = panelH / ih;
      const tileW = iw * scale;
      const tileH = panelH;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const startTile = Math.floor(panX / tileW) - 1;
      const endTile = Math.ceil((panX + panelW) / tileW) + 1;
      for (let t = startTile; t <= endTile; t += 1) {
        const canvasX = t * tileW - panX;
        ctx.drawImage(matImg, 0, 0, iw, ih, canvasX, 0, tileW, tileH);
      }
    }

    return {
      PANEL_W,
      PANEL_H,
      CAROUSEL_MAT_SLIDE_COUNT,
      CAROUSEL_MAT_PAN,
      CUTTING_MAT_ASSETS,
      loadCarouselCuttingMatImage,
      drawCarouselCuttingMatBackground,
      drawProceduralCuttingMat
    };
  }
);
