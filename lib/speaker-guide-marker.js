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

    const DEBUG_LOG_ENDPOINT =
      'http://127.0.0.1:7826/ingest/4815b929-2de4-447e-9ce4-d2a4503534a8';
    const DEBUG_SESSION_ID = '1b86c7';

    function speakerMarkerDebugEnabled() {
      try {
        if (global.localStorage?.getItem('ODQ_DEBUG_SPEAKER_MARKER') === '1') return true;
      } catch (_) {}
      try {
        if (typeof global.location?.search === 'string') {
          return /(?:\?|&)odqDebugSpeakerMarker=1(?:&|$)/.test(global.location.search);
        }
      } catch (_) {}
      return global.__ODQ_AGENT_DEBUG_INGEST__ === true;
    }

    /** Felt-tip highlighter blobs (viewBox 0 0 100 16) — rounded caps, subtle edge wobble. */
    const MARKER_PATHS = [
      'M4,5 Q24,3 52,5 T94,5 L96,11 Q70,13 44,12 T14,13 L5,11 Q3,8 4,5 Z',
      'M5,4 Q38,6 60,4 T97,4 L98,11 Q64,10 36,12 T9,11 L4,9 Q3,6 5,4 Z',
      'M3,5 Q30,3 55,6 T96,5 L95,11 Q66,12 40,11 T11,12 L4,10 Q2,7 3,5 Z',
      'M6,4 Q42,5 64,4 T94,6 L93,11 Q56,9 30,12 T8,10 L5,8 Q4,6 6,4 Z'
    ];

    const MARKER_STROKE_TILTS = [-0.35, 0.28, -0.22, 0.32, -0.18];

    function escapeHtml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    const SPEAKER_KEYWORD_SPLIT_RE = /[,;，、｜|\n]+|\s+and\s+/i;

    function debugLog(hypothesisId, location, message, data) {
      // #region agent log
      const payload = {
        sessionId: DEBUG_SESSION_ID,
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now()
      };
      global.__ODQ_SPEAKER_GUIDE_MARKER_LAST__ = payload;
      if (speakerMarkerDebugEnabled() && typeof console !== 'undefined' && console.debug) {
        console.debug('[SpeakerGuideMarker]', message, data);
      }
      if (global.__ODQ_AGENT_DEBUG_INGEST__ === true) {
        fetch(DEBUG_LOG_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': DEBUG_SESSION_ID
          },
          body: JSON.stringify(payload)
        }).catch(() => {});
      }
      // #endregion
    }

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

    function markerSvgForIndex(idx) {
      const path = MARKER_PATHS[Math.abs(idx) % MARKER_PATHS.length];
      const tilt = MARKER_STROKE_TILTS[Math.abs(idx) % MARKER_STROKE_TILTS.length];
      return (
        `<svg class="speaker-guide-marker__stroke" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true" ` +
        `style="--marker-stroke-tilt:${tilt}deg">` +
        `<path d="${path}"/></svg>`
      );
    }

    function buildSpeakerGuideMarkerHtml(guideText, keywordsInput) {
      const text = String(guideText || '');
      if (!text) return '';
      const targets = normalizeSpeakerGuideKeywords(keywordsInput, text);
      if (!targets.length) return escapeHtml(text);

      const QKE = global.QuoteKeywordEmphasis || null;
      if (QKE && typeof QKE.buildLineSegments === 'function') {
        const segments = QKE.buildLineSegments(text, targets);
        const emphasisCount = segments.filter((s) => s.emphasis).length;
        debugLog('H2', 'speaker-guide-marker.js:buildSpeakerGuideMarkerHtml', 'segments built', {
          parsedKeywordCount: parseSpeakerKeywordsInput(keywordsInput).length,
          targetCount: targets.length,
          emphasisCount,
          targetsPreview: targets.slice(0, 5)
        });

        let markerIdx = 0;
        return segments
          .map((seg) => {
            if (!seg.emphasis) return escapeHtml(seg.text);
            const idx = markerIdx++;
            const tilt = ((idx % 5) - 2) * 0.12;
            return (
              `<mark class="speaker-guide-marker" data-marker-idx="${idx}" style="--marker-tilt:${tilt}deg">` +
              markerSvgForIndex(idx) +
              `<span class="speaker-guide-marker__text">${escapeHtml(seg.text)}</span></mark>`
            );
          })
          .join('');
      }

      return escapeHtml(text);
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
      const parsedKeywordCount = parseSpeakerKeywordsInput(keywordsInput).length;
      const markCount = (html.match(/<mark/g) || []).length;
      debugLog('H1', 'speaker-guide-marker.js:applySpeakerGuideMarker', 'apply result', {
        hasSpeakerGuideMarker: !!global.SpeakerGuideMarker,
        hasQuoteKeywordEmphasis: !!global.QuoteKeywordEmphasis,
        keywordInputLen: String(keywordsInput || '').length,
        parsedKeywordCount,
        markCount,
        scriptMarker: 'v13'
      });
      if (speakerMarkerDebugEnabled() && el) {
        const marks = el.querySelectorAll('.speaker-guide-marker');
        debugLog('H3', 'speaker-guide-marker.js:applySpeakerGuideMarker', 'marker band layout', {
          markRects: Array.from(marks).slice(0, 4).map((node, i) => {
            const r = node.getBoundingClientRect();
            return { i, w: Math.round(r.width), h: Math.round(r.height) };
          })
        });
      }
      if (parsedKeywordCount > 0 && markCount === 0) {
        console.warn(
          '[SpeakerGuideMarker] No highlights — speaker_keywords must be exact phrases from speaker_guide_line (not the daily quote).',
          { parsedKeywordCount, keywordsPreview: String(keywordsInput || '').slice(0, 120), guidePreview: text.slice(0, 120) }
        );
      } else if (parsedKeywordCount > 0 && markCount < parsedKeywordCount) {
        console.warn(
          '[SpeakerGuideMarker] Some keywords are not verbatim substrings of the guide line.',
          { parsedKeywordCount, markCount, guidePreview: text.slice(0, 80) }
        );
      }
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
