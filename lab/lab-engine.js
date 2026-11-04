/* Quilt Lab engine v0 — standalone. Builds a mirrored, improvisational composition from an ordered list of colors.
 * Never touches the app, Firestore, or the production engine. */
(function (root) {
  'use strict';
  const W = 1000, H = 2050, CX = W / 2; // phone-like portrait (~0.49), matching the in-app quilt

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function makeNoise(seed) {
    const lat = (ix, iy) => { let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1; };
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y, cell) => {
      const gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy);
      const fx = sm(gx - ix), fy = sm(gy - iy);
      const a = lat(ix, iy), b = lat(ix + 1, iy), c = lat(ix, iy + 1), d = lat(ix + 1, iy + 1);
      return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };
  }

  const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function shade(hex, f) { const [r, g, b] = hexToRgb(hex); return rgbToHex(r + (f > 0 ? (255 - r) * f : r * f), g + (f > 0 ? (255 - g) * f : g * f), b + (f > 0 ? (255 - b) * f : b * f)); }

  // perceptual color distance (CIE Lab, deltaE76) so medallion roles never blur together
  function labOf(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }
  const dE = (a, b) => { const A = labOf(a), B = labOf(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  // pick `count` strongly contrasting colors from the day (farthest-point sampling), padding with light/dark tints if the day is too uniform
  function contrastPalette(colors, count, startIdx) {
    const uniq = Array.from(new Set(colors));
    const pal = [uniq[Math.min(uniq.length - 1, startIdx)]];
    while (pal.length < count) {
      let bestC = null, bestD = -1;
      uniq.forEach((c) => { if (pal.includes(c)) return; const d = Math.min(...pal.map((q) => dE(c, q))); if (d > bestD) { bestD = d; bestC = c; } });
      if (!bestC || bestD < 24) { const base = pal[pal.length % pal.length]; const tint = shade(base, pal.length % 2 ? 0.55 : -0.5); pal.push(tint); } else pal.push(bestC);
    }
    return pal;
  }

  // ---- geometry helpers: quads are [P00,P10,P11,P01] in (u,v) order
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const bil = (q, u, v) => { const top = lerp(q[0], q[1], u), bot = lerp(q[3], q[2], u); return lerp(top, bot, v); };
  const area = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---- unit-square pattern libraries -> [{pts:[[u,v]..], c:index}]
  function discPts(cx, cy, r, n, rnd) { const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const rr = r * (1 + (rnd() - 0.5) * 0.06); out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return out; }
  const PATTERNS = {
    hst: (rnd) => { const f = rnd() < 0.5; return f ? [{ pts: [[0, 0], [1, 0], [1, 1]], c: 1 }, { pts: [[0, 0], [1, 1], [0, 1]], c: 0 }] : [{ pts: [[0, 0], [1, 0], [0, 1]], c: 1 }, { pts: [[1, 0], [1, 1], [0, 1]], c: 0 }]; },
    pinwheel: () => { const out = []; const m = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]; [[0, 0, 0], [1, 0, 1], [0, 1, 2], [1, 1, 3]].forEach(([i, j, k]) => { const x0 = i * 0.5, y0 = j * 0.5, s = 0.5; const t = k % 2 ? [[x0, y0], [x0 + s, y0], [x0, y0 + s]] : [[x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]]; const t2 = k % 2 ? [[x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]] : [[x0, y0], [x0 + s, y0], [x0, y0 + s]]; out.push({ pts: t, c: 1 }, { pts: t2, c: 0 }); }); return out; },
    ninePatch: () => { const out = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push({ pts: [[i / 3, j / 3], [(i + 1) / 3, j / 3], [(i + 1) / 3, (j + 1) / 3], [i / 3, (j + 1) / 3]], c: (i + j) % 2 === 0 ? 1 : 0 }); return out; },
    railFence: (rnd) => { const vert = rnd() < 0.5; const out = []; for (let i = 0; i < 3; i++) out.push({ pts: vert ? [[i / 3, 0], [(i + 1) / 3, 0], [(i + 1) / 3, 1], [i / 3, 1]] : [[0, i / 3], [1, i / 3], [1, (i + 1) / 3], [0, (i + 1) / 3]], c: i % 2 === 0 ? 0 : 1 }); return out; },
    flyingGeese: (rnd, k) => { const n = Math.max(2, Math.min(5, k || 3)); const out = [{ pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: 0 }]; for (let i = 0; i < n; i++) { const x0 = i / n, x1 = (i + 1) / n; out.push({ pts: [[x0, 1], [x1, 1], [(x0 + x1) / 2, 0]], c: 1 }); } return out; },
    logCabin: () => { const out = [{ pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: 0 }]; let x0 = 0.38, y0 = 0.38, x1 = 0.62, y1 = 0.62; out.push({ pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], c: 1 }); let ci = 0; for (let r = 0; r < 3; r++) { const g = 0.12; const c = ci++ % 2; out.push({ pts: [[x0 - g, y0 - g], [x1 + g, y0 - g], [x1 + g, y0], [x0 - g, y0]], c }, { pts: [[x1, y0 - g], [x1 + g, y0 - g], [x1 + g, y1 + g], [x1, y1 + g]], c }, { pts: [[x0 - g, y1], [x1 + g, y1], [x1 + g, y1 + g], [x0 - g, y1 + g]], c }, { pts: [[x0 - g, y0 - g], [x0, y0 - g], [x0, y1 + g], [x0 - g, y1 + g]], c }); x0 -= g; y0 -= g; x1 += g; y1 += g; } return out.map((p) => ({ pts: p.pts.map(([a, b]) => [Math.max(0, Math.min(1, a)), Math.max(0, Math.min(1, b))]), c: p.c })); },
    circle: (rnd) => [{ pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: 0 }, { pts: discPts(0.5, 0.5, 0.4, 28, rnd), c: 1 }],
    diamond: () => [{ pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: 0 }, { pts: [[0.5, 0.06], [0.94, 0.5], [0.5, 0.94], [0.06, 0.5]], c: 1 }],
    drunkard: (rnd) => { const q = (cx, cy) => ({ pts: [[cx ? 1 : 0, cy ? 1 : 0], ...Array.from({ length: 10 }, (_, i) => { const a = (i / 9) * Math.PI / 2; return [(cx ? 1 : 0) + (cx ? -1 : 1) * Math.cos(a) * 0.62, (cy ? 1 : 0) + (cy ? -1 : 1) * Math.sin(a) * 0.62]; })], c: 1 }); return [{ pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: 0 }, q(0, 0), q(1, 1)]; }
  };
  const SQUARISH = ['hst', 'pinwheel', 'ninePatch', 'logCabin', 'circle', 'diamond', 'drunkard', 'railFence'];

  function buildBigTop(colors, opts) {
    opts = opts || {};
    const seed = (opts.seed != null ? opts.seed : 1) >>> 0;
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    const n = colors.length;
    const out = { W, H, shapes: [], cells: 0 };
    if (!n) return out;

    const mrnd = mulberry32(seed ^ 0x7777aaaa);
    let kind = opts.center && opts.center !== 'auto' ? opts.center : null;
    if (!kind) { const r = mrnd(); kind = r < 0.12 ? 'none' : r < 0.24 ? 'star' : r < 0.32 ? 'small' : r < 0.37 ? 'spine' : r < 0.42 ? 'pair' : r < 0.54 ? 'dresden' : r < 0.66 ? 'flower' : r < 0.78 ? 'wreath' : r < 0.9 ? 'bullseye' : 'nine'; }
    if (kind === 'pair' && !(opts.center === 'pair') && mulberry32(seed ^ 0x1234abcd)() < 0.5) kind = 'pairv';
    out.center = kind;
    const MODERN = kind === 'nine';

    // left half as one big quad (slightly overlapping the center seam)
    const mkCell = (q, c, ci) => ({ q, color: c, ci, locked: false, a: area(q) });
    let cells = [mkCell([[0, 0], [CX, 0], [CX, H], [0, H]], colors[0], 0)];

    const pPattern = MODERN ? Math.min(0.1, opts.patternRate != null ? opts.patternRate : 0.5) : (opts.patternRate != null ? opts.patternRate : 0.5); // modern designs: calmer, plainer patchwork
    for (let i = 1; i < n; i++) {
      const cand = cells.filter((c) => !c.locked && c.a > 2400);
      if (!cand.length) break;
      let tot = 0; const wts = cand.map((c) => { const w = Math.pow(c.a, 1.35); tot += w; return w; });
      let r = rnd() * tot, pick = cand[cand.length - 1];
      for (let k = 0; k < cand.length; k++) { r -= wts[k]; if (r <= 0) { pick = cand[k]; break; } }
      const q = pick.q;
      const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
      const vertical = w >= h * (0.85 + rnd() * 0.3);
      const t = 0.34 + rnd() * 0.32, t2 = Math.max(0.2, Math.min(0.8, t + (rnd() - 0.5) * 0.3));
      let A, B;
      if (vertical) { const top = lerp(q[0], q[1], t), bot = lerp(q[3], q[2], t2); A = [q[0], top, bot, q[3]]; B = [top, q[1], q[2], bot]; }
      else { const l = lerp(q[0], q[3], t), rgt = lerp(q[1], q[2], t2); A = [q[0], q[1], rgt, l]; B = [l, rgt, q[2], q[3]]; }
      const cA = mkCell(A, pick.color, pick.ci), cB = mkCell(B, colors[i], i);
      cells.splice(cells.indexOf(pick), 1, cA, cB);
      // maybe turn one of the new halves into a traditional block built from the two colors
      [cA, cB].forEach((c) => {
        if (c.locked || rnd() > pPattern) return;
        const share = c.a / (CX * H);
        if (share < 0.008 || share > 0.16) return;
        const cw = (dist(c.q[0], c.q[1]) + dist(c.q[3], c.q[2])) / 2, ch = (dist(c.q[0], c.q[3]) + dist(c.q[1], c.q[2])) / 2;
        const asp = Math.max(cw, ch) / Math.min(cw, ch);
        let type;
        if (asp > 1.8) type = 'flyingGeese'; else type = SQUARISH[Math.floor(rnd() * SQUARISH.length)];
        if (asp > 1.8 && cw < ch) type = 'railFence';
        c.locked = true; c.pattern = type; c.pcolors = [cA === c ? cB.color : cA.color, c.color]; c.prnd = mulberry32((rnd() * 4294967296) >>> 0);
        c.pcolors = [pick.color, colors[i]]; c.pci = [pick.ci, i];
        if (c === cA) { c.pcolors = [colors[i], pick.color]; c.pci = [i, pick.ci]; }
      });
    }
    out.cells = cells.length;

    // expand to shapes in the left half, then mirror
    const shapesL = [];
    cells.forEach((c) => {
      if (!c.pattern) { shapesL.push({ pts: c.q, fill: c.color, ci: c.ci }); return; }
      const pieces = (c.pattern === 'flyingGeese' ? PATTERNS.flyingGeese(c.prnd, Math.round(Math.max(dist(c.q[0], c.q[1]), dist(c.q[3], c.q[2])) / 90)) : PATTERNS[c.pattern](c.prnd));
      pieces.forEach((p) => shapesL.push({ pts: p.pts.map(([u, v]) => bil(c.q, u, v)), fill: c.pcolors[p.c], ci: c.pci[p.c] }));
    });
    const mirrored = shapesL.map((s) => ({ pts: s.pts.map(([x, y]) => [W - x, y]), fill: s.fill, ci: s.ci }));

    // center motif: varies by day/seed so not every quilt gets the big star
    const med = [];
    const medPal = contrastPalette(colors, 7, Math.floor(mrnd() * n)); // strongly contrasting, drawn from across the day
    const cc = (k) => medPal[((k % 7) + 7) % 7];
    const diamond = (cx, cy, rad, fill) => med.push({ pts: Array.from({ length: 4 }, (_, i) => { const a = Math.PI / 4 + (i * Math.PI) / 2; return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]; }), fill });
    const disc = (cx, cy, rad, fill) => med.push({ pts: discPts(cx, cy, rad, 32, mrnd), fill });
    const starAt = (cx, cy, rad, fill) => med.push({ pts: Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 ? rad * 0.5 : rad; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; }), fill });
    const medallion = (cx, cy, base, k0) => { diamond(cx, cy, base * 1.38, cc(k0 + 1)); diamond(cx, cy, base * 1.08, cc(k0 + 2)); diamond(cx, cy, base * 0.78, cc(k0 + 3)); disc(cx, cy, base * 0.46, cc(k0)); starAt(cx, cy, base * 0.4, cc(k0 + 2)); };
    // organic / circular quilt motifs
    const place = (cx, cy, ang, d, local) => local.map(([x, y]) => { const px = x + d; return [cx + px * Math.cos(ang) - y * Math.sin(ang), cy + px * Math.sin(ang) + y * Math.cos(ang)]; });
    const lens = (len, wid, steps) => { const top = [], bot = []; for (let i = 0; i <= steps; i++) { const u = -1 + (2 * i) / steps; const v = wid * (1 - u * u); top.push([u * len, -v]); bot.unshift([u * len, v]); } return top.concat(bot.slice(1, -1)); };
    const petalShape = (len, wid) => Array.from({ length: 28 }, (_, i) => { const t = (i / 28) * Math.PI * 2; return [Math.cos(t) * len, Math.sin(t) * wid * (1 + 0.12 * Math.cos(t))]; });
    const dresden = (cx, cy, R, blades, cA, cB, cHub) => {
      const r0 = R * 0.3, step = (Math.PI * 2) / blades;
      for (let i = 0; i < blades; i++) {
        const a0 = i * step - Math.PI / 2 - step / 2, a1 = a0 + step, pts = [];
        pts.push([cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0], [cx + Math.cos(a0) * R * 0.92, cy + Math.sin(a0) * R * 0.92]);
        for (let k = 1; k < 6; k++) { const a = a0 + (step * k) / 6; const rr = R * (0.92 + 0.12 * Math.sin((k / 6) * Math.PI)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
        pts.push([cx + Math.cos(a1) * R * 0.92, cy + Math.sin(a1) * R * 0.92], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0]);
        med.push({ pts, fill: i % 2 ? cA : cB });
      }
      disc(cx, cy, r0 * 1.12, cHub); disc(cx, cy, r0 * 0.62, cA);
    };
    const flower = (cx, cy, R, petals, cP, cQ, cHub, cLeaf) => {
      for (let k = 0; k < 2; k++) { const a = Math.PI / 2 + (k ? 1 : -1) * 0.95; med.push({ pts: place(cx, cy + R * 0.55, a, R * 0.62, lens(R * 0.42, R * 0.17, 14)), fill: cLeaf }); }
      for (let i = 0; i < petals; i++) { const a = (i / petals) * Math.PI * 2 - Math.PI / 2; med.push({ pts: place(cx, cy, a, R * 0.52, petalShape(R * 0.42, R * 0.2)), fill: i % 2 ? cP : cQ }); }
      disc(cx, cy, R * 0.3, cHub); disc(cx, cy, R * 0.16, cP);
    };
    const wreath = (cx, cy, R, leaves, cL, cM, cHub) => {
      disc(cx, cy, R * 0.98, cHub);
      for (let i = 0; i < leaves; i++) { const a = (i / leaves) * Math.PI * 2; med.push({ pts: place(cx, cy, a + 0.0, R * 0.74, lens(R * 0.2, R * 0.075, 10).map(([x, y]) => [y, x])), fill: i % 2 ? cL : cM }); }
      for (let i = 0; i < leaves; i++) { const a = ((i + 0.5) / leaves) * Math.PI * 2; disc(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92, R * 0.06, cM); }
      starAt(cx, cy, R * 0.36, cM); disc(cx, cy, R * 0.12, cL);
    };
    const bullseye = (cx, cy, R, cs) => {
      const waves = 16, ring = (rad, fill, amp) => med.push({ pts: Array.from({ length: 96 }, (_, i) => { const a = (i / 96) * Math.PI * 2; const rr = rad * (1 + amp * Math.sin(a * waves)); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; }), fill });
      ring(R, cs[0], 0.045); ring(R * 0.8, cs[1], 0.03); ring(R * 0.6, cs[2], 0.02); ring(R * 0.4, cs[3], 0.0); disc(cx, cy, R * 0.2, cs[0]);
    };
    const baseBig = Math.min(W, H) * (0.2 + Math.min(0.06, n * 0.0012));
    // integrating frame: field + two-color sawtooth band (now the default), so the medallion is set INTO the quilt
    const frameOn = opts.frame !== 'off';
    const frameAt = (cx, cy, R0) => {
      const N = 28, Ro = R0 * 1.2, P = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      disc(cx, cy, R0 * 1.01, cc(5)); med[med.length - 1].field = true;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2, a2 = ((i + 2) / N) * Math.PI * 2, am2 = (a1 + a2) / 2;
        med.push({ pts: [P(a0, R0), P(a1, R0), P(am, Ro)], fill: cc(6), slot: true });
        med.push({ pts: [P(am, Ro), P(am2, Ro), P(a1, R0)], fill: cc(2), slot: true });
      }
    };
    // round motifs: radius of the field (R0, at scale 1), default vertical position, and a draw(cx,cy,k) at scale k
    const KINDS = {
      star: { R0: baseBig * 1.42, fy: 0.42, draw: (cx, cy, k) => medallion(cx, cy, baseBig * k, 0) },
      small: { R0: baseBig * 0.74, fy: 0.5, draw: (cx, cy, k) => { const b = baseBig * 0.5 * k; diamond(cx, cy, b * 1.4, cc(2)); disc(cx, cy, b * 0.8, cc(1)); starAt(cx, cy, b * 0.55, cc(3)); } },
      dresden: { R0: baseBig * 1.45 * 1.14, fy: 0.44, draw: (cx, cy, k) => dresden(cx, cy, baseBig * 1.45 * k, 16, cc(1), cc(2), cc(3)) },
      flower: { R0: baseBig * 1.55 * 1.02, fy: 0.44, draw: (cx, cy, k) => flower(cx, cy, baseBig * 1.55 * k, 8, cc(1), cc(2), cc(3), cc(4)) },
      wreath: { R0: baseBig * 1.5 * 1.12, fy: 0.44, draw: (cx, cy, k) => wreath(cx, cy, baseBig * 1.5 * k, 14, cc(1), cc(2), cc(3)) },
      bullseye: { R0: baseBig * 1.4 * 1.1, fy: 0.44, draw: (cx, cy, k) => bullseye(cx, cy, baseBig * 1.4 * k, [cc(1), cc(2), cc(3), cc(4)]) }
    };
    const K = KINDS[kind];
    const prnd = mulberry32(seed ^ 0x3c3c1f1f);
    const sizeMap = { small: 0.68, medium: 0.95, large: 1.2 };
    const sc0 = opts.size && opts.size !== 'auto' ? sizeMap[opts.size] : 0.62 + prnd() * 0.58;
    let plc0 = opts.place && opts.place !== 'auto' ? opts.place : null;
    if (!plc0) { const r = prnd(); plc0 = r < 0.4 ? 'center' : r < 0.62 ? 'sides' : r < 0.78 ? 'top' : r < 0.9 ? 'bottom' : 'topbottom'; }
    const sideY = H * (0.3 + prnd() * 0.4);
    const bg0 = shapesL.concat(mirrored);
    const sumBy = (arr) => { const m = {}; arr.forEach((sh) => { m[sh.ci] = (m[sh.ci] || 0) + area(sh.pts); }); return m; };
    const base0 = sumBy(bg0);
    const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const split = (poly, a, b) => {
      const ins = [], outs = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], cp = cross(a, b, p), cq = cross(a, b, q);
        if (cp >= 0) ins.push(p); else outs.push(p);
        if ((cp >= 0) !== (cq >= 0)) { const t = cp / (cp - cq), x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; ins.push(x); outs.push(x); }
      }
      return { ins, outs };
    };
    const circlePoly = (cx, cy, R) => Array.from({ length: 72 }, (_, i) => { const a = (i / 72) * Math.PI * 2; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
    const sqPoly = (cx, cy, rad) => Array.from({ length: 4 }, (_, i) => { const a = Math.PI / 4 + (i * Math.PI) / 2; return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]; });
    // draw the medallion for (placement, scale) into `med`; return the convex outlines the patchwork is cut against
    const buildMed = (plc, sc) => {
      med.length = 0; const clips = [];
      if (n < 4 || kind === 'none') return clips;
      if (K) {
        const pl = [];
        if (plc === 'center') pl.push([CX, H * K.fy, sc]);
        else { const e = sc * 1.1; if (plc === 'sides') pl.push([0, sideY, e], [W, sideY, e]); if (plc === 'top' || plc === 'topbottom') pl.push([CX, H * 0.01, e]); if (plc === 'bottom' || plc === 'topbottom') pl.push([CX, H * 0.99, e]); }
        pl.forEach(([cx, cy, k]) => { if (frameOn) { clips.push(circlePoly(cx, cy, K.R0 * k * 1.2)); frameAt(cx, cy, K.R0 * k); } else clips.push(circlePoly(cx, cy, K.R0 * k)); K.draw(cx, cy, k); });
      } else if (kind === 'spine') {
        [0.17, 0.5, 0.83].forEach((fy, i) => { const b = Math.min(W, H) * (i === 1 ? 0.075 : 0.055) * sc; clips.push(sqPoly(CX, H * fy, b * 1.5)); diamond(CX, H * fy, b * 1.5, cc(i + 1)); disc(CX, H * fy, b * 0.8, cc(i + 2)); });
      } else if (kind === 'pair') {
        [W * 0.27, W * 0.73].forEach((x) => { const b = baseBig * 0.52 * sc; clips.push(sqPoly(x, H * 0.45, b * 1.4)); diamond(x, H * 0.45, b * 1.4, cc(1)); diamond(x, H * 0.45, b * 1.0, cc(2)); disc(x, H * 0.45, b * 0.6, cc(3)); });
      } else if (MODERN) {
        // modern: flat, bold geometry with a thin contrasting outline so it reads against the patchwork
        const cy = H * 0.46, rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], half = (r, y) => Array.from({ length: 28 }, (_, i) => { const a = Math.PI + (i / 27) * Math.PI; return [CX + Math.cos(a) * r, y + Math.sin(a) * r]; });
        const outline = (poly, pad) => { clips.push(poly); med.push({ pts: poly, fill: cc(0), noSlot: true }); };
        if (kind === 'nine') {
          // nine-patch medallion: a 3x3 block of squares — field corners, a vertical and a horizontal bar, and a center square
          const c = baseBig * 0.64 * sc, x0 = CX - 1.5 * c, y0 = cy - 1.5 * c, sq = (i, j) => [[x0 + i * c, y0 + j * c], [x0 + (i + 1) * c, y0 + j * c], [x0 + (i + 1) * c, y0 + (j + 1) * c], [x0 + i * c, y0 + (j + 1) * c]];
          clips.push(rect(x0 - c, y0 - c, x0 + 4 * c, y0 + 4 * c));
          med.push({ pts: rect(x0 - c, y0 - c, x0 + 4 * c, y0 + 4 * c), fill: cc(4), noSlot: true, frame: true }); // frame as thick as one block
          for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
            const corner = i !== 1 && j !== 1, center = i === 1 && j === 1;
            med.push({ pts: sq(i, j), fill: corner ? cc(0) : center ? cc(3) : (j === 1 ? cc(1) : cc(2)), corner, noSlot: corner, cell: [x0 + i * c, y0 + j * c, c] });
          }
        }
      } else if (kind === 'pairv') {
        [H * 0.27, H * 0.73].forEach((y) => { const b = baseBig * 0.6 * sc; clips.push(sqPoly(CX, y, b * 1.4)); diamond(CX, y, b * 1.4, cc(1)); diamond(CX, y, b * 1.0, cc(2)); disc(CX, y, b * 0.6, cc(3)); starAt(CX, y, b * 0.4, cc(4)); });
      }
      if (!K) med.forEach((m) => { m.slot = !m.noSlot; });
      return clips;
    };
    const cutAll = (clips) => {
      let shapes = bg0;
      clips.forEach((clip) => {
        const M = clip.length, cut = [];
        shapes.forEach((sh) => {
          let rem = sh.pts;
          for (let i = 0; i < M && rem.length >= 3; i++) {
            const r = split(rem, clip[i], clip[(i + 1) % M]);
            if (r.outs.length >= 3 && area(r.outs) > 0.5) cut.push({ pts: r.outs, fill: sh.fill, ci: sh.ci });
            rem = r.ins;
          }
        });
        shapes = cut;
      });
      return shapes;
    };
    // NON-NEGOTIABLE: every submitted color must stay clearly visible.
    // Colors whose patchwork gets mostly covered are woven into the medallion's own frame pieces, so they still show.
    const MIN_VISIBLE = 0.6;
    const ratios = (shapes) => { const v = sumBy(shapes), r = {}; Object.keys(base0).forEach((k) => { r[k] = (v[k] || 0) / base0[k]; }); return r; };
    const places = K ? [plc0].concat(['center', 'sides', 'top', 'bottom'].filter((x) => x !== plc0)) : ['center'];
    const scales = [1, 0.85, 0.72, 0.6, 0.5].map((f) => Math.max(0.36, sc0 * f));
    let bgShapes = bg0, chosen = null, best = null;
    outer: for (const plc of places) for (const sc of scales) {
      const clips = buildMed(plc, sc), cut = cutAll(clips), r = ratios(cut);
      const hidden = Object.keys(r).filter((k) => r[k] < MIN_VISIBLE).map(Number);
      const slots = med.filter((m) => m.slot);
      if (hidden.length > (kind === 'nine' ? 8 : Math.min(slots.length, 8))) continue;
      const cand = { plc, sc, cut, hidden, medCopy: med.slice(), clips };
      if (!best || hidden.length < best.hidden.length) best = cand;
      if (hidden.length <= 2) { chosen = cand; break outer; }
    }
    if (!chosen) chosen = best;
    if (chosen) {
      bgShapes = chosen.cut; med.length = 0; chosen.medCopy.forEach((m) => med.push(m));
      if (chosen.hidden.length) {
        const slots = med.filter((m) => m.slot);
        if (kind === 'nine') {
          // keep the plus on its ground; show hidden colors as pieced strips in the four corner squares
          const h = chosen.hidden, mStrips = Math.ceil(h.length / 4), corners = med.filter((m) => m.corner), rest = med.filter((m) => !m.corner);
          const fr = rest.filter((m) => m.frame), inner = rest.filter((m) => !m.frame), strips = [];
          corners.forEach((m, ci) => { const [cx0, cy0, cs] = m.cell; for (let t = 0; t < mStrips; t++) { const x1 = cx0 + (t * cs) / mStrips, x2 = cx0 + ((t + 1) * cs) / mStrips; strips.push({ pts: [[x1, cy0], [x2, cy0], [x2, cy0 + cs], [x1, cy0 + cs]], fill: colors[h[(ci * mStrips + t) % h.length]] }); } });
          med.length = 0; fr.concat(strips, inner).forEach((m) => med.push(m));
        } else if (K) slots.forEach((m, j) => { m.fill = colors[chosen.hidden[j % chosen.hidden.length]]; });
        else slots.slice().sort((x, y) => area(y.pts) - area(x.pts)).slice(0, chosen.hidden.length).forEach((m, j) => { m.fill = colors[chosen.hidden[j]]; });
        const hc = chosen.hidden.map((i) => colors[i]);
        med.filter((m) => m.field).forEach((m) => { let bc = m.fill, bd = -1; medPal.concat(colors).forEach((c) => { const d = Math.min(...hc.map((q) => dE(c, q))); if (d > bd) { bd = d; bc = c; } }); if (bd < 30) bc = shade(bc, hc.every((q) => labOf(q)[0] > 55) ? -0.55 : 0.55); m.fill = bc; });
      }
      chosen.plcName = chosen.plc;
    } else { med.length = 0; bgShapes = bg0; chosen = { plc: 'none', sc: 0, hidden: [] }; }
    out.place = chosen.plc === 'none' ? 'center' : chosen.plc; out.size = chosen.sc; out.frame = !!(K && frameOn && chosen.plc !== 'none' && n >= 4);
    out.hiddenRescued = chosen.hidden.length; out.dropped = chosen.plc === 'none' && kind !== 'none' && n >= 4;
    const all = bgShapes.concat(med);
    // fabric-like tone variation (seeded, per shape)
    const vr = mulberry32(seed ^ 0x51ed270b);
    all.forEach((s) => { s.fill = shade(s.fill, (vr() - 0.5) * 0.07); });

    // organic warp: smooth, mirror-consistent, continuous (so shared edges stay closed)
    const nz = makeNoise(seed ^ 0xabcdef), amp = opts.wonk != null ? opts.wonk : 1;
    const warp = ([x, y]) => {
      const ax = Math.abs(x - CX), s = x >= CX ? 1 : -1, fade = Math.min(1, ax / 70);
      const dx = (nz(ax, y, 230) * 15 + nz(ax + 500, y, 70) * 4) * s * fade * amp;
      const dy = (nz(ax + 900, y, 230) * 13 + nz(ax + 1300, y, 80) * 3.5) * amp;
      const ex = nz(x + 2000, y, 120) * 1.6 * amp, ey = nz(x + 3000, y, 120) * 1.6 * amp;
      return [x + dx + ex, y + dy + ey];
    };
    const subdivide = (pts, maxSeg) => { const res = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const k = Math.max(1, Math.ceil(dist(a, b) / maxSeg)); for (let j = 0; j < k; j++) res.push(lerp(a, b, j / k)); } return res; };
    out.shapes = all.map((s) => ({ pts: subdivide(s.pts, 16).map(warp), fill: s.fill }));
    return out;
  }


  // ---------- other style recipes (every submitted color is guaranteed its own visible block) ----------
  function subdividePts(pts, maxSeg) { const res = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const k = Math.max(1, Math.ceil(dist(a, b) / maxSeg)); for (let j = 0; j < k; j++) res.push(lerp(a, b, j / k)); } return res; }
  function flatWarp(seed, amp) {
    const nz = makeNoise(seed ^ 0xabcdef);
    return ([x, y]) => [x <= 0.5 ? -4 : x >= W - 0.5 ? W + 4 : x + (nz(x, y, 260) * 16 + nz(x + 700, y, 80) * 4) * amp, y <= 0.5 ? -4 : y >= H - 0.5 ? H + 4 : y + (nz(x + 1400, y, 260) * 14 + nz(x + 2100, y, 90) * 3.5) * amp];
  }
  // axis-aligned or slanted binary space partition over the whole canvas; colors[i] takes one side of the i-th cut
  function bspFull(colors, rnd, o) {
    let cells = [{ q: [[0, 0], [W, 0], [W, H], [0, H]], color: colors[0], born: 0 }];
    cells[0].a = area(cells[0].q);
    for (let i = 1; i < colors.length; i++) {
      const cand = cells.filter((c) => c.a > 2600);
      if (!cand.length) break;
      let tot = 0; const wts = cand.map((c) => { const w = Math.pow(c.a, o.areaPow) * (i - c.born < o.recent ? o.recentBoost : 1); tot += w; return w; });
      let r = rnd() * tot, pick = cand[cand.length - 1];
      for (let k = 0; k < cand.length; k++) { r -= wts[k]; if (r <= 0) { pick = cand[k]; break; } }
      const q = pick.q;
      const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
      const vertical = w >= h * (0.9 + rnd() * 0.2);
      const t = o.ratio(rnd), t2 = o.slant ? Math.max(0.15, Math.min(0.85, t + (rnd() - 0.5) * o.slant)) : t;
      let A, B;
      if (vertical) { const top = lerp(q[0], q[1], t), bot = lerp(q[3], q[2], t2); A = [q[0], top, bot, q[3]]; B = [top, q[1], q[2], bot]; }
      else { const l = lerp(q[0], q[3], t), rgt = lerp(q[1], q[2], t2); A = [q[0], q[1], rgt, l]; B = [l, rgt, q[2], q[3]]; }
      const newOnA = rnd() < 0.5;
      const cA = { q: A, color: newOnA ? colors[i] : pick.color, born: i, a: area(A) }, cB = { q: B, color: newOnA ? pick.color : colors[i], born: i, a: area(B) };
      cells.splice(cells.indexOf(pick), 1, cA, cB);
    }
    return cells;
  }
  // Modern: a dominant calm field + a reserve zone where other colors collect as aligned chips.
  // Cuts snap to shared guide lines so edges line up across the quilt. Colors similar to the field color split the field (tonal patches).
  function modernCells(colors, rnd) {
    const n = colors.length, base = colors[0];
    const gx = [0, 0.24, 0.38, 0.5, 0.62, 0.76, 1].map((v) => v * W), gy = [0, 0.12, 0.24, 0.38, 0.5, 0.62, 0.76, 0.88, 1].map((v) => v * H);
    const mk = (x0, y0, x1, y1, zone, color, born) => ({ x0, y0, x1, y1, zone, color, born, get a() { return (this.x1 - this.x0) * (this.y1 - this.y0); } });
    const f = [0.38, 0.5, 0.62][Math.floor(rnd() * 3)], col = rnd() < 0.5, first = rnd() < 0.5;
    let cells;
    if (col) { const x = first ? f * W : (1 - f) * W; cells = first ? [mk(0, 0, x, H, 'field', base, 0), mk(x, 0, W, H, 'reserve', base, 0)] : [mk(0, 0, x, H, 'reserve', base, 0), mk(x, 0, W, H, 'field', base, 0)]; }
    else { const y = first ? f * H : (1 - f) * H; cells = first ? [mk(0, 0, W, y, 'field', base, 0), mk(0, y, W, H, 'reserve', base, 0)] : [mk(0, 0, W, y, 'reserve', base, 0), mk(0, y, W, H, 'field', base, 0)]; }
    const fieldArea = cells.filter((c) => c.zone === 'field')[0].a;
    const snap = (arr, lo, hi, margin) => { const ok = arr.filter((v) => v > lo + margin && v < hi - margin); if (ok.length) return ok[Math.floor(rnd() * ok.length)]; const mid = (lo + hi) / 2; arr.push(mid); arr.sort((a, b) => a - b); return mid; };
    const toCell = (c) => ({ q: [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]], a: c.a, color: c.color });
    for (let i = 1; i < n; i++) {
      const similar = dE(colors[i], base) < 26;
      const tonalArea = cells.filter((c) => c.zone === 'field' && c.color !== base).reduce((a, c) => a + c.a, 0);
      let zone = similar && tonalArea < 0.28 * fieldArea ? 'field' : 'reserve';
      let cand = cells.filter((c) => c.zone === zone && c.a > 2600);
      if (!cand.length) { zone = zone === 'field' ? 'reserve' : 'field'; cand = cells.filter((c) => c.zone === zone && c.a > 2600); }
      if (!cand.length) break;
      let tot = 0; const wts = cand.map((c) => { const w = Math.pow(c.a, 0.75) * (i - c.born < 5 ? 4 : 1); tot += w; return w; });
      let r = rnd() * tot, pick = cand[cand.length - 1];
      for (let k = 0; k < cand.length; k++) { r -= wts[k]; if (r <= 0) { pick = cand[k]; break; } }
      const w = pick.x1 - pick.x0, h = pick.y1 - pick.y0, vertical = w >= h * (0.9 + rnd() * 0.2);
      let A, B;
      if (vertical) { const x = snap(gx, pick.x0, pick.x1, w * 0.18); A = mk(pick.x0, pick.y0, x, pick.y1, zone, pick.color, i); B = mk(x, pick.y0, pick.x1, pick.y1, zone, pick.color, i); }
      else { const y = snap(gy, pick.y0, pick.y1, h * 0.18); A = mk(pick.x0, pick.y0, pick.x1, y, zone, pick.color, i); B = mk(pick.x0, y, pick.x1, pick.y1, zone, pick.color, i); }
      const smallA = A.a <= B.a, newOnA = zone === 'field' ? smallA : (rnd() < 0.5 ? smallA : !smallA);
      (newOnA ? A : B).color = colors[i];
      cells.splice(cells.indexOf(pick), 1, A, B);
    }
    return cells.map(toCell);
  }
  // ---- structurally different recipes: each color is its own visible piece by construction ----
  function logCabinShapes(colors, rnd) {
    const n = colors.length, cw = W * (0.1 + rnd() * 0.07), chh = H * (0.05 + rnd() * 0.04), cx = W * (0.36 + rnd() * 0.28), cy = H * (0.3 + rnd() * 0.3);
    let x0 = cx - cw / 2, x1 = cx + cw / 2, y0 = cy - chh / 2, y1 = cy + chh / 2;
    const dist4 = { T: y0, R: W - x1, B: H - y1, L: x0 }, sides = [];
    const keys = ['T', 'R', 'B', 'L'];
    for (let i = 1; i < n; i++) { let tot = keys.reduce((a, k) => a + dist4[k], 0), r = rnd() * tot, pick = 'T'; for (const k of keys) { r -= dist4[k]; if (r <= 0) { pick = k; break; } } sides.push(pick); }
    // a side that gets no log still needs closing: its last log absorbs the remainder
    const per = {}; keys.forEach((k) => { per[k] = sides.map((sd, i) => (sd === k ? i : -1)).filter((i) => i >= 0); });
    const thick = {}; keys.forEach((k) => { const idx = per[k]; const ws = idx.map(() => 0.55 + rnd() * 0.9), tw = ws.reduce((a, b) => a + b, 0) || 1; idx.forEach((ii, j) => { thick[ii] = (dist4[k] * ws[j]) / tw; }); });
    const shapes = [{ pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], fill: colors[0] }];
    sides.forEach((sd, i) => {
      const t = thick[i], c = colors[i + 1];
      if (sd === 'T') { shapes.push({ pts: [[x0, y0 - t], [x1, y0 - t], [x1, y0], [x0, y0]], fill: c }); y0 -= t; }
      else if (sd === 'B') { shapes.push({ pts: [[x0, y1], [x1, y1], [x1, y1 + t], [x0, y1 + t]], fill: c }); y1 += t; }
      else if (sd === 'L') { shapes.push({ pts: [[x0 - t, y0], [x0, y0], [x0, y1], [x0 - t, y1]], fill: c }); x0 -= t; }
      else { shapes.push({ pts: [[x1, y0], [x1 + t, y0], [x1 + t, y1], [x1, y1]], fill: c }); x1 += t; }
    });
    // close any remaining margin on sides that received no log with the last color (keeps canvas fully covered)
    const last = colors[n - 1];
    if (y0 > 0.5) shapes.push({ pts: [[x0, 0], [x1, 0], [x1, y0], [x0, y0]], fill: last });
    if (y1 < H - 0.5) shapes.push({ pts: [[x0, y1], [x1, y1], [x1, H], [x0, H]], fill: last });
    if (x0 > 0.5) shapes.push({ pts: [[0, 0], [x0, 0], [x0, H], [0, H]], fill: last });
    if (x1 < W - 0.5) shapes.push({ pts: [[x1, 0], [W, 0], [W, H], [x1, H]], fill: last });
    return shapes;
  }
  function strataShapes(colors, rnd) {
    const n = colors.length, ws = colors.map(() => 0.5 + Math.pow(rnd(), 2) * 2.6), tw = ws.reduce((a, b) => a + b, 0);
    const ys = [0]; ws.forEach((w) => ys.push(ys[ys.length - 1] + (w / tw) * H)); ys[n] = H;
    const line = (k) => { // boundary polyline, sometimes with a step (a "fault") partway across
      const y = ys[k]; if (k === 0 || k === n || rnd() > 0.4) return [[0, y], [W, y]];
      const gap = Math.min(ys[k] - ys[k - 1], ys[k + 1] - ys[k]), off = (rnd() < 0.5 ? -1 : 1) * gap * (0.25 + rnd() * 0.3), xs = W * (0.2 + rnd() * 0.6);
      return [[0, y], [xs, y], [xs, y + off], [W, y + off]];
    };
    const lines = []; for (let k = 0; k <= n; k++) lines.push(line(k));
    return colors.map((c, k) => ({ pts: lines[k].concat(lines[k + 1].slice().reverse()), fill: c }));
  }
  function barShapes(colors, rnd) {
    const n = colors.length, k = Math.max(3, Math.min(7, Math.round(Math.sqrt(n / 2.2))));
    const pat = [1, 0.45, 1.25, 0.5, 1.1, 0.4, 0.9], bw = Array.from({ length: k }, (_, i) => pat[i % pat.length] * (0.85 + rnd() * 0.3)), tb = bw.reduce((a, b) => a + b, 0);
    const cnt = Array(k).fill(1); for (let i = k; i < n; i++) cnt[Math.floor(rnd() * k)]++;
    const shapes = []; let x = 0, ci = 0;
    for (let b = 0; b < k; b++) {
      const x1 = b === k - 1 ? W : x + (bw[b] / tb) * W, hs = Array.from({ length: cnt[b] }, () => 0.6 + rnd() * 1.4), th = hs.reduce((a, c) => a + c, 0); let y = 0;
      hs.forEach((h, j) => { const y1 = j === hs.length - 1 ? H : y + (h / th) * H; if (ci < n) shapes.push({ pts: [[x, y], [x1, y], [x1, y1], [x, y1]], fill: colors[ci++] }); y = y1; });
      x = x1;
    }
    return shapes;
  }
  function radialShapes(colors, rnd) {
    const n = colors.length, cx = W * (0.38 + rnd() * 0.24), cy = H * (0.32 + rnd() * 0.26), a = W / 2, b = H / 2.4;
    const rings = n > 40 ? 3 : n > 16 ? 2 : 1, bounds = rings === 1 ? [0.14, 2.4] : rings === 2 ? [0.12, 0.55, 2.4] : [0.1, 0.4, 0.75, 2.4];
    // wobbly: ring boundaries undulate, and each ray bends a little, shared by neighbours so seams stay closed
    const ph = bounds.map(() => [rnd() * 6.28, rnd() * 6.28, 0.04 + rnd() * 0.05]);
    const R = (bi, ang) => bounds[bi] * (1 + (bi === bounds.length - 1 ? 0 : ph[bi][2]) * (Math.sin(2 * ang + ph[bi][0]) + 0.6 * Math.sin(5 * ang + ph[bi][1])));
    const P = (bi, ang) => [cx + Math.cos(ang) * a * R(bi, ang), cy + Math.sin(ang) * b * R(bi, ang)];
    const hub = Array.from({ length: 40 }, (_, i) => P(0, (i / 40) * Math.PI * 2));
    const shapes = [{ pts: hub, fill: colors[0] }];
    const rest = colors.slice(1), per = Array(rings).fill(0).map((_, i) => Math.floor(rest.length / rings) + (i < rest.length % rings ? 1 : 0)); let ci = 0;
    for (let rg = 0; rg < rings; rg++) {
      const m = per[rg]; if (!m) continue;
      const ws = Array.from({ length: m }, () => 0.6 + rnd() * 1.1), tw = ws.reduce((x, y) => x + y, 0), a0 = rnd() * Math.PI * 2;
      const angs = [a0]; ws.forEach((w) => angs.push(angs[angs.length - 1] + (w / tw) * Math.PI * 2));
      const bend = angs.map(() => [(rnd() - 0.5) * 0.16, rnd() * 6.28]); bend[m] = bend[0];
      const ray = (j, t) => { const an = angs[j] + bend[j][0] * Math.sin(t * Math.PI * 1.3 + bend[j][1]); const r0 = R(rg, an), r1 = R(rg + 1, an), r = r0 + (r1 - r0) * t; return [cx + Math.cos(an) * a * r, cy + Math.sin(an) * b * r]; };
      for (let j = 0; j < m; j++) {
        const pts = [], ST = 10, da = angs[j + 1] - angs[j], AS = Math.max(3, Math.ceil(da * 10));
        for (let t = 0; t <= ST; t++) pts.push(ray(j, t / ST));
        for (let k = 1; k < AS; k++) pts.push(P(rg + 1, angs[j] + (k / AS) * da));
        for (let t = ST; t >= 0; t--) pts.push(ray(j + 1, t / ST));
        for (let k = AS - 1; k > 0; k--) pts.push(P(rg, angs[j] + (k / AS) * da));
        shapes.push({ pts, fill: rest[ci++] });
      }
    }
    return shapes;
  }
  function buildFlat(colors, opts, style) {
    const seed = (opts.seed != null ? opts.seed : 1) >>> 0, rnd = mulberry32(seed ^ 0x2468ace1), n = colors.length;
    const out = { W, H, shapes: [], cells: 0, center: style, place: style, size: 1, frame: false, style };
    let shapes = [], amp, maxSeg = 16;
    if (style === 'modern') {
      // clean + minimal: a few big flat blocks, new colors cluster as smaller chips, crisp straight cuts, no patterns, no mirroring
      const ratios = [0.382, 0.5, 0.618, 0.25, 0.75, 0.3, 0.7];
      const cells = modernCells(colors, rnd);
      // one special pattern: an off-center block, at most 20% of the quilt; it keeps its own color so no submission is hidden
      const tot = W * H, cen = (c) => [c.q.reduce((a, p) => a + p[0], 0) / 4, c.q.reduce((a, p) => a + p[1], 0) / 4];
      const ok = cells.filter((c) => c.a / tot >= 0.03 && c.a / tot <= 0.2);
      const off = ok.filter((c) => { const [x, y] = cen(c); return Math.hypot((x - CX) / W, (y - H / 2) / H) > 0.2; });
      const pool = off.length ? off : ok, sp = pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
      shapes = [];
      cells.forEach((c) => {
        if (c !== sp) { shapes.push({ pts: c.q, fill: c.color }); return; }
        const cw = (dist(c.q[0], c.q[1]) + dist(c.q[3], c.q[2])) / 2, ch = (dist(c.q[0], c.q[3]) + dist(c.q[1], c.q[2])) / 2, asp = Math.max(cw, ch) / Math.min(cw, ch);
        const type = asp > 1.8 ? (cw < ch ? 'railFence' : 'flyingGeese') : ['pinwheel', 'ninePatch', 'circle', 'drunkard', 'diamond', 'logCabin', 'hst'][Math.floor(rnd() * 7)];
        let other = colors[0], bd = -1; for (let k = 0; k < 8; k++) { const cand = colors[Math.floor(rnd() * n)], d = dE(cand, c.color); if (d > bd) { bd = d; other = cand; } }
        const prnd = mulberry32((rnd() * 4294967296) >>> 0), pcs = [c.color, other];
        const pieces = c.q && type === 'flyingGeese' ? PATTERNS.flyingGeese(prnd, Math.round(Math.max(cw, ch) / 90)) : PATTERNS[type](prnd);
        pieces.forEach((pc) => shapes.push({ pts: pc.pts.map(([u, v]) => bil(c.q, u, v)), fill: pcs[pc.c] }));
      });
      out.special = sp ? Math.round((sp.a / tot) * 100) : 0; amp = 0.75;
    } else if (style === 'logcabin') { shapes = logCabinShapes(colors, rnd); amp = 0.9;
    } else if (style === 'strata') { shapes = strataShapes(colors, rnd); amp = 1.0;
    } else if (style === 'bars') { shapes = barShapes(colors, rnd); amp = 0.8;
    } else if (style === 'radial') { shapes = radialShapes(colors, rnd); amp = 1.5;
    } else if (style === 'improv') {
      // improvisational strips: slanted cuts, long narrow pieces, strong wobble, asymmetric (Gee's Bend spirit)
      const cells = bspFull(colors, rnd, { areaPow: 1.1, recent: 0, recentBoost: 1, slant: 0.5, ratio: (r) => 0.16 + r() * 0.5 });
      shapes = cells.map((c) => ({ pts: c.q, fill: c.color })); amp = 1.7;
    } else {
      // geometric: strict grid of square modules, each holding one bold primitive in a submitted color on a neighbor's color
      const cols = Math.max(2, Math.ceil(Math.sqrt(n / 2))), rows = Math.max(2, Math.ceil(n / cols)), cs = W / cols, rs = H / rows;
      const prims = ['quarter', 'half', 'circle', 'tri', 'bar', 'diamond', 'solid'];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const idx = r * cols + c, fg = colors[idx % n], bgc = colors[(idx * 7 + 3) % n === idx % n ? (idx + 1) % n : (idx * 7 + 3) % n];
        const x0 = c * cs, y0 = r * rs, x1 = x0 + cs, y1 = y0 + rs, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rad = Math.min(cs, rs);
        shapes.push({ pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], fill: bgc });
        const kind = prims[Math.floor(rnd() * prims.length)], rot = Math.floor(rnd() * 4);
        const arc = (ox, oy, r0, a0, a1, extra) => [].concat(extra || [], Array.from({ length: 20 }, (_, i) => { const a = a0 + (i / 19) * (a1 - a0); return [ox + Math.cos(a) * r0, oy + Math.sin(a) * r0]; }));
        const corner = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]][rot], qa = rot * Math.PI / 2;
        let pts;
        if (kind === 'quarter') pts = arc(corner[0], corner[1], rad * 0.98, qa, qa + Math.PI / 2, [corner]);
        else if (kind === 'half') pts = rot % 2 ? arc(cx, y0 + (rot === 1 ? 0 : rs), rad * 0.5, rot === 1 ? 0 : Math.PI, rot === 1 ? Math.PI : Math.PI * 2) : arc(x0 + (rot === 0 ? 0 : cs), cy, rad * 0.5, rot === 0 ? -Math.PI / 2 : Math.PI / 2, rot === 0 ? Math.PI / 2 : Math.PI * 1.5);
        else if (kind === 'circle') pts = arc(cx, cy, rad * 0.42, 0, Math.PI * 2);
        else if (kind === 'tri') pts = [[x0, y0], [x1, y1], rot % 2 ? [x1, y0] : [x0, y1]];
        else if (kind === 'bar') pts = rot % 2 ? [[x0 + cs * 0.3, y0], [x0 + cs * 0.7, y0], [x0 + cs * 0.7, y1], [x0 + cs * 0.3, y1]] : [[x0, y0 + rs * 0.3], [x1, y0 + rs * 0.3], [x1, y0 + rs * 0.7], [x0, y0 + rs * 0.7]];
        else if (kind === 'diamond') pts = [[cx, y0 + rs * 0.08], [x1 - cs * 0.08, cy], [cx, y1 - rs * 0.08], [x0 + cs * 0.08, cy]];
        else pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        shapes.push({ pts, fill: fg });
      }
      amp = 0.6;
    }
    const vr = mulberry32(seed ^ 0x51ed270b); shapes.forEach((sh) => { sh.fill = shade(sh.fill, (vr() - 0.5) * (style === 'modern' ? 0.03 : 0.07)); });
    const warp = flatWarp(seed, opts.wonk != null ? amp * opts.wonk : amp);
    out.shapes = shapes.map((sh) => ({ pts: subdividePts(sh.pts, maxSeg).map(warp), fill: sh.fill }));
    out.cells = shapes.length; return out;
  }
  function build(colors, opts) {
    opts = opts || {};
    const seed = (opts.seed != null ? opts.seed : 1) >>> 0;
    let style = opts.style && opts.style !== 'auto' ? opts.style : null;
    if (!style) { const r = mulberry32(seed ^ 0x5717e5)(); style = r < 0.24 ? 'bigtop' : r < 0.38 ? 'modern' : r < 0.5 ? 'improv' : r < 0.6 ? 'geometric' : r < 0.72 ? 'logcabin' : r < 0.82 ? 'strata' : r < 0.9 ? 'bars' : 'radial'; }
    if (!colors.length) return { W, H, shapes: [], cells: 0, style };
    const m = style === 'bigtop' ? buildBigTop(colors, opts) : buildFlat(colors, opts, style);
    m.style = style; return m;
  }

  function toSvg(model, opts) {
    opts = opts || {};
    const paths = model.shapes.map((s) => `<path d="M${s.pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')}Z" fill="${s.fill}" stroke="${s.fill}" stroke-width="1.4" stroke-linejoin="round"/>`).join('');
    const bg = model.shapes.length ? model.shapes[0].fill : '#f6f4f1';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 ${model.W + 24} ${model.H + 24}" width="${opts.width || 400}"><defs><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0"/></filter><clipPath id="qc"><rect x="-6" y="-6" width="${model.W + 12}" height="${model.H + 12}"/></clipPath></defs><rect x="-12" y="-12" width="${model.W + 24}" height="${model.H + 24}" fill="${bg}"/><g clip-path="url(#qc)">${paths}</g><rect x="-6" y="-6" width="${model.W + 12}" height="${model.H + 12}" filter="url(#grain)"/></svg>`;
  }

  const api = { build, toSvg, W, H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.QuiltLabEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
