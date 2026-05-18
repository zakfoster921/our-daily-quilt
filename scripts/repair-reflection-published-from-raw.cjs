#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Rebuild published reflection text from rawText and sync reflectionThemes.
 *
 * Usage (from project root):
 *   node scripts/repair-reflection-published-from-raw.cjs 2026-05-18 --dry-run
 *   node scripts/repair-reflection-published-from-raw.cjs 2026-05-18
 *   node scripts/repair-reflection-published-from-raw.cjs 2026-05-18 --response-id LXc8IjumRqJmBBWDsJrb
 */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const admin = require('firebase-admin');
const { repairReflectionPublishedFromRaw } = require('./lib/repair-reflection-published-from-raw-lib.cjs');

function isDateDocId(id) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(id || '').trim());
}

function initFirestore() {
  if (admin.apps.length) return admin.firestore();

  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (json && String(json).trim()) {
    const sa = JSON.parse(json);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || 'our-daily'
    });
    return admin.firestore();
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(path.resolve(credPath))) {
    const sa = JSON.parse(fs.readFileSync(path.resolve(credPath), 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || 'our-daily'
    });
    return admin.firestore();
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || 'our-daily').trim();
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId
  });
  return admin.firestore();
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
  const dateKey = String(args[0] || '').trim();
  let responseId = '';
  const ridIdx = process.argv.indexOf('--response-id');
  if (ridIdx >= 0) responseId = String(process.argv[ridIdx + 1] || '').trim();

  if (!isDateDocId(dateKey)) {
    console.error(
      'Usage: node scripts/repair-reflection-published-from-raw.cjs YYYY-MM-DD [--response-id DOC_ID] [--dry-run]'
    );
    process.exit(1);
  }

  const db = initFirestore();
  const result = await repairReflectionPublishedFromRaw(db, {
    appDateKey: dateKey,
    responseId,
    dryRun
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
