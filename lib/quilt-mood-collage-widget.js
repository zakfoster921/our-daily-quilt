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

  const STYLE_ID = 'quilt-mood-collage-widget-styles-v11';
  const COLLAGE_BUILD = 'v73';
  /** TEMP: set true to restore triangle photo layer. */
  const COLLAGE_SHOW_TRIANGLE = false;
  const COLLAGE_QUOTE_DISPLAY_SCALE = 0.96;
  const TRIANGLE_TAPE_GAP = 0.008;
  const TRIANGLE_BOTTOM_START = 25;
  const TAPE_SKY_CENTER_JITTER = 0.07;
  const QUOTE_TEXT_INSET_X = 0.07;
  const QUOTE_TEXT_INSET_TOP = 0.06;
  const QUOTE_TEXT_INSET_BOTTOM = 0.26;
  const PENNY_TEXT_CLEARANCE_PX = 3;
  const PENNY_NARROW_STAGE_MAX_PX = 440;
  const TRIANGLE_ROTATE_MIN = -16;
  const TRIANGLE_ROTATE_MAX = 16;
  const TRIANGLE_BASE_ROTATE = 90;
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
  const TRIANGLE_FALLBACK_COLOR = '#61b4de';
  const TAPE_GOOD_ASPECT = 89 / 480;
  const TAPE_ROUGH_ASPECT = 89 / 480;
  const PENNY_ASPECT = 484 / 480;
  /** US cent diameter (0.75 in); display scale bumps on-screen size above strict lifesize. */
  const PENNY_LIFESIZE_DIAMETER_MM = 19.05;
  const PENNY_DISPLAY_SCALE = 1.4;
  const PENNY_DIAMETER_MM = PENNY_LIFESIZE_DIAMETER_MM * PENNY_DISPLAY_SCALE;
  const CSS_MM_TO_PX = 96 / 25.4;
  /** Touch screens under-render CSS mm vs real-world size (96dpi ref vs device PPI). */
  const PENNY_TOUCH_PHYSICAL_FACTOR = 1.46;
  const PENNY_LAYOUT_TAPE_GAP = 0.012;
  const PENNY_TRIANGLE_BAND_TOP = 0.08;
  const PENNY_TRIANGLE_X_MIN = 0.54;
  const PENNY_TRIANGLE_X_MAX = 0.76;
  const TAPE_LAYOUT_QUOTE_GAP = 0.03;
  const TAPE_LAYOUT_STRIP_GAP = 0.015;
  const ASSET_BASE = 'assets/mood-collage';
  const SCRATCH_REVEAL_THRESHOLD = 0.99;
  const SCRATCH_BRUSH_MIN = 28;
  const SCRATCH_BRUSH_MAX = 72;
  const SCRATCH_BRUSH_ZONE_FRAC = 0.28;
  const SCRATCH_MOVE_COMMIT_PX = 12;
  const DISMISS_MARKS_FADE_MS = 920;

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
    return PENNY_DIAMETER_MM * scale * CSS_MM_TO_PX * pennyPhysicalFactor();
  }

  function pennyDisplayWidth(scale = 1) {
    if (pennyPhysicalFactor() > 1) return `${pennyWidthPx(scale).toFixed(2)}px`;
    return `${(PENNY_DIAMETER_MM * scale).toFixed(2)}mm`;
  }

  function pennySizePxAtScale(scale = 1) {
    const w = pennyWidthPx(scale);
    return { w, h: w * PENNY_ASPECT };
  }

  const ASSETS = {
    circle: `${ASSET_BASE}/circle.webp?${COLLAGE_BUILD}`,
    triangle: `${ASSET_BASE}/triangle.webp`,
    penny: `${ASSET_BASE}/penny.webp`,
    tapeGoodFoil: `${ASSET_BASE}/tape-good-foil.webp`,
    tapeGoodMarks: `${ASSET_BASE}/tape-good-marks.webp`,
    tapeRoughFoil: `${ASSET_BASE}/tape-rough-foil.webp`,
    tapeRoughMarks: `${ASSET_BASE}/tape-rough-marks.webp`,
    tapeCosmos: `${ASSET_BASE}/tape-cosmos.webp?${COLLAGE_BUILD}`
  };

  function injectStyles() {
    preloadAssets();
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #screen-quilt .quilt-mood-collage {
        --collage-width: 100%;
        --collage-quote-top: 0%;
        --collage-circle-top: 0%;
        --collage-circle-width: ${SKY_DISPLAY_SCALE * 100}%;
        --collage-circle-rotate: ${SKY_ROTATE_DEG}deg;
        --collage-triangle-width: 75%;
        --collage-triangle-bottom: 25%;
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
        width: var(--collage-width);
        margin: 0 auto;
        aspect-ratio: 480 / 920;
        max-width: 100%;
        min-height: 1px;
        filter: var(--odq-artifact-shadow, drop-shadow(0 4px 14px rgba(45, 36, 29, 0.14)));
        overflow: visible;
      }

      #screen-quilt .quilt-mood-collage[hidden] { display: none !important; }

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
        left: 50%;
        width: auto;
        max-width: 100%;
        transform: translateX(-50%) rotate(var(--collage-quote-rotate, ${STRIP_ROTATE_BASE}deg));
        transform-origin: center top;
        z-index: 6;
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
      }

      #screen-quilt .quilt-mood-collage__triangle-wash {
        position: absolute;
        inset: 0;
        background-color: var(--collage-triangle-color, #61b4de);
        mix-blend-mode: multiply;
        -webkit-mask-image: var(--collage-triangle-mask);
        mask-image: var(--collage-triangle-mask);
        -webkit-mask-size: 100% 100%;
        mask-size: 100% 100%;
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
        pointer-events: none;
        z-index: 1;
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

      #screen-quilt .quilt-mood-collage__tape {
        position: absolute;
        left: 50%;
        width: var(--collage-tape-width);
        transform: translateX(-50%);
        transform-origin: center center;
        z-index: 8;
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

      @media (prefers-reduced-motion: reduce) {
        #screen-quilt .quilt-mood-collage__tape.is-revealed .quilt-mood-collage__tape-marks,
        #screen-quilt .quilt-mood-collage__tape.is-dismissed .quilt-mood-collage__tape-marks {
          transition: none;
        }
      }
    `;
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

  function applyCollageQuoteDisplaySize(quoteImg, quoteWrap, opts = {}) {
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
          {
            ...(QNC.resolveTriptychClippingLayoutOpts?.() || {}),
            displayScale: COLLAGE_QUOTE_DISPLAY_SCALE
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

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
    return { h: h * 360, s, l };
  }

  function isCoolHue(h) {
    return h >= 150 && h <= 285;
  }

  function coolHueDistance(h) {
    const target = 210;
    let diff = Math.abs(h - target);
    if (diff > 180) diff = 360 - diff;
    if (h >= 35 && h < 150) diff += 90;
    return diff;
  }

  /** Area-weighted cool hue from today's quilt blocks. */
  function pickCoolQuiltColor(blocks) {
    if (!blocks?.length) return TRIANGLE_FALLBACK_COLOR;

    const coolByArea = new Map();
    let fallbackBest = null;
    let fallbackScore = Infinity;

    blocks.forEach((block) => {
      const rgb = hexToRgb(block.color);
      if (!rgb) return;
      const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
      if (s < 0.1 || l < 0.1 || l > 0.93) return;
      const area = block.w * block.h;
      const key = block.color.toLowerCase();

      if (isCoolHue(h)) {
        coolByArea.set(key, (coolByArea.get(key) || 0) + area);
        return;
      }

      const score = coolHueDistance(h) / Math.sqrt(area);
      if (score < fallbackScore) {
        fallbackScore = score;
        fallbackBest = block.color;
      }
    });

    if (coolByArea.size) {
      let bestColor = TRIANGLE_FALLBACK_COLOR;
      let bestArea = 0;
      coolByArea.forEach((area, color) => {
        if (area > bestArea) {
          bestArea = area;
          bestColor = color;
        }
      });
      return bestColor;
    }

    return fallbackBest || TRIANGLE_FALLBACK_COLOR;
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

  function mountTapeScratch(cfg) {
    const { zoneEl, canvas, marksCanvas, foilImg, marksImg, mood, reducedMotion = false, onCommit, onRevealComplete } = cfg;
    let painting = false;
    let lastX = 0;
    let lastY = 0;
    let moveTotal = 0;
    let strokeCount = 0;
    let revealed = false;
    let committed = false;
    let scratchCtx = null;
    let marksCtx = null;
    let scratchCssW = 0;
    let scratchCssH = 0;
    let foilMask = null;
    let dismissFadeTimer = null;

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
      const shouldRedrawFoil = forceFoil || !foilMask || progressBefore < 0.005;

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
      if (progressBefore >= 0.06) zoneEl.classList.add('is-scratch-progress');
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
      if (progress >= 0.06) zoneEl.classList.add('is-scratch-progress');
      if (progress >= SCRATCH_REVEAL_THRESHOLD) {
        revealed = true;
        zoneEl.classList.add('is-revealed', 'is-scratch-progress');
        zoneEl.classList.remove('is-scratching');
        onRevealComplete?.();
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
      reset() {
        if (dismissFadeTimer != null) {
          global.clearTimeout(dismissFadeTimer);
          dismissFadeTimer = null;
        }
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
        syncScratchCanvas({ forceFoil: true });
      },
      destroy() {
        if (dismissFadeTimer != null) {
          global.clearTimeout(dismissFadeTimer);
          dismissFadeTimer = null;
        }
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

  function unmount(host) {
    if (!host) return;
    const api = host._moodCollageWidget || host._moodSpreadWidget;
    host._moodCollageWidget = null;
    host._moodSpreadWidget = null;
    host._moodTriptychWidget = null;
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
      'is-quilt-overlay'
    );
    delete host.dataset.collageBuild;
    delete host.dataset.collageDateKey;
    delete host.dataset.moodSpreadMode;
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
    const initialInstant = !!opts.instant || !!initialMood;

    host.className = 'quilt-mood-collage';
    host.removeAttribute('hidden');
    host.removeAttribute('aria-hidden');
    host.dataset.collageBuild = COLLAGE_BUILD;
    host.dataset.moodSpreadMode = 'collage';
    if (overlayQuilt) host.classList.add('is-quilt-overlay');
    else host.classList.remove('is-quilt-overlay');
    const collageDateKey = String(opts.dateKey || '').trim();
    host.style.setProperty('--collage-quote-rotate', `${tapeRotateDeg(collageDateKey, 'quote').toFixed(2)}deg`);
    host.style.setProperty('--collage-tape-good-rotate', `${tapeRotateDeg(collageDateKey, 'good').toFixed(2)}deg`);
    host.style.setProperty('--collage-tape-rough-rotate', `${tapeRotateDeg(collageDateKey, 'rough').toFixed(2)}deg`);
    host.style.setProperty('--collage-cosmos-top-rotate', `${tapeRotateDeg(collageDateKey, 'cosmos-top').toFixed(2)}deg`);
    host.style.setProperty('--collage-cosmos-bottom-rotate', `${tapeRotateDeg(collageDateKey, 'cosmos-bottom').toFixed(2)}deg`);
    const triangleRotate = COLLAGE_SHOW_TRIANGLE ? triangleRotateDeg(collageDateKey) : 0;
    if (COLLAGE_SHOW_TRIANGLE) {
      host.style.setProperty('--collage-triangle-mask', `url(${ASSETS.triangle})`);
      host.style.setProperty('--collage-triangle-color', pickCoolQuiltColor(blocks));
    }
    host.dataset.collageDateKey = collageDateKey;

    const stage = document.createElement('div');
    stage.className = 'quilt-mood-collage__stage';

    let quiltCanvas = null;
    if (!overlayQuilt) {
      quiltCanvas = document.createElement('canvas');
      quiltCanvas.className = 'quilt-mood-collage__quilt-bg';
      quiltCanvas.setAttribute('aria-hidden', 'true');
    }

    const quoteWrap = document.createElement('div');
    quoteWrap.className = 'quilt-mood-collage__quote';
    const quoteImg = document.createElement('img');
    quoteImg.className = 'quilt-mood-spread__quote-img';
    quoteImg.alt = "Today's quote";
    quoteImg.decoding = 'async';
    quoteImg.draggable = false;
    quoteWrap.appendChild(quoteImg);
    if (!quoteDataUrl) quoteWrap.classList.add('is-quote-pending');

    function layerImg(className, src, alt) {
      const img = document.createElement('img');
      img.className = `quilt-mood-collage__layer ${className}`;
      img.src = src;
      img.alt = alt;
      img.draggable = false;
      img.decoding = 'async';
      return img;
    }

    const circleImg = layerImg('quilt-mood-collage__circle', ASSETS.circle, '');
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
      const triangleWash = document.createElement('div');
      triangleWash.className = 'quilt-mood-collage__triangle-wash';
      triangleWrap.append(triangleImg, triangleWash);
    }
    const pennyImg = layerImg('quilt-mood-collage__penny', ASSETS.penny, '');

    const tapeGood = buildTapeZone('good', goodDay);
    const tapeRough = buildTapeZone('rough', roughDay);

    const announcer = document.createElement('span');
    announcer.className = 'quilt-mood-collage__announcer';
    announcer.setAttribute('aria-live', 'polite');

    stage.append(
      ...(quiltCanvas ? [quiltCanvas] : []),
      circleImg,
      cosmosTop,
      cosmosBottom,
      ...(triangleWrap ? [triangleWrap] : []),
      quoteWrap,
      pennyImg,
      tapeGood.zone,
      tapeRough.zone
    );
    host.append(stage, announcer);

    let layerReady = false;
    function markLayerReady() {
      if (layerReady) return;
      layerReady = true;
      host.classList.add('is-layer-ready');
      requestAnimationFrame(() => remeasureCollage());
    }

    let mood = null;
    let engines = { good: null, rough: null };
    let resizeObserver = null;
    let tapeLayoutPx = null;
    let enginesReady = false;
    let pendingMoodApply = initialMood;

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

      if (instant || reducedMotion) {
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

    function tapeStripHeightPx(stageRect, mood) {
      const aspect = mood === 'rough' ? TAPE_ROUGH_ASPECT : TAPE_GOOD_ASPECT;
      return stageRect.width * 0.92 * aspect;
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

    /** Center both scratch strips inside the sky cutout (day jitter), then other layers follow. */
    function syncTapeLayout() {
      const stageRect = stage.getBoundingClientRect();
      if (stageRect.height < 1) return;

      const sky = skyBoundsPx(stageRect);
      const padPx = stageRect.height * SKY_TAPE_PAD;
      const goodTapeH = tapeStripHeightPx(stageRect, 'good');
      const roughTapeH = tapeStripHeightPx(stageRect, 'rough');
      const stripGap = stageRect.height * TAPE_LAYOUT_STRIP_GAP;
      const stackH = goodTapeH + stripGap + roughTapeH;
      const skyH = sky.bottom - sky.top;

      const minCenter = sky.top + padPx + stackH * 0.5;
      const maxCenter = sky.bottom - padPx - stackH * 0.5;
      let stackCenter = sky.top + skyH * 0.5;
      if (maxCenter > minCenter) {
        const unit = hashString(`${collageDateKey}:tape`) / 4294967295;
        const jitter = (unit - 0.5) * 2 * skyH * TAPE_SKY_CENTER_JITTER;
        stackCenter = Math.max(minCenter, Math.min(maxCenter, stackCenter + jitter));
      } else {
        stackCenter = Math.max(sky.top + padPx + stackH * 0.5, Math.min(sky.bottom - padPx - stackH * 0.5, stackCenter));
      }

      const goodTopPx = stackCenter - stackH * 0.5;
      const roughTopPx = goodTopPx + goodTapeH + stripGap;
      tapeLayoutPx = {
        goodTop: goodTopPx,
        roughTop: roughTopPx,
        roughBottom: roughTopPx + roughTapeH
      };

      host.style.setProperty('--collage-tape-good-top', `${(goodTopPx / stageRect.height) * 100}%`);
      host.style.setProperty('--collage-tape-rough-top', `${(roughTopPx / stageRect.height) * 100}%`);
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

    /** Quote sits above scratch strips; may extend above the sky cutout. */
    function syncQuoteLayout() {
      const stageRect = stage.getBoundingClientRect();
      const quoteHPx = quoteWrap.getBoundingClientRect().height;
      if (stageRect.height < 1 || quoteHPx < 1 || !tapeLayoutPx) return;

      const quoteGap = stageRect.height * TAPE_LAYOUT_QUOTE_GAP;
      const quoteTopPx = tapeLayoutPx.goodTop - quoteGap - quoteHPx;
      host.style.setProperty('--collage-quote-top', `${(quoteTopPx / stageRect.height) * 100}%`);
    }

    /** Keep triangle below scratch strips — close is ok, overlap is not. */
    function syncTriangleLayout() {
      if (!COLLAGE_SHOW_TRIANGLE || !triangleWrap) return;
      if (!tapeLayoutPx) return;
      const stageRect = stage.getBoundingClientRect();
      if (stageRect.height < 1) return;

      const gapPx = stageRect.height * TRIANGLE_TAPE_GAP;
      const tapeBottomStagePx = tapeLayoutPx.roughBottom + gapPx;

      host.style.setProperty('--collage-triangle-bottom', `${TRIANGLE_BOTTOM_START}%`);

      const triHeight = triangleWrap.getBoundingClientRect().height;
      if (triHeight < 1) return;

      const maxBottomPct =
        ((stageRect.height - tapeBottomStagePx - triHeight) / stageRect.height) * 100;
      let bottomPct = Math.min(TRIANGLE_BOTTOM_START, maxBottomPct);

      host.style.setProperty('--collage-triangle-bottom', `${bottomPct}%`);

      for (let i = 0; i < 60; i++) {
        const triTopStagePx = triangleWrap.getBoundingClientRect().top - stageRect.top;
        if (triTopStagePx >= tapeBottomStagePx - 0.5) break;
        bottomPct -= 0.75;
        if (bottomPct < 0) {
          bottomPct = 0;
          host.style.setProperty('--collage-triangle-bottom', '0%');
          break;
        }
        host.style.setProperty('--collage-triangle-bottom', `${bottomPct}%`);
      }
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

    function layoutPennyOnTriangle(stageRect, triRect, tapeBottomPx, pennySize) {
      const { w, h } = pennySize;
      const tapeGapPx = stageRect.height * PENNY_LAYOUT_TAPE_GAP;
      const triTopPx = triRect.top - stageRect.top;
      const triBottomPx = triRect.bottom - stageRect.top;
      const minTopPx = Math.max(triTopPx, tapeBottomPx + tapeGapPx);
      const maxBottomPx = triBottomPx;
      const bandH = Math.max(0, maxBottomPx - minTopPx - h);
      const pennyTopPx = minTopPx + bandH * PENNY_TRIANGLE_BAND_TOP;

      const xUnit = hashString(`${collageDateKey}:penny-tri-x`) / 4294967295;
      const xFrac = PENNY_TRIANGLE_X_MIN + xUnit * (PENNY_TRIANGLE_X_MAX - PENNY_TRIANGLE_X_MIN);
      const pennyLeftPx = triRect.left + triRect.width * xFrac - w * 0.5;

      applyPennyRect(stageRect, {
        left: pennyLeftPx,
        top: stageRect.top + pennyTopPx,
        right: pennyLeftPx + w,
        bottom: stageRect.top + pennyTopPx + h
      });
    }

    /** Quote margin (bottom-left/right) or triangle base — never on text, strips, or below strips. */
    function syncPennyLayout() {
      const stageRect = stage.getBoundingClientRect();
      const quoteRect = quoteWrap.getBoundingClientRect();
      const triRect = triangleWrap?.getBoundingClientRect?.() || { height: 0 };
      if (stageRect.height < 1) return;

      host.style.setProperty('--collage-penny-width', pennyDisplayWidth(1));
      pennyImg.style.visibility = 'visible';

      if (quoteRect.height < 1) return;

      const goodRect = tapeGood.zone.getBoundingClientRect();
      const roughRect = tapeRough.zone.getBoundingClientRect();
      const tapeBottomPx = Math.max(goodRect.bottom, roughRect.bottom) - stageRect.top;
      const tapeGapPx = stageRect.height * PENNY_LAYOUT_TAPE_GAP;
      measurePennySizePx(1);
      const textSafe = quoteTextSafeRect(quoteRect, stageRect.width);
      const tapeBlock = tapeBlockRect(goodRect, roughRect, tapeGapPx);
      const quoteLeftPenny = resolvePennySidePick(quoteRect, textSafe, tapeBlock, 'left');
      measurePennySizePx(1);
      const quoteRightPenny = resolvePennySidePick(quoteRect, textSafe, tapeBlock, 'right');
      measurePennySizePx(1);

      const mode = hashString(`${collageDateKey}:penny`) % 3;
      const tryOrder = COLLAGE_SHOW_TRIANGLE
        ? mode === 0
          ? [quoteLeftPenny, quoteRightPenny, 'triangle']
          : mode === 1
            ? [quoteRightPenny, quoteLeftPenny, 'triangle']
            : ['triangle', quoteLeftPenny, quoteRightPenny]
        : mode === 0
          ? [quoteLeftPenny, quoteRightPenny]
          : [quoteRightPenny, quoteLeftPenny];

      for (const pick of tryOrder) {
        if (pick === 'triangle') {
          if (triRect.height > 1) {
            layoutPennyOnTriangle(stageRect, triRect, tapeBottomPx, measurePennySizePx(1));
            if (pennyRectValid(pennyImg.getBoundingClientRect(), textSafe, tapeBlock)) return;
          }
          continue;
        }
        if (pick && applyPennyPick(stageRect, pick)) return;
      }
    }

    function remeasureCollage() {
      syncTapeLayout();
      syncCosmosTapeLayout();
      syncQuoteLayout();
      syncTriangleLayout();
      syncPennyLayout();
      paintQuiltBg();
      engines.good?.syncScratchCanvas?.();
      engines.rough?.syncScratchCanvas?.();
      requestAnimationFrame(() => syncPennyLayout());
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
          onRevealComplete: handleRevealComplete
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
          onRevealComplete: handleRevealComplete
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

    function onQuoteLoad() {
      quoteWrap.classList.remove('is-quote-pending');
      applyCollageQuoteDisplaySize(quoteImg, quoteWrap, {
        quoteDisplayWidthPx: opts.quoteDisplayWidthPx,
        quoteRenderWidth: opts.quoteRenderWidth
      });
      host.classList.add('is-ready');
      requestAnimationFrame(() => {
        remeasureCollage();
        quoteReadyCallback?.();
        quoteReadyCallback = null;
      });
    }

    function applyQuoteImage(nextUrl, { quoteDisplayWidthPx = 0, quoteRenderWidth = 0, onReady } = {}) {
      const url = String(nextUrl || '').trim();
      if (!url) return false;
      if (typeof onReady === 'function') quoteReadyCallback = onReady;
      if (quoteDisplayWidthPx > 0) opts.quoteDisplayWidthPx = quoteDisplayWidthPx;
      if (quoteRenderWidth > 0) opts.quoteRenderWidth = quoteRenderWidth;
      const currentSrc = String(quoteImg.currentSrc || quoteImg.src || '').trim();
      if (quoteUrlsMatch(currentSrc, url)) {
        if (host.classList.contains('is-ready') || (quoteImg.complete && quoteImg.naturalWidth > 0)) {
          onQuoteLoad();
        }
        return true;
      }
      quoteImg.src = url;
      applyCollageQuoteDisplaySize(quoteImg, quoteWrap, {
        quoteDisplayWidthPx: opts.quoteDisplayWidthPx,
        quoteRenderWidth: opts.quoteRenderWidth
      });
      if (quoteImg.complete && quoteImg.naturalWidth) onQuoteLoad();
      else quoteImg.addEventListener('load', onQuoteLoad, { once: true });
      return true;
    }

    quoteImg.addEventListener('error', () => {
      console.warn('[mood-collage] quote image failed to load');
      host.classList.remove('is-ready');
      if (!host.classList.contains('is-layer-ready')) {
        host.setAttribute('hidden', 'hidden');
        host.setAttribute('aria-hidden', 'true');
      }
    });

    if (quoteDataUrl) applyQuoteImage(quoteDataUrl);

    if (!circleImg.complete || !circleImg.naturalWidth) {
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
      resizeObserver = new ResizeObserver(() => {
        remeasureCollage();
      });
      resizeObserver.observe(stage);
    }

    const api = {
      host,
      getMood: () => mood,
      setMood(next, options = {}) {
        if (next === 'good' || next === 'rough') {
          applyMood(next, { instant: !!options.instant, fromUser: !!options.fromUser });
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
        resizeObserver?.disconnect?.();
        resizeObserver = null;
        engines.good?.destroy?.();
        engines.rough?.destroy?.();
        engines = { good: null, rough: null };
        enginesReady = false;
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
    pickCoolQuiltColor,
    triangleRotateDeg,
    renderQuiltToCanvas,
    moodToPanel,
    panelToMood,
    COLLAGE_BUILD,
    ASSETS,
    SCRATCH_REVEAL_THRESHOLD
  };
});
