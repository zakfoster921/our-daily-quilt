#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * 1990s local newspaper portrait treatment.
 * grayscale → adaptive contrast/brightness → shadow lift → sepia → organic film grain
 *
 * Replaces the old "punk flyer / photocopier" pass (high contrast, lifted blacks, band grain).
 * Registration offset is applied in CSS/UI layer on top of this.
 *
 * Dark-skinned subjects: stats ignore bright fabric/teeth so a white scarf can't hide a dark face,
 * then we soften contrast, raise brightness, and lift shadows so midtones don't crush to ink.
 */
const NEWSPAPER_TONE = Object.freeze({
  brightness: 1.32,
  sepia: 0.32,
  /** Darkest visible tone — avoids true-black fringe on cutout edges after multiply blend. */
  blackFloor: 62,
  /** Luminance noise amplitude at ~300×450px; scales slightly with resolution. */
  grainAmp: 7,
  /** Pixels brighter than this are treated as fabric/teeth, not subject skin. */
  highlightCut: 195
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

/** Seeded film grain — stronger in midtones, no photocopier banding. */
function applyNewspaperFilmGrainPass(data, width, height, seed = 'odq', opts = {}) {
  const d = data;
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const blackFloor = opts.blackFloor ?? NEWSPAPER_TONE.blackFloor;
  const refPixels = 300 * 450;
  const scale = Math.sqrt((w * h) / refPixels);
  const amp = (opts.grainAmp ?? NEWSPAPER_TONE.grainAmp) * Math.min(1.35, Math.max(0.85, scale));

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 8) continue;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const midWeight = 0.52 + 0.48 * (1 - Math.min(1, Math.abs(lum - 145) / 145));
      const n = hashSeedToUnit(seed, x, y) * 2 - 1;
      const delta = n * amp * midWeight;
      d[i] = Math.max(blackFloor, Math.min(255, Math.round(d[i] + delta)));
      d[i + 1] = Math.max(blackFloor, Math.min(255, Math.round(d[i + 1] + delta * 0.96)));
      d[i + 2] = Math.max(blackFloor, Math.min(255, Math.round(d[i + 2] + delta * 0.88)));
    }
  }
}

/**
 * Subject-aware tone stats.
 * - Excludes bright highlights (scarf/teeth) when measuring "how dark is this person"
 * - Low subject mean → softer contrast, higher brightness, shadow lift, higher black floor
 * Contrast range: 1.05–1.28
 */
function computeAdaptiveTone(data, width, height) {
  const len = width * height * 4;
  const highlightCut = NEWSPAPER_TONE.highlightCut;
  let sum = 0;
  let count = 0;
  let subjectSum = 0;
  let subjectCount = 0;
  for (let i = 0; i < len; i += 4) {
    if (data[i + 3] < 28) continue;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += lum;
    count += 1;
    if (lum <= highlightCut) {
      subjectSum += lum;
      subjectCount += 1;
    }
  }
  if (!count) {
    return {
      contrast: 1.12,
      brightness: NEWSPAPER_TONE.brightness,
      blackFloor: NEWSPAPER_TONE.blackFloor,
      shadowLift: 0
    };
  }
  const mean = sum / count;
  const subjectMean = subjectCount > 40 ? subjectSum / subjectCount : mean;
  let variance = 0;
  const varCount = subjectCount > 40 ? subjectCount : count;
  for (let i = 0; i < len; i += 4) {
    if (data[i + 3] < 28) continue;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (subjectCount > 40 && lum > highlightCut) continue;
    variance += (lum - subjectMean) ** 2;
  }
  const stdDev = Math.sqrt(variance / Math.max(1, varCount));
  const stdNorm = Math.min(1, Math.max(0, (stdDev - 18) / 55));
  // Darker faces (subjectMean ~40–90) → near-zero meanFactor → soft contrast
  const meanFactor = Math.min(1, subjectMean / 125) ** 2.2;
  const combined = meanFactor * (1 - stdNorm * 0.55);
  const contrast = Math.round((1.05 + 0.23 * combined) * 100) / 100;

  // Extra lift when the non-highlight subject is dark (classic dark-skin + bright cloth case).
  const darkGap = Math.max(0, Math.min(1, (95 - subjectMean) / 55));
  const brightness =
    Math.round((NEWSPAPER_TONE.brightness + darkGap * 0.28) * 100) / 100;
  const shadowLift = Math.round(darkGap * 42);
  const blackFloor = Math.round(NEWSPAPER_TONE.blackFloor + darkGap * 22);

  return { contrast, brightness, blackFloor, shadowLift, subjectMean, mean };
}

/** @deprecated use computeAdaptiveTone — kept for callers/tests */
function computeAdaptiveContrast(data, width, height) {
  return computeAdaptiveTone(data, width, height).contrast;
}

/**
 * Apply newspaper tone to RGBA buffer (opaque speaker pixels only; alpha preserved).
 * @param {Buffer|Uint8ClampedArray} data  Raw RGBA pixels, modified in place.
 * @param {number} width
 * @param {number} height
 * @param {string} [seed]  Stable per-speaker seed for film grain.
 */
function applySpeakerCutoutXeroxRgba(data, width, height, seed = 'odq') {
  const d = data;
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const { sepia } = NEWSPAPER_TONE;
  const tone = computeAdaptiveTone(d, w, h);
  const { contrast, brightness, blackFloor, shadowLift } = tone;

  // Pass 2: grayscale → shadow lift → contrast → brightness → sepia
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 8) {
        d[i + 3] = 0;
        continue;
      }

      // grayscale(1)
      let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

      // Lift dark midtones before contrast so darker skin keeps facial detail
      if (shadowLift > 0 && lum < 170) {
        const t = 1 - lum / 170;
        lum += shadowLift * t * t;
      }

      // contrast (CSS spec: slope*(val - 128) + 128)
      lum = contrast * (lum - 128) + 128;

      // brightness + black floor (charcoal, not ink-black)
      lum = Math.max(blackFloor, Math.min(255, lum * brightness));

      // sepia(amount) — interpolate toward full-sepia matrix
      const r = lum;
      const g = lum;
      const b = lum;
      const sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
      const sg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
      const sb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      d[i] = Math.round(r + (sr - r) * sepia);
      d[i + 1] = Math.round(g + (sg - g) * sepia);
      d[i + 2] = Math.round(b + (sb - b) * sepia);
    }
  }

  applyNewspaperFilmGrainPass(d, w, h, seed, { blackFloor });
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
  let opaque = 0;
  let warm = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 20) continue;
      opaque += 1;
      const r = d[i];
      const b = d[i + 2];
      // Sepia tint: red channel meaningfully higher than blue
      if (r > b + 4) warm += 1;
    }
  }
  return opaque > 400 && warm / opaque > 0.65;
}

module.exports = {
  NEWSPAPER_TONE,
  computeAdaptiveContrast,
  computeAdaptiveTone,
  applyNewspaperFilmGrainPass,
  applySpeakerCutoutXeroxRgba,
  rgbaLooksSpeakerCutoutXerox
};
