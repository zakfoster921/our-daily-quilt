#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Backfill studio_floor into notificationTypes for all enabled push tokens
 * that are missing it.
 *
 * Usage:
 *   node scripts/backfill-push-token-studio-floor.cjs --dry-run
 *   node scripts/backfill-push-token-studio-floor.cjs
 */
const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] != null && process.env[key] !== '') continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadDotEnv();

const admin = require('firebase-admin');

const dryRun = process.argv.includes('--dry-run');

if (!admin.apps.length) {
  const serviceAccountPath = path.join(__dirname, '..', 'firebase-adminsdk-local.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

async function run() {
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);

  const snap = await db
    .collection('pushTokens')
    .where('enabled', '==', true)
    .get();

  console.log(`Found ${snap.size} enabled push token(s).`);

  let alreadyHas = 0;
  let toUpdate = 0;
  let updated = 0;
  let failed = 0;

  const batch_size = 400;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const types = Array.isArray(data.notificationTypes) ? data.notificationTypes : [];

    if (types.includes('studio_floor')) {
      alreadyHas++;
      continue;
    }

    toUpdate++;
    const newTypes = [...new Set([...types, 'studio_floor'])];

    if (!dryRun) {
      batch.update(docSnap.ref, { notificationTypes: newTypes });
      batchCount++;

      if (batchCount >= batch_size) {
        try {
          await batch.commit();
          updated += batchCount;
        } catch (err) {
          console.error('Batch commit failed:', err.message);
          failed += batchCount;
        }
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (!dryRun && batchCount > 0) {
    try {
      await batch.commit();
      updated += batchCount;
    } catch (err) {
      console.error('Final batch commit failed:', err.message);
      failed += batchCount;
    }
  }

  console.log(`Already had studio_floor: ${alreadyHas}`);
  console.log(`Needed update: ${toUpdate}`);
  if (!dryRun) {
    console.log(`Updated: ${updated}`);
    if (failed > 0) console.error(`Failed: ${failed}`);
  }
  console.log('Done.');
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
