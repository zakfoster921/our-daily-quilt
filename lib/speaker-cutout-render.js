/**
 * Warhol / xerox speaker cutout stack — shared by in-app card, Layout B, quote collage.
 * Layer order (bottom → top): scanner bed → cream mat → backdrop → wash → paper shapes → B/W portrait → grain → contour trace.
 */
(function (root) {
  'use strict';

  const MAT_RGB = '242, 238, 230';
  /** Same flat field as #screen-quilt .quote-speaker-slab center (no torn tape caps). */
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
    torso: { satMul: 0.4, satMin: 12, satMax: 38, valMul: 0.72, valAdd: 22, valMin: 70, valMax: 86, creamMix: 0.11 }
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

  function fillSpeakerStripPaperInCtx(ctx, w, h) {
    const pad = 24;
    ctx.fillStyle = SPEAKER_STRIP_PAPER;
    ctx.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);
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
    if (ctx && analysisCanvas?.width) {
      try {
        const data = ctx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
        bounds = measureSubjectBoundsFromAlpha(data, analysisCanvas.width, analysisCanvas.height);
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

  function makeSpeakerAlphaSilhouetteCanvas(
    img,
    outW,
    outH,
    isCutoutPng = false,
    layout = 'contain',
    fillInteriorHoles = false
  ) {
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

  function makeSpeakerFilledSilhouetteCanvas(img, outW, outH, isCutoutPng = true, layout = 'contain') {
    return makeSpeakerAlphaSilhouetteCanvas(img, outW, outH, isCutoutPng, layout, true);
  }

  function buildSpeakerFilledPaperSilhouetteDataUrl(img, outW, outH, layout = 'width-fill') {
    const sil = makeSpeakerFilledSilhouetteCanvas(img, outW, outH, true, layout);
    if (!sil) return '';
    const c = document.createElement('canvas');
    c.width = sil.width;
    c.height = sil.height;
    const g = c.getContext('2d');
    if (!g) return '';
    g.drawImage(sil, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${MAT_RGB})`;
    g.fillRect(0, 0, c.width, c.height);
    try {
      return c.toDataURL('image/png');
    } catch (_) {
      return '';
    }
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

  /** Cream hole-fill + portrait in one PNG — outer edge matches cutout; interior holes read as paper. */
  function buildSpeakerPlainCutoutCompositeDataUrl(img, outW, outH, layout = 'width-fill') {
    return buildSpeakerCutoutExportDataUrl(img, outW, outH, layout);
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
    const ny1 = bodyBand ? bodyBand.ny1 : bounds.maxY / canvasH;
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

    let washLayerUrl = '';
    if (img && (img.naturalWidth || img.width)) {
      try {
        const washW = Math.max(1, Math.round(drawRect?.w || width));
        const washH = Math.max(1, Math.round(drawRect?.h || height));
        const sil = makeSpeakerAlphaSilhouetteCanvas(
          img,
          washW,
          washH,
          true,
          drawRect ? 'width-fill' : 'contain'
        );
        const washCanvas = buildSpeakerWashCanvas(sil, colors.washPlateColor);
        if (washCanvas) {
          washLayerUrl = `url("${washCanvas.toDataURL('image/png')}")`;
        }
      } catch (_) {
        washLayerUrl = '';
      }
    }
    cssVars['--speaker-wash-layer-url'] = washLayerUrl || 'none';

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
      washLayerUrl,
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

  function applyColorWashElement(el, plan) {
    if (!el || !plan) return;
    el.hidden = false;
    el.removeAttribute('hidden');
    const layerUrl = String(plan.washLayerUrl || plan.cssVars?.['--speaker-wash-layer-url'] || '').trim();
    if (layerUrl && layerUrl !== 'none') {
      el.style.backgroundImage = layerUrl;
      el.style.backgroundColor = 'transparent';
      el.style.webkitMaskImage = 'none';
      el.style.maskImage = 'none';
    } else if (plan.washFill) {
      el.style.backgroundColor = plan.washFill;
      el.style.backgroundImage = 'none';
    }
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
    const colorTestMode = !!plan.colorTestMode;
    applySpeakerCutoutPlanToElement(cutout, plan);
    cutout.classList.add('quote-speaker-cutout--paper-shapes');
    applyColorWashElement(cutout.querySelector('.quote-speaker-color-wash'), plan);
    applyPaperBackdropElement(
      cutout.querySelector('.quote-speaker-paper-shape--backdrop'),
      plan.paperBackdrop,
      colorTestMode
    );
    const layer = cutout.querySelector('.quote-speaker-paper-layer');
    if (!layer || !plan.paperShapes) return;
    layer.hidden = false;
    applyPaperShapeElement(
      layer.querySelector('.quote-speaker-paper-shape--torso'),
      plan.paperShapes.torso,
      colorTestMode
    );
    applyPaperShapeElement(
      layer.querySelector('.quote-speaker-paper-shape--face'),
      plan.paperShapes.face,
      colorTestMode
    );
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
    /** Multiply knocks out 255 — keep a floor so highlights do not read as holes. */
    const HALFTONE_MIN_INK = 212;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = d[i + 3];
        if (alpha < 8) {
          d[i + 3] = 0;
          continue;
        }
        const lumNorm = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        const after = ((lumNorm - 0.5) * 1.38 + 0.5) * 1.42;
        const normalized = Math.max(0, Math.min(1, after));
        const threshold = BAYER_4[y % 4][x % 4] / 16;
        const v =
          normalized > threshold
            ? Math.max(
                HALFTONE_MIN_INK,
                Math.round(255 - (normalized - threshold) * 56)
              )
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
    const scale = Math.min(c.width / iw, c.height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (c.width - dw) / 2;
    const dy = (c.height - dh) / 2;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, dx, dy, dw, dh);
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

  /** B/W cutout only — cream mat (non-PNG) + lithograph multiply, no wash/paper. */
  function drawSpeakerCutoutPlain(g, img, rect, options = {}) {
    if (!g || !img || !rect || rect.width <= 0 || rect.height <= 0) return false;
    const isCutoutPng = !!options.isCutoutPng;
    const seed = String(options.seed || options.seedKey || 'odq').trim() || 'odq';
    let portrait = null;
    let alphaSil = null;
    let backingSil = null;
    try {
      portrait = makeSpeakerPortraitCanvas(img, rect.width, rect.height, isCutoutPng);
      alphaSil = makeSpeakerAlphaSilhouetteCanvas(img, rect.width, rect.height, isCutoutPng);
      backingSil = isCutoutPng
        ? makeSpeakerFilledSilhouetteCanvas(img, rect.width, rect.height, isCutoutPng)
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
      options.portraitAlpha != null ? options.portraitAlpha : isCutoutPng ? 0.9 : 0.86;
    const QNC = root.QuiltNewspaperClipping || globalThis.QuiltNewspaperClipping;
    const bedSil = backingSil || alphaSil || portrait;

    g.save();
    g.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    g.rotate(rect.angle || 0);

    if (typeof options.drawScannerBed === 'function') {
      options.drawScannerBed(g, -rect.width / 2, -rect.height / 2, pw, ph, portrait);
    } else if (options.drawScannerBed !== false && QNC?.drawScannerBed) {
      const bed = document.createElement('canvas');
      bed.width = pw;
      bed.height = ph;
      const bctx = bed.getContext('2d');
      if (bctx) {
        QNC.drawScannerBed(bctx, bed.width, bed.height, `${seed}:speaker-cutout:0`, 'speakerCutout');
        bctx.globalCompositeOperation = 'destination-in';
        bctx.drawImage(bedSil, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.drawImage(bed, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
      }
    }

    {
      const creamSil = document.createElement('canvas');
      creamSil.width = pw;
      creamSil.height = ph;
      const csx = creamSil.getContext('2d');
      if (csx) {
        const neutralMis = buildMisregistration(createSeededRng(`${seed}:speaker-cutout-plain`), options.misTune)
          .neutral;
        csx.save();
        csx.translate(pw * (neutralMis.tx / 100), ph * (neutralMis.ty / 100));
        csx.rotate((neutralMis.rot * Math.PI) / 180);
        csx.scale(neutralMis.scale, neutralMis.scale);
        csx.drawImage(bedSil, 0, 0);
        csx.globalCompositeOperation = 'source-in';
        csx.fillStyle = `rgb(${MAT_RGB})`;
        csx.fillRect(-4, -4, pw + 8, ph + 8);
        csx.restore();
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.drawImage(creamSil, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
      }
    }

    drawOffsetLayer(g, portrait, rect, mis, multiplyAlpha, 'multiply');
    g.restore();
    return true;
  }

  /**
   * @param {CanvasRenderingContext2D} g
   * @param {HTMLImageElement|HTMLCanvasElement} img
   * @param {{ x, y, width, height, angle? }} rect top-left x/y, center pivot applied internally
   */
  function drawSpeakerCutoutStack(g, img, rect, options = {}) {
    if (!g || !img || !rect || rect.width <= 0 || rect.height <= 0) return false;
    if (options.popArtEnabled === false || !isSpeakerPopArtEnabled()) {
      return drawSpeakerCutoutPlain(g, img, rect, options);
    }
    const isCutoutPng = !!options.isCutoutPng;
    const isHeroPost = Math.max(0, Math.min(1, Number(options.solidMatOpacity) || 0)) > 0;
    const washColor = options.washColor || '#ea9b9a';
    const seed = String(options.seed || options.seedKey || 'odq').trim() || 'odq';
    const layers = {
      backdrop: options.layers?.backdrop !== false,
      wash: options.layers?.wash !== false,
      torso: options.layers?.torso !== false,
      face: options.layers?.face !== false,
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
      portrait = makeSpeakerPortraitCanvas(img, rect.width, rect.height, isCutoutPng);
      alphaSil = makeSpeakerAlphaSilhouetteCanvas(img, rect.width, rect.height, isCutoutPng);
    } catch (_) {
      return false;
    }
    if (!portrait) return false;

    const grain = buildSpeakerGrainCanvas(portrait);
    const contourLayer = buildSpeakerContourCanvas(alphaSil || portrait, plan.contourTune);
    const washLayer = buildSpeakerWashCanvas(alphaSil || portrait, plan.washColor);
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
    } else if (!options.skipScannerBed && QNC?.drawScannerBed) {
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
        bctx.drawImage(alphaSil || portrait, 0, 0);
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
    buildSpeakerCutoutExportDataUrl,
    prepareSpeakerCutoutExportDataUrl,
    buildSpeakerPlainCutoutCompositeDataUrl,
    fillInteriorAlphaHoles,
    fillPortraitInteriorHolesWithPaper,
    buildSpeakerGrainCanvas,
    buildSpeakerWashCanvas,
    buildSpeakerContourCanvas,
    isSpeakerPopArtEnabled,
    drawSpeakerCutoutPlain,
    drawSpeakerCutoutStack
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
