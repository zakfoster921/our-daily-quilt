const express = require('express');
const admin = require('firebase-admin');
const { createCanvas } = require('canvas');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');

let ffmpegStaticPath = null;
try {
  ffmpegStaticPath = require('@ffmpeg-installer/ffmpeg').path;
} catch (e) {
  console.warn('⚠️ FFmpeg installer unavailable:', e.message);
}

const { buildSubmittedQuotePrefillPrompt } = require('./lib/submitted-quote-prefill-prompts');
const app = express();
const PORT = process.env.PORT || 3000;
const NOTION_API_VERSION = '2022-06-28';

app.use(express.json());
app.use(express.static('.'));

// In-memory storage for generated images
const imageStore = new Map();

let notionSyncInProgress = false;

function setNotionSyncCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-notion-sync-token');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function tailOutput(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  return `…(truncated)\n${text.slice(-maxLen)}`;
}

/**
 * Runs a .cjs script from /scripts with the same env as the server (Notion + Firestore vars).
 * @param {string} relativeScript e.g. scripts/sync-notion-to-firestore.cjs
 * @param {string[]} [args]
 * @param {number} [timeoutMs]
 */
function runNodeScript(relativeScript, args = [], timeoutMs = 180000) {
  if (typeof args === 'number') {
    timeoutMs = args;
    args = [];
  }
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, relativeScript);
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: __dirname,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Script timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function fetchUrlAsImageDataString(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch stored image (${res.status}): ${url}`);
  }
  const ct = (res.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString('base64');
  if (ct === 'image/jpeg' || ct === 'image/jpg') {
    return `data:image/jpeg;base64,${b64}`;
  }
  return `data:image/png;base64,${b64}`;
}

function resolveFirebaseStorageBucket(serviceAccount) {
  const fromEnv = process.env.FIREBASE_STORAGE_BUCKET;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).trim();
  }
  const fromServiceAccount =
    serviceAccount &&
    typeof serviceAccount.storage_bucket === 'string' &&
    serviceAccount.storage_bucket.trim()
      ? serviceAccount.storage_bucket.trim()
      : '';
  if (fromServiceAccount) {
    return fromServiceAccount;
  }
  const pid =
    (serviceAccount && serviceAccount.project_id) ||
    process.env.FIREBASE_PROJECT_ID ||
    null;
  if (pid && pid !== 'your-project-id') {
    return `${pid}.firebasestorage.app`;
  }
  return undefined;
}

// Initialize Firebase Admin (you'll need to add your service account key)
let db;
try {
  // Use environment variable for service account
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const init = {
      credential: admin.credential.cert(serviceAccount)
    };
    const bucket = resolveFirebaseStorageBucket(serviceAccount);
    if (bucket) init.storageBucket = bucket;
    admin.initializeApp(init);
  } else {
    // Fallback to application default
    const init = {
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || 'your-project-id'
    };
    const bucket = resolveFirebaseStorageBucket(null);
    if (bucket) init.storageBucket = bucket;
    admin.initializeApp(init);
  }
  db = admin.firestore();
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.log('⚠️ Firebase Admin not initialized - will use fallback mode');
  console.error('Firebase error:', error.message);
}

function getFfmpegBinaryPath() {
  return process.env.FFMPEG_PATH || ffmpegStaticPath || 'ffmpeg';
}

function setInstagramApiCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function setPushApiCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-reset-token');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function setResetApiCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-reset-token');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function setQuoteSubmissionCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function setReflectionApiCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-reset-token, x-reflection-theme-token');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function buildFirebaseDownloadUrl(bucketName, objectPath, downloadToken) {
  const enc = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${enc}?alt=media&token=${downloadToken}`;
}

function parsePngDataUrlToBuffer(dataUrl) {
  const m = String(dataUrl).match(/^data:image\/png;base64,(.+)$/i);
  if (!m) {
    throw new Error('Expected PNG data URL from canvas');
  }
  return Buffer.from(m[1], 'base64');
}

async function firebaseSaveDownloadableFile(destination, buffer, contentType) {
  const bucket = admin.storage().bucket();
  const bucketName = bucket.name;
  const token = crypto.randomUUID();
  const file = bucket.file(destination);
  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    }
  });
  return { publicUrl: buildFirebaseDownloadUrl(bucketName, destination, token), bucketName };
}

function normalizeMoodLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

function resolveMoodAliasKey(moodKey) {
  const key = normalizeMoodLabel(moodKey);
  if (!key) return '';
  const aliasMap = {
    calm: 'contemplative',
    reflective: 'contemplative',
    reflection: 'contemplative',
    gentle: 'nurturing',
    nurturing: 'nurturing',
    uplift: 'empowering',
    uplifting: 'empowering',
    powerful: 'empowering',
    bold: 'mobilizing',
    urgent: 'mobilizing',
    energetic: 'mobilizing',
    expansive: 'expansive',
    contemplative: 'contemplative',
    empowering: 'empowering',
    mobilizing: 'mobilizing'
  };
  return aliasMap[key] || key;
}

/**
 * JSON map of mood label -> absolute audio file path.
 * Example:
 * REEL_BED_MUSIC_PATHS_JSON={"calm":"/abs/calm.mp3","joyful":"/abs/joyful.mp3","default":"/abs/default.mp3"}
 */
function getMoodMusicPathMap() {
  const raw = String(process.env.REEL_BED_MUSIC_PATHS_JSON || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [key, maybePath] of Object.entries(parsed)) {
      const moodKey = normalizeMoodLabel(key);
      const p = String(maybePath || '').trim();
      if (!moodKey || !p) continue;
      if (!fsSync.existsSync(p)) {
        console.warn(`⚠️ Mood track path missing for "${key}": ${p}`);
        continue;
      }
      out[moodKey] = path.resolve(p);
    }
    return out;
  } catch (e) {
    console.warn('⚠️ REEL_BED_MUSIC_PATHS_JSON is not valid JSON:', e.message);
    return {};
  }
}

/**
 * Optional bed track for reel MP4s.
 * Priority: mood map env -> single REEL_BED_MUSIC_PATH -> bundled asset.
 * @returns {string|null} absolute path, or null → FFmpeg uses silent AAC via anullsrc
 */
function resolveReelBedMusicPath(moodLabel = '') {
  const moodKey = normalizeMoodLabel(moodLabel);
  const moodAliasKey = resolveMoodAliasKey(moodKey);
  const moodMap = getMoodMusicPathMap();
  if (moodAliasKey && moodMap[moodAliasKey]) return moodMap[moodAliasKey];
  if (moodKey && moodMap[moodKey]) return moodMap[moodKey];
  if (moodMap.default) return moodMap.default;
  const fromEnv = process.env.REEL_BED_MUSIC_PATH;
  if (fromEnv && typeof fromEnv === 'string') {
    const p = fromEnv.trim();
    if (p && fsSync.existsSync(p)) return path.resolve(p);
  }
  const bundled = path.join(__dirname, 'assets', 'audio', 'freepik-stonecutters.mp3');
  if (fsSync.existsSync(bundled)) return bundled;
  return null;
}

/** FFmpeg args for input index 1: looped MP3 or silent stereo bed */
function reelBedAudioInputArgs(musicPath) {
  if (musicPath) {
    return ['-stream_loop', '-1', '-i', musicPath];
  }
  return ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];
}

/** Matches `_buildSyntheticQuiltReelWebm` (fps: 30). Canvas WebM often has broken PTS → half-speed / doubled-duration MP4 without CFR remap. */
const REEL_SYNTHETIC_TARGET_FPS = 30;
/** Server-side safety hold so reel.mp4 always starts on frame 1, even if browser-side cover timing regresses. */
const REEL_MP4_FIRST_FRAME_HOLD_SEC = 0.3;

function runFfmpegPngLoopToMp4(ffmpegPath, pngPath, outPath, durationSec = 8, moodLabel = '') {
  return new Promise((resolve, reject) => {
    const musicPath = resolveReelBedMusicPath(moodLabel);
    const vf =
      'format=yuv420p,scale=1080:1920:force_original_aspect_ratio=decrease,' +
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2';
    /** `-framerate` before `-i` fixes image2 default (~25fps) vs wall `t=` mismatches; audio trimmed with `-shortest` */
    const args = [
      '-y',
      '-framerate',
      String(REEL_SYNTHETIC_TARGET_FPS),
      '-loop',
      '1',
      '-t',
      String(durationSec),
      '-i',
      pngPath,
      ...reelBedAudioInputArgs(musicPath),
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(REEL_SYNTHETIC_TARGET_FPS),
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      musicPath ? '192k' : '96k',
      '-shortest',
      outPath
    ];
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited ${code}: ${tailOutput(stderr, 4000)}`));
    });
  });
}

/** If an app-uploaded synthetic reel exists, nightly should refresh classic PNG only — not replace reel MP4. */
function shouldProtectInstagramReelFromNightlyOverwrite(pre) {
  if (!pre || typeof pre !== 'object') return false;
  if (pre.reelWebmStorageUrl || pre.reelUrl) return true;
  const src = pre.reelSource;
  if (src && src !== 'nightly_static_mp4') return true;
  return false;
}

/**
 * Reads quilt + quote from Firestore, renders classic 4:5 PNG (same helper as server IG image),
 * uploads classic; optionally an 8s H.264 MP4 (static frame, 9:16) when no app reel is present.
 * Intended ~6:30 UTC before /api/daily-reset at 7:00 UTC. Unattended Zapier path when nobody opens the app.
 */
async function runNightlyInstagramSnapshot(options = {}) {
  if (!db) {
    throw new Error('Firestore not initialized');
  }
  const dateKey =
    options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) ? options.date : getAppDateKey();

  const quiltSnap = await db.collection('quilts').doc(dateKey).get();
  if (!quiltSnap.exists) {
    return { success: false, date: dateKey, reason: 'no_quilt_doc' };
  }
  const quiltData = quiltSnap.data() || {};
  const blocks = quiltData.blocks;
  if (!Array.isArray(blocks) || blocks.length <= 1) {
    return { success: false, date: dateKey, reason: 'insufficient_blocks' };
  }

  const quoteSnap = await db.collection('quotes').doc(dateKey).get();
  const qd = quoteSnap.exists ? quoteSnap.data() : {};
  const quoteLine = formatZapierCaptionFromQuoteData(qd) || 'Every day is a new beginning.';
  const quoteMood = String(qd?.mood || '').trim();

  const pngDataUrl = await generateInstagramImageFromQuilt(blocks, quoteLine);
  const pngBuf = parsePngDataUrlToBuffer(pngDataUrl);

  const docRef = db.collection('instagram-images').doc(dateKey);
  const preSnap = await docRef.get();
  const pre = preSnap.exists ? preSnap.data() : {};
  const protectReel = shouldProtectInstagramReelFromNightlyOverwrite(pre);

  const ffmpegPath = getFfmpegBinaryPath();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ig-night-'));
  const pngPath = path.join(tmpDir, 'classic.png');
  const mp4Path = path.join(tmpDir, 'reel-nightly.mp4');

  try {
    await fs.writeFile(pngPath, pngBuf);
    const { publicUrl: imageStorageUrl } = await firebaseSaveDownloadableFile(
      `instagram-zapier/${dateKey}/classic.png`,
      pngBuf,
      'image/png'
    );

    const mergePayload = {
      date: dateKey,
      lastUpdated: new Date().toISOString(),
      lastNightlyInstagramSnapshotAt: new Date().toISOString(),
      imageStorageUrl,
      classicUrl: imageStorageUrl,
      zapierCaption: quoteLine
    };

    let reelMp4Url = null;
    if (!protectReel) {
      await runFfmpegPngLoopToMp4(ffmpegPath, pngPath, mp4Path, 8, quoteMood);
      const mp4Buf = await fs.readFile(mp4Path);
      const { publicUrl } = await firebaseSaveDownloadableFile(
        `instagram-zapier/${dateKey}/reel-nightly.mp4`,
        mp4Buf,
        'video/mp4'
      );
      reelMp4Url = publicUrl;
      mergePayload.reelMp4StorageUrl = reelMp4Url;
      mergePayload.reelMp4Url = reelMp4Url;
      mergePayload.reelSource = 'nightly_static_mp4';
      mergePayload.reelMood = quoteMood;
      mergePayload.reelNote =
        'MP4 is an 8s static hold of the classic 4:5 card (GitHub + Railway) with bundled bed music when assets/audio is present. The split synthetic reel only exists if recorded from the app (not required for Zapier).';
    } else {
      mergePayload.reelNote =
        'Nightly refreshed classic image only; left existing app/synthetic reel URLs unchanged.';
    }

    await docRef.set(mergePayload, { merge: true });

    console.log(
      protectReel
        ? `✅ Nightly Instagram snapshot for ${dateKey} (classic only; reel preserved)`
        : `✅ Nightly Instagram snapshot for ${dateKey} (classic + static reel MP4)`
    );
    return {
      success: true,
      date: dateKey,
      imageStorageUrl,
      reelMp4Url,
      reelPreserved: protectReel
    };
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* */
    }
  }
}

function runFfmpegWebmToMp4(ffmpegPath, inputPath, outputPath, moodLabel = '') {
  return new Promise((resolve, reject) => {
    const musicPath = resolveReelBedMusicPath(moodLabel);
    const fps = REEL_SYNTHETIC_TARGET_FPS;
    /** Remap PTS from frame index so VP8/VP9 WebM from Chrome MediaRecorder keeps wall-clock 8s at 30fps */
    const vf = `setpts=N/(${fps}*TB),tpad=start_mode=clone:start_duration=${REEL_MP4_FIRST_FRAME_HOLD_SEC}`;
    /** H.264 + AAC (looped bed MP3 or silent); Instagram ingest often rejects video-only MP4s */
    const args = [
      '-y',
      '-i',
      inputPath,
      ...reelBedAudioInputArgs(musicPath),
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(fps),
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      musicPath ? '192k' : '96k',
      '-shortest',
      outputPath
    ];
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited ${code}: ${tailOutput(stderr, 4000)}`));
    });
  });
}

/**
 * Downloads the WebM from Firestore, transcodes to H.264 MP4 + AAC (bed music or silent), uploads next to it, merges URLs into the doc.
 * @param {string} dateKey YYYY-MM-DD
 * @param {{ force?: boolean }} [options]
 */
async function transcodeInstagramReelWebmToMp4(dateKey, options = {}) {
  if (!db) {
    throw new Error('Firestore not initialized');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error('Invalid date key');
  }

  const docRef = db.collection('instagram-images').doc(dateKey);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error(`No instagram-images doc for ${dateKey}`);
  }
  const data = snap.data() || {};
  const webmUrl =
    data.reelWebmStorageUrl ||
    data.reelUrl ||
    null;
  const existingMp4 = data.reelMp4StorageUrl || data.reelMp4Url || null;
  const force = !!options.force;
  if (existingMp4 && !force) {
    return { success: true, cached: true, reelMp4Url: existingMp4, date: dateKey };
  }
  if (!webmUrl) {
    return { success: false, skipped: true, reason: 'no_reel_webm', date: dateKey };
  }

  const ffmpegPath = getFfmpegBinaryPath();
  const quoteSnap = await db.collection('quotes').doc(dateKey).get();
  const quoteData = quoteSnap.exists ? quoteSnap.data() || {} : {};
  const quoteMood = String(quoteData.mood || '').trim();

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ig-reel-'));
  const inPath = path.join(tmpDir, 'in.webm');
  const outPath = path.join(tmpDir, 'out.mp4');

  try {
    const res = await fetch(webmUrl);
    if (!res.ok) {
      throw new Error(`Failed to download reel WebM (${res.status})`);
    }
    const webmBuf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(inPath, webmBuf);

    await runFfmpegWebmToMp4(ffmpegPath, inPath, outPath, quoteMood);

    const mp4Buf = await fs.readFile(outPath);
    const dest = `instagram-zapier/${dateKey}/reel.mp4`;
    const { publicUrl: reelMp4Url } = await firebaseSaveDownloadableFile(dest, mp4Buf, 'video/mp4');
    await docRef.set(
      {
        reelMp4StorageUrl: reelMp4Url,
        reelMp4Url: reelMp4Url,
        reelSource: 'app_synthetic_mp4',
        reelMood: quoteMood,
        lastReelTranscodeAt: new Date().toISOString()
      },
      { merge: true }
    );

    console.log(`✅ Transcoded reel to MP4 for ${dateKey}${quoteMood ? ` (mood: ${quoteMood})` : ''}`);
    return { success: true, cached: false, reelMp4Url, date: dateKey };
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* */
    }
  }
}

