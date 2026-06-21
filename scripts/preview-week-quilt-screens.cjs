#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Week-ahead quilt-screen preview workflow:
 *   Phase 1a — speaker cutouts for scheduled quotes in the window
 *   Phase 1b — newspaper clipping PNGs per dateKey
 *   Phase 2  — Playwright quilt-screen screenshots + contact sheet
 *
 * Usage:
 *   APP_URL=https://your-app/our-daily-beta.html \
 *   API_BASE_URL=https://your-api \
 *   npm run preview:week-quilt-screens
 *
 * Env:
 *   APP_URL (required)
 *   API_BASE_URL — defaults to APP_URL origin
 *   PREVIEW_DAY_OFFSET_START — default 1 (tomorrow)
 *   PREVIEW_DAY_COUNT — default 7
 *   PREVIEW_SYNC_QUOTES — if true, run sync:quotes first
 *   PREVIEW_SKIP_ASSET_GEN — if true, skip Phase 1 (screenshots only)
 *   PREVIEW_FORCE_REGEN — regenerate cutouts/clippings even when present
 *   PREVIEW_OUT_DIR — output directory
 *   PREVIEW_SETTLE_MS — wait after each preview render (default 3000)
 *   PREVIEW_CAPTURE_ZONES — legacy per-zone scroll PNGs (default false; use full-screen capture instead)
 *   PREVIEW_SECTION_GAP — CSS gap between scroll sections during capture (default 1rem; app uses ~60vh)
 *   PREVIEW_OPEN_FOLDER — if false, do not open the output folder in Finder when done (default true on macOS)
 *
 * Output: tmp/quilt-week-preview/<timestamp>/index.html + PNGs (open index.html to review).
 * Full run (assets + 7 screenshots) often takes ~45–90 minutes; re-runs skip existing assets.
 */
try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
} catch (_) {
  /* dotenv optional in CI */
}

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync, execSync } = require('child_process');
const { chromium } = require('playwright');
const sharp = require('sharp');
const admin = require('firebase-admin');
const { runNightlyIgAttempt } = require('./generate-nightly-ig-images.cjs');
const { addDays, getAppDateKey } = require('./lib/app-date-key.cjs');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW_SECTION_GAP = process.env.PREVIEW_SECTION_GAP || '1rem';

const QUILT_ZONES = [
  { slug: 'quilt-quote', label: 'Quilt — quote card', selector: '#quiltQuoteDisplay, .quilt-quote-clipping' },
  { slug: 'quilt-speaker', label: 'Quilt — speaker', selector: '#quoteSpeakerWidget' },
  { slug: 'quilt-before-you-go', label: 'Quilt — before you go', selector: '#quiltBeforeYouGoWrap' }
];

function timestampDirName() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function truthyEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  return String(raw).toLowerCase() === 'true' || raw === '1';
}

function shouldOpenOutputFolder() {
  if (process.env.PREVIEW_OPEN_FOLDER != null && process.env.PREVIEW_OPEN_FOLDER !== '') {
    return truthyEnv('PREVIEW_OPEN_FOLDER', true);
  }
  return process.platform === 'darwin';
}

