'use strict';
/**
 * Quilt Lab engine adapter (Phase 1: final/archive render only; the live in-app engine is untouched).
 *
 *   blocks (Firestore, submission order) -> { colors, contributorIds } -> lab engine model -> PNG
 *
 * Everything here is deterministic from (dateKey, ordered colors), so the same inputs always give the same quilt.
 * Store `LAB_ENGINE_VERSION` next to any saved render so old archives can be re-rendered by the engine that made them.
 */
const engine = require('../lab/lab-engine.js');

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

/** Draw a lab model onto a node-canvas, fitted by height and centered on a matte. Returns the PNG buffer. */
function renderLabQuiltPng(createCanvas, model, opts = {}) {
  const outW = opts.width || 1080, outH = opts.height || 1920, matte = opts.matte || '#f6f4f1';
  const canvas = createCanvas(outW, outH), ctx = canvas.getContext('2d');
  ctx.fillStyle = matte; ctx.fillRect(0, 0, outW, outH);
  const pad = 12, k = Math.min(outW / (model.W + pad * 2), outH / (model.H + pad * 2));
  const ox = (outW - model.W * k) / 2, oy = (outH - model.H * k) / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(ox - 6 * k, oy - 6 * k, (model.W + 12) * k, (model.H + 12) * k); ctx.clip();
  const bg = model.shapes.length ? model.shapes[0].fill : matte;
  ctx.fillStyle = bg; ctx.fillRect(ox - 12 * k, oy - 12 * k, (model.W + 24) * k, (model.H + 24) * k);
  ctx.lineJoin = 'round'; ctx.lineWidth = 1.4 * k;
  model.shapes.forEach((s) => {
    if (!s.pts.length) return;
    ctx.beginPath();
    ctx.moveTo(ox + s.pts[0][0] * k, oy + s.pts[0][1] * k);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(ox + s.pts[i][0] * k, oy + s.pts[i][1] * k);
    ctx.closePath(); ctx.fillStyle = s.fill; ctx.strokeStyle = s.fill; ctx.fill(); ctx.stroke();
  });
  ctx.restore();
  return canvas.toBuffer('image/png');
}

module.exports = { STYLES, LAB_ENGINE_VERSION, seedFromDateKey, styleForDateKey, colorsFromBlocks, buildLabQuilt, renderLabQuiltPng };
