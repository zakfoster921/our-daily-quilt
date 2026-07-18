#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SAMPLE = path.join(ROOT, 'assets', 'mood-collage', 'triangle.webp');

function parseArgs(argv) {
  const args = { postId: '', date: '', out: '', latest: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--post-id' || arg === '--postId') args.postId = String(argv[++i] || '').trim();
    else if (arg === '--date') args.date = String(argv[++i] || '').trim().toLowerCase();
    else if (arg === '--out') args.out = String(argv[++i] || '').trim();
    else if (arg === '--latest') args.latest = true;
  }
  return args;
}

function formatSocialPostCaptionDate(iso) {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/Chicago' }).toUpperCase();
  const day = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'America/Chicago' }).format(date);
  const year = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/Chicago' }).format(date);
  return `${month} ${day} ${year}`;
}

function matchesDisplayDate(iso, dateArg) {
  const label = formatSocialPostCaptionDate(iso);
  if (!label || !dateArg) return false;
  const normalized = dateArg.replace(/\//g, '-').replace(/\s+/g, ' ').trim();
  const parts = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) ||
    normalized.match(/^(\d{1,2})-(\d{1,2})(?:-(\d{4}))?$/);
  if (parts) {
    let year;
    let month;
    let day;
    if (parts[0].length === 10 && parts[0][4] === '-') {
      year = Number(parts[1]);
      month = Number(parts[2]);
      day = Number(parts[3]);
    } else {
      month = Number(parts[1]);
      day = Number(parts[2]);
      year = Number(parts[3] || new Date().getFullYear());
    }
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const target = `${months[month - 1]} ${day} ${year}`;
    return label === target;
  }
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const wordMatch = normalized.match(/^([a-z]{3,9})[\s-]+(\d{1,2})(?:[\s-]+(\d{4}))?$/i);
  if (wordMatch) {
    const monthIdx = monthNames.findIndex((m) => wordMatch[1].startsWith(m));
    if (monthIdx < 0) return false;
    const day = Number(wordMatch[2]);
    const year = Number(wordMatch[3] || new Date().getFullYear());
    const target = `${monthNames[monthIdx].toUpperCase()} ${day} ${year}`;
    return label === target;
  }
  return label.toLowerCase().includes(normalized);
}

async function loadPostFromFirestore({ postId, date, latest = false }) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(ROOT, 'firebase-adminsdk-local.json');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  const db = admin.firestore();

  if (postId) {
    const doc = await db.collection('socialPosts').doc(postId).get();
    if (!doc.exists) throw new Error(`Post not found: ${postId}`);
    const data = doc.data() || {};
    return {
      postId: doc.id,
      caption: String(data.caption || ''),
      publishedAtIso: String(data.publishedAtIso || data.createdAtIso || ''),
      imageUrl: pickImageUrl(data.media)
    };
  }

  const snap = await db.collection('socialPosts').orderBy('publishedAtIso', 'desc').limit(100).get();
  const candidates = snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      const publishedAtIso = String(data.publishedAtIso || '');
      return {
        postId: doc.id,
        status: String(data.status || ''),
        caption: String(data.caption || ''),
        publishedAtIso,
        displayDate: formatSocialPostCaptionDate(publishedAtIso),
        imageUrl: pickImageUrl(data.media)
      };
    })
    .filter((post) => post.status === 'published' && post.imageUrl);

  if (latest) {
    if (!candidates.length) throw new Error('No published image post found');
    return candidates[0];
  }

  const dated = candidates.filter((post) => matchesDisplayDate(post.publishedAtIso, date));
  if (!dated.length) {
    throw new Error(`No published image post found for date "${date}"`);
  }
  dated.sort((a, b) => String(a.publishedAtIso).localeCompare(String(b.publishedAtIso)));
  return dated[0];
}

function pickImageUrl(media) {
  const list = Array.isArray(media) ? media : [];
  const image = list.find((item) => {
    const type = String(item?.type || '').toLowerCase();
    const url = String(item?.url || '');
    if (type === 'image') return !!url;
    return !!url && !/\.(mp4|mov|webm)(\?|$)/i.test(url);
  });
  return String((image || list[0] || {}).url || '').trim();
}

