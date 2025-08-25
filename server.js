const express = require('express');
const admin = require('firebase-admin');
const { chromium } = require('playwright');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// In-memory storage for generated images
const imageStore = new Map();

// Global browser instance for performance
let globalBrowser = null;
let globalPage = null;

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

// Initialize browser
async function initializeBrowser() {
  if (globalBrowser) return globalBrowser;
  
  console.log('🚀 Initializing browser...');
  globalBrowser = await chromium.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  });
  
  globalPage = await globalBrowser.newPage();
  globalPage.setDefaultTimeout(15000);
  
  console.log('✅ Browser initialized');
  return globalBrowser;
}

// Wait for app to be ready
async function waitForApp(page) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}: Waiting for app to be ready...`);
      
      // Navigate to the app
      await page.goto('https://www.zakfoster.com/odq2.html', {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
      
      // Click onboarding buttons if they exist
      for (let i = 0; i < 3; i++) {
        try {
          await page.waitForSelector('button:has-text("Enter"), button:has-text("Start"), button:has-text("Begin"), button:has-text("Continue"), button:has-text("Next")', { timeout: 3000 });
          await page.click('button:has-text("Enter"), button:has-text("Start"), button:has-text("Begin"), button:has-text("Continue"), button:has-text("Next")');
          console.log(`✅ Clicked onboarding button ${i + 1}`);
          await page.waitForTimeout(1000);
        } catch (e) {
          console.log(`ℹ️ No more onboarding buttons to click`);
          break;
        }
      }
      
      // Wait for the app to be ready
      await page.waitForFunction(() => {
        return window.app && window.app.quiltEngine && window.app.quiltEngine.blocks && window.app.quiltEngine.blocks.length > 1;
      }, { timeout: 8000 });
      
      console.log('✅ App is ready!');
      return true;
    } catch (error) {
      console.log(`❌ Attempt ${attempt} failed:`, error.message);
      if (attempt === maxAttempts) {
        throw new Error(`Failed to load app after ${maxAttempts} attempts`);
      }
      await page.waitForTimeout(2000);
    }
  }
}

// Generate Instagram image using the actual app
async function generateInstagramImageFromApp() {
  const browser = await initializeBrowser();
  const page = globalPage;
  
  try {
    // Wait for app to be ready
    await waitForApp(page);
    
    // Call the generateInstagramImage function
    console.log('🎨 Generating Instagram image...');
    const imageData = await page.evaluate(async () => {
      if (!window.app || !window.app.archiveService) {
        throw new Error('App not ready');
      }
      
      // Get current quilt data
      const quiltData = window.app.quiltEngine.blocks;
      if (!quiltData || quiltData.length <= 1) {
        throw new Error('No quilt data available');
      }
      
      // Generate Instagram image using the actual app function
      const instagramImage = await window.app.archiveService.generateInstagramImage(quiltData);
      
      if (!instagramImage) {
        throw new Error('Failed to generate Instagram image');
      }
      
      return instagramImage;
    });
    
    console.log('✅ Instagram image generated successfully');
    return imageData;
  } catch (error) {
    console.error('❌ Error generating Instagram image:', error);
    throw error;
  }
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
    const imageData = await generateInstagramImageFromApp();
    
    // Save image to memory and create URL
    const timestamp = Date.now();
    const filename = `instagram-${timestamp}.png`;
    imageStore.set(filename, imageData);
    
    // Create public URL
    let baseUrl = process.env.RAILWAY_STATIC_URL || `https://our-daily-quilt-production.up.railway.app`;
    // Ensure baseUrl always starts with https://
    if (!baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }
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