/** Match client Utils.getHstRenderTriangles for server-side raster. */
function getHstRenderTriangles(block) {
  if (!block || block.patternType !== 'special' || block.specialPatternType !== 'hst') {
    return [];
  }
  if (Array.isArray(block.hstTriangles) && block.hstTriangles.length) {
    return block.hstTriangles.map((t) => ({
      color: t.color,
      points: (t.points || []).map((p) => {
        if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
        if (p && typeof p === 'object') return [Number(p.x), Number(p.y)];
        return [0, 0];
      })
    }));
  }
  const w = Number(block.width);
  const h = Number(block.height);
  const c1 = typeof block.color === 'string' ? block.color : '#c8c4bf';
  const c2 = typeof block.hstColorB === 'string' ? block.hstColorB : c1;
  const diag = block.hstDiagonal === 'ne-sw' ? 'ne-sw' : 'nw-se';
  if (diag === 'nw-se') {
    return [
      { color: c1, points: [[0, 0], [0, h], [w, h]] },
      { color: c2, points: [[0, 0], [w, 0], [w, h]] }
    ];
  }
  return [
    { color: c1, points: [[0, 0], [w, 0], [0, h]] },
    { color: c2, points: [[w, 0], [w, h], [0, h]] }
  ];
}

function hashHstOrganicSeed(block) {
  const s = [
    String(block.id ?? ''),
    String(block.x ?? 0),
    String(block.y ?? 0),
    String(block.width ?? 0),
    String(block.height ?? 0),
    String(block.hstDiagonal ?? ''),
    String(block.hstColorB ?? '')
  ].join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Match client Utils.getHstOrganicRenderTriangles (legacy HST only). */
function getHstOrganicRenderTriangles(block, jitterMultiplier = 1) {
  const exact = getHstRenderTriangles(block);
  if (!exact || exact.length !== 2) return exact || [];
  if (Array.isArray(block.hstTriangles) && block.hstTriangles.length) {
    return exact;
  }
  const w = Number(block.width);
  const h = Number(block.height);
  if (!(w > 0 && h > 0)) return exact;
  const jm = jitterMultiplier == null || Number.isNaN(Number(jitterMultiplier)) ? 1 : Number(jitterMultiplier);
  const rng = mulberry32(hashHstOrganicSeed(block));
  const diag = block.hstDiagonal === 'ne-sw' ? 'ne-sw' : 'nw-se';
  const blockArea = w * h;
  const areaFactor = Math.sqrt(blockArea) / 100;
  let sizeAdjustedVariation;
  if (areaFactor < 2) {
    sizeAdjustedVariation = Math.min(4, Math.max(1, areaFactor * 2));
  } else {
    sizeAdjustedVariation = Math.min(6, 4 + (areaFactor - 2) * 1);
  }
  const handCutVariation = sizeAdjustedVariation * jm;
  const diagVar = handCutVariation * 0.62;
  const segments =
    areaFactor < 2
      ? Math.max(2, Math.min(3, Math.floor(areaFactor * 1.2) + 1))
      : Math.max(3, Math.min(5, Math.floor(3 + (areaFactor - 2) * 0.4)));
  const len = Math.hypot(w, h);

  if (diag === 'nw-se') {
    const px = -h / len;
    const py = w / len;
    const wobble = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const bx = t * w;
      const by = t * h;
      if (i === 0 || i === segments) {
        wobble.push([bx, by]);
      } else {
        const off = (rng() - 0.5) * 2 * diagVar;
        wobble.push([bx + px * off, by + py * off]);
      }
    }
    const midRev = wobble.slice(1, -1).reverse();
    const tri1pts = [[0, h], [w, h], ...midRev, [0, 0]];
    const tri2pts = [[0, 0], [w, 0], [w, h], ...midRev];
    return [
      { color: exact[0].color, points: tri1pts },
      { color: exact[1].color, points: tri2pts }
    ];
  }

  const px = -h / len;
  const py = -w / len;
  const wobble = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const bx = w * (1 - t);
    const by = h * t;
    if (i === 0 || i === segments) {
      wobble.push([bx, by]);
    } else {
      const off = (rng() - 0.5) * 2 * diagVar;
      wobble.push([bx + px * off, by + py * off]);
    }
  }
  const mid = wobble.slice(1, -1);
  const midRev = mid.slice().reverse();
  const tri1pts = [[0, 0], [w, 0], ...mid, [0, h]];
  const tri2pts = [[w, 0], [w, h], [0, h], ...midRev];
  return [
    { color: exact[0].color, points: tri1pts },
    { color: exact[1].color, points: tri2pts }
  ];
}

/** Match client inset circle (clip disk to block rect; our-daily-beta.html Utils). */
function insetCircleJitterSeed(block) {
  const s = [
    String(block.id ?? ''),
    String(block.insetTier ?? 0),
    String(block.insetNextCutVertical ?? ''),
    String(block.x ?? 0),
    String(block.y ?? 0),
    String(block.width ?? 0),
    String(block.height ?? 0)
  ].join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function insetDedupePolyVerts(pts, eps) {
  const out = [];
  for (const q of pts || []) {
    if (!q || q.length < 2) continue;
    if (
      !out.length ||
      Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) > eps
    ) {
      out.push([q[0], q[1]]);
    }
  }
  if (
    out.length > 1 &&
    Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps
  ) {
    out.pop();
  }
  return out;
}

function insetClipSegVertical(x0, A, B) {
  const [x1, y1] = A;
  const [x2, y2] = B;
  const d = x2 - x1;
  if (Math.abs(d) < 1e-12) return null;
  const t = (x0 - x1) / d;
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  return [x0, y1 + t * (y2 - y1)];
}

function insetClipSegHorizontal(y0, A, B) {
  const [x1, y1] = A;
  const [x2, y2] = B;
  const d = y2 - y1;
  if (Math.abs(d) < 1e-12) return null;
  const t = (y0 - y1) / d;
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  return [x1 + t * (x2 - x1), y0];
}

function insetClipHalfPlane(poly, insideFn, intersectFn) {
  const eps = 1e-9;
  const out = [];
  if (!poly || poly.length < 2) return out;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const prev = poly[(i + n - 1) % n];
    const curr = poly[i];
    const prevIn = insideFn(prev);
    const currIn = insideFn(curr);
    if (currIn) {
      if (!prevIn) {
        const is = intersectFn(prev, curr);
        if (is) out.push(is);
      }
      out.push([curr[0], curr[1]]);
    } else if (prevIn) {
      const is = intersectFn(prev, curr);
      if (is) out.push(is);
    }
  }
  return insetDedupePolyVerts(out, eps);
}

function clipConvexPolygonToRect(polyRaw, rx, ry, rw, rh) {
  const eps = 1e-9;
  const minX = rx;
  const maxX = rx + rw;
  const minY = ry;
  const maxY = ry + rh;
  let poly = (polyRaw || []).map((p) => [Number(p[0]), Number(p[1])]);
  poly = insetClipHalfPlane(
    poly,
    (pt) => pt[0] >= minX - eps,
    (A, B) => insetClipSegVertical(minX, A, B)
  );
  poly = insetClipHalfPlane(
    poly,
    (pt) => pt[0] <= maxX + eps,
    (A, B) => insetClipSegVertical(maxX, A, B)
  );
  poly = insetClipHalfPlane(
    poly,
    (pt) => pt[1] >= minY - eps,
    (A, B) => insetClipSegHorizontal(minY, A, B)
  );
  poly = insetClipHalfPlane(
    poly,
    (pt) => pt[1] <= maxY + eps,
    (A, B) => insetClipSegHorizontal(maxY, A, B)
  );
  return poly;
}

function insetCircleOrganicSectorPointsLocal(block, jitterMultiplier = 1) {
  const bw = Math.max(1, Number(block.width));
  const bh = Math.max(1, Number(block.height));
  let lcx = Number(block.insetCx) - Number(block.x);
  let lcy = Number(block.insetCy) - Number(block.y);
  let r = Number(block.insetR);
  if (!Number.isFinite(lcx) || !Number.isFinite(lcy) || !Number.isFinite(r) || r <= 0) {
    lcx = bw / 2;
    lcy = bh / 2;
    r = (Math.min(bw, bh) * 0.9) / 2;
  }
  const jm = jitterMultiplier == null ? 1 : Number(jitterMultiplier);
  const blockArea = bw * bh;
  const areaFactor = Math.sqrt(blockArea) / 100;
  let varBase =
    areaFactor < 2 ? Math.min(4, Math.max(0.8, areaFactor * 2)) : Math.min(6, 4 + (areaFactor - 2));
  const arcJitter = varBase * jm * 0.5;
  const rng = mulberry32(insetCircleJitterSeed(block));
  const steps = 52;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const ang = t * Math.PI * 2;
    const off = i > 0 && i < steps - 1 ? (rng() - 0.5) * 2 * arcJitter : 0;
    const rr = r + off;
    pts.push([lcx + Math.cos(ang) * rr, lcy + Math.sin(ang) * rr]);
  }
  const clipped = clipConvexPolygonToRect(pts, 0, 0, bw, bh);
  if (!clipped || clipped.length < 3) {
    const exact = [];
    for (let j = 0; j < steps; j++) {
      const ang = (j / steps) * Math.PI * 2;
      exact.push([lcx + Math.cos(ang) * r, lcy + Math.sin(ang) * r]);
    }
    const clipped2 = clipConvexPolygonToRect(exact, 0, 0, bw, bh);
    if (!clipped2 || clipped2.length < 3) {
      return { kind: 'none', points: [] };
    }
    return { kind: 'loop', points: clipped2 };
  }
  return { kind: 'loop', points: clipped };
}

function drawInsetCircleBlockToCtx(ctx, block, x, y, width, height) {
  const bw = Math.max(1e-6, Number(block.width));
  const bh = Math.max(1e-6, Number(block.height));
  ctx.fillStyle = block.color || '#6c757d';
  ctx.fillRect(x, y, width, height);
  const inner = typeof block.insetInnerColor === 'string' ? block.insetInnerColor : block.color;
  const spec = insetCircleOrganicSectorPointsLocal(block, 1);
  if (spec.kind === 'none' || !(spec.points && spec.points.length >= 3)) {
    return;
  }
  const map = (p) => [
    x + (Number(p[0]) / bw) * width,
    y + (Number(p[1]) / bh) * height
  ];
  const pts = spec.points.map(map);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = inner;
  ctx.fill();
}

/** Half-square triangle blocks (must match client geometry in our-daily-beta.html). */
function drawQuiltBlockToCtx(ctx, block, x, y, width, height) {
  const isHst = block.patternType === 'special' && block.specialPatternType === 'hst';
  const isInset = block.patternType === 'special' && block.specialPatternType === 'insetCircle';
  if (!isHst && !isInset) {
    ctx.fillStyle = block.color || '#6c757d';
    ctx.fillRect(x, y, width, height);
    return;
  }
  if (isInset) {
    drawInsetCircleBlockToCtx(ctx, block, x, y, width, height);
    return;
  }
  const tris = getHstOrganicRenderTriangles(block, 1);
  const bw = Math.max(1e-6, Number(block.width));
  const bh = Math.max(1e-6, Number(block.height));
  for (const t of tris) {
    const pts = t.points || [];
    if (pts.length < 3) continue;
    ctx.fillStyle = t.color || block.color || '#6c757d';
    ctx.beginPath();
    ctx.moveTo(x + (pts[0][0] / bw) * width, y + (pts[0][1] / bh) * height);
    for (let k = 1; k < pts.length; k++) {
      ctx.lineTo(x + (pts[k][0] / bw) * width, y + (pts[k][1] / bh) * height);
    }
    ctx.closePath();
    ctx.fill();
  }
}

// Generate Instagram image from quilt data (server-side fallback/manual path).
async function generateInstagramImageFromQuilt(blocks, _quote) {
  const canvas = createCanvas(1080, 1350); // 4:5 ratio for Instagram
  const ctx = canvas.getContext('2d');
  
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error('No quilt blocks available for Instagram image');
  }

  // Fill background with true white to match the client classic card.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1080, 1350);
  
  // Calculate quilt bounds from actual block positions
  const minX = Math.min(...blocks.map(b => b.x));
  const minY = Math.min(...blocks.map(b => b.y));
  const maxX = Math.max(...blocks.map(b => b.x + b.width));
  const maxY = Math.max(...blocks.map(b => b.y + b.height));
  
  const quiltWidth = maxX - minX;
  const quiltHeight = maxY - minY;
  
  if (!(quiltWidth > 0) || !(quiltHeight > 0)) {
    throw new Error('Invalid quilt bounds for Instagram image');
  }

  // Classic card: preserve the quilt-screen 9:16 composition inside the 4:5 post.
  const quiltScreenAspect = 9 / 16;
  let sourceX = minX;
  let sourceY = minY;
  let sourceWidth = quiltWidth;
  let sourceHeight = quiltHeight;
  const sourceAspect = quiltWidth / quiltHeight;
  if (quiltScreenAspect > sourceAspect) {
    sourceHeight = Math.min(quiltHeight, quiltWidth / quiltScreenAspect);
    sourceY = minY + (quiltHeight - sourceHeight) / 2;
  } else {
    sourceWidth = Math.min(quiltWidth, quiltHeight * quiltScreenAspect);
    sourceX = minX + (quiltWidth - sourceWidth) / 2;
  }

  // Fit that 9:16 raster into the same thin symmetric inset as the client classic card (pad 2).
  const pad = 2;
  const targetWidth = 1080 - pad * 2;
  const targetHeight = 1350 - pad * 2;
  let drawHeight = targetHeight;
  let drawWidth = drawHeight * quiltScreenAspect;
  if (drawWidth > targetWidth) {
    drawWidth = targetWidth;
    drawHeight = drawWidth / quiltScreenAspect;
  }
  const startX = pad + (targetWidth - drawWidth) / 2;
  const startY = pad + (targetHeight - drawHeight) / 2;
  const scaleX = drawWidth / sourceWidth;
  const scaleY = drawHeight / sourceHeight;

  // Draw the 9:16 screen composition; the white post background remains visible at the sides.
  ctx.save();
  ctx.beginPath();
  ctx.rect(startX, startY, drawWidth, drawHeight);
  ctx.clip();
  blocks.forEach((block) => {
    const x = startX + (Number(block.x) - sourceX) * scaleX;
    const y = startY + (Number(block.y) - sourceY) * scaleY;
    const width = Number(block.width) * scaleX;
    const height = Number(block.height) * scaleY;
    drawQuiltBlockToCtx(ctx, block, x, y, width, height);
  });
  ctx.restore();

  // Convert to base64
  const buffer = canvas.toBuffer('image/png');
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/** Same calendar rule as Utils.getTodayKey() in the app (quote day; before 7:00 UTC → previous UTC date). */
function getAppDateKey(d = new Date()) {
  const utcHours = d.getUTCHours();
  const adjusted = new Date(d);
  if (utcHours < 7) {
    adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  }
  const y = adjusted.getUTCFullYear();
  const m = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToDateKey(dateKey, delta) {
  const [yy, mm, dd] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function getUtcIsoNow() {
  return new Date().toISOString();
}

function normalizeSubmittedQuoteText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/["“”„‟«»]/g, '')
    .trim();
}

function normalizeReflectionResponseText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function safeReflectionDeviceKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return crypto.randomUUID();
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function postJsonWithHttps({ hostname, path: requestPath, headers, body }) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path: requestPath,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk.toString();
      });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = responseBody ? JSON.parse(responseBody) : null;
        } catch (_) {
          parsed = null;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const parsedError = parsed?.error || parsed;
          const errorMessage = typeof parsedError === 'string'
            ? parsedError
            : parsedError?.message || JSON.stringify(parsedError || responseBody || `HTTPS request failed (${res.statusCode})`);
          const error = new Error(errorMessage);
          error.statusCode = res.statusCode;
          error.responseBody = responseBody;
          reject(error);
          return;
        }
        resolve(parsed);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/** Strip model self-verification appended after the real idea (same-line "Count: 83 ✓", "Check: …", "Fix one. Revise", etc.). */
