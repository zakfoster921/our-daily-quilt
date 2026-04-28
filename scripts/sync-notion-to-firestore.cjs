#!/usr/bin/env node
/* eslint-disable no-console */
try {
  require('dotenv').config();
} catch (_) {
  // dotenv is optional in CI where env vars come from GitHub secrets.
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
    return prop.title.map((x) => x?.plain_text || '').join('').trim();
  }
  return '';
}

function getRichText(prop) {
  if (!prop) return '';
  if (Array.isArray(prop.rich_text)) {
    return prop.rich_text.map((x) => x?.plain_text || '').join('').trim();
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
    .toLowerCase()
    .replace(/[\s_-]/g, '');
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
  }
  if (prop.type === 'url' && prop.url) return String(prop.url).trim();
  if (prop.type === 'number' && typeof prop.number === 'number') return String(prop.number);
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
  for (const k of directKeys) {
    const t = getRichText(props[k]) || getTitle(props[k]);
    if (t) return t.trim();
  }
  return textFromNotionProp(findPropByBaseName(props, base));
}

function parseNotionRow(page) {
  const props = page?.properties || {};
  const text =
    getTitle(props.quote_text) ||
    getRichText(props.quote_text) ||
    getTitle(props.Name) ||
    getRichText(props.Name);
  const author = getRichText(props.author) || getTitle(props.author);
  const reflectionPrompt =
    getRichText(props.reflection_prompt) || getTitle(props.reflection_prompt);
  const whatIf = getMappedText(props, 'what_if', 'what_if', 'What if', 'What If');
  const igCaption = getMappedText(props, 'ig_caption', 'ig_caption', 'IG Caption', 'Ig Caption');
  const mood = getMappedText(props, 'mood', 'mood', 'Mood');
  const blessing = findBlessingFromProps(props);
  const submittedBy = getMappedText(
    props,
    'submitted_by',
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
    'submitted_via',
    'submittedVia',
    'Submitted via',
    'Submitted Via'
  );
  const itemNo = typeof props.item_no?.number === 'number' ? props.item_no.number : null;
  const lastUsedDate = getDateStart(props.last_used_date);
  const reviewed = getCheckbox(props['reviewed?'], false);
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

  if (!text || !author) return null;

  return {
    id: page.id,
    data: {
      text,
      author,
      reflectionPrompt,
      whatIf,
      what_if: whatIf,
      igCaption,
      ig_caption: igCaption,
      mood,
      blessing,
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
      notionProperties: notionPropertiesSnapshot(props),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  };
}

async function notionQuery(databaseId, notionToken, startCursor) {
  const body = {
    page_size: 100
  };
  if (startCursor) body.start_cursor = startCursor;

  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Notion API error ${res.status}: ${msg}`);
  }
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
      if (!dryRun) {
        await db.collection(collectionName).doc(parsed.id).set(parsed.data, { merge: true });
      }
      writeCount += 1;
    }

    console.log(
      `[sync] page=${page} fetched=${results.length} totalFetched=${fetchedPages} writes=${writeCount} skipped=${skipCount}`
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
    `[sync] complete dryRun=${dryRun} fetched=${fetchedPages} writes=${writeCount} skipped=${skipCount} orphansRemoved=${orphanDeleteCount} collection=${collectionName}`
  );
}

run().catch((err) => {
  console.error('[sync] failed:', err.message);
  process.exit(1);
});

