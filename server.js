const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

app.post('/api/generate-instagram', async (req, res) => {
  let browser = null;
  try {
    console.log('🚀 Starting Instagram image generation...');
    
    // Launch browser with optimized settings for speed
    browser = await chromium.launch({
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
    
    const page = await browser.newPage();
    
    // Set a shorter timeout and optimize page loading
    page.setDefaultTimeout(15000); // 15 seconds instead of 30
    
    // Navigate to the live quilt page with faster settings
    console.log('📱 Loading quilt page...');
    await page.goto('https://www.zakfoster.com/odq2.html', {
      waitUntil: 'domcontentloaded', // Faster than 'networkidle'
      timeout: 15000
    });
    
    // Wait for the app to load with a shorter timeout
    await page.waitForFunction(() => window.app && window.app.archiveService, { timeout: 10000 });
    
    // Generate the Instagram image
    console.log('🎨 Generating Instagram image...');
    const result = await page.evaluate(async () => {
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
      timestamp: new Date().toISOString()
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Instagram Quilt Generator',
    version: '1.0.0'
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
  let browser = null;
  try {
    browser = await chromium.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    
    await page.goto('https://www.zakfoster.com/odq2.html', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    
    const title = await page.title();
    
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
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚂 Instagram Quilt Generator server running on port ${PORT}`);
  console.log(`📸 Instagram endpoint: http://localhost:${PORT}/api/generate-instagram`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Simple test: http://localhost:${PORT}/api/simple-test`);
});
