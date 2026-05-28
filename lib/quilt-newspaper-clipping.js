/**
 * Canvas composer for quilt-screen newspaper clipping (3-column peek + center quote).
 * Browser: global.QuiltNewspaperClipping. Node: module.exports with QKE/LBKE injected.
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

  const DEFAULTS = {
    width: 1080,
    peekRatio: 0.105,
    padX: 16,
    padY: 14,
    bodyPx: 26,
    lineHeight: 1.22,
    ruleGap: 11,
    ruleColor: 'rgba(35, 28, 22, 0.55)',
    inkCenter: 'rgba(42, 34, 28, 0.86)',
    inkSide: 'rgba(42, 34, 28, 0.5)',
    inkStrong: 'rgba(38, 30, 24, 0.92)',
    paper: '#f3efe6',
    fontFamily: "'Libre Baskerville', Georgia, 'Times New Roman', Times, serif"
  };

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

  function keywordPayloadForQuote(q) {
    const text = normalizeText(q?.text);
    if (!text) return null;
    const qke = QKE();
    const lbke = LBKE();
    if (!qke || !lbke) return null;

    const keywordRaw = String(q?.keyword ?? q?.keywordSnapshot ?? '').trim();
    if (!keywordRaw) return null;

    const keywords = qke.parseEmphasisWordsInput
      ? qke.parseEmphasisWordsInput(keywordRaw, text)
      : keywordRaw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!keywords.length) return null;

    let styles = ['bold'];
    let rawStyles =
      q?.layoutBKeywordEmphasis ??
      q?.layoutBKeywordEmphasisStory ??
      q?.keywordEmphasis ??
      q?.keyword_emphasis ??
      null;
    if (typeof rawStyles === 'string') {
      try {
        rawStyles = JSON.parse(rawStyles);
      } catch {
        rawStyles = null;
      }
    }
    if (rawStyles && typeof rawStyles === 'object' && Array.isArray(rawStyles.styles) && rawStyles.styles.length) {
      styles = rawStyles.styles;
    }

    return lbke.normalizeLayoutBKeywordEmphasisPayload({ keywords, styles });
  }

  function plainRunsForQuote(q, { neighbor = false } = {}) {
    const text = stripTrailDash(q?.text);
    if (!text) return [];
    const author = stripLeadDash(q?.author);
    let full = text;
    if (neighbor) {
      full = author ? `${text} ${author}. ${text}` : `${text}. ${text}`;
    } else {
      full = author ? `${text} \u2014 ${author}` : text;
    }

    const payload = keywordPayloadForQuote({ ...q, text });
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
    ctx.font = `${style} ${weight} ${px}px ${DEFAULTS.fontFamily}`;
  }

  function measureRunsWidth(ctx, runs, px) {
    let w = 0;
    for (const run of runs) {
      setFont(ctx, px, run);
      w += ctx.measureText(run.text || '').width;
    }
    return w;
  }

  function wrapRuns(ctx, runs, maxWidth, px) {
    const lines = [];
    let line = [];
    let lineW = 0;

    const pushLine = () => {
      if (line.length) lines.push(line);
      line = [];
      lineW = 0;
    };

    for (const run of runs) {
      const parts = String(run.text || '').split(/(\s+)/).filter((p) => p.length);
      for (const part of parts) {
        setFont(ctx, px, run);
        const partW = ctx.measureText(part).width;
        if (line.length && lineW + partW > maxWidth && !/^\s+$/.test(part)) {
          pushLine();
        }
        if (/^\s+$/.test(part) && !line.length) continue;
        line.push({
          text: part,
          bold: !!run.bold,
          italic: !!run.italic,
          underline: !!run.underline,
          caps: !!run.caps
        });
        lineW += partW;
      }
    }
    pushLine();
    return lines.length ? lines : [[{ text: '', bold: false, italic: false, underline: false, caps: false }]];
  }

  function drawRunsLine(ctx, runs, x, y, px, color, align, colWidth) {
    const totalW = measureRunsWidth(ctx, runs, px);
    let startX = x;
    if (align === 'right') startX = x + colWidth - totalW;
    else if (align === 'center') startX = x + (colWidth - totalW) / 2;
  else if (align === 'justify' && runs.length > 1) {
      const spaceCount = runs.filter((r) => /^\s+$/.test(r.text)).length;
      const extra = spaceCount ? (colWidth - totalW) / spaceCount : 0;
      let cx = x;
      for (const run of runs) {
        setFont(ctx, px, run);
        ctx.fillStyle = run.bold ? DEFAULTS.inkStrong : color;
        ctx.fillText(run.text, cx, y);
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
        if (/^\s+$/.test(run.text) && extra > 0) cx += extra;
      }
      return;
    }

    let cx = startX;
    for (const run of runs) {
      setFont(ctx, px, run);
      ctx.fillStyle = run.bold ? DEFAULTS.inkStrong : color;
      ctx.fillText(run.text, cx, y);
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

  function layoutColumn(ctx, runs, colWidth, align, px) {
    const innerW = Math.max(1, colWidth - DEFAULTS.padX * 2);
    const wrapped = wrapRuns(ctx, runs, innerW, px);
    const lineStep = px * DEFAULTS.lineHeight;
    const textH = wrapped.length * lineStep;
    return { wrapped, textH, lineStep, innerW };
  }

  function drawColumn(ctx, layout, x, y, colWidth, align, color, px) {
    const innerX = x + DEFAULTS.padX;
    let cy = y;
    for (const line of layout.wrapped) {
      drawRunsLine(ctx, line, innerX, cy, px, color, align, layout.innerW);
      cy += layout.lineStep;
    }
    return layout.textH;
  }

  function drawHalftone(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#1a1410';
    for (let y = 0; y < h; y += 3) {
      for (let x = 0; x < w; x += 3) {
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawGrain(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.09;
    for (let i = 0; i < 8000; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = (Math.sin(i * 78.233) * 12345.6789) % 1;
      const a = ((Math.sin(i * 4.141) * 10000) % 1) > 0.5 ? 0.35 : 0.15;
      ctx.fillStyle = `rgba(26, 20, 16, ${a})`;
      ctx.fillRect(((x + 1) / 2) * w, ((y + 1) / 2) * h, 1, 1);
    }
    ctx.restore();
  }

  /**
   * @param {{ yesterday?: object, today?: object, tomorrow?: object, dateKey?: string, width?: number }} opts
   * @returns {Promise<string|null>} PNG data URL
   */
  async function composeDataUrl(opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    const W = Math.round(cfg.width);
    const peekW = Math.round(W * cfg.peekRatio);
    const centerW = W - peekW * 2;
    const px = cfg.bodyPx;
    const lineStep = px * cfg.lineHeight;

    const today = opts.today || null;
    if (!today || !normalizeText(today.text)) return null;

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {
        /* ignore */
      }
    }

    const measureCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!measureCanvas) return null;
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return null;

    const centerRuns = plainRunsForQuote(today, { neighbor: false });
    const centerLayout = layoutColumn(mctx, centerRuns, centerW, 'justify', px);
    const ruleH = 1;
    const centerBlockH =
      cfg.ruleGap + ruleH + cfg.ruleGap + centerLayout.textH + cfg.ruleGap + ruleH + cfg.ruleGap;
    const H = Math.ceil(centerBlockH + cfg.padY * 2);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = cfg.paper;
    ctx.fillRect(0, 0, W, H);

    const colXs = [0, peekW, peekW + centerW];
    const colWidths = [peekW, centerW, peekW];

    ctx.strokeStyle = cfg.ruleColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(peekW, 0);
    ctx.lineTo(peekW, H);
    ctx.moveTo(peekW + centerW, 0);
    ctx.lineTo(peekW + centerW, H);
    ctx.stroke();

    const centerY = cfg.padY;
    const ruleY1 = centerY + cfg.ruleGap;
    const textY = ruleY1 + ruleH + cfg.ruleGap;
    const ruleY2 = textY + centerLayout.textH + cfg.ruleGap;

    ctx.strokeStyle = cfg.ruleColor;
    ctx.beginPath();
    ctx.moveTo(colXs[1], ruleY1);
    ctx.lineTo(colXs[1] + centerW, ruleY1);
    ctx.moveTo(colXs[1], ruleY2);
    ctx.lineTo(colXs[1] + centerW, ruleY2);
    ctx.stroke();

    let cy = textY;
    for (let i = 0; i < centerLayout.wrapped.length; i++) {
      drawRunsLine(
        ctx,
        centerLayout.wrapped[i],
        colXs[1] + DEFAULTS.padX,
        cy,
        px,
        cfg.inkCenter,
        'justify',
        centerLayout.innerW
      );
      cy += lineStep;
    }

    const drawSide = (q, colIndex, align) => {
      if (!q || !normalizeText(q.text)) return;
      const runs = plainRunsForQuote(q, { neighbor: true });
      const layout = layoutColumn(mctx, runs, colWidths[colIndex], align, px);
      const x = colXs[colIndex];
      const sideY = cfg.padY + Math.max(0, (centerBlockH - layout.textH) / 2);
      drawColumn(ctx, layout, x, sideY, colWidths[colIndex], align, cfg.inkSide, px);
    };

    drawSide(opts.yesterday, 0, 'right');
    drawSide(opts.tomorrow, 2, 'left');

    drawHalftone(ctx, W, H);
    drawGrain(ctx, W, H);

    return canvas.toDataURL('image/png', 0.92);
  }

  return {
    DEFAULTS,
    normalizeText,
    plainRunsForQuote,
    composeDataUrl
  };
});
