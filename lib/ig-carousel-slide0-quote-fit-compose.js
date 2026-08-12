/**
 * IG carousel slide 0 (alternate slide 1): cutting-mat + quilt frame with
 * bold Helvetica quote scaled + fully justified to fill the quilt frame.
 * Browser: globalThis.IgCarouselSlide0QuoteFitCompose
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IgCarouselSlide0QuoteFitCompose = api;
    root.composeCarouselSlide0QuoteFitFromQuiltBlob = api.composeCarouselSlide0QuoteFitFromQuiltBlob;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
  function (global) {
    'use strict';

    const PANEL_W = 1080;
    const PANEL_H = 1350;
    /** Match slide 1 mat peek (thin green border). */
    const MAT_PEEK_PX = 36;
    /** Inset inside the quilt paper so glyphs never kiss the tooth edge. */
    const TEXT_PAD_FRAC = 0.028;
    const FONT_STACK = 'Helvetica, "Helvetica Neue", Arial, sans-serif';
    const INK = '#0a0a0a';
    /** Cap-height-ish leading — lines pack to fill the frame. */
    const LINE_HEIGHT_EM = 1.02;
    /** Minimum word gap when justifying (em of font size). */
    const MIN_WORD_GAP_EM = 0.12;
    /** Soft auto-wrap target when quote has no hard line breaks. */
    const AUTO_WRAP_TARGET_LINES = 8;

    function loadImageFromBlob(blob) {
      return new Promise((resolve, reject) => {
        if (!blob) {
          reject(new Error('slide0: missing quilt blob'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('slide0: quilt image load failed'));
        };
        img.src = url;
      });
    }

    function canvasToBlob(canvas) {
      return new Promise((resolve) => {
        if (!canvas?.toBlob) {
          resolve(null);
          return;
        }
        canvas.toBlob((blob) => resolve(blob || null), 'image/png');
      });
    }

    /**
     * Poetry: Notion spaced slashes → newlines. Keep bare and/or and URLs alone.
     * Only ` / ` (spaces both sides) becomes a break — not `and/or` or `https://`.
     */
    function expandPoetrySlashes(text) {
      return String(text || '').replace(/ \/\ /g, '\n');
    }

    function normalizeQuoteBody(quoteText) {
      let t = String(quoteText || '').trim();
      t = expandPoetrySlashes(t);
      t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      t = t.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
      t = t.replace(/[ \t]{2,}/g, ' ');
      return t.trim();
    }

    function toDisplayCaps(text) {
      return String(text || '')
        .toLocaleUpperCase('en-US')
        .replace(/\u2019/g, "'")
        .replace(/\u2018/g, "'");
    }

    function wordsOf(line) {
      return String(line || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    }

    /**
     * Prefer hard line breaks; otherwise soft-wrap to ~target lines by word count.
     */
    function resolveQuoteLines(quoteText) {
      const body = normalizeQuoteBody(quoteText);
      if (!body) return [];
      const hard = body
        .split('\n')
        .map((l) => toDisplayCaps(l.trim()))
        .filter(Boolean);
      if (hard.length > 1) return hard;

      const single = toDisplayCaps(hard[0] || body);
      const words = wordsOf(single);
      if (words.length <= 2) return [single];

      const target = Math.min(
        AUTO_WRAP_TARGET_LINES,
        Math.max(3, Math.round(Math.sqrt(words.length * 1.6)))
      );
      const perLine = Math.max(1, Math.ceil(words.length / target));
      const lines = [];
      for (let i = 0; i < words.length; i += perLine) {
        lines.push(words.slice(i, i + perLine).join(' '));
      }
      return lines;
    }

    function measureWords(ctx, words, fontPx) {
      ctx.font = `bold ${fontPx}px ${FONT_STACK}`;
      return words.map((w) => ctx.measureText(w).width);
    }

    function lineNaturalWidth(widths, fontPx) {
      if (!widths.length) return 0;
      const minGap = fontPx * MIN_WORD_GAP_EM;
      const sum = widths.reduce((a, b) => a + b, 0);
      return sum + minGap * Math.max(0, widths.length - 1);
    }

    function maxFontForLines(ctx, lines, maxW, maxH) {
      if (!lines.length || maxW < 8 || maxH < 8) return 12;
      const byHeight = Math.floor(maxH / (lines.length * LINE_HEIGHT_EM));
      let lo = 8;
      let hi = Math.max(lo, Math.min(220, byHeight));
      let best = lo;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        let fits = mid * LINE_HEIGHT_EM * lines.length <= maxH + 0.5;
        if (fits) {
          for (const line of lines) {
            const words = wordsOf(line);
            const widths = measureWords(ctx, words, mid);
            if (lineNaturalWidth(widths, mid) > maxW + 0.5) {
              fits = false;
              break;
            }
          }
        }
        if (fits) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best;
    }

    function drawJustifiedLine(ctx, line, x, y, width, fontPx) {
      const words = wordsOf(line);
      if (!words.length) return;
      ctx.font = `bold ${fontPx}px ${FONT_STACK}`;
      ctx.fillStyle = INK;
      ctx.textBaseline = 'alphabetic';
      const widths = words.map((w) => ctx.measureText(w).width);
      if (words.length === 1) {
        ctx.fillText(words[0], x, y);
        return;
      }
      const sum = widths.reduce((a, b) => a + b, 0);
      const gap = Math.max(fontPx * MIN_WORD_GAP_EM, (width - sum) / (words.length - 1));
      let cx = x;
      for (let i = 0; i < words.length; i++) {
        ctx.fillText(words[i], cx, y);
        cx += widths[i] + gap;
      }
    }

    /**
     * Draw quote into an already-painted quilt frame rect.
     */
    function drawQuoteFitInQuiltRect(ctx, quoteText, quiltRect, options = {}) {
      const lines = resolveQuoteLines(quoteText);
      if (!lines.length || !quiltRect?.width) {
        return { lines: [], fontPx: 0, textRect: null };
      }
      const padFrac =
        Number(options.textPadFrac) > 0 ? Number(options.textPadFrac) : TEXT_PAD_FRAC;
      const padX = Math.max(4, Math.round(quiltRect.width * padFrac));
      const padY = Math.max(4, Math.round(quiltRect.height * padFrac));
      const textRect = {
        x: Math.round(quiltRect.x + padX),
        y: Math.round(quiltRect.y + padY),
        width: Math.round(quiltRect.width - padX * 2),
        height: Math.round(quiltRect.height - padY * 2)
      };
      const fontPx = maxFontForLines(ctx, lines, textRect.width, textRect.height);
      const blockH = fontPx * LINE_HEIGHT_EM * lines.length;
      const startY =
        textRect.y +
        (textRect.height - blockH) / 2 +
        fontPx * 0.78;
      const step = fontPx * LINE_HEIGHT_EM;

      ctx.save();
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      for (let i = 0; i < lines.length; i++) {
        drawJustifiedLine(ctx, lines[i], textRect.x, startY + i * step, textRect.width, fontPx);
      }
      ctx.restore();

      return { lines, fontPx, textRect };
    }

    async function composeCarouselSlide0QuoteFitFromQuiltBlob(quiltBlob, options = {}) {
      const dateKey = String(options.dateKey || 'our-daily').trim() || 'our-daily';
      const quoteText = String(options.quoteText || options.quote || '').trim();
      if (!quiltBlob || !quoteText) return null;

      const CQB = global.CarouselQuiltBg || globalThis.CarouselQuiltBg;
      const MatBg = global.CarouselCuttingMatBg || globalThis.CarouselCuttingMatBg;
      const PaperDepth = globalThis.IgCarouselPaperDepth;
      if (!CQB?.drawLayoutBCarouselQuiltBg) return null;

      const quiltImg = await loadImageFromBlob(quiltBlob);
      let quiltCanvasRect = null;
      const preset = options.quiltCanvasRect;
      if (preset && Number.isFinite(Number(preset.x)) && Number(preset.width) > 0) {
        const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
        const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
        quiltCanvasRect = {
          x: Math.round(Number(preset.x)),
          y: Math.round(Number(preset.y)),
          width: Math.round(Number(preset.width)),
          height: Math.round(Number(preset.height)),
          sourceWidth: Number(preset.sourceWidth) > 0 ? Math.round(Number(preset.sourceWidth)) : iw,
          sourceHeight: Number(preset.sourceHeight) > 0 ? Math.round(Number(preset.sourceHeight)) : ih
        };
      } else if (typeof CQB.resolveLayoutBCarouselQuiltRect === 'function') {
        const resolved = CQB.resolveLayoutBCarouselQuiltRect(quiltImg, PANEL_W, PANEL_H, {
          quiltBgZoom: options.quiltBgZoom,
          quiltBgOffsetY: options.quiltBgOffsetY,
          quiltFit: options.quiltFit || 'cover'
        });
        quiltCanvasRect = resolved?.rect || null;
      }
      if (!quiltCanvasRect) return null;

      const matPeekPx =
        Number(options.quiltMatPeekPx) > 0
          ? Number(options.quiltMatPeekPx)
          : CQB.CAROUSEL_SLIDE1_MAT_PEEK_PX ?? MAT_PEEK_PX;
      const matPanX = MatBg?.CAROUSEL_MAT_PAN?.SLIDE_1 ?? 0;

      const [cuttingMatImg, paperTextureImg] = await Promise.all([
        MatBg?.loadCarouselCuttingMatImage?.() || Promise.resolve(null),
        PaperDepth?.loadPaperTextureImage?.() || Promise.resolve(null)
      ]);

      try {
        if (document?.fonts?.load) {
          await Promise.allSettled([
            document.fonts.load(`bold 64px Helvetica`),
            document.fonts.load(`bold 64px "Helvetica Neue"`),
            document.fonts.ready
          ]);
        }
      } catch (_) {
        /* optional */
      }

      const canvas = document.createElement('canvas');
      canvas.width = PANEL_W;
      canvas.height = PANEL_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      CQB.drawLayoutBCarouselQuiltBg(ctx, quiltImg, quiltCanvasRect, PANEL_W, PANEL_H, {
        greenCuttingMatUnderQuilt: true,
        quiltMatPeekPx: matPeekPx,
        cuttingMatImg,
        paperTextureImg,
        paperToothSeed: `${dateKey}:carousel-slide-0`,
        matPanX,
        topCastShadow: {
          offsetY: 8,
          bandUp: 12,
          alpha: 0.2,
          secondaryAlpha: 0.08,
          blur: 14
        },
        smoothingQuality: options.smoothingQuality || 'high'
      });

      /** Visible quilt paper = panel inset by mat peek (same frame drawLayoutBCarouselQuiltBg paints). */
      const peek = Math.max(0, Math.round(matPeekPx));
      const typeRect = {
        x: peek,
        y: peek,
        width: PANEL_W - peek * 2,
        height: PANEL_H - peek * 2
      };

      const drawn = drawQuoteFitInQuiltRect(ctx, quoteText, typeRect, {
        textPadFrac: options.textPadFrac
      });

      const blob = await canvasToBlob(canvas);
      if (!blob) return null;

      return {
        blob,
        meta: {
          panelWidth: PANEL_W,
          panelHeight: PANEL_H,
          carouselQuiltBgMode: 'cutting-mat-slide0-quote-fit',
          quiltCanvasRect,
          typeRect,
          quiltMatPeekPx: matPeekPx,
          fontPx: drawn.fontPx,
          lineCount: drawn.lines.length,
          lines: drawn.lines,
          dateKey
        }
      };
    }

    return {
      PANEL_W,
      PANEL_H,
      MAT_PEEK_PX,
      FONT_STACK,
      resolveQuoteLines,
      drawQuoteFitInQuiltRect,
      composeCarouselSlide0QuoteFitFromQuiltBlob
    };
  }
);
