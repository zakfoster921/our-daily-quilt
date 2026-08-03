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
    const DEFAULT_CUT_MS = 580;
    const DEFAULT_REST_MS = 1100;
    const DEFAULT_QUILT_TRANSITION_MS = 720;

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
        textureAnchorBounds
      } = options;
      const canvas = document.createElement('canvas');
      canvas.width = panelW;
      canvas.height = panelH;
      canvas.className = 'post-color-cut-reveal__piece-canvas';
      const ctx = canvas.getContext('2d');
      if (!ctx || !points?.length) return canvas;

      const objPoints = pointsToObjects(points);
      const area = polygonArea(points);
      const depthScale = depthScaleIn ?? resolveScrapDepthScale(area);
      const PaperDepth = root.IgCarouselPaperDepth;

      if (PaperDepth?.drawPaperPieceWithDepth) {
        const depthOpts = PaperDepth.scrapLikeDepthOptions(paperTextureImg, seed, depthScale);
        if (textureAnchorBounds) {
          depthOpts.paperTexture = {
            ...depthOpts.paperTexture,
            textureBounds: textureAnchorBounds
          };
        }
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
      ctx.beginPath();
      objPoints.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
      return canvas;
    }

    function mountRemainingPiece(layer, options) {
      layer.innerHTML = '';
      layer.appendChild(renderPaperColorPiece(options));
    }

    function mountScrapPiece(layer, options, slide) {
      const wrap = document.createElement('div');
      wrap.className = 'post-color-cut-reveal__scrap';
      wrap.style.setProperty('--slide-x', `${slide.x}px`);
      wrap.style.setProperty('--slide-y', `${slide.y}px`);
      wrap.style.setProperty('--slide-r', `${slide.r}deg`);
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
      const slide = Math.max(panelW, panelH) * 0.42;
      const rotate = (Math.random() * 6 - 3).toFixed(2);
      return {
        x: dx * slide,
        y: dy * slide,
        r: rotate
      };
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
      const targetCentroid = polygonCentroid(target);

      const edges = target.map((start, i) => {
        const end = target[(i + 1) % target.length];
        return { start, end, index: i };
      });

      const orderedEdges = edges.slice(0, Math.min(target.length, maxCuts));

      let remaining = wonkySquare.slice();
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
        cx,
        cy,
        wonkySquare,
        target,
        targetCentroid,
        textureAnchorBounds: boundsFromPoints(wonkySquare),
        cuts: cuts.slice(0, maxCuts),
        cutCount: cuts.length
      };
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

      _pieceRenderOptions(color, points, depthScale) {
        const seedBase = String(this.options.shapePreset || 'block');
        return {
          points,
          color,
          paperTextureImg: this._paperTextureImg,
          seed: `${seedBase}:fabric-tooth`,
          textureAnchorBounds: this._plan?.textureAnchorBounds,
          panelW: this._plan?.panelW || Number(this.options.panelW) || 390,
          panelH: this._plan?.panelH || Number(this.options.panelH) || 844,
          depthScale
        };
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
        stage.appendChild(piecesLayer);
        stage.appendChild(cutSvg);
        this.container.appendChild(stage);

        this._els = {
          stage,
          mat,
          piecesLayer,
          remainingLayer,
          scrapLayer,
          cutLayer
        };
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

      resetLayers(color) {
        const { remainingLayer, scrapLayer, cutLayer, stage } = this._els;
        remainingLayer.innerHTML = '';
        scrapLayer.innerHTML = '';
        cutLayer.innerHTML = '';
        stage.classList.remove(
          'post-color-cut-reveal__stage--resting',
          'post-color-cut-reveal__stage--to-quilt'
        );

        if (!this._plan) return;
        mountRemainingPiece(
          remainingLayer,
          this._pieceRenderOptions(color, this._plan.wonkySquare)
        );
      }

      async play(options = {}) {
        if (!this._plan) await this.prepare(options);
        const color = options.color || this.options.color || '#6fa8dc';
        const cutMs = Number(options.cutMs ?? this.options.cutMs ?? DEFAULT_CUT_MS);
        const restMs = Number(options.restMs ?? this.options.restMs ?? DEFAULT_REST_MS);
        const quiltTransitionMs = Number(
          options.quiltTransitionMs ?? this.options.quiltTransitionMs ?? DEFAULT_QUILT_TRANSITION_MS
        );
        const serverDelayMs = Number(options.serverDelayMs ?? this.options.serverDelayMs ?? 0);

        this.resetLayers(color);
        if (serverDelayMs > 0) await wait(serverDelayMs);
        if (this._abort) return { aborted: true };

        const { cuts, target } = this._plan;

        for (let i = 0; i < cuts.length; i++) {
          if (this._abort) return { aborted: true };
          const cut = cuts[i];
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
            this._pieceRenderOptions(color, cut.scrap),
            cut.slide
          );

          mountRemainingPiece(
            this._els.remainingLayer,
            this._pieceRenderOptions(color, cut.remainingAfter)
          );

          await wait(80);
          scrapWrap.classList.add('is-peeled');
          await wait(cutMs);
          cutLine.classList.add('is-faded');
        }

        mountRemainingPiece(
          this._els.remainingLayer,
          this._pieceRenderOptions(color, target, 1.15)
        );

        this._els.stage.classList.add('post-color-cut-reveal__stage--resting');
        await wait(restMs);
        if (this._abort) return { aborted: true };

        this._els.stage.classList.add('post-color-cut-reveal__stage--to-quilt');
        await wait(quiltTransitionMs);

        return {
          aborted: false,
          cutCount: cuts.length,
          plan: this._plan
        };
      }

      abort() {
        this._abort = true;
      }

      destroy() {
        this.abort();
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
      DEFAULT_CUT_MS,
      DEFAULT_REST_MS,
      DEFAULT_QUILT_TRANSITION_MS,
      SHAPE_PRESETS,
      planCuts,
      mount,
      PostColorCutRevealController
    };
  }
);
