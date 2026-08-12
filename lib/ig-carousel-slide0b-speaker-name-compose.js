/**
 * IG carousel slide 0b: green cutting mat + centered speaker cutout (~60% frame)
 * + vinyl Helvetica speaker name along the bottom half.
 * Browser: globalThis.IgCarouselSlide0bSpeakerNameCompose
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IgCarouselSlide0bSpeakerNameCompose = api;
    root.composeCarouselSlide0bSpeakerName = api.composeCarouselSlide0bSpeakerName;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
  function (global) {
    'use strict';

    const PANEL_W = 1080;
    const PANEL_H = 1350;
    /** Speaker max edge as fraction of panel (height-led). */
    const SPEAKER_FRAME_FRAC = 0.6;
    /** Soft side margin so a wide cutout never kisses the edge. */
    const SPEAKER_SIDE_PAD_FRAC = 0.06;
    /** Vertical bias: 0.5 = true center; slightly high so name has room. */
    const SPEAKER_CENTER_Y_FRAC = 0.42;
    /** Name lives in this vertical band (fraction of panel). */
    const NAME_TOP_FRAC = 0.52;
    const NAME_BOTTOM_FRAC = 0.94;
    const NAME_SIDE_PAD_FRAC = 0.06;
    const FONT_STACK = 'Helvetica, "Helvetica Neue", Arial, sans-serif';
    /** Cool charcoal vinyl (match slide 0). */
    const INK = '#141518';
    const BEVEL_HI = 'rgba(255, 255, 255, 0.18)';
    const BEVEL_LO = 'rgba(0, 0, 0, 0.22)';
    const BASELINE_FROM_TOP_EM = 0.78;
    const MIN_WORD_GAP_EM = 0.12;
    const LINE_HEIGHT_EM_MIN = 1.02;
    const LINE_HEIGHT_EM_MAX = 1.45;
    const JITTER_X_EM = 0.032;
    const JITTER_Y_EM = 0.042;
    const JITTER_ROT_DEG = 3.0;
    const KERN_JITTER_EM = 0.018;
    const BEVEL_EM = 0.014;
    const CONTACT_BLUR_EM = 0.022;
    const CONTACT_OX_EM = 0.008;
    const CONTACT_OY_EM = 0.012;
    const SOFT_EDGE_BLUR_PX = 0.12;
    const GRAIN_STRENGTH = 5;
    const SHEEN_HI = 0.08;
    const SHEEN_LO = 0.06;

    /** Solid tan paper backing under the cutout (sticker / rough-cut sheet). */
    const PAPER_EDGE = '#e4d6bf';
    /** Paper margin as fraction of speaker height — thick band, not a hairline. */
    const PAPER_MARGIN_FRAC = 0.055;
    const PAPER_MARGIN_MIN_PX = 28;
    const PAPER_MARGIN_MAX_PX = 58;

    function loadImageFromUrl(url) {
      return new Promise((resolve, reject) => {
        const src = String(url || '').trim();
        if (!src) {
          reject(new Error('slide0b: missing speaker image'));
          return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('slide0b: speaker image load failed'));
        img.src = src;
      });
    }

    function canvasToBlob(canvas) {
      return new Promise((resolve) => {
        if (!canvas?.toBlob) {
          resolve(null);
          return;
        }
        canvas.toBlob((blob) => resolve(blob || null), 'image/png');
      });
    }

    function hashSeed(str) {
      let h = 2166136261;
      const s = String(str || '');
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    function mulberry32(a) {
      return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function toDisplayCaps(text) {
      return String(text || '')
        .toLocaleUpperCase('en-US')
        .replace(/\u2019/g, "'")
        .replace(/\u2018/g, "'")
        .replace(/^\s*[—–-]\s*/, '')
        .trim();
    }

    function wordsOf(line) {
      return String(line || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    }

    /** Speaker names: one word per line when short; otherwise pack by width. */
    function resolveNameLines(nameText, ctx, textRect) {
      const caps = toDisplayCaps(nameText);
      const words = wordsOf(caps);
      if (!words.length) return [];
      if (words.length <= 3) return words;
      ctx.font = `bold 64px ${FONT_STACK}`;
      const maxW = Math.max(1, textRect.width);
      const lines = [];
      let i = 0;
      while (i < words.length) {
        let take = 1;
        let width = ctx.measureText(words[i]).width;
        while (i + take < words.length) {
          const next = `${words.slice(i, i + take + 1).join(' ')}`;
          const w = ctx.measureText(next).width;
          if (w > maxW * 0.92 && take >= 1) break;
          width = w;
          take += 1;
          if (width / maxW >= 0.55) break;
        }
        lines.push(words.slice(i, i + take).join(' '));
        i += take;
      }
      return lines;
    }

    function maxFontForLines(ctx, lines, maxW, maxH) {
      let lo = 24;
      let hi = Math.min(220, Math.floor(maxH / Math.max(1, lines.length)));
      let best = lo;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        ctx.font = `bold ${mid}px ${FONT_STACK}`;
        const widest = lines.reduce((m, line) => Math.max(m, ctx.measureText(line).width), 0);
        const step = mid * LINE_HEIGHT_EM_MIN;
        const blockH = step * lines.length;
        if (widest <= maxW && blockH <= maxH) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best;
    }

    function resolveVariableLineLayout(lines, textRect, fontPx) {
      const n = Math.max(1, lines.length);
      const minStep = fontPx * LINE_HEIGHT_EM_MIN;
      const maxStep = fontPx * LINE_HEIGHT_EM_MAX;
      let step = minStep;
      if (n > 1) {
        const room = textRect.height - fontPx * 0.15;
        step = Math.min(maxStep, Math.max(minStep, room / n));
      }
      const blockH = step * (n - 1) + fontPx * BASELINE_FROM_TOP_EM;
      const startY =
        textRect.y +
        Math.max(0, (textRect.height - blockH) / 2) +
        fontPx * BASELINE_FROM_TOP_EM;
      return { step, startY, lineHeightEm: step / fontPx };
    }

    function drawUnevenVinylHighlight(octx, ch, lx, ly, w, fontPx, pad, bevel, rng) {
      const alpha = SHEEN_HI * (0.55 + rng() * 0.45);
      octx.save();
      octx.beginPath();
      octx.rect(pad, pad, w + pad, fontPx * 0.55);
      octx.clip();
      octx.fillStyle = `rgba(255,255,255,${alpha})`;
      octx.fillText(ch, lx - bevel, ly - bevel);
      octx.restore();
    }

    function buildVinylGlyphCanvas(ch, fontPx, rng) {
      const measure = document.createElement('canvas').getContext('2d');
      measure.font = `bold ${fontPx}px ${FONT_STACK}`;
      const w = Math.max(1, measure.measureText(ch).width);
      const ascent = fontPx * BASELINE_FROM_TOP_EM;
      const pad = Math.ceil(fontPx * 0.28);
      const ow = Math.ceil(w) + pad * 2;
      const oh = Math.ceil(fontPx * 1.35) + pad * 2;
      const off = document.createElement('canvas');
      off.width = ow;
      off.height = oh;
      const octx = off.getContext('2d');
      octx.font = `bold ${fontPx}px ${FONT_STACK}`;
      octx.textBaseline = 'alphabetic';
      octx.textAlign = 'left';
      const lx = pad;
      const ly = pad + ascent;
      const bevel = Math.max(1, fontPx * BEVEL_EM);

      if (rng() > 0.18) {
        octx.fillStyle = BEVEL_LO;
        octx.fillText(ch, lx + bevel, ly + bevel);
      }
      drawUnevenVinylHighlight(octx, ch, lx, ly, w, fontPx, pad, bevel, rng);
      octx.fillStyle = INK;
      octx.fillText(ch, lx, ly);

      octx.globalCompositeOperation = 'source-atop';
      const sheen = octx.createLinearGradient(lx, pad, lx + w, oh - pad);
      sheen.addColorStop(0, `rgba(255,255,255,${SHEEN_HI})`);
      sheen.addColorStop(0.3, `rgba(255,255,255,${SHEEN_HI * 0.25})`);
      sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, `rgba(0,0,0,${SHEEN_LO})`);
      octx.fillStyle = sheen;
      octx.fillRect(0, 0, ow, oh);

      try {
        const img = octx.getImageData(0, 0, ow, oh);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 10) continue;
          const n = (rng() - 0.5) * GRAIN_STRENGTH;
          d[i] = Math.max(0, Math.min(255, d[i] + n));
          d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
          d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
        }
        octx.putImageData(img, 0, 0);
      } catch (_) {
        /* skip grain */
      }
      octx.globalCompositeOperation = 'source-over';
      return { canvas: off, width: w, pad, ascent };
    }

    function drawVinylChar(ctx, ch, x, y, fontPx, rng) {
      if (!ch || ch === ' ') return ctx.measureText(' ').width || fontPx * 0.3;
      const glyph = buildVinylGlyphCanvas(ch, fontPx, rng);
      const jitterX = (rng() - 0.5) * fontPx * JITTER_X_EM;
      const jitterY = (rng() - 0.5) * fontPx * JITTER_Y_EM;
      const rot = ((rng() - 0.5) * JITTER_ROT_DEG * Math.PI) / 180;
      const kern = (rng() - 0.5) * fontPx * KERN_JITTER_EM;

      ctx.save();
      ctx.translate(x + jitterX + glyph.width / 2, y + jitterY - fontPx * 0.35);
      ctx.rotate(rot);
      ctx.translate(-glyph.width / 2, fontPx * 0.35);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
      ctx.shadowBlur = Math.max(1, fontPx * CONTACT_BLUR_EM);
      ctx.shadowOffsetX = fontPx * CONTACT_OX_EM;
      ctx.shadowOffsetY = fontPx * CONTACT_OY_EM;
      if ('filter' in ctx) ctx.filter = `blur(${SOFT_EDGE_BLUR_PX}px)`;
      ctx.drawImage(glyph.canvas, -glyph.pad, -glyph.ascent - glyph.pad);
      ctx.restore();
      return glyph.width + kern;
    }

    function drawJustifiedVinylLine(ctx, line, x, y, width, fontPx, rng) {
      const words = wordsOf(line);
      if (!words.length) return;
      ctx.font = `bold ${fontPx}px ${FONT_STACK}`;
      const wordWidths = words.map((w) => {
        let sum = 0;
        for (const ch of w) sum += ctx.measureText(ch).width;
        return sum;
      });
      const gap =
        words.length === 1
          ? 0
          : Math.max(
              fontPx * MIN_WORD_GAP_EM,
              (width - wordWidths.reduce((a, b) => a + b, 0)) / (words.length - 1)
            );
      let cx = x;
      for (let wi = 0; wi < words.length; wi++) {
        for (const ch of words[wi]) {
          const measured = ctx.measureText(ch).width;
          drawVinylChar(ctx, ch, cx, y, fontPx, rng);
          cx += measured;
        }
        if (wi < words.length - 1) cx += gap;
      }
    }

    function drawCenteredVinylLine(ctx, line, cx, y, fontPx, rng) {
      ctx.font = `bold ${fontPx}px ${FONT_STACK}`;
      let width = 0;
      for (const ch of line) width += ctx.measureText(ch).width;
      drawJustifiedVinylLine(ctx, line, cx - width / 2, y, width, fontPx, rng);
    }

    function drawNameVinylInRect(ctx, nameText, textRect, options = {}) {
      const lines = resolveNameLines(nameText, ctx, textRect);
      if (!lines.length) {
        return { lines: [], fontPx: 0, textRect };
      }
      const fontPx = maxFontForLines(ctx, lines, textRect.width, textRect.height);
      const layout = resolveVariableLineLayout(lines, textRect, fontPx);
      const seed = hashSeed(
        `${options.dateKey || 'slide0b'}:${lines.join('|')}:${Math.round(fontPx)}`
      );
      const rng = mulberry32(seed);
      ctx.save();
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const singleWord = wordsOf(line).length === 1;
        if (singleWord || lines.length > 1) {
          drawCenteredVinylLine(
            ctx,
            line,
            textRect.x + textRect.width / 2,
            layout.startY + i * layout.step,
            fontPx,
            rng
          );
        } else {
          drawJustifiedVinylLine(
            ctx,
            line,
            textRect.x,
            layout.startY + i * layout.step,
            textRect.width,
            fontPx,
            rng
          );
        }
      }
      ctx.restore();
      return {
        lines,
        fontPx,
        textRect,
        lineHeightEm: layout.lineHeightEm,
        vinylStickers: true
      };
    }

    /**
     * Fit speaker image into a box that is ~60% of frame height (width capped).
     */
    function resolveSpeakerRect(img, options = {}) {
      const iw = Math.max(1, img.naturalWidth || img.width);
      const ih = Math.max(1, img.naturalHeight || img.height);
      const aspect = iw / ih;
      const frameFrac =
        Number(options.speakerFrameFrac) > 0
          ? Number(options.speakerFrameFrac)
          : SPEAKER_FRAME_FRAC;
      const sidePad = PANEL_W * SPEAKER_SIDE_PAD_FRAC;
      const maxH = PANEL_H * frameFrac;
      const maxW = PANEL_W - sidePad * 2;
      let h = maxH;
      let w = h * aspect;
      if (w > maxW) {
        w = maxW;
        h = w / aspect;
      }
      const cx = PANEL_W / 2;
      const cy =
        PANEL_H *
        (Number(options.speakerCenterYFrac) > 0
          ? Number(options.speakerCenterYFrac)
          : SPEAKER_CENTER_Y_FRAC);
      return {
        x: Math.round(cx - w / 2),
        y: Math.round(cy - h / 2),
        width: Math.round(w),
        height: Math.round(h)
      };
    }

    /**
     * Hard binary silhouette from speaker alpha.
     */
    function buildOpaqueKeepMask(data, width, height, minAlpha = 48) {
      const keep = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i += 1) {
        if (data[i * 4 + 3] >= minAlpha) keep[i] = 1;
      }
      return keep;
    }

    function dilateMaskSquare(keep, width, height, radius) {
      if (radius < 1) return keep;
      let cur = keep;
      for (let pass = 0; pass < radius; pass += 1) {
        const next = new Uint8Array(width * height);
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            let on = cur[y * width + x];
            if (!on) {
              for (let dy = -1; dy <= 1 && !on; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                  if (cur[ny * width + nx]) on = 1;
                }
              }
            }
            next[y * width + x] = on ? 1 : 0;
          }
        }
        cur = next;
      }
      return cur;
    }

    /**
     * Moore-neighbor outer contour. Returns closed ring.
     */
    function traceOuterContour(keep, width, height) {
      let sx = -1;
      let sy = -1;
      outer: for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (keep[y * width + x]) {
            sx = x;
            sy = y;
            break outer;
          }
        }
      }
      if (sx < 0) return null;
      const dirs = [
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1]
      ];
      const points = [];
      let x = sx;
      let y = sy;
      let dir = 0;
      const maxSteps = width * height * 2;
      for (let step = 0; step < maxSteps; step += 1) {
        points.push([x + 0.5, y + 0.5]);
        let found = false;
        for (let k = 0; k < 8; k += 1) {
          const nd = (dir + 6 + k) % 8;
          const nx = x + dirs[nd][0];
          const ny = y + dirs[nd][1];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (!keep[ny * width + nx]) continue;
          x = nx;
          y = ny;
          dir = nd;
          found = true;
          break;
        }
        if (!found) break;
        if (x === sx && y === sy && points.length > 8) break;
      }
      if (points.length < 8) return null;
      const first = points[0];
      const last = points[points.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        points.push([first[0], first[1]]);
      }
      return points;
    }

    function distPointToSeg(px, py, ax, ay, bx, by) {
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-8) return Math.hypot(px - ax, py - ay);
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    function douglasPeucker(points, epsilon) {
      if (!points || points.length < 3) return points || [];
      const keep = new Uint8Array(points.length);
      keep[0] = 1;
      keep[points.length - 1] = 1;
      const stack = [[0, points.length - 1]];
      while (stack.length) {
        const [start, end] = stack.pop();
        let maxDist = 0;
        let maxIdx = -1;
        const a = points[start];
        const b = points[end];
        for (let i = start + 1; i < end; i += 1) {
          const d = distPointToSeg(points[i][0], points[i][1], a[0], a[1], b[0], b[1]);
          if (d > maxDist) {
            maxDist = d;
            maxIdx = i;
          }
        }
        if (maxIdx >= 0 && maxDist > epsilon) {
          keep[maxIdx] = 1;
          stack.push([start, maxIdx], [maxIdx, end]);
        }
      }
      const out = [];
      for (let i = 0; i < points.length; i += 1) {
        if (keep[i]) out.push([points[i][0], points[i][1]]);
      }
      return out;
    }

    function ringArea(points) {
      let a = 0;
      for (let i = 0; i < points.length - 1; i += 1) {
        a += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
      }
      return a * 0.5;
    }

    function ensureCcw(points) {
      if (ringArea(points) >= 0) return points;
      return points.slice().reverse();
    }

    function offsetPolygonOutward(points, dist) {
      const ring = ensureCcw(points);
      const n = ring.length - 1;
      if (n < 3) return ring;
      const out = [];
      for (let i = 0; i < n; i += 1) {
        const prev = ring[(i - 1 + n) % n];
        const cur = ring[i];
        const next = ring[(i + 1) % n];
        let e1x = cur[0] - prev[0];
        let e1y = cur[1] - prev[1];
        let e2x = next[0] - cur[0];
        let e2y = next[1] - cur[1];
        const l1 = Math.hypot(e1x, e1y) || 1;
        const l2 = Math.hypot(e2x, e2y) || 1;
        e1x /= l1;
        e1y /= l1;
        e2x /= l2;
        e2y /= l2;
        const n1x = -e1y;
        const n1y = e1x;
        const n2x = -e2y;
        const n2y = e2x;
        let nx = n1x + n2x;
        let ny = n1y + n2y;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        const dot = Math.max(-0.999, Math.min(0.999, n1x * nx + n1y * ny));
        const miter = Math.min(2.2, 1 / Math.max(0.28, dot));
        out.push([cur[0] + nx * dist * miter, cur[1] + ny * dist * miter]);
      }
      out.push([out[0][0], out[0][1]]);
      return out;
    }

    /** Push corners for hard scissor facets (few long straight cuts). */
    function hardenScissorCorners(points, rng, jitterPx) {
      const ring = points.slice(0, -1);
      if (ring.length < 3) return points;
      const out = ring.map((p, i) => {
        const prev = ring[(i - 1 + ring.length) % ring.length];
        const next = ring[(i + 1) % ring.length];
        const tx = next[0] - prev[0];
        const ty = next[1] - prev[1];
        const tl = Math.hypot(tx, ty) || 1;
        const kick = (rng() - 0.5) * 2 * jitterPx;
        return [p[0] + (-ty / tl) * kick, p[1] + (tx / tl) * kick];
      });
      out.push([out[0][0], out[0][1]]);
      return out;
    }

    function fillHardPolygon(ctx, points, fillStyle) {
      if (!points || points.length < 4) return false;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.moveTo(Math.round(points[0][0]) + 0.5, Math.round(points[0][1]) + 0.5);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(Math.round(points[i][0]) + 0.5, Math.round(points[i][1]) + 0.5);
      }
      ctx.closePath();
      ctx.fill('nonzero');
      ctx.strokeStyle = fillStyle;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 3;
      ctx.stroke();
      ctx.restore();
      return true;
    }

    /**
     * Coarse silhouette → few hard-angled vertices → sharp vector paper fill.
     */
    function buildSpeakerWithRoughPaperEdge(img, drawW, drawH, options = {}) {
      const marginPx = Math.max(
        PAPER_MARGIN_MIN_PX,
        Math.min(
          PAPER_MARGIN_MAX_PX,
          Math.round(
            drawH *
              (Number(options.paperMarginFrac) > 0
                ? Number(options.paperMarginFrac)
                : PAPER_MARGIN_FRAC)
          )
        )
      );
      const pad = marginPx + 18;
      const cw = Math.max(1, Math.round(drawW) + pad * 2);
      const ch = Math.max(1, Math.round(drawH) + pad * 2);
      const src = document.createElement('canvas');
      src.width = cw;
      src.height = ch;
      const sctx = src.getContext('2d', { willReadFrequently: true });
      if (!sctx) return null;
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(img, pad, pad, drawW, drawH);

      let imgData;
      try {
        imgData = sctx.getImageData(0, 0, cw, ch);
      } catch (_) {
        return { canvas: src, pad, marginPx, paperPolygon: null, paperMode: 'none' };
      }

      const keepFull = buildOpaqueKeepMask(imgData.data, cw, ch, 52);
      /** Work on a coarse grid so contours become long hard facets. */
      const scale = 8;
      const sw = Math.max(8, Math.ceil(cw / scale));
      const sh = Math.max(8, Math.ceil(ch / scale));
      const keepSmall = new Uint8Array(sw * sh);
      for (let y = 0; y < ch; y += 1) {
        for (let x = 0; x < cw; x += 1) {
          if (!keepFull[y * cw + x]) continue;
          keepSmall[Math.floor(y / scale) * sw + Math.floor(x / scale)] = 1;
        }
      }
      const expandSmall = Math.max(2, Math.round(marginPx / scale));
      const expanded = dilateMaskSquare(keepSmall, sw, sh, expandSmall);
      let contour = traceOuterContour(expanded, sw, sh);
      if (!contour) {
        return { canvas: src, pad, marginPx, paperPolygon: null, paperMode: 'none' };
      }
      /** Scale contour back to panel pixels. */
      contour = contour.map(([x, y]) => [x * scale, y * scale]);

      const seed = hashSeed(`${options.dateKey || 'slide0b'}:paper-hard:${cw}x${ch}:${marginPx}`);
      const rng = mulberry32(seed);
      /** Very aggressive simplify → few hard angles (like scissors cuts). */
      let poly = douglasPeucker(contour, Math.max(14, marginPx * 0.42));
      if (poly.length < 6) poly = douglasPeucker(contour, Math.max(10, marginPx * 0.28));
      poly = hardenScissorCorners(poly, rng, Math.max(4, marginPx * 0.12));
      poly = douglasPeucker(poly, Math.max(8, marginPx * 0.18));

      const paperHex = String(options.paperEdgeColor || PAPER_EDGE).trim() || PAPER_EDGE;
      const paper = document.createElement('canvas');
      paper.width = cw;
      paper.height = ch;
      const pctx = paper.getContext('2d');
      if (!pctx) return { canvas: src, pad, marginPx, paperPolygon: poly, paperMode: 'none' };
      const filled = fillHardPolygon(pctx, poly, paperHex);

      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      const octx = out.getContext('2d');
      if (!octx) return { canvas: src, pad, marginPx, paperPolygon: poly, paperMode: filled ? 'vector' : 'none' };
      octx.drawImage(paper, 0, 0);
      octx.drawImage(src, 0, 0);
      return {
        canvas: out,
        pad,
        marginPx,
        paperPolygon: poly,
        paperMode: filled ? 'vector-hard' : 'none',
        polyLen: poly.length
      };
    }

    function drawSpeakerInRect(ctx, img, rect, options = {}) {
      if (!img || !rect?.width) return { drawn: false };
      const sticker = buildSpeakerWithRoughPaperEdge(img, rect.width, rect.height, options);
      const drawCanvas = sticker?.canvas || img;
      const pad = sticker?.pad || 0;
      const dx = rect.x - pad;
      const dy = rect.y - pad;
      const dw = sticker?.canvas ? sticker.canvas.width : rect.width;
      const dh = sticker?.canvas ? sticker.canvas.height : rect.height;
      const poly = sticker?.paperPolygon || null;

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.drawImage(drawCanvas, dx, dy, dw, dh);
      ctx.restore();
      return {
        drawn: true,
        marginPx: sticker?.marginPx || 0,
        paperMode: sticker?.paperMode || 'none',
        polyLen: sticker?.polyLen || (poly ? poly.length : 0)
      };
    }

    async function composeCarouselSlide0bSpeakerName(options = {}) {
      const dateKey = String(options.dateKey || 'our-daily').trim() || 'our-daily';
      const speakerName = toDisplayCaps(options.speakerName || options.name || '');
      const imageUrl = String(options.speakerImageUrl || options.imageUrl || '').trim();
      if (!speakerName || !imageUrl) return null;

      const MatBg = global.CarouselCuttingMatBg || globalThis.CarouselCuttingMatBg;
      const CQB = global.CarouselQuiltBg || globalThis.CarouselQuiltBg;

      const [speakerImg, cuttingMatImg] = await Promise.all([
        loadImageFromUrl(imageUrl),
        MatBg?.loadCarouselCuttingMatImage?.() || Promise.resolve(null)
      ]);

      try {
        if (document?.fonts?.load) {
          await Promise.allSettled([
            document.fonts.load(`bold 64px Helvetica`),
            document.fonts.load(`bold 64px "Helvetica Neue"`),
            document.fonts.ready
          ]);
        }
      } catch (_) {
        /* optional */
      }

      const canvas = document.createElement('canvas');
      canvas.width = PANEL_W;
      canvas.height = PANEL_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const matPanX = MatBg?.CAROUSEL_MAT_PAN?.SLIDE_1 ?? 0;
      if (typeof CQB?.drawGreenCuttingMatUnderQuilt === 'function') {
        CQB.drawGreenCuttingMatUnderQuilt(ctx, PANEL_W, PANEL_H, {
          cuttingMatImg,
          matPanX
        });
      } else if (MatBg?.drawCarouselCuttingMatBackground) {
        MatBg.drawCarouselCuttingMatBackground(ctx, cuttingMatImg, PANEL_W, PANEL_H, matPanX);
      } else {
        ctx.fillStyle = '#174830';
        ctx.fillRect(0, 0, PANEL_W, PANEL_H);
      }

      const speakerRect = resolveSpeakerRect(speakerImg, options);
      const speakerDraw = drawSpeakerInRect(ctx, speakerImg, speakerRect, {
        dateKey,
        washColor: options.washColor,
        isCutoutPng: options.isCutoutPng,
        cutoutSourceUrl: options.cutoutSourceUrl || imageUrl,
        imageUrl,
        paperMarginFrac: options.paperMarginFrac,
        paperEdgeColor: options.paperEdgeColor
      });

      const nameTop = Math.round(PANEL_H * NAME_TOP_FRAC);
      const nameBottom = Math.round(PANEL_H * NAME_BOTTOM_FRAC);
      const namePadX = Math.round(PANEL_W * NAME_SIDE_PAD_FRAC);
      const nameRect = {
        x: namePadX,
        y: nameTop,
        width: PANEL_W - namePadX * 2,
        height: Math.max(40, nameBottom - nameTop)
      };
      const drawn = drawNameVinylInRect(ctx, speakerName, nameRect, { dateKey });

      const blob = await canvasToBlob(canvas);
      if (!blob) return null;
      return {
        blob,
        meta: {
          panelWidth: PANEL_W,
          panelHeight: PANEL_H,
          carouselMode: 'cutting-mat-slide0b-speaker-name',
          speakerName,
          speakerRect,
          speakerDrawn: !!(speakerDraw && speakerDraw.drawn !== false),
          paperMode: speakerDraw?.paperMode || 'none',
          paperMarginPx: speakerDraw?.marginPx || 0,
          paperPolyLen: speakerDraw?.polyLen || 0,
          speakerFrameFrac: SPEAKER_FRAME_FRAC,
          nameRect,
          fontPx: drawn.fontPx,
          lines: drawn.lines,
          lineHeightEm: drawn.lineHeightEm
        }
      };
    }

    return {
      PANEL_W,
      PANEL_H,
      SPEAKER_FRAME_FRAC,
      composeCarouselSlide0bSpeakerName
    };
  }
);
