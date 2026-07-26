/**
 * Resolve quote keyword + speaker guideline keyword strings for prefill/backfill.
 */
'use strict';

const {
  normalizeEmphasisWords,
  suggestKeywordsHeuristic
} = require('./quote-keyword-emphasis');

function joinKeywordList(keywords) {
  return (keywords || []).map((k) => String(k).trim()).filter(Boolean).join(', ');
}

function resolveQuoteKeywordPrefill(keywordInput, quoteText, { dateKey = 'prefill' } = {}) {
  const quote = String(quoteText || '').replace(/\s+/g, ' ').trim();
  if (!quote) return '';
  let keywords = normalizeEmphasisWords(keywordInput || [], quote, 3);
  if (!keywords.length) {
    keywords = suggestKeywordsHeuristic(quote, dateKey, 3);
  }
  return joinKeywordList(keywords);
}

function resolveSpeakerKeywordsPrefill(keywordInput, guideText, { dateKey = 'prefill' } = {}) {
  const guide = String(guideText || '').trim();
  if (!guide) return '';
  let keywords = normalizeEmphasisWords(keywordInput || [], guide, 4);
  if (!keywords.length) {
    keywords = suggestKeywordsHeuristic(guide, `${dateKey}#speaker`, 4);
  }
  return joinKeywordList(keywords);
}

function finalizePrefillEmphasisFields(out, quoteText) {
  const merged = { ...(out || {}) };
  merged.keyword = resolveQuoteKeywordPrefill(merged.keyword, quoteText);
  merged.speaker_keywords = resolveSpeakerKeywordsPrefill(
    merged.speaker_keywords,
    merged.speaker_guide_line
  );
  return merged;
}

module.exports = {
  joinKeywordList,
  resolveQuoteKeywordPrefill,
  resolveSpeakerKeywordsPrefill,
  finalizePrefillEmphasisFields
};