function stripReflectionThemeModelMeta(theme) {
  let s = String(theme || '').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  s = s.replace(/\s+Count:\s*\d+(?:\s*[✓✔√])?[\s\S]*$/i, '').trim();
  s = s.replace(/\s+No idea starts[\s\S]*$/i, '').trim();
  s = s.replace(/\s+Check:\s*(?:Improv|I[,']|same word|different words)[\s\S]*$/i, '').trim();
  s = s.replace(/\s+Fix one\.[\s\S]*$/i, '').trim();
  s = s.replace(/\s+Revise\s*$/i, '').trim();
  return s.trim();
}

function extractReflectionThemesFromText(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/) || raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (_) {
        parsed = null;
      }
    }
  }
  const source = Array.isArray(parsed)
    ? parsed
    : parsed?.themes || parsed?.ideas || parsed?.communityIdeas || parsed?.reflectionThemes || parsed?.themeStatements || parsed?.items;
  const themes = (Array.isArray(source) ? source : [])
    .map((theme) => {
      if (theme && typeof theme === 'object') {
        return theme.idea || theme.theme || theme.text || theme.statement || theme.summary || '';
      }
      return theme;
    })
    .map((theme) => stripReflectionThemeModelMeta(String(theme || '').replace(/\s+/g, ' ').trim()))
    .filter(Boolean);
  if (themes.length) return themes;
  const labeledMatches = Array.from(raw.matchAll(/(?:\*\*)?\s*(?:THEME|IDEA)\s*\d+\s*(?:\*\*)?\s*[:\-.)]?\s*(?:\*\*)?\s*([\s\S]*?)(?=\s*(?:\*\*)?\s*(?:THEME|IDEA)\s*\d+\s*(?:\*\*)?\s*[:\-.)]?|$)/gi))
    .map((match) => stripReflectionThemeModelMeta(String(match[1] || '').replace(/\*\*/g, '').trim()))
    .filter(Boolean);
  if (labeledMatches.length) return labeledMatches;
  return raw
    .split(/\n+/)
    .map((line) => line
      .replace(/^\s*(?:THEME|IDEA)\s*\d+\s*[:\-.)]\s*/i, '')
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/^["']|["']$/g, '')
      .trim())
    .map((line) => stripReflectionThemeModelMeta(line))
    .filter((line) => line && !/^\{|\}|\[|\]|themes|ideas/i.test(line))
    .filter((line) => !/^(?:count|check|no idea starts|fix one|revise)\b/i.test(line));
}

