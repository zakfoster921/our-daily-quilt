#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Trim, resize, and compress mood collage PNGs for fast web load.
 * Source: raw uploads (819×1024). Output: assets/mood-collage/*.webp
 *
 * Usage: node scripts/optimize-mood-collage-assets.cjs [sourceDir]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'mood-collage');
const MAX_WIDTH = 480;
const WEBP_QUALITY = 78;
const BLACK_KEY_THRESHOLD = 34;
const BLACK_KEY_SOFTNESS = 20;
const WHITE_KEY_THRESHOLD = 252;
const WHITE_KEY_SOFTNESS = 18;

const SOURCE_MAP = {
  circle: 'asdasd-8a07e585-6ea3-4ca8-8137-f011612b7cc8.png',
  triangle: '5-72e34f03-fab2-4d43-b408-59a951e6bb06.png',
  tapes: '6-a05313f6-7401-4e7e-a6de-4ab976362a07.png',
  penny: '7-f0d8a7e9-0402-4d7e-a55d-cbb9048c6db8.png',
  tapeCosmos: 'tape-bf222c37-0344-48c3-be56-6024dd0ac3d3.png'
};

/** Sky cutout crop inside full-frame upload (above cosmos strip). */
const SKY_CROP = { left: 0, top: 0, width: 819, height: 795 };

/** Keep only the full-width center band — drops tapered/scissor ends and stray blobs. */
function rectangularStripBounds(data, width, height) {
  const spans = [];
  for (let y = 0; y < height; y++) {
    let f = -1;
    let l = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (f < 0) f = x;
        l = x;
      }
    }
    if (f >= 0) spans.push({ y, f, l, w: l - f + 1 });
  }
  if (!spans.length) return null;
  const maxW = Math.max(...spans.map((s) => s.w));
  const dense = spans.filter((s) => s.w >= maxW * 0.98);
  if (dense.length < 4) return null;
  const y0 = dense[0].y;
  const y1 = dense[dense.length - 1].y;
  const minX = Math.max(...dense.map((s) => s.f));
  const maxX = Math.min(...dense.map((s) => s.l));
  if (maxX <= minX) return null;
  return { left: minX, top: y0, width: maxX - minX + 1, height: y1 - y0 + 1 };
}

async function normalizeCosmosStrip(inputBuffer) {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  keyWhiteBackgroundRgba(data, info.width, info.height);
  const rect = rectangularStripBounds(data, info.width, info.height);
  let buf = await sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .png()
    .toBuffer();
  if (rect) buf = await sharp(buf).extract(rect).png().toBuffer();
  return sharp(buf).trim().png().toBuffer();
}

function formatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n}B`;
  return `${(n / 1024).toFixed(1)}KB`;
}

function resolveSourceDir(arg) {
  if (arg) return path.resolve(arg);
  return path.join(
    process.env.HOME || '',
    '.cursor/projects/Users-zakfoster-Library-Mobile-Documents-com-apple-CloudDocs-our-daily-improved/assets'
  );
}

async function resizeToMaxWidth(input, maxWidth) {
  const meta = await sharp(input).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  if (w <= maxWidth) return sharp(input).ensureAlpha();
  return sharp(input)
    .ensureAlpha()
    .resize(maxWidth, Math.round((h * maxWidth) / w), {
      fit: 'inside',
      withoutEnlargement: true
    });
}

/** Remove photo-studio black: flood from image edges through near-black pixels. */
function keyBlackBackgroundRgba(data, width, height, threshold = BLACK_KEY_THRESHOLD) {
  const total = width * height;
  const bg = new Uint8Array(total);
  const queue = new Array(total);
  let head = 0;
  let tail = 0;

  function isBgPixel(i) {
    const o = i * 4;
    const max = Math.max(data[o], data[o + 1], data[o + 2]);
    return max <= threshold;
  }

  function trySeed(x, y) {
    const i = y * width + x;
    if (bg[i] || !isBgPixel(i)) return;
    bg[i] = 1;
    queue[tail++] = i;
  }

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) trySeed(x - 1, y);
    if (x < width - 1) trySeed(x + 1, y);
    if (y > 0) trySeed(x, y - 1);
    if (y < height - 1) trySeed(x, y + 1);
  }

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (bg[i]) {
      data[o + 3] = 0;
      continue;
    }
    const max = Math.max(data[o], data[o + 1], data[o + 2]);
    if (max <= threshold + BLACK_KEY_SOFTNESS) {
      const t = (max - threshold) / BLACK_KEY_SOFTNESS;
      data[o + 3] = Math.min(data[o + 3], Math.round(Math.max(0, Math.min(1, t)) * 255));
    }
  }
}

/** Remove photo-studio white: flood from image edges through near-white pixels. */
function keyWhiteBackgroundRgba(data, width, height, threshold = WHITE_KEY_THRESHOLD) {
  const total = width * height;
  const bg = new Uint8Array(total);
  const queue = new Array(total);
  let head = 0;
  let tail = 0;

  function isBgPixel(i) {
    const o = i * 4;
    const min = Math.min(data[o], data[o + 1], data[o + 2]);
    return min >= threshold;
  }

  function trySeed(x, y) {
    const i = y * width + x;
    if (bg[i] || !isBgPixel(i)) return;
    bg[i] = 1;
    queue[tail++] = i;
  }

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) trySeed(x - 1, y);
    if (x < width - 1) trySeed(x + 1, y);
    if (y > 0) trySeed(x, y - 1);
    if (y < height - 1) trySeed(x, y + 1);
  }

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (bg[i]) {
      data[o + 3] = 0;
      continue;
    }
    const min = Math.min(data[o], data[o + 1], data[o + 2]);
    if (min >= threshold - WHITE_KEY_SOFTNESS) {
      const t = (threshold - min) / WHITE_KEY_SOFTNESS;
      data[o + 3] = Math.min(data[o + 3], Math.round(Math.max(0, Math.min(1, t)) * 255));
    }
  }
}

async function keyedPipeline(inputBuffer, { studio = 'black' } = {}) {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (studio === 'white') {
    keyWhiteBackgroundRgba(data, info.width, info.height);
  } else {
    keyBlackBackgroundRgba(data, info.width, info.height);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().png().toBuffer();
}

async function writeWebp(pipeline, outPath, label) {
  const before = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
  const { data, info } = await pipeline
    .webp({ quality: WEBP_QUALITY, effort: 6, alphaQuality: 80 })
    .toBuffer({ resolveWithObject: true });
  fs.writeFileSync(outPath, data);
  console.log(`[${label}] ${info.width}x${info.height} ${formatBytes(data.length)} → ${path.relative(ROOT, outPath)}`);
  return { width: info.width, height: info.height, bytes: data.length, path: outPath };
}

function findTapeSplitRow(data, width, height) {
  const rowBright = [];
  for (let y = 0; y < height; y++) {
    let sum = 0;
    let n = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < 8) continue;
      sum += data[i] + data[i + 1] + data[i + 2];
      n++;
    }
    rowBright.push(n ? sum / n : 0);
  }
  const y0 = Math.floor(height * 0.35);
  const y1 = Math.floor(height * 0.65);
  let minY = y0;
  let minV = Infinity;
  for (let y = y0; y < y1; y++) {
    if (rowBright[y] < minV) {
      minV = rowBright[y];
      minY = y;
    }
  }
  return minY;
}

async function main() {
  const sourceDir = resolveSourceDir(process.argv[2]);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let totalBytes = 0;
  const manifest = { maxWidth: MAX_WIDTH, webpQuality: WEBP_QUALITY, layers: {} };

  for (const key of ['circle', 'triangle', 'penny']) {
    const srcPath = path.join(sourceDir, SOURCE_MAP[key]);
    if (!fs.existsSync(srcPath)) {
      console.error(`Missing source: ${srcPath}`);
      process.exit(1);
    }
    const srcBytes = fs.statSync(srcPath).size;
    let circleInput = await sharp(srcPath).toBuffer();
    if (key === 'circle') {
      circleInput = await sharp(srcPath).extract(SKY_CROP).toBuffer();
    }
    const keyedBuf = await keyedPipeline(circleInput, {
      studio: key === 'circle' ? 'white' : 'black'
    });
    let pipeline = await resizeToMaxWidth(keyedBuf, MAX_WIDTH);
    const outPath = path.join(OUT_DIR, `${key}.webp`);
    const result = await writeWebp(pipeline, outPath, key);
    manifest.layers[key] = {
      file: `assets/mood-collage/${key}.webp`,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      sourceBytes: srcBytes
    };
    totalBytes += result.bytes;
  }

  const tapesSrc = path.join(sourceDir, SOURCE_MAP.tapes);
  const trimmed = await keyedPipeline(await sharp(tapesSrc).toBuffer());
  const { data: raw, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const gapRow = findTapeSplitRow(raw, info.width, info.height);
  const topH = Math.max(1, gapRow - 2);
  const botTop = Math.min(info.height - 1, gapRow + 3);
  const botH = info.height - botTop;

  for (const [key, extract] of [
    ['tape-good', { left: 0, top: 0, width: info.width, height: topH }],
    ['tape-rough', { left: 0, top: botTop, width: info.width, height: botH }]
  ]) {
    const srcBytes = fs.statSync(tapesSrc).size;
    let pipeline = sharp(trimmed).extract(extract);
    pipeline = await resizeToMaxWidth(await pipeline.toBuffer(), MAX_WIDTH);
    const outPath = path.join(OUT_DIR, `${key}.webp`);
    const result = await writeWebp(pipeline, outPath, key);
    manifest.layers[key] = {
      file: `assets/mood-collage/${key}.webp`,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      mood: key === 'tape-good' ? 'good' : 'rough',
      scratch: true,
      sourceBytes: srcBytes
    };
    totalBytes += result.bytes;
  }

  const cosmosSrc = path.join(sourceDir, SOURCE_MAP.tapeCosmos);
  if (fs.existsSync(cosmosSrc)) {
    const cosmosSrcBytes = fs.statSync(cosmosSrc).size;
    const input = await sharp(cosmosSrc).ensureAlpha().png().toBuffer();
    const normalized = await normalizeCosmosStrip(input);
    let cosmosPipeline = await resizeToMaxWidth(normalized, MAX_WIDTH);
    const cosmosOut = path.join(OUT_DIR, 'tape-cosmos.webp');
    const cosmosResult = await writeWebp(cosmosPipeline, cosmosOut, 'tape-cosmos');
    manifest.layers['tape-cosmos'] = {
      file: 'assets/mood-collage/tape-cosmos.webp',
      width: cosmosResult.width,
      height: cosmosResult.height,
      bytes: cosmosResult.bytes,
      decorative: true,
      sourceBytes: cosmosSrcBytes
    };
    totalBytes += cosmosResult.bytes;
  } else {
    console.warn(`Skipping tape-cosmos (missing ${cosmosSrc})`);
  }

  manifest.totalBytes = totalBytes;
  manifest.transparentKey = { blackThreshold: BLACK_KEY_THRESHOLD };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nTotal optimized: ${formatBytes(totalBytes)} (webp + manifest)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
