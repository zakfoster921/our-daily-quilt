#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Backfill empty `keyword` and/or `speaker_keywords` on existing quotes.
 *
 * Reads the Firestore quotes catalog, generates missing emphasis keywords (AI when
 * keys are configured, heuristic fallback), patches Firestore, and mirrors to Notion.
 *
 *   node scripts/backfill-quote-emphasis-keywords.cjs --dry-run
 *   node scripts/backfill-quote-emphasis-keywords.cjs --start=today --window=7
 *   node scripts/backfill-quote-emphasis-keywords.cjs --full-catalog
 *   node scripts/backfill-quote-emphasis-keywords.cjs --limit=20
 *   node scripts/backfill-quote-emphasis-keywords.cjs --heuristic-only
 *   node scripts/backfill-quote-emphasis-keywords.cjs --keyword-only
 *   node scripts/backfill-quote-emphasis-keywords.cjs --speaker-only
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
const {
  resolveQuoteKeywordPrefill,
  resolveSpeakerKeywordsPrefill,
  joinKeywordList
} = require('../lib/prefill-emphasis-fields');
const {
  layoutBKeywordEmphasisFirestorePatch,
  shouldSyncNotionKeywordEmphasis
} = require('./lib/layout-b-keyword-sync.cjs');
const {
  resolveAiProvider,
  suggestQuoteKeywordsWithAi,
  suggestSpeakerGuideKeywordsWithAi
} = require('./lib/quote-keywords-ai.cjs');
const {
  parseSyncWindowCli,
  isDateInSyncWindow,
  assignmentSourceIdsInWindow,
  resolveStartDateKey,
  addDays,
  isDateKey,
  DEFAULT_SYNC_WINDOW_DAYS
} = require('./lib/sync-window.cjs');

const NOTION_API_VERSION = '2022-06-28';
const AI_DELAY_MS = 250;

function defaultUpcomingWindow() {
  const startKey = resolveStartDateKey('today');
  const windowDays = DEFAULT_SYNC_WINDOW_DAYS;
  return { startKey, endKey: addDays(startKey, windowDays - 1), windowDays };
}

function parseArgs(argv) {
  const syncCli = parseSyncWindowCli(argv);
  const args = {
    dryRun: syncCli.dryRun,
    fullCatalog: syncCli.fullCatalog,
    window: syncCli.fullCatalog ? null : syncCli.window || defaultUpcomingWindow(),
    limit: 0,
    heuristicOnly: false,
    keywordOnly: false,
    speakerOnly: false,
    force: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run' || a === '--full-catalog') continue;
    if (a.startsWith('--start=') || a.startsWith('--window=')) continue;
    if (a === '--start' || a === '--window') {
      i += 1;
      continue;
    }
    if (a === '--heuristic-only') args.heuristicOnly = true;
    else if (a === '--keyword-only') args.keywordOnly = true;
    else if (a === '--speaker-only') args.speakerOnly = true;
    else if (a === '--force') args.force = true;
    else if (a.startsWith('--limit=')) args.limit = parseInt(a.slice('--limit='.length), 10);
  }
  if (args.keywordOnly && args.speakerOnly) {
    throw new Error('Use at most one of --keyword-only or --speaker-only');
  }
  if (!Number.isInteger(args.limit) || args.limit < 0) args.limit = 0;
  if (args.window && !isDateKey(args.window.startKey)) {
    throw new Error('--start must resolve to YYYY-MM-DD');
  }
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

function normKey(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]/g, '');
}

function findNotionPropName(schema, ...aliases) {
  const wanted = new Set(aliases.map(normKey));
  return Object.keys(schema || {}).find((name) => wanted.has(normKey(name))) || '';
}

function notionTextPropertyValue(prop, value) {
  const text = String(value || '').trim();
  if (!text) return null;
  switch (prop?.type) {
    case 'title':
      return { title: [{ text: { content: text } }] };
    case 'rich_text':
      return { rich_text: [{ text: { content: text } }] };
    case 'url':
      return { url: text };
    case 'select':
      return { select: { name: text } };
    case 'status':
      return { status: { name: text } };
    default:
      return null;
  }
}

