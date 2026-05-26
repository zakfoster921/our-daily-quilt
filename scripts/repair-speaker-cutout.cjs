#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-shot repair when speaker cutout / assignment state is broken:
 * - Clears stale cutout fields on the catalog quote (+ today's denormalized quote doc)
 * - Recreates dailyQuoteAssignments/{dateKey} from Notion date_scheduled (reconcile)
 * - Regenerates cutout from speaker_image_url (remove.bg) with --force
 *
 * Usage:
 *   node scripts/repair-speaker-cutout.cjs --date=today
 *   node scripts/repair-speaker-cutout.cjs --date=2026-05-26 --doc=<notion-page-id>
 *   node scripts/repair-speaker-cutout.cjs --date=today --dry-run
 */
const { spawnSync } = require('child_process');
const path = require('path');

try {
  require('dotenv').config();
} catch (_) {
  // optional
}

const admin = require('firebase-admin');
const { getAppDateKey, isDateKey, resolveStartDateKey } = require('./lib/app-date-key.cjs');

function parseArgs(argv) {
  const args = { date: 'today', doc: '', dryRun: false, skipReconcile: false, skipCutout: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--skip-reconcile') args.skipReconcile = true;
    else if (a === '--skip-cutout') args.skipCutout = true;
    else if (a.startsWith('--date=')) args.date = a.slice('--date='.length).trim();
    else if (a.startsWith('--doc=')) args.doc = a.slice('--doc='.length).trim();
  }
  args.dateKey = resolveStartDateKey(args.date || 'today');
  return args;
}

function initFirebase() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
    });
  } else {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error('Missing GOOGLE_APPLICATION_CREDENTIALS_JSON or FIREBASE_PROJECT_ID');
    }
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
    });
  }
  return admin.firestore();
}

function cutoutClearPayload() {
  const del = admin.firestore.FieldValue.delete();
  return {
    speaker_cutout_url: del,
    speaker_cutout_source_url: del,
    speakerCutoutUrl: del,
    speakerCutoutSourceUrl: del,
    speakerCutoutUpdatedAt: del,
    speaker_cutout_updated_at: del
  };
}

function runNodeScript(scriptName, scriptArgs) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} exited with code ${result.status ?? 'unknown'}`);
  }
}

async function resolveSourceId(db, opts) {
  const quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';

  if (opts.doc) {
    const snap = await db.collection(quotesCollection).doc(opts.doc).get();
    if (!snap.exists) throw new Error(`No catalog quote: ${quotesCollection}/${opts.doc}`);
    return { sourceId: opts.doc, author: String((snap.data() || {}).author || '').trim() };
  }

  const assignSnap = await db.collection(assignmentsCollection).doc(opts.dateKey).get();
  if (assignSnap.exists) {
    const sourceId = String((assignSnap.data() || {}).sourceId || '').trim();
    if (sourceId) {
      const catalog = await db.collection(quotesCollection).doc(sourceId).get();
      return {
        sourceId,
        author: String((catalog.data() || {}).author || (assignSnap.data() || {}).authorSnapshot || '').trim()
      };
    }
  }

  const scheduledSnap = await db.collection(quotesCollection).where('date_scheduled', '==', opts.dateKey).get();
  for (const docSnap of scheduledSnap.docs) {
    const d = docSnap.data() || {};
    if (String(d.source || '') !== 'notion') continue;
    const portrait = String(d.speaker_image_url ?? d.speakerImageUrl ?? '').trim();
    if (!portrait) continue;
    return { sourceId: docSnap.id, author: String(d.author || '').trim() };
  }

  throw new Error(
    `Could not resolve catalog quote for ${opts.dateKey}. Pass --doc=<notion-page-id> or restore dailyQuoteAssignments/${opts.dateKey} first.`
  );
}

async function main() {
  const opts = parseArgs(process.argv);
  const db = initFirebase();
  const quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const { sourceId, author } = await resolveSourceId(db, opts);

  const catalogRef = db.collection(quotesCollection).doc(sourceId);
  const catalogSnap = await catalogRef.get();
  if (!catalogSnap.exists) throw new Error(`Missing ${quotesCollection}/${sourceId}`);
  const catalog = catalogSnap.data() || {};
  const portrait = String(catalog.speaker_image_url ?? catalog.speakerImageUrl ?? '').trim();
  if (!portrait) {
    throw new Error(
      `Catalog quote ${sourceId} has no speaker_image_url. Update Notion "Speaker image URL" and run npm run sync:quotes first.`
    );
  }

  const scheduled = String(catalog.date_scheduled ?? catalog.dateScheduled ?? '').trim();
  if (scheduled && scheduled !== opts.dateKey) {
    console.warn(
      `[repair] warning: catalog date_scheduled=${scheduled} but --date=${opts.dateKey}; reconcile will use Notion date`
    );
  }

  console.log(`[repair] dateKey=${opts.dateKey} sourceId=${sourceId} author=${author || '(unknown)'}`);
  console.log(`[repair] portrait ${portrait.slice(0, 96)}${portrait.length > 96 ? '…' : ''}`);

  if (opts.dryRun) {
    console.log('[repair] dry-run: would clear cutout fields, reconcile assignments, run cutouts --force');
    return;
  }

  const clearPayload = cutoutClearPayload();
  await catalogRef.set(clearPayload, { merge: true });
  console.log(`[repair] cleared cutout fields on ${quotesCollection}/${sourceId}`);

  const dailyRef = db.collection(quotesCollection).doc(opts.dateKey);
  const dailySnap = await dailyRef.get();
  if (dailySnap.exists) {
    await dailyRef.set(clearPayload, { merge: true });
    console.log(`[repair] cleared cutout fields on ${quotesCollection}/${opts.dateKey}`);
  }

  if (!opts.skipReconcile) {
    console.log('[repair] running reconcile-assignment-dates-from-notion…');
    runNodeScript('reconcile-assignment-dates-from-notion.cjs', [`--start=${opts.dateKey}`]);
  }

  if (!opts.skipCutout) {
    console.log('[repair] regenerating speaker cutout (remove.bg)…');
    runNodeScript('process-speaker-cutouts.cjs', [`--doc=${sourceId}`, '--force', '--limit=1']);
  }

  const after = (await catalogRef.get()).data() || {};
  const cutout = String(after.speaker_cutout_url ?? after.speakerCutoutUrl ?? '').trim();
  const source = String(after.speaker_cutout_source_url ?? after.speakerCutoutSourceUrl ?? '').trim();
  console.log('[repair] done');
  console.log(`[repair] catalog speaker_cutout_url: ${cutout || '(empty — cutout step may have failed)'}`);
  console.log(`[repair] catalog speaker_cutout_source_url matches portrait: ${source === portrait}`);
  console.log(`[repair] verify dailyQuoteAssignments/${opts.dateKey} and Storage speaker-cutouts/`);
}

main().catch((error) => {
  console.error('[repair] failed:', error.message);
  process.exit(1);
});