function startPreviewStaticServer(outDir) {
  const absOut = path.resolve(outDir);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(String(req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
      const filePath = path.resolve(absOut, rel);
      if (!filePath.startsWith(absOut + path.sep) && filePath !== absOut) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const type =
          ext === '.html'
            ? 'text/html; charset=utf-8'
            : ext === '.png'
              ? 'image/png'
              : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

function revealOutputFolder(outDir, indexPath) {
  const absOut = path.resolve(outDir);
  const absIndex = path.resolve(indexPath);
  console.log('');
  console.log('[preview-week] ── output ──');
  console.log(`[preview-week] folder: ${absOut}`);
  console.log(`[preview-week] review:  ${absIndex}`);
  if (!shouldOpenOutputFolder()) return;
  void (async () => {
    try {
      const { server, url } = await startPreviewStaticServer(outDir);
      console.log(`[preview-week] preview server: ${url}`);
      if (process.platform === 'darwin') {
        execSync(`open "${absOut}"`, { stdio: 'ignore' });
        execSync(`open "${url}"`, { stdio: 'ignore' });
        console.log('[preview-week] opened folder + preview in browser (local server, not file://)');
      } else if (process.platform === 'win32') {
        execSync(`explorer "${absOut}"`, { stdio: 'ignore' });
        execSync(`start "" "${url}"`, { stdio: 'ignore', shell: true });
      } else {
        execSync(`xdg-open "${absOut}"`, { stdio: 'ignore' });
        execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
      }
      setTimeout(() => server.close(), 600000);
    } catch (error) {
      console.warn('[preview-week] could not open preview server:', error?.message || error);
      try {
        if (process.platform === 'darwin') execSync(`open "${absIndex}"`, { stdio: 'ignore' });
      } catch (_) {
        /* */
      }
    }
  })();
}

function buildPreviewDateKeys(offsetStart, count) {
  const base = getAppDateKey();
  const keys = [];
  for (let i = 0; i < count; i += 1) {
    keys.push(addDays(base, offsetStart + i));
  }
  return keys;
}

function probeUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function initFirebase() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }
  return admin.firestore();
}

function readClippingUrl(data) {
  return String(data?.newspaperClippingUrl || data?.newspaperClippingImageStorageUrl || '').trim();
}

function readClippingStamp(data) {
  return Date.parse(
    String(data?.newspaperClippingGeneratedAt || data?.lastIgPushCompletedAt || data?.lastUpdated || '').trim()
  );
}

async function readDayAssetStatus(db, dateKey) {
  const assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';
  const quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const [assignSnap, igSnap] = await Promise.all([
    db.collection(assignmentsCollection).doc(dateKey).get(),
    db.collection('instagram-images').doc(dateKey).get()
  ]);
  const assign = assignSnap.exists ? assignSnap.data() || {} : null;
  const ig = igSnap.exists ? igSnap.data() || {} : null;
  const clippingUrl = ig ? readClippingUrl(ig) : '';
  const assignedAt = assign ? Date.parse(String(assign.assignedAt || '').trim()) : NaN;
  const clippingStamp = ig ? readClippingStamp(ig) : NaN;
  const assignmentNewerThanClipping =
    Number.isFinite(assignedAt) &&
    Number.isFinite(clippingStamp) &&
    assignedAt > clippingStamp;

  let speakerCutoutUrl = '';
  const sourceId = String(assign?.sourceId || '').trim();
  if (sourceId) {
    const quoteSnap = await db.collection(quotesCollection).doc(sourceId).get();
    if (quoteSnap.exists) {
      const q = quoteSnap.data() || {};
      speakerCutoutUrl = String(q.speakerCutoutUrl || q.speaker_cutout_url || '').trim();
    }
  }

  return {
    hasAssignment: !!assign,
    assignmentSource: assign ? 'firestore' : 'missing',
    speakerCutoutUrl,
    clippingUrl,
    assignmentNewerThanClipping
  };
}

async function clippingNeedsRegen(db, dateKey, forceRegen) {
  if (forceRegen) return true;
  const status = await readDayAssetStatus(db, dateKey);
  if (!status.clippingUrl) return true;
  return status.assignmentNewerThanClipping;
}

function runSpeakerCutouts(dateKeys, forceRegen) {
  if (!dateKeys.length) return { ok: true, skipped: true };
  const start = dateKeys[0];
  const window = dateKeys.length;
  const args = [
    path.join(ROOT, 'scripts/process-speaker-cutouts.cjs'),
    '--scheduled',
    `--start=${start}`,
    `--window=${window}`,
    '--soft-fail'
  ];
  if (forceRegen) args.push('--force');
  console.log(`[preview-week] Phase 1a: speaker cutouts start=${start} window=${window}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit'
  });
  return { ok: result.status === 0, status: result.status };
}

function runQuoteSync() {
  console.log('[preview-week] syncing quotes from Notion…');
  const result = spawnSync('npm', ['run', 'sync:quotes'], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
    shell: true
  });
  return { ok: result.status === 0, status: result.status };
}

async function generateClippingsForWindow({ appUrl, apiBase, dateKeys, forceRegen, outDir }) {
  const db = initFirebase();
  const results = [];
  for (const dateKey of dateKeys) {
    const needsRegen = await clippingNeedsRegen(db, dateKey, forceRegen);
    if (!needsRegen) {
      console.log(`[preview-week] Phase 1b: skip clipping ${dateKey} (up to date)`);
      results.push({ dateKey, clipping: 'skipped' });
      continue;
    }
    console.log(`[preview-week] Phase 1b: generating clipping for ${dateKey}…`);
    try {
      await runNightlyIgAttempt({
        appUrl,
        apiBase,
        dateKey,
        attempt: 1,
        outDir: path.join(outDir, 'clipping-artifacts', dateKey),
        strictQuote: true,
        clippingOnly: true
      });
      results.push({ dateKey, clipping: 'generated' });
    } catch (error) {
      console.error(`[preview-week] clipping failed for ${dateKey}:`, error?.message || error);
      results.push({ dateKey, clipping: 'failed', error: error?.message || String(error) });
    }
  }
  return results;
}

function viewerHref(filename) {
  return `viewer.html?img=${encodeURIComponent(filename)}`;
}

function writeViewerPage(outDir) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quilt screen preview</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; padding: 1rem 1rem 3rem; font-family: system-ui, sans-serif; background: #e8e4de; color: #241f19; }
    .toolbar { position: sticky; top: 0; z-index: 2; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;
      padding: 0.65rem 0.85rem; margin: 0 0 1rem; background: rgba(246,244,241,0.96); border: 1px solid rgba(36,31,25,0.1);
      border-radius: 10px; backdrop-filter: blur(8px); }
    .toolbar a { color: #241f19; text-decoration: none; font-size: 0.9rem; }
    .toolbar label { font-size: 0.82rem; color: rgba(36,31,25,0.65); }
    .toolbar input[type=range] { width: 140px; vertical-align: middle; }
    .stage { display: flex; justify-content: center; }
    #previewImg { width: min(1290px, 96vw); height: auto; max-height: none; display: block;
      background: #f6f4f1; box-shadow: 0 8px 28px rgba(36,31,25,0.14); border-radius: 4px; }
    .hint { margin: 0.75rem 0 0; text-align: center; font-size: 0.8rem; color: rgba(36,31,25,0.55); }
  </style>
</head>
<body>
  <div class="toolbar">
    <a href="index.html">← All days</a>
    <strong id="title"></strong>
    <label>Width <input id="widthSlider" type="range" min="430" max="1600" value="1290" step="10" /></label>
  </div>
  <div class="stage">
    <img id="previewImg" alt="" decoding="async" />
  </div>
  <p class="hint">Scroll vertically to read the full quilt screen. Drag the width slider if you want it larger.</p>
  <script>
    const params = new URLSearchParams(location.search);
    const img = params.get('img') || '';
    const el = document.getElementById('previewImg');
    const title = document.getElementById('title');
    const slider = document.getElementById('widthSlider');
    if (!img) {
      title.textContent = 'Missing image';
    } else {
      el.src = img;
      title.textContent = img.replace('-quilt-full.png', '').replace('-quilt-thumb.png', '');
    }
    const applyWidth = (px) => { el.style.width = px + 'px'; el.style.maxWidth = '100%'; };
    slider.addEventListener('input', () => applyWidth(Number(slider.value) || 1290));
    applyWidth(Number(slider.value) || 1290);
  </script>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'viewer.html'), html, 'utf8');
}

function writeContactSheet(outDir, rows) {
  writeViewerPage(outDir);
  const cards = rows
    .map((row) => {
      const quoteLine = row.quoteText
        ? `"${row.quoteText.replace(/"/g, '&quot;').slice(0, 120)}${row.quoteText.length > 120 ? '…' : ''}"`
        : '(no quote)';
      const authorLine = row.quoteAuthor ? ` — ${row.quoteAuthor}` : '';
      const thumb = row.thumbnail || row.screenshot;
      const full = row.screenshot || thumb;
      const fullHref = full ? viewerHref(full) : '#';
      const img = thumb
        ? `<a href="${fullHref}" title="Open full quilt screen (readable width)"><img src="${thumb}" alt="${row.dateKey}" decoding="async" /></a>`
        : '<div class="missing">Screenshot missing</div>';
      return `
    <figure class="card">
      ${img}
      <figcaption>
        <strong>${row.dateKey}</strong>
        <div class="quote">${quoteLine}${authorLine}</div>
        <div class="meta">quote: ${row.quoteSource || 'unknown'}</div>
        <div class="meta">cutout: ${row.cutoutStatus || 'unknown'}</div>
        <div class="meta">clipping: ${row.clippingStatus || 'unknown'}</div>
        ${full ? `<a class="open-full" href="${fullHref}">Open full screen (scroll ↓)</a>` : ''}
        ${row.error ? `<div class="error">${row.error}</div>` : ''}
      </figcaption>
    </figure>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Week quilt-screen preview</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; padding: 1.5rem; font-family: system-ui, sans-serif; background: #f6f4f1; color: #241f19; }
    h1 { margin: 0 0 0.35rem; font-size: 1.35rem; }
    p.meta { margin: 0 0 1.25rem; color: rgba(36, 31, 25, 0.62); font-size: 0.92rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 1.5rem; }
    .card { margin: 0; background: #fff; border: 1px solid rgba(36, 31, 25, 0.08); border-radius: 10px; overflow: hidden; }
    .card a { display: block; background: #f6f4f1; }
    .card img { display: block; width: 100%; max-width: 430px; height: auto; margin: 0 auto; background: #f6f4f1; }
    .open-full { display: inline-block; margin-top: 0.35rem; font-size: 0.76rem; }
    .missing { padding: 3rem 1rem; text-align: center; color: rgba(36, 31, 25, 0.45); background: #f0eeea; }
    figcaption { padding: 0.75rem; font-size: 0.82rem; line-height: 1.4; }
    figcaption strong { display: block; margin-bottom: 0.35rem; font-size: 0.95rem; }
    .quote { margin-bottom: 0.35rem; font-style: italic; }
    .meta { color: rgba(36, 31, 25, 0.58); font-size: 0.76rem; }
    .error { margin-top: 0.35rem; color: #9b2c2c; font-size: 0.76rem; }
  </style>
</head>
<body>
  <h1>Week quilt-screen preview</h1>
  <p class="meta">${rows.length} days · ${path.basename(outDir)}</p>
  <div class="grid">${cards}
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
}

async function installPreviewBootstrap(context) {
  const todayKey = getAppDateKey();
  await context.addInitScript((tk) => {
    try {
      localStorage.setItem('ourDailyHasVisited', 'true');
      localStorage.setItem('ourDailyLastVisitDate', tk);
      localStorage.setItem('ourDailyQuoteSeenDate', tk);
      localStorage.setItem('ourDailyColorCompletedDate', tk);
      localStorage.setItem('ourDailyUserFirstName', 'Friend');
    } catch (_) {
      /* */
    }
  }, todayKey);
}

async function installAuditHelpers(page) {
  await page.evaluate(() => {
    window.__odqPreviewJobs = window.__odqPreviewJobs || {};
    window.__odqPreviewStartJob = (jobName) => {
      window.__odqPreviewJobs[jobName] = { done: false, error: null };
    };
    window.__odqPreviewFinishJob = (jobName, error = null) => {
      window.__odqPreviewJobs[jobName] = { done: true, error };
    };
    window.__odqPreviewPrimeChrome = async (timeoutMs = 60000) => {
      window.__odqPreviewStartJob('prime');
      try {
        const app = window.app;
        if (!app?._primeQuiltQuoteChrome) throw new Error('app._primeQuiltQuoteChrome missing');
        app._quoteScreenClippingInflight = null;
        await Promise.race([
          app._primeQuiltQuoteChrome(),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error(`prime timeout after ${timeoutMs}ms`)), timeoutMs);
          })
        ]);
        window.__odqPreviewFinishJob('prime');
      } catch (error) {
        window.__odqPreviewFinishJob('prime', error?.message || String(error));
      }
    };
    window.__odqAuditShowScreen = (screenId) => {
      const app = window.app;
      app?.disableIntroFlow?.();
      if (app) app._flowTransitioning = false;
      document.querySelectorAll('.screen').forEach((s) => {
        s.classList.remove('active');
        s.style.display = 'none';
        s.removeAttribute('hidden');
        s.setAttribute('aria-hidden', 'false');
      });
      const target = document.getElementById(screenId);
      if (!target) return { ok: false, reason: 'missing-element' };
      target.style.display = 'flex';
      target.classList.add('active');
      target.removeAttribute('hidden');
      target.setAttribute('aria-hidden', 'false');
      if (screenId === 'screen-quilt') {
        target.scrollTop = 0;
        window.scrollTo(0, 0);
      }
      return { ok: true };
    };
  });
}

async function stabilizePreviewPage(page) {
  await page.evaluate(() => {
    window.app?.disableIntroFlow?.();
    window.app?.clearPortalToQuoteIntroTimer?.();
    window.app?.clearNameThanksAdvanceTimer?.();
    window.app?.clearFirstQuoteBridgeTimer?.();
    window.__odqAuditShowScreen?.('screen-quilt');
  });
}

async function waitForPreviewJob(page, jobName, timeoutMs = 75000) {
  try {
    await page.waitForFunction(
      (name) => window.__odqPreviewJobs?.[name]?.done === true,
      jobName,
      { timeout: timeoutMs }
    );
  } catch (error) {
    const status = await page.evaluate((name) => window.__odqPreviewJobs?.[name] || null, jobName);
    if (!status) {
      throw new Error(`preview job "${jobName}" never started (page helpers missing?)`);
    }
    throw error;
  }
  const error = await page.evaluate((name) => window.__odqPreviewJobs?.[name]?.error || null, jobName);
  if (error) throw new Error(error);
}

async function activatePreviewForDate(page, dateKey) {
  // Stepwise activation — one long activateAdminDatePreview evaluate can reload/crash headless WebKit.
  await page.evaluate((dk) => {
    const app = window.app;
    app._adminPreview = { dateKey: dk, quote: null, assignmentSource: 'loading', resolution: 'loading' };
    app._invalidateQuiltChromeForAdminDatePreview?.();
  }, dateKey);

  await page.evaluate(async () => {
    try {
      await window.app?.quoteService?.loadQuotesFromFirestore?.({ requireServer: true });
    } catch (_) {
      /* */
    }
  });

  const resolved = await page.evaluate(async (dk) => {
    const qs = window.app?.quoteService;
    if (!qs?.resolveQuoteForCalendarKeyFresh) return { ok: false, reason: 'no-quote-service' };
    const result = await qs.resolveQuoteForCalendarKeyFresh(dk);
    const quote = result?.quote || null;
    if (!quote?.text) return { ok: false, reason: 'no-quote', dateKey: dk };
    const assignmentSource = result?.source === 'firestore' ? 'firestore' : 'fallback';
    const resolution = result?.resolution || assignmentSource;
    let pinned = quote;
    if (typeof qs._pinAndHydrateQuote === 'function') {
      pinned = (await qs._pinAndHydrateQuote(dk, quote)) || quote;
    }
    return { ok: true, dateKey: dk, quote: pinned, assignmentSource, resolution };
  }, dateKey);

  if (!resolved?.ok) return resolved;

  await page.evaluate((payload) => {
    const app = window.app;
    app._adminPreview = {
      dateKey: payload.dateKey,
      quote: payload.quote,
      assignmentSource: payload.assignmentSource,
      resolution: payload.resolution
    };
    app._syncAdminPreviewQuoteFromPin?.();
    app._beforeYouGoHydratedDateKey = null;
    app.quiltEngine.initialize();
    app.dailyContributors = [];
    app._invalidateQuiltChromeForAdminDatePreview?.();
  }, resolved);

  await stabilizePreviewPage(page);
  await installAuditHelpers(page);
  await page.evaluate(() => {
    window.app._quoteScreenClippingInflight = null;
    void window.__odqPreviewPrimeChrome?.(60000);
  });
  let primeWarning = '';
  try {
    await waitForPreviewJob(page, 'prime', 70000);
  } catch (primeError) {
    primeWarning = primeError?.message || String(primeError);
    console.warn(`[preview-week] prime chrome warning for ${dateKey}: ${primeWarning}`);
    await page.evaluate(() => {
      window.app._quoteScreenClippingInflight = null;
    });
  }

  const previewResult = resolved;

  await page.evaluate(async () => {
    window.__odqAuditShowScreen?.('screen-quilt');
    const app = window.app;
    if (app?.renderQuilt) await app.renderQuilt();
    app?.updateBeforeYouGoSection?.();
    await app?._refreshQuoteSpeakerWidgetEntry?.(app.getEffectiveQuiltQuote?.());
    await app?._waitForQuoteScreenClippingInflight?.(15000);
  });

  let chromeReady = false;
  try {
    await page.waitForFunction(
      () => {
        const spread = document.getElementById('quiltMoodSpread');
        const quoteImg = spread?.querySelector('.quilt-mood-triptych__quote-img, img');
        const speaker = document.getElementById('quoteSpeakerWidget');
        const svg = document.getElementById('quilt');
        const hasBlocks = !!svg?.querySelector('rect, path, polygon, circle, ellipse');
        const quoteReady =
          spread && !spread.hidden && quoteImg && quoteImg.naturalWidth > 0 && quoteImg.naturalHeight > 0;
        const speakerReady = speaker && speaker.offsetHeight > 48;
        return hasBlocks && quoteReady && speakerReady;
      },
      undefined,
      { timeout: 60000 }
    );
    chromeReady = true;
  } catch (_) {
    chromeReady = false;
  }

  const warning = [primeWarning, chromeReady ? '' : 'chrome-settle-timeout'].filter(Boolean).join('; ');
  return { ...previewResult, chromeReady, warning };
}

async function applyPreviewCompactSections(page, gap = PREVIEW_SECTION_GAP) {
  await page.evaluate((gapValue) => {
    const screen = document.getElementById('screen-quilt');
    if (!screen) return;
    let style = document.getElementById('odq-preview-compact-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'odq-preview-compact-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      #screen-quilt[data-odq-preview-capture="compact"] {
        --quilt-section-tunnel: ${gapValue} !important;
        --quilt-section-gap: ${gapValue} !important;
        --quilt-reflection-story-gap: ${gapValue} !important;
      }
      #screen-quilt[data-odq-preview-capture="compact"] .quilt-section-gap,
      #screen-quilt[data-odq-preview-capture="compact"] .quilt-reflection-story-gap,
      #screen-quilt[data-odq-preview-capture="compact"] .quilt-layout-b-preview-before-gap,
      #screen-quilt[data-odq-preview-capture="compact"] .quilt-scroll-quilt-gap {
        flex: 0 0 ${gapValue} !important;
        min-height: ${gapValue} !important;
        height: ${gapValue} !important;
      }
      #screen-quilt[data-odq-preview-capture="compact"] .quote-card-stack + .quote-speaker-stage,
      #screen-quilt[data-odq-preview-capture="compact"] .quote-speaker-stage + .button-container,
      #screen-quilt[data-odq-preview-capture="compact"] .quilt-popular-color-panel:not([hidden]) + .quilt-layout-b-preview-wrap,
      #screen-quilt[data-odq-preview-capture="compact"]:has(#quiltUserColorCardWrap:not([hidden])) .quilt-daily-colors-zone + .quote-card-stack {
        margin-top: ${gapValue} !important;
      }
      #screen-quilt[data-odq-preview-capture="compact"] .quilt-layout-b-preview-wrap {
        gap: ${gapValue} !important;
      }
    `;
    screen.dataset.odqPreviewCapture = 'compact';
  }, gap);
  await settle(page, 400);
}

