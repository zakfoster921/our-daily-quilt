/**
 * Archive, Instagram image generation, and quilt export helpers.
 * Exposes globalThis.ArchiveService.
 */
(function (root) {
  'use strict';

class ArchiveService {
  constructor(logger, dataService) {
    this.logger = logger;
    this.dataService = dataService;
    this.archives = new Map(); // Date string -> archive data (cached)
    this.isLoading = false;
    this.currentPage = 0;
    this.postsPerPage = 10;
    this.lastQuiltExportDebug = null;
    this.lastQuiltExportRawDataUrl = null;
  }

  // Archive data structure for each day
  createArchiveEntry(date, quilt, quote, userCount) {
    return {
      date: date, // "2024-01-15"
      quilt: quilt, // SVG data/state
      quote: quote, // { text: "...", author: "..." }
      userCount: userCount, // Number of users who contributed
      shareCount: 0, // Number of times this quilt has been shared
      thumbnail: null, // Will be generated
      isComplete: true // Whether the day finished properly
    };
  }

  // Get archives for feed (with pagination)
  async getArchives(page = 0, limit = this.postsPerPage) {
    try {
              // Try to load from Firestore if we don't have archives cached
    // if (this.archives.size === 0 && window.db && window.firestore) {
    //   await this.loadArchivesFromFirestore();
    // }
      
      const allArchives = Array.from(this.archives.values())
        .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first
      
      const start = page * limit;
      const end = start + limit;
      const pageArchives = allArchives.slice(start, end);
      
      return {
        archives: pageArchives,
        hasMore: end < allArchives.length,
        totalCount: allArchives.length
      };
    } catch (error) {
      this.logger.error('Failed to get archives:', error);
      return {
        archives: [],
        hasMore: false,
        totalCount: 0
      };
    }
  }

  // Load archives from Firestore
  async loadArchivesFromFirestore() {
    try {
      if (!window.db || !window.firestore) {
        this.logger.warn('Firestore not available for loading archives');
        return;
      }

      const archivesRef = window.firestore.collection(window.db, 'archives');
      const q = window.firestore.query(archivesRef, window.firestore.orderBy('date', 'desc'), window.firestore.limit(50));
      const querySnapshot = await window.firestore.getDocs(q);
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        this.archives.set(data.date, data);
      });
      
      this.logger.log(`📖 Loaded ${this.archives.size} archives from Firestore`);
    } catch (error) {
      this.logger.error('Failed to load archives from Firestore:', error);
    }
  }

  // Add new archive entry
  async addArchive(archiveEntry) {
    try {
      // Add to Firestore if available
      // if (window.db && window.firestore) {
      //   const archiveRef = window.firestore.doc(window.db, 'archives', archiveEntry.date);
      //   await window.firestore.setDoc(archiveRef, {
      //     ...archiveEntry,
      //     createdAt: new Date().toISOString()
      //   });
      //   this.logger.log(`📝 Archive saved to Firestore: ${archiveEntry.date}`);
      // }
      
      // Add to local cache
      this.archives.set(archiveEntry.date, archiveEntry);
      this.logger.log(`📝 Archive cached locally: ${archiveEntry.date}`);
    } catch (error) {
      this.logger.error('Failed to save archive to Firestore:', error);
      // Still cache locally as fallback
      this.archives.set(archiveEntry.date, archiveEntry);
    }
  }

  /**
   * Mirrored-quilt viewBox for export (positive padding). Screen SVG uses negative padding for slice zoom;
   * re-use block bounds + renderer mirror math so exports show the full field, not a tight crop.
   */
  viewBoxPartsForMirroredQuiltScreen(blocks, paddingRatio = 0.02) {
    if (!Array.isArray(blocks) || blocks.length === 0) return null;
    const minX = Math.min(...blocks.map((b) => Number(b.x)));
    const minY = Math.min(...blocks.map((b) => Number(b.y)));
    const maxX = Math.max(...blocks.map((b) => Number(b.x) + Number(b.width)));
    const maxY = Math.max(...blocks.map((b) => Number(b.y) + Number(b.height)));
    const quiltW = maxX - minX;
    const quiltH = maxY - minY;
    if (!(quiltW > 0) || !(quiltH > 0)) return null;
    const horizontalStretch = 1.16;
    const mirrorRatio =
      typeof window !== 'undefined' && typeof window.app?.renderer?.getMirrorSeamOffsetRatio === 'function'
        ? window.app.renderer.getMirrorSeamOffsetRatio()
        : 0.68;
    const mirrorSeamOffset = quiltH * mirrorRatio;
    const mirroredFieldWidth = quiltW * horizontalStretch;
    const mirroredFieldHeight = quiltH + mirrorSeamOffset;
    const pad = Math.max(4, quiltW * paddingRatio);
    return [minX - pad, minY - pad, mirroredFieldWidth + pad * 2, mirroredFieldHeight + pad * 2];
  }

  /**
   * Canonical 9:16 quilt capture for Zapier (classic + Layout B). Matches the quilt screen:
   * primary field + mirrored fold, crop to container slice, letterboxed into 9:16. Cached per fingerprint.
   */
  async getInstagramQuiltSourceBlob(blocks, options = {}) {
    if (!blocks || blocks.length === 0) return null;
    const fingerprint = Utils.computeQuiltFingerprint(blocks);
    const cacheVariant = options.exportFillFrame === true ? 'mood-card-fill' : 'quilt-screen-v2';
    const maxEdgePart =
      options.maxEdge != null ? `:e${Math.min(4096, Math.max(64, Number(options.maxEdge) || 0))}` : '';
    const cacheKey = `${String(options.dateKey || '').trim()}:${fingerprint}:${cacheVariant}${maxEdgePart}`;
    if (
      this._igQuiltSourceCacheKey === cacheKey &&
      this._igQuiltSourceCacheBlob instanceof Blob &&
      this._igQuiltSourceCacheBlob.size > 0
    ) {
      return this._igQuiltSourceCacheBlob;
    }

    const quiltSVG = typeof document !== 'undefined' ? document.getElementById('quilt') : null;
    const igAspect =
      typeof globalThis.IG_QUILT_SCREEN_ASPECT === 'number'
        ? globalThis.IG_QUILT_SCREEN_ASPECT
        : 9 / 16;
    const rasterOpts = {
      targetAspect: igAspect,
      underpaintBlocks: blocks,
      exportMatchQuiltScreen: true,
      exportFillFrame: options.exportFillFrame === true,
      exportMatteFill: '#f6f4f1',
      exportModeLabel: options.exportModeLabel || 'instagram_quilt_source_9x16_quilt_screen',
      instagramTrueWhiteMatte: false,
      quiltFingerprint: fingerprint
    };
    if (options.maxEdge != null) {
      rasterOpts.maxEdge = Math.min(4096, Math.max(64, Number(options.maxEdge) || 2400));
    }
    if (options.imageSmoothingQuality === 'low') {
      rasterOpts.imageSmoothingQuality = 'low';
    }

    let quiltBlob = null;
    let quiltBlobFromLiveSvg = false;
    let usedMirroredComposeFallback = false;
    if (this.hasRenderedQuiltSvgForBlocks(quiltSVG, blocks)) {
      try {
        quiltBlob = await this.rasterizeVisibleQuiltSvgToPngBlob(quiltSVG, blocks, rasterOpts);
        quiltBlobFromLiveSvg = !!quiltBlob;
      } catch (e) {
        this.logger.warn('SVG raster failed for Instagram quilt source, using blocks:', e);
      }
    } else if (quiltSVG) {
      this.logger.warn('Live quilt SVG is not ready for Instagram quilt source; using block data');
    }
    if (!quiltBlob) {
      // Primary quilt field only (no 9:16 letterbox) — mirror compose below builds the screen slice.
      const blockRasterOpts = {
        underpaintBlocks: blocks,
        exportMatchQuiltScreen: false,
        exportFillFrame: options.exportFillFrame === true,
        exportMatteFill: '#f6f4f1',
        exportModeLabel: `${rasterOpts.exportModeLabel || 'instagram_quilt_source'}_block_primary`,
        instagramTrueWhiteMatte: false,
        quiltFingerprint: fingerprint
      };
      if (options.maxEdge != null) {
        blockRasterOpts.maxEdge = rasterOpts.maxEdge;
      }
      if (rasterOpts.imageSmoothingQuality === 'low') {
        blockRasterOpts.imageSmoothingQuality = 'low';
      }
      quiltBlob = await this.generateQuiltRasterBlobFromBlocks(blocks, blockRasterOpts);
    }
    if (
      quiltBlob &&
      !quiltBlobFromLiveSvg &&
      typeof window !== 'undefined' &&
      typeof window.app?.composeMirroredQuiltFieldBlob === 'function'
    ) {
      try {
        const mirrored = await window.app.composeMirroredQuiltFieldBlob(quiltBlob, {
          maxEdge: 2400,
          mimeType: 'image/png',
          imageSmoothingQuality: 'high',
          quiltFit: options.exportFillFrame === true ? 'cover' : 'meet'
        });
        if (mirrored) {
          quiltBlob = mirrored;
          usedMirroredComposeFallback = true;
        }
      } catch (mirrorErr) {
        this.logger.warn('Mirrored quilt compose fallback failed:', mirrorErr);
      }
    }
    this._igQuiltSourceExportMeta = {
      quiltBlobFromLiveSvg,
      usedMirroredComposeFallback,
      exportModeLabel: rasterOpts.exportModeLabel,
      capturedAt: new Date().toISOString(),
      lastQuiltExportDebug: this.lastQuiltExportDebug ? { ...this.lastQuiltExportDebug } : null
    };
    if (quiltBlob) {
      this._igQuiltSourceCacheKey = cacheKey;
      this._igQuiltSourceCacheBlob = quiltBlob;
    }
    return quiltBlob;
  }

  clearInstagramQuiltSourceCache() {
    this._igQuiltSourceCacheKey = '';
    this._igQuiltSourceCacheBlob = null;
    this._igQuiltSourceExportMeta = null;
  }

  /**
   * Quilt-only 9:16 PNG (1080×1920 class) matching the quilt screen — uploaded nightly as quilt-screen-9x16.png.
   * @returns {Promise<string|null>} data URL
   */
  async generateInstagramQuiltScreen9x16ImageData(blocks, dateKey = null) {
    if (!blocks || blocks.length === 0) return null;
    const dk = dateKey || Utils.getTodayKey();
    const blob = await this.getInstagramQuiltSourceBlob(blocks, {
      dateKey: dk,
      exportModeLabel: 'quilt_screen_9x16_nightly'
    });
    if (!blob) return null;
    return Utils.blobToDataUrl(blob);
  }

  /** Today payload for quilt mood triptych / nightly newspaper clipping PNG. */
  async _resolveNewspaperClippingTodayPayload(dateKey = null) {
    const qs = window.app?.quoteService;
    const dk =
      String(dateKey || '').trim() ||
      qs?.getQuoteCalendarKeyNow?.() ||
      Utils.getTodayKey?.() ||
      '';
    if (!dk) return null;
    const app = window.app;
    let raw = null;
    if (qs && typeof qs.getQuoteResolvedForInstagramDateKey === 'function') {
      try {
        raw = await qs.getQuoteResolvedForInstagramDateKey(dk);
      } catch (_) {
        /* */
      }
    }
    if (!raw && qs) raw = qs.getTodayQuote?.();
    const q = app?._quoteForMoodWidget?.(raw) || raw;
    const payload =
      app?._quiltMoodTerminalQuotePayload?.(q, dk) ||
      (q && String(q.text ?? q.body ?? '').trim()
        ? {
            text: String(q.text ?? q.body ?? '').trim(),
            author: String(q.author ?? q.authorSnapshot ?? '').trim(),
            dateKey: dk
          }
        : null);
    if (!payload?.text) return null;
    return { ...payload, dateKey: String(payload.dateKey || dk).trim() || dk };
  }

  _newspaperClippingPaperTextureUrl() {
    try {
      if (typeof location !== 'undefined' && location.href) {
        return new URL('assets/quilt-paper-card-texture.png', location.href).href;
      }
    } catch (_) {
      /* */
    }
    return null;
  }

  async _readQuoteForClippingDateKeyFromFirestore(dk) {
    const dateKey = String(dk || '').trim();
    if (!dateKey || !window.db || !window.firestore) return null;
    const pick = (...vals) => {
      for (const v of vals) {
        const s = String(v ?? '').trim();
        if (s) return s;
      }
      return '';
    };
    const fromDoc = (data) => {
      if (!data || typeof data !== 'object') return null;
      const text = pick(data.text, data.quote, data.body, data.textSnapshot);
      const author = pick(data.author, data.authorSnapshot);
      if (!text && !author) return null;
      return {
        text,
        body: text,
        author,
        dateKey,
        keyword: pick(data.keyword, data.keywordSnapshot),
        firstLineCount: data.firstLineCount ?? data.first_line_count
      };
    };
    try {
      const read = async (col, id) => {
        const ref = window.firestore.doc(window.db, col, id);
        const snap = await window.firestore.getDoc(ref);
        return snap.exists() ? snap.data() || {} : null;
      };
      const assignment = await read('dailyQuoteAssignments', dateKey);
      const sourceId = pick(assignment?.sourceId);
      const merged = [fromDoc(await read('quotes', dateKey)), fromDoc(await read('quotes', sourceId)), fromDoc(assignment)]
        .filter(Boolean)
        .reduce((acc, row) => ({ ...acc, ...row }), {});
      return merged.text ? merged : null;
    } catch (_) {
      return null;
    }
  }

  async _resolveAdjacentQuotesForClipping(dateKey) {
    const dk = String(dateKey || '').trim();
    if (!dk) return { yesterday: null, tomorrow: null };
    const qs = window.app?.quoteService;
    if (qs && typeof qs.getAdjacentQuotesForClippingDateKey === 'function') {
      try {
        if (typeof qs.offsetQuoteCalendarKey === 'function' && typeof qs.resolveAndPinCalendarKey === 'function') {
          const yKey = qs.offsetQuoteCalendarKey(dk, -1);
          const tKey = qs.offsetQuoteCalendarKey(dk, 1);
          await Promise.all([
            yKey ? qs.resolveAndPinCalendarKey(yKey).catch(() => null) : null,
            tKey ? qs.resolveAndPinCalendarKey(tKey).catch(() => null) : null
          ]);
        }
        const adj = await qs.getAdjacentQuotesForClippingDateKey(dk);
        const yesterday = adj?.yesterday || null;
        const tomorrow = adj?.tomorrow || null;
        const neighborLine = (q) => String(q?.text ?? q?.body ?? '').trim();
        const yKey = qs.offsetQuoteCalendarKey?.(dk, -1);
        const tKey = qs.offsetQuoteCalendarKey?.(dk, 1);
        const yOut =
          neighborLine(yesterday) ? yesterday : await this._readQuoteForClippingDateKeyFromFirestore(yKey);
        const tOut =
          neighborLine(tomorrow) ? tomorrow : await this._readQuoteForClippingDateKeyFromFirestore(tKey);
        if (!neighborLine(yOut) && !neighborLine(tOut)) {
          this.logger.warn(
            `[archive] newspaper clipping ${dk}: no yesterday/tomorrow quote text — side columns may be blank`
          );
        }
        return { yesterday: yOut || yesterday, tomorrow: tOut || tomorrow };
      } catch (_) {
        /* */
      }
    }
    if (typeof qs?.getAdjacentQuotesForClipping === 'function') {
      const adj = qs.getAdjacentQuotesForClipping() || {};
      return {
        yesterday: adj.yesterday || null,
        tomorrow: adj.tomorrow || null
      };
    }
    return { yesterday: null, tomorrow: null };
  }

  /** Pre-rendered newspaper clipping PNG — matches live quilt mood triptych quote card. */
  async generateNewspaperClippingImageData(dateKey = null) {
    const QNC = globalThis.QuiltNewspaperClipping;
    const compose = QNC?.composeDataUrlWithLayout || QNC?.composeDataUrl;
    if (typeof compose !== 'function') {
      this.logger.warn('QuiltNewspaperClipping.composeDataUrl missing');
      return null;
    }
    const payload = await this._resolveNewspaperClippingTodayPayload(dateKey);
    if (!payload) return null;
    const dk = payload.dateKey;
    const paperTextureUrl =
      this._newspaperClippingPaperTextureUrl() ||
      QNC?.DEFAULTS?.paperTextureUrl ||
      'assets/quilt-paper-card-texture.png';
    const { yesterday, tomorrow } = await this._resolveAdjacentQuotesForClipping(dk);
    const composed = await compose({
      yesterday,
      today: payload,
      tomorrow,
      dateKey: dk,
      paperTextureUrl,
      width: 0,
      cropHorizontalBleedDomPx: 0,
      layoutProfile: 'triptych',
      peekSides: true,
      centerOnly: false
    });
    const dataUrl = typeof composed === 'string' ? composed : composed?.dataUrl || null;
    if (composed && typeof composed === 'object') {
      const bytes = dataUrl
        ? Math.max(0, Math.round(((dataUrl.length - 22) * 3) / 4))
        : 0;
      const clippedW = Number(composed.clippedWidth) || 0;
      const clippedH = Number(composed.clippedHeight) || 0;
      this._lastNewspaperClippingComposeMeta = {
        dateKey: dk,
        bytes,
        composeAttempt: composed.composeAttempt,
        composeAttemptLabel: composed.composeAttemptLabel,
        exportDiagnostics: composed.exportDiagnostics,
        hasKeyword: !!String(payload.keyword || '').trim(),
        spreadCrop: String(composed.spreadCrop || '').trim(),
        peekCrop: composed.peekCrop === true,
        hasYesterdayText: !!composed.hasYesterdayText,
        hasTomorrowText: !!composed.hasTomorrowText,
        clippedWidth: clippedW,
        clippedHeight: clippedH,
        centerOnlyWidth: Number(composed.centerOnlyWidth) || 0,
        peekWidthRatio: Number(composed.peekWidthRatio) || 0,
        aspectRatio: clippedW > 0 && clippedH > 0 ? clippedW / clippedH : 0
      };
      console.log(
        '[archive] newspaper clipping compose',
        JSON.stringify(this._lastNewspaperClippingComposeMeta)
      );
    }
    return dataUrl;
  }

  /** Pre-rendered mood-spread clipping: full good/rough columns + gapped flanks + center quote. */
  async generateMoodSpreadClippingImageData(dateKey = null) {
    const compose = globalThis.QuiltNewspaperClipping?.composeMoodSpreadDataUrl;
    if (typeof compose !== 'function') {
      this.logger.warn('QuiltNewspaperClipping.composeMoodSpreadDataUrl missing');
      return null;
    }
    const qs = window.app?.quoteService;
    const dk =
      String(dateKey || '').trim() ||
      qs?.getQuoteCalendarKeyNow?.() ||
      Utils.getTodayKey?.() ||
      '';
    if (!dk) return null;
    let today =
      (typeof qs?.getQuoteResolvedForInstagramDateKey === 'function'
        ? await qs.getQuoteResolvedForInstagramDateKey(dk)
        : null) || qs?.getTodayQuote?.();
    if (today && typeof qs?.hydrateMoodFieldsForCalendarKey === 'function') {
      try {
        const hydrated = await qs.hydrateMoodFieldsForCalendarKey(dk, today);
        if (hydrated) today = hydrated;
      } catch (_) {
        /* */
      }
    }
    if (!today || !String(today.text || today.body || '').trim()) return null;
    const moods = qs?._moodLinesFromQuote?.(today || {}) || {};
    const goodDay = String(moods.goodDay ?? today.good_day ?? today.goodDay ?? '').trim();
    const roughDay = String(moods.roughDay ?? today.rough_day ?? today.roughDay ?? '').trim();
    if (!goodDay && !roughDay) return null;
    let paperTextureUrl = null;
    try {
      if (typeof location !== 'undefined' && location.href) {
        paperTextureUrl = new URL('assets/quilt-paper-card-texture.png', location.href).href;
      }
    } catch (_) {
      /* */
    }
    return compose({
      today,
      goodDay,
      roughDay,
      dateKey: dk,
      paperTextureUrl,
      width: 0
    });
  }

  async _measureDataUrlHeightPx(dataUrl) {
    const size = await this._measureDataUrlSizePx(dataUrl);
    return size?.h ?? 0;
  }

  async _measureDataUrlSizePx(dataUrl) {
    const src = String(dataUrl || '').trim();
    if (!src.startsWith('data:image/')) return { w: 0, h: 0 };
    if (typeof Image === 'undefined') return { w: 0, h: 0 };
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve({
          w: Math.max(0, Math.round(img.naturalWidth || 0)),
          h: Math.max(0, Math.round(img.naturalHeight || 0))
        });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = src;
    });
  }

  /** Pre-rendered mood clipping PNG (`good_day` / `rough_day`) for quilt stack. */
  async generateMoodClippingImageData(
    dateKey = null,
    { variant = 'good', quoteClippingHeightPx = 0, quoteClippingWidthPx = 0 } = {}
  ) {
    const composeMood = globalThis.QuiltMoodClipping?.composeMoodDataUrl;
    if (typeof composeMood !== 'function') {
      this.logger.warn('QuiltMoodClipping.composeMoodDataUrl missing');
      return null;
    }
    const moodVariant = String(variant || 'good').toLowerCase() === 'rough' ? 'rough' : 'good';
    const qs = window.app?.quoteService;
    const dk =
      String(dateKey || '').trim() ||
      qs?.getQuoteCalendarKeyNow?.() ||
      Utils.getTodayKey?.() ||
      '';
    if (!dk) return null;
    let quote =
      (typeof qs?.getQuoteResolvedForInstagramDateKey === 'function'
        ? await qs.getQuoteResolvedForInstagramDateKey(dk)
        : null) || qs?.getTodayQuote?.();
    if (quote && typeof qs?.hydrateMoodFieldsForCalendarKey === 'function') {
      try {
        const hydrated = await qs.hydrateMoodFieldsForCalendarKey(dk, quote);
        if (hydrated) quote = hydrated;
      } catch (_) {
        /* */
      }
    }
    const moods = qs?._moodLinesFromQuote?.(quote || {}) || {};
    const line = String(
      moodVariant === 'rough'
        ? moods.roughDay ?? quote?.rough_day ?? quote?.roughDay ?? ''
        : moods.goodDay ?? quote?.good_day ?? quote?.goodDay ?? ''
    ).trim();
    if (!line) return null;

    let quoteH = Number(quoteClippingHeightPx);
    let quoteW = Number(quoteClippingWidthPx);
    if (!Number.isFinite(quoteH) || quoteH <= 0 || !Number.isFinite(quoteW) || quoteW <= 0) {
      const quoteDataUrl = await this.generateNewspaperClippingImageData(dk);
      const size = await this._measureDataUrlSizePx(quoteDataUrl);
      if (!Number.isFinite(quoteH) || quoteH <= 0) quoteH = size.h;
      if (!Number.isFinite(quoteW) || quoteW <= 0) quoteW = size.w;
    }

    let paperTextureUrl = null;
    try {
      if (typeof location !== 'undefined' && location.href) {
        paperTextureUrl = new URL('assets/quilt-paper-card-texture.png', location.href).href;
      }
    } catch (_) {
      /* */
    }
    return composeMood({
      line,
      dateKey: dk,
      variant: moodVariant,
      quoteClippingHeightPx: quoteH,
      quoteClippingWidthPx: quoteW,
      paperTextureUrl,
      width: quoteW
    });
  }

  // Generate Instagram-ready image (4:5 portrait ratio)
  async generateInstagramImage(blocks, _quote = null) {
    try {
      if (!blocks || blocks.length === 0) {
        this.logger.warn('No blocks provided for Instagram image generation');
        return null;
      }

      const quiltBlob = await this.getInstagramQuiltSourceBlob(blocks, {
        exportModeLabel: 'classic_9x16_from_shared_source'
      });
      if (!quiltBlob) return null;

      const W = 1080;
      const H = 1350;
      /** Minimal symmetric inset so IG classic matches thin top/bottom (contain centers in full inner box). */
      const pad = 2;
      const innerW = W - pad * 2;
      const innerH = H - pad * 2;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = W;
      canvas.height = H;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      const bitmapUrl = URL.createObjectURL(quiltBlob);
      try {
        const img = await new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error('Could not decode quilt bitmap'));
          im.src = bitmapUrl;
        });
        const iw = Math.max(1, img.naturalWidth || img.width);
        const ih = Math.max(1, img.naturalHeight || img.height);
        const scale = Math.min(innerW / iw, innerH / ih);
        const dw = Math.round(iw * scale);
        const dh = Math.round(ih * scale);
        const dx = pad + (innerW - dw) / 2;
        const dy = pad + (innerH - dh) / 2;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
      } finally {
        URL.revokeObjectURL(bitmapUrl);
      }

      return canvas.toDataURL('image/png', 0.95);
    } catch (error) {
      this.logger.error('Instagram image generation failed:', error);
      return null;
    }
  }

  hasRenderedQuiltSvgForBlocks(quiltSVG, blocks) {
    if (!quiltSVG || !Array.isArray(blocks) || blocks.length === 0) return false;
    if (quiltSVG.querySelector('#quiltFieldLayer, #quiltParallaxLayer, polygon, rect')) {
      return true;
    }
    const renderedIds = Array.from(quiltSVG.querySelectorAll('[data-block-id]'))
      .map((node) => node.getAttribute('data-block-id'))
      .filter(Boolean);
    const expectedIds = blocks.map((block) => block?.id).filter(Boolean);
    if (expectedIds.length === blocks.length) {
      const renderedSet = new Set(renderedIds);
      return expectedIds.every((id) => renderedSet.has(id));
    }
    return renderedIds.length >= blocks.length;
  }

  /** Rasterize the live quilt crop as it appears on the quilt screen. */
  async rasterizeVisibleQuiltSvgToPngBlob(quiltSVG, blocks = null, options = {}) {
    if (!quiltSVG) return null;
    const rect = quiltSVG.getBoundingClientRect?.();
    const requestedAspect =
      Number.isFinite(options.targetAspect) && options.targetAspect > 0
        ? options.targetAspect
        : null;
    const screenAspect =
      requestedAspect ||
      (rect && rect.width > 0 && rect.height > 0
        ? rect.width / rect.height
        : null);
    return this.rasterizeQuiltSvgToPngBlob(quiltSVG, {
      underpaintBlocks: blocks,
      targetAspect: screenAspect || undefined,
      maxEdge: options.maxEdge,
      exportModeLabel:
        options.exportModeLabel || (screenAspect ? 'zapier_screen_aspect_crop' : undefined),
      skipExportUnderpaint: options.skipExportUnderpaint === true,
      exportPrimaryQuiltOnly: options.exportPrimaryQuiltOnly === true,
      exportMatchQuiltScreen: options.exportMatchQuiltScreen === true,
      exportFillFrame: options.exportFillFrame === true,
      exportMatteFill: options.exportMatteFill,
      viewBoxPaddingRatio: options.viewBoxPaddingRatio,
      preserveAspectRatio: options.preserveAspectRatio,
      instagramTrueWhiteMatte: options.instagramTrueWhiteMatte === true,
      quiltFingerprint: options.quiltFingerprint
    });
  }

  cropViewBoxForSliceAspect(viewBoxParts, targetAspect) {
    if (
      !Array.isArray(viewBoxParts) ||
      viewBoxParts.length !== 4 ||
      !Number.isFinite(targetAspect) ||
      targetAspect <= 0
    ) {
      return null;
    }
    const [x, y, width, height] = viewBoxParts;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    const sourceAspect = width / height;
    if (Math.abs(sourceAspect - targetAspect) < 0.0001) return [x, y, width, height];
    if (targetAspect > sourceAspect) {
      const croppedHeight = width / targetAspect;
      const ch = Math.min(height, croppedHeight);
      /** Center vertically (top-anchored crops left a huge empty band above the quilt in 9:16 exports). */
      const y0 = y + Math.max(0, (height - ch) / 2);
      return [x, y0, width, ch];
    }
    const croppedWidth = height * targetAspect;
    return [x + (width - croppedWidth) / 2, y, Math.min(width, croppedWidth), height];
  }

  /** Block bounds viewBox for exports (excludes on-screen mirror field). */
  viewBoxPartsFromQuiltBlocks(blocks, paddingRatio = 0.02) {
    if (!Array.isArray(blocks) || !blocks.length) return null;
    const minX = Math.min(...blocks.map((b) => Number(b.x)));
    const minY = Math.min(...blocks.map((b) => Number(b.y)));
    const maxX = Math.max(...blocks.map((b) => Number(b.x) + Number(b.width)));
    const maxY = Math.max(...blocks.map((b) => Number(b.y) + Number(b.height)));
    const quiltW = maxX - minX;
    const quiltH = maxY - minY;
    if (!(quiltW > 0) || !(quiltH > 0)) return null;
    const padded = this.padViewBoxParts([minX, minY, quiltW, quiltH], paddingRatio);
    return padded || [minX, minY, quiltW, quiltH];
  }

  /**
   * Expand (never shrink) a viewBox so every block stays inside a target aspect (e.g. 9:16).
   */
  expandViewBoxToAspect(viewBoxParts, targetAspect) {
    if (
      !Array.isArray(viewBoxParts) ||
      viewBoxParts.length !== 4 ||
      !Number.isFinite(targetAspect) ||
      targetAspect <= 0
    ) {
      return null;
    }
    const [x, y, width, height] = viewBoxParts;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    const sourceAspect = width / height;
    if (Math.abs(sourceAspect - targetAspect) < 0.0001) return [x, y, width, height];
    if (sourceAspect > targetAspect) {
      const nh = width / targetAspect;
      const dy = (nh - height) / 2;
      return [x, y - dy, width, nh];
    }
    const nw = height * targetAspect;
    const dx = (nw - width) / 2;
    return [x - dx, y, nw, height];
  }

  stripMirroredQuiltFieldFromSvgClone(svgClone) {
    if (!svgClone) return;
    svgClone
      .querySelectorAll(
        '#quiltMirroredFieldLayer, #quiltExportMirroredGapUnderpaint, [data-export-mirrored-field="1"]'
      )
      .forEach((node) => node.remove());
  }

  padViewBoxParts(viewBoxParts, paddingRatio) {
    if (
      !Array.isArray(viewBoxParts) ||
      viewBoxParts.length !== 4 ||
      !Number.isFinite(paddingRatio) ||
      paddingRatio <= 0
    ) {
      return null;
    }
    const [x, y, width, height] = viewBoxParts;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    const dx = width * paddingRatio;
    const dy = height * paddingRatio;
    return [x - dx, y - dy, width + dx * 2, height + dy * 2];
  }

  addQuiltExportUnderpaint(svgClone, explicitBlocks = null) {
    if (!svgClone) return;
    const blocks = Array.isArray(explicitBlocks) && explicitBlocks.length
      ? explicitBlocks
      : (typeof window !== 'undefined' && Array.isArray(window.app?.quiltEngine?.blocks)
        ? window.app.quiltEngine.blocks
        : []);
    if (!blocks.length) return;
    const ns = 'http://www.w3.org/2000/svg';
    const fieldLayer = svgClone.querySelector('#quiltFieldLayer') || svgClone;
    const parallaxLayer = fieldLayer.querySelector('#quiltParallaxLayer');
    const mirroredLayer = fieldLayer.querySelector('#quiltMirroredFieldLayer');

    const buildUnderpaintGroup = (id) => {
      const group = document.createElementNS(ns, 'g');
      group.setAttribute('id', id);
      group.setAttribute('aria-hidden', 'true');
      group.setAttribute('pointer-events', 'none');
      group.setAttribute('data-export-underpaint', '1');
      const bleed = 2.5;
      blocks.forEach((block) => {
        if (!block) return;
        const x = Number(block.x);
        const y = Number(block.y);
        const w = Math.max(0, Number(block.width));
        const h = Math.max(0, Number(block.height));
        const fill = Utils.validateHexColor(block.color) ? block.color : '#d8d4cf';
        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', String(x - bleed));
        rect.setAttribute('y', String(y - bleed));
        rect.setAttribute('width', String(w + bleed * 2));
        rect.setAttribute('height', String(h + bleed * 2));
        rect.setAttribute('fill', fill);
        rect.setAttribute('stroke', 'none');
        group.appendChild(rect);
      });
      return group.childNodes.length ? group : null;
    };

    const underpaint = buildUnderpaintGroup('quiltExportGapUnderpaint');
    if (underpaint) {
      fieldLayer.insertBefore(underpaint, parallaxLayer || fieldLayer.firstChild);
    }
    if (mirroredLayer) {
      const mirroredUnderpaint = buildUnderpaintGroup('quiltExportMirroredGapUnderpaint');
      if (mirroredUnderpaint) {
        const mirroredTransform = mirroredLayer.getAttribute('transform');
        if (mirroredTransform) mirroredUnderpaint.setAttribute('transform', mirroredTransform);
        fieldLayer.insertBefore(mirroredUnderpaint, mirroredLayer);
      }
    }
  }

  drawQuiltExportCanvasUnderpaint(ctx, width, height, viewBoxParts, explicitBlocks = null, svgClone = null) {
    if (!ctx || !Array.isArray(viewBoxParts) || viewBoxParts.length !== 4) return;
    const blocks = Array.isArray(explicitBlocks) && explicitBlocks.length
      ? explicitBlocks
      : (typeof window !== 'undefined' && Array.isArray(window.app?.quiltEngine?.blocks)
        ? window.app.quiltEngine.blocks
        : []);
    if (!blocks.length) return;
    const [vbX, vbY, vbW, vbH] = viewBoxParts;
    if (![vbX, vbY, vbW, vbH].every(Number.isFinite) || vbW <= 0 || vbH <= 0) return;
    const fieldTransform = String(svgClone?.querySelector?.('#quiltFieldLayer')?.getAttribute('transform') || '');
    const transformMatch = /translate\(\s*([-0-9.]+)(?:[\s,]+[-0-9.]+)?\s*\)\s*scale\(\s*([-0-9.]+)/.exec(fieldTransform);
    const stretchAnchor = transformMatch ? Number(transformMatch[1]) : 0;
    const stretchScale = transformMatch ? Number(transformMatch[2]) : 1;
    const hasHorizontalStretch =
      Number.isFinite(stretchAnchor) &&
      Number.isFinite(stretchScale) &&
      Math.abs(stretchScale - 1) > 1e-6;
    const sx = width / vbW;
    const sy = height / vbH;
    const bleed = 8;
    const drawOneField = (mirror = false) => {
      blocks.forEach((block) => {
        if (!block) return;
        const bx = Number(block.x);
        const by = Number(block.y);
        const bw = Math.max(0, Number(block.width));
        const bh = Math.max(0, Number(block.height));
        if (![bx, by, bw, bh].every(Number.isFinite) || bw <= 0 || bh <= 0) return;
        const fill = Utils.validateHexColor(block.color) ? block.color : '#d8d4cf';
        let x1 = bx - bleed;
        let x2 = bx + bw + bleed;
        let y1 = by - bleed;
        let y2 = by + bh + bleed;
        if (hasHorizontalStretch) {
          x1 = stretchAnchor + (x1 - stretchAnchor) * stretchScale;
          x2 = stretchAnchor + (x2 - stretchAnchor) * stretchScale;
        }
        if (mirror) {
          const sourceMinY = Math.min(...blocks.map((b) => Number(b?.y) || 0));
          const sourceMaxY = Math.max(...blocks.map((b) => (Number(b?.y) || 0) + (Number(b?.height) || 0)));
          const mirrorSeam = sourceMaxY - sourceMinY;
          const oldY1 = y1;
          const oldY2 = y2;
          y1 = sourceMinY + mirrorSeam + (sourceMaxY - oldY2);
          y2 = sourceMinY + mirrorSeam + (sourceMaxY - oldY1);
        }
        const px = (Math.min(x1, x2) - vbX) * sx;
        const py = (Math.min(y1, y2) - vbY) * sy;
        const pw = Math.abs(x2 - x1) * sx;
        const ph = Math.abs(y2 - y1) * sy;
        ctx.fillStyle = fill;
        ctx.fillRect(px, py, pw, ph);
      });
    };
    ctx.save();
    drawOneField(false);
    if (svgClone?.querySelector?.('#quiltMirroredFieldLayer')) {
      drawOneField(true);
    }
    ctx.restore();
  }

  healQuiltExportRasterSeams(ctx, width, height) {
    if (!ctx || !(width > 0) || !(height > 0)) return;
    let img;
    try {
      img = ctx.getImageData(0, 0, width, height);
    } catch (_) {
      return;
    }
    const data = img.data;
    const source = new Uint8ClampedArray(data);
    const idxFor = (x, y) => (y * width + x) * 4;
    const sat = (i) => Math.max(source[i], source[i + 1], source[i + 2]) - Math.min(source[i], source[i + 1], source[i + 2]);
    const luma = (i) => 0.299 * source[i] + 0.587 * source[i + 1] + 0.114 * source[i + 2];
    const isNeutralSeam = (i) => {
      if (source[i + 3] < 220) return true;
      const nearPaper =
        Math.abs(source[i] - 246) <= 18 &&
        Math.abs(source[i + 1] - 244) <= 18 &&
        Math.abs(source[i + 2] - 241) <= 18;
      return nearPaper || (luma(i) >= 224 && sat(i) <= 26);
    };
    const isQuiltColor = (i) => source[i + 3] >= 220 && luma(i) < 246 && sat(i) >= 28;
    const hasNearbyColor = (x, y) => {
      const probes = [
        [-3, 0], [3, 0], [0, -3], [0, 3],
        [-2, -2], [2, -2], [-2, 2], [2, 2]
      ];
      return probes.some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < width && ny < height && isQuiltColor(idxFor(nx, ny));
      });
    };
    const radius = 5;
    let changed = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = idxFor(x, y);
        if (!isNeutralSeam(i) || !hasNearbyColor(x, y)) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const ni = idxFor(nx, ny);
            if (!isQuiltColor(ni)) continue;
            r += source[ni];
            g += source[ni + 1];
            b += source[ni + 2];
            count++;
          }
        }
        if (count < 3) continue;
        data[i] = Math.round(r / count);
        data[i + 1] = Math.round(g / count);
        data[i + 2] = Math.round(b / count);
        data[i + 3] = 255;
        changed++;
      }
    }
    if (changed > 0) {
      ctx.putImageData(img, 0, 0);
    }
  }

  /**
   * After film grain, restore pure white only in the viewBox margin outside the blocks' bounds.
   * Does not touch pixels inside the block envelope (quilt + internal gaps keep grain/texture).
   */
  bleachInstagramOuterMatteAroundBlockBounds(
    ctx,
    outW,
    outH,
    viewBoxParts,
    blocks,
    svgClone = null,
    matteFill = '#ffffff'
  ) {
    if (!ctx || !Array.isArray(viewBoxParts) || viewBoxParts.length !== 4) return;
    if (!Array.isArray(blocks) || !blocks.length) return;
    const [vbX, vbY, vbW, vbH] = viewBoxParts;
    if (![vbX, vbY, vbW, vbH].every(Number.isFinite) || vbW <= 0 || vbH <= 0) return;
    const fieldTransform = String(svgClone?.querySelector?.('#quiltFieldLayer')?.getAttribute('transform') || '');
    const transformMatch = /translate\(\s*([-0-9.]+)(?:[\s,]+[-0-9.]+)?\s*\)\s*scale\(\s*([-0-9.]+)/.exec(fieldTransform);
    const stretchAnchor = transformMatch ? Number(transformMatch[1]) : 0;
    const stretchScale = transformMatch ? Number(transformMatch[2]) : 1;
    const hasHorizontalStretch =
      Number.isFinite(stretchAnchor) &&
      Number.isFinite(stretchScale) &&
      Math.abs(stretchScale - 1) > 1e-6;
    let qx1 = Infinity;
    let qy1 = Infinity;
    let qx2 = -Infinity;
    let qy2 = -Infinity;
    for (const b of blocks) {
      if (!b) continue;
      const bx = Number(b.x);
      const by = Number(b.y);
      const bw = Number(b.width);
      const bh = Number(b.height);
      if (![bx, by, bw, bh].every(Number.isFinite) || bw <= 0 || bh <= 0) continue;
      let x1 = bx;
      let x2 = bx + bw;
      if (hasHorizontalStretch) {
        x1 = stretchAnchor + (x1 - stretchAnchor) * stretchScale;
        x2 = stretchAnchor + (x2 - stretchAnchor) * stretchScale;
      }
      qx1 = Math.min(qx1, x1);
      qy1 = Math.min(qy1, by);
      qx2 = Math.max(qx2, x2);
      qy2 = Math.max(qy2, by + bh);
    }
    /**
     * Screen exports include the mirrored field in the SVG viewBox; extend bleach to that full height.
     * Primary-only Instagram exports strip the mirror and must not extend past block bounds.
     */
    if (svgClone?.querySelector?.('#quiltMirroredFieldLayer')) {
      qy2 = Math.max(qy2, vbY + vbH);
    }
    if (!Number.isFinite(qx1) || qx2 <= qx1 || qy2 <= qy1) return;
    const bleed = Math.max(6, Math.min(outW, outH) * 0.006);
    const sx = outW / vbW;
    const sy = outH / vbH;
    let left = (qx1 - vbX) * sx - bleed;
    let top = (qy1 - vbY) * sy - bleed;
    let right = (qx2 - vbX) * sx + bleed;
    let bottom = (qy2 - vbY) * sy + bleed;
    left = Math.max(0, Math.floor(left));
    top = Math.max(0, Math.floor(top));
    right = Math.min(outW, Math.ceil(right));
    bottom = Math.min(outH, Math.ceil(bottom));
    ctx.save();
    ctx.fillStyle = matteFill;
    if (top > 0) ctx.fillRect(0, 0, outW, top);
    if (bottom < outH) ctx.fillRect(0, bottom, outW, outH - bottom);
    if (left > 0) ctx.fillRect(0, top, left, Math.max(0, bottom - top));
    if (right < outW) ctx.fillRect(right, top, outW - right, Math.max(0, bottom - top));
    ctx.restore();
  }

  /** Same outer-matte bleach as `bleachInstagramOuterMatteAroundBlockBounds` for the block-only raster (no SVG viewBox). */
  bleachInstagramOuterMatteForBlockRaster(
    ctx,
    outW,
    outH,
    sourceX,
    sourceY,
    scaleX,
    scaleY,
    blocks,
    matteFill = '#ffffff'
  ) {
    if (!ctx || !Array.isArray(blocks) || !blocks.length) return;
    let qx1 = Infinity;
    let qy1 = Infinity;
    let qx2 = -Infinity;
    let qy2 = -Infinity;
    for (const b of blocks) {
      if (!b) continue;
      const bx = Number(b.x);
      const by = Number(b.y);
      const bw = Number(b.width);
      const bh = Number(b.height);
      if (![bx, by, bw, bh].every(Number.isFinite) || bw <= 0 || bh <= 0) continue;
      qx1 = Math.min(qx1, bx);
      qy1 = Math.min(qy1, by);
      qx2 = Math.max(qx2, bx + bw);
      qy2 = Math.max(qy2, by + bh);
    }
    if (!Number.isFinite(qx1) || qx2 <= qx1 || qy2 <= qy1) return;
    const bleed = Math.max(6, Math.min(outW, outH) * 0.006);
    let left = (qx1 - sourceX) * scaleX - bleed;
    let top = (qy1 - sourceY) * scaleY - bleed;
    let right = (qx2 - sourceX) * scaleX + bleed;
    let bottom = (qy2 - sourceY) * scaleY + bleed;
    left = Math.max(0, Math.floor(left));
    top = Math.max(0, Math.floor(top));
    right = Math.min(outW, Math.ceil(right));
    bottom = Math.min(outH, Math.ceil(bottom));
    ctx.save();
    ctx.fillStyle = matteFill;
    if (top > 0) ctx.fillRect(0, 0, outW, top);
    if (bottom < outH) ctx.fillRect(0, bottom, outW, outH - bottom);
    if (left > 0) ctx.fillRect(0, top, left, Math.max(0, bottom - top));
    if (right < outW) ctx.fillRect(right, top, outW - right, Math.max(0, bottom - top));
    ctx.restore();
  }

  /** High-res PNG blob from the live quilt SVG (same path as layout B story share). */
  async rasterizeQuiltSvgToPngBlob(quiltSVG, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        this.lastQuiltExportDebug = null;
        this.lastQuiltExportRawDataUrl = null;
        const svgClone = quiltSVG.cloneNode(true);
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgClone.querySelectorAll('.new-block').forEach((node) => {
          node.classList.remove('new-block');
          node.removeAttribute('opacity');
          node.style.animation = 'none';
        });

        const exportBlocks =
          Array.isArray(options.underpaintBlocks) && options.underpaintBlocks.length
            ? options.underpaintBlocks
            : null;
        const exportPrimaryQuiltOnly = options.exportPrimaryQuiltOnly === true;
        const exportMatchQuiltScreen = options.exportMatchQuiltScreen === true;
        if (exportPrimaryQuiltOnly && !exportMatchQuiltScreen) {
          this.stripMirroredQuiltFieldFromSvgClone(svgClone);
        }

        const viewBox = (quiltSVG.getAttribute('viewBox') || '').trim();
        let viewBoxParts = null;
        let sourceWidth = 1080;
        let sourceHeight = 1080;
        if (exportPrimaryQuiltOnly && exportBlocks) {
          viewBoxParts = this.viewBoxPartsFromQuiltBlocks(
            exportBlocks,
            Number(options.viewBoxPaddingRatio) > 0 ? Number(options.viewBoxPaddingRatio) : 0.02
          );
          if (viewBoxParts) {
            sourceWidth = Math.max(1, viewBoxParts[2]);
            sourceHeight = Math.max(1, viewBoxParts[3]);
          }
        } else if (
          exportMatchQuiltScreen &&
          exportBlocks &&
          typeof this.viewBoxPartsForMirroredQuiltScreen === 'function'
        ) {
          viewBoxParts = this.viewBoxPartsForMirroredQuiltScreen(exportBlocks);
          if (viewBoxParts) {
            sourceWidth = Math.max(1, viewBoxParts[2]);
            sourceHeight = Math.max(1, viewBoxParts[3]);
          }
        } else if (viewBox) {
          const parts = viewBox.split(/\s+/).map(Number);
          if (parts.length === 4 && parts.every(Number.isFinite)) {
            viewBoxParts = parts;
            sourceWidth = Math.max(1, parts[2]);
            sourceHeight = Math.max(1, parts[3]);
          }
        } else {
          const rect = quiltSVG.getBoundingClientRect();
          sourceWidth = Math.max(1, Math.round(rect.width));
          sourceHeight = Math.max(1, Math.round(rect.height));
        }

        const targetAspect =
          Number.isFinite(options.targetAspect) && options.targetAspect > 0
            ? options.targetAspect
            : null;
        let croppedViewBoxParts = null;
        let expandedViewBoxParts = null;
        if (targetAspect && viewBoxParts && !exportMatchQuiltScreen) {
          if (exportPrimaryQuiltOnly) {
            expandedViewBoxParts = this.expandViewBoxToAspect(viewBoxParts, targetAspect);
          } else {
            croppedViewBoxParts = this.cropViewBoxForSliceAspect(viewBoxParts, targetAspect);
          }
        }
        const paddedViewBoxParts =
          options.viewBoxPaddingRatio &&
          !exportPrimaryQuiltOnly &&
          !exportMatchQuiltScreen &&
          (croppedViewBoxParts || viewBoxParts)
            ? this.padViewBoxParts(croppedViewBoxParts || viewBoxParts, Number(options.viewBoxPaddingRatio))
            : null;
        let screenExpandedViewBoxParts = null;
        const exportFillFrame = options.exportFillFrame === true;
        if (exportMatchQuiltScreen && viewBoxParts && targetAspect) {
          screenExpandedViewBoxParts = exportFillFrame
            ? this.cropViewBoxForSliceAspect(viewBoxParts, targetAspect)
            : this.expandViewBoxToAspect(viewBoxParts, targetAspect);
        }
        const exportViewBoxParts =
          exportMatchQuiltScreen && viewBoxParts
            ? screenExpandedViewBoxParts || viewBoxParts
            : expandedViewBoxParts || paddedViewBoxParts || croppedViewBoxParts;
        if (exportViewBoxParts) {
          viewBoxParts = exportViewBoxParts;
          sourceWidth = Math.max(1, exportViewBoxParts[2]);
          sourceHeight = Math.max(1, exportViewBoxParts[3]);
          svgClone.setAttribute('viewBox', exportViewBoxParts.join(' '));
          let par;
          if (exportMatchQuiltScreen) {
            par = exportFillFrame ? 'xMidYMid slice' : 'xMidYMid meet';
          } else {
            par =
              typeof options.preserveAspectRatio === 'string' && options.preserveAspectRatio.trim()
                ? options.preserveAspectRatio.trim()
                : 'xMidYMin meet';
          }
          svgClone.setAttribute('preserveAspectRatio', par);
        }
        const rect = quiltSVG.getBoundingClientRect?.();
        const maxEdge = Math.min(
          4096,
          Math.max(64, Number(options.maxEdge) || 2400)
        );
        const aspect = targetAspect || (sourceWidth / sourceHeight);
        let outW;
        let outH;
        if (aspect >= 1) {
          outW = maxEdge;
          outH = Math.round(maxEdge / aspect);
        } else {
          outH = maxEdge;
          outW = Math.round(maxEdge * aspect);
        }

        svgClone.removeAttribute('style');
        svgClone.setAttribute('width', String(outW));
        svgClone.setAttribute('height', String(outH));
        if (!options.skipExportUnderpaint) {
          this.addQuiltExportUnderpaint(svgClone, options.underpaintBlocks);
        }
        this.lastQuiltExportDebug = {
          mode: options.exportModeLabel || (targetAspect ? 'target_aspect_crop' : 'default_svg_raster'),
          exportPrimaryQuiltOnly,
          exportMatchQuiltScreen,
          exportViewBoxFromBlocks: !!(exportMatchQuiltScreen && exportBlocks),
          originalViewBox: viewBox || '',
          croppedViewBox: croppedViewBoxParts ? croppedViewBoxParts.join(' ') : '',
          expandedViewBox: expandedViewBoxParts ? expandedViewBoxParts.join(' ') : '',
          screenExpandedViewBox: screenExpandedViewBoxParts
            ? screenExpandedViewBoxParts.join(' ')
            : '',
          paddedViewBox: paddedViewBoxParts ? paddedViewBoxParts.join(' ') : '',
          viewBoxPaddingRatio: Number(options.viewBoxPaddingRatio) || null,
          targetAspect: targetAspect || null,
          sourceWidth,
          sourceHeight,
          outputWidth: outW,
          outputHeight: outH,
          svgClientRect: rect
            ? {
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              top: Math.round(rect.top),
              left: Math.round(rect.left)
            }
            : null,
          preserveAspectRatio: svgClone.getAttribute('preserveAspectRatio') || '',
          usedLiveSvg: true,
          backsidePreview: !!(typeof window !== 'undefined' && window.app?._isBacksidePreviewMode)
        };

        const svgData = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const exportMatteFill =
          typeof options.exportMatteFill === 'string' && /^#[0-9a-f]{3,8}$/i.test(options.exportMatteFill.trim())
            ? options.exportMatteFill.trim()
            : exportMatchQuiltScreen
              ? '#f6f4f1'
              : '#ffffff';
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = outW;
            canvas.height = outH;
            ctx.fillStyle = exportMatteFill;
            ctx.fillRect(0, 0, outW, outH);
            if (viewBoxParts && options.underpaintBlocks && !options.skipExportUnderpaint) {
              this.drawQuiltExportCanvasUnderpaint(
                ctx,
                outW,
                outH,
                viewBoxParts,
                options.underpaintBlocks,
                svgClone
              );
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            const iw = Math.max(1, img.naturalWidth || outW);
            const ih = Math.max(1, img.naturalHeight || outH);
            if (exportMatchQuiltScreen) {
              ctx.drawImage(img, 0, 0, outW, outH);
            } else {
              const scale = Math.min(outW / iw, outH / ih);
              const dw = Math.round(iw * scale);
              const dh = Math.round(ih * scale);
              const ox = Math.floor((outW - dw) / 2);
              const oy = Math.floor((outH - dh) / 2);
              ctx.drawImage(img, 0, 0, iw, ih, ox, oy, dw, dh);
            }
            if (options.underpaintBlocks) {
              this.healQuiltExportRasterSeams(ctx, outW, outH);
            }
            Utils.applyFilmGrain(ctx, outW, outH, 0, { vignette: false });
            if (
              options.instagramTrueWhiteMatte === true &&
              viewBoxParts &&
              Array.isArray(options.underpaintBlocks) &&
              options.underpaintBlocks.length
            ) {
              this.bleachInstagramOuterMatteAroundBlockBounds(
                ctx,
                outW,
                outH,
                viewBoxParts,
                options.underpaintBlocks,
                svgClone,
                exportMatteFill
              );
            }
            canvas.toBlob(async (blob) => {
              URL.revokeObjectURL(svgUrl);
              if (!blob) {
                reject(new Error('Could not convert canvas to blob'));
                return;
              }
              if (options.captureDebugRawDataUrl !== false) {
                try {
                  this.lastQuiltExportRawDataUrl = await Utils.blobToDataUrl(blob);
                } catch (_) {
                  this.lastQuiltExportRawDataUrl = null;
                }
              }
              resolve(blob);
            }, 'image/png');
          } catch (drawError) {
            URL.revokeObjectURL(svgUrl);
            reject(drawError);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(svgUrl);
          reject(new Error('Failed to render SVG for sharing'));
        };
        img.src = svgUrl;
      } catch (err) {
        reject(err);
      }
    });
  }

  /** Fallback raster when SVG is not available (e.g. headless / Zapier). */
  async generateQuiltRasterBlobFromBlocks(blocks, options = {}) {
    if (!blocks || blocks.length === 0) return null;
    const minX = Math.min(...blocks.map((b) => b.x));
    const minY = Math.min(...blocks.map((b) => b.y));
    const maxX = Math.max(...blocks.map((b) => b.x + b.width));
    const maxY = Math.max(...blocks.map((b) => b.y + b.height));
    const quiltW = maxX - minX;
    const quiltH = maxY - minY;
    let sourceX = minX;
    let sourceY = minY;
    let sourceW = quiltW;
    let sourceH = quiltH;
    const targetAspect =
      Number.isFinite(options.targetAspect) && options.targetAspect > 0
        ? Number(options.targetAspect)
        : null;
    if (targetAspect && quiltW > 0 && quiltH > 0) {
      const sourceAspect = quiltW / quiltH;
      if (targetAspect > sourceAspect) {
        sourceH = Math.min(quiltH, quiltW / targetAspect);
        sourceY = minY + (quiltH - sourceH) / 2;
      } else {
        sourceW = Math.min(quiltW, quiltH * targetAspect);
        sourceX = minX + (quiltW - sourceW) / 2;
      }
    }
    const maxEdge = Math.min(
      4096,
      Math.max(64, Number(options.maxEdge) || 2400)
    );
    const aspect = targetAspect || sourceW / Math.max(1, sourceH);
    let outW;
    let outH;
    if (aspect >= 1) {
      outW = maxEdge;
      outH = Math.round(maxEdge / aspect);
    } else {
      outH = maxEdge;
      outW = Math.round(maxEdge * aspect);
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = outW;
    canvas.height = outH;
    const bgColor =
      typeof options.backgroundColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(options.backgroundColor.trim())
        ? options.backgroundColor.trim()
        : '#f6f4f1';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality =
      options.imageSmoothingQuality === 'low' ? 'low' : 'high';
    let scaleX = outW / Math.max(1, sourceW);
    let scaleY = outH / Math.max(1, sourceH);
    let offsetX = 0;
    let offsetY = 0;
    if (options.exportMatchQuiltScreen === true) {
      const scale =
        options.exportFillFrame === true
          ? Math.max(scaleX, scaleY)
          : Math.min(scaleX, scaleY);
      scaleX = scale;
      scaleY = scale;
      offsetX = (outW - sourceW * scale) / 2;
      offsetY = (outH - sourceH * scale) / 2;
    }
    const fp = String(options.quiltFingerprint || Utils.computeQuiltFingerprint(blocks) || '');
    let jitterSeed = 1;
    for (let i = 0; i < fp.length; i++) {
      jitterSeed = (Math.imul(jitterSeed, 31) + fp.charCodeAt(i)) | 0;
    }
    const jitterRng = Utils._mulberry32(jitterSeed || 1);
    blocks.forEach((block) => {
      SimpleQuiltEngine.ensureInsetClassificationFromGeometry(block);
      const jitterX = (jitterRng() - 0.5) * 8;
      const jitterY = (jitterRng() - 0.5) * 8;
      const jitterRotation = (jitterRng() - 0.5) * 4;
      const jitteredX = block.x + jitterX;
      const jitteredY = block.y + jitterY;
      const canvasX = (jitteredX - sourceX) * scaleX + offsetX;
      const canvasY = (jitteredY - sourceY) * scaleY + offsetY;
      const canvasWidth = block.width * scaleX;
      const canvasHeight = block.height * scaleY;
      const isHst =
        block.patternType === 'special' &&
        block.specialPatternType === 'hst';
      if (isHst) {
        const tris = Utils.getHstOrganicRenderTriangles(block, 1);
        const bw = Math.max(1e-6, block.width);
        const bh = Math.max(1e-6, block.height);
        const centerX = canvasX + canvasWidth / 2;
        const centerY = canvasY + canvasHeight / 2;
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((jitterRotation * Math.PI) / 180);
        const x0 = -canvasWidth / 2;
        const y0 = -canvasHeight / 2;
        const cw = canvasWidth;
        const ch = canvasHeight;
          tris.forEach((t, tux) => {
            const pts = t.points || [];
            if (pts.length < 3) return;
            ctx.fillStyle = t.color || block.color;
            ctx.beginPath();
            ctx.moveTo(x0 + (pts[0][0] / bw) * cw, y0 + (pts[0][1] / bh) * ch);
            for (let k = 1; k < pts.length; k++) {
              ctx.lineTo(x0 + (pts[k][0] / bw) * cw, y0 + (pts[k][1] / bh) * ch);
            }
            ctx.closePath();
            ctx.fill();
            const anch = Utils.hstOrganicTriangleRadialAnchorLocal(pts);
            if (!anch) return;
            const tcx = x0 + (anch.cx / bw) * cw;
            const tcy = y0 + (anch.cy / bh) * ch;
            const spanPx = Math.max((anch.span / bw) * cw, (anch.span / bh) * ch, 1e-6);
            const washHx = /^#[0-9a-f]{6}$/i.test(String(t.color || '').trim())
              ? String(t.color).trim()
              : /^#[0-9a-f]{6}$/i.test(String(block.color || '').trim())
                ? String(block.color).trim()
                : '#c8c4bf';
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x0 + (pts[0][0] / bw) * cw, y0 + (pts[0][1] / bh) * ch);
            for (let k = 1; k < pts.length; k++) {
              ctx.lineTo(x0 + (pts[k][0] / bw) * cw, y0 + (pts[k][1] / bh) * ch);
            }
            ctx.closePath();
            ctx.clip();
            Utils.canvasWatercolorWashAxisAlignedRect(
              ctx,
              x0,
              y0,
              cw,
              ch,
              washHx,
              `${block.id || 'blk'}|rasterblob|${tux}`,
              { radial: { cx: tcx, cy: tcy, span: spanPx }, skipClip: true }
            );
            ctx.restore();
          });
          ctx.restore();
        return;
      }
      const isInset =
        block.patternType === 'special' &&
        block.specialPatternType === 'insetCircle';
      if (isInset) {
        const bw = Math.max(1e-6, block.width);
        const bh = Math.max(1e-6, block.height);
        const centerX = canvasX + canvasWidth / 2;
        const centerY = canvasY + canvasHeight / 2;
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((jitterRotation * Math.PI) / 180);
        const x0 = -canvasWidth / 2;
        const y0 = -canvasHeight / 2;
        Utils.fillInsetCircleBlockCanvasCtx(ctx, block, x0, y0, canvasWidth, canvasHeight);
        ctx.restore();
        return;
      }
      ctx.save();
      const centerX = canvasX + canvasWidth / 2;
      const centerY = canvasY + canvasHeight / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((jitterRotation * Math.PI) / 180);
      ctx.fillStyle = block.color;
      ctx.fillRect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
      ctx.restore();
    });
    Utils.applyFilmGrain(ctx, outW, outH, 0, { vignette: false });
    if (options.instagramTrueWhiteMatte === true) {
      const exportMatteFill =
        typeof options.exportMatteFill === 'string' && /^#[0-9a-f]{3,8}$/i.test(options.exportMatteFill.trim())
          ? options.exportMatteFill.trim()
          : '#ffffff';
      this.bleachInstagramOuterMatteForBlockRaster(
        ctx,
        outW,
        outH,
        sourceX,
        sourceY,
        scaleX,
        scaleY,
        blocks,
        exportMatteFill
      );
    }
    const mimeType =
      typeof options.mimeType === 'string' && options.mimeType.length
        ? options.mimeType
        : 'image/png';
    const quality =
      typeof options.quality === 'number'
        ? options.quality
        : mimeType === 'image/jpeg' || mimeType === 'image/webp'
          ? 0.88
          : undefined;
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Could not create quilt raster blob'));
            return;
          }
          resolve(blob);
        },
        mimeType,
        mimeType === 'image/png' ? undefined : quality
      );
    });
  }

  /**
   * Classic 4:5 IG exports use a white card matte; reflection archive uses warm neutral (#f6f4f1).
   */
  async compositeImageUrlWithWarmNeutralMatte(imageUrl, matteHex = '#f6f4f1') {
    const url = String(imageUrl || '').trim();
    if (!url) return null;
    const matteMatch = /^#([0-9a-f]{6})$/i.exec(String(matteHex || '').trim());
    const mr = matteMatch ? parseInt(matteMatch[1].slice(0, 2), 16) : 246;
    const mg = matteMatch ? parseInt(matteMatch[1].slice(2, 4), 16) : 244;
    const mb = matteMatch ? parseInt(matteMatch[1].slice(4, 6), 16) : 241;
    const loadCandidates = [];
    const baseUrl =
      typeof globalThis.odqBackendBaseUrl === 'function'
        ? globalThis.odqBackendBaseUrl()
        : String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
    if (baseUrl && /^https?:\/\//i.test(url)) {
      loadCandidates.push(`${baseUrl}/api/proxy-image?url=${encodeURIComponent(url)}`);
    }
    loadCandidates.push(url);
    let img = null;
    let lastErr = null;
    for (const candidate of loadCandidates) {
      try {
        img = await new Promise((resolve, reject) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.referrerPolicy = 'no-referrer';
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error('Could not load quilt image for matte pass'));
          im.src = candidate;
        });
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!img) throw lastErr || new Error('Could not load quilt image for matte pass');
    const w = Math.max(1, img.naturalWidth || img.width);
    const h = Math.max(1, img.naturalHeight || img.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = matteHex;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const threshold = 240;
    const maxSat = 0.14;
    const imageData = ctx.getImageData(0, 0, w, h);
    const px = imageData.data;
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      if (a < 12) {
        px[i] = mr;
        px[i + 1] = mg;
        px[i + 2] = mb;
        px[i + 3] = 255;
        continue;
      }
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
      if (r >= threshold && g >= threshold && b >= threshold && sat <= maxSat) {
        px[i] = mr;
        px[i + 1] = mg;
        px[i + 2] = mb;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not build warm-neutral quilt image'))),
        'image/png',
        0.92
      );
    });
  }

  _firebaseStoragePathFromDownloadUrl(url) {
    try {
      const u = new URL(String(url || '').trim());
      const host = String(u.hostname || '').toLowerCase();
      if (
        !/(^|\.)firebasestorage\.googleapis\.com$/i.test(host) &&
        !/\.firebasestorage\.app$/i.test(host)
      ) {
        return '';
      }
      const match = u.pathname.match(/\/o\/(.+)$/);
      if (!match) return '';
      return decodeURIComponent(match[1]);
    } catch (_) {
      return '';
    }
  }

  _isFirebaseStorageDownloadUrl(url) {
    return !!this._firebaseStoragePathFromDownloadUrl(url);
  }

  /** Canvas-safe data URL via /api/proxy-image (never Firebase client getBlob — CORS + minute-long retries on web). */
  async _fetchFirebaseStorageImageAsDataUrl(downloadUrl, options = {}) {
    return this._prepareSpeakerImageUrlForCanvas(downloadUrl, options);
  }

  _normalizeProxyImageSource(url) {
    return typeof globalThis.odqNormalizeProxyImageSourceUrl === 'function'
      ? globalThis.odqNormalizeProxyImageSourceUrl(url)
      : String(url || '').trim();
  }

  /** Allow a later story-preview pass to retry after an early proxy miss (race with speaker card). */
  _forgetProxyImageFailure(url) {
    const source = this._normalizeProxyImageSource(url);
    if (!source || !this._proxyImageFailedUrls) return;
    this._proxyImageFailedUrls.delete(source);
    const storagePath = this._firebaseStoragePathFromDownloadUrl(source);
    if (storagePath) {
      this._proxyImageFailedUrls.delete(`firebase-storage:${storagePath}`);
    }
  }

  /**
   * Proxy remote speaker cutouts to data URLs so canvas compose can read pixels (CORS-safe).
   */
  async _prepareSpeakerImageUrlForCanvas(speakerImageUrl, options = {}) {
    if (!this._proxyImageDataUrlCache) this._proxyImageDataUrlCache = new Map();
    if (!this._proxyImageFailedUrls) this._proxyImageFailedUrls = new Set();
    if (!this._proxyImageInFlight) this._proxyImageInFlight = new Map();
    const proxyToDataUrl = async (url) => {
      const source = this._normalizeProxyImageSource(url);
      if (!source) return '';
      if (/^(?:data|blob):/i.test(source)) return source;
      if (!/^https?:\/\//i.test(source)) return source;
      if (options.retry === true) this._forgetProxyImageFailure(source);
      if (this._proxyImageFailedUrls.has(source)) return '';
      if (this._proxyImageDataUrlCache.has(source)) return this._proxyImageDataUrlCache.get(source);
      const storagePath = this._firebaseStoragePathFromDownloadUrl(source);
      if (storagePath) {
        const cacheKey = `firebase-storage:${storagePath}`;
        if (this._proxyImageDataUrlCache.has(cacheKey)) return this._proxyImageDataUrlCache.get(cacheKey);
      }
      const bases =
        typeof globalThis.odqProxyImageBases === 'function'
          ? globalThis.odqProxyImageBases()
          : [String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '')].filter(Boolean);
      if (this._proxyImageInFlight.has(source)) {
        return this._proxyImageInFlight.get(source);
      }
      const fetchPromise = (async () => {
        let lastStatus = 0;
        for (const baseUrl of bases) {
          if (!baseUrl) continue;
          try {
            const proxyUrl =
              typeof globalThis.odqProxyImageFetchUrl === 'function'
                ? globalThis.odqProxyImageFetchUrl(baseUrl, source)
                : `${baseUrl}/api/proxy-image?url=${encodeURIComponent(source)}`;
            const res = await fetch(proxyUrl, {
              cache: 'no-store'
            });
            if (!res.ok) {
              lastStatus = res.status;
              continue;
            }
            const blob = await res.blob();
            if (!String(blob.type || '').startsWith('image/')) {
              continue;
            }
            const dataUrl = await Utils.blobToDataUrl(blob);
            this._proxyImageDataUrlCache.set(source, dataUrl);
            if (storagePath) {
              this._proxyImageDataUrlCache.set(`firebase-storage:${storagePath}`, dataUrl);
            }
            return dataUrl;
          } catch (fetchErr) {
            lastStatus = lastStatus || 0;
          }
        }
        this._proxyImageFailedUrls.add(source);
        if (lastStatus) {
          this.logger?.warn?.(`Layout B speaker proxy failed (${lastStatus}):`, source.slice(0, 120));
        }
        return '';
      })();
      this._proxyImageInFlight.set(source, fetchPromise);
      try {
        return await fetchPromise;
      } finally {
        this._proxyImageInFlight.delete(source);
      }
    };
    let primary = String(speakerImageUrl || '').trim();
    let fallback = String(options.fallbackUrl || '').trim();
    const primaryIsStorageCutout = this._isFirebaseSpeakerCutoutUrl(primary);
    /**
     * Do not swap a resolved Storage cutout for portrait here — resolveLayoutBSpeakerCutoutUrl
     * already validated it. Re-checking portrait hash on phone often differs (assignment vs
     * catalog URL) and wrongly forces the full portrait → B/W rectangle on iOS.
     */
    if (
      !primaryIsStorageCutout &&
      primary &&
      fallback &&
      /speaker-cutouts(?:%2F|\/)/i.test(primary) &&
      typeof this._speakerCutoutSnapMatchesPortraitUrl === 'function'
    ) {
      const q = options.quote && typeof options.quote === 'object' ? options.quote : null;
      const source = String(
        q?.speakerCutoutSourceUrlSnapshot ??
          q?.speaker_cutout_source_url_snapshot ??
          q?.speakerCutoutSourceUrl ??
          q?.speaker_cutout_source_url ??
          ''
      ).trim();
      const trustedBySource = !!(source && source === fallback);
      if (
        !trustedBySource &&
        !(await this._speakerCutoutSnapMatchesPortraitUrl(primary, fallback))
      ) {
        primary = fallback;
        fallback = '';
      }
    }
    try {
      const dataUrl = await proxyToDataUrl(primary);
      if (dataUrl) return dataUrl;
    } catch (err) {
      this.logger.warn('Layout B speaker proxy failed:', err);
    }
    if (fallback && fallback !== primary) {
      try {
        const dataUrl = await proxyToDataUrl(fallback);
        if (dataUrl) return dataUrl;
      } catch (err) {
        this.logger.warn('Layout B speaker portrait fallback proxy failed:', err);
      }
    }
    return /^(?:data|blob):/i.test(primary) ? primary : '';
  }

  _isFirebaseSpeakerCutoutUrl(url) {
    return /speaker-cutouts(?:%2F|\/)/i.test(String(url || '').trim());
  }

  /**
   * Speaker URL for Layout B canvas compose (data: or blob: after proxy / Firebase SDK).
   * Prefers cutout; portrait fallback only when no Storage cutout was resolved.
   */
  async _speakerOverlayImageUrlForLayoutBCompose(speakerCutoutUrl, speakerPortraitUrl, quote = null) {
    const cutout = String(speakerCutoutUrl || '').trim();
    const portrait = String(speakerPortraitUrl || '').trim();
    const primary = cutout || portrait;
    if (!primary) return '';
    const hasResolvedStorageCutout = !!(cutout && this._isFirebaseSpeakerCutoutUrl(cutout));
    const prepared = await this._prepareSpeakerImageUrlForCanvas(primary, {
      fallbackUrl: hasResolvedStorageCutout ? '' : portrait && primary !== portrait ? portrait : '',
      quote
    });
    if (prepared) return prepared;
    if (!hasResolvedStorageCutout && portrait && portrait !== primary) {
      const portraitPrepared = await this._prepareSpeakerImageUrlForCanvas(portrait, { quote });
      if (portraitPrepared) return portraitPrepared;
    }
    return !hasResolvedStorageCutout && /^https?:\/\//i.test(primary) ? primary : '';
  }

  async _buildLayoutBPostComposeOptions(blocks, quoteObj, dateKey) {
    const dk = dateKey || Utils.getTodayKey();
    const q = await this._quoteForLayoutBSpeakerImage(quoteObj, dk);
    const quoteText = String(q.text ?? q.body ?? '').trim();
    const quoteAuthor = String(q.author ?? '').trim();
    let keywordEmphasis = odqKeywordEmphasisFromQuoteObject(q, dk);
    try {
      keywordEmphasis = (await odqReadLayoutBKeywordEmphasis(dk, 'post', q)) || keywordEmphasis;
    } catch (_) {
      /* optional */
    }
    let stripLayoutSeed = 0;
    try {
      stripLayoutSeed = await odqReadLayoutBStripLayoutSeed(dk, 'post');
    } catch (_) {
      stripLayoutSeed = odqGetCachedLayoutBStripLayoutSeed(dk, 'post') ?? 0;
    }
    const composeOptions = {
      quiltFit: 'cover',
      tuneAspect: 'post',
      keywordEmphasis: keywordEmphasis || undefined,
      keywordEmphasisExplicit: !!keywordEmphasis,
      stripLayoutSeed,
      stripLayoutSeedExplicit: true
    };
    return { quoteText, quoteAuthor, composeOptions, hasSpeaker: false };
  }

  _layoutBSpeakerPortraitUrlResolved(quote) {
    const q = quote && typeof quote === 'object' ? quote : {};
    let portrait = this._layoutBSpeakerPortraitUrl(q);
    const app = typeof window !== 'undefined' ? window.app : null;
    if (!portrait && app?.getQuoteSpeakerProfile) {
      portrait = String(app.getQuoteSpeakerProfile(q)?.portraitUrl || '').trim();
    }
    if (!portrait && app?.quoteService?._speakerPortraitFromQuoteAndAssignment) {
      portrait = String(app.quoteService._speakerPortraitFromQuoteAndAssignment(q) || '').trim();
    }
    if (portrait && /speaker-cutouts(?:%2F|\/)/i.test(portrait)) portrait = '';
    return portrait;
  }

  async _buildLayoutBStoryComposeOptions(blocks, quoteObj, dateKey, buildOptions = {}) {
    const previewFast = buildOptions.previewFast === true;
    const dk = dateKey || Utils.getTodayKey();
    const q = await this._quoteForLayoutBSpeakerImage(quoteObj, dk);
    const quoteText = String(q.text ?? q.body ?? '').trim();
    const quoteAuthor = String(q.author ?? '').trim();
    let keywordEmphasis = odqKeywordEmphasisFromQuoteObject(q, dk);
    if (previewFast) {
      keywordEmphasis =
        odqGetCachedLayoutBKeywordEmphasis(dk, 'story') || keywordEmphasis || null;
    } else {
      try {
        keywordEmphasis = (await odqReadLayoutBKeywordEmphasis(dk, 'story', q)) || keywordEmphasis;
      } catch (_) {
        /* optional */
      }
    }
    let stripLayoutSeed = 0;
    if (previewFast) {
      stripLayoutSeed = odqGetCachedLayoutBStripLayoutSeed(dk, 'story') ?? 0;
    } else {
      try {
        stripLayoutSeed = await odqReadLayoutBStripLayoutSeed(dk, 'story');
      } catch (_) {
        stripLayoutSeed = odqGetCachedLayoutBStripLayoutSeed(dk, 'story') ?? 0;
      }
    }
    const composeOptions = {
      tuneAspect: 'story',
      keywordEmphasis: keywordEmphasis || undefined,
      keywordEmphasisExplicit: !!keywordEmphasis,
      stripLayoutSeed,
      stripLayoutSeedExplicit: true
    };
    const speakerPortraitUrl = this._layoutBSpeakerPortraitUrlResolved(q);
    const speakerCutoutUrl = await this.resolveLayoutBSpeakerCutoutUrl(q, quoteAuthor);
    const preloadedSpeaker = String(buildOptions.preloadedSpeakerImageUrl || '').trim();
    let speakerImageForCanvas = preloadedSpeaker;
    if (!speakerImageForCanvas && (speakerCutoutUrl || speakerPortraitUrl)) {
      speakerImageForCanvas = await this._speakerOverlayImageUrlForLayoutBCompose(
        speakerCutoutUrl,
        speakerPortraitUrl,
        q
      );
    }
    if (speakerImageForCanvas) {
        const app = typeof window !== 'undefined' ? window.app : null;
        const profileName = app?.getQuoteSpeakerProfile?.(q)?.name || '';
        const speakerName = String(q.speakerName ?? q.speaker_name ?? profileName ?? quoteAuthor)
          .replace(/^\s*[—-]\s*/, '')
          .trim();
        const washColor = String(
          (typeof window !== 'undefined' && window.app?.getMostPopularQuiltColor?.(blocks)?.color) ||
            (typeof globalThis.CONFIG !== 'undefined' &&
              globalThis.CONFIG.APP &&
              globalThis.CONFIG.APP.defaultColor) ||
            '#ea9b9a'
        ).trim();
        let presetTransform = null;
        if (previewFast && typeof globalThis.odqReadSpeakerCutoutPreset === 'function') {
          const preset = globalThis.odqReadSpeakerCutoutPreset(dk, 'story');
          const nudge =
            typeof globalThis.odqReadSpeakerCutoutTweakFromLocal === 'function'
              ? globalThis.odqReadSpeakerCutoutTweakFromLocal(dk, 'story')
              : null;
          if (preset && typeof globalThis.odqSpeakerCutoutTransformResolved === 'function') {
            presetTransform = globalThis.odqSpeakerCutoutTransformResolved(preset, nudge);
          }
        } else {
          presetTransform = await odqSpeakerCutoutTransformForDateAsync(dk, 'story');
        }
        composeOptions.speakerOverlay = {
          enabled: true,
          imageUrl: speakerImageForCanvas,
          name: speakerName,
          washColor,
          transform: presetTransform || undefined
        };
        composeOptions.speakerCutoutQuote = q;
    }
    return { quoteText, quoteAuthor, composeOptions };
  }

  /**
   * Same pipeline as nightly `generateInstagramStoryLayoutBImage` (Zapier layout-b-story.png).
   * @returns {Promise<Blob|null>}
   */
  async generateInstagramStoryLayoutBBlob(blocks, quoteObj = null, dateKey = null, options = {}) {
    if (!blocks || blocks.length === 0) return null;
    const dk = dateKey || Utils.getTodayKey();
    const forPreview = options.forPreview === true;
    const fastPreview =
      forPreview &&
      (typeof globalThis.odqPreferFastLayoutBPreview === 'function'
        ? globalThis.odqPreferFastLayoutBPreview()
        : false);
    const quiltSourceOpts = {
      dateKey: dk,
      exportModeLabel: forPreview ? 'layout_b_story_9x16_preview' : 'layout_b_story_9x16_source'
    };
    if (forPreview) {
      const defaultEdge = fastPreview ? 720 : 1200;
      quiltSourceOpts.maxEdge = Math.min(2400, Math.max(512, Number(options.maxEdge) || defaultEdge));
      if (fastPreview) quiltSourceOpts.imageSmoothingQuality = 'low';
    }
    const buildOpts = forPreview
      ? {
          previewFast: true,
          preloadedSpeakerImageUrl: String(options.preloadedSpeakerImageUrl || '').trim()
        }
      : {};
    const [{ quoteText, quoteAuthor, composeOptions }, highResBlob] = await Promise.all([
      this._buildLayoutBStoryComposeOptions(blocks, quoteObj, dk, buildOpts),
      this.getInstagramQuiltSourceBlob(blocks, quiltSourceOpts)
    ]);
    if (!highResBlob) return null;
    const compose = globalThis.composeInstagramLayoutBFromQuiltBlob;
    if (typeof compose !== 'function') {
      throw new Error('composeInstagramLayoutBFromQuiltBlob missing (app module must finish loading)');
    }
    if (typeof globalThis.ensureOdqCanvasFontsReady === 'function') {
      await globalThis.ensureOdqCanvasFontsReady();
    }
    /** Layout B typography uses fixed px tuned for 1080×1920 — never compose smaller. */
    return compose(highResBlob, quoteText, quoteAuthor, 1080, 1920, dk, composeOptions);
  }

  async _generateInstagramStoryLayoutBImageData(blocks, quoteObj, dateKey) {
    const storyBlob = await this.generateInstagramStoryLayoutBBlob(blocks, quoteObj, dateKey);
    if (!storyBlob) return null;
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result || null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(storyBlob);
    });
  }

  /**
   * Instagram story (9:16, 1080×1920): Layout B collage (speaker cutout when available).
   */
  async generateInstagramStoryLayoutBImage(blocks, quoteObj = null, dateKey = null) {
    try {
      return await this._generateInstagramStoryLayoutBImageData(blocks, quoteObj, dateKey);
    } catch (error) {
      this.logger.error('Instagram story layout B generation failed:', error);
      return null;
    }
  }

  async generateInstagramPostLayoutBBlob(blocks, quoteObj = null, dateKey = null, { requireSpeaker = false } = {}) {
    if (!blocks || blocks.length === 0) return null;
    const dk = dateKey || Utils.getTodayKey();
    const { quoteText, quoteAuthor, composeOptions, hasSpeaker } =
      await this._buildLayoutBPostComposeOptions(blocks, quoteObj, dk);
    if (requireSpeaker && !hasSpeaker) return null;

    const highResBlob = await this.getInstagramQuiltSourceBlob(blocks, {
      dateKey: dk,
      exportModeLabel: 'layout_b_post_9x16_cover_source'
    });
    if (!highResBlob) return null;

    const compose = globalThis.composeInstagramLayoutBFromQuiltBlob;
    if (typeof compose !== 'function') {
      throw new Error('composeInstagramLayoutBFromQuiltBlob missing (app module must finish loading)');
    }
    return compose(
      highResBlob,
      quoteText,
      quoteAuthor,
      1080,
      1350,
      dk,
      composeOptions
    );
  }

  async _generateInstagramPostLayoutBImageData(blocks, quoteObj, dateKey, { requireSpeaker = false } = {}) {
    const postBlob = await this.generateInstagramPostLayoutBBlob(blocks, quoteObj, dateKey, {
      requireSpeaker
    });
    if (!postBlob) return null;
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result || null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(postBlob);
    });
  }

  /**
   * Instagram feed post (4:5, 1080×1350): Layout B quilt + centered quote strips (no speaker cutout).
   */
  async generateInstagramPostLayoutBImage(blocks, quoteObj = null, dateKey = null) {
    try {
      return await this._generateInstagramPostLayoutBImageData(blocks, quoteObj, dateKey);
    } catch (error) {
      this.logger.error('Instagram post layout B generation failed:', error);
      return null;
    }
  }

  /**
   * Catalog/assignment-aware speaker URL for Layout B (transparent cutout before portrait).
   * Matches exit chamber + `getQuoteSpeakerProfile`.
   */
  _layoutBSpeakerPortraitUrl(quote) {
    const q = quote && typeof quote === 'object' ? quote : {};
    const candidates = [
      q.speakerImageUrlSnapshot,
      q.speaker_image_url_snapshot,
      q.speakerImageUrl,
      q.speaker_image_url,
      q.speakerImage,
      q.speaker_image
    ];
    for (const value of candidates) {
      const url = String(value ?? '').trim();
      if (!url) continue;
      if (/speaker-cutouts(?:%2F|\/)/i.test(url)) continue;
      return url;
    }
    return '';
  }

  _speakerStorageSlug(speakerName) {
    return (
      String(speakerName || 'speaker')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'speaker'
    );
  }

  async _ensureFirebaseStorageReady() {
    if (window.firebaseStorage) return window.firebaseStorage;
    if (!window.firebaseApp) return null;
    try {
      const { getStorage } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
      window.firebaseStorage = getStorage(window.firebaseApp);
      return window.firebaseStorage;
    } catch (_) {
      return null;
    }
  }

  /** Resolve cutout download URL from Storage path when Firestore snapshot is stale. */
  async resolveSpeakerCutoutFromStorage(portraitUrl, speakerName) {
    const portrait = String(portraitUrl || '').trim();
    if (!portrait) return '';
    const hash = await this._portraitUrlHash12(portrait);
    if (!hash) return '';
    const cacheKey = `${this._speakerStorageSlug(speakerName)}:${hash}`;
    if (!this._speakerCutoutStorageUrlCache) this._speakerCutoutStorageUrlCache = new Map();
    if (this._speakerCutoutStorageUrlCache.has(cacheKey)) {
      return this._speakerCutoutStorageUrlCache.get(cacheKey);
    }
    const storage = await this._ensureFirebaseStorageReady();
    if (!storage) return '';
    const slug = this._speakerStorageSlug(speakerName);
    const paths = [
      `speaker-cutouts/${slug}-${hash}.png`,
      `speaker-cutouts/${slug}-${hash}-manual.png`,
      `speaker-cutouts/${slug}-${hash}-crop10.png`
    ];
    try {
      const { ref, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
      for (const storagePath of paths) {
        try {
          const url = await getDownloadURL(ref(storage, storagePath));
          this._speakerCutoutStorageUrlCache.set(cacheKey, url);
          return url;
        } catch (_) {
          /* try next suffix */
        }
      }
    } catch (_) {
      /* storage SDK unavailable */
    }
    this._speakerCutoutStorageUrlCache.set(cacheKey, '');
    return '';
  }

  async _portraitUrlHash12(portraitUrl) {
    const portrait = String(portraitUrl || '').trim();
    if (!portrait) return '';
    if (!this._portraitUrlHashCache) this._portraitUrlHashCache = new Map();
    if (this._portraitUrlHashCache.has(portrait)) return this._portraitUrlHashCache.get(portrait);
    const promise = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(portrait))
      .then((buf) =>
        Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          .slice(0, 12)
      )
      .catch(() => '');
    this._portraitUrlHashCache.set(portrait, promise);
    return promise;
  }

  async _speakerCutoutSnapMatchesPortraitUrl(cutoutUrl, portraitUrl) {
    const cutout = String(cutoutUrl || '').trim();
    const portrait = String(portraitUrl || '').trim();
    if (!cutout || !portrait) return false;
    if (!/speaker-cutouts(?:%2F|\/)/i.test(cutout)) return true;
    const hash = await this._portraitUrlHash12(portrait);
    if (!hash) return false;
    return cutout.includes(`-${hash}.`) || cutout.includes(`-${hash}-`);
  }

  /** Pick portrait vs Storage cutout for on-screen display (avoids proxying deleted cutouts). */
  async resolveSpeakerDisplayUrl({ portraitUrl, cutoutUrl, cutoutSnap, speakerName } = {}) {
    let portrait = String(portraitUrl || '').trim();
    if (/speaker-cutouts(?:%2F|\/)/i.test(portrait)) portrait = '';
    const cutout = String(cutoutUrl || cutoutSnap || '').trim();
    if (!portrait && !cutout) return '';
    if (!cutout) return portrait;
    if (!/speaker-cutouts(?:%2F|\/)/i.test(cutout)) return cutout;
    if (!portrait) return cutout;
    if (await this._speakerCutoutSnapMatchesPortraitUrl(cutout, portrait)) {
      return cutout;
    }
    const storageCutout = await this.resolveSpeakerCutoutFromStorage(portrait, speakerName);
    return storageCutout || portrait;
  }

  async resolveLayoutBSpeakerCutoutUrl(quote, fallbackName = '') {
    const q = quote && typeof quote === 'object' ? quote : {};
    const snap = String(q.speakerCutoutUrlSnapshot ?? q.speaker_cutout_url_snapshot ?? '').trim();
    const portrait = this._layoutBSpeakerPortraitUrlResolved(q);
    if (!portrait) {
      return snap && this._isFirebaseSpeakerCutoutUrl(snap) ? snap : '';
    }
    if (snap && (await this._speakerCutoutSnapMatchesPortraitUrl(snap, portrait))) return snap;
    const app = typeof window !== 'undefined' ? window.app : null;
    const qs = app?.quoteService;
    const resolved = qs ? String(qs._resolveSpeakerCutoutForQuote(q) || '').trim() : '';
    if (resolved && (await this._speakerCutoutSnapMatchesPortraitUrl(resolved, portrait))) return resolved;
    const name = String(q.speakerName ?? q.speaker_name ?? fallbackName ?? q.author ?? '')
      .replace(/^\s*[—-]\s*/, '')
      .trim();
    return await this.resolveSpeakerCutoutFromStorage(portrait, name);
  }

  _resolveLayoutBSpeakerImageUrl(quote) {
    const q = quote && typeof quote === 'object' ? quote : {};
    const portrait = this._layoutBSpeakerPortraitUrl(q);
    const cutoutSnap = String(q.speakerCutoutUrlSnapshot || q.speaker_cutout_url_snapshot || '').trim();
    if (!cutoutSnap) return portrait;
    const app = typeof window !== 'undefined' ? window.app : null;
    const qs = app?.quoteService;
    if (qs && typeof qs._resolveSpeakerCutoutForQuote === 'function') {
      const cutout = String(qs._resolveSpeakerCutoutForQuote(q) || '').trim();
      if (cutout) return cutout;
    }
    if (app && typeof app.getQuoteSpeakerProfile === 'function') {
      const profile = app.getQuoteSpeakerProfile(q);
      if (profile?.imageUrl) return String(profile.imageUrl).trim();
    }
    return portrait;
  }

  /** Pinned/catalog quote for a date — same path as Zapier caption + nightly IG job. */
  async _quoteForLayoutBSpeakerImage(quoteObj, dateKey) {
    const dk = dateKey || Utils.getTodayKey();
    const qs = typeof window !== 'undefined' ? window.app?.quoteService : null;
    if (qs && typeof qs.getQuoteResolvedForInstagramDateKey === 'function') {
      try {
        const resolved = await qs.getQuoteResolvedForInstagramDateKey(dk);
        if (resolved) return resolved;
      } catch (e) {
        this.logger.warn('Layout B speaker quote resolve failed:', e);
      }
    }
    if (quoteObj && typeof quoteObj === 'object') return quoteObj;
    if (qs && typeof qs.getTodayQuote === 'function') {
      const today = qs.getTodayQuote();
      if (today) return today;
    }
    return { text: '', author: '' };
  }

  /**
   * Instagram feed post variant that requires a speaker cutout (uploaded as layout-b-speaker.png).
   */
  async generateInstagramPostLayoutBSpeakerImage(blocks, quoteObj = null, dateKey = null) {
    try {
      return await this._generateInstagramPostLayoutBImageData(blocks, quoteObj, dateKey, {
        requireSpeaker: true
      });
    } catch (error) {
      this.logger.error('Instagram post layout B speaker generation failed:', error);
      return null;
    }
  }

  // Delete archive entry
  async deleteArchive(date) {
    try {
      // Delete from Firestore if available
      // if (window.db && window.firestore) {
      //   const archiveRef = window.firestore.doc(window.db, 'archives', date);
      //   await window.firestore.deleteDoc(archiveRef);
      //   this.logger.log(`🗑️ Archive deleted from Firestore: ${date}`);
      // }
      
      // Remove from local cache
      this.archives.delete(date);
      this.logger.log(`🗑️ Archive removed from local cache: ${date}`);
      
    } catch (error) {
      this.logger.error('Failed to delete archive:', error);
      throw error;
    }
  }

  // Generate thumbnail from SVG
  async generateThumbnail(svgElement) {
    try {
      if (!svgElement) {
        svgElement = document.getElementById('quilt');
      }
      
      if (!svgElement) {
        this.logger.warn('No SVG element found for thumbnail generation');
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIiBmaWxsPSIjZjZmNGYxIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMjAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiI+Tm8gUXVpbHQ8L3RleHQ+Cjwvc3ZnPg==';
      }

      // SAFEGUARD: Check if SVG has content
      if (!svgElement.children || svgElement.children.length === 0) {
        this.logger.warn('SVG element has no children - using fallback thumbnail');
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIiBmaWxsPSIjZjZmNGYxIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMjAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiI+RW1wdHkgUXVpbHQ8L3RleHQ+Cjwvc3ZnPg==';
      }

      // Clone SVG to avoid modifying original
      const svgClone = svgElement.cloneNode(true);
      
      // Get SVG dimensions
      const svgRect = svgElement.getBoundingClientRect();
      const width = Math.max(400, svgRect.width);
      const height = Math.max(400, svgRect.height);
      
      // Ensure SVG has proper attributes
      svgClone.setAttribute('width', width);
      svgClone.setAttribute('height', height);
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      
      // Convert SVG to string
      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      
      // Create canvas for conversion
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = width;
      canvas.height = height;
      
      // Create image from SVG
      const img = new Image();
      const url = URL.createObjectURL(svgBlob);
      
      return new Promise((resolve) => {
        img.onload = () => {
          // Draw to canvas
          ctx.fillStyle = '#f6f4f1'; // Background color
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to data URL
          const dataURL = canvas.toDataURL('image/png', 0.8);
          URL.revokeObjectURL(url);
          
          this.logger.log(`✅ Generated thumbnail: ${width}x${height}`);
          resolve(dataURL);
        };
        
        img.onerror = () => {
          URL.revokeObjectURL(url);
          this.logger.error('Failed to generate thumbnail');
          resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIiBmaWxsPSIjZjZmNGYxIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMjAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiI+RXJyb3I8L3RleHQ+Cjwvc3ZnPg==');
        };
        
        img.src = url;
      });
      
    } catch (error) {
      this.logger.error('Thumbnail generation failed:', error);
      return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIiBmaWxsPSIjZjZmNGYxIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMjAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiI+RXJyb3I8L3RleHQ+Cjwvc3ZnPg==';
    }
  }

  // Generate full quilt image from blocks data
  async generateFullQuiltImage(blocks) {
    try {
      if (!blocks || blocks.length === 0) {
        this.logger.warn('No blocks provided for full quilt image generation');
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDgwMCA2MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIiBmaWxsPSIjZjZmNGYxIi8+Cjx0ZXh0IHg9IjQwMCIgeT0iMzAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCI+Tm8gUXVpbHQ8L3RleHQ+Cjwvc3ZnPg==';
      }

      // Calculate quilt bounds
      const minX = Math.min(...blocks.map(b => b.x));
      const minY = Math.min(...blocks.map(b => b.y));
      const maxX = Math.max(...blocks.map(b => b.x + b.width));
      const maxY = Math.max(...blocks.map(b => b.y + b.height));
      
      const quiltWidth = maxX - minX;
      const quiltHeight = maxY - minY;
      
      // Create canvas for full quilt image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size (tall and narrow like the quilt)
      canvas.width = 800;
      canvas.height = 1200;
      
      // Fill background
      ctx.fillStyle = '#f6f4f1';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Calculate scale to fit quilt in canvas
      const scaleX = canvas.width / quiltWidth;
      const scaleY = canvas.height / quiltHeight;
      const scale = Math.min(scaleX, scaleY, 1) * 1.2; // 20% larger to reduce white space
      
      // Center the quilt
      const offsetX = (canvas.width - quiltWidth * scale) / 2;
      const offsetY = (canvas.height - quiltHeight * scale) / 2;
      
      // Draw each block
      blocks.forEach(block => {
        SimpleQuiltEngine.ensureInsetClassificationFromGeometry(block);
        // Add jitter effects (same as current quilt)
        const jitterX = (Math.random() - 0.5) * 6;
        const jitterY = (Math.random() - 0.5) * 6;
        const jitterRotation = (Math.random() - 0.5) * 3;
        
        const jitteredX = block.x + jitterX;
        const jitteredY = block.y + jitterY;
        
        // Transform to canvas coordinates
        const canvasX = offsetX + (jitteredX - minX) * scale;
        const canvasY = offsetY + (jitteredY - minY) * scale;
        const canvasWidth = block.width * scale;
        const canvasHeight = block.height * scale;
        
        const isHst = block.patternType === 'special' && block.specialPatternType === 'hst';
        if (isHst) {
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
          ctx.shadowBlur = 3;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 4;
          const tris = Utils.getHstOrganicRenderTriangles(block, 1);
          const centerX = canvasX + canvasWidth / 2;
          const centerY = canvasY + canvasHeight / 2;
          const bw = Math.max(1e-6, block.width);
          const bh = Math.max(1e-6, block.height);
          const cw = canvasWidth;
          const ch = canvasHeight;
          ctx.translate(centerX, centerY);
          ctx.rotate((jitterRotation * Math.PI) / 180);
          const x0 = -cw / 2;
          const y0 = -ch / 2;
          tris.forEach((t, tux) => {
            const pts = t.points || [];
            if (pts.length < 3) return;
            ctx.fillStyle = t.color || block.color;
            ctx.beginPath();
            ctx.moveTo(x0 + (pts[0][0] / bw) * cw, y0 + (pts[0][1] / bh) * ch);
            for (let k = 1; k < pts.length; k++) {
              ctx.lineTo(x0 + (pts[k][0] / bw) * cw, y0 + (pts[k][1] / bh) * ch);
            }
            ctx.closePath();
            ctx.fill();
            const anch = Utils.hstOrganicTriangleRadialAnchorLocal(pts);
            if (!anch) return;
            const tcx = x0 + (anch.cx / bw) * cw;
            const tcy = y0 + (anch.cy / bh) * ch;
            const spanPx = Math.max((anch.span / bw) * cw, (anch.span / bh) * ch, 1e-6);
            const washHx = /^#[0-9a-f]{6}$/i.test(String(t.color || '').trim())
              ? String(t.color).trim()
              : /^#[0-9a-f]{6}$/i.test(String(block.color || '').trim())
                ? String(block.color).trim()
                : '#c8c4bf';
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x0 + (pts[0][0] / bw) * cw, y0 + (pts[0][1] / bh) * ch);
            for (let k = 1; k < pts.length; k++) {
              ctx.lineTo(x0 + (pts[k][0] / bw) * cw, y0 + (pts[k][1] / bh) * ch);
            }
            ctx.closePath();
            ctx.clip();
            Utils.canvasWatercolorWashAxisAlignedRect(
              ctx,
              x0,
              y0,
              cw,
              ch,
              washHx,
              `${block.id || 'blk'}|fullquilt|${tux}`,
              { radial: { cx: tcx, cy: tcy, span: spanPx }, skipClip: true }
            );
            ctx.restore();
          });
          ctx.restore();
          return;
        }

        const isInset = block.patternType === 'special' && block.specialPatternType === 'insetCircle';
        if (isInset) {
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
          ctx.shadowBlur = 3;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 4;
          const centerX = canvasX + canvasWidth / 2;
          const centerY = canvasY + canvasHeight / 2;
          const bw = Math.max(1e-6, block.width);
          const bh = Math.max(1e-6, block.height);
          const cw = canvasWidth;
          const ch = canvasHeight;
          ctx.translate(centerX, centerY);
          ctx.rotate((jitterRotation * Math.PI) / 180);
          const x0 = -cw / 2;
          const y0 = -ch / 2;
          Utils.fillInsetCircleBlockCanvasCtx(ctx, block, x0, y0, cw, ch);
          ctx.restore();
          return;
        }

        // Save context for rotation
        ctx.save();
        
        // Move to center of block for rotation
        const centerX = canvasX + canvasWidth / 2;
        const centerY = canvasY + canvasHeight / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(jitterRotation * Math.PI / 180);
        
        // Draw block with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 4;
        
        ctx.fillStyle = block.color;
        ctx.fillRect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
        
        // Restore context
        ctx.restore();
      });
      
      // Convert to data URL
      const dataURL = canvas.toDataURL('image/png', 0.9);
      
      this.logger.log(`✅ Generated full quilt image: 800x1200`);
      return dataURL;
      
    } catch (error) {
      this.logger.error('Full quilt image generation failed:', error);
      return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDgwMCA2MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIiBmaWxsPSIjZjZmNGYxIi8+Cjx0ZXh0IHg9IjQwMCIgeT0iMzAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCI+RXJyb3I8L3RleHQ+Cjwvc3ZnPg==';
    }
  }

  // Load more archives (for "Load More" button)
  async loadMore() {
    if (this.isLoading) return null;
    
    this.isLoading = true;
    this.currentPage++;
    
    try {
      const result = await this.getArchives(this.currentPage);
      this.isLoading = false;
      return result;
    } catch (error) {
      this.isLoading = false;
      this.logger.error('Failed to load more archives:', error);
      return null;
    }
  }

}

  root.ArchiveService = ArchiveService;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
