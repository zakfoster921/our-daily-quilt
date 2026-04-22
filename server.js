const express = require('express');
const admin = require('firebase-admin');
const { createCanvas } = require('canvas');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');

let ffmpegStaticPath = null;
try {
  ffmpegStaticPath = require('@ffmpeg-installer/ffmpeg').path;
} catch (e) {
  console.warn('⚠️ FFmpeg installer unavailable:', e.message);
}
const app = express();
const PORT = process.env.PORT || 3000;

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
 * @param {number} timeoutMs
 */
function runNodeScript(relativeScript, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, relativeScript);
    const child = spawn(process.execPath, [scriptPath], {
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
    return `${pid}.appspot.com`;
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

/**
 * Optional bed track for reel MP4s (bundled Freepik asset or REEL_BED_MUSIC_PATH).
 * @returns {string|null} absolute path, or null → FFmpeg uses silent AAC via anullsrc
 */
function resolveReelBedMusicPath() {
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

function runFfmpegPngLoopToMp4(ffmpegPath, pngPath, outPath, durationSec = 8) {
  return new Promise((resolve, reject) => {
    const musicPath = resolveReelBedMusicPath();
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
  const quoteLine = `${qd.text || 'Every day is a new beginning.'} — ${qd.author || ''}`.trim();

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
      await runFfmpegPngLoopToMp4(ffmpegPath, pngPath, mp4Path, 8);
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

function runFfmpegWebmToMp4(ffmpegPath, inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const musicPath = resolveReelBedMusicPath();
    const fps = REEL_SYNTHETIC_TARGET_FPS;
    /** Remap PTS from frame index so VP8/VP9 WebM from Chrome MediaRecorder keeps wall-clock 8s at 30fps */
    const vf = `setpts=N/(${fps}*TB)`;
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
 */
async function transcodeInstagramReelWebmToMp4(dateKey) {
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
  if (existingMp4) {
    return { success: true, cached: true, reelMp4Url: existingMp4, date: dateKey };
  }
  if (!webmUrl) {
    return { success: false, skipped: true, reason: 'no_reel_webm', date: dateKey };
  }

  const ffmpegPath = getFfmpegBinaryPath();

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

    await runFfmpegWebmToMp4(ffmpegPath, inPath, outPath);

    const mp4Buf = await fs.readFile(outPath);
    const dest = `instagram-zapier/${dateKey}/reel.mp4`;
    const { publicUrl: reelMp4Url } = await firebaseSaveDownloadableFile(dest, mp4Buf, 'video/mp4');
    await docRef.set(
      {
        reelMp4StorageUrl: reelMp4Url,
        reelMp4Url: reelMp4Url,
        reelSource: 'app_synthetic_mp4',
        lastReelTranscodeAt: new Date().toISOString()
      },
      { merge: true }
    );

    console.log(`✅ Transcoded reel to MP4 for ${dateKey}`);
    return { success: true, cached: false, reelMp4Url, date: dateKey };
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* */
    }
  }
}

// Generate Instagram image from quilt data (server-side)
async function generateInstagramImageFromQuilt(blocks, quote) {
  const canvas = createCanvas(1080, 1350); // 4:5 ratio for Instagram
  const ctx = canvas.getContext('2d');
  
  // Fill background with true white to match Instagram
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1080, 1350);
  
  // Calculate quilt bounds from actual block positions
  const minX = Math.min(...blocks.map(b => b.x));
  const minY = Math.min(...blocks.map(b => b.y));
  const maxX = Math.max(...blocks.map(b => b.x + b.width));
  const maxY = Math.max(...blocks.map(b => b.y + b.height));
  
  const quiltWidth = maxX - minX;
  const quiltHeight = maxY - minY;
  
  // Use fixed 4:5 dimensions (1070 x 1340) - same as client
  const targetWidth = 1070;  // 1080 - 10px padding
  const targetHeight = 1340; // 1350 - 10px padding
  
  // Center the quilt in the Instagram canvas (5px padding all around)
  const startX = 5;  // 5px from left
  const startY = 5;  // 5px from top
  
  // Draw quilt blocks using their actual positions (no scaling)
  blocks.forEach((block) => {
    const x = startX + block.x;
    const y = startY + block.y;
    const width = block.width;
    const height = block.height;
    
    // Draw block
    ctx.fillStyle = block.color || '#6c757d';
    ctx.fillRect(x, y, width, height);
  });
  
  // Add quote at bottom
  ctx.fillStyle = '#212529';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Wrap text if needed
  const maxWidth = 1000;
  const words = quote.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  if (currentLine) lines.push(currentLine);
  
  // Draw quote lines
  const lineHeight = 40;
  const quoteY = 1350 - 150 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, 540, quoteY + index * lineHeight);
  });
  
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

  const quiltRef = db.collection('quilts').doc(dateKey);
  const quoteRef = db.collection('quotes').doc(dateKey);
  const archiveRef = db.collection('archives').doc(dateKey);

  const [quiltSnap, quoteSnap, archiveSnap] = await Promise.all([
    quiltRef.get(),
    quoteRef.get(),
    archiveRef.get()
  ]);

  const quiltData = quiltSnap.exists ? quiltSnap.data() : null;
  const quoteData = quoteSnap.exists ? quoteSnap.data() : null;

  let archived = false;
  if (!archiveSnap.exists && quiltData && Array.isArray(quiltData.blocks) && quiltData.blocks.length > 1) {
    const archivePayload = {
      date: dateKey,
      quilt: {
        blocks: quiltData.blocks || [],
        contributorCount: quiltData.contributorCount || 1
      },
      quote: quoteData
        ? { text: quoteData.text || '', author: quoteData.author || '' }
        : null,
      userCount: quiltData.contributorCount || 1,
      isComplete: true,
      resetSource: source,
      archivedAt: getUtcIsoNow()
    };
    await archiveRef.set(archivePayload, { merge: true });
    archived = true;
  }

  await quiltRef.set(
    {
      blocks: [],
      contributorCount: 1,
      date: dateKey,
      lastUpdated: getUtcIsoNow(),
      resetBy: source,
      resetAt: getUtcIsoNow()
    },
    { merge: true }
  );

  await opRef.set(
    {
      status: 'success',
      date: dateKey,
      archived,
      source,
      completedAt: getUtcIsoNow()
    },
    { merge: true }
  );

  return {
    success: true,
    date: dateKey,
    alreadyReset: false,
    archived
  };
}

function hasLayoutBInRaw(raw) {
  if (!raw) return false;
  return !!(
    raw.postLayoutBImageStorageUrl ||
    raw.layoutBUrl ||
    raw.postLayoutBImageData
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
    const t = String(a.textSnapshot || '').trim();
    const au = String(a.authorSnapshot || '').trim();
    if (t && au) return `${t} — ${au}`;
    if (t) return t;
  } catch (e) {
    console.warn(`⚠️ dailyQuoteAssignments/${dateKey}:`, e.message);
  }
  return '';
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
        postLayoutBImageData: raw.postLayoutBImageData || fb.postLayoutBImageData
      };
      console.log(`📎 Merged layout B from ${fallbackKey} into ${primaryKey}`);
    }

    console.log(`✅ Instagram image for ${dateUsed} (layout B: ${hasLayoutBInRaw(raw)})`);

    // Passthrough URLs from client push (Firebase Storage) — prefer these for /api/generate-instagram
    // so Zapier gets both links even if byte fetch from Storage fails on Railway.
    const storageClassicUrl = raw.imageStorageUrl || raw.classicUrl || null;
    const storageLayoutBUrl =
      raw.postLayoutBImageStorageUrl || raw.layoutBUrl || null;
    const storageReelWebmUrl = raw.reelWebmStorageUrl || raw.reelUrl || null;
    const storageReelMp4Url = raw.reelMp4StorageUrl || raw.reelMp4Url || null;

    let imageDataField = raw.imageData || null;
    let postLayoutBField = raw.postLayoutBImageData || null;

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
    if (!imageDataField && !storageClassicUrl) {
      throw new Error(`Instagram doc for ${dateUsed} has no imageData or imageStorageUrl`);
    }

    // Caption order: (1) zapierCaption — written with the same upload as Storage pixels/reel (client may not be able
    // to read dailyQuoteAssignments; server admin can, which previously caused caption ≠ pixels). (2) dailyQuoteAssignments.
    // (3) quotes/{date}. See captionSource in JSON.
    let quote = "Every day is a new beginning.";
    let captionSource = 'default';
    try {
      const stamp =
        typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date.trim())
          ? raw.date.trim()
          : null;
      const captionKeys = [...new Set([dateUsed, stamp].filter(Boolean))];

      const inline =
        (typeof raw.zapierCaption === 'string' && raw.zapierCaption.trim()) ||
        (typeof raw.caption === 'string' && raw.caption.trim()) ||
        '';
      if (inline) {
        quote = inline;
        captionSource = 'zapierCaption';
        console.log(`✅ Caption from instagram-images zapierCaption (${dateUsed})`);
      } else {
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
          for (const dk of captionKeys) {
            const quoteDoc = await db.collection('quotes').doc(dk).get();
            if (!quoteDoc.exists) continue;
            const quoteData = quoteDoc.data() || {};
            const text = String(quoteData.text || '').trim();
            const author = String(quoteData.author || '').trim();
            if (text) {
              quote = author ? `${text} — ${author}` : text;
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
      storageClassicUrl,
      storageLayoutBUrl,
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

    const hasLayoutB = !!postLayoutBImageUrl;
    const reelWebmUrl = imageData.storageReelWebmUrl || '';
    const reelMp4Url = imageData.storageReelMp4Url || '';
    /** Instagram Reels accept MP4 (H.264); WebM is a fallback until /api/transcode-instagram-reel runs. */
    const reelVideoUrl = reelMp4Url || reelWebmUrl || '';
    const hasReelWebm = !!reelWebmUrl;
    const hasReelMp4 = !!reelMp4Url;
    // Bump when response shape changes — curl this endpoint to confirm Railway deployed the right file.
    const apiVersion = 'instagram-api-12-caption-zapier-first';
    // Zapier: never send null for URL fields (use ""), or Zapier shows "null" forever.
    // Aliases + array help Zaps that only show the first URL or need explicit picks.
    const imageUrls = hasLayoutB ? [imageUrl, postLayoutBImageUrl] : [imageUrl];
    const mediaUrls = [...imageUrls];
    if (reelVideoUrl) mediaUrls.push(reelVideoUrl);
    const result = {
      apiVersion,
      success: true,
      imageUrl,
      postLayoutBImageUrl: postLayoutBImageUrl || '',
      classicImageUrl: imageUrl,
      layoutBImageUrl: postLayoutBImageUrl || '',
      imageUrls,
      reelWebmUrl,
      reelMp4Url,
      reelVideoUrl,
      hasReelWebm,
      hasReelMp4,
      reelNeedsTranscode: hasReelWebm && !hasReelMp4,
      mediaUrls,
      caption: imageData.quote,
      captionSource: imageData.captionSource || 'default',
      date: imageData.date,
      captionLength: imageData.quote.length,
      hasPostLayoutB: hasLayoutB,
      note:
        'imageUrl/classicImageUrl = classic 4:5. postLayoutBImageUrl/layoutBImageUrl = layout B 4:5. reelVideoUrl = IG-ready MP4 when present, else WebM. After pushing assets, the app calls POST /api/transcode-instagram-reel to produce reelMp4Url.'
    };
    
    console.log(
      '✅ Instagram assets from Firestore:',
      hasLayoutB ? 'classic + layout B URLs' : 'classic URL only',
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
    firestoreReady: !!db
  });
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

app.post('/api/daily-reset', async (req, res) => {
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

    const result = await runDailyResetForDate(dateKey, source);
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

    const usageResult = await runNodeScript('scripts/sync-usage-firestore-to-notion.cjs');
    if (usageResult.code !== 0) {
      return res.status(500).json({
        success: false,
        step: 'sync:usage',
        exitCode: usageResult.code,
        stdout: tailOutput(usageResult.stdout, 12000),
        stderr: tailOutput(usageResult.stderr, 12000),
        note: 'Notion → Firestore (quotes) completed; Firestore → Notion (usage) failed.',
        startedAt,
        finishedAt: getUtcIsoNow()
      });
    }

    return res.json({
      success: true,
      steps: ['sync:quotes', 'sync:usage'],
      stdout: tailOutput(
        `${quotesResult.stdout}\n---\n${usageResult.stdout}`,
        16000
      ),
      stderr: tailOutput(
        `${quotesResult.stderr}\n---\n${usageResult.stderr}`,
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
 * Body: { "date": "YYYY-MM-DD" } optional — defaults to app-day key used by generate-instagram.
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
    const dateKey =
      bodyDate && /^\d{4}-\d{2}-\d{2}$/.test(bodyDate) ? bodyDate : getAppDateKey();

    const out = await transcodeInstagramReelWebmToMp4(dateKey);
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
});
