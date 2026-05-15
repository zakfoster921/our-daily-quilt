#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Delete legacy versioned Instagram/Zapier assets under `instagram-zapier/`
 * (client used to write `classic-{timestamp}-….png`, etc.). Current client
 * overwrites stable names: classic.png, layout-b.png, layout-b-speaker.png.
 *
 * Never deletes stable objects: classic.png, layout-b.png, layout-b-speaker.png,
 * reel.webm, reel-nightly.mp4, reel.mp4.
 *
 * By default does NOT delete `debug-raw-quilt-*.png` (forensics). Pass
 * `--include-debug` to remove those too.
 *
 * Usage:
 *   node scripts/cleanup-instagram-zapier-versioned-assets.cjs
 *   node scripts/cleanup-instagram-zapier-versioned-assets.cjs --commit
 *   node scripts/cleanup-instagram-zapier-versioned-assets.cjs --commit --include-debug
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS_JSON (or application default credentials),
 *      FIREBASE_PROJECT_ID (default: our-daily),
 *      FIREBASE_STORAGE_BUCKET (default: our-daily.firebasestorage.app)
 */

try {
  require('dotenv').config();
} catch (_) {
  /* optional */
}

const path = require('path');
const admin = require('firebase-admin');

const STABLE_BASE_NAMES = new Set([
  'classic.png',
  'layout-b.png',
  'layout-b-speaker.png',
  'reel.webm',
  'reel-nightly.mp4',
  'reel.mp4'
]);

function parseArgs(argv) {
  return {
    commit: argv.includes('--commit'),
    includeDebug: argv.includes('--include-debug')
  };
}

function initAdmin() {
  if (admin.apps.length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID || 'our-daily';
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET || 'our-daily.firebasestorage.app';
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId,
      storageBucket
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
      storageBucket
    });
  }
}

function shouldDeleteObject(fileName, { includeDebug }) {
  const base = path.posix.basename(fileName);
  if (!fileName.startsWith('instagram-zapier/')) return false;
  if (STABLE_BASE_NAMES.has(base)) return false;

  if (/^classic-.*\.png$/i.test(base)) return true;
  if (/^layout-b-speaker-.*\.png$/i.test(base)) return true;
  if (/^layout-b-.*\.png$/i.test(base)) return true;

  if (includeDebug && /^debug-raw-quilt-.*\.png$/i.test(base)) return true;

  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  initAdmin();
  const bucket = admin.storage().bucket();

  const [files] = await bucket.getFiles({ prefix: 'instagram-zapier/', autoPaginate: true });
  const targets = files.filter((f) => shouldDeleteObject(f.name, args));

  console.log(
    `[cleanup-instagram-zapier] mode=${args.commit ? 'COMMIT (delete)' : 'dry-run'} includeDebug=${args.includeDebug}`
  );
  console.log(`[cleanup-instagram-zapier] scanned ${files.length} object(s), ${targets.length} candidate(s) for deletion`);

  if (!targets.length) {
    console.log('[cleanup-instagram-zapier] nothing to do');
    return;
  }

  if (!args.commit) {
    targets.slice(0, 40).forEach((f) => console.log(`  would delete: ${f.name}`));
    if (targets.length > 40) console.log(`  … and ${targets.length - 40} more`);
    console.log('[cleanup-instagram-zapier] re-run with --commit to delete');
    return;
  }

  let deleted = 0;
  const chunkSize = 20;
  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (f) => {
        try {
          await f.delete();
          deleted += 1;
        } catch (e) {
          const code = e && (e.code || e.status);
          if (code === 404) return;
          console.warn(`[cleanup-instagram-zapier] failed: ${f.name}`, e.message || e);
        }
      })
    );
  }
  console.log(`[cleanup-instagram-zapier] deleted ${deleted} object(s)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[cleanup-instagram-zapier] fatal:', err);
    process.exit(1);
  });
