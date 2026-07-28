#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Backfill empty Notion `mood` select on catalog quotes (AI picks one of seven labels).
 *
 *   node scripts/backfill-notion-mood.cjs --dry-run
 *   node scripts/backfill-notion-mood.cjs --limit=25
 *   node scripts/backfill-notion-mood.cjs --all
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
  buildMoodOnlyPrefillPrompt,
  resolveMoodOption,
  QUOTE_MOOD_OPTIONS
} = require('../lib/submitted-quote-prefill-prompts');
const { resolveAiProvider, postKeywordAiText } = require('./lib/quote-keywords-ai.cjs');

const NOTION_API_VERSION = '2022-06-28';
const AI_DELAY_MS = 300;

function parseArgs(argv) {
  const args = { dryRun: false, limit: 25, all: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--all') args.all = true;
    else if (a.startsWith('--limit=')) args.limit = parseInt(a.slice('--limit='.length), 10);
  }
  if (args.all) args.limit = 0;
  if (!Number.isInteger(args.limit) || args.limit < 0) args.limit = 25;
  return args;
}

function normKey(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]/g, '');
}

function findNotionPropName(schema, ...aliases) {
  const wanted = new Set(aliases.map(normKey));
  return Object.keys(schema || {}).find((name) => wanted.has(normKey(name))) || '';
}

function notionSchemaOptionNames(prop) {
  if (!prop) return [];
  if (prop.type === 'select') {
    return (prop.select?.options || []).map((o) => String(o?.name || '').trim()).filter(Boolean);
  }
  return [];
}

function notionPlain(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':
      return (prop.title || []).map((t) => t.plain_text || '').join('').trim();
    case 'rich_text':
      return (prop.rich_text || []).map((t) => t.plain_text || '').join('').trim();
    case 'select':
      return String(prop.select?.name || '').trim();
    default:
      return '';
  }
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

function extractBalancedJsonObject(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
}

function extractQuoteTextFromPage(page, schema) {
  const quoteName = findNotionPropName(schema, 'quote', 'Quote', 'text', 'Text');
  const props = page.properties || {};
  if (quoteName && props[quoteName]) {
    const t = notionPlain(props[quoteName]);
    if (t) return t;
  }
  for (const [name, prop] of Object.entries(props)) {
    if (prop?.type === 'title') {
      const t = notionPlain(prop);
      if (t) return t;
    }
  }
  return '';
}

function extractAuthorFromPage(page, schema) {
  const authorName = findNotionPropName(schema, 'author', 'Author', 'speaker', 'Speaker');
  const props = page.properties || {};
  if (authorName && props[authorName]) return notionPlain(props[authorName]);
  return '';
}

async function queryEmptyMoodPages(databaseId, moodName, pageSize = 100, startCursor) {
  const body = {
    page_size: pageSize,
    filter: { property: moodName, select: { is_empty: true } }
  };
  if (startCursor) body.start_cursor = startCursor;
  return notionFetchJson(`/databases/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
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
    const credPath = path.join(process.cwd(), 'firebase-adminsdk-local.json');
    const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id
    });
  }
  return admin.firestore();
}

async function suggestMoodWithAi({ quoteText, authorName, moodOptions }) {
  const prompt = buildMoodOnlyPrefillPrompt({ quoteText, authorName, moodOptions });
  const raw = await postKeywordAiText(prompt);
  const parsed = extractBalancedJsonObject(raw);
  const mood = resolveMoodOption(moodOptions, parsed?.mood || parsed?.Mood || '');
  if (!mood) throw new Error(`AI returned no valid mood (${String(raw).slice(0, 120)})`);
  return mood;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  if (!resolveAiProvider()) {
    throw new Error('ANTHROPIC_API_KEY or GEMINI_API_KEY is required');
  }
  const databaseId = String(process.env.NOTION_DATABASE_ID || '').trim();
  if (!databaseId) throw new Error('NOTION_DATABASE_ID is required');

  const dbMeta = await notionFetchJson(`/databases/${databaseId}`);
  const schema = dbMeta?.properties || {};
  const moodName = findNotionPropName(schema, 'mood', 'Mood');
  if (!moodName || schema[moodName]?.type !== 'select') {
    throw new Error('Notion database is missing a `mood` select column');
  }
  const moodOptionsFromSchema = notionSchemaOptionNames(schema[moodName]);
  const moodOptions = moodOptionsFromSchema.length ? moodOptionsFromSchema : QUOTE_MOOD_OPTIONS;

  let firestore = null;
  if (!args.dryRun) {
    try {
      firestore = initFirestore();
    } catch (e) {
      console.warn('Firestore init skipped:', e.message);
    }
  }

  const stats = { scanned: 0, updated: 0, skipped: 0, failed: 0 };
  let cursor;
  let remaining = args.limit > 0 ? args.limit : Infinity;

  console.log(
    args.dryRun
      ? `Dry run — listing up to ${remaining === Infinity ? 'all' : remaining} empty mood rows`
      : `Backfilling mood (limit ${remaining === Infinity ? 'none' : remaining})`
  );

  do {
    const page = await queryEmptyMoodPages(databaseId, moodName, 100, cursor);
    const rows = Array.isArray(page.results) ? page.results : [];
    cursor = page.has_more ? page.next_cursor : null;

    for (const row of rows) {
      if (remaining <= 0) break;
      stats.scanned += 1;
      remaining -= 1;

      const quoteText = extractQuoteTextFromPage(row, schema);
      const authorName = extractAuthorFromPage(row, schema);
      if (!quoteText) {
        stats.skipped += 1;
        console.log(`skip ${row.id.slice(0, 8)} — no quote text`);
        continue;
      }

      if (args.dryRun) {
        console.log(`would fill ${row.id.slice(0, 8)} — ${authorName || '(no author)'} — ${quoteText.slice(0, 60)}…`);
        continue;
      }

      try {
        const mood = await suggestMoodWithAi({
          quoteText,
          authorName: authorName || 'Unknown',
          moodOptions
        });
        await notionFetchJson(`/pages/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            properties: {
              [moodName]: { select: { name: mood } }
            }
          })
        });
        if (firestore) {
          const collection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
          await firestore
            .collection(collection)
            .doc(row.id)
            .set({ mood, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
        stats.updated += 1;
        console.log(`ok ${row.id.slice(0, 8)} → ${mood.split('—')[0].trim()}`);
        await sleep(AI_DELAY_MS);
      } catch (e) {
        stats.failed += 1;
        console.warn(`fail ${row.id.slice(0, 8)}:`, e.message);
      }
    }
  } while (cursor && remaining > 0);

  console.log('Done:', stats);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
