#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * 1990s local newspaper portrait treatment.
 * grayscale → adaptive contrast (luminance-aware) → brightness → sepia warm tint
 *
 * Replaces the old "punk flyer / photocopier" pass (high contrast, lifted blacks, band grain).
 * Registration offset and scan lines are applied in CSS/UI layer on top of this.
 */
const NEWSPAPER_TONE = Object.freeze({
  brightness: 1.32,
  sepia: 0.32,
});

/**
 * Two-factor adaptive contrast:
 * - Low stdDev (flat image) → more boost
 * - Low mean (dark/dark-skinned subject) → softer ceiling regardless of stdDev
 * Range: 1.05–1.35
 */
function computeAdaptiveContrast(data, width, height) {
  const len = width * height * 4;
  let sum = 0, count = 0;
  for (let i = 0; i < len; i += 4) {
    if (data[i + 3] < 28) continue;
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    count++;
  }
  if (!count) return 1.15;
  const mean = sum / count;
  let variance = 0;
  for (let i = 0; i < len; i += 4) {
    if (data[i + 3] < 28) continue;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    variance += (lum - mean) ** 2;
  }
  const stdDev = Math.sqrt(variance / count);
  const stdNorm = Math.min(1, Math.max(0, (stdDev - 20) / 60));
  const meanFactor = Math.min(1, mean / 140) ** 2;
  const combined = meanFactor * (1 - stdNorm * 0.5);
  return Math.round((1.05 + 0.30 * combined) * 100) / 100;
}

/**
 * Apply newspaper tone to RGBA buffer (opaque speaker pixels only; alpha preserved).
 * @param {Buffer|Uint8ClampedArray} data  Raw RGBA pixels, modified in place.
 * @param {number} width
 * @param {number} height
 * @param {string} [_seed]  Unused — kept for API compatibility with old xerox pass.
 */
function applySpeakerCutoutXeroxRgba(data, width, height, _seed = 'odq') {
  const d = data;
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const { brightness, sepia } = NEWSPAPER_TONE;

  // Pass 1: compute adaptive contrast from source luminance
  const contrast = computeAdaptiveContrast(d, w, h);

  // Pass 2: grayscale → contrast → brightness → sepia
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 8) { d[i + 3] = 0; continue; }

      // grayscale(1)
      let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

      // contrast (CSS spec: slope*(val - 128) + 128)
      lum = contrast * (lum - 128) + 128;

      // brightness
      lum = Math.max(0, Math.min(255, lum * brightness));

      // sepia(amount) — interpolate toward full-sepia matrix
      const r = lum, g = lum, b = lum;
      const sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
      const sg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
      const sb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      d[i]     = Math.round(r + (sr - r) * sepia);
      d[i + 1] = Math.round(g + (sg - g) * sepia);
      d[i + 2] = Math.round(b + (sb - b) * sepia);
    }
  }
}

/**
 * True when RGBA already looks like a newspaper tone pass (warm-tinted grayscale).
 * Used to avoid re-processing already-processed cutouts.
 * @param {Buffer|Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 */
function rgbaLooksSpeakerCutoutXerox(data, width, height) {
  const d = data;
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  let opaque = 0, warm = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 20) continue;
      opaque += 1;
      const r = d[i], b = d[i + 2];
      // Sepia tint: red channel meaningfully higher than blue
      if (r > b + 4) warm += 1;
    }
  }
  return opaque > 400 && warm / opaque > 0.65;
}

module.exports = {
  NEWSPAPER_TONE,
  computeAdaptiveContrast,
  applySpeakerCutoutXeroxRgba,
  rgbaLooksSpeakerCutoutXerox
};
