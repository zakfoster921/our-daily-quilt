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

function normalize(str) {
  return String(str || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function quoteKey(text, author) {
  return `${normalize(text)}|||${normalize(author)}`;
}

function isDateDocId(id) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(id || '').trim());
}

function normPropKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

function findSchemaPropName(properties, base) {
  const target = normPropKey(base);
  for (const key of Object.keys(properties || {})) {
    if (normPropKey(key) === target) return key;
  }
  return '';
}

function pickScheduledDate(dateKeys, todayKey) {
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return null;
  const sorted = [...new Set(dateKeys.filter(isDateDocId))].sort();
  if (!sorted.length) return null;
  const upcoming = sorted.find((d) => d >= todayKey);
  return upcoming || sorted[sorted.length - 1];
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

async function notionPatchPage(pageId, notionToken, payload) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`Notion page patch failed (${res.status}) for ${pageId}: ${body}`);
    err.notionStatus = res.status;
    err.notionBody = body;
    throw err;
  }
}

/** PATCH cannot update archived or deleted pages — skip instead of failing the whole job. */
function isSkippableNotionUsagePatchError(err) {
  const status = err && typeof err.notionStatus === 'number' ? err.notionStatus : 0;
  const combined = `${err?.message || ''} ${err?.notionBody || ''}`.toLowerCase();
  if (status === 404) return true;
  if (combined.includes('archived') && combined.includes('unarchive')) return true;
  if (combined.includes('is archived')) return true;
  if (combined.includes('could not be found')) return true;
  if (combined.includes('object_not_found')) return true;
  return false;
}

async function notionGetDatabaseSchema(databaseId, notionToken) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_API_VERSION
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion DB schema fetch failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  return json.properties || {};
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const notionToken = requireEnv('NOTION_TOKEN');
  const notionDatabaseId = requireEnv('NOTION_DATABASE_ID');
  const db = initFirestore();

  const collectionName = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const usageDateCollection = process.env.FIRESTORE_DAILY_QUOTES_COLLECTION || 'dailyQuoteUsage';

  const notionSchema = await notionGetDatabaseSchema(notionDatabaseId, notionToken);
  const hasTimesUsed = !!notionSchema.times_used;
  const hasLastUsedDate = !!notionSchema.last_used_date;
  const dateScheduledProp =
    findSchemaPropName(notionSchema, 'date_scheduled') ||
    findSchemaPropName(notionSchema, 'datescheduled');
  const hasDateScheduled = !!dateScheduledProp;
  if (!hasTimesUsed && !hasLastUsedDate && !hasDateScheduled) {
    throw new Error(
      "Notion DB needs at least one of these properties: 'times_used' (number), 'last_used_date' (date), 'date_scheduled' (date)"
    );
  }

  const allSnap = await db.collection(collectionName).get();
  const notionDocs = [];
  const byKey = new Map();

  for (const doc of allSnap.docs) {
    const data = doc.data() || {};
    if (data.source !== 'notion') continue;
    const text = data.text || '';
    const author = data.author || '';
    const sourceId = data.sourceId || doc.id;
    if (!text || !author || !sourceId) continue;
    const key = quoteKey(text, author);
    const rec = { sourceId, text, author, key };
    notionDocs.push(rec);
    byKey.set(key, rec);
  }

  const usageSnap = await db.collection(usageDateCollection).get();
  const usage = new Map(); // key -> { count, lastDate }
  for (const doc of usageSnap.docs) {
    if (!isDateDocId(doc.id)) continue;
    const d = doc.data() || {};
    const key = quoteKey(d.text, d.author);
    if (!key || key === '|||') continue;
    const existing = usage.get(key) || { count: 0, lastDate: null };
    existing.count += 1;
    if (!existing.lastDate || doc.id > existing.lastDate) existing.lastDate = doc.id;
    usage.set(key, existing);
  }

  const assignmentCollection =
    process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';
  const assignmentSnap = await db.collection(assignmentCollection).get();
  const scheduledBySourceId = new Map(); // sourceId -> [dateKey]
  const scheduledByKey = new Map(); // quoteKey(text, author) -> [dateKey]
  for (const doc of assignmentSnap.docs) {
    if (!isDateDocId(doc.id)) continue;
    const dateKey = doc.id;
    const d = doc.data() || {};
    const sourceId = String(d.sourceId || '').trim();
    if (sourceId) {
      const arr = scheduledBySourceId.get(sourceId) || [];
      arr.push(dateKey);
      scheduledBySourceId.set(sourceId, arr);
    }
    const key = quoteKey(d.textSnapshot, d.authorSnapshot);
    if (key && key !== '|||') {
      const arr = scheduledByKey.get(key) || [];
      arr.push(dateKey);
      scheduledByKey.set(key, arr);
    }
  }

  const now = new Date();
  const todayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  let updates = 0;
  let skipped = 0;
  for (const q of notionDocs) {
    const u = usage.get(q.key);
    if (!u) continue;

    const properties = {};
    if (hasTimesUsed) properties.times_used = { number: u.count };
    if (hasLastUsedDate) properties.last_used_date = { date: { start: u.lastDate } };
    if (hasDateScheduled) {
      const bySource = scheduledBySourceId.get(q.sourceId) || [];
      const byTextAuthor = scheduledByKey.get(q.key) || [];
      const scheduledDate = pickScheduledDate([...bySource, ...byTextAuthor], todayKey);
      properties[dateScheduledProp] = { date: scheduledDate ? { start: scheduledDate } : null };
    }
    if (!Object.keys(properties).length) continue;

    updates += 1;
    if (!dryRun) {
      try {
        await notionPatchPage(q.sourceId, notionToken, { properties });
      } catch (e) {
        if (isSkippableNotionUsagePatchError(e)) {
          skipped += 1;
          console.warn(
            `[usage-sync] skip page ${q.sourceId} (archived, deleted, or not patchable): ${(e.message || '').slice(0, 220)}`
          );
          continue;
        }
        throw e;
      }
    }
  }

  const applied = dryRun ? updates : updates - skipped;
  console.log(
    `[usage-sync] complete dryRun=${dryRun} notionDocs=${notionDocs.length} usageDates=${usage.size} patchTargets=${updates} skipped=${skipped}${dryRun ? '' : ` applied=${applied}`}`
  );
}

run().catch((err) => {
  console.error('[usage-sync] failed:', err.message);
  process.exit(1);
});

