#!/usr/bin/env node
/**
 * Batch-tone speaker cutouts that are still full color AND would be skipped by the app's
 * "already toned" test (warm > 65% of pixels but not sepia).
 *
 *   MODE=preview  (default)  Reads Storage, writes before/after images to tmp/cutout-batch/. Writes NOTHING to Firebase.
 *   MODE=apply               For each file: copies the original to speaker-cutouts-backup/<date>/<name>, then overwrites
 *                            speaker-cutouts/<name> with the toned PNG, keeping the same download token and metadata so
 *                            every Firestore link keeps working. Skips a file if its backup fails.
 *
 * ONLY="audre-lorde,toni-morrison"  limits to files whose name starts with one of the entries.
 * Default selection: every PNG classified COLOR-skipped-by-app.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const sharp = require('sharp');
const { stats, classify } = require('./lib/cutout-color-stats.cjs');
const { optimizeSpeakerCutoutPng } = require('./lib/optimize-speaker-cutout-png.cjs');

const OUT = path.join(process.cwd(), 'tmp', 'cutout-batch');
const PREFIX = 'speaker-cutouts/';
const MODE = String(process.env.MODE || 'preview').toLowerCase();
const ONLY = String(process.env.ONLY || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const MAX_FILES = 40;
const BACKUP_DAY = new Date().toISOString().slice(0, 10);
const BG = { r: 232, g: 184, b: 58 };

function initAdmin() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON required');
  const sa = JSON.parse(raw);
  const bucket = process.env.FIREBASE_STORAGE_BUCKET || 'our-daily.firebasestorage.app';
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id, storageBucket: bucket });
  }
  return admin.storage().bucket(bucket);
}

async function scanStats(buf) {
  const { data, info } = await sharp(buf, { failOn: 'none' })
    .ensureAlpha()
    .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return stats(data, info.width, info.height);
}

async function onYellow(buf, width) {
  return sharp(buf, { failOn: 'none' })
    .resize({ width, withoutEnlargement: false })
    .flatten({ background: BG })
    .png()
    .toBuffer();
}

async function sideBySide(beforeBuf, afterBuf) {
  const W = 320;
  const a = await onYellow(beforeBuf, W);
  const b = await onYellow(afterBuf, W);
  const ha = (await sharp(a).metadata()).height;
  const hb = (await sharp(b).metadata()).height;
  const H = Math.max(ha, hb);
  return sharp({ create: { width: W * 2 + 8, height: H, channels: 3, background: '#ffffff' } })
    .composite([
      { input: a, left: 0, top: 0 },
      { input: b, left: W + 8, top: 0 }
    ])
    .png()
    .toBuffer();
}

async function main() {
  if (MODE !== 'preview' && MODE !== 'apply') throw new Error(`MODE must be preview or apply (got ${MODE})`);
  fs.mkdirSync(OUT, { recursive: true });
  const bucket = initAdmin();
  const [files] = await bucket.getFiles({ prefix: PREFIX });
  const pngs = files.filter((f) => /\.png$/i.test(f.name));
  console.log(`[batch] mode=${MODE} ${pngs.length} PNG files; only=${ONLY.join('|') || '(auto: COLOR-skipped-by-app)'}`);

  const picked = [];
  for (const f of pngs) {
    const name = f.name.slice(PREFIX.length);
    if (ONLY.length && !ONLY.some((o) => name.toLowerCase().startsWith(o))) continue;
    const [buf] = await f.download();
    const s = await scanStats(buf);
    if (!s) continue;
    const status = classify(s);
    if (ONLY.length) {
      if (status === 'toned') {
        console.log(`[batch] skip ${name}: already toned`);
        continue;
      }
    } else if (status !== 'COLOR-skipped-by-app') {
      continue;
    }
    picked.push({ file: f, name, buf, before: s, status });
    if (picked.length > MAX_FILES) throw new Error(`more than ${MAX_FILES} files selected; narrow with ONLY`);
  }
  console.log(`[batch] ${picked.length} file(s) selected`);

  const results = [];
  for (const p of picked) {
    const row = { name: p.name, status: p.status, beforeWarm: p.before.warmApp, beforeSepia: p.before.sepia };
    try {
      const out = await optimizeSpeakerCutoutPng(p.buf, { maxEdge: 4000, xeroxSeed: p.name });
      const after = await scanStats(out.buffer);
      row.afterSepia = after?.sepia;
      row.afterMedianLum = after?.medianLum;
      row.afterClass = after ? classify(after) : 'unknown';
      if (!after || after.sepia <= 0.65) throw new Error(`toned output does not look toned (sepia=${after?.sepia})`);
      fs.writeFileSync(path.join(OUT, `${p.name.replace(/\.png$/i, '')}-compare.png`), await sideBySide(p.buf, out.buffer));
      if (MODE === 'apply') {
        const backupPath = `speaker-cutouts-backup/${BACKUP_DAY}/${p.name}`;
        await p.file.copy(bucket.file(backupPath));
        const [exists] = await bucket.file(backupPath).exists();
        if (!exists) throw new Error('backup missing after copy; not overwriting');
        const [meta] = await p.file.getMetadata();
        const tokens = meta?.metadata?.firebaseStorageDownloadTokens;
        if (!tokens) throw new Error('original has no download token; not overwriting');
        await p.file.save(out.buffer, {
          resumable: false,
          metadata: {
            contentType: 'image/png',
            cacheControl: meta.cacheControl || 'public, max-age=31536000',
            metadata: { firebaseStorageDownloadTokens: tokens }
          }
        });
        const [verify] = await p.file.download();
        const v = await scanStats(verify);
        row.verified = Boolean(v && v.sepia > 0.65);
        row.backup = backupPath;
        console.log(`[batch] applied ${p.name} backup=${backupPath} verified=${row.verified}`);
      } else {
        console.log(`[batch] preview ${p.name} warm ${p.before.warmApp} -> sepia ${after.sepia}`);
      }
      row.result = MODE === 'apply' ? 'applied' : 'previewed';
    } catch (e) {
      row.result = `failed: ${e.message}`;
      console.error(`[batch] ${p.name}: ${e.message}`);
    }
    results.push(row);
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ mode: MODE, results }, null, 2));
  const failed = results.filter((r) => String(r.result).startsWith('failed')).length;
  console.log(`[batch] done mode=${MODE} ok=${results.length - failed} failed=${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error('[batch] failed:', e.message);
  process.exit(1);
});
