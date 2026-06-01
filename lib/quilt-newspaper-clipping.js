/**
 * Quilt newspaper clipping: render full 3-column spread, then crop to 1:3:1 peek band.
 * Browser: global.QuiltNewspaperClipping.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.QuiltNewspaperClipping = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function (global) {
  'use strict';

  const QKE = () =>
    global.QuoteKeywordEmphasis ||
    (typeof require !== 'undefined' ? require('./quote-keyword-emphasis.js') : null);
  const LBKE = () =>
    global.LayoutBKeywordEmphasis ||
    (typeof require !== 'undefined' ? require('./layout-b-keyword-emphasis.js') : null);

  /** Matches live quilt DOM `--quilt-clipping-font` / `--mood-clipping-font`. */
  const CLIPPING_FONT_FAMILY =
    '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
  /** Phone sheet width the DOM clipping used (`--quilt-float-sheet-width` ≈ 428px). */
  const CLIPPING_DOM_SHEET_W = 428;
  const CLIPPING_DOM_ROOT_PX = 16;
  const CLIPPING_DOM_VIEWPORT_W = 430;

  /** Bump when export pipeline output changes (invalidates cached mood-spread PNGs). */
  const CLIPPING_EXPORT_REV = '36';

  const DEFAULTS = {
    /** 0 = auto (2× quilt sheet width). 1080 was too wide—downscaling to ~428px blurred grain/halftone. */
    width: 0,
    exportScale: 2,
    /** Output frame: peek | center | peek (narrower side strips). */
    peekRatio: 0.09,
    /** Extra paper on crop — horizontal for side peeks; lower = trim more neighbor text. */
    cropHorizontalBleedDomPx: 8,
    cropVerticalBleedDomPx: 4,
    spreadPadX: 14,
    spreadPadY: 16,
    /** Set in `withClippingTypography` from DOM `clamp(0.78rem, 2.35vw, 1.02rem)` scaled to export width. */
    bodyPx: null,
    centerBodyPx: null,
    lineHeight: 1.2,
    letterSpacingEm: 0.018,
    wordSpacingEm: 0.02,
    inkTextShadowPx: 0.32,
    /** Halftone over type (DOM 0.062; bumped ~1.5× so PNG reads on phone). */
    halftoneOpacity: 0.095,
    halftonePitchDomPx: 3.25,
    halftoneDotOffsetDomPx: { x: 0.4, y: 0.2 },
    /** Viewport noise (DOM 0.11). */
    viewportGrainOpacity: 0.17,
    viewportGrainTileDomPx: 140,
    /** Sheet grain under type (DOM 0.07). */
    cardGrainOpacity: 0.11,
    cardGrainTileDomPx: 88,
    /** Optional JPEG multiply (same path as quilt card); skipped if unloadable. */
    paperTextureUrl: 'assets/quilt-paper-card-texture.png',
    ruleGap: 10,
    /** Space between horizontal rule and first/last text line (avoids stroke through ascenders). */
    ruleTextGap: 14,
    /** Center horizontal rules span this fraction of column width, centered. */
    centerRuleSpanRatio: 0.3,
    ruleColor: 'rgba(35, 28, 22, 0.55)',
    /** Optional floor for center column (0 = use measured first-line width only). */
    centerColMinW: 0,
    /** Safety cap when first-line phrase is unusually long (0 = no cap). */
    centerColMaxW: 480,
    /** Default max words on center line 1 when quote has no `first_line_count` (Notion). */
    firstLineCount: 3,
    /**
     * Last center line: if full-justify would spread words farther apart than this (dom px),
     * draw that line left-aligned instead (e.g. short author line "Jean Houston").
     */
    justifyLastLineLeftMinGapDomPx: 10,
    inkCenter: 'rgba(56, 46, 36, 0.78)',
    inkSide: 'rgba(42, 34, 28, 0.5)',
    inkStrong: 'rgba(48, 38, 30, 0.84)',
    /** Neutral newsprint — app warm paper (#f6f4f1), not golden cream. */
    paper: '#f6f4f1',
    fontFamily: CLIPPING_FONT_FAMILY,
    /**
     * Scissor-cut silhouette (seeded by dateKey): rectangle + visible border wobble (Carrie ref).
     * Side inward trim capped so peek columns stay mostly intact.
     */
    handCutEnabled: true,
    handCutMarginDomPx: 0.5,
    /** Clip each 90° corner to a short diagonal (dom px) — scissors rarely leave square corners. */
    handCutCornerChamferDomPx: 12,
    /** Scissor slip / mid-edge kink size (dom px). */
    handCutMacroDomPx: 6,
    handCutBiteMaxDomPx: 12,
    handCutSecondaryBiteDomPx: 7,
    /** Max inward trim on left/right (dom px) — trims outer paper on side peeks. */
    handCutSideInwardMaxDomPx: 8,
    /** Extra inward trim on top/bottom edges (dom px) — reduces blank paper above/below type. */
    handCutTopBottomTrimDomPx: 6,
    handCutEdgeFrayPx: 1,
    handCutCanvasPadDomPx: 4,
    /** Mood-spread peek arrows (Material brightness_1 / contrast icons). */
    moodArrowBarColor: 'rgba(30, 24, 18, 0.94)',
    moodArrowFill: '#f6f4f1',
    moodArrowInk: 'rgba(36, 27, 20, 0.82)',
    /** Dark flank bars beside center quote in mood-spread export (off — center abuts side columns). */
    moodFlanksEnabled: false,
    /** Dark flank bar width (3× original ~13px dom). */
    moodArrowBarWidthDomPx: 39,
    /** Extra dark lip on the peek-facing edge (away from center column). */
    moodFlankDarkStretchDomPx: 14,
    /** Cream arrow tip sits this far from outer edge (0–1 of flank width). */
    moodFlankArrowTipFromOuter: 0.1,
    /** Paper gap between flank bars and center quote (0 = flush). */
    moodFlankCenterGapDomPx: 0,
    /** 0 = auto-size from bar / image height. */
    moodArrowIconDomPx: 0,
    /** Printed-ink texture on dark flank bars (multiply layers). */
    moodFlankBarPaperOpacity: 0.09,
    moodFlankBarGrainOpacity: 0.13,
    moodFlankBarHalftoneOpacity: 0.06,
    /** Lighter newsprint grain on cream arrow facets. */
    moodFlankArrowGrainOpacity: 0.1,
    moodFlankArrowHalftoneOpacity: 0.075,
    /** Mood columns: straight classified-ad border (full column bleed, same newsprint). */
    moodAdBorderDomPx: 8,
    moodAdInnerPadDomPx: 10,
    /** null = same dark as mood flank bars (`moodArrowBarColor`) */
    moodFrameInk: null,
    /** Ignored — crop fills newsprint like quote clipping; hand-cut clears outside the silhouette. */
    moodSpreadTransparentExport: true,
    /** Keep hand-cut outer silhouette on mood-spread export (not a straight crop). */
    moodSpreadHandCutExport: true,
    /** null = use cropVerticalBleedDomPx */
    moodSpreadCropVerticalBleedDomPx: null,
    /** Wave 3: pixel-snapped rules + scan-capture fringe on hand-cut edge. */
    digitalExportPolish: true,
    digitalExportRuleInk: 'rgba(22, 16, 10, 0.78)',
    digitalExportScanFringeDomPx: 1.5,
    digitalExportScanFringeDark: 'rgba(28, 20, 12, 0.17)',
    digitalExportScanFringeLight: 'rgba(250, 250, 248, 0.55)',
    /** Wave 3 item 15: finer halftone screen on center quote band only. */
    digitalExportCenterHalftone: true,
    digitalExportCenterHalftonePitchDomPx: 2.65,
    digitalExportCenterHalftoneOpacity: 0.102,
    digitalExportCenterHalftoneDotOffsetDomPx: { x: 0.35, y: 0.15 }
  };

  const CARD_GRAIN_SVG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.62'/%3E%3C/svg%3E";
  const VIEWPORT_GRAIN_SVG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E";

  const patternCache = { card: null, viewport: null, paper: null };
  const patternPromises = {};

  function resolveClippingExportWidth(cfg) {
    if (typeof cfg.width === 'number' && cfg.width > 0) return Math.round(cfg.width);
    const scale = typeof cfg.exportScale === 'number' && cfg.exportScale > 0 ? cfg.exportScale : 2;
    return Math.round(CLIPPING_DOM_SHEET_W * scale);
  }

  function domToExportPx(cfg, domPx) {
    return domPx * (resolveClippingExportWidth(cfg) / CLIPPING_DOM_SHEET_W);
  }

  function digitalExportPolishEnabled(cfg = DEFAULTS) {
    return cfg.digitalExportPolish !== false;
  }

  function exportRuleInk(cfg) {
    if (digitalExportPolishEnabled(cfg) && cfg.digitalExportRuleInk) {
      return cfg.digitalExportRuleInk;
    }
    return cfg.ruleColor;
  }

  function exportRuleThickness(cfg) {
    return Math.max(1, Math.round(domToExportPx(cfg, 1)));
  }

  function crispAxisCoord(n, lineWidth) {
    const lw = Math.max(1, lineWidth);
    return Math.round(n) + (lw % 2 === 1 ? 0.5 : 0);
  }

  function strokeCrispHLine(ctx, x0, x1, y, color, lineWidthPx) {
    const lw = Math.max(1, lineWidthPx);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(Math.round(x0), crispAxisCoord(y, lw));
    ctx.lineTo(Math.round(x1), crispAxisCoord(y, lw));
    ctx.stroke();
    ctx.restore();
  }

  function strokeCrispVLine(ctx, x, y0, y1, color, lineWidthPx) {
    const lw = Math.max(1, lineWidthPx);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(crispAxisCoord(x, lw), Math.round(y0));
    ctx.lineTo(crispAxisCoord(x, lw), Math.round(y1));
    ctx.stroke();
    ctx.restore();
  }

  function strokeCrispRect(ctx, x, y, w, h, color, lineWidthPx) {
    const lw = Math.max(1, lineWidthPx);
    const inset = lw / 2;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'miter';
    ctx.strokeRect(
      x + inset,
      y + inset,
      Math.max(0, w - lw),
      Math.max(0, h - lw)
    );
    ctx.restore();
  }

  function applyDigitalScanFringe(octx, ring, cfg) {
    if (!ring?.length) return;
    if (!digitalExportPolishEnabled(cfg)) {
      const fray = domToExportPx(cfg, cfg.handCutEdgeFrayPx);
      if (fray <= 0) return;
      octx.save();
      octx.strokeStyle = 'rgba(255, 248, 236, 0.38)';
      octx.lineWidth = Math.max(1, fray * 1.8);
      octx.globalCompositeOperation = 'source-over';
      tracePolygon(octx, ring);
      octx.stroke();
      octx.restore();
      return;
    }

    const fringe = domToExportPx(cfg, cfg.digitalExportScanFringeDomPx ?? 1.25);
    if (fringe <= 0) return;

    const cx = ring.reduce((sum, point) => sum + point.x, 0) / ring.length;
    const cy = ring.reduce((sum, point) => sum + point.y, 0) / ring.length;
    const insetScale = Math.max(0.985, 1 - fringe / 128);
    const innerRing = ring.map((point) => ({
      x: cx + (point.x - cx) * insetScale,
      y: cy + (point.y - cy) * insetScale
    }));

    octx.save();
    octx.strokeStyle = cfg.digitalExportScanFringeDark || 'rgba(32, 24, 16, 0.18)';
    octx.lineWidth = Math.max(1, fringe * 1.5);
    octx.lineJoin = 'round';
    octx.globalCompositeOperation = 'multiply';
    tracePolygon(octx, innerRing);
    octx.stroke();
    octx.restore();

    octx.save();
    octx.strokeStyle = cfg.digitalExportScanFringeLight || 'rgba(255, 252, 245, 0.44)';
    octx.lineWidth = Math.max(1, fringe * 1.35);
    octx.lineJoin = 'round';
    octx.globalCompositeOperation = 'source-over';
    tracePolygon(octx, ring);
    octx.stroke();
    octx.restore();
  }

  function imageSrcUsesCrossOrigin(src) {
    const s = String(src || '').trim();
    if (!s || /^data:/i.test(s) || /^blob:/i.test(s)) return false;
    try {
      const base = typeof location !== 'undefined' ? location.href : 'http://127.0.0.1/';
      const u = new URL(s, base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      if (typeof location !== 'undefined') {
        const page = new URL(location.href);
        if (u.origin === page.origin) return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearPaperPatternCache() {
    patternCache.paper = null;
    delete patternPromises.paper;
  }

  function canvasToDataUrl(canvas, quality = 0.92) {
    if (!canvas) return null;
    try {
      return canvas.toDataURL('image/png', quality);
    } catch (err) {
      err.__odqCanvasExport = true;
      throw err;
    }
  }

  function loadPatternImage(key, src) {
    if (patternCache[key]) return Promise.resolve(patternCache[key]);
    if (patternPromises[key]) return patternPromises[key];
    if (typeof Image === 'undefined') return Promise.resolve(null);
    patternPromises[key] = new Promise((resolve) => {
      const img = new Image();
      if (imageSrcUsesCrossOrigin(src)) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        patternCache[key] = img;
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
    return patternPromises[key];
  }

  /** Preload SVG grains + optional paper JPEG (call before render). */
  async function ensureClippingSurfaceAssets(cfg = DEFAULTS) {
    const jobs = [
      loadPatternImage('card', CARD_GRAIN_SVG),
      loadPatternImage('viewport', VIEWPORT_GRAIN_SVG)
    ];
    if (cfg.paperTextureUrl) {
      jobs.push(loadPatternImage('paper', cfg.paperTextureUrl));
    }
    await Promise.allSettled(jobs);
  }

  function drawPaperBase(ctx, w, h, cfg) {
    ctx.fillStyle = cfg.paper || '#f6f4f1';
    ctx.fillRect(0, 0, w, h);

    const g1 = ctx.createLinearGradient(0, 0, w, h * 0.52);
    g1.addColorStop(0, 'rgba(68, 64, 60, 0.028)');
    g1.addColorStop(1, 'rgba(68, 64, 60, 0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w, h);

    const g2 = ctx.createLinearGradient(w, 0, 0, h * 0.54);
    g2.addColorStop(0, 'rgba(58, 56, 54, 0.022)');
    g2.addColorStop(1, 'rgba(58, 56, 54, 0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);

    const g3 = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, w * 0.45);
    g3.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    g3.addColorStop(0.58, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, w, h);

    const paperImg = patternCache.paper;
    if (paperImg?.naturalWidth) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const scale = 1.18;
      const sw = w * scale;
      const sh = h * scale;
      ctx.drawImage(paperImg, (w - sw) / 2, (h - sh) / 2, sw, sh);
      ctx.restore();
    }
  }

  function drawCardGrain(ctx, w, h, cfg) {
    const img = patternCache.card;
    if (!img?.naturalWidth) return;
    const tilePx = domToExportPx(cfg, cfg.cardGrainTileDomPx);
    applyMultiplyLayer(ctx, w, h, cfg.cardGrainOpacity, (lctx) => {
      tilePatternImage(lctx, w, h, img, tilePx);
    });
  }

  function resolveHalftoneMetrics(cfg, overrides = {}) {
    const dotOffset = overrides.dotOffsetDomPx ?? cfg.halftoneDotOffsetDomPx;
    return {
      pitch: domToExportPx(cfg, overrides.pitchDomPx ?? cfg.halftonePitchDomPx),
      ox: domToExportPx(cfg, dotOffset.x),
      oy: domToExportPx(cfg, dotOffset.y),
      opacity: overrides.opacity ?? cfg.halftoneOpacity
    };
  }

  function drawViewportHalftone(ctx, w, h, cfg, overrides = {}) {
    const { pitch, ox, oy, opacity } = resolveHalftoneMetrics(cfg, overrides);
    const tW = Math.max(2, Math.ceil(pitch));
    applyMultiplyLayer(ctx, w, h, opacity, (lctx) => {
      const tile = document.createElement('canvas');
      tile.width = tW;
      tile.height = tW;
      const tctx = tile.getContext('2d');
      if (!tctx) return;
      tctx.fillStyle = 'rgba(32, 24, 18, 0.95)';
      tctx.beginPath();
      tctx.arc(ox + 0.5, oy + 0.5, 0.5, 0, Math.PI * 2);
      tctx.fill();
      const pattern = lctx.createPattern(tile, 'repeat');
      if (!pattern) return;
      lctx.fillStyle = pattern;
      lctx.fillRect(0, 0, w, h);
    });
  }

  function drawCenterBandHalftone(ctx, spread, cfg) {
    const x = spread.centerX;
    const y = spread.bandTop;
    const w = spread.centerColW;
    const h = spread.bandH;
    if (!w || !h || h < 1) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    drawViewportHalftone(ctx, w, h, cfg, {
      pitchDomPx: cfg.digitalExportCenterHalftonePitchDomPx ?? 2.65,
      opacity: cfg.digitalExportCenterHalftoneOpacity ?? 0.102,
      dotOffsetDomPx:
        cfg.digitalExportCenterHalftoneDotOffsetDomPx ??
        DEFAULTS.digitalExportCenterHalftoneDotOffsetDomPx
    });
    ctx.restore();
  }

  function drawViewportGrain(ctx, w, h, cfg) {
    const img = patternCache.viewport;
    if (!img?.naturalWidth) return;
    const tilePx = domToExportPx(cfg, cfg.viewportGrainTileDomPx);
    applyMultiplyLayer(ctx, w, h, cfg.viewportGrainOpacity, (lctx) => {
      tilePatternImage(lctx, w, h, img, tilePx);
    });
  }

  /** DOM viewport stack: halftone + turbulence grain over type (multiply). */
  function drawViewportTextureOverText(ctx, w, h, cfg, spread = null) {
    const useCenterHalftone =
      digitalExportPolishEnabled(cfg) &&
      cfg.digitalExportCenterHalftone !== false &&
      spread?.centerColW > 0 &&
      spread?.bandH > 0;

    if (useCenterHalftone) {
      drawCenterBandHalftone(ctx, spread, cfg);
    } else {
      drawViewportHalftone(ctx, w, h, cfg);
    }
    drawViewportGrain(ctx, w, h, cfg);
  }

  /** Active typography for the current render (see `withClippingTypography`). */
  let typography = { ...DEFAULTS };

  let _clippingFontsReadyPromise = null;

  /** DOM `--quilt-clipping-body-size` in px, scaled for PNG width (1080 ≈ sheet on device). */
  function clippingBodyPxAtExportWidth(
    exportW = DEFAULTS.width,
    { rootPx = CLIPPING_DOM_ROOT_PX, viewportW = CLIPPING_DOM_VIEWPORT_W } = {}
  ) {
    const rem78 = 0.78 * rootPx;
    const vw235 = (2.35 / 100) * viewportW;
    const rem102 = 1.02 * rootPx;
    const domPx = Math.min(rem102, Math.max(rem78, vw235));
    return Math.max(8, Math.round((exportW / CLIPPING_DOM_SHEET_W) * domPx));
  }

  function withClippingTypography(cfg = {}) {
    const merged = { ...DEFAULTS, ...cfg };
    const width = resolveClippingExportWidth(merged);
    const bodyPx =
      typeof merged.bodyPx === 'number' && merged.bodyPx > 0
        ? merged.bodyPx
        : clippingBodyPxAtExportWidth(width);
    return {
      ...merged,
      width,
      fontFamily: merged.fontFamily || CLIPPING_FONT_FAMILY,
      bodyPx,
      centerBodyPx:
        typeof merged.centerBodyPx === 'number' && merged.centerBodyPx > 0
          ? merged.centerBodyPx
          : bodyPx
    };
  }

  /** Offscreen multiply layer (matches CSS opacity + mix-blend-mode: multiply). */
  function applyMultiplyLayer(ctx, w, h, layerOpacity, paintLayer) {
    if (!layerOpacity || !paintLayer) return;
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    const lctx = layer.getContext('2d');
    if (!lctx) return;
    paintLayer(lctx, w, h);
    ctx.save();
    ctx.globalAlpha = layerOpacity;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }

  function tilePatternImage(lctx, w, h, img, tilePx) {
    const tw = Math.max(2, Math.round(tilePx));
    const th = tw;
    for (let y = 0; y < h + th; y += th) {
      for (let x = 0; x < w + tw; x += tw) {
        lctx.drawImage(img, x, y, tw, th);
      }
    }
  }

  /** First family in a CSS `font-family` stack (for `document.fonts.load`). */
  function primaryClippingFontName(fontFamily) {
    const stack = String(fontFamily || CLIPPING_FONT_FAMILY).trim();
    const quoted = stack.match(/["']([^"']+)["']/);
    if (quoted) return quoted[1];
    const first = stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
    return first || 'DM Sans';
  }

  async function ensureNewspaperClippingFonts(pxValues = [], fontFamily = CLIPPING_FONT_FAMILY) {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    const sizes = [
      ...new Set(
        pxValues
          .map((n) => Math.ceil(Number(n) || 0))
          .filter((n) => n > 0)
      )
    ];
    if (!sizes.length) sizes.push(clippingBodyPxAtExportWidth(DEFAULTS.width));
    const face = primaryClippingFontName(fontFamily);
    const key = `${face}|${sizes.join(',')}`;
    if (_clippingFontsReadyPromise?.key === key) return _clippingFontsReadyPromise.promise;
    const loads = sizes.flatMap((size) => [
      document.fonts.load(`400 ${size}px "${face}"`),
      document.fonts.load(`italic 400 ${size}px "${face}"`),
      document.fonts.load(`700 ${size}px "${face}"`)
    ]);
    const promise = Promise.allSettled([...loads, document.fonts.ready]).then(() => {});
    _clippingFontsReadyPromise = { key, promise };
    return promise;
  }

  function normalizeText(s) {
    return String(s || '')
      .replace(/\s*\r?\n+\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*\/\s*/g, ' / ')
      .trim();
  }

  function stripLeadDash(s) {
    return String(s || '')
      .trim()
      .replace(/^[—–\-]\s*/, '');
  }

  function stripTrailDash(s) {
    return String(s || '')
      .trim()
      .replace(/\s*[—–\-]\s*$/g, '');
  }

  /** Notion/Firestore `keyword` is canonical; layout-B emphasis is styles-only fallback. */
  function keywordRawForQuote(q) {
    const fromCatalog = String(q?.keyword ?? q?.keywordSnapshot ?? '').trim();
    if (fromCatalog) return fromCatalog;
    let stored =
      q?.layoutBKeywordEmphasis ??
      q?.layoutBKeywordEmphasisStory ??
      q?.keywordEmphasis ??
      q?.keyword_emphasis ??
      null;
    if (typeof stored === 'string') {
      try {
        stored = JSON.parse(stored);
      } catch {
        return stored.trim();
      }
    }
    if (stored && typeof stored === 'object' && Array.isArray(stored.keywords) && stored.keywords.length) {
      return stored.keywords.map((k) => String(k).trim()).filter(Boolean).join(', ');
    }
    return '';
  }

  function keywordPayloadForQuote(q, dateKey = '') {
    const text = normalizeText(q?.text ?? q?.body);
    if (!text) return null;
    const qke = QKE();
    const lbke = LBKE();
    if (!qke || !lbke) return null;

    const keywordRaw = keywordRawForQuote(q);
    if (!keywordRaw) return null;

    const keywords = qke.parseEmphasisWordsInput
      ? qke.parseEmphasisWordsInput(keywordRaw, text)
      : keywordRaw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!keywords.length) return null;

    const dk = String(dateKey || q?.dateKey || '').trim();
    const styles = clippingKeywordStylesForDateKey(dk);

    return lbke.normalizeLayoutBKeywordEmphasisPayload({ keywords, styles });
  }

  /** Side columns: one `quote author.` block (DOM clipping); repeats join with a single space. */
  function neighborClippingBlock(q) {
    const text = stripTrailDash(q?.text);
    if (!text) return '';
    const author = stripLeadDash(q?.author);
    return author ? `${text} ${author}.` : `${text}.`;
  }

  function runWithClippingStyle(text, styleName) {
    const lbke = LBKE();
    const flags = lbke?.emphasisFlagsFromStyles?.([styleName]) || {
      bold: false,
      italic: false,
      underline: false,
      caps: false
    };
    const display = lbke?.displayTextForRun?.(text, flags) ?? text;
    return {
      text: display,
      bold: !!flags.bold,
      italic: !!flags.italic,
      underline: !!flags.underline,
      caps: !!flags.caps
    };
  }

  function plainRunsForQuote(q, { neighbor = false, dateKey = '' } = {}) {
    const text = stripTrailDash(q?.text);
    if (!text) return [];
    const author = stripLeadDash(q?.author);
    if (neighbor) {
      const block = neighborClippingBlock(q);
      if (!block) return [];
      return [{ text: block, bold: false, italic: false, underline: false, caps: false }];
    }

    const dk = String(dateKey || q?.dateKey || '').trim();
    const payload = keywordPayloadForQuote({ ...q, text }, dateKey);
    const lbke = LBKE();
    let runs;
    if (payload?.keywords?.length && lbke?.buildTextRunsForLine) {
      runs = lbke.buildTextRunsForLine(text, payload.keywords, payload.styles);
      if (!lbke.lineHasEmphasisRuns?.(runs)) {
        runs = [{ text, bold: false, italic: false, underline: false, caps: false }];
      }
    } else {
      runs = [{ text, bold: false, italic: false, underline: false, caps: false }];
    }

    if (author) {
      const authorLine = author.replace(/ /g, '\u00a0');
      const keywordStyles = payload?.styles || clippingKeywordStylesForDateKey(dk);
      const speakerStyle = clippingSpeakerNameStyleForDateKey(dk, keywordStyles);
      runs.push({ text: ' \u2014 ', bold: false, italic: false, underline: false, caps: false });
      runs.push(runWithClippingStyle(authorLine, speakerStyle));
    }

    return runs;
  }

  function setFont(ctx, px, { bold = false, italic = false } = {}) {
    const weight = bold ? '700' : '400';
    const style = italic ? 'italic' : 'normal';
    const family = typography.fontFamily || CLIPPING_FONT_FAMILY;
    ctx.font = `${style} ${weight} ${px}px ${family}`;
    const trackPx = (typography.letterSpacingEm || 0) * px;
    if (trackPx > 0 && 'letterSpacing' in ctx) ctx.letterSpacing = `${trackPx}px`;
    else if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  function withInkShadow(ctx, color) {
    const blur = typography.inkTextShadowPx || 0;
    if (blur > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
  }

  function clearInkShadow(ctx) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  function measureRunsWidth(ctx, runs, px) {
    let w = 0;
    for (const run of runs) {
      setFont(ctx, px, run);
      w += ctx.measureText(run.text || '').width;
    }
    return w;
  }

  function pushRunPart(line, lineW, run, part, partW) {
    line.push({
      text: part,
      bold: !!run.bold,
      italic: !!run.italic,
      underline: !!run.underline,
      caps: !!run.caps
    });
    return { line, lineW: lineW + partW };
  }

  function appendPartToLines(ctx, lines, line, lineW, run, part, maxWidth, px) {
    if (!part) return { line, lineW };
    setFont(ctx, px, run);
    if (/^\s+$/.test(part)) {
      if (!line.length) return { line, lineW };
      const partW = ctx.measureText(part).width;
      if (lineW + partW <= maxWidth) return pushRunPart(line, lineW, run, part, partW);
      lines.push(line);
      return { line: [], lineW: 0 };
    }

    let partW = ctx.measureText(part).width;
    if (partW <= maxWidth) {
      if (line.length && lineW + partW > maxWidth) {
        lines.push(line);
        line = [];
        lineW = 0;
      }
      return pushRunPart(line, lineW, run, part, partW);
    }

    let chunk = '';
    for (const ch of part) {
      const next = chunk + ch;
      const nextW = ctx.measureText(next).width;
      if (chunk && lineW + nextW > maxWidth) {
        const flushed = pushRunPart(line, lineW, run, chunk, ctx.measureText(chunk).width);
        lines.push(flushed.line);
        line = [];
        lineW = 0;
        chunk = ch;
      } else {
        chunk = next;
      }
    }
    if (chunk) {
      partW = ctx.measureText(chunk).width;
      if (line.length && lineW + partW > maxWidth) {
        lines.push(line);
        line = [];
        lineW = 0;
      }
      const placed = pushRunPart(line, lineW, run, chunk, partW);
      line = placed.line;
      lineW = placed.lineW;
    }
    return { line, lineW };
  }

  function wrapRuns(ctx, runs, maxWidth, px) {
    const lines = [];
    let line = [];
    let lineW = 0;
    for (const run of runs) {
      const parts = String(run.text || '').split(/(\s+)/).filter((p) => p.length);
      for (const part of parts) {
        const next = appendPartToLines(ctx, lines, line, lineW, run, part, maxWidth, px);
        line = next.line;
        lineW = next.lineW;
      }
    }
    if (line.length) lines.push(line);
    return lines.length ? lines : [[{ text: '', bold: false, italic: false, underline: false, caps: false }]];
  }

  function layoutColumn(ctx, runs, colWidth, px, padX = DEFAULTS.spreadPadX) {
    const innerW = Math.max(1, colWidth - padX * 2);
    const wrapped = wrapRuns(ctx, runs, innerW, px);
    const lineStep = px * (typography.lineHeight || DEFAULTS.lineHeight);
    return { wrapped, textH: wrapped.length * lineStep, lineStep, innerW, padX };
  }

  const SPACE_RUN = { text: ' ', bold: false, italic: false, underline: false, caps: false };

  /** Repeat neighbor block with only a space between copies (no embedded duplicate in one string). */
  function runsForFilledNeighborColumn(mctx, q, colW, sidePx, targetMinH, padX) {
    const block = neighborClippingBlock(q);
    if (!block) return [];
    const plainRun = {
      text: block,
      bold: false,
      italic: false,
      underline: false,
      caps: false
    };
    let full = block;
    let layout = layoutColumn(mctx, [{ ...plainRun, text: full }], colW, sidePx, padX);
    let guard = 0;
    while (layout.textH < targetMinH && guard < 16) {
      full += ` ${block}`;
      layout = layoutColumn(mctx, [{ ...plainRun, text: full }], colW, sidePx, padX);
      guard += 1;
    }
    return [{ ...plainRun, text: full }];
  }

  function tokenizeLineIntoWords(runs) {
    const words = [];
    for (const run of runs) {
      const parts = String(run.text || '').split(/(\s+)/).filter((p) => p.length);
      for (const part of parts) {
        if (/^\s+$/.test(part)) continue;
        words.push({
          text: part,
          bold: !!run.bold,
          italic: !!run.italic,
          underline: !!run.underline,
          caps: !!run.caps
        });
      }
    }
    return words;
  }

  const JUSTIFY_PUNCT_ONLY = /^[.,;:!?…'"""''—–\-]+$/;

  /** Keep `.` / `—` on the word before them so justify does not stretch before punctuation. */
  function gluePunctuationForJustify(words) {
    if (!words.length) return words;
    const out = [{ ...words[0] }];
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      const trimmed = String(w.text || '').trim();
      if (!trimmed || !JUSTIFY_PUNCT_ONLY.test(trimmed)) {
        out.push({ ...w });
        continue;
      }
      const prev = out[out.length - 1];
      const needsSpace =
        /^[—–]/.test(trimmed) && prev.text.length && !/\s$/.test(prev.text);
      prev.text += (needsSpace ? ' ' : '') + trimmed;
    }
    return out;
  }

  function tokenizeLineForJustify(runs) {
    return gluePunctuationForJustify(tokenizeLineIntoWords(runs));
  }

  /** Inter-word gap if this line were fully justified (0 when fewer than two words). */
  function measureJustifyLineGap(ctx, runs, px, colWidth) {
    const words = tokenizeLineForJustify(runs);
    if (words.length < 2) return 0;
    const wordWidths = words.map((w) => {
      setFont(ctx, px, w);
      return ctx.measureText(w.text).width;
    });
    const totalW = wordWidths.reduce((a, b) => a + b, 0);
    const wordSpacingPx = (typography.wordSpacingEm || 0) * px;
    const extraSpacing = wordSpacingPx * (words.length - 1);
    return Math.max(0, (colWidth - totalW - extraSpacing) / (words.length - 1));
  }

  /** Newspaper full justify: flush left and right via word gaps. */
  function drawJustifiedLine(ctx, runs, x, y, px, color, colWidth) {
    const words = tokenizeLineForJustify(runs);
    if (!words.length) return;

    const wordWidths = words.map((w) => {
      setFont(ctx, px, w);
      return ctx.measureText(w.text).width;
    });
    const totalW = wordWidths.reduce((a, b) => a + b, 0);

    if (words.length === 1) {
      const w = words[0];
      setFont(ctx, px, w);
      ctx.fillStyle = w.bold ? typography.inkStrong : color;
      withInkShadow(ctx, ctx.fillStyle);
      ctx.fillText(w.text, x, y);
      clearInkShadow(ctx);
      if (w.underline) {
        const rw = wordWidths[0];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + px * 0.12);
        ctx.lineTo(x + rw, y + px * 0.12);
        ctx.stroke();
      }
      return;
    }

    const wordSpacingPx = (typography.wordSpacingEm || 0) * px;
    const extraSpacing = wordSpacingPx * (words.length - 1);
    const gap = Math.max(0, (colWidth - totalW - extraSpacing) / (words.length - 1));
    let cx = x;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      setFont(ctx, px, w);
      ctx.fillStyle = w.bold ? typography.inkStrong : color;
      withInkShadow(ctx, ctx.fillStyle);
      ctx.fillText(w.text, cx, y);
      clearInkShadow(ctx);
      if (w.underline) {
        const rw = wordWidths[i];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, y + px * 0.12);
        ctx.lineTo(cx + rw, y + px * 0.12);
        ctx.stroke();
      }
      cx += wordWidths[i] + gap + (i < words.length - 1 ? wordSpacingPx : 0);
    }
  }

  function drawRunsLine(ctx, runs, x, y, px, color, align, colWidth) {
    if (align === 'justify') {
      drawJustifiedLine(ctx, runs, x, y, px, color, colWidth);
      return;
    }

    const totalW = measureRunsWidth(ctx, runs, px);
    let startX = x;
    if (align === 'right') startX = x + colWidth - totalW;
    else if (align === 'center') startX = x + (colWidth - totalW) / 2;

    let cx = startX;
    for (const run of runs) {
      setFont(ctx, px, run);
      ctx.fillStyle = run.bold ? typography.inkStrong : color;
      withInkShadow(ctx, ctx.fillStyle);
      ctx.fillText(run.text, cx, y);
      clearInkShadow(ctx);
      if (run.underline) {
        const rw = ctx.measureText(run.text).width;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, y + px * 0.12);
        ctx.lineTo(cx + rw, y + px * 0.12);
        ctx.stroke();
      }
      cx += ctx.measureText(run.text).width;
    }
  }

  function drawTextBlock(ctx, layout, colX, colW, startY, align, color, px) {
    const innerX = colX + layout.padX;
    let cy = startY;
    for (const line of layout.wrapped) {
      drawRunsLine(ctx, line, innerX, cy, px, color, align, layout.innerW);
      cy += layout.lineStep;
    }
    return layout.textH;
  }

  function moodSideFrameMetrics(cfg) {
    const border = domToExportPx(
      cfg,
      cfg.moodAdBorderDomPx ?? cfg.moodFrameBorderDomPx ?? DEFAULTS.moodAdBorderDomPx
    );
    const innerPad = domToExportPx(
      cfg,
      cfg.moodAdInnerPadDomPx ?? cfg.moodFrameInnerPadDomPx ?? DEFAULTS.moodAdInnerPadDomPx
    );
    return { border, innerPad, padX: border + innerPad };
  }

  function moodSideBlockHeight(_layout, cfg, spreadH = 0) {
    if (spreadH > 0) return spreadH;
    const { border, innerPad } = moodSideFrameMetrics(cfg);
    return (_layout?.textH || 0) + innerPad * 2 + border * 2;
  }

  function moodFrameInk(cfg) {
    if (cfg.moodFrameInk) return cfg.moodFrameInk;
    return cfg.moodArrowBarColor ?? DEFAULTS.moodArrowBarColor;
  }

  /** Classified-ad column: full-bleed straight border; copy centered in the frame. */
  function drawMoodAdSideBlock(ctx, layout, colX, colW, spreadH, cfg) {
    const { border, innerPad } = moodSideFrameMetrics(cfg);
    const ink = moodFrameInk(cfg);
    const frameH = Math.max(1, spreadH);
    const half = border / 2;

    ctx.save();
    if (digitalExportPolishEnabled(cfg)) {
      strokeCrispRect(ctx, colX, 0, colW, frameH, ink, border);
    } else {
      ctx.strokeStyle = ink;
      ctx.lineWidth = border;
      ctx.lineJoin = 'miter';
      ctx.strokeRect(colX + half, half, colW - border, frameH - border);
    }
    ctx.restore();

    const px = cfg.bodyPx;
    const lineCount = layout.wrapped.length;
    const lineStep = layout.lineStep;
    const ascent = px * 0.78;
    const descent = px * 0.24;
    const textVisualH = ascent + Math.max(0, lineCount - 1) * lineStep + descent;
    const innerH = Math.max(1, frameH - border * 2 - innerPad * 2);
    const textStartY = border + innerPad + Math.max(0, (innerH - textVisualH) / 2) + ascent;

    drawTextBlock(ctx, layout, colX, colW, textStartY, 'center', cfg.inkCenter, px);
  }

  /** Runs for the first N words (preserves bold/italic from keyword emphasis). */
  function extractFirstWordsRuns(runs, wordCount) {
    const out = [];
    let count = 0;
    for (const run of runs) {
      const parts = String(run.text || '')
        .split(/(\s+)/)
        .filter((p) => p.length);
      for (const part of parts) {
        if (/^\s+$/.test(part)) continue;
        if (count >= wordCount) return out;
        if (count > 0) out.push({ ...SPACE_RUN });
        out.push({
          text: part,
          bold: !!run.bold,
          italic: !!run.italic,
          underline: !!run.underline,
          caps: !!run.caps
        });
        count += 1;
      }
    }
    return out;
  }

  function firstWrappedLineText(lines) {
    return (lines[0] || [])
      .map((r) => r.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Per-quote first-line word count (Notion `first_line_count` on catalog doc).
   * Falls back to cfg.firstLineCount (default 3).
   */
  function resolveFirstLineCount(quote, cfg) {
    const raw =
      quote?.firstLineCount ??
      quote?.first_line_count ??
      quote?.firstLineCountSnapshot ??
      quote?.first_line_count_snapshot ??
      quote?.centerFirstLineMaxWords ??
      quote?.center_first_line_max_words ??
      null;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return Math.max(1, Math.min(12, Math.round(n)));
    }
    const fallback = Number(cfg?.firstLineCount ?? cfg?.centerFirstLineMaxWords);
    return Math.max(1, Math.min(12, Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 3));
  }

  /** Center column: widest inner width where line 1 is still exactly the first N words. */
  function fitCenterColumnWidth(mctx, runs, px, padX, cfg, firstLineMaxWords) {
    setFont(mctx, px);
    const words = runs
      .map((r) => r.text)
      .join('')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const maxWords =
      Number.isFinite(firstLineMaxWords) && firstLineMaxWords > 0
        ? firstLineMaxWords
        : resolveFirstLineCount(null, cfg);
    const cap = Math.max(1, Math.min(maxWords, words.length));
    const targetPhrase = words.slice(0, cap).join(' ');
    const firstRuns = extractFirstWordsRuns(runs, cap);
    const maxInner = Math.max(
      Math.ceil(measureRunsWidth(mctx, firstRuns, px)) + 2,
      cfg.centerColMaxW > 0 ? cfg.centerColMaxW - padX * 2 : 2000
    );

    let innerLo = Math.max(48, Math.ceil(measureRunsWidth(mctx, firstRuns, px)));
    while (innerLo <= maxInner) {
      const first = firstWrappedLineText(wrapRuns(mctx, runs, innerLo, px));
      if (first === targetPhrase) break;
      innerLo += 1;
    }
    if (innerLo > maxInner) innerLo = maxInner;

    let innerHi = innerLo;
    let lo = innerLo;
    let hi = maxInner;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const first = firstWrappedLineText(wrapRuns(mctx, runs, mid, px));
      if (first === targetPhrase) {
        innerHi = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    let colW = Math.ceil(innerHi + padX * 2);
    if (cfg.centerColMinW > 0) colW = Math.max(cfg.centerColMinW, colW);
    if (cfg.centerColMaxW > 0) colW = Math.min(cfg.centerColMaxW, colW);
    return colW;
  }

  /**
   * Step 1: full 3-column spread — wide side columns, narrow center (reference mockup file 1).
   */
  function renderFullSpread(mctx, opts, cfgIn) {
    typography = withClippingTypography(cfgIn);
    const cfg = typography;
    const W = Math.round(cfg.width);
    const sidePx = cfg.bodyPx;
    const centerPx = cfg.centerBodyPx;
    const ruleInk = exportRuleInk(cfg);
    const ruleLW = exportRuleThickness(cfg);
    const ruleH = ruleLW;

    const clipDateKey = String(opts.dateKey || opts.today?.dateKey || '').trim();
    const todayRuns = plainRunsForQuote(opts.today, { neighbor: false, dateKey: clipDateKey });
    const centerFirstLineWords = resolveFirstLineCount(opts.today, cfg);
    const centerColW = fitCenterColumnWidth(
      mctx,
      todayRuns,
      centerPx,
      cfg.spreadPadX,
      cfg,
      centerFirstLineWords
    );
    const sideColW = Math.floor((W - centerColW) / 2);
    const centerX = sideColW;

    const spreadContentH = Math.ceil(cfg.spreadPadY * 2 + 420);
    const moodSpread =
      normalizeText(opts.goodDay) || normalizeText(opts.roughDay) || opts.sideMode === 'mood';
    const layouts = {
      left: null,
      today: layoutColumn(mctx, todayRuns, centerColW, centerPx),
      right: null
    };
    const textBetweenRulesPad = Math.max(cfg.ruleTextGap, Math.round(centerPx * 0.35));
    const textBetweenRulesH = layouts.today.textH + textBetweenRulesPad * 2;
    const centerBlockH =
      cfg.ruleGap + ruleH + textBetweenRulesH + ruleH + cfg.ruleGap;

    const sideTargetH = spreadContentH - cfg.spreadPadY * 2;
    const moodFramePad = moodSpread ? moodSideFrameMetrics(cfg).padX : cfg.spreadPadX;
    if (moodSpread) {
      const goodDayText = normalizeText(opts.goodDay);
      const roughDayText = normalizeText(opts.roughDay);
      if (goodDayText) {
        layouts.left = layoutColumn(
          mctx,
          plainRunsFromText(goodDayText),
          sideColW,
          sidePx,
          moodFramePad
        );
      }
      if (roughDayText) {
        layouts.right = layoutColumn(
          mctx,
          plainRunsFromText(roughDayText),
          sideColW,
          sidePx,
          moodFramePad
        );
      }
    } else {
      if (opts.yesterday && normalizeText(opts.yesterday.text)) {
        const yRuns = runsForFilledNeighborColumn(
          mctx,
          opts.yesterday,
          sideColW,
          sidePx,
          sideTargetH,
          cfg.spreadPadX
        );
        layouts.left = layoutColumn(mctx, yRuns, sideColW, sidePx);
      }
      if (opts.tomorrow && normalizeText(opts.tomorrow.text)) {
        const tRuns = runsForFilledNeighborColumn(
          mctx,
          opts.tomorrow,
          sideColW,
          sidePx,
          sideTargetH,
          cfg.spreadPadX
        );
        layouts.right = layoutColumn(mctx, tRuns, sideColW, sidePx);
      }
    }

    const sideHeights = [layouts.left?.textH || 0, layouts.right?.textH || 0];
    const spreadH = moodSpread
      ? Math.ceil(centerBlockH)
      : Math.ceil(
          cfg.spreadPadY * 2 +
            Math.max(centerBlockH, ...sideHeights, spreadContentH - cfg.spreadPadY * 2, 0)
        );
    const contentH = spreadH - cfg.spreadPadY * 2;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = spreadH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    drawPaperBase(ctx, W, spreadH, cfg);
    drawCardGrain(ctx, W, spreadH, cfg);

    const colXs = [0, centerX, centerX + centerColW];
    const dividerX1 = centerX;
    const dividerX2 = centerX + centerColW;

    if (!moodSpread) {
      if (digitalExportPolishEnabled(cfg)) {
        strokeCrispVLine(ctx, dividerX1, 0, spreadH, ruleInk, ruleLW);
        strokeCrispVLine(ctx, dividerX2, 0, spreadH, ruleInk, ruleLW);
      } else {
        ctx.strokeStyle = ruleInk;
        ctx.lineWidth = ruleLW;
        ctx.beginPath();
        ctx.moveTo(dividerX1, 0);
        ctx.lineTo(dividerX1, spreadH);
        ctx.moveTo(dividerX2, 0);
        ctx.lineTo(dividerX2, spreadH);
        ctx.stroke();
      }
    }

    const centerBlockTop = Math.max(0, (spreadH - centerBlockH) / 2);
    const ruleY1 = centerBlockTop + cfg.ruleGap;
    const textZoneTop = ruleY1 + ruleH;
    const ruleY2 = textZoneTop + textBetweenRulesH;
    const centerLineCount = layouts.today.wrapped.length;
    const centerLineStep = layouts.today.lineStep;
    const centerAscent = centerPx * 0.78;
    const centerDescent = centerPx * 0.24;
    const centerVisualH =
      centerAscent + Math.max(0, centerLineCount - 1) * centerLineStep + centerDescent;
    const textY = textZoneTop + Math.max(0, (textBetweenRulesH - centerVisualH) / 2) + centerAscent;
    const ruleSpanW = Math.max(8, Math.round(centerColW * cfg.centerRuleSpanRatio));
    const ruleX0 = colXs[1] + (centerColW - ruleSpanW) / 2;

    if (layouts.left) {
      if (moodSpread) {
        drawMoodAdSideBlock(ctx, layouts.left, colXs[0], sideColW, spreadH, cfg);
      } else {
        const sideY = Math.max(0, (spreadH - layouts.left.textH) / 2);
        drawTextBlock(
          ctx,
          layouts.left,
          colXs[0],
          sideColW,
          sideY,
          'right',
          cfg.inkSide,
          sidePx
        );
      }
    }

    let cy = textY;
    const centerLines = layouts.today.wrapped;
    const lastLineLeftGapMax = domToExportPx(
      cfg,
      cfg.justifyLastLineLeftMinGapDomPx ?? DEFAULTS.justifyLastLineLeftMinGapDomPx
    );
    for (let i = 0; i < centerLines.length; i++) {
      let lineAlign = 'justify';
      if (i === centerLines.length - 1) {
        const gap = measureJustifyLineGap(
          ctx,
          centerLines[i],
          centerPx,
          layouts.today.innerW
        );
        if (gap > lastLineLeftGapMax) lineAlign = 'left';
      }
      drawRunsLine(
        ctx,
        centerLines[i],
        colXs[1] + layouts.today.padX,
        cy,
        centerPx,
        cfg.inkCenter,
        lineAlign,
        layouts.today.innerW
      );
      cy += layouts.today.lineStep;
    }

    if (layouts.right) {
      if (moodSpread) {
        drawMoodAdSideBlock(ctx, layouts.right, colXs[2], sideColW, spreadH, cfg);
      } else {
        const sideY = Math.max(0, (spreadH - layouts.right.textH) / 2);
        drawTextBlock(
          ctx,
          layouts.right,
          colXs[2],
          sideColW,
          sideY,
          'left',
          cfg.inkSide,
          sidePx
        );
      }
    }

    if (digitalExportPolishEnabled(cfg)) {
      strokeCrispHLine(ctx, ruleX0, ruleX0 + ruleSpanW, ruleY1, ruleInk, ruleLW);
      strokeCrispHLine(ctx, ruleX0, ruleX0 + ruleSpanW, ruleY2, ruleInk, ruleLW);
    } else {
      ctx.strokeStyle = ruleInk;
      ctx.lineWidth = ruleLW;
      ctx.beginPath();
      ctx.moveTo(ruleX0, ruleY1);
      ctx.lineTo(ruleX0 + ruleSpanW, ruleY1);
      ctx.moveTo(ruleX0, ruleY2);
      ctx.lineTo(ruleX0 + ruleSpanW, ruleY2);
      ctx.stroke();
    }

    const bandPad = Math.max(Math.round(cfg.ruleGap * 0.75), Math.round(centerPx * 0.1));
    const bandTop = Math.max(0, centerBlockTop - bandPad);
    const bandBottom = Math.min(spreadH, centerBlockTop + centerBlockH + bandPad);
    const bandH = bandBottom - bandTop;

    drawViewportTextureOverText(ctx, W, spreadH, cfg, {
      centerX,
      centerColW,
      bandTop,
      bandH
    });

    return {
      canvas,
      centerColW,
      sideColW,
      centerX,
      spreadH,
      bandTop,
      bandBottom,
      bandH
    };
  }

  function hashDateKeySeed(dateKey) {
    const s = String(dateKey || 'our-daily').trim();
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Clipping-only singles (canvas: bold / italic / underline / caps). */
  const CLIPPING_KEYWORD_STYLE_SINGLES = ['bold', 'italic', 'underline', 'caps'];

  /** Rare multi-style days (~1 in 8 quilt days). */
  const CLIPPING_KEYWORD_STYLE_COMBOS = [
    ['bold', 'italic'],
    ['bold', 'underline'],
    ['italic', 'underline']
  ];

  /** Stable per quilt day: usually one style; combo only when seed % 8 === 0. */
  function clippingKeywordStylesForDateKey(dateKey) {
    const dk = String(dateKey || '').trim();
    if (!dk) return ['bold'];
    const seed = hashDateKeySeed(dk);
    if (seed % 8 === 0) {
      const comboIdx = (seed >>> 8) % CLIPPING_KEYWORD_STYLE_COMBOS.length;
      return CLIPPING_KEYWORD_STYLE_COMBOS[comboIdx].slice();
    }
    const singleIdx = (seed >>> 8) % CLIPPING_KEYWORD_STYLE_SINGLES.length;
    return [CLIPPING_KEYWORD_STYLE_SINGLES[singleIdx]];
  }

  /** Stable per quilt day: one of bold/italic/underline/caps, never matching keyword styles. */
  function clippingSpeakerNameStyleForDateKey(dateKey, keywordStyles) {
    const blocked = new Set(
      (Array.isArray(keywordStyles) ? keywordStyles : [])
        .map((s) => String(s).trim().toLowerCase())
        .filter((s) => CLIPPING_KEYWORD_STYLE_SINGLES.includes(s))
    );
    let candidates = CLIPPING_KEYWORD_STYLE_SINGLES.filter((s) => !blocked.has(s));
    if (!candidates.length) candidates = CLIPPING_KEYWORD_STYLE_SINGLES.slice();
    const dk = String(dateKey || '').trim();
    if (!dk) return candidates[0] || 'italic';
    const seed = hashDateKeySeed(`${dk}#speaker-name`);
    return candidates[(seed >>> 12) % candidates.length];
  }

  function seededRandom(seed) {
    let s = seed >>> 0;
    return function next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Outward normal for edge point (away from rect center). */
  function outwardNormal(x, y, tx, ty, cx, cy) {
    const len = Math.hypot(tx, ty) || 1;
    let nx = -ty / len;
    let ny = tx / len;
    if ((x - cx) * nx + (y - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { nx, ny };
  }

  /** One scissor stroke along a segment (straight; optional mid kink + notch + outward tab). */
  function walkScissorStroke(ring, ax, ay, bx, by, opts) {
    const {
      rand,
      cx,
      cy,
      slip,
      kinkAmp,
      bite,
      outwardTab,
      twoCuts,
      topBottomTrim,
      isSide,
      sideInMax
    } = opts;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    const place = (t, perp, inward) => {
      const x = ax + ux * len * t;
      const y = ay + uy * len * t;
      const { nx, ny } = outwardNormal(x, y, dx, dy, cx, cy);
      let depth = perp + inward;
      if (topBottomTrim) depth -= topBottomTrim;
      if (isSide && depth < -sideInMax) depth = -sideInMax;
      ring.push({ x: x + nx * depth, y: y + ny * depth });
    };

    if (!ring.length) place(0, slip * (rand() - 0.5), 0);

    const stops = [];
    if (twoCuts) stops.push({ t: 0.34 + rand() * 0.32, kink: true });
    if (bite) {
      stops.push({ t: bite.t - bite.half, bite: false });
      stops.push({ t: bite.t, bite: true });
      stops.push({ t: bite.t + bite.half, bite: false });
    }
    if (outwardTab) {
      if (outwardTab.preBite) {
        stops.push({
          t: Math.max(0.06, outwardTab.t - outwardTab.half * 1.35),
          bite: true,
          depth: outwardTab.preBite.depth
        });
      }
      stops.push({ t: outwardTab.t - outwardTab.half, outward: false });
      stops.push({ t: outwardTab.t, outward: true, depth: outwardTab.depth });
      stops.push({ t: outwardTab.t + outwardTab.half, outward: false });
    }
    stops.push({ t: 1, kink: false, bite: false });
    stops.sort((a, b) => a.t - b.t);

    let lastT = 0;
    for (const stop of stops) {
      const t = Math.max(lastT, Math.min(1, stop.t));
      if (t - lastT < 0.015) continue;
      if (stop.bite) {
        const depth = stop.depth ?? bite?.depth ?? 0;
        place(t, slip * (rand() - 0.5), -depth);
      } else if (stop.outward) {
        const depth = stop.depth ?? outwardTab?.depth ?? 0;
        place(t, slip * (rand() - 0.5), depth);
      } else if (stop.kink) {
        place(t, slip * (rand() - 0.5) + kinkAmp * (rand() > 0.5 ? 1 : -1), 0);
      } else {
        place(t, slip * (rand() - 0.5), 0);
      }
      lastT = t;
    }
    if (lastT < 0.995) place(1, slip * (rand() - 0.5), 0);
  }

  /** Big-chop quarter-circle arc between two sides (no chamfer, no 90° vertex). */
  function walkHandCutCorner(ring, arcCx, arcCy, radius, angStart, angEnd, opts) {
    const { rand, cx, cy, slip, kinkAmp, sideInMax } = opts;
    const chops = 2 + (rand() < 0.55 ? 1 : 0);
    let px = arcCx + radius * Math.cos(angStart);
    let py = arcCy + radius * Math.sin(angStart);
    for (let i = 1; i <= chops; i++) {
      const t = i / chops;
      const ang = angStart + (angEnd - angStart) * t;
      const qx = arcCx + radius * Math.cos(ang);
      const qy = arcCy + radius * Math.sin(ang);
      walkScissorStroke(ring, px, py, qx, qy, {
        rand,
        cx,
        cy,
        slip,
        kinkAmp,
        bite: null,
        outwardTab: null,
        twoCuts: false,
        topBottomTrim: 0,
        isSide: false,
        sideInMax: sideInMax ?? 0
      });
      px = qx;
      py = qy;
    }
  }

  /**
   * Chamfered rect + scissor cuts: ~1 stroke per side (2 on long edges), 1–2 notches.
   */
  function buildHandCutPolygon(w, h, seed, cfg) {
    const rand = seededRandom(seed);
    const cx = w / 2;
    const cy = h / 2;
    const inset = domToExportPx(cfg, cfg.handCutMarginDomPx ?? 0.5);
    const chamferBase = domToExportPx(cfg, cfg.handCutCornerChamferDomPx ?? 12);
    const slip = domToExportPx(cfg, cfg.handCutMacroDomPx ?? 6) * 0.35;
    const kinkAmp = domToExportPx(cfg, cfg.handCutMacroDomPx ?? 6) * 0.55;
    const bitePrimary = domToExportPx(cfg, cfg.handCutBiteMaxDomPx ?? 12);
    const biteSecondary = domToExportPx(cfg, cfg.handCutSecondaryBiteDomPx ?? 7);
    const sideInMax = domToExportPx(cfg, cfg.handCutSideInwardMaxDomPx ?? 5.5);
    const topBottomTrim = domToExportPx(cfg, cfg.handCutTopBottomTrimDomPx ?? 6);

    const x0 = inset;
    const y0 = inset;
    const x1 = w - inset;
    const y1 = h - inset;
    const cfX = Math.min(chamferBase, (x1 - x0) * 0.14);
    const cfY = Math.min(chamferBase, (y1 - y0) * 0.14);

    const mainEdges = [0, 2, 4, 6];
    const notchCount = rand() < 0.38 ? 2 : 1;
    const shuffled = mainEdges.slice().sort(() => rand() - 0.5);
    const notchEdges = new Set(shuffled.slice(0, notchCount));
    const notchSpec = new Map();
    for (const idx of notchEdges) {
      const depth = idx === shuffled[0] ? bitePrimary : biteSecondary;
      notchSpec.set(idx, {
        t: 0.26 + rand() * 0.48,
        half: 0.04 + rand() * 0.045,
        depth: depth * (0.72 + rand() * 0.28)
      });
    }

    const segments = [
      { ax: x0 + cfX, ay: y0, bx: x1 - cfX, by: y0, edgeIdx: 0, isSide: false, long: true },
      { ax: x1 - cfX, ay: y0, bx: x1, by: y0 + cfY, edgeIdx: 1, chamfer: true },
      { ax: x1, ay: y0 + cfY, bx: x1, by: y1 - cfY, edgeIdx: 2, isSide: true, long: false },
      { ax: x1, ay: y1 - cfY, bx: x1 - cfX, by: y1, edgeIdx: 3, chamfer: true },
      { ax: x1 - cfX, ay: y1, bx: x0 + cfX, by: y1, edgeIdx: 4, isSide: false, long: true },
      { ax: x0 + cfX, ay: y1, bx: x0, by: y1 - cfY, edgeIdx: 5, chamfer: true },
      { ax: x0, ay: y1 - cfY, bx: x0, by: y0 + cfY, edgeIdx: 6, isSide: true, long: false },
      { ax: x0, ay: y0 + cfY, bx: x0 + cfX, by: y0, edgeIdx: 7, chamfer: true }
    ];

    const ring = [];
    const strokeOpts = (seg) => ({
      rand,
      cx,
      cy,
      slip,
      kinkAmp,
      bite: notchSpec.get(seg.edgeIdx) || null,
      twoCuts: !seg.chamfer && seg.long && rand() < 0.52,
      topBottomTrim: (seg.edgeIdx === 0 || seg.edgeIdx === 4) && !seg.chamfer ? topBottomTrim : 0,
      isSide: !!seg.isSide,
      sideInMax
    });

    for (const seg of segments) {
      if (seg.chamfer) {
        walkScissorStroke(ring, seg.ax, seg.ay, seg.bx, seg.by, {
          ...strokeOpts(seg),
          bite: null,
          twoCuts: false
        });
      } else {
        walkScissorStroke(ring, seg.ax, seg.ay, seg.bx, seg.by, strokeOpts(seg));
      }
    }

    return ring;
  }

  /**
   * Mood triptych cards: 4-corner shape + one side with a two-cut outward point.
   */
  function buildMoodTriptychHandCutPolygon(w, h, seed, cfg) {
    const rand = seededRandom(seed);
    const inset = domToExportPx(cfg, cfg.handCutMarginDomPx ?? 0.5);
    const shortSide = Math.min(w, h);
    const macro = domToExportPx(cfg, cfg.handCutMacroDomPx ?? 16);
    const cornerJitter = Math.max(1, Math.min(shortSide * 0.035, macro * 0.6));

    const x0 = inset;
    const y0 = inset;
    const x1 = w - inset;
    const y1 = h - inset;

    const j = () => (rand() - 0.5) * 2 * cornerJitter;
    const clampX = (x) => Math.max(0, Math.min(w, x));
    const clampY = (y) => Math.max(0, Math.min(h, y));

    const topLeft = { x: clampX(x0 + j()), y: clampY(y0 + j()) };
    const topRight = { x: clampX(x1 + j()), y: clampY(y0 + j()) };
    const bottomRight = { x: clampX(x1 + j()), y: clampY(y1 + j()) };
    const bottomLeft = { x: clampX(x0 + j()), y: clampY(y1 + j()) };

    const corners = [topLeft, topRight, bottomRight, bottomLeft];
    const sideIdx = Math.floor(rand() * 4);
    const a = corners[sideIdx];
    const b = corners[(sideIdx + 1) % 4];

    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const edgeDx = b.x - a.x;
    const edgeDy = b.y - a.y;
    const edgeLen = Math.hypot(edgeDx, edgeDy) || 1;
    let nx = -edgeDy / edgeLen;
    let ny = edgeDx / edgeLen;
    const cx = (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4;
    const cy = (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4;
    if ((mx - cx) * nx + (my - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }

    const pointDepth = Math.max(6, Math.min(macro * 1.25, shortSide * 0.19));
    const along = Math.max(0.18, Math.min(0.82, 0.5 + (rand() - 0.5) * 0.22));
    const baseX = a.x + edgeDx * along;
    const baseY = a.y + edgeDy * along;
    const point = {
      x: clampX(baseX + nx * pointDepth),
      y: clampY(baseY + ny * pointDepth)
    };

    const ring = [];
    for (let i = 0; i < 4; i++) {
      ring.push(corners[i]);
      if (i === sideIdx) ring.push(point);
    }
    return ring;
  }

  function tracePolygon(ctx, pts) {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  /** Scale a hand-cut ring from reference output px to target padded canvas px. */
  function scaleHandCutRing(ring, srcW, srcH, dstW, dstH) {
    if (!ring.length || srcW === dstW && srcH === dstH) return ring;
    const sx = dstW / srcW;
    const sy = dstH / srcH;
    return ring.map((p) => ({ x: p.x * sx, y: p.y * sy }));
  }

  /**
   * Output px of `cropSpreadToClipping` — used as hand-cut reference frame so wide
   * mood spreads inherit the same silhouette proportions as the peek quote clipping.
   */
  function resolveQuoteCropOutputSize(spread, cfg) {
    const { outW, centerOutW } = resolveQuoteCropMetrics(cfg);
    const centerColW = Math.max(1, Number(spread?.centerColW) || centerOutW);
    const bandH = Number(spread?.bandH) || 0;
    if (!bandH || bandH < 1) {
      return { outW, outH: Math.max(48, Math.round(outW * 0.38)) };
    }
    const bleedY = domToExportPx(cfg, cfg.cropVerticalBleedDomPx ?? 4);
    const scale = centerOutW / centerColW;
    const bleedSrcY = Math.ceil(bleedY / scale);
    const srcH = bandH + bleedSrcY * 2;
    const outH = Math.max(1, Math.ceil(srcH * scale));
    return { outW, outH };
  }

  /** Alpha mask for hand-cut silhouette (no inset edge banding). */
  function applyHandCutSilhouette(canvas, dateKey, cfg, opts = {}) {
    if (!canvas || cfg.handCutEnabled === false) return canvas;
    const pad = domToExportPx(cfg, cfg.handCutCanvasPadDomPx || 0);
    const w = canvas.width + pad * 2;
    const h = canvas.height + pad * 2;
    if (w < 8 || h < 8) return canvas;

    const seed = hashDateKeySeed(dateKey);
    const ref = opts.referenceFrame || null;
    const refW = ref ? ref.outW + pad * 2 : w;
    const refH = ref ? ref.outH + pad * 2 : h;
    let ring = buildHandCutPolygon(refW, refH, seed, cfg);
    if (ref && (refW !== w || refH !== h)) {
      ring = scaleHandCutRing(ring, refW, refH, w, h);
    }

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d');
    if (!octx) return canvas;

    octx.drawImage(canvas, pad, pad);
    octx.save();
    octx.globalCompositeOperation = 'destination-in';
    octx.fillStyle = '#000';
    tracePolygon(octx, ring);
    octx.fill();
    octx.restore();

    return out;
  }

  /** Center quote only — no side peek columns (terminal mood screen). */
  function cropSpreadCenterOnly(spread, cfg) {
    const baseW = Math.round(cfg.width);
    const bleedX = domToExportPx(
      cfg,
      cfg.cropHorizontalBleedDomPx ?? cfg.cropEdgeBleedDomPx ?? 14
    );
    const bleedY = domToExportPx(cfg, cfg.cropVerticalBleedDomPx ?? 4);
    const outW = baseW + bleedX * 2;
    const { canvas: spreadCanvas, centerColW, centerX, bandTop, bandH } = spread;
    if (!bandH || bandH < 1 || !centerColW) return null;

    const scale = outW / centerColW;
    const bleedSrcY = Math.ceil(bleedY / scale);
    const srcY = Math.max(0, bandTop - bleedSrcY);
    const srcH = Math.min(spreadCanvas.height - srcY, bandH + bleedSrcY * 2);
    const outH = Math.max(1, Math.ceil(srcH * scale));

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = cfg.paper;
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(
      spreadCanvas,
      centerX,
      srcY,
      centerColW,
      srcH,
      0,
      0,
      outW,
      outH
    );
    return out;
  }

  const MOOD_ARROW_ICONS = {
    good: 'brightness_1',
    rough: 'contrast'
  };

  const MATERIAL_SYMBOLS_CLIPPING_URL =
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=brightness_1,contrast&display=block';

  let _materialSymbolsClippingPromise = null;
  let _moodSpreadComposeOpts = null;

  function ensureMaterialSymbolsStylesheet() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('quilt-clipping-material-symbols')) return;
    const link = document.createElement('link');
    link.id = 'quilt-clipping-material-symbols';
    link.rel = 'stylesheet';
    link.href = MATERIAL_SYMBOLS_CLIPPING_URL;
    document.head.appendChild(link);
  }

  async function ensureMaterialSymbolsForClipping(iconPxValues = []) {
    ensureMaterialSymbolsStylesheet();
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    const sizes = [
      ...new Set(
        iconPxValues
          .map((n) => Math.ceil(Number(n) || 0))
          .filter((n) => n > 0)
      )
    ];
    if (!sizes.length) sizes.push(24);
    const key = sizes.join(',');
    if (_materialSymbolsClippingPromise?.key === key) return _materialSymbolsClippingPromise.promise;
    const promise = Promise.allSettled([
      ...sizes.map((size) => document.fonts.load(`400 ${size}px "Material Symbols Outlined"`)),
      document.fonts.ready
    ]).then(() => {});
    _materialSymbolsClippingPromise = { key, promise };
    return promise;
  }

  function materialSymbolsReady(iconPx) {
    if (_moodSpreadComposeOpts?.skipMaterialSymbols) return false;
    const size = Math.round(iconPx);
    if (typeof document === 'undefined' || !document.fonts?.check) return false;
    return document.fonts.check(`400 ${size}px "Material Symbols Outlined"`);
  }

  /** Material Symbols brightness_1 / contrast (matches quilt mood widget). */
  function drawMoodArrowIcon(ctx, cx, cy, px, variant, ink) {
    const iconName = variant === 'rough' ? MOOD_ARROW_ICONS.rough : MOOD_ARROW_ICONS.good;
    const size = Math.max(10, Math.round(px));
    if (materialSymbolsReady(size)) {
      ctx.save();
      ctx.font = `400 ${size}px "Material Symbols Outlined"`;
      if ('fontVariationSettings' in ctx) {
        ctx.fontVariationSettings = `"FILL" 0, "wght" 400, "GRAD" 0, "opsz" ${size}`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ink;
      ctx.fillText(iconName, cx, cy);
      ctx.restore();
      return;
    }

    const r = size * 0.36;
    const lineW = Math.max(1.25, size * 0.14);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    if (variant === 'rough') {
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r - lineW * 0.35);
      ctx.lineTo(cx, cy + r + lineW * 0.35);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Cream arrow wedge: tip toward peek, base toward center column. */
  function traceMoodFlankTriangle(ctx, tipX, baseX, cy, outH) {
    ctx.beginPath();
    ctx.moveTo(tipX, cy);
    ctx.lineTo(baseX, 0);
    ctx.lineTo(baseX, outH);
    ctx.closePath();
  }

  function resolveMoodFlankWidths(cfg) {
    if (cfg.moodFlanksEnabled === false) {
      return { barW: 0, darkStretch: 0, flankW: 0 };
    }
    const barW = domToExportPx(cfg, cfg.moodArrowBarWidthDomPx ?? DEFAULTS.moodArrowBarWidthDomPx);
    const darkStretch = domToExportPx(
      cfg,
      cfg.moodFlankDarkStretchDomPx ?? DEFAULTS.moodFlankDarkStretchDomPx
    );
    return { barW, darkStretch, flankW: barW + darkStretch };
  }

  function moodFlankArrowGeometry(x, flankW, outH, pointingLeft, cfg) {
    const tipFromOuter = Number(cfg.moodFlankArrowTipFromOuter ?? DEFAULTS.moodFlankArrowTipFromOuter);
    const cy = outH / 2;
    if (pointingLeft) {
      return { tipX: x + flankW * tipFromOuter, baseX: x + flankW, cy };
    }
    return { tipX: x + flankW * (1 - tipFromOuter), baseX: x, cy };
  }

  function withMoodFlankClip(ctx, x, w, h, clipFn, paintFn) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.beginPath();
    clipFn(ctx, 0, 0, w, h);
    ctx.clip();
    paintFn(ctx, w, h);
    ctx.restore();
  }

  function drawFlankBarPaperTexture(lctx, w, h, cfg) {
    const paperImg = patternCache.paper;
    if (!paperImg?.naturalWidth) return;
    const opacity = cfg.moodFlankBarPaperOpacity ?? DEFAULTS.moodFlankBarPaperOpacity;
    if (!opacity) return;
    lctx.save();
    lctx.globalCompositeOperation = 'multiply';
    lctx.globalAlpha = opacity;
    lctx.drawImage(paperImg, -w * 0.08, -h * 0.06, w * 1.16, h * 1.12);
    lctx.restore();
  }

  function drawFlankBarInkWash(lctx, w, h) {
    const g1 = lctx.createLinearGradient(0, 0, w, h * 0.55);
    g1.addColorStop(0, 'rgba(118, 78, 44, 0.14)');
    g1.addColorStop(1, 'rgba(118, 78, 44, 0)');
    lctx.fillStyle = g1;
    lctx.fillRect(0, 0, w, h);
    const g2 = lctx.createLinearGradient(w, 0, 0, h * 0.5);
    g2.addColorStop(0, 'rgba(96, 62, 36, 0.11)');
    g2.addColorStop(1, 'rgba(96, 62, 36, 0)');
    lctx.fillStyle = g2;
    lctx.fillRect(0, 0, w, h);
  }

  function drawFlankBarGrain(lctx, w, h, cfg) {
    const img = patternCache.card;
    if (!img?.naturalWidth) return;
    const opacity = cfg.moodFlankBarGrainOpacity ?? DEFAULTS.moodFlankBarGrainOpacity;
    if (!opacity) return;
    const tilePx = domToExportPx(cfg, cfg.cardGrainTileDomPx);
    applyMultiplyLayer(lctx, w, h, opacity, (layerCtx) => {
      tilePatternImage(layerCtx, w, h, img, tilePx);
    });
  }

  function drawFlankBarHalftone(lctx, w, h, cfg) {
    const opacity = cfg.moodFlankBarHalftoneOpacity ?? DEFAULTS.moodFlankBarHalftoneOpacity;
    if (!opacity) return;
    const pitch = domToExportPx(cfg, cfg.halftonePitchDomPx);
    const ox = domToExportPx(cfg, cfg.halftoneDotOffsetDomPx.x);
    const oy = domToExportPx(cfg, cfg.halftoneDotOffsetDomPx.y);
    const tW = Math.max(2, Math.ceil(pitch));
    applyMultiplyLayer(lctx, w, h, opacity, (layerCtx) => {
      const tile = document.createElement('canvas');
      tile.width = tW;
      tile.height = tW;
      const tctx = tile.getContext('2d');
      if (!tctx) return;
      tctx.fillStyle = 'rgba(32, 24, 18, 0.95)';
      tctx.beginPath();
      tctx.arc(ox + 0.5, oy + 0.5, 0.5, 0, Math.PI * 2);
      tctx.fill();
      const pattern = layerCtx.createPattern(tile, 'repeat');
      if (!pattern) return;
      layerCtx.fillStyle = pattern;
      layerCtx.fillRect(0, 0, w, h);
    });
  }

  function drawFlankArrowGrain(lctx, w, h, cfg) {
    const img = patternCache.card;
    if (!img?.naturalWidth) return;
    const opacity = cfg.moodFlankArrowGrainOpacity ?? DEFAULTS.moodFlankArrowGrainOpacity;
    if (!opacity) return;
    const tilePx = domToExportPx(cfg, cfg.cardGrainTileDomPx);
    applyMultiplyLayer(lctx, w, h, opacity, (layerCtx) => {
      tilePatternImage(layerCtx, w, h, img, tilePx);
    });
  }

  function drawFlankArrowHalftone(lctx, w, h, cfg) {
    const opacity = cfg.moodFlankArrowHalftoneOpacity ?? DEFAULTS.moodFlankArrowHalftoneOpacity;
    if (!opacity) return;
    const pitch = domToExportPx(cfg, cfg.halftonePitchDomPx);
    const ox = domToExportPx(cfg, cfg.halftoneDotOffsetDomPx.x);
    const oy = domToExportPx(cfg, cfg.halftoneDotOffsetDomPx.y);
    const tW = Math.max(2, Math.ceil(pitch));
    applyMultiplyLayer(lctx, w, h, opacity, (layerCtx) => {
      const tile = document.createElement('canvas');
      tile.width = tW;
      tile.height = tW;
      const tctx = tile.getContext('2d');
      if (!tctx) return;
      tctx.fillStyle = 'rgba(32, 24, 18, 0.95)';
      tctx.beginPath();
      tctx.arc(ox + 0.5, oy + 0.5, 0.5, 0, Math.PI * 2);
      tctx.fill();
      const pattern = layerCtx.createPattern(tile, 'repeat');
      if (!pattern) return;
      layerCtx.fillStyle = pattern;
      layerCtx.fillRect(0, 0, w, h);
    });
    const vImg = patternCache.viewport;
    if (!vImg?.naturalWidth) return;
    const tilePx = domToExportPx(cfg, cfg.viewportGrainTileDomPx);
    applyMultiplyLayer(lctx, w, h, (cfg.viewportGrainOpacity || 0) * 0.55, (layerCtx) => {
      tilePatternImage(layerCtx, w, h, vImg, tilePx);
    });
  }

  function drawMoodFlank(ctx, x, outH, flankW, pointingLeft, cfg) {
    const barColor = cfg.moodArrowBarColor ?? DEFAULTS.moodArrowBarColor;
    const triFill = cfg.moodArrowFill ?? cfg.paper ?? DEFAULTS.moodArrowFill;
    const ink = cfg.moodArrowInk ?? DEFAULTS.moodArrowInk;
    const iconDom = Number(cfg.moodArrowIconDomPx ?? DEFAULTS.moodArrowIconDomPx);
    const flankWi = Math.ceil(flankW);
    const { tipX, baseX, cy } = moodFlankArrowGeometry(x, flankW, outH, pointingLeft, cfg);
    const creamW = Math.abs(baseX - tipX);
    const iconPx =
      iconDom > 0
        ? domToExportPx(cfg, iconDom)
        : Math.min(creamW * 0.72, outH * 0.4, flankW * 0.5);

    ctx.fillStyle = barColor;
    ctx.fillRect(Math.round(x), 0, flankWi, outH);

    withMoodFlankClip(
      ctx,
      x,
      flankWi,
      outH,
      (c) => c.rect(0, 0, flankWi, outH),
      (lctx, w, h) => {
        drawFlankBarInkWash(lctx, w, h);
        drawFlankBarPaperTexture(lctx, w, h, cfg);
        drawFlankBarGrain(lctx, w, h, cfg);
        drawFlankBarHalftone(lctx, w, h, cfg);
      }
    );

    ctx.fillStyle = triFill;
    traceMoodFlankTriangle(ctx, tipX, baseX, cy, outH);
    ctx.fill();

    withMoodFlankClip(
      ctx,
      x,
      flankWi,
      outH,
      (c, lx, ly, w, h) => {
        const geom = moodFlankArrowGeometry(lx, w, h, pointingLeft, cfg);
        traceMoodFlankTriangle(c, geom.tipX, geom.baseX, geom.cy, h);
      },
      (lctx, w, h) => {
        drawFlankArrowGrain(lctx, w, h, cfg);
        drawFlankArrowHalftone(lctx, w, h, cfg);
      }
    );

    const iconCx = tipX + (baseX - tipX) * 0.46;
    drawMoodArrowIcon(ctx, iconCx, cy, iconPx, pointingLeft ? 'good' : 'rough', ink);
  }

  /** Mood spread output widths: full side | flank | gap | center | gap | flank | full side. */
  function resolveMoodSpreadCropMetrics(cfg, spread = null) {
    const baseW = Math.round(cfg.width);
    const bleedX = domToExportPx(
      cfg,
      cfg.cropHorizontalBleedDomPx ?? cfg.cropEdgeBleedDomPx ?? 14
    );
    const peekBase = Math.round(baseW * (cfg.peekRatio ?? DEFAULTS.peekRatio));
    const centerOutW = Math.max(48, baseW - peekBase * 2);
    const centerColW = Math.max(1, Number(spread?.centerColW) || centerOutW);
    const sideColW = Math.max(1, Number(spread?.sideColW) || Math.floor((baseW - centerColW) / 2));
    const scale = centerOutW / centerColW;
    const sideOutW = Math.max(1, Math.round(sideColW * scale));
    const { flankW } = resolveMoodFlankWidths(cfg);
    const gap =
      flankW > 0
        ? domToExportPx(cfg, cfg.moodFlankCenterGapDomPx ?? DEFAULTS.moodFlankCenterGapDomPx)
        : 0;
    const outW =
      flankW > 0
        ? sideOutW + flankW + gap + centerOutW + gap + flankW + sideOutW
        : sideOutW + centerOutW + sideOutW;
    const viewportW = flankW > 0 ? flankW + gap + centerOutW + gap + flankW : centerOutW;
    return {
      baseW,
      centerOutW,
      sideOutW,
      flankW,
      gap,
      scale,
      sideColW,
      centerColW,
      outW,
      viewportW,
      bleedX
    };
  }

  /** Slide offsets (export px) for mood-spread carousel: center | good | rough. */
  function resolveMoodSpreadSlideOffsets(metrics) {
    const sideOutW = Math.max(0, Number(metrics?.sideOutW) || 0);
    const viewportW = Math.max(1, Number(metrics?.viewportW) || 0);
    const outW = Math.max(viewportW, Number(metrics?.outW) || viewportW);
    return {
      viewportW,
      center: -sideOutW,
      good: 0,
      rough: -(outW - viewportW)
    };
  }

  /**
   * Mood spread crop: full good/rough columns + flanks + gapped center (no side peeks).
   */
  function cropSpreadToMoodClipping(spread, cfg, { transparentBackground = false } = {}) {
    const bleedY = domToExportPx(cfg, cfg.cropVerticalBleedDomPx ?? 4);
    const metrics = resolveMoodSpreadCropMetrics(cfg, spread);
    const { centerOutW, sideOutW, flankW, gap, scale, sideColW, centerColW, outW } = metrics;
    const { canvas: spreadCanvas, centerX, bandTop, bandH } = spread;
    if (!bandH || bandH < 1 || !centerColW) return null;

    const bleedSrcY = Math.ceil(bleedY / scale);
    const srcY = Math.max(0, bandTop - bleedSrcY);
    const srcH = Math.min(spreadCanvas.height - srcY, bandH + bleedSrcY * 2);
    const outH = Math.max(1, Math.ceil(srcH * scale));

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) return null;

    if (transparentBackground) {
      ctx.clearRect(0, 0, outW, outH);
    } else {
      ctx.fillStyle = cfg.paper;
      ctx.fillRect(0, 0, outW, outH);
    }

    let dx = 0;

    ctx.drawImage(
      spreadCanvas,
      0,
      srcY,
      sideColW,
      srcH,
      dx,
      0,
      sideOutW,
      outH
    );
    dx += sideOutW;

    if (flankW > 0) {
      drawMoodFlank(ctx, dx, outH, flankW, true, cfg);
      dx += flankW;
    }

    ctx.drawImage(
      spreadCanvas,
      centerX,
      srcY,
      centerColW,
      srcH,
      dx,
      0,
      centerOutW,
      outH
    );
    dx += centerOutW;

    if (flankW > 0) {
      drawMoodFlank(ctx, dx, outH, flankW, false, cfg);
      dx += flankW;
    }

    ctx.drawImage(
      spreadCanvas,
      centerX + centerColW,
      srcY,
      sideColW,
      srcH,
      dx,
      0,
      sideOutW,
      outH
    );

    return out;
  }

  /**
   * Step 2: crop spread to 1:3:1 peek frame — reference mockup file 2.
   */
  function cropSpreadToClipping(spread, cfg) {
    const baseW = Math.round(cfg.width);
    const bleedX = domToExportPx(
      cfg,
      cfg.cropHorizontalBleedDomPx ?? cfg.cropEdgeBleedDomPx ?? 14
    );
    const bleedY = domToExportPx(cfg, cfg.cropVerticalBleedDomPx ?? 4);
    const peekBase = Math.round(baseW * cfg.peekRatio);
    const centerOutW = baseW - peekBase * 2;
    const outW = baseW + bleedX * 2;
    const peekW = peekBase + bleedX;
    const { canvas: spreadCanvas, centerColW, centerX, bandTop, bandH } = spread;
    if (!bandH || bandH < 1 || !centerColW) return null;

    const scale = centerOutW / centerColW;
    const bleedSrcX = Math.ceil(bleedX / scale);
    const bleedSrcY = Math.ceil(bleedY / scale);
    const peekSrcW = Math.max(1, Math.ceil(peekW / scale));
    const srcY = Math.max(0, bandTop - bleedSrcY);
    const srcH = Math.min(spreadCanvas.height - srcY, bandH + bleedSrcY * 2);
    const outH = Math.max(1, Math.ceil(srcH * scale));

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = cfg.paper;
    ctx.fillRect(0, 0, outW, outH);

    ctx.drawImage(
      spreadCanvas,
      centerX - peekSrcW,
      srcY,
      peekSrcW,
      srcH,
      0,
      0,
      peekW,
      outH
    );

    ctx.drawImage(
      spreadCanvas,
      centerX,
      srcY,
      centerColW,
      srcH,
      peekW,
      0,
      centerOutW,
      outH
    );

    ctx.drawImage(
      spreadCanvas,
      centerX + centerColW,
      srcY,
      peekSrcW,
      srcH,
      peekW + centerOutW,
      0,
      peekW,
      outH
    );

    return out;
  }

  /**
   * Crop spread to the quote band with all three columns fully visible (no side peek).
   */
  function cropSpreadFullColumns(spread, cfg) {
    const baseW = Math.round(cfg.width);
    const bleedX = domToExportPx(
      cfg,
      cfg.cropHorizontalBleedDomPx ?? cfg.cropEdgeBleedDomPx ?? 14
    );
    const bleedY = domToExportPx(cfg, cfg.cropVerticalBleedDomPx ?? 4);
    const outW = baseW + bleedX * 2;
    const { canvas: spreadCanvas, bandTop, bandH } = spread;
    if (!bandH || bandH < 1) return null;

    const srcW = spreadCanvas.width;
    const scale = outW / srcW;
    const bleedSrcY = Math.ceil(bleedY / scale);
    const srcY = Math.max(0, bandTop - bleedSrcY);
    const srcH = Math.min(spreadCanvas.height - srcY, bandH + bleedSrcY * 2);
    const outH = Math.max(1, Math.ceil(srcH * scale));

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = cfg.paper;
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(spreadCanvas, 0, srcY, srcW, srcH, 0, 0, outW, outH);
    return out;
  }

  function moodSpreadHandCutDateKey(dateKey) {
    const dk = String(dateKey || '').trim();
    return dk || 'our-daily';
  }

  /** Percentage CSS clip-path for live DOM artifacts (speaker card, etc.). */
  function buildHandCutCssClipPath(w, h, dateKey, cfgIn = {}) {
    const iw = Math.max(1, Math.round(Number(w) || 0));
    const ih = Math.max(1, Math.round(Number(h) || 0));
    if (iw < 8 || ih < 8) return null;
    const cfg = withClippingTypography({ ...DEFAULTS, ...cfgIn, width: iw, exportScale: 1 });
    const seed = hashDateKeySeed(moodSpreadHandCutDateKey(dateKey));
    const profile =
      cfg.handCutProfile ||
      (String(dateKey).includes(':triptych:') ? 'moodTriptych' : 'default');
    const ring =
      profile === 'moodTriptych'
        ? buildMoodTriptychHandCutPolygon(iw, ih, seed, cfg)
        : buildHandCutPolygon(iw, ih, seed, cfg);
    if (!ring?.length) return null;
    const pts = ring.map((p) => {
      const x = Math.max(0, Math.min(100, (p.x / iw) * 100));
      const y = Math.max(0, Math.min(100, (p.y / ih) * 100));
      return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
    });
    return `polygon(${pts.join(', ')})`;
  }

  /** Same hand-cut pass as `composeDataUrl` (quote clipping reference frame). */
  function finishMoodSpreadClipping(clipped, cfg, dateKey, spread = null) {
    if (!clipped) return null;
    if (cfg.moodSpreadHandCutExport === false || cfg.handCutEnabled === false) return clipped;
    const dk = moodSpreadHandCutDateKey(dateKey);
    const referenceFrame = spread ? resolveQuoteCropOutputSize(spread, cfg) : null;
    return applyHandCutSilhouette(clipped, dk, cfg, { referenceFrame });
  }

  async function composeDataUrlAttempt(opts = {}) {
    const cfg = withClippingTypography({ ...DEFAULTS, ...opts });
    typography = cfg;
    const today = opts.today || null;
    if (!today || !normalizeText(today.text)) return null;

    await Promise.all([
      ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx], cfg.fontFamily),
      ensureClippingSurfaceAssets(cfg)
    ]);

    const measureCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!measureCanvas) return null;
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return null;

    const spread = renderFullSpread(mctx, opts, cfg);
    if (!spread?.canvas) return null;

    const usePeekSides = opts.peekSides === true || opts.centerOnly === false;
    let clipped = usePeekSides
      ? cropSpreadToClipping(spread, cfg)
      : cropSpreadCenterOnly(spread, cfg);
    if (!clipped) return null;

    const dateKey =
      String(opts.dateKey || '').trim() ||
      String(opts.today?.dateKey || '').trim() ||
      '';
    clipped = applyHandCutSilhouette(clipped, dateKey, cfg);

    return canvasToDataUrl(clipped, 0.92);
  }

  async function composeDataUrl(opts = {}) {
    const attempts = [opts, { ...opts, paperTextureUrl: null }];
    let lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
      try {
        if (i > 0) clearPaperPatternCache();
        const dataUrl = await composeDataUrlAttempt(attempts[i]);
        if (dataUrl) return dataUrl;
        lastErr = new Error('Peek clipping compose returned empty');
      } catch (err) {
        lastErr = err;
        const isTaint =
          err?.__odqCanvasExport ||
          /tainted|toDataURL/i.test(String(err?.message || err || ''));
        if (!isTaint || i === attempts.length - 1) throw err;
      }
    }
    throw lastErr || new Error('Peek clipping compose failed');
  }

  /**
   * Mood-spread clipping: center quote + peeking good/rough columns + flanking arrows.
   */
  async function composeMoodSpreadDataUrl(opts = {}) {
    const result = await composeMoodSpreadWithMetrics(opts);
    return result?.dataUrl || null;
  }

  /** Mood spread PNG plus crop metrics for live flank carousel. */
  async function composeMoodSpreadWithMetricsAttempt(opts = {}) {
    _moodSpreadComposeOpts = opts;
    try {
    const cfg = withClippingTypography({ ...DEFAULTS, ...opts });
    typography = cfg;
    const today = opts.today || null;
    const goodDay = normalizeText(opts.goodDay ?? opts.good_day);
    const roughDay = normalizeText(opts.roughDay ?? opts.rough_day);
    if (!today || !normalizeText(today.text)) return null;
    if (!goodDay && !roughDay) return null;

    await Promise.all([
      ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx], cfg.fontFamily),
      ensureClippingSurfaceAssets(cfg)
    ]);

    const measureCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!measureCanvas) return null;
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return null;

    const spread = renderFullSpread(
      mctx,
      { ...opts, today, goodDay, roughDay, sideMode: 'mood' },
      cfg
    );
    if (!spread?.canvas) return null;

    const metrics = resolveMoodSpreadCropMetrics(cfg, spread);
    const bleedY = domToExportPx(cfg, cfg.cropVerticalBleedDomPx ?? 4);
    const bleedSrcY = Math.ceil(bleedY / metrics.scale);
    const srcY = Math.max(0, spread.bandTop - bleedSrcY);
    const srcH = Math.min(spread.canvas.height - srcY, spread.bandH + bleedSrcY * 2);
    const outH = Math.max(1, Math.ceil(srcH * metrics.scale));
    const { flankW } = resolveMoodFlankWidths(cfg);
    const tipFromOuter = Number(
      cfg.moodFlankArrowTipFromOuter ?? DEFAULTS.moodFlankArrowTipFromOuter
    );
    const creamW = flankW * (1 - tipFromOuter);
    const iconPx = Math.min(creamW * 0.72, outH * 0.4, flankW * 0.5);
    if (!opts.skipMaterialSymbols) {
      await ensureMaterialSymbolsForClipping([iconPx]);
    }

    let clipped = cropSpreadToMoodClipping(spread, cfg);
    if (!clipped) return null;

    const dateKey =
      String(opts.dateKey || '').trim() ||
      String(opts.today?.dateKey || '').trim() ||
      '';
    clipped = finishMoodSpreadClipping(clipped, cfg, dateKey, spread);

    return {
      dataUrl: canvasToDataUrl(clipped, 0.92),
      metrics: { ...metrics, outH },
      slides: resolveMoodSpreadSlideOffsets(metrics)
    };
    } finally {
      _moodSpreadComposeOpts = null;
    }
  }

  async function composeMoodSpreadWithMetrics(opts = {}) {
    const attempts = [
      opts,
      { ...opts, paperTextureUrl: null },
      { ...opts, paperTextureUrl: null, skipMaterialSymbols: true }
    ];
    let lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
      try {
        if (i > 0) clearPaperPatternCache();
        const result = await composeMoodSpreadWithMetricsAttempt(attempts[i]);
        if (result?.dataUrl) {
          return result;
        }
        lastErr = new Error('Mood spread compose returned empty');
      } catch (err) {
        lastErr = err;
        const isTaint =
          err?.__odqCanvasExport ||
          /tainted|toDataURL/i.test(String(err?.message || err || ''));
        if (!isTaint || i === attempts.length - 1) throw err;
      }
    }
    throw lastErr || new Error('Mood spread compose failed');
  }

  function plainRunsFromText(text) {
    const t = normalizeText(text);
    if (!t) return [];
    return [{ text: t, bold: false, italic: false, underline: false, caps: false }];
  }

  function activateTypography(cfgIn) {
    typography = withClippingTypography(cfgIn);
    return typography;
  }

  /** Pixel widths used by `cropSpreadToClipping` (center band vs full output). */
  function resolveQuoteCropMetrics(cfg) {
    const baseW = Math.round(cfg.width);
    const bleedX = domToExportPx(
      cfg,
      cfg.cropHorizontalBleedDomPx ?? cfg.cropEdgeBleedDomPx ?? 14
    );
    const peekBase = Math.round(baseW * (cfg.peekRatio ?? DEFAULTS.peekRatio));
    const centerOutW = Math.max(48, baseW - peekBase * 2);
    const outW = baseW + bleedX * 2;
    const peekW = peekBase + bleedX;
    return { baseW, centerOutW, outW, peekW, bleedX };
  }

  /** Center band width inside a cropped quote clipping PNG. */
  function centerBandWidthFromQuoteClippingPx(quoteClippingWidthPx, cfg) {
    const quoteW = Number(quoteClippingWidthPx);
    if (!Number.isFinite(quoteW) || quoteW <= 0) {
      return resolveQuoteCropMetrics(cfg).centerOutW;
    }
    const { centerOutW, outW } = resolveQuoteCropMetrics(cfg);
    return Math.max(48, Math.round(quoteW * (centerOutW / outW)));
  }

  /** Center column lines: full justify with last-line left-align when gap is excessive. */
  function drawCenterJustifiedLines(ctx, layout, colX, startY, px, color, cfg) {
    const lastLineLeftGapMax = domToExportPx(
      cfg,
      cfg.justifyLastLineLeftMinGapDomPx ?? DEFAULTS.justifyLastLineLeftMinGapDomPx
    );
    const innerX = colX + layout.padX;
    let cy = startY;
    const lines = layout.wrapped;
    for (let i = 0; i < lines.length; i++) {
      let lineAlign = 'justify';
      if (i === lines.length - 1) {
        const gap = measureJustifyLineGap(ctx, lines[i], px, layout.innerW);
        if (gap > lastLineLeftGapMax) lineAlign = 'left';
      }
      drawRunsLine(ctx, lines[i], innerX, cy, px, color, lineAlign, layout.innerW);
      cy += layout.lineStep;
    }
    return cy;
  }

  return {
    CLIPPING_EXPORT_REV,
    DEFAULTS,
    CLIPPING_FONT_FAMILY,
    clippingBodyPxAtExportWidth,
    withClippingTypography,
    activateTypography,
    domToExportPx,
    resolveQuoteCropMetrics,
    resolveQuoteCropOutputSize,
    centerBandWidthFromQuoteClippingPx,
    primaryClippingFontName,
    ensureNewspaperClippingFonts,
    ensureMaterialSymbolsForClipping,
    MOOD_ARROW_ICONS,
    ensureClippingSurfaceAssets,
    normalizeText,
    plainRunsForQuote,
    plainRunsFromText,
    resolveFirstLineCount,
    fitCenterColumnWidth,
    layoutColumn,
    drawPaperBase,
    drawCardGrain,
    drawViewportTextureOverText,
    drawCenterJustifiedLines,
    keywordPayloadForQuote,
    clippingKeywordStylesForDateKey,
    clippingSpeakerNameStyleForDateKey,
    CLIPPING_KEYWORD_STYLE_SINGLES,
    CLIPPING_KEYWORD_STYLE_COMBOS,
    hashDateKeySeed,
    buildHandCutPolygon,
    buildMoodTriptychHandCutPolygon,
    buildHandCutCssClipPath,
    applyHandCutSilhouette,
    renderFullSpread,
    cropSpreadToClipping,
    cropSpreadToMoodClipping,
    cropSpreadFullColumns,
    resolveMoodSpreadCropMetrics,
    resolveMoodSpreadSlideOffsets,
    drawMoodFlank,
    composeDataUrl,
    composeMoodSpreadDataUrl,
    composeMoodSpreadWithMetrics,
    moodSpreadHandCutDateKey
  };
});
