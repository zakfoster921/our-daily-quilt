'use strict';

const { finalizePrefillEmphasisFields } = require('./prefill-emphasis-fields');
const {
  buildSubmittedQuotePrefillPrompt,
  normalizeArtRecsPrefillValue,
  resolveMoodOption,
  QUOTE_MOOD_OPTIONS,
  PREFILL_CREATIVE_PROMPT_VERSION
} = require('./submitted-quote-prefill-prompts');

const SCHEDULED_CREATIVE_FIELDS = [
  'author',
  'community_prompt',
  'small_act',
  'blessing',
  'notification_text',
  'ig_caption',
  'what_if',
  'watch_for',
  'speaker_guide_line',
  'keyword',
  'speaker_keywords',
  'art_recs',
  'good_day',
  'rough_day',
  'prompt_theme',
  'mood'
];

const PRESERVE_IF_NOTION_EDITED_AFTER_PREFILL = [
  'community_prompt',
  'watch_for',
  'good_day',
  'rough_day'
];

const FIELD_ALIASES = {
  author: ['author', 'Author'],
  community_prompt: ['community_prompt', 'community_prompt ', 'communityPrompt', 'Community prompt'],
  small_act: ['small_act', 'smallAct', 'Small act', 'Small Act'],
  blessing: ['blessing', 'Daily blessing', 'daily_blessing'],
  notification_text: ['notification_text', 'notificationText', 'Notification text'],
  ig_caption: ['ig_caption', 'igCaption', 'IG Caption'],
  what_if: ['what_if', 'whatIf', 'What if'],
  watch_for: ['watch_for', 'watchFor', 'Watch for'],
  speaker_guide_line: ['speaker_guide_line', 'speakerGuideLine', 'Guide line', 'Speaker guide line'],
  keyword: ['keyword', 'Keyword'],
  speaker_keywords: ['speaker_keywords', 'speaker_keyword', 'speakerKeywords', 'Speaker keywords', 'Speaker keyword'],
  art_recs: ['art_recs', 'artRecs', 'Art recs', 'explore'],
  good_day: ['good_day', 'goodDay', 'Good day', 'Good Day'],
  rough_day: ['rough_day', 'roughDay', 'Rough day', 'Rough Day'],
  prompt_theme: ['prompt_theme', 'promptTheme', 'Prompt theme', 'Prompt Theme'],
  mood: ['mood', 'Mood'],
  speaker_dates: ['speaker_dates', 'speakerDates', 'Speaker dates', 'Speaker Dates'],
  speaker_image_url: ['speaker_image_url', 'speakerImageUrl', 'Speaker image URL', 'image_url'],
  image_attribution: ['image_attribution', 'imageAttribution', 'Image attribution', 'Image Attribution']
};

const ASSIGNMENT_SNAPSHOT_FIELDS = {
  community_prompt: 'communityPromptSnapshot',
  watch_for: 'watch_for_snapshot',
  good_day: 'goodDaySnapshot',
  rough_day: 'roughDaySnapshot',
  ig_caption: 'igCaptionSnapshot',
  speaker_dates: 'speakerDatesSnapshot'
};

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
    case 'email':
      return { email: text };
    case 'phone_number':
      return { phone_number: text };
    case 'select':
      return { select: { name: text } };
    case 'status':
      return { status: { name: text } };
    case 'multi_select': {
      const names = text.split(',').map((s) => s.trim()).filter(Boolean);
      return names.length ? { multi_select: names.map((name) => ({ name })) } : null;
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}/.test(text) ? { date: { start: text.slice(0, 10) } } : null;
    case 'number': {
      const n = Number.parseFloat(text);
      return Number.isFinite(n) ? { number: n } : null;
    }
    default:
      return null;
  }
}

function notionSchemaOptionNames(prop) {
  const bucket = prop?.type ? prop[prop.type] : null;
  const options = bucket?.options;
  return Array.isArray(options) ? options.map((o) => String(o?.name || '').trim()).filter(Boolean) : [];
}

function resolvePromptThemeOptions(promptThemeOptions, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const validByLower = new Map((promptThemeOptions || []).map((opt) => [String(opt || '').trim().toLowerCase(), String(opt).trim()]));
  const matched = [];
  const seen = new Set();
  for (const part of text.split(',')) {
    const target = part.trim().toLowerCase();
    if (!target) continue;
    const canonical = validByLower.get(target);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      matched.push(canonical);
    }
  }
  return matched.join(', ');
}

function readCatalogField(data, field) {
  const d = data || {};
  switch (field) {
    case 'author':
      return String(d.author || '').trim();
    case 'community_prompt':
      return String(d.community_prompt ?? d.communityPrompt ?? '').trim();
    case 'small_act':
      return String(d.small_act ?? d.smallAct ?? '').trim();
    case 'blessing':
      return String(d.blessing ?? '').trim();
    case 'notification_text':
      return String(d.notification_text ?? d.notificationText ?? '').trim();
    case 'ig_caption':
      return String(d.ig_caption ?? d.igCaption ?? '').trim();
    case 'what_if':
      return String(d.what_if ?? d.whatIf ?? '').trim();
    case 'watch_for':
      return String(d.watch_for ?? d.watchFor ?? '').trim();
    case 'speaker_guide_line':
      return String(d.speaker_guide_line ?? d.speakerGuideLine ?? '').trim();
    case 'keyword':
      return String(d.keyword ?? d.keywordSnapshot ?? '').trim();
    case 'speaker_keywords':
      return String(d.speaker_keywords ?? d.speakerKeywords ?? '').trim();
    case 'art_recs':
      return String(d.art_recs ?? d.artRecs ?? '').trim();
    case 'good_day':
      return String(d.good_day ?? d.goodDay ?? '').trim();
    case 'rough_day':
      return String(d.rough_day ?? d.roughDay ?? '').trim();
    case 'prompt_theme':
      return String(d.prompt_theme ?? d.promptTheme ?? '').trim();
    case 'mood':
      return String(d.mood ?? '').trim();
    case 'speaker_dates':
      return String(d.speaker_dates ?? d.speakerDates ?? '').trim();
    case 'speaker_image_url':
      return String(d.speaker_image_url ?? d.speakerImageUrl ?? '').trim();
    case 'image_attribution':
      return String(d.image_attribution ?? d.imageAttribution ?? '').trim();
    default:
      return '';
  }
}

