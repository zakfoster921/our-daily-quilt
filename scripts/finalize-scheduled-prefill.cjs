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
const { addDays, isDateKey, resolveStartDateKey } = require('./lib/app-date-key.cjs');
const {
  buildSubmittedQuotePrefillPrompt,
  PREFILL_CREATIVE_PROMPT_VERSION
} = require('../lib/submitted-quote-prefill-prompts');

const NOTION_API_VERSION = '2022-06-28';
const WIKIPEDIA_USER_AGENT = 'OurDailyQuilt/1.0 (https://ourdailyquilt.com)';
const FINAL_FIELDS = ['community_prompt', 'watch_for', 'good_day', 'rough_day', 'ig_caption'];
const REQUIRED_FINAL_PREFILL_FIELDS = [
  {
    key: 'watch_for',
    requirement:
      'watch_for is required: one capitalized sentence fragment naming a specific observable moment or behavior to notice today — no "Watch for" prefix, no feelings, no homework; do not add a trailing period unless the copy needs one.'
  },
  {
    key: 'good_day',
    requirement:
      'good_day is required: a short, quirky declarative push with odd verbs or playful specificity — one or two short sentences, no questions, no generic pep-talk filler.'
  },
  {
    key: 'rough_day',
    requirement:
      'rough_day is required: a short reframe that names no emotions, makes no demands, and asks no questions. Three words to two short sentences.'
  }
];
const FIELD_ALIASES = {
  community_prompt: ['community_prompt', 'communityPrompt', 'Community prompt'],
  watch_for: ['watch_for', 'watchFor', 'Watch for'],
  good_day: ['good_day', 'goodDay', 'Good day', 'Good Day'],
  rough_day: ['rough_day', 'roughDay', 'Rough day', 'Rough Day'],
  ig_caption: ['ig_caption', 'igCaption', 'IG Caption'],
  speaker_dates: ['speaker_dates', 'speakerDates', 'Speaker dates', 'Speaker Dates']
};
const ASSIGNMENT_SNAPSHOT_FIELDS = {
  community_prompt: 'communityPromptSnapshot',
  watch_for: 'watch_for_snapshot',
  good_day: 'goodDaySnapshot',
  rough_day: 'roughDaySnapshot',
  ig_caption: 'igCaptionSnapshot',
  speaker_dates: 'speakerDatesSnapshot'
};

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

function pickString(parsed, ...aliases) {
  const wanted = new Set(aliases.map(normKey));
  for (const [key, value] of Object.entries(parsed || {})) {
    if (!wanted.has(normKey(key))) continue;
    if (typeof value === 'string') return value.trim();
    if (value != null && typeof value !== 'object') return String(value).trim();
  }
  return '';
}

