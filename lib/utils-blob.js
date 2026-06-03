/**
 * Blob/data URL helpers for Instagram uploads. Extends UtilsCore. Requires lib/utils-core.js first.
 */
(function (root) {
  'use strict';

  const UtilsCore = root.UtilsCore;
  if (!UtilsCore) {
    throw new Error('lib/utils-core.js must load before utils-blob.js');
  }

  Object.assign(UtilsCore, {
    dataUrlToBlob(dataUrl) {
      const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
      if (!m) {
        throw new Error('Invalid data URL');
      }
      const binary = atob(m[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: m[1] });
    },
    blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result || null);
        fr.onerror = () => reject(new Error('Could not read blob as data URL'));
        fr.readAsDataURL(blob);
      });
    },
    /** Downscale a PNG/JPEG blob for fast on-screen preview (layout is authored at full size). */
    downscaleImageBlob(blob, maxWidth = 540, mimeType = 'image/png', quality = 0.88) {
      if (!(blob instanceof Blob) || blob.size <= 0) {
        return Promise.reject(new Error('Invalid blob for downscale'));
      }
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const im = new Image();
        im.onload = () => {
          URL.revokeObjectURL(url);
          const nw = Math.max(1, im.naturalWidth || im.width || 1);
          const nh = Math.max(1, im.naturalHeight || im.height || 1);
          const scale = Math.min(1, maxWidth / nw);
          const w = Math.max(1, Math.round(nw * scale));
          const h = Math.max(1, Math.round(nh * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas unavailable for downscale'));
            return;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(im, 0, 0, w, h);
          canvas.toBlob(
            (out) => (out ? resolve(out) : reject(new Error('Downscale toBlob failed'))),
            mimeType,
            quality
          );
        };
        im.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Downscale image load failed'));
        };
        im.src = url;
      });
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
