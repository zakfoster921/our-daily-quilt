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
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
