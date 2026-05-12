#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config();
} catch (_) {
  // dotenv is optional in CI where env vars come from GitHub secrets.
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

const NOTION_API_VERSION = '2022-06-28';

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return String(value).trim();
}

function getTitle(prop) {
  if (!prop) return '';
  if (Array.isArray(prop.title)) {
    return prop.title.map(plainFromRichTextSegment).join('').trim();
  }
  return '';
}

function getRichText(prop) {
  if (!prop) return '';
  if (Array.isArray(prop.rich_text)) {
    return prop.rich_text.map(plainFromRichTextSegment).join('').trim();
  }
  return '';
}

function getCheckbox(prop, fallback = false) {
  if (!prop || typeof prop.checkbox !== 'boolean') return fallback;
  return prop.checkbox;
}

function parseBooleanString(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', '1', 'on'].includes(normalized)) return true;
  if (['false', 'no', '0', 'off'].includes(normalized)) return false;
  return fallback;
}

function getNumber(prop, fallback = 0) {
  if (!prop || typeof prop.number !== 'number') return fallback;
  return prop.number;
}

function getDateStart(prop) {
  return prop?.date?.start ? String(prop.date.start).trim() : '';
}

function getSelect(prop) {
  return prop?.select?.name || '';
}

function getBoolean(prop, fallback = false) {
  if (!prop) return fallback;
  if (typeof prop.checkbox === 'boolean') return prop.checkbox;
  if (prop.select?.name) return parseBooleanString(prop.select.name, fallback);
  const rt = getRichText(prop);
  if (rt) return parseBooleanString(rt, fallback);
  const tt = getTitle(prop);
  if (tt) return parseBooleanString(tt, fallback);
  return fallback;
}

/** Compare Notion property names ignoring case, spaces, underscores (e.g. what_if ↔ "What if"). */
function normPropKey(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s_-]/g, '');
}

/** Plain text from one rich_text / title segment (Notion usually sets plain_text; fall back to text.content). */
function plainFromRichTextSegment(x) {
  if (!x || typeof x !== 'object') return '';
  const pt = x.plain_text;
  if (typeof pt === 'string' && pt) return pt;
  if (x.type === 'text' && x.text && typeof x.text.content === 'string') return x.text.content;
  if (x.type === 'mention' && typeof x.plain_text === 'string') return x.plain_text;
  if (x.type === 'equation' && x.equation && typeof x.equation.expression === 'string') {
    return x.equation.expression;
  }
  return '';
}

function findPropByBaseName(props, base) {
  const target = normPropKey(base);
  if (!props || !target) return null;
  for (const key of Object.keys(props)) {
    if (normPropKey(key) === target) return props[key];
  }
  return null;
}

