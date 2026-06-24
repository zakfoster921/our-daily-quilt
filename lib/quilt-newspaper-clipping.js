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

  /** Logged on Firestore uploads; app composes locally when bundled rev is newer than newspaperClippingExportRev. */
  const CLIPPING_EXPORT_REV = '101';

  /** Mood triptych quote PNG — on-screen cap below `--triptych-scale` sheet width (~72% sheet). */
  const TRIPTYCH_QUOTE_DISPLAY_SCALE = 0.72;
  /** Quote color-picker top half — match quilt peek clipping; slot fit shrinks tall PNGs. */
  const QUOTE_SCREEN_DISPLAY_SCALE = 1;
  /** Triptych uses hand-cut fit only; no extra shrink after `resolveCenterBodyPxForHandCut`. */
  const TRIPTYCH_QUOTE_TYPE_SCALE = 1;

  const DEFAULTS = {
    /** 0 = auto (2× quilt sheet width). 1080 was too wide—downscaling to ~428px blurred grain/halftone. */
    width: 0,
    exportScale: 2,
    /** Output frame: peek | center | peek (narrower side strips). */
    peekRatio: 0.045,
    /** Extra paper on peek strips only (dom px) — lower = tighter side columns. */
    peekHorizontalBleedDomPx: 2,
    /** Extra paper on crop — horizontal for side peeks; lower = trim more neighbor text. */
    cropHorizontalBleedDomPx: 8,
    cropVerticalBleedDomPx: 2,
    /** No extra spread pixels above bandTop (was pulling blank paper into the PNG). */
    cropVerticalBleedTopDomPx: 0,
    /** Paper above top rule in export band (hand-cut wobble only). */
    /** Paper above top rule — clearance for outward top pivot only (see resolveCropBandTopHandCutPadDomPx). */
    cropBandTopHandCutPadDomPx: 2,
    spreadPadX: 14,
    /** Inset between vertical rules and column text (export px; matches spreadPadX in lab reference). */
    columnRuleTextPadPx: 14,
    spreadPadY: 16,
    /** Empty gutter between columns; vertical rules sit centered in each gutter (dom px). */
    columnGutterDomPx: 4,
    /** Set in `withClippingTypography` from DOM `clamp(0.78rem, 2.35vw, 1.02rem)` scaled to export width. */
    bodyPx: null,
    centerBodyPx: null,
    /** Hand-cut fit floor (DOM px). 0 = full `--quilt-clipping-body-size` target (no shrink). */
    minCenterBodyDomPx: 0,
    lineHeight: 1.2,
    letterSpacingEm: 0.018,
    wordSpacingEm: 0.02,
    /** 0 — canvas shadowBlur softens type vs live DOM `text-shadow: 0 0 0.32px` on mood cards. */
    inkTextShadowPx: 0,
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
    /**
     * Any center line: if justify word gap exceeds this fraction of column inner width,
     * left-align instead (avoids rivers on sparse lines like "we become").
     */
    justifyMaxGapLineWidthRatio: 0.33,
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
    /** Legacy chamfer size — quote clipping uses square corners + edge pivot tabs instead. */
    handCutCornerChamferDomPx: 0,
    /** Scissor slip / mid-edge kink size (dom px). */
    handCutMacroDomPx: 5,
    /** Inward triangular scissor bites on long edges — off by default (edge pivots + wobble only). */
    handCutNotchesEnabled: false,
    handCutBiteMaxDomPx: 8,
    handCutSecondaryBiteDomPx: 5,
    /** Max inward trim on left/right (dom px) — trims outer paper on side peeks. */
    handCutSideInwardMaxDomPx: 8,
    /** Extra inward trim on top/bottom edges (dom px) — reduces blank paper above/below type. */
    handCutTopBottomTrimDomPx: 4,
    handCutEdgeFrayPx: 1,
    handCutCanvasPadDomPx: 1,
    /** Wide shallow outward pivot on every edge (replaces corner chamfers). */
    handCutTopBottomEdgePointEnabled: true,
    handCutEdgePointDomPx: 6,
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
    digitalExportCenterHalftoneOpacity: 0.062,
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

  /** Inset for hand-cut polygon — room for outward pivots without clipping off-canvas. */
  function resolveHandCutPolygonInsetDomPx(cfg = DEFAULTS) {
    const inner = Number(cfg.handCutMarginDomPx ?? 0.5);
    const pivot = Number(cfg.handCutEdgePointDomPx ?? 6);
    const macro = Number(cfg.handCutMacroDomPx ?? 5);
    return inner + pivot * 1.08 + macro * 0.75 + 2;
  }

  /** Export px pad around clipped art so outward pivots have opaque paper before masking. */
  function resolveHandCutEdgePadDomPx(cfg = DEFAULTS) {
    return domToExportPx(cfg, resolveHandCutPolygonInsetDomPx(cfg));
  }

  /** Bleed for alpha trim so outward hand-cut pivots are not shaved off top/bottom. */
  function resolveHandCutPivotBleedDomPx(cfg = DEFAULTS) {
    const pivot = Number(cfg.handCutEdgePointDomPx ?? 6);
    const macro = Number(cfg.handCutMacroDomPx ?? 5);
    const canvasPad = Number(cfg.handCutCanvasPadDomPx ?? 1);
    return pivot * 1.05 + macro * 0.7 + canvasPad + 2;
  }

  /** Min dom px above center top rule — outward top pivot + small rule clearance. */
  function resolveCropBandTopHandCutPadDomPx(cfg = DEFAULTS) {
    const configured = Number(cfg.cropBandTopHandCutPadDomPx ?? 0);
    const canvasPad = Number(cfg.handCutCanvasPadDomPx ?? 1);
    const pivotDom = Number(cfg.handCutEdgePointDomPx ?? 6) * 0.36;
    const ruleClearance = 4;
    return Math.max(configured, canvasPad + pivotDom + ruleClearance);
  }

  /** Map spread rule geometry onto a clipped/hand-cut canvas. */
  function resolveCenterBandRuleStrokeBox(clipped, spread, cfg, cropKind = 'peek', pipeline = {}) {
    const bandTop = Number(spread.bandTop);
    const ruleY1 = Number(spread.ruleY1);
    const ruleY2 = Number(spread.ruleY2);
    const ruleSpanW = Number(spread.ruleSpanW);
    const ruleX0Center = Number(spread.ruleX0Center);
    const centerX = Number(spread.centerX);
    if (!Number.isFinite(bandTop) || !Number.isFinite(ruleY1) || !Number.isFinite(ruleY2)) {
      return null;
    }
    const handCutPadPx = Number(pipeline.handCutPadPx) || 0;
    const removedTop = Number(pipeline.removedTop) || 0;
    const removedLeft = Number(pipeline.removedLeft) || 0;
    const ruleOffsetY1 = ruleY1 - bandTop;
    const ruleOffsetY2 = ruleY2 - bandTop;
    let y1 = 0;
    let y2 = 0;
    let x0 = 0;
    let spanW = ruleSpanW > 0 ? ruleSpanW : Math.max(8, clipped.width * 0.3);
    if (pipeline.afterHandCut === true) {
      const centerTop = Number(pipeline.centerStripTopPx);
      if (!Number.isFinite(centerTop)) return null;
      const bleed = verticalCropBleedSrcPx(cfg, 1);
      const bandSrcH = Math.max(1, spread.bandH + bleed.top + bleed.bottom);
      const yScale = clipped.height / bandSrcH;
      y1 = centerTop + ruleOffsetY1 * yScale;
      y2 = centerTop + ruleOffsetY2 * yScale;
      const removedLeft = Number(pipeline.removedLeft) || 0;
      if (cropKind === 'full') {
        const srcW = Math.max(1, Number(spread.canvas?.width) || clipped.width);
        const scale = clipped.width / srcW;
        x0 =
          (centerX + (Number.isFinite(ruleX0Center) ? ruleX0Center : 0)) * scale - removedLeft;
        spanW *= scale;
      } else {
        const peekW =
          cropKind === 'peek'
            ? Math.max(1, resolveVariablePeekWidths(spread.centerColW, cfg).peekW)
            : 0;
        const outW = Math.max(
          1,
          resolveQuoteCropOutputSize(spread, cfg).outW || clipped.width
        );
        const xScale = clipped.width / outW;
        x0 = (peekW + (Number.isFinite(ruleX0Center) ? ruleX0Center : 0)) * xScale - removedLeft;
        spanW *= xScale;
      }
    } else if (cropKind === 'full') {
      const srcW = Math.max(1, Number(spread.canvas?.width) || clipped.width);
      const scale = clipped.width / srcW;
      const bleed = verticalCropBleedSrcPx(cfg, scale);
      const srcY = Math.max(0, bandTop - bleed.top);
      y1 = (ruleY1 - srcY) * scale + handCutPadPx - removedTop;
      y2 = (ruleY2 - srcY) * scale + handCutPadPx - removedTop;
      x0 =
        (centerX + (Number.isFinite(ruleX0Center) ? ruleX0Center : 0)) * scale +
        handCutPadPx -
        removedLeft;
      spanW *= scale;
    } else {
      const bleed = verticalCropBleedSrcPx(cfg, 1);
      const srcY = Math.max(0, bandTop - bleed.top);
      y1 = ruleY1 - srcY + handCutPadPx - removedTop;
      y2 = ruleY2 - srcY + handCutPadPx - removedTop;
      const peekW =
        cropKind === 'peek'
          ? Math.max(1, resolveVariablePeekWidths(spread.centerColW, cfg).peekW)
          : 0;
      x0 = peekW + (Number.isFinite(ruleX0Center) ? ruleX0Center : 0) + handCutPadPx - removedLeft;
    }
    return { y1, y2, x0, spanW };
  }

  /** Re-ink center column rules on the export canvas. */
  function restrokeCenterBandRulesOnClipped(clipped, spread, cfg, cropKind = 'peek', pipeline = {}) {
    if (!clipped || !spread) return clipped;
    const box = resolveCenterBandRuleStrokeBox(clipped, spread, cfg, cropKind, pipeline);
    if (!box) return clipped;
    const { y1, y2, x0, spanW } = box;
    if (y2 <= y1 || y2 < 0 || y1 > clipped.height) return clipped;
    const ctx = clipped.getContext('2d');
    if (!ctx) return clipped;
    const ruleInk = exportRuleInk(cfg);
    const ruleLW = exportRuleThickness(cfg);
    if (digitalExportPolishEnabled(cfg)) {
      strokeCrispHLine(ctx, x0, x0 + spanW, y1, ruleInk, ruleLW);
      strokeCrispHLine(ctx, x0, x0 + spanW, y2, ruleInk, ruleLW);
    } else {
      ctx.strokeStyle = ruleInk;
      ctx.lineWidth = ruleLW;
      ctx.beginPath();
      ctx.moveTo(x0, y1);
      ctx.lineTo(x0 + spanW, y1);
      ctx.moveTo(x0, y2);
      ctx.lineTo(x0 + spanW, y2);
      ctx.stroke();
    }
    return clipped;
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
    if (!s || /^data:/i.test(s) || /^blob:/i.test(s) || /^file:/i.test(s)) return false;
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

  function collectLibScriptBaseHrefs() {
    const out = [];
    if (typeof document === 'undefined' || typeof location === 'undefined') return out;
    const scripts = document.querySelectorAll(
      'script[src*="quilt-newspaper-clipping.js"], script[src*="/lib/"], script[src*="lib/"]'
    );
    for (const script of scripts) {
      const scriptSrc = script?.getAttribute('src');
      if (!scriptSrc) continue;
      try {
        out.push(new URL(scriptSrc, location.href).href);
      } catch (_) {
        /* */
      }
    }
    return out;
  }

  function resolveAssetFromLibScripts(relativePath) {
    const rel = String(relativePath || '').trim();
    if (!rel.startsWith('assets/')) return null;
    for (const base of collectLibScriptBaseHrefs()) {
      try {
        return new URL(`../${rel}`, base).href;
      } catch (_) {
        /* */
      }
    }
    return null;
  }

  /** Absolute URL for paper texture — relative `assets/` breaks under file:// if base URI is wrong. */
  function resolveClippingPaperTextureUrl(raw) {
    if (raw === null || raw === false) return null;
    const src = String(raw !== undefined ? raw : DEFAULTS.paperTextureUrl || '').trim();
    if (!src) return null;
    if (/^(https?:|data:|blob:)/i.test(src)) return src;

    const rel =
      src.startsWith('assets/') ? src : 'assets/quilt-paper-card-texture.png';
    const fromLib = resolveAssetFromLibScripts(rel);
    if (fromLib) return fromLib;

    const bases = [];
    if (typeof document !== 'undefined' && document.baseURI) bases.push(document.baseURI);
    if (typeof location !== 'undefined' && location.href) bases.push(location.href);

    for (const base of bases) {
      try {
        if (rel.startsWith('assets/') && /\/lib\//i.test(base)) {
          return new URL(`../${rel}`, base).href;
        }
        return new URL(src, base).href;
      } catch (_) {
        /* */
      }
    }
    return src;
  }

  function installPaperTextureCssVar() {
    if (typeof document === 'undefined') return;
    const url = resolveClippingPaperTextureUrl();
    if (!url) return;
    document.documentElement.style.setProperty(
      '--quilt-paper-card-texture',
      `url("${String(url).replace(/"/g, '%22')}")`,
      'important'
    );
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installPaperTextureCssVar);
    } else {
      installPaperTextureCssVar();
    }
  }

  function loadPatternImage(key, src) {
    if (patternCache[key]) return Promise.resolve(patternCache[key]);
    if (patternPromises[key]) return patternPromises[key];
    if (typeof Image === 'undefined') return Promise.resolve(null);
    const resolvedSrc =
      key === 'paper' ? resolveClippingPaperTextureUrl(src) || src : src;
    patternPromises[key] = new Promise((resolve) => {
      const img = new Image();
      if (imageSrcUsesCrossOrigin(resolvedSrc)) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        patternCache[key] = img;
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = resolvedSrc;
    });
    return patternPromises[key];
  }

  /** Preload SVG grains + optional paper JPEG (call before render). */
  async function ensureClippingSurfaceAssets(cfg = DEFAULTS) {
    const jobs = [
      loadPatternImage('card', CARD_GRAIN_SVG),
      loadPatternImage('viewport', VIEWPORT_GRAIN_SVG)
    ];
    const paperUrl = resolveClippingPaperTextureUrl(cfg.paperTextureUrl);
    if (paperUrl) {
      jobs.push(loadPatternImage('paper', paperUrl));
    }
    await Promise.allSettled(jobs);
  }

  /** After `ensureClippingSurfaceAssets` — surfaces whether nightly export lost paper/grain. */
  function getClippingAssetDiagnostics(cfg = DEFAULTS) {
    return {
      exportRev: CLIPPING_EXPORT_REV,
      paperTextureUrl: cfg.paperTextureUrl || null,
      paperLoaded: !!(patternCache.paper?.naturalWidth),
      cardGrainLoaded: !!(patternCache.card?.naturalWidth),
      viewportGrainLoaded: !!(patternCache.viewport?.naturalWidth)
    };
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

  /**
   * Shared newsprint field (clipping + speaker cutout): flat paper, card grain — no JPEG multiply.
   * Halftone + viewport grain go on top of ink via `drawNewsprintTextureOverlay`.
   */
  function drawNewsprintSurfaceStack(ctx, w, h, cfgIn = {}) {
    const width = Math.max(1, Math.round(Number(w) || 1));
    const cfg = withClippingTypography({
      ...DEFAULTS,
      ...cfgIn,
      paperTextureUrl: null,
      width,
      exportScale: 1
    });
    drawPaperBase(ctx, width, h, cfg);
    drawCardGrain(ctx, width, h, cfg);
    return cfg;
  }

  /** Halftone + turbulence grain over ink (multiply) — full frame when spread spans the canvas. */
  function drawNewsprintTextureOverlay(ctx, w, h, cfgIn = {}) {
    const width = Math.max(1, Math.round(Number(w) || 1));
    const height = Math.max(1, Math.round(Number(h) || 1));
    const cfg = withClippingTypography({
      ...DEFAULTS,
      ...cfgIn,
      paperTextureUrl: null,
      width,
      exportScale: 1
    });
    drawViewportTextureOverText(ctx, width, height, cfg, {
      centerX: 0,
      centerColW: width,
      bandTop: 0,
      bandH: height
    });
    return cfg;
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

  /** DOM `--quilt-clipping-body-size` (`clamp(0.78rem, 2.35vw, 1.02rem)`) at phone sheet width. */
  function clippingBodyDomPx(
    { rootPx = CLIPPING_DOM_ROOT_PX, viewportW = CLIPPING_DOM_VIEWPORT_W } = {}
  ) {
    const rem78 = 0.78 * rootPx;
    const vw235 = (2.35 / 100) * viewportW;
    const rem102 = 1.02 * rootPx;
    return Math.min(rem102, Math.max(rem78, vw235));
  }

  /** DOM `--quilt-clipping-body-size` in px, scaled for PNG width (1080 ≈ sheet on device). */
  function clippingBodyPxAtExportWidth(
    exportW = DEFAULTS.width,
    { rootPx = CLIPPING_DOM_ROOT_PX, viewportW = CLIPPING_DOM_VIEWPORT_W } = {}
  ) {
    const domPx = clippingBodyDomPx({ rootPx, viewportW });
    return Math.max(8, Math.round((exportW / CLIPPING_DOM_SHEET_W) * domPx));
  }

  /** Minimum readable center quote size in DOM px (hand-cut fit will not shrink below this). */
  function minCenterBodyDomPx(cfg = {}) {
    const merged = { ...DEFAULTS, ...cfg };
    if (Number(merged.minCenterBodyDomPx) > 0) return Number(merged.minCenterBodyDomPx);
    const target = clippingTargetBodyDomPx(merged);
    return Math.max(10, Math.round(target * 10) / 10);
  }

  function minCenterBodyExportPx(cfg = {}) {
    const exportW = Math.max(1, Math.round((cfg && cfg.width) || CLIPPING_DOM_SHEET_W));
    const domMin = minCenterBodyDomPx(cfg);
    return Math.max(8, Math.round((exportW / CLIPPING_DOM_SHEET_W) * domMin));
  }

  /**
   * Narrow PNGs shrink-wrap in export px; when shown smaller than sheet width, type scales down
   * with the image. Floor display width so on-screen body stays >= minBodyDomPx.
   * Floor uses the same displayScale as max (triptych ≈ 0.72× sheet) so short quotes do not
   * always expand to the full card column.
   */
  /** DOM px target for on-screen quote type (matches `--quilt-clipping-body-size` at phone sheet). */
  function clippingTargetBodyDomPx(opts = {}) {
    if (Number(opts.targetBodyDomPx) > 0) return Number(opts.targetBodyDomPx);
    return clippingBodyDomPx(opts);
  }

  function resolveClippingLayoutOpts(opts = {}) {
    const targetBodyDomPx = clippingTargetBodyDomPx(opts);
    const displayScale = Number(opts.displayScale) > 0 ? Number(opts.displayScale) : 1;
    const sheetDomPx = Number(opts.sheetDomPx) > 0 ? Number(opts.sheetDomPx) : CLIPPING_DOM_SHEET_W;
    const maxFromScale = Math.round(sheetDomPx * displayScale);
    const maxExplicit = Number(opts.maxDisplayWidthPx) > 0 ? Number(opts.maxDisplayWidthPx) : 0;
    return {
      displayScale,
      targetBodyDomPx,
      minBodyDomPx:
        Number(opts.minBodyDomPx) > 0 ? Number(opts.minBodyDomPx) : targetBodyDomPx,
      sheetDomPx,
      absoluteMinPx: Number(opts.absoluteMinPx) > 0 ? Number(opts.absoluteMinPx) : 200,
      maxDisplayWidthPx: maxExplicit > 0 ? maxExplicit : maxFromScale,
      minDisplayWidthPx: opts.minDisplayWidthPx
    };
  }

  /** Layout caps for mood-triptych quote clippings (on-screen, not IG carousel). */
  function resolveTriptychClippingLayoutOpts(extra = {}) {
    const target = clippingBodyDomPx(extra) * TRIPTYCH_QUOTE_TYPE_SCALE;
    return resolveClippingLayoutOpts({
      displayScale: TRIPTYCH_QUOTE_DISPLAY_SCALE,
      targetBodyDomPx: target,
      absoluteMinPx: 148,
      readabilityRefAspect: 1.32,
      maxReadabilityScale: 1.65,
      ...extra
    });
  }

  /** Layout caps for mood-collage quote PNG (Firebase nightly — scale tall clippings for legibility). */
  function resolveCollageClippingLayoutOpts(extra = {}) {
    const target = clippingBodyDomPx(extra) * TRIPTYCH_QUOTE_TYPE_SCALE;
    return resolveClippingLayoutOpts({
      displayScale: 0.96,
      targetBodyDomPx: target,
      absoluteMinPx: 148,
      readabilityRefAspect: 1.32,
      maxReadabilityScale: 1.72,
      ...extra
    });
  }

  /** Layout caps for #screen-quote newspaper clipping (top half above color sliders). */
  function resolveQuoteScreenClippingLayoutOpts(extra = {}) {
    const target = clippingBodyDomPx(extra) * TRIPTYCH_QUOTE_TYPE_SCALE;
    return resolveClippingLayoutOpts({
      displayScale: QUOTE_SCREEN_DISPLAY_SCALE,
      targetBodyDomPx: target,
      absoluteMinPx: 132,
      readabilityRefAspect: 1.32,
      maxReadabilityScale: 1.72,
      ...extra
    });
  }

  function clippedDomWidthFromImagePx(clippedW, renderWidthPx) {
    const rw = Math.max(1, Number(renderWidthPx) || Number(clippedW) || 1);
    return (Number(clippedW) / rw) * CLIPPING_DOM_SHEET_W;
  }

  /**
   * Firebase PNGs for long quotes are taller and type is often shrunk at export.
   * Scale display width so on-screen text stays readable (same PNG, larger CSS size).
   */
  function quoteClippingReadabilityScale(clippedW, clippedH, opts = {}) {
    const w = Math.max(1, Number(clippedW) || 1);
    const h = Math.max(1, Number(clippedH) || 1);
    const aspect = h / w;
    const refAspect =
      Number(opts.readabilityRefAspect) > 0 ? Number(opts.readabilityRefAspect) : 1.32;
    const maxScale =
      Number(opts.maxReadabilityScale) > 0 ? Number(opts.maxReadabilityScale) : 1.65;
    if (aspect <= refAspect) return 1;
    const ratio = aspect / refAspect;
    return Math.min(maxScale, Math.max(1, Math.pow(ratio, 0.55)));
  }

  function resolveQuoteClippingDisplayLayout(clippedW, clippedH, renderWidthPx, opts = {}) {
    const w = Math.max(1, Number(clippedW) || 1);
    const h = Math.max(1, Number(clippedH) || 1);
    const rw = Math.max(1, Number(renderWidthPx) || w);
    const cfg = withClippingTypography({ width: rw, exportScale: 1 });
    const layoutOpts = resolveClippingLayoutOpts(opts);
    const contentW = clippedDomWidthFromImagePx(w, rw);
    const readability = quoteClippingReadabilityScale(w, h, layoutOpts);
    const minW =
      Number(layoutOpts.minDisplayWidthPx) > 0
        ? Number(layoutOpts.minDisplayWidthPx)
        : minClippingDisplayWidthDomPx(layoutOpts);
    const maxW = maxClippingDisplayWidthDomPx(layoutOpts);
    let displayWidthPx = Math.min(maxW, Math.max(minW, contentW));
    if (readability > 1) {
      displayWidthPx = Math.min(
        Math.round(maxW * readability),
        Math.max(minW, Math.round(displayWidthPx * readability))
      );
    }
    const displayHeightPx = Math.max(1, Math.round((h / w) * displayWidthPx));
    return {
      displayWidthPx,
      displayHeightPx,
      contentWidthPx: contentW,
      effectiveBodyDomPx: effectiveCenterBodyDomPx(cfg),
      readabilityScale: readability
    };
  }

  function minClippingDisplayWidthDomPx(opts = {}) {
    const bodyDom = clippingTargetBodyDomPx(opts);
    const minBody = Number(opts.minBodyDomPx) > 0 ? Number(opts.minBodyDomPx) : bodyDom;
    const sheetW = Number(opts.sheetDomPx) > 0 ? Number(opts.sheetDomPx) : CLIPPING_DOM_SHEET_W;
    const scale = Number(opts.displayScale) > 0 ? Number(opts.displayScale) : 1;
    const maxW = sheetW * scale;
    const floorW = (sheetW * scale * minBody) / Math.max(bodyDom, 1);
    const absoluteMin = Number(opts.absoluteMinPx) > 0 ? Number(opts.absoluteMinPx) : 200;
    return Math.min(maxW, Math.max(floorW, absoluteMin * scale));
  }

  function maxClippingDisplayWidthDomPx(opts = {}) {
    const sheetW = Number(opts.sheetDomPx) > 0 ? Number(opts.sheetDomPx) : CLIPPING_DOM_SHEET_W;
    const scale = Number(opts.displayScale) > 0 ? Number(opts.displayScale) : 1;
    if (Number(opts.maxDisplayWidthPx) > 0) return Number(opts.maxDisplayWidthPx);
    return sheetW * scale;
  }

  function withClippingTypography(cfg = {}) {
    const merged = { ...DEFAULTS, ...cfg };
    const width = resolveClippingExportWidth(merged);
    const widthScale = width / CLIPPING_DOM_SHEET_W;
    const bodyPx =
      typeof merged.bodyPx === 'number' && merged.bodyPx > 0
        ? merged.bodyPx
        : clippingBodyPxAtExportWidth(width);
    const centerColMaxW =
      merged.centerColMaxW > 0
        ? Math.round(merged.centerColMaxW * widthScale)
        : merged.centerColMaxW;
    const centerColMinW =
      merged.centerColMinW > 0
        ? Math.round(merged.centerColMinW * widthScale)
        : merged.centerColMinW;
    return {
      ...merged,
      width,
      centerColMaxW,
      centerColMinW,
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

  /** Keep in sync with lib/odq-scanner-bed.js PROFILES + applyScannerBedVars(). */
  const SCANNER_PROFILES = {
    newsprint: {
      bloomOpacity: 0.07,
      irisOpacity: 0.05,
      bloomX: 28,
      bloomY: 22,
      bloomSize: 68,
      irisAngle: 132
    },
    speakerCutout: {
      bloomOpacity: 0.15,
      irisOpacity: 0.05,
      bloomX: 28,
      bloomY: 22,
      bloomSize: 72,
      irisAngle: 132
    },
    riso: {
      bloomOpacity: 0.065,
      irisOpacity: 0.034,
      bloomX: 26,
      bloomY: 20,
      bloomSize: 64,
      irisAngle: 128
    },
    colorCard: {
      bloomOpacity: 0.058,
      irisOpacity: 0.032,
      bloomX: 24,
      bloomY: 18,
      bloomSize: 70,
      irisAngle: 128
    }
  };

  function seededRandomFrom(seed) {
    let s = seed >>> 0;
    return function next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function resolveScannerBedMetrics(seedKey, profileName = 'newsprint') {
    const profile = SCANNER_PROFILES[profileName] || SCANNER_PROFILES.newsprint;
    const rand = seededRandomFrom(hashDateKeySeed(String(seedKey || 'odq')));
    return {
      bloomX: profile.bloomX + (rand() - 0.5) * 8,
      bloomY: profile.bloomY + (rand() - 0.5) * 6,
      bloomSize: profile.bloomSize + (rand() - 0.5) * 10,
      irisAngle: profile.irisAngle + (rand() - 0.5) * 24,
      bloomOpacity: Math.max(0.04, profile.bloomOpacity + (rand() - 0.5) * 0.008),
      irisOpacity: Math.max(0.028, profile.irisOpacity + (rand() - 0.5) * 0.006)
    };
  }

  /** Offscreen soft-light layer (matches CSS mix-blend-mode: soft-light). */
  function applySoftLightLayer(ctx, w, h, paintLayer) {
    if (!paintLayer) return;
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    const lctx = layer.getContext('2d');
    if (!lctx) return;
    paintLayer(lctx, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }

  function scannerGradientLine(w, h, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const cx = w / 2;
    const cy = h / 2;
    const len = Math.max(w, h);
    return {
      x1: cx - Math.cos(rad) * len,
      y1: cy - Math.sin(rad) * len,
      x2: cx + Math.cos(rad) * len,
      y2: cy + Math.sin(rad) * len
    };
  }

  /** Flatbed scanner bloom + iridescence — upper-left biased, not centered. */
  function drawScannerBed(ctx, w, h, seedKey, profileName = 'newsprint') {
    if (!w || !h) return;
    const m = resolveScannerBedMetrics(seedKey, profileName);
    const cx = (w * m.bloomX) / 100;
    const cy = (h * m.bloomY) / 100;
    const rx = (w * m.bloomSize) / 100;
    const ry = rx * (52 / 68);

    applySoftLightLayer(ctx, w, h, (lctx) => {
      lctx.save();
      lctx.translate(cx, cy);
      lctx.scale(1, ry / rx);
      const bloom = lctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      bloom.addColorStop(0, `rgba(255, 255, 255, ${m.bloomOpacity})`);
      bloom.addColorStop(0.72, 'rgba(255, 255, 255, 0)');
      lctx.fillStyle = bloom;
      lctx.fillRect(-rx, (-ry / rx) * rx, rx * 2, ((ry / rx) * rx) * 2);
      lctx.restore();
    });

    const line = scannerGradientLine(w, h, m.irisAngle);
    applySoftLightLayer(ctx, w, h, (lctx) => {
      const iris = lctx.createLinearGradient(line.x1, line.y1, line.x2, line.y2);
      iris.addColorStop(0, `rgba(186, 198, 212, ${m.irisOpacity})`);
      iris.addColorStop(0.33, `rgba(210, 196, 218, ${m.irisOpacity})`);
      iris.addColorStop(0.66, `rgba(196, 210, 198, ${m.irisOpacity})`);
      iris.addColorStop(0.68, 'rgba(196, 210, 198, 0)');
      lctx.fillStyle = iris;
      lctx.fillRect(0, 0, w, h);
    });
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

  /** Quote body uses intentional Notion/Firestore line breaks (poem layout). */
  function quoteBodyHasHardLineBreaks(text) {
    return /\r?\n/.test(String(text || ''));
  }

  /** Runs for quote body only — stop before em dash + speaker name. */
  function bodyRunsFromQuoteRuns(runs) {
    const out = [];
    for (const run of runs) {
      const t = String(run.text || '');
      if (t.includes('\u2014')) {
        const before = t.split('\u2014')[0];
        if (before) out.push({ ...run, text: before });
        break;
      }
      out.push(run);
    }
    return out.length ? out : runs;
  }

  /** Split styled runs into one group per hard line break (`\n`). */
  function splitRunsAtHardBreaks(runs) {
    const groups = [[]];
    for (const run of runs) {
      const parts = String(run.text || '').split(/(\r?\n)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\r?\n$/.test(part)) {
          groups.push([]);
          continue;
        }
        groups[groups.length - 1].push({ ...run, text: part });
      }
    }
    return groups.filter((g) => g.some((r) => String(r.text || '').trim()));
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

  /** Resolved quote body for spread/crop (Firestore pins may use `body` instead of `text`). */
  function quoteClippingText(q) {
    return stripTrailDash(q?.text ?? q?.body);
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
    const text = quoteClippingText(q);
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
    const text = quoteClippingText(q);
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
      if (quoteBodyHasHardLineBreaks(text)) {
        runs.push({ text: '\n', bold: false, italic: false, underline: false, caps: false });
        runs.push(runWithClippingStyle(authorLine, speakerStyle));
      } else {
        runs.push({ text: ' \u2014 ', bold: false, italic: false, underline: false, caps: false });
        runs.push(runWithClippingStyle(authorLine, speakerStyle));
      }
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

  /** Prefer breaking at hyphens before mid-word char splits (e.g. self-experience). */
  function splitPartAtHyphens(part) {
    if (!part || /^\s+$/.test(part) || !part.includes('-')) return [part];
    const chunks = String(part).split('-');
    const out = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const piece = i < chunks.length - 1 ? `${chunks[i]}-` : chunks[i];
      if (piece) out.push(piece);
    }
    return out.length ? out : [part];
  }

  /** Split at hyphens only when the unsplit token cannot fit (avoids justify gaps inside fully-formed). */
  function wrapSegmentsForPart(ctx, run, part, maxWidth, line, lineW, px) {
    if (!part || /^\s+$/.test(part) || !part.includes('-')) return [part];
    setFont(ctx, px, run);
    const wholeW = ctx.measureText(part).width;
    if (wholeW <= maxWidth && (!line.length || lineW + wholeW <= maxWidth)) return [part];
    return splitPartAtHyphens(part);
  }

  function appendPartToLines(ctx, lines, line, lineW, run, part, maxWidth, px) {
    if (!part) return { line, lineW };
    if (part === '\n' || /^\r?\n$/.test(part)) {
      if (line.length) lines.push(line);
      return { line: [], lineW: 0 };
    }
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

    if (line.length && lineW > 0) {
      lines.push(line);
      line = [];
      lineW = 0;
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

  function runHasEmphasis(run) {
    return !!(run?.bold || run?.italic || run?.underline || run?.caps);
  }

  /** Split runs at whitespace and hard line breaks — `\n` always starts a new line. */
  function runWrapParts(run) {
    const t = String(run.text || '');
    if (!t) return [];
    const out = [];
    const chunks = t.split(/(\r?\n)/);
    for (const chunk of chunks) {
      if (!chunk) continue;
      if (/^\r?\n$/.test(chunk)) {
        out.push('\n');
        continue;
      }
      out.push(...chunk.split(/(\s+)/).filter((p) => p.length));
    }
    return out;
  }

  function wrapRuns(ctx, runs, maxWidth, px) {
    const lines = [];
    let line = [];
    let lineW = 0;
    for (const run of runs) {
      const parts = runWrapParts(run);
      for (const part of parts) {
        const segments = wrapSegmentsForPart(ctx, run, part, maxWidth, line, lineW, px);
        for (const segment of segments) {
          const next = appendPartToLines(ctx, lines, line, lineW, run, segment, maxWidth, px);
          line = next.line;
          lineW = next.lineW;
        }
      }
    }
    if (line.length) lines.push(line);
    return lines.length ? lines : [[{ text: '', bold: false, italic: false, underline: false, caps: false }]];
  }

  function resolveColumnPadPair(cfg, role) {
    const outer = cfg.spreadPadX;
    const rule = cfg.columnRuleTextPadPx ?? DEFAULTS.columnRuleTextPadPx;
    if (role === 'center') return { padLeft: rule, padRight: rule };
    if (role === 'left') return { padLeft: outer, padRight: rule };
    if (role === 'right') return { padLeft: rule, padRight: outer };
    return { padLeft: outer, padRight: outer };
  }

  function layoutColumn(ctx, runs, colWidth, px, padOpts = DEFAULTS.spreadPadX) {
    const padLeft =
      typeof padOpts === 'number' ? padOpts : padOpts?.padLeft ?? DEFAULTS.spreadPadX;
    const padRight =
      typeof padOpts === 'number' ? padOpts : padOpts?.padRight ?? DEFAULTS.spreadPadX;
    const innerW = Math.max(1, colWidth - padLeft - padRight);
    const wrapped = wrapRuns(ctx, runs, innerW, px);
    const lineStep = px * (typography.lineHeight || DEFAULTS.lineHeight);
    return { wrapped, textH: wrapped.length * lineStep, lineStep, innerW, padX: padLeft, padRight };
  }

  const SPACE_RUN = { text: ' ', bold: false, italic: false, underline: false, caps: false };

  /** Repeat neighbor block with only a space between copies (no embedded duplicate in one string). */
  function runsForFilledNeighborColumn(mctx, q, colW, sidePx, targetMinH, padOpts) {
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
    let layout = layoutColumn(mctx, [{ ...plainRun, text: full }], colW, sidePx, padOpts);
    let guard = 0;
    while (layout.textH < targetMinH && guard < 16) {
      full += ` ${block}`;
      layout = layoutColumn(mctx, [{ ...plainRun, text: full }], colW, sidePx, padOpts);
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

  /** Rejoin wrap splits like fully- + formed: so full justify does not stretch mid-word. */
  function glueHyphenWrapFragmentsForJustify(words) {
    if (!words.length) return words;
    const out = [{ ...words[0] }];
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      const prev = out[out.length - 1];
      if (/-$/.test(String(prev.text || '')) && String(w.text || '').trim()) {
        prev.text += w.text;
        prev.bold = prev.bold || w.bold;
        prev.italic = prev.italic || w.italic;
        prev.underline = prev.underline || w.underline;
        prev.caps = prev.caps || w.caps;
      } else {
        out.push({ ...w });
      }
    }
    return out;
  }

  function tokenizeLineForJustify(runs) {
    return glueHyphenWrapFragmentsForJustify(
      gluePunctuationForJustify(tokenizeLineIntoWords(runs))
    );
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

  function maxJustifyGapRatio(mctx, wrapped, px, innerW) {
    if (!innerW) return 0;
    let maxR = 0;
    for (const line of wrapped) {
      const gap = measureJustifyLineGap(mctx, line, px, innerW);
      maxR = Math.max(maxR, gap / innerW);
    }
    return maxR;
  }

  function resolveCenterLineAlign(ctx, runs, px, innerW, cfg, { isLastLine = false, forceLeft = false } = {}) {
    if (forceLeft) return 'left';
    const words = tokenizeLineForJustify(runs);
    if (words.length < 2) return 'left';
    const gap = measureJustifyLineGap(ctx, runs, px, innerW);
    const maxRatio = Number(cfg.justifyMaxGapLineWidthRatio ?? DEFAULTS.justifyMaxGapLineWidthRatio);
    if (Number.isFinite(maxRatio) && maxRatio > 0 && innerW > 0 && gap / innerW > maxRatio) {
      return 'left';
    }
    if (isLastLine) {
      const lastLineLeftGapMax = domToExportPx(
        cfg,
        cfg.justifyLastLineLeftMinGapDomPx ?? DEFAULTS.justifyLastLineLeftMinGapDomPx
      );
      if (gap > lastLineLeftGapMax) return 'left';
    }
    return 'justify';
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

  /** Runs for the first N quote words (keywords may split across lines). */
  function extractFirstWordsRuns(runs, wordCount) {
    const out = [];
    let count = 0;
    for (const run of runs) {
      if (count >= wordCount) return out;
      const t = String(run.text || '');
      if (!t.trim()) continue;
      const parts = t
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

  /** True when line 1 continues past a sentence-ending `.` or `;` (e.g. `yourself. But` or `yourself.But`). */
  function firstWrappedLineCrossesSentenceBreak(wrapped) {
    const text = firstWrappedLineText(wrapped);
    return /[.;]\s+\S/.test(text) || /[.;][A-Za-z]/.test(text);
  }

  /** Word units on wrapped line 1 (same rules as `wordsFromRuns`). */
  function firstLineWordsFromWrapped(wrapped) {
    return wordsFromRuns(wrapped[0] || []);
  }

  function firstWrappedLineWordCount(wrapped) {
    return firstLineWordsFromWrapped(wrapped).length;
  }

  function normalizeWordUnitToken(token) {
    return String(token || '')
      .replace(/[.;,:!?]+$/, '')
      .trim();
  }

  /** Line 1 must stay within `cap` quote words and match the start of the body. */
  function firstWrappedLineMatchesWordCap(wrapped, cap, targetWords) {
    if (firstWrappedLineCrossesSentenceBreak(wrapped)) return false;
    const got = firstLineWordsFromWrapped(wrapped);
    if (got.length > cap) return false;
    const want = targetWords.slice(0, cap);
    if (got.length > want.length) return false;
    for (let i = 0; i < got.length; i += 1) {
      if (normalizeWordUnitToken(got[i]) !== normalizeWordUnitToken(want[i])) return false;
    }
    return got.length > 0;
  }

  /** Plain word tokens from runs — first_line_count always counts words, not keyword phrases. */
  function wordsFromRuns(runs) {
    const words = [];
    for (const run of runs) {
      const t = String(run.text || '');
      if (!t.trim()) continue;
      const parts = t
        .split(/(\s+)/)
        .filter((p) => p.length);
      for (const part of parts) {
        if (!/^\s+$/.test(part)) words.push(part);
      }
    }
    return words;
  }

  /** Quote body only — exclude em dash + speaker name from first-line word cap. */
  function runsForFirstLineWordCount(runs) {
    const out = [];
    for (const run of runs) {
      const t = String(run.text || '');
      if (t.includes('\u2014')) {
        const before = t.split('\u2014')[0].trim();
        if (before) out.push({ ...run, text: before });
        break;
      }
      out.push(run);
    }
    return out.length ? out : runs;
  }

  /** Widest inner width that still keeps line 1 at exactly `cap` quote words. */
  function maxInnerWidthForFirstLineWordCap(mctx, runs, px, cap, targetWords, innerLo, maxInner) {
    let maxOk = innerLo;
    for (let tryW = innerLo; tryW <= maxInner; tryW += 1) {
      const wrapped = wrapRuns(mctx, runs, tryW, px);
      if (!firstWrappedLineMatchesWordCap(wrapped, cap, targetWords)) break;
      maxOk = tryW;
    }
    return maxOk;
  }

  /** Raw Notion / Firestore first-line word count before cfg fallback. */
  function firstLineCountFromQuoteFields(quote) {
    if (!quote || typeof quote !== 'object') return null;
    const candidates = [
      quote.firstLineCount,
      quote.first_line_count,
      quote.firstLineCountSnapshot,
      quote.first_line_count_snapshot,
      quote.centerFirstLineMaxWords,
      quote.center_first_line_max_words,
      quote.notionProperties?.first_line_count?.value,
      quote.notionProperties?.firstLineCount?.value
    ];
    for (const raw of candidates) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return Math.max(1, Math.min(12, Math.round(n)));
    }
    return null;
  }

  /**
   * Per-quote first-line word count (Notion `first_line_count` on catalog doc).
   * Falls back to cfg.firstLineCount (default 3).
   */
  function resolveFirstLineCount(quote, cfg) {
    const fromQuote = firstLineCountFromQuoteFields(quote);
    if (fromQuote != null) return fromQuote;
    const fallback = Number(cfg?.firstLineCount ?? cfg?.centerFirstLineMaxWords);
    return Math.max(1, Math.min(12, Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 3));
  }

  function widestWrappedLineWidth(mctx, wrapped, px) {
    let widest = 0;
    for (const line of wrapped) {
      widest = Math.max(widest, Math.ceil(measureRunsWidth(mctx, line, px)));
    }
    return widest;
  }

  /** Center column width for poem-style quotes with explicit `\n` line breaks. */
  function fitCenterColumnWidthForHardBreaks(mctx, runs, px, padOpts, cfg) {
    const padLeft =
      typeof padOpts === 'number' ? padOpts : padOpts?.padLeft ?? DEFAULTS.spreadPadX;
    const padRight =
      typeof padOpts === 'number' ? padOpts : padOpts?.padRight ?? DEFAULTS.spreadPadX;
    setFont(mctx, px);
    const maxAllowedInner =
      cfg.centerColMaxW > 0 ? Math.max(24, cfg.centerColMaxW - padLeft - padRight) : 2000;
    const groups = splitRunsAtHardBreaks(runs);
    let innerW = 24;
    for (const group of groups) {
      innerW = Math.max(
        innerW,
        widestWrappedLineWidth(mctx, wrapRuns(mctx, group, maxAllowedInner, px), px)
      );
    }
    innerW = Math.min(Math.max(24, innerW), maxAllowedInner);
    let colW = Math.ceil(innerW + padLeft + padRight);
    if (cfg.centerColMinW > 0) colW = Math.max(cfg.centerColMinW, colW);
    if (cfg.centerColMaxW > 0) colW = Math.min(cfg.centerColMaxW, colW);
    return colW;
  }

  /** Center column: minimum width for line 1, expanded only to fit the widest rendered line. */
  function fitCenterColumnWidth(mctx, runs, px, padOpts, cfg, firstLineMaxWords) {
    const bodyText = bodyRunsFromQuoteRuns(runs)
      .map((r) => String(r.text || ''))
      .join('');
    if (quoteBodyHasHardLineBreaks(bodyText)) {
      return fitCenterColumnWidthForHardBreaks(mctx, runs, px, padOpts, cfg);
    }
    const padLeft =
      typeof padOpts === 'number' ? padOpts : padOpts?.padLeft ?? DEFAULTS.spreadPadX;
    const padRight =
      typeof padOpts === 'number' ? padOpts : padOpts?.padRight ?? DEFAULTS.spreadPadX;
    setFont(mctx, px);
    const bodyRuns = runsForFirstLineWordCount(runs);
    const words = wordsFromRuns(bodyRuns);
    const maxWords =
      Number.isFinite(firstLineMaxWords) && firstLineMaxWords > 0
        ? firstLineMaxWords
        : resolveFirstLineCount(null, cfg);
    const cap = Math.max(1, Math.min(maxWords, words.length));
    const firstRuns = extractFirstWordsRuns(bodyRuns, cap);
    const maxInner = Math.max(
      Math.ceil(measureRunsWidth(mctx, firstRuns, px)) + 2,
      cfg.centerColMaxW > 0 ? cfg.centerColMaxW - padLeft - padRight : 2000
    );

    let innerLo = Math.ceil(measureRunsWidth(mctx, firstRuns, px));
    let foundLo = -1;
    let bestWords = 0;
    const floorW = Math.max(24, Math.ceil(measureRunsWidth(mctx, extractFirstWordsRuns(bodyRuns, 1), px)));
    for (let tryW = floorW; tryW <= maxInner; tryW += 1) {
      const wrapped = wrapRuns(mctx, runs, tryW, px);
      if (!firstWrappedLineMatchesWordCap(wrapped, cap, words)) continue;
      const wordCount = firstLineWordsFromWrapped(wrapped).length;
      if (wordCount > bestWords || foundLo < 0) {
        bestWords = wordCount;
        foundLo = tryW;
      }
    }
    innerLo = foundLo >= 0 ? foundLo : maxInner;

    const maxOk = maxInnerWidthForFirstLineWordCap(mctx, runs, px, cap, words, innerLo, maxInner);

    let innerW = innerLo;
    for (let guard = 0; guard < 16; guard += 1) {
      const wrapped = wrapRuns(mctx, runs, innerW, px);
      if (!firstWrappedLineMatchesWordCap(wrapped, cap, words)) break;
      const widest = widestWrappedLineWidth(mctx, wrapped, px);
      const next = Math.min(maxOk, Math.max(innerLo, widest));
      if (next <= innerW) break;
      innerW = next;
    }

    const maxGapRatio = Number(cfg.justifyMaxGapLineWidthRatio ?? DEFAULTS.justifyMaxGapLineWidthRatio);
    if (Number.isFinite(maxGapRatio) && maxGapRatio > 0) {
      let chosen = innerW;
      let bestRatio = Infinity;
      for (let tryW = innerLo; tryW <= maxOk; tryW += 1) {
        const wrapped = wrapRuns(mctx, runs, tryW, px);
        if (!firstWrappedLineMatchesWordCap(wrapped, cap, words)) continue;
        const ratio = maxJustifyGapRatio(mctx, wrapped, px, tryW);
        if (ratio <= maxGapRatio) {
          chosen = tryW;
          break;
        }
        if (ratio < bestRatio) {
          bestRatio = ratio;
          chosen = tryW;
        }
      }
      innerW = Math.min(maxOk, Math.max(innerW, chosen));
    }

    innerW = Math.min(maxOk, innerW);

    let colW = Math.ceil(innerW + padLeft + padRight);
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
    const centerPoemLayout = quoteBodyHasHardLineBreaks(quoteClippingText(opts.today));
    const todayRuns = plainRunsForQuote(opts.today, { neighbor: false, dateKey: clipDateKey });
    const centerFirstLineWords = resolveFirstLineCount(opts.today, cfg);
    const centerPads = resolveColumnPadPair(cfg, 'center');
    const centerColW = fitCenterColumnWidth(
      mctx,
      todayRuns,
      centerPx,
      centerPads,
      cfg,
      centerFirstLineWords
    );
    const gutterPx = Math.max(
      0,
      Math.round(domToExportPx(cfg, cfg.columnGutterDomPx ?? DEFAULTS.columnGutterDomPx))
    );
    const totalGutter = gutterPx * 2;
    const sideColW = Math.max(48, Math.floor((W - centerColW - totalGutter) / 2));
    const centerX = sideColW + gutterPx;
    const rightColX = centerX + centerColW + gutterPx;

    const spreadContentH = Math.ceil(cfg.spreadPadY * 2 + 420);
    const moodSpread =
      normalizeText(opts.goodDay) || normalizeText(opts.roughDay) || opts.sideMode === 'mood';
    const layouts = {
      left: null,
      today: layoutColumn(mctx, todayRuns, centerColW, centerPx, centerPads),
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
      if (opts.yesterday && normalizeText(quoteClippingText(opts.yesterday))) {
        const leftPads = resolveColumnPadPair(cfg, 'left');
        const yRuns = runsForFilledNeighborColumn(
          mctx,
          opts.yesterday,
          sideColW,
          sidePx,
          sideTargetH,
          leftPads
        );
        layouts.left = layoutColumn(mctx, yRuns, sideColW, sidePx, leftPads);
      }
      if (opts.tomorrow && normalizeText(quoteClippingText(opts.tomorrow))) {
        const rightPads = resolveColumnPadPair(cfg, 'right');
        const tRuns = runsForFilledNeighborColumn(
          mctx,
          opts.tomorrow,
          sideColW,
          sidePx,
          sideTargetH,
          rightPads
        );
        layouts.right = layoutColumn(mctx, tRuns, sideColW, sidePx, rightPads);
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
    const scannerSeed = moodSpread
      ? `${clipDateKey}:mood-spread`
      : `${clipDateKey}:quote-clipping`;
    drawScannerBed(ctx, W, spreadH, scannerSeed, 'newsprint');
    drawCardGrain(ctx, W, spreadH, cfg);

    const colXs = [0, centerX, rightColX];
    const dividerX1 = sideColW + gutterPx * 0.5;
    const dividerX2 = centerX + centerColW + gutterPx * 0.5;

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
        const sideY = ruleY1;
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
    for (let i = 0; i < centerLines.length; i++) {
      const lineAlign = centerPoemLayout
        ? 'left'
        : resolveCenterLineAlign(
            ctx,
            centerLines[i],
            centerPx,
            layouts.today.innerW,
            cfg,
            { isLastLine: i === centerLines.length - 1 }
          );
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
        const sideY = ruleY1;
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

    const bandPad = Math.max(
      Math.round(domToExportPx(cfg, cfg.ruleGap * 0.75)),
      Math.round(centerPx * 0.1)
    );
    /** Paper above top rule — hand-cut inward bulge + ruleGap breathing room. */
    const handCutTopPad = Math.max(
      0,
      Math.round(domToExportPx(cfg, resolveCropBandTopHandCutPadDomPx(cfg)))
    );
    const bandTop = Math.max(0, ruleY1 - handCutTopPad);
    const bandBottom = Math.min(spreadH, ruleY2 + ruleH + bandPad);
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
      bandH,
      ruleY1,
      ruleY2,
      ruleSpanW,
      ruleX0Center: (centerColW - ruleSpanW) / 2,
      hasHardLineBreaks: centerPoemLayout
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

  /** Stable per quilt day: exactly one keyword style (never bold+italic combos). */
  function clippingKeywordStylesForDateKey(dateKey) {
    const dk = String(dateKey || '').trim();
    if (!dk) return ['bold'];
    const seed = hashDateKeySeed(dk);
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

  /**
   * Per-day conservative inset inside the crop (hand-cut bites vary by dateKey seed).
   * Silhouette shape stays unique; type scales down on aggressive days.
   */
  function estimateHandCutSafePaddingDomPx(cfg, dateKey) {
    const rand = seededRandom(hashDateKeySeed(String(dateKey || 'our-daily').trim() || 'our-daily'));
    const margin = Number(cfg.handCutMarginDomPx ?? 0.5);
    const pivot =
      cfg.handCutTopBottomEdgePointEnabled === false
        ? 0
        : Number(cfg.handCutEdgePointDomPx ?? 6) * (0.38 + rand() * 0.28);
    const bite = cfg.handCutNotchesEnabled === false
      ? 0
      : Number(cfg.handCutBiteMaxDomPx ?? 8) * (0.55 + rand() * 0.42);
    const sideIn = Number(cfg.handCutSideInwardMaxDomPx ?? 8) * (0.62 + rand() * 0.36);
    const topBot = Number(cfg.handCutTopBottomTrimDomPx ?? 4) * (0.7 + rand() * 0.3);
    const macro = Number(cfg.handCutMacroDomPx ?? 5) * (0.35 + rand() * 0.25);
    const horizontal = margin + pivot + bite + sideIn + macro + 1.5;
    const vertical = margin + pivot + bite + topBot + macro + 1.5;
    return { horizontal, vertical };
  }

  function centerQuoteBlockHeightPx(centerPx, textH, cfg) {
    const ruleH = exportRuleThickness(cfg);
    const textPad = Math.max(cfg.ruleTextGap, Math.round(centerPx * 0.35));
    return cfg.ruleGap * 2 + ruleH * 2 + textPad * 2 + textH;
  }

  function effectiveCenterBodyDomPx(cfg) {
    const exportW = Math.max(1, Math.round(cfg.width || CLIPPING_DOM_SHEET_W));
    return (Number(cfg.centerBodyPx) / exportW) * CLIPPING_DOM_SHEET_W;
  }

  /**
   * Shrink center column type so ink stays inside the hand-cut safe zone for this dateKey.
   * Silhouette polygon is unchanged — only letter size and column width adjust.
   */
  function resolveCenterBodyPxForHandCut(mctx, opts, cfgIn) {
    const base = withClippingTypography(cfgIn);
    if (base.handCutEnabled === false) return base;
    const dateKey =
      String(opts.dateKey || opts.today?.dateKey || '').trim() || 'our-daily';
    let centerPx = base.centerBodyPx;
    let lastScale = 1;
    for (let pass = 0; pass < 6; pass += 1) {
      const cfg = withClippingTypography({ ...cfgIn, centerBodyPx: centerPx, bodyPx: centerPx });
      const todayRuns = plainRunsForQuote(opts.today, { neighbor: false, dateKey });
      if (!todayRuns.length) return cfg;
      const firstLine = resolveFirstLineCount(opts.today, cfg);
      const centerPads = resolveColumnPadPair(cfg, 'center');
      const centerColW = fitCenterColumnWidth(
        mctx,
        todayRuns,
        centerPx,
        centerPads,
        cfg,
        firstLine
      );
      const colLayout = layoutColumn(mctx, todayRuns, centerColW, centerPx, centerPads);
      const textW = widestWrappedLineWidth(mctx, colLayout.wrapped, centerPx);
      const textH = colLayout.textH;
      const blockH = centerQuoteBlockHeightPx(centerPx, textH, cfg);
      const pad = estimateHandCutSafePaddingDomPx(cfg, dateKey);
      const insetX = domToExportPx(cfg, pad.horizontal);
      const insetY = domToExportPx(cfg, pad.vertical);
      const innerW = Math.max(1, centerColW - centerPads.padLeft - centerPads.padRight);
      const safeInnerW = Math.max(1, innerW - insetX * 2);
      const safeBlockH = Math.max(1, blockH - insetY * 2);
      const scale = Math.min(1, safeInnerW / Math.max(1, textW), safeBlockH / Math.max(1, textH));
      lastScale = scale;
      if (scale >= 0.985) {
        return { ...cfg, handCutTypographyScale: Math.min(1, lastScale) };
      }
      const minCenterPx = minCenterBodyExportPx(cfg);
      const nextPx = Math.floor(centerPx * scale * 0.97);
      if (nextPx < minCenterPx) {
        const floored = withClippingTypography({
          ...cfgIn,
          centerBodyPx: minCenterPx,
          bodyPx: minCenterPx
        });
        return { ...floored, handCutTypographyScale: Math.min(1, lastScale) };
      }
      centerPx = nextPx;
    }
    const minCenterPx = minCenterBodyExportPx(
      withClippingTypography({ ...cfgIn, centerBodyPx: centerPx, bodyPx: centerPx })
    );
    return {
      ...withClippingTypography({
        ...cfgIn,
        centerBodyPx: Math.max(minCenterPx, centerPx),
        bodyPx: Math.max(minCenterPx, centerPx)
      }),
      handCutTypographyScale: Math.min(1, lastScale)
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

  /** One scissor stroke along a segment (straight; optional mid kink + notch + long bulge). */
  function walkScissorStroke(ring, ax, ay, bx, by, opts) {
    const {
      rand,
      cx,
      cy,
      slip,
      kinkAmp,
      bite,
      outwardTab,
      longBulge,
      twoCuts,
      topBottomTrim,
      isSide,
      sideInMax,
      cleanLongEdge
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

    if (!ring.length) place(0, 0, 0);

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
    if (longBulge) {
      let d = longBulge.convex ? longBulge.depth : -longBulge.depth;
      if (longBulge.inwardOnly) d = -Math.abs(longBulge.depth);
      const t0 = Math.max(0.12, Math.min(0.88, longBulge.t0));
      stops.push({ t: t0, bulge: true, depth: d });
    }
    if (!cleanLongEdge) stops.push({ t: 1, kink: false, bite: false });
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
      } else if (stop.bulge) {
        const depth = stop.depth ?? longBulge?.depth ?? 0;
        const perp = cleanLongEdge ? 0 : slip * (rand() - 0.5);
        place(t, perp, depth);
      } else if (stop.kink) {
        place(t, slip * (rand() - 0.5) + kinkAmp * (rand() > 0.5 ? 1 : -1), 0);
      } else {
        place(t, slip * (rand() - 0.5), 0);
      }
      lastT = t;
    }
    if (lastT < 0.995) place(1, 0, 0);
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
   * Square-ish rect + outward pivot vertex on every edge (no corner chamfers).
   */
  function buildHandCutPolygon(w, h, seed, cfg) {
    const rand = seededRandom(seed);
    const cx = w / 2;
    const cy = h / 2;
    const inset = domToExportPx(cfg, resolveHandCutPolygonInsetDomPx(cfg));
    const pivotDepthBase = domToExportPx(cfg, cfg.handCutEdgePointDomPx ?? 6);

    const x0 = inset;
    const y0 = inset;
    const x1 = w - inset;
    const y1 = h - inset;
    const skew = domToExportPx(cfg, cfg.handCutMacroDomPx ?? 5) * 0.65;
    const cornerJitter = () => (rand() - 0.5) * 2 * skew * 0.45;
    const nominalTopLen = x1 - x0;
    const nominalSideLen = y1 - y0;
    const minSideLean = (edgeLen) => Math.max(skew * 1.45, edgeLen * 0.085);
    const minTopBottomLean = (edgeLen) => Math.max(skew * 1.45, edgeLen * 0.06);

    const tiltSign = () => (rand() > 0.5 ? 1 : -1);
    const applySideLean = (top, bottom, edgeLen) => {
      bottom.x = top.x + minSideLean(edgeLen) * tiltSign();
    };
    const applyTopBottomLean = (left, right, edgeLen) => {
      right.y = left.y + minTopBottomLean(edgeLen) * tiltSign();
    };

    const cTopL = { x: x0 + cornerJitter(), y: y0 + cornerJitter() };
    const cTopR = { x: x1 + cornerJitter(), y: y0 + cornerJitter() };
    const cBotR = { x: x1 + cornerJitter(), y: y1 + cornerJitter() };
    const cBotL = { x: x0 + cornerJitter(), y: y1 + cornerJitter() };
    applySideLean(cTopR, cBotR, nominalSideLen);
    applySideLean(cTopL, cBotL, nominalSideLen);
    applyTopBottomLean(cTopL, cTopR, nominalTopLen);
    applyTopBottomLean(cBotL, cBotR, nominalTopLen);

    const corners = [cTopL, cTopR, cBotR, cBotL];
    const pivotsEnabled = cfg.handCutTopBottomEdgePointEnabled !== false;

    function outwardPivotForSide(sideIdx) {
      const edgeKeys = [0, 2, 4, 6];
      const edgeSeed = hashDateKeySeed(`${seed >>> 0}:edge-pivot:${edgeKeys[sideIdx]}`);
      const edgeRand = seededRandom(edgeSeed);
      const a = corners[sideIdx];
      const b = corners[(sideIdx + 1) % 4];
      const edgeDx = b.x - a.x;
      const edgeDy = b.y - a.y;
      const len = Math.hypot(edgeDx, edgeDy) || 1;
      let nx = -edgeDy / len;
      let ny = edgeDx / len;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if ((mx - cx) * nx + (my - cy) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const side = edgeRand() > 0.5 ? 1 : -1;
      const along = Math.max(0.28, Math.min(0.72, 0.5 + side * (0.1 + edgeRand() * 0.12)));
      const depth = pivotDepthBase * (0.72 + edgeRand() * 0.28);
      const maxDepth = Math.min(
        depth,
        len * 0.065,
        Math.max(domToExportPx(cfg, 4), pivotDepthBase * 0.95)
      );
      return {
        x: a.x + edgeDx * along + nx * maxDepth,
        y: a.y + edgeDy * along + ny * maxDepth
      };
    }

    const ring = [];
    for (let i = 0; i < 4; i += 1) {
      ring.push(corners[i]);
      if (pivotsEnabled) ring.push(outwardPivotForSide(i));
    }
    return ring;
  }

  /**
   * Mood triptych cards: 4-corner shape + a subtle outward point on every edge.
   */
  function buildMoodTriptychHandCutPolygon(w, h, seed, cfg) {
    const rand = seededRandom(seed);
    const inset = domToExportPx(cfg, cfg.handCutMarginDomPx ?? 0.5);
    const shortSide = Math.min(w, h);
    const macro = domToExportPx(cfg, cfg.handCutMacroDomPx ?? 16);
    const cornerJitter = Math.max(1, Math.min(shortSide * 0.035, macro * 0.6));

    const cropEdge = String(cfg.moodTriptychCropEdge || '').trim();
    const cropPx = domToExportPx(cfg, cfg.handCutMacroDomPx ?? 16) * 0.34;
    let x0 = inset;
    let y0 = inset;
    let x1 = w - inset;
    let y1 = h - inset;
    if (cropEdge === 'left') x0 = Math.min(x1 - 10, x0 + cropPx);
    if (cropEdge === 'right') x1 = Math.max(x0 + 10, x1 - cropPx);
    if (cropEdge === 'top') y0 = Math.min(y1 - 10, y0 + cropPx);
    if (cropEdge === 'bottom') y1 = Math.max(y0 + 10, y1 - cropPx);

    const j = () => (rand() - 0.5) * 2 * cornerJitter;
    const clampX = (x) => Math.max(0, Math.min(w, x));
    const clampY = (y) => Math.max(0, Math.min(h, y));

    const topLeft = { x: clampX(x0 + j()), y: clampY(y0 + j()) };
    const topRight = { x: clampX(x1 + j()), y: clampY(y0 + j()) };
    const bottomRight = { x: clampX(x1 + j()), y: clampY(y1 + j()) };
    const bottomLeft = { x: clampX(x0 + j()), y: clampY(y1 + j()) };

    const corners = [topLeft, topRight, bottomRight, bottomLeft];
    const cx = (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4;
    const cy = (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4;
    const baseDepth = Math.max(6, Math.min(macro * 1.25, shortSide * 0.19));

    function outwardPointForSide(sideIdx) {
      const a = corners[sideIdx];
      const b = corners[(sideIdx + 1) % 4];
      const edgeDx = b.x - a.x;
      const edgeDy = b.y - a.y;
      const edgeLen = Math.hypot(edgeDx, edgeDy) || 1;
      let nx = -edgeDy / edgeLen;
      let ny = edgeDx / edgeLen;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if ((mx - cx) * nx + (my - cy) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const along = Math.max(0.18, Math.min(0.82, 0.5 + (rand() - 0.5) * 0.22));
      const pointDepth = baseDepth * (0.82 + rand() * 0.28);
      const baseX = a.x + edgeDx * along;
      const baseY = a.y + edgeDy * along;
      return {
        x: clampX(baseX + nx * pointDepth),
        y: clampY(baseY + ny * pointDepth)
      };
    }

    const ring = [];
    for (let i = 0; i < 4; i++) {
      ring.push(corners[i]);
      ring.push(outwardPointForSide(i));
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

  /** Peek strip width (export px) beside a content-sized center column. */
  function resolveVariablePeekWidths(centerColW, cfg) {
    const bleedX = Math.round(
      domToExportPx(
        cfg,
        cfg.peekHorizontalBleedDomPx ?? cfg.cropHorizontalBleedDomPx ?? cfg.cropEdgeBleedDomPx ?? 14
      )
    );
    const peekRatio = Number(cfg.peekRatio ?? DEFAULTS.peekRatio);
    const center = Math.max(48, Math.round(Number(centerColW) || 0));
    const r = peekRatio / Math.max(0.01, 1 - 2 * peekRatio);
    const peekBaseOut = Math.max(1, Math.round(center * r));
    const peekW = peekBaseOut + bleedX;
    const centerOutW = center;
    const outW = centerOutW + peekW * 2;
    return { centerOutW, peekW, peekBaseOut, outW, bleedX, peekRatio: r };
  }

  /**
   * Output px of `cropSpreadToClipping` — used as hand-cut reference frame so wide
   * mood spreads inherit the same silhouette proportions as the peek quote clipping.
   */
  function resolveQuoteCropOutputSize(spread, cfg) {
    const centerColW = Math.max(1, Number(spread?.centerColW) || 0);
    const bandH = Number(spread?.bandH) || 0;
    let outW;
    let centerOutW;
    if (centerColW > 0) {
      ({ outW, centerOutW } = resolveVariablePeekWidths(centerColW, cfg));
    } else {
      ({ outW, centerOutW } = resolveQuoteCropMetrics(cfg));
    }
    if (!bandH || bandH < 1) {
      return { outW, outH: Math.max(48, Math.round(outW * 0.38)), centerOutW };
    }
    const scale = centerOutW / centerColW;
    const bleed = verticalCropBleedSrcPx(cfg, scale);
    const srcH = bandH + bleed.top + bleed.bottom;
    const outH = Math.max(1, Math.ceil(srcH * scale));
    return { outW, outH, centerOutW };
  }

  function resolveClippingDisplayDensity(opts = {}, cfg = DEFAULTS) {
    const explicit = Number(opts.exportDensity ?? opts.devicePixelRatio);
    if (Number.isFinite(explicit) && explicit > 0) {
      return Math.min(Math.max(explicit, 1), 3);
    }
    const scale = typeof cfg.exportScale === 'number' && cfg.exportScale > 0 ? cfg.exportScale : 2;
    if (Number(opts.width) > 0 && scale <= 1) {
      return 2;
    }
    return Math.min(Math.max(scale, 1), 3);
  }

  /** Approximate DOM px width of a cropped clipping from export px. */
  function clippedDomWidthPx(clippedW, cfg) {
    const cfgW = Math.max(1, Math.round(cfg.width));
    return (Number(clippedW) / cfgW) * CLIPPING_DOM_SHEET_W;
  }

  /** PNG px needed when shown at resolved layout width (CSS px × DPR). */
  function minSharpClippingPx(clippedW, clippedH, cfg, density, layoutOpts = {}) {
    const layout = clippedDisplaySizePx(clippedW, clippedH, cfg, layoutOpts);
    return Math.max(48, Math.round(layout.displayWidthPx * density));
  }

  function clippedDisplaySizePx(clippedW, clippedH, cfg, opts = {}) {
    const w = Math.max(1, Number(clippedW) || 1);
    const h = Math.max(1, Number(clippedH) || 1);
    const contentW = clippedDomWidthPx(w, cfg);
    const minW =
      Number(opts.minDisplayWidthPx) > 0
        ? Number(opts.minDisplayWidthPx)
        : minClippingDisplayWidthDomPx(opts);
    const maxW = maxClippingDisplayWidthDomPx(opts);
    const displayWidthPx = Math.min(maxW, Math.max(minW, contentW));
    const displayHeightPx = Math.max(1, Math.round((h / w) * displayWidthPx));
    return { displayWidthPx, displayHeightPx, contentWidthPx: contentW };
  }

  /**
   * Variable-width crops can be < sheet×DPR px wide; re-render spread at higher width
   * so PNG pixels match retina display (avoids upscaling blur in the browser).
   */
  /** First opaque row in the center quote strip (peek exports ignore side peeks). */
  function measureCenterStripTopOpaqueRow(canvas, trimOpts = {}) {
    if (!canvas) return 0;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 2) return 0;
    let data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (err) {
      if (/tainted|cross-origin|SecurityError|getImageData/i.test(String(err?.message || err))) {
        return 0;
      }
      throw err;
    }
    const { x0, x1 } = centerStripBoundsForClippingCanvas(w, trimOpts);
    for (let y = 0; y < h; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (data[(y * w + x) * 4 + 3] > 8) return y;
      }
    }
    return 0;
  }

  /** Lab / smoke reference: spread → peek crop → hand-cut → default alpha trim (no export post-pass). */
  function composeLabPeekClippingCanvas(spread, cfg, dateKey) {
    let clipped = cropSpreadToClipping(spread, cfg);
    if (!clipped) return null;
    const dk = String(dateKey || '').trim() || 'our-daily';
    clipped = applyHandCutSilhouette(clipped, dk, cfg, { spread, peekCrop: true });
    return trimCanvasAlphaBounds(clipped, cfg);
  }

  function composeLabPeekResult(clipped, spread, cfg, opts, layoutOpts, lineMeta = null) {
    const layout = clippedDisplaySizePx(clipped.width, clipped.height, cfg, layoutOpts);
    const displayHeightPx = Math.max(
      1,
      Math.round((clipped.height / Math.max(1, clipped.width)) * layout.displayWidthPx)
    );
    const centerOnlyCanvas = spread ? cropSpreadCenterOnly(spread, cfg) : null;
    const centerOnlyWidth = centerOnlyCanvas?.width || 0;
    const peekWidthRatio = centerOnlyWidth > 0 ? clipped.width / centerOnlyWidth : 1;
    const minWidthRatio = 1.08;
    const peekPx = spread?.centerColW
      ? resolveVariablePeekWidths(spread.centerColW, cfg).peekW
      : 0;
    return {
      dataUrl: canvasToDataUrl(clipped),
      displayWidthPx: layout.displayWidthPx,
      displayHeightPx,
      contentWidthPx: layout.contentWidthPx,
      clippedWidth: clipped.width,
      clippedHeight: clipped.height,
      spreadCrop: 'peek',
      peekCrop: peekWidthRatio >= minWidthRatio,
      hasHardLineBreaks: !!spread?.hasHardLineBreaks,
      hasYesterdayText: !!normalizeText(quoteClippingText(opts.yesterday)),
      hasTomorrowText: !!normalizeText(quoteClippingText(opts.tomorrow)),
      centerOnlyWidth,
      peekWidthRatio,
      peekPxEachSide: peekPx,
      peekRatio: Number(cfg.peekRatio ?? DEFAULTS.peekRatio),
      firstLineUnits: lineMeta?.firstLineUnits ?? null,
      firstLineText: lineMeta?.firstLineText ?? null,
      aspectRatio: clipped.height > 0 ? clipped.width / clipped.height : 0,
      renderWidth: cfg.width,
      effectiveBodyDomPx: effectiveCenterBodyDomPx(cfg),
      handCutTypographyScale: 1,
      exportProfile: 'nightlyPeek',
      composePipeline: 'labPeek'
    };
  }

  async function composeLabPeekDataUrlAttempt(opts = {}) {
    opts = normalizeComposeExportOpts(opts);

    const measureCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!measureCanvas) return null;
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return null;

    const cfg = withClippingTypography({ ...DEFAULTS, ...opts, paperTextureUrl: null });
    typography = cfg;
    const today = opts.today || null;
    if (!today || !normalizeText(quoteClippingText(today))) return null;

    await Promise.all([
      ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx], cfg.fontFamily),
      ensureClippingSurfaceAssets(cfg)
    ]);

    const spread = renderFullSpread(mctx, opts, cfg);
    if (!spread?.canvas) return null;

    const dateKey =
      String(opts.dateKey || '').trim() ||
      String(opts.today?.dateKey || '').trim() ||
      '';
    const clipped = composeLabPeekClippingCanvas(spread, cfg, dateKey);
    if (!clipped) return null;

    const centerPads = resolveColumnPadPair(cfg, 'center');
    const centerLayout = layoutColumn(
      mctx,
      plainRunsForQuote(today, { neighbor: false, dateKey }),
      spread.centerColW,
      cfg.centerBodyPx,
      centerPads
    );
    const firstLineUnits = wordsFromRuns(centerLayout.wrapped[0] || []);

    return composeLabPeekResult(
      clipped,
      spread,
      cfg,
      opts,
      resolveClippingLayoutOpts(opts),
      {
        firstLineUnits: firstLineUnits.length,
        firstLineText: firstWrappedLineText(centerLayout.wrapped)
      }
    );
  }

  function composePeekClippingCanvas(spread, cfg, opts, usePeekSides) {
    const cropKind = usePeekSides ? 'peek' : 'center';
    const pivotBleedDom = resolveHandCutPivotBleedDomPx(cfg);
    const trimOpts = {
      preserveWidth: !!usePeekSides,
      bleedTopDomPx: pivotBleedDom,
      bleedBottomDomPx: pivotBleedDom,
      usePeekSides: !!usePeekSides,
      peekRatio: cfg.peekRatio
    };
    let clipped = usePeekSides
      ? cropSpreadToClipping(spread, cfg)
      : cropSpreadCenterOnly(spread, cfg);
    if (!clipped) return null;
    clipped = trimCanvasTopInk(clipped, cfg, {
      bleedTopDomPx: 1,
      usePeekSides: !!usePeekSides,
      peekRatio: cfg.peekRatio
    });
    const dateKey =
      String(opts.dateKey || '').trim() ||
      String(opts.today?.dateKey || '').trim() ||
      '';
    const handCut = applyHandCutSilhouette(clipped, dateKey, cfg, {
      spread,
      peekCrop: !!usePeekSides,
      fullColumns: !usePeekSides
    });
    return trimCanvasAlphaBounds(handCut, cfg, 3, trimOpts);
  }

  /** Full 3-column band (yesterday | today | tomorrow) — canonical nightly / Zapier PNG. */
  function composeFullColumnsClippingCanvas(spread, cfg, opts) {
    let clipped = cropSpreadFullColumns(spread, cfg);
    if (!clipped) return null;
    const dateKey =
      String(opts.dateKey || '').trim() ||
      String(opts.today?.dateKey || '').trim() ||
      '';
    const pivotBleedDom = resolveHandCutPivotBleedDomPx(cfg);
    const trimOpts = {
      preserveWidth: true,
      bleedTopDomPx: pivotBleedDom,
      bleedBottomDomPx: pivotBleedDom,
      usePeekSides: true,
      peekRatio: cfg.peekRatio
    };
    clipped = trimCanvasTopInk(clipped, cfg, {
      bleedTopDomPx: 1,
      usePeekSides: true,
      peekRatio: cfg.peekRatio
    });
    const handCut = applyHandCutSilhouette(clipped, dateKey, cfg, {
      spread,
      fullColumns: true
    });
    return trimCanvasAlphaBounds(handCut, cfg, 3, trimOpts);
  }

  function spreadClippingFromRender(spread, cfg, opts, usePeekSides, useFullColumns) {
    if (useFullColumns) return composeFullColumnsClippingCanvas(spread, cfg, opts);
    return composePeekClippingCanvas(spread, cfg, opts, usePeekSides);
  }

  /** Vertical bleed when copying the quote band from the spread (asymmetric — no top pull). */
  function verticalCropBleedSrcPx(cfg, scale = 1) {
    const safeScale = Math.max(0.01, Number(scale) || 1);
    const topDom = Number(cfg.cropVerticalBleedTopDomPx ?? 0);
    const bottomDom = Number(cfg.cropVerticalBleedDomPx ?? cfg.cropVerticalBleedBottomDomPx ?? 2);
    const handCutDom =
      cfg.handCutEnabled !== false ? resolveHandCutPolygonInsetDomPx(cfg) : 0;
    return {
      top: Math.ceil(domToExportPx(cfg, Math.max(0, topDom) + handCutDom) / safeScale),
      bottom: Math.ceil(domToExportPx(cfg, Math.max(0, bottomDom) + handCutDom) / safeScale)
    };
  }

  function parsePaperRgb(paperHex) {
    const h = String(paperHex || '#f6f4f1').replace('#', '').trim();
    if (h.length === 6) {
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16)
      ];
    }
    return [246, 244, 241];
  }

  /** Center strip x-bounds for peek exports (ignore side-column peeks when trimming top blank). */
  function centerStripBoundsForClippingCanvas(w, trimOpts = {}) {
    const width = Math.max(1, Math.round(Number(w) || 0));
    if (trimOpts.usePeekSides === false) {
      return { x0: Math.floor(width * 0.08), x1: Math.ceil(width * 0.92) };
    }
    const peekRatio = Number(trimOpts.peekRatio ?? DEFAULTS.peekRatio);
    const r = peekRatio / Math.max(0.01, 1 - 2 * peekRatio);
    const peekFrac = r / (1 + 2 * r);
    const centerFrac = 1 / (1 + 2 * r);
    const peekW = Math.max(1, Math.round(width * peekFrac));
    const centerW = Math.max(1, Math.round(width * centerFrac));
    return { x0: peekW, x1: Math.min(width, peekW + centerW) };
  }

  function rowCenterPaperRatio(data, w, x0, x1, y, paper, paperTol) {
    let paperish = 0;
    let total = 0;
    for (let x = x0; x < x1; x += 1) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 12) continue;
      total += 1;
      const dr = data[i] - paper[0];
      const dg = data[i + 1] - paper[1];
      const db = data[i + 2] - paper[2];
      if (dr * dr + dg * dg + db * db <= paperTol * paperTol) paperish += 1;
    }
    return total > 0 ? paperish / total : 1;
  }

  /** Trim only blank newsprint rows above the center top rule — never crop into ink. */
  function trimCanvasTopInk(canvas, cfg, trimOpts = {}) {
    if (!canvas || trimOpts.enabled === false) return canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const w = canvas.width;
    const h = canvas.height;
    if (h < 4) return canvas;
    let data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (err) {
      if (/tainted|cross-origin|SecurityError|getImageData/i.test(String(err?.message || err))) {
        return canvas;
      }
      throw err;
    }
    const paper = parsePaperRgb(cfg.paper);
    const { x0, x1 } = centerStripBoundsForClippingCanvas(w, trimOpts);
    const paperTol = 26;
    const paperOnlyThreshold = 0.97;
    let cropY = 0;
    for (let y = 0; y < h; y += 1) {
      if (rowCenterPaperRatio(data, w, x0, x1, y, paper, paperTol) >= paperOnlyThreshold) {
        cropY = y + 1;
      } else {
        break;
      }
    }
    if (cropY < 1) return canvas;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h - cropY;
    const octx = out.getContext('2d');
    if (!octx) return canvas;
    octx.drawImage(canvas, 0, cropY, w, h - cropY, 0, 0, w, h - cropY);
    return out;
  }

  function measureCanvasAlphaTrimBounds(canvas, cfg, bleedDomPx = 6, trimOpts = {}) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 2) return null;
    const preserveWidth = trimOpts.preserveWidth === true;
    let data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (err) {
      if (/tainted|cross-origin|SecurityError|getImageData/i.test(String(err?.message || err))) {
        return null;
      }
      throw err;
    }
    let minX = preserveWidth ? 0 : w;
    let minY = h;
    let maxX = preserveWidth ? w - 1 : -1;
    let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (data[(y * w + x) * 4 + 3] > 8) {
          if (!preserveWidth) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const bleedX = Math.ceil(domToExportPx(cfg, trimOpts.bleedSideDomPx ?? bleedDomPx));
    const bleedTop = Math.ceil(domToExportPx(cfg, trimOpts.bleedTopDomPx ?? bleedDomPx));
    const bleedBottom = Math.ceil(domToExportPx(cfg, trimOpts.bleedBottomDomPx ?? bleedDomPx));
    minX = Math.max(0, minX - bleedX);
    minY = Math.max(0, minY - bleedTop);
    maxX = Math.min(w - 1, maxX + bleedX);
    maxY = Math.min(h - 1, maxY + bleedBottom);
    const tw = maxX - minX + 1;
    const th = maxY - minY + 1;
    return { minX, minY, tw, th, w, h };
  }

  /** Crop canvas to non-transparent ink bounds (+ bleed). */
  function trimCanvasAlphaBounds(canvas, cfg, bleedDomPx = 6, trimOpts = {}) {
    const trimmed = trimCanvasAlphaBoundsWithMeta(canvas, cfg, bleedDomPx, trimOpts);
    return trimmed.canvas;
  }

  function trimCanvasAlphaBoundsWithMeta(canvas, cfg, bleedDomPx = 6, trimOpts = {}) {
    const bounds = measureCanvasAlphaTrimBounds(canvas, cfg, bleedDomPx, trimOpts);
    if (!bounds) return { canvas, removedTop: 0, removedLeft: 0 };
    const { minX, minY, tw, th, w, h } = bounds;
    if (tw >= w && th >= h) {
      return { canvas, removedTop: 0, removedLeft: 0 };
    }
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const octx = out.getContext('2d');
    if (!octx) return { canvas, removedTop: 0, removedLeft: 0 };
    octx.drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
    return { canvas: out, removedTop: minY, removedLeft: minX };
  }

  /** Divider x positions in cropped peek canvas coordinates. */
  function resolvePeekClippingDividerXs(spread, cfg) {
    const { centerColW, centerX, sideColW } = spread;
    if (!centerColW || !centerX) return [];
    const gutterPx = domToExportPx(cfg, cfg.columnGutterDomPx ?? DEFAULTS.columnGutterDomPx);
    const { peekW } = resolveVariablePeekWidths(centerColW, cfg);
    const peekSrcW = Math.max(1, peekW);
    const cropOriginX = centerX - peekSrcW;
    const sx = peekW / peekSrcW;
    const x1 = (sideColW + gutterPx * 0.5 - cropOriginX) * sx;
    const x2 = (centerX + centerColW + gutterPx * 0.5 - cropOriginX) * sx;
    return [x1, x2];
  }

  /** Divider x positions in full-column crop coordinates. */
  function resolveFullColumnsDividerXs(spread, contentW, cfg) {
    const { centerColW, centerX, sideColW, canvas: spreadCanvas } = spread;
    if (!spreadCanvas?.width || !centerColW) return [];
    const gutterPx = domToExportPx(cfg, cfg.columnGutterDomPx ?? DEFAULTS.columnGutterDomPx);
    const sx = contentW / spreadCanvas.width;
    const x1 = (sideColW + gutterPx * 0.5) * sx;
    const x2 = (centerX + centerColW + gutterPx * 0.5) * sx;
    return [x1, x2];
  }

  function resolveClippingDividerXs(opts, contentW, cfg) {
    if (opts.peekCrop && opts.spread) {
      return resolvePeekClippingDividerXs(opts.spread, cfg);
    }
    if (opts.fullColumns && opts.spread) {
      return resolveFullColumnsDividerXs(opts.spread, contentW, cfg);
    }
    return [];
  }

  /** Continue cropped divider rules through top/bottom hand-cut pad only. */
  function extendPadDividerRules(ctx, xs, contentPad, contentH, totalH, cfg) {
    if (contentPad <= 0 || !xs.length) return;
    const ruleInk = exportRuleInk(cfg);
    const ruleLW = exportRuleThickness(cfg);
    const contentBottom = contentPad + contentH;
    for (const x of xs) {
      const ax = contentPad + x;
      if (digitalExportPolishEnabled(cfg)) {
        strokeCrispVLine(ctx, ax, 0, contentPad, ruleInk, ruleLW);
        strokeCrispVLine(ctx, ax, contentBottom, totalH, ruleInk, ruleLW);
      } else {
        ctx.strokeStyle = ruleInk;
        ctx.lineWidth = ruleLW;
        ctx.beginPath();
        ctx.moveTo(ax, 0);
        ctx.lineTo(ax, contentPad);
        ctx.moveTo(ax, contentBottom);
        ctx.lineTo(ax, totalH);
        ctx.stroke();
      }
    }
  }

  /** Stretch content edge pixels into hand-cut pad — same texture/color as crop. */
  function blitHandCutPadMargins(octx, canvas, contentPad) {
    if (contentPad <= 0) return;
    const cw = canvas.width;
    const ch = canvas.height;
    octx.drawImage(canvas, 0, 0, cw, 1, contentPad, 0, cw, contentPad);
    octx.drawImage(canvas, 0, ch - 1, cw, 1, contentPad, contentPad + ch, cw, contentPad);
    octx.drawImage(canvas, 0, 0, 1, ch, 0, contentPad, contentPad, ch);
    octx.drawImage(canvas, cw - 1, 0, 1, ch, contentPad + cw, contentPad, contentPad, ch);
  }

  /**
   * Pad clipped art for hand-cut pivots — edge blit from crop + extend existing rules through pad.
   */
  function buildHandCutPaddedCanvas(canvas, cfg, opts = {}) {
    const contentPad = resolveHandCutEdgePadDomPx(cfg);
    const cw = canvas.width;
    const ch = canvas.height;
    const w = cw + contentPad * 2;
    const h = ch + contentPad * 2;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d');
    if (!octx) return canvas;

    blitHandCutPadMargins(octx, canvas, contentPad);
    octx.drawImage(canvas, contentPad, contentPad);
    extendPadDividerRules(
      octx,
      resolveClippingDividerXs(opts, cw, cfg),
      contentPad,
      ch,
      h,
      cfg
    );

    return out;
  }

  /** Alpha mask for hand-cut silhouette (no inset edge banding). */
  function applyHandCutSilhouette(canvas, dateKey, cfg, opts = {}) {
    if (!canvas || cfg.handCutEnabled === false) return canvas;
    const padded = buildHandCutPaddedCanvas(canvas, cfg, opts);
    const contentPad = resolveHandCutEdgePadDomPx(cfg);
    const w = padded.width;
    const h = padded.height;
    if (w < 8 || h < 8) return canvas;

    const seed = hashDateKeySeed(dateKey);
    const ref = opts.referenceFrame || null;
    const refW = ref ? ref.outW + contentPad * 2 : w;
    const refH = ref ? ref.outH + contentPad * 2 : h;
    let ring = buildHandCutPolygon(refW, refH, seed, cfg);
    if (ref && (refW !== w || refH !== h)) {
      ring = scaleHandCutRing(ring, refW, refH, w, h);
    }

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d');
    if (!octx) return canvas;

    octx.drawImage(padded, 0, 0);
    octx.save();
    octx.globalCompositeOperation = 'destination-in';
    octx.fillStyle = '#000';
    tracePolygon(octx, ring);
    octx.fill();
    octx.restore();

    return out;
  }

  /** Center quote only — no side peek columns (mood triptych / nightly PNG). */
  function cropSpreadCenterOnly(spread, cfg) {
    const bleed = verticalCropBleedSrcPx(cfg, 1);
    const { canvas: spreadCanvas, centerColW, centerX, bandTop, bandH } = spread;
    if (!bandH || bandH < 1 || !centerColW) return null;

    const outW = Math.max(48, centerColW);
    const srcY = Math.max(0, bandTop - bleed.top);
    const srcH = Math.min(spreadCanvas.height - srcY, bandH + bleed.top + bleed.bottom);
    const outH = Math.max(1, srcH);

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(
      spreadCanvas,
      centerX,
      srcY,
      centerColW,
      srcH,
      0,
      0,
      centerColW,
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

  /** True when the host page already linked Material Symbols (e.g. our-daily-beta.html). */
  function documentHasMaterialSymbolsFontLink() {
    if (typeof document === 'undefined') return false;
    return Array.from(document.querySelectorAll('link[rel][href]')).some((link) =>
      /Material\+Symbols\+Outlined/i.test(link.getAttribute('href') || '')
    );
  }

  function ensureMaterialSymbolsStylesheet() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('quilt-clipping-material-symbols')) return;
    // Do not inject a 2-glyph subset — it replaces @font-face and breaks art_recs_type icons.
    if (documentHasMaterialSymbolsFontLink()) return;
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
    const metrics = resolveMoodSpreadCropMetrics(cfg, spread);
    const { centerOutW, sideOutW, flankW, gap, scale, sideColW, centerColW, outW } = metrics;
    const { canvas: spreadCanvas, centerX, bandTop, bandH } = spread;
    if (!bandH || bandH < 1 || !centerColW) return null;

    const bleed = verticalCropBleedSrcPx(cfg, scale);
    const srcY = Math.max(0, bandTop - bleed.top);
    const srcH = Math.min(spreadCanvas.height - srcY, bandH + bleed.top + bleed.bottom);
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
   * Output width tracks the measured center column (no upscale to a fixed band).
   */
  function cropSpreadToClipping(spread, cfg) {
    const { canvas: spreadCanvas, centerColW, centerX, bandTop, bandH } = spread;
    if (!bandH || bandH < 1 || !centerColW) return null;

    const { centerOutW, peekW, peekBaseOut, outW } = resolveVariablePeekWidths(centerColW, cfg);
    const scale = 1;
    const bleed = verticalCropBleedSrcPx(cfg, scale);
    /** 1:1 — dest peekW must match source width or side text stretches horizontally. */
    const peekSrcW = Math.max(1, peekW);
    const srcY = Math.max(0, bandTop - bleed.top);
    const srcH = Math.min(spreadCanvas.height - srcY, bandH + bleed.top + bleed.bottom);
    const outH = Math.max(1, Math.ceil(srcH * scale));

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = cfg.paper;
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = false;

    const leftSrcX = Math.max(0, centerX - peekSrcW);
    ctx.drawImage(
      spreadCanvas,
      leftSrcX,
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
    const outW = baseW + bleedX * 2;
    const { canvas: spreadCanvas, bandTop, bandH } = spread;
    if (!bandH || bandH < 1) return null;

    const srcW = spreadCanvas.width;
    const scale = outW / srcW;
    const bleed = verticalCropBleedSrcPx(cfg, scale);
    const srcY = Math.max(0, bandTop - bleed.top);
    const srcH = Math.min(spreadCanvas.height - srcY, bandH + bleed.top + bleed.bottom);
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

  function ringToCssClipPolygon(ring, w, h) {
    if (!ring?.length) return null;
    const iw = Math.max(1, Number(w) || 1);
    const ih = Math.max(1, Number(h) || 1);
    const pts = ring.map((p) => {
      const x = Math.max(0, Math.min(100, (p.x / iw) * 100));
      const y = Math.max(0, Math.min(100, (p.y / ih) * 100));
      return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
    });
    return `polygon(${pts.join(', ')})`;
  }

  function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /** Smooth curve between notch valley and tab peak. */
  function softenNotchCorner(ring, x, yFrom, yTo, edgeRand, slip, edgeShape, toothRng) {
    const steps = Number(edgeShape.cornerSteps ?? 4);
    const irr = Number(edgeShape.irregularityRatio ?? 0.58);
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1);
      const ease = smootherstep(t);
      ring.push({
        x:
          x +
          slip * (edgeRand() - 0.5) * (1 - t * 0.45) +
          slip * (toothRng() - 0.5) * irr * 0.42,
        y:
          yFrom +
          (yTo - yFrom) * ease +
          (toothRng() - 0.5) * Math.abs(yTo - yFrom) * 0.07 * irr
      });
    }
  }

  /** Rounded crown between notches — bowed top + subtle hand-cut wobble. */
  function appendRoundedTabCrown(ring, x0, x1, pY, edge, edgeRand, toothDepth, edgeShape, toothRng) {
    const tabW = Math.abs(x1 - x0);
    if (tabW < 0.35) {
      ring.push({ x: x1, y: pY + (toothRng() - 0.5) * toothDepth * 0.03 });
      return;
    }
    const outward = edge === 'top' ? -1 : 1;
    const irr = Number(edgeShape.irregularityRatio ?? 0.58);
    const bulge =
      toothDepth *
      Number(edgeShape.tabCrownBulgeRatio ?? 0.26) *
      (0.84 + toothRng() * 0.26);
    const steps = Math.min(6, Math.max(4, Math.round(tabW / 2.2)));
    const phase = toothRng() * Math.PI * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const bx = x0 + (x1 - x0) * t;
      const arc = Math.sin(t * Math.PI) * bulge;
      const wobble = Math.sin(t * Math.PI * 2.15 + phase) * bulge * 0.14 * irr;
      ring.push({
        x: bx + (edgeRand() - 0.5) * tabW * 0.04 * irr + (toothRng() - 0.5) * tabW * 0.022,
        y: pY + outward * (arc + wobble) + (toothRng() - 0.5) * toothDepth * 0.05 * irr
      });
    }
  }

  /** Soft floor through the slit between teeth. */
  function softenGapFloor(ring, x0, x1, yStart, yEnd, edge, edgeRand, slip, toothRng, toothDepth, edgeShape) {
    const irr = Number(edgeShape.irregularityRatio ?? 0.58);
    const sagIn = edge === 'top' ? 1 : -1;
    const gapSag = toothDepth * Number(edgeShape.gapSagRatio ?? 0.045);
    const midX = (x0 + x1) / 2 + (edgeRand() - 0.5) * slip * 0.45;
    const yMid = yStart + sagIn * gapSag * (0.82 + toothRng() * 0.38);
    ring.push({
      x: x0 + (toothRng() - 0.5) * slip * 0.32,
      y: yStart + (toothRng() - 0.5) * toothDepth * 0.035 * irr
    });
    ring.push({
      x: midX + (toothRng() - 0.5) * slip * 0.28,
      y: yMid + (edgeRand() - 0.5) * toothDepth * 0.025 * irr
    });
    ring.push({
      x: x1 + (edgeRand() - 0.5) * slip * 0.32,
      y: yEnd + (toothRng() - 0.5) * toothDepth * 0.035 * irr
    });
  }

  /** Inner (body) and outer (tooth tip) Y offsets — same math for top and bottom. */
  function newsprintEdgeNotchOffsets(toothDepth, toothRand, edgeShape) {
    const irr = Number(edgeShape.irregularityRatio ?? 0.58);
    const notchSpan = toothDepth * Number(edgeShape.notchDepthRatio ?? 0.52);
    const inner =
      toothDepth * (0.08 + toothRand() * 0.1) + (toothRand() - 0.5) * toothDepth * 0.045 * irr;
    const outer = inner + notchSpan * (0.9 + toothRand() * 0.12);
    return { inner, outer };
  }

  function newsprintEdgePeakValleyY(yAnchor, inner, outer, edge) {
    if (edge === 'top') {
      return { peakY: yAnchor + inner, valleyY: yAnchor + outer };
    }
    return { peakY: yAnchor + outer, valleyY: yAnchor + inner };
  }

  /** Perforated newsprint edge with rounded tab crowns + soft notch corners. */
  function appendNewsprintPerforatedEdge(ring, xStart, xEnd, yAnchor, toothPeriod, toothDepth, edge, edgeShape, baseSeed) {
    const goingRight = xEnd >= xStart;
    const xMin = Math.min(xStart, xEnd);
    const xMax = Math.max(xStart, xEnd);
    const edgeSalt = edge === 'top' ? 0x746f7031 : 0x626f7431;
    const edgeRand = seededRandom((baseSeed ^ edgeSalt) >>> 0);
    const slip = toothDepth * Number(edgeShape.cornerSoftRatio ?? 0.16);
    let toothIdx = 0;

    const peakValleyAt = (idx) => {
      const toothRng = seededRandom((baseSeed + idx * 7919) >>> 0);
      const { inner, outer } = newsprintEdgeNotchOffsets(toothDepth, toothRng, edgeShape);
      return { ...newsprintEdgePeakValleyY(yAnchor, inner, outer, edge), toothRng };
    };

    let x = xStart;
    const startY = peakValleyAt(toothIdx++);
    ring.push({
      x: x + (edgeRand() - 0.5) * slip * 0.4,
      y: startY.valleyY + (startY.toothRng() - 0.5) * toothDepth * 0.03
    });

    while (
      (goingRight && x < xMax - toothPeriod * 0.4) ||
      (!goingRight && x > xMin + toothPeriod * 0.4)
    ) {
      const { peakY: pY, valleyY: vY, toothRng } = peakValleyAt(toothIdx);
      const irr = Number(edgeShape.irregularityRatio ?? 0.58);
      const period = toothPeriod * (0.9 + toothRng() * 0.16);
      const gapRatio = Number(edgeShape.gapRatio ?? 0.11);
      const tabRatio = Number(edgeShape.tabRatio ?? 0.82);
      const gap = period * (gapRatio + toothRng() * 0.06);
      const tab = Math.min(period - gap * 0.75, period * (tabRatio + toothRng() * 0.09));
      const xTooth = x + (toothRng() - 0.5) * slip * 0.55 * irr;
      const xTab = goingRight ? Math.min(xMax, xTooth + tab) : Math.max(xMin, xTooth - tab);

      softenNotchCorner(ring, xTooth, vY, pY, edgeRand, slip, edgeShape, toothRng);
      ring.push({ x: xTooth + (edgeRand() - 0.5) * slip * 0.3, y: pY + (toothRng() - 0.5) * toothDepth * 0.025 * irr });
      appendRoundedTabCrown(ring, xTooth, xTab, pY, edge, edgeRand, toothDepth, edgeShape, toothRng);
      softenNotchCorner(ring, xTab, pY, vY, edgeRand, slip, edgeShape, toothRng);

      x += goingRight ? period * (0.98 + toothRng() * 0.05) : -period * (0.98 + toothRng() * 0.05);
      const xGapEnd = goingRight ? Math.min(xMax, x) : Math.max(xMin, x);
      if (
        (goingRight && xGapEnd < xMax - 0.25) ||
        (!goingRight && xGapEnd > xMin + 0.25)
      ) {
        const nextY = peakValleyAt(toothIdx + 1);
        softenGapFloor(ring, xTab, xGapEnd, vY, nextY.valleyY, edge, edgeRand, slip, toothRng, toothDepth, edgeShape);
      }
      toothIdx += 1;
    }
    const endY = peakValleyAt(toothIdx);
    ring.push({
      x: xEnd + (edgeRand() - 0.5) * slip * 0.35,
      y: endY.valleyY + (endY.toothRng() - 0.5) * toothDepth * 0.03
    });
  }

  /** Machine-perforated top + bottom (newsprint strip ref). Sides stay straight. */
  function buildNewsprintPerforatedRing(w, h, seed, cfg) {
    const iw = Math.max(1, Math.round(Number(w) || 0));
    const ih = Math.max(1, Math.round(Number(h) || 0));
    const toothDepth = Math.max(0.8, Number(cfg.newsprintEdgeToothDepthPx ?? 2.35));
    const inset = Math.max(0, Number(cfg.newsprintEdgeSideInsetPx ?? 0.2));
    const edgeShape = {
      gapRatio: cfg.newsprintEdgeGapRatio,
      tabRatio: cfg.newsprintEdgeTabRatio,
      tabCrownBulgeRatio: cfg.newsprintEdgeTabCrownBulgeRatio,
      cornerSoftRatio: cfg.newsprintEdgeCornerSoftRatio,
      notchDepthRatio: cfg.newsprintEdgeNotchDepthRatio,
      gapSagRatio: cfg.newsprintEdgeGapSagRatio,
      irregularityRatio: cfg.newsprintEdgeIrregularityRatio,
      cornerSteps: cfg.newsprintEdgeCornerSteps
    };

    const x0 = inset;
    const x1 = iw - inset;
    const span = Math.max(8, x1 - x0);
    const targetTeeth = Math.min(
      36,
      Math.max(12, Math.round(span / Number(cfg.newsprintEdgeToothPx ?? 9)))
    );
    const toothPeriod = span / targetTeeth;
    const edgePad = inset + toothDepth;
    const yTop = edgePad;
    const yBottom = ih - edgePad;
    const ring = [];

    appendNewsprintPerforatedEdge(ring, x0, x1, yTop, toothPeriod, toothDepth, 'top', edgeShape, seed);
    appendNewsprintPerforatedEdge(ring, x1, x0, yBottom, toothPeriod, toothDepth, 'bottom', edgeShape, seed);
    return ring;
  }

  /** CSS clip-path: perforated newsprint top + bottom for reflection response patches. */
  function buildNewsprintPerforatedCssClipPath(w, h, dateKey, cfgIn = {}) {
    const iw = Math.max(1, Math.round(Number(w) || 0));
    const ih = Math.max(1, Math.round(Number(h) || 0));
    if (iw < 40 || ih < 28) return null;
    const cfg = withClippingTypography({ ...DEFAULTS, ...cfgIn, width: iw, exportScale: 1 });
    const seed = hashDateKeySeed(moodSpreadHandCutDateKey(dateKey));
    const ring = buildNewsprintPerforatedRing(iw, ih, seed, cfg);
    return ringToCssClipPolygon(ring, iw, ih);
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
    return ringToCssClipPolygon(ring, iw, ih);
  }

  /** Same hand-cut pass as `composeDataUrl` (quote clipping reference frame). */
  function finishMoodSpreadClipping(clipped, cfg, dateKey, spread = null) {
    if (!clipped) return null;
    if (cfg.moodSpreadHandCutExport === false || cfg.handCutEnabled === false) return clipped;
    const dk = moodSpreadHandCutDateKey(dateKey);
    const referenceFrame = spread ? resolveQuoteCropOutputSize(spread, cfg) : null;
    return applyHandCutSilhouette(clipped, dk, cfg, {
      referenceFrame,
      spread,
      peekCrop: true
    });
  }

  /** Nightly + live peek PNG: full newsprint render; hand-cut silhouette unchanged. */
  function normalizeComposeExportOpts(opts = {}) {
    if (String(opts.exportProfile || '').trim() !== 'nightlyPeek') return opts;
    return {
      ...opts,
      /** Lab reference skips JPEG multiply — warm paper card texture shifts neutral newsprint cooler. */
      paperTextureUrl: null,
      handCutTypographyFit: false,
      displayScale: Number(opts.displayScale) > 0 ? Number(opts.displayScale) : 1,
      centerOnly: opts.centerOnly === true
    };
  }

  async function composeDataUrlAttempt(opts = {}) {
    if (String(opts.exportProfile || '').trim() === 'nightlyPeek') {
      return composeLabPeekDataUrlAttempt(opts);
    }
    opts = normalizeComposeExportOpts(opts);
    const measureCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!measureCanvas) return null;
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return null;

    const paperTextureUrl = resolveClippingPaperTextureUrl(opts.paperTextureUrl);
    opts = {
      ...opts,
      paperTextureUrl:
        opts.paperTextureUrl === null ? null : paperTextureUrl || opts.paperTextureUrl
    };

    const layoutProfile = String(opts.layoutProfile || '').trim();
    const triptychQuote = layoutProfile === 'triptych';
    if (triptychQuote && opts.centerOnly == null) {
      opts = { ...opts, centerOnly: true };
    }
    let cfg =
      opts.handCutTypographyFit === false
        ? withClippingTypography({ ...DEFAULTS, ...opts })
        : resolveCenterBodyPxForHandCut(mctx, opts, { ...DEFAULTS, ...opts });
    if (triptychQuote && Number(cfg.centerBodyPx) > 0) {
      const triptychTypeScale =
        Number(opts.triptychTypeScale) > 0 ? Number(opts.triptychTypeScale) : TRIPTYCH_QUOTE_TYPE_SCALE;
      const scaledPx = Math.max(8, Math.round(cfg.centerBodyPx * triptychTypeScale));
      cfg = withClippingTypography({ ...cfg, centerBodyPx: scaledPx, bodyPx: scaledPx });
    }
    typography = cfg;
    const today = opts.today || null;
    if (!today || !normalizeText(quoteClippingText(today))) return null;

    await Promise.all([
      ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx], cfg.fontFamily),
      ensureClippingSurfaceAssets(cfg)
    ]);

    const spread = renderFullSpread(mctx, opts, cfg);
    if (!spread?.canvas) return null;

    const hasNeighborColumns = !!(
      normalizeText(quoteClippingText(opts.yesterday)) ||
      normalizeText(quoteClippingText(opts.tomorrow)) ||
      normalizeText(opts.goodDay ?? opts.good_day) ||
      normalizeText(opts.roughDay ?? opts.rough_day)
    );
    const cropMode = String(opts.cropMode || opts.spreadCrop || '').trim();
    const useFullColumns = cropMode === 'fullColumns';
    const usePeekSides =
      !useFullColumns &&
      (opts.peekSides === true ||
        (opts.centerOnly !== true && (opts.centerOnly === false || hasNeighborColumns)));
    let clipped = spreadClippingFromRender(spread, cfg, opts, usePeekSides, useFullColumns);
    if (!clipped) return null;

    const density = resolveClippingDisplayDensity(opts, cfg);
    const nightlyPeek = String(opts.exportProfile || '').trim() === 'nightlyPeek';
    const layoutOpts = triptychQuote && !nightlyPeek
      ? resolveTriptychClippingLayoutOpts(opts)
      : resolveClippingLayoutOpts(opts);
    let renderCfg = cfg;
    let refSpread = spread;
    let layout = clippedDisplaySizePx(clipped.width, clipped.height, renderCfg, layoutOpts);
    for (let pass = 0; pass < 3; pass += 1) {
      const minPx = Math.max(48, Math.round(layout.displayWidthPx * density));
      if (minPx <= clipped.width + 1) break;
      const scaleUp = minPx / clipped.width;
      renderCfg = withClippingTypography({
        ...opts,
        width: Math.round(renderCfg.width * scaleUp),
        exportScale: 1
      });
      typography = renderCfg;
      const spreadSharp = renderFullSpread(mctx, opts, renderCfg);
      if (!spreadSharp?.canvas) break;
      refSpread = spreadSharp;
      const sharpClipped = spreadClippingFromRender(
        spreadSharp,
        renderCfg,
        opts,
        usePeekSides,
        useFullColumns
      );
      if (!sharpClipped) break;
      clipped = sharpClipped;
      layout = clippedDisplaySizePx(clipped.width, clipped.height, renderCfg, layoutOpts);
    }

    const displayHeightPx = Math.max(
      1,
      Math.round((clipped.height / Math.max(1, clipped.width)) * layout.displayWidthPx)
    );
    const centerOnlyCanvas = refSpread ? cropSpreadCenterOnly(refSpread, renderCfg) : null;
    const centerOnlyWidth = centerOnlyCanvas?.width || 0;
    const peekWidthRatio =
      centerOnlyWidth > 0 ? clipped.width / centerOnlyWidth : useFullColumns || usePeekSides ? 1 : 0;
    const minWidthRatio = useFullColumns ? 1.45 : 1.08;
    const spreadCrop = useFullColumns ? 'fullColumns' : usePeekSides ? 'peek' : 'center';
    const exportCropOk =
      (useFullColumns || usePeekSides) && peekWidthRatio >= minWidthRatio;

    return {
      dataUrl: canvasToDataUrl(clipped, 0.92),
      displayWidthPx: layout.displayWidthPx,
      displayHeightPx,
      contentWidthPx: layout.contentWidthPx,
      clippedWidth: clipped.width,
      clippedHeight: clipped.height,
      spreadCrop,
      peekCrop: exportCropOk,
      hasHardLineBreaks: !!spread?.hasHardLineBreaks,
      hasYesterdayText: !!normalizeText(quoteClippingText(opts.yesterday)),
      hasTomorrowText: !!normalizeText(quoteClippingText(opts.tomorrow)),
      centerOnlyWidth,
      peekWidthRatio,
      aspectRatio: clipped.height > 0 ? clipped.width / clipped.height : 0,
      renderWidth: renderCfg.width,
      effectiveBodyDomPx: effectiveCenterBodyDomPx(renderCfg),
      handCutTypographyScale: Number(cfg.handCutTypographyScale) || 1,
      exportProfile: String(opts.exportProfile || '').trim() || null
    };
  }

  function isFileProtocolPage() {
    return typeof location !== 'undefined' && location.protocol === 'file:';
  }

  async function composeDataUrlWithLayout(opts = {}) {
    const nightlyPeek = String(opts.exportProfile || '').trim() === 'nightlyPeek';
    const baseOpts = nightlyPeek
      ? normalizeComposeExportOpts(opts)
      : isFileProtocolPage() && opts.paperTextureUrl !== null
        ? { ...opts, paperTextureUrl: null }
        : opts;
    const attempts = nightlyPeek
      ? [{ label: 'lab-peek', opts: baseOpts }]
      : [
          { label: 'full', opts: baseOpts },
          { label: 'no-paper-texture', opts: { ...baseOpts, paperTextureUrl: null } }
        ];
    let lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      try {
        if (i > 0) clearPaperPatternCache();
        const result = await composeDataUrlAttempt(attempt.opts);
        if (result?.dataUrl) {
          const exportDiagnostics = getClippingAssetDiagnostics(
            withClippingTypography({ ...DEFAULTS, ...attempt.opts })
          );
          if (i > 0) {
            console.warn(
              '[QuiltNewspaperClipping] compose used no-paper fallback after canvas taint — grain/halftone only'
            );
          } else if (attempt.opts.paperTextureUrl && !exportDiagnostics.paperLoaded) {
            console.warn(
              '[QuiltNewspaperClipping] paper texture URL set but image did not load:',
              attempt.opts.paperTextureUrl
            );
          }
          return {
            ...result,
            composeAttempt: i,
            composeAttemptLabel: attempt.label,
            exportDiagnostics
          };
        }
        lastErr = new Error('Peek clipping compose returned empty');
      } catch (err) {
        lastErr = err;
        const isTaint =
          err?.__odqCanvasExport ||
          /tainted|toDataURL|getImageData|SecurityError|cross-origin/i.test(
            String(err?.message || err || '')
          );
        if (!isTaint || i === attempts.length - 1) throw err;
      }
    }
    throw lastErr || new Error('Peek clipping compose failed');
  }

  async function composeDataUrl(opts = {}) {
    const result = await composeDataUrlWithLayout(opts);
    return result?.dataUrl || null;
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
    const bleed = verticalCropBleedSrcPx(cfg, metrics.scale);
    const srcY = Math.max(0, spread.bandTop - bleed.top);
    const srcH = Math.min(spread.canvas.height - srcY, spread.bandH + bleed.top + bleed.bottom);
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
          /tainted|toDataURL|getImageData|SecurityError|cross-origin/i.test(
            String(err?.message || err || '')
          );
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
  function resolveQuoteCropMetrics(cfg, spread = null) {
    const baseW = Math.round(cfg.width);
    const bleedX = domToExportPx(
      cfg,
      cfg.cropHorizontalBleedDomPx ?? cfg.cropEdgeBleedDomPx ?? 14
    );
    const centerColW = Math.max(0, Number(spread?.centerColW) || 0);
    if (centerColW > 0) {
      const variable = resolveVariablePeekWidths(centerColW, cfg);
      return { baseW, ...variable };
    }
    const peekBase = Math.round(baseW * (cfg.peekRatio ?? DEFAULTS.peekRatio));
    const centerOutW = Math.max(48, baseW - peekBase * 2);
    const outW = baseW + bleedX * 2;
    const peekW = peekBase + bleedX;
    return { baseW, centerOutW, outW, peekW, bleedX, peekBaseOut: peekBase };
  }

  /** Center band width inside a cropped quote clipping PNG. */
  function centerBandWidthFromQuoteClippingPx(quoteClippingWidthPx, cfg) {
    const quoteW = Number(quoteClippingWidthPx);
    if (!Number.isFinite(quoteW) || quoteW <= 0) {
      return resolveQuoteCropMetrics(cfg).centerOutW;
    }
    const bleedX = domToExportPx(
      cfg,
      cfg.cropHorizontalBleedDomPx ?? cfg.cropEdgeBleedDomPx ?? 14
    );
    const peekRatio = Number(cfg.peekRatio ?? DEFAULTS.peekRatio);
    const r = peekRatio / Math.max(0.01, 1 - 2 * peekRatio);
    return Math.max(48, Math.round((quoteW - 2 * bleedX) / (1 + 2 * r)));
  }

  const CONTRIBUTOR_CAROUSEL_TITLE = 'MANY HANDS MADE THIS QUILT !';
  const CONTRIBUTOR_GRATITUDE_LINE = 'Extending gratitude towards:';
  const CONTRIBUTOR_TITLE_FONT = 'Barlow Condensed';
  const CONTRIBUTOR_TITLE_COLOR = '#5c5448';
  const CONTRIBUTOR_LIST_DEFAULT_WIDTH = 820;
  const CONTRIBUTOR_LIST_BODY_TYPE_SCALE = 2;
  /** Hand-cut clipping height at default width + 2× names — floor; shorter lists pad below. */
  const CONTRIBUTOR_LIST_MIN_CLIP_HEIGHT_PX = 811;
  /** Extra inset before full-justify names (DOM px, scaled at export). */
  const CONTRIBUTOR_LIST_COLUMN_TEXT_PAD_DOM_PX = 32;
  /** Paper margin outside the text column — kept through crop + hand-cut (minimum floor). */
  const CONTRIBUTOR_LIST_EXPORT_SIDE_BLEED_DOM_PX = 44;
  /** Alpha-trim bleed so hand-cut pivots do not clip first/last glyphs. */
  const CONTRIBUTOR_LIST_TRIM_SIDE_BLEED_DOM_PX = 16;
  const CONTRIBUTOR_TITLE_GAP_DOM_PX = 12;
  /** Extra paper below the bottom rule (DOM px, scaled at export). */
  const CONTRIBUTOR_LIST_BOTTOM_RULE_PAD_DOM_PX = 18;
  /** Date strip under contributor list — same look, smaller footprint. */
  const CONTRIBUTOR_DATE_STRIP_WIDTH_RATIO = 0.56;
  const CONTRIBUTOR_DATE_STRIP_TYPE_SCALE = 0.68;
  const CONTRIBUTOR_DATE_STRIP_BOTTOM_RULE_PAD_DOM_PX = 12;

  function formatContributorCarouselDateLabel(dateKey) {
    const raw = String(dateKey || '').trim();
    const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) return raw.toUpperCase();
    const year = Number(parts[1]);
    const monthIdx = Number(parts[2]) - 1;
    const day = Number(parts[3]);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[monthIdx] || '???';
    return `${month} ${day} ${year}`;
  }

  function contributorDateStripPxAtExportWidth(exportW) {
    return Math.max(
      10,
      Math.round(contributorTitlePxAtExportWidth(exportW) * CONTRIBUTOR_DATE_STRIP_TYPE_SCALE)
    );
  }

  function contributorListMinClipHeightPx(cfg) {
    const exportW = resolveContributorListExportWidth(cfg);
    return Math.max(
      1,
      Math.round(CONTRIBUTOR_LIST_MIN_CLIP_HEIGHT_PX * (exportW / CONTRIBUTOR_LIST_DEFAULT_WIDTH))
    );
  }

  function contributorListMinBandHeightPx(cfg) {
    return Math.max(
      1,
      Math.floor(contributorListMinClipHeightPx(cfg) * (811 / 878))
    );
  }

  /** Side paper bleed sized to match visible top/bottom band margin after hand-cut. */
  function contributorListSideBleedExportPx(cfg, bandPadExportPx, handCutTopPadExportPx) {
    const insetExportPx = domToExportPx(cfg, resolveHandCutPolygonInsetDomPx(cfg));
    const trimExportPx = domToExportPx(cfg, CONTRIBUTOR_LIST_TRIM_SIDE_BLEED_DOM_PX);
    const spreadPadExportPx = domToExportPx(cfg, cfg.spreadPadY ?? DEFAULTS.spreadPadY);
    const topMarginExportPx = handCutTopPadExportPx + spreadPadExportPx * 0.65;
    const bottomMarginExportPx = bandPadExportPx + spreadPadExportPx * 0.45;
    const targetVisibleSideMarginPx = (topMarginExportPx + bottomMarginExportPx) / 2;
    const minSideBleedExportPx = domToExportPx(cfg, CONTRIBUTOR_LIST_EXPORT_SIDE_BLEED_DOM_PX);
    return Math.max(
      minSideBleedExportPx,
      Math.ceil(targetVisibleSideMarginPx + insetExportPx + trimExportPx * 0.35)
    );
  }

  function contributorTitlePxAtExportWidth(exportW) {
    const rootPx = CLIPPING_DOM_ROOT_PX;
    const vw = CLIPPING_DOM_VIEWPORT_W;
    const minPx = 2 * rootPx;
    const maxPx = 3.1 * rootPx;
    const vwPx = vw * 0.09;
    const domPx = Math.min(maxPx, Math.max(minPx, vwPx));
    const w = Math.max(1, Number(exportW) || CONTRIBUTOR_LIST_DEFAULT_WIDTH);
    return Math.max(12, Math.round((domPx / CLIPPING_DOM_SHEET_W) * w));
  }

  function contributorTitleFontSpec(titlePx) {
    return `italic 500 ${Math.round(titlePx)}px "${CONTRIBUTOR_TITLE_FONT}", "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  }

  function measureContributorTitleWidth(ctx, titlePx, titleText) {
    const text = String(titleText || CONTRIBUTOR_CAROUSEL_TITLE).toUpperCase();
    const letterSpacing = titlePx * 0.04;
    ctx.font = contributorTitleFontSpec(titlePx);
    let width = 0;
    for (let i = 0; i < text.length; i += 1) {
      width += ctx.measureText(text[i]).width;
      if (i < text.length - 1) width += letterSpacing;
    }
    return { width, text, letterSpacing };
  }

  function drawContributorTitleLine(ctx, x, y, titlePx, titleText, colW, align = 'center', color) {
    const { width, text, letterSpacing } = measureContributorTitleWidth(ctx, titlePx, titleText);
    let startX = x;
    if (align === 'center') startX = x + Math.max(0, (colW - width) / 2);
    else if (align === 'right') startX = x + Math.max(0, colW - width);
    const ink = color || CONTRIBUTOR_TITLE_COLOR;
    ctx.save();
    ctx.font = contributorTitleFontSpec(titlePx);
    ctx.fillStyle = ink;
    ctx.textBaseline = 'alphabetic';
    let cx = startX;
    for (let i = 0; i < text.length; i += 1) {
      withInkShadow(ctx, ink);
      ctx.fillText(text[i], cx, y);
      clearInkShadow(ctx);
      cx += ctx.measureText(text[i]).width + (i < text.length - 1 ? letterSpacing : 0);
    }
    ctx.restore();
  }

  let _barlowCondensedFontsReadyPromise = null;

  async function ensureBarlowCondensedFonts(pxValues = []) {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    const sizes = [
      ...new Set(
        pxValues
          .map((n) => Math.ceil(Number(n) || 0))
          .filter((n) => n > 0)
      )
    ];
    if (!sizes.length) sizes.push(contributorTitlePxAtExportWidth(CONTRIBUTOR_LIST_DEFAULT_WIDTH));
    const key = sizes.join(',');
    if (_barlowCondensedFontsReadyPromise?.key === key) return _barlowCondensedFontsReadyPromise.promise;
    const loads = sizes.map((size) =>
      document.fonts.load(`italic 500 ${size}px "${CONTRIBUTOR_TITLE_FONT}"`)
    );
    const promise = Promise.allSettled([...loads, document.fonts.ready]).then(() => {});
    _barlowCondensedFontsReadyPromise = { key, promise };
    return promise;
  }

  function normalizeContributorNameList(names) {
    return (Array.isArray(names) ? names : [])
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          return String(entry.name || '').replace(/\s+/g, ' ').trim();
        }
        return String(entry || '').replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean);
  }

  const CONTRIBUTOR_NAME_SEP = ' · ';

  function contributorNameRun(text) {
    return { text: String(text || ''), bold: false, italic: false, underline: false, caps: false };
  }

  /** Pack names onto lines; dot separators only between names, never trailing at EOL. */
  function wrapContributorNameLines(mctx, names, innerW, px) {
    const list = normalizeContributorNameList(names);
    if (!list.length) return [[contributorNameRun('')]];
    const lines = [];
    let line = [];
    let lineW = 0;
    setFont(mctx, px);
    const sepW = mctx.measureText(CONTRIBUTOR_NAME_SEP).width;

    for (let i = 0; i < list.length; i += 1) {
      const name = list[i];
      const nameW = mctx.measureText(name).width;

      if (nameW > innerW) {
        if (line.length) {
          lines.push(line);
          line = [];
          lineW = 0;
        }
        const chunks = wrapRuns(mctx, [contributorNameRun(name)], innerW, px);
        for (let c = 0; c < chunks.length; c += 1) {
          if (c < chunks.length - 1) lines.push(chunks[c]);
          else {
            line = chunks[c];
            lineW = measureRunsWidth(mctx, line, px);
          }
        }
        continue;
      }

      const needsSep = line.length > 0;
      const tokenW = (needsSep ? sepW : 0) + nameW;
      if (line.length && lineW + tokenW > innerW) {
        lines.push(line);
        line = [];
        lineW = 0;
      }
      if (line.length) {
        line.push(contributorNameRun(CONTRIBUTOR_NAME_SEP));
        lineW += sepW;
      }
      line.push(contributorNameRun(name));
      lineW += nameW;
    }
    if (line.length) lines.push(line);
    return lines;
  }

  function layoutContributorNameColumn(mctx, names, colWidth, px, padOpts = DEFAULTS.spreadPadX) {
    const padLeft =
      typeof padOpts === 'number' ? padOpts : padOpts?.padLeft ?? DEFAULTS.spreadPadX;
    const padRight =
      typeof padOpts === 'number' ? padOpts : padOpts?.padRight ?? DEFAULTS.spreadPadX;
    const innerW = Math.max(1, colWidth - padLeft - padRight);
    const nameLines = wrapContributorNameLines(mctx, names, innerW, px);
    const wrapped = [
      [{ text: CONTRIBUTOR_GRATITUDE_LINE, bold: true, italic: false, underline: false, caps: false }],
      ...nameLines
    ];
    const lineStep = px * (typography.lineHeight || DEFAULTS.lineHeight);
    return { wrapped, textH: wrapped.length * lineStep, lineStep, innerW, padX: padLeft, padRight };
  }

  function contributorListRunsFromNames(names) {
    const list = normalizeContributorNameList(names);
    if (!list.length) return [];
    return plainRunsFromText(list.join(CONTRIBUTOR_NAME_SEP));
  }

  function contributorNamesBlockHeightPx(centerPx, textH, cfg) {
    const ruleH = exportRuleThickness(cfg);
    const textPad = Math.max(cfg.ruleTextGap, Math.round(centerPx * 0.35));
    return cfg.ruleGap + ruleH + textPad * 2 + textH + ruleH + cfg.ruleGap;
  }

  function contributorListTotalBlockHeightPx(centerPx, textH, titlePx, cfg) {
    const titleGap = domToExportPx(cfg, CONTRIBUTOR_TITLE_GAP_DOM_PX);
    return titlePx + titleGap + contributorNamesBlockHeightPx(centerPx, textH, cfg);
  }

  /** Fixed export width — names wrap inside the column; never expand to one long line. */
  function resolveContributorListExportWidth(cfg) {
    return Math.max(
      Math.round(Number(cfg.width) || CONTRIBUTOR_LIST_DEFAULT_WIDTH),
      Math.round(Number(cfg.centerColMinW) || 0)
    );
  }

  function resolveContributorListBodyPxForHandCut(mctx, names, opts, cfgIn) {
    const base = withClippingTypography(cfgIn);
    if (base.contributorListFixedBodyPx) {
      return { ...base, width: resolveContributorListExportWidth(base) };
    }
    if (base.handCutEnabled === false) return base;
    const handCutKey = `${String(opts.dateKey || 'our-daily').trim()}:contributor-carousel`;
    const namesRuns = contributorListRunsFromNames(names);
    if (!namesRuns.length) return base;
    const titlePx = contributorTitlePxAtExportWidth(base.width);
    let centerPx = base.centerBodyPx;
    let lastScale = 1;
    for (let pass = 0; pass < 8; pass += 1) {
      const cfg = withClippingTypography({ ...cfgIn, centerBodyPx: centerPx, bodyPx: centerPx });
      const centerPads = resolveColumnPadPair(cfg, 'center');
      const exportW = resolveContributorListExportWidth(cfg);
      const colLayout = layoutColumn(mctx, namesRuns, exportW, centerPx, centerPads);
      const textW = widestWrappedLineWidth(mctx, colLayout.wrapped, centerPx);
      const textH = colLayout.textH;
      const blockH = contributorListTotalBlockHeightPx(centerPx, textH, titlePx, cfg);
      const pad = estimateHandCutSafePaddingDomPx(cfg, handCutKey);
      const insetX = domToExportPx(cfg, pad.horizontal);
      const insetY = domToExportPx(cfg, pad.vertical);
      const innerW = Math.max(1, exportW - centerPads.padLeft - centerPads.padRight);
      const safeInnerW = Math.max(1, innerW - insetX * 2);
      const safeBlockH = Math.max(1, blockH - insetY * 2);
      const titleW = measureContributorTitleWidth(mctx, titlePx).width;
      const scale = Math.min(
        1,
        safeInnerW / Math.max(1, textW, titleW),
        safeBlockH / Math.max(1, textH + titlePx)
      );
      lastScale = scale;
      if (scale >= 0.985) {
        return { ...cfg, width: exportW, handCutTypographyScale: Math.min(1, lastScale) };
      }
      const minCenterPx = minCenterBodyExportPx(cfg);
      const nextPx = Math.floor(centerPx * scale * 0.97);
      if (nextPx < minCenterPx) {
        const floored = withClippingTypography({
          ...cfgIn,
          width: exportW,
          centerBodyPx: minCenterPx,
          bodyPx: minCenterPx
        });
        return { ...floored, handCutTypographyScale: Math.min(1, lastScale) };
      }
      centerPx = nextPx;
    }
    const centerPads = resolveColumnPadPair(
      withClippingTypography({ ...cfgIn, centerBodyPx: centerPx, bodyPx: centerPx }),
      'center'
    );
    const exportW = resolveContributorListExportWidth(
      withClippingTypography({ ...cfgIn, centerBodyPx: centerPx, bodyPx: centerPx })
    );
    return withClippingTypography({ ...cfgIn, width: exportW, centerBodyPx: centerPx, bodyPx: centerPx });
  }

  function renderContributorListSpread(mctx, names, cfgIn, dateKey) {
    typography = withClippingTypography(cfgIn);
    const cfg = typography;
    const nameList = normalizeContributorNameList(names);
    if (!nameList.length) return null;

    const centerPx = cfg.centerBodyPx;
    const titlePx = contributorTitlePxAtExportWidth(cfg.width);
    const ruleInk = exportRuleInk(cfg);
    const ruleLW = exportRuleThickness(cfg);
    const ruleH = ruleLW;
    const centerPads = resolveColumnPadPair(cfg, 'center');
    const contentW = resolveContributorListExportWidth(cfg);
    const bandPad = Math.max(
      Math.round(domToExportPx(cfg, cfg.ruleGap * 0.75)),
      Math.round(centerPx * 0.1)
    );
    const bottomRulePad = domToExportPx(cfg, CONTRIBUTOR_LIST_BOTTOM_RULE_PAD_DOM_PX);
    const bottomBandPad = bandPad + bottomRulePad;
    const handCutTopPad = Math.max(
      0,
      Math.round(domToExportPx(cfg, resolveCropBandTopHandCutPadDomPx(cfg)))
    );
    const sideBleedPx = contributorListSideBleedExportPx(cfg, bottomBandPad, handCutTopPad);
    const W = contentW + sideBleedPx * 2;
    const centerColW = W;
    const centerX = 0;
    const textColX = sideBleedPx;
    const namesLayout = layoutContributorNameColumn(mctx, nameList, contentW, centerPx, centerPads);
    const textBetweenRulesPad = Math.max(cfg.ruleTextGap, Math.round(centerPx * 0.35));
    const textBetweenRulesH = namesLayout.textH + textBetweenRulesPad * 2;
    const namesBlockH = cfg.ruleGap + ruleH + textBetweenRulesH + ruleH + cfg.ruleGap;
    const titleGap = domToExportPx(cfg, CONTRIBUTOR_TITLE_GAP_DOM_PX);
    const contentH = titlePx + titleGap + namesBlockH;
    const spreadH = Math.ceil(cfg.spreadPadY * 2 + contentH);
    const contentTop = Math.max(cfg.spreadPadY, (spreadH - contentH) / 2);
    const titleBaselineY = contentTop + titlePx * 0.82;
    const namesBlockTop = contentTop + titlePx + titleGap;
    const ruleY1 = namesBlockTop + cfg.ruleGap;
    const textZoneTop = ruleY1 + ruleH;
    const ruleY2 = textZoneTop + textBetweenRulesH;
    const ruleSpanW = Math.max(8, Math.round(contentW * cfg.centerRuleSpanRatio));
    const ruleX0 = textColX + (contentW - ruleSpanW) / 2;
    const bandTop = Math.max(0, contentTop - handCutTopPad);
    let bandBottom = ruleY2 + ruleH + bottomBandPad;
    let bandH = bandBottom - bandTop;
    const minBandH = contributorListMinBandHeightPx(cfg);
    if (bandH < minBandH) {
      bandBottom = bandTop + minBandH;
      bandH = minBandH;
    }
    const spreadHFinal = Math.max(spreadH, Math.ceil(bandBottom + cfg.spreadPadY));

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = spreadHFinal;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const clipDateKey = `${String(dateKey || 'our-daily').trim()}:contributor-carousel`;
    drawPaperBase(ctx, W, spreadHFinal, cfg);
    drawScannerBed(ctx, W, spreadHFinal, `${clipDateKey}:contributor-list`, 'newsprint');
    drawCardGrain(ctx, W, spreadHFinal, cfg);

    let drawTitlePx = titlePx;
    const titleMeasure = measureContributorTitleWidth(ctx, titlePx);
    const maxTitleW = contentW * 0.94;
    if (titleMeasure.width > maxTitleW) {
      drawTitlePx = Math.max(12, Math.floor((titlePx * maxTitleW) / titleMeasure.width));
    }
    const finalTitleMeasure = measureContributorTitleWidth(ctx, drawTitlePx, CONTRIBUTOR_CAROUSEL_TITLE);
    const titleStartX = textColX + Math.max(0, (contentW - finalTitleMeasure.width) / 2);
    const titleEndX = titleStartX + finalTitleMeasure.width;
    drawContributorTitleLine(
      ctx,
      textColX,
      titleBaselineY,
      drawTitlePx,
      CONTRIBUTOR_CAROUSEL_TITLE,
      contentW,
      'center',
      CONTRIBUTOR_TITLE_COLOR
    );

    const centerLineCount = namesLayout.wrapped.length;
    const centerLineStep = namesLayout.lineStep;
    const centerAscent = centerPx * 0.78;
    const centerDescent = centerPx * 0.24;
    const centerVisualH =
      centerAscent + Math.max(0, centerLineCount - 1) * centerLineStep + centerDescent;
    const textY = textZoneTop + Math.max(0, (textBetweenRulesH - centerVisualH) / 2) + centerAscent;

    let cy = textY;
    const centerLines = namesLayout.wrapped;
    for (let i = 0; i < centerLines.length; i += 1) {
      const isGratitudeLine = i === 0 && centerLines.length > 1;
      const lineAlign = isGratitudeLine
        ? 'left'
        : resolveCenterLineAlign(
            ctx,
            centerLines[i],
            centerPx,
            namesLayout.innerW,
            cfg,
            { isLastLine: i === centerLines.length - 1 }
          );
      if (isGratitudeLine) {
        const lineX = centerPads.padLeft + textColX;
        setFont(ctx, centerPx, { bold: true });
        ctx.fillStyle = cfg.inkCenter;
        withInkShadow(ctx, cfg.inkCenter);
        ctx.fillText(CONTRIBUTOR_GRATITUDE_LINE, lineX, cy);
        clearInkShadow(ctx);
      } else {
        drawRunsLine(
          ctx,
          centerLines[i],
          centerPads.padLeft + textColX,
          cy,
          centerPx,
          cfg.inkCenter,
          lineAlign,
          namesLayout.innerW
        );
      }
      cy += namesLayout.lineStep;
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

    drawViewportTextureOverText(ctx, W, spreadHFinal, cfg, {
      centerX: textColX,
      centerColW: contentW,
      bandTop,
      bandH
    });

    return {
      canvas,
      centerColW,
      centerX,
      contentW,
      sideBleedPx,
      spreadH: spreadHFinal,
      bandTop,
      bandBottom,
      bandH,
      ruleY1,
      ruleY2,
      ruleSpanW,
      titlePx: drawTitlePx,
      titleBaselineY,
      titleEndX
    };
  }

  function renderContributorDateStripSpread(mctx, dateLabel, cfgIn, dateKey) {
    typography = withClippingTypography(cfgIn);
    const cfg = typography;
    const datePx = contributorDateStripPxAtExportWidth(cfg.width);
    const ruleInk = exportRuleInk(cfg);
    const ruleLW = exportRuleThickness(cfg);
    const ruleH = ruleLW;
    const contentW = resolveContributorListExportWidth(cfg);
    const text = String(dateLabel || formatContributorCarouselDateLabel(dateKey)).toUpperCase();
    const bandPad = Math.max(
      Math.round(domToExportPx(cfg, cfg.ruleGap * 0.75)),
      Math.round(datePx * 0.12)
    );
    const bottomRulePad = domToExportPx(cfg, CONTRIBUTOR_DATE_STRIP_BOTTOM_RULE_PAD_DOM_PX);
    const bottomBandPad = bandPad + bottomRulePad;
    const handCutTopPad = Math.max(
      0,
      Math.round(domToExportPx(cfg, resolveCropBandTopHandCutPadDomPx(cfg)))
    );
    const sideBleedPx = contributorListSideBleedExportPx(cfg, bottomBandPad, handCutTopPad);
    const W = contentW + sideBleedPx * 2;
    const textColX = sideBleedPx;
    const textBetweenRulesPad = Math.max(cfg.ruleTextGap, Math.round(datePx * 0.42));
    const textLineStep = datePx * (typography.lineHeight || DEFAULTS.lineHeight);
    const textBetweenRulesH = textLineStep + textBetweenRulesPad * 2;
    const blockH = cfg.ruleGap + ruleH + textBetweenRulesH + ruleH + cfg.ruleGap;
    const spreadH = Math.ceil(cfg.spreadPadY * 2 + blockH);
    const contentTop = Math.max(cfg.spreadPadY, (spreadH - blockH) / 2);
    const ruleY1 = contentTop + cfg.ruleGap;
    const textZoneTop = ruleY1 + ruleH;
    const ruleY2 = textZoneTop + textBetweenRulesH;
    const ruleSpanW = Math.max(8, Math.round(contentW * cfg.centerRuleSpanRatio));
    const ruleX0 = textColX + (contentW - ruleSpanW) / 2;
    const bandTop = Math.max(0, contentTop - handCutTopPad);
    const bandBottom = ruleY2 + ruleH + bottomBandPad;
    const bandH = bandBottom - bandTop;
    const spreadHFinal = Math.max(spreadH, Math.ceil(bandBottom + cfg.spreadPadY));

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = spreadHFinal;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const clipDateKey = `${String(dateKey || 'our-daily').trim()}:contributor-carousel-date`;
    drawPaperBase(ctx, W, spreadHFinal, cfg);
    drawScannerBed(ctx, W, spreadHFinal, clipDateKey, 'newsprint');
    drawCardGrain(ctx, W, spreadHFinal, cfg);

    let drawDatePx = datePx;
    const dateMeasure = measureContributorTitleWidth(ctx, datePx, text);
    const maxDateW = contentW * 0.94;
    if (dateMeasure.width > maxDateW) {
      drawDatePx = Math.max(10, Math.floor((datePx * maxDateW) / dateMeasure.width));
    }
    const dateBaselineY =
      textZoneTop + textBetweenRulesPad + drawDatePx * 0.82;
    drawContributorTitleLine(
      ctx,
      textColX,
      dateBaselineY,
      drawDatePx,
      text,
      contentW,
      'center',
      CONTRIBUTOR_TITLE_COLOR
    );

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

    drawViewportTextureOverText(ctx, W, spreadHFinal, cfg, {
      centerX: textColX,
      centerColW: contentW,
      bandTop,
      bandH
    });

    return {
      canvas,
      centerColW: W,
      centerX: 0,
      contentW,
      sideBleedPx,
      spreadH: spreadHFinal,
      bandTop,
      bandBottom,
      bandH,
      ruleY1,
      ruleY2,
      ruleSpanW,
      titlePx: drawDatePx
    };
  }

  function contributorTitleAnchorInClippedCanvas(spread, cfg, trimMeta = {}) {
    if (!spread || spread.titleEndX == null || spread.titleBaselineY == null) return null;
    const bleed = verticalCropBleedSrcPx(cfg, 1);
    const cropSrcY = Math.max(0, spread.bandTop - bleed.top);
    return {
      titleEndX: spread.titleEndX - (trimMeta.removedLeft || 0),
      titleBaselineY: spread.titleBaselineY - cropSrcY - (trimMeta.removedTop || 0)
    };
  }

  function composeContributorStripClippingCanvas(spread, cfg, dateKey, handCutSuffix = 'contributor-carousel') {
    let clipped = cropSpreadCenterOnly(spread, cfg);
    if (!clipped) return null;
    clipped = trimCanvasTopInk(clipped, cfg, { bleedTopDomPx: 1, usePeekSides: false });
    const handCutKey = `${String(dateKey || 'our-daily').trim()}:${handCutSuffix}`;
    const handCut = applyHandCutSilhouette(clipped, handCutKey, cfg, {
      spread,
      peekCrop: false,
      fullColumns: false
    });
    const pivotBleedDom = resolveHandCutPivotBleedDomPx(cfg);
    const trimmed = trimCanvasAlphaBoundsWithMeta(handCut, cfg, 3, {
      preserveWidth: false,
      bleedTopDomPx: pivotBleedDom,
      bleedBottomDomPx: pivotBleedDom,
      bleedSideDomPx: CONTRIBUTOR_LIST_TRIM_SIDE_BLEED_DOM_PX,
      usePeekSides: false
    });
    return {
      canvas: trimmed.canvas,
      trimRemovedLeft: trimmed.removedLeft || 0,
      trimRemovedTop: trimmed.removedTop || 0
    };
  }

  function composeContributorListClippingCanvas(spread, cfg, dateKey) {
    return composeContributorStripClippingCanvas(spread, cfg, dateKey, 'contributor-carousel');
  }

  /**
   * Small date strip for IG carousel slide 1 (matches contributor clipping, scaled down).
   * @param {{ dateKey?: string, width?: number }} opts — `width` is parent list clipping width.
   */
  async function composeContributorDateStripDataUrl(opts = {}) {
    const measureCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!measureCanvas) return null;
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return null;

    const dateKey = String(opts.dateKey || '').trim() || 'our-daily';
    const parentWidth =
      Number(opts.width) > 0 ? Math.round(Number(opts.width)) : CONTRIBUTOR_LIST_DEFAULT_WIDTH;
    const stripWidth = Math.max(
      220,
      Math.round(parentWidth * CONTRIBUTOR_DATE_STRIP_WIDTH_RATIO)
    );
    const dateLabel = formatContributorCarouselDateLabel(dateKey);
    const datePx = contributorDateStripPxAtExportWidth(stripWidth);
    const cfg = withClippingTypography({
      ...DEFAULTS,
      ...opts,
      width: stripWidth,
      centerColMaxW: CLIPPING_DOM_SHEET_W,
      centerColMinW: 0,
      columnRuleTextPadPx: Math.max(
        12,
        Math.round(CONTRIBUTOR_LIST_COLUMN_TEXT_PAD_DOM_PX * CONTRIBUTOR_DATE_STRIP_WIDTH_RATIO)
      ),
      handCutSideInwardMaxDomPx: 0,
      handCutTopBottomEdgePointEnabled: false,
      handCutMacroDomPx: 2,
      paperTextureUrl: resolveClippingPaperTextureUrl(opts.paperTextureUrl)
    });
    typography = cfg;

    await Promise.all([
      ensureBarlowCondensedFonts([datePx]),
      ensureClippingSurfaceAssets(cfg)
    ]);

    const spread = renderContributorDateStripSpread(mctx, dateLabel, cfg, dateKey);
    if (!spread?.canvas) return null;
    const clippedResult = composeContributorStripClippingCanvas(
      spread,
      cfg,
      dateKey,
      'contributor-carousel-date'
    );
    const clipped = clippedResult?.canvas || null;
    if (!clipped) return null;

    return {
      ...(opts.returnCanvas ? {} : { dataUrl: canvasToDataUrl(clipped) }),
      clippedCanvas: clipped,
      clippedWidth: clipped.width,
      clippedHeight: clipped.height,
      stripWidth,
      dateLabel,
      datePx,
      dateKey,
      exportRev: CLIPPING_EXPORT_REV,
      composePipeline: 'contributorCarouselDateStrip'
    };
  }

  /**
   * Contributor carousel clipping: Barlow title + dot-separated names (full justify).
   * @param {{ names?: string[], dateKey?: string, width?: number }} opts
   */
  async function composeContributorListDataUrl(opts = {}) {
    const measureCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!measureCanvas) return null;
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return null;

    const rawNames = opts.names || opts.contributors || [];
    const names = (Array.isArray(rawNames) ? rawNames : [])
      .map((entry) => {
        if (entry && typeof entry === 'object') return String(entry.name || '').trim();
        return String(entry || '').trim();
      })
      .filter(Boolean);
    if (!names.length) return null;

    const dateKey = String(opts.dateKey || '').trim() || 'our-daily';
    const targetWidth =
      Number(opts.width) > 0 ? Math.round(Number(opts.width)) : CONTRIBUTOR_LIST_DEFAULT_WIDTH;
    const bodyTypeScale =
      Number(opts.bodyTypeScale) > 0
        ? Number(opts.bodyTypeScale)
        : CONTRIBUTOR_LIST_BODY_TYPE_SCALE;
    const contributorBodyPx = Math.round(clippingBodyPxAtExportWidth(targetWidth) * bodyTypeScale);
    const cfgBase = withClippingTypography({
      ...DEFAULTS,
      ...opts,
      width: targetWidth,
      centerBodyPx: contributorBodyPx,
      bodyPx: contributorBodyPx,
      contributorListFixedBodyPx: true,
      // Sheet-DOM units — withClippingTypography scales by width/sheet so max column = targetWidth.
      centerColMaxW: CLIPPING_DOM_SHEET_W,
      centerColMinW: 0,
      columnRuleTextPadPx: CONTRIBUTOR_LIST_COLUMN_TEXT_PAD_DOM_PX,
      handCutSideInwardMaxDomPx: 0,
      handCutTopBottomEdgePointEnabled: false,
      handCutMacroDomPx: 2,
      paperTextureUrl: resolveClippingPaperTextureUrl(opts.paperTextureUrl)
    });
    const cfg = resolveContributorListBodyPxForHandCut(mctx, names, { ...opts, dateKey }, cfgBase);
    typography = cfg;
    const titlePx = contributorTitlePxAtExportWidth(cfg.width);

    await Promise.all([
      ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx], cfg.fontFamily),
      ensureBarlowCondensedFonts([titlePx]),
      ensureClippingSurfaceAssets(cfg)
    ]);

    const spread = renderContributorListSpread(mctx, names, cfg, dateKey);
    if (!spread?.canvas) return null;
    const clippedResult = composeContributorListClippingCanvas(spread, cfg, dateKey);
    const clipped = clippedResult?.canvas || null;
    if (!clipped) return null;
    const titleAnchor = contributorTitleAnchorInClippedCanvas(spread, cfg, clippedResult);

    return {
      ...(opts.returnCanvas ? {} : { dataUrl: canvasToDataUrl(clipped) }),
      clippedCanvas: clipped,
      clippedWidth: clipped.width,
      clippedHeight: clipped.height,
      titlePx,
      titleEndX: titleAnchor?.titleEndX ?? null,
      titleBaselineY: titleAnchor?.titleBaselineY ?? null,
      dateKey,
      nameCount: names.length,
      exportRev: CLIPPING_EXPORT_REV,
      composePipeline: 'contributorCarouselClipping'
    };
  }

  /** Center column lines: full justify with last-line left-align when gap is excessive. */
  function drawCenterJustifiedLines(ctx, layout, colX, startY, px, color, cfg, { forceLeft = false } = {}) {
    const innerX = colX + layout.padX;
    let cy = startY;
    const lines = layout.wrapped;
    for (let i = 0; i < lines.length; i++) {
      const lineAlign = resolveCenterLineAlign(ctx, lines[i], px, layout.innerW, cfg, {
        isLastLine: i === lines.length - 1,
        forceLeft
      });
      drawRunsLine(ctx, lines[i], innerX, cy, px, color, lineAlign, layout.innerW);
      cy += layout.lineStep;
    }
    return cy;
  }

  return {
    CLIPPING_EXPORT_REV,
    TRIPTYCH_QUOTE_DISPLAY_SCALE,
    QUOTE_SCREEN_DISPLAY_SCALE,
    TRIPTYCH_QUOTE_TYPE_SCALE,
    DEFAULTS,
    CLIPPING_FONT_FAMILY,
    clippingBodyDomPx,
    clippingTargetBodyDomPx,
    clippingBodyPxAtExportWidth,
    minCenterBodyDomPx,
    minCenterBodyExportPx,
    resolveClippingLayoutOpts,
    resolveTriptychClippingLayoutOpts,
    resolveCollageClippingLayoutOpts,
    resolveQuoteScreenClippingLayoutOpts,
    quoteClippingReadabilityScale,
    clippedDomWidthFromImagePx,
    resolveQuoteClippingDisplayLayout,
    estimateHandCutSafePaddingDomPx,
    effectiveCenterBodyDomPx,
    resolveCenterBodyPxForHandCut,
    minClippingDisplayWidthDomPx,
    maxClippingDisplayWidthDomPx,
    withClippingTypography,
    activateTypography,
    domToExportPx,
    resolveQuoteCropMetrics,
    resolveQuoteCropOutputSize,
    resolveVariablePeekWidths,
    centerBandWidthFromQuoteClippingPx,
    primaryClippingFontName,
    ensureNewspaperClippingFonts,
    ensureMaterialSymbolsForClipping,
    MOOD_ARROW_ICONS,
    resolveClippingPaperTextureUrl,
    ensureClippingSurfaceAssets,
    getClippingAssetDiagnostics,
    normalizeText,
    quoteBodyHasHardLineBreaks,
    plainRunsForQuote,
    plainRunsFromText,
    resolveFirstLineCount,
    firstLineCountFromQuoteFields,
    fitCenterColumnWidth,
    layoutColumn,
    drawPaperBase,
    drawNewsprintSurfaceStack,
    drawNewsprintTextureOverlay,
    drawScannerBed,
    resolveScannerBedMetrics,
    drawCardGrain,
    drawViewportTextureOverText,
    drawCenterJustifiedLines,
    keywordPayloadForQuote,
    clippingKeywordStylesForDateKey,
    clippingSpeakerNameStyleForDateKey,
    CLIPPING_KEYWORD_STYLE_SINGLES,
    hashDateKeySeed,
    buildHandCutPolygon,
    buildMoodTriptychHandCutPolygon,
    buildHandCutCssClipPath,
    buildNewsprintPerforatedCssClipPath,
    applyHandCutSilhouette,
    trimCanvasAlphaBounds,
    renderFullSpread,
    cropSpreadToClipping,
    cropSpreadToMoodClipping,
    cropSpreadFullColumns,
    resolveMoodSpreadCropMetrics,
    resolveMoodSpreadSlideOffsets,
    drawMoodFlank,
    composeDataUrl,
    composeDataUrlWithLayout,
    clippedDisplaySizePx,
    clippedDomWidthPx,
    composeMoodSpreadDataUrl,
    composeMoodSpreadWithMetrics,
    moodSpreadHandCutDateKey,
    composeContributorListDataUrl,
    composeContributorDateStripDataUrl,
    formatContributorCarouselDateLabel,
    CONTRIBUTOR_CAROUSEL_TITLE,
    CONTRIBUTOR_DATE_STRIP_WIDTH_RATIO,
    contributorListRunsFromNames,
    ensureBarlowCondensedFonts
  };
});
