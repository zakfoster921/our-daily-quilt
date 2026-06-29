/**
 * Mood clipping PNG: center-column newsprint + hand-cut edge (good_day / rough_day).
 * Browser: global.QuiltMoodClipping.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.QuiltMoodClipping = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function (global) {
  'use strict';

  const QNC = () =>
    global.QuiltNewspaperClipping ||
    (typeof require !== 'undefined' ? require('./quilt-newspaper-clipping.js') : null);

  /** Bump when mood PNG layout/typography changes (cache-bust + stale storage reset). */
  const MOOD_COMPOSER_VERSION = 7;

  /** Mood PNG width/height and body px must stay within this fraction of the quote clipping. */
  const MOOD_QUOTE_SIZE_TOLERANCE = 0.1;

  const MOOD_DEFAULTS = {
    exportScale: 2,
    width: 0,
    firstLineCount: 4,
    spreadPadX: 14,
    moodPadYDomPx: 14,
    moodMinHeightDomPx: 72,
    /** Scale mood type until text block fills this fraction of inner canvas height. */
    moodTextFillTarget: 0.36,
    /** Max type scale vs quote centerBodyPx (short mood lines need larger px to read like quote). */
    moodTypeScaleMax: 1.55,
    /** Same scissor-cut silhouette as quote clipping. */
    handCutEnabled: true,
    handCutMarginDomPx: 0.5,
    handCutCornerChamferDomPx: 12,
    handCutMacroDomPx: 5,
    handCutBiteMaxDomPx: 8,
    handCutSecondaryBiteDomPx: 5,
    handCutSideInwardMaxDomPx: 8,
    handCutTopBottomTrimDomPx: 6,
    handCutEdgeFrayPx: 1,
    handCutCanvasPadDomPx: 4,
    inkCenter: 'rgba(56, 46, 36, 0.78)',
    paper: '#f6f4f1',
    halftoneOpacity: 0.095,
    viewportGrainOpacity: 0.17,
    cardGrainOpacity: 0.11
  };

  function moodClippingFontFamily(cfg = {}) {
    const qnc = QNC();
    return String(cfg.fontFamily || qnc?.CLIPPING_FONT_FAMILY || '').trim();
  }

  function withMoodClippingTypography(cfg = {}) {
    const qnc = QNC();
    if (!qnc?.withClippingTypography) return { ...MOOD_DEFAULTS, ...cfg };
    const quoteW = Number(cfg.quoteClippingWidthPx ?? cfg.width ?? 0);
    const fontFamily = moodClippingFontFamily(cfg);
    return qnc.withClippingTypography({
      ...MOOD_DEFAULTS,
      ...qnc.DEFAULTS,
      ...cfg,
      fontFamily,
      width: quoteW > 0 ? quoteW : cfg.width
    });
  }

  function clampNearQuote(value, quoteTarget, tolerance = MOOD_QUOTE_SIZE_TOLERANCE) {
    const t = Number(quoteTarget);
    const v = Number(value);
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(v)) return v;
    const lo = t * (1 - tolerance);
    const hi = t * (1 + tolerance);
    return Math.max(lo, Math.min(hi, v));
  }

  /** Match quote clipping center-column px (same `withClippingTypography` width scale). */
  function moodTypographyAlignedToQuote(cfgIn, quoteW) {
    const qnc = QNC();
    if (!qnc?.withClippingTypography) return cfgIn;
    const w = Number(quoteW);
    const quoteCfg = qnc.withClippingTypography({ ...qnc.DEFAULTS, width: w > 0 ? w : 0 });
    const moodCfg = withMoodClippingTypography({ ...cfgIn, quoteClippingWidthPx: w, width: w });
    return {
      ...moodCfg,
      centerBodyPx: quoteCfg.centerBodyPx,
      bodyPx: quoteCfg.bodyPx
    };
  }

  /**
   * Mood copy: quote center band width, type scaled up (capped) to fill frame like quote column.
   */
  function fitMoodLayoutForFrame(mctx, runs, cfg, opts) {
    const qnc = QNC();
    const quoteW = Number(opts.quoteW);
    const canvasW = Number(opts.canvasW);
    const canvasH = Number(opts.canvasH);
    const quoteCenterPx = Number(opts.quoteCenterPx);
    const padX = cfg.spreadPadX;
    const padY = qnc.domToExportPx(cfg, cfg.moodPadYDomPx ?? MOOD_DEFAULTS.moodPadYDomPx);
    const innerW = Math.max(48, canvasW - padX * 2);
    const innerH = Math.max(32, canvasH - padY * 2);
    const bandW =
      quoteW > 0
        ? qnc.centerBandWidthFromQuoteClippingPx(quoteW, cfg)
        : innerW;
    const colW = Math.min(innerW, Math.max(bandW, 48));
    const targetFill = Number(cfg.moodTextFillTarget ?? MOOD_DEFAULTS.moodTextFillTarget ?? 0.36);
    const scaleMax = Number(cfg.moodTypeScaleMax ?? MOOD_DEFAULTS.moodTypeScaleMax ?? 1.55);
    const maxPx = Math.max(8, Math.round(quoteCenterPx * scaleMax));
    let px = Math.max(8, Math.round(quoteCenterPx));
    let layout = qnc.layoutColumn(mctx, runs, colW, px, padX);
    let guard = 0;
    while (innerH > 0 && layout.textH / innerH < targetFill && px < maxPx && guard < 40) {
      px += 1;
      layout = qnc.layoutColumn(mctx, runs, colW, px, padX);
      guard += 1;
    }
    // Scale down if text overflows the available height
    guard = 0;
    while (innerH > 0 && layout.textH > innerH && px > 8 && guard < 60) {
      px -= 1;
      layout = qnc.layoutColumn(mctx, runs, colW, px, padX);
      guard += 1;
    }
    return { colW, layout, centerPx: px, padY, innerH };
  }

  function moodHandCutDateKey(dateKey, variant) {
    const dk = String(dateKey || '').trim();
    const v = String(variant || 'good').toLowerCase() === 'rough' ? 'rough' : 'good';
    return dk ? `${dk}:mood:${v}` : `mood:${v}`;
  }

  /**
   * @param {CanvasRenderingContext2D} mctx measure context
   * @param {string} line mood copy
   * @param {object} cfgIn typography + mood options
   * @param {{ quoteClippingWidthPx?: number, quoteClippingHeightPx?: number, dateKey?: string, variant?: string }} opts
   * @returns {{ canvas: HTMLCanvasElement, colW: number, width: number, height: number } | null}
   */
  function renderMoodClipping(mctx, line, cfgIn, opts = {}) {
    const qnc = QNC();
    if (!qnc) return null;

    let quoteW = Number(opts.quoteClippingWidthPx);
    let quoteH = Number(opts.quoteClippingHeightPx);
    const cfgBoot = withMoodClippingTypography({ ...MOOD_DEFAULTS, ...cfgIn });
    if (!Number.isFinite(quoteW) || quoteW <= 0) {
      const metrics = qnc.resolveQuoteCropMetrics(cfgBoot);
      quoteW = metrics.outW;
    }
    if (!Number.isFinite(quoteH) || quoteH <= 0) {
      quoteH = Math.round(quoteW * 0.52);
    }

    const cfg = qnc.activateTypography(moodTypographyAlignedToQuote(cfgIn, quoteW));
    const runs = qnc.plainRunsFromText(line);
    if (!runs.length) return null;

    const quoteCenterPx = cfg.centerBodyPx;
    const padY = qnc.domToExportPx(cfg, cfg.moodPadYDomPx ?? MOOD_DEFAULTS.moodPadYDomPx);
    const minHDom = qnc.domToExportPx(cfg, cfg.moodMinHeightDomPx ?? MOOD_DEFAULTS.moodMinHeightDomPx);

    let W =
      Number.isFinite(quoteW) && quoteW > 0
        ? Math.round(quoteW)
        : Math.max(48, qnc.centerBandWidthFromQuoteClippingPx(quoteW, cfg));

    const cutPad =
      cfg.handCutEnabled !== false
        ? qnc.domToExportPx(cfg, cfg.handCutCanvasPadDomPx ?? MOOD_DEFAULTS.handCutCanvasPadDomPx)
        : 0;

    const layoutProbeH =
      Number.isFinite(quoteH) && quoteH > 0
        ? Math.round(quoteH * (1 + MOOD_QUOTE_SIZE_TOLERANCE))
        : padY * 2 + Math.round(quoteCenterPx * cfg.lineHeight * 4);
    let canvasW = W;
    let canvasH = layoutProbeH;
    if (cutPad > 0 && Number.isFinite(quoteW) && quoteW > 0) {
      canvasW = Math.max(48, Math.round(W - 2 * cutPad));
      canvasH = Math.max(minHDom, Math.round(layoutProbeH - 2 * cutPad));
    }

    // Use final canvas dimensions for font fitting so text always fits within the forced quoteH.
    let fitCanvasW = canvasW;
    let fitCanvasH = canvasH;
    if (Number.isFinite(quoteH) && quoteH > 0 && Number.isFinite(quoteW) && quoteW > 0) {
      fitCanvasW = cutPad > 0 ? Math.max(48, Math.round(quoteW - 2 * cutPad)) : Math.round(quoteW);
      fitCanvasH = cutPad > 0
        ? Math.max(Math.round(minHDom), Math.round(quoteH - 2 * cutPad))
        : Math.round(quoteH);
    }

    let activeCfg = cfg;
    let fitted = fitMoodLayoutForFrame(mctx, runs, activeCfg, {
      quoteW,
      canvasW: fitCanvasW,
      canvasH: fitCanvasH,
      quoteCenterPx
    });
    // Tighten line spacing for long messages (3+ lines) so they fit the strip without shrinking font.
    if (fitted.layout.wrapped.length >= 3) {
      const baseLineHeight = Number(cfg.lineHeight ?? 1.2);
      const tightLineHeight = Math.max(1.0, baseLineHeight * 0.88);
      activeCfg = qnc.activateTypography({ ...cfg, lineHeight: tightLineHeight });
      fitted = fitMoodLayoutForFrame(mctx, runs, activeCfg, {
        quoteW,
        canvasW: fitCanvasW,
        canvasH: fitCanvasH,
        quoteCenterPx
      });
    }
    const { colW, layout, centerPx, padY: fittedPadY } = fitted;

    let H = Math.round(fittedPadY * 2 + Math.ceil(layout.textH));
    H = Math.max(Math.round(minHDom), H);
    if (Number.isFinite(quoteH) && quoteH > 0 && Number.isFinite(quoteW) && quoteW > 0) {
      H = Math.round(quoteH);
      W = Math.round(quoteW);
    }

    canvasW = Math.round(W);
    canvasH = Math.round(H);
    if (cutPad > 0 && Number.isFinite(quoteW) && quoteW > 0 && Number.isFinite(quoteH) && quoteH > 0) {
      canvasW = Math.max(48, Math.round(W - 2 * cutPad));
      canvasH = Math.max(Math.round(minHDom), Math.round(H - 2 * cutPad));
    }

    const textBlockH = layout.textH;
    const textFillRatio = canvasH > 0 ? +(textBlockH / canvasH).toFixed(3) : 0;
    const colX = Math.max(0, (canvasW - colW) / 2);

    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    qnc.drawPaperBase(ctx, canvasW, canvasH, cfg);
    qnc.drawScannerBed(
      ctx,
      canvasW,
      canvasH,
      moodHandCutDateKey(opts.dateKey, opts.variant),
      'newsprint'
    );
    qnc.drawCardGrain(ctx, canvasW, canvasH, cfg);

    const centerAscent = centerPx * 0.78;
    const blockTop = fittedPadY + Math.max(0, (canvasH - fittedPadY * 2 - textBlockH) / 2);

    qnc.drawCenterJustifiedLines(
      ctx,
      layout,
      colX,
      blockTop + centerAscent,
      centerPx,
      cfg.inkCenter,
      cfg
    );

    ctx.save();
    ctx.beginPath();
    ctx.rect(colX, 0, colW, canvasH);
    ctx.clip();
    qnc.drawViewportTextureOverText(ctx, colW, canvasH, cfg);
    ctx.restore();

    let out = canvas;
    if (cfg.handCutEnabled !== false && typeof qnc.applyHandCutSilhouette === 'function') {
      const cut = qnc.applyHandCutSilhouette(
        canvas,
        moodHandCutDateKey(opts.dateKey, opts.variant),
        cfg
      );
      if (cut) out = cut;
    }

    return { canvas: out, colW, width: out.width, height: out.height };
  }

  async function composeMoodDataUrl(opts = {}) {
    const qnc = QNC();
    if (!qnc) return null;
    const line = qnc.normalizeText(
      opts.line ?? opts.good_day ?? opts.goodDay ?? opts.rough_day ?? opts.roughDay
    );
    if (!line) return null;

    const cfg = withMoodClippingTypography({
      ...opts,
      paperTextureUrl: opts.paperTextureUrl,
      quoteClippingWidthPx: opts.quoteClippingWidthPx,
      quoteClippingHeightPx: opts.quoteClippingHeightPx
    });
    await Promise.all([
      qnc.ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx], cfg.fontFamily),
      qnc.ensureClippingSurfaceAssets(cfg)
    ]);

    const measureCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!measureCanvas) return null;
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return null;

    const rendered = renderMoodClipping(mctx, line, cfg, {
      quoteClippingWidthPx: opts.quoteClippingWidthPx,
      quoteClippingHeightPx: opts.quoteClippingHeightPx,
      dateKey: opts.dateKey,
      variant: opts.variant
    });
    if (!rendered?.canvas) return null;
    try {
      return rendered.canvas.toDataURL('image/png', 0.92);
    } catch (exportErr) {
      return null;
    }
  }

  return {
    MOOD_COMPOSER_VERSION,
    MOOD_DEFAULTS,
    MOOD_QUOTE_SIZE_TOLERANCE,
    moodClippingFontFamily,
    withMoodClippingTypography,
    moodTypographyAlignedToQuote,
    fitMoodLayoutForFrame,
    clampNearQuote,
    renderMoodClipping,
    composeMoodDataUrl,
    moodHandCutDateKey
  };
});
