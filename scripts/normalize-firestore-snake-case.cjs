#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * normalize-firestore-snake-case.cjs
 *
 * One-time backfill: collapse dual-written camelCase + snake_case fields down
 * to snake_case only. The sync (sync-notion-to-firestore.cjs) and several
 * client/server paths currently write both copies, which lets the camelCase
 * version drift stale when only snake_case is edited (in Notion or by hand).
 *
 * For each known pair (camelCase, snake_case) on each doc:
 *   - If snake_case key is present, trust it (user-edited form).
 *       -> Log a "drift" warning if camelCase value disagreed.
 *       -> Delete the camelCase key.
 *   - Else if only camelCase is present, rename camelCase -> snake_case.
 *   - Else skip the pair.
 *
 * Default is DRY-RUN. Use --commit to actually write/delete.
 *
 * Usage:
 *   node scripts/normalize-firestore-snake-case.cjs                 # dry-run, all collections
 *   node scripts/normalize-firestore-snake-case.cjs --commit        # write
 *   node scripts/normalize-firestore-snake-case.cjs --collection=quotes
 *   node scripts/normalize-firestore-snake-case.cjs --doc=<docId>   # single doc (any collection)
 *   node scripts/normalize-firestore-snake-case.cjs --verbose       # print every doc, even unchanged
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS_JSON (or applicationDefault credentials)
 *      FIRESTORE_QUOTES_COLLECTION (default: quotes)
 *      FIRESTORE_DAILY_QUOTES_COLLECTION (default: dailyQuoteUsage)
 */

try {
  require('dotenv').config();
} catch (_) {
  // dotenv is optional; fall back to a tiny inline .env parser so this script
  // works without `npm install dotenv`. CI and Railway set env vars directly.
  loadDotEnvFallback();
}

function loadDotEnvFallback() {
  const fs = require('fs');
  const path = require('path');
  const candidates = [path.join(process.cwd(), '.env'), path.join(__dirname, '..', '.env')];
  for (const file of candidates) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (_) {
      continue;
    }
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Z0-9_]+$/i.test(key)) continue;
      if (process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    return;
  }
}

const admin = require('firebase-admin');

const FIELD_PAIRS = [
  ['artRecs', 'art_recs'],
  ['artRecsType', 'art_recs_type'],
  ['communityPrompt', 'community_prompt'],
  ['smallAct', 'small_act'],
  ['whatIf', 'what_if'],
  ['watchFor', 'watch_for'],
  ['goodDay', 'good_day'],
  ['roughDay', 'rough_day'],
  ['igCaption', 'ig_caption'],
  ['speakerImageUrl', 'speaker_image_url'],
  ['speakerCutoutUrl', 'speaker_cutout_url'],
  ['speakerCutoutSourceUrl', 'speaker_cutout_source_url'],
  ['speakerCutoutUpdatedAt', 'speaker_cutout_updated_at'],
  ['speakerDates', 'speaker_dates'],
  ['speakerBorn', 'speaker_born'],
  ['speakerDied', 'speaker_died'],
  ['speakerGuideLine', 'speaker_guide_line'],
  ['imageAttribution', 'image_attribution'],
  ['submittedBy', 'submitted_by'],
  ['dateScheduled', 'date_scheduled'],
  ['itemNo', 'item_no'],
  ['lastUsedDate', 'last_used_date'],
  ['sourceNotes', 'source_notes'],
  ['submittedAt', 'submitted_at'],
  ['submittedVia', 'submitted_via'],
  ['timesUsed', 'times_used']
];

const DEFAULT_COLLECTIONS = [
  { envVar: 'FIRESTORE_QUOTES_COLLECTION', fallback: 'quotes' },
  { envVar: 'FIRESTORE_DAILY_QUOTES_COLLECTION', fallback: 'dailyQuoteUsage' },
  { envVar: 'FIRESTORE_ASSIGNMENTS_COLLECTION', fallback: 'dailyQuoteAssignments' },
  { envVar: null, fallback: 'instagram-images' }
];

function parseArgs(argv) {
  const args = {
    commit: false,
    verbose: false,
    collection: '',
    docId: ''
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--commit') args.commit = true;
    else if (a === '--dry-run') args.commit = false;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a.startsWith('--collection=')) args.collection = a.slice('--collection='.length).trim();
    else if (a.startsWith('--doc=')) args.docId = a.slice('--doc='.length).trim();
  }
  return args;
}

function initFirestore() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }
  return admin.firestore();
}

function resolveCollections(filter) {
  const all = DEFAULT_COLLECTIONS.map(({ envVar, fallback }) =>
    (envVar && process.env[envVar] && process.env[envVar].trim()) || fallback
  );
  if (!filter) return all;
  const wanted = filter.trim();
  const match = all.find((name) => name === wanted);
  if (!match) {
    throw new Error(`--collection=${wanted} not in default set: ${all.join(', ')}`);
  }
  return [match];
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim();
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (_) {
      return false;
    }
  }
  return false;
}

