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

  const MOOD_DEFAULTS = {
    exportScale: 2,
    width: 0,
    firstLineCount: 4,
    spreadPadX: 14,
    moodPadYDomPx: 14,
    /** Target height as fraction of quote clipping height (shorter sibling rectangle). */
    moodHeightRatioOfQuoteClipping: 0.62,
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
    return qnc.withClippingTypography({ ...MOOD_DEFAULTS, ...qnc.DEFAULTS, ...cfg });
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
    const cfg = qnc.activateTypography({ ...MOOD_DEFAULTS, ...cfgIn });
    const runs = qnc.plainRunsFromText(line);
    if (!runs.length) return null;

    const centerPx = cfg.centerBodyPx;
    const flc = Number(cfg.firstLineCount ?? MOOD_DEFAULTS.firstLineCount);
    const colW = qnc.fitCenterColumnWidth(mctx, runs, centerPx, cfg.spreadPadX, cfg, flc);
    const layout = qnc.layoutColumn(mctx, runs, colW, centerPx, cfg.spreadPadX);

    const quoteW = Number(opts.quoteClippingWidthPx);
    const quoteH = Number(opts.quoteClippingHeightPx);
    const bandW = qnc.centerBandWidthFromQuoteClippingPx(quoteW, cfg);
    const padY = qnc.domToExportPx(cfg, cfg.moodPadYDomPx ?? MOOD_DEFAULTS.moodPadYDomPx);

    let innerH = layout.textH + padY * 2;
    if (Number.isFinite(quoteH) && quoteH > 0) {
      const ratio = Number(
        cfg.moodHeightRatioOfQuoteClipping ?? MOOD_DEFAULTS.moodHeightRatioOfQuoteClipping
      );
      const targetH = Math.round(quoteH * ratio);
      const minH = qnc.domToExportPx(cfg, cfg.moodMinHeightDomPx ?? MOOD_DEFAULTS.moodMinHeightDomPx);
      innerH = Math.max(innerH, targetH, minH);
      innerH = Math.min(innerH, Math.max(1, quoteH - 2));
    }

    const targetW =
      Number.isFinite(quoteW) && quoteW > 0 ? Math.max(quoteW, colW, bandW) : Math.max(colW, bandW);
    const W = targetW;
    const H = innerH;
    const colX = Math.max(0, (W - colW) / 2);

    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    qnc.drawPaperBase(ctx, W, H, cfg);
    qnc.drawCardGrain(ctx, W, H, cfg);

    const textBlockH = layout.textH;
    const centerAscent = centerPx * 0.78;
    const blockTop = padY + Math.max(0, (H - padY * 2 - textBlockH) / 2);

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
    ctx.rect(colX, 0, colW, H);
    ctx.clip();
    qnc.drawViewportTextureOverText(ctx, colW, H, cfg);
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

    const cfg = withMoodClippingTypography({ ...opts, paperTextureUrl: opts.paperTextureUrl });
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
    withMoodClippingTypography,
    renderMoodClipping,
    composeMoodDataUrl,
    moodHandCutDateKey
  };
});
