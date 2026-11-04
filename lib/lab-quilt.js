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
const engine = typeof module !== 'undefined' && module.exports ? require('../lab/lab-engine.js') : root.QuiltLabEngine;

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

/** Draw a lab model onto a 2D canvas, stretched edge to edge (no matte). Works in Node (canvas) and browsers. */
function drawLabQuilt(ctx, model, outW, outH) {
  // map the quilt, trimmed in by `trim` units on every side (warped edges don't always reach the box), onto the whole canvas
  const trim = 4;
  ctx.save();
  ctx.scale(outW / (model.W - trim * 2), outH / (model.H - trim * 2));
  ctx.translate(-trim, -trim);
  const bg = model.shapes.length ? model.shapes[0].fill : '#f6f4f1';
  ctx.fillStyle = bg; ctx.fillRect(-6, -6, model.W + 12, model.H + 12);
  ctx.lineJoin = 'round'; ctx.lineWidth = 1.4;
  model.shapes.forEach((s) => {
    if (!s.pts.length) return;
    ctx.beginPath();
    ctx.moveTo(s.pts[0][0], s.pts[0][1]);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0], s.pts[i][1]);
    ctx.closePath(); ctx.fillStyle = s.fill; ctx.strokeStyle = s.fill; ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}

/** Node: PNG buffer. */
function renderLabQuiltPng(createCanvas, model, opts = {}) {
  const outW = opts.width || 1080, outH = opts.height || 1920;
  const canvas = createCanvas(outW, outH);
  drawLabQuilt(canvas.getContext('2d'), model, outW, outH);
  return canvas.toBuffer('image/png');
}

/** Browser: PNG Blob (maxEdge caps the long side, like the app's other quilt exports). */
function renderLabQuiltBlob(model, opts = {}) {
  let outW = 1080, outH = 1920;
  const maxEdge = Number(opts.maxEdge) > 0 ? Number(opts.maxEdge) : 0;
  if (maxEdge && Math.max(outW, outH) > maxEdge) { const f = maxEdge / Math.max(outW, outH); outW = Math.round(outW * f); outH = Math.round(outH * f); }
  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  drawLabQuilt(canvas.getContext('2d'), model, outW, outH);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

const api = { STYLES, LAB_ENGINE_VERSION, seedFromDateKey, styleForDateKey, colorsFromBlocks, buildLabQuilt, drawLabQuilt, renderLabQuiltPng, renderLabQuiltBlob };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LabQuilt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
