#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sync SEAMSIDE guest → episode map to Firestore `seamsideEpisodes/{artistSlug}`.
 *
 * Sources (first match wins):
 * 1. Notion database NOTION_SEAMSIDE_EPISODES_DATABASE_ID (when set)
 * 2. data/seamside-episodes.json
 *
 * Notion columns (add to SEAMSIDE Episodes DB):
 * - artist_name (title or rich_text)
 * - episode_title (rich_text)
 * - apple_podcasts_url (url)
 * - audio_url (url)
 * - episode_image_url (url)
 * - active (checkbox)
 *
 * Editorial: mark podcast quotes with submitted_via = SEAMSIDE in the quotes DB.
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
const { artistSlugFromName, normalizeEpisodeRecord } = require('./lib/seamside-episode-utils.cjs');

const NOTION_API_VERSION = '2022-06-28';
const JSON_PATH = path.resolve(__dirname, '..', 'data', 'seamside-episodes.json');

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return String(value).trim();
}

function initFirebase() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  } else {
    admin.initializeApp();
  }
  return admin.firestore();
}

function plainTextFromNotionRichTextSegments(segments) {
  if (!Array.isArray(segments)) return '';
  return segments.map((s) => s.plain_text || '').join('');
}

function getRichText(prop) {
  if (!prop) return '';
  if (Array.isArray(prop.rich_text)) return plainTextFromNotionRichTextSegments(prop.rich_text);
  return '';
}

function getTitle(prop) {
  if (!prop) return '';
  if (Array.isArray(prop.title)) return plainTextFromNotionRichTextSegments(prop.title);
  return '';
}

function getUrl(prop) {
  if (!prop) return '';
  return String(prop.url || '').trim();
}

function getCheckbox(prop, fallback = true) {
  if (!prop) return fallback;
  if (typeof prop.checkbox === 'boolean') return prop.checkbox;
  return fallback;
}

function findProp(props, ...names) {
  for (const name of names) {
    if (props[name]) return props[name];
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const keys = Object.keys(props || {});
  for (const name of names) {
    const target = norm(name);
    const hit = keys.find((k) => norm(k) === target);
    if (hit) return props[hit];
  }
  return null;
}

function textFromAnyNotionProp(prop) {
  if (!prop) return '';
  return getTitle(prop) || getRichText(prop) || getUrl(prop) || String(prop.select?.name || '').trim();
}

async function notionFetchJson(url, notionToken, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`Notion ${url}: ${payload.message || res.status}`);
  }
  return payload;
}

async function notionQueryAll(databaseId, notionToken) {
  const pages = [];
  let cursor;
  do {
    const payload = await notionFetchJson(`https://api.notion.com/v1/databases/${databaseId}/query`, notionToken, {
      method: 'POST',
      body: JSON.stringify({
        start_cursor: cursor || undefined,
        page_size: 100
      })
    });
    pages.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);
  return pages;
}

function parseNotionEpisodePage(page) {
  const props = page?.properties || {};
  const artistName = textFromAnyNotionProp(findProp(props, 'artist_name', 'Artist name', 'Artist Name', 'artistName'));
  const episodeTitle = textFromAnyNotionProp(
    findProp(props, 'episode_title', 'Episode title', 'Episode Title', 'episodeTitle')
  );
  const applePodcastsUrl = getUrl(findProp(props, 'apple_podcasts_url', 'Apple Podcasts URL', 'applePodcastsUrl'));
  const audioUrl = getUrl(findProp(props, 'audio_url', 'Audio URL', 'audioUrl'));
  const episodeImageUrl = getUrl(findProp(props, 'episode_image_url', 'Episode image URL', 'episodeImageUrl'));
  const active = getCheckbox(findProp(props, 'active', 'Active'), true);
  return normalizeEpisodeRecord({
    artistName,
    artistSlug: artistSlugFromName(artistName),
    episodeTitle,
    applePodcastsUrl,
    audioUrl,
    episodeImageUrl,
    active,
    updatedAt: page?.last_edited_time || new Date().toISOString()
  });
}

function loadJsonEpisodes() {
  if (!fs.existsSync(JSON_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : parsed?.episodes || [];
  return rows.map((row) => normalizeEpisodeRecord(row)).filter(Boolean);
}

async function loadEpisodes() {
  const notionDb = String(process.env.NOTION_SEAMSIDE_EPISODES_DATABASE_ID || '').trim();
  const notionToken = String(process.env.NOTION_TOKEN || '').trim();
  if (notionDb && notionToken) {
    const pages = await notionQueryAll(notionDb, notionToken);
    const rows = pages.map(parseNotionEpisodePage).filter(Boolean);
    console.log(`[seamside-sync] loaded ${rows.length} rows from Notion`);
    return rows;
  }
  const rows = loadJsonEpisodes();
  console.log(`[seamside-sync] loaded ${rows.length} rows from ${JSON_PATH}`);
  return rows;
}

async function main() {
  const db = initFirebase();
  const episodes = await loadEpisodes();
  if (!episodes.length) {
    console.warn('[seamside-sync] no episodes to sync');
    return;
  }
  const batch = db.batch();
  const now = new Date().toISOString();
  for (const episode of episodes) {
    const docRef = db.collection('seamsideEpisodes').doc(episode.artistSlug);
    batch.set(
      docRef,
      {
        artist_name: episode.artistName,
        artist_slug: episode.artistSlug,
        episode_title: episode.episodeTitle,
        apple_podcasts_url: episode.applePodcastsUrl,
        audio_url: episode.audioUrl,
        episode_image_url: episode.episodeImageUrl,
        active: episode.active !== false,
        updated_at: now,
        source: String(process.env.NOTION_SEAMSIDE_EPISODES_DATABASE_ID || '').trim() ? 'notion' : 'json'
      },
      { merge: true }
    );
  }
  await batch.commit();
  console.log(`[seamside-sync] wrote ${episodes.length} docs to seamsideEpisodes`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { loadEpisodes, normalizeEpisodeRecord };
