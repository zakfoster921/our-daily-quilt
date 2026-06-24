#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Overlay carousel slide-1 speaker bounds on an existing preview PNG.
 * Usage:
 *   APP_URL=http://127.0.0.1:3000/our-daily-beta.html DATE_KEY=2026-06-22 node scripts/draw-carousel-speaker-bounds.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const STORY_W = 1080;
const STORY_H = 1350;
const SPEAKER_AVOID_PAD = { top: 6, right: 24, bottom: 24, left: 24 };

function contentRectFromSpeaker(speakerRect) {
  const hasContent =
    Number.isFinite(Number(speakerRect.contentWidth)) && Number(speakerRect.contentWidth) > 0;
  return {
    x: hasContent ? Number(speakerRect.contentX) : Number(speakerRect.x),
    y: hasContent ? Number(speakerRect.contentY) : Number(speakerRect.y),
    width: hasContent ? Number(speakerRect.contentWidth) : Number(speakerRect.width),
    height: hasContent ? Number(speakerRect.contentHeight) : Number(speakerRect.height)
  };
}

function expandedFromContent(content, pad = SPEAKER_AVOID_PAD) {
  return {
    x: content.x - pad.left,
    y: content.y - pad.top,
    width: content.width + pad.left + pad.right,
    height: content.height + pad.top + pad.bottom
  };
}

function odqLayoutBPostGridSafeRect(layoutW, layoutH, padding = 14) {
  const w = Math.max(1, Number(layoutW) || 1080);
  const h = Math.max(1, Number(layoutH) || 1350);
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

async function main() {
  const appUrl = process.env.APP_URL;
  const dateKey = process.env.DATE_KEY || '2026-06-22';
  const inputPath = path.join(process.cwd(), 'tmp', `carousel-slide-1-layout-b-${dateKey}.png`);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing ${inputPath} — run preview-ig-carousel.cjs first`);
  }

  const pngB64 = fs.readFileSync(inputPath).toString('base64');
  let speakerRect = { x: 613, y: 20, width: 648, height: 972 };

  if (appUrl) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => !!window.app && window.app._portalQuiltLoaded === true, undefined, {
        timeout: 180000
      });
      speakerRect = await page.evaluate(async ({ dateKey }) => {
        const arch = window.app?.archiveService;
        const overlay = await arch._resolveCarouselSpeakerSeamOverlay(null, [], dateKey);
        return overlay ? arch._resolveCarouselSpeakerSeamRectFromOverlay(overlay) : null;
      }, { dateKey });
    } finally {
      await browser.close();
    }
  }

  if (!speakerRect) throw new Error('Could not resolve speaker rect');

  const safe = odqLayoutBPostGridSafeRect(STORY_W, STORY_H, 14);
  const raw = {
    x: speakerRect.x,
    y: speakerRect.y,
    width: speakerRect.width,
    height: speakerRect.height
  };
  const content = contentRectFromSpeaker(speakerRect);
  const expanded = expandedFromContent(content);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const dataUrl = await page.evaluate(
      ({ pngB64, safe, raw, content, expanded, STORY_W, STORY_H }) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const sx = canvas.width / STORY_W;
            const sy = canvas.height / STORY_H;
            const draw = (rect, color, label, dash = []) => {
              const x = rect.x * sx;
              const y = rect.y * sy;
              const w = rect.width * sx;
              const h = rect.height * sy;
              ctx.save();
              ctx.strokeStyle = color;
              ctx.lineWidth = 3;
              ctx.setLineDash(dash);
              ctx.strokeRect(x, y, w, h);
              ctx.setLineDash([]);
              ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
              ctx.lineWidth = 4;
              ctx.strokeStyle = 'rgba(255,255,255,0.95)';
              ctx.strokeText(label, x + 8, Math.max(28, y + 28));
              ctx.fillStyle = color;
              ctx.fillText(label, x + 8, Math.max(28, y + 28));
              ctx.restore();
            };
            draw(safe, '#0066ff', 'Post safe (3:4)', [10, 8]);
            draw(raw, '#ff2222', 'Speaker image bounds');
            draw(content, '#22aa44', 'Content bounds (alpha tight)');
            draw(expanded, '#ff9900', 'Strip avoid zone', [14, 10]);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => reject(new Error('image load failed'));
          img.src = `data:image/png;base64,${pngB64}`;
        });
      },
      { pngB64, safe, raw, content, expanded, STORY_W, STORY_H }
    );

    const outPath = path.join(process.cwd(), 'tmp', `carousel-slide-1-speaker-bounds-${dateKey}.png`);
    fs.writeFileSync(outPath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    console.log(`[draw-speaker-bounds] wrote ${outPath}`);
    console.log(`[draw-speaker-bounds] imageBounds=${JSON.stringify(raw)}`);
    console.log(`[draw-speaker-bounds] contentBounds=${JSON.stringify(content)}`);
    console.log(`[draw-speaker-bounds] stripAvoid=${JSON.stringify(expanded)}`);
    console.log(`[draw-speaker-bounds] postSafe=${JSON.stringify(safe)}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[draw-speaker-bounds]', err?.message || err);
  process.exit(1);
});
