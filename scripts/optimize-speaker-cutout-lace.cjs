#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Key black studio bg, crop open bottom (no lower lace rail), resize, webp.
 *
 * Usage:
 *   node scripts/optimize-speaker-cutout-lace.cjs [sourcePng]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DEFAULT_SRC = path.join(
  process.env.HOME || '',
  '.cursor/projects/Users-zakfoster-Library-Mobile-Documents-com-apple-CloudDocs-our-daily-improved/assets/laceframe-630a1935-9f53-44a6-9e5e-1a9c22791a77.png'
);
const OUT = path.join(ROOT, 'assets', 'speaker-cutout-lace.webp');
const MAX_W = 480;
const WEBP_Q = 78;
const THRESH = 34;
const SOFT = 20;

function keyBlack(data, w, h) {
  const total = w * h;
  const bg = new Uint8Array(total);
  const queue = new Array(total);
  let head = 0;
  let tail = 0;

  function isBg(i) {
    const o = i * 4;
    return Math.max(data[o], data[o + 1], data[o + 2]) <= THRESH;
  }

  function seed(x, y) {
    const i = y * w + x;
    if (bg[i] || !isBg(i)) return;
    bg[i] = 1;
    queue[tail++] = i;
  }

  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (bg[i]) {
      data[o + 3] = 0;
      continue;
    }
    const max = Math.max(data[o], data[o + 1], data[o + 2]);
    if (max <= THRESH + SOFT) {
      const t = (max - THRESH) / SOFT;
      data[o + 3] = Math.min(data[o + 3], Math.round(Math.max(0, Math.min(1, t)) * 255));
    }
  }
}

/** Row above bottom lace rail — open frame sits on speaker name strip. */
function openBottomRow(data, w, h) {
  const cx0 = Math.floor(w * 0.35);
  const cx1 = Math.floor(w * 0.65);
  let borderStart = h - 1;
  for (let y = h - 1; y >= 0; y--) {
    let c = 0;
    for (let x = cx0; x <= cx1; x++) {
      if (data[(y * w + x) * 4 + 3] > 30) c++;
    }
    if (c / (cx1 - cx0 + 1) > 0.12) borderStart = y;
    else if (borderStart < h - 1) break;
  }
  for (let y = borderStart - 1; y >= 0; y--) {
    let c = 0;
    for (let x = cx0; x <= cx1; x++) {
      if (data[(y * w + x) * 4 + 3] > 30) c++;
    }
    if (c / (cx1 - cx0 + 1) < 0.02) return y;
  }
  return borderStart;
}

async function main() {
  const src = path.resolve(process.argv[2] || DEFAULT_SRC);
  if (!fs.existsSync(src)) {
    console.error(`Missing source: ${src}`);
    process.exit(1);
  }
  const srcBytes = fs.statSync(src).size;
  const keyedSrc = await sharp(src).ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(keyedSrc).raw().toBuffer({ resolveWithObject: true });
  keyBlack(data, info.width, info.height);

  const trimmedPng = await sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .trim()
    .png()
    .toBuffer();

  const { data: trimData, info: trimInfo } = await sharp(trimmedPng)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const openBottom = openBottomRow(trimData, trimInfo.width, trimInfo.height);
  const cropH = Math.max(1, Math.min(trimInfo.height, openBottom + 1));

  const cropped = await sharp(trimmedPng)
    .extract({ left: 0, top: 0, width: trimInfo.width, height: cropH })
    .png()
    .toBuffer();

  const meta = await sharp(cropped).metadata();
  const scale = meta.width > MAX_W ? MAX_W / meta.width : 1;
  const outW = Math.max(1, Math.round(meta.width * scale));
  const outH = Math.max(1, Math.round(meta.height * scale));
  const outBuf = await sharp(cropped)
    .resize(outW, outH, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_Q, effort: 6, alphaQuality: 80 })
    .toBuffer();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, outBuf);
  console.log(
    `[speaker-cutout-lace] ${info.width}x${info.height} → ${outW}x${outH} ` +
      `${(srcBytes / 1024).toFixed(1)}KB → ${(outBuf.length / 1024).toFixed(1)}KB ` +
      `(crop open bottom @ y=${openBottom}) → ${path.relative(ROOT, OUT)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
