#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Crop halftone figure from intro mockups, trim, resize, export WebP.
 *
 * Usage:
 *   node scripts/optimize-intro-zak-assets.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const ASSETS_CURSOR = path.join(
  process.env.HOME || '',
  '.cursor/projects/Users-zakfoster-Library-Mobile-Documents-com-apple-CloudDocs-our-daily-improved/assets'
);
const MAX_W = 480;
const WEBP_Q = 78;
const WHITE_THRESH = 248;

const EXPORTS = [
  {
    out: 'intro-zak-peace.webp',
    src: '2-86b6aa59-aae3-4215-bb89-fc472987d289.png',
    // Crop below staggered copy — mockup text was baked into older exports.
    extractRatio: { top: 0.52, height: 0.48 },
    postTrimScale: 1
  },
  {
    out: 'intro-mission-heart.webp',
    src: '3-144df618-0cb5-425c-b78f-5359ce3ea749.png',
    // Crop below mission copy + “together” line.
    extractRatio: { top: 0.52, height: 0.40 }
  },
  {
    out: 'intro-welcome-lean.webp',
    src: '4-5c66352a-32b6-4e0f-8a83-2f0ad33fb2b8.png',
    extractRatio: { top: 0.34, height: 0.66 }
  }
];

function keyWhite(data, w, h) {
  const total = w * h;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    if (r >= WHITE_THRESH && g >= WHITE_THRESH && b >= WHITE_THRESH) {
      data[o + 3] = 0;
    }
  }
}

async function exportOne({ out, src, extractRatio, postTrimScale = 1 }) {
  const srcPath = path.join(ASSETS_CURSOR, src);
  const outPath = path.join(ROOT, 'assets', out);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Missing mockup source: ${srcPath}`);
  }

  const srcBytes = fs.statSync(srcPath).size;
  const meta = await sharp(srcPath).metadata();
  const top = Math.max(0, Math.floor(meta.height * extractRatio.top));
  const height = Math.max(1, Math.min(meta.height - top, Math.floor(meta.height * extractRatio.height)));

  const extracted = await sharp(srcPath)
    .extract({ left: 0, top, width: meta.width, height })
    .ensureAlpha()
    .png()
    .toBuffer();

  const { data, info } = await sharp(extracted).raw().toBuffer({ resolveWithObject: true });
  keyWhite(data, info.width, info.height);

  const trimmed = await sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .trim()
    .png()
    .toBuffer();

  const trimMeta = await sharp(trimmed).metadata();
  const scaledW = Math.max(1, Math.round(trimMeta.width * postTrimScale));
  const scaledH = Math.max(1, Math.round(trimMeta.height * postTrimScale));
  const scaled =
    postTrimScale === 1
      ? trimmed
      : await sharp(trimmed)
          .resize(scaledW, scaledH, { fit: 'inside' })
          .png()
          .toBuffer();
  const scaledMeta = await sharp(scaled).metadata();
  const scale = scaledMeta.width > MAX_W ? MAX_W / scaledMeta.width : 1;
  const outW = Math.max(1, Math.round(scaledMeta.width * scale));
  const outH = Math.max(1, Math.round(scaledMeta.height * scale));

  const outBuf = await sharp(scaled)
    .resize(outW, outH, { fit: 'inside' })
    .webp({ quality: WEBP_Q, effort: 6, alphaQuality: 80 })
    .toBuffer();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, outBuf);
  console.log(
    `[${out}] ${meta.width}x${meta.height} crop → ${outW}x${outH} ` +
      `${(srcBytes / 1024).toFixed(1)}KB → ${(outBuf.length / 1024).toFixed(1)}KB`
  );
  return outBuf.length;
}

async function main() {
  let total = 0;
  for (const item of EXPORTS) {
    total += await exportOne(item);
  }
  console.log(`\nTotal WebP: ${(total / 1024).toFixed(1)}KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
