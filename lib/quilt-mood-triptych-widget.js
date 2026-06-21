/**
 * Mood triptych: peek quote + unified scratch ticket (good | OR | rough).
 * Scratch one zone to reveal that day's message; sibling dims in place.
 * Flip-card machinery kept behind SCRATCH_MODE for rollback.
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

  const STYLE_ID = 'quilt-mood-triptych-widget-styles-v1102';
  const TRIPTYCH_BUILD = 'v1102';
  const MOOD_PICK_STORAGE_KEY = 'ourDailyQuiltMoodPick';
  /** Scratch ticket off — flip cards active; scratch code kept for rollback. */
  const SCRATCH_MODE = false;
  const SCRATCH_REVEAL_THRESHOLD = 0.62;
  const SCRATCH_BRUSH_MIN = 28;
  const SCRATCH_BRUSH_MAX = 72;
  const SCRATCH_BRUSH_ZONE_FRAC = 0.28;
  const SCRATCH_MOVE_COMMIT_PX = 12;
  /** Per-day mood copy: largest size that still fits the card (px). */
  const TRIPTYCH_BODY_MIN_PX = 17;
  const TRIPTYCH_BODY_MAX_PX = 38;
  const TRIPTYCH_JUSTIFY_GAP_MAX = 2.35;

  try {
    console.info('[triptych] script loaded', TRIPTYCH_BUILD);
  } catch (_) {
    /* */
  }
  /** iOS rotateY keyframes — same 3D stack as desktop; WKWebView skips CSS transitions. */
  const IOS_FLIP_MS = 560;
  const DISMISS_MS = 1000;
  const DIM_MS = 560;
  const FLIP_MS = 560;
  const REDUCED_DISMISS_MS = 400;
  const REDUCED_DIM_MS = 180;
  const REDUCED_FLIP_MS = 280;
  /** Flip-only reveal — sibling dims in parallel but finish waits on flip. */
  const OPEN_START_DELAY_MS = 0;

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
        --triptych-quote-gap: clamp(0.55rem, 3.4vw, 1rem);
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
        --triptych-body-size: clamp(1.0625rem, 5.4vw, 2.375rem);
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
        /* Keep solid message wash off the vintage ink border stroke. */
        --triptych-back-message-border-gap: clamp(0.28rem, 2.4vw, 0.52rem);
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
        /* Let vertical scroll pass through cards/quote on WKWebView (manipulation fights pan-y). */
        touch-action: pan-y;
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
        transform: translate(clamp(-10px, -2.4vw, -4px), clamp(-4px, -0.8vw, -1px))
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
        touch-action: pan-y;
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
        --triptych-card-face-fill: var(--triptych-good-fill);
        --triptych-card-fill-light: var(--triptych-good-fill-light);
        --triptych-card-fill-dark: var(--triptych-good-fill-dark);
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

      /* Dot-free riso wash behind front HERE/NOW + icon (back message carries its own background). */
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

      #screen-quilt .quilt-mood-triptych__face--back .quilt-mood-triptych__type-window {
        display: none;
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
        top: calc(
          var(--triptych-article-inset-top) + var(--triptych-back-dot-band-y) +
          var(--triptych-back-message-border-gap)
        );
        right: auto;
        bottom: calc(
          var(--triptych-article-inset-bottom) + var(--triptych-back-dot-band-y) +
          var(--triptych-back-message-border-gap)
        );
        left: calc(
          var(--triptych-article-inset-left) + var(--triptych-back-message-border-gap)
        );
        display: block;
        width: fit-content;
        max-width: calc(
          100% - var(--triptych-article-inset-left) - var(--triptych-article-inset-right) -
          (2 * var(--triptych-back-message-border-gap))
        );
        height: fit-content;
        max-height: 100%;
        margin-top: auto;
        margin-bottom: auto;
        transform: none;
        z-index: 3;
        background-color: var(
          --triptych-card-fill-light,
          var(--triptych-card-face-fill, var(--triptych-good-fill))
        );
        padding: var(--triptych-copy-pad-y) clamp(0.42rem, 4.2vw, 0.72rem);
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

      /* Match back-face message padding so card height fits flipped copy. */
      #screen-quilt .quilt-mood-triptych__message--measure.quilt-mood-triptych__message--back-measure {
        padding: var(--triptych-message-pad-back-y)
          clamp(0.42rem, 4.2vw, 0.72rem);
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

      /* --- Scratch ticket (unified card, two zones) --- */
      #screen-quilt .quilt-mood-triptych.is-scratch-mode .quilt-mood-triptych__row--legacy {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
        clip-path: inset(50%);
        visibility: hidden;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-triptych__scratch-row {
        display: flex;
        justify-content: center;
        width: 100%;
        padding-top: clamp(0.2rem, 1.4vw, 0.65rem);
        padding-bottom: clamp(0.15rem, 1vw, 0.45rem);
        touch-action: pan-y;
      }

      #screen-quilt .quilt-mood-triptych__ticket {
        display: grid;
        grid-template-columns: var(--triptych-good-w, 1fr) auto var(--triptych-rough-w, 1fr);
        align-items: end;
        gap: var(--triptych-mood-gap);
        width: min(var(--triptych-mood-row-width), 100%);
        max-width: 100%;
        margin: 0 auto;
        padding-inline: var(--triptych-row-inset, clamp(0.55rem, 3.6vw, 1.15rem));
        box-sizing: border-box;
        position: relative;
        filter: var(--triptych-card-shadow);
      }

      #screen-quilt .quilt-mood-triptych__zone {
        appearance: none;
        -webkit-appearance: none;
        margin: 0;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: crosshair;
        position: relative;
        display: block;
        width: var(--triptych-card-w, 100%);
        height: var(--triptych-cell-h, auto);
        min-height: var(--triptych-cell-h, auto);
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
        touch-action: pan-y;
        box-sizing: border-box;
        text-align: left;
      }

      #screen-quilt .quilt-mood-triptych__zone--good {
        z-index: 2;
        transform: translate(clamp(-4px, -1vw, -1px), clamp(3px, 1.2vw, 8px)) rotate(-2.4deg);
        transform-origin: 36% 92%;
      }

      #screen-quilt .quilt-mood-triptych__zone--rough {
        z-index: 1;
        transform: translate(clamp(1px, 1vw, 5px), clamp(-3px, -0.8vw, 2px)) rotate(2.8deg);
        transform-origin: 64% 90%;
      }

      #screen-quilt .quilt-mood-triptych__zone.is-chosen {
        z-index: 6;
        transform: none;
        filter: none;
      }

      #screen-quilt .quilt-mood-triptych__zone-surface {
        position: absolute;
        inset: 0;
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
        overflow: hidden;
      }

      #screen-quilt .quilt-mood-triptych__zone--good .quilt-mood-triptych__zone-surface {
        --triptych-card-face-fill: var(--triptych-good-fill);
        --triptych-card-fill-light: var(--triptych-good-fill-light);
        --triptych-card-fill-dark: var(--triptych-good-fill-dark);
      }

      #screen-quilt .quilt-mood-triptych__zone--rough .quilt-mood-triptych__zone-surface {
        --triptych-card-face-fill: var(--triptych-good-fill);
        --triptych-card-fill-light: var(--triptych-good-fill-light);
        --triptych-card-fill-dark: var(--triptych-good-fill-dark);
        --triptych-riso-mask-x: 47%;
        --triptych-riso-mask-y: 53%;
      }

      #screen-quilt .quilt-mood-triptych__zone-surface::after {
        content: '';
        position: absolute;
        top: calc(var(--triptych-pad-top) - var(--triptych-bleed-top, 0px));
        right: calc(var(--triptych-pad-right) - var(--triptych-bleed-right, 0px));
        bottom: calc(var(--triptych-pad-bottom) - var(--triptych-bleed-bottom, 0px));
        left: calc(var(--triptych-pad-left) - var(--triptych-bleed-left, 0px));
        background-color: var(--triptych-card-fill-light, var(--triptych-card-face-fill, var(--triptych-good-fill)));
        pointer-events: none;
        z-index: 1;
      }

      #screen-quilt .quilt-mood-triptych__zone-surface::before {
        content: '';
        position: absolute;
        top: calc(var(--triptych-pad-top) - var(--triptych-bleed-top, 0px));
        right: calc(var(--triptych-pad-right) - var(--triptych-bleed-right, 0px));
        bottom: calc(var(--triptych-pad-bottom) - var(--triptych-bleed-bottom, 0px));
        left: calc(var(--triptych-pad-left) - var(--triptych-bleed-left, 0px));
        box-sizing: border-box;
        pointer-events: none;
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

      #screen-quilt .quilt-mood-triptych__zone-surface > .odq-scanner-bed {
        top: var(--triptych-article-inset-top);
        right: var(--triptych-article-inset-right);
        bottom: var(--triptych-article-inset-bottom);
        left: var(--triptych-article-inset-left);
      }

      #screen-quilt .quilt-mood-triptych__zone-idle {
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
        z-index: 11;
        pointer-events: none;
      }

      /* Prize text stays hidden until scratch strokes break the foil. */
      #screen-quilt .quilt-mood-triptych__zone:not(.is-scratch-progress):not(.is-revealed)
        .quilt-mood-triptych__zone-message {
        visibility: hidden;
      }

      #screen-quilt .quilt-mood-triptych__zone-message {
        position: absolute;
        top: calc(
          var(--triptych-article-inset-top) + var(--triptych-back-dot-band-y) +
          var(--triptych-back-message-border-gap)
        );
        right: auto;
        bottom: calc(
          var(--triptych-article-inset-bottom) + var(--triptych-back-dot-band-y) +
          var(--triptych-back-message-border-gap)
        );
        left: calc(
          var(--triptych-article-inset-left) + var(--triptych-back-message-border-gap)
        );
        display: block;
        width: fit-content;
        max-width: calc(
          100% - var(--triptych-article-inset-left) - var(--triptych-article-inset-right) -
          (2 * var(--triptych-back-message-border-gap))
        );
        margin-top: auto;
        margin-bottom: auto;
        box-sizing: border-box;
        padding: var(--triptych-copy-pad-y) clamp(0.42rem, 4.2vw, 0.72rem);
        z-index: 4;
        background-color: var(
          --triptych-card-fill-light,
          var(--triptych-card-face-fill, var(--triptych-good-fill))
        );
        font-family: var(--triptych-copy-font);
        font-size: var(--triptych-body-size);
        font-weight: var(--triptych-message-weight, 500);
        line-height: var(--triptych-copy-line-height);
        text-align: left;
        color: var(--triptych-copy-ink);
        letter-spacing: var(--triptych-copy-tracking);
        text-shadow: var(--triptych-copy-ink-shadow);
        pointer-events: none;
        white-space: normal;
        word-break: normal;
        overflow-wrap: break-word;
        hyphens: auto;
      }

      #screen-quilt .quilt-mood-triptych__zone.is-revealed .quilt-mood-triptych__zone-message {
        visibility: visible;
      }

      #screen-quilt .quilt-mood-triptych__scratch-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 10;
        touch-action: none;
        cursor: crosshair;
        opacity: 1;
      }

      #screen-quilt .quilt-mood-triptych__zone:not(.is-scratch-ready) .quilt-mood-triptych__scratch-canvas {
        opacity: 0;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-triptych__zone.is-scratching .quilt-mood-triptych__scratch-canvas {
        cursor: grabbing;
      }

      #screen-quilt .quilt-mood-triptych__zone.is-scratching .quilt-mood-triptych__zone-idle {
        opacity: 0.72;
        transition: opacity 180ms ease;
      }

      #screen-quilt .quilt-mood-triptych__zone.is-scratch-progress .quilt-mood-triptych__zone-idle {
        opacity: 0;
        visibility: hidden;
      }

      #screen-quilt .quilt-mood-triptych__zone.is-revealed .quilt-mood-triptych__scratch-canvas {
        opacity: 0;
        pointer-events: none;
        transition: opacity 680ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      #screen-quilt .quilt-mood-triptych.is-instant .quilt-mood-triptych__zone.is-revealed .quilt-mood-triptych__scratch-canvas {
        transition: none;
      }

      #screen-quilt .quilt-mood-triptych__zone.is-revealed .quilt-mood-triptych__zone-idle {
        display: none;
      }

      #screen-quilt .quilt-mood-triptych__zone.is-dismissed {
        pointer-events: none;
        z-index: 1;
      }

      #screen-quilt .quilt-mood-triptych__zone.is-dismissed::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 20;
        pointer-events: none;
        background: rgba(30, 24, 18, 0.4);
        opacity: 0;
        transition: opacity var(--triptych-dim-ms) var(--triptych-dismiss-ease);
      }

      #screen-quilt .quilt-mood-triptych__zone.is-dismissed:not(.is-dismissed-gone)::after {
        opacity: 1;
      }

      #screen-quilt .quilt-mood-triptych.is-instant .quilt-mood-triptych__zone.is-dismissed::after {
        transition: none;
      }

      #screen-quilt .quilt-mood-triptych__ticket .quilt-mood-triptych__or {
        position: relative;
        left: auto;
        top: auto;
        transform: none;
        align-self: start;
        margin-top: 10%;
        z-index: 3;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-triptych.is-good .quilt-mood-triptych__zone--good.is-chosen {
        grid-column: 1;
      }

      #screen-quilt .quilt-mood-triptych.is-rough .quilt-mood-triptych__zone--rough.is-chosen {
        grid-column: 3;
      }

      #screen-quilt .quilt-mood-triptych__zone:focus-visible {
        outline: 2px solid rgba(0, 0, 0, 0.35);
        outline-offset: 2px;
      }

      #screen-quilt .quilt-mood-triptych.is-locked .quilt-mood-triptych__zone {
        cursor: default;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-triptych__zone.is-scratching {
        touch-action: none;
      }

      #screen-quilt .quilt-mood-triptych__announcer {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
        clip-path: inset(50%);
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

  function buildScratchZone(mood, message, iconName) {
    const zone = document.createElement('button');
    zone.type = 'button';
    zone.className = `quilt-mood-triptych__zone quilt-mood-triptych__zone--${mood}`;
    zone.dataset.mood = mood;
    zone.setAttribute(
      'aria-label',
      mood === 'good' ? 'Scratch to reveal good-day message' : 'Scratch to reveal rough-day message'
    );
    zone.setAttribute('aria-expanded', 'false');

    const surface = document.createElement('div');
    surface.className = 'quilt-mood-triptych__zone-surface';

    const borderFrame = buildBorderFrame();
    surface.appendChild(borderFrame);

    const idle = document.createElement('div');
    idle.className = 'quilt-mood-triptych__zone-idle';
    const frontMark = document.createElement('div');
    frontMark.className = 'quilt-mood-triptych__front-mark';
    const frontStack = buildFrontMarkStack(iconName);
    frontMark.append(frontStack.labelHere, frontStack.iconSymbol, frontStack.labelNow);
    idle.appendChild(frontMark);

    const messageEl = document.createElement('div');
    messageEl.className = 'quilt-mood-triptych__zone-message';
    messageEl.textContent = message;
    surface.appendChild(messageEl);

    const canvas = document.createElement('canvas');
    canvas.className = 'quilt-mood-triptych__scratch-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    zone.append(surface, canvas, idle);
    return { zone, surface, canvas, messageEl, idle };
  }

  function buildScratchTicket(goodDay, roughDay) {
    const scratchRow = document.createElement('div');
    scratchRow.className = 'quilt-mood-triptych__scratch-row';

    const ticket = document.createElement('div');
    ticket.className = 'quilt-mood-triptych__ticket';

    const zoneGood = buildScratchZone('good', goodDay, MOOD_ICONS.good);
    const zoneRough = buildScratchZone('rough', roughDay, MOOD_ICONS.rough);

    const orDivider = document.createElement('span');
    orDivider.className = 'quilt-mood-triptych__or';
    orDivider.setAttribute('aria-hidden', 'true');
    orDivider.textContent = 'OR';

    ticket.append(zoneGood.zone, orDivider, zoneRough.zone);
    scratchRow.appendChild(ticket);

    return {
      scratchRow,
      ticket,
      zoneGood,
      zoneRough,
      orDivider
    };
  }

  function drawScratchFoil(ctx, width, height, mood) {
    if (!ctx || width < 1 || height < 1) return;
    const seed = mood === 'rough' ? 0.62 : 0.38;
    ctx.globalCompositeOperation = 'source-over';
    /* Solid paper-toner base — must be fully opaque so prize copy cannot bleed through. */
    ctx.fillStyle = mood === 'rough' ? 'rgb(168, 148, 132)' : 'rgb(198, 182, 168)';
    ctx.fillRect(0, 0, width, height);

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, 'rgba(255, 252, 248, 0.35)');
    grad.addColorStop(0.5, 'rgba(108, 88, 74, 0.12)');
    grad.addColorStop(1, 'rgba(72, 58, 48, 0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const dotStep = 4;
    ctx.fillStyle = 'rgba(42, 34, 28, 0.14)';
    for (let y = 0; y < height; y += dotStep) {
      for (let x = ((y / dotStep) % 2) * 2; x < width; x += dotStep) {
        if (((x * 13 + y * 7 + seed * 100) | 0) % 4 === 0) {
          ctx.fillRect(x, y, 1.2, 1.2);
        }
      }
    }

    ctx.strokeStyle = 'rgba(42, 34, 28, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const y = ((i + 1) / 9) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y + (i % 2 ? 2 : -2));
      ctx.stroke();
    }
  }

  function resizeScratchCanvas(canvas, zoneEl, opts = {}) {
    if (!canvas || !zoneEl) return null;
    const rect = zoneEl.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    const sizeChanged = canvas.width !== pxW || canvas.height !== pxH;
    if (sizeChanged) {
      canvas.width = pxW;
      canvas.height = pxH;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sizeChanged && opts.redrawFoil !== false) {
      const mood = opts.mood || canvas.dataset.scratchMood || 'good';
      drawScratchFoil(ctx, cssW, cssH, mood);
    }
    return { ctx, cssW, cssH, sizeChanged };
  }

  function sampleScratchProgress(canvas) {
    if (!canvas || canvas.width < 1 || canvas.height < 1) return 0;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const step = 8;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    let total = 0;
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const i = (y * canvas.width + x) * 4 + 3;
        total++;
        if (data[i] < 48) transparent++;
      }
    }
    return total > 0 ? transparent / total : 0;
  }

  /**
   * @param {{
   *   zoneEl: HTMLElement,
   *   canvas: HTMLCanvasElement,
   *   mood: 'good'|'rough',
   *   reducedMotion?: boolean,
   *   onCommit: (mood: 'good'|'rough') => void,
   *   onRevealComplete: () => void
   * }} cfg
   */
  function mountScratchEngine(cfg) {
    const { zoneEl, canvas, mood, reducedMotion = false } = cfg;
    canvas.dataset.scratchMood = mood;
    let painting = false;
    let lastX = 0;
    let lastY = 0;
    let moveTotal = 0;
    let strokeCount = 0;
    let revealed = false;
    let committed = false;
    let scratchCtx = null;
    let scratchCssW = 0;
    let scratchCssH = 0;

    function tryCommit() {
      if (committed) return;
      committed = true;
      cfg.onCommit?.(mood);
    }

    function localPoint(clientX, clientY) {
      const rect = zoneEl.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function brushRadius() {
      const base = Math.min(scratchCssW || zoneEl.clientWidth, scratchCssH || zoneEl.clientHeight);
      return Math.max(
        SCRATCH_BRUSH_MIN,
        Math.min(SCRATCH_BRUSH_MAX, base * SCRATCH_BRUSH_ZONE_FRAC)
      );
    }

    /** Hard coin-edge gouge — flat chip with rough corners, no soft round brush. */
    function scratchCoinStamp(ctx, cx, cy, angle, r, seed = 0) {
      const len = r * 2;
      const thick = r * 0.95;
      const chip = (seed % 7) - 3;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.imageSmoothingEnabled = false;
      ctx.beginPath();
      ctx.moveTo(-len * 0.5, -thick * 0.5);
      ctx.lineTo(len * 0.15 + chip * 0.15, -thick * 0.5);
      ctx.lineTo(len * 0.38, -thick * 0.22);
      ctx.lineTo(len * 0.5, -thick * 0.08);
      ctx.lineTo(len * 0.48, thick * 0.1);
      ctx.lineTo(len * 0.22 + chip * 0.1, thick * 0.5);
      ctx.lineTo(-len * 0.18, thick * 0.48);
      ctx.lineTo(-len * 0.5, thick * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function scratchAlongSegment(x0, y0, x1, y1, r) {
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const step = Math.max(r * 0.28, 3);
      const count = Math.max(1, Math.ceil(dist / step));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        scratchCoinStamp(scratchCtx, x, y, angle, r, Math.round(x * 2 + y * 3 + i));
      }
    }

    function scratchAt(x, y) {
      if (!scratchCtx && !syncCanvas()) return;
      const r = brushRadius();
      scratchCtx.imageSmoothingEnabled = false;
      scratchCtx.globalCompositeOperation = 'destination-out';
      if (lastX === x && lastY === y) {
        scratchCoinStamp(scratchCtx, x, y, 0, r, Math.round(x + y));
      } else {
        scratchAlongSegment(lastX, lastY, x, y, r);
      }
      lastX = x;
      lastY = y;
    }

    function syncCanvas({ forceFoil = false } = {}) {
      const progressBefore = sampleScratchProgress(canvas);
      const sized = resizeScratchCanvas(canvas, zoneEl, {
        mood,
        redrawFoil: forceFoil || progressBefore < 0.005
      });
      if (!sized) return false;
      scratchCtx = sized.ctx;
      scratchCssW = sized.cssW;
      scratchCssH = sized.cssH;
      if (scratchCssW > 8 && scratchCssH > 8) {
        zoneEl.classList.add('is-scratch-ready');
      }
      if (progressBefore >= 0.06) {
        zoneEl.classList.add('is-scratch-progress');
      }
      return true;
    }

    function paintFoil() {
      if (revealed) return;
      if (!syncCanvas({ forceFoil: true })) return;
    }

    function redrawFoil() {
      revealed = false;
      committed = false;
      strokeCount = 0;
      moveTotal = 0;
      zoneEl.classList.remove('is-revealed', 'is-scratching', 'is-scratch-progress', 'is-scratch-ready');
      paintFoil();
    }

    function updateScratchProgress() {
      const progress = sampleScratchProgress(canvas);
      if (progress >= 0.06) {
        zoneEl.classList.add('is-scratch-progress');
      }
      return progress;
    }

    function maybeComplete() {
      if (revealed) return;
      strokeCount++;
      if (strokeCount % 3 !== 0) return;
      const progress = updateScratchProgress();
      if (progress >= SCRATCH_REVEAL_THRESHOLD) {
        revealZone();
      }
    }

    function revealZone() {
      if (revealed) return;
      revealed = true;
      zoneEl.classList.add('is-revealed', 'is-scratch-progress');
      zoneEl.classList.remove('is-scratching');
      cfg.onRevealComplete?.();
    }

    function clearFoilInstant() {
      revealed = true;
      zoneEl.classList.add('is-revealed', 'is-scratch-progress');
      zoneEl.classList.remove('is-scratching');
      if (scratchCtx) {
        scratchCtx.clearRect(0, 0, scratchCssW, scratchCssH);
      }
    }

    function onPointerDown(e) {
      if (revealed || zoneEl.classList.contains('is-dismissed')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (!syncCanvas()) return;
      const pt = localPoint(e.clientX, e.clientY);
      painting = true;
      moveTotal = 0;
      lastX = pt.x;
      lastY = pt.y;
      zoneEl.classList.add('is-scratching');
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {
        /* */
      }
      scratchAt(pt.x, pt.y);
    }

    function onPointerMove(e) {
      if (!painting || revealed) return;
      e.preventDefault();
      const pt = localPoint(e.clientX, e.clientY);
      const dx = pt.x - lastX;
      const dy = pt.y - lastY;
      moveTotal += Math.hypot(dx, dy);
      if (moveTotal < SCRATCH_MOVE_COMMIT_PX) return;
      tryCommit();
      scratchAt(pt.x, pt.y);
      maybeComplete();
    }

    function onPointerUp(e) {
      if (!painting) return;
      painting = false;
      zoneEl.classList.remove('is-scratching');
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* */
      }
      maybeComplete();
    }

    function onKeyDown(e) {
      if (revealed || zoneEl.classList.contains('is-dismissed')) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      tryCommit();
      clearFoilInstant();
      cfg.onRevealComplete?.();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    zoneEl.addEventListener('keydown', onKeyDown);

    redrawFoil();

    return {
      redrawFoil,
      paintFoil,
      syncCanvas,
      revealZone: clearFoilInstant,
      destroy() {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        zoneEl.removeEventListener('keydown', onKeyDown);
      }
    };
  }

  function applyHandCutClipsToTicket(ticket, zones, dateKey) {
    const QNC = global.QuiltNewspaperClipping;
    if (!QNC?.buildHandCutCssClipPath) return;
    zones.forEach((zoneBtn) => {
      const surface = zoneBtn.querySelector('.quilt-mood-triptych__zone-surface');
      if (!surface) return;
      const rect = zoneBtn.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w < 8 || h < 8) return;
      const mood = zoneBtn.dataset.mood;
      const cropEdge = String(zoneBtn.dataset.triptychCropEdge || '').trim();
      const clip = QNC.buildHandCutCssClipPath(w, h, `${dateKey}:triptych:${mood}`, {
        handCutProfile: 'moodTriptych',
        handCutMacroDomPx: 16,
        handCutCornerChamferDomPx: 14,
        moodTriptychCropEdge: cropEdge
      });
      if (!clip) {
        surface.style.clipPath = '';
        surface.style.webkitClipPath = '';
        return;
      }
      surface.style.clipPath = clip;
      surface.style.webkitClipPath = clip;
    });
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
    if (SCRATCH_MODE) host.classList.add('is-scratch-mode');

    const quoteWrap = document.createElement('div');
    quoteWrap.className = 'quilt-mood-triptych__quote';

    const quoteShadow = document.createElement('div');
    quoteShadow.className = 'quilt-mood-triptych__quote-shadow';

    const quoteImg = document.createElement('img');
    quoteImg.className = 'quilt-mood-triptych__quote-img quilt-mood-spread__quote-img';
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
    if (SCRATCH_MODE) row.classList.add('quilt-mood-triptych__row--legacy');

    const cardGood = buildCard('good', goodDay, MOOD_ICONS.good);
    const cardRough = buildCard('rough', roughDay, MOOD_ICONS.rough);
    const orDivider = document.createElement('span');
    orDivider.className = 'quilt-mood-triptych__or';
    orDivider.setAttribute('aria-hidden', 'true');
    orDivider.textContent = 'OR';
    row.append(cardGood.btn, orDivider, cardRough.btn);

    let scratchBundle = null;
    let zoneGood = null;
    let zoneRough = null;
    if (SCRATCH_MODE) {
      scratchBundle = buildScratchTicket(goodDay, roughDay);
      zoneGood = scratchBundle.zoneGood;
      zoneRough = scratchBundle.zoneRough;
    }

    const announcer = document.createElement('span');
    announcer.className = 'quilt-mood-triptych__announcer';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');

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

    if (SCRATCH_MODE && scratchBundle) {
      host.append(quoteWrap, scratchBundle.scratchRow, row, metricProbe, messageMeasure, frontMarkMeasure, announcer);
    } else {
      host.append(quoteWrap, row, metricProbe, messageMeasure, frontMarkMeasure);
    }
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
    if (SCRATCH_MODE) host.dataset.triptychMode = 'scratch';
    try {
      console.info('[triptych] mounted', TRIPTYCH_BUILD, {
        mode: SCRATCH_MODE ? 'scratch' : 'flip',
        flipEngine: host.dataset.triptychFlipEngine,
        host: '#quiltMoodSpread'
      });
    } catch (_) {
      /* */
    }

    let activeFlipAnimation = null;
    let iosFlipEndListener = null;
    /** Ink-hugging wash rects for the chosen card — stable from pre-flip measure until reset. */
    let chosenTypeWindowRects = null;
    let scratchEngines = { good: null, rough: null };

    function layoutBtn(picked) {
      if (SCRATCH_MODE && zoneGood && zoneRough) {
        return picked === 'good' ? zoneGood.zone : zoneRough.zone;
      }
      return picked === 'good' ? cardGood.btn : cardRough.btn;
    }

    function announceMoodMessage(bodyText) {
      if (!announcer || !bodyText) return;
      announcer.textContent = bodyText;
    }

    function mountScratchEngines() {
      if (!SCRATCH_MODE || !zoneGood || !zoneRough) return;
      scratchEngines.good?.destroy?.();
      scratchEngines.rough?.destroy?.();

      function handleScratchCommit(picked) {
        if (mood !== null) return;
        if (animating) return;
        mood = picked;
        pickPhase = 'scratching';
        animating = true;
        const sibling = picked === 'good' ? zoneRough.zone : zoneGood.zone;
        sibling.classList.add('is-dismissed');
        applyMoodClasses();
        commitDailyMoodPick(picked);
        if (typeof global.odqTrack === 'function') {
          global.odqTrack('mood_card_tap', { mood: picked });
        }
        opts.onSelect?.(picked);
      }

      function handleScratchRevealComplete() {
        finishPick(true);
      }

      scratchEngines.good = mountScratchEngine({
        zoneEl: zoneGood.zone,
        canvas: zoneGood.canvas,
        mood: 'good',
        reducedMotion,
        onCommit: handleScratchCommit,
        onRevealComplete: handleScratchRevealComplete
      });
      scratchEngines.rough = mountScratchEngine({
        zoneEl: zoneRough.zone,
        canvas: zoneRough.canvas,
        mood: 'rough',
        reducedMotion,
        onCommit: handleScratchCommit,
        onRevealComplete: handleScratchRevealComplete
      });
    }

    function redrawScratchFoils() {
      if (!SCRATCH_MODE) return;
      scratchEngines.good?.paintFoil?.();
      scratchEngines.rough?.paintFoil?.();
    }

    /** Resize scratch canvases after layout without wiping in-progress scratches. */
    function syncScratchCanvases() {
      if (!SCRATCH_MODE) return;
      scratchEngines.good?.syncCanvas?.();
      scratchEngines.rough?.syncCanvas?.();
    }

    function revealScratchZone(picked, { instant = false } = {}) {
      if (!SCRATCH_MODE) return;
      const zone = picked === 'good' ? zoneGood?.zone : zoneRough?.zone;
      const engine = picked === 'good' ? scratchEngines.good : scratchEngines.rough;
      if (instant) host.classList.add('is-instant');
      zone?.classList.add('is-scratch-progress', 'is-scratch-ready');
      engine?.revealZone?.();
      if (instant) {
        requestAnimationFrame(() => host.classList.remove('is-instant'));
      }
    }

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

    function clearChosenFaceInlineStyles() {
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

    /** Final open state: show back face even when CSS 3D flip is flattened (desktop + WKWebView). */
    function applyChosenOpenFaces(chosen) {
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

    function ensureChosenBackVisible() {
      if (mood !== 'good' && mood !== 'rough') return;
      if (animating || pickPhase !== 'open') return;
      if (!host.classList.contains('is-open')) host.classList.add('is-open');
      const chosen = mood === 'good' ? cardGood : cardRough;
      chosen.flip.style.transform = 'rotateY(180deg) translateZ(0)';
      applyChosenOpenFaces(chosen);
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
      clearChosenFaceInlineStyles();
    }

    function scheduleAnimation(fn, delayMs) {
      const id = global.setTimeout(fn, delayMs);
      animationTimers.push(id);
      return id;
    }

    function moodUiSettled(next) {
      return mood === next && pickPhase === 'open';
    }

    function clearChosenTypeWindowRects() {
      chosenTypeWindowRects = null;
    }

    function clearPickVisualState() {
      if (SCRATCH_MODE) {
        clearChosenTypeWindowRects();
        zoneGood?.zone.classList.remove('is-dismissed', 'is-dismissed-gone', 'is-chosen', 'is-revealed', 'is-scratching', 'is-scratch-progress');
        zoneRough?.zone.classList.remove('is-dismissed', 'is-dismissed-gone', 'is-chosen', 'is-revealed', 'is-scratching', 'is-scratch-progress');
        scratchEngines.good?.redrawFoil?.();
        scratchEngines.rough?.redrawFoil?.();
        host.classList.remove('is-open');
        pickPhase = 'idle';
        return;
      }
      clearActiveFlipAnimation();
      clearChosenTypeWindowRects();
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
      const expanded = pickPhase === 'open';
      if (SCRATCH_MODE && zoneGood && zoneRough) {
        zoneGood.zone.classList.toggle('is-chosen', mood === 'good');
        zoneRough.zone.classList.toggle('is-chosen', mood === 'rough');
        zoneGood.zone.setAttribute('aria-expanded', mood === 'good' && expanded ? 'true' : 'false');
        zoneRough.zone.setAttribute('aria-expanded', mood === 'rough' && expanded ? 'true' : 'false');
        zoneGood.zone.setAttribute('aria-disabled', locked ? 'true' : 'false');
        zoneRough.zone.setAttribute('aria-disabled', locked ? 'true' : 'false');
      } else {
        cardGood.btn.classList.toggle('is-chosen', mood === 'good');
        cardRough.btn.classList.toggle('is-chosen', mood === 'rough');
        const expandedFlip = pickPhase === 'open';
        cardGood.btn.setAttribute('aria-expanded', mood === 'good' && expandedFlip ? 'true' : 'false');
        cardRough.btn.setAttribute('aria-expanded', mood === 'rough' && expandedFlip ? 'true' : 'false');
        cardGood.btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
        cardRough.btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
      }
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

    function readArticleInsetPx(cardBtn) {
      const cs = getComputedStyle(cardBtn);
      return {
        top: parseFloat(cs.getPropertyValue('--triptych-article-inset-top')) || 0,
        right: parseFloat(cs.getPropertyValue('--triptych-article-inset-right')) || 0,
        bottom: parseFloat(cs.getPropertyValue('--triptych-article-inset-bottom')) || 0,
        left: parseFloat(cs.getPropertyValue('--triptych-article-inset-left')) || 0
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
      messageMeasure.classList.add('quilt-mood-triptych__message--back-measure');
      messageMeasure.textContent = text;
      messageMeasure.style.width = `${Math.max(1, Math.round(articleWidthPx))}px`;
      return Math.ceil(messageMeasure.getBoundingClientRect().height);
    }

    function measureFrontMarkHeight(articleWidthPx) {
      frontMarkMeasure.style.width = `${Math.max(1, Math.round(articleWidthPx))}px`;
      return Math.ceil(frontMarkMeasure.getBoundingClientRect().height);
    }

    function cellHeightForCard(cardBtn, cardWidthPx, messageText) {
      applyMeasureFontSizePx(readCardBodySizePx(cardBtn));
      const pad = readArticleInsets(cardBtn);
      const articleW = Math.max(1, cardWidthPx - pad.left - pad.right - 2 * pad.border);
      const messageH = measureMessageHeight(messageText, articleW);
      const frontMarkH = measureFrontMarkHeight(articleW);
      const articleH = Math.max(messageH, frontMarkH);
      const dotBandY = resolveTriptychLengthPx('--triptych-back-dot-band-y', 12);
      return Math.ceil(pad.top + pad.bottom + 2 * pad.border + articleH + 2 * dotBandY + 4);
    }

    function readCardBodySizePx(cardBtn) {
      const raw = getComputedStyle(cardBtn).getPropertyValue('--triptych-body-size').trim();
      if (raw.endsWith('px')) {
        const px = parseFloat(raw);
        if (Number.isFinite(px)) return px;
      }
      const probe = parseFloat(getComputedStyle(messageMeasure).fontSize);
      return Number.isFinite(probe) ? probe : TRIPTYCH_BODY_MIN_PX;
    }

    function applyMeasureFontSizePx(px) {
      const clamped = Math.max(TRIPTYCH_BODY_MIN_PX, Math.min(TRIPTYCH_BODY_MAX_PX, Math.round(px)));
      messageMeasure.style.fontSize = `${clamped}px`;
      syncJustifyMeasureFont();
      return clamped;
    }

    function messageFitsAtFontSize(text, cardBtn, cardWidthPx, fontPx) {
      applyMeasureFontSizePx(fontPx);
      if (minCardWidthForLongestWord(text, cardBtn) > cardWidthPx) return false;
      const { maxGap } = scoreJustifyAtCardWidth(text, cardBtn, cardWidthPx);
      const ctx = getJustifyMeasureCtx();
      const spaceW = ctx?.measureText?.(' ')?.width || 4;
      return maxGap <= spaceW * TRIPTYCH_JUSTIFY_GAP_MAX;
    }

    function fitMessageBodySizePx(text, cardBtn, cardWidthPx) {
      let lo = TRIPTYCH_BODY_MIN_PX;
      let hi = TRIPTYCH_BODY_MAX_PX;
      let best = lo;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (messageFitsAtFontSize(text, cardBtn, cardWidthPx, mid)) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best;
    }

    function applyCardBodySizePx(cardBtn, px) {
      cardBtn.style.setProperty('--triptych-body-size', `${px}px`);
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
        const sGood = scoreJustifyAtCardWidth(goodDay, layoutBtn('good'), w).score;
        const sRough = scoreJustifyAtCardWidth(roughDay, layoutBtn('rough'), w).score;
        const score = Math.max(sGood, sRough);
        if (score < bestScore) {
          bestScore = score;
          bestW = w;
        }
      }
      return bestW;
    }

    function syncCardHeights(cardW) {
      const goodBtn = layoutBtn('good');
      const roughBtn = layoutBtn('rough');
      const goodH = cellHeightForCard(goodBtn, cardW, goodDay);
      const roughH = cellHeightForCard(roughBtn, cardW, roughDay);
      const hPx = `${Math.max(goodH, roughH)}px`;
      if (goodBtn.style.getPropertyValue('--triptych-cell-h') !== hPx) {
        goodBtn.style.setProperty('--triptych-cell-h', hPx);
      }
      if (roughBtn.style.getPropertyValue('--triptych-cell-h') !== hPx) {
        roughBtn.style.setProperty('--triptych-cell-h', hPx);
      }
      if (host.style.getPropertyValue('--triptych-row-h') !== hPx) {
        host.style.setProperty('--triptych-row-h', hPx);
      }
    }

    function syncArticleLayout() {
      applyArticleOffset(layoutBtn('good'), dateKey, 'good');
      applyArticleOffset(layoutBtn('rough'), dateKey, 'rough');
      applyHandCutBorderBleed(layoutBtn('good'), dateKey, 'good');
      applyHandCutBorderBleed(layoutBtn('rough'), dateKey, 'rough');
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
      const pad = readArticleInsets(layoutBtn('good'));
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

      const inkTopRel = ink.top - faceRect.top;
      const inkBottomRel = inkTopRel + ink.height;
      const inkLeftRel = ink.left - faceRect.left;
      const inkRightRel = inkLeftRel + ink.width;

      const top = Math.max(aTop, inkTopRel - gutterY);
      const left = Math.max(aLeft, inkLeftRel - gutterXStart);
      const bottom = Math.min(aBottom, inkBottomRel + gutterY);
      const right = Math.min(aRight, inkRightRel + gutterXEnd);

      return {
        top,
        left,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top)
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
      if (!frontWin || !frontMark) return;
      if (isChosenCard && pickPhase === 'open') return;

      const frontRect = measureTypeWindowRect(faceFront, frontMark);
      applyTypeWindowRect(frontWin, frontRect);
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
      const metricsEl = SCRATCH_MODE && scratchBundle ? scratchBundle.ticket : row;
      const orEl = SCRATCH_MODE && scratchBundle ? scratchBundle.orDivider : orDivider;
      const rowStyle = getComputedStyle(metricsEl);
      const padInline =
        (parseFloat(rowStyle.paddingLeft) || 0) + (parseFloat(rowStyle.paddingRight) || 0);
      const breatheSide =
        parseFloat(getComputedStyle(host).getPropertyValue('--triptych-or-breathe')) || 0;
      const orWidth = Math.max(
        orEl.getBoundingClientRect().width,
        orEl.scrollWidth,
        parseFloat(getComputedStyle(orEl).fontSize) * 1.35
      );
      let gap = parseFloat(rowStyle.columnGap || rowStyle.gap) || 0;
      const gapFloor = Math.ceil(orWidth + breatheSide * 2);
      if (gap < gapFloor) {
        gap = gapFloor;
        if (SCRATCH_MODE) {
          host.style.setProperty('--triptych-mood-gap', `${gap}px`);
        } else {
          row.style.setProperty('--triptych-mood-gap', `${gap}px`);
        }
      }
      const rowInnerW = Math.max(96, hostW - padInline);
      const available = Math.max(96, rowInnerW - gap);
      const maxCardW = Math.floor(available / 2);
      const faceFloor = Math.min(minCardWidthForFace(), Math.floor(available * 0.52));
      const wEqual = Math.max(48, faceFloor, maxCardW);
      const goodBtn = layoutBtn('good');
      const roughBtn = layoutBtn('rough');
      const goodFontPx = fitMessageBodySizePx(goodDay, goodBtn, wEqual);
      const roughFontPx = fitMessageBodySizePx(roughDay, roughBtn, wEqual);
      applyCardBodySizePx(goodBtn, goodFontPx);
      applyCardBodySizePx(roughBtn, roughFontPx);
      applyMeasureFontSizePx(Math.max(goodFontPx, roughFontPx));
      const wPx = `${wEqual}px`;
      if (SCRATCH_MODE) {
        host.style.setProperty('--triptych-good-w', wPx);
        host.style.setProperty('--triptych-rough-w', wPx);
      } else {
        row.style.setProperty('--triptych-good-w', wPx);
        row.style.setProperty('--triptych-rough-w', wPx);
      }
      if (goodBtn.style.getPropertyValue('--triptych-card-w') !== wPx) {
        goodBtn.style.setProperty('--triptych-card-w', wPx);
      }
      if (roughBtn.style.getPropertyValue('--triptych-card-w') !== wPx) {
        roughBtn.style.setProperty('--triptych-card-w', wPx);
      }
      syncCardHeights(wEqual);
      if (!SCRATCH_MODE) syncAllTypeWindows();
    }

    let scratchEnginesMounted = false;

    function ensureScratchEngines() {
      if (!SCRATCH_MODE || scratchEnginesMounted) return;
      const goodRect = layoutBtn('good').getBoundingClientRect();
      if (goodRect.width < 48 || goodRect.height < 48) return;
      mountScratchEngines();
      scratchEnginesMounted = true;
      requestAnimationFrame(() => redrawScratchFoils());
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
          if (SCRATCH_MODE) {
            ensureScratchEngines();
            syncScratchCanvases();
            applyHandCutClipsToTicket(scratchBundle.ticket, [zoneGood.zone, zoneRough.zone], dateKey);
          } else {
            syncAllTypeWindows();
            ensureChosenBackVisible();
            applyHandCutClips([cardGood.btn, cardRough.btn], dateKey);
          }
          global.OdqScannerBed?.bootstrapTriptych?.(host, dateKey);
          tryApplyInitialMood();
        });
      });
    }

    function tryApplyInitialMood() {
      if (initialMoodApplied) return;
      if (opts.initialMood !== 'good' && opts.initialMood !== 'rough') return;
      const cardW = layoutBtn('good').getBoundingClientRect().width;
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

    /** Size front wash to HERE/NOW ink before flip. */
    function primeChosenTypeWindows(chosen) {
      const faceFront = chosen.flip.querySelector('.quilt-mood-triptych__face--front');
      const frontMark = faceFront?.querySelector('.quilt-mood-triptych__front-mark');
      const frontWin = faceFront?.querySelector('.quilt-mood-triptych__type-window');
      if (!frontWin || !faceFront) return;

      const frontRect = measureTypeWindowRect(faceFront, frontMark);
      if (!frontRect) return;

      chosenTypeWindowRects = { front: frontRect };
      applyTypeWindowRect(frontWin, frontRect);
    }

    function finishPick(fromUser) {
      animating = false;
      pickPhase = 'open';
      host.classList.remove('is-flipping');
      host.classList.add('is-open');
      applyMoodClasses();
      if (SCRATCH_MODE) {
        const msg = mood === 'good' ? goodDay : roughDay;
        announceMoodMessage(msg);
        requestAnimationFrame(() => {
          applyHandCutClipsToTicket(scratchBundle.ticket, [zoneGood.zone, zoneRough.zone], dateKey);
        });
        return;
      }
      const chosen = mood === 'good' ? cardGood : cardRough;
      chosen.flip.style.transform = 'rotateY(180deg) translateZ(0)';
      applyChosenOpenFaces(chosen);
      syncChosenTypeWindows();
      requestAnimationFrame(() => {
        applyHandCutClips([cardGood.btn, cardRough.btn], dateKey);
      });
    }

    function commitDailyMoodPick(pickedMood) {
      if (pickedMood !== 'good' && pickedMood !== 'rough') return;
      const sig = `${goodDay}\u0001${roughDay}`;
      const payload = {
        dateKey: String(dateKey || globalThis.Utils?.getTodayKey?.() || '').trim(),
        mood: pickedMood,
        contentSig: sig,
        stampAt: new Date().toISOString()
      };
      try {
        localStorage.setItem(MOOD_PICK_STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.warn('[triptych] mood pick save failed', err);
      }
    }

    function openMood(next, { instant = false, fromUser = false } = {}) {
      if (next !== 'good' && next !== 'rough') return;
      if (mood !== null && mood !== next) return;
      if (moodUiSettled(next)) return;
      if (animating && !instant) return;

      clearAnimationTimers();
      clearDismissTransitionListener();
      clearFlipTransitionListener();
      clearPickVisualState();

      mood = next;
      const sibling = layoutBtn(next === 'good' ? 'rough' : 'good');
      const chosen = next === 'good' ? cardGood : cardRough;

      if (SCRATCH_MODE) {
        ensureScratchEngines();
        host.classList.add('is-instant');
        sibling.classList.add('is-dismissed');
        applyMoodClasses();
        if (fromUser) {
          commitDailyMoodPick(mood);
          if (typeof global.odqTrack === 'function') {
            global.odqTrack('mood_card_tap', { mood });
          }
          opts.onSelect?.(mood);
        }
        revealScratchZone(next, { instant: true });
        finishPick(fromUser);
        requestAnimationFrame(() => host.classList.remove('is-instant'));
        return;
      }

      if (instant) {
        host.classList.add('is-instant');
        sibling.classList.add('is-dismissed');
        applyMoodClasses();
        if (fromUser) {
          commitDailyMoodPick(mood);
          if (typeof global.odqTrack === 'function') {
            global.odqTrack('mood_card_tap', { mood });
          }
          opts.onSelect?.(mood);
        }
        primeChosenTypeWindows(chosen);
        if (useIos2dFlip) {
          chosen.flip.style.transform = 'rotateY(180deg) translateZ(0)';
        }
        host.classList.add('is-open');
        finishPick(fromUser);
        requestAnimationFrame(() => host.classList.remove('is-instant'));
        return;
      }

      applyMoodClasses();
      if (fromUser) {
        commitDailyMoodPick(mood);
        if (typeof global.odqTrack === 'function') {
          global.odqTrack('mood_card_tap', { mood });
        }
        opts.onSelect?.(mood);
      }

      animating = true;
      pickPhase = 'flipping';
      host.classList.add('is-flipping');
      syncAllTypeWindows({ force: true });
      primeChosenTypeWindows(chosen);

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
        void chosen.flip.offsetWidth;
        sibling.classList.add('is-dismissed');

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

          clearIosFlipAnimation();
          clearChosenFaceInlineStyles();
          flipEl.style.transform = 'rotateY(0deg) translateZ(0)';
          flipDone = false;
          primeChosenTypeWindows(chosen);

          const revealIosBackHalfway = () => {
            applyChosenOpenFaces(chosen);
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
          return;
        }

        host.classList.add('is-open');
        applyMoodClasses();
        armFlipTransition();
      }

      void chosen.flip.offsetWidth;
      requestAnimationFrame(beginPickAnimation);
    }

    function resetMood({ instant = false, force = false } = {}) {
      if (!force) {
        if (!mood && !host.classList.contains('is-open')) return;
        if (animating) return;
      }

      clearAnimationTimers();
      clearDismissTransitionListener();
      clearFlipTransitionListener();
      if (!SCRATCH_MODE) clearActiveFlipAnimation();
      clearChosenTypeWindowRects();
      const prev = mood;
      mood = null;
      pickPhase = 'idle';
      animating = !instant;

      if (SCRATCH_MODE) {
        scratchEngines.good?.destroy?.();
        scratchEngines.rough?.destroy?.();
        scratchEngines = { good: null, rough: null };
        scratchEnginesMounted = false;
        zoneGood?.zone.classList.remove('is-chosen', 'is-dismissed', 'is-dismissed-gone', 'is-revealed', 'is-scratching');
        zoneRough?.zone.classList.remove('is-chosen', 'is-dismissed', 'is-dismissed-gone', 'is-revealed', 'is-scratching');
        if (announcer) announcer.textContent = '';
      } else {
        cardGood.btn.classList.remove('is-chosen', 'is-dismissed', 'is-dismissed-gone');
        cardRough.btn.classList.remove('is-chosen', 'is-dismissed', 'is-dismissed-gone');
      }
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
      if (SCRATCH_MODE) return;
      const picked = card.dataset.mood;
      if (picked !== 'good' && picked !== 'rough') return;
      if (animating) return;
      if (mood !== null) return;

      openMood(picked, { fromUser: true });
    }

    if (!SCRATCH_MODE) {
      cardGood.btn.addEventListener('click', () => handleCardClick(cardGood.btn));
      cardRough.btn.addEventListener('click', () => handleCardClick(cardRough.btn));
    }

    const onResize = () => remeasure();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(host);
      resizeObserver.observe(row);
      resizeObserver.observe(quoteWrap);
      if (SCRATCH_MODE && scratchBundle?.scratchRow) {
        resizeObserver.observe(scratchBundle.scratchRow);
      }
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
        if (!SCRATCH_MODE) clearActiveFlipAnimation();
        scratchEngines.good?.destroy?.();
        scratchEngines.rough?.destroy?.();
        scratchEngines = { good: null, rough: null };
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
        delete host._moodSpreadWidget;
      }
    };

    host._moodTriptychWidget = api;
    host._moodSpreadWidget = api;
    return api;
  }

  function unmount(host) {
    if (!host) return;
    host._moodTriptychWidget?.destroy?.();
    delete host._moodTriptychWidget;
    delete host._moodSpreadWidget;
    host.innerHTML = '';
    host.className = 'quilt-mood-triptych';
    host.setAttribute('hidden', 'hidden');
    host.setAttribute('aria-hidden', 'true');
    host.classList.remove('is-good', 'is-rough', 'is-open', 'is-ready', 'is-instant', 'is-locked', 'is-scratch-mode');
    delete host.dataset.panel;
    delete host.dataset.triptychMode;
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
    FLIP_MS,
    SCRATCH_MODE,
    SCRATCH_REVEAL_THRESHOLD
  };
});
