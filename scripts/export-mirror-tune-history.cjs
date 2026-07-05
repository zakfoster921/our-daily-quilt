#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Export quilt mirror admin tune history from Firestore for offline analysis.
 *
 *   npm run mirror-tune:export-history
 *   DATE_KEYS=2026-07-05,2026-06-10 npm run mirror-tune:export-history
 */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp', 'mirror-tune-history');

function initFirestore() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
    });
    return admin.firestore();
  }
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.join(ROOT, 'firebase-adminsdk-local.json');
  if (fs.existsSync(credPath)) {
    const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
    });
    return admin.firestore();
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID');
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
  return admin.firestore();
}

function parseDateKeys(raw) {
  return String(raw || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
}

async function main() {
  const db = initFirestore();
  const dateKeys = parseDateKeys(process.env.DATE_KEYS);
  const rows = [];

  if (dateKeys.length) {
    for (const dateKey of dateKeys) {
      const snap = await db.collection('quilts').doc(dateKey).get();
      if (!snap.exists) continue;
      const data = snap.data() || {};
      const history = Array.isArray(data.mirrorTuneHistory) ? data.mirrorTuneHistory : [];
      if (!history.length && !data.mirrorFlipX && !data.mirrorFlipY && !data.mirrorSeamNudgeY) continue;
      rows.push({
        dateKey,
        mirrorFlipX: data.mirrorFlipX === true,
        mirrorFlipY: data.mirrorFlipY === true,
        mirrorSeamNudgeY: Number(data.mirrorSeamNudgeY) || 0,
        mirrorTuneUpdatedAt: data.mirrorTuneUpdatedAt || null,
        mirrorTuneUpdatedBy: data.mirrorTuneUpdatedBy || null,
        blockCount: Array.isArray(data.blocks) ? data.blocks.length : null,
        history
      });
    }
  } else {
    const snap = await db.collection('quilts').get();
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const history = Array.isArray(data.mirrorTuneHistory) ? data.mirrorTuneHistory : [];
      const hasCurrent =
        Boolean(data.mirrorTuneUpdatedAt) ||
        data.mirrorFlipX !== true ||
        data.mirrorFlipY !== true ||
        Math.abs(Number(data.mirrorSeamNudgeY) || 0) > 1e-9;
      if (!history.length && !hasCurrent) return;
      rows.push({
        dateKey: doc.id,
        mirrorFlipX: data.mirrorFlipX === true,
        mirrorFlipY: data.mirrorFlipY === true,
        mirrorSeamNudgeY: Number(data.mirrorSeamNudgeY) || 0,
        mirrorTuneUpdatedAt: data.mirrorTuneUpdatedAt || null,
        mirrorTuneUpdatedBy: data.mirrorTuneUpdatedBy || null,
        blockCount: Array.isArray(data.blocks) ? data.blocks.length : null,
        history
      });
    });
    rows.sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(OUT_DIR, `mirror-tune-history-${stamp}.json`);
  const summary = {
    exportedAt: new Date().toISOString(),
    dayCount: rows.length,
    changeCount: rows.reduce((sum, row) => sum + (row.history?.length || 0), 0),
    rows
  };
  fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Wrote ${rows.length} day(s), ${summary.changeCount} change(s) → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
