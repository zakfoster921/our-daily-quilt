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

    /** Layout B quote/author strips (IG canvas + in-app plan). */
    const ODQ_LAYOUT_B_STRIP_FONT =
      '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
    const ODQ_CANVAS_SERIF_FONT = ODQ_LAYOUT_B_STRIP_FONT;
    /** Wider tracking on strip type (em of font size). */
    const ODQ_LAYOUT_B_STRIP_LETTER_SPACING_EM = 0.045;

    function odqLayoutBStripLetterSpacingPx(fontPx) {
      const px = Math.max(1, Number(fontPx) || 48);
      return Math.max(0, px * ODQ_LAYOUT_B_STRIP_LETTER_SPACING_EM);
    }

    function odqSetLayoutBStripLetterSpacing(ctx, fontPx) {
      const trackPx = odqLayoutBStripLetterSpacingPx(fontPx);
      try {
        if ('letterSpacing' in ctx) ctx.letterSpacing = trackPx > 0 ? `${trackPx}px` : '0px';
      } catch (_) {
        /* ignore */
      }
    }

    function odqResetLayoutBStripLetterSpacing(ctx) {
      try {
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      } catch (_) {
        /* ignore */
      }
    }

    function odqLayoutBStripPaperWidth(tw, padX, extraPadX = 0) {
      const px = Math.max(12, Number(padX) || 26);
      return Math.ceil(Number(tw || 0) + px * 2 + 6 + Math.max(0, Number(extraPadX) || 0));
    }
    const ODQ_LAYOUT_B_AUTHOR_INVERT_BG = '#636363';
    const ODQ_LAYOUT_B_AUTHOR_INVERT_TEXT = '#f3eee4';
    /** Vertical gap between last quote strip and author/speaker name strip. */
    const ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_POST = 116;
    const ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_POST_BOUNDED = 92;
    const ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_STORY = 128;
    /** Story + speaker: tighter quote→name gap and bottom inset so cutout can tuck behind name strip. */
    const ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_STORY_SPEAKER = 92;
    const ODQ_LAYOUT_B_STORY_SPEAKER_VPAD_BOTTOM = 84;
    /** Story speaker placement: encroach into quote vs author name strip (fraction of portrait height). */
    const ODQ_LAYOUT_B_SPEAKER_QUOTE_ENCROACH_FRAC = 0.1;
    const ODQ_LAYOUT_B_SPEAKER_AUTHOR_ENCROACH_FRAC = 0.22;
    /** Min vertical gap between quote strip rows inside the post 3:4 safe zone. */
    const ODQ_LAYOUT_B_POST_STACK_VERT_PAD_BOUNDED = 8;
    /**
     * Post 4:5: quote layout column inside the 3:4 safe zone (clip). Strips cluster here;
     * they may use the full safe rect but must not exceed it.
     */
    const ODQ_LAYOUT_B_POST_QUOTE_LAYOUT_INNER_FRAC = 0.78;
    /** Max center-to-center span of the quote cluster inside the inner column. */
    const ODQ_LAYOUT_B_POST_QUOTE_MAX_SPAN_FRAC = 0.88;
    /** Layout B speaker *post* (4:5): quote/author strip type vs story-sized plan scaled to post. */
    const ODQ_LAYOUT_B_SPEAKER_POST_STRIP_FONT_SCALE = 1.1;
    /**
     * Layout B post (4:5) native plan: 1.0 = full post baseline inside safe zone (shrink loop caps overflow).
     * Story→post inherit still scales typography from 9:16.
     */
    const ODQ_LAYOUT_B_POST_STRIP_FONT_SCALE = 1;
    /** Post 4:5 quote strips: never shrink below this bodyPx (~70px paper strip at 1080×1350). */
    const ODQ_LAYOUT_B_POST_MIN_BODY_PX = 38;
    /** Undo 9:16→4:5 font shrink on inherited story strip plans (quote-only layout-b post). */
    const ODQ_LAYOUT_B_POST_STORY_INHERIT_TYPE_BOOST = 1920 / 1350;
    /** Max extra typography scale searched after undo (binary search to fill safe-zone height). */
    const ODQ_LAYOUT_B_POST_QUOTE_ONLY_MAX_TYPE_SCALE = 1.55;
    /** Post quote: story-like left/center/right stagger inside the inner column (not a sine wave). */
    const ODQ_LAYOUT_B_POST_STAGGER_ZONE_FRAC = 0.45;
    const ODQ_LAYOUT_B_POST_STAGGER_CENTER_SPAN_FRAC = 0.70;
    const ODQ_LAYOUT_B_POST_READING_BAND_JITTER_PX = 26;
    const ODQ_LAYOUT_B_POST_STRIP_TILT_RAD = 0.10;
    /** Carousel slide 1: strip avoid uses alpha-tight content box + asymmetric pad (small top). */
    const ODQ_CAROUSEL_SPEAKER_AVOID_PAD = { top: 6, right: 24, bottom: 24, left: 24 };
    /** Matches CAROUSEL_SPEAKER_DRAW_PAD_PX in ig-contributor-carousel-compose (seam draws on top). */
    const ODQ_CAROUSEL_SPEAKER_SEAM_DRAW_PAD = 48;
    /** Paper shadow + hand-cut wobble + margin — carousel strips must not cover text. */
    const ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD = 22;
    const ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP = 4;
    /** Shadow/hand-cut bleed beyond text-safe pad when stacking long carousel quotes. */
    const ODQ_CAROUSEL_STRIP_DRAW_BLEED = 18;
    /** Vertical restack uses paper + small shadow tuck — not full draw bleed (40px was swallowing gap tweaks). */
    const ODQ_CAROUSEL_STRIP_STACK_PAD = 4;
    /** Tighter strip leading for long carousel quotes (default body lead is 1.38). */
    const ODQ_CAROUSEL_LONG_QUOTE_LINE_LEAD = 0.98;
    /** Slightly shorter strip paper top/bottom for carousel row-budget stacks. */
    const ODQ_CAROUSEL_STRIP_PAPER_PAD_Y = 5;
    /** Carousel seam slide: do not fall back to caption-sized strips when layout search gets tight. */
    const ODQ_CAROUSEL_STORY_STYLE_MIN_BODY_PX = 60;
    /** Carousel seam slide: keep the author name subordinate to the quote body. */
    const ODQ_CAROUSEL_STORY_STYLE_AUTHOR_FONT_SCALE = 0.75;
    /** Post: chance adjacent comma-split phrase segments share one row (two strips). */
    const ODQ_LAYOUT_B_POST_ADJACENT_PAIR_PICK_PCT = 100;
    /** Extra horizontal paper on keyword-emphasis plain connector strips (e.g. "is connected with"). */
    const ODQ_LAYOUT_B_KEYWORD_CONNECTOR_EXTRA_PAD = 20;
    /** Story 9:16: pack comma-split strips into readable rows instead of one staggered strip per line. */
    const ODQ_LAYOUT_B_STORY_ROW_MIN_STRIPS = 2;
    const ODQ_LAYOUT_B_STORY_ROW_MAX_STRIPS = 4;
    const ODQ_LAYOUT_B_STORY_ROW_INNER_FRAC = 0.92;
    const ODQ_LAYOUT_B_STORY_ROW_HGAP = 28;
    /** Story 9:16: slight zoom past cover so warm matte / cutout edges do not peek at frame edges. */
    const ODQ_LAYOUT_B_STORY_QUILT_BLEED = 1.05;
    const ODQ_LAYOUT_B_STORY_QUILT_BLEED_NO_SPEAKER = 1.02;
    /** Admin tune modal: extra zoom on quilt background (multiplies bleed/scale; 1.0 = default). */
    const ODQ_LAYOUT_B_QUILT_BG_ZOOM_STEP = 0.04;
    const ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN = 1.0;
    /** Admin tune: extra crop past default bleed; 1.6 ≈ +60% tighter than default cover. */
    const ODQ_LAYOUT_B_QUILT_BG_ZOOM_MAX = 1.6;
    /** layout-b-speaker.png: cutout cover-fits inside the same 3:4 post safe zone as quote strips. */
    const ODQ_LAYOUT_B_SPEAKER_HERO_SAFE_INSET = 6;
    const ODQ_LAYOUT_B_SPEAKER_HERO_BOTTOM_RESERVE = 86;
    const ODQ_LAYOUT_B_SPEAKER_HERO_GAP_ABOVE_NAME = 6;
    /** layout-b-speaker.png: speaker cutout target area as a fraction of full 4:5 canvas (aspect preserved). */
    const ODQ_LAYOUT_B_SPEAKER_HERO_POST_AREA_FRAC = 0.5;
    /** Speaker cutout paper — matches in-app name strip tape (`--odq-paper-tape`). */
    const ODQ_SPEAKER_CUTOUT_MAT_RGB = '242, 238, 230';
    /** layout-b-speaker.png: use in-app speaker card layer stack (not a separate paper mat). */
    const ODQ_LAYOUT_B_SPEAKER_HERO_MAT_OPACITY = 1;
    const ODQ_SPEAKER_HERO_MAT_OFFSET_X_FRAC = 0.007;
    const ODQ_SPEAKER_HERO_MAT_OFFSET_Y_FRAC = 0.006;
    const ODQ_SPEAKER_HERO_MAT_SCALE = 1.004;
    const ODQ_SPEAKER_HERO_MAT_ROTATE_DEG = 0.18;

    function odqIsSpeakerCutoutImageUrl(url) {
      return /speaker-cutouts(?:%2F|\/)/i.test(String(url || '').trim());
    }

    /** Proxied data: URLs hide Storage path — use cutoutSourceUrl from overlay metadata. */
    function odqResolveSpeakerCutoutPng(opts = {}, img = null) {
      if (opts.isCutoutPng === true) return true;
      if (opts.isCutoutPng === false) return false;
      const urls = [
        opts.cutoutSourceUrl,
        opts.imageUrl,
        img?.currentSrc,
        img?.src
      ];
      return urls.some((u) => odqIsSpeakerCutoutImageUrl(u));
    }
    /** Post quote-only (layout-b.png): speaker/author name vs quote strip type. */
    const ODQ_LAYOUT_B_POST_QUOTE_ONLY_AUTHOR_FONT_SCALE = 0.75;

    function odqLayoutBPostQuoteOnlyAuthorFontPx(quoteBodyPx) {
      return Math.max(14, Math.round(Number(quoteBodyPx) * ODQ_LAYOUT_B_POST_QUOTE_ONLY_AUTHOR_FONT_SCALE));
    }

    /** layout-b.png (4:5 quote post, not speaker-hero): one-line speaker/author name band. */
    function odqIsLayoutBPostQuoteOnlyAuthorContext(isPostLayout, speakerHeroPost) {
      return !!(isPostLayout && speakerHeroPost !== true);
    }

    function odqLayoutBPostAuthorDisplayName(quoteAuthor, speakerOverlay, speakerHeroPost) {
      if (speakerHeroPost) return String(quoteAuthor || '').replace(/\s+/g, ' ').trim();
      return String(speakerOverlay?.name || quoteAuthor || '')
        .replace(/^\s*[—-]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function odqEscapeRegExp(str) {
      return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /** Drop trailing attribution duplicated in quote body (avoids name as extra quote strips). */
    function odqStripTrailingAuthorFromQuoteText(quoteText, authorName) {
      let text = String(quoteText || '').replace(/\s+/g, ' ').trim();
      const author = String(authorName || '')
        .replace(/^\s*[—-]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || !author) return text;
      const escaped = odqEscapeRegExp(author);
      text = text
        .replace(new RegExp(`[\\s]*[—–\\-][\\s]*${escaped}[\\s]*$`, 'i'), '')
        .replace(new RegExp(`[\\s]+${escaped}[\\s]*$`, 'i'), '')
        .trim();
      const authorWords = author.split(/\s+/).filter(Boolean);
      const textWords = text.split(/\s+/).filter(Boolean);
      if (authorWords.length >= 1 && textWords.length > authorWords.length) {
        const tail = textWords.slice(-authorWords.length);
        if (tail.join(' ').toLowerCase() === authorWords.join(' ').toLowerCase()) {
          text = textWords.slice(0, -authorWords.length).join(' ').trim();
        }
      }
      return text.replace(/\s*[—–\-]\s*$/, '').trim();
    }

    /** Remove quote strips that only repeat the speaker/author name before the author band. */
    function odqRemoveTrailingAuthorQuoteStripsFromPlan(plan, authorName) {
      const author = String(authorName || '')
        .replace(/^\s*[—-]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!author) return Array.isArray(plan) ? plan : [];
      const authorLower = author.toLowerCase();
      const authorWordSet = new Set(authorLower.split(/\s+/).filter(Boolean));
      const strips = Array.isArray(plan) ? plan.slice() : [];
      const authorIdx = strips.findIndex((s) => s.role === 'author');
      const searchEnd = authorIdx >= 0 ? authorIdx : strips.length;
      let cut = searchEnd;
      const tailLines = [];
      while (cut > 0 && strips[cut - 1].role === 'quote') {
        const spec = strips[cut - 1];
        const ln = (Array.isArray(spec.lines) ? spec.lines : [String(spec.lines || '')])
          .map((l) => String(l || '').trim())
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!ln) break;
        if (ln === authorLower || authorWordSet.has(ln)) {
          tailLines.unshift(ln);
          cut -= 1;
          continue;
        }
        break;
      }
      if (!tailLines.length) return strips;
      if (tailLines.join(' ') !== authorLower) return strips;
      return [...strips.slice(0, cut), ...strips.slice(searchEnd)];
    }

    /** One horizontal author strip; shrinks below target quote ratio only if needed to fit width. */
    function odqFitLayoutBAuthorNameToOneStrip(
      ctx,
      name,
      quoteBodyPx,
      innerMaxW,
      stripMaxW,
      fontSerif,
      fontScale = ODQ_LAYOUT_B_POST_QUOTE_ONLY_AUTHOR_FONT_SCALE
    ) {
      const raw = String(name || '').replace(/\s+/g, ' ').trim();
      if (!raw) return null;
      const PAPER_PAD_X = 26;
      const PAPER_PAD_Y = 15;
      const maxW = Math.max(120, Number(stripMaxW) || 980);
      let aPx = Math.max(14, Math.round(Number(quoteBodyPx) * Number(fontScale) || 0.75));
      const minPx = 14;
      let authorFont = `italic 400 ${aPx}px ${fontSerif}`;
      ctx.font = authorFont;
      odqSetLayoutBStripLetterSpacing(ctx, aPx);
      let tw = ctx.measureText(raw).width;
      while (tw > innerMaxW && aPx > minPx) {
        aPx -= 1;
        authorFont = `italic 400 ${aPx}px ${fontSerif}`;
        ctx.font = authorFont;
        odqSetLayoutBStripLetterSpacing(ctx, aPx);
        tw = ctx.measureText(raw).width;
      }
      const lh = aPx * 1.38;
      const w = Math.min(maxW, Math.ceil(tw + PAPER_PAD_X * 2 + 6));
      const h = Math.ceil(lh + PAPER_PAD_Y * 2);
      return { text: raw, lines: [raw], font: authorFont, lh, w, h, role: 'author' };
    }

    /** Merge stacked / multi-line author strips into one horizontal band at 75% quote size. */
    function odqReflowQuoteOnlyPostAuthorStrips(plan, ctx, stripMaxW, fontSerif, layoutW, layoutH) {
      const w = Math.max(1, Number(layoutW) || 1080);
      const h = Math.max(1, Number(layoutH) || 1350);
      const isPost = (w === 1080 && h === 1350) || Math.abs(w / Math.max(1, h) - 1080 / 1350) < 0.03;
      if (!isPost) return plan;
      const strips = Array.isArray(plan) ? plan.slice() : [];
      const authors = strips.filter((s) => s.role === 'author');
      if (!authors.length) return strips;
      const quotes = strips.filter((s) => s.role !== 'author');
      let quotePx = 48;
      for (const q of quotes) {
        const px = parseInt(/(\d+)px/.exec(String(q.font || ''))?.[1] || '48', 10);
        quotePx = Math.max(quotePx, px);
      }
      const combined = authors
        .flatMap((s) => (Array.isArray(s.lines) ? s.lines : [String(s.lines || '')]))
        .map((ln) => String(ln || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!combined) return quotes;
      const safe = odqLayoutBPostGridSafeRect(w, h, 8);
      const innerMaxW = safe
        ? Math.max(120, safe.width - 26 * 2 - 12)
        : Math.max(120, Number(stripMaxW) || 980) - 26 * 2;
      const authorSpec = odqFitLayoutBAuthorNameToOneStrip(
        ctx,
        combined,
        quotePx,
        innerMaxW,
        stripMaxW,
        fontSerif
      );
      if (!authorSpec) return strips;
      const lastAuthor = authors.reduce(
        (best, s) => (Number(s.y || 0) > Number(best.y || 0) ? s : best),
        authors[0]
      );
      authorSpec.x = lastAuthor.x;
      authorSpec.y = lastAuthor.y;
      authorSpec.angle = lastAuthor.angle;
      authorSpec.seed = lastAuthor.seed || 'author_reflow';
      return odqRemoveTrailingAuthorQuoteStripsFromPlan([...quotes, authorSpec], combined);
    }

    function odqLayoutBSpeakerActiveFromOverlay(speakerOverlay) {
      return !!(speakerOverlay && String(speakerOverlay.imageUrl || '').trim());
    }

    function odqLayoutBAuthorStripVariant(_speakerActive, _role) {
      return 'light';
    }

    let _odqCanvasFontsReadyPromise = null;
    async function ensureOdqCanvasFontsReady() {
      if (_odqCanvasFontsReadyPromise) return _odqCanvasFontsReadyPromise;
      _odqCanvasFontsReadyPromise = (async () => {
        try {
          if (typeof document === 'undefined' || !document.fonts) return;
          await Promise.allSettled([
            document.fonts.load('400 48px "DM Sans"'),
            document.fonts.load('italic 400 48px "DM Sans"'),
            document.fonts.load('700 48px "DM Sans"'),
            document.fonts.load('800 48px "DM Sans"'),
            document.fonts.ready
          ]);
        } catch (_) {
          /* Canvas exports can still fall back to the system sans stack. */
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
      return odqPreferFastLayoutBPreview() ? 0.38 : 0.48;
    }

    /** Reuse decoded speaker bitmap across tune-modal preview re-renders (same cutout URL). */
    let _odqTuneComposeSpeakerImgCache = null;
    function odqClearTuneComposeSpeakerImgCache() {
      _odqTuneComposeSpeakerImgCache = null;
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
      if (!cutout && !portrait) return '';
      if (arch && typeof arch._speakerOverlayImageUrlForLayoutBCompose === 'function') {
        return arch._speakerOverlayImageUrlForLayoutBCompose(cutout, portrait, q);
      }
      const raw =
        cutout ||
        (portrait && !/speaker-cutouts(?:%2F|\/)/i.test(portrait) ? portrait : '');
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

    /** Break a long phrase into 2–4 word strips (story-style collage, not one wide band). */
    function odqMicroSplitSegmentForStripCollage(segment, rnd, opts = {}) {
      const t = String(segment || '').trim();
      if (!t) return [];
      if (opts.carouselRowBudget) return [t];
      const words = t.split(/\s+/).filter(Boolean);
      const wc = words.length;
      const isPost = !!opts.isPostLayout;
      const bounded = !!opts.stripBounds;
      const maxWordsPerStrip = bounded ? 3 : isPost ? 5 : 3;
      const minWordsPerStrip = isPost ? 2 : 1;
      if (wc <= maxWordsPerStrip) return [t];
      const softBreakAfter = new Set([
        'in',
        'on',
        'to',
        'of',
        'for',
        'with',
        'at',
        'by',
        'from',
        'into',
        'onto',
        'because',
        'that',
        'when',
        'where',
        'while',
        'only',
        'everything',
        'every',
        'all',
        'each',
        'exists',
        'is',
        'are',
        'was',
        'were',
        'be',
        'it',
        'its',
        'relationship',
        'relationships',
        'universe',
        'else',
        'there',
        'this',
        'these',
        'other',
        'others'
      ]);
      const pieces = [];
      let start = 0;
      while (start < wc) {
        const remaining = wc - start;
        if (remaining <= maxWordsPerStrip) {
          pieces.push(words.slice(start).join(' '));
          break;
        }
        const minEnd = start + minWordsPerStrip;
        const searchEnd = Math.min(start + maxWordsPerStrip, wc - minWordsPerStrip);
        let cutAt = -1;
        for (let j = searchEnd; j >= minEnd; j--) {
          const bare = words[j - 1].toLowerCase().replace(/[^\w']+/g, '');
          if (softBreakAfter.has(bare)) {
            cutAt = j;
            break;
          }
        }
        if (cutAt < 0) {
          const span = Math.max(1, searchEnd - minEnd + 1);
          cutAt = minEnd + Math.floor((typeof rnd === 'function' ? rnd() : 0.5) * span);
          cutAt = Math.max(minEnd, Math.min(searchEnd, cutAt));
        }
        pieces.push(words.slice(start, cutAt).join(' '));
        start = cutAt;
      }
      return pieces.length > 1 ? pieces : [t];
    }

    /** Consecutive strips sharing rowGroup starting at index i (rowSlot 0..n-1). */
    function odqLayoutBRowGroupLen(specs, i) {
      const spec = specs[i];
      if (!spec || spec.rowGroup == null || spec.rowSlot !== 0) return 1;
      const gid = spec.rowGroup;
      let n = 1;
      while (specs[i + n]?.rowGroup === gid && specs[i + n]?.rowSlot === n) n += 1;
      return n;
    }

    function odqLayoutBRowGroupMaxH(specs, i) {
      const n = odqLayoutBRowGroupLen(specs, i);
      let maxH = Number(specs[i]?.h || 0);
      for (let k = 1; k < n; k++) maxH = Math.max(maxH, Number(specs[i + k]?.h || 0));
      return maxH;
    }

    function odqLayoutBRowGroupTotalW(specs, i, hGap) {
      const n = odqLayoutBRowGroupLen(specs, i);
      let total = 0;
      for (let k = 0; k < n; k++) total += Number(specs[i + k]?.w || 0);
      return total + hGap * Math.max(0, n - 1);
    }

    /** Story: group consecutive quote strips into 2–4 per row when they fit horizontally. */
    function odqPackStoryQuoteStripsIntoRows(specList, opts = {}) {
      const {
        innerWidth = 980,
        stripEdgeMargin = 40,
        pairGap = ODQ_LAYOUT_B_STORY_ROW_HGAP,
        minStrips = ODQ_LAYOUT_B_STORY_ROW_MIN_STRIPS,
        maxStrips = ODQ_LAYOUT_B_STORY_ROW_MAX_STRIPS,
        innerFrac = ODQ_LAYOUT_B_STORY_ROW_INNER_FRAC,
        rnd = () => 0.5
      } = opts;
      const budget = Math.max(200, innerWidth - stripEdgeMargin * 2) * innerFrac;
      const rowWidth = (items) =>
        items.reduce((sum, s) => sum + Number(s.w || 0), 0) + pairGap * Math.max(0, items.length - 1);
      let gidBase = 99000;
      const out = [];
      let i = 0;
      while (i < specList.length) {
        const a = specList[i];
        if (a.role !== 'quote') {
          out.push(a);
          i += 1;
          continue;
        }
        const existingRowLen = odqLayoutBRowGroupLen(specList, i);
        if (a.rowGroup != null && a.rowSlot === 0 && existingRowLen >= 2) {
          for (let k = 0; k < existingRowLen; k++) out.push(specList[i + k]);
          i += existingRowLen;
          continue;
        }
        if (a.rowGroup != null) {
          out.push(a);
          i += 1;
          continue;
        }
        const targetCount =
          minStrips + Math.floor((typeof rnd === 'function' ? rnd() : 0.5) * (maxStrips - minStrips + 1));
        const row = [a];
        i += 1;
        while (i < specList.length && row.length < maxStrips) {
          const next = specList[i];
          if (next.role !== 'quote' || next.rowGroup != null) break;
          const trial = row.concat(next);
          if (rowWidth(trial) > budget) break;
          row.push(next);
          i += 1;
          if (row.length >= targetCount) break;
        }
        if (row.length >= minStrips) {
          const gid = gidBase++;
          row.forEach((s, slot) => out.push({ ...s, rowGroup: gid, rowSlot: slot }));
        } else {
          for (const s of row) out.push(s);
        }
      }
      return out;
    }

    function getLayoutBStoryQuotePlan(ctx, options) {
      const {
        quoteText: quoteTextIn = '',
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
        stripFontScale = 1,
        /** Story 9:16 with speaker cutout — center name strip and reserve bottom tuck band. */
        speakerLayoutActive = false,
        /** layout-b.png: omit for story; pass false for speaker-hero post. */
        postQuoteOnlyAuthor = false,
        carouselSpeakerAvoidRect = null,
        carouselShortQuote = false
      } = options || {};
      let quoteText = String(quoteTextIn ?? '').replace(/\s+/g, ' ').trim();
      const layoutAuthor = String(quoteAuthor ?? '')
        .replace(/^\s*[—-]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (layoutAuthor) {
        quoteText = odqStripTrailingAuthorFromQuoteText(quoteText, layoutAuthor);
      }
      const STORY_W = layoutW;
      const STORY_H = layoutH;
      const isPostLayout =
        (layoutW === 1080 && layoutH === 1350) ||
        Math.abs(layoutW / Math.max(1, layoutH) - 1080 / 1350) < 0.03;
      const carouselRowBudget =
        isPostLayout &&
        carouselSpeakerAvoidRect &&
        Number.isFinite(Number(carouselSpeakerAvoidRect.width)) &&
        Number(carouselSpeakerAvoidRect.width) > 0 &&
        carouselShortQuote !== true;
      let carouselReservedRows = 0;
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
      /** Post: narrower horizontal layout column inside 3:4 safe zone (clip stays on stripBounds). */
      const postStripLayoutBounds =
        isPostLayout && stripBounds
          ? odqShrinkLayoutBStripHorizontalBounds(
              stripBounds,
              ODQ_LAYOUT_B_POST_QUOTE_LAYOUT_INNER_FRAC
            )
          : null;
      const STRIP_MAX_W = carouselRowBudget
        ? Math.max(
            160,
            odqCarouselSpeakerColumnMaxWidth(STORY_W, STORY_H, carouselSpeakerAvoidRect) + 52
          )
        : postStripLayoutBounds
          ? Math.max(160, postStripLayoutBounds.right - postStripLayoutBounds.left - 12)
          : stripBounds
            ? Math.max(180, stripBounds.right - stripBounds.left - 12)
            : STORY_W - (isPostLayout ? 52 : 100);
      const PAPER_PAD_X = 26;
      const PAPER_PAD_Y = carouselRowBudget ? ODQ_CAROUSEL_STRIP_PAPER_PAD_Y : 15;
      const FONT_SERIF = ODQ_CANVAS_SERIF_FONT;
      const quoteLineLead = carouselRowBudget ? ODQ_CAROUSEL_LONG_QUOTE_LINE_LEAD : 1.38;
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
        // Stop words that should never end a strip alone — grab one more word if they would.
        const isStopWord = (w) => /^(to|a|an|the|of|in|on|at|by|for|with|as|and|but|or|not|so|is|was|are|were)$/i.test(
          String(w || '').replace(/[.,!?]+$/, '')
        );
        // Split hard punctuation first so those always become strip breaks.
        const splitFlat = (chunks, regex) =>
          chunks.flatMap((c) => {
            const bits = c.split(regex).map((x) => x.trim()).filter(Boolean);
            return bits.length > 1 ? bits : [c];
          });
        const splitFlatKeepLeftDelim = (chunks, regex, delim) =>
          chunks.flatMap((c) => {
            const bits = c.split(regex).map((x) => x.trim()).filter(Boolean);
            if (bits.length <= 1) return [c];
            return bits.map((b, i) => (i < bits.length - 1 ? `${b}${delim}` : b));
          });
        const sentences =
          t.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [t];
        const out = [];
        for (const sentence of sentences) {
          let chunks = [sentence];
          chunks = splitFlat(chunks, /\s*;\s+/);
          chunks = splitFlat(chunks, /\s+[—–]\s+/);
          chunks = splitFlat(chunks, /:\s+/);
          chunks = splitFlatKeepLeftDelim(chunks, /,\s+/, ',');
          for (const chunk of chunks) {
            const words = chunk.trim().split(/\s+/).filter(Boolean);
            let i = 0;
            while (i < words.length) {
              // Pick 2 or 3 words; 3 words ~40% of the time.
              let take = (rnd() > 0.60 && i + 2 < words.length) ? 3 : 2;
              if (i + take > words.length) take = words.length - i;
              // If the last word in the strip is a stop word and there's more to grab, take one more.
              if (take < words.length - i && isStopWord(words[i + take - 1])) take++;
              out.push(words.slice(i, i + take).join(' '));
              i += take;
            }
          }
        }
        // If the last strip is a lone stop word, merge it into the prior strip.
        if (out.length >= 2 && isStopWord(out[out.length - 1].trim())) {
          out[out.length - 2] += ' ' + out[out.length - 1];
          out.pop();
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
        ? stripBounds
          ? ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_POST_BOUNDED
          : ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_POST
        : speakerLayoutActive
          ? ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_STORY_SPEAKER
          : ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_STORY;
      const stackVertPad = stripBounds
        ? ODQ_LAYOUT_B_POST_STACK_VERT_PAD_BOUNDED
        : usePostQuoteLayout
          ? 19
          : 14;
      let bodyPx = Math.round(38 * 1.25);
      if (usePostQuoteLayout) bodyPx += 10;
      if (isPostLayout) bodyPx = Math.round(bodyPx * ODQ_LAYOUT_B_POST_STRIP_FONT_SCALE);
      const quoteFontPx = () => bodyPx;
      const carouselMaxQuoteRows = () =>
        odqCarouselSpeakerEstimateMaxQuoteRows(STORY_W, STORY_H, carouselSpeakerAvoidRect, {
          bodyPx,
          reservedRows: carouselReservedRows,
          authorCutoutLabel: true
        });
      const authorFontPx = () =>
        postQuoteOnlyAuthor ? odqLayoutBPostQuoteOnlyAuthorFontPx(bodyPx) : bodyPx;
      const segmentQuoteForLayout = (text) => {
        const applyPoeticMicroSplit = (segments) => {
          if (carouselRowBudget) return segments;
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
        const segs = runOne(paragraphs.join(' '));
        return segs;
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
          const cleanLines = (Array.isArray(lines) ? lines : [])
            .map((ln) => String(ln || '').trim())
            .filter(Boolean);
          if (!cleanLines.length) return;
          ctx.font = font;
          const fs = parseInt(/(\d+)px/.exec(font)[1], 10);
          odqSetLayoutBStripLetterSpacing(ctx, fs);
          let tw = 0;
          for (const ln of cleanLines) tw = Math.max(tw, ctx.measureText(ln).width);
          const lh = fs * lineLead;
          let extraPadX =
            (rowMeta && Number(rowMeta.extraPaperPadX)) ||
            (rowMeta && rowMeta.isKeywordConnector ? ODQ_LAYOUT_B_KEYWORD_CONNECTOR_EXTRA_PAD : 0);
          let rawW = odqLayoutBStripPaperWidth(tw, PAPER_PAD_X, extraPadX);
          if (rawW > STRIP_MAX_W && rowMeta && rowMeta.isKeywordConnector) {
            extraPadX = Number(rowMeta.extraPaperPadX) || 0;
            rawW = odqLayoutBStripPaperWidth(tw, PAPER_PAD_X, extraPadX);
          }
          const w = Math.min(STRIP_MAX_W, rawW);
          const h = Math.ceil(cleanLines.length * lh + PAPER_PAD_Y * 2);
          const o = { text: cleanLines.join(' '), lines: cleanLines, font, lh, w, h, role };
          if (rowMeta) Object.assign(o, rowMeta);
          if (extraPadX > 0) o.extraPaperPadX = extraPadX;
          specs.push(o);
        };
        const measureStripWithRuns = (textRuns, font, lineLead, role, rowMeta = null) => {
          const qPx = quoteFontPx();
          ctx.font = font;
          odqSetLayoutBStripLetterSpacing(ctx, qPx);
          const tw = LBKE.measureTextRunsWidth(ctx, textRuns, qPx, FONT_SERIF, kwFlags || {});
          const fs = parseInt(/(\d+)px/.exec(font)[1], 10);
          const lh = fs * lineLead;
          const w = Math.min(STRIP_MAX_W, Math.ceil(tw + PAPER_PAD_X * 2 + 6));
          const h = Math.ceil(lh + PAPER_PAD_Y * 2);
          const displayLine = LBKE.runsToDisplayLine(textRuns);
          const o = {
            text: textRuns.map((r) => String(r.text || '')).join(''),
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
        const measureEmphasisStrip = (text, rank, rowMeta = null) => {
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
            emphasisMeasureFlags: flags,
            ...(rowMeta || {})
          });
          // Override text with original (pre-display-transform) keyword phrase for position lookups.
          specs[specs.length - 1].text = String(text || '');
        };
        const tryPairQuoteLine = (ln, font, lineSalt) => {
          if (!ln) return null;
          const words = ln.trim().split(/\s+/).filter(Boolean);
          const minWords = isPostLayout && stripBounds ? 2 : 3;
          if (words.length < minWords) return null;
          ctx.font = font;
          const fullW = ctx.measureText(ln).width;
          const postInnerSpan =
            isPostLayout && postStripLayoutBounds
              ? Math.max(120, postStripLayoutBounds.right - postStripLayoutBounds.left)
              : 0;
          const lim =
            postInnerSpan > 0
              ? Math.max(72, postInnerSpan * 0.48 - PAPER_PAD_X)
              : innerMaxW;
          const pairRowMaxW = postInnerSpan > 0 ? postInnerSpan * 0.94 : innerMaxW * 2;
          if (!postInnerSpan && fullW < lim * 0.22 && words.length < 5) return null;
          let best = null;
          for (let k = 1; k <= words.length - 1; k++) {
            const left = words.slice(0, k).join(' ');
            const right = words.slice(k).join(' ');
            const wL = ctx.measureText(left).width;
            const wR = ctx.measureText(right).width;
            if (wL > lim || wR > lim) continue;
            if (postInnerSpan > 0 && wL + wR > pairRowMaxW) continue;
            if (wL < 14 || wR < 14) continue;
            const imbalance = Math.abs(wL - wR);
            if (!best || imbalance < best.imbalance) best = { left, right, imbalance };
          }
          if (!best) return null;
          if (isPostLayout && stripBounds) return [best.left, best.right];
          const dch = rngDateKey.charCodeAt(lineSalt % rngDateKey.length);
          const pick = (((lineSalt * 1103515245 + 12345) ^ dch * 31) >>> 0) % 100 < 48;
          return pick ? [best.left, best.right] : null;
        };
        /** Post: pair consecutive phrase segments (comma splits) on one row when both fit. */
        const tryPairAdjacentSegmentsForPost = (segA, segB, font) => {
          if (!isPostLayout || !stripBounds || !postStripLayoutBounds || segB == null) return null;
          const lnA = wrapLines(ctx, String(segA || ''), innerMaxW);
          const lnB = wrapLines(ctx, String(segB || ''), innerMaxW);
          if (lnA.length !== 1 || lnB.length !== 1) return null;
          const textA = lnA[0].trim();
          const textB = lnB[0].trim();
          if (!textA || !textB) return null;
          ctx.font = font;
          const paperA = Math.ceil(ctx.measureText(textA).width + PAPER_PAD_X * 2 + 6);
          const paperB = Math.ceil(ctx.measureText(textB).width + PAPER_PAD_X * 2 + 6);
          const inner = postStripLayoutBounds.right - postStripLayoutBounds.left;
          const pairGap = 28;
          if (paperA + pairGap + paperB > inner * 0.96) return null;
          return [textA, textB];
        };
        const microSplitOpts = {
          isPostLayout,
          stripBounds: !!stripBounds,
          carouselRowBudget
        };
        /** Story 9:16: pack 2–4 short strips per row (comma clauses alone are too wide to pair). */
        const measureStoryUnitPaperW = (unit, font) => {
          const txt = String(unit.text || '').trim();
          if (!txt) return 0;
          const qPx = quoteFontPx();
          if (unit.inlineRuns && Array.isArray(unit.textRuns) && unit.textRuns.length && kwActive && LBKE) {
            ctx.font = font;
            odqSetLayoutBStripLetterSpacing(ctx, qPx);
            return Math.min(
              STRIP_MAX_W,
              Math.ceil(
                LBKE.measureTextRunsWidth(ctx, unit.textRuns, qPx, FONT_SERIF, kwFlags || {}) +
                  PAPER_PAD_X * 2 +
                  6
              )
            );
          }
          if (unit.emphasis && kwActive && LBKE) {
            const flags = { ...kwFlags };
            const ef = LBKE.layoutBFontForEmphasis(qPx, FONT_SERIF, flags);
            ctx.font = ef;
            odqSetLayoutBStripLetterSpacing(ctx, qPx);
            return Math.min(
              STRIP_MAX_W,
              Math.ceil(LBKE.measureTextRunsWidth(ctx, [{ text: LBKE.displayTextForRun ? LBKE.displayTextForRun(txt, flags) : txt }], qPx, FONT_SERIF, flags) + PAPER_PAD_X * 2 + 6)
            );
          }
          ctx.font = font;
          odqSetLayoutBStripLetterSpacing(ctx, qPx);
          const extraPadX = unit.isKeywordConnector ? ODQ_LAYOUT_B_KEYWORD_CONNECTOR_EXTRA_PAD : 0;
          return Math.min(
            STRIP_MAX_W,
            odqLayoutBStripPaperWidth(ctx.measureText(txt).width, PAPER_PAD_X, extraPadX)
          );
        };
        const emitStoryQuoteUnitsInRows = (units, font) => {
          const list = (units || []).filter((u) => String(u.text || '').trim());
          if (!list.length) return;
          const budget = (STORY_W - stripEdgeMargin * 2) * ODQ_LAYOUT_B_STORY_ROW_INNER_FRAC;
          const hGap = ODQ_LAYOUT_B_STORY_ROW_HGAP;
          const rowPaperW = (rowUnits) =>
            rowUnits.reduce((sum, u) => sum + measureStoryUnitPaperW(u, font), 0) +
            hGap * Math.max(0, rowUnits.length - 1);
          let ui = 0;
          while (ui < list.length) {
            const target =
              ODQ_LAYOUT_B_STORY_ROW_MIN_STRIPS +
              Math.floor(rnd() * (ODQ_LAYOUT_B_STORY_ROW_MAX_STRIPS - ODQ_LAYOUT_B_STORY_ROW_MIN_STRIPS + 1));
            const row = [list[ui++]];
            while (ui < list.length && row.length < ODQ_LAYOUT_B_STORY_ROW_MAX_STRIPS) {
              const trial = row.concat(list[ui]);
              if (rowPaperW(trial) > budget) break;
              row.push(list[ui++]);
              if (row.length >= target) break;
            }
            if (row.length >= ODQ_LAYOUT_B_STORY_ROW_MIN_STRIPS) {
              const gid = nextRowPairGroup++;
              row.forEach((unit, slot) => {
                const meta = { rowGroup: gid, rowSlot: slot };
                if (unit.inlineRuns && Array.isArray(unit.textRuns) && unit.textRuns.length) {
                  measureStripWithRuns(unit.textRuns, font, 1.38, 'quote', meta);
                }                 else if (unit.emphasis) measureEmphasisStrip(unit.text, unit.rank, meta);
                else {
                  const plainMeta = unit.isKeywordConnector
                    ? { ...meta, isKeywordConnector: true }
                    : meta;
                  measureStrip([unit.text], font, 1.38, 'quote', plainMeta);
                }
              });
            } else {
              const unit = row[0];
              if (unit.inlineRuns && Array.isArray(unit.textRuns) && unit.textRuns.length) {
                measureStripWithRuns(unit.textRuns, font, 1.38, 'quote');
              } else if (unit.emphasis) measureEmphasisStrip(unit.text, unit.rank);
              else {
                measureStrip(
                  [unit.text],
                  font,
                  1.38,
                  'quote',
                  unit.isKeywordConnector ? { isKeywordConnector: true } : null
                );
              }
            }
          }
        };
        const emitStoryQuoteTextPiecesInRows = (textPieces, font) => {
          emitStoryQuoteUnitsInRows(
            (textPieces || []).map((t) => ({ emphasis: false, text: t })),
            font
          );
        };
        const flattenSegmentsToStoryTextPieces = (segments) => {
          const out = [];
          for (const seg of segments) {
            for (const micro of odqMicroSplitSegmentForStripCollage(seg, rnd, microSplitOpts)) {
              const lines = wrapLines(ctx, micro, innerMaxW);
              for (const ln of lines) out.push(ln);
            }
          }
          return out;
        };
        /** Keyword-emphasis plain gaps must use the same comma/micro splits as normal story quotes. */
        const storyTextPiecesFromQuoteChunk = (chunkText) =>
          flattenSegmentsToStoryTextPieces(segmentQuoteForLayout(chunkText));
        const emitQuoteSegmentsForLayout = (segments) => {
          const segs = (Array.isArray(segments) ? segments : [])
            .map((s) => String(s || '').trim())
            .filter(Boolean);
          const wrapW = carouselRowBudget
            ? Math.max(120, STRIP_MAX_W - PAPER_PAD_X * 2)
            : innerMaxW;
          const carouselWrapSegmentLines = (text) => {
            const lines = wrapLines(ctx, text, wrapW);
            return lines.length ? lines : [''];
          };
          const mergedSegs = carouselRowBudget
            ? odqCarouselSpeakerMergeSegmentsToWrappedLineBudget(
                segs,
                Math.max(1, carouselMaxQuoteRows()),
                carouselWrapSegmentLines
              )
            : odqCarouselSpeakerMergeSegmentsToRowBudget(segs, carouselMaxQuoteRows());
          if (!isPostLayout) {
            emitStoryQuoteTextPiecesInRows(
              flattenSegmentsToStoryTextPieces(mergedSegs),
              bodyFont
            );
            return;
          }
          for (let si = 0; si < mergedSegs.length; ) {
            if (carouselRowBudget) {
              const band = mergedSegs[si];
              const lines = wrapLines(ctx, band, wrapW);
              for (const ln of lines) {
                measureStrip([ln], bodyFont, quoteLineLead, 'quote');
              }
              si += 1;
              continue;
            }
            const microPieces = odqMicroSplitSegmentForStripCollage(
              mergedSegs[si],
              rnd,
              microSplitOpts
            );
            if (microPieces.length === 1 && si + 1 < mergedSegs.length) {
              const adjacentPair = tryPairAdjacentSegmentsForPost(
                mergedSegs[si],
                mergedSegs[si + 1],
                bodyFont
              );
              if (adjacentPair) {
                const gid = nextRowPairGroup++;
                measureStrip([adjacentPair[0]], bodyFont, quoteLineLead, 'quote', {
                  rowGroup: gid,
                  rowSlot: 0
                });
                measureStrip([adjacentPair[1]], bodyFont, quoteLineLead, 'quote', {
                  rowGroup: gid,
                  rowSlot: 1
                });
                si += 2;
                continue;
              }
            }
            for (const piece of microPieces) {
              const lines = wrapLines(ctx, piece, wrapW);
              for (const ln of lines) emitQuoteLine(ln, bodyFont, quoteLineSalt++, quoteLineLead);
            }
            si += 1;
          }
        };
        const pairAdjacentPostQuoteSpecsInPlace = (specList) => {
          if (!isPostLayout || !postStripLayoutBounds) return specList;
          const inner = postStripLayoutBounds.right - postStripLayoutBounds.left;
          const pairGap = 28;
          let gidBase = 88000;
          const out = [];
          for (let i = 0; i < specList.length; ) {
            const a = specList[i];
            if (
              a.role !== 'quote' ||
              a.rowGroup != null ||
              a.isKeywordEmphasis ||
              a.rowSlot != null
            ) {
              out.push(a);
              i += 1;
              continue;
            }
            const b = specList[i + 1];
            if (
              b &&
              b.role === 'quote' &&
              b.rowGroup == null &&
              !b.isKeywordEmphasis &&
              b.rowSlot == null &&
              Number(a.w || 0) + pairGap + Number(b.w || 0) <= inner * 0.96
            ) {
              const gid = gidBase++;
              out.push({ ...a, rowGroup: gid, rowSlot: 0 });
              out.push({ ...b, rowGroup: gid, rowSlot: 1 });
              i += 2;
              continue;
            }
            out.push(a);
            i += 1;
          }
          return out;
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
        const emitQuoteLine = (ln, bodyFont, lineSalt, lineLead = quoteLineLead) => {
          if (!carouselRowBudget) {
            const pieces = odqMicroSplitSegmentForStripCollage(ln, rnd, microSplitOpts);
            if (pieces.length > 1) {
              for (const piece of pieces) emitQuoteLine(piece, bodyFont, lineSalt++, lineLead);
              return;
            }
          }
          if (kwActive && !kwOwnStrip) {
            const runs = emphasisRunsForLine(ln, kwKeywords);
            if (runs) {
              measureStripWithRuns(runs, bodyFont, lineLead, 'quote');
              return;
            }
          }
          if (isPostLayout && !stripBounds && !carouselRowBudget) {
            const pair = tryPairQuoteLine(ln, bodyFont, lineSalt);
            if (pair) {
              const gid = nextRowPairGroup++;
              measureStrip([pair[0]], bodyFont, lineLead, 'quote', { rowGroup: gid, rowSlot: 0 });
              measureStrip([pair[1]], bodyFont, lineLead, 'quote', { rowGroup: gid, rowSlot: 1 });
              return;
            }
          }
          measureStrip([ln], bodyFont, lineLead, 'quote');
        };
        const qPx = quoteFontPx();
        const bodyFont = `400 ${qPx}px ${FONT_SERIF}`;
        ctx.font = bodyFont;
        odqSetLayoutBStripLetterSpacing(ctx, qPx);
        let quoteLineSalt = 0;
        const layoutKeywordPart = (part) => {
          if (part.kind === 'emphasis-strip') {
            measureEmphasisStrip(part.text, part.rank);
            return;
          }
          const chunkText = String(part.text || '');
          if (!chunkText.trim()) return;
          if (part.kind === 'inline-emphasis') {
            const runs = emphasisRunsForInlinePartLine(chunkText);
            if (runs) {
              measureStripWithRuns(runs, bodyFont, 1.38, 'quote');
              return;
            }
            emitQuoteLine(chunkText, bodyFont, quoteLineSalt++);
            return;
          }
          if (part.kind === 'plain') {
            emitQuoteSegmentsForLayout(segmentQuoteForLayout(chunkText));
            return;
          }
          emitQuoteSegmentsForLayout(segmentQuoteForLayout(chunkText));
        };
        if (kwActive) {
          // Match keywords on full quote text first — strip segmentation splits long Notion phrases.
          const fullParts = LBKE.expandSegmentForKeywordEmphasis(quoteText, kwKeywords, kwStyles);
          if (carouselRowBudget) {
            carouselReservedRows = fullParts.filter((p) => {
              if (p.kind === 'inline-emphasis') return true;
              return p.kind === 'emphasis-strip' && kwOwnStrip;
            }).length;
          }
          if (!isPostLayout) {
            const storyUnits = [];
            for (const part of fullParts) {
              if (part.kind === 'emphasis-strip' && kwOwnStrip) {
                storyUnits.push({ emphasis: true, text: part.text, rank: part.rank });
                continue;
              }
              const chunkText = String(part.text || '');
              if (!chunkText.trim()) continue;
              if (part.kind === 'inline-emphasis') {
                const phrase = chunkText.trim();
                const runs = emphasisRunsForInlinePartLine(phrase);
                if (runs) {
                  storyUnits.push({
                    inlineRuns: true,
                    textRuns: runs,
                    text: LBKE.runsToDisplayLine(runs)
                  });
                } else {
                  for (const piece of storyTextPiecesFromQuoteChunk(phrase)) {
                    storyUnits.push({ emphasis: false, text: piece });
                  }
                }
                continue;
              }
              if (part.kind === 'plain') {
                for (const piece of storyTextPiecesFromQuoteChunk(chunkText)) {
                  storyUnits.push({ emphasis: false, text: piece });
                }
              }
            }
            emitStoryQuoteUnitsInRows(storyUnits, bodyFont);
          } else if (carouselRowBudget) {
            const plainSegs = [];
            for (const part of fullParts) {
              if (part.kind === 'emphasis-strip' && kwOwnStrip) {
                measureEmphasisStrip(part.text, part.rank);
                continue;
              }
              const chunkText = String(part.text || '').trim();
              if (!chunkText) continue;
              if (part.kind === 'inline-emphasis') {
                const runs = emphasisRunsForInlinePartLine(chunkText);
                if (runs) {
                  measureStripWithRuns(runs, bodyFont, quoteLineLead, 'quote');
                  continue;
                }
                plainSegs.push(chunkText);
                continue;
              }
              plainSegs.push(...segmentQuoteForLayout(chunkText));
            }
            emitQuoteSegmentsForLayout(plainSegs);
          } else {
            for (const part of fullParts) layoutKeywordPart(part);
          }
        } else {
          emitQuoteSegmentsForLayout(segmentQuoteForLayout(quoteText));
        }
        if (layoutAuthor) {
          if (postQuoteOnlyAuthor) {
            const authorSpec = odqFitLayoutBAuthorNameToOneStrip(
              ctx,
              layoutAuthor,
              bodyPx,
              innerMaxW,
              STRIP_MAX_W,
              FONT_SERIF
            );
            if (authorSpec) specs.push(authorSpec);
          } else {
            const aPx = authorFontPx();
            const authorFont = `italic 400 ${aPx}px ${FONT_SERIF}`;
            ctx.font = authorFont;
            odqSetLayoutBStripLetterSpacing(ctx, aPx);
            const authorLines = wrapLines(ctx, layoutAuthor, innerMaxW);
            for (const ln of authorLines) measureStrip([ln], authorFont, 1.38, 'author');
          }
        }
        return isPostLayout
          ? pairAdjacentPostQuoteSpecsInPlace(specs)
          : odqPackStoryQuoteStripsIntoRows(specs, {
              innerWidth: STORY_W,
              stripEdgeMargin: 40,
              pairGap: ODQ_LAYOUT_B_STORY_ROW_HGAP,
              rnd
            });
      };
      const stackContentSpan = (specs) => {
        let h = 0;
        let i = 0;
        while (i < specs.length) {
          const spec = specs[i];
          if (i > 0 && spec.role === 'author' && specs[i - 1].role === 'quote') h += layoutQuoteAuthorGap;
          const rowLen = odqLayoutBRowGroupLen(specs, i);
          if (rowLen >= 2 && spec.rowGroup != null && spec.rowSlot === 0) {
            h += odqLayoutBRowGroupMaxH(specs, i) + stackVertPad;
            i += rowLen;
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
      /** Post (4:5) in safe zone: story-like stagger bands (not a sine wave). */
      const postReadableStripStack = isPostLayout && stripBounds;
      let postQuoteRowIdx = 0;
      const storyLikeStripCenterX = (spec, pseudoWidth) => {
        const w = pseudoWidth != null ? pseudoWidth : spec.w;
        const hBounds = postStripLayoutBounds || stripBounds;
        if (postReadableStripStack && spec.role !== 'author') {
          const idx = postQuoteRowIdx++;
          const layout =
            postStripLayoutBounds ||
            (hBounds
              ? { left: hBounds.left, right: hBounds.right }
              : odqLayoutBPostStripInnerColumn(STORY_W, STORY_H));
          return odqPostStripStaggerTargetCx(
            idx,
            { w, seed: spec.seed || `plan_${idx}` },
            layout,
            rngDateKey,
            layoutVariant
          );
        }
        if (postReadableStripStack && spec.role === 'author') {
          const minCx = w / 2 + hBounds.left + 8;
          const maxCx = hBounds.right - w / 2 - 8;
          let acx = authorStripCenterX(spec);
          return Math.max(minCx, Math.min(maxCx, acx));
        }
        if (isPostLayout && hBounds) {
          const minCx = w / 2 + hBounds.left + 8;
          const maxCx = hBounds.right - w / 2 - 8;
          const mid = (hBounds.left + hBounds.right) / 2;
          const jitterSpan = Math.max(28, (hBounds.right - hBounds.left) * 0.24);
          const cx = mid + (rnd() - 0.5) * jitterSpan;
          return Math.max(minCx, Math.min(maxCx, cx));
        }
        const pseudo = pseudoWidth != null ? { w: pseudoWidth, role: spec.role || 'quote' } : spec;
        let cx = staggerStripCenterX(pseudo);
        if (stripBounds) {
          const minCx = w / 2 + stripBounds.left + 8;
          const maxCx = stripBounds.right - w / 2 - 8;
          cx = Math.max(minCx, Math.min(maxCx, cx));
        }
        return cx;
      };
      const stripTopFrac = isPostLayout ? 0.04 : 0.12;
      const requestedMaxCoverage =
        Number.isFinite(Number(maxQuoteCanvasCoverage)) && Number(maxQuoteCanvasCoverage) > 0
          ? Math.max(0.2, Math.min(1, Number(maxQuoteCanvasCoverage)))
          : null;
      const stripBudget = carouselRowBudget
        ? (() => {
            const b = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
              STORY_W,
              STORY_H,
              carouselSpeakerAvoidRect
            );
            return b ? Math.max(120, b.bottom - b.top - 26) : 900;
          })()
        : stripBounds
          ? Math.max(120, stripBounds.bottom - stripBounds.top - 20)
          : Math.min(
              usePostQuoteLayout ? STORY_H * 0.97 : STORY_H - 32,
              requestedMaxCoverage ? STORY_H * requestedMaxCoverage : Infinity
            );
      const minBodyPx =
        isPostLayout && usePostQuoteLayout
          ? ODQ_LAYOUT_B_POST_MIN_BODY_PX
          : stripBounds
            ? 22
            : !isPostLayout
              ? 36
              : 32;
      const shrinkIters = stripBounds ? 34 : (usePostQuoteLayout ? 24 : 18);
      const stripPlanTextOverflowPx = (specs) => {
        const boost = Math.max(1, Number(stripFontScale) || 1);
        let overflow = 0;
        for (const spec of specs) {
          if (spec.role !== 'quote') continue;
          const fs = parseInt(/(\d+)px/.exec(String(spec.font || ''))?.[1] || '48', 10);
          const boostedFs = Math.round(fs * boost);
          odqSetLayoutBStripLetterSpacing(ctx, boostedFs);
          let tw = 0;
          if (Array.isArray(spec.textRuns) && spec.textRuns.length && LBKE) {
            tw = LBKE.measureTextRunsWidth(
              ctx,
              spec.textRuns,
              boostedFs,
              FONT_SERIF,
              spec.emphasisMeasureFlags || kwFlags || { scale: false }
            );
          } else {
            ctx.font = String(spec.font || '').replace(/\d+px/, `${boostedFs}px`);
            for (const ln of spec.lines || []) {
              tw = Math.max(tw, ctx.measureText(String(ln || '').trim()).width);
            }
          }
          const extraPadX = Number(spec.extraPaperPadX) || 0;
          const boostedW = Math.min(
            STRIP_MAX_W,
            odqLayoutBStripPaperWidth(tw, PAPER_PAD_X, extraPadX)
          );
          const inner = boostedW - PAPER_PAD_X * 2 - extraPadX;
          overflow = Math.max(overflow, tw - inner);
        }
        return overflow;
      };
      for (let s = 0; s < shrinkIters; s++) {
        stripSpecs = buildStripSpecs();
        const stackH = stripBounds ? stackContentSpan(stripSpecs) : STORY_H * stripTopFrac + stackContentSpan(stripSpecs);
        const textOverflow = stripPlanTextOverflowPx(stripSpecs);
        const quoteRowCount = stripSpecs.filter((spec) => spec.role === 'quote').length;
        const rowBudgetOverflow =
          carouselRowBudget &&
          quoteRowCount > carouselMaxQuoteRows() + carouselReservedRows;
        if (
          (stackH <= stripBudget && textOverflow <= 0 && !rowBudgetOverflow) ||
          bodyPx <= minBodyPx
        ) {
          break;
        }
        bodyPx -= 2;
      }
      const contentSpan = stackContentSpan(stripSpecs);
      const vPadTop = isPostLayout ? 20 : 28;
      const vPadBottom = isPostLayout
        ? 22
        : speakerLayoutActive
          ? ODQ_LAYOUT_B_STORY_SPEAKER_VPAD_BOTTOM
          : 118;
      const maxCenteredSpan = STORY_H - vPadTop - vPadBottom;
      const centerJitter = speakerLayoutActive && !isPostLayout
        ? -20 + (rnd() - 0.5) * 60
        : (rnd() - 0.5) * (isPostLayout ? 72 : 96);
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
        const gap = carouselRowBudget
          ? ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP + rnd() * 2
          : requestedMaxCoverage
          ? stackVertPad
          : usePostQuoteLayout
            ? postReadableStripStack
              ? 4 + rnd() * 22
              : 6 + rnd() * 10
            : 2 + rnd() * 8;
        if (
          spec.rowGroup != null &&
          spec.rowSlot === 0 &&
          odqLayoutBRowGroupLen(stripSpecs, i) >= 2
        ) {
          const rowLen = odqLayoutBRowGroupLen(stripSpecs, i);
          const rowSpecs = stripSpecs.slice(i, i + rowLen);
          const pairHGap =
            isPostLayout && stripBounds ? 32 + rnd() * 18 : 8 + rnd() * 14;
          const totalWfix = odqLayoutBRowGroupTotalW(stripSpecs, i, pairHGap);
          const topOfRow = cursorY;
          const rowH = odqLayoutBRowGroupMaxH(stripSpecs, i);
          const pseudo = { w: totalWfix, role: 'quote' };
          const pairRowIdx = postQuoteRowIdx;
          let rowCenterX = isPostLayout
            ? storyLikeStripCenterX(rowSpecs[0], totalWfix)
            : STORY_W / 2 + (rnd() - 0.5) * (STORY_W * 0.14);
          const half = totalWfix / 2;
          const minC = stripEdgeMargin + half;
          const maxC = STORY_W - stripEdgeMargin - half;
          if (isPostLayout && stripBounds) {
            rowCenterX = storyLikeStripCenterX(rowSpecs[0], totalWfix);
          } else {
            rowCenterX = Math.max(minC, Math.min(maxC, rowCenterX));
          }
          let cursorX = rowCenterX - totalWfix / 2;
          for (let k = 0; k < rowSpecs.length; k++) {
            const rs = rowSpecs[k];
            const cx = cursorX + rs.w / 2;
            const rowTilt = postReadableStripStack
              ? odqPostStripStaggerTiltRad(pairRowIdx, rs, rngDateKey, layoutVariant) *
                (k % 2 === 0 ? 1 : -0.85)
              : (rnd() - 0.5) * 0.10;
            strips.push({
              ...rs,
              x: cx,
              y: topOfRow + rowH / 2,
              padX: PAPER_PAD_X,
              angle: rowTilt,
              seed: `${rs.role}_${i + k}`
            });
            cursorX += rs.w + pairHGap;
          }
          cursorY = topOfRow + rowH + gap;
          i += rowLen;
          continue;
        }
        let cx;
        const rowIdx = postQuoteRowIdx;
        if (isPostLayout) {
          cx = postReadableStripStack
            ? storyLikeStripCenterX(spec)
            : spec.role === 'author'
              ? (() => {
                  let acx = authorStripCenterX(spec);
                  const hBounds = postStripLayoutBounds || stripBounds;
                  if (hBounds) {
                    const minCx = spec.w / 2 + hBounds.left + 8;
                    const maxCx = hBounds.right - spec.w / 2 - 8;
                    acx = Math.max(minCx, Math.min(maxCx, acx));
                  }
                  return acx;
                })()
              : storyLikeStripCenterX(spec);
        } else if (spec.role === 'author') {
          cx = speakerLayoutActive && !isPostLayout
            ? STORY_W / 2 + (rnd() - 0.5) * 36
            : authorStripCenterX(spec);
        } else {
          cx = staggerStripCenterX(spec);
        }
        const cy = cursorY + spec.h / 2;
        cursorY += spec.h + gap;
        const stripTilt = postReadableStripStack
          ? odqPostStripStaggerTiltRad(rowIdx, spec, rngDateKey, layoutVariant)
          : (rnd() - 0.5) * 0.055;
        strips.push({
          ...spec,
          x: cx,
          y: cy,
          padX: PAPER_PAD_X,
          angle:
            spec.isKeywordEmphasis && Number.isFinite(Number(spec.keywordAngle))
              ? Number(spec.keywordAngle)
              : stripTilt,
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
          weight: Number.isFinite(Number(r?.weight)) && Number(r?.weight) > 0 ? Number(r.weight) : 1,
          forcePostAvoid: r?.forcePostAvoid === true
        }))
        .filter((r) =>
          Number.isFinite(r.x) &&
          Number.isFinite(r.y) &&
          Number.isFinite(r.width) &&
          Number.isFinite(r.height) &&
          r.width > 0 &&
          r.height > 0
        );
      const hasForcedPostAvoid = normalizedAvoidRects.some((r) => r.forcePostAvoid);
      if (
        normalizedAvoidRects.length &&
        (!(isPostLayout && stripBounds && postStripLayoutBounds) || hasForcedPostAvoid)
      ) {
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
      let out = strips;
      const stripFontScaleFactor = Math.max(1, Number(stripFontScale) || 1);
      if (stripFontScaleFactor > 1.0001 && out.length) {
        out = refitLayoutBStripPlanToText(
          boostLayoutBStripPlanTypography(out, stripFontScaleFactor, FONT_SERIF),
          ctx,
          STRIP_MAX_W,
          FONT_SERIF
        );
      }
      if (!isPostLayout && stripBounds && out.length > 1) {
        out = odqResolveLayoutBStripPlanOverlaps(out, STORY_W, STORY_H);
      }
      if (isPostLayout && stripBounds && out.length) {
        out = odqClampLayoutBStripPlanToPostSafe(out, STORY_W, STORY_H);
      }
      return out;
    }

    // Back-compat alias while call sites migrate.
    const buildLayoutBQuoteStripPlan = getLayoutBStoryQuotePlan;

    function odqCloneLayoutBStripPlan(plan) {
      return (Array.isArray(plan) ? plan : []).map((s) => ({
        ...s,
        lines: Array.isArray(s.lines) ? [...s.lines] : s.lines,
        textRuns: Array.isArray(s.textRuns) ? s.textRuns.map((r) => ({ ...r })) : s.textRuns
      }));
    }

    /** Lift quote stack above speaker portrait (plan coordinates). */
    function odqApplySpeakerStripLift(plan, canvasH) {
      const strips = Array.isArray(plan) ? plan : [];
      if (!strips.length) return strips;
      const h = Math.max(1, Number(canvasH) || 1920);
      const liftPx = Math.round(h * 0.068 * 1.15 * 1.25 * 1.25);
      for (const spec of strips) {
        spec.y -= liftPx;
      }
      const minEdge = 16;
      let minTop = Infinity;
      for (const spec of strips) {
        minTop = Math.min(minTop, spec.y - spec.h / 2);
      }
      if (minTop < minEdge) {
        const nudgeDown = minEdge - minTop;
        for (const spec of strips) {
          spec.y += nudgeDown;
        }
      }
      return strips;
    }

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

    function odqMeasureLayoutBStripTextWidth(ctx, spec, fontPx, fontSerif) {
      const LBKE = globalThis.LayoutBKeywordEmphasis;
      const px = Math.max(1, Number(fontPx) || 48);
      odqSetLayoutBStripLetterSpacing(ctx, px);
      if (Array.isArray(spec.textRuns) && spec.textRuns.length && LBKE) {
        return LBKE.measureTextRunsWidth(
          ctx,
          spec.textRuns,
          px,
          fontSerif || ODQ_CANVAS_SERIF_FONT,
          spec.emphasisMeasureFlags || { scale: false }
        );
      }
      const fontStr = String(spec.font || '');
      ctx.font = fontStr.includes('px') ? fontStr.replace(/\d+px/, `${px}px`) : `400 ${px}px ${fontSerif || ODQ_CANVAS_SERIF_FONT}`;
      let tw = 0;
      for (const ln of spec.lines || []) {
        tw = Math.max(tw, ctx.measureText(String(ln || '')).width);
      }
      return tw;
    }

    function odqLayoutBStripSpecTextOverflowPx(ctx, spec, fontSerif) {
      const PAPER_PAD_X = 26;
      const extraPadX = Number(spec.extraPaperPadX) || 0;
      const inner = Number(spec.w || 0) - PAPER_PAD_X * 2 - extraPadX - 6;
      if (inner <= 0) return Infinity;
      const px = parseInt(/(\d+)px/.exec(String(spec.font || ''))?.[1] || '48', 10);
      const tw = odqMeasureLayoutBStripTextWidth(ctx, spec, px, fontSerif);
      return Math.max(0, tw - inner);
    }

    function odqLayoutBStripPlanHasTextOverflow(strips, ctx, fontSerif) {
      for (const s of Array.isArray(strips) ? strips : []) {
        if (odqLayoutBStripSpecTextOverflowPx(ctx, s, fontSerif) > 0.5) return true;
      }
      return false;
    }

    function odqLayoutBStripPlanQuoteBodyPx(plan) {
      for (const s of Array.isArray(plan) ? plan : []) {
        if (s.role !== 'quote') continue;
        const m = /(\d+)px/.exec(String(s.font || ''));
        if (m) return parseInt(m[1], 10);
      }
      return ODQ_LAYOUT_B_POST_MIN_BODY_PX;
    }

    function odqLayoutBStripPlanMinQuoteBodyPx(plan) {
      let minPx = Infinity;
      for (const s of Array.isArray(plan) ? plan : []) {
        if (s.role !== 'quote') continue;
        const m = /(\d+)px/.exec(String(s.font || ''));
        if (m) minPx = Math.min(minPx, parseInt(m[1], 10));
      }
      return Number.isFinite(minPx) ? minPx : ODQ_LAYOUT_B_POST_MIN_BODY_PX;
    }

    function odqLayoutBStripReplaceFontPx(spec, px, fontSerif) {
      const fontStr = String(spec.font || '');
      const serif = fontSerif || ODQ_CANVAS_SERIF_FONT;
      const nextPx = Math.max(1, Math.round(Number(px) || 48));
      const newFont = fontStr.includes('px')
        ? fontStr.replace(/\d+px/, `${nextPx}px`)
        : `400 ${nextPx}px ${serif}`;
      const oldPx = parseInt(/(\d+)px/.exec(fontStr)?.[1] || '48', 10);
      const lhScale = oldPx > 0 ? nextPx / oldPx : 1;
      return {
        ...spec,
        font: newFont,
        lh: Math.max(1, Number(spec.lh || 0) * lhScale)
      };
    }

    /** Carousel slide 1: one body size for quote strips; author may be smaller. */
    function odqApplyUniformCarouselStoryBodyPx(plan, bodyPx, fontSerif, opts = {}) {
      const px = Math.max(1, Math.round(Number(bodyPx) || ODQ_LAYOUT_B_POST_MIN_BODY_PX));
      const authorPx = Number.isFinite(Number(opts.authorBodyPx))
        ? Math.max(1, Math.round(Number(opts.authorBodyPx)))
        : px;
      return (Array.isArray(plan) ? plan : []).map((s) => {
        if (s.role !== 'quote' && s.role !== 'author') return s;
        const next = odqLayoutBStripReplaceFontPx(s, s.role === 'author' ? authorPx : px, fontSerif);
        if (s.role === 'quote') {
          delete next.textRuns;
          delete next.emphasisMeasureFlags;
          delete next.isKeywordEmphasis;
          delete next.keywordAngle;
        }
        return next;
      });
    }

    function odqLayoutBWrapTextLines(ctx, text, maxWidth, fontStr, fontPx) {
      const breakLongWord = (word) => {
        const out = [];
        let piece = '';
        for (const ch of word) {
          const next = piece + ch;
          if (ctx.measureText(next).width <= maxWidth || piece === '') piece = next;
          else {
            out.push(piece);
            piece = ch;
          }
        }
        if (piece) out.push(piece);
        return out;
      };
      ctx.font = fontStr;
      odqSetLayoutBStripLetterSpacing(ctx, fontPx);
      const words = String(text || '').split(/\s+/).filter(Boolean);
      const lines = [];
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth) {
          line = test;
        } else {
          if (line) lines.push(line);
          if (ctx.measureText(word).width <= maxWidth) {
            line = word;
          } else {
            const chunks = breakLongWord(word);
            for (let cc = 0; cc < chunks.length - 1; cc++) lines.push(chunks[cc]);
            line = chunks[chunks.length - 1] || '';
          }
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [''];
    }

    function odqCarouselUniformMaybeWrapQuoteStrip(spec, ctx, px, maxInnerW, fontSerif, opts = {}) {
      const serif = fontSerif || ODQ_CANVAS_SERIF_FONT;
      const fontStr = String(spec.font || '').includes('px')
        ? String(spec.font || '').replace(/\d+px/, `${px}px`)
        : `400 ${px}px ${serif}`;
      const lineText =
        (Array.isArray(spec.lines) && spec.lines.length ? spec.lines.join(' ') : '') ||
        (Array.isArray(spec.textRuns) ? spec.textRuns.map((r) => r.text || '').join('') : '');
      if (!String(lineText || '').trim()) return { ...spec, font: fontStr };
      const wrapped = opts.noWrap === true
        ? [lineText]
        : odqLayoutBWrapTextLines(ctx, lineText, maxInnerW, fontStr, px);
      const next = {
        ...spec,
        lines: wrapped.length ? wrapped : [lineText],
        font: fontStr,
        lh: px * 1.38
      };
      delete next.textRuns;
      delete next.emphasisMeasureFlags;
      delete next.isKeywordEmphasis;
      delete next.keywordAngle;
      return next;
    }

    function odqCarouselUniformQuoteSpecForFit(spec, ctx, px, maxStripW, fontSerif, opts = {}) {
      const maxW = Math.max(120, Number(maxStripW) || 980);
      const extraPadX =
        Number(spec.extraPaperPadX) ||
        (spec.isKeywordConnector && spec.w < maxW ? ODQ_LAYOUT_B_KEYWORD_CONNECTOR_EXTRA_PAD : 0);
      const innerAtMaxW = maxW - 26 * 2 - extraPadX - 6;
      let measureSpec = odqApplyUniformCarouselStoryBodyPx([spec], px, fontSerif)[0];
      measureSpec = odqCarouselUniformMaybeWrapQuoteStrip(
        measureSpec,
        ctx,
        px,
        innerAtMaxW,
        fontSerif,
        opts
      );
      return measureSpec;
    }

    function odqCarouselQuoteBodyPxFitsAllStrips(plan, ctx, bodyPx, maxStripW, fontSerif, opts = {}) {
      const px = Math.max(1, Math.round(Number(bodyPx) || 48));
      const maxW = Math.max(120, Number(maxStripW) || 980);
      const PAPER_PAD_X = 26;
      for (const s of Array.isArray(plan) ? plan : []) {
        if (s.role !== 'quote') continue;
        const extraPadX =
          Number(s.extraPaperPadX) ||
          (s.isKeywordConnector && s.w < maxW ? ODQ_LAYOUT_B_KEYWORD_CONNECTOR_EXTRA_PAD : 0);
        const innerAtMaxW = maxW - PAPER_PAD_X * 2 - extraPadX - 6;
        const measureSpec = odqCarouselUniformQuoteSpecForFit(s, ctx, px, maxStripW, fontSerif, opts);
        if (Array.isArray(measureSpec.lines) && measureSpec.lines.length > 1) {
          const fontStr = String(measureSpec.font || '');
          ctx.font = fontStr;
          odqSetLayoutBStripLetterSpacing(ctx, px);
          for (const ln of measureSpec.lines) {
            if (ctx.measureText(String(ln || '')).width > innerAtMaxW + 0.5) return false;
          }
          continue;
        }
        const tw = odqMeasureLayoutBStripTextWidth(ctx, measureSpec, px, fontSerif);
        if (tw > innerAtMaxW + 0.5) return false;
      }
      return true;
    }

    function odqBuildUniformCarouselStoryStripPlan(plan, bodyPx, ctx, maxStripW, fontSerif, refitOpts = {}) {
      const px = Math.max(1, Math.round(Number(bodyPx) || ODQ_LAYOUT_B_POST_MIN_BODY_PX));
      const authorPx = Math.max(
        14,
        Math.round(px * ODQ_CAROUSEL_STORY_STYLE_AUTHOR_FONT_SCALE)
      );
      const maxW = Math.max(120, Number(maxStripW) || 980);
      let strips = odqApplyUniformCarouselStoryBodyPx(plan, px, fontSerif, {
        authorBodyPx: authorPx
      });
      strips = strips.map((s) => {
        if (s.role !== 'quote') return s;
        const extraPadX =
          Number(s.extraPaperPadX) ||
          (s.isKeywordConnector && s.w < maxW ? ODQ_LAYOUT_B_KEYWORD_CONNECTOR_EXTRA_PAD : 0);
        const innerAtMaxW = maxW - 26 * 2 - extraPadX - 6;
        return odqCarouselUniformMaybeWrapQuoteStrip(s, ctx, px, innerAtMaxW, fontSerif, refitOpts);
      });
      strips = refitLayoutBStripPlanToText(strips, ctx, maxStripW, fontSerif, {
        lockBodyPx: true,
        uniformBodyPx: px,
        uniformAuthorPx: authorPx,
        hardMinBodyPx: 22,
        ...refitOpts
      });
      return strips;
    }

    function odqNormalizeCarouselStoryStyleUniformTypography(plan, ctx, maxStripW, fontSerif, opts = {}) {
      const px = odqLayoutBStripPlanMinQuoteBodyPx(plan);
      const authorPx = Math.max(
        14,
        Math.round(px * ODQ_CAROUSEL_STORY_STYLE_AUTHOR_FONT_SCALE)
      );
      const maxW = Math.max(120, Number(maxStripW) || 980);
      let strips = odqApplyUniformCarouselStoryBodyPx(plan, px, fontSerif, {
        authorBodyPx: authorPx
      });
      strips = strips.map((s) => {
        if (s.role !== 'quote') return s;
        const extraPadX =
          Number(s.extraPaperPadX) ||
          (s.isKeywordConnector && s.w < maxW ? ODQ_LAYOUT_B_KEYWORD_CONNECTOR_EXTRA_PAD : 0);
        const innerAtMaxW = maxW - 26 * 2 - extraPadX - 6;
        return odqCarouselUniformMaybeWrapQuoteStrip(s, ctx, px, innerAtMaxW, fontSerif, opts);
      });
      return refitLayoutBStripPlanToText(strips, ctx, maxStripW, fontSerif, {
        lockBodyPx: true,
        uniformBodyPx: px,
        uniformAuthorPx: authorPx,
        hardMinBodyPx: 22
      });
    }

    function odqApplyCarouselStoryStyleAuthorFontScale(plan, ctx, maxStripW, fontSerif) {
      const arr = Array.isArray(plan) ? plan : [];
      if (!arr.some((s) => s.role === 'author')) return arr;
      const quotePx = odqLayoutBStripPlanQuoteBodyPx(arr);
      const authorPx = Math.max(
        14,
        Math.round(quotePx * ODQ_CAROUSEL_STORY_STYLE_AUTHOR_FONT_SCALE)
      );
      return refitLayoutBStripPlanToText(arr, ctx, maxStripW, fontSerif, {
        lockBodyPx: true,
        uniformAuthorPx: authorPx,
        paperPadY: ODQ_CAROUSEL_STRIP_PAPER_PAD_Y
      });
    }

    /** Re-measure strip paper WxH after scale so post strips hug scaled text (no story-width blank padding). */
    function refitLayoutBStripPlanToText(plan, ctx, stripMaxW, fontSerif, opts = {}) {
      const PAPER_PAD_X = 26;
      const PAPER_PAD_Y = Number.isFinite(Number(opts.paperPadY)) ? Number(opts.paperPadY) : 15;
      const capLineLead = Number(opts.capLineLead);
      const maxW = Math.max(120, Number(stripMaxW) || 980);
      const minBodyPx = Number.isFinite(Number(opts.minBodyPx))
        ? Number(opts.minBodyPx)
        : ODQ_LAYOUT_B_POST_MIN_BODY_PX;
      const floorPx = Number.isFinite(Number(opts.hardMinBodyPx))
        ? Math.min(minBodyPx, Number(opts.hardMinBodyPx))
        : minBodyPx;
      const lockBodyPx = opts.lockBodyPx === true;
      const uniformBodyPx = Number.isFinite(Number(opts.uniformBodyPx))
        ? Math.round(Number(opts.uniformBodyPx))
        : null;
      const uniformAuthorPx = Number.isFinite(Number(opts.uniformAuthorPx))
        ? Math.round(Number(opts.uniformAuthorPx))
        : null;
      const serif = fontSerif || ODQ_CANVAS_SERIF_FONT;
      return (Array.isArray(plan) ? plan : []).map((s) => {
        const origPx = parseInt(/(\d+)px/.exec(String(s.font || ''))?.[1] || '48', 10);
        const uniformRolePx =
          s.role === 'author' && uniformAuthorPx != null
            ? uniformAuthorPx
            : uniformBodyPx != null && (s.role === 'quote' || s.role === 'author')
              ? uniformBodyPx
              : null;
        let refitPx =
          uniformRolePx != null
            ? uniformRolePx
            : origPx;
        let fontStr = String(s.font || '');
        if (uniformRolePx != null) {
          fontStr = fontStr.includes('px')
            ? fontStr.replace(/\d+px/, `${uniformRolePx}px`)
            : `400 ${uniformRolePx}px ${serif}`;
        }
        const extraPadX =
          Number(s.extraPaperPadX) ||
          (s.isKeywordConnector && s.w < maxW ? ODQ_LAYOUT_B_KEYWORD_CONNECTOR_EXTRA_PAD : 0);
        const innerAtMaxW = maxW - PAPER_PAD_X * 2 - extraPadX - 6;
        let tw = odqMeasureLayoutBStripTextWidth(ctx, s, refitPx, serif);
        if (!lockBodyPx) {
          while (tw > innerAtMaxW && refitPx > floorPx) {
            refitPx -= 1;
            fontStr = fontStr.includes('px')
              ? fontStr.replace(/\d+px/, `${refitPx}px`)
              : `400 ${refitPx}px ${serif}`;
            tw = odqMeasureLayoutBStripTextWidth(ctx, s, refitPx, serif);
          }
        }
        const lhRaw = Math.max(1, Number(s.lh || 0));
        const lhScale = origPx > 0 ? refitPx / origPx : 1;
        const lhScaled = lhRaw * lhScale;
        const lh =
          Number.isFinite(capLineLead) && capLineLead > 0
            ? Math.min(lhScaled, refitPx * capLineLead)
            : lhScaled;
        const lineCount = Math.max(1, Array.isArray(s.lines) ? s.lines.length : 1);
        const w = Math.min(maxW, odqLayoutBStripPaperWidth(tw, PAPER_PAD_X, extraPadX));
        const h = Math.ceil(lineCount * lh + PAPER_PAD_Y * 2);
        return { ...s, font: fontStr, w, h, lh };
      });
    }

    function odqLayoutBPostStripSpreadBounds(layoutW, layoutH, opts = {}) {
      const safe = opts.carouselSpeakerAvoidRect
        ? odqLayoutBPostGridSafeRectForCarouselSpeaker(
            layoutW,
            layoutH,
            opts.carouselSpeakerAvoidRect
          )
        : odqLayoutBPostGridSafeRect(layoutW, layoutH, 8);
      if (!safe) {
        const h = Math.max(1, Number(layoutH) || 1350);
        return { boundsTop: 40, boundsBottom: h - 48 };
      }
      return {
        boundsTop: safe.y + 14,
        boundsBottom: safe.y + safe.height - 16
      };
    }

    /** Quote layout rows: one strip or one side-by-side pair counts as one row. */
    function odqCountLayoutBQuoteLayoutRows(specs) {
      const arr = Array.isArray(specs) ? specs : [];
      let count = 0;
      for (let i = 0; i < arr.length; ) {
        if (arr[i].role === 'author') {
          i += 1;
          continue;
        }
        if (
          arr[i].rowGroup != null &&
          arr[i].rowSlot === 0 &&
          odqLayoutBRowGroupLen(arr, i) >= 2
        ) {
          count += 1;
          i += odqLayoutBRowGroupLen(arr, i);
        } else {
          count += 1;
          i += 1;
        }
      }
      return count;
    }

    /** Group strip-plan entries that share a row (side-by-side pairs). */
    function odqGroupLayoutBStripPlanRows(plan) {
      const sorted = (Array.isArray(plan) ? plan : [])
        .slice()
        .sort((a, b) => Number(a.y || 0) - Number(b.y || 0));
      const rows = [];
      for (const s of sorted) {
        const hit = rows.find((row) => Math.abs(Number(row[0].y || 0) - Number(s.y || 0)) < 14);
        if (hit) hit.push(s);
        else rows.push([s]);
      }
      return rows;
    }

    /** Reading-order rows: one side-by-side pair per row; never merge separate strips by Y proximity. */
    function odqGroupLayoutBStripPlanRowsByReadingOrder(plan) {
      const arr = Array.isArray(plan) ? plan : [];
      const rows = [];
      for (let i = 0; i < arr.length; ) {
        const spec = arr[i];
        if (
          spec.rowGroup != null &&
          spec.rowSlot === 0 &&
          odqLayoutBRowGroupLen(arr, i) >= 2
        ) {
          const rowLen = odqLayoutBRowGroupLen(arr, i);
          rows.push(arr.slice(i, i + rowLen));
          i += rowLen;
        } else {
          rows.push([spec]);
          i += 1;
        }
      }
      return rows;
    }

    /**
     * Post 4:5: stack strip rows top-to-bottom with guaranteed separation (carousel / tight columns).
     */
    function odqStackLayoutBStripPlanByReadingOrder(plan, layoutW, layoutH, opts = {}) {
      const strips = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));
      if (!strips.length) return strips;
      const bounds = odqLayoutBPostStripSpreadBounds(layoutW, layoutH, opts);
      const top = Number.isFinite(opts.boundsTop) ? opts.boundsTop : bounds.boundsTop;
      const bottom = Number.isFinite(opts.boundsBottom) ? opts.boundsBottom : bounds.boundsBottom;
      let minRowGap = Number.isFinite(opts.minRowGap) ? opts.minRowGap : 10;
      let authorGap = Number.isFinite(opts.authorGap)
        ? opts.authorGap
        : ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_POST_BOUNDED;
      const rows = odqGroupLayoutBStripPlanRowsByReadingOrder(strips);
      const gapForRow = (rowIndex) => {
        if (rowIndex <= 0) return 0;
        const prevQuote = rows[rowIndex - 1].some((s) => s.role === 'quote');
        const curAuthor = rows[rowIndex].some((s) => s.role === 'author');
        return prevQuote && curAuthor ? authorGap : minRowGap;
      };
      const measureStackBottom = () => {
        let prevBottom = top;
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          let rowHalfH = 0;
          for (const s of row) {
            const ar = odqStripPlanAxisRect({ ...s, y: 0 }, 8);
            rowHalfH = Math.max(rowHalfH, Math.max(-ar.top, ar.bottom));
          }
          const centerY = r === 0 ? top + rowHalfH : prevBottom + gapForRow(r) + rowHalfH;
          for (const s of row) s.y = centerY;
          const rowBottom = centerY + rowHalfH;
          prevBottom = rowBottom;
        }
        return prevBottom;
      };
      while (measureStackBottom() > bottom && minRowGap > 6) {
        minRowGap = Math.max(6, minRowGap - 2);
        authorGap = Math.max(32, authorGap - 4);
      }
      measureStackBottom();
      return strips;
    }

    function odqLayoutBStripPlanStackBottom(plan, layoutW, layoutH, opts = {}) {
      const bounds = odqLayoutBPostStripSpreadBounds(layoutW, layoutH, opts);
      const rows = odqGroupLayoutBStripPlanRowsByReadingOrder(plan);
      if (!rows.length) return bounds.boundsTop;
      let prevBottom = bounds.boundsTop;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        let rowHalfH = 0;
        let centerY = 0;
        for (const s of row) {
          centerY = Number(s.y || 0);
          const ar = odqStripPlanAxisRect(s, 8);
          rowHalfH = Math.max(rowHalfH, centerY - ar.top, ar.bottom - centerY);
        }
        prevBottom = centerY + rowHalfH;
      }
      return prevBottom;
    }

    function odqLayoutBStripPlanFitsPostSpreadBounds(plan, layoutW, layoutH, opts = {}) {
      const bounds = odqLayoutBPostStripSpreadBounds(layoutW, layoutH, opts);
      if (opts.carouselSpeakerAvoidRect) {
        let laid = odqApplyCarouselSpeakerStripFlowLayout(
          (Array.isArray(plan) ? plan : []).map((s) => ({ ...s })),
          layoutW,
          layoutH,
          {
            carouselSpeakerAvoidRect: opts.carouselSpeakerAvoidRect,
            quoteText: opts.quoteText
          }
        );
        if (
          opts.quoteText &&
          typeof globalThis.odqCarouselSpeakerRestackQuoteStripsVertically === 'function'
        ) {
          const scatterBounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
            layoutW,
            layoutH,
            opts.carouselSpeakerAvoidRect
          );
          const quotes = laid.filter((s) => s.role !== 'author');
          const authors = laid.filter((s) => s.role === 'author');
          const authorCutoutLabel = opts.authorCutoutLabel === true;
          globalThis.odqCarouselSpeakerRestackQuoteStripsVertically(
            quotes,
            scatterBounds,
            opts.carouselSpeakerAvoidRect,
            opts.quoteText,
            '',
            0,
            authorCutoutLabel
              ? { minGap: ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP, authorCutoutLabel: true }
              : {
                  minGap: ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP,
                  authorReserve: authors.length
                    ? Math.max(...authors.map((a) => odqStripPlanFootprintH(a, 8))) + 52
                    : 0
                }
          );
          laid = [...quotes, ...authors];
          if (authorCutoutLabel && globalThis.odqCarouselSpeakerAnchorAuthorCutoutLabel) {
            laid = globalThis.odqCarouselSpeakerAnchorAuthorCutoutLabel(
              laid,
              layoutW,
              layoutH,
              opts.carouselSpeakerAvoidRect,
              {}
            );
          }
        }
        let maxBottom = bounds.boundsTop;
        for (const s of laid) {
          if (s.role === 'author' && s.authorCutoutLabel) continue;
          maxBottom = Math.max(maxBottom, odqStripPlanAxisRect(s, 8).bottom);
        }
        if (opts.authorCutoutLabel === true) {
          return maxBottom <= bounds.boundsBottom - 12;
        }
        const authors = (Array.isArray(plan) ? plan : []).filter((s) => s.role === 'author');
        const authorReserve = authors.length
          ? Math.max(...authors.map((a) => odqStripPlanFootprintH(a, 8))) + 52
          : 0;
        return maxBottom + authorReserve <= bounds.boundsBottom + 1;
      }
      return odqLayoutBStripPlanStackBottom(plan, layoutW, layoutH, opts) <= bounds.boundsBottom + 1;
    }

    /**
     * Post 4:5: spread strip rows to use vertical space (story→post scale compresses gaps).
     * Preserves horizontal positions; only reflows Y centers.
     */
    function odqSpreadLayoutBStripPlanVertically(plan, layoutW, layoutH, opts = {}) {
      const strips = Array.isArray(plan) ? plan.slice() : [];
      if (strips.length < 2) return strips;
      const bounds = odqLayoutBPostStripSpreadBounds(layoutW, layoutH, opts);
      const top = Number.isFinite(opts.boundsTop) ? opts.boundsTop : bounds.boundsTop;
      const bottom = Number.isFinite(opts.boundsBottom) ? opts.boundsBottom : bounds.boundsBottom;
      const minRowGap = Number.isFinite(opts.minRowGap) ? opts.minRowGap : 10;
      const authorGap = Number.isFinite(opts.authorGap)
        ? opts.authorGap
        : ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_POST_BOUNDED;
      const rows = opts.readingOrderRows
        ? odqGroupLayoutBStripPlanRowsByReadingOrder(strips)
        : odqGroupLayoutBStripPlanRows(strips);
      const rowHeights = rows.map((row) => Math.max(...row.map((s) => Number(s.h || 0))));
      let effMinGap = minRowGap;
      let effAuthorGap = authorGap;
      const rowHeightsSum = rowHeights.reduce((sum, h) => sum + h, 0);
      const totalSpan = (gapFn) =>
        rowHeightsSum + rowHeights.reduce((sum, _h, i) => sum + (i > 0 ? gapFn(i) : 0), 0);
      const gapWithEff = (i) => {
        if (i <= 0) return 0;
        const prevQuote = rows[i - 1].some((s) => s.role === 'quote');
        const curAuthor = rows[i].some((s) => s.role === 'author');
        return prevQuote && curAuthor ? effAuthorGap : effMinGap;
      };
      let total = totalSpan(gapWithEff);
      const avail = Math.max(1, bottom - top);
      while (total > avail && effMinGap > 4) {
        effMinGap = Math.max(4, effMinGap - 3);
        effAuthorGap = Math.max(24, effAuthorGap - 6);
        total = totalSpan(gapWithEff);
      }
      let cursor;
      if (total > avail) {
        cursor = top;
        const gapBudget = Math.max(0, avail - rowHeightsSum);
        let naturalGapTotal = 0;
        for (let i = 1; i < rows.length; i++) naturalGapTotal += gapWithEff(i);
        const gapScale = naturalGapTotal > 0 ? gapBudget / naturalGapTotal : 0;
        for (let r = 0; r < rows.length; r++) {
          const rowH = rowHeights[r];
          const centerY = cursor + rowH / 2;
          for (const s of rows[r]) s.y = centerY;
          if (r < rows.length - 1) {
            cursor += rowH + Math.max(6, gapWithEff(r + 1) * gapScale);
          }
        }
      } else {
        cursor = top + Math.max(0, (avail - total) / 2);
        for (let r = 0; r < rows.length; r++) {
          const rowH = rowHeights[r];
          const centerY = cursor + rowH / 2;
          for (const s of rows[r]) s.y = centerY;
          if (r < rows.length - 1) cursor += rowH + gapWithEff(r + 1);
        }
      }
      return strips;
    }

    function odqShrinkLayoutBStripHorizontalBounds(bounds, frac) {
      const f = Math.max(0.4, Math.min(1, Number(frac) || 1));
      const span = Math.max(1, bounds.right - bounds.left);
      const innerW = span * f;
      const left = bounds.left + (span - innerW) / 2;
      return { left, top: bounds.top, right: left + innerW, bottom: bounds.bottom };
    }

    function odqStripPlanAxisRect(spec, pad = 14) {
      const angle = Number(spec.angle || 0);
      const cos = Math.abs(Math.cos(angle));
      const sin = Math.abs(Math.sin(angle));
      const hw = Math.max(10, Number(spec.w || 20) / 2);
      const hh = Math.max(8, Number(spec.h || 20) / 2);
      const ex = hw * cos + hh * sin + pad;
      const ey = hw * sin + hh * cos + pad;
      const cx = Number(spec.x || 0);
      const cy = Number(spec.y || 0);
      return { left: cx - ex, right: cx + ex, top: cy - ey, bottom: cy + ey };
    }

    function odqCarouselSpeakerSeparateStripVertical(top, bottom, gap, pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD) {
      const topR = odqStripPlanAxisRect(top, pad);
      const bottomR = odqStripPlanAxisRect(bottom, pad);
      const need = topR.bottom + gap - bottomR.top;
      if (need > 0) {
        bottom.y = Number(bottom.y || 0) + need;
        return true;
      }
      return false;
    }

    function odqCarouselSpeakerSeparateStripHorizontal(left, right, gap, pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD) {
      const leftR = odqStripPlanAxisRect(left, pad);
      const rightR = odqStripPlanAxisRect(right, pad);
      const need = leftR.right + gap - rightR.left;
      if (need > 0) {
        right.x = Number(right.x || 0) + need;
        return true;
      }
      return false;
    }

    function odqStripPlanCarouselTextOverlaps(a, b, pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD) {
      const ra = odqStripPlanAxisRect(a, pad);
      const rb = odqStripPlanAxisRect(b, pad);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      return ox > 0 && oy > 0;
    }

    /** First reading-order rowGroup pair (e.g. opener + next phrase) — tightest column, skip collage tighten. */
    function odqCarouselSpeakerIsLeadQuotePair(a, b) {
      return (
        a &&
        b &&
        a.role !== 'author' &&
        b.role !== 'author' &&
        a.rowGroup != null &&
        a.rowGroup === b.rowGroup &&
        a.rowSlot === 0 &&
        b.rowSlot === 1
      );
    }

    /** Keyword emphasis can emit strips out of quote order — sort rows + slots by position in source text. */
    function odqSortCarouselQuoteStripsByTextOrder(quotes, quoteText) {
      const src = String(quoteText || '').toLowerCase();
      if (!src.trim()) return quotes;
      const stripText = (s) =>
        String(s.text || (Array.isArray(s.lines) ? s.lines.join(' ') : '') || '')
          .trim()
          .toLowerCase();
      const posOf = (s) => {
        const t = stripText(s);
        if (!t) return Number.MAX_SAFE_INTEGER;
        let idx = src.indexOf(t);
        if (idx >= 0) return idx;
        if (t.length > 10) {
          idx = src.indexOf(t.slice(0, 10));
          if (idx >= 0) return idx;
        }
        for (const w of t.split(/\s+/).filter((word) => word.length > 3)) {
          idx = src.indexOf(w);
          if (idx >= 0) return idx;
        }
        return Number.MAX_SAFE_INTEGER;
      };
      const rows = odqGroupLayoutBStripPlanRowsByReadingOrder(quotes);
      rows.sort((a, b) => {
        const minA = Math.min(...a.map(posOf));
        const minB = Math.min(...b.map(posOf));
        return minA - minB;
      });
      for (const row of rows) {
        row.sort((a, b) => posOf(a) - posOf(b) || (a.rowSlot ?? 0) - (b.rowSlot ?? 0));
      }
      return rows.flat();
    }

    /** Usable strip width beside the cutout at mid-panel (worst-case shelf). */
    function odqCarouselSpeakerColumnMaxWidth(layoutW, layoutH, speakerRect) {
      const bounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
        layoutW,
        layoutH,
        speakerRect
      );
      if (!bounds || !speakerRect) return 520;
      const midY = (bounds.top + bounds.bottom) / 2;
      const halfBand = 44;
      const maxRight = odqCarouselSpeakerRowMaxRight(
        bounds,
        speakerRect,
        midY - halfBand,
        midY + halfBand,
        ODQ_CAROUSEL_SPEAKER_AVOID_PAD
      );
      return Math.max(160, maxRight - bounds.left - 36);
    }

    /** How many vertical quote rows fit beside the cutout (author on cutout label). */
    function odqCarouselSpeakerEstimateMaxQuoteRows(layoutW, layoutH, speakerRect, opts = {}) {
      const bounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
        layoutW,
        layoutH,
        speakerRect
      );
      if (!bounds) return 6;
      const authorReserve = opts.authorCutoutLabel !== false ? 16 : 56;
      const stackBottom = bounds.bottom - authorReserve - 10;
      const stackTop = bounds.top + 12;
      const avail = Math.max(80, stackBottom - stackTop);
      const fs = Math.max(16, Number(opts.bodyPx) || 48);
      const lh = fs * ODQ_CAROUSEL_LONG_QUOTE_LINE_LEAD;
      const stripH = lh + ODQ_CAROUSEL_STRIP_PAPER_PAD_Y * 2;
      const gap = Math.max(4, ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP);
      const stackSlot = stripH + ODQ_CAROUSEL_STRIP_STACK_PAD * 2 + gap;
      const reserved = Math.max(0, Number(opts.reservedRows) || 0);
      const totalCap = Math.max(3, Math.min(8, Math.floor(avail / stackSlot)));
      return Math.max(1, totalCap - reserved);
    }

    /** Merge adjacent phrase segments until count <= maxRows (shortest pairs first). */
    function odqCarouselSpeakerMergeSegmentsToRowBudget(segments, maxRows) {
      let segs = (Array.isArray(segments) ? segments : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean);
      if (!segs.length || segs.length <= maxRows) return segs;
      while (segs.length > maxRows) {
        let bestIdx = 0;
        let bestScore = Infinity;
        for (let i = 0; i < segs.length - 1; i++) {
          const combined = segs[i].length + segs[i + 1].length;
          const score =
            combined +
            (segs[i].length < 24 ? 0 : 12) +
            (segs[i + 1].length < 24 ? 0 : 12);
          if (score < bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
        segs[bestIdx] = `${segs[bestIdx]} ${segs[bestIdx + 1]}`.replace(/\s+/g, ' ').trim();
        segs.splice(bestIdx + 1, 1);
      }
      return segs;
    }

    /** Merge phrase segments until wrapped line strips fit the vertical budget (shortest pairs first). */
    function odqCarouselSpeakerMergeSegmentsToWrappedLineBudget(segments, maxLines, wrapSegment) {
      let segs = (Array.isArray(segments) ? segments : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean);
      if (!segs.length || typeof wrapSegment !== 'function') return segs;
      const lineCount = () =>
        segs.reduce((n, seg) => n + Math.max(1, wrapSegment(seg).length), 0);
      while (segs.length > 1 && lineCount() > maxLines) {
        let bestIdx = 0;
        let bestScore = Infinity;
        for (let i = 0; i < segs.length - 1; i++) {
          const combined = segs[i].length + segs[i + 1].length;
          const score =
            combined +
            (segs[i].length < 24 ? 0 : 12) +
            (segs[i + 1].length < 24 ? 0 : 12);
          if (score < bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
        segs[bestIdx] = `${segs[bestIdx]} ${segs[bestIdx + 1]}`.replace(/\s+/g, ' ').trim();
        segs.splice(bestIdx + 1, 1);
      }
      return segs;
    }

    /** Merge phrase segments until wrapped line strips fit the vertical budget (shortest pairs first). */
    function odqCarouselSpeakerMergeSegmentsToWrappedLineBudget(segments, maxLines, wrapSegment) {
      let segs = (Array.isArray(segments) ? segments : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean);
      if (!segs.length || typeof wrapSegment !== 'function') return segs;
      const lineCount = () =>
        segs.reduce((n, seg) => n + Math.max(1, wrapSegment(seg).length), 0);
      while (segs.length > 1 && lineCount() > maxLines) {
        let bestIdx = 0;
        let bestScore = Infinity;
        for (let i = 0; i < segs.length - 1; i++) {
          const combined = segs[i].length + segs[i + 1].length;
          const score =
            combined +
            (segs[i].length < 24 ? 0 : 12) +
            (segs[i + 1].length < 24 ? 0 : 12);
          if (score < bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
        segs[bestIdx] = `${segs[bestIdx]} ${segs[bestIdx + 1]}`.replace(/\s+/g, ' ').trim();
        segs.splice(bestIdx + 1, 1);
      }
      return segs;
    }

    /** After cutout/overlap solvers: quote strips must not sit above an earlier phrase in the source text. */
    function odqCarouselSpeakerEnforceMonotonicTextOrderY(quotes, quoteText, minGap = ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP) {
      const src = String(quoteText || '').trim();
      if (!src || !Array.isArray(quotes) || !quotes.length) return quotes;
      const pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD;
      const gap = Math.max(ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP, Number(minGap) || ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP);
      const sorted = odqSortCarouselQuoteStripsByTextOrder(quotes, quoteText);
      let prevBottom = -Infinity;
      for (const s of sorted) {
        const r = odqStripPlanAxisRect(s, pad);
        if (r.top < prevBottom + gap - 1) {
          s.y = Number(s.y || 0) + (prevBottom + gap - r.top);
        }
        prevBottom = Math.max(prevBottom, odqStripPlanAxisRect(s, pad).bottom);
      }
      return quotes;
    }

    /** Separate stacked quote strips using draw bleed (shadow/paper), not just text-safe pad. */
    function odqCarouselSpeakerEnforceQuoteStackVisualGap(
      quotes,
      quoteText,
      minGap = ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP
    ) {
      const visualPad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD + ODQ_CAROUSEL_STRIP_DRAW_BLEED;
      const gap = Math.max(8, Number(minGap) || ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP);
      const sorted = odqSortCarouselQuoteStripsByTextOrder(quotes, quoteText);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        const need =
          odqStripPlanAxisRect(prev, visualPad).bottom +
          gap -
          odqStripPlanAxisRect(cur, visualPad).top;
        if (need > 0) {
          cur.y = Number(cur.y || 0) + need;
        }
      }
      return quotes;
    }

    function odqCarouselLongQuoteRefitOpts() {
      return {
        paperPadY: ODQ_CAROUSEL_STRIP_PAPER_PAD_Y,
        capLineLead: ODQ_CAROUSEL_LONG_QUOTE_LINE_LEAD
      };
    }

    /** Shorter strip bodies so long carousel quotes fit without crowding the bottom rows. */
    function odqCompactCarouselLongQuoteStripTypography(plan) {
      return (Array.isArray(plan) ? plan : []).map((s) => {
        if (s.role === 'author') return s;
        const fs = parseInt(/(\d+)px/.exec(String(s.font || ''))?.[1] || '48', 10);
        const targetLh = fs * ODQ_CAROUSEL_LONG_QUOTE_LINE_LEAD;
        const lineCount = Math.max(1, Array.isArray(s.lines) ? s.lines.length : 1);
        const h = Math.ceil(lineCount * targetLh + ODQ_CAROUSEL_STRIP_PAPER_PAD_Y * 2);
        return { ...s, lh: targetLh, h };
      });
    }

    /** Scale carousel quote strip typography to fit the vertical stack (factor < 1 shrinks). */
    function odqScaleCarouselQuoteStripPlanTypography(plan, factor, fontSerif) {
      const f = Math.max(0.72, Math.min(1.35, Number(factor) || 1));
      if (Math.abs(f - 1) < 0.004) return Array.isArray(plan) ? plan : [];
      const serif = fontSerif || ODQ_CANVAS_SERIF_FONT;
      return (Array.isArray(plan) ? plan : []).map((s) => {
        if (s.role === 'author') return s;
        const fontStr = String(s.font || '');
        const fontPxMatch = /(\d+)px/.exec(fontStr);
        const basePx = fontPxMatch ? parseInt(fontPxMatch[1], 10) : 48;
        const scaledPx = Math.max(20, Math.round(basePx * f));
        const scaledFont = fontStr.includes('px')
          ? fontStr.replace(/\d+px/, `${scaledPx}px`)
          : `400 ${scaledPx}px ${serif}`;
        return {
          ...s,
          font: scaledFont,
          lh: Math.max(1, Number(s.lh || 0) * f),
          w: Math.max(20, Math.round(Number(s.w || 20) * f)),
          h: Math.max(20, Math.round(Number(s.h || 20) * f))
        };
      });
    }

    function odqResolveCarouselStoryStyleSpeakerSeamRect(img, layoutW, layoutH, shortQuote) {
      const resolve =
        globalThis.resolveCarouselSpeakerSeamRect ||
        globalThis.IgContributorCarouselCompose?.resolveCarouselSpeakerSeamRect;
      if (typeof resolve !== 'function' || !img) return null;
      return resolve(layoutW, layoutH, img, undefined, { shortQuote: shortQuote === true });
    }

    function odqCarouselStoryStyleSpeakerRectToComposeMeta(seamRect) {
      if (!seamRect) return null;
      const width = Math.round(Number(seamRect.width));
      const overlap = Math.max(
        0.12,
        Math.min(0.38, Number(seamRect.overlapFraction) || 0.28)
      );
      const overlapPx = Math.max(
        1,
        Math.round(width * overlap)
      );
      return {
        x: seamRect.x,
        y: seamRect.y,
        width,
        height: seamRect.height,
        angle: Number(seamRect.angle || 0),
        contentX: seamRect.contentX,
        contentY: seamRect.contentY,
        contentWidth: seamRect.contentWidth,
        contentHeight: seamRect.contentHeight,
        overlapFraction: overlap,
        overlapPx
      };
    }

    /** After nudge/scale, keep seam overlap in sync with the drawn speaker rect. */
    function odqCarouselStoryStyleSpeakerRectAfterTransform(speakerRect, seamRectForMeta) {
      if (!speakerRect) return null;
      const out = { ...speakerRect };
      if (!seamRectForMeta) return out;
      const overlap = Math.max(
        0.12,
        Math.min(0.38, Number(seamRectForMeta.overlapFraction) || 0.28)
      );
      out.overlapFraction = overlap;
      out.overlapPx = Math.max(1, Math.round(Number(speakerRect.width) * overlap));
      if (seamRectForMeta.width > 0 && Number.isFinite(seamRectForMeta.contentX)) {
        const ratio = Number(speakerRect.width) / seamRectForMeta.width;
        out.contentX = Math.round(
          Number(speakerRect.x) + (seamRectForMeta.contentX - seamRectForMeta.x) * ratio
        );
        out.contentY = Math.round(
          Number(speakerRect.y) + (seamRectForMeta.contentY - seamRectForMeta.y) * ratio
        );
        out.contentWidth = Math.round(seamRectForMeta.contentWidth * ratio);
        out.contentHeight = Math.round(seamRectForMeta.contentHeight * ratio);
      }
      return out;
    }

    /**
     * Long carousel quotes: one strip per row, uniform vertical gap, light horizontal stagger.
     * Replaces rowGroup side-by-side packing that caused bottom overlap and uneven gaps.
     */
    function odqCarouselSpeakerRestackQuoteStripsVertically(
      quotes,
      bounds,
      speakerRect,
      quoteText,
      layoutSeed = '',
      stripLayoutSeed = 0,
      opts = {}
    ) {
      if (!Array.isArray(quotes) || !quotes.length || !bounds) return quotes;
      const pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD;
      const visualPad = pad + ODQ_CAROUSEL_STRIP_DRAW_BLEED;
      const stackPad = ODQ_CAROUSEL_STRIP_STACK_PAD;
      let gap = Math.max(
        2,
        Number(opts.minGap) || ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP
      );
      const authorReserve = (() => {
        if (opts.authorCutoutLabel) {
          return Math.max(0, Number(opts.authorReserve) || 16);
        }
        const authorStrips = Array.isArray(opts.authors) ? opts.authors : [];
        if (authorStrips.length) {
          return (
            Math.max(...authorStrips.map((a) => odqStripPlanFootprintH(a, pad))) +
            Math.max(ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP, 56)
          );
        }
        return Math.max(0, Number(opts.authorReserve) || 0);
      })();
      const stackBottom = opts.authorCutoutLabel
        ? Number(bounds.bottom) - 4
        : Number(bounds.bottom) - authorReserve - 10;
      const sorted = odqSortCarouselQuoteStripsByTextOrder(quotes, quoteText);
      const speakerPad = ODQ_CAROUSEL_SPEAKER_AVOID_PAD;
      const bandLeft = bounds.left + 20;
      const stripVisualSpan = (s) => {
        const ar = odqStripPlanAxisRect(s, stackPad);
        return ar.bottom - ar.top;
      };
      const stackFootprintOf = (list) =>
        (Array.isArray(list) ? list : []).reduce((sum, s) => sum + stripVisualSpan(s), 0);
      const stackSpan = (list, rowGap) => {
        const footprint = stackFootprintOf(list);
        return bounds.top + 12 + footprint + rowGap * Math.max(0, list.length - 1);
      };
      let stackFootprint = stackFootprintOf(sorted);
      while (stackSpan(sorted, gap) > stackBottom && gap > 2) {
        gap = Math.max(2, gap - 1);
      }
      const stackNeed = stackFootprint + gap * Math.max(0, sorted.length - 1);
      const stackAvail = Math.max(40, stackBottom - (bounds.top + 12));
      if (stackNeed > stackAvail && sorted.length > 1) {
        const scale = Math.max(
          0.72,
          (stackAvail - gap * Math.max(0, sorted.length - 1)) / Math.max(1, stackFootprint)
        );
        const scaled = odqScaleCarouselQuoteStripPlanTypography(sorted, scale, ODQ_CANVAS_SERIF_FONT);
        sorted.splice(0, sorted.length, ...scaled);
        stackFootprint = stackFootprintOf(sorted);
        while (stackSpan(sorted, gap) > stackBottom && gap > 2) {
          gap = Math.max(2, gap - 1);
        }
      }

      let visualTop = bounds.top + 12;
      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        s.angle =
          odqPostStripStaggerTiltRad(i, s, layoutSeed, stripLayoutSeed) *
          (opts.authorCutoutLabel ? 0.42 : 1);
        const fh = odqStripPlanFootprintH(s, pad);
        const fw = odqStripPlanFootprintW(s, pad);
        const rowTop = visualTop;
        const rowBottom = rowTop + fh;
        const maxRight = odqCarouselSpeakerRowMaxRight(
          bounds,
          speakerRect,
          rowTop,
          rowBottom,
          speakerPad
        );
        const hash = odqPostStripStaggerHash(
          layoutSeed,
          stripLayoutSeed,
          i * 3 + 1,
          s?.seed || 'carousel_vstack'
        );
        const roll = odqPostStripStaggerRoll(hash, 3);
        const bandSpan = Math.max(8, maxRight - bandLeft - fw);
        let cx = bandLeft + fw / 2 + roll * Math.min(40, bandSpan * 0.18);
        cx = Math.max(bandLeft + fw / 2 + 4, Math.min(maxRight - fw / 2 - 4, cx));
        s.x = cx;
        s.y = visualTop + fh / 2 + stackPad;
        {
          const ar = odqStripPlanAxisRect(s, stackPad);
          s.y += visualTop - ar.top;
        }
        if (speakerRect) {
          for (let pass = 0; pass < 8 && odqStripPlanOverlapsCarouselSpeaker(s, speakerRect); pass++) {
            s.x -= 16;
            s.x = Math.max(bandLeft + fw / 2 + 4, s.x);
          }
        }
        visualTop = odqStripPlanAxisRect(s, stackPad).bottom + gap;
      }

      let maxStackBottom = -Infinity;
      let minStackTop = Infinity;
      for (const s of sorted) {
        const ar = odqStripPlanAxisRect(s, visualPad);
        maxStackBottom = Math.max(maxStackBottom, ar.bottom);
        minStackTop = Math.min(minStackTop, ar.top);
      }
      if (maxStackBottom > stackBottom) {
        const overflow = maxStackBottom - stackBottom;
        const maxShiftUp = Math.max(0, minStackTop - bounds.top - 6);
        const dy = Math.min(overflow, maxShiftUp);
        if (dy > 0) {
          for (const s of sorted) {
            s.y = Number(s.y || 0) - dy;
          }
        }
      }
      return quotes;
    }

    /** Place author strip below all quote strips (text-safe); lift quotes if the band overflows. */
    function odqCarouselSpeakerEnsureAuthorBelowQuotes(plan, layoutW, layoutH, speakerRect, opts = {}) {
      const authors = (Array.isArray(plan) ? plan : []).filter((s) => s.role === 'author');
      const quotes = (Array.isArray(plan) ? plan : []).filter((s) => s.role !== 'author');
      if (!authors.length || !quotes.length) return plan;
      const quoteText = String(opts.quoteText || '').trim();
      const bounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
        layoutW,
        layoutH,
        speakerRect
      );
      if (!bounds) return plan;
      const pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD;
      const gap = Math.max(ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP, Number(opts.minGap) || 56);
      const sp = odqCarouselSpeakerExpandedRect(speakerRect, ODQ_CAROUSEL_SPEAKER_AVOID_PAD);
      const safeRight = sp ? Math.min(bounds.right, sp.left - 14) : bounds.right;
      const bandLeft = bounds.left + 20;
      const layoutSeed = String(opts.layoutSeed || '');
      const stripLayoutSeed = odqNormalizeStripLayoutSeed(opts.stripLayoutSeed);
      if (quoteText) {
        odqCarouselSpeakerEnforceMonotonicTextOrderY(quotes, quoteText, gap);
      }
      const maxQuoteBottom = () =>
        Math.max(...quotes.map((q) => odqStripPlanAxisRect(q, pad).bottom));

      for (let aIdx = 0; aIdx < authors.length; aIdx++) {
        const a = authors[aIdx];
        const fh = odqStripPlanFootprintH(a, pad);
        const fw = odqStripPlanFootprintW(a, pad);
        for (let liftPass = 0; liftPass < 48; liftPass++) {
          const needBottom = maxQuoteBottom() + gap + fh;
          if (needBottom <= bounds.bottom - 4) break;
          let minQuoteTop = Infinity;
          for (const q of quotes) {
            minQuoteTop = Math.min(minQuoteTop, odqStripPlanAxisRect(q, pad).top);
          }
          const lift = Math.min(
            needBottom - (bounds.bottom - 4),
            Math.max(0, minQuoteTop - bounds.top - 6)
          );
          if (lift <= 0) break;
          for (const q of quotes) {
            q.y = Number(q.y || 0) - lift;
          }
          if (quoteText) {
            odqCarouselSpeakerEnforceMonotonicTextOrderY(quotes, quoteText, gap);
          }
        }
        const hash = odqPostStripStaggerHash(layoutSeed, stripLayoutSeed, aIdx, 'author_terminal');
        const roll = odqPostStripStaggerRoll(hash, 5);
        const targetCx = Math.max(bandLeft + fw / 2, safeRight - fw / 2 - roll * 10);
        a.y = maxQuoteBottom() + gap + fh / 2;
        a.x = Math.max(bandLeft + fw / 2, Math.min(safeRight - fw / 2, targetCx));
        if (a.y + fh / 2 > bounds.bottom - 2) {
          a.y = Math.max(maxQuoteBottom() + gap + fh / 2, bounds.bottom - fh / 2 - 2);
        }
      }
      return [...quotes, ...authors];
    }

    /** Long-quote carousel: author nameplate straddling the cutout bottom edge (may overlap portrait). */
    function odqCarouselSpeakerAnchorAuthorCutoutLabel(plan, layoutW, layoutH, speakerRect, opts = {}) {
      const authors = (Array.isArray(plan) ? plan : []).filter((s) => s.role === 'author');
      const quotes = (Array.isArray(plan) ? plan : []).filter((s) => s.role !== 'author');
      if (!authors.length || !speakerRect) return plan;
      const bounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
        layoutW,
        layoutH,
        speakerRect
      );
      const frame = odqCarouselSpeakerCutoutFrameRect(speakerRect);
      if (!bounds || !frame) return plan;
      const pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD;
      const layoutSeed = String(opts.layoutSeed || '');
      const stripLayoutSeed = odqNormalizeStripLayoutSeed(opts.stripLayoutSeed);
      const labelOverlapUp = Number.isFinite(Number(opts.labelOverlapUp))
        ? Number(opts.labelOverlapUp)
        : 0.44;
      const frameBottom = frame.y + frame.height;
      const frameCx = frame.x + frame.width / 2;

      for (let aIdx = 0; aIdx < authors.length; aIdx++) {
        const a = authors[aIdx];
        a.authorCutoutLabel = true;
        const fh = odqStripPlanFootprintH(a, pad);
        const fw = odqStripPlanFootprintW(a, pad);
        const hash = odqPostStripStaggerHash(layoutSeed, stripLayoutSeed, aIdx, 'author_cutout_label');
        const roll = odqPostStripStaggerRoll(hash, 5);
        a.y = frameBottom - fh * labelOverlapUp;
        a.x = frameCx + (roll - 0.5) * Math.min(36, frame.width * 0.1);
        a.x = Math.max(bounds.left + fw / 2, Math.min(bounds.right - fw / 2, a.x));
        a.y = Math.max(
          bounds.top + fh / 2,
          Math.min(bounds.bottom - fh / 2 - 2, Number(a.y || 0))
        );
        a.angle =
          odqPostStripStaggerTiltRad(aIdx + 41, a, layoutSeed, stripLayoutSeed) * 0.25;
      }
      return [...quotes, ...authors];
    }

    function odqNormalizeStripPlanClampRect(rect) {
      if (!rect) return null;
      if (Number.isFinite(Number(rect.left)) && Number.isFinite(Number(rect.right))) {
        return {
          x: Number(rect.left),
          y: Number(rect.top),
          width: Math.max(1, Number(rect.right) - Number(rect.left)),
          height: Math.max(1, Number(rect.bottom) - Number(rect.top))
        };
      }
      if (
        Number.isFinite(Number(rect.x)) &&
        Number.isFinite(Number(rect.y)) &&
        Number.isFinite(Number(rect.width)) &&
        Number(rect.width) > 0
      ) {
        return rect;
      }
      return null;
    }

    /** Post safe-zone: separate overlapping strip rects after refit widens paper. */
    function odqResolveLayoutBStripPlanOverlaps(plan, layoutW, layoutH, minGap = 10, clampSafeRect = null) {
      const strips = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));
      if (strips.length < 2) return strips;
      const safe =
        odqNormalizeStripPlanClampRect(clampSafeRect) ||
        odqLayoutBPostGridSafeRect(layoutW, layoutH, 8);
      const gap = Math.max(6, Number(minGap) || 0);
      const preferVertical =
        safe &&
        Number.isFinite(Number(safe.width)) &&
        Number(safe.width) < Number(layoutW || 1080) * 0.42;
      for (let pass = 0; pass < 48; pass++) {
        let moved = false;
        for (let i = 0; i < strips.length; i++) {
          for (let j = i + 1; j < strips.length; j++) {
            const a = strips[i];
            const b = strips[j];
            const ra = odqStripPlanAxisRect(a, gap);
            const rb = odqStripPlanAxisRect(b, gap);
            const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (overlapX <= 0 || overlapY <= 0) continue;
            const cxA = Number(a.x || 0);
            const cxB = Number(b.x || 0);
            const cyA = Number(a.y || 0);
            const cyB = Number(b.y || 0);
            const pushX = overlapX / 2 + 3;
            const pushY = overlapY / 2 + 3;
            if (preferVertical || overlapY <= overlapX) {
              if (cyA <= cyB) {
                a.y -= pushY;
                b.y += pushY;
              } else {
                a.y += pushY;
                b.y -= pushY;
              }
            } else if (cxA <= cxB) {
              a.x -= pushX;
              b.x += pushX;
            } else {
              a.x += pushX;
              b.x -= pushX;
            }
            moved = true;
          }
        }
        if (safe) {
          for (const s of strips) {
            const halfW = Number(s.w || 20) / 2 + 10;
            const halfH = Number(s.h || 20) / 2 + 10;
            s.x = Math.max(safe.x + halfW, Math.min(safe.x + safe.width - halfW, Number(s.x || 0)));
            s.y = Math.max(safe.y + halfH, Math.min(safe.y + safe.height - halfH, Number(s.y || 0)));
          }
        }
        if (!moved) break;
      }
      return strips;
    }

    function odqLayoutBPostStripInnerColumn(layoutW, layoutH) {
      const safe = odqLayoutBPostGridSafeRect(layoutW, layoutH, 8);
      if (!safe) return null;
      return odqLayoutBPostStripInnerColumnFromSafeRect(safe);
    }

    function odqLayoutBPostStripInnerColumnFromSafeRect(safe) {
      if (!safe) return null;
      return odqShrinkLayoutBStripHorizontalBounds(
        {
          left: safe.x,
          top: safe.y,
          right: safe.x + safe.width,
          bottom: safe.y + safe.height
        },
        ODQ_LAYOUT_B_POST_QUOTE_LAYOUT_INNER_FRAC
      );
    }

    function odqPostStripReadingCenterX(layoutW, layoutH) {
      const layout = odqLayoutBPostStripInnerColumn(layoutW, layoutH);
      if (!layout) return layoutW / 2;
      return (layout.left + layout.right) / 2;
    }

    function odqDeterministicStripJitterPx(spec, amplitudePx) {
      const amp = Math.max(0, Number(amplitudePx) || 0);
      if (amp <= 0) return 0;
      const seed = String(spec?.seed || spec?.role || 'strip');
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
      const t = (h % 1000) / 1000;
      return (t - 0.5) * 2 * amp;
    }

    function odqPostStripStaggerHash(layoutSeed, stripLayoutSeed, rowIndex, specSeed) {
      let h = 2166136261;
      const seedStr = `pstagger_${layoutSeed}_${stripLayoutSeed}_${rowIndex}_${specSeed || 'q'}`;
      for (let i = 0; i < seedStr.length; i++) {
        h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
      }
      const variant = odqNormalizeStripLayoutSeed(stripLayoutSeed);
      if (variant > 0) {
        h = Math.imul(h ^ variant, 16777619);
        const vs = String(variant);
        for (let i = 0; i < vs.length; i++) h = Math.imul(h ^ vs.charCodeAt(i), 16777619);
      }
      return h >>> 0;
    }

    function odqPostStripStaggerRoll(hash, salt = 0) {
      const t = Math.imul((hash ^ salt) >>> 0, 1103515245) >>> 0;
      return (t % 10000) / 10000;
    }

    /** Story-style left / center / right band pick, clamped to post inner column. */
    function odqPostStripStaggerTargetCx(rowIndex, spec, layout, layoutSeed = '', stripLayoutSeed = 0) {
      if (!layout) return 0;
      const w = Number(spec?.w || 0);
      const innerSpan = Math.max(1, layout.right - layout.left);
      const minCx = w / 2 + layout.left + 8;
      const maxCx = layout.right - w / 2 - 8;
      if (minCx >= maxCx) return (layout.left + layout.right) / 2;
      const hash = odqPostStripStaggerHash(
        layoutSeed,
        stripLayoutSeed,
        rowIndex,
        spec?.seed || spec?.role || 'quote'
      );
      const roll = odqPostStripStaggerRoll(hash, 0);
      const roll2 = odqPostStripStaggerRoll(hash, 17);
      const zoneSpan = Math.min(95, innerSpan * ODQ_LAYOUT_B_POST_STAGGER_ZONE_FRAC);
      const centerSpan = innerSpan * ODQ_LAYOUT_B_POST_STAGGER_CENTER_SPAN_FRAC;
      let cx;
      if (roll < 0.34) cx = minCx + roll2 * zoneSpan;
      else if (roll < 0.67) cx = (layout.left + layout.right) / 2 + (roll2 - 0.5) * centerSpan;
      else cx = maxCx - roll2 * zoneSpan;
      cx += odqDeterministicStripJitterPx(
        { seed: `${spec?.seed || 'strip'}_${rowIndex}_${layoutSeed}` },
        ODQ_LAYOUT_B_POST_READING_BAND_JITTER_PX * 0.55
      );
      return Math.max(minCx, Math.min(maxCx, cx));
    }

    function odqPostStripStaggerTiltRad(rowIndex, spec, layoutSeed = '', stripLayoutSeed = 0) {
      const hash = odqPostStripStaggerHash(
        layoutSeed,
        stripLayoutSeed,
        rowIndex,
        `${spec?.seed || 'strip'}_tilt`
      );
      const t = odqPostStripStaggerRoll(hash, 7);
      return (t - 0.5) * ODQ_LAYOUT_B_POST_STRIP_TILT_RAD * 2;
    }

    function odqPostStripCompositionalTiltRad(rowIndex, spec, layoutSeed = '', stripLayoutSeed = 0) {
      return odqPostStripStaggerTiltRad(rowIndex, spec, layoutSeed, stripLayoutSeed);
    }

    function odqPostStripCompositionalTargetCx(
      rowIndex,
      rowCount,
      prevSmoothedCx,
      layoutW,
      layoutH,
      layoutSeed = '',
      stripLayoutSeed = 0
    ) {
      const layout = odqLayoutBPostStripInnerColumn(layoutW, layoutH);
      const pseudo = { w: 220, seed: `row_${rowIndex}` };
      return odqPostStripStaggerTargetCx(rowIndex, pseudo, layout, layoutSeed, stripLayoutSeed);
    }

    function odqPostStripReadingBandTargetCx(
      rowIndex,
      rowCount,
      prevSmoothedCx,
      layoutW,
      layoutH,
      layoutSeed = '',
      stripLayoutSeed = 0
    ) {
      return odqPostStripCompositionalTargetCx(
        rowIndex,
        rowCount,
        prevSmoothedCx,
        layoutW,
        layoutH,
        layoutSeed,
        stripLayoutSeed
      );
    }
    function odqClampStripPlanCxToSafe(spec, cx, safe, edgePad = 10) {
      const half = Number(spec.w || 20) / 2 + edgePad;
      if (!safe) return cx;
      return Math.max(safe.x + half, Math.min(safe.x + safe.width - half, cx));
    }

    function odqApplyPostStripReadingBands(plan, layoutW, layoutH, opts = {}) {
      const strips = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));
      if (!strips.length) return strips;
      const layoutSeed = String(opts.layoutSeed || opts.dateKey || 'layout_b_post');
      const stripLayoutSeed = odqNormalizeStripLayoutSeed(opts.stripLayoutSeed);
      const safe = opts.carouselSpeakerAvoidRect
        ? odqLayoutBPostGridSafeRectForCarouselSpeaker(
            layoutW,
            layoutH,
            opts.carouselSpeakerAvoidRect
          )
        : odqLayoutBPostGridSafeRect(layoutW, layoutH, 8);
      const layout = opts.carouselSpeakerAvoidRect
        ? odqLayoutBPostStripInnerColumnForCarouselSpeaker(
            layoutW,
            layoutH,
            opts.carouselSpeakerAvoidRect
          )
        : odqLayoutBPostStripInnerColumn(layoutW, layoutH);
      const quotes = strips
        .filter((s) => s.role !== 'author')
        .sort((a, b) => Number(a.y || 0) - Number(b.y || 0));
      const authors = strips.filter((s) => s.role === 'author');
      const quoteRows = odqGroupLayoutBStripPlanRowsByReadingOrder(quotes);
      const unitCount = quoteRows.length;
      if (!unitCount || !layout) return strips;
      const innerSpan = Math.max(1, layout.right - layout.left);
      for (let r = 0; r < quoteRows.length; r++) {
        const row = quoteRows[r];
        const isPair =
          row.length === 2 &&
          row[0].rowGroup != null &&
          row[0].rowGroup === row[1].rowGroup;
        const anchorSpec = row[0];
        const targetCx = odqPostStripStaggerTargetCx(
          r,
          anchorSpec,
          layout,
          layoutSeed,
          stripLayoutSeed
        );
        if (isPair) {
          const a = row[0];
          const b = row[1];
          const pairHGap = 28 + Math.round(Math.abs(odqDeterministicStripJitterPx(a, 8)));
          const totalW = Number(a.w || 0) + pairHGap + Number(b.w || 0);
          let leftCx = targetCx - totalW / 2 + Number(a.w || 0) / 2;
          let rightCx = targetCx - totalW / 2 + Number(a.w || 0) + pairHGap + Number(b.w || 0) / 2;
          leftCx = odqClampStripPlanCxToSafe(a, leftCx, safe);
          rightCx = odqClampStripPlanCxToSafe(b, rightCx, safe);
          a.x = leftCx;
          b.x = rightCx;
          a.angle = odqPostStripStaggerTiltRad(r, a, layoutSeed, stripLayoutSeed);
          b.angle =
            odqPostStripStaggerTiltRad(r, b, layoutSeed, stripLayoutSeed) * -0.85 +
            odqDeterministicStripJitterPx(b, 0.012);
        } else {
          const s = row[0];
          let cx = targetCx;
          cx = odqClampStripPlanCxToSafe(s, cx, safe);
          s.x = cx;
          s.angle = odqPostStripStaggerTiltRad(r, s, layoutSeed, stripLayoutSeed);
        }
      }
      for (const a of authors) {
        const minCx = Number(a.w || 0) / 2 + layout.left + 8;
        const maxCx = layout.right - Number(a.w || 0) / 2 - 8;
        let cx = odqPostStripStaggerTargetCx(
          unitCount,
          a,
          layout,
          layoutSeed,
          stripLayoutSeed
        );
        cx = Math.max(minCx, Math.min(maxCx, cx + innerSpan * 0.08));
        cx = odqClampStripPlanCxToSafe(a, cx, safe);
        a.x = cx;
        a.angle = odqPostStripStaggerTiltRad(unitCount + 1, a, layoutSeed, stripLayoutSeed) * 0.7;
      }
      return [...quotes, ...authors];
    }

    function odqClampLayoutBStripPlanXToSafe(plan, safe, edgePad = 10) {
      const strips = Array.isArray(plan) ? plan : [];
      if (!safe) return strips;
      for (const s of strips) {
        const half = Number(s.w || 0) / 2 + edgePad;
        s.x = Math.max(safe.x + half, Math.min(safe.x + safe.width - half, Number(s.x || 0)));
      }
      return strips;
    }

    /** Clamp strip centers so full paper rects stay inside the post 3:4 safe zone. */
    function odqClampLayoutBStripPlanToPostSafe(plan, layoutW, layoutH, edgePad = 10) {
      const strips = Array.isArray(plan) ? plan : [];
      const safe = odqLayoutBPostGridSafeRect(layoutW, layoutH, 8);
      if (!safe || !strips.length) return strips;
      for (const s of strips) {
        const halfW = Number(s.w || 0) / 2 + edgePad;
        const halfH = Number(s.h || 0) / 2 + edgePad;
        s.x = Math.max(safe.x + halfW, Math.min(safe.x + safe.width - halfW, Number(s.x || 0)));
        if (s.role === 'author') continue;
        s.y = Math.max(safe.y + halfH, Math.min(safe.y + safe.height - halfH, Number(s.y || 0)));
      }
      return strips;
    }

    /**
     * Post 4:5 (inherited story plan): compress the whole quote cluster into the inner layout
     * column. 3:4 safe zone is only a clip — strips do not need to span its full width.
     */
    function odqFitLayoutBStripPlanToPostLayoutColumn(plan, layoutW, layoutH) {
      const strips = Array.isArray(plan) ? plan : [];
      if (strips.length < 2) return strips;
      const safe = odqLayoutBPostGridSafeRect(layoutW, layoutH, 8);
      if (!safe) return strips;
      const clip = {
        left: safe.x,
        top: safe.y,
        right: safe.x + safe.width,
        bottom: safe.y + safe.height
      };
      const layout = odqShrinkLayoutBStripHorizontalBounds(
        clip,
        ODQ_LAYOUT_B_POST_QUOTE_LAYOUT_INNER_FRAC
      );
      const innerCx = (layout.left + layout.right) / 2;
      const maxSpan = (layout.right - layout.left) * ODQ_LAYOUT_B_POST_QUOTE_MAX_SPAN_FRAC;
      let minEdge = Infinity;
      let maxEdge = -Infinity;
      for (const s of strips) {
        const x = Number(s.x || 0);
        const half = Number(s.w || 0) / 2;
        minEdge = Math.min(minEdge, x - half);
        maxEdge = Math.max(maxEdge, x + half);
      }
      if (!Number.isFinite(minEdge)) return strips;
      const clusterCx = (minEdge + maxEdge) / 2;
      const span = Math.max(1, maxEdge - minEdge);
      const scale = Math.min(1, maxSpan / span);
      for (const s of strips) {
        s.x = innerCx + (Number(s.x || 0) - clusterCx) * scale;
      }
      return odqClampLayoutBStripPlanToPostSafe(strips, layoutW, layoutH);
    }

    function odqApplyPostQuoteStripVerticalSpread(plan, layoutW, layoutH, opts = {}) {
      const carouselSafe = opts.carouselSpeakerAvoidRect
        ? odqLayoutBPostGridSafeRectForCarouselSpeaker(
            layoutW,
            layoutH,
            opts.carouselSpeakerAvoidRect
          )
        : null;
      const spreadOpts = {
        minRowGap: Number.isFinite(opts.minRowGap)
          ? opts.minRowGap
          : opts.carouselSpeakerAvoidRect
            ? ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP
            : 10,
        authorGap: ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_POST_BOUNDED,
        readingOrderRows: opts.readingStack === true,
        carouselSpeakerAvoidRect: opts.carouselSpeakerAvoidRect || null
      };
      const spread = odqSpreadLayoutBStripPlanVertically(plan, layoutW, layoutH, spreadOpts);
      const longCarouselQuote =
        opts.carouselSpeakerAvoidRect && opts.carouselShortQuote !== true;
      let out = longCarouselQuote
        ? (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }))
        : opts.carouselSpeakerAvoidRect
          ? odqApplyCarouselSpeakerStripFlowLayout(plan, layoutW, layoutH, opts)
          : opts.readingStack
            ? odqApplyPostStripReadingBands(spread, layoutW, layoutH, opts)
            : odqFitLayoutBStripPlanToPostLayoutColumn(spread, layoutW, layoutH);
      if (out.length > 1 && !opts.carouselSpeakerAvoidRect && !opts.readingStack) {
        const clampRect = carouselSafe;
        out = odqResolveLayoutBStripPlanOverlaps(
          out,
          layoutW,
          layoutH,
          10,
          clampRect || null
        );
      }
      if (opts.carouselSpeakerAvoidRect && typeof globalThis.odqApplyCarouselSpeakerStripLayout === 'function') {
        return globalThis.odqApplyCarouselSpeakerStripLayout(out, layoutW, layoutH, {
          ...opts,
          phase: 'full'
        });
      }
      if (opts.carouselSpeakerAvoidRect) {
        return odqClampLayoutBStripPlanToCarouselSpeakerRegion(
          out,
          layoutW,
          layoutH,
          opts.carouselSpeakerAvoidRect
        );
      }
      if (opts.carouselStoryStyle === true && opts.carouselStoryStyleSpeakerSeamRect) {
        out = odqShiftCarouselStoryStyleStripClusterLeft(
          out,
          layoutW,
          layoutH,
          opts.carouselStoryStyleSpeakerSeamRect
        );
      }
      const finalOut = carouselSafe
        ? odqClampLayoutBStripPlanXToSafe(out, carouselSafe)
        : odqClampLayoutBStripPlanToPostSafe(out, layoutW, layoutH);
      return finalOut;
    }

    /** Separate axis rects for a side-by-side pair after vertical stagger. */
    function odqCarouselSpeakerFixPairStripOverlap(
      a,
      b,
      minGap = 10,
      speakerRect = null,
      layoutW = 0,
      layoutH = 0
    ) {
      if (!a || !b) return;
      const gap = Math.max(ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP, Number(minGap) || ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP);
      const pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD;
      for (let pass = 0; pass < 16; pass++) {
        const ra = odqStripPlanAxisRect(a, pad);
        const rb = odqStripPlanAxisRect(b, pad);
        const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (overlapX <= 0 || overlapY <= 0) return;
        const cxA = Number(a.x || 0);
        const cxB = Number(b.x || 0);
        const cyA = Number(a.y || 0);
        const cyB = Number(b.y || 0);
        const preferHorizontal =
          Math.abs(cxA - cxB) >= Math.abs(cyA - cyB) || overlapX <= overlapY;
        if (preferHorizontal) {
          const left = cxA <= cxB ? a : b;
          const right = left === a ? b : a;
          const leftR = odqStripPlanAxisRect(left, pad);
          const rightR = odqStripPlanAxisRect(right, pad);
          const need = leftR.right + gap - rightR.left;
          if (need <= 0) continue;
          right.x = Number(right.x || 0) + need;
          if (speakerRect && odqStripPlanOverlapsCarouselSpeaker(right, speakerRect)) {
            right.x = Number(right.x || 0) - need;
            const top = cyA <= cyB ? a : b;
            const bottom = top === a ? b : a;
            odqCarouselSpeakerSeparateStripVertical(top, bottom, gap, pad);
          } else if (odqStripPlanCarouselTextOverlaps(left, right, pad)) {
            const top = cyA <= cyB ? a : b;
            const bottom = top === a ? b : a;
            odqCarouselSpeakerSeparateStripVertical(top, bottom, gap, pad);
          }
        } else {
          const top = cyA <= cyB ? a : b;
          const bottom = top === a ? b : a;
          odqCarouselSpeakerSeparateStripVertical(top, bottom, gap, pad);
        }
      }
    }

    function odqCarouselSpeakerFixAllSameRowPairOverlaps(
      plan,
      minGap = 10,
      speakerRect = null,
      layoutW = 0,
      layoutH = 0
    ) {
      const quotes = (Array.isArray(plan) ? plan : []).filter((s) => s.role !== 'author');
      const rows = odqCarouselSpeakerVisualRows(quotes);
      for (const row of rows) {
        if (row.items.length < 2) continue;
        row.items.sort((a, b) => Number(a.x || 0) - Number(b.x || 0));
        for (let i = 1; i < row.items.length; i++) {
          odqCarouselSpeakerFixPairStripOverlap(
            row.items[i - 1],
            row.items[i],
            minGap,
            speakerRect,
            layoutW,
            layoutH
          );
        }
      }
      return plan;
    }

    function odqEstimateStripPlanVerticalSpan(plan, opts = {}) {
      const rows = opts.readingOrderRows
        ? odqGroupLayoutBStripPlanRowsByReadingOrder(plan)
        : odqGroupLayoutBStripPlanRows(plan);
      if (!rows.length) return 0;
      const rowHeights = rows.map((row) => Math.max(...row.map((s) => Number(s.h || 0))));
      let total = rowHeights.reduce((sum, h) => sum + h, 0);
      for (let i = 1; i < rows.length; i++) {
        const prevQuote = rows[i - 1].some((s) => s.role === 'quote');
        const curAuthor = rows[i].some((s) => s.role === 'author');
        total += prevQuote && curAuthor
          ? ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_POST_BOUNDED
          : 34;
      }
      return total;
    }

    function odqStripPlanHasOverlaps(plan, minGap = 10) {
      const strips = Array.isArray(plan) ? plan : [];
      for (let i = 0; i < strips.length; i++) {
        for (let j = i + 1; j < strips.length; j++) {
          const ra = odqStripPlanAxisRect(strips[i], minGap);
          const rb = odqStripPlanAxisRect(strips[j], minGap);
          const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (overlapX > 0 && overlapY > 0) return true;
        }
      }
      return false;
    }

    function odqCarouselStripPlanLayoutOk(plan, speakerRect, minGap = 10) {
      if (typeof globalThis.odqCarouselStripPlanLayoutOk === 'function') {
        return globalThis.odqCarouselStripPlanLayoutOk(plan, speakerRect, minGap);
      }
      const strips = Array.isArray(plan) ? plan : [];
      for (let i = 0; i < strips.length; i++) {
        for (let j = i + 1; j < strips.length; j++) {
          if (odqStripPlanCarouselTextOverlaps(strips[i], strips[j])) return false;
        }
      }
      if (!speakerRect) return true;
      for (const s of strips) {
        if (odqStripPlanOverlapsCarouselSpeaker(s, speakerRect)) return false;
      }
      return true;
    }

    /** Step typography down until stack fits post safe-zone height. */
    function odqShrinkStripPlanTypographyUntilPostSafe(plan, ctx, layoutW, layoutH, maxStripW, fontSerif, opts = {}) {
      const bounds = odqLayoutBPostStripSpreadBounds(layoutW, layoutH, opts);
      const avail = Math.max(100, bounds.boundsBottom - bounds.boundsTop);
      let strips = Array.isArray(plan) ? plan : [];
      for (let i = 0; i < 40; i++) {
        const spreadOpts = {
          carouselSpeakerAvoidRect: opts.carouselSpeakerAvoidRect || null,
          readingOrderRows: true,
          quoteText: opts.quoteText || '',
          authorCutoutLabel: opts.authorCutoutLabel === true
        };
        const fitsHeight = odqLayoutBStripPlanFitsPostSpreadBounds(strips, layoutW, layoutH, spreadOpts);
        const estSpan = odqEstimateStripPlanVerticalSpan(strips, { readingOrderRows: true });
        if (fitsHeight && estSpan <= avail) break;
        let minPx = 999;
        for (const s of strips) {
          const px = parseInt(/(\d+)px/.exec(String(s.font || ''))?.[1] || '48', 10);
          minPx = Math.min(minPx, px);
        }
        if (minPx <= 16) break;
        const refitOpts =
          opts.carouselSpeakerAvoidRect && opts.authorCutoutLabel === true
            ? odqCarouselLongQuoteRefitOpts()
            : {};
        strips = refitLayoutBStripPlanToText(
          boostLayoutBStripPlanTypography(strips, 0.94, fontSerif),
          ctx,
          maxStripW,
          fontSerif,
          refitOpts
        );
      }
      return strips;
    }

    /**
     * Quote-only layout-b post: undo story scale, then binary-search largest type that fits safe-zone height.
     */
    function odqMaximizeStripPlanTypographyToPostSafe(plan, ctx, layoutW, layoutH, maxStripW, fontSerif) {
      const bounds = odqLayoutBPostStripSpreadBounds(layoutW, layoutH);
      const avail = Math.max(100, bounds.boundsBottom - bounds.boundsTop);
      let base = refitLayoutBStripPlanToText(
        boostLayoutBStripPlanTypography(plan, ODQ_LAYOUT_B_POST_STORY_INHERIT_TYPE_BOOST, fontSerif),
        ctx,
        maxStripW,
        fontSerif
      );
      if (odqEstimateStripPlanVerticalSpan(base) > avail) {
        return odqShrinkStripPlanTypographyUntilPostSafe(
          base,
          ctx,
          layoutW,
          layoutH,
          maxStripW,
          fontSerif
        );
      }
      let lo = 1;
      let hi = ODQ_LAYOUT_B_POST_QUOTE_ONLY_MAX_TYPE_SCALE;
      let best = base;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const trial = refitLayoutBStripPlanToText(
          boostLayoutBStripPlanTypography(base, mid, fontSerif),
          ctx,
          maxStripW,
          fontSerif
        );
        if (odqEstimateStripPlanVerticalSpan(trial) <= avail) {
          best = trial;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return best;
    }

    function odqCarouselStoryStyleStripMaxWidth(layoutW, layoutH, speakerSeamRect, defaultMax) {
      const safe = odqLayoutBPostSafeBounds(layoutW, layoutH, 10);
      if (!safe || !speakerSeamRect) return defaultMax;
      return Math.max(160, Math.min(defaultMax, Math.round(safe.right - safe.left - 12)));
    }

    function odqCarouselStoryStyleSpeakerLayoutOk(strips, speakerRect) {
      if (!speakerRect) return true;
      for (const s of Array.isArray(strips) ? strips : []) {
        if (s.authorCutoutLabel) continue;
        if (odqStripPlanOverlapsCarouselSpeaker(s, speakerRect)) return false;
      }
      return true;
    }

    function odqCarouselStoryStyleStackStripsByReadingOrder(strips, quoteText, layoutW, layoutH) {
      const src = String(quoteText || '').trim();
      const input = Array.isArray(strips) ? strips : [];
      if (!src || input.length < 2) return input;
      const safe = odqLayoutBPostSafeBounds(layoutW, layoutH, 10);
      if (!safe) return input;
      const stripTextPosition = (s) => {
        const srcLower = src.toLowerCase();
        const t = String(s.text || (Array.isArray(s.lines) ? s.lines.join(' ') : '') || '')
          .trim()
          .toLowerCase();
        if (!t) return Number.MAX_SAFE_INTEGER;
        let idx = srcLower.indexOf(t);
        if (idx >= 0) return idx;
        if (t.length > 10) {
          idx = srcLower.indexOf(t.slice(0, 10));
          if (idx >= 0) return idx;
        }
        for (const w of t.split(/\s+/).filter((word) => word.length > 3)) {
          idx = srcLower.indexOf(w);
          if (idx >= 0) return idx;
        }
        return Number.MAX_SAFE_INTEGER;
      };
      const ordered = [
        ...input
          .filter((s) => s.role !== 'author' && stripTextPosition(s) !== Number.MAX_SAFE_INTEGER)
          .slice()
          .sort((a, b) => stripTextPosition(a) - stripTextPosition(b))
          .map((s) => ({ ...s, rowGroup: undefined, rowSlot: undefined })),
        ...input
          .filter((s) => s.role === 'author' || stripTextPosition(s) === Number.MAX_SAFE_INTEGER)
          .map((s) => ({ ...s, role: 'author', rowGroup: undefined, rowSlot: undefined }))
      ];
      let cursorTop = safe.top + 12;
      for (let i = 0; i < ordered.length; i++) {
        const s = ordered[i];
        const h = Number(s.h || 0);
        s.y = cursorTop + h / 2;
        const nextIsAuthor = ordered[i + 1]?.role === 'author';
        cursorTop = s.y + h / 2 + (nextIsAuthor ? 26 : 50);
        console.log('[STACK]', i, JSON.stringify(s.text||s.lines), 'h='+h, 'y='+s.y, 'cursorTop='+cursorTop);
      }
      console.log('[STACK-SAFE]', JSON.stringify(safe));
      const lastS = ordered[ordered.length - 1];
      const overflowBottom = lastS ? (lastS.y + (lastS.h || 0) / 2) - (safe.bottom - 8) : 0;
      if (overflowBottom > 0) {
        const firstS = ordered[0];
        const headroom = firstS ? Math.max(0, firstS.y - (firstS.h || 0) / 2 - safe.top - 8) : 0;
        const lift = Math.min(overflowBottom, headroom);
        for (const s of ordered) s.y = Number(s.y || 0) - lift;
      }
      return ordered;
    }

    function odqCarouselStoryStyleFinalizeStripSpread(strips, layoutW, layoutH, opts = {}) {
      console.log('[FINALIZE-ENTRY]', layoutW, layoutH, Array.isArray(strips) ? strips.length : 'not-array');
      const quoteText = String(opts.quoteText || opts.spreadOpts?.quoteText || '').trim();
      const authorText = String(opts.quoteAuthor || opts.spreadOpts?.quoteAuthor || '')
        .replace(/^\s*[—-]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const input = Array.isArray(strips) ? strips : [];
      const stripText = (s) =>
        String(s.text || (Array.isArray(s.lines) ? s.lines.join(' ') : '') || '')
          .replace(/^\s*[—-]\s*/, '')
          .replace(/\s+/g, ' ')
          .trim();
      const isAuthorStrip = (s) => {
        if (s.role === 'author') return true;
        if (!authorText) return false;
        return stripText(s).toLowerCase() === authorText;
      };
      const stripTextPosition = (s) => {
        const src = quoteText.toLowerCase();
        const t = stripText(s).toLowerCase();
        if (!src || !t) return Number.MAX_SAFE_INTEGER;
        let idx = src.indexOf(t);
        if (idx >= 0) return idx;
        if (t.length > 10) {
          idx = src.indexOf(t.slice(0, 10));
          if (idx >= 0) return idx;
        }
        for (const w of t.split(/\s+/).filter((word) => word.length > 3)) {
          idx = src.indexOf(w);
          if (idx >= 0) return idx;
        }
        return Number.MAX_SAFE_INTEGER;
      };
      const orderedInput = quoteText
        ? [
            ...input
              .filter((s) => !isAuthorStrip(s) && stripTextPosition(s) !== Number.MAX_SAFE_INTEGER)
              .slice()
              .sort((a, b) => stripTextPosition(a) - stripTextPosition(b))
              .map((s) => ({ ...s, rowGroup: undefined, rowSlot: undefined })),
            ...input
              .filter((s) => isAuthorStrip(s) || stripTextPosition(s) === Number.MAX_SAFE_INTEGER)
              .map((s) => ({ ...s, role: 'author' }))
          ]
        : input;
      let out = odqApplyPostQuoteStripVerticalSpread(orderedInput, layoutW, layoutH, opts.spreadOpts || {});
      out = odqCarouselStoryStyleStackStripsByReadingOrder(out, quoteText, layoutW, layoutH);
      const speakerRect = opts.carouselStoryStyleSpeakerSeamRect;
      const safe = odqLayoutBPostGridSafeRect(layoutW, layoutH, 8);
      if (!speakerRect) return out;
      out = odqCarouselSpeakerClampStripPlanOffCutout(out, layoutW, layoutH, speakerRect);
      out = odqShiftCarouselStoryStyleStripClusterLeft(out, layoutW, layoutH, speakerRect, 40);
      out = odqCarouselSpeakerClampStripPlanOffCutout(out, layoutW, layoutH, speakerRect);
      return out;
    }

    function odqCarouselStoryStyleStripTypographyOk(strips, layoutW, layoutH, opts = {}, ctx, fontSerif) {
      const spreadStrips = opts.stripPlanAlreadySpread
        ? strips
        : odqCarouselStoryStyleFinalizeStripSpread(strips, layoutW, layoutH, opts);
      if (
        !odqLayoutBStripPlanFitsPostSpreadBounds(spreadStrips, layoutW, layoutH, {
          quoteText: opts.quoteText || ''
        })
      ) {
        return false;
      }
      if (odqStripPlanHasOverlaps(spreadStrips, ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP)) return false;
      const speakerRect = opts.carouselStoryStyleSpeakerSeamRect;
      if (speakerRect && !odqCarouselStoryStyleSpeakerLayoutOk(spreadStrips, speakerRect)) return false;
      if (ctx && odqLayoutBStripPlanHasTextOverflow(spreadStrips, ctx, fontSerif)) return false;
      return true;
    }

    /** Carousel slide 1: grow quote strips until speaker / height / overlap limits bind. */
    function odqMaximizeCarouselStoryStyleStripTypography(
      plan,
      ctx,
      layoutW,
      layoutH,
      maxStripW,
      fontSerif,
      opts = {}
    ) {
      const floorPx = ODQ_CAROUSEL_STORY_STYLE_MIN_BODY_PX;
      const boosted = boostLayoutBStripPlanTypography(
        plan,
        ODQ_LAYOUT_B_POST_STORY_INHERIT_TYPE_BOOST,
        fontSerif
      );
      const anchorPx = odqLayoutBStripPlanQuoteBodyPx(boosted);
      const buildUniform = (bodyPx) =>
        odqBuildUniformCarouselStoryStripPlan(boosted, bodyPx, ctx, maxStripW, fontSerif, {
          hardMinBodyPx: floorPx,
          noWrap: true
        });

      const fitsAtPx = (bodyPx) => {
        const px = Math.max(floorPx, Math.round(Number(bodyPx) || anchorPx));
        if (
          !odqCarouselQuoteBodyPxFitsAllStrips(boosted, ctx, px, maxStripW, fontSerif, {
            noWrap: true
          })
        ) {
          return false;
        }
        return odqCarouselStoryStyleStripTypographyOk(
          buildUniform(px),
          layoutW,
          layoutH,
          opts,
          ctx,
          fontSerif
        );
      };

      let loPx = floorPx;
      let hiPx = Math.max(floorPx, Math.round(anchorPx * ODQ_LAYOUT_B_POST_QUOTE_ONLY_MAX_TYPE_SCALE));
      let bestPx = floorPx;
      for (let i = 0; i < 12; i++) {
        if (loPx > hiPx) break;
        const trialPx = Math.round((loPx + hiPx) / 2);
        if (fitsAtPx(trialPx)) {
          bestPx = trialPx;
          loPx = trialPx + 1;
        } else {
          hiPx = trialPx - 1;
        }
      }
      return odqCarouselStoryStyleFinalizeStripSpread(
        buildUniform(bestPx),
        layoutW,
        layoutH,
        opts
      );
    }

    function odqShiftCarouselStoryStyleStripClusterLeft(
      plan,
      layoutW,
      layoutH,
      speakerSeamRect,
      gapPx = 36
    ) {
      const strips = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));
      if (!strips.length || !speakerSeamRect) return strips;
      const cluster = odqStripPlanClusterAxisBounds(strips, 8);
      if (!cluster) return strips;
      const sp = odqCarouselSpeakerExpandedRect(speakerSeamRect);
      if (!sp) return strips;
      const safe = odqLayoutBPostSafeBounds(layoutW, layoutH, 10);
      const minClusterLeft = safe ? safe.left + 6 : 6;
      const targetMaxRight = sp.left - gapPx;
      let dx = Math.min(0, targetMaxRight - cluster.right);
      if (cluster.left + dx < minClusterLeft) {
        dx += minClusterLeft - (cluster.left + dx);
      }
      if (!Number.isFinite(dx) || Math.abs(dx) < 0.5) return strips;
      for (const s of strips) {
        s.x = Number(s.x || 0) + dx;
      }
      return strips;
    }

    /**
     * After story→post scale: layout-b post maximizes type in safe zone; then spread.
     */
    function odqFinishInheritedStoryToPostStripPlan(
      plan,
      ctx,
      layoutW,
      layoutH,
      maxStripW,
      quoteOnlyTypeBoost,
      fontSerif,
      spreadOpts = {}
    ) {
      let strips = Array.isArray(plan) ? plan : [];
      if (spreadOpts.carouselStoryStyle === true) {
        return strips;
      }
      if (quoteOnlyTypeBoost && strips.length) {
        strips = odqMaximizeStripPlanTypographyToPostSafe(
          strips,
          ctx,
          layoutW,
          layoutH,
          maxStripW,
          fontSerif
        );
        strips = odqReflowQuoteOnlyPostAuthorStrips(
          strips,
          ctx,
          maxStripW,
          fontSerif,
          layoutW,
          layoutH
        );
      }
      const result = odqApplyPostQuoteStripVerticalSpread(strips, layoutW, layoutH, spreadOpts);
      return result;
    }

    const IG_QUILT_SCREEN_ASPECT = 9 / 16;

    /**
     * Largest 3:4 rect centered inside a 4:5 IG post (clip / must-not-exceed bounds).
     * Profile grid center-crops sides from 4:5. Quote layout uses a narrower inner column inside
     * this rect — strips do not need to fill the full safe width.
     */
    function odqLayoutBPostGridSafeRect(layoutW, layoutH, padding = 14) {
      const w = Math.max(1, Number(layoutW) || 1080);
      const h = Math.max(1, Number(layoutH) || 1350);
      const isPost =
        (w === 1080 && h === 1350) || Math.abs(w / Math.max(1, h) - 1080 / 1350) < 0.03;
      if (!isPost) return null;
      const pad = Math.max(0, Number(padding) || 0);
      const safeW = h * (3 / 4);
      const x = (w - safeW) / 2;
      return {
        x: Math.round(x + pad),
        y: Math.round(pad),
        width: Math.round(Math.max(1, safeW - pad * 2)),
        height: Math.round(Math.max(1, h - pad * 2))
      };
    }

    /** Carousel slide 1: full post safe zone (speaker handled per-strip during layout). */
    function odqLayoutBPostGridSafeRectForCarouselSpeaker(layoutW, layoutH, speakerRect, padding = 14) {
      return odqLayoutBPostGridSafeRect(layoutW, layoutH, padding);
    }

    function odqLayoutBPostSafeBounds(layoutW, layoutH, pad = 10) {
      const safe = odqLayoutBPostGridSafeRect(layoutW, layoutH, 8);
      if (!safe) return null;
      return {
        left: safe.x + pad,
        top: safe.y + pad,
        right: safe.x + safe.width - pad,
        bottom: safe.y + safe.height - pad
      };
    }

    /** Full safe zone; strips avoid speaker via per-row width + collision checks. */
    function odqLayoutBPostStripScatterBoundsForCarouselSpeaker(layoutW, layoutH, speakerRect) {
      return odqLayoutBPostSafeBounds(layoutW, layoutH, 10);
    }

    function odqCarouselSpeakerContentRect(speakerRect) {
      if (!speakerRect) return null;
      const hasContent =
        Number.isFinite(Number(speakerRect.contentWidth)) && Number(speakerRect.contentWidth) > 0;
      return {
        x: hasContent ? Number(speakerRect.contentX) : Number(speakerRect.x),
        y: hasContent ? Number(speakerRect.contentY) : Number(speakerRect.y),
        width: hasContent ? Number(speakerRect.contentWidth) : Number(speakerRect.width),
        height: hasContent ? Number(speakerRect.contentHeight) : Number(speakerRect.height)
      };
    }

    /** Full cutout frame (includes black base) — seam overlap draws this on top of strips. */
    function odqCarouselSpeakerCutoutFrameRect(speakerRect) {
      if (!speakerRect) return null;
      const x = Number(speakerRect.x);
      const y = Number(speakerRect.y);
      const width = Number(speakerRect.width);
      const height = Number(speakerRect.height);
      if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
      return { x, y, width, height };
    }

    function odqCarouselSpeakerExpandedRect(
      speakerRect,
      padSpec = ODQ_CAROUSEL_SPEAKER_AVOID_PAD
    ) {
      const frame = odqCarouselSpeakerCutoutFrameRect(speakerRect);
      const fallback = odqCarouselSpeakerContentRect(speakerRect);
      const base = frame || fallback;
      if (!base) return null;
      const seamPad = ODQ_CAROUSEL_SPEAKER_SEAM_DRAW_PAD;
      const pad =
        typeof padSpec === 'number'
          ? { top: padSpec, right: padSpec, bottom: padSpec, left: padSpec }
          : padSpec;
      return {
        left: base.x - seamPad - pad.left,
        top: base.y - seamPad - pad.top,
        right: base.x + base.width + seamPad + pad.right,
        bottom: base.y + base.height + seamPad + pad.bottom
      };
    }

    /** How far right a row may extend at this Y — full width above/below speaker, narrow beside it. */
    function odqCarouselSpeakerRowMaxRight(safeBounds, speakerRect, rowTop, rowBottom, padSpec) {
      if (!safeBounds) return 0;
      const safeRight = safeBounds.right;
      const sp = odqCarouselSpeakerExpandedRect(speakerRect, padSpec);
      if (!sp) return safeRight;
      if (rowBottom <= sp.top || rowTop >= sp.bottom) return safeRight;
      return Math.min(safeRight, sp.left);
    }

    function odqStripPlanAtOverlapsCarouselSpeaker(spec, cx, cy, speakerRect, padSpec) {
      const sp = odqCarouselSpeakerExpandedRect(speakerRect, padSpec);
      if (!sp) return false;
      const ar = odqStripPlanAxisRect({ ...spec, x: cx, y: cy }, 6);
      return !(
        ar.right <= sp.left ||
        ar.left >= sp.right ||
        ar.bottom <= sp.top ||
        ar.top >= sp.bottom
      );
    }

    function odqLayoutBPostStripInnerColumnForCarouselSpeaker(layoutW, layoutH, speakerRect) {
      const bounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(layoutW, layoutH, speakerRect);
      if (!bounds) return null;
      return bounds;
    }

    /** Axis-aligned footprint width/height for flow layout (includes tilt). */
    function odqStripPlanFootprintW(spec, pad = 8) {
      const ar = odqStripPlanAxisRect(spec, pad);
      return Math.max(1, ar.right - ar.left);
    }

    function odqStripPlanFootprintH(spec, pad = 8) {
      const ar = odqStripPlanAxisRect(spec, pad);
      return Math.max(1, ar.bottom - ar.top);
    }

    function odqStripPlanClusterAxisBounds(plan, pad = 8) {
      const strips = Array.isArray(plan) ? plan : [];
      if (!strips.length) return null;
      let minL = Infinity;
      let minT = Infinity;
      let maxR = -Infinity;
      let maxB = -Infinity;
      for (const s of strips) {
        const ar = odqStripPlanAxisRect(s, pad);
        minL = Math.min(minL, ar.left);
        minT = Math.min(minT, ar.top);
        maxR = Math.max(maxR, ar.right);
        maxB = Math.max(maxB, ar.bottom);
      }
      if (!Number.isFinite(minL)) return null;
      return {
        left: minL,
        top: minT,
        right: maxR,
        bottom: maxB,
        cx: (minL + maxR) / 2,
        cy: (minT + maxB) / 2,
        width: maxR - minL,
        height: maxB - minT
      };
    }

    /** Short carousel quotes: center quote + author cluster toward panel middle (above bottom-right speaker). */
    function odqCenterCarouselShortQuoteStripCluster(
      quoteStrips,
      authors,
      layoutW,
      layoutH,
      speakerRect,
      bounds,
      layoutSeed = '',
      stripLayoutSeed = 0
    ) {
      const quotes = (Array.isArray(quoteStrips) ? quoteStrips : []).map((s) => ({ ...s }));
      const authorStrips = (Array.isArray(authors) ? authors : []).map((s) => ({ ...s }));
      if (!quotes.length || !speakerRect) return [...quotes, ...authorStrips];
      const sp = odqCarouselSpeakerExpandedRect(speakerRect, ODQ_CAROUSEL_SPEAKER_AVOID_PAD);
      if (!bounds || !sp) return [...quotes, ...authorStrips];

      const quoteCluster = odqStripPlanClusterAxisBounds(quotes);
      let authorRowTop = quoteCluster ? quoteCluster.bottom + 26 : bounds.top + 80;
      for (let aIdx = 0; aIdx < authorStrips.length; aIdx++) {
        const a = authorStrips[aIdx];
        a.angle =
          odqPostStripStaggerTiltRad(quotes.length + aIdx, a, layoutSeed, stripLayoutSeed) * 0.7;
        const fw = odqStripPlanFootprintW(a, 8);
        const fh = odqStripPlanFootprintH(a, 8);
        const hash = odqPostStripStaggerHash(layoutSeed, stripLayoutSeed, aIdx, 'short_author');
        const roll = odqPostStripStaggerRoll(hash, 5);
        const anchorCx = quoteCluster ? quoteCluster.cx : (bounds.left + bounds.right) / 2;
        a.x = anchorCx + (roll - 0.5) * Math.min(120, bounds.right - bounds.left) * 0.28;
        a.y = authorRowTop + fh / 2;
        authorRowTop += fh + 20;
      }

      const allStrips = [...quotes, ...authorStrips];
      const cluster = odqStripPlanClusterAxisBounds(allStrips);
      if (!cluster) return allStrips;

      const safeRight = Math.min(bounds.right, sp.left - 12);
      const bandLeft = bounds.left + 28;
      const bandRight = safeRight - 20;
      const bandTop = bounds.top + 12;
      const bandBottom = bounds.bottom - 12;
      const minCx = bandLeft + cluster.width / 2;
      const maxCx = bandRight - cluster.width / 2;
      const minCy = bandTop + cluster.height / 2;
      const maxCy = bandBottom - cluster.height / 2;
      const idealCy = bounds.top + (bounds.bottom - bounds.top) * 0.5;
      const targetCx =
        maxCx >= minCx ? (minCx + maxCx) / 2 : (bandLeft + bandRight) / 2;
      const targetCy =
        maxCy >= minCy
          ? Math.max(minCy, Math.min(maxCy, idealCy))
          : (bandTop + bandBottom) / 2;
      const dx = targetCx - cluster.cx;
      const dy = targetCy - cluster.cy;
      for (const s of allStrips) {
        s.x = Number(s.x || 0) + dx;
        s.y = Number(s.y || 0) + dy;
      }
      let shifted = odqStripPlanClusterAxisBounds(allStrips, 12);
      if (shifted && shifted.left < bandLeft) {
        const fixDx = bandLeft - shifted.left;
        for (const s of allStrips) s.x = Number(s.x || 0) + fixDx;
      }
      shifted = odqStripPlanClusterAxisBounds(allStrips, 12);
      if (shifted && shifted.right > bandRight) {
        const fixDx = bandRight - shifted.right;
        for (const s of allStrips) s.x = Number(s.x || 0) + fixDx;
      }
      return allStrips;
    }

    function odqCarouselSpeakerLayoutShelves(bounds, speakerRect, padSpec) {
      const sp = odqCarouselSpeakerExpandedRect(speakerRect, padSpec);
      if (!sp || !bounds) {
        return [{ top: bounds.top, bottom: bounds.bottom, maxRight: bounds.right, fullWidth: true }];
      }
      const shelves = [];
      if (sp.top - bounds.top > 32) {
        shelves.push({
          top: bounds.top,
          bottom: sp.top,
          maxRight: bounds.right,
          fullWidth: true
        });
      }
      if (sp.bottom - sp.top > 32) {
        shelves.push({
          top: sp.top,
          bottom: sp.bottom,
          maxRight: Math.min(bounds.right, sp.left),
          fullWidth: false
        });
      }
      if (bounds.bottom - sp.bottom > 32) {
        shelves.push({
          top: sp.bottom,
          bottom: bounds.bottom,
          maxRight: bounds.right,
          fullWidth: true
        });
      }
      if (!shelves.length) {
        shelves.push({
          top: bounds.top,
          bottom: bounds.bottom,
          maxRight: Math.min(bounds.right, sp.left),
          fullWidth: false
        });
      }
      return shelves;
    }

    /**
     * Carousel slide 1: LTR flow on three shelves — full width above/below speaker, narrow beside.
     */
    function odqApplyCarouselSpeakerStripFlowLayout(plan, layoutW, layoutH, opts = {}) {
      const strips = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));
      if (!strips.length || !opts.carouselSpeakerAvoidRect) return strips;
      const bounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
        layoutW,
        layoutH,
        opts.carouselSpeakerAvoidRect
      );
      if (!bounds) return strips;
      const speakerRect = opts.carouselSpeakerAvoidRect;
      const layoutSeed = String(opts.layoutSeed || opts.dateKey || 'layout_b_carousel');
      const stripLayoutSeed = odqNormalizeStripLayoutSeed(opts.stripLayoutSeed);
      const quoteStrips = odqSortCarouselQuoteStripsByTextOrder(
        strips.filter((s) => s.role !== 'author'),
        opts.quoteText
      );
      const authors = strips.filter((s) => s.role === 'author');
      /** Long quotes: ignore rowGroup side-by-side — one strip per vertical row. */
      const quoteRows = opts.carouselShortQuote
        ? odqGroupLayoutBStripPlanRowsByReadingOrder(quoteStrips)
        : quoteStrips.map((s) => [s]);
      const speakerPad = ODQ_CAROUSEL_SPEAKER_AVOID_PAD;
      let shelves = odqCarouselSpeakerLayoutShelves(bounds, speakerRect, speakerPad);
      if (opts.carouselShortQuote) {
        const sp = odqCarouselSpeakerExpandedRect(speakerRect, speakerPad);
        if (sp && sp.top - bounds.top > 64) {
          shelves = [
            {
              top: bounds.top,
              bottom: sp.top,
              maxRight: bounds.right,
              fullWidth: true
            }
          ];
        }
      }
      const safePad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD;
      const visualPad = safePad + ODQ_CAROUSEL_STRIP_DRAW_BLEED;
      const minGap = ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP;
      const bandLeft = bounds.left + 20;
      const rowBandMaxRight = (top, bottom) =>
        odqCarouselSpeakerRowMaxRight(bounds, speakerRect, top, bottom, speakerPad);
      let prevBottom = bounds.top + 12;

      const placeStrip = (s, r, slot) => {
        s.angle = odqPostStripStaggerTiltRad(r * 2 + slot, s, layoutSeed, stripLayoutSeed);
        if (slot === 1) {
          s.angle =
            odqPostStripStaggerTiltRad(r * 2 + slot, s, layoutSeed, stripLayoutSeed) * -0.85 +
            odqDeterministicStripJitterPx(s, 0.012);
        }
        const fh = odqStripPlanFootprintH(s, safePad);
        const fw = odqStripPlanFootprintW(s, safePad);
        const rowTop = prevBottom;
        const rowBottom = prevBottom + fh;
        const maxRight = rowBandMaxRight(rowTop, rowBottom);
        const hash = odqPostStripStaggerHash(
          layoutSeed,
          stripLayoutSeed,
          r * 5 + slot,
          s?.seed || 'carousel_stack'
        );
        const roll = odqPostStripStaggerRoll(hash, 3);
        const bandSpan = Math.max(8, maxRight - bandLeft - fw);
        let cx = bandLeft + fw / 2 + roll * Math.min(64, bandSpan * 0.2);
        cx = Math.max(bandLeft + fw / 2 + 4, Math.min(maxRight - fw / 2 - 4, cx));
        s.x = cx;
        s.y = prevBottom + fh / 2 + safePad;
        {
          const ar = odqStripPlanAxisRect(s, visualPad);
          s.y += prevBottom - ar.top;
        }
        for (let pass = 0; pass < 8 && odqStripPlanOverlapsCarouselSpeaker(s, speakerRect); pass++) {
          s.x -= 16;
          s.x = Math.max(bandLeft + fw / 2 + 4, s.x);
        }
        prevBottom = odqStripPlanAxisRect(s, visualPad).bottom + minGap;
      };

      for (let r = 0; r < quoteRows.length; r++) {
        const rowStrips = quoteRows[r]
          .slice()
          .sort((a, b) => quoteStrips.indexOf(a) - quoteStrips.indexOf(b));
        for (let slot = 0; slot < rowStrips.length; slot++) {
          if (slot > 0) prevBottom += minGap * 0.5;
          placeStrip(rowStrips[slot], r, slot);
        }
      }

      let minTop = Infinity;
      for (const s of quoteStrips) {
        minTop = Math.min(minTop, odqStripPlanAxisRect(s, safePad).top);
      }
      if (minTop < bounds.top + 6) {
        const dy = bounds.top + 6 - minTop;
        for (const s of quoteStrips) s.y = Number(s.y || 0) + dy;
      }
      for (const s of quoteStrips) {
        const halfW = odqStripPlanFootprintW(s, safePad) / 2;
        const halfH = odqStripPlanFootprintH(s, safePad) / 2;
        s.x = Math.max(bounds.left + halfW, Math.min(bounds.right - halfW, Number(s.x || 0)));
        s.y = Math.max(bounds.top + halfH, Math.min(bounds.bottom - halfH, Number(s.y || 0)));
      }

      if (opts.carouselShortQuote) {
        const placedQuotes = odqApplyCarouselSpeakerStripScatterNudge(
          quoteStrips,
          bounds,
          speakerRect,
          layoutSeed,
          stripLayoutSeed
        );
        const shortOut = odqCarouselSpeakerAnchorAuthorStripTerminal(
          odqCenterCarouselShortQuoteStripCluster(
            placedQuotes,
            authors,
            layoutW,
            layoutH,
            speakerRect,
            bounds,
            layoutSeed,
            stripLayoutSeed
          ),
          layoutW,
          layoutH,
          speakerRect,
          layoutSeed,
          stripLayoutSeed,
          { shortQuote: true }
        );
        return typeof globalThis.odqCarouselApplyTextSafeConstraints === 'function'
          ? globalThis.odqCarouselApplyTextSafeConstraints(
              shortOut,
              layoutW,
              layoutH,
              speakerRect,
              12,
              opts.quoteText
            )
          : shortOut;
      }

      let placed = odqCarouselSpeakerEnforceReadingOrderStripGaps(
        quoteStrips,
        ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP
      );
      for (let aIdx = 0; aIdx < authors.length; aIdx++) {
        const a = authors[aIdx];
        a.angle =
          odqPostStripStaggerTiltRad(quoteRows.length + aIdx, a, layoutSeed, stripLayoutSeed) * 0.7;
      }
      const flowOut = [...placed, ...authors];
      return typeof globalThis.odqCarouselApplyTextSafeConstraints === 'function'
        ? globalThis.odqCarouselApplyTextSafeConstraints(
            flowOut,
            layoutW,
            layoutH,
            speakerRect,
            10,
            opts.quoteText
          )
        : flowOut;
    }

    /** Pull some same-row neighbors closer; leave others at natural flow gaps. */
    function odqCarouselSpeakerVariedSameRowGaps(plan, layoutSeed = '', stripLayoutSeed = 0) {
      const quotes = (Array.isArray(plan) ? plan : []).filter((s) => s.role !== 'author');
      const rows = odqCarouselSpeakerVisualRows(quotes);
      for (const row of rows) {
        if (row.items.length < 2) continue;
        row.items.sort((a, b) => Number(a.x || 0) - Number(b.x || 0));
        for (let i = 1; i < row.items.length; i++) {
          if (odqCarouselSpeakerIsLeadQuotePair(row.items[i - 1], row.items[i])) continue;
          odqCarouselSpeakerTightenStripPair(
            row.items[i - 1],
            row.items[i],
            layoutSeed,
            stripLayoutSeed,
            Math.round(row.y) + i
          );
        }
      }
      const ordered = odqGroupLayoutBStripPlanRowsByReadingOrder(quotes).flat();
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1];
        const cur = ordered[i];
        if (prev.role === 'author' || cur.role === 'author') continue;
        if (Number(cur.x || 0) <= Number(prev.x || 0)) continue;
        const gap = odqStripPlanAxisRect(cur, 6).left - odqStripPlanAxisRect(prev, 6).right;
        if (gap > 420) continue;
        if (odqCarouselSpeakerIsLeadQuotePair(prev, cur)) continue;
        odqCarouselSpeakerTightenStripPair(prev, cur, layoutSeed, stripLayoutSeed, 900 + i);
      }
      return plan;
    }

    /** Side-by-side strips: lift every other neighbor slightly for a scattered row rhythm. */
    function odqCarouselSpeakerStaggerSameRowVerticalLift(plan, layoutSeed = '', stripLayoutSeed = 0) {
      const quotes = (Array.isArray(plan) ? plan : []).filter((s) => s.role !== 'author');
      const rows = odqCarouselSpeakerVisualRows(quotes);
      for (const row of rows) {
        if (row.items.length < 2) continue;
        row.items.sort((a, b) => Number(a.x || 0) - Number(b.x || 0));
        for (let i = 1; i < row.items.length; i++) {
          const spec = row.items[i];
          const prev = row.items[i - 1];
          if (odqCarouselSpeakerIsLeadQuotePair(prev, spec)) continue;
          const hash = odqPostStripStaggerHash(
            layoutSeed,
            stripLayoutSeed,
            Math.round(row.y) + i * 3,
            `${spec?.seed || 'lift'}_v`
          );
          const lift = 14 + Math.round(odqPostStripStaggerRoll(hash, 11) * 18);
          const maxLift = Math.min(
            lift,
            Math.max(
              10,
              Math.round(
                (odqStripPlanFootprintH(prev, 8) + odqStripPlanFootprintH(spec, 8)) * 0.34
              )
            )
          );
          if (i % 2 === 1) {
            spec.y = Number(spec.y || 0) - maxLift;
            prev.y = Number(prev.y || 0) + Math.round(maxLift * 0.32);
          } else if (odqPostStripStaggerRoll(hash, 7) < 0.42) {
            spec.y = Number(spec.y || 0) + Math.round(lift * 0.38);
          }
        }
      }
      const ordered = odqGroupLayoutBStripPlanRowsByReadingOrder(quotes).flat();
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1];
        const cur = ordered[i];
        if (prev.role === 'author' || cur.role === 'author') continue;
        if (Number(cur.x || 0) <= Number(prev.x || 0)) continue;
        if (Math.abs(Number(cur.y || 0) - Number(prev.y || 0)) >= 30) continue;
        const prevAr = odqStripPlanAxisRect(prev, 6);
        const curAr = odqStripPlanAxisRect(cur, 6);
        const gap = curAr.left - prevAr.right;
        if (gap > 420 || gap < -28) continue;
        const yOverlap =
          Math.min(prevAr.bottom, curAr.bottom) - Math.max(prevAr.top, curAr.top);
        if (
          yOverlap <
          Math.min(odqStripPlanFootprintH(prev, 8), odqStripPlanFootprintH(cur, 8)) * 0.38
        ) {
          continue;
        }
        if (odqCarouselSpeakerIsLeadQuotePair(prev, cur)) continue;
        const hash = odqPostStripStaggerHash(layoutSeed, stripLayoutSeed, 1200 + i, 'adj_lift');
        const lift = 12 + Math.round(odqPostStripStaggerRoll(hash, 13) * 20);
        cur.y = Number(cur.y || 0) - lift;
      }
      odqCarouselSpeakerFixAllSameRowPairOverlaps(plan, 10, null, 0, 0);
      return plan;
    }

    /** Hard LTR / row-stack gaps from reading order — runs after clamp so strips do not pile up. */
    function odqCarouselSpeakerEnforceReadingOrderStripGaps(plan, minGap = 12) {
      const strips = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));
      const quotes = strips.filter((s) => s.role !== 'author');
      const authors = strips.filter((s) => s.role === 'author');
      const pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD;
      const gap = Math.max(ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP, Number(minGap) || ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP);
      const rows = odqGroupLayoutBStripPlanRowsByReadingOrder(quotes);
      for (let pass = 0; pass < 24; pass++) {
        let moved = false;
        for (const row of rows) {
          const items = [...row].sort(
            (a, b) => (a.rowSlot ?? 0) - (b.rowSlot ?? 0) || Number(a.x || 0) - Number(b.x || 0)
          );
          for (let i = 1; i < items.length; i++) {
            const prev = items[i - 1];
            const cur = items[i];
            const need =
              odqStripPlanAxisRect(prev, pad).right + gap - odqStripPlanAxisRect(cur, pad).left;
            if (need > 0) {
              cur.x = Number(cur.x || 0) + need;
              moved = true;
            }
          }
        }
        const flat = rows.flat();
        for (let i = 1; i < flat.length; i++) {
          const prev = flat[i - 1];
          const cur = flat[i];
          if (prev.role === 'author' || cur.role === 'author') continue;
          const prevR = odqStripPlanAxisRect(prev, pad);
          const curR = odqStripPlanAxisRect(cur, pad);
          if (curR.top < prevR.bottom + gap - 2) {
            cur.y = Number(cur.y || 0) + (prevR.bottom + gap - curR.top);
            moved = true;
          }
        }
        for (let i = 1; i < flat.length; i++) {
          const prev = flat[i - 1];
          const cur = flat[i];
          const prevR = odqStripPlanAxisRect(prev, pad);
          const curR = odqStripPlanAxisRect(cur, pad);
          if (Number(cur.y || 0) < Number(prev.y || 0) - 6) {
            cur.y = prevR.bottom + gap + (curR.bottom - curR.top) / 2;
            moved = true;
          }
          if (Math.abs(Number(cur.y || 0) - Number(prev.y || 0)) < 36) {
            if (Number(cur.x || 0) < Number(prev.x || 0) - 4) {
              cur.y = prevR.bottom + gap + (curR.bottom - curR.top) / 2;
              moved = true;
            } else if (Number(cur.x || 0) > Number(prev.x || 0)) {
              const need = prevR.right + gap - curR.left;
              if (need > 0) {
                cur.x = Number(cur.x || 0) + need;
                moved = true;
              }
            }
          }
        }
        for (let i = 1; i < flat.length; i++) {
          const prev = flat[i - 1];
          const cur = flat[i];
          if (Number(cur.x || 0) <= Number(prev.x || 0)) continue;
          if (Math.abs(Number(cur.y || 0) - Number(prev.y || 0)) > 36) continue;
          const need =
            odqStripPlanAxisRect(prev, pad).right + gap - odqStripPlanAxisRect(cur, pad).left;
          if (need > 0) {
            cur.x = Number(cur.x || 0) + need;
            moved = true;
          }
        }
        for (let r = 1; r < rows.length; r++) {
          let prevBottom = -Infinity;
          for (const s of rows[r - 1]) {
            prevBottom = Math.max(prevBottom, odqStripPlanAxisRect(s, pad).bottom);
          }
          for (const s of rows[r]) {
            const need = prevBottom + gap - odqStripPlanAxisRect(s, pad).top;
            if (need > 0) {
              s.y = Number(s.y || 0) + need;
              moved = true;
            }
          }
        }
        for (let i = 0; i < flat.length; i++) {
          for (let j = i + 1; j < flat.length; j++) {
            const a = flat[i];
            const b = flat[j];
            if (a.role === 'author' || b.role === 'author') continue;
            const ra = odqStripPlanAxisRect(a, pad);
            const rb = odqStripPlanAxisRect(b, pad);
            const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (ox <= 0 || oy <= 0) continue;
            if (ox <= oy) {
              const left = Number(a.x || 0) <= Number(b.x || 0) ? a : b;
              const right = left === a ? b : a;
              const leftR = odqStripPlanAxisRect(left, pad);
              const rightR = odqStripPlanAxisRect(right, pad);
              const need = leftR.right + gap - rightR.left;
              if (need > 0) {
                right.x = Number(right.x || 0) + need;
                moved = true;
              }
            } else {
              const top = Number(a.y || 0) <= Number(b.y || 0) ? a : b;
              const bottom = top === a ? b : a;
              const topR = odqStripPlanAxisRect(top, pad);
              const bottomR = odqStripPlanAxisRect(bottom, pad);
              const need = topR.bottom + gap - bottomR.top;
              if (need > 0) {
                bottom.y = Number(bottom.y || 0) + need;
                moved = true;
              }
            }
          }
        }
        if (!moved) break;
      }
      return [...quotes, ...authors];
    }

    function odqCarouselSpeakerVisualRows(plan) {
      const rows = [];
      const rowYTol = 34;
      for (const s of Array.isArray(plan) ? plan : []) {
        if (s.role === 'author') continue;
        const y = Number(s.y || 0);
        let row = rows.find((r) => Math.abs(r.y - y) < rowYTol);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push(s);
        row.y = row.items.reduce((sum, it) => sum + Number(it.y || 0), 0) / row.items.length;
      }
      for (const s of Array.isArray(plan) ? plan : []) {
        if (s.role !== 'author') continue;
        rows.push({ y: Number(s.y || 0), items: [s] });
      }
      rows.sort((a, b) => a.y - b.y);
      return rows;
    }

    /** Vary vertical gaps between visual strip rows — some tight, some airy. */
    function odqCarouselSpeakerVariedRowGaps(
      plan,
      layoutW,
      layoutH,
      speakerRect,
      layoutSeed = '',
      stripLayoutSeed = 0
    ) {
      const rows = odqCarouselSpeakerVisualRows(plan);
      if (rows.length < 2) return plan;
      const bounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
        layoutW,
        layoutH,
        speakerRect
      );
      for (let i = 1; i < rows.length; i++) {
        const prevRow = rows[i - 1];
        const curRow = rows[i];
        let prevBottom = -Infinity;
        let curTop = Infinity;
        for (const s of prevRow.items) {
          prevBottom = Math.max(prevBottom, odqStripPlanAxisRect(s, 6).bottom);
        }
        for (const s of curRow.items) {
          curTop = Math.min(curTop, odqStripPlanAxisRect(s, 6).top);
        }
        if (!Number.isFinite(prevBottom) || !Number.isFinite(curTop)) continue;
        const currentGap = curTop - prevBottom;
        const hash = odqPostStripStaggerHash(
          layoutSeed,
          stripLayoutSeed,
          Math.round(curRow.y) + i * 17,
          'carousel_row_vgap'
        );
        const roll = odqPostStripStaggerRoll(hash, 9);
        if (roll > 0.54) continue;
        let targetGap;
        if (roll < 0.22) {
          targetGap = 10 + Math.round(odqPostStripStaggerRoll(hash, 3) * 8);
        } else if (roll < 0.38) {
          targetGap = 10 + Math.round(odqPostStripStaggerRoll(hash, 7) * 10);
        } else {
          targetGap = 22 + Math.round(odqPostStripStaggerRoll(hash, 11) * 20);
        }
        if (Math.abs(currentGap - targetGap) <= 4) continue;
        let shift = currentGap - targetGap;
        if (!shift) continue;
        const moveRows = [];
        for (let j = i; j < rows.length; j++) {
          if (rows[j].items.some((s) => s.role === 'author')) break;
          moveRows.push(rows[j]);
        }
        if (!moveRows.length) continue;
        if (speakerRect && shift < 0) {
          for (const row of moveRows) {
            for (const s of row.items) {
              if (
                odqStripPlanAtOverlapsCarouselSpeaker(
                  s,
                  Number(s.x || 0),
                  Number(s.y || 0) - shift,
                  speakerRect
                )
              ) {
                shift = 0;
                break;
              }
            }
            if (!shift) break;
          }
        }
        if (shift && bounds) {
          for (const row of moveRows) {
            for (const s of row.items) {
              const halfH = odqStripPlanFootprintH(s, 8) / 2;
              const nextY = Number(s.y || 0) - shift;
              if (nextY - halfH < bounds.top) {
                shift = Math.min(shift, Number(s.y || 0) - halfH - bounds.top);
              }
              if (nextY + halfH > bounds.bottom) {
                shift = Math.max(shift, Number(s.y || 0) + halfH - bounds.bottom);
              }
            }
          }
        }
        if (!shift) continue;
        for (const row of moveRows) {
          for (const s of row.items) {
            s.y = Number(s.y || 0) - shift;
          }
        }
      }
      return plan;
    }

    function odqCarouselSpeakerSeparateAuthorRow(plan) {
      return plan;
    }

    /** Speaker name on its own row: always below the quote cluster when possible. */
    function odqCarouselSpeakerAnchorAuthorStripTerminal(
      plan,
      layoutW,
      layoutH,
      speakerRect,
      layoutSeed = '',
      stripLayoutSeed = 0,
      opts = {}
    ) {
      const shortQuote = opts.shortQuote === true;
      const authors = (Array.isArray(plan) ? plan : []).filter((s) => s.role === 'author');
      const quotes = (Array.isArray(plan) ? plan : []).filter((s) => s.role !== 'author');
      if (!authors.length || !quotes.length) return plan;
      const bounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
        layoutW,
        layoutH,
        speakerRect
      );
      if (!bounds) return plan;
      const sp = odqCarouselSpeakerExpandedRect(speakerRect, ODQ_CAROUSEL_SPEAKER_AVOID_PAD);
      const safeRight = sp ? Math.min(bounds.right, sp.left - 14) : bounds.right;
      const bandLeft = bounds.left + 20;
      const authorRowGap = shortQuote ? 36 : 56;
      const pad = 8;
      const measureQuotes = () => {
        let quoteBottom = -Infinity;
        for (const q of quotes) {
          quoteBottom = Math.max(quoteBottom, odqStripPlanAxisRect(q, pad).bottom);
        }
        return quoteBottom;
      };
      const liftQuotesForAuthorRow = (fh) => {
        for (let pass = 0; pass < 32; pass++) {
          const maxQBottom = measureQuotes();
          if (maxQBottom + authorRowGap + fh <= bounds.bottom - 4) return;
          const need = maxQBottom + authorRowGap + fh - (bounds.bottom - 4);
          let minQuoteTop = Infinity;
          for (const q of quotes) {
            minQuoteTop = Math.min(minQuoteTop, odqStripPlanAxisRect(q, pad).top);
          }
          const maxLift = Math.max(0, minQuoteTop - bounds.top - 6);
          const lift = Math.min(need, Math.max(6, maxLift));
          if (lift <= 0) {
            for (const q of quotes) {
              q.y = Number(q.y || 0) - Math.min(need, 10);
            }
            continue;
          }
          for (const q of quotes) {
            q.y = Number(q.y || 0) - lift;
          }
        }
      };
      const quoteCluster = odqStripPlanClusterAxisBounds(quotes, pad);
      for (let aIdx = 0; aIdx < authors.length; aIdx++) {
        const a = authors[aIdx];
        const fh = odqStripPlanFootprintH(a, 8);
        const fw = odqStripPlanFootprintW(a, 8);
        for (let attempt = 0; attempt < 16; attempt++) {
          if (shortQuote) {
            liftQuotesForAuthorRow(fh);
          }
          const maxQBottom = measureQuotes();
          if (maxQBottom + authorRowGap + fh <= bounds.bottom - 4) break;
        }
        const hash = odqPostStripStaggerHash(layoutSeed, stripLayoutSeed, aIdx, 'author_terminal');
        const roll = odqPostStripStaggerRoll(hash, 5);
        const maxQBottom = measureQuotes();
        const authorLineTop = maxQBottom + authorRowGap;
        let targetCx;
        if (shortQuote) {
          targetCx = quoteCluster
            ? quoteCluster.cx + (roll - 0.5) * Math.min(64, safeRight - bandLeft) * 0.12
            : (bandLeft + safeRight) / 2;
        } else {
          targetCx = Math.max(bandLeft + fw / 2, safeRight - fw / 2 - roll * 10);
        }
        a.y = authorLineTop + fh / 2;
        a.x = Math.max(bandLeft + fw / 2, Math.min(safeRight - fw / 2, targetCx));
        for (let pass = 0; pass < 12; pass++) {
          let moved = false;
          const aR = odqStripPlanAxisRect(a, pad);
          for (const q of quotes) {
            const qR = odqStripPlanAxisRect(q, pad);
            if (qR.bottom <= aR.top - authorRowGap) continue;
            a.y = Number(a.y || 0) + Math.max(0, qR.bottom + authorRowGap - aR.top);
            moved = true;
            break;
          }
          if (!moved) break;
        }
        a.y = Math.max(authorLineTop + fh / 2, Number(a.y || 0));
        if (a.y + fh / 2 > bounds.bottom - 2) {
          if (shortQuote) {
            liftQuotesForAuthorRow(fh);
          }
          const liftedBottom = measureQuotes();
          a.y = liftedBottom + authorRowGap + fh / 2;
        }
        if (a.y - fh / 2 < bounds.top + 4) {
          a.y = bounds.top + fh / 2 + 4;
        }
        a.x = Math.max(bandLeft + fw / 2, Math.min(safeRight - fw / 2, targetCx));
      }
      return [...quotes, ...authors];
    }

    function odqCarouselSpeakerTightenStripPair(prev, cur, layoutSeed, stripLayoutSeed, hashKey) {
      if (prev.role === 'author' || cur.role === 'author') return;
      const hash = odqPostStripStaggerHash(
        layoutSeed,
        stripLayoutSeed,
        hashKey,
        `${prev?.seed || 'p'}_${cur?.seed || 'c'}`
      );
      const roll = odqPostStripStaggerRoll(hash, 7);
      const prevAr = odqStripPlanAxisRect(prev, 6);
      const curAr = odqStripPlanAxisRect(cur, 6);
      const prevW = prevAr.right - prevAr.left;
      const forceTight = prevW <= 180;
      const currentGap = curAr.left - prevAr.right;
      if (currentGap < 0) {
        const targetGap = forceTight
          ? 2 + Math.round(odqPostStripStaggerRoll(hash, 9) * 6)
          : 6 + Math.round(odqPostStripStaggerRoll(hash, 11) * 8);
        cur.x = Number(cur.x || 0) + (targetGap - currentGap);
        return;
      }
      if (currentGap <= 6) return;
      let targetGap;
      if (forceTight) {
        targetGap =
          roll < 0.38
            ? Math.round(odqPostStripStaggerRoll(hash, 3) * 4)
            : roll < 0.72
              ? 6 + Math.round(odqPostStripStaggerRoll(hash, 11) * 6)
              : 12 + Math.round(odqPostStripStaggerRoll(hash, 5) * 10);
      } else if (roll < 0.28) {
        targetGap = 4 + Math.round(odqPostStripStaggerRoll(hash, 3) * 8);
      } else if (roll < 0.58) {
        targetGap = 8 + Math.round(odqPostStripStaggerRoll(hash, 11) * 10);
      } else {
        return;
      }
      const shift = currentGap - targetGap;
      cur.x = Number(cur.x || 0) - shift;
    }

    /** Small positional jitter that preserves LTR reading order and avoids the speaker. */
    function odqApplyCarouselSpeakerStripScatterNudge(
      plan,
      bounds,
      speakerRect,
      layoutSeed = '',
      stripLayoutSeed = 0
    ) {
      const ordered = odqGroupLayoutBStripPlanRowsByReadingOrder(plan.filter((s) => s.role !== 'author'))
        .flat()
        .concat(plan.filter((s) => s.role === 'author'));
      const placed = [];
      for (let i = 0; i < ordered.length; i++) {
        const spec = ordered[i];
        const hash = odqPostStripStaggerHash(
          layoutSeed,
          stripLayoutSeed,
          i,
          `${spec?.seed || 'nudge'}_scatter`
        );
        let jx;
        if (i > 0 && Math.abs(Number(spec.y || 0) - Number(ordered[i - 1].y || 0)) < 28) {
          jx = 2 + odqPostStripStaggerRoll(hash, 5) * 10;
        } else {
          jx = (odqPostStripStaggerRoll(hash, 5) - 0.5) * 36;
        }
        const jy = 0;
        let cx = Number(spec.x || 0) + jx;
        let cy = Number(spec.y || 0) + jy;
        const halfW = odqStripPlanFootprintW(spec, 8) / 2;
        const halfH = odqStripPlanFootprintH(spec, 8) / 2;
        cx = Math.max(bounds.left + halfW, Math.min(bounds.right - halfW, cx));
        cy = Math.max(bounds.top + halfH, Math.min(bounds.bottom - halfH, cy));
        if (odqStripPlanAtOverlapsCarouselSpeaker(spec, cx, cy, speakerRect)) {
          const sp = odqCarouselSpeakerExpandedRect(speakerRect);
          const curAr = odqStripPlanAxisRect({ ...spec, x: cx, y: cy }, 8);
          if (sp && curAr.right > sp.left) {
            cx = sp.left - halfW - 12;
            cy = Number(spec.y || 0) + jy;
            cy = Math.max(bounds.top + halfH, Math.min(bounds.bottom - halfH, cy));
          } else {
            cx = Number(spec.x || 0);
            cy = Number(spec.y || 0);
          }
        }
        if (i > 0) {
          const prev = ordered[i - 1];
          const prevAr = odqStripPlanAxisRect(prev, 8);
          const curAr = odqStripPlanAxisRect({ ...spec, x: cx, y: cy }, 8);
          const sameRow = Math.abs(cy - Number(prev.y || 0)) < 28;
          const touchHash = odqPostStripStaggerHash(
            layoutSeed,
            stripLayoutSeed,
            i,
            'same_row_touch'
          );
          const minSameRowGap = 4 + Math.round(odqPostStripStaggerRoll(touchHash, 5) * 10);
          if (sameRow && curAr.left < prevAr.right + minSameRowGap) {
            cx = Number(spec.x || 0);
            cy = Number(spec.y || 0);
          } else if (!sameRow && curAr.top < prevAr.bottom - 4) {
            cy = Number(spec.y || 0);
          }
        }
        spec.x = cx;
        spec.y = cy;
        placed.push(spec);
      }
      return placed;
    }

    function odqStripPlanOverlapsCarouselSpeaker(spec, speakerRect, padSpec) {
      return odqStripPlanAtOverlapsCarouselSpeaker(
        spec,
        Number(spec.x || 0),
        Number(spec.y || 0),
        speakerRect,
        padSpec
      );
    }

    /** Hard evict: carousel seam draws the cutout on top of strips — none may overlap. */
    function odqCarouselSpeakerClampStripPlanOffCutout(plan, layoutW, layoutH, speakerRect) {
      const strips = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));
      if (!speakerRect || !strips.length) return strips;
      const bounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
        layoutW,
        layoutH,
        speakerRect
      );
      const sp = odqCarouselSpeakerExpandedRect(speakerRect);
      if (!sp || !bounds) return strips;
      for (let pass = 0; pass < 32; pass++) {
        let moved = false;
        for (const s of strips) {
          if (s.authorCutoutLabel) continue;
          if (!odqStripPlanOverlapsCarouselSpeaker(s, speakerRect)) continue;
          const ar = odqStripPlanAxisRect(s, 8);
          const halfW = odqStripPlanFootprintW(s, 8) / 2;
          const halfH = odqStripPlanFootprintH(s, 8) / 2;
          const overlapX = Math.min(ar.right, sp.right) - Math.max(ar.left, sp.left);
          const overlapY = Math.min(ar.bottom, sp.bottom) - Math.max(ar.top, sp.top);
          if (overlapX > 0) {
            s.x = Number(s.x || 0) - (overlapX + 14);
            s.x = Math.max(bounds.left + halfW, s.x);
            moved = true;
          }
          if (odqStripPlanOverlapsCarouselSpeaker(s, speakerRect) && overlapY > 0) {
            s.y = Number(s.y || 0) - (overlapY + 14);
            s.y = Math.max(bounds.top + halfH, s.y);
            moved = true;
          }
        }
        if (!moved) break;
      }
      return strips;
    }

    function odqClampLayoutBStripPlanToCarouselSpeakerRegion(plan, layoutW, layoutH, speakerRect) {
      const bounds = odqLayoutBPostStripScatterBoundsForCarouselSpeaker(layoutW, layoutH, speakerRect);
      if (!bounds || !speakerRect) return plan;
      const strips = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));
      for (const s of strips) {
        const halfW = odqStripPlanFootprintW(s, 8) / 2;
        const halfH = odqStripPlanFootprintH(s, 8) / 2;
        s.x = Math.max(bounds.left + halfW, Math.min(bounds.right - halfW, Number(s.x || 0)));
        if (s.role === 'author') continue;
        s.y = Math.max(bounds.top + halfH, Math.min(bounds.bottom - halfH, Number(s.y || 0)));
        for (let pass = 0; pass < 12 && odqStripPlanOverlapsCarouselSpeaker(s, speakerRect); pass++) {
          s.x -= 18;
          if (s.x - halfW < bounds.left) {
            s.x = bounds.left + halfW;
            s.y += 16;
          }
        }
      }
      return odqCarouselSpeakerClampStripPlanOffCutout(
        odqCarouselSpeakerEnforceReadingOrderStripGaps(strips, 10),
        layoutW,
        layoutH,
        speakerRect
      );
    }

    function odqClampLayoutBStripPlanToBounds(plan, bounds, edgePad = 10) {
      const strips = Array.isArray(plan) ? plan : [];
      if (!bounds || !strips.length) return strips;
      for (const s of strips) {
        const halfW = Number(s.w || 0) / 2 + edgePad;
        const halfH = Number(s.h || 0) / 2 + edgePad;
        s.x = Math.max(bounds.left + halfW, Math.min(bounds.right - halfW, Number(s.x || 0)));
        s.y = Math.max(bounds.top + halfH, Math.min(bounds.bottom - halfH, Number(s.y || 0)));
      }
      return strips;
    }

    /** Final pass: keep strips in safe zone and off the speaker cutout. */
    function odqReflowLayoutBStripPlanAroundCarouselSpeaker(plan, speakerRect, layoutW, layoutH) {
      const strips = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));
      if (!strips.length || !speakerRect) return strips;
      return odqClampLayoutBStripPlanToCarouselSpeakerRegion(strips, layoutW, layoutH, speakerRect);
    }

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
     * Admin override for speaker cutout placement on Layout B (story 9:16 and post 4:5).
     * Each preset locks the cutout to an absolute center (% of canvas) + a scale multiplier
     * vs `getSpeakerOverlayRect`'s base size. `AUTO` = no override.
     * Persisted per aspect in localStorage and instagram-images/{dateKey} on Firestore.
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

    /** Canvas fraction per nudge tap in the tune modal (2% of layout width/height). */
    const ODQ_SPEAKER_NUDGE_STEP = 0.02;
    /** Big nudge taps multiply {@link ODQ_SPEAKER_NUDGE_STEP} by this factor. */
    const ODQ_SPEAKER_BIG_NUDGE_MUL = 5;
    /** Degrees per rotate tap (clockwise positive). */
    const ODQ_SPEAKER_ROTATE_STEP_DEG = 3;
    /** Multiplier step per enlarge/shrink tap in the tune modal (12% per tap). */
    const ODQ_SPEAKER_SCALE_STEP = 0.12;

    function odqSpeakerCutoutNudgeFirestoreFields(aspect) {
      const a = odqNormalizeTuneAspect(aspect);
      return a === 'post'
        ? {
            cx: 'layoutBSpeakerCutoutNudgeCxPost',
            cy: 'layoutBSpeakerCutoutNudgeCyPost',
            rotate: 'layoutBSpeakerCutoutNudgeRotateDegPost',
            scaleMul: 'layoutBSpeakerCutoutScaleMulPost'
          }
        : {
            cx: 'layoutBSpeakerCutoutNudgeCxStory',
            cy: 'layoutBSpeakerCutoutNudgeCyStory',
            rotate: 'layoutBSpeakerCutoutNudgeRotateDegStory',
            scaleMul: 'layoutBSpeakerCutoutScaleMulStory'
          };
    }

    function odqNormalizeSpeakerScaleMul(raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || Math.abs(n - 1) < 0.005) return 1;
      return Math.round(Math.min(2.5, Math.max(0.45, n)) * 1000) / 1000;
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

    function odqSpeakerCutoutTweakIsCustomized(tweak) {
      if (!tweak) return false;
      return (
        (tweak.preset && tweak.preset !== 'AUTO') ||
        !!tweak.nudgeCx ||
        !!tweak.nudgeCy ||
        !!tweak.nudgeRotateDeg ||
        odqNormalizeSpeakerScaleMul(tweak.nudgeScale) !== 1
      );
    }

    function odqSpeakerCutoutTweakFromInstagramData(data, aspect) {
      const a = odqNormalizeTuneAspect(aspect);
      const presetField = a === 'post' ? 'layoutBSpeakerCutoutPresetPost' : 'layoutBSpeakerCutoutPresetStory';
      const nudgeFields = odqSpeakerCutoutNudgeFirestoreFields(a);
      const name = String(
        (data && data[presetField]) || (a === 'story' && data ? data.speakerCutoutPreset : '') || ''
      )
        .trim()
        .toUpperCase();
      const preset = Object.prototype.hasOwnProperty.call(ODQ_SPEAKER_PRESETS, name) ? name : 'AUTO';
      const presetUpdatedAt = String((data && data[`${presetField}UpdatedAt`]) || '').trim();
      const docUpdatedAt = String((data && data.layoutBTuneUpdatedAt) || '').trim();
      return {
        preset,
        nudgeCx: odqNormalizeSpeakerNudgeComponent(data && data[nudgeFields.cx]),
        nudgeCy: odqNormalizeSpeakerNudgeComponent(data && data[nudgeFields.cy]),
        nudgeRotateDeg: odqNormalizeSpeakerRotateDeg(data && data[nudgeFields.rotate]),
        nudgeScale: odqNormalizeSpeakerScaleMul(data && data[nudgeFields.scaleMul]),
        updatedAt: presetUpdatedAt || docUpdatedAt || ''
      };
    }

    /** True when `a` is strictly newer than `b` (ISO strings). */
    function odqIsoTimestampIsNewer(a, b) {
      const aStr = String(a || '').trim();
      const bStr = String(b || '').trim();
      if (!aStr) return false;
      if (!bStr) return true;
      const aMs = Date.parse(aStr);
      const bMs = Date.parse(bStr);
      if (Number.isFinite(aMs) && Number.isFinite(bMs)) return aMs > bMs;
      return aStr > bStr;
    }

    function odqParseSpeakerCutoutTweakRaw(parsed) {
      if (!parsed || typeof parsed !== 'object') {
        return { preset: 'AUTO', nudgeCx: 0, nudgeCy: 0, nudgeRotateDeg: 0, nudgeScale: 1, updatedAt: '' };
      }
      const name = String(parsed.preset || '').trim().toUpperCase();
      const preset = Object.prototype.hasOwnProperty.call(ODQ_SPEAKER_PRESETS, name) ? name : 'AUTO';
      return {
        preset,
        nudgeCx: odqNormalizeSpeakerNudgeComponent(parsed.nudgeCx),
        nudgeCy: odqNormalizeSpeakerNudgeComponent(parsed.nudgeCy),
        nudgeRotateDeg: odqNormalizeSpeakerRotateDeg(parsed.nudgeRotateDeg),
        nudgeScale: odqNormalizeSpeakerScaleMul(parsed.nudgeScale),
        updatedAt: String(parsed.updatedAt || '').trim()
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
      return { preset: 'AUTO', nudgeCx: 0, nudgeCy: 0, nudgeRotateDeg: 0, nudgeScale: 1, updatedAt: '' };
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
      const a = odqNormalizeTuneAspect(aspect);
      if (!key || !window.db || !window.firestore) return local;
      const readInstagramDoc = async (preferServer) => {
        const ref = window.firestore.doc(window.db, 'instagram-images', key);
        if (preferServer && typeof window.firestore.getDocFromServer === 'function') {
          try {
            return await window.firestore.getDocFromServer(ref);
          } catch (serverErr) {
            console.warn('odqReadSpeakerCutoutTweak server read failed, using cache:', serverErr);
          }
        }
        return window.firestore.getDoc(ref);
      };
      try {
        const snap = await readInstagramDoc(true);
        if (!snap.exists()) return local;
        const data = snap.data() || {};
        const remote = odqSpeakerCutoutTweakFromInstagramData(data, a);
        const remoteCustom = odqSpeakerCutoutTweakIsCustomized(remote);
        const localCustom = odqSpeakerCutoutTweakIsCustomized(local);
        const remoteAt = remote.updatedAt;
        const localAt = local.updatedAt;

        let useRemote = false;
        if (remoteCustom && !localCustom) {
          useRemote = true;
        } else if (!remoteCustom && localCustom) {
          useRemote = odqIsoTimestampIsNewer(remoteAt, localAt);
        } else if (remoteCustom && localCustom) {
          if (odqIsoTimestampIsNewer(remoteAt, localAt)) useRemote = true;
          else if (!odqIsoTimestampIsNewer(localAt, remoteAt)) useRemote = true;
        }

        const winner = useRemote ? remote : local;
        if (useRemote) {
          odqWriteSpeakerCutoutPreset(key, winner.preset, a, {
            cx: winner.nudgeCx,
            cy: winner.nudgeCy,
            rotateDeg: winner.nudgeRotateDeg,
            updatedAt: winner.updatedAt || remoteAt || undefined
          });
        } else if (!odqSpeakerCutoutTweakIsCustomized(winner) && localCustom) {
          odqWriteSpeakerCutoutPreset(key, 'AUTO', a);
        }
        return winner;
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
        if (app && typeof app.refreshQuoteSpeakerWidget === 'function') {
          void app.refreshQuoteSpeakerWidget(
            app.isAdminTomorrowPreviewActive?.() ? app.getEffectiveQuiltQuote?.() : null
          );
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
      const nScale = odqNormalizeSpeakerScaleMul(nudge?.scaleMul ?? nudge?.nudgeScale);
      const hasTweak = !!(nCx || nCy || nRot || nScale !== 1);
      const presetValid =
        name && name !== 'AUTO' && Object.prototype.hasOwnProperty.call(ODQ_SPEAKER_PRESETS, name);
      if (!presetValid && !hasTweak) {
        try {
          localStorage.removeItem(storageKey);
          if (odqNormalizeTuneAspect(aspect) === 'story') localStorage.removeItem(legacyKey);
        } catch (_) {
          /* ignore */
        }
        return;
      }
      const payload = { preset: presetValid ? name : 'AUTO' };
      if (nCx !== 0 || nCy !== 0) {
        payload.nudgeCx = nCx;
        payload.nudgeCy = nCy;
      }
      if (nRot !== 0) payload.nudgeRotateDeg = nRot;
      if (nScale !== 1) payload.nudgeScale = nScale;
      const updatedAt = String(nudge?.updatedAt || '').trim();
      if (updatedAt) payload.updatedAt = updatedAt;
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

    /** Preset transform with optional position nudge (% of canvas), rotate (degrees), and scale multiplier. */
    function odqSpeakerCutoutTransformResolved(presetName, nudge) {
      const dx = odqNormalizeSpeakerNudgeComponent(nudge?.cx ?? nudge?.nudgeCx);
      const dy = odqNormalizeSpeakerNudgeComponent(nudge?.cy ?? nudge?.nudgeCy);
      const rot = odqNormalizeSpeakerRotateDeg(nudge?.rotateDeg ?? nudge?.nudgeRotateDeg);
      const scaleMul = odqNormalizeSpeakerScaleMul(nudge?.scaleMul ?? nudge?.nudgeScale);
      const base = odqSpeakerCutoutTransformForPreset(presetName);
      if (!base) {
        if (!dx && !dy && !rot && scaleMul === 1) return null;
        return {
          autoRelative: true,
          nudgeCx: dx,
          nudgeCy: dy,
          rotateDeg: rot || undefined,
          scaleMul: scaleMul !== 1 ? scaleMul : undefined
        };
      }
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      const out = { ...base };
      if (dx && Number.isFinite(+out.cxPct)) out.cxPct = clamp(out.cxPct + dx, 0.02, 0.98);
      if (dy && Number.isFinite(+out.cyPct)) out.cyPct = clamp(out.cyPct + dy, 0.02, 0.98);
      if (rot) out.rotateDeg = rot;
      if (scaleMul !== 1) {
        if (Number.isFinite(+out.widthPct)) {
          out.widthPct = clamp(out.widthPct * scaleMul, 0.15, 3.5);
        } else {
          const baseScale = Number.isFinite(+out.scale) ? Number(out.scale) : 1;
          out.scale = clamp(baseScale * scaleMul, 0.15, 3.5);
        }
      }
      return out;
    }

    function odqApplySpeakerAutoRelativeTransform(speakerRect, speakerTransform, layoutW, layoutH) {
      if (!speakerRect || !speakerTransform?.autoRelative) return speakerRect;
      const dx = odqNormalizeSpeakerNudgeComponent(speakerTransform.nudgeCx);
      const dy = odqNormalizeSpeakerNudgeComponent(speakerTransform.nudgeCy);
      if (dx || dy) {
        speakerRect.x += dx * layoutW;
        speakerRect.y += dy * layoutH;
      }
      const scaleMul = odqNormalizeSpeakerScaleMul(speakerTransform.scaleMul);
      if (scaleMul !== 1) {
        const cx = speakerRect.x + speakerRect.width / 2;
        const cy = speakerRect.y + speakerRect.height / 2;
        speakerRect.width *= scaleMul;
        speakerRect.height *= scaleMul;
        speakerRect.x = cx - speakerRect.width / 2;
        speakerRect.y = cy - speakerRect.height / 2;
      }
      const rot = odqNormalizeSpeakerRotateDeg(speakerTransform.rotateDeg);
      if (rot) speakerRect.angle = (rot * Math.PI) / 180;
      return speakerRect;
    }

    function odqSpeakerCutoutTransformForDate(dateKey, aspect = 'story') {
      const t = odqReadSpeakerCutoutTweakFromLocal(dateKey, aspect);
      return odqSpeakerCutoutTransformResolved(t.preset, {
        cx: t.nudgeCx,
        cy: t.nudgeCy,
        rotateDeg: t.nudgeRotateDeg,
        nudgeScale: t.nudgeScale
      });
    }

    async function odqSpeakerCutoutTransformForDateAsync(dateKey, aspect = 'story') {
      const t = await odqReadSpeakerCutoutTweak(dateKey, aspect);
      return odqSpeakerCutoutTransformResolved(t.preset, {
        cx: t.nudgeCx,
        cy: t.nudgeCy,
        rotateDeg: t.nudgeRotateDeg,
        nudgeScale: t.nudgeScale
      });
    }

    const ODQ_KEYWORD_EMPHASIS_KEY = (dateKey, aspect) =>
      `odq.layoutBKeywordEmphasis.${String(dateKey || '').trim()}.${odqNormalizeTuneAspect(aspect)}`;
    const ODQ_STRIP_LAYOUT_SEED_KEY = (dateKey, aspect) =>
      `odq.layoutBStripLayoutSeed.${String(dateKey || '').trim()}.${odqNormalizeTuneAspect(aspect)}`;
    const ODQ_KEYWORD_EMPHASIS_LEGACY_KEY = (dateKey) => `odq.layoutBKeywordEmphasis.${String(dateKey || '').trim()}`;
    const ODQ_STRIP_LAYOUT_SEED_LEGACY_KEY = (dateKey) => `odq.layoutBStripLayoutSeed.${String(dateKey || '').trim()}`;
    const ODQ_QUILT_BG_ZOOM_KEY = (dateKey, aspect) =>
      `odq.layoutBQuiltBgZoom.${String(dateKey || '').trim()}.${odqNormalizeTuneAspect(aspect)}`;
    const ODQ_QUOTE_STRIP_OFFSET_KEY = (dateKey, aspect) =>
      `odq.layoutBQuoteStripOffset.${String(dateKey || '').trim()}.${odqNormalizeTuneAspect(aspect)}`;
    const odqKeywordEmphasisMemoryCache = Object.create(null);
    const odqStripLayoutSeedMemoryCache = Object.create(null);
    const odqQuiltBgZoomMemoryCache = Object.create(null);
    const odqQuoteStripOffsetMemoryCache = Object.create(null);

    function odqNormalizeQuiltBgZoom(raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN) return ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
      return Math.round(Math.min(ODQ_LAYOUT_B_QUILT_BG_ZOOM_MAX, Math.max(ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN, n)) * 1000) / 1000;
    }

    function odqNormalizeQuoteStripOffsetComponent(raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || Math.abs(n) < 0.0005) return 0;
      return Math.round(Math.min(0.35, Math.max(-0.35, n)) * 1000) / 1000;
    }

    function odqNormalizeQuoteStripOffset(raw) {
      return {
        x: odqNormalizeQuoteStripOffsetComponent(raw?.x ?? raw?.offsetX ?? raw?.dx),
        y: odqNormalizeQuoteStripOffsetComponent(raw?.y ?? raw?.offsetY ?? raw?.dy)
      };
    }

    function odqFormatQuiltBgZoomLabel(zoom) {
      const z = odqNormalizeQuiltBgZoom(zoom);
      if (z <= ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN + 0.0005) return 'Default';
      const pct = Math.round((z - 1) * 100);
      return pct > 0 ? `+${pct}%` : `${pct}%`;
    }

    function odqGetCachedLayoutBQuiltBgZoom(dateKey, aspect = 'story') {
      const cacheId = odqTuneAspectCacheId(dateKey, aspect);
      if (!cacheId || cacheId.startsWith(':')) return undefined;
      if (Object.prototype.hasOwnProperty.call(odqQuiltBgZoomMemoryCache, cacheId)) {
        return odqQuiltBgZoomMemoryCache[cacheId];
      }
      try {
        const raw = localStorage.getItem(ODQ_QUILT_BG_ZOOM_KEY(dateKey, aspect));
        if (raw == null) return undefined;
        const z = odqNormalizeQuiltBgZoom(raw);
        odqQuiltBgZoomMemoryCache[cacheId] = z;
        return z;
      } catch {
        return undefined;
      }
    }

    function odqSetCachedLayoutBQuiltBgZoom(dateKey, zoom, aspect = 'story') {
      const cacheId = odqTuneAspectCacheId(dateKey, aspect);
      if (!cacheId || cacheId.startsWith(':')) return;
      const z = odqNormalizeQuiltBgZoom(zoom);
      odqQuiltBgZoomMemoryCache[cacheId] = z;
      try {
        const storageKey = ODQ_QUILT_BG_ZOOM_KEY(dateKey, aspect);
        if (z > ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN + 0.0005) {
          localStorage.setItem(storageKey, String(z));
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (_) {
        /* ignore */
      }
    }

    function odqGetCachedLayoutBQuoteStripOffset(dateKey, aspect = 'story') {
      const cacheId = odqTuneAspectCacheId(dateKey, aspect);
      if (!cacheId || cacheId.startsWith(':')) return undefined;
      if (Object.prototype.hasOwnProperty.call(odqQuoteStripOffsetMemoryCache, cacheId)) {
        return odqQuoteStripOffsetMemoryCache[cacheId];
      }
      try {
        const raw = localStorage.getItem(ODQ_QUOTE_STRIP_OFFSET_KEY(dateKey, aspect));
        if (raw == null) return undefined;
        const offset = odqNormalizeQuoteStripOffset(JSON.parse(raw));
        odqQuoteStripOffsetMemoryCache[cacheId] = offset;
        return offset;
      } catch {
        return undefined;
      }
    }

    function odqSetCachedLayoutBQuoteStripOffset(dateKey, offset, aspect = 'story') {
      const cacheId = odqTuneAspectCacheId(dateKey, aspect);
      if (!cacheId || cacheId.startsWith(':')) return;
      const next = odqNormalizeQuoteStripOffset(offset);
      odqQuoteStripOffsetMemoryCache[cacheId] = next;
      try {
        const storageKey = ODQ_QUOTE_STRIP_OFFSET_KEY(dateKey, aspect);
        if (next.x || next.y) {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (_) {
        /* ignore */
      }
    }

    async function odqReadLayoutBQuiltBgZoom(dateKey, aspect = 'story') {
      const key = String(dateKey || '').trim();
      if (!key) return ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
      const a = odqNormalizeTuneAspect(aspect);
      const cacheId = odqTuneAspectCacheId(key, a);
      if (Object.prototype.hasOwnProperty.call(odqQuiltBgZoomMemoryCache, cacheId)) {
        return odqQuiltBgZoomMemoryCache[cacheId];
      }
      const firestoreField = a === 'post' ? 'layoutBQuiltBgZoomPost' : 'layoutBQuiltBgZoomStory';
      if (window.db && window.firestore) {
        try {
          const ref = window.firestore.doc(window.db, 'instagram-images', key);
          const snap = await window.firestore.getDoc(ref);
          if (snap.exists()) {
            const data = snap.data() || {};
            const z = odqNormalizeQuiltBgZoom(data[firestoreField]);
            odqSetCachedLayoutBQuiltBgZoom(key, z, a);
            return z;
          }
        } catch (err) {
          console.warn('odqReadLayoutBQuiltBgZoom Firestore read failed:', err);
        }
      }
      return odqGetCachedLayoutBQuiltBgZoom(key, a) ?? ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
    }

    async function odqReadLayoutBQuoteStripOffset(dateKey, aspect = 'story') {
      const key = String(dateKey || '').trim();
      if (!key) return { x: 0, y: 0 };
      const a = odqNormalizeTuneAspect(aspect);
      const cacheId = odqTuneAspectCacheId(key, a);
      if (Object.prototype.hasOwnProperty.call(odqQuoteStripOffsetMemoryCache, cacheId)) {
        return odqQuoteStripOffsetMemoryCache[cacheId];
      }
      if (window.db && window.firestore) {
        try {
          const ref = window.firestore.doc(window.db, 'instagram-images', key);
          const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
          const snap = await Promise.race([window.firestore.getDoc(ref), timeout]);
          if (snap.exists()) {
            const data = snap.data() || {};
            const suffix = a === 'post' ? 'Post' : 'Story';
            const offset = odqNormalizeQuoteStripOffset({
              x: data[`layoutBQuoteStripOffsetX${suffix}`],
              y: data[`layoutBQuoteStripOffsetY${suffix}`]
            });
            odqSetCachedLayoutBQuoteStripOffset(key, offset, a);
            return offset;
          }
        } catch (err) {
          console.warn('odqReadLayoutBQuoteStripOffset Firestore read failed:', err);
        }
      }
      return odqGetCachedLayoutBQuoteStripOffset(key, a) ?? { x: 0, y: 0 };
    }

    async function odqWriteLayoutBQuiltBgZoom(dateKey, zoom, aspect = 'story', writeOptions = {}) {
      const key = String(dateKey || '').trim();
      if (!key) throw new Error('dateKey required');
      const a = odqNormalizeTuneAspect(aspect);
      const z = odqNormalizeQuiltBgZoom(zoom);
      const now =
        String(writeOptions.updatedAt || '').trim() ||
        (typeof writeOptions.updatedAt === 'object' && writeOptions.updatedAt
          ? String(writeOptions.updatedAt)
          : '') ||
        new Date().toISOString();
      odqSetCachedLayoutBQuiltBgZoom(key, z, a);
      if (!window.db || !window.firestore) throw new Error('Firestore not ready');
      const ref = window.firestore.doc(window.db, 'instagram-images', key);
      const field = a === 'post' ? 'layoutBQuiltBgZoomPost' : 'layoutBQuiltBgZoomStory';
      const deleteFieldFn = window.firestore.deleteField;
      if (z <= ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN + 0.0005) {
        if (typeof deleteFieldFn === 'function') {
          const patch = {
            [field]: deleteFieldFn(),
            layoutBTuneUpdatedAt: now
          };
          await window.firestore.setDoc(ref, patch, { merge: true });
        }
        return ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
      }
      const patch = {
        [field]: z,
        [`${field}UpdatedAt`]: now,
        [`${field}UpdatedBy`]: 'admin-tune-modal',
        layoutBTuneUpdatedAt: now,
        layoutBTuneUpdatedBy: 'admin-tune-modal'
      };
      await window.firestore.setDoc(ref, patch, { merge: true });
      return z;
    }

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

    function odqLayoutBQuoteStyleTimestamp(data, aspect, kind) {
      if (!data || typeof data !== 'object') return '';
      if (kind === 'strip') {
        if (aspect === 'post') return String(data.layoutBStripLayoutSeedPostUpdatedAt || '').trim();
        return String(data.layoutBStripLayoutSeedStoryUpdatedAt || data.layoutBStripLayoutSeedUpdatedAt || '').trim();
      }
      const raw =
        aspect === 'post'
          ? data.layoutBKeywordEmphasisPost
          : data.layoutBKeywordEmphasisStory || data.layoutBKeywordEmphasis;
      return String(raw?.updatedAt || '').trim();
    }

    /** Post quote style is independent only when saved from Post after the last Story save. */
    function odqLayoutBPostQuoteStyleOverridden(data, kind) {
      if (!data || typeof data !== 'object') return false;
      const postField = kind === 'strip' ? 'layoutBStripLayoutSeedPost' : 'layoutBKeywordEmphasisPost';
      if (!Object.prototype.hasOwnProperty.call(data, postField)) return false;
      const postAt = odqLayoutBQuoteStyleTimestamp(data, 'post', kind);
      const storyAt = odqLayoutBQuoteStyleTimestamp(data, 'story', kind);
      if (!postAt) return false;
      if (!storyAt) return true;
      return postAt > storyAt;
    }

    function odqLayoutBStoryStripSeedFromDoc(data) {
      if (!data || typeof data !== 'object') return 0;
      if (data.layoutBStripLayoutSeedStory != null) {
        return odqNormalizeStripLayoutSeed(data.layoutBStripLayoutSeedStory);
      }
      if (data.layoutBStripLayoutSeed != null) {
        return odqNormalizeStripLayoutSeed(data.layoutBStripLayoutSeed);
      }
      return 0;
    }

    function odqResolveLayoutBPostStripSeedFromDoc(data) {
      if (odqLayoutBPostQuoteStyleOverridden(data, 'strip')) {
        return odqNormalizeStripLayoutSeed(data.layoutBStripLayoutSeedPost);
      }
      return odqLayoutBStoryStripSeedFromDoc(data);
    }

    function odqLayoutBStoryKeywordRawFromDoc(data) {
      if (!data || typeof data !== 'object') return null;
      return data.layoutBKeywordEmphasisStory || data.layoutBKeywordEmphasis || null;
    }

    function odqResolveLayoutBPostKeywordRawFromDoc(data) {
      if (odqLayoutBPostQuoteStyleOverridden(data, 'keyword')) {
        return data.layoutBKeywordEmphasisPost || null;
      }
      return odqLayoutBStoryKeywordRawFromDoc(data);
    }

    function odqLayoutBPostQuoteStyleIndependent(data) {
      return (
        odqLayoutBPostQuoteStyleOverridden(data, 'strip') ||
        odqLayoutBPostQuoteStyleOverridden(data, 'keyword')
      );
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
            let n;
            if (a === 'post') {
              n = odqResolveLayoutBPostStripSeedFromDoc(data);
            } else {
              n = odqNormalizeStripLayoutSeed(data[firestoreField]);
              if (!n && data.layoutBStripLayoutSeed != null) {
                n = odqNormalizeStripLayoutSeed(data.layoutBStripLayoutSeed);
              }
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
        return { keywordEmphasis: null, stripLayoutSeed: 0, quiltBgZoom: ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN };
      }
      const a = odqNormalizeTuneAspect(aspect);
      const kwField = a === 'post' ? 'layoutBKeywordEmphasisPost' : 'layoutBKeywordEmphasisStory';
      const stripField = a === 'post' ? 'layoutBStripLayoutSeedPost' : 'layoutBStripLayoutSeedStory';
      let rawKw;
      if (a === 'post') {
        rawKw = odqResolveLayoutBPostKeywordRawFromDoc(data);
      } else {
        rawKw = data[kwField];
        if (!rawKw && data.layoutBKeywordEmphasis) rawKw = data.layoutBKeywordEmphasis;
      }
      const keywordEmphasis = odqEnsureKeywordEmphasisStyles(odqNormalizeKeywordEmphasisPayload(rawKw));
      odqSetCachedLayoutBKeywordEmphasis(key, keywordEmphasis, a);
      let stripLayoutSeed;
      if (a === 'post') {
        stripLayoutSeed = odqResolveLayoutBPostStripSeedFromDoc(data);
      } else {
        stripLayoutSeed = odqNormalizeStripLayoutSeed(data[stripField]);
        if (!stripLayoutSeed && data.layoutBStripLayoutSeed != null) {
          stripLayoutSeed = odqNormalizeStripLayoutSeed(data.layoutBStripLayoutSeed);
        }
      }
      odqSetCachedLayoutBStripLayoutSeed(key, stripLayoutSeed, a);
      const quiltBgZoom = odqNormalizeQuiltBgZoom(data[a === 'post' ? 'layoutBQuiltBgZoomPost' : 'layoutBQuiltBgZoomStory']);
      odqSetCachedLayoutBQuiltBgZoom(key, quiltBgZoom, a);
      const suffix = a === 'post' ? 'Post' : 'Story';
      const quoteStripOffset = odqNormalizeQuoteStripOffset({
        x: data[`layoutBQuoteStripOffsetX${suffix}`],
        y: data[`layoutBQuoteStripOffsetY${suffix}`]
      });
      odqSetCachedLayoutBQuoteStripOffset(key, quoteStripOffset, a);
      return { keywordEmphasis, stripLayoutSeed, quiltBgZoom, quoteStripOffset };
    }

    async function odqWriteLayoutBStripLayoutSeed(dateKey, seed, aspect = 'story', writeOptions = {}) {
      const key = String(dateKey || '').trim();
      if (!key) throw new Error('dateKey required');
      const a = odqNormalizeTuneAspect(aspect);
      const n = odqNormalizeStripLayoutSeed(seed);
      const now =
        typeof writeOptions.updatedAt === 'string' && writeOptions.updatedAt.trim()
          ? writeOptions.updatedAt.trim()
          : new Date().toISOString();
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
        [`${field}UpdatedAt`]: now,
        [`${field}UpdatedBy`]: 'admin-tune-modal'
      };
      if (a === 'story') {
        patch.layoutBStripLayoutSeed = n;
        patch.layoutBStripLayoutSeedUpdatedAt = now;
        patch.layoutBStripLayoutSeedUpdatedBy = 'admin-tune-modal';
      }
      await window.firestore.setDoc(ref, patch, { merge: true });
      return n;
    }

    async function odqWriteLayoutBPostStripPlan(dateKey, stripPlan, writeOptions = {}) {
      const key = String(dateKey || '').trim();
      if (!key) throw new Error('dateKey required');
      if (!window.db || !window.firestore) throw new Error('Firestore not ready');
      const ref = window.firestore.doc(window.db, 'instagram-images', key);
      const now =
        typeof writeOptions.updatedAt === 'string' && writeOptions.updatedAt.trim()
          ? writeOptions.updatedAt.trim()
          : new Date().toISOString();
      if (!stripPlan || !stripPlan.length) {
        if (typeof window.firestore.deleteField === 'function') {
          await window.firestore.setDoc(ref, { layoutBPostStripPlan: window.firestore.deleteField() }, { merge: true });
        }
        return;
      }
      // Store compact strip plan: only position/size/text fields needed for layout
      const compact = stripPlan.map((s) => {
        const o = { role: s.role || 'quote', x: s.x, y: s.y, w: s.w, h: s.h };
        if (s.text) o.text = s.text;
        if (s.lines) o.lines = s.lines;
        return o;
      });
      await window.firestore.setDoc(ref, {
        layoutBPostStripPlan: compact,
        layoutBPostStripPlanUpdatedAt: now
      }, { merge: true });
    }

    async function odqReadLayoutBPostStripPlan(dateKey) {
      const key = String(dateKey || '').trim();
      if (!key) return null;
      if (window.db && window.firestore) {
        try {
          const ref = window.firestore.doc(window.db, 'instagram-images', key);
          const snap = await window.firestore.getDoc(ref);
          if (snap.exists()) {
            const plan = snap.data()?.layoutBPostStripPlan;
            if (Array.isArray(plan) && plan.length) return plan;
          }
        } catch (_) { /* optional */ }
      }
      return null;
    }

    globalThis.odqWriteLayoutBPostStripPlan = odqWriteLayoutBPostStripPlan;
    globalThis.odqReadLayoutBPostStripPlan = odqReadLayoutBPostStripPlan;

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
      const nCx = odqNormalizeSpeakerNudgeComponent(nudge?.cx ?? nudge?.nudgeCx);
      const nCy = odqNormalizeSpeakerNudgeComponent(nudge?.cy ?? nudge?.nudgeCy);
      const nRot = odqNormalizeSpeakerRotateDeg(nudge?.rotateDeg ?? nudge?.nudgeRotateDeg);
      const nScale = odqNormalizeSpeakerScaleMul(nudge?.scaleMul ?? nudge?.nudgeScale);
      const hasTweak = !!(nCx || nCy || nRot || nScale !== 1);
      const presetValid =
        name && name !== 'AUTO' && Object.prototype.hasOwnProperty.call(ODQ_SPEAKER_PRESETS, name);
      if (!presetValid && !hasTweak) {
        if (typeof deleteFieldFn === 'function') {
          const patch = {
            [field]: deleteFieldFn(),
            [nudgeFields.cx]: deleteFieldFn(),
            [nudgeFields.cy]: deleteFieldFn(),
            [nudgeFields.rotate]: deleteFieldFn(),
            [nudgeFields.scaleMul]: deleteFieldFn(),
            layoutBTuneUpdatedAt: now
          };
          if (a === 'story') patch.speakerCutoutPreset = deleteFieldFn();
          await window.firestore.setDoc(ref, patch, { merge: true });
        }
        return 'AUTO';
      }
      const patch = {
        layoutBTuneUpdatedAt: now,
        layoutBTuneUpdatedBy: 'admin-tune-modal'
      };
      if (presetValid) {
        patch[field] = name;
        patch[`${field}UpdatedAt`] = now;
        if (a === 'story') patch.speakerCutoutPreset = name;
      } else if (typeof deleteFieldFn === 'function') {
        patch[field] = deleteFieldFn();
        if (a === 'story') patch.speakerCutoutPreset = deleteFieldFn();
      }
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
        if (nScale === 1) patch[nudgeFields.scaleMul] = deleteFieldFn();
        else patch[nudgeFields.scaleMul] = nScale;
      } else {
        patch[nudgeFields.cx] = nCx;
        patch[nudgeFields.cy] = nCy;
        patch[nudgeFields.rotate] = nRot;
        patch[nudgeFields.scaleMul] = nScale === 1 ? null : nScale;
      }
      await window.firestore.setDoc(ref, patch, { merge: true });
      return presetValid ? name : 'AUTO';
    }

    /** Serializable instagram-images patch for Admin SDK merge (null values → field delete on server). */
    function odqBuildLayoutBTuneFirestorePayload(dateKey, tuneDraftByAspect, updatedAt) {
      const key = String(dateKey || '').trim();
      if (!key) throw new Error('dateKey required');
      const now = String(updatedAt || '').trim() || new Date().toISOString();
      const set = {
        layoutBTuneUpdatedAt: now,
        layoutBTuneUpdatedBy: 'admin-tune-modal',
        date: key
      };
      const deleteFields = [];
      const del = (field) => {
        const f = String(field || '').trim();
        if (!f || deleteFields.includes(f)) return;
        deleteFields.push(f);
        delete set[f];
      };

      for (const aspect of ['story', 'post']) {
        const d = tuneDraftByAspect?.[aspect] || {};
        const a = odqNormalizeTuneAspect(aspect);
        const presetField =
          a === 'post' ? 'layoutBSpeakerCutoutPresetPost' : 'layoutBSpeakerCutoutPresetStory';
        const nudgeFields = odqSpeakerCutoutNudgeFirestoreFields(a);
        const stripField =
          a === 'post' ? 'layoutBStripLayoutSeedPost' : 'layoutBStripLayoutSeedStory';
        const kwField =
          a === 'post' ? 'layoutBKeywordEmphasisPost' : 'layoutBKeywordEmphasisStory';
        const quiltZoomField =
          a === 'post' ? 'layoutBQuiltBgZoomPost' : 'layoutBQuiltBgZoomStory';
        const stripOffsetXField =
          a === 'post' ? 'layoutBQuoteStripOffsetXPost' : 'layoutBQuoteStripOffsetXStory';
        const stripOffsetYField =
          a === 'post' ? 'layoutBQuoteStripOffsetYPost' : 'layoutBQuoteStripOffsetYStory';

        const name = String(d.preset || '').trim().toUpperCase();
        const nCx = odqNormalizeSpeakerNudgeComponent(d.nudgeCx);
        const nCy = odqNormalizeSpeakerNudgeComponent(d.nudgeCy);
        const nRot = odqNormalizeSpeakerRotateDeg(d.nudgeRotateDeg);
        const nScale = odqNormalizeSpeakerScaleMul(d.nudgeScale);
        const hasTweak = !!(nCx || nCy || nRot || nScale !== 1);
        const presetValid =
          name && name !== 'AUTO' && Object.prototype.hasOwnProperty.call(ODQ_SPEAKER_PRESETS, name);

        if (!presetValid && !hasTweak) {
          del(presetField);
          del(`${presetField}UpdatedAt`);
          del(nudgeFields.cx);
          del(nudgeFields.cy);
          del(nudgeFields.rotate);
          del(nudgeFields.scaleMul);
          if (a === 'story') del('speakerCutoutPreset');
        } else {
          if (presetValid) {
            set[presetField] = name;
            set[`${presetField}UpdatedAt`] = now;
            if (a === 'story') set.speakerCutoutPreset = name;
          } else {
            del(presetField);
            del(`${presetField}UpdatedAt`);
            if (a === 'story') del('speakerCutoutPreset');
          }
          if (nCx === 0 && nCy === 0) {
            del(nudgeFields.cx);
            del(nudgeFields.cy);
          } else {
            set[nudgeFields.cx] = nCx;
            set[nudgeFields.cy] = nCy;
          }
          if (nRot === 0) del(nudgeFields.rotate);
          else set[nudgeFields.rotate] = nRot;
          if (nScale === 1) del(nudgeFields.scaleMul);
          else set[nudgeFields.scaleMul] = nScale;
        }

        const stripSeed = odqNormalizeStripLayoutSeed(d.stripLayoutSeed);
        if (stripSeed <= 0) {
          del(stripField);
          del(`${stripField}UpdatedAt`);
          del(`${stripField}UpdatedBy`);
          if (a === 'story') {
            del('layoutBStripLayoutSeed');
            del('layoutBStripLayoutSeedUpdatedAt');
            del('layoutBStripLayoutSeedUpdatedBy');
          }
        } else {
          set[stripField] = stripSeed;
          set[`${stripField}UpdatedAt`] = now;
          set[`${stripField}UpdatedBy`] = 'admin-tune-modal';
          if (a === 'story') {
            set.layoutBStripLayoutSeed = stripSeed;
            set.layoutBStripLayoutSeedUpdatedAt = now;
            set.layoutBStripLayoutSeedUpdatedBy = 'admin-tune-modal';
          }
        }

        const normalized = odqEnsureKeywordEmphasisStyles(
          odqNormalizeKeywordEmphasisPayload(d.keywordEmphasis)
        );
        if (!normalized) {
          del(kwField);
          if (a === 'story') del('layoutBKeywordEmphasis');
        } else {
          const emphasisDoc = {
            ...normalized,
            updatedAt: now,
            updatedBy: 'admin-tune-modal'
          };
          set[kwField] = emphasisDoc;
          if (a === 'story') set.layoutBKeywordEmphasis = emphasisDoc;
        }

        const quiltZoom = odqNormalizeQuiltBgZoom(d.quiltBgZoom);
        if (quiltZoom <= ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN + 0.0005) {
          del(quiltZoomField);
          del(`${quiltZoomField}UpdatedAt`);
          del(`${quiltZoomField}UpdatedBy`);
        } else {
          set[quiltZoomField] = quiltZoom;
          set[`${quiltZoomField}UpdatedAt`] = now;
          set[`${quiltZoomField}UpdatedBy`] = 'admin-tune-modal';
        }

        const stripOffset = odqNormalizeQuoteStripOffset(d.quoteStripOffset);
        if (!stripOffset.x && !stripOffset.y) {
          del(stripOffsetXField);
          del(stripOffsetYField);
          del(`${stripOffsetXField}UpdatedAt`);
          del(`${stripOffsetYField}UpdatedAt`);
          del(`${stripOffsetXField}UpdatedBy`);
          del(`${stripOffsetYField}UpdatedBy`);
        } else {
          set[stripOffsetXField] = stripOffset.x;
          set[stripOffsetYField] = stripOffset.y;
          set[`${stripOffsetXField}UpdatedAt`] = now;
          set[`${stripOffsetYField}UpdatedAt`] = now;
          set[`${stripOffsetXField}UpdatedBy`] = 'admin-tune-modal';
          set[`${stripOffsetYField}UpdatedBy`] = 'admin-tune-modal';
        }
      }

      return { set, deleteFields };
    }

    async function odqWriteLayoutBTuneViaServer(dateKey, tuneDraftByAspect, updatedAt) {
      const bases =
        typeof globalThis.odqProxyImageBases === 'function'
          ? globalThis.odqProxyImageBases()
          : [
              typeof globalThis.odqBackendBaseUrl === 'function'
                ? globalThis.odqBackendBaseUrl()
                : String(globalThis.CONFIG?.BACKEND?.baseUrl || '').replace(/\/$/, '')
            ].filter(Boolean);
      if (!bases.length) throw new Error('Backend base URL not configured');
      const { set, deleteFields } = odqBuildLayoutBTuneFirestorePayload(
        dateKey,
        tuneDraftByAspect,
        updatedAt
      );
      const body = JSON.stringify({ dateKey, set, deleteFields });
      let lastErr = null;
      for (const baseUrl of bases) {
        try {
          const res = await fetch(`${baseUrl}/api/push-layout-b-tune`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success !== false) {
            return data;
          }
          lastErr = new Error(data.error || `Tune server save failed (${res.status})`);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('Tune server save failed');
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
      const read = await odqReadInstagramImagesDocWithFallback(dateKey, 8000);
      const data = read?.data || null;
      if (!data) {
        return {
          ok: false,
          reason: read?.serverError ? `read-failed: ${read.serverError}` : 'doc-missing',
          dateKey,
          fields: []
        };
      }
      const mismatches = [];
      const fields = [];
      for (const aspect of ['story', 'post']) {
        const d = tuneDraftByAspect[aspect] || {};
        const kwField = aspect === 'post' ? 'layoutBKeywordEmphasisPost' : 'layoutBKeywordEmphasisStory';
        const stripField = aspect === 'post' ? 'layoutBStripLayoutSeedPost' : 'layoutBStripLayoutSeedStory';
        const presetField = aspect === 'post' ? 'layoutBSpeakerCutoutPresetPost' : 'layoutBSpeakerCutoutPresetStory';
        const quiltZoomField = aspect === 'post' ? 'layoutBQuiltBgZoomPost' : 'layoutBQuiltBgZoomStory';
        const stripOffsetXField =
          aspect === 'post' ? 'layoutBQuoteStripOffsetXPost' : 'layoutBQuoteStripOffsetXStory';
        const stripOffsetYField =
          aspect === 'post' ? 'layoutBQuoteStripOffsetYPost' : 'layoutBQuoteStripOffsetYStory';
        const nudgeFields = odqSpeakerCutoutNudgeFirestoreFields(aspect);
        const serverKwRaw =
          aspect === 'post'
            ? odqResolveLayoutBPostKeywordRawFromDoc(data)
            : data[kwField] || data.layoutBKeywordEmphasis;
        const serverKw = serverKwRaw;
        const serverStrip = odqNormalizeStripLayoutSeed(
          aspect === 'post'
            ? odqResolveLayoutBPostStripSeedFromDoc(data)
            : data[stripField] ?? data.layoutBStripLayoutSeed ?? 0
        );
        const serverPreset = String(
          data[presetField] || (aspect === 'story' ? data.speakerCutoutPreset : '') || 'AUTO'
        )
          .trim()
          .toUpperCase();
        const serverNudgeCx = odqNormalizeSpeakerNudgeComponent(data[nudgeFields.cx]);
        const serverNudgeCy = odqNormalizeSpeakerNudgeComponent(data[nudgeFields.cy]);
        const serverNudgeRot = odqNormalizeSpeakerRotateDeg(data[nudgeFields.rotate]);
        const serverNudgeScale = odqNormalizeSpeakerScaleMul(data[nudgeFields.scaleMul]);
        const serverQuiltBgZoom = odqNormalizeQuiltBgZoom(data[quiltZoomField]);
        const serverStripOffset = odqNormalizeQuoteStripOffset({
          x: data[stripOffsetXField],
          y: data[stripOffsetYField]
        });
        if (serverKw) fields.push(kwField);
        if (data[stripField] != null || (aspect === 'story' && data.layoutBStripLayoutSeed != null)) {
          fields.push(stripField);
        }
        if (serverPreset && serverPreset !== 'AUTO') fields.push(presetField);
        if (serverNudgeCx || serverNudgeCy) {
          fields.push(nudgeFields.cx, nudgeFields.cy);
        }
        if (serverNudgeRot) fields.push(nudgeFields.rotate);
        if (serverNudgeScale !== 1) fields.push(nudgeFields.scaleMul);
        if (serverQuiltBgZoom > ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN + 0.0005) fields.push(quiltZoomField);
        if (serverStripOffset.x || serverStripOffset.y) fields.push(stripOffsetXField, stripOffsetYField);
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
        const expectedNudgeScale = odqNormalizeSpeakerScaleMul(d.nudgeScale);
        if (
          expectedNudgeCx !== serverNudgeCx ||
          expectedNudgeCy !== serverNudgeCy ||
          expectedNudgeRot !== serverNudgeRot ||
          expectedNudgeScale !== serverNudgeScale
        ) {
          mismatches.push(`${aspect}-nudge`);
        }
        const expectedQuiltBgZoom = odqNormalizeQuiltBgZoom(d.quiltBgZoom);
        if (Math.abs(expectedQuiltBgZoom - serverQuiltBgZoom) > 0.0005) {
          mismatches.push(`${aspect}-quilt-zoom`);
        }
        const expectedStripOffset = odqNormalizeQuoteStripOffset(d.quoteStripOffset);
        if (
          Math.abs(expectedStripOffset.x - serverStripOffset.x) > 0.0005 ||
          Math.abs(expectedStripOffset.y - serverStripOffset.y) > 0.0005
        ) {
          mismatches.push(`${aspect}-strip-offset`);
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
        let raw;
        if (a === 'post') {
          raw = odqResolveLayoutBPostKeywordRawFromDoc(data);
        } else {
          raw = data[firestoreField];
          if (!raw && data.layoutBKeywordEmphasis) raw = data.layoutBKeywordEmphasis;
        }
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

    async function odqWriteLayoutBKeywordEmphasis(dateKey, payload, aspect = 'story', writeOptions = {}) {
      const key = String(dateKey || '').trim();
      if (!key) throw new Error('dateKey required');
      const a = odqNormalizeTuneAspect(aspect);
      const normalized = odqEnsureKeywordEmphasisStyles(odqNormalizeKeywordEmphasisPayload(payload));
      odqSetCachedLayoutBKeywordEmphasis(key, normalized, a);
      if (!window.db || !window.firestore) throw new Error('Firestore not ready');
      const ref = window.firestore.doc(window.db, 'instagram-images', key);
      const field = a === 'post' ? 'layoutBKeywordEmphasisPost' : 'layoutBKeywordEmphasisStory';
      const deleteFieldFn = window.firestore.deleteField;
      const now =
        typeof writeOptions.updatedAt === 'string' && writeOptions.updatedAt.trim()
          ? writeOptions.updatedAt.trim()
          : new Date().toISOString();
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
        updatedAt: now,
        updatedBy: 'admin-tune-modal'
      };
      const patch = { [field]: emphasisDoc };
      if (a === 'story') patch.layoutBKeywordEmphasis = emphasisDoc;
      await window.firestore.setDoc(ref, patch, { merge: true });
      return emphasisDoc;
    }

    async function odqWriteLayoutBQuoteStripOffset(dateKey, offset, aspect = 'story', writeOptions = {}) {
      const key = String(dateKey || '').trim();
      if (!key) throw new Error('dateKey required');
      const a = odqNormalizeTuneAspect(aspect);
      const normalized = odqNormalizeQuoteStripOffset(offset);
      odqSetCachedLayoutBQuoteStripOffset(key, normalized, a);
      if (!window.db || !window.firestore) throw new Error('Firestore not ready');
      const ref = window.firestore.doc(window.db, 'instagram-images', key);
      const suffix = a === 'post' ? 'Post' : 'Story';
      const xField = `layoutBQuoteStripOffsetX${suffix}`;
      const yField = `layoutBQuoteStripOffsetY${suffix}`;
      const deleteFieldFn = window.firestore.deleteField;
      const now =
        typeof writeOptions.updatedAt === 'string' && writeOptions.updatedAt.trim()
          ? writeOptions.updatedAt.trim()
          : new Date().toISOString();
      const patch = {};
      if (!normalized.x && !normalized.y && typeof deleteFieldFn === 'function') {
        patch[xField] = deleteFieldFn();
        patch[yField] = deleteFieldFn();
        patch[`${xField}UpdatedAt`] = deleteFieldFn();
        patch[`${yField}UpdatedAt`] = deleteFieldFn();
        patch[`${xField}UpdatedBy`] = deleteFieldFn();
        patch[`${yField}UpdatedBy`] = deleteFieldFn();
      } else {
        patch[xField] = normalized.x;
        patch[yField] = normalized.y;
        patch[`${xField}UpdatedAt`] = now;
        patch[`${yField}UpdatedAt`] = now;
        patch[`${xField}UpdatedBy`] = 'admin-tune-modal';
        patch[`${yField}UpdatedBy`] = 'admin-tune-modal';
      }
      patch.layoutBTuneUpdatedAt = now;
      patch.layoutBTuneUpdatedBy = 'admin-tune-modal';
      await window.firestore.setDoc(ref, patch, { merge: true });
      return normalized;
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
      console.log('[COMPOSE-ENTRY]', layoutW+'x'+layoutH, 'carouselStoryStyle='+options.carouselStoryStyle);
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
      let resolvedQuiltBgZoom = ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
      if (options.quiltBgZoomExplicit) {
        resolvedQuiltBgZoom = odqNormalizeQuiltBgZoom(options.quiltBgZoom);
      } else if (options.quiltBgZoom != null) {
        resolvedQuiltBgZoom = odqNormalizeQuiltBgZoom(options.quiltBgZoom);
      } else {
        try {
          resolvedQuiltBgZoom = await odqReadLayoutBQuiltBgZoom(rngDateKey, tuneAspect);
        } catch (_) {
          resolvedQuiltBgZoom = odqGetCachedLayoutBQuiltBgZoom(rngDateKey, tuneAspect) ?? ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
        }
      }
      let resolvedQuoteStripOffset = { x: 0, y: 0 };
      if (options.quoteStripOffsetExplicit) {
        resolvedQuoteStripOffset = odqNormalizeQuoteStripOffset(options.quoteStripOffset);
      } else if (options.quoteStripOffset) {
        resolvedQuoteStripOffset = odqNormalizeQuoteStripOffset(options.quoteStripOffset);
      } else {
        try {
          resolvedQuoteStripOffset = await odqReadLayoutBQuoteStripOffset(rngDateKey, tuneAspect);
        } catch (_) {
          resolvedQuoteStripOffset =
            odqGetCachedLayoutBQuoteStripOffset(rngDateKey, tuneAspect) ?? { x: 0, y: 0 };
        }
      }
      return new Promise((resolve, reject) => {
            const STORY_W = layoutW;
            const STORY_H = layoutH;
            const tunePreviewFast = options.tunePreviewFast === true;
            const previewScale = tunePreviewFast ? odqTuneModalPreviewScale() : 1;
            const carouselShrinkPasses = tunePreviewFast ? 4 : 16;
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
                  cutoutSourceUrl: String(options.speakerOverlay.cutoutSourceUrl || '').trim(),
                  name: String(options.speakerOverlay.name || '').trim(),
                  washColor: String(options.speakerOverlay.washColor || '#ea9b9a').trim(),
                  /** Admin preset override (story-only today): pass-through so the apply-transform block sees it. */
                  transform: options.speakerOverlay.transform || null
                }
              : null;
            const layoutBPostAuthorName = odqLayoutBPostAuthorDisplayName(
              quoteAuthor,
              speakerOverlay,
              options.speakerHeroPost === true
            );
            const carouselStoryStyle = options.carouselStoryStyle === true;
            const layoutBPostQuoteOnlyAuthor =
              odqIsLayoutBPostQuoteOnlyAuthorContext(isPostLayout, options.speakerHeroPost === true) &&
              !carouselStoryStyle;
            const layoutQuoteText =
              layoutBPostQuoteOnlyAuthor && layoutBPostAuthorName
                ? odqStripTrailingAuthorFromQuoteText(quoteText, layoutBPostAuthorName)
                : String(quoteText || '').replace(/\s+/g, ' ').trim();

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
              const isStopWord = (w) => /^(to|a|an|the|of|in|on|at|by|for|with|as|and|but|or|not|so|is|was|are|were)$/i.test(
                String(w || '').replace(/[.,!?]+$/, '')
              );
              const splitFlat = (chunks, regex) =>
                chunks.flatMap((c) => {
                  const bits = c.split(regex).map((x) => x.trim()).filter(Boolean);
                  return bits.length > 1 ? bits : [c];
                });
              const splitFlatKeepLeftDelim = (chunks, regex, delim) =>
                chunks.flatMap((c) => {
                  const bits = c.split(regex).map((x) => x.trim()).filter(Boolean);
                  if (bits.length <= 1) return [c];
                  return bits.map((b, i) => (i < bits.length - 1 ? `${b}${delim}` : b));
                });
              const sentences =
                t.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [t];
              const out = [];
              for (const sentence of sentences) {
                let chunks = [sentence];
                chunks = splitFlat(chunks, /\s*;\s+/);
                chunks = splitFlat(chunks, /\s+[—–]\s+/);
                chunks = splitFlat(chunks, /:\s+/);
                chunks = splitFlatKeepLeftDelim(chunks, /,\s+/, ',');
                for (const chunk of chunks) {
                  const words = chunk.trim().split(/\s+/).filter(Boolean);
                  let i = 0;
                  while (i < words.length) {
                    let take = (rnd() > 0.60 && i + 2 < words.length) ? 3 : 2;
                    if (i + take > words.length) take = words.length - i;
                    if (take < words.length - i && isStopWord(words[i + take - 1])) take++;
                    out.push(words.slice(i, i + take).join(' '));
                    i += take;
                  }
                }
              }
              // If the last strip is a lone stop word, merge it into the prior strip.
              if (out.length >= 2 && isStopWord(out[out.length - 1].trim())) {
                out[out.length - 2] += ' ' + out[out.length - 1];
                out.pop();
              }
              return out.length ? out : [t];
            };

            const loadQuiltImage = () => {
              if (options.stripPlanCaptureOnly === true) {
                const im = new Image();
                im.src =
                  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
                return Promise.resolve(im);
              }
              return new Promise((res, rej) => {
              const isDataUrl = typeof highResBlob === 'string' && highResBlob.startsWith('data:');
              const url = isDataUrl ? highResBlob : URL.createObjectURL(highResBlob);
              const revoke = () => { if (!isDataUrl) URL.revokeObjectURL(url); };
              const im = new Image();
              im.onload = () => { revoke(); res(im); };
              im.onerror = () => { revoke(); rej(new Error('Failed to load quilt image for story composite')); };
              im.src = url;
            });
            };

            const normalizeProxySource = (url) =>
              typeof root.odqNormalizeProxyImageSourceUrl === 'function'
                ? root.odqNormalizeProxyImageSourceUrl(url)
                : String(url || '').trim();

            const buildProxyFetchUrl = (base, source) =>
              typeof root.odqProxyImageFetchUrl === 'function'
                ? root.odqProxyImageFetchUrl(base, source)
                : `${String(base || '').replace(/\/$/, '')}/api/proxy-image?url=${encodeURIComponent(normalizeProxySource(source))}`;

            const getSpeakerOverlayImageCandidates = (url) => {
              const safeUrl = normalizeProxySource(url);
              if (!safeUrl) return [];
              if (/^(?:data|blob):/i.test(safeUrl)) return [safeUrl];
              const baseUrl =
                typeof root.odqBackendBaseUrl === 'function'
                  ? root.odqBackendBaseUrl()
                  : String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
              /**
               * Prefer /api/proxy-image for Storage (canvas-safe). Also try the direct Storage URL
               * when proxy is unavailable (npm run dev:static) — works when the bucket allows CORS.
               * file:// is not supported; use http://127.0.0.1/.../our-daily-beta.html
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
              if (isFirebaseStorageHost) {
                const out = [];
                const proxyBases =
                  typeof root.odqProxyImageBases === 'function'
                    ? root.odqProxyImageBases()
                    : baseUrl
                      ? [baseUrl]
                      : [];
                for (const b of proxyBases) {
                  const proxied = buildProxyFetchUrl(b, safeUrl);
                  if (proxied && !out.includes(proxied)) out.push(proxied);
                }
                return out;
              }
              const out = [];
              if (/^https?:\/\//i.test(safeUrl) && baseUrl) {
                out.push(buildProxyFetchUrl(baseUrl, safeUrl));
              }
              out.push(safeUrl);
              return [...new Set(out)];
            };

            const loadSpeakerOverlayImage = (url) => new Promise((res) => {
              const safeUrl = String(url || '').trim();
              if (!safeUrl) return res(null);
              const im = new Image();
              // crossOrigin + referrerPolicy must not be set for data: URLs on WKWebView —
              // it causes WebP data URLs to silently fail without firing onerror.
              const isDataUrlSrc = /^data:/i.test(safeUrl);
              if (!isDataUrlSrc) {
                im.crossOrigin = 'anonymous';
                im.referrerPolicy = 'no-referrer';
              }
              const t = setTimeout(() => res(null), 3000);
              im.onload = () => { clearTimeout(t); res(im); };
              im.onerror = () => { clearTimeout(t); res(null); };
              im.src = safeUrl;
            });

            const loadSpeakerOverlayImages = async (url) => {
              const sourceUrl = normalizeProxySource(url);
              if (!sourceUrl) return [];
              const stashTuneSpeakerCache = (imgs) => {
                if (tunePreviewFast && sourceUrl && imgs?.length) {
                  _odqTuneComposeSpeakerImgCache = { key: sourceUrl, imgs };
                }
                return imgs;
              };
              if (
                tunePreviewFast &&
                _odqTuneComposeSpeakerImgCache?.key === sourceUrl &&
                _odqTuneComposeSpeakerImgCache.imgs?.length
              ) {
                return _odqTuneComposeSpeakerImgCache.imgs;
              }
              if (/^(?:data|blob):/i.test(sourceUrl)) {
                const img = await loadSpeakerOverlayImage(sourceUrl);
                return stashTuneSpeakerCache(img ? [img] : []);
              }
              const cutoutQuote =
                options?.speakerCutoutQuote && typeof options.speakerCutoutQuote === 'object'
                  ? options.speakerCutoutQuote
                  : null;
              const arch =
                typeof window !== 'undefined' && window.app?.archiveService
                  ? window.app.archiveService
                  : null;
              if (arch?._proxyImageFailedUrls?.delete) {
                arch._proxyImageFailedUrls.delete(sourceUrl);
              }
              if (arch && typeof arch._prepareSpeakerImageUrlForCanvas === 'function' && /^https?:\/\//i.test(sourceUrl)) {
                try {
                  const dataUrl = await arch._prepareSpeakerImageUrlForCanvas(sourceUrl, {
                    quote: cutoutQuote,
                    skipCutoutExportFinalize: true
                  });
                  if (dataUrl) {
                    const img = await loadSpeakerOverlayImage(dataUrl);
                    if (img) return stashTuneSpeakerCache([img]);
                  }
                } catch (_) {
                  /* prepare failed */
                }
              }
              const proxyBases =
                typeof root.odqProxyImageBases === 'function'
                  ? root.odqProxyImageBases()
                  : [String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '')].filter(Boolean);
              if (/^https?:\/\//i.test(sourceUrl)) {
                let saw413 = false;
                for (const baseUrl of proxyBases) {
                  try {
                    const proxyUrl = buildProxyFetchUrl(baseUrl, sourceUrl);
                    if (!proxyUrl) continue;
                    const res = await fetch(proxyUrl, {
                      cache: 'no-store',
                      signal:
                        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                          ? AbortSignal.timeout(12000)
                          : undefined
                    });
                    if (res.status === 413) {
                      saw413 = true;
                      continue;
                    }
                    if (!res.ok) continue;
                    const blob = await res.blob();
                    if (!String(blob.type || '').startsWith('image/')) continue;
                    const blobUrl = URL.createObjectURL(blob);
                    try {
                      const img = await loadSpeakerOverlayImage(blobUrl);
                      if (img) return stashTuneSpeakerCache([img]);
                    } finally {
                      URL.revokeObjectURL(blobUrl);
                    }
                  } catch (_) {
                    /* try next proxy base */
                  }
                }
                if (saw413) {
                  const direct = await loadSpeakerOverlayImage(sourceUrl);
                  if (direct) return stashTuneSpeakerCache([direct]);
                }
              }
              for (const candidate of getSpeakerOverlayImageCandidates(sourceUrl)) {
                const img = await loadSpeakerOverlayImage(candidate);
                if (img) return stashTuneSpeakerCache([img]);
              }
              console.warn(
                'Layout B speaker image load failed. If using Firebase Storage, deploy /api/proxy-image or serve a same-origin/data URL.',
                { sourceUrl, candidates: getSpeakerOverlayImageCandidates(sourceUrl) }
              );
              return [];
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

            const stripPaperTexLight = tunePreviewFast ? null : makeStripPaperTextureTile('light');
            const stripPaperTexDark = tunePreviewFast ? null : makeStripPaperTextureTile('dark');

            /**
             * Full-canvas magazine print finish: fiber/tooth, subtle halftone, micro-imperfections.
             * Story (9:16) only — 4:5 posts keep accurate quilt colors.
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
              if (!tunePreviewFast) {
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
              }
              handCutStripPath(g, w, h, rnd);
              g.fill();
              g.shadowColor = 'transparent';
              g.shadowBlur = 0;
              g.shadowOffsetX = 0;
              g.shadowOffsetY = 0;
              if (!tex) {
                g.restore();
                return;
              }
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

            const QNC = root.QuiltNewspaperClipping || globalThis.QuiltNewspaperClipping;

            const drawSpeakerOverlay = (g, img, rect, washColor, opts = {}) => {
              if (!img || !rect || rect.width <= 0 || rect.height <= 0) return false;
              const SCR = root.SpeakerCutoutRender || globalThis.SpeakerCutoutRender;
              if (!SCR?.drawSpeakerCutoutStack) return false;
              const isHeroPost = Math.max(0, Math.min(1, Number(opts.solidMatOpacity) || 0)) > 0;
              const isCutoutPng = odqResolveSpeakerCutoutPng(
                {
                  isCutoutPng: opts.isCutoutPng,
                  cutoutSourceUrl:
                    opts.cutoutSourceUrl ||
                    speakerOverlay?.cutoutSourceUrl ||
                    odqSpeakerImageUrlFromQuote(options?.speakerCutoutQuote),
                  imageUrl: opts.imageUrl || speakerOverlay?.imageUrl
                },
                img
              );
              return SCR.drawSpeakerCutoutStack(g, img, rect, {
                washColor,
                seed: rngDateKey,
                isCutoutPng,
                newsprintSurface: false,
                compositeOverQuilt: true,
                solidMatOpacity: opts.solidMatOpacity,
                subjectCrop: opts.subjectCrop || null,
                layout: opts.subjectCrop ? 'subject-fill' : opts.layout,
                palette:
                  opts.palette ||
                  globalThis.window?.app?.getSpeakerCutoutPaperPalette?.() ||
                  [],
                drawScannerBed: false,
                skipScannerBed: true,
                bleedPhase: opts.bleedPhase || 'layout-b-unknown',
                paintNeutralSilhouette:
                  isHeroPost && !isCutoutPng
                    ? (targetCtx, portrait, r) => {
                        const pw = portrait.width;
                        const ph = portrait.height;
                        const creamSil = document.createElement('canvas');
                        creamSil.width = pw;
                        creamSil.height = ph;
                        const csx = creamSil.getContext('2d');
                        if (!csx) return;
                        csx.save();
                        csx.translate(
                          pw * ODQ_SPEAKER_HERO_MAT_OFFSET_X_FRAC,
                          ph * ODQ_SPEAKER_HERO_MAT_OFFSET_Y_FRAC
                        );
                        csx.rotate((ODQ_SPEAKER_HERO_MAT_ROTATE_DEG * Math.PI) / 180);
                        csx.scale(ODQ_SPEAKER_HERO_MAT_SCALE, ODQ_SPEAKER_HERO_MAT_SCALE);
                        csx.drawImage(portrait, 0, 0);
                        csx.globalCompositeOperation = 'source-in';
                        csx.fillStyle = `rgb(${ODQ_SPEAKER_CUTOUT_MAT_RGB})`;
                        csx.fillRect(-4, -4, pw + 8, ph + 8);
                        csx.restore();
                        targetCtx.globalCompositeOperation = 'source-over';
                        targetCtx.globalAlpha = 1;
                        targetCtx.drawImage(
                          creamSil,
                          -r.width / 2,
                          -r.height / 2,
                          r.width,
                          r.height
                        );
                      }
                    : undefined
              });
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
              /** Default AUTO placement: bottom-right corner (nightly IG + tune modal). */
              const anchorCx = STORY_W - minPad - w / 2;
              const anchorCy = STORY_H - minPad - h / 2;
              let best = {
                x: anchorCx - w / 2,
                y: anchorCy - h / 2,
                width: w,
                height: h,
                angle: (rnd() - 0.5) * 0.07
              };
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
                  role: String(s.role || 'quote'),
                  left: cx - halfW - stripExtra,
                  top: cy - halfH - stripExtra,
                  right: cx + halfW + stripExtra,
                  bottom: cy + halfH + stripExtra
                };
              });
              const quoteStripRects = stripRects.filter((s) => s.role !== 'author');
              const authorStripRect = stripRects.find((s) => s.role === 'author') || null;
              /**
               * Clear quote-strip overlap first; then tuck ~22% of portrait height behind the author
               * name strip (strips still paint on top).
               */
              if (best) {
                const quoteEncroachPx = Math.max(1, Math.round(h * ODQ_LAYOUT_B_SPEAKER_QUOTE_ENCROACH_FRAC));
                const authorEncroachPx = Math.max(1, Math.round(h * ODQ_LAYOUT_B_SPEAKER_AUTHOR_ENCROACH_FRAC));
                const overflowAllowance = isPostLayout ? 0 : h;
                const absoluteMaxTop = STORY_H + overflowAllowance - h - (isPostLayout ? minPad : 0);
                let safety = 0;
                while (safety < 32) {
                  const r = { left: best.x, top: best.y, right: best.x + w, bottom: best.y + h };
                  let lowestQuoteBottom = -Infinity;
                  let totalOverlap = 0;
                  for (const s of quoteStripRects) {
                    const ow = Math.max(0, Math.min(r.right, s.right) - Math.max(r.left, s.left));
                    const oh = Math.max(0, Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top));
                    if (ow > 0 && oh > 0) {
                      totalOverlap += ow * oh;
                      if (s.bottom > lowestQuoteBottom) lowestQuoteBottom = s.bottom;
                    }
                  }
                  if (totalOverlap <= 0) break;
                  const desiredTop = Math.min(absoluteMaxTop, lowestQuoteBottom - quoteEncroachPx);
                  if (desiredTop > best.y + 0.5) {
                    best.y = desiredTop;
                  } else {
                    break;
                  }
                  if (Math.abs(best.y - absoluteMaxTop) <= 0.5) break;
                  safety += 1;
                }
                if (!isPostLayout && authorStripRect) {
                  const tuckTop = Math.min(
                    absoluteMaxTop,
                    authorStripRect.top + authorEncroachPx - h
                  );
                  if (tuckTop > best.y + 0.5) {
                    const r = { left: best.x, top: tuckTop, right: best.x + w, bottom: tuckTop + h };
                    let quoteBlocked = false;
                    for (const s of quoteStripRects) {
                      const ow = Math.max(0, Math.min(r.right, s.right) - Math.max(r.left, s.left));
                      const oh = Math.max(0, Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top));
                      if (ow <= 0 || oh <= 0) continue;
                      const overlapArea = ow * oh;
                      const speakerArea = Math.max(1, w * h);
                      if (overlapArea > speakerArea * 0.045) {
                        quoteBlocked = true;
                        break;
                      }
                    }
                    if (!quoteBlocked) best.y = tuckTop;
                  }
                }
              }
              return best;
            };

            /** 4:5 speaker-hero post: subject (opaque pixels) sized to ~50% of canvas area. */
            const getSpeakerHeroPostRect = (img) => {
              if (!img) return null;
              const iw = Math.max(1, img.naturalWidth || img.width);
              const ih = Math.max(1, img.naturalHeight || img.height);
              const SCR = root.SpeakerCutoutRender || globalThis.SpeakerCutoutRender;
              const subjectCrop = SCR?.measureSpeakerOpaqueBoundsFromImage?.(img) || null;
              const aspect =
                subjectCrop?.width > 0 && subjectCrop?.height > 0
                  ? subjectCrop.width / subjectCrop.height
                  : iw / ih;
              const gridSafe = odqLayoutBPostGridSafeRect(STORY_W, STORY_H, 8);
              const inset = ODQ_LAYOUT_B_SPEAKER_HERO_SAFE_INSET;
              const maxW = gridSafe
                ? Math.max(1, gridSafe.width - inset * 2)
                : STORY_W - inset * 2;
              const availTop = gridSafe ? gridSafe.y + inset : inset;
              const safeBottom = gridSafe ? gridSafe.y + gridSafe.height - inset : STORY_H - inset;
              const availBottom = Math.min(
                safeBottom,
                STORY_H - ODQ_LAYOUT_B_SPEAKER_HERO_BOTTOM_RESERVE
              );
              const maxH = Math.max(1, availBottom - availTop);
              const targetArea = STORY_W * STORY_H * ODQ_LAYOUT_B_SPEAKER_HERO_POST_AREA_FRAC;
              let w = Math.sqrt(targetArea * aspect);
              let h = w / aspect;
              if (w > maxW) {
                w = maxW;
                h = w / aspect;
              }
              if (h > maxH) {
                h = maxH;
                w = h * aspect;
              }
              const cx = gridSafe ? gridSafe.x + gridSafe.width / 2 : STORY_W / 2;
              let y = availBottom - h - ODQ_LAYOUT_B_SPEAKER_HERO_GAP_ABOVE_NAME;
              y = Math.max(availTop, y);
              return {
                x: cx - w / 2,
                y,
                width: w,
                height: h,
                angle: (rnd() - 0.5) * 0.03,
                subjectCrop
              };
            };

            loadQuiltImage()
              .then(async (quiltImg) => {
                const stripPlanOnly = options.stripPlanCaptureOnly === true;
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

                  return runOne(paragraphs.join(' '));
                };

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = Math.max(1, Math.round(STORY_W * previewScale));
                canvas.height = Math.max(1, Math.round(STORY_H * previewScale));
                if (previewScale !== 1) {
                  ctx.scale(previewScale, previewScale);
                }
                ctx.fillStyle = isPostLayout ? '#ffffff' : PAPER_FILL;
                ctx.fillRect(0, 0, STORY_W, STORY_H);

                const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
                const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = tunePreviewFast ? 'low' : 'high';
                let focusCanvasRect = null;
                let quiltCanvasRect = null;
                const dedicationBox = stripPlanOnly
                  ? null
                  : measureDedicationMessageBox(ctx, dedicationMessage);
                /** Post/story cover: zoom slightly past fill so cream/white matte in the source raster does not peek at frame edges. */
                const quiltBgZoom = resolvedQuiltBgZoom;
                const layoutBQuiltBleed =
                  (isPostLayout
                    ? 1.04
                    : odqLayoutBSpeakerActiveFromOverlay(speakerOverlay)
                      ? ODQ_LAYOUT_B_STORY_QUILT_BLEED
                      : ODQ_LAYOUT_B_STORY_QUILT_BLEED_NO_SPEAKER) * quiltBgZoom;
                const applyQuiltBgZoomToRect = (x, y, w, h) => {
                  if (quiltBgZoom <= ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN + 0.0005) {
                    return { x, y, width: w, height: h };
                  }
                  const width = Math.round(w * quiltBgZoom);
                  const height = Math.round(h * quiltBgZoom);
                  return {
                    x: Math.round(x - (width - w) / 2),
                    y: Math.round(y - (height - h) / 2),
                    width,
                    height
                  };
                };
                if (!stripPlanOnly) {
                if (isPostLayout) {
                  const CQB = globalThis.CarouselQuiltBg;
                  if (CQB?.resolveLayoutBCarouselQuiltRect && CQB?.drawLayoutBCarouselQuiltBg) {
                    const resolved = CQB.resolveLayoutBCarouselQuiltRect(quiltImg, STORY_W, STORY_H, {
                      quiltBgZoom,
                      quiltFit: options?.quiltFit,
                      dedicationBoxHeight: dedicationBox?.height || 0,
                      layoutBQuiltBleed: isPostLayout ? 1.04 : layoutBQuiltBleed / quiltBgZoom
                    });
                    quiltCanvasRect = resolved.rect;
                    if (dedicationBox && resolved.dedicationMessageY != null) {
                      dedicationBox.y = resolved.dedicationMessageY;
                    }
                    CQB.drawLayoutBCarouselQuiltBg(
                      ctx,
                      quiltImg,
                      quiltCanvasRect,
                      STORY_W,
                      STORY_H,
                      { smoothingQuality: tunePreviewFast ? 'low' : 'high' }
                    );
                    if (
                      focusBlockRect &&
                      focusSourceViewBox &&
                      Number.isFinite(focusSourceViewBox.width) &&
                      Number.isFinite(focusSourceViewBox.height) &&
                      focusSourceViewBox.width > 0 &&
                      focusSourceViewBox.height > 0
                    ) {
                      const bx =
                        (Number(focusBlockRect.x) - Number(focusSourceViewBox.x || 0)) /
                        focusSourceViewBox.width;
                      const by =
                        (Number(focusBlockRect.y) - Number(focusSourceViewBox.y || 0)) /
                        focusSourceViewBox.height;
                      const bw = Number(focusBlockRect.width) / focusSourceViewBox.width;
                      const bh = Number(focusBlockRect.height) / focusSourceViewBox.height;
                      if ([bx, by, bw, bh].every(Number.isFinite)) {
                        focusCanvasRect = {
                          x: quiltCanvasRect.x + bx * quiltCanvasRect.width,
                          y: quiltCanvasRect.y + by * quiltCanvasRect.height,
                          width: bw * quiltCanvasRect.width,
                          height: bh * quiltCanvasRect.height
                        };
                      }
                    }
                  } else {
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
                    ({ x: dx, y: dy, width: dw, height: dh } = applyQuiltBgZoomToRect(dx, dy, dw, dh));
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
                    ({ x: dx, y: dy, width: dw, height: dh } = applyQuiltBgZoomToRect(dx, dy, dw, dh));
                  } else if (options?.quiltFit === 'cover') {
                    const rect = getAspectSafeCanvasRect(iw, ih, STORY_W, STORY_H, 'cover');
                    dw = Math.round(rect.width * layoutBQuiltBleed);
                    dh = Math.round(rect.height * layoutBQuiltBleed);
                    dx = Math.round(rect.x - (dw - rect.width) / 2);
                    dy = Math.round(rect.y - (dh - rect.height) / 2);
                  } else {
                    postScale = Math.max(STORY_W / iw, STORY_H / ih) * 1.04 * quiltBgZoom;
                    dw = Math.round(iw * postScale);
                    dh = Math.round(ih * postScale);
                    dx = Math.round((STORY_W - dw) / 2);
                    dy = Math.round((STORY_H - dh) / 2);
                  }
                  ctx.drawImage(quiltImg, dx, dy, dw, dh);
                  quiltCanvasRect = {
                    x: dx,
                    y: dy,
                    width: dw,
                    height: dh,
                    sourceWidth: iw,
                    sourceHeight: ih
                  };
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
                  }
                } else {
                  // Story Layout B: edge-to-edge cover; bleed hides warm matte in the 9:16 quilt source.
                  const rect = getAspectSafeCanvasRect(iw, ih, STORY_W, STORY_H, 'cover');
                  const cw = Math.round(rect.width * layoutBQuiltBleed);
                  const ch = Math.round(rect.height * layoutBQuiltBleed);
                  const qx = Math.round(rect.x - (cw - rect.width) / 2);
                  const qy = Math.round(rect.y - (ch - rect.height) / 2);
                  ctx.drawImage(quiltImg, qx, qy, cw, ch);
                }
                /** Story-only dim wash — 4:5 posts keep accurate quilt colors. */
                if (!isPostLayout) {
                  ctx.fillStyle = 'rgba(0,0,0,0.1)';
                  ctx.fillRect(0, 0, STORY_W, STORY_H);
                }
                }

                const innerMaxW = STRIP_MAX_W - PAPER_PAD_X * 2;
                const layoutQuoteAuthorGap = usePostQuoteLayout
                  ? ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_POST
                  : ODQ_LAYOUT_B_QUOTE_AUTHOR_GAP_STORY;
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
                    const o = { text: lines.join(' '), lines, font, lh, w, h, role };
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
                    odqSetLayoutBStripLetterSpacing(ctx, basePx);
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
                      odqSetLayoutBStripLetterSpacing(ctx, basePx);
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
                    const stripPx = parseInt(/(\d+)px/.exec(String(spec.font || ''))?.[1] || '48', 10);
                    odqSetLayoutBStripLetterSpacing(ctx, stripPx);
                    for (const ln of spec.lines) {
                      ctx.fillText(ln, ox, t + oy);
                      t += spec.lh;
                    }
                  };
                  ctx.font = spec.font;
                  odqSetLayoutBStripLetterSpacing(
                    ctx,
                    parseInt(/(\d+)px/.exec(String(spec.font || ''))?.[1] || '48', 10)
                  );
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

                let composedSpeakerRectForMeta = null;
                const finishLayoutBCanvas = () => {
                  drawDedicationMessageBox(ctx, dedicationBox);
                  if (!isPostLayout && !tunePreviewFast) {
                    applyLayoutBMagazinePrintFinish(ctx, STORY_W, STORY_H);
                  }
                  const composeMeta = {
                    ...(quiltCanvasRect ? { quiltCanvasRect } : {}),
                    ...(composedSpeakerRectForMeta
                      ? { composedSpeakerRect: composedSpeakerRectForMeta }
                      : {})
                  };
                  if (typeof options.onComposeMeta === 'function') {
                    options.onComposeMeta(Object.keys(composeMeta).length ? composeMeta : null);
                  }
                  globalThis._lastLayoutBComposeMeta =
                    Object.keys(composeMeta).length ? composeMeta : null;
                  const exportMime =
                    typeof options.exportMime === 'string' && options.exportMime.trim()
                      ? options.exportMime.trim()
                      : 'image/png';
                  const exportQuality =
                    typeof options.exportQuality === 'number' ? options.exportQuality : 0.95;
                  canvas.toBlob((blob) => {
                    if (!blob) {
                      reject(new Error('Could not create layout B image blob'));
                      return;
                    }
                    resolve(blob);
                  }, exportMime, exportMime === 'image/png' ? exportQuality : exportQuality);
                };

                if (options.speakerHeroPost === true) {
                  const speakerImgsHero = speakerOverlay?.imageUrl
                    ? await loadSpeakerOverlayImages(speakerOverlay.imageUrl)
                    : [];
                  const speakerImgHero = speakerImgsHero.find(Boolean);
                  const rawName = String(speakerOverlay?.name || quoteAuthor || '')
                    .replace(/^\s*[—-]\s*/, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  let nameSpec = null;
                  if (rawName) {
                    nameSpec = odqFitLayoutBAuthorNameToOneStrip(
                      ctx,
                      rawName,
                      bodyPx,
                      innerMaxW,
                      STRIP_MAX_W,
                      FONT_SERIF,
                      0.92
                    );
                  }
                  if (speakerImgHero) {
                    const heroRect = getSpeakerHeroPostRect(speakerImgHero);
                    if (heroRect) {
                      drawSpeakerOverlay(ctx, speakerImgHero, heroRect, speakerOverlay?.washColor, {
                        solidMatOpacity: ODQ_LAYOUT_B_SPEAKER_HERO_MAT_OPACITY,
                        imageUrl: speakerOverlay?.imageUrl,
                        cutoutSourceUrl: speakerOverlay?.cutoutSourceUrl,
                        subjectCrop: heroRect.subjectCrop || null
                      });
                    }
                  } else if (speakerOverlay?.imageUrl) {
                    console.warn('Layout B speaker hero post: cutout could not be drawn safely');
                  }
                  if (nameSpec) {
                    const nameBottomPad = 56;
                    const nameCy = STORY_H - nameBottomPad - nameSpec.h / 2;
                    const heroSafe = odqLayoutBPostGridSafeRect(STORY_W, STORY_H, 8);
                    const nameCx =
                      (heroSafe ? heroSafe.x + heroSafe.width / 2 : STORY_W / 2) + (rnd() - 0.5) * 32;
                    drawStripContent(nameSpec, nameCx, nameCy, (rnd() - 0.5) * 0.045, 'light');
                  }
                  finishLayoutBCanvas();
                  return;
                }

                const speakerImgs = speakerOverlay?.imageUrl
                  ? await loadSpeakerOverlayImages(speakerOverlay.imageUrl)
                  : [];
                const speakerRequested = odqLayoutBSpeakerActiveFromOverlay(speakerOverlay);
                const speakerActive = speakerRequested && speakerImgs.length > 0;
                const carouselStoryStyleSpeakerSeamRect =
                  carouselStoryStyle && speakerImgs.length
                    ? odqResolveCarouselStoryStyleSpeakerSeamRect(
                        speakerImgs[0],
                        STORY_W,
                        STORY_H,
                        options.carouselShortQuote === true
                      )
                    : null;
                const LAYOUT_B_STORY_REF_W = 1080;
                const LAYOUT_B_STORY_REF_H = 1920;
                /**
                 * layout-b.png: native 4:5 strip layout in the safe zone (avoids overlap after type maximize).
                 * Tune modal sets postStripLayoutFromStory=true to preview story positions on post.
                 */
                const layoutBPostNativeStripLayout =
                  isPostLayout &&
                  options.speakerHeroPost !== true &&
                  options.postStripLayoutFromStory !== true &&
                  !carouselStoryStyle;
                const carouselSpeakerAvoidRect =
                  !carouselStoryStyle &&
                  isPostLayout &&
                  options.speakerHeroPost !== true &&
                  options.carouselSpeakerAvoidRect &&
                  Number.isFinite(Number(options.carouselSpeakerAvoidRect.width)) &&
                  Number(options.carouselSpeakerAvoidRect.width) > 0
                    ? options.carouselSpeakerAvoidRect
                    : null;
                const inheritStoryStripPlanForPost =
                  isPostLayout &&
                  options.speakerHeroPost !== true &&
                  options.postQuoteStyleIndependent !== true &&
                  (options.postStripLayoutFromStory === true || carouselStoryStyle);
                const quoteOnlyPostInherit =
                  inheritStoryStripPlanForPost && options.speakerHeroPost !== true;
                /** Plan strips on 9:16 when speaker shares frame or tune requests story positions on post. */
                /** layout-b.png uses native post bands even when a speaker exists for story. */
                const useSpeakerUnifiedStripPlan =
                  inheritStoryStripPlanForPost ||
                  (isPostLayout && options.speakerHeroPost === true) ||
                  (!isPostLayout &&
                    (speakerActive ||
                      (speakerRequested && options.stripLayoutSeedExplicit)));
                const cachedStoryRefPlan = Array.isArray(options.storyRefStripPlan)
                  ? options.storyRefStripPlan
                  : null;
                let quoteStripPlan;
                if (
                  inheritStoryStripPlanForPost &&
                  cachedStoryRefPlan &&
                  cachedStoryRefPlan.length
                ) {
                  quoteStripPlan = odqCloneLayoutBStripPlan(cachedStoryRefPlan);
                  quoteStripPlan = scaleLayoutBStripPlan(
                    quoteStripPlan,
                    LAYOUT_B_STORY_REF_W,
                    LAYOUT_B_STORY_REF_H,
                    STORY_W,
                    STORY_H,
                    FONT_SERIF
                  );
                  const inheritedSpreadOpts = {
                    readingStack: true,
                    layoutSeed: rngDateKey,
                    stripLayoutSeed: resolvedStripLayoutSeed,
                    quoteText: layoutQuoteText,
                    carouselStoryStyle: carouselStoryStyle === true,
                    ...(carouselStoryStyleSpeakerSeamRect
                      ? { carouselStoryStyleSpeakerSeamRect }
                      : {}),
                    ...(carouselSpeakerAvoidRect
                      ? {
                          carouselSpeakerAvoidRect,
                          carouselShortQuote: options.carouselShortQuote === true
                        }
                      : {})
                  };
                  quoteStripPlan = odqFinishInheritedStoryToPostStripPlan(
                    quoteStripPlan,
                    ctx,
                    STORY_W,
                    STORY_H,
                    STRIP_MAX_W,
                    carouselStoryStyle ? false : quoteOnlyPostInherit,
                    FONT_SERIF,
                    inheritedSpreadOpts
                  );
                  if (carouselStoryStyle && quoteStripPlan.length) {
                    const carouselStoryMaxStripW = odqCarouselStoryStyleStripMaxWidth(
                      STORY_W,
                      STORY_H,
                      carouselStoryStyleSpeakerSeamRect,
                      STRIP_MAX_W
                    );
                    quoteStripPlan = odqMaximizeCarouselStoryStyleStripTypography(
                      quoteStripPlan,
                      ctx,
                      STORY_W,
                      STORY_H,
                      carouselStoryMaxStripW,
                      FONT_SERIF,
                      {
                        quoteText: layoutQuoteText,
                        quoteAuthor: layoutBPostAuthorName || quoteAuthor,
                        carouselStoryStyleSpeakerSeamRect,
                        spreadOpts: inheritedSpreadOpts
                      }
                    );
                    for (let shrinkPass = 0; shrinkPass < carouselShrinkPasses; shrinkPass++) {
                      if (
                        odqCarouselStoryStyleStripTypographyOk(
                          quoteStripPlan,
                          STORY_W,
                          STORY_H,
                          {
                            quoteText: layoutQuoteText,
                            carouselStoryStyleSpeakerSeamRect,
                            spreadOpts: inheritedSpreadOpts,
                            stripPlanAlreadySpread: true
                          },
                          ctx,
                          FONT_SERIF
                        )
                      ) {
                        break;
                      }
                      const shrinkPx = Math.max(
                        ODQ_CAROUSEL_STORY_STYLE_MIN_BODY_PX,
                        Math.round(odqLayoutBStripPlanQuoteBodyPx(quoteStripPlan) * 0.88)
                      );
                      quoteStripPlan = odqCarouselStoryStyleFinalizeStripSpread(
                        odqBuildUniformCarouselStoryStripPlan(
                          quoteStripPlan,
                          shrinkPx,
                          ctx,
                          carouselStoryMaxStripW,
                          FONT_SERIF,
                          {
                            hardMinBodyPx: ODQ_CAROUSEL_STORY_STYLE_MIN_BODY_PX,
                            noWrap: true
                          }
                        ),
                        STORY_W,
                        STORY_H,
                        {
                          spreadOpts: inheritedSpreadOpts,
                          quoteAuthor: layoutBPostAuthorName || quoteAuthor,
                          carouselStoryStyleSpeakerSeamRect
                        }
                      );
                    }
                    quoteStripPlan = odqNormalizeCarouselStoryStyleUniformTypography(
                      quoteStripPlan,
                      ctx,
                      carouselStoryMaxStripW,
                      FONT_SERIF,
                      {
                        noWrap: true
                      }
                    );
                    quoteStripPlan = odqCarouselStoryStyleFinalizeStripSpread(
                      quoteStripPlan,
                      STORY_W,
                      STORY_H,
                      {
                        quoteText: layoutQuoteText,
                        quoteAuthor: layoutBPostAuthorName || quoteAuthor,
                        spreadOpts: inheritedSpreadOpts,
                        carouselStoryStyleSpeakerSeamRect
                      }
                    );
                    const _lbkeCarousel = globalThis.LayoutBKeywordEmphasis;
                    const kwCarousel = options.keywordEmphasisExplicit
                      ? options.keywordEmphasis || null
                      : resolvedKeywordEmphasis || null;
                    if (
                      kwCarousel &&
                      Array.isArray(kwCarousel.keywords) &&
                      kwCarousel.keywords.length &&
                      _lbkeCarousel &&
                      !_lbkeCarousel.keywordEmphasisNeedsOwnStrip(
                        Array.isArray(kwCarousel.styles) && kwCarousel.styles.length
                          ? kwCarousel.styles
                          : ['bold']
                      )
                    ) {
                      const kwCarouselStyles =
                        Array.isArray(kwCarousel.styles) && kwCarousel.styles.length
                          ? kwCarousel.styles
                          : ['bold'];
                      for (const s of quoteStripPlan) {
                        if (s.role !== 'quote' && s.role !== 'emphasis' && !s.isKeywordEmphasis) continue;
                        const ln =
                          s.text ||
                          (Array.isArray(s.lines) && s.lines.length ? String(s.lines[0] || '') : '') ||
                          (_lbkeCarousel.runsToDisplayLine ? _lbkeCarousel.runsToDisplayLine(s.textRuns) : '');
                        if (!ln.trim()) continue;
                        const runs = _lbkeCarousel.buildTextRunsForLine(ln, kwCarousel.keywords, kwCarouselStyles);
                        s.textRuns = runs;
                        // Do NOT update s.lines — it's used for text-position sort lookups
                        // (runsToDisplayLine strips trailing punctuation via stripTrailingPunctAfterEmphasis,
                        // which makes "love," and "love." both "love", causing sort ties and strip swaps).
                      }
                      quoteStripPlan = refitLayoutBStripPlanToText(
                        quoteStripPlan,
                        ctx,
                        STRIP_MAX_W,
                        FONT_SERIF
                      );
                    }
                  } else if (carouselSpeakerAvoidRect && quoteStripPlan.length) {
                    const carouselStripMaxW = (() => {
                      const inner = odqLayoutBPostStripInnerColumnForCarouselSpeaker(
                        STORY_W,
                        STORY_H,
                        carouselSpeakerAvoidRect
                      );
                      return inner
                        ? Math.max(160, inner.right - inner.left - 12)
                        : STRIP_MAX_W;
                    })();
                    if (options.carouselShortQuote !== true) {
                      quoteStripPlan = refitLayoutBStripPlanToText(
                        odqCompactCarouselLongQuoteStripTypography(quoteStripPlan),
                        ctx,
                        carouselStripMaxW,
                        FONT_SERIF,
                        odqCarouselLongQuoteRefitOpts()
                      );
                    }
                    for (let shrinkPass = 0; shrinkPass < carouselShrinkPasses; shrinkPass++) {
                      quoteStripPlan = odqShrinkStripPlanTypographyUntilPostSafe(
                        quoteStripPlan,
                        ctx,
                        STORY_W,
                        STORY_H,
                        carouselStripMaxW,
                        FONT_SERIF,
                        {
                          carouselSpeakerAvoidRect,
                          quoteText: layoutQuoteText,
                          authorCutoutLabel: options.carouselShortQuote !== true
                        }
                      );
                      quoteStripPlan = odqApplyPostQuoteStripVerticalSpread(
                        quoteStripPlan,
                        STORY_W,
                        STORY_H,
                        inheritedSpreadOpts
                      );
                      if (
                        odqCarouselStripPlanLayoutOk(quoteStripPlan, carouselSpeakerAvoidRect) &&
                        odqLayoutBStripPlanFitsPostSpreadBounds(quoteStripPlan, STORY_W, STORY_H, {
                          carouselSpeakerAvoidRect,
                          quoteText: layoutQuoteText,
                          authorCutoutLabel: options.carouselShortQuote !== true
                        })
                      ) {
                        break;
                      }
                      quoteStripPlan = refitLayoutBStripPlanToText(
                        boostLayoutBStripPlanTypography(
                          options.carouselShortQuote === true
                            ? quoteStripPlan
                            : odqCompactCarouselLongQuoteStripTypography(quoteStripPlan),
                          0.88,
                          FONT_SERIF
                        ),
                        ctx,
                        carouselStripMaxW,
                        FONT_SERIF,
                        options.carouselShortQuote === true ? {} : odqCarouselLongQuoteRefitOpts()
                      );
                    }
                  }
                } else if (
                  !isPostLayout &&
                  options.tuneReuseStoryStripPlan === true &&
                  cachedStoryRefPlan &&
                  cachedStoryRefPlan.length
                ) {
                  quoteStripPlan = odqCloneLayoutBStripPlan(cachedStoryRefPlan);
                  const kwForReuse = options.keywordEmphasisExplicit
                    ? options.keywordEmphasis || null
                    : resolvedKeywordEmphasis || null;
                  if (
                    kwForReuse &&
                    Array.isArray(kwForReuse.keywords) &&
                    kwForReuse.keywords.length &&
                    LBKE &&
                    !LBKE.keywordEmphasisNeedsOwnStrip(
                      Array.isArray(kwForReuse.styles) && kwForReuse.styles.length
                        ? kwForReuse.styles
                        : ['bold']
                    )
                  ) {
                    const kwStyles =
                      Array.isArray(kwForReuse.styles) && kwForReuse.styles.length
                        ? kwForReuse.styles
                        : ['bold'];
                    for (const s of quoteStripPlan) {
                      if (s.role !== 'quote' && s.role !== 'emphasis' && !s.isKeywordEmphasis) continue;
                      const ln =
                        s.text ||
                        (Array.isArray(s.lines) && s.lines.length ? String(s.lines[0] || '') : '') ||
                        (LBKE.runsToDisplayLine ? LBKE.runsToDisplayLine(s.textRuns) : '');
                      if (!ln.trim()) continue;
                      const runs = LBKE.buildTextRunsForLine(ln, kwForReuse.keywords, kwStyles);
                      s.textRuns = runs;
                      // Do NOT update s.lines — preserve original text for position lookups.
                    }
                    quoteStripPlan = refitLayoutBStripPlanToText(
                      quoteStripPlan,
                      ctx,
                      STRIP_MAX_W,
                      FONT_SERIF
                    );
                  }
                } else {
                  quoteStripPlan = getLayoutBStoryQuotePlan(ctx, {
                    quoteText: layoutQuoteText,
                    quoteAuthor: layoutBPostQuoteOnlyAuthor ? layoutBPostAuthorName : quoteAuthor,
                    layoutW: useSpeakerUnifiedStripPlan ? LAYOUT_B_STORY_REF_W : STORY_W,
                    layoutH: useSpeakerUnifiedStripPlan ? LAYOUT_B_STORY_REF_H : STORY_H,
                    dateKey: rngDateKey,
                    usePostQuoteLayout,
                    postQuoteOnlyAuthor: layoutBPostQuoteOnlyAuthor,
                    speakerLayoutActive: speakerActive && !isPostLayout,
                    stripBoundsRect: (() => {
                      if (useSpeakerUnifiedStripPlan) return null;
                      if (dedicationBox && quiltCanvasRect) {
                        return {
                          x: quiltCanvasRect.x + 18,
                          y: quiltCanvasRect.y + 18,
                          width: quiltCanvasRect.width - 36,
                          height: quiltCanvasRect.height - 18
                        };
                      }
                      if (
                        layoutBPostNativeStripLayout ||
                        (isPostLayout && !speakerRequested && options.speakerHeroPost !== true)
                      ) {
                        if (carouselSpeakerAvoidRect) {
                          return odqLayoutBPostGridSafeRectForCarouselSpeaker(
                            STORY_W,
                            STORY_H,
                            carouselSpeakerAvoidRect
                          );
                        }
                        return odqLayoutBPostGridSafeRect(STORY_W, STORY_H);
                      }
                      return null;
                    })(),
                    avoidRects: (() => {
                      if (useSpeakerUnifiedStripPlan) return [];
                      const rects =
                        layoutBPostNativeStripLayout && !carouselSpeakerAvoidRect
                          ? []
                          : [
                              focusCanvasRect ? { ...focusCanvasRect, pad: 84 } : null,
                              dedicationBox
                                ? {
                                    x: dedicationBox.x,
                                    y: dedicationBox.y,
                                    width: dedicationBox.width,
                                    height: dedicationBox.height,
                                    pad: 18
                                  }
                                : null
                            ].filter(Boolean);
                      if (carouselSpeakerAvoidRect) {
                        const frame = odqCarouselSpeakerCutoutFrameRect(carouselSpeakerAvoidRect);
                        const content = odqCarouselSpeakerContentRect(carouselSpeakerAvoidRect);
                        const avoid = frame || content;
                        const seamPad = ODQ_CAROUSEL_SPEAKER_SEAM_DRAW_PAD;
                        rects.push({
                          x: avoid.x - seamPad,
                          y: avoid.y - seamPad,
                          width: avoid.width + seamPad * 2,
                          height: avoid.height + seamPad * 2,
                          pad: 20,
                          weight: 12,
                          forcePostAvoid: true
                        });
                      }
                      return rects;
                    })(),
                    maxQuoteCanvasCoverage: null,
                    keywordEmphasis: options.keywordEmphasisExplicit
                      ? options.keywordEmphasis || null
                      : resolvedKeywordEmphasis || null,
                    stripLayoutSeed: resolvedStripLayoutSeed,
                    stripFontScale: layoutBPostNativeStripLayout ? 1.12 : 1,
                    carouselSpeakerAvoidRect,
                    carouselShortQuote: options.carouselShortQuote === true
                  });
                  if (
                    speakerActive &&
                    quoteStripPlan.length &&
                    !(isPostLayout && options.speakerHeroPost !== true)
                  ) {
                    const liftH = useSpeakerUnifiedStripPlan ? LAYOUT_B_STORY_REF_H : STORY_H;
                    odqApplySpeakerStripLift(quoteStripPlan, liftH);
                  }
                  if (isPostLayout && useSpeakerUnifiedStripPlan && quoteStripPlan.length) {
                    quoteStripPlan = scaleLayoutBStripPlan(
                      quoteStripPlan,
                      LAYOUT_B_STORY_REF_W,
                      LAYOUT_B_STORY_REF_H,
                      STORY_W,
                      STORY_H,
                      FONT_SERIF
                    );
                    if (inheritStoryStripPlanForPost) {
                      quoteStripPlan = odqFinishInheritedStoryToPostStripPlan(
                        quoteStripPlan,
                        ctx,
                        STORY_W,
                        STORY_H,
                        STRIP_MAX_W,
                        quoteOnlyPostInherit,
                        FONT_SERIF,
                        {
                          readingStack: options.postStripLayoutFromStory !== true,
                          layoutSeed: rngDateKey,
                          stripLayoutSeed: resolvedStripLayoutSeed
                        }
                      );
                    } else {
                      quoteStripPlan = refitLayoutBStripPlanToText(
                        boostLayoutBStripPlanTypography(
                          quoteStripPlan,
                          ODQ_LAYOUT_B_SPEAKER_POST_STRIP_FONT_SCALE,
                          FONT_SERIF
                        ),
                        ctx,
                        STRIP_MAX_W,
                        FONT_SERIF
                      );
                      quoteStripPlan = odqApplyPostQuoteStripVerticalSpread(
                        quoteStripPlan,
                        STORY_W,
                        STORY_H,
                        {
                          readingStack: true,
                          layoutSeed: rngDateKey,
                          stripLayoutSeed: resolvedStripLayoutSeed
                        }
                      );
                    }
                  } else if (
                    isPostLayout &&
                    layoutBPostNativeStripLayout &&
                    quoteStripPlan.length
                  ) {
                    if (carouselSpeakerAvoidRect) {
                      const carouselStripMaxW = (() => {
                        const inner = odqLayoutBPostStripInnerColumnForCarouselSpeaker(
                          STORY_W,
                          STORY_H,
                          carouselSpeakerAvoidRect
                        );
                        return inner
                          ? Math.max(160, inner.right - inner.left - 12)
                          : STRIP_MAX_W;
                      })();
                      if (options.carouselShortQuote !== true) {
                        quoteStripPlan = refitLayoutBStripPlanToText(
                          odqCompactCarouselLongQuoteStripTypography(quoteStripPlan),
                          ctx,
                          carouselStripMaxW,
                          FONT_SERIF,
                          odqCarouselLongQuoteRefitOpts()
                        );
                      }
                      for (let shrinkPass = 0; shrinkPass < carouselShrinkPasses; shrinkPass++) {
                        quoteStripPlan = odqShrinkStripPlanTypographyUntilPostSafe(
                          quoteStripPlan,
                          ctx,
                          STORY_W,
                          STORY_H,
                          carouselStripMaxW,
                          FONT_SERIF,
                          {
                            carouselSpeakerAvoidRect,
                            quoteText: layoutQuoteText,
                            authorCutoutLabel: options.carouselShortQuote !== true
                          }
                        );
                        quoteStripPlan = odqApplyPostQuoteStripVerticalSpread(
                          quoteStripPlan,
                          STORY_W,
                          STORY_H,
                          {
                            readingStack: true,
                            layoutSeed: rngDateKey,
                            stripLayoutSeed: resolvedStripLayoutSeed,
                            carouselSpeakerAvoidRect,
                            carouselShortQuote: options.carouselShortQuote === true,
                            quoteText: layoutQuoteText
                          }
                        );
                        if (
                          odqCarouselStripPlanLayoutOk(quoteStripPlan, carouselSpeakerAvoidRect) &&
                          odqLayoutBStripPlanFitsPostSpreadBounds(quoteStripPlan, STORY_W, STORY_H, {
                            carouselSpeakerAvoidRect,
                            quoteText: layoutQuoteText,
                            authorCutoutLabel: options.carouselShortQuote !== true
                          })
                        ) {
                          break;
                        }
                        quoteStripPlan = refitLayoutBStripPlanToText(
                          boostLayoutBStripPlanTypography(
                            options.carouselShortQuote === true
                              ? quoteStripPlan
                              : odqCompactCarouselLongQuoteStripTypography(quoteStripPlan),
                            0.88,
                            FONT_SERIF
                          ),
                          ctx,
                          carouselStripMaxW,
                          FONT_SERIF,
                          options.carouselShortQuote === true ? {} : odqCarouselLongQuoteRefitOpts()
                        );
                      }
                    } else {
                      quoteStripPlan = odqApplyPostQuoteStripVerticalSpread(quoteStripPlan, STORY_W, STORY_H, {
                        readingStack: true,
                        layoutSeed: rngDateKey,
                        stripLayoutSeed: resolvedStripLayoutSeed
                      });
                    }
                  } else if (
                    isPostLayout &&
                    !useSpeakerUnifiedStripPlan &&
                    quoteStripPlan.length &&
                    options.speakerHeroPost !== true
                  ) {
                    quoteStripPlan = odqApplyPostQuoteStripVerticalSpread(quoteStripPlan, STORY_W, STORY_H, {
                      readingStack: true,
                      layoutSeed: rngDateKey,
                      stripLayoutSeed: resolvedStripLayoutSeed,
                      ...(carouselSpeakerAvoidRect ? { carouselSpeakerAvoidRect } : {})
                    });
                  }
                  // Story scatter: use saved post strip plan positions when available (same arrangement as post).
                  if (!isPostLayout && speakerActive && quoteStripPlan.length) {
                    if (Array.isArray(options.savedPostStripPlan) && options.savedPostStripPlan.length) {
                      const sLabel = (s) =>
                        String(s.text || (Array.isArray(s.lines) ? s.lines.join(' ') : '') || '')
                          .replace(/^\s*[—-]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
                      // Try text match; fall back to index if fewer than half match
                      const savedByText = Object.create(null);
                      for (const s of options.savedPostStripPlan) {
                        const t = sLabel(s);
                        if (t) savedByText[t] = s;
                      }
                      let textMatched = 0;
                      for (const s of quoteStripPlan) { if (savedByText[sLabel(s)]) textMatched++; }
                      const useIndex = textMatched < Math.ceil(quoteStripPlan.length / 2);
                      for (let si = 0; si < quoteStripPlan.length; si++) {
                        const s = quoteStripPlan[si];
                        const saved = useIndex
                          ? (options.savedPostStripPlan[si] || null)
                          : (savedByText[sLabel(s)] || null);
                        if (saved) {
                          if (saved.x != null) s.x = saved.x;
                          if (saved.y != null) s.y = saved.y;
                          if (saved.role) s.role = saved.role;
                        }
                      }
                    }
                  }

                  if (
                    typeof options.onStoryRefStripPlan === 'function' &&
                    !isPostLayout &&
                    quoteStripPlan.length &&
                    (speakerActive || options.captureStoryRefStripPlan === true)
                  ) {
                    options.onStoryRefStripPlan(odqCloneLayoutBStripPlan(quoteStripPlan));
                  }
                  if (options.stripPlanCaptureOnly === true) {
                    resolve(null);
                    return;
                  }
                }
                let speakerDrawn = false;
                const skipSpeakerDrawOnPost =
                  isPostLayout &&
                  options.speakerHeroPost !== true &&
                  options.carouselStoryStyle !== true;
                let lastSpeakerRectDrawn = null;
                for (const speakerImg of speakerImgs) {
                  if (skipSpeakerDrawOnPost) break;
                  let speakerRect;
                  let seamRectForMeta = null;
                  if (carouselStoryStyle) {
                    seamRectForMeta = odqResolveCarouselStoryStyleSpeakerSeamRect(
                      speakerImg,
                      STORY_W,
                      STORY_H,
                      options.carouselShortQuote === true
                    );
                    speakerRect = seamRectForMeta
                      ? {
                          x: seamRectForMeta.x,
                          y: seamRectForMeta.y,
                          width: seamRectForMeta.width,
                          height: seamRectForMeta.height,
                          angle: Number(seamRectForMeta.angle || 0),
                          contentX: seamRectForMeta.contentX,
                          contentY: seamRectForMeta.contentY,
                          contentWidth: seamRectForMeta.contentWidth,
                          contentHeight: seamRectForMeta.contentHeight
                        }
                      : getSpeakerOverlayRect(speakerImg, quoteStripPlan);
                  } else {
                    speakerRect = getSpeakerOverlayRect(speakerImg, quoteStripPlan);
                  }
                  /**
                   * Admin preset override (story-only today): when a `transform` is passed in,
                   * lock the cutout to an absolute center (% of canvas) and scale its base size.
                   * `getSpeakerOverlayRect` still computes the aspect-correct base WxH; we
                   * scale around that and reposition. AUTO is signalled by no `transform`.
                   */
                  const speakerTransform = speakerOverlay?.transform;
                  if (speakerRect && speakerTransform?.autoRelative) {
                    odqApplySpeakerAutoRelativeTransform(
                      speakerRect,
                      speakerTransform,
                      STORY_W,
                      STORY_H
                    );
                  } else if (
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
                  speakerDrawn = drawSpeakerOverlay(ctx, speakerImg, speakerRect, speakerOverlay?.washColor, {
                    imageUrl: speakerOverlay?.imageUrl,
                    cutoutSourceUrl: speakerOverlay?.cutoutSourceUrl,
                    bleedPhase: carouselStoryStyle ? 'layout-b-slide1' : isPostLayout ? 'layout-b-post' : 'layout-b-story'
                  });
                  if (speakerDrawn) {
                    lastSpeakerRectDrawn = carouselStoryStyle
                      ? odqCarouselStoryStyleSpeakerRectAfterTransform(speakerRect, seamRectForMeta)
                      : { ...speakerRect };
                    break;
                  }
                }
                if (speakerOverlay?.imageUrl && !speakerDrawn) {
                  console.warn('Layout B speaker overlay skipped: image could not be drawn safely');
                }
                if (carouselStoryStyle && lastSpeakerRectDrawn) {
                  composedSpeakerRectForMeta = odqCarouselStoryStyleSpeakerRectToComposeMeta(
                    lastSpeakerRectDrawn
                  );
                }
                drawDedicatedBlockRing(ctx, focusCanvasRect);
                if (layoutBPostQuoteOnlyAuthor && quoteStripPlan.length) {
                  quoteStripPlan = odqReflowQuoteOnlyPostAuthorStrips(
                    quoteStripPlan,
                    ctx,
                    STRIP_MAX_W,
                    FONT_SERIF,
                    STORY_W,
                    STORY_H
                  );
                  if (layoutBPostAuthorName) {
                    quoteStripPlan = odqRemoveTrailingAuthorQuoteStripsFromPlan(
                      quoteStripPlan,
                      layoutBPostAuthorName
                    );
                  }
                  if (carouselSpeakerAvoidRect) {
                    if (
                      options.carouselShortQuote !== true &&
                      typeof globalThis.odqCarouselSpeakerAnchorAuthorCutoutLabel === 'function'
                    ) {
                      quoteStripPlan = globalThis.odqCarouselSpeakerAnchorAuthorCutoutLabel(
                        quoteStripPlan,
                        STORY_W,
                        STORY_H,
                        carouselSpeakerAvoidRect,
                        {
                          layoutSeed: rngDateKey,
                          stripLayoutSeed: resolvedStripLayoutSeed
                        }
                      );
                    } else if (
                      typeof globalThis.odqCarouselSpeakerEnsureAuthorBelowQuotes === 'function'
                    ) {
                      quoteStripPlan = globalThis.odqCarouselSpeakerEnsureAuthorBelowQuotes(
                        quoteStripPlan,
                        STORY_W,
                        STORY_H,
                        carouselSpeakerAvoidRect,
                        {
                          minGap: 56,
                          layoutSeed: rngDateKey,
                          stripLayoutSeed: resolvedStripLayoutSeed,
                          quoteText: layoutQuoteText
                        }
                      );
                    }
                  }
                }
                if (carouselSpeakerAvoidRect && quoteStripPlan.length) {
                  if (typeof globalThis.odqApplyCarouselSpeakerStripLayout === 'function') {
                    quoteStripPlan = globalThis.odqApplyCarouselSpeakerStripLayout(
                      quoteStripPlan,
                      STORY_W,
                      STORY_H,
                      {
                        carouselSpeakerAvoidRect,
                        carouselShortQuote: options.carouselShortQuote === true,
                        layoutSeed: rngDateKey,
                        stripLayoutSeed: resolvedStripLayoutSeed,
                        quoteText: layoutQuoteText,
                        phase: 'constraints'
                      }
                    );
                  }
                }
                console.log('[PRE-CAROUSEL-FINALIZE]', 'carouselStoryStyle='+carouselStoryStyle, 'planLen='+(quoteStripPlan||[]).length, STORY_W+'x'+STORY_H);
                if (carouselStoryStyle && quoteStripPlan.length) {
                  quoteStripPlan = odqCarouselStoryStyleFinalizeStripSpread(
                    quoteStripPlan,
                    STORY_W,
                    STORY_H,
                    {
                      quoteText: layoutQuoteText,
                      quoteAuthor: layoutBPostAuthorName || quoteAuthor,
                      spreadOpts: {
                        readingStack: true,
                        layoutSeed: rngDateKey,
                        stripLayoutSeed: resolvedStripLayoutSeed,
                        quoteText: layoutQuoteText,
                        carouselStoryStyle: true,
                        carouselStoryStyleSpeakerSeamRect
                      },
                      carouselStoryStyleSpeakerSeamRect
                    }
                  );
                }
                if (isPostLayout && quoteStripPlan.length) {
                  quoteStripPlan = odqClampLayoutBStripPlanToPostSafe(
                    quoteStripPlan,
                    STORY_W,
                    STORY_H
                  );
                }
                if (carouselStoryStyle && quoteStripPlan.length) {
                  quoteStripPlan = odqApplyCarouselStoryStyleAuthorFontScale(
                    quoteStripPlan,
                    ctx,
                    STRIP_MAX_W,
                    FONT_SERIF
                  );
                }
                // If archive-service saved a pre-rendered post strip plan (from tune modal), apply it directly
                const _useSavedPlan = (() => {
                  if (!carouselStoryStyle || !isPostLayout || !quoteStripPlan.length) return false;
                  if (!Array.isArray(options.savedPostStripPlan) || !options.savedPostStripPlan.length) return false;
                  const stripText = (s) =>
                    String(s.text || (Array.isArray(s.lines) ? s.lines.join(' ') : '') || '')
                      .replace(/^\s*[—-]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
                  const savedByText = Object.create(null);
                  for (const s of options.savedPostStripPlan) {
                    const t = stripText(s);
                    if (t) savedByText[t] = s;
                  }
                  let matched = 0;
                  for (const s of quoteStripPlan) {
                    const saved = savedByText[stripText(s)];
                    if (saved) {
                      if (saved.x != null) s.x = saved.x;
                      if (saved.y != null) s.y = saved.y;
                      if (saved.role) s.role = saved.role;
                      matched++;
                    }
                  }
                  return matched >= Math.ceil(quoteStripPlan.length / 2);
                })();
                if (!_useSavedPlan && carouselStoryStyle && quoteStripPlan.length && layoutBPostAuthorName) {
                  const authorNameLower = layoutBPostAuthorName.toLowerCase();
                  const stripLabel = (s) =>
                    String(s.text || (Array.isArray(s.lines) ? s.lines.join(' ') : '') || '')
                      .replace(/^\s*[—-]\s*/, '')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .toLowerCase();
                  const authorStrips = quoteStripPlan.filter((s) => stripLabel(s) === authorNameLower);
                  const quoteStrips = quoteStripPlan.filter((s) => stripLabel(s) !== authorNameLower);
                  if (authorStrips.length && quoteStrips.length) {
                    const quoteSrc = layoutQuoteText.toLowerCase();
                    const quotePos = (s) => {
                      const label = stripLabel(s);
                      if (!label) return Number.MAX_SAFE_INTEGER;
                      let idx = quoteSrc.indexOf(label);
                      if (idx >= 0) return idx;
                      if (label.length > 10) {
                        idx = quoteSrc.indexOf(label.slice(0, 10));
                        if (idx >= 0) return idx;
                      }
                      for (const word of label.split(/\s+/).filter((w) => w.length > 3)) {
                        idx = quoteSrc.indexOf(word);
                        if (idx >= 0) return idx;
                      }
                      return Number.MAX_SAFE_INTEGER;
                    };
                    const orderedQuotes = quoteStrips.slice().sort((a, b) => quotePos(a) - quotePos(b));
                    const safe9 = odqLayoutBPostSafeBounds(STORY_W, STORY_H, 10);
                    const sL = safe9 ? safe9.left : 52;
                    const sR = safe9 ? safe9.right : 1029;
                    const safeW = sR - sL;
                    // Dedicated RNG seeded from date+stripLayoutSeed — deterministic regardless of upstream rnd() calls
                    let lrngSeed9 = odqMixStripLayoutSeedIntoRng(2166136261, rngDateKey, resolvedStripLayoutSeed ^ 0x6c61796f);
                    const lrnd = () => {
                      lrngSeed9 |= 0;
                      lrngSeed9 = (lrngSeed9 + 0x6d2b79f5) | 0;
                      let t9 = Math.imul(lrngSeed9 ^ (lrngSeed9 >>> 15), 1 | lrngSeed9);
                      t9 ^= t9 + Math.imul(t9 ^ (t9 >>> 7), 61 | t9);
                      return ((t9 ^ (t9 >>> 14)) >>> 0) / 4294967296;
                    };
                    // Group consecutive strips into rows; pair when combined width fits
                    const rows9 = [];
                    let ri = 0;
                    while (ri < orderedQuotes.length) {
                      const q = orderedQuotes[ri];
                      const w = Number(q.w || 300);
                      const next = orderedQuotes[ri + 1];
                      const nw = next ? Number(next.w || 300) : 0;
                      if (next && w + 32 + nw <= safeW * 0.88 && lrnd() > 0.45) {
                        rows9.push([q, next]);
                        ri += 2;
                      } else {
                        rows9.push([q]);
                        ri += 1;
                      }
                    }
                    let cursor = safe9 ? safe9.top + 12 : 30;
                    const NR = rows9.length;
                    for (let ri2 = 0; ri2 < NR; ri2++) {
                      const row = rows9[ri2];
                      const rowH = Math.max(...row.map((s) => Number(s.h || 0)));
                      const rowY = cursor + rowH / 2;
                      cursor = rowY + rowH / 2 + 40 + Math.round(lrnd() * 20);
                      if (row.length === 1) {
                        const q = row[0];
                        const w = Number(q.w || 300);
                        const t = NR > 1 ? ri2 / (NR - 1) : 0.5;
                        const minX = sL + w / 2;
                        const maxX = sR - w / 2;
                        const flowX = minX + (maxX - minX) * (0.05 + t * 0.55);
                        const scatter = (lrnd() - 0.5) * (maxX - minX) * 0.25;
                        q.x = Math.max(minX, Math.min(maxX, Math.round(flowX + scatter)));
                        q.y = rowY;
                      } else {
                        // Two strips: place left-to-right with small gap, offset row slightly
                        const totalW = row.reduce((s, q) => s + Number(q.w || 300), 0) + 28;
                        const rowOffsetX = sL + Math.round(lrnd() * Math.max(0, safeW - totalW));
                        let rx = rowOffsetX;
                        for (const q of row) {
                          const w = Number(q.w || 300);
                          q.x = rx + w / 2;
                          q.y = rowY;
                          rx += w + 28;
                        }
                      }
                    }
                    cursor += 18;
                    for (const a of authorStrips) {
                      a.role = 'author';
                      const h = Number(a.h || 0);
                      const aw = Number(a.w || 200);
                      a.y = cursor + h / 2;
                      a.x = Math.round(sR - aw / 2 - 20);
                      cursor = a.y + h / 2 + 8;
                    }
                  }
                }
                if (
                  carouselStoryStyle &&
                  isPostLayout &&
                  quoteStripPlan.length &&
                  typeof options.onPostStripPlan === 'function'
                ) {
                  options.onPostStripPlan(odqCloneLayoutBStripPlan(quoteStripPlan));
                }
                const quoteStripDx = Math.round(odqNormalizeQuoteStripOffsetComponent(resolvedQuoteStripOffset.x) * STORY_W);
                const quoteStripDy = Math.round(odqNormalizeQuoteStripOffsetComponent(resolvedQuoteStripOffset.y) * STORY_H);
                if (quoteStripDx || quoteStripDy) {
                  quoteStripPlan = quoteStripPlan.map((s) => ({
                    ...s,
                    x: (Number(s.x) || 0) + quoteStripDx,
                    y: (Number(s.y) || 0) + quoteStripDy
                  }));
                }
                const cutoutLabelAuthors = quoteStripPlan.filter(
                  (s) => s.role === 'author' && s.authorCutoutLabel
                );
                const drawNowStrips = quoteStripPlan.filter(
                  (s) => !(s.role === 'author' && s.authorCutoutLabel)
                );
                for (const spec of drawNowStrips) {
                  const stripVariant = odqLayoutBAuthorStripVariant(speakerActive, spec.role);
                  drawStripContent(spec, spec.x, spec.y, spec.angle, stripVariant);
                }
                for (const spec of cutoutLabelAuthors) {
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
                finishLayoutBCanvas();
              })
              .catch(reject);
      });
    }

    // Layout-B / IG helpers still defined in this module but called from extracted lib/* scripts.
    globalThis.ensureOdqCanvasFontsReady = ensureOdqCanvasFontsReady;
    globalThis.getLayoutBStoryQuotePlan = getLayoutBStoryQuotePlan;
    globalThis.buildLayoutBQuoteStripPlan = buildLayoutBQuoteStripPlan;
    globalThis.ODQ_CANVAS_SERIF_FONT = ODQ_CANVAS_SERIF_FONT;
    globalThis.ODQ_LAYOUT_B_STRIP_FONT = ODQ_LAYOUT_B_STRIP_FONT;
    globalThis.ODQ_LAYOUT_B_STRIP_LETTER_SPACING_EM = ODQ_LAYOUT_B_STRIP_LETTER_SPACING_EM;
    globalThis.IG_QUILT_SCREEN_ASPECT = IG_QUILT_SCREEN_ASPECT;
    globalThis.odqLayoutBPostQuoteStyleIndependent = odqLayoutBPostQuoteStyleIndependent;
    globalThis.odqLayoutBPostGridSafeRect = odqLayoutBPostGridSafeRect;
    globalThis.scaleLayoutBStripPlan = scaleLayoutBStripPlan;
    globalThis.odqCloneLayoutBStripPlan = odqCloneLayoutBStripPlan;
    globalThis.odqApplySpeakerStripLift = odqApplySpeakerStripLift;
    globalThis.refitLayoutBStripPlanToText = refitLayoutBStripPlanToText;
    globalThis.odqMixStripLayoutSeedIntoRng = odqMixStripLayoutSeedIntoRng;
    globalThis.odqNormalizeStripLayoutSeed = odqNormalizeStripLayoutSeed;
    globalThis.odqNormalizeTuneAspect = odqNormalizeTuneAspect;
    globalThis.odqPromiseWithTimeout = odqPromiseWithTimeout;
    globalThis.odqPreferFastLayoutBPreview = odqPreferFastLayoutBPreview;
    globalThis.odqTuneModalPreviewScale = odqTuneModalPreviewScale;
    globalThis.odqClearTuneComposeSpeakerImgCache = odqClearTuneComposeSpeakerImgCache;
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
    globalThis.odqBuildLayoutBTuneFirestorePayload = odqBuildLayoutBTuneFirestorePayload;
    globalThis.odqWriteLayoutBTuneViaServer = odqWriteLayoutBTuneViaServer;
    globalThis.odqVerifyLayoutBTuneOnServer = odqVerifyLayoutBTuneOnServer;
    globalThis.odqReadInstagramImagesDocWithFallback = odqReadInstagramImagesDocWithFallback;
    globalThis.odqNormalizeQuiltBgZoom = odqNormalizeQuiltBgZoom;
    globalThis.odqFormatQuiltBgZoomLabel = odqFormatQuiltBgZoomLabel;
    globalThis.odqGetCachedLayoutBQuiltBgZoom = odqGetCachedLayoutBQuiltBgZoom;
    globalThis.odqSetCachedLayoutBQuiltBgZoom = odqSetCachedLayoutBQuiltBgZoom;
    globalThis.odqReadLayoutBQuiltBgZoom = odqReadLayoutBQuiltBgZoom;
    globalThis.odqWriteLayoutBQuiltBgZoom = odqWriteLayoutBQuiltBgZoom;
    globalThis.odqNormalizeQuoteStripOffset = odqNormalizeQuoteStripOffset;
    globalThis.odqNormalizeQuoteStripOffsetComponent = odqNormalizeQuoteStripOffsetComponent;
    globalThis.odqGetCachedLayoutBQuoteStripOffset = odqGetCachedLayoutBQuoteStripOffset;
    globalThis.odqSetCachedLayoutBQuoteStripOffset = odqSetCachedLayoutBQuoteStripOffset;
    globalThis.odqReadLayoutBQuoteStripOffset = odqReadLayoutBQuoteStripOffset;
    globalThis.odqWriteLayoutBQuoteStripOffset = odqWriteLayoutBQuoteStripOffset;
    globalThis.ODQ_LAYOUT_B_QUILT_BG_ZOOM_STEP = ODQ_LAYOUT_B_QUILT_BG_ZOOM_STEP;
    globalThis.ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN = ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
    globalThis.ODQ_LAYOUT_B_QUILT_BG_ZOOM_MAX = ODQ_LAYOUT_B_QUILT_BG_ZOOM_MAX;
    /* odqIsCapacitorNative — already on root from inline head bootstrap */
    globalThis.ODQ_SPEAKER_PRESETS = ODQ_SPEAKER_PRESETS;
    globalThis.ODQ_SPEAKER_NUDGE_STEP = ODQ_SPEAKER_NUDGE_STEP;
    globalThis.ODQ_SPEAKER_BIG_NUDGE_MUL = ODQ_SPEAKER_BIG_NUDGE_MUL;
    globalThis.ODQ_SPEAKER_ROTATE_STEP_DEG = ODQ_SPEAKER_ROTATE_STEP_DEG;
    globalThis.ODQ_SPEAKER_SCALE_STEP = ODQ_SPEAKER_SCALE_STEP;
    globalThis.odqNormalizeSpeakerScaleMul = odqNormalizeSpeakerScaleMul;
    globalThis.odqStripPlanAxisRect = odqStripPlanAxisRect;
    globalThis.odqStripPlanHasOverlaps = odqStripPlanHasOverlaps;
    globalThis.odqStripPlanCarouselTextOverlaps = odqStripPlanCarouselTextOverlaps;
    globalThis.odqStripPlanOverlapsCarouselSpeaker = odqStripPlanOverlapsCarouselSpeaker;
    globalThis.odqCarouselSpeakerSeparateStripVertical = odqCarouselSpeakerSeparateStripVertical;
    globalThis.odqCarouselSpeakerSeparateStripHorizontal = odqCarouselSpeakerSeparateStripHorizontal;
    globalThis.odqCarouselSpeakerFixAllSameRowPairOverlaps = odqCarouselSpeakerFixAllSameRowPairOverlaps;
    globalThis.odqCarouselSpeakerClampStripPlanOffCutout = odqCarouselSpeakerClampStripPlanOffCutout;
    globalThis.odqClampLayoutBStripPlanToCarouselSpeakerRegion =
      odqClampLayoutBStripPlanToCarouselSpeakerRegion;
    globalThis.odqReflowLayoutBStripPlanAroundCarouselSpeaker =
      odqReflowLayoutBStripPlanAroundCarouselSpeaker;
    globalThis.odqCarouselSpeakerVariedSameRowGaps = odqCarouselSpeakerVariedSameRowGaps;
    globalThis.odqCarouselSpeakerStaggerSameRowVerticalLift =
      odqCarouselSpeakerStaggerSameRowVerticalLift;
    globalThis.odqCarouselSpeakerVariedRowGaps = odqCarouselSpeakerVariedRowGaps;
    globalThis.odqCarouselSpeakerAnchorAuthorStripTerminal =
      odqCarouselSpeakerAnchorAuthorStripTerminal;
    globalThis.odqCarouselSpeakerEnforceReadingOrderStripGaps =
      odqCarouselSpeakerEnforceReadingOrderStripGaps;
    globalThis.odqCarouselSpeakerEnforceMonotonicTextOrderY =
      odqCarouselSpeakerEnforceMonotonicTextOrderY;
    globalThis.odqCarouselSpeakerEnforceQuoteStackVisualGap =
      odqCarouselSpeakerEnforceQuoteStackVisualGap;
    globalThis.odqCompactCarouselLongQuoteStripTypography =
      odqCompactCarouselLongQuoteStripTypography;
    globalThis.odqCarouselSpeakerMergeSegmentsToRowBudget =
      odqCarouselSpeakerMergeSegmentsToRowBudget;
    globalThis.odqCarouselSpeakerEstimateMaxQuoteRows =
      odqCarouselSpeakerEstimateMaxQuoteRows;
    globalThis.odqCarouselSpeakerColumnMaxWidth = odqCarouselSpeakerColumnMaxWidth;
    globalThis.odqCarouselSpeakerRestackQuoteStripsVertically =
      odqCarouselSpeakerRestackQuoteStripsVertically;
    globalThis.odqCarouselSpeakerEnsureAuthorBelowQuotes =
      odqCarouselSpeakerEnsureAuthorBelowQuotes;
    globalThis.odqCarouselSpeakerAnchorAuthorCutoutLabel =
      odqCarouselSpeakerAnchorAuthorCutoutLabel;
    globalThis.odqCenterCarouselShortQuoteStripCluster = odqCenterCarouselShortQuoteStripCluster;
    globalThis.odqLayoutBPostStripScatterBoundsForCarouselSpeaker =
      odqLayoutBPostStripScatterBoundsForCarouselSpeaker;
    globalThis.composeInstagramLayoutBFromQuiltBlob = composeInstagramLayoutBFromQuiltBlob;

    /**
     * Draw a single Layout B paper strip with text, self-contained (own rng + texture).
     * Used by carousel slide 3 to label the quilt with its winning name.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text  — display text (already uppercased / formatted)
     * @param {number} centerX
     * @param {number} centerY
     * @param {number} tiltRad — rotation in radians
     * @param {object} [opts]
     * @param {number}  [opts.fontPx=58]
     * @param {number}  [opts.padX=52]
     * @param {number}  [opts.padY=22]
     * @param {string}  [opts.variant='light']  'light' (cream bg, dark ink) | 'dark' (charcoal bg, cream ink)
     * @param {number}  [opts.seed=0]
     */
    globalThis.odqDrawLayoutBNameStrip = function odqDrawLayoutBNameStrip(ctx, text, centerX, centerY, tiltRad, opts = {}) {
      const label = String(text || '').trim();
      if (!label) return null;

      const fontPx   = Number(opts.fontPx) > 0 ? Math.round(Number(opts.fontPx)) : 58;
      const padX     = Number(opts.padX)   > 0 ? Math.round(Number(opts.padX))   : 52;
      const padY     = Number(opts.padY)   > 0 ? Math.round(Number(opts.padY))   : 22;
      const variant  = String(opts.variant || 'light') === 'dark' ? 'dark' : 'light';
      const seed     = Number(opts.seed) || 0;

      const FONT = ODQ_LAYOUT_B_STRIP_FONT;
      const LETTER_SPACING_EM = ODQ_LAYOUT_B_STRIP_LETTER_SPACING_EM;
      const paperFill = variant === 'dark' ? ODQ_LAYOUT_B_AUTHOR_INVERT_BG : '#f3eee4';
      const inkFill   = variant === 'dark' ? ODQ_LAYOUT_B_AUTHOR_INVERT_TEXT : '#404040';

      // Seeded rng (same algo as odqMixStripLayoutSeedIntoRng)
      let s = (seed ^ 0x9e3779b9) >>> 0;
      const rnd = () => { s = Math.imul(s ^ (s >>> 16), 0x45d9f3b); s = Math.imul(s ^ (s >>> 16), 0x45d9f3b); s ^= s >>> 16; return (s >>> 0) / 0x100000000; };
      // Warm up
      for (let i = 0; i < 8; i++) rnd();

      // Measure text width
      ctx.save();
      ctx.font = `600 ${fontPx}px ${FONT}`;
      const letterSpacingPx = fontPx * LETTER_SPACING_EM;
      ctx.letterSpacing = `${letterSpacingPx}px`;
      const textW = ctx.measureText(label).width + letterSpacingPx;
      ctx.restore();

      const stripW = textW + padX * 2;
      const stripH = fontPx + padY * 2;

      // Allow caller to anchor by right edge instead of center
      if (Number.isFinite(opts.rightEdgeX)) {
        centerX = opts.rightEdgeX - stripW / 2;
      }

      // Paper texture tile (same logic as makeStripPaperTextureTile)
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
          d[i] = v; d[i+1] = Math.max(22, Math.min(110, v - 3 + rnd() * 9)); d[i+2] = Math.max(20, Math.min(108, v - 5 + rnd() * 9));
        } else {
          const lum = 228 + grain * 0.98 + speck * 0.88;
          d[i] = Math.max(160, Math.min(255, lum + 7)); d[i+1] = Math.max(162, Math.min(255, lum + 2)); d[i+2] = Math.max(148, Math.min(242, lum - 12));
        }
        d[i+3] = 255;
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
        tx.bezierCurveTo(sz * 0.33, y0 + (rnd()-0.5)*11, sz * 0.66, y0 + (rnd()-0.5)*11, sz+4, y0 + (rnd()-0.5)*9);
        tx.stroke();
      }
      tx.globalCompositeOperation = 'overlay';
      for (let k = 0; k < 42; k++) {
        tx.globalAlpha = 0.065 + rnd() * 0.125;
        tx.fillStyle = variant === 'dark' ? 'rgba(0,0,0,0.92)' : 'rgba(72,58,48,0.72)';
        tx.beginPath(); tx.arc(rnd()*sz, rnd()*sz, 0.5 + rnd()*3.2, 0, Math.PI*2); tx.fill();
      }
      for (let s2 = 0; s2 < 32; s2++) {
        tx.globalAlpha = 0.082 + rnd() * 0.145;
        tx.strokeStyle = variant === 'dark' ? 'rgba(200,195,180,0.58)' : 'rgba(42,36,32,0.45)';
        tx.lineWidth = 0.22 + rnd() * 0.62;
        tx.beginPath();
        const x0 = rnd()*sz; const y0b = rnd()*sz;
        tx.moveTo(x0, y0b); tx.lineTo(x0 + (rnd()-0.5)*14, y0b + (rnd()-0.5)*14); tx.stroke();
      }
      tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over';

      // Hand-cut wobble path (same as handCutStripPath)
      const handCutPath = (g, sw, sh) => {
        const hw = sw/2, hh = sh/2, m = Math.min(sw, sh), maxSide = Math.max(sw, sh);
        const cornerAmp = Math.min(5.2, Math.max(1.2, m * 0.038));
        const edgeAmp   = Math.min(3.6, Math.max(0.9, m * 0.028));
        const corners = [
          { x: -hw + (rnd()-0.5)*2*cornerAmp, y: -hh + (rnd()-0.5)*2*cornerAmp },
          { x:  hw + (rnd()-0.5)*2*cornerAmp, y: -hh + (rnd()-0.5)*2*cornerAmp },
          { x:  hw + (rnd()-0.5)*2*cornerAmp, y:  hh + (rnd()-0.5)*2*cornerAmp },
          { x: -hw + (rnd()-0.5)*2*cornerAmp, y:  hh + (rnd()-0.5)*2*cornerAmp }
        ];
        g.beginPath(); g.moveTo(corners[0].x, corners[0].y);
        for (let i = 0; i < 4; i++) {
          const p0 = corners[i], p1 = corners[(i+1)%4];
          const dx = p1.x-p0.x, dy = p1.y-p0.y, len = Math.hypot(dx,dy)||1;
          const nx = -dy/len, ny = dx/len;
          const isShort = len < maxSide * 0.58;
          const div = isShort ? 2 : 2 + Math.floor(rnd()*3);
          for (let ss = 1; ss < div; ss++) {
            const t = ss/div, wob = (rnd()-0.5)*2*edgeAmp;
            g.lineTo(p0.x + dx*t + nx*wob, p0.y + dy*t + ny*wob);
          }
          g.lineTo(p1.x, p1.y);
        }
        g.closePath();
      };

      // Draw
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(tiltRad);

      // Shadow
      ctx.shadowColor = variant === 'dark' ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 16; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
      ctx.fillStyle = paperFill;
      handCutPath(ctx, stripW, stripH);
      ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

      // Paper texture
      ctx.save();
      handCutPath(ctx, stripW, stripH);
      ctx.clip();
      const pat = ctx.createPattern(tc, 'repeat');
      const texPad = 16;
      ctx.globalAlpha = variant === 'dark' ? 0.63 : 0.59;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = pat;
      ctx.fillRect(-stripW/2 - texPad, -stripH/2 - texPad, stripW + texPad*2, stripH + texPad*2);
      ctx.globalCompositeOperation = variant === 'dark' ? 'overlay' : 'soft-light';
      ctx.globalAlpha = variant === 'dark' ? 0.26 : 0.28;
      ctx.fillStyle = pat;
      ctx.fillRect(-stripW/2 - texPad, -stripH/2 - texPad, stripW + texPad*2, stripH + texPad*2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.restore();

      // Text
      ctx.font = `600 ${fontPx}px ${FONT}`;
      ctx.letterSpacing = `${letterSpacingPx}px`;
      ctx.fillStyle = inkFill;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);

      ctx.restore();
      return { stripW, stripH, centerX, centerY };
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
