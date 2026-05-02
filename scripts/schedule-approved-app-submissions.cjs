#!/usr/bin/env node
/* eslint-disable no-console */
try {
  require('dotenv').config();
} catch (_) {
  // Optional in CI/hosted environments.
}

const admin = require('firebase-admin');

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
    start: 'today',
    cadence: 1,
    window: 8,
    appendOnly: false,
    dryRun: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--append-only') args.appendOnly = true;
    else if (a.startsWith('--start=')) args.start = a.slice('--start='.length);
    else if (a.startsWith('--cadence=')) args.cadence = Number(a.slice('--cadence='.length));
    else if (a.startsWith('--window=')) args.window = Number(a.slice('--window='.length));
  }
  if (String(args.start).trim().toLowerCase() === 'today') {
    args.start = getAppDateKey();
  } else if (String(args.start).trim().toLowerCase() === 'tomorrow') {
    args.start = addDays(getAppDateKey(), 1);
  }
  args.start = requireDateArg(args.start, '--start');
  if (!Number.isInteger(args.cadence) || args.cadence < 1) {
    throw new Error('--cadence must be an integer >= 1');
  }
  if (!Number.isInteger(args.window) || args.window < 2) {
    throw new Error('--window must be an integer >= 2 so tomorrow can be scheduled');
  }
  return args;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function isApprovedQuoteData(d) {
  if (typeof d.approved === 'boolean') return d.approved;
  if (typeof d.active === 'boolean') return d.active;
  return String(d.approved ?? d.active ?? '').trim().toLowerCase() !== 'false';
}

