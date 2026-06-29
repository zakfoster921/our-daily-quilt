/**
 * App configuration (flags, Firebase public keys, milestones).
 * Exposes globalThis.CONFIG. Requires odqEnableAdminTools from inline boot scripts.
 */
(function (root) {
  'use strict';

const CONFIG = {
  APP: {
    name: 'OUR DAILY QUILT',
    version: '3.11',
    /** First Rumi-palette swatch: fresh quilt + picker default (see `hexToHsv` / daily snap). */
    defaultColor: '#ea9b9a',
    quiltSize: 1000,
    animationDuration: 2000,
    toastDuration: 3000,
    /** Milestone “banner” read time (longer copy than typical toasts). */
    milestoneInAppNotificationMs: 7000,
    /** Optional; falls back to generated icon if missing. */
    notificationIconUrl: 'assets/icon.png',
    /** Pause after scroll-end before push opt-in fades in (ms). */
    pushOptInRevealDelayMs: 520,
    /** Pause after quilt bottom reach before what's-new fades in (ms). */
    whatsNewBottomPauseMs: 550,
    /** What's-new modal fade-in delay after mount (ms). */
    whatsNewRevealDelayMs: 900,
    /** Delay before color picker pane reveals on quote screen (ms). */
    quoteColorPickerRevealMs: 1500,
    /** Quote screen: hue / sat / value sliders (wheel hidden). ?picker=wheel for legacy wheel. */
    useThreeSliderPicker: true,
    buildId: '32',
    /** Public app URL for native “share with a friend”. */
    shareAppUrl: 'https://apps.apple.com/us/app/our-daily-quilt/id6765474049',
    /** App Store review URL. */
    appStoreReviewUrl: 'https://apps.apple.com/us/app/our-daily-quilt/id6765474049',
    debugMode: false,
    enableAdminTools: typeof odqEnableAdminTools === 'function' ? odqEnableAdminTools() : false,
    /** Feature flag: milestone quilts archive, reveals, and milestone notifications. Off in production. */
    milestoneQuiltsEnabled: false,
    /** Feature flag: community posts public feed (future). Admin menu access does not use this. */
    socialPostsEnabled: false,
    /** Temporary: Warhol wash/paper stack on speaker card + Layout B story preview. */
    speakerPopArtEnabled: false,
    /** Mood quote spread: 'collage' (scratch strips) or 'triptych' (flip cards). Override: ?moodSpread=triptych */
    moodSpreadMode: 'collage',
    /** One-time per-version Zak intro persona for returning users (see shouldOfferIntroPersonaForReturningUser). */
    introPersona: {
      version: '1.0'
    },
    /** One-time announcement on the user's 2nd app visit (see maybeShowWhatsNewAnnouncement). */
    whatsNew: {
      title: 'When would you like your inspiration to arrive each day?',
      body: 'You can always change it later in Settings.',
      primaryLabel: 'Choose my time',
      secondaryLabel: 'Not now'
    }
  },
  FIREBASE: {
    // ENABLED FOR IMAGE REVEAL FUNCTIONALITY
    apiKey: "AIzaSyBqMJlchU_luM5-XcPo0USDUjsM60Qfoqg",
    authDomain: "our-daily.firebaseapp.com",
    projectId: "our-daily",
    storageBucket: "our-daily.firebasestorage.app",
    messagingSenderId: "337201931314",
    appId: "1:337201931314:web:fb5677846d03eb285ac82b",
    measurementId: "G-65XB7QC1F4"
  },
  COLOR_PICKER: {
    wheelSize: 280,
    defaultHue: 36,
    defaultLightness: 90,
    /** Pastel first-swatch hint only; hue bar + new picks use hueBarSaturation. */
    saturation: 21.7,
    /** Hue slider rainbow + default pick saturation (HSV 0–100). */
    hueBarSaturation: 50
  },
  QUILT: {
    viewBoxWidth: 800,
    viewBoxHeight: 800,
    gridCols: 8,
    gridRows: 8,
    blockSpacing: 4,
    blockPadding: 2
  },
  QUILT_V2: {
    FREEZE_THRESHOLD: 20,
    MIN_SHAPE_SIZE: 40,
    COLOR_SIMILARITY_THRESHOLD: 35,
    LAB_COLOR_CACHE_SIZE: 1000
  },
  /** Railway Node server: manual Notion ↔ Firestore sync (`server.js` POST /api/sync-notion-firestore). */
  BACKEND: {
    baseUrl: 'https://our-daily-quilt-production.up.railway.app'
  },
  COLOR_MILESTONES: {
    5: "Five days in. Here's what you've made so far. Thank you for being here ♡",
    10: "Ten colors. I was hoping you'd stick around ! ♡",
    25: "25 colors ! You're becoming a regular ! ♡",
    50: "Fifty days of color ♡ You're a real part of how this thing works",
    100: "100 colors added ! Three months of showing up, one color at a time ♡ Thank you",
    250: "You just shared your 250th color ! ♡ You've been here through a lot of quilts",
    365: "A full year of colors ! ♡ We're basically family at this point",
    500: "You've had a hand in 500 quilts ♡ And you made every one of them better",
    1000: "1000 colors. Four digits. You're an absolute legend ♡ Thank you for being here !"
  },
  /**
   * Personal-quilt milestone reveal. When a device picks its
   * MILESTONE_COUNT-th lifetime color, schedule a one-shot local
   * notification (via @capacitor/local-notifications) to fire DELAY_MS
   * later. Tap opens an in-app card showing a personal quilt rendered
   * from TEMPLATE, with the user's first MILESTONE_COUNT picks filling
   * the template's color slots in chronological order. See
   * `maybeCreateColorMilestoneNotification` and `showPersonalQuiltReveal`.
   * The Firestore doc at
   * `colorMilestoneNotifications/{deviceId}_{milestoneCount}` is
   * analytics-only; this feature does not use any server pipeline.
   */
  PERSONAL_QUILT: {
    MILESTONE_COUNT: 5,
    DELAY_MS: 2 * 60 * 60 * 1000,
    LOCAL_NOTIF_ID: 9212077,
    TEMPLATE: {
      width: 1080,
      height: 1350,
      blocks: [
        { id: 't1',  x: 0,   y: 0,    width: 380,  height: 260,
          patternType: 'special', specialPatternType: 'hst', hstDiagonal: 'ne-sw',
          colorSlot: 1, hstColorBSlot: 4 },
        { id: 't2',  x: 380, y: 0,    width: 150,  height: 90,
          patternType: 'regular', colorSlot: 5 },
        { id: 't3',  x: 380, y: 90,   width: 150,  height: 190,
          patternType: 'special', specialPatternType: 'hst', hstDiagonal: 'nw-se',
          colorSlot: 3, hstColorBSlot: 5 },
        { id: 't4',  x: 530, y: 0,    width: 550,  height: 200,
          patternType: 'regular', colorSlot: 2 },
        { id: 't5',  x: 0,   y: 260,  width: 380,  height: 240,
          patternType: 'special', specialPatternType: 'hst', hstDiagonal: 'nw-se',
          colorSlot: 1, hstColorBSlot: 4 },
        { id: 't6',  x: 530, y: 200,  width: 550,  height: 300,
          patternType: 'regular', colorSlot: 3 },
        { id: 't7',  x: 380, y: 280,  width: 150,  height: 220,
          patternType: 'regular', colorSlot: 2 },
        { id: 't8',  x: 0,   y: 500,  width: 720,  height: 550,
          patternType: 'regular', colorSlot: 1 },
        { id: 't9',  x: 540, y: 500,  width: 180,  height: 220,
          patternType: 'special', specialPatternType: 'hst', hstDiagonal: 'ne-sw',
          colorSlot: 1, hstColorBSlot: 5 },
        { id: 't10', x: 720, y: 500,  width: 360,  height: 550,
          patternType: 'regular', colorSlot: 2 },
        { id: 't11', x: 0,   y: 1050, width: 1080, height: 300,
          patternType: 'regular', colorSlot: 1 }
      ]
    }
  },
  /**
   * Remember-today: reader picks items on #screen-remember-today; one combined
   * local notification fires later the same quote-day (native only). Tap opens
   * read-only #screen-remember-today-view with saved segments.
   */
  REMEMBER_TODAY: {
    LOCAL_NOTIF_ID: 9212088,
    MAX_BODY_CHARS: 320,
    MAX_SEGMENT_CHARS: 140,
    /** Latest local hour (24h) for random 2–8h delivery; at or after this, use LATE_NIGHT_DELAY_MS. */
    CUTOFF_HOUR_LOCAL: 22,
    LATE_NIGHT_DELAY_MS: 7 * 60 * 1000,
    MIN_DELAY_MS: 2 * 60 * 60 * 1000,
    MAX_DELAY_MS: 8 * 60 * 60 * 1000,
    SEGMENT_PRIORITY: ['mood', 'watch_for', 'quote', 'color', 'companion', 'thoughts'],
    MAX_THOUGHTS_CHARS: 280,
    COMPANION_FALLBACK_TITLE: 'Art recommendation for this quote is coming soon.'
  }
};

  /**
   * Origins to try for /api/proxy-image (local Node first on localhost, then Railway).
   * Static servers on :3000 without API routes still get a working proxy via fallback.
   */
  function odqProxyImageBases() {
    const configured = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
    const bases = [];
    try {
      if (typeof location !== 'undefined' && location.origin) {
        const host = String(location.hostname || '').toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') {
          const local = String(location.origin).replace(/\/$/, '');
          if (local) bases.push(local);
        }
      }
    } catch (_) {
      /* ignore */
    }
    if (configured && !bases.includes(configured)) bases.push(configured);
    return bases;
  }

  /** Primary API base (first proxy candidate). */
  function odqBackendBaseUrl() {
    const bases = odqProxyImageBases();
    return bases[0] || String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
  }

  /** Avoid double-encoding Firebase URLs in proxy query strings (%252F → %2F). */
  function odqNormalizeProxyImageSourceUrl(url) {
    let s = String(url || '').trim();
    if (!s) return s;
    try {
      if (/%25[0-9a-f]{2}/i.test(s)) {
        const decoded = decodeURIComponent(s);
        if (/^https?:\/\//i.test(decoded)) return decoded;
      }
    } catch (_) {
      /* ignore */
    }
    return s;
  }

  function odqProxyImageFetchUrl(base, sourceUrl) {
    const normalized = odqNormalizeProxyImageSourceUrl(sourceUrl);
    const b = String(base || '').replace(/\/$/, '');
    if (!b || !normalized) return '';
    return `${b}/api/proxy-image?url=${encodeURIComponent(normalized)}`;
  }

  root.CONFIG = CONFIG;
  root.odqProxyImageBases = odqProxyImageBases;
  root.odqBackendBaseUrl = odqBackendBaseUrl;
  root.odqNormalizeProxyImageSourceUrl = odqNormalizeProxyImageSourceUrl;
  root.odqProxyImageFetchUrl = odqProxyImageFetchUrl;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
