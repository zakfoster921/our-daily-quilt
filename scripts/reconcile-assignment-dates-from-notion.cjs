#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * After Notion → Firestore quote sync, align `dailyQuoteAssignments` + denormalized
 * `quotes/{dateKey}` docs with each quote's `date_scheduled` / `dateScheduled`.
 *
 * - Cleared date in Notion (empty on the quote doc) → remove that quote from any
 *   future assignment slot so it returns to the scheduling pool.
 * - Set/changed date in Notion → move the quote to `dailyQuoteAssignments/{date}`
 *   (displaced occupant loses Firestore date fields so usage sync can clear Notion).
 *
 * Run: after `sync-notion-to-firestore.cjs`, before append-only schedulers.
 *
 * Usage:
 *   node scripts/reconcile-assignment-dates-from-notion.cjs --start=today
 *   node scripts/reconcile-assignment-dates-from-notion.cjs --start=2026-05-01 --dry-run
 */
try {
  require('dotenv').config();
} catch (_) {}

const admin = require('firebase-admin');

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function getAppDateKey(d = new Date()) {
  const adjusted = new Date(d);
  if (d.getUTCHours() < 7) adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  return `${adjusted.getUTCFullYear()}-${String(adjusted.getUTCMonth() + 1).padStart(2, '0')}-${String(adjusted.getUTCDate()).padStart(2, '0')}`;
}

