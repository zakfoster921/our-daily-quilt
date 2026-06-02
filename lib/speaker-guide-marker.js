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

    /** Felt-tip highlighter blobs (viewBox 0 0 100 16) — rounded caps, light organic edge (not ruler-flat). */
    const MARKER_PATHS = [
      'M5,5 Q30,4.6 55,5.05 T95,4.95 L96,10.6 Q72,11.1 50,10.85 T10,11.05 L5,10.5 Q4.4,8 5,5 Z',
      'M5,4.9 Q40,5.15 65,4.95 T95,5.05 L95.5,10.65 Q60,11.05 35,10.9 T8,10.95 L5,10.55 Q4.3,7.6 5,4.9 Z',
      'M4,5 Q28,4.75 52,5.08 T96,4.92 L95,10.7 Q68,11.15 42,10.92 T12,11.02 L4.5,10.65 Q3.6,8 4,5 Z',
      'M6,4.95 Q45,5.08 70,4.98 T94,5.02 L94.5,10.62 Q58,10.92 32,11.02 T7,10.88 L5.5,10.45 Q4.7,7.4 6,4.95 Z'
    ];

    const MARKER_STROKE_TILTS = [-0.18, 0.14, -0.1, 0.16, -0.08];
    /** Highlight band = measured keyword text width × this ratio (21% total bleed vs text). */
    const MARKER_STROKE_WIDTH_RATIO = 1.21;
    /** Stroke height = measured keyword text height × this ratio (chunky band). */
    const MARKER_STROKE_HEIGHT_RATIO = 2.25;

    function escapeHtml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    const SPEAKER_KEYWORD_SPLIT_RE = /[,;，、｜|\n]+|\s+and\s+/i;

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

    function lineRectsForText(textEl) {
      const raw = [...textEl.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
      if (!raw.length) return [];
      raw.sort((a, b) => a.top - b.top || a.left - b.left);
      const lines = [];
      for (const r of raw) {
        const last = lines[lines.length - 1];
        if (last && Math.abs(r.top - last.top) < 2) {
          const left = Math.min(last.left, r.left);
          const right = Math.max(last.right, r.right);
          const top = Math.min(last.top, r.top);
          const bottom = Math.max(last.bottom, r.bottom);
          lines[lines.length - 1] = {
            left,
            right,
            top,
            bottom,
            width: right - left,
            height: bottom - top
          };
        } else {
          lines.push(r);
        }
      }
      return lines;
    }

    function ensureMarkerStrokeCount(mark, count) {
      let strokes = [...mark.querySelectorAll('.speaker-guide-marker__stroke')];
      if (!strokes.length) return [];
      const template = strokes[0];
      while (strokes.length < count) {
        mark.insertBefore(template.cloneNode(true), template);
        strokes = [...mark.querySelectorAll('.speaker-guide-marker__stroke')];
      }
      while (strokes.length > count) {
        strokes[strokes.length - 1].remove();
        strokes = [...mark.querySelectorAll('.speaker-guide-marker__stroke')];
      }
      return strokes;
    }

    function syncMarkerStrokeWidths(containerEl) {
      if (!containerEl) return;
      observeMarkerContainerResize(containerEl);
      const containerRect = containerEl.getBoundingClientRect();
      const marks = containerEl.querySelectorAll('.speaker-guide-marker');
      marks.forEach((mark) => {
        const textEl = mark.querySelector('.speaker-guide-marker__text');
        if (!textEl) return;
        const lineRects = lineRectsForText(textEl);
        if (!lineRects.length) return;
        const strokeEls = ensureMarkerStrokeCount(mark, lineRects.length);
        lineRects.forEach((textRect, i) => {
          const strokeEl = strokeEls[i];
          if (!strokeEl) return;
          const textW = textRect.width;
          const textH = textRect.height;
          if (!(textW > 0) || !(textH > 0)) return;
          const strokeW = textW * MARKER_STROKE_WIDTH_RATIO;
          const strokeH = textH * MARKER_STROKE_HEIGHT_RATIO;
          const textCenterX = (textRect.left + textRect.right) / 2 - containerRect.left;
          const textCenterY = (textRect.top + textRect.bottom) / 2 - containerRect.top;
          strokeEl.style.width = `${strokeW}px`;
          strokeEl.style.height = `${strokeH}px`;
          strokeEl.style.left = `${textCenterX}px`;
          strokeEl.style.top = `${textCenterY}px`;
        });
      });
    }

    const _markerResizeObservers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

    function observeMarkerContainerResize(containerEl) {
      if (!containerEl || !_markerResizeObservers || typeof ResizeObserver === 'undefined') return;
      if (_markerResizeObservers.has(containerEl)) return;
      const ro = new ResizeObserver(() => syncMarkerStrokeWidths(containerEl));
      ro.observe(containerEl);
      _markerResizeObservers.set(containerEl, ro);
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

        let markerIdx = 0;
        return segments
          .map((seg) => {
            if (!seg.emphasis) return escapeHtml(seg.text);
            const idx = markerIdx++;
            const tilt = ((idx % 5) - 2) * 0.12;
            return (
              `<mark class="speaker-guide-marker" data-marker-idx="${idx}" style="--marker-tilt:${tilt}deg">` +
              `<span class="speaker-guide-marker__text">${escapeHtml(seg.text)}</span>` +
              markerSvgForIndex(idx) +
              `</mark>`
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
        observeMarkerContainerResize(el);
        const runSync = () => syncMarkerStrokeWidths(el);
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => requestAnimationFrame(runSync));
        } else {
          runSync();
        }
        if (typeof document !== 'undefined' && document.fonts?.ready) {
          document.fonts.ready.then(runSync).catch(() => {});
        }
      } else {
        el.textContent = text;
      }
    }

    return {
      MARKER_PATHS,
      MARKER_STROKE_WIDTH_RATIO,
      MARKER_STROKE_HEIGHT_RATIO,
      parseSpeakerKeywordsInput,
      normalizeSpeakerGuideKeywords,
      buildSpeakerGuideMarkerHtml,
      syncMarkerStrokeWidths,
      applySpeakerGuideMarker
    };
  }
);
