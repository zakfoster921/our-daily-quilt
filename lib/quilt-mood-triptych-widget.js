/**
 * Mood triptych: peek quote + two hand-cut squares (icon up) → dismiss → flip for message.
 * Browser: global.QuiltMoodTriptychWidget.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.QuiltMoodTriptychWidget = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function (global) {
  'use strict';

  const STYLE_ID = 'quilt-mood-triptych-widget-styles-v86';
  const DISMISS_MS = 1000;
  const FLIP_MS = 900;
  const REDUCED_DISMISS_MS = 400;
  const REDUCED_FLIP_MS = 320;
  /** Flip runs in parallel with dismiss — total reveal ≈ max(dismiss, flip). */
  const OPEN_START_DELAY_MS = Math.max(DISMISS_MS, FLIP_MS);

  const MOOD_ICONS = {
    good: 'brightness_1',
    rough: 'contrast'
  };

  function resolveTriptychHalftoneUrl() {
    try {
      if (typeof location !== 'undefined' && location.href) {
        return new URL('assets/mood-triptych-halftone.png', location.href).href;
      }
    } catch (_) {
      /* */
    }
    return 'assets/mood-triptych-halftone.png';
  }

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const halftoneUrl = resolveTriptychHalftoneUrl().replace(/"/g, '%22');
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #screen-quilt .quilt-mood-triptych {
        --triptych-halftone-image: url("${halftoneUrl}");
        --triptych-halftone-opacity: 0.5;
        --triptych-scale: 0.85;
        --triptych-mood-scale: 0.9;
        --triptych-gutter: clamp(1.25rem, 8vw, 2.25rem);
        --triptych-quote-gap: clamp(1rem, 5.2vw, 1.55rem);
        --triptych-mood-gap: clamp(0.55rem, 3.2vw, 0.9rem);
        --triptych-dismiss-ms: ${DISMISS_MS}ms;
        --triptych-flip-ms: ${FLIP_MS}ms;
        --triptych-dismiss-ease: cubic-bezier(0.55, 0.06, 0.68, 0.19);
        --triptych-flip-ease: cubic-bezier(0.33, 1, 0.48, 1);
        --triptych-sheet-width: min(
          calc(var(--quilt-float-card-max, 460px) * var(--triptych-scale)),
          calc(100% - (2 * var(--triptych-gutter)))
        );
        --triptych-mood-row-width: calc(var(--triptych-sheet-width) * var(--triptych-mood-scale));
        --triptych-ink: var(--odq-ink-body, rgba(56, 46, 36, 0.78));
        /* Match newspaper clipping PNG + mood-clipping fallback (not raw .quilt-quote-text). */
        --triptych-copy-font: var(
          --quilt-clipping-font,
          var(--quilt-dm-sans-font, 'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif)
        );
        --triptych-copy-ink: var(--quilt-clipping-ink, rgba(42, 34, 28, 0.86));
        --triptych-copy-weight: 400;
        --triptych-message-weight: 500;
        --triptych-copy-tracking: 0.018em;
        --triptych-copy-word-spacing: 0.02em;
        --triptych-copy-line-height: 1.2;
        --triptych-copy-ink-shadow: 0 0 0.32px currentColor;
        --triptych-clipping-halftone: radial-gradient(
          circle at center,
          rgba(32, 24, 18, 0.95) 0.5px,
          transparent 0.52px
        );
        --triptych-clipping-grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
        --triptych-font: var(--triptych-copy-font);
        --triptych-body-size: var(--quilt-quote-copy-size, clamp(1.044rem, 4.32vw, 1.728rem));
        /* Rumi / quilt palette — warm coral + dusty blue (vintage newsbox fills). */
        --triptych-good-fill: var(--quilt-mood-good-fill, #df9368);
        --triptych-rough-fill: var(--quilt-mood-rough-fill, #7eb0c8);
        --triptych-paper-fill: var(--quilt-paper-card-fallback, var(--odq-paper-artifact, #f6f4f1));
        --triptych-pad-top: 1.5px;
        --triptych-pad-right: 1.5px;
        --triptych-pad-bottom: 1.5px;
        --triptych-pad-left: 1.5px;
        --triptych-vintage-ink: var(--odq-ink-frame, #1a1410);
        --triptych-vintage-border: clamp(12px, 3.36vw, 19.2px);
        --triptych-bleed-top: 0px;
        --triptych-bleed-right: 0px;
        --triptych-bleed-bottom: 0px;
        --triptych-bleed-left: 0px;
        --triptych-article-inset-top: calc(
          var(--triptych-pad-top) + var(--triptych-vintage-border) -
          min(var(--triptych-bleed-top, 0px), var(--triptych-vintage-border))
        );
        --triptych-article-inset-right: calc(
          var(--triptych-pad-right) + var(--triptych-vintage-border) -
          min(var(--triptych-bleed-right, 0px), var(--triptych-vintage-border))
        );
        --triptych-article-inset-bottom: calc(
          var(--triptych-pad-bottom) + var(--triptych-vintage-border) -
          min(var(--triptych-bleed-bottom, 0px), var(--triptych-vintage-border))
        );
        --triptych-article-inset-left: calc(
          var(--triptych-pad-left) + var(--triptych-vintage-border) -
          min(var(--triptych-bleed-left, 0px), var(--triptych-vintage-border))
        );
        --triptych-mark-font: 'Barlow Condensed', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
        --triptych-mark-size: clamp(2.1rem, 7.6vw, 2.84rem);
        --triptych-mark-tilt: 3.2deg;
        --triptych-copy-pad-y: clamp(0.1rem, 1.2vw, 0.26rem);
        --triptych-copy-pad-x: clamp(0.28rem, 3.2vw, 0.55rem);
        --triptych-card-shadow:
          drop-shadow(0 8px 18px rgba(26, 20, 16, 0.16))
          drop-shadow(0 2px 6px rgba(26, 20, 16, 0.1));
        width: 100%;
        max-width: 100%;
        margin: 0 auto;
        padding: 0;
        box-sizing: border-box;
        position: relative;
        z-index: 5;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--triptych-quote-gap);
      }

      #screen-quilt .quilt-mood-triptych[hidden] {
        display: none !important;
      }

      #screen-quilt .quilt-mood-triptych__quote {
        width: var(--triptych-sheet-width);
        max-width: 100%;
        flex-shrink: 0;
        position: relative;
        z-index: 2;
        pointer-events: none;
      }

      /* Shadow on wrapper — filter on <img> softens PNG type in WebKit. */
      #screen-quilt .quilt-mood-triptych__quote-shadow {
        width: 100%;
        max-width: 100%;
        transform: rotate(-0.6deg);
        transform-origin: center center;
        filter: var(
          --odq-artifact-shadow,
          drop-shadow(0 4px 14px rgba(45, 36, 29, 0.14))
            drop-shadow(0 1px 3px rgba(45, 36, 29, 0.1))
            drop-shadow(0 8px 20px rgba(28, 32, 42, 0.06))
        );
      }

      #screen-quilt .quilt-mood-triptych__quote-img {
        display: block;
        width: 100%;
        height: auto;
        margin: 0;
        user-select: none;
        -webkit-user-drag: none;
        filter: none;
        image-rendering: auto;
      }

      #screen-quilt .quilt-mood-triptych__row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--triptych-mood-gap);
        width: var(--triptych-mood-row-width);
        max-width: 100%;
        margin: 0;
        position: relative;
        z-index: 1;
        overflow: visible;
        align-items: start;
      }

      #screen-quilt .quote-card-stack:has(.quilt-mood-triptych.is-dismiss-sliding) {
        overflow: visible;
      }

      #screen-quilt .quilt-mood-triptych.is-dismiss-sliding,
      #screen-quilt .quilt-mood-triptych.is-dismiss-sliding .quilt-mood-triptych__row {
        overflow: visible;
      }

      #screen-quilt .quilt-mood-triptych.is-good.is-dismiss-sliding .quilt-mood-triptych__row::after,
      #screen-quilt .quilt-mood-triptych.is-rough.is-dismiss-sliding .quilt-mood-triptych__row::after {
        content: '';
        display: block;
        width: 100%;
        height: var(--triptych-row-h, auto);
        min-height: var(--triptych-row-h, auto);
        pointer-events: none;
        visibility: hidden;
      }

      #screen-quilt .quilt-mood-triptych.is-good.is-dismiss-sliding .quilt-mood-triptych__row::after {
        grid-column: 2;
      }

      #screen-quilt .quilt-mood-triptych.is-rough.is-dismiss-sliding .quilt-mood-triptych__row::after {
        grid-column: 1;
      }

      #screen-quilt .quilt-mood-triptych.is-good.is-dismiss-sliding .quilt-mood-triptych__card--good.is-chosen {
        grid-column: 1;
      }

      #screen-quilt .quilt-mood-triptych.is-rough.is-dismiss-sliding .quilt-mood-triptych__card--rough.is-chosen {
        grid-column: 2;
      }

      #screen-quilt .quilt-mood-triptych__card {
        appearance: none;
        -webkit-appearance: none;
        margin: 0;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        position: relative;
        display: block;
        width: 100%;
        height: var(--triptych-cell-h, auto);
        min-height: var(--triptych-cell-h, auto);
        overflow: visible;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        box-sizing: border-box;
        perspective: 920px;
        -webkit-perspective: 920px;
        transform: rotate(var(--triptych-card-tilt, 0deg));
        transform-origin: center center;
      }

      #screen-quilt .quilt-mood-triptych__card--good {
        z-index: 2;
        --triptych-card-tilt: -1.6deg;
      }

      #screen-quilt .quilt-mood-triptych__card--rough {
        z-index: 1;
        --triptych-card-tilt: 1.3deg;
      }

      #screen-quilt .quilt-mood-triptych__card.is-chosen {
        z-index: 6;
      }

      #screen-quilt .quilt-mood-triptych.is-dismiss-sliding .quilt-mood-triptych__card.is-chosen {
        transition: none;
      }

      #screen-quilt .quilt-mood-triptych__flip {
        position: absolute;
        inset: 0;
        transform-style: preserve-3d;
        -webkit-transform-style: preserve-3d;
        transform: rotateY(0deg);
        transition: transform var(--triptych-flip-ms) var(--triptych-flip-ease);
      }

      #screen-quilt .quilt-mood-triptych.is-instant .quilt-mood-triptych__flip {
        transition: none;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__flip {
        transform: rotateY(180deg);
      }

      #screen-quilt .quilt-mood-triptych__face {
        position: absolute;
        inset: 0;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        box-sizing: border-box;
        background-color: var(--triptych-paper-fill);
        background-image: var(--quilt-paper-surface-image);
        background-size: 100% 100%, 100% 100%, 100% 100%;
        background-position: center;
        background-repeat: no-repeat;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        overflow: hidden;
      }

      #screen-quilt .quilt-mood-triptych__card--good .quilt-mood-triptych__face {
        --triptych-card-face-fill: var(--triptych-good-fill);
      }

      #screen-quilt .quilt-mood-triptych__card--rough .quilt-mood-triptych__face {
        --triptych-card-face-fill: var(--triptych-rough-fill);
      }

      /* Bold article color fill with heavy print border. */
      #screen-quilt .quilt-mood-triptych__face::after {
        content: '';
        position: absolute;
        top: calc(var(--triptych-pad-top) - var(--triptych-bleed-top, 0px));
        right: calc(var(--triptych-pad-right) - var(--triptych-bleed-right, 0px));
        bottom: calc(var(--triptych-pad-bottom) - var(--triptych-bleed-bottom, 0px));
        left: calc(var(--triptych-pad-left) - var(--triptych-bleed-left, 0px));
        background-color: var(--triptych-card-face-fill, var(--triptych-good-fill));
        background-image: none;
        border: var(--triptych-vintage-border) solid var(--triptych-vintage-ink);
        box-sizing: border-box;
        pointer-events: none;
        z-index: 1;
      }

      #screen-quilt .quilt-mood-triptych__face::before {
        content: '';
        position: absolute;
        top: calc(var(--triptych-pad-top) - var(--triptych-bleed-top, 0px));
        right: calc(var(--triptych-pad-right) - var(--triptych-bleed-right, 0px));
        bottom: calc(var(--triptych-pad-bottom) - var(--triptych-bleed-bottom, 0px));
        left: calc(var(--triptych-pad-left) - var(--triptych-bleed-left, 0px));
        box-sizing: border-box;
        pointer-events: none;
        z-index: 2;
      }

      /* HERE / NOW — halftone veil over fill (semi-transparent; no tile repeat). */
      #screen-quilt .quilt-mood-triptych__face--front::before {
        background-image: var(--triptych-halftone-image);
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        mix-blend-mode: multiply;
        opacity: var(--triptych-halftone-opacity, 0.5);
      }

      #screen-quilt .quilt-mood-triptych__face--back::before {
        background-image: var(--quilt-paper-surface-image);
        background-size: 100% 100%, 100% 100%, 100% 100%;
        background-position: center;
        background-repeat: no-repeat;
        opacity: 0.12;
      }

      #screen-quilt .quilt-mood-triptych__face--front {
        transform: rotateY(0deg) translateZ(0.1px);
      }

      #screen-quilt .quilt-mood-triptych__face--back {
        transform: rotateY(180deg) translateZ(0.1px);
      }

      #screen-quilt .quilt-mood-triptych__front-mark,
      #screen-quilt .quilt-mood-triptych__message {
        isolation: isolate;
      }

      #screen-quilt .quilt-mood-triptych__front-mark {
        position: absolute;
        top: var(--triptych-article-inset-top);
        right: var(--triptych-article-inset-right);
        bottom: var(--triptych-article-inset-bottom);
        left: var(--triptych-article-inset-left);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: clamp(0.12rem, 1.1vw, 0.32rem);
        margin: 0;
        padding: var(--triptych-copy-pad-y) var(--triptych-copy-pad-x);
        box-sizing: border-box;
        text-align: center;
        z-index: 4;
      }

      #screen-quilt .quilt-mood-triptych__mark-label {
        position: relative;
        z-index: 1;
        font-family: var(--triptych-mark-font);
        font-size: var(--triptych-mark-size);
        font-style: italic;
        font-weight: 400;
        line-height: 1;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--triptych-vintage-ink);
        text-shadow: var(--triptych-copy-ink-shadow);
        transform-origin: center center;
      }

      #screen-quilt .quilt-mood-triptych__mark-label--here {
        transform: rotate(calc(-1 * var(--triptych-mark-tilt)));
      }

      #screen-quilt .quilt-mood-triptych__mark-label--now {
        transform: rotate(var(--triptych-mark-tilt));
      }

      #screen-quilt .quilt-mood-triptych__icon-symbol {
        position: relative;
        z-index: 1;
        font-family: 'Material Symbols Outlined';
        font-variation-settings: 'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 96;
        font-feature-settings: 'liga';
        font-size: clamp(3.7rem, 13.6vw, 4.9rem);
        font-style: normal;
        line-height: 1;
        color: var(--triptych-vintage-ink);
        text-shadow: var(--triptych-copy-ink-shadow);
      }

      #screen-quilt .quilt-mood-triptych__front-mark--measure {
        position: absolute;
        left: -10000px;
        top: 0;
        visibility: hidden;
        pointer-events: none;
        inset: auto;
        height: auto;
        z-index: 0;
      }

      #screen-quilt .quilt-mood-triptych__message {
        position: absolute;
        top: var(--triptych-article-inset-top);
        right: var(--triptych-article-inset-right);
        bottom: var(--triptych-article-inset-bottom);
        left: var(--triptych-article-inset-left);
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        margin: 0;
        padding: var(--triptych-copy-pad-y) var(--triptych-copy-pad-x);
        z-index: 4;
        width: auto;
        min-width: 0;
        max-width: none;
        min-height: 0;
        overflow: hidden;
        font-family: var(--triptych-copy-font);
        font-size: var(--triptych-body-size);
        font-style: normal;
        font-weight: var(--triptych-message-weight, 500);
        line-height: var(--triptych-copy-line-height);
        text-align: center;
        text-wrap: balance;
        color: var(--triptych-copy-ink);
        letter-spacing: var(--triptych-copy-tracking);
        word-spacing: var(--triptych-copy-word-spacing);
        text-shadow: var(--triptych-copy-ink-shadow);
        filter: none;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        white-space: normal;
        word-break: normal;
        overflow-wrap: break-word;
        hyphens: none;
        -webkit-hyphens: none;
      }

      /* Same halftone + grain stack baked into quote/mood clipping PNGs (front + back). */
      #screen-quilt .quilt-mood-triptych__front-mark::before,
      #screen-quilt .quilt-mood-triptych__message::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -2;
        pointer-events: none;
        opacity: 0.11;
        mix-blend-mode: multiply;
        background-image: var(--triptych-clipping-grain);
        background-size: 140px 140px;
        background-repeat: repeat;
      }

      #screen-quilt .quilt-mood-triptych__front-mark::after,
      #screen-quilt .quilt-mood-triptych__message::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        opacity: 0.062;
        mix-blend-mode: multiply;
        background-image: var(--triptych-clipping-halftone);
        background-size: 3.25px 3.25px;
        background-position: 0.4px 0.2px;
        background-repeat: repeat;
      }

      #screen-quilt .quilt-mood-triptych__metric-probe {
        position: absolute;
        left: -10000px;
        top: 0;
        width: 0;
        height: 0;
        visibility: hidden;
        pointer-events: none;
        box-sizing: border-box;
        padding: 3px;
        border: var(--triptych-vintage-border) solid transparent;
      }

      #screen-quilt .quilt-mood-triptych__message--measure {
        position: absolute;
        left: -10000px;
        top: 0;
        visibility: hidden;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
        inset: auto;
        height: auto;
        max-height: none;
        z-index: 0;
      }

      #screen-quilt .quilt-mood-triptych__card.is-dismissed {
        position: absolute;
        top: 0;
        width: calc((100% - var(--triptych-mood-gap)) / 2);
        height: var(--triptych-cell-h, 100%);
        pointer-events: none;
        z-index: 1;
        opacity: 1;
        visibility: visible;
        transition: transform var(--triptych-dismiss-ms) var(--triptych-dismiss-ease);
      }

      #screen-quilt .quilt-mood-triptych__card--good.is-dismissed {
        left: 0;
        transform: rotate(var(--triptych-card-tilt, 0deg)) translateX(calc(-100% - 55vw));
      }

      #screen-quilt .quilt-mood-triptych__card--rough.is-dismissed {
        right: 0;
        left: auto;
        transform: rotate(var(--triptych-card-tilt, 0deg)) translateX(calc(100% + 55vw));
      }

      #screen-quilt .quilt-mood-triptych__card.is-dismissed.is-dismissed-gone {
        visibility: hidden;
        transition: none;
      }

      /* Chosen card keeps its half-column slot — flip only, no expand to full row. */
      #screen-quilt .quilt-mood-triptych.is-good .quilt-mood-triptych__card--good.is-chosen {
        grid-column: 1;
      }

      #screen-quilt .quilt-mood-triptych.is-rough .quilt-mood-triptych__card--rough.is-chosen {
        grid-column: 2;
      }

      #screen-quilt .quilt-mood-triptych__card:focus-visible {
        outline: 2px solid rgba(0, 0, 0, 0.35);
        outline-offset: 2px;
      }

      #screen-quilt .quilt-mood-triptych__reset {
        position: absolute;
        top: 0.4rem;
        right: 0.4rem;
        z-index: 20;
        width: 1.65rem;
        height: 1.65rem;
        margin: 0;
        padding: 0;
        border: 2px solid var(--triptych-vintage-ink);
        border-radius: 0;
        background: rgba(255, 252, 246, 0.94);
        color: var(--triptych-vintage-ink);
        font-size: 1.1rem;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transition: opacity 160ms ease;
        -webkit-tap-highlight-color: transparent;
        box-shadow: 2px 2px 0 rgba(26, 20, 16, 0.22);
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__reset {
        opacity: 1;
        pointer-events: auto;
      }

      #screen-quilt .quilt-mood-triptych__reset:focus-visible {
        outline: 2px solid rgba(0, 0, 0, 0.35);
        outline-offset: 1px;
      }

      @media (prefers-reduced-motion: reduce) {
        #screen-quilt .quilt-mood-triptych {
          --triptych-dismiss-ms: ${REDUCED_DISMISS_MS}ms;
          --triptych-flip-ms: ${REDUCED_FLIP_MS}ms;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function prefersReducedMotion() {
    if (typeof global.matchMedia !== 'function') return false;
    return global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function buildCard(mood, message, iconName) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `quilt-mood-triptych__card quilt-mood-triptych__card--${mood}`;
    btn.dataset.mood = mood;
    btn.setAttribute(
      'aria-label',
      mood === 'good' ? 'Show good-day message' : 'Show rough-day message'
    );
    btn.setAttribute('aria-expanded', 'false');

    const flip = document.createElement('div');
    flip.className = 'quilt-mood-triptych__flip';

    const faceFront = document.createElement('div');
    faceFront.className = 'quilt-mood-triptych__face quilt-mood-triptych__face--front';

    const frontMark = document.createElement('div');
    frontMark.className = 'quilt-mood-triptych__front-mark';

    const labelHere = document.createElement('span');
    labelHere.className = 'quilt-mood-triptych__mark-label quilt-mood-triptych__mark-label--here';
    labelHere.textContent = 'HERE';

    const iconSymbol = document.createElement('span');
    iconSymbol.className = 'quilt-mood-triptych__icon-symbol';
    iconSymbol.setAttribute('aria-hidden', 'true');
    iconSymbol.textContent = iconName;

    const labelNow = document.createElement('span');
    labelNow.className = 'quilt-mood-triptych__mark-label quilt-mood-triptych__mark-label--now';
    labelNow.textContent = 'NOW';

    frontMark.append(labelHere, iconSymbol, labelNow);
    faceFront.append(frontMark);

    const faceBack = document.createElement('div');
    faceBack.className = 'quilt-mood-triptych__face quilt-mood-triptych__face--back';

    const messageEl = document.createElement('div');
    messageEl.className = 'quilt-mood-triptych__message';
    messageEl.textContent = message;
    faceBack.append(messageEl);

    flip.append(faceFront, faceBack);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'quilt-mood-triptych__reset';
    resetBtn.setAttribute('aria-label', 'Choose again');
    resetBtn.textContent = '\u00d7';

    btn.append(flip, resetBtn);
    return { btn, flip, resetBtn, messageEl };
  }

  function seededRandomFrom(seed) {
    let s = seed >>> 0;
    return function next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function applyArticleOffset(cardBtn, dateKey, mood) {
    const QNC = global.QuiltNewspaperClipping;
    const seed = QNC?.hashDateKeySeed?.(`${dateKey}:triptych-pad:${mood}`) ?? 0;
    const rand = seededRandomFrom(seed);
    const thin = 1.5;
    const spread = 4;
    cardBtn.style.setProperty('--triptych-pad-top', `${thin + Math.round(rand() * spread)}px`);
    cardBtn.style.setProperty('--triptych-pad-right', `${thin + Math.round(rand() * spread)}px`);
    cardBtn.style.setProperty('--triptych-pad-bottom', `${thin + Math.round(rand() * spread)}px`);
    cardBtn.style.setProperty('--triptych-pad-left', `${thin + Math.round(rand() * spread)}px`);
  }

  function readTriptychPadPx(cardBtn, side) {
    const raw = getComputedStyle(cardBtn).getPropertyValue(`--triptych-pad-${side}`);
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : 3;
  }

  /** Nibble the paper margin on ≥1 side; keep most of the ink border visible. */
  function applyHandCutBorderBleed(cardBtn, dateKey, mood) {
    const QNC = global.QuiltNewspaperClipping;
    const seed = QNC?.hashDateKeySeed?.(`${dateKey}:triptych-bleed:${mood}`) ?? 0;
    const rand = seededRandomFrom(seed);
    const sides = ['top', 'right', 'bottom', 'left'];
    const bleed = { top: 0, right: 0, bottom: 0, left: 0 };

    const bleedForSide = (side) => {
      const pad = readTriptychPadPx(cardBtn, side);
      return Math.min(pad + 0.5 + rand() * 2.2, 8);
    };

    let primaryIdx = Math.floor(rand() * 4);
    if (mood === 'good' && rand() > 0.28) primaryIdx = 3;
    if (mood === 'rough' && rand() > 0.28) primaryIdx = 1;
    const primary = sides[primaryIdx];
    bleed[primary] = bleedForSide(primary);

    if (rand() > 0.38) {
      let secondaryIdx = Math.floor(rand() * 4);
      while (secondaryIdx === primaryIdx) secondaryIdx = (secondaryIdx + 1) % 4;
      const secondary = sides[secondaryIdx];
      bleed[secondary] = bleedForSide(secondary) * (0.55 + rand() * 0.25);
    }

    let cropEdge = primary;
    let cropAmount = bleed[primary];
    sides.forEach((side) => {
      if (bleed[side] > cropAmount) {
        cropEdge = side;
        cropAmount = bleed[side];
      }
    });

    sides.forEach((side) => {
      const px = bleed[side] > 0 ? `${Math.round(bleed[side] * 10) / 10}px` : '0px';
      cardBtn.style.setProperty(`--triptych-bleed-${side}`, px);
    });
    if (cropEdge) cardBtn.dataset.triptychCropEdge = cropEdge;
    else delete cardBtn.dataset.triptychCropEdge;
  }

  function applyHandCutClips(cards, dateKey) {
    const QNC = global.QuiltNewspaperClipping;
    if (!QNC?.buildHandCutCssClipPath) return;
    cards.forEach((card) => {
      const faces = card.querySelectorAll('.quilt-mood-triptych__face');
      if (!faces.length) return;
      const rect = card.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w < 8 || h < 8) return;
      const mood = card.dataset.mood;
      const cropEdge = String(card.dataset.triptychCropEdge || '').trim();
      const clip = QNC.buildHandCutCssClipPath(w, h, `${dateKey}:triptych:${mood}`, {
        handCutProfile: 'moodTriptych',
        handCutMacroDomPx: 16,
        handCutCornerChamferDomPx: 14,
        moodTriptychCropEdge: cropEdge
      });
      faces.forEach((face) => {
        if (!clip) {
          face.style.clipPath = '';
          face.style.webkitClipPath = '';
          return;
        }
        face.style.clipPath = clip;
        face.style.webkitClipPath = clip;
      });
    });
  }

  /**
   * @param {HTMLElement} host
   * @param {{
   *   quoteDataUrl: string,
   *   goodDay: string,
   *   roughDay: string,
   *   dateKey?: string,
   *   initialMood?: 'good'|'rough'|null,
   *   instant?: boolean,
   *   onSelect?: (mood: 'good'|'rough') => void,
   *   onReady?: () => void,
   *   onPanelChange?: (mood: 'good'|'rough'|null) => void
   * }} opts
   */
  function mount(host, opts = {}) {
    if (!host) return null;
    injectStyles();

    const halftoneCss = `url("${resolveTriptychHalftoneUrl()}")`;
    host.style.setProperty('--triptych-halftone-image', halftoneCss);
    document.getElementById('screen-quilt')?.style.setProperty('--triptych-halftone-image', halftoneCss);

    const quoteDataUrl = String(opts.quoteDataUrl || '').trim();
    const goodDay = String(opts.goodDay || '').trim();
    const roughDay = String(opts.roughDay || '').trim();
    const dateKey = String(opts.dateKey || '').trim();
    if (!quoteDataUrl || !goodDay || !roughDay) return null;

    host.innerHTML = '';
    host.className = 'quilt-mood-triptych';
    host.dataset.panel = 'idle';
    host.removeAttribute('hidden');
    host.classList.remove('is-ready', 'is-good', 'is-rough', 'is-open', 'is-dismiss-sliding', 'is-instant');

    const quoteWrap = document.createElement('div');
    quoteWrap.className = 'quilt-mood-triptych__quote';

    const quoteShadow = document.createElement('div');
    quoteShadow.className = 'quilt-mood-triptych__quote-shadow';

    const quoteImg = document.createElement('img');
    quoteImg.className = 'quilt-mood-triptych__quote-img';
    quoteImg.alt = "Today's quote";
    quoteImg.decoding = 'sync';
    quoteImg.draggable = false;
    quoteShadow.appendChild(quoteImg);
    quoteWrap.appendChild(quoteShadow);

    const row = document.createElement('div');
    row.className = 'quilt-mood-triptych__row';

    const cardGood = buildCard('good', goodDay, MOOD_ICONS.good);
    const cardRough = buildCard('rough', roughDay, MOOD_ICONS.rough);
    row.append(cardGood.btn, cardRough.btn);

    const metricProbe = document.createElement('div');
    metricProbe.className = 'quilt-mood-triptych__metric-probe';
    metricProbe.setAttribute('aria-hidden', 'true');

    const messageMeasure = document.createElement('div');
    messageMeasure.className = 'quilt-mood-triptych__message quilt-mood-triptych__message--measure';
    messageMeasure.setAttribute('aria-hidden', 'true');

    const frontMarkMeasure = document.createElement('div');
    frontMarkMeasure.className = 'quilt-mood-triptych__front-mark quilt-mood-triptych__front-mark--measure';
    frontMarkMeasure.setAttribute('aria-hidden', 'true');
    frontMarkMeasure.innerHTML =
      '<span class="quilt-mood-triptych__mark-label quilt-mood-triptych__mark-label--here">HERE</span>' +
      `<span class="quilt-mood-triptych__icon-symbol">${MOOD_ICONS.good}</span>` +
      '<span class="quilt-mood-triptych__mark-label quilt-mood-triptych__mark-label--now">NOW</span>';

    host.append(quoteWrap, row, metricProbe, messageMeasure, frontMarkMeasure);
    host.setAttribute('hidden', 'hidden');
    host.setAttribute('aria-hidden', 'true');

    let mood = null;
    let pickPhase = 'idle';
    let animating = false;
    let animationTimers = [];
    let dismissTransitionListener = null;
    let flipTransitionListener = null;
    let remeasureRaf = null;
    let resizeObserver = null;
    let readyNotified = false;
    let initialMoodApplied = false;
    let reducedMotion = prefersReducedMotion();

    function clearAnimationTimers() {
      animationTimers.forEach((id) => global.clearTimeout(id));
      animationTimers = [];
    }

    function clearDismissTransitionListener() {
      if (!dismissTransitionListener) return;
      cardGood.btn.removeEventListener('transitionend', dismissTransitionListener);
      cardRough.btn.removeEventListener('transitionend', dismissTransitionListener);
      dismissTransitionListener = null;
    }

    function clearFlipTransitionListener() {
      if (!flipTransitionListener) return;
      cardGood.flip.removeEventListener('transitionend', flipTransitionListener);
      cardRough.flip.removeEventListener('transitionend', flipTransitionListener);
      flipTransitionListener = null;
    }

    function scheduleAnimation(fn, delayMs) {
      const id = global.setTimeout(fn, delayMs);
      animationTimers.push(id);
      return id;
    }

    function moodUiSettled(next) {
      return mood === next && pickPhase === 'open';
    }

    function clearPickVisualState() {
      cardGood.btn.classList.remove('is-dismissed', 'is-dismissed-gone');
      cardRough.btn.classList.remove('is-dismissed', 'is-dismissed-gone');
      host.classList.remove('is-dismiss-sliding', 'is-open');
      pickPhase = 'idle';
    }

    function notifyReadyOnce() {
      if (readyNotified || !host.classList.contains('is-ready')) return;
      readyNotified = true;
      opts.onReady?.();
    }

    function syncVisibility() {
      const quoteReady = quoteImg.naturalWidth > 0 && quoteImg.naturalHeight > 0;
      if (quoteReady) {
        host.classList.add('is-ready');
        host.removeAttribute('hidden');
        host.removeAttribute('aria-hidden');
        notifyReadyOnce();
      } else {
        host.classList.remove('is-ready');
        host.setAttribute('hidden', 'hidden');
        host.setAttribute('aria-hidden', 'true');
      }
    }

    function applyMoodClasses() {
      host.classList.toggle('is-good', mood === 'good');
      host.classList.toggle('is-rough', mood === 'rough');
      host.dataset.panel = pickPhase === 'open' && mood ? mood : (mood ? 'pending' : 'idle');
      cardGood.btn.classList.toggle('is-chosen', mood === 'good');
      cardRough.btn.classList.toggle('is-chosen', mood === 'rough');
      const expanded = pickPhase === 'open';
      cardGood.btn.setAttribute('aria-expanded', mood === 'good' && expanded ? 'true' : 'false');
      cardRough.btn.setAttribute('aria-expanded', mood === 'rough' && expanded ? 'true' : 'false');
      opts.onPanelChange?.(mood);
    }

    function readArticleInsets(cardBtn) {
      const cs = getComputedStyle(cardBtn);
      const probeCs = getComputedStyle(metricProbe);
      return {
        top: parseFloat(cs.getPropertyValue('--triptych-pad-top')) || 1.5,
        right: parseFloat(cs.getPropertyValue('--triptych-pad-right')) || 1.5,
        bottom: parseFloat(cs.getPropertyValue('--triptych-pad-bottom')) || 1.5,
        left: parseFloat(cs.getPropertyValue('--triptych-pad-left')) || 1.5,
        border: parseFloat(probeCs.borderTopWidth) || 0
      };
    }

    function measureMessageHeight(text, articleWidthPx) {
      messageMeasure.textContent = text;
      messageMeasure.style.width = `${Math.max(1, Math.round(articleWidthPx))}px`;
      return Math.ceil(messageMeasure.getBoundingClientRect().height);
    }

    function measureFrontMarkHeight(articleWidthPx) {
      frontMarkMeasure.style.width = `${Math.max(1, Math.round(articleWidthPx))}px`;
      return Math.ceil(frontMarkMeasure.getBoundingClientRect().height);
    }

    function cellHeightForCard(cardBtn, cardWidthPx, messageText) {
      const pad = readArticleInsets(cardBtn);
      const articleW = Math.max(1, cardWidthPx - pad.left - pad.right - 2 * pad.border);
      const messageH = measureMessageHeight(messageText, articleW);
      const frontMarkH = measureFrontMarkHeight(articleW);
      const articleH = Math.max(messageH, frontMarkH);
      return Math.ceil(pad.top + pad.bottom + 2 * pad.border + articleH + 2);
    }

    function syncCardHeights(cardWidthPx) {
      const goodH = cellHeightForCard(cardGood.btn, cardWidthPx, goodDay);
      const roughH = cellHeightForCard(cardRough.btn, cardWidthPx, roughDay);
      const goodPx = `${goodH}px`;
      const roughPx = `${roughH}px`;
      if (cardGood.btn.style.getPropertyValue('--triptych-cell-h') !== goodPx) {
        cardGood.btn.style.setProperty('--triptych-cell-h', goodPx);
      }
      if (cardRough.btn.style.getPropertyValue('--triptych-cell-h') !== roughPx) {
        cardRough.btn.style.setProperty('--triptych-cell-h', roughPx);
      }
      const rowPx = `${Math.max(goodH, roughH)}px`;
      if (host.style.getPropertyValue('--triptych-row-h') !== rowPx) {
        host.style.setProperty('--triptych-row-h', rowPx);
      }
    }

    function syncArticleLayout() {
      applyArticleOffset(cardGood.btn, dateKey, 'good');
      applyArticleOffset(cardRough.btn, dateKey, 'rough');
      applyHandCutBorderBleed(cardGood.btn, dateKey, 'good');
      applyHandCutBorderBleed(cardRough.btn, dateKey, 'rough');
    }

    function syncSheetMetrics() {
      const rowW = row.getBoundingClientRect().width;
      if (rowW < 48) return;
      const rowStyle = getComputedStyle(row);
      const gap = parseFloat(rowStyle.columnGap || rowStyle.gap) || 0;
      const cardW = Math.max(48, Math.round((rowW - gap) / 2));
      syncCardHeights(cardW);
    }

    function remeasure() {
      if (remeasureRaf != null) return;
      remeasureRaf = requestAnimationFrame(() => {
        remeasureRaf = null;
        syncArticleLayout();
        syncSheetMetrics();
        requestAnimationFrame(() => {
          syncArticleLayout();
          syncSheetMetrics();
          applyHandCutClips([cardGood.btn, cardRough.btn], dateKey);
          tryApplyInitialMood();
        });
      });
    }

    function tryApplyInitialMood() {
      if (initialMoodApplied) return;
      if (opts.initialMood !== 'good' && opts.initialMood !== 'rough') return;
      const cardW = cardGood.btn.getBoundingClientRect().width;
      if (cardW < 48 || !host.classList.contains('is-ready')) return;
      initialMoodApplied = true;
      openMood(opts.initialMood, { instant: !!opts.instant, fromUser: false });
    }

    function finishPick(fromUser) {
      animating = false;
      pickPhase = 'open';
      host.classList.add('is-open');
      applyMoodClasses();
      remeasure();
      if (fromUser) opts.onSelect?.(mood);
    }

    function openMood(next, { instant = false, fromUser = false } = {}) {
      if (next !== 'good' && next !== 'rough') return;
      if (moodUiSettled(next)) return;
      if (animating) return;

      clearAnimationTimers();
      clearDismissTransitionListener();
      clearFlipTransitionListener();
      clearPickVisualState();

      mood = next;
      const sibling = next === 'good' ? cardRough.btn : cardGood.btn;
      const chosen = next === 'good' ? cardGood : cardRough;

      if (instant) {
        host.classList.add('is-instant');
        sibling.classList.add('is-dismissed', 'is-dismissed-gone');
        applyMoodClasses();
        remeasure();
        finishPick(fromUser);
        requestAnimationFrame(() => host.classList.remove('is-instant'));
        return;
      }

      animating = true;
      pickPhase = 'dismissing';
      applyMoodClasses();

      const dismissMs = reducedMotion ? REDUCED_DISMISS_MS : DISMISS_MS;
      const flipMs = reducedMotion ? REDUCED_FLIP_MS : FLIP_MS;
      let flipStarted = false;
      let dismissDone = false;
      let flipDone = false;

      function maybeFinishPick() {
        if (!dismissDone || !flipDone) return;
        clearDismissTransitionListener();
        host.classList.remove('is-dismiss-sliding');
        sibling.classList.add('is-dismissed-gone');
        finishPick(fromUser);
      }

      function startFlipPhase() {
        if (flipStarted) return;
        flipStarted = true;
        pickPhase = 'flipping';

        requestAnimationFrame(() => {
          void chosen.flip.offsetWidth;
          host.classList.add('is-open');
          applyMoodClasses();
          remeasure();

          function onFlipTransitionEnd(e) {
            if (e.target !== chosen.flip) return;
            if (e.propertyName !== 'transform') return;
            clearFlipTransitionListener();
            flipDone = true;
            maybeFinishPick();
          }

          clearFlipTransitionListener();
          flipTransitionListener = onFlipTransitionEnd;
          chosen.flip.addEventListener('transitionend', flipTransitionListener);
          scheduleAnimation(() => {
            clearFlipTransitionListener();
            flipDone = true;
            maybeFinishPick();
          }, flipMs + 80);
        });
      }

      function onDismissTransitionEnd(e) {
        if (e.target !== sibling) return;
        if (e.propertyName !== 'transform') return;
        dismissDone = true;
        maybeFinishPick();
      }

      function beginPickAnimation() {
        dismissDone = false;
        flipDone = false;
        flipStarted = false;

        host.classList.add('is-dismiss-sliding');
        void sibling.offsetWidth;
        sibling.classList.add('is-dismissed');

        dismissTransitionListener = onDismissTransitionEnd;
        sibling.addEventListener('transitionend', dismissTransitionListener);
        scheduleAnimation(() => {
          dismissDone = true;
          maybeFinishPick();
        }, dismissMs + 80);

        startFlipPhase();
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(beginPickAnimation);
      });
    }

    function resetMood({ instant = false } = {}) {
      if (!mood && !host.classList.contains('is-open')) return;
      if (animating) return;

      clearAnimationTimers();
      clearDismissTransitionListener();
      clearFlipTransitionListener();
      const prev = mood;
      mood = null;
      pickPhase = 'idle';
      animating = !instant;

      cardGood.btn.classList.remove('is-chosen', 'is-dismissed', 'is-dismissed-gone');
      cardRough.btn.classList.remove('is-chosen', 'is-dismissed', 'is-dismissed-gone');
      host.classList.remove('is-good', 'is-rough', 'is-open', 'is-dismiss-sliding');

      if (instant) {
        host.classList.add('is-instant');
        applyMoodClasses();
        remeasure();
        host.classList.remove('is-instant');
        animating = false;
        return;
      }

      applyMoodClasses();
      scheduleAnimation(() => {
        animating = false;
        remeasure();
        if (prev) opts.onPanelChange?.(null);
      }, reducedMotion ? REDUCED_DISMISS_MS : DISMISS_MS);
    }

    function handleCardClick(card) {
      const picked = card.dataset.mood;
      if (picked !== 'good' && picked !== 'rough') return;
      if (animating) return;

      if (mood === picked) {
        if (pickPhase === 'open') {
          resetMood();
        } else {
          clearAnimationTimers();
          clearDismissTransitionListener();
          clearFlipTransitionListener();
          clearPickVisualState();
          openMood(picked, { fromUser: true });
        }
        return;
      }

      if (mood && pickPhase !== 'open') {
        clearAnimationTimers();
        clearDismissTransitionListener();
        clearFlipTransitionListener();
        clearPickVisualState();
        mood = null;
        applyMoodClasses();
      }

      openMood(picked, { fromUser: true });
    }

    cardGood.btn.addEventListener('click', () => handleCardClick(cardGood.btn));
    cardRough.btn.addEventListener('click', () => handleCardClick(cardRough.btn));
    cardGood.resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetMood();
    });
    cardRough.resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetMood();
    });

    const onResize = () => remeasure();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(host);
      resizeObserver.observe(row);
      resizeObserver.observe(quoteWrap);
    } else {
      global.addEventListener('resize', onResize);
    }

    quoteImg.addEventListener('load', () => {
      syncVisibility();
      remeasure();
    });
    quoteImg.addEventListener('error', () => {
      console.warn('[our-daily] Triptych quote image failed to load');
      host.classList.remove('is-ready');
      host.setAttribute('hidden', 'hidden');
      host.setAttribute('aria-hidden', 'true');
    });

    quoteImg.src = quoteDataUrl;
    if (typeof quoteImg.decode === 'function') {
      void quoteImg.decode().then(() => {
        syncVisibility();
        remeasure();
      }).catch(() => { /* load/error */ });
    }
    if (quoteImg.complete) {
      syncVisibility();
      remeasure();
    }

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => remeasure()).catch(() => {});
    }

    const api = {
      host,
      setMood(next, options = {}) {
        if (next === 'good' || next === 'rough') {
          openMood(next, { instant: !!options.instant, fromUser: !!options.fromUser });
        } else if (next === null || next === 'center' || next === 'idle') {
          resetMood({ instant: !!options.instant });
        }
      },
      getMood: () => mood,
      reset: () => resetMood(),
      remeasure,
      destroy() {
        clearAnimationTimers();
        clearDismissTransitionListener();
        clearFlipTransitionListener();
        if (remeasureRaf != null) {
          cancelAnimationFrame(remeasureRaf);
          remeasureRaf = null;
        }
        if (resizeObserver) {
          resizeObserver.disconnect();
          resizeObserver = null;
        } else {
          global.removeEventListener('resize', onResize);
        }
        host.innerHTML = '';
        delete host._moodTriptychWidget;
      }
    };

    host._moodTriptychWidget = api;
    return api;
  }

  function unmount(host) {
    if (!host) return;
    host._moodTriptychWidget?.destroy?.();
    delete host._moodTriptychWidget;
    host.innerHTML = '';
    host.className = 'quilt-mood-triptych';
    host.setAttribute('hidden', 'hidden');
    host.setAttribute('aria-hidden', 'true');
    host.classList.remove('is-good', 'is-rough', 'is-open', 'is-ready', 'is-dismiss-sliding', 'is-instant');
    delete host.dataset.panel;
  }

  function moodToPanel(mood) {
    if (mood === 'good') return 'good';
    if (mood === 'rough') return 'rough';
    return 'center';
  }

  function panelToMood(panel) {
    if (panel === 'good') return 'good';
    if (panel === 'rough') return 'rough';
    return null;
  }

  return {
    injectStyles,
    mount,
    unmount,
    moodToPanel,
    panelToMood,
    DISMISS_MS,
    OPEN_START_DELAY_MS,
    UNFOLD_MS: FLIP_MS,
    FLIP_MS
  };
});
