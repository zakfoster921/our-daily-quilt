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
    const PAPER_TEXTURE_URL = 'assets/quilt-paper-card-texture.png';
    /** Shared collage tooth — scraps use this verbatim; cluster gets a small boost over cream card. */
    const COLLAGE_PAPER_TOOTH = {
      toothOpacity: 0.48,
      pngOpacity: 0.2,
      fleckIntensity: 0.38
    };
    const CLUSTER_PAPER_TOOTH_BOOST = 1.22;

    let cuttingMatImagePromise = null;
    let paperTextureImagePromise = null;

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

    async function loadPaperTextureImage() {
      if (paperTextureImagePromise) return paperTextureImagePromise;
      paperTextureImagePromise = loadImageFromUrl(PAPER_TEXTURE_URL);
      return paperTextureImagePromise;
    }

    function polygonBounds(points) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(0, maxX - minX),
        height: Math.max(0, maxY - minY)
      };
    }

    function drawPaperFlecksOnRect(ctx, w, h, seedStr, intensity = 0.28) {
      const rng = createSeededRng(`${seedStr}:paper-flecks`);
      const count = Math.max(18, Math.floor((w * h) / 2200));
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      for (let i = 0; i < count; i += 1) {
        const x = rng() * w;
        const y = rng() * h;
        if (rng() < 0.22) {
          ctx.globalAlpha = intensity * (0.45 + rng() * 0.55);
          ctx.strokeStyle = 'rgba(38, 32, 28, 0.62)';
          ctx.lineWidth = 0.25 + rng() * 0.55;
          ctx.beginPath();
          const x0 = x;
          const y0 = y;
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + (rng() - 0.5) * 10, y0 + (rng() - 0.5) * 10);
          ctx.stroke();
        } else {
          const r = 0.45 + rng() * 1.8;
          ctx.globalAlpha = intensity * (0.35 + rng() * 0.65);
          ctx.fillStyle = rng() < 0.2 ? 'rgba(34, 28, 24, 0.72)' : 'rgba(52, 44, 38, 0.48)';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    const paperToothTileCache = new Map();

    function buildPaperToothTile(seedStr) {
      const key = String(seedStr || 'paper-tooth');
      if (paperToothTileCache.has(key)) return paperToothTileCache.get(key);
      const rng = createSeededRng(key);
      const sz = 128;
      const tile = document.createElement('canvas');
      tile.width = sz;
      tile.height = sz;
      const tx = tile.getContext('2d');
      if (!tx) return tile;
      const img = tx.createImageData(sz, sz);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const grain = (rng() - 0.5) * 72;
        const speck = rng() < 0.11 ? (rng() - 0.5) * 52 : 0;
        const lum = 228 + grain * 0.98 + speck * 0.9;
        d[i] = Math.max(158, Math.min(255, lum + 7));
        d[i + 1] = Math.max(160, Math.min(255, lum + 2));
        d[i + 2] = Math.max(146, Math.min(242, lum - 12));
        d[i + 3] = 255;
      }
      tx.putImageData(img, 0, 0);
      tx.globalCompositeOperation = 'soft-light';
      for (let f = 0; f < 72; f += 1) {
        tx.globalAlpha = 0.12 + rng() * 0.28;
        tx.strokeStyle = 'rgba(52, 44, 38, 0.52)';
        tx.lineWidth = 0.45 + rng() * 1.2;
        tx.beginPath();
        const y0 = rng() * sz;
        tx.moveTo(-4, y0);
        tx.bezierCurveTo(
          sz * 0.33,
          y0 + (rng() - 0.5) * 11,
          sz * 0.66,
          y0 + (rng() - 0.5) * 11,
          sz + 4,
          y0 + (rng() - 0.5) * 9
        );
        tx.stroke();
      }
      tx.globalCompositeOperation = 'overlay';
      for (let k = 0; k < 48; k += 1) {
        tx.globalAlpha = 0.07 + rng() * 0.14;
        tx.fillStyle = 'rgba(72, 58, 48, 0.72)';
        tx.beginPath();
        tx.arc(rng() * sz, rng() * sz, 0.45 + rng() * 3.4, 0, Math.PI * 2);
        tx.fill();
      }
      tx.globalAlpha = 1;
      tx.globalCompositeOperation = 'source-over';
      paperToothTileCache.set(key, tile);
      return tile;
    }

    function drawPaperToothLayers(ctx, bounds, options = {}) {
      const pad = 8;
      const x = bounds.minX - pad;
      const y = bounds.minY - pad;
      const w = bounds.width + pad * 2;
      const h = bounds.height + pad * 2;
      const tooth = buildPaperToothTile(options.seed || 'paper-tooth');
      const paperImg = options.paperImg;

      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = Number(options.toothOpacity) || 0.52;
      const toothPattern = ctx.createPattern(tooth, 'repeat');
      if (toothPattern) {
        ctx.fillStyle = toothPattern;
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();

      if (paperImg?.naturalWidth || paperImg?.width) {
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = Number(options.pngOpacity) || 0.22;
        const pngPattern = ctx.createPattern(paperImg, 'repeat');
        if (pngPattern) {
          ctx.fillStyle = pngPattern;
          ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.translate(x, y);
      drawPaperFlecksOnRect(ctx, w, h, `${options.seed || 'paper'}:flecks`, options.fleckIntensity || 0.32);
      ctx.restore();
    }

    function drawPaperTextureInClip(ctx, points, paperImg, options = {}) {
      const bounds = polygonBounds(points);
      if (!bounds.width || !bounds.height) return;
      drawPaperToothLayers(ctx, bounds, {
        paperImg,
        seed: options.seed || 'paper-texture',
        toothOpacity: options.toothOpacity,
        pngOpacity: options.pngOpacity,
        fleckIntensity: options.fleckIntensity
      });
    }

    function collagePaperToothOptions(seed, { cluster = false } = {}) {
      const boost = cluster ? CLUSTER_PAPER_TOOTH_BOOST : 1;
      return {
        seed,
        toothOpacity: COLLAGE_PAPER_TOOTH.toothOpacity * boost,
        pngOpacity: COLLAGE_PAPER_TOOTH.pngOpacity * boost,
        fleckIntensity: COLLAGE_PAPER_TOOTH.fleckIntensity * boost
      };
    }

    /** One paper tooth layer over the full cluster (frame + card). */
    function drawClusterPaperTooth(ctx, frameX, frameY, frameW, frameH, paperImg, seed) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(frameX, frameY, frameW, frameH);
      ctx.clip();
      drawPaperToothLayers(
        ctx,
        { minX: frameX, minY: frameY, width: frameW, height: frameH },
        {
          paperImg,
          ...collagePaperToothOptions(`${seed}:cluster`, { cluster: true })
        }
      );
      ctx.restore();
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

    function tracePolygon(ctx, points, close = true) {
      if (!points?.length) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      if (close) ctx.closePath();
    }

    function rectToPoints(x, y, w, h) {
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h }
      ];
    }

    function withPolygonTransform(ctx, points, rotateDeg, drawFn) {
      const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      ctx.save();
      if (rotateDeg) {
        ctx.translate(cx, cy);
        ctx.rotate((rotateDeg * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      drawFn();
      ctx.restore();
    }

    function drawPaperLiftShadow(ctx, points, options = {}) {
      const offsetX = Number(options.offsetX) || 5;
      const offsetY = Number(options.offsetY) || 7;
      const blur = Number(options.blur) || 16;
      const alpha = Number(options.alpha) || 0.34;
      const secondaryAlpha = Number(options.secondaryAlpha) || 0.14;

      const shadowPoints = points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));

      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.01)';
      tracePolygon(ctx, shadowPoints);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${secondaryAlpha})`;
      tracePolygon(ctx, shadowPoints.map((p) => ({ x: p.x + 1.5, y: p.y + 2.5 })));
      ctx.fill();
      ctx.restore();
    }

    function drawPaperEdgeHighlights(ctx, points, options = {}) {
      const highlightColor = options.highlightColor || 'rgba(255, 255, 255, 0.28)';
      const highlightWidth = Number(options.highlightWidth) || 1.6;
      const shadowEdgeColor = options.shadowEdgeColor || 'rgba(0, 0, 0, 0.12)';
      const litThreshold = Number(options.litThreshold) || 0.38;

      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const litScore = -nx - ny;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (litScore > litThreshold) {
          ctx.strokeStyle = highlightColor;
          ctx.lineWidth = highlightWidth;
          ctx.shadowColor = 'rgba(255, 255, 255, 0.18)';
          ctx.shadowBlur = 3.5;
          ctx.globalAlpha = 0.85;
          ctx.stroke();
        } else if (litScore < -0.12) {
          ctx.strokeStyle = shadowEdgeColor;
          ctx.lineWidth = 1.1;
          ctx.globalAlpha = 0.7;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawPaperPieceWithDepth(ctx, points, rotateDeg, drawContent, depthOptions = {}) {
      withPolygonTransform(ctx, points, rotateDeg, () => {
        drawPaperLiftShadow(ctx, points, depthOptions);
        ctx.save();
        tracePolygon(ctx, points);
        ctx.clip();
        drawContent();
        const paperTexture = depthOptions.paperTexture;
        if (paperTexture) {
          drawPaperTextureInClip(ctx, points, paperTexture.img || null, paperTexture);
        }
        ctx.restore();
        drawPaperEdgeHighlights(ctx, points, depthOptions);
      });
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

    function drawQuiltScrap(
      ctx,
      quiltImg,
      quiltRect,
      points,
      panelW,
      panelH,
      rotateDeg = 0,
      depthScale = 1,
      paperTextureImg = null,
      scrapSeed = 'scrap'
    ) {
      if (!points?.length) return;
      drawPaperPieceWithDepth(
        ctx,
        points,
        rotateDeg,
        () => drawMirroredQuiltCover(ctx, quiltImg, quiltRect, panelW, panelH),
        {
          offsetX: 2.5 * depthScale,
          offsetY: 4 * depthScale,
          blur: 7 * depthScale,
          alpha: 0.17,
          secondaryAlpha: 0.06,
          highlightWidth: 1.4 * depthScale,
          shadowEdgeColor: 'rgba(0, 0, 0, 0.08)',
          paperTexture: {
            img: paperTextureImg,
            ...collagePaperToothOptions(scrapSeed)
          }
        }
      );
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
          name: 'bleed-bottom-left-slab',
          rotateDeg: rot(-12, 6),
          points: scrapPoly(rng, jitter, [
            [-160, 22, panelH * 0.64, 48],
            [248, 18, panelH * 0.58, 42],
            [198, 16, panelH * 1.12, 38],
            [-130, 20, panelH * 1.16, 44]
          ])
        },
        {
          name: 'bleed-top-right-slab',
          rotateDeg: rot(18, 7),
          points: scrapPoly(rng, jitter, [
            [panelW * 0.48, 26, -110, 38],
            [panelW * 1.18, 18, -82, 32],
            [panelW * 1.12, 20, panelH * 0.32, 36],
            [panelW * 0.42, 24, panelH * 0.24, 40]
          ])
        },
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

    function drawCollageScraps(ctx, quiltImg, quiltRect, panelW, panelH, dateKey, paperTextureImg) {
      const scraps = buildScrapLayouts(panelW, panelH, dateKey);
      ctx.save();
      ctx.globalAlpha = 0.98;
      for (const scrap of scraps) {
        const area = Math.abs(
          scrap.points.reduce((sum, p, i) => {
            const n = scrap.points[(i + 1) % scrap.points.length];
            return sum + (p.x * n.y - n.x * p.y);
          }, 0) * 0.5
        );
        const depthScale = area > 18000 ? 1.15 : area > 8000 ? 1 : 0.82;
        drawQuiltScrap(
          ctx,
          quiltImg,
          quiltRect,
          scrap.points,
          panelW,
          panelH,
          scrap.rotateDeg || 0,
          depthScale,
          paperTextureImg,
          `${dateKey}:${scrap.name}`
        );
      }
      ctx.restore();
      return scraps.map((s) => s.name);
    }

    function drawCenterCluster(ctx, cardsLayer, quiltImg, quiltRect, panelW, panelH, paperTextureImg, dateKey) {
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
      const framePoints = rectToPoints(frameX, frameY, frameW, frameH);

      drawPaperPieceWithDepth(
        ctx,
        framePoints,
        0,
        () => drawMirroredQuiltInRect(ctx, quiltImg, quiltRect, frameX, frameY, frameW, frameH),
        {
          offsetX: 6,
          offsetY: 10,
          blur: 22,
          alpha: 0.36,
          secondaryAlpha: 0.15,
          highlightWidth: 2,
          highlightColor: 'rgba(255, 255, 255, 0.26)',
          litThreshold: 0.42
        }
      );

      ctx.drawImage(scaled.canvas, cardX, cardY, scaled.drawW, scaled.drawH);

      drawClusterPaperTooth(
        ctx,
        frameX,
        frameY,
        frameW,
        frameH,
        paperTextureImg,
        dateKey || 'yesterday-stats'
      );

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

      const [quiltImg, cardsLayer, cuttingMatImg, paperTextureImg] = await Promise.all([
        loadImageFromBlob(quiltBlob),
        app.rasterizeIgReflectionSlideCardsLayer({
          cardsPngBase64,
          logicalWidth: options.cardsLayerLogicalWidth,
          logicalHeight: options.cardsLayerLogicalHeight,
          deviceScaleFactor: options.cardsLayerDeviceScaleFactor
        }),
        loadCuttingMatImage(),
        loadPaperTextureImage()
      ]);
      const quiltRect = resolveRect(quiltImg, options);
      if (!quiltRect || !cardsLayer?.canvas) return null;

      const canvas = document.createElement('canvas');
      canvas.width = PANEL_W;
      canvas.height = PANEL_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      drawCuttingMatBackground(ctx, cuttingMatImg, PANEL_W, PANEL_H);
      const scrapNames = drawCollageScraps(
        ctx,
        quiltImg,
        quiltRect,
        PANEL_W,
        PANEL_H,
        dateKey,
        paperTextureImg
      );
      const clusterMeta = drawCenterCluster(
        ctx,
        cardsLayer,
        quiltImg,
        quiltRect,
        PANEL_W,
        PANEL_H,
        paperTextureImg,
        dateKey
      );

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
          paperTextureAsset: paperTextureImg ? 'loaded' : 'missing',
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