function isSeamsideSubmission(data) {
  return String(data?.submittedVia ?? data?.submitted_via ?? '').trim().toLowerCase() === 'seamside';
}

function chooseScheduledFieldsToPatch(data, { moodOptions = [] } = {}) {
  const missing = SCHEDULED_CREATIVE_FIELDS.filter((field) => {
    if (field === 'mood' && !moodOptions.length) return false;
    return !readCatalogField(data, field);
  });
  const currentVersion = String(data?.creativePrefillVersion || data?.prefillPromptVersion || '').trim();
  const staleVersion = currentVersion && currentVersion !== PREFILL_CREATIVE_PROMPT_VERSION;
  const neverPrefilled = !currentVersion;
  if (staleVersion || neverPrefilled) {
    return {
      fields: SCHEDULED_CREATIVE_FIELDS.filter((field) => field !== 'mood' || moodOptions.length),
      reason: staleVersion ? 'stale_version' : 'never_prefilled'
    };
  }
  if (missing.length) return { fields: missing, reason: 'missing_fields' };
  return { fields: [], reason: 'current' };
}

function notionPropToPlain(prop) {
  if (!prop) return '';
  if (Array.isArray(prop.rich_text)) return prop.rich_text.map((x) => x?.plain_text || '').join('').trim();
  if (Array.isArray(prop.title)) return prop.title.map((x) => x?.plain_text || '').join('').trim();
  if (typeof prop?.url === 'string') return prop.url.trim();
  if (prop?.select?.name) return String(prop.select.name).trim();
  if (prop?.status?.name) return String(prop.status.name).trim();
  if (Array.isArray(prop?.multi_select)) {
    return prop.multi_select.map((s) => (s?.name ? String(s.name).trim() : '')).filter(Boolean).join(', ');
  }
  return '';
}

function readNotionFieldFromPageProperties(properties, field) {
  const aliases = FIELD_ALIASES[field] || [field];
  const wanted = new Set(aliases.map(normKey));
  const found = Object.entries(properties || {}).find(([name]) => wanted.has(normKey(name)));
  return found ? notionPropToPlain(found[1]) : '';
}

function buildPreserveFromNotionMap(notionPage, catalogData) {
  const out = {};
  const prefillAt = String(catalogData?.creativePrefillUpdatedAt || '').trim();
  const prefillMs = prefillAt && Number.isFinite(Date.parse(prefillAt)) ? Date.parse(prefillAt) : null;
  const notionEdited = String(notionPage?.lastEditedTime || '').trim();
  const notionEditedMs = notionEdited && Number.isFinite(Date.parse(notionEdited)) ? Date.parse(notionEdited) : null;

  for (const field of PRESERVE_IF_NOTION_EDITED_AFTER_PREFILL) {
    const notionText = String(notionPage?.fields?.[field] || '').trim();
    if (!notionText) continue;
    if (prefillMs == null || notionEditedMs == null || notionEditedMs > prefillMs) {
      out[field] = notionText;
    }
  }
  return out;
}

function buildCatalogMirrorPatch(data) {
  const patch = {};
  for (const field of SCHEDULED_CREATIVE_FIELDS) {
    const value = readCatalogField(data, field);
    if (value) patch[field] = value;
  }
  for (const field of ['speaker_dates', 'speaker_image_url', 'image_attribution']) {
    const value = readCatalogField(data, field);
    if (value) patch[field] = value;
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

/** Normalize JSON object keys the same way as Notion property names (small_act ↔ smallact). */
function normPrefillJsonKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s_-]/g, '');
}

/**
 * Read a string field from Claude JSON even when the model varies key spelling
 * (e.g. smallAct, Small act, small-act).
 */
function pickPrefillStringLoose(parsed, ...aliases) {
  if (!parsed || typeof parsed !== 'object') return '';
  const targets = new Set(aliases.map(normPrefillJsonKey).filter(Boolean));
  for (const [k, v] of Object.entries(parsed)) {
    if (!targets.has(normPrefillJsonKey(k))) continue;
    if (typeof v === 'string') return v.replace(/^\s+|\s+$/g, '');
    if (Array.isArray(v)) {
      return v
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .join(', ');
    }
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

/** First balanced `{ ... }` in text (string-aware); avoids greedy-regex JSON grabs that break on extra `}`. */
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
      if (esc) {
        esc = false;
      } else if (c === '\\') {
        esc = true;
      } else if (c === '"') {
        inString = false;
      }
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
        const slice = s.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
}

function extractPrefillJsonFromText(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const balanced = extractBalancedJsonObject(raw);
    if (balanced && typeof balanced === 'object') return balanced;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

function mapSubmittedQuotePrefillFields(parsed, model) {
  return {
    author: pickPrefillStringLoose(parsed, 'author'),
    community_prompt: pickPrefillStringLoose(parsed, 'community_prompt', 'communityPrompt', 'community_prompt '),
    small_act: pickPrefillStringLoose(
      parsed,
      'small_act',
      'smallAct',
      'small_action',
      'small act',
      'smallact'
    ),
    blessing: pickPrefillStringLoose(parsed, 'blessing'),
    notification_text: pickPrefillStringLoose(parsed, 'notification_text', 'notificationText'),
    ig_caption: pickPrefillStringLoose(parsed, 'ig_caption', 'igCaption'),
    what_if: pickPrefillStringLoose(parsed, 'what_if', 'whatIf'),
    watch_for: normalizeWatchForPrefillValue(
      pickPrefillStringLoose(parsed, 'watch_for', 'watchFor', 'watch for')
    ),
    speaker_guide_line: pickPrefillStringLoose(parsed, 'speaker_guide_line', 'speakerGuideLine', 'guide_line'),
    keyword: pickPrefillStringLoose(parsed, 'keyword', 'keywords', 'Keyword'),
    speaker_keywords: pickPrefillStringLoose(
      parsed,
      'speaker_keywords',
      'speakerKeywords',
      'speaker_keyword',
      'speaker keyword'
    ),
    art_recs: normalizeArtRecsPrefillValue(
      pickPrefillStringLoose(parsed, 'art_recs', 'artRecs', 'art_recommendations')
    ),
    good_day: pickPrefillStringLoose(parsed, 'good_day', 'goodDay', 'good day'),
    rough_day: pickPrefillStringLoose(parsed, 'rough_day', 'roughDay', 'rough day'),
    prompt_theme: pickPrefillStringLoose(parsed, 'prompt_theme', 'promptTheme', 'prompt theme'),
    mood: pickPrefillStringLoose(parsed, 'mood', 'Mood'),
    _model: model
  };
}

/**
 * Snap the model's comma-separated prompt_theme guess to the exact-cased Notion
 * multi_select options (prompt_theme is a multi_select, so 1-3 tags can match).
 * Returns a comma-joined string of matched tags (deduped, original schema casing), or '' if none match.
 */
function resolvePromptThemeOptions(promptThemeOptions, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const validByLower = new Map((promptThemeOptions || []).map((opt) => [String(opt || '').trim().toLowerCase(), String(opt).trim()]));
  const matched = [];
  const seen = new Set();
  for (const part of text.split(',')) {
    const target = part.trim().toLowerCase();
    if (!target) continue;
    const canonical = validByLower.get(target);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      matched.push(canonical);
    }
  }
  return matched.join(', ');
}

function normalizeWatchForPrefillValue(value) {
  let s = String(value || '').trim();
  if (!s) return '';
  s = s.replace(/^watch\s+for\s+(?:the\s+moment\s+today\s+when\s+)?/i, '').trim();
  if (s) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
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

/** Web search grounds speaker_guide_line for artists (e.g. SEAMSIDE guests) Claude wouldn't otherwise know. */
const SEAMSIDE_PREFILL_WEB_SEARCH_TOOLS = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 3 }
];

