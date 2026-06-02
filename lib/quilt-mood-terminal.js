/**
 * 1990s CRT terminal screen for mood messages (good_day / rough_day).
 * Interactive: question (full / half circle) → user picks → mood message.
 * Browser: global.QuiltMoodTerminal.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.QuiltMoodTerminal = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function (global) {
  'use strict';

  const TERMINAL_COMPOSER_VERSION = 17;

  /** CRT grain tile (fractal noise). */
  const TERMINAL_GRAIN_DATA_URL =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.65'/%3E%3C/svg%3E";

  /** App / portal warm paper (#f6f4f1, --odq-warm-paper). */
  const TERMINAL_APP_NEUTRAL = '#f6f4f1';

  /** Same Material icon names as #screen-quilt .quilt-mood-widget tiles. */
  const MOOD_TERMINAL_ICONS = {
    good: 'brightness_1',
    rough: 'contrast'
  };

  const MATERIAL_SYMBOLS_URL =
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=brightness_1,contrast&display=block';

  const TERMINAL_DEFAULTS = {
    exportScale: 2,
    width: 340,
    minHeight: 120,
    padX: 22,
    padY: 26,
    fontSizePx: 26,
    lineHeight: 1.42,
    phosphor: '#e6d4a8',
    phosphorCore: '#fff8e8',
    phosphorGlow: 'rgba(255, 236, 200, 0.22)',
    phosphorDim: 'rgba(210, 188, 140, 0.72)',
    background: '#100e0a',
    prompt: '> ',
    showPrompt: true,
    scanlineOpacity: 0,
    vignetteStrength: 0,
    fontFamily: '"Bitcount Single", "Bitcount Grid Single", "VT323", ui-monospace, monospace',
    fontFamilyExport: '"Bitcount Single", "Bitcount Grid Single", "VT323", ui-monospace, monospace',
  /** Extra tracking — pixel monos are fixed-width; light tracking adds air. */
    letterSpacing: '0.06em',
    fontSizeScale: 1.5,
    showMoodQuestion: false,
    moodQuestionOr: 'or',
    materialIconFont: '"Material Symbols Outlined"',
    alignTop: true,
    uppercase: false,
    wakeOnReveal: true,
    wakeThreshold: 0.22,
    wakeDurationMs: 1150,
    typewriterMs: 26,
    receiptLeadText: 'a special message for',
    pixelateIcons: true,
    /** Lower = chunkier pixels (6–14). Default 11 balances retro + clarity. */
    iconPixelGrid: 11,
    iconDisplayPx: 30,
    showQuoteClipping: true,
    quoteClippingWidth: 0,
    quoteScale: 0.81,
    quoteExportScale: 2
  };

  const TAPE_ASSET_URL = 'assets/before-you-go-tape-alpha.png';
  /** Horizontal inset so side tape gradients do not cover center quote lines. */
  const TERMINAL_TAPE_SAFE_X = '0.35rem';

  const pixelIconCache = new Map();

  /**
   * Draw Material-style outlined circle / half-circle on a tiny grid (FILL 0 tiles).
   */
  function drawOutlinedIconOnGrid(ctx, gridN, iconName, ink) {
    const cx = gridN / 2;
    const cy = gridN / 2;
    const r = gridN * 0.36;
    const rough = iconName === MOOD_TERMINAL_ICONS.rough;
    const lineW = Math.max(1.25, gridN * 0.16);

    ctx.clearRect(0, 0, gridN, gridN);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    if (rough) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r - lineW * 0.35);
      ctx.lineTo(cx, cy + r + lineW * 0.35);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function buildIconPixelGrid(iconName, gridN = 9) {
    if (typeof document === 'undefined') return [];
    const g = Math.max(6, Math.round(gridN));
    const lo = document.createElement('canvas');
    lo.width = g;
    lo.height = g;
    const lctx = lo.getContext('2d');
    if (!lctx) return [];
    drawOutlinedIconOnGrid(lctx, g, iconName, '#fff');
    const data = lctx.getImageData(0, 0, g, g).data;
    const grid = [];
    for (let y = 0; y < g; y++) {
      const row = [];
      for (let x = 0; x < g; x++) {
        const i = (y * g + x) * 4;
        row.push(data[i + 3] > 32 ? 1 : 0);
      }
      grid.push(row);
    }
    return grid;
  }

  function normalizeText(value) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Phosphor line casing (DOM + canvas). */
  function terminalCaseText(text, cfg = TERMINAL_DEFAULTS) {
    const t = String(text ?? '');
    if (!t) return '';
    if (cfg.uppercase === false) return t;
    return t.toLocaleUpperCase('en-US');
  }

  function resolveRecipientName(opts = {}) {
    const direct = normalizeText(
      opts.recipientName ?? opts.userName ?? opts.user_name ?? opts.recipient
    );
    if (direct) return direct;
    const U = global.Utils;
    if (U?.getNameThanksDisplayName) {
      return normalizeText(U.getNameThanksDisplayName()) || 'Friend';
    }
    return 'Friend';
  }

  function formatReceiptLeadLine(leadCopy, recipient, cfg = TERMINAL_DEFAULTS) {
    const lead = String(leadCopy ?? '').trim();
    const name = String(recipient || '').trim();
    const line = name ? `${lead} ${name}` : lead;
    return line ? line.toLocaleUpperCase('en-US') : '';
  }

  function formatTerminalPrintedStamp(date = new Date()) {
    const U = global.Utils;
    if (U?.formatMoodReceiptStamp) return U.formatMoodReceiptStamp(date);
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear() % 100).padStart(2, '0');
    let hour12 = d.getHours() % 12;
    if (hour12 === 0) hour12 = 12;
    const min = String(d.getMinutes()).padStart(2, '0');
    const meridiem = d.getHours() >= 12 ? 'P' : 'A';
    return `${mm}/${dd}/${yy} ${String(hour12).padStart(2, '0')}:${min}${meridiem}`;
  }

  function hexToRgb(hex) {
    const U = global.Utils;
    if (U?.hexToRgb) return U.hexToRgb(hex);
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function hexToHsv(hex) {
    const U = global.Utils;
    if (U?.hexToHsv) return U.hexToHsv(hex);
    const rgb = hexToRgb(hex);
    if (!rgb) return { h: 0, s: 0, v: 72 };
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d > 1e-10) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return {
      h: (h * 360 + 360) % 360,
      s: max < 1e-10 ? 0 : (d / max) * 100,
      v: max * 100
    };
  }

  function hsvToHex(h, s, v) {
    const U = global.Utils;
    if (U?.hsvToHex) return U.hsvToHex(h, s, v);
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    v = Math.max(0, Math.min(100, v)) / 100;
    const hex = (n) => {
      const x = Math.round(n).toString(16);
      return x.length === 1 ? `0${x}` : x;
    };
    if (s === 0) {
      const g = Math.round(v * 255);
      return `#${hex(g)}${hex(g)}${hex(g)}`;
    }
    const i = Math.floor(h / 60) % 6;
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r;
    let g;
    let b;
    switch (i) {
      case 0:
        r = v;
        g = t;
        b = p;
        break;
      case 1:
        r = q;
        g = v;
        b = p;
        break;
      case 2:
        r = p;
        g = v;
        b = t;
        break;
      case 3:
        r = p;
        g = q;
        b = v;
        break;
      case 4:
        r = t;
        g = p;
        b = v;
        break;
      default:
        r = v;
        g = p;
        b = q;
        break;
    }
    return `#${hex(r * 255)}${hex(g * 255)}${hex(b * 255)}`;
  }

  function rgbaFromHex(hex, alpha) {
    const rgb = hexToRgb(hex);
    if (!rgb) return `rgba(255, 248, 232, ${alpha})`;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  /** Dark screen + light phosphor from the quilt's leading color. */
  function buildTerminalThemeFromQuiltColor(hex) {
    const raw = String(hex || '').trim();
    if (!/^#?[0-9a-f]{6}$/i.test(raw)) return null;
    const source = raw.startsWith('#') ? raw : `#${raw}`;
    const hsv = hexToHsv(source);
    const h = hsv.h;
    const s = hsv.s;
    const v = hsv.v;
    const gray = s < 8;

    const background = hsvToHex(
      h,
      gray ? 0 : Math.max(18, Math.min(56, s * 0.5)),
      Math.max(7, Math.min(15, v * 0.09 + 7))
    );
    const phosphorCore = hsvToHex(
      h,
      gray ? 0 : Math.max(16, Math.min(62, s * 0.36)),
      Math.max(90, Math.min(98, v * 0.2 + 76))
    );
    const phosphor = hsvToHex(
      h,
      gray ? 0 : Math.max(22, Math.min(74, s * 0.46)),
      Math.max(74, Math.min(90, v * 0.16 + 56))
    );
    const phosphorDim = hsvToHex(
      h,
      gray ? 0 : Math.max(14, Math.min(52, s * 0.34)),
      Math.max(48, Math.min(64, v * 0.12 + 40))
    );

    const bgRgb = hexToRgb(background) || { r: 16, g: 14, b: 10 };
    const coreRgb = hexToRgb(phosphorCore) || { r: 255, g: 248, b: 232 };

    return {
      source,
      phosphor,
      phosphorCore,
      phosphorDim,
      background,
      phosphorGlow: rgbaFromHex(phosphorCore, 0.22),
      screenMid: `rgba(${Math.min(255, bgRgb.r + 28)}, ${Math.min(255, bgRgb.g + 22)}, ${Math.min(255, bgRgb.b + 14)}, 0.28)`,
      screenDeep: `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 0.86)`,
      backlight: rgbaFromHex(phosphorCore, 0.06),
      backlightCore: rgbaFromHex(phosphorCore, 0.03),
      glow: rgbaFromHex(phosphorCore, 0.14),
      glowSoft: rgbaFromHex(phosphorCore, 0.07),
      meshDot: rgbaFromHex(phosphorCore, 0.2),
      glassHi: `rgba(${Math.min(255, coreRgb.r + 10)}, ${Math.min(255, coreRgb.g + 8)}, ${Math.min(255, coreRgb.b + 6)}, 0.1)`,
      glassLo: rgbaFromHex(phosphorCore, 0.04),
      border: rgbaFromHex(phosphorCore, 0.12),
      bezelGlow: rgbaFromHex(phosphorCore, 0.06)
    };
  }

  function applyTerminalQuiltTheme(root, hex, opts = {}) {
    if (!root) return null;
    const prefix = opts.prefix || 'mood-terminal';
    const el = root.classList?.contains?.(prefix) ? root : root.querySelector?.(`.${prefix}`);
    if (!el) return null;

    const theme = buildTerminalThemeFromQuiltColor(hex);
    if (!theme) {
      delete el.dataset.quiltAccentColor;
      delete el._terminalTheme;
      return null;
    }

    el.style.setProperty('--term-phosphor', theme.phosphor);
    el.style.setProperty('--term-phosphor-core', theme.phosphorCore);
    el.style.setProperty('--term-phosphor-dim', theme.phosphorDim);
    el.style.setProperty('--term-bg', theme.background);
    el.style.setProperty('--term-backlight', theme.backlight);
    el.style.setProperty('--term-backlight-core', theme.backlightCore);
    el.style.setProperty('--term-glow', theme.glow);
    el.style.setProperty('--term-glow-soft', theme.glowSoft);
    el.style.setProperty('--term-screen-mid', theme.screenMid);
    el.style.setProperty('--term-screen-deep', theme.screenDeep);
    el.dataset.quiltAccentColor = theme.source;
    el._terminalTheme = theme;
    return theme;
  }

  const TERMINAL_FONT_LINKS = new Set();

  /** Pixel / bitmap faces only — smooth vector monos are not terminal-like. */
  const TERMINAL_FONT_OPTIONS = [
    {
      id: 'bitcount-mono-single',
      label: 'Bitcount Mono Single',
      note: 'On Google Fonts as “Bitcount Single” — taller mono grid, clearer lowercase',
      family: '"Bitcount Single", "Bitcount Grid Single", ui-monospace, monospace',
      google: 'Bitcount+Single',
      fontSizeScale: 1.5,
      letterSpacing: '0.06em'
    },
    {
      id: 'bitcount-grid-single',
      label: 'Bitcount Grid Single',
      note: 'Compact 5×7 monospaced grid',
      family: '"Bitcount Grid Single", "VT323", ui-monospace, monospace',
      google: 'Bitcount+Grid+Single',
      fontSizeScale: 1.3,
      letterSpacing: '0.06em'
    },
    {
      id: 'workbench',
      label: 'Workbench',
      note: 'Amiga / C64 pixel mono — CRT scanline & bleed axes',
      family: '"Workbench", "Bitcount Grid Single", ui-monospace, monospace',
      google: 'Workbench',
      fontSizeScale: 1.3,
      letterSpacing: '0.06em',
      fontVariationSettings: "'SCAN' 0, 'BLED' 0"
    },
    {
      id: 'vt323',
      label: 'VT323',
      note: 'Phosphor CRT — taller pixels, narrower feel',
      family: '"VT323", ui-monospace, monospace',
      google: 'VT323',
      fontSizeScale: 1.2,
      letterSpacing: '0.05em'
    },
    {
      id: 'doto',
      label: 'Doto',
      note: 'Dot-matrix grid — open but less classic terminal',
      family: '"Doto", ui-monospace, monospace',
      google: 'Doto',
      fontSizeScale: 1.32,
      letterSpacing: '0.06em'
    },
    {
      id: 'pixelify-sans',
      label: 'Pixelify Sans',
      note: 'Chunky 8-bit sans pixels',
      family: '"Pixelify Sans", ui-monospace, monospace',
      google: 'Pixelify+Sans',
      fontSizeScale: 1.38,
      letterSpacing: '0.05em'
    },
    {
      id: 'press-start-2p',
      label: 'Press Start 2P',
      note: 'Arcade cartridge — very blocky, small x-height',
      family: '"Press Start 2P", ui-monospace, monospace',
      google: 'Press+Start+2P',
      fontSizeScale: 1.62,
      letterSpacing: '0.03em'
    }
  ];

  function terminalFontOptionForStack(fontFamilyStack) {
    const stack = String(fontFamilyStack || '');
    return TERMINAL_FONT_OPTIONS.find((f) => stack.includes(f.family.split('"')[1]));
  }

  function ensureTerminalGoogleFont(fontFamilyStack) {
    if (typeof document === 'undefined') return;
    const match = String(fontFamilyStack || '').match(/"([^"]+)"/);
    const name = match?.[1]?.trim();
    if (!name || name === 'Courier New' || TERMINAL_FONT_LINKS.has(name)) return;
    TERMINAL_FONT_LINKS.add(name);
    const id = `quilt-mood-terminal-font-${name.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/\s+/g, '+')}&display=swap`;
    document.head.appendChild(link);
  }

  function applyTerminalFontFamily(root, opts = {}) {
    const stack = opts.fontFamily || TERMINAL_DEFAULTS.fontFamily;
    ensureTerminalGoogleFont(stack);
    const fontOpt = terminalFontOptionForStack(stack);
    const prefix = opts.classPrefix || 'mood-terminal';
    const el =
      root?.classList?.contains?.(prefix) ? root : root?.querySelector?.(`.${prefix}`);
    if (el) {
      el.style.setProperty('--term-font', stack);
      const ls =
        opts.letterSpacing ??
        fontOpt?.letterSpacing ??
        TERMINAL_DEFAULTS.letterSpacing;
      if (ls) el.style.setProperty('--term-letter-spacing', ls);
      const scale =
        Number(opts.fontSizeScale) > 0
          ? Number(opts.fontSizeScale)
          : Number(fontOpt?.fontSizeScale) > 0
            ? Number(fontOpt.fontSizeScale)
            : Number(TERMINAL_DEFAULTS.fontSizeScale) || 1;
      el.style.setProperty('--term-font-size-scale', String(scale));
      const fvs = opts.fontVariationSettings ?? fontOpt?.fontVariationSettings ?? '';
      if (fvs) el.style.setProperty('--term-font-variation-settings', fvs);
      else el.style.removeProperty('--term-font-variation-settings');
    }
    return stack;
  }

  function terminalCfgWithTheme(el, cfg = {}) {
    const theme = el?._terminalTheme;
    if (!theme) return cfg;
    return {
      ...cfg,
      phosphor: theme.phosphor,
      phosphorCore: theme.phosphorCore,
      phosphorDim: theme.phosphorDim,
      phosphorGlow: theme.phosphorGlow,
      background: theme.background
    };
  }

  function resolveMoodLine(opts = {}) {
    const mood = String(opts.mood ?? opts.variant ?? 'good').toLowerCase() === 'rough' ? 'rough' : 'good';
    const goodDay = normalizeText(opts.goodDay ?? opts.good_day);
    const roughDay = normalizeText(opts.roughDay ?? opts.rough_day);
    const fallback = normalizeText(opts.line ?? opts.message);
    if (mood === 'rough') return roughDay || fallback;
    return goodDay || fallback;
  }

  function terminalFont(sizePx, cfg) {
    const fam = cfg.fontFamilyExport || cfg.fontFamily || TERMINAL_DEFAULTS.fontFamilyExport;
    return `${Math.round(sizePx)}px ${fam}`;
  }

  async function ensureTerminalFont(sizePx = TERMINAL_DEFAULTS.fontSizePx, cfg = TERMINAL_DEFAULTS) {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    const stack = cfg.fontFamily || TERMINAL_DEFAULTS.fontFamily;
    try {
      await document.fonts.load(`${Math.round(sizePx)}px ${stack}`);
    } catch (_) { /* webfont optional */ }
  }

  /** True when the host page already linked Material Symbols (e.g. our-daily-beta.html). */
  function documentHasMaterialSymbolsFontLink() {
    if (typeof document === 'undefined') return false;
    return Array.from(document.querySelectorAll('link[rel][href]')).some((link) =>
      /Material\+Symbols\+Outlined/i.test(link.getAttribute('href') || '')
    );
  }

  function ensureMaterialSymbolsStylesheet() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('quilt-mood-terminal-material-symbols')) return;
    // Do not inject a 2-glyph subset — it replaces @font-face and breaks art_recs_type icons.
    if (documentHasMaterialSymbolsFontLink()) return;
    const link = document.createElement('link');
    link.id = 'quilt-mood-terminal-material-symbols';
    link.rel = 'stylesheet';
    link.href = MATERIAL_SYMBOLS_URL;
    document.head.appendChild(link);
  }

  async function ensureMaterialSymbolsFont(iconPx = 28, cfg = TERMINAL_DEFAULTS) {
    ensureMaterialSymbolsStylesheet();
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    const fam = cfg.materialIconFont || TERMINAL_DEFAULTS.materialIconFont;
    try {
      await document.fonts.load(`${Math.round(iconPx)}px ${fam}`);
    } catch (_) { /* optional */ }
  }

  function materialIconFont(sizePx, cfg) {
    return `${Math.round(sizePx)}px ${cfg.materialIconFont || TERMINAL_DEFAULTS.materialIconFont}`;
  }

  /**
   * Chunky pixel icon (outlined circle / half-circle). Used for DOM <img> and canvas export.
   * @returns {HTMLCanvasElement | null}
   */
  function rasterizePixelatedIcon(iconName, displayPx, cfgIn = {}) {
    if (typeof document === 'undefined') return null;
    const cfg = { ...TERMINAL_DEFAULTS, ...cfgIn };
    if (cfg.pixelateIcons === false) return null;

    const display = Math.max(12, Math.round(displayPx));
    const gridN = Math.max(6, Math.round(cfg.iconPixelGrid ?? TERMINAL_DEFAULTS.iconPixelGrid));
    const ink = cfg.phosphorCore || cfg.phosphor || TERMINAL_DEFAULTS.phosphorCore;
    const cacheKey = `${iconName}:${display}:${gridN}:${ink}`;
    if (pixelIconCache.has(cacheKey)) return pixelIconCache.get(cacheKey);

    const lo = document.createElement('canvas');
    lo.width = gridN;
    lo.height = gridN;
    const lctx = lo.getContext('2d');
    if (!lctx) return null;
    drawOutlinedIconOnGrid(lctx, gridN, iconName, ink);

    const out = document.createElement('canvas');
    out.width = display;
    out.height = display;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.imageSmoothingEnabled = false;
    octx.drawImage(lo, 0, 0, display, display);

    pixelIconCache.set(cacheKey, out);
    return out;
  }

  function resolveQuoteInput(opts = {}) {
    const q = opts.quote || {};
    const text = normalizeText(q.text ?? opts.quoteText ?? opts.text);
    const author = normalizeText(q.author ?? opts.quoteAuthor ?? opts.author);
    if (!text) return null;
    return {
      text,
      author,
      dateKey: String(q.dateKey ?? opts.dateKey ?? '').trim(),
      firstLineCount: Number(q.firstLineCount ?? opts.firstLineCount ?? 0) || undefined,
      neighbor: opts.quoteNeighbor ?? q.neighbor ?? null
    };
  }

  function clippingNeighborRow(q) {
    if (!q || typeof q !== 'object') return null;
    const text = String(q.text ?? q.body ?? '').trim();
    if (!text) return null;
    const author = String(q.author ?? q.authorSnapshot ?? '').trim();
    return { text, author: author || undefined };
  }

  async function resolveAdjacentQuotesForClipping(quote, opts = {}) {
    if (opts.yesterday != null || opts.tomorrow != null) {
      return {
        yesterday: opts.yesterday ?? null,
        tomorrow: opts.tomorrow ?? null
      };
    }
    const app = global.app || globalThis.app;
    const qs = app?.quoteService;
    const dk = String(
      quote?.dateKey || opts.dateKey || qs?.getQuoteCalendarKeyNow?.() || ''
    ).trim();
    if (!qs || !dk) return { yesterday: null, tomorrow: null };
    try {
      if (typeof qs.getAdjacentQuotesForClippingDateKey === 'function') {
        const adj = await qs.getAdjacentQuotesForClippingDateKey(dk);
        return {
          yesterday: adj?.yesterday ?? null,
          tomorrow: adj?.tomorrow ?? null
        };
      }
      const adj = qs.getAdjacentQuotesForClipping?.() || {};
      return {
        yesterday: adj.yesterday ?? null,
        tomorrow: adj.tomorrow ?? null
      };
    } catch (_) {
      return { yesterday: null, tomorrow: null };
    }
  }

  function measureTerminalQuoteDomWidth(root, prefix) {
    const content = root?.querySelector?.(`.${prefix}__content`);
    const screen = root?.querySelector?.(`.${prefix}__screen`);
    let domW = content?.clientWidth || screen?.clientWidth || 0;
    if (domW < 120) {
      const host = root?.closest?.('.quilt-mood-terminal-host') || root?.parentElement;
      if (host?.clientWidth >= 120) domW = host.clientWidth;
    }
    if (domW < 120 && typeof window !== 'undefined') {
      domW =
        window.innerWidth ||
        document.documentElement?.clientWidth ||
        document.body?.clientWidth ||
        0;
    }
    return Math.max(120, Math.round(domW));
  }

  function measureTerminalQuoteClippingWidth(root, prefix, opts = {}) {
    const explicit = Number(opts.quoteClippingWidth ?? TERMINAL_DEFAULTS.quoteClippingWidth);
    if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);

    const domW = measureTerminalQuoteDomWidth(root, prefix);
    const quoteScale = Number(opts.quoteScale ?? TERMINAL_DEFAULTS.quoteScale);
    const scale = Number.isFinite(quoteScale) && quoteScale > 0 ? quoteScale : 1;
    const exportScale = Number(opts.quoteExportScale ?? TERMINAL_DEFAULTS.quoteExportScale);
    const exp =
      Number.isFinite(exportScale) && exportScale > 0 ? exportScale : 2;
    return Math.round(domW * scale * exp);
  }

  function buildTerminalClippingComposeCfg(root, prefix, opts = {}) {
    const cfg = { ...TERMINAL_DEFAULTS, ...opts };
    const centerOnly = opts.quoteCenterOnly === true;
    const peekRatio =
      typeof opts.peekRatio === 'number' && opts.peekRatio >= 0
        ? opts.peekRatio
        : 0.09;
    return {
      ...cfg,
      width: measureTerminalQuoteClippingWidth(root, prefix, cfg),
      centerOnly,
      peekRatio,
      centerColMaxW: centerOnly ? 0 : undefined,
      centerColMinW: 0
    };
  }

  /** DOM width of the clipping's center column (matches 1:3:1 peek crop band). */
  function measureTerminalCenterColumnDomWidth(root, prefix, opts = {}) {
    const QNC = global.QuiltNewspaperClipping;
    const img = root?.querySelector?.(`.${prefix}__quote-img`);
    const stage = root?.querySelector?.(`.${prefix}__quote-stage`);
    const displayW =
      img?.clientWidth ||
      stage?.clientWidth ||
      measureTerminalQuoteDomWidth(root, prefix);

    if (img?.naturalWidth > 0 && QNC?.centerBandWidthFromQuoteClippingPx) {
      const clipCfg = buildTerminalClippingComposeCfg(root, prefix, opts);
      const centerPx = QNC.centerBandWidthFromQuoteClippingPx(img.naturalWidth, clipCfg);
      return Math.max(48, Math.round((displayW / img.naturalWidth) * centerPx));
    }

    if (QNC?.resolveQuoteCropMetrics) {
      const clipCfg = buildTerminalClippingComposeCfg(root, prefix, opts);
      const { centerOutW, outW } = QNC.resolveQuoteCropMetrics(clipCfg);
      if (outW > 0) {
        return Math.max(48, Math.round(displayW * (centerOutW / outW)));
      }
    }

    return Math.max(48, Math.round(displayW * 0.77));
  }

  function applyTerminalLinesColumnWidth(root, prefix, opts = {}) {
    if (!root) return;
    const lines = root.querySelector?.(`.${prefix}__lines`);
    if (!lines) return;

    const w = measureTerminalCenterColumnDomWidth(root, prefix, opts);
    root.style.setProperty('--term-lines-w', `${w}px`);
    root._terminalLinesWidthOpts = opts;

    if (root._terminalLinesWidthObserver || root._terminalLinesWidthOnResize) return;

    const update = () =>
      syncTerminalClippingLayout(root, prefix, root._terminalLinesWidthOpts || {});

    const img = root.querySelector(`.${prefix}__quote-img`);
    const observeTarget =
      img || root.querySelector(`.${prefix}__quote-stage`) || root.querySelector(`.${prefix}__screen`);

    if (typeof ResizeObserver !== 'undefined' && observeTarget) {
      const ro = new ResizeObserver(() => update());
      ro.observe(observeTarget);
      if (observeTarget !== img && img) ro.observe(img);
      root._terminalLinesWidthObserver = ro;
      return;
    }

    if (typeof window !== 'undefined') {
      const onResize = () => update();
      window.addEventListener('resize', onResize);
      root._terminalLinesWidthOnResize = onResize;
    }
  }

  function syncTerminalClippingLayout(root, prefix, opts = {}) {
    if (!root) return;
    const img = root.querySelector(`.${prefix}__quote-img`);
    if (img?.offsetHeight > 0) {
      const imgH = Math.round(img.offsetHeight);
      const halfH = Math.round(imgH / 2);
      const stage = root.querySelector(`.${prefix}__quote-stage`);
      const stageH = stage?.offsetHeight > 0 ? Math.round(stage.offsetHeight) : imgH;
      const topBand = Math.max(imgH, stageH) + 14;
      root.style.setProperty('--term-clipping-half-h', `${halfH}px`);
      root.style.setProperty('--term-quote-img-h', `${imgH}px`);
      root.style.setProperty('--mat-quote-slot-h', `${stageH}px`);
      root.style.setProperty('--term-quote-stack-gap', '0.9rem');
      root.style.setProperty('--term-quote-top-band', `${topBand}px`);
    }
    applyTerminalLinesColumnWidth(root, prefix, opts);
  }

  function clearTerminalTapeSlabMask(slab, prefix) {
    if (!slab) return;
    slab.classList.remove(`${prefix}__tape-slab--masked`);
    slab.style.removeProperty('--term-quote-mask');
    slab.style.removeProperty('--term-tape-safe-x');
    slab.style.removeProperty('--term-quote-mask-w');
    slab.style.removeProperty('--term-quote-mask-h');
    slab.style.width = '100%';
    slab.style.maxWidth = '100%';
  }

  async function resolveTerminalQuoteClippingUrl(opts = {}) {
    const preset = String(opts.quoteClippingUrl || '').trim();
    if (preset) return preset;
    if (opts._remoteClippingFailed) return '';
    if (typeof opts.resolveQuoteClippingUrl !== 'function') return '';
    try {
      const dk = resolveQuoteInput(opts)?.dateKey;
      return String((dk && (await opts.resolveQuoteClippingUrl(dk))) || '').trim();
    } catch (_) {
      return '';
    }
  }

  /** Same PNG path as nightly job / quilt screen (`width: 0`, adjacent quotes). */
  async function composeTerminalQuoteClippingFallbackDataUrl(quote, opts = {}) {
    const QNC = global.QuiltNewspaperClipping;
    if (!QNC?.composeDataUrl) return null;

    let paperTextureUrl = null;
    try {
      if (typeof location !== 'undefined' && location.href) {
        paperTextureUrl = new URL('assets/quilt-paper-card-texture.png', location.href).href;
      }
    } catch (_) {
      /* */
    }

    const { yesterday, tomorrow } = await resolveAdjacentQuotesForClipping(quote, opts);
    return QNC.composeDataUrl({
      yesterday,
      today: {
        text: quote.text,
        author: quote.author || undefined,
        first_line_count: quote.firstLineCount,
        dateKey: quote.dateKey
      },
      tomorrow,
      dateKey: quote.dateKey,
      paperTextureUrl,
      width: 0
    });
  }

  async function refreshTerminalQuoteClipping(root, prefix, opts = {}) {
    if (!root) return;
    const hydrateOpts = { ...opts, _remoteClippingFailed: false };
    const remoteUrl = await resolveTerminalQuoteClippingUrl(hydrateOpts);
    const img = root.querySelector(`.${prefix}__quote-img`);
    const currentRemote = root.classList.contains(`${prefix}--use-remote-clipping`);
    const currentSrc = String(img?.currentSrc || img?.src || '').trim();
    if (remoteUrl && currentRemote && currentSrc === remoteUrl) return;
    await hydrateQuoteClipping(root, prefix, {
      ...hydrateOpts,
      quoteClippingUrl: remoteUrl
    });
    requestAnimationFrame(() => syncTerminalClippingLayout(root, prefix, hydrateOpts));
  }

  async function hydrateQuoteClipping(root, prefix, opts = {}) {
    if (!root || opts.showQuoteClipping === false) return;
    const stage = root.querySelector(`.${prefix}__quote-stage`);
    const img = root.querySelector(`.${prefix}__quote-img`);
    const slab = root.querySelector(`.${prefix}__tape-slab`);
    if (!stage || !img) return;

    const quote = resolveQuoteInput(opts);
    if (!quote) {
      stage.hidden = true;
      stage.setAttribute('aria-hidden', 'true');
      return;
    }

    stage.hidden = false;
    stage.removeAttribute('aria-hidden');

    const domW = measureTerminalQuoteDomWidth(root, prefix);
    const applyLoadedImage = () => {
      img.hidden = false;
      img.removeAttribute('hidden');
      img.style.width = '100%';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
      img.dataset.termQuoteDomW = String(domW);
      syncTerminalClippingLayout(root, prefix, opts);
      requestAnimationFrame(() => syncTerminalClippingLayout(root, prefix, opts));
    };

    const showFullClippingImage = (src, { onError } = {}) => {
      root.classList.add(`${prefix}--use-remote-clipping`);
      clearTerminalTapeSlabMask(slab, prefix);
      img.onload = applyLoadedImage;
      img.onerror = () => {
        if (typeof onError === 'function') onError();
        else stage.hidden = true;
      };
      img.alt = quote.author ? `${quote.text} — ${quote.author}` : quote.text;
      img.src = src;
      if (img.complete && img.naturalWidth > 0) applyLoadedImage();
    };

    const remoteUrl = await resolveTerminalQuoteClippingUrl(opts);
    if (remoteUrl) {
      showFullClippingImage(remoteUrl, {
        onError: () => {
          void hydrateQuoteClipping(root, prefix, {
            ...opts,
            quoteClippingUrl: '',
            _remoteClippingFailed: true
          });
        }
      });
      return;
    }

    root.classList.remove(`${prefix}--use-remote-clipping`);

    const dataUrl = await composeTerminalQuoteClippingFallbackDataUrl(quote, opts);
    if (!dataUrl) {
      stage.hidden = true;
      return;
    }

    showFullClippingImage(dataUrl);
  }

  function iconSlotHtml(prefix, iconName, pixelate) {
    if (!pixelate) {
      return `<span class="${prefix}__icon-slot" aria-hidden="true"><span class="material-symbols-outlined ${prefix}__icon-glyph" translate="no">${iconName}</span></span>`;
    }
    return `<span class="${prefix}__icon-slot ${prefix}__icon-slot--pixel" data-icon="${iconName}" aria-hidden="true"><img class="${prefix}__icon-bitmap" alt="" draggable="false" /></span>`;
  }

  async function hydratePixelatedIcons(root, prefix, cfgIn = {}) {
    if (!root || cfgIn.pixelateIcons === false) return;
    const cfg = { ...TERMINAL_DEFAULTS, ...cfgIn };
    const displayPx = Math.round(cfg.iconDisplayPx ?? TERMINAL_DEFAULTS.iconDisplayPx);

    root.querySelectorAll(`.${prefix}__icon-slot--pixel[data-icon]`).forEach((slot) => {
      const iconName = slot.getAttribute('data-icon');
      if (!iconName) return;
      const sheet = rasterizePixelatedIcon(iconName, displayPx, cfg);
      const img = slot.querySelector(`.${prefix}__icon-bitmap`);
      if (!sheet || !img) return;
      img.width = displayPx;
      img.height = displayPx;
      img.src = sheet.toDataURL('image/png');
    });
  }

  function measureTerminalLayout(mctx, line, cfgIn) {
    const cfg = { ...TERMINAL_DEFAULTS, ...cfgIn };
    line = terminalCaseText(line, cfg);
    const scale = Number(cfg.exportScale) > 0 ? Number(cfg.exportScale) : 1;
    const W = Math.round(Number(cfg.width) || TERMINAL_DEFAULTS.width);
    const padX = Math.round(cfg.padX * scale);
    const padY = Math.round(cfg.padY * scale);
    const fontScale = Number(cfg.fontSizeScale) > 0 ? Number(cfg.fontSizeScale) : 1;
    const fontPx = Math.round(cfg.fontSizePx * scale * fontScale);
    const lineH = fontPx * Number(cfg.lineHeight || TERMINAL_DEFAULTS.lineHeight);
    const innerW = Math.max(48, W - padX * 2);
    const showQuestion = cfg.showMoodQuestion === true;

    mctx.font = terminalFont(fontPx, cfg);
    const prompt = cfg.showPrompt !== false ? String(cfg.prompt ?? TERMINAL_DEFAULTS.prompt) : '';
    const promptW = prompt ? mctx.measureText(prompt).width : 0;
    const firstLineMax = Math.max(32, innerW - promptW);
    const restLineMax = innerW;

    const words = line.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    let isFirst = true;

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      const maxW = isFirst ? firstLineMax : restLineMax;
      mctx.font = terminalFont(fontPx, cfg);
      if (mctx.measureText(test).width > maxW && current) {
        lines.push({ text: current, prompt: isFirst && prompt ? prompt : '', kind: 'body' });
        current = word;
        isFirst = false;
      } else {
        current = test;
      }
    }
    if (current) {
      lines.push({ text: current, prompt: isFirst && prompt ? prompt : '', kind: 'body' });
    }

    if (showQuestion) {
      lines.unshift({ kind: 'question' });
    }

    const questionGap = showQuestion ? Math.round(fontPx * 0.35) : 0;
    const textH = lines.length * lineH + questionGap;
    const H = Math.max(
      Math.round((cfg.minHeight || TERMINAL_DEFAULTS.minHeight) * scale),
      Math.round(padY * 2 + textH)
    );

    return { cfg, scale, W, H, padX, padY, fontPx, lineH, innerW, lines, promptW, showQuestion, questionGap };
  }

  function drawPhosphorGlowText(ctx, text, x, y, cfg, { dim = false } = {}) {
    text = terminalCaseText(text, cfg);
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.shadowBlur = 0;
    ctx.fillStyle = dim
      ? (cfg.phosphorDim || TERMINAL_DEFAULTS.phosphorDim)
      : (cfg.phosphorCore || TERMINAL_DEFAULTS.phosphorCore);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawPhosphorIcon(ctx, iconName, x, y, iconPx, cfg) {
    const sheet =
      cfg.pixelateIcons !== false
        ? rasterizePixelatedIcon(iconName, iconPx, cfg)
        : null;

    if (sheet) {
      ctx.drawImage(sheet, x, y);
      return iconPx;
    }

    ctx.save();
    ctx.font = materialIconFont(iconPx, cfg);
    ctx.textBaseline = 'top';
    const canUseMaterial =
      typeof document !== 'undefined' &&
      document.fonts?.check?.(`${Math.round(iconPx)}px Material Symbols Outlined`);

    const cx = x + iconPx * 0.5;
    const cy = y + iconPx * 0.46;
    const r = iconPx * 0.38;
    ctx.fillStyle = cfg.phosphorCore || TERMINAL_DEFAULTS.phosphorCore;
    ctx.beginPath();
    if (iconName === MOOD_TERMINAL_ICONS.rough) {
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(cx, cy);
    } else {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
    return iconPx;
  }

  /** Left-aligned question row: &gt; + icons + or + ? */
  function drawMoodQuestionLine(ctx, x, y, cfg) {
    const prompt = cfg.showPrompt !== false ? String(cfg.prompt ?? TERMINAL_DEFAULTS.prompt) : '';
    let cursorX = x;
    ctx.font = terminalFont(cfg.fontPx, cfg);
    if (prompt) {
      drawPhosphorGlowText(ctx, prompt, cursorX, y, cfg, { dim: true });
      cursorX += ctx.measureText(prompt).width;
    }

    const iconPx = Math.round(cfg.fontPx * 1.15);
    const orText = ` ${terminalCaseText(cfg.moodQuestionOr ?? TERMINAL_DEFAULTS.moodQuestionOr, cfg)} `;
    const orW = ctx.measureText(orText).width;

    cursorX += drawPhosphorIcon(ctx, MOOD_TERMINAL_ICONS.good, cursorX, y, iconPx, cfg);
    ctx.font = terminalFont(cfg.fontPx, cfg);
    drawPhosphorGlowText(ctx, orText, cursorX, y + Math.round(iconPx * 0.08), cfg, { dim: true });
    cursorX += orW;
    cursorX += drawPhosphorIcon(ctx, MOOD_TERMINAL_ICONS.rough, cursorX, y, iconPx, cfg);
    ctx.font = terminalFont(cfg.fontPx, cfg);
    drawPhosphorGlowText(ctx, '?', cursorX, y, cfg);
  }

  function drawPhosphorLine(ctx, entry, x, y, cfg) {
    const full = `${entry.prompt || ''}${entry.text}`;
    const promptLen = (entry.prompt || '').length;
    const font = terminalFont(cfg.fontPx, cfg);

    ctx.save();
    ctx.font = font;
    ctx.textBaseline = 'top';

    ctx.shadowBlur = 0;
    if (promptLen > 0) {
      ctx.fillStyle = cfg.phosphorDim || TERMINAL_DEFAULTS.phosphorDim;
      ctx.fillText(entry.prompt, x, y);
      const promptW = ctx.measureText(entry.prompt).width;
      ctx.fillStyle = cfg.phosphorCore || TERMINAL_DEFAULTS.phosphorCore;
      ctx.fillText(entry.text, x + promptW, y);
    } else {
      ctx.fillStyle = cfg.phosphorCore || TERMINAL_DEFAULTS.phosphorCore;
      ctx.fillText(full, x, y);
    }
    ctx.restore();
  }

  function drawScanlines(ctx, w, h, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 2) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }

  function drawBacklight(ctx, w, h, cfg = {}) {
    const bgRgb = hexToRgb(cfg.background || TERMINAL_DEFAULTS.background) || {
      r: 255,
      g: 248,
      b: 232
    };
    const inkRgb = hexToRgb(cfg.phosphorCore || TERMINAL_DEFAULTS.phosphorCore) || {
      r: 26,
      g: 22,
      b: 16
    };
    const { r: br, g: bg, b: bb } = bgRgb;
    const { r: cr, g: cg, b: cb } = inkRgb;
    const cx = w * 0.5;
    const cy = h * 0.36;
    const rad = Math.max(w, h) * 0.62;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${Math.min(255, br + 12)}, ${Math.min(255, bg + 10)}, ${Math.min(255, bb + 8)}, 0.45)`);
    g.addColorStop(0.35, `rgba(${br}, ${bg}, ${bb}, 0.18)`);
    g.addColorStop(0.65, `rgba(${cr}, ${cg}, ${cb}, 0.04)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const g2 = ctx.createRadialGradient(cx, h * 0.92, 0, cx, h * 0.92, rad * 0.85);
    g2.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.05)`);
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawVignette(ctx, w, h, strength) {
    const cx = w / 2;
    const cy = h / 2;
    const r0 = Math.min(w, h) * 0.15;
    const r1 = Math.max(w, h) * 0.72;
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawScreenNoise(ctx, w, h, seed = 0) {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = ((i / 4) * 1103515245 + seed * 12345) & 255;
      if (n > 242) {
        const v = 10 + (n & 16);
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v + 6;
        d[i + 3] = 18;
      }
    }
    ctx.save();
    ctx.globalAlpha = 0.01;
    ctx.putImageData(img, 0, 0);
    ctx.restore();
  }

  function renderMoodTerminal(mctx, line, cfgIn = {}) {
    const text = normalizeText(line);
    if (!text && cfgIn.showMoodQuestion !== true) return null;

    const layout = measureTerminalLayout(mctx, text, cfgIn);
    const { W, H, padX, padY, fontPx, lineH, lines, questionGap } = layout;
    const cfg = { ...layout.cfg, fontPx };
    const alignTop = cfg.alignTop !== false;

    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = cfg.background || TERMINAL_DEFAULTS.background;
    ctx.fillRect(0, 0, W, H);

    const x = padX;
    const blockH = lines.length * lineH + (questionGap || 0);
    let y = alignTop ? padY : padY + Math.max(0, (H - padY * 2 - blockH) / 2);
    for (const entry of lines) {
      if (entry.kind === 'question') {
        drawMoodQuestionLine(ctx, x, y, cfg);
        y += lineH + (questionGap || 0);
      } else {
        drawPhosphorLine(ctx, entry, x, y, cfg);
        y += lineH;
      }
    }

    return { canvas, width: W, height: H };
  }

  async function composeTerminalDataUrl(opts = {}) {
    const line = resolveMoodLine(opts);
    if (!line && opts.showMoodQuestion !== true) return null;

    const cfg = { ...TERMINAL_DEFAULTS, ...opts, showMoodQuestion: opts.showMoodQuestion === true };
    const iconPx = Math.round((cfg.fontSizePx || TERMINAL_DEFAULTS.fontSizePx) * (cfg.exportScale || 1) * 1.15);
    const needsIcons = cfg.showMoodQuestion || cfg.pixelateIcons !== false;
    await Promise.all([
      ensureTerminalFont(cfg.fontSizePx * (cfg.exportScale || 1), cfg),
      needsIcons ? ensureMaterialSymbolsFont(iconPx * 3, cfg) : Promise.resolve()
    ]);
    if (document?.fonts?.ready) await document.fonts.ready;

    const measureCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!measureCanvas) return null;
    const mctx = measureCanvas.getContext('2d');
    if (!mctx) return null;

    const rendered = renderMoodTerminal(mctx, line, cfg);
    if (!rendered?.canvas) return null;
    try {
      return rendered.canvas.toDataURL('image/png', 0.92);
    } catch (_) {
      return null;
    }
  }

  function clearTerminalTypewriter(root) {
    if (!root) return;
    if (root._typewriterTimer) {
      clearTimeout(root._typewriterTimer);
      root._typewriterTimer = null;
    }
  }

  function runTypewriter(el, text, ms, onDone, cfg = TERMINAL_DEFAULTS) {
    const display = terminalCaseText(text, cfg);
    const root = el?.closest?.('.mood-terminal');
    if (!el || !display) {
      if (onDone) onDone();
      return;
    }
    clearTerminalTypewriter(root);
    el.textContent = '';
    let i = 0;
    const step = () => {
      if (i <= display.length) {
        el.textContent = display.slice(0, i);
        i += 1;
        if (root) root._typewriterTimer = setTimeout(step, ms);
        else setTimeout(step, ms);
      } else {
        clearTerminalTypewriter(root);
        if (onDone) onDone();
      }
    };
    step();
  }

  function finishTerminalIntro(root, prefix) {
    if (!root) return;
    root.classList.remove('is-intro-typing');
    root.dataset.introComplete = 'true';
    const picks = root.querySelectorAll(`.${prefix}__pick`);
    picks.forEach((btn) => {
      btn.disabled = false;
      btn.hidden = false;
      btn.tabIndex = 0;
    });
    const pending = root._pendingPick;
    delete root._pendingPick;
    if (pending === 'good' || pending === 'rough') {
      const handler = root._terminalHandlePick;
      if (typeof handler === 'function') handler(pending);
    }
    if (typeof root._onIntroComplete === 'function') {
      const fn = root._onIntroComplete;
      delete root._onIntroComplete;
      fn(root);
    }
  }

  function animateQuestionLine(root, prefix, opts = {}) {
    const questionRow = root.querySelector(`.${prefix}__line--question`);
    const qPrompt = root.querySelector(`.${prefix}__line--question .${prefix}__prompt`);
    const orEl = root.querySelector(`.${prefix}__or`);
    const qmEl = root.querySelector(`.${prefix}__qmark`);
    const picks = root.querySelectorAll(`.${prefix}__pick`);
    const qCursor = root.querySelector(`.${prefix}__cursor--question`);
    const ms = opts.typewriterMs ?? TERMINAL_DEFAULTS.typewriterMs ?? 28;
    const cfg = { ...TERMINAL_DEFAULTS, ...opts };
    const promptText = String(cfg.prompt ?? TERMINAL_DEFAULTS.prompt);
    const orWord = ` ${terminalCaseText(opts.moodQuestionOr ?? TERMINAL_DEFAULTS.moodQuestionOr, cfg)} `;

    if (questionRow) {
      questionRow.hidden = false;
      questionRow.removeAttribute('aria-hidden');
    }
    picks.forEach((btn) => {
      btn.hidden = true;
      btn.disabled = true;
    });
    if (qPrompt) qPrompt.textContent = '';
    if (orEl) orEl.textContent = '';
    if (qmEl) qmEl.textContent = '';
    if (qCursor) qCursor.hidden = true;

    const revealPick = (idx) => {
      const btn = picks[idx];
      if (btn) btn.hidden = false;
    };

    if (opts.typewriter === false || prefersReducedMotion()) {
      if (qPrompt) qPrompt.textContent = promptText;
      revealPick(0);
      revealPick(1);
      if (orEl) orEl.textContent = orWord;
      if (qmEl) qmEl.textContent = '?';
      if (qCursor) qCursor.hidden = false;
      finishTerminalIntro(root, prefix);
      return;
    }

    runTypewriter(qPrompt, promptText, ms, () => {
      revealPick(0);
      runTypewriter(orEl, orWord, ms, () => {
        revealPick(1);
        runTypewriter(qmEl, '?', ms, () => {
          if (qCursor) qCursor.hidden = false;
          finishTerminalIntro(root, prefix);
        }, cfg);
      }, cfg);
    }, cfg);
  }

  function prepareLeadLineForIntro(root, prefix) {
    const leadRow = root.querySelector(`.${prefix}__line--lead`);
    const leadPrompt = root.querySelector(`.${prefix}__line--lead .${prefix}__prompt`);
    const leadEl = root.querySelector(`.${prefix}__lead`);
    if (leadRow) {
      leadRow.hidden = true;
      leadRow.setAttribute('aria-hidden', 'true');
    }
    if (leadPrompt) leadPrompt.textContent = '';
    if (leadEl) leadEl.textContent = '';
  }

  function prepareQuestionLineForIntro(root, prefix) {
    const questionRow = root.querySelector(`.${prefix}__line--question`);
    const qPrompt = root.querySelector(`.${prefix}__line--question .${prefix}__prompt`);
    const orEl = root.querySelector(`.${prefix}__or`);
    const qmEl = root.querySelector(`.${prefix}__qmark`);
    const picks = root.querySelectorAll(`.${prefix}__pick`);
    const qCursor = root.querySelector(`.${prefix}__cursor--question`);
    if (questionRow) {
      questionRow.hidden = true;
      questionRow.setAttribute('aria-hidden', 'true');
    }
    picks.forEach((btn) => {
      btn.hidden = true;
      btn.disabled = true;
    });
    if (qPrompt) qPrompt.textContent = '';
    if (orEl) orEl.textContent = '';
    if (qmEl) qmEl.textContent = '';
    if (qCursor) qCursor.hidden = true;
  }

  function startTerminalIntroSequence(root, prefix, opts = {}) {
    if (!root || root.dataset.introComplete === 'true') return;

    root.classList.add('is-intro-typing');
    delete root.dataset.introComplete;
    prepareLeadLineForIntro(root, prefix);
    prepareQuestionLineForIntro(root, prefix);
    animateQuestionLine(root, prefix, opts);
  }

  function recordTerminalRecipient(root, recipient) {
    root.dataset.recipientName = recipient;
  }

  function revealMoodMessage(root, prefix, mood, message, opts = {}) {
    const goodDay = normalizeText(opts.goodDay ?? root.dataset.goodDay);
    const roughDay = normalizeText(opts.roughDay ?? root.dataset.roughDay);
    const line = message || (mood === 'rough' ? roughDay : goodDay);
    if (!line) return;

    root.classList.remove('is-awaiting', 'is-good', 'is-rough');
    root.classList.add('is-answered', mood === 'rough' ? 'is-rough' : 'is-good');
    root.dataset.selectedMood = mood;

    const cfg = { ...TERMINAL_DEFAULTS, ...opts };
    const leadRow = root.querySelector(`.${prefix}__line--lead`);
    const bodyRow = root.querySelector(`.${prefix}__line--body`);
    const leadPrompt = root.querySelector(`.${prefix}__line--lead .${prefix}__prompt`);
    const leadEl = root.querySelector(`.${prefix}__lead`);
    const msgEl = root.querySelector(`.${prefix}__message`);
    const cursor = root.querySelector(`.${prefix}__cursor--body`);
    const picks = root.querySelectorAll(`.${prefix}__pick`);

    const recipient = resolveRecipientName(opts);
    const printedAt =
      opts.printedAt instanceof Date
        ? opts.printedAt
        : opts.printedAt
          ? new Date(opts.printedAt)
          : new Date();
    const stampText = opts.showPrintedStamp === true ? formatTerminalPrintedStamp(printedAt) : '';
    const leadCopy = formatReceiptLeadLine(
      opts.receiptLeadText ?? TERMINAL_DEFAULTS.receiptLeadText,
      recipient,
      cfg
    );
    const promptText = String(cfg.prompt ?? TERMINAL_DEFAULTS.prompt);
    const ms = opts.typewriterMs ?? TERMINAL_DEFAULTS.typewriterMs ?? 28;

    picks.forEach((btn) => {
      const chosen = btn.getAttribute('data-mood') === mood;
      btn.setAttribute('aria-pressed', chosen ? 'true' : 'false');
      btn.disabled = true;
      btn.tabIndex = chosen ? 0 : -1;
    });

    if (bodyRow) {
      bodyRow.hidden = true;
      bodyRow.setAttribute('aria-hidden', 'true');
    }
    if (msgEl) msgEl.textContent = '';
    if (cursor) cursor.hidden = true;
    if (leadPrompt) leadPrompt.textContent = '';
    if (leadEl) leadEl.textContent = '';
    if (leadRow) {
      leadRow.hidden = false;
      leadRow.removeAttribute('aria-hidden');
    }

    const finish = () => {
      recordTerminalRecipient(root, recipient);
      if (typeof opts.onSelect === 'function') {
        opts.onSelect(mood, line, { recipient, printedAt, stampText, leadCopy });
      }
    };

    const showBody = () => {
      if (bodyRow) {
        bodyRow.hidden = false;
        bodyRow.removeAttribute('aria-hidden');
      }
      if (cursor) cursor.hidden = false;
      const displayLine = terminalCaseText(line, cfg);
      if (opts.typewriter !== false && msgEl) {
        runTypewriter(msgEl, displayLine, ms, finish, cfg);
      } else if (msgEl) {
        msgEl.textContent = displayLine;
        finish();
      } else {
        finish();
      }
    };

    const printLead = () => {
      if (opts.typewriter !== false) {
        runTypewriter(leadPrompt, promptText, ms, () => {
          runTypewriter(leadEl, leadCopy, ms, showBody, cfg);
        }, cfg);
      } else {
        if (leadPrompt) leadPrompt.textContent = promptText;
        if (leadEl) leadEl.textContent = leadCopy;
        showBody();
      }
    };

    printLead();
  }

  function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  /** CRT power-on blink after scroll-into-view. */
  function wakeTerminal(root, opts = {}) {
    if (!root || root.classList.contains('is-awake')) return;
    root.classList.remove('is-powered-off');
    if (prefersReducedMotion() || opts.wakeInstant === true) {
      root.classList.remove('is-waking');
      root.classList.add('is-awake');
      if (typeof opts.onWake === 'function') opts.onWake(root);
      return;
    }
    root.classList.add('is-waking');
    const ms = Number(opts.wakeDurationMs) > 0 ? Number(opts.wakeDurationMs) : TERMINAL_DEFAULTS.wakeDurationMs;
    if (root._wakeTimer) clearTimeout(root._wakeTimer);
    root._wakeTimer = setTimeout(() => {
      root._wakeTimer = null;
      root.classList.remove('is-waking');
      root.classList.add('is-awake');
      if (typeof opts.onWake === 'function') opts.onWake(root);
    }, ms);
  }

  /**
   * Blink awake after the quote clipping scrolls out of view (user scrolled past it).
   * @returns {function} disconnect
   */
  function attachTerminalWakeOnClippingPassed(root, opts = {}) {
    if (!root) return () => {};
    const cfg = { ...TERMINAL_DEFAULTS, ...opts };
    const prefix = opts.prefix || opts.classPrefix || 'mood-terminal';

    if (cfg.wakeOnReveal === false) {
      root.classList.remove('is-powered-off', 'is-waking');
      root.classList.add('is-awake');
      if (typeof cfg.onWake === 'function') cfg.onWake(root);
      return () => {};
    }

    root.classList.add('is-powered-off');
    root.classList.remove('is-awake', 'is-waking');

    const clipping =
      root.querySelector(`.${prefix}__quote-stage:not([hidden])`) ||
      root.querySelector(`.${prefix}__quote-stage`);
    const scrollRoot = opts.scrollRoot || null;

    if (!clipping || typeof IntersectionObserver === 'undefined') {
      return attachTerminalWakeOnReveal(root, {
        ...opts,
        observeTarget: root.querySelector(`.${prefix}__content`) || root
      });
    }

    let fired = false;
    let clippingWasVisible = false;

    const disconnectWake = () => {
      fired = true;
      observer.disconnect();
      if (root._wakeTimer) {
        clearTimeout(root._wakeTimer);
        root._wakeTimer = null;
      }
    };

    const maybeWake = () => {
      if (fired || root.classList.contains('is-awake')) return;
      disconnectWake();
      wakeTerminal(root, cfg);
    };

    const clippingPassed = (entry) => {
      const rect = entry.boundingClientRect;
      const rootRect = scrollRoot?.getBoundingClientRect?.();
      const topBound = rootRect ? rootRect.top : 0;
      return !entry.isIntersecting && rect.bottom <= topBound + 2;
    };

    const checkEntry = (entry) => {
      if (fired || !entry) return;
      if (entry.isIntersecting && entry.intersectionRatio > 0.02) {
        clippingWasVisible = true;
        return;
      }
      if (clippingWasVisible && !entry.isIntersecting) {
        maybeWake();
        return;
      }
      if (clippingPassed(entry)) {
        maybeWake();
      }
    };

    const observer = new IntersectionObserver(
      (entries) => entries.forEach(checkEntry),
      {
        root: scrollRoot,
        rootMargin: '0px',
        threshold: [0, 0.02, 0.08, 0.2, 0.5]
      }
    );

    observer.observe(clipping);

    requestAnimationFrame(() => {
      if (fired) return;
      const rect = clipping.getBoundingClientRect();
      const rootRect = scrollRoot?.getBoundingClientRect?.();
      const topBound = rootRect ? rootRect.top : 0;
      if (rect.height > 0 && rect.bottom <= topBound + 2) {
        maybeWake();
        return;
      }
      if (rect.height > 0 && rect.top < topBound + rect.height * 0.5) {
        clippingWasVisible = true;
      }
    });

    return disconnectWake;
  }

  /**
   * Start with a black screen; blink awake when observeTarget scrolls into view.
   * @returns {function} disconnect
   */
  function attachTerminalWakeOnReveal(root, opts = {}) {
    if (!root) return () => {};
    const cfg = { ...TERMINAL_DEFAULTS, ...opts };
    if (cfg.wakeOnReveal === false) {
      root.classList.remove('is-powered-off', 'is-waking');
      root.classList.add('is-awake');
      return () => {};
    }

    root.classList.add('is-powered-off');
    root.classList.remove('is-awake', 'is-waking');

    const observeEl = opts.observeTarget || root.parentElement || root;
    if (typeof IntersectionObserver === 'undefined') {
      wakeTerminal(root, cfg);
      return () => {};
    }

    let fired = false;
    const threshold = Number.isFinite(cfg.wakeThreshold) ? cfg.wakeThreshold : 0.22;
    const observer = new IntersectionObserver(
      (entries) => {
        if (fired) return;
        const visible = entries.some(
          (e) => e.isIntersecting && e.intersectionRatio >= threshold
        );
        if (!visible) return;
        fired = true;
        observer.disconnect();
        wakeTerminal(root, cfg);
      },
      {
        root: opts.scrollRoot || null,
        rootMargin: String(opts.rootMargin || '0px 0px -6% 0px'),
        threshold: [0, Math.min(threshold, 0.12), threshold, 0.5]
      }
    );

    observer.observe(observeEl);
    return () => {
      fired = true;
      observer.disconnect();
      if (root._wakeTimer) {
        clearTimeout(root._wakeTimer);
        root._wakeTimer = null;
      }
    };
  }

  function terminalScreenLayersHtml(_prefix) {
    return '';
  }

  /**
   * Interactive terminal: question → user picks icon → mood message.
   * @param {{ goodDay: string, roughDay: string, onSelect?: function, initialMood?: string }} opts
   */
  function createInteractiveTerminalElement(opts = {}) {
    if (typeof document === 'undefined') return null;
    const prefix = opts.classPrefix || 'mood-terminal';
    const goodDay = normalizeText(opts.goodDay ?? opts.good_day);
    const roughDay = normalizeText(opts.roughDay ?? opts.rough_day);
    const initialMood = String(opts.initialMood ?? opts.mood ?? '').toLowerCase();
    ensureMaterialSymbolsStylesheet();

    const root = document.createElement('div');
    root.className = `${prefix} is-awaiting`;
    root.dataset.goodDay = goodDay;
    root.dataset.roughDay = roughDay;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'How is this quote landing today?');
    applyTerminalFontFamily(root, opts);

    const orWord = String(opts.moodQuestionOr ?? TERMINAL_DEFAULTS.moodQuestionOr);
    const pixelate = opts.pixelateIcons !== false;
    const goodIconHtml = iconSlotHtml(prefix, MOOD_TERMINAL_ICONS.good, pixelate);
    const roughIconHtml = iconSlotHtml(prefix, MOOD_TERMINAL_ICONS.rough, pixelate);

    const hasQuoteClipping =
      opts.showQuoteClipping !== false && !!resolveQuoteInput(opts);
    if (hasQuoteClipping) root.classList.add(`${prefix}--has-clipping`);

    root.innerHTML = `
        <div class="${prefix}__screen">
          ${terminalScreenLayersHtml(prefix)}
          <div class="${prefix}__quote-stage"${hasQuoteClipping ? '' : ' hidden aria-hidden="true"'}>
            <div class="${prefix}__tape-slab">
              <div class="${prefix}__tape-void ${prefix}__tape-void--left" aria-hidden="true"></div>
              <div class="${prefix}__tape-void ${prefix}__tape-void--right" aria-hidden="true"></div>
              <div class="${prefix}__tape-body">
                <img class="${prefix}__quote-img" alt="" decoding="async" />
              </div>
              <div class="${prefix}__tape-side ${prefix}__tape-side--left ${prefix}__tape-side--paper" aria-hidden="true"></div>
              <div class="${prefix}__tape-side ${prefix}__tape-side--right ${prefix}__tape-side--paper" aria-hidden="true"></div>
            </div>
          </div>
          <div class="${prefix}__content">
            <div class="${prefix}__lines">
            <div class="${prefix}__line ${prefix}__line--question" hidden aria-hidden="true">
              <span class="${prefix}__prompt" aria-hidden="true"></span>
              <span class="${prefix}__question-row" role="group" aria-label="Full circle or half circle?">
                <button type="button" class="${prefix}__pick" data-mood="good" aria-pressed="false"
                  aria-label="Full circle — this quote is landing well today">
                  ${goodIconHtml}
                </button>
                <span class="${prefix}__or">${orWord}</span>
                <button type="button" class="${prefix}__pick" data-mood="rough" aria-pressed="false"
                  aria-label="Half circle — this quote is not landing today">
                  ${roughIconHtml}
                </button>
                <span class="${prefix}__qmark" aria-hidden="true">?</span>
                <span class="${prefix}__cursor ${prefix}__cursor--question" aria-hidden="true"></span>
              </span>
            </div>
            <div class="${prefix}__line ${prefix}__line--lead" hidden aria-hidden="true">
              <span class="${prefix}__prompt" aria-hidden="true"></span><span class="${prefix}__lead"></span>
            </div>
            <div class="${prefix}__line ${prefix}__line--body" hidden aria-hidden="true">
              <span class="${prefix}__prompt" aria-hidden="true">&gt; </span><span class="${prefix}__message"></span><span class="${prefix}__cursor ${prefix}__cursor--body" aria-hidden="true"></span>
            </div>
            </div>
          </div>
        </div>
      <span class="${prefix}__announcer" aria-live="polite" aria-atomic="true"></span>`;

    const picks = root.querySelectorAll(`.${prefix}__pick`);
    const announcer = root.querySelector(`.${prefix}__announcer`);

    const handlePick = (mood) => {
      if (!root.classList.contains('is-awake')) return;
      if (!root.classList.contains('is-awaiting')) return;
      if (mood !== 'good' && mood !== 'rough') return;
      if (root.classList.contains('is-intro-typing')) {
        root._pendingPick = mood;
        return;
      }
      const message = mood === 'rough' ? roughDay : goodDay;
      if (!message) return;

      root.classList.remove('is-awaiting');
      const qCursor = root.querySelector(`.${prefix}__cursor--question`);
      if (qCursor) qCursor.hidden = true;

      if (announcer) {
        announcer.textContent = mood === 'good'
          ? 'Full circle selected. ' + message
          : 'Half circle selected. ' + message;
      }

      const stampAt = new Date();
      revealMoodMessage(root, prefix, mood, message, {
        goodDay,
        roughDay,
        recipientName: opts.recipientName,
        userName: opts.userName,
        user_name: opts.user_name,
        receiptLeadText: opts.receiptLeadText,
        printedAt: stampAt,
        typewriter: opts.typewriter !== false,
        typewriterMs: opts.typewriterMs,
        onSelect: opts.onSelect
      });
    };
    root._terminalHandlePick = handlePick;

    picks.forEach((btn) => {
      btn.addEventListener('click', () => handlePick(btn.getAttribute('data-mood')));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePick(btn.getAttribute('data-mood'));
        }
      });
      btn.disabled = true;
      btn.hidden = true;
    });
    prepareLeadLineForIntro(root, prefix);
    prepareQuestionLineForIntro(root, prefix);

    root._terminalMountOpts = { ...opts };
    const pendingInitialMood =
      initialMood === 'good' || initialMood === 'rough' ? initialMood : null;

    const clippingOpts = { ...opts };
    root.refreshTerminalQuoteClipping = () =>
      refreshTerminalQuoteClipping(root, prefix, root._terminalMountOpts || clippingOpts);
    root.commitTerminalMount = async () => {
      if (root._clippingMountCommitted) return;
      root._clippingMountCommitted = true;
      const hydrateOpts = { ...clippingOpts };
      const remoteUrl = await resolveTerminalQuoteClippingUrl(hydrateOpts);
      await hydrateQuoteClipping(root, prefix, {
        ...hydrateOpts,
        quoteClippingUrl: remoteUrl
      });
      requestAnimationFrame(() => syncTerminalClippingLayout(root, prefix, hydrateOpts));
    };

    void hydratePixelatedIcons(root, prefix, opts);
    queueMicrotask(() => {
      void root.commitTerminalMount?.();
    });

    const wakeOpts = {
      ...opts,
      prefix,
      scrollRoot:
        opts.scrollRoot ||
        (typeof document !== 'undefined'
          ? document.getElementById('screen-quilt')
          : null) ||
        null,
      wakeDurationMs: opts.wakeDurationMs ?? TERMINAL_DEFAULTS.wakeDurationMs,
      wakeThreshold: opts.wakeThreshold ?? TERMINAL_DEFAULTS.wakeThreshold,
      wakeInstant: opts.wakeInstant === true
    };
    const userOnWake = wakeOpts.onWake;
    wakeOpts.onWake = (el) => {
      if (pendingInitialMood) {
        root._onIntroComplete = () => handlePick(pendingInitialMood);
      }
      startTerminalIntroSequence(root, prefix, {
        ...opts,
        typewriter: opts.typewriter !== false && !wakeOpts.wakeInstant
      });
      if (typeof userOnWake === 'function') userOnWake(el);
    };
    root.disconnectTerminalWake = attachTerminalWakeOnClippingPassed(root, wakeOpts);

    root.resetTerminalMood = () => {
      const wasAwake = root.classList.contains('is-awake');
      clearTerminalTypewriter(root);
      root.className = `${prefix} is-awaiting`;
      if (wasAwake) root.classList.add('is-awake');
      root.classList.remove('is-answered', 'is-good', 'is-rough', 'is-powered-off', 'is-waking', 'is-intro-typing');
      delete root.dataset.introComplete;
      delete root._pendingPick;
      delete root.dataset.selectedMood;
      const msgEl = root.querySelector(`.${prefix}__message`);
      const qCursor = root.querySelector(`.${prefix}__cursor--question`);
      const orEl = root.querySelector(`.${prefix}__or`);
      const qmEl = root.querySelector(`.${prefix}__qmark`);
      [`.${prefix}__line--lead`, `.${prefix}__line--body`].forEach((sel) => {
        const row = root.querySelector(sel);
        if (row) {
          row.hidden = true;
          row.setAttribute('aria-hidden', 'true');
        }
      });
      root.querySelectorAll(`.${prefix}__lead`).forEach((el) => {
        el.textContent = '';
      });
      root.querySelectorAll(`.${prefix}__line--lead .${prefix}__prompt`).forEach((el) => {
        el.textContent = '';
      });
      if (msgEl) msgEl.textContent = '';
      if (orEl) orEl.textContent = String(opts.moodQuestionOr ?? TERMINAL_DEFAULTS.moodQuestionOr);
      if (qmEl) qmEl.textContent = '?';
      delete root.dataset.recipientName;
      if (qCursor) qCursor.hidden = false;
      picks.forEach((btn) => {
        btn.hidden = false;
        btn.disabled = false;
        btn.tabIndex = 0;
        btn.setAttribute('aria-pressed', 'false');
      });
      if (announcer) announcer.textContent = '';
      prepareLeadLineForIntro(root, prefix);
      prepareQuestionLineForIntro(root, prefix);
      if (wasAwake) {
        startTerminalIntroSequence(root, prefix, root._terminalMountOpts || opts);
      }
    };

    if (opts.quiltAccentColor) {
      applyTerminalQuiltTheme(root, opts.quiltAccentColor, { prefix });
    }

    return root;
  }

  /** Static single-message terminal (no question). */
  function createTerminalElement(message, opts = {}) {
    if (typeof document === 'undefined') return null;
    const prefix = opts.classPrefix || 'mood-terminal';
    const text = normalizeText(message);
    const root = document.createElement('div');
    root.className = prefix;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Mood message');

    root.innerHTML = `
        <div class="${prefix}__screen">
          ${terminalScreenLayersHtml(prefix)}
          <div class="${prefix}__content">
            <div class="${prefix}__line ${prefix}__line--body">
              <span class="${prefix}__prompt" aria-hidden="true">&gt; </span><span class="${prefix}__message"></span><span class="${prefix}__cursor ${prefix}__cursor--body" aria-hidden="true"></span>
            </div>
          </div>
        </div>`;

    const msgEl = root.querySelector(`.${prefix}__message`);
    if (!msgEl) return root;

    const cfg = { ...TERMINAL_DEFAULTS, ...opts };
    const display = terminalCaseText(text, cfg);
    if (opts.typewriter && display) {
      runTypewriter(msgEl, display, opts.typewriterMs ?? 28, undefined, cfg);
    } else {
      msgEl.textContent = display;
    }

    return root;
  }

  const TERMINAL_CSS = `
