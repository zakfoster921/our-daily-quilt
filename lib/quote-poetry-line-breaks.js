/**
 * Notion Title can't store real newlines. Spaced slashes mark poem lines:
 *   Hope is the thing / with feathers / that perches in the soul
 * → hard line breaks for quote-screen + newspaper clipping.
 *
 * Requires whitespace on both sides of `/` so and/or, 3/4, https:// stay intact.
 */
'use strict';

function normalizeQuotePoetryLineBreaks(text) {
  const raw = String(text ?? '');
  if (!raw.includes('/')) return raw;
  return raw
    .replace(/\s+\/\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n');
}

const api = {
  normalizeQuotePoetryLineBreaks
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.QuotePoetryLineBreaks = api;
}
