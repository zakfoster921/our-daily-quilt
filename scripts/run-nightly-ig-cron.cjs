#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Railway Cron entrypoint: same job as .github/workflows/nightly-instagram-snapshot.yml
 * (GitHub delays scheduled runs by hours, which can miss the ~12:00 UTC Zapier post).
 *
 * Steps (same order as the workflow):
 *   1. Final Instagram stills for the last completed quilt day (generate-nightly-ig-images.cjs)
 *   2. Newspaper clipping for the active day (skipped if one newer than the quote assignment already exists)
 *   3. Speaker portrait bake for both days (non-fatal)
 *
 * Env (set on the Railway service):
 *   RESET_URL (ending /api/daily-reset), GOOGLE_APPLICATION_CREDENTIALS_JSON,
 *   FIREBASE_STORAGE_BUCKET, optional DATE_KEY (YYYY-MM-DD, overrides last completed day)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getAppDateKey, addDays } = require('./lib/app-date-key.cjs');

const ROOT = path.join(__dirname, '..');
const PORT = 8765;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.csv': 'text/csv', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function run(script, env, timeoutMin) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(__dirname, script)], { env, stdio: 'inherit' });
    const timer = setTimeout(() => {
      console.error(`[nightly-cron] ${script} timed out after ${timeoutMin} min`);
      child.kill('SIGKILL');
    }, timeoutMin * 60 * 1000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/** Mirrors the workflow's "Check if tomorrow's newspaper clipping is fresh" step. */
async function clippingIsFresh(dateKey) {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return false;
  try {
    const admin = require('firebase-admin');
    const sa = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
    const db = admin.firestore();
    const [assignSnap, igSnap] = await Promise.all([
      db.collection(process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments').doc(dateKey).get(),
      db.collection('instagram-images').doc(dateKey).get(),
    ]);
    const assign = assignSnap.exists ? assignSnap.data() || {} : {};
    const ig = igSnap.exists ? igSnap.data() || {} : {};
    const url = String(ig.newspaperClippingUrl || ig.newspaperClippingImageStorageUrl || '').trim();
    const assignedAt = Date.parse(String(assign.assignedAt || '').trim());
    const clippingAt = Date.parse(
      String(ig.newspaperClippingGeneratedAt || ig.lastIgPushCompletedAt || ig.lastUpdated || '').trim()
    );
    return !!url && (!Number.isFinite(assignedAt) || (Number.isFinite(clippingAt) && clippingAt >= assignedAt));
  } catch (e) {
    console.error('[nightly-cron] freshness check failed, will regenerate:', e?.message || e);
    return false;
  }
}

async function main() {
  const resetUrl = String(process.env.RESET_URL || '').trim();
  if (!resetUrl) throw new Error('Missing RESET_URL');

  const lastCompleted = process.env.DATE_KEY || addDays(getAppDateKey(new Date()), -1);
  const today = addDays(lastCompleted, 1);
  console.log(`[nightly-cron] last completed=${lastCompleted} active=${today}`);

  const base = {
    ...process.env,
    APP_URL: `http://127.0.0.1:${PORT}/our-daily-beta.html`,
    API_BASE_URL: resetUrl.replace(/\/api\/daily-reset$/, ''),
  };

  // 1. Final stills for the last completed day.
  const stillsOk = await run(
    'generate-nightly-ig-images.cjs',
    { ...base, DATE_KEY: lastCompleted, NIGHTLY_IG_MAX_ATTEMPTS: '2', NIGHTLY_IG_ARTIFACTS_DIR: '/tmp/nightly-ig-artifacts' },
    22
  );

  // 2. Clipping for the active day (skip if already fresh).
  let clippingOk = true;
  if (await clippingIsFresh(today)) {
    console.log(`[nightly-cron] clipping for ${today} already fresh; skipping`);
  } else {
    clippingOk = await run(
      'generate-nightly-ig-images.cjs',
      {
        ...base,
        DATE_KEY: today,
        NIGHTLY_IG_CLIPPING_ONLY: 'true',
        NIGHTLY_IG_SKIP_SCHEDULE_GUARD: 'true',
        NIGHTLY_IG_MAX_ATTEMPTS: '3',
        NIGHTLY_IG_ARTIFACTS_DIR: '/tmp/nightly-ig-artifacts-today',
      },
      15
    );
  }

  // 3. Speaker portrait bake (non-fatal).
  for (const dk of [lastCompleted, today]) {
    console.log(`[nightly-cron] == bake ${dk} ==`);
    const ok = await run(
      'generate-speaker-portrait.cjs',
      { ...base, PREVIEW: '0', DATE_KEY: dk, ARTIFACTS_DIR: `/tmp/speaker-portrait-${dk}` },
      6
    );
    if (!ok) console.error(`[nightly-cron] bake ${dk} failed (non-fatal)`);
  }

  return stillsOk && clippingOk;
}

server.listen(PORT, '127.0.0.1', async () => {
  let ok = false;
  try {
    ok = await main();
  } catch (e) {
    console.error('[nightly-cron] fatal:', e?.message || e);
  }
  server.close();
  process.exit(ok ? 0 : 1);
});
