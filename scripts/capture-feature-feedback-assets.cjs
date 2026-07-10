#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Capture real quilt-screen screenshots for the hidden feature feedback feed.
 *
 * Usage:
 *   npm start
 *   node scripts/capture-feature-feedback-assets.cjs
 *
 * Optional:
 *   FEEDBACK_COLOR_CARD_SOURCE=/path/to/color-card.png
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const sharp = require('sharp');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'feedback');
const APP_URL = process.env.FEEDBACK_CAPTURE_URL || 'http://127.0.0.1:3000/our-daily-beta.html';
const WAIT_MS = Number(process.env.FEEDBACK_CAPTURE_WAIT_MS || 700);
const COLOR_CARD_SOURCE = String(process.env.FEEDBACK_COLOR_CARD_SOURCE || '').trim();

const FEATURES = [
  {
    id: 'color-card',
    label: 'Color Card',
    prep: 'colorCard'
  },
  {
    id: 'name-ballot',
    label: 'Name the Quilt Ballot',
    prep: 'nameBallot'
  },
  {
    id: 'quote-duos',
    label: 'Quote Clipping / Scratch-Off Duos',
    prep: 'quoteDuos',
    selector: '#screen-quilt .quote-card-stack'
  },
  {
    id: 'speaker-section',
    label: 'Speaker Section',
    prep: 'speakerSection',
    selector: '#quoteSpeakerWidget'
  },
  {
    id: 'reflection-section',
    label: 'Reflection Section',
    prep: 'reflectionSection',
    selector: '#quiltReflectionScrapWidget'
  },
  {
    id: 'ig-story-share',
    label: 'IG Story Share',
    prep: 'igStoryShare',
    selector: '#quiltLayoutBPreviewWrap .quilt-layout-b-preview-sheet'
  },
  {
    id: 'before-you-go-watch-for',
    label: 'Before You Go: Watch For',
    prep: 'watchFor',
    selector: '#beforeYouGoWatchTape'
  },
  {
    id: 'before-you-go-companion',
    label: 'Before You Go: Companion Piece',
    prep: 'companionPiece',
    selector: '#beforeYouGoExploreTape'
  },
  {
    id: 'reminders-screen',
    label: 'Reminders Screen',
    screen: 'screen-remember-today',
    prep: 'remindersScreen',
    selector: '#screen-remember-today .remember-today-items'
  },
  {
    id: 'studio-floor',
    label: 'Studio Floor',
    screen: 'screen-social-posts',
    prep: 'studioFloor',
    selector: '#screen-social-posts'
  }
];

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

async function waitForAppReady(page, timeoutMs = 120000) {
  await page.waitForFunction(() => !!window.app && !!window.app.uiService, undefined, { timeout: timeoutMs });
  await page.waitForFunction(
    () =>
      !!window.app &&
      !!window.app.quiltEngine &&
      Array.isArray(window.app.quiltEngine.blocks) &&
      window.app.quiltEngine.blocks.length > 0,
    undefined,
    { timeout: timeoutMs }
  ).catch(() => {
    console.warn('[feature-feedback-capture] quilt blocks not loaded; captures may be sparse');
  });
}

async function settle(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {
        /* ignore */
      }
    }
  });
  await page.waitForTimeout(WAIT_MS);
}

