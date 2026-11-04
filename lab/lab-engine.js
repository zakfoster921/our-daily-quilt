/* Quilt Lab engine v0 — standalone. Builds a mirrored, improvisational composition from an ordered list of colors.
 * Never touches the app, Firestore, or the production engine. */
(function (root) {
  'use strict';
  const W = 1000, H = 1250, CX = W / 2;

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

  function build(colors, opts) {
    opts = opts || {};
    const seed = (opts.seed != null ? opts.seed : 1) >>> 0;
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    const n = colors.length;
    const out = { W, H, shapes: [], cells: 0 };
    if (!n) return out;

    // left half as one big quad (slightly overlapping the center seam)
    const mkCell = (q, c) => ({ q, color: c, locked: false, a: area(q) });
    let cells = [mkCell([[0, 0], [CX, 0], [CX, H], [0, H]], colors[0])];

    const pPattern = opts.patternRate != null ? opts.patternRate : 0.5;
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
      const cA = mkCell(A, pick.color), cB = mkCell(B, colors[i]);
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
        c.pcolors = [pick.color, colors[i]];
        if (c === cA) c.pcolors = [colors[i], pick.color];
      });
    }
    out.cells = cells.length;

    // expand to shapes in the left half, then mirror
    const shapesL = [];
    cells.forEach((c) => {
      if (!c.pattern) { shapesL.push({ pts: c.q, fill: c.color }); return; }
      const pieces = (c.pattern === 'flyingGeese' ? PATTERNS.flyingGeese(c.prnd, Math.round(Math.max(dist(c.q[0], c.q[1]), dist(c.q[3], c.q[2])) / 90)) : PATTERNS[c.pattern](c.prnd));
      pieces.forEach((p) => shapesL.push({ pts: p.pts.map(([u, v]) => bil(c.q, u, v)), fill: c.pcolors[p.c] }));
    });
    const mirrored = shapesL.map((s) => ({ pts: s.pts.map(([x, y]) => [W - x, y]), fill: s.fill }));

    // center motif: varies by day/seed so not every quilt gets the big star
    const mrnd = mulberry32(seed ^ 0x7777aaaa);
    let kind = opts.center && opts.center !== 'auto' ? opts.center : null;
    if (!kind) { const r = mrnd(); kind = r < 0.18 ? 'none' : r < 0.32 ? 'star' : r < 0.42 ? 'small' : r < 0.5 ? 'spine' : r < 0.57 ? 'pair' : r < 0.69 ? 'dresden' : r < 0.81 ? 'flower' : r < 0.91 ? 'wreath' : 'bullseye'; }
    out.center = kind;
    const med = [];
    const cc = (k) => colors[Math.min(n - 1, k)];
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
    if (n >= 4) {
      if (kind === 'star') medallion(CX, H * 0.42, baseBig, 0);
      else if (kind === 'small') { const b = baseBig * 0.5; diamond(CX, H * 0.5, b * 1.4, cc(2)); disc(CX, H * 0.5, b * 0.8, cc(1)); starAt(CX, H * 0.5, b * 0.55, cc(3)); }
      else if (kind === 'spine') { [0.17, 0.5, 0.83].forEach((fy, i) => { const b = Math.min(W, H) * (i === 1 ? 0.075 : 0.055); diamond(CX, H * fy, b * 1.5, cc(i + 1)); disc(CX, H * fy, b * 0.8, cc(i + 2)); }); }
      else if (kind === 'pair') { [W * 0.27, W * 0.73].forEach((x) => { const b = baseBig * 0.52; diamond(x, H * 0.45, b * 1.4, cc(1)); diamond(x, H * 0.45, b * 1.0, cc(2)); disc(x, H * 0.45, b * 0.6, cc(3)); }); }
      else if (kind === 'dresden') dresden(CX, H * 0.44, baseBig * 1.45, 16, cc(1), cc(2), cc(3));
      else if (kind === 'flower') flower(CX, H * 0.44, baseBig * 1.55, 8, cc(1), cc(2), cc(3), cc(4));
      else if (kind === 'wreath') wreath(CX, H * 0.44, baseBig * 1.5, 14, cc(1), cc(2), cc(3));
      else if (kind === 'bullseye') bullseye(CX, H * 0.44, baseBig * 1.4, [cc(1), cc(2), cc(3), cc(4)]);
    }

    const all = shapesL.concat(mirrored, med);
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

  function toSvg(model, opts) {
    opts = opts || {};
    const paths = model.shapes.map((s) => `<path d="M${s.pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')}Z" fill="${s.fill}" stroke="${s.fill}" stroke-width="0.9" stroke-linejoin="round"/>`).join('');
    const bg = model.shapes.length ? model.shapes[0].fill : '#f6f4f1';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 ${model.W + 24} ${model.H + 24}" width="${opts.width || 400}"><defs><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0"/></filter><clipPath id="qc"><rect x="-6" y="-6" width="${model.W + 12}" height="${model.H + 12}"/></clipPath></defs><rect x="-12" y="-12" width="${model.W + 24}" height="${model.H + 24}" fill="${bg}"/><g clip-path="url(#qc)">${paths}</g><rect x="-6" y="-6" width="${model.W + 12}" height="${model.H + 12}" filter="url(#grain)"/></svg>`;
  }

  const api = { build, toSvg, W, H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.QuiltLabEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
