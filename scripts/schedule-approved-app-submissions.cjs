#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config();
} catch (_) {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[match[1]] == null) process.env[match[1]] = value;
    }
  }
}

const admin = require('firebase-admin');
const { addDays, resolveStartDateKey } = require('./lib/app-date-key.cjs');
const { speakerCutoutUrlForPortrait } = require('./lib/speaker-cutout-portrait-match.cjs');
const { catalogFieldsForAssignmentMirror } = require('./lib/first-response-fields.cjs');
const {
  authorCooldownDays,
  addUsedAuthor,
  usedAuthorKeysFromAssignments,
  buildLastUsedByAuthor,
  takeNextSpacedQuote
} = require('./lib/schedule-quote-pool.cjs');
const DAILY_QUOTE_CAMEL_FIELDS_TO_DELETE = [
  'artRecs',
  'artRecsType',
  'communityPrompt',
  'whatIf',
  'igCaption',
  'speakerImageUrl',
  'speakerCutoutUrl',
  'speakerCutoutSourceUrl',
  'speakerCutoutUpdatedAt',
  'speakerDates',
  'speakerBorn',
  'speakerDied',
  'speakerGuideLine',
  'speakerKeywords',
  'imageAttribution'
];

function camelCaseDeletePayload() {
  const deleteField = admin.firestore.FieldValue.delete();
  return Object.fromEntries(DAILY_QUOTE_CAMEL_FIELDS_TO_DELETE.map((key) => [key, deleteField]));
}

function requireDateArg(value, name) {
  const v = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`${name} must be YYYY-MM-DD`);
  }
  return v;
}

