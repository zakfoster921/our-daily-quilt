#!/usr/bin/env node
/* eslint-disable no-console */
try {
  require('dotenv').config();
} catch (_) {
  // Optional in CI/hosted environments.
}

const admin = require('firebase-admin');
const { spawn } = require('child_process');

function requireDateArg(value, name) {
  const v = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`${name} must be YYYY-MM-DD`);
  }
  return v;
}

function addDays(dateKey, deltaDays) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function parseArgs(argv) {
  const args = {
    start: '',
    cadence: 1,
    dryRun: false,
    syncNotion: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--sync-notion') args.syncNotion = true;
    else if (a.startsWith('--start=')) args.start = a.slice('--start='.length);
    else if (a.startsWith('--cadence=')) args.cadence = Number(a.slice('--cadence='.length));
  }
  if (!args.start) throw new Error('Missing --start=YYYY-MM-DD');
  args.start = requireDateArg(args.start, '--start');
  if (!Number.isInteger(args.cadence) || args.cadence < 1) {
    throw new Error('--cadence must be an integer >= 1');
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

function runNodeScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      env: process.env
    });
    child.on('close', (code) => resolve(code || 0));
  });
}

async function main() {
  const opts = parseArgs(process.argv);
  const db = initFirestore();
  const quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';

  const snap = await db.collection(quotesCollection).get();
  const notionQuotes = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    if (d.source !== 'notion') return;
    const text = String(d.text || '').trim();
    const author = String(d.author || '').trim();
    if (!text || !author) return;
    notionQuotes.push({
      sourceId: String(d.sourceId || docSnap.id).trim(),
      sortOrder: Number.isFinite(d.sortOrder) ? d.sortOrder : Number.MAX_SAFE_INTEGER,
      text,
      author,
      whatIf: String(d.whatIf ?? d.what_if ?? '').trim(),
      igCaption: String(d.igCaption ?? d.ig_caption ?? '').trim()
    });
  });

  notionQuotes.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.text !== b.text) return a.text.localeCompare(b.text);
    if (a.author !== b.author) return a.author.localeCompare(b.author);
    return a.sourceId.localeCompare(b.sourceId);
  });

  if (!notionQuotes.length) {
    throw new Error('No Notion-backed quotes found in Firestore');
  }

  const scheduled = notionQuotes.map((q, idx) => {
    const dateKey = addDays(opts.start, idx * opts.cadence);
    return {
      dateKey,
      payload: {
        dateKey,
        sourceId: q.sourceId || null,
        embeddedStableKey: null,
        textSnapshot: q.text.slice(0, 160),
        authorSnapshot: q.author.slice(0, 120),
        whatIfSnapshot: q.whatIf.slice(0, 240),
        igCaptionSnapshot: q.igCaption.slice(0, 400),
        assignedAt: new Date().toISOString(),
        assignedBy: 'backfill-daily-assignments'
      }
    };
  });

  if (opts.dryRun) {
    console.log(`[backfill] dry-run quotes=${scheduled.length} start=${opts.start} cadence=${opts.cadence}`);
    console.log('[backfill] first 5 assignments:');
    scheduled.slice(0, 5).forEach((row) => {
      console.log(`  ${row.dateKey} -> ${row.payload.textSnapshot} — ${row.payload.authorSnapshot}`);
    });
    return;
  }

  let batch = db.batch();
  let ops = 0;
  let writes = 0;
  for (const row of scheduled) {
    const ref = db.collection(assignmentsCollection).doc(row.dateKey);
    batch.set(ref, row.payload, { merge: true });
    ops += 1;
    writes += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  console.log(
    `[backfill] wrote ${writes} assignment docs to ${assignmentsCollection} (start=${opts.start}, cadence=${opts.cadence})`
  );

  if (opts.syncNotion) {
    const code = await runNodeScript('scripts/sync-usage-firestore-to-notion.cjs');
    if (code !== 0) {
      throw new Error(`sync-usage-firestore-to-notion.cjs failed with exit code ${code}`);
    }
    console.log('[backfill] synced date_scheduled back to Notion');
  }
}

main().catch((err) => {
  console.error('[backfill] failed:', err.message);
  process.exit(1);
});

