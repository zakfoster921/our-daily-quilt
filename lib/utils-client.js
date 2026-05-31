/**
 * Client identity, write provenance, and quilt template helpers. Extends UtilsCore.
 * Requires lib/utils-core.js to load first.
 */
(function (root) {
  'use strict';

  const UtilsCore = root.UtilsCore;
  if (!UtilsCore) {
    throw new Error('lib/utils-core.js must load before lib/utils-client.js');
  }

  Object.assign(UtilsCore, {
    fillTemplateWithColors(template, colors) {
      if (!template || !Array.isArray(template.blocks)) return [];
      if (!Array.isArray(colors) || colors.length === 0) return [];
      const colorAt = (slot) => {
        const idx = Number(slot);
        if (!Number.isFinite(idx) || idx < 1) return colors[0];
        return colors[Math.min(idx, colors.length) - 1];
      };
      return template.blocks.map((b) => {
        const out = { ...b, color: colorAt(b.colorSlot ?? 1) };
        if (b.hstColorBSlot != null) out.hstColorB = colorAt(b.hstColorBSlot);
        if (b.insetInnerColorSlot != null) out.insetInnerColor = colorAt(b.insetInnerColorSlot);
        return out;
      });
    },

    getOrCreateUserId() {
      let userId = root.localStorage.getItem('ourDailyUserId');
      if (!userId) {
        userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        root.localStorage.setItem('ourDailyUserId', userId);
      }
      return userId;
    },

    getOrCreateAppInstanceId() {
      let id = root.localStorage.getItem('ourDailyAppInstanceId');
      if (!id) {
        id = `app_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        root.localStorage.setItem('ourDailyAppInstanceId', id);
      }
      return id;
    },

    getClientPlatformLabel() {
      try {
        if (typeof root.odqIsCapacitorNative === 'function' && root.odqIsCapacitorNative()) {
          return 'capacitor-ios';
        }
      } catch (_) {
        /* ignore */
      }
      const href = String(root.location?.href || '');
      if (href.startsWith('file:')) return 'local-file';
      if (href.startsWith('capacitor:')) return 'capacitor-ios';
      return 'web';
    },

    buildWriteProvenance(reason = 'unknown') {
      const cfg = root.CONFIG && root.CONFIG.APP;
      return {
        clientBuild: `${cfg?.version || '0'}:${cfg?.buildId || '0'}`,
        writeReason: String(reason || 'unknown').slice(0, 80),
        appInstanceId: UtilsCore.getOrCreateAppInstanceId(),
        userId: UtilsCore.getOrCreateUserId(),
        platform: UtilsCore.getClientPlatformLabel(),
        href: String(root.location?.href || '').slice(0, 180),
        userAgent: String(root.navigator?.userAgent || '').slice(0, 220),
        writtenAt: new Date().toISOString()
      };
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
