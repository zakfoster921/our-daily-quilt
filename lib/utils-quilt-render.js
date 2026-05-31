/**
 * HST/inset render geometry, film grain, and canvas helpers. Extends UtilsCore. Requires lib/utils-quilt.js.
 */
(function (root) {
  'use strict';

  const UtilsCore = root.UtilsCore;
  if (!UtilsCore) {
    throw new Error('lib/utils-core.js must load before utils-quilt-render.js');
  }

  Object.assign(UtilsCore, {
    /** Deterministic PRNG from block fields so organic HST shape is stable per block. */
    _hashHstOrganicSeed(block) {
      const s = [
        String(block.id ?? ''),
        String(block.x ?? 0),
        String(block.y ?? 0),
        String(block.width ?? 0),
        String(block.height ?? 0),
        String(block.hstDiagonal ?? ''),
        String(block.hstColorB ?? '')
      ].join('|');
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    },
    _mulberry32(seed) {
      let a = seed >>> 0;
      return () => {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    /**
     * Legacy HST only (no stored hstTriangles): slightly wobbly diagonal seam + extra vertices,
     * matching the hand-cut rectangle vibe. Geometry/split math still uses getHstRenderTriangles.
     */
    getHstOrganicRenderTriangles(block, jitterMultiplier = 1) {
      const exact = UtilsCore.getHstRenderTriangles(block);
      if (!exact || exact.length !== 2) {
        return exact || [];
      }
      if (Array.isArray(block.hstTriangles) && block.hstTriangles.length) {
        return exact;
      }
      const w = Number(block.width);
      const h = Number(block.height);
      if (!(w > 0 && h > 0)) {
        return exact;
      }
      const jm = jitterMultiplier == null || Number.isNaN(Number(jitterMultiplier)) ? 1 : Number(jitterMultiplier);
      const rng = UtilsCore._mulberry32(UtilsCore._hashHstOrganicSeed(block));
      const diag = block.hstDiagonal === 'ne-sw' ? 'ne-sw' : 'nw-se';
      const blockArea = w * h;
      const areaFactor = Math.sqrt(blockArea) / 100;
      let sizeAdjustedVariation;
      if (areaFactor < 2) {
        sizeAdjustedVariation = Math.min(4, Math.max(1, areaFactor * 2));
      } else {
        sizeAdjustedVariation = Math.min(6, 4 + (areaFactor - 2) * 1);
      }
      const handCutVariation = sizeAdjustedVariation * jm;
      /** Slightly stronger seam wobble vs grid uniformity (paired with asymmetric HST splits). */
      const diagVar = handCutVariation * 0.82;
      const segments =
        areaFactor < 2
          ? Math.max(2, Math.min(3, Math.floor(areaFactor * 1.2) + 1))
          : Math.max(3, Math.min(5, Math.floor(3 + (areaFactor - 2) * 0.4)));
      const len = Math.hypot(w, h);

      if (diag === 'nw-se') {
        const px = -h / len;
        const py = w / len;
        const wobble = [];
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const bx = t * w;
          const by = t * h;
          if (i === 0 || i === segments) {
            wobble.push([bx, by]);
          } else {
            const off = (rng() - 0.5) * 2 * diagVar;
            wobble.push([bx + px * off, by + py * off]);
          }
        }
        const midRev = wobble.slice(1, -1).reverse();
        const tri1pts = [[0, h], [w, h], ...midRev, [0, 0]];
        const tri2pts = [[0, 0], [w, 0], [w, h], ...midRev];
        return [
          { color: exact[0].color, points: tri1pts },
          { color: exact[1].color, points: tri2pts }
        ];
      }

      const px = -h / len;
      const py = -w / len;
      const wobble = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const bx = w * (1 - t);
        const by = h * t;
        if (i === 0 || i === segments) {
          wobble.push([bx, by]);
        } else {
          const off = (rng() - 0.5) * 2 * diagVar;
          wobble.push([bx + px * off, by + py * off]);
        }
      }
      const mid = wobble.slice(1, -1);
      const midRev = mid.slice().reverse();
      const tri1pts = [[0, 0], [w, 0], ...mid, [0, h]];
      const tri2pts = [[w, 0], [w, h], [0, h], ...midRev];
      return [
        { color: exact[0].color, points: tri1pts },
        { color: exact[1].color, points: tri2pts }
      ];
    },
    /** Compare two classic 2-triangle HST layouts (colors + sorted corner coords). */
    hstClassicTwoTriSignature(tris) {
      if (!Array.isArray(tris) || tris.length !== 2) return '';
      const part = (t) => {
        const c = String(t.color || '').trim().toLowerCase();
        const pts = (t.points || [])
          .map((p) => [
            Math.round((Array.isArray(p) ? Number(p[0]) : Number(p.x)) * 100) / 100,
            Math.round((Array.isArray(p) ? Number(p[1]) : Number(p.y)) * 100) / 100
          ])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        return `${c}:${JSON.stringify(pts)}`;
      };
      return [part(tris[0]), part(tris[1])].sort().join('::');
    },
    syntheticLegacyHstSignature(w, h, colorA, colorB, diag) {
      const tris = UtilsCore.getHstRenderTriangles({
        width: w,
        height: h,
        color: colorA,
        hstColorB: colorB,
        hstDiagonal: diag,
        patternType: 'special',
        specialPatternType: 'hst'
      });
      return UtilsCore.hstClassicTwoTriSignature(tris);
    },
    /**
     * Hash for stable organic jitter: depends only on the shared world circle so every shard
     * clipped from splits uses the SAME wobbly curve (ids/dims/shard position must not reshape it).
     */
    _insetCircleJitterSeed(block) {
      const cx = Number(block && block.insetCx);
      const cy = Number(block && block.insetCy);
      const r = Number(block && block.insetR);
      let s =
        Number.isFinite(cx) &&
        Number.isFinite(cy) &&
        Number.isFinite(r) &&
        r > 0
          ? `winset:${Math.round(cx * 4096)}|${Math.round(cy * 4096)}|${Math.round(r * 4096)}`
          : [
              String((block && block.id) ?? ''),
              String((block && block.insetTier) ?? 0),
              String(block && block.width),
              String(block && block.height)
            ].join('|');
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    },
    _insetDedupePolyVerts(pts, eps) {
      const out = [];
      for (const q of pts || []) {
        if (!q || q.length < 2) continue;
        if (
          !out.length ||
          Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) > eps
        ) {
          out.push([q[0], q[1]]);
        }
      }
      if (
        out.length > 1 &&
        Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps
      ) {
        out.pop();
      }
      return out;
    },
    _insetClipSegVertical(x0, A, B) {
      const [x1, y1] = A;
      const [x2, y2] = B;
      const d = x2 - x1;
      if (Math.abs(d) < 1e-12) return null;
      const t = (x0 - x1) / d;
      if (t < -1e-6 || t > 1 + 1e-6) return null;
      return [x0, y1 + t * (y2 - y1)];
    },
    _insetClipSegHorizontal(y0, A, B) {
      const [x1, y1] = A;
      const [x2, y2] = B;
      const d = y2 - y1;
      if (Math.abs(d) < 1e-12) return null;
      const t = (y0 - y1) / d;
      if (t < -1e-6 || t > 1 + 1e-6) return null;
      return [x1 + t * (x2 - x1), y0];
    },
    _insetClipHalfPlane(poly, insideFn, intersectFn) {
      const eps = 1e-9;
      const out = [];
      if (!poly || poly.length < 2) return out;
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const prev = poly[(i + n - 1) % n];
        const curr = poly[i];
        const prevIn = insideFn(prev);
        const currIn = insideFn(curr);
        if (currIn) {
          if (!prevIn) {
            const is = intersectFn(prev, curr);
            if (is) out.push(is);
          }
          out.push([curr[0], curr[1]]);
        } else if (prevIn) {
          const is = intersectFn(prev, curr);
          if (is) out.push(is);
        }
      }
      return UtilsCore._insetDedupePolyVerts(out, eps);
    },
    /** Convex subject polygon clipped to axis-aligned rectangle [rx,rx+rw]×[ry,ry+rh]. */
    clipConvexPolygonToRect(polyRaw, rx, ry, rw, rh) {
      const eps = 1e-9;
      const minX = rx;
      const maxX = rx + rw;
      const minY = ry;
      const maxY = ry + rh;
      let poly = (polyRaw || []).map((p) => [Number(p[0]), Number(p[1])]);
      poly = UtilsCore._insetClipHalfPlane(
        poly,
        (pt) => pt[0] >= minX - eps,
        (A, B) => UtilsCore._insetClipSegVertical(minX, A, B)
      );
      poly = UtilsCore._insetClipHalfPlane(
        poly,
        (pt) => pt[0] <= maxX + eps,
        (A, B) => UtilsCore._insetClipSegVertical(maxX, A, B)
      );
      poly = UtilsCore._insetClipHalfPlane(
        poly,
        (pt) => pt[1] >= minY - eps,
        (A, B) => UtilsCore._insetClipSegHorizontal(minY, A, B)
      );
      poly = UtilsCore._insetClipHalfPlane(
        poly,
        (pt) => pt[1] <= maxY + eps,
        (A, B) => UtilsCore._insetClipSegHorizontal(maxY, A, B)
      );
      return poly;
    },
    /**
     * Local (block) coords: organic disk clipped to [0,w]×[0,h] (any depth of axis splits).
     */
    insetCircleOrganicSectorPointsLocal(block, jitterMultiplier = 1) {
      const bw = Math.max(1, Number(block.width));
      const bh = Math.max(1, Number(block.height));
      let lcx = Number(block.insetCx) - Number(block.x);
      let lcy = Number(block.insetCy) - Number(block.y);
      let r = Number(block.insetR);
      if (
        !Number.isFinite(lcx) ||
        !Number.isFinite(lcy) ||
        !Number.isFinite(r) ||
        r <= 0
      ) {
        lcx = bw / 2;
        lcy = bh / 2;
        r = (Math.min(bw, bh) * 0.9) / 2;
      }
      const jm = jitterMultiplier == null ? 1 : Number(jitterMultiplier);
      /** Scale wobble by shared circle radius, not shard area — keeps seam with adjacent shards. */
      const arcJitter = Math.min(6, Math.max(0.85, r / 48)) * jm * 0.5;
      const rng = UtilsCore._mulberry32(UtilsCore._insetCircleJitterSeed(block));
      const steps = 52;
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const ang = t * Math.PI * 2;
        const off = i > 0 && i < steps - 1 ? (rng() - 0.5) * 2 * arcJitter : 0;
        const rr = r + off;
        pts.push([lcx + Math.cos(ang) * rr, lcy + Math.sin(ang) * rr]);
      }
      const clipped = UtilsCore.clipConvexPolygonToRect(pts, 0, 0, bw, bh);
      if (!clipped || clipped.length < 3) {
        const exact = [];
        for (let j = 0; j < steps; j++) {
          const ang = (j / steps) * Math.PI * 2;
          exact.push([lcx + Math.cos(ang) * r, lcy + Math.sin(ang) * r]);
        }
        const clipped2 = UtilsCore.clipConvexPolygonToRect(exact, 0, 0, bw, bh);
        if (!clipped2 || clipped2.length < 3) {
          return { kind: 'none', points: [] };
        }
        return { kind: 'loop', points: clipped2 };
      }
      return { kind: 'loop', points: clipped };
    },
    /**
     * Raster draw: `dest` mapped from block local coords (0…w, 0…h).
     */
    fillInsetCircleBlockCanvasCtx(ctx, block, destX, destY, destW, destH) {
      if (!ctx || !block) return;
      const bw = Math.max(1e-6, Number(block.width));
      const bh = Math.max(1e-6, Number(block.height));
      const bgHex =
        /^#[0-9a-f]{6}$/i.test(String(block.color || '').trim()) ? String(block.color).trim() : '#c8c4bf';
      ctx.fillStyle = bgHex;
      ctx.fillRect(destX, destY, destW, destH);

      /** Field watercolor: symmetrical center of raster cell (clips to rect). */
      const fieldSpan = Math.max(destW, destH);
      const fieldCx = destX + destW / 2;
      const fieldCy = destY + destH / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(destX, destY, destW, destH);
      ctx.clip();
      UtilsCore.canvasWatercolorWashAxisAlignedRect(
        ctx,
        destX,
        destY,
        destW,
        destH,
        bgHex,
        `${block.id || 'bl'}|inRasterField`,
        { radial: { cx: fieldCx, cy: fieldCy, span: fieldSpan }, skipClip: true }
      );
      ctx.restore();

      const innerRaw = typeof block.insetInnerColor === 'string' ? block.insetInnerColor : block.color;
      const innerHex =
        /^#[0-9a-f]{6}$/i.test(String(innerRaw || '').trim()) ? String(innerRaw).trim() : bgHex;

      const spec = UtilsCore.insetCircleOrganicSectorPointsLocal(block, 1);
      if (spec.kind === 'none' || !(spec.points && spec.points.length >= 3)) {
        return;
      }
      const map = (p) => [
        destX + (Number(p[0]) / bw) * destW,
        destY + (Number(p[1]) / bh) * destH
      ];
      const pts = spec.points.map(map);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = innerHex;
      ctx.fill();

      const ir = UtilsCore.polygonRadialAnchorFromPoints(pts);
      if (!ir || !(ir.span > 0)) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.clip();
      UtilsCore.canvasWatercolorWashAxisAlignedRect(
        ctx,
        destX,
        destY,
        destW,
        destH,
        innerHex,
        `${block.id || 'bl'}|inRasterDisk`,
        { radial: { cx: ir.cx, cy: ir.cy, span: ir.span }, skipClip: true }
      );
      ctx.restore();
    },
    /**
     * Centroid + bbox span for any simple polygon verts (half-square triangles, hand-cut rects, clipped inset disks — same coords as draw).
     */
    polygonRadialAnchorFromPoints(points) {
      const pts = points || [];
      if (!Array.isArray(pts) || pts.length < 3) return null;
      let sx = 0;
      let sy = 0;
      let mix = Infinity;
      let miy = Infinity;
      let mxx = -Infinity;
      let myy = -Infinity;
      for (const q of pts) {
        const x = Number(q[0]);
        const y = Number(q[1]);
        sx += x;
        sy += y;
        if (Number.isFinite(x)) {
          mix = Math.min(mix, x);
          mxx = Math.max(mxx, x);
        }
        if (Number.isFinite(y)) {
          miy = Math.min(miy, y);
          myy = Math.max(myy, y);
        }
      }
      const n = pts.length;
      const span = Math.max(mxx - mix, myy - miy, 1e-6);
      return { cx: sx / n, cy: sy / n, span };
    },
    /** @deprecated Prefer {@link polygonRadialAnchorFromPoints} — same centroid math (HST triangles). */
    hstOrganicTriangleRadialAnchorLocal(points) {
      return UtilsCore.polygonRadialAnchorFromPoints(points);
    },
    /** Parse SVG `<polygon points="x,y x,y …">` into `[ [x,y], … ]`. */
    parseSvgPolygonPointsAttr(attr) {
      if (!attr || typeof attr !== 'string') return null;
      const raw = String(attr)
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean);
      const verts = [];
      for (let i = 0; i + 1 < raw.length; i += 2) {
        const x = Number.parseFloat(raw[i]);
        const y = Number.parseFloat(raw[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        verts.push([x, y]);
      }
      return verts.length >= 3 ? verts : null;
    },
    /**
     * Mirrors reel/svg watercolor: radial lighten + subtler edge darken in **current canvas space**.
     * Pass `washOptions.radial` with `{ cx, cy, span }` (absolute coords) so HST wedges use centroid, not square center.
     * `washOptions.skipClip`: gradients only; caller clipped (e.g. triangle path).
     */
    canvasWatercolorWashAxisAlignedRect(
      ctx,
      rectLeft,
      rectTop,
      rectW,
      rectH,
      colorHex,
      seedKey = '',
      washOptions = null
    ) {
      const rad = washOptions && washOptions.radial;
      const skipClip = !!(washOptions && washOptions.skipClip);
      const uw = Math.abs(rectW);
      const uh = Math.abs(rectH);
      const hasRadial =
        !!(rad &&
        typeof rad.cx === 'number' &&
        typeof rad.cy === 'number' &&
        typeof rad.span === 'number' &&
        rad.span > 0);
      const baseSpan = hasRadial ? rad.span : Math.max(uw, uh);
      if (!ctx || baseSpan <= 0) return;
      if (!skipClip && (!Number.isFinite(uw) || !Number.isFinite(uh) || uw <= 0 || uh <= 0)) return;
      const m = /^#?([0-9a-f]{6})$/i.exec(String(colorHex || '').trim());
      const rr = m ? parseInt(m[1].slice(0, 2), 16) : 200;
      const rg = m ? parseInt(m[1].slice(2, 4), 16) : 196;
      const rb = m ? parseInt(m[1].slice(4, 6), 16) : 191;
      const ss = `${seedKey}|wc`;
      let hh = 2166136261 >>> 0;
      for (let i = 0; i < `${ss}|cx`.length; i++) {
        hh ^= `${ss}|cx`.charCodeAt(i);
        hh = Math.imul(hh, 16777619);
      }
      const ucx = (hh >>> 0) / 4294967295;
      let h2 = 2166136261 >>> 0;
      for (let i = 0; i < `${ss}|cy`.length; i++) {
        h2 ^= `${ss}|cy`.charCodeAt(i);
        h2 = Math.imul(h2, 16777619);
      }
      const ucy = (h2 >>> 0) / 4294967295;
      const luminance = 0.299 * rr + 0.587 * rg + 0.114 * rb;
      let wdf = 1;
      if (luminance <= 72) wdf = 0.5;
      else if (luminance <= 96) wdf = 0.66;
      else if (luminance <= 124) wdf = 0.82;
      const minDim = Math.min(Math.abs(rectW), Math.abs(rectH));
      const sz = minDim <= 44 ? 0.45 : minDim <= 72 ? 0.7 : 1;
      const t0 = sz * wdf;
      const t = Math.max(0, Math.min(1, t0));
      if (t <= 0.001) return;

      let darkBoost = 0;
      if (luminance <= 72) darkBoost = 1;
      else if (luminance <= 96) darkBoost = 0.65;

      const gSpan = Math.max(baseSpan, 1e-6);
      const gMin = Math.min(Math.min(uw, uh), gSpan);

      let cx;
      let cy;
      if (hasRadial) {
        const jitterScale = Math.min(gSpan * 0.22, Math.max(rectW, rectH, gSpan) * 0.12);
        cx = rad.cx + (ucx - 0.5) * 2 * jitterScale;
        cy = rad.cy + (ucy - 0.5) * 2 * jitterScale;
      } else {
        cx = rectLeft + rectW * (0.38 + ucx * 0.24);
        cy = rectTop + rectH * (0.38 + ucy * 0.24);
      }

      ctx.save();
      if (!skipClip) {
        ctx.beginPath();
        ctx.rect(rectLeft, rectTop, rectW, rectH);
        ctx.clip();
      }
      ctx.globalCompositeOperation = 'screen';
      const cGrad = ctx.createRadialGradient(
        cx,
        cy,
        gMin * 0.08,
        cx,
        cy,
        gSpan * 0.72
      );
      cGrad.addColorStop(0, `rgba(255,255,255,${Math.min(0.92, 0.16 * t).toFixed(3)})`);
      cGrad.addColorStop(0.55, `rgba(255,255,255,${Math.min(0.45, 0.05 * t).toFixed(3)})`);
      cGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cGrad;
      ctx.fillRect(rectLeft - 2, rectTop - 2, uw + 4, uh + 4);
      ctx.globalCompositeOperation = 'multiply';
      const eGrad = ctx.createRadialGradient(cx, cy, gMin * 0.18, cx, cy, gSpan * 0.92);
      eGrad.addColorStop(0, `rgba(${rr},${rg},${rb},0)`);
      eGrad.addColorStop(0.65, `rgba(${rr},${rg},${rb},${Math.min(0.35, 0.03 * t).toFixed(3)})`);
      eGrad.addColorStop(1, `rgba(${rr},${rg},${rb},${Math.min(0.75, 0.19 * t).toFixed(3)})`);
      ctx.fillStyle = eGrad;
      ctx.fillRect(rectLeft - 2, rectTop - 2, uw + 4, uh + 4);
      if (darkBoost > 0.001) {
        const dGrad = ctx.createRadialGradient(cx, cy, gMin * 0.2, cx, cy, gSpan * 0.96);
        dGrad.addColorStop(0, 'rgba(0,0,0,0)');
        dGrad.addColorStop(0.74, `rgba(0,0,0,${Math.min(0.4, 0.012 * darkBoost * t).toFixed(3)})`);
        dGrad.addColorStop(1, `rgba(0,0,0,${Math.min(0.55, 0.085 * darkBoost * t).toFixed(3)})`);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = dGrad;
        ctx.fillRect(rectLeft - 2, rectTop - 2, uw + 4, uh + 4);
      }
      ctx.restore();
    },
    /**
     * Local points shifted by `originX`/`originY` (e.g. jittered block top-left for SVG).
     */
    insetCircleSectorPointsWorld(block, originX, originY) {
      const spec = UtilsCore.insetCircleOrganicSectorPointsLocal(block);
      const ox = Number(originX) || 0;
      const oy = Number(originY) || 0;
      if (spec.kind === 'none' || !(spec.points && spec.points.length >= 3)) {
        return { kind: 'none', points: [] };
      }
      const map = (p) => [ox + Number(p[0]), oy + Number(p[1])];
      return { kind: 'loop', points: spec.points.map(map) };
    },
    /** Memoized canvases identical to synthetic reel grain tiles. */
    _odqFilmGrainTileCache: null,
    /** @returns {{grainTile: HTMLCanvasElement, screenNoiseTile: HTMLCanvasElement, paperTile: HTMLCanvasElement, halftoneTile: HTMLCanvasElement, inkSpeckleTile: HTMLCanvasElement}} */
    getFilmGrainTileCanvases() {
      if (UtilsCore._odqFilmGrainTileCache) return UtilsCore._odqFilmGrainTileCache;
      const grainTile = root.document.createElement('canvas');
      grainTile.width = 240;
      grainTile.height = 240;
      {
        const gctx = grainTile.getContext('2d');
        const img = gctx.createImageData(grainTile.width, grainTile.height);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.floor(Math.random() * 256);
          img.data[i] = v;
          img.data[i + 1] = v;
          img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        gctx.putImageData(img, 0, 0);
      }
      const screenNoiseTile = root.document.createElement('canvas');
      screenNoiseTile.width = 180;
      screenNoiseTile.height = 180;
      {
        const sctx = screenNoiseTile.getContext('2d');
        const img = sctx.createImageData(screenNoiseTile.width, screenNoiseTile.height);
        for (let i = 0; i < img.data.length; i += 4) {
          const light = Math.random() > 0.5;
          img.data[i] = light ? 255 : 0;
          img.data[i + 1] = light ? 255 : 0;
          img.data[i + 2] = light ? 255 : 0;
          img.data[i + 3] = 5 + Math.floor(Math.random() * 8);
        }
        sctx.putImageData(img, 0, 0);
      }
      const paperTile = root.document.createElement('canvas');
      paperTile.width = 320;
      paperTile.height = 320;
      {
        const pctx = paperTile.getContext('2d');
        pctx.fillStyle = '#f4f1ea';
        pctx.fillRect(0, 0, paperTile.width, paperTile.height);
        for (let i = 0; i < 950; i++) {
          const x = Math.random() * paperTile.width;
          const y = Math.random() * paperTile.height;
          const r = 0.35 + Math.random() * 1.8;
          const a = 0.015 + Math.random() * 0.03;
          pctx.beginPath();
          pctx.fillStyle = `rgba(115, 102, 90, ${a.toFixed(3)})`;
          pctx.arc(x, y, r, 0, Math.PI * 2);
          pctx.fill();
        }
      }
      const halftoneTile = root.document.createElement('canvas');
      halftoneTile.width = 180;
      halftoneTile.height = 180;
      {
        const hctx = halftoneTile.getContext('2d');
        hctx.clearRect(0, 0, halftoneTile.width, halftoneTile.height);
        const step = 10;
        for (let y = 0; y < halftoneTile.height + step; y += step) {
          for (let x = 0; x < halftoneTile.width + step; x += step) {
            const rr = 0.7 + Math.random() * 1.15;
            hctx.beginPath();
            hctx.fillStyle = 'rgba(70, 62, 55, 0.18)';
            hctx.arc(x + (Math.random() - 0.5) * 1.4, y + (Math.random() - 0.5) * 1.4, rr, 0, Math.PI * 2);
            hctx.fill();
          }
        }
      }
      const inkSpeckleTile = root.document.createElement('canvas');
      inkSpeckleTile.width = 220;
      inkSpeckleTile.height = 220;
      {
        const ictx = inkSpeckleTile.getContext('2d');
        ictx.clearRect(0, 0, inkSpeckleTile.width, inkSpeckleTile.height);
        for (let i = 0; i < 420; i++) {
          const x = Math.random() * inkSpeckleTile.width;
          const y = Math.random() * inkSpeckleTile.height;
          const r = 0.25 + Math.random() * 0.95;
          const a = 0.035 + Math.random() * 0.12;
          ictx.beginPath();
          ictx.fillStyle = `rgba(42, 34, 28, ${a.toFixed(3)})`;
          ictx.arc(x, y, r, 0, Math.PI * 2);
          ictx.fill();
        }
        for (let i = 0; i < 90; i++) {
          const x = Math.random() * inkSpeckleTile.width;
          const y = Math.random() * inkSpeckleTile.height;
          const w = 0.6 + Math.random() * 2.6;
          const h = 0.45 + Math.random() * 1.5;
          ictx.save();
          ictx.translate(x, y);
          ictx.rotate((Math.random() - 0.5) * Math.PI);
          ictx.fillStyle = `rgba(35, 28, 23, ${(0.035 + Math.random() * 0.075).toFixed(3)})`;
          ictx.fillRect(-w / 2, -h / 2, w, h);
          ictx.restore();
        }
      }
      UtilsCore._odqFilmGrainTileCache = { grainTile, screenNoiseTile, paperTile, halftoneTile, inkSpeckleTile };
      return UtilsCore._odqFilmGrainTileCache;
    },
    /**
     * Matte / paper / halftone / grain composite matching synthetic reels (`createSyntheticQuiltMp4`).
     * @param {CanvasRenderingContext2D} ctx Destination bitmap sized to `(W,H)` coordinate space (see DPR scaling at call site).
     * @param {number} W Logical width (px)
     * @param {number} H Logical height (px)
     * @param {number} tSec Time offsets for seeded tile drift (seconds); use `0` for quilt overlay — static offsets.
     * @param {{ vignette?: boolean }} [opts] Set `vignette: false` for UI overlays (avoids edge darkening outside the quilt).
     */
    applyFilmGrain(ctx, W, H, tSec = 0, opts = null) {
      const o = opts && typeof opts === 'object' ? opts : {};
      const includeVignette = o.vignette !== false;
      const textureOnly = o.textureOnly === true;
      const ww = Math.max(1, Number(W));
      const hh = Math.max(1, Number(H));
      const sec = typeof tSec === 'number' && Number.isFinite(tSec) ? tSec : 0;
      const { grainTile, screenNoiseTile, paperTile, halftoneTile, inkSpeckleTile } = UtilsCore.getFilmGrainTileCanvases();

      if (textureOnly) {
        const noiseOffX = Math.floor((sec * 13) % screenNoiseTile.width);
        const noiseOffY = Math.floor((sec * 9) % screenNoiseTile.height);
        ctx.save();
        ctx.globalAlpha = 0.42;
        ctx.globalCompositeOperation = 'source-over';
        for (let y = -screenNoiseTile.height; y < hh + screenNoiseTile.height; y += screenNoiseTile.height) {
          for (let x = -screenNoiseTile.width; x < ww + screenNoiseTile.width; x += screenNoiseTile.width) {
            ctx.drawImage(screenNoiseTile, x - noiseOffX, y - noiseOffY);
          }
        }
        ctx.globalAlpha = 0.26;
        for (let y = -inkSpeckleTile.height; y < hh + inkSpeckleTile.height; y += inkSpeckleTile.height) {
          for (let x = -inkSpeckleTile.width; x < ww + inkSpeckleTile.width; x += inkSpeckleTile.width) {
            ctx.drawImage(inkSpeckleTile, x + 7, y - 5);
          }
        }
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.globalAlpha = 0.14;
      /* First pass must not use `multiply` on a transparent destination — WebKit/WKWebView
         keeps the buffer fully transparent and the whole overlay disappears (desktop often still shows grain). */
      ctx.globalCompositeOperation = 'source-over';
      const wash = ctx.createLinearGradient(0, 0, 0, hh);
      wash.addColorStop(0, '#f1ece3');
      wash.addColorStop(0.5, '#f4efe7');
      wash.addColorStop(1, '#eee6db');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, ww, hh);
      ctx.restore();

      const paperOffX = Math.floor((sec * 3) % paperTile.width);
      const paperOffY = Math.floor((sec * 2) % paperTile.height);
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.globalCompositeOperation = 'multiply';
      for (let y = -paperTile.height; y < hh + paperTile.height; y += paperTile.height) {
        for (let x = -paperTile.width; x < ww + paperTile.width; x += paperTile.width) {
          ctx.drawImage(paperTile, x - paperOffX, y - paperOffY);
        }
      }
      ctx.restore();

      const halfOffX = Math.floor((sec * 7) % halftoneTile.width);
      const halfOffY = Math.floor((sec * 5) % halftoneTile.height);
      ctx.save();
      ctx.globalAlpha = 0.072;
      ctx.globalCompositeOperation = 'multiply';
      for (let y = -halftoneTile.height; y < hh + halftoneTile.height; y += halftoneTile.height) {
        for (let x = -halftoneTile.width; x < ww + halftoneTile.width; x += halftoneTile.width) {
          ctx.drawImage(halftoneTile, x - halfOffX, y - halfOffY);
        }
      }
      ctx.restore();

      const inkOffX = Math.floor((sec * 5) % inkSpeckleTile.width);
      const inkOffY = Math.floor((sec * 4) % inkSpeckleTile.height);
      ctx.save();
      ctx.globalAlpha = 0.085;
      ctx.globalCompositeOperation = 'multiply';
      for (let y = -inkSpeckleTile.height; y < hh + inkSpeckleTile.height; y += inkSpeckleTile.height) {
        for (let x = -inkSpeckleTile.width; x < ww + inkSpeckleTile.width; x += inkSpeckleTile.width) {
          ctx.drawImage(inkSpeckleTile, x - inkOffX, y - inkOffY);
        }
      }
      ctx.restore();

      const offX = Math.floor((sec * 18) % grainTile.width);
      const offY = Math.floor((sec * 11) % grainTile.height);
      ctx.save();
      ctx.globalAlpha = 0.055;
      ctx.globalCompositeOperation = 'soft-light';
      for (let y = -grainTile.height; y < hh + grainTile.height; y += grainTile.height) {
        for (let x = -grainTile.width; x < ww + grainTile.width; x += grainTile.width) {
          ctx.drawImage(grainTile, x - offX, y - offY);
        }
      }
      ctx.restore();

      if (includeVignette) {
        ctx.save();
        const vignette = ctx.createRadialGradient(
          ww * 0.5,
          hh * 0.5,
          Math.min(ww, hh) * 0.2,
          ww * 0.5,
          hh * 0.5,
          Math.max(ww, hh) * 0.72
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(36,28,20,0.12)');
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, ww, hh);
        ctx.restore();
      }
    },
    /**
     * Canvas clip region matching visible block polygons on `#quilt` (fills with `data-block-id`).
     * Keeps grain / wash off letterboxed SVG margins — pairs with `{ vignette: false }`.
     * Uses `getScreenCTM()` into `#quiltFilmGrainOverlay`'s bbox so clipping matches rotated / nested groups (viewBox math alone can push the path off-canvas).
     */
    buildQuiltGrainClipPathFromSvg(svgEl, wPx, hPx) {
      const svg = typeof svgEl === 'string' ? root.document.querySelector(svgEl) : svgEl;
      if (!svg || typeof svg.createSVGPoint !== 'function') return null;
      const ww = Math.max(1, Number(wPx));
      const hh = Math.max(1, Number(hPx));
      let polys;
      try {
        polys = svg.querySelectorAll('polygon[data-block-id]:not([fill*="url"])');
      } catch (_) {
        return null;
      }
      if (!polys || polys.length === 0) return null;

      const grainCanvas =
        typeof document !== 'undefined' ? root.document.getElementById('quiltFilmGrainOverlay') : null;
      const cr =
        grainCanvas && typeof grainCanvas.getBoundingClientRect === 'function'
          ? grainCanvas.getBoundingClientRect()
          : null;
      if (!cr || cr.width <= 0 || cr.height <= 0) return null;

      try {
        const path = new Path2D();
        const svgPt = svg.createSVGPoint();
        let any = false;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let pi = 0; pi < polys.length; pi++) {
          const poly = polys[pi];
          const raw = poly.getAttribute('points');
          if (!raw) continue;
          const nums = [];
          const tokens = raw.trim().split(/[, \t\n\r]+/).filter(Boolean);
          for (const t of tokens) {
            const n = parseFloat(t);
            if (!Number.isFinite(n)) continue;
            nums.push(n);
          }
          if (nums.length < 6) continue;
          const screenM =
            typeof poly.getScreenCTM === 'function' ? poly.getScreenCTM() : null;
          if (!screenM) continue;

          for (let i = 0; i + 1 < nums.length; i += 2) {
            svgPt.x = nums[i];
            svgPt.y = nums[i + 1];
            const rp = svgPt.matrixTransform(screenM);
            const cx = ((rp.x - cr.left) / cr.width) * ww;
            const cy = ((rp.y - cr.top) / cr.height) * hh;
            if (i === 0) path.moveTo(cx, cy);
            else path.lineTo(cx, cy);
            minX = Math.min(minX, cx);
            maxX = Math.max(maxX, cx);
            minY = Math.min(minY, cy);
            maxY = Math.max(maxY, cy);
          }
          path.closePath();
          any = true;
        }
        if (!any) return null;
        /* Bad CTM / layout on WKWebView can park every point off-canvas — clip would drop the whole overlay. */
        const pad = Math.max(ww, hh) * 0.75;
        if (maxX < -pad || minX > ww + pad || maxY < -pad || minY > hh + pad) {
          return null;
        }
        return path;
      } catch (_) {
        return null;
      }
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
