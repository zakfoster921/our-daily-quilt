/**
 * Warhol / xerox speaker cutout stack — shared by in-app card, Layout B, quote collage.
 * Layer order (bottom → top): scanner bed → cream mat → solid color wash → B/W portrait → grain.
 */
(function (root) {
  'use strict';

  const MAT_RGB = '255, 250, 236';
  const BAYER_4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  function createSeededRng(seedStr) {
    let rngSeed = 0;
    const s = String(seedStr || 'odq');
    for (let i = 0; i < s.length; i += 1) {
      rngSeed = (rngSeed + s.charCodeAt(i)) | 0;
    }
    return () => {
      rngSeed |= 0;
      rngSeed = (rngSeed + 0x6d2b79f5) | 0;
      let t = Math.imul(rngSeed ^ (rngSeed >>> 15), 1 | rngSeed);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function safeHex(hex, fallback = '#ea9b9a') {
    const v = String(hex || '').trim();
    return /^#[0-9A-Fa-f]{6}$/.test(v) ? v : fallback;
  }

  function parseSpeakerWashRgb(hex) {
    const safe = safeHex(hex);
    return {
      r: parseInt(safe.slice(1, 3), 16),
      g: parseInt(safe.slice(3, 5), 16),
      b: parseInt(safe.slice(5, 7), 16)
    };
  }

  function buildMisregistration(rng) {
    const pick = (spread, rot) => ({
      tx: (rng() - 0.5) * spread,
      ty: (rng() - 0.5) * spread * 0.85,
      rot: (rng() - 0.5) * rot,
      scale: 1 + (rng() - 0.5) * 0.024
    });
    return {
      neutral: pick(1.4, 0.36),
      /* Warhol screen — color plate visibly misregistered from B/W plate */
      wash: pick(16, 2.6),
      portrait: pick(1.2, 0.45),
      grain: pick(2.2, 0.84)
    };
  }

  function cssOffset(m, prefix) {
    const out = {};
    out[`${prefix}-tx`] = `${m.tx.toFixed(2)}%`;
    out[`${prefix}-ty`] = `${m.ty.toFixed(2)}%`;
    out[`${prefix}-rotate`] = `${m.rot.toFixed(2)}deg`;
    out[`${prefix}-scale`] = m.scale.toFixed(4);
    return out;
  }

  function buildSpeakerCutoutPlan({ width = 168, height = 200, washColor = '#ea9b9a', seed = 'odq' } = {}) {
    const rng = createSeededRng(`${seed}:speaker-cutout-plan`);
    const mis = buildMisregistration(rng);
    const wash = parseSpeakerWashRgb(washColor);
    const cssVars = {};
    Object.assign(
      cssVars,
      cssOffset(mis.neutral, '--speaker-cutout-neutral'),
      cssOffset(mis.wash, '--speaker-cutout-wash'),
      cssOffset(mis.portrait, '--speaker-cutout-portrait'),
      cssOffset(mis.grain, '--speaker-cutout-grain')
    );
    cssVars['--speaker-wash-color-fill'] = `rgba(${wash.r}, ${wash.g}, ${wash.b}, 0.88)`;
    cssVars['--speaker-cutout-wash-opacity'] = '0.92';
    cssVars['--speaker-cutout-portrait-opacity'] = '0.9';
    cssVars['--speaker-cutout-grain-opacity'] = '0.34';
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      washColor: safeHex(washColor),
      washFill: cssVars['--speaker-wash-color-fill'],
      mis,
      cssVars
    };
  }

  function applySpeakerCutoutPlanToElement(el, plan) {
    if (!el || !plan?.cssVars) return;
    Object.entries(plan.cssVars).forEach(([key, value]) => {
      el.style.setProperty(key, value);
    });
  }

  function maskCutoutFringe(d, width, height, isCutoutPng) {
    if (isCutoutPng) return;
    const pixelIsWhiteMatte = (r, g, b, a) => {
      if (a < 64) return false;
      const lum = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      return lum > 228 && sat < 38;
    };
    const pixelIsGreyHalo = (r, g, b, a) => {
      if (a < 48) return false;
      const lum = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      return lum > 88 && lum < 238 && sat < 52 && a < 252;
    };
    const inMarginBand = (x, y) =>
      x < width * 0.2 || x > width * 0.8 || y < height * 0.1 || y > height * 0.9;
    const pixelIsSubject = (r, g, b, a) =>
      a >= 52 && !pixelIsWhiteMatte(r, g, b, a) && !pixelIsGreyHalo(r, g, b, a);
    const keep = new Uint8Array(width * height);
    const x0 = Math.floor(width * 0.22);
    const x1 = Math.ceil(width * 0.78);
    const y0 = Math.floor(height * 0.12);
    const y1 = Math.ceil(height * 0.92);
    let seedX = -1;
    let seedY = -1;
    let bestLum = 999;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * width + x) * 4;
        if (!pixelIsSubject(d[i], d[i + 1], d[i + 2], d[i + 3])) continue;
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (lum < bestLum) {
          bestLum = lum;
          seedX = x;
          seedY = y;
        }
      }
    }
    if (seedX < 0) return;
    const queue = [[seedX, seedY]];
    keep[seedY * width + seedX] = 1;
    const neighbors = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ];
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const idx = ny * width + nx;
        if (keep[idx]) continue;
        const i = idx * 4;
        if (!pixelIsSubject(d[i], d[i + 1], d[i + 2], d[i + 3])) continue;
        keep[idx] = 1;
        queue.push([nx, ny]);
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const a = d[i + 3];
        let drop = !keep[y * width + x];
        if (
          !drop &&
          inMarginBand(x, y) &&
          (pixelIsGreyHalo(r, g, b, a) || pixelIsWhiteMatte(r, g, b, a))
        ) {
          drop = true;
        }
        if (drop) d[i + 3] = 0;
      }
    }
  }

  function applyHalftonePass(d, width, height) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = d[i + 3];
        if (alpha < 8) {
          d[i + 3] = 0;
          continue;
        }
        const lumNorm = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        const after = ((lumNorm - 0.5) * 1.48 + 0.5) * 1.56;
        const normalized = Math.max(0, Math.min(1, after));
        const threshold = BAYER_4[y % 4][x % 4] / 16;
        const v =
          normalized > threshold
            ? 255
            : Math.max(0, Math.min(255, Math.round(normalized * 255 * 0.42)));
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = Math.min(255, alpha * 0.98);
      }
    }
  }

  function makeSpeakerPortraitCanvas(img, outW, outH, isCutoutPng = false) {
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
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, dx, 0, dw, dh);
    const image = g.getImageData(0, 0, c.width, c.height);
    const d = image.data;
    maskCutoutFringe(d, c.width, c.height, isCutoutPng);
    applyHalftonePass(d, c.width, c.height);
    g.putImageData(image, 0, 0);
    return c;
  }

  function buildSpeakerGrainCanvas(portrait) {
    if (!portrait) return null;
    const grain = document.createElement('canvas');
    grain.width = portrait.width;
    grain.height = portrait.height;
    const gx = grain.getContext('2d');
    if (!gx) return null;
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
    return grain;
  }

  function buildSpeakerWashCanvas(portrait, washColor) {
    if (!portrait) return null;
    const wash = parseSpeakerWashRgb(washColor);
    const washLayer = document.createElement('canvas');
    washLayer.width = portrait.width;
    washLayer.height = portrait.height;
    const wx = washLayer.getContext('2d');
    if (!wx) return null;
    wx.fillStyle = `rgba(${wash.r}, ${wash.g}, ${wash.b}, 0.88)`;
    wx.fillRect(0, 0, washLayer.width, washLayer.height);
    wx.globalCompositeOperation = 'destination-in';
    wx.drawImage(portrait, 0, 0);
    return washLayer;
  }

  function drawOffsetLayer(targetCtx, layer, rect, mis, alpha, composite) {
    if (!layer || !mis) return;
    targetCtx.save();
    targetCtx.translate(rect.width * (mis.tx / 100), rect.height * (mis.ty / 100));
    targetCtx.rotate((mis.rot * Math.PI) / 180);
    targetCtx.scale(mis.scale, mis.scale);
    targetCtx.globalCompositeOperation = composite;
    targetCtx.globalAlpha = alpha;
    targetCtx.drawImage(layer, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
    targetCtx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} g
   * @param {HTMLImageElement|HTMLCanvasElement} img
   * @param {{ x, y, width, height, angle? }} rect center-based (angle radians)
   */
  function drawSpeakerCutoutStack(g, img, rect, options = {}) {
    if (!g || !img || !rect || rect.width <= 0 || rect.height <= 0) return false;
    const isCutoutPng = !!options.isCutoutPng;
    const isHeroPost = Math.max(0, Math.min(1, Number(options.solidMatOpacity) || 0)) > 0;
    const washColor = options.washColor || '#ea9b9a';
    const seed = String(options.seed || options.seedKey || 'odq').trim() || 'odq';
    const plan = buildSpeakerCutoutPlan({
      width: rect.width,
      height: rect.height,
      washColor,
      seed
    });

    let portrait = null;
    try {
      portrait = makeSpeakerPortraitCanvas(img, rect.width, rect.height, isCutoutPng);
    } catch (_) {
      return false;
    }
    if (!portrait) return false;

    const washLayer = buildSpeakerWashCanvas(portrait, washColor);
    const grain = buildSpeakerGrainCanvas(portrait);
    const pw = portrait.width;
    const ph = portrait.height;
    const QNC = root.QuiltNewspaperClipping || globalThis.QuiltNewspaperClipping;
    const multiplyAlpha = isHeroPost ? (isCutoutPng ? 0.9 : 0.86) : 0.95;
    const grainAlpha = isHeroPost ? 0.27 : 0.34;
    const washAlpha = isHeroPost ? 0.58 : 0.62;

    g.save();
    g.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    g.rotate(rect.angle || 0);

    if (typeof options.drawScannerBed === 'function') {
      options.drawScannerBed(g, -rect.width / 2, -rect.height / 2, pw, ph, portrait);
    } else if (QNC?.drawScannerBed) {
      const bed = document.createElement('canvas');
      bed.width = pw;
      bed.height = ph;
      const bctx = bed.getContext('2d');
      if (bctx) {
        QNC.drawScannerBed(
          bctx,
          bed.width,
          bed.height,
          `${seed}:speaker-cutout:0`,
          'speakerCutout'
        );
        bctx.globalCompositeOperation = 'destination-in';
        bctx.drawImage(portrait, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.drawImage(bed, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
      }
    }

    if (isHeroPost && !isCutoutPng && typeof options.paintNeutralSilhouette === 'function') {
      options.paintNeutralSilhouette(g, portrait, rect);
    } else if (!isCutoutPng) {
      const creamSil = document.createElement('canvas');
      creamSil.width = pw;
      creamSil.height = ph;
      const csx = creamSil.getContext('2d');
      if (csx) {
        const mis = plan.mis.neutral;
        csx.save();
        csx.translate(pw * (mis.tx / 100), ph * (mis.ty / 100));
        csx.rotate((mis.rot * Math.PI) / 180);
        csx.scale(mis.scale, mis.scale);
        csx.drawImage(portrait, 0, 0);
        csx.globalCompositeOperation = 'source-in';
        csx.fillStyle = `rgb(${MAT_RGB})`;
        csx.fillRect(-4, -4, pw + 8, ph + 8);
        csx.restore();
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.drawImage(creamSil, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
      }
    }

    drawOffsetLayer(g, washLayer, rect, plan.mis.wash, washAlpha, 'source-over');

    drawOffsetLayer(g, portrait, rect, plan.mis.portrait, multiplyAlpha, 'multiply');

    drawOffsetLayer(g, grain, rect, plan.mis.grain, grainAlpha, 'multiply');

    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.restore();
    return true;
  }

  root.SpeakerCutoutRender = {
    createSeededRng,
    parseSpeakerWashRgb,
    safeHex,
    buildSpeakerCutoutPlan,
    applySpeakerCutoutPlanToElement,
    makeSpeakerPortraitCanvas,
    buildSpeakerGrainCanvas,
    buildSpeakerWashCanvas,
    drawSpeakerCutoutStack
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
