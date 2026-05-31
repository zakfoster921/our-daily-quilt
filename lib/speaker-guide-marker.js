/**
 * Hand-drawn marker highlights for speaker guideline copy (DOM).
 * Browser: global.SpeakerGuideMarker. Requires QuoteKeywordEmphasis (load first).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SpeakerGuideMarker = api;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : {},
  function (global) {
    'use strict';

    /** Organic highlighter paths (viewBox 0 0 100 24 — ~20% taller than text cap height). */
    const MARKER_PATHS = [
      'M1,16 Q28,6 52,15 T99,12',
      'M0,14 C22,20 38,8 58,16 S88,10 100,17',
      'M2,18 Q35,10 65,17 T98,11',
      'M1,13 Q40,19 70,12 T99,16'
    ];

    function escapeHtml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    const SPEAKER_KEYWORD_SPLIT_RE = /[,;，、｜|\n]+/;

    function parseSpeakerKeywordsInput(input) {
      if (Array.isArray(input)) {
        return input.map((p) => String(p).trim()).filter(Boolean);
      }
      const raw = String(input || '').trim();
      if (!raw) return [];
      return raw
        .split(SPEAKER_KEYWORD_SPLIT_RE)
        .map((p) => p.trim())
        .filter(Boolean);
    }

    /** Match each comma-separated Notion phrase independently (no shared 3-phrase cap). */
    function normalizeSpeakerGuideKeywords(keywordsInput, guideText) {
      const guide = String(guideText || '').trim();
      if (!guide) return [];
      const QKE = global.QuoteKeywordEmphasis || null;
      const items = parseSpeakerKeywordsInput(keywordsInput);
      if (!items.length) return [];

      const used = new Set();
      const out = [];
      const sorted = [...items].sort((a, b) => b.length - a.length);

      if (QKE && typeof QKE.normalizeEmphasisWords === 'function' && typeof QKE.phraseMatchKey === 'function') {
        for (const item of sorted) {
          if (out.length >= 12) break;
          const matched = QKE.normalizeEmphasisWords([item], guide);
          for (const exact of matched) {
            const key = QKE.phraseMatchKey(exact);
            if (!key || used.has(key)) continue;
            used.add(key);
            out.push(exact);
          }
        }
        return out;
      }

      return sorted.slice(0, 12);
    }

    function collectAllGuidePhraseMatches(guideText, targets) {
      const ln = String(guideText || '');
      const QKE = global.QuoteKeywordEmphasis || null;
      if (!ln || !targets.length) return [];

      if (QKE && typeof QKE.buildLineSegments === 'function') {
        const segments = QKE.buildLineSegments(ln, targets);
        const hits = [];
        let pos = 0;
        for (const seg of segments) {
          if (!seg.emphasis) {
            pos += String(seg.text || '').length;
            continue;
          }
          const text = String(seg.text || '');
          hits.push({ start: pos, end: pos + text.length, text, rank: seg.rank });
          pos += text.length;
        }
        if (hits.length) return hits;
      }

      return [];
    }

    function markerSvgForIndex(idx) {
      const path = MARKER_PATHS[Math.abs(idx) % MARKER_PATHS.length];
      return (
        `<svg class="speaker-guide-marker__stroke" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">` +
        `<path d="${path}" fill="rgba(255,214,74,0.58)"/></svg>`
      );
    }

    function buildSpeakerGuideMarkerHtml(guideText, keywordsInput) {
      const text = String(guideText || '');
      if (!text) return '';
      const targets = normalizeSpeakerGuideKeywords(keywordsInput, text);
      if (!targets.length) return escapeHtml(text);

      const hits = collectAllGuidePhraseMatches(text, targets);
      if (!hits.length) return escapeHtml(text);

      let html = '';
      let pos = 0;
      let markerIdx = 0;
      for (const hit of hits) {
        if (hit.start > pos) html += escapeHtml(text.slice(pos, hit.start));
        const tilt = ((markerIdx % 5) - 2) * 0.35;
        html +=
          `<mark class="speaker-guide-marker" data-marker-idx="${markerIdx}" style="--marker-tilt:${tilt}deg">` +
          markerSvgForIndex(markerIdx) +
          `<span class="speaker-guide-marker__text">${escapeHtml(hit.text)}</span></mark>`;
        markerIdx += 1;
        pos = hit.end;
      }
      if (pos < text.length) html += escapeHtml(text.slice(pos));
      return html;
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

    return {
      MARKER_PATHS,
      parseSpeakerKeywordsInput,
      normalizeSpeakerGuideKeywords,
      buildSpeakerGuideMarkerHtml,
      applySpeakerGuideMarker
    };
  }
);
