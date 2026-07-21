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

  qs._seamsideEpisodes = [
    qs._normalizeSeamsideEpisodeFromFirestore(
      {
        artistName: 'Demetri Broxton',
        artistSlug: 'demetri-broxton',
        speaker_link: 'https://example.com/demetri'
      },
      'demetri-broxton'
    )
  ];
  assert.strictEqual(
    qs.lookupSeamsideSpeakerLinkForAuthor('Demetri Broxton'),
    'https://example.com/demetri'
  );

  const merged = qs._mergeAssignmentSubmittedViaSnapshotFields(
    { text: 'x', author: 'y' },
    { submittedViaSnapshot: 'SEAMSIDE' }
  );
  assert.strictEqual(merged.submitted_via, 'SEAMSIDE');

  // Offline cache must keep SEAMSIDE so bootstrap can show the podcast widget.
  const cachePayload = qs._localAssignmentCachePayload(
    '2026-07-19',
    { text: 'x', author: 'Heidi Parkes', submitted_via: 'SEAMSIDE' },
    { submittedViaSnapshot: 'SEAMSIDE', authorSnapshot: 'Heidi Parkes', textSnapshot: 'x' }
  );
  assert.strictEqual(cachePayload.submittedViaSnapshot, 'SEAMSIDE');
  const fromCache = qs._quoteFromAssignmentSnapshots(cachePayload);
  assert.strictEqual(qs.isSeamsideQuote(fromCache), true);

  // Normalized rows only have artistName — empty artist_name must not match every guest.
  assert.strictEqual(qs.lookupSeamsideEpisodeForAuthor('Heidi Parkes'), null);
  assert.ok(qs.lookupSeamsideEpisodeForAuthor('Demetri Broxton'));

  const withHeidi = [
    qs._normalizeSeamsideEpisodeFromFirestore(
      {
        artistName: 'Heidi Parkes',
        artistSlug: 'heidi-parkes',
        audioUrl: 'https://example.com/heidi.m4a',
        applePodcastsUrl: 'https://podcasts.apple.com/example'
      },
      'heidi-parkes'
    ),
    ...qs._seamsideEpisodes
  ];
  qs._seamsideEpisodes = withHeidi;
  const heidiEp = qs.lookupSeamsideEpisodeForAuthor('Heidi Parkes');
  assert.ok(heidiEp);
  assert.strictEqual(heidiEp.artistSlug, 'heidi-parkes');

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
