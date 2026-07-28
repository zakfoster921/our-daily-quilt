/**
 * IG carousel slide 2 alternate: mirror-flipped quilt bg + reflection cards
 * rasterized from quilt-screen DOM (same CSS/markup as the in-app wall).
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
    const CARD_LAYER_MARGIN_X = 34;
    const CARD_LAYER_MARGIN_Y = 38;
    const QUILT_RECESS_WASH = 'rgba(246, 244, 241, 0.28)';

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
        return { entries: highlighted.slice(0, 3), source: 'highlight' };
      }
      const fallback = pickFallbackReflectionThemes(themes, dateKey, 3);
      return { entries: fallback, source: fallback.length ? 'fallback' : 'none' };
    }

    function entriesToWallThemes(entries) {
      return (Array.isArray(entries) ? entries : []).map((entry) => ({
        text: String(entry.text || '').trim(),
        author: String(entry.author || '').trim(),
        heartCount: Math.max(0, Number(entry.heartCount) || 0),
        adminHighlight: entry?.adminHighlight === true
      }));
    }

    function drawCardsLayerOnPanel(ctx, cardsLayer, panelW, panelH) {
      const { canvas, logicalWidth, logicalHeight } = cardsLayer;
      if (!canvas || !logicalWidth || !logicalHeight) return null;

      const maxW = panelW - CARD_LAYER_MARGIN_X * 2;
      const maxH = panelH - CARD_LAYER_MARGIN_Y * 2;
      const scale = Math.min(maxW / logicalWidth, maxH / logicalHeight);
      const drawW = logicalWidth * scale;
      const drawH = logicalHeight * scale;

      ctx.drawImage(canvas, CARD_LAYER_MARGIN_X, CARD_LAYER_MARGIN_Y, drawW, drawH);
      return {
        x: CARD_LAYER_MARGIN_X,
        y: CARD_LAYER_MARGIN_Y,
        width: drawW,
        height: drawH,
        scale,
        sourceLogicalWidth: logicalWidth,
        sourceLogicalHeight: logicalHeight
      };
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

      const app = global.app;
      if (typeof app?.rasterizeIgReflectionSlideCardsLayer !== 'function') {
        throw new Error('app.rasterizeIgReflectionSlideCardsLayer missing');
      }

      const IgCompose = global.IgContributorCarouselCompose || globalThis.IgContributorCarouselCompose;
      const drawBg = IgCompose?.drawSharedQuiltBg;
      const resolveRect = IgCompose?.resolveSharedQuiltRect;
      if (typeof drawBg !== 'function' || typeof resolveRect !== 'function') {
        throw new Error('IgContributorCarouselCompose.drawSharedQuiltBg missing');
      }

      const [quiltImg, cardsLayer] = await Promise.all([
        loadImageFromBlob(quiltBlob),
        app.rasterizeIgReflectionSlideCardsLayer({
          reflectionPrompt: promptText,
          themeEntries: entriesToWallThemes(responses),
          dateKey
        })
      ]);
      const quiltRect = resolveRect(quiltImg, options);
      if (!quiltRect || !cardsLayer?.canvas) return null;

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

      const cardsMeta = drawCardsLayerOnPanel(ctx, cardsLayer, PANEL_W, PANEL_H);
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
          cardsLayer: cardsMeta,
          responseClusterLayout: 'quilt-screen-dom-stack'
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
