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
    viewport: { width: 393, height: 1100 },
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
    if (/speaker|cutout|tone|canvas|tainted|cors/i.test(t) && m.type() !== 'log') console.log('[speaker-portrait:browser]', m.type(), t.slice(0, 300));
  });
  try {
    log('loading', APP_URL);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!window.app && window.app._portalQuiltLoaded === true, undefined, { timeout: 180000 });

    const info = await page.evaluate(async ({ speakerName, forceDate }) => {
      const app = window.app;
      // Never photograph an already-baked portrait: render the live widget.
      app.fetchTodayInstagramImagesDoc = async () => null;
      const qs = app.quoteService;
      let dateKey = qs.getQuoteCalendarKeyNow();
      let quote = null;
      if (speakerName) {
        // Preview a specific speaker: find the nearest scheduled day whose quote is by them.
        const want = speakerName.toLowerCase();
        const base = new Date(dateKey + 'T00:00:00Z');
        for (let off = 0; off < 800 && !quote; off++) {
          for (const sign of off === 0 ? [1] : [1, -1]) {
            const d = new Date(base.getTime() + sign * off * 86400000);
            const dk = d.toISOString().slice(0, 10);
            let q = null;
            try { q = (await qs.resolveQuoteForCalendarKeyFresh(dk)) || qs.getQuoteForDate(dk); } catch (_) {}
            const who = String(q?.speaker || q?.author || '').toLowerCase();
            if (q?.text && who.includes(want)) { quote = q; dateKey = dk; break; }
          }
        }
      }
      if (forceDate && !quote) {
        dateKey = forceDate;
        const tries = [
          ['resolveQuoteForCalendarKeyFresh', () => qs.resolveQuoteForCalendarKeyFresh(forceDate)],
          ['getQuoteResolvedForInstagramDateKey', () => qs.getQuoteResolvedForInstagramDateKey(forceDate)],
          ['getQuoteForDate', () => qs.getQuoteForDate(forceDate)]
        ];
        const seen = [];
        for (const [name, fn] of tries) {
          let q = null;
          try { q = await fn(); } catch (e) { seen.push(name + ': error ' + (e?.message || e)); continue; }
          seen.push(name + ': ' + (q?.text ? String(q.speaker || q.author || '?') : 'none'));
          if (q?.text && !quote) quote = q;
        }
        window.__resolveLog = seen;
        if (!quote) throw new Error('Could not resolve a quote for ' + forceDate + ' :: ' + seen.join(' | '));
      }
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
      // Pin as "today" so any later app refresh keeps this quote (same trick the admin preview uses).
      try { qs._pinnedByDateKey[qs.getQuoteCalendarKeyNow()] = quote; } catch (_) {}
      try { app._adminPreview = { dateKey: qs.getQuoteCalendarKeyNow(), quote }; } catch (_) {}
      app.refreshQuoteSpeakerWidget(quote);
      return {
        dateKey,
        hasQuote: !!quote?.text,
        cutoutUrl: String(quote?.speakerCutoutUrl || quote?.cutoutUrl || '').trim(),
        speaker: String(quote?.speaker || quote?.author || '').trim(),
        resolveLog: window.__resolveLog || null
      };
    }, { speakerName: process.env.SPEAKER_NAME || '', forceDate: process.env.DATE_KEY || '' });
    log('quote', JSON.stringify(info));
    const dateKey = info.dateKey;

    // Wait for the portrait image to load and the layers to settle.
    await page.waitForFunction(() => {
      const wrap = document.getElementById('quoteSpeakerImageWrap');
      const img = document.getElementById('quoteSpeakerImage');
      return !!wrap && !wrap.hidden && !!img && !img.hidden && img.complete && img.naturalWidth > 0;
    }, undefined, { timeout: 90000 });
    await page.waitForTimeout(6000);
    // Color cutouts get a newspaper tone pass on-device; wait for it so the bake includes it.
    await page
      .waitForFunction(() => {
        const img = document.getElementById('quoteSpeakerImage');
        const wrap = document.getElementById('quoteSpeakerImageWrap');
        return img?.dataset.newspaperToned === '1' || img?.dataset.plainCutoutDirect === '1' && !wrap.classList.contains('quote-speaker-cutout--newspaper-pending') && img?.dataset.newspaperToned === '1';
      }, undefined, { timeout: 30000 })
      .catch(() => log('tone flag not set within 30s'));
    const toneState = await page.evaluate(() => {
      const img = document.getElementById('quoteSpeakerImage');
      const wrap = document.getElementById('quoteSpeakerImageWrap');
      return { dataset: { ...(img?.dataset || {}) }, cls: wrap?.className || '', srcStart: String(img?.currentSrc || '').slice(0, 60) };
    });
    log('tone state', JSON.stringify(toneState));
    await page.waitForTimeout(1500);

    // Safety: the widget must actually show the speaker we resolved, or we never save/upload.
    const shown = await page.evaluate(() => ({
      name: String(document.getElementById('quoteSpeakerName')?.textContent || '').trim(),
      src: String(document.getElementById('quoteSpeakerImage')?.currentSrc || '')
    }));
    const wantFile = decodeURIComponent(String(info.cutoutUrl || '').split('?')[0].split('/').pop() || '');
    const nameOk = !info.speaker || shown.name.toLowerCase() === info.speaker.toLowerCase();
    const srcOk = !wantFile || decodeURIComponent(shown.src).includes(wantFile.replace(/^.*speaker-cutouts\//, ''));
    log('widget shows', JSON.stringify(shown), 'nameOk', nameOk, 'srcOk', srcOk);
    if (!nameOk || !srcOk) throw new Error('Widget is showing a different speaker than the resolved quote; refusing to bake.');

    const widget = page.locator('#quoteSpeakerWidget');
    await widget.scrollIntoViewIfNeeded();
    await widget.screenshot({ path: path.join(OUT, `widget-${dateKey}.png`) });

    // Portrait only: transparent page, no quilt behind, no name/bio slabs. Margin keeps soft shadows.
    await page.addStyleTag({
      content: `
        html, body, #app, .screen, #screen-quilt { background: transparent !important; }
        #screen-quilt .quilt-container, #screen-quilt #quilt, #quilt { visibility: hidden !important; }
        #screen-quilt .quote-speaker-slab, #screen-quilt .quote-speaker-stage::after, #screen-quilt .quote-speaker-baked-img { visibility: hidden !important; }
      `
    });
    const PAD = 28;
    const geo = await page.evaluate((PAD) => {
      const wrap = document.querySelector('.quote-speaker-portrait-wrap');
      const scroller = document.getElementById('screen-quilt');
      const r0 = wrap.getBoundingClientRect();
      if (scroller) scroller.scrollTop += r0.top - (PAD + 12);
      const r = wrap.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
    }, PAD);
    await page.waitForTimeout(800);
    const clip = {
      x: Math.max(0, geo.x - PAD),
      y: Math.max(0, geo.y - PAD),
      width: Math.min(geo.vw - Math.max(0, geo.x - PAD), geo.w + PAD * 2),
      height: Math.min(geo.vh - Math.max(0, geo.y - PAD), geo.h + PAD * 2)
    };
    const padL = geo.x - clip.x, padT = geo.y - clip.y;
    const box = {
      width: geo.w, height: geo.h,
      padLeft: padL / geo.w, padTop: padT / geo.h,
      padRight: (clip.width - padL - geo.w) / geo.w, padBottom: (clip.height - padT - geo.h) / geo.h
    };
    await page.screenshot({ path: path.join(OUT, `portrait-${dateKey}.png`), clip, omitBackground: true });
    fs.writeFileSync(path.join(OUT, 'info.json'), JSON.stringify({ ...info, dateKey, geo, clip, box }, null, 2));
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
  if (prev.speakerPortraitBakedUrl && prev.speakerPortraitBakedKey === key && !process.env.FORCE) {
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
      speakerPortraitBakedCutout: String(cutoutUrl || '').split('?')[0],
      speakerPortraitBakedPad: {
        left: box.padLeft, top: box.padTop, right: box.padRight, bottom: box.padBottom
      }
    },
    { merge: true }
  );
  log('uploaded', dest, buf.length, 'bytes');
}

main().catch((e) => {
  console.error('[speaker-portrait] failed:', e);
  process.exit(1);
});