async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch image (${response.status})`);
  const buf = Buffer.from(await response.arrayBuffer());
  const type = String(response.headers.get('content-type') || 'image/jpeg');
  return { buf, mime: type.split(';')[0] || 'image/jpeg' };
}

function buildRenderHtml({ imageB64, mime, caption, dateLabel, tapeB64 = '' }) {
  const safeCaption = JSON.stringify(caption || '');
  const safeDate = JSON.stringify(dateLabel || '');
  return `<!doctype html><html><head>
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,500&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet">
  </head><body><script>
    const sampleSrc = 'data:${mime};base64,${imageB64}';
    const tapeSrc = ${tapeB64 ? `'data:image/png;base64,${tapeB64}'` : "''"};
    const HEADER_TEXT = 'from the STUDIO FLOOR of Zak Foster';
    const HEADER_FONT = "'Barlow Condensed', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
    function headerFontSize(storyW) {
      const phoneW = 390;
      const phoneSize = Math.min(3.1 * 16, Math.max(2 * 16, phoneW * 0.09));
      return Math.round(phoneSize * (storyW / phoneW));
    }
    function wrapLines(ctx, text, maxWidth) {
      const breakLongWord = (word) => {
        const out = [];
        let piece = '';
        for (const ch of word) {
          const next = piece + ch;
          if (ctx.measureText(next).width <= maxWidth || piece === '') piece = next;
          else { out.push(piece); piece = ch; }
        }
        if (piece) out.push(piece);
        return out;
      };
      const words = String(text || '').replace(/\\s+/g, ' ').trim().split(' ').filter(Boolean);
      const lines = [];
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width <= maxWidth) line = test;
        else {
          if (line) lines.push(line);
          if (ctx.measureText(word).width <= maxWidth) line = word;
          else {
            const chunks = breakLongWord(word);
            for (let c = 0; c < chunks.length - 1; c++) lines.push(chunks[c]);
            line = chunks[chunks.length - 1] || '';
          }
        }
      }
      if (line) lines.push(line);
      return lines;
    }
    function wrapLinesContinued(ctx, text, firstMaxW, nextMaxW) {
      const words = String(text || '').replace(/\\s+/g, ' ').trim().split(' ').filter(Boolean);
      if (!words.length) return [];
      const lines = [];
      let line = '';
      let maxW = Math.max(40, firstMaxW);
      const pushLongWord = (word) => {
        let piece = '';
        for (const ch of word) {
          const next = piece + ch;
          if (ctx.measureText(next).width <= maxW || piece === '') piece = next;
          else {
            lines.push(piece);
            piece = ch;
            maxW = Math.max(40, nextMaxW);
          }
        }
        if (piece) line = piece;
      };
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width <= maxW) line = test;
        else {
          if (line) {
            lines.push(line);
            line = '';
            maxW = Math.max(40, nextMaxW);
          }
          if (ctx.measureText(word).width <= maxW) line = word;
          else pushLongWord(word);
        }
      }
      if (line) lines.push(line);
      return lines;
    }
    function normalizeSocialPostCaptionText(value) {
      return String(value || '')
        .replace(/\\r\\n/g, '\\n')
        .replace(/\\r/g, '\\n')
        .split('\\n')
        .map((line) => line.replace(/[^\\S\\n]+/g, ' ').trimEnd())
        .join('\\n')
        .trim();
    }
    function layoutDateCaption(ctx, dateLabel, caption, textMaxW, textSize, font) {
      const safeDate = String(dateLabel || '').trim();
      const safeCaption = normalizeSocialPostCaptionText(caption);
      const datePrefix = safeDate ? safeDate + ': ' : '';
      ctx.font = '700 ' + textSize + 'px ' + font;
      const prefixW = datePrefix ? ctx.measureText(datePrefix).width : 0;
      ctx.font = '400 ' + textSize + 'px ' + font;
      const paragraphs = safeCaption ? safeCaption.split('\\n') : [];
      const bodyLines = [];
      if (!paragraphs.length && datePrefix) {
        bodyLines.push('');
      }
      paragraphs.forEach((paragraph, paragraphIndex) => {
        const trimmed = String(paragraph || '').trim();
        if (!trimmed) {
          bodyLines.push('');
          return;
        }
        const isFirstParagraph = paragraphIndex === 0;
        const wrapped = (datePrefix && isFirstParagraph && bodyLines.length === 0)
          ? wrapLinesContinued(ctx, trimmed, Math.max(80, textMaxW - prefixW), textMaxW)
          : wrapLines(ctx, trimmed, textMaxW);
        bodyLines.push(...wrapped);
      });
      return { datePrefix, bodyLines, lineH: textSize * 1.45 };
    }
    function drawDateCaption(ctx, layout, padX, top, textSize, font, inkColor) {
      ctx.fillStyle = inkColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      let ty = top;
      layout.bodyLines.forEach((line, index) => {
        if (index === 0 && layout.datePrefix) {
          ctx.font = '700 ' + textSize + 'px ' + font;
          ctx.fillText(layout.datePrefix, padX, ty);
          if (line) {
            const prefixW = ctx.measureText(layout.datePrefix).width;
            ctx.font = '400 ' + textSize + 'px ' + font;
            ctx.fillText(line, padX + prefixW, ty);
          }
        } else {
          ctx.font = '400 ' + textSize + 'px ' + font;
          ctx.fillText(line, padX, ty);
        }
        ty += layout.lineH;
      });
    }
    function measureHeader(ctx, padX, textMaxW, padTop, storyW) {
      const slabW = Math.round(storyW * 0.92);
      const textSafeW = Math.max(200, Math.round(slabW * 0.76));
      const fitMaxW = Math.min(textMaxW || textSafeW, textSafeW);
      let headerSize = headerFontSize(storyW);
      const minHeaderSize = 26;
      const measureHeaderWidth = () => {
        ctx.font = 'italic 500 ' + headerSize + 'px ' + HEADER_FONT;
        return ctx.measureText(HEADER_TEXT).width;
      };
      for (let attempt = 0; attempt < 40; attempt++) {
        if (measureHeaderWidth() <= fitMaxW || headerSize <= minHeaderSize) break;
        headerSize -= 2;
      }
      const headerLineH = headerSize * 1.05;
      const padY = Math.round(headerSize * 0.42);
      const slabH = Math.round(headerLineH + padY * 2);
      const slabX = Math.round((storyW - slabW) / 2);
      const slabY = Math.round(padTop - padY);
      return {
        padTop, padX, storyW, headerSize, headerLineH, padY,
        slabX, slabY, slabW, slabH,
        headerBottom: slabY + slabH + 10
      };
    }
    function drawHeaderTape(ctx, tapeImage, layout) {
      if (!layout) return;
      const rotateDeg = -1.15;
      const fill = '#f2eee6';
      const capW = Math.max(24, Math.round(layout.slabW * 0.13));
      ctx.save();
      ctx.translate(layout.slabX + layout.slabW / 2, layout.slabY + layout.slabH / 2);
      ctx.rotate((rotateDeg * Math.PI) / 180);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = fill;
      ctx.fillRect(-layout.slabW / 2, -layout.slabH / 2, layout.slabW, layout.slabH);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const wash = ctx.createLinearGradient(-layout.slabW / 2, 0, layout.slabW / 2, 0);
      wash.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      wash.addColorStop(0.46, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = wash;
      ctx.fillRect(-layout.slabW / 2, -layout.slabH / 2, layout.slabW, layout.slabH);
      if (tapeImage) {
        ctx.drawImage(tapeImage, -layout.slabW / 2, -layout.slabH / 2, capW, layout.slabH);
        ctx.drawImage(tapeImage, layout.slabW / 2 - capW, -layout.slabH / 2, capW, layout.slabH);
      }
      ctx.restore();
    }
    function drawHeaderText(ctx, layout) {
      ctx.fillStyle = '#241f19';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = 'italic 500 ' + layout.headerSize + 'px ' + HEADER_FONT;
      try { ctx.letterSpacing = '0px'; } catch (_) {}
      ctx.fillText(HEADER_TEXT, Math.round(layout.storyW / 2), layout.padTop);
    }
    function drawHeader(ctx, padX, textMaxW, padTop, tapeImage, storyW) {
      const layout = measureHeader(ctx, padX, textMaxW, padTop, storyW);
      drawHeaderTape(ctx, tapeImage, layout);
      drawHeaderText(ctx, layout);
      return layout.headerBottom;
    }
    async function render() {
      const STORY_W = 1080;
      const STORY_H = 1920;
      const padX = 72;
      const headerPadTop = 192;
      const gapHeaderCta = 20;
      const gapCtaImage = 32;
      const padBottom = 88;
      const gapImageText = 44;
      const matPad = 18;
      const backingColor = '#f6f4f1';
      const matColor = '#f2eee6';
      const inkColor = '#404040';
      const ctaColor = 'rgba(47, 39, 31, 0.68)';
      const ctaText = 'See more on @ourdailyquilt';
      const FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
      const imageSlotW = STORY_W - padX * 2;
      const textMaxW = imageSlotW;
      const caption = ${safeCaption};
      const dateLabel = ${safeDate};

      if (document.fonts) {
        await Promise.all([
          document.fonts.load('italic 500 ' + headerFontSize(STORY_W) + 'px "Barlow Condensed"'),
          document.fonts.load('400 48px "DM Sans"'),
          document.fonts.load('600 48px "DM Sans"'),
          document.fonts.load('700 48px "DM Sans"')
        ]);
        await document.fonts.ready;
      }

      const postImage = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('sample load failed'));
        im.src = sampleSrc;
      });
      const headerTape = tapeSrc
        ? await new Promise((resolve) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => resolve(null);
            im.src = tapeSrc;
          })
        : null;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = STORY_W;
      canvas.height = STORY_H;
      ctx.fillStyle = backingColor;
      ctx.fillRect(0, 0, STORY_W, STORY_H);

      const headerBottom = drawHeader(ctx, padX, textMaxW, headerPadTop, headerTape, STORY_W);

      const ctaSize = 46;
      const ctaLineH = ctaSize * 1.35;
      const ctaTop = headerBottom + gapHeaderCta;
      ctx.fillStyle = ctaColor;
      ctx.font = '600 ' + ctaSize + 'px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(ctaText, padX, ctaTop);

      const contentTop = ctaTop + ctaLineH + gapCtaImage;
      const minCaptionReserve = 120;
      const maxImageOuterH = Math.max(
        360,
        STORY_H - padBottom - minCaptionReserve - gapImageText - contentTop
      );
      const maxImageH = Math.max(280, maxImageOuterH - matPad * 2);
      const imageInnerSlotW = Math.max(200, imageSlotW - matPad * 2);

      const iw = Math.max(1, postImage.naturalWidth || postImage.width);
      const ih = Math.max(1, postImage.naturalHeight || postImage.height);
      const fitScale = Math.min(imageInnerSlotW / iw, maxImageH / ih);
      const drawW = Math.round(iw * fitScale);
      const drawH = Math.round(ih * fitScale);
      const drawX = Math.round(padX + (imageSlotW - drawW) / 2);
      const drawY = contentTop + matPad;
      const matX = drawX - matPad;
      const matY = drawY - matPad;
      const matW = drawW + matPad * 2;
      const matH = drawH + matPad * 2;
      ctx.save();
      ctx.shadowColor = 'rgba(45, 36, 29, 0.18)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = matColor;
      ctx.fillRect(matX, matY, matW, matH);
      ctx.restore();
      ctx.fillStyle = matColor;
      ctx.fillRect(matX, matY, matW, matH);
      ctx.drawImage(postImage, drawX, drawY, drawW, drawH);
      const imageBottom = matY + matH;

      const textTop = imageBottom + gapImageText;
      const textAreaH = Math.max(120, STORY_H - padBottom - textTop);

      let textSize = 38;
      let captionLayout = layoutDateCaption(ctx, dateLabel, caption, textMaxW, textSize, FONT);
      for (let attempt = 0; attempt < 24; attempt++) {
        captionLayout = layoutDateCaption(ctx, dateLabel, caption, textMaxW, textSize, FONT);
        const totalTextH = captionLayout.bodyLines.length * captionLayout.lineH;
        if (totalTextH <= textAreaH || textSize <= 24) break;
        textSize -= 2;
      }
      drawDateCaption(ctx, captionLayout, padX, textTop, textSize, FONT, inkColor);

      window.__previewDataUrl = canvas.toDataURL('image/png');
    }
    render().catch((e) => { window.__previewError = String(e); });
  </script></body></html>`;
}

async function renderStoryPng({ imageBuf, mime, caption, dateLabel }) {
  const tapePath = path.join(ROOT, 'assets', 'before-you-go-tape-alpha.png');
  const tapeB64 = fs.existsSync(tapePath) ? fs.readFileSync(tapePath).toString('base64') : '';
  const html = buildRenderHtml({
    imageB64: imageBuf.toString('base64'),
    mime,
    caption,
    dateLabel,
    tapeB64
  });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__previewDataUrl || window.__previewError, null, { timeout: 30000 });
  const err = await page.evaluate(() => window.__previewError);
  if (err) throw new Error(err);
  const dataUrl = await page.evaluate(() => window.__previewDataUrl);
  await browser.close();
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

async function main() {
  const args = parseArgs(process.argv);
  let caption = 'Testing the studio floor story export — image, date, caption, and handle at the bottom.';
  let dateLabel = 'JUN 20 2026';
  let imageBuf;
  let mime = 'image/webp';
  let slug = 'sample';

  if (args.postId || args.date || args.latest) {
    const post = await loadPostFromFirestore({
      postId: args.postId,
      date: args.date,
      latest: args.latest || (!args.postId && !args.date)
    });
    dateLabel = formatSocialPostCaptionDate(post.publishedAtIso);
    caption = post.caption;
    slug = post.postId;
    const fetched = await fetchImageBuffer(post.imageUrl);
    imageBuf = fetched.buf;
    mime = fetched.mime;
    console.error(`Post: ${post.postId}`);
    console.error(`Date: ${dateLabel}`);
    console.error(`Caption: ${caption}`);
  } else {
    imageBuf = fs.readFileSync(SAMPLE);
  }

  const out = args.out
    ? path.resolve(ROOT, args.out)
    : args.latest
      ? path.join(ROOT, 'tmp', `studio-floor-story-latest-${slug}-preview.png`)
      : args.date
      ? path.join(ROOT, 'tmp', `studio-floor-story-${args.date.replace(/[^\w-]+/g, '-')}-preview.png`)
      : args.postId
        ? path.join(ROOT, 'tmp', `studio-floor-story-${slug}-preview.png`)
        : path.join(ROOT, 'tmp', 'studio-floor-story-preview.png');

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await renderStoryPng({ imageBuf, mime, caption, dateLabel }));
  console.log(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
