#!/usr/bin/env node
/* eslint-disable no-console */

/** Punk-flyer / photocopier portrait tone — high contrast, lifted blacks, band grain. */
const XEROX_TONE = Object.freeze({
  contrast: 1.68,
  brightness: 1.08,
  /** No deep ink — darkest visible tone stays charcoal, not true black. */
  blackFloor: 62,
  /** Highlights stay dusty/off-white, not pure paper white. */
  whiteCap: 236,
  /** Horizontal copier drum / scanner streaks. */
  bandStrength: 0.11,
  bandPeriodPx: 5.5,
  /** Per-pixel photocopy grit. */
  grainAmp: 14
});

function hashSeedToUnit(seed, x, y) {
  let h = 0;
  const s = `${String(seed || 'odq')}:${x}:${y}`;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) % 10000) / 10000;
}

function bandPhaseFromSeed(seed) {
  let h = 0;
  const s = String(seed || 'odq');
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 6283) / 1000;
}

/**
 * Apply xerox tone to RGBA buffer (opaque speaker pixels only; alpha preserved).
 * @param {Buffer|Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {string} [seed]
 */
function applySpeakerCutoutXeroxRgba(data, width, height, seed = 'odq') {
  const d = data;
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const bandPhase = bandPhaseFromSeed(seed);
  const {
    contrast,
    brightness,
    blackFloor,
    whiteCap,
    bandStrength,
    bandPeriodPx,
    grainAmp
  } = XEROX_TONE;

  for (let y = 0; y < h; y += 1) {
    const bandMul =
      1 -
      bandStrength *
        0.5 *
        (1 + Math.sin(y / Math.max(0.8, bandPeriodPx) + bandPhase));
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const alpha = d[i + 3];
      if (alpha < 8) {
        d[i + 3] = 0;
        continue;
      }
      let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      lum = ((lum / 255 - 0.5) * contrast + 0.5) * 255 * brightness;
      lum *= bandMul;
      lum += hashSeedToUnit(seed, x, y) * grainAmp * 2 - grainAmp;
      lum = Math.max(blackFloor, Math.min(whiteCap, lum));
      const v = Math.round(lum);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
  }
}

/**
 * True when RGBA already looks like a server xerox pass (grayscale, lifted blacks).
 * @param {Buffer|Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 */
function rgbaLooksSpeakerCutoutXerox(data, width, height) {
  const d = data;
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  let opaque = 0;
  let gray = 0;
  let inRange = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 20) continue;
      opaque += 1;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (Math.abs(r - g) <= 8 && Math.abs(r - b) <= 8) gray += 1;
      if (r >= XEROX_TONE.blackFloor - 4 && r <= XEROX_TONE.whiteCap + 4) inRange += 1;
    }
  }
  return opaque > 400 && gray / opaque > 0.97 && inRange / opaque > 0.85;
}

module.exports = {
  XEROX_TONE,
  applySpeakerCutoutXeroxRgba,
  rgbaLooksSpeakerCutoutXerox
};