async function notionFetchJson(pathname, options = {}) {
  const token = String(process.env.NOTION_TOKEN || '').trim();
  if (!token) return null;
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

function quoteTextFromDoc(data) {
  return String(
    data?.text ??
      data?.quote_text ??
      data?.notionProperties?.quote_text?.value ??
      ''
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordFromDoc(data) {
  return String(data?.keyword ?? data?.keywordSnapshot ?? data?.notionProperties?.keyword?.value ?? '').trim();
}

function speakerGuideFromDoc(data) {
  return String(data?.speaker_guide_line ?? data?.speakerGuideLine ?? '').trim();
}

function speakerKeywordsFromDoc(data) {
  return String(
    data?.speaker_keywords ?? data?.speakerKeywords ?? data?.notionProperties?.speaker_keywords?.value ?? ''
  ).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateScheduledFromDoc(data) {
  return String(data?.date_scheduled ?? data?.dateScheduled ?? '').trim();
}

/** Upcoming window: dailyQuoteAssignments source ids + catalog rows with date_scheduled in range. */
async function loadTargetDocs(db, col, window) {
  if (!window) {
    const snap = await db.collection(col).get();
    return snap.docs;
  }

  const assignmentsCol = process.env.FIRESTORE_DAILY_QUOTES_COLLECTION || 'dailyQuoteAssignments';
  const sourceIds = await assignmentSourceIdsInWindow(db, window, assignmentsCol);
  const docsById = new Map();

  for (const id of sourceIds) {
    const doc = await db.collection(col).doc(id).get();
    if (doc.exists) docsById.set(doc.id, doc);
    else console.warn(`[backfill-kw] assignment source missing catalog doc ${id}`);
  }

  const snap = await db.collection(col).get();
  for (const doc of snap.docs) {
    if (docsById.has(doc.id)) continue;
    const ds = dateScheduledFromDoc(doc.data());
    if (isDateInSyncWindow(ds, window)) docsById.set(doc.id, doc);
  }

  return [...docsById.values()].sort((a, b) => {
    const da = dateScheduledFromDoc(a.data()) || a.id;
    const dbd = dateScheduledFromDoc(b.data()) || b.id;
    return da.localeCompare(dbd);
  });
}

async function generateQuoteKeyword(quoteText, docId, useAi) {
  let aiInput = '';
  if (useAi) {
    try {
      const ai = await suggestQuoteKeywordsWithAi(quoteText);
      aiInput = joinKeywordList(ai.keywords);
      await sleep(AI_DELAY_MS);
    } catch (e) {
      console.warn(`[backfill-kw] AI quote keyword failed for ${docId}: ${e.message}`);
    }
  }
  return resolveQuoteKeywordPrefill(aiInput, quoteText, { dateKey: docId });
}

async function generateSpeakerKeywords(guideText, docId, useAi) {
  let aiInput = '';
  if (useAi) {
    try {
      const ai = await suggestSpeakerGuideKeywordsWithAi(guideText);
      aiInput = joinKeywordList(ai.keywords);
      await sleep(AI_DELAY_MS);
    } catch (e) {
      console.warn(`[backfill-kw] AI speaker keyword failed for ${docId}: ${e.message}`);
    }
  }
  return resolveSpeakerKeywordsPrefill(aiInput, guideText, { dateKey: docId });
}

async function patchNotionFields(pageId, schema, fields) {
  if (!schema || !pageId) return false;
  const properties = {};
  if (fields.keyword) {
    const propName = findNotionPropName(schema, 'keyword', 'Keyword');
    const payload = propName ? notionTextPropertyValue(schema[propName], fields.keyword) : null;
    if (payload) properties[propName] = payload;
  }
  if (fields.speaker_keywords) {
    const propName = findNotionPropName(
      schema,
      'speaker_keywords',
      'speaker_keyword',
      'speakerKeywords',
      'Speaker keywords',
      'Speaker keyword'
    );
    const payload = propName ? notionTextPropertyValue(schema[propName], fields.speaker_keywords) : null;
    if (payload) properties[propName] = payload;
  }
  if (!Object.keys(properties).length) return false;
  await notionFetchJson(`/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties })
  });
  return true;
}

async function main() {
  const args = parseArgs(process.argv);
  const useAi = !args.heuristicOnly && !!resolveAiProvider();
  const db = initFirestore();
  const col = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const targetDocs = await loadTargetDocs(db, col, args.window);
  const scopeLabel = args.window
    ? `${args.window.startKey}..${args.window.endKey} (${targetDocs.length} quotes)`
    : `full catalog (${targetDocs.length} quotes)`;
  console.log(`[backfill-kw] scope=${scopeLabel} dryRun=${args.dryRun} ai=${useAi}`);

  let notionSchema = null;
  const databaseId = String(process.env.NOTION_DATABASE_ID || '').trim();
  if (databaseId && String(process.env.NOTION_TOKEN || '').trim()) {
    try {
      const dbMeta = await notionFetchJson(`/databases/${databaseId}`);
      notionSchema = dbMeta?.properties || null;
    } catch (e) {
      console.warn(`[backfill-kw] Notion schema unavailable: ${e.message}`);
    }
  }

  let considered = 0;
  let patched = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of targetDocs) {
    if (args.limit > 0 && patched >= args.limit) break;

    const data = doc.data() || {};
    const quoteText = quoteTextFromDoc(data);
    const guideText = speakerGuideFromDoc(data);
    const existingKeyword = keywordFromDoc(data);
    const existingSpeakerKw = speakerKeywordsFromDoc(data);

    const needsKeyword =
      !args.speakerOnly && !!quoteText && (args.force || !existingKeyword);
    const needsSpeaker =
      !args.keywordOnly && !!guideText && (args.force || !existingSpeakerKw);

    if (!needsKeyword && !needsSpeaker) {
      skipped += 1;
      continue;
    }

    considered += 1;
    const patch = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      emphasisKeywordsBackfillAt: new Date().toISOString(),
      emphasisKeywordsBackfillSource: useAi ? 'ai+validate' : 'heuristic'
    };
    const notionFields = {};

    try {
      if (needsKeyword) {
        const keyword = await generateQuoteKeyword(quoteText, doc.id, useAi);
        if (!keyword) {
          console.warn(`[backfill-kw] no quote keyword for ${doc.id}`);
        } else {
          patch.keyword = keyword;
          patch.keywordSnapshot = keyword;
          notionFields.keyword = keyword;
          if (shouldSyncNotionKeywordEmphasis(data)) {
            const kwPatch = layoutBKeywordEmphasisFirestorePatch(keyword, quoteText, {
              updatedAt: patch.emphasisKeywordsBackfillAt,
              updatedBy: 'emphasis-keywords-backfill'
            });
            if (kwPatch.patch) Object.assign(patch, kwPatch.patch);
          }
        }
      }

      if (needsSpeaker) {
        const speakerKeywords = await generateSpeakerKeywords(guideText, doc.id, useAi);
        if (!speakerKeywords) {
          console.warn(`[backfill-kw] no speaker keywords for ${doc.id}`);
        } else {
          patch.speaker_keywords = speakerKeywords;
          patch.speakerKeywords = speakerKeywords;
          notionFields.speaker_keywords = speakerKeywords;
        }
      }

      const wroteKeyword = !!patch.keyword;
      const wroteSpeaker = !!patch.speaker_keywords;
      if (!wroteKeyword && !wroteSpeaker) {
        skipped += 1;
        continue;
      }

      const dateKey = dateScheduledFromDoc(data);
      const parts = [
        dateKey ? `date=${dateKey}` : null,
        wroteKeyword ? `keyword="${patch.keyword}"` : null,
        wroteSpeaker ? `speaker_keywords="${patch.speaker_keywords}"` : null
      ]
        .filter(Boolean)
        .join(' ');
      console.log(`[backfill-kw] ${doc.id} ${parts}${args.dryRun ? ' (dry-run)' : ''}`);

      if (!args.dryRun) {
        await doc.ref.set(patch, { merge: true });
        if (notionSchema) {
          await patchNotionFields(doc.id, notionSchema, notionFields);
        }
      }
      patched += 1;
    } catch (e) {
      failed += 1;
      console.warn(`[backfill-kw] failed ${doc.id}: ${e.message}`);
    }
  }

  console.log(
    `[backfill-kw] done scope=${scopeLabel} dryRun=${args.dryRun} ai=${useAi} considered=${considered} patched=${patched} skipped=${skipped} failed=${failed} collection=${col}`
  );
}

main().catch((e) => {
  console.error('[backfill-kw] fatal:', e);
  process.exit(1);
});
