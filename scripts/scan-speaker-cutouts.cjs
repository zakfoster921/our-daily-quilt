#!/usr/bin/env node
/**
 * READ-ONLY audit of every PNG in Storage `speaker-cutouts/`.
 * Reports which cutouts are still full color vs. newspaper-toned, and which ones the app's
 * "already toned" test (r > b + 4 on >65% of pixels) would wrongly skip.
 * Writes nothing to Firestore or Storage. Output: tmp/cutout-scan/report.{json,md}
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const sharp = require('sharp');
const { stats, classify } = require('./lib/cutout-color-stats.cjs');

const OUT = path.join(process.cwd(), 'tmp', 'cutout-scan');
const PREFIX = 'speaker-cutouts/';
const SCAN_EDGE = 360; // downscale for speed; ratios are scale-invariant

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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const bucket = initAdmin();
  const [files] = await bucket.getFiles({ prefix: PREFIX });
  const pngs = files.filter((f) => /\.png$/i.test(f.name));
  console.log(`[scan] ${pngs.length} PNG files under ${PREFIX}`);
  const rows = [];
  for (const f of pngs) {
    const name = f.name.slice(PREFIX.length);
    try {
      const [buf] = await f.download();
      const { data, info } = await sharp(buf, { failOn: 'none' })
        .ensureAlpha()
        .resize({ width: SCAN_EDGE, height: SCAN_EDGE, fit: 'inside', withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const s = stats(data, info.width, info.height);
      if (!s) {
        rows.push({ name, status: 'unreadable-or-tiny' });
        continue;
      }
      rows.push({ name, bytes: buf.length, updated: f.metadata?.updated || '', ...s, status: classify(s) });
    } catch (e) {
      rows.push({ name, status: `error: ${e.message}` });
    }
  }
  const order = { 'COLOR-skipped-by-app': 0, 'COLOR-borderline': 1, color: 2, 'toned-but-dark': 3, toned: 4 };
  rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
  const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ counts, rows }, null, 2));
  const md = [
    '# Speaker cutout scan (read-only)',
    '',
    '| status | count |',
    '|---|---|',
    ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '`warmApp` = share of pixels the app counts as "warm" (>0.65 means the app skips toning). `sepia` = share that match the real sepia tone (>0.65 = truly toned).',
    '',
    '| file | status | warmApp | sepia | chroma | medianLum | updated |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.status} | ${r.warmApp ?? ''} | ${r.sepia ?? ''} | ${r.chroma ?? ''} | ${r.medianLum ?? ''} | ${String(r.updated || '').slice(0, 10)} |`)
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  console.log('[scan] counts', JSON.stringify(counts));
  for (const r of rows) {
    if (r.status === 'toned' || r.status === 'toned-but-dark') continue;
    console.log(`[scan] row ${r.status} ${r.name} warmApp=${r.warmApp} sepia=${r.sepia} medianLum=${r.medianLum}`);
  }
}

main().catch((e) => {
  console.error('[scan] failed:', e.message);
  process.exit(1);
});
