#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Inspect Notion `speaker_keywords` for one quote page (no Firestore write).
 *
 * Usage (from project root, with .env present):
 *   node scripts/debug-notion-speaker-keywords.cjs <notion-page-id>
 *
 * Example (use your real id — no angle brackets):
 *   node scripts/debug-notion-speaker-keywords.cjs 34340e02-c2c6-8185-9014-d3c0daf416ea
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

const NOTION_API_VERSION = '2022-06-28';

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name} (set it in .env at project root)`);
  }
  return String(value).trim();
}

function normPropKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

function plainFromRichTextSegment(x) {
  if (!x || typeof x !== 'object') return '';
  if (typeof x.plain_text === 'string' && x.plain_text) return x.plain_text;
  if (x.type === 'text' && x.text && typeof x.text.content === 'string') return x.text.content;
  return '';
}

function speakerKeywordsTextFromProp(prop) {
  if (!prop || typeof prop !== 'object') return '';
  if (Array.isArray(prop.rich_text)) {
    const t = prop.rich_text.map(plainFromRichTextSegment).join('').trim();
    if (t) return t;
  }
  if (prop.type === 'multi_select' && Array.isArray(prop.multi_select)) {
    return prop.multi_select
      .map((s) => (s && s.name ? String(s.name).trim() : ''))
      .filter(Boolean)
      .join(', ')
      .trim();
  }
  if (prop.select?.name) return String(prop.select.name).trim();
  if (prop.status?.name) return String(prop.status.name).trim();
  return '';
}

function findSpeakerKeywordsProp(props) {
  if (!props) return [null, ''];
  if (props.speaker_keywords) {
    return [props.speaker_keywords, 'speaker_keywords'];
  }
  for (const key of Object.keys(props)) {
    if (normPropKey(key) === 'speakerkeywords') return [props[key], key];
  }
  return [null, ''];
}

async function notionGetPage(pageId, notionToken) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_API_VERSION
    }
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Notion page fetch failed (${res.status}): ${body.slice(0, 400)}`);
  }
  return JSON.parse(body);
}

const NOTION_PAGE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePageIdArg(raw) {
  return String(raw || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

async function main() {
  const pageId = normalizePageIdArg(process.argv[2]);
  if (!pageId) {
    console.error('Usage: node scripts/debug-notion-speaker-keywords.cjs <notion-page-id>');
    console.error('Get the page id from the Notion URL (32 hex chars with hyphens).');
    process.exit(1);
  }
  if (/[<>]/.test(pageId)) {
    console.error('Remove angle brackets from the page id — paste only the uuid.');
    process.exit(1);
  }
  if (/YOUR[-_]?NOTION[-_]?PAGE[-_]?ID/i.test(pageId)) {
    console.error('Replace YOUR-NOTION-PAGE-ID with your real id from Notion (see steps below).');
    process.exit(1);
  }
  if (!NOTION_PAGE_ID_RE.test(pageId)) {
    console.error(`"${pageId}" is not a valid Notion page uuid.`);
    console.error('In Notion: open the quote row → ⋯ → Copy link.');
    console.error('The id is the long uuid in the URL, e.g.');
    console.error('  .../34340e02-c2c6-8156-8c7a-c23a3b270335?pvs=4');
    console.error('       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');
    process.exit(1);
  }

  const notionToken = requireEnv('NOTION_TOKEN');
  const page = await notionGetPage(pageId, notionToken);
  const props = page.properties || {};
  const author =
    props.author?.rich_text?.map(plainFromRichTextSegment).join('') ||
    props.Author?.rich_text?.map(plainFromRichTextSegment).join('') ||
    '';
  const dateScheduled = props.date_scheduled?.date?.start || props['Date scheduled']?.date?.start || '';
  const [rawProp, propName] = findSpeakerKeywordsProp(props);
  const resolved = speakerKeywordsTextFromProp(rawProp);

  const keywordish = Object.keys(props).filter((k) => {
    const n = normPropKey(k);
    return n.includes('keyword') || n.includes('speaker');
  });

  console.log('\n--- Notion speaker_keywords debug ---');
  console.log('pageId:', pageId);
  console.log('author:', author.trim());
  console.log('date_scheduled:', dateScheduled);
  console.log('column found:', propName || '(none)');
  console.log('column type:', rawProp?.type || '(n/a)');
  console.log('resolved text:', resolved ? `"${resolved}"` : '(empty — cell blank in Notion or unreadable type)');
  console.log('\nRelated columns on this page:', keywordish.join(', ') || '(none)');
  if (rawProp) {
    console.log('\nRaw property JSON:');
    console.log(JSON.stringify(rawProp, null, 2));
  }
  console.log('\nFirestore after sync: quotes/' + pageId + '  field  speaker_keywords');
  if (!resolved) {
    console.log('\nTip: Fill the speaker_keywords cell in Notion for this row, then run:');
    console.log('  node scripts/sync-notion-to-firestore.cjs today --window=7');
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
