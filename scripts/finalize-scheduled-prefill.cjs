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
const FINAL_FIELDS = ['community_prompt', 'watch_for', 'good_day', 'rough_day', 'ig_caption'];
const FIELD_ALIASES = {
  community_prompt: ['community_prompt', 'communityPrompt', 'Community prompt'],
  watch_for: ['watch_for', 'watchFor', 'Watch for'],
  good_day: ['good_day', 'goodDay', 'Good day', 'Good Day'],
  rough_day: ['rough_day', 'roughDay', 'Rough day', 'Rough Day'],
  ig_caption: ['ig_caption', 'igCaption', 'IG Caption']
};
const ASSIGNMENT_SNAPSHOT_FIELDS = {
  community_prompt: 'communityPromptSnapshot',
  watch_for: 'watch_for_snapshot',
  good_day: 'goodDaySnapshot',
  rough_day: 'roughDaySnapshot',
  ig_caption: 'igCaptionSnapshot'
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

async function generateFinalPrefill({ quoteText, authorName }) {
  const prompt = buildSubmittedQuotePrefillPrompt({ quoteText, authorName });
  const anthropicKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const isClaude = !!anthropicKey;
  const model = isClaude
    ? String(process.env.ANTHROPIC_PREFILL_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim()
    : String(process.env.GEMINI_PREFILL_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const text = isClaude
    ? await postClaude({ apiKey: anthropicKey, model, prompt })
    : await postGemini({ apiKey: geminiKey, model, prompt });
  let parsed = extractBalancedJsonObject(text);
  if (!parsed || typeof parsed !== 'object') {
    const repairPrompt = `${prompt}\n\nYour previous output could not be parsed as JSON. Return ONLY the JSON object described in OUTPUT SCHEMA. No prose, no fences.`;
    const repairText = isClaude
      ? await postClaude({ apiKey: anthropicKey, model, prompt: repairPrompt })
      : await postGemini({ apiKey: geminiKey, model, prompt: repairPrompt });
    parsed = extractBalancedJsonObject(repairText);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('AI returned no parseable JSON');
  return mapPrefillFields(parsed, model);
}

function isAppSubmission(data) {
  if (String(data?.submittedVia ?? data?.submitted_via ?? '').trim().toLowerCase() === 'app') return true;
  if (String(data?.submittedBy ?? data?.submitted_by ?? '').trim()) return true;
  if (String(data?.submittedAt ?? data?.submitted_at ?? '').trim()) return true;
  return false;
}

function readField(data, field) {
  if (field === 'community_prompt') return String(data.community_prompt ?? data.communityPrompt ?? '').trim();
  if (field === 'watch_for') return String(data.watch_for ?? data.watchFor ?? '').trim();
  if (field === 'good_day') return String(data.good_day ?? data.goodDay ?? '').trim();
  if (field === 'rough_day') return String(data.rough_day ?? data.roughDay ?? '').trim();
  if (field === 'ig_caption') return String(data.ig_caption ?? data.igCaption ?? '').trim();
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

function buildPatch(fields, generated, nowIso) {
  const patch = {};
  for (const field of fields) {
    const value = String(generated[field] || '').trim();
    if (value) patch[field] = value;
  }
  if (Object.keys(patch).length) {
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

function buildNotionProperties(schema, patch) {
  const properties = {};
  if (!schema) return properties;
  for (const field of FINAL_FIELDS) {
    if (!patch[field]) continue;
    const propName = findNotionPropName(schema, ...(FIELD_ALIASES[field] || [field]));
    const payload = notionTextPropertyValue(schema[propName], patch[field]);
    if (propName && payload) properties[propName] = payload;
  }
  return properties;
}

async function main() {
  const opts = parseArgs(process.argv);
  const hasAi = String(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (!hasAi) {
    console.log('[finalize-prefill] skipped: no ANTHROPIC_API_KEY or GEMINI_API_KEY configured');
    return;
  }

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
    if (!chosen.fields.length) continue;
    candidates.push({ dateKey, sourceId, quoteText, authorName, fields: chosen.fields, reason: chosen.reason, data });
  }

  const limited = candidates.slice(0, opts.limit);
  let patched = 0;
  let failed = 0;
  for (const item of limited) {
    try {
      const generated = await generateFinalPrefill({ quoteText: item.quoteText, authorName: item.authorName });
      const patch = buildPatch(item.fields, generated, new Date().toISOString());
      if (!Object.keys(patch).length) continue;
      const assignmentPatch = buildAssignmentPatch(patch);
      const notionProperties = buildNotionProperties(schema, patch);
      if (opts.dryRun) {
        console.log(`[finalize-prefill] dry-run ${item.dateKey} ${item.sourceId} reason=${item.reason} fields=${Object.keys(patch).filter((k) => FINAL_FIELDS.includes(k)).join(',')}`);
        continue;
      }
      await db.collection(quotesCollection).doc(item.sourceId).set({ ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await db.collection(assignmentsCollection).doc(item.dateKey).set(assignmentPatch, { merge: true });
      await db.collection(dailyCollection).doc(item.dateKey).set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
      if (schema && Object.keys(notionProperties).length) {
        await notionFetchJson(`/pages/${item.sourceId}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: notionProperties })
        });
      }
      patched += 1;
      console.log(`[finalize-prefill] patched ${item.dateKey} ${item.sourceId} reason=${item.reason} fields=${Object.keys(patch).filter((k) => FINAL_FIELDS.includes(k)).join(',')}`);
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
