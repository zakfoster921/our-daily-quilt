(function (root) {
'use strict';
/**
 * Quilt Lab engine adapter (Phase 1: final/archive render only; the live in-app engine is untouched).
 *
 *   blocks (Firestore, submission order) -> { colors, contributorIds } -> lab engine model -> PNG
 *
 * Everything here is deterministic from (dateKey, ordered colors), so the same inputs always give the same quilt.
 * Store `LAB_ENGINE_VERSION` next to any saved render so old archives can be re-rendered by the engine that made them.
 */
const engine = typeof module !== 'undefined' && module.exports ? require('./lab-engine.js') : root.QuiltLabEngine;

const LAB_ENGINE_VERSION = engine.VERSION || 'lab-1';
const STYLES = engine.STYLES;

function seedFromDateKey(dateKey) {
  let h = 2166136261;
  const s = String(dateKey || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function addDays(dateKey, delta) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Style for a day: the engine's seeded pick, but never the same style as the (unadjusted) previous day. */
function styleForDateKey(dateKey) {
  const today = engine.styleForSeed(seedFromDateKey(dateKey));
  const yesterday = engine.styleForSeed(seedFromDateKey(addDays(dateKey, -1)));
  if (today !== yesterday) return today;
  const start = STYLES.indexOf(today);
  const bump = 1 + (seedFromDateKey(`${dateKey}:alt`) % (STYLES.length - 1));
  return STYLES[(start + bump) % STYLES.length];
}

/** Ordered colors + contributor ids from a day's blocks. Hex only; anything else falls back to neutral gray. */
function colorsFromBlocks(blocks) {
  const colors = [];
  const contributorIds = [];
  (Array.isArray(blocks) ? blocks : []).forEach((b) => {
    const c = /^#[0-9a-f]{6}$/i.test(String(b && b.color)) ? String(b.color).toLowerCase() : '#6c757d';
    colors.push(c);
    contributorIds.push((b && b.contributorId) || null);
  });
  return { colors, contributorIds };
}

/**
 * Build the lab quilt for a day.
 * Returns the engine model plus `owners`: for every shape, the contributorIds it belongs to
 * (shared shapes list several, so each contributor can find "their" shape).
 */
function buildLabQuilt(blocks, dateKey, opts = {}) {
  const { colors, contributorIds } = colorsFromBlocks(blocks);
  if (colors.length < 2) throw new Error('Need at least 2 blocks for a lab quilt');
  const style = opts.style || styleForDateKey(dateKey);
  const model = engine.build(colors, { seed: seedFromDateKey(dateKey), style });
  const owners = model.shapes.map((s) => (s.cis || [s.ci]).filter((i) => i != null).map((i) => contributorIds[i]).filter(Boolean));
  return { version: LAB_ENGINE_VERSION, dateKey, style: model.style, colorCount: colors.length, model, owners, contributorIds };
}

// ---- riso ink texture (a canvas port of the layers quilt-renderer-v2 draws on every block) ----
function hash01(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function hexRgb(hex) { const h = String(hex).replace('#', ''); return { r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0 }; }
const rgba = (c, a) => `rgba(${c.r},${c.g},${c.b},${a})`;

/** Repeating dot tiles (same dots/angles as the app's SVG patterns). `mk(w,h)` makes a canvas in Node or the browser. */
function risoTiles(mk) {
  const dot = (ctx, x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const S = 2, ink = mk(14 * S, 14 * S), ic = ink.getContext('2d'); ic.scale(S, S);
  dot(ic, 3.5, 3.5, 1.65, 'rgba(255,244,220,0.42)'); dot(ic, 10.5, 10.5, 1.65, 'rgba(255,244,220,0.42)');
  dot(ic, 10.5, 3.5, 0.82, 'rgba(39,31,25,0.13)'); dot(ic, 3.5, 10.5, 0.82, 'rgba(39,31,25,0.1)');
  const ko = mk(32 * S, 32 * S), kc = ko.getContext('2d'); kc.scale(S, S);
  dot(kc, 5.4, 6.2, 1.85, 'rgba(250,244,226,0.86)'); dot(kc, 17.8, 10.6, 1.18, 'rgba(250,244,226,0.7)');
  dot(kc, 26.4, 21.2, 2.05, 'rgba(250,244,226,0.74)'); dot(kc, 10.8, 27.1, 1.0, 'rgba(250,244,226,0.66)');
  kc.fillStyle = 'rgba(250,244,226,0.62)'; kc.fillRect(22.2, 4.8, 3.4, 1.05);
  return { ink, ko };
}

function shapePath(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }

/** One shape's riso layers, in the app's order. Sizes are in quilt units (quilt is 1000 wide, like the app). */
function drawRisoShape(ctx, pts, fill, idx, tiles, seedKey) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  const w = x1 - x0, h = y1 - y0, minDim = Math.max(1, Math.min(w, h));
  if (minDim < 6) return;
  const c = hexRgb(fill), lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  const size = minDim <= 44 ? 0.45 : minDim <= 72 ? 0.7 : 1;
  const dark = lum <= 72 ? 0.5 : lum <= 96 ? 0.66 : lum <= 124 ? 0.82 : 1;
  const t = Math.max(0, Math.min(1, size * dark));
  const cov = Math.max(0.55, Math.min(1.55, (minDim - 34) / 122));
  const koCov = Math.max(0, Math.min(1.35, (minDim - 56) / 112));
  const koTone = lum <= 72 ? 0.36 : lum <= 108 ? 0.56 : lum <= 150 ? 0.78 : 1;
  const darkEdge = lum <= 72 ? 1 : lum <= 96 ? 0.65 : 0;
  const seed = `${seedKey}|${idx}|${Math.round(x0)}|${Math.round(y0)}|${Math.round(w)}|${Math.round(h)}`;
  const cx = x0 + w * (0.38 + hash01(`${seed}|cx`) * 0.24), cy = y0 + h * (0.38 + hash01(`${seed}|cy`) * 0.24);
  const edgeR = Math.max(w, h) * 0.92, centerR = Math.max(w, h) * 0.72;
  const grad = (r, stops) => { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
  // the current path is already in quilt space; rotating/scaling only the fill moves the repeating tile, not the shape
  const withPattern = (tile, deg, alpha, blend) => {
    const pat = ctx.createPattern(tile, 'repeat'); if (!pat) return;
    ctx.save(); ctx.globalAlpha = alpha; if (blend) ctx.globalCompositeOperation = blend;
    ctx.rotate(deg * Math.PI / 180); ctx.scale(0.5, 0.5); ctx.fillStyle = pat; ctx.fill(); ctx.restore();
  };
  ctx.save();
  shapePath(ctx, pts); ctx.clip();
  shapePath(ctx, pts);
  withPattern(tiles.ink, -18, Math.min(0.48, 0.15 * cov * t), 'overlay');                                  // riso dots
  ctx.fillStyle = grad(centerR, [[0, `rgba(255,255,255,${0.055 * t})`], [0.55, `rgba(255,255,255,${0.018 * t})`], [1, 'rgba(255,255,255,0)']]); ctx.fill();   // center lift
  ctx.save(); ctx.translate((hash01(`${seed}|risoSpreadX`) - 0.5) * 2.6, (hash01(`${seed}|risoSpreadY`) - 0.5) * 2.6);
  shapePath(ctx, pts); ctx.fillStyle = rgba(c, (0.13 * cov * t).toFixed(3)); ctx.fill(); ctx.restore();       // ink spread
  shapePath(ctx, pts);
  ctx.fillStyle = grad(edgeR, [[0, rgba(c, 0)], [0.65, rgba(c, 0.045 * t)], [1, rgba(c, 0.24 * t)]]); ctx.fill();   // edge pooling
  if (koCov > 0.001) { shapePath(ctx, pts); withPattern(tiles.ko, 11, Math.min(0.48, 0.32 * koCov * koTone * t)); }  // paper knockout
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  shapePath(ctx, pts); ctx.strokeStyle = rgba(c, Math.min(0.34, 0.14 * cov * t)); ctx.lineWidth = (1.45 + 1.05 * cov); ctx.stroke(); // ink bloom
  ctx.save(); ctx.translate((hash01(`${seed}|paperToothX`) - 0.5) * 1.6, (hash01(`${seed}|paperToothY`) - 0.5) * 1.6);
  shapePath(ctx, pts); ctx.setLineDash([1.3, 5.8]); ctx.lineDashOffset = hash01(`${seed}|paperDash`) * 7;
  ctx.strokeStyle = `rgba(246,239,224,${Math.min(0.46, 0.2 * cov * t)})`; ctx.lineWidth = 0.72 + 0.36 * cov; ctx.stroke(); ctx.restore();           // paper tooth
  if (darkEdge > 0.001) { shapePath(ctx, pts); ctx.fillStyle = grad(edgeR, [[0, 'rgba(0,0,0,0)'], [0.72, `rgba(0,0,0,${Math.min(0.4, 0.014 * darkEdge * t)})`], [1, `rgba(0,0,0,${Math.min(0.55, 0.105 * darkEdge * t)})`]]); ctx.fill(); }
  ctx.restore();
}

/** Draw a lab model onto a 2D canvas, stretched edge to edge (no matte). Works in Node (canvas) and browsers.
 *  opts.makeCanvas(w,h) is needed for the riso tiles; opts.riso === false draws flat color. */
function drawLabQuilt(ctx, model, outW, outH, opts = {}) {
  // map the quilt, trimmed in by `trim` units on every side (warped edges don't always reach the box), onto the whole canvas
  const trim = 4;
  ctx.save();
  ctx.scale(outW / (model.W - trim * 2), outH / (model.H - trim * 2));
  ctx.translate(-trim, -trim);
  const bg = model.shapes.length ? model.shapes[0].fill : '#f6f4f1';
  ctx.fillStyle = bg; ctx.fillRect(-6, -6, model.W + 12, model.H + 12);
  ctx.lineJoin = 'round'; ctx.lineWidth = 1.4;
  const tiles = opts.riso !== false && opts.makeCanvas ? risoTiles(opts.makeCanvas) : null;
  model.shapes.forEach((s, i) => {
    if (!s.pts.length) return;
    shapePath(ctx, s.pts); ctx.fillStyle = s.fill; ctx.strokeStyle = s.fill; ctx.fill(); ctx.stroke();
    // riso layers go on right after their own piece, so a piece never texture-tints the pieces drawn over it
    if (tiles && s.pts.length > 2) drawRisoShape(ctx, s.pts, s.fill, i, tiles, model.style || 'lab');
  });
  ctx.restore();
}

/** Node: PNG buffer. */
function renderLabQuiltPng(createCanvas, model, opts = {}) {
  const outW = opts.width || 1080, outH = opts.height || 1920;
  const canvas = createCanvas(outW, outH);
  drawLabQuilt(canvas.getContext('2d'), model, outW, outH, { makeCanvas: createCanvas, riso: opts.riso });
  return canvas.toBuffer('image/png');
}

/** Browser: PNG Blob (maxEdge caps the long side, like the app's other quilt exports). */
function renderLabQuiltBlob(model, opts = {}) {
  let outW = 1080, outH = 1920;
  const maxEdge = Number(opts.maxEdge) > 0 ? Number(opts.maxEdge) : 0;
  if (maxEdge && Math.max(outW, outH) > maxEdge) { const f = maxEdge / Math.max(outW, outH); outW = Math.round(outW * f); outH = Math.round(outH * f); }
  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');
  drawLabQuilt(ctx, model, outW, outH, { makeCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, riso: opts.riso });
  // film grain: the app's own overlay, unless the export asked to skip it (story/carousel add theirs in the layout)
  if (opts.grain === true && typeof Utils !== 'undefined' && typeof Utils.applyFilmGrain === 'function') {
    try { Utils.applyFilmGrain(ctx, outW, outH, 0, { vignette: false }); } catch (_) { /* grain is optional */ }
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

const api = { STYLES, LAB_ENGINE_VERSION, seedFromDateKey, styleForDateKey, colorsFromBlocks, buildLabQuilt, drawLabQuilt, renderLabQuiltPng, renderLabQuiltBlob };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LabQuilt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