function parseArgs(argv) {
  const args = { start: '', dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--start=')) args.start = a.slice('--start='.length);
  }
  if (!args.start) throw new Error('Missing --start=YYYY-MM-DD or --start=today');
  if (String(args.start).toLowerCase() === 'today') args.start = getAppDateKey();
  if (!isDateKey(args.start)) throw new Error('--start must be YYYY-MM-DD or today');
  return args;
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

function normalizeDesiredDate(row) {
  const raw = String(row?.dateScheduled ?? row?.date_scheduled ?? '').trim();
  return isDateKey(raw) ? raw : '';
}

function quoteRowFromFirestore(docSnap) {
  const d = docSnap.data() || {};
  if (d.source !== 'notion') return null;
  if (!isApprovedQuoteData(d)) return null;
  const text = String(d.text || '').trim();
  const author = String(d.author || '').trim();
  if (!text || !author) return null;
  const dateScheduled = String(d.dateScheduled || d.date_scheduled || '').trim();
  return {
    sourceId: String(d.sourceId || docSnap.id).trim(),
    dateScheduled,
    date_scheduled: dateScheduled,
    text,
    author,
    blessing: String(d.blessing ?? d.dailyBlessing ?? d.daily_blessing ?? '').trim(),
    communityPrompt: String(d.communityPrompt ?? d.community_prompt ?? '').trim(),
    whatIf: String(d.whatIf ?? d.what_if ?? '').trim(),
    igCaption: String(d.igCaption ?? d.ig_caption ?? '').trim(),
    fortune: String(d.fortune ?? d.Fortune ?? '').trim(),
    speakerImageUrl: String(d.speakerImageUrl ?? d.speaker_image_url ?? '').trim(),
    speakerCutoutUrl: String(d.speakerCutoutUrl ?? d.speaker_cutout_url ?? '').trim(),
    speakerDates: String(d.speakerDates ?? d.speaker_dates ?? '').trim(),
    speakerBorn: String(d.speakerBorn ?? d.speaker_born ?? '').trim(),
    speakerDied: String(d.speakerDied ?? d.speaker_died ?? '').trim(),
    speakerGuideLine: String(d.speakerGuideLine ?? d.speaker_guide_line ?? '').trim(),
    imageAttribution: String(d.imageAttribution ?? d.image_attribution ?? '').trim()
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  const db = initFirestore();
  const quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';
  const deleteField = admin.firestore.FieldValue.delete();
  const start = opts.start;

  const quoteBySourceId = new Map();
  const quotesSnap = await db.collection(quotesCollection).get();
  quotesSnap.forEach((docSnap) => {
    const row = quoteRowFromFirestore(docSnap);
    if (row) quoteBySourceId.set(row.sourceId, row);
  });

  const assignmentByDate = new Map();
  const assignmentsSnap = await db.collection(assignmentsCollection).get();
  assignmentsSnap.forEach((docSnap) => {
    if (!isDateKey(docSnap.id) || docSnap.id < start) return;
    const data = docSnap.data() || {};
    const sid = String(data.sourceId || '').trim();
    if (sid) assignmentByDate.set(docSnap.id, sid);
  });

  /** dateKey -> sid where assignment no longer matches quote's desired date */
  const staleDates = [];
  for (const [dateKey, sid] of assignmentByDate) {
    const q = quoteBySourceId.get(sid);
    if (!q) {
      staleDates.push({ dateKey, sid, reason: 'orphan_or_unapproved' });
      continue;
    }
    const want = normalizeDesiredDate(q);
    if (!want || want !== dateKey) {
      staleDates.push({ dateKey, sid, reason: want ? 'moved_in_notion' : 'cleared_in_notion' });
    }
  }

  const placements = [];
  for (const q of quoteBySourceId.values()) {
    const want = normalizeDesiredDate(q);
    if (!want || want < start) continue;
    placements.push({ sid: q.sourceId, dateKey: want, q });
  }
  placements.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.sid.localeCompare(b.sid));

  if (opts.dryRun) {
    console.log(
      `[reconcile] dry-run start=${start} quotes=${quoteBySourceId.size} futureAssignments=${assignmentByDate.size} staleSlots=${staleDates.length} placements=${placements.length}`
    );
    staleDates.forEach((s) => console.log(`  stale ${s.dateKey} (was ${s.sid}) ${s.reason}`));
    placements.forEach((p) => console.log(`  place ${p.sid} -> ${p.dateKey}`));
    return;
  }

  const batchState = { batch: db.batch(), ops: 0 };
  let clearedSlots = 0;
  let clearedQuoteDates = 0;
  let placed = 0;
  let displaced = 0;
  const updatedAt = new Date().toISOString();

  for (const row of staleDates) {
    const { dateKey, sid } = row;
    batchState.batch.delete(db.collection(assignmentsCollection).doc(dateKey));
    batchState.ops += 1;
    clearedSlots += 1;

    const dailyRef = db.collection(quotesCollection).doc(dateKey);
    batchState.batch.delete(dailyRef);
    batchState.ops += 1;

    const q = quoteBySourceId.get(sid);
    const want = q ? normalizeDesiredDate(q) : '';
    if (q && (!want || want !== dateKey)) {
      batchState.batch.set(
        db.collection(quotesCollection).doc(sid),
        {
          dateScheduled: deleteField,
          date_scheduled: deleteField,
          scheduleUpdatedAt: updatedAt,
          scheduleSource: 'notion-date-reconcile'
        },
        { merge: true }
      );
      batchState.ops += 1;
      clearedQuoteDates += 1;
    }

    assignmentByDate.delete(dateKey);
    await commitBatchIfNeeded(db, batchState);
  }

  for (const { sid, dateKey, q } of placements) {
    const occupant = assignmentByDate.get(dateKey);
    if (occupant && occupant !== sid) {
      batchState.batch.set(
        db.collection(quotesCollection).doc(occupant),
        {
          dateScheduled: deleteField,
          date_scheduled: deleteField,
          scheduleUpdatedAt: updatedAt,
          scheduleSource: 'notion-date-reconcile-displaced'
        },
        { merge: true }
      );
      batchState.ops += 1;
      displaced += 1;
    }

    const payload = assignmentPayloadForQuote(q, dateKey, 'notion-date-reconcile');
    batchState.batch.set(db.collection(assignmentsCollection).doc(dateKey), payload, { merge: true });
    batchState.ops += 1;

    batchState.batch.set(
      db.collection(quotesCollection).doc(dateKey),
      dailyQuotePayloadForQuote(q, dateKey, payload.assignedBy, updatedAt),
      { merge: true }
    );
    batchState.ops += 1;

    batchState.batch.set(
      db.collection(quotesCollection).doc(sid),
      {
        dateScheduled: dateKey,
        date_scheduled: dateKey,
        scheduleUpdatedAt: updatedAt,
        scheduleSource: 'notion-date-reconcile'
      },
      { merge: true }
    );
    batchState.ops += 1;

    assignmentByDate.set(dateKey, sid);
    placed += 1;
    await commitBatchIfNeeded(db, batchState);
  }

  if (batchState.ops > 0) await batchState.batch.commit();

  console.log(
    `[reconcile] start=${start} clearedSlots=${clearedSlots} clearedQuoteDateFields=${clearedQuoteDates} placed=${placed} displacedOccupants=${displaced} (${assignmentsCollection} / ${quotesCollection})`
  );
}

main().catch((err) => {
  console.error('[reconcile] failed:', err.message);
  process.exit(1);
});
