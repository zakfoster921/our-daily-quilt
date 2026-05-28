#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Nightly Zapier stills only (no reel): classic + layout B post + layout B story + quilt-screen 9:16.
 * Loads the live app in Playwright, reads quilts/{dateKey} from Firestore, uploads PNGs,
 * sets instagram-images/{dateKey}.readyForInstagram = true.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/** Active quilt calendar day (UTC 07:00 boundary). Used for live quilt-screen newspaper clipping. */
function getActiveQuiltDateKey(d = new Date()) {
  const adj = new Date(d);
  if (d.getUTCHours() < 7) adj.setUTCDate(adj.getUTCDate() - 1);
  const y = adj.getUTCFullYear();
  const m = String(adj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(adj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Last archived quilt day. Intended for runs at or after 07:00 UTC (see nightly-instagram-snapshot.yml cron). */
function getCompletedQuiltDateKey(d = new Date()) {
  const adj = new Date(d);
  if (d.getUTCHours() < 7) adj.setUTCDate(adj.getUTCDate() - 1);
  adj.setUTCDate(adj.getUTCDate() - 1);
  const y = adj.getUTCFullYear();
  const m = String(adj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(adj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function writeFailureArtifacts(page, attempt, outDir) {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const png = path.join(outDir, `attempt-${attempt}.png`);
    const html = path.join(outDir, `attempt-${attempt}.html`);
    await page.screenshot({ path: png, fullPage: true });
    fs.writeFileSync(html, await page.content(), 'utf8');
    console.log(`[nightly-ig] wrote failure artifacts: ${png}, ${html}`);
  } catch (e) {
    console.warn('[nightly-ig] could not write failure artifacts:', e.message || String(e));
  }
}

async function runNightlyIgAttempt({
  appUrl,
  apiBase,
  dateKey,
  attempt,
  outDir,
  strictQuote,
  clippingOnly = false
}) {
  const evaluateTimeoutMs = Math.max(
    120000,
    Number(process.env.NIGHTLY_IG_EVALUATE_TIMEOUT_MS) || 720000
  );
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
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[nightly-ig:page]') || msg.type() === 'warning' || msg.type() === 'error') {
      console.log(`[nightly-ig:browser] ${text}`);
    }
  });
  try {
    console.log(`[nightly-ig] loading app ${appUrl}…`);
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    console.log('[nightly-ig] waiting for portal quilt…');
    await page.waitForFunction(() => !!window.app && window.app._portalQuiltLoaded === true, undefined, {
      timeout: 180000
    });
    if (!clippingOnly) {
      console.log('[nightly-ig] waiting for quilt blocks…');
      await page.waitForFunction(
        () =>
          !!window.app &&
          !!window.app.quiltEngine &&
          Array.isArray(window.app.quiltEngine.blocks) &&
          window.app.quiltEngine.blocks.length > 0,
        undefined,
        { timeout: 180000 }
      );
    } else {
      console.log('[nightly-ig] clipping-only: waiting for quote catalog…');
      await page.waitForFunction(
        () =>
          !!window.app?.quoteService &&
          Array.isArray(window.app.quoteService.quotes) &&
          window.app.quoteService.quotes.length > 0,
        undefined,
        { timeout: 180000 }
      );
    }

    console.log(
      `[nightly-ig] generating ${clippingOnly ? 'newspaper clipping' : 'images'} for ${dateKey} (browser work often 5–12 min; logs tagged [nightly-ig:page])…`
    );
    page.setDefaultTimeout(evaluateTimeoutMs);
    const result = await page.evaluate(
      async ({ dateKey, strictQuote, clippingOnly }) => {
        const log = (step) => console.log(`[nightly-ig:page] ${step}`);
        if (!window.app) throw new Error('window.app not ready');
        if (typeof Utils === 'undefined' || typeof Utils.writeInstagramImagesDocForZapier !== 'function') {
          throw new Error('Utils.writeInstagramImagesDocForZapier missing');
        }
        const app = window.app;
        if (clippingOnly) {
          const arch = app.archiveService;
          if (!arch?.generateNewspaperClippingImageData) {
            throw new Error('generateNewspaperClippingImageData missing — deploy our-daily-beta.html');
          }
          log('generating newspaper clipping PNG…');
          const newspaperClippingImageData = await arch.generateNewspaperClippingImageData(dateKey);
          if (!newspaperClippingImageData) {
            throw new Error(`Newspaper clipping was not generated for ${dateKey}`);
          }
          let quoteClippingHeightPx = 0;
          let quoteClippingWidthPx = 0;
          if (typeof arch._measureDataUrlSizePx === 'function') {
            const quoteSize = await arch._measureDataUrlSizePx(newspaperClippingImageData);
            quoteClippingHeightPx = quoteSize?.h ?? 0;
            quoteClippingWidthPx = quoteSize?.w ?? 0;
          } else if (typeof arch._measureDataUrlHeightPx === 'function') {
            quoteClippingHeightPx = await arch._measureDataUrlHeightPx(newspaperClippingImageData);
          }
          let moodClippingGoodImageData = null;
          let moodClippingRoughImageData = null;
          if (arch?.generateMoodClippingImageData) {
            log('generating mood clipping good_day PNG…');
            moodClippingGoodImageData = await arch.generateMoodClippingImageData(dateKey, {
              variant: 'good',
              quoteClippingHeightPx,
              quoteClippingWidthPx
            });
            if (!moodClippingGoodImageData) {
              throw new Error(`Mood clipping (good_day) was not generated for ${dateKey}`);
            }
            if (process.env.MOOD_CLIPPING_ROUGH === '1') {
              log('generating mood clipping rough_day PNG…');
              moodClippingRoughImageData = await arch.generateMoodClippingImageData(dateKey, {
                variant: 'rough',
                quoteClippingHeightPx,
                quoteClippingWidthPx
              });
            }
          }
          log('uploading clipping PNGs…');
          const doc = await Utils.writeInstagramImagesDocForZapier({
            dateKey,
            newspaperClippingImageData,
            moodClippingGoodImageData,
            moodClippingRoughImageData,
            storageCacheControl: 'no-store'
          });
          if (!doc.newspaperClippingUrl && !doc.newspaperClippingImageStorageUrl) {
            throw new Error('newspaperClippingUrl missing after upload');
          }
          if (moodClippingGoodImageData && !doc.moodClippingGoodUrl && !doc.moodClippingGoodImageStorageUrl) {
            throw new Error('moodClippingGoodUrl missing after upload');
          }
          return {
            dateKey,
            clippingOnly: true,
            newspaperClippingUrl: doc.newspaperClippingUrl || doc.newspaperClippingImageStorageUrl || '',
            moodClippingGoodUrl: doc.moodClippingGoodUrl || doc.moodClippingGoodImageStorageUrl || '',
            moodClippingRoughUrl: doc.moodClippingRoughUrl || doc.moodClippingRoughImageStorageUrl || ''
          };
        }

        let blocks = app.quiltEngine?.blocks || [];
        const getFirestoreBlocksForDateKey = async (dk) => {
          try {
            if (!window.db || !window.firestore || typeof window.firestore.getDoc !== 'function') return null;
            const qRef = window.firestore.doc(window.db, 'quilts', dk);
            const qSnap = await window.firestore.getDoc(qRef);
            if (!qSnap.exists()) return null;
            const data = qSnap.data() || {};
            const dayBlocks = Array.isArray(data.blocks) ? data.blocks : [];
            return dayBlocks.length ? dayBlocks : null;
          } catch (_) {
            return null;
          }
        };
        const dateBlocks = await getFirestoreBlocksForDateKey(dateKey);
        if (Array.isArray(dateBlocks) && dateBlocks.length > 0) {
          blocks = dateBlocks;
        }
        if ((!Array.isArray(blocks) || blocks.length <= 1) && typeof app.loadQuilt === 'function') {
          try {
            await app.loadQuilt();
            if (typeof app.renderQuilt === 'function') app.renderQuilt();
          } catch (_) {
            /* */
          }
          blocks = app.quiltEngine?.blocks || [];
        }
        if (!Array.isArray(blocks) || blocks.length <= 1) {
          const retry = await getFirestoreBlocksForDateKey(dateKey);
          if (Array.isArray(retry) && retry.length > 0) blocks = retry;
        }
        if (!Array.isArray(blocks) || blocks.length <= 1) {
          throw new Error(
            `Need >1 block for ${dateKey}, found ${blocks.length || 0}. Missing/empty quilts/${dateKey} in Firestore.`
          );
        }

        log(`loaded ${blocks.length} blocks for ${dateKey}`);
        if (typeof app.applyQuiltDataFromPayload === 'function') {
          await app.applyQuiltDataFromPayload({
            blocks,
            dateKey,
            date: dateKey,
            contributorCount: Math.max(1, blocks.length)
          });
        }
        const quiltScreenEl = document.getElementById('screen-quilt');
        if (quiltScreenEl && typeof app.showScreen === 'function') {
          app.showScreen('screen-quilt');
        } else if (quiltScreenEl) {
          quiltScreenEl.classList.add('active');
        }
        log('rendering quilt SVG (blocks only, no preview chrome)…');
        const engine = app.quiltEngine;
        if (app.renderer?.renderBlocks && engine?.getState) {
          app.renderer.setBacksidePreviewEnabled?.(app._isBacksidePreviewMode === true);
          const state = engine.getState();
          app.renderer.renderBlocks(state.blocks, state.userPieces, state.submissionCount);
        } else if (typeof app.renderQuilt === 'function') {
          await app.renderQuilt();
        }
        await new Promise((resolve) => {
          const deadline = Date.now() + 20000;
          const tick = () => {
            const svg = document.getElementById('quilt');
            const archReady = app.archiveService;
            if (
              svg?.querySelector('#quiltMirroredFieldLayer') &&
              archReady?.hasRenderedQuiltSvgForBlocks?.(svg, blocks)
            ) {
              resolve();
              return;
            }
            if (Date.now() > deadline) {
              log('mirror wait timed out at 20s — continuing with block fallback if needed');
              resolve();
              return;
            }
            requestAnimationFrame(tick);
          };
          tick();
        });

        const arch = app.archiveService;
        if (arch?.clearInstagramQuiltSourceCache) {
          arch.clearInstagramQuiltSourceCache();
        }
        if (!arch?.generateInstagramImage) {
          throw new Error('ArchiveService.generateInstagramImage missing');
        }

        const qs = app.quoteService;
        const readFirestoreDoc = async (collection, id) => {
          try {
            if (!window.db || !window.firestore || typeof window.firestore.getDoc !== 'function') return null;
            const ref = window.firestore.doc(window.db, collection, id);
            const snap = await window.firestore.getDoc(ref);
            return snap.exists() ? snap.data() || {} : null;
          } catch (_) {
            return null;
          }
        };
        const pickString = (...values) => {
          for (const value of values) {
            const s = String(value ?? '').trim();
            if (s) return s;
          }
          return '';
        };
        const quoteFromFirestoreData = (data) => {
          if (!data || typeof data !== 'object') return null;
          const text = pickString(data.text, data.quote, data.body, data.textSnapshot);
          const author = pickString(data.author, data.authorSnapshot);
          if (!text && !author) return null;
          const out = { text, body: text, author };
          const fieldMap = {
            keyword: [data.keyword, data.keywordSnapshot],
            first_line_count: [data.first_line_count, data.firstLineCount],
            blessing: [data.blessing, data.Blessing, data.blessingSnapshot],
            whatIf: [data.whatIf, data.what_if, data.whatIfSnapshot],
            speakerName: [data.speakerName, data.speaker_name, data.author, data.authorSnapshot],
            speakerCutoutUrl: [
              data.speakerCutoutUrl,
              data.speaker_cutout_url,
              data.speakerCutoutUrlSnapshot,
              data.speaker_cutout_url_snapshot
            ],
            speaker_cutout_url: [
              data.speaker_cutout_url,
              data.speakerCutoutUrl,
              data.speaker_cutout_url_snapshot,
              data.speakerCutoutUrlSnapshot
            ],
            speakerImageUrl: [
              data.speakerImageUrl,
              data.speaker_image_url,
              data.speakerImageUrlSnapshot,
              data.speaker_image_url_snapshot
            ],
            speaker_image_url: [
              data.speaker_image_url,
              data.speakerImageUrl,
              data.speaker_image_url_snapshot,
              data.speakerImageUrlSnapshot
            ]
          };
          for (const [key, values] of Object.entries(fieldMap)) {
            const value = pickString(...values);
            if (value) out[key] = value;
          }
          return out;
        };
        const mergeQuoteData = (...quotes) => {
          const out = {};
          for (const q of quotes) {
            if (!q || typeof q !== 'object') continue;
            for (const [key, value] of Object.entries(q)) {
              const s = typeof value === 'string' ? value.trim() : value;
              if (s !== '' && s != null) out[key] = value;
            }
          }
          return Object.keys(out).length ? out : null;
        };
        const assignmentData = await readFirestoreDoc('dailyQuoteAssignments', dateKey);
        const sourceId = pickString(assignmentData?.sourceId);
        const sourceQuoteData = sourceId ? await readFirestoreDoc('quotes', sourceId) : null;
        const datedQuoteData = await readFirestoreDoc('quotes', dateKey);
        let quote = null;
        if (qs && typeof qs.getQuoteResolvedForInstagramDateKey === 'function') {
          quote = (await qs.getQuoteResolvedForInstagramDateKey(dateKey)) || null;
        } else if (qs && typeof qs.resolveAndPinCalendarKey === 'function') {
          quote = (await qs.resolveAndPinCalendarKey(dateKey)) || null;
        } else if (qs && typeof qs.getQuoteForDate === 'function') {
          quote = qs.getQuoteForDate(dateKey) || null;
        }
        if (!quote) {
          quote = mergeQuoteData(
            quoteFromFirestoreData(datedQuoteData),
            quoteFromFirestoreData(sourceQuoteData),
            quoteFromFirestoreData(assignmentData)
          );
        }
        quote = quote || { text: '', body: '', author: '' };
        if (strictQuote && !String(quote.text ?? quote.body ?? '').trim()) {
          throw new Error(`Missing canonical quote for ${dateKey}`);
        }

        log('generating classic 4:5…');
        const instagramImage = await arch.generateInstagramImage(blocks);
        if (!arch.generateInstagramQuiltScreen9x16ImageData) {
          throw new Error(
            `generateInstagramQuiltScreen9x16ImageData missing on deployed app — deploy our-daily-beta.html before nightly IG`
          );
        }
        log('generating quilt-screen 9:16…');
        let quiltScreen9x16ImageData = await arch.generateInstagramQuiltScreen9x16ImageData(blocks, dateKey);
        if (!quiltScreen9x16ImageData) {
          throw new Error(`Quilt screen 9:16 image was not generated for ${dateKey}`);
        }
        let newspaperClippingImageData = null;
        if (arch.generateNewspaperClippingImageData) {
          log('generating newspaper clipping PNG…');
          newspaperClippingImageData = await arch.generateNewspaperClippingImageData(dateKey);
          if (!newspaperClippingImageData) {
            console.warn(`[nightly-ig:page] newspaper clipping empty for ${dateKey}`);
          }
        }
        const quiltExportMeta = arch._igQuiltSourceExportMeta || null;
        if (quiltExportMeta && !quiltExportMeta.quiltBlobFromLiveSvg) {
          console.warn(
            `[nightly-ig:page] quilt-screen 9:16 used non-SVG path: ${JSON.stringify(quiltExportMeta)}`
          );
        }
        let postLayoutBImageData = null;
        if (arch.generateInstagramPostLayoutBImage) {
          log('generating layout B post 4:5…');
          postLayoutBImageData = await arch.generateInstagramPostLayoutBImage(blocks, quote, dateKey);
        }
        let storyLayoutBImageData = null;
        if (arch.generateInstagramStoryLayoutBImage) {
          log('generating layout B story 9:16…');
          storyLayoutBImageData = await arch.generateInstagramStoryLayoutBImage(blocks, quote, dateKey);
        }
        if (!storyLayoutBImageData) {
          throw new Error(`Layout B story image was not generated for ${dateKey}`);
        }
        const expectedSpeakerImageUrl = pickString(
          quote.speakerCutoutUrl,
          quote.speaker_cutout_url,
          quote.speakerImageUrl,
          quote.speaker_image_url
        );
        if (expectedSpeakerImageUrl && !postLayoutBImageData) {
          throw new Error(`Speaker image expected for ${dateKey}, but layout-b.png was not generated`);
        }
        const aliasLayoutBSpeakerUrl = !!(expectedSpeakerImageUrl && postLayoutBImageData);

        const zapierCaption =
          typeof Utils.formatZapierCaptionFromQuote === 'function'
            ? Utils.formatZapierCaptionFromQuote(quote)
            : `${String(quote.text ?? quote.body ?? '').trim()} — ${String(quote.author ?? '').trim()}`.trim();
        const quiltFingerprint =
          typeof Utils.computeQuiltFingerprint === 'function' ? Utils.computeQuiltFingerprint(blocks) : '';

        let contributorCount = 1;
        try {
          const qSnap = await window.firestore.getDoc(window.firestore.doc(window.db, 'quilts', dateKey));
          if (qSnap.exists()) {
            contributorCount = Math.max(1, Number((qSnap.data() || {}).contributorCount) || 1);
          }
        } catch (_) {
          contributorCount = Math.max(1, Number(app.quiltEngine?.submissionCount) || 1);
        }

        log('uploading PNGs to Storage + Firestore…');
        const doc = await Utils.writeInstagramImagesDocForZapier({
          dateKey,
          instagramImage,
          quiltScreen9x16ImageData,
          newspaperClippingImageData,
          postLayoutBImageData,
          storyLayoutBImageData,
          aliasLayoutBSpeakerUrl,
          zapierCaption,
          quiltFingerprint,
          blockCount: blocks.length,
          contributorCount,
          markReadyForInstagram: true,
          storageCacheControl: 'no-store',
          exportDebug: quiltExportMeta
            ? { quiltScreen9x16: quiltExportMeta, nightly: true }
            : { nightly: true }
        });
        if (!doc.imageStorageUrl && !doc.classicUrl) {
          throw new Error('classic image URL missing after nightly upload');
        }
        if (
          expectedSpeakerImageUrl &&
          !doc.postLayoutBSpeakerImageStorageUrl &&
          !doc.layoutBSpeakerUrl
        ) {
          throw new Error('layout B speaker URL missing after nightly upload');
        }
        if (!doc.storyLayoutBImageStorageUrl && !doc.layoutBStoryUrl && !doc.storyLayoutBUrl) {
          throw new Error('layout B story URL missing after nightly upload');
        }
        if (!doc.quiltScreen9x16Url && !doc.quiltScreen9x16ImageStorageUrl) {
          throw new Error('quilt screen 9:16 URL missing after nightly upload');
        }
        return {
          dateKey,
          blockCount: blocks.length,
          contributorCount,
          readyForInstagram: !!doc.readyForInstagram,
          classicUrl: doc.classicUrl || doc.imageStorageUrl || '',
          quiltScreen9x16Url: doc.quiltScreen9x16Url || doc.quiltScreen9x16ImageStorageUrl || '',
          layoutBSpeakerUrl: doc.layoutBSpeakerUrl || doc.postLayoutBSpeakerImageStorageUrl || '',
          layoutBUrl: doc.layoutBUrl || doc.postLayoutBImageStorageUrl || '',
          storyLayoutBUrl:
            doc.storyLayoutBUrl || doc.layoutBStoryUrl || doc.storyLayoutBImageStorageUrl || ''
        };
      },
      { dateKey, strictQuote, clippingOnly }
    );

    if (clippingOnly) {
      console.log('[nightly-ig] clipping-only run complete (skipping full IG verify)');
      return {
        success: true,
        date: dateKey,
        attempt,
        clippingOnly: true,
        newspaperClippingUrl: result.newspaperClippingUrl || ''
      };
    }

    console.log('[nightly-ig] verifying API URLs…');
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
    if (!verify.classicImageUrl && !verify.imageUrl) {
      throw new Error('verify failed: classic image URL missing');
    }
    if (result.layoutBSpeakerUrl) {
      const speakerUrl = verify.layoutBSpeakerImageUrl || verify.postLayoutBSpeakerImageUrl;
      if (!speakerUrl) {
        throw new Error('verify failed: layout B speaker image URL missing');
      }
      const layoutBUrl = verify.layoutBImageUrl || verify.postLayoutBImageUrl || verify.postLayoutBPlainImageUrl;
      if (layoutBUrl && speakerUrl !== layoutBUrl) {
        throw new Error('verify failed: aliased layout B speaker URL must match layout-b.png URL');
      }
    }
    const verifyBlocks = Number(verify.blockCount) || 0;
    if (verifyBlocks <= 1) {
      throw new Error(`verify failed: blockCount=${verifyBlocks} (expected full quilt)`);
    }
    const storyUrl =
      verify.storyLayoutBImageUrl || verify.layoutBStoryImageUrl || verify.storyLayoutBUrl || '';
    if (!storyUrl) {
      throw new Error('verify failed: layout B story image URL missing');
    }
    const quiltScreen9x16Url =
      verify.quiltScreen9x16ImageUrl ||
      verify.quiltScreen9x16Url ||
      result.quiltScreen9x16Url ||
      '';
    if (!quiltScreen9x16Url) {
      throw new Error('verify failed: quilt screen 9:16 image URL missing');
    }

    return {
      success: true,
      date: dateKey,
      attempt,
      blockCount: result.blockCount,
      contributorCount: result.contributorCount,
      readyForInstagram: result.readyForInstagram,
      classicImageUrl: verify.classicImageUrl || verify.imageUrl,
      quiltScreen9x16ImageUrl: quiltScreen9x16Url,
      layoutBSpeakerImageUrl:
        verify.layoutBSpeakerImageUrl || verify.postLayoutBSpeakerImageUrl || result.layoutBSpeakerUrl,
      layoutBImageUrl: verify.layoutBImageUrl || verify.postLayoutBImageUrl || result.layoutBUrl,
      storyLayoutBImageUrl: storyUrl
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
  const now = new Date();
  const clippingOnly = String(process.env.NIGHTLY_IG_CLIPPING_ONLY || '').toLowerCase() === 'true';
  if (
    !clippingOnly &&
    !process.env.DATE_KEY &&
    process.env.NIGHTLY_IG_SKIP_SCHEDULE_GUARD !== 'true' &&
    now.getUTCHours() < 7
  ) {
    throw new Error(
      `Nightly IG must run at or after 07:00 UTC (after daily reset). Now=${now.toISOString()}. ` +
        'Set DATE_KEY to override or NIGHTLY_IG_SKIP_SCHEDULE_GUARD=true to bypass.'
    );
  }
  const dateKey =
    process.env.DATE_KEY || (clippingOnly ? getActiveQuiltDateKey(now) : getCompletedQuiltDateKey(now));
  const strictQuote = String(process.env.NIGHTLY_IG_STRICT_QUOTE || 'true').toLowerCase() !== 'false';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Invalid DATE_KEY: ${dateKey}`);
  }

  console.log(`[nightly-ig] dateKey=${dateKey}`);
  console.log(`[nightly-ig] app=${appUrl}`);
  console.log(`[nightly-ig] api=${apiBase}`);

  const outDir = process.env.NIGHTLY_IG_ARTIFACTS_DIR || path.join(process.cwd(), 'tmp', 'nightly-ig-artifacts');
  const maxAttempts = Number(process.env.NIGHTLY_IG_MAX_ATTEMPTS || '2');
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[nightly-ig] attempt ${attempt}/${maxAttempts}`);
      const result = await runNightlyIgAttempt({
        appUrl,
        apiBase,
        dateKey,
        attempt,
        outDir,
        strictQuote,
        clippingOnly
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    } catch (err) {
      lastError = err;
      console.error(`[nightly-ig] attempt ${attempt} failed:`, err && err.message ? err.message : err);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  throw lastError || new Error('Nightly IG images failed');
}

main().catch((err) => {
  console.error('[nightly-ig] failure:', err && err.stack ? err.stack : err);
  process.exit(1);
});
