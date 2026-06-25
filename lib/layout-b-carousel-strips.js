/**
 * Carousel slide 1 quote strips beside speaker cutout — placement orchestrator + text-safe constraints.
 * Depends on lib/layout-b-compose.js (load this script immediately after compose).
 */
(function (global) {
  'use strict';

  const ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD = 22;
  const ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP = 4;
  const ODQ_CAROUSEL_STRIP_DRAW_BLEED = 18;

  let deps = null;

  function odqCarouselStripPlanLayoutOk(plan, speakerRect) {
    const strips = Array.isArray(plan) ? plan : [];
    for (let i = 0; i < strips.length; i++) {
      for (let j = i + 1; j < strips.length; j++) {
        const a = strips[i];
        const b = strips[j];
        if (a.role === 'author' || b.role === 'author') {
          if (deps.odqStripPlanCarouselTextOverlaps(a, b)) return false;
          continue;
        }
        const visualPad =
          ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD + ODQ_CAROUSEL_STRIP_DRAW_BLEED;
        if (deps.odqStripPlanCarouselTextOverlaps(a, b, visualPad)) return false;
      }
    }
    if (speakerRect) {
      for (const s of strips) {
        if (s.authorCutoutLabel) continue;
        if (deps.odqStripPlanOverlapsCarouselSpeaker(s, speakerRect)) return false;
      }
    }
    const pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD;
    if (deps.odqLayoutBPostStripScatterBoundsForCarouselSpeaker) {
      const bounds = deps.odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
        1080,
        1350,
        speakerRect
      );
      if (bounds) {
        for (const s of strips) {
          const ar = deps.odqStripPlanAxisRect(s, pad);
          if (s.authorCutoutLabel) {
            if (ar.top < bounds.top - 2 || ar.bottom > bounds.bottom + 6) return false;
            continue;
          }
          if (ar.top < bounds.top - 2 || ar.bottom > bounds.bottom + 2) return false;
        }
      }
    }
    return true;
  }

  /** Merged overlap + cutout solver (replaces resolve / force-clear / finalize loops). */
  function odqCarouselApplyTextSafeConstraints(plan, layoutW, layoutH, speakerRect, minGap = 10, quoteText = '') {
    let out = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));
    const gap = Math.max(
      ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP,
      Number(minGap) || ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP
    );
    const pad = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD;

    const resolveOverlaps = () => {
      let moved = false;
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i];
          const b = out[j];
          if (!deps.odqStripPlanCarouselTextOverlaps(a, b, pad)) continue;
          const cxA = Number(a.x || 0);
          const cxB = Number(b.x || 0);
          const cyA = Number(a.y || 0);
          const cyB = Number(b.y || 0);
          const preferHorizontal = Math.abs(cxA - cxB) >= Math.abs(cyA - cyB);
          const aIsAuthor = a.role === 'author';
          const bIsAuthor = b.role === 'author';
          if (aIsAuthor || bIsAuthor) {
            const quote = aIsAuthor ? b : a;
            const author = aIsAuthor ? a : b;
            if (author.authorCutoutLabel) continue;
            if (preferHorizontal) {
              if (Number(quote.x || 0) >= Number(author.x || 0)) {
                quote.x = Number(quote.x || 0) - gap;
              } else {
                quote.x = Number(quote.x || 0) + gap;
              }
            } else if (Number(quote.y || 0) <= Number(author.y || 0)) {
              deps.odqCarouselSpeakerSeparateStripVertical(quote, author, gap, pad);
            } else {
              deps.odqCarouselSpeakerSeparateStripVertical(author, quote, gap, pad);
            }
            moved = true;
            continue;
          }
          if (preferHorizontal) {
            const left = cxA <= cxB ? a : b;
            const right = left === a ? b : a;
            if (deps.odqCarouselSpeakerSeparateStripHorizontal(left, right, gap, pad)) {
              if (speakerRect && deps.odqStripPlanOverlapsCarouselSpeaker(right, speakerRect)) {
                right.x = Number(right.x || 0) - gap;
                const top = cyA <= cyB ? a : b;
                const bottom = top === a ? b : a;
                deps.odqCarouselSpeakerSeparateStripVertical(top, bottom, gap, pad);
              } else if (deps.odqStripPlanCarouselTextOverlaps(left, right, pad)) {
                const top = cyA <= cyB ? a : b;
                const bottom = top === a ? b : a;
                deps.odqCarouselSpeakerSeparateStripVertical(top, bottom, gap, pad);
              }
              moved = true;
            }
          } else {
            const top = cyA <= cyB ? a : b;
            const bottom = top === a ? b : a;
            if (deps.odqCarouselSpeakerSeparateStripVertical(top, bottom, gap, pad)) {
              moved = true;
            }
          }
        }
      }
      return moved;
    };

    const forceClearQuoteOverlaps = () => {
      let moved = false;
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i];
          const b = out[j];
          if (a.role === 'author' || b.role === 'author') continue;
          if (!deps.odqStripPlanCarouselTextOverlaps(a, b, pad)) continue;
          const cxA = Number(a.x || 0);
          const cxB = Number(b.x || 0);
          const cyA = Number(a.y || 0);
          const cyB = Number(b.y || 0);
          if (Math.abs(cxA - cxB) >= Math.abs(cyA - cyB)) {
            const top = cyA <= cyB ? a : b;
            const bottom = top === a ? b : a;
            if (deps.odqCarouselSpeakerSeparateStripVertical(top, bottom, gap, pad)) {
              moved = true;
            }
          } else {
            const left = cxA <= cxB ? a : b;
            const right = left === a ? b : a;
            if (deps.odqCarouselSpeakerSeparateStripHorizontal(left, right, gap, pad)) {
              moved = true;
            }
          }
        }
      }
      return moved;
    };

    for (let round = 0; round < 12; round++) {
      deps.odqCarouselSpeakerFixAllSameRowPairOverlaps(out, gap, speakerRect, layoutW, layoutH);
      const movedResolve = resolveOverlaps();
      const movedForce = forceClearQuoteOverlaps();
      if (speakerRect) {
        out = deps.odqCarouselSpeakerClampStripPlanOffCutout(out, layoutW, layoutH, speakerRect);
      }
      if (odqCarouselStripPlanLayoutOk(out, speakerRect)) break;
      if (!movedResolve && !movedForce && round > 0) break;
    }

    if (quoteText && deps.odqCarouselSpeakerEnforceMonotonicTextOrderY) {
      const quotes = out.filter((s) => s.role !== 'author');
      const authors = out.filter((s) => s.role === 'author');
      deps.odqCarouselSpeakerEnforceMonotonicTextOrderY(quotes, quoteText, gap);
      out = [...quotes, ...authors];
    }

    return out;
  }

  /**
   * @param {object} opts
   * @param {'full'|'constraints'} [opts.phase='full'] — spread uses full; canvas draw uses constraints only.
   */
  function odqApplyCarouselSpeakerStripLayout(plan, layoutW, layoutH, opts = {}) {
    const speakerRect = opts.carouselSpeakerAvoidRect;
    if (!speakerRect || !deps) return plan;

    const layoutSeed = String(opts.layoutSeed || opts.dateKey || 'layout_b_carousel');
    const stripLayoutSeed = deps.odqNormalizeStripLayoutSeed(opts.stripLayoutSeed);
    const shortQuote = opts.carouselShortQuote === true;
    const phase = opts.phase === 'constraints' ? 'constraints' : 'full';
    const minGap = shortQuote ? 12 : ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP;
    const quoteText = String(opts.quoteText || '').trim();

    /** Long quotes: spread already laid out — draw pass must not re-run horizontal row packing. */
    if (phase === 'constraints' && !shortQuote) {
      return plan;
    }

    let out = (Array.isArray(plan) ? plan : []).map((s) => ({ ...s }));

    if (!shortQuote && quoteText && deps.odqCarouselSpeakerRestackQuoteStripsVertically) {
      const bounds = deps.odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
        layoutW,
        layoutH,
        speakerRect
      );
      const quotes = out.filter((s) => s.role !== 'author');
      const authors = out.filter((s) => s.role === 'author');
      deps.odqCarouselSpeakerRestackQuoteStripsVertically(
        quotes,
        bounds,
        speakerRect,
        quoteText,
        layoutSeed,
        stripLayoutSeed,
        { minGap, authorCutoutLabel: true }
      );
      if (deps.odqCarouselSpeakerAnchorAuthorCutoutLabel) {
        out = deps.odqCarouselSpeakerAnchorAuthorCutoutLabel(
          [...quotes, ...authors],
          layoutW,
          layoutH,
          speakerRect,
          { layoutSeed, stripLayoutSeed }
        );
      } else if (deps.odqCarouselSpeakerEnsureAuthorBelowQuotes) {
        out = deps.odqCarouselSpeakerEnsureAuthorBelowQuotes(
          [...quotes, ...authors],
          layoutW,
          layoutH,
          speakerRect,
          { minGap: 56, layoutSeed, stripLayoutSeed, quoteText }
        );
      } else {
        out = [...quotes, ...authors];
      }
      return out;
    }

    if (phase === 'full') {
      out = deps.odqClampLayoutBStripPlanToCarouselSpeakerRegion(
        out,
        layoutW,
        layoutH,
        speakerRect
      );
      if (!shortQuote) {
        /* Tilt from flow is enough collage — same-row tighten/lift pulled strips into overlap. */
      } else {
        const bounds = deps.odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
          layoutW,
          layoutH,
          speakerRect
        );
        out = deps.odqCenterCarouselShortQuoteStripCluster(
          out.filter((s) => s.role !== 'author'),
          out.filter((s) => s.role === 'author'),
          layoutW,
          layoutH,
          speakerRect,
          bounds,
          layoutSeed,
          stripLayoutSeed
        );
      }
    } else {
      if (shortQuote) {
        const bounds = deps.odqLayoutBPostStripScatterBoundsForCarouselSpeaker(
          layoutW,
          layoutH,
          speakerRect
        );
        out = deps.odqCenterCarouselShortQuoteStripCluster(
          out.filter((s) => s.role !== 'author'),
          out.filter((s) => s.role === 'author'),
          layoutW,
          layoutH,
          speakerRect,
          bounds,
          layoutSeed,
          stripLayoutSeed
        );
      } else {
        out = deps.odqReflowLayoutBStripPlanAroundCarouselSpeaker(
          out,
          speakerRect,
          layoutW,
          layoutH
        );
      }
    }

    out = deps.odqCarouselSpeakerAnchorAuthorStripTerminal(
      out,
      layoutW,
      layoutH,
      speakerRect,
      layoutSeed,
      stripLayoutSeed,
      { shortQuote }
    );

    if (!shortQuote && deps.odqCarouselSpeakerEnforceReadingOrderStripGaps) {
      out = deps.odqCarouselSpeakerEnforceReadingOrderStripGaps(out, minGap);
    }

    out = odqCarouselApplyTextSafeConstraints(out, layoutW, layoutH, speakerRect, minGap, opts.quoteText);

    if (!shortQuote && deps.odqCarouselSpeakerEnforceReadingOrderStripGaps) {
      out = deps.odqCarouselSpeakerEnforceReadingOrderStripGaps(out, minGap);
      if (!odqCarouselStripPlanLayoutOk(out, speakerRect)) {
        out = odqCarouselApplyTextSafeConstraints(out, layoutW, layoutH, speakerRect, minGap, opts.quoteText);
      }
    }

    if (opts.quoteText && deps.odqCarouselSpeakerEnforceMonotonicTextOrderY) {
      const quotes = out.filter((s) => s.role !== 'author');
      const authors = out.filter((s) => s.role === 'author');
      deps.odqCarouselSpeakerEnforceMonotonicTextOrderY(quotes, opts.quoteText, minGap);
      out = [...quotes, ...authors];
    }

    return out;
  }

  function odqInitCarouselStripLayout(depsIn) {
    deps = depsIn;
    global.odqApplyCarouselSpeakerStripLayout = odqApplyCarouselSpeakerStripLayout;
    global.odqCarouselApplyTextSafeConstraints = odqCarouselApplyTextSafeConstraints;
    global.odqCarouselStripPlanLayoutOk = odqCarouselStripPlanLayoutOk;
    global.odqCarouselSpeakerFinalizeStripPlanNoOverlaps = odqCarouselApplyTextSafeConstraints;
    global.ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD = ODQ_CAROUSEL_STRIP_TEXT_SAFE_PAD;
    global.ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP = ODQ_CAROUSEL_STRIP_TEXT_MIN_GAP;
  }

  global.odqInitCarouselStripLayout = odqInitCarouselStripLayout;

  if (global.odqStripPlanAxisRect && global.odqStripPlanCarouselTextOverlaps) {
    odqInitCarouselStripLayout({
      odqStripPlanAxisRect: global.odqStripPlanAxisRect,
      odqStripPlanOverlapsCarouselSpeaker: global.odqStripPlanOverlapsCarouselSpeaker,
      odqStripPlanCarouselTextOverlaps: global.odqStripPlanCarouselTextOverlaps,
      odqCarouselSpeakerSeparateStripVertical: global.odqCarouselSpeakerSeparateStripVertical,
      odqCarouselSpeakerSeparateStripHorizontal: global.odqCarouselSpeakerSeparateStripHorizontal,
      odqCarouselSpeakerFixAllSameRowPairOverlaps: global.odqCarouselSpeakerFixAllSameRowPairOverlaps,
      odqCarouselSpeakerClampStripPlanOffCutout: global.odqCarouselSpeakerClampStripPlanOffCutout,
      odqClampLayoutBStripPlanToCarouselSpeakerRegion:
        global.odqClampLayoutBStripPlanToCarouselSpeakerRegion,
      odqReflowLayoutBStripPlanAroundCarouselSpeaker:
        global.odqReflowLayoutBStripPlanAroundCarouselSpeaker,
      odqCarouselSpeakerVariedSameRowGaps: global.odqCarouselSpeakerVariedSameRowGaps,
      odqCarouselSpeakerStaggerSameRowVerticalLift: global.odqCarouselSpeakerStaggerSameRowVerticalLift,
      odqCarouselSpeakerVariedRowGaps: global.odqCarouselSpeakerVariedRowGaps,
      odqCarouselSpeakerAnchorAuthorStripTerminal: global.odqCarouselSpeakerAnchorAuthorStripTerminal,
      odqCarouselSpeakerEnforceReadingOrderStripGaps:
        global.odqCarouselSpeakerEnforceReadingOrderStripGaps,
      odqCarouselSpeakerEnforceMonotonicTextOrderY:
        global.odqCarouselSpeakerEnforceMonotonicTextOrderY,
      odqCarouselSpeakerEnforceQuoteStackVisualGap:
        global.odqCarouselSpeakerEnforceQuoteStackVisualGap,
      odqCarouselSpeakerRestackQuoteStripsVertically:
        global.odqCarouselSpeakerRestackQuoteStripsVertically,
      odqCarouselSpeakerEnsureAuthorBelowQuotes:
        global.odqCarouselSpeakerEnsureAuthorBelowQuotes,
      odqCarouselSpeakerAnchorAuthorCutoutLabel:
        global.odqCarouselSpeakerAnchorAuthorCutoutLabel,
      odqCenterCarouselShortQuoteStripCluster: global.odqCenterCarouselShortQuoteStripCluster,
      odqLayoutBPostStripScatterBoundsForCarouselSpeaker:
        global.odqLayoutBPostStripScatterBoundsForCarouselSpeaker,
      odqNormalizeStripLayoutSeed: global.odqNormalizeStripLayoutSeed
    });
  }
})(globalThis);
