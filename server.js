const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// Simple Instagram image generation without external page
async function generateSimpleInstagramImage() {
  const canvas = require('canvas');
  const { createCanvas } = canvas;
  
  // Create a 1080x1350 canvas (4:5 ratio)
  const canvasWidth = 1080;
  const canvasHeight = 1350;
  const canvasInstance = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvasInstance.getContext('2d');
  
  // Fill background with a nice color
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Add some decorative elements
  ctx.fillStyle = '#6c757d';
  ctx.font = '48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Our Daily Quilt', canvasWidth / 2, 200);
  
  ctx.fillStyle = '#495057';
  ctx.font = '24px Arial';
  ctx.fillText('Daily Instagram Post', canvasWidth / 2, 250);
  
  // Add today's date
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  ctx.fillText(dateString, canvasWidth / 2, 300);
  
  // Add a simple quote
  const quotes = [
    "The present is theirs; the future, for which I really worked, is mine. — Nikola Tesla",
    "Creativity is intelligence having fun. — Albert Einstein",
    "Every day is a new beginning. — Unknown",
    "Art is not what you see, but what you make others see. — Edgar Degas"
  ];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  
  ctx.fillStyle = '#212529';
  ctx.font = '20px Arial';
  ctx.fillText(randomQuote, canvasWidth / 2, 400);
  
  // Convert to base64
  const buffer = canvasInstance.toBuffer('image/png');
  const base64Image = buffer.toString('base64');
  const dataURL = `data:image/png;base64,${base64Image}`;
  
  return {
    success: true,
    image: dataURL,
    caption: randomQuote,
    date: today.toISOString().split('T')[0],
    blockCount: 0,
    captionLength: randomQuote.length,
    imageSize: dataURL.length
  };
}

app.post('/api/generate-instagram', async (req, res) => {
  try {
    console.log('🚀 Starting Instagram image generation...');
    
    // Generate a simple Instagram image
    const result = await generateSimpleInstagramImage();
    
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

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Instagram Quilt Generator',
    version: '1.0.0',
    ready: true
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

app.listen(PORT, () => {
  console.log(`🚂 Instagram Quilt Generator server running on port ${PORT}`);
  console.log(`📸 Instagram endpoint: http://localhost:${PORT}/api/generate-instagram`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test-instagram`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Simple test: http://localhost:${PORT}/api/simple-test`);
});