async function postSubmittedQuotePrefillToClaude({ apiKey, model, prompt, tools }) {
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
      messages: [{ role: 'user', content: prompt }],
      ...(tools && tools.length ? { tools } : {})
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Claude ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return (json?.content || []).map((part) => (part?.type === 'text' ? part.text : '')).join('\n').trim();
}

async function postSubmittedQuotePrefillToGemini({ apiKey, model, prompt }) {
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

// Fields that must come back non-empty from Claude. One consolidated repair pass
// is made if any are missing; if any are still empty after the repair, we throw
// (which surfaces to the Notion `ai_prefill_error` column via the caller).
const REQUIRED_PREFILL_FIELDS = [
  {
    key: 'small_act',
    requirement:
      'small_act is required and must be one non-empty sentence: a concrete interpersonal action the reader can complete before the day ends.'
  },
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

function findMissingRequiredPrefillFields(out, moodOptions) {
  const missing = REQUIRED_PREFILL_FIELDS.filter(({ key }) => !String(out?.[key] || '').trim());
  if ((moodOptions || []).length && !String(out?.mood || '').trim()) {
    missing.push({
      key: 'mood',
      requirement:
        'mood is required: pick exactly one label verbatim from the provided Notion mood select list — the emotional tone that best fits the quote.'
    });
  }
  return missing;
}

async function generateSubmittedQuotePrefillFieldsWithProvider({
  quoteText,
  authorName,
  promptThemeOptions,
  moodOptions,
  provider,
  isSeamside = false
}) {
  const isGemini = provider === 'gemini';
  const prompt = buildSubmittedQuotePrefillPrompt({
    quoteText,
    authorName,
    promptThemeOptions,
    moodOptions,
    isSeamside: isSeamside && !isGemini
  });
  const apiKey = isGemini
    ? String(process.env.GEMINI_API_KEY || '').trim()
    : String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error(isGemini ? 'GEMINI_API_KEY is not configured on server' : 'ANTHROPIC_API_KEY is not configured on server');
  }
  const model = isGemini
    ? String(process.env.GEMINI_PREFILL_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim()
    : String(process.env.ANTHROPIC_PREFILL_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim();
  // Gemini doesn't support Anthropic's web_search tool syntax; Seamside grounding is Claude-only for now.
  const tools = !isGemini && isSeamside ? SEAMSIDE_PREFILL_WEB_SEARCH_TOOLS : undefined;
  const postText = (p) =>
    isGemini
      ? postSubmittedQuotePrefillToGemini({ apiKey, model, prompt: p })
      : postSubmittedQuotePrefillToClaude({ apiKey, model, prompt: p, tools });
  const providerLabel = isGemini ? 'Gemini' : 'Claude';

  const firstText = await postText(prompt);
  let parsed = extractPrefillJsonFromText(firstText);
  if (!parsed || typeof parsed !== 'object') {
    const repairPrompt = `${prompt}\n\nYour previous output could not be parsed as JSON. Return ONLY the JSON object described in OUTPUT SCHEMA. No prose, no fences.`;
    const repairText = await postText(repairPrompt);
    parsed = extractPrefillJsonFromText(repairText);
  }
  if (!parsed || typeof parsed !== 'object') {
    const preview = String(firstText || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    throw new Error(`${providerLabel} returned no parseable prefill JSON. Preview: ${preview || '[empty]'}`);
  }
  let out = mapSubmittedQuotePrefillFields(parsed, model);
  out.mood = resolveMoodOption(moodOptions, out.mood);
  let missing = findMissingRequiredPrefillFields(out, moodOptions);
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
    const repairParsed = extractPrefillJsonFromText(repairText);
    if (repairParsed && typeof repairParsed === 'object') {
      out = mergeNonEmptyPrefillFields(out, mapSubmittedQuotePrefillFields(repairParsed, model));
      out.mood = resolveMoodOption(moodOptions, out.mood);
    }
    missing = findMissingRequiredPrefillFields(out, moodOptions);
  }
  if (missing.length) {
    const stillMissing = missing.map((m) => m.key).join(', ');
    console.warn(
      `[prefill] required fields empty after ${providerLabel} parse (model=${model}). Missing: ${stillMissing}. Top-level JSON keys: ${Object.keys(parsed).join(', ')}`
    );
    throw new Error(`${providerLabel} returned prefill JSON without required field(s): ${stillMissing}`);
  }
  return finalizePrefillEmphasisFields(out, quoteText);
}

async function generateSubmittedQuotePrefillFields({
  quoteText,
  authorName,
  promptThemeOptions,
  moodOptions,
  isSeamside = false
}) {
  if (String(process.env.ANTHROPIC_API_KEY || '').trim()) {
    return generateSubmittedQuotePrefillFieldsWithProvider({
      quoteText,
      authorName,
      promptThemeOptions,
      moodOptions,
      provider: 'anthropic',
      isSeamside
    });
  }
  if (String(process.env.GEMINI_API_KEY || '').trim()) {
    return generateSubmittedQuotePrefillFieldsWithProvider({
      quoteText,
      authorName,
      promptThemeOptions,
      moodOptions,
      provider: 'gemini',
      isSeamside
    });
  }
  throw new Error('ANTHROPIC_API_KEY or GEMINI_API_KEY must be configured on server');
}

// --- Wikipedia / Wikimedia speaker lookup -----------------------------------

const WIKIPEDIA_USER_AGENT = 'OurDailyQuilt/1.0 (https://ourdailyquilt.com)';

function parseSpeakerDatesFromExtract(extract) {
  const text = String(extract || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // Wikipedia lead usually puts birth/death years in a parenthetical, but the
  // first paren may be IPA/pronunciation only (e.g. "Audre Lorde (/ˈɔːdri lɔːrd/) (1934–1992)").
  // Collect every parenthetical and use only clear lifespan patterns. Avoid
  // treating unrelated prose years (publication dates, centuries, awards) as life dates.
  const parenContents = [];
  const re = /\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) parenContents.push(m[1]);
  const firstSentence = text.split(/[.!?](?:\s|$)/)[0] || text;
  // Years 1000–2099 covers everyone whose dates the app would plausibly cite.
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

/**
 * Wikidata structured dates (P569 birth, P570 death) are preferred for Notion
 * `speaker_dates`; Wikipedia prose is too easy to misread when an intro contains
 * publication years, movement years, or unrelated historical dates.
 */
function yearFromWikidataTimeValue(value) {
  if (!value || typeof value !== 'object') return null;
  const t = String(value.time || '').replace(/^\+/, '');
  const y = parseInt(t.slice(0, 4), 10);
  return Number.isFinite(y) && y >= 1000 && y <= 2100 ? y : null;
}

function yearFromWikidataClaim(claimArray) {
  if (!Array.isArray(claimArray) || !claimArray.length) return null;
  const rankOrder = (r) => (r === 'preferred' ? 0 : r === 'normal' ? 1 : 2);
  const sorted = [...claimArray].sort(
    (a, b) => rankOrder(a?.rank) - rankOrder(b?.rank)
  );
  for (const c of sorted) {
    if (c?.mainsnak?.datatype !== 'time') continue;
    const sn = c?.mainsnak?.datavalue?.value;
    const y = yearFromWikidataTimeValue(sn);
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

function normalizeWikidataSpeakerName(value) {
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
  const query = normalizeWikidataSpeakerName(authorName);
  if (!query) return false;
  const labels = entity?.labels || {};
  const aliases = entity?.aliases || {};
  const candidates = [
    labels.en?.value,
    ...(Array.isArray(aliases.en) ? aliases.en.map((a) => a?.value) : [])
  ]
    .map(normalizeWikidataSpeakerName)
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

async function fetchWikidataEntityForSpeakerDates(entityId) {
  const id = String(entityId || '').trim();
  if (!/^Q\d+$/.test(id)) return null;
  try {
    const ep = new URLSearchParams({
      action: 'wbgetentities',
      ids: id,
      format: 'json',
      props: 'claims|labels|aliases|descriptions',
      languages: 'en'
    });
    const er = await fetch(`https://www.wikidata.org/w/api.php?${ep}`, {
      headers: { 'User-Agent': WIKIPEDIA_USER_AGENT }
    });
    if (!er.ok) return null;
    const entityJson = await er.json();
    return entityJson?.entities?.[id] || null;
  } catch {
    return null;
  }
}

async function fetchWikidataSpeakerDatesById(entityId, authorName, options = {}) {
  const id = String(entityId || '').trim();
  const entity = await fetchWikidataEntityForSpeakerDates(id);
  const claims = entity?.claims;
  if (!claims || !wikidataEntityIsHuman(claims)) return '';
  if (options.requireNameMatch !== false && !speakerNameMatchesWikidataEntity(authorName, entity)) {
    console.warn(`⚠️ Wikidata ${id} label/alias did not confidently match "${authorName}"`);
    return '';
  }
  const birthY = yearFromWikidataClaim(claims.P569);
  const deathY = yearFromWikidataClaim(claims.P570);
  const span = formatLifeSpanYears(birthY, deathY);
  if (span) {
    const source = options.source ? ` via ${options.source}` : '';
    console.log(`ℹ️ speaker_dates from Wikidata ${id}${source} for "${authorName}": ${span}`);
  }
  return span;
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
  let searchJson;
  try {
    const res = await fetch(`https://www.wikidata.org/w/api.php?${searchParams}`, {
      headers: { 'User-Agent': WIKIPEDIA_USER_AGENT }
    });
    if (!res.ok) return '';
    searchJson = await res.json();
  } catch (e) {
    console.warn(`⚠️ Wikidata search failed for "${q}":`, e.message);
    return '';
  }
  const hits = searchJson?.search || [];
  for (const h of hits) {
    const id = h?.id;
    if (!id || !/^Q\d+$/.test(id)) continue;
    const span = await fetchWikidataSpeakerDatesById(id, q, { source: 'search' });
    if (span) return span;
  }
  console.warn(`⚠️ No confident Wikidata speaker_dates match for "${q}"`);
  return '';
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse upload.wikimedia.org paths under /wikipedia/commons/ (direct or /thumb/). */
function parseCommonsUploadPath(pathname) {
  const parts = String(pathname || '')
    .split('/')
    .filter(Boolean);
  const commonsIdx = parts.indexOf('commons');
  if (commonsIdx < 0) return null;
  if (parts[commonsIdx + 1] === 'thumb') {
    const hash1 = parts[commonsIdx + 2];
    const hash2 = parts[commonsIdx + 3];
    const fileName = parts[commonsIdx + 4];
    if (!hash1 || !hash2 || !fileName) return null;
    return { hash1, hash2, fileName };
  }
  const hash1 = parts[commonsIdx + 1];
  const hash2 = parts[commonsIdx + 2];
  const fileName = parts[commonsIdx + 3];
  if (!hash1 || !hash2 || !fileName) return null;
  return { hash1, hash2, fileName };
}

function encodeCommonsPathSegment(segment) {
  return encodeURIComponent(String(segment || ''));
}

/** Last path segment for a Commons thumb URL at a given width. */
function commonsThumbFileSegment(fileName, widthPx) {
  const name = String(fileName || '');
  if (!name) return '';
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const keepRaster = ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif';
  if (keepRaster) return `${widthPx}px-${name}`;
  return `${widthPx}px-${name}.png`;
}

/**
 * Turn a full-size Commons upload URL into an embed-friendly thumb (e.g. 500px wide).
 * Non-Commons URLs are returned unchanged.
 */
function commonsUploadUrlToThumbnail(imageUrl, widthPx = 500) {
  const raw = String(imageUrl || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (!/wikimedia\.org$/i.test(u.hostname) && !/wikipedia\.org$/i.test(u.hostname)) return raw;
    const parsed = parseCommonsUploadPath(u.pathname);
    if (!parsed) return raw;
    const { hash1, hash2, fileName } = parsed;
    const decodedName = decodeURIComponent(fileName);
    const thumbLast = commonsThumbFileSegment(decodedName, widthPx);
    if (!thumbLast) return raw;
    u.pathname = `/wikipedia/commons/thumb/${hash1}/${hash2}/${fileName}/${encodeCommonsPathSegment(thumbLast)}`;
    return u.toString();
  } catch (_) {
    return raw;
  }
}

function extractCommonsFileTitle(imageUrl) {
  if (!imageUrl) return '';
  try {
    const u = new URL(imageUrl);
    if (!/wikimedia\.org$/i.test(u.hostname) && !/wikipedia\.org$/i.test(u.hostname)) return '';
    // Examples:
    //   /wikipedia/commons/thumb/5/5e/Maya_Angelou.jpg/440px-Maya_Angelou.jpg
    //   /wikipedia/commons/5/5e/Maya_Angelou.jpg
    const parts = u.pathname.split('/').filter(Boolean);
    const thumbIdx = parts.indexOf('thumb');
    let fileName;
    if (thumbIdx >= 0) {
      fileName = parts[thumbIdx + 3];
    } else {
      fileName = parts[parts.length - 1];
    }
    return fileName ? decodeURIComponent(fileName) : '';
  } catch (_) {
    return '';
  }
}

async function fetchCommonsImageAttribution(imageUrl) {
  const fileTitle = extractCommonsFileTitle(imageUrl);
  if (!fileTitle) return '';
  const params = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'extmetadata',
    titles: `File:${fileTitle}`,
    format: 'json',
    origin: '*'
  });
  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': WIKIPEDIA_USER_AGENT } });
  if (!res.ok) return '';
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const first = Object.values(pages)[0];
  const meta = first?.imageinfo?.[0]?.extmetadata || {};
  const artist = stripHtml(meta?.Artist?.value || '');
  if (artist) return artist;
  return '';
}

async function fetchWikipediaSpeakerInfo(authorName) {
  const name = String(authorName || '').trim();
  if (!name) return null;

  let summary = null;
  try {
    const title = encodeURIComponent(name.replace(/\s+/g, '_'));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, {
      headers: { 'User-Agent': WIKIPEDIA_USER_AGENT, Accept: 'application/json' },
      redirect: 'follow'
    });
    if (res.ok) {
      summary = await res.json();
    } else {
      console.warn(`⚠️ Wikipedia summary HTTP ${res.status} for "${name}"`);
    }
  } catch (e) {
    console.warn(`⚠️ Wikipedia summary fetch failed for "${name}":`, e.message);
  }

  let imageUrl = '';
  let extract = '';
  let desc = '';
  let isDisambiguation = false;
  let wikidataEntityId = '';

  if (summary) {
    if (summary.type === 'disambiguation') {
      isDisambiguation = true;
      console.warn(`⚠️ Wikipedia disambiguation for "${name}" — trying Wikidata for speaker_dates`);
    } else {
      const wikiImage =
        summary?.thumbnail?.source || summary?.originalimage?.source || '';
      imageUrl = commonsUploadUrlToThumbnail(wikiImage, 500) || wikiImage;
      extract = String(summary?.extract || '');
      desc = String(summary?.description || '').trim();
      wikidataEntityId = String(summary?.wikibase_item || '').trim();
    }
  }

  let dates = '';
  if (!isDisambiguation && wikidataEntityId) {
    dates = (await fetchWikidataSpeakerDatesById(wikidataEntityId, name, { source: 'Wikipedia summary' })) || '';
  }

  if (!dates) {
    dates = (await fetchWikidataSpeakerDates(name)) || '';
  }

  if (!dates && !isDisambiguation && (extract || desc)) {
    dates = parseSpeakerDatesFromExtract(desc ? `${desc} ${extract}` : extract) || '';
    if (dates) {
      console.warn(`⚠️ speaker_dates for "${name}" came from Wikipedia prose fallback: ${dates}`);
    } else {
      const preview = String(desc ? `${desc} ${extract}` : extract)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);
      console.warn(
        `⚠️ No speaker_dates from Wikipedia extract for "${name}". Preview: ${preview || '(empty)'}`
      );
    }
  }

  let attribution = '';
  if (imageUrl) {
    try {
      attribution = await fetchCommonsImageAttribution(imageUrl);
    } catch (e) {
      console.warn(`⚠️ Commons attribution fetch failed for "${name}":`, e.message);
    }
  }

  if (!imageUrl && !dates) return null;
  return {
    speaker_image_url: imageUrl || '',
    speaker_dates: dates || '',
    image_attribution: attribution || ''
  };
}

/** HEAD-check a candidate image URL actually resolves to a live image — guards against a hallucinated or dead link. */
async function verifyImageUrlIsLive(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!res.ok) return false;
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    return contentType.startsWith('image/');
  } catch (_) {
    return false;
  }
}

/**
 * SEAMSIDE guests are working artists without a Wikipedia page, so fetchWikipediaSpeakerInfo comes up
 * empty for them. This asks Claude to find the artist's own site (web_search) and confirm a real headshot
 * photo on it (web_fetch reads the actual page), then verifies the URL resolves to a live image before trusting it.
 */
async function fetchSeamsideArtistHeadshotViaWebSearch(authorName) {
  const name = String(authorName || '').trim();
  if (!name) return null;
  const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return null;
  const model = String(process.env.ANTHROPIC_PREFILL_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim();
  const prompt = [
    `The artist "${name}" was a guest on SEAMSIDE, a podcast about textile and fiber artists.`,
    'Find their personal website or artist portfolio site (you are not given the URL), then find a headshot or portrait photo of them — a photo of their face, not their artwork — on it.',
    'Use web_search to locate their site, then web_fetch to confirm the direct image file URL on the actual page. Do not guess a URL you have not fetched.',
    'Return ONLY this JSON, nothing else: {"image_url": "<direct url ending in an image file extension, or empty string if none found with real confidence>", "source_page": "<page you found it on, or empty string>"}'
  ].join('\n');
  let text;
  try {
    text = await postSubmittedQuotePrefillToClaude({
      apiKey,
      model,
      prompt,
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5 }
      ]
    });
  } catch (e) {
    console.warn(`⚠️ SEAMSIDE headshot search failed for "${name}":`, e.message);
    return null;
  }
  const parsed = extractPrefillJsonFromText(text);
  const imageUrl = pickPrefillStringLoose(parsed, 'image_url', 'imageUrl');
  const sourcePage = pickPrefillStringLoose(parsed, 'source_page', 'sourcePage');
  if (!imageUrl || !/^https:\/\//i.test(imageUrl)) return null;
  const isLive = await verifyImageUrlIsLive(imageUrl);
  if (!isLive) {
    console.warn(`⚠️ SEAMSIDE headshot candidate for "${name}" failed live-image check: ${imageUrl}`);
    return null;
  }
  let attributionHost = '';
  try {
    attributionHost = new URL(sourcePage || imageUrl).hostname.replace(/^www\./, '');
  } catch (_) {
    attributionHost = '';
  }
  console.log(`ℹ️ SEAMSIDE headshot found for "${name}" via ${attributionHost || 'artist site'}: ${imageUrl}`);
  return {
    speaker_image_url: imageUrl,
    image_attribution: attributionHost ? `Photo via ${attributionHost}` : 'Photo via artist website'
  };
}

/**
 * Deep link to a single Firestore document in the Firebase console (quotes collection by default).
 * Used in Notion prefill notes when an existing portrait/cutout is reused so editors can open the source row.
 */
function buildFirestoreConsoleUrlForQuoteDoc(docId) {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  if (!projectId || !docId) return '';
  const coll = String(process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes').trim() || 'quotes';
  const relPath = `/${coll}/${docId}`;
  const enc = encodeURIComponent(relPath).replace(/%/g, '~');
  return `https://console.firebase.google.com/project/${projectId}/firestore/databases/-default-/data/${enc}`;
}

/**
 * When pre-filling a new Notion quote, look for another Firestore quote by the same author that already
 * has a speaker portrait or transparent cutout. If found, we do not need a fresh Wikimedia URL — reuse
 * the stored URLs and point editors at the prior doc in the console.
 * @param {*} dbConn Firestore instance
 * @param {string[]} authorCandidates e.g. [Claude-canonical author, name typed on submission]
 * @param {string} excludeDocId Firestore doc id for the new quote (Notion page id)
 * @returns {Promise<null | { sourceDocId: string, speakerCutoutUrl: string, speakerImageUrl: string, imageAttribution: string }>}
 */
async function findExistingSpeakerAssetReuseForPrefill(dbConn, authorCandidates, excludeDocId) {
  if (!dbConn || !excludeDocId) return null;
  const names = [...new Set(authorCandidates.map((n) => String(n || '').trim()).filter(Boolean))];
  if (!names.length) return null;
  const collection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const ref = dbConn.collection(collection);
  const matches = [];
  for (const author of names) {
    const snap = await ref.where('author', '==', author).limit(40).get();
    snap.forEach((docSnap) => {
      if (docSnap.id === excludeDocId) return;
      const d = docSnap.data() || {};
      const cutout = String(d.speakerCutoutUrl ?? d.speaker_cutout_url ?? '').trim();
      const portrait = String(d.speakerImageUrl ?? d.speaker_image_url ?? '').trim();
      if (!cutout && !portrait) return;
      matches.push({
        sourceDocId: docSnap.id,
        speakerCutoutUrl: cutout,
        speakerImageUrl: portrait,
        imageAttribution: String(d.imageAttribution ?? d.image_attribution ?? '').trim()
      });
    });
  }
  if (!matches.length) return null;
  const withCutout = matches.find((m) => m.speakerCutoutUrl);
  return withCutout || matches[0];
}

function truncateForNotionRichText(value, maxLen = 1900) {
  const s = String(value || '').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

// --- Notion patch + Firestore mirror ----------------------------------------

function buildPrefillNotionProperties(schema, ai, wiki, speakerReuse) {
  const properties = {};
  const set = (baseName, value, ...aliases) => {
    if (!value) return;
    const propName = findNotionPropName(schema, baseName, ...aliases);
    if (!propName) {
      console.warn(`⚠️ Prefill: no Notion column matched [${[baseName, ...aliases].join(', ')}] — value not written`);
      return;
    }
    const payload = notionTextPropertyValue(schema[propName], value);
    if (!payload) {
      // The column exists but its type (e.g. Date, Formula, Rollup) can't accept
      // the plain-text payload. Make this loud so it doesn't silently swallow data.
      console.warn(
        `⚠️ Prefill: Notion column "${propName}" has type "${schema[propName]?.type}" which doesn't accept the prefilled text. Change it to Text/Rich text to populate "${baseName}".`
      );
      return;
    }
    properties[propName] = payload;
  };

  if (ai?.author) set('author', ai.author);
  if (ai?.community_prompt) set('community_prompt', ai.community_prompt, 'community_prompt ', 'communityPrompt', 'Community prompt');
  {
    const smallActText = String(ai?.small_act || '').trim();
    if (smallActText) set('small_act', smallActText);
  }
  if (ai?.blessing) set('blessing', ai.blessing, 'Daily blessing', 'daily_blessing');
  if (ai?.notification_text) set('notification_text', ai.notification_text, 'notificationText');
  if (ai?.ig_caption) set('ig_caption', ai.ig_caption, 'igCaption', 'IG Caption');
  if (ai?.what_if) set('what_if', ai.what_if, 'whatIf', 'What if');
  if (ai?.watch_for) set('watch_for', ai.watch_for, 'watchFor', 'Watch for');
  if (ai?.speaker_guide_line) set('speaker_guide_line', ai.speaker_guide_line, 'speakerGuideLine', 'Guide line');
  if (ai?.keyword) set('keyword', ai.keyword, 'Keyword');
  if (ai?.speaker_keywords) {
    set('speaker_keywords', ai.speaker_keywords, 'speaker_keyword', 'speakerKeywords', 'Speaker keywords', 'Speaker keyword');
  }
  if (ai?.art_recs) set('art_recs', ai.art_recs, 'artRecs', 'Art recs', 'explore');
  if (ai?.good_day) set('good_day', ai.good_day, 'goodDay', 'Good day', 'Good Day');
  if (ai?.rough_day) set('rough_day', ai.rough_day, 'roughDay', 'Rough day', 'Rough Day');
  if (ai?.prompt_theme) set('prompt_theme', ai.prompt_theme, 'promptTheme', 'Prompt theme', 'Prompt Theme');
  if (ai?.mood) set('mood', ai.mood, 'Mood');

  // Speaker portrait: Notion "Speaker image URL" must stay a single HTTPS URL so sync → Firestore keeps working.
  // When we already have a cutout (or portrait) on another quote for this author, reuse that URL — no new Wikimedia link needed.
  const reusePortraitUrl =
    speakerReuse && (speakerReuse.speakerCutoutUrl || speakerReuse.speakerImageUrl)
      ? String(speakerReuse.speakerCutoutUrl || speakerReuse.speakerImageUrl).trim()
      : '';
  const wikiPortraitUrl = String(wiki?.speaker_image_url || '').trim();
  const speakerImageUrlForNotion = reusePortraitUrl || wikiPortraitUrl || 'needs manual lookup';
  set('speaker_image_url', speakerImageUrlForNotion, 'speakerImageUrl', 'Speaker image URL', 'image_url');

  const attrFromReuse = speakerReuse?.imageAttribution ? String(speakerReuse.imageAttribution).trim() : '';
  const attrFromWiki = String(wiki?.image_attribution || '').trim();
  set(
    'image_attribution',
    attrFromReuse || attrFromWiki || 'unavailable',
    'imageAttribution',
    'Image attribution',
    'image_credit'
  );
  if (wiki?.speaker_dates) {
    set('speaker_dates', wiki.speaker_dates, 'speakerDates', 'Speaker dates');
  }

  if (speakerReuse?.sourceDocId) {
    const consoleUrl = buildFirestoreConsoleUrlForQuoteDoc(speakerReuse.sourceDocId);
    const reuseNotes = truncateForNotionRichText(
      [
        'Existing speaker cutout/portrait already on file for this author — you do not need a new Wikimedia or portrait URL.',
        consoleUrl ? `Open the prior Firestore quote (copy speakerCutoutUrl / speakerImageUrl if you edit manually): ${consoleUrl}` : '',
        reusePortraitUrl ? `Reused image URL (also written on Speaker image URL): ${reusePortraitUrl}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    );
    set(
      'speaker_image_notes',
      reuseNotes,
      'Speaker image notes',
      'speaker_image_note',
      'image_notes',
      'prefill_notes',
      'Prefill notes',
      'internal_notes',
      'Internal notes'
    );
  }

  return properties;
}

function buildPrefillFirestorePayload(ai, wiki, speakerReuse, { prefillSource = 'scheduled-prefill', updatedAt = null } = {}) {
  const payload = {};
  if (ai?.author) {
    payload.author = ai.author;
  }
  if (ai?.community_prompt) {
    payload.community_prompt = ai.community_prompt;
  }
  {
    const smallActText = String(ai?.small_act || '').trim();
    if (smallActText) {
      payload.small_act = smallActText;
    }
  }
  if (ai?.blessing) {
    payload.blessing = ai.blessing;
  }
  if (ai?.notification_text) {
    payload.notificationText = ai.notification_text;
    payload.notification_text = ai.notification_text;
  }
  if (ai?.ig_caption) {
    payload.ig_caption = ai.ig_caption;
  }
  if (ai?.what_if) {
    payload.what_if = ai.what_if;
  }
  if (ai?.watch_for) {
    payload.watch_for = ai.watch_for;
  }
  if (ai?.speaker_guide_line) {
    payload.speaker_guide_line = ai.speaker_guide_line;
  }
  if (ai?.keyword) {
    payload.keyword = ai.keyword;
    payload.keywordSnapshot = ai.keyword;
  }
  if (ai?.speaker_keywords) {
    payload.speaker_keywords = ai.speaker_keywords;
    payload.speakerKeywords = ai.speaker_keywords;
  }
  if (ai?.art_recs) {
    payload.art_recs = ai.art_recs;
  }
  if (ai?.good_day) {
    payload.good_day = ai.good_day;
  }
  if (ai?.rough_day) {
    payload.rough_day = ai.rough_day;
  }
  if (ai?.prompt_theme) {
    payload.prompt_theme = ai.prompt_theme;
  }
  if (ai?.mood) {
    payload.mood = ai.mood;
  }
  const hasCreative = SCHEDULED_CREATIVE_FIELDS.some((field) => String(ai?.[field] || '').trim());
  if (hasCreative) {
    payload.creativePrefillVersion = PREFILL_CREATIVE_PROMPT_VERSION;
    payload.creativePrefillUpdatedAt = new Date().toISOString();
    payload.creativePrefillModel = String(ai?._model || '').trim();
    payload.creativePrefillSource = prefillSource;
  }
  const reuseCutout = speakerReuse?.speakerCutoutUrl ? String(speakerReuse.speakerCutoutUrl).trim() : '';
  const reusePortrait = speakerReuse?.speakerImageUrl ? String(speakerReuse.speakerImageUrl).trim() : '';
  const wikiPortrait = wiki?.speaker_image_url ? String(wiki.speaker_image_url).trim() : '';
  const portraitForRow = reusePortrait || wikiPortrait || reuseCutout || 'needs manual lookup';
  payload.speaker_image_url = portraitForRow;
  if (reuseCutout) {
    payload.speaker_cutout_url = reuseCutout;
  }
  const attrReuse = speakerReuse?.imageAttribution ? String(speakerReuse.imageAttribution).trim() : '';
  const attrWiki = wiki?.image_attribution ? String(wiki.image_attribution).trim() : '';
  payload.image_attribution = attrReuse || attrWiki || 'unavailable';
  if (wiki?.speaker_dates) {
    payload.speaker_dates = wiki.speaker_dates;
  }
  if (updatedAt) payload.updatedAt = updatedAt;
  return payload;
}


async function runScheduledCreativePrefill({
  quoteText,
  authorName,
  catalogData,
  sourceId,
  schema,
  db,
  notionPage = null,
  fieldsToGenerate = null,
  promptThemeOptions = [],
  moodOptions = []
}) {
  const isSeamside = isSeamsideSubmission(catalogData);
  const chosen = fieldsToGenerate
    ? { fields: fieldsToGenerate, reason: 'forced' }
    : chooseScheduledFieldsToPatch(catalogData, { moodOptions });
  const preserveFromNotion = notionPage ? buildPreserveFromNotionMap(notionPage, catalogData) : {};
  const preserveFieldNames = Object.keys(preserveFromNotion);
  const requestedFields = (chosen.fields || []).filter((field) => !preserveFromNotion[field]);
  const needsWikiPortrait = !readCatalogField(catalogData, 'speaker_image_url');
  const needsSpeakerDates = !readCatalogField(catalogData, 'speaker_dates');
  const needsImageAttribution = !readCatalogField(catalogData, 'image_attribution');

  let ai = null;
  if (requestedFields.length) {
    ai = await generateSubmittedQuotePrefillFields({
      quoteText,
      authorName,
      promptThemeOptions,
      moodOptions,
      isSeamside
    });
    ai.prompt_theme = resolvePromptThemeOptions(promptThemeOptions, ai.prompt_theme);
    ai.mood = resolveMoodOption(moodOptions, ai.mood);
  }

  const resolvedAuthor = String(ai?.author || authorName || '').trim();
  let wiki = null;
  let speakerReuse = null;
  if (needsWikiPortrait || needsSpeakerDates || needsImageAttribution || requestedFields.length) {
    try {
      wiki = await fetchWikipediaSpeakerInfo(resolvedAuthor);
    } catch (e) {
      console.warn(`[scheduled-prefill] Wikipedia lookup failed for "${resolvedAuthor}": ${e.message}`);
    }
    if (db && sourceId) {
      try {
        speakerReuse = await findExistingSpeakerAssetReuseForPrefill(db, [resolvedAuthor, authorName], sourceId);
      } catch (e) {
        console.warn(`[scheduled-prefill] speaker reuse lookup failed for "${resolvedAuthor}": ${e.message}`);
      }
    }
    const hasExistingPortrait = !!(wiki?.speaker_image_url || speakerReuse?.speakerImageUrl || speakerReuse?.speakerCutoutUrl);
    if (isSeamside && !hasExistingPortrait) {
      try {
        const headshot = await fetchSeamsideArtistHeadshotViaWebSearch(resolvedAuthor);
        if (headshot?.speaker_image_url) wiki = { ...(wiki || {}), ...headshot };
      } catch (e) {
        console.warn(`[scheduled-prefill] SEAMSIDE headshot search failed for "${resolvedAuthor}": ${e.message}`);
      }
    }
  }

  const aiForWrite = {};
  if (ai) {
    for (const field of requestedFields) {
      const value = String(ai[field] || '').trim();
      if (value) aiForWrite[field] = value;
    }
    if (requestedFields.length && requestedFields.every((field) => aiForWrite[field])) {
      aiForWrite._model = ai._model;
    }
  }

  const catalogWrite = buildPrefillFirestorePayload(
    Object.keys(aiForWrite).length ? aiForWrite : null,
    wiki,
    speakerReuse,
    { prefillSource: 'scheduled-prefill' }
  );
  for (const [field, value] of Object.entries(preserveFromNotion)) {
    catalogWrite[field] = value;
    if (field === 'community_prompt') catalogWrite.communityPrompt = value;
  }

  const catalogMirror = buildCatalogMirrorPatch(catalogData);
  const mergedPatch = { ...catalogMirror, ...catalogWrite };

  const aiForNotion = { ...aiForWrite };
  delete aiForNotion._model;
  const notionProperties = schema
    ? buildPrefillNotionProperties(schema, aiForNotion, wiki, speakerReuse)
    : {};
  for (const field of preserveFieldNames) {
    for (const [propName] of Object.entries(notionProperties)) {
      const aliases = FIELD_ALIASES[field] || [field];
      if (aliases.some((alias) => normKey(alias) === normKey(propName))) delete notionProperties[propName];
    }
  }

  return {
    reason: chosen.reason,
    requestedFields,
    preserveFieldNames,
    catalogWrite,
    mergedPatch,
    assignmentPatch: buildAssignmentPatch(mergedPatch),
    notionProperties,
    ai,
    wiki,
    speakerReuse
  };
}

module.exports = {
  SCHEDULED_CREATIVE_FIELDS,
  PREFILL_CREATIVE_PROMPT_VERSION,
  QUOTE_MOOD_OPTIONS,
  FIELD_ALIASES,
  ASSIGNMENT_SNAPSHOT_FIELDS,
  findNotionPropName,
  notionTextPropertyValue,
  notionSchemaOptionNames,
  readCatalogField,
  chooseScheduledFieldsToPatch,
  generateSubmittedQuotePrefillFields,
  fetchWikipediaSpeakerInfo,
  buildPrefillNotionProperties,
  buildPrefillFirestorePayload,
  buildPreserveFromNotionMap,
  buildCatalogMirrorPatch,
  buildAssignmentPatch,
  readNotionFieldFromPageProperties,
  notionPropToPlain,
  runScheduledCreativePrefill,
  isSeamsideSubmission
};
