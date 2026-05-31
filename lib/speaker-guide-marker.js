/**
 * Hand-drawn marker highlights for speaker guideline copy (DOM).
 * Keywords come from Notion `speaker_keywords` → Firestore `speaker_keywords`.
 */
'use strict';

/** Organic highlighter paths (viewBox 0 0 100 20). */
const MARKER_PATHS = [
  'M1,13 Q28,5 52,12 T99,10',
  'M0,11 C22,17 38,6 58,13 S88,7 100,14',
  'M2,15 Q35,8 65,14 T98,9',
  'M1,10 Q40,16 70,9 T99,13'
];

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseSpeakerKeywordsInput(input) {
  const QKE = typeof globalThis !== 'undefined' ? globalThis.QuoteKeywordEmphasis : null;
  if (QKE && typeof QKE.parseEmphasisInputList === 'function') {
    return QKE.parseEmphasisInputList(input);
  }
  const raw = String(input || '').trim();
  if (!raw) return [];
  return raw.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
}

function normalizeSpeakerGuideKeywords(keywordsInput, guideText) {
  const QKE = typeof globalThis !== 'undefined' ? globalThis.QuoteKeywordEmphasis : null;
  if (QKE && typeof QKE.normalizeEmphasisWords === 'function') {
    return QKE.normalizeEmphasisWords(keywordsInput, guideText);
  }
  return parseSpeakerKeywordsInput(keywordsInput).slice(0, 6);
}

function markerSvgForIndex(idx) {
  const path = MARKER_PATHS[Math.abs(idx) % MARKER_PATHS.length];
  return (
    `<svg class="speaker-guide-marker__stroke" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">` +
    `<path d="${path}" fill="rgba(255,214,74,0.58)"/></svg>`
  );
}

function buildSpeakerGuideMarkerHtml(guideText, keywordsInput) {
  const text = String(guideText || '');
  if (!text) return '';
  const targets = normalizeSpeakerGuideKeywords(keywordsInput, text);
  if (!targets.length) return escapeHtml(text);

  const QKE = typeof globalThis !== 'undefined' ? globalThis.QuoteKeywordEmphasis : null;
  const segments =
    QKE && typeof QKE.buildLineSegments === 'function'
      ? QKE.buildLineSegments(text, targets)
      : [{ text, emphasis: false, rank: -1 }];

  let markerIdx = 0;
  return segments
    .map((seg) => {
      if (!seg.emphasis) return escapeHtml(seg.text);
      const idx = markerIdx++;
      const tilt = ((idx % 5) - 2) * 0.35;
      return (
        `<mark class="speaker-guide-marker" data-marker-idx="${idx}" style="--marker-tilt:${tilt}deg">` +
        markerSvgForIndex(idx) +
        `<span class="speaker-guide-marker__text">${escapeHtml(seg.text)}</span></mark>`
      );
    })
    .join('');
}

function applySpeakerGuideMarker(el, guideText, keywordsInput) {
  if (!el) return;
  const text = String(guideText || '').trim();
  if (!text) {
    el.textContent = '';
    el.innerHTML = '';
    return;
  }
  const html = buildSpeakerGuideMarkerHtml(text, keywordsInput);
  if (html.includes('<mark')) {
    el.innerHTML = html;
  } else {
    el.textContent = text;
  }
}

const api = {
  MARKER_PATHS,
  parseSpeakerKeywordsInput,
  normalizeSpeakerGuideKeywords,
  buildSpeakerGuideMarkerHtml,
  applySpeakerGuideMarker
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.SpeakerGuideMarker = api;
}
