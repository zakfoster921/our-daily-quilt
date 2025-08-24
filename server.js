const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Instagram image generation endpoint for Zapier
app.post('/api/generate-instagram', async (req, res) => {
  try {
    console.log('📸 Zapier webhook called for Instagram image generation');
    
    const { date } = req.body; // Optional date parameter
    
    // Launch browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set viewport to match Instagram dimensions
    await page.setViewport({ width: 1080, height: 1350 });
    
    // Load your quilt app
    await page.goto('https://www.zakfoster.com/odq2.html', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Wait for the app to initialize
    await page.waitForFunction(() => window.app && window.app.archiveService, { timeout: 10000 });
    
    // Generate Instagram image
    const result = await page.evaluate(async (dateParam) => {
      try {
        // Wait for app to be fully ready
        let attempts = 0;
        while (!window.app && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!window.app) {
          throw new Error('App not initialized');
        }
        
        // Load quilt data for the specified date (or today)
        let quiltData;
        if (dateParam) {
          // Load specific date from archive
          const archiveEntry = window.app.archiveService.archives.get(dateParam);
          if (archiveEntry && archiveEntry.quilt) {
            quiltData = archiveEntry.quilt;
          } else {
            throw new Error(`No archive found for date: ${dateParam}`);
          }
        } else {
          // Use current quilt
          if (!window.app.quiltEngine.blocks || window.app.quiltEngine.blocks.length <= 1) {
            throw new Error('No quilt data available');
          }
          quiltData = window.app.quiltEngine.blocks;
        }
        
        // Generate Instagram image
        const instagramImage = await window.app.archiveService.generateInstagramImage(quiltData);
        
        if (!instagramImage) {
          throw new Error('Failed to generate Instagram image');
        }
        
        // Get quote for caption
        let quote = null;
        if (dateParam) {
          quote = window.app.quoteService.getQuoteForDate(dateParam);
        } else {
          quote = window.app.quoteService.getTodayQuote();
        }
        
        // Return data for Zapier
        return {
          success: true,
          image: instagramImage,
          caption: `${quote.text} — ${quote.author}`,
          date: dateParam || new Date().toISOString().split('T')[0],
          blockCount: quiltData.length,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }, date);
    
    await browser.close();
    
    if (result.success) {
      console.log('✅ Instagram image generated for Zapier:', result.date);
      res.json(result);
    } else {
      console.error('❌ Zapier webhook error:', result.error);
      res.status(500).json(result);
    }
    
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Instagram Image Generator for Zapier'
  });
});

// Test endpoint
app.get('/api/test', async (req, res) => {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://www.zakfoster.com/odq2.html');
    await page.waitForFunction(() => window.app, { timeout: 10000 });
    
    const appStatus = await page.evaluate(() => {
      return {
        appReady: !!window.app,
        quiltEngine: !!window.app?.quiltEngine,
        archiveService: !!window.app?.archiveService,
        quoteService: !!window.app?.quoteService
      };
    });
    
    await browser.close();
    
    res.json({
      success: true,
      appStatus,
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

app.listen(PORT, () => {
  console.log(`🚀 Instagram Image Generator server running on port ${PORT}`);
  console.log(`📸 Zapier endpoint: http://localhost:${PORT}/api/generate-instagram`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
});