async function resetQuiltScreenLayout(page) {
  await page.evaluate(() => {
    const screen = document.getElementById('screen-quilt');
    if (screen) {
      screen.style.removeProperty('height');
      screen.style.removeProperty('min-height');
      screen.style.removeProperty('max-height');
      screen.style.removeProperty('overflow');
      screen.style.removeProperty('position');
      screen.style.removeProperty('inset');
      delete screen.dataset.odqPreviewCapture;
      screen.scrollTop = 0;
    }
    document.getElementById('odq-preview-compact-style')?.remove();
  });
  await page.setViewportSize({ width: 430, height: 932 });
}

async function assertCaptureHasContent(imagePath) {
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  if (max - min < 12) {
    throw new Error(`Capture appears blank (luminance range ${(max - min).toFixed(1)})`);
  }
}

async function findQuoteSpeakerThumbTop(fullPath) {
  const meta = await sharp(fullPath).metadata();
  const stripStep = Math.max(20, Math.floor(meta.height * 0.015));
  const left = Math.floor(meta.width * 0.22);
  const width = Math.floor(meta.width * 0.56);
  const sampleHeight = Math.min(900, Math.floor(meta.height * 0.22));
  for (let top = 0; top < Math.max(0, meta.height - sampleHeight); top += stripStep) {
    const { data, info } = await sharp(fullPath)
      .extract({ left, top, width, height: sampleHeight })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    if (max - min > 35) return Math.max(0, top - 32);
  }
  return Math.max(0, Math.floor(meta.height * 0.1));
}

