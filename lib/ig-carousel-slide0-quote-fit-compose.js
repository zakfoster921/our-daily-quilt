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
    root.composeStoryQuoteFitFromQuiltBlob = api.composeStoryQuoteFitFromQuiltBlob;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
  function (global) {
    'use strict';

    const PANEL_W = 1080;
    const PANEL_H = 1350;
    /** Instagram story alternate of slide 0 (same vinyl quote-fit). */
    const STORY_PANEL_W = 1080;
    const STORY_PANEL_H = 1920;
    /** Story: keep leading tight — tall canvas should not stretch type. */
    const STORY_LINE_HEIGHT_EM_MAX = 1.18;
    const STORY_LINE_HEIGHT_EM_PREFERRED = 1.08;
    /** Story speaker band (slide 0b styling) — leave top for quote. */
    const STORY_SPEAKER_FRAME_FRAC = 0.34;
    const STORY_SPEAKER_TOP_FRAC = 0.5;
    const STORY_SPEAKER_ALIGN = 'right';
    /** Tight gap between cutout paper bottom and vinyl name. */
    const STORY_SPEAKER_NAME_GAP_PX = 12;
    const STORY_QUOTE_SPEAKER_GAP_PX = 36;
    /** Clear IG story chrome (progress bars + profile row) above quote. */
    const STORY_QUOTE_TOP_PAD_PX = 240;
    /** Floor when reclaiming space so quote/speaker never overlap. */
    const STORY_QUOTE_TOP_PAD_MIN_PX = 140;
    /** Match slide 1 mat peek (thin green border). */
    const MAT_PEEK_PX = 36;
    /** Vertical inset inside the quilt paper so glyphs never kiss the tooth edge. */
    const TEXT_PAD_FRAC = 0.028;
    /** Extra left/right breathing room for the quote block. */
    const TEXT_PAD_X_FRAC = 0.058;
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
    const MIN_WORD_GAP_EM = 0.36;
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
    /** Quilt-screen meet-fit bakes this cream into empty paper; crop it before cover. */
    const QUILT_MATTE = { r: 246, g: 244, b: 241 };
    const QUILT_MATTE_THRESH = 24;
    const QUILT_MATTE_BAR_FRAC = 0.9;
    const QUILT_MATTE_MIN_BAR_FRAC = 0.03;
    const QUILT_MATTE_MIN_KEEP_FRAC = 0.5;

    function isQuiltMattePixel(r, g, b) {
      return (
        Math.abs(r - QUILT_MATTE.r) <= QUILT_MATTE_THRESH &&
        Math.abs(g - QUILT_MATTE.g) <= QUILT_MATTE_THRESH &&
        Math.abs(b - QUILT_MATTE.b) <= QUILT_MATTE_THRESH
      );
    }

    /**
     * Drop uniform cream letterbox bars from a quilt-screen raster so cover-fit
     * can fill the IG paper. No-ops when the quilt already fills the image.
     */
    function cropQuiltMatteLetterbox(img) {
      const iw = Math.max(1, img.naturalWidth || img.width);
      const ih = Math.max(1, img.naturalHeight || img.height);
      const maxScan = 280;
      const scale = Math.min(1, maxScan / Math.max(iw, ih));
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return img;
      ctx.drawImage(img, 0, 0, w, h);
      let data;
      try {
        data = ctx.getImageData(0, 0, w, h).data;
      } catch (_) {
        return img;
      }
      const rowIsBar = (y) => {
        let n = 0;
        const off = y * w * 4;
        for (let x = 0; x < w; x += 1) {
          const i = off + x * 4;
          if (isQuiltMattePixel(data[i], data[i + 1], data[i + 2])) n += 1;
        }
        return n / w >= QUILT_MATTE_BAR_FRAC;
      };
      const colIsBar = (x) => {
        let n = 0;
        for (let y = 0; y < h; y += 1) {
          const i = (y * w + x) * 4;
          if (isQuiltMattePixel(data[i], data[i + 1], data[i + 2])) n += 1;
        }
        return n / h >= QUILT_MATTE_BAR_FRAC;
      };
      let top = 0;
      let bottom = h - 1;
      let left = 0;
      let right = w - 1;
      while (top < bottom && rowIsBar(top)) top += 1;
      while (bottom > top && rowIsBar(bottom)) bottom -= 1;
      while (left < right && colIsBar(left)) left += 1;
      while (right > left && colIsBar(right)) right -= 1;
      const pad = 1;
      top = Math.max(0, top - pad);
      left = Math.max(0, left - pad);
      bottom = Math.min(h - 1, bottom + pad);
      right = Math.min(w - 1, right + pad);
      const cw = right - left + 1;
      const ch = bottom - top + 1;
      if (cw < w * QUILT_MATTE_MIN_KEEP_FRAC || ch < h * QUILT_MATTE_MIN_KEEP_FRAC) return img;
      const croppedV =
        top > h * QUILT_MATTE_MIN_BAR_FRAC || h - 1 - bottom > h * QUILT_MATTE_MIN_BAR_FRAC;
      const croppedH =
        left > w * QUILT_MATTE_MIN_BAR_FRAC || w - 1 - right > w * QUILT_MATTE_MIN_BAR_FRAC;
      if (!croppedV && !croppedH) return img;
      const sx = Math.round((left / w) * iw);
      const sy = Math.round((top / h) * ih);
      const sw = Math.max(1, Math.round((cw / w) * iw));
      const sh = Math.max(1, Math.round((ch / h) * ih));
      if (sx <= 0 && sy <= 0 && sw >= iw - 1 && sh >= ih - 1) return img;
      const out = document.createElement('canvas');
      out.width = Math.min(iw, sx + sw) - sx;
      out.height = Math.min(ih, sy + sh) - sy;
      if (out.width < 8 || out.height < 8) return img;
      const octx = out.getContext('2d');
      if (!octx) return img;
      octx.drawImage(img, sx, sy, out.width, out.height, 0, 0, out.width, out.height);
      return out;
    }

    function resolveCoverQuiltRect(CQB, quiltImg, panelW, panelH, options = {}) {
      if (typeof CQB.resolveLayoutBCarouselQuiltRect !== 'function') return null;
      const resolved = CQB.resolveLayoutBCarouselQuiltRect(quiltImg, panelW, panelH, {
        quiltBgZoom: options.quiltBgZoom,
        quiltBgOffsetY: options.quiltBgOffsetY,
        quiltFit: options.quiltFit || 'cover'
      });
      return resolved?.rect || null;
    }

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

    function loadImageFromUrl(url, timeoutMs = 8000) {
      return new Promise((resolve, reject) => {
        const src = String(url || '').trim();
        if (!src) {
          reject(new Error('slide0: missing image url'));
          return;
        }
        const img = new Image();
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('slide0: image load timed out'));
        }, Math.max(500, Number(timeoutMs) || 8000));
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(img);
        };
        img.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new Error('slide0: image load failed'));
        };
        img.src = src;
      });
    }

    function canvasToBlob(canvas, options = {}) {
      return new Promise((resolve) => {
        if (!canvas?.toBlob) {
          resolve(null);
          return;
        }
        const mime = String(options.exportMime || options.mimeType || 'image/png').trim() || 'image/png';
        const qualityRaw = Number(options.exportQuality ?? options.quality);
        const quality =
          mime.startsWith('image/jpeg') || mime === 'image/webp'
            ? Number.isFinite(qualityRaw)
              ? Math.min(1, Math.max(0.4, qualityRaw))
              : 0.82
            : undefined;
        canvas.toBlob((blob) => resolve(blob || null), mime, quality);
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
     * Fill each line until the next word (plus min gap) no longer fits.
     * One overflowing word still sits on its own line — font shrink handles it.
     */
    function wrapWordsGreedy(ctx, words, maxW, fontPx) {
      if (!words.length) return [];
      ctx.font = `bold ${fontPx}px ${FONT_STACK}`;
      const widths = words.map((w) => ctx.measureText(w).width);
      const minGap = fontPx * MIN_WORD_GAP_EM;
      const lines = [];
      let i = 0;
      while (i < words.length) {
        let take = 1;
        let width = widths[i];
        while (i + take < words.length) {
          const next = width + minGap + widths[i + take];
          if (next > maxW + 0.5) break;
          width = next;
          take += 1;
        }
        lines.push(words.slice(i, i + take).join(' '));
        i += take;
      }
      return lines;
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
     * Largest type that still fits: wrap greedily at each size, keep the
     * fullest lines from the winning font.
     */
    function pickLinesToFillQuilt(ctx, words, maxW, maxH) {
      let lo = 8;
      let hi = 220;
      let bestLines = wrapWordsGreedy(ctx, words, maxW, lo);
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const lines = wrapWordsGreedy(ctx, words, maxW, mid);
        const fitsH =
          maxH < 8 || mid * LINE_HEIGHT_EM_MIN * lines.length <= maxH + 0.5;
        const fitsW = linesFitWidth(ctx, lines, mid, maxW);
        if (fitsH && fitsW) {
          bestLines = lines;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return bestLines;
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

      if (ctx && textRect && textRect.width > 0 && textRect.height > 0) {
        return pickLinesToFillQuilt(ctx, words, textRect.width, textRect.height);
      }

      /** No canvas: pack ~5 words per line so we don't invent sparse rows. */
      const target = Math.max(1, Math.ceil(words.length / 5));
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

    function linesFitWidth(ctx, lines, fontPx, maxW) {
      for (const line of lines) {
        const words = wordsOf(line);
        const widths = measureWords(ctx, words, fontPx);
        if (lineNaturalWidth(widths, fontPx) > maxW + 0.5) return false;
      }
      return true;
    }

    function maxFontForLines(ctx, lines, maxW, maxH, options = {}) {
      if (!lines.length || maxW < 8) return 12;
      /**
       * Story / top-align: size by column width only (top pad must not shrink type).
       * Height shrink only when explicitly requested for long quotes that must fit.
       */
      if (options.widthOnly === true || options.widthFirst === true) {
        let lo = 8;
        let hi = 220;
        let best = lo;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (linesFitWidth(ctx, lines, mid, maxW)) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (options.fitHeight !== true || maxH < 8) return best;
        const leadEm =
          Number(options.lineHeightEmPreferred) > 0
            ? Number(options.lineHeightEmPreferred)
            : LINE_HEIGHT_EM_MIN;
        if (best * leadEm * lines.length <= maxH + 0.5) return best;
        lo = 8;
        hi = best;
        best = 8;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (
            mid * leadEm * lines.length <= maxH + 0.5 &&
            linesFitWidth(ctx, lines, mid, maxW)
          ) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        return best;
      }

      if (maxH < 8) return 12;
      /** Height bound uses min leading — stretch happens after. */
      const byHeight = Math.floor(maxH / (lines.length * LINE_HEIGHT_EM_MIN));
      let lo = 8;
      let hi = Math.max(lo, Math.min(220, byHeight));
      let best = lo;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        let fits = mid * LINE_HEIGHT_EM_MIN * lines.length <= maxH + 0.5;
        if (fits) fits = linesFitWidth(ctx, lines, mid, maxW);
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
     * options.align = 'top' → pin block to top and keep leading tight (story).
     */
    function resolveVariableLineLayout(lines, textRect, fontPx, options = {}) {
      const n = lines.length;
      const ascent = fontPx * BASELINE_FROM_TOP_EM;
      const descent = fontPx * (1 - BASELINE_FROM_TOP_EM);
      const alignTop = options.align === 'top';
      const lineHeightEmMax =
        Number(options.lineHeightEmMax) > 0
          ? Number(options.lineHeightEmMax)
          : LINE_HEIGHT_EM_MAX;
      const lineHeightEmPreferred =
        Number(options.lineHeightEmPreferred) > 0
          ? Number(options.lineHeightEmPreferred)
          : null;

      if (n <= 1) {
        return {
          startY: alignTop
            ? textRect.y + ascent
            : textRect.y + (textRect.height + ascent - descent) / 2,
          step: 0,
          lineHeightEm: LINE_HEIGHT_EM_MIN
        };
      }
      const firstY = textRect.y + ascent;
      const lastY = textRect.y + textRect.height - descent;
      const span = Math.max(0, lastY - firstY);
      const stepFill = span / (n - 1);
      const stepMin = fontPx * LINE_HEIGHT_EM_MIN;
      const stepMax = fontPx * lineHeightEmMax;

      if (alignTop) {
        const preferred =
          lineHeightEmPreferred != null
            ? fontPx * lineHeightEmPreferred
            : stepMin * 1.05;
        const step = Math.min(stepMax, Math.max(stepMin, preferred));
        return {
          startY: firstY,
          step,
          lineHeightEm: step / fontPx
        };
      }

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

    /** Vertical span of a top-aligned quote block (ascent → last descent). */
    function measureTopAlignedQuoteBlockHeight(lineCount, fontPx, lineHeightEm) {
      const n = Math.max(1, lineCount);
      const lead = Number(lineHeightEm) > 0 ? Number(lineHeightEm) : LINE_HEIGHT_EM_MIN;
      if (n <= 1) return fontPx;
      return fontPx + (n - 1) * fontPx * lead;
    }

    /**
     * Draw quote into an already-painted quilt frame rect.
     */
    function drawQuoteFitInQuiltRect(ctx, quoteText, quiltRect, options = {}) {
      const padFrac =
        Number(options.textPadFrac) > 0 ? Number(options.textPadFrac) : TEXT_PAD_FRAC;
      const padXFrac =
        Number(options.textPadXFrac) > 0
          ? Number(options.textPadXFrac)
          : Number(options.textPadFrac) > 0
            ? Number(options.textPadFrac)
            : TEXT_PAD_X_FRAC;
      if (!quiltRect?.width) {
        return { lines: [], fontPx: 0, textRect: null, lineHeightEm: 0 };
      }
      const padX = Math.max(4, Math.round(quiltRect.width * padXFrac));
      const padY = Math.max(4, Math.round(quiltRect.height * padFrac));
      const textRect = {
        x: Math.round(quiltRect.x + padX),
        y: Math.round(quiltRect.y + padY),
        width: Math.round(quiltRect.width - padX * 2),
        height: Math.round(quiltRect.height - padY * 2)
      };
      const lines = Array.isArray(options.lines) && options.lines.length
        ? options.lines
        : resolveQuoteLines(quoteText, ctx, textRect);
      if (!lines.length) {
        return { lines: [], fontPx: 0, textRect, lineHeightEm: 0 };
      }
      const alignTop = options.align === 'top';
      const lineHeightEmPreferred =
        Number(options.lineHeightEmPreferred) > 0
          ? Number(options.lineHeightEmPreferred)
          : alignTop
            ? STORY_LINE_HEIGHT_EM_PREFERRED
            : null;
      let fontPx =
        Number(options.fontPx) > 0
          ? Math.round(Number(options.fontPx))
          : maxFontForLines(ctx, lines, textRect.width, textRect.height, {
              widthOnly: alignTop || options.widthOnly === true,
              fitHeight: options.fitHeight === true,
              lineHeightEmPreferred
            });
      if (Number(options.fontPx) > 0 && !linesFitWidth(ctx, lines, fontPx, textRect.width)) {
        fontPx = maxFontForLines(ctx, lines, textRect.width, textRect.height, {
          widthOnly: true,
          fitHeight: false,
          lineHeightEmPreferred
        });
      }
      const layout = resolveVariableLineLayout(lines, textRect, fontPx, {
        align: options.align,
        lineHeightEmMax: options.lineHeightEmMax,
        lineHeightEmPreferred
      });
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

      const blockH = measureTopAlignedQuoteBlockHeight(
        lines.length,
        fontPx,
        layout.lineHeightEm
      );
      return {
        lines,
        fontPx,
        textRect,
        lineHeightEm: layout.lineHeightEm,
        lineStepPx: layout.step,
        blockHeightPx: blockH,
        vinylStickers: true,
        align: options.align || 'fill'
      };
    }

    async function composeCarouselSlide0QuoteFitFromQuiltBlob(quiltBlob, options = {}) {
      const dateKey = String(options.dateKey || 'our-daily').trim() || 'our-daily';
      const quoteText = String(options.quoteText || options.quote || '').trim();
      if (!quiltBlob || !quoteText) return null;

      const panelW =
        Number(options.panelWidth) > 0 ? Math.round(Number(options.panelWidth)) : PANEL_W;
      const panelH =
        Number(options.panelHeight) > 0 ? Math.round(Number(options.panelHeight)) : PANEL_H;
      const isStory = panelH >= panelW * 1.4;
      const paperToothSeed =
        String(options.paperToothSeed || '').trim() ||
        (isStory ? `${dateKey}:story-quote-fit` : `${dateKey}:carousel-slide-0`);
      const modeKey = isStory ? 'cutting-mat-story-quote-fit' : 'cutting-mat-slide0-quote-fit';

      const CQB = global.CarouselQuiltBg || globalThis.CarouselQuiltBg;
      const MatBg = global.CarouselCuttingMatBg || globalThis.CarouselCuttingMatBg;
      const PaperDepth = globalThis.IgCarouselPaperDepth;
      if (!CQB?.drawLayoutBCarouselQuiltBg) return null;

      const quiltImg = cropQuiltMatteLetterbox(await loadImageFromBlob(quiltBlob));
      const quiltCanvasRect = resolveCoverQuiltRect(CQB, quiltImg, panelW, panelH, options);
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
      canvas.width = panelW;
      canvas.height = panelH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      CQB.drawLayoutBCarouselQuiltBg(ctx, quiltImg, quiltCanvasRect, panelW, panelH, {
        greenCuttingMatUnderQuilt: true,
        quiltMatPeekPx: matPeekPx,
        cuttingMatImg,
        paperTextureImg,
        paperToothSeed,
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
        width: panelW - peek * 2,
        height: panelH - peek * 2
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
        textPadXFrac: options.textPadXFrac,
        dateKey
      });

      const blob = await canvasToBlob(canvas, options);
      if (!blob) return null;

      return {
        blob,
        meta: {
          panelWidth: panelW,
          panelHeight: panelH,
          carouselQuiltBgMode: modeKey,
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

    /**
     * Story 9:16 alternate of slide 0:
     * top-aligned tight vinyl quote + slide-0b speaker cutout/name at bottom.
     */
    async function composeStoryQuoteFitFromQuiltBlob(quiltBlob, options = {}) {
      const dateKey = String(options.dateKey || 'our-daily').trim() || 'our-daily';
      const quoteText = String(options.quoteText || options.quote || '').trim();
      if (!quiltBlob || !quoteText) return null;

      const panelW =
        Number(options.panelWidth) > 0 ? Math.round(Number(options.panelWidth)) : STORY_PANEL_W;
      const panelH =
        Number(options.panelHeight) > 0
          ? Math.round(Number(options.panelHeight))
          : STORY_PANEL_H;

      const CQB = global.CarouselQuiltBg || globalThis.CarouselQuiltBg;
      const MatBg = global.CarouselCuttingMatBg || globalThis.CarouselCuttingMatBg;
      const PaperDepth = globalThis.IgCarouselPaperDepth;
      const SpeakerApi =
        global.IgCarouselSlide0bSpeakerNameCompose ||
        globalThis.IgCarouselSlide0bSpeakerNameCompose;
      if (!CQB?.drawLayoutBCarouselQuiltBg) return null;

      const speakerImageUrl = String(
        options.speakerImageUrl || options.imageUrl || ''
      ).trim();
      const speakerName = String(options.speakerName || options.name || '').trim();

      const [quiltImgRaw, speakerImg] = await Promise.all([
        loadImageFromBlob(quiltBlob),
        speakerImageUrl ? loadImageFromUrl(speakerImageUrl).catch(() => null) : Promise.resolve(null)
      ]);
      const quiltImg = cropQuiltMatteLetterbox(quiltImgRaw);
      const quiltCanvasRect = resolveCoverQuiltRect(CQB, quiltImg, panelW, panelH, options);
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
          const fontWait = Promise.allSettled([
            document.fonts.load(`bold 64px Helvetica`),
            document.fonts.load(`bold 64px "Helvetica Neue"`)
          ]);
          await Promise.race([
            fontWait,
            new Promise((resolve) => setTimeout(resolve, 1200))
          ]);
        }
      } catch (_) {
        /* optional */
      }

      const canvas = document.createElement('canvas');
      canvas.width = panelW;
      canvas.height = panelH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      CQB.drawLayoutBCarouselQuiltBg(ctx, quiltImg, quiltCanvasRect, panelW, panelH, {
        greenCuttingMatUnderQuilt: true,
        quiltMatPeekPx: matPeekPx,
        cuttingMatImg,
        paperTextureImg,
        paperToothSeed: `${dateKey}:story-quote-fit`,
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

      const peek = Math.max(0, Math.round(matPeekPx));
      const typeRect = {
        x: peek,
        y: peek,
        width: panelW - peek * 2,
        height: panelH - peek * 2
      };

      if (options.gradeQuilt !== false) {
        gradeQuiltFrameForType(ctx, typeRect, {
          shadowLift: options.quiltShadowLift,
          shadowPower: options.quiltShadowPower,
          warmAlpha: options.quiltWarmAlpha
        });
      }

      /** Reserve bottom for slide-0b speaker stack when available. */
      let speakerLayout = null;
      if (speakerImg && SpeakerApi?.resolveSpeakerRect) {
        const speakerFrameFrac =
          Number(options.speakerFrameFrac) > 0
            ? Number(options.speakerFrameFrac)
            : STORY_SPEAKER_FRAME_FRAC;
        const speakerTopFrac =
          Number(options.speakerTopFrac) >= 0
            ? Number(options.speakerTopFrac)
            : STORY_SPEAKER_TOP_FRAC;
        const speakerAlign = String(options.speakerAlign || STORY_SPEAKER_ALIGN).toLowerCase();
        const speakerNameGapPx =
          Number(options.speakerNameGapPx) > 0
            ? Number(options.speakerNameGapPx)
            : STORY_SPEAKER_NAME_GAP_PX;
        const previewRect = SpeakerApi.resolveSpeakerRect(speakerImg, {
          panelWidth: panelW,
          panelHeight: panelH,
          speakerFrameFrac,
          speakerTopFrac,
          speakerAlign
        });
        /** Bottom-anchor preview: sit cutout just above the name band. */
        const nameBottomFrac =
          Number(options.nameBottomFrac) > 0 ? Number(options.nameBottomFrac) : 0.94;
        const nameBottom = Math.round(panelH * nameBottomFrac);
        const nameBandH = Math.max(72, Math.round(Math.min(120, previewRect.width * 0.2)));
        const nameTop = Math.max(40, nameBottom - nameBandH);
        const paperPadGuess = Math.max(11, Math.round(previewRect.height * 0.0224));
        const rotateDeg =
          typeof SpeakerApi.resolveSpeakerRotateDeg === 'function'
            ? SpeakerApi.resolveSpeakerRotateDeg(dateKey, options)
            : 0;
        const rad = (Math.abs(rotateDeg) * Math.PI) / 180;
        const hw = previewRect.width / 2 + paperPadGuess;
        const hh = previewRect.height / 2 + paperPadGuess;
        const extentY = hw * Math.sin(rad) + hh * Math.cos(rad);
        const desiredBottom = nameTop - speakerNameGapPx;
        const cy = desiredBottom - extentY;
        const anchoredRect = {
          ...previewRect,
          y: Math.round(cy - previewRect.height / 2)
        };
        speakerLayout = {
          speakerFrameFrac,
          speakerTopFrac,
          speakerAlign,
          speakerNameGapPx,
          previewRect: anchoredRect
        };
      }

      const quoteGap =
        Number(options.quoteSpeakerGapPx) > 0
          ? Number(options.quoteSpeakerGapPx)
          : STORY_QUOTE_SPEAKER_GAP_PX;
      const idealTopPad =
        Number(options.quoteTopPadPx) >= 0
          ? Number(options.quoteTopPadPx)
          : STORY_QUOTE_TOP_PAD_PX;
      const minTopPad =
        Number(options.quoteTopPadMinPx) >= 0
          ? Number(options.quoteTopPadMinPx)
          : STORY_QUOTE_TOP_PAD_MIN_PX;
      const leadEm =
        Number(options.lineHeightEmPreferred) > 0
          ? Number(options.lineHeightEmPreferred)
          : STORY_LINE_HEIGHT_EM_PREFERRED;
      const padFrac =
        Number(options.textPadFrac) > 0 ? Number(options.textPadFrac) : TEXT_PAD_FRAC;
      const padXFrac =
        Number(options.textPadXFrac) > 0
          ? Number(options.textPadXFrac)
          : Number(options.textPadFrac) > 0
            ? Number(options.textPadFrac)
            : TEXT_PAD_X_FRAC;

      /** Avoid the rotated paper silhouette, not just the unrotated rect top. */
      let speakerAvoidY = typeRect.y + typeRect.height;
      if (speakerLayout?.previewRect) {
        const r = speakerLayout.previewRect;
        const paperPadGuess = Math.max(11, Math.round(r.height * 0.0224));
        const rotateDeg =
          typeof SpeakerApi?.resolveSpeakerRotateDeg === 'function'
            ? SpeakerApi.resolveSpeakerRotateDeg(dateKey, options)
            : 0;
        const rad = (Math.abs(rotateDeg) * Math.PI) / 180;
        const hw = r.width / 2 + paperPadGuess;
        const hh = r.height / 2 + paperPadGuess;
        const extentY = hw * Math.sin(rad) + hh * Math.cos(rad);
        const cy = r.y + r.height / 2;
        speakerAvoidY = Math.round(cy - extentY);
      }
      const quoteCeiling = speakerLayout
        ? Math.round(speakerAvoidY - quoteGap)
        : typeRect.y + Math.round(typeRect.height * 0.55);

      /** Probe lines/font at full column width (height only used for packing heuristics). */
      const probePadX = Math.max(4, Math.round(typeRect.width * padXFrac));
      const probeTextW = Math.max(8, typeRect.width - probePadX * 2);
      const probeTextRect = {
        x: typeRect.x + probePadX,
        y: typeRect.y,
        width: probeTextW,
        height: Math.max(120, quoteCeiling - typeRect.y)
      };
      const lines = resolveQuoteLines(quoteText, ctx, probeTextRect);
      let fontPx = lines.length
        ? maxFontForLines(ctx, lines, probeTextW, 9999, {
            widthOnly: true,
            fitHeight: false,
            lineHeightEmPreferred: leadEm
          })
        : 12;
      let quoteTopPad = Math.round(idealTopPad);
      let blockH = measureTopAlignedQuoteBlockHeight(lines.length, fontPx, leadEm);

      const textHeightForPad = (topPad) => {
        const quoteTop = typeRect.y + topPad;
        const frameH = Math.max(40, quoteCeiling - quoteTop);
        const padY = Math.max(4, Math.round(frameH * padFrac));
        return Math.max(8, frameH - padY * 2);
      };

      /** Lever 1: shrink top pad (down to min) before touching letter size. */
      while (quoteTopPad > minTopPad && blockH > textHeightForPad(quoteTopPad) + 0.5) {
        quoteTopPad -= 4;
      }
      quoteTopPad = Math.max(minTopPad, quoteTopPad);

      /** Lever 2: shrink letters only if still colliding with speaker. */
      let availH = textHeightForPad(quoteTopPad);
      if (lines.length && blockH > availH + 0.5) {
        fontPx = maxFontForLines(ctx, lines, probeTextW, availH, {
          widthOnly: true,
          fitHeight: true,
          lineHeightEmPreferred: leadEm
        });
        blockH = measureTopAlignedQuoteBlockHeight(lines.length, fontPx, leadEm);
      }

      const quoteTop = typeRect.y + Math.max(0, quoteTopPad);
      const quoteBottom = Math.max(quoteTop + 80, quoteCeiling);
      const quoteFrame = {
        x: typeRect.x,
        y: quoteTop,
        width: typeRect.width,
        height: Math.max(80, quoteBottom - quoteTop)
      };

      const drawn = drawQuoteFitInQuiltRect(ctx, quoteText, quoteFrame, {
        textPadFrac: options.textPadFrac,
        textPadXFrac: options.textPadXFrac ?? padXFrac,
        dateKey,
        align: 'top',
        lines,
        fontPx,
        lineHeightEmMax:
          Number(options.lineHeightEmMax) > 0
            ? Number(options.lineHeightEmMax)
            : STORY_LINE_HEIGHT_EM_MAX,
        lineHeightEmPreferred: leadEm
      });

      let speakerStack = null;
      if (speakerImg && speakerLayout && SpeakerApi?.drawSpeakerNameStack) {
        speakerStack = SpeakerApi.drawSpeakerNameStack(ctx, speakerImg, {
          dateKey,
          speakerName,
          speakerImageUrl,
          cutoutSourceUrl: options.cutoutSourceUrl || speakerImageUrl,
          washColor: options.washColor,
          isCutoutPng: options.isCutoutPng,
          paperMarginFrac: options.paperMarginFrac,
          paperEdgeColor: options.paperEdgeColor,
          styleAmount: options.styleAmount ?? options.speakerStyleAmount,
          speakerFrameFrac: speakerLayout.speakerFrameFrac,
          speakerTopFrac: speakerLayout.speakerTopFrac,
          speakerAlign: speakerLayout.speakerAlign,
          speakerNameGapPx: speakerLayout.speakerNameGapPx,
          nameBottomFrac: options.nameBottomFrac,
          anchorBottom: true,
          panelWidth: panelW,
          panelHeight: panelH
        });
      }

      const blob = await canvasToBlob(canvas, options);
      if (!blob) return null;

      return {
        blob,
        meta: {
          panelWidth: panelW,
          panelHeight: panelH,
          carouselQuiltBgMode: 'cutting-mat-story-quote-fit',
          quiltCanvasRect,
          typeRect,
          quoteFrame,
          quiltMatPeekPx: matPeekPx,
          fontPx: drawn.fontPx,
          lineHeightEm: drawn.lineHeightEm,
          lineStepPx: drawn.lineStepPx,
          lineCount: drawn.lines.length,
          lines: drawn.lines,
          vinylStickers: drawn.vinylStickers === true,
          quoteAlign: 'top',
          quoteTopPadPx: quoteTopPad,
          speakerAvoidY,
          blockHeightPx: drawn.blockHeightPx || blockH,
          quiltGrade: options.gradeQuilt !== false,
          speaker: speakerStack
            ? {
                speakerName: speakerStack.speakerName,
                speakerRect: speakerStack.speakerRect,
                nameRect: speakerStack.nameRect,
                speakerRotateDeg: speakerStack.speakerRotateDeg,
                paperMode: speakerStack.paperMode,
                paperMarginPx: speakerStack.paperMarginPx
              }
            : null,
          dateKey
        }
      };
    }

    return {
      PANEL_W,
      PANEL_H,
      STORY_PANEL_W,
      STORY_PANEL_H,
      MAT_PEEK_PX,
      FONT_STACK,
      resolveQuoteLines,
      drawQuoteFitInQuiltRect,
      composeCarouselSlide0QuoteFitFromQuiltBlob,
      composeStoryQuoteFitFromQuiltBlob
    };
  }
);
