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

  /** Matches live quilt DOM `--quilt-clipping-font` / `ensureOdqCanvasFontsReady`. */
  const CLIPPING_FONT_FAMILY =
    '"Libre Baskerville", Georgia, "Times New Roman", Times, serif';
  /** Phone sheet width the DOM clipping used (`--quilt-float-sheet-width` ≈ 428px). */
  const CLIPPING_DOM_SHEET_W = 428;
  const CLIPPING_DOM_ROOT_PX = 16;
  const CLIPPING_DOM_VIEWPORT_W = 430;

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
    /** Warm newsprint cream (more golden than quilt card #f6f2eb). */
    paper: '#f5e6d4',
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
    handCutCanvasPadDomPx: 4
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

  function loadPatternImage(key, src) {
    if (patternCache[key]) return Promise.resolve(patternCache[key]);
    if (patternPromises[key]) return patternPromises[key];
    if (typeof Image === 'undefined') return Promise.resolve(null);
    patternPromises[key] = new Promise((resolve) => {
      const img = new Image();
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
    ctx.fillStyle = cfg.paper || '#f5e6d4';
    ctx.fillRect(0, 0, w, h);

    const g1 = ctx.createLinearGradient(0, 0, w, h * 0.52);
    g1.addColorStop(0, 'rgba(118, 78, 44, 0.07)');
    g1.addColorStop(1, 'rgba(118, 78, 44, 0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w, h);

    const g2 = ctx.createLinearGradient(w, 0, 0, h * 0.54);
    g2.addColorStop(0, 'rgba(96, 62, 36, 0.06)');
    g2.addColorStop(1, 'rgba(96, 62, 36, 0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);

    const g3 = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, w * 0.45);
    g3.addColorStop(0, 'rgba(255, 242, 220, 0.22)');
    g3.addColorStop(0.58, 'rgba(255, 242, 220, 0)');
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(214, 168, 118, 0.06)';
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

  function drawViewportHalftone(ctx, w, h, cfg) {
    const pitch = domToExportPx(cfg, cfg.halftonePitchDomPx);
    const ox = domToExportPx(cfg, cfg.halftoneDotOffsetDomPx.x);
    const oy = domToExportPx(cfg, cfg.halftoneDotOffsetDomPx.y);
    const tW = Math.max(2, Math.ceil(pitch));
    applyMultiplyLayer(ctx, w, h, cfg.halftoneOpacity, (lctx) => {
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

  function drawViewportGrain(ctx, w, h, cfg) {
    const img = patternCache.viewport;
    if (!img?.naturalWidth) return;
    const tilePx = domToExportPx(cfg, cfg.viewportGrainTileDomPx);
    applyMultiplyLayer(ctx, w, h, cfg.viewportGrainOpacity, (lctx) => {
      tilePatternImage(lctx, w, h, img, tilePx);
    });
  }

  /** DOM viewport stack: halftone + turbulence grain over type (multiply). */
  function drawViewportTextureOverText(ctx, w, h, cfg) {
    drawViewportHalftone(ctx, w, h, cfg);
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

  async function ensureNewspaperClippingFonts(pxValues = []) {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    const sizes = [
      ...new Set(
        pxValues
          .map((n) => Math.ceil(Number(n) || 0))
          .filter((n) => n > 0)
      )
    ];
    if (!sizes.length) sizes.push(clippingBodyPxAtExportWidth(DEFAULTS.width));
    const key = sizes.join(',');
    if (_clippingFontsReadyPromise?.key === key) return _clippingFontsReadyPromise.promise;
    const promise = Promise.allSettled([
      ...sizes.flatMap((size) => [
        document.fonts.load(`400 ${size}px "Libre Baskerville"`),
        document.fonts.load(`italic 400 ${size}px "Libre Baskerville"`),
        document.fonts.load(`700 ${size}px "Libre Baskerville"`),
        document.fonts.load(`800 ${size}px "Libre Baskerville"`)
      ]),
      document.fonts.ready
    ]).then(() => {});
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
    const text = normalizeText(q?.text);
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

  function plainRunsForQuote(q, { neighbor = false, dateKey = '' } = {}) {
    const text = stripTrailDash(q?.text);
    if (!text) return [];
    const author = stripLeadDash(q?.author);
    let full = text;
    if (neighbor) {
      const block = neighborClippingBlock(q);
      if (!block) return [];
      return [{ text: block, bold: false, italic: false, underline: false, caps: false }];
    }

    const authorLine = author ? author.replace(/ /g, '\u00a0') : '';
    full = authorLine ? `${text} \u2014 ${authorLine}` : text;

    const payload = keywordPayloadForQuote({ ...q, text }, dateKey);
    const lbke = LBKE();
    if (payload?.keywords?.length && lbke?.buildTextRunsForLine) {
      const runs = lbke.buildTextRunsForLine(full, payload.keywords, payload.styles);
      if (lbke.lineHasEmphasisRuns?.(runs)) return runs;
    }
    return [{ text: full, bold: false, italic: false, underline: false, caps: false }];
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
    const ruleH = 1;

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
    const layouts = {
      yesterday: null,
      today: layoutColumn(mctx, todayRuns, centerColW, centerPx),
      tomorrow: null
    };
    const textBetweenRulesPad = Math.max(cfg.ruleTextGap, Math.round(centerPx * 0.35));
    const textBetweenRulesH = layouts.today.textH + textBetweenRulesPad * 2;
    const centerBlockH =
      cfg.ruleGap + ruleH + textBetweenRulesH + ruleH + cfg.ruleGap;

    if (opts.yesterday && normalizeText(opts.yesterday.text)) {
      const yRuns = runsForFilledNeighborColumn(
        mctx,
        opts.yesterday,
        sideColW,
        sidePx,
        spreadContentH - cfg.spreadPadY * 2,
        cfg.spreadPadX
      );
      layouts.yesterday = layoutColumn(mctx, yRuns, sideColW, sidePx);
    }
    if (opts.tomorrow && normalizeText(opts.tomorrow.text)) {
      const tRuns = runsForFilledNeighborColumn(
        mctx,
        opts.tomorrow,
        sideColW,
        sidePx,
        spreadContentH - cfg.spreadPadY * 2,
        cfg.spreadPadX
      );
      layouts.tomorrow = layoutColumn(mctx, tRuns, sideColW, sidePx);
    }

    const sideHeights = [layouts.yesterday?.textH || 0, layouts.tomorrow?.textH || 0];
    const spreadH = Math.ceil(
      cfg.spreadPadY * 2 + Math.max(centerBlockH, ...sideHeights, spreadContentH - cfg.spreadPadY * 2, 0)
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

    ctx.strokeStyle = cfg.ruleColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dividerX1, 0);
    ctx.lineTo(dividerX1, spreadH);
    ctx.moveTo(dividerX2, 0);
    ctx.lineTo(dividerX2, spreadH);
    ctx.stroke();

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

    if (layouts.yesterday) {
      const sideY = Math.max(0, (spreadH - layouts.yesterday.textH) / 2);
      drawTextBlock(ctx, layouts.yesterday, colXs[0], sideColW, sideY, 'right', cfg.inkSide, sidePx);
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

    if (layouts.tomorrow) {
      const sideY = Math.max(0, (spreadH - layouts.tomorrow.textH) / 2);
      drawTextBlock(ctx, layouts.tomorrow, colXs[2], sideColW, sideY, 'left', cfg.inkSide, sidePx);
    }

    ctx.strokeStyle = cfg.ruleColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ruleX0, ruleY1);
    ctx.lineTo(ruleX0 + ruleSpanW, ruleY1);
    ctx.moveTo(ruleX0, ruleY2);
    ctx.lineTo(ruleX0 + ruleSpanW, ruleY2);
    ctx.stroke();

    drawViewportTextureOverText(ctx, W, spreadH, cfg);

    const bandPad = Math.max(Math.round(cfg.ruleGap * 0.75), Math.round(centerPx * 0.1));
    const bandTop = Math.max(0, centerBlockTop - bandPad);
    const bandBottom = Math.min(spreadH, centerBlockTop + centerBlockH + bandPad);

    return {
      canvas,
      centerColW,
      sideColW,
      centerX,
      spreadH,
      bandTop,
      bandBottom,
      bandH: bandBottom - bandTop
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

  /** One scissor stroke along a segment (straight; optional mid kink + notch). */
  function walkScissorStroke(ring, ax, ay, bx, by, opts) {
    const {
      rand,
      cx,
      cy,
      slip,
      kinkAmp,
      bite,
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
    stops.push({ t: 1, kink: false, bite: false });
    stops.sort((a, b) => a.t - b.t);

    let lastT = 0;
    for (const stop of stops) {
      const t = Math.max(lastT, Math.min(1, stop.t));
      if (t - lastT < 0.015) continue;
      if (stop.bite) {
        place(t, slip * (rand() - 0.5), -bite.depth);
      } else if (stop.kink) {
        place(t, slip * (rand() - 0.5) + kinkAmp * (rand() > 0.5 ? 1 : -1), 0);
      } else {
        place(t, slip * (rand() - 0.5), 0);
      }
      lastT = t;
    }
    if (lastT < 0.995) place(1, slip * (rand() - 0.5), 0);
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

  function tracePolygon(ctx, pts) {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  /** Alpha mask + faint cut-edge highlight (paper core at scissor line). */
  function applyHandCutSilhouette(canvas, dateKey, cfg) {
    if (!canvas || cfg.handCutEnabled === false) return canvas;
    const pad = domToExportPx(cfg, cfg.handCutCanvasPadDomPx || 0);
    const w = canvas.width + pad * 2;
    const h = canvas.height + pad * 2;
    if (w < 8 || h < 8) return canvas;

    const seed = hashDateKeySeed(dateKey);
    const ring = buildHandCutPolygon(w, h, seed, cfg);

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

    const fray = domToExportPx(cfg, cfg.handCutEdgeFrayPx);
    if (fray > 0) {
      octx.save();
      octx.strokeStyle = 'rgba(255, 248, 236, 0.38)';
      octx.lineWidth = Math.max(1, fray * 1.8);
      octx.globalCompositeOperation = 'source-over';
      tracePolygon(octx, ring);
      octx.stroke();
      octx.restore();
    }

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

  async function composeDataUrl(opts = {}) {
    const cfg = withClippingTypography({ ...DEFAULTS, ...opts });
    typography = cfg;
    const today = opts.today || null;
    if (!today || !normalizeText(today.text)) return null;

    await Promise.all([
      ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx]),
      ensureClippingSurfaceAssets(cfg)
    ]);

    const measureCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!measureCanvas) return null;
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return null;

    const spread = renderFullSpread(mctx, opts, cfg);
    if (!spread?.canvas) return null;

    let clipped = cropSpreadToClipping(spread, cfg);
    if (!clipped) return null;

    const dateKey =
      String(opts.dateKey || '').trim() ||
      String(opts.today?.dateKey || '').trim() ||
      '';
    clipped = applyHandCutSilhouette(clipped, dateKey, cfg);

    return clipped.toDataURL('image/png', 0.92);
  }

  return {
    DEFAULTS,
    CLIPPING_FONT_FAMILY,
    clippingBodyPxAtExportWidth,
    withClippingTypography,
    ensureNewspaperClippingFonts,
    ensureClippingSurfaceAssets,
    normalizeText,
    plainRunsForQuote,
    resolveFirstLineCount,
    clippingKeywordStylesForDateKey,
    CLIPPING_KEYWORD_STYLE_SINGLES,
    CLIPPING_KEYWORD_STYLE_COMBOS,
    hashDateKeySeed,
    buildHandCutPolygon,
    applyHandCutSilhouette,
    renderFullSpread,
    cropSpreadToClipping,
    composeDataUrl
  };
});
