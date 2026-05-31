/**
 * Mood triptych: peek quote clipping + two square mood cards that unfold on tap.
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

  const STYLE_ID = 'quilt-mood-triptych-widget-styles-v42';
  const ENABLE_OPEN_ANIMATION = true;
  const DISMISS_MS = 1400;
  const OPEN_START_DELAY_MS = Math.round(DISMISS_MS * 0.5);
  const FLAP_LEAD_MS = 220;
  const STACK_HANDOFF_MS = 240;
  const UNFOLD_MS = 1200;
  const REDUCED_DISMISS_MS = 520;
  const REDUCED_OPEN_START_DELAY_MS = Math.round(REDUCED_DISMISS_MS * 0.5);
  const REDUCED_UNFOLD_MS = 300;

  const MOOD_ICONS = {
    good: 'brightness_1',
    rough: 'contrast'
  };

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #screen-quilt .quilt-mood-triptych {
        --triptych-scale: 0.85;
        --triptych-mood-scale: 0.9;
        --triptych-gutter: clamp(1.25rem, 8vw, 2.25rem);
        --triptych-quote-gap: clamp(1rem, 5.2vw, 1.55rem);
        --triptych-mood-gap: clamp(0.55rem, 3.2vw, 0.9rem);
        --triptych-closed-front-y: 20deg;
        --triptych-closed-back-y: -12deg;
        --triptych-closed-front-y-good: -20deg;
        --triptych-closed-back-y-good: 12deg;
        --triptych-back-leaf-width: 100%;
        /* Outer edge extends above/below back; spine stays card height (right angles at fold). */
        --triptych-front-outer-overhang: 9%;
        --triptych-front-spine-inset: 7.63%;
        --triptych-front-leaf-z: 8px;
        --triptych-open-tilt-left: 2.5deg;
        --triptych-open-tilt-right: -2.5deg;
        --triptych-card-tilt-good: 0deg;
        --triptych-card-tilt-rough: 0deg;
        --triptych-open-shadow:
          drop-shadow(0 12px 28px rgba(45, 36, 29, 0.07))
          drop-shadow(0 4px 12px rgba(45, 36, 29, 0.04));
        --triptych-crease-opacity: 0.42;
        --triptych-dismiss-ms: ${DISMISS_MS}ms;
        --triptych-open-start-ms: ${OPEN_START_DELAY_MS}ms;
        --triptych-flap-lead-ms: ${FLAP_LEAD_MS}ms;
        --triptych-stack-handoff-ms: ${STACK_HANDOFF_MS}ms;
        --triptych-unfold-ms: ${UNFOLD_MS}ms;
        --triptych-dismiss-ease: cubic-bezier(0.42, 0, 0.18, 1);
        --triptych-sheet-width: min(
          calc(var(--quilt-float-card-max, 460px) * var(--triptych-scale)),
          calc(100% - (2 * var(--triptych-gutter)))
        );
        --triptych-mood-row-width: calc(var(--triptych-sheet-width) * var(--triptych-mood-scale));
        --triptych-ink: var(--odq-ink-body, rgba(56, 46, 36, 0.78));
        --triptych-font: var(
          --mood-clipping-font,
          var(--quilt-clipping-font, var(--quilt-dm-sans-font, 'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif))
        );
        --triptych-body-size: var(--quilt-reflection-copy-size, var(--quilt-quote-copy-size, clamp(1.044rem, 4.32vw, 1.728rem)));
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
        transform: translate3d(-2px, 0, 0) rotate(-0.6deg);
      }

      #screen-quilt .quilt-mood-triptych__quote-img {
        display: block;
        width: 100%;
        height: auto;
        margin: 0;
        user-select: none;
        -webkit-user-drag: none;
        filter: var(
          --odq-artifact-shadow,
          drop-shadow(0 4px 14px rgba(45, 36, 29, 0.14))
            drop-shadow(0 1px 3px rgba(45, 36, 29, 0.1))
            drop-shadow(0 8px 20px rgba(28, 32, 42, 0.06))
        );
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
        height: var(--triptych-cell-h, auto);
        min-height: var(--triptych-cell-h, auto);
      }

      #screen-quilt .quote-card-stack:has(.quilt-mood-triptych.is-dismiss-sliding),
      #screen-quilt .quote-card-stack:has(.quilt-mood-triptych.is-opening) {
        overflow: visible;
      }

      #screen-quilt .quilt-mood-triptych.is-dismiss-sliding {
        overflow: visible;
      }

      #screen-quilt .quilt-mood-triptych.is-dismiss-sliding .quilt-mood-triptych__row {
        overflow: visible;
      }

      #screen-quilt .quilt-mood-triptych.is-opening {
        overflow: visible;
      }

      #screen-quilt .quilt-mood-triptych.is-opening .quilt-mood-triptych__row {
        overflow: visible;
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
        aspect-ratio: 1 / 1;
        overflow: visible;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        box-sizing: border-box;
        transform-origin: center center;
      }

      /* Only the dismissed card slides — selected card never transitions transform. */
      #screen-quilt .quilt-mood-triptych.is-dismiss-sliding .quilt-mood-triptych__card:not(.is-dismissed) {
        transition: none;
        transform: none;
      }

      #screen-quilt .quilt-mood-triptych__card--good {
        z-index: 2;
      }

      #screen-quilt .quilt-mood-triptych__card--rough {
        z-index: 1;
      }

      /* Selected card stays above the sliding sibling for the whole dismiss. */
      #screen-quilt .quilt-mood-triptych__card.is-chosen {
        z-index: 6;
        opacity: 1;
        visibility: visible;
      }

      #screen-quilt .quilt-mood-triptych.is-dismiss-sliding .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__stack,
      #screen-quilt .quilt-mood-triptych.is-opening:not(.is-open) .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__stack {
        opacity: 1;
        visibility: visible;
        z-index: 3;
      }

      #screen-quilt .quilt-mood-triptych.is-opening .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__stack {
        transition: transform 220ms ease;
      }

      #screen-quilt .quilt-mood-triptych.is-opening.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__stack {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        z-index: 1;
        transition:
          opacity calc(var(--triptych-unfold-ms) * 0.18) ease,
          visibility calc(var(--triptych-unfold-ms) * 0.18) ease,
          transform 220ms ease;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__stack {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        z-index: 1;
      }

      /* —— CLOSED (reference: left-spine booklet, front toward viewer, back peeks right) —— */
      #screen-quilt .quilt-mood-triptych__stack {
        position: absolute;
        inset: 0;
        perspective: 1120px;
        transform-style: preserve-3d;
        -webkit-transform-style: preserve-3d;
        overflow: visible;
        filter: var(
          --triptych-card-shadow,
          drop-shadow(0 7px 16px rgba(45, 36, 29, 0.14))
            drop-shadow(0 3px 6px rgba(45, 36, 29, 0.1))
        );
        transition:
          opacity 160ms ease,
          visibility 160ms ease,
          transform 220ms ease;
      }

      #screen-quilt .quilt-mood-triptych:not(.is-open) .quilt-mood-triptych__card--good.is-chosen .quilt-mood-triptych__stack {
        transform: rotate(var(--triptych-card-tilt-good));
      }

      #screen-quilt .quilt-mood-triptych:not(.is-open) .quilt-mood-triptych__card--rough.is-chosen .quilt-mood-triptych__stack {
        transform: rotate(var(--triptych-card-tilt-rough));
      }

      #screen-quilt .quilt-mood-triptych:not(.is-open):not(.is-opening) .quilt-mood-triptych__card--good:not(.is-chosen) .quilt-mood-triptych__stack {
        transform: rotate(var(--triptych-card-tilt-good));
      }

      #screen-quilt .quilt-mood-triptych:not(.is-open):not(.is-opening) .quilt-mood-triptych__card--rough:not(.is-chosen) .quilt-mood-triptych__stack {
        transform: rotate(var(--triptych-card-tilt-rough));
      }

      #screen-quilt .quilt-mood-triptych__back-leaf {
        position: absolute;
        left: 0;
        top: 0;
        width: var(--triptych-back-leaf-width);
        height: 100%;
        z-index: 1;
        pointer-events: none;
        transform-origin: left center;
        transform: rotateY(var(--triptych-closed-back-y)) translateZ(-1px);
        clip-path: none;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        background-color: rgba(218, 202, 182, 0.98);
        background-image:
          linear-gradient(to right, rgba(58, 44, 30, 0.07) 0%, transparent 42%),
          var(--quilt-paper-surface-image);
        background-size: 100% 100%, 100% 100%, 100% 100%;
        background-position: center;
        background-repeat: no-repeat;
      }

      #screen-quilt .quilt-mood-triptych__back-leaf::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(
            to left,
            rgba(58, 44, 30, 0.14) 0%,
            rgba(58, 44, 30, 0.06) 14%,
            transparent 32%
          ),
          linear-gradient(
            to bottom,
            transparent 42%,
            rgba(58, 44, 30, 0.06) 68%,
            rgba(58, 44, 30, 0.12) 100%
          );
      }

      /*
       * Closed card (mockup): bottom = rectangle; top = trapezoid with a TALLER outer edge
       * (tabs push past the back at top/bottom). Spine = card height, right angles at fold.
       */
      #screen-quilt .quilt-mood-triptych__front-leaf {
        position: absolute;
        top: calc(-1 * var(--triptych-front-outer-overhang));
        width: 100%;
        height: calc(100% + (2 * var(--triptych-front-outer-overhang)));
        z-index: 3;
        display: flex;
        align-items: center;
        justify-content: center;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        background-color: var(--quilt-paper-card-fallback, #f6f2eb);
        background-image:
          linear-gradient(to right, rgba(255, 252, 246, 0.5) 0%, rgba(58, 44, 30, 0.05) 100%),
          var(--quilt-paper-surface-image);
        background-size: 100% 100%, 100% 100%, 100% 100%;
        background-position: center;
        background-repeat: no-repeat;
        box-shadow:
          inset 3px 0 8px rgba(58, 44, 30, 0.05),
          inset -12px 0 18px rgba(58, 44, 30, 0.03);
        overflow: visible;
      }

      #screen-quilt .quilt-mood-triptych__card--rough .quilt-mood-triptych__front-leaf {
        left: 0;
        transform-origin: left center;
        clip-path: polygon(
          0 var(--triptych-front-spine-inset),
          0 calc(100% - var(--triptych-front-spine-inset)),
          100% 100%,
          100% 0
        );
        transform: translateZ(var(--triptych-front-leaf-z)) rotateY(var(--triptych-closed-front-y));
      }

      #screen-quilt .quilt-mood-triptych__card--good .quilt-mood-triptych__front-leaf {
        right: 0;
        left: auto;
        transform-origin: right center;
        clip-path: polygon(
          100% var(--triptych-front-spine-inset),
          100% calc(100% - var(--triptych-front-spine-inset)),
          0 100%,
          0 0
        );
        transform: translateZ(var(--triptych-front-leaf-z)) rotateY(var(--triptych-closed-front-y-good));
        background-image:
          linear-gradient(to left, rgba(255, 252, 246, 0.5) 0%, rgba(58, 44, 30, 0.05) 100%),
          var(--quilt-paper-surface-image);
        box-shadow:
          inset -3px 0 8px rgba(58, 44, 30, 0.05),
          inset 12px 0 18px rgba(58, 44, 30, 0.03);
      }

      #screen-quilt .quilt-mood-triptych__front-leaf .quilt-mood-triptych__icon {
        position: relative;
        z-index: 4;
      }

      #screen-quilt .quilt-mood-triptych__front-leaf::before {
        content: '';
        position: absolute;
        top: var(--triptych-front-spine-inset);
        bottom: var(--triptych-front-spine-inset);
        left: 0;
        width: clamp(2px, 0.65vw, 3px);
        pointer-events: none;
        z-index: 10;
        background: linear-gradient(
          90deg,
          rgba(42, 32, 24, 0.14) 0%,
          rgba(255, 252, 246, 0.5) 52%,
          rgba(58, 44, 30, 0.03) 100%
        );
      }

      #screen-quilt .quilt-mood-triptych__front-leaf::after {
        content: '';
        position: absolute;
        inset: -2px;
        pointer-events: none;
        z-index: 9;
        opacity: 0.1;
        mix-blend-mode: multiply;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
        background-size: 140px 140px;
      }

      /* Good (left) card: right-edge spine — folds meet rough card at center gap. */
      #screen-quilt .quilt-mood-triptych__card--good .quilt-mood-triptych__back-leaf {
        left: auto;
        right: 0;
        transform-origin: right center;
        transform: rotateY(var(--triptych-closed-back-y-good)) translateZ(-1px);
        background-image:
          linear-gradient(to left, rgba(58, 44, 30, 0.07) 0%, transparent 42%),
          var(--quilt-paper-surface-image);
      }

      #screen-quilt .quilt-mood-triptych__card--good .quilt-mood-triptych__back-leaf::after {
        background:
          linear-gradient(
            to right,
            rgba(58, 44, 30, 0.14) 0%,
            rgba(58, 44, 30, 0.06) 14%,
            transparent 32%
          ),
          linear-gradient(
            to bottom,
            transparent 42%,
            rgba(58, 44, 30, 0.06) 68%,
            rgba(58, 44, 30, 0.12) 100%
          );
      }

      #screen-quilt .quilt-mood-triptych__card--good .quilt-mood-triptych__front-leaf::before {
        left: auto;
        right: 0;
        background: linear-gradient(
          270deg,
          rgba(42, 32, 24, 0.14) 0%,
          rgba(255, 252, 246, 0.5) 52%,
          rgba(58, 44, 30, 0.03) 100%
        );
      }

      #screen-quilt .quilt-mood-triptych__card:focus-visible {
        outline: 2px solid rgba(0, 0, 0, 0.35);
        outline-offset: 2px;
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

      /*
       * Horizontal exit only — absolute from slide start so the chosen card can span
       * the row without pushing the dismissed card to a second grid row.
       */
      #screen-quilt .quilt-mood-triptych__card--good.is-dismissed {
        left: 0;
        transform: translateX(calc(-100% - 55vw));
      }

      #screen-quilt .quilt-mood-triptych__card--rough.is-dismissed {
        right: 0;
        left: auto;
        transform: translateX(calc(100% + 55vw));
      }

      /* Hide after slide; layout slot already released via absolute positioning above. */
      #screen-quilt .quilt-mood-triptych__card.is-dismissed.is-dismissed-gone {
        visibility: hidden;
        transition: none;
      }

      #screen-quilt .quilt-mood-triptych__card--good.is-dismissed.is-dismissed-gone {
        left: 0;
      }

      #screen-quilt .quilt-mood-triptych__card--rough.is-dismissed.is-dismissed-gone {
        right: 0;
        left: auto;
      }

      #screen-quilt .quilt-mood-triptych.is-good:not(.is-open):not(.is-opening) .quilt-mood-triptych__card--good.is-chosen {
        grid-column: 1;
      }

      #screen-quilt .quilt-mood-triptych.is-rough:not(.is-open):not(.is-opening) .quilt-mood-triptych__card--rough.is-chosen {
        grid-column: 2;
      }

      #screen-quilt .quilt-mood-triptych.is-opening .quilt-mood-triptych__card.is-chosen,
      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen {
        z-index: 6;
      }

      /* Chosen card expands into the vacated half while the sibling is still sliding away. */
      #screen-quilt .quilt-mood-triptych.is-opening .quilt-mood-triptych__card.is-chosen {
        grid-column: 1 / -1;
        width: 100%;
        height: var(--triptych-cell-h);
        aspect-ratio: unset;
        min-height: unset;
        max-height: var(--triptych-cell-h);
        overflow: visible;
        filter: var(--triptych-open-shadow);
        transition: filter calc(var(--triptych-unfold-ms) * 0.55) ease;
      }

      /* Top flap (front leaf) swings toward the space the dismissed card occupied. */
      #screen-quilt .quilt-mood-triptych.is-good.is-opening:not(.is-open) .quilt-mood-triptych__card--good.is-chosen .quilt-mood-triptych__front-leaf {
        transform: translateZ(var(--triptych-front-leaf-z)) rotateY(-4deg);
        transition: transform calc(var(--triptych-unfold-ms) * 0.42) var(--triptych-dismiss-ease);
      }

      #screen-quilt .quilt-mood-triptych.is-rough.is-opening:not(.is-open) .quilt-mood-triptych__card--rough.is-chosen .quilt-mood-triptych__front-leaf {
        transform: translateZ(var(--triptych-front-leaf-z)) rotateY(4deg);
        transition: transform calc(var(--triptych-unfold-ms) * 0.42) var(--triptych-dismiss-ease);
      }

      #screen-quilt .quilt-mood-triptych.is-opening .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__fold {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        z-index: 2;
        transition:
          opacity calc(var(--triptych-unfold-ms) * 0.2) ease,
          visibility calc(var(--triptych-unfold-ms) * 0.2) ease;
      }

      #screen-quilt .quilt-mood-triptych.is-opening.is-fold-visible .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__fold {
        opacity: 1;
        visibility: visible;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-triptych.is-opening.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__fold {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transition:
          opacity calc(var(--triptych-unfold-ms) * 0.2) ease,
          visibility calc(var(--triptych-unfold-ms) * 0.2) ease;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen {
        transform: none;
        grid-column: 1 / -1;
        width: 100%;
        height: var(--triptych-cell-h);
        aspect-ratio: unset;
        min-height: unset;
        max-height: var(--triptych-cell-h);
        overflow: hidden;
        filter: var(--triptych-open-shadow);
      }

      /* —— OPEN (reference: two panels, center crease, shallow V toward viewer) —— */
      #screen-quilt .quilt-mood-triptych__fold {
        position: absolute;
        inset: 0;
        perspective: 880px;
        transform-style: preserve-3d;
        -webkit-transform-style: preserve-3d;
        background-color: transparent;
        overflow: visible;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 120ms ease, visibility 120ms ease;
        filter: var(
          --triptych-card-shadow,
          drop-shadow(0 7px 16px rgba(45, 36, 29, 0.14))
            drop-shadow(0 3px 6px rgba(45, 36, 29, 0.1))
        );
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__fold {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__fold {
        overflow: hidden;
        filter: none;
      }

      #screen-quilt .quilt-mood-triptych__fold::before {
        content: '';
        position: absolute;
        top: 5%;
        bottom: 5%;
        left: 50%;
        width: clamp(14px, 4vw, 22px);
        transform: translateX(-50%);
        z-index: 17;
        pointer-events: none;
        opacity: 0;
        background: linear-gradient(
          90deg,
          rgba(58, 44, 30, 0.035) 0%,
          rgba(58, 44, 30, 0.015) 40%,
          transparent 50%,
          rgba(58, 44, 30, 0.015) 60%,
          rgba(58, 44, 30, 0.035) 100%
        );
        transition: opacity 280ms ease;
      }

      #screen-quilt .quilt-mood-triptych__fold::after {
        content: '';
        position: absolute;
        top: 4%;
        bottom: 4%;
        left: 50%;
        width: clamp(1px, 0.45vw, 2px);
        transform: translateX(-50%);
        z-index: 19;
        pointer-events: none;
        opacity: 0;
        background: linear-gradient(
          90deg,
          rgba(58, 44, 30, 0.05) 0%,
          rgba(58, 44, 30, 0.08) 46%,
          rgba(255, 252, 246, 0.35) 50%,
          rgba(58, 44, 30, 0.07) 54%,
          rgba(58, 44, 30, 0.04) 100%
        );
        transition: opacity 280ms ease;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__fold::before,
      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__fold::after {
        opacity: var(--triptych-crease-opacity);
      }

      #screen-quilt .quilt-mood-triptych__half {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 50%;
        transform-style: preserve-3d;
        -webkit-transform-style: preserve-3d;
        transition:
          transform var(--triptych-unfold-ms) var(--triptych-dismiss-ease),
          visibility 0ms linear calc(var(--triptych-unfold-ms) * 0.08);
      }

      #screen-quilt .quilt-mood-triptych__half--left {
        left: 0;
        transform-origin: right center;
        transform: rotateY(-88deg);
      }

      #screen-quilt .quilt-mood-triptych__half--right {
        left: 50%;
        transform-origin: left center;
        transform: rotateY(var(--triptych-closed-front-y));
      }

      #screen-quilt .quilt-mood-triptych:not(.is-open):not(.is-opening) .quilt-mood-triptych__half {
        visibility: hidden;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__half {
        visibility: visible;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__half--left,
      #screen-quilt .quilt-mood-triptych.is-instant.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__half--left {
        transform: rotateY(var(--triptych-open-tilt-left));
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__half--right,
      #screen-quilt .quilt-mood-triptych.is-instant.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__half--right {
        transform: rotateY(var(--triptych-open-tilt-right));
      }

      /* Lead the half that opens toward the dismissed card's side. */
      #screen-quilt .quilt-mood-triptych.is-good.is-opening.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__half--right {
        transition-delay: 0ms;
      }

      #screen-quilt .quilt-mood-triptych.is-good.is-opening.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__half--left {
        transition-delay: calc(var(--triptych-unfold-ms) * 0.14);
      }

      #screen-quilt .quilt-mood-triptych.is-rough.is-opening.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__half--left {
        transition-delay: 0ms;
      }

      #screen-quilt .quilt-mood-triptych.is-rough.is-opening.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__half--right {
        transition-delay: calc(var(--triptych-unfold-ms) * 0.14);
      }

      #screen-quilt .quilt-mood-triptych__half--left .quilt-mood-triptych__face--front {
        background-image:
          linear-gradient(to right, rgba(255, 252, 246, 0.35) 0%, transparent 55%),
          var(--quilt-paper-surface-image);
      }

      #screen-quilt .quilt-mood-triptych__half--right .quilt-mood-triptych__face--front {
        background-image:
          linear-gradient(to left, rgba(58, 44, 30, 0.04) 0%, transparent 45%),
          var(--quilt-paper-surface-image);
      }

      #screen-quilt .quilt-mood-triptych__face {
        position: absolute;
        inset: 0;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        background-color: var(--quilt-paper-card-fallback, #f6f2eb);
        background-image: var(--quilt-paper-surface-image);
        background-size: 100% 100%, 100% 100%, 100% 100%;
        background-position: center;
        background-repeat: no-repeat;
        box-shadow: var(--quilt-paper-card-shadow);
        isolation: isolate;
        overflow: hidden;
      }

      #screen-quilt .quilt-mood-triptych__face::before {
        content: '';
        position: absolute;
        inset: -2px;
        pointer-events: none;
        z-index: 8;
        opacity: 0.062;
        mix-blend-mode: multiply;
        background-image: radial-gradient(
          circle at center,
          rgba(32, 24, 18, 0.95) 0.5px,
          transparent 0.52px
        );
        background-size: 3.25px 3.25px;
      }

      #screen-quilt .quilt-mood-triptych__face::after {
        content: '';
        position: absolute;
        inset: -2px;
        pointer-events: none;
        z-index: 9;
        opacity: 0.11;
        mix-blend-mode: multiply;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
        background-size: 140px 140px;
      }

      #screen-quilt .quilt-mood-triptych__face--back {
        transform: rotateY(180deg);
        background-color: rgba(228, 212, 192, 0.98);
        background-image:
          linear-gradient(118deg, rgba(72, 58, 42, 0.06) 0%, transparent 52%),
          var(--quilt-paper-surface-image);
        box-shadow: inset 0 0 0 1px rgba(58, 44, 30, 0.06);
      }

      #screen-quilt .quilt-mood-triptych__icon {
        font-family: 'Material Symbols Outlined';
        font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 30;
        font-feature-settings: 'liga';
        font-size: clamp(1.26rem, 4.2vw, 1.6rem);
        font-style: normal;
        line-height: 1;
        color: rgba(36, 27, 20, 0.72);
        position: relative;
        z-index: 10;
      }

      #screen-quilt .quilt-mood-triptych__message {
        position: absolute;
        inset: 0;
        z-index: 5;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: clamp(0.55rem, 4%, 0.85rem) clamp(0.65rem, 5%, 1rem);
        box-sizing: border-box;
        font-family: var(--triptych-font);
        font-size: var(--triptych-body-size);
        font-style: normal;
        font-weight: 400;
        line-height: 1.18;
        text-align: center;
        text-wrap: balance;
        color: var(--triptych-ink);
        letter-spacing: 0.018em;
        opacity: 0;
        pointer-events: none;
        white-space: normal;
        word-break: normal;
        overflow-wrap: normal;
        hyphens: none;
        -webkit-hyphens: none;
        transition: opacity calc(var(--triptych-unfold-ms) * 0.4) ease calc(var(--triptych-unfold-ms) * 0.55);
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__message,
      #screen-quilt .quilt-mood-triptych.is-instant.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__message {
        opacity: 1;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__face--front {
        background: transparent;
        box-shadow: none;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__face--front::before,
      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__face--front::after {
        display: none;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__message {
        background-color: var(--quilt-paper-card-fallback, #f6f2eb);
        background-image:
          linear-gradient(
            90deg,
            transparent calc(50% - 20px),
            rgba(58, 44, 30, 0.016) calc(50% - 8px),
            rgba(58, 44, 30, 0.03) 50%,
            rgba(58, 44, 30, 0.016) calc(50% + 8px),
            transparent calc(50% + 20px)
          ),
          linear-gradient(
            to right,
            rgba(255, 252, 246, 0.14) 0%,
            rgba(255, 252, 246, 0.04) 48%,
            rgba(58, 44, 30, 0.012) 50%,
            rgba(58, 44, 30, 0.018) 100%
          ),
          var(--quilt-paper-surface-image);
        background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%;
        box-shadow: inset 0 -14px 22px rgba(58, 44, 30, 0.022);
        z-index: 12;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__message::before {
        content: '';
        position: absolute;
        top: 4%;
        bottom: 4%;
        left: 50%;
        width: 1px;
        transform: translateX(-50%);
        pointer-events: none;
        opacity: var(--triptych-crease-opacity);
        background: linear-gradient(
          90deg,
          rgba(58, 44, 30, 0.04) 0%,
          rgba(58, 44, 30, 0.07) 48%,
          rgba(255, 252, 246, 0.28) 50%,
          rgba(58, 44, 30, 0.06) 52%,
          rgba(58, 44, 30, 0.035) 100%
        );
      }

      #screen-quilt .quilt-mood-triptych__row {
        position: relative;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen {
        position: relative;
      }

      #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__reset {
        opacity: 1;
        pointer-events: auto;
      }

      #screen-quilt .quilt-mood-triptych__reset {
        position: absolute;
        top: 0.35rem;
        right: 0.35rem;
        z-index: 20;
        width: 1.65rem;
        height: 1.65rem;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: rgba(245, 230, 212, 0.92);
        color: rgba(36, 27, 20, 0.72);
        font-size: 1.1rem;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transition: opacity 160ms ease;
        -webkit-tap-highlight-color: transparent;
        box-shadow: 0 1px 3px rgba(45, 36, 29, 0.12);
      }

      #screen-quilt .quilt-mood-triptych__reset:focus-visible {
        outline: 2px solid rgba(0, 0, 0, 0.35);
        outline-offset: 1px;
      }

      /* Reduced motion: keep layered leaf mockup; skip 3D unfold halves. */
      @media (prefers-reduced-motion: reduce) {
        #screen-quilt .quilt-mood-triptych {
          --triptych-dismiss-ms: ${REDUCED_DISMISS_MS}ms;
          --triptych-open-start-ms: ${REDUCED_OPEN_START_DELAY_MS}ms;
          --triptych-flap-lead-ms: 0ms;
          --triptych-unfold-ms: ${REDUCED_UNFOLD_MS}ms;
        }

        #screen-quilt .quilt-mood-triptych__half {
          transition: none;
          transform: none !important;
          visibility: hidden !important;
        }

        #screen-quilt .quilt-mood-triptych__face--back {
          display: none;
        }

        #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__stack {
          opacity: 0;
          visibility: hidden;
        }

        #screen-quilt .quilt-mood-triptych.is-open .quilt-mood-triptych__card.is-chosen .quilt-mood-triptych__fold {
          opacity: 1;
          visibility: visible;
          background-color: var(--quilt-paper-card-fallback, #f6f2eb);
          background-image: var(--quilt-paper-surface-image);
          background-size: 100% 100%, 100% 100%, 100% 100%;
          box-shadow: var(--quilt-paper-card-shadow);
        }

        #screen-quilt .quilt-mood-triptych__card.is-chosen {
          transition: width var(--triptych-unfold-ms) ease;
        }

        #screen-quilt .quilt-mood-triptych.is-opening .quilt-mood-triptych__card.is-chosen {
          grid-column: 1 / -1;
          height: var(--triptych-cell-h);
          aspect-ratio: unset;
          min-height: unset;
          max-height: var(--triptych-cell-h);
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

    const stack = document.createElement('div');
    stack.className = 'quilt-mood-triptych__stack';

    const backLeaf = document.createElement('span');
    backLeaf.className = 'quilt-mood-triptych__back-leaf';
    backLeaf.setAttribute('aria-hidden', 'true');

    const frontLeaf = document.createElement('div');
    frontLeaf.className = 'quilt-mood-triptych__front-leaf';

    const frontIcon = document.createElement('span');
    frontIcon.className = 'quilt-mood-triptych__icon';
    frontIcon.setAttribute('aria-hidden', 'true');
    frontIcon.textContent = iconName;
    frontLeaf.append(frontIcon);

    stack.append(backLeaf, frontLeaf);

    const fold = document.createElement('div');
    fold.className = 'quilt-mood-triptych__fold';

    const messageEl = document.createElement('div');
    messageEl.className = 'quilt-mood-triptych__message';
    messageEl.textContent = message;

    ['left', 'right'].forEach((side) => {
      const half = document.createElement('div');
      half.className = `quilt-mood-triptych__half quilt-mood-triptych__half--${side}`;

      const front = document.createElement('div');
      front.className = 'quilt-mood-triptych__face quilt-mood-triptych__face--front';

      const back = document.createElement('div');
      back.className = 'quilt-mood-triptych__face quilt-mood-triptych__face--back';

      half.append(front, back);
      fold.appendChild(half);
    });

    fold.insertBefore(messageEl, fold.firstChild);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'quilt-mood-triptych__reset';
    resetBtn.setAttribute('aria-label', 'Choose again');
    resetBtn.textContent = '\u00d7';
    fold.appendChild(resetBtn);

    btn.append(stack, fold);
    return { btn, resetBtn };
  }

  function applyHandCutClips(cards, dateKey) {
    const QNC = global.QuiltNewspaperClipping;
    if (!QNC?.buildHandCutCssClipPath) return;
    cards.forEach((card) => {
      const fold = card.querySelector('.quilt-mood-triptych__fold');
      if (!fold) return;
      const host = card.closest('.quilt-mood-triptych');
      const openCard =
        card.classList.contains('is-chosen') &&
        (host?.classList.contains('is-open') ||
          host?.classList.contains('is-opening') ||
          host?.classList.contains('is-fold-visible'));
      if (!openCard) {
        fold.style.clipPath = '';
        fold.style.webkitClipPath = '';
        return;
      }
      const rect = card.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w < 8 || h < 8) return;
      const mood = card.dataset.mood;
      const clip = QNC.buildHandCutCssClipPath(w, h, `${dateKey}:triptych:${mood}`, {});
      if (!clip) return;
      fold.style.clipPath = clip;
      fold.style.webkitClipPath = clip;
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

    const quoteDataUrl = String(opts.quoteDataUrl || '').trim();
    const goodDay = String(opts.goodDay || '').trim();
    const roughDay = String(opts.roughDay || '').trim();
    const dateKey = String(opts.dateKey || '').trim();
    if (!quoteDataUrl || !goodDay || !roughDay) return null;

    host.innerHTML = '';
    host.className = 'quilt-mood-triptych';
    host.dataset.panel = 'idle';
    host.removeAttribute('hidden');
    host.classList.remove('is-ready', 'is-good', 'is-rough', 'is-open', 'is-opening', 'is-fold-visible', 'is-dismiss-sliding', 'is-instant');

    const quoteWrap = document.createElement('div');
    quoteWrap.className = 'quilt-mood-triptych__quote';

    const quoteImg = document.createElement('img');
    quoteImg.className = 'quilt-mood-triptych__quote-img';
    quoteImg.alt = "Today's quote";
    quoteImg.decoding = 'async';
    quoteImg.draggable = false;

    quoteWrap.appendChild(quoteImg);

    const row = document.createElement('div');
    row.className = 'quilt-mood-triptych__row';

    const cardGood = buildCard('good', goodDay, MOOD_ICONS.good);
    const cardRough = buildCard('rough', roughDay, MOOD_ICONS.rough);
    row.append(cardGood.btn, cardRough.btn);

    host.append(quoteWrap, row);
    host.setAttribute('hidden', 'hidden');
    host.setAttribute('aria-hidden', 'true');

    let mood = null;
    let animating = false;
    let resizeObserver = null;
    let readyNotified = false;
    let initialMoodApplied = false;
    let reducedMotion = prefersReducedMotion();

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
      const fullyOpen = ENABLE_OPEN_ANIMATION
        && (mood === 'good' || mood === 'rough')
        && !host.classList.contains('is-opening');
      host.classList.toggle('is-open', fullyOpen);
      host.dataset.panel = mood || 'idle';
      cardGood.btn.classList.toggle('is-chosen', mood === 'good');
      cardRough.btn.classList.toggle('is-chosen', mood === 'rough');
      cardGood.btn.setAttribute('aria-expanded', mood === 'good' ? 'true' : 'false');
      cardRough.btn.setAttribute('aria-expanded', mood === 'rough' ? 'true' : 'false');
      opts.onPanelChange?.(mood);
    }

    function syncSheetMetrics() {
      const rowW = row.getBoundingClientRect().width;
      if (rowW >= 48) {
        host.style.setProperty('--triptych-cell-h', `${rowW / 2}px`);
      }
    }

    function remeasure() {
      syncSheetMetrics();
      applyHandCutClips([cardGood.btn, cardRough.btn], dateKey);
      tryApplyInitialMood();
    }

    function tryApplyInitialMood() {
      if (initialMoodApplied) return;
      if (opts.initialMood !== 'good' && opts.initialMood !== 'rough') return;
      const cardW = cardGood.btn.getBoundingClientRect().width;
      if (cardW < 48 || !host.classList.contains('is-ready')) return;
      initialMoodApplied = true;
      openMood(opts.initialMood, { instant: !!opts.instant, fromUser: false });
    }

    function openMood(next, { instant = false, fromUser = false } = {}) {
      if (next !== 'good' && next !== 'rough') return;
      if (mood === next && host.classList.contains('is-open')) return;
      if (animating) return;

      mood = next;
      const sibling = next === 'good' ? cardRough.btn : cardGood.btn;
      const chosen = next === 'good' ? cardGood.btn : cardRough.btn;

      if (instant) {
        host.classList.add('is-instant');
        sibling.classList.add('is-dismissed', 'is-dismissed-gone');
        applyMoodClasses();
        host.classList.add('is-open');
        remeasure();
        if (fromUser) opts.onSelect?.(mood);
        requestAnimationFrame(() => host.classList.remove('is-instant'));
        return;
      }

      animating = true;
      applyMoodClasses();

      const dismissMs = reducedMotion ? REDUCED_DISMISS_MS : DISMISS_MS;
      const openStartMs = reducedMotion ? REDUCED_OPEN_START_DELAY_MS : OPEN_START_DELAY_MS;
      const unfoldMs = reducedMotion ? REDUCED_UNFOLD_MS : UNFOLD_MS;
      const flapLeadMs = reducedMotion ? 0 : FLAP_LEAD_MS;
      const stackHandoffMs = reducedMotion ? 0 : STACK_HANDOFF_MS;
      const openRevealMs = flapLeadMs + stackHandoffMs;
      const totalMs = ENABLE_OPEN_ANIMATION
        ? openStartMs + openRevealMs + unfoldMs
        : dismissMs;

      host.classList.add('is-dismiss-sliding');
      void sibling.offsetWidth;
      sibling.classList.add('is-dismissed');

      global.setTimeout(() => {
        host.classList.remove('is-dismiss-sliding');
      }, openStartMs);

      global.setTimeout(() => {
        sibling.classList.add('is-dismissed-gone');
        if (!ENABLE_OPEN_ANIMATION) {
          applyMoodClasses();
          host.classList.add('is-open');
          remeasure();
          animating = false;
          if (fromUser) opts.onSelect?.(mood);
        }
      }, dismissMs);

      if (!ENABLE_OPEN_ANIMATION) return;

      global.setTimeout(() => {
        host.classList.add('is-opening');
        remeasure();
      }, openStartMs);

      global.setTimeout(() => {
        host.classList.add('is-fold-visible');
        remeasure();
      }, openStartMs + flapLeadMs);

      global.setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            host.classList.add('is-open');
            remeasure();
          });
        });
      }, openStartMs + openRevealMs);

      global.setTimeout(() => {
        host.classList.remove('is-opening');
        host.classList.remove('is-fold-visible');
        applyMoodClasses();
        remeasure();
        animating = false;
        if (fromUser) opts.onSelect?.(mood);
      }, totalMs);
    }

    function resetMood({ instant = false } = {}) {
      if (!mood && !host.classList.contains('is-open')) return;
      if (animating) return;

      const prev = mood;
      mood = null;
      animating = !instant;

      cardGood.btn.classList.remove('is-chosen', 'is-dismissed', 'is-dismissed-gone');
      cardRough.btn.classList.remove('is-chosen', 'is-dismissed', 'is-dismissed-gone');
      host.classList.remove('is-good', 'is-rough', 'is-open', 'is-opening', 'is-fold-visible', 'is-dismiss-sliding');

      if (instant) {
        host.classList.add('is-instant');
        applyMoodClasses();
        remeasure();
        host.classList.remove('is-instant');
        animating = false;
        return;
      }

      applyMoodClasses();
      global.setTimeout(() => {
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
        resetMood();
        return;
      }
      if (mood) return;
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
    host.classList.remove('is-good', 'is-rough', 'is-open', 'is-ready', 'is-opening', 'is-fold-visible', 'is-dismiss-sliding', 'is-instant');
    delete host.dataset.panel;
  }

  /** Spread-widget compatibility aliases */
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
    UNFOLD_MS
  };
});
