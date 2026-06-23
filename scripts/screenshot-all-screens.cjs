#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Capture viewport PNGs for every top-level #screen-* section (plus key quilt scroll zones).
 * Outputs a contact-sheet index.html for typography / layout review.
 *
 * Usage:
 *   npm start   # in another terminal
 *   npm run screenshot:screens
 *
 * Env:
 *   SCREEN_AUDIT_URL  — default http://127.0.0.1:3000/our-daily-beta.html
 *   SCREEN_AUDIT_OUT  — output directory (default tmp/screen-font-audit/<timestamp>)
 *   SCREEN_AUDIT_WAIT_MS — settle time after each navigation (default 500)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

const SCREENS = [
  { slug: 'connection-problem', id: 'screen-connection-problem', label: 'Connection problem' },
  { slug: 'portal', id: 'screen-portal', label: 'Portal' },
  { slug: 'first-name', id: 'screen-first-name', label: 'First name' },
  { slug: 'intro-zak', id: 'screen-intro-zak', label: 'Intro — Meet Zak' },
  { slug: 'intro-mission', id: 'screen-intro-mission', label: 'Intro — mission' },
  { slug: 'name-thanks', id: 'screen-name-thanks', label: 'Name thanks (legacy)' },
  { slug: 'welcome', id: 'screen-welcome', label: 'How it works' },
  { slug: 'first-quote-bridge', id: 'screen-first-quote-bridge', label: 'Quote bridge' },
  { slug: 'quote', id: 'screen-quote', label: 'Quote + color picker' },
  { slug: 'quilt', id: 'screen-quilt', label: 'Quilt (top)' },
  { slug: 'settings', id: 'screen-settings', label: 'Settings' },
  { slug: 'milestone-quilts', id: 'screen-milestone-quilts', label: 'Milestone quilts' },
  { slug: 'remember-today', id: 'screen-remember-today', label: 'Remember today' },
  { slug: 'remember-today-view', id: 'screen-remember-today-view', label: 'Remember today view' },
  { slug: 'reflection-themes-archive', id: 'screen-reflection-themes-archive', label: 'Reflection archive' },
  { slug: 'quote-submission', id: 'screen-quote-submission', label: 'Quote submission' },
  { slug: 'about', id: 'screen-about', label: 'About' },
  { slug: 'reflection', id: 'screen-reflection', label: 'Reflection prompt' }
];

/** Extra quilt scroll captures (after screen-quilt is shown). */
const QUILT_ZONES = [
  { slug: 'quilt-quote', label: 'Quilt — quote card', selector: '#quiltQuoteDisplay, .quilt-quote-clipping' },
  { slug: 'quilt-speaker', label: 'Quilt — speaker', selector: '#quoteSpeakerWidget' },
  { slug: 'quilt-reflection', label: 'Quilt — reflection', selector: '#quiltReflectionScrapWidget' },
  { slug: 'quilt-before-you-go', label: 'Quilt — before you go', selector: '#quiltBeforeYouGoWrap' }
];

