/**
 * Mood triptych: peek quote + two hand-cut squares (icon up) → dim sibling in place → flip for message.
 * One pick per day — no reset or switch after the reader chooses.
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

  const STYLE_ID = 'quilt-mood-triptych-widget-styles-v160';
  const TRIPTYCH_BUILD = 'v160';

  try {
    console.info('[triptych] script loaded', TRIPTYCH_BUILD);
  } catch (_) {
    /* */
  }
  /** iOS rotateY keyframes — same 3D stack as desktop; WKWebView skips CSS transitions. */
  const IOS_FLIP_MS = 2100;
  const DISMISS_MS = 1000;
  const DIM_MS = 420;
  const FLIP_MS = 900;
  const REDUCED_DISMISS_MS = 400;
  const REDUCED_DIM_MS = 180;
  const REDUCED_FLIP_MS = 320;
  /** Flip-only reveal — sibling dims in parallel but finish waits on flip. */
  const OPEN_START_DELAY_MS = FLIP_MS;

  const MOOD_ICONS = {
    good: 'circle',
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

  /** Map nightly/client PNG pixels to triptych display cap (~72% sheet — smaller than mood row). */
  function applyTriptychQuoteDisplaySize(quoteImg, quoteWrap, opts = {}) {
    if (!quoteImg) return;
    let layoutW = 0;
    const preset = Number(opts.quoteDisplayWidthPx) || 0;
    if (preset > 0) {
      layoutW = Math.round(preset);
    } else {
      const nw = quoteImg.naturalWidth;
      const nh = quoteImg.naturalHeight;
      if (nw > 0 && nh > 0) {
        const QNC = global.QuiltNewspaperClipping;
        const renderWidth =
          Number(opts.quoteRenderWidth) ||
          Number(quoteWrap?.closest?.('#quiltMoodSpread')?.dataset?.quoteRenderWidth) ||
          0;
        const layout = QNC?.resolveQuoteClippingDisplayLayout?.(
          nw,
          nh,
          renderWidth,
          QNC.resolveTriptychClippingLayoutOpts?.() || {
            displayScale: Number(QNC.TRIPTYCH_QUOTE_DISPLAY_SCALE) || 0.72
          }
        );
        layoutW = Number(layout?.displayWidthPx) || 0;
      }
    }
    if (layoutW > 0) {
      const cssW = `${layoutW}px`;
      if (quoteWrap) quoteWrap.style.maxWidth = cssW;
      quoteImg.style.width = cssW;
      quoteImg.style.maxWidth = '100%';
      quoteImg.style.height = 'auto';
      return;
    }
    const fallbackScale = Number(global.QuiltNewspaperClipping?.TRIPTYCH_QUOTE_DISPLAY_SCALE) || 0.72;
    quoteImg.style.width = `${Math.round(fallbackScale * 100)}%`;
    quoteImg.style.maxWidth = `${Math.round(fallbackScale * 100)}%`;
    quoteImg.style.height = 'auto';
  }

  function resolveTriptychHalftoneMaskUrl() {
    try {
      if (typeof location !== 'undefined' && location.href) {
        return new URL('assets/mood-triptych-halftone-alpha.png', location.href).href;
      }
    } catch (_) {
      /* */
    }
    return 'assets/mood-triptych-halftone-alpha.png';
  }

  function injectStyles() {
    if (typeof document === 'undefined') return;
    document
      .querySelectorAll('style[id^="quilt-mood-triptych-widget-styles-v"]')
      .forEach((el) => el.remove());
    if (document.getElementById(STYLE_ID)) return;
    const halftoneUrl = resolveTriptychHalftoneUrl().replace(/"/g, '%22');
    const halftoneMaskUrl = resolveTriptychHalftoneMaskUrl().replace(/"/g, '%22');
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #screen-quilt .quilt-mood-triptych {
        --triptych-halftone-image: url("${halftoneUrl}");
        --triptych-halftone-mask: url("${halftoneMaskUrl}");
        --triptych-halftone-overlay-opacity: 0.68;
        /* Zoom halftone PNG (no-repeat) — higher % = larger dots on the riso fill. */
        --triptych-halftone-overlay-scale: 168%;
        --triptych-scale: 0.85;
        --triptych-mood-scale: 0.99;
        --triptych-gutter: clamp(1.25rem, 8vw, 2.25rem);
        --triptych-quote-gap: clamp(1rem, 5.2vw, 1.55rem);
        --triptych-or-breathe: clamp(0.5rem, 2.2vw, 0.85rem);
        --triptych-mood-gap: calc(var(--triptych-or-size) + (2 * var(--triptych-or-breathe)));
        --triptych-dismiss-ms: ${DISMISS_MS}ms;
        --triptych-dim-ms: ${DIM_MS}ms;
        --triptych-flip-ms: ${FLIP_MS}ms;
        --triptych-dismiss-ease: cubic-bezier(0.55, 0.06, 0.68, 0.19);
        --triptych-flip-ease: cubic-bezier(0.22, 1, 0.36, 1);
        --triptych-sheet-width: min(
          calc(var(--quilt-float-card-max, 460px) * var(--triptych-scale)),
          calc(100% - (2 * var(--triptych-gutter)))
        );
        --triptych-mood-row-width: calc(var(--triptych-sheet-width) * var(--triptych-mood-scale));
        --triptych-ink: var(--quilt-clipping-ink, rgba(42, 34, 28, 0.86));
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
        --triptych-good-fill-light: var(--quilt-mood-good-fill-light, #f3d4c4);
        --triptych-good-fill-dark: var(--quilt-mood-good-fill-dark, #c46842);
        --triptych-rough-fill: var(--quilt-mood-rough-fill, #b85a38);
        --triptych-rough-fill-light: var(--quilt-mood-rough-fill-light, #e8b8a0);
        --triptych-rough-fill-dark: var(--quilt-mood-rough-fill-dark, #8f3f24);
        --triptych-paper-fill: color-mix(
          in srgb,
          var(--quilt-quote-paper-bg, var(--quilt-paper-card-fallback, var(--odq-paper-artifact, #f6f4f1))) 84%,
          var(--odq-paper-tape, #f2eee6) 16%
        );
        --triptych-paper-edge-wash:
          radial-gradient(
            ellipse 128% 112% at 50% 44%,
            transparent 40%,
            color-mix(in srgb, var(--triptych-paper-fill) 18%, rgba(108, 78, 52, 0.34) 82%) 100%
          ),
          linear-gradient(118deg, rgba(96, 72, 50, 0.09) 0%, transparent 48%),
          linear-gradient(298deg, rgba(90, 66, 48, 0.085) 0%, transparent 52%);
        --triptych-pad-top: 1.5px;
        --triptych-pad-right: 1.5px;
        --triptych-pad-bottom: 1.5px;
        --triptych-pad-left: 1.5px;
        --triptych-vintage-ink: var(
          --mood-clipping-ink-strong,
          var(--quilt-clipping-ink, rgba(42, 34, 28, 0.86))
        );
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
        /* Halftone dot bands above/below the back message wash (inside ink border). */
        --triptych-back-dot-band-y: clamp(0.72rem, 5.4vw, 1.38rem);
        --triptych-message-pad-back-y: clamp(0.02rem, 0.35vw, 0.08rem);
        --triptych-mark-font: 'Barlow Condensed', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif;
        --triptych-or-font: var(
          --quilt-speaker-name-font,
          'Barlow Condensed',
          'Arial Narrow',
          'Helvetica Neue',
          Arial,
          sans-serif
        );
        --triptych-or-size: clamp(2.9rem, 10.4vw, 4.3rem);
        --triptych-mark-size: clamp(1.42rem, 4.9vw, 1.82rem);
        --triptych-mark-weight: 300;
        --triptych-mark-tilt: 3.2deg;
        --triptych-copy-pad-y: clamp(0.18rem, 1.6vw, 0.38rem);
        --triptych-copy-pad-x: clamp(0.46rem, 4.6vw, 0.82rem);
        --triptych-message-pad-x: clamp(0.62rem, 6.5vw, 1.08rem);
        --triptych-halftone-clear-gutter-x: clamp(0.38rem, 3.2vw, 0.58rem);
        --triptych-halftone-clear-gutter-x-end: clamp(0.14rem, 1.2vw, 0.24rem);
        --triptych-halftone-clear-gutter-y: clamp(0.05rem, 0.45vw, 0.1rem);
        --triptych-halftone-clear-gutter-back-x: clamp(0.12rem, 1vw, 0.22rem);
        --triptych-halftone-clear-gutter-back-x-end: clamp(0.05rem, 0.4vw, 0.1rem);
        --triptych-halftone-clear-gutter-back-y: clamp(0.05rem, 0.45vw, 0.1rem);
        --triptych-bleed-imprint-opacity: 0.1;
        --triptych-bleed-imprint-back-opacity: 0.055;
        --triptych-cut-guide-outset: clamp(3px, 0.95vw, 6px);
        --triptych-cut-guide-weight: 1px;
        --triptych-cut-guide-ink: color-mix(
          in srgb,
          var(--triptych-vintage-ink, rgba(42, 34, 28, 0.86)) 46%,
          transparent
        );
        /* Quote clipping shadow only — no bright top rim (was reading as white paper). */
        --triptych-card-shadow:
          drop-shadow(
            0 0 0.5px
            color-mix(in srgb, var(--triptych-paper-fill) 62%, #dcc9b4 38%)
          ),
          var(
            --odq-artifact-shadow,
            drop-shadow(0 4px 14px rgba(45, 36, 29, 0.14))
              drop-shadow(0 1px 3px rgba(45, 36, 29, 0.1))
              drop-shadow(0 8px 20px rgba(28, 32, 42, 0.06))
          );
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
        width: auto;
        max-width: var(--triptych-sheet-width);
        flex-shrink: 0;
        position: relative;
        z-index: 2;
        pointer-events: none;
        align-self: center;
        transform: translate(clamp(-10px, -2.4vw, -4px), clamp(3px, 1vw, 9px))
          rotate(-1.15deg);
      }

      /* Shadow on wrapper — filter on <img> softens PNG type in WebKit. */
      #screen-quilt .quilt-mood-triptych__quote-shadow {
        width: auto;
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
        width: auto;
        max-width: 100%;
        height: auto;
        margin: 0;
        user-select: none;
        -webkit-user-drag: none;
        filter: none;
        image-rendering: auto;
      }

      #screen-quilt .quilt-mood-triptych__row {
        display: grid;
        grid-template-columns: var(--triptych-good-w, 1fr) var(--triptych-rough-w, 1fr);
        justify-content: center;
        gap: var(--triptych-mood-gap);
        width: min(var(--triptych-mood-row-width), 100%);
        max-width: 100%;
        margin: 0 auto;
        padding-top: clamp(0.2rem, 1.4vw, 0.65rem);
        padding-bottom: clamp(0.15rem, 1vw, 0.45rem);
        padding-inline: var(--triptych-row-inset, clamp(0.55rem, 3.6vw, 1.15rem));
        box-sizing: border-box;
        position: relative;
        z-index: 1;
        overflow: visible;
        align-items: end;
        justify-items: stretch;
      }

      #screen-quilt .quilt-mood-triptych__or {
        position: absolute;
        left: 50%;
        top: 10%;
        transform: translateX(-50%);
        z-index: 2;
        margin: 0;
        padding: 0;
        font-family: var(--triptych-or-font);
        font-size: var(--triptych-or-size);
        font-weight: 500;
        font-style: italic;
        line-height: 1;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--triptych-copy-ink);
        pointer-events: none;
        user-select: none;
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
        width: var(--triptych-card-w, 100%);
        max-width: 100%;
        height: var(--triptych-cell-h, auto);
        min-height: var(--triptych-cell-h, auto);
        overflow: visible;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        box-sizing: border-box;
        filter: var(--triptych-card-shadow);
      }

      /* Idle cards: hand-cut tilt on the button. Chosen card: no transform/filter on button (3D needs a flat ancestor). */
      #screen-quilt .quilt-mood-triptych__card:not(.is-chosen) {
        transform: var(--triptych-card-transform, rotate(0deg));
        transform-origin: var(--triptych-card-origin, center center);
      }

      #screen-quilt .quilt-mood-triptych__card.is-chosen {
        z-index: 6;
        filter: none;
        transform: none;
      }

      #screen-quilt .quilt-mood-triptych__card-3d {
        position: absolute;
        inset: 0;
        perspective: 920px;
        -webkit-perspective: 920px;
        transform-style: preserve-3d;
        -webkit-transform-style: preserve-3d;
      }

      /* Tilt separate from perspective — WKWebView flattens 3D when both share one element. */
      #screen-quilt .quilt-mood-triptych__card-tilt {
        position: absolute;
        inset: 0;
        transform-style: preserve-3d;
        -webkit-transform-style: preserve-3d;
      }

      #screen-quilt .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__card-tilt {
        transform: var(--triptych-card-tilt, rotate(0deg));
        transform-origin: var(--triptych-card-origin, center center);
      }

      #screen-quilt .quilt-mood-triptych__card--good {
        z-index: 2;
        --triptych-card-tilt: translate(clamp(-4px, -1vw, -1px), clamp(3px, 1.2vw, 8px))
          rotate(-2.4deg);
        --triptych-card-origin: 36% 92%;
        --triptych-card-transform: var(--triptych-card-tilt);
      }

      #screen-quilt .quilt-mood-triptych__card--rough {
        z-index: 1;
        --triptych-card-tilt: translate(clamp(1px, 1vw, 5px), clamp(-3px, -0.8vw, 2px))
          rotate(2.8deg);
        --triptych-card-origin: 64% 90%;
        --triptych-card-transform: var(--triptych-card-tilt);
      }

      #screen-quilt .quilt-mood-triptych__flip {
        position: absolute;
        inset: 0;
        transform-style: preserve-3d;
        -webkit-transform-style: preserve-3d;
        transform: rotateY(0deg) translateZ(0);
        transition: transform var(--triptych-flip-ms) var(--triptych-flip-ease);
      }

      #screen-quilt .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__flip {
        transform-origin: center center;
        transform: rotateY(0deg) translateZ(0);
      }

      #screen-quilt .quilt-mood-triptych.is-flipping .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__flip {
        will-change: transform;
      }

      #screen-quilt .quilt-mood-triptych.is-instant .quilt-mood-triptych__flip {
        transition: none;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__flip {
        transform: rotateY(180deg) translateZ(0);
      }

      #screen-quilt .quilt-mood-triptych.is-apple-webkit {
        --triptych-flip-ms: ${IOS_FLIP_MS}ms;
      }

      @-webkit-keyframes triptych-ios-rotate-flip {
        from {
          -webkit-transform: rotateY(0deg) translateZ(0);
        }
        to {
          -webkit-transform: rotateY(180deg) translateZ(0);
        }
      }

      @keyframes triptych-ios-rotate-flip {
        from {
          transform: rotateY(0deg) translateZ(0);
        }
        to {
          transform: rotateY(180deg) translateZ(0);
        }
      }

      #screen-quilt .quilt-mood-triptych.is-apple-webkit .quilt-mood-triptych__flip {
        transition: none;
      }

      #screen-quilt .quilt-mood-triptych.is-apple-webkit.is-flipping
        .quilt-mood-triptych__card.is-chosen
        .quilt-mood-triptych__flip.is-ios-flip-playing {
        -webkit-animation: triptych-ios-rotate-flip var(--triptych-flip-ms) var(--triptych-flip-ease) forwards;
        animation: triptych-ios-rotate-flip var(--triptych-flip-ms) var(--triptych-flip-ease) forwards;
        transform-origin: center center;
        will-change: transform;
      }

      #screen-quilt .quilt-mood-triptych.is-apple-webkit.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__flip {
        -webkit-transform: rotateY(180deg) translateZ(0);
        transform: rotateY(180deg) translateZ(0);
      }

      #screen-quilt .quilt-mood-triptych.is-apple-webkit.is-flipping .quilt-mood-triptych__face::before {
        filter: none;
      }

      #screen-quilt .quilt-mood-triptych.is-apple-webkit.is-flipping .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__face {
        overflow: visible;
      }

      #screen-quilt .quilt-mood-triptych.is-apple-webkit .quilt-mood-triptych__face--back .quilt-mood-triptych__bleed-imprint--front {
        display: none;
      }

      #screen-quilt .quilt-mood-triptych.is-apple-webkit.is-open
        .quilt-mood-triptych__card.is-chosen
        .quilt-mood-triptych__face--back
        .quilt-mood-triptych__type-window {
        visibility: visible;
      }

      #screen-quilt .quilt-mood-triptych.is-open
        .quilt-mood-triptych__card.is-chosen
        .quilt-mood-triptych__face--back
        .quilt-mood-triptych__type-window {
        visibility: visible;
        z-index: 4;
      }

      #screen-quilt .quilt-mood-triptych.is-open
        .quilt-mood-triptych__card.is-chosen
        .quilt-mood-triptych__face--back
        .quilt-mood-triptych__message {
        z-index: 5;
        background: transparent;
      }

      #screen-quilt .quilt-mood-triptych__face {
        position: absolute;
        inset: 0;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        box-sizing: border-box;
        background-color: var(--triptych-paper-fill);
        background-image:
          var(--triptych-paper-edge-wash),
          var(--quilt-paper-surface-image),
          var(--quilt-paper-card-texture);
        background-size: 100% 100%, 100% 100%, 118% 118%;
        background-position: center, center, center;
        background-repeat: no-repeat;
        background-blend-mode: multiply, normal, multiply;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        overflow: hidden;
      }

      /* Scanner bloom only on the riso interior — margin stays flat newsprint like quote PNG. */
      #screen-quilt .quilt-mood-triptych__face > .odq-scanner-bed {
        top: var(--triptych-article-inset-top);
        right: var(--triptych-article-inset-right);
        bottom: var(--triptych-article-inset-bottom);
        left: var(--triptych-article-inset-left);
      }

      #screen-quilt .quilt-mood-triptych__card--good .quilt-mood-triptych__face {
        --triptych-card-face-fill: var(--triptych-good-fill);
        --triptych-card-fill-light: var(--triptych-good-fill-light);
        --triptych-card-fill-dark: var(--triptych-good-fill-dark);
      }

      #screen-quilt .quilt-mood-triptych__card--rough .quilt-mood-triptych__face {
        --triptych-card-face-fill: var(--triptych-rough-fill);
        --triptych-card-fill-light: var(--triptych-rough-fill-light);
        --triptych-card-fill-dark: var(--triptych-rough-fill-dark);
        --triptych-riso-mask-x: 47%;
        --triptych-riso-mask-y: 53%;
      }

      /* Riso wash + halftone under the ink border (same box as border-frame); avoids paper gaps. */
      #screen-quilt .quilt-mood-triptych__face::after {
        content: '';
        position: absolute;
        top: calc(var(--triptych-pad-top) - var(--triptych-bleed-top, 0px));
        right: calc(var(--triptych-pad-right) - var(--triptych-bleed-right, 0px));
        bottom: calc(var(--triptych-pad-bottom) - var(--triptych-bleed-bottom, 0px));
        left: calc(var(--triptych-pad-left) - var(--triptych-bleed-left, 0px));
        background-color: var(--triptych-card-fill-light, var(--triptych-card-face-fill, var(--triptych-good-fill)));
        background-image: none;
        border: 0;
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
        /* Above scanner bed + type-window anchor; below HERE/NOW + message ink. */
        z-index: 3;
        background-image: var(--triptych-halftone-image);
        background-size: var(--triptych-halftone-overlay-scale, 168%)
          var(--triptych-halftone-overlay-scale, 168%);
        background-position: var(--triptych-riso-mask-x, 50%) var(--triptych-riso-mask-y, 50%);
        background-repeat: no-repeat;
        mix-blend-mode: multiply;
        opacity: var(--triptych-halftone-overlay-opacity, 0.68);
        filter: contrast(1.15) brightness(0.88);
      }

      #screen-quilt .quilt-mood-triptych__face--front {
        transform: rotateY(0deg) translateZ(0.1px);
      }

      #screen-quilt .quilt-mood-triptych__face--back {
        transform: rotateY(180deg) translateZ(0.1px);
      }

      #screen-quilt .quilt-mood-triptych__border-frame {
        position: absolute;
        top: calc(var(--triptych-pad-top) - var(--triptych-bleed-top, 0px));
        right: calc(var(--triptych-pad-right) - var(--triptych-bleed-right, 0px));
        bottom: calc(var(--triptych-pad-bottom) - var(--triptych-bleed-bottom, 0px));
        left: calc(var(--triptych-pad-left) - var(--triptych-bleed-left, 0px));
        box-sizing: border-box;
        border: var(--triptych-vintage-border) solid var(--triptych-vintage-ink);
        background: transparent;
        pointer-events: none;
        z-index: 4;
      }

      /* Newspaper cut-out guide — front only, offset outside the solid ink border. */
      #screen-quilt .quilt-mood-triptych__face--front .quilt-mood-triptych__cut-guide {
        position: absolute;
        top: calc(
          var(--triptych-pad-top) - var(--triptych-bleed-top, 0px) -
          var(--triptych-cut-guide-outset)
        );
        right: calc(
          var(--triptych-pad-right) - var(--triptych-bleed-right, 0px) -
          var(--triptych-cut-guide-outset)
        );
        bottom: calc(
          var(--triptych-pad-bottom) - var(--triptych-bleed-bottom, 0px) -
          var(--triptych-cut-guide-outset)
        );
        left: calc(
          var(--triptych-pad-left) - var(--triptych-bleed-left, 0px) -
          var(--triptych-cut-guide-outset)
        );
        box-sizing: border-box;
        border: var(--triptych-cut-guide-weight) dashed var(--triptych-cut-guide-ink);
        border-radius: 0;
        background: transparent;
        pointer-events: none;
        z-index: 5;
        opacity: 0.82;
      }

      /* Dot-free riso wash behind type/icon — front hugs ink; back spans interior width. */
      #screen-quilt .quilt-mood-triptych__type-window {
        position: absolute;
        z-index: 4;
        box-sizing: border-box;
        pointer-events: none;
        background-color: var(
          --triptych-card-fill-light,
          var(--triptych-card-face-fill, var(--triptych-good-fill))
        );
      }

      /* Back message: full interior width; dot halftone stays in top/bottom bands. */
      #screen-quilt .quilt-mood-triptych__face--back .quilt-mood-triptych__type-window {
        top: calc(var(--triptych-article-inset-top) + var(--triptych-back-dot-band-y));
        right: var(--triptych-article-inset-right);
        bottom: calc(var(--triptych-article-inset-bottom) + var(--triptych-back-dot-band-y));
        left: var(--triptych-article-inset-left);
        width: auto;
        height: auto;
      }

      #screen-quilt .quilt-mood-triptych__front-mark::before,
      #screen-quilt .quilt-mood-triptych__front-mark::after,
      #screen-quilt .quilt-mood-triptych__message::before,
      #screen-quilt .quilt-mood-triptych__message::after {
        display: none;
        content: none;
      }

      #screen-quilt .quilt-mood-triptych__bleed-imprint {
        position: absolute;
        top: var(--triptych-article-inset-top);
        right: var(--triptych-article-inset-right);
        bottom: var(--triptych-article-inset-bottom);
        left: var(--triptych-article-inset-left);
        box-sizing: border-box;
        margin: 0;
        padding: var(--triptych-copy-pad-y) var(--triptych-message-pad-x, var(--triptych-copy-pad-x));
        z-index: 3;
        width: auto;
        min-width: 0;
        max-width: none;
        min-height: 0;
        overflow: hidden;
        pointer-events: none;
        user-select: none;
        opacity: var(--triptych-bleed-imprint-opacity, 0.1);
        mix-blend-mode: multiply;
        transform: scaleX(-1);
        transform-origin: center center;
        filter: blur(0.35px);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      #screen-quilt .quilt-mood-triptych__bleed-imprint--message {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: center;
        font-family: var(--triptych-copy-font);
        font-size: var(--triptych-body-size);
        font-style: normal;
        font-weight: var(--triptych-message-weight, 500);
        line-height: var(--triptych-copy-line-height);
        text-align: left;
        text-wrap: pretty;
        color: var(--triptych-copy-ink);
        letter-spacing: var(--triptych-copy-tracking);
        word-spacing: normal;
        white-space: normal;
        word-break: normal;
        overflow-wrap: break-word;
        hyphens: auto;
        -webkit-hyphens: auto;
        -webkit-hyphenate-limit-before: 4;
        -webkit-hyphenate-limit-after: 4;
        hyphenate-limit-chars: 6 4 4;
      }

      #screen-quilt .quilt-mood-triptych__bleed-imprint--front {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: clamp(0.12rem, 1.1vw, 0.32rem);
        text-align: center;
        opacity: var(--triptych-bleed-imprint-back-opacity, 0.055);
      }

      #screen-quilt .quilt-mood-triptych__bleed-imprint--front .quilt-mood-triptych__mark-label,
      #screen-quilt .quilt-mood-triptych__bleed-imprint--front .quilt-mood-triptych__icon-symbol {
        text-shadow: none;
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
        font-weight: var(--triptych-mark-weight, 300);
        line-height: 1;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--triptych-copy-ink) 58%, transparent);
        text-shadow: none;
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
        color: var(--triptych-copy-ink);
        text-shadow: var(--triptych-copy-ink-shadow);
      }

      #screen-quilt .quilt-mood-triptych__card--good .quilt-mood-triptych__icon-symbol {
        font-variation-settings: 'FILL' 0, 'wght' 700, 'GRAD' 0, 'opsz' 96;
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
        flex-direction: column;
        align-items: stretch;
        justify-content: center;
        box-sizing: border-box;
        margin: 0;
        padding: var(--triptych-copy-pad-y) var(--triptych-message-pad-x, var(--triptych-copy-pad-x));
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
        text-align: left;
        text-wrap: pretty;
        color: var(--triptych-copy-ink);
        letter-spacing: var(--triptych-copy-tracking);
        word-spacing: normal;
        text-shadow: var(--triptych-copy-ink-shadow);
        filter: none;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        white-space: normal;
        word-break: normal;
        overflow-wrap: break-word;
        hyphens: auto;
        -webkit-hyphens: auto;
        -webkit-hyphenate-limit-before: 4;
        -webkit-hyphenate-limit-after: 4;
        hyphenate-limit-chars: 6 4 4;
      }

      #screen-quilt .quilt-mood-triptych__face--back .quilt-mood-triptych__message {
        padding: var(--triptych-message-pad-back-y)
          clamp(0.42rem, 4.2vw, 0.72rem);
      }

      #screen-quilt .quilt-mood-triptych__bleed-imprint {
        isolation: isolate;
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
        display: block;
        inset: auto;
        height: auto;
        max-height: none;
        z-index: 0;
        text-align: left;
      }

      #screen-quilt .quilt-mood-triptych__card.is-dismissed {
        pointer-events: none;
        z-index: 1;
      }

      /* Dim in place — dark wash over full-opacity card (not opacity fade). */
      #screen-quilt .quilt-mood-triptych__card.is-dismissed::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 20;
        pointer-events: none;
        background: rgba(30, 24, 18, 0.4);
        opacity: 0;
        transition: opacity var(--triptych-dim-ms) var(--triptych-dismiss-ease);
      }

      #screen-quilt .quilt-mood-triptych__card.is-dismissed:not(.is-dismissed-gone)::after {
        opacity: 1;
      }

      #screen-quilt .quilt-mood-triptych.is-instant .quilt-mood-triptych__card.is-dismissed::after {
        transition: none;
      }

      #screen-quilt .quilt-mood-triptych__card.is-dismissed.is-dismissed-gone {
        visibility: hidden;
      }

      #screen-quilt .quilt-mood-triptych__card.is-dismissed.is-dismissed-gone::after {
        opacity: 0;
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

      #screen-quilt .quilt-mood-triptych.is-locked .quilt-mood-triptych__card {
        cursor: default;
        pointer-events: none;
      }

      @media (prefers-reduced-motion: reduce) {
        #screen-quilt .quilt-mood-triptych {
          --triptych-dismiss-ms: ${REDUCED_DISMISS_MS}ms;
          --triptych-dim-ms: ${REDUCED_DIM_MS}ms;
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

  /** Capacitor iOS / iPadOS WKWebView — use WAAPI for card flip (CSS 3D transition often skipped). */
  function isAppleTouchWebKit() {
    try {
      const cap = global.Capacitor?.getPlatform?.();
      if (cap === 'ios') return true;
    } catch (_) {
      /* */
    }
    if (typeof global.matchMedia === 'function') {
      try {
        if (global.matchMedia('(-webkit-touch-callout: none)').matches) return true;
      } catch (_) {
        /* */
      }
    }
    const ua = global.navigator?.userAgent || '';
    return /iPhone|iPad|iPod/i.test(ua);
  }

  function buildFrontMarkStack(iconName) {
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

    return { labelHere, iconSymbol, labelNow };
  }

  function buildCutGuide() {
    const el = document.createElement('div');
    el.className = 'quilt-mood-triptych__cut-guide';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function buildBorderFrame() {
    const el = document.createElement('div');
    el.className = 'quilt-mood-triptych__border-frame';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function buildTypeWindow() {
    const el = document.createElement('div');
    el.className = 'quilt-mood-triptych__type-window';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function clearBackTypeWindowInlineLayout(backWin) {
    if (!backWin) return;
    backWin.style.removeProperty('top');
    backWin.style.removeProperty('right');
    backWin.style.removeProperty('bottom');
    backWin.style.removeProperty('left');
    backWin.style.removeProperty('width');
    backWin.style.removeProperty('height');
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

    const card3d = document.createElement('div');
    card3d.className = 'quilt-mood-triptych__card-3d';

    const cardTilt = document.createElement('div');
    cardTilt.className = 'quilt-mood-triptych__card-tilt';

    const flip = document.createElement('div');
    flip.className = 'quilt-mood-triptych__flip';

    const faceFront = document.createElement('div');
    faceFront.className = 'quilt-mood-triptych__face quilt-mood-triptych__face--front';

    const frontMark = document.createElement('div');
    frontMark.className = 'quilt-mood-triptych__front-mark';
    const frontStack = buildFrontMarkStack(iconName);
    frontMark.append(frontStack.labelHere, frontStack.iconSymbol, frontStack.labelNow);

    const bleedMessage = document.createElement('div');
    bleedMessage.className =
      'quilt-mood-triptych__bleed-imprint quilt-mood-triptych__bleed-imprint--message';
    bleedMessage.setAttribute('aria-hidden', 'true');
    bleedMessage.textContent = message;

    faceFront.append(buildTypeWindow(), bleedMessage, frontMark, buildBorderFrame(), buildCutGuide());

    const faceBack = document.createElement('div');
    faceBack.className = 'quilt-mood-triptych__face quilt-mood-triptych__face--back';

    const bleedFront = document.createElement('div');
    bleedFront.className =
      'quilt-mood-triptych__bleed-imprint quilt-mood-triptych__bleed-imprint--front';
    bleedFront.setAttribute('aria-hidden', 'true');
    const bleedFrontStack = buildFrontMarkStack(iconName);
    bleedFront.append(
      bleedFrontStack.labelHere,
      bleedFrontStack.iconSymbol,
      bleedFrontStack.labelNow
    );

    const messageEl = document.createElement('div');
    messageEl.className = 'quilt-mood-triptych__message';
    messageEl.textContent = message;
    faceBack.append(buildTypeWindow(), bleedFront, messageEl, buildBorderFrame());

    flip.append(faceFront, faceBack);
    cardTilt.append(flip);
    card3d.append(cardTilt);

    btn.append(card3d);
    return { btn, flip, cardTilt, messageEl };
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
    const halftoneMaskCss = `url("${resolveTriptychHalftoneMaskUrl()}")`;
    host.style.setProperty('--triptych-halftone-image', halftoneCss);
    host.style.setProperty('--triptych-halftone-mask', halftoneMaskCss);
    const screen = document.getElementById('screen-quilt');
    screen?.style.setProperty('--triptych-halftone-image', halftoneCss);
    screen?.style.setProperty('--triptych-halftone-mask', halftoneMaskCss);

    const quoteDataUrl = String(opts.quoteDataUrl || '').trim();
    const quoteDisplayWidthPx = Number(opts.quoteDisplayWidthPx) || 0;
    const goodDay = String(opts.goodDay || '').trim();
    const roughDay = String(opts.roughDay || '').trim();
    const dateKey = String(opts.dateKey || '').trim();
    if (!quoteDataUrl || !goodDay || !roughDay) return null;

    host.innerHTML = '';
    host.className = 'quilt-mood-triptych';
    host.dataset.panel = 'idle';
    host.removeAttribute('hidden');
    host.classList.remove('is-ready', 'is-good', 'is-rough', 'is-open', 'is-instant', 'is-locked');

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

    applyTriptychQuoteDisplaySize(quoteImg, quoteWrap, {
      quoteDisplayWidthPx,
      quoteRenderWidth: opts.quoteRenderWidth
    });

    const row = document.createElement('div');
    row.className = 'quilt-mood-triptych__row';

    const cardGood = buildCard('good', goodDay, MOOD_ICONS.good);
    const cardRough = buildCard('rough', roughDay, MOOD_ICONS.rough);
    const orDivider = document.createElement('span');
    orDivider.className = 'quilt-mood-triptych__or';
    orDivider.setAttribute('aria-hidden', 'true');
    orDivider.textContent = 'OR';
    row.append(cardGood.btn, orDivider, cardRough.btn);

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
    const useIos2dFlip = isAppleTouchWebKit();
    if (useIos2dFlip) {
      host.classList.add('is-apple-webkit');
      host.dataset.triptychFlipEngine = 'ios-rotate3d';
    } else {
      host.dataset.triptychFlipEngine = 'css3d';
    }
    host.dataset.triptychBuild = TRIPTYCH_BUILD;
    try {
      console.info('[triptych] mounted', TRIPTYCH_BUILD, {
        flipEngine: host.dataset.triptychFlipEngine,
        host: '#quiltMoodSpread'
      });
    } catch (_) {
      /* */
    }

    let activeFlipAnimation = null;
    let iosFlipEndListener = null;

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

    function clearIosFaceInlineStyles() {
      [cardGood, cardRough].forEach((card) => {
        card.flip
          .querySelectorAll(
            '.quilt-mood-triptych__face--front, .quilt-mood-triptych__face--back'
          )
          .forEach((face) => {
            face.style.removeProperty('display');
            face.style.removeProperty('visibility');
            face.style.removeProperty('opacity');
            face.style.removeProperty('transition');
          });
      });
    }

    function applyIosOpenFaces(chosen) {
      const front = chosen.flip.querySelector('.quilt-mood-triptych__face--front');
      const back = chosen.flip.querySelector('.quilt-mood-triptych__face--back');
      if (!front || !back) return;
      front.style.display = 'none';
      front.style.visibility = 'hidden';
      front.style.opacity = '0';
      back.style.display = 'block';
      back.style.visibility = 'visible';
      back.style.opacity = '1';
    }

    function clearIosFlipAnimation() {
      if (iosFlipEndListener) {
        cardGood.flip.removeEventListener('animationend', iosFlipEndListener);
        cardRough.flip.removeEventListener('animationend', iosFlipEndListener);
        iosFlipEndListener = null;
      }
      cardGood.flip.classList.remove('is-ios-flip-playing');
      cardRough.flip.classList.remove('is-ios-flip-playing');
    }

    function clearActiveFlipAnimation() {
      if (activeFlipAnimation) {
        try {
          activeFlipAnimation.cancel();
        } catch (_) {
          /* */
        }
        activeFlipAnimation = null;
      }
      clearIosFlipAnimation();
      cardGood.flip.style.removeProperty('transform');
      cardRough.flip.style.removeProperty('transform');
      if (useIos2dFlip) clearIosFaceInlineStyles();
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
      clearActiveFlipAnimation();
      cardGood.btn.classList.remove('is-dismissed', 'is-dismissed-gone');
      cardRough.btn.classList.remove('is-dismissed', 'is-dismissed-gone');
      host.classList.remove('is-open');
      pickPhase = 'idle';
    }

    function notifyReadyOnce() {
      if (readyNotified || !host.classList.contains('is-ready')) return;
      readyNotified = true;
      opts.onReady?.();
    }

    let layoutRetryTimer = null;

    function scheduleLayoutPass() {
      remeasure({ force: true });
      requestAnimationFrame(() => {
        remeasure({ force: true });
        requestAnimationFrame(() => remeasure({ force: true }));
      });
      if (layoutRetryTimer != null) global.clearTimeout(layoutRetryTimer);
      layoutRetryTimer = global.setTimeout(() => {
        layoutRetryTimer = null;
        remeasure({ force: true });
      }, 150);
    }

    function syncVisibility() {
      const quoteReady = quoteImg.naturalWidth > 0 && quoteImg.naturalHeight > 0;
      if (quoteReady) {
        host.classList.add('is-ready');
        host.removeAttribute('hidden');
        host.removeAttribute('aria-hidden');
        notifyReadyOnce();
        scheduleLayoutPass();
      } else {
        host.classList.remove('is-ready');
        host.setAttribute('hidden', 'hidden');
        host.setAttribute('aria-hidden', 'true');
      }
    }

    function applyMoodClasses() {
      const locked = mood !== null;
      host.classList.toggle('is-good', mood === 'good');
      host.classList.toggle('is-rough', mood === 'rough');
      host.classList.toggle('is-locked', locked);
      host.dataset.panel = pickPhase === 'open' && mood ? mood : (mood ? 'pending' : 'idle');
      cardGood.btn.classList.toggle('is-chosen', mood === 'good');
      cardRough.btn.classList.toggle('is-chosen', mood === 'rough');
      const expanded = pickPhase === 'open';
      cardGood.btn.setAttribute('aria-expanded', mood === 'good' && expanded ? 'true' : 'false');
      cardRough.btn.setAttribute('aria-expanded', mood === 'rough' && expanded ? 'true' : 'false');
      cardGood.btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
      cardRough.btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
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

    let justifyMeasureCtx = null;

    function getJustifyMeasureCtx() {
      if (justifyMeasureCtx) return justifyMeasureCtx;
      const canvas = document.createElement('canvas');
      justifyMeasureCtx = canvas.getContext('2d');
      return justifyMeasureCtx;
    }

    function syncJustifyMeasureFont() {
      const ctx = getJustifyMeasureCtx();
      if (!ctx) return;
      const s = getComputedStyle(messageMeasure);
      ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    }

    function messageContentWidthPx(articleWidthPx) {
      const cs = getComputedStyle(messageMeasure);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      return Math.max(1, articleWidthPx - padX);
    }

    function justifiedLineGapsPx(text, contentWidthPx, ctx) {
      const words = String(text || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (!words.length) return [];
      const spaceW = ctx.measureText(' ').width;
      const widths = words.map((w) => ctx.measureText(w).width);
      const gaps = [];
      let line = [];
      let lineSum = 0;

      const flushLine = () => {
        if (line.length <= 1) return;
        const sum = line.reduce((s, i) => s + widths[i], 0);
        gaps.push((contentWidthPx - sum) / (line.length - 1));
      };

      for (let i = 0; i < words.length; i++) {
        const w = widths[i];
        const need = line.length ? spaceW + w : w;
        if (line.length && lineSum + need > contentWidthPx + 0.5) {
          flushLine();
          line = [i];
          lineSum = w;
        } else {
          lineSum += need;
          line.push(i);
        }
      }
      flushLine();
      return gaps;
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

    function scoreJustifyAtCardWidth(text, cardBtn, cardWidthPx) {
      const pad = readArticleInsets(cardBtn);
      const articleW = Math.max(1, cardWidthPx - pad.left - pad.right - 2 * pad.border);
      const ctx = getJustifyMeasureCtx();
      if (!ctx) {
        return { score: measureMessageHeight(text, articleW), maxGap: 0 };
      }
      syncJustifyMeasureFont();
      const contentW = messageContentWidthPx(articleW);
      const gaps = justifiedLineGapsPx(text, contentW, ctx);
      const height = measureMessageHeight(text, articleW);
      if (!gaps.length) return { score: height, maxGap: 0 };
      const maxGap = Math.max(...gaps);
      const spaceW = ctx.measureText(' ').width;
      const gapPenalty = maxGap > spaceW * 2.15 ? maxGap * 90 : maxGap * 5;
      return { score: height + gapPenalty, maxGap };
    }

    function findOptimalSharedCardWidth(minCardW, maxCardW) {
      const minW = Math.round(minCardW);
      const maxW = Math.max(minW, Math.round(maxCardW));
      let bestW = minW;
      let bestScore = Infinity;
      for (let w = minW; w <= maxW; w += 3) {
        const sGood = scoreJustifyAtCardWidth(goodDay, cardGood.btn, w).score;
        const sRough = scoreJustifyAtCardWidth(roughDay, cardRough.btn, w).score;
        const score = Math.max(sGood, sRough);
        if (score < bestScore) {
          bestScore = score;
          bestW = w;
        }
      }
      return bestW;
    }

    function syncCardHeights(cardW) {
      const goodH = cellHeightForCard(cardGood.btn, cardW, goodDay);
      const roughH = cellHeightForCard(cardRough.btn, cardW, roughDay);
      const hPx = `${Math.max(goodH, roughH)}px`;
      if (cardGood.btn.style.getPropertyValue('--triptych-cell-h') !== hPx) {
        cardGood.btn.style.setProperty('--triptych-cell-h', hPx);
      }
      if (cardRough.btn.style.getPropertyValue('--triptych-cell-h') !== hPx) {
        cardRough.btn.style.setProperty('--triptych-cell-h', hPx);
      }
      if (host.style.getPropertyValue('--triptych-row-h') !== hPx) {
        host.style.setProperty('--triptych-row-h', hPx);
      }
    }

    function syncArticleLayout() {
      applyArticleOffset(cardGood.btn, dateKey, 'good');
      applyArticleOffset(cardRough.btn, dateKey, 'rough');
      applyHandCutBorderBleed(cardGood.btn, dateKey, 'good');
      applyHandCutBorderBleed(cardRough.btn, dateKey, 'rough');
    }

    /** Extra inset so full-justify glyphs + tracking never kiss the ink border. */
    const TEXT_BORDER_BUFFER_PX = 16;

    function measureLongestWordPx(text) {
      const words = String(text || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (!words.length) return 0;
      const prevWidth = messageMeasure.style.width;
      const prevMaxWidth = messageMeasure.style.maxWidth;
      const prevText = messageMeasure.textContent;
      messageMeasure.style.width = 'max-content';
      messageMeasure.style.maxWidth = 'none';
      const cs = getComputedStyle(messageMeasure);
      const fontSize = parseFloat(cs.fontSize) || 16;
      const trackPx = (parseFloat(cs.letterSpacing) || 0) * fontSize;
      let longest = 0;
      for (const word of words) {
        messageMeasure.textContent = word;
        const rectW = Math.ceil(messageMeasure.getBoundingClientRect().width);
        const trackExtra =
          word.length > 1 ? Math.ceil((word.length - 1) * Math.max(0, trackPx)) : 0;
        longest = Math.max(longest, rectW + trackExtra + 4);
      }
      messageMeasure.style.width = prevWidth;
      messageMeasure.style.maxWidth = prevMaxWidth;
      messageMeasure.textContent = prevText;
      return longest;
    }

    function minCardWidthForLongestWord(text, cardBtn) {
      const longest = measureLongestWordPx(text);
      if (!longest) return 0;
      const pad = readArticleInsets(cardBtn);
      const cs = getComputedStyle(messageMeasure);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const articleMin = Math.ceil(longest + padX + 2 * TEXT_BORDER_BUFFER_PX);
      return Math.ceil(pad.left + pad.right + 2 * pad.border + articleMin + 4);
    }

    function minCardWidthForFace() {
      const pad = readArticleInsets(cardGood.btn);
      frontMarkMeasure.style.width = 'auto';
      frontMarkMeasure.style.maxWidth = 'none';
      let contentW = 0;
      frontMarkMeasure.querySelectorAll(
        '.quilt-mood-triptych__mark-label, .quilt-mood-triptych__icon-symbol'
      ).forEach((el) => {
        contentW = Math.max(contentW, Math.ceil(el.getBoundingClientRect().width));
      });
      const cs = getComputedStyle(frontMarkMeasure);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      return Math.ceil(pad.left + pad.right + 2 * pad.border + contentW + padX + 6);
    }

    let lengthProbe = null;

    function resolveTriptychLengthPx(varName, fallbackPx) {
      if (!lengthProbe) {
        lengthProbe = document.createElement('div');
        lengthProbe.setAttribute('aria-hidden', 'true');
        lengthProbe.style.cssText =
          'position:absolute;visibility:hidden;pointer-events:none;height:0;overflow:hidden;';
        host.appendChild(lengthProbe);
      }
      lengthProbe.style.width = `var(${varName}, ${fallbackPx}px)`;
      const px = lengthProbe.getBoundingClientRect().width;
      lengthProbe.style.width = '0';
      return px > 0 ? px : fallbackPx;
    }

    function measureFrontMarkInkRect(frontMarkEl) {
      const nodes = frontMarkEl.querySelectorAll(
        '.quilt-mood-triptych__mark-label, .quilt-mood-triptych__icon-symbol'
      );
      if (!nodes.length) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let trimRight = 0;
      nodes.forEach((node) => {
        const r = node.getBoundingClientRect();
        if (r.width <= 0 && r.height <= 0) return;
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
        if (node.classList.contains('quilt-mood-triptych__mark-label')) {
          const ls = parseFloat(getComputedStyle(node).letterSpacing) || 0;
          if (ls > 0) trimRight = Math.max(trimRight, ls);
        } else if (node.classList.contains('quilt-mood-triptych__icon-symbol')) {
          trimRight = Math.max(trimRight, r.width * 0.08);
        }
      });
      if (!Number.isFinite(minX)) return null;
      if (trimRight > 0) maxX -= trimRight;
      return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
    }

    function measureMessageInkRect(messageEl) {
      const text = messageEl.firstChild;
      if (text?.nodeType === Node.TEXT_NODE && text.textContent?.trim()) {
        const range = document.createRange();
        range.selectNodeContents(messageEl);
        const rects = range.getClientRects();
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (r.width <= 0 && r.height <= 0) continue;
          minX = Math.min(minX, r.left);
          minY = Math.min(minY, r.top);
          maxX = Math.max(maxX, r.right);
          maxY = Math.max(maxY, r.bottom);
        }
        if (Number.isFinite(minX)) {
          return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
        }
      }
      const r = messageEl.getBoundingClientRect();
      const cs = getComputedStyle(messageEl);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const padT = parseFloat(cs.paddingTop) || 0;
      const padB = parseFloat(cs.paddingBottom) || 0;
      return {
        left: r.left + padL,
        top: r.top + padT,
        width: Math.max(0, r.width - padL - padR),
        height: Math.max(0, r.height - padT - padB),
      };
    }

    function readTypeWindowGutters(contentEl) {
      const isBackMessage = contentEl.classList.contains('quilt-mood-triptych__message');
      return {
        gutterXStart: resolveTriptychLengthPx(
          isBackMessage
            ? '--triptych-halftone-clear-gutter-back-x'
            : '--triptych-halftone-clear-gutter-x',
          isBackMessage ? 2 : 6
        ),
        gutterXEnd: resolveTriptychLengthPx(
          isBackMessage
            ? '--triptych-halftone-clear-gutter-back-x-end'
            : '--triptych-halftone-clear-gutter-x-end',
          isBackMessage ? 1 : 3
        ),
        gutterY: resolveTriptychLengthPx(
          isBackMessage
            ? '--triptych-halftone-clear-gutter-back-y'
            : '--triptych-halftone-clear-gutter-y',
          1
        )
      };
    }

    function measureTypeWindowRect(faceEl, contentEl) {
      if (!contentEl || !faceEl) return null;

      const { gutterXStart, gutterXEnd, gutterY } = readTypeWindowGutters(contentEl);
      const ink = contentEl.classList.contains('quilt-mood-triptych__front-mark')
        ? measureFrontMarkInkRect(contentEl)
        : measureMessageInkRect(contentEl);
      if (!ink) return null;

      const faceRect = faceEl.getBoundingClientRect();
      const articleRect = contentEl.getBoundingClientRect();
      const aLeft = articleRect.left - faceRect.left;
      const aTop = articleRect.top - faceRect.top;
      const aRight = aLeft + articleRect.width;
      const aBottom = aTop + articleRect.height;

      let top = ink.top - faceRect.top - gutterY;
      let left = ink.left - faceRect.left - gutterXStart;
      let width = ink.width + gutterXStart + gutterXEnd;
      let height = ink.height + 2 * gutterY;

      left = Math.max(aLeft, left);
      top = Math.max(aTop, top);
      width = Math.min(width, aRight - left);
      height = Math.min(height, aBottom - top);

      return {
        top,
        left,
        width: Math.max(0, width),
        height: Math.max(0, height)
      };
    }

    function unionTypeWindowRects(rectA, rectB) {
      if (!rectA) return rectB;
      if (!rectB) return rectA;
      const left = Math.min(rectA.left, rectB.left);
      const top = Math.min(rectA.top, rectB.top);
      const right = Math.max(rectA.left + rectA.width, rectB.left + rectB.width);
      const bottom = Math.max(rectA.top + rectA.height, rectB.top + rectB.height);
      return {
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top)
      };
    }

    function applyTypeWindowRect(win, rect) {
      if (!win || !rect) return;
      const topPx = `${Math.round(rect.top)}px`;
      const leftPx = `${Math.round(rect.left)}px`;
      const widthPx = `${Math.round(rect.width)}px`;
      const heightPx = `${Math.round(rect.height)}px`;
      if (win.style.top !== topPx) win.style.top = topPx;
      if (win.style.left !== leftPx) win.style.left = leftPx;
      if (win.style.width !== widthPx) win.style.width = widthPx;
      if (win.style.height !== heightPx) win.style.height = heightPx;
      if (win.style.right !== 'auto') win.style.right = 'auto';
      if (win.style.bottom !== 'auto') win.style.bottom = 'auto';
    }

    function syncCardTypeWindows(faceFront, faceBack, frontMark, messageEl, cardBtn, { isChosenCard = false } = {}) {
      const frontWin = faceFront?.querySelector('.quilt-mood-triptych__type-window');
      const backWin = faceBack?.querySelector('.quilt-mood-triptych__type-window');
      if (!frontWin && !backWin) return;

      const frontRect = measureTypeWindowRect(faceFront, frontMark);
      const unifyForDesktopFlip =
        !useIos2dFlip &&
        host.classList.contains('is-flipping') &&
        !host.classList.contains('is-open');

      if (unifyForDesktopFlip) {
        const backRect = measureTypeWindowRect(faceBack, messageEl);
        const unified = unionTypeWindowRects(frontRect, backRect);
        applyTypeWindowRect(frontWin, unified);
        clearBackTypeWindowInlineLayout(backWin);
        return;
      }

      applyTypeWindowRect(frontWin, frontRect);
      clearBackTypeWindowInlineLayout(backWin);

      if (backWin && isChosenCard) {
        backWin.style.removeProperty('visibility');
      }
    }

    function syncAllTypeWindows({ force = false } = {}) {
      if (animating && !force) return;
      [cardGood, cardRough].forEach(({ btn, messageEl }) => {
        const flip = btn.querySelector('.quilt-mood-triptych__flip');
        if (!flip) return;
        const faceFront = flip.querySelector('.quilt-mood-triptych__face--front');
        const faceBack = flip.querySelector('.quilt-mood-triptych__face--back');
        syncCardTypeWindows(
          faceFront,
          faceBack,
          faceFront?.querySelector('.quilt-mood-triptych__front-mark'),
          messageEl,
          btn,
          { isChosenCard: mood !== null && btn.dataset.mood === mood }
        );
      });
    }

    function syncSheetMetrics() {
      if (animating) return;
      const hostW = host.getBoundingClientRect().width;
      if (hostW < 48) {
        if (host.classList.contains('is-ready') && layoutRetryTimer == null) scheduleLayoutPass();
        return;
      }
      syncJustifyMeasureFont();
      const rowStyle = getComputedStyle(row);
      const padInline =
        (parseFloat(rowStyle.paddingLeft) || 0) + (parseFloat(rowStyle.paddingRight) || 0);
      const breatheSide =
        parseFloat(getComputedStyle(host).getPropertyValue('--triptych-or-breathe')) || 0;
      const orWidth = Math.max(
        orDivider.getBoundingClientRect().width,
        orDivider.scrollWidth,
        parseFloat(getComputedStyle(orDivider).fontSize) * 1.35
      );
      let gap = parseFloat(rowStyle.columnGap || rowStyle.gap) || 0;
      const gapFloor = Math.ceil(orWidth + breatheSide * 2);
      if (gap < gapFloor) {
        gap = gapFloor;
        row.style.setProperty('--triptych-mood-gap', `${gap}px`);
      }
      const rowInnerW = Math.max(96, hostW - padInline);
      const available = Math.max(96, rowInnerW - gap);
      const maxCardW = Math.floor(available / 2);
      const faceFloor = Math.min(minCardWidthForFace(), Math.floor(available * 0.52));
      const wordMinGood = minCardWidthForLongestWord(goodDay, cardGood.btn);
      const wordMinRough = minCardWidthForLongestWord(roughDay, cardRough.btn);
      const hardMin = Math.max(48, faceFloor, wordMinGood, wordMinRough);
      let wEqual =
        hardMin <= maxCardW
          ? findOptimalSharedCardWidth(hardMin, maxCardW)
          : maxCardW;
      const maxFitW = maxCardW;
      const maxHostW = maxCardW;
      wEqual = Math.min(
        Math.max(hardMin, Math.round(wEqual * 1.1)),
        maxFitW,
        maxHostW
      );
      const wPx = `${wEqual}px`;
      if (row.style.getPropertyValue('--triptych-good-w') !== wPx) {
        row.style.setProperty('--triptych-good-w', wPx);
      }
      if (row.style.getPropertyValue('--triptych-rough-w') !== wPx) {
        row.style.setProperty('--triptych-rough-w', wPx);
      }
      if (cardGood.btn.style.getPropertyValue('--triptych-card-w') !== wPx) {
        cardGood.btn.style.setProperty('--triptych-card-w', wPx);
      }
      if (cardRough.btn.style.getPropertyValue('--triptych-card-w') !== wPx) {
        cardRough.btn.style.setProperty('--triptych-card-w', wPx);
      }
      syncCardHeights(wEqual);
      syncAllTypeWindows();
    }

    function remeasure({ force = false } = {}) {
      if (animating && !force) return;
      if (remeasureRaf != null) return;
      remeasureRaf = requestAnimationFrame(() => {
        remeasureRaf = null;
        if (animating && !force) return;
        syncArticleLayout();
        syncSheetMetrics();
        requestAnimationFrame(() => {
          if (animating && !force) return;
          syncArticleLayout();
          syncSheetMetrics();
          syncAllTypeWindows();
          applyHandCutClips([cardGood.btn, cardRough.btn], dateKey);
          global.OdqScannerBed?.bootstrapTriptych?.(host, dateKey);
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

    function syncChosenTypeWindows() {
      if (mood !== 'good' && mood !== 'rough') return;
      const chosen = mood === 'good' ? cardGood : cardRough;
      const flip = chosen.flip;
      const faceFront = flip.querySelector('.quilt-mood-triptych__face--front');
      const faceBack = flip.querySelector('.quilt-mood-triptych__face--back');
      syncCardTypeWindows(
        faceFront,
        faceBack,
        faceFront?.querySelector('.quilt-mood-triptych__front-mark'),
        chosen.messageEl,
        chosen.btn,
        { isChosenCard: true }
      );
    }

    /** Back wash uses CSS insets — clear inline dims so flip can show it immediately. */
    function primeChosenBackTypeWindow(chosen) {
      const backWin = chosen.flip
        .querySelector('.quilt-mood-triptych__face--back')
        ?.querySelector('.quilt-mood-triptych__type-window');
      if (!backWin) return;
      clearBackTypeWindowInlineLayout(backWin);
      backWin.style.removeProperty('visibility');
    }

    function finishPick(fromUser) {
      animating = false;
      pickPhase = 'open';
      host.classList.remove('is-flipping');
      host.classList.add('is-open');
      applyMoodClasses();
      const chosen = mood === 'good' ? cardGood : cardRough;
      if (useIos2dFlip) {
        applyIosOpenFaces(chosen);
      }
      syncChosenTypeWindows();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          syncChosenTypeWindows();
          remeasure({ force: true });
        });
      });
      if (fromUser) opts.onSelect?.(mood);
    }

    function openMood(next, { instant = false, fromUser = false } = {}) {
      if (next !== 'good' && next !== 'rough') return;
      if (mood !== null && mood !== next) return;
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
        sibling.classList.add('is-dismissed');
        applyMoodClasses();
        remeasure();
        if (useIos2dFlip) {
          chosen.flip.style.transform = 'rotateY(180deg) translateZ(0)';
        }
        host.classList.add('is-open');
        finishPick(fromUser);
        requestAnimationFrame(() => host.classList.remove('is-instant'));
        return;
      }

      applyMoodClasses();

      animating = true;
      pickPhase = 'flipping';
      host.classList.add('is-flipping');
      syncAllTypeWindows({ force: true });
      primeChosenBackTypeWindow(chosen);

      const flipMs = reducedMotion ? REDUCED_FLIP_MS : FLIP_MS;
      let flipDone = false;

      function maybeFinishPick() {
        if (!flipDone) return;
        finishPick(fromUser);
      }

      function armFlipTransition() {
        flipDone = false;

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
      }

      function beginPickAnimation() {
        void sibling.offsetWidth;
        sibling.classList.add('is-dismissed');
        void chosen.flip.offsetWidth;

        const runCssFlip = () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              host.classList.add('is-open');
              applyMoodClasses();
              armFlipTransition();
            });
          });
        };

        if (useIos2dFlip) {
          const flipEl = chosen.flip;
          const iosFlipMs = reducedMotion ? 0 : IOS_FLIP_MS;

          if (reducedMotion) {
            flipEl.style.transform = 'rotateY(180deg) translateZ(0)';
            host.classList.add('is-open');
            applyMoodClasses();
            flipDone = true;
            maybeFinishPick();
            return;
          }

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              clearIosFlipAnimation();
              clearIosFaceInlineStyles();
              flipEl.style.transform = 'rotateY(0deg) translateZ(0)';
              flipDone = false;
              primeChosenBackTypeWindow(chosen);

              const revealIosBackHalfway = () => {
                applyIosOpenFaces(chosen);
                syncChosenTypeWindows();
              };
              scheduleAnimation(revealIosBackHalfway, Math.round(iosFlipMs * 0.48));

              const finishIosRotate = () => {
                if (flipDone) return;
                clearIosFlipAnimation();
                flipEl.style.transform = 'rotateY(180deg) translateZ(0)';
                host.classList.add('is-open');
                applyMoodClasses();
                flipDone = true;
                maybeFinishPick();
              };

              iosFlipEndListener = (e) => {
                if (e.target !== flipEl) return;
                const name = e.animationName || '';
                if (name !== 'triptych-ios-rotate-flip' && name !== 'webkit-triptych-ios-rotate-flip') {
                  return;
                }
                finishIosRotate();
              };
              flipEl.addEventListener('animationend', iosFlipEndListener);
              flipEl.classList.add('is-ios-flip-playing');
              scheduleAnimation(finishIosRotate, iosFlipMs + 120);
            });
          });
          return;
        }

        runCssFlip();
      }

      void chosen.flip.offsetWidth;
      requestAnimationFrame(() => {
        requestAnimationFrame(beginPickAnimation);
      });
    }

    function resetMood({ instant = false, force = false } = {}) {
      if (!force) {
        if (!mood && !host.classList.contains('is-open')) return;
        if (animating) return;
      }

      clearAnimationTimers();
      clearDismissTransitionListener();
      clearFlipTransitionListener();
      clearActiveFlipAnimation();
      const prev = mood;
      mood = null;
      pickPhase = 'idle';
      animating = !instant;

      cardGood.btn.classList.remove('is-chosen', 'is-dismissed', 'is-dismissed-gone');
      cardRough.btn.classList.remove('is-chosen', 'is-dismissed', 'is-dismissed-gone');
      host.classList.remove('is-good', 'is-rough', 'is-open', 'is-locked', 'is-flipping');

      if (instant) {
        host.classList.add('is-instant');
        applyMoodClasses();
        remeasure({ force: true });
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
      if (mood !== null) return;

      openMood(picked, { fromUser: true });
    }

    cardGood.btn.addEventListener('click', () => handleCardClick(cardGood.btn));
    cardRough.btn.addEventListener('click', () => handleCardClick(cardRough.btn));

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
      applyTriptychQuoteDisplaySize(quoteImg, quoteWrap, {
        quoteDisplayWidthPx,
        quoteRenderWidth: opts.quoteRenderWidth
      });
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
          resetMood({ instant: !!options.instant, force: !!options.force });
        }
      },
      getMood: () => mood,
      reset: () => resetMood(),
      remeasure,
      destroy() {
        clearAnimationTimers();
        clearDismissTransitionListener();
        clearFlipTransitionListener();
        clearActiveFlipAnimation();
        if (remeasureRaf != null) {
          cancelAnimationFrame(remeasureRaf);
          remeasureRaf = null;
        }
        if (layoutRetryTimer != null) {
          global.clearTimeout(layoutRetryTimer);
          layoutRetryTimer = null;
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
    host.classList.remove('is-good', 'is-rough', 'is-open', 'is-ready', 'is-instant', 'is-locked');
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
    TRIPTYCH_BUILD,
    STYLE_ID,
    DISMISS_MS,
    DIM_MS,
    OPEN_START_DELAY_MS,
    UNFOLD_MS: FLIP_MS,
    FLIP_MS
  };
});
