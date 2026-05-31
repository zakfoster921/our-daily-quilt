'use strict';

const QKE = require('../../lib/quote-keyword-emphasis.js');
const LBKE = require('../../lib/layout-b-keyword-emphasis.js');

const ADMIN_TUNE_SOURCE = 'admin-tune-modal';

function pickQuoteKeywordRaw(catalog) {
  return String(catalog?.keyword ?? '').trim();
}

function buildLayoutBKeywordEmphasisFromNotionKeyword(keywordInput, quoteText) {
  const raw = String(keywordInput || '').trim();
  const text = String(quoteText || '').trim();
  if (!raw || !text) return null;
  const keywords = QKE.parseEmphasisWordsInput(raw, text);
  if (!keywords.length) return null;
  const normalized = LBKE.normalizeLayoutBKeywordEmphasisPayload({ keywords, styles: ['bold'] });
  if (!normalized) return { keywords: keywords.slice(0, 3), styles: ['bold'] };
  if (!normalized.styles.length) normalized.styles = ['bold'];
  return normalized;
}

function layoutBKeywordEmphasisFirestorePatch(keywordInput, quoteText, meta = {}) {
  const built = buildLayoutBKeywordEmphasisFromNotionKeyword(keywordInput, quoteText);
  if (!built) return { deleteEmphasis: true };
  const emphasisDoc = {
    ...built,
    updatedAt: meta.updatedAt || new Date().toISOString(),
    updatedBy: meta.updatedBy || 'notion-sync'
  };
  return {
    deleteEmphasis: false,
    patch: {
      layoutBKeywordEmphasis: emphasisDoc,
      layoutBKeywordEmphasisStory: emphasisDoc,
      layoutBKeywordEmphasisPost: emphasisDoc
    }
  };
}

function isAdminTunedKeywordEmphasis(doc) {
  return doc && typeof doc === 'object' && String(doc.updatedBy || '').trim() === ADMIN_TUNE_SOURCE;
}

function shouldSyncNotionKeywordEmphasis(existingDoc) {
  const doc = existingDoc || {};
  if (isAdminTunedKeywordEmphasis(doc.layoutBKeywordEmphasis)) return false;
  if (isAdminTunedKeywordEmphasis(doc.layoutBKeywordEmphasisStory)) return false;
  if (isAdminTunedKeywordEmphasis(doc.layoutBKeywordEmphasisPost)) return false;
  return true;
}

module.exports = {
  ADMIN_TUNE_SOURCE,
  pickQuoteKeywordRaw,
  buildLayoutBKeywordEmphasisFromNotionKeyword,
  layoutBKeywordEmphasisFirestorePatch,
  isAdminTunedKeywordEmphasis,
  shouldSyncNotionKeywordEmphasis
};
