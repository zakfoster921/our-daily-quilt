/**
 * Firestore/localStorage quilt load and save. Loaded before the main app module.
 * Exposes globalThis.QuiltDataService. Depends on Utils, LiveDailyDataSync, CONFIG at runtime.
 */
(function (root) {
  'use strict';

class QuiltDataService {
  constructor(logger, errorHandler) {
    this.logger = logger;
    this.errorHandler = errorHandler;
    this.db = null;
    this.quiltDoc = null;
  }

  async initialize() {
    try {
      // Wait for Firebase to be available
      console.log('🔄 DataService: Waiting for Firebase...');
      
      // First try to wait for the firebaseReady event
      await new Promise((resolve) => {
        if (window.db) {
          resolve();
          return;
        }
        
        const timeout = setTimeout(() => {
          document.removeEventListener('firebaseReady', onFirebaseReady);
          resolve();
        }, 1200); // keep launch responsive; continue with fallback if Firebase is slow
        
        const onFirebaseReady = () => {
          clearTimeout(timeout);
          document.removeEventListener('firebaseReady', onFirebaseReady);
          resolve();
        };
        
        document.addEventListener('firebaseReady', onFirebaseReady);
      });
      
      // Fallback: wait with polling
      let attempts = 0;
      while (!window.db && attempts < 8) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (attempts % 4 === 0) {
          console.log(`🔄 DataService: Still waiting for Firebase... (attempt ${attempts}/8)`);
        }
      }
      
      if (window.db) {
        this.db = window.db;
        this.logger.log('✅ Firestore initialized successfully');
      } else {
        this.logger.warn('⚠️ Firestore not available, falling back to localStorage');
        this.db = null;
      }
    } catch (error) {
      this.logger.warn('⚠️ Firestore initialization failed, falling back to localStorage:', error);
      this.db = null;
    }
  }

  /**
   * Server-only quilt read for live daily gate. Missing doc = confirmed empty day (not a synthetic default).
   */
  async loadQuiltFromServer(todayKey = Utils.getTodayKey()) {
    const withTimeout = (promise, ms, label) => LiveDailyDataSync.withTimeout(promise, ms, label);
    const emptyPayload = () => {
      const dimensions = Utils.getQuiltDimensions();
      const starterHex = (typeof CONFIG !== 'undefined' && CONFIG.APP && CONFIG.APP.defaultColor) || '#ea9b9a';
      return {
        dateKey: todayKey,
        date: todayKey,
        blocks: [{ x: 0, y: 0, width: dimensions.width, height: dimensions.height, color: starterHex }],
        contributorCount: 1,
        colorReplayEvents: [],
        contributors: [],
        macroStructureFrozen: false,
        serverConfirmedEmpty: true
      };
    };
    try {
      if (!window.db || !window.firestore) {
        return { ok: false, reason: 'firebase_unavailable' };
      }
      const getFromServer = window.firestore.getDocFromServer;
      if (typeof getFromServer !== 'function') {
        return { ok: false, reason: 'firestore_server_read_unavailable' };
      }
      const quiltRef = window.firestore.doc(window.db, 'quilts', todayKey);
      const quiltSnap = await withTimeout(getFromServer(quiltRef), 12000, 'Firestore quilt read (server)');
      if (!quiltSnap.exists()) {
        this.logger.log('📖 Server confirmed no quilt doc for', todayKey, '— empty day');
        return { ok: true, data: emptyPayload() };
      }
      const data = quiltSnap.data();
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      if (blocks.length === 0) {
        return { ok: true, data: emptyPayload() };
      }
      return {
        ok: true,
        data: {
          dateKey: todayKey,
          date: data.date || todayKey,
          blocks,
          contributorCount: data.contributorCount || 1,
          colorReplayEvents: Array.isArray(data.colorReplayEvents) ? data.colorReplayEvents : [],
          contributors: Array.isArray(data.contributors) ? data.contributors : [],
          macroStructureFrozen: data.macroStructureFrozen === true
        }
      };
    } catch (error) {
      this.logger.warn('⚠️ loadQuiltFromServer failed:', error?.message || error);
      return { ok: false, reason: 'quilt_server_read_failed', error };
    }
  }

  async loadQuilt() {
    const todayKey = Utils.getTodayKey();
    const readLocalQuilt = () => {
      const savedData = localStorage.getItem('ourDailyQuilt');
      if (!savedData) {
        this.logger.warn('⚠️ No localStorage data found');
        return null;
      }
      const data = JSON.parse(savedData);
      const savedDate = String(data.date || '').trim();
      if (savedDate && savedDate !== todayKey) {
        this.logger.warn(`⚠️ Ignoring stale localStorage quilt for ${savedDate}; today is ${todayKey}`);
        return {
          dateKey: todayKey,
          date: todayKey,
          blocks: [],
          contributorCount: 1,
          colorReplayEvents: [],
          contributors: [],
          macroStructureFrozen: false
        };
      }
      this.logger.log('📖 Loaded quilt from localStorage with', data.blocks?.length || 0, 'blocks, date:', data.date);
      return {
        dateKey: todayKey,
        date: savedDate || todayKey,
        blocks: data.blocks || [],
        contributorCount: data.contributorCount || 1,
        colorReplayEvents: Array.isArray(data.colorReplayEvents) ? data.colorReplayEvents : [],
        contributors: Array.isArray(data.contributors) ? data.contributors : [],
        macroStructureFrozen: data.macroStructureFrozen === true
      };
    };
    const withTimeout = (promise, ms, label) => {
      let timer = null;
      return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        })
      ]);
    };
    try {
      if (this.db) {
        this.logger.log('🔍 Looking for quilt in Firestore with date key:', todayKey);
        // Single-doc read only — listing the whole `quilts` collection was very slow at startup.
        const quiltRef = window.firestore.doc(this.db, 'quilts', todayKey);
        const getCached = window.firestore.getDoc;
        const getFromServer = window.firestore.getDocFromServer;
        let quiltSnap = null;
        let firestoreReadSource = '';
        // Server first: `getDoc` can return a stale local snapshot before the network catches up,
        // which mis-paints the portal join line and quilt on cold open.
        if (typeof getFromServer === 'function') {
          try {
            quiltSnap = await withTimeout(getFromServer(quiltRef), 10000, 'Firestore quilt read (server)');
            firestoreReadSource = 'server';
          } catch (e) {
            this.logger.warn('⚠️ Firestore server quilt read failed:', e && e.message ? e.message : e);
          }
        }
        if (!quiltSnap && typeof getCached === 'function') {
          try {
            quiltSnap = await withTimeout(getCached(quiltRef), 5000, 'Firestore quilt read (cache)');
            firestoreReadSource = firestoreReadSource || 'cache';
          } catch (e) {
            this.logger.warn('⚠️ Firestore cache quilt read failed:', e && e.message ? e.message : e);
          }
        }
        if (quiltSnap && quiltSnap.exists()) {
          const data = quiltSnap.data();
          this.logger.log(
            '📖 Loaded quilt from Firestore (' + (firestoreReadSource || 'firestore') + ') with',
            data.blocks?.length || 0,
            'blocks'
          );
          return {
            dateKey: todayKey,
            date: data.date || todayKey,
            blocks: data.blocks || [],
            contributorCount: data.contributorCount || 1,
            colorReplayEvents: Array.isArray(data.colorReplayEvents) ? data.colorReplayEvents : [],
            contributors: Array.isArray(data.contributors) ? data.contributors : [],
            macroStructureFrozen: data.macroStructureFrozen === true
          };
        }
        this.logger.warn('⚠️ No Firestore document found for date:', todayKey);
      }
      
      // Fallback to localStorage
      const localQuilt = readLocalQuilt();
      if (localQuilt) return localQuilt;
    } catch (error) {
      this.logger.warn('⚠️ Error loading quilt, trying local fallback:', error);
      try {
        const localQuilt = readLocalQuilt();
        if (localQuilt) return localQuilt;
      } catch (localError) {
        this.logger.warn('⚠️ Local quilt fallback failed:', localError);
      }
    }
    
    // Default quilt
    const dimensions = Utils.getQuiltDimensions();
    this.logger.log('📖 Using default quilt');
    const starterHex =
      typeof SimpleQuiltEngine !== 'undefined' && typeof SimpleQuiltEngine.pickStarterFieldColorHex === 'function'
        ? SimpleQuiltEngine.pickStarterFieldColorHex()
        : (typeof CONFIG !== 'undefined' && CONFIG.APP && CONFIG.APP.defaultColor) || '#ea9b9a';
    return { 
      dateKey: todayKey,
      date: todayKey,
      blocks: [{ x: 0, y: 0, width: dimensions.width, height: dimensions.height, color: starterHex }], 
      contributorCount: 1,
      colorReplayEvents: [],
      contributors: [],
      macroStructureFrozen: false
    };
  }

  // Optional saveOptions.resetSource 'admin' | 'daily' → sets lastResetAt / lastResetSource on quilts/{date}.
  async saveQuilt(blocks, contributorCount, colorReplayEvents = [], contributorsOrOptions = [], saveOptions = null) {
    let fallbackOptions = null;
    let fallbackWriteReason = 'client-save';
    let fallbackContributors = [];
    const normalizeContributors = (items) => {
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
    };
    const buildLocalStoragePayload = (payload, opts = {}) => {
      const out = { ...payload };
      if (opts.omitReplay === true) out.colorReplayEvents = [];
      if (opts.omitContributors === true) out.contributors = [];
      if (opts.sparseMacroMetadata === true && Array.isArray(out.blocks)) {
        const seenMacroIds = new Set();
        out.blocks = out.blocks.map((block) => {
          if (!block || block.macroRegionId == null) return block;
          const clone = { ...block };
          const key = String(block.macroRegionId);
          if (seenMacroIds.has(key)) {
            delete clone.macroFrozenOutline;
            delete clone.macroFrozenColor;
          } else {
            seenMacroIds.add(key);
          }
          return clone;
        });
      }
      if (opts.compactBlocks === true && Array.isArray(out.blocks)) {
        const round = (value) => {
          const n = Number(value);
          return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : value;
        };
        const normalizeBounds = (bounds) => {
          if (!bounds || typeof bounds !== 'object') return undefined;
          const x = Number(bounds.x);
          const y = Number(bounds.y);
          const width = Number(bounds.width);
          const height = Number(bounds.height);
          if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
            return { x: round(x), y: round(y), width: round(width), height: round(height) };
          }
          return undefined;
        };
        out.blocks = out.blocks.map((block) => {
          if (!block || typeof block !== 'object') return block;
          const compact = {
            id: block.id,
            x: round(block.x),
            y: round(block.y),
            width: round(block.width),
            height: round(block.height),
            color: block.color,
            contributorId: block.contributorId,
            submissionIndex: block.submissionIndex,
            visualLayerIndex: block.visualLayerIndex,
            protectedAnchorId: block.protectedAnchorId,
            protectedAnchorRootId: block.protectedAnchorRootId,
            patternType: block.patternType,
            specialPatternType: block.specialPatternType,
            originalPatternId: block.originalPatternId,
            backsideRestoreId: block.backsideRestoreId,
            backsideRestoreBounds: normalizeBounds(block.backsideRestoreBounds),
            backsideRestoreColor: block.backsideRestoreColor,
            specialOriginalBounds: normalizeBounds(block.specialOriginalBounds),
            specialOriginalColor: block.specialOriginalColor,
            specialOriginalInnerColor: block.specialOriginalInnerColor,
            specialOriginalInsetR:
              typeof block.specialOriginalInsetR === 'number' && Number.isFinite(block.specialOriginalInsetR)
                ? block.specialOriginalInsetR
                : undefined,
            starterAxisRegion: block.starterAxisRegion === true ? true : undefined,
            starterAxisRegionId: block.starterAxisRegionId,
            hstColorB: block.hstColorB,
            hstDiagonal: block.hstDiagonal,
            hstTriangles: block.hstTriangles,
            polygonPieces: block.polygonPieces,
            diagonalAxisAccentColor: block.diagonalAxisAccentColor,
            diagonalAxisUx: block.diagonalAxisUx,
            diagonalAxisUy: block.diagonalAxisUy,
            axisLayerMode: block.axisLayerMode,
            axisOriginId: block.axisOriginId,
            axisSourceBlockId: block.axisSourceBlockId,
            axisSourceSubmissionIndex: block.axisSourceSubmissionIndex,
            insetTier: block.insetTier,
            insetInnerColor: block.insetInnerColor,
            insetCx: block.insetCx,
            insetCy: block.insetCy,
            insetR: block.insetR,
            insetNextCutVertical: block.insetNextCutVertical,
            macroRegionId: block.macroRegionId,
            macroFrozenColor: block.macroFrozenColor,
            macroVisibleFlattened: block.macroVisibleFlattened === true ? true : undefined,
            macroOriginalBounds: block.macroOriginalBounds
          };
          Object.keys(compact).forEach((key) => {
            if (compact[key] === undefined) delete compact[key];
          });
          return compact;
        });
      }
      return out;
    };
    const saveLocalQuiltBackup = (payload, label) => {
      const attempts = [
        { payload, note: 'full' },
        { payload: buildLocalStoragePayload(payload, { omitReplay: true }), note: 'without replay log' },
        {
          payload: buildLocalStoragePayload(payload, { omitReplay: true, sparseMacroMetadata: true }),
          note: 'without replay log and with sparse macro metadata'
        },
        {
          payload: buildLocalStoragePayload(payload, {
            omitReplay: true,
            omitContributors: true,
            sparseMacroMetadata: true,
            compactBlocks: true
          }),
          note: 'compact blocks only'
        }
      ];
      let lastError = null;
      for (const attempt of attempts) {
        try {
          localStorage.removeItem('ourDailyQuilt');
          localStorage.setItem('ourDailyQuilt', JSON.stringify(attempt.payload));
          if (attempt.note !== 'full') {
            console.warn(`⚠️ Saved compact localStorage quilt backup (${attempt.note}) after quota limit during ${label}.`);
          }
          return true;
        } catch (storageError) {
          lastError = storageError;
          if (storageError?.name !== 'QuotaExceededError') throw storageError;
        }
      }
      console.warn(
        `⚠️ Could not save localStorage quilt backup during ${label}: browser storage quota is full.`,
        lastError
      );
      return false;
    };
    try {
      const contributors = Array.isArray(contributorsOrOptions) ? contributorsOrOptions : [];
      fallbackContributors = contributors;
      const options = saveOptions || (!Array.isArray(contributorsOrOptions) && contributorsOrOptions ? contributorsOrOptions : null);
      fallbackOptions = options;
      const src = options && options.resetSource;
      const nextCount = Array.isArray(blocks) ? blocks.length : 0;
      if (nextCount === 0) {
        console.warn(
          `⚠️ Refusing direct client empty-quilt write${src ? ` (${src})` : ''}; resets must go through the server.`
        );
        return false;
      }
      const writeReason =
        options?.adminMutation ? 'admin-mutation' :
          options?.sourceFunction ? String(options.sourceFunction) :
            'client-save';
      fallbackWriteReason = writeReason;
      const quiltData = {
        blocks: blocks,
        contributorCount: contributorCount,
        lastUpdated: new Date().toISOString(),
        date: Utils.getTodayKey(),
        quiltFingerprint: Utils.computeQuiltFingerprint(blocks),
        colorReplayEvents: Array.isArray(colorReplayEvents) ? colorReplayEvents : [],
        contributors: normalizeContributors(contributors),
        writeProvenance: Utils.buildWriteProvenance(writeReason),
        macroStructureFrozen: options?.macroStructureFrozen === true
      };
      if (src === 'admin' || src === 'daily') {
        const iso = new Date().toISOString();
        quiltData.lastResetAt = iso;
        quiltData.lastResetSource = src;
      }
      const skipFirestoreSave = options?.skipFirestore === true;
      
      // Check Firestore availability
      if (!skipFirestoreSave && (!window.db || !window.firestore)) {
        console.warn('⚠️ Firestore not available for saving');
        if (src === 'daily') {
          console.warn('⚠️ Refusing daily reset without Firestore verification');
          return false;
        }
      } else if (skipFirestoreSave) {
        console.warn('⚠️ Firestore save skipped for local/admin-only mutation');
      }
      
      if (!skipFirestoreSave && window.db && window.firestore) {
        // Save to Firestore
        const today = Utils.getTodayKey();
        const quiltRef = window.firestore.doc(window.db, 'quilts', today);
        if (src !== 'admin') {
          try {
            let existingSnap = null;
            let guardReadError = null;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                existingSnap = await (window.firestore.getDocFromServer || window.firestore.getDoc)(quiltRef);
                guardReadError = null;
                break;
              } catch (readError) {
                guardReadError = readError;
                await new Promise(resolve => setTimeout(resolve, 350 + (attempt * 250)));
              }
            }
            if (!existingSnap && guardReadError) throw guardReadError;
            if (existingSnap.exists()) {
              const existingData = existingSnap.data() || {};
              const existingCount = Array.isArray(existingData.blocks) ? existingData.blocks.length : 0;
              const existingContributorCount = Number(existingData.contributorCount) || 0;
              const isNewContributionSave = Number(contributorCount) > existingContributorCount;
              const existingFingerprint =
                typeof existingData.quiltFingerprint === 'string' && existingData.quiltFingerprint
                  ? existingData.quiltFingerprint
                  : Utils.computeQuiltFingerprint(existingData.blocks || []);
              const nextFingerprint = quiltData.quiltFingerprint;
              quiltData.contributors = normalizeContributors([
                ...(Array.isArray(existingData.contributors) ? existingData.contributors : []),
                ...quiltData.contributors
              ]);
              if (src === 'daily' && existingCount > 1 && nextCount === 0) {
                console.warn(
                  `⚠️ Refusing daily reset for active quilt ${today}: server already has ${existingCount} blocks. Use admin reset for intentional override.`
                );
                return false;
              }
              const regressionToStarter =
                existingCount >= 3 && nextCount <= 2 && !options?.adminMutation;
              if (regressionToStarter || (existingCount > nextCount && !isNewContributionSave)) {
                console.warn(
                  `⚠️ Refusing to overwrite fuller server quilt for ${today}: server has ${existingCount} blocks, local save has ${nextCount}.`
                );
                return false;
              }
              if (
                !options?.adminMutation &&
                existingCount === nextCount &&
                existingCount > 0 &&
                existingFingerprint &&
                nextFingerprint &&
                existingFingerprint !== nextFingerprint &&
                !isNewContributionSave
              ) {
                console.warn(
                  `⚠️ Refusing to overwrite changed server quilt for ${today}: server and local both have ${existingCount} blocks but different fingerprints.`
                );
                return false;
              }
            }
          } catch (guardError) {
            console.warn('⚠️ Could not verify server quilt before save; refusing unsafe write:', guardError);
            return false;
          }
        }
        await window.firestore.setDoc(quiltRef, quiltData, { merge: true });
        // Quilt saved to Firestore
        
        /**
         * Instagram + Zapier stills (classic + layout B) after quilt/quote writes.
         * Final IG stills: GitHub nightly-instagram-snapshot.yml at 08:30 UTC (after 07:00 UTC reset), or manual workflow_dispatch.
         * Reel: record from the app (animated WebM → MP4); static reel-nightly.mp4 is manual/legacy only.
         * Admin-panel quilt edits skip this path so bulk testing does not run heavy canvas work every save.
         */
        if (!options?.adminMutation) {
          const igBlocks = quiltData.blocks;
          const igDateKey = today;
          void (async () => {
            try {
              const arch = window.app?.archiveService;
              if (!arch?.generateInstagramImage) {
                console.warn('ArchiveService.generateInstagramImage not available');
                return;
              }
              const qs = window.app?.quoteService;
              const todayQuote =
                (qs && typeof qs.getQuoteResolvedForInstagramDateKey === 'function'
                  ? await qs.getQuoteResolvedForInstagramDateKey(igDateKey, { requireLive: true })
                  : qs?.getTodayQuote()) || null;
              const instagramImage = await arch.generateInstagramImage(igBlocks);
              let postLayoutBImageData = null;
              if (arch.generateInstagramPostLayoutBImage) {
                postLayoutBImageData = await arch.generateInstagramPostLayoutBImage(
                  igBlocks,
                  todayQuote,
                  igDateKey
                );
              }
              let storyLayoutBImageData = null;
              if (arch.generateInstagramStoryLayoutBImage) {
                storyLayoutBImageData = await arch.generateInstagramStoryLayoutBImage(
                  igBlocks,
                  todayQuote,
                  igDateKey
                );
              }
              const layoutBAliasesSpeaker = !!(
                postLayoutBImageData &&
                arch._resolveLayoutBSpeakerImageUrl &&
                String(arch._resolveLayoutBSpeakerImageUrl(todayQuote) || '').trim()
              );
              if (instagramImage || postLayoutBImageData || storyLayoutBImageData) {
                if (window.app && typeof window.app.initializeFirebaseForImages === 'function') {
                  const igFingerprint = Utils.computeQuiltFingerprint(igBlocks);
                  await Utils.writeInstagramImagesDocForZapier({
                    dateKey: igDateKey,
                    instagramImage,
                    postLayoutBImageData,
                    storyLayoutBImageData,
                    aliasLayoutBSpeakerUrl: layoutBAliasesSpeaker,
                    zapierCaption: Utils.formatZapierCaptionFromQuote(todayQuote),
                    quiltFingerprint: igFingerprint,
                    blockCount: Array.isArray(igBlocks) ? igBlocks.length : 0,
                    contributorCount: Math.max(
                      1,
                      Number(quiltData.contributorCount) || 1
                    )
                  });
                } else {
                  console.warn('Skipping Instagram Firestore doc: app / Storage init not available');
                }
              }
            } catch (imageError) {
              console.warn('Could not save Instagram image to Firestore:', imageError);
            }
          })();
        }
      }
      
      // Also save to localStorage as backup (including explicit empty reset state).
      const localBackupSaved = saveLocalQuiltBackup(quiltData, 'saveQuilt');
      if (!localBackupSaved && !window.db && !window.firestore) {
        console.warn('⚠️ Quilt updated in memory, but local browser storage is full; reload may lose this local-only quilt.');
      }
      
      return true;
    } catch (error) {
      this.errorHandler.handleError(error, 'saveQuilt');
      
      // Fallback to localStorage only
      try {
        const fsrc = fallbackOptions && fallbackOptions.resetSource;
        if (fsrc === 'daily') {
          console.warn('⚠️ Refusing daily reset localStorage fallback');
          return false;
        }
        const fallbackPayload = {
          blocks: blocks,
          contributorCount: contributorCount,
          lastUpdated: new Date().toISOString(),
          date: Utils.getTodayKey(),
          quiltFingerprint: Utils.computeQuiltFingerprint(blocks),
          colorReplayEvents: Array.isArray(colorReplayEvents) ? colorReplayEvents : [],
          contributors: normalizeContributors(fallbackContributors),
          writeProvenance: Utils.buildWriteProvenance(`${fallbackWriteReason}:local-fallback`),
          macroStructureFrozen: fallbackOptions?.macroStructureFrozen === true
        };
        if (fsrc === 'admin' || fsrc === 'daily') {
          const iso = new Date().toISOString();
          fallbackPayload.lastResetAt = iso;
          fallbackPayload.lastResetSource = fsrc;
        }
        const localFallbackSaved = saveLocalQuiltBackup(fallbackPayload, 'saveQuilt localStorage fallback');
        if (!localFallbackSaved) return false;
        this.logger.log('💾 Saved quilt to localStorage (fallback)');
        return true;
      } catch (localError) {
        this.errorHandler.handleError(localError, 'saveQuilt localStorage fallback');
        return false;
      }
    }
  }
}

  root.QuiltDataService = QuiltDataService;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