async function installCaptureHelpers(page) {
  await page.evaluate(() => {
    const showScreen = (screenId) => {
      const app = window.app;
      app?.disableIntroFlow?.();
      if (app) app._flowTransitioning = false;

      document.querySelectorAll('.screen').forEach((screen) => {
        screen.classList.remove('active');
        screen.style.display = 'none';
        screen.setAttribute('aria-hidden', 'true');
      });

      const target = document.getElementById(screenId);
      if (!target) return false;
      target.style.display =
        screenId === 'screen-remember-today' ||
        screenId === 'screen-remember-today-view' ||
        screenId === 'screen-social-posts'
          ? 'block'
          : 'flex';
      target.classList.add('active');
      target.removeAttribute('hidden');
      target.setAttribute('aria-hidden', 'false');

      const rememberActive = screenId === 'screen-remember-today' || screenId === 'screen-remember-today-view';
      document.documentElement.classList.toggle('odq-remember-today-active', rememberActive);
      document.body.classList.toggle('odq-remember-today-active', rememberActive);
      const socialActive = screenId === 'screen-social-posts';
      document.documentElement.classList.toggle('odq-social-posts-active', socialActive);
      document.body.classList.toggle('odq-social-posts-active', socialActive);

      if (screenId === 'screen-quilt') {
        app?.renderQuilt?.();
        app?.refreshQuiltReflectionScrapWidget?.();
      }
      if (screenId === 'screen-remember-today') {
        app?.prepareRememberTodayScreen?.();
      }
      return true;
    };

    const scrollToSelector = (selector) => {
      const target = document.querySelector(selector);
      if (!target) return false;
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      return true;
    };

    const hideFloatingSurveyStates = () => {
      const color = document.getElementById('quiltUserColorCardWrap');
      if (color) {
        color.hidden = true;
        color.setAttribute('aria-hidden', 'true');
      }
      const ballot = document.getElementById('quiltNameBallotWrap');
      if (ballot) {
        ballot.hidden = true;
        ballot.setAttribute('aria-hidden', 'true');
      }
    };

    const ensureText = (id, value) => {
      const el = document.getElementById(id);
      if (el && !String(el.textContent || '').trim()) el.textContent = value;
    };

    window.__odqFeedbackCapture = {
      showScreen,
      async prep(kind, selector) {
        const app = window.app;
        const screenId =
          kind === 'remindersScreen'
            ? 'screen-remember-today'
            : kind === 'studioFloor'
              ? 'screen-social-posts'
              : 'screen-quilt';

        showScreen(screenId);
        hideFloatingSurveyStates();

        if (kind === 'colorCard') {
          const stage = document.getElementById('quiltFabricColorStage');
          const wrap = document.getElementById('quiltUserColorCardWrap');
          const card = document.getElementById('quiltUserShapeCard');
          const swatch = document.getElementById('quiltUserShapeSwatch');
          const label = document.getElementById('quiltUserShapeColorLabel');
          if (stage) {
            stage.style.display = 'flex';
            stage.style.position = 'fixed';
            stage.style.inset = '0';
            stage.style.maxWidth = 'none';
            stage.style.justifyContent = 'center';
            stage.style.zIndex = '120';
            stage.style.pointerEvents = 'none';
          }
          if (wrap && card) {
            const color = '#4040e5';
            swatch?.style.setProperty('--quilt-user-piece-color', color);
            card.style.setProperty('--quilt-user-piece-color', color);
            card.style.setProperty('--quilt-color-swatch-tab', '#eef0ff');
            if (label) {
              label.innerHTML =
                '<span class="quilt-user-shape-card__color-name">Worn Patina</span><span class="quilt-user-shape-card__color-hex">#4040E5</span>';
            }
            wrap.hidden = false;
            wrap.removeAttribute('hidden');
            wrap.removeAttribute('aria-hidden');
          }
          document.getElementById('screen-quilt')?.scrollTo?.(0, 0);
          return true;
        }

        if (kind === 'nameBallot') {
          const wrap = document.getElementById('quiltNameBallotWrap');
          const cloud = document.getElementById('quiltNameBallotCloud');
          const status = document.getElementById('quiltNameBallotStatus');
          if (wrap && cloud) {
            wrap.hidden = false;
            wrap.removeAttribute('hidden');
            wrap.removeAttribute('aria-hidden');
            cloud.classList.remove('admin-name-cloud--pending-note');
            const words = [
              'Cerulean', 'Ember', 'Confluence', 'Velvet', 'Meridian',
              'Sapphire', 'Kindle', 'Threshold', 'Prism', 'Indigo'
            ];
            cloud.innerHTML = [
              '<span class="admin-name-card-paper" aria-hidden="true"></span>',
              '<img class="admin-name-card-bg" src="assets/quilt-name-card.webp?v=4" alt="" aria-hidden="true" decoding="async" draggable="false">',
              ...words.map((word, idx) => {
                const col = idx >= 5 ? 1 : 0;
                const row = idx % 5;
                const slotTop = `calc(33% + ${row} * 9.2%)`;
                const slotLeft = col ? '56%' : '17%';
                return `<button type="button" class="admin-name-card-slot admin-name-cloud-word" style="--admin-name-slot-top:${slotTop};--admin-name-slot-left:${slotLeft};" data-word="${word}"><span class="admin-name-cloud-word-label">${word}</span></button>`;
              })
            ].join('');
            if (status) status.hidden = true;
          }
          return scrollToSelector('#quiltNameBallotWrap');
        }

        if (kind === 'quoteDuos') {
          app?.quoteService?.displayQuote?.();
          const clipping = document.querySelector('#screen-quilt .quilt-quote-display');
          if (clipping) {
            clipping.hidden = false;
            clipping.removeAttribute('aria-hidden');
            clipping.querySelector('.quilt-quote-text')?.textContent?.trim();
          }
        }

        if (kind === 'speakerSection') {
          const widget = document.getElementById('quoteSpeakerWidget');
          widget?.removeAttribute('hidden');
          ensureText('quoteSpeakerName', 'Octavia Butler');
          ensureText('quoteSpeakerDates', '1947-2006');
          ensureText('quoteSpeakerGuide', 'A writer whose work keeps asking what we owe one another.');
          document.getElementById('quoteSpeakerDates')?.removeAttribute('hidden');
          document.getElementById('quoteSpeakerBioSlab')?.removeAttribute('hidden');
        }

        if (kind === 'reflectionSection') {
          ensureText('quiltReflectionScrapText', 'Where did you notice a small opening today?');
        }

        if (kind === 'igStoryShare') {
          app?._scheduleStoryPreviewOnce?.();
          app?.scheduleLayoutBStoryPreviewRefresh?.();
          const hint = document.getElementById('quiltLayoutBPreviewHint');
          if (hint) hint.textContent = 'Long Tap to Share on Instagram';
          const img = document.getElementById('quiltLayoutBPreviewImg');
          if (img && !img.getAttribute('src')) {
            const svg = document.getElementById('quilt');
            const serialized = svg ? new XMLSerializer().serializeToString(svg) : '';
            const encoded = serialized
              ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`
              : '';
            if (encoded) {
              img.src = encoded;
              img.hidden = false;
            }
          }
        }

        if (kind === 'watchFor') {
          ensureText('beforeYouGoWatchForBody', 'a color that keeps showing up around you.');
          document.getElementById('beforeYouGoWatchTape')?.removeAttribute('hidden');
        }

        if (kind === 'companionPiece') {
          ensureText('beforeYouGoExploreTitle', 'A small song for the walk home');
          const desc = document.getElementById('beforeYouGoExploreDesc');
          if (desc) {
            desc.textContent = 'Something to carry with the quote.';
            desc.hidden = false;
          }
          document.getElementById('beforeYouGoExploreTape')?.removeAttribute('hidden');
        }

        if (kind === 'remindersScreen') {
          app?.prepareRememberTodayScreen?.();
          document.querySelectorAll('#screen-remember-today .remember-today-item[hidden]').forEach((el) => {
            el.hidden = false;
          });
        }

        if (kind === 'studioFloor') {
          const feed = document.getElementById('socialPostsFeed');
          if (feed) {
            feed.innerHTML = `
              <article class="settings-item social-post-entry social-post-entry--open social-post-entry--latest">
                <div class="settings-item__slab social-post-entry__slab">
                  <p class="social-post-entry-caption">
                    <strong class="social-post-entry-caption-date">Today:</strong>
                    <span class="social-post-entry-caption-text">I loved seeing this blue show up in the quilt today.</span>
                  </p>
                  <div class="social-post-entry-comments">
                    <div class="social-post-comments">
                      <p class="social-post-comment">This one made me smile.</p>
                    </div>
                  </div>
                </div>
              </article>
            `;
          }
        }

        if (selector) return scrollToSelector(selector);
        return true;
      }
    };
  });
}

async function saveCompressedScreenshot(page, filePath) {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  await sharp(buffer)
    .resize({ width: 780, withoutEnlargement: true })
    .webp({ quality: 84 })
    .toFile(filePath);
}

async function main() {
  const reachable = await probeUrl(APP_URL);
  if (!reachable) {
    console.error(`[feature-feedback-capture] Could not reach ${APP_URL}`);
    console.error('[feature-feedback-capture] Start the app first: npm start');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[feature-feedback-capture] URL: ${APP_URL}`);
  console.log(`[feature-feedback-capture] Out: ${OUT_DIR}`);

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
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForAppReady(page);
    await page.evaluate(() => {
      localStorage.setItem('ourDailyHasVisited', 'true');
      localStorage.setItem('ourDailyUserFirstName', 'Friend');
      window.app?.disableIntroFlow?.();
    });
    await installCaptureHelpers(page);

    await page.evaluate(() => {
      window.__odqFeedbackCapture?.showScreen?.('screen-quilt');
      const color = document.getElementById('quiltUserColorCardWrap');
      if (color) {
        color.hidden = true;
        color.setAttribute('aria-hidden', 'true');
      }
      const ballot = document.getElementById('quiltNameBallotWrap');
      if (ballot) {
        ballot.hidden = true;
        ballot.setAttribute('aria-hidden', 'true');
      }
      document.getElementById('screen-quilt')?.scrollTo?.(0, 0);
    });
    await settle(page);
    await saveCompressedScreenshot(page, path.join(OUT_DIR, 'quilt-backdrop.webp'));
    console.log('[feature-feedback-capture] quilt-backdrop.webp');

    for (const feature of FEATURES) {
      await page.evaluate(
        ({ prep, selector }) => window.__odqFeedbackCapture?.prep?.(prep, selector),
        { prep: feature.prep, selector: feature.selector || '' }
      );
      await settle(page);
      const file = `${feature.id}.webp`;
      await saveCompressedScreenshot(page, path.join(OUT_DIR, file));
      console.log(`[feature-feedback-capture] ${file} — ${feature.label}`);
    }

    if (COLOR_CARD_SOURCE && fs.existsSync(COLOR_CARD_SOURCE)) {
      await sharp(COLOR_CARD_SOURCE)
        .resize({ width: 780, withoutEnlargement: true })
        .webp({ quality: 84 })
        .toFile(path.join(OUT_DIR, 'color-card.webp'));
      console.log('[feature-feedback-capture] color-card.webp — replaced from FEEDBACK_COLOR_CARD_SOURCE');
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[feature-feedback-capture] failed:', error);
  process.exit(1);
});
