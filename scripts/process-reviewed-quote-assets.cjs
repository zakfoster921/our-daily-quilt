#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * When a Notion quote is marked reviewed, generate speaker cutout + newspaper clipping
 * and write preview URLs back to Notion (speaker_cutout, quote_clipping).
 *
 * Usage:
 *   node scripts/process-reviewed-quote-assets.cjs --page-id=<notion-page-id>
 *
 * Env: NOTION_TOKEN, NOTION_DATABASE_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON,
 *      REMOVE_BG_API_KEY (cutout), APP_URL + RESET_URL (clipping via Playwright),
 *      FIREBASE_STORAGE_BUCKET, FIRESTORE_* collections.
 */
try {
  require('dotenv').config();
} catch (_) {
  /* optional in CI */
}

const path = require('path');
const { spawnSync } = require('child_process');
const admin = require('firebase-admin');
const { runNightlyIgAttempt } = require('./generate-nightly-ig-images.cjs');
const {
  buildNotionQuoteAssetProperties,
  isReviewedNotionPage,
  notionGetDatabaseSchema,
  notionGetPage,
  notionPatchPage,
  readExistingNotionAssets
} = require('./lib/notion-quote-assets.cjs');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = {
    pageId: '',
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    skipCutout: argv.includes('--skip-cutout'),
    skipClipping: argv.includes('--skip-clipping')
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--page-id=')) opts.pageId = a.slice('--page-id='.length).trim();
    else if (a === '--page-id' && argv[i + 1]) opts.pageId = String(argv[++i]).trim();
    else if (a.startsWith('--doc=')) opts.pageId = a.slice('--doc='.length).trim();
  }
  return opts;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error(`Missing required env var: ${name}`);
  return String(value).trim();
}

function initFirestore() {
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

function isDateKey(id) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(id || '').trim());
}

function readClippingUrl(data) {
  return String(data?.newspaperClippingUrl || data?.newspaperClippingImageStorageUrl || '').trim();
}

function runNodeScript(scriptName, args, label) {
  const scriptPath = path.join(ROOT, 'scripts', scriptName);
  console.log(`[reviewed-assets] ${label}: node ${scriptName} ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? 1})`);
  }
}

async function readQuoteAssets(db, pageId, dateKey) {
  const quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const quoteSnap = await db.collection(quotesCollection).doc(pageId).get();
  const quote = quoteSnap.exists ? quoteSnap.data() || {} : {};
  let clippingUrl = '';
  if (dateKey) {
    const igSnap = await db.collection('instagram-images').doc(dateKey).get();
    if (igSnap.exists) clippingUrl = readClippingUrl(igSnap.data() || {});
  }
  return {
    speakerCutoutUrl: String(quote.speakerCutoutUrl || quote.speaker_cutout_url || '').trim(),
    quoteClippingUrl: clippingUrl,
    dateScheduled: String(quote.dateScheduled || quote.date_scheduled || dateKey || '').trim()
  };
}