async function writeQuiltPreviewThumb(fullPath, thumbPath) {
  const meta = await sharp(fullPath).metadata();
  const thumbTop = await findQuoteSpeakerThumbTop(fullPath);
  const thumbHeight = Math.min(1500, Math.max(400, meta.height - thumbTop));
  await sharp(fullPath)
    .extract({ left: 0, top: thumbTop, width: meta.width, height: thumbHeight })
    .resize({ width: 430, withoutEnlargement: false })
    .png()
    .toFile(thumbPath);
}

async function captureFullQuiltScreen(page, outPath) {
  await resetQuiltScreenLayout(page);
  await applyPreviewCompactSections(page);

  const dims = await page.evaluate(() => {
    const screen = document.getElementById('screen-quilt');
    if (!screen) return null;
    return {
      scrollHeight: Math.ceil(screen.scrollHeight),
      clientHeight: Math.ceil(screen.clientHeight)
    };
  });
  if (!dims?.scrollHeight) throw new Error('Could not measure #screen-quilt scroll height');

  const scrollPositions = [];
  const maxScroll = Math.max(0, dims.scrollHeight - dims.clientHeight);
  for (let st = 0; st <= maxScroll; st += dims.clientHeight) {
    scrollPositions.push(st);
  }
  if (!scrollPositions.length) scrollPositions.push(0);

  const chunks = [];
  for (const scrollTop of scrollPositions) {
    await page.evaluate((st) => {
      const screen = document.getElementById('screen-quilt');
      if (screen) screen.scrollTop = st;
    }, scrollTop);
    await settle(page, 600);
    chunks.push(await page.screenshot({ type: 'png' }));
  }

  const metas = await Promise.all(chunks.map((buf) => sharp(buf).metadata()));
  const width = metas[0].width;
  const totalHeight = metas.reduce((sum, meta) => sum + meta.height, 0);
  const composites = [];
  let top = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    composites.push({ input: chunks[i], top, left: 0 });
    top += metas[i].height;
  }

  await sharp({
    create: {
      width,
      height: totalHeight,
      channels: 4,
      background: { r: 246, g: 244, b: 241, alpha: 1 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outPath);

  await assertCaptureHasContent(outPath);
}

async function settle(page, waitMs) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {
        /* */
      }
    }
  });
  await page.waitForTimeout(waitMs);
}

