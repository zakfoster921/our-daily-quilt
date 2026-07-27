/**
 * IG carousel slide 2 alternate: mirror-flipped quilt bg + reflection prompt card (top-left)
 * + admin-highlight response patches scattered like post-its on a wall.
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
    const PROMPT_CARD_W = 360;
    const PROMPT_CARD_H = Math.round(PROMPT_CARD_W * PROMPT_CARD_ASPECT);
    const PROMPT_CARD_X = 52;
    const PROMPT_CARD_Y = 56;
    const PROMPT_CARD_TILT_DEG = 1.4;
    const PROMPT_INSET_TOP = 0.17;
    const PROMPT_INSET_SIDE = 0.05;
    const PROMPT_INSET_BOTTOM = 0.17;
    const PATCH_SCALE = 0.62;
    const ROOT_PX = 16;
    const PATCH_FONT_PX = 19;
    const PATCH_LINE_HEIGHT = 1.35;
    const PATCH_PAD_X = 22;
    const PATCH_PAD_Y = 26;
    const HIGHLIGHT_BORDER_INSET = 9;
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
            adminHighlight: true,
            seedKey: `solo:${index}`
          });
        }
      });
      return out.filter((row) => row.text);
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

    function estimatePatchSize(ctx, entry, maxWidthPx) {
      const body = String(entry.text || '').trim();
      const author = String(entry.author || '').trim();
      const innerW = Math.max(80, maxWidthPx - PATCH_PAD_X * 2);
      const lines = wrapTextLines(ctx, body, innerW, 7);
      const lineStep = PATCH_FONT_PX * PATCH_LINE_HEIGHT;
      let h = PATCH_PAD_Y * 2 + lines.length * lineStep;
      if (author) h += PATCH_FONT_PX * 0.85 * PATCH_LINE_HEIGHT + 6;
      const longest = lines.reduce((m, line) => Math.max(m, ctx.measureText(line).width), 0);
      const w = Math.min(maxWidthPx, Math.max(160, Math.ceil(longest + PATCH_PAD_X * 2)));
      h = Math.max(Math.round(11 * ROOT_PX * PATCH_SCALE), Math.ceil(h));
      return { width: w, height: h, lines, author, lineStep };
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

    function drawFabricPatch(ctx, x, y, w, h, rgbCsv, seedKey, highlighted, layout) {
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
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `400 ${PATCH_FONT_PX}px "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
      let cy = PATCH_PAD_Y + PATCH_FONT_PX;
      layout.lines.forEach((line) => {
        ctx.fillText(line, PATCH_PAD_X, cy);
        cy += layout.lineStep;
      });
      if (layout.author) {
        ctx.font = `400 ${Math.round(PATCH_FONT_PX * 0.8)}px "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`— ${layout.author}`, w - PATCH_PAD_X, h - PATCH_PAD_Y + 4);
      }
      if (highlighted) {
        ctx.strokeStyle = 'rgba(74, 64, 54, 0.34)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([0, 7]);
        ctx.lineDashOffset = 2;
        const inset = HIGHLIGHT_BORDER_INSET;
        ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
        ctx.setLineDash([]);
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
      const fontPx = text.length > 90 ? 21 : text.length > 60 ? 24 : 27;
      ctx.font = `400 ${fontPx}px "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
      const lines = wrapTextLines(ctx, text, boxW - 8, 6);
      const lineStep = fontPx * 1.22;
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
      const pad = 28;
      return {
        x: PROMPT_CARD_X - pad,
        y: PROMPT_CARD_Y - pad,
        width: PROMPT_CARD_W + pad * 2 + 120,
        height: PROMPT_CARD_H + pad * 2
      };
    }

    function rectsOverlap(a, b, gap = 16) {
      return !(
        a.x + a.width + gap <= b.x ||
        b.x + b.width + gap <= a.x ||
        a.y + a.height + gap <= b.y ||
        b.y + b.height + gap <= a.y
      );
    }

    function layoutWallPatches(entries, measureCtx, dateKey) {
      const occupied = questionOccupiedRect();
      const margin = 40;
      const placements = [];
      const placedRects = [occupied];
      const maxPatchW = Math.round(PANEL_W * 0.42);
      entries.forEach((entry, index) => {
        const layout = estimatePatchSize(measureCtx, entry, maxPatchW);
        const w = layout.width;
        const h = layout.height;
        let placed = null;
        for (let attempt = 0; attempt < 36; attempt += 1) {
          const t1 = seededUnit(dateKey, `${entry.seedKey}:x:${index}:${attempt}`);
          const t2 = seededUnit(dateKey, `${entry.seedKey}:y:${index}:${attempt}`);
          const minX = margin;
          const maxX = Math.max(minX, PANEL_W - margin - w);
          const minY = margin;
          const maxY = Math.max(minY, PANEL_H - margin - h);
          const x = Math.round(minX + t1 * (maxX - minX));
          const y = Math.round(minY + t2 * (maxY - minY));
          const rect = { x, y, width: w, height: h };
          if (placedRects.some((other) => rectsOverlap(rect, other, 18))) continue;
          placed = { ...rect, layout, tiltDeg: patchTiltDeg(index) + (seededUnit(dateKey, `tilt:${index}:${attempt}`) - 0.5) * 2.4 };
          placedRects.push(rect);
          break;
        }
        if (!placed) {
          const x = Math.min(PANEL_W - margin - w, occupied.x + occupied.width + 24);
          const y = margin + index * 24;
          placed = { x, y, width: w, height: h, layout, tiltDeg: patchTiltDeg(index) };
          placedRects.push({ x, y, width: w, height: h });
        }
        placements.push(placed);
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
      const highlighted = flattenHighlightedThemes(options.highlightedThemes);
      if (!quiltBlob || !promptText || !highlighted.length) return null;

      const IgCompose = global.IgContributorCarouselCompose || globalThis.IgContributorCarouselCompose;
      const drawBg = IgCompose?.drawSharedQuiltBg;
      const resolveRect = IgCompose?.resolveSharedQuiltRect;
      if (typeof drawBg !== 'function' || typeof resolveRect !== 'function') {
        throw new Error('IgContributorCarouselCompose.drawSharedQuiltBg missing');
      }

      const QNC = global.QuiltNewspaperClipping;
      if (typeof QNC?.ensureNewspaperClippingFonts === 'function') {
        await QNC.ensureNewspaperClippingFonts([PATCH_FONT_PX, 24, 27], '"DM Sans", system-ui, sans-serif');
      }

      const [quiltImg, promptCardImg] = await Promise.all([
        loadImageFromBlob(quiltBlob),
        loadImageFromUrl(options.promptCardUrl || 'assets/reflection-prompt-card.png?v=5')
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

      const measureCanvas = document.createElement('canvas');
      measureCanvas.width = 10;
      measureCanvas.height = 10;
      const measureCtx = measureCanvas.getContext('2d');
      measureCtx.font = `400 ${PATCH_FONT_PX}px "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;

      const dateKey = String(options.dateKey || 'our-daily').trim() || 'our-daily';
      const placements = layoutWallPatches(highlighted, measureCtx, dateKey);
      let previousRgb = null;
      highlighted.forEach((entry, index) => {
        const placement = placements[index];
        if (!placement) return;
        const rgb = pickPatchRgb(index, previousRgb);
        previousRgb = rgb;
        const seedKey = `${dateKey}:reflection-ig:${entry.seedKey || index}`;
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
          true,
          placement.layout
        );
        ctx.restore();
      });

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
          highlightCount: highlighted.length,
          promptCard: promptMeta,
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
      flattenHighlightedThemes
    };
  }
);
