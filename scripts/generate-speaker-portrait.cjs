#!/usr/bin/env node
/**
 * Pre-bakes today's speaker portrait (the real in-app widget, all layers) into one flat PNG so phones
 * don't run the tone pass / layer stack. Renders the real widget in headless Chromium at phone size.
 *
 *   PREVIEW=1 (default)  → saves screenshots to ARTIFACTS_DIR only; uploads nothing.
 *   PREVIEW=0            → also uploads to Storage and writes speakerPortraitBaked* on instagram-images/{dateKey}.
 *
 * Env: APP_URL, DATE_KEY (optional), PREVIEW, ARTIFACTS_DIR, GOOGLE_APPLICATION_CREDENTIALS_JSON, FIREBASE_STORAGE_BUCKET
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8765/our-daily-beta.html';
const PREVIEW = String(process.env.PREVIEW ?? '1') !== '0';
const OUT = process.env.ARTIFACTS_DIR || 'tmp/speaker-portrait';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[speaker-portrait]', ...a);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('[speaker-portrait:pageerror]', e?.message || e));
  page.on('console', (m) => {
    const t = m.text();
    if (/speaker|cutout/i.test(t) && m.type() !== 'log') console.log('[speaker-portrait:browser]', t.slice(0, 300));
  });
  try {
    log('loading', APP_URL);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!window.app && window.app._portalQuiltLoaded === true, undefined, { timeout: 180000 });

    const info = await page.evaluate(async () => {
      const app = window.app;
      const qs = app.quoteService;
      const dateKey = qs.getQuoteCalendarKeyNow();
      let quote = null;
      for (let i = 0; i < 60 && !quote?.text; i++) {
        quote = (await qs.getTodayQuote?.()) || app.getEffectiveQuiltQuote?.() || null;
        if (!quote?.text) await new Promise((r) => setTimeout(r, 1000));
      }
      try { quote = (await qs.hydrateSpeakerCutoutFieldsForCalendarKey(dateKey, quote)) || quote; } catch (_) {}
      try { quote = (await qs._mergeSpeakerFieldsFromFirestoreSource?.(dateKey, quote)) || quote; } catch (_) {}
      // Show the quilt screen so the widget has real layout, then paint the speaker.
      const ui = app.uiService || window.uiService;
      try { ui?.showScreen?.('screen-quilt', { skipQuiltScrollCue: true }); } catch (_) {}
      document.getElementById('screen-quilt')?.classList.add('active');
      app.refreshQuoteSpeakerWidget(quote);
      return {
        dateKey,
        hasQuote: !!quote?.text,
        cutoutUrl: String(quote?.speakerCutoutUrl || quote?.cutoutUrl || '').trim(),
        speaker: String(quote?.speaker || quote?.author || '').trim()
      };
    });
    log('quote', JSON.stringify(info));
    const dateKey = process.env.DATE_KEY || info.dateKey;

    // Wait for the portrait image to load and the layers to settle.
    await page.waitForFunction(() => {
      const wrap = document.getElementById('quoteSpeakerImageWrap');
      const img = document.getElementById('quoteSpeakerImage');
      return !!wrap && !wrap.hidden && !!img && !img.hidden && img.complete && img.naturalWidth > 0;
    }, undefined, { timeout: 90000 });
    await page.waitForTimeout(6000);

    const widget = page.locator('#quoteSpeakerWidget');
    const portrait = page.locator('.quote-speaker-portrait-wrap').first();
    await widget.scrollIntoViewIfNeeded();
    await widget.screenshot({ path: path.join(OUT, `widget-${dateKey}.png`) });
    await portrait.screenshot({ path: path.join(OUT, `portrait-${dateKey}.png`), omitBackground: true });
    const box = await portrait.boundingBox();
    fs.writeFileSync(path.join(OUT, 'info.json'), JSON.stringify({ ...info, dateKey, box }, null, 2));
    log('saved screenshots to', OUT, JSON.stringify(box));

    if (PREVIEW) {
      log('PREVIEW mode: nothing uploaded.');
      return;
    }
    await upload({ dateKey, file: path.join(OUT, `portrait-${dateKey}.png`), cutoutUrl: info.cutoutUrl, box });
  } finally {
    await browser.close();
  }
}

async function upload({ dateKey, file, cutoutUrl, box }) {
  const sharp = require('sharp');
  const admin = require('firebase-admin');
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON required');
  const sa = JSON.parse(raw);
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'our-daily.firebasestorage.app';
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id, storageBucket: bucketName });
  }
  const key = crypto.createHash('sha1').update(String(cutoutUrl || '').split('?')[0]).digest('hex').slice(0, 16);
  const ref = admin.firestore().collection('instagram-images').doc(dateKey);
  const prev = (await ref.get()).data() || {};
  if (prev.speakerPortraitBakedUrl && prev.speakerPortraitBakedKey === key) {
    log('unchanged speaker; skipping upload');
    return;
  }
  const buf = await sharp(file).webp({ quality: 90, alphaQuality: 95 }).toBuffer();
  const token = crypto.randomUUID();
  const dest = `speaker-portrait-baked/${dateKey}.webp`;
  await admin.storage().bucket(bucketName).file(dest).save(buf, {
    resumable: false,
    metadata: { contentType: 'image/webp', cacheControl: 'public, max-age=300', metadata: { firebaseStorageDownloadTokens: token } }
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
  await ref.set(
    {
      speakerPortraitBakedUrl: url,
      speakerPortraitBakedKey: key,
      speakerPortraitBakedUpdatedAt: new Date().toISOString(),
      speakerPortraitBakedWidth: Math.round(box.width),
      speakerPortraitBakedHeight: Math.round(box.height)
    },
    { merge: true }
  );
  log('uploaded', dest, buf.length, 'bytes');
}

main().catch((e) => {
  console.error('[speaker-portrait] failed:', e);
  process.exit(1);
});
