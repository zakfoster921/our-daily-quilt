/**
 * Firestore sanitize and instagram-images/{dateKey} upload writers. Extends UtilsCore.
 */
(function (root) {
  'use strict';

  const UtilsCore = root.UtilsCore;
  if (!UtilsCore) {
    throw new Error('lib/utils-core.js must load before utils-instagram.js');
  }

  Object.assign(UtilsCore, {
    /** Fresh ?odq_t= on each upload so phones/CDNs pick up the latest newspaper-clipping.png. */
    cacheBustInstagramStorageUrl(url) {
      const u = String(url || '').trim();
      if (!u) return u;
      const sep = u.includes('?') ? '&' : '?';
      return `${u}${sep}odq_t=${Date.now()}`;
    },

    sanitizeForFirestore(value) {
      const walk = (v) => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        if (typeof v === 'number') {
          return Number.isFinite(v) ? v : null;
        }
        if (typeof v === 'string' || typeof v === 'boolean') return v;
        if (v instanceof Date) return v;
        if (Array.isArray(v)) {
          const out = [];
          for (const item of v) {
            const next = walk(item);
            if (next !== undefined) out.push(next);
          }
          return out;
        }
        if (typeof v === 'object') {
          const out = {};
          for (const [k, val] of Object.entries(v)) {
            const next = walk(val);
            if (next !== undefined) out[k] = next;
          }
          return out;
        }
        return undefined;
      };
      const out = walk(value);
      return out === undefined ? {} : out;
    },
    /**
     * Uploads PNGs (and optional synthetic reel WebM) to Firebase Storage and writes `instagram-images/{dateKey}` with URLs only
     * (Firestore field limit ~1 MiB — inline base64 exceeds that for layout B).
     * Uses merge so reel / MP4 URLs from a prior step are not wiped when updating images only.
     *
     * Storage layout (per day): stable paths `classic.png`, `layout-b.png`, `layout-b-story.png`,
     * `quilt-screen-9x16.png`, `contributor-cloud.png` overwrite on each push.
     * `layout-b.png` = 4:5 post (quote strips + speaker cutout when available); `layout-b-speaker.png` = speaker hero post (separate file).
     * `contributor-cloud.png` = 4:5 contributor name cloud on full-bleed quilt.
     * Optional `debug-raw-quilt-{timestamp}-….png` stays versioned.
     */
    async writeInstagramImagesDocForZapierViaServer({
      dateKey,
      instagramImage,
      postLayoutBImageData,
      postLayoutBSpeakerImageData,
      storyLayoutBImageData,
      quiltScreen9x16ImageData = null,
      newspaperClippingImageData = null,
      moodClippingGoodImageData = null,
      moodClippingRoughImageData = null,
      contributorCloudImageData = null,
      zapierCaption = '',
      quiltFingerprint = '',
      blockCount,
      contributorCount,
      aliasLayoutBSpeakerUrl = false
    }) {
      const baseUrl = String(root.CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (!baseUrl) throw new Error('Backend base URL not configured');
      const res = await fetch(`${baseUrl}/api/push-instagram-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey,
          instagramImage,
          postLayoutBImageData,
          postLayoutBSpeakerImageData,
          storyLayoutBImageData,
          quiltScreen9x16ImageData,
          newspaperClippingImageData,
          moodClippingGoodImageData,
          moodClippingRoughImageData,
          contributorCloudImageData,
          zapierCaption,
          quiltFingerprint,
          blockCount,
          contributorCount,
          aliasLayoutBSpeakerUrl,
          lastIgPushStartedAt: new Date().toISOString()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `Backend IG push failed (${res.status})`);
      }
      return data.docPayload || {};
    },
    async writeInstagramImagesDocForZapier({
      dateKey,
      instagramImage,
      postLayoutBImageData,
      postLayoutBSpeakerImageData,
      storyLayoutBImageData,
      quiltScreen9x16ImageData = null,
      newspaperClippingImageData = null,
      moodClippingGoodImageData = null,
      moodClippingRoughImageData = null,
      contributorCloudImageData = null,
      reelWebmBlob = null,
      zapierCaption = '',
      quiltFingerprint = '',
      exportDebug = null,
      debugRawQuiltImage = null,
      /** Denormalized from `quilts/{dateKey}` so Zapier can map Firestore fields without a second lookup. */
      blockCount,
      contributorCount,
      /** Set by nightly GitHub images job so Zapier can filter on final assets only. */
      markReadyForInstagram = false,
      /** Override Storage cache (nightly uses `no-store` so IG/Zapier do not reuse cached early PNGs). */
      storageCacheControl = null,
      /** When true and layout-b.png was uploaded, duplicate its URL into layoutBSpeakerUrl fields (no second blob). */
      aliasLayoutBSpeakerUrl = false
    }) {
      if (!root.db || !root.firestore) {
        throw new Error('Firestore not ready');
      }
      if (
        !instagramImage &&
        !postLayoutBImageData &&
        !postLayoutBSpeakerImageData &&
        !storyLayoutBImageData &&
        !quiltScreen9x16ImageData &&
        !newspaperClippingImageData &&
        !moodClippingGoodImageData &&
        !moodClippingRoughImageData &&
        !contributorCloudImageData &&
        !(reelWebmBlob && reelWebmBlob.size > 0)
      ) {
        throw new Error('No images or reel to upload');
      }
      if (!root.app || typeof root.app.initializeFirebaseForImages !== 'function') {
        throw new Error('App not ready for Storage upload');
      }
      const timedStep = async (label, promise, timeoutMs, hypothesisId = 'P8') => {
        try {
          const result = await root.odqPromiseWithTimeout(promise, timeoutMs, label);
          return result;
        } catch (err) {
          throw err;
        }
      };
      const toFirestoreRestValue = (value) => {
        if (value === undefined) return undefined;
        if (value === null) return { nullValue: 'NULL_VALUE' };
        if (typeof value === 'string') return { stringValue: value };
        if (typeof value === 'boolean') return { booleanValue: value };
        if (typeof value === 'number') {
          if (!Number.isFinite(value)) return undefined;
          return Number.isInteger(value)
            ? { integerValue: String(value) }
            : { doubleValue: value };
        }
        if (Array.isArray(value)) {
          const values = value.map(toFirestoreRestValue).filter(Boolean);
          return { arrayValue: { values } };
        }
        if (typeof value === 'object') {
          const fields = {};
          Object.entries(value).forEach(([key, child]) => {
            const converted = toFirestoreRestValue(child);
            if (converted) fields[key] = converted;
          });
          return { mapValue: { fields } };
        }
        return { stringValue: String(value) };
      };
      const writeInstagramDocViaRest = async (payload) => {
        const projectId = String(root.CONFIG?.FIREBASE?.projectId || '').trim();
        if (!projectId) throw new Error('Firebase projectId missing');
        const fields = {};
        Object.entries(payload || {}).forEach(([key, value]) => {
          const converted = toFirestoreRestValue(value);
          if (converted) fields[key] = converted;
        });
        const mask = new URLSearchParams();
        Object.keys(fields).forEach((fieldPath) => mask.append('updateMask.fieldPaths', fieldPath));
        const url =
          `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
          `/databases/(default)/documents/instagram-images/${encodeURIComponent(dateKey)}` +
          `?${mask.toString()}`;
        const token =
          root.odqFirebaseAuthIdToken ||
          (root.firebaseAuth?.currentUser &&
          typeof root.firebaseAuth.currentUser.getIdToken === 'function'
            ? await root.firebaseAuth.currentUser.getIdToken()
            : '');
        const res = await fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ fields })
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Firestore REST ${res.status}: ${body.slice(0, 180)}`);
        }
        return await res.json().catch(() => ({}));
      };
      const writeInstagramDocWithFallback = async (label, payload, sdkTimeoutMs, hypothesisId = 'P12') => {
        try {
          await root.odqPromiseWithTimeout(
            root.firestore.setDoc(imageRef, payload, { merge: true }),
            sdkTimeoutMs,
            label
          );
          return 'sdk';
        } catch (err) {
          await timedStep(`${label} REST`, writeInstagramDocViaRest(payload), 30000, 'P17');
          return 'rest';
        }
      };

      await timedStep('Firebase init', root.app.initializeFirebaseForImages(), 30000, 'P8');
      if (!root.firebaseStorage) {
        throw new Error('Firebase Storage not initialized');
      }
      const { ref, uploadBytes, getDownloadURL } = await import(
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'
      );
      const storage = root.firebaseStorage;
      const basePath = `instagram-zapier/${dateKey}`;
      const isImageWrite = !!(
        instagramImage ||
        postLayoutBImageData ||
        postLayoutBSpeakerImageData ||
        storyLayoutBImageData ||
        quiltScreen9x16ImageData ||
        newspaperClippingImageData ||
        contributorCloudImageData
      );
      const isReelWrite = !!(reelWebmBlob && reelWebmBlob.size > 0);
      const qfp = typeof quiltFingerprint === 'string' ? quiltFingerprint.trim() : '';
      const qfpSlug = (qfp || 'no-qfp').replace(/[^a-z0-9_-]/gi, '').slice(0, 48);
      const debugAssetVersion = debugRawQuiltImage ? `${Date.now()}-${qfpSlug}` : '';
      const imageRef = root.firestore.doc(root.db, 'instagram-images', dateKey);
      await writeInstagramDocWithFallback(
        'Firestore marker',
        {
          date: dateKey,
          lastIgPushStartedAt: new Date().toISOString(),
          igPushStatus: 'uploading'
        },
        12000,
        'P12'
      );
      let existing = {};
      try {
        const existingSnap = await timedStep(
          'Firestore existing read',
          root.firestore.getDoc(imageRef),
          15000,
          'P12'
        );
        existing = existingSnap.exists() ? existingSnap.data() || {} : {};
      } catch (err) {
    }
      const existingImageQfp = String(
        existing.imageQuiltFingerprint || existing.quiltFingerprint || ''
      ).trim();
      const existingReelQfp = String(
        existing.reelQuiltFingerprint || existing.quiltFingerprint || ''
      ).trim();
      const hasExistingReel = !!(
        existing.reelWebmStorageUrl ||
        existing.reelWebmUrl ||
        existing.reelMp4StorageUrl ||
        existing.reelMp4Url ||
        existing.reelUrl
      );
      const shouldClearStaleReel =
        qfp &&
        isImageWrite &&
        !isReelWrite &&
        hasExistingReel &&
        (!existingReelQfp || existingReelQfp !== qfp);
      if (qfp && isReelWrite && !isImageWrite && existingImageQfp && existingImageQfp !== qfp) {
        throw new Error(
          `Refusing reel-only update for ${dateKey}: quiltFingerprint mismatch with existing images (${existingImageQfp} ≠ ${qfp}). Regenerate images in same run.`
        );
      }
      let imageStorageUrl = null;
      let postLayoutBImageStorageUrl = null;
      let postLayoutBSpeakerImageStorageUrl = null;
      let storyLayoutBImageStorageUrl = null;
      let quiltScreen9x16ImageStorageUrl = null;
      let newspaperClippingImageStorageUrl = null;
      let contributorCloudImageStorageUrl = null;
      let reelWebmStorageUrl = null;
      let debugRawQuiltStorageUrl = null;
      const pngCacheControl =
        typeof storageCacheControl === 'string' && storageCacheControl.trim()
          ? storageCacheControl.trim()
          : 'public, max-age=31536000';
      const clippingUploadTimeoutMs = 120000;
      const makeStorageDownloadUrl = (path, token) => {
        const bucket = String(root.CONFIG?.FIREBASE?.storageBucket || '').trim();
        if (!bucket) throw new Error('Firebase storageBucket missing');
        return (
          `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/` +
          `${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`
        );
      };
      const uploadBlobViaStorageRest = async (label, path, blob, metadata = {}) => {
        const bucket = String(root.CONFIG?.FIREBASE?.storageBucket || '').trim();
        if (!bucket) throw new Error('Firebase storageBucket missing');
        const currentUser = root.firebaseAuth?.currentUser || root.odqFirebaseAuthUser;
        const idToken =
          root.odqFirebaseAuthIdToken ||
          (currentUser && typeof currentUser.getIdToken === 'function'
            ? await currentUser.getIdToken()
            : '');
        if (!idToken) {
          throw new Error('Firebase auth token missing for Storage REST upload');
        }
        const downloadToken =
          globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const uploadUrl =
          `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o` +
          `?uploadType=media&name=${encodeURIComponent(path)}`;
        const headers = {
          'Content-Type': metadata?.contentType || blob.type || 'application/octet-stream',
          'x-goog-meta-firebasestoragedownloadtokens': downloadToken
        };
        if (metadata?.cacheControl) {
          headers['Cache-Control'] = metadata.cacheControl;
          headers['x-goog-meta-cachecontrol'] = metadata.cacheControl;
        }
        const runFetch = async (authorization) =>
          fetch(uploadUrl, {
            method: 'POST',
            headers: {
              ...headers,
              Authorization: authorization
            },
            body: blob
          });
        let res = await runFetch(`Firebase ${idToken}`);
        if (res.status === 401 || res.status === 403) {
          res = await runFetch(`Bearer ${idToken}`);
        }
        const text = await res.text().catch(() => '');
        if (!res.ok) {
          throw new Error(`Storage REST ${res.status}: ${text.slice(0, 180)}`);
        }
        let json = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch (_) {
          json = {};
        }
        const returnedToken = String(
          json.downloadTokens || json.metadata?.firebaseStorageDownloadTokens || downloadToken
        )
          .split(',')
          .filter(Boolean)[0];
        return makeStorageDownloadUrl(path, returnedToken || downloadToken);
      };
      const uploadDataUrlToStorage = async (label, path, dataUrl, metadata, timeoutMs = 60000) => {
        const blob = UtilsCore.dataUrlToBlob(dataUrl);
        const storageRef = ref(storage, path);
        try {
          await timedStep(
            `${label} upload`,
            uploadBytes(storageRef, blob, metadata),
            timeoutMs,
            'P9'
          );
          return await timedStep(
            `${label} URL`,
            getDownloadURL(storageRef),
            30000,
            'P10'
          );
        } catch (err) {
          const restPath = path.replace(/(\.[a-z0-9]+)$/i, `-rest-${Date.now()}$1`);
          return await timedStep(
            `${label} REST upload`,
            uploadBlobViaStorageRest(label, restPath, blob, metadata),
            90000,
            'P18'
          );
        }
      };
      if (instagramImage) {
        imageStorageUrl = await uploadDataUrlToStorage(
          'classic',
          `${basePath}/classic.png`,
          instagramImage,
          {
            contentType: 'image/png',
            cacheControl: pngCacheControl
          }
        );
      }
      if (postLayoutBImageData) {
        postLayoutBImageStorageUrl = await uploadDataUrlToStorage(
          'layout B',
          `${basePath}/layout-b.png`,
          postLayoutBImageData,
          {
            contentType: 'image/png',
            cacheControl: pngCacheControl
          }
        );
      }
      if (postLayoutBSpeakerImageData) {
        postLayoutBSpeakerImageStorageUrl = await uploadDataUrlToStorage(
          'layout B speaker',
          `${basePath}/layout-b-speaker.png`,
          postLayoutBSpeakerImageData,
          {
            contentType: 'image/png',
            cacheControl: pngCacheControl
          }
        );
      } else if (aliasLayoutBSpeakerUrl && postLayoutBImageStorageUrl) {
        postLayoutBSpeakerImageStorageUrl = postLayoutBImageStorageUrl;
      }
      if (storyLayoutBImageData) {
        storyLayoutBImageStorageUrl = await uploadDataUrlToStorage(
          'layout B story',
          `${basePath}/layout-b-story.png`,
          storyLayoutBImageData,
          {
            contentType: 'image/png',
            cacheControl: pngCacheControl
          }
        );
      }
      if (quiltScreen9x16ImageData) {
        quiltScreen9x16ImageStorageUrl = await uploadDataUrlToStorage(
          'quilt screen 9x16',
          `${basePath}/quilt-screen-9x16.png`,
          quiltScreen9x16ImageData,
          {
            contentType: 'image/png',
            cacheControl: pngCacheControl
          }
        );
      }
      if (newspaperClippingImageData) {
        newspaperClippingImageStorageUrl = await uploadDataUrlToStorage(
          'newspaper clipping',
          `${basePath}/newspaper-clipping.png`,
          newspaperClippingImageData,
          {
            contentType: 'image/png',
            cacheControl: pngCacheControl
          },
          clippingUploadTimeoutMs
        );
      }
      if (contributorCloudImageData) {
        contributorCloudImageStorageUrl = await uploadDataUrlToStorage(
          'contributor cloud',
          `${basePath}/contributor-cloud.png`,
          contributorCloudImageData,
          {
            contentType: 'image/png',
            cacheControl: pngCacheControl
          }
        );
      }
      let moodClippingGoodImageStorageUrl = null;
      let moodClippingRoughImageStorageUrl = null;
      if (moodClippingGoodImageData) {
        moodClippingGoodImageStorageUrl = await uploadDataUrlToStorage(
          'mood clipping good',
          `${basePath}/mood-clipping-good.png`,
          moodClippingGoodImageData,
          {
            contentType: 'image/png',
            cacheControl: pngCacheControl
          },
          clippingUploadTimeoutMs
        );
      }
      if (moodClippingRoughImageData) {
        moodClippingRoughImageStorageUrl = await uploadDataUrlToStorage(
          'mood clipping rough',
          `${basePath}/mood-clipping-rough.png`,
          moodClippingRoughImageData,
          {
            contentType: 'image/png',
            cacheControl: pngCacheControl
          },
          clippingUploadTimeoutMs
        );
      }
      if (reelWebmBlob && reelWebmBlob.size > 0) {
        const r = ref(storage, `${basePath}/reel.webm`);
        await timedStep(
          'reel WebM upload',
          uploadBytes(r, reelWebmBlob, { contentType: 'video/webm' }),
          90000,
          'P9'
        );
        reelWebmStorageUrl = await timedStep('reel WebM URL', getDownloadURL(r), 30000, 'P10');
      }
      if (debugRawQuiltImage) {
        debugRawQuiltStorageUrl = await uploadDataUrlToStorage(
          'debug quilt',
          `${basePath}/debug-raw-quilt-${debugAssetVersion}.png`,
          debugRawQuiltImage,
          {
            contentType: 'image/png',
            cacheControl: 'no-store'
          },
          45000
        );
      }
      /** Only set fields we uploaded so merge does not null out prior classic/layout URLs on reel-only writes. */
      const docPayload = {
        date: dateKey,
        lastUpdated: new Date().toISOString()
      };
      const bc = Number(blockCount);
      if (Number.isFinite(bc) && bc >= 0) {
        docPayload.blockCount = Math.floor(bc);
      }
      const cc = Number(contributorCount);
      if (Number.isFinite(cc) && cc >= 0) {
        docPayload.contributorCount = Math.floor(cc);
      }
      if (imageStorageUrl) {
        docPayload.imageStorageUrl = imageStorageUrl;
        docPayload.classicUrl = imageStorageUrl;
      }
      if (postLayoutBImageStorageUrl) {
        docPayload.postLayoutBImageStorageUrl = postLayoutBImageStorageUrl;
        docPayload.layoutBUrl = postLayoutBImageStorageUrl;
        docPayload.postLayoutBPlainImageStorageUrl = postLayoutBImageStorageUrl;
        docPayload.layoutBPlainUrl = postLayoutBImageStorageUrl;
      }
      if (postLayoutBSpeakerImageStorageUrl) {
        docPayload.postLayoutBSpeakerImageStorageUrl = postLayoutBSpeakerImageStorageUrl;
        docPayload.layoutBSpeakerUrl = postLayoutBSpeakerImageStorageUrl;
      }
      if (storyLayoutBImageStorageUrl) {
        docPayload.storyLayoutBImageStorageUrl = storyLayoutBImageStorageUrl;
        docPayload.layoutBStoryUrl = storyLayoutBImageStorageUrl;
        docPayload.storyLayoutBUrl = storyLayoutBImageStorageUrl;
      }
      if (quiltScreen9x16ImageStorageUrl) {
        docPayload.quiltScreen9x16ImageStorageUrl = quiltScreen9x16ImageStorageUrl;
        docPayload.quiltScreen9x16Url = quiltScreen9x16ImageStorageUrl;
        docPayload.quiltScreenUrl = quiltScreen9x16ImageStorageUrl;
      }
      if (newspaperClippingImageStorageUrl) {
        const clippingExportRev = String(
          globalThis.QuiltNewspaperClipping?.CLIPPING_EXPORT_REV || ''
        ).trim();
        docPayload.newspaperClippingImageStorageUrl = newspaperClippingImageStorageUrl;
        docPayload.newspaperClippingUrl = this.cacheBustInstagramStorageUrl(
          newspaperClippingImageStorageUrl
        );
        docPayload.newspaperClippingReady = true;
        docPayload.newspaperClippingExportRev = clippingExportRev;
        docPayload.newspaperClippingGeneratedAt = new Date().toISOString();
      }
      if (contributorCloudImageStorageUrl) {
        docPayload.contributorCloudImageStorageUrl = contributorCloudImageStorageUrl;
        docPayload.contributorCloudUrl = contributorCloudImageStorageUrl;
      }
      if (moodClippingGoodImageStorageUrl) {
        docPayload.moodClippingGoodImageStorageUrl = moodClippingGoodImageStorageUrl;
        docPayload.moodClippingGoodUrl = moodClippingGoodImageStorageUrl;
        docPayload.moodClippingGoodReady = true;
      }
      if (moodClippingRoughImageStorageUrl) {
        docPayload.moodClippingRoughImageStorageUrl = moodClippingRoughImageStorageUrl;
        docPayload.moodClippingRoughUrl = moodClippingRoughImageStorageUrl;
        docPayload.moodClippingRoughReady = true;
      }
      if (moodClippingGoodImageStorageUrl || moodClippingRoughImageStorageUrl) {
        docPayload.moodClippingComposerVersion =
          Number(globalThis.QuiltMoodClipping?.MOOD_COMPOSER_VERSION ?? 0) || 6;
      }
      if (reelWebmStorageUrl) {
        docPayload.reelWebmStorageUrl = reelWebmStorageUrl;
        docPayload.reelWebmUrl = reelWebmStorageUrl;
        docPayload.reelUrl = reelWebmStorageUrl;
        docPayload.reelSource = 'app_synthetic_webm';
      }
      if (shouldClearStaleReel) {
        docPayload.reelWebmStorageUrl = '';
        docPayload.reelWebmUrl = '';
        docPayload.reelUrl = '';
        docPayload.reelMp4StorageUrl = '';
        docPayload.reelMp4Url = '';
        docPayload.reelSource = 'disabled_stale_reel_cleared';
        docPayload.reelQuiltFingerprint = '';
        docPayload.reelNote =
          'Reel capture is disabled; stale reel URLs were cleared so image-only Zapier pushes can update.';
      }
      if (qfp) {
        docPayload.quiltFingerprint = qfp;
        if (isImageWrite) {
          docPayload.imageQuiltFingerprint = qfp;
        }
        if (isReelWrite) {
          docPayload.reelQuiltFingerprint = qfp;
        }
      }
      const cap = typeof zapierCaption === 'string' ? zapierCaption.trim() : '';
      if (cap) {
        docPayload.zapierCaption = cap;
      }
      if (debugRawQuiltStorageUrl) {
        docPayload.debugRawQuiltStorageUrl = debugRawQuiltStorageUrl;
      }
      if (exportDebug && typeof exportDebug === 'object') {
        docPayload.exportDebug = {
          ...exportDebug,
          debugWrittenAt: new Date().toISOString()
        };
      }
      if (markReadyForInstagram) {
        const readyAt = new Date().toISOString();
        docPayload.readyForInstagram = true;
        docPayload.lastNightlyIgImagesAt = readyAt;
        docPayload.igImagesSource = 'nightly_github_images_only';
      }
      docPayload.igPushStatus = 'uploaded';
      docPayload.lastIgPushCompletedAt = new Date().toISOString();
      const safePayload = UtilsCore.sanitizeForFirestore(docPayload);
      const writeSource = await writeInstagramDocWithFallback(
        'Firestore final write',
        safePayload,
        15000,
        'P12'
      );
      return safePayload;
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
