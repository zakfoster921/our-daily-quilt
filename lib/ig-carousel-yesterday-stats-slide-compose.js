/**
 * IG carousel slide 2: cutting-mat collage + chunky quilt frame + yesterday-stats card.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IgCarouselYesterdayStatsSlideCompose = api;
    root.composeCarouselYesterdayStatsSlideFromQuiltBlob = api.composeCarouselYesterdayStatsSlideFromQuiltBlob;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
  function (global) {
    'use strict';

    const PANEL_W = 1080;
    const PANEL_H = 1350;
    const CARD_LAYER_MARGIN_X = 16;
    const CARD_LAYER_WIDTH_RATIO = 0.88;
    const CARD_LAYER_HEIGHT_RATIO = 0.42;
    const CHUNKY_FRAME_PAD_X = 54;
    const CHUNKY_FRAME_PAD_Y = 46;
    const CLUSTER_TILT_DEG = -7.5;
    const CUTTING_MAT_ASSETS = [
      'assets/ig-green-cutting-mat.jpg',
      'assets/ig-green-cutting-mat.webp',
      'assets/ig-green-cutting-mat.png'
    ];

    let cuttingMatImagePromise = null;

    function hashSeed(str) {
      const Utils = global.Utils || globalThis.Utils;
      if (Utils?.hashStringToUint) return Utils.hashStringToUint(String(str)) >>> 0;
      let h = 2166136261;
      const s = String(str || '');
      for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    function createSeededRng(seedStr) {
      let state = hashSeed(seedStr) || 1;
      return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function loadImageFromBlob(blob) {
      const url = URL.createObjectURL(blob);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Could not decode image'));
        };
        img.src = url;
      });
    }

    function loadImageFromUrl(url) {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }

    async function loadCuttingMatImage() {
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

    function canvasToBlob(canvas) {
      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob || null), 'image/png', 0.95);
      });
    }

    function drawProceduralCuttingMat(ctx, panelW, panelH) {
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
      for (let x = 0; x <= panelW; x += minor) {
        ctx.globalAlpha = x % major === 0 ? 0.22 : 0.1;
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

      const rng = createSeededRng('cutting-mat-wear');
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      for (let i = 0; i < 140; i += 1) {
        const x = rng() * panelW;
        const y = rng() * panelH;
        const r = 1 + rng() * 3.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawCuttingMatBackground(ctx, matImg, panelW, panelH) {
      if (matImg) {
        const iw = Math.max(1, matImg.naturalWidth || matImg.width);
        const ih = Math.max(1, matImg.naturalHeight || matImg.height);
        const scale = Math.max(panelW / iw, panelH / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.drawImage(matImg, (panelW - dw) / 2, (panelH - dh) / 2, dw, dh);
        return;
      }
      drawProceduralCuttingMat(ctx, panelW, panelH);
    }

    function resolveCardsLayerScale(cardsLayer, panelW, panelH) {
      const { canvas, logicalWidth, logicalHeight } = cardsLayer;
      if (!canvas || !logicalWidth || !logicalHeight) return null;

      const maxW = Math.min(panelW - CARD_LAYER_MARGIN_X * 2, panelW * CARD_LAYER_WIDTH_RATIO);
      const maxH = Math.round(panelH * CARD_LAYER_HEIGHT_RATIO);
      const scale = Math.min(maxW / logicalWidth, maxH / logicalHeight);
      const drawW = logicalWidth * scale;
      const drawH = logicalHeight * scale;
      return { canvas, scale, drawW, drawH, logicalWidth, logicalHeight };
    }

    function drawMirroredQuiltCover(ctx, quiltImg, quiltRect, panelW, panelH) {
      const IgCompose = global.IgContributorCarouselCompose || globalThis.IgContributorCarouselCompose;
      const drawBg = IgCompose?.drawSharedQuiltBg;
      if (typeof drawBg === 'function') {
        drawBg(ctx, quiltImg, quiltRect, panelW, panelH, {
          flip: true,
          smoothingQuality: 'high'
        });
        return;
      }
      const iw = quiltRect.sourceWidth;
      const ih = quiltRect.sourceHeight;
      const scale = Math.max(panelW / iw, panelH / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (panelW - dw) / 2;
      const dy = (panelH - dh) / 2;
      ctx.save();
      ctx.translate(panelW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(quiltImg, 0, 0, iw, ih, dx, dy, dw, dh);
      ctx.restore();
    }

    function drawMirroredQuiltInRect(ctx, quiltImg, quiltRect, x, y, w, h) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.translate(x, y);
      drawMirroredQuiltCover(ctx, quiltImg, quiltRect, w, h);
      ctx.restore();
    }

    function drawQuiltScrap(ctx, quiltImg, quiltRect, points, panelW, panelH, rotateDeg = 0) {
      if (!points?.length) return;
      const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      ctx.save();
      if (rotateDeg) {
        ctx.translate(cx, cy);
        ctx.rotate((rotateDeg * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.clip();
      drawMirroredQuiltCover(ctx, quiltImg, quiltRect, panelW, panelH);
      ctx.restore();
    }

    function scrapPoly(rng, jitter, coords) {
      return coords.map(([x, jx, y, jy]) => ({ x: jitter(x, jx), y: jitter(y, jy) }));
    }

    function buildScrapLayouts(panelW, panelH, dateKey) {
      const rng = createSeededRng(`${dateKey}:yesterday-stats-scraps`);
      const jitter = (base, spread) => base + (rng() - 0.5) * spread;
      const rot = (base, spread) => base + (rng() - 0.5) * spread;

      return [
        {
          name: 'top-left-strip',
          rotateDeg: rot(-14, 10),
          points: scrapPoly(rng, jitter, [
            [52, 24, 118, 30],
            [118, 20, 92, 24],
            [132, 18, 286, 36],
            [64, 22, 312, 32]
          ])
        },
        {
          name: 'top-left-wedge',
          rotateDeg: rot(22, 16),
          points: scrapPoly(rng, jitter, [
            [168, 28, 148, 26],
            [248, 22, 132, 24],
            [214, 18, 198, 28],
            [142, 26, 214, 32]
          ])
        },
        {
          name: 'top-right-sliver',
          rotateDeg: rot(-8, 12),
          points: scrapPoly(rng, jitter, [
            [panelW * 0.72, 40, 96, 28],
            [panelW * 0.96, 20, 72, 22],
            [panelW * 0.93, 18, 148, 26],
            [panelW * 0.68, 36, 176, 30]
          ])
        },
        {
          name: 'top-right-corner',
          rotateDeg: rot(31, 14),
          points: scrapPoly(rng, jitter, [
            [panelW * 0.84, 26, 228, 22],
            [panelW * 0.98, 14, 248, 18],
            [panelW * 0.92, 20, 278, 24],
            [panelW * 0.78, 32, 262, 26]
          ])
        },
        {
          name: 'left-mid-chip',
          rotateDeg: rot(-26, 12),
          points: scrapPoly(rng, jitter, [
            [18, 18, panelH * 0.38, 44],
            [86, 16, panelH * 0.34, 38],
            [98, 14, panelH * 0.46, 42],
            [24, 20, panelH * 0.5, 40]
          ])
        },
        {
          name: 'right-mid-triangle',
          rotateDeg: rot(19, 14),
          points: scrapPoly(rng, jitter, [
            [panelW * 0.9, 28, panelH * 0.42, 50],
            [panelW * 0.98, 12, panelH * 0.48, 44],
            [panelW * 0.88, 24, panelH * 0.54, 48]
          ])
        },
        {
          name: 'bottom-left-chunk',
          rotateDeg: rot(12, 18),
          points: scrapPoly(rng, jitter, [
            [34, 32, panelH * 0.82, 36],
            [148, 28, panelH * 0.78, 32],
            [132, 24, panelH * 0.94, 28],
            [48, 30, panelH * 0.98, 24]
          ])
        },
        {
          name: 'bottom-left-sliver',
          rotateDeg: rot(-34, 10),
          points: scrapPoly(rng, jitter, [
            [196, 22, panelH * 0.88, 30],
            [286, 18, panelH * 0.84, 26],
            [268, 16, panelH * 0.92, 28]
          ])
        },
        {
          name: 'bottom-right-chunk',
          rotateDeg: rot(-6, 12),
          points: scrapPoly(rng, jitter, [
            [panelW * 0.74, 34, panelH * 0.78, 40],
            [panelW * 0.98, 16, panelH * 0.74, 34],
            [panelW * 0.94, 18, panelH * 0.94, 24],
            [panelW * 0.7, 38, panelH * 0.98, 20]
          ])
        },
        {
          name: 'bottom-right-tiny',
          rotateDeg: rot(41, 16),
          points: scrapPoly(rng, jitter, [
            [panelW * 0.58, 28, panelH * 0.9, 32],
            [panelW * 0.68, 22, panelH * 0.86, 28],
            [panelW * 0.62, 24, panelH * 0.96, 26]
          ])
        },
        {
          name: 'bottom-edge-strip',
          rotateDeg: rot(7, 8),
          points: scrapPoly(rng, jitter, [
            [panelW * 0.36, 36, panelH * 0.96, 22],
            [panelW * 0.58, 32, panelH * 0.92, 20],
            [panelW * 0.54, 30, panelH * 0.99, 18],
            [panelW * 0.32, 34, panelH * 0.99, 20]
          ])
        }
      ];
    }

    function drawCollageScraps(ctx, quiltImg, quiltRect, panelW, panelH, dateKey) {
      const scraps = buildScrapLayouts(panelW, panelH, dateKey);
      ctx.save();
      ctx.globalAlpha = 0.98;
      for (const scrap of scraps) {
        drawQuiltScrap(
          ctx,
          quiltImg,
          quiltRect,
          scrap.points,
          panelW,
          panelH,
          scrap.rotateDeg || 0
        );
      }
      ctx.restore();
      return scraps.map((s) => s.name);
    }

    function drawCenterCluster(ctx, cardsLayer, quiltImg, quiltRect, panelW, panelH) {
      const scaled = resolveCardsLayerScale(cardsLayer, panelW, panelH);
      if (!scaled) return null;

      const frameW = scaled.drawW + CHUNKY_FRAME_PAD_X * 2;
      const frameH = scaled.drawH + CHUNKY_FRAME_PAD_Y * 2;
      const centerX = panelW / 2;
      const centerY = panelH * 0.5;
      const tiltRad = (CLUSTER_TILT_DEG * Math.PI) / 180;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(tiltRad);

      const frameX = -frameW / 2;
      const frameY = -frameH / 2;
      const cardX = frameX + CHUNKY_FRAME_PAD_X;
      const cardY = frameY + CHUNKY_FRAME_PAD_Y;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 14;
      drawMirroredQuiltInRect(ctx, quiltImg, quiltRect, frameX, frameY, frameW, frameH);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.drawImage(scaled.canvas, cardX, cardY, scaled.drawW, scaled.drawH);

      ctx.restore();

      return {
        centerX,
        centerY,
        tiltDeg: CLUSTER_TILT_DEG,
        frameWidth: frameW,
        frameHeight: frameH,
        cardWidth: scaled.drawW,
        cardHeight: scaled.drawH,
        scale: scaled.scale,
        sourceLogicalWidth: scaled.logicalWidth,
        sourceLogicalHeight: scaled.logicalHeight
      };
    }

    async function composeCarouselYesterdayStatsSlideFromQuiltBlob(quiltBlob, options = {}) {
      const contributorCount = Math.max(1, Math.floor(Number(options.contributorCount) || 1));
      const dateKey = String(options.dateKey || 'our-daily').trim() || 'our-daily';
      if (!quiltBlob) return null;

      const app = global.app;
      if (typeof app?.rasterizeIgReflectionSlideCardsLayer !== 'function') {
        throw new Error('app.rasterizeIgReflectionSlideCardsLayer missing');
      }

      const IgCompose = global.IgContributorCarouselCompose || globalThis.IgContributorCarouselCompose;
      const resolveRect = IgCompose?.resolveSharedQuiltRect;
      if (typeof resolveRect !== 'function') {
        throw new Error('IgContributorCarouselCompose.resolveSharedQuiltRect missing');
      }

      const cardsPngBase64 = String(
        options.cardsPngBase64 || globalThis.__igYesterdayStatsPlaywrightCardsPng || ''
      ).trim();
      if (!cardsPngBase64) {
        throw new Error(
          'Yesterday stats cards PNG missing — capture via scripts/ig-reflection-playwright-capture.cjs'
        );
      }

      const [quiltImg, cardsLayer, cuttingMatImg] = await Promise.all([
        loadImageFromBlob(quiltBlob),
        app.rasterizeIgReflectionSlideCardsLayer({
          cardsPngBase64,
          logicalWidth: options.cardsLayerLogicalWidth,
          logicalHeight: options.cardsLayerLogicalHeight,
          deviceScaleFactor: options.cardsLayerDeviceScaleFactor
        }),
        loadCuttingMatImage()
      ]);
      const quiltRect = resolveRect(quiltImg, options);
      if (!quiltRect || !cardsLayer?.canvas) return null;

      const canvas = document.createElement('canvas');
      canvas.width = PANEL_W;
      canvas.height = PANEL_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      drawCuttingMatBackground(ctx, cuttingMatImg, PANEL_W, PANEL_H);
      const scrapNames = drawCollageScraps(ctx, quiltImg, quiltRect, PANEL_W, PANEL_H, dateKey);
      const clusterMeta = drawCenterCluster(ctx, cardsLayer, quiltImg, quiltRect, PANEL_W, PANEL_H);

      const blob = await canvasToBlob(canvas);
      if (!blob) return null;

      return {
        blob,
        meta: {
          panelWidth: PANEL_W,
          panelHeight: PANEL_H,
          carouselQuiltBgMode: 'cutting-mat-chunky-frame-collage',
          contributorCount,
          cuttingMatAsset: cuttingMatImg ? 'loaded' : 'procedural-fallback',
          collageScraps: scrapNames,
          cluster: clusterMeta,
          cardLayout: 'playwright-dom-screenshot'
        }
      };
    }

    return {
      composeCarouselYesterdayStatsSlideFromQuiltBlob,
      PANEL_W,
      PANEL_H,
      CUTTING_MAT_ASSETS
    };
  }
);
