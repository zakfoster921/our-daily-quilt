/**
 * Draw emoji in the current text color.
 * Color emoji ignore fillStyle / CSS color, so canvas text is recolored
 * and on-screen names use an ink-colored mask of the same glyph.
 * Browser: globalThis.InkEmoji
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) root.InkEmoji = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {}, function () {
  'use strict';

  const EMOJI_RE =
    /(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)|(?:[#*0-9]\uFE0F?\u20E3)|(?:\p{Regional_Indicator}{2})|(?:[\u2600-\u27BF]\uFE0F)/gu;

  const maskCache = new Map();
  let scratch = null;

  function hasEmoji(text) {
    EMOJI_RE.lastIndex = 0;
    return EMOJI_RE.test(String(text || ''));
  }

  function splitTextByEmoji(text) {
    const value = String(text || '');
    EMOJI_RE.lastIndex = 0;
    const parts = [];
    let last = 0;
    let match;
    while ((match = EMOJI_RE.exec(value))) {
      if (match.index > last) {
        parts.push({ text: value.slice(last, match.index), emoji: false });
      }
      parts.push({ text: match[0], emoji: true });
      last = match.index + match[0].length;
      if (!match[0].length) EMOJI_RE.lastIndex += 1;
    }
    if (last < value.length) parts.push({ text: value.slice(last), emoji: false });
    return parts;
  }

  function fontSizePx(font) {
    const match = /(\d+(?:\.\d+)?)px/.exec(String(font || ''));
    return match ? Number(match[1]) : 16;
  }

  function letterSpacingPx(ctx) {
    const raw = ctx && 'letterSpacing' in ctx ? String(ctx.letterSpacing || '') : '';
    const match = /^(-?[\d.]+)px$/.exec(raw.trim());
    return match ? Number(match[1]) : 0;
  }

  function parseFillColor(color) {
    const value = String(color || '').trim();
    let match = /^#([0-9a-f]{3})$/i.exec(value);
    if (match) {
      const hex = match[1];
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        1
      ];
    }
    match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
    if (match) {
      const hex = match[1];
      const alpha = match[2] != null ? parseInt(match[2], 16) / 255 : 1;
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        alpha
      ];
    }
    match =
      /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i.exec(value);
    if (match) {
      return [
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        match[4] == null ? 1 : Number(match[4])
      ];
    }
    return null;
  }

  function recolorImageData(imageData, rgba) {
    const data = imageData.data;
    const r = rgba[0];
    const g = rgba[1];
    const b = rgba[2];
    const a = rgba[3];
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 12) {
        data[i + 3] = 0;
        continue;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a >= 0.999 ? alpha : Math.round(alpha * a);
    }
  }

  function copyFontState(from, to) {
    to.font = from.font;
    to.textBaseline = from.textBaseline || 'alphabetic';
    to.textAlign = 'left';
    to.direction = from.direction || 'ltr';
    if ('letterSpacing' in to) to.letterSpacing = from.letterSpacing || '0px';
  }

  function drawEmojiGlyph(ctx, emoji, x, y, rgba) {
    const metrics = ctx.measureText(emoji);
    const fontPx = fontSizePx(ctx.font);
    const ascent = metrics.actualBoundingBoxAscent > 0 ? metrics.actualBoundingBoxAscent : fontPx * 0.82;
    const descent = metrics.actualBoundingBoxDescent > 0 ? metrics.actualBoundingBoxDescent : fontPx * 0.22;
    const left = metrics.actualBoundingBoxLeft > 0 ? metrics.actualBoundingBoxLeft : 0;
    const right = metrics.actualBoundingBoxRight > 0 ? metrics.actualBoundingBoxRight : Math.max(metrics.width, 1);
    const pad = Math.max(2, Math.ceil(fontPx * 0.12));
    const cssW = Math.max(1, Math.ceil(left + right + pad * 2));
    const cssH = Math.max(1, Math.ceil(ascent + descent + pad * 2));
    if (typeof document === 'undefined') {
      ctx.fillText(emoji, x, y);
      return;
    }
    const dpr = 2;
    if (!scratch) scratch = document.createElement('canvas');
    const pw = Math.ceil(cssW * dpr);
    const ph = Math.ceil(cssH * dpr);
    if (scratch.width !== pw) scratch.width = pw;
    if (scratch.height !== ph) scratch.height = ph;
    const octx = scratch.getContext('2d', { willReadFrequently: true });
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, cssW, cssH);
    copyFontState(ctx, octx);
    octx.fillStyle = '#000';
    octx.fillText(emoji, pad + left, pad + ascent);

    const image = octx.getImageData(0, 0, pw, ph);
    recolorImageData(image, rgba);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.putImageData(image, 0, 0);

    const destX = x - left - pad;
    const destY = y - ascent - pad;
    ctx.drawImage(scratch, destX, destY, cssW, cssH);
  }

  function fillText(ctx, text, x, y, maxWidth) {
    const value = String(text ?? '');
    if (!ctx || !value) return;
    if (maxWidth != null || !hasEmoji(value)) {
      if (maxWidth != null) ctx.fillText(value, x, y, maxWidth);
      else ctx.fillText(value, x, y);
      return;
    }
    const rgba = parseFillColor(ctx.fillStyle);
    if (!rgba) {
      ctx.fillText(value, x, y);
      return;
    }

    const parts = splitTextByEmoji(value);
    const spacing = letterSpacingPx(ctx);
    let total = 0;
    const widths = parts.map((part) => ctx.measureText(part.text).width);
    for (let i = 0; i < widths.length; i += 1) {
      total += widths[i];
      if (i > 0) total += spacing;
    }
    const align = ctx.textAlign || 'start';
    const rtl = ctx.direction === 'rtl';
    let startX = x;
    const alignRight = align === 'right' || align === 'end' && !rtl || align === 'start' && rtl;
    if (align === 'center') startX = x - total / 2;
    else if (alignRight) startX = x - total;

    ctx.save();
    ctx.textAlign = 'left';
    let cursor = startX;
    try {
      for (let i = 0; i < parts.length; i += 1) {
        if (i > 0) cursor += spacing;
        const part = parts[i];
        if (part.emoji) drawEmojiGlyph(ctx, part.text, cursor, y, rgba);
        else ctx.fillText(part.text, cursor, y);
        cursor += widths[i];
      }
    } finally {
      ctx.restore();
    }
  }

  function emojiMask(emoji) {
    if (maskCache.has(emoji)) return maskCache.get(emoji);
    if (typeof document === 'undefined') return null;
    const fontPx = 96;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.font = `${fontPx}px sans-serif`;
    const metrics = ctx.measureText(emoji);
    const ascent = metrics.actualBoundingBoxAscent > 0 ? metrics.actualBoundingBoxAscent : fontPx * 0.8;
    const descent = metrics.actualBoundingBoxDescent > 0 ? metrics.actualBoundingBoxDescent : fontPx * 0.22;
    const left = metrics.actualBoundingBoxLeft > 0 ? metrics.actualBoundingBoxLeft : 0;
    const advance = Math.max(metrics.width, 1);
    const right = metrics.actualBoundingBoxRight > 0 ? metrics.actualBoundingBoxRight : advance;
    const pad = 4;
    const w = Math.max(1, Math.ceil(Math.max(advance, left + right) + pad * 2));
    const h = Math.max(1, Math.ceil(ascent + descent + pad * 2));
    canvas.width = w;
    canvas.height = h;
    ctx.font = `${fontPx}px sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(emoji, pad + left, pad + ascent);
    const image = ctx.getImageData(0, 0, w, h);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 12) data[i + 3] = 0;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
    ctx.putImageData(image, 0, 0);
    const record = {
      url: canvas.toDataURL('image/png'),
      widthEm: w / fontPx,
      heightEm: h / fontPx,
      verticalAlignEm: -((descent + pad) / fontPx)
    };
    maskCache.set(emoji, record);
    return record;
  }

  function setElementText(el, text) {
    const value = String(text ?? '');
    if (!el) return;
    if (!hasEmoji(value) || typeof document === 'undefined') {
      el.textContent = value;
      return;
    }
    const parts = splitTextByEmoji(value);
    el.replaceChildren();
    for (const part of parts) {
      if (!part.emoji) {
        el.appendChild(document.createTextNode(part.text));
        continue;
      }
      const mask = emojiMask(part.text);
      if (!mask) {
        el.appendChild(document.createTextNode(part.text));
        continue;
      }
      const span = document.createElement('span');
      span.className = 'ink-emoji';
      span.style.width = `${mask.widthEm}em`;
      span.style.height = `${mask.heightEm}em`;
      span.style.verticalAlign = `${mask.verticalAlignEm}em`;
      span.style.webkitMaskImage = `url("${mask.url}")`;
      span.style.maskImage = `url("${mask.url}")`;
      const glyph = document.createElement('span');
      glyph.className = 'ink-emoji__glyph';
      glyph.textContent = part.text;
      span.appendChild(glyph);
      el.appendChild(span);
    }
  }

  return {
    hasEmoji,
    splitTextByEmoji,
    fillText,
    setElementText
  };
});
