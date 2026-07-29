#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const {
  normalizeEmphasisWords
} = require('../lib/quote-keyword-emphasis.js');
const {
  resolveQuoteKeywordPrefill,
  resolveSpeakerKeywordsPrefill
} = require('../lib/prefill-emphasis-fields.js');

const quote =
  'All that you touch You Change. All that you Change Changes you.';
const reordered = normalizeEmphasisWords(['Change', 'touch', 'Changes you'], quote, 3);
assert.deepStrictEqual(reordered, ['touch', 'Change', 'Changes you']);

const guide = 'Spent decades writing and teaching about love, race, and community';
const speakerKw = normalizeEmphasisWords(['community', 'teaching', 'writing'], guide, 4);
assert.deepStrictEqual(speakerKw, ['writing', 'teaching', 'community']);

assert.strictEqual(
  resolveQuoteKeywordPrefill('Change, touch', quote),
  'touch, Change'
);
assert.strictEqual(
  resolveSpeakerKeywordsPrefill('race, writing', guide),
  'writing, race'
);

console.log('test-quote-keyword-order: ok');
