/**
 * IG carousel slide 4: quilt bg + centered yesterday-stats card (Playwright DOM capture).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IgCarouselYesterdayStatsSlideCompose = api;
    root.composeCarouselYesterdayStatsSlideFromQuiltBlob = api.composeCarouselYesterdayStatsSlideFromQuiltBlob;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
  function (global) {
    'use strict';

    const PANEL_W = 1080;
    const PANEL_H = 1350;
    const CARD_LAYER_MARGIN_X = 16;
    const CARD_LAYER_WIDTH_RATIO = 0.96;
    const CARD_LAYER_HEIGHT_RATIO = 0.72;

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

    function drawCardsLayerOnPanel(ctx, cardsLayer, panelW, panelH) {
      const { canvas, logicalWidth, logicalHeight } = cardsLayer;
      if (!canvas || !logicalWidth || !logicalHeight) return null;

      const maxW = Math.min(panelW - CARD_LAYER_MARGIN_X * 2, panelW * CARD_LAYER_WIDTH_RATIO);
      const maxH = Math.round(panelH * CARD_LAYER_HEIGHT_RATIO);
      const scale = Math.min(maxW / logicalWidth, maxH / logicalHeight);
      const drawW = logicalWidth * scale;
      const drawH = logicalHeight * scale;
      const drawX = Math.round((panelW - drawW) / 2);
      const drawY = Math.round((panelH - drawH) / 2);

      ctx.drawImage(canvas, drawX, drawY, drawW, drawH);
      return {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
        scale,
        sourceLogicalWidth: logicalWidth,
        sourceLogicalHeight: logicalHeight
      };
    }

    async function composeCarouselYesterdayStatsSlideFromQuiltBlob(quiltBlob, options = {}) {
      const contributorCount = Math.max(1, Math.floor(Number(options.contributorCount) || 1));
      const dateKey = String(options.dateKey || 'our-daily').trim() || 'our-daily';
      if (!quiltBlob) return null;

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

      const cardsPngBase64 = String(
        options.cardsPngBase64 || globalThis.__igYesterdayStatsPlaywrightCardsPng || ''
      ).trim();
      if (!cardsPngBase64) {
        throw new Error(
          'Yesterday stats cards PNG missing — capture via scripts/ig-reflection-playwright-capture.cjs'
        );
      }

      const [quiltImg, cardsLayer] = await Promise.all([
        loadImageFromBlob(quiltBlob),
        app.rasterizeIgReflectionSlideCardsLayer({
          cardsPngBase64,
          logicalWidth: options.cardsLayerLogicalWidth,
          logicalHeight: options.cardsLayerLogicalHeight,
          deviceScaleFactor: options.cardsLayerDeviceScaleFactor
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
        flip: false,
        smoothingQuality: options.smoothingQuality || 'high'
      });

      const cardsMeta = drawCardsLayerOnPanel(ctx, cardsLayer, PANEL_W, PANEL_H);
      const blob = await canvasToBlob(canvas);
      if (!blob) return null;

      return {
        blob,
        meta: {
          panelWidth: PANEL_W,
          panelHeight: PANEL_H,
          carouselQuiltBgMode: 'layout-b-reflection-wall-yesterday-stats',
          contributorCount,
          cardsLayer: cardsMeta,
          cardLayout: 'playwright-dom-screenshot'
        }
      };
    }

    return {
      composeCarouselYesterdayStatsSlideFromQuiltBlob,
      PANEL_W,
      PANEL_H
    };
  }
);
