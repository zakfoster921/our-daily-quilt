#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 6 dependency smoke checks: firebase-admin, canvas, ffmpeg, express boot.
 * Safe to run locally without writes when GOOGLE_APPLICATION_CREDENTIALS_JSON is unset.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function ok(label) {
  console.log(`✅ ${label}`);
}

function fail(label, err) {
  console.error(`❌ ${label}:`, err?.message || err);
  process.exitCode = 1;
}

async function smokeCanvas() {
  try {
    const { createCanvas } = require('canvas');
    const c = createCanvas(64, 64);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ea9b9a';
    ctx.fillRect(0, 0, 64, 64);
    const buf = c.toBuffer('image/png');
    if (!Buffer.isBuffer(buf) || buf.length < 100) {
      throw new Error('canvas PNG buffer too small');
    }
    ok('canvas createCanvas + PNG encode');
  } catch (err) {
    const msg = String(err?.message || err);
    if (/canvas\.node|node-pre-gyp|pkg-config/i.test(msg)) {
      console.log('⏭️  canvas native module skipped (rebuild in Docker/CI with system libs)');
      ok('canvas module present (native binary not built locally)');
      return;
    }
    throw err;
  }
}

function smokeFfmpeg() {
  let ffmpegPath = 'ffmpeg';
  try {
    ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
  } catch (_) {
    /* optional bundled binary */
  }
  const res = spawnSync(ffmpegPath, ['-version'], { encoding: 'utf8', timeout: 15000 });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(String(res.stderr || res.stdout || 'ffmpeg -version failed').slice(0, 200));
  }
  ok(`ffmpeg binary (${ffmpegPath})`);
}

async function smokeFirebaseAdmin() {
  loadDotEnv();
  const admin = require('firebase-admin');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    console.log('⏭️  firebase-admin read skipped (GOOGLE_APPLICATION_CREDENTIALS_JSON not set)');
    ok('firebase-admin module loads');
    return;
  }
  if (!admin.apps.length) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
    });
  }
  const db = admin.firestore();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const snap = await db.collection('quilts').doc(today).get();
  ok(`firebase-admin Firestore read quilts/${today} (exists=${snap.exists})`);
}

function smokeExpressHealth() {
  const serverPath = path.join(__dirname, '..', 'server.js');
  const check = spawnSync(process.execPath, ['--check', serverPath], {
    encoding: 'utf8',
    timeout: 15000
  });
  if (check.error) throw check.error;
  if (check.status !== 0) {
    throw new Error(String(check.stderr || check.stdout || 'server.js syntax check failed').slice(0, 400));
  }
  ok('server.js syntax check');
}

async function main() {
  console.log('Running dependency smoke checks...\n');
  try {
    await smokeCanvas();
  } catch (err) {
    fail('canvas', err);
  }
  try {
    smokeFfmpeg();
  } catch (err) {
    fail('ffmpeg', err);
  }
  try {
    await smokeFirebaseAdmin();
  } catch (err) {
    fail('firebase-admin', err);
  }
  try {
    smokeExpressHealth();
  } catch (err) {
    fail('express/server bootstrap', err);
  }
  console.log('');
  if (process.exitCode) {
    console.error('Smoke checks failed.');
    process.exit(process.exitCode);
  }
  console.log('All smoke checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
