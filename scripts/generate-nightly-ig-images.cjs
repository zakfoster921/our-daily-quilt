#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Nightly Zapier stills only (no reel): classic + layout B + layout B speaker.
 * Loads the live app in Playwright, reads quilts/{dateKey} from Firestore, uploads PNGs,
 * sets instagram-images/{dateKey}.readyForInstagram = true.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

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

async function runNightlyIgAttempt({ appUrl, apiBase, dateKey, attempt, outDir, strictQuote }) {
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
      async ({ dateKey, strictQuote }) => {
        if (!window.app) throw new Error('window.app not ready');
        if (typeof Utils === 'undefined' || typeof Utils.writeInstagramImagesDocForZapier !== 'function') {
          throw new Error('Utils.writeInstagramImagesDocForZapier missing');
        }
        const app = window.app;
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

        const arch = app.archiveService;
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

        const instagramImage = await arch.generateInstagramImage(blocks);
        let postLayoutBImageData = null;
        if (arch.generateInstagramPostLayoutBImage) {
          postLayoutBImageData = await arch.generateInstagramPostLayoutBImage(blocks, quote, dateKey);
        }
        let postLayoutBSpeakerImageData = null;
        if (arch.generateInstagramPostLayoutBSpeakerImage) {
          postLayoutBSpeakerImageData = await arch.generateInstagramPostLayoutBSpeakerImage(
            blocks,
            quote,
            dateKey
          );
        }
        const expectedSpeakerImageUrl = pickString(
          quote.speakerCutoutUrl,
          quote.speaker_cutout_url,
          quote.speakerImageUrl,
          quote.speaker_image_url
        );
        if (expectedSpeakerImageUrl && !postLayoutBSpeakerImageData) {
          throw new Error(`Speaker image expected for ${dateKey}, but layout-b-speaker was not generated`);
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

        const doc = await Utils.writeInstagramImagesDocForZapier({
          dateKey,
          instagramImage,
          postLayoutBImageData,
          postLayoutBSpeakerImageData,
          zapierCaption,
          quiltFingerprint,
          blockCount: blocks.length,
          contributorCount,
          markReadyForInstagram: true,
          storageCacheControl: 'no-store'
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
        return {
          dateKey,
          blockCount: blocks.length,
          contributorCount,
          readyForInstagram: !!doc.readyForInstagram,
          classicUrl: doc.classicUrl || doc.imageStorageUrl || '',
          layoutBSpeakerUrl: doc.layoutBSpeakerUrl || doc.postLayoutBSpeakerImageStorageUrl || '',
          layoutBUrl: doc.layoutBUrl || doc.postLayoutBImageStorageUrl || ''
        };
      },
      { dateKey, strictQuote }
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
    if (!verify.classicImageUrl && !verify.imageUrl) {
      throw new Error('verify failed: classic image URL missing');
    }
    if (!verify.layoutBSpeakerImageUrl && !verify.postLayoutBSpeakerImageUrl) {
      throw new Error('verify failed: layout B speaker image URL missing');
    }
    const verifyBlocks = Number(verify.blockCount) || 0;
    if (verifyBlocks <= 1) {
      throw new Error(`verify failed: blockCount=${verifyBlocks} (expected full quilt)`);
    }

    return {
      success: true,
      date: dateKey,
      attempt,
      blockCount: result.blockCount,
      contributorCount: result.contributorCount,
      readyForInstagram: result.readyForInstagram,
      classicImageUrl: verify.classicImageUrl || verify.imageUrl,
      layoutBSpeakerImageUrl:
        verify.layoutBSpeakerImageUrl || verify.postLayoutBSpeakerImageUrl || result.layoutBSpeakerUrl,
      layoutBImageUrl: verify.layoutBImageUrl || verify.postLayoutBImageUrl || result.layoutBUrl
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
  const dateKey = process.env.DATE_KEY || getCompletedQuiltDateKey();
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
        strictQuote
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