async function installScrollHelper(page) {
  await page.evaluate(() => {
    window.__odqPreviewScrollTo = (selector) => {
      const screen = document.getElementById('screen-quilt');
      const pick =
        selector
          .split(',')
          .map((s) => document.querySelector(s.trim()))
          .find(Boolean) || null;
      if (!pick) return { ok: false, reason: 'missing-selector' };
      if (screen) {
        const top = pick.getBoundingClientRect().top - screen.getBoundingClientRect().top + screen.scrollTop;
        screen.scrollTop = Math.max(0, top - 24);
      } else {
        pick.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      }
      return { ok: true };
    };
  });
}

async function captureWeekScreenshots({
  appUrl,
  dateKeys,
  outDir,
  settleMs,
  clippingResults,
  captureZones = true
}) {
  const clippingByDate = Object.fromEntries(
    (clippingResults || []).map((row) => [row.dateKey, row.clipping])
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
  await installPreviewBootstrap(context);
  const page = await context.newPage();
  const rows = [];

  try {
    console.log(`[preview-week] Phase 2: loading ${appUrl}`);
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!window.app && window.app._portalQuiltLoaded === true, undefined, {
      timeout: 180000
    });
    await page.waitForFunction(
      () =>
        !!window.app?.quoteService &&
        Array.isArray(window.app.quoteService.quotes) &&
        window.app.quoteService.quotes.length > 0,
      undefined,
      { timeout: 180000 }
    );

    await installAuditHelpers(page);
    await installScrollHelper(page);
    await stabilizePreviewPage(page);
    await page
      .waitForFunction(() => !window.app?._quoteScreenClippingInflight, undefined, { timeout: 20000 })
      .catch(() => {
        console.warn('[preview-week] boot quote clipping still in flight — clearing before captures');
      });
    await page.evaluate(() => {
      window.app._quoteScreenClippingInflight = null;
    });

    let db = null;
    try {
      db = initFirebase();
    } catch (_) {
      /* asset status optional */
    }

    for (const dateKey of dateKeys) {
      console.log(`[preview-week] Phase 2: screenshot ${dateKey}`);
      const previewResult = await activatePreviewForDate(page, dateKey);

      const row = {
        dateKey,
        quoteSource: previewResult?.assignmentSource || previewResult?.resolution || 'unknown',
        quoteText: String(previewResult?.quote?.text || '').trim(),
        quoteAuthor: String(previewResult?.quote?.author || '').trim(),
        clippingStatus: clippingByDate[dateKey] || 'unknown',
        cutoutStatus: 'unknown',
        screenshot: null,
        thumbnail: null,
        error: null
      };

      if (db) {
        try {
          const assetStatus = await readDayAssetStatus(db, dateKey);
          row.cutoutStatus = assetStatus.speakerCutoutUrl ? 'present' : 'missing';
          if (!row.clippingStatus || row.clippingStatus === 'unknown') {
            row.clippingStatus = assetStatus.clippingUrl ? 'present' : 'missing';
          }
        } catch (_) {
          /* */
        }
      }

      if (!previewResult?.ok) {
        row.error = previewResult?.message || previewResult?.reason || previewResult?.error || 'preview failed';
        rows.push(row);
        continue;
      }

      if (!previewResult?.chromeReady) {
        row.error = previewResult?.warning || 'quote/speaker chrome did not settle';
      }

      await settle(page, settleMs);
      const file = `${dateKey}-quilt-full.png`;
      const thumbFile = `${dateKey}-quilt-thumb.png`;
      try {
        const fullPath = path.join(outDir, file);
        await captureFullQuiltScreen(page, fullPath);
        await writeQuiltPreviewThumb(fullPath, path.join(outDir, thumbFile));
        row.screenshot = file;
        row.thumbnail = thumbFile;
        console.log(`[preview-week] wrote ${file} + ${thumbFile}`);
      } catch (captureError) {
        row.error = captureError?.message || String(captureError);
        console.error(`[preview-week] capture failed for ${dateKey}:`, row.error);
      }
      await resetQuiltScreenLayout(page);
      rows.push(row);

      if (captureZones) {
        for (const zone of QUILT_ZONES) {
          const scrolled = await page.evaluate(
            (selector) => window.__odqPreviewScrollTo(selector),
            zone.selector
          );
          if (!scrolled?.ok) {
            console.warn(`[preview-week] skip ${dateKey} ${zone.slug}: ${scrolled?.reason || 'scroll failed'}`);
            continue;
          }
          await settle(page, settleMs);
          const zoneFile = `${dateKey}-${zone.slug}.png`;
          await page.screenshot({ path: path.join(outDir, zoneFile) });
          console.log(`[preview-week] wrote ${zoneFile}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  return rows;
}

async function main() {
  const appUrl = String(process.env.APP_URL || '').trim();
  if (!appUrl) {
    throw new Error('APP_URL is required');
  }
  const apiBase =
    (process.env.API_BASE_URL && String(process.env.API_BASE_URL).replace(/\/$/, '')) ||
    new URL(appUrl).origin;
  const offsetStart = Math.max(0, Number(process.env.PREVIEW_DAY_OFFSET_START ?? 1) || 1);
  const dayCount = Math.max(1, Number(process.env.PREVIEW_DAY_COUNT ?? 7) || 7);
  const settleMs = Math.max(500, Number(process.env.PREVIEW_SETTLE_MS ?? 3000) || 3000);
  const syncQuotes = truthyEnv('PREVIEW_SYNC_QUOTES', false);
  const skipAssetGen = truthyEnv('PREVIEW_SKIP_ASSET_GEN', false);
  const forceRegen = truthyEnv('PREVIEW_FORCE_REGEN', false);
  const captureZones = truthyEnv('PREVIEW_CAPTURE_ZONES', false);
  const outDir =
    process.env.PREVIEW_OUT_DIR ||
    path.join(ROOT, 'tmp', 'quilt-week-preview', timestampDirName());

  const dateKeys = buildPreviewDateKeys(offsetStart, dayCount);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[preview-week] dates: ${dateKeys.join(', ')}`);
  console.log(`[preview-week] app: ${appUrl}`);
  console.log(`[preview-week] api: ${apiBase}`);
  console.log(`[preview-week] out: ${outDir}`);

  const reachable = await probeUrl(appUrl);
  if (!reachable) {
    throw new Error(`Could not reach APP_URL: ${appUrl}`);
  }

  if (syncQuotes) {
    const syncResult = runQuoteSync();
    if (!syncResult.ok) {
      throw new Error('PREVIEW_SYNC_QUOTES failed');
    }
  }

  let clippingResults = [];
  if (!skipAssetGen) {
    const cutoutResult = runSpeakerCutouts(dateKeys, forceRegen);
    if (!cutoutResult.ok && !cutoutResult.skipped) {
      console.warn('[preview-week] speaker cutouts exited non-zero — continuing');
    }
    clippingResults = await generateClippingsForWindow({
      appUrl,
      apiBase,
      dateKeys,
      forceRegen,
      outDir
    });
  } else {
    console.log('[preview-week] skipping Phase 1 asset generation');
    clippingResults = dateKeys.map((dateKey) => ({ dateKey, clipping: 'skipped' }));
  }

  const rows = await captureWeekScreenshots({
    appUrl,
    dateKeys,
    outDir,
    settleMs,
    clippingResults,
    captureZones
  });

  writeContactSheet(outDir, rows);
  const indexPath = path.join(outDir, 'index.html');
  console.log('[preview-week] done');
  revealOutputFolder(outDir, indexPath);
}

main().catch((err) => {
  console.error('[preview-week] failed:', err?.stack || err);
  process.exit(1);
});
