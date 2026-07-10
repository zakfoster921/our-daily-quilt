#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  artistSlugFromName,
  authorsReferToSameSpeaker,
  parseSeamsideRssItems
} = require('./lib/seamside-episode-utils.cjs');

function loadQuoteServiceClass() {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib', 'quote-service.js'), 'utf8');
  const sandbox = { console, globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(`${src}; this.QuoteService = globalThis.QuoteService;`, sandbox);
  return sandbox.QuoteService;
}

async function main() {
  assert.strictEqual(artistSlugFromName('Demetri Broxton'), 'demetri-broxton');
  assert.strictEqual(authorsReferToSameSpeaker('— Demetri Broxton', 'Demetri Broxton'), true);
  assert.strictEqual(authorsReferToSameSpeaker('Faith Ringgold', 'Demetri Broxton'), false);

  const seed = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'data', 'seamside-episodes.json'), 'utf8')
  );
  assert.ok(Array.isArray(seed) && seed.length >= 1);
  assert.ok(String(seed[0].audioUrl || '').includes('.mp3'));

  const QuoteService = loadQuoteServiceClass();
  const qs = new QuoteService(null);
  qs._seamsideEpisodes = seed.map((row) => qs._normalizeSeamsideEpisodeFromFirestore(row, row.artistSlug));

  const seamsideQuote = {
    text: 'Sample quote',
    author: '— Demetri Broxton',
    submitted_via: 'SEAMSIDE'
  };
  const otherQuote = {
    text: 'Other quote',
    author: '— Demetri Broxton',
    submitted_via: ''
  };

  assert.strictEqual(qs.isSeamsideQuote(seamsideQuote), true);
  assert.strictEqual(qs.isSeamsideQuote(otherQuote), false);
  const episode = qs.lookupSeamsideEpisodeForAuthor(seamsideQuote.author);
  assert.ok(episode);
  assert.match(episode.audioUrl, /\.mp3/i);

  const merged = qs._mergeAssignmentSubmittedViaSnapshotFields(
    { text: 'x', author: 'y' },
    { submittedViaSnapshot: 'SEAMSIDE' }
  );
  assert.strictEqual(merged.submitted_via, 'SEAMSIDE');

  const res = await fetch('https://www.zakfoster.com/seamside?format=rss');
  assert.ok(res.ok);
  const xml = await res.text();
  const items = parseSeamsideRssItems(xml);
  assert.ok(items.length > 10);
  const demetri = items.find((item) => /demetri broxton/i.test(item.episodeTitle));
  assert.ok(demetri);
  assert.ok(String(demetri.audioUrl).includes('.mp3'));

  console.log('test-seamside-podcast-widget: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