function timestampDirName() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function probeUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(4000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function writeContactSheet(outDir, captures) {
  const cards = captures
    .map(
      (c) => `
    <figure class="card">
      <a href="${c.file}"><img src="${c.file}" alt="${c.label}" loading="lazy" /></a>
      <figcaption>
        <strong>${c.label}</strong>
        <code>${c.id || c.slug}</code>
      </figcaption>
    </figure>`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Screen font audit</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      padding: 1.5rem;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f6f4f1;
      color: #241f19;
    }
    h1 { margin: 0 0 0.35rem; font-size: 1.35rem; }
    p.meta { margin: 0 0 1.25rem; color: rgba(36, 31, 25, 0.62); font-size: 0.92rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 1rem;
    }
    .card {
      margin: 0;
      background: #fff;
      border: 1px solid rgba(36, 31, 25, 0.08);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 0 rgba(36, 31, 25, 0.04);
    }
    .card img {
      display: block;
      width: 100%;
      height: auto;
      background: #f6f4f1;
    }
    figcaption {
      padding: 0.65rem 0.75rem 0.75rem;
      font-size: 0.82rem;
      line-height: 1.35;
    }
    figcaption strong { display: block; margin-bottom: 0.2rem; }
    figcaption code {
      font-size: 0.72rem;
      color: rgba(36, 31, 25, 0.55);
      word-break: break-all;
    }
  </style>
</head>
<body>
  <h1>Screen font audit</h1>
  <p class="meta">${captures.length} captures · ${path.basename(outDir)}</p>
  <div class="grid">${cards}
  </div>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
}

async function installAuditHelpers(page) {
  await page.evaluate(() => {
    window.__odqAuditShowScreen = (screenId) => {
      const app = window.app;
      app?.disableIntroFlow?.();
      if (app) app._flowTransitioning = false;

      const flowCleanup = [
        'flow-enter-from-bottom',
        'flow-enter-from-top',
        'flow-enter-active',
        'flow-exit-to-top',
        'flow-exit-to-bottom',
        'flow-exit-active',
        'flow-fade-enter',
        'flow-fade-enter-active',
        'flow-fade-exit',
        'flow-fade-exit-active'
      ];

      document.querySelectorAll('.screen').forEach((s) => {
        s.classList.remove('active', ...flowCleanup);
        s.style.display = 'none';
        s.removeAttribute('hidden');
        s.setAttribute('aria-hidden', 'false');
      });

      const target = document.getElementById(screenId);
      if (!target) return { ok: false, reason: 'missing-element' };

      target.style.display =
        screenId === 'screen-remember-today' || screenId === 'screen-remember-today-view'
          ? 'block'
          : 'flex';
      target.classList.add('active');
      target.removeAttribute('hidden');
      target.setAttribute('aria-hidden', 'false');

      document.documentElement.classList.toggle('odq-reflection-active', screenId === 'screen-reflection');
      document.body.classList.toggle('odq-reflection-active', screenId === 'screen-reflection');
      document.documentElement.classList.toggle('odq-about-active', screenId === 'screen-about');
      document.body.classList.toggle('odq-about-active', screenId === 'screen-about');
      document.documentElement.classList.toggle(
        'odq-quote-submission-active',
        screenId === 'screen-quote-submission'
      );
      document.body.classList.toggle('odq-quote-submission-active', screenId === 'screen-quote-submission');
      const rememberActive =
        screenId === 'screen-remember-today' || screenId === 'screen-remember-today-view';
      document.documentElement.classList.toggle('odq-remember-today-active', rememberActive);
      document.body.classList.toggle('odq-remember-today-active', rememberActive);

      if (screenId === 'screen-quote') {
        app?.applyQuotePickerModeUI?.();
        app?.applyQuoteScreenInitialRestLayout?.();
        app?.quoteService?.primeTodayQuoteFromLocalAssignment?.();
        app?.quoteService?.displayQuote?.();
        document.querySelectorAll('.quote-screen-fade-in').forEach((el) => el.classList.add('visible'));
      } else {
        app?.clearQuoteColorPickerSchedule?.();
      }

      if (screenId === 'screen-welcome') {
        document.querySelectorAll('.welcome-screen-fade-in').forEach((el) => el.classList.add('visible'));
      }

      if (screenId === 'screen-quilt') {
        try {
          Utils.syncReflectionPatchStarElement();
        } catch (_) {
          /* */
        }
        app?.refreshQuiltReflectionScrapWidget?.();
        app?.renderQuilt?.();
        window.scrollTo(0, 0);
        document.getElementById('app')?.scrollTo?.(0, 0);
      }

      if (screenId === 'screen-reflection') {
        app?.quoteService?.populateReflectionPromptCard?.();
      }

      if (screenId === 'screen-reflection-themes-archive') {
        app?.uiService?._purgeReflectionArchiveGhostLayers?.();
      }

      if (screenId === 'screen-about') {
        target.classList.add('about-lines-revealed');
      }

      return { ok: true };
    };

    window.__odqAuditPrepScreen = (screenId) => {
      if (screenId === 'screen-intro-zak') {
        const nameEl = document.getElementById('introZakName');
        if (nameEl) nameEl.textContent = 'Friend';
        document.getElementById('screen-intro-zak')?.classList.add('intro-persona-visible');
      }
      if (screenId === 'screen-intro-mission') {
        document.getElementById('screen-intro-mission')?.classList.add('intro-persona-visible');
      }
      if (screenId === 'screen-name-thanks') {
        const line = document.getElementById('nameThanksLine');
        if (line) {
          line.classList.add('is-visible');
          line.replaceChildren(
            Object.assign(document.createElement('span'), {
              className: 'name-thanks-line__lead',
              textContent: 'Welcome to ODQ'
            }),
            Object.assign(document.createElement('span'), {
              className: 'name-thanks-line__name',
              textContent: 'Friend'
            })
          );
        }
      }
      if (screenId === 'screen-first-quote-bridge') {
        document.getElementById('firstQuoteBridgeLine')?.classList.add('is-visible');
      }
      if (screenId === 'screen-first-name') {
        const input = document.getElementById('firstNameInput');
        const explainer = document.getElementById('firstNameDefaultExplainer');
        if (explainer && globalThis.Utils?.formatFriendTermExplainerHtml) {
          explainer.innerHTML = Utils.formatFriendTermExplainerHtml({
            name: 'Amigo',
            language: 'Spanish'
          });
        }
        if (input && !input.value) input.value = 'Friend';
      }
      if (screenId === 'screen-connection-problem') {
        document.getElementById('connectionProblemHeading')?.textContent?.trim();
      }
      return true;
    };

    window.__odqAuditScrollTo = (selector) => {
      const pick =
        selector
          .split(',')
          .map((s) => document.querySelector(s.trim()))
          .find(Boolean) || null;
      if (!pick) return { ok: false, reason: 'missing-selector' };
      pick.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      return { ok: true };
    };
  });
}

async function waitForAppReady(page, timeoutMs = 120000) {
  await page.waitForFunction(() => !!window.app && !!window.app.uiService, undefined, { timeout: timeoutMs });
  await page
    .waitForFunction(
      () =>
        !!window.app &&
        !!window.app.quiltEngine &&
        Array.isArray(window.app.quiltEngine.blocks) &&
        window.app.quiltEngine.blocks.length > 0,
      undefined,
      { timeout: timeoutMs }
    )
    .catch(() => {
      console.warn('[screen-audit] quilt blocks not loaded — captures may look empty');
    });
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

async function main() {
  const appUrl = process.env.SCREEN_AUDIT_URL || 'http://127.0.0.1:3000/our-daily-beta.html';
  const outDir =
    process.env.SCREEN_AUDIT_OUT || path.join(ROOT, 'tmp', 'screen-font-audit', timestampDirName());
  const waitMs = Number(process.env.SCREEN_AUDIT_WAIT_MS || 500);

  const reachable = await probeUrl(appUrl);
  if (!reachable) {
    console.error(`[screen-audit] Could not reach ${appUrl}`);
    console.error('[screen-audit] Start the app first: npm start');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  console.log(`[screen-audit] URL: ${appUrl}`);
  console.log(`[screen-audit] Out: ${outDir}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForAppReady(page);

    await page.evaluate(() => {
      localStorage.setItem('ourDailyHasVisited', 'true');
      localStorage.setItem('ourDailyUserFirstName', 'Friend');
      localStorage.removeItem('ourDailyFirstNameSkipped');
      window.app?.disableIntroFlow?.();
    });

    await installAuditHelpers(page);

    const captures = [];

    for (const screen of SCREENS) {
      const result = await page.evaluate(
        ({ screenId }) => {
          window.__odqAuditPrepScreen?.(screenId);
          return window.__odqAuditShowScreen(screenId);
        },
        { screenId: screen.id }
      );

      if (!result?.ok) {
        console.warn(`[screen-audit] skip ${screen.id}: ${result?.reason || 'unknown'}`);
        continue;
      }

      await settle(page, waitMs);
      const file = `${screen.slug}.png`;
      await page.screenshot({ path: path.join(outDir, file) });
      captures.push({ ...screen, file });
      console.log(`[screen-audit] ${file}`);
    }

    // Quilt scroll zones (screen-quilt must already be visible from prior loop)
    await page.evaluate(() => window.__odqAuditShowScreen('screen-quilt'));
    await settle(page, waitMs);

    for (const zone of QUILT_ZONES) {
      const scrolled = await page.evaluate((selector) => window.__odqAuditScrollTo(selector), zone.selector);
      if (!scrolled?.ok) {
        console.warn(`[screen-audit] skip ${zone.slug}: ${scrolled?.reason || 'scroll failed'}`);
        continue;
      }
      await settle(page, waitMs);
      const file = `${zone.slug}.png`;
      await page.screenshot({ path: path.join(outDir, file) });
      captures.push({ ...zone, file });
      console.log(`[screen-audit] ${file}`);
    }

    writeContactSheet(outDir, captures);
    console.log(`[screen-audit] contact sheet: ${path.join(outDir, 'index.html')}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[screen-audit] failed:', err);
  process.exit(1);
});
