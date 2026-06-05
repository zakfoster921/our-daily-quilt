/**
 * Contributor name cloud IG post (4:5): quilt cover background + Zakarack name cloud.
 * Browser: globalThis.ContributorCloudCompose
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ContributorCloudCompose = api;
    root.composeContributorCloudPostFromQuiltBlob = api.composeContributorCloudPostFromQuiltBlob;
    root.ensureContributorCloudFontsReady = api.ensureContributorCloudFontsReady;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function (global) {
  'use strict';

  const ZAKARACK_FAMILY = 'Zakarack';
  const SIZE_BUCKETS = [0.9, 1.0, 1.1, 1.22];
  const VARIANT = 'cloud';
  const POST_W = 1080;
  const POST_H = 1350;
  const QUILT_BLEED = 1.04;
  const POST_DIM_OVERLAY = 'rgba(0,0,0,0.133)';

  let _fontsReadyPromise = null;

  function hashString(s) {
    const str = String(s || '');
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function isValidHex(hex) {
    return /^#[0-9A-Fa-f]{6}$/.test(String(hex || '').trim());
  }

  function normalizeContributors(items) {
    const out = [];
    const seen = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const userId = String(item.userId || '').trim();
      const key = userId || `${String(item.name || '').trim().toLowerCase()}:${String(item.firstContributedAt || '').trim()}`;
      if (!key) return;
      const rawName = String(item.name || '').replace(/\s+/g, ' ').trim();
      const name = rawName || 'Friend';
      const existingIndex = seen.get(key);
      if (typeof existingIndex === 'number') {
        if (out[existingIndex]?.name === 'Friend' && name !== 'Friend') {
          out[existingIndex].name = name.slice(0, 40);
        }
        return;
      }
      seen.set(key, out.length);
      out.push({
        userId,
        name: name.slice(0, 40),
        firstContributedAt: String(item.firstContributedAt || item.timestamp || new Date().toISOString())
      });
    });
    return out;
  }

  function dedupeContributorsByDisplayName(contributors) {
    const byNameKey = new Map();
    const order = [];
    (Array.isArray(contributors) ? contributors : []).forEach((entry) => {
      const name = entry?.name || 'Friend';
      const key = String(name).trim().toLocaleLowerCase('en-US') || 'friend';
      const existing = byNameKey.get(key);
      if (!existing) {
        byNameKey.set(key, entry);
        order.push(key);
        return;
      }
      const ta = Date.parse(String(existing.firstContributedAt || '')) || 0;
      const tb = Date.parse(String(entry.firstContributedAt || '')) || 0;
      byNameKey.set(key, ta <= tb ? existing : entry);
    });
    return order.map((key) => byNameKey.get(key));
  }

  function getOrderedDisplayContributors(contributors) {
    const normalized = normalizeContributors(contributors);
    const displayContributors = dedupeContributorsByDisplayName(normalized);
    return displayContributors
      .map((entry, idx) => {
        const nm = entry.name || 'Friend';
        return { entry, idx, rank: hashString(nm) };
      })
      .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
      .map(({ entry }) => entry);
  }

  function styleForName(name) {
    const styleHash = hashString(`${name}|${VARIANT}`);
    const sizeIdx = styleHash % SIZE_BUCKETS.length;
    const tiltDeg = (styleHash % 13) - 6;
    const nudgeX = ((styleHash % 9) - 4) * 0.35;
    const nudgeY = ((Math.floor(styleHash / 3) % 7) - 3) * 0.28;
    return {
      sizeMult: SIZE_BUCKETS[sizeIdx],
      tiltDeg,
      nudgeX,
      nudgeY
    };
  }

  function luminanceForHex(hex) {
    const normalized = String(hex || '').trim();
    if (!isValidHex(normalized)) return null;
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function colorsForBlock(block) {
    const colors = [];
    const seen = new Set();
    const addColor = (color) => {
      const normalized = String(color || '').trim();
      if (!isValidHex(normalized)) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      colors.push(normalized);
    };
    addColor(block?.color);
    addColor(block?.hstColorB);
    addColor(block?.insetInnerColor);
    addColor(block?.specialOriginalInnerColor);
    addColor(block?.diagonalAxisAccentColor);
    if (Array.isArray(block?.hstTriangles)) {
      block.hstTriangles.forEach((piece) => addColor(piece?.color));
    }
    if (Array.isArray(block?.polygonPieces)) {
      block.polygonPieces.forEach((piece) => addColor(piece?.color));
    }
    return colors;
  }

  function getQuiltAverageLuminance(blocks) {
    let weightedLuminance = 0;
    let totalArea = 0;
    (Array.isArray(blocks) ? blocks : []).forEach((block) => {
      if (!block || typeof block !== 'object') return;
      const area = Math.max(0, Number(block.width) || 0) * Math.max(0, Number(block.height) || 0);
      if (!Number.isFinite(area) || area <= 0) return;
      const colors = colorsForBlock(block);
      if (!colors.length) return;
      const blockLuminance = colors.reduce((sum, color) => sum + luminanceForHex(color), 0) / colors.length;
      weightedLuminance += blockLuminance * area;
      totalArea += area;
    });
    return totalArea > 0 ? weightedLuminance / totalArea : 1;
  }

  function getContributorContrastPalette(blocks) {
    const averageLuminance = getQuiltAverageLuminance(blocks);
    const quiltIsPrimarilyDark = averageLuminance < 0.5;
    return quiltIsPrimarilyDark
      ? {
          tone: 'dark',
          color: 'rgba(246, 244, 241, 0.84)'
        }
      : {
          tone: 'light',
          color: 'rgba(0, 0, 0, 0.68)'
        };
  }

  function fontSpec(basePx, weight = 600) {
    return `${weight} ${Math.round(basePx)}px "${ZAKARACK_FAMILY}", Georgia, serif`;
  }

  async function ensureContributorCloudFontsReady(pxValues = []) {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    const sizes = [
      ...new Set(
        pxValues
          .map((n) => Math.ceil(Number(n) || 0))
          .filter((n) => n > 0)
      )
    ];
    if (!sizes.length) sizes.push(72, 96, 120);
    const key = sizes.join(',');
    if (_fontsReadyPromise?.key === key) return _fontsReadyPromise.promise;
    const loads = sizes.flatMap((size) => [
      document.fonts.load(`600 ${size}px "${ZAKARACK_FAMILY}"`),
      document.fonts.load(`800 ${size}px "${ZAKARACK_FAMILY}"`)
    ]);
    const promise = Promise.allSettled([...loads, document.fonts.ready]).then(() => {});
    _fontsReadyPromise = { key, promise };
    return promise;
  }

  function rotatedBounds(width, height, tiltDeg, nudgeX, nudgeY) {
    const rad = (tiltDeg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = width * cos + height * sin;
    const h = width * sin + height * cos;
    return {
      width: w + Math.abs(nudgeX) * 2,
      height: h + Math.abs(nudgeY) * 2
    };
  }

  function measureNameItem(ctx, name, basePx, style) {
    const fontSize = Math.max(8, basePx * style.sizeMult);
    ctx.font = fontSpec(fontSize, 600);
    const metrics = ctx.measureText(name);
    const width = Math.max(1, metrics.width) + fontSize * 0.16;
    const height = fontSize * 1.05;
    const bounds = rotatedBounds(width, height, style.tiltDeg, style.nudgeX, style.nudgeY);
    return {
      name,
      fontSize,
      textWidth: metrics.width,
      width: bounds.width,
      height: bounds.height,
      style
    };
  }

  function layoutContributorCloud(ctx, entries, canvasW, canvasH, basePx) {
    const gapX = basePx * 0.22;
    const gapY = basePx * 0.17;
    const items = entries.map((entry) => {
      const name = entry.name || 'Friend';
      return measureNameItem(ctx, name, basePx, styleForName(name));
    });

    const rows = [];
    let currentRow = [];
    let currentRowWidth = 0;
    let maxRowWidth = 0;

    items.forEach((item) => {
      const addGap = currentRow.length ? gapX : 0;
      if (currentRow.length && currentRowWidth + addGap + item.width > canvasW) {
        rows.push(currentRow);
        currentRow = [item];
        currentRowWidth = item.width;
      } else {
        currentRow.push(item);
        currentRowWidth += addGap + item.width;
      }
      maxRowWidth = Math.max(maxRowWidth, currentRowWidth);
    });
    if (currentRow.length) rows.push(currentRow);

    const rowHeights = rows.map((row) => Math.max(...row.map((item) => item.height), 1));
    const totalHeight =
      rowHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, rows.length - 1) * gapY;
    const totalWidth = Math.max(maxRowWidth, 1);

    const startY = (canvasH - totalHeight) / 2;
    let y = startY;
    const placed = [];

    rows.forEach((row, rowIndex) => {
      const rowHeight = rowHeights[rowIndex];
      const rowWidth =
        row.reduce((sum, item, idx) => sum + item.width + (idx ? gapX : 0), 0);
      let x = (canvasW - rowWidth) / 2;
      const rowCenterY = y + rowHeight / 2;
      row.forEach((item) => {
        const cx = x + item.width / 2 + item.style.nudgeX;
        const cy = rowCenterY + item.style.nudgeY;
        placed.push({ ...item, cx, cy });
        x += item.width + gapX;
      });
      y += rowHeight + gapY;
    });

    return {
      placed,
      bounds: { width: totalWidth, height: totalHeight },
      fits: totalWidth <= canvasW && totalHeight <= canvasH
    };
  }

  function findBestBaseFontPx(ctx, entries, canvasW, canvasH) {
    let lo = 24;
    let hi = 220;
    let bestFit = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const layout = layoutContributorCloud(ctx, entries, canvasW, canvasH, mid);
      if (layout.fits) {
        bestFit = { basePx: mid, layout };
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (!bestFit) {
      let fallback = 24;
      let layout = layoutContributorCloud(ctx, entries, canvasW, canvasH, fallback);
      while (!layout.fits && fallback > 12) {
        fallback -= 2;
        layout = layoutContributorCloud(ctx, entries, canvasW, canvasH, fallback);
      }
      bestFit = { basePx: fallback, layout };
    }
    return bestFit;
  }

  function drawContributorCloud(ctx, placed, color) {
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    placed.forEach((item) => {
      ctx.save();
      ctx.translate(item.cx, item.cy);
      ctx.rotate((item.style.tiltDeg * Math.PI) / 180);
      ctx.font = fontSpec(item.fontSize, 600);
      ctx.fillText(item.name, 0, 0);
      ctx.restore();
    });
  }

  async function loadImageFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode quilt bitmap'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function drawQuiltBackground(ctx, quiltImg, canvasW, canvasH) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
    const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
    const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
    const scale = Math.max(canvasW / iw, canvasH / ih) * QUILT_BLEED;
    const dw = Math.round(iw * scale);
    const dh = Math.round(ih * scale);
    const dx = Math.round((canvasW - dw) / 2);
    const dy = Math.round((canvasH - dh) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(quiltImg, dx, dy, dw, dh);
    ctx.fillStyle = POST_DIM_OVERLAY;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  /**
   * @param {Blob} quiltBlob
   * @param {Array} contributors
   * @param {Array} blocks
   * @param {number} layoutW
   * @param {number} layoutH
   * @param {object} [options]
   * @returns {Promise<Blob|null>}
   */
  async function composeContributorCloudPostFromQuiltBlob(
    quiltBlob,
    contributors,
    blocks,
    layoutW = POST_W,
    layoutH = POST_H,
    options = {}
  ) {
    if (!quiltBlob) return null;
    const entries = getOrderedDisplayContributors(contributors);
    if (!entries.length) return null;

    const canvasW = Math.max(1, Math.round(Number(layoutW) || POST_W));
    const canvasH = Math.max(1, Math.round(Number(layoutH) || POST_H));

    await ensureContributorCloudFontsReady([48, 72, 96, 120, 160, 200]);

    const quiltImg = await loadImageFromBlob(quiltBlob);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = canvasW;
    canvas.height = canvasH;

    drawQuiltBackground(ctx, quiltImg, canvasW, canvasH);

    const palette = getContributorContrastPalette(blocks);
    const { layout } = findBestBaseFontPx(ctx, entries, canvasW, canvasH);
    drawContributorCloud(ctx, layout.placed, palette.color);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), 'image/png', 0.95);
    });
  }

  return {
    composeContributorCloudPostFromQuiltBlob,
    ensureContributorCloudFontsReady,
    normalizeContributors,
    getOrderedDisplayContributors,
    getContributorContrastPalette
  };
});