function completeReflectionThemes(themes) {
  const seen = new Set();
  return (Array.isArray(themes) ? themes : [])
    .map((theme) => stripReflectionThemeModelMeta(String(theme || '').replace(/\s+/g, ' ').trim()))
    .map((theme) => theme.replace(/\.+$/g, '').trim())
    .filter(Boolean)
    .filter((theme) => {
      const key = theme.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildReflectionThemesPrompt({ reflectionPrompt, responses }) {
  const rp = String(reflectionPrompt || '').replace(/\s+/g, ' ').trim();
  const responseParagraphs = (Array.isArray(responses) ? responses : [])
    .map((text) => String(text || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  /** No date key, labels, or numbering — raw prompt + responses only (experiment). */
  const preamble = [rp, ...responseParagraphs].filter(Boolean).join('\n\n');
  const instructions = [
    'Read all responses before writing anything.',
    '',
    '- What is the person actually DOING?',
    '- Can someone borrow this move without copying the specific example?',
    '- Does my idea still have the concrete detail that makes it real?',
    '',
    'Bad: "My unfinished things revealed my patterns" ← abstracted away',
    'Good: "I have so many unfinished things. Turns out I\'m not as patient as I thought" ← keeps the image',
    '',
    'ideas stay in first person, descriptive, no mandates.',
    '',
    'Discard any response that doesn\'t answer the prompt, is offensive, or is absurdist. Your output must be traceable to specific language in the responses. Test each idea: which response does this come from? If you can\'t answer, discard it.',
    '',
    'Group responses that share the same observation or move. If two ideas lose nothing by merging, merge them. Keep the one with more specific language.',
    '',
    'Preserve key aspects of the speaker\'s original phrasing when possible to maintain authentic voice. Only rephrase when merging two responses into one.',
    '',
    'Write the way a thoughtful friend talks — not like a caption, not like an aphorism.',
    '',
    'limit each idea to 100 characters max. shorter is fine.',
    '',
    'Do not start more than one idea with the same word.',
    '',
    'Do not use em dashes',
    '',
    'Return plain text only:',
    'IDEA 1: <idea>',
    'IDEA 2: <idea>',
    'Continue only for genuinely distinct ideas.'
  ].join('\n');
  return preamble ? `${preamble}\n\n${instructions}` : instructions;
}

async function postReflectionThemesToGemini({ apiKey, model, prompt }) {
  const generationConfig = {
    temperature: 0.3,
    maxOutputTokens: 1200,
    thinkingConfig: { thinkingBudget: 0 }
  };
  const result = await postJsonWithHttps({
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    headers: {},
    body: {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig
    }
  });
  return (result?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || '')
    .join('\n')
    .trim();
}

async function generateReflectionThemesWithGemini({ dateKey, reflectionPrompt, responses }) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on server');
  const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const prompt = buildReflectionThemesPrompt({ dateKey, reflectionPrompt, responses });

  const firstText = await postReflectionThemesToGemini({ apiKey, model, prompt });
  let themes = completeReflectionThemes(extractReflectionThemesFromText(firstText));
  const shouldRetryForMoreIdeas = responses.length >= 3 && themes.length < 2;
  if (!themes.length || shouldRetryForMoreIdeas) {
    console.warn(`Gemini returned ${themes.length} usable community ideas on first attempt; retrying for better range.`);
    const repairPrompt = [
      prompt,
      '',
      `Your previous output produced ${themes.length} usable ideas from ${responses.length} private responses. Try again with better range.`,
      'Return one idea for each genuinely distinct response or response cluster, up to 10 ideas.',
      'Follow every instruction in the prompt above exactly.',
      'Output nothing except IDEA lines: no counts, checkmarks, Check:, or revision notes.',
      'Return plain text only with IDEA 1:, IDEA 2:, etc. labels.'
    ].join('\n');
    const repairText = await postReflectionThemesToGemini({ apiKey, model, prompt: repairPrompt });
    themes = completeReflectionThemes(extractReflectionThemesFromText(repairText));
    if (!themes.length) {
      const preview = String(repairText || firstText || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600);
      const error = new Error(`Gemini returned no usable community ideas. Raw output preview: ${preview || '[empty]'}`);
      error.geminiOutputPreview = preview;
      throw error;
    }
  }
  return { themes, model, provider: 'gemini' };
}

async function postReflectionThemesToClaude({ apiKey, model, prompt }) {
  const result = await postJsonWithHttps({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: {
      model,
      max_tokens: 1200,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    }
  });
  return (result?.content || [])
    .map((part) => part?.type === 'text' ? part.text : '')
    .join('\n')
    .trim();
}

async function generateReflectionThemesWithClaude({ dateKey, reflectionPrompt, responses }) {
  const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured on server');
  const model = String(process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim();
  const prompt = buildReflectionThemesPrompt({ dateKey, reflectionPrompt, responses });

  const firstText = await postReflectionThemesToClaude({ apiKey, model, prompt });
  let themes = completeReflectionThemes(extractReflectionThemesFromText(firstText));
  const shouldRetryForMoreIdeas = responses.length >= 3 && themes.length < 2;
  if (!themes.length || shouldRetryForMoreIdeas) {
    console.warn(`Claude returned ${themes.length} usable community ideas on first attempt; retrying for better range.`);
    const repairPrompt = [
      prompt,
      '',
      `Your previous output produced ${themes.length} usable ideas from ${responses.length} private responses. Try again with better range.`,
      'Return one idea for each genuinely distinct response or response cluster, up to 10 ideas.',
      'Follow every instruction in the prompt above exactly.',
      'Output nothing except IDEA lines: no counts, checkmarks, Check:, or revision notes.',
      'Return plain text only with IDEA 1:, IDEA 2:, etc. labels.'
    ].join('\n');
    const repairText = await postReflectionThemesToClaude({ apiKey, model, prompt: repairPrompt });
    themes = completeReflectionThemes(extractReflectionThemesFromText(repairText));
    if (!themes.length) {
      const preview = String(repairText || firstText || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600);
      const error = new Error(`Claude returned no usable community ideas. Raw output preview: ${preview || '[empty]'}`);
      error.claudeOutputPreview = preview;
      throw error;
    }
  }
  return { themes, model, provider: 'anthropic' };
}

async function generateReflectionThemesWithAi({ dateKey, reflectionPrompt, responses }) {
  if (String(process.env.ANTHROPIC_API_KEY || '').trim()) {
    return generateReflectionThemesWithClaude({ dateKey, reflectionPrompt, responses });
  }
  if (String(process.env.GEMINI_API_KEY || '').trim()) {
    return generateReflectionThemesWithGemini({ dateKey, reflectionPrompt, responses });
  }
  throw new Error('ANTHROPIC_API_KEY or GEMINI_API_KEY must be configured on server');
}

function normalizeSubmittedAuthorName(value) {
  const raw = String(value || '')
    .replace(/^[\s—–-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  return raw.replace(/(^|[\s\-'.])([A-Za-zÀ-ÖØ-öø-ÿ])([A-Za-zÀ-ÖØ-öø-ÿ]*)/g, (match, prefix, first, rest) => {
    const normalizedRest =
      rest && (rest === rest.toLowerCase() || rest === rest.toUpperCase())
        ? rest.toLowerCase()
        : rest;
    return `${prefix}${first.toLocaleUpperCase()}${normalizedRest}`;
  });
}

function addDaysToDate(dateKey, delta) {
  const [yy, mm, dd] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function normNotionPropKey(s) {
  return String(s || '').toLowerCase().replace(/[\s_-]/g, '');
}

function findNotionPropName(properties, ...candidates) {
  const entries = Object.entries(properties || {});
  for (const candidate of candidates) {
    const target = normNotionPropKey(candidate);
    const found = entries.find(([name]) => normNotionPropKey(name) === target);
    if (found) return found[0];
  }
  return '';
}

function getNotionTitlePropName(properties) {
  const preferred = findNotionPropName(properties, 'quote_text', 'Name');
  if (preferred && properties[preferred]?.type === 'title') return preferred;
  const titleEntry = Object.entries(properties || {}).find(([, prop]) => prop?.type === 'title');
  return titleEntry ? titleEntry[0] : '';
}

async function notionFetchJson(pathname, options = {}) {
  const notionToken = String(process.env.NOTION_TOKEN || '').trim();
  if (!notionToken) throw new Error('NOTION_TOKEN is not configured on server');
  const res = await fetch(`https://api.notion.com/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
  if (!res.ok) throw new Error(`Notion API error ${res.status}: ${text || res.statusText}`);
  return json;
}

async function notionGetDatabaseProperties(databaseId) {
  const json = await notionFetchJson(`/databases/${databaseId}`, { method: 'GET' });
  return json?.properties || {};
}

function notionTextPropertyValue(prop, value) {
  const text = String(value || '').trim();
  if (!text) return null;
  switch (prop?.type) {
    case 'title': return { title: [{ text: { content: text } }] };
    case 'rich_text': return { rich_text: [{ text: { content: text } }] };
    case 'url': return { url: text };
    case 'email': return { email: text };
    case 'phone_number': return { phone_number: text };
    case 'select': return { select: { name: text } };
    case 'status': return { status: { name: text } };
    case 'date': return /^\d{4}-\d{2}-\d{2}/.test(text) ? { date: { start: text.slice(0, 10) } } : null;
    default: return null;
  }
}

function notionBooleanPropertyValue(prop, value) {
  if (prop?.type === 'checkbox') return { checkbox: !!value };
  if (prop?.type === 'select') return { select: { name: value ? 'true' : 'false' } };
  if (prop?.type === 'status') return { status: { name: value ? 'Active' : 'Pending' } };
  if (prop?.type === 'rich_text') return { rich_text: [{ text: { content: value ? 'true' : 'false' } }] };
  return null;
}

function setNotionProperty(propertiesPayload, schema, name, value) {
  if (!name || !schema?.[name] || value == null) return;
  propertiesPayload[name] = value;
}

function buildSubmittedQuoteNotionProperties(schema, submission) {
  const properties = {};
  const titleName = getNotionTitlePropName(schema);
  if (!titleName) throw new Error('Notion database needs a title property for quote text');
  properties[titleName] = { title: [{ text: { content: submission.text } }] };
  const authorName = findNotionPropName(schema, 'author');
  setNotionProperty(properties, schema, authorName, notionTextPropertyValue(schema[authorName], submission.author));
  const approvedName = findNotionPropName(schema, 'approved', 'active');
  setNotionProperty(properties, schema, approvedName, notionBooleanPropertyValue(schema[approvedName], false));
  const submittedByName = findNotionPropName(schema, 'submitted_by', 'submittedBy');
  setNotionProperty(properties, schema, submittedByName, notionTextPropertyValue(schema[submittedByName], submission.submitterName));
  const submittedViaName = findNotionPropName(schema, 'submitted_via', 'submittedVia', 'source');
  setNotionProperty(properties, schema, submittedViaName, notionTextPropertyValue(schema[submittedViaName], 'App'));
  const submittedAtName = findNotionPropName(schema, 'submitted_at', 'submittedAt');
  setNotionProperty(properties, schema, submittedAtName, notionTextPropertyValue(schema[submittedAtName], submission.submittedAt));
  return properties;
}

async function createPendingSubmittedQuote({ text, author, submitterName, userId, appDateKey, currentQuoteText, currentQuoteAuthor }) {
  if (!db) throw new Error('Firestore not initialized');
  const databaseId = String(process.env.NOTION_DATABASE_ID || '').trim();
  if (!databaseId) throw new Error('NOTION_DATABASE_ID is not configured on server');
  const submittedAt = getUtcIsoNow();
  const submission = { text, author, submitterName, userId, appDateKey, currentQuoteText, currentQuoteAuthor, submittedAt };
  const schema = await notionGetDatabaseProperties(databaseId);
  const notionPage = await notionFetchJson('/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: databaseId }, properties: buildSubmittedQuoteNotionProperties(schema, submission) })
  });
  const notionPageId = String(notionPage?.id || '').trim();
  if (!notionPageId) throw new Error('Notion did not return a page id');
  await db.collection(process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes').doc(notionPageId).set({
    text, quote: text, author, approved: false, active: false, source: 'notion', sourceId: notionPageId,
    submittedBy: submitterName, submittedAt, submittedVia: 'app', submittedUserId: userId || null,
    appDateKey: appDateKey || null, currentQuoteText: currentQuoteText || '', currentQuoteAuthor: currentQuoteAuthor || '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // Fire-and-forget: enrich the row with AI + Wikipedia data without delaying the HTTP response.
  // Failures are logged only; the row remains as written above.
  setImmediate(() => {
    prefillSubmittedQuoteWithAi({ notionPageId, quoteText: text, authorName: author }).catch((err) => {
      console.warn(`⚠️ Prefill failed for ${notionPageId}:`, err?.message || err);
    });
  });

  return { notionPageId, quoteId: notionPageId, submittedAt };
}

// --- Submitted-quote AI prefill ---------------------------------------------

function extractPrefillJsonFromText(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

async function postSubmittedQuotePrefillToClaude({ apiKey, model, prompt }) {
  const result = await postJsonWithHttps({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: {
      model,
      max_tokens: 1400,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }]
    }
  });
  return (result?.content || [])
    .map((part) => (part?.type === 'text' ? part.text : ''))
    .join('\n')
    .trim();
}

async function generateSubmittedQuotePrefillFields({ quoteText, authorName }) {
  const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured on server');
  const model = String(process.env.ANTHROPIC_PREFILL_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim();
  const prompt = buildSubmittedQuotePrefillPrompt({ quoteText, authorName });

  const firstText = await postSubmittedQuotePrefillToClaude({ apiKey, model, prompt });
  let parsed = extractPrefillJsonFromText(firstText);
  if (!parsed || typeof parsed !== 'object') {
    const repairPrompt = `${prompt}\n\nYour previous output could not be parsed as JSON. Return ONLY the JSON object described in OUTPUT SCHEMA. No prose, no fences.`;
    const repairText = await postSubmittedQuotePrefillToClaude({ apiKey, model, prompt: repairPrompt });
    parsed = extractPrefillJsonFromText(repairText);
  }
  if (!parsed || typeof parsed !== 'object') {
    const preview = String(firstText || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    throw new Error(`Claude returned no parseable prefill JSON. Preview: ${preview || '[empty]'}`);
  }
  const pickString = (key) => {
    const v = parsed[key];
    if (typeof v !== 'string') return '';
    return v.replace(/^\s+|\s+$/g, '');
  };
  return {
    author: pickString('author'),
    community_prompt: pickString('community_prompt') || pickString('community_prompt '),
    blessing: pickString('blessing'),
    notification_text: pickString('notification_text'),
    ig_caption: pickString('ig_caption'),
    what_if: pickString('what_if'),
    speaker_guide_line: pickString('speaker_guide_line'),
    art_recs: pickString('art_recs'),
    _model: model
  };
}

// --- Wikipedia / Wikimedia speaker lookup -----------------------------------

const WIKIPEDIA_USER_AGENT = 'OurDailyQuilt/1.0 (https://ourdailyquilt.com)';

function parseSpeakerDatesFromExtract(extract) {
  const text = String(extract || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // Wikipedia lead usually puts birth/death years in a parenthetical, but the
  // first paren may be IPA/pronunciation only (e.g. "Audre Lorde (/ˈɔːdri lɔːrd/) (1934–1992)").
  // Collect every parenthetical and pick the one that contains years; if nothing
  // there, fall back to the first sentence, then the whole extract.
  const parenContents = [];
  const re = /\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) parenContents.push(m[1]);
  const firstSentence = text.split(/[.!?](?:\s|$)/)[0] || text;
  // Years 1000–2099 covers everyone whose dates the app would plausibly cite.
  const yearRe = /\b(1[0-9]{3}|20[0-9]{2})\b/g;

  const candidates = [...parenContents, firstSentence, text].map((h) => String(h || ''));
  for (const haystack of candidates) {
    const yearTokens = haystack.match(yearRe) || [];
    const years = Array.from(new Set(yearTokens.map((y) => parseInt(y, 10)))).sort((a, b) => a - b);
    if (!years.length) continue;
    if (years.length >= 2) return `${years[0]} \u2013 ${years[years.length - 1]}`;
    if (/\bborn\b/i.test(haystack) || /\bb\.\s*\d/i.test(haystack)) return `born ${years[0]}`;
    if (/\bdied\b/i.test(haystack) || /\bd\.\s*\d/i.test(haystack)) return `died ${years[0]}`;
  }
  return '';
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCommonsFileTitle(imageUrl) {
  if (!imageUrl) return '';
  try {
    const u = new URL(imageUrl);
    if (!/wikimedia\.org$/i.test(u.hostname) && !/wikipedia\.org$/i.test(u.hostname)) return '';
    // Examples:
    //   /wikipedia/commons/thumb/5/5e/Maya_Angelou.jpg/440px-Maya_Angelou.jpg
    //   /wikipedia/commons/5/5e/Maya_Angelou.jpg
    const parts = u.pathname.split('/').filter(Boolean);
    const thumbIdx = parts.indexOf('thumb');
    let fileName;
    if (thumbIdx >= 0) {
      fileName = parts[thumbIdx + 3];
    } else {
      fileName = parts[parts.length - 1];
    }
    return fileName ? decodeURIComponent(fileName) : '';
  } catch (_) {
    return '';
  }
}

async function fetchCommonsImageAttribution(imageUrl) {
  const fileTitle = extractCommonsFileTitle(imageUrl);
  if (!fileTitle) return '';
  const params = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'extmetadata',
    titles: `File:${fileTitle}`,
    format: 'json',
    origin: '*'
  });
  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': WIKIPEDIA_USER_AGENT } });
  if (!res.ok) return '';
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const first = Object.values(pages)[0];
  const meta = first?.imageinfo?.[0]?.extmetadata || {};
  const artist = stripHtml(meta?.Artist?.value || '');
  if (artist) return artist;
  return '';
}

async function fetchWikipediaSpeakerInfo(authorName) {
  const name = String(authorName || '').trim();
  if (!name) return null;
  const title = encodeURIComponent(name.replace(/\s+/g, '_'));
  let summary;
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, {
      headers: { 'User-Agent': WIKIPEDIA_USER_AGENT, Accept: 'application/json' },
      redirect: 'follow'
    });
    if (!res.ok) {
      console.warn(`⚠️ Wikipedia summary HTTP ${res.status} for "${name}"`);
      return null;
    }
    summary = await res.json();
  } catch (e) {
    console.warn(`⚠️ Wikipedia summary fetch failed for "${name}":`, e.message);
    return null;
  }
  if (!summary) return null;
  if (summary.type === 'disambiguation') {
    console.warn(`⚠️ Wikipedia returned disambiguation page for "${name}" — speaker_dates/image not auto-fillable`);
    return null;
  }

  const imageUrl = summary?.originalimage?.source || summary?.thumbnail?.source || '';
  const extract = String(summary?.extract || '');
  const dates = parseSpeakerDatesFromExtract(extract);
  if (!dates) {
    console.warn(
      `⚠️ No speaker_dates parsed from Wikipedia for "${name}". Extract preview: ${extract.slice(0, 220) || '(empty)'}`
    );
  }
  let attribution = '';
  if (imageUrl) {
    try {
      attribution = await fetchCommonsImageAttribution(imageUrl);
    } catch (e) {
      console.warn(`⚠️ Commons attribution fetch failed for "${name}":`, e.message);
    }
  }
  return {
    speaker_image_url: imageUrl || '',
    speaker_dates: dates || '',
    image_attribution: attribution || ''
  };
}

/**
 * Deep link to a single Firestore document in the Firebase console (quotes collection by default).
 * Used in Notion prefill notes when an existing portrait/cutout is reused so editors can open the source row.
 */
function buildFirestoreConsoleUrlForQuoteDoc(docId) {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  if (!projectId || !docId) return '';
  const coll = String(process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes').trim() || 'quotes';
  const relPath = `/${coll}/${docId}`;
  const enc = encodeURIComponent(relPath).replace(/%/g, '~');
  return `https://console.firebase.google.com/project/${projectId}/firestore/databases/-default-/data/${enc}`;
}

/**
 * When pre-filling a new Notion quote, look for another Firestore quote by the same author that already
 * has a speaker portrait or transparent cutout. If found, we do not need a fresh Wikimedia URL — reuse
 * the stored URLs and point editors at the prior doc in the console.
 * @param {*} dbConn Firestore instance
 * @param {string[]} authorCandidates e.g. [Claude-canonical author, name typed on submission]
 * @param {string} excludeDocId Firestore doc id for the new quote (Notion page id)
 * @returns {Promise<null | { sourceDocId: string, speakerCutoutUrl: string, speakerImageUrl: string, imageAttribution: string }>}
 */
async function findExistingSpeakerAssetReuseForPrefill(dbConn, authorCandidates, excludeDocId) {
  if (!dbConn || !excludeDocId) return null;
  const names = [...new Set(authorCandidates.map((n) => String(n || '').trim()).filter(Boolean))];
  if (!names.length) return null;
  const collection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const ref = dbConn.collection(collection);
  const matches = [];
  for (const author of names) {
    const snap = await ref.where('author', '==', author).limit(40).get();
    snap.forEach((docSnap) => {
      if (docSnap.id === excludeDocId) return;
      const d = docSnap.data() || {};
      const cutout = String(d.speakerCutoutUrl ?? d.speaker_cutout_url ?? '').trim();
      const portrait = String(d.speakerImageUrl ?? d.speaker_image_url ?? '').trim();
      if (!cutout && !portrait) return;
      matches.push({
        sourceDocId: docSnap.id,
        speakerCutoutUrl: cutout,
        speakerImageUrl: portrait,
        imageAttribution: String(d.imageAttribution ?? d.image_attribution ?? '').trim()
      });
    });
  }
  if (!matches.length) return null;
  const withCutout = matches.find((m) => m.speakerCutoutUrl);
  return withCutout || matches[0];
}

function truncateForNotionRichText(value, maxLen = 1900) {
  const s = String(value || '').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

// --- Notion patch + Firestore mirror ----------------------------------------

function buildPrefillNotionProperties(schema, ai, wiki, speakerReuse) {
  const properties = {};
  const set = (baseName, value, ...aliases) => {
    if (!value) return;
    const propName = findNotionPropName(schema, baseName, ...aliases);
    if (!propName) {
      console.warn(`⚠️ Prefill: no Notion column matched [${[baseName, ...aliases].join(', ')}] — value not written`);
      return;
    }
    const payload = notionTextPropertyValue(schema[propName], value);
    if (!payload) {
      // The column exists but its type (e.g. Date, Formula, Rollup) can't accept
      // the plain-text payload. Make this loud so it doesn't silently swallow data.
      console.warn(
        `⚠️ Prefill: Notion column "${propName}" has type "${schema[propName]?.type}" which doesn't accept the prefilled text. Change it to Text/Rich text to populate "${baseName}".`
      );
      return;
    }
    properties[propName] = payload;
  };

  if (ai?.author) set('author', ai.author);
  if (ai?.community_prompt) set('community_prompt', ai.community_prompt, 'community_prompt ', 'communityPrompt', 'Community prompt');
  if (ai?.blessing) set('blessing', ai.blessing, 'Daily blessing', 'daily_blessing');
  if (ai?.notification_text) set('notification_text', ai.notification_text, 'notificationText');
  if (ai?.ig_caption) set('ig_caption', ai.ig_caption, 'igCaption', 'IG Caption');
  if (ai?.what_if) set('what_if', ai.what_if, 'whatIf', 'What if');
  if (ai?.speaker_guide_line) set('speaker_guide_line', ai.speaker_guide_line, 'speakerGuideLine', 'Guide line');
  if (ai?.art_recs) set('art_recs', ai.art_recs, 'artRecs', 'Art recs', 'explore');

  // Speaker portrait: Notion "Speaker image URL" must stay a single HTTPS URL so sync → Firestore keeps working.
  // When we already have a cutout (or portrait) on another quote for this author, reuse that URL — no new Wikimedia link needed.
  const reusePortraitUrl =
    speakerReuse && (speakerReuse.speakerCutoutUrl || speakerReuse.speakerImageUrl)
      ? String(speakerReuse.speakerCutoutUrl || speakerReuse.speakerImageUrl).trim()
      : '';
  const wikiPortraitUrl = String(wiki?.speaker_image_url || '').trim();
  const speakerImageUrlForNotion = reusePortraitUrl || wikiPortraitUrl || 'needs manual lookup';
  set('speaker_image_url', speakerImageUrlForNotion, 'speakerImageUrl', 'Speaker image URL', 'image_url');

  const attrFromReuse = speakerReuse?.imageAttribution ? String(speakerReuse.imageAttribution).trim() : '';
  const attrFromWiki = String(wiki?.image_attribution || '').trim();
  set(
    'image_attribution',
    attrFromReuse || attrFromWiki || 'unavailable',
    'imageAttribution',
    'Image attribution',
    'image_credit'
  );
  if (wiki?.speaker_dates) {
    set('speaker_dates', wiki.speaker_dates, 'speakerDates', 'Speaker dates');
  }

  if (speakerReuse?.sourceDocId) {
    const consoleUrl = buildFirestoreConsoleUrlForQuoteDoc(speakerReuse.sourceDocId);
    const reuseNotes = truncateForNotionRichText(
      [
        'Existing speaker cutout/portrait already on file for this author — you do not need a new Wikimedia or portrait URL.',
        consoleUrl ? `Open the prior Firestore quote (copy speakerCutoutUrl / speakerImageUrl if you edit manually): ${consoleUrl}` : '',
        reusePortraitUrl ? `Reused image URL (also written on Speaker image URL): ${reusePortraitUrl}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    );
    set(
      'speaker_image_notes',
      reuseNotes,
      'Speaker image notes',
      'speaker_image_note',
      'image_notes',
      'prefill_notes',
      'Prefill notes',
      'internal_notes',
      'Internal notes'
    );
  }

  return properties;
}

function buildPrefillFirestorePayload(ai, wiki, speakerReuse) {
  const payload = {};
  if (ai?.author) {
    payload.author = ai.author;
  }
  if (ai?.community_prompt) {
    payload.communityPrompt = ai.community_prompt;
    payload.community_prompt = ai.community_prompt;
  }
  if (ai?.blessing) {
    payload.blessing = ai.blessing;
  }
  if (ai?.notification_text) {
    payload.notificationText = ai.notification_text;
    payload.notification_text = ai.notification_text;
  }
  if (ai?.ig_caption) {
    payload.igCaption = ai.ig_caption;
    payload.ig_caption = ai.ig_caption;
  }
  if (ai?.what_if) {
    payload.whatIf = ai.what_if;
    payload.what_if = ai.what_if;
  }
  if (ai?.speaker_guide_line) {
    payload.speakerGuideLine = ai.speaker_guide_line;
    payload.speaker_guide_line = ai.speaker_guide_line;
  }
  if (ai?.art_recs) {
    payload.artRecs = ai.art_recs;
    payload.art_recs = ai.art_recs;
  }
  const reuseCutout = speakerReuse?.speakerCutoutUrl ? String(speakerReuse.speakerCutoutUrl).trim() : '';
  const reusePortrait = speakerReuse?.speakerImageUrl ? String(speakerReuse.speakerImageUrl).trim() : '';
  const wikiPortrait = wiki?.speaker_image_url ? String(wiki.speaker_image_url).trim() : '';
  const portraitForRow = reusePortrait || wikiPortrait || reuseCutout || 'needs manual lookup';
  payload.speakerImageUrl = portraitForRow;
  payload.speaker_image_url = portraitForRow;
  if (reuseCutout) {
    payload.speakerCutoutUrl = reuseCutout;
    payload.speaker_cutout_url = reuseCutout;
  }
  const attrReuse = speakerReuse?.imageAttribution ? String(speakerReuse.imageAttribution).trim() : '';
  const attrWiki = wiki?.image_attribution ? String(wiki.image_attribution).trim() : '';
  payload.imageAttribution = attrReuse || attrWiki || 'unavailable';
  payload.image_attribution = payload.imageAttribution;
  if (wiki?.speaker_dates) {
    payload.speakerDates = wiki.speaker_dates;
    payload.speaker_dates = wiki.speaker_dates;
  }
  payload.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  return payload;
}

// --- Prefill attempt tracking + Notion failure visibility ------------------

const MAX_PREFILL_ATTEMPTS = 3;
const PREFILL_ERROR_PROP_ALIASES = ['ai_prefill_error', 'aiPrefillError', 'AI prefill error'];

function notionRichTextToPlain(prop) {
  if (!prop) return '';
  if (Array.isArray(prop.rich_text)) return prop.rich_text.map((x) => x?.plain_text || '').join('').trim();
  if (Array.isArray(prop.title)) return prop.title.map((x) => x?.plain_text || '').join('').trim();
  return '';
}

function parsePrefillAttemptCount(errorText) {
  const m = String(errorText || '').match(/^\s*Attempt\s+(\d+)\s*\/\s*\d+\b/i);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatPrefillErrorText(attemptNumber, reason) {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const cleaned = String(reason || 'unknown').replace(/\s+/g, ' ').trim().slice(0, 240);
  return `Attempt ${attemptNumber}/${MAX_PREFILL_ATTEMPTS} at ${ts} | ${cleaned}`;
}

async function notionGetPage(pageId) {
  if (!pageId) return null;
  try {
    return await notionFetchJson(`/pages/${pageId}`, { method: 'GET' });
  } catch (e) {
    console.warn(`⚠️ Notion page fetch failed for ${pageId}:`, e.message);
    return null;
  }
}

function readCurrentPrefillErrorState(pageProperties) {
  for (const alias of PREFILL_ERROR_PROP_ALIASES) {
    const found = pageProperties && Object.entries(pageProperties).find(
      ([name]) => normNotionPropKey(name) === normNotionPropKey(alias)
    );
    if (found) {
      const text = notionRichTextToPlain(found[1]);
      return { propName: found[0], text, attempts: parsePrefillAttemptCount(text) };
    }
  }
  return { propName: '', text: '', attempts: 0 };
}

async function writePrefillErrorField(schema, notionPageId, message) {
  const propName = findNotionPropName(schema, ...PREFILL_ERROR_PROP_ALIASES);
  if (!propName) return false;
  const prop = schema[propName];
  const payload = prop?.type === 'rich_text'
    ? { rich_text: message ? [{ text: { content: message } }] : [] }
    : notionTextPropertyValue(prop, message || '\u200B');
  if (!payload) return false;
  await notionFetchJson(`/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { [propName]: payload } })
  });
  return true;
}

/**
 * Orchestrates: Claude prefill + Wikipedia lookup + Notion PATCH + Firestore merge.
 * Tracks attempts in the optional `ai_prefill_error` Notion column (created by user, not required).
 * Returns a summary object so the sweep caller can log aggregate results; never throws.
 */
async function prefillSubmittedQuoteWithAi({ notionPageId, quoteText, authorName, pageProperties = null }) {
  if (!notionPageId) return { status: 'skipped', reason: 'no page id' };
  const databaseId = String(process.env.NOTION_DATABASE_ID || '').trim();
  if (!databaseId) throw new Error('NOTION_DATABASE_ID is not configured on server');

  // Resolve current attempt count from the row (skip the fetch if the caller already has properties).
  let currentProps = pageProperties;
  if (!currentProps) {
    const page = await notionGetPage(notionPageId);
    currentProps = page?.properties || {};
  }
  const errState = readCurrentPrefillErrorState(currentProps);
  if (errState.attempts >= MAX_PREFILL_ATTEMPTS) {
    return { status: 'skipped', reason: `attempt cap reached (${errState.attempts}/${MAX_PREFILL_ATTEMPTS})` };
  }
  const nextAttempt = errState.attempts + 1;

  const schema = await notionGetDatabaseProperties(databaseId);

  let ai = null;
  let claudeError = null;
  try {
    ai = await generateSubmittedQuotePrefillFields({ quoteText, authorName });
  } catch (e) {
    claudeError = e?.message || String(e);
    console.warn(`⚠️ Claude prefill failed for ${notionPageId} (attempt ${nextAttempt}/${MAX_PREFILL_ATTEMPTS}):`, claudeError);
  }

  // Claude failure is the only "real" failure for retry purposes; surface it to Notion and stop here.
  if (!ai) {
    try {
      const wrote = await writePrefillErrorField(
        schema,
        notionPageId,
        formatPrefillErrorText(nextAttempt, `Claude: ${claudeError || 'unknown error'}`)
      );
      if (!wrote) {
        console.warn(`⚠️ ai_prefill_error column not present on Notion DB; failures will not be visible there.`);
      }
    } catch (e) {
      console.warn(`⚠️ Could not write ai_prefill_error for ${notionPageId}:`, e.message);
    }
    return { status: 'failed', attempt: nextAttempt, max: MAX_PREFILL_ATTEMPTS, error: claudeError };
  }

  const resolvedAuthor = ai?.author || authorName;
  let wiki = null;
  try {
    wiki = await fetchWikipediaSpeakerInfo(resolvedAuthor);
  } catch (e) {
    console.warn(`⚠️ Wikipedia lookup failed for "${resolvedAuthor}":`, e.message);
  }

  let speakerReuse = null;
  if (db) {
    try {
      speakerReuse = await findExistingSpeakerAssetReuseForPrefill(db, [resolvedAuthor, authorName], notionPageId);
    } catch (e) {
      console.warn(`⚠️ Existing speaker reuse lookup failed for "${resolvedAuthor}":`, e.message);
    }
  }
  if (speakerReuse?.sourceDocId) {
    const consoleUrl = buildFirestoreConsoleUrlForQuoteDoc(speakerReuse.sourceDocId);
    const cut = speakerReuse.speakerCutoutUrl ? 'yes' : 'no';
    const portrait = speakerReuse.speakerImageUrl ? 'yes' : 'no';
    console.log(
      `\u2139\ufe0f Prefill: reusing speaker assets from an existing quote (cutout=${cut}, portrait=${portrait}). No new Wikimedia URL required. Prior doc: ${speakerReuse.sourceDocId}${consoleUrl ? ` | ${consoleUrl}` : ''}`
    );
  }

  const properties = buildPrefillNotionProperties(schema, ai, wiki, speakerReuse);
  // Clear any prior error message on success.
  if (errState.propName) {
    const errProp = schema[errState.propName];
    if (errProp?.type === 'rich_text') {
      properties[errState.propName] = { rich_text: [] };
    }
  }
  if (Object.keys(properties).length) {
    await notionFetchJson(`/pages/${notionPageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties })
    });
  }

  if (db) {
    const collection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
    const payload = buildPrefillFirestorePayload(ai, wiki, speakerReuse);
    await db.collection(collection).doc(notionPageId).set(payload, { merge: true });
  }

  const reuseTag = speakerReuse?.sourceDocId ? `reuse=${speakerReuse.sourceDocId}` : 'reuse=none';
  console.log(
    `\u2728 Prefilled ${notionPageId} (claude=${ai._model || 'ok'}, wiki=${wiki?.speaker_image_url ? 'image+meta' : wiki?.speaker_dates ? 'meta-only' : 'none'}, ${reuseTag})`
  );
  return { status: 'ok', attempt: nextAttempt, hasWiki: !!wiki };
}

// --- Polling sweep for Notion-added quotes ----------------------------------

const PREFILL_SWEEP_TICK_MS = Math.max(60000, parseInt(process.env.QUOTE_PREFILL_POLL_INTERVAL_MS || '', 10) || 600000);
const PREFILL_SWEEP_BATCH_LIMIT = Math.max(1, parseInt(process.env.QUOTE_PREFILL_BATCH_LIMIT || '', 10) || 5);
let quotePrefillSweepRunning = false;

function extractQuoteTextFromNotionPage(page) {
  const props = page?.properties || {};
  const titleProp = props.quote_text || Object.values(props).find((p) => p?.type === 'title');
  const richProp = props.quote_text?.type === 'rich_text' ? props.quote_text : null;
  return notionRichTextToPlain(titleProp) || notionRichTextToPlain(richProp) || '';
}

function extractAuthorFromNotionPage(page) {
  const props = page?.properties || {};
  for (const alias of ['author', 'Author']) {
    if (props[alias]) {
      const t = notionRichTextToPlain(props[alias]);
      if (t) return t;
    }
  }
  return '';
}

async function queryNotionForPrefillCandidates(databaseId, schema, limit) {
  const quoteTextName = getNotionTitlePropName(schema);
  const communityPromptName = findNotionPropName(
    schema,
    'community_prompt',
    'community_prompt ',
    'communityPrompt',
    'Community prompt'
  );
  if (!quoteTextName || !communityPromptName) {
    throw new Error(`Notion DB missing required columns (need title + community_prompt rich_text)`);
  }
  const quoteProp = schema[quoteTextName];
  const communityProp = schema[communityPromptName];
  const filter = {
    and: [
      { property: quoteTextName, [quoteProp.type]: { is_not_empty: true } },
      { property: communityPromptName, [communityProp.type]: { is_empty: true } }
    ]
  };
  const json = await notionFetchJson(`/databases/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ filter, page_size: Math.min(100, limit * 4) })
  });
  return Array.isArray(json?.results) ? json.results : [];
}

async function runQuotePrefillSweep({ limit = PREFILL_SWEEP_BATCH_LIMIT, trigger = 'manual' } = {}) {
  if (quotePrefillSweepRunning) {
    return { skipped: true, reason: 'sweep already running' };
  }
  const apiKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return { skipped: true, reason: 'ANTHROPIC_API_KEY not configured' };
  const databaseId = String(process.env.NOTION_DATABASE_ID || '').trim();
  if (!databaseId) return { skipped: true, reason: 'NOTION_DATABASE_ID not configured' };

  quotePrefillSweepRunning = true;
  const startedAt = Date.now();
  const counts = { considered: 0, capped: 0, ok: 0, failed: 0, errored: 0 };
  try {
    const schema = await notionGetDatabaseProperties(databaseId);
    const candidates = await queryNotionForPrefillCandidates(databaseId, schema, limit);
    counts.considered = candidates.length;
    let processed = 0;
    for (const page of candidates) {
      if (processed >= limit) break;
      const errState = readCurrentPrefillErrorState(page.properties);
      if (errState.attempts >= MAX_PREFILL_ATTEMPTS) {
        counts.capped += 1;
        continue;
      }
      const quoteText = extractQuoteTextFromNotionPage(page);
      const authorName = extractAuthorFromNotionPage(page);
      if (!quoteText || !authorName) {
        counts.capped += 1;
        continue;
      }
      processed += 1;
      try {
        const result = await prefillSubmittedQuoteWithAi({
          notionPageId: page.id,
          quoteText,
          authorName,
          pageProperties: page.properties
        });
        if (result?.status === 'ok') counts.ok += 1;
        else if (result?.status === 'failed') counts.failed += 1;
        else counts.capped += 1;
      } catch (e) {
        counts.errored += 1;
        console.warn(`⚠️ Sweep error for ${page.id}:`, e.message);
      }
    }
    const ms = Date.now() - startedAt;
    console.log(`🧹 Quote prefill sweep (${trigger}): ${JSON.stringify(counts)} in ${ms}ms`);
    return { ...counts, ms, trigger };
  } finally {
    quotePrefillSweepRunning = false;
  }
}

let quotePrefillSweepTimer = null;
function startQuotePrefillSweepScheduler() {
  if (quotePrefillSweepTimer) return;
  const enabled = process.env.NODE_ENV === 'production'
    || String(process.env.ENABLE_QUOTE_PREFILL_POLL || '').trim() === '1';
  if (!enabled) {
    console.log('ℹ️ Quote prefill sweep disabled (set ENABLE_QUOTE_PREFILL_POLL=1 or run NODE_ENV=production to enable).');
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY || !process.env.NOTION_DATABASE_ID) {
    console.log('ℹ️ Quote prefill sweep disabled (missing ANTHROPIC_API_KEY or NOTION_DATABASE_ID).');
    return;
  }
  quotePrefillSweepTimer = setInterval(() => {
    runQuotePrefillSweep({ trigger: 'cron' }).catch((e) => {
      console.warn('⚠️ Quote prefill sweep tick failed:', e?.message || e);
    });
  }, PREFILL_SWEEP_TICK_MS);
  if (typeof quotePrefillSweepTimer.unref === 'function') quotePrefillSweepTimer.unref();
  console.log(`🧹 Quote prefill sweep scheduled every ${Math.round(PREFILL_SWEEP_TICK_MS / 1000)}s (batch=${PREFILL_SWEEP_BATCH_LIMIT}, maxAttempts=${MAX_PREFILL_ATTEMPTS}).`);
}

// ---------------------------------------------------------------------------

function formatZapierCaptionFromQuoteData(quoteData = {}) {
  const igCaption = String(
    quoteData.zapierCaption ??
      quoteData.igCaption ??
      quoteData.ig_caption ??
      ''
  ).trim();
  if (igCaption) return igCaption;

  const text = String(quoteData.text ?? quoteData.body ?? '').trim();
  const author = String(quoteData.author ?? '').trim();
  const whatIf = String(quoteData.whatIf ?? quoteData.what_if ?? '').trim();
  const core = text && author ? `${text} — ${author}` : text || author || '';
  if (!whatIf) return core;
  if (!core) return whatIf;
  return `${core}\n\nWhat if: ${whatIf}`;
}

function formatNotificationTextFromQuoteData(quoteData = {}) {
  const notificationText = String(
    quoteData.notificationText ??
      quoteData.notification_text ??
      quoteData.pushNotificationText ??
      quoteData.push_notification_text ??
      ''
  ).trim();
  if (notificationText) return notificationText;

  const text = String(quoteData.text ?? quoteData.body ?? quoteData.quote ?? '').trim();
  const author = String(quoteData.author ?? '').trim();
  return text && author ? `${text} — ${author}` : text || author || '';
}

async function runDailyResetForDate(dateKey, source = 'unknown') {
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  const opId = `daily-reset-${dateKey}`;
  const opRef = db.collection('ops').doc(opId);
  const opSnap = await opRef.get();
  if (opSnap.exists && opSnap.data()?.status === 'success') {
    return {
      success: true,
      date: dateKey,
      alreadyReset: true,
      archived: !!opSnap.data()?.archived
    };
  }

  /**
   * `dateKey` is the NEW app-day (getAppDateKey() at ≥07:00 UTC, e.g. 2026-04-29).
   * Until 07:00 UTC the live doc is still quilts/{closingKey} (previous calendar day as YYYY-MM-DD,
   * e.g. 2026-04-28). Archiving/clearing quilts/{dateKey} at reset time was wrong: that doc is often
   * empty while the real quilt stayed under closingKey and never got archived or rotated.
   */
  const closingKey = addDaysToDateKey(dateKey, -1);
  const closingQuiltRef = db.collection('quilts').doc(closingKey);
  const closingQuoteRef = db.collection('quotes').doc(closingKey);
  const closingArchiveRef = db.collection('archives').doc(closingKey);
  const newQuiltRef = db.collection('quilts').doc(dateKey);

  const [closingQuiltSnap, closingQuoteSnap, closingArchiveSnap] = await Promise.all([
    closingQuiltRef.get(),
    closingQuoteRef.get(),
    closingArchiveRef.get()
  ]);

  const closingQuiltData = closingQuiltSnap.exists ? closingQuiltSnap.data() : null;
  const closingQuoteData = closingQuoteSnap.exists ? closingQuoteSnap.data() : null;

  let archived = false;
  if (
    !closingArchiveSnap.exists &&
    closingQuiltData &&
    Array.isArray(closingQuiltData.blocks) &&
    closingQuiltData.blocks.length > 1
  ) {
    const archivePayload = {
      date: closingKey,
      quilt: {
        blocks: closingQuiltData.blocks || [],
        contributorCount: closingQuiltData.contributorCount || 1
      },
      quote: closingQuoteData
        ? { text: closingQuoteData.text || '', author: closingQuoteData.author || '' }
        : null,
      userCount: closingQuiltData.contributorCount || 1,
      isComplete: true,
      resetSource: source,
      archivedAt: getUtcIsoNow()
    };
    await closingArchiveRef.set(archivePayload, { merge: true });
    archived = true;
  }

  await newQuiltRef.set(
    {
      blocks: [],
      contributorCount: 1,
      contributors: [],
      colorReplayEvents: [],
      quiltFingerprint: '',
      date: dateKey,
      lastUpdated: getUtcIsoNow(),
      resetBy: source,
      resetAt: getUtcIsoNow(),
      writeProvenance: {
        clientBuild: 'server',
        writeReason: 'server-daily-reset',
        appInstanceId: 'server',
        userId: 'server',
        platform: 'server',
        source,
        writtenAt: getUtcIsoNow()
      }
    },
    { merge: true }
  );

  await opRef.set(
    {
      status: 'success',
      date: dateKey,
      closingKey,
      archived,
      source,
      completedAt: getUtcIsoNow()
    },
    { merge: true }
  );

  return {
    success: true,
    date: dateKey,
    closingKey,
    alreadyReset: false,
    archived
  };
}

async function runManualAdminQuiltResetForDate(dateKey, source = 'admin-manual') {
  if (!db) {
    throw new Error('Firestore not initialized');
  }

  const now = getUtcIsoNow();
  const quiltRef = db.collection('quilts').doc(dateKey);
  await quiltRef.set(
    {
      blocks: [],
      contributorCount: 1,
      contributors: [],
      colorReplayEvents: [],
      quiltFingerprint: '',
      date: dateKey,
      lastUpdated: now,
      resetBy: source,
      resetAt: now,
      lastResetAt: now,
      lastResetSource: source,
      writeProvenance: {
        clientBuild: 'server',
        writeReason: 'server-admin-manual-reset',
        appInstanceId: 'server',
        userId: 'server',
        platform: 'server',
        source,
        writtenAt: now
      }
    },
    { merge: true }
  );

  const opId = `admin-reset-${dateKey}-${now.replace(/[^0-9TZ]/g, '')}`;
  await db.collection('ops').doc(opId).set(
    {
      status: 'success',
      date: dateKey,
      source,
      force: true,
      completedAt: now
    },
    { merge: true }
  );

  return {
    success: true,
    date: dateKey,
    force: true,
    resetApiVersion: 'manual-force-reset-1',
    source,
    completedAt: now
  };
}

function hasLayoutBInRaw(raw) {
  if (!raw) return false;
  return !!(
    raw.postLayoutBImageStorageUrl ||
    raw.layoutBUrl ||
    raw.postLayoutBSpeakerImageStorageUrl ||
    raw.layoutBSpeakerUrl ||
    raw.postLayoutBImageData ||
    raw.postLayoutBSpeakerImageData
  );
}

/**
 * Matches `QuoteService.saveDayAssignment` → `dailyQuoteAssignments/{dateKey}`.
 * Prefer this over `quotes/{dateKey}` for Zapier captions: the app’s “today” quote comes from assignments + catalog,
 * while `quotes/` is mostly Notion UUID rows; a date-shaped `quotes/YYYY-MM-DD` doc is often stale or wrong.
 */
async function captionFromDailyQuoteAssignments(dateKey) {
  if (!db || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '';
  try {
    const snap = await db.collection('dailyQuoteAssignments').doc(dateKey).get();
    if (!snap.exists) return '';
    const a = snap.data() || {};
    const sourceId = String(a.sourceId || '').trim();
    if (sourceId) {
      try {
        const quoteSnap = await db.collection('quotes').doc(sourceId).get();
        if (quoteSnap.exists) {
          const caption = formatZapierCaptionFromQuoteData(quoteSnap.data() || {});
          if (caption) return caption;
        }
      } catch (e) {
        console.warn(`⚠️ quotes/${sourceId} caption lookup:`, e.message);
      }
    }
    const assignmentCaption = formatZapierCaptionFromQuoteData(a);
    if (assignmentCaption) return assignmentCaption;
    const t = String(a.textSnapshot || '').trim();
    const au = String(a.authorSnapshot || '').trim();
    if (t && au) return `${t} — ${au}`;
    if (t) return t;
  } catch (e) {
    console.warn(`⚠️ dailyQuoteAssignments/${dateKey}:`, e.message);
  }
  return '';
}

async function notificationTextFromDailyQuoteAssignments(dateKey) {
  if (!db || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '';
  try {
    const snap = await db.collection('dailyQuoteAssignments').doc(dateKey).get();
    if (!snap.exists) return '';
    const a = snap.data() || {};
    const sourceId = String(a.sourceId || '').trim();
    if (sourceId) {
      try {
        const quoteSnap = await db.collection('quotes').doc(sourceId).get();
        if (quoteSnap.exists) {
          const notificationText = formatNotificationTextFromQuoteData(quoteSnap.data() || {});
          if (notificationText) return notificationText;
        }
      } catch (e) {
        console.warn(`⚠️ quotes/${sourceId} notification text lookup:`, e.message);
      }
    }
    const assignmentNotificationText = formatNotificationTextFromQuoteData(a);
    if (assignmentNotificationText) return assignmentNotificationText;
    const t = String(a.textSnapshot || '').trim();
    const au = String(a.authorSnapshot || '').trim();
    if (t && au) return `${t} — ${au}`;
    if (t) return t;
  } catch (e) {
    console.warn(`⚠️ dailyQuoteAssignments/${dateKey} notification text:`, e.message);
  }
  return '';
}

function getPushTokenDocId(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function isInvalidPushTokenError(error) {
  const code = String(error?.error?.code || error?.code || '');
  return [
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
    'messaging/invalid-argument'
  ].includes(code);
}

function truncatePushBody(text, maxLen = 178) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

async function getDailyQuotePushText(dateKey) {
  const assigned = await notificationTextFromDailyQuoteAssignments(dateKey);
  if (assigned) return assigned;

  try {
    const quoteSnap = await db.collection('quotes').doc(dateKey).get();
    if (quoteSnap.exists) {
      const notificationText = formatNotificationTextFromQuoteData(quoteSnap.data() || {});
      if (notificationText) return notificationText;
    }
  } catch (e) {
    console.warn(`⚠️ push quote fallback quotes/${dateKey}:`, e.message);
  }
  return 'A new quote is waiting in Our Daily.';
}

async function collectDailyQuotePushTokens() {
  const snap = await db
    .collection('pushTokens')
    .where('enabled', '==', true)
    .where('notificationTypes', 'array-contains', 'daily_quote')
    .get();

  const tokens = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const token = String(data.token || '').trim();
    if (token) tokens.push({ id: docSnap.id, token });
  });
  return tokens;
}

async function sendDailyQuotePushNotifications(dateKey = getAppDateKey(), options = {}) {
  if (!db) throw new Error('Firestore not initialized');
  const force = options && options.force === true;
  const opRef = db.collection('ops').doc(`daily-quote-push-${dateKey}`);
  if (!force) {
    const opSnap = await opRef.get();
    const opData = opSnap.exists ? opSnap.data() || {} : null;
    if (opData?.status === 'success') {
      return {
        success: true,
        date: dateKey,
        alreadySent: true,
        sent: Number(opData.sent || 0),
        failed: Number(opData.failed || 0),
        pruned: Number(opData.pruned || 0)
      };
    }
  }

  const recipients = await collectDailyQuotePushTokens();
  if (!recipients.length) {
    await opRef.set(
      {
        status: 'success',
        date: dateKey,
        sent: 0,
        failed: 0,
        pruned: 0,
        quotePreview: '',
        completedAt: getUtcIsoNow()
      },
      { merge: true }
    );
    return { success: true, date: dateKey, sent: 0, failed: 0, pruned: 0 };
  }

  const quoteText = await getDailyQuotePushText(dateKey);
  const body = truncatePushBody(quoteText);
  let sent = 0;
  let failed = 0;
  let pruned = 0;

  for (let i = 0; i < recipients.length; i += 500) {
    const chunk = recipients.slice(i, i + 500);
    const message = {
      tokens: chunk.map((r) => r.token),
      notification: {
        body
      },
      data: {
        type: 'daily_quote',
        date: dateKey
      },
      apns: {
        payload: {
          aps: {
            sound: 'default'
          }
        }
      }
    };
    const messaging = admin.messaging();
    const response = typeof messaging.sendEachForMulticast === 'function'
      ? await messaging.sendEachForMulticast(message)
      : await messaging.sendMulticast(message);

    sent += response.successCount || 0;
    failed += response.failureCount || 0;

    await Promise.all(
      (response.responses || []).map(async (r, idx) => {
        if (r.success) return;
        const recipient = chunk[idx];
        if (!recipient) return;
        if (isInvalidPushTokenError(r.error)) {
          pruned += 1;
          await db.collection('pushTokens').doc(recipient.id).set(
            {
              enabled: false,
              disabledAt: getUtcIsoNow(),
              disabledReason: String(r.error?.code || 'invalid-token')
            },
            { merge: true }
          );
        } else {
          await db.collection('pushTokens').doc(recipient.id).set(
            {
              lastErrorAt: getUtcIsoNow(),
              lastError: String(r.error?.code || r.error?.message || 'unknown')
            },
            { merge: true }
          );
        }
      })
    );
  }

  await opRef.set(
    {
      status: 'success',
      date: dateKey,
      sent,
      failed,
      pruned,
      quotePreview: body,
      completedAt: getUtcIsoNow()
    },
    { merge: true }
  );

  return { success: true, date: dateKey, sent, failed, pruned };
}

/**
 * @param {{ date?: string }} [options] - optional YYYY-MM-DD (e.g. from Zapier body) to force which "app day" to use
 */
async function getTodayInstagramImage(options = {}) {
  if (!db) { throw new Error('Firestore not initialized'); }

  let primaryKey;
  let fallbackKey;
  if (options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    primaryKey = options.date;
    fallbackKey = addDaysToDateKey(primaryKey, -1);
  } else {
    primaryKey = getAppDateKey();
    fallbackKey = addDaysToDateKey(primaryKey, -1);
  }

  try {
    console.log(
      `🔍 Instagram images: trying app day ${primaryKey}, fallback ${fallbackKey}`
    );
    const primarySnap = await db.collection('instagram-images').doc(primaryKey).get();
    const fallbackSnap = await db.collection('instagram-images').doc(fallbackKey).get();

    let raw;
    let dateUsed;

    if (primarySnap.exists) {
      raw = primarySnap.data();
      dateUsed = primaryKey;
    } else if (fallbackSnap.exists) {
      raw = fallbackSnap.data();
      dateUsed = fallbackKey;
      console.log(`📅 No doc for ${primaryKey}, using ${fallbackKey}`);
    } else {
      throw new Error(
        `No Instagram image found for ${primaryKey} or ${fallbackKey}`
      );
    }

    // If today's doc exists but was saved without layout B, fill from previous day (common when keys misaligned before this fix).
    if (
      primarySnap.exists &&
      fallbackSnap.exists &&
      !hasLayoutBInRaw(raw) &&
      hasLayoutBInRaw(fallbackSnap.data())
    ) {
      const fb = fallbackSnap.data();
      raw = {
        ...raw,
        postLayoutBImageStorageUrl:
          raw.postLayoutBImageStorageUrl || fb.postLayoutBImageStorageUrl,
        layoutBUrl: raw.layoutBUrl || fb.layoutBUrl,
        postLayoutBSpeakerImageStorageUrl:
          raw.postLayoutBSpeakerImageStorageUrl || fb.postLayoutBSpeakerImageStorageUrl,
        layoutBSpeakerUrl: raw.layoutBSpeakerUrl || fb.layoutBSpeakerUrl,
        postLayoutBImageData: raw.postLayoutBImageData || fb.postLayoutBImageData,
        postLayoutBSpeakerImageData:
          raw.postLayoutBSpeakerImageData || fb.postLayoutBSpeakerImageData
      };
      console.log(`📎 Merged layout B from ${fallbackKey} into ${primaryKey}`);
    }

    console.log(`✅ Instagram image for ${dateUsed} (layout B: ${hasLayoutBInRaw(raw)})`);

    // Passthrough URLs from client push (Firebase Storage) — prefer these for /api/generate-instagram
    // so Zapier gets both links even if byte fetch from Storage fails on Railway.
    const storageClassicUrl = raw.imageStorageUrl || raw.classicUrl || null;
    const storageLayoutBUrl =
      raw.postLayoutBImageStorageUrl || raw.layoutBUrl || null;
    const storageLayoutBSpeakerUrl =
      raw.postLayoutBSpeakerImageStorageUrl || raw.layoutBSpeakerUrl || null;
    const storageReelWebmUrl = raw.reelWebmStorageUrl || raw.reelUrl || null;
    const storageReelMp4Url = raw.reelMp4StorageUrl || raw.reelMp4Url || null;

    let imageDataField = raw.imageData || null;
    let postLayoutBField = raw.postLayoutBImageData || null;
    let postLayoutBSpeakerField = raw.postLayoutBSpeakerImageData || null;

    // Only fetch bytes when we do not already have a public URL for that slot.
    if (!imageDataField && !storageClassicUrl && raw.imageStorageUrl) {
      imageDataField = await fetchUrlAsImageDataString(raw.imageStorageUrl);
    }
    if (!imageDataField && !storageClassicUrl && raw.classicUrl) {
      imageDataField = await fetchUrlAsImageDataString(raw.classicUrl);
    }
    if (!postLayoutBField && !storageLayoutBUrl && raw.postLayoutBImageStorageUrl) {
      postLayoutBField = await fetchUrlAsImageDataString(raw.postLayoutBImageStorageUrl);
    }
    if (!postLayoutBField && !storageLayoutBUrl && raw.layoutBUrl) {
      postLayoutBField = await fetchUrlAsImageDataString(raw.layoutBUrl);
    }
    if (!postLayoutBSpeakerField && !storageLayoutBSpeakerUrl && raw.postLayoutBSpeakerImageStorageUrl) {
      postLayoutBSpeakerField = await fetchUrlAsImageDataString(raw.postLayoutBSpeakerImageStorageUrl);
    }
    if (!postLayoutBSpeakerField && !storageLayoutBSpeakerUrl && raw.layoutBSpeakerUrl) {
      postLayoutBSpeakerField = await fetchUrlAsImageDataString(raw.layoutBSpeakerUrl);
    }
    if (!imageDataField && !storageClassicUrl) {
      throw new Error(`Instagram doc for ${dateUsed} has no imageData or imageStorageUrl`);
    }

    // Caption order: (1) assigned Notion quote ig_caption via dailyQuoteAssignments.sourceId.
    // (2) stored instagram-images caption fields, for legacy/static snapshot docs.
    // (3) date-shaped quote doc fallback. See captionSource in JSON.
    let quote = "Every day is a new beginning.";
    let captionSource = 'default';
    try {
      const stamp =
        typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date.trim())
          ? raw.date.trim()
          : null;
      const captionKeys = [...new Set([dateUsed, stamp].filter(Boolean))];

      let fromAssignment = '';
      for (const dk of captionKeys) {
        fromAssignment = await captionFromDailyQuoteAssignments(dk);
        if (fromAssignment) break;
      }
      if (fromAssignment) {
        quote = fromAssignment;
        captionSource = 'dailyQuoteAssignments';
        console.log(`✅ Caption from dailyQuoteAssignments (${captionKeys.join(' → ')})`);
      } else {
        const inline =
          (typeof raw.zapierCaption === 'string' && raw.zapierCaption.trim()) ||
          (typeof raw.igCaption === 'string' && raw.igCaption.trim()) ||
          (typeof raw.ig_caption === 'string' && raw.ig_caption.trim()) ||
          (typeof raw.caption === 'string' && raw.caption.trim()) ||
          '';
        if (inline) {
          quote = inline;
          captionSource = 'instagram-images';
          console.log(`✅ Caption from instagram-images inline caption (${dateUsed})`);
        } else {
          for (const dk of captionKeys) {
            const quoteDoc = await db.collection('quotes').doc(dk).get();
            if (!quoteDoc.exists) continue;
            const quoteData = quoteDoc.data() || {};
            const caption = formatZapierCaptionFromQuoteData(quoteData);
            if (caption) {
              quote = caption;
              captionSource = 'quotes';
              console.log(`✅ Caption from quotes/{${dk}}`);
              break;
            }
          }
          if (captionSource === 'default') {
            console.log(`📝 No caption for ${captionKeys.join(', ')}, using default`);
          }
        }
      }
    } catch (quoteError) {
      console.warn(`⚠️ Could not fetch quote for ${dateUsed}:`, quoteError.message);
    }

    return {
      imageData: imageDataField,
      postLayoutBImageData: postLayoutBField || null,
      postLayoutBSpeakerImageData: postLayoutBSpeakerField || null,
      storageClassicUrl,
      storageLayoutBUrl,
      storageLayoutBSpeakerUrl,
      storageReelWebmUrl,
      storageReelMp4Url,
      quote: quote,
      captionSource,
      date: dateUsed
    };
  } catch (error) { 
    console.error('Error fetching Instagram image:', error); 
    throw error; 
  }
}

app.post('/api/generate-instagram', async (req, res) => {
  try {
    console.log('🚀 Starting Instagram image generation from Firestore...');

    const bodyDate =
      req.body && typeof req.body.date === 'string' ? req.body.date.trim() : undefined;
    const imageData = await getTodayInstagramImage(
      bodyDate ? { date: bodyDate } : {}
    );

    let baseUrl = process.env.RAILWAY_STATIC_URL || `https://our-daily-quilt-production.up.railway.app`;
    if (!baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }

    const timestamp = Date.now();

    // Prefer Firebase Storage URLs from Firestore (reliable for Zapier). Fall back to proxying via /api/image.
    let imageUrl = '';
    let postLayoutBImageUrl = '';
    let postLayoutBSpeakerImageUrl = '';

    if (imageData.storageClassicUrl) {
      imageUrl = imageData.storageClassicUrl;
    } else if (imageData.imageData) {
      const filename = `instagram-${timestamp}.png`;
      imageStore.set(filename, imageData.imageData);
      imageUrl = `${baseUrl}/api/image/${filename}`;
    }

    if (imageData.storageLayoutBUrl) {
      postLayoutBImageUrl = imageData.storageLayoutBUrl;
    } else if (imageData.postLayoutBImageData) {
      const postLayoutBFilename = `instagram-post-layout-b-${timestamp}.png`;
      imageStore.set(postLayoutBFilename, imageData.postLayoutBImageData);
      postLayoutBImageUrl = `${baseUrl}/api/image/${postLayoutBFilename}`;
    }

    if (imageData.storageLayoutBSpeakerUrl) {
      postLayoutBSpeakerImageUrl = imageData.storageLayoutBSpeakerUrl;
    } else if (imageData.postLayoutBSpeakerImageData) {
      const postLayoutBSpeakerFilename = `instagram-post-layout-b-speaker-${timestamp}.png`;
      imageStore.set(postLayoutBSpeakerFilename, imageData.postLayoutBSpeakerImageData);
      postLayoutBSpeakerImageUrl = `${baseUrl}/api/image/${postLayoutBSpeakerFilename}`;
    }

    const hasLayoutB = !!postLayoutBImageUrl;
    const hasLayoutBSpeaker = !!postLayoutBSpeakerImageUrl;
    const reelWebmUrl = imageData.storageReelWebmUrl || '';
    const reelMp4Url = imageData.storageReelMp4Url || '';
    /** Instagram Reels accept MP4 (H.264); WebM is a fallback until /api/transcode-instagram-reel runs. */
    const reelVideoUrl = reelMp4Url || reelWebmUrl || '';
    const hasReelWebm = !!reelWebmUrl;
    const hasReelMp4 = !!reelMp4Url;
    // Bump when response shape changes — curl this endpoint to confirm Railway deployed the right file.
    const apiVersion = 'instagram-api-14-layout-b-speaker';
    // Zapier: never send null for URL fields (use ""), or Zapier shows "null" forever.
    // Aliases + array help Zaps that only show the first URL or need explicit picks.
    const imageUrls = [
      imageUrl,
      hasLayoutB ? postLayoutBImageUrl : '',
      hasLayoutBSpeaker ? postLayoutBSpeakerImageUrl : ''
    ].filter(Boolean);
    const mediaUrls = [...imageUrls];
    if (reelVideoUrl) mediaUrls.push(reelVideoUrl);
    const result = {
      apiVersion,
      success: true,
      imageUrl,
      postLayoutBImageUrl: postLayoutBImageUrl || '',
      postLayoutBSpeakerImageUrl: postLayoutBSpeakerImageUrl || '',
      classicImageUrl: imageUrl,
      layoutBImageUrl: postLayoutBImageUrl || '',
      layoutBSpeakerImageUrl: postLayoutBSpeakerImageUrl || '',
      imageUrls,
      reelWebmUrl,
      reelMp4Url,
      reelVideoUrl,
      hasReelWebm,
      hasReelMp4,
      reelNeedsTranscode: hasReelWebm && !hasReelMp4,
      mediaUrls,
      caption: imageData.quote,
      ig_caption: imageData.quote,
      igCaption: imageData.quote,
      captionSource: imageData.captionSource || 'default',
      date: imageData.date,
      captionLength: imageData.quote.length,
      hasPostLayoutB: hasLayoutB,
      hasPostLayoutBSpeaker: hasLayoutBSpeaker,
      note:
        'imageUrl/classicImageUrl = classic 4:5. postLayoutBImageUrl/layoutBImageUrl = layout B 4:5. postLayoutBSpeakerImageUrl/layoutBSpeakerImageUrl = layout B with speaker portrait. reelVideoUrl = IG-ready MP4 when present, else WebM. After pushing assets, the app calls POST /api/transcode-instagram-reel to produce reelMp4Url.'
    };
    
    console.log(
      '✅ Instagram assets from Firestore:',
      hasLayoutB || hasLayoutBSpeaker
        ? `classic${hasLayoutB ? ' + layout B' : ''}${hasLayoutBSpeaker ? ' + layout B speaker' : ''} URLs`
        : 'classic URL only',
      hasReelWebm || hasReelMp4 ? `+ reel (${hasReelMp4 ? 'MP4' : 'WebM only'})` : ''
    );
    res.json(result);
    
  } catch (error) {
    console.error('❌ Error generating Instagram image:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      suggestion: 'Check Firestore connection and data'
    });
  }
});

// Serve generated images
app.get('/api/image/:filename', (req, res) => {
  const { filename } = req.params;
  const imageData = imageStore.get(filename);
  
  if (!imageData) {
    return res.status(404).json({ error: 'Image not found' });
  }
  
  let mime = 'image/png';
  let base64Data = imageData;
  if (/^data:image\/jpeg;base64,/i.test(imageData)) {
    mime = 'image/jpeg';
    base64Data = imageData.replace(/^data:image\/jpeg;base64,/i, '');
  } else {
    base64Data = imageData.replace(/^data:image\/png;base64,/i, '');
  }
  const buffer = Buffer.from(base64Data, 'base64');

  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  res.send(buffer);
});

// CORS-safe image proxy for canvas exports that need to read/process remote speaker portraits.
app.get('/api/proxy-image', async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    const rawUrl = String(req.query?.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'Missing url' });
    }
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http(s) image URLs are supported' });
    }
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'OurDailyQuiltImageProxy/1.0'
      }
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Image fetch failed (${upstream.status})` });
    }
    const contentType = (upstream.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ error: `Unsupported content type: ${contentType}` });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (error) {
    console.warn('proxy-image failed:', error.message);
    res.status(500).json({ error: 'Image proxy failed' });
  }
});

// Clean up old images (keep only last 10)
app.get('/api/cleanup-images', (req, res) => {
  const filenames = Array.from(imageStore.keys());
  if (filenames.length > 10) {
    const toDelete = filenames.slice(0, filenames.length - 10);
    toDelete.forEach(filename => imageStore.delete(filename));
    console.log(`🧹 Cleaned up ${toDelete.length} old images`);
  }
  res.json({ 
    success: true, 
    totalImages: imageStore.size,
    cleaned: filenames.length > 10 ? filenames.length - 10 : 0
  });
});

// Fallback endpoint for testing
app.post('/api/test-instagram', (req, res) => {
  const today = new Date();
  const dateString = today.toISOString().split('T')[0];
  
  res.json({
    success: true,
    message: 'Test Instagram endpoint working',
    date: dateString,
    timestamp: new Date().toISOString(),
    note: 'Firestore-based image generation'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Instagram Quilt Generator (Firestore)',
    version: '1.0.0',
    resetApiVersion: 'manual-force-reset-1',
    firestoreReady: !!db
  });
});

app.options('/api/push/register', (req, res) => {
  setPushApiCors(res);
  return res.status(204).end();
});

app.post('/api/push/register', async (req, res) => {
  setPushApiCors(res);
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Firestore not initialized' });
    }

    const token = String(req.body?.token || '').trim();
    if (!token || token.length < 20) {
      return res.status(400).json({ success: false, error: 'Valid push token is required' });
    }

    const tokenId = getPushTokenDocId(token);
    const notificationTypes = Array.isArray(req.body?.notificationTypes)
      ? req.body.notificationTypes.map((v) => String(v).trim()).filter(Boolean)
      : ['daily_quote'];

    await db.collection('pushTokens').doc(tokenId).set(
      {
        token,
        platform: String(req.body?.platform || 'unknown').trim(),
        timezone: String(req.body?.timezone || '').trim(),
        deviceId: String(req.body?.deviceId || '').trim(),
        notificationTypes: notificationTypes.includes('daily_quote') ? notificationTypes : ['daily_quote'],
        enabled: req.body?.enabled !== false,
        updatedAt: getUtcIsoNow(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return res.json({ success: true, tokenId });
  } catch (error) {
    console.error('❌ Push token registration failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Push token registration failed'
    });
  }
});

app.options('/api/push/daily-quote', (req, res) => {
  setPushApiCors(res);
  return res.status(204).end();
});

app.post('/api/push/daily-quote', async (req, res) => {
  setPushApiCors(res);
  try {
    const expectedToken = process.env.RESET_TOKEN;
    if (!expectedToken) {
      return res.status(500).json({
        success: false,
        error: 'RESET_TOKEN is not configured on server'
      });
    }

    const providedToken = req.header('x-reset-token');
    if (!providedToken || providedToken !== expectedToken) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const bodyDate =
      req.body && typeof req.body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date.trim())
        ? req.body.date.trim()
        : null;
    const force = req.body?.force === true;
    const result = await sendDailyQuotePushNotifications(bodyDate || getAppDateKey(), { force });
    return res.json(result);
  } catch (error) {
    console.error('❌ Daily quote push failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Daily quote push failed',
      timestamp: getUtcIsoNow()
    });
  }
});

app.options('/api/quote-submission', (req, res) => {
  setQuoteSubmissionCors(res);
  return res.status(204).end();
});

app.post('/api/quote-submission', async (req, res) => {
  setQuoteSubmissionCors(res);
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const text = normalizeSubmittedQuoteText(body.text || body.quote).slice(0, 900);
    const author = normalizeSubmittedAuthorName(body.author).slice(0, 160);
    const submitterName = String(body.submitterName || body.submittedBy || '').trim().slice(0, 80);
    const userId = String(body.userId || '').trim().slice(0, 120);
    const appDateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(body.appDateKey || '').trim())
      ? String(body.appDateKey).trim()
      : getAppDateKey();
    const currentQuoteText = String(body.currentQuoteText || '').trim().slice(0, 220);
    const currentQuoteAuthor = String(body.currentQuoteAuthor || '').trim().slice(0, 160);

    if (!text || !author) {
      return res.status(400).json({ success: false, error: 'Quote text and author are required' });
    }

    const result = await createPendingSubmittedQuote({
      text,
      author,
      submitterName,
      userId,
      appDateKey,
      currentQuoteText,
      currentQuoteAuthor
    });

    return res.json({ success: true, ...result, status: 'pending' });
  } catch (error) {
    console.error('❌ Quote submission failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Quote submission failed',
      timestamp: getUtcIsoNow()
    });
  }
});

app.options('/api/reflection-response', (req, res) => {
  setReflectionApiCors(res);
  return res.status(204).end();
});

app.post('/api/reflection-response', async (req, res) => {
  setReflectionApiCors(res);
  try {
    if (!db) throw new Error('Firestore not initialized');
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const responseText = normalizeReflectionResponseText(body.responseText || body.text);
    const appDateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(body.appDateKey || '').trim())
      ? String(body.appDateKey).trim()
      : getAppDateKey();
    const clientId = String(body.clientId || body.deviceId || body.userId || '').trim().slice(0, 160);
    const quoteId = String(body.quoteId || '').trim().slice(0, 180);
    const reflectionPromptSnapshot = String(body.reflectionPromptSnapshot || '').trim().slice(0, 500);

    if (!responseText) {
      return res.status(400).json({ success: false, error: 'Reflection response is required' });
    }
    if (responseText.length > 240) {
      return res.status(400).json({ success: false, error: 'Reflection response must be 240 characters or fewer' });
    }

    const deviceKey = safeReflectionDeviceKey(clientId || `${req.ip || ''}|${req.get('user-agent') || ''}`);
    const responseRef = db.collection('reflectionResponses').doc();
    const responseId = responseRef.id;
    const responsePayload = {
      appDateKey,
      responseText,
      clientId: clientId || null,
      deviceKey,
      quoteId: quoteId || null,
      reflectionPromptSnapshot,
      source: 'app',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await responseRef.set(responsePayload);

    return res.json({ success: true, responseId, appDateKey, status: 'stored' });
  } catch (error) {
    console.error('❌ Reflection response failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Reflection response failed',
      timestamp: getUtcIsoNow()
    });
  }
});

app.options('/api/reflection-themes/generate', (req, res) => {
  setReflectionApiCors(res);
  return res.status(204).end();
});

app.options('/api/reflection-themes/:dateKey', (req, res) => {
  setReflectionApiCors(res);
  return res.status(204).end();
});

app.get('/api/reflection-themes/:dateKey', async (req, res) => {
  setReflectionApiCors(res);
  try {
    if (!db) throw new Error('Firestore not initialized');
    const appDateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(req.params.dateKey || '').trim())
      ? String(req.params.dateKey).trim()
      : '';
    if (!appDateKey) {
      return res.status(400).json({ success: false, error: 'Valid dateKey is required' });
    }
    const themeDoc = await db.collection('reflectionThemes').doc(appDateKey).get();
    if (!themeDoc.exists) {
      return res.json({ success: true, found: false, appDateKey, themes: [] });
    }
    const data = themeDoc.data() || {};
    const themes = Array.isArray(data.themes)
      ? data.themes.map((theme) => String(theme || '').trim()).filter(Boolean)
      : [];
    if (!themes.length) {
      return res.json({ success: true, found: false, appDateKey, themes: [] });
    }
    return res.json({
      success: true,
      found: true,
      appDateKey,
      themes,
      reflectionPrompt: String(data.reflectionPrompt || data.communityPrompt || '').trim(),
      responseCount: Number(data.responseCount) || 0,
      provider: data.provider || null,
      model: data.model || null,
      generatedAtIso: data.generatedAtIso || null
    });
  } catch (error) {
    console.error('❌ Reflection theme read failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Reflection theme read failed',
      timestamp: getUtcIsoNow()
    });
  }
});

function reflectionThemeGenerationTimeMillis(themeData, themeDocSnap = null) {
  if (themeData && typeof themeData === 'object') {
    const ts = themeData.generatedAt;
    if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
    const iso = String(themeData.generatedAtIso || '').trim();
    if (iso) {
      const ms = Date.parse(iso);
      if (Number.isFinite(ms)) return ms;
    }
  }
  if (themeDocSnap && themeDocSnap.exists && typeof themeDocSnap.updateTime?.toMillis === 'function') {
    return themeDocSnap.updateTime.toMillis();
  }
  return null;
}

async function countReflectionResponsesForDate(db, appDateKey) {
  try {
    const agg = await db.collection('reflectionResponses')
      .where('appDateKey', '==', appDateKey)
      .count()
      .get();
    return agg.data().count;
  } catch (err) {
    console.warn('reflectionResponses count() failed:', String(err?.message || err || '').slice(0, 240));
    return null;
  }
}

/** Newest-first query when index exists; else unordered sample (same as legacy). */
async function loadReflectionResponseTextsForGeneration(db, appDateKey, responseLimit) {
  try {
    const snap = await db.collection('reflectionResponses')
      .where('appDateKey', '==', appDateKey)
      .orderBy('createdAt', 'desc')
      .limit(responseLimit)
      .get();
    return snap.docs
      .map((doc) => String(doc.data()?.responseText || '').trim())
      .filter(Boolean)
      .reverse();
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (/index|FAILED_PRECONDITION|requires an index/i.test(msg)) {
      console.warn('reflectionResponses orderBy(createdAt desc) failed; using unordered sample:', msg.slice(0, 240));
      const snap = await db.collection('reflectionResponses')
        .where('appDateKey', '==', appDateKey)
        .limit(responseLimit)
        .get();
      return snap.docs
        .map((doc) => String(doc.data()?.responseText || '').trim())
        .filter(Boolean);
    }
    throw err;
  }
}

async function getLatestReflectionResponseCreatedMillis(db, appDateKey) {
  try {
    const snap = await db.collection('reflectionResponses')
      .where('appDateKey', '==', appDateKey)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    const createdAt = snap.docs[0].get('createdAt');
    if (createdAt && typeof createdAt.toMillis === 'function') return createdAt.toMillis();
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (/index|FAILED_PRECONDITION|requires an index/i.test(msg)) {
      console.warn('reflectionResponses latest-by-createdAt query failed; continuing without skip:', msg.slice(0, 240));
      return null;
    }
    throw err;
  }
  return null;
}

app.post('/api/reflection-themes/generate', async (req, res) => {
  setReflectionApiCors(res);
  try {
    if (!db) throw new Error('Firestore not initialized');
    const expectedToken = process.env.REFLECTION_THEME_TOKEN || process.env.RESET_TOKEN || '';
    if (!expectedToken) {
      return res.status(500).json({
        success: false,
        error: 'REFLECTION_THEME_TOKEN or RESET_TOKEN must be set on the server'
      });
    }
    const providedToken = req.header('x-reflection-theme-token') || req.header('x-reset-token');
    if (!providedToken || providedToken !== expectedToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const appDateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(body.appDateKey || body.date || '').trim())
      ? String(body.appDateKey || body.date).trim()
      : getAppDateKey();
    const force = body.force === true || String(body.force || '').toLowerCase() === 'true';

    const themeDocSnap = await db.collection('reflectionThemes').doc(appDateKey).get();
    const priorThemeData = themeDocSnap.exists ? themeDocSnap.data() || {} : null;
    const priorThemes = Array.isArray(priorThemeData?.themes)
      ? priorThemeData.themes.map((t) => String(t || '').trim()).filter(Boolean)
      : [];

    const totalReflectionResponses = await countReflectionResponsesForDate(db, appDateKey);
    if (totalReflectionResponses === 0) {
      return res.status(400).json({
        success: false,
        error: 'No reflection responses found for date',
        appDateKey
      });
    }

    const responseLimit = Math.max(1, Math.min(120, Number(body.limit) || 80));

    if (!force && themeDocSnap.exists && priorThemeData) {
      const genMs = reflectionThemeGenerationTimeMillis(priorThemeData, themeDocSnap);
      const priorTotal = Number(priorThemeData.responseCount) || 0;
      const latestMs = await getLatestReflectionResponseCreatedMillis(db, appDateKey);
      const countOkForTimeSkip = totalReflectionResponses == null
        || totalReflectionResponses === priorTotal
        || priorTotal < totalReflectionResponses;
      const noNewByTime = latestMs != null && latestMs <= genMs && countOkForTimeSkip;
      const noNewByCountFallback = latestMs == null
        && totalReflectionResponses != null
        && totalReflectionResponses === priorTotal;
      if (genMs != null && (noNewByTime || noNewByCountFallback)) {
        const reason = noNewByTime ? 'no_new_responses_since_last_generation' : 'no_response_count_change_since_last_generation';
        console.log(`Reflection themes unchanged for ${appDateKey}: ${reason} (credits skip).`);
        return res.json({
          success: true,
          skipped: true,
          skipReason: reason,
          appDateKey,
          themes: priorThemes,
          reflectionPrompt: String(priorThemeData.reflectionPrompt || priorThemeData.communityPrompt || '').trim(),
          responseCount: totalReflectionResponses != null ? totalReflectionResponses : priorTotal,
          model: priorThemeData.model || null,
          provider: priorThemeData.provider || null,
          generatedAtIso: priorThemeData.generatedAtIso || null
        });
      }
    }

    const responses = await loadReflectionResponseTextsForGeneration(db, appDateKey, responseLimit);
    if (!responses.length) {
      return res.status(400).json({
        success: false,
        error: 'No reflection responses found for date',
        appDateKey
      });
    }

    const getReflectionPromptFromQuoteData = (data) => String(
      data?.communityPrompt ||
      data?.community_prompt ||
      data?.reflectionPrompt ||
      data?.reflection_prompt ||
      ''
    ).trim().slice(0, 500);
    const getReflectionQuoteSnapshotFromData = (data) => {
      if (!data || typeof data !== 'object') return null;
      const text = String(data.text || data.quoteText || data.textSnapshot || data.quoteTextSnapshot || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      const author = String(data.author || data.quoteAuthor || data.authorSnapshot || data.quoteAuthorSnapshot || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      return text ? { text, author } : null;
    };

    let reflectionPrompt = '';
    let quoteSnapshot = null;
    try {
      const quoteDoc = await db.collection(process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes').doc(appDateKey).get();
      const quoteData = quoteDoc.exists ? quoteDoc.data() : null;
      reflectionPrompt = getReflectionPromptFromQuoteData(quoteData);
      quoteSnapshot = getReflectionQuoteSnapshotFromData(quoteData);
      if (!reflectionPrompt || !quoteSnapshot) {
        const assignmentDoc = await db.collection(process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments').doc(appDateKey).get();
        const assignmentData = assignmentDoc.exists ? assignmentDoc.data() : null;
        if (!reflectionPrompt) reflectionPrompt = getReflectionPromptFromQuoteData(assignmentData);
        if (!quoteSnapshot) quoteSnapshot = getReflectionQuoteSnapshotFromData(assignmentData);
        const sourceId = assignmentDoc.exists ? String(assignmentData?.sourceId || assignmentData?.quoteId || '').trim() : '';
        if (sourceId) {
          const sourceQuoteDoc = await db.collection(process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes').doc(sourceId).get();
          const sourceQuoteData = sourceQuoteDoc.exists ? sourceQuoteDoc.data() : null;
          if (!reflectionPrompt) reflectionPrompt = getReflectionPromptFromQuoteData(sourceQuoteData);
          if (!quoteSnapshot) quoteSnapshot = getReflectionQuoteSnapshotFromData(sourceQuoteData);
        }
      }
    } catch (error) {
      console.warn('Reflection theme quote prompt lookup failed:', error.message);
    }

    const { themes, model, provider } = await generateReflectionThemesWithAi({
      dateKey: appDateKey,
      reflectionPrompt,
      responses
    });
    const responseCountTotal = totalReflectionResponses != null ? totalReflectionResponses : responses.length;
    const themePayload = {
      appDateKey,
      themes,
      reflectionPrompt,
      responseCount: responseCountTotal,
      responseSampleSize: responses.length,
      model,
      provider,
      status: 'generated',
      textSnapshot: quoteSnapshot?.text || '',
      authorSnapshot: quoteSnapshot?.author || '',
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedAtIso: getUtcIsoNow()
    };
    await db.collection('reflectionThemes').doc(appDateKey).set(themePayload);

    return res.json({
      success: true,
      appDateKey,
      themes,
      reflectionPrompt,
      responseCount: responseCountTotal,
      responseSampleSize: responses.length,
      model,
      provider
    });
  } catch (error) {
    console.error('❌ Reflection theme generation failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Reflection theme generation failed',
      timestamp: getUtcIsoNow()
    });
  }
});

app.get('/api/simple-test', (req, res) => {
  res.json({
    success: true,
    message: 'Simple test endpoint working',
    timestamp: new Date().toISOString(),
    server: 'Instagram Quilt Generator (Firestore)',
    ready: true
  });
});

app.options('/api/daily-reset', (req, res) => {
  setResetApiCors(res);
  return res.status(204).send('');
});

app.post('/api/daily-reset', async (req, res) => {
  setResetApiCors(res);
  try {
    const expectedToken = process.env.RESET_TOKEN;
    if (!expectedToken) {
      return res.status(500).json({
        success: false,
        error: 'RESET_TOKEN is not configured on server'
      });
    }

    const providedToken = req.header('x-reset-token');
    if (!providedToken || providedToken !== expectedToken) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const bodyDate =
      req.body && typeof req.body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date.trim())
        ? req.body.date.trim()
        : null;
    const dateKey = bodyDate || getAppDateKey();
    const source = req.body?.source || 'api';
    const force = req.body?.force === true;

    const result = force
      ? await runManualAdminQuiltResetForDate(dateKey, source)
      : await runDailyResetForDate(dateKey, source);
    return res.json(result);
  } catch (error) {
    console.error('❌ Daily reset endpoint failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Daily reset failed',
      timestamp: getUtcIsoNow()
    });
  }
});

/**
 * GitHub Actions (cron 6:30 UTC): snapshot quilt → classic PNG + 8s static MP4 for Zapier, before daily reset at 7:00 UTC.
 * Auth: same x-reset-token as /api/daily-reset.
 */
app.post('/api/nightly-instagram-snapshot', async (req, res) => {
  try {
    const expectedToken = process.env.RESET_TOKEN;
    if (!expectedToken) {
      return res.status(500).json({
        success: false,
        error: 'RESET_TOKEN is not configured on server'
      });
    }

    const providedToken = req.header('x-reset-token');
    if (!providedToken || providedToken !== expectedToken) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const bodyDate =
      req.body && typeof req.body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date.trim())
        ? req.body.date.trim()
        : null;

    const result = await runNightlyInstagramSnapshot(bodyDate ? { date: bodyDate } : {});
    const ok = result && result.success;
    if (!ok) {
      return res.status(200).json({
        ...result,
        success: false,
        timestamp: getUtcIsoNow()
      });
    }
    return res.json({
      ...result,
      success: true,
      timestamp: getUtcIsoNow()
    });
  } catch (error) {
    console.error('❌ Nightly Instagram snapshot failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Snapshot failed',
      timestamp: getUtcIsoNow()
    });
  }
});

app.options('/api/sync-notion-firestore', (req, res) => {
  setNotionSyncCors(res);
  return res.status(204).end();
});

app.options('/api/quote-prefill-sweep', (req, res) => {
  setNotionSyncCors(res);
  return res.status(204).end();
});

app.options('/api/quote-wiki-refresh', (req, res) => {
  setNotionSyncCors(res);
  return res.status(204).end();
});

/**
 * Re-run Wikipedia lookup for a single Notion row and patch only the three
 * Wikipedia-derived columns (speaker_dates, speaker_image_url, image_attribution)
 * + their Firestore mirrors. Leaves Claude-generated fields alone so manual edits
 * are preserved.
 *
 * Auth: same as /api/sync-notion-firestore.
 * Body: { pageId: string, authorName?: string }
 */
app.post('/api/quote-wiki-refresh', async (req, res) => {
  setNotionSyncCors(res);
  const expectedToken = process.env.NOTION_SYNC_TOKEN || process.env.RESET_TOKEN || '';
  if (!expectedToken) {
    return res.status(500).json({ success: false, error: 'NOTION_SYNC_TOKEN or RESET_TOKEN must be set on the server' });
  }
  const providedToken = req.header('x-notion-sync-token');
  if (!providedToken || providedToken !== expectedToken) {
    return res.status(401).json({ success: false, error: 'Invalid sync token' });
  }
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const pageId = String(body.pageId || '').trim();
    if (!pageId) return res.status(400).json({ success: false, error: 'pageId is required' });
    const databaseId = String(process.env.NOTION_DATABASE_ID || '').trim();
    if (!databaseId) return res.status(500).json({ success: false, error: 'NOTION_DATABASE_ID is not configured' });

    const page = await notionGetPage(pageId);
    if (!page) return res.status(404).json({ success: false, error: `Notion page ${pageId} not found` });
    const authorName = String(body.authorName || '').trim() || extractAuthorFromNotionPage(page);
    if (!authorName) {
      return res.status(400).json({ success: false, error: 'No author name on the row and none provided in the request body' });
    }

    const wiki = await fetchWikipediaSpeakerInfo(authorName);
    if (!wiki) {
      return res.json({
        success: true,
        pageId,
        author: authorName,
        wiki: null,
        note: 'Wikipedia returned no usable info (404 / disambiguation / network). Nothing patched.'
      });
    }

    const schema = await notionGetDatabaseProperties(databaseId);
    // Build a properties payload with ONLY the Wikipedia-derived fields.
    const properties = buildPrefillNotionProperties(schema, null, wiki, null);
    if (Object.keys(properties).length) {
      await notionFetchJson(`/pages/${pageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties })
      });
    }
    if (db) {
      const collection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
      const payload = buildPrefillFirestorePayload(null, wiki, null);
      if (Object.keys(payload).length) {
        await db.collection(collection).doc(pageId).set(payload, { merge: true });
      }
    }

    return res.json({
      success: true,
      pageId,
      author: authorName,
      wiki,
      notionPropertiesPatched: Object.keys(properties)
    });
  } catch (error) {
    console.error('❌ Wiki refresh failed:', error);
    return res.status(500).json({ success: false, error: error.message || 'Wiki refresh failed' });
  }
});

