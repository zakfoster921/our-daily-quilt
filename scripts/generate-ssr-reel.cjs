#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function getAppDateKey(d = new Date()) {
  const utcHours = d.getUTCHours();
  const adjusted = new Date(d);
  if (utcHours < 7) {
    adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  }
  const y = adjusted.getUTCFullYear();
  const m = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function writeFailureArtifacts(page, attempt, outDir) {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const png = path.join(outDir, `attempt-${attempt}.png`);
    const html = path.join(outDir, `attempt-${attempt}.html`);
    await page.screenshot({ path: png, fullPage: true });
    const content = await page.content();
    fs.writeFileSync(html, content, 'utf8');
    console.log(`[ssr] wrote failure artifacts: ${png}, ${html}`);
  } catch (e) {
    console.warn('[ssr] could not write failure artifacts:', e.message || String(e));
  }
}

async function runSsrAttempt({ appUrl, apiBase, dateKey, attempt, outDir }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    // Wait for app initialization path that loads quilt from Firestore/local data.
    await page.waitForFunction(() => !!window.app && window.app._portalQuiltLoaded === true, undefined, {
      timeout: 180000
    });
    await page.waitForFunction(
      () =>
        !!window.app &&
        !!window.app.quiltEngine &&
        Array.isArray(window.app.quiltEngine.blocks) &&
        window.app.quiltEngine.blocks.length > 0,
      undefined,
      { timeout: 180000 }
    );

    const result = await page.evaluate(
      async ({ dateKey, apiBase }) => {
        if (!window.app) throw new Error('window.app not ready');
        if (typeof Utils === 'undefined' || typeof Utils.writeInstagramImagesDocForZapier !== 'function') {
          throw new Error('Utils.writeInstagramImagesDocForZapier missing');
        }
        const app = window.app;
        let blocks = app.quiltEngine?.blocks || [];
        // CI/headless can race: app exists with default 1 block before async quilt hydrate completes.
        if ((!Array.isArray(blocks) || blocks.length <= 1) && typeof app.loadQuilt === 'function') {
          try {
            await app.loadQuilt();
            if (typeof app.renderQuilt === 'function') {
              app.renderQuilt();
            }
          } catch (_) {
            /* keep original state if reload fails */
          }
          blocks = app.quiltEngine?.blocks || [];
        }
        if (!Array.isArray(blocks) || blocks.length <= 1) {
          throw new Error(`Need >1 block, found ${blocks.length || 0}`);
        }
        if (typeof app._buildSyntheticQuiltReelWebm !== 'function') {
          throw new Error('SSR reel builder missing');
        }
        if (typeof MediaRecorder === 'undefined') {
          throw new Error('MediaRecorder unavailable in headless browser');
        }
        const arch = app.archiveService;
        if (!arch?.generateInstagramImage) {
          throw new Error('ArchiveService.generateInstagramImage missing');
        }

        const quote = app.quoteService?.getTodayQuote?.() || { text: '', body: '', author: '' };
        const instagramImage = await arch.generateInstagramImage(blocks);
        let postLayoutBImageData = null;
        if (arch.generateInstagramPostLayoutBImage) {
          postLayoutBImageData = await arch.generateInstagramPostLayoutBImage(
            blocks,
            quote,
            dateKey
          );
        }

        const { blob } = await app._buildSyntheticQuiltReelWebm(blocks, {
          width: 1080,
          height: 1920,
          durationSec: 8,
          fps: 30,
          bg: '#f6f4f1',
          quoteText: String(quote.text ?? quote.body ?? '').trim(),
          quoteAuthor: String(quote.author ?? '').trim(),
          dateKey
        });
        if (!blob || blob.size < 200) {
          throw new Error('SSR reel blob too small');
        }

        const zapierCaption =
          typeof Utils.formatZapierCaptionFromQuote === 'function'
            ? Utils.formatZapierCaptionFromQuote(quote)
            : `${String(quote.text ?? quote.body ?? '').trim()} — ${String(quote.author ?? '').trim()}`.trim();

        const doc = await Utils.writeInstagramImagesDocForZapier({
          dateKey,
          instagramImage,
          postLayoutBImageData,
          reelWebmBlob: blob,
          zapierCaption
        });

        const tr = await fetch(`${apiBase}/api/transcode-instagram-reel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateKey })
        });
        const trJson = await tr.json().catch(() => ({}));
        if (!tr.ok || !trJson.success) {
          throw new Error(
            `transcode failed: HTTP ${tr.status} ${trJson.error || trJson.message || ''}`.trim()
          );
        }

        return {
          dateKey,
          reelWebmUploaded: !!doc.reelWebmStorageUrl,
          reelMp4Url: trJson.reelMp4Url || ''
        };
      },
      { dateKey, apiBase }
    );

    const verifyRes = await fetch(`${apiBase}/api/generate-instagram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateKey })
    });
    const verify = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok || !verify.success) {
      throw new Error(
        `verify failed: HTTP ${verifyRes.status} ${verify.error || verify.message || ''}`.trim()
      );
    }
    if (!verify.reelMp4Url) {
      throw new Error('verify failed: reelMp4Url missing after SSR generation');
    }
    return {
      success: true,
      date: dateKey,
      attempt,
      reelWebmUploaded: result.reelWebmUploaded,
      reelMp4Url: verify.reelMp4Url,
      reelVideoUrl: verify.reelVideoUrl
    };
  } catch (err) {
    await writeFailureArtifacts(page, attempt, outDir);
    throw err;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    throw new Error('APP_URL is required');
  }
  const apiBase =
    (process.env.API_BASE_URL && String(process.env.API_BASE_URL).replace(/\/$/, '')) ||
    new URL(appUrl).origin;
  const dateKey = process.env.DATE_KEY || getAppDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Invalid DATE_KEY: ${dateKey}`);
  }

  console.log(`[ssr] dateKey=${dateKey}`);
  console.log(`[ssr] app=${appUrl}`);
  console.log(`[ssr] api=${apiBase}`);

  const outDir = process.env.SSR_ARTIFACTS_DIR || path.join(process.cwd(), 'tmp', 'ssr-artifacts');
  const maxAttempts = Number(process.env.SSR_MAX_ATTEMPTS || '2');
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[ssr] attempt ${attempt}/${maxAttempts}`);
      const result = await runSsrAttempt({ appUrl, apiBase, dateKey, attempt, outDir });
      console.log(JSON.stringify(result, null, 2));
      return;
    } catch (err) {
      lastError = err;
      console.error(`[ssr] attempt ${attempt} failed:`, err && err.message ? err.message : err);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  throw lastError || new Error('SSR failed');
}

main().catch((err) => {
  console.error('[ssr] failure:', err && err.stack ? err.stack : err);
  process.exit(1);
});
