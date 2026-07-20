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

  const DEFAULT_COVER = 'assets/seamside for web.jpeg';
  const DEFAULT_SHOW_URL =
    'https://podcasts.apple.com/us/podcast/seamside-exploring-the-inner-work-of-textiles/id1599084747';

  let activeAudio = null;
  let activeHost = null;

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

  function setHostLinkOnly(host, linkOnly) {
    host.classList.toggle('seamside-podcast-widget-host--link-only', !!linkOnly);
  }

  function cardPromptHtml() {
    return '<p class="seamside-podcast-widget__prompt">Hear more on SEAMSIDE</p>';
  }

  function cardFooterHtml(appleUrl, { linkOnly = false } = {}) {
    const note = linkOnly
      ? '<p class="seamside-podcast-widget__fallback-note">Listen in Apple Podcasts</p>'
      : '';
    return `
      <div class="seamside-podcast-widget__card-footer">
        ${note}
        <a class="seamside-podcast-widget__link" href="${appleUrl}" target="_blank" rel="noopener noreferrer">Open in Apple Podcasts</a>
      </div>
    `;
  }

  function renderLinkOnly(host, episode, artistName) {
    const appleUrl = String(episode.applePodcastsUrl || episode.apple_podcasts_url || DEFAULT_SHOW_URL).trim();
    const cover = String(episode.episodeImageUrl || episode.episode_image_url || DEFAULT_COVER).trim();
    const title = String(episode.episodeTitle || episode.episode_title || 'SEAMSIDE').trim();
    setHostLinkOnly(host, true);
    host.innerHTML = `
      <div class="quote-speaker-slab-body">
        ${cardPromptHtml()}
        <div class="seamside-podcast-widget__player-zone">
          <div class="seamside-podcast-widget__header">
            <img class="seamside-podcast-widget__cover" src="${cover}" alt="" decoding="async" loading="eager" />
            <div class="seamside-podcast-widget__copy">
              <p class="seamside-podcast-widget__title">${title}</p>
            </div>
          </div>
        </div>
        ${cardFooterHtml(appleUrl, { linkOnly: true })}
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

    setHostLinkOnly(host, false);
    host.innerHTML = `
      <div class="quote-speaker-slab-body">
        ${cardPromptHtml()}
        <div class="seamside-podcast-widget__player-zone">
          <div class="seamside-podcast-widget__header">
            <img class="seamside-podcast-widget__cover" src="${cover}" alt="" decoding="async" loading="eager" />
            <div class="seamside-podcast-widget__copy">
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
          <audio class="seamside-podcast-widget__audio" preload="metadata" src="${audioUrl}"></audio>
        </div>
        ${cardFooterHtml(appleUrl)}
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
    host.classList.remove('seamside-podcast-widget-host--link-only');
    host.innerHTML = '';
  }

  function refresh(host, quote, quoteService) {
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
