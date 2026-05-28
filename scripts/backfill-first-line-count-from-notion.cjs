#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-shot: copy first_line_count from quotes.notionProperties snapshot onto the catalog field.
 * Use when Notion sync ran before first_line_count was written to Firestore top-level.
 *
 *   node scripts/backfill-first-line-count-from-notion.cjs
 *   node scripts/backfill-first-line-count-from-notion.cjs --dry-run
 */
try {
  require('dotenv').config();
} catch (_) {
  /* optional */
}

const admin = require('firebase-admin');

function loadEnv() {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function initFirebase() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }
  return admin.firestore();
}

function firstLineCountFromDoc(data) {
  const top = Number(data?.first_line_count ?? data?.firstLineCount);
  if (Number.isFinite(top) && top > 0) return Math.round(top);
  const snap = data?.notionProperties?.first_line_count?.value;
  const n = Number(snap);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return 0;
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const db = initFirebase();
  const col = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const snap = await db.collection(col).get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const flc = firstLineCountFromDoc(data);
    if (!flc) {
      skipped += 1;
      continue;
    }
    const existing = Number(data.first_line_count ?? data.firstLineCount);
    if (Number.isFinite(existing) && Math.round(existing) === flc) {
      skipped += 1;
      continue;
    }
    console.log(`[backfill] ${doc.id} → first_line_count=${flc}`);
    if (!dryRun) {
      await doc.ref.set(
        {
          first_line_count: flc,
          firstLineCount: admin.firestore.FieldValue.delete()
        },
        { merge: true }
      );
    }
    updated += 1;
  }

  console.log(
    `[backfill] done dryRun=${dryRun} updated=${updated} skipped=${skipped} collection=${col}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
