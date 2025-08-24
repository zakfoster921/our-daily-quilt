const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// Global variables for pre-loaded browser
let globalBrowser = null;
let globalPage = null;
let isPageReady = false;
let initializationAttempts = 0;

// Initialize browser and pre-load page
async function initializeBrowser() {
  try {
    console.log('🚀 Initializing browser...');
    initializationAttempts++;
    
    // Close existing browser if any
    if (globalBrowser) {
      await globalBrowser.close();
    }
    
    globalBrowser = await chromium.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection'
      ]
    });
    
    globalPage = await globalBrowser.newPage();
    globalPage.setDefaultTimeout(15000);
    
    console.log('📱 Loading quilt page...');
    await globalPage.goto('https://www.zakfoster.com/odq2.html', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    
    console.log('⏳ Waiting for app to load...');
    await globalPage.waitForFunction(() => {
      return window.app && 
             window.app.archiveService && 
             window.app.quiltEngine && 
             window.app.quoteService;
    }, { timeout: 15000 });
    
    isPageReady = true;
    initializationAttempts = 0; // Reset counter on success
    console.log('✅ Browser initialized and ready!');
    
  } catch (error) {
    console.error('❌ Failed to initialize browser:', error);
    isPageReady = false;
    throw error;
  }
}

// Initialize browser on startup
initializeBrowser().catch(error => {
  console.error('❌ Initial browser initialization failed:', error);
});

// Re-initialize browser if needed
async function ensureBrowserReady() {
  if (!isPageReady || !globalPage) {
    console.log('🔄 Re-initializing browser...');
    try {
      await initializeBrowser();
    } catch (error) {
      console.error('❌ Re-initialization failed:', error);
      return false;
    }
  }
  return isPageReady;
}

app.post('/api/generate-instagram', async (req, res) => {
  try {
    console.log('🚀 Starting Instagram image generation...');
    
    // Try to ensure browser is ready
    const browserReady = await ensureBrowserReady();
    if (!browserReady) {
      // Return a helpful error instead of throwing
      return res.status(503).json({
        success: false,
        error: 'Browser initialization failed',
        timestamp: new Date().toISOString(),
        suggestion: 'Try again in 30 seconds',
        attempts: initializationAttempts
      });
    }
    
    // Generate the Instagram image using pre-loaded page
    console.log('🎨 Generating Instagram image...');
    const result = await globalPage.evaluate(async () => {
      try {
        const app = window.app;
        const blocks = app.quiltEngine.blocks;
        const quote = app.quoteService.getTodayQuote();
        
        // Generate the Instagram image
        const instagramImage = await app.archiveService.generateInstagramImage(blocks, quote);
        
        // Get today's date
        const today = new Date();
        const dateString = today.toISOString().split('T')[0];
        
        return {
          success: true,
          image: instagramImage,
          caption: quote,
          date: dateString,
          blockCount: blocks.length,
          captionLength: quote.length,
          imageSize: instagramImage.length
        };
      } catch (error) {
        console.error('Error generating Instagram image:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    console.log('✅ Instagram image generated successfully');
    res.json(result);
    
  } catch (error) {
    console.error('❌ Error generating Instagram image:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      suggestion: 'Try again in a few minutes'
    });
  }
});

// Fallback endpoint for testing (no browser automation)
app.post('/api/test-instagram', (req, res) => {
  const today = new Date();
  const dateString = today.toISOString().split('T')[0];
  
  res.json({
    success: true,
    message: 'Test Instagram endpoint working',
    date: dateString,
    timestamp: new Date().toISOString(),
    note: 'This is a test response without browser automation'
  });
});

// Manual browser reset endpoint
app.post('/api/reset-browser', async (req, res) => {
  try {
    console.log('🔄 Manual browser reset requested...');
    isPageReady = false;
    await initializeBrowser();
    res.json({
      success: true,
      message: 'Browser reset successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Instagram Quilt Generator',
    version: '1.0.0',
    browserReady: isPageReady,
    attempts: initializationAttempts
  });
});

app.get('/api/simple-test', (req, res) => {
  res.json({
    success: true,
    message: 'Simple test endpoint working',
    timestamp: new Date().toISOString(),
    server: 'Instagram Quilt Generator',
    ready: true
  });
});

app.get('/api/test', async (req, res) => {
  try {
    const browserReady = await ensureBrowserReady();
    if (!browserReady) {
      return res.status(503).json({
        success: false,
        error: 'Browser not ready',
        timestamp: new Date().toISOString(),
        attempts: initializationAttempts
      });
    }
    
    const title = await globalPage.title();
    
    res.json({
      success: true,
      title: title,
      message: 'Browser test successful',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  if (globalBrowser) {
    await globalBrowser.close();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚂 Instagram Quilt Generator server running on port ${PORT}`);
  console.log(`📸 Instagram endpoint: http://localhost:${PORT}/api/generate-instagram`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test-instagram`);
  console.log(`🔄 Reset browser: http://localhost:${PORT}/api/reset-browser`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Simple test: http://localhost:${PORT}/api/simple-test`);
});
