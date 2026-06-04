#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Remove remove.bg grey/white polygon mattes from speaker cutout RGBA buffers.
 * Used before PNG optimize/upload and mirrored in-app (see quote speaker strip).
 */

function pixelIsWhiteMatte(r, g, b, a) {
  if (a < 64) return false;
  const lum = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return lum > 228 && sat < 38;
}

function pixelIsGreyHalo(r, g, b, a) {
  if (a < 48) return false;
  const lum = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return lum > 88 && lum < 238 && sat < 52 && a < 252;
}

function pixelIsSubject(r, g, b, a) {
  if (a < 52) return false;
  return !pixelIsWhiteMatte(r, g, b, a) && !pixelIsGreyHalo(r, g, b, a);
}

function inMarginBand(x, y, w, h) {
  return x < w * 0.2 || x > w * 0.8 || y < h * 0.1 || y > h * 0.9;
}

/**
 * @param {Buffer} data RGBA
 * @param {number} width
 * @param {number} height
 */
function stripSpeakerCutoutHaloRgba(data, width, height) {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const d = data;
  const keep = new Uint8Array(w * h);

  const x0 = Math.floor(w * 0.22);
  const x1 = Math.ceil(w * 0.78);
  const y0 = Math.floor(h * 0.12);
  const y1 = Math.ceil(h * 0.92);
  let seedX = -1;
  let seedY = -1;
  let bestLum = 999;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * w + x) * 4;
      if (!pixelIsSubject(d[i], d[i + 1], d[i + 2], d[i + 3])) continue;
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (lum < bestLum) {
        bestLum = lum;
        seedX = x;
        seedY = y;
      }
    }
  }

  if (seedX >= 0) {
    const queue = [[seedX, seedY]];
    keep[seedY * w + seedX] = 1;
    const neighbors = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ];
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const idx = ny * w + nx;
        if (keep[idx]) continue;
        const i = idx * 4;
        if (!pixelIsSubject(d[i], d[i + 1], d[i + 2], d[i + 3])) continue;
        keep[idx] = 1;
        queue.push([nx, ny]);
      }
    }
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const a = d[i + 3];
      let drop = false;
      if (seedX >= 0 && !keep[y * w + x]) drop = true;
      if (!drop && inMarginBand(x, y, w, h) && (pixelIsGreyHalo(r, g, b, a) || pixelIsWhiteMatte(r, g, b, a))) {
        drop = true;
      }
      if (drop) d[i + 3] = 0;
    }
  }
  return data;
}

module.exports = {
  stripSpeakerCutoutHaloRgba,
  pixelIsGreyHalo,
  pixelIsSubject,
  pixelIsWhiteMatte
};
