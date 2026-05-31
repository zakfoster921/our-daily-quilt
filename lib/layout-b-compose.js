/**
 * Layout B / IG canvas compose bridge (Phase 8 — post C9).
 * Exposes tune, keyword emphasis, and compose helpers on globalThis.
 */
(function (root) {
  'use strict';

  const CONFIG = root.CONFIG;
  if (!CONFIG || typeof CONFIG !== 'object') {
    throw new Error('lib/app-config.js must load before lib/layout-b-compose.js');
  }

    const ODQ_CANVAS_SERIF_FONT = '\'Libre Baskerville\', Georgia, "Times New Roman", Times, serif';
    const ODQ_LAYOUT_B_AUTHOR_INVERT_BG = '#636363';
    const ODQ_LAYOUT_B_AUTHOR_INVERT_TEXT = '#f3eee4';
    /** Layout B speaker *post* (4:5): quote/author strip type vs story-sized plan scaled to post. */
    const ODQ_LAYOUT_B_SPEAKER_POST_STRIP_FONT_SCALE = 1.1;
    /** Layout B post (4:5): quote strips 10% smaller than the shared post-style baseline. Story unchanged. */
    const ODQ_LAYOUT_B_POST_STRIP_FONT_SCALE = 0.9;

    function odqLayoutBSpeakerActiveFromOverlay(speakerOverlay) {
      return !!(speakerOverlay && String(speakerOverlay.imageUrl || '').trim());
    }

    function odqLayoutBAuthorStripVariant(speakerActive, role) {
      return speakerActive && role === 'author' ? 'dark' : 'light';
    }

    let _odqCanvasFontsReadyPromise = null;
    async function ensureOdqCanvasFontsReady() {
      if (_odqCanvasFontsReadyPromise) return _odqCanvasFontsReadyPromise;
      _odqCanvasFontsReadyPromise = (async () => {
        try {
          if (typeof document === 'undefined' || !document.fonts) return;
          await Promise.allSettled([
            document.fonts.load('400 48px "Libre Baskerville"'),
            document.fonts.load('italic 400 48px "Libre Baskerville"'),
            document.fonts.load('700 48px "Libre Baskerville"'),
            document.fonts.load('800 48px "Libre Baskerville"'),
            document.fonts.ready
          ]);
        } catch (_) {
          /* Canvas exports can still fall back to the system serif stack. */
        }
      })();
      return _odqCanvasFontsReadyPromise;
    }

    /** Coarse pointer / low memory → use smaller tune-modal preview composes. */
    function odqPreferFastLayoutBPreview() {
      try {
        if (typeof window !== 'undefined' && window.matchMedia) {
          if (window.matchMedia('(pointer: coarse)').matches) return true;
        }
        const mem = typeof navigator !== 'undefined' ? Number(navigator.deviceMemory) : NaN;
        if (Number.isFinite(mem) && mem > 0 && mem <= 4) return true;
      } catch (_) {
        /* ignore */
      }
      return false;
    }

    function odqTuneModalPreviewScale() {
      return odqPreferFastLayoutBPreview() ? 0.42 : 0.55;
    }

    function odqPromiseWithTimeout(promise, ms, label) {
      const timeoutMs = Math.max(500, Number(ms) || 8000);
      let timer = 0;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label || 'Operation'} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      });
      return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
      });
    }

    function odqSpeakerImageUrlFromQuote(quote) {
      return String(
        quote?.speakerCutoutUrl ??
        quote?.speaker_cutout_url ??
        quote?.speakerCutoutUrlSnapshot ??
        quote?.speakerImageUrl ??
        quote?.speaker_image_url ??
        quote?.speakerImageUrlSnapshot ??
        ''
      ).trim();
    }

    /** Canvas-ready speaker URL for tune modal / exports (Storage path when Firestore snap is stale). */
    async function odqResolveSpeakerImageForTune(quote, archiveService) {
      const q = quote && typeof quote === 'object' ? quote : {};
      const arch = archiveService && typeof archiveService === 'object' ? archiveService : null;
      const portrait =
        (arch && typeof arch._layoutBSpeakerPortraitUrl === 'function'
          ? arch._layoutBSpeakerPortraitUrl(q)
          : '') ||
        String(
          q.speakerImageUrlSnapshot ??
            q.speaker_image_url_snapshot ??
            q.speakerImageUrl ??
            q.speaker_image_url ??
            ''
        ).trim();
      const fallbackName = String(q.speakerName ?? q.speaker_name ?? q.author ?? '')
        .replace(/^\s*[—-]\s*/, '')
        .trim();
      let cutout = '';
      if (arch && typeof arch.resolveLayoutBSpeakerCutoutUrl === 'function') {
        cutout = await arch.resolveLayoutBSpeakerCutoutUrl(q, fallbackName);
      } else {
        const snap = String(q.speakerCutoutUrlSnapshot ?? q.speaker_cutout_url_snapshot ?? '').trim();
        const legacy = odqSpeakerImageUrlFromQuote(q);
        cutout = /speaker-cutouts/i.test(legacy) ? legacy : snap || legacy;
      }
      const raw =
        cutout ||
        (portrait && !/speaker-cutouts(?:%2F|\/)/i.test(portrait) ? portrait : '');
      if (!raw) return '';
      if (arch && typeof arch._prepareSpeakerImageUrlForCanvas === 'function') {
        const prepared = await arch._prepareSpeakerImageUrlForCanvas(raw, {
          fallbackUrl: portrait && raw !== portrait ? portrait : ''
        });
        if (prepared) return prepared;
      }
      if (/^https:\/\/firebasestorage\.googleapis\.com/i.test(raw)) return raw;
      return raw;
    }

    function odqQuoteMayHaveSpeakerImage(quote, archiveService) {
      const q = quote && typeof quote === 'object' ? quote : {};
      const portrait =
        archiveService && typeof archiveService._layoutBSpeakerPortraitUrl === 'function'
          ? archiveService._layoutBSpeakerPortraitUrl(q)
          : '';
      if (portrait && !/speaker-cutouts(?:%2F|\/)/i.test(portrait)) return true;
      return !!odqSpeakerImageUrlFromQuote(q);
    }

    function getLayoutBStoryQuotePlan(ctx, options) {
      const {
        quoteText = '',
        quoteAuthor = '',
        layoutW,
        layoutH,
        dateKey,
        usePostQuoteLayout = true,
        avoidRects = [],
        stripBoundsRect = null,
        maxQuoteCanvasCoverage = null,
        keywordEmphasis = null,
        skipKeywordEmphasis = false,
        stripLayoutSeed = 0,
        /** Applied after layout shrink (e.g. speaker post +10%). */
        stripFontScale = 1
      } = options || {};
      const STORY_W = layoutW;
      const STORY_H = layoutH;
      const isPostLayout =
        (layoutW === 1080 && layoutH === 1350) ||
        Math.abs(layoutW / Math.max(1, layoutH) - 1080 / 1350) < 0.03;
      const STRIP_MAX_W = STORY_W - (isPostLayout ? 52 : 100);
      const PAPER_PAD_X = 26;
      const PAPER_PAD_Y = 15;
      const FONT_SERIF = ODQ_CANVAS_SERIF_FONT;
      const stripBounds = stripBoundsRect &&
        Number.isFinite(Number(stripBoundsRect.x)) &&
        Number.isFinite(Number(stripBoundsRect.y)) &&
        Number.isFinite(Number(stripBoundsRect.width)) &&
        Number.isFinite(Number(stripBoundsRect.height)) &&
        Number(stripBoundsRect.width) > 0 &&
        Number(stripBoundsRect.height) > 0
          ? {
              left: Number(stripBoundsRect.x),
              top: Number(stripBoundsRect.y),
              right: Number(stripBoundsRect.x) + Number(stripBoundsRect.width),
              bottom: Number(stripBoundsRect.y) + Number(stripBoundsRect.height)
            }
          : null;
      const rngDateKey = dateKey || new Date().toISOString().split('T')[0];
      const layoutVariant = odqNormalizeStripLayoutSeed(stripLayoutSeed);
      let rngSeed = odqMixStripLayoutSeedIntoRng(2166136261, rngDateKey, layoutVariant);
      const rnd = () => {
        rngSeed |= 0;
        rngSeed = (rngSeed + 0x6d2b79f5) | 0;
        let t = Math.imul(rngSeed ^ (rngSeed >>> 15), 1 | rngSeed);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const splitIntoPhraseSegments = (text) => {
        const t = String(text || '').replace(/\s+/g, ' ').trim();
        if (!t) return [];
        const out = [];
        const maxLen = 52;
        const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
        const phraseTarget = () => {
          const a = rnd();
          const b = rnd();
          if (a < 0.22) return Math.round(28 + b * 12);
          if (a < 0.45) return Math.round(40 + b * 14);
          if (a < 0.78) return Math.round(48 + b * 12);
          return Math.round(54 + b * 10);
        };
        const pushChunk = (s) => {
          let rest = s.trim();
          if (!rest) return;
          while (rest.length > maxLen) {
            const sliceHi = Math.max(30, Math.min(maxLen, phraseTarget()));
            let cut = rest.lastIndexOf(' ', sliceHi);
            if (cut < 14) {
              cut = rest.indexOf(' ', 14);
              if (cut === -1) cut = Math.min(sliceHi, rest.length - 1);
            }
            out.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trim();
          }
          if (rest) out.push(rest);
        };
        const splitFlat = (chunks, regex) =>
          chunks.flatMap((c) => {
            const bits = c.split(regex).map((x) => x.trim()).filter(Boolean);
            return bits.length > 1 ? bits : [c];
          });
        // Split like splitFlat, but reattach `delim` to each non-final piece so
        // punctuation (e.g. commas) stays glued to the preceding word and the
        // strip break happens after it.
        const splitFlatKeepLeftDelim = (chunks, regex, delim) =>
          chunks.flatMap((c) => {
            const bits = c.split(regex).map((x) => x.trim()).filter(Boolean);
            if (bits.length <= 1) return [c];
            return bits.map((b, i) => (i < bits.length - 1 ? `${b}${delim}` : b));
          });
        const tryConceptualSplit = (chunk, target) => {
          const len = chunk.length;
          if (len < 20) return null;
          const minI = Math.max(6, Math.floor(target * 0.2), Math.floor(len * 0.12));
          const maxI = Math.min(len - 6, Math.ceil(target * 1.45), Math.ceil(len * 0.9));
          if (minI >= maxI) return null;
          const patterns = [
            { re: /\s+(?:because|although|though|unless|until|whether|whenever|wherever)\s+/gi },
            { re: /\s+(?:when|where|while|before|after|since)\s+/gi },
            { re: /\s+(?:which|who|whom|whose)\s+/gi },
            { re: /\s+(?:and|but|or|nor|yet)\s+/gi }
          ];
          const candidates = [];
          for (const { re } of patterns) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(chunk)) !== null) {
              const idx = m.index;
              if (idx < minI || idx > maxI) continue;
              const left = chunk.slice(0, idx).trim();
              const right = chunk.slice(idx).trim();
              if (left.length < 6 || right.length < 6) continue;
              if (wordCount(left) < 2 || wordCount(right) < 2) continue;
              const dist = Math.abs(idx - target);
              const jitter = rnd() * 14;
              candidates.push({ idx, score: dist + jitter });
            }
          }
          if (!candidates.length) return null;
          candidates.sort((a, b) => a.score - b.score);
          const best = candidates[0].score;
          const pool = candidates.filter((c) => c.score <= best + 16 + rnd() * 10);
          const pick = pool[Math.floor(rnd() * pool.length)];
          return [chunk.slice(0, pick.idx).trim(), chunk.slice(pick.idx).trim()];
        };
        const sentences =
          t.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [t];
        for (const sentence of sentences) {
          let chunks = [sentence];
          chunks = splitFlat(chunks, /\s*;\s+/);
          chunks = splitFlat(chunks, /\s+[—–]\s+/);
          chunks = splitFlat(chunks, /:\s+/);
          // Every comma triggers a strip break; the comma stays glued to the
          // word it followed (e.g. "I came," / "I saw," / "I conquered.").
          chunks = splitFlatKeepLeftDelim(chunks, /,\s+/, ',');
          for (let chunk of chunks) {
            chunk = chunk.trim();
            if (!chunk) continue;
            while (chunk.length > maxLen) {
              const target = phraseTarget();
              const commaScanEnd = Math.min(chunk.length - 1, Math.max(24, target));
              let cut = -1;
              for (let i = commaScanEnd; i > 12; i--) {
                if (chunk[i] === ',') {
                  cut = i;
                  break;
                }
              }
              if (cut === -1) {
                for (let i = commaScanEnd; i > 12; i--) {
                  if (chunk[i] === ';') {
                    cut = i;
                    break;
                  }
                }
              }
              if (cut > 0) {
                // Keep the comma/semicolon glued to the preceding word so the
                // strip break happens after the punctuation, not at it.
                out.push(chunk.slice(0, cut + 1).trim());
                chunk = chunk.slice(cut + 1).trim();
                continue;
              }
              const conceptual = tryConceptualSplit(chunk, target);
              if (conceptual) {
                out.push(conceptual[0]);
                chunk = conceptual[1];
                continue;
              }
              break;
            }
            for (let guard = 0; guard < 10 && chunk.length >= 20; guard++) {
              if (wordCount(chunk) < 5) break;
              const conceptual = tryConceptualSplit(chunk, phraseTarget());
              if (!conceptual) break;
              const left = conceptual[0];
              const right = conceptual[1];
              if (left.length < 8 || right.length < 8) break;
              if (wordCount(left) < 2 || wordCount(right) < 2) break;
              out.push(left);
              chunk = right;
            }
            pushChunk(chunk);
          }
        }
        return out.length ? out : [t];
      };
      const wrapLines = (c, text, maxWidth) => {
        const breakLongWord = (word) => {
          const out = [];
          let piece = '';
          for (const ch of word) {
            const next = piece + ch;
            if (c.measureText(next).width <= maxWidth || piece === '') piece = next;
            else {
              out.push(piece);
              piece = ch;
            }
          }
          if (piece) out.push(piece);
          return out;
        };
        const words = String(text || '').split(/\s+/).filter(Boolean);
        const lines = [];
        let line = '';
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (c.measureText(test).width <= maxWidth) {
            line = test;
          }
          else {
            if (line) lines.push(line);
            if (c.measureText(word).width <= maxWidth) {
              line = word;
            } else {
              const chunks = breakLongWord(word);
              for (let cc = 0; cc < chunks.length - 1; cc++) lines.push(chunks[cc]);
              line = chunks[chunks.length - 1] || '';
            }
          }
        }
        if (line) lines.push(line);
        return lines;
      };
      const quoteWordCount = quoteText ? (String(quoteText).match(/\S+/g) || []).length : 0;
      const innerMaxW = STRIP_MAX_W - PAPER_PAD_X * 2;
      const layoutQuoteAuthorGap = usePostQuoteLayout
        ? (stripBounds ? 34 : 58)
        : 64;
      const stackVertPad = stripBounds ? 10 : (usePostQuoteLayout ? 19 : 14);
      let bodyPx = Math.round(38 * 1.25);
      if (usePostQuoteLayout) bodyPx += 10;
      if (isPostLayout) bodyPx = Math.round(bodyPx * ODQ_LAYOUT_B_POST_STRIP_FONT_SCALE);
      const quoteFontPx = () => bodyPx;
      const authorFontPx = () => bodyPx;
      const segmentQuoteForLayout = (text) => {
        const applyPoeticMicroSplit = (segments) => {
          const segs = (segments || []).slice();
          const allowPoeticSplit = quoteWordCount > 8 && quoteWordCount <= 18;
          if (!allowPoeticSplit) return segs;
          if (segs.length >= 3) return segs;
          if (quoteWordCount < 5) return segs;
          // Prefer splitting a compact final segment (e.g. "deepen the mystery.") before larger lead lines.
          let pickIdx = -1;
          for (let i = segs.length - 1; i >= 0; i--) {
            const words = String(segs[i] || '').trim().split(/\s+/).filter(Boolean);
            if (words.length >= 3 && words.length <= 6) {
              pickIdx = i;
              break;
            }
          }
          if (pickIdx < 0) {
            let bestWords = 0;
            for (let i = 0; i < segs.length; i++) {
              const words = String(segs[i] || '').trim().split(/\s+/).filter(Boolean);
              if (words.length > bestWords) {
                bestWords = words.length;
                pickIdx = i;
              }
            }
          }
          const bestWords = pickIdx >= 0
            ? String(segs[pickIdx] || '').trim().split(/\s+/).filter(Boolean).length
            : 0;
          if (pickIdx < 0 || bestWords < 3) return segs;
          const words = String(segs[pickIdx] || '').trim().split(/\s+/).filter(Boolean);
          let cutAt = -1;
          if (words.length === 3) cutAt = 2; // e.g. "deepen the | mystery."
          else if (words.length === 4) cutAt = 2;
          else if (words.length === 5) cutAt = 3;
          else if (words.length >= 6) cutAt = Math.max(2, Math.min(words.length - 2, Math.round(words.length * (0.52 + rnd() * 0.14))));
          if (cutAt <= 0 || cutAt >= words.length) return segs;
          const left = words.slice(0, cutAt).join(' ').trim();
          const right = words.slice(cutAt).join(' ').trim();
          if (!left || !right) return segs;
          segs.splice(pickIdx, 1, left, right);
          return segs;
        };
        const raw = String(text ?? '');
        const paragraphs = raw
          .split(/\r?\n/)
          .map((p) => p.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        if (!paragraphs.length) return [];
        const runOne = (normalized) => {
          if (!normalized) return [];
          return splitIntoPhraseSegments(normalized);
        };
        if (paragraphs.length === 1) return applyPoeticMicroSplit(runOne(paragraphs[0]));
        const out = [];
        for (const p of paragraphs) out.push(...runOne(p));
        return applyPoeticMicroSplit(out);
      };
      /** @type {{ lines: string[], font: string, lh: number, w: number, h: number, role: string, rowGroup?: number, rowSlot?: number, textRuns?: object[], isKeywordEmphasis?: boolean, keywordAngle?: number }[]} */
      let stripSpecs = [];
      const LBKE = globalThis.LayoutBKeywordEmphasis;
      const kwActive =
        !skipKeywordEmphasis &&
        keywordEmphasis &&
        Array.isArray(keywordEmphasis.keywords) &&
        keywordEmphasis.keywords.length > 0 &&
        LBKE;
      const kwKeywords = kwActive ? keywordEmphasis.keywords : [];
      const kwStyles = kwActive
        ? Array.isArray(keywordEmphasis.styles) && keywordEmphasis.styles.length
          ? keywordEmphasis.styles
          : ['bold']
        : [];
      const kwFlags = kwActive ? LBKE.emphasisFlagsFromStyles(kwStyles) : null;
      const kwOwnStrip = kwActive ? LBKE.keywordEmphasisNeedsOwnStrip(kwStyles) : false;
      const buildStripSpecs = () => {
        const specs = [];
        let nextRowPairGroup = 1;
        const measureStrip = (lines, font, lineLead, role, rowMeta = null) => {
          ctx.font = font;
          let tw = 0;
          for (const ln of lines) tw = Math.max(tw, ctx.measureText(ln).width);
          const fs = parseInt(/(\d+)px/.exec(font)[1], 10);
          const lh = fs * lineLead;
          const w = Math.min(STRIP_MAX_W, Math.ceil(tw + PAPER_PAD_X * 2 + 6));
          const h = Math.ceil(lines.length * lh + PAPER_PAD_Y * 2);
          const o = { lines, font, lh, w, h, role };
          if (rowMeta) Object.assign(o, rowMeta);
          specs.push(o);
        };
        const measureStripWithRuns = (textRuns, font, lineLead, role, rowMeta = null) => {
          const qPx = quoteFontPx();
          const tw = LBKE.measureTextRunsWidth(ctx, textRuns, qPx, FONT_SERIF, kwFlags || {});
          const fs = parseInt(/(\d+)px/.exec(font)[1], 10);
          const lh = fs * lineLead;
          const w = Math.min(STRIP_MAX_W, Math.ceil(tw + PAPER_PAD_X * 2 + 6));
          const h = Math.ceil(lh + PAPER_PAD_Y * 2);
          const displayLine = LBKE.runsToDisplayLine(textRuns);
          const o = {
            lines: [displayLine],
            textRuns,
            font,
            lh,
            w,
            h,
            role
          };
          if (rowMeta) Object.assign(o, rowMeta);
          if (!o.emphasisMeasureFlags && kwActive && kwFlags) o.emphasisMeasureFlags = kwFlags;
          specs.push(o);
        };
        const measureEmphasisStrip = (text, rank) => {
          const qPx = quoteFontPx();
          const flags = { ...kwFlags };
          const font = LBKE.layoutBFontForEmphasis(qPx, FONT_SERIF, flags);
          const display = LBKE.displayTextForRun
            ? LBKE.displayTextForRun(text, flags)
            : kwFlags.caps
              ? String(text).toUpperCase()
              : String(text);
          const angle = LBKE.layoutBKeywordAngle(rngDateKey, rank, kwFlags);
          const textRuns = [
            {
              text: display,
              bold: flags.bold,
              italic: flags.italic,
              underline: flags.underline,
              caps: flags.caps
            }
          ];
          measureStripWithRuns(textRuns, font, 1.38, 'quote', {
            isKeywordEmphasis: true,
            keywordAngle: angle,
            emphasisMeasureFlags: flags
          });
        };
        const tryPairQuoteLine = (ln, font, lineSalt) => {
          if (!ln) return null;
          const words = ln.trim().split(/\s+/).filter(Boolean);
          if (words.length < 3) return null;
          ctx.font = font;
          const fullW = ctx.measureText(ln).width;
          if (fullW < innerMaxW * 0.22 && words.length < 5) return null;
          const lim = innerMaxW;
          let best = null;
          for (let k = 1; k <= words.length - 1; k++) {
            const left = words.slice(0, k).join(' ');
            const right = words.slice(k).join(' ');
            const wL = ctx.measureText(left).width;
            const wR = ctx.measureText(right).width;
            if (wL > lim || wR > lim) continue;
            if (wL < 14 || wR < 14) continue;
            const imbalance = Math.abs(wL - wR);
            if (!best || imbalance < best.imbalance) best = { left, right, imbalance };
          }
          if (!best) return null;
          const dch = rngDateKey.charCodeAt(lineSalt % rngDateKey.length);
          const pick = (((lineSalt * 1103515245 + 12345) ^ dch * 31) >>> 0) % 100 < 48;
          return pick ? [best.left, best.right] : null;
        };
        const emphasisRunsForLine = (lineText, keywords) => {
          const ln = String(lineText || '');
          if (!ln.trim()) return null;
          let runs = LBKE.buildTextRunsForLine(ln, keywords, kwStyles);
          if (LBKE.lineHasEmphasisRuns(runs)) return runs;
          for (const kw of keywords) {
            const single = String(kw || '').trim();
            if (!single) continue;
            runs = LBKE.buildTextRunsForLine(ln, [single], kwStyles);
            if (LBKE.lineHasEmphasisRuns(runs)) return runs;
          }
          return null;
        };
        const emphasisRunsForInlinePartLine = (lineText) => {
          const ln = String(lineText || '').trim();
          if (!ln) return null;
          return emphasisRunsForLine(ln, [ln]);
        };
        const emitQuoteLine = (ln, bodyFont, lineSalt) => {
          if (kwActive && !kwOwnStrip) {
            const runs = emphasisRunsForLine(ln, kwKeywords);
            if (runs) {
              measureStripWithRuns(runs, bodyFont, 1.38, 'quote');
              return;
            }
          }
          const pair = tryPairQuoteLine(ln, bodyFont, lineSalt);
          if (pair) {
            const gid = nextRowPairGroup++;
            measureStrip([pair[0]], bodyFont, 1.38, 'quote', { rowGroup: gid, rowSlot: 0 });
            measureStrip([pair[1]], bodyFont, 1.38, 'quote', { rowGroup: gid, rowSlot: 1 });
            return;
          }
          measureStrip([ln], bodyFont, 1.38, 'quote');
        };
        const qPx = quoteFontPx();
        const bodyFont = `400 ${qPx}px ${FONT_SERIF}`;
        ctx.font = bodyFont;
        let quoteLineSalt = 0;
        const layoutKeywordPart = (part) => {
          if (part.kind === 'emphasis-strip') {
            measureEmphasisStrip(part.text, part.rank);
            return;
          }
          const chunkText = String(part.text || '');
          if (!chunkText.trim()) return;
          for (const seg of segmentQuoteForLayout(chunkText)) {
            const lines = wrapLines(ctx, seg, innerMaxW);
            for (const ln of lines) {
              if (part.kind === 'inline-emphasis') {
                const runs = emphasisRunsForInlinePartLine(ln);
                if (runs) {
                  measureStripWithRuns(runs, bodyFont, 1.38, 'quote');
                  continue;
                }
              }
              emitQuoteLine(ln, bodyFont, quoteLineSalt++);
            }
          }
        };
        if (kwActive) {
          // Match keywords on full quote text first — strip segmentation splits long Notion phrases.
          const fullParts = LBKE.expandSegmentForKeywordEmphasis(quoteText, kwKeywords, kwStyles);
          for (const part of fullParts) layoutKeywordPart(part);
        } else {
          for (const seg of segmentQuoteForLayout(quoteText)) {
            const lines = wrapLines(ctx, seg, innerMaxW);
            for (const ln of lines) emitQuoteLine(ln, bodyFont, quoteLineSalt++);
          }
        }
        if (quoteAuthor) {
          const aPx = authorFontPx();
          const authorFont = `italic 400 ${aPx}px ${FONT_SERIF}`;
          ctx.font = authorFont;
          const authorLines = wrapLines(ctx, quoteAuthor, innerMaxW);
          for (const ln of authorLines) measureStrip([ln], authorFont, 1.38, 'author');
        }
        return specs;
      };
      const stackContentSpan = (specs) => {
        let h = 0;
        let i = 0;
        while (i < specs.length) {
          const spec = specs[i];
          if (i > 0 && spec.role === 'author' && specs[i - 1].role === 'quote') h += layoutQuoteAuthorGap;
          if (
            spec.rowGroup != null &&
            spec.rowSlot === 0 &&
            specs[i + 1]?.rowGroup === spec.rowGroup &&
            specs[i + 1].rowSlot === 1
          ) {
            h += Math.max(spec.h, specs[i + 1].h) + stackVertPad;
            i += 2;
          } else {
            h += spec.h + stackVertPad;
            i += 1;
          }
        }
        return h;
      };
      const stripEdgeMargin = 40;
      const staggerStripCenterX = (spec) => {
        const roll = rnd();
        const minCx = spec.w / 2 + stripEdgeMargin;
        const maxCx = STORY_W - spec.w / 2 - stripEdgeMargin;
        let cx;
        if (roll < 0.34) cx = stripEdgeMargin + spec.w / 2 + rnd() * 95;
        else if (roll < 0.67) cx = STORY_W / 2 + (rnd() - 0.5) * (STORY_W * 0.3);
        else cx = STORY_W - stripEdgeMargin - spec.w / 2 - rnd() * 95;
        return Math.max(minCx, Math.min(maxCx, cx));
      };
      const authorStripCenterX = (spec) => {
        const minCx = STORY_W / 2 + spec.w / 2 + stripEdgeMargin;
        const maxCx = STORY_W - spec.w / 2 - stripEdgeMargin;
        if (minCx >= maxCx) {
          return Math.max(
            spec.w / 2 + stripEdgeMargin,
            Math.min(STORY_W - spec.w / 2 - stripEdgeMargin, STORY_W * 0.75)
          );
        }
        return minCx + rnd() * (maxCx - minCx);
      };
      const stripTopFrac = isPostLayout ? 0.04 : 0.12;
      const requestedMaxCoverage =
        Number.isFinite(Number(maxQuoteCanvasCoverage)) && Number(maxQuoteCanvasCoverage) > 0
          ? Math.max(0.2, Math.min(1, Number(maxQuoteCanvasCoverage)))
          : null;
      const stripBudget = stripBounds
        ? Math.max(120, stripBounds.bottom - stripBounds.top - 20)
        : Math.min(
            usePostQuoteLayout ? STORY_H * 0.97 : STORY_H - 32,
            requestedMaxCoverage ? STORY_H * requestedMaxCoverage : Infinity
          );
      const minBodyPx = stripBounds ? 18 : (usePostQuoteLayout ? 22 : 24);
      const shrinkIters = stripBounds ? 34 : (usePostQuoteLayout ? 24 : 18);
      for (let s = 0; s < shrinkIters; s++) {
        stripSpecs = buildStripSpecs();
        const stackH = stripBounds ? stackContentSpan(stripSpecs) : STORY_H * stripTopFrac + stackContentSpan(stripSpecs);
        if (stackH <= stripBudget || bodyPx <= minBodyPx) break;
        bodyPx -= 2;
      }
      const contentSpan = stackContentSpan(stripSpecs);
      const vPadTop = isPostLayout ? 20 : 28;
      const vPadBottom = isPostLayout ? 22 : 118;
      const maxCenteredSpan = STORY_H - vPadTop - vPadBottom;
      const centerJitter = (rnd() - 0.5) * (isPostLayout ? 72 : 96);
      let cursorY;
      if (stripBounds) {
        const boundedTop = stripBounds.top + 10;
        const boundedBottom = stripBounds.bottom - 10;
        const boundedAvail = Math.max(1, boundedBottom - boundedTop);
        cursorY = boundedTop + Math.max(0, (boundedAvail - contentSpan) / 2);
      } else if (contentSpan > maxCenteredSpan) cursorY = STORY_H * stripTopFrac;
      else {
        cursorY = (STORY_H - contentSpan) / 2 + centerJitter;
        cursorY = Math.max(vPadTop, Math.min(cursorY, STORY_H - contentSpan - vPadBottom));
      }
      const strips = [];
      for (let i = 0; i < stripSpecs.length; ) {
        if (i > 0 && stripSpecs[i].role === 'author' && stripSpecs[i - 1].role === 'quote') {
          cursorY += layoutQuoteAuthorGap;
        }
        const spec = stripSpecs[i];
        const gap = requestedMaxCoverage
          ? stackVertPad
          : (usePostQuoteLayout ? (15 + rnd() * 18) : (11 + rnd() * 12));
        if (
          spec.rowGroup != null &&
          spec.rowSlot === 0 &&
          stripSpecs[i + 1]?.rowGroup === spec.rowGroup &&
          stripSpecs[i + 1].rowSlot === 1
        ) {
          const a = spec;
          const b = stripSpecs[i + 1];
          const pairHGap = 8 + rnd() * 14;
          const totalWfix = a.w + pairHGap + b.w;
          const topOfRow = cursorY;
          const rowH = Math.max(a.h, b.h);
          const pseudo = { w: totalWfix, role: 'quote' };
          let rowCenterX = staggerStripCenterX(pseudo);
          const half = totalWfix / 2;
          const minC = stripEdgeMargin + half;
          const maxC = STORY_W - stripEdgeMargin - half;
          rowCenterX = Math.max(minC, Math.min(maxC, rowCenterX));
          const leftCx = rowCenterX - half + a.w / 2;
          const rightCx = rowCenterX - half + a.w + pairHGap + b.w / 2;
          strips.push({
            ...a,
            x: leftCx,
            y: topOfRow + a.h / 2,
            padX: PAPER_PAD_X,
            angle: (rnd() - 0.5) * 0.055,
            seed: `${a.role}_${i}`
          });
          strips.push({
            ...b,
            x: rightCx,
            y: topOfRow + b.h / 2,
            padX: PAPER_PAD_X,
            angle: (rnd() - 0.5) * 0.055,
            seed: `${b.role}_${i + 1}`
          });
          cursorY = topOfRow + rowH + gap;
          i += 2;
          continue;
        }
        let cx;
        if (spec.role === 'author') cx = authorStripCenterX(spec);
        else cx = staggerStripCenterX(spec);
        const cy = cursorY + spec.h / 2;
        cursorY += spec.h + gap;
        strips.push({
          ...spec,
          x: cx,
          y: cy,
          padX: PAPER_PAD_X,
          angle:
            spec.isKeywordEmphasis && Number.isFinite(Number(spec.keywordAngle))
              ? Number(spec.keywordAngle)
              : (rnd() - 0.5) * 0.055,
          seed: `${spec.role}_${i}`
        });
        i += 1;
      }
      const normalizedAvoidRects = (Array.isArray(avoidRects) ? avoidRects : [])
        .map((r) => ({
          x: Number(r?.x),
          y: Number(r?.y),
          width: Number(r?.width),
          height: Number(r?.height),
          pad: Number(r?.pad || 0),
          /** Relative penalty vs default (1). Higher = stronger avoidance (e.g. eyes vs cheek). */
          weight: Number.isFinite(Number(r?.weight)) && Number(r?.weight) > 0 ? Number(r.weight) : 1
        }))
        .filter((r) =>
          Number.isFinite(r.x) &&
          Number.isFinite(r.y) &&
          Number.isFinite(r.width) &&
          Number.isFinite(r.height) &&
          r.width > 0 &&
          r.height > 0
        );
      if (normalizedAvoidRects.length) {
        const expanded = normalizedAvoidRects.map((r) => ({
          left: r.x - r.pad,
          top: r.y - r.pad,
          right: r.x + r.width + r.pad,
          bottom: r.y + r.height + r.pad,
          weight: r.weight
        }));
        const stripRect = (spec, cx = spec.x, cy = spec.y) => ({
          left: cx - spec.w / 2 - 12,
          top: cy - spec.h / 2 - 12,
          right: cx + spec.w / 2 + 12,
          bottom: cy + spec.h / 2 + 12
        });
        const overlapArea = (a, b) => {
          const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          return w * h;
        };
        const placedRects = [];
        let readingFloorY = 8;
        const scoreCandidate = (spec, cx, cy) => {
          const r = stripRect(spec, cx, cy);
          let overlap = 0;
          for (const avoid of expanded) {
            overlap += overlapArea(r, avoid) * (Number(avoid.weight) > 0 ? Number(avoid.weight) : 1);
          }
          let stripOverlap = 0;
          for (const placed of placedRects) stripOverlap += overlapArea(r, placed);
          const orderPenalty = Math.max(0, readingFloorY - r.top);
          const edgePenalty =
            Math.max(0, (stripBounds?.left ?? stripEdgeMargin) - r.left) +
            Math.max(0, r.right - (stripBounds?.right ?? (STORY_W - stripEdgeMargin))) +
            Math.max(0, (stripBounds?.top ?? 8) - r.top) +
            Math.max(0, r.bottom - (stripBounds?.bottom ?? (STORY_H - 8)));
          return (
            overlap * 1000 +
            stripOverlap * 1200 +
            orderPenalty * 2000 +
            edgePenalty * 100 +
            Math.hypot(cx - spec.x, cy - spec.y)
          );
        };
        for (const spec of strips) {
          const candidates = [{ x: spec.x, y: spec.y }];
          for (const avoid of expanded) {
            const sideY = avoid.top + (avoid.bottom - avoid.top) / 2;
            candidates.push(
              { x: spec.x, y: avoid.top - spec.h / 2 - 18 },
              { x: spec.x, y: avoid.bottom + spec.h / 2 + 18 },
              { x: avoid.left - spec.w / 2 - 18, y: spec.y },
              { x: avoid.right + spec.w / 2 + 18, y: spec.y },
              { x: avoid.left - spec.w / 2 - 18, y: sideY },
              { x: avoid.right + spec.w / 2 + 18, y: sideY }
            );
          }
          const boundsLeft = stripBounds?.left ?? stripEdgeMargin;
          const boundsRight = stripBounds?.right ?? (STORY_W - stripEdgeMargin);
          const boundsTop = stripBounds?.top ?? 8;
          const boundsBottom = stripBounds?.bottom ?? (STORY_H - 8);
          const minX = boundsLeft + spec.w / 2;
          const maxX = boundsRight - spec.w / 2;
          const minY = Math.max(boundsTop + spec.h / 2, readingFloorY + spec.h / 2);
          const maxY = boundsBottom - spec.h / 2;
          const clamped = candidates.map((c) => ({
            x: minX <= maxX ? Math.max(minX, Math.min(maxX, c.x)) : Math.max(spec.w / 2, Math.min(STORY_W - spec.w / 2, (boundsLeft + boundsRight) / 2)),
            y: minY <= maxY ? Math.max(minY, Math.min(maxY, c.y)) : Math.max(spec.h / 2, Math.min(STORY_H - spec.h / 2, maxY))
          }));
          let best = clamped[0];
          let bestScore = scoreCandidate(spec, best.x, best.y);
          for (const c of clamped.slice(1)) {
            const score = scoreCandidate(spec, c.x, c.y);
            if (score < bestScore) {
              best = c;
              bestScore = score;
            }
          }
          spec.x = best.x;
          spec.y = best.y;
          const placedRect = stripRect(spec, spec.x, spec.y);
          placedRects.push(placedRect);
          readingFloorY = placedRect.bottom + 18;
        }
      }
      const stripFontScaleFactor = Math.max(1, Number(stripFontScale) || 1);
      if (stripFontScaleFactor > 1.0001 && strips.length) {
        const scaled = boostLayoutBStripPlanTypography(strips, stripFontScaleFactor, FONT_SERIF);
        return refitLayoutBStripPlanToText(scaled, ctx, STRIP_MAX_W, FONT_SERIF);
      }
      return strips;
    }

    // Back-compat alias while call sites migrate.
    const buildLayoutBQuoteStripPlan = getLayoutBStoryQuotePlan;

    /** Scale a 9:16 strip plan onto a 4:5 (or other) canvas so post + story share the same collage positions. */
    function scaleLayoutBStripPlan(plan, fromW, fromH, toW, toH, fontSerif) {
      const sx = toW / Math.max(1, fromW);
      const sy = toH / Math.max(1, fromH);
      const serif = fontSerif || ODQ_CANVAS_SERIF_FONT;
      return (Array.isArray(plan) ? plan : []).map((s) => {
        const fontStr = String(s.font || '');
        const fontPxMatch = /(\d+)px/.exec(fontStr);
        const basePx = fontPxMatch ? parseInt(fontPxMatch[1], 10) : 48;
        const scaledPx = Math.max(18, Math.round(basePx * sy));
        const scaledFont = fontStr.includes('px')
          ? fontStr.replace(/\d+px/, `${scaledPx}px`)
          : `400 ${scaledPx}px ${serif}`;
        return {
          ...s,
          x: Number(s.x || 0) * sx,
          y: Number(s.y || 0) * sy,
          w: Math.max(20, Math.round(Number(s.w || 20) * sy)),
          h: Math.max(20, Math.round(Number(s.h || 20) * sy)),
          lh: Math.max(1, Number(s.lh || 0) * sy),
          font: scaledFont
        };
      });
    }

    /** Bump strip typography/paper after story→post scale (post-only; does not move strip centers). */
    function boostLayoutBStripPlanTypography(plan, factor, fontSerif) {
      const f = Math.max(1, Number(factor) || 1);
      if (f <= 1.0001) return Array.isArray(plan) ? plan : [];
      const serif = fontSerif || ODQ_CANVAS_SERIF_FONT;
      return (Array.isArray(plan) ? plan : []).map((s) => {
        const fontStr = String(s.font || '');
        const fontPxMatch = /(\d+)px/.exec(fontStr);
        const basePx = fontPxMatch ? parseInt(fontPxMatch[1], 10) : 48;
        const boostedPx = Math.max(18, Math.round(basePx * f));
        const boostedFont = fontStr.includes('px')
          ? fontStr.replace(/\d+px/, `${boostedPx}px`)
          : `400 ${boostedPx}px ${serif}`;
        return {
          ...s,
          font: boostedFont,
          lh: Math.max(1, Number(s.lh || 0) * f),
          w: Math.max(20, Math.round(Number(s.w || 20) * f)),
          h: Math.max(20, Math.round(Number(s.h || 20) * f))
        };
      });
    }

    /** Re-measure strip paper WxH after scale so post strips hug scaled text (no story-width blank padding). */
    function refitLayoutBStripPlanToText(plan, ctx, stripMaxW, fontSerif) {
      const PAPER_PAD_X = 26;
      const PAPER_PAD_Y = 15;
      const maxW = Math.max(120, Number(stripMaxW) || 980);
      const serif = fontSerif || ODQ_CANVAS_SERIF_FONT;
      const LBKE = globalThis.LayoutBKeywordEmphasis;
      return (Array.isArray(plan) ? plan : []).map((s) => {
        ctx.font = String(s.font || '');
        let tw = 0;
        if (Array.isArray(s.textRuns) && s.textRuns.length && LBKE) {
          const qPx = parseInt(/(\d+)px/.exec(String(s.font || ''))?.[1] || '48', 10);
          tw = LBKE.measureTextRunsWidth(
            ctx,
            s.textRuns,
            qPx,
            serif,
            s.emphasisMeasureFlags || { scale: false }
          );
        } else {
          for (const ln of s.lines || []) {
            tw = Math.max(tw, ctx.measureText(String(ln || '')).width);
          }
        }
        const lh = Math.max(1, Number(s.lh || 0));
        const lineCount = Math.max(1, Array.isArray(s.lines) ? s.lines.length : 1);
        const w = Math.min(maxW, Math.ceil(tw + PAPER_PAD_X * 2 + 6));
        const h = Math.ceil(lineCount * lh + PAPER_PAD_Y * 2);
        return { ...s, w, h };
      });
    }

    const IG_QUILT_SCREEN_ASPECT = 9 / 16;

    function getAspectSafeCanvasRect(sourceW, sourceH, targetW, targetH, fit = 'contain') {
      const sw = Math.max(1, Number(sourceW) || 1);
      const sh = Math.max(1, Number(sourceH) || 1);
      const tw = Math.max(1, Number(targetW) || 1);
      const th = Math.max(1, Number(targetH) || 1);
      const scale = fit === 'cover'
        ? Math.max(tw / sw, th / sh)
        : Math.min(tw / sw, th / sh);
      const width = Math.round(sw * scale);
      const height = Math.round(sh * scale);
      return {
        x: Math.round((tw - width) / 2),
        y: Math.round((th - height) / 2),
        width,
        height
      };
    }

    /**
     * Story-only admin override for speaker cutout placement on Layout B 9:16.
     * Each preset locks the cutout to an absolute center (% of canvas) + a scale multiplier
     * vs `getSpeakerOverlayRect`'s base size. `AUTO` = no override.
     * Story only: 4:5 post and Zapier push do NOT read this table.
     */
    const ODQ_SPEAKER_PRESETS = {
      AUTO: null,
      SMALL_LEFT:   { scale: 1.00, cxPct: 0.22, cyPct: 0.50 },
      SMALL_RIGHT:  { scale: 1.00, cxPct: 0.78, cyPct: 0.50 },
      SMALL_TOP:    { scale: 1.00, cxPct: 0.50, cyPct: 0.22 },
      SMALL_BOTTOM: { scale: 1.00, cxPct: 0.50, cyPct: 0.78 },
      BIG_LEFT:     { scale: 1.80, cxPct: 0.10, cyPct: 0.50 },
      BIG_RIGHT:    { scale: 1.80, cxPct: 0.90, cyPct: 0.50 },
      BIG_TOP:      { scale: 1.80, cxPct: 0.50, cyPct: 0.25 },
      BIG_BOTTOM:   { scale: 1.80, cxPct: 0.50, cyPct: 0.75 },
      BIG_CENTER:   { scale: 1.80, cxPct: 0.50, cyPct: 0.50 },
      /** HUGE = image width is an explicit fraction of canvas width (aspect-preserved).
       *  2.25 = "125% LARGER than the screen" → image is 225% of screen width, so the face
       *  overflows all edges and gets aggressively cropped. */
      HUGE_LEFT:    { widthPct: 2.25, cxPct: 0.10, cyPct: 0.50 },
      HUGE_CENTER:  { widthPct: 2.25, cxPct: 0.50, cyPct: 0.50 },
      HUGE_RIGHT:   { widthPct: 2.25, cxPct: 0.90, cyPct: 0.50 }
    };

    /** @param {'story'|'post'} [aspect] */
    function odqNormalizeTuneAspect(aspect) {
      return String(aspect || '').trim().toLowerCase() === 'post' ? 'post' : 'story';
    }

    const ODQ_SPEAKER_TWEAK_KEY = (dateKey, aspect) =>
      `odq.speakerCutoutTweak.${String(dateKey || '').trim()}.${odqNormalizeTuneAspect(aspect)}`;

    /** Canvas fraction per nudge tap in the tune modal. */
    const ODQ_SPEAKER_NUDGE_STEP = 0.02;
    /** Degrees per rotate tap (clockwise positive). */
    const ODQ_SPEAKER_ROTATE_STEP_DEG = 3;

    function odqSpeakerCutoutNudgeFirestoreFields(aspect) {
      const a = odqNormalizeTuneAspect(aspect);
      return a === 'post'
        ? {
            cx: 'layoutBSpeakerCutoutNudgeCxPost',
            cy: 'layoutBSpeakerCutoutNudgeCyPost',
            rotate: 'layoutBSpeakerCutoutNudgeRotateDegPost'
          }
        : {
            cx: 'layoutBSpeakerCutoutNudgeCxStory',
            cy: 'layoutBSpeakerCutoutNudgeCyStory',
            rotate: 'layoutBSpeakerCutoutNudgeRotateDegStory'
          };
    }

    function odqNormalizeSpeakerRotateDeg(raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || Math.abs(n) < 0.05) return 0;
      return Math.round(Math.min(45, Math.max(-45, n)) * 10) / 10;
    }

    function odqNormalizeSpeakerNudgeComponent(raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || Math.abs(n) < 0.0005) return 0;
      return Math.round(n * 1000) / 1000;
    }

    function odqParseSpeakerCutoutTweakRaw(parsed) {
      if (!parsed || typeof parsed !== 'object') {
        return { preset: 'AUTO', nudgeCx: 0, nudgeCy: 0, nudgeRotateDeg: 0 };
      }
      const name = String(parsed.preset || '').trim().toUpperCase();
      const preset = Object.prototype.hasOwnProperty.call(ODQ_SPEAKER_PRESETS, name) ? name : 'AUTO';
      return {
        preset,
        nudgeCx: odqNormalizeSpeakerNudgeComponent(parsed.nudgeCx),
        nudgeCy: odqNormalizeSpeakerNudgeComponent(parsed.nudgeCy),
        nudgeRotateDeg: odqNormalizeSpeakerRotateDeg(parsed.nudgeRotateDeg)
      };
    }

    function odqReadSpeakerCutoutTweakFromLocal(dateKey, aspect = 'story') {
      const a = odqNormalizeTuneAspect(aspect);
      const keys = [ODQ_SPEAKER_TWEAK_KEY(dateKey, a)];
      if (a === 'story') keys.push(`odq.speakerCutoutTweak.${String(dateKey || '').trim()}`);
      try {
        for (const storageKey of keys) {
          const raw = localStorage.getItem(storageKey);
          if (!raw) continue;
          return odqParseSpeakerCutoutTweakRaw(JSON.parse(raw));
        }
      } catch {
        /* ignore */
      }
      return { preset: 'AUTO', nudgeCx: 0, nudgeCy: 0, nudgeRotateDeg: 0 };
    }

    /** Returns the saved preset for dateKey + aspect ('story' | 'post'), or 'AUTO'. */
    function odqReadSpeakerCutoutPreset(dateKey, aspect = 'story') {
      return odqReadSpeakerCutoutTweakFromLocal(dateKey, aspect).preset;
    }

    /** Fractional offset added after preset cxPct/cyPct (device cache). */
    function odqReadSpeakerCutoutNudge(dateKey, aspect = 'story') {
      const t = odqReadSpeakerCutoutTweakFromLocal(dateKey, aspect);
      return { cx: t.nudgeCx, cy: t.nudgeCy };
    }

    async function odqReadSpeakerCutoutTweak(dateKey, aspect = 'story') {
      const key = String(dateKey || '').trim();
      const local = odqReadSpeakerCutoutTweakFromLocal(key, aspect);
      if (local.preset !== 'AUTO' || local.nudgeCx || local.nudgeCy || local.nudgeRotateDeg) return local;
      const a = odqNormalizeTuneAspect(aspect);
      if (!key || !window.db || !window.firestore) return local;
      try {
        const ref = window.firestore.doc(window.db, 'instagram-images', key);
        const snap = await window.firestore.getDoc(ref);
        if (!snap.exists()) return local;
        const data = snap.data() || {};
        const presetField = a === 'post' ? 'layoutBSpeakerCutoutPresetPost' : 'layoutBSpeakerCutoutPresetStory';
        const nudgeFields = odqSpeakerCutoutNudgeFirestoreFields(a);
        const name = String(data[presetField] || (a === 'story' ? data.speakerCutoutPreset : '') || '')
          .trim()
          .toUpperCase();
        const preset = Object.prototype.hasOwnProperty.call(ODQ_SPEAKER_PRESETS, name) ? name : 'AUTO';
        const remote = {
          preset,
          nudgeCx: odqNormalizeSpeakerNudgeComponent(data[nudgeFields.cx]),
          nudgeCy: odqNormalizeSpeakerNudgeComponent(data[nudgeFields.cy]),
          nudgeRotateDeg: odqNormalizeSpeakerRotateDeg(data[nudgeFields.rotate])
        };
        if (
          remote.preset !== 'AUTO' ||
          remote.nudgeCx ||
          remote.nudgeCy ||
          remote.nudgeRotateDeg
        ) {
          odqWriteSpeakerCutoutPreset(key, remote.preset, a, {
            cx: remote.nudgeCx,
            cy: remote.nudgeCy,
            rotateDeg: remote.nudgeRotateDeg
          });
        }
        return remote;
      } catch (err) {
        console.warn('odqReadSpeakerCutoutTweak Firestore read failed:', err);
        return local;
      }
    }

    /** Pull instagram-images/{dateKey} speaker tweak into localStorage (story + post). */
    async function odqPrefetchSpeakerCutoutTweak(dateKey) {
      const key = String(dateKey || '').trim();
      if (!key) return;
      await Promise.all(
        ['story', 'post'].map((aspect) =>
          odqReadSpeakerCutoutTweak(key, aspect).catch((err) => {
            console.warn(`odqPrefetchSpeakerCutoutTweak (${aspect}) failed:`, err);
            return null;
          })
        )
      );
      try {
        const app = typeof window !== 'undefined' ? window.app : null;
        if (app && typeof app.refreshLayoutBStoryPreview === 'function') {
          void app.refreshLayoutBStoryPreview();
        }
        if (app && typeof app.refreshQuoteSpeakerWidget === 'function') {
          void app.refreshQuoteSpeakerWidget();
        }
      } catch (_) {
        /* ignore */
      }
    }

    /** Writes (or clears, for 'AUTO') speaker cutout preset + optional nudge for dateKey + aspect. */
    function odqWriteSpeakerCutoutPreset(dateKey, presetName, aspect = 'story', nudge) {
      const name = String(presetName || '').trim().toUpperCase();
      const storageKey = ODQ_SPEAKER_TWEAK_KEY(dateKey, aspect);
      const legacyKey = `odq.speakerCutoutTweak.${String(dateKey || '').trim()}`;
      const nCx = odqNormalizeSpeakerNudgeComponent(nudge?.cx ?? nudge?.nudgeCx);
      const nCy = odqNormalizeSpeakerNudgeComponent(nudge?.cy ?? nudge?.nudgeCy);
      const nRot = odqNormalizeSpeakerRotateDeg(nudge?.rotateDeg ?? nudge?.nudgeRotateDeg);
      if (!name || name === 'AUTO' || !Object.prototype.hasOwnProperty.call(ODQ_SPEAKER_PRESETS, name)) {
        try {
          localStorage.removeItem(storageKey);
          if (odqNormalizeTuneAspect(aspect) === 'story') localStorage.removeItem(legacyKey);
        } catch (_) {
          /* ignore */
        }
        return;
      }
      const payload = { preset: name };
      if (nCx !== 0 || nCy !== 0) {
        payload.nudgeCx = nCx;
        payload.nudgeCy = nCy;
      }
      if (nRot !== 0) payload.nudgeRotateDeg = nRot;
      try {
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch (_) {
        /* ignore */
      }
    }

    /** Maps a preset name to the transform shape consumed by composeInstagramLayoutBFromQuiltBlob. */
    function odqSpeakerCutoutTransformForPreset(presetName) {
      const name = String(presetName || '').trim().toUpperCase();
      return ODQ_SPEAKER_PRESETS[name] || null;
    }

    /** Preset transform with optional position nudge (% of canvas) and rotate (degrees). */
    function odqSpeakerCutoutTransformResolved(presetName, nudge) {
      const base = odqSpeakerCutoutTransformForPreset(presetName);
      if (!base) return null;
      const dx = odqNormalizeSpeakerNudgeComponent(nudge?.cx ?? nudge?.nudgeCx);
      const dy = odqNormalizeSpeakerNudgeComponent(nudge?.cy ?? nudge?.nudgeCy);
      const rot = odqNormalizeSpeakerRotateDeg(nudge?.rotateDeg ?? nudge?.nudgeRotateDeg);
      if (!dx && !dy && !rot) return { ...base };
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      const out = { ...base };
      if (dx && Number.isFinite(+out.cxPct)) out.cxPct = clamp(out.cxPct + dx, 0.02, 0.98);
      if (dy && Number.isFinite(+out.cyPct)) out.cyPct = clamp(out.cyPct + dy, 0.02, 0.98);
      if (rot) out.rotateDeg = rot;
      return out;
    }

    function odqSpeakerCutoutTransformForDate(dateKey, aspect = 'story') {
      const t = odqReadSpeakerCutoutTweakFromLocal(dateKey, aspect);
      return odqSpeakerCutoutTransformResolved(t.preset, {
        cx: t.nudgeCx,
        cy: t.nudgeCy,
        rotateDeg: t.nudgeRotateDeg
      });
    }

    async function odqSpeakerCutoutTransformForDateAsync(dateKey, aspect = 'story') {
      const t = await odqReadSpeakerCutoutTweak(dateKey, aspect);
      return odqSpeakerCutoutTransformResolved(t.preset, {
        cx: t.nudgeCx,
        cy: t.nudgeCy,
        rotateDeg: t.nudgeRotateDeg
      });
    }

    const ODQ_KEYWORD_EMPHASIS_KEY = (dateKey, aspect) =>
      `odq.layoutBKeywordEmphasis.${String(dateKey || '').trim()}.${odqNormalizeTuneAspect(aspect)}`;
    const ODQ_STRIP_LAYOUT_SEED_KEY = (dateKey, aspect) =>
      `odq.layoutBStripLayoutSeed.${String(dateKey || '').trim()}.${odqNormalizeTuneAspect(aspect)}`;
    const ODQ_KEYWORD_EMPHASIS_LEGACY_KEY = (dateKey) => `odq.layoutBKeywordEmphasis.${String(dateKey || '').trim()}`;
    const ODQ_STRIP_LAYOUT_SEED_LEGACY_KEY = (dateKey) => `odq.layoutBStripLayoutSeed.${String(dateKey || '').trim()}`;
    const odqKeywordEmphasisMemoryCache = Object.create(null);
    const odqStripLayoutSeedMemoryCache = Object.create(null);

    /** Mix dateKey + optional admin-chosen strip layout variant into Layout B RNG. */
    function odqNormalizeStripLayoutSeed(raw) {
      const n = Number.parseInt(String(raw ?? ''), 10);
      if (!Number.isFinite(n) || n < 0) return 0;
      return Math.min(999999, n);
    }

    function odqMixStripLayoutSeedIntoRng(baseSeed, dateKey, stripLayoutSeed) {
      let rngSeed = baseSeed | 0;
      const dk = String(dateKey || '');
      for (let i = 0; i < dk.length; i++) {
        rngSeed = Math.imul(rngSeed ^ dk.charCodeAt(i), 16777619);
      }
      const variant = odqNormalizeStripLayoutSeed(stripLayoutSeed);
      if (variant > 0) {
        rngSeed = Math.imul(rngSeed ^ variant, 16777619);
        const vs = String(variant);
        for (let i = 0; i < vs.length; i++) {
          rngSeed = Math.imul(rngSeed ^ vs.charCodeAt(i), 16777619);
        }
      }
      return rngSeed;
    }

    function odqTuneAspectCacheId(dateKey, aspect) {
      return `${String(dateKey || '').trim()}:${odqNormalizeTuneAspect(aspect)}`;
    }

    function odqGetCachedLayoutBStripLayoutSeed(dateKey, aspect = 'story') {
      const cacheId = odqTuneAspectCacheId(dateKey, aspect);
      if (!cacheId || cacheId.startsWith(':')) return undefined;
      if (Object.prototype.hasOwnProperty.call(odqStripLayoutSeedMemoryCache, cacheId)) {
        return odqStripLayoutSeedMemoryCache[cacheId];
      }
      const keys = [ODQ_STRIP_LAYOUT_SEED_KEY(dateKey, aspect)];
      if (odqNormalizeTuneAspect(aspect) === 'story') keys.push(ODQ_STRIP_LAYOUT_SEED_LEGACY_KEY(dateKey));
      try {
        for (const storageKey of keys) {
          const raw = localStorage.getItem(storageKey);
          if (raw == null) continue;
          const n = odqNormalizeStripLayoutSeed(raw);
          odqStripLayoutSeedMemoryCache[cacheId] = n;
          return n;
        }
        return undefined;
      } catch {
        return undefined;
      }
    }

    function odqSetCachedLayoutBStripLayoutSeed(dateKey, seed, aspect = 'story') {
      const cacheId = odqTuneAspectCacheId(dateKey, aspect);
      if (!cacheId || cacheId.startsWith(':')) return;
      const n = odqNormalizeStripLayoutSeed(seed);
      odqStripLayoutSeedMemoryCache[cacheId] = n;
      try {
        const storageKey = ODQ_STRIP_LAYOUT_SEED_KEY(dateKey, aspect);
        if (n > 0) localStorage.setItem(storageKey, String(n));
        else localStorage.removeItem(storageKey);
      } catch (_) {
        /* ignore */
      }
    }

    async function odqReadLayoutBStripLayoutSeed(dateKey, aspect = 'story') {
      const key = String(dateKey || '').trim();
      if (!key) return 0;
      const a = odqNormalizeTuneAspect(aspect);
      const cacheId = odqTuneAspectCacheId(key, a);
      if (Object.prototype.hasOwnProperty.call(odqStripLayoutSeedMemoryCache, cacheId)) {
        return odqStripLayoutSeedMemoryCache[cacheId];
      }
      const firestoreField = a === 'post' ? 'layoutBStripLayoutSeedPost' : 'layoutBStripLayoutSeedStory';
      if (window.db && window.firestore) {
        try {
          const ref = window.firestore.doc(window.db, 'instagram-images', key);
          const snap = await window.firestore.getDoc(ref);
          if (snap.exists()) {
            const data = snap.data() || {};
            let n = odqNormalizeStripLayoutSeed(data[firestoreField]);
            if (!n && a === 'story' && data.layoutBStripLayoutSeed != null) {
              n = odqNormalizeStripLayoutSeed(data.layoutBStripLayoutSeed);
            }
            odqSetCachedLayoutBStripLayoutSeed(key, n, a);
            return n;
          }
        } catch (err) {
          console.warn('odqReadLayoutBStripLayoutSeed Firestore read failed:', err);
        }
      }
      return odqGetCachedLayoutBStripLayoutSeed(key, a) ?? 0;
    }

    /** Apply instagram-images Layout B tune fields into local cache; returns story-aspect tune for quote screen. */
    function odqApplyLayoutBTuneFieldsFromInstagramDoc(dateKey, data, aspect = 'story') {
      const key = String(dateKey || '').trim();
      if (!key || !data || typeof data !== 'object') {
        return { keywordEmphasis: null, stripLayoutSeed: 0 };
      }
      const a = odqNormalizeTuneAspect(aspect);
      const kwField = a === 'post' ? 'layoutBKeywordEmphasisPost' : 'layoutBKeywordEmphasisStory';
      const stripField = a === 'post' ? 'layoutBStripLayoutSeedPost' : 'layoutBStripLayoutSeedStory';
      let rawKw = data[kwField];
      if (!rawKw && a === 'story' && data.layoutBKeywordEmphasis) rawKw = data.layoutBKeywordEmphasis;
      const keywordEmphasis = odqEnsureKeywordEmphasisStyles(odqNormalizeKeywordEmphasisPayload(rawKw));
      odqSetCachedLayoutBKeywordEmphasis(key, keywordEmphasis, a);
      let stripLayoutSeed = odqNormalizeStripLayoutSeed(data[stripField]);
      if (!stripLayoutSeed && a === 'story' && data.layoutBStripLayoutSeed != null) {
        stripLayoutSeed = odqNormalizeStripLayoutSeed(data.layoutBStripLayoutSeed);
      }
      odqSetCachedLayoutBStripLayoutSeed(key, stripLayoutSeed, a);
      return { keywordEmphasis, stripLayoutSeed };
    }

    async function odqWriteLayoutBStripLayoutSeed(dateKey, seed, aspect = 'story') {
      const key = String(dateKey || '').trim();
      if (!key) throw new Error('dateKey required');
      const a = odqNormalizeTuneAspect(aspect);
      const n = odqNormalizeStripLayoutSeed(seed);
      odqSetCachedLayoutBStripLayoutSeed(key, n, a);
      if (!window.db || !window.firestore) throw new Error('Firestore not ready');
      const ref = window.firestore.doc(window.db, 'instagram-images', key);
      const field = a === 'post' ? 'layoutBStripLayoutSeedPost' : 'layoutBStripLayoutSeedStory';
      const deleteFieldFn = window.firestore.deleteField;
      if (n <= 0) {
        if (typeof deleteFieldFn === 'function') {
          const patch = { [field]: deleteFieldFn() };
          if (a === 'story') patch.layoutBStripLayoutSeed = deleteFieldFn();
          await window.firestore.setDoc(ref, patch, { merge: true });
        }
        return 0;
      }
      const patch = {
        [field]: n,
        [`${field}UpdatedAt`]: new Date().toISOString(),
        [`${field}UpdatedBy`]: 'admin-tune-modal'
      };
      if (a === 'story') {
        patch.layoutBStripLayoutSeed = n;
        patch.layoutBStripLayoutSeedUpdatedAt = patch[`${field}UpdatedAt`];
        patch.layoutBStripLayoutSeedUpdatedBy = 'admin-tune-modal';
      }
      await window.firestore.setDoc(ref, patch, { merge: true });
      return n;
    }

    async function odqWriteLayoutBSpeakerCutoutNudgeFirestore(dateKey, nudge, aspect = 'story') {
      const key = String(dateKey || '').trim();
      if (!key) throw new Error('dateKey required');
      if (!window.db || !window.firestore) throw new Error('Firestore not ready');
      const a = odqNormalizeTuneAspect(aspect);
      const nudgeFields = odqSpeakerCutoutNudgeFirestoreFields(a);
      const ref = window.firestore.doc(window.db, 'instagram-images', key);
      const deleteFieldFn = window.firestore.deleteField;
      const now = new Date().toISOString();
      const nCx = odqNormalizeSpeakerNudgeComponent(nudge?.cx ?? nudge?.nudgeCx);
      const nCy = odqNormalizeSpeakerNudgeComponent(nudge?.cy ?? nudge?.nudgeCy);
      if (nCx === 0 && nCy === 0) {
        if (typeof deleteFieldFn === 'function') {
          const patch = {
            [nudgeFields.cx]: deleteFieldFn(),
            [nudgeFields.cy]: deleteFieldFn(),
            layoutBTuneUpdatedAt: now
          };
          await window.firestore.setDoc(ref, patch, { merge: true });
        }
        return { cx: 0, cy: 0 };
      }
      const patch = {
        [nudgeFields.cx]: nCx,
        [nudgeFields.cy]: nCy,
        layoutBTuneUpdatedAt: now,
        layoutBTuneUpdatedBy: 'admin-tune-modal'
      };
      await window.firestore.setDoc(ref, patch, { merge: true });
      return { cx: nCx, cy: nCy };
    }

    async function odqWriteLayoutBSpeakerCutoutPresetFirestore(dateKey, presetName, aspect = 'story', nudge) {
      const key = String(dateKey || '').trim();
      if (!key) throw new Error('dateKey required');
      if (!window.db || !window.firestore) throw new Error('Firestore not ready');
      const a = odqNormalizeTuneAspect(aspect);
      const name = String(presetName || '').trim().toUpperCase();
      const field = a === 'post' ? 'layoutBSpeakerCutoutPresetPost' : 'layoutBSpeakerCutoutPresetStory';
      const ref = window.firestore.doc(window.db, 'instagram-images', key);
      const deleteFieldFn = window.firestore.deleteField;
      const now = new Date().toISOString();
      const nudgeFields = odqSpeakerCutoutNudgeFirestoreFields(a);
      if (!name || name === 'AUTO' || !Object.prototype.hasOwnProperty.call(ODQ_SPEAKER_PRESETS, name)) {
        if (typeof deleteFieldFn === 'function') {
          const patch = {
            [field]: deleteFieldFn(),
            [nudgeFields.cx]: deleteFieldFn(),
            [nudgeFields.cy]: deleteFieldFn(),
            [nudgeFields.rotate]: deleteFieldFn(),
            layoutBTuneUpdatedAt: now
          };
          if (a === 'story') patch.speakerCutoutPreset = deleteFieldFn();
          await window.firestore.setDoc(ref, patch, { merge: true });
        }
        return 'AUTO';
      }
      const patch = {
        [field]: name,
        [`${field}UpdatedAt`]: now,
        layoutBTuneUpdatedAt: now,
        layoutBTuneUpdatedBy: 'admin-tune-modal'
      };
      if (a === 'story') patch.speakerCutoutPreset = name;
      const nCx = odqNormalizeSpeakerNudgeComponent(nudge?.cx ?? nudge?.nudgeCx);
      const nCy = odqNormalizeSpeakerNudgeComponent(nudge?.cy ?? nudge?.nudgeCy);
      const nRot = odqNormalizeSpeakerRotateDeg(nudge?.rotateDeg ?? nudge?.nudgeRotateDeg);
      if (typeof deleteFieldFn === 'function') {
        if (nCx === 0 && nCy === 0) {
          patch[nudgeFields.cx] = deleteFieldFn();
          patch[nudgeFields.cy] = deleteFieldFn();
        } else {
          patch[nudgeFields.cx] = nCx;
          patch[nudgeFields.cy] = nCy;
        }
        if (nRot === 0) patch[nudgeFields.rotate] = deleteFieldFn();
        else patch[nudgeFields.rotate] = nRot;
      } else {
        patch[nudgeFields.cx] = nCx;
        patch[nudgeFields.cy] = nCy;
        patch[nudgeFields.rotate] = nRot;
      }
      await window.firestore.setDoc(ref, patch, { merge: true });
      return name;
    }

    async function odqReadInstagramImagesDocFromServer(dateKey) {
      const key = String(dateKey || '').trim();
      if (!key || !window.db || !window.firestore) throw new Error('Firestore not ready');
      const readDoc = window.firestore.getDocFromServer || window.firestore.getDoc;
      const ref = window.firestore.doc(window.db, 'instagram-images', key);
      const snap = await readDoc(ref);
      return snap.exists() ? snap.data() || {} : null;
    }

    async function odqReadInstagramImagesDocFromCache(dateKey) {
      const key = String(dateKey || '').trim();
      if (!key || !window.db || !window.firestore) throw new Error('Firestore not ready');
      const readDoc = window.firestore.getDoc;
      if (typeof readDoc !== 'function') throw new Error('Firestore getDoc unavailable');
      const ref = window.firestore.doc(window.db, 'instagram-images', key);
      const snap = await readDoc(ref);
      return snap.exists() ? snap.data() || {} : null;
    }

    /** Server read with timeout; on timeout/error falls back to local Firestore cache. */
    async function odqReadInstagramImagesDocWithFallback(dateKey, timeoutMs = 18000) {
      const hasServerRead = typeof window.firestore?.getDocFromServer === 'function';
      if (hasServerRead) {
        try {
          const data = await odqPromiseWithTimeout(
            odqReadInstagramImagesDocFromServer(dateKey),
            timeoutMs,
            'Read instagram-images from server'
          );
          return { data, source: 'server', serverError: null };
        } catch (err) {
          try {
            const cached = await odqReadInstagramImagesDocFromCache(dateKey);
            if (cached) {
              return {
                data: cached,
                source: 'cache',
                serverError: String(err?.message || err)
              };
            }
          } catch (_) {
            /* ignore cache failure */
          }
          throw err;
        }
      }
      const data = await odqReadInstagramImagesDocFromCache(dateKey);
      return { data, source: 'cache', serverError: null };
    }

    function odqKeywordsMatchOnServer(serverPayload, expectedKeywords) {
      const expected = Array.isArray(expectedKeywords) ? expectedKeywords : [];
      if (!expected.length) return true;
      const serverList = Array.isArray(serverPayload?.keywords) ? serverPayload.keywords : [];
      return JSON.stringify(serverList) === JSON.stringify(expected);
    }

    async function odqVerifyLayoutBTuneOnServer(dateKey, tuneDraftByAspect) {
      const data = await odqReadInstagramImagesDocFromServer(dateKey);
      if (!data) {
        return { ok: false, reason: 'doc-missing', dateKey, fields: [] };
      }
      const mismatches = [];
      const fields = [];
      for (const aspect of ['story', 'post']) {
        const d = tuneDraftByAspect[aspect] || {};
        const kwField = aspect === 'post' ? 'layoutBKeywordEmphasisPost' : 'layoutBKeywordEmphasisStory';
        const stripField = aspect === 'post' ? 'layoutBStripLayoutSeedPost' : 'layoutBStripLayoutSeedStory';
        const presetField = aspect === 'post' ? 'layoutBSpeakerCutoutPresetPost' : 'layoutBSpeakerCutoutPresetStory';
        const nudgeFields = odqSpeakerCutoutNudgeFirestoreFields(aspect);
        const serverKw = data[kwField] || (aspect === 'story' ? data.layoutBKeywordEmphasis : null);
        const serverStrip = odqNormalizeStripLayoutSeed(
          data[stripField] ?? (aspect === 'story' ? data.layoutBStripLayoutSeed : 0)
        );
        const serverPreset = String(
          data[presetField] || (aspect === 'story' ? data.speakerCutoutPreset : '') || 'AUTO'
        )
          .trim()
          .toUpperCase();
        const serverNudgeCx = odqNormalizeSpeakerNudgeComponent(data[nudgeFields.cx]);
        const serverNudgeCy = odqNormalizeSpeakerNudgeComponent(data[nudgeFields.cy]);
        const serverNudgeRot = odqNormalizeSpeakerRotateDeg(data[nudgeFields.rotate]);
        if (serverKw) fields.push(kwField);
        if (data[stripField] != null || (aspect === 'story' && data.layoutBStripLayoutSeed != null)) {
          fields.push(stripField);
        }
        if (serverPreset && serverPreset !== 'AUTO') fields.push(presetField);
        if (serverNudgeCx || serverNudgeCy) {
          fields.push(nudgeFields.cx, nudgeFields.cy);
        }
        if (serverNudgeRot) fields.push(nudgeFields.rotate);
        const expectedKw = d.keywordEmphasis?.keywords || [];
        if (expectedKw.length && !odqKeywordsMatchOnServer(serverKw, expectedKw)) {
          mismatches.push(`${aspect}-keywords`);
        }
        if (Number(serverStrip) !== Number(odqNormalizeStripLayoutSeed(d.stripLayoutSeed))) {
          mismatches.push(`${aspect}-strip`);
        }
        const expectedPreset = String(d.preset || 'AUTO').trim().toUpperCase();
        if (expectedPreset && expectedPreset !== 'AUTO' && serverPreset !== expectedPreset) {
          mismatches.push(`${aspect}-preset`);
        }
        const expectedNudgeCx = odqNormalizeSpeakerNudgeComponent(d.nudgeCx);
        const expectedNudgeCy = odqNormalizeSpeakerNudgeComponent(d.nudgeCy);
        const expectedNudgeRot = odqNormalizeSpeakerRotateDeg(d.nudgeRotateDeg);
        if (
          expectedNudgeCx !== serverNudgeCx ||
          expectedNudgeCy !== serverNudgeCy ||
          expectedNudgeRot !== serverNudgeRot
        ) {
          mismatches.push(`${aspect}-nudge`);
        }
      }
      return {
        ok: mismatches.length === 0,
        reason: mismatches.length ? mismatches.join(', ') : 'ok',
        dateKey,
        fields,
        layoutBTuneUpdatedAt: data.layoutBTuneUpdatedAt || null
      };
    }

    function odqNormalizeKeywordEmphasisPayload(raw) {
      const LBKE = globalThis.LayoutBKeywordEmphasis;
      if (LBKE && typeof LBKE.normalizeLayoutBKeywordEmphasisPayload === 'function') {
        const normalized = LBKE.normalizeLayoutBKeywordEmphasisPayload(raw);
        if (normalized && normalized.keywords?.length && !normalized.styles?.length) {
          normalized.styles = ['bold'];
        }
        return normalized;
      }
      if (!raw || typeof raw !== 'object') return null;
      const keywords = Array.isArray(raw.keywords)
        ? raw.keywords.map((k) => String(k).trim()).filter(Boolean)
        : [];
      const styles = Array.isArray(raw.styles)
        ? raw.styles.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
        : [];
      if (!keywords.length) return null;
      return { keywords: keywords.slice(0, 3), styles: styles.length ? styles : ['bold'] };
    }

    function odqEnsureKeywordEmphasisStyles(payload) {
      if (!payload || !Array.isArray(payload.keywords) || !payload.keywords.length) return payload;
      if (Array.isArray(payload.styles) && payload.styles.length) return payload;
      return { ...payload, styles: ['bold'] };
    }

    function odqGetCachedLayoutBKeywordEmphasis(dateKey, aspect = 'story') {
      const cacheId = odqTuneAspectCacheId(dateKey, aspect);
      if (!cacheId || cacheId.startsWith(':')) return null;
      if (odqKeywordEmphasisMemoryCache[cacheId]) {
        return odqEnsureKeywordEmphasisStyles(odqKeywordEmphasisMemoryCache[cacheId]);
      }
      const keys = [ODQ_KEYWORD_EMPHASIS_KEY(dateKey, aspect)];
      if (odqNormalizeTuneAspect(aspect) === 'story') keys.push(ODQ_KEYWORD_EMPHASIS_LEGACY_KEY(dateKey));
      try {
        for (const storageKey of keys) {
          const raw = localStorage.getItem(storageKey);
          if (!raw) continue;
          const parsed = odqEnsureKeywordEmphasisStyles(odqNormalizeKeywordEmphasisPayload(JSON.parse(raw)));
          if (parsed) {
            odqKeywordEmphasisMemoryCache[cacheId] = parsed;
            return parsed;
          }
        }
        return null;
      } catch {
        return null;
      }
    }

    function odqSetCachedLayoutBKeywordEmphasis(dateKey, payload, aspect = 'story') {
      const cacheId = odqTuneAspectCacheId(dateKey, aspect);
      if (!cacheId || cacheId.startsWith(':')) return;
      const normalized = payload ? odqNormalizeKeywordEmphasisPayload(payload) : null;
      if (normalized) {
        odqKeywordEmphasisMemoryCache[cacheId] = normalized;
        try {
          const json = JSON.stringify(normalized);
          localStorage.setItem(ODQ_KEYWORD_EMPHASIS_KEY(dateKey, aspect), json);
          if (odqNormalizeTuneAspect(aspect) === 'story') {
            localStorage.setItem(ODQ_KEYWORD_EMPHASIS_LEGACY_KEY(dateKey), json);
          }
        } catch (_) {
          /* file:// or private mode — memory cache still updated */
        }
      } else {
        delete odqKeywordEmphasisMemoryCache[cacheId];
        try {
          localStorage.removeItem(ODQ_KEYWORD_EMPHASIS_KEY(dateKey, aspect));
          if (odqNormalizeTuneAspect(aspect) === 'story') {
            localStorage.removeItem(ODQ_KEYWORD_EMPHASIS_LEGACY_KEY(dateKey));
          }
        } catch (_) {
          /* ignore */
        }
      }
    }

    function odqKeywordEmphasisFromQuoteObject(quote, dateKey) {
      if (!quote || typeof quote !== 'object') return null;
      const text = String(quote.text ?? quote.body ?? '').trim();
      if (!text) return null;
      const payload = globalThis.QuiltNewspaperClipping?.keywordPayloadForQuote?.(
        { ...quote, text, body: text },
        dateKey
      );
      if (!payload?.keywords?.length) return null;
      return odqEnsureKeywordEmphasisStyles(payload);
    }

    function odqMergeLayoutBQuoteKeywordsWithTuneStyles(quoteEmphasis, tuneEmphasis) {
      if (!quoteEmphasis?.keywords?.length) return tuneEmphasis || quoteEmphasis || null;
      if (!tuneEmphasis?.styles?.length) return quoteEmphasis;
      return odqEnsureKeywordEmphasisStyles({
        keywords: quoteEmphasis.keywords.slice(0, 3),
        styles: tuneEmphasis.styles.slice()
      });
    }

    async function odqResolveLayoutBQuoteKeywordEmphasis(dateKey, quoteHint = null) {
      const key = String(dateKey || '').trim();
      if (!key) return null;
      const candidates = [];
      if (quoteHint && typeof quoteHint === 'object') candidates.push(quoteHint);
      const qs = window.app?.quoteService;
      if (qs?._pinnedByDateKey?.[key]) candidates.push(qs._pinnedByDateKey[key]);
      if (typeof qs?.getQuoteResolvedForInstagramDateKey === 'function') {
        try {
          const resolved = await qs.getQuoteResolvedForInstagramDateKey(key);
          if (resolved) candidates.push(resolved);
        } catch (_) {
          /* optional */
        }
      }
      for (const candidate of candidates) {
        const fromObject = odqKeywordEmphasisFromQuoteObject(candidate, key);
        if (fromObject) return fromObject;
      }
      const fromFirestore = await odqKeywordEmphasisFromQuoteFirestore(key);
      return fromFirestore ? odqEnsureKeywordEmphasisStyles(fromFirestore) : null;
    }

    async function odqKeywordEmphasisFromQuoteFirestore(dateKey) {
      if (!window.db || !window.firestore) return null;
      const QKE = globalThis.QuoteKeywordEmphasis;
      const LBKE = globalThis.LayoutBKeywordEmphasis;
      const readDoc = window.firestore.getDocFromServer || window.firestore.getDoc;
      const buildFrom = (raw, text) => {
        const keywordRaw = String(raw || '').trim();
        const quoteText = String(text || '').trim();
        if (!keywordRaw || !quoteText) return null;
        const keywords = QKE?.parseEmphasisWordsInput
          ? QKE.parseEmphasisWordsInput(keywordRaw, quoteText)
          : keywordRaw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
        if (!keywords.length) return null;
        const styles =
          globalThis.QuiltNewspaperClipping?.clippingKeywordStylesForDateKey?.(dateKey) || ['bold'];
        const normalized = LBKE?.normalizeLayoutBKeywordEmphasisPayload
          ? LBKE.normalizeLayoutBKeywordEmphasisPayload({ keywords, styles })
          : { keywords: keywords.slice(0, 3), styles };
        if (!normalized) return { keywords: keywords.slice(0, 3), styles };
        if (!normalized.styles?.length) normalized.styles = styles;
        return normalized;
      };
      const tryDoc = (data, textOverride) => {
        if (!data || typeof data !== 'object') return null;
        const text = String(
          textOverride || data.text || data.quote || data.textSnapshot || ''
        ).trim();
        const raw = String(data.keyword ?? data.keywordSnapshot ?? '').trim();
        return buildFrom(raw, text);
      };
      let assignmentData = null;
      try {
        const assignRef = window.firestore.doc(window.db, 'dailyQuoteAssignments', dateKey);
        const assignSnap = await readDoc(assignRef);
        if (assignSnap.exists()) assignmentData = assignSnap.data() || {};
      } catch (_) {
        /* optional */
      }
      if (assignmentData) {
        const sid = String(assignmentData.sourceId || '').trim();
        if (sid && sid !== dateKey) {
          try {
            const srcRef = window.firestore.doc(window.db, 'quotes', sid);
            const srcSnap = await readDoc(srcRef);
            if (srcSnap.exists()) {
              const fromCatalog = tryDoc(srcSnap.data(), assignmentData.textSnapshot);
              if (fromCatalog) return fromCatalog;
            }
          } catch (_) {
            /* optional */
          }
        }
        const fromAssign = tryDoc(assignmentData);
        if (fromAssign) return fromAssign;
      }
      const collections = ['quotes', 'dailyQuoteAssignments'];
      for (const collectionName of collections) {
        try {
          const ref = window.firestore.doc(window.db, collectionName, dateKey);
          const snap = await readDoc(ref);
          if (!snap.exists()) continue;
          const built = tryDoc(snap.data());
          if (built) return built;
        } catch (_) {
          /* try next collection */
        }
      }
      return null;
    }

    async function odqReadLayoutBKeywordEmphasis(dateKey, aspect = 'story', quoteHint = null) {
      const key = String(dateKey || '').trim();
      if (!key) return null;
      const a = odqNormalizeTuneAspect(aspect);
      const ADMIN_TUNE = 'admin-tune-modal';
      const firestoreField = a === 'post' ? 'layoutBKeywordEmphasisPost' : 'layoutBKeywordEmphasisStory';

      const readInstagramEmphasis = async () => {
        if (!window.db || !window.firestore) return null;
        const ref = window.firestore.doc(window.db, 'instagram-images', key);
        const snap = await window.firestore.getDoc(ref);
        if (!snap.exists()) return null;
        const data = snap.data() || {};
        let raw = data[firestoreField];
        if (!raw && data.layoutBKeywordEmphasis) raw = data.layoutBKeywordEmphasis;
        if (!raw || typeof raw !== 'object') return null;
        return {
          raw,
          normalized: odqEnsureKeywordEmphasisStyles(odqNormalizeKeywordEmphasisPayload(raw))
        };
      };

      // Notion quote keywords are canonical (same as newspaper clipping).
      const fromQuote = await odqResolveLayoutBQuoteKeywordEmphasis(key, quoteHint);

      // Admin tune / legacy instagram docs may carry custom styles — never override Notion keywords.
      try {
        const fromInstagram = await readInstagramEmphasis();
        if (fromInstagram?.normalized) {
          const updatedBy = String(fromInstagram.raw?.updatedBy || '').trim();
          if (updatedBy === ADMIN_TUNE) {
            const merged = odqMergeLayoutBQuoteKeywordsWithTuneStyles(fromQuote, fromInstagram.normalized);
            if (merged) {
              odqSetCachedLayoutBKeywordEmphasis(key, merged, a);
              return merged;
            }
          }
        }
      } catch (err) {
        console.warn('odqReadLayoutBKeywordEmphasis Firestore read failed:', err);
      }

      if (fromQuote) {
        odqSetCachedLayoutBKeywordEmphasis(key, fromQuote, a);
        return fromQuote;
      }

      // No quote keyword field — fall back to mirrored instagram doc or cache.
      try {
        const fromInstagram = await readInstagramEmphasis();
        if (fromInstagram?.normalized) {
          odqSetCachedLayoutBKeywordEmphasis(key, fromInstagram.normalized, a);
          return fromInstagram.normalized;
        }
      } catch (_) {
        /* optional */
      }

      return odqGetCachedLayoutBKeywordEmphasis(key, a);
    }

    async function odqWriteLayoutBKeywordEmphasis(dateKey, payload, aspect = 'story') {
      const key = String(dateKey || '').trim();
      if (!key) throw new Error('dateKey required');
      const a = odqNormalizeTuneAspect(aspect);
      const normalized = odqEnsureKeywordEmphasisStyles(odqNormalizeKeywordEmphasisPayload(payload));
      odqSetCachedLayoutBKeywordEmphasis(key, normalized, a);
      if (!window.db || !window.firestore) throw new Error('Firestore not ready');
      const ref = window.firestore.doc(window.db, 'instagram-images', key);
      const field = a === 'post' ? 'layoutBKeywordEmphasisPost' : 'layoutBKeywordEmphasisStory';
      const deleteFieldFn = window.firestore.deleteField;
      if (!normalized) {
        if (typeof deleteFieldFn === 'function') {
          const patch = { [field]: deleteFieldFn() };
          if (a === 'story') patch.layoutBKeywordEmphasis = deleteFieldFn();
          await window.firestore.setDoc(ref, patch, { merge: true });
        }
        return null;
      }
      const emphasisDoc = {
        ...normalized,
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin-tune-modal'
      };
      const patch = { [field]: emphasisDoc };
      if (a === 'story') patch.layoutBKeywordEmphasis = emphasisDoc;
      await window.firestore.setDoc(ref, patch, { merge: true });
      return emphasisDoc;
    }

    function odqPrefetchLayoutBKeywordEmphasis(dateKey) {
      return odqReadLayoutBKeywordEmphasis(dateKey);
    }

    /**
     * Instagram layout B: full-bleed quilt, paper quote strips; story (9:16) adds a corner title strip.
     * @param {Blob} highResBlob
     * @param {string} quoteText
     * @param {string} quoteAuthor
     * @param {number} layoutW
     * @param {number} layoutH 1920 = story, 1350 = 4:5 post
     * @param {string} [dateKey]
     */
    async function composeInstagramLayoutBFromQuiltBlob(highResBlob, quoteText, quoteAuthor, layoutW, layoutH, dateKey, options = {}) {
      await ensureOdqCanvasFontsReady();
      const rngDateKey = dateKey || new Date().toISOString().split('T')[0];
      const isPostLayoutForTune =
        (layoutW === 1080 && layoutH === 1350) ||
        Math.abs(layoutW / Math.max(1, layoutH) - 1080 / 1350) < 0.03;
      const tuneAspect = odqNormalizeTuneAspect(options.tuneAspect || (isPostLayoutForTune ? 'post' : 'story'));
      let resolvedKeywordEmphasis = null;
      if (options.keywordEmphasisExplicit) {
        resolvedKeywordEmphasis = options.keywordEmphasis || null;
      } else if (options.keywordEmphasis) {
        resolvedKeywordEmphasis = options.keywordEmphasis;
      } else {
        try {
          resolvedKeywordEmphasis = await odqReadLayoutBKeywordEmphasis(rngDateKey, tuneAspect);
        } catch (_) {
          resolvedKeywordEmphasis = odqGetCachedLayoutBKeywordEmphasis(rngDateKey, tuneAspect);
        }
      }
      let resolvedStripLayoutSeed = 0;
      if (options.stripLayoutSeedExplicit) {
        resolvedStripLayoutSeed = odqNormalizeStripLayoutSeed(options.stripLayoutSeed);
      } else if (options.stripLayoutSeed != null) {
        resolvedStripLayoutSeed = odqNormalizeStripLayoutSeed(options.stripLayoutSeed);
      } else {
        try {
          resolvedStripLayoutSeed = await odqReadLayoutBStripLayoutSeed(rngDateKey, tuneAspect);
        } catch (_) {
          resolvedStripLayoutSeed = odqGetCachedLayoutBStripLayoutSeed(rngDateKey, tuneAspect) ?? 0;
        }
      }
      return new Promise((resolve, reject) => {
            const STORY_W = layoutW;
            const STORY_H = layoutH;
            /**4:5 feed export: no corner title, strips use more vertical space and width. */
            const isPostLayout =
              (layoutW === 1080 && layoutH === 1350) ||
              Math.abs(layoutW / Math.max(1, layoutH) - 1080 / 1350) < 0.03;
            const STRIP_MAX_W = STORY_W - (isPostLayout ? 52 : 100);
            /** Use post-style quote strip composition for both post and story. */
            const usePostQuoteLayout = true;
            const PAPER_PAD_X = 26;
            const PAPER_PAD_Y = 15;
            const PAPER_FILL = '#ebe8e3';
            const FONT_SERIF = ODQ_CANVAS_SERIF_FONT;
            const dedicationMessage = String(options?.dedicationMessage || '').trim().slice(0, 180);
            const focusBlockRect = options?.focusBlockRect || null;
            const focusSourceViewBox = options?.focusSourceViewBox || null;
            const speakerOverlay = options?.speakerOverlay && options.speakerOverlay.enabled !== false
              ? {
                  imageUrl: String(options.speakerOverlay.imageUrl || '').trim(),
                  name: String(options.speakerOverlay.name || '').trim(),
                  washColor: String(options.speakerOverlay.washColor || '#ea9b9a').trim(),
                  /** Admin preset override (story-only today): pass-through so the apply-transform block sees it. */
                  transform: options.speakerOverlay.transform || null
                }
              : null;

            let rngSeed = odqMixStripLayoutSeedIntoRng(2166136261, rngDateKey, resolvedStripLayoutSeed);
            const rnd = () => {
              rngSeed |= 0;
              rngSeed = (rngSeed + 0x6d2b79f5) | 0;
              let t = Math.imul(rngSeed ^ (rngSeed >>> 15), 1 | rngSeed);
              t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
              return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };

            const splitIntoPhraseSegments = (text) => {
              const t = text.replace(/\s+/g, ' ').trim();
              if (!t) return [];
              const out = [];
              const maxLen = 52;
              const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

              /** Biased toward mid-range but varies strip length (same seed → same breaks per day). */
              const phraseTarget = () => {
                const a = rnd();
                const b = rnd();
                if (a < 0.22) return Math.round(28 + b * 12);
                if (a < 0.45) return Math.round(40 + b * 14);
                if (a < 0.78) return Math.round(48 + b * 12);
                return Math.round(54 + b * 10);
              };

              const pushChunk = (s) => {
                let rest = s.trim();
                if (!rest) return;
                while (rest.length > maxLen) {
                  const sliceHi = Math.max(30, Math.min(maxLen, phraseTarget()));
                  let cut = rest.lastIndexOf(' ', sliceHi);
                  if (cut < 14) {
                    cut = rest.indexOf(' ', 14);
                    if (cut === -1) cut = Math.min(sliceHi, rest.length - 1);
                  }
                  out.push(rest.slice(0, cut).trim());
                  rest = rest.slice(cut).trim();
                }
                if (rest) out.push(rest);
              };

              const splitFlat = (chunks, regex) =>
                chunks.flatMap((c) => {
                  const bits = c.split(regex).map((x) => x.trim()).filter(Boolean);
                  return bits.length > 1 ? bits : [c];
                });

              /**
               * Clause-style breaks for “poetic” strips without punctuation.
               * Works on medium-length chunks too (not only when length > maxLen).
               */
              const tryConceptualSplit = (chunk, target) => {
                const len = chunk.length;
                if (len < 20) return null;
                const minI = Math.max(6, Math.floor(target * 0.2), Math.floor(len * 0.12));
                const maxI = Math.min(len - 6, Math.ceil(target * 1.45), Math.ceil(len * 0.9));
                if (minI >= maxI) return null;
                const patterns = [
                  { re: /\s+(?:because|although|though|unless|until|whether|whenever|wherever)\s+/gi, coord: false },
                  { re: /\s+(?:when|where|while|before|after|since)\s+/gi, coord: false },
                  { re: /\s+(?:which|who|whom|whose)\s+/gi, coord: false },
                  { re: /\s+(?:and|but|or|nor|yet)\s+/gi, coord: true },
                ];
                const candidates = [];
                for (const { re, coord } of patterns) {
                  re.lastIndex = 0;
                  let m;
                  while ((m = re.exec(chunk)) !== null) {
                    const idx = m.index;
                    if (idx < minI || idx > maxI) continue;
                    const left = chunk.slice(0, idx).trim();
                    const right = chunk.slice(idx).trim();
                    if (left.length < 6 || right.length < 6) continue;
                    if (wordCount(left) < 2 || wordCount(right) < 2) continue;
                    const dist = Math.abs(idx - target);
                    const jitter = rnd() * 14;
                    candidates.push({ idx, score: dist + jitter });
                  }
                }
                if (!candidates.length) return null;
                candidates.sort((a, b) => a.score - b.score);
                const best = candidates[0].score;
                const pool = candidates.filter((c) => c.score <= best + 16 + rnd() * 10);
                const pick = pool[Math.floor(rnd() * pool.length)];
                return [chunk.slice(0, pick.idx).trim(), chunk.slice(pick.idx).trim()];
              };

              /** Prefer end-of-sentence units, then lighter pauses inside each. */
              const sentences =
                t.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [t];

              for (const sentence of sentences) {
                let chunks = [sentence];
                chunks = splitFlat(chunks, /\s*;\s+/);
                chunks = splitFlat(chunks, /\s+[—–]\s+/);
                chunks = splitFlat(chunks, /:\s+/);
                chunks = splitFlat(
                  chunks,
                  /,\s+(?=(?:and|but|or|nor|yet|so|because|although|though|while|if|as|when|where|which|who|that)\b)/i
                );
                chunks = splitFlat(chunks, /,\s+(?:then|so|yet|still|instead)\s+/i);

                for (let chunk of chunks) {
                  chunk = chunk.trim();
                  if (!chunk) continue;
                  while (chunk.length > maxLen) {
                    const target = phraseTarget();
                    const commaScanEnd = Math.min(chunk.length - 1, Math.max(24, target));
                    let cut = -1;
                    for (let i = commaScanEnd; i > 12; i--) {
                      if (chunk[i] === ',') {
                        cut = i;
                        break;
                      }
                    }
                    if (cut === -1) {
                      for (let i = commaScanEnd; i > 12; i--) {
                        if (chunk[i] === ';') {
                          cut = i;
                          break;
                        }
                      }
                    }
                    if (cut > 0) {
                      out.push(chunk.slice(0, cut).trim());
                      chunk = chunk.slice(cut + 1).trim();
                      continue;
                    }
                    const conceptual = tryConceptualSplit(chunk, target);
                    if (conceptual) {
                      out.push(conceptual[0]);
                      chunk = conceptual[1];
                      continue;
                    }
                    break;
                  }
                  for (let guard = 0; guard < 10 && chunk.length >= 20; guard++) {
                    if (wordCount(chunk) < 5) break;
                    const conceptual = tryConceptualSplit(chunk, phraseTarget());
                    if (!conceptual) break;
                    const left = conceptual[0];
                    const right = conceptual[1];
                    if (left.length < 8 || right.length < 8) break;
                    if (wordCount(left) < 2 || wordCount(right) < 2) break;
                    out.push(left);
                    chunk = right;
                  }
                  pushChunk(chunk);
                }
              }

              return out.length ? out : [t];
            };

            const loadQuiltImage = () => new Promise((res, rej) => {
              const url = URL.createObjectURL(highResBlob);
              const im = new Image();
              im.onload = () => {
                URL.revokeObjectURL(url);
                res(im);
              };
              im.onerror = () => {
                URL.revokeObjectURL(url);
                rej(new Error('Failed to load quilt image for story composite'));
              };
              im.src = url;
            });

            const getSpeakerOverlayImageCandidates = (url) => {
              const safeUrl = String(url || '').trim();
              if (!safeUrl) return [];
              if (/^(?:data|blob):/i.test(safeUrl)) return [safeUrl];
              const baseUrl =
                typeof CONFIG !== 'undefined' && CONFIG.BACKEND && CONFIG.BACKEND.baseUrl
                  ? String(CONFIG.BACKEND.baseUrl).replace(/\/$/, '')
                  : '';
              /**
               * Firebase Storage download URLs do not reliably send Access-Control-Allow-Origin for
               * cross-origin <img crossOrigin="anonymous"> (required so canvas can read pixels for the
               * speaker silhouette). Opening the app from file:// (origin "null") makes that worse.
               * Same-origin /api/proxy-image returns ACAO: * — use it only for Storage so we never
               * fall through to a direct URL that always fails CORS for this code path.
               */
              let isFirebaseStorageHost = false;
              try {
                const u = new URL(safeUrl);
                isFirebaseStorageHost =
                  /(^|\.)firebasestorage\.googleapis\.com$/i.test(u.hostname) ||
                  /\.firebasestorage\.app$/i.test(u.hostname);
              } catch (_) {
                /* ignore */
              }
              if (isFirebaseStorageHost && baseUrl) {
                const proxied = `${baseUrl}/api/proxy-image?url=${encodeURIComponent(safeUrl)}`;
                return [proxied];
              }
              const out = [];
              if (/^https?:\/\//i.test(safeUrl) && baseUrl) {
                out.push(`${baseUrl}/api/proxy-image?url=${encodeURIComponent(safeUrl)}`);
              }
              out.push(safeUrl);
              return [...new Set(out)];
            };

            const loadSpeakerOverlayImage = (url) => new Promise((res) => {
              const safeUrl = String(url || '').trim();
              if (!safeUrl) return res(null);
              const im = new Image();
              im.crossOrigin = 'anonymous';
              im.referrerPolicy = 'no-referrer';
              im.onload = () => res(im);
              im.onerror = () => res(null);
              im.src = safeUrl;
            });

            const loadSpeakerOverlayImages = async (url) => {
              const loaded = [];
              for (const candidate of getSpeakerOverlayImageCandidates(url)) {
                const img = await loadSpeakerOverlayImage(candidate);
                if (img) loaded.push(img);
              }
              if (String(url || '').trim() && !loaded.length) {
                console.warn(
                  'Layout B speaker image load failed. If using Firebase Storage, deploy /api/proxy-image or serve a same-origin/data URL.',
                  { sourceUrl: String(url || '').trim(), candidates: getSpeakerOverlayImageCandidates(url) }
                );
              }
              return loaded;
            };

            const rgbToHsl = (r, g, b) => {
              r /= 255;
              g /= 255;
              b /= 255;
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              let h = 0;
              let s = 0;
              const l = (max + min) / 2;
              if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                  case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                  case g:
                    h = (b - r) / d + 2;
                    break;
                  default:
                    h = (r - g) / d + 4;
                    break;
                }
                h /= 6;
              }
              return { h, s, l };
            };

            const hslToRgb = (h, s, l) => {
              if (s === 0) {
                const v = Math.round(l * 255);
                return { r: v, g: v, b: v };
              }
              const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
              };
              const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
              const p = 2 * l - q;
              return {
                r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
                g: Math.round(hue2rgb(p, q, h) * 255),
                b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
              };
            };

            const softComplementaryStoryBackground = (quiltImg) => {
              try {
                const sample = document.createElement('canvas');
                const sw = 64;
                const sh = 64;
                sample.width = sw;
                sample.height = sh;
                const sctx = sample.getContext('2d', { willReadFrequently: true });
                if (!sctx) return '#f6f4f1';
                sctx.drawImage(quiltImg, 0, 0, sw, sh);
                const pixels = sctx.getImageData(0, 0, sw, sh).data;
                let rSum = 0;
                let gSum = 0;
                let bSum = 0;
                let n = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                  if (pixels[i + 3] < 64) continue;
                  const r = pixels[i];
                  const g = pixels[i + 1];
                  const b = pixels[i + 2];
                  const hsl = rgbToHsl(r, g, b);
                  // Ignore paper/background pixels so the day's actual quilt colors drive the complement.
                  if (hsl.s < 0.12 || hsl.l > 0.92) continue;
                  rSum += r;
                  gSum += g;
                  bSum += b;
                  n++;
                }
                if (!n) return '#f6f4f1';
                const avg = rgbToHsl(rSum / n, gSum / n, bSum / n);
                const comp = hslToRgb(
                  (avg.h + 0.5) % 1,
                  Math.max(0.26, Math.min(0.44, avg.s * 0.62)),
                  0.86
                );
                return `rgb(${comp.r}, ${comp.g}, ${comp.b})`;
              } catch (e) {
                return '#f6f4f1';
              }
            };

            const wrapLines = (c, text, maxWidth) => {
              const breakLongWord = (word) => {
                const out = [];
                let piece = '';
                for (const ch of word) {
                  const next = piece + ch;
                  if (c.measureText(next).width <= maxWidth || piece === '') piece = next;
                  else {
                    out.push(piece);
                    piece = ch;
                  }
                }
                if (piece) out.push(piece);
                return out;
              };
              const words = text.split(/\s+/).filter(Boolean);
              const lines = [];
              let line = '';
              for (const word of words) {
                const test = line ? `${line} ${word}` : word;
                if (c.measureText(test).width <= maxWidth) {
                  line = test;
                } else {
                  if (line) lines.push(line);
                  if (c.measureText(word).width <= maxWidth) {
                    line = word;
                  } else {
                    const chunks = breakLongWord(word);
                    for (let cc = 0; cc < chunks.length - 1; cc++) lines.push(chunks[cc]);
                    line = chunks[chunks.length - 1] || '';
                  }
                }
              }
              if (line) lines.push(line);
              return lines;
            };

            const makeStripPaperTextureTile = (variant) => {
              const sz = 96;
              const tc = document.createElement('canvas');
              tc.width = tc.height = sz;
              const tx = tc.getContext('2d');
              const img = tx.createImageData(sz, sz);
              const d = img.data;
              for (let i = 0; i < d.length; i += 4) {
                const grain = (rnd() - 0.5) * 68;
                const speck = rnd() < 0.102 ? (rnd() - 0.5) * 46 : 0;
                if (variant === 'dark') {
                  const v = Math.max(24, Math.min(112, 58 + grain * 0.95 + speck));
                  d[i] = v;
                  d[i + 1] = Math.max(22, Math.min(110, v - 3 + rnd() * 9));
                  d[i + 2] = Math.max(20, Math.min(108, v - 5 + rnd() * 9));
                } else {
                  /* Correlated luminance + warm split (R>G>B) so multiply/overlay never reads icy. */
                  const lum = 228 + grain * 0.98 + speck * 0.88;
                  d[i] = Math.max(160, Math.min(255, lum + 7));
                  d[i + 1] = Math.max(162, Math.min(255, lum + 2));
                  d[i + 2] = Math.max(148, Math.min(242, lum - 12));
                }
                d[i + 3] = 255;
              }
              tx.putImageData(img, 0, 0);
              tx.globalCompositeOperation = 'soft-light';
              for (let f = 0; f < 68; f++) {
                tx.globalAlpha = 0.14 + rnd() * 0.29;
                tx.strokeStyle = variant === 'dark' ? 'rgba(255,255,255,0.62)' : 'rgba(52,44,38,0.52)';
                tx.lineWidth = 0.5 + rnd() * 1.45;
                tx.beginPath();
                const y0 = rnd() * sz;
                tx.moveTo(-4, y0);
                tx.bezierCurveTo(
                  sz * 0.33,
                  y0 + (rnd() - 0.5) * 11,
                  sz * 0.66,
                  y0 + (rnd() - 0.5) * 11,
                  sz + 4,
                  y0 + (rnd() - 0.5) * 9
                );
                tx.stroke();
              }
              tx.globalCompositeOperation = 'overlay';
              for (let k = 0; k < 42; k++) {
                tx.globalAlpha = 0.065 + rnd() * 0.125;
                tx.fillStyle = variant === 'dark' ? 'rgba(0,0,0,0.92)' : 'rgba(72,58,48,0.72)';
                tx.beginPath();
                tx.arc(rnd() * sz, rnd() * sz, 0.5 + rnd() * 3.2, 0, Math.PI * 2);
                tx.fill();
              }
              for (let s = 0; s < 32; s++) {
                tx.globalAlpha = 0.082 + rnd() * 0.145;
                tx.strokeStyle = variant === 'dark' ? 'rgba(200,195,180,0.58)' : 'rgba(42,36,32,0.45)';
                tx.lineWidth = 0.22 + rnd() * 0.62;
                tx.beginPath();
                const x0 = rnd() * sz;
                const y0 = rnd() * sz;
                tx.moveTo(x0, y0);
                tx.lineTo(x0 + (rnd() - 0.5) * 14, y0 + (rnd() - 0.5) * 14);
                tx.stroke();
              }
              tx.globalAlpha = 1;
              tx.globalCompositeOperation = 'source-over';
              return tc;
            };

            const stripPaperTexLight = makeStripPaperTextureTile('light');
            const stripPaperTexDark = makeStripPaperTextureTile('dark');

            /**
             * Full-canvas magazine print finish: fiber/tooth, subtle halftone, micro-imperfections.
             * Runs once at the end so it applies to quilt + strips for both story (9:16) and post (4:5).
             */
            const applyLayoutBMagazinePrintFinish = (g, w, h) => {
              const fiberSz = 144;
              const fc = document.createElement('canvas');
              fc.width = fiberSz;
              fc.height = fiberSz;
              const fx = fc.getContext('2d');
              const fImg = fx.createImageData(fiberSz, fiberSz);
              const fd = fImg.data;
              for (let i = 0; i < fd.length; i += 4) {
                const grain = (rnd() - 0.5) * 26;
                const speck = rnd() < 0.11 ? (rnd() - 0.5) * 18 : 0;
                const lum = 232 + grain * 0.85 + speck * 0.75;
                fd[i] = Math.max(198, Math.min(255, lum + 6));
                fd[i + 1] = Math.max(196, Math.min(255, lum + 1));
                fd[i + 2] = Math.max(186, Math.min(250, lum - 10));
                fd[i + 3] = 255;
              }
              fx.putImageData(fImg, 0, 0);
              fx.globalCompositeOperation = 'soft-light';
              for (let f = 0; f < 52; f++) {
                fx.globalAlpha = 0.07 + rnd() * 0.11;
                fx.strokeStyle = 'rgba(48,40,34,0.42)';
                fx.lineWidth = 0.35 + rnd() * 0.95;
                fx.beginPath();
                const y0 = rnd() * fiberSz;
                fx.moveTo(-6, y0);
                fx.bezierCurveTo(
                  fiberSz * 0.35,
                  y0 + (rnd() - 0.5) * 10,
                  fiberSz * 0.65,
                  y0 + (rnd() - 0.5) * 10,
                  fiberSz + 6,
                  y0 + (rnd() - 0.5) * 8
                );
                fx.stroke();
              }
              fx.globalCompositeOperation = 'overlay';
              for (let k = 0; k < 28; k++) {
                fx.globalAlpha = 0.045 + rnd() * 0.09;
                fx.fillStyle = 'rgba(62,52,44,0.55)';
                fx.beginPath();
                fx.arc(rnd() * fiberSz, rnd() * fiberSz, 0.4 + rnd() * 2.8, 0, Math.PI * 2);
                fx.fill();
              }
              fx.globalAlpha = 1;
              fx.globalCompositeOperation = 'source-over';

              const halftoneSz = 40;
              const hc = document.createElement('canvas');
              hc.width = halftoneSz;
              hc.height = halftoneSz;
              const hx = hc.getContext('2d');
              const step = 4;
              const dotR = 0.52 + rnd() * 0.38;
              hx.fillStyle = 'rgba(28,24,20,0.38)';
              for (let y = 0; y < halftoneSz + step; y += step) {
                for (let x = 0; x < halftoneSz + step; x += step) {
                  const ox = (rnd() - 0.5) * 0.75;
                  const oy = (rnd() - 0.5) * 0.75;
                  hx.beginPath();
                  hx.arc(x + step * 0.5 + ox, y + step * 0.5 + oy, dotR, 0, Math.PI * 2);
                  hx.fill();
                }
              }

              g.save();
              const fiberPat = g.createPattern(fc, 'repeat');
              g.globalCompositeOperation = 'multiply';
              g.globalAlpha = 0.14;
              g.fillStyle = fiberPat;
              g.fillRect(0, 0, w, h);
              g.globalCompositeOperation = 'soft-light';
              g.globalAlpha = 0.2;
              g.fillStyle = fiberPat;
              g.fillRect(0, 0, w, h);
              g.globalCompositeOperation = 'multiply';
              g.globalAlpha = 0.18;
              const halfPat = g.createPattern(hc, 'repeat');
              g.fillStyle = halfPat;
              g.fillRect(0, 0, w, h);
              g.globalCompositeOperation = 'overlay';
              g.globalAlpha = 0.13;
              g.fillStyle = halfPat;
              g.fillRect(0, 0, w, h);
              g.globalCompositeOperation = 'soft-light';
              g.globalAlpha = 0.07;
              g.fillStyle = halfPat;
              g.fillRect(0, 0, w, h);
              g.globalCompositeOperation = 'source-over';
              g.globalAlpha = 1;

              for (let s = 0; s < 28 + Math.floor(rnd() * 16); s++) {
                g.strokeStyle = `rgba(34,30,26,${0.05 + rnd() * 0.09})`;
                g.lineWidth = 0.35 + rnd() * 0.55;
                g.beginPath();
                const x1 = rnd() * w;
                const y1 = rnd() * h;
                g.moveTo(x1, y1);
                g.lineTo(
                  x1 + (rnd() - 0.5) * w * 0.14,
                  y1 + (rnd() - 0.5) * h * 0.14
                );
                g.stroke();
              }
              for (let d = 0; d < 92; d++) {
                g.fillStyle =
                  rnd() < 0.5
                    ? `rgba(255,252,248,${0.045 + rnd() * 0.09})`
                    : `rgba(16,14,12,${0.02 + rnd() * 0.035})`;
                const px = 1 + rnd() * 3.2;
                g.fillRect(rnd() * w, rnd() * h, px, px);
              }
              g.restore();
            };

            /** Hand-cut silhouette: jittered corners + wobbly edges (strip space, centered). */
            const handCutStripPath = (ctx, sw, sh, rndFn) => {
              const hw = sw / 2;
              const hh = sh / 2;
              const m = Math.min(sw, sh);
              const maxSide = Math.max(sw, sh);
              const cornerAmp = Math.min(5.2, Math.max(1.2, m * 0.038));
              const edgeAmp = Math.min(3.6, Math.max(0.9, m * 0.028));
              const corners = [
                { x: -hw + (rndFn() - 0.5) * 2 * cornerAmp, y: -hh + (rndFn() - 0.5) * 2 * cornerAmp },
                { x: hw + (rndFn() - 0.5) * 2 * cornerAmp, y: -hh + (rndFn() - 0.5) * 2 * cornerAmp },
                { x: hw + (rndFn() - 0.5) * 2 * cornerAmp, y: hh + (rndFn() - 0.5) * 2 * cornerAmp },
                { x: -hw + (rndFn() - 0.5) * 2 * cornerAmp, y: hh + (rndFn() - 0.5) * 2 * cornerAmp }
              ];
              ctx.beginPath();
              ctx.moveTo(corners[0].x, corners[0].y);
              for (let i = 0; i < 4; i++) {
                const p0 = corners[i];
                const p1 = corners[(i + 1) % 4];
                const dx = p1.x - p0.x;
                const dy = p1.y - p0.y;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len;
                const ny = dx / len;
                /* Short sides (typical strip ends): one wobble only; long sides keep 1–3 mid-edge points. */
                const isShortEdge = len < maxSide * 0.58;
                const div = isShortEdge ? 2 : 2 + Math.floor(rndFn() * 3);
                for (let s = 1; s < div; s++) {
                  const t = s / div;
                  const wob = (rndFn() - 0.5) * 2 * edgeAmp;
                  ctx.lineTo(p0.x + dx * t + nx * wob, p0.y + dy * t + ny * wob);
                }
                ctx.lineTo(p1.x, p1.y);
              }
              ctx.closePath();
            };

            const drawPaperStrip = (g, cx, cy, w, h, angle, fillPaper, stripVariant = 'light') => {
              const tex = stripVariant === 'dark' ? stripPaperTexDark : stripPaperTexLight;
              const texPad = 16;
              g.save();
              g.translate(cx, cy);
              g.rotate(angle);
              g.fillStyle = fillPaper;
              if (stripVariant === 'dark') {
                g.shadowColor = 'rgba(0,0,0,0.22)';
                g.shadowBlur = 16;
                g.shadowOffsetX = 2;
                g.shadowOffsetY = 3;
              } else {
                g.shadowColor = 'rgba(0,0,0,0.12)';
                g.shadowBlur = 14;
                g.shadowOffsetX = 2;
                g.shadowOffsetY = 2;
              }
              handCutStripPath(g, w, h, rnd);
              g.fill();
              g.shadowColor = 'transparent';
              g.shadowBlur = 0;
              g.shadowOffsetX = 0;
              g.shadowOffsetY = 0;
              g.clip();
              const pat = g.createPattern(tex, 'repeat');
              g.globalAlpha = stripVariant === 'dark' ? 0.63 : 0.59;
              g.globalCompositeOperation = 'multiply';
              g.fillStyle = pat;
              g.fillRect(-w / 2 - texPad, -h / 2 - texPad, w + texPad * 2, h + texPad * 2);
              /* Light strips: soft-light avoids overlay’s cool/metallic cast on paper grain. */
              g.globalCompositeOperation = stripVariant === 'dark' ? 'overlay' : 'soft-light';
              g.globalAlpha = stripVariant === 'dark' ? 0.26 : 0.28;
              g.fillStyle = pat;
              g.fillRect(-w / 2 - texPad, -h / 2 - texPad, w + texPad * 2, h + texPad * 2);
              g.globalCompositeOperation = 'source-over';
              g.globalAlpha = 1;
              g.restore();
            };

            const drawDedicatedBlockRing = (g, rect) => {
              if (!rect || rect.width <= 0 || rect.height <= 0) return;
              const pad = Math.max(16, Math.min(44, Math.min(rect.width, rect.height) * 0.22));
              const cx = rect.x + rect.width / 2;
              const cy = rect.y + rect.height / 2;
              const w = rect.width + pad * 2;
              const h = rect.height + pad * 2;
              const drawLoop = (inflate, alpha, stroke, lineWidth) => {
                g.save();
                g.translate(cx, cy);
                g.rotate((rnd() - 0.5) * 0.09);
                g.strokeStyle = stroke;
                g.globalAlpha = alpha;
                g.lineWidth = lineWidth;
                g.lineCap = 'round';
                g.lineJoin = 'round';
                const hw = w / 2 + inflate;
                const hh = h / 2 + inflate;
                const wob = Math.max(3, Math.min(11, Math.min(w, h) * 0.035));
                g.beginPath();
                g.moveTo(-hw + rnd() * wob, -hh + (rnd() - 0.5) * wob);
                g.bezierCurveTo(-hw * 0.35, -hh - wob, hw * 0.35, -hh + wob, hw + (rnd() - 0.5) * wob, -hh + rnd() * wob);
                g.bezierCurveTo(hw + wob, -hh * 0.35, hw - wob, hh * 0.35, hw + (rnd() - 0.5) * wob, hh + (rnd() - 0.5) * wob);
                g.bezierCurveTo(hw * 0.35, hh + wob, -hw * 0.35, hh - wob, -hw + rnd() * wob, hh + (rnd() - 0.5) * wob);
                g.bezierCurveTo(-hw - wob, hh * 0.35, -hw + wob, -hh * 0.35, -hw + rnd() * wob, -hh + (rnd() - 0.5) * wob);
                g.closePath();
                g.stroke();
                g.restore();
              };
              drawLoop(5, 0.82, '#f8f1e8', Math.max(5, Math.min(12, Math.min(w, h) * 0.045)));
              drawLoop(0, 0.72, '#3a2f28', Math.max(2.2, Math.min(5, Math.min(w, h) * 0.018)));
            };

            const measureDedicationMessageBox = (g, message) => {
              if (!message || !isPostLayout) return null;
              const maxW = STORY_W - 140;
              let fontPx = 36;
              let lines = [];
              for (let attempt = 0; attempt < 10; attempt++) {
                g.font = `italic 400 ${fontPx}px ${FONT_SERIF}`;
                lines = wrapLines(g, message, maxW);
                if (lines.length <= 3 || fontPx <= 26) break;
                fontPx -= 2;
              }
              lines = lines.slice(0, 3);
              const lineH = fontPx * 1.34;
              const boxW = Math.min(maxW, Math.max(360, Math.ceil(Math.max(1, ...lines.map((ln) => {
                g.font = `italic 400 ${fontPx}px ${FONT_SERIF}`;
                return g.measureText(ln).width;
              })))));
              const boxH = Math.ceil(lines.length * lineH);
              return { x: (STORY_W - boxW) / 2, y: 0, width: boxW, height: boxH, lines, fontPx, lineH };
            };

            const drawDedicationMessageBox = (g, box) => {
              if (!box || !box.lines?.length) return;
              g.save();
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillStyle = '#504740';
              g.font = `italic 400 ${box.fontPx}px ${FONT_SERIF}`;
              let y = box.y + box.height / 2 - ((box.lines.length - 1) * box.lineH) / 2;
              for (const ln of box.lines) {
                g.fillText(ln, box.x + box.width / 2, y);
                y += box.lineH;
              }
              g.restore();
            };

            const parseSpeakerWashRgb = (hex) => {
              const fallback = '#ea9b9a';
              const safe = /^#[0-9A-Fa-f]{6}$/.test(String(hex || '').trim())
                ? String(hex).trim()
                : fallback;
              return {
                r: parseInt(safe.slice(1, 3), 16),
                g: parseInt(safe.slice(3, 5), 16),
                b: parseInt(safe.slice(5, 7), 16)
              };
            };

            const makeSpeakerSilhouetteCanvas = (img, outW, outH) => {
              const c = document.createElement('canvas');
              c.width = Math.max(1, Math.round(outW));
              c.height = Math.max(1, Math.round(outH));
              const g = c.getContext('2d', { willReadFrequently: true });
              if (!g) return null;
              const iw = Math.max(1, img.naturalWidth || img.width);
              const ih = Math.max(1, img.naturalHeight || img.height);
              const scale = c.width / iw;
              const dw = iw * scale;
              const dh = ih * scale;
              const dx = (c.width - dw) / 2;
              const dy = 0;
              g.imageSmoothingEnabled = true;
              g.imageSmoothingQuality = 'high';
              g.drawImage(img, dx, dy, dw, dh);
              const image = g.getImageData(0, 0, c.width, c.height);
              const d = image.data;
              /**
               * Match the in-app quote card's filter pipeline: grayscale(1) → contrast(1.48) → brightness(1.56).
               * Applied in normalized [0,1] space, then mapped back to bytes. Yields a bright, blown-out
               * xerox-paper look (mid-gray ~128 → ~200) instead of the previous formula that biased mids dark.
               */
              for (let i = 0; i < d.length; i += 4) {
                const alpha = d[i + 3];
                if (alpha < 8) {
                  d[i + 3] = 0;
                  continue;
                }
                const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
                const after = ((lum - 0.5) * 1.48 + 0.5) * 1.56;
                const v = Math.max(0, Math.min(255, Math.round(after * 255)));
                d[i] = v;
                d[i + 1] = v;
                d[i + 2] = v;
                d[i + 3] = Math.min(255, alpha * 0.98);
              }
              g.putImageData(image, 0, 0);
              return c;
            };

            const getSpeakerOverlayRect = (img, strips) => {
              if (!img) return null;
              const iw = Math.max(1, img.naturalWidth || img.width);
              const ih = Math.max(1, img.naturalHeight || img.height);
              const aspect = iw / ih;
              const canvasArea = STORY_W * STORY_H;
              /** Layout B + speaker: modest boost on both 9:16 and 4:5 so the portrait reads clearly beside strips. */
              const speakerLinearBoost = 1.25;
              const speakerAreaMult = speakerLinearBoost * speakerLinearBoost;
              const hardAreaMax = canvasArea * (isPostLayout ? 0.25 : 0.33) * speakerAreaMult;
              const targetArea = canvasArea * (isPostLayout ? 0.18 : 0.24) * speakerAreaMult;
              let w = Math.sqrt(targetArea * aspect);
              let h = w / aspect;
              const maxW = STORY_W * (isPostLayout ? 0.48 : 0.62) * speakerLinearBoost;
              const maxH = STORY_H * (isPostLayout ? 0.48 : 0.46) * speakerLinearBoost;
              const dimScale = Math.min(1, maxW / w, maxH / h);
              w *= dimScale;
              h *= dimScale;
              const areaScale = Math.min(1, Math.sqrt(hardAreaMax / Math.max(1, w * h)));
              w *= areaScale;
              h *= areaScale;
              const minPad = 28;
              const candidates = isPostLayout
                ? [
                    { x: STORY_W * 0.24, y: STORY_H * 0.24, pref: 34 },
                    { x: STORY_W * 0.76, y: STORY_H * 0.24, pref: 36 },
                    { x: STORY_W * 0.23, y: STORY_H * 0.72, pref: 12 },
                    { x: STORY_W * 0.77, y: STORY_H * 0.72, pref: 10 },
                    { x: STORY_W * 0.5, y: STORY_H * 0.78, pref: 28 },
                    { x: STORY_W * 0.5, y: STORY_H * 0.25, pref: 48 }
                  ]
                : [
                    { x: STORY_W * 0.25, y: STORY_H * 0.2, pref: 18 },
                    { x: STORY_W * 0.75, y: STORY_H * 0.2, pref: 18 },
                    { x: STORY_W * 0.24, y: STORY_H * 0.76, pref: 8 },
                    { x: STORY_W * 0.76, y: STORY_H * 0.76, pref: 8 },
                    { x: STORY_W * 0.5, y: STORY_H * 0.73, pref: 32 }
                  ];
              const stripPad = isPostLayout ? 18 : 26;
              /** Match drawPaperStrip: shadow blur/offset, texture pad, slight jitter, and strip rotation expand the painted AABB. */
              const stripShadowBleed = isPostLayout ? 24 : 30;
              const stripHandCutBleed = 16;
              const stripExtra = stripPad + stripShadowBleed + stripHandCutBleed;
              const stripRects = (Array.isArray(strips) ? strips : []).map((s) => {
                const cx = Number(s.x) || 0;
                const cy = Number(s.y) || 0;
                const sw = Math.max(1, Number(s.w) || 0);
                const sh = Math.max(1, Number(s.h) || 0);
                const ang = Number(s.angle) || 0;
                const ac = Math.abs(Math.cos(ang));
                const as = Math.abs(Math.sin(ang));
                const halfW = (sw / 2) * ac + (sh / 2) * as;
                const halfH = (sw / 2) * as + (sh / 2) * ac;
                return {
                  left: cx - halfW - stripExtra,
                  top: cy - halfH - stripExtra,
                  right: cx + halfW + stripExtra,
                  bottom: cy + halfH + stripExtra
                };
              });
              const overlapArea = (a, b) => {
                const ow = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
                const oh = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
                return ow * oh;
              };
              let best = null;
              let bestScore = Infinity;
              for (const candidate of candidates) {
                const x = Math.max(minPad + w / 2, Math.min(STORY_W - minPad - w / 2, candidate.x));
                const y = Math.max(minPad + h / 2, Math.min(STORY_H - minPad - h / 2, candidate.y));
                const rect = { left: x - w / 2, top: y - h / 2, right: x + w / 2, bottom: y + h / 2 };
                const overlap = stripRects.reduce((sum, stripRect) => sum + overlapArea(rect, stripRect), 0);
                const score = overlap * 4 + candidate.pref + Math.abs(x - STORY_W * 0.72) * 0.05;
                if (score < bestScore) {
                  bestScore = score;
                  best = { x: rect.left, y: rect.top, width: w, height: h, angle: (rnd() - 0.5) * 0.07 };
                }
              }
              /**
               * If the speaker box still hits inflated strip rects, push it down until clear.
               * Target line is slightly above the strict bottom (10% of portrait height) so the
               * cutout can sit a little into the strip band; quote strips still draw on top.
               */
              if (best) {
                /** Move the minimum amount to clear overlap; allow ~10% of portrait height into strip band (strips still paint on top). */
                const encroachPx = Math.max(1, Math.round(h * 0.1));
                const overflowAllowance = isPostLayout ? 0 : h;
                const absoluteMaxTop = STORY_H + overflowAllowance - h - (isPostLayout ? minPad : 0);
                let safety = 0;
                while (safety < 32) {
                  const r = { left: best.x, top: best.y, right: best.x + w, bottom: best.y + h };
                  let lowestStripBottom = -Infinity;
                  let totalOverlap = 0;
                  for (const s of stripRects) {
                    const ow = Math.max(0, Math.min(r.right, s.right) - Math.max(r.left, s.left));
                    const oh = Math.max(0, Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top));
                    if (ow > 0 && oh > 0) {
                      totalOverlap += ow * oh;
                      if (s.bottom > lowestStripBottom) lowestStripBottom = s.bottom;
                    }
                  }
                  if (totalOverlap <= 0) break;
                  const desiredTop = Math.min(absoluteMaxTop, lowestStripBottom - encroachPx);
                  if (desiredTop > best.y + 0.5) {
                    best.y = desiredTop;
                  } else {
                    break;
                  }
                  if (Math.abs(best.y - absoluteMaxTop) <= 0.5) break;
                  safety += 1;
                }
              }
              return best;
            };

            const drawSpeakerOverlay = (g, img, rect, washColor) => {
              if (!img || !rect || rect.width <= 0 || rect.height <= 0) return false;
              let portrait = null;
              try {
                portrait = makeSpeakerSilhouetteCanvas(img, rect.width, rect.height);
              } catch (_) {
                return false;
              }
              if (!portrait) return false;
              const wash = parseSpeakerWashRgb(washColor);

              /**
               * Cream "paper" silhouette layer — draws under the photo with a hard −2/+3 offset
               * at 0.72 alpha to match the in-app quote card's CSS:
               *   drop-shadow(-2px 3px 0 rgba(255, 250, 236, 0.72))
               * Built by stamping cream onto a copy of the portrait via source-in, so the alpha
               * channel matches the silhouette exactly (no blur).
               */
              const creamLayer = document.createElement('canvas');
              creamLayer.width = portrait.width;
              creamLayer.height = portrait.height;
              const cmx = creamLayer.getContext('2d');
              if (cmx) {
                cmx.drawImage(portrait, 0, 0);
                cmx.globalCompositeOperation = 'source-in';
                cmx.fillStyle = 'rgb(255, 250, 236)';
                cmx.fillRect(0, 0, creamLayer.width, creamLayer.height);
                cmx.globalCompositeOperation = 'source-over';
              }

              /**
               * Structured xerox grain — replaces the random 950-dot speckle with two patterns
               * masked by the silhouette:
               *   • Near-horizontal scan lines at 92° every 7px (1px dark) — the dominant
               *     "photocopier" tell from the in-app card's repeating-linear-gradient.
               *   • Concentric vinyl-record rings every 4px from a (13%, 21%) origin — matches
               *     the card's repeating-radial-gradient halftone halo.
               */
              const grain = document.createElement('canvas');
              grain.width = portrait.width;
              grain.height = portrait.height;
              const gx = grain.getContext('2d');
              if (gx) {
                const W = grain.width;
                const H = grain.height;
                const lineAngleRad = (92 * Math.PI) / 180;
                gx.save();
                gx.translate(W / 2, H / 2);
                gx.rotate(lineAngleRad);
                gx.strokeStyle = 'rgba(35, 27, 20, 0.55)';
                gx.lineWidth = 1;
                const diag = Math.ceil(Math.sqrt(W * W + H * H));
                for (let y = -diag; y <= diag; y += 7) {
                  gx.beginPath();
                  gx.moveTo(-diag, y + 0.5);
                  gx.lineTo(diag, y + 0.5);
                  gx.stroke();
                }
                gx.restore();
                const ringCx = W * 0.13;
                const ringCy = H * 0.21;
                const ringMaxR = Math.ceil(
                  Math.sqrt(
                    Math.max(ringCx, W - ringCx) ** 2 + Math.max(ringCy, H - ringCy) ** 2
                  )
                );
                gx.strokeStyle = 'rgba(35, 27, 20, 0.5)';
                gx.lineWidth = 0.55;
                for (let r = 4; r <= ringMaxR; r += 4) {
                  gx.beginPath();
                  gx.arc(ringCx, ringCy, r, 0, Math.PI * 2);
                  gx.stroke();
                }
                gx.globalCompositeOperation = 'destination-in';
                gx.drawImage(portrait, 0, 0);
              }

              const washLayer = document.createElement('canvas');
              washLayer.width = portrait.width;
              washLayer.height = portrait.height;
              const wx = washLayer.getContext('2d');
              if (wx) {
                const grad = wx.createRadialGradient(
                  washLayer.width * 0.28,
                  washLayer.height * 0.24,
                  washLayer.width * 0.04,
                  washLayer.width * 0.5,
                  washLayer.height * 0.5,
                  washLayer.width * 0.74
                );
                grad.addColorStop(0, `rgba(${wash.r}, ${wash.g}, ${wash.b}, 0.58)`);
                grad.addColorStop(0.52, `rgba(${wash.r}, ${wash.g}, ${wash.b}, 0.38)`);
                grad.addColorStop(1, 'rgba(255,244,218,0.12)');
                wx.fillStyle = grad;
                wx.fillRect(0, 0, washLayer.width, washLayer.height);
                wx.globalCompositeOperation = 'destination-in';
                wx.drawImage(portrait, 0, 0);
              }
              g.save();
              g.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
              g.rotate(rect.angle || 0);
              /** Hard cream paper offset (replaces the soft drop-shadow). */
              if (cmx) {
                g.globalCompositeOperation = 'source-over';
                g.globalAlpha = 0.72;
                g.drawImage(creamLayer, -rect.width / 2 - 2, -rect.height / 2 + 3, rect.width, rect.height);
              }
              g.globalCompositeOperation = 'multiply';
              g.globalAlpha = 0.95;
              g.drawImage(portrait, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
              if (wx) {
                g.globalCompositeOperation = 'source-over';
                g.globalAlpha = 0.62;
                g.drawImage(washLayer, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
              }
              if (gx) {
                g.globalCompositeOperation = 'multiply';
                g.globalAlpha = 0.2;
                g.drawImage(grain, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
              }
              g.globalAlpha = 1;
              g.globalCompositeOperation = 'source-over';
              g.restore();
              return true;
            };

            loadQuiltImage()
              .then(async (quiltImg) => {
                const segmentQuoteForLayout = (text) => {
                  const raw = String(text ?? '');
                  /** Keep explicit line breaks (e.g. in Firestore) as separate strip groups; do not collapse \n into spaces first. */
                  const paragraphs = raw
                    .split(/\r?\n/)
                    .map((p) => p.replace(/\s+/g, ' ').trim())
                    .filter(Boolean);
                  if (!paragraphs.length) return [];

                  const runOne = (normalized) => {
                    if (!normalized) return [];
                    return splitIntoPhraseSegments(normalized);
                  };

                  if (paragraphs.length === 1) return runOne(paragraphs[0]);
                  const out = [];
                  for (const p of paragraphs) out.push(...runOne(p));
                  return out;
                };

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = STORY_W;
                canvas.height = STORY_H;
                ctx.fillStyle = isPostLayout ? '#ffffff' : PAPER_FILL;
                ctx.fillRect(0, 0, STORY_W, STORY_H);

                const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
                const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                let focusCanvasRect = null;
                let quiltCanvasRect = null;
                const dedicationBox = measureDedicationMessageBox(ctx, dedicationMessage);
                /** Speaker layouts: zoom quilt slightly so cream paper silhouette does not peek at frame edges. */
                const layoutBQuiltBleed = odqLayoutBSpeakerActiveFromOverlay(speakerOverlay) ? 1.05 : 1;
                if (isPostLayout) {
                  let postScale;
                  let dx;
                  let dy;
                  let dw;
                  let dh;
                  if (dedicationBox) {
                    const marginX = 58;
                    const marginTop = 46;
                    const marginBottom = 46;
                    const messageGap = 34;
                    const maxQuiltW = STORY_W - marginX * 2;
                    const maxQuiltH = STORY_H - marginTop - marginBottom - messageGap - dedicationBox.height;
                    postScale = Math.min(maxQuiltW / iw, maxQuiltH / ih) * 0.985;
                    dw = Math.round(iw * postScale);
                    dh = Math.round(ih * postScale);
                    dx = Math.round((STORY_W - dw) / 2);
                    dy = Math.round(marginTop + Math.max(0, (maxQuiltH - dh) / 2));
                    dedicationBox.y = Math.round(dy + dh + messageGap);
                  } else if (options?.quiltFit === 'contain') {
                    const marginX = 58;
                    const marginY = 46;
                    const maxQuiltW = STORY_W - marginX * 2;
                    const maxQuiltH = STORY_H - marginY * 2;
                    postScale = Math.min(maxQuiltW / iw, maxQuiltH / ih);
                    dw = Math.round(iw * postScale);
                    dh = Math.round(ih * postScale);
                    dx = Math.round((STORY_W - dw) / 2);
                    dy = Math.round((STORY_H - dh) / 2);
                  } else if (options?.quiltFit === 'cover') {
                    const rect = getAspectSafeCanvasRect(iw, ih, STORY_W, STORY_H, 'cover');
                    dw = Math.round(rect.width * layoutBQuiltBleed);
                    dh = Math.round(rect.height * layoutBQuiltBleed);
                    dx = Math.round(rect.x - (dw - rect.width) / 2);
                    dy = Math.round(rect.y - (dh - rect.height) / 2);
                  } else {
                    postScale = Math.max(STORY_W / iw, STORY_H / ih) * 1.04;
                    dw = Math.round(iw * postScale);
                    dh = Math.round(ih * postScale);
                    dx = Math.round((STORY_W - dw) / 2);
                    dy = Math.round((STORY_H - dh) / 2);
                  }
                  ctx.drawImage(quiltImg, dx, dy, dw, dh);
                  quiltCanvasRect = { x: dx, y: dy, width: dw, height: dh };
                  if (
                    focusBlockRect &&
                    focusSourceViewBox &&
                    Number.isFinite(focusSourceViewBox.width) &&
                    Number.isFinite(focusSourceViewBox.height) &&
                    focusSourceViewBox.width > 0 &&
                    focusSourceViewBox.height > 0
                  ) {
                    const bx = (Number(focusBlockRect.x) - Number(focusSourceViewBox.x || 0)) / focusSourceViewBox.width;
                    const by = (Number(focusBlockRect.y) - Number(focusSourceViewBox.y || 0)) / focusSourceViewBox.height;
                    const bw = Number(focusBlockRect.width) / focusSourceViewBox.width;
                    const bh = Number(focusBlockRect.height) / focusSourceViewBox.height;
                    if ([bx, by, bw, bh].every(Number.isFinite)) {
                      focusCanvasRect = {
                        x: dx + bx * dw,
                        y: dy + by * dh,
                        width: bw * dw,
                        height: bh * dh
                      };
                    }
                  }
                } else {
                  // Story Layout B: one centered crop behind the quote strips.
                  // The share raster is the full quilt; zoom here so the story reads as a close crop.
                  const scale = Math.max(STORY_W / iw, STORY_H / ih) * 1.22 * layoutBQuiltBleed;
                  const cw = Math.round(iw * scale);
                  const ch = Math.round(ih * scale);
                  const qx = Math.round((STORY_W - cw) / 2);
                  const qy = Math.round((STORY_H - ch) / 2);
                  ctx.drawImage(quiltImg, qx, qy, cw, ch);
                }
                ctx.fillStyle = isPostLayout ? 'rgba(0,0,0,0.133)' : 'rgba(0,0,0,0.1)';
                ctx.fillRect(0, 0, STORY_W, STORY_H);

                const innerMaxW = STRIP_MAX_W - PAPER_PAD_X * 2;
                const layoutQuoteAuthorGap = usePostQuoteLayout ? 58 : 64;
                let bodyPx = Math.round(38 * 1.25);
                if (usePostQuoteLayout) {
                  bodyPx += 10;
                }
                const quoteFontPx = () => bodyPx;
                const authorFontPx = () => bodyPx;
                const stripTopFrac = usePostQuoteLayout ? 0.04 : 0.12;
                const stackVertPad = usePostQuoteLayout ? 19 : 14;
                /** @type {{ lines: string[], font: string, lh: number, w: number, h: number, role: string, rowGroup?: number, rowSlot?: number }[]} */
                let stripSpecs = [];

                const buildStripSpecs = () => {
                  const specs = [];
                  let nextRowPairGroup = 1;
                  const measureStrip = (lines, font, lineLead, role, rowMeta = null) => {
                    ctx.font = font;
                    let tw = 0;
                    for (const ln of lines) tw = Math.max(tw, ctx.measureText(ln).width);
                    const fs = parseInt(/(\d+)px/.exec(font)[1], 10);
                    const lh = fs * lineLead;
                    /** A few px slack: italic + multi-pass ink blur can exceed measureText width slightly inside the hand-cut clip. */
                    const w = Math.min(STRIP_MAX_W, Math.ceil(tw + PAPER_PAD_X * 2 + 6));
                    const h = Math.ceil(lines.length * lh + PAPER_PAD_Y * 2);
                    const o = { lines, font, lh, w, h, role };
                    if (rowMeta) Object.assign(o, rowMeta);
                    specs.push(o);
                  };

                  /** Two side-by-side strips for one wrapped line (hand-cut collage). */
                  const tryPairQuoteLine = (ln, font, lineSalt) => {
                    if (!ln) return null;
                    const words = ln.trim().split(/\s+/).filter(Boolean);
                    if (words.length < 3) return null;
                    ctx.font = font;
                    const fullW = ctx.measureText(ln).width;
                    if (fullW < innerMaxW * 0.22 && words.length < 5) return null;
                    /** Must stay ≤ innerMaxW: strip paper width caps at STRIP_MAX_W, so drawable text width is innerMaxW only — allowing +10 here clipped the tail of long halves (e.g. “people”). */
                    const lim = innerMaxW;
                    let best = null;
                    for (let k = 1; k <= words.length - 1; k++) {
                      const left = words.slice(0, k).join(' ');
                      const right = words.slice(k).join(' ');
                      const wL = ctx.measureText(left).width;
                      const wR = ctx.measureText(right).width;
                      if (wL > lim || wR > lim) continue;
                      if (wL < 14 || wR < 14) continue;
                      const imbalance = Math.abs(wL - wR);
                      if (!best || imbalance < best.imbalance) best = { left, right, imbalance };
                    }
                    if (!best) return null;
                    const dch = rngDateKey.charCodeAt(lineSalt % rngDateKey.length);
                    const pick =
                      (((lineSalt * 1103515245 + 12345) ^ dch * 31) >>> 0) % 100 < 48;
                    return pick ? [best.left, best.right] : null;
                  };

                  const segments = segmentQuoteForLayout(quoteText);
                  const qPx = quoteFontPx();
                  const bodyFont = `400 ${qPx}px ${FONT_SERIF}`;
                  ctx.font = bodyFont;
                  let quoteLineSalt = 0;
                  for (const seg of segments) {
                    const lines = wrapLines(ctx, seg, innerMaxW);
                    for (const ln of lines) {
                      const pair = tryPairQuoteLine(ln, bodyFont, quoteLineSalt++);
                      if (pair) {
                        const gid = nextRowPairGroup++;
                        measureStrip([pair[0]], bodyFont, 1.38, 'quote', { rowGroup: gid, rowSlot: 0 });
                        measureStrip([pair[1]], bodyFont, 1.38, 'quote', { rowGroup: gid, rowSlot: 1 });
                      } else {
                        measureStrip([ln], bodyFont, 1.38, 'quote');
                      }
                    }
                  }
                  if (quoteAuthor) {
                    const aPx = authorFontPx();
                    const authorFont = `italic 400 ${aPx}px ${FONT_SERIF}`;
                    ctx.font = authorFont;
                    const authorLines = wrapLines(ctx, quoteAuthor, innerMaxW);
                    for (const ln of authorLines) {
                      measureStrip([ln], authorFont, 1.38, 'author');
                    }
                  }

                  return specs;
                };

                const stackContentSpan = (specs) => {
                  let h = 0;
                  let i = 0;
                  while (i < specs.length) {
                    const spec = specs[i];
                    if (i > 0 && spec.role === 'author' && specs[i - 1].role === 'quote') {
                      h += layoutQuoteAuthorGap;
                    }
                    if (
                      spec.rowGroup != null &&
                      spec.rowSlot === 0 &&
                      specs[i + 1]?.rowGroup === spec.rowGroup &&
                      specs[i + 1].rowSlot === 1
                    ) {
                      h += Math.max(spec.h, specs[i + 1].h) + stackVertPad;
                      i += 2;
                    } else {
                      h += spec.h + stackVertPad;
                      i += 1;
                    }
                  }
                  return h;
                };

                const stackHeight = (specs) => STORY_H * stripTopFrac + stackContentSpan(specs);

                const stripEdgeMargin = 40;
                const staggerStripCenterX = (spec) => {
                  const roll = rnd();
                  const minCx = spec.w / 2 + stripEdgeMargin;
                  const maxCx = STORY_W - spec.w / 2 - stripEdgeMargin;
                  let cx;
                  if (roll < 0.34) {
                    cx = stripEdgeMargin + spec.w / 2 + rnd() * 95;
                  } else if (roll < 0.67) {
                    cx = STORY_W / 2 + (rnd() - 0.5) * (STORY_W * 0.3);
                  } else {
                    cx = STORY_W - stripEdgeMargin - spec.w / 2 - rnd() * 95;
                  }
                  return Math.max(minCx, Math.min(maxCx, cx));
                };

                /** Author strips stay entirely in the right half of the story (9:16). */
                const authorStripCenterX = (spec) => {
                  const minCx = STORY_W / 2 + spec.w / 2 + stripEdgeMargin;
                  const maxCx = STORY_W - spec.w / 2 - stripEdgeMargin;
                  if (minCx >= maxCx) {
                    return Math.max(
                      spec.w / 2 + stripEdgeMargin,
                      Math.min(STORY_W - spec.w / 2 - stripEdgeMargin, STORY_W * 0.75)
                    );
                  }
                  return minCx + rnd() * (maxCx - minCx);
                };

                const TITLE_STRIP_BG = ODQ_LAYOUT_B_AUTHOR_INVERT_BG;
                const TITLE_STRIP_TEXT = ODQ_LAYOUT_B_AUTHOR_INVERT_TEXT;

                const drawStripContent = (spec, cx, cy, jitterA, stripVariant = 'light') => {
                  let paper;
                  let ink;
                  /** Dark title = charcoal paper + cream type; title-invert = cream paper + charcoal type. */
                  let paperTexVariant = 'light';
                  if (stripVariant === 'dark') {
                    paper = TITLE_STRIP_BG;
                    ink = TITLE_STRIP_TEXT;
                    paperTexVariant = 'dark';
                  } else if (stripVariant === 'title-invert') {
                    paper = TITLE_STRIP_TEXT;
                    ink = TITLE_STRIP_BG;
                    paperTexVariant = 'light';
                  } else {
                    paper = PAPER_FILL;
                    ink = '#404040';
                    paperTexVariant = 'light';
                  }
                  drawPaperStrip(ctx, cx, cy, spec.w, spec.h, jitterA, paper, paperTexVariant);
                  ctx.save();
                  ctx.translate(cx, cy);
                  ctx.rotate(jitterA);
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  const LBKE = globalThis.LayoutBKeywordEmphasis;
                  const hasRuns = Array.isArray(spec.textRuns) && spec.textRuns.length > 0 && LBKE;
                  const runMeasureFlags = spec.emphasisMeasureFlags || { scale: false };
                  const drawRunsLineAt = (ox, oy, y, fillStyle, runFilter = null) => {
                    if (!hasRuns) return;
                    const qPxMatch = /(\d+)px/.exec(String(spec.font || ''));
                    const basePx = qPxMatch ? parseInt(qPxMatch[1], 10) : 48;
                    const prevAlign = ctx.textAlign;
                    ctx.textAlign = 'left';
                    let runX =
                      -LBKE.measureTextRunsWidth(ctx, spec.textRuns, basePx, FONT_SERIF, runMeasureFlags) / 2;
                    for (const run of spec.textRuns) {
                      const runFlags = {
                        bold: run.bold,
                        italic: run.italic,
                        underline: run.underline,
                        caps: run.caps,
                        scale: runMeasureFlags.scale
                      };
                      ctx.font = LBKE.layoutBFontForEmphasis(basePx, FONT_SERIF, runFlags);
                      const text = run.text || '';
                      const tw = ctx.measureText(text).width;
                      if (!runFilter || runFilter(run)) {
                        ctx.fillStyle = fillStyle;
                        ctx.fillText(text, runX + ox, y + oy);
                        if (run.underline) {
                          const runFontPx = LBKE.parseFontSizePx(ctx.font, basePx);
                          const underlineY = LBKE.layoutBUnderlineYFromMiddle(y + oy, runFontPx);
                          ctx.beginPath();
                          ctx.moveTo(runX + ox, underlineY);
                          ctx.lineTo(runX + ox + tw, underlineY);
                          ctx.lineWidth = Math.max(1, runFontPx * 0.04);
                          ctx.strokeStyle = fillStyle;
                          ctx.stroke();
                        }
                      }
                      runX += tw;
                    }
                    ctx.textAlign = prevAlign;
                  };
                  const drawLinesAt = (ox, oy, drawTy) => {
                    if (hasRuns) {
                      drawRunsLineAt(ox, oy, drawTy, ctx.fillStyle);
                      return;
                    }
                    let t = drawTy;
                    ctx.font = spec.font;
                    for (const ln of spec.lines) {
                      ctx.fillText(ln, ox, t + oy);
                      t += spec.lh;
                    }
                  };
                  ctx.font = spec.font;
                  const totalTextH = (spec.lines.length - 1) * spec.lh;
                  let ty = -totalTextH / 2;
                  if (stripVariant === 'light') {
                    /**
                     * Printed-ink: multiply + stacked blurs + subpixel jitter; last pass is
                     * light blur only so edges read a bit crisper than an all-soft stack.
                     */
                    const inkBody = '#5c544e';
                    const inkBloom = '#8f857a';
                    const inkHaze = '#a69a8e';
                    const startY = -totalTextH / 2;
                    ctx.globalCompositeOperation = 'multiply';
                    const setBlur = (px) => {
                      try {
                        ctx.filter = px > 0 ? `blur(${px}px)` : 'none';
                      } catch (e) {
                        /* no filter */
                      }
                    };
                    const jitter = [
                      [-0.55, 0],
                      [0.55, 0],
                      [0, -0.42],
                      [0, 0.42],
                      [-0.4, -0.34],
                      [0.4, -0.34],
                      [-0.4, 0.34],
                      [0.4, 0.34],
                    ];
                    setBlur(0.82);
                    ctx.fillStyle = inkHaze;
                    ctx.globalAlpha = 0.15;
                    for (const [jx, jy] of jitter) {
                      drawLinesAt(jx, jy, startY);
                    }
                    ctx.fillStyle = inkBloom;
                    ctx.globalAlpha = 0.34;
                    drawLinesAt(0, 0, startY);
                    setBlur(0.56);
                    ctx.fillStyle = inkBloom;
                    ctx.globalAlpha = 0.48;
                    drawLinesAt(0, 0, startY);
                    setBlur(0.34);
                    ctx.fillStyle = inkBody;
                    ctx.globalAlpha = 0.82;
                    drawLinesAt(0, 0, startY);
                    setBlur(0.2);
                    ctx.fillStyle = inkBody;
                    ctx.globalAlpha = 0.48;
                    drawLinesAt(0, 0, startY);
                    setBlur(0);
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = 'source-over';
                    if (hasRuns && spec.textRuns.some((r) => r.bold || r.italic || r.underline || r.caps)) {
                      drawRunsLineAt(
                        0,
                        0,
                        startY,
                        '#1f1b17',
                        (run) => run.bold || run.italic || run.underline || run.caps
                      );
                    }
                  } else {
                    ctx.fillStyle = ink;
                    try {
                      ctx.filter = 'blur(0.28px)';
                    } catch (e) {
                      /* no filter */
                    }
                    if (hasRuns) {
                      drawLinesAt(0, 0, ty);
                    } else {
                      for (const ln of spec.lines) {
                        ctx.fillText(ln, 0, ty);
                        ty += spec.lh;
                      }
                    }
                    try {
                      ctx.filter = 'none';
                    } catch (e) {
                      /* no filter */
                    }
                  }
                  ctx.restore();
                };

                const speakerImgs = speakerOverlay?.imageUrl
                  ? await loadSpeakerOverlayImages(speakerOverlay.imageUrl)
                  : [];
                const speakerActive =
                  odqLayoutBSpeakerActiveFromOverlay(speakerOverlay) && speakerImgs.length > 0;
                const LAYOUT_B_STORY_REF_W = 1080;
                const LAYOUT_B_STORY_REF_H = 1920;
                /** Speaker story uses 9:16 strip plan; speaker post lays out at 4:5 with larger type. */
                const useSpeakerUnifiedStripPlan = speakerActive && !isPostLayout;
                let quoteStripPlan = getLayoutBStoryQuotePlan(ctx, {
                  quoteText,
                  quoteAuthor,
                  layoutW: useSpeakerUnifiedStripPlan ? LAYOUT_B_STORY_REF_W : STORY_W,
                  layoutH: useSpeakerUnifiedStripPlan ? LAYOUT_B_STORY_REF_H : STORY_H,
                  dateKey: rngDateKey,
                  usePostQuoteLayout,
                  stripBoundsRect:
                    useSpeakerUnifiedStripPlan || !(dedicationBox && quiltCanvasRect)
                      ? null
                      : {
                          x: quiltCanvasRect.x + 18,
                          y: quiltCanvasRect.y + 18,
                          width: quiltCanvasRect.width - 36,
                          height: quiltCanvasRect.height - 18
                        },
                  avoidRects: useSpeakerUnifiedStripPlan
                    ? []
                    : [
                        focusCanvasRect ? { ...focusCanvasRect, pad: 84 } : null,
                        dedicationBox
                          ? { x: dedicationBox.x, y: dedicationBox.y, width: dedicationBox.width, height: dedicationBox.height, pad: 18 }
                          : null
                      ].filter(Boolean),
                  maxQuoteCanvasCoverage:
                    speakerActive && isPostLayout && !useSpeakerUnifiedStripPlan ? 0.7 : null,
                  keywordEmphasis: options.keywordEmphasisExplicit
                    ? options.keywordEmphasis || null
                    : resolvedKeywordEmphasis || null,
                  stripLayoutSeed: resolvedStripLayoutSeed,
                  stripFontScale:
                    speakerActive && isPostLayout ? ODQ_LAYOUT_B_SPEAKER_POST_STRIP_FONT_SCALE : 1
                });
                /** Layout B + speaker: shift quote stack up above portrait. */
                if (speakerActive && quoteStripPlan.length) {
                  const liftPx = Math.round(STORY_H * 0.068 * 1.15 * 1.25 * 1.25);
                  for (const spec of quoteStripPlan) {
                    spec.y -= liftPx;
                  }
                  const minEdge = 16;
                  let minTop = Infinity;
                  for (const spec of quoteStripPlan) {
                    minTop = Math.min(minTop, spec.y - spec.h / 2);
                  }
                  if (minTop < minEdge) {
                    const nudgeDown = minEdge - minTop;
                    for (const spec of quoteStripPlan) {
                      spec.y += nudgeDown;
                    }
                  }
                }
                let speakerDrawn = false;
                for (const speakerImg of speakerImgs) {
                  const speakerRect = getSpeakerOverlayRect(speakerImg, quoteStripPlan);
                  /**
                   * Admin preset override (story-only today): when a `transform` is passed in,
                   * lock the cutout to an absolute center (% of canvas) and scale its base size.
                   * `getSpeakerOverlayRect` still computes the aspect-correct base WxH; we
                   * scale around that and reposition. AUTO is signalled by no `transform`.
                   */
                  const speakerTransform = speakerOverlay?.transform;
                  if (
                    speakerRect &&
                    speakerTransform &&
                    (Number.isFinite(+speakerTransform.scale) ||
                      Number.isFinite(+speakerTransform.widthPct) ||
                      Number.isFinite(+speakerTransform.cxPct) ||
                      Number.isFinite(+speakerTransform.cyPct))
                  ) {
                    const baseW = speakerRect.width;
                    const baseH = speakerRect.height;
                    const aspect = baseW / Math.max(1, baseH);
                    /**
                     * Sizing: prefer `widthPct` (image width as fraction of canvas, aspect preserved)
                     * over `scale` (relative multiplier of base WxH). Falls back to base size.
                     */
                    if (Number.isFinite(+speakerTransform.widthPct)) {
                      const newW = STORY_W * Number(speakerTransform.widthPct);
                      speakerRect.width = newW;
                      speakerRect.height = newW / Math.max(0.001, aspect);
                    } else {
                      const s = Math.max(0.1, Number(speakerTransform.scale) || 1);
                      speakerRect.width = baseW * s;
                      speakerRect.height = baseH * s;
                    }
                    const cx = Number.isFinite(+speakerTransform.cxPct)
                      ? STORY_W * Number(speakerTransform.cxPct)
                      : speakerRect.x + baseW / 2;
                    const cy = Number.isFinite(+speakerTransform.cyPct)
                      ? STORY_H * Number(speakerTransform.cyPct)
                      : speakerRect.y + baseH / 2;
                    speakerRect.x = cx - speakerRect.width / 2;
                    speakerRect.y = cy - speakerRect.height / 2;
                    /** No tilt jitter on an admin-locked preset — optional rotateDeg from tune modal. */
                    const rotateDeg = odqNormalizeSpeakerRotateDeg(speakerTransform.rotateDeg);
                    speakerRect.angle = rotateDeg ? (rotateDeg * Math.PI) / 180 : 0;
                  }
                  speakerDrawn = drawSpeakerOverlay(ctx, speakerImg, speakerRect, speakerOverlay?.washColor);
                  if (speakerDrawn) break;
                }
                if (speakerOverlay?.imageUrl && !speakerDrawn) {
                  console.warn('Layout B speaker overlay skipped: image could not be drawn safely');
                }
                drawDedicatedBlockRing(ctx, focusCanvasRect);
                for (const spec of quoteStripPlan) {
                  const stripVariant = odqLayoutBAuthorStripVariant(speakerActive, spec.role);
                  drawStripContent(spec, spec.x, spec.y, spec.angle, stripVariant);
                }
                const quoteFontFromPlan = quoteStripPlan.find((s) => s.role === 'quote')?.font || '';
                const parsedBodyPx = parseInt(/(\d+)px/.exec(quoteFontFromPlan || '')?.[1] || '0', 10);
                if (Number.isFinite(parsedBodyPx) && parsedBodyPx > 0) {
                  bodyPx = parsedBodyPx;
                }

                if (!isPostLayout) {
                  const cornerPadR = 44;
                  const cornerPadB = 52;
                  const STORY_TITLE_LABEL = '@ourdailyquilt';
                  const measureTitleSpecs = () => {
                    const font = `400 ${bodyPx}px ${FONT_SERIF}`;
                    const lineLead = 1.38;
                    ctx.font = font;
                    const lines = wrapLines(ctx, STORY_TITLE_LABEL, innerMaxW);
                    let tw = 0;
                    for (const ln of lines) tw = Math.max(tw, ctx.measureText(ln).width);
                    const fs = parseInt(/(\d+)px/.exec(font)[1], 10);
                    const lh = fs * lineLead;
                    const w = Math.min(STRIP_MAX_W, Math.ceil(tw + PAPER_PAD_X * 2));
                    const h = Math.ceil(lines.length * lh + PAPER_PAD_Y * 2);
                    return { lines, font, lh, w, h };
                  };
                  const titleSpec = measureTitleSpecs();
                  const cxTitle = STORY_W - cornerPadR;
                  const cyStrip = STORY_H - cornerPadB - titleSpec.h / 2;
                  const cxStrip = cxTitle - titleSpec.w / 2;
                  drawStripContent(titleSpec, cxStrip, cyStrip, (rnd() - 0.5) * 0.045, 'title-invert');
                }
                drawDedicationMessageBox(ctx, dedicationBox);

                applyLayoutBMagazinePrintFinish(ctx, STORY_W, STORY_H);

                const exportMime =
                  typeof options.exportMime === 'string' && options.exportMime.trim()
                    ? options.exportMime.trim()
                    : 'image/png';
                const exportQuality =
                  typeof options.exportQuality === 'number' ? options.exportQuality : 0.95;
                canvas.toBlob((blob) => {
                  if (!blob) {
                    reject(new Error('Could not create experimental story image blob'));
                    return;
                  }
                  resolve(blob);
                }, exportMime, exportMime === 'image/png' ? exportQuality : exportQuality);
              })
              .catch(reject);
      });
    }

    // Layout-B / IG helpers still defined in this module but called from extracted lib/* scripts.
    globalThis.ensureOdqCanvasFontsReady = ensureOdqCanvasFontsReady;
    globalThis.getLayoutBStoryQuotePlan = getLayoutBStoryQuotePlan;
    globalThis.buildLayoutBQuoteStripPlan = buildLayoutBQuoteStripPlan;
    globalThis.ODQ_CANVAS_SERIF_FONT = ODQ_CANVAS_SERIF_FONT;
    globalThis.IG_QUILT_SCREEN_ASPECT = IG_QUILT_SCREEN_ASPECT;
    globalThis.scaleLayoutBStripPlan = scaleLayoutBStripPlan;
    globalThis.refitLayoutBStripPlanToText = refitLayoutBStripPlanToText;
    globalThis.odqMixStripLayoutSeedIntoRng = odqMixStripLayoutSeedIntoRng;
    globalThis.odqNormalizeStripLayoutSeed = odqNormalizeStripLayoutSeed;
    globalThis.odqNormalizeTuneAspect = odqNormalizeTuneAspect;
    globalThis.odqPromiseWithTimeout = odqPromiseWithTimeout;
    globalThis.odqLayoutBSpeakerActiveFromOverlay = odqLayoutBSpeakerActiveFromOverlay;
    globalThis.odqLayoutBAuthorStripVariant = odqLayoutBAuthorStripVariant;
    globalThis.odqGetCachedLayoutBStripLayoutSeed = odqGetCachedLayoutBStripLayoutSeed;
    globalThis.odqReadLayoutBStripLayoutSeed = odqReadLayoutBStripLayoutSeed;
    globalThis.odqGetCachedLayoutBKeywordEmphasis = odqGetCachedLayoutBKeywordEmphasis;
    globalThis.odqKeywordEmphasisFromQuoteObject = odqKeywordEmphasisFromQuoteObject;
    globalThis.odqResolveLayoutBQuoteKeywordEmphasis = odqResolveLayoutBQuoteKeywordEmphasis;
    globalThis.odqReadLayoutBKeywordEmphasis = odqReadLayoutBKeywordEmphasis;
    globalThis.odqPrefetchLayoutBKeywordEmphasis = odqPrefetchLayoutBKeywordEmphasis;
    globalThis.odqPrefetchSpeakerCutoutTweak = odqPrefetchSpeakerCutoutTweak;
    globalThis.odqSpeakerCutoutTransformForDateAsync = odqSpeakerCutoutTransformForDateAsync;
    globalThis.odqSpeakerCutoutTransformResolved = odqSpeakerCutoutTransformResolved;
    globalThis.odqResolveSpeakerImageForTune = odqResolveSpeakerImageForTune;
    globalThis.odqReadSpeakerCutoutPreset = odqReadSpeakerCutoutPreset;
    globalThis.odqReadSpeakerCutoutTweakFromLocal = odqReadSpeakerCutoutTweakFromLocal;
    globalThis.odqQuoteMayHaveSpeakerImage = odqQuoteMayHaveSpeakerImage;
    globalThis.odqSpeakerImageUrlFromQuote = odqSpeakerImageUrlFromQuote;
    globalThis.odqNormalizeSpeakerNudgeComponent = odqNormalizeSpeakerNudgeComponent;
    globalThis.odqNormalizeSpeakerRotateDeg = odqNormalizeSpeakerRotateDeg;
    globalThis.odqWriteSpeakerCutoutPreset = odqWriteSpeakerCutoutPreset;
    globalThis.odqSetCachedLayoutBKeywordEmphasis = odqSetCachedLayoutBKeywordEmphasis;
    globalThis.odqSetCachedLayoutBStripLayoutSeed = odqSetCachedLayoutBStripLayoutSeed;
    globalThis.odqWriteLayoutBKeywordEmphasis = odqWriteLayoutBKeywordEmphasis;
    globalThis.odqWriteLayoutBStripLayoutSeed = odqWriteLayoutBStripLayoutSeed;
    globalThis.odqWriteLayoutBSpeakerCutoutPresetFirestore = odqWriteLayoutBSpeakerCutoutPresetFirestore;
    globalThis.odqVerifyLayoutBTuneOnServer = odqVerifyLayoutBTuneOnServer;
    globalThis.odqReadInstagramImagesDocWithFallback = odqReadInstagramImagesDocWithFallback;
    /* odqIsCapacitorNative — already on root from inline head bootstrap */
    globalThis.ODQ_SPEAKER_PRESETS = ODQ_SPEAKER_PRESETS;
    globalThis.ODQ_SPEAKER_NUDGE_STEP = ODQ_SPEAKER_NUDGE_STEP;
    globalThis.ODQ_SPEAKER_ROTATE_STEP_DEG = ODQ_SPEAKER_ROTATE_STEP_DEG;
    globalThis.composeInstagramLayoutBFromQuiltBlob = composeInstagramLayoutBFromQuiltBlob;
})(typeof globalThis !== 'undefined' ? globalThis : window);