.mood-terminal {
  --term-phosphor: #e6d4a8;
  --term-phosphor-core: #fff8e8;
  --term-phosphor-dim: #a89468;
  --term-bg: #100e0a;
  --term-bezel: #38342c;
  --term-bezel-edge: #141210;
  --term-glow: rgba(255, 236, 200, 0.14);
  --term-glow-soft: rgba(255, 228, 180, 0.07);
  --term-font: "Bitcount Single", "Bitcount Grid Single", "VT323", ui-monospace, monospace;
  --term-letter-spacing: 0.06em;
  --term-font-size-scale: 1.5;
  --term-tape-strip: url("assets/before-you-go-tape-alpha.png");
  --term-tape-span: min(72%, 14rem);
  --term-tape-thickness: 4.3rem;
  --term-tape-safe-x: 0.35rem;
  --term-clipping-half-h: 4rem;
  --term-quote-mask-w: 100%;
  --term-quote-mask-h: 100%;
  --term-quote-scale: 0.81;
  --term-tape-over-paper-opacity: 0.94;
  --term-tape-void-opacity: 0.5;
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  text-align: left;
  position: relative;
}
.mood-terminal__bezel {
  display: contents;
}
.mood-terminal__screen {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: var(--term-bg);
  border: none;
  border-radius: 0;
  padding: 0 clamp(0.75rem, 4vw, 1.25rem) 0.95rem;
  min-height: 13rem;
  overflow: visible;
  box-shadow: none;
}
.mood-terminal--has-clipping .mood-terminal__screen {
  padding-top: 0.55rem;
}
.mood-terminal__backlight,
.mood-terminal__phosphor-mesh,
.mood-terminal__grain,
.mood-terminal__scanlines,
.mood-terminal__vignette,
.mood-terminal__glass {
  display: none !important;
}
.mood-terminal__quote-stage {
  position: relative;
  z-index: 8;
  width: calc(100% * var(--term-quote-scale));
  max-width: calc(100% * var(--term-quote-scale));
  margin: 0 auto;
  padding: 0.35rem 0 0.25rem;
  transform: none;
  flex-shrink: 0;
  background: transparent;
  box-sizing: border-box;
  overflow: visible;
  pointer-events: none;
}
.mood-terminal__quote-stage[hidden] {
  display: none !important;
}
.mood-terminal--has-clipping .mood-terminal__quote-stage {
  opacity: 1 !important;
  visibility: visible !important;
  animation: none !important;
}
.mood-terminal__content {
  position: relative;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  padding-top: 0.65rem;
  font-family: var(--term-font);
  font-size: calc(clamp(0.78rem, 2.85vw, 0.95rem) * var(--term-font-size-scale, 1));
  line-height: 1.42;
  letter-spacing: var(--term-letter-spacing);
  font-variation-settings: var(--term-font-variation-settings, normal);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: grayscale;
  font-smooth: never;
  color: var(--term-phosphor-core);
  text-align: left;
  word-break: break-word;
  padding-bottom: 1.42em;
}
.mood-terminal--has-clipping .mood-terminal__lines {
  margin-top: 0.2rem;
}
.mood-terminal--has-clipping .mood-terminal__content {
  padding-top: calc(var(--term-quote-stack-gap, 0.85rem));
  margin-top: var(--term-quote-stack-gap, 0.85rem);
}
.mood-terminal__tape-slab {
  position: relative;
  z-index: 0;
  box-sizing: border-box;
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
  transform: rotate(-1.05deg);
  transform-origin: 28% 40%;
  overflow: visible;
}
.mood-terminal--use-remote-clipping .mood-terminal__tape-slab {
  transform: none;
}
.mood-terminal--use-remote-clipping .mood-terminal__tape-void,
.mood-terminal--use-remote-clipping .mood-terminal__tape-side {
  display: none !important;
}
.mood-terminal__tape-void--left,
.mood-terminal__tape-void--right,
.mood-terminal__tape-side--paper {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}
.mood-terminal__tape-void--left,
.mood-terminal__tape-void--right {
  z-index: 3;
  opacity: 0;
}
.mood-terminal__tape-slab--masked .mood-terminal__tape-void--left,
.mood-terminal__tape-slab--masked .mood-terminal__tape-void--right {
  opacity: 1;
  -webkit-mask-image: linear-gradient(#fff, #fff), var(--term-quote-mask);
  mask-image: linear-gradient(#fff, #fff), var(--term-quote-mask);
  -webkit-mask-size: 100% 100%, var(--term-quote-mask-w) var(--term-quote-mask-h);
  mask-size: 100% 100%, var(--term-quote-mask-w) var(--term-quote-mask-h);
  -webkit-mask-position: 0 0, center center;
  mask-position: 0 0, center center;
  -webkit-mask-repeat: no-repeat, no-repeat;
  mask-repeat: no-repeat, no-repeat;
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
.mood-terminal__tape-side--paper {
  -webkit-mask-image: var(--term-quote-mask, none);
  mask-image: var(--term-quote-mask, none);
  -webkit-mask-size: var(--term-quote-mask-w) var(--term-quote-mask-h);
  mask-size: var(--term-quote-mask-w) var(--term-quote-mask-h);
  -webkit-mask-position: center center;
  mask-position: center center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-mode: alpha;
  mask-mode: alpha;
}
.mood-terminal__tape-side--left::before,
.mood-terminal__tape-void--left::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: var(--term-tape-thickness);
  height: var(--term-tape-span);
  transform: translate(-50%, -50%);
  transform-origin: center center;
  pointer-events: none;
  background-color: transparent;
  background-image: var(--term-tape-strip);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
}
.mood-terminal__tape-side--right::before,
.mood-terminal__tape-void--right::before {
  content: '';
  position: absolute;
  right: 0;
  left: auto;
  top: 50%;
  width: var(--term-tape-thickness);
  height: var(--term-tape-span);
  transform: translate(50%, -50%);
  transform-origin: center center;
  pointer-events: none;
  background-color: transparent;
  background-image: var(--term-tape-strip);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
}
.mood-terminal__tape-side--paper::before {
  opacity: var(--term-tape-over-paper-opacity, 0.94);
  mix-blend-mode: multiply;
}
.mood-terminal__tape-void--left::before,
.mood-terminal__tape-void--right::before {
  opacity: var(--term-tape-void-opacity, 0.5);
  mix-blend-mode: screen;
}
.mood-terminal__tape-body {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: block;
  width: 100%;
  max-width: 100%;
  padding: 0 var(--term-tape-safe-x);
  background: transparent;
}
.mood-terminal__quote-img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  margin: 0;
  vertical-align: top;
  transform: rotate(-0.5deg);
  filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.45));
}
.mood-terminal__quote-img[hidden] {
  display: none;
}
.mood-terminal__lines {
  box-sizing: border-box;
  width: var(--term-lines-w, 77%);
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
  padding-top: 0.15rem;
  text-align: left;
}
.mood-terminal__line {
  display: block;
  width: 100%;
  text-align: left;
  margin: 0 0 0.45rem;
}
.mood-terminal__line--lead {
  margin-bottom: 0.55rem;
}
.mood-terminal__line--question {
  margin-bottom: 0.45rem;
}
.mood-terminal.is-intro-typing .mood-terminal__pick {
  pointer-events: none;
}
.mood-terminal.is-intro-typing .mood-terminal__pick[hidden] {
  display: none;
}
.mood-terminal__question-row {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 0.15rem 0.35rem;
  vertical-align: top;
  text-align: left;
}
.mood-terminal__line--lead .mood-terminal__lead,
.mood-terminal__line--body .mood-terminal__message {
  display: inline;
}
.mood-terminal__line--lead .mood-terminal__lead {
  text-transform: uppercase;
}
.mood-terminal__line--body {
  line-height: 1.12;
  margin-bottom: 0.2rem;
}
.mood-terminal__line--body .mood-terminal__message {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.12;
}
.mood-terminal__pick {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  padding: 0.12rem 0.2rem;
  border: 0;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  color: inherit;
  line-height: 1;
  border-radius: 2px;
}
.mood-terminal__pick:hover,
.mood-terminal__pick:focus-visible {
  outline: 1px solid var(--term-glow);
  outline-offset: 3px;
}
.mood-terminal__pick[aria-pressed="true"] .mood-terminal__icon-glyph,
.mood-terminal__pick[aria-pressed="true"] .mood-terminal__icon-bitmap {
  color: var(--term-phosphor-core);
  filter: drop-shadow(0 1px 2px var(--term-glow));
}
.mood-terminal__pick:disabled {
  cursor: default;
  opacity: 0.42;
}
.mood-terminal__pick[aria-pressed="true"]:disabled {
  opacity: 1;
}
.mood-terminal.is-answered .mood-terminal__pick:not([aria-pressed="true"]) {
  opacity: 0.28;
}
.mood-terminal__icon-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75em;
  height: 1.75em;
  overflow: hidden;
  flex-shrink: 0;
  user-select: none;
  pointer-events: none;
}
.mood-terminal__icon-slot--pixel {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
.mood-terminal__icon-bitmap {
  display: block;
  width: 1.75em;
  height: 1.75em;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 1px 1px var(--term-glow-soft));
}
.mood-terminal__icon-glyph {
  font-family: 'Material Symbols Outlined';
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  font-feature-settings: 'liga';
  font-size: 1.55em;
  line-height: 1;
  color: var(--term-phosphor-core);
  filter: drop-shadow(0 1px 1px var(--term-glow-soft));
}
.mood-terminal__or {
  font-family: var(--term-font);
  font-size: 1em;
  letter-spacing: 0.04em;
}
.mood-terminal__qmark {
  font-family: var(--term-font);
  font-size: 1em;
}
.mood-terminal.is-awaiting .mood-terminal__line--body {
  display: none !important;
}
.mood-terminal__prompt {
  display: inline;
  opacity: 0.78;
}
.mood-terminal__lead,
.mood-terminal__message,
.mood-terminal__or,
.mood-terminal__qmark,
.mood-terminal__prompt {
  color: var(--term-phosphor-core);
  text-shadow: none;
}
.mood-terminal__cursor {
  display: inline-block;
  width: 0.55em;
  height: 1em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: var(--term-phosphor-core);
  box-shadow: none;
  animation: mood-terminal-blink 1.05s step-end infinite;
}
.mood-terminal.is-answered .mood-terminal__cursor--question {
  display: none;
}
.mood-terminal__announcer {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  clip-path: inset(50%);
}
@keyframes mood-terminal-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
/* Clipping visible immediately; terminal lines blink awake after scroll past clipping. */
.mood-terminal.is-powered-off .mood-terminal__screen {
  background: var(--term-bg);
  box-shadow: none;
}
.mood-terminal.is-powered-off .mood-terminal__content {
  opacity: 0 !important;
  visibility: hidden !important;
}
.mood-terminal.is-powered-off .mood-terminal__pick {
  pointer-events: none;
}
.mood-terminal.is-waking .mood-terminal__content {
  visibility: visible !important;
  filter: brightness(0) contrast(1.15);
  animation: mood-terminal-crt-wake 1.15s linear forwards;
}
.mood-terminal.is-waking .mood-terminal__lines {
  opacity: 0;
  animation: mood-terminal-phosphor-in 1.15s steps(10) forwards;
}
@keyframes mood-terminal-crt-wake {
  0% { filter: brightness(0) contrast(1.15); }
  5% { filter: brightness(2.4) contrast(1.05); }
  9% { filter: brightness(0.04) contrast(1.2); }
  13% { filter: brightness(1.85) contrast(1); }
  17% { filter: brightness(0.1) contrast(1.15); }
  24% { filter: brightness(1.35) contrast(1); }
  32% { filter: brightness(0.55) contrast(1.05); }
  42% { filter: brightness(1.08) contrast(1); }
  100% { filter: brightness(1) contrast(1); }
}
@keyframes mood-terminal-phosphor-in {
  0%, 10% { opacity: 0; }
  14% { opacity: 0.4; }
  20% { opacity: 0.08; }
  28% { opacity: 0.75; }
  36% { opacity: 0.2; }
  48% { opacity: 0.95; }
  100% { opacity: 1; }
}
.mood-terminal.is-awake .mood-terminal__screen {
  filter: none;
  animation: none;
  opacity: 1;
}
.mood-terminal.is-awake .mood-terminal__content {
  opacity: 1 !important;
  visibility: visible !important;
  filter: none;
  animation: none;
}
.mood-terminal.is-awake .mood-terminal__lines {
  opacity: 1 !important;
  animation: none;
}
@media (prefers-reduced-motion: reduce) {
  .mood-terminal.is-waking .mood-terminal__content,
  .mood-terminal.is-waking .mood-terminal__lines {
    animation: none;
    filter: none;
    opacity: 1;
  }
}
.mood-terminal.is-rough {
  --term-phosphor: color-mix(in srgb, var(--term-phosphor) 76%, #0a0908);
  --term-phosphor-core: color-mix(in srgb, var(--term-phosphor-core) 80%, #0a0908);
  --term-phosphor-dim: color-mix(in srgb, var(--term-phosphor-dim) 82%, #0a0908);
  --term-glow: color-mix(in srgb, var(--term-glow) 68%, transparent);
  --term-glow-soft: color-mix(in srgb, var(--term-glow-soft) 68%, transparent);
}
`.trim();

  function ensureTerminalDisplayFont() {
    ensureTerminalGoogleFont(TERMINAL_DEFAULTS.fontFamily);
  }

  function injectTerminalStyles(id = 'quilt-mood-terminal-styles') {
    if (typeof document === 'undefined') return;
    ensureTerminalDisplayFont();
    ensureMaterialSymbolsStylesheet();
    const existing = document.getElementById(id);
    if (existing) {
      existing.textContent = TERMINAL_CSS;
      return;
    }
    const el = document.createElement('style');
    el.id = id;
    el.textContent = TERMINAL_CSS;
    document.head.appendChild(el);
  }

  return {
    TERMINAL_COMPOSER_VERSION,
    TERMINAL_APP_NEUTRAL,
    TERMINAL_DEFAULTS,
    TERMINAL_CSS,
    MOOD_TERMINAL_ICONS,
    MATERIAL_SYMBOLS_URL,
    normalizeText,
    terminalCaseText,
    resolveRecipientName,
    formatTerminalPrintedStamp,
    hexToRgb,
    hexToHsv,
    hsvToHex,
    buildTerminalThemeFromQuiltColor,
    applyTerminalFontFamily,
    ensureTerminalGoogleFont,
    TERMINAL_FONT_OPTIONS,
    applyTerminalQuiltTheme,
    terminalCfgWithTheme,
    resolveMoodLine,
    ensureTerminalFont,
    ensureMaterialSymbolsFont,
    ensureMaterialSymbolsStylesheet,
    rasterizePixelatedIcon,
    hydratePixelatedIcons,
    hydrateQuoteClipping,
    refreshTerminalQuoteClipping,
    resolveTerminalQuoteClippingUrl,
    composeTerminalQuoteClippingFallbackDataUrl,
    buildTerminalClippingComposeCfg,
    measureTerminalCenterColumnDomWidth,
    applyTerminalLinesColumnWidth,
    syncTerminalClippingLayout,
    resolveQuoteInput,
    resolveAdjacentQuotesForClipping,
    clippingNeighborRow,
    TAPE_ASSET_URL,
    buildIconPixelGrid,
    measureTerminalLayout,
    renderMoodTerminal,
    composeTerminalDataUrl,
    createTerminalElement,
    createInteractiveTerminalElement,
    runTypewriter,
    clearTerminalTypewriter,
    startTerminalIntroSequence,
    animateQuestionLine,
    revealMoodMessage,
    wakeTerminal,
    attachTerminalWakeOnClippingPassed,
    attachTerminalWakeOnReveal,
    injectTerminalStyles,
    ensureTerminalDisplayFont
  };
});
