#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const {
  artistSlugFromName,
  enrichEpisodesFromRss,
  guessArtistNameFromEpisodeTitle,
  isPlayableAudio,
  normalizeEpisodeRecord,
  parseSeamsideRssItems
} = require('./lib/seamside-episode-utils.cjs');

const RSS_URL = 'https://www.zakfoster.com/seamside?format=rss';
const OUT_PATH = path.resolve(__dirname, '..', 'data', 'seamside-episodes-draft.json');

async function main() {
  const res = await fetch(RSS_URL);
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();
  const items = parseSeamsideRssItems(xml).filter((item) => isPlayableAudio(item) && !item.isExtended);
  const rows = [];
  const seen = new Set();
  for (const item of items) {
    const artistName = guessArtistNameFromEpisodeTitle(item.episodeTitle || item.title);
    if (!artistName) continue;
    const slug = artistSlugFromName(artistName);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const row = normalizeEpisodeRecord({
      artistName,
      artistSlug: slug,
      episodeTitle: item.episodeTitle || item.title,
      audioUrl: item.audioUrl,
      episodeImageUrl: item.episodeImageUrl,
      active: true
    });
    if (row) rows.push(row);
  }
  rows.sort((a, b) => a.artistName.localeCompare(b.artistName));
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${rows.length} draft episode rows to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
