/**
 * Renders layout B (experimental story) PNGs for the shortest and longest
 * quotes from QuoteService defaults in our-daily-beta.html.
 *
 * Usage (from repo root):
 *   npx playwright install chromium
 *   node scripts/render-layout-b-quote-samples.cjs
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require(path.join(__dirname, 'render-pkg/node_modules/playwright'));

const ROOT = path.join(__dirname, '..');
const HTML = 'our-daily-beta.html';
const OUT_DIR = path.join(ROOT, 'exports');

const SHORT_QUOTE = {
  text: 'Creativity takes courage.',
  author: 'Henri Matisse',
};

const LONG_QUOTE = {
  text:
    'The true measure of our commitment to justice, the character of our society, our commitment to the rule of law, fairness, and equality cannot be measured by how we treat the rich, the powerful, the privileged, and the respected among us.',
  author: 'Bryan Stevenson',
};

function serveStatic(port) {
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/' || p === '') p = `/${HTML}`;
    const filePath = path.join(ROOT, path.normalize(p).replace(/^\/+/, ''));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      const ct =
        ext === '.html'
          ? 'text/html'
          : ext === '.js'
            ? 'application/javascript'
            : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function captureStory(page, quoteObj, outFile) {
  await page.goto(`http://127.0.0.1:${global.__layoutBPort}/${HTML}`, {
    waitUntil: 'load',
    timeout: 180000,
  });

  // Playwright: options are the third argument; passing `{ timeout }` as 2nd arg becomes `arg` to the predicate.
  await page.waitForFunction(
    () =>
      window.app &&
      typeof window.app.handleShareStoryExperimental === 'function' &&
      document.getElementById('quilt'),
    null,
    { timeout: 180000 }
  );

  await page.evaluate(() => {
    navigator.canShare = () => false;
  });

  const bytes = await page.evaluate(async (q) => {
    const origCreate = URL.createObjectURL.bind(URL);
    const pngBlobs = [];
    URL.createObjectURL = function (blob) {
      if (blob && blob.type === 'image/png') pngBlobs.push(blob);
      return origCreate(blob);
    };
    window.app.quoteService.getTodayQuote = () => ({
      text: q.text,
      author: q.author,
    });
    try {
      await window.app.handleShareStoryExperimental();
    } finally {
      URL.createObjectURL = origCreate;
    }
    const story = pngBlobs[pngBlobs.length - 1];
    if (!story) throw new Error('No PNG blob captured (expected story composite)');
    const ab = await story.arrayBuffer();
    return Array.from(new Uint8Array(ab));
  }, quoteObj);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.from(bytes));
}

(async () => {
  const server = await serveStatic(0);
  const port = server.address().port;
  global.__layoutBPort = port;
  console.log(`Serving ${HTML} on http://127.0.0.1:${port}/`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await captureStory(page, SHORT_QUOTE, path.join(OUT_DIR, 'story-b-shortest-quote.png'));
    console.log('Wrote', path.join(OUT_DIR, 'story-b-shortest-quote.png'));
    await captureStory(page, LONG_QUOTE, path.join(OUT_DIR, 'story-b-longest-quote.png'));
    console.log('Wrote', path.join(OUT_DIR, 'story-b-longest-quote.png'));
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
