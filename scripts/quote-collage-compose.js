/**
 * ODQ Daily Quote Collage — canvas composer (portable to our-daily-beta.html).
 * Full-bleed quilt + wash, spread editorial quote, speaker cutout card (B/W xerox + color wash).
 */
(function (global) {
  'use strict';

  const QKE = (function resolveQuoteKeywordEmphasis() {
    try {
      if (typeof require !== 'undefined') {
        return require('../lib/quote-keyword-emphasis');
      }
    } catch (_) {
      /* browser bundle has no require */
    }
    const g = typeof globalThis !== 'undefined' ? globalThis : global;
    return g.QuoteKeywordEmphasis || null;
  })();

  const QNC = (function resolveQuiltNewspaperClipping() {
    try {
      if (typeof require !== 'undefined') {
        return require('../lib/quilt-newspaper-clipping.js');
      }
    } catch (_) {
      /* browser bundle has no require */
    }
    const g = typeof globalThis !== 'undefined' ? globalThis : global;
    return g.QuiltNewspaperClipping || null;
  })();

  const FONT_SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const WORDMARK_DEFAULT = 'assets/portal-our-daily-quilt.png';
  const CREAM_INK = '#f8f6f2';
  const BLACK_INK = '#111111';
  const FORMATS = {
    post: { w: 1080, h: 1350, label: 'Post 4:5' },
    story: { w: 1080, h: 1920, label: 'Story 9:16' }
  };

  function getAspectSafeCanvasRect(sourceW, sourceH, targetW, targetH, fit = 'contain') {
    const sw = Math.max(1, Number(sourceW) || 1);
    const sh = Math.max(1, Number(sourceH) || 1);
    const tw = Math.max(1, Number(targetW) || 1);
    const th = Math.max(1, Number(targetH) || 1);
    const scale = fit === 'cover' ? Math.max(tw / sw, th / sh) : Math.min(tw / sw, th / sh);
    const width = Math.round(sw * scale);
    const height = Math.round(sh * scale);
    return {
      x: Math.round((tw - width) / 2),
      y: Math.round((th - height) / 2),
      width,
      height
    };
  }

  /** Seeded editorial line breaks (aligned with layoutb-quote-plan.js). */
  function splitQuoteIntoEditorialLines(text, dateKey) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return [];
    const rngDateKey = dateKey || new Date().toISOString().split('T')[0];
    let rngSeed = 2166136261;
    for (let i = 0; i < rngDateKey.length; i++) {
      rngSeed = Math.imul(rngSeed ^ rngDateKey.charCodeAt(i), 16777619);
    }
    const rnd = () => {
      rngSeed |= 0;
      rngSeed = (rngSeed + 0x6d2b79f5) | 0;
      let x = Math.imul(rngSeed ^ (rngSeed >>> 15), 1 | rngSeed);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const out = [];
    const maxLen = 52;
    const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
    const phraseTarget = () => {
      const a = rnd();
      const b = rnd();
      if (a < 0.22) return Math.round(28 + b * 12);
      if (a < 0.45) return Math.round(40 + b * 14);
      if (a < 0.78) return Math.round(48 + b * 12);
      return Math.round(54 + b * 10);
    };
    const pushChunk = (s) => {
      let rest = s.trim();
      if (!rest) return;
      while (rest.length > maxLen) {
        const sliceHi = Math.max(30, Math.min(maxLen, phraseTarget()));
        let cut = rest.lastIndexOf(' ', sliceHi);
        if (cut < 14) {
          cut = rest.indexOf(' ', 14);
          if (cut === -1) cut = Math.min(sliceHi, rest.length - 1);
        }
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) out.push(rest);
    };
    const splitFlat = (chunks, regex) =>
      chunks.flatMap((c) => {
        const bits = c.split(regex).map((x) => x.trim()).filter(Boolean);
        return bits.length > 1 ? bits : [c];
      });
    const splitFlatKeepLeftDelim = (chunks, regex, delim) =>
      chunks.flatMap((c) => {
        const bits = c.split(regex).map((x) => x.trim()).filter(Boolean);
        if (bits.length <= 1) return [c];
        return bits.map((b, i) => (i < bits.length - 1 ? `${b}${delim}` : b));
      });
    const tryConceptualSplit = (chunk, target) => {
      const len = chunk.length;
      if (len < 20) return null;
      const minI = Math.max(6, Math.floor(target * 0.2), Math.floor(len * 0.12));
      const maxI = Math.min(len - 6, Math.ceil(target * 1.45), Math.ceil(len * 0.9));
      if (minI >= maxI) return null;
      const patterns = [
        { re: /\s+(?:because|although|though|unless|until|whether|whenever|wherever)\s+/gi },
        { re: /\s+(?:when|where|while|before|after|since)\s+/gi },
        { re: /\s+(?:which|who|whom|whose)\s+/gi },
        { re: /\s+(?:and|but|or|nor|yet)\s+/gi }
      ];
      const candidates = [];
      for (const { re } of patterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(chunk)) !== null) {
          const idx = m.index;
          if (idx < minI || idx > maxI) continue;
          const left = chunk.slice(0, idx).trim();
          const right = chunk.slice(idx).trim();
          if (left.length < 6 || right.length < 6) continue;
          if (wordCount(left) < 2 || wordCount(right) < 2) continue;
          candidates.push({ idx, score: Math.abs(idx - target) + rnd() * 14 });
        }
      }
      if (!candidates.length) return null;
      candidates.sort((a, b) => a.score - b.score);
      const best = candidates[0].score;
      const pool = candidates.filter((c) => c.score <= best + 16 + rnd() * 10);
      const pick = pool[Math.floor(rnd() * pool.length)];
      return [chunk.slice(0, pick.idx).trim(), chunk.slice(pick.idx).trim()];
    };
    const sentences =
      t.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [t];
    for (const sentence of sentences) {
      let chunks = [sentence];
      chunks = splitFlat(chunks, /\s*;\s+/);
      chunks = splitFlat(chunks, /\s+[—–]\s+/);
      chunks = splitFlat(chunks, /:\s+/);
      chunks = splitFlatKeepLeftDelim(chunks, /,\s+/, ',');
      for (let chunk of chunks) {
        chunk = chunk.trim();
        if (!chunk) continue;
        while (chunk.length > maxLen) {
          const target = phraseTarget();
          const commaScanEnd = Math.min(chunk.length - 1, Math.max(24, target));
          let cut = -1;
          for (let i = commaScanEnd; i > 12; i--) {
            if (chunk[i] === ',') {
              cut = i;
              break;
            }
          }
          if (cut === -1) {
            for (let i = commaScanEnd; i > 12; i--) {
              if (chunk[i] === ';') {
                cut = i;
                break;
              }
            }
          }
          if (cut > 0) {
            out.push(chunk.slice(0, cut + 1).trim());
            chunk = chunk.slice(cut + 1).trim();
            continue;
          }
          const conceptual = tryConceptualSplit(chunk, target);
          if (conceptual) {
            out.push(conceptual[0]);
            chunk = conceptual[1];
            continue;
          }
          break;
        }
        for (let guard = 0; guard < 10 && chunk.length >= 20; guard++) {
          if (wordCount(chunk) < 5) break;
          const conceptual = tryConceptualSplit(chunk, phraseTarget());
          if (!conceptual) break;
          const left = conceptual[0];
          const right = conceptual[1];
          if (left.length < 8 || right.length < 8) break;
          if (wordCount(left) < 2 || wordCount(right) < 2) break;
          out.push(left);
          chunk = right;
        }
        pushChunk(chunk);
      }
    }
    return out.length ? out : [t];
  }

  function getSpeakerImageCandidates(url, apiBase) {
    const safeUrl = String(url || '').trim();
    if (!safeUrl) return [];
    if (/^(?:data|blob):/i.test(safeUrl)) return [safeUrl];
    const base = String(apiBase || '').replace(/\/$/, '');
    let isFirebaseStorageHost = false;
    try {
      const u = new URL(safeUrl);
      isFirebaseStorageHost =
        /(^|\.)firebasestorage\.googleapis\.com$/i.test(u.hostname) ||
        /\.firebasestorage\.app$/i.test(u.hostname);
    } catch (_) {
      /* ignore */
    }
    if (isFirebaseStorageHost && base) {
      return [`${base}/api/proxy-image?url=${encodeURIComponent(safeUrl)}`];
    }
    const out = [];
    if (/^https?:\/\//i.test(safeUrl) && base) {
      out.push(`${base}/api/proxy-image?url=${encodeURIComponent(safeUrl)}`);
    }
    out.push(safeUrl);
    return [...new Set(out)];
  }

  function loadImage(url, apiBase) {
    const candidates = getSpeakerImageCandidates(url, apiBase);
    const tryOne = (src) =>
      new Promise((resolve) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.referrerPolicy = 'no-referrer';
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = src;
      });
    return (async () => {
      for (const c of candidates.length ? candidates : [url]) {
        const im = await tryOne(c);
        if (im) return im;
      }
      return null;
    })();
  }

  function loadImageRequired(url) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Failed to load image'));
      im.src = url;
    });
  }

  function sampleBandLuminance(ctx, w, h, topFrac, bottomFrac) {
    const y0 = Math.floor(h * topFrac);
    const y1 = Math.floor(h * bottomFrac);
    const bandH = Math.max(1, y1 - y0);
    const sw = Math.min(64, w);
    const sh = Math.min(64, bandH);
    const sample = document.createElement('canvas');
    sample.width = sw;
    sample.height = sh;
    const sctx = sample.getContext('2d', { willReadFrequently: true });
    if (!sctx) return 0.7;
    sctx.drawImage(ctx.canvas, 0, y0, w, bandH, 0, 0, sw, sh);
    const pixels = sctx.getImageData(0, 0, sw, sh).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 64) continue;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      n++;
    }
    return n ? sum / n : 0.7;
  }

  function quoteFontPx(lineCount, layoutW, layoutH) {
    const isPost = layoutW === 1080 && layoutH === 1350;
    let px = isPost ? 118 : 108;
    if (lineCount >= 4) px -= 10;
    if (lineCount >= 6) px -= 10;
    if (lineCount >= 8) px -= 8;
    if (!isPost && lineCount >= 5) px -= 4;
    return Math.max(isPost ? 76 : 70, px);
  }

  function makeSeededRng(dateKey) {
    const rngDateKey = dateKey || new Date().toISOString().split('T')[0];
    let rngSeed = 2166136261;
    for (let i = 0; i < rngDateKey.length; i++) {
      rngSeed = Math.imul(rngSeed ^ rngDateKey.charCodeAt(i), 16777619);
    }
    return () => {
      rngSeed |= 0;
      rngSeed = (rngSeed + 0x6d2b79f5) | 0;
      let t = Math.imul(rngSeed ^ (rngSeed >>> 15), 1 | rngSeed);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function parseSpeakerWashRgb(hex) {
    const fallback = '#ea9b9a';
    const safe = /^#[0-9A-Fa-f]{6}$/.test(String(hex || '').trim())
      ? String(hex).trim()
      : fallback;
    return {
      r: parseInt(safe.slice(1, 3), 16),
      g: parseInt(safe.slice(3, 5), 16),
      b: parseInt(safe.slice(5, 7), 16)
    };
  }

  /** B/W xerox silhouette — matches in-app quote speaker card pipeline. */
  function makeSpeakerSilhouetteCanvas(img, outW, outH) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(outW));
    c.height = Math.max(1, Math.round(outH));
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    const iw = Math.max(1, img.naturalWidth || img.width);
    const ih = Math.max(1, img.naturalHeight || img.height);
    const scale = c.width / iw;
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (c.width - dw) / 2;
    const dy = 0;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, dx, dy, dw, dh);
    const image = g.getImageData(0, 0, c.width, c.height);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      const alpha = d[i + 3];
      if (alpha < 8) {
        d[i + 3] = 0;
        continue;
      }
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const after = ((lum - 0.5) * 1.48 + 0.5) * 1.56;
      const v = Math.max(0, Math.min(255, Math.round(after * 255)));
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = Math.min(255, alpha * 0.98);
    }
    g.putImageData(image, 0, 0);
    return c;
  }

  /**
   * Speaker cutout card draw (no cream paper offset shape).
   * B/W portrait, radial color wash, xerox grain — same as Layout B drawSpeakerOverlay minus cream layer.
   */
  function drawSpeakerCutoutCard(ctx, img, rect, washColor, seedKey = 'odq') {
    if (!img || !rect || rect.width <= 0 || rect.height <= 0) return false;
    let portrait = null;
    try {
      portrait = makeSpeakerSilhouetteCanvas(img, rect.width, rect.height);
    } catch (_) {
      return false;
    }
    if (!portrait) return false;
    const wash = parseSpeakerWashRgb(washColor);

    const grain = document.createElement('canvas');
    grain.width = portrait.width;
    grain.height = portrait.height;
    const gx = grain.getContext('2d');
    if (gx) {
      const W = grain.width;
      const H = grain.height;
      const lineAngleRad = (92 * Math.PI) / 180;
      gx.save();
      gx.translate(W / 2, H / 2);
      gx.rotate(lineAngleRad);
      gx.strokeStyle = 'rgba(35, 27, 20, 0.72)';
      gx.lineWidth = 1;
      const diag = Math.ceil(Math.sqrt(W * W + H * H));
      for (let y = -diag; y <= diag; y += 7) {
        gx.beginPath();
        gx.moveTo(-diag, y + 0.5);
        gx.lineTo(diag, y + 0.5);
        gx.stroke();
      }
      gx.restore();
      const ringCx = W * 0.13;
      const ringCy = H * 0.21;
      const ringMaxR = Math.ceil(
        Math.sqrt(Math.max(ringCx, W - ringCx) ** 2 + Math.max(ringCy, H - ringCy) ** 2)
      );
      gx.strokeStyle = 'rgba(35, 27, 20, 0.65)';
      gx.lineWidth = 0.55;
      for (let r = 4; r <= ringMaxR; r += 4) {
        gx.beginPath();
        gx.arc(ringCx, ringCy, r, 0, Math.PI * 2);
        gx.stroke();
      }
      gx.globalCompositeOperation = 'destination-in';
      gx.drawImage(portrait, 0, 0);
    }

    const washLayer = document.createElement('canvas');
    washLayer.width = portrait.width;
    washLayer.height = portrait.height;
    const wx = washLayer.getContext('2d');
    if (wx) {
      const grad = wx.createRadialGradient(
        washLayer.width * 0.28,
        washLayer.height * 0.24,
        washLayer.width * 0.04,
        washLayer.width * 0.5,
        washLayer.height * 0.5,
        washLayer.width * 0.74
      );
      grad.addColorStop(0, `rgba(${wash.r}, ${wash.g}, ${wash.b}, 0.58)`);
      grad.addColorStop(0.52, `rgba(${wash.r}, ${wash.g}, ${wash.b}, 0.38)`);
      grad.addColorStop(1, 'rgba(255,244,218,0.12)');
      wx.fillStyle = grad;
      wx.fillRect(0, 0, washLayer.width, washLayer.height);
      wx.globalCompositeOperation = 'destination-in';
      wx.drawImage(portrait, 0, 0);
    }

    ctx.save();
    ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.rotate(rect.angle || 0);
    if (QNC?.drawScannerBed) {
      const bed = document.createElement('canvas');
      bed.width = portrait.width;
      bed.height = portrait.height;
      const bctx = bed.getContext('2d');
      if (bctx) {
        QNC.drawScannerBed(
          bctx,
          bed.width,
          bed.height,
          `${String(seedKey || 'odq').trim()}:speaker-cutout:0`,
          'speakerCutout'
        );
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.drawImage(bed, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
      }
    }
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.95;
    ctx.drawImage(portrait, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
    if (wx) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.62;
      ctx.drawImage(washLayer, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
    }
    if (gx) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(grain, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    return true;
  }

  /** Bottom-center, flush to canvas bottom (overflow crops PNG bottom padding). Area ≥ 30%. */
  const SPEAKER_BOTTOM_OVERFLOW_FRAC = 0.04;

  function normalizeSpeakerAlign(align) {
    const a = String(align || 'center').trim().toLowerCase();
    if (a === 'left' || a === 'right') return a;
    return 'center';
  }

  function speakerAlignX(align, w, drawW) {
    const side = Math.max(52, Math.round(w * 0.058));
    if (align === 'left') return side;
    if (align === 'right') return w - side - drawW;
    return Math.round((w - drawW) / 2);
  }

  function getSpeakerDrawRect(img, w, h, align) {
    const minAreaFrac = 0.3;
    const minArea = w * h * minAreaFrac;
    const iw = Math.max(1, img?.naturalWidth || img?.width || 3);
    const ih = Math.max(1, img?.naturalHeight || img?.height || 4);
    const aspect = iw / ih;
    let drawH = Math.max(h * 0.42, Math.sqrt(minArea / aspect));
    let drawW = drawH * aspect;
    const maxW = w * 0.92;
    const maxH = h;
    if (drawW > maxW) {
      drawW = maxW;
      drawH = drawW / aspect;
    }
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * aspect;
    }
    if (drawW * drawH < minArea) {
      const scale = Math.sqrt(minArea / Math.max(1, drawW * drawH));
      drawW = Math.min(maxW, drawW * scale);
      drawH = Math.min(maxH, drawW / aspect);
    }
    if (drawW * drawH < minArea) {
      drawH = Math.min(maxH, Math.sqrt(minArea / aspect));
      drawW = Math.min(maxW, drawH * aspect);
    }
    const bottomOverflow = Math.round(h * SPEAKER_BOTTOM_OVERFLOW_FRAC);
    const normalizedAlign = normalizeSpeakerAlign(align);
    return {
      x: Math.round(speakerAlignX(normalizedAlign, w, drawW)),
      y: Math.round(h - drawH + bottomOverflow),
      width: Math.round(drawW),
      height: Math.round(drawH),
      angle: 0
    };
  }

  function estimateSpeakerRectWithoutImage(w, h, align) {
    const aspect = 0.75;
    const fake = { naturalWidth: aspect * 100, naturalHeight: 100 };
    return getSpeakerDrawRect(fake, w, h, align);
  }

  function lineBox(x, y, width, height) {
    return { left: x, top: y, right: x + width, bottom: y + height };
  }

  function rectsOverlap(a, b, pad) {
    const p = pad || 0;
    return !(
      a.right + p < b.left - p ||
      a.left - p > b.right + p ||
      a.bottom + p < b.top - p ||
      a.top - p > b.bottom + p
    );
  }

  function inflateRect(r, pad) {
    return {
      left: r.left - pad,
      top: r.top - pad,
      right: r.right + pad,
      bottom: r.bottom + pad
    };
  }

  const LINE_SIZE_TIERS = [0.92, 0.98, 1.0, 1.06, 1.12, 1.18, 1.24];
  /** Baseline-to-baseline rhythm when lines stack; collision uses full glyph height + gap. */
  const QUOTE_LINE_HEIGHT_MULT = 0.94;
  const QUOTE_LINE_MIN_GAP_PX = 16;
  /** Max share of a line's box that may cover the speaker (light collage edge only). */
  const SPEAKER_TEXT_MAX_OVERLAP_FRAC = 0.2;

  function lineStridePx(fontPx, boxH) {
    const h = Math.max(boxH || 0, Math.ceil(fontPx * 1.02));
    return Math.max(QUOTE_LINE_MIN_GAP_PX, Math.round(h * 0.12) + QUOTE_LINE_MIN_GAP_PX);
  }

  function lineRng(dateKey, lineIndex) {
    return makeSeededRng(`${dateKey || 'day'}#${lineIndex}`);
  }

  function pickLineFontPx(basePx, lineIndex, dateKey) {
    const rnd = lineRng(dateKey, lineIndex);
    const tier = LINE_SIZE_TIERS[Math.floor(rnd() * LINE_SIZE_TIERS.length)];
    return Math.round(basePx * tier);
  }

  const EMPHASIS_STYLE_PRESETS = ['poster', 'collage', 'quilt', 'angle', 'angle-down'];
  const EMPHASIS_STYLE_SET = new Set(EMPHASIS_STYLE_PRESETS);

  function emphasisAngleRotate(dateKey, rank, primary, mode) {
    const rnd = lineRng(dateKey, rank + 77);
    const mag = 0.07 + rnd() * (primary ? 0.09 : 0.06);
    if (mode === 'down') return mag;
    const sign = rnd() < 0.5 ? -1 : 1;
    return sign * mag;
  }

  function pickEmphasisVisualStyle(mode, dateKey, rank) {
    if (EMPHASIS_STYLE_SET.has(mode)) return mode;
    const rnd = lineRng(dateKey, (rank >= 0 ? rank : 0) + 91);
    return EMPHASIS_STYLE_PRESETS[Math.floor(rnd() * EMPHASIS_STYLE_PRESETS.length)];
  }

  function normalizeEmphasisStyleInput(emphasisStyle, dateKey, rank) {
    if (emphasisStyle == null || emphasisStyle === 'auto') {
      return [pickEmphasisVisualStyle('auto', dateKey, rank)];
    }
    const raw = Array.isArray(emphasisStyle)
      ? emphasisStyle
      : String(emphasisStyle)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    if (!raw.length) return ['poster'];
    if (raw.length === 1 && raw[0] === 'auto') {
      return [pickEmphasisVisualStyle('auto', dateKey, rank)];
    }
    const styles = raw.filter((s) => EMPHASIS_STYLE_SET.has(s));
    return styles.length ? styles : ['poster'];
  }

  function buildMergedEmphasisSpec(styles, seg, fontPx, dateKey, drawOptions) {
    const primary = seg.rank === 0;
    const set = new Set(styles);
    const spec = {
      weight: 900,
      fontPx,
      caps: false,
      rotate: 0,
      baselineShift: 0,
      ink: null,
      stroke: false,
      misregister: false,
      sampleQuilt: false
    };

    if (set.has('poster')) {
      spec.fontPx = Math.round(fontPx * (primary ? 1.12 : 1.08));
      spec.caps = primary;
      spec.baselineShift = primary ? 2 : 0;
    }
    if (set.has('angle-down')) {
      spec.rotate = emphasisAngleRotate(dateKey, seg.rank, primary, 'down');
      spec.fontPx = Math.max(spec.fontPx, Math.round(fontPx * (primary ? 1.06 : 1.03)));
      spec.baselineShift = Math.max(spec.baselineShift, primary ? 4 : 2);
    } else if (set.has('angle')) {
      const rnd = lineRng(dateKey, seg.rank + 77);
      const sign = rnd() < 0.5 ? -1 : 1;
      spec.rotate = sign * (0.07 + rnd() * (primary ? 0.09 : 0.06));
      spec.fontPx = Math.max(spec.fontPx, Math.round(fontPx * (primary ? 1.06 : 1.03)));
      spec.baselineShift = Math.max(spec.baselineShift, primary ? 3 : 1);
    }
    if (set.has('collage')) {
      const rnd = lineRng(dateKey, seg.rank + 55);
      if (!set.has('angle') && !set.has('angle-down')) {
        spec.rotate = (rnd() - 0.5) * (primary ? 0.14 : 0.09);
      }
      spec.ink = drawOptions.speakerWashColor || null;
      spec.misregister = true;
      spec.baselineShift = Math.max(spec.baselineShift, 3);
    }
    if (set.has('quilt')) {
      spec.fontPx = Math.max(spec.fontPx, Math.round(fontPx * 1.1));
      spec.stroke = true;
      spec.sampleQuilt = true;
    }
    return spec;
  }

  function segmentVisualSpec(seg, fontPx, dateKey, emphasisStyle, drawOptions) {
    if (!seg.emphasis) {
      return {
        weight: 700,
        fontPx,
        caps: false,
        rotate: 0,
        baselineShift: 0,
        ink: null,
        stroke: false,
        misregister: false,
        sampleQuilt: false
      };
    }
    const styles = normalizeEmphasisStyleInput(emphasisStyle, dateKey, seg.rank);
    if (styles.length === 1) {
      const style = styles[0];
      const primary = seg.rank === 0;
      if (style === 'poster') {
        return {
          weight: 900,
          fontPx: Math.round(fontPx * (primary ? 1.12 : 1.08)),
          caps: primary,
          rotate: 0,
          baselineShift: primary ? 2 : 0,
          ink: null,
          stroke: false,
          misregister: false,
          sampleQuilt: false
        };
      }
      if (style === 'collage') {
        const rnd = lineRng(dateKey, seg.rank + 55);
        return {
          weight: 900,
          fontPx,
          caps: false,
          rotate: (rnd() - 0.5) * (primary ? 0.14 : 0.09),
          baselineShift: 3,
          ink: drawOptions.speakerWashColor || null,
          stroke: false,
          misregister: true,
          sampleQuilt: false
        };
      }
      if (style === 'angle') {
        const rotate = emphasisAngleRotate(dateKey, seg.rank, primary, 'either');
        return {
          weight: 900,
          fontPx: Math.round(fontPx * (primary ? 1.06 : 1.03)),
          caps: false,
          rotate,
          baselineShift: primary ? 3 : 1,
          ink: null,
          stroke: false,
          misregister: false,
          sampleQuilt: false
        };
      }
      if (style === 'angle-down') {
        const rotate = emphasisAngleRotate(dateKey, seg.rank, primary, 'down');
        return {
          weight: 900,
          fontPx: Math.round(fontPx * (primary ? 1.06 : 1.03)),
          caps: false,
          rotate,
          baselineShift: primary ? 4 : 2,
          ink: null,
          stroke: false,
          misregister: false,
          sampleQuilt: false
        };
      }
      if (style === 'quilt') {
        return {
          weight: 700,
          fontPx: Math.round(fontPx * 1.1),
          caps: false,
          rotate: 0,
          baselineShift: 0,
          ink: null,
          stroke: true,
          misregister: false,
          sampleQuilt: true
        };
      }
    }
    return buildMergedEmphasisSpec(styles, seg, fontPx, dateKey, drawOptions);
  }

  function measureSegmentDisplayText(seg, spec) {
    return spec.caps ? String(seg.text || '').toUpperCase() : String(seg.text || '');
  }

  function measureSegmentWidth(mctx, display, spec) {
    const letterSpacing = -0.02;
    mctx.font = `${spec.weight} ${spec.fontPx}px ${FONT_SANS}`;
    let tw = 0;
    for (const ch of display) {
      tw += mctx.measureText(ch).width + spec.fontPx * letterSpacing;
    }
    if (display.length) tw -= spec.fontPx * letterSpacing;
    return Math.max(0, tw);
  }

  function buildLineSegmentsForMeasure(ln, layoutOptions) {
    const words = layoutOptions?.emphasisWords;
    if (words && words.length && QKE && typeof QKE.buildLineSegments === 'function') {
      return QKE.buildLineSegments(ln, words);
    }
    return [{ text: ln, emphasis: false, rank: -1 }];
  }

  function measureQuoteLineFromSegments(mctx, segments, fontPx, layoutOptions) {
    const letterSpacing = -0.02;
    const dateKey = layoutOptions?.dateKey;
    const emphasisStyle = layoutOptions?.emphasisStyle || 'poster';
    let tw = 0;
    let maxVisualH = 0;
    for (const seg of segments) {
      const spec = segmentVisualSpec(seg, fontPx, dateKey, emphasisStyle, layoutOptions || {});
      const display = measureSegmentDisplayText(seg, spec);
      tw += measureSegmentWidth(mctx, display, spec);
      mctx.font = `${spec.weight} ${spec.fontPx}px ${FONT_SANS}`;
      const sample = mctx.measureText(display || 'Mgypq');
      const ascent = sample.actualBoundingBoxAscent ?? spec.fontPx * 0.82;
      const descent = sample.actualBoundingBoxDescent ?? spec.fontPx * 0.22;
      const visualH = Math.ceil(ascent + descent) + Math.abs(spec.baselineShift || 0);
      maxVisualH = Math.max(maxVisualH, visualH);
    }
    const boxH = Math.max(maxVisualH, Math.ceil(fontPx * 1.02));
    const lh = fontPx * QUOTE_LINE_HEIGHT_MULT;
    const stride = lineStridePx(fontPx, boxH);
    return { tw: Math.max(0, tw), lh, boxH, stride, visualH: maxVisualH, segments };
  }

  function measureQuoteLine(mctx, ln, fontPx, layoutOptions) {
    const segments = buildLineSegmentsForMeasure(ln, layoutOptions);
    const hasKeywordList = (layoutOptions?.emphasisWords || []).length > 0;
    if (hasKeywordList || segments.some((s) => s.emphasis)) {
      return measureQuoteLineFromSegments(mctx, segments, fontPx, layoutOptions);
    }
    const font = `700 ${fontPx}px ${FONT_SANS}`;
    mctx.font = font;
    const letterSpacing = -0.02;
    let tw = 0;
    for (const ch of ln) {
      tw += mctx.measureText(ch).width + fontPx * letterSpacing;
    }
    tw -= fontPx * letterSpacing;
    const sample = mctx.measureText(ln || 'Mgypq');
    const ascent = sample.actualBoundingBoxAscent ?? fontPx * 0.82;
    const descent = sample.actualBoundingBoxDescent ?? fontPx * 0.22;
    const visualH = Math.ceil(ascent + descent);
    const boxH = Math.max(visualH, Math.ceil(fontPx * 1.02));
    const lh = fontPx * QUOTE_LINE_HEIGHT_MULT;
    const stride = lineStridePx(fontPx, boxH);
    return { tw: Math.max(0, tw), lh, boxH, stride, visualH, segments };
  }

  function sampleQuiltColorAt(ctx, x, y) {
    try {
      const px = Math.max(0, Math.min(Math.round(x), (ctx.canvas?.width || 1) - 1));
      const py = Math.max(0, Math.min(Math.round(y), (ctx.canvas?.height || 1) - 1));
      const d = ctx.getImageData(px, py, 1, 1).data;
      return `rgb(${d[0]},${d[1]},${d[2]})`;
    } catch (_) {
      return null;
    }
  }

  function drawSegmentChars(ctx, display, spec, cx, y, letterSpacing, fillStyle, canvasX, canvasY) {
    let x = cx;
    const by = y + (spec.baselineShift || 0);
    ctx.font = `${spec.weight} ${spec.fontPx}px ${FONT_SANS}`;
    if (spec.misregister && fillStyle) {
      ctx.save();
      ctx.fillStyle = fillStyle === '#111111' ? 'rgba(248,246,242,0.55)' : 'rgba(17,17,17,0.35)';
      ctx.translate(1.5, 1.5);
      let mx = x;
      for (const ch of display) {
        ctx.fillText(ch, mx, by);
        mx += ctx.measureText(ch).width + spec.fontPx * letterSpacing;
      }
      ctx.restore();
    }
    if (spec.stroke) {
      ctx.save();
      ctx.lineWidth = Math.max(2, Math.round(spec.fontPx * 0.04));
      ctx.strokeStyle = fillStyle === '#111111' ? '#f8f6f2' : '#111111';
      ctx.lineJoin = 'round';
      let sx = x;
      for (const ch of display) {
        ctx.strokeText(ch, sx, by);
        sx += ctx.measureText(ch).width + spec.fontPx * letterSpacing;
      }
      ctx.restore();
    }
    let ink = spec.ink || fillStyle;
    if (spec.sampleQuilt && canvasX != null && canvasY != null) {
      const sampled = sampleQuiltColorAt(ctx, canvasX + x, canvasY + by);
      if (sampled) ink = sampled;
    }
    ctx.fillStyle = ink || fillStyle;
    for (const ch of display) {
      ctx.fillText(ch, x, by);
      x += ctx.measureText(ch).width + spec.fontPx * letterSpacing;
    }
    return x;
  }

  function horizontalOverlap(a, b, padX) {
    const p = padX || 0;
    return !(a.right + p < b.left || a.left > b.right + p);
  }

  function linesTooClose(a, b, minGap) {
    if (!horizontalOverlap(a, b, 24)) return false;
    return !(a.bottom + minGap <= b.top || b.bottom + minGap <= a.top);
  }

  function rectArea(r) {
    return Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
  }

  function overlapArea(a, b) {
    const ow = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const oh = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return ow * oh;
  }

  function speakerBoxFromRect(speakerRect) {
    if (!speakerRect || speakerRect.width <= 0 || speakerRect.height <= 0) return null;
    return lineBox(speakerRect.x, speakerRect.y, speakerRect.width, speakerRect.height);
  }

  function speakerTextOverlapFraction(textBox, speakerRect) {
    const speakerBox = speakerBoxFromRect(speakerRect);
    if (!speakerBox) return 0;
    const inter = overlapArea(textBox, speakerBox);
    if (inter <= 0) return 0;
    return inter / Math.max(1, rectArea(textBox));
  }

  /** Face/core zone — line center must not sit here (prevents whole letters on portrait). */
  function getSpeakerCoreRect(speakerRect) {
    const insetX = speakerRect.width * 0.2;
    const insetY = speakerRect.height * 0.18;
    return lineBox(
      speakerRect.x + insetX,
      speakerRect.y + insetY,
      speakerRect.width - insetX * 2,
      speakerRect.height - insetY * 2
    );
  }

  function textCenterOnSpeakerCore(textBox, speakerRect) {
    if (!speakerRect) return false;
    const core = getSpeakerCoreRect(speakerRect);
    const c = centerOfBox(textBox);
    return c.x >= core.left && c.x <= core.right && c.y >= core.top && c.y <= core.bottom;
  }

  function speakerCollageOverlapOk(textBox, speakerRect) {
    if (!speakerRect) return true;
    if (textCenterOnSpeakerCore(textBox, speakerRect)) return false;
    return speakerTextOverlapFraction(textBox, speakerRect) <= SPEAKER_TEXT_MAX_OVERLAP_FRAC;
  }

  /** Keep line 1 → 2 → 3 vertical order; no letter-on-letter between consecutive lines. */
  function enforceOrderedStack(items, w, h) {
    for (let pass = 0; pass < items.length * 3; pass++) {
      let moved = false;
      for (let i = 1; i < items.length; i++) {
        const prev = items[i - 1];
        const cur = items[i];
        const prevBox = aabbForTopLeftRotated(prev.x, prev.y, prev.tw, prev.boxH, prev.angle || 0);
        const curBox = aabbForTopLeftRotated(cur.x, cur.y, cur.tw, cur.boxH, cur.angle || 0);
        const gap = Math.max(
          QUOTE_LINE_MIN_GAP_PX,
          Math.round(((prev.fontPx || 48) + (cur.fontPx || 48)) * 0.1)
        );
        const minTop = prevBox.bottom + gap;
        if (curBox.top < minTop - 0.5 || linesTooClose(prevBox, curBox, gap)) {
          const shift = minTop - cur.y;
          if (shift > 0.5) {
            shiftQuoteLinesDown(items, i, shift, w, h);
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return items;
  }

  /** Move the whole quote stack together so speaker fixes never crush lines together. */
  function resolveSpeakerCollageOverlap(items, speakerRect, w, h) {
    if (!speakerRect || !items.length) return items;
    for (let pass = 0; pass < 48; pass++) {
      let needsFix = false;
      for (const item of items) {
        const box = aabbForTopLeftRotated(item.x, item.y, item.tw, item.boxH, item.angle || 0);
        if (!speakerCollageOverlapOk(box, speakerRect)) {
          needsFix = true;
          break;
        }
      }
      if (!needsFix) break;
      shiftQuoteLinesDown(items, 0, -14, w, h);
      enforceOrderedStack(items, w, h);
    }
    return enforceOrderedStack(items, w, h);
  }

  function resolvePlacementOverlaps(placements, w, h) {
    const items = [...placements];
    for (let pass = 0; pass < items.length * 4; pass++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          const boxA = aabbForTopLeftRotated(a.x, a.y, a.tw, a.boxH, a.angle || 0);
          const boxB = aabbForTopLeftRotated(b.x, b.y, b.tw, b.boxH, b.angle || 0);
          const gap = Math.max(
            QUOTE_LINE_MIN_GAP_PX,
            Math.round(((a.fontPx || 48) + (b.fontPx || 48)) * 0.06)
          );
          if (!linesTooClose(boxA, boxB, gap)) continue;
          const lower = a.y <= b.y ? b : a;
          const upper = lower === b ? a : b;
          const upperBox = aabbForTopLeftRotated(upper.x, upper.y, upper.tw, upper.boxH, upper.angle || 0);
          const lowerBox = aabbForTopLeftRotated(lower.x, lower.y, lower.tw, lower.boxH, lower.angle || 0);
          const shift = upperBox.bottom + gap - lowerBox.top;
          if (shift > 0.5) {
            const clamped = clampTopLeftIntoCanvas(
              w,
              h,
              lower.x,
              lower.y + shift,
              lower.tw,
              lower.boxH,
              lower.angle || 0
            );
            lower.y = clamped.y;
            lower.x = clamped.x;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return items;
  }

  /** Axis-aligned bounds for text drawn at (x,y) top-left with rotation around that point. */
  function aabbForTopLeftRotated(x, y, tw, boxH, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const corners = [
      [0, 0],
      [tw, 0],
      [tw, boxH],
      [0, boxH]
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of corners) {
      const rx = px * c - py * s;
      const ry = px * s + py * c;
      minX = Math.min(minX, rx);
      maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry);
      maxY = Math.max(maxY, ry);
    }
    return lineBox(x + minX, y + minY, maxX - minX, maxY - minY);
  }

  function getCanvasMargins(w, h) {
    const side = Math.max(52, Math.round(w * 0.058));
    return {
      left: side,
      right: side,
      top: Math.max(50, Math.round(h * 0.044)),
      bottom: Math.max(58, Math.round(h * 0.052))
    };
  }

  const WORDMARK_CORNERS = ['tl', 'tr', 'bl', 'br'];

  function getWordmarkDrawSize(w, h, im) {
    const targetW = Math.round(w * 0.09);
    const aspect =
      (im.naturalWidth || im.width) / Math.max(1, im.naturalHeight || im.height);
    const targetH = Math.round(targetW / aspect);
    const margin = getCanvasMargins(w, h).left;
    return { targetW, targetH, margin };
  }

  function wordmarkDrawRect(corner, w, h, targetW, targetH, margin) {
    switch (corner) {
      case 'tr':
        return { x: w - margin - targetW, y: margin };
      case 'bl':
        return { x: margin, y: h - margin - targetH };
      case 'br':
        return { x: w - margin - targetW, y: h - margin - targetH };
      default:
        return { x: margin, y: margin };
    }
  }

  function totalOverlapWithRects(box, rects) {
    let sum = 0;
    for (const r of rects) sum += overlapArea(box, r);
    return sum;
  }

  function collectWordmarkOccupancy(placements, speakerRect, creditRect) {
    const rects = [];
    for (const p of placements) {
      rects.push(
        inflateRect(
          aabbForTopLeftRotated(p.x, p.y, p.tw, p.boxH, p.angle || 0),
          12
        )
      );
    }
    const speakerBox = speakerBoxFromRect(speakerRect);
    if (speakerBox) rects.push(inflateRect(speakerBox, 20));
    if (creditRect) rects.push(inflateRect(creditRect, 12));
    return rects;
  }

  function pickWordmarkCorner(occupied, w, h, targetW, targetH, margin) {
    let best = { corner: 'tl', x: margin, y: margin, score: Infinity };
    for (const corner of WORDMARK_CORNERS) {
      const pos = wordmarkDrawRect(corner, w, h, targetW, targetH, margin);
      const wmBox = lineBox(pos.x, pos.y, targetW, targetH);
      const wmArea = Math.max(1, targetW * targetH);
      const overlap = totalOverlapWithRects(wmBox, occupied);
      const frac = overlap / wmArea;
      const wmCenter = centerOfBox(wmBox);
      let minDist2 = Infinity;
      for (const occ of occupied) {
        minDist2 = Math.min(minDist2, dist2(wmCenter, centerOfBox(occ)));
      }
      const clearBonus = occupied.length ? -Math.sqrt(minDist2) * 0.12 : 0;
      const score = overlap * 1e6 + frac * 1e3 + clearBonus;
      if (score < best.score) {
        best = { corner, x: pos.x, y: pos.y, score };
      }
    }
    return best;
  }

  function clampTopLeftIntoCanvas(w, h, x, y, tw, boxH, angle) {
    let bx = x;
    let by = y;
    const m = getCanvasMargins(w, h);
    for (let pass = 0; pass < 32; pass++) {
      const box = aabbForTopLeftRotated(bx, by, tw, boxH, angle);
      let dx = 0;
      let dy = 0;
      if (box.left < m.left) dx = m.left - box.left;
      if (box.right > w - m.right) dx = (w - m.right) - box.right;
      if (box.top < m.top) dy = m.top - box.top;
      if (box.bottom > h - m.bottom) dy = (h - m.bottom) - box.bottom;
      if (dx === 0 && dy === 0) break;
      bx += dx;
      by += dy;
    }
    return { x: bx, y: by };
  }

  function centerOfBox(box) {
    return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  }

  function dist2(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  /** Playful L / C / R rhythm (stack order preserved). */
  const LINE_ALIGN_PLAYFUL = ['left', 'right', 'center', 'left', 'center', 'right', 'center', 'left'];

  function pickLineAlignCandidates(lineIndex, dateKey) {
    const rnd = lineRng(dateKey, lineIndex + 31);
    const primary = LINE_ALIGN_PLAYFUL[lineIndex % LINE_ALIGN_PLAYFUL.length];
    const all = ['left', 'center', 'right'];
    const alts = all.filter((a) => a !== primary);
    const secondary = alts[Math.floor(rnd() * alts.length)];
    const tertiary = alts[1 - alts.indexOf(secondary)];
    return [primary, secondary, tertiary];
  }

  function topLeftXForAlign(align, tw, w, padX, rnd) {
    const inner = w - padX * 2;
    const jitter = (rnd() - 0.5) * inner * 0.07;
    if (align === 'center') return padX + (inner - tw) / 2 + jitter;
    if (align === 'right') return padX + inner - tw + jitter;
    return padX + Math.max(0, jitter * 0.35);
  }

  function shiftQuoteLinesDown(out, fromIndex, deltaY, w, h) {
    for (let i = fromIndex; i < out.length; i++) {
      const p = out[i];
      const c = clampTopLeftIntoCanvas(w, h, p.x, p.y + deltaY, p.tw, p.boxH, p.angle || 0);
      p.x = c.x;
      p.y = c.y;
    }
  }

  function isStoryLayout(layoutW, layoutH) {
    const lw = layoutW || 1080;
    const lh = layoutH || 1350;
    return lh >= 1600 && lw / lh < 0.7;
  }

  function quoteStackBounds(items) {
    let minTop = Infinity;
    let maxBottom = -Infinity;
    for (const p of items) {
      const box = aabbForTopLeftRotated(p.x, p.y, p.tw, p.boxH, p.angle || 0);
      minTop = Math.min(minTop, box.top);
      maxBottom = Math.max(maxBottom, box.bottom);
    }
    if (!Number.isFinite(minTop)) return { minTop: 0, maxBottom: 0, height: 0 };
    return { minTop, maxBottom, height: maxBottom - minTop };
  }

  /** Story 9:16 — center the quote block in the band above the speaker. */
  function centerQuoteStackForStory(items, w, h, layoutH, speakerRect) {
    if (!items.length) return items;
    const { minTop, height: stackH } = quoteStackBounds(items);
    if (stackH <= 0) return items;

    const edge = getCanvasMargins(w, h);
    const zoneTop = edge.top + Math.round(layoutH * 0.05);
    let zoneBottom = h - edge.bottom - Math.round(layoutH * 0.1);
    if (speakerRect && speakerRect.height > 0) {
      zoneBottom = Math.min(zoneBottom, speakerRect.y - Math.round(layoutH * 0.035));
    }
    const zoneH = Math.max(stackH + 32, zoneBottom - zoneTop);
    const targetTop = zoneTop + (zoneH - stackH) / 2;
    const shift = targetTop - minTop;
    if (Math.abs(shift) < 6) return items;
    shiftQuoteLinesDown(items, 0, shift, w, h);
    return items;
  }

  /** Conservative stacked height (max line tier, no horizontal stagger). */
  function measureQuoteStackHeightAtBase(mctx, lines, basePx, w, h, measureOpts) {
    const edge = getCanvasMargins(w, h);
    const maxW = w - edge.left - edge.right;
    const tierMax = Math.max(...LINE_SIZE_TIERS);
    let cursorY = edge.top + 8;

    for (let i = 0; i < lines.length; i++) {
      let fontPx = Math.round(basePx * tierMax);
      let measured = measureQuoteLine(mctx, lines[i], fontPx, measureOpts);
      if (measured.tw > maxW) {
        fontPx = Math.max(44, Math.round(fontPx * (maxW / measured.tw)));
        measured = measureQuoteLine(mctx, lines[i], fontPx, measureOpts);
      }
      cursorY += measured.boxH + lineStridePx(fontPx, measured.boxH);
    }
    return cursorY - (edge.top + 8);
  }

  function speakerQuoteVerticalBudget(w, h, layoutH, speakerRect) {
    const edge = getCanvasMargins(w, h);
    const top = edge.top + 8;
    let bottom = h - edge.bottom - Math.round((layoutH || h) * 0.08);
    if (speakerRect && speakerRect.height > 0) {
      bottom = Math.min(bottom, speakerRect.y - Math.round((layoutH || h) * 0.04));
    }
    return Math.max(80, bottom - top);
  }

  function scaleBasePxForSpeakerFit(mctx, lines, basePx, w, h, layoutH, speakerRect, measureOpts) {
    if (!speakerRect || !lines.length) return basePx;
    const budget = speakerQuoteVerticalBudget(w, h, layoutH, speakerRect);
    const estH = measureQuoteStackHeightAtBase(mctx, lines, basePx, w, h, measureOpts);
    if (estH <= budget * 0.94) return basePx;
    const fitScale = (budget * 0.9) / Math.max(1, estH);
    const minBase = Math.max(44, Math.round(basePx * 0.55));
    return Math.max(minBase, Math.round(basePx * fitScale));
  }

  function quoteStackSpeakerPressure(placed, speakerRect) {
    if (!speakerRect || !placed.length) return { ok: true };
    let maxOverlap = 0;
    let coreHit = false;
    let bottomBelowSpeaker = false;
    const speakerTop = speakerRect.y;

    for (const p of placed) {
      const box = aabbForTopLeftRotated(p.x, p.y, p.tw, p.boxH, p.angle || 0);
      if (textCenterOnSpeakerCore(box, speakerRect)) coreHit = true;
      maxOverlap = Math.max(maxOverlap, speakerTextOverlapFraction(box, speakerRect));
      if (box.bottom > speakerTop + 6) bottomBelowSpeaker = true;
    }

    const ok =
      !coreHit &&
      maxOverlap <= SPEAKER_TEXT_MAX_OVERLAP_FRAC * 0.6 &&
      !bottomBelowSpeaker;
    return { ok, maxOverlap, coreHit, bottomBelowSpeaker };
  }

  /**
   * Collage placement with strict top-to-bottom line order (line 1, then 2, then 3…).
   * Horizontal stagger + size variety only; Y always advances down the stack.
   */
  function planSpreadQuotePositionsAtBase(
    lines,
    w,
    h,
    layoutW,
    layoutH,
    speakerRect,
    dateKey,
    layoutOptions,
    basePx
  ) {
    const edge = getCanvasMargins(w, h);
    const padX = edge.left;
    const maxW = w - edge.left - edge.right;
    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return [];

    const measureOpts = {
      emphasisWords: layoutOptions?.emphasisWords,
      emphasisStyle: layoutOptions?.emphasisStyle || 'poster',
      dateKey,
      speakerWashColor: layoutOptions?.speakerWashColor
    };

    const minLinePx = speakerRect ? 44 : 56;
    const out = [];
    let cursorY = edge.top + 8;

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      let fontPx = pickLineFontPx(basePx, i, dateKey);
      let measured = measureQuoteLine(mctx, ln, fontPx, measureOpts);
      let tw = measured.tw;
      let boxH = measured.boxH;
      if (tw > maxW) {
        fontPx = Math.max(minLinePx, Math.round(fontPx * (maxW / tw)));
        measured = measureQuoteLine(mctx, ln, fontPx, measureOpts);
        tw = measured.tw;
        boxH = measured.boxH;
      }

      const rnd = lineRng(dateKey, i + 17);
      const useAngle = rnd() < 0.22;
      const angle = useAngle ? (rnd() - 0.5) * 0.052 : 0;
      const alignCandidates = pickLineAlignCandidates(i, dateKey);

      let best = null;
      let bestScore = Infinity;

      let minY = cursorY;
      if (out.length) {
        const prev = out[out.length - 1];
        const prevBox = aabbForTopLeftRotated(
          prev.x,
          prev.y,
          prev.tw,
          prev.boxH,
          prev.angle || 0
        );
        const gap = Math.max(
          QUOTE_LINE_MIN_GAP_PX,
          Math.round(((prev.fontPx || 48) + fontPx) * 0.1)
        );
        minY = prevBox.bottom + gap;
      }

      for (const align of alignCandidates) {
        let x = topLeftXForAlign(align, tw, w, padX, rnd);
        x = Math.max(edge.left, Math.min(w - edge.right - tw, x));
        let y = Math.max(cursorY, minY);
        const clamped = clampTopLeftIntoCanvas(w, h, x, y, tw, boxH, angle);
        x = clamped.x;
        y = clamped.y;

        const candidate = aabbForTopLeftRotated(x, y, tw, boxH, angle);
        if (textCenterOnSpeakerCore(candidate, speakerRect)) continue;
        const speakerOverlapFrac = speakerTextOverlapFraction(candidate, speakerRect);
        if (speakerOverlapFrac > SPEAKER_TEXT_MAX_OVERLAP_FRAC) continue;

        const alignBonus =
          align === LINE_ALIGN_PLAYFUL[i % LINE_ALIGN_PLAYFUL.length] ? -6 : 4;
        const score = speakerOverlapFrac * 400 + alignBonus + rnd() * 0.5;
        if (score < bestScore) {
          bestScore = score;
          best = { line: ln, x, y, tw, boxH, fontPx, angle, align };
        }
      }

      if (!best) {
        const fallbackAlign = LINE_ALIGN_PLAYFUL[i % LINE_ALIGN_PLAYFUL.length];
        let x = topLeftXForAlign(fallbackAlign, tw, w, padX, rnd);
        x = Math.max(edge.left, Math.min(w - edge.right - tw, x));
        const clamped = clampTopLeftIntoCanvas(w, h, x, Math.max(cursorY, minY), tw, boxH, angle);
        best = {
          line: ln,
          x: clamped.x,
          y: clamped.y,
          tw,
          boxH,
          fontPx,
          angle,
          align: fallbackAlign
        };
      }

      out.push(best);
      const box = aabbForTopLeftRotated(best.x, best.y, best.tw, best.boxH, best.angle || 0);
      cursorY = box.bottom + lineStridePx(fontPx, box.bottom - best.y);
    }

    enforceOrderedStack(out, w, h);

    if (isStoryLayout(layoutW, layoutH)) {
      centerQuoteStackForStory(out, w, h, layoutH, speakerRect);
      enforceOrderedStack(out, w, h);
    }

    for (const p of out) {
      const final = clampTopLeftIntoCanvas(w, h, p.x, p.y, p.tw, p.boxH, p.angle || 0);
      p.x = final.x;
      p.y = final.y;
    }

    let placed = resolveSpeakerCollageOverlap(enforceOrderedStack(out, w, h), speakerRect, w, h);

    if (isStoryLayout(layoutW, layoutH)) {
      for (const p of placed) {
        const final = clampTopLeftIntoCanvas(w, h, p.x, p.y, p.tw, p.boxH, p.angle || 0);
        p.x = final.x;
        p.y = final.y;
      }
    }

    return placed;
  }

  function planSpreadQuotePositions(lines, w, h, layoutW, layoutH, speakerRect, dateKey, layoutOptions) {
    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return [];

    const measureOpts = {
      emphasisWords: layoutOptions?.emphasisWords,
      emphasisStyle: layoutOptions?.emphasisStyle || 'poster',
      dateKey,
      speakerWashColor: layoutOptions?.speakerWashColor
    };

    let basePx = quoteFontPx(lines.length, layoutW, layoutH);
    if (speakerRect) {
      basePx = scaleBasePxForSpeakerFit(
        mctx,
        lines,
        basePx,
        w,
        h,
        layoutH,
        speakerRect,
        measureOpts
      );
    }

    let placed = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      placed = planSpreadQuotePositionsAtBase(
        lines,
        w,
        h,
        layoutW,
        layoutH,
        speakerRect,
        dateKey,
        layoutOptions,
        basePx
      );
      if (!speakerRect || quoteStackSpeakerPressure(placed, speakerRect).ok) break;
      basePx = Math.max(44, Math.round(basePx * 0.88));
    }
    return placed;
  }

  function resolveTextColor(mode, luminance) {
    if (mode === 'white') return CREAM_INK;
    if (mode === 'black') return BLACK_INK;
    return luminance < 0.55 ? CREAM_INK : BLACK_INK;
  }

  function parseHexRgb(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /** Trim dashed frame baked into portal-our-daily-quilt.png */
  const WORDMARK_SOURCE_INSET_FRAC = 0.18;

  /** Shave rectangular ring strokes (dashed asset border) while keeping letterforms. */
  function removeWordmarkOuterFrame(d, w, h) {
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = d[(y * w + x) * 4 + 3];
        if (a > 18) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return;
    const ring = Math.max(3, Math.round(Math.min(w, h) * 0.07));
    const innerLeft = minX + ring;
    const innerTop = minY + ring;
    const innerRight = maxX - ring;
    const innerBottom = maxY - ring;
    if (innerRight <= innerLeft || innerBottom <= innerTop) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const onRing =
          x < innerLeft || x > innerRight || y < innerTop || y > innerBottom;
        if (!onRing) continue;
        const i = (y * w + x) * 4 + 3;
        if (d[i] < 200) d[i] = 0;
      }
    }
  }

  /**
   * Portal wordmark PNG is light artwork on black. Crop off asset border, key bg, tint to ink.
   */
  function drawWordmarkImage(ctx, im, x, y, drawW, drawH, ink) {
    const target = parseHexRgb(ink) || parseHexRgb(BLACK_INK);
    const off = document.createElement('canvas');
    off.width = Math.max(1, drawW);
    off.height = Math.max(1, drawH);
    const octx = off.getContext('2d');
    if (!octx || !target) {
      ctx.drawImage(im, x, y, drawW, drawH);
      return;
    }
    const sw = Math.max(1, im.naturalWidth || im.width);
    const sh = Math.max(1, im.naturalHeight || im.height);
    const inset = Math.round(Math.min(sw, sh) * WORDMARK_SOURCE_INSET_FRAC);
    const sx = inset;
    const sy = inset;
    const sWidth = Math.max(1, sw - inset * 2);
    const sHeight = Math.max(1, sh - inset * 2);
    octx.drawImage(im, sx, sy, sWidth, sHeight, 0, 0, drawW, drawH);
    const imgData = octx.getImageData(0, 0, drawW, drawH);
    const d = imgData.data;
    const bgCutoff = 20;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const srcA = d[i + 3] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum <= bgCutoff) {
        d[i + 3] = 0;
        continue;
      }
      const mask = Math.min(255, Math.round(lum * srcA));
      if (mask < 6) {
        d[i + 3] = 0;
        continue;
      }
      d[i] = target.r;
      d[i + 1] = target.g;
      d[i + 2] = target.b;
      d[i + 3] = mask;
    }
    removeWordmarkOuterFrame(d, drawW, drawH);
    octx.putImageData(imgData, 0, 0);
    ctx.drawImage(off, x, y);
  }

  function drawQuiltLayer(ctx, quiltImg, w, h, washOpacity) {
    const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    ctx.fillStyle = '#f6f4f1';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const rect = getAspectSafeCanvasRect(iw, ih, w, h, 'cover');
    ctx.drawImage(quiltImg, rect.x, rect.y, rect.width, rect.height);
    const luminance = sampleBandLuminance(ctx, w, h, 0.06, 0.62);
    const wash = Math.max(0, Math.min(1, Number(washOpacity) || 0.3));
    ctx.fillStyle = `rgba(255, 248, 240, ${wash})`;
    ctx.fillRect(0, 0, w, h);
    return { rect, luminance };
  }

  function drawSpreadQuoteLayer(ctx, lines, w, h, options) {
    const textColor = resolveTextColor(options.textColor || 'auto', options.luminance ?? 0.7);
    const layoutOptions = {
      emphasisWords: options.emphasisWords,
      emphasisStyle: options.emphasisStyle || 'poster',
      dateKey: options.dateKey,
      speakerWashColor: options.speakerWashColor
    };
    const placements = planSpreadQuotePositions(
      lines,
      w,
      h,
      w,
      h,
      options.speakerRect,
      options.dateKey,
      layoutOptions
    );
    const letterSpacing = -0.02;
    const emphasisStyle = layoutOptions.emphasisStyle;
    const dateKey = options.dateKey;

    ctx.save();
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const drawLineRotated = (ln, p) => {
      const fontPx = p.fontPx;
      const segments = buildLineSegmentsForMeasure(ln, layoutOptions);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle || 0);
      let cx = 0;
      const y = 0;
      for (const seg of segments) {
        const spec = segmentVisualSpec(seg, fontPx, dateKey, emphasisStyle, layoutOptions);
        const display = measureSegmentDisplayText(seg, spec);
        if (!display) continue;
        if (spec.rotate) {
          ctx.save();
          const midX = cx + measureSegmentWidth(ctx, display, spec) / 2;
          ctx.translate(midX, y + (spec.baselineShift || 0));
          ctx.rotate(spec.rotate);
          ctx.translate(-midX, -(y + (spec.baselineShift || 0)));
          cx = drawSegmentChars(
            ctx,
            display,
            spec,
            cx,
            y,
            letterSpacing,
            textColor,
            p.x + cx,
            p.y + y
          );
          ctx.restore();
        } else {
          cx = drawSegmentChars(
            ctx,
            display,
            spec,
            cx,
            y,
            letterSpacing,
            textColor,
            p.x + cx,
            p.y + y
          );
        }
      }
      ctx.restore();
    };

    for (const p of placements) {
      drawLineRotated(p.line, p);
    }
    ctx.restore();
    return { textColor, placements };
  }

  function measureCreditRect(ctx, author, w, h, speakerRect) {
    const credit = String(author || '').trim();
    if (!credit) return null;
    const fontPx = 72;
    const gapBelowSpeaker = Math.round(fontPx * 0.62) + 28;
    ctx.save();
    ctx.font = `300 ${fontPx}px ${FONT_SANS}`;
    const tw = ctx.measureText(credit).width;
    ctx.restore();

    const m = getCanvasMargins(w, h);
    let cx = w / 2;
    let y = h * 0.88;
    if (speakerRect && speakerRect.width > 0 && speakerRect.height > 0) {
      cx = speakerRect.x + speakerRect.width / 2;
      y = speakerRect.y + speakerRect.height + gapBelowSpeaker + fontPx / 2;
    }
    y = Math.min(h - m.bottom - fontPx / 2, y);
    y = Math.max(m.top + fontPx / 2, y);
    cx = Math.max(m.left + tw / 2, Math.min(w - m.right - tw / 2, cx));
    return lineBox(cx - tw / 2, y - fontPx / 2, tw, fontPx);
  }

  function drawCreditLayer(ctx, author, w, h, fillColor, speakerRect) {
    const credit = String(author || '').trim();
    if (!credit) return null;
    const fontPx = 72;
    const box = measureCreditRect(ctx, author, w, h, speakerRect);
    if (!box) return null;
    const cx = (box.left + box.right) / 2;
    const y = (box.top + box.bottom) / 2;
    ctx.save();
    ctx.font = `300 ${fontPx}px ${FONT_SANS}`;
    ctx.fillStyle = fillColor || '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(credit, cx, y);
    ctx.restore();
    return box;
  }

  function resolveAssetUrl(url) {
    const u = String(url || '').trim();
    if (!u) return u;
    if (/^(?:https?:|data:|blob:)/i.test(u)) return u;
    try {
      return new URL(u, global.location?.href || '').href;
    } catch (_) {
      return u;
    }
  }

  async function drawWordmarkAtBestCorner(ctx, w, h, wordmarkUrl, occupied, ink) {
    const url = resolveAssetUrl(wordmarkUrl || WORDMARK_DEFAULT);
    let im;
    try {
      im = await loadImageRequired(url);
    } catch (_) {
      return;
    }
    const { targetW, targetH, margin } = getWordmarkDrawSize(w, h, im);
    const pick = pickWordmarkCorner(occupied || [], w, h, targetW, targetH, margin);
    drawWordmarkImage(ctx, im, pick.x, pick.y, targetW, targetH, ink || BLACK_INK);
  }

  /**
   * @param {object} options
   * @param {number} options.width
   * @param {number} options.height
   * @param {HTMLImageElement|string} options.quiltImage
   * @param {string[]} options.quoteLines
   * @param {string} [options.author]
   * @param {string} [options.speakerImageUrl]
   * @param {number} [options.washOpacity]
   * @param {'auto'|'black'|'white'} [options.textColor]
   * @param {string} [options.apiBase]
   * @param {string} [options.wordmarkUrl]
   * @param {string} [options.speakerWashColor] — hex wash for cutout card (e.g. popular quilt color)
   * @param {'left'|'center'|'right'} [options.speakerAlign] — horizontal anchor along bottom edge
   * @param {string} [options.dateKey] — seeds spread quote positions
   * @param {string[]} [options.emphasisWords] — 1–3 keywords or phrases to emphasize (exact quote substring)
   * @param {'auto'|string|string[]} [options.emphasisStyle] — one preset, comma list, or array; combine poster+collage+quilt+angle
   */
  async function composeQuoteCollage(options) {
    const w = options.width || 1080;
    const h = options.height || 1350;
    const washOpacity = options.washOpacity != null ? options.washOpacity : 0.3;
    const speakerWashColor = options.speakerWashColor || '#ea9b9a';
    const dateKey = options.dateKey || new Date().toISOString().split('T')[0];
    const lines = Array.isArray(options.quoteLines)
      ? options.quoteLines.map((l) => String(l).trim()).filter(Boolean)
      : [];

    let quiltImg = options.quiltImage;
    if (typeof quiltImg === 'string') {
      quiltImg = await loadImageRequired(quiltImg);
    }
    if (!quiltImg) throw new Error('Quilt image required');

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2d unavailable');

    const { luminance } = drawQuiltLayer(ctx, quiltImg, w, h, washOpacity);
    const textColorMode = options.textColor || 'auto';
    const resolvedInk = resolveTextColor(textColorMode, luminance);

    const speakerUrl = String(options.speakerImageUrl || '').trim();
    const speakerAlign = normalizeSpeakerAlign(options.speakerAlign);
    let speakerImg = null;
    let speakerRect = estimateSpeakerRectWithoutImage(w, h, speakerAlign);
    if (speakerUrl) {
      speakerImg = await loadImage(speakerUrl, options.apiBase);
      if (speakerImg) speakerRect = getSpeakerDrawRect(speakerImg, w, h, speakerAlign);
    }

    let quotePlacements = [];
    if (lines.length) {
      const spread = drawSpreadQuoteLayer(ctx, lines, w, h, {
        textColor: textColorMode,
        luminance,
        speakerRect,
        dateKey,
        emphasisWords: options.emphasisWords,
        emphasisStyle: options.emphasisStyle,
        speakerWashColor
      });
      quotePlacements = spread.placements || [];
    }

    if (speakerImg && speakerRect) {
      drawSpeakerCutoutCard(ctx, speakerImg, speakerRect, speakerWashColor, dateKey);
    }

    const creditRect = measureCreditRect(ctx, options.author, w, h, speakerRect);
    drawCreditLayer(ctx, options.author, w, h, resolvedInk, speakerRect);
    const wordmarkOccupied = collectWordmarkOccupancy(quotePlacements, speakerRect, creditRect);
    await drawWordmarkAtBestCorner(ctx, w, h, options.wordmarkUrl, wordmarkOccupied, resolvedInk);

    return canvas;
  }

  function canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        type,
        quality
      );
    });
  }

  const api = {
    FORMATS,
    FONT_SANS,
    WORDMARK_DEFAULT,
    getAspectSafeCanvasRect,
    splitQuoteIntoEditorialLines,
    QUOTE_LINE_HEIGHT_MULT,
    composeQuoteCollage,
    canvasToBlob,
    loadImage,
    getSpeakerImageCandidates,
    getSpeakerDrawRect,
    drawSpeakerCutoutCard,
    planSpreadQuotePositions,
    parseEmphasisWordsInput: QKE ? QKE.parseEmphasisWordsInput : null,
    suggestKeywordsHeuristic: QKE ? QKE.suggestKeywordsHeuristic : null,
    normalizeEmphasisWords: QKE ? QKE.normalizeEmphasisWords : null
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.QuoteCollageCompose = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {});