function parseArgs(argv) {
  const args = {
    start: 'today',
    cadence: 1,
    window: 9,
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
  args.start = requireDateArg(resolveStartDateKey(args.start), '--start');
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

function isCommunitySubmittedQuote(q) {
  if (String(q?.submittedVia || '').trim().toLowerCase() === 'app') return true;
  if (String(q?.submittedBy || '').trim()) return true;
  if (String(q?.submittedAt || '').trim()) return true;
  return false;
}

function artRecsSnapshotValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  try {
    return JSON.stringify(value);
  } catch (_) {
    return '';
  }
}

function assignmentPayloadForQuote(q, dateKey, assignedBy) {
  const artRecs = q.artRecs ?? q.art_recs ?? '';
  const artRecsType = String(q.artRecsType ?? q.art_recs_type ?? '').trim().toLowerCase();
  const smallAct = String(q.small_act ?? q.smallAct ?? '').trim();
  const watchFor = String(q.watch_for ?? '').trim();
  const goodDay = String(q.good_day ?? q.goodDay ?? '').trim();
  const roughDay = String(q.rough_day ?? q.roughDay ?? '').trim();
  return {
    dateKey,
    sourceId: q.sourceId || null,
    embeddedStableKey: null,
    textSnapshot: q.text.slice(0, 160),
    authorSnapshot: q.author.slice(0, 120),
    blessingSnapshot: q.blessing.slice(0, 240),
    communityPromptSnapshot: String(q.community_prompt ?? q.communityPrompt ?? '').slice(0, 500),
    smallActSnapshot: smallAct.slice(0, 240),
    watch_for_snapshot: watchFor.slice(0, 280),
    goodDaySnapshot: goodDay.slice(0, 240),
    roughDaySnapshot: roughDay.slice(0, 240),
    whatIfSnapshot: String(q.what_if ?? q.whatIf ?? '').slice(0, 240),
    artRecsSnapshot: artRecsSnapshotValue(artRecs).slice(0, 1200),
    artRecsTypeSnapshot: artRecsType.slice(0, 40),
    igCaptionSnapshot: q.igCaption.slice(0, 400),
    speakerImageUrlSnapshot: q.speakerImageUrl.slice(0, 500),
    speakerCutoutUrlSnapshot: speakerCutoutUrlForPortrait(q.speakerCutoutUrl, q.speakerImageUrl).slice(0, 500),
    speakerDatesSnapshot: q.speakerDates.slice(0, 120),
    speakerBornSnapshot: q.speakerBorn.slice(0, 80),
    speakerDiedSnapshot: q.speakerDied.slice(0, 80),
    speakerGuideLineSnapshot: q.speakerGuideLine.slice(0, 260),
    speakerKeywordsSnapshot: String(q.speakerKeywords ?? q.speaker_keywords ?? '').slice(0, 200),
    imageAttributionSnapshot: q.imageAttribution.slice(0, 260),
    submittedViaSnapshot: String(q.submittedVia ?? q.submitted_via ?? '').slice(0, 40),
    assignedAt: new Date().toISOString(),
    assignedBy,
    // Keep first_response mirrored onto scheduled assignment rows.
    ...catalogFieldsForAssignmentMirror(q)
  };
}

function dailyQuoteSnakePayloadForQuote(q, dateKey, assignedBy, updatedAt) {
  const artRecs = q.art_recs ?? q.artRecs ?? '';
  const artRecsType = String(q.art_recs_type ?? q.artRecsType ?? '').trim().toLowerCase();
  return {
    dateKey,
    text: q.text,
    quote: q.text,
    author: q.author,
    sourceId: q.sourceId || null,
    blessing: String(q.blessing ?? '').trim(),
    community_prompt: String(q.community_prompt ?? q.communityPrompt ?? '').trim(),
    what_if: String(q.what_if ?? q.whatIf ?? '').trim(),
    watch_for: String(q.watch_for ?? '').trim(),
    art_recs: artRecs,
    art_recs_type: artRecsType,
    ig_caption: String(q.ig_caption ?? q.igCaption ?? '').trim(),
    small_act: String(q.small_act ?? q.smallAct ?? '').trim(),
    good_day: String(q.good_day ?? q.goodDay ?? '').trim(),
    rough_day: String(q.rough_day ?? q.roughDay ?? '').trim(),
    speaker_image_url: String(q.speaker_image_url ?? q.speakerImageUrl ?? '').trim(),
    speaker_cutout_url:
      speakerCutoutUrlForPortrait(
        String(q.speaker_cutout_url ?? q.speakerCutoutUrl ?? '').trim(),
        String(q.speaker_image_url ?? q.speakerImageUrl ?? '').trim()
      ) || '',
    speaker_dates: String(q.speaker_dates ?? q.speakerDates ?? '').trim(),
    speaker_born: String(q.speaker_born ?? q.speakerBorn ?? '').trim(),
    speaker_died: String(q.speaker_died ?? q.speakerDied ?? '').trim(),
    speaker_guide_line: String(q.speaker_guide_line ?? q.speakerGuideLine ?? '').trim(),
    speaker_keywords: String(q.speaker_keywords ?? q.speakerKeywords ?? '').trim(),
    image_attribution: String(q.image_attribution ?? q.imageAttribution ?? '').trim(),
    submitted_via: String(q.submittedVia ?? q.submitted_via ?? '').trim(),
    assignedBy,
    assignedAt: updatedAt,
    updatedAt
  };
}

/** merge:true writes — strip legacy camelCase keys via FieldValue.delete(). */
function dailyQuotePayloadForQuote(q, dateKey, assignedBy, updatedAt) {
  return {
    ...camelCaseDeletePayload(),
    ...dailyQuoteSnakePayloadForQuote(q, dateKey, assignedBy, updatedAt)
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
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
    });
  } else {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        'Missing GOOGLE_APPLICATION_CREDENTIALS_JSON or FIREBASE_PROJECT_ID (load .env from project root)'
      );
    }
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
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
    // Soft-deleted Notion pages stay in the catalog for windowed sync; never reschedule them.
    if (d.notionPageRemoved === true) return;
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
      what_if: String(d.what_if ?? d.whatIf ?? '').trim(),
      watch_for: String(d.watch_for ?? '').trim(),
      small_act: String(d.small_act ?? d.smallAct ?? '').trim(),
      good_day: String(d.good_day ?? d.goodDay ?? '').trim(),
      rough_day: String(d.rough_day ?? d.roughDay ?? '').trim(),
      artRecs: d.artRecs ?? d.art_recs ?? '',
      art_recs: d.art_recs ?? d.artRecs ?? '',
      artRecsType: String(d.artRecsType ?? d.art_recs_type ?? '').trim().toLowerCase(),
      art_recs_type: String(d.art_recs_type ?? d.artRecsType ?? '').trim().toLowerCase(),
      igCaption: String(d.igCaption ?? d.ig_caption ?? '').trim(),
      speakerImageUrl: String(d.speakerImageUrl ?? d.speaker_image_url ?? '').trim(),
      speakerCutoutUrl: String(d.speakerCutoutUrl ?? d.speaker_cutout_url ?? '').trim(),
      speakerDates: String(d.speakerDates ?? d.speaker_dates ?? '').trim(),
      speakerBorn: String(d.speakerBorn ?? d.speaker_born ?? '').trim(),
      speakerDied: String(d.speakerDied ?? d.speaker_died ?? '').trim(),
      speakerGuideLine: String(d.speakerGuideLine ?? d.speaker_guide_line ?? '').trim(),
      speakerKeywords: String(d.speakerKeywords ?? d.speaker_keywords ?? '').trim(),
      imageAttribution: String(d.imageAttribution ?? d.image_attribution ?? '').trim(),
      submittedAt: String(d.submittedAt || '').trim(),
      submittedVia: String(d.submittedVia || d.submitted_via || '').trim(),
      submittedBy: String(d.submittedBy || d.submitted_by || '').trim(),
      dateScheduled: String(d.dateScheduled || d.date_scheduled || '').trim(),
      lastUsedDate: String(d.lastUsedDate || d.last_used_date || '').trim(),
      notionLastEditedTime: String(d.notionLastEditedTime || '').trim(),
      scheduleSource: String(d.scheduleSource || '').trim(),
      schedulePriorityAt: String(d.schedulePriorityAt || '').trim(),
      first_response: String(d.first_response || '').trim()
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
  const quoteBySourceId = new Map(notionQuotes.map((q) => [q.sourceId, q]));
  const cooldownDays = authorCooldownDays();
  const lookbackStart = addDays(opts.start, -cooldownDays);
  const futureAssignments = [];
  const recentAssignments = [];
  const scheduledSourceIds = new Set();
  assignmentsSnap.forEach((docSnap) => {
    if (!isDateKey(docSnap.id)) return;
    const data = docSnap.data() || {};
    const row = { dateKey: docSnap.id, data };
    if (docSnap.id >= lookbackStart) recentAssignments.push(row);
    if (docSnap.id < opts.start) return;
    const sourceId = String(data.sourceId || '').trim();
    if (sourceId) scheduledSourceIds.add(sourceId);
    futureAssignments.push(row);
  });
  futureAssignments.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  recentAssignments.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const lastUsedByAuthor = buildLastUsedByAuthor(recentAssignments, notionQuotes, quoteBySourceId);

  const submissionsToInsert = notionQuotes.filter((q) => {
    if (!isCommunitySubmittedQuote(q)) return false;
    if (scheduledSourceIds.has(q.sourceId)) return false;
    if (isDateKey(q.dateScheduled)) return false;
    return true;
  });
  submissionsToInsert.sort((a, b) => {
    const aPriority = a.schedulePriorityAt || a.submittedAt || '';
    const bPriority = b.schedulePriorityAt || b.submittedAt || '';
    if (aPriority !== bPriority) return aPriority.localeCompare(bPriority);
    const aSubmitted = a.submittedAt || '';
    const bSubmitted = b.submittedAt || '';
    if (aSubmitted !== bSubmitted) return aSubmitted.localeCompare(bSubmitted);
    return a.sourceId.localeCompare(b.sourceId);
  });

  {
    const windowEnd = addDays(opts.start, (opts.window - 1) * opts.cadence);
    const windowAssignments = futureAssignments.filter((row) => row.dateKey <= windowEnd);
    const targetCount = opts.window;
    const appendCount = Math.max(0, targetCount - windowAssignments.length);
    const assignedDateKeys = new Set(futureAssignments.map((row) => row.dateKey));
    let cursorDate =
      windowAssignments.length > 0
        ? windowAssignments[windowAssignments.length - 1].dateKey
        : addDays(opts.start, -1);

    const scheduled = [];
    const windowAuthors = usedAuthorKeysFromAssignments(windowAssignments, quoteBySourceId);
    const usedAuthors = usedAuthorKeysFromAssignments(
      recentAssignments.filter((row) => row.dateKey < opts.start),
      quoteBySourceId
    );
    for (const key of windowAuthors) usedAuthors.add(key);
    const candidatePool = submissionsToInsert.slice();
    while (scheduled.length < appendCount && candidatePool.length) {
      const quote = takeNextSpacedQuote(candidatePool, usedAuthors, lastUsedByAuthor, windowAuthors);
      if (!quote) break;
      const dateKey = firstOpenDateAfter(cursorDate, assignedDateKeys);
      if (dateKey > windowEnd) break;
      assignedDateKeys.add(dateKey);
      cursorDate = dateKey;
      addUsedAuthor(usedAuthors, quote.author);
      addUsedAuthor(windowAuthors, quote.author);
      scheduled.push({
        dateKey,
        quote,
        payload: assignmentPayloadForQuote(quote, dateKey, 'approved-app-submission-append-scheduler')
      });
    }

    if (opts.dryRun) {
      console.log(
        `[app-submissions] dry-run priority-append candidates=${submissionsToInsert.length} appending=${scheduled.length} preserved=${futureAssignments.length} window=${opts.window} start=${opts.start}`
      );
      console.log('[app-submissions] appended assignments:');
      scheduled.forEach((row) => {
        console.log(`  ${row.dateKey} -> ${row.payload.textSnapshot} — ${row.payload.authorSnapshot}`);
      });
      return;
    }

    if (!scheduled.length) {
      console.log(
        `[app-submissions] priority-append no-op candidates=${submissionsToInsert.length} windowAssignments=${windowAssignments.length}/${targetCount} (${assignmentsCollection} / ${quotesCollection}, start=${opts.start})`
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
      `[app-submissions] priority-append wrote ${writes} assignments + ${quoteWrites} quote date fields, preserved ${futureAssignments.length} existing assignments (${assignmentsCollection} / ${quotesCollection}, start=${opts.start}, window=${opts.window})`
    );
    return;
  }

}

main().catch((err) => {
  console.error('[app-submissions] failed:', err.message);
  process.exit(1);
});
