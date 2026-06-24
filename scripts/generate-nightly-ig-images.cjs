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

/** Compare composed line 1 to quote body — keyword emphasis renders ALL CAPS but words must match. */
function clippingFirstLineMatchesQuote(gotLine, expectedText) {
  const normWord = (w) =>
    String(w || '')
      .replace(/[.;,:!?]+$/, '')
      .trim()
      .toLowerCase();
  const gotWords = String(gotLine || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const expWords = String(expectedText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!gotWords.length || !expWords.length) return true;
  for (let i = 0; i < gotWords.length; i += 1) {
    if (normWord(gotWords[i]) !== normWord(expWords[i] || '')) return false;
  }
  return true;
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
  let lastPageError = null;
  page.on('console', (msg) => {
    const text = msg.text();
    if (/resizeobserver loop completed/i.test(text)) return;
    if (/Failed to save to Firestore, using localStorage fallback/i.test(text)) return;
    if (/Failed to load resource/i.test(text)) return;
    if (
      text.includes('[nightly-ig:page]') ||
      text.includes('[archive]') ||
      text.includes('QuiltNewspaperClipping') ||
      text.includes('Firestore') ||
      text.includes('Storage') ||
      msg.type() === 'error' ||
      (msg.type() === 'warning' &&
        (text.includes('[nightly-ig') ||
          text.includes('[archive]') ||
          text.includes('QuiltNewspaperClipping') ||
          text.includes('Firestore') ||
          text.includes('Storage')))
    ) {
      console.log(`[nightly-ig:browser] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    lastPageError = err;
    console.error('[nightly-ig:browser] pageerror:', err?.message || err);
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

    console.log('[nightly-ig] loading Firestore quote catalog + pinning assignment…');
    await page.evaluate(async ({ dateKey, apiBase }) => {
      const qs = window.app?.quoteService;
      if (!qs?.loadQuotesFromFirestore) {
        throw new Error('quoteService.loadQuotesFromFirestore missing');
      }
      const catalogOk = await qs.loadQuotesFromFirestore({ requireServer: true });
      if (!catalogOk) {
        throw new Error('Firestore quote catalog failed to load (keyword / first_line_count need server catalog)');
      }
      const indexesOk = await qs.regenerateShuffledIndexes?.({ requireServer: true });
      if (indexesOk === false) {
        throw new Error('Firestore shuffled quote indexes failed to load');
      }
      let pinned = null;
      let resolution = '';
      if (typeof qs.resolveQuoteForCalendarKeyFresh === 'function') {
        const fresh = await qs.resolveQuoteForCalendarKeyFresh(dateKey);
        pinned = fresh?.quote || null;
        resolution = String(fresh?.resolution || '').trim();
      }
      if (!pinned) {
        pinned = await qs.resolveAndPinCalendarKey?.(dateKey, { requireLive: true });
        resolution = resolution || 'resolveAndPinCalendarKey';
      }
      if (!pinned) {
        throw new Error(`Could not pin quote assignment for ${dateKey}`);
      }
      const author = String(pinned.author || '').trim();
      const preview = String(pinned.text ?? pinned.body ?? '').trim().slice(0, 72);
      console.log(
        `[nightly-ig:page] pinned ${dateKey}: author=${author || '?'} resolution=${resolution || '?'} text="${preview}…"`
      );
      if (typeof qs.offsetQuoteCalendarKey === 'function') {
        const yKey = qs.offsetQuoteCalendarKey(dateKey, -1);
        const tKey = qs.offsetQuoteCalendarKey(dateKey, 1);
        const resolveNeighbor = async (key) => {
          if (!key) return null;
          if (typeof qs.resolveQuoteForCalendarKeyFresh === 'function') {
            const fresh = await qs.resolveQuoteForCalendarKeyFresh(key);
            if (fresh?.quote?.text) return fresh.quote;
          }
          return qs.resolveAndPinCalendarKey?.(key, { requireLive: true }) || null;
        };
        const [y, t] = await Promise.all([resolveNeighbor(yKey), resolveNeighbor(tKey)]);
        const line = (q) => String(q?.text ?? q?.body ?? '').trim();
        console.log(
          `[nightly-ig:page] peek neighbors for ${dateKey}: yesterday=${line(y) ? 'ok' : 'empty'} tomorrow=${line(t) ? 'ok' : 'empty'}`
        );
      }
      void apiBase;
    }, { dateKey, apiBase });

    console.log(
      `[nightly-ig] generating ${clippingOnly ? 'newspaper clipping' : 'images'} for ${dateKey} (browser work often 5–12 min; logs tagged [nightly-ig:page])…`
    );
    page.setDefaultTimeout(evaluateTimeoutMs);
    const minNewspaperClippingBytes = Math.max(
      120000,
      Number(process.env.NIGHTLY_MIN_NEWSPAPER_CLIPPING_BYTES) || 140000
    );
    const contributorCloudTimeoutMs = Math.max(
      30000,
      Number(process.env.NIGHTLY_IG_CONTRIBUTOR_CLOUD_TIMEOUT_MS) || 120000
    );
    const result = await page.evaluate(
      async ({
        dateKey,
        strictQuote,
        clippingOnly,
        minNewspaperClippingBytes,
        contributorCloudTimeoutMs,
        apiBase
      }) => {
        const log = (step) => console.log(`[nightly-ig:page] ${step}`);
        const timed = async (label, fn) => {
          const t0 = performance.now();
          const out = await fn();
          log(`${label} done in ${Math.round(performance.now() - t0)}ms`);
          return out;
        };
        const isNightlyLabPeekCompose = (composeMeta) => {
          const meta = composeMeta && typeof composeMeta === 'object' ? composeMeta : {};
          return (
            meta.composeAttemptLabel === 'lab-peek' ||
            meta.composePipeline === 'labPeek' ||
            meta.exportDiagnostics?.paperTextureUrl == null
          );
        };
        const assertNewspaperPeekComposeMeta = (composeMeta, clippingBytes, minClippingBytes) => {
          const meta = composeMeta && typeof composeMeta === 'object' ? composeMeta : {};
          const bytes = Math.max(0, Number(clippingBytes) || 0);
          const standardMin = Math.max(120000, Number(minClippingBytes) || 140000);
          // labPeek skips warm paper JPEG — short quotes legitimately compress under standardMin.
          const minBytes = isNightlyLabPeekCompose(meta) ? 80000 : standardMin;
          if (bytes < minBytes) {
            throw new Error(
              `Newspaper clipping PNG too small (${bytes} bytes < ${minBytes}) — likely flat export without grain/halftone`
            );
          }
          if (meta.peekCrop !== true) {
            const ratio = Number(meta.peekWidthRatio) || 0;
            const centerW = Number(meta.centerOnlyWidth) || 0;
            const peekW = Number(meta.clippedWidth) || 0;
            throw new Error(
              `Newspaper clipping is not a 3-column peek (peekCrop=false; width ${peekW}px vs center-only ${centerW}px; ratio ${ratio.toFixed(2)}; need ≥1.08)`
            );
          }
          if (!meta.hasYesterdayText && !meta.hasTomorrowText) {
            throw new Error(
              'Newspaper clipping has no yesterday/tomorrow quote text — side columns will be empty; run Notion quote sync and re-pin assignments'
            );
          }
          const expectedFlc = Number(meta.firstLineCount);
          const gotUnits = Number(meta.firstLineUnits);
          const lineText = String(meta.firstLineText || '').trim();
          const sentenceEndPrefix =
            Number.isFinite(expectedFlc) &&
            expectedFlc > 0 &&
            Number.isFinite(gotUnits) &&
            gotUnits > 0 &&
            gotUnits < expectedFlc &&
            /[.;]\s*$/.test(lineText) &&
            !/[.;]\s+\S/.test(lineText) &&
            !/[.;][A-Za-z]/.test(lineText);
          if (Number.isFinite(expectedFlc) && expectedFlc > 0 && Number.isFinite(gotUnits) && gotUnits > 0) {
            if (meta.hasHardLineBreaks) {
              log(`poem layout: skipping first_line_count check (${gotUnits} words on line 1)`);
            } else if (gotUnits !== expectedFlc && !sentenceEndPrefix) {
              throw new Error(
                `Newspaper clipping first line has ${gotUnits} words but first_line_count=${expectedFlc} (line 1: "${lineText}")`
              );
            }
          }
        };
        if (!window.app) throw new Error('window.app not ready');
        if (typeof Utils === 'undefined' || typeof Utils.writeInstagramImagesDocForZapier !== 'function') {
          throw new Error('Utils.writeInstagramImagesDocForZapier missing');
        }
        const app = window.app;
        if (app.quoteService?.resolveQuoteForCalendarKeyFresh) {
          const fresh = await app.quoteService.resolveQuoteForCalendarKeyFresh(dateKey);
          const q = fresh?.quote;
          const author = String(q?.author || '').trim();
          const preview = String(q?.text ?? q?.body ?? '').trim().slice(0, 72);
          log(
            `compose pin ${dateKey}: author=${author || '?'} resolution=${String(fresh?.resolution || '').trim() || '?'} text="${preview}…"`
          );
        } else if (app.quoteService?.getQuoteResolvedForInstagramDateKey) {
          const pinned = await app.quoteService.getQuoteResolvedForInstagramDateKey(dateKey);
          const kw = String(pinned?.keyword ?? pinned?.keywordSnapshot ?? '').trim();
          log(`pinned quote for ${dateKey}; keyword=${kw || '(missing)'}`);
        }
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
          const clippingBytes = Math.max(
            0,
            Math.round(((String(newspaperClippingImageData).length - 22) * 3) / 4)
          );
          const composeMeta = arch._lastNewspaperClippingComposeMeta || null;
          const expected = app.quoteService?._pinnedByDateKey?.[dateKey];
          const expectedText = String(expected?.text ?? expected?.body ?? '').trim();
          const expectedAuthor = String(expected?.author || '').trim();
          const gotLine = String(composeMeta?.firstLineText || '').trim();
          if (expectedText && gotLine && !clippingFirstLineMatchesQuote(gotLine, expectedText)) {
            throw new Error(
              `Newspaper clipping center quote mismatch for ${dateKey}: expected ${expectedAuthor || 'quote'} ("${expectedText.slice(0, 40)}…") but first line is "${gotLine}"`
            );
          }
          log(
            `newspaper clipping PNG ~${clippingBytes} bytes; rev=${globalThis.QuiltNewspaperClipping?.CLIPPING_EXPORT_REV || '?'}; meta=${JSON.stringify(composeMeta || {})}`
          );
          if (composeMeta?.composeAttempt > 0) {
            throw new Error(
              `Newspaper clipping used compose fallback "${composeMeta.composeAttemptLabel}" — paper texture dropped (canvas taint)`
            );
          }
          if (
            composeMeta?.exportDiagnostics?.paperLoaded === false &&
            !isNightlyLabPeekCompose(composeMeta)
          ) {
            throw new Error(
              'Newspaper clipping paper texture did not load — check assets/quilt-paper-card-texture.png on APP_URL'
            );
          }
          assertNewspaperPeekComposeMeta(composeMeta, clippingBytes, minNewspaperClippingBytes);
          log('uploading newspaper clipping PNG to Storage + Firestore…');
          if (typeof Utils?.writeInstagramImagesDocForZapier !== 'function') {
            throw new Error('Utils.writeInstagramImagesDocForZapier missing — deploy utils-instagram.js');
          }
          const doc = await Utils.writeInstagramImagesDocForZapier({
            dateKey,
            newspaperClippingImageData,
            storageCacheControl: 'no-store'
          });
          const clippingUrl = String(
            doc.newspaperClippingUrl || doc.newspaperClippingImageStorageUrl || ''
          ).trim();
          log(`upload complete; newspaperClippingUrl=${clippingUrl}`);
          log(`newspaperClippingExportRev=${String(doc.newspaperClippingExportRev || '').trim()}`);
          if (!doc.newspaperClippingUrl && !doc.newspaperClippingImageStorageUrl) {
            throw new Error('newspaperClippingUrl missing after upload');
          }
          return {
            dateKey,
            clippingOnly: true,
            newspaperClippingUrl: doc.newspaperClippingUrl || doc.newspaperClippingImageStorageUrl || ''
          };
        }

        let blocks = app.quiltEngine?.blocks || [];
        let contributors = [];
        const getFirestoreQuiltForDateKey = async (dk) => {
          try {
            if (!window.db || !window.firestore || typeof window.firestore.getDoc !== 'function') return null;
            const qRef = window.firestore.doc(window.db, 'quilts', dk);
            const qSnap = await window.firestore.getDoc(qRef);
            if (!qSnap.exists()) return null;
            const data = qSnap.data() || {};
            const dayBlocks = Array.isArray(data.blocks) ? data.blocks : [];
            const dayContributors = Array.isArray(data.contributors) ? data.contributors : [];
            if (!dayBlocks.length) return null;
            return {
              blocks: dayBlocks,
              contributors: dayContributors,
              contributorCount: Math.max(1, Number(data.contributorCount) || dayContributors.length || 1)
            };
          } catch (_) {
            return null;
          }
        };
        const dateQuilt = await getFirestoreQuiltForDateKey(dateKey);
        if (dateQuilt && Array.isArray(dateQuilt.blocks) && dateQuilt.blocks.length > 0) {
          blocks = dateQuilt.blocks;
          contributors = Array.isArray(dateQuilt.contributors) ? dateQuilt.contributors : [];
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
          const retry = await getFirestoreQuiltForDateKey(dateKey);
          if (retry && Array.isArray(retry.blocks) && retry.blocks.length > 0) {
            blocks = retry.blocks;
            contributors = Array.isArray(retry.contributors) ? retry.contributors : contributors;
          }
        }
        if (!Array.isArray(blocks) || blocks.length <= 1) {
          throw new Error(
            `Need >1 block for ${dateKey}, found ${blocks.length || 0}. Missing/empty quilts/${dateKey} in Firestore.`
          );
        }

        log(`loaded ${blocks.length} blocks for ${dateKey}; firestore contributor names=${contributors.length}`);
        if (typeof app.applyQuiltDataFromPayload === 'function') {
          await app.applyQuiltDataFromPayload({
            blocks,
            contributors,
            dateKey,
            date: dateKey,
            contributorCount:
              dateQuilt?.contributorCount || Math.max(1, contributors.length || blocks.length)
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
        const pickNumber = (...values) => {
          for (const value of values) {
            const n = Number(value);
            if (Number.isFinite(n) && n > 0) return Math.round(n);
          }
          return null;
        };
        const quoteFromFirestoreData = (data) => {
          if (!data || typeof data !== 'object') return null;
          const text = pickString(data.text, data.quote, data.body, data.textSnapshot);
          const author = pickString(data.author, data.authorSnapshot);
          if (!text && !author) return null;
          const out = { text, body: text, author };
          const fieldMap = {
            keyword: [data.keyword, data.keywordSnapshot],
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
          const flc = pickNumber(
            data.first_line_count,
            data.firstLineCount,
            data.firstLineCountSnapshot,
            data.first_line_count_snapshot,
            data.notionProperties?.first_line_count?.value,
            data.notionProperties?.firstLineCount?.value
          );
          if (flc != null) {
            out.first_line_count = flc;
            out.firstLineCount = flc;
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

        log('prewarming shared Instagram quilt source…');
        await timed('quilt source prewarm', () =>
          arch.getInstagramQuiltSourceBlob(blocks, {
            dateKey,
            skipFilmGrain: true,
            exportModeLabel: 'nightly_ig_shared_source'
          })
        );

        const blobToDataUrl = async (blob, label) => {
          if (!blob) throw new Error(`${label}: compose returned null`);
          if (typeof Utils.blobToDataUrl !== 'function') {
            throw new Error('Utils.blobToDataUrl missing');
          }
          const dataUrl = await Utils.blobToDataUrl(blob);
          if (!dataUrl) throw new Error(`${label}: empty data URL`);
          return dataUrl;
        };

        log('generating integrated IG carousel (layout B + quilt pair + speaker seam)…');
        if (!arch.buildIntegratedInstagramCarouselImageData) {
          throw new Error(
            'buildIntegratedInstagramCarouselImageData missing on deployed app — deploy our-daily-beta.html before nightly IG'
          );
        }
        if (typeof arch._clearLayoutBStoryRefStripPlan === 'function') {
          arch._clearLayoutBStoryRefStripPlan();
        }
        let storyLayoutBImageData = null;
        if (arch.generateInstagramStoryLayoutBBlob) {
          log('generating layout B story 9:16…');
          const storyBlob = await timed('layout B story', () =>
            arch.generateInstagramStoryLayoutBBlob(blocks, quote, dateKey)
          );
          const refCount = Array.isArray(arch._layoutBStoryRefStripPlan)
            ? arch._layoutBStoryRefStripPlan.length
            : 0;
          log(`layout B story strip ref: ${refCount} strips`);
          storyLayoutBImageData = await blobToDataUrl(storyBlob, 'layout B story');
        } else if (arch.generateInstagramStoryLayoutBImage) {
          log('generating layout B story 9:16…');
          storyLayoutBImageData = await timed('layout B story', () =>
            arch.generateInstagramStoryLayoutBImage(blocks, quote, dateKey)
          );
        }
        if (!storyLayoutBImageData) {
          throw new Error(`Layout B story image was not generated for ${dateKey}`);
        }
        const integratedCarousel = await timed('integrated IG carousel', () =>
          arch.buildIntegratedInstagramCarouselImageData(blocks, contributors, quote, dateKey)
        );
        if (
          !integratedCarousel?.carouselSlide1 ||
          !integratedCarousel?.carouselSlide2 ||
          !integratedCarousel?.carouselSlide3
        ) {
          throw new Error(`Integrated carousel slides were not generated for ${dateKey}`);
        }
        const carouselSlide1ImageData = integratedCarousel.carouselSlide1;
        const carouselSlide2ImageData = integratedCarousel.carouselSlide2;
        const carouselSlide3ImageData = integratedCarousel.carouselSlide3;
        if (integratedCarousel.meta) {
          const m = integratedCarousel.meta;
          log(
            `integrated carousel meta names=${m.nameCount ?? '?'} clip=${m.clippingContentWidth ?? '?'}×${m.clippingContentHeight ?? '?'} rev=${m.contributorList?.exportRev ?? m.exportRev ?? '?'}`
          );
          if (m.speakerSeam?.overlapPx) {
            log(
              `carousel speaker seam overlap=${m.speakerSeam.overlapPx}px (${Math.round((m.speakerSeam.overlapFraction || 0) * 100)}% of cutout width)`
            );
          } else {
            log('carousel speaker seam skipped (no cutout or compose unavailable)');
          }
        }
        log('integrated carousel: slide 1 = layout B (+ speaker seam), slides 2–3 = quilt pair');
        if (!arch.generateInstagramQuiltScreen9x16ImageData) {
          throw new Error(
            `generateInstagramQuiltScreen9x16ImageData missing on deployed app — deploy our-daily-beta.html before nightly IG`
          );
        }
        log('generating quilt-screen 9:16…');
        let quiltScreen9x16ImageData = await timed('quilt-screen 9:16', () =>
          arch.generateInstagramQuiltScreen9x16ImageData(blocks, dateKey)
        );
        if (!quiltScreen9x16ImageData) {
          throw new Error(`Quilt screen 9:16 image was not generated for ${dateKey}`);
        }
        let newspaperClippingImageData = null;
        if (arch.generateNewspaperClippingImageData) {
          log('generating newspaper clipping PNG…');
          newspaperClippingImageData = await timed('newspaper clipping', () =>
            arch.generateNewspaperClippingImageData(dateKey)
          );
          if (!newspaperClippingImageData) {
            throw new Error(`Newspaper clipping was not generated for ${dateKey}`);
          }
          const clippingBytes = Math.max(
            0,
            Math.round(((String(newspaperClippingImageData).length - 22) * 3) / 4)
          );
          const composeMeta = arch._lastNewspaperClippingComposeMeta || null;
          log(
            `newspaper clipping PNG ~${clippingBytes} bytes; rev=${globalThis.QuiltNewspaperClipping?.CLIPPING_EXPORT_REV || '?'}; meta=${JSON.stringify(composeMeta || {})}`
          );
          assertNewspaperPeekComposeMeta(composeMeta, clippingBytes, minNewspaperClippingBytes);
        }
        const quiltExportMeta = arch._igQuiltSourceExportMeta || null;
        if (quiltExportMeta && !quiltExportMeta.quiltBlobFromLiveSvg) {
          console.warn(
            `[nightly-ig:page] quilt-screen 9:16 used non-SVG path: ${JSON.stringify(quiltExportMeta)}`
          );
        }
        let postLayoutBSpeakerImageData = null;
        const expectedSpeakerImageUrl = pickString(
          quote.speakerCutoutUrl,
          quote.speaker_cutout_url,
          quote.speakerImageUrl,
          quote.speaker_image_url
        );
        if (expectedSpeakerImageUrl && arch.generateInstagramPostLayoutBSpeakerImage) {
          log('generating layout B speaker hero post 4:5…');
          postLayoutBSpeakerImageData = await arch.generateInstagramPostLayoutBSpeakerImage(
            blocks,
            quote,
            dateKey
          );
        }
        let contributorCloudImageData = null;
        if (!arch.generateInstagramContributorCloudImage) {
          log('contributor cloud skipped (generateInstagramContributorCloudImage missing on ArchiveService)');
        } else if (!contributors.length) {
          log('contributor cloud skipped (quilts/{dateKey}.contributors is empty)');
        } else if (typeof globalThis.composeContributorCloudPostFromQuiltBlob !== 'function') {
          log('contributor cloud skipped (contributor-cloud-compose.js did not load)');
        } else {
          log(`generating contributor cloud post 4:5 (${contributors.length} names)…`);
          try {
            contributorCloudImageData = await timed('contributor cloud', () =>
              Promise.race([
                arch.generateInstagramContributorCloudImage(blocks, contributors, dateKey),
                new Promise((_, reject) =>
                  setTimeout(
                    () =>
                      reject(
                        new Error(`contributor cloud timed out after ${contributorCloudTimeoutMs}ms`)
                      ),
                    contributorCloudTimeoutMs
                  )
                )
              ])
            );
          } catch (cloudErr) {
            log(`contributor cloud skipped: ${cloudErr?.message || cloudErr}`);
          }
          if (!contributorCloudImageData) {
            log('contributor cloud failed (compose returned null — check browser console for ArchiveService error)');
          } else {
            const ccBytes = Math.max(
              0,
              Math.round(((String(contributorCloudImageData).length - 22) * 3) / 4)
            );
            log(`contributor cloud PNG ~${ccBytes} bytes`);
          }
        }

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
        const uploadPayload = {
          dateKey,
          carouselSlide1ImageData,
          carouselSlide2ImageData,
          carouselSlide3ImageData,
          quiltScreen9x16ImageData,
          newspaperClippingImageData,
          postLayoutBSpeakerImageData,
          storyLayoutBImageData,
          contributorCloudImageData,
          aliasLayoutBSpeakerUrl: false,
          zapierCaption,
          quiltFingerprint,
          blockCount: blocks.length,
          contributorCount,
          markReadyForInstagram: true
        };
        let doc;
        if (typeof Utils.writeInstagramImagesDocForZapierViaServer === 'function' && apiBase) {
          doc = await timed('upload + Firestore (server admin)', () =>
            Utils.writeInstagramImagesDocForZapierViaServer({
              ...uploadPayload,
              apiBaseOverride: apiBase
            })
          );
        } else if (typeof Utils.writeInstagramImagesDocForZapier === 'function') {
          doc = await timed('upload + Firestore (browser SDK)', () =>
            Utils.writeInstagramImagesDocForZapier({
              ...uploadPayload,
              storageCacheControl: 'no-store',
              exportDebug: quiltExportMeta
                ? { quiltScreen9x16: quiltExportMeta, nightly: true }
                : { nightly: true }
            })
          );
        } else {
          throw new Error('No Instagram upload helper available');
        }
        if (!doc.carouselSlide1Url && !doc.classicUrl) {
          throw new Error('carousel slide 1 (layout B) URL missing after nightly upload');
        }
        if (!doc.carouselSlide2Url) {
          throw new Error('carousel slide 2 URL missing after nightly upload');
        }
        if (!doc.carouselSlide3Url) {
          throw new Error('carousel slide 3 URL missing after nightly upload');
        }
        if (!doc.storyLayoutBImageStorageUrl && !doc.layoutBStoryUrl && !doc.storyLayoutBUrl) {
          throw new Error('layout B story URL missing after nightly upload');
        }
        if (!doc.quiltScreen9x16Url && !doc.quiltScreen9x16ImageStorageUrl) {
          throw new Error('quilt screen 9:16 URL missing after nightly upload');
        }
        const contributorCloudUrl = String(
          doc.contributorCloudUrl || doc.contributorCloudImageStorageUrl || ''
        ).trim();
        if (contributorCloudUrl) {
          log(`uploaded contributor-cloud.png → ${contributorCloudUrl}`);
        }
        return {
          dateKey,
          blockCount: blocks.length,
          contributorCount,
          contributorNameCount: contributors.length,
          readyForInstagram: !!doc.readyForInstagram,
          classicUrl: doc.carouselSlide1Url || doc.classicUrl || doc.imageStorageUrl || '',
          carouselSlide1Url: doc.carouselSlide1Url || doc.classicUrl || '',
          carouselSlide2Url: doc.carouselSlide2Url || '',
          carouselSlide3Url: doc.carouselSlide3Url || '',
          quiltScreen9x16Url: doc.quiltScreen9x16Url || doc.quiltScreen9x16ImageStorageUrl || '',
          layoutBUrl: doc.layoutBUrl || doc.carouselSlide1Url || doc.postLayoutBImageStorageUrl || '',
          storyLayoutBUrl:
            doc.storyLayoutBUrl || doc.layoutBStoryUrl || doc.storyLayoutBImageStorageUrl || '',
          contributorCloudUrl,
          hasContributorCloud: !!contributorCloudUrl
        };
      },
      { dateKey, strictQuote, clippingOnly, minNewspaperClippingBytes, contributorCloudTimeoutMs, apiBase }
    );

    if (clippingOnly) {
      console.log('[nightly-ig] clipping-only run complete (skipping full IG verify)');
      const newspaperClippingUrl = String(result.newspaperClippingUrl || '').trim();
      console.log(`[nightly-ig] newspaperClippingUrl=${newspaperClippingUrl || '(missing)'}`);
      return {
        success: true,
        date: dateKey,
        attempt,
        clippingOnly: true,
        newspaperClippingUrl
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
    if (!verify.carouselSlide1Url && !verify.classicImageUrl && !verify.imageUrl) {
      throw new Error('verify failed: carousel slide 1 (layout B) URL missing');
    }
    if (!verify.carouselSlide2Url) {
      throw new Error('verify failed: carousel slide 2 URL missing');
    }
    if (!verify.carouselSlide3Url) {
      throw new Error('verify failed: carousel slide 3 URL missing');
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
    const contributorCloudImageUrl =
      verify.contributorCloudImageUrl || verify.contributorCloudUrl || '';
    if (contributorCloudImageUrl) {
      console.log(`[nightly-ig] contributorCloudImageUrl=${contributorCloudImageUrl}`);
    } else {
      console.log('[nightly-ig] contributor cloud not present (skipped or no contributor names)');
    }

    return {
      success: true,
      date: dateKey,
      attempt,
      blockCount: result.blockCount,
      contributorCount: result.contributorCount,
      readyForInstagram: result.readyForInstagram,
      classicImageUrl: verify.carouselSlide1Url || verify.classicImageUrl || verify.imageUrl,
      carouselSlide1Url: verify.carouselSlide1Url || verify.classicImageUrl || verify.imageUrl || '',
      carouselSlide2Url: verify.carouselSlide2Url || '',
      carouselSlide3Url: verify.carouselSlide3Url || '',
      quiltScreen9x16ImageUrl: quiltScreen9x16Url,
      layoutBImageUrl:
        verify.layoutBImageUrl ||
        verify.postLayoutBImageUrl ||
        verify.layoutBPlainImageUrl ||
        verify.carouselSlide1Url ||
        result.layoutBUrl,
      layoutBPlainImageUrl: verify.layoutBPlainImageUrl || verify.postLayoutBPlainImageUrl || '',
      layoutBSpeakerImageUrl:
        verify.layoutBSpeakerImageUrl || verify.postLayoutBSpeakerImageUrl || '',
      storyLayoutBImageUrl: storyUrl,
      contributorCloudImageUrl,
      contributorCloudUrl: contributorCloudImageUrl || result.contributorCloudUrl || '',
      hasContributorCloud: !!(contributorCloudImageUrl || result.contributorCloudUrl)
    };
  } catch (err) {
    await writeFailureArtifacts(page, attempt, outDir);
    const pe = lastPageError?.message || (lastPageError ? String(lastPageError) : '');
    if (pe) {
      throw new Error(`${err?.message || err} (browser: ${pe})`);
    }
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
      console.log('[nightly-ig] result:', JSON.stringify(result, null, 2));
      if (result.newspaperClippingUrl) {
        console.log(`[nightly-ig] DONE newspaperClippingUrl=${result.newspaperClippingUrl}`);
      }
      if (result.contributorCloudUrl) {
        console.log(`[nightly-ig] DONE contributorCloudUrl=${result.contributorCloudUrl}`);
      } else if (!result.clippingOnly) {
        console.log(
          `[nightly-ig] contributor cloud not uploaded for ${result.dateKey} (firestore names=${result.contributorNameCount ?? '?'})`
        );
      }
      return;
    } catch (err) {
      lastError = err;
      const msg = err && err.message ? err.message : String(err);
      console.error(`[nightly-ig] attempt ${attempt} failed:`, msg);
      console.error(`::error::${msg}`);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  throw lastError || new Error('Nightly IG images failed');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[nightly-ig] failure:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = {
  runNightlyIgAttempt,
  getActiveQuiltDateKey,
  getCompletedQuiltDateKey
};
