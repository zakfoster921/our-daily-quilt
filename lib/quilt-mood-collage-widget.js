/**
 * Mood collage lab — quote + layered collage; gold tape strips scratch to reveal good/rough day.
 * Background layer is today's quilt (block rects). Browser: global.QuiltMoodCollageWidget.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.QuiltMoodCollageWidget = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function (global) {
  'use strict';

  const STYLE_ID = 'quilt-mood-collage-widget-styles-v34';
  const COLLAGE_BUILD = 'v132';
  const SWATCH_PROTECTED_CLEAR_PX = 10;
  /** Scratch strips span this fraction of the yellow card interior width. */
  const CARD_STRIP_WIDTH_FRAC = 0.92;
  /** Extra stage height (× width) for fabric swatch band below the yellow card. */
  const COLLAGE_SWATCH_BELOW_EXTRA = 0.4;
  /** Mood collage fabric card — wide enough for paint name + hex on the label tab. */
  const COLLAGE_SWATCH_WIDTH_VW = 64;
  const COLLAGE_SWATCH_WIDTH_MAX_PX = 256;
  const SWATCH_STAGE_INSET_FRAC = 0.02;
  /** iPhone quilt column — all collage layout tuning targets this width. */
  const COLLAGE_IPHONE_WIDTH_PX = 390;
  const COLLAGE_TOP_BAND_FRAC = 0.42;
  const COLLAGE_BOTTOM_BAND_FRAC = 0.58;
  const SWATCH_JITTER_X_FRAC = 0.12;
  const SWATCH_JITTER_Y_FRAC = 0.08;
  /** Rotated fabric card bbox is taller than flat width×aspect estimate. */
  const SWATCH_ROTATION_BBOX_SCALE = 1.16;
  const SWATCH_STRIP_PAD_FRAC = 0.028;
  /** Card interior inset — protected strip block spans inner face, not yellow border. */
  const CARD_INTERIOR_INSET_FRAC = 0.055;
  const PENNY_JITTER_X_FRAC = 0.06;
  const PENNY_JITTER_Y_FRAC = 0.04;

  /** Slot roles — assets swap; collision rules stay tied to role. */
  const COLLAGE_SLOTS = [
    { role: 'card', z: 2, hard: [] },
    { role: 'swatch', z: 7, hard: ['clear-quote-text', 'above-strip-band'] },
    { role: 'penny', z: 9, hard: ['above-strip-band'] },
    { role: 'strips', z: 12, hard: [] }
  ];

  const COLLAGE_HARD = {
    STRIP_BAND: 'above-strip-band',
    QUOTE_TEXT: 'clear-quote-text'
  };
  const SWATCH_CARD_GAP_FRAC = 0.026;
  const SWATCH_LEFT_INSET_FRAC = 0.035;
  const COLLAGE_ASPECT = 960 / 767;
  const COLLAGE_STRIP_CLEARANCE = 0.018;
  const SWATCH_QUOTE_CLEARANCE_FRAC = 0.05;
  const COLLAGE_DOILY_LAYOUT = true;
  const COLLAGE_SHOW_TRIANGLE = false;
  const COLLAGE_QUOTE_DISPLAY_SCALE = 0.96;
  /** Horizontal inset so boosted quote PNGs stay on screen (each side). */
  const COLLAGE_QUOTE_SIDE_MARGIN_PX = 12;
  const MOOD_CARD_DISPLAY_WIDTH = 1.02;
  const MOOD_CARD_ASPECT = 607 / 928;
  /** Shorter stage sized for the yellow mood card + penny. */
  const COLLAGE_CARD_STAGE_HEIGHT_SCALE = MOOD_CARD_DISPLAY_WIDTH * MOOD_CARD_ASPECT + 0.1;
  const COLLAGE_STAGE_HEIGHT_SCALE = COLLAGE_DOILY_LAYOUT
    ? COLLAGE_CARD_STAGE_HEIGHT_SCALE
    : COLLAGE_ASPECT;
  const QUOTE_TEXT_INSET_X = 0.07;
  const QUOTE_TEXT_INSET_TOP = 0.06;
  const QUOTE_TEXT_INSET_BOTTOM = 0.26;
  const PENNY_TEXT_CLEARANCE_PX = 3;
  const PENNY_NARROW_STAGE_MAX_PX = 440;
  const TRIANGLE_ROTATE_MIN = -8;
  const TRIANGLE_ROTATE_MAX = 8;
  const TRIANGLE_BASE_ROTATE = 0;
  const TRIANGLE_STRIP_CENTER_Y = 0.44;
  const PENNY_TAPE_ASPECT = 384 / 1024;
  const PENNY_TAPE_WIDTH_SCALE = 2.35;
  const PENNY_TAPE_ROTATE_DEG = -4;
  const SKY_TAPE_PAD = 0.018;
  /** Sky cutout longest axis vertical (asset is horizontal at 0°). */
  const SKY_ROTATE_DEG = 90;
  const SKY_DISPLAY_SCALE = 1.35;
  /** Quote + cosmos decorative tilt; mood scratch strips stay level. */
  const STRIP_ROTATE_BASE = -10;
  const STRIP_ROTATE_SPREAD = 2.5;
  const MOOD_TAPE_ROTATE_DEG = 0;
  const COSMOS_TAPE_WIDTH = 0.76;
  const COSMOS_TAPE_PAD = 0.036;
  const COSMOS_TAPE_ASPECT = 96 / 480;
  const TAPE_GOOD_ASPECT = 89 / 480;
  const TAPE_ROUGH_ASPECT = 89 / 480;
  const PENNY_ASPECT = 484 / 480;
  /** US cent diameter (0.75 in); display scale bumps on-screen size above strict lifesize. */
  const PENNY_LIFESIZE_DIAMETER_MM = 19.05;
  const PENNY_DISPLAY_SCALE = 1.4;
  const PENNY_SIZE_SCALE = 0.81;
  const PENNY_DIAMETER_MM = PENNY_LIFESIZE_DIAMETER_MM * PENNY_DISPLAY_SCALE;
  const CSS_MM_TO_PX = 96 / 25.4;
  /** Touch screens under-render CSS mm vs real-world size (96dpi ref vs device PPI). */
  const PENNY_TOUCH_PHYSICAL_FACTOR = 1.46;
  const PENNY_LAYOUT_TAPE_GAP = 0.012;
  const PENNY_TRIANGLE_BAND_TOP = 0.08;
  const PENNY_TRIANGLE_X_MIN = 0.54;
  const PENNY_TRIANGLE_X_MAX = 0.76;
  const TAPE_LAYOUT_QUOTE_GAP = 0.018;
  const TAPE_LAYOUT_STRIP_GAP = 0.015;
  /** Extra gap between mood scratch strips in card layout (room for OR strip). */
  const CARD_OR_STRIP_GAP = 0.072;
  const ASSET_BASE = 'assets/mood-collage';
  const SCRATCH_REVEAL_THRESHOLD = 0.99;
  const SCRATCH_BRUSH_MIN = 28;
  const SCRATCH_BRUSH_MAX = 72;
  const SCRATCH_BRUSH_ZONE_FRAC = 0.28;
  const SCRATCH_MOVE_COMMIT_PX = 12;
  const DISMISS_MARKS_FADE_MS = 920;
  const SCRATCH_PERSIST_MIN_PROGRESS = 0.06;
  const SCRATCH_PERSIST_DEBOUNCE_MS = 360;
  const SCRATCH_MASK_MAX_PX = 256;
  const SCRATCH_STORAGE_KEY =
    global.Utils?.QUILT_MOOD_SCRATCH_KEY || 'ourDailyQuiltMoodScratchV1';

  function prefersReducedMotion() {
    if (typeof global.matchMedia !== 'function') return false;
    return global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isTouchPennyViewport() {
    if (typeof global.matchMedia !== 'function') return false;
    return global.matchMedia('(pointer: coarse)').matches;
  }

  function pennyPhysicalFactor() {
    return isTouchPennyViewport() ? PENNY_TOUCH_PHYSICAL_FACTOR : 1;
  }

  function pennyWidthPx(scale = 1) {
    return PENNY_DIAMETER_MM * scale * CSS_MM_TO_PX * pennyPhysicalFactor() * PENNY_SIZE_SCALE;
  }

  function pennyDisplayWidth(scale = 1) {
    if (pennyPhysicalFactor() > 1) return `${pennyWidthPx(scale).toFixed(2)}px`;
    return `${(PENNY_DIAMETER_MM * scale * PENNY_SIZE_SCALE).toFixed(2)}mm`;
  }

  function pennySizePxAtScale(scale = 1) {
    const w = pennyWidthPx(scale);
    return { w, h: w * PENNY_ASPECT };
  }

  const ASSETS = {
    moodCard: `${ASSET_BASE}/mood-card.webp?${COLLAGE_BUILD}`,
    circle: `${ASSET_BASE}/circle.webp?${COLLAGE_BUILD}`,
    triangle: `${ASSET_BASE}/triangle.webp`,
    penny: `${ASSET_BASE}/penny.webp`,
    pennyTape: `${ASSET_BASE}/penny-tape.png?${COLLAGE_BUILD}`,
    tapeGoodFoil: `${ASSET_BASE}/tape-good-foil.webp`,
    tapeGoodMarks: `${ASSET_BASE}/tape-good-marks.webp`,
    tapeRoughFoil: `${ASSET_BASE}/tape-rough-foil.webp`,
    tapeRoughMarks: `${ASSET_BASE}/tape-rough-marks.webp`,
    tapeCosmos: `${ASSET_BASE}/tape-cosmos.webp?${COLLAGE_BUILD}`
  };

  function injectStyles() {
    preloadAssets();
    const existing = document.getElementById(STYLE_ID);
    const css = `
      #screen-quilt .quilt-mood-collage {
        --collage-quote-top: 0%;
        --collage-circle-top: 0%;
        --collage-circle-width: ${SKY_DISPLAY_SCALE * 100}%;
        --collage-circle-rotate: ${SKY_ROTATE_DEG}deg;
        --collage-triangle-width: 75%;
        --collage-triangle-bottom: 18%;
        --collage-tape-good-top: 42%;
        --collage-tape-rough-top: 53%;
        --collage-tape-width: 92%;
        --collage-quote-rotate: ${STRIP_ROTATE_BASE}deg;
        --collage-tape-good-rotate: ${MOOD_TAPE_ROTATE_DEG}deg;
        --collage-tape-rough-rotate: ${MOOD_TAPE_ROTATE_DEG}deg;
        --collage-cosmos-width: ${COSMOS_TAPE_WIDTH * 100}%;
        --collage-cosmos-top-top: 8%;
        --collage-cosmos-bottom-top: 82%;
        --collage-cosmos-top-rotate: ${-STRIP_ROTATE_BASE}deg;
        --collage-cosmos-bottom-rotate: ${STRIP_ROTATE_BASE}deg;
        --collage-penny-width: ${pennyDisplayWidth(1)};
        --collage-penny-bottom: 24%;
        --collage-penny-left: 50%;
        --collage-penny-translate-x: -50%;
        --collage-tape-paper-fill: color-mix(
          in srgb,
          var(--quilt-quote-paper-bg, var(--quilt-paper-card-fallback, var(--odq-paper-artifact, #f6f4f1))) 84%,
          var(--odq-paper-tape, #f2eee6) 16%
        );
        --collage-tape-paper-wash:
          radial-gradient(
            ellipse 128% 112% at 50% 44%,
            transparent 40%,
            color-mix(in srgb, var(--collage-tape-paper-fill) 18%, rgba(108, 78, 52, 0.34) 82%) 100%
          ),
          linear-gradient(118deg, rgba(96, 72, 50, 0.09) 0%, transparent 48%),
          linear-gradient(298deg, rgba(90, 66, 48, 0.085) 0%, transparent 52%);
        --collage-tape-copy-font: var(
          --quilt-clipping-font,
          var(--quilt-dm-sans-font, 'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif)
        );
        --collage-tape-copy-ink: rgba(56, 46, 36, 0.78);
        --collage-tape-copy-ink-shadow: 0 0 0.32px rgba(56, 46, 36, 0.35);
        --collage-tape-copy-tracking: 0.018em;
        --collage-tape-mark-blend: multiply;
        --collage-tape-mark-filter: brightness(0.62) contrast(1.24) saturate(0.82);
        position: relative;
        display: block;
        width: 100%;
        max-width: min(${COLLAGE_IPHONE_WIDTH_PX}px, var(--quilt-float-sheet-width, 460px));
        margin: 0 auto;
        aspect-ratio: 1 / var(--collage-stage-height-scale, ${COLLAGE_CARD_STAGE_HEIGHT_SCALE.toFixed(4)});
        min-height: 0;
        min-width: 0;
        flex-shrink: 0;
        align-self: center;
        filter: var(--odq-artifact-shadow, drop-shadow(0 4px 14px rgba(45, 36, 29, 0.14)));
        overflow: visible;
      }

      #screen-quilt .quilt-mood-collage[hidden] { display: none !important; }

      /* Avoid a lone quote painting over the quilt before layout has a real stage size. */
      #screen-quilt #quiltMoodSpread.quilt-mood-collage:not(.is-layer-ready):not([hidden]) {
        visibility: hidden;
        pointer-events: none;
      }

      /* Live quilt shows through the sky cutout — no baked quilt canvas. */
      #screen-quilt .quilt-mood-collage.is-quilt-overlay {
        background: transparent;
      }

      #screen-quilt .quilt-mood-collage.is-quilt-overlay .quilt-mood-collage__stage {
        background: transparent;
      }

      #screen-quilt .quilt-mood-collage.is-quilt-overlay .quilt-mood-collage__quilt-bg {
        display: none !important;
      }

      #screen-quilt .quilt-mood-collage__stage {
        position: absolute;
        inset: 0;
        overflow: visible;
        border-radius: 2px;
      }

      #screen-quilt .quilt-mood-collage__quilt-bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      #screen-quilt .quilt-mood-collage__layer {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        pointer-events: none;
        user-select: none;
        max-width: 100%;
        height: auto;
      }

      #screen-quilt .quilt-mood-collage__quote {
        position: absolute;
        top: var(--collage-quote-top);
        left: var(--collage-quote-left, 50%);
        width: auto;
        max-width: 100%;
        transform: translateX(var(--collage-quote-translate-x, -50%)) rotate(var(--collage-quote-rotate, ${STRIP_ROTATE_BASE}deg));
        transform-origin: center top;
        z-index: 7;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-collage__quote img {
        display: block;
        width: 100%;
        height: auto;
        filter: drop-shadow(0 2px 6px rgba(45, 36, 29, 0.12));
      }

      #screen-quilt .quilt-mood-collage__quote.is-quote-pending {
        visibility: hidden;
        height: 0;
        overflow: hidden;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-collage__circle {
        top: var(--collage-circle-top);
        left: 50%;
        width: var(--collage-circle-width);
        max-width: none;
        transform: translateX(-50%) rotate(var(--collage-circle-rotate, 0deg));
        transform-origin: 50% 50%;
        z-index: 2;
      }

      #screen-quilt .quilt-mood-collage__cosmos-tape {
        width: var(--collage-cosmos-width);
        height: auto;
        z-index: 4;
        transform-origin: center center;
      }

      #screen-quilt .quilt-mood-collage__cosmos-tape--top {
        top: var(--collage-cosmos-top-top);
        transform: translateX(-50%) rotate(var(--collage-cosmos-top-rotate, ${-STRIP_ROTATE_BASE}deg));
      }

      #screen-quilt .quilt-mood-collage__cosmos-tape--bottom {
        top: var(--collage-cosmos-bottom-top);
        transform: translateX(-50%) rotate(var(--collage-cosmos-bottom-rotate, ${STRIP_ROTATE_BASE}deg));
      }

      #screen-quilt .quilt-mood-collage.is-doily-layout .quilt-mood-collage__cosmos-tape,
      #screen-quilt .quilt-mood-collage.is-doily-layout .quilt-mood-collage__circle,
      #screen-quilt .quilt-mood-collage.is-doily-layout .quilt-mood-collage__triangle,
      #screen-quilt .quilt-mood-collage.is-doily-layout .quilt-mood-collage__penny-tape {
        display: none !important;
      }

      #screen-quilt .quilt-mood-collage__layer.quilt-mood-collage__mood-card {
        top: var(--collage-card-top, 2%);
        width: var(--collage-card-width, 102%);
        max-width: none;
        z-index: 2;
        display: block;
        filter: drop-shadow(0 3px 12px rgba(36, 40, 48, 0.14));
      }

      #screen-quilt .quilt-mood-collage__stage .quilt-daily-colors-zone.quilt-mood-collage__swatch-slot {
        position: absolute;
        top: var(--collage-swatch-top, 6%);
        left: var(--collage-swatch-left, 8%);
        bottom: auto;
        width: auto;
        z-index: 7;
        margin: 0;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-collage__stage .quilt-daily-colors-zone.quilt-mood-collage__swatch-slot .quilt-daily-colors-stage {
        align-items: flex-start;
        width: auto;
      }

      #screen-quilt .quilt-mood-collage__stage .quilt-daily-colors-zone.quilt-mood-collage__swatch-slot .quilt-user-color-card-wrap {
        --quilt-color-card-tilt: -9deg;
        width: min(${COLLAGE_SWATCH_WIDTH_VW}vw, ${COLLAGE_SWATCH_WIDTH_MAX_PX}px);
        max-width: none;
        margin: 0;
        transform-origin: 38% 86%;
        pointer-events: auto;
      }

      #screen-quilt .quilt-mood-collage__stage .quilt-daily-colors-zone.quilt-mood-collage__swatch-slot .quilt-user-shape-card__label {
        font-size: clamp(0.62rem, 3vw, 0.76rem);
      }

      #screen-quilt .quilt-mood-collage.is-doily-layout .quilt-mood-collage__penny {
        z-index: 9;
      }

      #screen-quilt .quilt-mood-collage__or-strip {
        --layout-b-strip-letter-spacing: 0.045em;
        position: absolute;
        left: var(--collage-or-left, var(--collage-tape-left, 50%));
        top: var(--collage-or-top, 50%);
        transform: translate(-50%, -50%);
        z-index: 13;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.42em;
        margin: 0;
        padding: 0.34em 0.72em;
        background-color: var(--collage-tape-paper-fill);
        background-image:
          var(--collage-tape-paper-wash),
          var(--quilt-paper-surface-image, none);
        background-size: 100% 100%, 100% 100%;
        background-position: center, center;
        background-repeat: no-repeat;
        background-blend-mode: multiply, normal;
        color: var(--collage-tape-copy-ink);
        text-shadow: var(--collage-tape-copy-ink-shadow);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.28),
          0 1px 0 rgba(36, 40, 48, 0.06),
          0 2px 6px rgba(45, 36, 29, 0.12);
        border-radius: 1px;
        white-space: nowrap;
        line-height: 1;
        font-family: var(--collage-tape-copy-font);
        font-weight: 700;
        font-size: clamp(0.7rem, 2.6vw, 0.9rem);
        letter-spacing: var(--layout-b-strip-letter-spacing);
        text-transform: uppercase;
        pointer-events: none;
        user-select: none;
        isolation: isolate;
        overflow: hidden;
      }

      #screen-quilt .quilt-mood-collage__or-strip::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background-color: var(--collage-tape-paper-fill);
        background-image: var(--quilt-paper-card-texture, none);
        background-size: 118% 118%;
        background-position: center;
        background-repeat: no-repeat;
        background-blend-mode: multiply;
      }

      #screen-quilt .quilt-mood-collage__or-strip::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        opacity: 0.07;
        mix-blend-mode: multiply;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.62'/%3E%3C/svg%3E");
        background-size: 88px 88px;
        background-repeat: repeat;
      }

      #screen-quilt .quilt-mood-collage__or-glyph,
      #screen-quilt .quilt-mood-collage__or-word {
        position: relative;
        z-index: 2;
      }

      #screen-quilt .quilt-mood-collage__or-glyph {
        font-size: 0.94em;
        line-height: 1;
        letter-spacing: 0;
        opacity: 0.86;
      }

      #screen-quilt .quilt-mood-collage:not(.is-doily-layout) .quilt-mood-collage__or-strip {
        display: none !important;
      }

      #screen-quilt .quilt-mood-collage.is-triangle-layout .quilt-mood-collage__cosmos-tape {
        display: none;
      }

      #screen-quilt .quilt-mood-collage.is-triangle-layout .quilt-mood-collage__circle {
        display: none;
      }

      #screen-quilt .quilt-mood-collage__layer.quilt-mood-collage__triangle {
        bottom: var(--collage-triangle-bottom);
        width: var(--collage-triangle-width);
        z-index: 3;
        transform-origin: 50% 50%;
        isolation: isolate;
      }

      #screen-quilt .quilt-mood-collage__triangle-photo {
        display: block;
        width: 100%;
        height: auto;
        position: relative;
        z-index: 0;
        filter: drop-shadow(0 3px 10px rgba(36, 40, 48, 0.16));
      }

      #screen-quilt .quilt-mood-collage__penny {
        top: auto;
        bottom: var(--collage-penny-bottom);
        left: var(--collage-penny-left, 50%);
        width: var(--collage-penny-width);
        max-width: none;
        z-index: 9;
        transform: translateX(var(--collage-penny-translate-x, -50%));
      }

      #screen-quilt .quilt-mood-collage__layer.quilt-mood-collage__penny-tape {
        top: auto;
        bottom: var(--collage-penny-tape-bottom, var(--collage-penny-bottom));
        left: var(--collage-penny-tape-left, var(--collage-penny-left, 50%));
        width: var(--collage-penny-tape-width, calc(var(--collage-penny-width) * ${PENNY_TAPE_WIDTH_SCALE}));
        height: auto;
        max-width: none;
        z-index: 10;
        transform: translateX(var(--collage-penny-tape-translate-x, var(--collage-penny-translate-x, -50%)))
          rotate(var(--collage-penny-tape-rotate, ${PENNY_TAPE_ROTATE_DEG}deg));
        transform-origin: 18% 58%;
        pointer-events: none;
        display: block;
        object-fit: contain;
        opacity: 0.96;
      }

      #screen-quilt .quilt-mood-collage__tape {
        position: absolute;
        left: var(--collage-tape-left, 50%);
        width: var(--collage-tape-width, 92%);
        transform: translateX(-50%);
        transform-origin: center center;
        z-index: 12;
        touch-action: none;
        cursor: crosshair;
        border: 0;
        padding: 0;
        margin: 0;
        background: transparent;
        appearance: none;
        -webkit-appearance: none;
        overflow: hidden;
        isolation: isolate;
      }

      #screen-quilt .quilt-mood-collage__tape-surface,
      #screen-quilt .quilt-mood-collage__tape-msg {
        -webkit-mask-image: var(--collage-tape-mask);
        mask-image: var(--collage-tape-mask);
        -webkit-mask-size: 100% 100%;
        mask-size: 100% 100%;
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
        -webkit-mask-mode: alpha;
        mask-mode: alpha;
      }

      #screen-quilt .quilt-mood-collage__tape-surface {
        position: absolute;
        inset: 0;
        z-index: 0;
        box-sizing: border-box;
        overflow: hidden;
        background-color: var(--collage-tape-paper-fill);
        background-image:
          var(--collage-tape-paper-wash),
          var(--quilt-paper-surface-image, none);
        background-size: 100% 100%, 100% 100%;
        background-position: center, center;
        background-repeat: no-repeat;
        background-blend-mode: multiply, normal;
        pointer-events: none;
      }

      /* Overscale card texture so JPEG side margins don't read as a white frame. */
      #screen-quilt .quilt-mood-collage__tape-surface::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background-color: var(--collage-tape-paper-fill);
        background-image: var(--quilt-paper-card-texture, none);
        background-size: 118% 118%;
        background-position: center;
        background-repeat: no-repeat;
        background-blend-mode: multiply;
      }

      #screen-quilt .quilt-mood-collage__tape-surface::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        opacity: 0.07;
        mix-blend-mode: multiply;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.62'/%3E%3C/svg%3E");
        background-size: 88px 88px;
        background-repeat: repeat;
      }

      #screen-quilt .quilt-mood-collage__tape--good {
        top: var(--collage-tape-good-top);
        transform: translateX(-50%) rotate(var(--collage-tape-good-rotate, ${MOOD_TAPE_ROTATE_DEG}deg));
        transform-origin: center center;
        aspect-ratio: 480 / 89;
        --collage-tape-mask: url(${ASSETS.tapeGoodFoil});
      }

      #screen-quilt .quilt-mood-collage__tape--rough {
        top: var(--collage-tape-rough-top);
        transform: translateX(-50%) rotate(var(--collage-tape-rough-rotate, ${MOOD_TAPE_ROTATE_DEG}deg));
        transform-origin: center center;
        aspect-ratio: 480 / 89;
        --collage-tape-mask: url(${ASSETS.tapeRoughFoil});
      }

      #screen-quilt .quilt-mood-collage__tape:focus-visible {
        outline: 2px solid rgba(230, 212, 168, 0.95);
        outline-offset: 3px;
      }

      #screen-quilt .quilt-mood-collage__tape-msg {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1;
        padding: clamp(0.32rem, 2.1vw, 0.48rem) clamp(0.88rem, 5.4vw, 1.2rem);
        box-sizing: border-box;
        font-family: var(--collage-tape-copy-font);
        font-size: clamp(0.95rem, 4.1vw, 1.18rem);
        font-weight: 500;
        font-style: normal;
        line-height: 1.28;
        letter-spacing: var(--collage-tape-copy-tracking);
        text-align: center;
        color: var(--collage-tape-copy-ink);
        text-shadow: var(--collage-tape-copy-ink-shadow);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        pointer-events: none;
        overflow-wrap: break-word;
        hyphens: auto;
        -webkit-hyphens: auto;
      }

      #screen-quilt .quilt-mood-collage__tape-msg::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.14;
        mix-blend-mode: multiply;
        background-image: radial-gradient(
          circle at center,
          rgba(56, 46, 36, 0.55) 0.45px,
          transparent 0.48px
        );
        background-size: 3px 3px;
      }

      /* Copy lives under the foil — hide until scratch surface paints or a strip is revealed. */
      #screen-quilt .quilt-mood-collage__tape:not(.is-scratch-ready):not(.is-revealed) .quilt-mood-collage__tape-msg {
        visibility: hidden;
      }

      #screen-quilt .quilt-mood-collage__tape.is-dismissed .quilt-mood-collage__tape-msg {
        visibility: hidden;
      }

      #screen-quilt .quilt-mood-collage__scratch-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        touch-action: none;
        z-index: 2;
        opacity: 0;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-collage__tape-marks {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        z-index: 3;
        pointer-events: none;
        opacity: 0;
        mix-blend-mode: var(--collage-tape-mark-blend, multiply);
        filter: var(--collage-tape-mark-filter, none);
      }

      #screen-quilt .quilt-mood-collage__tape.is-scratch-ready .quilt-mood-collage__scratch-canvas,
      #screen-quilt .quilt-mood-collage__tape.is-scratch-ready .quilt-mood-collage__tape-marks {
        opacity: 1;
      }

      #screen-quilt .quilt-mood-collage__tape.is-scratch-ready .quilt-mood-collage__tape-marks {
        transition: opacity ${DISMISS_MARKS_FADE_MS}ms ease-out;
      }

      #screen-quilt .quilt-mood-collage__tape.is-scratch-ready .quilt-mood-collage__scratch-canvas {
        pointer-events: auto;
      }

      #screen-quilt .quilt-mood-collage__tape.is-revealed .quilt-mood-collage__scratch-canvas {
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-collage__tape.is-revealed .quilt-mood-collage__tape-marks {
        opacity: 0;
        transition: opacity 280ms ease;
      }

      #screen-quilt .quilt-mood-collage__tape.is-dismissed {
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-collage__tape.is-dismissed .quilt-mood-collage__tape-marks {
        opacity: 0;
        transition: opacity ${DISMISS_MARKS_FADE_MS}ms ease-out, visibility 0s linear ${DISMISS_MARKS_FADE_MS}ms;
      }

      #screen-quilt .quilt-mood-collage.is-instant .quilt-mood-collage__tape.is-dismissed .quilt-mood-collage__tape-marks,
      #screen-quilt .quilt-mood-collage.is-instant .quilt-mood-collage__tape.is-revealed .quilt-mood-collage__tape-marks {
        transition: none;
      }

      #screen-quilt .quilt-mood-collage.is-locked .quilt-mood-collage__tape {
        pointer-events: none;
        cursor: default;
      }

      #screen-quilt .quilt-mood-collage__announcer {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
      }

      #screen-quilt .quilt-mood-collage__tape-surface > .odq-scanner-bed {
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-collage__debug-overlay {
        position: absolute;
        inset: 0;
        z-index: 99;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-collage__debug-overlay span {
        position: absolute;
        box-sizing: border-box;
        border: 2px solid;
        font: 600 10px/1.2 system-ui, sans-serif;
        padding: 2px 4px;
        color: #fff;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.85);
      }

      #screen-quilt .quilt-mood-collage__debug-protected,
      #screen-quilt .quilt-mood-collage__debug-strip {
        border-color: rgba(226, 34, 68, 0.9);
        background: rgba(0, 0, 0, 0.44);
      }

      #screen-quilt .quilt-mood-collage__debug-quote {
        border-color: #2484e2;
        background: rgba(36, 132, 226, 0.12);
      }

      #screen-quilt .quilt-mood-collage__debug-safe {
        border-color: #22aa88;
        background: rgba(34, 170, 136, 0.14);
      }

      @media (max-width: 768px) {
        #screen-quilt:has(#quiltMoodSpread.quilt-mood-collage.is-layer-ready:not([hidden])) .quilt-mood-duo {
          z-index: 12;
          min-height: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-bottom: clamp(0.35rem, 2vw, 0.65rem);
          margin-top: calc(var(--quilt-fixed-top) + var(--quilt-fixed-height) + 20px);
        }

        #screen-quilt:has(#quiltMoodSpread.quilt-mood-collage.is-layer-ready:not([hidden]))
          .quilt-mood-duo .quilt-daily-colors-zone:not(.quilt-mood-collage__swatch-slot) {
          display: none !important;
        }

        #screen-quilt:has(#quiltMoodSpread.quilt-mood-collage.is-layer-ready:not([hidden]))
          .quilt-mood-collage__stage .quilt-daily-colors-zone.quilt-mood-collage__swatch-slot:has(
            #quiltUserColorCardWrap:not([hidden])
          ) {
          display: flex !important;
        }

        #screen-quilt:has(#quiltMoodSpread.quilt-mood-collage.is-layer-ready:not([hidden]))
          .quilt-mood-duo__quote {
          position: relative;
          left: auto;
          right: auto;
          top: auto;
          width: auto;
          max-width: calc(100% - clamp(1.5rem, 6vw, 2.5rem));
          margin: 0 auto;
          transform: translateX(0) rotate(-3deg);
          transform-origin: center top;
          z-index: 2;
        }

        #screen-quilt .quilt-mood-duo__quote-tape {
          display: none;
        }

        #screen-quilt:has(#quiltMoodSpread.quilt-mood-collage.is-layer-ready:not([hidden]))
          .quilt-mood-duo__quote-tape {
          --quilt-byg-tape-strip: url("../assets/before-you-go-tape-alpha.png");
          display: block;
          position: absolute;
          top: clamp(0.1rem, 1.6vw, 0.5rem);
          left: 50%;
          width: clamp(4.8rem, 30vw, 7.2rem);
          height: clamp(1.8rem, 6.8vw, 2.4rem);
          transform: translateX(-50%) rotate(-1.5deg);
          transform-origin: center center;
          z-index: 3;
          pointer-events: none;
          opacity: 0.94;
          background: transparent;
          background-image: var(--quilt-byg-tape-strip);
          background-size: 100% 100%;
          background-repeat: no-repeat;
          background-position: center;
          filter: drop-shadow(0 1px 3px rgba(45, 36, 29, 0.12));
        }

        #screen-quilt:has(#quiltMoodSpread.quilt-mood-collage.is-layer-ready:not([hidden]))
          .quilt-mood-duo__quote-img {
          position: relative;
          z-index: 1;
        }

        #screen-quilt:has(#quiltMoodSpread.quilt-mood-collage.is-layer-ready:not([hidden]))
          .quote-card-stack {
          position: relative;
          z-index: 10;
          margin-top: clamp(0.5rem, 2.5vw, 1rem);
        }

        #screen-quilt:has(#quiltMoodSpread.quilt-mood-collage.is-layer-ready:not([hidden]))
          .quilt-mood-duo + .quote-card-stack {
          margin-top: clamp(0.65rem, 3vw, 1.15rem);
        }

        #screen-quilt:has(#quiltMoodSpread.quilt-mood-collage.is-layer-ready:not([hidden]))
          #quiltMoodSpread {
          margin-top: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #screen-quilt .quilt-mood-collage__tape.is-revealed .quilt-mood-collage__tape-marks,
        #screen-quilt .quilt-mood-collage__tape.is-dismissed .quilt-mood-collage__tape-marks {
          transition: none;
        }
      }
    `;
    if (existing) {
      existing.textContent = css;
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /** Match triptych quote PNG display sizing so the full clipping reads at the intended scale. */
  function quoteUrlsMatch(a, b) {
    const left = String(a || '').trim();
    const right = String(b || '').trim();
    if (!left || !right) return false;
    if (left === right) return true;
    try {
      const base = global.location?.href || 'http://localhost/';
      return new URL(left, base).href === new URL(right, base).href;
    } catch (_) {
      return false;
    }
  }

  function collageQuoteSideMarginPx() {
    const vw = Number(global.innerWidth) || 390;
    return Math.max(COLLAGE_QUOTE_SIDE_MARGIN_PX, Math.min(18, Math.round(vw * 0.032)));
  }

  /** Fit readable Firebase PNG width inside duo / viewport; clip handles slight rotate bleed. */
  function collageQuoteCappedWidthPx(quoteWrap, layoutW) {
    const target = Math.max(1, Math.round(Number(layoutW) || 0));
    if (!target) return 0;
    const margin = collageQuoteSideMarginPx() * 2;
    const duo = quoteWrap?.closest('#quiltMoodDuo');
    const screen = document.getElementById('screen-quilt');
    const containerW = Math.max(1, duo?.clientWidth || screen?.clientWidth || global.innerWidth || 390);
    const viewportW = Math.max(1, Number(global.innerWidth) || containerW);
    const cap = Math.min(target, containerW - margin, viewportW - margin);
    return Math.max(220, Math.round(cap));
  }

  function applyCollageQuoteDisplaySize(quoteImg, quoteWrap, opts = {}) {
    if (!quoteImg) return;
    let layoutW = 0;
    let readabilityScale = 1;
    const preset = Number(opts.quoteDisplayWidthPx) || 0;
    if (preset > 0) {
      layoutW = collageQuoteCappedWidthPx(quoteWrap, Math.round(preset));
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
          QNC.resolveCollageClippingLayoutOpts?.() || {
            displayScale: COLLAGE_QUOTE_DISPLAY_SCALE
          }
        );
        layoutW = Number(layout?.displayWidthPx) || 0;
        readabilityScale = Number(layout?.readabilityScale) || 1;
        if (layoutW > 0) {
          layoutW = collageQuoteCappedWidthPx(quoteWrap, layoutW);
        }
      }
    }
    if (layoutW > 0) {
      const cssW = `${Math.round(layoutW)}px`;
      if (quoteWrap) {
        quoteWrap.style.width = cssW;
        quoteWrap.style.maxWidth = `calc(100% - ${collageQuoteSideMarginPx() * 2}px)`;
        quoteWrap.classList.toggle('is-readable-boost', readabilityScale > 1.02);
      }
      quoteImg.style.width = '100%';
      quoteImg.style.maxWidth = '100%';
      quoteImg.style.height = 'auto';
      return;
    }
    quoteWrap?.classList.remove('is-readable-boost');
    const fallbackScale = COLLAGE_QUOTE_DISPLAY_SCALE;
    quoteImg.style.width = `${Math.round(fallbackScale * 100)}%`;
    quoteImg.style.maxWidth = '100%';
    quoteImg.style.height = 'auto';
  }

  function hashString(str) {
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Stable 0..1 jitter per date key + slot label (tape rotation uses the same hash). */
  function hashJitterUnit(dateKey, slot) {
    const key = String(dateKey || '').trim();
    if (!key) return 0.5;
    return hashString(`${key}:${slot}`) / 4294967295;
  }

  function isCollageDebug() {
    try {
      return new URLSearchParams(global.location?.search || '').get('collageDebug') === '1';
    } catch {
      return false;
    }
  }

  /** Per-strip gentle horizontal tilt (stable per day + slot). Mood scratch tapes stay 0°. */
  function tapeRotateDeg(dateKey, slot) {
    if (slot === 'good' || slot === 'rough') return MOOD_TAPE_ROTATE_DEG;
    const key = String(dateKey || '').trim();
    let base = STRIP_ROTATE_BASE;
    if (slot === 'cosmos-top') base = -STRIP_ROTATE_BASE;
    if (!key) return base;
    const unit = hashString(`${key}:tape-tilt:${slot}`) / 4294967295;
    const jitter = (unit - 0.5) * 2 * STRIP_ROTATE_SPREAD;
    return base + jitter;
  }

  /** Stable sideways tilt for a quilt day (−90° or +90° plus ±16° hand tilt). */
  function triangleRotateDeg(dateKey) {
    const key = String(dateKey || '').trim();
    if (!key) return -TRIANGLE_BASE_ROTATE;
    const sideUnit = hashString(`${key}:tri-side`) / 4294967295;
    const base = sideUnit < 0.5 ? -TRIANGLE_BASE_ROTATE : TRIANGLE_BASE_ROTATE;
    const tiltUnit = hashString(`${key}:tri-tilt`) / 4294967295;
    const tilt = TRIANGLE_ROTATE_MIN + tiltUnit * (TRIANGLE_ROTATE_MAX - TRIANGLE_ROTATE_MIN);
    return base + tilt;
  }

  function normalizeBlocks(rawBlocks) {
    if (!Array.isArray(rawBlocks)) return [];
    return rawBlocks
      .map((block) => {
        if (!block || typeof block !== 'object') return null;
        const x = Number(block.x);
        const y = Number(block.y);
        const w = Number(block.width ?? block.w);
        const h = Number(block.height ?? block.h);
        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
        const color = typeof block.color === 'string' && block.color ? block.color : '#d8d4cf';
        return { x, y, w, h, color };
      })
      .filter(Boolean);
  }

  function blockBounds(blocks) {
    if (!blocks.length) return null;
    const minX = Math.min(...blocks.map((b) => b.x));
    const minY = Math.min(...blocks.map((b) => b.y));
    const maxX = Math.max(...blocks.map((b) => b.x + b.w));
    const maxY = Math.max(...blocks.map((b) => b.y + b.h));
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }

  function renderQuiltToCanvas(canvas, blocks, cssW, cssH) {
    if (!canvas || cssW < 1 || cssH < 1) return;
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    canvas.width = pxW;
    canvas.height = pxH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#eae7e1';
    ctx.fillRect(0, 0, cssW, cssH);
    const bounds = blockBounds(blocks);
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) return;
    const scale = Math.max(cssW / bounds.w, cssH / bounds.h);
    const offsetX = (cssW - bounds.w * scale) * 0.5;
    const offsetY = (cssH - bounds.h * scale) * 0.5;
    blocks.forEach((b) => {
      ctx.fillStyle = b.color;
      ctx.fillRect(
        offsetX + (b.x - bounds.minX) * scale,
        offsetY + (b.y - bounds.minY) * scale,
        b.w * scale,
        b.h * scale
      );
    });
  }

  let assetsPreloaded = false;

  function preloadAssets() {
    if (assetsPreloaded) return;
    assetsPreloaded = true;
    for (const src of Object.values(ASSETS)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });
  }

  function sampleScratchProgress(canvas, foilMask) {
    if (!canvas || canvas.width < 1 || canvas.height < 1) return 0;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const step = 8;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let cleared = 0;
    let foilTotal = 0;
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const idx = y * canvas.width + x;
        if (foilMask && !foilMask[idx]) continue;
        foilTotal++;
        if (data[idx * 4 + 3] < 48) cleared++;
      }
    }
    return foilTotal > 0 ? cleared / foilTotal : 0;
  }

  function captureFoilMask(ctx, width, height) {
    if (!ctx || width < 1 || height < 1) return null;
    const data = ctx.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let idx = 0; idx < width * height; idx++) {
      mask[idx] = data[idx * 4 + 3] >= 48 ? 1 : 0;
    }
    return mask;
  }

  function readScratchStore() {
    try {
      const raw = global.localStorage?.getItem(SCRATCH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const dateKey = String(parsed.dateKey || '').trim();
      const contentSig = String(parsed.contentSig || '').trim();
      if (!dateKey || !contentSig) return null;
      return {
        dateKey,
        contentSig,
        zones: parsed.zones && typeof parsed.zones === 'object' ? parsed.zones : {}
      };
    } catch (_) {
      return null;
    }
  }

  function writeScratchStore(store) {
    if (!store?.dateKey || !store?.contentSig) return false;
    try {
      global.localStorage?.setItem(
        SCRATCH_STORAGE_KEY,
        JSON.stringify({
          dateKey: store.dateKey,
          contentSig: store.contentSig,
          zones: store.zones || {}
        })
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearMoodScratchStorage() {
    try {
      global.localStorage?.removeItem(SCRATCH_STORAGE_KEY);
    } catch (_) {
      /* */
    }
  }

  function clearMoodScratchForSig(dateKey, contentSig) {
    const dk = String(dateKey || '').trim();
    const sig = String(contentSig || '').trim();
    if (!dk || !sig) return;
    const store = readScratchStore();
    if (!store || store.dateKey !== dk || store.contentSig !== sig) return;
    clearMoodScratchStorage();
  }

  function loadZoneScratchMask(dateKey, contentSig, mood) {
    const dk = String(dateKey || '').trim();
    const sig = String(contentSig || '').trim();
    if (!dk || !sig || (mood !== 'good' && mood !== 'rough')) return null;
    const store = readScratchStore();
    if (!store || store.dateKey !== dk || store.contentSig !== sig) return null;
    const entry = store.zones?.[mood];
    if (!entry?.dataUrl || entry.w < 1 || entry.h < 1) return null;
    return entry;
  }

  function saveZoneScratchMask(dateKey, contentSig, mood, entry) {
    const dk = String(dateKey || '').trim();
    const sig = String(contentSig || '').trim();
    if (!dk || !sig || !entry?.dataUrl || (mood !== 'good' && mood !== 'rough')) return false;
    let store = readScratchStore();
    if (!store || store.dateKey !== dk || store.contentSig !== sig) {
      store = { dateKey: dk, contentSig: sig, zones: {} };
    }
    store.zones[mood] = {
      w: entry.w,
      h: entry.h,
      dataUrl: entry.dataUrl,
      progress: Number(entry.progress) || 0
    };
    return writeScratchStore(store);
  }

  function clearZoneScratchMask(dateKey, contentSig, mood) {
    const dk = String(dateKey || '').trim();
    const sig = String(contentSig || '').trim();
    if (!dk || !sig || (mood !== 'good' && mood !== 'rough')) return;
    const store = readScratchStore();
    if (!store || store.dateKey !== dk || store.contentSig !== sig) return;
    if (!store.zones?.[mood]) return;
    delete store.zones[mood];
    if (Object.keys(store.zones).length === 0) clearMoodScratchStorage();
    else writeScratchStore(store);
  }

  /** No saved mask, or saved progress past reveal — safe to show the full message. */
  function isZoneScratchComplete(dateKey, contentSig, mood) {
    const saved = loadZoneScratchMask(dateKey, contentSig, mood);
    if (!saved) return true;
    return saved.progress >= SCRATCH_REVEAL_THRESHOLD;
  }

  function purgeStaleScratchStore(todayDateKey) {
    const dk = String(todayDateKey || '').trim();
    if (!dk) return;
    const store = readScratchStore();
    if (store && store.dateKey !== dk) clearMoodScratchStorage();
  }

  function exportEraserMaskDataUrl(canvas, foilMask, pxW, pxH) {
    const ctx = canvas.getContext('2d');
    if (!ctx || pxW < 1 || pxH < 1) return null;
    const src = ctx.getImageData(0, 0, pxW, pxH).data;
    const scale = Math.min(1, SCRATCH_MASK_MAX_PX / Math.max(pxW, pxH));
    const sw = Math.max(1, Math.round(pxW * scale));
    const sh = Math.max(1, Math.round(pxH * scale));
    const off = document.createElement('canvas');
    off.width = sw;
    off.height = sh;
    const mctx = off.getContext('2d');
    if (!mctx) return null;
    const dst = mctx.createImageData(sw, sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const sx = Math.min(pxW - 1, Math.floor(((x + 0.5) * pxW) / sw));
        const sy = Math.min(pxH - 1, Math.floor(((y + 0.5) * pxH) / sh));
        const sidx = sy * pxW + sx;
        if (foilMask && !foilMask[sidx]) continue;
        if (src[sidx * 4 + 3] >= 48) continue;
        const didx = (y * sw + x) * 4;
        dst.data[didx] = 255;
        dst.data[didx + 1] = 255;
        dst.data[didx + 2] = 255;
        dst.data[didx + 3] = 255;
      }
    }
    mctx.putImageData(dst, 0, 0);
    let dataUrl = '';
    try {
      dataUrl = off.toDataURL('image/webp', 0.72);
    } catch (_) {
      dataUrl = off.toDataURL('image/png');
    }
    return dataUrl ? { dataUrl, w: sw, h: sh } : null;
  }

  function mountTapeScratch(cfg) {
    const {
      zoneEl,
      canvas,
      marksCanvas,
      foilImg,
      marksImg,
      mood,
      reducedMotion = false,
      onCommit,
      onRevealComplete,
      scratchPersist = null,
      startCommitted = false
    } = cfg;
    let painting = false;
    let lastX = 0;
    let lastY = 0;
    let moveTotal = 0;
    let strokeCount = 0;
    let revealed = false;
    let committed = !!startCommitted;
    let scratchCtx = null;
    let marksCtx = null;
    let scratchCssW = 0;
    let scratchCssH = 0;
    let foilMask = null;
    let dismissFadeTimer = null;
    let persistTimer = null;
    let persistApplyToken = 0;

    const scratchPersistEnabled =
      !!scratchPersist?.enabled &&
      !!String(scratchPersist.dateKey || '').trim() &&
      !!String(scratchPersist.contentSig || '').trim();

    function clearPersistedScratch() {
      if (!scratchPersistEnabled) return;
      clearZoneScratchMask(scratchPersist.dateKey, scratchPersist.contentSig, mood);
    }

    function persistScratchNow() {
      if (!scratchPersistEnabled || revealed || !scratchCtx || !foilMask) return;
      const progress = foilScratchProgress();
      if (progress < SCRATCH_PERSIST_MIN_PROGRESS) return;
      const exported = exportEraserMaskDataUrl(canvas, foilMask, canvas.width, canvas.height);
      if (!exported) return;
      saveZoneScratchMask(scratchPersist.dateKey, scratchPersist.contentSig, mood, {
        ...exported,
        progress
      });
    }

    function schedulePersistScratch() {
      if (!scratchPersistEnabled || revealed) return;
      if (persistTimer != null) return;
      persistTimer = global.setTimeout(() => {
        persistTimer = null;
        persistScratchNow();
      }, SCRATCH_PERSIST_DEBOUNCE_MS);
    }

    function applyEraserMaskToCtx(ctx, img, saved, pxW, pxH) {
      if (!ctx || !img?.naturalWidth) return;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, saved.w, saved.h, 0, 0, pxW, pxH);
      ctx.restore();
    }

    function applyPersistedScratch(pxW, pxH) {
      if (!scratchPersistEnabled || revealed) return;
      const saved = loadZoneScratchMask(scratchPersist.dateKey, scratchPersist.contentSig, mood);
      if (!saved || saved.progress < SCRATCH_PERSIST_MIN_PROGRESS) return;
      const token = ++persistApplyToken;
      loadImage(saved.dataUrl)
        .then((img) => {
          if (token !== persistApplyToken || revealed || !scratchCtx) return;
          applyEraserMaskToCtx(scratchCtx, img, saved, pxW, pxH);
          applyEraserMaskToCtx(marksCtx, img, saved, pxW, pxH);
          if (saved.progress >= SCRATCH_PERSIST_MIN_PROGRESS) {
            zoneEl.classList.add('is-scratch-progress');
          }
        })
        .catch(() => {
          /* */
        });
    }

    function brushRadius() {
      const base = Math.min(scratchCssW || zoneEl.clientWidth, scratchCssH || zoneEl.clientHeight);
      return Math.max(SCRATCH_BRUSH_MIN, Math.min(SCRATCH_BRUSH_MAX, base * SCRATCH_BRUSH_ZONE_FRAC));
    }

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

    function scratchAlongSegment(ctx, x0, y0, x1, y1, r) {
      if (!ctx) return;
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const step = Math.max(r * 0.28, 3);
      const count = Math.max(1, Math.ceil(dist / step));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        scratchCoinStamp(
          ctx,
          x0 + (x1 - x0) * t,
          y0 + (y1 - y0) * t,
          angle,
          r,
          Math.round(x0 * 2 + y0 * 3 + i)
        );
      }
    }

    function scratchAt(x, y) {
      if (!scratchCtx && !syncScratchCanvas()) return;
      const r = brushRadius();
      const ctxs = [scratchCtx, marksCtx];
      for (const ctx of ctxs) {
        if (!ctx) continue;
        ctx.imageSmoothingEnabled = false;
        ctx.globalCompositeOperation = 'destination-out';
        if (lastX === x && lastY === y) {
          scratchCoinStamp(ctx, x, y, 0, r, Math.round(x + y));
        } else {
          scratchAlongSegment(ctx, lastX, lastY, x, y, r);
        }
      }
      lastX = x;
      lastY = y;
    }

    function syncScratchCanvasSize(cssW, cssH, pxW, pxH, dpr) {
      for (const [el, setCtx] of [[canvas, (c) => { scratchCtx = c; }], [marksCanvas, (c) => { marksCtx = c; }]]) {
        if (!el) continue;
        if (el.width !== pxW || el.height !== pxH) {
          el.width = pxW;
          el.height = pxH;
          el.style.width = `${cssW}px`;
          el.style.height = `${cssH}px`;
        }
        const ctx = el.getContext('2d');
        if (ctx) setCtx(ctx);
      }
    }

    function drawTapeMarks(ctx, img, pxW, pxH) {
      if (!ctx || !img?.naturalWidth) return;
      const drawW = pxW;
      const drawH = Math.round(pxW * (img.naturalHeight / img.naturalWidth));
      const drawY = Math.round((pxH - drawH) / 2);
      ctx.save();
      ctx.drawImage(img, 0, drawY, drawW, drawH);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(38, 28, 20, 0.78)';
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.restore();
    }

    function drawFreshFoil(pxW, pxH, dpr) {
      if (!scratchCtx) return;
      scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
      marksCtx?.setTransform(1, 0, 0, 1, 0, 0);
      scratchCtx.globalCompositeOperation = 'source-over';
      scratchCtx.clearRect(0, 0, pxW, pxH);
      marksCtx?.clearRect(0, 0, pxW, pxH);

      if (foilImg?.naturalWidth) {
        scratchCtx.drawImage(foilImg, 0, 0, pxW, pxH);
      } else {
        scratchCtx.fillStyle = '#c9a227';
        scratchCtx.fillRect(0, 0, pxW, pxH);
      }
      drawTapeMarks(marksCtx, marksImg, pxW, pxH);

      foilMask = captureFoilMask(scratchCtx, pxW, pxH);
      scratchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      marksCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (marksCanvas) marksCanvas.style.visibility = '';
    }

    function syncScratchCanvas({ forceFoil = false } = {}) {
      if (revealed) return false;
      const progressBefore = foilMask ? foilScratchProgress() : 0;
      const rect = zoneEl.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const pxW = Math.round(cssW * dpr);
      const pxH = Math.round(cssH * dpr);
      const sizeChanged = canvas.width !== pxW || canvas.height !== pxH;
      if (sizeChanged && progressBefore >= SCRATCH_PERSIST_MIN_PROGRESS) {
        persistScratchNow();
      }
      const shouldRedrawFoil =
        forceFoil || !foilMask || progressBefore < 0.005 || sizeChanged;

      syncScratchCanvasSize(cssW, cssH, pxW, pxH, dpr);
      if (!scratchCtx) return false;
      scratchCssW = cssW;
      scratchCssH = cssH;

      if (shouldRedrawFoil) {
        drawFreshFoil(pxW, pxH, dpr);
      } else {
        scratchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        marksCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      if (cssW > 8 && cssH > 8) zoneEl.classList.add('is-scratch-ready');
      if (progressBefore >= SCRATCH_PERSIST_MIN_PROGRESS) {
        zoneEl.classList.add('is-scratch-progress');
      }
      if (shouldRedrawFoil && scratchPersistEnabled) {
        applyPersistedScratch(cssW, cssH);
      }
      return true;
    }

    function dismissIcons() {
      if (!marksCanvas || dismissFadeTimer != null) return;
      marksCanvas.style.visibility = '';
      dismissFadeTimer = global.setTimeout(() => {
        dismissFadeTimer = null;
        if (marksCtx && marksCanvas?.width > 0) {
          marksCtx.save();
          marksCtx.setTransform(1, 0, 0, 1, 0, 0);
          marksCtx.clearRect(0, 0, marksCanvas.width, marksCanvas.height);
          marksCtx.restore();
        }
        if (marksCanvas) marksCanvas.style.visibility = 'hidden';
      }, DISMISS_MARKS_FADE_MS);
    }

    function paintFoil() {
      syncScratchCanvas({ forceFoil: true });
    }

    function foilScratchProgress() {
      return sampleScratchProgress(canvas, foilMask);
    }

    function maybeComplete() {
      if (revealed) return;
      strokeCount++;
      if (strokeCount % 3 !== 0) return;
      const progress = foilScratchProgress();
      if (progress >= SCRATCH_PERSIST_MIN_PROGRESS) zoneEl.classList.add('is-scratch-progress');
      if (progress >= SCRATCH_REVEAL_THRESHOLD) {
        revealed = true;
        clearPersistedScratch();
        zoneEl.classList.add('is-revealed', 'is-scratch-progress');
        zoneEl.classList.remove('is-scratching');
        onRevealComplete?.();
      } else {
        schedulePersistScratch();
      }
    }

    function localPoint(clientX, clientY) {
      const rect = zoneEl.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function tryCommit() {
      if (committed) return;
      committed = true;
      onCommit?.(mood);
    }

    function revealInstant() {
      revealed = true;
      clearPersistedScratch();
      zoneEl.classList.add('is-revealed', 'is-scratch-progress');
      zoneEl.classList.remove('is-scratching');
      scratchCtx?.clearRect(0, 0, scratchCssW, scratchCssH);
      marksCtx?.clearRect(0, 0, scratchCssW, scratchCssH);
      onRevealComplete?.();
    }

    function onPointerDown(e) {
      if (revealed || zoneEl.classList.contains('is-dismissed')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (reducedMotion) {
        if (!syncScratchCanvas()) return;
        tryCommit();
        revealInstant();
        return;
      }
      if (!syncScratchCanvas()) return;
      const pt = localPoint(e.clientX, e.clientY);
      painting = true;
      moveTotal = 0;
      lastX = pt.x;
      lastY = pt.y;
      zoneEl.classList.add('is-scratching');
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      scratchAt(pt.x, pt.y);
    }

    function onPointerMove(e) {
      if (!painting || revealed) return;
      e.preventDefault();
      const pt = localPoint(e.clientX, e.clientY);
      moveTotal += Math.hypot(pt.x - lastX, pt.y - lastY);
      if (moveTotal < SCRATCH_MOVE_COMMIT_PX) return;
      tryCommit();
      scratchAt(pt.x, pt.y);
      maybeComplete();
    }

    function onPointerUp(e) {
      if (!painting) return;
      painting = false;
      zoneEl.classList.remove('is-scratching');
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* */ }
      maybeComplete();
      schedulePersistScratch();
    }

    function onKeyDown(e) {
      if (revealed || zoneEl.classList.contains('is-dismissed')) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      tryCommit();
      revealInstant();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    zoneEl.addEventListener('keydown', onKeyDown);

    return {
      paintFoil,
      syncScratchCanvas,
      dismissIcons,
      revealInstant,
      persistScratchNow,
      reset() {
        if (dismissFadeTimer != null) {
          global.clearTimeout(dismissFadeTimer);
          dismissFadeTimer = null;
        }
        if (persistTimer != null) {
          global.clearTimeout(persistTimer);
          persistTimer = null;
        }
        persistApplyToken += 1;
        revealed = false;
        committed = false;
        painting = false;
        foilMask = null;
        if (marksCanvas) marksCanvas.style.visibility = '';
        zoneEl.classList.remove(
          'is-revealed',
          'is-scratching',
          'is-scratch-progress',
          'is-scratch-ready',
          'is-dismissed'
        );
        if (marksCanvas) marksCanvas.style.visibility = '';
        clearPersistedScratch();
        syncScratchCanvas({ forceFoil: true });
      },
      destroy() {
        if (dismissFadeTimer != null) {
          global.clearTimeout(dismissFadeTimer);
          dismissFadeTimer = null;
        }
        if (persistTimer != null) {
          global.clearTimeout(persistTimer);
          persistTimer = null;
        }
        persistApplyToken += 1;
        persistScratchNow();
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        zoneEl.removeEventListener('keydown', onKeyDown);
      }
    };
  }

  function buildTapeZone(mood, message) {
    const zone = document.createElement('button');
    zone.type = 'button';
    zone.className = `quilt-mood-collage__tape quilt-mood-collage__tape--${mood}`;
    zone.dataset.mood = mood;
    zone.setAttribute('aria-label', mood === 'good' ? 'Scratch top tape for good day message' : 'Scratch bottom tape for rough day message');

    const surface = document.createElement('div');
    surface.className = 'quilt-mood-collage__tape-surface';
    surface.setAttribute('aria-hidden', 'true');

    const msg = document.createElement('span');
    msg.className = 'quilt-mood-collage__tape-msg';
    msg.textContent = message;

    const canvas = document.createElement('canvas');
    canvas.className = 'quilt-mood-collage__scratch-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    const marksCanvas = document.createElement('canvas');
    marksCanvas.className = 'quilt-mood-collage__tape-marks';
    marksCanvas.setAttribute('aria-hidden', 'true');

    zone.append(surface, msg, canvas, marksCanvas);
    return { zone, canvas, marksCanvas, msg };
  }

  function restoreSwatchSlot(hostEl) {
    const swatchSlot =
      hostEl?.querySelector?.('.quilt-daily-colors-zone.quilt-mood-collage__swatch-slot') ||
      hostEl?.closest?.('.quote-card-stack')?.querySelector(
        '.quilt-daily-colors-zone.quilt-mood-collage__swatch-slot'
      ) ||
      document.querySelector('.quilt-daily-colors-zone.quilt-mood-collage__swatch-slot');
    const swatchHome = swatchSlot?._moodCollageSwatchHome || document.getElementById('quiltMoodDuo');
    if (!swatchSlot || !swatchHome) return;
    swatchSlot.classList.remove('quilt-mood-collage__swatch-slot');
    swatchHome.insertBefore(swatchSlot, swatchHome.firstChild);
    delete swatchSlot._moodCollageSwatchHome;
  }

  /** One-time mount — move fabric swatch into permanent stage slot (no runtime reparenting). */
  function mountSwatchSlot(duoEl, stageEl, moodCardEl) {
    if (!COLLAGE_DOILY_LAYOUT || !duoEl || !stageEl) return null;
    const existing = stageEl.querySelector('.quilt-daily-colors-zone.quilt-mood-collage__swatch-slot');
    if (existing) return existing;

    const colorsZone = duoEl.querySelector(
      '.quilt-daily-colors-zone:not(.quilt-mood-collage__swatch-slot)'
    );
    if (!colorsZone) return null;

    colorsZone.classList.add('quilt-mood-collage__swatch-slot');
    colorsZone._moodCollageSwatchHome = duoEl;

    if (moodCardEl?.parentNode === stageEl) {
      moodCardEl.insertAdjacentElement('afterend', colorsZone);
    } else {
      const pennyEl = stageEl.querySelector('.quilt-mood-collage__penny');
      if (pennyEl) stageEl.insertBefore(colorsZone, pennyEl);
      else stageEl.appendChild(colorsZone);
    }
    return colorsZone;
  }

  function unmount(host) {
    if (!host) return;
    const api = host._moodCollageWidget || host._moodSpreadWidget;
    host._moodCollageWidget = null;
    host._moodSpreadWidget = null;
    host._moodTriptychWidget = null;
    restoreSwatchSlot(host);
    api?.destroy?.();
    host.innerHTML = '';
    host.className = 'quilt-mood-collage';
    host.setAttribute('hidden', 'hidden');
    host.setAttribute('aria-hidden', 'true');
    host.classList.remove(
      'is-good',
      'is-rough',
      'is-open',
      'is-ready',
      'is-layer-ready',
      'is-instant',
      'is-locked',
      'is-quilt-overlay',
      'is-doily-layout',
      'is-triangle-layout'
    );
    const duoEl = document.getElementById('quiltMoodDuo');
    duoEl?.classList.remove('is-duo-ready');
    duoEl?.style.removeProperty('--duo-swatch-top');
    duoEl?.style.removeProperty('--duo-swatch-left');
    const duoQuote = document.getElementById('quiltMoodDuoQuote');
    if (duoQuote) {
      duoQuote.setAttribute('hidden', 'hidden');
      duoQuote.setAttribute('aria-hidden', 'true');
      duoQuote.classList.add('is-quote-pending');
    }
    delete host.dataset.collageBuild;
    delete host.dataset.collageDateKey;
    delete host.dataset.moodSpreadMode;
  }

  function collageHostWidthPx(hostEl) {
    const rect = hostEl?.getBoundingClientRect?.();
    if (rect && rect.width > 1) return rect.width;
    const ow = hostEl?.offsetWidth;
    if (ow > 1) return ow;

    const stack = hostEl?.closest?.('.quote-card-stack');
    if (stack) {
      const stackRect = stack.getBoundingClientRect?.();
      if (stackRect && stackRect.width > 1) return stackRect.width;
      if (stack.offsetWidth > 1) return stack.offsetWidth;
    }

    const screen = hostEl?.closest?.('#screen-quilt');
    if (screen && typeof global.getComputedStyle === 'function') {
      const cs = global.getComputedStyle(screen);
      const max = parseFloat(cs.getPropertyValue('--quilt-float-card-max')) || 460;
      const gutter = parseFloat(cs.getPropertyValue('--quilt-float-card-gutter')) || 16;
      const vw = global.innerWidth || screen.clientWidth || 0;
      if (vw > 1) return Math.max(0, Math.min(max, vw - gutter * 2));
    }
    return 0;
  }

  function collageStageHeightScale(hostEl) {
    const wrap = document.getElementById('quiltUserColorCardWrap');
    const showSwatch = wrap && !wrap.hasAttribute('hidden');
    const extra = COLLAGE_DOILY_LAYOUT && showSwatch ? COLLAGE_SWATCH_BELOW_EXTRA : 0;
    return COLLAGE_STAGE_HEIGHT_SCALE + extra;
  }

  function applyCollageHostSize(hostEl) {
    const w = collageHostWidthPx(hostEl);
    if (w < 8) {
      if (!hostEl.classList.contains('is-layer-ready')) {
        hostEl.style.removeProperty('min-height');
      }
      return false;
    }
    const scale = collageStageHeightScale(hostEl);
    hostEl.style.setProperty('--collage-stage-height-scale', scale.toFixed(4));
    hostEl.style.minHeight = `${Math.round(w * scale)}px`;
    return true;
  }

  /**
   * @param {HTMLElement} host
   * @param {{
   *   quoteDataUrl?: string,
   *   goodDay: string,
   *   roughDay: string,
   *   quiltBlocks?: Array<object>,
   *   overlayQuilt?: boolean,
   *   quoteDisplayWidthPx?: number,
   *   quoteRenderWidth?: number,
   *   dateKey?: string,
   *   initialMood?: 'good'|'rough'|null,
   *   instant?: boolean,
   *   onReady?: () => void,
   *   onSelect?: (mood: 'good'|'rough') => void
   * }} opts
   */
  function mount(host, opts = {}) {
    if (!host) return null;
    injectStyles();
    unmount(host);

    const quoteDataUrl = String(opts.quoteDataUrl || '').trim();
    const goodDay = String(opts.goodDay || '').trim();
    const roughDay = String(opts.roughDay || '').trim();
    if (!goodDay || !roughDay) return null;

    const blocks = normalizeBlocks(opts.quiltBlocks);
    const reducedMotion = prefersReducedMotion();
    const overlayQuilt = opts.overlayQuilt ?? host.id === 'quiltMoodSpread';
    const initialMood =
      opts.initialMood === 'good' || opts.initialMood === 'rough' ? opts.initialMood : null;
    const collageDateKey = String(opts.dateKey || '').trim();
    const scratchContentSig = goodDay && roughDay ? `${goodDay}\u0001${roughDay}` : '';
    purgeStaleScratchStore(collageDateKey);
    const initialMoodScratchComplete =
      !initialMood || isZoneScratchComplete(collageDateKey, scratchContentSig, initialMood);
    const initialInstant =
      !!opts.instant || (!!initialMood && initialMoodScratchComplete && !reducedMotion);
    const scratchPersist =
      collageDateKey && scratchContentSig
        ? { dateKey: collageDateKey, contentSig: scratchContentSig, enabled: true }
        : null;

    host.className = 'quilt-mood-collage';
    host.removeAttribute('hidden');
    host.removeAttribute('aria-hidden');
    host.dataset.collageBuild = COLLAGE_BUILD;
    host.dataset.moodSpreadMode = 'collage';
    if (COLLAGE_DOILY_LAYOUT) host.classList.add('is-doily-layout');
    else host.classList.remove('is-doily-layout');
    if (COLLAGE_SHOW_TRIANGLE) host.classList.add('is-triangle-layout');
    else host.classList.remove('is-triangle-layout');
    if (overlayQuilt) host.classList.add('is-quilt-overlay');
    else host.classList.remove('is-quilt-overlay');
    host.style.setProperty('--collage-quote-rotate', `${tapeRotateDeg(collageDateKey, 'quote').toFixed(2)}deg`);
    host.style.setProperty('--collage-tape-good-rotate', `${tapeRotateDeg(collageDateKey, 'good').toFixed(2)}deg`);
    host.style.setProperty('--collage-tape-rough-rotate', `${tapeRotateDeg(collageDateKey, 'rough').toFixed(2)}deg`);
    host.style.setProperty('--collage-cosmos-top-rotate', `${tapeRotateDeg(collageDateKey, 'cosmos-top').toFixed(2)}deg`);
    host.style.setProperty('--collage-cosmos-bottom-rotate', `${tapeRotateDeg(collageDateKey, 'cosmos-bottom').toFixed(2)}deg`);
    const triangleRotate = COLLAGE_SHOW_TRIANGLE ? triangleRotateDeg(collageDateKey) : 0;
    host.dataset.collageDateKey = collageDateKey;

    const stage = document.createElement('div');
    stage.className = 'quilt-mood-collage__stage';

    let quiltCanvas = null;
    if (!overlayQuilt) {
      quiltCanvas = document.createElement('canvas');
      quiltCanvas.className = 'quilt-mood-collage__quilt-bg';
      quiltCanvas.setAttribute('aria-hidden', 'true');
    }

    const duoEl = document.getElementById('quiltMoodDuo');
    const duoQuoteWrap = document.getElementById('quiltMoodDuoQuote');
    let duoQuoteImg = duoQuoteWrap?.querySelector('.quilt-mood-duo__quote-img') || null;
    if (duoQuoteWrap && !duoQuoteImg) {
      duoQuoteImg = document.createElement('img');
      duoQuoteImg.className = 'quilt-mood-duo__quote-img quilt-mood-spread__quote-img';
      duoQuoteImg.alt = "Today's quote";
      duoQuoteImg.decoding = 'async';
      duoQuoteImg.draggable = false;
      duoQuoteWrap.appendChild(duoQuoteImg);
    }
    if (duoQuoteWrap && !quoteDataUrl) duoQuoteWrap.classList.add('is-quote-pending');

    function layerImg(className, src, alt) {
      const img = document.createElement('img');
      img.className = `quilt-mood-collage__layer ${className}`;
      img.src = src;
      img.alt = alt;
      img.draggable = false;
      img.decoding = 'async';
      return img;
    }

    const moodCardImg = COLLAGE_DOILY_LAYOUT
      ? layerImg('quilt-mood-collage__mood-card', ASSETS.moodCard, '')
      : null;
    const circleImg = COLLAGE_DOILY_LAYOUT ? null : layerImg('quilt-mood-collage__circle', ASSETS.circle, '');
    const cosmosTop = layerImg(
      'quilt-mood-collage__cosmos-tape quilt-mood-collage__cosmos-tape--top',
      ASSETS.tapeCosmos,
      ''
    );
    const cosmosBottom = layerImg(
      'quilt-mood-collage__cosmos-tape quilt-mood-collage__cosmos-tape--bottom',
      ASSETS.tapeCosmos,
      ''
    );
    let triangleWrap = null;
    let triangleImg = null;
    if (COLLAGE_SHOW_TRIANGLE) {
      triangleWrap = document.createElement('div');
      triangleWrap.className = 'quilt-mood-collage__layer quilt-mood-collage__triangle';
      triangleWrap.setAttribute('aria-hidden', 'true');
      triangleWrap.style.transform = `translateX(-50%) rotate(${triangleRotate.toFixed(2)}deg)`;
      triangleImg = document.createElement('img');
      triangleImg.className = 'quilt-mood-collage__triangle-photo';
      triangleImg.src = ASSETS.triangle;
      triangleImg.alt = '';
      triangleImg.draggable = false;
      triangleImg.decoding = 'async';
      triangleWrap.append(triangleImg);
    }
    const pennyImg = layerImg('quilt-mood-collage__penny', ASSETS.penny, '');
    const pennyTapeEl = COLLAGE_DOILY_LAYOUT
      ? null
      : layerImg('quilt-mood-collage__penny-tape', ASSETS.pennyTape, '');
    if (pennyTapeEl) pennyTapeEl.setAttribute('aria-hidden', 'true');

    const tapeGood = buildTapeZone('good', goodDay);
    const tapeRough = buildTapeZone('rough', roughDay);
    const orStrip = document.createElement('span');
    orStrip.className = 'quilt-mood-collage__or-strip';
    orStrip.setAttribute('aria-hidden', 'true');
    const orUp = document.createElement('span');
    orUp.className = 'quilt-mood-collage__or-glyph quilt-mood-collage__or-glyph--up';
    orUp.setAttribute('aria-hidden', 'true');
    orUp.textContent = '\u2191';
    const orWord = document.createElement('span');
    orWord.className = 'quilt-mood-collage__or-word';
    orWord.textContent = 'OR';
    const orDown = document.createElement('span');
    orDown.className = 'quilt-mood-collage__or-glyph quilt-mood-collage__or-glyph--down';
    orDown.setAttribute('aria-hidden', 'true');
    orDown.textContent = '\u2193';
    orStrip.append(orUp, orWord, orDown);

    const announcer = document.createElement('span');
    announcer.className = 'quilt-mood-collage__announcer';
    announcer.setAttribute('aria-live', 'polite');

    stage.append(
      ...(quiltCanvas ? [quiltCanvas] : []),
      ...(moodCardImg ? [moodCardImg] : []),
      ...(circleImg ? [circleImg] : []),
      cosmosTop,
      cosmosBottom,
      ...(triangleWrap ? [triangleWrap] : []),
      pennyImg,
      ...(pennyTapeEl ? [pennyTapeEl] : []),
      tapeGood.zone,
      ...(COLLAGE_DOILY_LAYOUT ? [orStrip] : []),
      tapeRough.zone
    );
    host.append(stage, announcer);

    mountSwatchSlot(duoEl, stage, moodCardImg);

    let layerReady = false;
    let remeasureRetryId = 0;

    function promoteLayerReady() {
      if (layerReady) return true;
      if (!applyCollageHostSize(host)) return false;
      layerReady = true;
      host.classList.add('is-layer-ready');
      bindCollageScrollQuiet();
      return true;
    }

    function scheduleRemeasureRetries(onLive) {
      const retryToken = ++remeasureRetryId;
      let attempts = 0;
      function tick() {
        if (retryToken !== remeasureRetryId) return;
        if (promoteLayerReady()) {
          remeasureCollage();
          onLive?.();
          return;
        }
        if (++attempts < 32) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    function markLayerReady() {
      if (promoteLayerReady()) {
        scheduleRemeasureCollage(true);
      } else {
        scheduleRemeasureRetries();
      }
    }

    let mood = null;
    let engines = { good: null, rough: null };
    let resizeObserver = null;
    let resizeFrameId = 0;
    let lastHostWidthPx = 0;
    let collageScrolling = false;
    let scrollQuietTimer = 0;
    let remeasureAfterScroll = false;

    function bindCollageScrollQuiet() {
      const scroller = document.getElementById('screen-quilt');
      if (!scroller || scroller.dataset.moodCollageScrollBound === '1') return;
      scroller.dataset.moodCollageScrollBound = '1';
      scroller.addEventListener(
        'scroll',
        () => {
          collageScrolling = true;
          clearTimeout(scrollQuietTimer);
          scrollQuietTimer = setTimeout(() => {
            collageScrolling = false;
            if (remeasureAfterScroll) {
              remeasureAfterScroll = false;
              scheduleRemeasureCollage(true);
            }
          }, 140);
        },
        { passive: true }
      );
    }

    function scheduleRemeasureCollage(force = false) {
      if (collageScrolling && !force) {
        remeasureAfterScroll = true;
        return;
      }
      if (resizeFrameId) return;
      resizeFrameId = requestAnimationFrame(() => {
        resizeFrameId = 0;
        remeasureCollage();
      });
    }

    let screenObserver = null;
    let tapeLayoutPx = null;
    let enginesReady = false;
    let pendingMoodApply = initialMood;

    /** Restore locked pick in DOM before async foil assets load (avoids both messages flashing). */
    function applyInitialMoodShell(picked) {
      if (picked !== 'good' && picked !== 'rough') return;
      const chosenZone = picked === 'good' ? tapeGood.zone : tapeRough.zone;
      const siblingZone = picked === 'good' ? tapeRough.zone : tapeGood.zone;
      host.classList.add(
        'is-locked',
        'is-instant',
        'is-open',
        picked === 'good' ? 'is-good' : 'is-rough'
      );
      chosenZone.classList.add('is-revealed', 'is-scratch-progress');
      siblingZone.classList.add('is-dismissed');
      announcer.textContent = picked === 'good' ? goodDay : roughDay;
    }

    /** Committed mood with foil still on — restore lock + sibling dismiss, keep scratch canvas. */
    function applyPartialMoodShell(picked) {
      if (picked !== 'good' && picked !== 'rough') return;
      const chosenZone = picked === 'good' ? tapeGood.zone : tapeRough.zone;
      const siblingZone = picked === 'good' ? tapeRough.zone : tapeGood.zone;
      const siblingMood = picked === 'good' ? 'rough' : 'good';
      host.classList.add('is-locked', picked === 'good' ? 'is-good' : 'is-rough');
      siblingZone.classList.add('is-dismissed');
      clearZoneScratchMask(collageDateKey, scratchContentSig, siblingMood);
      const saved = loadZoneScratchMask(collageDateKey, scratchContentSig, picked);
      if (saved?.progress >= SCRATCH_PERSIST_MIN_PROGRESS) {
        chosenZone.classList.add('is-scratch-progress');
      }
    }

    if (initialMood && initialInstant) {
      applyInitialMoodShell(initialMood);
    } else if (initialMood && !initialInstant) {
      applyPartialMoodShell(initialMood);
    }

    function siblingFor(picked) {
      return picked === 'good'
        ? { zone: tapeRough.zone, engine: engines.rough }
        : { zone: tapeGood.zone, engine: engines.good };
    }

    function chosenFor(picked) {
      return picked === 'good'
        ? { zone: tapeGood.zone, engine: engines.good }
        : { zone: tapeRough.zone, engine: engines.rough };
    }

    function clearTapeState() {
      for (const zone of [tapeGood.zone, tapeRough.zone]) {
        zone.classList.remove(
          'is-dismissed',
          'is-revealed',
          'is-scratching',
          'is-scratch-progress',
          'is-scratch-ready'
        );
      }
    }

    function applyMood(picked, { instant = false, fromUser = false } = {}) {
      if (picked !== 'good' && picked !== 'rough') return;
      if (mood !== null && mood !== picked) return;
      if (!enginesReady) {
        pendingMoodApply = picked;
        return;
      }

      mood = picked;
      pendingMoodApply = null;
      const { zone: chosenZone, engine: chosenEngine } = chosenFor(picked);
      const { zone: siblingZone, engine: siblingEngine } = siblingFor(picked);

      host.classList.add('is-locked', picked === 'good' ? 'is-good' : 'is-rough');
      siblingZone.classList.add('is-dismissed');
      siblingEngine?.dismissIcons?.();

      if (fromUser && scratchPersist) {
        const siblingMood = picked === 'good' ? 'rough' : 'good';
        clearZoneScratchMask(scratchPersist.dateKey, scratchPersist.contentSig, siblingMood);
      }

      const fullReveal =
        reducedMotion || isZoneScratchComplete(collageDateKey, scratchContentSig, picked);
      if ((instant || reducedMotion) && fullReveal) {
        host.classList.add('is-instant');
        chosenEngine?.revealInstant?.();
        host.classList.add('is-open');
        announcer.textContent = picked === 'good' ? goodDay : roughDay;
        requestAnimationFrame(() => host.classList.remove('is-instant'));
      }

      if (fromUser) {
        if (typeof global.odqTrack === 'function') {
          global.odqTrack('mood_collage_scratch', { mood: picked });
        }
        opts.onSelect?.(picked);
      }
    }

    function resetMood({ instant = false, force = false } = {}) {
      if (!force && mood === null && !host.classList.contains('is-open')) return;

      mood = null;
      pendingMoodApply = null;
      host.classList.remove('is-locked', 'is-good', 'is-rough', 'is-open', 'is-instant');
      clearTapeState();
      engines.good?.reset?.();
      engines.rough?.reset?.();
      announcer.textContent = '';
    }

    function tryApplyPendingMood() {
      if (!enginesReady || !pendingMoodApply) return;
      applyMood(pendingMoodApply, { instant: initialInstant });
      pendingMoodApply = null;
    }

    function paintQuiltBg() {
      if (overlayQuilt || !quiltCanvas) return;
      const rect = stage.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      renderQuiltToCanvas(quiltCanvas, blocks, w, h);
    }

    function tapeStripHeightPx(tapeWidthPx, mood) {
      const aspect = mood === 'rough' ? TAPE_ROUGH_ASPECT : TAPE_GOOD_ASPECT;
      return tapeWidthPx * aspect;
    }

    function skyBoundsPx(stageRect) {
      const skyRect = circleImg.getBoundingClientRect();
      if (skyRect.height > 1) {
        return {
          top: skyRect.top - stageRect.top,
          bottom: skyRect.bottom - stageRect.top
        };
      }
      const fallbackBottom = stageRect.height * (600 / 920);
      return { top: 0, bottom: fallbackBottom };
    }

    function moodCardInteriorPx(stageRect) {
      const card = cardBlockPx(stageRect);
      const insetX = (card.right - card.left) * CARD_INTERIOR_INSET_FRAC;
      const insetY = (card.bottom - card.top) * CARD_INTERIOR_INSET_FRAC;
      return {
        left: card.left + insetX,
        top: card.top + insetY,
        right: card.right - insetX,
        bottom: card.bottom - insetY
      };
    }

    /** Center scratch strip stack inside the yellow card interior (card + strips = one visual unit). */
    function syncTapeLayout() {
      const stageRect = stage.getBoundingClientRect();
      if (stageRect.height < 1) return;

      let tapeWidthPx = stageRect.width * 0.92;
      let stackCenter = stageRect.height * 0.52;
      const cardRect = moodCardImg?.getBoundingClientRect?.();
      const triRect = triangleWrap?.getBoundingClientRect?.();

      if (COLLAGE_DOILY_LAYOUT && moodCardImg) {
        const interior = moodCardInteriorPx(stageRect);
        tapeWidthPx = (interior.right - interior.left) * CARD_STRIP_WIDTH_FRAC;
        stackCenter = (interior.top + interior.bottom) * 0.5;
        const tapeLeftPct = (((interior.left + interior.right) * 0.5) / stageRect.width) * 100;
        const tapeWidthPct = (tapeWidthPx / stageRect.width) * 100;
        host.style.setProperty('--collage-tape-left', `${tapeLeftPct}%`);
        host.style.setProperty('--collage-tape-width', `${tapeWidthPct}%`);
        host.style.setProperty('--collage-or-left', `${tapeLeftPct}%`);
      } else if (cardRect && cardRect.height > 1) {
        const cardTopStage = cardRect.top - stageRect.top;
        stackCenter = cardTopStage + cardRect.height * 0.5;
        host.style.removeProperty('--collage-tape-left');
        host.style.removeProperty('--collage-or-left');
        host.style.setProperty('--collage-tape-width', '92%');
      } else if (triRect && triRect.height > 1) {
        const triTopStage = triRect.top - stageRect.top;
        stackCenter = triTopStage + triRect.height * TRIANGLE_STRIP_CENTER_Y;
        host.style.removeProperty('--collage-tape-left');
        host.style.removeProperty('--collage-or-left');
        host.style.setProperty('--collage-tape-width', '92%');
      } else {
        const sky = skyBoundsPx(stageRect);
        const padPx = stageRect.height * SKY_TAPE_PAD;
        const skyH = sky.bottom - sky.top;
        const goodTapeH = tapeStripHeightPx(tapeWidthPx, 'good');
        const roughTapeH = tapeStripHeightPx(tapeWidthPx, 'rough');
        const stripGap = stageRect.height * TAPE_LAYOUT_STRIP_GAP;
        const stackH = goodTapeH + stripGap + roughTapeH;
        const minCenter = sky.top + padPx + stackH * 0.5;
        const maxCenter = sky.bottom - padPx - stackH * 0.5;
        stackCenter = sky.top + skyH * 0.5;
        if (maxCenter > minCenter) {
          const unit = hashString(`${collageDateKey}:tape`) / 4294967295;
          const jitter = (unit - 0.5) * 2 * skyH * TAPE_SKY_CENTER_JITTER;
          stackCenter = Math.max(minCenter, Math.min(maxCenter, stackCenter + jitter));
        }
        host.style.removeProperty('--collage-tape-left');
        host.style.removeProperty('--collage-or-left');
        host.style.setProperty('--collage-tape-width', '92%');
      }

      const goodTapeH = tapeStripHeightPx(tapeWidthPx, 'good');
      const roughTapeH = tapeStripHeightPx(tapeWidthPx, 'rough');
      const stripGap = stageRect.height * (COLLAGE_DOILY_LAYOUT ? CARD_OR_STRIP_GAP : TAPE_LAYOUT_STRIP_GAP);
      const stackH = goodTapeH + stripGap + roughTapeH;

      const goodTopPx = stackCenter - stackH * 0.5;
      const roughTopPx = goodTopPx + goodTapeH + stripGap;
      tapeLayoutPx = {
        goodTop: goodTopPx,
        roughTop: roughTopPx,
        roughBottom: roughTopPx + roughTapeH
      };

      host.style.setProperty('--collage-tape-good-top', `${(goodTopPx / stageRect.height) * 100}%`);
      host.style.setProperty('--collage-tape-rough-top', `${(roughTopPx / stageRect.height) * 100}%`);
      const orCenterPx = (goodTopPx + goodTapeH + roughTopPx) * 0.5;
      host.style.setProperty('--collage-or-top', `${(orCenterPx / stageRect.height) * 100}%`);
    }

    function cosmosTapeHeightPx(stageRect) {
      return stageRect.width * COSMOS_TAPE_WIDTH * COSMOS_TAPE_ASPECT;
    }

    /** Decorative cosmos tape framing the sky cutout (top + bottom). */
    function syncCosmosTapeLayout() {
      const stageRect = stage.getBoundingClientRect();
      if (stageRect.height < 1) return;

      const sky = skyBoundsPx(stageRect);
      const cosmosH = cosmosTapeHeightPx(stageRect);
      const padPx = stageRect.height * COSMOS_TAPE_PAD;
      const topPx = sky.top + padPx;
      const bottomPx = Math.max(topPx + cosmosH * 0.5, sky.bottom - padPx - cosmosH);

      host.style.setProperty('--collage-cosmos-top-top', `${(topPx / stageRect.height) * 100}%`);
      host.style.setProperty('--collage-cosmos-bottom-top', `${(bottomPx / stageRect.height) * 100}%`);
    }

    function stripTopLimitPx(stageRect) {
      if (!tapeLayoutPx) return stageRect.height;
      return tapeLayoutPx.goodTop - stageRect.height * COLLAGE_STRIP_CLEARANCE;
    }

    /** Quote clipping lives in the duo zone above the collage — CSS handles overlap. */
    function syncDuoQuoteLayout() {
      if (!duoQuoteWrap || !duoQuoteImg) return;
      applyCollageQuoteDisplaySize(duoQuoteImg, duoQuoteWrap, {
        quoteDisplayWidthPx: opts.quoteDisplayWidthPx,
        quoteRenderWidth: opts.quoteRenderWidth
      });
    }

    /** Card collage — yellow card anchors the top of the mood stage (below the duo quote band). */
    function cardLayerMetrics(stageRect) {
      const cardW = stageRect.width * MOOD_CARD_DISPLAY_WIDTH;
      const cardAsp =
        moodCardImg?.naturalWidth > 0
          ? moodCardImg.naturalHeight / moodCardImg.naturalWidth
          : MOOD_CARD_ASPECT;
      const cardH = cardW * cardAsp;
      const cardTopPx = stageRect.height * 0.02;
      return { cardTopPx, cardH, cardW };
    }

    function syncDoilyLayout() {
      if (!COLLAGE_DOILY_LAYOUT) return;
      host.style.setProperty('--collage-card-width', `${MOOD_CARD_DISPLAY_WIDTH * 100}%`);

      const stageRect = stage.getBoundingClientRect();
      if (stageRect.height < 1 || stageRect.width < 1) return;

      const { cardTopPx } = cardLayerMetrics(stageRect);
      host.style.setProperty('--collage-card-top', `${(cardTopPx / stageRect.height) * 100}%`);
    }

    /** Legacy triangle layout — kept for optional fallback. */
    function syncQuoteLayout() {
      syncDuoQuoteLayout();
    }

    /** Triangle sits in the lower collage — strips overlap its face. */
    function syncTriangleLayout() {
      if (!COLLAGE_SHOW_TRIANGLE || !triangleWrap) return;
      host.style.setProperty('--collage-triangle-bottom', `${TRIANGLE_BOTTOM_START}%`);
      host.style.setProperty('--collage-triangle-width', '78%');
    }

    function measurePennySizePx(scale = 1) {
      host.style.setProperty('--collage-penny-width', pennyDisplayWidth(scale));
      const rect = pennyImg.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) {
        return { w: rect.width, h: rect.height };
      }
      return pennySizePxAtScale(scale);
    }

    function rectsOverlap(a, b) {
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }

    function quoteTextSafeRect(quoteRect, stageWidth = 0) {
      const narrow = stageWidth > 0 && stageWidth <= PENNY_NARROW_STAGE_MAX_PX;
      let rotDeg = 0;
      if (host && typeof global.getComputedStyle === 'function') {
        const raw = global.getComputedStyle(host).getPropertyValue('--collage-quote-rotate').trim();
        rotDeg = Math.abs(parseFloat(raw) || 0);
      }
      const rotPad = Math.min(0.1, (rotDeg / 180) * 0.12);
      const insetX = QUOTE_TEXT_INSET_X + (narrow ? 0.05 : 0.02) + rotPad * 0.45;
      const insetTop = QUOTE_TEXT_INSET_TOP + (narrow ? 0.04 : 0.01) + rotPad * 0.35;
      const insetBottom = QUOTE_TEXT_INSET_BOTTOM + (narrow ? 0.1 : 0.04) + rotPad * 0.55;
      return {
        left: quoteRect.left + quoteRect.width * insetX,
        top: quoteRect.top + quoteRect.height * insetTop,
        right: quoteRect.right - quoteRect.width * insetX,
        bottom: quoteRect.bottom - quoteRect.height * insetBottom
      };
    }

    function textSafeWithClearance(textSafe, padPx = PENNY_TEXT_CLEARANCE_PX) {
      return {
        left: textSafe.left - padPx,
        top: textSafe.top - padPx,
        right: textSafe.right + padPx,
        bottom: textSafe.bottom + padPx
      };
    }

    function tapeBlockRect(goodRect, roughRect, gapPx) {
      const top = Math.min(goodRect.top, roughRect.top) - gapPx;
      const bottom = Math.max(goodRect.bottom, roughRect.bottom) + gapPx;
      const left = Math.min(goodRect.left, roughRect.left);
      const right = Math.max(goodRect.right, roughRect.right);
      return { left, top, right, bottom };
    }

    function pennyRectValid(pennyRect, textSafe, tapeBlock) {
      const safe = textSafeWithClearance(textSafe);
      if (pennyRect.bottom > tapeBlock.top + 0.5) return false;
      if (rectsOverlap(pennyRect, tapeBlock)) return false;
      if (rectsOverlap(pennyRect, safe)) return false;
      return true;
    }

    function applyPennyRect(stageRect, pennyRect) {
      const leftPct = ((pennyRect.left - stageRect.left) / stageRect.width) * 100;
      const bottomPct = ((stageRect.bottom - pennyRect.bottom) / stageRect.height) * 100;
      host.style.setProperty('--collage-penny-left', `${leftPct}%`);
      host.style.setProperty('--collage-penny-translate-x', '0');
      host.style.setProperty('--collage-penny-bottom', `${bottomPct}%`);
    }

    function findQuoteMarginPennyRect(quoteRect, textSafe, tapeBlock, pennySize, side) {
      const { w, h } = pennySize;
      const configs = side === 'left'
        ? [
            [0.42, 0.78],
            [0.52, 0.92],
            [0.28, 0.62],
            [0.34, 0.5],
            [0.18, 0.36]
          ]
        : [
            [0.58, 0.78],
            [0.48, 0.92],
            [0.72, 0.62],
            [0.66, 0.5],
            [0.82, 0.36]
          ];
      for (const [edgeFrac, vFrac] of configs) {
        const left = side === 'left'
          ? quoteRect.left - w * edgeFrac
          : quoteRect.right - w * edgeFrac;
        const top = quoteRect.bottom - h * vFrac;
        const pennyRect = { left, top, right: left + w, bottom: top + h };
        if (pennyRectValid(pennyRect, textSafe, tapeBlock)) return pennyRect;
      }
      return null;
    }

    /** Slot between quote bottom and scratch strips — still above tapes, not in the sky band. */
    function findQuoteGapPennyRect(quoteRect, textSafe, tapeBlock, pennySize, side) {
      const { w, h } = pennySize;
      const slotTop = quoteRect.bottom;
      const slotBottom = tapeBlock.top;
      if (slotBottom - slotTop < h * 0.75) return null;

      const yFracs = [0.12, 0.42, 0.72];
      const xFracs = side === 'left'
        ? [0.08, 0.22, 0.38]
        : [0.62, 0.78, 0.92];

      for (const yFrac of yFracs) {
        const top = slotTop + (slotBottom - slotTop - h) * yFrac;
        for (const xFrac of xFracs) {
          const left = side === 'left'
            ? quoteRect.left - w * xFrac
            : quoteRect.right - w * xFrac;
          const pennyRect = { left, top, right: left + w, bottom: top + h };
          if (pennyRectValid(pennyRect, textSafe, tapeBlock)) return pennyRect;
        }
      }
      return null;
    }

    /** Beside the clipping, vertically centered on the lower quote — avoids the quote–tape gutter. */
    function findQuoteSidePennyRect(quoteRect, textSafe, tapeBlock, pennySize, side) {
      const { w, h } = pennySize;
      const yFracs = [0.52, 0.64, 0.74];
      const edgeFracs = side === 'left' ? [0.26, 0.34, 0.16] : [0.74, 0.66, 0.84];
      for (const yFrac of yFracs) {
        const top = quoteRect.top + quoteRect.height * yFrac - h * 0.5;
        for (const edgeFrac of edgeFracs) {
          const left = side === 'left'
            ? quoteRect.left - w * edgeFrac
            : quoteRect.right - w * edgeFrac;
          const pennyRect = { left, top, right: left + w, bottom: top + h };
          if (pennyRectValid(pennyRect, textSafe, tapeBlock)) return pennyRect;
        }
      }
      return null;
    }

    /** Last resort — still clear quote text and scratch strips; may hang off-screen. */
    function findRelaxedPennyRect(quoteRect, textSafe, tapeBlock, pennySize, side) {
      const { w, h } = pennySize;
      const tops = [
        quoteRect.top + quoteRect.height * 0.56 - h * 0.5,
        quoteRect.bottom - h * 1.05,
        tapeBlock.top - h - 3
      ];
      const left = side === 'left'
        ? quoteRect.left - w * 0.1
        : quoteRect.right - w * 0.9;
      for (const top of tops) {
        const pennyRect = { left, top, right: left + w, bottom: top + h };
        if (pennyRectValid(pennyRect, textSafe, tapeBlock)) return pennyRect;
      }
      return null;
    }

    /** Always returns a full-size slot — off-screen overflow is fine if text and strips stay clear. */
    function findForcedPennyRect(quoteRect, textSafe, tapeBlock, pennySize, side) {
      const { w, h } = pennySize;
      const pad = PENNY_TEXT_CLEARANCE_PX;
      const safe = textSafeWithClearance(textSafe);
      const maxBottom = tapeBlock.top + 0.5;
      const leftSlots = side === 'left'
        ? [
            safe.left - w - pad,
            quoteRect.left - w * 0.52,
            quoteRect.left - w * 0.72,
            quoteRect.left - w * 0.95
          ]
        : [
            safe.right + pad,
            quoteRect.right - w * 0.48,
            quoteRect.right - w * 0.28,
            quoteRect.right - w * 0.05
          ];
      const topSlots = [
        tapeBlock.top - h - pad,
        tapeBlock.top - h - 1,
        quoteRect.bottom - h * 0.95,
        quoteRect.top + quoteRect.height * 0.68 - h * 0.5,
        quoteRect.top + quoteRect.height * 0.52 - h * 0.5,
        quoteRect.top - h * 0.12
      ];

      for (const left of leftSlots) {
        for (const top of topSlots) {
          const pennyRect = { left, top, right: left + w, bottom: top + h };
          if (pennyRectValid(pennyRect, textSafe, tapeBlock)) return pennyRect;
        }
      }

      const left = side === 'left' ? safe.left - w - pad : safe.right + pad;
      for (let top = tapeBlock.top - h - pad; top >= quoteRect.top - h * 0.35; top -= 3) {
        const pennyRect = { left, top, right: left + w, bottom: top + h };
        if (pennyRect.bottom <= maxBottom && pennyRectValid(pennyRect, textSafe, tapeBlock)) return pennyRect;
      }

      return {
        left,
        top: tapeBlock.top - h - pad,
        right: left + w,
        bottom: tapeBlock.top - pad
      };
    }

    function resolvePennySidePick(quoteRect, textSafe, tapeBlock, side) {
      const sized = measurePennySizePx(1);
      const rect =
        findQuoteMarginPennyRect(quoteRect, textSafe, tapeBlock, sized, side) ||
        findQuoteSidePennyRect(quoteRect, textSafe, tapeBlock, sized, side) ||
        findQuoteGapPennyRect(quoteRect, textSafe, tapeBlock, sized, side) ||
        findRelaxedPennyRect(quoteRect, textSafe, tapeBlock, sized, side) ||
        findForcedPennyRect(quoteRect, textSafe, tapeBlock, sized, side);
      return { rect };
    }

    function applyPennyPick(stageRect, pick) {
      if (!pick) return false;
      host.style.setProperty('--collage-penny-width', pennyDisplayWidth(1));
      applyPennyRect(stageRect, pick.rect);
      return true;
    }

    function layoutPennyOnCard(stageRect, cardRect, pennySize, dateKey = '') {
      const { w, h } = pennySize;
      const cardLeftPx = cardRect.left - stageRect.left;
      const cardTopPx = cardRect.top - stageRect.top;
      const cardBottomPx = cardTopPx + cardRect.height;
      const jitterX = (hashJitterUnit(dateKey, 'penny-x') - 0.5) * 2 * cardRect.width * PENNY_JITTER_X_FRAC;
      const jitterY = (hashJitterUnit(dateKey, 'penny-y') - 0.5) * 2 * cardRect.height * PENNY_JITTER_Y_FRAC;
      let pennyLeftPx = cardLeftPx + cardRect.width * 0.72 - w * 0.5 + jitterX;
      let pennyTopPx = cardBottomPx - h * 0.68 + jitterY;

      if (tapeLayoutPx) {
        const tapePad = stageRect.height * 0.006;
        const tapeTop = tapeLayoutPx.goodTop - tapePad;
        const tapeBottom = tapeLayoutPx.roughBottom + tapePad;
        if (pennyTopPx + h > tapeTop && pennyTopPx < tapeBottom) {
          pennyTopPx = tapeBottom;
        }
      }

      pennyLeftPx = Math.max(
        cardLeftPx + cardRect.width * 0.04,
        Math.min(pennyLeftPx, cardLeftPx + cardRect.width * 0.92 - w)
      );

      applyPennyRect(stageRect, {
        left: stageRect.left + pennyLeftPx,
        top: stageRect.top + pennyTopPx,
        right: stageRect.left + pennyLeftPx + w,
        bottom: stageRect.top + pennyTopPx + h
      });
    }

    function layoutPennyOnTriangle(stageRect, triRect, pennySize) {
      const { w, h } = pennySize;
      const triBottomPx = triRect.bottom - stageRect.top;
      const triLeftPx = triRect.left - stageRect.left;
      const apexX = triLeftPx + triRect.width * 0.5;
      const pennyLeftPx = apexX - w * 0.5;
      const pennyTopPx = triBottomPx - h * 0.74;

      applyPennyRect(stageRect, {
        left: stageRect.left + pennyLeftPx,
        top: stageRect.top + pennyTopPx,
        right: stageRect.left + pennyLeftPx + w,
        bottom: stageRect.top + pennyTopPx + h
      });
    }

    function stripBlockPx(stageRect) {
      const pad = stageRect.height * COLLAGE_STRIP_CLEARANCE;
      const goodRect = tapeGood.zone.getBoundingClientRect();
      const roughRect = tapeRough.zone.getBoundingClientRect();
      const orRect = orStrip?.getBoundingClientRect?.() || { height: 0 };
      const rects = [goodRect, roughRect];
      if (orRect.height > 1) rects.push(orRect);
      if (goodRect.height > 1 && roughRect.height > 1) {
        return {
          left: Math.min(...rects.map((r) => r.left)) - stageRect.left - pad,
          top: Math.min(...rects.map((r) => r.top)) - stageRect.top - pad,
          right: Math.max(...rects.map((r) => r.right)) - stageRect.left + pad,
          bottom: Math.max(...rects.map((r) => r.bottom)) - stageRect.top + pad
        };
      }
      if (!tapeLayoutPx) return null;
      let tapeW = stageRect.width * 0.92;
      let tapeLeft = (stageRect.width - tapeW) * 0.5;
      if (COLLAGE_DOILY_LAYOUT && moodCardImg) {
        const interior = moodCardInteriorPx(stageRect);
        tapeW = (interior.right - interior.left) * CARD_STRIP_WIDTH_FRAC;
        tapeLeft = (interior.left + interior.right) * 0.5 - tapeW * 0.5;
      }
      return {
        left: tapeLeft - pad,
        top: tapeLayoutPx.goodTop - pad,
        right: tapeLeft + tapeW + pad,
        bottom: tapeLayoutPx.roughBottom + pad
      };
    }

    /** Quote clipping PNG bounds in screen space (HARD ceiling for swatch). */
    function measureQuoteTextScreen() {
      if (
        !duoQuoteWrap ||
        duoQuoteWrap.hasAttribute('hidden') ||
        duoQuoteWrap.classList.contains('is-quote-pending')
      ) {
        return null;
      }
      const quoteImg = duoQuoteWrap.querySelector('.quilt-mood-duo__quote-img');
      const quoteRect = (quoteImg || duoQuoteWrap).getBoundingClientRect();
      if (quoteRect.height < 1) return null;
      const pad = Math.max(8, quoteRect.height * SWATCH_QUOTE_CLEARANCE_FRAC);
      return {
        left: quoteRect.left - pad,
        top: quoteRect.top - pad,
        right: quoteRect.right + pad,
        bottom: quoteRect.bottom + pad
      };
    }

    function swatchBoxStage(leftPx, topPx, swatchW, swatchH) {
      return { left: leftPx, top: topPx, right: leftPx + swatchW, bottom: topPx + swatchH };
    }

    function swatchBoxScreen(box, stageRect) {
      return {
        left: stageRect.left + box.left,
        top: stageRect.top + box.top,
        right: stageRect.left + box.right,
        bottom: stageRect.top + box.bottom
      };
    }

    function setSwatchTopPx(topPx, stageRect) {
      host.style.removeProperty('--collage-swatch-bottom');
      host.style.setProperty(
        '--collage-swatch-top',
        `${(Math.max(0, topPx) / stageRect.height) * 100}%`
      );
    }

    function readSwatchTopPx(stageRect) {
      const raw = host.style.getPropertyValue('--collage-swatch-top').trim();
      if (raw.endsWith('%')) return (parseFloat(raw) / 100) * stageRect.height;
      return 0;
    }

    function swatchFabricEl(colorsZone) {
      return (
        colorsZone.querySelector('#quiltUserColorCardWrap:not([hidden])') ||
        colorsZone.querySelector('.quilt-user-color-card-wrap:not([hidden])') ||
        colorsZone
      );
    }

    function swatchRectStage(colorsZone, stageRect) {
      const r = swatchFabricEl(colorsZone).getBoundingClientRect();
      return {
        left: r.left - stageRect.left,
        top: r.top - stageRect.top,
        right: r.right - stageRect.left,
        bottom: r.bottom - stageRect.top,
        w: r.width,
        h: r.height
      };
    }

    function measureSwatchBBox(colorsZone, stageRect) {
      const fabric = swatchFabricEl(colorsZone);
      const measured = fabric.getBoundingClientRect();
      const estW = Math.min(
        stageRect.width * (COLLAGE_SWATCH_WIDTH_VW / 100),
        COLLAGE_SWATCH_WIDTH_MAX_PX
      );
      const w = measured.width > 4 ? measured.width : estW;
      const h =
        measured.height > 4
          ? measured.height
          : estW * (890 / 752) * SWATCH_ROTATION_BBOX_SCALE;
      return { w, h };
    }

    function stripBandScreen(stageRect, stripBand) {
      return {
        left: stageRect.left + stripBand.left,
        top: stageRect.top + stripBand.top,
        right: stageRect.left + stripBand.right,
        bottom: stageRect.top + stripBand.bottom
      };
    }

    function cardBlockPx(stageRect) {
      const cardRect = moodCardImg?.getBoundingClientRect?.();
      if (cardRect && cardRect.height > 1) {
        return {
          left: cardRect.left - stageRect.left,
          top: cardRect.top - stageRect.top,
          right: cardRect.right - stageRect.left,
          bottom: cardRect.bottom - stageRect.top
        };
      }
      const { cardTopPx, cardH, cardW } = cardLayerMetrics(stageRect);
      const cardLeft = (stageRect.width - cardW) * 0.5;
      return {
        left: cardLeft,
        top: cardTopPx,
        right: cardLeft + cardW,
        bottom: cardTopPx + cardH
      };
    }

    /** Strip block expanded to card interior width — the dark no-go shape from mockup. */
    function protectedBlockPx(stageRect, stripBand) {
      if (!stripBand) return null;
      const interior = moodCardInteriorPx(stageRect);
      return {
        left: interior.left,
        top: stripBand.top,
        right: interior.right,
        bottom: stripBand.bottom
      };
    }

    /**
     * Safe regions = card edges outside protected strip block + stage above card.
     * Anything outside the protected rectangle on the card border is fair game (SOFT).
     */
    function computeCardSafeRegions(stageRect, card, protectedBand) {
      const gap = 3;
      const inset = stageInsetPx(stageRect);
      const regions = [];

      if (protectedBand.top > card.top + gap) {
        regions.push({
          id: 'card-top',
          left: card.left,
          top: card.top,
          right: card.right,
          bottom: protectedBand.top
        });
      }
      if (protectedBand.bottom < card.bottom - gap) {
        regions.push({
          id: 'card-bottom',
          left: card.left,
          top: protectedBand.bottom,
          right: card.right,
          bottom: card.bottom
        });
      }
      if (protectedBand.left > card.left + gap) {
        regions.push({
          id: 'card-left',
          left: card.left,
          top: protectedBand.top,
          right: protectedBand.left,
          bottom: protectedBand.bottom
        });
      }
      if (protectedBand.right < card.right - gap) {
        regions.push({
          id: 'card-right',
          left: protectedBand.right,
          top: protectedBand.top,
          right: card.right,
          bottom: protectedBand.bottom
        });
      }
      if (card.top > gap) {
        regions.push({
          id: 'above-card',
          left: stageRect.width * SWATCH_LEFT_INSET_FRAC,
          top: stageRect.height * 0.02,
          right: stageRect.width * 0.88,
          bottom: card.top
        });
      }
      if (card.bottom + gap < stageRect.height - inset) {
        regions.push({
          id: 'below-card',
          left: inset,
          top: card.bottom,
          right: stageRect.width - inset,
          bottom: stageRect.height - inset
        });
      }
      return regions;
    }

    function readSwatchLeftPx(stageRect) {
      const raw = host.style.getPropertyValue('--collage-swatch-left').trim();
      if (raw.endsWith('%')) return (parseFloat(raw) / 100) * stageRect.width;
      return stageRect.width * SWATCH_LEFT_INSET_FRAC;
    }

    function setSwatchLeftPx(leftPx, stageRect) {
      host.style.setProperty('--collage-swatch-left', `${(leftPx / stageRect.width) * 100}%`);
    }

    function stageInsetPx(stageRect) {
      return Math.max(4, stageRect.width * SWATCH_STAGE_INSET_FRAC);
    }

    function swatchOverlapsProtected(colorsZone, stageRect, protectedBand) {
      if (!protectedBand) return false;
      const gap = SWATCH_PROTECTED_CLEAR_PX;
      const s = swatchRectStage(colorsZone, stageRect);
      return (
        s.left < protectedBand.right - gap &&
        s.right > protectedBand.left + gap &&
        s.top < protectedBand.bottom - gap &&
        s.bottom > protectedBand.top + gap
      );
    }

    function fabricOffsetFromSlot(colorsZone, stageRect) {
      const slotLeft = readSwatchLeftPx(stageRect);
      const slotTop = readSwatchTopPx(stageRect);
      const s = swatchRectStage(colorsZone, stageRect);
      return { dx: s.left - slotLeft, dy: s.top - slotTop };
    }

    /** Move slot so fabric bbox top-left lands at target (stage px). */
    function placeFabricAt(colorsZone, stageRect, targetLeft, targetTop) {
      const { dx, dy } = fabricOffsetFromSlot(colorsZone, stageRect);
      applySwatchPosition(
        colorsZone,
        stageRect,
        targetLeft - dx,
        targetTop - dy
      );
    }

    function fabricTargetBelowCard(stageRect, protectedBand, card, dateKey, fabricW, fabricH) {
      const inset = stageInsetPx(stageRect);
      const gap = SWATCH_PROTECTED_CLEAR_PX;
      const floorTop = Math.max(card.bottom, protectedBand.bottom) + gap;
      const safeRight = stageRect.width - inset;
      const safeBottom = stageRect.height - inset;
      const cardW = Math.max(0, card.right - card.left);
      const bandW = Math.max(0, safeRight - inset - fabricW);
      const bandH = Math.max(0, safeBottom - floorTop - fabricH);
      const jitterX =
        bandW > 1 ? (hashJitterUnit(dateKey, 'swatch-x') - 0.5) * 2 * bandW * SWATCH_JITTER_X_FRAC : 0;
      const jitterY =
        bandH > 1 ? (hashJitterUnit(dateKey, 'swatch-y') - 0.5) * 2 * bandH * SWATCH_JITTER_Y_FRAC : 0;

      return {
        left: Math.max(inset, Math.min(inset + jitterX, safeRight - fabricW)),
        top: Math.max(floorTop, Math.min(floorTop + jitterY, safeBottom - fabricH))
      };
    }

    /** Hard constraints: fabric bbox fully inside stage and outside protected strip block. */
    function resolveSwatchConstraints(colorsZone, stageRect, protectedBand, card, dateKey) {
      const inset = stageInsetPx(stageRect);
      const gap = SWATCH_PROTECTED_CLEAR_PX;
      const floorTop = Math.max(card.bottom, protectedBand.bottom) + gap;
      const safeLeft = inset;
      const safeRight = stageRect.width - inset;
      const safeTop = inset;
      const safeBottom = stageRect.height - inset;

      let s = swatchRectStage(colorsZone, stageRect);
      const fabricW = s.w > 4 ? s.w : measureSwatchBBox(colorsZone, stageRect).w;
      const fabricH = s.h > 4 ? s.h : measureSwatchBBox(colorsZone, stageRect).h;
      const seed = fabricTargetBelowCard(stageRect, protectedBand, card, dateKey, fabricW, fabricH);
      placeFabricAt(colorsZone, stageRect, seed.left, seed.top);

      for (let pass = 0; pass < 32; pass++) {
        s = swatchRectStage(colorsZone, stageRect);
        if (s.w < 1 || s.h < 1) break;

        let targetLeft = s.left;
        let targetTop = s.top;

        if (s.left < safeLeft) targetLeft = safeLeft;
        if (s.right > safeRight) targetLeft = safeRight - s.w;
        if (s.top < safeTop) targetTop = safeTop;
        if (s.bottom > safeBottom) targetTop = safeBottom - s.h;

        if (s.w > safeRight - safeLeft) {
          targetLeft = safeLeft;
        }

        if (swatchOverlapsProtected(colorsZone, stageRect, protectedBand)) {
          if (s.top < floorTop) {
            targetTop = Math.max(targetTop, floorTop);
          } else {
            targetTop = Math.max(targetTop, protectedBand.bottom + gap);
          }
          if (s.left < protectedBand.right - gap && s.right > protectedBand.left + gap) {
            targetLeft = Math.max(targetLeft, protectedBand.right + gap);
          }
        }

        targetLeft = Math.max(safeLeft, Math.min(targetLeft, safeRight - s.w));
        targetTop = Math.max(Math.max(safeTop, floorTop), Math.min(targetTop, safeBottom - s.h));

        if (Math.abs(targetLeft - s.left) < 0.5 && Math.abs(targetTop - s.top) < 0.5) break;
        placeFabricAt(colorsZone, stageRect, targetLeft, targetTop);
      }

      return { leftPx: readSwatchLeftPx(stageRect), topPx: readSwatchTopPx(stageRect) };
    }

    function belowCardPosition(stageRect, card, protectedBand, swatchW, swatchH, dateKey) {
      const target = fabricTargetBelowCard(stageRect, protectedBand, card, dateKey, swatchW, swatchH);
      return { leftPx: target.left, topPx: target.top };
    }

    function applySwatchPosition(colorsZone, stageRect, leftPx, topPx) {
      setSwatchTopPx(topPx, stageRect);
      setSwatchLeftPx(leftPx, stageRect);
      void colorsZone.offsetHeight;
    }

    /** Fabric always below yellow card — initial slot guess, then fabric-bbox solver. */
    function pickSwatchPosition(stageRect, card, protectedBand, swatchW, swatchH, dateKey) {
      return { ...belowCardPosition(stageRect, card, protectedBand, swatchW, swatchH, dateKey), regionId: 'below-card' };
    }

    function resolveSwatchLeftForQuote(fabricLeft, fabricTop, swatchW, swatchH, stageRect, quoteBlock) {
      if (!quoteBlock) return fabricLeft;

      const inset = stageInsetPx(stageRect);
      let box = swatchBoxScreen(swatchBoxStage(fabricLeft, fabricTop, swatchW, swatchH), stageRect);
      if (!rectsOverlap(box, quoteBlock)) return fabricLeft;

      const gap = Math.max(8, stageRect.width * 0.02);
      const minLeft = inset;

      const leftOfQuote = quoteBlock.left - stageRect.left - swatchW - gap;
      if (leftOfQuote >= minLeft) {
        box = swatchBoxScreen(swatchBoxStage(leftOfQuote, fabricTop, swatchW, swatchH), stageRect);
        if (!rectsOverlap(box, quoteBlock)) return leftOfQuote;
        return Math.max(minLeft, leftOfQuote);
      }

      const rightOfQuote = quoteBlock.right - stageRect.left + gap;
      if (rightOfQuote + swatchW <= stageRect.width - inset) {
        box = swatchBoxScreen(swatchBoxStage(rightOfQuote, fabricTop, swatchW, swatchH), stageRect);
        if (!rectsOverlap(box, quoteBlock)) return rightOfQuote;
      }

      return Math.max(minLeft, fabricLeft);
    }

    function enforceSwatchHardClearances(colorsZone, stageRect, protectedBand, quoteBlock, card, dateKey) {
      let pos = resolveSwatchConstraints(colorsZone, stageRect, protectedBand, card, dateKey);

      if (quoteBlock) {
        let s = swatchRectStage(colorsZone, stageRect);
        const fabricScreen = swatchFabricEl(colorsZone).getBoundingClientRect();
        if (rectsOverlap(fabricScreen, quoteBlock)) {
          const fabricLeft = resolveSwatchLeftForQuote(
            s.left,
            s.top,
            s.w,
            s.h,
            stageRect,
            quoteBlock
          );
          placeFabricAt(colorsZone, stageRect, fabricLeft, s.top);
          s = swatchRectStage(colorsZone, stageRect);
          if (rectsOverlap(swatchFabricEl(colorsZone).getBoundingClientRect(), quoteBlock)) {
            placeFabricAt(
              colorsZone,
              stageRect,
              s.left,
              quoteBlock.bottom - stageRect.top + 8
            );
          }
          pos = resolveSwatchConstraints(colorsZone, stageRect, protectedBand, card, dateKey);
        }
      }

      return pos;
    }

    let debugOverlayEl = null;

    function updateCollageDebugOverlay(stageRect, protectedBand, quoteBlock, safeRegions) {
      if (!isCollageDebug()) {
        debugOverlayEl?.remove();
        debugOverlayEl = null;
        return;
      }
      if (!debugOverlayEl) {
        debugOverlayEl = document.createElement('div');
        debugOverlayEl.className = 'quilt-mood-collage__debug-overlay';
        debugOverlayEl.setAttribute('aria-hidden', 'true');
        stage.appendChild(debugOverlayEl);
      }

      debugOverlayEl.innerHTML =
        '<span class="quilt-mood-collage__debug-protected">protected</span>' +
        '<span class="quilt-mood-collage__debug-quote">quote</span>';

      const protectedEl = debugOverlayEl.querySelector('.quilt-mood-collage__debug-protected');
      const quoteEl = debugOverlayEl.querySelector('.quilt-mood-collage__debug-quote');

      if (protectedBand && protectedEl) {
        protectedEl.style.left = `${(protectedBand.left / stageRect.width) * 100}%`;
        protectedEl.style.top = `${(protectedBand.top / stageRect.height) * 100}%`;
        protectedEl.style.width = `${((protectedBand.right - protectedBand.left) / stageRect.width) * 100}%`;
        protectedEl.style.height = `${((protectedBand.bottom - protectedBand.top) / stageRect.height) * 100}%`;
      }

      if (quoteBlock && quoteEl) {
        quoteEl.style.display = '';
        quoteEl.style.left = `${quoteBlock.left - stageRect.left}px`;
        quoteEl.style.top = `${quoteBlock.top - stageRect.top}px`;
        quoteEl.style.width = `${quoteBlock.right - quoteBlock.left}px`;
        quoteEl.style.height = `${quoteBlock.bottom - quoteBlock.top}px`;
      } else if (quoteEl) {
        quoteEl.style.display = 'none';
      }

      if (Array.isArray(safeRegions)) {
        safeRegions.forEach((region, index) => {
          const safeEl = document.createElement('span');
          safeEl.className = 'quilt-mood-collage__debug-safe';
          safeEl.textContent = region.id || 'safe';
          safeEl.style.left = `${(region.left / stageRect.width) * 100}%`;
          safeEl.style.top = `${(region.top / stageRect.height) * 100}%`;
          safeEl.style.width = `${((region.right - region.left) / stageRect.width) * 100}%`;
          safeEl.style.height = `${((region.bottom - region.top) / stageRect.height) * 100}%`;
          debugOverlayEl.appendChild(safeEl);
        });
      }
    }

    /** Single layout pass — protected zones then date-key jitter (COLLAGE_SLOTS contract). */
    function layoutCollageStage() {
      if (!layerReady || !COLLAGE_DOILY_LAYOUT) return;

      const wrap = document.getElementById('quiltUserColorCardWrap');
      const colorsZone = stage.querySelector('.quilt-daily-colors-zone.quilt-mood-collage__swatch-slot');
      if (!wrap || wrap.hasAttribute('hidden') || !colorsZone) {
        host.style.removeProperty('--collage-swatch-top');
        host.style.removeProperty('--collage-swatch-bottom');
        host.style.removeProperty('--collage-swatch-left');
        applyCollageHostSize(host);
        return;
      }

      applyCollageHostSize(host);

      let stageRect = stage.getBoundingClientRect();
      if (stageRect.width < 1 || stageRect.height < 1) return;

      void tapeGood.zone.offsetHeight;

      let stripBand = stripBlockPx(stageRect);
      let protectedBand = stripBand ? protectedBlockPx(stageRect, stripBand) : null;
      let card = cardBlockPx(stageRect);
      const quoteBlock = measureQuoteTextScreen();
      let safeRegions = protectedBand ? computeCardSafeRegions(stageRect, card, protectedBand) : [];

      updateCollageDebugOverlay(stageRect, protectedBand, quoteBlock, safeRegions);

      if (!protectedBand) {
        host.style.removeProperty('--collage-swatch-top');
        host.style.removeProperty('--collage-swatch-bottom');
        host.style.removeProperty('--collage-swatch-left');
        return;
      }

      const { w: swatchW, h: swatchH } = measureSwatchBBox(colorsZone, stageRect);
      const pick = pickSwatchPosition(stageRect, card, protectedBand, swatchW, swatchH, collageDateKey);

      applySwatchPosition(colorsZone, stageRect, pick.leftPx, pick.topPx);

      enforceSwatchHardClearances(
        colorsZone,
        stageRect,
        protectedBand,
        quoteBlock,
        card,
        collageDateKey
      );

      if (pick.regionId === 'below-card') {
        const nextRect = stage.getBoundingClientRect();
        if (Math.abs(nextRect.height - stageRect.height) > 2) {
          stageRect = nextRect;
          card = cardBlockPx(stageRect);
          stripBand = stripBlockPx(stageRect);
          protectedBand = stripBand ? protectedBlockPx(stageRect, stripBand) : protectedBand;
          safeRegions = computeCardSafeRegions(stageRect, card, protectedBand);
          updateCollageDebugOverlay(stageRect, protectedBand, quoteBlock, safeRegions);
          const repick = pickSwatchPosition(stageRect, card, protectedBand, swatchW, swatchH, collageDateKey);
          applySwatchPosition(colorsZone, stageRect, repick.leftPx, repick.topPx);
          enforceSwatchHardClearances(
            colorsZone,
            stageRect,
            protectedBand,
            quoteBlock,
            card,
            collageDateKey
          );
        }
      }
    }

    function syncPennyTapeLayout() {
      if (!pennyTapeEl) return;
      const stageRect = stage.getBoundingClientRect();
      const pennyRect = pennyImg.getBoundingClientRect();
      if (stageRect.width < 1 || pennyRect.width < 1) return;

      const tapeW = pennyRect.width * PENNY_TAPE_WIDTH_SCALE;
      const tapeH = tapeW * PENNY_TAPE_ASPECT;
      const tapeLeft = pennyRect.left + pennyRect.width * 0.06;
      const tapeTop = pennyRect.top + pennyRect.height * 0.12;

      host.style.setProperty('--collage-penny-tape-width', `${tapeW.toFixed(2)}px`);
      host.style.setProperty(
        '--collage-penny-tape-left',
        `${((tapeLeft - stageRect.left) / stageRect.width) * 100}%`
      );
      host.style.setProperty('--collage-penny-tape-translate-x', '0');
      host.style.setProperty(
        '--collage-penny-tape-bottom',
        `${((stageRect.bottom - (tapeTop + tapeH * 0.58)) / stageRect.height) * 100}%`
      );
    }

    /** Penny on triangle tip — held down by tape strip. */
    function syncPennyLayout() {
      const stageRect = stage.getBoundingClientRect();
      const triRect = triangleWrap?.getBoundingClientRect?.() || { height: 0 };
      if (stageRect.height < 1) return;

      host.style.setProperty('--collage-penny-width', pennyDisplayWidth(1));
      pennyImg.style.visibility = 'visible';
      if (pennyTapeEl) pennyTapeEl.style.visibility = 'visible';

      if (COLLAGE_DOILY_LAYOUT && moodCardImg) {
        const cardRect = moodCardImg.getBoundingClientRect();
        if (cardRect.height > 1) {
          layoutPennyOnCard(stageRect, cardRect, measurePennySizePx(1), collageDateKey);
          return;
        }
      }

      if (triRect.height > 1) {
        layoutPennyOnTriangle(stageRect, triRect, measurePennySizePx(1));
        syncPennyTapeLayout();
        return;
      }

      const quoteRect = duoQuoteWrap?.getBoundingClientRect?.() || { height: 0 };
      if (quoteRect.height < 1) return;

      const goodRect = tapeGood.zone.getBoundingClientRect();
      const roughRect = tapeRough.zone.getBoundingClientRect();
      const tapeGapPx = stageRect.height * PENNY_LAYOUT_TAPE_GAP;
      const textSafe = quoteTextSafeRect(quoteRect, stageRect.width);
      const tapeBlock = tapeBlockRect(goodRect, roughRect, tapeGapPx);
      const quoteLeftPenny = resolvePennySidePick(quoteRect, textSafe, tapeBlock, 'left');
      const quoteRightPenny = resolvePennySidePick(quoteRect, textSafe, tapeBlock, 'right');
      const pick = quoteLeftPenny || quoteRightPenny;
      if (pick && applyPennyPick(stageRect, pick)) syncPennyTapeLayout();
    }

    function remeasureCollage() {
      if (collageScrolling) {
        remeasureAfterScroll = true;
        return;
      }
      if (!layerReady) {
        if (!promoteLayerReady()) return;
      } else if (!applyCollageHostSize(host)) {
        return;
      }

      const hostWidthPx = host.getBoundingClientRect().width || host.offsetWidth || 0;
      if (hostWidthPx > 1 && Math.abs(hostWidthPx - lastHostWidthPx) > 1) {
        lastHostWidthPx = hostWidthPx;
      }

      syncDoilyLayout();
      syncTriangleLayout();
      syncTapeLayout();
      if (!COLLAGE_DOILY_LAYOUT) syncCosmosTapeLayout();
      syncDuoQuoteLayout();
      syncPennyLayout();
      paintQuiltBg();
      engines.good?.syncScratchCanvas?.();
      engines.rough?.syncScratchCanvas?.();
      layoutCollageStage();
    }

    function handleCommit(picked) {
      if (mood !== null) return;
      applyMood(picked, { fromUser: true });
    }

    function handleRevealComplete() {
      host.classList.add('is-open');
      if (mood === 'good' || mood === 'rough') {
        announcer.textContent = mood === 'good' ? goodDay : roughDay;
      }
    }

    Promise.all([
      loadImage(ASSETS.tapeGoodFoil),
      loadImage(ASSETS.tapeGoodMarks),
      loadImage(ASSETS.tapeRoughFoil),
      loadImage(ASSETS.tapeRoughMarks)
    ])
      .then(([goodFoilImg, goodMarksImg, roughFoilImg, roughMarksImg]) => {
        engines.good = mountTapeScratch({
          zoneEl: tapeGood.zone,
          canvas: tapeGood.canvas,
          marksCanvas: tapeGood.marksCanvas,
          foilImg: goodFoilImg,
          marksImg: goodMarksImg,
          mood: 'good',
          reducedMotion,
          onCommit: handleCommit,
          onRevealComplete: handleRevealComplete,
          scratchPersist,
          startCommitted: initialMood === 'good'
        });
        engines.rough = mountTapeScratch({
          zoneEl: tapeRough.zone,
          canvas: tapeRough.canvas,
          marksCanvas: tapeRough.marksCanvas,
          foilImg: roughFoilImg,
          marksImg: roughMarksImg,
          mood: 'rough',
          reducedMotion,
          onCommit: handleCommit,
          onRevealComplete: handleRevealComplete,
          scratchPersist,
          startCommitted: initialMood === 'rough'
        });
        enginesReady = true;
        tryApplyPendingMood();
        requestAnimationFrame(() => {
          remeasureCollage();
        });
      })
      .catch((err) => {
        console.warn('[mood-collage] tape load failed', err);
        markLayerReady();
      });

    markLayerReady();

    let quoteReadyCallback = typeof opts.onReady === 'function' ? opts.onReady : null;

    function showDuoQuote() {
      if (!duoQuoteWrap) return;
      duoQuoteWrap.classList.remove('is-quote-pending');
      duoQuoteWrap.removeAttribute('hidden');
      duoQuoteWrap.removeAttribute('aria-hidden');
      document.getElementById('quiltMoodDuo')?.classList.add('is-duo-ready');
    }

    function hideDuoQuote() {
      duoQuoteWrap?.classList.add('is-quote-pending');
      duoQuoteWrap?.setAttribute('hidden', 'hidden');
      duoQuoteWrap?.setAttribute('aria-hidden', 'true');
      document.getElementById('quiltMoodDuo')?.classList.remove('is-duo-ready');
    }

    function finishQuoteReady() {
      host.classList.add('is-ready');
      requestAnimationFrame(() => {
        remeasureCollage();
        quoteReadyCallback?.();
        quoteReadyCallback = null;
      });
    }

    function onQuoteLoad() {
      showDuoQuote();
      applyCollageQuoteDisplaySize(duoQuoteImg, duoQuoteWrap, {
        quoteDisplayWidthPx: opts.quoteDisplayWidthPx,
        quoteRenderWidth: opts.quoteRenderWidth
      });
      if (promoteLayerReady()) {
        remeasureCollage();
        finishQuoteReady();
      } else {
        scheduleRemeasureRetries(finishQuoteReady);
      }
    }

    function applyQuoteImage(nextUrl, { quoteDisplayWidthPx = 0, quoteRenderWidth = 0, onReady } = {}) {
      const url = String(nextUrl || '').trim();
      if (!url) return false;
      if (typeof onReady === 'function') quoteReadyCallback = onReady;
      if (quoteDisplayWidthPx > 0) opts.quoteDisplayWidthPx = quoteDisplayWidthPx;
      if (quoteRenderWidth > 0) opts.quoteRenderWidth = quoteRenderWidth;
      const currentSrc = String(duoQuoteImg?.currentSrc || duoQuoteImg?.src || '').trim();
      if (quoteUrlsMatch(currentSrc, url)) {
        if (host.classList.contains('is-ready') || (duoQuoteImg?.complete && duoQuoteImg.naturalWidth > 0)) {
          onQuoteLoad();
        }
        return true;
      }
      if (!duoQuoteImg) return false;
      duoQuoteImg.src = url;
      applyCollageQuoteDisplaySize(duoQuoteImg, duoQuoteWrap, {
        quoteDisplayWidthPx: opts.quoteDisplayWidthPx,
        quoteRenderWidth: opts.quoteRenderWidth
      });
      if (duoQuoteImg.complete && duoQuoteImg.naturalWidth) onQuoteLoad();
      else duoQuoteImg.addEventListener('load', onQuoteLoad, { once: true });
      return true;
    }

    if (duoQuoteImg) {
      duoQuoteImg.addEventListener('error', () => {
        console.warn('[mood-collage] quote image failed to load');
        host.classList.remove('is-ready');
        hideDuoQuote();
        if (!host.classList.contains('is-layer-ready')) {
          host.setAttribute('hidden', 'hidden');
          host.setAttribute('aria-hidden', 'true');
        }
      });
    }

    if (quoteDataUrl) applyQuoteImage(quoteDataUrl);

    if (moodCardImg && !moodCardImg.complete) {
      moodCardImg.addEventListener('load', () => remeasureCollage(), { once: true });
    }
    if (moodCardImg) {
      moodCardImg.addEventListener(
        'error',
        () => console.warn('[mood-collage] mood card failed to load', ASSETS.moodCard),
        { once: true }
      );
    }
    if (circleImg && (!circleImg.complete || !circleImg.naturalWidth)) {
      circleImg.addEventListener('load', () => remeasureCollage(), { once: true });
    }
    for (const cosmosImg of [cosmosTop, cosmosBottom]) {
      if (!cosmosImg.complete || !cosmosImg.naturalWidth) {
        cosmosImg.addEventListener('load', () => remeasureCollage(), { once: true });
      }
    }
    if (triangleImg && !triangleImg.complete && !triangleImg.naturalWidth) {
      triangleImg.addEventListener('load', () => remeasureCollage(), { once: true });
    }
    if (!pennyImg.complete || !pennyImg.naturalWidth) {
      pennyImg.addEventListener('load', () => remeasureCollage(), { once: true });
    }

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduleRemeasureCollage());
      resizeObserver.observe(host);
    }

    const quiltScreen = document.getElementById('screen-quilt');
    if (quiltScreen && typeof MutationObserver !== 'undefined') {
      screenObserver = new MutationObserver(() => {
        if (quiltScreen.classList.contains('active') && !quiltScreen.hasAttribute('hidden')) {
          scheduleRemeasureRetries(() => {
            if (!host.classList.contains('is-ready') && duoQuoteImg?.complete && duoQuoteImg.naturalWidth > 0) {
              finishQuoteReady();
            }
          });
        }
      });
      screenObserver.observe(quiltScreen, { attributes: true, attributeFilter: ['class', 'hidden'] });
    }

    function flushPersistedScratch() {
      engines.good?.persistScratchNow?.();
      engines.rough?.persistScratchNow?.();
    }

    const onPageHide = () => flushPersistedScratch();
    global.addEventListener('pagehide', onPageHide);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPersistedScratch();
      });
    }

    const api = {
      host,
      getMood: () => mood,
      setMood(next, options = {}) {
        if (next === 'good' || next === 'rough') {
          let instant = !!options.instant;
          if (instant && !reducedMotion) {
            instant = isZoneScratchComplete(collageDateKey, scratchContentSig, next);
          }
          applyMood(next, { instant, fromUser: !!options.fromUser });
        } else if (next === null || next === 'center' || next === 'idle') {
          resetMood({ instant: !!options.instant, force: !!options.force });
        }
      },
      reset: () => resetMood(),
      remeasure() {
        remeasureCollage();
      },
      setQuote(next = {}) {
        return applyQuoteImage(next.quoteDataUrl, next);
      },
      destroy() {
        remeasureRetryId += 1;
        clearTimeout(scrollQuietTimer);
        scrollQuietTimer = 0;
        collageScrolling = false;
        remeasureAfterScroll = false;
        debugOverlayEl?.remove();
        debugOverlayEl = null;
        restoreSwatchSlot(host);
        if (resizeFrameId) {
          cancelAnimationFrame(resizeFrameId);
          resizeFrameId = 0;
        }
        resizeObserver?.disconnect?.();
        resizeObserver = null;
        screenObserver?.disconnect?.();
        screenObserver = null;
        engines.good?.destroy?.();
        engines.rough?.destroy?.();
        engines = { good: null, rough: null };
        enginesReady = false;
        global.removeEventListener('pagehide', onPageHide);
        host.innerHTML = '';
        delete host._moodCollageWidget;
        delete host._moodSpreadWidget;
        delete host._moodTriptychWidget;
      }
    };
    host._moodCollageWidget = api;
    host._moodSpreadWidget = api;
    host._moodTriptychWidget = api;
    return api;
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
    preloadAssets,
    normalizeBlocks,
    triangleRotateDeg,
    renderQuiltToCanvas,
    moodToPanel,
    panelToMood,
    clearMoodScratchStorage,
    clearMoodScratchForSig,
    isZoneScratchComplete,
    COLLAGE_BUILD,
    ASSETS,
    SCRATCH_REVEAL_THRESHOLD
  };
});
