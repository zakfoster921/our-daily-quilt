const express = require('express');
const admin = require('firebase-admin');
const { createCanvas } = require('canvas');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// In-memory storage for generated images
const imageStore = new Map();

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

// Generate Instagram image from quilt data
async function generateInstagramImageFromQuilt(blocks, quote) {
  const canvas = createCanvas(1080, 1350); // 4:5 ratio
  const ctx = canvas.getContext('2d');
  
  // Fill background
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, 1080, 1350);
  
  // Calculate quilt layout
  const blockSize = 40;
  const padding = 60;
  const availableWidth = 1080 - (padding * 2);
  const availableHeight = 1080 - (padding * 2); // Leave bottom 270px for quote
  
  // Center the quilt
  const quiltWidth = Math.min(blocks.length * blockSize, availableWidth);
  const quiltHeight = Math.ceil(quiltWidth / availableWidth) * blockSize;
  const startX = padding + (availableWidth - quiltWidth) / 2;
  const startY = padding + (availableHeight - quiltHeight) / 2;
  
  // Draw quilt blocks
  blocks.forEach((block, index) => {
    const row = Math.floor(index / Math.floor(availableWidth / blockSize));
    const col = index % Math.floor(availableWidth / blockSize);
    const x = startX + (col * blockSize);
    const y = startY + (row * blockSize);
    
    // Draw block
    ctx.fillStyle = block.color || '#6c757d';
    ctx.fillRect(x, y, blockSize - 2, blockSize - 2);
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

// Get today's quilt data from Firestore
async function getTodayQuiltData() {
  if (!db) { throw new Error('Firestore not initialized'); }
  
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const todayString = today.toISOString().split('T')[0];
  const yesterdayString = yesterday.toISOString().split('T')[0];
  
  try {
    // Try today first
    console.log(`🔍 Looking for quilt data for ${todayString}...`);
    let quiltDoc = await db.collection('quilts').doc(todayString).get();
    let dateUsed = todayString;
    
    if (!quiltDoc.exists) {
      // Try yesterday if today doesn't exist
      console.log(`📅 No data for ${todayString}, trying ${yesterdayString}...`);
      quiltDoc = await db.collection('quilts').doc(yesterdayString).get();
      dateUsed = yesterdayString;
      
      if (!quiltDoc.exists) {
        throw new Error(`No quilt data found for ${todayString} or ${yesterdayString}`);
      }
    }
    
    const quiltData = quiltDoc.data();
    console.log(`✅ Found quilt data for ${dateUsed} with ${quiltData.blocks?.length || 0} blocks`);
    
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
      blocks: quiltData.blocks || [], 
      quote: quote, 
      date: dateUsed 
    };
  } catch (error) { 
    console.error('Error fetching quilt data:', error); 
    throw error; 
  }
}

app.post('/api/generate-instagram', async (req, res) => {
  try {
    console.log('🚀 Starting Instagram image generation from Firestore...');
    
    // Get today's quilt data
    const quiltData = await getTodayQuiltData();
    
    // Generate Instagram image
    const imageData = await generateInstagramImageFromQuilt(quiltData.blocks, quiltData.quote);
    
    // Save image to memory and create URL
    const timestamp = Date.now();
    const filename = `instagram-${timestamp}.png`;
    imageStore.set(filename, imageData);
    
    // Create public URL
    const baseUrl = process.env.RAILWAY_STATIC_URL || `https://our-daily-quilt-production.up.railway.app`;
    const imageUrl = `${baseUrl}/api/image/${filename}`;
    
    const result = {
      success: true,
      imageUrl: imageUrl,
      caption: quiltData.quote,
      date: quiltData.date,
      blockCount: quiltData.blocks.length,
      captionLength: quiltData.quote.length,
      note: 'Test this URL in your browser to verify the image loads'
    };
    
    console.log('✅ Instagram image generated successfully from Firestore');
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
  
  // Convert base64 to buffer
  const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  
  res.setHeader('Content-Type', 'image/png');
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

app.listen(PORT, () => {
  console.log(`🚂 Instagram Quilt Generator (Firestore) running on port ${PORT}`);
  console.log(`📸 Instagram endpoint: http://localhost:${PORT}/api/generate-instagram`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test-instagram`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Simple test: http://localhost:${PORT}/api/simple-test`);
});
