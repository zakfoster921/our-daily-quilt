/**
 * IG carousel slide 2 alternate: mirror-flipped quilt bg + reflection prompt card (top-left)
 * + admin-highlight response patches taped in a backwards-L cluster (like the app wall).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IgCarouselReflectionSlideCompose = api;
    root.composeCarouselReflectionSlideFromQuiltBlob = api.composeCarouselReflectionSlideFromQuiltBlob;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
  function (global) {
    'use strict';

    const PANEL_W = 1080;
    const PANEL_H = 1350;
    const PROMPT_CARD_ASPECT = 563 / 450;
    /** ~46% panel width — dominant top-left anchor (matches in-app card proportion scaled up). */
    const PROMPT_CARD_W = Math.round(PANEL_W * 0.46);
    const PROMPT_CARD_H = Math.round(PROMPT_CARD_W * PROMPT_CARD_ASPECT);
    const PROMPT_CARD_X = 34;
    const PROMPT_CARD_Y = 38;
    const PROMPT_CARD_TILT_DEG = 1.4;
    const PROMPT_INSET_TOP = 0.17;
    const PROMPT_INSET_SIDE = 0.05;
    const PROMPT_INSET_BOTTOM = 0.17;
    const PANEL_MARGIN = 30;
    /** Response patches — half the question card footprint on the wall. */
    const RESPONSE_CARD_SCALE = 0.5;
    const RESPONSE_CARD_W = Math.round(PROMPT_CARD_W * RESPONSE_CARD_SCALE);
    const RESPONSE_CARD_H = Math.round(PROMPT_CARD_H * RESPONSE_CARD_SCALE);
    const PATCH_LINE_HEIGHT = 1.22;
    const PATCH_PAD_X = Math.round(36 * RESPONSE_CARD_SCALE);
    const PATCH_PAD_Y = Math.round(40 * RESPONSE_CARD_SCALE);
    const PATCH_AUTHOR_GAP = 20;
    /** All slide copy (question + responses) scales from the prompt-size tiers. */
    const SLIDE_TEXT_SCALE = 1.5;
    const HIGHLIGHT_BORDER_INSET = Math.round(10 * RESPONSE_CARD_SCALE);
    /** Patch seam overlap + BYG tape — matches in-app reflection carousel joins. */
    const PATCH_JOIN_OVERLAP = 18;
    /** Clear space between question card bbox and any response patch. */
    const QUESTION_RESPONSE_GAP = 8;
    const JOIN_TAPE_THICKNESS = 48;
    const SPLIT_TAPE_THICKNESS = 34;
    const TAPE_PAPER = '#f2eee6';
    const TAPE_STRIP_URL = 'assets/before-you-go-tape-alpha.png';
    /** Hand-drawn dotted highlight frame — same SVG as app admin-highlight ::after. */
    const REFLECTION_HIGHLIGHT_BORDER_SVG =
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">' +
          '<defs><filter id="g" x="-10%" y="-10%" width="120%" height="120%">' +
          '<feTurbulence type="fractalNoise" baseFrequency="0.82 1.35" numOctaves="3" seed="7" result="t"/>' +
          '<feDisplacementMap in="SourceGraphic" in2="t" scale="0.42" xChannelSelector="R" yChannelSelector="G"/>' +
          '</filter></defs>' +
          '<path fill="none" stroke="#6b5f54" stroke-opacity=".17" stroke-width="2.85" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0 7.2" vector-effect="non-scaling-stroke" filter="url(#g)" d="M7.4 6.3 49.2 5.1 93.1 6.8 94.4 50.2 93.5 94.1 49.6 95.3 6.7 93.8 5.4 49.4Z"/>' +
          '<path fill="none" stroke="#4a4036" stroke-opacity=".29" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0 5.8" vector-effect="non-scaling-stroke" filter="url(#g)" d="M7.6 6.5 49.4 5.3 92.9 7 94.2 50.4 93.3 93.9 49.4 95.1 6.9 94 5.6 49.6Z"/>' +
          '</svg>'
      );
    let highlightBorderArtPromise = null;
    let tapeStripArtPromise = null;
    /** Warm wash over quilt so paper elements read as the hero layer. */
    const QUILT_RECESS_WASH = 'rgba(246, 244, 241, 0.28)';
    const REFLECTION_PATCH_HEX = [
      '#f6f4f1',
      '#f2f1ee',
      '#f4f0e6',
      '#f0ebe4',
      '#ebe8e3',
      '#ede8e0',
      '#f3efec',
      '#f5f2eb'
    ];
    const REFLECTION_EDGE_CFG = {
      exportScale: 1,
      newsprintEdgeToothPx: 9,
      newsprintEdgeToothDepthPx: 2.35,
      newsprintEdgeNotchDepthRatio: 0.52,
      newsprintEdgeGapRatio: 0.11,
      newsprintEdgeTabRatio: 0.82,
      newsprintEdgeTabCrownBulgeRatio: 0.28,
      newsprintEdgeCornerSoftRatio: 0.22,
      newsprintEdgeCornerSteps: 4,
      newsprintEdgeIrregularityRatio: 0.58,
      newsprintEdgeGapSagRatio: 0.05,
      newsprintEdgeSideInsetPx: 0.2
    };

    function loadImageFromBlob(blob) {
      const url = URL.createObjectURL(blob);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Could not decode image'));
        };
        img.src = url;
      });
    }

    function loadTapeStripArt() {
      if (!tapeStripArtPromise) {
        tapeStripArtPromise = loadImageFromUrl(TAPE_STRIP_URL).catch(() => null);
      }
      return tapeStripArtPromise;
    }

    function joinTapeVariant(seedKey, overlapSpanPx) {
      const overlap = Math.max(1, Number(overlapSpanPx) || 1);
      const widthScale = 0.68 + seededUnit(seedKey, 'width') * 0.76;
      const spanScale = 0.46 + seededUnit(seedKey, 'span') * 0.48;
      const spanPx = Math.max(28, Math.round(overlap * spanScale));
      const slack = Math.max(0, overlap - spanPx);
      const verticalShift = slack > 0 ? (seededUnit(seedKey, 'shift') - 0.5) * slack * 0.92 : 0;
      return {
        widthScale,
        spanPx,
        verticalShift,
        tiltJitterDeg: (seededUnit(seedKey, 'tilt') - 0.5) * 10,
        opacity: 0.84 + seededUnit(seedKey, 'opacity') * 0.14,
        textureY: seededUnit(seedKey, 'tex')
      };
    }

    function joinTapeClipPoints(seedKey) {
      const rnd = (salt) => seededUnit(`${seedKey}:clip`, salt);
      const topLeftX = 4 + rnd('tlx') * 10;
      const topRightX = 86 + rnd('trx') * 10;
      const topLeftY = rnd('tly') * 10;
      const topRightY = rnd('try') * 10;
      const botLeftX = 3 + rnd('blx') * 12;
      const botRightX = 85 + rnd('brx') * 12;
      const botLeftY = 90 + rnd('bly') * 9;
      const botRightY = 90 + rnd('bry') * 9;
      const pct = (value) => value / 100;
      if (rnd('peak') > 0.38) {
        const peakX = 34 + rnd('px') * 32;
        if (rnd('up') > 0.5) {
          return [
            { x: pct(topLeftX), y: pct(topLeftY) },
            { x: pct(peakX), y: pct(rnd('py') * 5) },
            { x: pct(topRightX), y: pct(topRightY) },
            { x: pct(botRightX), y: pct(botRightY) },
            { x: pct(botLeftX), y: pct(botLeftY) }
          ];
        }
        const valleyY = 95 + rnd('vy') * 4;
        return [
          { x: pct(topLeftX), y: pct(topLeftY) },
          { x: pct(topRightX), y: pct(topRightY) },
          { x: pct(botRightX), y: pct(botRightY) },
          { x: pct(peakX), y: pct(valleyY) },
          { x: pct(botLeftX), y: pct(botLeftY) }
        ];
      }
      return [
        { x: pct(topLeftX), y: pct(topLeftY) },
        { x: pct(topRightX), y: pct(topRightY) },
        { x: pct(botRightX), y: pct(botRightY) },
        { x: pct(botLeftX), y: pct(botLeftY) }
      ];
    }

    function traceNormPolygon(ctx, x, y, w, h, points) {
      ctx.beginPath();
      points.forEach((point, index) => {
        const px = x + point.x * w;
        const py = y + point.y * h;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }

    function drawTapeFill(ctx, x, y, w, h, tapeImg, textureY = 0.5) {
      ctx.fillStyle = TAPE_PAPER;
      ctx.fillRect(x, y, w, h);
      if (!tapeImg) return;
      const sy = Math.max(0, Math.min(tapeImg.height - 1, textureY * Math.max(0, tapeImg.height - h)));
      ctx.drawImage(tapeImg, 0, sy, tapeImg.width, Math.min(h, tapeImg.height), x, y, w, h);
    }

    function drawVerticalJoinTape(ctx, centerX, overlapTop, overlapSpan, seedKey, tapeImg) {
      const variant = joinTapeVariant(seedKey, overlapSpan);
      const w = JOIN_TAPE_THICKNESS * variant.widthScale;
      const h = variant.spanPx;
      const top = overlapTop + (overlapSpan - h) / 2 + variant.verticalShift;
      const left = centerX - w / 2;
      const clip = joinTapeClipPoints(`${seedKey}:clip`);
      ctx.save();
      ctx.globalAlpha = variant.opacity;
      ctx.globalCompositeOperation = 'multiply';
      ctx.translate(centerX, top + h / 2);
      ctx.rotate((variant.tiltJitterDeg * Math.PI) / 180);
      ctx.translate(-centerX, -(top + h / 2));
      traceNormPolygon(ctx, left, top, w, h, clip);
      ctx.clip();
      drawTapeFill(ctx, left, top, w, h, tapeImg, variant.textureY);
      ctx.restore();
    }

    function drawHorizontalSplitTape(ctx, left, width, centerY, tapeImg) {
      const h = SPLIT_TAPE_THICKNESS;
      const top = centerY - h / 2;
      ctx.save();
      ctx.globalAlpha = 0.96;
      ctx.globalCompositeOperation = 'multiply';
      ctx.translate(left + width / 2, centerY);
      ctx.rotate((-1.1 * Math.PI) / 180);
      ctx.translate(-(left + width / 2), -centerY);
      drawTapeFill(ctx, left, top, width, h, tapeImg, 0.42);
      ctx.restore();
    }

    function patchOverlapSpan(a, b) {
      const overlapTop = Math.max(a.y, b.y);
      const overlapBottom = Math.min(a.y + a.height, b.y + b.height);
      if (overlapBottom > overlapTop) return { top: overlapTop, span: overlapBottom - overlapTop };
      const shorter = a.height <= b.height ? a : b;
      const taller = a.height > b.height ? a : b;
      const top = taller.y + (taller.height - shorter.height) / 2;
      return { top, span: shorter.height };
    }

    function buildJoinTapes(placements, dateKey) {
      const tapes = [];
      const sameRow = (a, b) => Math.abs(a.y - b.y) < 4;
      const sameCol = (a, b) => Math.abs(a.x - b.x) < 4;

      if (placements.length >= 3 && sameCol(placements[0], placements[2])) {
        const [upper, lower] = [placements[0], placements[2]].sort((a, b) => a.y - b.y);
        tapes.push({
          kind: 'horizontal',
          left: upper.x,
          width: upper.width,
          centerY: lower.y,
          seedKey: `${dateKey}:reflection-split:right`
        });
      } else if (placements.length === 2 && sameCol(placements[0], placements[1])) {
        const [upper, lower] = [placements[0], placements[1]].sort((a, b) => a.y - b.y);
        tapes.push({
          kind: 'horizontal',
          left: upper.x,
          width: upper.width,
          centerY: lower.y,
          seedKey: `${dateKey}:reflection-split:0`
        });
      } else if (placements.length === 2 && sameRow(placements[0], placements[1])) {
        const [left, right] = [placements[0], placements[1]].sort((a, b) => a.x - b.x);
        const { top, span } = patchOverlapSpan(left, right);
        tapes.push({
          kind: 'vertical',
          centerX: right.x,
          overlapTop: top,
          overlapSpan: span,
          seedKey: `${dateKey}:reflection-join:1`
        });
      }

      const bottomRowY = placements.length >= 2 ? placements[1].y : null;
      if (bottomRowY != null) {
        const bottomRow = placements
          .filter((placement) => sameRow(placement, { y: bottomRowY, height: placement.height }))
          .sort((a, b) => a.x - b.x);
        for (let i = 1; i < bottomRow.length; i += 1) {
          const left = bottomRow[i - 1];
          const right = bottomRow[i];
          const { top, span } = patchOverlapSpan(left, right);
          tapes.push({
            kind: 'vertical',
            centerX: right.x,
            overlapTop: top,
            overlapSpan: span,
            seedKey: `${dateKey}:reflection-join:bottom:${i}`
          });
        }
      }
      return tapes;
    }

    function drawJoinTapes(ctx, tapes, tapeImg) {
      tapes.forEach((tape) => {
        if (tape.kind === 'vertical') {
          drawVerticalJoinTape(ctx, tape.centerX, tape.overlapTop, tape.overlapSpan, tape.seedKey, tapeImg);
        } else if (tape.kind === 'horizontal') {
          drawHorizontalSplitTape(ctx, tape.left, tape.width, tape.centerY, tapeImg);
        }
      });
    }

    function loadHighlightBorderArt() {
      if (!highlightBorderArtPromise) {
        highlightBorderArtPromise = loadImageFromUrl(REFLECTION_HIGHLIGHT_BORDER_SVG).catch(() => null);
      }
      return highlightBorderArtPromise;
    }

    function drawHighlightBorder(ctx, w, h, borderImg) {
      if (!borderImg) {
        ctx.strokeStyle = 'rgba(74, 64, 54, 0.34)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([0, 7]);
        ctx.lineDashOffset = 2;
        const inset = HIGHLIGHT_BORDER_INSET;
        ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
        ctx.setLineDash([]);
        return;
      }
      const inset = HIGHLIGHT_BORDER_INSET;
      const bw = Math.max(1, w - inset * 2);
      const bh = Math.max(1, h - inset * 2);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(borderImg, inset, inset, bw, bh);
      ctx.restore();
    }

    function loadImageFromUrl(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Could not load ${url}`));
        img.src = url;
      });
    }

    function canvasToBlob(canvas) {
      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob || null), 'image/png', 0.95);
      });
    }

    function hashSeed(input) {
      const QNC = global.QuiltNewspaperClipping;
      if (typeof QNC?.hashDateKeySeed === 'function') {
        return QNC.hashDateKeySeed(String(input || 'seed'));
      }
      let h = 2166136261;
      const s = String(input || '');
      for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    function seededUnit(seed, salt) {
      const h = hashSeed(`${seed}:${salt}`);
      return (h % 10000) / 10000;
    }

    function hexToRgbCsv(hex) {
      const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
      if (!match) return '246, 244, 241';
      const h = match[1];
      return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
    }

    function rgbCsvToHex(rgbCsv) {
      const parts = String(rgbCsv || '')
        .split(',')
        .map((v) => parseInt(String(v).trim(), 10));
      if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return '#f6f4f1';
      return `#${parts.map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`;
    }

    function washPatchRgb(rgbCsv) {
      const app = global.app;
      if (typeof app?.washReflectionCarouselPatchRgb === 'function') {
        return app.washReflectionCarouselPatchRgb(rgbCsv);
      }
      return rgbCsv;
    }

    function brightenPatchRgb(rgbCsv) {
      const app = global.app;
      if (typeof app?.brightenReflectionHighlightPatchRgb === 'function') {
        return app.brightenReflectionHighlightPatchRgb(rgbCsv);
      }
      const parts = String(rgbCsv || '')
        .split(',')
        .map((v) => parseInt(String(v).trim(), 10));
      if (parts.length < 3) return rgbCsv;
      return parts.map((c) => Math.round(c + (255 - c) * 0.11)).join(', ');
    }

    function patchTextColor(rgbCsv) {
      const app = global.app;
      if (typeof app?.getReflectionFabricPatchTextColor === 'function') {
        return app.getReflectionFabricPatchTextColor(rgbCsv);
      }
      const parts = String(rgbCsv || '')
        .split(',')
        .map((v) => parseInt(String(v).trim(), 10));
      if (parts.length < 3) return '#2f271f';
      const lum = (0.299 * parts[0] + 0.587 * parts[1] + 0.114 * parts[2]) / 255;
      return lum < 0.58 ? 'rgba(255, 252, 247, 0.95)' : '#2f271f';
    }

    function pickPatchRgb(index, previousRgb) {
      const app = global.app;
      if (typeof app?.pickReflectionFabricPatchRgb === 'function') {
        return app.pickReflectionFabricPatchRgb(index, previousRgb);
      }
      return hexToRgbCsv(REFLECTION_PATCH_HEX[index % REFLECTION_PATCH_HEX.length]);
    }

    function patchTiltDeg(index) {
      const app = global.app;
      if (typeof app?.getReflectionFabricPatchTilt === 'function') {
        const raw = String(app.getReflectionFabricPatchTilt(index) || '0deg').replace('deg', '');
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
      }
      const tilts = [-2.4, 1.8, -1.2, 2.1, -1.7, 1.4];
      return tilts[index % tilts.length];
    }

    function themeText(entry) {
      const app = global.app;
      if (typeof app?.reflectionWallThemeText === 'function') {
        return app.reflectionWallThemeText(entry);
      }
      if (entry && typeof entry === 'object') {
        if (entry.split && Array.isArray(entry.strips)) {
          return entry.strips.map((s) => s.text).filter(Boolean).join(' / ');
        }
        return String(entry.text || '').trim();
      }
      return String(entry || '').trim();
    }

    function themeAuthor(entry) {
      if (!entry || typeof entry !== 'object') return '';
      if (entry.split && Array.isArray(entry.strips)) {
        const authors = entry.strips.map((s) => String(s.author || '').trim()).filter(Boolean);
        return authors[0] || '';
      }
      return String(entry.author || '').trim();
    }

    function flattenWallThemes(themes) {
      const out = [];
      (Array.isArray(themes) ? themes : []).forEach((entry, index) => {
        if (!entry) return;
        if (entry.split && Array.isArray(entry.strips)) {
          entry.strips.forEach((strip, stripIndex) => {
            const text = String(strip.text || '').trim();
            if (!text) return;
            out.push({
              text,
              author: String(strip.author || '').trim(),
              heartCount: Math.max(0, Number(strip.heartCount) || 0),
              adminHighlight: strip?.adminHighlight === true,
              seedKey: `split:${index}:${stripIndex}`
            });
          });
          return;
        }
        const text = themeText(entry);
        if (!text) return;
        out.push({
          text,
          author: themeAuthor(entry),
          heartCount: Math.max(0, Number(entry.heartCount) || 0),
          adminHighlight: entry?.adminHighlight === true,
          seedKey: `solo:${index}`
        });
      });
      return out.filter((row) => row.text && !/add yours/i.test(row.text));
    }

    function flattenHighlightedThemes(themes) {
      const app = global.app;
      const isHighlighted = (entry) =>
        typeof app?.reflectionThemeIsAdminHighlighted === 'function'
          ? app.reflectionThemeIsAdminHighlighted(entry)
          : entry?.adminHighlight === true;
      const out = [];
      (Array.isArray(themes) ? themes : []).forEach((entry, index) => {
        if (!entry) return;
        if (entry.split && Array.isArray(entry.strips)) {
          entry.strips.forEach((strip, stripIndex) => {
            if (strip?.adminHighlight === true) {
              out.push({
                text: String(strip.text || '').trim(),
                author: String(strip.author || '').trim(),
                heartCount: Math.max(0, Number(strip.heartCount) || 0),
                adminHighlight: true,
                seedKey: `split:${index}:${stripIndex}`
              });
            }
          });
          return;
        }
        if (isHighlighted(entry)) {
          out.push({
            text: themeText(entry),
            author: themeAuthor(entry),
            heartCount: Math.max(0, Number(entry.heartCount) || 0),
            adminHighlight: true,
            seedKey: `solo:${index}`
          });
        }
      });
      return out.filter((row) => row.text);
    }

    /** When nothing is admin-highlighted, pick three card-friendly responses (stable per date). */
    function pickFallbackReflectionThemes(themes, dateKey, limit = 3) {
      const pool = flattenWallThemes(themes);
      if (pool.length <= limit) return pool;
      const scored = pool.map((row, index) => {
        const len = row.text.length;
        let score = 0;
        if (row.author) score += 12;
        score += Math.min(row.heartCount, 24) * 2;
        if (len >= 8 && len <= 48) score += 14;
        else if (len <= 72) score += 7;
        else score -= Math.min(24, Math.round((len - 72) / 3));
        score += seededUnit(dateKey, `pick:${row.seedKey}`) * 4;
        return { row, score, index };
      });
      scored.sort((a, b) => b.score - a.score || a.index - b.index);
      return scored.slice(0, limit).map((item) => ({ ...item.row, adminHighlight: false }));
    }

    function resolveReflectionSlideThemes(themes, dateKey) {
      const highlighted = flattenHighlightedThemes(themes);
      if (highlighted.length) {
        return { entries: highlighted, source: 'highlight' };
      }
      const fallback = pickFallbackReflectionThemes(themes, dateKey, 3);
      return { entries: fallback, source: fallback.length ? 'fallback' : 'none' };
    }

    function questionFontPx(text) {
      const len = String(text || '').trim().length;
      let base = 38;
      if (len > 100) base = 26;
      else if (len > 72) base = 30;
      else if (len > 48) base = 34;
      return Math.round(base * SLIDE_TEXT_SCALE);
    }

    function wrapTextLines(ctx, text, maxWidth, maxLines = 8) {
      const words = String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
      if (!words.length) return [];
      const lines = [];
      let current = words[0];
      for (let i = 1; i < words.length; i += 1) {
        const probe = `${current} ${words[i]}`;
        if (ctx.measureText(probe).width <= maxWidth) current = probe;
        else {
          lines.push(current);
          current = words[i];
          if (lines.length >= maxLines - 1) break;
        }
      }
      if (lines.length < maxLines) lines.push(current);
      if (words.length > lines.join(' ').split(' ').length && lines.length) {
        const last = lines[lines.length - 1];
        lines[lines.length - 1] = `${last.replace(/[.,;:!?…]*$/, '')}…`;
      }
      return lines;
    }

    function estimatePatchLayout(ctx, entry, fontPx) {
      const body = String(entry.text || '').trim();
      const author = String(entry.author || '').trim();
      const w = RESPONSE_CARD_W;
      const h = RESPONSE_CARD_H;
      const innerMax = Math.max(120, w - PATCH_PAD_X * 2);
      const lineStep = fontPx * PATCH_LINE_HEIGHT;
      ctx.font = `400 ${fontPx}px "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
      const lines = wrapTextLines(ctx, body, innerMax, 10);
      return { width: w, height: h, lines, author, lineStep, fontPx };
    }

    function traceRing(ctx, ring) {
      const QNC = global.QuiltNewspaperClipping;
      if (typeof QNC?.tracePolygon === 'function') {
        QNC.tracePolygon(ctx, ring);
        return;
      }
      if (!ring?.length) return;
      ctx.beginPath();
      ctx.moveTo(ring[0].x, ring[0].y);
      for (let i = 1; i < ring.length; i += 1) ctx.lineTo(ring[i].x, ring[i].y);
      ctx.closePath();
    }

    function buildPerforatedRing(w, h, seedKey) {
      const QNC = global.QuiltNewspaperClipping;
      if (typeof QNC?.buildNewsprintPerforatedRing !== 'function') return null;
      const seed = hashSeed(seedKey);
      return QNC.buildNewsprintPerforatedRing(w, h, seed, REFLECTION_EDGE_CFG);
    }

    function drawFabricPatch(ctx, x, y, w, h, rgbCsv, seedKey, highlighted, layout, highlightBorderImg) {
      const ring = buildPerforatedRing(w, h, seedKey);
      const fillHex = rgbCsvToHex(washPatchRgb(highlighted ? brightenPatchRgb(rgbCsv) : rgbCsv));
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.translate(-w / 2, -h / 2);
      if (ring) {
        traceRing(ctx, ring);
        ctx.shadowColor = 'rgba(0,0,0,0.14)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = fillHex;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        traceRing(ctx, ring);
        ctx.clip();
      } else {
        ctx.fillStyle = fillHex;
        ctx.fillRect(0, 0, w, h);
      }
      const QNC = global.QuiltNewspaperClipping;
      if (typeof QNC?.drawNewsprintSurfaceStack === 'function') {
        ctx.save();
        if (ring) traceRing(ctx, ring);
        ctx.clip();
        QNC.drawNewsprintSurfaceStack(ctx, w, h, { paper: fillHex, width: w, exportScale: 1 });
        ctx.restore();
      }
      const textColor = patchTextColor(rgbCsv);
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fontPx = layout.fontPx || Math.round(38 * SLIDE_TEXT_SCALE);
      const authorFontPx = fontPx;
      const authorBlockH = layout.author ? authorFontPx * PATCH_LINE_HEIGHT : 0;
      const bodyAuthorGap = layout.author ? Math.round(PATCH_AUTHOR_GAP * SLIDE_TEXT_SCALE) : 0;
      const bodyBlockH = layout.lines.length * layout.lineStep;
      const totalBlockH = bodyBlockH + bodyAuthorGap + authorBlockH;
      let cy = h / 2 - totalBlockH / 2 + layout.lineStep / 2;
      ctx.font = `400 ${fontPx}px "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
      layout.lines.forEach((line) => {
        ctx.fillText(line, w / 2, cy);
        cy += layout.lineStep;
      });
      if (layout.author) {
        cy += bodyAuthorGap - layout.lineStep / 2 + authorBlockH / 2;
        ctx.font = `400 ${authorFontPx}px "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.fillText(`— ${layout.author}`, w / 2, cy);
      }
      if (highlighted) {
        drawHighlightBorder(ctx, w, h, highlightBorderImg);
      }
      ctx.restore();
    }

    function drawPromptCard(ctx, promptText, cardImg) {
      const text = String(promptText || '').trim();
      if (!text) return null;
      ctx.save();
      ctx.translate(PROMPT_CARD_X + PROMPT_CARD_W / 2, PROMPT_CARD_Y + PROMPT_CARD_H / 2);
      ctx.rotate((PROMPT_CARD_TILT_DEG * Math.PI) / 180);
      ctx.shadowColor = 'rgba(0,0,0,0.16)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
      ctx.drawImage(cardImg, -PROMPT_CARD_W / 2, -PROMPT_CARD_H / 2, PROMPT_CARD_W, PROMPT_CARD_H);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const insetX = PROMPT_CARD_W * PROMPT_INSET_SIDE;
      const insetTop = PROMPT_CARD_H * PROMPT_INSET_TOP;
      const insetBottom = PROMPT_CARD_H * PROMPT_INSET_BOTTOM;
      const boxW = PROMPT_CARD_W - insetX * 2;
      const boxH = PROMPT_CARD_H - insetTop - insetBottom;
      ctx.fillStyle = 'rgba(42, 34, 28, 0.86)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fontPx = questionFontPx(text);
      ctx.font = `400 ${fontPx}px "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
      const lines = wrapTextLines(ctx, text, boxW - 8, 6);
      const lineStep = fontPx * PATCH_LINE_HEIGHT;
      const blockH = lines.length * lineStep;
      let cy = -PROMPT_CARD_H / 2 + insetTop + boxH / 2 - blockH / 2 + lineStep / 2;
      lines.forEach((line) => {
        ctx.fillText(line, 0, cy);
        cy += lineStep;
      });
      ctx.restore();
      return {
        x: PROMPT_CARD_X,
        y: PROMPT_CARD_Y,
        width: PROMPT_CARD_W,
        height: PROMPT_CARD_H
      };
    }

    function questionOccupiedRect() {
      const pad = 20;
      return {
        x: PROMPT_CARD_X - pad,
        y: PROMPT_CARD_Y - pad,
        width: PROMPT_CARD_W + pad * 2,
        height: PROMPT_CARD_H + pad * 2
      };
    }

    /**
     * Nestled grid — question top-left, never overlaps response bboxes:
     *   [question][R0]
     *   [R1     ][R2…]
     * Bottom-row patches touch each other; R0 sits beside the question only.
     */
    function responseCardAnchors(count) {
      const stepX = RESPONSE_CARD_W - PATCH_JOIN_OVERLAP;
      const topRightX = PROMPT_CARD_X + PROMPT_CARD_W + QUESTION_RESPONSE_GAP;
      const topRightY = PROMPT_CARD_Y;
      const bottomLeftX = PROMPT_CARD_X;
      const bottomRowY = PROMPT_CARD_Y + PROMPT_CARD_H + QUESTION_RESPONSE_GAP;
      const anchors = [];
      if (count >= 1) anchors.push({ x: topRightX, y: topRightY });
      if (count >= 2) anchors.push({ x: bottomLeftX, y: bottomRowY });
      if (count >= 3) anchors.push({ x: bottomLeftX + stepX, y: bottomRowY });
      for (let i = 3; i < count; i += 1) {
        anchors.push({
          x: bottomLeftX + (i - 1) * stepX,
          y: bottomRowY
        });
      }
      return anchors;
    }

    function patchDrawOrderFor(count) {
      if (count <= 1) return [0];
      if (count === 2) return [1, 0];
      const order = [];
      for (let i = 1; i < count; i += 1) order.push(i);
      order.push(0);
      return order;
    }

    function layoutWallPatches(entries, measureCtx, dateKey, fontPx) {
      const anchors = responseCardAnchors(entries.length);
      const placements = [];

      entries.forEach((entry, index) => {
        const anchor = anchors[index];
        if (!anchor) return;
        const layout = estimatePatchLayout(measureCtx, entry, fontPx);
        const w = layout.width;
        const h = layout.height;
        const tiltDeg = 0;
        placements.push({ x: anchor.x, y: anchor.y, width: w, height: h, layout, tiltDeg });
      });
      return placements;
    }

    /**
     * @param {Blob} quiltBlob
     * @param {object} options
     * @param {string} options.reflectionPrompt
     * @param {Array} options.highlightedThemes
     * @returns {Promise<{ blob: Blob|null, meta: object }|null>}
     */
    async function composeCarouselReflectionSlideFromQuiltBlob(quiltBlob, options = {}) {
      const promptText = String(options.reflectionPrompt || '').trim();
      const dateKey = String(options.dateKey || 'our-daily').trim() || 'our-daily';
      const { entries: responses, source: responseSource } = resolveReflectionSlideThemes(
        options.highlightedThemes,
        dateKey
      );
      if (!quiltBlob || !promptText || !responses.length) return null;

      const IgCompose = global.IgContributorCarouselCompose || globalThis.IgContributorCarouselCompose;
      const drawBg = IgCompose?.drawSharedQuiltBg;
      const resolveRect = IgCompose?.resolveSharedQuiltRect;
      if (typeof drawBg !== 'function' || typeof resolveRect !== 'function') {
        throw new Error('IgContributorCarouselCompose.drawSharedQuiltBg missing');
      }

      const QNC = global.QuiltNewspaperClipping;
      const responseFontPx = questionFontPx(promptText);
      if (typeof QNC?.ensureNewspaperClippingFonts === 'function') {
        await QNC.ensureNewspaperClippingFonts(
          [responseFontPx, 39, 45, 51, 57],
          '"DM Sans", system-ui, sans-serif'
        );
      }

      const [quiltImg, promptCardImg, highlightBorderImg, tapeStripImg] = await Promise.all([
        loadImageFromBlob(quiltBlob),
        loadImageFromUrl(options.promptCardUrl || 'assets/reflection-prompt-card.png?v=5'),
        loadHighlightBorderArt(),
        loadTapeStripArt()
      ]);
      const quiltRect = resolveRect(quiltImg, options);
      if (!quiltRect) return null;

      const canvas = document.createElement('canvas');
      canvas.width = PANEL_W;
      canvas.height = PANEL_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      drawBg(ctx, quiltImg, quiltRect, PANEL_W, PANEL_H, {
        flip: true,
        smoothingQuality: options.smoothingQuality || 'high'
      });
      ctx.fillStyle = QUILT_RECESS_WASH;
      ctx.fillRect(0, 0, PANEL_W, PANEL_H);

      const measureCanvas = document.createElement('canvas');
      measureCanvas.width = 10;
      measureCanvas.height = 10;
      const measureCtx = measureCanvas.getContext('2d');
      measureCtx.font = `400 ${responseFontPx}px "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;

      const placements = layoutWallPatches(responses, measureCtx, dateKey, responseFontPx);
      const joinTapes = buildJoinTapes(placements, dateKey);
      const patchDrawOrder = patchDrawOrderFor(placements.length);
      let previousRgb = null;
      patchDrawOrder.forEach((index) => {
        const placement = placements[index];
        if (!placement) return;
        const entry = responses[index];
        const rgb = pickPatchRgb(index, previousRgb);
        previousRgb = rgb;
        const seedKey = `${dateKey}:reflection-ig:${entry?.seedKey || index}`;
        ctx.save();
        ctx.translate(placement.x + placement.width / 2, placement.y + placement.height / 2);
        ctx.rotate((placement.tiltDeg * Math.PI) / 180);
        drawFabricPatch(
          ctx,
          -placement.width / 2,
          -placement.height / 2,
          placement.width,
          placement.height,
          rgb,
          seedKey,
          entry?.adminHighlight === true,
          placement.layout,
          highlightBorderImg
        );
        ctx.restore();
      });
      drawJoinTapes(ctx, joinTapes, tapeStripImg);

      const promptMeta = drawPromptCard(ctx, promptText, promptCardImg);
      const blob = await canvasToBlob(canvas);
      if (!blob) return null;
      return {
        blob,
        meta: {
          panelWidth: PANEL_W,
          panelHeight: PANEL_H,
          carouselQuiltBgMode: 'layout-b-flipped-reflection-wall',
          reflectionPrompt: promptText,
          responseSource,
          responseCount: responses.length,
          highlightCount: responses.filter((row) => row.adminHighlight === true).length,
          promptCard: promptMeta,
          responseClusterLayout: 'backwards-l',
          joinTapes,
          patchPlacements: placements.map((p) => ({
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
            tiltDeg: p.tiltDeg
          }))
        }
      };
    }

    return {
      composeCarouselReflectionSlideFromQuiltBlob,
      PANEL_W,
      PANEL_H,
      flattenHighlightedThemes,
      flattenWallThemes,
      pickFallbackReflectionThemes,
      resolveReflectionSlideThemes
    };
  }
);
