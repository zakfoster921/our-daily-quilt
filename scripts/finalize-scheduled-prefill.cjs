#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Schedule-time creative prefill for quotes assigned in the upcoming window.
 * Single source of truth for AI + Wikipedia enrichment (no submission-time prefill).
 *
 *   node scripts/finalize-scheduled-prefill.cjs --start=today --window=7 --limit=7
 *   node scripts/finalize-scheduled-prefill.cjs --dry-run
 */
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
const { addDays, isDateKey, resolveStartDateKey } = require('./lib/app-date-key.cjs');
const {
  SCHEDULED_CREATIVE_FIELDS,
  PREFILL_CREATIVE_PROMPT_VERSION,
  QUOTE_MOOD_OPTIONS,
  chooseScheduledFieldsToPatch,
  readCatalogField,
  readNotionFieldFromPageProperties,
  runScheduledCreativePrefill,
  findNotionPropName,
  notionSchemaOptionNames
} = require('../lib/quote-creative-prefill.cjs');

const NOTION_API_VERSION = '2022-06-28';

function parseArgs(argv) {
  const args = {
    start: 'today',
    window: 7,
    limit: 7,
    dryRun: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--start=')) args.start = a.slice('--start='.length);
    else if (a.startsWith('--window=')) args.window = parseInt(a.slice('--window='.length), 10);
    else if (a.startsWith('--limit=')) args.limit = parseInt(a.slice('--limit='.length), 10);
  }
  args.start = resolveStartDateKey(args.start);
  if (!isDateKey(args.start)) throw new Error('--start must resolve to YYYY-MM-DD');
  if (!Number.isInteger(args.window) || args.window < 1) args.window = 7;
  if (!Number.isInteger(args.limit) || args.limit < 1) args.limit = 7;
  args.limit = Math.min(args.limit, 25);
  return args;
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
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }
  return admin.firestore();
}

async function notionFetchJson(pathname, options = {}) {
  const token = String(process.env.NOTION_TOKEN || '').trim();
  if (!token) throw new Error('NOTION_TOKEN is not configured');
  const res = await fetch(`https://api.notion.com/v1${pathname}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json'
    },
    body: options.body
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Notion ${res.status}: ${text || res.statusText}`);
  return text ? JSON.parse(text) : {};
}

async function getNotionDatabaseSchema() {
  const databaseId = String(process.env.NOTION_DATABASE_ID || '').trim();
  if (!databaseId || !String(process.env.NOTION_TOKEN || '').trim()) return null;
  const dbMeta = await notionFetchJson(`/databases/${databaseId}`);
  return dbMeta?.properties || null;
}

async function fetchNotionPageContext(pageId) {
  const id = String(pageId || '').trim();
  if (!id || !String(process.env.NOTION_TOKEN || '').trim()) {
    return { lastEditedTime: '', fields: {} };
  }
  try {
    const page = await notionFetchJson(`/pages/${id}`);
    const fields = {};
    for (const field of ['community_prompt', 'watch_for', 'good_day', 'rough_day']) {
      fields[field] = readNotionFieldFromPageProperties(page?.properties, field);
    }
    return {
      lastEditedTime: String(page?.last_edited_time || '').trim(),
      fields
    };
  } catch (e) {
    console.warn(`[finalize-prefill] Notion page read failed for ${id}: ${e.message}`);
    return { lastEditedTime: '', fields: {} };
  }
}

function resolveSchemaOptions(schema) {
  const promptThemeName = findNotionPropName(schema, 'prompt_theme', 'promptTheme', 'Prompt theme', 'Prompt Theme');
  const moodName = findNotionPropName(schema, 'mood', 'Mood');
  const promptThemeOptions = promptThemeName ? notionSchemaOptionNames(schema[promptThemeName]) : [];
  const moodOptionsFromSchema = moodName ? notionSchemaOptionNames(schema[moodName]) : [];
  const moodOptions = moodOptionsFromSchema.length ? moodOptionsFromSchema : QUOTE_MOOD_OPTIONS;
  return { promptThemeOptions, moodOptions };
}

function needsScheduledPrefill(data, moodOptions) {
  const chosen = chooseScheduledFieldsToPatch(data, { moodOptions });
  const needsSpeakerDates = !readCatalogField(data, 'speaker_dates');
  const needsPortrait = !readCatalogField(data, 'speaker_image_url');
  const hasCatalogCreative = SCHEDULED_CREATIVE_FIELDS.some((field) => readCatalogField(data, field));
  if (chosen.fields.length) {
    return { run: true, reason: chosen.reason, fields: chosen.fields };
  }
  if (needsSpeakerDates || needsPortrait) {
    return { run: true, reason: needsSpeakerDates ? 'missing_speaker_dates' : 'missing_portrait', fields: [] };
  }
  if (!hasCatalogCreative) {
    return { run: true, reason: 'missing_creative', fields: SCHEDULED_CREATIVE_FIELDS.filter((f) => f !== 'mood' || moodOptions.length) };
  }
  return { run: false, reason: 'current', fields: [] };
}

