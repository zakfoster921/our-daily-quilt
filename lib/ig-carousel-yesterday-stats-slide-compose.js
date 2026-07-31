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
    root.applyCarouselRightScrapSeamToReflectionSlide = api.applyCarouselRightScrapSeamToReflectionSlide;
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

    function computeQuiltPanLimits(quiltRect, panelW, panelH) {
      const left = Number(quiltRect?.x) || 0;
      const top = Number(quiltRect?.y) || 0;
      const right = left + (Number(quiltRect?.width) || panelW);
      const bottom = top + (Number(quiltRect?.height) || panelH);
      const minPanX = panelW - right;
      const maxPanX = -left;
      const minPanY = panelH - bottom;
      const maxPanY = -top;
      return {
        minPanX: Math.min(minPanX, maxPanX),
        maxPanX: Math.max(minPanX, maxPanX),
        minPanY: Math.min(minPanY, maxPanY),
        maxPanY: Math.max(minPanY, maxPanY)
      };
    }

    function drawMirroredQuiltCover(ctx, quiltImg, quiltRect, panelW, panelH, panX = 0, panY = 0) {
      const iw = Math.max(1, quiltRect.sourceWidth || quiltImg.naturalWidth || quiltImg.width);
      const ih = Math.max(1, quiltRect.sourceHeight || quiltImg.naturalHeight || quiltImg.height);
      const drawRect = {
        x: quiltRect.x,
        y: quiltRect.y,
        width: quiltRect.width,
        height: quiltRect.height
      };

      ctx.save();
      ctx.translate(panX, panY);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.save();
      ctx.translate(panelW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(quiltImg, 0, 0, iw, ih, drawRect.x, drawRect.y, drawRect.width, drawRect.height);
      ctx.restore();
      ctx.restore();
    }

    function resolveScrapQuiltPan(scrap, panelW, panelH, dateKey, quiltRect) {
      const limits = computeQuiltPanLimits(quiltRect, panelW, panelH);
      const rng = createSeededRng(`${dateKey}:${scrap.name}:quilt-pan`);
      const u = Number.isFinite(scrap.quiltSampleU) ? scrap.quiltSampleU : rng();
      const v = Number.isFinite(scrap.quiltSampleV) ? scrap.quiltSampleV : rng();
      return {
        panX: limits.minPanX + u * (limits.maxPanX - limits.minPanX),
        panY: limits.minPanY + v * (limits.maxPanY - limits.minPanY)
      };
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
      scrapSeed = 'scrap',
      quiltPan = { panX: 0, panY: 0 }
    ) {
      if (!points?.length) return;
      drawPaperPieceWithDepth(
        ctx,
        points,
        rotateDeg,
        () =>
          drawMirroredQuiltCover(
            ctx,
            quiltImg,
            quiltRect,
            panelW,
            panelH,
            quiltPan.panX,
            quiltPan.panY
          ),
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

    function computeClusterProtectedBounds(panelW, panelH, cardsLayer) {
      const scaled = resolveCardsLayerScale(cardsLayer, panelW, panelH);
      if (!scaled) return null;
      const frameW = scaled.drawW + CHUNKY_FRAME_PAD_X * 2;
      const frameH = scaled.drawH + CHUNKY_FRAME_PAD_Y * 2;
      const centerX = panelW / 2;
      const centerY = panelH * 0.5;
      const tiltRad = (CLUSTER_TILT_DEG * Math.PI) / 180;
      const cos = Math.abs(Math.cos(tiltRad));
      const sin = Math.abs(Math.sin(tiltRad));
      const aabbW = frameW * cos + frameH * sin;
      const aabbH = frameW * sin + frameH * cos;
      const pad = 20;
      return {
        minX: centerX - aabbW / 2 - pad,
        maxX: centerX + aabbW / 2 + pad,
        minY: centerY - aabbH / 2 - pad,
        maxY: centerY + aabbH / 2 + pad
      };
    }

    function polygonIntersectsRect(points, rect) {
      if (!rect || !points?.length) return false;
      const b = polygonBounds(points);
      return !(b.maxX < rect.minX || b.minX > rect.maxX || b.maxY < rect.minY || b.minY > rect.maxY);
    }

    function nudgeScrapAwayFromCluster(points, rect, rng, maxTries = 10) {
      let out = points;
      for (let t = 0; t < maxTries; t += 1) {
        if (!polygonIntersectsRect(out, rect)) return out;
        const b = polygonBounds(out);
        const cx = (b.minX + b.maxX) / 2;
        const cy = (b.minY + b.maxY) / 2;
        const rcx = (rect.minX + rect.maxX) / 2;
        const rcy = (rect.minY + rect.maxY) / 2;
        const dx = cx - rcx;
        const dy = cy - rcy;
        const len = Math.hypot(dx, dy) || 1;
        const push = 38 + rng() * 28;
        out = out.map((p) => ({
          x: p.x + (dx / len) * push,
          y: p.y + (dy / len) * push
        }));
      }
      return polygonIntersectsRect(out, rect) ? null : out;
    }

    function finalizeScrapPlacement(scrap, protectedBounds, rng, required) {
      if (!protectedBounds || !polygonIntersectsRect(scrap.points, protectedBounds)) {
        return scrap;
      }
      const nudged = nudgeScrapAwayFromCluster(scrap.points, protectedBounds, rng);
      if (nudged) {
        return { ...scrap, points: nudged };
      }
      if (required) {
        return { ...scrap, underCluster: true };
      }
      return null;
    }

    function scrapTouchesRightEdge(points, panelW) {
      return polygonBounds(points).maxX > panelW - 0.5;
    }

    function scrapRecordFromScrap(scrap) {
      return {
        name: scrap.name,
        points: scrap.points.map((p) => ({ x: p.x, y: p.y })),
        rotateDeg: scrap.rotateDeg || 0,
        quiltSampleU: scrap.quiltSampleU,
        quiltSampleV: scrap.quiltSampleV
      };
    }

    function loadImageFromDataUrl(dataUrl) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = String(dataUrl || '');
      });
    }
    function scrapPoly(rng, jitter, coords, panelW, panelH) {
      return coords.map(([x, jx, y, jy]) => {
        const px = typeof x === 'string' ? evalScrapCoord(x, panelW, panelH) : x;
        const py = typeof y === 'string' ? evalScrapCoord(y, panelW, panelH) : y;
        return { x: jitter(px, jx), y: jitter(py, jy) };
      });
    }

    function evalScrapCoord(expr, panelW, panelH) {
      const s = String(expr).trim();
      if (s.startsWith('panelW *')) {
        return panelW * parseFloat(s.slice('panelW *'.length));
      }
      if (s.startsWith('panelH *')) {
        return panelH * parseFloat(s.slice('panelH *'.length));
      }
      return Number(s) || 0;
    }

    function shuffleInPlace(list, rng) {
      for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }

    function transformScrapPoints(points, panelW, panelH, rng, dayLayout) {
      const { shiftX, shiftY, scale, cx, cy } = dayLayout;
      return points.map((p) => ({
        x: cx + (p.x - cx) * scale + shiftX + (rng() - 0.5) * 28,
        y: cy + (p.y - cy) * scale + shiftY + (rng() - 0.5) * 28
      }));
    }

    function buildScrapTemplate(name, opts, panelW, panelH, rng, jitter, rot, dayLayout) {
      const points = transformScrapPoints(
        scrapPoly(rng, jitter, opts.verts, panelW, panelH),
        panelW,
        panelH,
        rng,
        dayLayout
      );
      return {
        name,
        rotateDeg: rot(opts.rotate[0], opts.rotate[1]),
        quiltSampleU: opts.quiltSampleU,
        quiltSampleV: opts.quiltSampleV,
        points
      };
    }

    function buildScrapLayouts(panelW, panelH, dateKey, protectedBounds = null) {
      const rng = createSeededRng(`${dateKey}:yesterday-stats-scraps`);
      const placementRng = createSeededRng(`${dateKey}:yesterday-stats-scrap-placement`);
      const jitter = (base, spread) => base + (rng() - 0.5) * spread;
      const rot = (base, spread) => base + (rng() - 0.5) * spread;
      const dayLayout = {
        shiftX: (rng() - 0.5) * 96,
        shiftY: (rng() - 0.5) * 120,
        scale: 0.92 + rng() * 0.14,
        cx: panelW * 0.5,
        cy: panelH * 0.5
      };

      const templates = [
        {
          name: 'bleed-bottom-left-shard',
          required: true,
          quiltSampleU: 0.08 + rng() * 0.08,
          quiltSampleV: 0.84 + rng() * 0.12,
          rotate: [-24, 14],
          verts: [
            [-42, 16, 'panelH * 0.908', 28],
            [88, 14, 'panelH * 0.882', 26],
            [132, 12, 'panelH * 0.962', 24],
            [76, 14, 'panelH * 1.038', 26],
            [-34, 16, 'panelH * 0.948', 30]
          ]
        },
        {
          name: 'bleed-top-right-wedge',
          required: true,
          quiltSampleU: 0.84 + rng() * 0.12,
          quiltSampleV: 0.08 + rng() * 0.08,
          rotate: [31, 14],
          verts: [
            ['panelW * 0.928', 22, -38, 30],
            ['panelW * 1.048', 18, -24, 26],
            ['panelW * 1.018', 20, 'panelH * 0.082', 28],
            ['panelW * 0.892', 24, 'panelH * 0.058', 32]
          ]
        },
        {
          name: 'top-left-strip',
          required: false,
          rotate: [-14, 18],
          verts: [
            [52, 32, 118, 38],
            [118, 28, 92, 32],
            [132, 24, 286, 44],
            [64, 30, 312, 40]
          ]
        },
        {
          name: 'top-left-wedge',
          required: false,
          rotate: [22, 22],
          verts: [
            [168, 36, 148, 34],
            [248, 30, 132, 32],
            [214, 26, 198, 36],
            [142, 34, 214, 40]
          ]
        },
        {
          name: 'top-right-sliver',
          required: false,
          rotate: [-8, 18],
          verts: [
            ['panelW * 0.72', 48, 96, 36],
            ['panelW * 0.96', 28, 72, 30],
            ['panelW * 0.93', 24, 148, 34],
            ['panelW * 0.68', 44, 176, 38]
          ]
        },
        {
          name: 'top-right-corner',
          required: false,
          rotate: [31, 20],
          verts: [
            ['panelW * 0.84', 34, 228, 30],
            ['panelW * 0.98', 20, 248, 26],
            ['panelW * 0.92', 28, 278, 32],
            ['panelW * 0.78', 40, 262, 34]
          ]
        },
        {
          name: 'left-mid-chip',
          required: false,
          rotate: [-26, 18],
          verts: [
            [18, 26, 'panelH * 0.38', 52],
            [86, 22, 'panelH * 0.34', 46],
            [98, 20, 'panelH * 0.46', 50],
            [24, 28, 'panelH * 0.5', 48]
          ]
        },
        {
          name: 'right-mid-triangle',
          required: false,
          rotate: [19, 20],
          verts: [
            ['panelW * 0.9', 36, 'panelH * 0.42', 58],
            ['panelW * 0.98', 18, 'panelH * 0.48', 52],
            ['panelW * 0.88', 32, 'panelH * 0.54', 56]
          ]
        },
        {
          name: 'bottom-left-chunk',
          required: false,
          rotate: [12, 24],
          verts: [
            [34, 40, 'panelH * 0.82', 44],
            [148, 36, 'panelH * 0.78', 40],
            [132, 32, 'panelH * 0.94', 36],
            [48, 38, 'panelH * 0.98', 32]
          ]
        },
        {
          name: 'bottom-left-sliver',
          required: false,
          rotate: [-34, 16],
          verts: [
            [196, 30, 'panelH * 0.88', 38],
            [286, 26, 'panelH * 0.84', 34],
            [268, 22, 'panelH * 0.92', 36]
          ]
        },
        {
          name: 'bottom-right-chunk',
          required: false,
          rotate: [-6, 18],
          verts: [
            ['panelW * 0.74', 42, 'panelH * 0.78', 48],
            ['panelW * 0.98', 22, 'panelH * 0.74', 42],
            ['panelW * 0.94', 26, 'panelH * 0.94', 32],
            ['panelW * 0.7', 46, 'panelH * 0.98', 28]
          ]
        },
        {
          name: 'bottom-right-tiny',
          required: false,
          rotate: [41, 22],
          verts: [
            ['panelW * 0.58', 36, 'panelH * 0.9', 40],
            ['panelW * 0.68', 30, 'panelH * 0.86', 36],
            ['panelW * 0.62', 32, 'panelH * 0.96', 34]
          ]
        },
        {
          name: 'bottom-edge-strip',
          required: false,
          rotate: [7, 14],
          verts: [
            ['panelW * 0.36', 44, 'panelH * 0.96', 30],
            ['panelW * 0.58', 40, 'panelH * 0.92', 28],
            ['panelW * 0.54', 38, 'panelH * 0.99', 26],
            ['panelW * 0.32', 42, 'panelH * 0.99', 28]
          ]
        }
      ];

      const bleed = [];
      const loose = [];
      for (const tpl of templates) {
        if (!tpl.required && rng() <= 0.22) continue;
        let scrap = buildScrapTemplate(tpl.name, tpl, panelW, panelH, rng, jitter, rot, dayLayout);
        scrap = finalizeScrapPlacement(scrap, protectedBounds, placementRng, !!tpl.required);
        if (!scrap) continue;
        if (tpl.required || tpl.name.startsWith('bleed-')) {
          bleed.push(scrap);
        } else {
          loose.push(scrap);
        }
      }
      shuffleInPlace(loose, rng);
      return [...bleed, ...loose];
    }

    function drawCollageScrapList(
      ctx,
      quiltImg,
      quiltRect,
      panelW,
      panelH,
      dateKey,
      paperTextureImg,
      scraps
    ) {
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
          `${dateKey}:${scrap.name}`,
          resolveScrapQuiltPan(scrap, panelW, panelH, dateKey, quiltRect)
        );
      }
      ctx.restore();
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
      const protectedBounds = computeClusterProtectedBounds(PANEL_W, PANEL_H, cardsLayer);
      const scraps = buildScrapLayouts(PANEL_W, PANEL_H, dateKey, protectedBounds);
      drawCollageScrapList(
        ctx,
        quiltImg,
        quiltRect,
        PANEL_W,
        PANEL_H,
        dateKey,
        paperTextureImg,
        scraps
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
          collageScraps: scraps.map((s) => s.name),
          collageScrapRecords: scraps.map(scrapRecordFromScrap),
          collageRightEdgeScraps: scraps
            .filter((s) => scrapTouchesRightEdge(s.points, PANEL_W))
            .map((s) => s.name),
          collageScrapLayoutSeed: dateKey,
          cluster: clusterMeta,
          cardLayout: 'playwright-dom-screenshot'
        }
      };
    }

    async function applyCarouselRightScrapSeamToReflectionSlide(options = {}) {
      const {
        reflectionDataUrl = null,
        reflectionBlob = null,
        scrapRecords = [],
        quiltBlob = null,
        dateKey = '',
        quiltCanvasRect = null,
        quiltFit = 'cover',
        quiltBgZoom = null,
        panelW = PANEL_W,
        panelH = PANEL_H
      } = options;

      const rightScraps = (Array.isArray(scrapRecords) ? scrapRecords : []).filter((scrap) =>
        scrapTouchesRightEdge(scrap.points, panelW)
      );
      if (!rightScraps.length || !(reflectionDataUrl || reflectionBlob) || !quiltBlob) return null;

      const maxOverhang = Math.max(
        0,
        ...rightScraps.map((scrap) => polygonBounds(scrap.points).maxX - panelW)
      );
      if (maxOverhang <= 0.5) return null;

      const seamWidth = Math.ceil(Math.min(panelW * 0.32, Math.max(32, maxOverhang + 6)));

      const IgCompose = global.IgContributorCarouselCompose || globalThis.IgContributorCarouselCompose;
      const resolveRect = IgCompose?.resolveSharedQuiltRect;
      if (typeof resolveRect !== 'function') return null;

      const [reflectionImg, quiltImg, paperTextureImg] = await Promise.all([
        reflectionBlob ? loadImageFromBlob(reflectionBlob) : loadImageFromDataUrl(reflectionDataUrl),
        loadImageFromBlob(quiltBlob),
        loadPaperTextureImage()
      ]);
      if (!reflectionImg || !quiltImg) return null;

      const quiltRect = resolveRect(quiltImg, {
        quiltCanvasRect,
        quiltFit,
        quiltBgZoom,
        panelWidth: panelW,
        panelHeight: panelH
      });
      if (!quiltRect) return null;

      const canvas = document.createElement('canvas');
      canvas.width = panelW;
      canvas.height = panelH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(reflectionImg, 0, 0, panelW, panelH);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, seamWidth, panelH);
      ctx.clip();
      ctx.translate(-panelW, 0);
      drawCollageScrapList(
        ctx,
        quiltImg,
        quiltRect,
        panelW,
        panelH,
        dateKey,
        paperTextureImg,
        rightScraps
      );
      ctx.restore();

      const blob = await canvasToBlob(canvas);
      if (!blob) return null;

      return {
        blob,
        dataUrl: canvas.toDataURL('image/png'),
        meta: {
          seamWidth,
          scrapCount: rightScraps.length,
          maxOverhangPx: maxOverhang,
          scrapNames: rightScraps.map((s) => s.name)
        }
      };
    }

    return {
      composeCarouselYesterdayStatsSlideFromQuiltBlob,
      applyCarouselRightScrapSeamToReflectionSlide,
      buildScrapLayouts,
      PANEL_W,
      PANEL_H,
      CUTTING_MAT_ASSETS
    };
  }
);
