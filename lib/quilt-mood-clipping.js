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

  /** Mood PNG width/height and body px must stay within this fraction of the quote clipping. */
  const MOOD_QUOTE_SIZE_TOLERANCE = 0.1;

  const MOOD_DEFAULTS = {
    exportScale: 2,
    width: 0,
    firstLineCount: 4,
    spreadPadX: 14,
    moodPadYDomPx: 14,
    moodMinHeightDomPx: 72,
    /** Same scissor-cut silhouette as quote clipping. */
    handCutEnabled: true,
    handCutMarginDomPx: 0.5,
    handCutCornerChamferDomPx: 12,
    handCutMacroDomPx: 6,
    handCutBiteMaxDomPx: 12,
    handCutSecondaryBiteDomPx: 7,
    handCutSideInwardMaxDomPx: 8,
    handCutTopBottomTrimDomPx: 6,
    handCutEdgeFrayPx: 1,
    handCutCanvasPadDomPx: 4,
    inkCenter: 'rgba(56, 46, 36, 0.78)',
    paper: '#f5e6d4',
    halftoneOpacity: 0.095,
    viewportGrainOpacity: 0.17,
    cardGrainOpacity: 0.11
  };

  function withMoodClippingTypography(cfg = {}) {
    const qnc = QNC();
    if (!qnc?.withClippingTypography) return { ...MOOD_DEFAULTS, ...cfg };
    const quoteW = Number(cfg.quoteClippingWidthPx ?? cfg.width ?? 0);
    return qnc.withClippingTypography({
      ...MOOD_DEFAULTS,
      ...qnc.DEFAULTS,
      ...cfg,
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

    const centerPx = cfg.centerBodyPx;
    const flc = Number(cfg.firstLineCount ?? MOOD_DEFAULTS.firstLineCount);
    const colW = qnc.fitCenterColumnWidth(mctx, runs, centerPx, cfg.spreadPadX, cfg, flc);
    const layout = qnc.layoutColumn(mctx, runs, colW, centerPx, cfg.spreadPadX);

    const padY = qnc.domToExportPx(cfg, cfg.moodPadYDomPx ?? MOOD_DEFAULTS.moodPadYDomPx);
    const minHDom = qnc.domToExportPx(cfg, cfg.moodMinHeightDomPx ?? MOOD_DEFAULTS.moodMinHeightDomPx);

    let H = layout.textH + padY * 2;
    let W =
      Number.isFinite(quoteW) && quoteW > 0
        ? Math.round(quoteW)
        : Math.max(colW, qnc.centerBandWidthFromQuoteClippingPx(quoteW, cfg));

    if (Number.isFinite(quoteH) && quoteH > 0) {
      H = clampNearQuote(H, quoteH);
      const quoteMinH = Math.round(quoteH * (1 - MOOD_QUOTE_SIZE_TOLERANCE));
      const quoteMaxH = Math.round(quoteH * (1 + MOOD_QUOTE_SIZE_TOLERANCE));
      H = Math.max(quoteMinH, Math.min(quoteMaxH, Math.max(H, minHDom)));
      W = clampNearQuote(W, quoteW);
    }

    const cutPad =
      cfg.handCutEnabled !== false
        ? qnc.domToExportPx(cfg, cfg.handCutCanvasPadDomPx ?? MOOD_DEFAULTS.handCutCanvasPadDomPx)
        : 0;
    let canvasW = W;
    let canvasH = H;
    if (cutPad > 0 && Number.isFinite(quoteW) && quoteW > 0 && Number.isFinite(quoteH) && quoteH > 0) {
      canvasW = Math.max(colW, Math.round(W - 2 * cutPad));
      canvasH = Math.max(layout.textH + padY * 2, Math.round(H - 2 * cutPad));
    }

    const colX = Math.max(0, (canvasW - colW) / 2);

    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    qnc.drawPaperBase(ctx, canvasW, canvasH, cfg);
    qnc.drawCardGrain(ctx, canvasW, canvasH, cfg);

    const textBlockH = layout.textH;
    const centerAscent = centerPx * 0.78;
    const blockTop = padY + Math.max(0, (canvasH - padY * 2 - textBlockH) / 2);

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
      qnc.ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx]),
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
    return rendered.canvas.toDataURL('image/png', 0.92);
  }

  return {
    MOOD_DEFAULTS,
    MOOD_QUOTE_SIZE_TOLERANCE,
    withMoodClippingTypography,
    moodTypographyAlignedToQuote,
    clampNearQuote,
    renderMoodClipping,
    composeMoodDataUrl,
    moodHandCutDateKey
  };
});