async function main() {
  const opts = parseArgs(process.argv);
  const hasAi = String(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || '').trim();

  const db = initFirestore();
  const quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';
  const dailyCollection = process.env.FIRESTORE_DAILY_QUOTES_COLLECTION || quotesCollection;
  const dates = Array.from({ length: opts.window }, (_, idx) => addDays(opts.start, idx));
  const schema = await getNotionDatabaseSchema().catch((e) => {
    console.warn(`[finalize-prefill] Notion schema unavailable: ${e.message}`);
    return null;
  });
  const { promptThemeOptions, moodOptions } = resolveSchemaOptions(schema || {});

  const candidates = [];
  for (const dateKey of dates) {
    const assignSnap = await db.collection(assignmentsCollection).doc(dateKey).get();
    const sourceId = String(assignSnap.data()?.sourceId || '').trim();
    if (!sourceId) continue;
    const quoteSnap = await db.collection(quotesCollection).doc(sourceId).get();
    if (!quoteSnap.exists) continue;
    const data = quoteSnap.data() || {};
    const quoteText = String(data.text || data.quote || '').trim();
    const authorName = String(data.author || '').trim();
    if (!quoteText || !authorName) continue;

    const plan = needsScheduledPrefill(data, moodOptions);
    if (!plan.run) continue;
    candidates.push({
      dateKey,
      sourceId,
      quoteText,
      authorName,
      reason: plan.reason,
      fields: plan.fields,
      data
    });
  }

  const limited = candidates.slice(0, opts.limit);
  let patched = 0;
  let failed = 0;

  for (const item of limited) {
    try {
      if (item.fields.length && !hasAi) {
        console.log(`[finalize-prefill] skipped creative fields for ${item.dateKey} ${item.sourceId}: no AI key configured`);
        continue;
      }

      const notionPage = await fetchNotionPageContext(item.sourceId);
      const result = await runScheduledCreativePrefill({
        quoteText: item.quoteText,
        authorName: item.authorName,
        catalogData: item.data,
        sourceId: item.sourceId,
        schema,
        db,
        notionPage,
        fieldsToGenerate: item.fields.length ? item.fields : null,
        promptThemeOptions,
        moodOptions
      });

      const { mergedPatch, assignmentPatch, notionProperties, catalogWrite, preserveFieldNames } = result;
      if (!Object.keys(mergedPatch).length) continue;

      const skipNote = preserveFieldNames.length ? ` preserve_notion=${preserveFieldNames.join('+')}` : '';
      const fieldList = Object.keys(mergedPatch).filter((k) => !k.startsWith('creativePrefill')).join(',');

      if (opts.dryRun) {
        console.log(`[finalize-prefill] dry-run ${item.dateKey} ${item.sourceId} reason=${item.reason}${skipNote} fields=${fieldList}`);
        continue;
      }

      const catalogPayload = { ...catalogWrite, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      await db.collection(quotesCollection).doc(item.sourceId).set(catalogPayload, { merge: true });
      if (Object.keys(assignmentPatch).length) {
        await db.collection(assignmentsCollection).doc(item.dateKey).set(assignmentPatch, { merge: true });
      }
      await db.collection(dailyCollection).doc(item.dateKey).set(
        { ...mergedPatch, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      if (schema && Object.keys(notionProperties).length) {
        await notionFetchJson(`/pages/${item.sourceId}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: notionProperties })
        });
      }

      patched += 1;
      console.log(`[finalize-prefill] patched ${item.dateKey} ${item.sourceId} reason=${item.reason}${skipNote} fields=${fieldList}`);
    } catch (e) {
      failed += 1;
      console.warn(`[finalize-prefill] failed ${item.dateKey} ${item.sourceId}: ${e.message}`);
    }
  }

  console.log(
    `[finalize-prefill] complete start=${opts.start} window=${opts.window} candidates=${candidates.length} processed=${limited.length} patched=${patched} failed=${failed} version=${PREFILL_CREATIVE_PROMPT_VERSION}`
  );
}

main().catch((e) => {
  console.error('[finalize-prefill] fatal:', e);
  process.exit(1);
});
