/**
 * SEAMSIDE podcast inline player widget.
 * Browser: global.SeamsidePodcastWidget
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SeamsidePodcastWidget = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {},
function (global) {
  'use strict';

  const STYLE_ID = 'seamside-podcast-widget-styles-v1';
  const DEFAULT_COVER = 'assets/seamside for web.jpeg';
  const DEFAULT_SHOW_URL =
    'https://podcasts.apple.com/us/podcast/seamside-exploring-the-inner-work-of-textiles/id1599084747';

  let activeAudio = null;
  let activeHost = null;

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .seamside-podcast-widget {
        margin: 0.85rem auto 0;
        max-width: 22rem;
        width: min(100%, 22rem);
      }
      .seamside-podcast-widget__slab {
        background: rgba(255, 252, 247, 0.94);
        border: 1px solid rgba(72, 52, 38, 0.12);
        border-radius: 14px;
        box-shadow: 0 10px 28px rgba(48, 34, 24, 0.08);
        overflow: hidden;
      }
      .seamside-podcast-widget__body {
        display: grid;
        grid-template-columns: 4.5rem 1fr;
        gap: 0.75rem;
        padding: 0.85rem 0.9rem 0.65rem;
        align-items: start;
      }
      .seamside-podcast-widget__cover {
        width: 4.5rem;
        height: 4.5rem;
        border-radius: 10px;
        object-fit: cover;
        background: #f2e8dc;
      }
      .seamside-podcast-widget__copy {
        min-width: 0;
      }
      .seamside-podcast-widget__kicker {
        margin: 0 0 0.2rem;
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(72, 52, 38, 0.62);
      }
      .seamside-podcast-widget__title {
        margin: 0;
        font-size: 0.92rem;
        line-height: 1.35;
        color: rgba(36, 24, 16, 0.92);
        font-weight: 600;
      }
      .seamside-podcast-widget__controls {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0 0.9rem 0.75rem;
      }
      .seamside-podcast-widget__play {
        appearance: none;
        border: 0;
        border-radius: 999px;
        width: 2.35rem;
        height: 2.35rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(72, 52, 38, 0.92);
        color: #fff;
        cursor: pointer;
        flex: 0 0 auto;
      }
      .seamside-podcast-widget__play:focus-visible {
        outline: 2px solid rgba(72, 52, 38, 0.45);
        outline-offset: 2px;
      }
      .seamside-podcast-widget__play[disabled] {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .seamside-podcast-widget__timeline {
        flex: 1 1 auto;
        min-width: 0;
      }
      .seamside-podcast-widget__progress {
        appearance: none;
        width: 100%;
        height: 0.35rem;
        border-radius: 999px;
        background: rgba(72, 52, 38, 0.14);
        cursor: pointer;
      }
      .seamside-podcast-widget__progress::-webkit-slider-thumb {
        appearance: none;
        width: 0.75rem;
        height: 0.75rem;
        border-radius: 50%;
        background: rgba(72, 52, 38, 0.88);
      }
      .seamside-podcast-widget__time {
        margin-top: 0.2rem;
        font-size: 0.72rem;
        color: rgba(72, 52, 38, 0.62);
      }
      .seamside-podcast-widget__footer {
        padding: 0 0.9rem 0.85rem;
      }
      .seamside-podcast-widget__link {
        color: rgba(72, 52, 38, 0.82);
        font-size: 0.82rem;
        text-decoration: underline;
        text-underline-offset: 0.15em;
      }
      .seamside-podcast-widget__fallback-note {
        margin: 0 0 0.35rem;
        font-size: 0.78rem;
        color: rgba(72, 52, 38, 0.68);
      }
      .seamside-podcast-widget--link-only .seamside-podcast-widget__controls {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function pauseActiveAudio(exceptHost = null) {
    if (activeAudio && activeHost !== exceptHost) {
      try {
        activeAudio.pause();
      } catch (_) {
        /* ignore */
      }
    }
    if (activeHost && activeHost !== exceptHost) {
      activeHost._seamsidePlaying = false;
      const btn = activeHost.querySelector('.seamside-podcast-widget__play');
      if (btn) btn.setAttribute('aria-label', 'Play episode');
      const icon = activeHost.querySelector('.seamside-podcast-widget__play-icon');
      if (icon) icon.textContent = '▶';
    }
    if (activeHost !== exceptHost) {
      activeAudio = null;
      activeHost = null;
    }
  }

  function speakerFirstName(name) {
    const cleaned = String(name || '').replace(/^\s*[—-]\s*/, '').trim();
    return cleaned.split(/\s+/)[0] || 'them';
  }

  function renderLinkOnly(host, episode, artistName) {
    const appleUrl = String(episode.applePodcastsUrl || episode.apple_podcasts_url || DEFAULT_SHOW_URL).trim();
    const cover = String(episode.episodeImageUrl || episode.episode_image_url || DEFAULT_COVER).trim();
    const title = String(episode.episodeTitle || episode.episode_title || 'SEAMSIDE').trim();
    host.innerHTML = `
      <div class="seamside-podcast-widget__slab seamside-podcast-widget--link-only">
        <div class="seamside-podcast-widget__body">
          <img class="seamside-podcast-widget__cover" src="${cover}" alt="" decoding="async" loading="lazy" />
          <div class="seamside-podcast-widget__copy">
            <p class="seamside-podcast-widget__kicker">Hear ${speakerFirstName(artistName)} on SEAMSIDE</p>
            <p class="seamside-podcast-widget__title">${title}</p>
          </div>
        </div>
        <div class="seamside-podcast-widget__footer">
          <p class="seamside-podcast-widget__fallback-note">Listen in Apple Podcasts</p>
          <a class="seamside-podcast-widget__link" href="${appleUrl}" target="_blank" rel="noopener noreferrer">Open in Apple Podcasts</a>
        </div>
      </div>
    `;
    host.hidden = false;
    host.removeAttribute('aria-hidden');
  }

  function renderPlayer(host, episode, artistName) {
    const audioUrl = String(episode.audioUrl || episode.audio_url || '').trim();
    const appleUrl = String(episode.applePodcastsUrl || episode.apple_podcasts_url || DEFAULT_SHOW_URL).trim();
    const cover = String(episode.episodeImageUrl || episode.episode_image_url || DEFAULT_COVER).trim();
    const title = String(episode.episodeTitle || episode.episode_title || 'SEAMSIDE').trim();
    if (!audioUrl) {
      renderLinkOnly(host, episode, artistName);
      return;
    }

    host.innerHTML = `
      <div class="seamside-podcast-widget__slab">
        <div class="seamside-podcast-widget__body">
          <img class="seamside-podcast-widget__cover" src="${cover}" alt="" decoding="async" loading="lazy" />
          <div class="seamside-podcast-widget__copy">
            <p class="seamside-podcast-widget__kicker">Hear ${speakerFirstName(artistName)} on SEAMSIDE</p>
            <p class="seamside-podcast-widget__title">${title}</p>
          </div>
        </div>
        <div class="seamside-podcast-widget__controls">
          <button type="button" class="seamside-podcast-widget__play" aria-label="Play episode">
            <span class="seamside-podcast-widget__play-icon" aria-hidden="true">▶</span>
          </button>
          <div class="seamside-podcast-widget__timeline">
            <input type="range" class="seamside-podcast-widget__progress" min="0" max="1000" value="0" aria-label="Episode progress" />
            <div class="seamside-podcast-widget__time"><span class="seamside-podcast-widget__elapsed">0:00</span> / <span class="seamside-podcast-widget__duration">0:00</span></div>
          </div>
        </div>
        <div class="seamside-podcast-widget__footer">
          <a class="seamside-podcast-widget__link" href="${appleUrl}" target="_blank" rel="noopener noreferrer">Open in Apple Podcasts</a>
        </div>
        <audio class="seamside-podcast-widget__audio" preload="metadata" src="${audioUrl}"></audio>
      </div>
    `;

    const audio = host.querySelector('.seamside-podcast-widget__audio');
    const playBtn = host.querySelector('.seamside-podcast-widget__play');
    const progress = host.querySelector('.seamside-podcast-widget__progress');
    const elapsedEl = host.querySelector('.seamside-podcast-widget__elapsed');
    const durationEl = host.querySelector('.seamside-podcast-widget__duration');
    const playIcon = host.querySelector('.seamside-podcast-widget__play-icon');

    host._seamsidePlaying = false;

    const syncProgress = () => {
      const duration = Number(audio.duration);
      const current = Number(audio.currentTime);
      if (Number.isFinite(duration) && duration > 0) {
        progress.value = String(Math.round((current / duration) * 1000));
        durationEl.textContent = formatTime(duration);
      }
      elapsedEl.textContent = formatTime(current);
    };

    audio.addEventListener('loadedmetadata', syncProgress);
    audio.addEventListener('timeupdate', syncProgress);
    audio.addEventListener('ended', () => {
      host._seamsidePlaying = false;
      playIcon.textContent = '▶';
      playBtn.setAttribute('aria-label', 'Play episode');
      if (activeHost === host) {
        activeAudio = null;
        activeHost = null;
      }
    });
    audio.addEventListener('error', () => {
      renderLinkOnly(host, episode, artistName);
    });

    playBtn.addEventListener('click', async () => {
      if (!audio) return;
      if (host._seamsidePlaying) {
        audio.pause();
        host._seamsidePlaying = false;
        playIcon.textContent = '▶';
        playBtn.setAttribute('aria-label', 'Play episode');
        if (activeHost === host) {
          activeAudio = null;
          activeHost = null;
        }
        return;
      }
      pauseActiveAudio(host);
      try {
        await audio.play();
        host._seamsidePlaying = true;
        playIcon.textContent = '❚❚';
        playBtn.setAttribute('aria-label', 'Pause episode');
        activeAudio = audio;
        activeHost = host;
      } catch (_) {
        renderLinkOnly(host, episode, artistName);
      }
    });

    progress.addEventListener('input', () => {
      const duration = Number(audio.duration);
      if (!Number.isFinite(duration) || duration <= 0) return;
      const ratio = Number(progress.value) / 1000;
      audio.currentTime = duration * ratio;
      syncProgress();
    });

    host.hidden = false;
    host.removeAttribute('aria-hidden');
  }

  function hideHost(host) {
    if (!host) return;
    pauseActiveAudio(host);
    host.hidden = true;
    host.setAttribute('aria-hidden', 'true');
    host.innerHTML = '';
  }

  function refresh(host, quote, quoteService) {
    injectStyles();
    if (!host) return;
    if (!quoteService || typeof quoteService.isSeamsideQuote !== 'function') {
      hideHost(host);
      return;
    }
    if (!quoteService.isSeamsideQuote(quote)) {
      hideHost(host);
      return;
    }
    const author = String(quote?.author || '').trim();
    const episode = quoteService.lookupSeamsideEpisodeForAuthor(author);
    if (!episode) {
      hideHost(host);
      return;
    }
    pauseActiveAudio(null);
    renderPlayer(host, episode, author);
  }

  function pauseForNavigation() {
    pauseActiveAudio(null);
  }

  return {
    refresh,
    pauseForNavigation
  };
});
