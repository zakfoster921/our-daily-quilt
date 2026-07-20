#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  normalizeQuotePoetryLineBreaks
} = require('../lib/quote-poetry-line-breaks.js');

assert.strictEqual(
  normalizeQuotePoetryLineBreaks('Hope is the thing / with feathers / that perches'),
  'Hope is the thing\nwith feathers\nthat perches'
);

assert.strictEqual(
  normalizeQuotePoetryLineBreaks('and/or 3/4 https://example.com'),
  'and/or 3/4 https://example.com'
);

assert.strictEqual(
  normalizeQuotePoetryLineBreaks('Already\nbroken / still works'),
  'Already\nbroken\nstill works'
);

assert.strictEqual(normalizeQuotePoetryLineBreaks(''), '');
assert.strictEqual(normalizeQuotePoetryLineBreaks(null), '');

console.log('ok: quote poetry slash line breaks');