function preview(value) {
  if (value == null) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.length > 80 ? `${value.slice(0, 80)}…` : value;
    return JSON.stringify(trimmed);
  }
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 80 ? `${json.slice(0, 80)}…` : json;
    } catch (_) {
      return '[object]';
    }
  }
  return String(value);
}

function planForDoc(data) {
  const updates = {};
  const deletions = [];
  const renames = [];
  const drifts = [];

  for (const [camel, snake] of FIELD_PAIRS) {
    const hasCamel = hasOwn(data, camel);
    const hasSnake = hasOwn(data, snake);

    if (!hasCamel && !hasSnake) continue;

    if (hasCamel && hasSnake) {
      if (!valuesEqual(data[camel], data[snake])) {
        drifts.push({ camel, snake, camelValue: data[camel], snakeValue: data[snake] });
      }
      deletions.push(camel);
    } else if (hasCamel && !hasSnake) {
      updates[snake] = data[camel];
      deletions.push(camel);
      renames.push({ camel, snake });
    }
  }

  return { updates, deletions, renames, drifts };
}

function buildFirestoreUpdate(plan) {
  const payload = { ...plan.updates };
  for (const key of plan.deletions) {
    payload[key] = admin.firestore.FieldValue.delete();
  }
  return payload;
}

async function processCollection(db, collectionName, opts, totals) {
  let query = db.collection(collectionName);
  let snap;
  if (opts.docId) {
    const docSnap = await query.doc(opts.docId).get();
    if (!docSnap.exists) {
      console.log(`  (no doc "${opts.docId}" in ${collectionName})`);
      return;
    }
    snap = { docs: [docSnap], size: 1 };
  } else {
    snap = await query.get();
  }

  console.log(`\n── ${collectionName} (${snap.size} docs) ──`);

  let changedDocs = 0;
  let totalDriftFields = 0;
  let totalRenames = 0;
  let totalDeletes = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const plan = planForDoc(data);
    const hasChanges = plan.deletions.length > 0 || plan.renames.length > 0;

    if (!hasChanges) {
      if (opts.verbose) console.log(`  ✓ ${docSnap.id}: clean`);
      continue;
    }

    changedDocs += 1;
    totalRenames += plan.renames.length;
    totalDeletes += plan.deletions.length;
    totalDriftFields += plan.drifts.length;

    console.log(`  • ${docSnap.id}`);
    for (const r of plan.renames) {
      console.log(`      rename ${r.camel} → ${r.snake}  ${preview(data[r.camel])}`);
    }
    for (const d of plan.drifts) {
      console.log(`      drift  ${d.camel} ≠ ${d.snake}`);
      console.log(`              camel: ${preview(d.camelValue)}`);
      console.log(`              snake: ${preview(d.snakeValue)}  (kept)`);
    }
    const droppedCleanPairs = plan.deletions.length - plan.renames.length - plan.drifts.length;
    if (droppedCleanPairs > 0) {
      console.log(`      drop   ${droppedCleanPairs} duplicate camelCase key(s) (values matched)`);
    }

    if (opts.commit) {
      const payload = buildFirestoreUpdate(plan);
      await docSnap.ref.update(payload);
    }
  }

  console.log(
    `  Summary: ${changedDocs} doc(s) ${opts.commit ? 'updated' : 'would change'}` +
      `, ${totalRenames} rename(s), ${totalDeletes} camelCase key(s) ${opts.commit ? 'deleted' : 'to delete'}` +
      `, ${totalDriftFields} drift(s) detected.`
  );

  totals.docs += snap.size;
  totals.changedDocs += changedDocs;
  totals.renames += totalRenames;
  totals.deletes += totalDeletes;
  totals.drifts += totalDriftFields;
}

async function main() {
  const opts = parseArgs(process.argv);
  const db = initFirestore();
  const collections = resolveCollections(opts.collection);

  console.log(
    `[normalize] mode=${opts.commit ? 'COMMIT' : 'DRY-RUN'}` +
      ` collections=${collections.join(',')}` +
      (opts.docId ? ` doc=${opts.docId}` : '') +
      (opts.verbose ? ' verbose=true' : '')
  );

  const totals = { docs: 0, changedDocs: 0, renames: 0, deletes: 0, drifts: 0 };

  for (const collectionName of collections) {
    await processCollection(db, collectionName, opts, totals);
  }

  console.log('\n========================================');
  console.log(`Scanned ${totals.docs} doc(s) across ${collections.length} collection(s).`);
  console.log(
    `${totals.changedDocs} doc(s) ${opts.commit ? 'updated' : 'would change'}, ` +
      `${totals.renames} rename(s), ` +
      `${totals.deletes} camelCase key(s) ${opts.commit ? 'removed' : 'to remove'}, ` +
      `${totals.drifts} stale-camelCase drift(s) flagged.`
  );
  if (!opts.commit) {
    console.log('\nDry run only. Re-run with --commit to apply.');
  }
}

main().catch((err) => {
  console.error('[normalize] fatal:', err && err.stack ? err.stack : err);
  process.exit(1);
});
