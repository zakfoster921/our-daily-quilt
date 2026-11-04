/**
 * Quilt Lab, Phase 2: draw the LIVE in-app quilt with the lab engine.
 *
 * Hooked from the top of QuiltRendererV2.renderBlocks (see `_labLiveTry`). When it handles a render it returns true and the old
 * mirror/split-band renderer is skipped; any problem returns false and the old renderer runs as before.
 *
 * How it draws: instantly a flat vector copy of the lab shapes, then (async) the same riso-textured raster the Instagram and archive
 * images use, laid over it, so the live quilt matches those images. The SVG stretches edge to edge (no letterbox).
 *
 * Switches (any one turns it off and the old engine draws):
 *   - this device: localStorage 'odq_lab_quilt_live' = '0'   (admin menu toggle)   or  ?labquilt=0
 *   - everyone, no app update: server env LAB_QUILT_LIVE=0 (read from /api/lab-quilt-override -> liveEnabled)
 */
(function (root) {
  'use strict';

  const LS_KEY = 'odq_lab_quilt_live';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const state = { override: {}, overrideKey: '', overrideFetching: false, remoteEnabled: true, remoteChecked: false };

  function localOn() {
    try {
      if (new URLSearchParams(root.location.search).get('labquilt') === '0') return false;
    } catch (_) { /* ignore */ }
    try { return root.localStorage.getItem(LS_KEY) !== '0'; } catch (_) { return true; }
  }

  function available() {
    return !!(root.LabQuilt && root.QuiltLabEngine && typeof root.LabQuilt.renderLabQuiltBlob === 'function');
  }

  function enabled() {
    return available() && localOn() && state.remoteEnabled !== false;
  }

  function baseUrl() {
    return String((root.CONFIG && root.CONFIG.BACKEND && root.CONFIG.BACKEND.baseUrl) || '').replace(/\/$/, '');
  }

  /** Fetch the day's admin override + the remote kill switch once per day key; re-render if it changed what we drew. */
  function refreshRemote(dateKey, renderer) {
    if (state.overrideFetching || state.overrideKey === dateKey) return;
    const base = baseUrl();
    if (!base || typeof fetch !== 'function') { state.overrideKey = dateKey; return; }
    state.overrideFetching = true;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 5000) : null;
    fetch(`${base}/api/lab-quilt-override?dateKey=${encodeURIComponent(dateKey)}`, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then((r) => r.json())
      .then((d) => {
        if (!d || !d.success) return;
        const next = { style: d.style || undefined, reroll: d.reroll || 0 };
        const changed = next.style !== state.override.style || next.reroll !== state.override.reroll || (d.liveEnabled === false) !== (state.remoteEnabled === false);
        state.override = next;
        state.remoteEnabled = d.liveEnabled !== false;
        state.remoteChecked = true;
        // quilt only (viewportOnly): a full renderQuilt also refreshes the speaker image / story preview / widgets, which would look like a reload
        if (changed && root.app && typeof root.app.renderQuilt === 'function') root.app.renderQuilt({ force: true, viewportOnly: true });
      })
      .catch(() => { /* offline: keep what we have */ })
      .finally(() => {
        if (timer) clearTimeout(timer);
        state.overrideKey = dateKey;
        state.overrideFetching = false;
      });
  }

  function el(name, attrs) {
    const n = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  }

  function pathD(pts) {
    let d = '';
    for (let i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1);
    return d + 'Z';
  }

  /** Shapes that belong to the given block indices (contributor's own piece(s), including shared shapes). */
  function shapesForIndices(model, idxSet) {
    const out = [];
    model.shapes.forEach((s) => {
      const cis = s.cis || [s.ci];
      if (cis.some((i) => idxSet.has(i))) out.push(s);
    });
    return out;
  }

  function dateKeyFor(renderer) {
    try {
      const a = root.app;
      const k = a && typeof a.getEffectiveAppDateKey === 'function' ? String(a.getEffectiveAppDateKey() || '').trim() : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k;
    } catch (_) { /* ignore */ }
    try {
      const k = typeof Utils !== 'undefined' && Utils.getTodayKey ? String(Utils.getTodayKey()) : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k;
    } catch (_) { /* ignore */ }
    return '';
  }

  /**
   * Returns true when the lab quilt was drawn (caller must stop), false to let the classic renderer run.
   * Exports and previews reuse this renderer with override flags set; those always stay on their own paths.
   */
  function labLiveTry(blocks, userPieces) {
    try {
      if (!enabled()) return false;
      const svg = this.quiltSVG;
      if (!svg || svg.id !== 'quilt') return false;
      if (!Array.isArray(blocks) || blocks.length < 2) return false;
      if (this._exportDateKeyOverride || this._renderViewportOverride || this._exportFullQuiltField || this._forcePrimaryOnlyPreview) return false;
      if (this._builderPreviewMode || this.backsidePreviewEnabled) return false;
      if (root.app && root.app._isPersonalQuiltMode) return false;
      const dateKey = dateKeyFor(this);
      if (!dateKey) return false;
      refreshRemote(dateKey, this);

      const colorsKey = blocks.map((b) => String((b && b.color) || '')).join(',');
      const key = `${dateKey}|${state.override.style || ''}|${state.override.reroll || 0}|${colorsKey}`;
      let live = this._labLive;
      if (!live || live.key !== key) {
        const lq = root.LabQuilt.buildLabQuilt(blocks, dateKey, state.override);
        live = this._labLive = { key, lq, url: null, token: (live ? live.token : 0) + 1, prevCount: live ? live.count : null, count: blocks.length };
        if (live.prevCount == null) live.prevCount = blocks.length; // first draw of the session: nothing is "new"
        // free the previous raster
        if (this._labLiveOldUrl) { try { URL.revokeObjectURL(this._labLiveOldUrl); } catch (_) { /* ignore */ } this._labLiveOldUrl = null; }
      }
      const model = live.lq.model;

      svg.innerHTML = '';
      svg.setAttribute('viewBox', `0 0 ${model.W} ${model.H}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('data-lab-live', '1');
      ['data-quilt-split-band', 'data-quilt-split-band-simple', 'data-primary-only-preview', 'data-mirror-bottom-layout'].forEach((a) => svg.removeAttribute(a));
      svg.style.setProperty('width', '100%', 'important');
      svg.style.setProperty('height', '100%', 'important');
      svg.style.setProperty('max-width', '100%', 'important');
      svg.style.setProperty('max-height', '100%', 'important');

      // 1) instant flat vector copy (also what shows if the raster fails)
      const flat = el('g', { 'data-lab-flat': '1' });
      const stretch = 6; // draw slightly past the edge so no hairline shows when the SVG is stretched
      const clip = el('clipPath', { id: 'labLiveClip' });
      clip.appendChild(el('rect', { x: -stretch, y: -stretch, width: model.W + stretch * 2, height: model.H + stretch * 2 }));
      svg.appendChild(clip);
      flat.setAttribute('clip-path', 'url(#labLiveClip)');
      const bg = model.shapes.length ? model.shapes[0].fill : '#f6f4f1';
      flat.appendChild(el('rect', { x: -stretch, y: -stretch, width: model.W + stretch * 2, height: model.H + stretch * 2, fill: bg }));
      model.shapes.forEach((s) => {
        flat.appendChild(el('path', { d: pathD(s.pts), fill: s.fill, stroke: s.fill, 'stroke-width': '1.4', 'stroke-linejoin': 'round' }));
      });
      svg.appendChild(flat);

      // 2) textured raster (riso layers), same renderer as the Instagram/archive images
      const addImage = (url) => {
        const img = el('image', { x: 0, y: 0, width: model.W, height: model.H, preserveAspectRatio: 'none', 'data-lab-raster': '1' });
        img.setAttribute('href', url);
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
        svg.insertBefore(img, svg.querySelector('[data-lab-mine]'));
      };
      if (live.url) addImage(live.url);
      else if (!live.rendering) {
        live.rendering = true;
        const myToken = live.token;
        Promise.resolve(root.LabQuilt.renderLabQuiltBlob(model, { maxEdge: 1600, grain: false }))
          .then((blob) => {
            if (!blob || this._labLive !== live || live.token !== myToken) return;
            live.url = URL.createObjectURL(blob);
            this._labLiveOldUrl = live.url;
            if (this.quiltSVG && this.quiltSVG.getAttribute('data-lab-live') === '1' && !this.quiltSVG.querySelector('[data-lab-raster]')) addImage(live.url);
          })
          .catch((e) => { try { console.warn('Lab live raster failed (flat vector stays):', e); } catch (_) { /* ignore */ } })
          .finally(() => { live.rendering = false; });
      }

      // 3) "my piece": pulse the signed-in contributor's shape(s) when they appear
      const mineIdx = new Set();
      const mineIds = new Set((userPieces || []).map((b) => b && b.id).filter((x) => x != null));
      blocks.forEach((b, i) => { if (b && mineIds.has(b.id)) mineIdx.add(i); });
      if (mineIdx.size) {
        const g = el('g', { 'data-lab-mine': '1', 'pointer-events': 'none', 'clip-path': 'url(#labLiveClip)' });
        const mine = shapesForIndices(model, mineIdx);
        const fresh = live.mineSeen !== true;
        mine.forEach((s) => {
          const p = el('path', { d: pathD(s.pts), fill: 'none', stroke: '#ffffff', 'stroke-width': '5', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', opacity: '0' });
          if (fresh) {
            const a = el('animate', { attributeName: 'opacity', values: '0;1;0.15;1;0', dur: '2.4s', begin: '0.2s', fill: 'freeze' });
            p.appendChild(a);
          }
          g.appendChild(p);
        });
        live.mineSeen = true;
        svg.appendChild(g);
      }
      return true;
    } catch (err) {
      try { console.warn('Lab live quilt failed, using classic renderer:', err); } catch (_) { /* ignore */ }
      if (this.quiltSVG) this.quiltSVG.removeAttribute('data-lab-live');
      return false;
    }
  }

  const api = { enabled, available, localOn, labLiveTry, LS_KEY, _state: state };
  root.LabQuiltLive = api;
  if (root.QuiltRendererV2 && root.QuiltRendererV2.prototype) root.QuiltRendererV2.prototype._labLiveTry = labLiveTry;
  else if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
