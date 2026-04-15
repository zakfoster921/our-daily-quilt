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
  const notificationTitle =
    getRichText(props.notification_title) || getTitle(props.notification_title);
  const notificationText =
    getRichText(props.notification_text) || getTitle(props.notification_text);
  const theme = getSelect(props.theme) || getRichText(props.theme) || getTitle(props.theme);
  const sortOrder = getNumber(props.sort_order, 0);
  const active = getBoolean(props.active, true);
  const notificationEnabled = getBoolean(props.notification_enabled, true);

  if (!text || !author) return null;

  return {
    id: page.id,
    data: {
      text,
      author,
      reflectionPrompt,
      notificationTitle,
      notificationText,
      notificationEnabled,
      active,
      sortOrder,
      theme,
      source: 'notion',
      sourceId: page.id,
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
  const notionToken = requireEnv('NOTION_TOKEN');
  const databaseId = requireEnv('NOTION_DATABASE_ID');
  const collectionName = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const db = initFirestore();

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

  console.log(
    `[sync] complete dryRun=${dryRun} fetched=${fetchedPages} writes=${writeCount} skipped=${skipCount} collection=${collectionName}`
  );
}

run().catch((err) => {
  console.error('[sync] failed:', err.message);
  process.exit(1);
});