/**
 * Manually run a Notion quote prefill sweep right now. Same auth pattern as /api/sync-notion-firestore.
 * Optional body: { limit: number } to override the per-tick cap for this run.
 */
app.post('/api/quote-prefill-sweep', async (req, res) => {
  setNotionSyncCors(res);
  const expectedToken = process.env.NOTION_SYNC_TOKEN || process.env.RESET_TOKEN || '';
  if (!expectedToken) {
    return res.status(500).json({ success: false, error: 'NOTION_SYNC_TOKEN or RESET_TOKEN must be set on the server' });
  }
  const providedToken = req.header('x-notion-sync-token');
  if (!providedToken || providedToken !== expectedToken) {
    return res.status(401).json({ success: false, error: 'Invalid sync token' });
  }
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const limit = Math.max(1, Math.min(50, parseInt(body.limit, 10) || PREFILL_SWEEP_BATCH_LIMIT));
    const result = await runQuotePrefillSweep({ limit, trigger: 'manual' });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Manual quote prefill sweep failed:', error);
    return res.status(500).json({ success: false, error: error.message || 'Sweep failed', timestamp: getUtcIsoNow() });
  }
});

/**
 * Manual Notion ↔ Firestore sync (same steps as GitHub Actions notion-firestore-sync workflow).
 * Auth: header x-notion-sync-token must match NOTION_SYNC_TOKEN, or RESET_TOKEN if NOTION_SYNC_TOKEN is unset.
 * Requires NOTION_TOKEN, NOTION_DATABASE_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON on the host.
 */
