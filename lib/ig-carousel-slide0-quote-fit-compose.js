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
    /** Cool charcoal vinyl (not pure black). */
    const INK = '#141518';
    const BEVEL_HI = 'rgba(255, 255, 255, 0.18)';
    const BEVEL_LO = 'rgba(0, 0, 0, 0.22)';
    /** Tightest leading when height is scarce. */
    const LINE_HEIGHT_EM_MIN = 1.02;
    /** Soft cap — high enough that few-line quotes can still pin to top/bottom. */
    const LINE_HEIGHT_EM_MAX = 2.35;
    /** Alphabetic baseline as fraction of em from top of line box. */
    const BASELINE_FROM_TOP_EM = 0.78;
    /** Minimum word gap when justifying (em of font size). */
    const MIN_WORD_GAP_EM = 0.12;
    /** Soft auto-wrap target when quote has no hard line breaks. */
    const AUTO_WRAP_TARGET_LINES = 8;
    /** At/under this word count, stack one word (or natural pair) per line. */
    const SHORT_QUOTE_STACK_MAX_WORDS = 12;
    /** Glue these to the next word so they don't sit alone on a stacked line. */
    const STACK_GLUE_NEXT = new Set([
      'A',
      'AN',
      'THE',
      'TO',
      'OF',
      'IN',
      'ON',
      'AT',
      'BY',
      'FOR',
      'OR',
      'AS',
      'IF',
      'IS',
      'AM',
      'ARE',
      'WAS',
      'WERE',
      'BE',
      'AND',
      'BUT',
      'NOT',
      'NO',
      'SO',
      'MY',
      'YOUR',
      'OUR',
      'ITS',
      'HIS',
      'HER'
    ]);
    /** Vinyl sticker placement jitter (keep noticeable). */
    const JITTER_X_EM = 0.032;
    const JITTER_Y_EM = 0.042;
    const JITTER_ROT_DEG = 3.0;
    const KERN_JITTER_EM = 0.018;
    const BEVEL_EM = 0.014;
    const CONTACT_BLUR_EM = 0.022;
    const CONTACT_OX_EM = 0.008;
    const CONTACT_OY_EM = 0.012;
    const SOFT_EDGE_BLUR_PX = 0.12;
    const GRAIN_STRENGTH = 5;
    const SHEEN_HI = 0.08;
    const SHEEN_LO = 0.06;
    /** Quilt grade under type — soften darks only + light warm cast (mat untouched). */
    const QUILT_SHADOW_LIFT = 0.32;
    const QUILT_SHADOW_POWER = 1.55;
    const QUILT_WARM_ALPHA = 0.16;

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

    function wordCore(word) {
      return String(word || '')
        .replace(/^[^A-Z0-9']+/i, '')
        .replace(/[^A-Z0-9']+$/i, '')
        .toUpperCase();
    }

    /**
     * Short quotes: one word per line, gluing small function words to the next
     * ("IS SURE", "IS POSSIBLE") so leading can stay tight while filling height.
     */
    function stackShortQuoteLines(words) {
      const lines = [];
      for (let i = 0; i < words.length; ) {
        const w = words[i];
        const core = wordCore(w);
        if (STACK_GLUE_NEXT.has(core) && i + 1 < words.length) {
          lines.push(`${w} ${words[i + 1]}`);
          i += 2;
          continue;
        }
        lines.push(w);
        i += 1;
      }
      return lines;
    }

    /**
     * Grow a line from `words[start..)` until natural width is in [minFrac, maxFrac].
     * Returns word count taken (at least 1, at most maxTake).
     */
    function takeLineByWidth(ctx, words, start, maxTake, maxW, minFrac, maxFrac) {
      const limit = Math.max(1, Math.min(maxTake, words.length - start));
      if (limit <= 1) return 1;
      const spaceW = ctx.measureText(' ').width;
      let take = 0;
      let width = 0;
      while (take < limit) {
        const nextW = ctx.measureText(words[start + take]).width;
        const newWidth = take === 0 ? nextW : width + spaceW + nextW;
        const newFrac = newWidth / Math.max(1, maxW);
        if (take > 0 && width / Math.max(1, maxW) >= minFrac && newFrac > maxFrac) {
          break;
        }
        if (take > 0 && newFrac > 0.92) break;
        width = newWidth;
        take += 1;
      }
      if (take < 1) take = 1;
      while (take < limit && width / Math.max(1, maxW) < minFrac) {
        width += spaceW + ctx.measureText(words[start + take]).width;
        take += 1;
      }
      return take;
    }

    /**
     * Same as takeLineByWidth, but counting backward from the end of `words`.
     */
    function takeLastLineByWidth(ctx, words, maxTake, maxW, minFrac, maxFrac) {
      const limit = Math.max(1, Math.min(maxTake, words.length));
      if (limit <= 1) return 1;
      const spaceW = ctx.measureText(' ').width;
      let take = 0;
      let width = 0;
      while (take < limit) {
        const nextW = ctx.measureText(words[words.length - 1 - take]).width;
        const newWidth = take === 0 ? nextW : nextW + spaceW + width;
        const newFrac = newWidth / Math.max(1, maxW);
        if (take > 0 && width / Math.max(1, maxW) >= minFrac && newFrac > maxFrac) {
          break;
        }
        if (take > 0 && newFrac > 0.92) break;
        width = newWidth;
        take += 1;
      }
      if (take < 1) take = 1;
      while (take < limit && width / Math.max(1, maxW) < minFrac) {
        width =
          ctx.measureText(words[words.length - 1 - take]).width + spaceW + width;
        take += 1;
      }
      return take;
    }

    /**
     * Pack words into `lineCount` lines.
     * First + last lines are width-based (not word count): natural width ~40–58%
     * (last may go a bit denser, ~40–70%) so justify stays readable and trailing
     * phrases like "AS I LIVE." stay on one line. Middle lines share the rest.
     */
    function packWordsWithLightFirstLine(ctx, words, lineCount, maxW, fontPx) {
      const n = Math.max(1, Math.min(lineCount, words.length));
      if (n === 1) return [words.join(' ')];

      const FIRST_MIN_FRAC = 0.4;
      const FIRST_MAX_FRAC = 0.58;
      const LAST_MIN_FRAC = 0.4;
      const LAST_MAX_FRAC = 0.7;
      ctx.font = `bold ${fontPx}px ${FONT_STACK}`;

      const maxFirst = Math.max(1, words.length - (n - 1));
      const firstTake = takeLineByWidth(
        ctx,
        words,
        0,
        maxFirst,
        maxW,
        FIRST_MIN_FRAC,
        FIRST_MAX_FRAC
      );

      if (n === 2) {
        return [
          words.slice(0, firstTake).join(' '),
          words.slice(firstTake).join(' ')
        ].filter(Boolean);
      }

      const rest = words.slice(firstTake);
      const middleCount = n - 2;
      const maxLast = Math.max(1, rest.length - middleCount);
      const lastTake = takeLastLineByWidth(
        ctx,
        rest,
        maxLast,
        maxW,
        LAST_MIN_FRAC,
        LAST_MAX_FRAC
      );
      const lastWords = rest.slice(rest.length - lastTake);
      const middleWords = rest.slice(0, rest.length - lastTake);
      const middleLines =
        middleCount > 0 && middleWords.length
          ? packWordsIntoLinesBalanced(ctx, middleWords, middleCount, fontPx)
          : [];

      return [words.slice(0, firstTake).join(' '), ...middleLines, lastWords.join(' ')].filter(
        Boolean
      );
    }

    /** Even word-count pack (no measure context). */
    function packWordsIntoLines(words, lineCount) {
      const n = Math.max(1, Math.min(lineCount, words.length));
      if (n <= 1) return words.length ? [words.join(' ')] : [];
      const base = Math.floor(words.length / n);
      let extra = words.length % n;
      const lines = [];
      let i = 0;
      for (let li = 0; li < n; li++) {
        const take = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra -= 1;
        lines.push(words.slice(i, i + take).join(' '));
        i += take;
      }
      return lines.filter(Boolean);
    }

    /**
     * Middle lines: balance by measured width so each row is similarly full
     * (avoids a dense row next to a sparse "COME WITH" / "ME, THEN," pair).
     */
    function packWordsIntoLinesBalanced(ctx, words, lineCount, fontPx) {
      const n = Math.max(1, Math.min(lineCount, words.length));
      if (n <= 1) return words.length ? [words.join(' ')] : [];
      ctx.font = `bold ${fontPx}px ${FONT_STACK}`;
      const spaceW = ctx.measureText(' ').width;
      const widths = words.map((w) => ctx.measureText(w).width);
      const lines = [];
      let i = 0;
      for (let li = 0; li < n; li++) {
        const linesLeft = n - li;
        const wordsLeft = words.length - i;
        if (linesLeft === 1) {
          lines.push(words.slice(i).join(' '));
          break;
        }
        const maxTake = wordsLeft - (linesLeft - 1);
        let remWidth = 0;
        for (let j = i; j < words.length; j++) {
          remWidth += widths[j];
        }
        remWidth += spaceW * Math.max(0, wordsLeft - 1);
        const target = remWidth / linesLeft;

        let take = 1;
        let lineW = widths[i];
        while (take < maxTake) {
          const nextW = lineW + spaceW + widths[i + take];
          const closer =
            Math.abs(nextW - target) <= Math.abs(lineW - target) + 0.5;
          const stillShort = lineW < target * 0.88;
          if (closer || stillShort) {
            lineW = nextW;
            take += 1;
          } else {
            break;
          }
        }
        lines.push(words.slice(i, i + take).join(' '));
        i += take;
      }
      return lines.filter(Boolean);
    }

    function leadingEmIfPinned(lines, fontPx, textH) {
      if (lines.length <= 1 || fontPx <= 0) return LINE_HEIGHT_EM_MIN;
      const ascent = fontPx * BASELINE_FROM_TOP_EM;
      const descent = fontPx * (1 - BASELINE_FROM_TOP_EM);
      const span = Math.max(0, textH - ascent - descent);
      return span / ((lines.length - 1) * fontPx);
    }

    function pickLinesToFillQuilt(ctx, words, maxW, maxH) {
      if (words.length <= SHORT_QUOTE_STACK_MAX_WORDS) {
        return stackShortQuoteLines(words);
      }
      let best = null;
      const maxLines = Math.min(words.length, 16);
      const minLines = Math.min(4, words.length);
      for (let n = maxLines; n >= minLines; n--) {
        const provisionalFont = Math.max(
          12,
          Math.min(220, Math.floor(maxH / (n * LINE_HEIGHT_EM_MIN)))
        );
        const lines = packWordsWithLightFirstLine(
          ctx,
          words,
          n,
          maxW,
          provisionalFont
        );
        const fontPx = maxFontForLines(ctx, lines, maxW, maxH);
        const lead = leadingEmIfPinned(lines, fontPx, maxH);
        const fills = lead <= LINE_HEIGHT_EM_MAX + 0.001;
        if (!fills) continue;
        if (
          !best ||
          fontPx > best.fontPx ||
          (fontPx === best.fontPx && lead > best.lead)
        ) {
          best = { lines, fontPx, lead };
        }
      }
      if (best) return best.lines;
      const fallbackFont = Math.max(
        12,
        Math.min(220, Math.floor(maxH / (maxLines * LINE_HEIGHT_EM_MIN)))
      );
      return packWordsWithLightFirstLine(ctx, words, maxLines, maxW, fallbackFont);
    }

    function resolveQuoteLines(quoteText, ctx = null, textRect = null) {
      const body = normalizeQuoteBody(quoteText);
      if (!body) return [];
      const hard = body
        .split('\n')
        .map((l) => toDisplayCaps(l.trim()))
        .filter(Boolean);
      if (hard.length > 1) return hard;

      const single = toDisplayCaps(hard[0] || body);
      const words = wordsOf(single);
      if (words.length <= 1) return words.length ? words : [single];
      if (words.length <= 2) return [single];

      if (
        ctx &&
        textRect &&
        textRect.width > 0 &&
        textRect.height > 0
      ) {
        return pickLinesToFillQuilt(ctx, words, textRect.width, textRect.height);
      }

      if (words.length <= SHORT_QUOTE_STACK_MAX_WORDS) {
        return stackShortQuoteLines(words);
      }

      const target = Math.min(
        AUTO_WRAP_TARGET_LINES,
        Math.max(4, Math.round(words.length / 2.5))
      );
      return packWordsIntoLines(words, Math.min(words.length, target));
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
      /** Height bound uses min leading — stretch happens after. */
      const byHeight = Math.floor(maxH / (lines.length * LINE_HEIGHT_EM_MIN));
      let lo = 8;
      let hi = Math.max(lo, Math.min(220, byHeight));
      let best = lo;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        let fits = mid * LINE_HEIGHT_EM_MIN * lines.length <= maxH + 0.5;
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

    /**
     * Spread baselines so first/last lines pin to the text box edges; step grows
     * with leftover height (capped). Returns { startY, step, lineHeightEm }.
     */
    function resolveVariableLineLayout(lines, textRect, fontPx) {
      const n = lines.length;
      const ascent = fontPx * BASELINE_FROM_TOP_EM;
      const descent = fontPx * (1 - BASELINE_FROM_TOP_EM);
      if (n <= 1) {
        return {
          startY: textRect.y + (textRect.height + ascent - descent) / 2,
          step: 0,
          lineHeightEm: LINE_HEIGHT_EM_MIN
        };
      }
      const firstY = textRect.y + ascent;
      const lastY = textRect.y + textRect.height - descent;
      const span = Math.max(0, lastY - firstY);
      const stepFill = span / (n - 1);
      const stepMin = fontPx * LINE_HEIGHT_EM_MIN;
      const stepMax = fontPx * LINE_HEIGHT_EM_MAX;
      const step = Math.min(stepMax, Math.max(stepMin, stepFill));
      /** If capped below full fill, re-center the block. */
      const blockSpan = step * (n - 1);
      const startY = firstY + (span - blockSpan) / 2;
      return {
        startY,
        step,
        lineHeightEm: step / fontPx
      };
    }

    function hashSeed(str) {
      let h = 2166136261;
      const s = String(str || '');
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0 || 1;
    }

    function mulberry32(seed) {
      let a = seed >>> 0 || 1;
      return function next() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /**
     * Sparse, partial edge catch — not every letter, not full stroke length.
     */
    function drawUnevenVinylHighlight(octx, ch, lx, ly, w, fontPx, pad, bevel, rng) {
      /** ~half the glyphs skip a highlight entirely. */
      if (rng() > 0.52) return;
      const alpha = 0.09 + rng() * 0.13;
      octx.save();
      const mode = rng();
      if (mode < 0.38) {
        /** Top-edge glint along a random span. */
        const start = rng() * 0.6;
        const len = 0.18 + rng() * 0.42;
        const x0 = lx + w * start;
        const x1 = lx + w * Math.min(1, start + len);
        octx.beginPath();
        octx.rect(
          x0 - bevel,
          pad,
          Math.max(2, x1 - x0) + bevel * 2,
          fontPx * (0.16 + rng() * 0.2)
        );
        octx.clip();
      } else if (mode < 0.72) {
        /** Left-edge glint along a random vertical span. */
        const start = rng() * 0.55;
        const len = 0.2 + rng() * 0.4;
        const y0 = pad + fontPx * start;
        const y1 = pad + fontPx * Math.min(0.95, start + len);
        octx.beginPath();
        octx.rect(
          Math.max(0, lx - bevel * 2),
          y0,
          fontPx * (0.14 + rng() * 0.16),
          Math.max(2, y1 - y0)
        );
        octx.clip();
      } else {
        /** Short top-left corner catch only. */
        const cw = w * (0.22 + rng() * 0.38);
        const chh = fontPx * (0.18 + rng() * 0.28);
        octx.beginPath();
        octx.rect(Math.max(0, lx - bevel * 2), pad, cw + bevel * 2, chh);
        octx.clip();
      }
      octx.fillStyle = `rgba(255,255,255,${alpha})`;
      octx.fillText(ch, lx - bevel, ly - bevel);
      octx.restore();
    }

    /**
     * Build one die-cut vinyl glyph (bevel + satin + grain) on an offscreen canvas.
     */
    function buildVinylGlyphCanvas(ch, fontPx, rng) {
      const measure = document.createElement('canvas').getContext('2d');
      measure.font = `bold ${fontPx}px ${FONT_STACK}`;
      const w = Math.max(1, measure.measureText(ch).width);
      const ascent = fontPx * BASELINE_FROM_TOP_EM;
      const pad = Math.ceil(fontPx * 0.28);
      const ow = Math.ceil(w) + pad * 2;
      const oh = Math.ceil(fontPx * 1.35) + pad * 2;
      const off = document.createElement('canvas');
      off.width = ow;
      off.height = oh;
      const octx = off.getContext('2d');
      octx.font = `bold ${fontPx}px ${FONT_STACK}`;
      octx.textBaseline = 'alphabetic';
      octx.textAlign = 'left';
      const lx = pad;
      const ly = pad + ascent;
      const bevel = Math.max(1, fontPx * BEVEL_EM);

      /** Soft contact-edge shadow — keep light and usually full (reads as thickness). */
      if (rng() > 0.18) {
        octx.fillStyle = BEVEL_LO;
        octx.fillText(ch, lx + bevel, ly + bevel);
      }
      drawUnevenVinylHighlight(octx, ch, lx, ly, w, fontPx, pad, bevel, rng);
      octx.fillStyle = INK;
      octx.fillText(ch, lx, ly);

      /** Satin sheen on the vinyl face only. */
      octx.globalCompositeOperation = 'source-atop';
      const sheen = octx.createLinearGradient(lx, pad, lx + w, oh - pad);
      sheen.addColorStop(0, `rgba(255,255,255,${SHEEN_HI})`);
      sheen.addColorStop(0.3, `rgba(255,255,255,${SHEEN_HI * 0.25})`);
      sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, `rgba(0,0,0,${SHEEN_LO})`);
      octx.fillStyle = sheen;
      octx.fillRect(0, 0, ow, oh);

      /** Tiny orange-peel grain. */
      try {
        const img = octx.getImageData(0, 0, ow, oh);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 10) continue;
          const n = (rng() - 0.5) * GRAIN_STRENGTH;
          d[i] = Math.max(0, Math.min(255, d[i] + n));
          d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
          d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
        }
        octx.putImageData(img, 0, 0);
      } catch (_) {
        /* tainted / blocked — skip grain */
      }
      octx.globalCompositeOperation = 'source-over';

      return { canvas: off, width: w, pad, ascent };
    }

    function drawVinylChar(ctx, ch, x, y, fontPx, rng) {
      if (!ch || ch === ' ') return ctx.measureText(' ').width || fontPx * 0.3;
      const glyph = buildVinylGlyphCanvas(ch, fontPx, rng);
      const jitterX = (rng() - 0.5) * fontPx * JITTER_X_EM;
      const jitterY = (rng() - 0.5) * fontPx * JITTER_Y_EM;
      const rot = ((rng() - 0.5) * JITTER_ROT_DEG * Math.PI) / 180;
      const kern = (rng() - 0.5) * fontPx * KERN_JITTER_EM;

      ctx.save();
      ctx.translate(x + jitterX + glyph.width / 2, y + jitterY - fontPx * 0.35);
      ctx.rotate(rot);
      ctx.translate(-glyph.width / 2, fontPx * 0.35);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
      ctx.shadowBlur = Math.max(1, fontPx * CONTACT_BLUR_EM);
      ctx.shadowOffsetX = fontPx * CONTACT_OX_EM;
      ctx.shadowOffsetY = fontPx * CONTACT_OY_EM;
      if ('filter' in ctx) ctx.filter = `blur(${SOFT_EDGE_BLUR_PX}px)`;
      ctx.drawImage(glyph.canvas, -glyph.pad, -glyph.ascent - glyph.pad);
      ctx.restore();

      return glyph.width + kern;
    }

    /**
     * Soften only dark quilt patches (brights stay put) + light warm cast,
     * so dark vinyl reads more clearly. Clipped to quilt paper (mat untouched).
     */
    function gradeQuiltFrameForType(ctx, rect, options = {}) {
      if (!rect?.width || !rect?.height) return;
      const lift =
        Number(options.shadowLift) >= 0 ? Number(options.shadowLift) : QUILT_SHADOW_LIFT;
      const power =
        Number(options.shadowPower) > 0 ? Number(options.shadowPower) : QUILT_SHADOW_POWER;
      const warm =
        Number(options.warmAlpha) >= 0 ? Number(options.warmAlpha) : QUILT_WARM_ALPHA;

      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();

      try {
        const img = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          /** Near-black lifts most; mid/high tones barely move. */
          const t = Math.pow(Math.max(0, 1 - lum), power) * lift;
          if (t < 0.004) continue;
          d[i] = Math.min(255, r + (255 - r) * t + t * 10);
          d[i + 1] = Math.min(255, g + (255 - g) * t + t * 5);
          d[i + 2] = Math.min(255, b + (255 - b) * t);
        }
        ctx.putImageData(img, rect.x, rect.y);
      } catch (_) {
        /* tainted — skip pixel lift */
      }

      if (warm > 0) {
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = `rgba(210, 150, 90, ${warm})`;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }

      ctx.restore();
    }

    function drawJustifiedVinylLine(ctx, line, x, y, width, fontPx, rng) {
      const words = wordsOf(line);
      if (!words.length) return;
      ctx.font = `bold ${fontPx}px ${FONT_STACK}`;
      const wordWidths = words.map((w) => {
        let sum = 0;
        for (const ch of w) sum += ctx.measureText(ch).width;
        return sum;
      });
      const gap =
        words.length === 1
          ? 0
          : Math.max(
              fontPx * MIN_WORD_GAP_EM,
              (width - wordWidths.reduce((a, b) => a + b, 0)) / (words.length - 1)
            );
      let cx = x;
      for (let wi = 0; wi < words.length; wi++) {
        for (const ch of words[wi]) {
          const measured = ctx.measureText(ch).width;
          drawVinylChar(ctx, ch, cx, y, fontPx, rng);
          cx += measured;
        }
        if (wi < words.length - 1) cx += gap;
      }
    }

    /**
     * Draw quote into an already-painted quilt frame rect.
     */
    function drawQuoteFitInQuiltRect(ctx, quoteText, quiltRect, options = {}) {
      const padFrac =
        Number(options.textPadFrac) > 0 ? Number(options.textPadFrac) : TEXT_PAD_FRAC;
      if (!quiltRect?.width) {
        return { lines: [], fontPx: 0, textRect: null, lineHeightEm: 0 };
      }
      const padX = Math.max(4, Math.round(quiltRect.width * padFrac));
      const padY = Math.max(4, Math.round(quiltRect.height * padFrac));
      const textRect = {
        x: Math.round(quiltRect.x + padX),
        y: Math.round(quiltRect.y + padY),
        width: Math.round(quiltRect.width - padX * 2),
        height: Math.round(quiltRect.height - padY * 2)
      };
      const lines = resolveQuoteLines(quoteText, ctx, textRect);
      if (!lines.length) {
        return { lines: [], fontPx: 0, textRect, lineHeightEm: 0 };
      }
      const fontPx = maxFontForLines(ctx, lines, textRect.width, textRect.height);
      const layout = resolveVariableLineLayout(lines, textRect, fontPx);
      const seed = hashSeed(
        `${options.dateKey || 'slide0'}:${lines.join('|')}:${Math.round(fontPx)}`
      );
      const rng = mulberry32(seed);

      ctx.save();
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      for (let i = 0; i < lines.length; i++) {
        drawJustifiedVinylLine(
          ctx,
          lines[i],
          textRect.x,
          layout.startY + i * layout.step,
          textRect.width,
          fontPx,
          rng
        );
      }
      ctx.restore();

      return {
        lines,
        fontPx,
        textRect,
        lineHeightEm: layout.lineHeightEm,
        lineStepPx: layout.step,
        vinylStickers: true
      };
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

      if (options.gradeQuilt !== false) {
        gradeQuiltFrameForType(ctx, typeRect, {
          shadowLift: options.quiltShadowLift,
          shadowPower: options.quiltShadowPower,
          warmAlpha: options.quiltWarmAlpha
        });
      }

      const drawn = drawQuoteFitInQuiltRect(ctx, quoteText, typeRect, {
        textPadFrac: options.textPadFrac,
        dateKey
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
          lineHeightEm: drawn.lineHeightEm,
          lineStepPx: drawn.lineStepPx,
          lineCount: drawn.lines.length,
          lines: drawn.lines,
          vinylStickers: drawn.vinylStickers === true,
          quiltGrade: options.gradeQuilt !== false,
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
