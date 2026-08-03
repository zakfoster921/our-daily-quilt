/**
 * Shared collage paper depth: tooth, edge highlights, lift shadows.
 * Used by yesterday-stats scraps and reflection-wall cards on slide 3.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IgCarouselPaperDepth = api;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
  function (global) {
    'use strict';

    const COLLAGE_PAPER_TOOTH = {
      toothOpacity: 0.48,
      pngOpacity: 0.2,
      fleckIntensity: 0.38
    };
    const CLUSTER_PAPER_TOOTH_BOOST = 1.22;
    const PAPER_TEXTURE_URL = 'assets/quilt-paper-card-texture.png';

    let paperTextureImagePromise = null;
    const paperToothTileCache = new Map();

    function loadImageFromUrl(url) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = String(url || '');
      });
    }

    function loadPaperTextureImage() {
      if (paperTextureImagePromise) return paperTextureImagePromise;
      paperTextureImagePromise = loadImageFromUrl(PAPER_TEXTURE_URL);
      return paperTextureImagePromise;
    }

    function rectToPoints(x, y, w, h) {
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h }
      ];
    }

    /** Slide 2 chunky frame cluster — lift shadow + lit edge stroke. */
    function frameClusterDepthOptions() {
      return {
        offsetX: 6,
        offsetY: 10,
        blur: 22,
        alpha: 0.36,
        secondaryAlpha: 0.15,
        highlightWidth: 2,
        highlightColor: 'rgba(255, 255, 255, 0.26)',
        litThreshold: 0.42,
        shadowEdgeColor: 'rgba(0, 0, 0, 0.08)'
      };
    }

    function drawClusterPaperTooth(ctx, frameX, frameY, frameW, frameH, paperImg, seed, toothOptions = null) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(frameX, frameY, frameW, frameH);
      ctx.clip();
      const boost = CLUSTER_PAPER_TOOTH_BOOST;
      drawPaperToothLayers(
        ctx,
        { minX: frameX, minY: frameY, width: frameW, height: frameH },
        toothOptions || {
          paperImg,
          seed: seed || 'cluster-paper',
          toothOpacity: COLLAGE_PAPER_TOOTH.toothOpacity * boost,
          pngOpacity: COLLAGE_PAPER_TOOTH.pngOpacity * boost,
          fleckIntensity: COLLAGE_PAPER_TOOTH.fleckIntensity * boost
        }
      );
      ctx.restore();
    }

    /**
     * Grain on colorful quilt — skip cream paper PNG and keep overlay very light
     * so block colors stay saturated (cream tooth is tuned for white strip paper).
     */
    function quiltFramePaperToothOptions(seed) {
      return {
        seed: seed || 'quilt-frame',
        skipPngTexture: true,
        toothOpacity: 0.32,
        toothBlendMode: 'soft-light',
        fleckIntensity: 0.08
      };
    }

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

    function tracePolygon(ctx, points, close = true) {
      if (!points?.length) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      if (close) ctx.closePath();
    }

    function rectToJitteredPoints(x, y, w, h, rng, jitter = 5) {
      const j = jitter;
      return [
        { x: x + (rng() - 0.5) * j, y: y + (rng() - 0.5) * j },
        { x: x + w + (rng() - 0.5) * j, y: y + (rng() - 0.5) * j },
        { x: x + w + (rng() - 0.5) * j, y: y + h + (rng() - 0.5) * j },
        { x: x + (rng() - 0.5) * j, y: y + h + (rng() - 0.5) * j }
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
          ctx.moveTo(x, y);
          ctx.lineTo(x + (rng() - 0.5) * 10, y + (rng() - 0.5) * 10);
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
      ctx.globalCompositeOperation = options.toothBlendMode || 'overlay';
      ctx.globalAlpha = Number(options.toothOpacity) || 0.52;
      const toothPattern = ctx.createPattern(tooth, 'repeat');
      if (toothPattern) {
        ctx.fillStyle = toothPattern;
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();

      const skipPng = options.skipPngTexture === true;
      if (!skipPng && (paperImg?.naturalWidth || paperImg?.width)) {
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
      const bounds = options.textureBounds || polygonBounds(points);
      if (!bounds.width || !bounds.height) return;
      drawPaperToothLayers(ctx, bounds, {
        paperImg,
        seed: options.seed || 'paper-texture',
        toothOpacity: options.toothOpacity,
        pngOpacity: options.pngOpacity,
        fleckIntensity: options.fleckIntensity
      });
    }

    function collagePaperToothOptions(seed) {
      return {
        seed,
        toothOpacity: COLLAGE_PAPER_TOOTH.toothOpacity,
        pngOpacity: COLLAGE_PAPER_TOOTH.pngOpacity,
        fleckIntensity: COLLAGE_PAPER_TOOTH.fleckIntensity
      };
    }

    /** Soft irregular shadow cast upward from the quilt frame top lip onto the mat. */
    function buildQuiltFrameTopShadowBand(frameX, frameY, frameW, seed, options = {}) {
      const rng = createSeededRng(String(seed || 'quilt-top-shadow'));
      const jitter = Number(options.jitter) || 5;
      const bandUp = Number(options.bandUp) || 22;
      const segments = Math.max(12, Math.floor(frameW / 36));
      const top = [];
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        top.push({
          x: frameX + t * frameW + (rng() - 0.5) * jitter,
          y: frameY + (rng() - 0.5) * jitter * 0.55
        });
      }
      const upper = top.map((p) => ({
        x: p.x + (rng() - 0.5) * jitter * 0.85,
        y: p.y - bandUp - rng() * 7
      }));
      return [...top, ...upper.reverse()];
    }

    function drawQuiltFrameTopCastShadow(ctx, frameX, frameY, frameW, seed, options = {}) {
      const offsetY = Number(options.offsetY) || 0;
      const points = buildQuiltFrameTopShadowBand(frameX, frameY + offsetY, frameW, seed, options);
      if (points.length < 4) return;
      const alpha = Number(options.alpha) || 0.3;
      const blur = Number(options.blur) || 18;
      const secondaryAlpha = Number(options.secondaryAlpha) || 0.13;

      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.01)';
      tracePolygon(ctx, points);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${secondaryAlpha})`;
      tracePolygon(
        ctx,
        points.map((p) => ({ x: p.x + 1.2, y: p.y - 3 }))
      );
      ctx.fill();
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

    function extractAlphaBlobsFromCanvas(canvas, minArea = 2200, alphaThreshold = 18) {
      const w = canvas.width;
      const h = canvas.height;
      const ctx = canvas.getContext('2d');
      if (!ctx || !w || !h) return [];
      const { data } = ctx.getImageData(0, 0, w, h);
      const seen = new Uint8Array(w * h);
      const blobs = [];
      const idx = (x, y) => y * w + x;

      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = idx(x, y);
          if (seen[i] || data[i * 4 + 3] <= alphaThreshold) continue;
          let minX = x;
          let maxX = x;
          let minY = y;
          let maxY = y;
          let area = 0;
          const stack = [[x, y]];
          seen[i] = 1;
          while (stack.length) {
            const [cx, cy] = stack.pop();
            area += 1;
            minX = Math.min(minX, cx);
            maxX = Math.max(maxX, cx);
            minY = Math.min(minY, cy);
            maxY = Math.max(maxY, cy);
            if (cx > 0) {
              const ni = idx(cx - 1, cy);
              if (!seen[ni] && data[ni * 4 + 3] > alphaThreshold) {
                seen[ni] = 1;
                stack.push([cx - 1, cy]);
              }
            }
            if (cx + 1 < w) {
              const ni = idx(cx + 1, cy);
              if (!seen[ni] && data[ni * 4 + 3] > alphaThreshold) {
                seen[ni] = 1;
                stack.push([cx + 1, cy]);
              }
            }
            if (cy > 0) {
              const ni = idx(cx, cy - 1);
              if (!seen[ni] && data[ni * 4 + 3] > alphaThreshold) {
                seen[ni] = 1;
                stack.push([cx, cy - 1]);
              }
            }
            if (cy + 1 < h) {
              const ni = idx(cx, cy + 1);
              if (!seen[ni] && data[ni * 4 + 3] > alphaThreshold) {
                seen[ni] = 1;
                stack.push([cx, cy + 1]);
              }
            }
          }
          if (area >= minArea) {
            blobs.push({
              minX,
              minY,
              maxX,
              maxY,
              width: maxX - minX + 1,
              height: maxY - minY + 1,
              area
            });
          }
        }
      }
      blobs.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
      return blobs;
    }

    function scrapLikeDepthOptions(paperTextureImg, seed, depthScale = 1) {
      return {
        offsetX: 2.5 * depthScale,
        offsetY: 4 * depthScale,
        blur: 7 * depthScale,
        alpha: 0.17,
        secondaryAlpha: 0.06,
        highlightWidth: 1.4 * depthScale,
        shadowEdgeColor: 'rgba(0, 0, 0, 0.08)',
        paperTexture: {
          img: paperTextureImg,
          ...collagePaperToothOptions(seed)
        }
      };
    }

    function drawCanvasRegionWithPaperDepth(
      ctx,
      sourceCanvas,
      sx,
      sy,
      sw,
      sh,
      destX,
      destY,
      destW,
      destH,
      options = {}
    ) {
      const rng = options.rng || createSeededRng(options.seed || 'paper-piece');
      const pad = Number(options.edgePad) || 1.5;
      const points = rectToJitteredPoints(
        destX - pad,
        destY - pad,
        destW + pad * 2,
        destH + pad * 2,
        rng,
        options.cornerJitter ?? 5
      );
      const rotateDeg = options.rotateDeg ?? (rng() - 0.5) * 4.5;
      const bounds = polygonBounds(points);
      drawPaperPieceWithDepth(
        ctx,
        points,
        rotateDeg,
        () => {
          ctx.drawImage(sourceCanvas, sx, sy, sw, sh, bounds.minX, bounds.minY, bounds.width, bounds.height);
        },
        options.depthOptions || scrapLikeDepthOptions(options.paperTextureImg, options.seed)
      );
    }

    return {
      COLLAGE_PAPER_TOOTH,
      PAPER_TEXTURE_URL,
      createSeededRng,
      collagePaperToothOptions,
      extractAlphaBlobsFromCanvas,
      drawPaperPieceWithDepth,
      drawCanvasRegionWithPaperDepth,
      scrapLikeDepthOptions,
      loadPaperTextureImage,
      rectToPoints,
      frameClusterDepthOptions,
      quiltFramePaperToothOptions,
      drawClusterPaperTooth,
      drawQuiltFrameTopCastShadow
    };
  }
);