app.post('/api/sync-notion-firestore', async (req, res) => {
  setNotionSyncCors(res);

  const expectedToken =
    process.env.NOTION_SYNC_TOKEN || process.env.RESET_TOKEN || '';
  if (!expectedToken) {
    return res.status(500).json({
      success: false,
      error: 'NOTION_SYNC_TOKEN or RESET_TOKEN must be set on the server'
    });
  }

  const providedToken = req.header('x-notion-sync-token');
  if (!providedToken || providedToken !== expectedToken) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }

  const notionEnvMissing = [];
  if (!process.env.NOTION_TOKEN || String(process.env.NOTION_TOKEN).trim() === '') {
    notionEnvMissing.push('NOTION_TOKEN');
  }
  if (!process.env.NOTION_DATABASE_ID || String(process.env.NOTION_DATABASE_ID).trim() === '') {
    notionEnvMissing.push('NOTION_DATABASE_ID');
  }
  if (notionEnvMissing.length) {
    console.error(
      '[sync] Missing Railway env (same service as server.js):',
      notionEnvMissing.join(', ')
    );
    return res.status(500).json({
      success: false,
      error: `Add on Railway and redeploy: ${notionEnvMissing.join(', ')}`,
      missing: notionEnvMissing
    });
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    return res.status(500).json({
      success: false,
      error: 'Server is missing GOOGLE_APPLICATION_CREDENTIALS_JSON'
    });
  }

  if (notionSyncInProgress) {
    return res.status(409).json({
      success: false,
      error: 'A sync is already running'
    });
  }

  notionSyncInProgress = true;
  const startedAt = getUtcIsoNow();
  console.log('🔄 Manual Notion–Firestore sync started');

  try {
    const quotesResult = await runNodeScript('scripts/sync-notion-to-firestore.cjs');
    if (quotesResult.code !== 0) {
      return res.status(500).json({
        success: false,
        step: 'sync:quotes',
        exitCode: quotesResult.code,
        stdout: tailOutput(quotesResult.stdout, 12000),
        stderr: tailOutput(quotesResult.stderr, 12000),
        startedAt,
        finishedAt: getUtcIsoNow()
      });
    }

    const scheduleStartDate = getAppDateKey();
    const appSubmissionsResult = await runNodeScript('scripts/schedule-approved-app-submissions.cjs', [
      `--start=${scheduleStartDate}`,
      '--cadence=1',
      '--window=8'
    ]);
    if (appSubmissionsResult.code !== 0) {
      return res.status(500).json({
        success: false,
        step: 'schedule:app-submissions',
        exitCode: appSubmissionsResult.code,
        stdout: tailOutput(appSubmissionsResult.stdout, 12000),
        stderr: tailOutput(appSubmissionsResult.stderr, 12000),
        note: 'Notion → Firestore (quotes) completed; approved app-submission scheduling failed before rolling append.',
        startedAt,
        finishedAt: getUtcIsoNow()
      });
    }

    const scheduleResult = await runNodeScript('scripts/backfill-daily-assignments.cjs', [
      `--start=${scheduleStartDate}`,
      '--cadence=1',
      '--window=8'
    ]);
    if (scheduleResult.code !== 0) {
      return res.status(500).json({
        success: false,
        step: 'schedule:rolling-append',
        exitCode: scheduleResult.code,
        stdout: tailOutput(scheduleResult.stdout, 12000),
        stderr: tailOutput(scheduleResult.stderr, 12000),
        note: 'Notion → Firestore (quotes) and app-submission scheduling completed; rolling append failed before date_scheduled sync.',
        startedAt,
        finishedAt: getUtcIsoNow()
      });
    }

    const usageResult = await runNodeScript('scripts/sync-usage-firestore-to-notion.cjs');
    if (usageResult.code !== 0) {
      return res.status(500).json({
        success: false,
        step: 'sync:usage',
        exitCode: usageResult.code,
        stdout: tailOutput(usageResult.stdout, 12000),
        stderr: tailOutput(usageResult.stderr, 12000),
        note: 'Notion → Firestore (quotes), app-submission scheduling, and rolling append completed; Firestore → Notion (usage/date_scheduled) failed.',
        startedAt,
        finishedAt: getUtcIsoNow()
      });
    }

    return res.json({
      success: true,
      steps: ['sync:quotes', 'schedule:app-submissions', 'schedule:rolling-append', 'sync:usage'],
      scheduleStartDate,
      stdout: tailOutput(
        `${quotesResult.stdout}\n---\n${appSubmissionsResult.stdout}\n---\n${scheduleResult.stdout}\n---\n${usageResult.stdout}`,
        16000
      ),
      stderr: tailOutput(
        `${quotesResult.stderr}\n---\n${appSubmissionsResult.stderr}\n---\n${scheduleResult.stderr}\n---\n${usageResult.stderr}`,
        8000
      ),
      startedAt,
      finishedAt: getUtcIsoNow()
    });
  } catch (error) {
    console.error('❌ Manual Notion–Firestore sync failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Sync failed',
      startedAt,
      finishedAt: getUtcIsoNow()
    });
  } finally {
    notionSyncInProgress = false;
    console.log('🔄 Manual Notion–Firestore sync finished');
  }
});

