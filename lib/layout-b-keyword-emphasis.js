/**
 * Layout B keyword emphasis — strip planning helpers for canvas + DOM.
 */
(function (global) {
  'use strict';
  if (
    global.LayoutBKeywordEmphasis &&
    typeof global.LayoutBKeywordEmphasis.buildTextRunsForLine === 'function'
  ) {
    return;
  }

const LAYOUT_B_EMPHASIS_STYLES = new Set([
  'bold',
  'italic',
  'underline',
  'caps',
  'angle-up',
  'angle-down',
  'scale'
]);

function normalizeLayoutBKeywordEmphasisPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  const styles = Array.isArray(raw.styles)
    ? raw.styles
        .map((s) => String(s).trim().toLowerCase())
        .filter((s) => LAYOUT_B_EMPHASIS_STYLES.has(s))
    : [];
  if (!keywords.length) return null;
  const outStyles = styles.length ? styles : ['bold'];
  return { keywords: keywords.slice(0, 3), styles: outStyles };
}

function normalizeStyleList(styles) {
  const set = new Set(
    (Array.isArray(styles) ? styles : String(styles || '').split(','))
      .map((s) => String(s).trim().toLowerCase())
      .filter((s) => LAYOUT_B_EMPHASIS_STYLES.has(s))
  );
  if (set.has('angle-up') && set.has('angle-down')) set.delete('angle-down');
  return [...set];
}

function emphasisFlagsFromStyles(styles) {
  const set = new Set(normalizeStyleList(styles));
  return {
    bold: set.has('bold'),
    italic: set.has('italic'),
    underline: set.has('underline'),
    caps: set.has('caps'),
    scale: set.has('scale'),
    angleUp: set.has('angle-up'),
    angleDown: set.has('angle-down')
  };
}

function keywordEmphasisNeedsOwnStrip(styles) {
  const f = emphasisFlagsFromStyles(styles);
  return f.scale || f.angleUp || f.angleDown;
}

function displayTextForRun(text, flags) {
  const t = String(text || '');
  return flags.caps ? t.toUpperCase() : t;
}

function layoutBFontForEmphasis(baseFontPx, fontSerif, flags) {
  let px = baseFontPx;
  if (flags.scale) px = Math.round(baseFontPx * 1.2);
  const weight = flags.bold ? 800 : 400;
  const style = flags.italic ? 'italic' : '';
  return `${style} ${weight} ${px}px ${fontSerif}`.replace(/\s+/g, ' ').trim();
}

function layoutBKeywordAngle(dateKey, rank, flags) {
  if (!flags.angleUp && !flags.angleDown) return 0;
  let seed = 2166136261;
  const s = `${dateKey || 'day'}#kw-angle#${rank >= 0 ? rank : 0}`;
  for (let i = 0; i < s.length; i++) seed = Math.imul(seed ^ s.charCodeAt(i), 16777619);
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  const rnd = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  const mag = 0.06 + rnd * 0.05;
  return flags.angleDown ? mag : -mag;
}

function getQuoteKeywordEmphasis() {
  if (typeof globalThis !== 'undefined' && globalThis.QuoteKeywordEmphasis) {
    return globalThis.QuoteKeywordEmphasis;
  }
  try {
    return require('./quote-keyword-emphasis.js');
  } catch (_) {
    return null;
  }
}

function buildTextRunsForLine(line, keywords, styles) {
  const QKE = getQuoteKeywordEmphasis();
  const flags = emphasisFlagsFromStyles(styles);
  if (!QKE || !keywords?.length || typeof QKE.buildLineSegments !== 'function') {
    return [{ text: String(line || ''), bold: false, italic: false, underline: false, caps: false }];
  }
  const segments = stripTrailingPunctAfterEmphasis(QKE.buildLineSegments(line, keywords));
  return segments.map((seg) => {
    if (!seg.emphasis) {
      return { text: seg.text, bold: false, italic: false, underline: false, caps: false };
    }
    return {
      text: displayTextForRun(seg.text, flags),
      bold: flags.bold,
      italic: flags.italic,
      underline: flags.underline,
      caps: flags.caps
    };
  });
}

function lineHasEmphasisRuns(runs) {
  return (runs || []).some((r) => r.bold || r.italic || r.underline || r.caps);
}

/** Drop a trailing `.` or `,` segment when it immediately follows an emphasized keyword. */
function stripTrailingPunctAfterEmphasis(segments) {
  if (!Array.isArray(segments) || !segments.some((s) => s && s.emphasis)) return segments;
  const out = segments.slice();
  while (out.length) {
    const last = out[out.length - 1];
    if (last.emphasis) break;
    const t = String(last.text || '').trim();
    if (/^[.,]+$/.test(t)) out.pop();
    else break;
  }
  return out.length ? out : segments;
}

function dropPlainPunctPartsAfterEmphasis(parts) {
  if (!Array.isArray(parts) || !parts.length) return parts;
  return parts.filter((part, i, arr) => {
    if (part.kind !== 'plain') return true;
    const t = String(part.text || '').trim();
    if (!/^[.,]+$/.test(t)) return true;
    for (let j = i - 1; j >= 0; j--) {
      const prev = arr[j];
      if (prev.kind === 'emphasis-strip' || prev.kind === 'inline-emphasis') return false;
      if (prev.kind === 'plain' && String(prev.text || '').trim()) return true;
    }
    return true;
  });
}

function expandSegmentForKeywordEmphasis(segment, keywords, styles) {
  const QKE = getQuoteKeywordEmphasis();
  const text = String(segment || '');
  if (!text || !QKE || !keywords?.length) return [{ kind: 'plain', text }];
  const lineSegs = stripTrailingPunctAfterEmphasis(QKE.buildLineSegments(text, keywords));
  const needsOwn = keywordEmphasisNeedsOwnStrip(styles);
  const out = [];
  for (const ls of lineSegs) {
    if (!ls.text) continue;
    if (!ls.emphasis) {
      out.push({ kind: 'plain', text: ls.text });
      continue;
    }
    if (needsOwn) out.push({ kind: 'emphasis-strip', text: ls.text, rank: ls.rank });
    else out.push({ kind: 'inline-emphasis', text: ls.text, rank: ls.rank });
  }
  const filtered = dropPlainPunctPartsAfterEmphasis(out);
  return filtered.length ? filtered : [{ kind: 'plain', text }];
}

function measureTextRunsWidth(ctx, runs, baseFontPx, fontSerif, flags) {
  let tw = 0;
  for (const run of runs) {
    const runFlags = {
      bold: run.bold,
      italic: run.italic,
      underline: run.underline,
      caps: run.caps,
      scale: flags?.scale
    };
    ctx.font = layoutBFontForEmphasis(baseFontPx, fontSerif, runFlags);
    tw += ctx.measureText(run.text || '').width;
  }
  return tw;
}

function runsToDisplayLine(runs) {
  return (runs || []).map((r) => r.text || '').join('');
}

function parseFontSizePx(fontString, fallback = 16) {
  const m = /(\d+)px/.exec(String(fontString || ''));
  return m ? parseInt(m[1], 10) : fallback;
}

/** Manual underline Y when canvas textBaseline is 'middle'. */
function layoutBUnderlineYFromMiddle(textMiddleY, fontPx) {
  const px = Math.max(1, Number(fontPx) || 16);
  return textMiddleY + px * 0.44;
}

function renderLayoutBStripInnerHtml(spec) {
  const esc = (t) =>
    String(t || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  if (Array.isArray(spec.textRuns) && spec.textRuns.length) {
    return spec.textRuns
      .map((run) => {
        if (!run.text) return '';
        let inner = esc(run.text);
        const classes = [];
        if (run.underline) classes.push('quote-kw-underline');
        if (run.caps) classes.push('quote-kw-caps');
        if (run.bold) inner = `<strong>${inner}</strong>`;
        if (run.italic) inner = `<em>${inner}</em>`;
        if (classes.length) return `<span class="${classes.join(' ')}">${inner}</span>`;
        return inner;
      })
      .join('');
  }
  const lines = Array.isArray(spec.lines) && spec.lines.length ? spec.lines : [''];
  return lines.map((ln) => esc(ln)).join('<br>');
}

const api = {
  LAYOUT_B_EMPHASIS_STYLES,
  normalizeLayoutBKeywordEmphasisPayload,
  normalizeStyleList,
  emphasisFlagsFromStyles,
  keywordEmphasisNeedsOwnStrip,
  displayTextForRun,
  layoutBFontForEmphasis,
  layoutBKeywordAngle,
  buildTextRunsForLine,
  lineHasEmphasisRuns,
  expandSegmentForKeywordEmphasis,
  measureTextRunsWidth,
  runsToDisplayLine,
  parseFontSizePx,
  layoutBUnderlineYFromMiddle,
  renderLayoutBStripInnerHtml
};

if (global) global.LayoutBKeywordEmphasis = api;
try {
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
} catch (_) {}
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {});