function normalizeWatchFor(value) {
  let s = String(value || '').trim();
  s = s.replace(/^watch\s+for\s+(?:the\s+moment\s+today\s+when\s+)?/i, '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function mapPrefillFields(parsed, model) {
  return {
    community_prompt: pickString(parsed, 'community_prompt', 'communityPrompt', 'Community prompt'),
    watch_for: normalizeWatchFor(pickString(parsed, 'watch_for', 'watchFor', 'Watch for')),
    good_day: pickString(parsed, 'good_day', 'goodDay', 'Good day'),
    rough_day: pickString(parsed, 'rough_day', 'roughDay', 'Rough day'),
    ig_caption: pickString(parsed, 'ig_caption', 'igCaption', 'IG Caption'),
    _model: model
  };
}

function mergeNonEmptyPrefillFields(base, next) {
  const merged = { ...(base || {}) };
  for (const [key, value] of Object.entries(next || {})) {
    if (key === '_model') {
      merged[key] = value || merged[key];
      continue;
    }
    if (String(value || '').trim()) merged[key] = value;
  }
  return merged;
}

function findMissingRequiredFinalPrefillFields(out, requestedFields) {
  const requested = new Set(requestedFields || []);
  return REQUIRED_FINAL_PREFILL_FIELDS.filter(
    ({ key }) => requested.has(key) && !String(out?.[key] || '').trim()
  );
}

function parseSpeakerDatesFromExtract(extract) {
  const text = String(extract || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const parenContents = [];
  const re = /\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) parenContents.push(m[1]);
  const firstSentence = text.split(/[.!?](?:\s|$)/)[0] || text;
  const year = '(1[0-9]{3}|20[0-9]{2})';
  const yearRe = new RegExp(`\\b${year}\\b`, 'g');
  const spanRe = new RegExp(`\\b(?:c\\.?\\s*)?${year}\\s*(?:–|—|-|to)\\s*(?:c\\.?\\s*)?${year}\\b`, 'i');
  const bornDiedRe = new RegExp(`\\b(?:b\\.?|born)\\s*${year}\\b.*\\b(?:d\\.?|died)\\s*${year}\\b`, 'i');
  const candidates = [...parenContents, firstSentence].map((h) => String(h || ''));
  for (const haystack of candidates) {
    const bornDiedMatch = haystack.match(bornDiedRe);
    if (bornDiedMatch) return `${parseInt(bornDiedMatch[1], 10)} \u2013 ${parseInt(bornDiedMatch[2], 10)}`;
    const spanMatch = haystack.match(spanRe);
    if (spanMatch) return `${parseInt(spanMatch[1], 10)} \u2013 ${parseInt(spanMatch[2], 10)}`;
    const yearTokens = haystack.match(yearRe) || [];
    const years = Array.from(new Set(yearTokens.map((y) => parseInt(y, 10)))).sort((a, b) => a - b);
    if (!years.length) continue;
    if (/\bborn\b/i.test(haystack) || /\bb\.\s*\d/i.test(haystack)) return `born ${years[0]}`;
    if (/\bdied\b/i.test(haystack) || /\bd\.\s*\d/i.test(haystack)) return `died ${years[0]}`;
  }
  return '';
}

function yearFromWikidataTimeValue(value) {
  if (!value || typeof value !== 'object') return null;
  const t = String(value.time || '').replace(/^\+/, '');
  const y = parseInt(t.slice(0, 4), 10);
  return Number.isFinite(y) && y >= 1000 && y <= 2100 ? y : null;
}

function yearFromWikidataClaim(claimArray) {
  if (!Array.isArray(claimArray) || !claimArray.length) return null;
  const rankOrder = (r) => (r === 'preferred' ? 0 : r === 'normal' ? 1 : 2);
  const sorted = [...claimArray].sort((a, b) => rankOrder(a?.rank) - rankOrder(b?.rank));
  for (const c of sorted) {
    if (c?.mainsnak?.datatype !== 'time') continue;
    const y = yearFromWikidataTimeValue(c?.mainsnak?.datavalue?.value);
    if (y) return y;
  }
  return null;
}

function wikidataEntityIsHuman(claims) {
  const p31 = claims?.P31;
  if (!Array.isArray(p31)) return false;
  return p31.some((c) => c?.mainsnak?.datavalue?.value?.id === 'Q5');
}

function formatLifeSpanYears(birthY, deathY) {
  if (birthY && deathY) return `${birthY} \u2013 ${deathY}`;
  if (birthY) return `born ${birthY}`;
  if (deathY) return `died ${deathY}`;
  return '';
}

function normalizeSpeakerName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(?:jr|sr|ii|iii|iv)\.?\b/gi, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function speakerNameMatchesWikidataEntity(authorName, entity) {
  const query = normalizeSpeakerName(authorName);
  if (!query) return false;
  const candidates = [
    entity?.labels?.en?.value,
    ...(Array.isArray(entity?.aliases?.en) ? entity.aliases.en.map((a) => a?.value) : [])
  ]
    .map(normalizeSpeakerName)
    .filter(Boolean);
  if (candidates.includes(query)) return true;
  const queryTokens = query.split(' ').filter(Boolean);
  if (queryTokens.length < 2) return false;
  const queryTokenSet = new Set(queryTokens);
  const queryLast = queryTokens[queryTokens.length - 1];
  return candidates.some((candidate) => {
    const candidateTokens = candidate.split(' ').filter(Boolean);
    if (candidateTokens.length < queryTokens.length || candidateTokens.length > queryTokens.length + 2) return false;
    if (candidateTokens[candidateTokens.length - 1] !== queryLast) return false;
    const candidateTokenSet = new Set(candidateTokens);
    return [...queryTokenSet].every((token) => candidateTokenSet.has(token));
  });
}

async function fetchWikidataEntity(entityId) {
  const id = String(entityId || '').trim();
  if (!/^Q\d+$/.test(id)) return null;
  const ep = new URLSearchParams({
    action: 'wbgetentities',
    ids: id,
    format: 'json',
    props: 'claims|labels|aliases',
    languages: 'en'
  });
  const res = await fetch(`https://www.wikidata.org/w/api.php?${ep}`, {
    headers: { 'User-Agent': WIKIPEDIA_USER_AGENT }
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.entities?.[id] || null;
}

async function fetchWikidataSpeakerDatesById(entityId, authorName) {
  const entity = await fetchWikidataEntity(entityId);
  const claims = entity?.claims;
  if (!claims || !wikidataEntityIsHuman(claims)) return '';
  if (!speakerNameMatchesWikidataEntity(authorName, entity)) return '';
  return formatLifeSpanYears(yearFromWikidataClaim(claims.P569), yearFromWikidataClaim(claims.P570));
}

async function fetchWikidataSpeakerDates(authorName) {
  const q = String(authorName || '').trim();
  if (!q) return '';
  const searchParams = new URLSearchParams({
    action: 'wbsearchentities',
    search: q,
    language: 'en',
    type: 'item',
    format: 'json',
    limit: '10'
  });
  const res = await fetch(`https://www.wikidata.org/w/api.php?${searchParams}`, {
    headers: { 'User-Agent': WIKIPEDIA_USER_AGENT }
  });
  if (!res.ok) return '';
  const json = await res.json();
  for (const hit of json?.search || []) {
    const span = await fetchWikidataSpeakerDatesById(hit?.id, q);
    if (span) return span;
  }
  return '';
}

async function fetchSpeakerDates(authorName) {
  const name = String(authorName || '').trim();
  if (!name) return '';
  let summary = null;
  try {
    const title = encodeURIComponent(name.replace(/\s+/g, '_'));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, {
      headers: { 'User-Agent': WIKIPEDIA_USER_AGENT, Accept: 'application/json' },
      redirect: 'follow'
    });
    if (res.ok) summary = await res.json();
  } catch (_) {
    summary = null;
  }
  if (summary && summary.type !== 'disambiguation') {
    const direct = await fetchWikidataSpeakerDatesById(summary?.wikibase_item, name);
    if (direct) return direct;
  }
  const search = await fetchWikidataSpeakerDates(name);
  if (search) return search;
  if (summary && summary.type !== 'disambiguation') {
    const text = `${String(summary?.description || '').trim()} ${String(summary?.extract || '').trim()}`.trim();
    return parseSpeakerDatesFromExtract(text);
  }
  return '';
}

async function postClaude({ apiKey, model, prompt }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Claude ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return (json?.content || []).map((part) => (part?.type === 'text' ? part.text : '')).join('\n').trim();
}

async function postGemini({ apiKey, model, prompt }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return (json?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || '')
    .join('\n')
    .trim();
}

async function generateFinalPrefill({ quoteText, authorName, requestedFields = FINAL_FIELDS }) {
  const prompt = buildSubmittedQuotePrefillPrompt({ quoteText, authorName });
  const anthropicKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const isClaude = !!anthropicKey;
  const model = isClaude
    ? String(process.env.ANTHROPIC_PREFILL_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim()
    : String(process.env.GEMINI_PREFILL_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const postText = (repairPrompt) =>
    isClaude
      ? postClaude({ apiKey: anthropicKey, model, prompt: repairPrompt })
      : postGemini({ apiKey: geminiKey, model, prompt: repairPrompt });
  const providerLabel = isClaude ? 'Claude' : 'Gemini';

  const text = await postText(prompt);
  let parsed = extractBalancedJsonObject(text);
  if (!parsed || typeof parsed !== 'object') {
    const repairPrompt = `${prompt}\n\nYour previous output could not be parsed as JSON. Return ONLY the JSON object described in OUTPUT SCHEMA. No prose, no fences.`;
    const repairText = await postText(repairPrompt);
    parsed = extractBalancedJsonObject(repairText);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error(`${providerLabel} returned no parseable JSON`);
  let out = mapPrefillFields(parsed, model);
  let missing = findMissingRequiredFinalPrefillFields(out, requestedFields);
  if (missing.length) {
    const repairLines = [
      prompt,
      '',
      `Your previous JSON left ${missing.length === 1 ? 'this required field' : 'these required fields'} empty or missing: ${missing.map((m) => m.key).join(', ')}.`,
      'Return ONLY the full JSON object again, preserving good existing fields where possible. Do not regenerate fields that are already strong.',
      ...missing.map((m) => `- ${m.requirement}`),
      '',
      'Previous JSON:',
      JSON.stringify(parsed, null, 2)
    ];
    const repairText = await postText(repairLines.join('\n'));
    const repairParsed = extractBalancedJsonObject(repairText);
    if (repairParsed && typeof repairParsed === 'object') {
      out = mergeNonEmptyPrefillFields(out, mapPrefillFields(repairParsed, model));
    }
    missing = findMissingRequiredFinalPrefillFields(out, requestedFields);
  }
  if (missing.length) {
    const stillMissing = missing.map((m) => m.key).join(', ');
    console.warn(
      `[finalize-prefill] required fields empty after ${providerLabel} parse (model=${model}). Missing: ${stillMissing}. Top-level JSON keys: ${Object.keys(parsed).join(', ')}`
    );
    throw new Error(`${providerLabel} returned prefill JSON without required field(s): ${stillMissing}`);
  }
  return out;
}

function isAppSubmission(data) {
  if (String(data?.submittedVia ?? data?.submitted_via ?? '').trim().toLowerCase() === 'app') return true;
  if (String(data?.submittedBy ?? data?.submitted_by ?? '').trim()) return true;
  if (String(data?.submittedAt ?? data?.submitted_at ?? '').trim()) return true;
  return false;
}

function notionPropToPlain(prop) {
  if (!prop) return '';
  if (Array.isArray(prop.rich_text)) {
    return prop.rich_text.map((x) => x?.plain_text || '').join('').trim();
  }
  if (Array.isArray(prop.title)) {
    return prop.title.map((x) => x?.plain_text || '').join('').trim();
  }
  return '';
}

/** Editor-owned community prompt on the Notion row (if any). */
function readNotionCommunityPromptFromPageProperties(properties) {
  const aliases = FIELD_ALIASES.community_prompt || ['community_prompt'];
  const wanted = new Set(aliases.map(normKey));
  const found = Object.entries(properties || {}).find(([name]) => wanted.has(normKey(name)));
  return found ? notionPropToPlain(found[1]) : '';
}

async function fetchNotionCommunityPrompt(pageId) {
  const id = String(pageId || '').trim();
  if (!id || !String(process.env.NOTION_TOKEN || '').trim()) return '';
  try {
    const page = await notionFetchJson(`/pages/${id}`);
    return readNotionCommunityPromptFromPageProperties(page?.properties);
  } catch (e) {
    console.warn(`[finalize-prefill] Notion community_prompt read failed for ${id}: ${e.message}`);
    return '';
  }
}

function readField(data, field) {
  if (field === 'community_prompt') return String(data.community_prompt ?? data.communityPrompt ?? '').trim();
  if (field === 'watch_for') return String(data.watch_for ?? data.watchFor ?? '').trim();
  if (field === 'good_day') return String(data.good_day ?? data.goodDay ?? '').trim();
  if (field === 'rough_day') return String(data.rough_day ?? data.roughDay ?? '').trim();
  if (field === 'ig_caption') return String(data.ig_caption ?? data.igCaption ?? '').trim();
  if (field === 'speaker_dates') return String(data.speaker_dates ?? data.speakerDates ?? '').trim();
  return '';
}

function chooseFieldsToPatch(data) {
  const missing = FINAL_FIELDS.filter((field) => !readField(data, field));
  const currentVersion = String(data.creativePrefillVersion || data.prefillPromptVersion || '').trim();
  const appSubmission = isAppSubmission(data);
  const staleVersion = currentVersion && currentVersion !== PREFILL_CREATIVE_PROMPT_VERSION;
  const unversionedAppSubmission = appSubmission && !currentVersion;

  if (staleVersion || unversionedAppSubmission) return { fields: FINAL_FIELDS, reason: staleVersion ? 'stale_version' : 'app_submission_unversioned' };
  if (missing.length) return { fields: missing, reason: 'missing_fields' };
  return { fields: [], reason: 'current' };
}

function buildCatalogMirrorPatch(data) {
  const patch = {};
  for (const field of FINAL_FIELDS) {
    const value = readField(data, field);
    if (value) patch[field] = value;
  }
  return patch;
}

function buildPatch(fields, generated, nowIso) {
  const patch = {};
  for (const field of fields) {
    const value = String(generated[field] || '').trim();
    if (value) patch[field] = value;
  }
  const allRequestedFilled = fields.every((field) => patch[field]);
  if (allRequestedFilled && Object.keys(patch).length) {
    patch.creativePrefillVersion = PREFILL_CREATIVE_PROMPT_VERSION;
    patch.creativePrefillUpdatedAt = nowIso;
    patch.creativePrefillSource = 'scheduled-finalizer';
    patch.creativePrefillModel = String(generated._model || '').trim();
  }
  return patch;
}

function buildAssignmentPatch(patch) {
  const out = {};
  for (const [field, snapshotField] of Object.entries(ASSIGNMENT_SNAPSHOT_FIELDS)) {
    if (patch[field]) out[snapshotField] = String(patch[field]).slice(0, field === 'community_prompt' ? 500 : 400);
  }
  if (patch.creativePrefillVersion) {
    out.creativePrefillVersion = patch.creativePrefillVersion;
    out.creativePrefillUpdatedAt = patch.creativePrefillUpdatedAt;
    out.creativePrefillSource = patch.creativePrefillSource;
  }
  return out;
}

function buildNotionProperties(schema, patch, { skipFields = [] } = {}) {
  const properties = {};
  if (!schema) return properties;
  const skip = new Set(skipFields);
  for (const field of [...FINAL_FIELDS, 'speaker_dates']) {
    if (skip.has(field) || !patch[field]) continue;
    const propName = findNotionPropName(schema, ...(FIELD_ALIASES[field] || [field]));
    const payload = notionTextPropertyValue(schema[propName], patch[field]);
    if (propName && payload) properties[propName] = payload;
  }
  return properties;
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
    console.warn(`[finalize-prefill] Notion patch disabled: ${e.message}`);
    return null;
  });

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
    const chosen = chooseFieldsToPatch(data);
    const needsSpeakerDates = !readField(data, 'speaker_dates');
    const hasCatalogCreative = FINAL_FIELDS.some((field) => readField(data, field));
    if (!chosen.fields.length && !needsSpeakerDates && !hasCatalogCreative) continue;
    candidates.push({
      dateKey,
      sourceId,
      quoteText,
      authorName,
      fields: chosen.fields,
      reason: chosen.fields.length
        ? chosen.reason
        : needsSpeakerDates
          ? 'missing_speaker_dates'
          : 'mirror_sync',
      needsSpeakerDates,
      mirrorOnly: !chosen.fields.length && !needsSpeakerDates,
      data
    });
  }

  const limited = candidates.slice(0, opts.limit);
  let patched = 0;
  let failed = 0;
  for (const item of limited) {
    try {
      const notionCommunityPrompt = await fetchNotionCommunityPrompt(item.sourceId);
      const preserveNotionCommunityPrompt = !!notionCommunityPrompt;
      const fieldsToGenerate = preserveNotionCommunityPrompt
        ? item.fields.filter((field) => field !== 'community_prompt')
        : item.fields;

      let patch = {};
      if (fieldsToGenerate.length) {
        if (!hasAi) {
          console.log(`[finalize-prefill] skipped creative fields for ${item.dateKey} ${item.sourceId}: no AI key configured`);
        } else {
          const generated = await generateFinalPrefill({
            quoteText: item.quoteText,
            authorName: item.authorName,
            requestedFields: fieldsToGenerate
          });
          patch = buildPatch(fieldsToGenerate, generated, new Date().toISOString());
        }
      }
      if (item.needsSpeakerDates) {
        const speakerDates = await fetchSpeakerDates(item.authorName);
        if (speakerDates) patch.speaker_dates = speakerDates;
      }
      const catalogMirror = buildCatalogMirrorPatch(item.data);
      if (preserveNotionCommunityPrompt) {
        catalogMirror.community_prompt = notionCommunityPrompt;
        delete patch.community_prompt;
      }
      const mergedPatch = { ...catalogMirror, ...patch };
      if (!Object.keys(mergedPatch).length) continue;
      const assignmentPatch = buildAssignmentPatch(mergedPatch);
      const notionProperties = buildNotionProperties(schema, mergedPatch, {
        skipFields: preserveNotionCommunityPrompt ? ['community_prompt'] : []
      });
      const catalogWrite = { ...patch };
      if (preserveNotionCommunityPrompt) {
        catalogWrite.community_prompt = notionCommunityPrompt;
      }
      if (opts.dryRun) {
        const skipNote = preserveNotionCommunityPrompt ? ' preserve_notion_community_prompt=1' : '';
        console.log(`[finalize-prefill] dry-run ${item.dateKey} ${item.sourceId} reason=${item.reason}${skipNote} fields=${Object.keys(mergedPatch).filter((k) => FINAL_FIELDS.includes(k) || k === 'speaker_dates').join(',')}`);
        continue;
      }
      await db.collection(quotesCollection).doc(item.sourceId).set({ ...catalogWrite, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await db.collection(assignmentsCollection).doc(item.dateKey).set(assignmentPatch, { merge: true });
      await db.collection(dailyCollection).doc(item.dateKey).set({ ...mergedPatch, updatedAt: new Date().toISOString() }, { merge: true });
      if (schema && Object.keys(notionProperties).length) {
        await notionFetchJson(`/pages/${item.sourceId}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: notionProperties })
        });
      }
      patched += 1;
      const skipNote = preserveNotionCommunityPrompt ? ' preserve_notion_community_prompt=1' : '';
      console.log(`[finalize-prefill] patched ${item.dateKey} ${item.sourceId} reason=${item.reason}${skipNote} fields=${Object.keys(mergedPatch).filter((k) => FINAL_FIELDS.includes(k) || k === 'speaker_dates').join(',')}`);
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