function textFromNotionProp(prop) {
  if (!prop) return '';
  const fromRich = getRichText(prop) || getTitle(prop);
  if (fromRich) return fromRich.trim();
  if (prop.type === 'formula' && prop.formula) {
    if (prop.formula.type === 'string') return String(prop.formula.string || '').trim();
    if (prop.formula.type === 'number' && typeof prop.formula.number === 'number') {
      return String(prop.formula.number);
    }
    if (prop.formula.type === 'boolean') return prop.formula.boolean ? 'true' : '';
    if (prop.formula.type === 'date' && prop.formula.date?.start) {
      return String(prop.formula.date.start).trim();
    }
  }
  if (prop.type === 'url' && prop.url) return String(prop.url).trim();
  if (prop.type === 'number' && typeof prop.number === 'number') return String(prop.number);
  if (prop.type === 'select' && prop.select?.name) return String(prop.select.name).trim();
  if (prop.type === 'status' && prop.status?.name) return String(prop.status.name).trim();
  if (prop.type === 'multi_select' && Array.isArray(prop.multi_select)) {
    return prop.multi_select
      .map((s) => (s && s.name ? String(s.name).trim() : ''))
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

/** Rich text / title / formula / rollup — anything that can surface readable text. */
function textFromAnyNotionProp(prop) {
  if (!prop) return '';
  const direct = getRichText(prop) || getTitle(prop);
  if (direct) return direct.trim();
  const fromTp = textFromNotionProp(prop);
  if (fromTp) return fromTp;
  if (prop.type === 'rollup' && prop.rollup) {
    const r = prop.rollup;
    if (r.type === 'array' && Array.isArray(r.array)) {
      const parts = r.array
        .map((item) => textFromAnyNotionProp(item) || textFromNotionProp(item))
        .filter(Boolean);
      return parts.join(' ').trim();
    }
    if (r.type === 'number' && typeof r.number === 'number') return String(r.number);
    if (r.type === 'date' && r.date?.start) return String(r.date.start).trim();
  }
  return '';
}

function plainValueFromNotionProp(prop) {
  if (!prop || typeof prop !== 'object') return null;
  const text = textFromAnyNotionProp(prop);
  if (text) return text;
  switch (prop.type) {
    case 'checkbox':
      return !!prop.checkbox;
    case 'date':
      return prop.date ? { start: prop.date.start || null, end: prop.date.end || null } : null;
    case 'email':
      return prop.email || '';
    case 'files':
      return Array.isArray(prop.files)
        ? prop.files.map((f) => ({
            name: f.name || '',
            url: f.file?.url || f.external?.url || ''
          }))
        : [];
    case 'multi_select':
      return Array.isArray(prop.multi_select) ? prop.multi_select.map((s) => s.name).filter(Boolean) : [];
    case 'number':
      return typeof prop.number === 'number' ? prop.number : null;
    case 'people':
      return Array.isArray(prop.people)
        ? prop.people.map((p) => ({ id: p.id || '', name: p.name || '' }))
        : [];
    case 'phone_number':
      return prop.phone_number || '';
    case 'relation':
      return Array.isArray(prop.relation) ? prop.relation.map((r) => r.id).filter(Boolean) : [];
    case 'select':
      return prop.select?.name || '';
    case 'status':
      return prop.status?.name || '';
    case 'unique_id':
      return prop.unique_id
        ? `${prop.unique_id.prefix || ''}${prop.unique_id.number ?? ''}`.trim()
        : '';
    case 'url':
      return prop.url || '';
    default:
      return null;
  }
}

function notionPropertiesSnapshot(props) {
  const out = {};
  for (const [name, prop] of Object.entries(props || {})) {
    out[name] = {
      type: prop?.type || 'unknown',
      value: plainValueFromNotionProp(prop)
    };
  }
  return out;
}

/** Notion columns named "Daily Blessing", rollups, etc. normalize to *blessing*. */
function findBlessingFromProps(props) {
  if (!props) return '';
  const directKeys = [
    'blessing',
    'Blessing',
    'BLESSING',
    'Daily Blessing',
    'Daily blessing',
    'daily_blessing',
    'DailyBlessing'
  ];
  for (const k of directKeys) {
    if (props[k]) {
      const t = textFromAnyNotionProp(props[k]);
      if (t) return t;
    }
  }
  const exact = findPropByBaseName(props, 'blessing');
  if (exact) {
    const t = textFromAnyNotionProp(exact);
    if (t) return t;
  }
  for (const key of Object.keys(props)) {
    if (!normPropKey(key).includes('blessing')) continue;
    const t = textFromAnyNotionProp(props[key]);
    if (t) return t;
  }
  return '';
}

/** Resolve text from known keys first, then any Notion column whose normalized name matches `base`. */
function getMappedText(props, base, ...directKeys) {
  // Prefer exact `props[base]` when present (ODQ uses snake_case names that match `base`).
  if (props && base) {
    const tBase = textFromAnyNotionProp(props[base]);
    if (tBase) return String(tBase).trim();
  }
  for (const k of directKeys) {
    const t = textFromAnyNotionProp(props[k]);
    if (t) return t.trim();
  }
  const target = normPropKey(base);
  if (!props || !target) return '';
  const matchingKeys = Object.keys(props).filter((k) => normPropKey(k) === target);
  if (!matchingKeys.length) return '';
  // Notion allows multiple columns whose names normalize the same (e.g. "Community Prompt"
  // formula + "community_prompt" rich text). Prefer non-empty text; then stable tie-breakers.
  function rankKey(k) {
    let r = 0;
    if (k === base) r += 8;
    if (directKeys.includes(k)) r += 4;
    if (String(k).includes('_')) r += 2;
    return r;
  }
  matchingKeys.sort((a, b) => rankKey(b) - rankKey(a) || String(a).localeCompare(String(b)));
  for (const key of matchingKeys) {
    const t = textFromAnyNotionProp(props[key]);
    if (t) return String(t).trim();
  }
  return '';
}

/**
 * Community prompt column names vary; after strict getMappedText, try any property whose
 * normalized name contains both "community" and "prompt" (e.g. "Community reflection prompt").
 */
function getCommunityPromptFromProps(props, pageIdForLog) {
  // ODQ uses `community_prompt`; Title Case / camelCase kept for other DB shapes.
  const primary = getMappedText(
    props,
    'community_prompt',
    'communityPrompt',
    'Community prompt',
    'Community Prompt',
    'Community question',
    'community_question'
  );
  if (primary) return primary;
  if (!props) return '';
  const loose = Object.keys(props).filter((k) => {
    const n = normPropKey(k);
    return n.includes('community') && n.includes('prompt');
  });
  function rankLoose(k) {
    const n = normPropKey(k);
    let r = 0;
    if (n === 'communityprompt') r += 100;
    if (/^community.*prompt$/.test(n)) r += 50;
    r -= Math.min(n.length, 200) / 200;
    return r;
  }
  loose.sort((a, b) => rankLoose(b) - rankLoose(a) || String(a).localeCompare(String(b)));
  for (const key of loose) {
    const t = textFromAnyNotionProp(props[key]);
    if (t) return String(t).trim();
  }
  if (process.env.NOTION_SYNC_DEBUG) {
    const lines = Object.keys(props)
      .filter((k) => {
        const n = normPropKey(k);
        return n.includes('community') || n.includes('prompt');
      })
      .map(
        (k) =>
          `  ${k} (${props[k]?.type}): ${JSON.stringify(String(textFromAnyNotionProp(props[k]) || '').slice(0, 80))}`
      );
    if (lines.length) {
      console.warn(
        `[sync][NOTION_SYNC_DEBUG] empty communityPrompt page=${pageIdForLog || '(unknown)'}; candidate props:`
      );
      lines.forEach((line) => console.warn(line));
    }
  }
  return '';
}

function urlFromNotionProp(prop) {
  if (!prop) return '';
  if (prop.type === 'url' && prop.url) return String(prop.url).trim();
  if (prop.type === 'files' && Array.isArray(prop.files)) {
    const first = prop.files.find((file) => file?.external?.url || file?.file?.url);
    if (first) return String(first.external?.url || first.file?.url || '').trim();
  }
  return textFromAnyNotionProp(prop);
}

function getMappedUrl(props, base, ...directKeys) {
  if (props && base) {
    const uBase = urlFromNotionProp(props[base]);
    if (uBase) return uBase.trim();
  }
  for (const k of directKeys) {
    const u = urlFromNotionProp(props[k]);
    if (u) return u.trim();
  }
  return urlFromNotionProp(findPropByBaseName(props, base));
}

function getTitleTextFromAnyTitleProp(props) {
  if (!props) return '';
  for (const [, prop] of Object.entries(props)) {
    if (prop && prop.type === 'title') {
      const t = getTitle(prop);
      if (t) return t;
    }
  }
  return '';
}

function parseNotionRow(page) {
  const props = page?.properties || {};
  // ODQ QUOTES DATABASE uses snake_case Text/URL names (Quote is Title). Try those exact keys
  // first, then legacy Title Case / aliases for older or forked DBs. First non-empty wins.
  const text =
    getMappedText(props, 'quote_text', 'Quote', 'Quote Text', 'Quote text', 'Name', 'quote', 'quote_text')
    || getTitleTextFromAnyTitleProp(props);
  const author = getMappedText(props, 'author', 'Author');
  const reflectionPrompt = getMappedText(
    props,
    'reflection_prompt',
    'Reflection prompt',
    'Reflection Prompt'
  );
  const artRecs = getMappedText(
    props,
    'art_recs',
    'Art recs',
    'Art Recs',
    'art recommendation',
    'Art recommendation',
    'explore',
    'Explore'
  );
  const communityPrompt = getCommunityPromptFromProps(props, page?.id);
  const whatIf = getMappedText(props, 'what_if', 'What if', 'What If');
  const igCaption = getMappedText(props, 'ig_caption', 'IG Caption', 'Ig Caption');
  const mood = getMappedText(props, 'mood', 'Mood');
  const fortune = getMappedText(props, 'fortune', 'Fortune');
  const blessing = findBlessingFromProps(props);
  const speakerImageUrl = getMappedUrl(
    props,
    'speaker_image_url',
    'speakerImageUrl',
    'Speaker image URL',
    'Speaker Image URL',
    'speaker_image',
    'Speaker image',
    'Speaker Image',
    'portrait_url',
    'Portrait URL',
    'portrait',
    'Portrait',
    'image_url',
    'Image URL',
    'image',
    'Image'
  );
  const speakerDates = getMappedText(
    props,
    'speaker_dates',
    'speakerDates',
    'Speaker dates',
    'Speaker Dates'
  );
  const speakerBorn = getMappedText(
    props,
    'speaker_born',
    'speakerBorn',
    'Speaker born',
    'Speaker Born',
    'born',
    'Born'
  );
  const speakerDied = getMappedText(
    props,
    'speaker_died',
    'speakerDied',
    'Speaker died',
    'Speaker Died',
    'died',
    'Died'
  );
  const speakerGuideLine = getMappedText(
    props,
    'speaker_guide_line',
    'speakerGuideLine',
    'Guide line',
    'Guide Line',
    'Why this guide',
    'Why good guide',
    'Why good for reflection',
    'why_good_guide',
    'why_good_for_reflection'
  );
  const imageAttribution = getMappedText(
    props,
    'image_attribution',
    'imageAttribution',
    'Image attribution',
    'Image Attribution',
    'image_credit',
    'Image credit',
    'Image Credit',
    'photo_credit',
    'Photo credit',
    'Photo Credit'
  );
  const submittedBy = getMappedText(
    props,
    'submitted_by',
    'submittedBy',
    'Submitted by',
    'Submitted By'
  );
  const notificationTitle =
    getRichText(props.notification_title) || getTitle(props.notification_title);
  const notificationText =
    getRichText(props.notification_text) || getTitle(props.notification_text);
  const theme = getSelect(props.theme) || getRichText(props.theme) || getTitle(props.theme);
  const sortOrder = getNumber(props.sort_order, 0);
  const dateScheduled = getDateStart(props.date_scheduled);
  const submittedAt = getDateStart(props.submitted_at);
  const submittedVia = getMappedText(
    props,
    'submitted_via',
    'submittedVia',
    'Submitted via',
    'Submitted Via'
  );
  const itemNo = typeof props.item_no?.number === 'number' ? props.item_no.number : null;
  const lastUsedDate = getDateStart(props.last_used_date);
  const reviewed = getCheckbox(props['reviewed?'] || props.reviewed || props.Reviewed, false);
  const sourceNotes = getSelect(props.source_notes) || getRichText(props.source_notes) || getTitle(props.source_notes);
  const status = getSelect(props.status) || getRichText(props.status) || getTitle(props.status);
  const timesUsed = typeof props.times_used?.number === 'number' ? props.times_used.number : null;
  const notionUniqueId = props.ID?.unique_id
    ? `${props.ID.unique_id.prefix || ''}${props.ID.unique_id.number ?? ''}`.trim()
    : '';
  const githubPullRequestIds = Array.isArray(props['GitHub Pull Requests']?.relation)
    ? props['GitHub Pull Requests'].relation.map((r) => r.id).filter(Boolean)
    : [];
  const approvedProp = props.approved || props.Approved || props.active || props.Active;
  const approved = getBoolean(approvedProp, true);
  const notificationEnabled = getBoolean(props.notification_enabled, true);
  // Page-level (not a property) — used by swap-mode scheduler to pick the
  // most-recently-edited approved quote for the next-day slot.
  const notionLastEditedTime = page?.last_edited_time ? String(page.last_edited_time).trim() : '';
  const notionCreatedTime = page?.created_time ? String(page.created_time).trim() : '';

  if (!text || !author) return null;

  return {
    id: page.id,
    data: {
      text,
      author,
      reflectionPrompt,
      artRecs,
      art_recs: artRecs,
      communityPrompt,
      community_prompt: communityPrompt,
      whatIf,
      what_if: whatIf,
      igCaption,
      ig_caption: igCaption,
      mood,
      fortune,
      blessing,
      speakerImageUrl,
      speaker_image_url: speakerImageUrl,
      speakerDates,
      speaker_dates: speakerDates,
      speakerBorn,
      speaker_born: speakerBorn,
      speakerDied,
      speaker_died: speakerDied,
      speakerGuideLine,
      speaker_guide_line: speakerGuideLine,
      imageAttribution,
      image_attribution: imageAttribution,
      submittedBy,
      submitted_by: submittedBy,
      notificationTitle,
      notificationText,
      notificationEnabled,
      approved,
      active: approved,
      sortOrder,
      dateScheduled,
      date_scheduled: dateScheduled,
      itemNo,
      item_no: itemNo,
      lastUsedDate,
      last_used_date: lastUsedDate,
      reviewed,
      reviewed_: reviewed,
      sourceNotes,
      source_notes: sourceNotes,
      status,
      submittedAt,
      submitted_at: submittedAt,
      submittedVia,
      submitted_via: submittedVia,
      timesUsed,
      times_used: timesUsed,
      notionUniqueId,
      githubPullRequestIds,
      theme,
      source: 'notion',
      sourceId: page.id,
      notionLastEditedTime,
      notionCreatedTime,
      notionProperties: notionPropertiesSnapshot(props),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  };
}

// Notion + Cloudflare occasionally return transient 5xx/429 — retry these
// before bailing on the whole sync.
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_NOTION_RETRIES = Number.isFinite(Number(process.env.NOTION_MAX_RETRIES))
  ? Math.max(0, Number(process.env.NOTION_MAX_RETRIES))
  : 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(60_000, retryAfter * 1000);
  }
  const base = Math.min(16_000, 500 * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

async function fetchNotionWithRetry(url, init, label) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_NOTION_RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      const status = res.status;
      const body = await res.text();
      if (TRANSIENT_HTTP_STATUSES.has(status) && attempt < MAX_NOTION_RETRIES) {
        const delay = backoffDelayMs(attempt, res.headers.get('retry-after'));
        console.warn(
          `[sync] ${label} got ${status}, retry ${attempt + 1}/${MAX_NOTION_RETRIES} in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }
      const err = new Error(`${label} failed (${status}): ${body}`);
      err.notionStatus = status;
      err.notionBody = body;
      throw err;
    } catch (e) {
      if (e && typeof e.notionStatus === 'number') throw e;
      if (attempt >= MAX_NOTION_RETRIES) throw e;
      lastErr = e;
      const delay = backoffDelayMs(attempt, null);
      console.warn(
        `[sync] ${label} network error: ${e?.message || e}; retry ${attempt + 1}/${MAX_NOTION_RETRIES} in ${delay}ms`
      );
      await sleep(delay);
    }
  }
  throw lastErr || new Error(`${label} failed after ${MAX_NOTION_RETRIES} retries`);
}

async function notionQuery(databaseId, notionToken, startCursor) {
  const body = {
    page_size: 100
  };
  if (startCursor) body.start_cursor = startCursor;

  const res = await fetchNotionWithRetry(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    },
    `Notion DB query ${databaseId}`
  );
  return res.json();
}

function initFirestore() {
  if (admin.apps.length) return admin.firestore();

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }

  return admin.firestore();
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const noDeleteOrphans = process.argv.includes('--no-delete-orphans');
  const notionToken = requireEnv('NOTION_TOKEN');
  const databaseId = requireEnv('NOTION_DATABASE_ID');
  const collectionName = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const db = initFirestore();

  /** Every page id returned by the database query (including rows skipped by parse). */
  const seenNotionIds = new Set();

  let cursor = null;
  let fetchedPages = 0;
  let writeCount = 0;
  let fortuneCount = 0;
  let skipCount = 0;
  let page = 0;

  do {
    page += 1;
    const payload = await notionQuery(databaseId, notionToken, cursor);
    const results = Array.isArray(payload.results) ? payload.results : [];
    fetchedPages += results.length;

    for (const row of results) {
      if (row && row.id) seenNotionIds.add(row.id);
      const parsed = parseNotionRow(row);
      if (!parsed) {
        skipCount += 1;
        continue;
      }
      if (String(parsed.data.fortune || '').trim()) {
        fortuneCount += 1;
      }
      if (!dryRun) {
        await db.collection(collectionName).doc(parsed.id).set(parsed.data, { merge: true });
      }
      writeCount += 1;
    }

    console.log(
      `[sync] page=${page} fetched=${results.length} totalFetched=${fetchedPages} writes=${writeCount} fortunes=${fortuneCount} skipped=${skipCount}`
    );

    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  let orphanDeleteCount = 0;
  if (!noDeleteOrphans) {
    const notionDocsSnap = await db.collection(collectionName).where('source', '==', 'notion').get();
    const orphanRefs = [];
    notionDocsSnap.forEach((docSnap) => {
      if (!seenNotionIds.has(docSnap.id)) orphanRefs.push(docSnap.ref);
    });

    if (orphanRefs.length) {
      if (dryRun) {
        orphanDeleteCount = orphanRefs.length;
        console.log(
          `[sync] dry-run: would delete ${orphanDeleteCount} Firestore quote(s) whose Notion page is no longer in the database`
        );
      } else {
        const chunkSize = 450;
        for (let i = 0; i < orphanRefs.length; i += chunkSize) {
          const batch = db.batch();
          for (const ref of orphanRefs.slice(i, i + chunkSize)) {
            batch.delete(ref);
          }
          await batch.commit();
        }
        orphanDeleteCount = orphanRefs.length;
        console.log(
          `[sync] deleted ${orphanDeleteCount} orphan Firestore quote(s) (removed from Notion or no longer returned by the database)`
        );
      }
    } else {
      console.log('[sync] no orphan Notion quote docs to delete');
    }
  } else {
    console.log('[sync] orphan delete skipped (--no-delete-orphans)');
  }

  console.log(
    `[sync] complete dryRun=${dryRun} fetched=${fetchedPages} writes=${writeCount} fortunes=${fortuneCount} skipped=${skipCount} orphansRemoved=${orphanDeleteCount} collection=${collectionName}`
  );
}

run().catch((err) => {
  console.error('[sync] failed:', err.message);
  process.exit(1);
});

