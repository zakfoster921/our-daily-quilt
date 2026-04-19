const express = require('express');
const admin = require('firebase-admin');
const { createCanvas } = require('canvas');
const { spawn } = require('child_process');
const path = require('path');
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

// Initialize Firebase Admin (you'll need to add your service account key)
let db;
try {
  // Use environment variable for service account
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    // Fallback to application default
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || 'your-project-id'
    });
  }
  db = admin.firestore();
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.log('⚠️ Firebase Admin not initialized - will use fallback mode');
  console.error('Firebase error:', error.message);
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

    // Try to get the quote for the same date
    let quote = "Every day is a new beginning.";
    try {
      const quoteDoc = await db.collection('quotes').doc(dateUsed).get();
      if (quoteDoc.exists) {
        const quoteData = quoteDoc.data();
        quote = `${quoteData.text} — ${quoteData.author}`;
        console.log(`✅ Found quote for ${dateUsed}: "${quote}"`);
      } else {
        console.log(`📝 No quote found for ${dateUsed}, using default`);
      }
    } catch (quoteError) {
      console.warn(`⚠️ Could not fetch quote for ${dateUsed}:`, quoteError.message);
    }
    
    return {
      imageData: imageDataField,
      postLayoutBImageData: postLayoutBField || null,
      storageClassicUrl,
      storageLayoutBUrl,
      quote: quote,
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
    // Bump when response shape changes — curl this endpoint to confirm Railway deployed the right file.
    const apiVersion = 'instagram-api-3-storage-passthrough';
    // Zapier: never send null for URL fields (use ""), or Zapier shows "null" forever.
    // Aliases + array help Zaps that only show the first URL or need explicit picks.
    const result = {
      apiVersion,
      success: true,
      imageUrl,
      postLayoutBImageUrl: postLayoutBImageUrl || '',
      classicImageUrl: imageUrl,
      layoutBImageUrl: postLayoutBImageUrl || '',
      imageUrls: hasLayoutB ? [imageUrl, postLayoutBImageUrl] : [imageUrl],
      caption: imageData.quote,
      date: imageData.date,
      captionLength: imageData.quote.length,
      hasPostLayoutB: hasLayoutB,
      note:
        'imageUrl/classicImageUrl = classic 4:5. postLayoutBImageUrl/layoutBImageUrl = layout B 4:5. If your Zap uses Firestore directly, map postLayoutBImageStorageUrl (not postLayoutBImageUrl).'
    };
    
    console.log('✅ Instagram assets from Firestore:', hasLayoutB ? 'classic + layout B URLs' : 'classic URL only');
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

  if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
    return res.status(500).json({
      success: false,
      error: 'Server is missing NOTION_TOKEN or NOTION_DATABASE_ID'
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

app.listen(PORT, () => {
  console.log(`🚂 Instagram Quilt Generator (Firestore) running on port ${PORT}`);
  console.log(`📸 Instagram endpoint: http://localhost:${PORT}/api/generate-instagram`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test-instagram`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Simple test: http://localhost:${PORT}/api/simple-test`);
});