app.options('/api/transcode-instagram-reel', (req, res) => {
  setInstagramApiCors(res);
  return res.status(204).end();
});

/**
 * WebM → H.264 MP4 for Instagram Reels. Call after the client uploads reel.webm (e.g. right after Push IG assets).
 * Body: { "date": "YYYY-MM-DD", "force": true } optional — defaults to app-day key used by generate-instagram.
 */
app.post('/api/transcode-instagram-reel', async (req, res) => {
  setInstagramApiCors(res);
  try {
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Firestore not initialized'
      });
    }
    const bodyDate =
      req.body && typeof req.body.date === 'string' ? req.body.date.trim() : '';
    const force =
      !!(
        req.body &&
        (req.body.force === true ||
          req.body.force === 1 ||
          req.body.force === '1' ||
          req.body.force === 'true')
      );
    const dateKey =
      bodyDate && /^\d{4}-\d{2}-\d{2}$/.test(bodyDate) ? bodyDate : getAppDateKey();

    const out = await transcodeInstagramReelWebmToMp4(dateKey, { force });
    if (out.skipped && out.reason === 'no_reel_webm') {
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: out.reason,
        date: dateKey,
        message: 'No reelWebmStorageUrl on doc — push IG assets with reel from the app first.'
      });
    }
    return res.json({
      success: true,
      date: out.date,
      cached: !!out.cached,
      forced: force,
      reelMp4Url: out.reelMp4Url || ''
    });
  } catch (error) {
    console.error('❌ transcode-instagram-reel:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Transcode failed',
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚂 Instagram Quilt Generator (Firestore) running on port ${PORT}`);
  console.log(`📸 Instagram endpoint: http://localhost:${PORT}/api/generate-instagram`);
  console.log(`🎬 Reel transcode: http://localhost:${PORT}/api/transcode-instagram-reel`);
  console.log(`🌙 Nightly Zapier snapshot: http://localhost:${PORT}/api/nightly-instagram-snapshot`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test-instagram`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Simple test: http://localhost:${PORT}/api/simple-test`);
  startQuotePrefillSweepScheduler();
});
