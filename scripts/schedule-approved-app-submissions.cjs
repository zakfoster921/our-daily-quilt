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
    communityPromptSnapshot: q.communityPrompt.slice(0, 500),
    whatIfSnapshot: q.whatIf.slice(0, 240),
    igCaptionSnapshot: q.igCaption.slice(0, 400),
    speakerImageUrlSnapshot: q.speakerImageUrl.slice(0, 500),
    speakerCutoutUrlSnapshot: q.speakerCutoutUrl.slice(0, 500),
    speakerDatesSnapshot: q.speakerDates.slice(0, 120),
    speakerBornSnapshot: q.speakerBorn.slice(0, 80),
    speakerDiedSnapshot: q.speakerDied.slice(0, 80),
    speakerGuideLineSnapshot: q.speakerGuideLine.slice(0, 260),
    imageAttributionSnapshot: q.imageAttribution.slice(0, 260),
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
    speakerImageUrl: q.speakerImageUrl || '',
    speaker_image_url: q.speakerImageUrl || '',
    speakerCutoutUrl: q.speakerCutoutUrl || '',
    speaker_cutout_url: q.speakerCutoutUrl || '',
    speakerDates: q.speakerDates || '',
    speaker_dates: q.speakerDates || '',
    speakerBorn: q.speakerBorn || '',
    speaker_born: q.speakerBorn || '',
    speakerDied: q.speakerDied || '',
    speaker_died: q.speakerDied || '',
    speakerGuideLine: q.speakerGuideLine || '',
    speaker_guide_line: q.speakerGuideLine || '',
    imageAttribution: q.imageAttribution || '',
    image_attribution: q.imageAttribution || '',
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
      communityPrompt: String(d.communityPrompt ?? d.community_prompt ?? '').trim(),
      whatIf: String(d.whatIf ?? d.what_if ?? '').trim(),
      igCaption: String(d.igCaption ?? d.ig_caption ?? '').trim(),
      speakerImageUrl: String(d.speakerImageUrl ?? d.speaker_image_url ?? '').trim(),
      speakerCutoutUrl: String(d.speakerCutoutUrl ?? d.speaker_cutout_url ?? '').trim(),
      speakerDates: String(d.speakerDates ?? d.speaker_dates ?? '').trim(),
      speakerBorn: String(d.speakerBorn ?? d.speaker_born ?? '').trim(),
      speakerDied: String(d.speakerDied ?? d.speaker_died ?? '').trim(),
      speakerGuideLine: String(d.speakerGuideLine ?? d.speaker_guide_line ?? '').trim(),
      imageAttribution: String(d.imageAttribution ?? d.image_attribution ?? '').trim(),
      submittedAt: String(d.submittedAt || '').trim(),
      submittedVia: String(d.submittedVia || d.submitted_via || '').trim(),
      dateScheduled: String(d.dateScheduled || d.date_scheduled || '').trim(),
      notionLastEditedTime: String(d.notionLastEditedTime || '').trim(),
      scheduleSource: String(d.scheduleSource || '').trim()
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
    // Previously gated on submittedVia === 'app'. Now any approved Notion quote
    // without an explicit date_scheduled is eligible for auto-scheduling so rows
    // added directly in Notion flow through the same path as app submissions.
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

  // ─── Swap mode ───────────────────────────────────────────────────────────
  // Default mode (used by the admin "Notion ↔ Firestore sync" button).
  //
  // Goal: when the user approves a quote in Notion and clicks sync, that quote
  // takes tomorrow's slot. Whatever was at tomorrow gets its date cleared and
  // returns to the pool — the next append-only run (or backfill) re-schedules
  // it at the end of the queue. No cascade; just a 1-for-1 swap.
  //
  // A quote is a "swap candidate" if it is approved AND either:
  //   - It has no future assignment AND was edited in Notion recently, OR
  //   - Its current assignment was written by the append-only scheduler
  //     (i.e. the daily GH Action auto-appended it; the user hasn't manually
  //     pinned a date) AND it was either appended or edited recently.
  //
  // "Recently" = within `RECENT_CANDIDATE_MS`. This stops the entire 70+ day
  // queue from being treated as candidates on every sync.
  const RECENT_CANDIDATE_MS = (() => {
    const fromEnv = Number(process.env.SWAP_RECENT_CANDIDATE_HOURS);
    const hours = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 48;
    return hours * 60 * 60 * 1000;
  })();
  const nowMs = Date.now();

  const assignmentBySourceId = new Map();
  const sourceIdByDate = new Map();
  for (const row of futureAssignments) {
    const sid = String(row.data.sourceId || '').trim();
    if (sid) assignmentBySourceId.set(sid, row);
    sourceIdByDate.set(row.dateKey, sid);
  }

  const appendSource = 'approved-app-submission-append-scheduler';
  const swapSource = 'approved-app-submission-swap-scheduler';

  function withinRecentMs(iso) {
    if (!iso) return false;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return false;
    return nowMs - t <= RECENT_CANDIDATE_MS;
  }

  const candidates = notionQuotes.filter((q) => {
    const assignment = assignmentBySourceId.get(q.sourceId);
    const wasAppendScheduled = !!(
      assignment && String(assignment.data.assignedBy || '').trim() === appendSource
    );

    if (isDateKey(q.dateScheduled) && !wasAppendScheduled) {
      // User (or some other writer) pinned this row to a specific date. Leave it alone.
      return false;
    }

    if (!assignment) {
      // Truly unscheduled approved quote — must be recently edited in Notion.
      return withinRecentMs(q.notionLastEditedTime);
    }

    if (!wasAppendScheduled) return false; // assigned by a non-append source — pinned

    if (withinRecentMs(assignment.data.assignedAt)) return true;
    if (withinRecentMs(q.notionLastEditedTime)) return true;
    return false;
  });

  // Most-recently edited in Notion wins the closest target date (tomorrow).
  candidates.sort((a, b) => {
    const aT = a.notionLastEditedTime || '';
    const bT = b.notionLastEditedTime || '';
    if (aT !== bT) return bT.localeCompare(aT);
    // Tiebreaker: most recent assignedAt (newer append wins).
    const aA = assignmentBySourceId.get(a.sourceId)?.data?.assignedAt || '';
    const bA = assignmentBySourceId.get(b.sourceId)?.data?.assignedAt || '';
    if (aA !== bA) return bA.localeCompare(aA);
    return a.sourceId.localeCompare(b.sourceId);
  });

  const tomorrow = addDays(opts.start, 1);
  const targetByCandidate = new Map();
  candidates.forEach((cand, idx) => {
    targetByCandidate.set(cand.sourceId, addDays(tomorrow, idx));
  });
  const candidateSourceIds = new Set(candidates.map((c) => c.sourceId));
  const targetDateSet = new Set(targetByCandidate.values());

  // Quotes currently occupying a target date that AREN'T a candidate get displaced
  // (their date_scheduled is cleared and they return to the pool).
  const displacedSourceIds = new Set();
  for (const target of targetDateSet) {
    const occupant = sourceIdByDate.get(target);
    if (!occupant) continue;
    if (candidateSourceIds.has(occupant)) continue;
    displacedSourceIds.add(occupant);
  }

  // Vacated dates = candidates' old dates that no other candidate is moving into.
  // These get their assignment + daily quote docs deleted.
  const datesToDelete = new Set();
  for (const cand of candidates) {
    const oldAssignment = assignmentBySourceId.get(cand.sourceId);
    if (!oldAssignment) continue;
    const oldDate = oldAssignment.dateKey;
    const newDate = targetByCandidate.get(cand.sourceId);
    if (oldDate === newDate) continue;
    if (targetDateSet.has(oldDate)) continue; // another candidate's write will replace
    datesToDelete.add(oldDate);
  }

  if (opts.dryRun) {
    console.log(
      `[app-submissions] dry-run swap-mode candidates=${candidates.length} displaced=${displacedSourceIds.size} vacated=${datesToDelete.size} start=${opts.start} recentHours=${RECENT_CANDIDATE_MS / 3600000}`
    );
    for (const cand of candidates) {
      const target = targetByCandidate.get(cand.sourceId);
      const old = assignmentBySourceId.get(cand.sourceId);
      const oldDate = old ? old.dateKey : '(unscheduled)';
      console.log(`  ${oldDate} -> ${target}: ${cand.text.slice(0, 60)} — ${cand.author}`);
    }
    return;
  }

  if (!candidates.length) {
    console.log(
      `[app-submissions] swap-mode no recently approved candidates to place at tomorrow+ (${assignmentsCollection} / ${quotesCollection}, start=${opts.start}, recentHours=${RECENT_CANDIDATE_MS / 3600000})`
    );
    return;
  }

  const batchState = { batch: db.batch(), ops: 0 };
  const updatedAt = new Date().toISOString();
  const deleteField = admin.firestore.FieldValue.delete();
  let assignmentWrites = 0;
  let assignmentDeletes = 0;
  let displacedClears = 0;

  for (const cand of candidates) {
    const target = targetByCandidate.get(cand.sourceId);
    const payload = assignmentPayloadForQuote(cand, target, swapSource);

    // Full replace at the target date (no merge) so we don't leak any stale
    // fields from the previous occupant.
    batchState.batch.set(db.collection(assignmentsCollection).doc(target), payload);
    batchState.ops += 1;
    assignmentWrites += 1;

    batchState.batch.set(
      db.collection(quotesCollection).doc(target),
      dailyQuotePayloadForQuote(cand, target, swapSource, updatedAt)
    );
    batchState.ops += 1;

    batchState.batch.set(
      db.collection(quotesCollection).doc(cand.sourceId),
      {
        dateScheduled: target,
        date_scheduled: target,
        scheduleUpdatedAt: updatedAt,
        scheduleSource: swapSource
      },
      { merge: true }
    );
    batchState.ops += 1;

    await commitBatchIfNeeded(db, batchState);
  }

  for (const dateKey of datesToDelete) {
    batchState.batch.delete(db.collection(assignmentsCollection).doc(dateKey));
    batchState.ops += 1;
    batchState.batch.delete(db.collection(quotesCollection).doc(dateKey));
    batchState.ops += 1;
    assignmentDeletes += 1;
    await commitBatchIfNeeded(db, batchState);
  }

  for (const sid of displacedSourceIds) {
    batchState.batch.set(
      db.collection(quotesCollection).doc(sid),
      {
        dateScheduled: deleteField,
        date_scheduled: deleteField,
        scheduleUpdatedAt: updatedAt,
        scheduleSource: deleteField
      },
      { merge: true }
    );
    batchState.ops += 1;
    displacedClears += 1;
    await commitBatchIfNeeded(db, batchState);
  }

  if (batchState.ops > 0) await batchState.batch.commit();

  console.log(
    `[app-submissions] swap-mode placed=${assignmentWrites} vacated=${assignmentDeletes} displaced=${displacedClears} (start=${opts.start}, recentHours=${RECENT_CANDIDATE_MS / 3600000})`
  );
}

main().catch((err) => {
  console.error('[app-submissions] failed:', err.message);
  process.exit(1);
});
