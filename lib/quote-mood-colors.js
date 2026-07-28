/**
 * Quote mood select → quilt picker hex colors.
 * Browser: globalThis.QuoteMoodColors. Node: require('./lib/quote-mood-colors.js').
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  root.QuoteMoodColors = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /** Short mood name (before em dash) → hex for the daily color-picker suggestion. */
  const MOOD_COLORS = {
    'Quiet Wonder': '#6fa5fc',
    Fierce: '#ff7954',
    Tender: '#cfadf0',
    Steady: '#b8d980',
    'Communal Warmth': '#ffe77d',
    Playful: '#8decfc',
    Rallying: '#fcbd6f'
  };

  /** Retired or legacy mood labels → canonical short name. */
  const MOOD_ALIASES = {
    Bittersweet: 'Tender'
  };

  function moodShortName(label) {
    const text = String(label || '').trim();
    if (!text) return '';
    return text.split('—')[0].split(' - ')[0].trim();
  }

  function resolveQuoteMoodColor(moodLabel) {
    const short = moodShortName(moodLabel);
    if (!short) return null;
    const aliased = MOOD_ALIASES[short] || short;
    const hex = MOOD_COLORS[aliased];
    return hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
  }

  return {
    MOOD_COLORS,
    MOOD_ALIASES,
    moodShortName,
    resolveQuoteMoodColor
  };
});
