/**
 * Live mood-spread carousel: center quote + flanks; tap flanks to slide to good/rough columns.
 * Browser: global.QuiltMoodSpreadWidget.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.QuiltMoodSpreadWidget = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function (global) {
  'use strict';

  const STYLE_ID = 'quilt-mood-spread-widget-styles';
  const TRANSITION_MS = 420;

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #screen-quilt .quilt-mood-spread {
        width: 100%;
        max-width: 100%;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        position: relative;
        z-index: 5;
      }

      #screen-quilt .quilt-mood-spread[hidden] {
        display: none !important;
      }

      #screen-quilt .quilt-mood-spread__viewport {
        position: relative;
        width: 100%;
        overflow: hidden;
        touch-action: pan-y pinch-zoom;
        -webkit-tap-highlight-color: transparent;
        background: transparent;
        box-shadow: none;
      }

      #screen-quilt .quilt-mood-spread__viewport.is-sliding::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 3;
        pointer-events: none;
        background: repeating-linear-gradient(
          0deg,
          rgba(35, 28, 22, 0) 0,
          rgba(35, 28, 22, 0) 3px,
          rgba(35, 28, 22, 0.045) 3px,
          rgba(35, 28, 22, 0.045) 4px
        );
        opacity: 0;
        animation: quilt-mood-spread-scan-shimmer ${TRANSITION_MS}ms ease-out forwards;
      }

      @keyframes quilt-mood-spread-scan-shimmer {
        0% {
          opacity: 0;
          transform: translate3d(0, -6%, 0);
        }
        35% {
          opacity: 0.55;
        }
        100% {
          opacity: 0;
          transform: translate3d(0, 6%, 0);
        }
      }

      #screen-quilt .quilt-mood-spread__track {
        will-change: transform;
        transition: transform ${TRANSITION_MS}ms cubic-bezier(0.33, 1, 0.68, 1);
      }

      #screen-quilt .quilt-mood-spread__track.is-instant {
        transition: none;
      }

      #screen-quilt .quilt-mood-spread__img {
        display: block;
        width: auto;
        height: auto;
        max-width: none;
        user-select: none;
        -webkit-user-drag: none;
        pointer-events: none;
        filter: var(
          --odq-artifact-shadow,
          drop-shadow(0 4px 14px rgba(45, 36, 29, 0.14))
            drop-shadow(0 1px 3px rgba(45, 36, 29, 0.1))
            drop-shadow(0 8px 20px rgba(28, 32, 42, 0.06))
        );
      }

      #screen-quilt .quilt-mood-spread__hits {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
      }

      #screen-quilt .quilt-mood-spread__hit {
        position: absolute;
        top: 0;
        bottom: 0;
        margin: 0;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        pointer-events: auto;
        -webkit-tap-highlight-color: transparent;
      }

      #screen-quilt .quilt-mood-spread__hit:focus-visible {
        outline: 2px solid rgba(0, 0, 0, 0.35);
        outline-offset: -2px;
      }

      #screen-quilt .quilt-mood-spread__hit--left {
        left: 0;
      }

      #screen-quilt .quilt-mood-spread__hit--center {
        top: 0;
        bottom: 0;
      }

      #screen-quilt .quilt-mood-spread__hit--right {
        right: 0;
      }
    `;
    document.head.appendChild(style);
  }

  function panelToMood(panel) {
    if (panel === 'good') return 'good';
    if (panel === 'rough') return 'rough';
    return null;
  }

  function moodToPanel(mood) {
    if (mood === 'good') return 'good';
    if (mood === 'rough') return 'rough';
    return 'center';
  }

  /**
   * @param {HTMLElement} host
   * @param {{
   *   dataUrl: string,
   *   metrics: object,
   *   slides: object,
   *   initialPanel?: 'center'|'good'|'rough',
   *   instant?: boolean,
   *   onSelect?: (mood: 'good'|'rough', panel: string) => void,
   *   onPanelChange?: (panel: string) => void
   * }} opts
   */
  function mount(host, opts = {}) {
    if (!host) return null;
    injectStyles();

    const dataUrl = String(opts.dataUrl || '').trim();
    const metrics = opts.metrics || {};
    let slides = opts.slides || {};
    if (!slides.viewportW && metrics.viewportW) {
      const offsets = global.QuiltNewspaperClipping?.resolveMoodSpreadSlideOffsets?.(metrics);
      if (offsets) slides = { ...offsets, ...slides };
    }
    if (!dataUrl || !slides.viewportW) {      return null;
    }

    const viewportW = Math.max(1, Number(slides.viewportW) || Number(metrics.viewportW) || 1);
    const flankW = Math.max(1, Number(metrics.flankW) || 1);
    const gap = Math.max(0, Number(metrics.gap) || 0);
    const centerOutW = Math.max(1, Number(metrics.centerOutW) || 1);
    const outW = Math.max(viewportW, Number(metrics.outW) || viewportW);
    const outH = Math.max(1, Number(metrics.outH) || 1);

    host.innerHTML = '';
    host.classList.remove('is-good', 'is-rough', 'is-center');
    host.dataset.panel = 'center';

    const viewport = document.createElement('div');
    viewport.className = 'quilt-mood-spread__viewport';

    const track = document.createElement('div');
    track.className = 'quilt-mood-spread__track';

    const img = document.createElement('img');
    img.className = 'quilt-mood-spread__img';
    img.alt = "Today's quote with good-day and rough-day messages";
    img.decoding = 'async';
    img.draggable = false;

    const hits = document.createElement('div');
    hits.className = 'quilt-mood-spread__hits';

    const hitLeft = document.createElement('button');
    hitLeft.type = 'button';
    hitLeft.className = 'quilt-mood-spread__hit quilt-mood-spread__hit--left';
    hitLeft.setAttribute('aria-label', 'Show good-day message');

    const hitCenter = document.createElement('button');
    hitCenter.type = 'button';
    hitCenter.className = 'quilt-mood-spread__hit quilt-mood-spread__hit--center';
    hitCenter.setAttribute('aria-label', "Show today's quote");

    const hitRight = document.createElement('button');
    hitRight.type = 'button';
    hitRight.className = 'quilt-mood-spread__hit quilt-mood-spread__hit--right';
    hitRight.setAttribute('aria-label', 'Show rough-day message');

    hits.append(hitLeft, hitCenter, hitRight);
    track.appendChild(img);
    viewport.append(track, hits);
    host.appendChild(viewport);
    host.setAttribute('hidden', 'hidden');
    host.classList.remove('is-ready');

    let panel = 'center';
    if (opts.initialPanel === 'center' || opts.initialPanel === 'good' || opts.initialPanel === 'rough') {
      panel = opts.initialPanel;
    }

    let displayScale = 1;
    let resizeObserver = null;
    let intersectionObserver = null;
    let readyNotified = false;

    function notifyReadyOnce() {
      if (readyNotified || !host.classList.contains('is-ready')) return;
      readyNotified = true;
      opts.onReady?.();
    }

    function readViewportWidthPx() {
      const rect = viewport.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      let w = Math.max(
        viewport.clientWidth,
        rect.width,
        host.clientWidth,
        hostRect.width
      );
      if (w >= 48) return w;
      const stack = host.closest('.quote-card-stack');
      if (stack) {
        const stackRect = stack.getBoundingClientRect();
        if (stackRect.width >= 48) return stackRect.width;
      }
      const doc = global.document;
      const docW = doc?.documentElement?.clientWidth || global.innerWidth || 390;
      return Math.max(48, docW);
    }

    function flankFrac() {
      return flankW / viewportW;
    }

    function centerFracStart() {
      return (flankW + gap) / viewportW;
    }

    function centerFracEnd() {
      return (flankW + gap + centerOutW) / viewportW;
    }

    function layoutHits() {
      const f = flankFrac();
      const c0 = centerFracStart();
      const c1 = centerFracEnd();
      hitLeft.style.width = `${f * 100}%`;
      hitCenter.style.left = `${c0 * 100}%`;
      hitCenter.style.width = `${Math.max(0, c1 - c0) * 100}%`;
      hitRight.style.width = `${f * 100}%`;
    }

    function snapTranslatePx(px) {
      const dpr = typeof global.devicePixelRatio === 'number' && global.devicePixelRatio > 0
        ? global.devicePixelRatio
        : 1;
      return Math.round(px * dpr) / dpr;
    }

    function pulseSlideShimmer() {
      viewport.classList.remove('is-sliding');
      void viewport.offsetWidth;
      viewport.classList.add('is-sliding');
      global.setTimeout(() => viewport.classList.remove('is-sliding'), TRANSITION_MS + 40);
    }

    function applyPanelState({ instant = false, shimmer = false } = {}) {
      host.classList.toggle('is-good', panel === 'good');
      host.classList.toggle('is-rough', panel === 'rough');
      host.classList.toggle('is-center', panel === 'center');
      host.dataset.panel = panel;

      const offset = Number(slides[panel]);
      const tx = Number.isFinite(offset) ? snapTranslatePx(offset * displayScale) : 0;
      track.classList.toggle('is-instant', !!instant);
      track.style.transform = `translate3d(${tx}px, 0, 0)`;
      if (instant) {
        requestAnimationFrame(() => track.classList.remove('is-instant'));
      }
      if (shimmer && !instant) {
        pulseSlideShimmer();
      }

      opts.onPanelChange?.(panel);
    }

    function syncSpreadVisibility(imgW, imgH) {
      const imgReady = img.naturalWidth > 0 && img.naturalHeight > 0;
      if (imgReady) {
        host.classList.add('is-ready');
        host.removeAttribute('hidden');
        host.removeAttribute('aria-hidden');
        notifyReadyOnce();
        if (imgW < 48 || imgH < 12) {
          scheduleMeasure({ instant: true });
        }
        return;
      }
      host.classList.remove('is-ready');
      host.setAttribute('hidden', 'hidden');
      host.setAttribute('aria-hidden', 'true');
    }

    function measureAndFit({ instant = false } = {}) {
      const vw = readViewportWidthPx();
      const natW = img.naturalWidth > 0 ? img.naturalWidth : outW;
      const natH = img.naturalHeight > 0 ? img.naturalHeight : outH;
      displayScale = vw / viewportW;
      const imgW = natW * displayScale;
      const imgH = natH * displayScale;
      img.style.width = `${imgW}px`;
      img.style.height = `${imgH}px`;
      viewport.style.height = `${imgH}px`;
      layoutHits();
      applyPanelState({ instant });
      syncSpreadVisibility(imgW, imgH);
    }

    function scheduleMeasure({ instant = false } = {}) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => measureAndFit({ instant }));
      });
    }

    function setPanel(next, { instant = false, fromUser = false } = {}) {
      const target =
        next === 'good' || next === 'rough' || next === 'center' ? next : 'center';
      if (panel === target) return;
      panel = target;
      applyPanelState({ instant, shimmer: !instant });
      if (fromUser) {
        const mood = panelToMood(panel);
        if (mood) opts.onSelect?.(mood, panel);
      }
    }

    hitLeft.addEventListener('click', () => {
      if (panel === 'good') setPanel('center', { fromUser: false });
      else setPanel('good', { fromUser: true });
    });
    hitRight.addEventListener('click', () => {
      if (panel === 'rough') setPanel('center', { fromUser: false });
      else setPanel('rough', { fromUser: true });
    });
    hitCenter.addEventListener('click', () => {
      if (panel !== 'center') setPanel('center', { fromUser: false });
    });

    const onResize = () => scheduleMeasure({ instant: true });
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(viewport);
      resizeObserver.observe(host);
    } else {
      global.addEventListener('resize', onResize);
    }

    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            scheduleMeasure({ instant: true });
          }
        },
        { threshold: 0.01 }
      );
      intersectionObserver.observe(host);
    }

    img.addEventListener('load', () => {
      scheduleMeasure({ instant: !!opts.instant });
    });
    img.addEventListener('error', () => {
      console.warn('[our-daily] Mood spread image failed to load');
      host.classList.remove('is-ready');
      host.setAttribute('hidden', 'hidden');
      host.setAttribute('aria-hidden', 'true');
    });

    img.src = dataUrl;
    if (typeof img.decode === 'function') {
      void img.decode().then(() => scheduleMeasure({ instant: !!opts.instant })).catch(() => {
        /* load/error handlers cover failure */
      });
    }
    if (img.complete) {
      scheduleMeasure({ instant: !!opts.instant });
    }

    const api = {
      host,
      setPanel,
      getPanel: () => panel,
      remeasure: () => scheduleMeasure({ instant: true }),
      destroy() {
        if (resizeObserver) {
          resizeObserver.disconnect();
          resizeObserver = null;
        } else {
          global.removeEventListener('resize', onResize);
        }
        if (intersectionObserver) {
          intersectionObserver.disconnect();
          intersectionObserver = null;
        }
        host.innerHTML = '';
      }
    };
    host._moodSpreadWidget = api;
    return api;
  }

  function unmount(host) {
    if (!host) return;
    host._moodSpreadWidget?.destroy?.();
    delete host._moodSpreadWidget;
    host.innerHTML = '';
    host.setAttribute('hidden', 'hidden');
    host.setAttribute('aria-hidden', 'true');
    host.classList.remove('is-good', 'is-rough', 'is-center', 'is-ready');
    delete host.dataset.panel;
  }

  return {
    injectStyles,
    mount,
    unmount,
    moodToPanel,
    panelToMood
  };
});