function assignmentPayloadForQuote(q, dateKey, assignedBy) {
  return {
    dateKey,
    sourceId: q.sourceId || null,
    embeddedStableKey: null,
    textSnapshot: q.text.slice(0, 160),
    authorSnapshot: q.author.slice(0, 120),
    blessingSnapshot: q.blessing.slice(0, 240),
    whatIfSnapshot: q.whatIf.slice(0, 240),
    igCaptionSnapshot: q.igCaption.slice(0, 400),
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
    whatIf: q.whatIf || '',
    what_if: q.whatIf || '',
    igCaption: q.igCaption || '',
    ig_caption: q.igCaption || '',
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

async function main() {
  const opts = parseArgs(process.argv);
  const db = initFirestore();
  const quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';
  const windowDates = Array.from({ length: opts.window }, (_, idx) => addDays(opts.start, idx * opts.cadence));
  const windowEnd = windowDates[windowDates.length - 1];

  const quotesSnap = await db.collection(quotesCollection).get();
  const notionQuotes = [];
  quotesSnap.forEach((docSnap) => {
    const d = docSnap.data() || {};
    if (d.source !== 'notion') return;
    if (!isApprovedQuoteData(d)) return;
    const text = String(d.text || '').trim();
    const author = String(d.author || '').trim();
    if (!text || !author) return;
    notionQuotes.push({
      sourceId: String(d.sourceId || docSnap.id).trim(),
      sortOrder: Number.isFinite(d.sortOrder) ? d.sortOrder : Number.MAX_SAFE_INTEGER,
      text,
      author,
      blessing: String(d.blessing ?? d.dailyBlessing ?? d.daily_blessing ?? '').trim(),
      whatIf: String(d.whatIf ?? d.what_if ?? '').trim(),
      igCaption: String(d.igCaption ?? d.ig_caption ?? '').trim(),
      submittedAt: String(d.submittedAt || '').trim(),
      submittedVia: String(d.submittedVia || d.submitted_via || '').trim(),
      dateScheduled: String(d.dateScheduled || d.date_scheduled || '').trim()
    });
  });

  notionQuotes.sort((a, b) => {
    const aAt = a.submittedAt || '';
    const bAt = b.submittedAt || '';
    if (aAt !== bAt) return aAt.localeCompare(bAt);
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.text !== b.text) return a.text.localeCompare(b.text);
    if (a.author !== b.author) return a.author.localeCompare(b.author);
    return a.sourceId.localeCompare(b.sourceId);
  });

  const quoteBySourceId = new Map(notionQuotes.map((q) => [q.sourceId, q]));
  const assignmentsSnap = await db.collection(assignmentsCollection).get();
  const futureAssignments = [];
  const scheduledSourceIds = new Set();
  assignmentsSnap.forEach((docSnap) => {
    if (!isDateKey(docSnap.id) || docSnap.id < opts.start) return;
    const data = docSnap.data() || {};
    const sourceId = String(data.sourceId || '').trim();
    if (sourceId) scheduledSourceIds.add(sourceId);
    futureAssignments.push({ dateKey: docSnap.id, data });
  });
  futureAssignments.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const submissionsToInsert = notionQuotes.filter((q) => {
    if (q.submittedVia.toLowerCase() !== 'app') return false;
    if (scheduledSourceIds.has(q.sourceId)) return false;
    if (isDateKey(q.dateScheduled)) return false;
    return true;
  });

  if (opts.appendOnly) {
    const assignedDateKeys = new Set(futureAssignments.map((row) => row.dateKey));
    let cursorDate =
      futureAssignments.length > 0
        ? futureAssignments[futureAssignments.length - 1].dateKey
        : addDays(opts.start, -1);

    const scheduled = submissionsToInsert.map((quote) => {
      const dateKey = firstOpenDateAfter(cursorDate, assignedDateKeys);
      assignedDateKeys.add(dateKey);
      cursorDate = dateKey;
      return {
        dateKey,
        quote,
        payload: assignmentPayloadForQuote(quote, dateKey, 'approved-app-submission-append-scheduler')
      };
    });

    if (opts.dryRun) {
      console.log(
        `[app-submissions] dry-run append-only newSubmissions=${submissionsToInsert.length} appending=${scheduled.length} preserved=${futureAssignments.length} start=${opts.start}`
      );
      console.log('[app-submissions] appended assignments:');
      scheduled.forEach((row) => {
        console.log(`  ${row.dateKey} -> ${row.payload.textSnapshot} — ${row.payload.authorSnapshot}`);
      });
      return;
    }

    if (!scheduled.length) {
      console.log(
        `[app-submissions] append-only no newly approved app submissions (${assignmentsCollection} / ${quotesCollection}, start=${opts.start})`
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
            scheduleSource: 'approved-app-submission-append-scheduler'
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
      `[app-submissions] append-only wrote ${writes} assignments + ${quoteWrites} quote date fields, preserved ${futureAssignments.length} existing assignments (${assignmentsCollection} / ${quotesCollection}, start=${opts.start})`
    );
    return;
  }

  const explicitDateToSourceId = new Map();
  for (const q of notionQuotes) {
    if (!isDateKey(q.dateScheduled)) continue;
    if (q.dateScheduled < opts.start || q.dateScheduled > windowEnd) continue;
    if (!explicitDateToSourceId.has(q.dateScheduled)) {
      explicitDateToSourceId.set(q.dateScheduled, q.sourceId);
    }
  }

  const dateToExistingSourceId = new Map();
  for (const row of futureAssignments) {
    if (row.dateKey > windowEnd) continue;
    if (explicitDateToSourceId.has(row.dateKey)) continue;
    const sourceId = String(row.data.sourceId || '').trim();
    if (sourceId && quoteBySourceId.has(sourceId)) {
      dateToExistingSourceId.set(row.dateKey, sourceId);
    }
  }

  const windowSourceIds = windowDates.map(
    (dateKey) => explicitDateToSourceId.get(dateKey) || dateToExistingSourceId.get(dateKey) || null
  );

  let insertAt = Math.min(1, Math.max(0, opts.window - 1));
  for (const q of submissionsToInsert) {
    if (windowSourceIds.includes(q.sourceId)) continue;
    windowSourceIds.splice(insertAt, 0, q.sourceId);
    insertAt += 1;
    windowSourceIds.length = opts.window;
  }

  const scheduled = windowDates
    .map((dateKey, idx) => {
      const sourceId = windowSourceIds[idx];
      const quote = sourceId ? quoteBySourceId.get(sourceId) : null;
      if (!quote) return null;
      return {
        dateKey,
        quote,
        payload: assignmentPayloadForQuote(quote, dateKey, 'approved-app-submission-scheduler')
      };
    })
    .filter(Boolean);

  const scheduledSourceIdToDate = new Map(scheduled.map((row) => [row.quote.sourceId, row.dateKey]));
  const clearDateQuotes = notionQuotes.filter((q) => {
    if (scheduledSourceIdToDate.has(q.sourceId)) return false;
    return isDateKey(q.dateScheduled) && q.dateScheduled >= opts.start;
  });

  if (opts.dryRun) {
    console.log(
      `[app-submissions] dry-run inserted=${submissionsToInsert.length} scheduled=${scheduled.length}/${opts.window} start=${opts.start} windowEnd=${windowEnd}`
    );
    console.log(`[app-submissions] clearQuoteDates=${clearDateQuotes.length}`);
    console.log('[app-submissions] assignments:');
    scheduled.forEach((row) => {
      console.log(`  ${row.dateKey} -> ${row.payload.textSnapshot} — ${row.payload.authorSnapshot}`);
    });
    return;
  }

  if (!submissionsToInsert.length) {
    console.log(
      `[app-submissions] no newly approved app submissions to schedule (${assignmentsCollection} / ${quotesCollection}, start=${opts.start}, window=${opts.window}, cadence=${opts.cadence})`
    );
    return;
  }

  const batchState = { batch: db.batch(), ops: 0 };
  let writes = 0;
  let quoteWrites = 0;
  let clearedQuoteDates = 0;
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
          scheduleUpdatedAt: updatedAt
        },
        { merge: true }
      );
      batchState.ops += 1;
      quoteWrites += 1;
    }

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
    `[app-submissions] inserted ${submissionsToInsert.length}, wrote ${writes} assignments + ${quoteWrites} quote date fields, cleared ${clearedQuoteDates} quote dates (${assignmentsCollection} / ${quotesCollection}, start=${opts.start}, window=${opts.window}, cadence=${opts.cadence})`
  );
}

main().catch((err) => {
  console.error('[app-submissions] failed:', err.message);
  process.exit(1);
});
