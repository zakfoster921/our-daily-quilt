/**
 * Warhol / xerox speaker cutout stack — shared by in-app card, Layout B, quote collage.
 * Layer order (bottom → top): scanner bed → cream mat → backdrop → wash → paper shapes → B/W portrait → grain → contour trace.
 */
(function (root) {
  'use strict';

  // #region agent log
  const _odqDbg7240 = (location, message, data, hypothesisId) => {
    const entry = {
      sessionId: '7240d3',
      runId: 'pre-fix',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    };
    try {
      if (!globalThis.__odqSpeakerDrawDiag) globalThis.__odqSpeakerDrawDiag = [];
      globalThis.__odqSpeakerDrawDiag.push(entry);
    } catch (_) {
      /* ignore */
    }
    fetch('http://127.0.0.1:7433/ingest/0ed8adaa-5aed-4571-811f-aadcc7a8fddc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7240d3' },
      body: JSON.stringify(entry)
    }).catch(() => {});
  };
  const _odqDbg7240SampleCtx = (ctx, x, y) => {
    try {
      const d = ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    } catch (_) {
      return null;
    }
  };
  const _odqDbg7240SampleImg = (img) => {
    try {
      const c = document.createElement('canvas');
      const iw = Math.max(1, img.naturalWidth || img.width || 1);
      const ih = Math.max(1, img.naturalHeight || img.height || 1);
      c.width = Math.min(48, iw);
      c.height = Math.min(48, ih);
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0, c.width, c.height);
      return _odqDbg7240SampleCtx(cx, c.width / 2, c.height / 2);
    } catch (_) {
      return null;
    }
  };
  const _odqDbg7240SamplePortraitRange = (portrait) => {
    try {
      const px = portrait.getContext('2d', { willReadFrequently: true });
      const w = portrait.width;
      const h = portrait.height;
      const data = px.getImageData(0, 0, w, h).data;
      let highlight = null;
      let shadow = null;
      let bestLum = -1;
      let worstLum = 999;
      const stepX = Math.max(1, Math.floor(w / 32));
      const stepY = Math.max(1, Math.floor(h / 32));
      for (let y = 0; y < h; y += stepY) {
        for (let x = 0; x < w; x += stepX) {
          const i = (y * w + x) * 4;
          if (data[i + 3] < 40) continue;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (lum > bestLum) {
            bestLum = lum;
            highlight = { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
          }
          if (lum < worstLum) {
            worstLum = lum;
            shadow = { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
          }
        }
      }
      return { highlight, shadow };
    } catch (_) {
      return { highlight: null, shadow: null };
    }
  };
  const _odqDbg7240SamplePortrait = (portrait) => {
    const range = _odqDbg7240SamplePortraitRange(portrait);
    return range.highlight;
  };
  // #endregion

  /** Match in-app speaker name strip tape (`--odq-paper-tape`). */
  const MAT_RGB = '242, 238, 230';
  /** Same flat field as `.quote-speaker-slab` / `--quilt-byg-tape`. */
  const SPEAKER_STRIP_PAPER = '#f2eee6';
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

  const DEFAULT_PAPER_TUNE = Object.freeze({
    faceWidthFrac: 0.672,
    faceHeightFrac: 0.648,
    faceTargetAspect: 0.68,
    faceTrimBottom: 0.05,
    torsoTopFrac: 0.4,
    torsoDropTop: 0.04,
    torsoInsetX: 0.02,
    torsoTrimBottom: 0.03,
    torsoShoulderScan0: 0.36,
    torsoShoulderScan1: 0.54,
    torsoBodyFrac0: 0.5,
    torsoBodyFrac1: 0.98,
    torsoShoulderPad: 0.015,
    /** Max torso/backdrop depth below shoulder line (fraction of subject height). */
    torsoBodyMaxBelowShoulder: 0.06,
    /** Extend torso top upward by this fraction of torso height (above shoulder line). */
    torsoShoulderRiseFrac: 0.25,
    torsoSidePad: 0.025,
    torsoWidthInflate: 1.06,
    torsoHeightInflate: 1.05,
    paperShapeInflate: 1.1,
    faceWidthInflate: 1.04,
    faceHeightInflateMul: 1.04,
    backdropSideScale: 1.48,
    backdropAspect: 1.05,
    backdropPad: 0.035
  });

  const DEFAULT_BACKDROP_HANDCUT_CFG = Object.freeze({
    exportScale: 1,
    handCutNotchesEnabled: false,
    handCutMarginDomPx: 0.35,
    handCutCornerChamferDomPx: 11,
    handCutMacroDomPx: 7,
    handCutBiteMaxDomPx: 0,
    handCutSecondaryBiteDomPx: 0,
    handCutSideInwardMaxDomPx: 9,
    handCutTopBottomTrimDomPx: 7
  });

  const DEFAULT_MIS_TUNE = Object.freeze({
    washSpread: 22,
    washRot: 3.2,
    portraitSpread: 1.2,
    portraitRot: 0.45,
    grainSpread: 2.2,
    grainRot: 0.84,
    facePaperSpread: 12,
    facePaperRot: 2.2,
    torsoPaperSpread: 14,
    torsoPaperRot: 2.4,
    backdropSpread: 5,
    backdropRot: 1.1,
    contourSpread: 2.8,
    contourRot: 0.85
  });

  const DEFAULT_CONTOUR_TUNE = Object.freeze({
    alphaThreshold: 28,
    strokePx: 0.62,
    opacity: 0.48,
    strokeRgb: '36, 31, 25',
    strokeAlpha: 0.55
  });

  function resolvePaperTune(paperTune) {
    return { ...DEFAULT_PAPER_TUNE, ...(paperTune || {}) };
  }

  function resolveMisTune(misTune) {
    return { ...DEFAULT_MIS_TUNE, ...(misTune || {}) };
  }

  function resolveContourTune(contourTune) {
    return { ...DEFAULT_CONTOUR_TUNE, ...(contourTune || {}) };
  }

  function buildMisregistration(rng, misTune) {
    const mt = resolveMisTune(misTune);
    const pick = (spread, rot) => ({
      tx: (rng() - 0.5) * spread,
      ty: (rng() - 0.5) * spread * 0.85,
      rot: (rng() - 0.5) * rot,
      scale: 1 + (rng() - 0.5) * 0.024
    });
    return {
      neutral: pick(1.4, 0.36),
      wash: pick(mt.washSpread, mt.washRot),
      portrait: pick(mt.portraitSpread, mt.portraitRot),
      grain: pick(mt.grainSpread, mt.grainRot),
      contour: pick(mt.contourSpread, mt.contourRot)
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

  function polygonToClipPath(polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return 'none';
    const pts = polygon
      .map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`)
      .join(', ');
    return `polygon(${pts})`;
  }

  function hexToHsv(hex) {
    const safe = safeHex(hex, '#ea9b9a');
    const r = parseInt(safe.slice(1, 3), 16) / 255;
    const g = parseInt(safe.slice(3, 5), 16) / 255;
    const b = parseInt(safe.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : (d / max) * 100;
    const v = max * 100;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s, v };
  }

  function hsvToHex(h, s, v) {
    const hh = ((Number(h) % 360) + 360) % 360;
    const ss = Math.max(0, Math.min(100, Number(s))) / 100;
    const vv = Math.max(0, Math.min(100, Number(v))) / 100;
    const c = vv * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = vv - c;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (hh < 60) {
      rp = c;
      gp = x;
    } else if (hh < 120) {
      rp = x;
      gp = c;
    } else if (hh < 180) {
      gp = c;
      bp = x;
    } else if (hh < 240) {
      gp = x;
      bp = c;
    } else if (hh < 300) {
      rp = x;
      bp = c;
    } else {
      rp = c;
      bp = x;
    }
    const toHex = (n) =>
      Math.round((n + m) * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${toHex(rp)}${toHex(gp)}${toHex(bp)}`;
  }

  function mixHexColors(a, b, t) {
    const parse = (hex) => {
      const safe = safeHex(hex);
      return {
        r: parseInt(safe.slice(1, 3), 16),
        g: parseInt(safe.slice(3, 5), 16),
        b: parseInt(safe.slice(5, 7), 16)
      };
    };
    const left = parse(a);
    const right = parse(b);
    const mix = Math.max(0, Math.min(1, Number(t) || 0));
    const ch = (k) =>
      Math.round(left[k] * (1 - mix) + right[k] * mix)
        .toString(16)
        .padStart(2, '0');
    return `#${ch('r')}${ch('g')}${ch('b')}`;
  }

  const SPEAKER_WASH_PROFILES = Object.freeze({
    wash: { satMul: 0.62, satMin: 22, satMax: 65, valMul: 0.72, valAdd: 24, valMin: 74, valMax: 90, creamMix: 0.04 },
    face: { satMul: 0.46, satMin: 14, satMax: 44, valMul: 0.7, valAdd: 24, valMin: 72, valMax: 88, creamMix: 0.1 },
    torso: { satMul: 0.4, satMin: 12, satMax: 38, valMul: 0.72, valAdd: 22, valMin: 70, valMax: 86, creamMix: 0.11 },
    paper: { satMul: 0.68, satMin: 26, satMax: 62, valMul: 0.72, valAdd: 22, valMin: 74, valMax: 88, creamMix: 0.03 }
  });

  function washOutSpeakerQuiltColor(hex, role = 'wash') {
    const profile = SPEAKER_WASH_PROFILES[role] || SPEAKER_WASH_PROFILES.wash;
    const hsv = hexToHsv(safeHex(hex));
    const sat =
      hsv.s < 8
        ? profile.satMin
        : Math.max(profile.satMin, Math.min(profile.satMax, hsv.s * profile.satMul));
    const val = Math.max(
      profile.valMin,
      Math.min(profile.valMax, hsv.v * profile.valMul + profile.valAdd)
    );
    const tinted = hsvToHex(hsv.h, sat, val);
    return mixHexColors(tinted, '#f6f2ea', profile.creamMix);
  }

  function normalizeQuiltPalette(palette, fallback = '#ea9b9a') {
    const out = [];
    const seen = new Set();
    const add = (color) => {
      const safe = safeHex(color, '');
      if (!safe || seen.has(safe.toLowerCase())) return;
      seen.add(safe.toLowerCase());
      out.push(safe);
    };
    (Array.isArray(palette) ? palette : []).forEach(add);
    if (!out.length) add(fallback);
    return out;
  }

  function hueDistance(a, b) {
    const diff = Math.abs(hexToHsv(a).h - hexToHsv(b).h);
    return Math.min(diff, 360 - diff);
  }

  function pickMaxDistinctColors(colors, count = 3) {
    if (colors.length <= count) return [...colors];
    const selected = [colors[0]];
    while (selected.length < count) {
      let best = null;
      let bestMinDist = -1;
      for (const c of colors) {
        if (selected.some((s) => s.toLowerCase() === c.toLowerCase())) continue;
        const minDist = Math.min(...selected.map((s) => hueDistance(s, c)));
        if (minDist > bestMinDist) {
          bestMinDist = minDist;
          best = c;
        }
      }
      if (!best) break;
      selected.push(best);
    }
    return selected;
  }

  function pickSpeakerQuiltSources(palette, fallback = '#ea9b9a') {
    const colors = normalizeQuiltPalette(palette, fallback);
    const distinct = pickMaxDistinctColors(colors, Math.min(3, colors.length));
    if (distinct.length >= 3) {
      const hsv = (hex) => hexToHsv(hex);
      const wash = distinct.reduce((best, c) => (hsv(c).v > hsv(best).v ? c : best), distinct[0]);
      const rest = distinct.filter((c) => c !== wash);
      const face = rest.reduce((best, c) => (hsv(c).s > hsv(best).s ? c : best), rest[0]);
      const torso = rest.find((c) => c !== face) || rest[0];
      return { wash, face, torso };
    }
    if (distinct.length === 2) {
      const hsv = (hex) => hexToHsv(hex);
      const wash = hsv(distinct[0]).v >= hsv(distinct[1]).v ? distinct[0] : distinct[1];
      const face = wash === distinct[0] ? distinct[1] : distinct[0];
      return { wash, face, torso: face };
    }
    return { wash: distinct[0], face: distinct[0], torso: distinct[0] };
  }

  function resolveSpeakerCardColorsFromQuilt(options = {}) {
    const fallback = safeHex(options.washColor || options.torsoFallback || '#c9a99a');
    if (options.keepExplicitColors) {
      const faceColor = safeHex(options.faceColor || options.washColor || fallback);
      return {
        washPlateColor: safeHex(options.washPlateColor || options.washColor || faceColor),
        faceColor,
        torsoColor: safeHex(options.torsoColor || fallback)
      };
    }
    const sources = pickSpeakerQuiltSources(options.palette, fallback);
    return {
      washPlateColor: washOutSpeakerQuiltColor(sources.wash, 'wash'),
      faceColor: washOutSpeakerQuiltColor(sources.face, 'face'),
      torsoColor: washOutSpeakerQuiltColor(sources.torso, 'torso')
    };
  }

  function resolvePaperShapeColors(washColor, options = {}) {
    return resolveSpeakerCardColorsFromQuilt({
      ...options,
      washColor
    });
  }

  function resolvePaperBackdropColor() {
    return SPEAKER_STRIP_PAPER;
  }

  /** Flat tape field — matches in-app `.quote-speaker-slab` / `--quilt-byg-tape` (not newsprint stack). */
  function fillSpeakerTapePaperInCtx(ctx, w, h, paperHex = SPEAKER_STRIP_PAPER) {
    const paper = safeHex(paperHex, SPEAKER_STRIP_PAPER);
    const width = Math.max(1, Math.round(Number(w) || 1));
    const height = Math.max(1, Math.round(Number(h) || 1));
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(110, 96, 72, 0.022)';
    for (let x = 0; x < width; x += 4) {
      ctx.fillRect(x, 0, 1, height);
    }
    const angleRad = (104 * Math.PI) / 180;
    const span = Math.sqrt(width * width + height * height);
    const cx = width / 2;
    const cy = height / 2;
    const sheen = ctx.createLinearGradient(
      cx - (Math.cos(angleRad) * span) / 2,
      cy - (Math.sin(angleRad) * span) / 2,
      cx + (Math.cos(angleRad) * span) / 2,
      cy + (Math.sin(angleRad) * span) / 2
    );
    sheen.addColorStop(0, 'rgba(255, 252, 245, 0.22)');
    sheen.addColorStop(0.46, 'rgba(255, 252, 245, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(231, 216, 188, 0.045)';
    ctx.fillRect(0, 0, width, height);
  }

  function fillSpeakerStripPaperInCtx(ctx, w, h, paperHex = SPEAKER_STRIP_PAPER) {
    const pad = 24;
    ctx.save();
    ctx.translate(-pad, -pad);
    fillSpeakerTapePaperInCtx(ctx, w + pad * 2, h + pad * 2, paperHex);
    ctx.restore();
  }

  function speakerNewsprintSurfaceEnabled(options = {}) {
    return options.newsprintSurface === true;
  }

  /**
   * Flatbed bloom masked to lithograph portrait ink (Layout B story/post + quote card composite).
   * @returns {(targetCtx: CanvasRenderingContext2D, dx: number, dy: number, pw: number, ph: number, portrait: CanvasImageSource) => void|undefined}
   */
  function createSpeakerPortraitScannerBedDrawer(seedKey, bedOpts = {}) {
    const QNC = root.QuiltNewspaperClipping || globalThis.QuiltNewspaperClipping;
    if (!QNC?.drawScannerBed) return undefined;
    const seed = String(seedKey || 'odq').trim() || 'odq';
    const bedComposite = bedOpts.composite || 'source-over';
    const bedAlpha = bedOpts.alpha != null ? bedOpts.alpha : 1;
    return (targetCtx, dx, dy, pw, ph, portrait) => {
      if (!targetCtx || !portrait || pw <= 0 || ph <= 0) return;
      const bed = document.createElement('canvas');
      bed.width = pw;
      bed.height = ph;
      const bctx = bed.getContext('2d');
      if (!bctx) return;
      QNC.drawScannerBed(bctx, bed.width, bed.height, `${seed}:speaker-cutout:0`, 'speakerCutout');
      bctx.globalCompositeOperation = 'destination-in';
      bctx.drawImage(portrait, 0, 0);
      targetCtx.globalCompositeOperation = bedComposite;
      targetCtx.globalAlpha = bedAlpha;
      targetCtx.drawImage(bed, dx, dy, pw, ph);
      targetCtx.globalAlpha = 1;
      targetCtx.globalCompositeOperation = 'source-over';
    };
  }

  function drawCanvasLayerClippedToMask(targetCtx, maskCanvas, dx, dy, dw, dh, paintFn) {
    if (!maskCanvas || !paintFn) return;
    const layer = document.createElement('canvas');
    layer.width = maskCanvas.width;
    layer.height = maskCanvas.height;
    const lx = layer.getContext('2d');
    if (!lx) return;
    paintFn(lx, layer.width, layer.height);
    lx.globalCompositeOperation = 'destination-in';
    lx.drawImage(maskCanvas, 0, 0);
    targetCtx.drawImage(layer, dx, dy, dw, dh);
  }

  /** Force opaque pixels inside silhouette — prevents quilt/wash bleed-through on PNG display. */
  function flattenCutoutAlphaToOpaque(canvas, maskCanvas) {
    if (!canvas || !maskCanvas) return;
    const ctx = canvas.getContext('2d');
    const mctx = maskCanvas.getContext('2d');
    if (!ctx || !mctx) return;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 1 || h < 1 || maskCanvas.width !== w || maskCanvas.height !== h) return;
    let img;
    let mask;
    try {
      img = ctx.getImageData(0, 0, w, h);
      mask = mctx.getImageData(0, 0, w, h);
    } catch (_) {
      return;
    }
    const d = img.data;
    const m = mask.data;
    for (let i = 0; i < d.length; i += 4) {
      if (m[i + 3] > 8) d[i + 3] = 255;
      else d[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
  }

  let _speakerNewsprintAssetsReady = null;

  async function ensureSpeakerNewsprintAssets() {
    const QNC = root.QuiltNewspaperClipping || globalThis.QuiltNewspaperClipping;
    if (!QNC?.ensureClippingSurfaceAssets) return false;
    if (!_speakerNewsprintAssetsReady) {
      _speakerNewsprintAssetsReady = QNC.ensureClippingSurfaceAssets({
        paperTextureUrl: null
      }).then(() => true);
    }
    try {
      return await _speakerNewsprintAssetsReady;
    } catch (_) {
      _speakerNewsprintAssetsReady = null;
      return false;
    }
  }

  function backdropBandRectFromBounds(bounds, width, height, tune) {
    const t = resolvePaperTune(tune);
    if (!bounds?.width) {
      return { nx0: 0.07, ny0: 0.05, nx1: 0.93, ny1: 0.95, cx: 0.5, cy: 0.5, w: 0.86, h: 0.9 };
    }
    const scx = bounds.cx / width;
    const scy = bounds.cy / height;
    const sw = bounds.width / width;
    const sh = bounds.height / height;
    const side = Math.min(
      0.94 - t.backdropPad,
      Math.max(sw, sh) * t.backdropSideScale
    );
    const halfW = side * 0.5;
    const halfH = (side * t.backdropAspect * 0.5);
    const half = Math.max(halfW, halfH);
    const nx0 = Math.max(t.backdropPad, scx - half);
    const nx1 = Math.min(1 - t.backdropPad, scx + half);
    const ny0 = Math.max(t.backdropPad * 0.75, scy - half * t.backdropAspect);
    const ny1 = Math.min(1 - t.backdropPad * 0.75, scy + half * t.backdropAspect);
    return {
      nx0,
      ny0,
      nx1,
      ny1,
      cx: (nx0 + nx1) / 2,
      cy: (ny0 + ny1) / 2,
      w: nx1 - nx0,
      h: ny1 - ny0
    };
  }

  function ringToNormalizedPolygon(ring, nx0, ny0, nx1, ny1, ringW, ringH) {
    const bw = Math.max(1, nx1 - nx0);
    const bh = Math.max(1, ny1 - ny0);
    const rw = Math.max(1, ringW);
    const rh = Math.max(1, ringH);
    return ring.map((p) => [nx0 + (p.x / rw) * bw, ny0 + (p.y / rh) * bh]);
  }

  function buildPaperBackdropPolygon(bandRect, seedKey, width, height) {
    const nx0 = bandRect.nx0;
    const ny0 = bandRect.ny0;
    const nx1 = bandRect.nx1;
    const ny1 = bandRect.ny1;
    return buildQuiltStyleHandCutRectPolygon(nx0, ny0, nx1, ny1, `${seedKey}:paper-backdrop`, 0.94);
  }

  function buildPaperBackdropShape(analysisCanvas, seed, colors, width, height, paperTune, misTune) {
    const tune = resolvePaperTune(paperTune);
    const mt = resolveMisTune(misTune);
    const rng = createSeededRng(`${seed}:paper-backdrop`);
    let bounds = null;
    const ctx = analysisCanvas?.getContext?.('2d', { willReadFrequently: true });
    let alphaData = null;
    if (ctx && analysisCanvas?.width) {
      try {
        alphaData = ctx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
        bounds = measureSubjectBoundsFromAlpha(alphaData, analysisCanvas.width, analysisCanvas.height);
        if (bounds && alphaData) {
          bounds = reboundSubjectBoundsAtMaxY(
            bounds,
            shoulderCapMaxY(alphaData, analysisCanvas.width, analysisCanvas.height, bounds, tune)
          );
        }
      } catch (_) {
        bounds = null;
      }
    }
    const bandRect = backdropBandRectFromBounds(bounds, width, height, tune);
    const polygon = buildPaperBackdropPolygon(bandRect, seed, width, height);
    return {
      kind: 'backdrop',
      color: colors.backdropColor || `rgb(${MAT_RGB})`,
      polygon,
      clipPath: polygonToClipPath(polygon),
      mis: {
        tx: (rng() - 0.5) * mt.backdropSpread,
        ty: (rng() - 0.5) * mt.backdropSpread * 0.85,
        rot: (rng() - 0.5) * mt.backdropRot,
        scale: 1 + (rng() - 0.5) * 0.012
      }
    };
  }

  /** Remove soft fringe/halo connected to image edges (remove.bg rectangular matte). */
  function stripBorderConnectedSemiTransparent(data, width, height, maxAlpha = 128) {
    const exterior = new Uint8Array(width * height);
    const queue = [];
    const neighbors = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ];

    const tryExterior = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const idx = y * width + x;
      if (exterior[idx]) return;
      if (data[idx * 4 + 3] > maxAlpha) return;
      exterior[idx] = 1;
      queue.push([x, y]);
    };

    for (let x = 0; x < width; x += 1) {
      tryExterior(x, 0);
      tryExterior(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      tryExterior(0, y);
      tryExterior(width - 1, y);
    }

    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of neighbors) {
        tryExterior(x + dx, y + dy);
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (!exterior[idx]) continue;
        const i = idx * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
  }

  /** Transparent pixels reachable from canvas border (4-connected). */
  function buildExteriorTransparentMask(data, width, height, minAlpha = 24) {
    const exterior = new Uint8Array(width * height);
    const queue = [];
    const neighbors = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ];
    const tryExterior = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const idx = y * width + x;
      if (exterior[idx]) return;
      if (data[idx * 4 + 3] >= minAlpha) return;
      exterior[idx] = 1;
      queue.push([x, y]);
    };
    for (let x = 0; x < width; x += 1) {
      tryExterior(x, 0);
      tryExterior(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      tryExterior(0, y);
      tryExterior(width - 1, y);
    }
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of neighbors) {
        tryExterior(x + dx, y + dy);
      }
    }
    return exterior;
  }

  /** Fill remove.bg face holes with paper — includes semi-transparent hole fringe on bright skin. */
  function fillPortraitInteriorHolesWithPaper(data, width, height, minAlpha = 24) {
    const n = width * height;
    const exterior = buildExteriorTransparentMask(data, width, height, minAlpha);
    const toFill = new Uint8Array(n);
    for (let idx = 0; idx < n; idx += 1) {
      if (!exterior[idx] && data[idx * 4 + 3] < minAlpha) toFill[idx] = 1;
    }
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
    for (let pass = 0; pass < 3; pass += 1) {
      const add = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if (!toFill[idx]) continue;
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nidx = ny * width + nx;
            if (exterior[nidx] || toFill[nidx]) continue;
            const i = nidx * 4;
            const a = data[i + 3];
            if (a >= 252) continue;
            const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (a < minAlpha || lum >= 150) add.push(nidx);
          }
        }
      }
      for (const idx of add) toFill[idx] = 1;
    }
    const [mr, mg, mb] = MAT_RGB.split(',').map((s) => parseInt(String(s).trim(), 10));
    let holesFilled = 0;
    let fringeFilled = 0;
    for (let idx = 0; idx < n; idx += 1) {
      if (!toFill[idx]) continue;
      const i = idx * 4;
      const a = data[i + 3];
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (a >= 240 && lum < 72) continue;
      if (a < minAlpha) holesFilled += 1;
      else fringeFilled += 1;
      if (lum >= 185) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else {
        data[i] = mr;
        data[i + 1] = mg;
        data[i + 2] = mb;
      }
      data[i + 3] = 255;
    }
    return { holesFilled, fringeFilled };
  }

  /** Flood-fill from border; opaque-enclosed transparent pixels become subject (remove.bg face holes). */
  function fillInteriorAlphaHoles(data, width, height, minAlpha = 24) {
    const exterior = buildExteriorTransparentMask(data, width, height, minAlpha);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const i = idx * 4;
        if (data[i + 3] < minAlpha && !exterior[idx]) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 255;
        }
      }
    }
  }

  /** Expand opaque alpha by radius px to cover jagged hole edges. */
  function dilateAlphaMask(data, width, height, radius = 1, minAlpha = 24) {
    if (radius < 1) return;
    const keep = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] >= minAlpha) keep[y * width + x] = 1;
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (keep[idx]) continue;
        let near = false;
        outer: for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (keep[ny * width + nx]) {
              near = true;
              break outer;
            }
          }
        }
        if (near) {
          const i = idx * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 255;
        }
      }
    }
  }

  /** Keep only the alpha blob connected to the portrait center (drops detached fringe/mattes). */
  function keepCenterAlphaComponent(data, width, height, minAlpha = 48) {
    const x0 = Math.floor(width * 0.18);
    const x1 = Math.ceil(width * 0.82);
    const y0 = Math.floor(height * 0.08);
    const y1 = Math.ceil(height * 0.96);
    let seedIdx = -1;
    let bestAlpha = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const idx = y * width + x;
        const a = data[idx * 4 + 3];
        if (a < minAlpha) continue;
        if (a > bestAlpha) {
          bestAlpha = a;
          seedIdx = idx;
        }
      }
    }
    if (seedIdx < 0) return;
    const keep = new Uint8Array(width * height);
    const queue = [[seedIdx % width, (seedIdx / width) | 0]];
    keep[seedIdx] = 1;
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
        if (data[idx * 4 + 3] < minAlpha) continue;
        keep[idx] = 1;
        queue.push([nx, ny]);
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (keep[idx]) continue;
        const i = idx * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
  }

  function drawSpeakerSourceImage(g, img, destW, destH, layout = 'contain', subjectCrop = null) {
    const iw = Math.max(1, img.naturalWidth || img.width);
    const ih = Math.max(1, img.naturalHeight || img.height);
    const crop =
      subjectCrop && subjectCrop.width > 0 && subjectCrop.height > 0 ? subjectCrop : null;
    if (layout === 'subject-fill' && crop) {
      const sw = Math.max(1, crop.width);
      const sh = Math.max(1, crop.height);
      const scale = destW / sw;
      const drawW = sw * scale;
      const drawH = sh * scale;
      const dx = 0;
      const dy = Math.max(0, destH - drawH);
      g.drawImage(img, crop.minX, crop.minY, sw, sh, dx, dy, drawW, drawH);
      return;
    }
    if (layout === 'width-fill') {
      g.drawImage(img, 0, 0, destW, destH);
      return;
    }
    const scale = Math.min(destW / iw, destH / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (destW - dw) / 2;
    const dy = (destH - dh) / 2;
    g.drawImage(img, dx, dy, dw, dh);
  }

  function makeSpeakerAlphaSilhouetteCanvas(
    img,
    outW,
    outH,
    isCutoutPng = false,
    layout = 'contain',
    fillInteriorHoles = false,
    subjectCrop = null
  ) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(outW));
    c.height = Math.max(1, Math.round(outH));
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    drawSpeakerSourceImage(g, img, c.width, c.height, layout, subjectCrop);
    let image;
    try {
      image = g.getImageData(0, 0, c.width, c.height);
    } catch (_) {
      return null;
    }
    const d = image.data;
    if (fillInteriorHoles) {
      fillInteriorAlphaHoles(d, c.width, c.height);
    } else {
      maskCutoutFringe(d, c.width, c.height, isCutoutPng);
    }
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 24) {
        d[i + 3] = 0;
        continue;
      }
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
    g.putImageData(image, 0, 0);
    return c;
  }

  function makeSpeakerFilledSilhouetteCanvas(
    img,
    outW,
    outH,
    isCutoutPng = true,
    layout = 'contain',
    subjectCrop = null
  ) {
    return makeSpeakerAlphaSilhouetteCanvas(img, outW, outH, isCutoutPng, layout, true, subjectCrop);
  }

  /** Flood from border through near-white matte — keeps subject, drops rectangular paper mat. */
  function stripBorderConnectedNearWhitePaper(data, width, height, paperCutoff = 232, minAlpha = 40) {
    const exterior = new Uint8Array(width * height);
    const queue = [];
    const neighbors = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ];
    const isExteriorPixel = (idx) => {
      const i = idx * 4;
      const a = data[i + 3];
      if (a < minAlpha) return true;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      return r >= paperCutoff && g >= paperCutoff && b >= paperCutoff;
    };
    const tryExterior = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const idx = y * width + x;
      if (exterior[idx]) return;
      if (!isExteriorPixel(idx)) return;
      exterior[idx] = 1;
      queue.push([x, y]);
    };
    for (let x = 0; x < width; x += 1) {
      tryExterior(x, 0);
      tryExterior(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      tryExterior(0, y);
      tryExterior(width - 1, y);
    }
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of neighbors) {
        tryExterior(x + dx, y + dy);
      }
    }
    for (let idx = 0; idx < width * height; idx += 1) {
      if (!exterior[idx]) continue;
      const i = idx * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }

  function makeSpeakerSubjectSilhouetteCanvas(img, outW, outH, layout = 'width-fill') {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(outW));
    c.height = Math.max(1, Math.round(outH));
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    const iw = Math.max(1, img.naturalWidth || img.width);
    const ih = Math.max(1, img.naturalHeight || img.height);
    if (layout === 'width-fill') {
      g.drawImage(img, 0, 0, c.width, c.height);
    } else {
      const scale = Math.min(c.width / iw, c.height / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (c.width - dw) / 2;
      const dy = (c.height - dh) / 2;
      g.drawImage(img, dx, dy, dw, dh);
    }
    let image;
    try {
      image = g.getImageData(0, 0, c.width, c.height);
    } catch (_) {
      return null;
    }
    const d = image.data;
    stripBorderConnectedNearWhitePaper(d, c.width, c.height);
    fillInteriorAlphaHoles(d, c.width, c.height);
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 24) {
        d[i + 3] = 0;
        continue;
      }
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
    g.putImageData(image, 0, 0);
    return c;
  }

  function silhouetteHasOpaquePixels(canvas, minAlpha = 24) {
    if (!canvas) return false;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    let data;
    try {
      data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch (_) {
      return false;
    }
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] >= minAlpha) return true;
    }
    return false;
  }

  /** Clip / paper mask from PNG alpha — keeps shoulders; no white-mat flood. */
  function makeSpeakerPlainCutoutAlphaSilhouetteCanvas(
    img,
    outW,
    outH,
    layout = 'width-fill',
    subjectCrop = null
  ) {
    const alpha = makeSpeakerAlphaSilhouetteCanvas(img, outW, outH, true, layout, false, subjectCrop);
    if (silhouetteHasOpaquePixels(alpha)) return alpha;
    return makeSpeakerFilledSilhouetteCanvas(img, outW, outH, true, layout, subjectCrop);
  }

  function fillPaperIntoSilhouetteCanvas(silhouette, paperHex, options = {}) {
    if (!silhouette) return null;
    const c = document.createElement('canvas');
    c.width = silhouette.width;
    c.height = silhouette.height;
    const g = c.getContext('2d');
    if (!g) return null;
    const paper = safeHex(paperHex, SPEAKER_STRIP_PAPER);
    const QNC = root.QuiltNewspaperClipping || globalThis.QuiltNewspaperClipping;
    if (speakerNewsprintSurfaceEnabled(options) && QNC?.drawNewsprintSurfaceStack) {
      QNC.drawNewsprintSurfaceStack(g, c.width, c.height, { paper, paperTextureUrl: null });
    } else {
      fillSpeakerTapePaperInCtx(g, c.width, c.height, paper);
    }
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(silhouette, 0, 0);
    return c;
  }

  function buildSpeakerFilledPaperSilhouetteDataUrl(img, outW, outH, layout = 'width-fill', options = {}) {
    const seed = String(options.seed || options.seedKey || 'odq').trim() || 'odq';
    const paper = safeHex(options.paper, SPEAKER_STRIP_PAPER);
    const sil = makeSpeakerPlainCutoutAlphaSilhouetteCanvas(img, outW, outH, layout);
    const filled = fillPaperIntoSilhouetteCanvas(sil, paper, options);
    if (!filled) return '';
    try {
      return filled.toDataURL('image/png');
    } catch (_) {
      return '';
    }
  }

  async function buildSpeakerFilledPaperSilhouetteDataUrlAsync(
    img,
    outW,
    outH,
    layout = 'width-fill',
    options = {}
  ) {
    if (speakerNewsprintSurfaceEnabled(options)) {
      await ensureSpeakerNewsprintAssets();
    }
    return buildSpeakerFilledPaperSilhouetteDataUrl(img, outW, outH, layout, options);
  }

  /** Hole-filled cutout PNG at export resolution — single source for card, story, and post. */
  function buildSpeakerCutoutExportDataUrl(img, outW, outH, layout = 'width-fill') {
    try {
      const iw = Math.max(1, img.naturalWidth || img.width);
      const ih = Math.max(1, img.naturalHeight || img.height);
      const w = Math.max(1, Math.round(outW || iw));
      const h = Math.max(1, Math.round(outH || ih));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return '';
      if (layout === 'width-fill') {
        g.drawImage(img, 0, 0, w, h);
      } else {
        const scale = Math.min(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (w - dw) / 2;
        const dy = (h - dh) / 2;
        g.drawImage(img, dx, dy, dw, dh);
      }
      let imageData;
      try {
        imageData = g.getImageData(0, 0, w, h);
      } catch (_) {
        return '';
      }
      fillPortraitInteriorHolesWithPaper(imageData.data, w, h);
      g.putImageData(imageData, 0, 0);
      return c.toDataURL('image/png');
    } catch (_) {
      return '';
    }
  }

  /**
   * Opaque newsprint speaker layer (flattened alpha) — shared by quote card PNG and Layout B story/post.
   */
  function buildSpeakerPlainCutoutLayerCanvas(img, rect, options = {}) {
    if (!img || !rect || rect.width <= 0 || rect.height <= 0) return null;
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const layout = options.layout || 'width-fill';
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    const inner = { x: 0, y: 0, width: w, height: h, angle: 0 };
    const resolvedLayout = options.subjectCrop ? 'subject-fill' : layout;
    const ok = drawSpeakerCutoutPlain(g, img, inner, {
      ...options,
      isCutoutPng: options.isCutoutPng !== false,
      layout: resolvedLayout,
      newsprintSurface: speakerNewsprintSurfaceEnabled(options)
    });
    if (!ok) return null;
    if (options.isCutoutPng !== false) {
      const sil = makeSpeakerPlainCutoutAlphaSilhouetteCanvas(img, w, h, resolvedLayout, options.subjectCrop);
      if (sil) flattenCutoutAlphaToOpaque(c, sil);
    }
    return c;
  }

  /** Draw flattened plain cutout onto a larger canvas (story/post collage). */
  function drawSpeakerPlainCutoutLayer(g, img, rect, options = {}) {
    const layer = buildSpeakerPlainCutoutLayerCanvas(img, rect, options);
    if (!layer || !g) return false;
    g.save();
    g.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (rect.angle) g.rotate(rect.angle);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(layer, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
    g.restore();
    return true;
  }

  /**
   * Newsprint-stack plain cutout — matches nightly newspaper clipping surface (no warm paper JPEG).
   */
  function buildSpeakerPlainCutoutCompositeDataUrl(img, outW, outH, layout = 'width-fill', options = {}) {
    try {
      const iw = Math.max(1, img.naturalWidth || img.width);
      const ih = Math.max(1, img.naturalHeight || img.height);
      const w = Math.max(1, Math.round(outW || iw));
      const h = Math.max(1, Math.round(outH || ih));
      const layer = buildSpeakerPlainCutoutLayerCanvas(
        img,
        { x: 0, y: 0, width: w, height: h },
        { ...options, isCutoutPng: true, layout }
      );
      return layer ? layer.toDataURL('image/png') : '';
    } catch (_) {
      return '';
    }
  }

  async function buildSpeakerPlainCutoutCompositeDataUrlAsync(img, outW, outH, layout = 'width-fill', options = {}) {
    if (speakerNewsprintSurfaceEnabled(options)) {
      await ensureSpeakerNewsprintAssets();
    }
    return buildSpeakerPlainCutoutCompositeDataUrl(img, outW, outH, layout, options);
  }

  function loadSpeakerImageElement(url) {
    const src = String(url || '').trim();
    if (!src) return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  /** Async: load proxied cutout and return export-ready data URL (holes filled once). */
  async function prepareSpeakerCutoutExportDataUrl(source) {
    const url = String(source || '').trim();
    if (!url) return '';
    const img = await loadSpeakerImageElement(url);
    if (!img?.naturalWidth) return url;
    const out = buildSpeakerCutoutExportDataUrl(img);
    return out && out.length > 2000 ? out : url;
  }

  /** Cream hole-fill + portrait in one PNG — legacy flat mat without newsprint stack. */
  function buildSpeakerPlainCutoutCompositeDataUrlLegacy(img, outW, outH, layout = 'width-fill') {
    return buildSpeakerCutoutExportDataUrl(img, outW, outH, layout);
  }

  /** Opaque pixel bounds in source-image coordinates (for layout sizing / subject-fill). */
  function measureSpeakerOpaqueBoundsFromImage(img, minAlpha = 28) {
    const iw = img?.naturalWidth || img?.width;
    const ih = img?.naturalHeight || img?.height;
    if (!iw || !ih) return null;
    const scanW = Math.min(256, iw);
    const scanH = Math.max(1, Math.round(ih * (scanW / iw)));
    const canvas = document.createElement('canvas');
    canvas.width = scanW;
    canvas.height = scanH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, scanW, scanH);
    let data;
    try {
      data = ctx.getImageData(0, 0, scanW, scanH).data;
    } catch (_) {
      return null;
    }
    const bounds = measureSubjectBoundsFromAlpha(data, scanW, scanH, minAlpha);
    if (!bounds) return null;
    const sx = iw / scanW;
    const sy = ih / scanH;
    return {
      minX: bounds.minX * sx,
      minY: bounds.minY * sy,
      maxX: bounds.maxX * sx,
      maxY: bounds.maxY * sy,
      width: bounds.width * sx,
      height: bounds.height * sy,
      cx: bounds.cx * sx,
      cy: bounds.cy * sy
    };
  }

  function measureSubjectBoundsFromAlpha(data, width, height, minAlpha = 40) {
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] < minAlpha) continue;
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (!found) return null;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2
    };
  }

  function faceRectFromSubjectBounds(bounds, width, height, tune) {
    const t = resolvePaperTune(tune);
    const cx = bounds.cx / width;
    const halfW = (bounds.width / width) * t.faceWidthFrac * 0.5;
    const nx0 = Math.max(0, cx - halfW);
    const nx1 = Math.min(1, cx + halfW);
    const ny0 = bounds.minY / height;
    const ny1 = (bounds.minY + bounds.height * t.faceHeightFrac) / height;
    return {
      nx0,
      ny0,
      nx1,
      ny1,
      cx,
      cy: (ny0 + ny1) / 2,
      w: nx1 - nx0,
      h: ny1 - ny0
    };
  }

  function measureBandRect(data, width, height, bounds, yFrac0, yFrac1, minAlpha = 40) {
    const yStart = bounds.minY + bounds.height * yFrac0;
    const yEnd = bounds.minY + bounds.height * yFrac1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    for (let y = Math.max(0, Math.floor(yStart)); y <= Math.min(height - 1, Math.ceil(yEnd)); y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        if (data[(y * width + x) * 4 + 3] < minAlpha) continue;
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (!found) return null;
    return {
      nx0: minX / width,
      ny0: minY / height,
      nx1: maxX / width,
      ny1: maxY / height,
      cx: ((minX + maxX) / 2) / width,
      cy: ((minY + maxY) / 2) / height,
      w: (maxX - minX + 1) / width,
      h: (maxY - minY + 1) / height
    };
  }

  /** Row with widest opaque span in band — approximates shoulder line. */
  function findWidestRowInBand(data, width, height, bounds, yFrac0, yFrac1, minAlpha = 40) {
    const yStart = bounds.minY + bounds.height * yFrac0;
    const yEnd = bounds.minY + bounds.height * yFrac1;
    let best = null;
    let bestSpan = 0;
    for (let y = Math.max(0, Math.floor(yStart)); y <= Math.min(height - 1, Math.ceil(yEnd)); y += 1) {
      let minX = width;
      let maxX = 0;
      let any = false;
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        if (data[(y * width + x) * 4 + 3] < minAlpha) continue;
        any = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      if (!any) continue;
      const span = maxX - minX;
      if (span >= bestSpan) {
        bestSpan = span;
        best = { y, minX, maxX };
      }
    }
    return best;
  }

  /** Cap opaque bounds at the shoulder line so credit/matte junk below the portrait is ignored. */
  function shoulderCapMaxY(data, width, height, bounds, tune) {
    const t = resolvePaperTune(tune);
    const shoulderRow = findWidestRowInBand(
      data,
      width,
      height,
      bounds,
      t.torsoShoulderScan0,
      t.torsoShoulderScan1
    );
    if (!shoulderRow) return bounds.maxY;
    const padPx = Math.max(2, Math.round(bounds.height * (t.torsoShoulderPad + 0.035)));
    const maxBelow = Math.max(padPx, Math.round(bounds.height * t.torsoBodyMaxBelowShoulder));
    return Math.min(bounds.maxY, shoulderRow.y + maxBelow);
  }

  function reboundSubjectBoundsAtMaxY(bounds, maxY) {
    if (!bounds || !Number.isFinite(maxY) || maxY <= bounds.minY) return bounds;
    const capped = Math.min(bounds.maxY, Math.floor(maxY));
    return {
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: capped,
      width: bounds.maxX - bounds.minX + 1,
      height: capped - bounds.minY + 1,
      cx: bounds.cx,
      cy: (bounds.minY + capped) / 2
    };
  }

  function clearAlphaBelowY(data, width, height, maxY) {
    const yStart = Math.max(0, Math.ceil(maxY));
    for (let y = yStart; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        data[i + 3] = 0;
      }
    }
  }

  function torsoRectFromShoulderAnalysis(data, canvasW, canvasH, bounds, tune) {
    const t = resolvePaperTune(tune);
    const shoulderRow = findWidestRowInBand(
      data,
      canvasW,
      canvasH,
      bounds,
      t.torsoShoulderScan0,
      t.torsoShoulderScan1
    );
    const bodyBand = measureBandRect(
      data,
      canvasW,
      canvasH,
      bounds,
      t.torsoBodyFrac0,
      t.torsoBodyFrac1
    );
    if (!shoulderRow && bodyBand) return bodyBand;
    if (!shoulderRow) return torsoRectFromSubjectBounds(bounds, canvasW, canvasH, tune);

    const sidePad = bounds.width * t.torsoSidePad;
    const shoulderMinX = Math.max(bounds.minX, shoulderRow.minX - sidePad);
    const shoulderMaxX = Math.min(bounds.maxX, shoulderRow.maxX + sidePad);
    const ny0 =
      Math.max(bounds.minY, shoulderRow.y - bounds.height * t.torsoShoulderPad) / canvasH;
    const shoulderCapNy = shoulderCapMaxY(data, canvasW, canvasH, bounds, tune) / canvasH;
    const ny1 = Math.min(bodyBand ? bodyBand.ny1 : bounds.maxY / canvasH, shoulderCapNy);
    const nx0 = shoulderMinX / canvasW;
    const nx1 = shoulderMaxX / canvasW;
    const bottomNx0 = bodyBand ? Math.min(nx0, bodyBand.nx0) : nx0 + (nx1 - nx0) * 0.06;
    const bottomNx1 = bodyBand ? Math.max(nx1, bodyBand.nx1) : nx1 - (nx1 - nx0) * 0.06;
    return {
      nx0,
      ny0,
      nx1,
      ny1,
      cx: (nx0 + nx1) / 2,
      cy: (ny0 + ny1) / 2,
      w: nx1 - nx0,
      h: ny1 - ny0,
      shoulderNx0: nx0,
      shoulderNx1: nx1,
      bottomNx0,
      bottomNx1
    };
  }

  function torsoRectFromSubjectBounds(bounds, width, height, tune) {
    const t = resolvePaperTune(tune);
    const nx0 = bounds.minX / width;
    const nx1 = bounds.maxX / width;
    const ny0 = (bounds.minY + bounds.height * t.torsoTopFrac) / height;
    const ny1 = bounds.maxY / height;
    return {
      nx0,
      ny0,
      nx1,
      ny1,
      cx: (nx0 + nx1) / 2,
      cy: (ny0 + ny1) / 2,
      w: nx1 - nx0,
      h: ny1 - ny0
    };
  }

  function extendTorsoRectUpward(rect, tune, minNy0 = 0) {
    if (!rect) return rect;
    const rise = rect.h * resolvePaperTune(tune).torsoShoulderRiseFrac;
    if (!(rise > 0)) return rect;
    const ny0 = Math.max(minNy0, rect.ny0 - rise);
    if (ny0 >= rect.ny1) return rect;
    return {
      ...rect,
      ny0,
      h: rect.ny1 - ny0,
      cy: (ny0 + rect.ny1) / 2
    };
  }

  function tightenMeasuredRect(rect, kind, tune) {
    const t = resolvePaperTune(tune);
    if (!rect) return rect;
    if (kind === 'face') {
      const trimBottom = rect.h * t.faceTrimBottom;
      const ny1 = rect.ny1 - trimBottom;
      return {
        nx0: rect.nx0,
        ny0: rect.ny0,
        nx1: rect.nx1,
        ny1,
        cx: rect.cx,
        cy: (rect.ny0 + ny1) / 2,
        w: rect.w,
        h: ny1 - rect.ny0
      };
    }
    const dropTop = rect.h * t.torsoDropTop;
    const insetX = rect.w * t.torsoInsetX;
    const trimBottom = rect.h * t.torsoTrimBottom;
    const nx0 = rect.nx0 + insetX;
    const nx1 = rect.nx1 - insetX;
    const ny0 = rect.ny0 + dropTop;
    const ny1 = rect.ny1 - trimBottom;
    return {
      nx0,
      ny0,
      nx1,
      ny1,
      cx: (nx0 + nx1) / 2,
      cy: (ny0 + ny1) / 2,
      w: nx1 - nx0,
      h: ny1 - ny0
    };
  }

  function inflateMeasuredRect(rect, factor, kind = '', tune) {
    const t = resolvePaperTune(tune);
    const base = factor != null ? factor : t.paperShapeInflate;
    if (!rect) return rect;
    const cx = rect.cx;
    const cy = rect.cy;
    const widthFactor = kind === 'face' ? t.faceWidthInflate : kind === 'torso' ? t.torsoWidthInflate : base;
    const heightFactor =
      kind === 'face' ? base * t.faceHeightInflateMul : kind === 'torso' ? t.torsoHeightInflate : base;
    const halfW = (rect.w * widthFactor) / 2;
    const halfH = (rect.h * heightFactor) / 2;
    const nx0 = Math.max(0, cx - halfW);
    const nx1 = Math.min(1, cx + halfW);
    const ny0 = Math.max(0, cy - halfH);
    const ny1 = Math.min(1, cy + halfH);
    return {
      nx0,
      ny0,
      nx1,
      ny1,
      cx,
      cy,
      w: nx1 - nx0,
      h: ny1 - ny0
    };
  }

  function seededUnitFactory(seedKey) {
    const cache = new Map();
    return (salt) => {
      const key = `${seedKey}:${salt}`;
      if (!cache.has(key)) cache.set(key, createSeededRng(key));
      return cache.get(key)();
    };
  }

  /** Quilt block hand-cut rectangle — same edge logic as quilt-renderer-v2 createHandCutPolygon. */
  function buildQuiltStyleHandCutRectPolygon(l, t, r, b, seedKey, jitterMultiplier = 1) {
    const width = r - l;
    const height = b - t;
    if (width <= 0.0005 || height <= 0.0005) {
      return [
        [l, t],
        [r, t],
        [r, b],
        [l, b]
      ];
    }
    const rand = seededUnitFactory(seedKey);
    const refPx = 480;
    const pxW = width * refPx;
    const pxH = height * refPx;
    const blockArea = pxW * pxH;
    const minVariation = 1;
    const maxVariation = 8;
    const areaFactor = Math.sqrt(blockArea) / 100;
    let sizeAdjustedVariation;
    if (areaFactor < 2) {
      sizeAdjustedVariation = Math.min(4, Math.max(minVariation, areaFactor * 2));
    } else {
      sizeAdjustedVariation = Math.min(maxVariation, 4 + (areaFactor - 2) * 1.35);
    }
    const handCutVariation = (sizeAdjustedVariation * jitterMultiplier) / refPx;
    let segments;
    if (areaFactor < 2) {
      segments = Math.max(1, Math.min(3, Math.floor(areaFactor * 1.5)));
    } else {
      segments = Math.max(3, Math.min(5, Math.floor(3 + (areaFactor - 2) * 0.7)));
    }
    const cornerNudgePx =
      areaFactor < 1.4 ? 0 : Math.min(3, 0.9 + (areaFactor - 1.4) * 0.9) * jitterMultiplier;
    const cornerNudge = cornerNudgePx / refPx;
    const cornerOffsets =
      cornerNudge > 0
        ? {
            tl: { x: (rand('corner:tl:x') - 0.5) * cornerNudge, y: (rand('corner:tl:y') - 0.5) * cornerNudge },
            tr: { x: (rand('corner:tr:x') - 0.5) * cornerNudge, y: (rand('corner:tr:y') - 0.5) * cornerNudge },
            br: { x: (rand('corner:br:x') - 0.5) * cornerNudge, y: (rand('corner:br:y') - 0.5) * cornerNudge },
            bl: { x: (rand('corner:bl:x') - 0.5) * cornerNudge, y: (rand('corner:bl:y') - 0.5) * cornerNudge }
          }
        : {
            tl: { x: 0, y: 0 },
            tr: { x: 0, y: 0 },
            br: { x: 0, y: 0 },
            bl: { x: 0, y: 0 }
          };
    const cornerOffsetForPoint = (baseX, baseY) => {
      if (baseX === 0 && baseY === 0) return cornerOffsets.tl;
      if (baseX === width && baseY === 0) return cornerOffsets.tr;
      if (baseX === width && baseY === height) return cornerOffsets.br;
      if (baseX === 0 && baseY === height) return cornerOffsets.bl;
      return { x: 0, y: 0 };
    };
    const points = [];
    for (let i = 0; i <= segments; i += 1) {
      const frac = i / segments;
      const baseX = frac * width;
      const baseY = 0;
      const co = cornerOffsetForPoint(baseX, baseY);
      points.push([
        l + baseX + co.x + (rand(`top:${i}:x`) - 0.5) * handCutVariation,
        t + baseY + co.y + (rand(`top:${i}:y`) - 0.5) * handCutVariation
      ]);
    }
    for (let i = 1; i <= segments; i += 1) {
      const frac = i / segments;
      const baseX = width;
      const baseY = frac * height;
      const co = cornerOffsetForPoint(baseX, baseY);
      points.push([
        l + baseX + co.x + (rand(`right:${i}:x`) - 0.5) * handCutVariation,
        t + baseY + co.y + (rand(`right:${i}:y`) - 0.5) * handCutVariation
      ]);
    }
    for (let i = 1; i <= segments; i += 1) {
      const frac = i / segments;
      const baseX = width - frac * width;
      const baseY = height;
      const co = cornerOffsetForPoint(baseX, baseY);
      points.push([
        l + baseX + co.x + (rand(`bottom:${i}:x`) - 0.5) * handCutVariation,
        t + baseY + co.y + (rand(`bottom:${i}:y`) - 0.5) * handCutVariation
      ]);
    }
    for (let i = 1; i <= segments; i += 1) {
      const frac = i / segments;
      const baseX = 0;
      const baseY = height - frac * height;
      const co = cornerOffsetForPoint(baseX, baseY);
      points.push([
        l + baseX + co.x + (rand(`left:${i}:x`) - 0.5) * handCutVariation,
        t + baseY + co.y + (rand(`left:${i}:y`) - 0.5) * handCutVariation
      ]);
    }
    return points;
  }

  function buildSpeakerPaperHandCutPolygon(clip, seedKey, kind) {
    const jitter = kind === 'face' ? 0.92 : 0.88;
    return buildQuiltStyleHandCutRectPolygon(clip.l, clip.t, clip.r, clip.b, seedKey, jitter);
  }

  function resolvePaperShapeClipRect(rect, rng, kind, tune) {
    const tuneCfg = resolvePaperTune(tune);
    const pad = 0.012 + rng() * 0.018;
    let l = Math.max(0, rect.nx0 - pad * rect.w * 0.35);
    let r = Math.min(1, rect.nx1 + pad * rect.w * 0.35);
    let top = Math.max(0, rect.ny0 - pad * rect.h * 0.28);
    let bot = Math.min(1, rect.ny1 + pad * rect.h * 0.22);
    if (kind === 'face') {
      const bw = r - l;
      const bh = bot - top;
      if (bw / Math.max(bh, 0.001) > tuneCfg.faceTargetAspect) {
        const nbw = bh * tuneCfg.faceTargetAspect;
        l = rect.cx - nbw / 2;
        r = rect.cx + nbw / 2;
      }
    }
    return { l, t: top, r, b: bot };
  }

  function handCutPolygonFromBandRect(rect, rng, kind, tune, seedKey = 'odq') {
    const clip = resolvePaperShapeClipRect(rect, rng, kind, tune);
    return buildSpeakerPaperHandCutPolygon(clip, `${seedKey}:${kind}`, kind);
  }

  function fallbackBandRect(kind) {
    if (kind === 'face') {
      return { nx0: 0.34, ny0: 0.05, nx1: 0.66, ny1: 0.52, cx: 0.5, cy: 0.285, w: 0.32, h: 0.47 };
    }
    return { nx0: 0.2, ny0: 0.5, nx1: 0.8, ny1: 0.96, cx: 0.5, cy: 0.73, w: 0.6, h: 0.46 };
  }

  function buildHandCutPaperShapes(analysisCanvas, seed, colors, paperTune, misTune) {
    const tune = resolvePaperTune(paperTune);
    const mt = resolveMisTune(misTune);
    const rng = createSeededRng(`${seed}:paper-shapes`);
    const ctx = analysisCanvas?.getContext?.('2d', { willReadFrequently: true });
    if (!ctx || !analysisCanvas?.width) return null;
    let data;
    try {
      data = ctx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
    } catch (_) {
      return null;
    }
    const bounds = measureSubjectBoundsFromAlpha(data, analysisCanvas.width, analysisCanvas.height);
    let faceRect =
      (bounds &&
        faceRectFromSubjectBounds(bounds, analysisCanvas.width, analysisCanvas.height, tune)) ||
      fallbackBandRect('face');
    let torsoRect =
      (bounds &&
        torsoRectFromShoulderAnalysis(data, analysisCanvas.width, analysisCanvas.height, bounds, tune)) ||
      fallbackBandRect('torso');
    faceRect = inflateMeasuredRect(tightenMeasuredRect(faceRect, 'face', tune), null, 'face', tune);
    torsoRect = tightenMeasuredRect(torsoRect, 'torso', tune);
    torsoRect = extendTorsoRectUpward(
      torsoRect,
      tune,
      bounds ? bounds.minY / analysisCanvas.height : 0
    );
    torsoRect = inflateMeasuredRect(torsoRect, null, 'torso', tune);
    const misPick = (spread, rot) => ({
      tx: (rng() - 0.5) * spread,
      ty: (rng() - 0.5) * spread * 0.85,
      rot: (rng() - 0.5) * rot,
      scale: 1 + (rng() - 0.5) * 0.02
    });
    return {
      face: {
        kind: 'face',
        color: colors.faceColor,
        polygon: handCutPolygonFromBandRect(faceRect, rng, 'face', tune, `${seed}:paper:face`),
        mis: misPick(mt.facePaperSpread, mt.facePaperRot)
      },
      torso: {
        kind: 'torso',
        color: colors.torsoColor,
        polygon: handCutPolygonFromBandRect(torsoRect, rng, 'torso', tune, `${seed}:paper:torso`),
        mis: misPick(mt.torsoPaperSpread, mt.torsoPaperRot)
      }
    };
  }

  function applyPaperShapeElement(el, shape, colorTestMode = false) {
    if (!el || !shape?.polygon) return;
    const clip = shape.clipPath || polygonToClipPath(shape.polygon);
    el.style.clipPath = clip;
    el.style.webkitClipPath = clip;
    el.style.backgroundColor = shape.color;
    el.style.opacity = colorTestMode ? '1' : shape.kind === 'backdrop' ? '1' : '0.96';
    const prefix =
      shape.kind === 'face'
        ? '--speaker-paper-face'
        : shape.kind === 'backdrop'
          ? '--speaker-paper-backdrop'
          : '--speaker-paper-torso';
    Object.entries(cssOffset(shape.mis, prefix)).forEach(([key, value]) => {
      el.style.setProperty(key, value);
    });
  }

  function applyPaperBackdropElement(el, shape, colorTestMode = false) {
    if (!el || !shape) return;
    el.hidden = false;
    el.removeAttribute('hidden');
    applyPaperShapeElement(el, shape, colorTestMode);
    el.style.removeProperty('background-image');
    el.style.removeProperty('background-size');
    el.style.removeProperty('background-position');
    el.style.removeProperty('background-repeat');
    el.style.removeProperty('background-blend-mode');
    el.style.opacity = '1';
  }

  function buildSpeakerCutoutPlan({
    width = 168,
    height = 200,
    washColor = '#ea9b9a',
    seed = 'odq',
    img = null,
    faceColor = '',
    torsoColor = '',
    palette = [],
    paperTune = null,
    misTune = null,
    contourTune = null,
    keepExplicitColors = false,
    colorTestMode = false,
    drawRect = null
  } = {}) {
    const rng = createSeededRng(`${seed}:speaker-cutout-plan`);
    const mis = buildMisregistration(rng, misTune);
    const colors = resolvePaperShapeColors(washColor, {
      faceColor,
      torsoColor,
      palette,
      torsoFallback: '#c9a99a',
      keepExplicitColors
    });
    colors.backdropColor = resolvePaperBackdropColor();
    const shapeW = Math.max(1, Math.round(drawRect?.w || width));
    const shapeH = Math.max(1, Math.round(drawRect?.h || height));
    const shapeLayout = drawRect ? 'width-fill' : 'contain';
    const wash = parseSpeakerWashRgb(colors.washPlateColor);
    const cssVars = {};
    Object.assign(
      cssVars,
      cssOffset(mis.neutral, '--speaker-cutout-neutral'),
      cssOffset(mis.wash, '--speaker-cutout-wash'),
      cssOffset(mis.portrait, '--speaker-cutout-portrait'),
      cssOffset(mis.grain, '--speaker-cutout-grain'),
      cssOffset(mis.contour, '--speaker-cutout-contour')
    );
    cssVars['--speaker-wash-color-fill'] = `rgba(${wash.r}, ${wash.g}, ${wash.b}, 0.88)`;
    cssVars['--speaker-wash-color'] = colors.washPlateColor;
    cssVars['--speaker-paper-face-color'] = colors.faceColor;
    cssVars['--speaker-paper-torso-color'] = colors.torsoColor;
    cssVars['--speaker-paper-backdrop-color'] = colors.backdropColor;
    cssVars['--speaker-cutout-wash-opacity'] = '0.96';
    cssVars['--speaker-cutout-portrait-opacity'] = colorTestMode ? '0.38' : '0.9';
    cssVars['--speaker-cutout-grain-opacity'] = '0.34';
    const resolvedContourTune = resolveContourTune(contourTune);
    cssVars['--speaker-cutout-contour-opacity'] = String(resolvedContourTune.opacity);

    let paperShapes = null;
    let paperBackdrop = null;
    if (img && (img.naturalWidth || img.width)) {
      const analysis = makeSpeakerAlphaSilhouetteCanvas(
        img,
        shapeW,
        shapeH,
        true,
        shapeLayout
      );
      paperShapes = buildHandCutPaperShapes(analysis, seed, colors, paperTune, misTune);
      paperBackdrop = buildPaperBackdropShape(
        analysis,
        seed,
        colors,
        shapeW,
        shapeH,
        paperTune,
        misTune
      );
    }
    if (!paperShapes) {
      const fallbackRng = createSeededRng(`${seed}:paper-fallback`);
      const tune = resolvePaperTune(paperTune);
      paperShapes = {
        torso: {
          kind: 'torso',
          color: colors.torsoColor,
          polygon: handCutPolygonFromBandRect(fallbackBandRect('torso'), fallbackRng, 'torso', tune, `${seed}:paper:torso`),
          mis: { tx: 3.2, ty: 2.1, rot: -0.8, scale: 1.008 }
        },
        face: {
          kind: 'face',
          color: colors.faceColor,
          polygon: handCutPolygonFromBandRect(fallbackBandRect('face'), fallbackRng, 'face', tune, `${seed}:paper:face`),
          mis: { tx: -2.6, ty: -1.4, rot: 0.65, scale: 1.012 }
        }
      };
    }
    if (!paperBackdrop) {
      paperBackdrop = buildPaperBackdropShape(null, seed, colors, width, height, paperTune, misTune);
    }

    Object.entries(cssOffset(paperShapes.torso.mis, '--speaker-paper-torso')).forEach(([k, v]) => {
      cssVars[k] = v;
    });
    Object.entries(cssOffset(paperShapes.face.mis, '--speaker-paper-face')).forEach(([k, v]) => {
      cssVars[k] = v;
    });
    if (paperBackdrop?.mis) {
      Object.entries(cssOffset(paperBackdrop.mis, '--speaker-paper-backdrop')).forEach(([k, v]) => {
        cssVars[k] = v;
      });
    }

    cssVars['--speaker-wash-layer-url'] = 'none';

    let contourLayerUrl = '';
    if (img && (img.naturalWidth || img.width)) {
      try {
        const contourW = Math.max(1, Math.round(drawRect?.w || width));
        const contourH = Math.max(1, Math.round(drawRect?.h || height));
        const sil = makeSpeakerAlphaSilhouetteCanvas(
          img,
          contourW,
          contourH,
          true,
          drawRect ? 'width-fill' : 'contain'
        );
        const contourCanvas = buildSpeakerContourCanvas(sil, resolvedContourTune);
        if (contourCanvas) {
          contourLayerUrl = `url("${contourCanvas.toDataURL('image/png')}")`;
        }
      } catch (_) {
        contourLayerUrl = '';
      }
    }
    cssVars['--speaker-contour-layer-url'] = contourLayerUrl || 'none';

    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      washColor: colors.washPlateColor,
      washFill: cssVars['--speaker-wash-color-fill'],
      washLayerUrl: '',
      contourLayerUrl,
      mis,
      paperShapes,
      paperBackdrop,
      resolvedColors: {
        wash: colors.washPlateColor,
        face: colors.faceColor,
        torso: colors.torsoColor
      },
      colorTestMode: !!colorTestMode,
      paperTune: resolvePaperTune(paperTune),
      misTune: resolveMisTune(misTune),
      contourTune: resolvedContourTune,
      cssVars
    };
  }

  function applyColorWashElement(el, _plan) {
    if (!el) return;
    el.hidden = true;
    el.setAttribute('hidden', '');
    el.style.backgroundImage = 'none';
    el.style.backgroundColor = 'transparent';
    el.style.webkitMaskImage = 'none';
    el.style.maskImage = 'none';
  }

  function applyContourElement(el, plan) {
    if (!el || !plan) return;
    const layerUrl = String(
      plan.contourLayerUrl || plan.cssVars?.['--speaker-contour-layer-url'] || ''
    ).trim();
    if (!layerUrl || layerUrl === 'none') {
      el.hidden = true;
      el.setAttribute('hidden', '');
      el.style.backgroundImage = 'none';
      return;
    }
    el.hidden = false;
    el.removeAttribute('hidden');
    el.style.backgroundImage = layerUrl;
    el.style.backgroundColor = 'transparent';
    el.style.backgroundSize = '100% 100%';
    el.style.backgroundPosition = 'top left';
    el.style.backgroundRepeat = 'no-repeat';
  }

  function applySpeakerCutoutPlanToCutout(cutout, plan) {
    if (!cutout || !plan) return;
    applySpeakerCutoutPlanToElement(cutout, plan);
    cutout.classList.remove('quote-speaker-cutout--paper-shapes');
    applyColorWashElement(cutout.querySelector('.quote-speaker-color-wash'), plan);
    const hideColorLayer = (el) => {
      if (!el) return;
      el.hidden = true;
      el.setAttribute('hidden', '');
      el.style.removeProperty('background-color');
      el.style.removeProperty('clip-path');
      el.style.removeProperty('-webkit-clip-path');
    };
    hideColorLayer(cutout.querySelector('.quote-speaker-paper-shape--backdrop'));
    hideColorLayer(cutout.querySelector('.quote-speaker-paper-layer'));
    hideColorLayer(cutout.querySelector('.quote-speaker-paper-shape--torso'));
    hideColorLayer(cutout.querySelector('.quote-speaker-paper-shape--face'));
    applyContourElement(cutout.querySelector('.quote-speaker-contour'), plan);
  }

  function applySpeakerCutoutPlanToElement(el, plan) {
    if (!el || !plan?.cssVars) return;
    Object.entries(plan.cssVars).forEach(([key, value]) => {
      el.style.setProperty(key, value);
    });
  }

  function maskCutoutFringe(d, width, height, isCutoutPng) {
    if (isCutoutPng) return;
    const pixelIsGreyHalo = (r, g, b, a) => {
      if (a < 48) return false;
      const lum = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      return lum > 88 && lum < 238 && sat < 52 && a < 252;
    };
    const pixelIsFillable = (r, g, b, a) => a >= 52 && !pixelIsGreyHalo(r, g, b, a);
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
        if (!pixelIsFillable(d[i], d[i + 1], d[i + 2], d[i + 3])) continue;
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
        if (!pixelIsFillable(d[i], d[i + 1], d[i + 2], d[i + 3])) continue;
        keep[idx] = 1;
        queue.push([nx, ny]);
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (!keep[idx]) d[idx * 4 + 3] = 0;
      }
    }
  }

  function applyLithographTonePass(d, width, height, seed = 'odq') {
    applyXeroxTonePass(d, width, height, seed);
  }

  const XEROX_TONE = Object.freeze({
    contrast: 1.68,
    brightness: 1.08,
    blackFloor: 62,
    whiteCap: 236,
    bandStrength: 0.11,
    bandPeriodPx: 5.5,
    grainAmp: 14
  });

  function xeroxHashSeedToUnit(seed, x, y) {
    let h = 0;
    const s = `${String(seed || 'odq')}:${x}:${y}`;
    for (let i = 0; i < s.length; i += 1) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return ((h >>> 0) % 10000) / 10000;
  }

  function xeroxBandPhaseFromSeed(seed) {
    let h = 0;
    const s = String(seed || 'odq');
    for (let i = 0; i < s.length; i += 1) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return ((h >>> 0) % 6283) / 1000;
  }

  function rgbaLooksSpeakerCutoutXerox(d, width, height) {
    const {
      blackFloor,
      whiteCap
    } = XEROX_TONE;
    let opaque = 0;
    let gray = 0;
    let inRange = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (d[i + 3] < 20) continue;
        opaque += 1;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        if (Math.abs(r - g) <= 8 && Math.abs(r - b) <= 8) gray += 1;
        if (r >= blackFloor - 4 && r <= whiteCap + 4) inRange += 1;
      }
    }
    return opaque > 400 && gray / opaque > 0.97 && inRange / opaque > 0.85;
  }

  /** Punk-flyer photocopy tone — high contrast, lifted blacks, horizontal bands, grit. */
  function applyXeroxTonePass(d, width, height, seed = 'odq', opts = {}) {
    const warmTape = opts.warmTape === true;
    const bandPhase = xeroxBandPhaseFromSeed(seed);
    const {
      contrast,
      brightness,
      blackFloor,
      whiteCap,
      bandStrength,
      bandPeriodPx,
      grainAmp
    } = warmTape
      ? { ...XEROX_TONE, whiteCap: 255, blackFloor: 58 }
      : XEROX_TONE;
    for (let y = 0; y < height; y += 1) {
      const bandMul =
        1 -
        bandStrength *
          0.5 *
          (1 + Math.sin(y / Math.max(0.8, bandPeriodPx) + bandPhase));
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = d[i + 3];
        if (alpha < 8) {
          d[i + 3] = 0;
          continue;
        }
        let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        lum = ((lum / 255 - 0.5) * contrast + 0.5) * 255 * brightness;
        lum *= bandMul;
        lum += xeroxHashSeedToUnit(seed, x, y) * grainAmp * 2 - grainAmp;
        lum = Math.max(blackFloor, Math.min(whiteCap, lum));
        const v = Math.round(lum);
        if (warmTape) {
          d[i] = Math.min(255, v + 5);
          d[i + 1] = Math.min(255, v + 1);
          d[i + 2] = Math.max(0, v - 9);
        } else {
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
        }
      }
    }
  }

  function applySmoothLithographPass(d, width, height) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = d[i + 3];
        if (alpha < 8) {
          d[i + 3] = 0;
          continue;
        }
        let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        lum = ((lum / 255 - 0.5) * 1.38 + 0.5) * 255 * 1.12;
        lum = Math.max(18, Math.min(252, lum));
        const v = Math.round(lum);
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
      }
    }
  }

  /** Warm cream lithograph ink (R>G>B) — lifted shadows so multiply stays translucent on quilt. */
  function applyWarmSmoothLithographPass(d, width, height) {
    const INK_FLOOR = 58;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = d[i + 3];
        if (alpha < 8) {
          d[i + 3] = 0;
          continue;
        }
        let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        lum = ((lum / 255 - 0.5) * 1.18 + 0.5) * 255 * 1.1;
        lum = Math.max(INK_FLOOR, Math.min(255, lum));
        const v = Math.round(lum);
        d[i] = Math.min(255, v + 10);
        d[i + 1] = Math.min(255, v + 4);
        d[i + 2] = Math.max(0, v - 16);
      }
    }
  }

  /**
   * Duotone multiply plate: dark shadows + lifted highlights (alpha stays 255).
   * Pairs with radial wash — lighter quilt in highlights, darker ink in shadows.
   */
  function applyMultiplyDuotonePass(d, width, height) {
    const SHADOW_CEIL = 132;
    const HIGHLIGHT_FLOOR = 148;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = d[i + 3];
        if (alpha < 8) continue;
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum >= HIGHLIGHT_FLOOR) {
          const t = Math.min(1, (lum - HIGHLIGHT_FLOOR) / (255 - HIGHLIGHT_FLOOR));
          const lift = 0.55 + t * 0.45;
          d[i] = Math.round(d[i] + (255 - d[i]) * lift);
          d[i + 1] = Math.round(d[i + 1] + (255 - d[i + 1]) * lift);
          d[i + 2] = Math.round(d[i + 2] + (255 - d[i + 2]) * lift * 0.88);
        } else if (lum <= SHADOW_CEIL) {
          const t = 1 - lum / SHADOW_CEIL;
          const crush = 0.2 + t * 0.42;
          d[i] = Math.round(d[i] * (1 - crush));
          d[i + 1] = Math.round(d[i + 1] * (1 - crush));
          d[i + 2] = Math.round(d[i + 2] * (1 - crush * 1.08));
        } else {
          const span = HIGHLIGHT_FLOOR - SHADOW_CEIL;
          const mid = (lum - SHADOW_CEIL) / span;
          if (mid < 0.5) {
            const t = (0.5 - mid) * 2;
            d[i] = Math.round(d[i] * (1 - t * 0.1));
            d[i + 1] = Math.round(d[i + 1] * (1 - t * 0.1));
            d[i + 2] = Math.round(d[i + 2] * (1 - t * 0.12));
          } else {
            const t = (mid - 0.5) * 2;
            d[i] = Math.round(d[i] + (255 - d[i]) * t * 0.18);
            d[i + 1] = Math.round(d[i + 1] + (255 - d[i + 1]) * t * 0.18);
            d[i + 2] = Math.round(d[i + 2] + (255 - d[i + 2]) * t * 0.14);
          }
        }
      }
    }
  }

  /** Semi-transparent cream ground masked to portrait — sits on quilt before multiply ink. */
  function buildSpeakerCreamBackdropCanvas(portrait) {
    if (!portrait) return null;
    const c = document.createElement('canvas');
    c.width = portrait.width;
    c.height = portrait.height;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#f2eee6';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(portrait, 0, 0);
    return c;
  }

  /**
   * Per-pixel alpha + highlight lift for quilt-composite lithograph.
   * Global multiplyAlpha alone cannot open highlights when ink alpha stays 255 everywhere.
   */
  function applyQuiltBleedLuminanceAlpha(d, width, height) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = d[i + 3];
        if (alpha < 8) continue;
        let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const t = Math.max(0, Math.min(1, lum / 255));
        if (t > 0.58) {
          const lift = (t - 0.58) / 0.42;
          d[i] = Math.round(d[i] + (255 - d[i]) * lift * 0.58);
          d[i + 1] = Math.round(d[i + 1] + (255 - d[i + 1]) * lift * 0.58);
          d[i + 2] = Math.round(d[i + 2] + (255 - d[i + 2]) * lift * 0.48);
        }
        lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const t2 = Math.max(0, Math.min(1, lum / 255));
        const bleed = Math.pow(1 - t2, 1.16);
        d[i + 3] = Math.round(Math.min(255, alpha * (0.14 + 0.82 * bleed)));
      }
    }
  }

  /** Warm tape-paper tint masked to portrait — multiply only, no flatbed bloom. */
  function buildSpeakerWarmCreamTintCanvas(portrait) {
    if (!portrait) return null;
    const c = document.createElement('canvas');
    c.width = portrait.width;
    c.height = portrait.height;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#f2ead8';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(portrait, 0, 0);
    return c;
  }

  function applyHalftonePass(d, width, height) {
    /** Multiply knocks out 255 — keep a floor so highlights do not read as holes. */
    const HALFTONE_MIN_INK = 218;
    const HALFTONE_DARK_FLOOR = 58;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = d[i + 3];
        if (alpha < 8) {
          d[i + 3] = 0;
          continue;
        }
        const lumNorm = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        const after = ((lumNorm - 0.5) * 1.52 + 0.5) * 1.38;
        const normalized = Math.max(0, Math.min(1, after));
        const threshold = BAYER_4[y % 4][x % 4] / 16;
        const v =
          normalized > threshold
            ? Math.max(
                HALFTONE_MIN_INK,
                Math.round(255 - (normalized - threshold) * 48)
              )
            : Math.max(
                HALFTONE_DARK_FLOOR,
                Math.min(255, Math.round(HALFTONE_DARK_FLOOR + normalized * 255 * 0.34))
              );
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = Math.min(255, alpha * 0.98);
      }
    }
  }

  function makeSpeakerPortraitCanvas(img, outW, outH, isCutoutPng = false, portraitOpts = {}) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(outW));
    c.height = Math.max(1, Math.round(outH));
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    const iw = Math.max(1, img.naturalWidth || img.width);
    const ih = Math.max(1, img.naturalHeight || img.height);
    const layout = portraitOpts.layout || 'contain';
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    drawSpeakerSourceImage(g, img, c.width, c.height, layout, portraitOpts.subjectCrop || null);
    const image = g.getImageData(0, 0, c.width, c.height);
    const d = image.data;
    maskCutoutFringe(d, c.width, c.height, isCutoutPng);
    const toneSeed = String(portraitOpts.seed || portraitOpts.seedKey || 'odq').trim() || 'odq';
    const alreadyXerox = isCutoutPng && rgbaLooksSpeakerCutoutXerox(d, c.width, c.height);
    // Cutout PNGs may be mono-colored warhol plates that still pass the xerox heuristic — always tone.
    const mustToneCutout = isCutoutPng && portraitOpts.skipTone !== true;
    if (portraitOpts.smoothLithograph === true) {
      if (portraitOpts.warmLithograph === true) {
        applyWarmSmoothLithographPass(d, c.width, c.height);
      } else {
        applySmoothLithographPass(d, c.width, c.height);
      }
      if (portraitOpts.quiltBleedAlpha === true) {
        applyQuiltBleedLuminanceAlpha(d, c.width, c.height);
      } else if (portraitOpts.multiplyDuotone === true) {
        applyMultiplyDuotonePass(d, c.width, c.height);
      }
    } else if (mustToneCutout || (!alreadyXerox && portraitOpts.skipTone !== true)) {
      if (portraitOpts.skipHalftone) {
        applyXeroxTonePass(d, c.width, c.height, toneSeed, {
          warmTape: portraitOpts.warmTapePaper === true
        });
      } else {
        applyHalftonePass(d, c.width, c.height);
      }
    }
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
    gx.strokeStyle = 'rgba(35, 27, 20, 0.78)';
    gx.lineWidth = 1;
    const diag = Math.ceil(Math.sqrt(W * W + H * H));
    for (let y = -diag; y <= diag; y += 5) {
      gx.beginPath();
      gx.moveTo(-diag, y + 0.5);
      gx.lineTo(diag, y + 0.5);
      gx.stroke();
    }
    gx.restore();
    gx.save();
    gx.strokeStyle = 'rgba(35, 27, 20, 0.42)';
    gx.lineWidth = 0.85;
    for (let x = 0; x <= W; x += 7) {
      const wobble = ((x * 17) % 5) - 2;
      gx.beginPath();
      gx.moveTo(x + 0.5, 0);
      gx.lineTo(x + 0.5 + wobble * 0.15, H);
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

  function buildSpeakerContourCanvas(alphaCanvas, contourTune) {
    if (!alphaCanvas) return null;
    const tune = resolveContourTune(contourTune);
    const w = alphaCanvas.width;
    const h = alphaCanvas.height;
    const sx = alphaCanvas.getContext('2d', { willReadFrequently: true });
    if (!sx) return null;
    let src;
    try {
      src = sx.getImageData(0, 0, w, h).data;
    } catch (_) {
      return null;
    }
    const threshold = tune.alphaThreshold;
    const alphaAt = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return 0;
      return src[(y * w + x) * 4 + 3];
    };
    const solidAt = (x, y) => alphaAt(x, y) > threshold;
    const exterior = new Uint8Array(w * h);
    const queue = [];
    const markExterior = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      if (solidAt(x, y)) return;
      const i = y * w + x;
      if (exterior[i]) return;
      exterior[i] = 1;
      queue.push(x, y);
    };
    for (let x = 0; x < w; x += 1) {
      markExterior(x, 0);
      markExterior(x, h - 1);
    }
    for (let y = 0; y < h; y += 1) {
      markExterior(0, y);
      markExterior(w - 1, y);
    }
    for (let qi = 0; qi < queue.length; qi += 2) {
      const x = queue[qi];
      const y = queue[qi + 1];
      markExterior(x - 1, y);
      markExterior(x + 1, y);
      markExterior(x, y - 1);
      markExterior(x, y + 1);
    }
    const touchesExterior = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return true;
      return exterior[y * w + x] === 1;
    };
    const edge = document.createElement('canvas');
    edge.width = w;
    edge.height = h;
    const ex = edge.getContext('2d');
    if (!ex) return null;
    ex.clearRect(0, 0, w, h);
    ex.fillStyle = `rgba(${tune.strokeRgb}, ${tune.strokeAlpha})`;
    const radius = Math.max(0.5, tune.strokePx);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!solidAt(x, y)) continue;
        if (
          !touchesExterior(x - 1, y) &&
          !touchesExterior(x + 1, y) &&
          !touchesExterior(x, y - 1) &&
          !touchesExterior(x, y + 1)
        ) {
          continue;
        }
        ex.beginPath();
        ex.arc(x + 0.5, y + 0.5, radius, 0, Math.PI * 2);
        ex.fill();
      }
    }
    return edge;
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

  /** Pre–June 4 Layout B radial wash: quote tint + cream edge, masked to portrait silhouette. */
  function buildSpeakerRadialWashCanvas(portrait, washColor) {
    if (!portrait) return null;
    const wash = parseSpeakerWashRgb(washColor);
    const washLayer = document.createElement('canvas');
    washLayer.width = portrait.width;
    washLayer.height = portrait.height;
    const wx = washLayer.getContext('2d');
    if (!wx) return null;
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
    grad.addColorStop(0.82, 'rgba(255,244,218,0.22)');
    grad.addColorStop(1, 'rgba(255,244,218,0.32)');
    wx.fillStyle = grad;
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

  function drawPaperPolygonOnCtx(ctx, polygon, rect, mis, color, alpha = 0.9) {
    if (!polygon || polygon.length < 3 || !mis) return;
    ctx.save();
    ctx.translate(rect.width * (mis.tx / 100), rect.height * (mis.ty / 100));
    ctx.rotate((mis.rot * Math.PI) / 180);
    ctx.scale(mis.scale, mis.scale);
    ctx.beginPath();
    polygon.forEach(([px, py], i) => {
      const x = (px - 0.5) * rect.width;
      const y = (py - 0.5) * rect.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fill();
    ctx.restore();
  }

  function drawPaperTexturedPolygonOnCtx(ctx, polygon, rect, mis, paperColor, alpha = 0.98) {
    if (!polygon || polygon.length < 3 || !mis) return;
    const layer = document.createElement('canvas');
    layer.width = Math.max(1, Math.round(rect.width));
    layer.height = Math.max(1, Math.round(rect.height));
    const lx = layer.getContext('2d');
    if (!lx) return;
    lx.save();
    lx.translate(layer.width * (mis.tx / 100), layer.height * (mis.ty / 100));
    lx.rotate((mis.rot * Math.PI) / 180);
    lx.scale(mis.scale, mis.scale);
    lx.beginPath();
    polygon.forEach(([px, py], i) => {
      const x = (px - 0.5) * layer.width;
      const y = (py - 0.5) * layer.height;
      if (i === 0) lx.moveTo(x, y);
      else lx.lineTo(x, y);
    });
    lx.closePath();
    lx.clip();
    fillSpeakerStripPaperInCtx(lx, layer.width, layer.height);
    lx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
    ctx.restore();
  }

  function isSpeakerPopArtEnabled() {
    return globalThis.CONFIG?.APP?.speakerPopArtEnabled === true;
  }

  /** B/W cutout — tape paper mat + lithograph multiply (newsprint stack opt-in via newsprintSurface). */
  function drawSpeakerCutoutPlain(g, img, rect, options = {}) {
    if (!g || !img || !rect || rect.width <= 0 || rect.height <= 0) return false;
    const isCutoutPng = !!options.isCutoutPng;
    const layout = options.layout || 'contain';
    const seed = String(options.seed || options.seedKey || 'odq').trim() || 'odq';
    const newsprint = speakerNewsprintSurfaceEnabled(options);
    const QNC = root.QuiltNewspaperClipping || globalThis.QuiltNewspaperClipping;
    let portrait = null;
    let alphaSil = null;
    let backingSil = null;
    let clipSil = null;
    try {
      const subjectCrop = options.subjectCrop || null;
      portrait = makeSpeakerPortraitCanvas(img, rect.width, rect.height, isCutoutPng, {
        skipHalftone: true,
        warmTapePaper: !newsprint,
        smoothLithograph: options.smoothLithograph === true,
        seed,
        layout,
        subjectCrop
      });
      alphaSil = makeSpeakerAlphaSilhouetteCanvas(
        img,
        rect.width,
        rect.height,
        isCutoutPng,
        layout,
        false,
        subjectCrop
      );
      backingSil = isCutoutPng
        ? makeSpeakerFilledSilhouetteCanvas(img, rect.width, rect.height, isCutoutPng, layout, subjectCrop)
        : alphaSil;
      clipSil = isCutoutPng
        ? makeSpeakerPlainCutoutAlphaSilhouetteCanvas(img, rect.width, rect.height, layout, subjectCrop)
        : alphaSil;
    } catch (_) {
      return false;
    }
    if (!portrait) return false;
    const pw = portrait.width;
    const ph = portrait.height;
    const mis = buildMisregistration(createSeededRng(`${seed}:speaker-cutout-plain`), options.misTune)
      .portrait;
    const multiplyAlpha =
      options.portraitAlpha != null
        ? options.portraitAlpha
        : isCutoutPng
          ? 1
          : 0.86;
    const bedSil = backingSil || alphaSil || portrait;
    const maskSil = clipSil || bedSil;
    const ox = -rect.width / 2;
    const oy = -rect.height / 2;

    g.save();
    g.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    g.rotate(rect.angle || 0);

    if (newsprint) {
      if (typeof options.drawScannerBed === 'function') {
        options.drawScannerBed(g, ox, oy, pw, ph, portrait);
      } else if (options.drawScannerBed !== false) {
        const drawBed = createSpeakerPortraitScannerBedDrawer(seed);
        if (drawBed) drawBed(g, ox, oy, rect.width, rect.height, portrait);
      }
    }

    if (!(options.skipPaperMat && isCutoutPng)) {
      const creamSil = document.createElement('canvas');
      creamSil.width = pw;
      creamSil.height = ph;
      const csx = creamSil.getContext('2d');
      if (csx) {
        const neutralMis = buildMisregistration(
          createSeededRng(`${seed}:speaker-cutout-plain`),
          options.misTune
        ).neutral;
        csx.save();
        csx.translate(pw * (neutralMis.tx / 100), ph * (neutralMis.ty / 100));
        csx.rotate((neutralMis.rot * Math.PI) / 180);
        csx.scale(neutralMis.scale, neutralMis.scale);
        csx.drawImage(bedSil, 0, 0);
        csx.globalCompositeOperation = 'source-in';
        const paper = safeHex(options.paper, SPEAKER_STRIP_PAPER);
        if (newsprint && QNC?.drawNewsprintSurfaceStack) {
          QNC.drawNewsprintSurfaceStack(csx, pw, ph, {
            paper,
            paperTextureUrl: null
          });
        } else {
          fillSpeakerTapePaperInCtx(csx, pw, ph, paper);
        }
        csx.restore();
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.drawImage(creamSil, ox, oy, rect.width, rect.height);
      }
    }

    drawOffsetLayer(g, portrait, rect, mis, multiplyAlpha, 'multiply');

    if (newsprint && QNC?.drawNewsprintTextureOverlay) {
      g.save();
      g.translate(ox, oy);
      drawCanvasLayerClippedToMask(g, maskSil, 0, 0, pw, ph, (lx, w, h) => {
        QNC.drawNewsprintTextureOverlay(lx, w, h, { paperTextureUrl: null });
      });
      g.restore();
    }

    g.restore();
    return true;
  }

  /**
   * Lithograph multiply over quilt (Layout B IG): warm cream ink + light grain.
   * Cream comes from warm lithograph ink and a low-alpha multiply tint — not scanner bed,
   * which paints bright pixels and kills quilt bleed-through (even at soft-light).
   */
  function drawSpeakerCutoutOverQuilt(g, img, rect, options = {}) {
    if (!g || !img || !rect || rect.width <= 0 || rect.height <= 0) return false;
    const isCutoutPng = !!options.isCutoutPng;
    const seed = String(options.seed || options.seedKey || 'odq').trim() || 'odq';
    const layout = options.layout || 'contain';
    const subjectCrop = options.subjectCrop || null;
    const useRadialWash = options.radialWash !== false;
    let portrait = null;
    try {
      portrait = makeSpeakerPortraitCanvas(img, rect.width, rect.height, isCutoutPng, {
        seed,
        smoothLithograph: true,
        warmLithograph: true,
        // Radial wash path: duotone multiply plate + cream wash (no alpha bleed).
        quiltBleedAlpha: !useRadialWash,
        multiplyDuotone: useRadialWash,
        layout,
        subjectCrop
      });
    } catch (_) {
      return false;
    }
    if (!portrait) return false;

    const mis = buildMisregistration(createSeededRng(`${seed}:speaker-cutout-quilt`), options.misTune);
    const grain =
      options.layers?.grain === false ? null : buildSpeakerGrainCanvas(portrait);
    const washColor = options.washColor || '#ea9b9a';
    const radialWash = useRadialWash ? buildSpeakerRadialWashCanvas(portrait, washColor) : null;
    const creamBackdrop =
      useRadialWash && options.creamBackdrop !== false
        ? buildSpeakerCreamBackdropCanvas(portrait)
        : null;
    const creamBackdropAlpha =
      options.creamBackdropAlpha != null ? options.creamBackdropAlpha : 0.4;
    const multiplyAlpha =
      options.portraitAlpha != null ? options.portraitAlpha : useRadialWash ? 0.92 : 0.85;
    const washAlpha = options.washAlpha != null ? options.washAlpha : 0.62;
    const grainAlpha = options.grainAlpha != null ? options.grainAlpha : 0.2;
    const bleedPhase = String(options.bleedPhase || 'unknown').trim() || 'unknown';
    const skipBed =
      options.skipScannerBed === true || options.drawScannerBed === false;
    const sampleX = rect.x + rect.width / 2;
    const sampleY = rect.y + rect.height / 2;
    const beforePx = _odqDbg7240SampleCtx(g, sampleX, sampleY);
    const srcPx = _odqDbg7240SampleImg(img);
    const portraitPx = _odqDbg7240SamplePortrait(portrait);
    const portraitRange = _odqDbg7240SamplePortraitRange(portrait);
    // #region agent log
    _odqDbg7240(
      'speaker-cutout-render.js:drawSpeakerCutoutOverQuilt',
      'overQuilt draw start',
      {
        debugBuild: 'cream-tune-v4.7',
        bleedPhase,
        skipBed,
        skipScannerBed: options.skipScannerBed === true,
        drawScannerBed: options.drawScannerBed,
        multiplyAlpha,
        washAlpha,
        creamBackdropAlpha: creamBackdrop ? creamBackdropAlpha : null,
        radialWash: !!radialWash,
        creamBackdrop: !!creamBackdrop,
        multiplyDuotone: useRadialWash,
        quiltBleedAlpha: !useRadialWash,
        portraitHighlight: portraitRange.highlight,
        portraitShadow: portraitRange.shadow,
        isCutoutPng,
        beforePx,
        srcPx,
        portraitPx,
        srcLooksCreamFilled:
          !!srcPx &&
          srcPx.a > 200 &&
          srcPx.r > 228 &&
          srcPx.g > 222 &&
          srcPx.b > 210 &&
          Math.abs(srcPx.r - srcPx.g) < 12
      },
      'B'
    );
    // #endregion

    g.save();
    g.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    g.rotate(rect.angle || 0);

    if (!skipBed) {
      const scannerBedAlpha =
        options.scannerBedAlpha != null ? options.scannerBedAlpha : 0.42;
      const drawBed = createSpeakerPortraitScannerBedDrawer(seed, {
        composite: 'soft-light',
        alpha: scannerBedAlpha
      });
      if (drawBed) {
        drawBed(g, -rect.width / 2, -rect.height / 2, rect.width, rect.height, portrait);
      }
    }

    if (creamBackdrop) {
      drawOffsetLayer(g, creamBackdrop, rect, mis.portrait, creamBackdropAlpha, 'source-over');
    }
    drawOffsetLayer(g, portrait, rect, mis.portrait, multiplyAlpha, 'multiply');
    if (radialWash) {
      drawOffsetLayer(g, radialWash, rect, mis.portrait, washAlpha, 'source-over');
    }
    if (grain) {
      drawOffsetLayer(g, grain, rect, mis.grain, grainAlpha, 'multiply');
    }

    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.restore();
    const afterPx = _odqDbg7240SampleCtx(g, sampleX, sampleY);
    const highlightPreserveRatio =
      beforePx && afterPx && beforePx.r > 40
        ? Math.round((afterPx.r / beforePx.r) * 100) / 100
        : null;
    // #region agent log
    _odqDbg7240(
      'speaker-cutout-render.js:drawSpeakerCutoutOverQuilt',
      'overQuilt draw end',
      {
        afterPx,
        bleedPhase,
        quiltTintDelta:
          beforePx && afterPx
            ? Math.abs(afterPx.r - beforePx.r) +
              Math.abs(afterPx.g - beforePx.g) +
              Math.abs(afterPx.b - beforePx.b)
            : null,
        looksOpaqueCream:
          !!afterPx &&
          afterPx.r > 220 &&
          afterPx.g > 215 &&
          afterPx.b > 200 &&
          (!beforePx || Math.abs(afterPx.r - beforePx.r) < 25),
        highlightPreserveRatio
      },
      'D'
    );
    try {
      console.log(
        '[nightly-ig:speaker-bleed]',
        JSON.stringify({
          debugBuild: 'cream-tune-v4.7',
          bleedPhase,
          portraitA: portraitPx?.a ?? null,
          portraitR: portraitPx?.r ?? null,
          portraitShadowR: portraitRange.shadow?.r ?? null,
          portraitHighlightR: portraitRange.highlight?.r ?? null,
          radialWash: !!radialWash,
          creamBackdrop: !!creamBackdrop,
          creamBackdropAlpha: creamBackdrop ? creamBackdropAlpha : null,
          multiplyDuotone: useRadialWash,
          quiltBleedAlpha: !useRadialWash,
          washAlpha,
          highlightPreserveRatio,
          multiplyAlpha
        })
      );
    } catch (_) {
      /* ignore */
    }
    // #endregion
    return true;
  }

  /**
   * @param {CanvasRenderingContext2D} g
   * @param {HTMLImageElement|HTMLCanvasElement} img
   * @param {{ x, y, width, height, angle? }} rect top-left x/y, center pivot applied internally
   */
  function drawSpeakerCutoutStack(g, img, rect, options = {}) {
    if (!g || !img || !rect || rect.width <= 0 || rect.height <= 0) return false;
    let branch = 'popArt';
    if (options.compositeOverQuilt === true) branch = 'overQuilt';
    else if (options.popArtEnabled === false || !isSpeakerPopArtEnabled()) branch = 'plainOpaque';
    // #region agent log
    _odqDbg7240(
      'speaker-cutout-render.js:drawSpeakerCutoutStack',
      'render branch',
      {
        branch,
        compositeOverQuilt: options.compositeOverQuilt === true,
        popArtEnabled: isSpeakerPopArtEnabled(),
        skipScannerBed: options.skipScannerBed === true,
        drawScannerBed: options.drawScannerBed
      },
      'A'
    );
    // #endregion
    if (options.compositeOverQuilt === true) {
      return drawSpeakerCutoutOverQuilt(g, img, rect, options);
    }
    if (options.popArtEnabled === false || !isSpeakerPopArtEnabled()) {
      return drawSpeakerPlainCutoutLayer(g, img, rect, options);
    }
    const isCutoutPng = !!options.isCutoutPng;
    const isHeroPost = Math.max(0, Math.min(1, Number(options.solidMatOpacity) || 0)) > 0;
    const washColor = options.washColor || '#ea9b9a';
    const seed = String(options.seed || options.seedKey || 'odq').trim() || 'odq';
    const layers = {
      backdrop: options.layers?.backdrop === true,
      wash: options.layers?.wash === true,
      torso: options.layers?.torso === true,
      face: options.layers?.face === true,
      grain: options.layers?.grain !== false,
      contour: options.layers?.contour !== false
    };
    const plan = buildSpeakerCutoutPlan({
      width: rect.width,
      height: rect.height,
      washColor,
      seed,
      img,
      faceColor: options.faceColor,
      torsoColor: options.torsoColor,
      palette: options.palette,
      paperTune: options.paperTune,
      misTune: options.misTune,
      contourTune: options.contourTune,
      keepExplicitColors: !!options.keepExplicitColors,
      colorTestMode: !!options.colorTestMode
    });

    let portrait = null;
    let alphaSil = null;
    try {
      portrait = makeSpeakerPortraitCanvas(img, rect.width, rect.height, isCutoutPng, {
        seed,
        smoothLithograph: true
      });
      alphaSil = makeSpeakerAlphaSilhouetteCanvas(img, rect.width, rect.height, isCutoutPng);
    } catch (_) {
      return false;
    }
    if (!portrait) return false;

    const grain = buildSpeakerGrainCanvas(portrait);
    const contourLayer = buildSpeakerContourCanvas(alphaSil || portrait, plan.contourTune);
    const washLayer = layers.wash
      ? buildSpeakerWashCanvas(alphaSil || portrait, plan.washColor)
      : null;
    const pw = portrait.width;
    const ph = portrait.height;
    const QNC = root.QuiltNewspaperClipping || globalThis.QuiltNewspaperClipping;
    const multiplyAlpha =
      options.portraitAlpha != null
        ? options.portraitAlpha
        : options.colorTestMode
          ? 0.38
          : isHeroPost
            ? isCutoutPng
              ? 0.9
              : 0.86
            : 0.95;
    const grainAlpha =
      options.grainAlpha != null ? options.grainAlpha : isHeroPost ? 0.27 : 0.34;
    const contourAlpha =
      options.contourAlpha != null
        ? options.contourAlpha
        : plan.contourTune?.opacity ?? DEFAULT_CONTOUR_TUNE.opacity;
    const washAlpha = options.washAlpha != null ? options.washAlpha : isHeroPost ? 0.58 : 0.78;
    const paperAlpha =
      options.paperAlpha != null
        ? options.paperAlpha
        : options.colorTestMode
          ? 1
          : isHeroPost
            ? 0.85
            : 0.88;
    const backdropAlpha =
      options.backdropAlpha != null ? options.backdropAlpha : isHeroPost ? 0.96 : 0.98;

    g.save();
    g.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    g.rotate(rect.angle || 0);

    if (typeof options.drawScannerBed === 'function') {
      options.drawScannerBed(g, -rect.width / 2, -rect.height / 2, pw, ph, portrait);
    } else if (!options.skipScannerBed) {
      const drawBed = createSpeakerPortraitScannerBedDrawer(seed);
      if (drawBed) {
        drawBed(g, -rect.width / 2, -rect.height / 2, rect.width, rect.height, portrait);
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
        csx.drawImage(alphaSil || portrait, 0, 0);
        csx.globalCompositeOperation = 'source-in';
        csx.fillStyle = `rgb(${MAT_RGB})`;
        csx.fillRect(-4, -4, pw + 8, ph + 8);
        csx.restore();
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.drawImage(creamSil, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
      }
    }

    if (layers.backdrop && plan.paperBackdrop) {
      drawPaperTexturedPolygonOnCtx(
        g,
        plan.paperBackdrop.polygon,
        rect,
        plan.paperBackdrop.mis,
        plan.paperBackdrop.color,
        backdropAlpha
      );
    }

    if (layers.wash) {
      drawOffsetLayer(g, washLayer, rect, plan.mis.wash, washAlpha, 'source-over');
    }

    if (plan.paperShapes) {
      if (layers.torso) {
        drawPaperPolygonOnCtx(
          g,
          plan.paperShapes.torso.polygon,
          rect,
          plan.paperShapes.torso.mis,
          plan.paperShapes.torso.color,
          paperAlpha
        );
      }
      if (layers.face) {
        drawPaperPolygonOnCtx(
          g,
          plan.paperShapes.face.polygon,
          rect,
          plan.paperShapes.face.mis,
          plan.paperShapes.face.color,
          paperAlpha
        );
      }
    }

    drawOffsetLayer(g, portrait, rect, plan.mis.portrait, multiplyAlpha, 'multiply');

    if (layers.grain) {
      drawOffsetLayer(g, grain, rect, plan.mis.grain, grainAlpha, 'multiply');
    }

    if (layers.contour && contourLayer) {
      drawOffsetLayer(g, contourLayer, rect, plan.mis.contour, contourAlpha, 'source-over');
    }

    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.restore();
    return true;
  }

  root.SpeakerCutoutRender = {
    createSeededRng,
    parseSpeakerWashRgb,
    safeHex,
    DEFAULT_PAPER_TUNE,
    DEFAULT_BACKDROP_HANDCUT_CFG,
    DEFAULT_MIS_TUNE,
    DEFAULT_CONTOUR_TUNE,
    resolvePaperTune,
    resolveMisTune,
    resolveContourTune,
    SPEAKER_STRIP_PAPER,
    resolvePaperBackdropColor,
    resolveSpeakerCardColorsFromQuilt,
    washOutSpeakerQuiltColor,
    buildSpeakerCutoutPlan,
    applySpeakerCutoutPlanToElement,
    applyColorWashElement,
    applyContourElement,
    applyPaperBackdropElement,
    applySpeakerCutoutPlanToCutout,
    makeSpeakerPortraitCanvas,
    makeSpeakerAlphaSilhouetteCanvas,
    makeSpeakerFilledSilhouetteCanvas,
    buildSpeakerFilledPaperSilhouetteDataUrl,
    buildSpeakerFilledPaperSilhouetteDataUrlAsync,
    buildSpeakerCutoutExportDataUrl,
    prepareSpeakerCutoutExportDataUrl,
    buildSpeakerPlainCutoutCompositeDataUrl,
    buildSpeakerPlainCutoutCompositeDataUrlAsync,
    buildSpeakerPlainCutoutLayerCanvas,
    drawSpeakerPlainCutoutLayer,
    drawSpeakerCutoutOverQuilt,
    createSpeakerPortraitScannerBedDrawer,
    ensureSpeakerNewsprintAssets,
    fillSpeakerStripPaperInCtx,
    fillSpeakerTapePaperInCtx,
    speakerNewsprintSurfaceEnabled,
    fillInteriorAlphaHoles,
    fillPortraitInteriorHolesWithPaper,
    buildSpeakerGrainCanvas,
    buildSpeakerWashCanvas,
    buildSpeakerContourCanvas,
    isSpeakerPopArtEnabled,
    drawSpeakerCutoutPlain,
    drawSpeakerCutoutStack,
    measureSpeakerOpaqueBoundsFromImage
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