async function resolveScheduledDateKey(db, pageId) {
  const quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';
  const quoteSnap = await db.collection(quotesCollection).doc(pageId).get();
  const quote = quoteSnap.exists ? quoteSnap.data() || {} : {};
  const fromCatalog = String(quote.dateScheduled || quote.date_scheduled || '').trim();
  if (isDateKey(fromCatalog)) return fromCatalog;

  const assignSnap = await db.collection(assignmentsCollection).where('sourceId', '==', pageId).get();
  const dates = assignSnap.docs.map((d) => d.id).filter(isDateKey).sort();
  return dates.length ? dates[dates.length - 1] : '';
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.pageId) {
    throw new Error('--page-id=<notion-page-id> is required');
  }

  const notionToken = requireEnv('NOTION_TOKEN');
  const databaseId = requireEnv('NOTION_DATABASE_ID');
  const db = initFirestore();

  const [page, schema] = await Promise.all([
    notionGetPage(opts.pageId, notionToken),
    notionGetDatabaseSchema(databaseId, notionToken)
  ]);

  if (!isReviewedNotionPage(page)) {
    console.log(`[reviewed-assets] skip ${opts.pageId}: reviewed is not checked in Notion`);
    return;
  }

  const existing = readExistingNotionAssets(page, schema);
  if (!existing.speakerProp && !existing.clippingProp) {
    throw new Error(
      'Notion database is missing speaker_cutout and/or quote_clipping properties'
    );
  }

  const hasBoth =
    existing.speakerCutoutUrl &&
    existing.quoteClippingUrl &&
    !opts.force;
  if (hasBoth) {
    console.log(`[reviewed-assets] skip ${opts.pageId}: Notion already has both asset previews (use --force to regenerate)`);
    return;
  }

  if (opts.dryRun) {
    console.log(
      `[reviewed-assets] dry-run ${opts.pageId}: would sync, cutout=${!opts.skipCutout}, clipping=${!opts.skipClipping}`
    );
    return;
  }

  runNodeScript('sync-notion-to-firestore.cjs', [`--page-id=${opts.pageId}`], 'sync Notion page');
  runNodeScript(
    'reconcile-assignment-dates-from-notion.cjs',
    ['--start=today'],
    'reconcile assignments from Notion dates'
  );

  const dateKey = await resolveScheduledDateKey(db, opts.pageId);
  if (!dateKey) {
    console.warn(
      `[reviewed-assets] no date_scheduled for ${opts.pageId}; clipping will be skipped (set date_scheduled in Notion first)`
    );
  }

  if (!opts.skipCutout) {
    const cutoutArgs = [`--doc=${opts.pageId}`, '--limit=1', '--require-reviewed'];
    if (opts.force) cutoutArgs.push('--force');
    try {
      runNodeScript('process-speaker-cutouts.cjs', cutoutArgs, 'speaker cutout');
    } catch (err) {
      console.warn(`[reviewed-assets] speaker cutout failed: ${err.message}`);
    }
  }

  let clippingGenerated = false;
  if (!opts.skipClipping && dateKey) {
    const appUrl = String(process.env.APP_URL || '').trim();
    const resetUrl = String(process.env.RESET_URL || '').trim();
    if (!appUrl || !resetUrl) {
      console.warn('[reviewed-assets] APP_URL and RESET_URL required for quote clipping; skipping clipping step');
    } else {
      const apiBase = resetUrl.replace(/\/api\/daily-reset\/?$/, '');
      console.log(`[reviewed-assets] generating newspaper clipping for ${dateKey}…`);
      await runNightlyIgAttempt({
        appUrl,
        apiBase,
        dateKey,
        attempt: 1,
        outDir: path.join(ROOT, 'tmp', 'reviewed-quote-clipping', opts.pageId.replace(/[^\w-]+/g, '_')),
        strictQuote: true,
        clippingOnly: true
      });
      clippingGenerated = true;
    }
  }

  const assets = await readQuoteAssets(db, opts.pageId, dateKey);
  const { properties, speakerProp, clippingProp } = buildNotionQuoteAssetProperties(schema, assets);

  if (!Object.keys(properties).length) {
    throw new Error(
      `No assets to write back to Notion (cutout=${assets.speakerCutoutUrl || 'missing'}, clipping=${assets.quoteClippingUrl || 'missing'})`
    );
  }

  await notionPatchPage(opts.pageId, notionToken, { properties });
  console.log(
    `[reviewed-assets] patched Notion page ${opts.pageId}` +
      (speakerProp && assets.speakerCutoutUrl ? ` speaker_cutout=${assets.speakerCutoutUrl}` : '') +
      (clippingProp && assets.quoteClippingUrl ? ` quote_clipping=${assets.quoteClippingUrl}` : '') +
      (clippingGenerated ? '' : assets.quoteClippingUrl ? '' : ' (clipping unchanged or skipped)')
  );
}

main().catch((err) => {
  console.error('[reviewed-assets] failed:', err.message || err);
  process.exit(1);
});
