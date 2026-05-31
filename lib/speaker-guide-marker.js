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

    /** Organic highlighter paths (viewBox 0 0 100 24 — fill ~y 3–21, centered band). */
    const MARKER_PATHS = [
      'M0,18 Q26,4 52,16 T100,12',
      'M0,16 C20,22 38,6 58,18 S92,8 100,20',
      'M1,20 Q34,8 66,18 T99,10',
      'M0,14 Q40,22 72,14 T100,19'
    ];

    function escapeHtml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    const SPEAKER_KEYWORD_SPLIT_RE = /[,;，、｜|\n]+/;

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
      return (
        `<svg class="speaker-guide-marker__stroke" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">` +
        `<path d="${path}" fill="rgba(255,214,74,0.72)"/></svg>`
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
            const tilt = ((idx % 5) - 2) * 0.35;
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
        scriptMarker: 'v7'
      });
      if (speakerMarkerDebugEnabled() && el) {
        const strokes = el.querySelectorAll('.speaker-guide-marker__stroke');
        debugLog('H3', 'speaker-guide-marker.js:applySpeakerGuideMarker', 'stroke layout', {
          strokeRects: Array.from(strokes).slice(0, 4).map((node, i) => {
            const r = node.getBoundingClientRect();
            return { i, w: Math.round(r.width), h: Math.round(r.height) };
          })
        });
      }
      if (parsedKeywordCount > 0 && markCount < parsedKeywordCount) {
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
