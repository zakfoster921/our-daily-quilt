/**
 * Post-color cut reveal — green mat, wonky color square, progressive cuts to final block shape.
 * Used by post-color-lab.html now; plug into live app between picker and quilt when ready.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PostColorCutReveal = api;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
  function (root) {
    'use strict';

    const MAX_CUTS = 8;
    const MAX_MOCK_CUTS = 4;
    const MOCK_TARGET_SHRINK = 0.84;
    const DEFAULT_CUT_MS = 580;
    const DEFAULT_REST_MS = 420;
    const DEFAULT_QUILT_TRANSITION_MS = 280;
    const DEFAULT_MAT_HOLD_MS = 550;
    const DEFAULT_LAND_FRAME_MS = 195;
    const DEFAULT_SCRAP_PULL_FRAME_MS = 95;
    const REAL_CUT_LEAD_MS = 58;
    const REAL_SCRAP_FRAME_MS = 56;
    const FAST_CUT_LEAD_MS = 18;
    const FAST_SCRAP_FRAME_MS = 22;
    const FAST_SCRAP_STEPS = 3;
    const COPY_STRIP_FRAME_MS = 400;
    const COPY_STRIP_WORDS = [
      { text: 'Finding', rotate: -1.6 },
      { text: 'the', rotate: 1.2 },
      { text: 'perfect', rotate: -0.9 },
      { text: 'spot', rotate: 1.4 }
    ];
    const COPY_STRIP_MOTION_FRAMES = [
      { x: 0, y: 0, rotate: 0 },
      { x: 1, y: -1, rotate: 0.35 },
      { x: -1, y: 0, rotate: -0.3 },
      { x: 0, y: 1, rotate: 0.22 },
      { x: 1, y: 0, rotate: -0.18 },
      { x: -1, y: -1, rotate: 0.15 }
    ];
    const DEFAULT_LAND_FRAMES = [
      { x: -320, y: 6, rotate: -8 },
      { x: -286, y: -5, rotate: 7 },
      { x: -252, y: 5, rotate: -6 },
      { x: -218, y: -4, rotate: 6 },
      { x: -184, y: 4, rotate: -5 },
      { x: -150, y: -3, rotate: 5 },
      { x: -116, y: 3, rotate: -4 },
      { x: -82, y: -3, rotate: 4 },
      { x: -58, y: 3, rotate: -3 },
      { x: -38, y: -2, rotate: 3 },
      { x: -22, y: 2, rotate: -2 },
      { x: -8, y: -1, rotate: 1 },
      { x: 0, y: 0, rotate: 0 }
    ];

    const SHAPE_PRESETS = {
      triangle: {
        label: 'Triangle (3 sides)',
        points: [[0.22, 0.78], [0.78, 0.78], [0.5, 0.2]]
      },
      hst: {
        label: 'HST triangle (3 sides)',
        points: [[0.18, 0.78], [0.82, 0.78], [0.82, 0.22]]
      },
      rect: {
        label: 'Rectangle (4 sides)',
        points: [[0.24, 0.26], [0.76, 0.28], [0.74, 0.74], [0.26, 0.72]]
      },
      trapezoid: {
        label: 'Trapezoid (4 sides)',
        points: [[0.3, 0.28], [0.7, 0.24], [0.82, 0.76], [0.18, 0.78]]
      },
      pentagon: {
        label: 'Pentagon (5 sides)',
        points: [[0.5, 0.18], [0.78, 0.38], [0.68, 0.78], [0.32, 0.78], [0.22, 0.38]]
      },
      shard: {
        label: 'Shard (6 sides)',
        points: [[0.34, 0.22], [0.72, 0.26], [0.8, 0.52], [0.62, 0.78], [0.28, 0.74], [0.2, 0.44]]
      },
      wonky: {
        label: 'Wonky heptagon (7 sides)',
        points: [[0.38, 0.2], [0.68, 0.24], [0.82, 0.42], [0.74, 0.68], [0.48, 0.8], [0.24, 0.66], [0.18, 0.38]]
      },
      macro: {
        label: 'Macro shard (8 sides)',
        points: [[0.32, 0.18], [0.58, 0.16], [0.78, 0.28], [0.84, 0.5], [0.72, 0.74], [0.5, 0.82], [0.26, 0.72], [0.16, 0.42]]
      }
    };

    function clamp(n, min, max) {
      return Math.min(max, Math.max(min, n));
    }

    function wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function waitMsOrUntil(ms, shouldStop, pollMs = 40) {
      if (ms <= 0) return Promise.resolve();
      return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          if (shouldStop?.()) return resolve();
          if (Date.now() - started >= ms) return resolve();
          setTimeout(tick, pollMs);
        };
        setTimeout(tick, pollMs);
      });
    }

    function createFetchGate(fetchPromise, playStartedAt) {
      const gate = {
        settled: false,
        result: null,
        error: null,
        playStartedAt: playStartedAt || Date.now()
      };

      if (!fetchPromise) {
        return {
          shouldStop: () => false,
          elapsed: () => Date.now() - gate.playStartedAt,
          serverWaitMs: () => null,
          tailMs: (defaultMs, minMs = 280) => defaultMs,
          awaitResult: async () => null
        };
      }

      fetchPromise
        .then((result) => {
          gate.settled = true;
          gate.readyAt = Date.now();
          gate.result = result;
        })
        .catch((error) => {
          gate.settled = true;
          gate.readyAt = Date.now();
          gate.error = error;
        });

      return {
        shouldStop: () => gate.settled,
        elapsed: () => Date.now() - gate.playStartedAt,
        serverWaitMs: () =>
          gate.readyAt ? Math.max(0, gate.readyAt - gate.playStartedAt) : null,
        tailMs(defaultMs, minMs = 280) {
          const elapsed = Date.now() - gate.playStartedAt;
          if (elapsed <= 2800) return defaultMs;
          if (elapsed <= 4200) return Math.max(minMs, Math.round(defaultMs * 0.55));
          if (elapsed <= 6000) return Math.max(minMs, Math.round(defaultMs * 0.38));
          return minMs;
        },
        async awaitResult() {
          if (gate.error) throw gate.error;
          if (gate.result) return gate.result;
          return fetchPromise;
        }
      };
    }

    function snapLandFrame(wrap, frames) {
      const final = frames[frames.length - 1];
      wrap.style.transform =
        `translate(${final.x}px, ${final.y}px) rotate(${final.rotate}deg)`;
      wrap.style.opacity = String(final.opacity ?? 1);
    }

    function pointsToObjects(points) {
      return (points || []).map(([x, y]) => ({ x, y }));
    }

    function resolveScrapDepthScale(area) {
      if (area > 18000) return 1.15;
      if (area > 8000) return 1;
      return 0.82;
    }

    function boundsFromPoints(points) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x, y] of points || []) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
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

    function renderPaperColorPiece(options = {}) {
      const {
        points,
        color,
        paperTextureImg,
        seed,
        panelW,
        panelH,
        depthScale: depthScaleIn,
        textureAnchorBounds,
        lightweight = false
      } = options;
      const canvas = document.createElement('canvas');
      canvas.width = panelW;
      canvas.height = panelH;
      canvas.className = 'post-color-cut-reveal__piece-canvas';
      const ctx = canvas.getContext('2d');
      if (!ctx || !points?.length) return canvas;

      const objPoints = pointsToObjects(points);
      ctx.beginPath();
      objPoints.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();

      if (lightweight) {
        ctx.fillStyle = color;
        ctx.fill();
        return canvas;
      }

      const depthScale = depthScaleIn != null ? depthScaleIn : 1;
      const PaperDepth = root.IgCarouselPaperDepth;

      if (PaperDepth?.drawPaperPieceWithDepth) {
        const depthOpts = PaperDepth.scrapLikeDepthOptions(paperTextureImg, seed, depthScale);
        const colorfulTooth = PaperDepth.quiltFramePaperToothOptions
          ? PaperDepth.quiltFramePaperToothOptions(seed)
          : {
              skipPngTexture: true,
              toothOpacity: 0.32,
              toothBlendMode: 'soft-light',
              fleckIntensity: 0.08
            };
        depthOpts.paperTexture = {
          img: paperTextureImg,
          ...colorfulTooth,
          ...(textureAnchorBounds ? { textureBounds: textureAnchorBounds } : {})
        };
        PaperDepth.drawPaperPieceWithDepth(
          ctx,
          objPoints,
          0,
          () => {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, panelW, panelH);
          },
          depthOpts
        );
        return canvas;
      }

      ctx.fillStyle = color;
      ctx.fill();
      return canvas;
    }

    function mountRemainingPiece(layer, options) {
      layer.innerHTML = '';
      layer.appendChild(renderPaperColorPiece(options));
    }

    function mountScrapPiece(layer, options) {
      const wrap = document.createElement('div');
      wrap.className = 'post-color-cut-reveal__scrap';
      wrap.appendChild(renderPaperColorPiece(options));
      layer.appendChild(wrap);
      return wrap;
    }

    function polygonArea(points) {
      let sum = 0;
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        sum += x1 * y2 - x2 * y1;
      }
      return Math.abs(sum) / 2;
    }

    function polygonCentroid(points) {
      let x = 0;
      let y = 0;
      let a = 0;
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        const cross = x1 * y2 - x2 * y1;
        a += cross;
        x += (x1 + x2) * cross;
        y += (y1 + y2) * cross;
      }
      if (Math.abs(a) < 1e-6) {
        const sx = points.reduce((s, p) => s + p[0], 0) / points.length;
        const sy = points.reduce((s, p) => s + p[1], 0) / points.length;
        return [sx, sy];
      }
      a *= 0.5;
      return [x / (6 * a), y / (6 * a)];
    }

    function ensureCcw(points) {
      if (points.length < 3) return points.slice();
      let sum = 0;
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        sum += (x2 - x1) * (y2 + y1);
      }
      return sum > 0 ? points.slice().reverse() : points.slice();
    }

    function isInsideHalfPlane(point, ax, ay, bx, by) {
      return (bx - ax) * (point[1] - ay) - (by - ay) * (point[0] - ax) >= -1e-6;
    }

    function intersectLines(p1, p2, a, b) {
      const [x1, y1] = p1;
      const [x2, y2] = p2;
      const [x3, y3] = a;
      const [x4, y4] = b;
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(den) < 1e-9) return null;
      const px =
        ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
      const py =
        ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
      return [px, py];
    }

    function clipPolygonToHalfPlane(points, ax, ay, bx, by, keepInside) {
      if (!points.length) return [];
      const output = [];
      for (let i = 0; i < points.length; i++) {
        const curr = points[i];
        const prev = points[(i - 1 + points.length) % points.length];
        const currIn = keepInside
          ? isInsideHalfPlane(curr, ax, ay, bx, by)
          : !isInsideHalfPlane(curr, ax, ay, bx, by);
        const prevIn = keepInside
          ? isInsideHalfPlane(prev, ax, ay, bx, by)
          : !isInsideHalfPlane(prev, ax, ay, bx, by);

        if (currIn) {
          if (!prevIn) {
            const hit = intersectLines(prev, curr, [ax, ay], [bx, by]);
            if (hit) output.push(hit);
          }
          output.push(curr);
        } else if (prevIn) {
          const hit = intersectLines(prev, curr, [ax, ay], [bx, by]);
          if (hit) output.push(hit);
        }
      }
      return output.filter((p, idx, arr) => {
        if (!p) return false;
        if (idx === 0) return true;
        const prev = arr[idx - 1];
        return Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.5;
      });
    }

    function makeWonkySquare(cx, cy, size, rotationDeg = 4.5, wobble = 0.035) {
      const half = size / 2;
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ].map(([ux, uy], i) => {
        const sx = ux * half * (1 + wobble * (i % 2 ? 1 : -1));
        const sy = uy * half * (1 + wobble * (i % 2 ? -1 : 1));
        const rad = (rotationDeg * Math.PI) / 180;
        return [cx + sx * Math.cos(rad) - sy * Math.sin(rad), cy + sx * Math.sin(rad) + sy * Math.cos(rad)];
      });
      return corners;
    }

    function fitPolygonInBox(points, boxPoints) {
      const box = ensureCcw(boxPoints);
      const [bx, by] = polygonCentroid(box);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      points.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
      const pw = Math.max(1, maxX - minX);
      const ph = Math.max(1, maxY - minY);
      const pcx = (minX + maxX) / 2;
      const pcy = (minY + maxY) / 2;
      const boxMinX = Math.min(...box.map((p) => p[0]));
      const boxMaxX = Math.max(...box.map((p) => p[0]));
      const boxMinY = Math.min(...box.map((p) => p[1]));
      const boxMaxY = Math.max(...box.map((p) => p[1]));
      const innerPad = 0.12;
      const availW = (boxMaxX - boxMinX) * (1 - innerPad * 2);
      const availH = (boxMaxY - boxMinY) * (1 - innerPad * 2);
      const scale = Math.min(availW / pw, availH / ph);
      return ensureCcw(
        points.map(([x, y]) => [bx + (x - pcx) * scale, by + (y - pcy) * scale])
      );
    }

    function normalizeBlockPoints(blockLike) {
      if (!blockLike) return null;
      if (Array.isArray(blockLike) && blockLike.length >= 3 && Array.isArray(blockLike[0])) {
        return ensureCcw(blockLike.map((p) => [Number(p[0]), Number(p[1])]));
      }
      if (Array.isArray(blockLike.points) && blockLike.points.length >= 3) {
        return normalizeBlockPoints(blockLike.points);
      }
      if (typeof blockLike === 'string' && SHAPE_PRESETS[blockLike]) {
        return SHAPE_PRESETS[blockLike].points.map((p) => [p[0], p[1]]);
      }
      const w = Number(blockLike.width) || 1;
      const h = Number(blockLike.height) || 1;
      return [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h]
      ];
    }

    function computeSlideVector(scrapPoints, targetCentroid, panelW, panelH) {
      const scrapCenter = polygonCentroid(scrapPoints);
      let dx = scrapCenter[0] - targetCentroid[0];
      let dy = scrapCenter[1] - targetCentroid[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;

      const bounds = boundsFromPoints(scrapPoints);
      const scrapArea = polygonArea(scrapPoints);
      const minPull = clamp(Math.sqrt(scrapArea) * 0.5, 48, 95);
      const pullSpan =
        Math.abs(dx) * bounds.width * 0.5 + Math.abs(dy) * bounds.height * 0.5;
      const offRatio = 0.44;

      let roomToEdge = Infinity;
      if (dx > 0.15) roomToEdge = Math.min(roomToEdge, panelW - scrapCenter[0]);
      if (dx < -0.15) roomToEdge = Math.min(roomToEdge, scrapCenter[0]);
      if (dy > 0.15) roomToEdge = Math.min(roomToEdge, panelH - scrapCenter[1]);
      if (dy < -0.15) roomToEdge = Math.min(roomToEdge, scrapCenter[1]);
      if (!Number.isFinite(roomToEdge)) roomToEdge = minPull;

      const pull = Math.max(minPull, roomToEdge + pullSpan * offRatio);
      const wobble = Math.random() * 5 - 2.5;
      return { dx, dy, pull, wobble };
    }

    function scrapTransformOrigin(scrapPoints, slide, panelW, panelH) {
      const [sx, sy] = polygonCentroid(scrapPoints);
      const ox = sx - slide.dx * 10;
      const oy = sy - slide.dy * 10;
      return `${clamp((ox / panelW) * 100, 6, 94)}% ${clamp((oy / panelH) * 100, 6, 94)}%`;
    }

    function buildScrapPullFrames(slide, stepCount = 5) {
      const steps = Math.max(1, stepCount);
      const frames = [];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const bob = (i % 2 === 0 ? -1 : 1) * 1.4;
        frames.push({
          x: slide.dx * slide.pull * t,
          y: slide.dy * slide.pull * t + bob,
          rotate: slide.wobble * (i % 2 === 0 ? 1 : -0.65) * t
        });
      }
      return frames;
    }

    function planCutsForShape(wonkySquare, target, panelW, panelH, maxCuts, startRemaining) {
      const targetCentroid = polygonCentroid(target);
      const edges = target.map((start, i) => {
        const end = target[(i + 1) % target.length];
        return { start, end, index: i };
      });
      const orderedEdges = edges.slice(0, Math.min(target.length, maxCuts));

      let remaining = (startRemaining || wonkySquare).slice();
      const cuts = [];

      for (const edge of orderedEdges) {
        if (cuts.length >= maxCuts) break;
        const prevRemaining = remaining.slice();
        const nextRemaining = clipPolygonToHalfPlane(
          remaining,
          edge.start[0],
          edge.start[1],
          edge.end[0],
          edge.end[1],
          true
        );
        const scrap = clipPolygonToHalfPlane(
          prevRemaining,
          edge.start[0],
          edge.start[1],
          edge.end[0],
          edge.end[1],
          false
        );
        if (scrap.length >= 3 && polygonArea(scrap) > 8) {
          cuts.push({
            edge,
            scrap,
            remainingAfter: nextRemaining,
            slide: computeSlideVector(scrap, targetCentroid, panelW, panelH)
          });
          remaining = nextRemaining;
        }
      }

      while (cuts.length < maxCuts && polygonArea(remaining) - polygonArea(target) > 12) {
        let best = null;
        for (const edge of edges) {
          const nextRemaining = clipPolygonToHalfPlane(
            remaining,
            edge.start[0],
            edge.start[1],
            edge.end[0],
            edge.end[1],
            true
          );
          const scrap = clipPolygonToHalfPlane(
            remaining,
            edge.start[0],
            edge.start[1],
            edge.end[0],
            edge.end[1],
            false
          );
          const scrapA = polygonArea(scrap);
          if (scrap.length >= 3 && scrapA > 8 && (!best || scrapA > best.scrapArea)) {
            best = { edge, scrap, remainingAfter: nextRemaining, scrapArea: scrapA };
          }
        }
        if (!best) break;
        cuts.push({
          edge: best.edge,
          scrap: best.scrap,
          remainingAfter: best.remainingAfter,
          slide: computeSlideVector(best.scrap, targetCentroid, panelW, panelH)
        });
        remaining = best.remainingAfter;
      }

      return {
        panelW,
        panelH,
        wonkySquare,
        target,
        targetCentroid,
        textureAnchorBounds: boundsFromPoints(wonkySquare),
        cuts: cuts.slice(0, maxCuts),
        cutCount: cuts.length,
        remainingAfter: remaining
      };
    }

    function planDecorativeCut(remaining, panelW, panelH, tryIndex) {
      if (!remaining || remaining.length < 3) return null;
      const targetCentroid = polygonCentroid(remaining);
      const edgeCount = remaining.length;

      for (let attempt = 0; attempt < edgeCount; attempt++) {
        const i = (tryIndex + attempt) % edgeCount;
        const start = remaining[i];
        const end = remaining[(i + 1) % edgeCount];
        const edgeLen = Math.hypot(end[0] - start[0], end[1] - start[1]);
        if (edgeLen < 24) continue;

        const cutX = start[0] + (end[0] - start[0]) * 0.2;
        const cutY = start[1] + (end[1] - start[1]) * 0.2;
        const edge = { start, end: [cutX, cutY], index: i };
        const scrap = clipPolygonToHalfPlane(
          remaining,
          start[0],
          start[1],
          cutX,
          cutY,
          false
        );
        const scrapArea = polygonArea(scrap);
        const remainingArea = polygonArea(remaining);
        if (scrap.length >= 3 && scrapArea > 6 && scrapArea < remainingArea * 0.1) {
          return {
            edge,
            scrap,
            remainingAfter: remaining,
            slide: computeSlideVector(scrap, targetCentroid, panelW, panelH)
          };
        }
      }
      return null;
    }

    function planMockCuts(basePlan, maxMockCuts = MAX_MOCK_CUTS) {
      const [cx, cy] = polygonCentroid(basePlan.wonkySquare);
      const fakeTarget = basePlan.wonkySquare.map(([x, y]) => [
        cx + (x - cx) * MOCK_TARGET_SHRINK,
        cy + (y - cy) * MOCK_TARGET_SHRINK
      ]);
      return planCutsForShape(
        basePlan.wonkySquare,
        ensureCcw(fakeTarget),
        basePlan.panelW,
        basePlan.panelH,
        clamp(maxMockCuts, 1, MAX_MOCK_CUTS)
      );
    }

    function planCutsFromRemaining(wonkySquare, currentRemaining, targetPoints, panelW, panelH, maxCuts) {
      const target = fitPolygonInBox(normalizeBlockPoints(targetPoints), wonkySquare);
      return planCutsForShape(
        wonkySquare,
        target,
        panelW,
        panelH,
        clamp(maxCuts, 1, MAX_CUTS),
        currentRemaining
      );
    }

    function planCuts(options = {}) {
      const panelW = Number(options.panelW) || 390;
      const panelH = Number(options.panelH) || 844;
      const cx = panelW / 2;
      const cy = panelH * 0.46;
      const squareSize = Math.min(panelW, panelH) * 0.56;
      const maxCuts = clamp(Number(options.maxCuts) || MAX_CUTS, 1, MAX_CUTS);

      const wonkySquare = makeWonkySquare(cx, cy, squareSize, options.rotationDeg, options.wobble);
      const unitTarget = normalizeBlockPoints(options.target || options.shapePreset || 'rect');
      const target = fitPolygonInBox(unitTarget, wonkySquare);

      return {
        ...planCutsForShape(wonkySquare, target, panelW, panelH, maxCuts),
        cx,
        cy
      };
    }

    function targetPolygonFromSubmissionBlocks(data) {
      const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
      const dedicatedId = String(data?.dedicatedBlockId || '').trim();
      let block = dedicatedId ? blocks.find((b) => String(b?.id || '') === dedicatedId) : null;
      if (!block && blocks.length) {
        const submissionIndex = Number(data?.submissionIndex) || 0;
        block =
          blocks.find((b) => Number(b?.submissionIndex) === submissionIndex) ||
          blocks[blocks.length - 1];
      }
      if (!block) return null;
      const normalized = normalizeBlockPoints(block);
      return normalized && normalized.length >= 3 ? normalized : null;
    }

    function normalizeSubmissionPreview(data) {
      if (!data || data.success === false) {
        throw new Error(data?.error || 'Color submission failed');
      }
      let targetPolygon = Array.isArray(data.targetPolygon) ? data.targetPolygon : null;
      if (!targetPolygon || targetPolygon.length < 3) {
        targetPolygon = targetPolygonFromSubmissionBlocks(data);
      }
      if (!targetPolygon || targetPolygon.length < 3) {
        const err = new Error('Color submission missing targetPolygon');
        err.code = 'missing_target_polygon';
        throw err;
      }
      return {
        targetPolygon,
        appliedColor: data.appliedColor || data.color,
        sideCount: data.sideCount || targetPolygon.length,
        dedicatedBlockId: data.dedicatedBlockId || '',
        submissionIndex: Number(data.submissionIndex) || 0,
        serverMs: Number(data.serverMs) || Number(data.clientMs) || null,
        clientMs: Number(data.clientMs) || null,
        engineMs: null,
        quiltMs: null,
        submission: data
      };
    }

    async function fetchLivePreview(options = {}) {
      const color = String(options.color || '').trim();
      if (!color) throw new Error('Color is required');
      const baseUrl = String(options.baseUrl ?? root.location?.origin ?? '').replace(/\/$/, '');
      const appDateKey = String(options.appDateKey || '').trim();
      const clientId = String(options.clientId || 'post-color-lab').trim().slice(0, 160);
      const timeoutMs = Number(options.timeoutMs) || 45000;
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer =
        controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

      function needsFullServer(status) {
        return status === 405 || status === 404;
      }

      try {
        let quiltPayload = null;
        let quiltMs = 0;
        if (/^\d{4}-\d{2}-\d{2}$/.test(appDateKey)) {
          onProgress?.({ phase: 'quilt', message: 'Loading quilt…' });
          const quiltStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const qRes = await fetch(`${baseUrl}/api/quilt/${appDateKey}`, {
            ...(controller ? { signal: controller.signal } : {})
          });
          if (needsFullServer(qRes.status)) {
            throw new Error('Live preview needs npm start (full server), not dev:static.');
          }
          quiltPayload = await qRes.json().catch(() => null);
          quiltMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - quiltStarted);
          if (!qRes.ok || !quiltPayload?.ok) {
            throw new Error(quiltPayload?.error || `Quilt load failed (${qRes.status})`);
          }
        }

        onProgress?.({ phase: 'preview', message: 'Running placement…', quiltMs });
        const res = await fetch(`${baseUrl}/api/post-color-lab-preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(controller ? { signal: controller.signal } : {}),
          body: JSON.stringify({
            color,
            ...( /^\d{4}-\d{2}-\d{2}$/.test(appDateKey) ? { appDateKey } : {} ),
            clientId,
            skipMood: true,
            ...(quiltPayload
              ? {
                  blocks: quiltPayload.blocks,
                  contributorCount: quiltPayload.contributorCount,
                  colorReplayEvents: quiltPayload.colorReplayEvents,
                  macroStructureFrozen: quiltPayload.macroStructureFrozen,
                  macroLayoutMode: quiltPayload.macroLayoutMode
                }
              : {})
          })
        });
        if (needsFullServer(res.status)) {
          throw new Error('Live preview needs npm start (full server), not dev:static.');
        }
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Server preview failed (${res.status})`);
        }
        const clientMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
        return {
          ...data,
          clientMs,
          quiltMs: Number(data?.timing?.quiltMs ?? quiltMs) || quiltMs,
          engineMs: Number(data?.timing?.engineMs) || 0,
          serverMs: Number(data.serverMs) || clientMs
        };
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`Server preview timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    async function drawMatBackground(canvas, panelW, panelH) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = panelW;
      canvas.height = panelH;
      const MatBg = root.CarouselCuttingMatBg;
      if (MatBg?.loadCarouselCuttingMatImage && MatBg?.drawCarouselCuttingMatBackground) {
        const img = await MatBg.loadCarouselCuttingMatImage();
        MatBg.drawCarouselCuttingMatBackground(ctx, img, panelW, panelH, 0);
        return;
      }
      if (MatBg?.drawProceduralCuttingMat) {
        MatBg.drawProceduralCuttingMat(ctx, panelW, panelH, 0);
        return;
      }
      const grad = ctx.createLinearGradient(0, 0, panelW, panelH);
      grad.addColorStop(0, '#1b5238');
      grad.addColorStop(1, '#123c28');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, panelW, panelH);
    }

    class PostColorCutRevealController {
      constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this._abort = false;
        this._plan = null;
        this._paperTextureImg = null;
        this._els = {};
        this._buildDom();
      }

      _pieceRenderOptions(color, points, depthScale, lightweight = false) {
        const seedBase = String(this.options.shapePreset || 'block');
        return {
          points,
          color,
          paperTextureImg: this._paperTextureImg,
          seed: `${seedBase}:fabric-tooth`,
          textureAnchorBounds: this._plan?.textureAnchorBounds,
          panelW: this._plan?.panelW || Number(this.options.panelW) || 390,
          panelH: this._plan?.panelH || Number(this.options.panelH) || 844,
          depthScale,
          lightweight
        };
      }

      _snapScrapPullFrame(scrapWrap, frames) {
        const final = frames[frames.length - 1];
        if (!final) return;
        scrapWrap.style.transform =
          `translate(${final.x}px, ${final.y}px) rotate(${final.rotate}deg)`;
      }

      _resolveScrapPullMode(shouldRush, explicitMode) {
        if (explicitMode === 'snap' || explicitMode === 'fast' || explicitMode === 'normal') {
          return explicitMode;
        }
        return shouldRush?.() ? 'fast' : 'normal';
      }

      async _playScrapPullBack(scrapWrap, scrapPoints, slide, frameMs, shouldRush, pullMode) {
        const panelW = this._plan?.panelW || Number(this.options.panelW) || 390;
        const panelH = this._plan?.panelH || Number(this.options.panelH) || 844;
        const rush = typeof shouldRush === 'function' ? shouldRush : null;
        const mode = this._resolveScrapPullMode(rush, pullMode);
        const frameSteps = mode === 'fast' ? FAST_SCRAP_STEPS : 5;
        const frames = buildScrapPullFrames(slide, frameSteps);
        const baseStepMs = frameMs ?? DEFAULT_SCRAP_PULL_FRAME_MS;
        const stepMs =
          mode === 'snap'
            ? 0
            : mode === 'fast'
              ? FAST_SCRAP_FRAME_MS
              : mode === 'normal'
                ? REAL_SCRAP_FRAME_MS
              : rush?.()
                ? Math.min(32, baseStepMs)
                : baseStepMs;

        scrapWrap.style.transition = 'none';
        scrapWrap.style.opacity = '1';
        scrapWrap.style.transformOrigin = scrapTransformOrigin(
          scrapPoints,
          slide,
          panelW,
          panelH
        );

        if (mode === 'snap') {
          this._snapScrapPullFrame(scrapWrap, frames);
          return;
        }

        for (const frame of frames) {
          if (this._abort) {
            this._snapScrapPullFrame(scrapWrap, frames);
            break;
          }
          scrapWrap.style.transform =
            `translate(${frame.x}px, ${frame.y}px) rotate(${frame.rotate}deg)`;
          if (stepMs > 0) await wait(stepMs);
        }
        this._snapScrapPullFrame(scrapWrap, frames);
      }

      _sealFinalBlockBeforeHandoff(color, targetPoints) {
        const { remainingLayer, scrapLayer, cutLayer } = this._els;
        scrapLayer.innerHTML = '';
        remainingLayer.innerHTML = '';
        mountRemainingPiece(
          remainingLayer,
          this._pieceRenderOptions(color, targetPoints, 1.15, true)
        );
        cutLayer.querySelectorAll('.post-color-cut-reveal__cut-line').forEach((line) => {
          line.classList.add('is-faded');
        });
      }

      async _executeCut(cut, renderColor, cutMs, shouldRush, pullMode, cutOptions = {}) {
        const lightweight = cutOptions.lightweight === true;
        const cutLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        cutLine.setAttribute('x1', cut.edge.start[0]);
        cutLine.setAttribute('y1', cut.edge.start[1]);
        cutLine.setAttribute('x2', cut.edge.end[0]);
        cutLine.setAttribute('y2', cut.edge.end[1]);
        cutLine.setAttribute('class', 'post-color-cut-reveal__cut-line');
        this._els.cutLayer.appendChild(cutLine);
        requestAnimationFrame(() => cutLine.classList.add('is-visible'));

        const pieceOpts = (points, depthScale) =>
          this._pieceRenderOptions(renderColor, points, depthScale, lightweight);

        const scrapWrap = mountScrapPiece(this._els.scrapLayer, pieceOpts(cut.scrap));

        if (!cutOptions.skipRemainingMount) {
          mountRemainingPiece(this._els.remainingLayer, pieceOpts(cut.remainingAfter));
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));

        const rush = typeof shouldRush === 'function' ? shouldRush : null;
        const mode = this._resolveScrapPullMode(rush, pullMode);
        const leadMs =
          mode === 'snap'
            ? FAST_CUT_LEAD_MS
            : mode === 'fast'
              ? FAST_CUT_LEAD_MS
              : mode === 'normal'
                ? REAL_CUT_LEAD_MS
                : rush?.()
                  ? 40
                  : 80;
        if (leadMs > 0) await wait(leadMs);
        await this._playScrapPullBack(
          scrapWrap,
          cut.scrap,
          cut.slide,
          mode === 'snap'
            ? 0
            : mode === 'fast'
              ? FAST_SCRAP_FRAME_MS
              : mode === 'normal'
                ? REAL_SCRAP_FRAME_MS
              : rush?.()
                ? 32
                : DEFAULT_SCRAP_PULL_FRAME_MS,
          rush,
          mode
        );
        cutLine.classList.add('is-faded');
        return {
          remainingAfter: cut.remainingAfter,
          scrapWrap,
          scrap: cut.scrap,
          slide: cut.slide
        };
      }

      async _executeDecorativeCut(cut, renderColor, cutMs, shouldRush) {
        const cutLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        cutLine.setAttribute('x1', cut.edge.start[0]);
        cutLine.setAttribute('y1', cut.edge.start[1]);
        cutLine.setAttribute('x2', cut.edge.end[0]);
        cutLine.setAttribute('y2', cut.edge.end[1]);
        cutLine.setAttribute('class', 'post-color-cut-reveal__cut-line');
        this._els.cutLayer.appendChild(cutLine);
        requestAnimationFrame(() => cutLine.classList.add('is-visible'));

        const scrapWrap = mountScrapPiece(
          this._els.scrapLayer,
          this._pieceRenderOptions(renderColor, cut.scrap, undefined, true)
        );

        const rush = typeof shouldRush === 'function' ? shouldRush : null;
        const mode = rush?.() ? 'snap' : 'fast';
        const leadMs = mode === 'snap' ? FAST_CUT_LEAD_MS : 18;
        if (leadMs > 0) await wait(leadMs);
        await this._playScrapPullBack(
          scrapWrap,
          cut.scrap,
          cut.slide,
          mode === 'snap' ? 0 : FAST_SCRAP_FRAME_MS,
          rush,
          mode
        );
        cutLine.classList.add('is-faded');
      }

      async _playMockCutsWhileWaiting(fetchPromise, color, cutMs, maxMockCuts) {
        const { panelW, panelH, wonkySquare } = this._plan;
        const mockPlan = planMockCuts(this._plan, maxMockCuts);
        let remainingAfterMock = wonkySquare.slice();
        let mockCutCount = 0;
        let fetchSettled = false;
        let fetchResult = null;
        let fetchError = null;
        let fillerIndex = 0;

        fetchPromise
          .then((result) => {
            fetchSettled = true;
            fetchResult = result;
          })
          .catch((error) => {
            fetchSettled = true;
            fetchError = error;
          });

        for (const cut of mockPlan.cuts) {
          if (this._abort) return { aborted: true };
          if (fetchSettled) break;
          remainingAfterMock = (
            await this._executeCut(
            cut,
            color,
            cutMs,
            () => fetchSettled,
            'fast',
            { lightweight: true }
          )
          ).remainingAfter;
          mockCutCount += 1;
          if (fetchSettled) break;
        }

        while (!fetchSettled) {
          if (this._abort) return { aborted: true };
          const decorativeCut = planDecorativeCut(
            remainingAfterMock,
            panelW,
            panelH,
            fillerIndex
          );
          fillerIndex += 1;
          if (decorativeCut) {
            await this._executeDecorativeCut(
              decorativeCut,
              color,
              cutMs,
              () => fetchSettled
            );
          } else {
            await waitMsOrUntil(80, () => fetchSettled, 25);
          }
        }

        if (fetchError) throw fetchError;
        if (!fetchResult) fetchResult = await fetchPromise;

        return { remainingAfterMock, mockCutCount, livePreview: fetchResult };
      }

      _buildDom() {
        const panelW = Number(this.options.panelW) || 390;
        const panelH = Number(this.options.panelH) || 844;
        this.container.innerHTML = '';
        this.container.classList.add('post-color-cut-reveal');

        const stage = document.createElement('div');
        stage.className = 'post-color-cut-reveal__stage';
        stage.style.setProperty('--post-color-panel-w', `${panelW}px`);
        stage.style.setProperty('--post-color-panel-h', `${panelH}px`);

        const mat = document.createElement('canvas');
        mat.className = 'post-color-cut-reveal__mat';
        mat.width = panelW;
        mat.height = panelH;

        const piecesLayer = document.createElement('div');
        piecesLayer.className = 'post-color-cut-reveal__pieces';

        const remainingLayer = document.createElement('div');
        remainingLayer.className = 'post-color-cut-reveal__remaining';

        const scrapLayer = document.createElement('div');
        scrapLayer.className = 'post-color-cut-reveal__scraps';

        piecesLayer.appendChild(remainingLayer);
        piecesLayer.appendChild(scrapLayer);

        const svgNS = 'http://www.w3.org/2000/svg';
        const cutSvg = document.createElementNS(svgNS, 'svg');
        cutSvg.setAttribute('class', 'post-color-cut-reveal__cuts');
        cutSvg.setAttribute('viewBox', `0 0 ${panelW} ${panelH}`);
        cutSvg.setAttribute('aria-hidden', 'true');
        const cutLayer = document.createElementNS(svgNS, 'g');
        cutLayer.setAttribute('class', 'post-color-cut-reveal__cut-layer');
        cutSvg.appendChild(cutLayer);

        stage.appendChild(mat);

        const copyLayer = document.createElement('div');
        copyLayer.className = 'post-color-cut-reveal__copy';
        copyLayer.setAttribute('aria-hidden', 'true');
        const copyStage = document.createElement('div');
        copyStage.className = 'post-color-cut-reveal__copy-stage';
        copyLayer.appendChild(copyStage);

        stage.appendChild(copyLayer);
        stage.appendChild(piecesLayer);
        stage.appendChild(cutSvg);
        this.container.appendChild(stage);

        this._els = {
          stage,
          mat,
          copyLayer,
          copyStage,
          piecesLayer,
          remainingLayer,
          scrapLayer,
          cutLayer
        };
      }

      _mountCopyStrips() {
        const { copyStage } = this._els;
        if (!copyStage || !this._plan) return;
        copyStage.innerHTML = '';
        const row = document.createElement('div');
        row.className = 'post-color-cut-reveal__copy-row';
        copyStage.appendChild(row);
        const panelW = this._plan.panelW;
        const fontPx = clamp(Math.round(panelW * 0.041), 14, 18);
        this._copyStripStates = COPY_STRIP_WORDS.map((word, index) => {
          const el = document.createElement('div');
          el.className = 'post-color-cut-reveal__strip';
          el.textContent = word.text;
          el.style.fontSize = `${fontPx}px`;
          row.appendChild(el);
          return {
            el,
            baseRotate: word.rotate,
            frameIndex: index % COPY_STRIP_MOTION_FRAMES.length
          };
        });
        this._applyCopyStripMotionFrame();
      }

      _applyCopyStripMotionFrame() {
        for (const strip of this._copyStripStates || []) {
          const frame =
            COPY_STRIP_MOTION_FRAMES[strip.frameIndex % COPY_STRIP_MOTION_FRAMES.length];
          strip.el.style.transform = `rotate(${(strip.baseRotate + frame.rotate).toFixed(2)}deg) translate(${frame.x}px, ${frame.y}px)`;
        }
      }

      _advanceCopyStripMotionFrame() {
        for (const strip of this._copyStripStates || []) {
          strip.frameIndex = (strip.frameIndex + 1) % COPY_STRIP_MOTION_FRAMES.length;
        }
        this._applyCopyStripMotionFrame();
      }

      _startCopyStripStopMotion() {
        this._copyMotionStop = false;
        if (this._copyMotionTimer) clearInterval(this._copyMotionTimer);
        this._copyMotionTimer = setInterval(() => {
          if (this._abort || this._copyMotionStop) return;
          this._advanceCopyStripMotionFrame();
        }, COPY_STRIP_FRAME_MS);
      }

      _stopCopyStripStopMotion() {
        this._copyMotionStop = true;
        if (this._copyMotionTimer) {
          clearInterval(this._copyMotionTimer);
          this._copyMotionTimer = null;
        }
      }

      _clearCopyStrips() {
        this._stopCopyStripStopMotion();
        this._copyStripStates = null;
        if (this._els?.copyStage) this._els.copyStage.innerHTML = '';
      }

      async prepare(options = {}) {
        this._abort = false;
        this.options = { ...this.options, ...options };
        this._plan = planCuts(this.options);
        const PaperDepth = root.IgCarouselPaperDepth;
        if (PaperDepth?.loadPaperTextureImage) {
          this._paperTextureImg = await PaperDepth.loadPaperTextureImage();
        }
        await drawMatBackground(this._els.mat, this._plan.panelW, this._plan.panelH);
        this.resetLayers(this.options.color || '#6fa8dc');
        return this._plan;
      }

      resetLayers(color, options = {}) {
        const { remainingLayer, scrapLayer, cutLayer, stage } = this._els;
        remainingLayer.innerHTML = '';
        scrapLayer.innerHTML = '';
        cutLayer.innerHTML = '';
        stage.classList.remove(
          'post-color-cut-reveal__stage--resting',
          'post-color-cut-reveal__stage--to-quilt',
          'post-color-cut-reveal__stage--land-tick'
        );

        if (!this._plan || options.hidePiece) return;
        mountRemainingPiece(
          remainingLayer,
          this._pieceRenderOptions(color, this._plan.wonkySquare)
        );
      }

      async _playStopMotionLand(color, options = {}) {
        const frameMs = Number(
          options.landFrameMs ?? this.options.landFrameMs ?? DEFAULT_LAND_FRAME_MS
        );
        const matHoldMs = Number(
          options.matHoldMs ?? this.options.matHoldMs ?? DEFAULT_MAT_HOLD_MS
        );
        const frames = options.landFrames || DEFAULT_LAND_FRAMES;
        const shouldStop = typeof options.shouldStop === 'function' ? options.shouldStop : null;
        const { remainingLayer, stage } = this._els;

        remainingLayer.innerHTML = '';
        await waitMsOrUntil(matHoldMs, shouldStop, 40);
        if (this._abort) return false;

        if (shouldStop?.()) {
          mountRemainingPiece(
            remainingLayer,
            this._pieceRenderOptions(color, this._plan.wonkySquare)
          );
          return true;
        }

        options.onPhase?.({ phase: 'landing' });

        const wrap = document.createElement('div');
        wrap.className = 'post-color-cut-reveal__landing';
        wrap.appendChild(
          renderPaperColorPiece(this._pieceRenderOptions(color, this._plan.wonkySquare))
        );
        remainingLayer.appendChild(wrap);

        for (let i = 0; i < frames.length; i++) {
          if (this._abort) return false;
          const frame = frames[i];
          wrap.style.transform =
            `translate(${frame.x}px, ${frame.y}px) rotate(${frame.rotate}deg)`;
          wrap.style.opacity = String(frame.opacity ?? 1);
          stage.classList.toggle('post-color-cut-reveal__stage--land-tick', i % 2 === 0);
          if (shouldStop?.()) {
            snapLandFrame(wrap, frames);
            await wait(36);
            break;
          }
          await waitMsOrUntil(frameMs, shouldStop, 40);
          if (shouldStop?.() && i < frames.length - 1) {
            snapLandFrame(wrap, frames);
            await wait(36);
            break;
          }
        }

        stage.classList.remove('post-color-cut-reveal__stage--land-tick');
        mountRemainingPiece(
          remainingLayer,
          this._pieceRenderOptions(color, this._plan.wonkySquare)
        );
        return true;
      }

      async play(options = {}) {
        if (!this._plan) await this.prepare(options);
        const color = options.color || this.options.color || '#6fa8dc';
        const fabricColor = color;
        const cutMs = Number(options.cutMs ?? this.options.cutMs ?? DEFAULT_CUT_MS);
        const restMs = Number(options.restMs ?? this.options.restMs ?? DEFAULT_REST_MS);
        const quiltTransitionMs = Number(
          options.quiltTransitionMs ?? this.options.quiltTransitionMs ?? DEFAULT_QUILT_TRANSITION_MS
        );
        const serverDelayMs = Number(options.serverDelayMs ?? this.options.serverDelayMs ?? 0);
        const useLiveServer = options.useLiveServer === true;
        const maxMockCuts = clamp(Number(options.mockCutMax ?? MAX_MOCK_CUTS), 1, MAX_MOCK_CUTS);
        let livePreview = null;
        let mockCutCount = 0;

        this.resetLayers(fabricColor, { hidePiece: true });

        this._mountCopyStrips();
        this._startCopyStripStopMotion();

        const playStartedAt = Date.now();
        let fetchPromise = null;
        if (options.submitPromise) {
          fetchPromise = Promise.resolve(options.submitPromise).then((data) =>
            normalizeSubmissionPreview(data)
          );
        } else if (useLiveServer) {
          fetchPromise = fetchLivePreview({
            color: fabricColor,
            appDateKey: options.appDateKey || this.options.appDateKey,
            clientId: options.clientId || this.options.clientId,
            baseUrl: options.baseUrl || this.options.baseUrl,
            timeoutMs: options.serverTimeoutMs ?? this.options.serverTimeoutMs,
            onProgress: options.onServerProgress
          });
        }
        const useServerPacing = !!fetchPromise;
        const pacingGate = createFetchGate(fetchPromise, playStartedAt);

        options.onPhase?.({ phase: 'mat' });
        const landed = await this._playStopMotionLand(fabricColor, {
          matHoldMs: options.matHoldMs ?? this.options.matHoldMs,
          landFrameMs: options.landFrameMs ?? this.options.landFrameMs,
          landFrames: options.landFrames,
          onPhase: options.onPhase,
          shouldStop: useServerPacing ? () => pacingGate.shouldStop() : null
        });
        if (!landed || this._abort) return { aborted: true };

        if (useServerPacing) {
          options.onPhase?.({ phase: 'cuts' });
          const mockResult = await this._playMockCutsWhileWaiting(
            fetchPromise,
            fabricColor,
            cutMs,
            maxMockCuts
          );
          if (mockResult?.aborted) return { aborted: true };
          livePreview = mockResult.livePreview;
          mockCutCount = mockResult.mockCutCount;
          if (this._abort) return { aborted: true };

          const realCutBudget = MAX_CUTS;
          const realPlan = planCutsFromRemaining(
            this._plan.wonkySquare,
            mockResult.remainingAfterMock,
            livePreview.targetPolygon,
            this._plan.panelW,
            this._plan.panelH,
            realCutBudget
          );
          this._plan = {
            ...this._plan,
            target: realPlan.target,
            targetCentroid: realPlan.targetCentroid,
            cuts: realPlan.cuts,
            cutCount: realPlan.cutCount
          };
        } else if (serverDelayMs > 0) {
          options.onPhase?.({ phase: 'cuts' });
          await wait(serverDelayMs);
        } else {
          options.onPhase?.({ phase: 'cuts' });
        }
        if (this._abort) return { aborted: true };

        const { cuts, target } = this._plan;

        const liveHandoff = typeof options.onHandoff === 'function';
        const serverReadyForCuts = useServerPacing && pacingGate.shouldStop();

        for (let i = 0; i < cuts.length; i++) {
          if (this._abort) return { aborted: true };
          const isLast = i === cuts.length - 1;
          const runningLong = useServerPacing && pacingGate.elapsed() > 5200;
          const pullMode =
            isLast ? 'normal' : serverReadyForCuts || runningLong ? 'fast' : 'normal';
          const rushReal = !isLast && (serverReadyForCuts || runningLong) ? () => true : null;
          await this._executeCut(
            cuts[i],
            fabricColor,
            cutMs,
            rushReal,
            pullMode,
            {
              lightweight: true
            }
          );
          if (this._abort) return { aborted: true };
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }

        if (liveHandoff) {
          this._sealFinalBlockBeforeHandoff(fabricColor, target);
          options.onHandoff();
        } else {
          mountRemainingPiece(
            this._els.remainingLayer,
            this._pieceRenderOptions(fabricColor, target, 1.15)
          );
          let applyPromise = null;
          if (typeof options.onCutsComplete === 'function' && livePreview) {
            applyPromise = Promise.resolve(options.onCutsComplete(livePreview));
          }
          const finalRestMs = useServerPacing ? pacingGate.tailMs(restMs, 180) : restMs;
          const finalQuiltMs = useServerPacing
            ? pacingGate.tailMs(quiltTransitionMs, 180)
            : quiltTransitionMs;
          this._els.stage.classList.add('post-color-cut-reveal__stage--resting');
          await wait(finalRestMs);
          if (this._abort) return { aborted: true };
          this._els.stage.classList.add('post-color-cut-reveal__stage--to-quilt');
          await wait(finalQuiltMs);
          if (applyPromise) await applyPromise;
        }

        const totalMs = Date.now() - playStartedAt;
        const serverWaitMs =
          livePreview?.serverMs ?? pacingGate.serverWaitMs?.() ?? null;
        const postServerMs =
          serverWaitMs != null ? Math.max(0, totalMs - serverWaitMs) : null;

        return {
          aborted: false,
          cutCount: mockCutCount + cuts.length,
          mockCutCount,
          realCutCount: cuts.length,
          plan: this._plan,
          livePreview,
          timing: {
            totalMs,
            serverMs: serverWaitMs,
            postServerMs,
            engineMs: livePreview?.engineMs ?? null,
            quiltMs: livePreview?.quiltMs ?? null
          }
        };
      }

      async playWithSubmission(submitPromise, options = {}) {
        if (!this._plan) await this.prepare(options);
        const submitStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const timedSubmitPromise = Promise.resolve(submitPromise).then((data) => {
          const clientMs = Math.round(
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) - submitStarted
          );
          return {
            ...data,
            clientMs,
            serverMs: Number(data?.serverMs) || clientMs
          };
        });
        return this.play({
          ...options,
          submitPromise: timedSubmitPromise
        });
      }

      abort() {
        this._abort = true;
        this._stopCopyStripStopMotion();
      }

      destroy() {
        this.abort();
        this._clearCopyStrips();
        this.container.innerHTML = '';
        this.container.classList.remove('post-color-cut-reveal');
      }
    }

    function mount(container, options) {
      const ctrl = new PostColorCutRevealController(container, options);
      return ctrl;
    }

    return {
      MAX_CUTS,
      MAX_MOCK_CUTS,
      DEFAULT_CUT_MS,
      DEFAULT_REST_MS,
      DEFAULT_QUILT_TRANSITION_MS,
      DEFAULT_MAT_HOLD_MS,
      DEFAULT_LAND_FRAME_MS,
      DEFAULT_SCRAP_PULL_FRAME_MS,
      DEFAULT_LAND_FRAMES,
      SHAPE_PRESETS,
      planCuts,
      fetchLivePreview,
      normalizeSubmissionPreview,
      mount,
      PostColorCutRevealController
    };
  }
);
