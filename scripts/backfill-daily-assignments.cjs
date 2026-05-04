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

/** Same app-day rule as the client/server: before 7:00 UTC still belongs to the prior quote day. */
function getAppDateKey(d = new Date()) {
  const adjusted = new Date(d);
  if (d.getUTCHours() < 7) adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  return `${adjusted.getUTCFullYear()}-${String(adjusted.getUTCMonth() + 1).padStart(2, '0')}-${String(adjusted.getUTCDate()).padStart(2, '0')}`;
}

function parseArgs(argv) {
  const args = {
    start: '',
    cadence: 1,
    window: 7,
    minCount: null,
    appendOnly: false,
    dryRun: false,
    syncNotion: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--sync-notion') args.syncNotion = true;
    else if (a === '--append-only') args.appendOnly = true;
    else if (a.startsWith('--start=')) args.start = a.slice('--start='.length);
    else if (a.startsWith('--cadence=')) args.cadence = Number(a.slice('--cadence='.length));
    else if (a.startsWith('--window=')) args.window = Number(a.slice('--window='.length));
    else if (a.startsWith('--min-count=')) args.minCount = Number(a.slice('--min-count='.length));
  }
  if (!args.start) throw new Error('Missing --start=YYYY-MM-DD, --start=today, or --start=tomorrow');
  if (String(args.start).trim().toLowerCase() === 'today') {
    args.start = getAppDateKey();
  } else if (String(args.start).trim().toLowerCase() === 'tomorrow') {
    args.start = addDays(getAppDateKey(), 1);
  }
  args.start = requireDateArg(args.start, '--start');
  if (!Number.isInteger(args.cadence) || args.cadence < 1) {
    throw new Error('--cadence must be an integer >= 1');
  }
  if (!Number.isInteger(args.window) || args.window < 1) {
    throw new Error('--window must be an integer >= 1');
  }
  if (args.minCount != null && (!Number.isInteger(args.minCount) || args.minCount < 1)) {
    throw new Error('--min-count must be an integer >= 1');
  }
  return args;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function assignmentPayloadForQuote(q, dateKey, assignedBy) {
  return {
    dateKey,
    sourceId: q.sourceId || null,
    embeddedStableKey: null,
    textSnapshot: q.text.slice(0, 160),
    authorSnapshot: q.author.slice(0, 120),
    blessingSnapshot: q.blessing.slice(0, 240),
    communityPromptSnapshot: q.communityPrompt.slice(0, 500),
    whatIfSnapshot: q.whatIf.slice(0, 240),
    igCaptionSnapshot: q.igCaption.slice(0, 400),
    fortuneSnapshot: q.fortune.slice(0, 400),
    assignedAt: new Date().toISOString(),
    assignedBy
  };
}

function dailyQuotePayloadForQuote(q, dateKey, assignedBy, updatedAt) {
  return {
    dateKey,
    text: q.text,
    quote: q.text,
    author: q.author,
    sourceId: q.sourceId || null,
    blessing: q.blessing || '',
    communityPrompt: q.communityPrompt || '',
    community_prompt: q.communityPrompt || '',
    whatIf: q.whatIf || '',
    what_if: q.whatIf || '',
    igCaption: q.igCaption || '',
    ig_caption: q.igCaption || '',
    fortune: q.fortune || '',
    assignedBy,
    assignedAt: updatedAt,
    updatedAt
  };
}

function firstOpenDateAfter(dateKey, assignedDateKeys) {
  let next = addDays(dateKey, 1);
  while (assignedDateKeys.has(next)) next = addDays(next, 1);
  return next;
}

function commitBatchIfNeeded(db, state, threshold = 450) {
  if (state.ops < threshold) return Promise.resolve();
  const batch = state.batch;
  state.batch = db.batch();
  state.ops = 0;
  return batch.commit();
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
  const windowDates = Array.from({ length: opts.window }, (_, idx) => addDays(opts.start, idx * opts.cadence));
  const windowEnd = windowDates[windowDates.length - 1];
  const appTodayKey = getAppDateKey();
  const protectTodayFromAppSubmissions = opts.start === appTodayKey;
  const firstAppSubmissionInsertIndex = protectTodayFromAppSubmissions ? Math.min(1, Math.max(0, opts.window - 1)) : 0;

  const snap = await db.collection(quotesCollection).get();
  const notionQuotes = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    if (d.source !== 'notion') return;
    const approved =
      typeof d.approved === 'boolean'
        ? d.approved
        : typeof d.active === 'boolean'
          ? d.active
          : String(d.approved ?? d.active ?? '').trim().toLowerCase() !== 'false';
    if (!approved) return;
    const text = String(d.text || '').trim();
    const author = String(d.author || '').trim();
    if (!text || !author) return;
    notionQuotes.push({
      sourceId: String(d.sourceId || docSnap.id).trim(),
      sortOrder: Number.isFinite(d.sortOrder) ? d.sortOrder : Number.MAX_SAFE_INTEGER,
      text,
      author,
      blessing: String(d.blessing ?? d.dailyBlessing ?? d.daily_blessing ?? '').trim(),
      communityPrompt: String(d.communityPrompt ?? d.community_prompt ?? '').trim(),
      whatIf: String(d.whatIf ?? d.what_if ?? '').trim(),
      igCaption: String(d.igCaption ?? d.ig_caption ?? '').trim(),
      fortune: String(d.fortune ?? d.Fortune ?? '').trim(),
      submittedAt: String(d.submittedAt || '').trim(),
      submittedVia: String(d.submittedVia || d.submitted_via || '').trim(),
      dateScheduled: String(d.dateScheduled || d.date_scheduled || '').trim()
    });
  });

  notionQuotes.sort((a, b) => {
    const aSubmittedPriority =
      a.submittedVia.toLowerCase() === 'app' &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(a.dateScheduled) || a.dateScheduled >= opts.start);
    const bSubmittedPriority =
      b.submittedVia.toLowerCase() === 'app' &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(b.dateScheduled) || b.dateScheduled >= opts.start);
    if (aSubmittedPriority !== bSubmittedPriority) return aSubmittedPriority ? -1 : 1;
    if (aSubmittedPriority && bSubmittedPriority) {
      const at = a.submittedAt || '';
      const bt = b.submittedAt || '';
      if (at !== bt) return at.localeCompare(bt);
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.text !== b.text) return a.text.localeCompare(b.text);
    if (a.author !== b.author) return a.author.localeCompare(b.author);
    return a.sourceId.localeCompare(b.sourceId);
  });

  if (!notionQuotes.length) {
    throw new Error('No Notion-backed quotes found in Firestore');
  }

  const quoteBySourceId = new Map(notionQuotes.map((q) => [q.sourceId, q]));
  const assignmentsSnap = await db.collection(assignmentsCollection).get();
  const futureAssignments = [];
  assignmentsSnap.forEach((docSnap) => {
    if (!isDateKey(docSnap.id) || docSnap.id < opts.start) return;
    futureAssignments.push({ dateKey: docSnap.id, data: docSnap.data() || {} });
  });
  futureAssignments.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  if (opts.appendOnly) {
    const assignedDateKeys = new Set(futureAssignments.map((row) => row.dateKey));
    const usedSourceIds = new Set(
      futureAssignments
        .map((row) => String(row.data.sourceId || '').trim())
        .filter(Boolean)
    );
    const targetCount = opts.minCount || opts.window;
    const appendCount = Math.max(0, targetCount - futureAssignments.length);
    const lastDate =
      futureAssignments.length > 0
        ? futureAssignments[futureAssignments.length - 1].dateKey
        : addDays(opts.start, -1);

    const fillQueue = notionQuotes.filter((q) => {
      if (usedSourceIds.has(q.sourceId)) return false;
      if (isDateKey(q.dateScheduled) && q.dateScheduled < opts.start) return false;
      if (q.submittedVia.toLowerCase() === 'app') return false;
      return true;
    });

    const scheduled = [];
    let cursorDate = lastDate;
    let fillIdx = 0;
    while (scheduled.length < appendCount && fillIdx < fillQueue.length) {
      const quote = fillQueue[fillIdx++];
      const dateKey = firstOpenDateAfter(cursorDate, assignedDateKeys);
      assignedDateKeys.add(dateKey);
      usedSourceIds.add(quote.sourceId);
      cursorDate = dateKey;
      scheduled.push({
        dateKey,
        quote,
        payload: assignmentPayloadForQuote(quote, dateKey, 'rolling-append-scheduler')
      });
    }

    if (opts.dryRun) {
      console.log(
        `[backfill] dry-run append-only existing=${futureAssignments.length} target=${targetCount} appending=${scheduled.length} start=${opts.start}`
      );
      console.log('[backfill] appended assignments:');
      scheduled.forEach((row) => {
        console.log(`  ${row.dateKey} -> ${row.payload.textSnapshot} — ${row.payload.authorSnapshot}`);
      });
      return;
    }

    if (!scheduled.length) {
      console.log(
        `[backfill] append-only no-op existing=${futureAssignments.length} target=${targetCount} (${assignmentsCollection} / ${quotesCollection}, start=${opts.start})`
      );
      return;
    }

    const batchState = { batch: db.batch(), ops: 0 };
    let writes = 0;
    let quoteWrites = 0;
    const updatedAt = new Date().toISOString();
    for (const row of scheduled) {
      batchState.batch.set(db.collection(assignmentsCollection).doc(row.dateKey), row.payload, { merge: true });
      batchState.ops += 1;
      writes += 1;

      batchState.batch.set(
        db.collection(quotesCollection).doc(row.dateKey),
        dailyQuotePayloadForQuote(row.quote, row.dateKey, row.payload.assignedBy, updatedAt),
        { merge: true }
      );
      batchState.ops += 1;

      const sid = String(row.quote.sourceId || '').trim();
      if (sid) {
        batchState.batch.set(
          db.collection(quotesCollection).doc(sid),
          {
            dateScheduled: row.dateKey,
            date_scheduled: row.dateKey,
            scheduleUpdatedAt: updatedAt,
            scheduleSource: 'rolling-append-scheduler'
          },
          { merge: true }
        );
        batchState.ops += 1;
        quoteWrites += 1;
      }

      await commitBatchIfNeeded(db, batchState);
    }

    if (batchState.ops > 0) await batchState.batch.commit();
    console.log(
      `[backfill] append-only wrote ${writes} assignments + ${quoteWrites} quote date fields, preserved ${futureAssignments.length} existing assignments (${assignmentsCollection} / ${quotesCollection}, start=${opts.start}, target=${targetCount})`
    );

    if (opts.syncNotion) {
      const code = await runNodeScript('scripts/sync-usage-firestore-to-notion.cjs');
      if (code !== 0) {
        throw new Error(`sync-usage-firestore-to-notion.cjs failed with exit code ${code}`);
      }
      console.log('[backfill] synced date_scheduled back to Notion');
    }
    return;
  }

  const explicitDateToSourceId = new Map();
  for (const q of notionQuotes) {
    if (!isDateKey(q.dateScheduled)) continue;
    if (q.dateScheduled < opts.start || q.dateScheduled > windowEnd) continue;
    // App submissions should never replace the current live quote. If one was
    // accidentally scheduled for today's app day, let the rolling insert logic
    // place it in the first future slot instead.
    if (
      protectTodayFromAppSubmissions &&
      q.dateScheduled === opts.start &&
      q.submittedVia.toLowerCase() === 'app'
    ) {
      continue;
    }
    if (!explicitDateToSourceId.has(q.dateScheduled)) {
      explicitDateToSourceId.set(q.dateScheduled, q.sourceId);
    }
  }

  const dateToExistingSourceId = new Map();
  for (const row of futureAssignments) {
    if (row.dateKey > windowEnd) continue;
    if (explicitDateToSourceId.has(row.dateKey)) continue;
    const sourceId = String(row.data.sourceId || '').trim();
    const quote = sourceId ? quoteBySourceId.get(sourceId) : null;
    if (
      protectTodayFromAppSubmissions &&
      row.dateKey === opts.start &&
      quote?.submittedVia?.toLowerCase?.() === 'app'
    ) {
      continue;
    }
    if (sourceId && quoteBySourceId.has(sourceId)) {
      dateToExistingSourceId.set(row.dateKey, sourceId);
    }
  }

  const windowSourceIds = windowDates.map(
    (dateKey) => explicitDateToSourceId.get(dateKey) || dateToExistingSourceId.get(dateKey) || null
  );
  const originalWindowSourceIds = new Set(windowSourceIds.filter(Boolean));

  const submittedToInsert = notionQuotes.filter((q) => {
    if (q.submittedVia.toLowerCase() !== 'app') return false;
    if (originalWindowSourceIds.has(q.sourceId)) return false;
    if (isDateKey(q.dateScheduled) && q.dateScheduled < opts.start) return false;
    return true;
  });

  let insertAt = firstAppSubmissionInsertIndex;
  for (const q of submittedToInsert) {
    if (windowSourceIds.includes(q.sourceId)) continue;
    windowSourceIds.splice(insertAt, 0, q.sourceId);
    insertAt += 1;
    windowSourceIds.length = opts.window;
  }

  const usedSourceIds = new Set(windowSourceIds.filter(Boolean));
  const fillQueue = notionQuotes.filter((q) => {
    if (usedSourceIds.has(q.sourceId)) return false;
    if (isDateKey(q.dateScheduled) && q.dateScheduled < opts.start) return false;
    if (protectTodayFromAppSubmissions && q.submittedVia.toLowerCase() === 'app') return false;
    return true;
  });
  let fillIdx = 0;
  for (let i = 0; i < windowSourceIds.length; i += 1) {
    if (windowSourceIds[i]) continue;
    const next = fillQueue[fillIdx++];
    if (!next) break;
    windowSourceIds[i] = next.sourceId;
    usedSourceIds.add(next.sourceId);
  }

  const scheduled = windowDates
    .map((dateKey, idx) => {
      const sourceId = windowSourceIds[idx];
      const quote = sourceId ? quoteBySourceId.get(sourceId) : null;
      if (!quote) return null;
      return {
        dateKey,
        quote,
        payload: assignmentPayloadForQuote(quote, dateKey, 'rolling-7-day-scheduler')
      };
    })
    .filter(Boolean);

  const scheduledSourceIdToDate = new Map(scheduled.map((row) => [row.quote.sourceId, row.dateKey]));
  const staleFutureAssignments = futureAssignments.filter((row) => row.dateKey > windowEnd);
  const clearDateQuotes = notionQuotes.filter((q) => {
    if (scheduledSourceIdToDate.has(q.sourceId)) return false;
    return isDateKey(q.dateScheduled) && q.dateScheduled >= opts.start;
  });

  if (opts.dryRun) {
    console.log(
      `[backfill] dry-run rolling window scheduled=${scheduled.length}/${opts.window} start=${opts.start} windowEnd=${windowEnd} cadence=${opts.cadence}`
    );
    console.log(
      `[backfill] exact Notion dates=${explicitDateToSourceId.size} app submissions inserted=${submittedToInsert.length} staleFutureAssignments=${staleFutureAssignments.length} clearQuoteDates=${clearDateQuotes.length}`
    );
    console.log('[backfill] assignments:');
    scheduled.forEach((row) => {
      console.log(`  ${row.dateKey} -> ${row.payload.textSnapshot} — ${row.payload.authorSnapshot}`);
    });
    return;
  }

  const batchState = { batch: db.batch(), ops: 0 };
  let writes = 0;
  let quoteWrites = 0;
  let deletes = 0;
  let clearedQuoteDates = 0;
  const updatedAt = new Date().toISOString();
  for (const row of scheduled) {
    const ref = db.collection(assignmentsCollection).doc(row.dateKey);
    batchState.batch.set(ref, row.payload, { merge: true });
    batchState.ops += 1;
    writes += 1;

    batchState.batch.set(
      db.collection(quotesCollection).doc(row.dateKey),
      dailyQuotePayloadForQuote(row.quote, row.dateKey, row.payload.assignedBy, updatedAt),
      { merge: true }
    );
    batchState.ops += 1;

    const sid = String(row.quote.sourceId || '').trim();
    if (sid) {
      batchState.batch.set(
        db.collection(quotesCollection).doc(sid),
        {
          dateScheduled: row.dateKey,
          date_scheduled: row.dateKey,
          scheduleUpdatedAt: updatedAt
        },
        { merge: true }
      );
      batchState.ops += 1;
      quoteWrites += 1;
    }

    await commitBatchIfNeeded(db, batchState);
  }

  for (const row of staleFutureAssignments) {
    batchState.batch.delete(db.collection(assignmentsCollection).doc(row.dateKey));
    batchState.ops += 1;
    deletes += 1;
    await commitBatchIfNeeded(db, batchState);
  }

  const deleteField = admin.firestore.FieldValue.delete();
  for (const q of clearDateQuotes) {
    batchState.batch.set(
      db.collection(quotesCollection).doc(q.sourceId),
      {
        dateScheduled: deleteField,
        date_scheduled: deleteField,
        scheduleUpdatedAt: updatedAt
      },
      { merge: true }
    );
    batchState.ops += 1;
    clearedQuoteDates += 1;
    await commitBatchIfNeeded(db, batchState);
  }

  if (batchState.ops > 0) await batchState.batch.commit();

  console.log(
    `[backfill] rolling window wrote ${writes} assignments + ${quoteWrites} quote date fields, deleted ${deletes} stale assignments, cleared ${clearedQuoteDates} quote dates (${assignmentsCollection} / ${quotesCollection}, start=${opts.start}, window=${opts.window}, cadence=${opts.cadence})`
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

