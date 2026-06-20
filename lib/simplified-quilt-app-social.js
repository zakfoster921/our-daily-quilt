/**
 * Social posts feed + admin composer (images/videos with threaded comments).
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2Social {
    canAccessSocialPosts() {
      return !!this.isCurrentUserAdmin?.();
    }

    guardSocialPostsAccess({ redirect = true } = {}) {
      if (this.canAccessSocialPosts()) return true;
      if (redirect) {
        this.uiService?.showToast?.('Admin access required');
        this.uiService?.showScreen?.('screen-quilt');
      }
      return false;
    }

    setupSocialEventHandlers() {
      document.addEventListener('screenChange', (e) => {
        if (e.detail.screenId === 'screen-social-posts') {
          this.initializeSocialPostsFeedScreen();
        }
        if (e.detail.screenId === 'screen-social-post-compose') {
          this.initializeSocialPostComposeScreen();
        }
        if (e.detail.screenId === 'screen-social-post-manage') {
          this.initializeSocialPostManageScreen();
        }
      });
    }

    socialPostMediaUrlLooksLikeVideo(url) {
      const raw = String(url || '').trim().toLowerCase();
      if (!raw) return false;
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch (_) {
        decoded = raw;
      }
      return /\.(mp4|mov|webm|m4v)(\?|#|$|&)/i.test(raw) || /\.(mp4|mov|webm|m4v)(\?|#|$|&)/i.test(decoded);
    }

    isSocialPostVideoMedia(item) {
      if (!item || typeof item !== 'object') return false;
      if (String(item.type || '').trim().toLowerCase() === 'video') return true;
      const mime = String(item.mime || item.file?.type || '').trim().toLowerCase();
      if (mime.startsWith('video/')) return true;
      return this.socialPostMediaUrlLooksLikeVideo(item.url || item.previewUrl || '');
    }

    inferSocialPostVideoMime(url) {
      const lower = String(url || '').toLowerCase();
      if (lower.includes('.webm')) return 'video/webm';
      if (lower.includes('.mov')) return 'video/quicktime';
      return 'video/mp4';
    }

    buildSocialPostFeedVideoHtml(safeUrl) {
      return `<div class="social-post-video-frame">
        <video class="social-post-media social-post-media--video" src="${safeUrl}" autoplay muted playsinline loop preload="auto" disablepictureinpicture></video>
        <button type="button" class="social-post-video-mute" aria-label="Unmute video" aria-pressed="true">
          <svg class="social-post-video-mute__icon social-post-video-mute__icon--muted" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor"></path>
            <path d="M16 9l5 5M21 9l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
          </svg>
          <svg class="social-post-video-mute__icon social-post-video-mute__icon--unmuted" viewBox="0 0 24 24" aria-hidden="true" focusable="false" hidden>
            <path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor"></path>
            <path d="M15.5 8.5a5 5 0 010 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
            <path d="M17.8 6.2a8 8 0 010 11.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
          </svg>
        </button>
      </div>`;
    }

    buildSocialPostCarouselHtml(items, { classPrefix = 'social-post' } = {}) {
      const media = Array.isArray(items) ? items : [];
      if (!media.length) {
        return `<div class="${classPrefix}-media-frame ${classPrefix}-media-frame--empty">No media</div>`;
      }
      const renderMediaItem = (item) => {
        const safeUrl = this.escapeQuiltFortuneText(item.url || item.previewUrl || '');
        if (this.isSocialPostVideoMedia(item)) {
          if (classPrefix === 'social-post') {
            return this.buildSocialPostFeedVideoHtml(safeUrl);
          }
          return `<video class="${classPrefix}-media" src="${safeUrl}" controls playsinline preload="metadata"></video>`;
        }
        const zoomableClass = classPrefix === 'social-post' ? ' social-post-media--zoomable' : '';
        return `<img class="${classPrefix}-media${zoomableClass}" src="${safeUrl}" alt="" loading="lazy" />`;
      };
      if (media.length === 1) {
        return `<div class="${classPrefix}-media-frame">${renderMediaItem(media[0])}</div>`;
      }
      const slides = media
        .map((item, index) => {
          return `<div class="${classPrefix}-carousel-slide${index === 0 ? ` ${classPrefix}-carousel-slide--active` : ''}" data-slide-index="${index}">${renderMediaItem(item)}</div>`;
        })
        .join('');
      const dots = media
        .map(
          (_, index) =>
            `<button type="button" class="${classPrefix}-carousel-dot${index === 0 ? ` ${classPrefix}-carousel-dot--active` : ''}" data-slide-index="${index}" aria-label="Show slide ${index + 1}"></button>`
        )
        .join('');
      return `<div class="${classPrefix}-carousel" data-slide-count="${media.length}"><div class="${classPrefix}-carousel-track">${slides}</div><div class="${classPrefix}-carousel-dots">${dots}</div></div>`;
    }

    setSocialPostCarouselSlide(carousel, index) {
      if (!carousel) return;
      carousel.querySelectorAll('[data-slide-index]').forEach((el) => {
        if (!el.className.includes('carousel-slide') && !el.className.includes('carousel-dot')) return;
        const isActive = Number(el.getAttribute('data-slide-index')) === index;
        if (el.className.includes('carousel-slide')) {
          el.classList.toggle('social-post-carousel-slide--active', isActive);
          el.classList.toggle('social-post-compose-carousel-slide--active', isActive);
        } else if (el.className.includes('carousel-dot')) {
          el.classList.toggle('social-post-carousel-dot--active', isActive);
          el.classList.toggle('social-post-compose-carousel-dot--active', isActive);
        }
      });
      this.syncSocialPostCarouselVideos(carousel);
      this.scheduleSocialPostFeedVideoPlaybackUpdate();
    }

    syncSocialPostCarouselVideos(carousel) {
      if (!carousel) return;
      carousel.querySelectorAll('video.social-post-media--video').forEach((video) => {
        const slide = video.closest('[class*="-carousel-slide"]');
        const isActive =
          slide?.classList.contains('social-post-carousel-slide--active') ||
          slide?.classList.contains('social-post-compose-carousel-slide--active');
        if (isActive) {
          this.tryPlaySocialPostVideo(video);
        } else {
          video.pause();
        }
      });
    }

    isSocialPostVideoEligibleForAutoplay(video) {
      const slide = video?.closest?.('.social-post-carousel-slide, .social-post-compose-carousel-slide');
      if (!slide) return true;
      return (
        slide.classList.contains('social-post-carousel-slide--active') ||
        slide.classList.contains('social-post-compose-carousel-slide--active')
      );
    }

    syncSocialPostFeedVideoMuteUi(video) {
      const frame = video?.closest?.('.social-post-video-frame');
      const muteBtn = frame?.querySelector('.social-post-video-mute');
      const mutedIcon = muteBtn?.querySelector('.social-post-video-mute__icon--muted');
      const unmutedIcon = muteBtn?.querySelector('.social-post-video-mute__icon--unmuted');
      const muted = !!video?.muted;
      if (muteBtn) {
        muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        muteBtn.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
        muteBtn.classList.toggle('social-post-video-mute--unmuted', !muted);
      }
      if (mutedIcon) {
        mutedIcon.toggleAttribute('hidden', !muted);
        mutedIcon.setAttribute('aria-hidden', muted ? 'false' : 'true');
      }
      if (unmutedIcon) {
        unmutedIcon.toggleAttribute('hidden', !muted);
        unmutedIcon.setAttribute('aria-hidden', muted ? 'true' : 'false');
      }
    }

    updateSocialPostFeedVideoPlayback() {
      const feed = document.getElementById('socialPostsFeed');
      const scroller = document.getElementById('screen-social-posts');
      if (!feed) return;
      const viewportHeight = scroller?.clientHeight || window.innerHeight || 0;
      const viewportTop = scroller?.getBoundingClientRect?.().top || 0;
      const eligible = Array.from(feed.querySelectorAll('video.social-post-media--video')).filter((video) =>
        this.isSocialPostVideoEligibleForAutoplay(video)
      );
      let best = null;
      let bestVisible = 0;
      eligible.forEach((video) => {
        const rect = video.getBoundingClientRect();
        const visibleTop = Math.max(viewportTop, rect.top);
        const visibleBottom = Math.min(viewportTop + viewportHeight, rect.bottom);
        const visible = Math.max(0, visibleBottom - visibleTop);
        if (visible > bestVisible) {
          bestVisible = visible;
          best = video;
        }
      });
      const minVisible = Math.max(72, viewportHeight * 0.18);
      feed.querySelectorAll('video.social-post-media--video').forEach((video) => {
        if (video === best && bestVisible >= minVisible) {
          const userUnmuted = video.dataset.socialUserUnmuted === '1';
          if (userUnmuted) {
            video.muted = false;
            video.removeAttribute('muted');
            video.volume = 1;
          } else if (video.muted !== true) {
            video.muted = true;
            video.setAttribute('muted', '');
            this.syncSocialPostFeedVideoMuteUi(video);
          }
          if (video.paused) {
            this.tryPlaySocialPostVideo(video);
          }
          return;
        }
        video.pause();
        delete video.dataset.socialUserUnmuted;
        if (!video.muted) {
          video.muted = true;
          this.syncSocialPostFeedVideoMuteUi(video);
        }
      });
    }

    scheduleSocialPostFeedVideoPlaybackUpdate() {
      if (this._socialPostVideoPlaybackRaf) return;
      this._socialPostVideoPlaybackRaf = window.requestAnimationFrame(() => {
        this._socialPostVideoPlaybackRaf = 0;
        this.updateSocialPostFeedVideoPlayback();
      });
    }

    tryPlaySocialPostVideo(video) {
      if (!video) return;
      const attempt = video.play?.();
      if (attempt?.catch) attempt.catch(() => {});
    }

    bindSocialPostFeedVideoElement(video) {
      if (!video || video.dataset.socialVideoBound === '1') return;
      video.dataset.socialVideoBound = '1';
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.controls = false;
      video.removeAttribute('controls');

      const frame = video.closest('.social-post-video-frame');
      const muteBtn = frame?.querySelector('.social-post-video-mute');

      const syncMuteUi = () => this.syncSocialPostFeedVideoMuteUi(video);

      const pauseOtherFeedVideos = () => {
        const feed = document.getElementById('socialPostsFeed');
        feed?.querySelectorAll('video.social-post-media--video').forEach((other) => {
          if (other === video) return;
          other.pause();
          delete other.dataset.socialUserUnmuted;
          other.muted = true;
          this.syncSocialPostFeedVideoMuteUi(other);
        });
      };

      const toggleMute = () => {
        const nextMuted = !video.muted;
        if (nextMuted) {
          video.muted = true;
          video.setAttribute('muted', '');
          delete video.dataset.socialUserUnmuted;
        } else {
          video.dataset.socialUserUnmuted = '1';
          video.muted = false;
          video.removeAttribute('muted');
          video.volume = 1;
          pauseOtherFeedVideos();
          const attempt = video.play?.();
          if (attempt?.catch) attempt.catch(() => {});
        }
        syncMuteUi();
      };

      let suppressClick = false;
      const handleUnmuteTap = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.type === 'touchend') suppressClick = true;
        toggleMute();
      };
      const handleUnmuteClick = (event) => {
        if (suppressClick) {
          suppressClick = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        handleUnmuteTap(event);
      };

      muteBtn?.addEventListener('touchend', handleUnmuteTap, { passive: false });
      muteBtn?.addEventListener('click', handleUnmuteClick);

      frame?.addEventListener('touchend', (event) => {
        if (event.target.closest('.social-post-video-mute')) return;
        handleUnmuteTap(event);
      }, { passive: false });
      frame?.addEventListener('click', (event) => {
        if (event.target.closest('.social-post-video-mute')) return;
        handleUnmuteClick(event);
      });

      syncMuteUi();
      video.addEventListener('volumechange', syncMuteUi);
      video.addEventListener('loadeddata', () => this.scheduleSocialPostFeedVideoPlaybackUpdate());

      if (!this._socialPostVideoObserver) {
        this._socialPostVideoObserver = new IntersectionObserver(
          () => this.scheduleSocialPostFeedVideoPlaybackUpdate(),
          { root: document.getElementById('screen-social-posts'), threshold: [0, 0.2, 0.45, 0.7] }
        );
      }
      this._socialPostVideoObserver.observe(video);
    }

    bindSocialPostFeedVideos(rootEl) {
      const scope = rootEl || document.getElementById('socialPostsFeed');
      if (!scope) return;
      scope.querySelectorAll('video.social-post-media--video').forEach((video) => {
        this.bindSocialPostFeedVideoElement(video);
      });
      if (!this._socialPostFeedVideoScrollBound) {
        const scroller = document.getElementById('screen-social-posts');
        scroller?.addEventListener('scroll', () => this.scheduleSocialPostFeedVideoPlaybackUpdate(), {
          passive: true
        });
        this._socialPostFeedVideoScrollBound = true;
      }
      this.scheduleSocialPostFeedVideoPlaybackUpdate();
    }

    bindSocialPostCarouselSwipe(rootEl) {
      if (!rootEl || rootEl.dataset.carouselSwipeBound === '1') return;
      rootEl.dataset.carouselSwipeBound = '1';
      rootEl.addEventListener('click', (event) => {
        const dot = event.target.closest('[class*="-carousel-dot"]');
        if (!dot) return;
        const carousel = dot.closest('[class*="-carousel"]');
        this.setSocialPostCarouselSlide(carousel, Number(dot.getAttribute('data-slide-index') || 0));
      });
      rootEl.addEventListener(
        'touchstart',
        (event) => {
          const carousel = event.target.closest('[class*="-carousel"]');
          if (!carousel || (carousel.dataset.slideCount || '1') <= 1) return;
          carousel._touchStartX = event.touches?.[0]?.clientX ?? null;
        },
        { passive: true }
      );
      rootEl.addEventListener(
        'touchend',
        (event) => {
          const carousel = event.target.closest('[class*="-carousel"]');
          if (!carousel || carousel._touchStartX == null) return;
          const endX = event.changedTouches?.[0]?.clientX ?? carousel._touchStartX;
          const delta = endX - carousel._touchStartX;
          carousel._touchStartX = null;
          if (Math.abs(delta) < 40) return;
          const count = Number(carousel.dataset.slideCount || 1);
          const active = Number(
            carousel.querySelector('[class*="-carousel-slide--active"]')?.getAttribute('data-slide-index') || 0
          );
          const next = delta < 0 ? Math.min(count - 1, active + 1) : Math.max(0, active - 1);
          this.setSocialPostCarouselSlide(carousel, next);
        },
        { passive: true }
      );
    }

    getSocialPostApiBaseUrl() {
      const configured = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
      if (!configured) return '';
      try {
        if (typeof location !== 'undefined') {
          const host = String(location.hostname || '').toLowerCase();
          const isLocalPage = host === 'localhost' || host === '127.0.0.1';
          const isLocalBackend = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured);
          // npm run dev: page and BACKEND both localhost — use local API.
          if (isLocalPage && isLocalBackend) return configured;
        }
      } catch (_) {
        /* ignore */
      }
      // Static localhost preview (Live Server, etc.) or production app — use configured Railway API.
      return configured;
    }

    async getSocialPostAdminToken({ promptIfMissing = true } = {}) {
      const storageKey = 'ourDailyResetToken';
      let token = '';
      try {
        token = String(localStorage.getItem(storageKey) || '').trim();
      } catch (_) {
        token = '';
      }
      if (!token && promptIfMissing) {
        const entered = window.prompt(
          'Paste your Railway RESET_TOKEN to publish community posts.\n\nRailway → your service → Variables → RESET_TOKEN\n\nIt will be saved in this browser.'
        );
        if (entered === null) return '';
        token = String(entered || '').trim();
        if (!token) return '';
        try {
          localStorage.setItem(storageKey, token);
        } catch (_) {
          /* ignore */
        }
      }
      return token;
    }

    buildSocialPostAdminHeaders(token) {
      return {
        'Content-Type': 'application/json',
        'x-reset-token': token
      };
    }

    generateSocialPostId() {
      return `post_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    inferSocialPostFileMime(file) {
      const declared = String(file?.type || '').trim().toLowerCase();
      if (declared && declared !== 'application/octet-stream') return declared;
      const name = String(file?.name || '').toLowerCase();
      if (name.endsWith('.png')) return 'image/png';
      if (name.endsWith('.webp')) return 'image/webp';
      if (name.endsWith('.gif')) return 'image/gif';
      if (name.endsWith('.heic')) return 'image/heic';
      if (name.endsWith('.heif')) return 'image/heif';
      if (name.endsWith('.mp4')) return 'video/mp4';
      if (name.endsWith('.mov')) return 'video/quicktime';
      if (name.endsWith('.webm')) return 'video/webm';
      return 'image/jpeg';
    }

    readFileAsDataUrl(file) {
      const mime = this.inferSocialPostFileMime(file);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          let dataUrl = String(reader.result || '').trim();
          if (!dataUrl) {
            reject(new Error('Could not read file'));
            return;
          }
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
          if (!base64) {
            reject(new Error('Could not read file data'));
            return;
          }
          if (!/^data:(?:image|video)\//i.test(dataUrl)) {
            dataUrl = `data:${mime};base64,${base64}`;
          }
          resolve(dataUrl);
        };
        reader.onerror = () => reject(reader.error || new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
    }

    async uploadSocialPostMediaFile(postId, file, index) {
      const token = await this.getSocialPostAdminToken({ promptIfMissing: false });
      const baseUrl = this.getSocialPostApiBaseUrl();
      if (!baseUrl) throw new Error('Backend URL is not configured');
      if (!token) {
        throw new Error('Missing admin token — paste your Railway RESET_TOKEN when prompted');
      }

      const contentType = this.inferSocialPostFileMime(file);
      const dataUrl = await this.readFileAsDataUrl(file);
      const res = await fetch(`${baseUrl}/api/social-posts/upload-media`, {
        method: 'POST',
        headers: this.buildSocialPostAdminHeaders(token),
        body: JSON.stringify({ postId, index, dataUrl, contentType })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.media?.url) {
        return data.media;
      }
      let apiError = data.error || res.statusText || `HTTP ${res.status}`;
      if (res.status === 401) {
        try {
          localStorage.removeItem('ourDailyResetToken');
        } catch (_) {
          /* ignore */
        }
        apiError = 'Unauthorized — check RESET_TOKEN in Railway matches what you pasted';
      } else if (res.status === 413) {
        apiError = 'File too large — try a smaller image or video';
      }
      throw new Error(apiError);
    }

    resetSocialComposeState() {
      const prev = this._socialComposeState;
      if (prev?.previewUrls) {
        prev.previewUrls.forEach((url) => {
          try {
            URL.revokeObjectURL(url);
          } catch (_) {
            /* ignore */
          }
        });
      }
      this._socialComposeState = {
        postId: this.generateSocialPostId(),
        editingPostId: '',
        existingMedia: [],
        files: [],
        caption: '',
        publishing: false,
        previewUrls: []
      };
    }

    loadSocialPostIntoComposeState(post) {
      const prev = this._socialComposeState;
      if (prev?.previewUrls) {
        prev.previewUrls.forEach((url) => {
          try {
            URL.revokeObjectURL(url);
          } catch (_) {
            /* ignore */
          }
        });
      }
      const postId = String(post?.postId || '').trim();
      this._socialComposeState = {
        postId: postId || this.generateSocialPostId(),
        editingPostId: postId,
        existingMedia: Array.isArray(post?.media) ? post.media.map((item) => ({ ...item })) : [],
        files: [],
        caption: String(post?.caption || ''),
        status: String(post?.status || 'published'),
        publishing: false,
        previewUrls: []
      };
    }

    syncSocialPostComposeHeader() {
      const title = document.querySelector('#screen-social-post-compose .social-post-compose-title');
      const description = document.querySelector('#screen-social-post-compose .social-post-compose-description');
      const danger = document.getElementById('socialPostComposeDanger');
      const editing = !!this._socialComposeState?.editingPostId;
      if (title) title.textContent = editing ? 'Edit post' : 'Compose post';
      if (description) {
        description.textContent = editing
          ? 'Update the caption or add media, then save your changes.'
          : 'Add media, write a caption, then save or publish.';
      }
      if (danger) danger.hidden = !editing;
    }

    getSocialPostComposePreviewItems(state = this._socialComposeState) {
      const existing = Array.isArray(state?.existingMedia)
        ? state.existingMedia.map((item) => ({
            url: item.url || '',
            type: this.isSocialPostVideoMedia(item) ? 'video' : 'image',
            mime: this.isSocialPostVideoMedia(item)
              ? this.inferSocialPostVideoMime(item.url || '')
              : 'image/jpeg'
          }))
        : [];
      const added = Array.isArray(state?.files)
        ? state.files.map((entry) => ({
            previewUrl: entry.previewUrl,
            type: String(entry.file?.type || '').toLowerCase().startsWith('video/') ? 'video' : 'image',
            mime: entry.file?.type || ''
          }))
        : [];
      return existing.concat(added);
    }

    async openSocialPostEditScreen(postId) {
      if (!this.isCurrentUserAdmin?.()) return;
      const id = String(postId || '').trim();
      if (!id) return;
      let post = (this._socialPostsFeedPosts || []).find((entry) => String(entry.postId || '') === id);
      if (!post) {
        try {
          const baseUrl = this.getSocialPostApiBaseUrl();
          const res = await fetch(`${baseUrl}/api/social-posts/${encodeURIComponent(id)}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            throw new Error(data.error || res.statusText || `HTTP ${res.status}`);
          }
          post = data.post;
        } catch (error) {
          this.uiService?.showToast?.(error.message || 'Could not load post');
          return;
        }
      }
      this.loadSocialPostIntoComposeState(post);
      this.uiService.showScreen('screen-social-post-compose');
    }

    initializeSocialPostComposeScreen() {
      if (!this.guardSocialPostsAccess()) return;
      if (!this._socialComposeState) {
        this.resetSocialComposeState();
      }
      this.bindSocialPostComposeControls();
      this.syncSocialPostComposeHeader();
      this.renderSocialPostComposePreview();
    }

    bindSocialPostComposeControls() {
      if (this._socialComposeControlsBound) return;
      const fileInput = document.getElementById('socialPostComposeFileInput');
      const captionInput = document.getElementById('socialPostComposeCaption');
      const saveDraftBtn = document.getElementById('socialPostComposeSaveDraft');
      const publishBtn = document.getElementById('socialPostComposePublish');
      const clearBtn = document.getElementById('socialPostComposeClear');

      fileInput?.addEventListener('change', () => this.handleSocialPostComposeFileSelect());
      captionInput?.addEventListener('input', () => {
        if (this._socialComposeState) {
          this._socialComposeState.caption = String(captionInput.value || '');
        }
        this.renderSocialPostComposePreview();
      });
      saveDraftBtn?.addEventListener('click', () => this.handleSocialPostSaveDraft());
      publishBtn?.addEventListener('click', () => this.handleSocialPostPublish());
      document.getElementById('socialPostComposeDelete')?.addEventListener('click', () => this.handleSocialPostComposeDelete());
      clearBtn?.addEventListener('click', () => {
        this.resetSocialComposeState();
        if (fileInput) fileInput.value = '';
        if (captionInput) captionInput.value = '';
        this.renderSocialPostComposePreview();
      });
      this._socialComposeControlsBound = true;
    }

    handleSocialPostComposeFileSelect() {
      const fileInput = document.getElementById('socialPostComposeFileInput');
      const files = Array.from(fileInput?.files || []);
      if (!files.length) return;
      if (!this._socialComposeState) this.resetSocialComposeState();
      const state = this._socialComposeState;
      const existingCount = Array.isArray(state.existingMedia) ? state.existingMedia.length : 0;
      const remaining = Math.max(0, 10 - state.files.length - existingCount);
      const nextFiles = files.slice(0, remaining);
      nextFiles.forEach((file) => {
        const previewUrl = URL.createObjectURL(file);
        state.previewUrls.push(previewUrl);
        state.files.push({ file, previewUrl });
      });
      if (fileInput) fileInput.value = '';
      this.renderSocialPostComposePreview();
    }

    renderSocialPostComposePreview() {
      const preview = document.getElementById('socialPostComposePreview');
      const captionInput = document.getElementById('socialPostComposeCaption');
      if (!preview) return;
      const state = this._socialComposeState || { files: [], caption: '', existingMedia: [] };
      if (captionInput && captionInput.value !== state.caption) {
        captionInput.value = state.caption;
      }
      const previewItems = this.getSocialPostComposePreviewItems(state);
      const mediaHtml = previewItems.length
        ? this.buildSocialPostCarouselHtml(previewItems, { classPrefix: 'social-post-compose' })
        : '<p class="social-post-compose-preview-empty">Add an image or video to preview your post.</p>';
      const captionDate = this.escapeQuiltFortuneText(this.formatSocialPostCaptionDate(new Date().toISOString()));
      const captionHtml = state.caption
        ? this.renderSocialPostCaptionHtml(state.caption, new Date().toISOString())
        : `<strong class="social-post-entry-caption-date">${captionDate}:</strong> <span class="social-post-compose-preview-caption--placeholder">Caption will appear here</span>`;
      preview.innerHTML = `
        <div class="social-post-compose-preview-card">
          <div class="social-post-compose-preview-media-frame">${mediaHtml}</div>
          <p class="social-post-compose-preview-caption">${captionHtml}</p>
        </div>
      `;
      this.bindSocialPostCarouselSwipe(preview);
    }

    async buildSocialPostMediaPayload(postId, { startIndex = 0 } = {}) {
      const state = this._socialComposeState;
      if (!state?.files?.length) return [];
      const media = [];
      for (let i = 0; i < state.files.length; i += 1) {
        const entry = state.files[i];
        try {
          const uploaded = await this.uploadSocialPostMediaFile(postId, entry.file, startIndex + i);
          media.push(uploaded);
        } catch (error) {
          const detail = String(error?.message || error || 'upload failed');
          throw new Error(`Media upload failed: ${detail}`);
        }
      }
      return media;
    }

    async buildSocialPostSubmitMedia(state) {
      const existing = Array.isArray(state?.existingMedia) ? state.existingMedia : [];
      const startIndex = existing.length;
      const uploaded = await this.buildSocialPostMediaPayload(state.postId, { startIndex });
      return existing.concat(uploaded).slice(0, 10);
    }

    async submitSocialPost({ status }) {
      if (!this.guardSocialPostsAccess({ redirect: false })) {
        this.uiService.showToast('Admin access required');
        return;
      }
      const baseUrl = this.getSocialPostApiBaseUrl();
      if (!baseUrl) {
        this.uiService.showToast('Backend URL is not configured');
        return;
      }
      const token = await this.getSocialPostAdminToken();
      if (!token) {
        this.uiService.showToast('Publishing cancelled: missing admin token');
        return;
      }
      if (!this._socialComposeState) this.resetSocialComposeState();
      const state = this._socialComposeState;
      if (state.publishing) return;
      state.publishing = true;

      const publishBtn = document.getElementById('socialPostComposePublish');
      const saveDraftBtn = document.getElementById('socialPostComposeSaveDraft');
      if (publishBtn) publishBtn.disabled = true;
      if (saveDraftBtn) saveDraftBtn.disabled = true;

      try {
        this.uiService.showToast(
          state.editingPostId
            ? status === 'published'
              ? 'Updating post…'
              : 'Saving changes…'
            : status === 'published'
              ? 'Publishing post…'
              : 'Saving draft…',
          5000
        );
        const media = await this.buildSocialPostSubmitMedia(state);
        if (status === 'published' && !media.length) {
          this.uiService.showToast('Add at least one image or video before publishing');
          return;
        }
        if (state.editingPostId) {
          const updated = await this.patchSocialPostAdmin(state.editingPostId, {
            caption: state.caption,
            media,
            status
          });
          this.uiService.showToast(status === 'published' ? 'Post updated' : 'Changes saved');
          this._socialPostsFeedLoaded = false;
          this.resetSocialComposeState();
          const captionInput = document.getElementById('socialPostComposeCaption');
          if (captionInput) captionInput.value = '';
          this.syncSocialPostComposeHeader();
          this.renderSocialPostComposePreview();
          if (updated?.status === 'published' || status === 'published') {
            this.uiService.showScreen('screen-social-posts');
          }
          return;
        }
        const res = await fetch(`${baseUrl}/api/social-posts`, {
          method: 'POST',
          headers: this.buildSocialPostAdminHeaders(token),
          body: JSON.stringify({
            caption: state.caption,
            media,
            status,
            authorLabel: 'Our Daily'
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          const detail = data.error || res.statusText || `HTTP ${res.status}`;
          this.uiService.showToast(`Post save failed: ${detail}`);
          return;
        }
        this.uiService.showToast(status === 'published' ? 'Post published' : 'Draft saved');
        this._socialPostsFeedLoaded = false;
        this.resetSocialComposeState();
        const captionInput = document.getElementById('socialPostComposeCaption');
        if (captionInput) captionInput.value = '';
        this.syncSocialPostComposeHeader();
        this.renderSocialPostComposePreview();
        if (status === 'published') {
          this.uiService.showScreen('screen-social-posts');
        }
      } catch (error) {
        this.errorHandler?.handleError?.(error, 'socialPostPublish');
        const detail = String(error?.message || error || 'Unknown error');
        this.uiService.showToast(detail.startsWith('Media upload failed') ? detail : `Post save failed: ${detail}`);
      } finally {
        state.publishing = false;
        if (publishBtn) publishBtn.disabled = false;
        if (saveDraftBtn) saveDraftBtn.disabled = false;
      }
    }

    handleSocialPostSaveDraft() {
      return this.submitSocialPost({ status: 'draft' });
    }

    handleSocialPostPublish() {
      return this.submitSocialPost({ status: 'published' });
    }

    async handleSocialPostComposeDelete() {
      if (!this.isCurrentUserAdmin?.()) return;
      const postId = String(this._socialComposeState?.editingPostId || '').trim();
      if (!postId) return;
      if (!window.confirm('Delete this post?')) return;
      try {
        await this.deleteSocialPostAdmin(postId);
        this.uiService.showToast('Post deleted');
        this._socialPostsFeedLoaded = false;
        this._socialPostsFeedPosts = (this._socialPostsFeedPosts || []).filter(
          (entry) => String(entry.postId || '') !== postId
        );
        this.resetSocialComposeState();
        const captionInput = document.getElementById('socialPostComposeCaption');
        if (captionInput) captionInput.value = '';
        this.syncSocialPostComposeHeader();
        this.renderSocialPostComposePreview();
        this.uiService.showScreen('screen-social-posts');
        if (this._socialPostsFeedPosts?.length) {
          this.renderSocialPostFeedEntries(this._socialPostsFeedPosts);
        } else {
          this.setSocialPostsFeedStatus('No posts yet.');
        }
      } catch (error) {
        this.uiService.showToast(error.message || 'Could not delete post');
      }
    }

    openSocialPostComposeScreen() {
      if (!this.guardSocialPostsAccess()) return;
      this.resetSocialComposeState();
      this.syncSocialPostComposeHeader();
      this.uiService.showScreen('screen-social-post-compose');
    }

    openSocialPostsFeedScreen() {
      if (!this.guardSocialPostsAccess()) return;
      this.closeAdminMenu?.();
      this.uiService.showScreen('screen-social-posts');
    }

    openSocialPostManageScreen() {
      if (!this.guardSocialPostsAccess()) return;
      this.uiService.showScreen('screen-social-post-manage');
    }

    async fetchSocialPostsAdminList(status = '') {
      const baseUrl = this.getSocialPostApiBaseUrl();
      const token = await this.getSocialPostAdminToken();
      if (!token) throw new Error('Missing admin token');
      const params = new URLSearchParams({ limit: '30' });
      if (status) params.set('status', status);
      const res = await fetch(`${baseUrl}/api/social-posts/admin/list?${params.toString()}`, {
        headers: this.buildSocialPostAdminHeaders(token)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || res.statusText || `HTTP ${res.status}`);
      }
      return data.posts || [];
    }

    async patchSocialPostAdmin(postId, patch) {
      const baseUrl = this.getSocialPostApiBaseUrl();
      const token = await this.getSocialPostAdminToken({ promptIfMissing: false });
      if (!token) throw new Error('Missing admin token');
      const res = await fetch(`${baseUrl}/api/social-posts/${encodeURIComponent(postId)}`, {
        method: 'PATCH',
        headers: this.buildSocialPostAdminHeaders(token),
        body: JSON.stringify(patch)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || res.statusText || `HTTP ${res.status}`);
      }
      return data.post;
    }

    async deleteSocialPostAdmin(postId) {
      const baseUrl = this.getSocialPostApiBaseUrl();
      const token = await this.getSocialPostAdminToken({ promptIfMissing: false });
      if (!token) throw new Error('Missing admin token');
      const res = await fetch(`${baseUrl}/api/social-posts/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
        headers: this.buildSocialPostAdminHeaders(token)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || res.statusText || `HTTP ${res.status}`);
      }
      return data;
    }

    renderSocialPostManageEntries(posts) {
      const list = document.getElementById('socialPostManageList');
      if (!list) return;
      const entries = Array.isArray(posts) ? posts : [];
      if (!entries.length) {
        list.innerHTML = '<p class="social-post-manage-empty">No posts in this view.</p>';
        return;
      }
      list.innerHTML = entries
        .map((post) => {
          const postId = this.escapeQuiltFortuneText(post.postId || '');
          const caption = this.escapeQuiltFortuneText((post.caption || '').slice(0, 120));
          const status = this.escapeQuiltFortuneText(post.status || 'draft');
          const date = this.escapeQuiltFortuneText(this.formatSocialPostDate(post.updatedAtIso || post.createdAtIso));
          const mediaCount = Array.isArray(post.media) ? post.media.length : 0;
          const publishBtn =
            post.status !== 'published'
              ? `<button type="button" class="social-post-manage-action" data-action="publish" data-post-id="${postId}">Publish</button>`
              : '';
          const archiveBtn =
            post.status === 'published'
              ? `<button type="button" class="social-post-manage-action" data-action="archive" data-post-id="${postId}">Archive</button>`
              : '';
          const draftBtn =
            post.status === 'archived'
              ? `<button type="button" class="social-post-manage-action" data-action="draft" data-post-id="${postId}">Move to draft</button>`
              : '';
          return `
            <article class="social-post-manage-entry" data-post-id="${postId}">
              <div class="social-post-manage-entry-head">
                <span class="social-post-manage-status social-post-manage-status--${status}">${status}</span>
                <span class="social-post-manage-date">${date}</span>
              </div>
              <p class="social-post-manage-caption">${caption || '(No caption)'}</p>
              <p class="social-post-manage-meta">${mediaCount} media · ${Number(post.commentCount) || 0} comments</p>
              <div class="social-post-manage-actions">
                ${publishBtn}
                ${archiveBtn}
                ${draftBtn}
                <button type="button" class="social-post-manage-action social-post-manage-action--danger" data-action="delete" data-post-id="${postId}">Delete</button>
              </div>
            </article>
          `;
        })
        .join('');
    }

    async loadSocialPostManageList(status = '') {
      const list = document.getElementById('socialPostManageList');
      if (!list) return;
      list.innerHTML = `<div class="social-posts-status social-posts-status--loading">
        <div class="social-posts-status-message">Loading posts…</div>
        <div class="social-posts-status-spinner" aria-hidden="true"></div>
      </div>`;
      try {
        const posts = await this.fetchSocialPostsAdminList(status);
        this._socialPostManagePosts = posts;
        this.renderSocialPostManageEntries(posts);
      } catch (error) {
        list.innerHTML = `<p class="social-post-manage-empty">${this.escapeQuiltFortuneText(error.message || 'Could not load posts')}</p>`;
      }
    }

    bindSocialPostManageControls() {
      if (this._socialPostManageControlsBound) return;
      const filters = document.getElementById('socialPostManageFilters');
      const list = document.getElementById('socialPostManageList');
      filters?.addEventListener('click', async (event) => {
        const btn = event.target.closest('.social-post-manage-filter');
        if (!btn) return;
        filters.querySelectorAll('.social-post-manage-filter').forEach((el) => {
          el.classList.toggle('social-post-manage-filter--active', el === btn);
        });
        this._socialPostManageStatus = btn.getAttribute('data-status') || '';
        await this.loadSocialPostManageList(this._socialPostManageStatus);
      });
      list?.addEventListener('click', async (event) => {
        const actionBtn = event.target.closest('[data-action]');
        if (!actionBtn) return;
        const postId = actionBtn.getAttribute('data-post-id') || '';
        const action = actionBtn.getAttribute('data-action') || '';
        if (!postId || !action) return;
        try {
          if (action === 'delete') {
            if (!window.confirm('Delete this post?')) return;
            await this.deleteSocialPostAdmin(postId);
            this.uiService.showToast('Post deleted');
          } else if (action === 'publish') {
            await this.patchSocialPostAdmin(postId, { status: 'published' });
            this.uiService.showToast('Post published');
            this._socialPostsFeedLoaded = false;
          } else if (action === 'archive') {
            await this.patchSocialPostAdmin(postId, { status: 'archived' });
            this.uiService.showToast('Post archived');
            this._socialPostsFeedLoaded = false;
          } else if (action === 'draft') {
            await this.patchSocialPostAdmin(postId, { status: 'draft' });
            this.uiService.showToast('Moved to draft');
          }
          await this.loadSocialPostManageList(this._socialPostManageStatus || '');
        } catch (error) {
          this.uiService.showToast(error.message || 'Action failed');
        }
      });
      this._socialPostManageControlsBound = true;
    }

    initializeSocialPostManageScreen() {
      if (!this.guardSocialPostsAccess()) return;
      this.bindSocialPostManageControls();
      this.loadSocialPostManageList(this._socialPostManageStatus || '');
    }

    setSocialPostsFeedStatus(message, loading = false) {
      const feed = document.getElementById('socialPostsFeed');
      if (!feed) return;
      const safeMessage = this.escapeQuiltFortuneText(message || '');
      feed.innerHTML = loading
        ? `<div class="social-posts-status social-posts-status--loading">
            <div class="social-posts-status-message">${safeMessage}</div>
            <div class="social-posts-status-spinner" aria-hidden="true"></div>
          </div>`
        : `<div class="social-posts-status">${safeMessage}</div>`;
    }

    async fetchSocialPostsFeedPage(cursorPostId = '') {
      const baseUrl = this.getSocialPostApiBaseUrl();
      if (!baseUrl) throw new Error('Backend URL is not configured');
      const params = new URLSearchParams({ limit: '10' });
      if (cursorPostId) params.set('cursorPostId', cursorPostId);
      const res = await fetch(`${baseUrl}/api/social-posts/feed?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || res.statusText || `HTTP ${res.status}`);
      }
      return data;
    }

    async fetchSocialPostComments(postId, parentCommentId = '') {
      const baseUrl = this.getSocialPostApiBaseUrl();
      const params = new URLSearchParams({ limit: '40' });
      if (parentCommentId) params.set('parentCommentId', parentCommentId);
      const res = await fetch(`${baseUrl}/api/social-posts/${encodeURIComponent(postId)}/comments?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || res.statusText || `HTTP ${res.status}`);
      }
      return data.comments || [];
    }

    formatSocialPostDate(iso) {
      const raw = String(iso || '').trim();
      if (!raw) return '';
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return raw;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    formatSocialPostCaptionDate(iso) {
      const raw = String(iso || '').trim();
      if (!raw) return '';
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return '';
      const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      return `${month} ${date.getDate()} ${date.getFullYear()}`;
    }

    renderSocialPostCaptionHtml(caption, iso) {
      const dateLabel = this.escapeQuiltFortuneText(this.formatSocialPostCaptionDate(iso));
      const text = this.escapeQuiltFortuneText(caption || '');
      const datePrefix = dateLabel
        ? `<strong class="social-post-entry-caption-date">${dateLabel}:</strong> `
        : '';
      return `${datePrefix}<span class="social-post-entry-caption-text">${text}</span>`;
    }

    renderSocialPostMedia(post) {
      return this.buildSocialPostCarouselHtml(Array.isArray(post.media) ? post.media : [], {
        classPrefix: 'social-post'
      });
    }

    getSocialPostLikesStorageKey() {
      return 'ourDailySocialPostLikes';
    }

    readSocialPostLikedIds() {
      try {
        const raw = localStorage.getItem(this.getSocialPostLikesStorageKey());
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map((id) => String(id || '')).filter(Boolean) : [];
      } catch (_) {
        return [];
      }
    }

    isSocialPostLiked(postId) {
      const id = String(postId || '').trim();
      if (!id) return false;
      return this.readSocialPostLikedIds().includes(id);
    }

    setSocialPostLiked(postId, liked) {
      const id = String(postId || '').trim();
      if (!id) return liked;
      const ids = new Set(this.readSocialPostLikedIds());
      if (liked) ids.add(id);
      else ids.delete(id);
      try {
        localStorage.setItem(this.getSocialPostLikesStorageKey(), JSON.stringify(Array.from(ids)));
      } catch (_) {
        /* ignore */
      }
      return liked;
    }

    syncSocialPostLikeButton(entry) {
      if (!entry) return;
      const postId = entry.getAttribute('data-post-id') || '';
      const button = entry.querySelector('.social-post-action-like');
      if (!button) return;
      const liked = this.isSocialPostLiked(postId);
      button.classList.toggle('social-post-action--active', liked);
      button.setAttribute('aria-pressed', liked ? 'true' : 'false');
    }

    renderSocialPostActionsHtml(postId) {
      const liked = this.isSocialPostLiked(postId);
      const adminActions = this.isCurrentUserAdmin?.()
        ? `<div class="social-post-entry-actions-admin">
            <button type="button" class="social-post-admin-link social-post-admin-link--edit">Edit</button>
          </div>`
        : '';
      return `
        <div class="social-post-entry-actions">
          <div class="social-post-entry-actions-main">
            <button type="button" class="social-post-action social-post-action-like${liked ? ' social-post-action--active' : ''}" aria-label="Like post" aria-pressed="${liked ? 'true' : 'false'}">
              <span class="material-symbols-outlined" aria-hidden="true" translate="no">favorite</span>
            </button>
            <button type="button" class="social-post-action social-post-action-comment" aria-label="Leave a comment">
              <span class="material-symbols-outlined" aria-hidden="true" translate="no">chat_bubble</span>
            </button>
            <button type="button" class="social-post-action social-post-action-share" aria-label="Share image on Instagram">
              <span class="material-symbols-outlined" aria-hidden="true" translate="no">send</span>
            </button>
          </div>
          ${adminActions}
        </div>
      `;
    }

    getSocialPostShareImageElement(entry) {
      if (!entry) return null;
      const activeSlide = entry.querySelector('.social-post-carousel-slide--active');
      const activeImage = activeSlide?.querySelector('img.social-post-media');
      if (activeImage) return activeImage;
      return entry.querySelector('.social-post-media-frame img.social-post-media, img.social-post-media');
    }

    async fetchSocialPostImageBlob(imageUrl) {
      const safeUrl = String(imageUrl || '').trim();
      if (!safeUrl) throw new Error('No image URL');
      const candidates = [safeUrl];
      const proxyBases = [];
      if (typeof root.odqProxyImageBases === 'function') {
        proxyBases.push(...root.odqProxyImageBases());
      } else if (CONFIG.BACKEND?.baseUrl) {
        proxyBases.push(String(CONFIG.BACKEND.baseUrl).replace(/\/$/, ''));
      }
      if (typeof root.odqProxyImageFetchUrl === 'function') {
        for (const base of proxyBases) {
          const proxied = root.odqProxyImageFetchUrl(base, safeUrl);
          if (proxied && !candidates.includes(proxied)) candidates.push(proxied);
        }
      }
      let lastError = null;
      for (const url of candidates) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Could not fetch image (${response.status})`);
          const blob = await response.blob();
          if (!String(blob.type || '').startsWith('image/')) throw new Error('Not an image');
          return blob;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('Could not fetch image');
    }

    getSocialPostShareImageUrl(entry) {
      const image = this.getSocialPostShareImageElement(entry);
      return image?.src || '';
    }

    async shareSocialPostImage(entry) {
      const imageUrl = this.getSocialPostShareImageUrl(entry);
      if (!imageUrl) {
        this.uiService?.showToast?.('No image to share');
        return;
      }
      try {
        const blob = await this.fetchSocialPostImageBlob(imageUrl);
        const postId = entry.getAttribute('data-post-id') || 'post';
        const ext = blob.type.includes('png') ? 'png' : 'jpg';
        const filename = `our-daily-post-${postId}.${ext}`;
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
        const shareData = { files: [file], title: 'Our Daily' };
        const canShareFiles =
          typeof navigator.canShare === 'function' && navigator.canShare(shareData);
        if (typeof navigator.share === 'function' && canShareFiles) {
          await navigator.share(shareData);
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        this.uiService?.showToast?.('Image saved — open Instagram to share');
      } catch (error) {
        if (error?.name === 'AbortError') return;
        this.errorHandler?.handleError?.(error, 'socialPostShare');
        this.uiService?.showToast?.('Could not share image');
      }
    }

    renderSocialPostComment(comment, { isReply = false } = {}) {
      const author = String(comment.displayName || '').trim();
      const authorLabel = author
        ? `<strong class="social-post-comment-author">${this.escapeQuiltFortuneText(author)}:</strong>`
        : '<strong class="social-post-comment-author social-post-comment-author--anon">Friend:</strong>';
      const text = this.escapeQuiltFortuneText(comment.text || '');
      const replyLink =
        !isReply && comment.depth === 0
          ? `<button type="button" class="social-post-comment-reply-link" data-comment-id="${this.escapeQuiltFortuneText(comment.commentId)}">reply</button>`
          : '';
      const clientId = UtilsCore.getOrCreateUserId();
      const isOwn = String(comment.clientId || '') === clientId;
      const editLink = isOwn
        ? `<button type="button" class="social-post-comment-edit-link" data-comment-id="${this.escapeQuiltFortuneText(comment.commentId)}">edit</button>`
        : '';
      const metaLinks = [editLink, replyLink].filter(Boolean).join('');
      const metaHtml = metaLinks ? `<span class="social-post-comment-meta">${metaLinks}</span>` : '';
      return `
        <article class="social-post-comment${isReply ? ' social-post-comment--reply' : ''}" data-comment-id="${this.escapeQuiltFortuneText(comment.commentId)}">
          <p class="social-post-comment-body">
            ${authorLabel}
            <span class="social-post-comment-text">${text}</span>
            ${metaHtml}
          </p>
          <form class="social-post-comment-edit-form" hidden>
            <textarea class="social-post-comment-edit-input" rows="2" maxlength="500">${text}</textarea>
            <div class="social-post-comment-edit-actions">
              <button type="submit" class="social-post-comment-edit-save">Save</button>
              <button type="button" class="social-post-comment-edit-cancel">Cancel</button>
              <button type="button" class="social-post-comment-delete-btn" data-comment-id="${this.escapeQuiltFortuneText(comment.commentId)}">Delete</button>
            </div>
          </form>
        </article>
      `;
    }

    async loadSocialPostThread(postId, container) {
      if (!container) return;
      container.innerHTML = '<p class="social-post-comments-loading">Loading comments…</p>';
      try {
        const topLevel = await this.fetchSocialPostComments(postId);
        const blocks = [];
        for (const comment of topLevel) {
          blocks.push(this.renderSocialPostComment(comment));
          const replies = await this.fetchSocialPostComments(postId, comment.commentId);
          if (replies.length) {
            blocks.push(
              `<div class="social-post-comment-replies">${replies.map((reply) => this.renderSocialPostComment(reply, { isReply: true })).join('')}</div>`
            );
          }
        }
        const composer = `
          <div class="social-post-comment-compose">
            <form class="social-post-comment-form" data-post-id="${this.escapeQuiltFortuneText(postId)}" hidden>
              <textarea id="socialPostCommentInput-${this.escapeQuiltFortuneText(postId)}" class="social-post-comment-input" rows="2" maxlength="500" placeholder="Share a thought…" aria-label="Add a comment"></textarea>
              <div class="social-post-comment-form-actions">
                <button type="button" class="social-post-comment-cancel">Cancel</button>
                <button type="submit" class="social-post-comment-submit">Post</button>
              </div>
            </form>
          </div>
          <form class="social-post-reply-form" data-post-id="${this.escapeQuiltFortuneText(postId)}" hidden>
            <textarea class="social-post-reply-input" rows="2" maxlength="500" placeholder="Write a reply…" aria-label="Write a reply"></textarea>
            <div class="social-post-reply-actions">
              <button type="button" class="social-post-reply-cancel">Cancel</button>
              <button type="submit" class="social-post-reply-submit">Post reply</button>
            </div>
          </form>
        `;
        container.innerHTML = `${blocks.join('') || '<p class="social-post-comments-empty">No comments yet. Be the first.</p>'}${composer}`;
      } catch (error) {
        container.innerHTML = `<p class="social-post-comments-error">${this.escapeQuiltFortuneText(error.message || 'Could not load comments')}</p>`;
      }
    }

    async openSocialPostEntryComments(entry) {
      if (!entry) return;
      const toggle = entry.querySelector('.social-post-entry-toggle');
      const details = entry.querySelector('.social-post-entry-comments');
      const commentsHost = details?.querySelector('.social-post-comments');
      const postId = entry.getAttribute('data-post-id') || '';
      if (!details || !commentsHost || !postId) return;
      const replyForm = entry.querySelector('.social-post-reply-form');
      if (replyForm) {
        replyForm.hidden = true;
        replyForm.dataset.parentCommentId = '';
        const replyInput = replyForm.querySelector('.social-post-reply-input');
        if (replyInput) replyInput.value = '';
      }
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      entry.classList.add('social-post-entry--open');
      details.hidden = false;
      if (!commentsHost.dataset.loaded) {
        commentsHost.dataset.loaded = '1';
        await this.loadSocialPostThread(postId, commentsHost);
      }
    }

    async openSocialPostCommentComposer(entry) {
      if (!entry) return;
      await this.openSocialPostEntryComments(entry);
      const form = entry.querySelector('.social-post-comment-form');
      if (!form) return;
      form.hidden = false;
      form.querySelector('.social-post-comment-input')?.focus();
    }

    renderSocialPostFeedEntries(posts) {
      const feed = document.getElementById('socialPostsFeed');
      if (!feed) return;
      const entries = Array.isArray(posts) ? posts : [];
      if (!entries.length) {
        this.setSocialPostsFeedStatus('No posts yet.');
        return;
      }
      feed.innerHTML = entries
        .map((post, index) => {
          const postId = String(post.postId || '');
          const detailsId = `socialPostDetails-${index}`;
          const captionHtml = this.renderSocialPostCaptionHtml(
            post.caption || '',
            post.publishedAtIso || post.createdAtIso
          );
          const commentLabel = Number(post.commentCount) === 1 ? '1 comment' : `${Number(post.commentCount) || 0} comments`;
          const isLatestPost = index === 0;
          const commentToggle = isLatestPost
            ? ''
            : `<button type="button" class="social-post-entry-toggle" aria-expanded="false" aria-controls="${detailsId}">
                <span>${this.escapeQuiltFortuneText(commentLabel)}</span>
                <span class="social-post-entry-toggle-chevron" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img" focusable="false">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                </span>
              </button>`;
          return `
            <article class="settings-item social-post-entry${isLatestPost ? ' social-post-entry--open social-post-entry--latest' : ''}" data-post-id="${this.escapeQuiltFortuneText(postId)}">
              <div class="settings-item__slab social-post-entry__slab">
              ${this.renderSocialPostMedia(post)}
              ${this.renderSocialPostActionsHtml(postId)}
              <p class="social-post-entry-caption">${captionHtml}</p>
              ${commentToggle}
              <div class="social-post-entry-comments" id="${detailsId}"${isLatestPost ? '' : ' hidden'}>
                <div class="social-post-comments" data-post-id="${this.escapeQuiltFortuneText(postId)}"></div>
              </div>
              </div>
            </article>
          `;
        })
        .join('');
      this.bindSocialPostFeedInteractions();
      this.bindSocialPostCarouselSwipe(feed);
      this.bindSocialPostFeedVideos(feed);
      const latestEntry = feed.querySelector('.social-post-entry');
      if (latestEntry) {
        this.openSocialPostEntryComments(latestEntry);
      }
    }

    bindSocialPostFeedInteractions() {
      const feed = document.getElementById('socialPostsFeed');
      if (!feed) return;
      if (feed.dataset.socialBound !== '1') {
        feed.dataset.socialBound = '1';
        this._bindSocialPostFeedEvents(feed);
      }
    }

    _bindSocialPostFeedEvents(feed) {
      feed.addEventListener('click', async (event) => {
        const carouselDot = event.target.closest('[class*="-carousel-dot"]');
        if (carouselDot) {
          const carousel = carouselDot.closest('[class*="-carousel"]');
          this.setSocialPostCarouselSlide(carousel, Number(carouselDot.getAttribute('data-slide-index') || 0));
          return;
        }

        const likeBtn = event.target.closest('.social-post-action-like');
        if (likeBtn) {
          const entry = likeBtn.closest('.social-post-entry');
          const postId = entry?.getAttribute('data-post-id') || '';
          const liked = !this.isSocialPostLiked(postId);
          this.setSocialPostLiked(postId, liked);
          this.syncSocialPostLikeButton(entry);
          return;
        }

        const commentActionBtn = event.target.closest('.social-post-action-comment');
        if (commentActionBtn) {
          const entry = commentActionBtn.closest('.social-post-entry');
          await this.openSocialPostCommentComposer(entry);
          return;
        }

        const shareBtn = event.target.closest('.social-post-action-share');
        if (shareBtn) {
          const entry = shareBtn.closest('.social-post-entry');
          await this.shareSocialPostImage(entry);
          return;
        }

        const zoomImage = event.target.closest('#socialPostsFeed img.social-post-media--zoomable');
        if (zoomImage) {
          this.openSocialPostImageZoom(zoomImage);
          return;
        }

        const editBtn = event.target.closest('.social-post-admin-link--edit');
        if (editBtn) {
          const entry = editBtn.closest('.social-post-entry');
          const postId = entry?.getAttribute('data-post-id') || '';
          await this.openSocialPostEditScreen(postId);
          return;
        }

        const editLink = event.target.closest('.social-post-comment-edit-link');
        if (editLink) {
          const comment = editLink.closest('.social-post-comment');
          const form = comment?.querySelector('.social-post-comment-edit-form');
          const body = comment?.querySelector('.social-post-comment-body');
          if (form && body) {
            body.hidden = true;
            form.hidden = false;
            form.querySelector('.social-post-comment-edit-input')?.focus();
          }
          return;
        }

        const editCancel = event.target.closest('.social-post-comment-edit-cancel');
        if (editCancel) {
          const comment = editCancel.closest('.social-post-comment');
          const form = comment?.querySelector('.social-post-comment-edit-form');
          const body = comment?.querySelector('.social-post-comment-body');
          if (form && body) {
            form.hidden = true;
            body.hidden = false;
          }
          return;
        }

        const commentCancel = event.target.closest('.social-post-comment-cancel');
        if (commentCancel) {
          const compose = commentCancel.closest('.social-post-comment-compose');
          const form = compose?.querySelector('.social-post-comment-form');
          const input = form?.querySelector('.social-post-comment-input');
          if (input) input.value = '';
          if (form) form.hidden = true;
          return;
        }

        const toggle = event.target.closest('.social-post-entry-toggle');
        if (toggle) {
          const entry = toggle.closest('.social-post-entry');
          const expanded = toggle.getAttribute('aria-expanded') === 'true';
          if (expanded) {
            const details = entry?.querySelector('.social-post-entry-comments');
            toggle.setAttribute('aria-expanded', 'false');
            entry?.classList.remove('social-post-entry--open');
            if (details) details.hidden = true;
            return;
          }
          await this.openSocialPostEntryComments(entry);
          return;
        }

        const replyBtn = event.target.closest('.social-post-comment-reply-link');
        if (replyBtn) {
          const entry = replyBtn.closest('.social-post-entry');
          const replyForm = entry?.querySelector('.social-post-reply-form');
          const commentId = replyBtn.getAttribute('data-comment-id') || '';
          if (replyForm) {
            replyForm.hidden = false;
            replyForm.dataset.parentCommentId = commentId;
            replyForm.querySelector('.social-post-reply-input')?.focus();
          }
          return;
        }

        const replyCancel = event.target.closest('.social-post-reply-cancel');
        if (replyCancel) {
          const replyForm = replyCancel.closest('.social-post-reply-form');
          if (replyForm) {
            replyForm.hidden = true;
            replyForm.dataset.parentCommentId = '';
            const input = replyForm.querySelector('.social-post-reply-input');
            if (input) input.value = '';
          }
          return;
        }

        const deleteBtn = event.target.closest('.social-post-comment-delete-btn');
        if (deleteBtn) {
          const entry = deleteBtn.closest('.social-post-entry');
          const postId = entry?.getAttribute('data-post-id') || '';
          const commentId = deleteBtn.getAttribute('data-comment-id') || '';
          await this.deleteSocialPostComment(postId, commentId, entry);
        }
      });

      feed.addEventListener('submit', async (event) => {
        const editForm = event.target.closest('.social-post-comment-edit-form');
        if (editForm) {
          event.preventDefault();
          const comment = editForm.closest('.social-post-comment');
          const entry = comment?.closest('.social-post-entry');
          const postId = entry?.getAttribute('data-post-id') || '';
          const commentId = comment?.getAttribute('data-comment-id') || '';
          const input = editForm.querySelector('.social-post-comment-edit-input');
          await this.editSocialPostComment(postId, commentId, String(input?.value || ''), entry);
          return;
        }
        const commentForm = event.target.closest('.social-post-comment-form');
        if (commentForm) {
          event.preventDefault();
          const postId = commentForm.getAttribute('data-post-id') || '';
          const input = commentForm.querySelector('.social-post-comment-input');
          await this.submitSocialPostComment(postId, {
            text: String(input?.value || ''),
            parentCommentId: '',
            form: commentForm,
            entry: commentForm.closest('.social-post-entry')
          });
          return;
        }
        const replyForm = event.target.closest('.social-post-reply-form');
        if (replyForm) {
          event.preventDefault();
          const postId = replyForm.getAttribute('data-post-id') || '';
          const parentCommentId = replyForm.dataset.parentCommentId || '';
          const input = replyForm.querySelector('.social-post-reply-input');
          await this.submitSocialPostComment(postId, {
            text: String(input?.value || ''),
            parentCommentId,
            form: replyForm,
            entry: replyForm.closest('.social-post-entry'),
            isReply: true
          });
        }
      });
    }

    hideSocialPostCommentComposer(form) {
      const input = form?.querySelector('.social-post-comment-input');
      if (input) input.value = '';
      if (form) form.hidden = true;
    }

    async submitSocialPostComment(postId, { text, parentCommentId = '', form, entry, isReply = false } = {}) {
      const trimmed = String(text || '').replace(/\s+/g, ' ').trim();
      const baseUrl = this.getSocialPostApiBaseUrl();
      if (!trimmed) {
        this.uiService.showToast('Write a comment first');
        return;
      }
      try {
        const res = await fetch(`${baseUrl}/api/social-posts/${encodeURIComponent(postId)}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: trimmed,
            parentCommentId: parentCommentId || undefined,
            clientId: UtilsCore.getOrCreateUserId(),
            displayName: typeof Utils.getNameThanksDisplayName === 'function' ? Utils.getNameThanksDisplayName() : ''
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          const detail = data.error || res.statusText || `HTTP ${res.status}`;
          this.uiService.showToast(detail);
          return;
        }
        if (isReply) {
          const input = form?.querySelector('.social-post-reply-input');
          if (input) input.value = '';
          if (form) {
            form.hidden = true;
            form.dataset.parentCommentId = '';
          }
        } else {
          this.hideSocialPostCommentComposer(form);
        }
        const commentsHost = entry?.querySelector('.social-post-comments');
        if (commentsHost) {
          delete commentsHost.dataset.loaded;
          await this.loadSocialPostThread(postId, commentsHost);
        }
        const toggle = entry?.querySelector('.social-post-entry-toggle span');
        if (toggle) {
          const current = Number((toggle.textContent || '').match(/\d+/)?.[0] || 0);
          const next = current + 1;
          toggle.textContent = next === 1 ? '1 comment' : `${next} comments`;
        }
      } catch (error) {
        this.errorHandler?.handleError?.(error, 'socialPostComment');
        this.uiService.showToast('Could not post comment');
      }
    }

    async editSocialPostComment(postId, commentId, text, entry) {
      const trimmed = String(text || '').replace(/\s+/g, ' ').trim();
      const baseUrl = this.getSocialPostApiBaseUrl();
      if (!trimmed) {
        this.uiService.showToast('Write a comment first');
        return;
      }
      try {
        const res = await fetch(
          `${baseUrl}/api/social-posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: trimmed,
              clientId: UtilsCore.getOrCreateUserId(),
              displayName: typeof Utils.getNameThanksDisplayName === 'function' ? Utils.getNameThanksDisplayName() : ''
            })
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          this.uiService.showToast(data.error || 'Could not update comment');
          return;
        }
        const commentsHost = entry?.querySelector('.social-post-comments');
        if (commentsHost) {
          delete commentsHost.dataset.loaded;
          await this.loadSocialPostThread(postId, commentsHost);
        }
      } catch (error) {
        this.errorHandler?.handleError?.(error, 'socialPostCommentEdit');
        this.uiService.showToast('Could not update comment');
      }
    }

    async deleteSocialPostComment(postId, commentId, entry) {
      const baseUrl = this.getSocialPostApiBaseUrl();
      try {
        const res = await fetch(
          `${baseUrl}/api/social-posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: UtilsCore.getOrCreateUserId() })
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          this.uiService.showToast(data.error || 'Could not delete comment');
          return;
        }
        const commentsHost = entry?.querySelector('.social-post-comments');
        if (commentsHost) {
          delete commentsHost.dataset.loaded;
          await this.loadSocialPostThread(postId, commentsHost);
        }
      } catch (error) {
        this.errorHandler?.handleError?.(error, 'socialPostCommentDelete');
        this.uiService.showToast('Could not delete comment');
      }
    }

    async reloadSocialPostsFeed() {
      if (!this.guardSocialPostsAccess()) return;
      if (this._socialPostsFeedReloading) return;
      this._socialPostsFeedReloading = true;
      const screen = document.getElementById('screen-social-posts');
      const hintText = document.querySelector('#socialPostsPullHint .social-posts-pull-hint-text');
      screen?.classList.add('social-posts--refreshing');
      if (hintText) hintText.textContent = 'Refreshing…';
      try {
        const page = await this.fetchSocialPostsFeedPage();
        this._socialPostsFeedPosts = page.posts || [];
        this._socialPostsFeedCursor = page.cursorPostId || '';
        this._socialPostsFeedHasMore = !!page.hasMore;
        this.renderSocialPostFeedEntries(this._socialPostsFeedPosts);
        this._socialPostsFeedLoaded = true;
        const loadMoreBtn = document.getElementById('socialPostsLoadMore');
        if (loadMoreBtn) loadMoreBtn.hidden = !this._socialPostsFeedHasMore;
      } catch (error) {
        this.uiService?.showToast?.(error.message || 'Could not refresh posts');
      } finally {
        this._socialPostsFeedReloading = false;
        screen?.classList.remove('social-posts--refreshing', 'social-posts--pull-active');
        const hint = document.getElementById('socialPostsPullHint');
        hint?.classList.remove('social-posts-pull-hint--ready');
        if (hintText) hintText.textContent = 'Pull to refresh';
      }
    }

    bindSocialPostsPullToRefresh() {
      const screen = document.getElementById('screen-social-posts');
      if (!screen || screen.dataset.socialPullRefreshBound === '1') return;
      screen.dataset.socialPullRefreshBound = '1';

      const hint = document.getElementById('socialPostsPullHint');
      const hintText = hint?.querySelector('.social-posts-pull-hint-text');
      let startY = null;
      let pulling = false;
      const threshold = 72;

      const atTop = () => screen.scrollTop <= 1;

      const resetPull = () => {
        startY = null;
        pulling = false;
        screen.classList.remove('social-posts--pull-active');
        hint?.classList.remove('social-posts-pull-hint--ready');
        if (hintText) hintText.textContent = 'Pull to refresh';
      };

      screen.addEventListener(
        'touchstart',
        (event) => {
          if (!screen.classList.contains('active') || this._socialPostsFeedReloading) return;
          if (!atTop()) return;
          startY = event.touches?.[0]?.clientY ?? null;
          pulling = false;
        },
        { passive: true }
      );

      screen.addEventListener(
        'touchmove',
        (event) => {
          if (startY == null || this._socialPostsFeedReloading) return;
          if (!atTop()) {
            resetPull();
            return;
          }
          const y = event.touches?.[0]?.clientY ?? startY;
          const delta = y - startY;
          if (delta > 10) {
            pulling = true;
            screen.classList.toggle('social-posts--pull-active', delta > 18);
            hint?.classList.toggle('social-posts-pull-hint--ready', delta >= threshold);
            if (hintText) {
              hintText.textContent = delta >= threshold ? 'Release to refresh' : 'Pull to refresh';
            }
          }
        },
        { passive: true }
      );

      const endPull = async () => {
        if (startY == null) return;
        const shouldRefresh =
          pulling && hint?.classList.contains('social-posts-pull-hint--ready') && !this._socialPostsFeedReloading;
        resetPull();
        if (shouldRefresh) await this.reloadSocialPostsFeed();
      };

      screen.addEventListener('touchend', endPull, { passive: true });
      screen.addEventListener('touchcancel', endPull, { passive: true });
    }

    _socialPostImageZoomState() {
      if (!this._socialPostImageZoom) {
        this._socialPostImageZoom = {
          scale: 1,
          translateX: 0,
          translateY: 0,
          pinching: false,
          panning: false,
          startDistance: 0,
          startScale: 1,
          startTranslateX: 0,
          startTranslateY: 0,
          panStartClient: null,
          pinchCenter: null,
          startCenter: null,
          lastTwoFingerCenter: null,
          lastTwoFingerDistance: null,
          lastTapAt: 0
        };
      }
      return this._socialPostImageZoom;
    }

    _socialPostImageZoomDistance(touchA, touchB) {
      const dx = touchA.clientX - touchB.clientX;
      const dy = touchA.clientY - touchB.clientY;
      return Math.hypot(dx, dy);
    }

    _socialPostImageZoomTouchCenter(touchA, touchB) {
      return {
        x: (touchA.clientX + touchB.clientX) / 2,
        y: (touchA.clientY + touchB.clientY) / 2
      };
    }

    _socialPostImageZoomFocalOffset(stage, clientX, clientY) {
      const rect = stage?.getBoundingClientRect?.();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: clientX - rect.left - rect.width / 2,
        y: clientY - rect.top - rect.height / 2
      };
    }

    _socialPostImageZoomApplyTransform() {
      const overlay = document.getElementById('socialPostImageZoom');
      const img = overlay?.querySelector('.social-post-image-zoom__image');
      const state = this._socialPostImageZoomState();
      if (!img) return;
      img.style.transform = `translate3d(${state.translateX}px, ${state.translateY}px, 0) scale(${state.scale})`;
    }

    _socialPostImageZoomResetTransform() {
      const state = this._socialPostImageZoomState();
      state.scale = 1;
      state.translateX = 0;
      state.translateY = 0;
      state.pinching = false;
      state.panning = false;
      state.pinchCenter = null;
      state.startCenter = null;
      state.lastTwoFingerCenter = null;
      state.lastTwoFingerDistance = null;
      this._socialPostImageZoomApplyTransform();
    }

    ensureSocialPostImageZoomOverlay() {
      if (document.getElementById('socialPostImageZoom')) return;
      const overlay = document.createElement('div');
      overlay.id = 'socialPostImageZoom';
      overlay.className = 'social-post-image-zoom';
      overlay.hidden = true;
      overlay.innerHTML = `
        <button type="button" class="social-post-image-zoom__close" aria-label="Close image viewer">×</button>
        <div class="social-post-image-zoom__stage">
          <img class="social-post-image-zoom__image" alt="" draggable="false" />
        </div>
      `;
      document.body.appendChild(overlay);
      this._bindSocialPostImageZoomOverlay(overlay);
    }

    _bindSocialPostImageZoomOverlay(overlay) {
      if (overlay.dataset.bound === '1') return;
      overlay.dataset.bound = '1';
      const stage = overlay.querySelector('.social-post-image-zoom__stage');
      const img = overlay.querySelector('.social-post-image-zoom__image');
      const closeBtn = overlay.querySelector('.social-post-image-zoom__close');
      const state = () => this._socialPostImageZoomState();
      const clampScale = (value) => Math.min(4, Math.max(1, value));
      const surface = stage;
      const touchSurface = overlay;

      const handleTouchStart = (event) => {
        const touches = event.touches;
        if (!touches?.length) return;
        const s = state();
        if (touches.length >= 2) {
          event.preventDefault();
          s.pinching = true;
          s.panning = false;
          s.panStartClient = null;
          s.startDistance = this._socialPostImageZoomDistance(touches[0], touches[1]);
          s.startScale = s.scale;
          s.startTranslateX = s.translateX;
          s.startTranslateY = s.translateY;
          const center = this._socialPostImageZoomTouchCenter(touches[0], touches[1]);
          s.startCenter = { x: center.x, y: center.y };
          s.lastTwoFingerCenter = { x: center.x, y: center.y };
          s.lastTwoFingerDistance = s.startDistance;
          s.pinchCenter = this._socialPostImageZoomFocalOffset(stage, center.x, center.y);
          return;
        }
        beginPan(touches[0].clientX, touches[0].clientY);
      };

      const handleTouchMove = (event) => {
        const touches = event.touches;
        const s = state();
        if (!touches?.length) return;
        if (touches.length >= 2) {
          event.preventDefault();
          s.pinching = true;
          s.panning = false;
          const distance = this._socialPostImageZoomDistance(touches[0], touches[1]);
          const center = this._socialPostImageZoomTouchCenter(touches[0], touches[1]);
          const lastCenter = s.lastTwoFingerCenter;
          const lastDistance = s.lastTwoFingerDistance;

          if (lastCenter) {
            s.translateX += center.x - lastCenter.x;
            s.translateY += center.y - lastCenter.y;
          }

          if (lastDistance > 0 && distance > 0) {
            const nextScale = clampScale(s.scale * (distance / lastDistance));
            const scaleRatio = nextScale / (s.scale || 1);
            if (Math.abs(scaleRatio - 1) > 0.0005) {
              const focal = this._socialPostImageZoomFocalOffset(stage, center.x, center.y);
              s.translateX += focal.x * (1 - scaleRatio);
              s.translateY += focal.y * (1 - scaleRatio);
              s.scale = nextScale;
            }
          }

          if (s.scale <= 1.01) {
            s.translateX = 0;
            s.translateY = 0;
          }

          s.lastTwoFingerCenter = { x: center.x, y: center.y };
          s.lastTwoFingerDistance = distance;
          this._socialPostImageZoomApplyTransform();
          return;
        }
        if (s.scale > 1.01 && !s.pinching) {
          if (!s.panning) beginPan(touches[0].clientX, touches[0].clientY);
          event.preventDefault();
          applyPan(touches[0].clientX, touches[0].clientY);
        }
      };

      const close = () => {
        overlay.hidden = true;
        document.documentElement.classList.remove('odq-social-post-image-zoom-active');
        document.body.classList.remove('odq-social-post-image-zoom-active');
        this._socialPostImageZoomResetTransform();
        img.removeAttribute('src');
      };

      const beginPan = (clientX, clientY) => {
        const s = state();
        if (s.scale <= 1.01) return;
        s.panning = true;
        s.panStartClient = { x: clientX, y: clientY };
        s.startTranslateX = s.translateX;
        s.startTranslateY = s.translateY;
      };

      const applyPan = (clientX, clientY) => {
        const s = state();
        if (!s.panStartClient || s.scale <= 1.01) return;
        s.translateX = s.startTranslateX + (clientX - s.panStartClient.x);
        s.translateY = s.startTranslateY + (clientY - s.panStartClient.y);
        this._socialPostImageZoomApplyTransform();
      };

      closeBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
      });

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay || event.target === stage) close();
      });

      document.addEventListener('keydown', (event) => {
        if (overlay.hidden) return;
        if (event.key === 'Escape') close();
      });

      touchSurface?.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });

      touchSurface?.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });

      const endTouch = (event) => {
        const s = state();
        const remaining = event.touches?.length || 0;
        if (remaining >= 2) return;
        if (remaining === 1) {
          if (s.pinching) {
            s.pinching = false;
            s.lastTwoFingerCenter = null;
            s.lastTwoFingerDistance = null;
            beginPan(event.touches[0].clientX, event.touches[0].clientY);
          }
          return;
        }
        s.pinching = false;
        s.panning = false;
        s.panStartClient = null;
        s.pinchCenter = null;
        s.startCenter = null;
        s.lastTwoFingerCenter = null;
        s.lastTwoFingerDistance = null;
        if (s.scale <= 1.01) this._socialPostImageZoomResetTransform();
      };

      touchSurface?.addEventListener('touchend', endTouch, { passive: true, capture: true });
      touchSurface?.addEventListener('touchcancel', endTouch, { passive: true, capture: true });

      surface?.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        beginPan(event.clientX, event.clientY);
      });

      window.addEventListener('mousemove', (event) => {
        if (overlay.hidden) return;
        const s = state();
        if (!s.panning || s.pinching) return;
        applyPan(event.clientX, event.clientY);
      });

      window.addEventListener('mouseup', () => {
        const s = state();
        s.panning = false;
        s.panStartClient = null;
      });

      surface?.addEventListener('dblclick', (event) => {
        event.preventDefault();
        const s = state();
        if (s.scale > 1.2) {
          this._socialPostImageZoomResetTransform();
          return;
        }
        s.scale = 2;
        this._socialPostImageZoomApplyTransform();
      });
    }

    openSocialPostImageZoom(imageEl) {
      const src = String(imageEl?.currentSrc || imageEl?.src || '').trim();
      if (!src) return;
      this.ensureSocialPostImageZoomOverlay();
      const overlay = document.getElementById('socialPostImageZoom');
      const img = overlay?.querySelector('.social-post-image-zoom__image');
      if (!overlay || !img) return;
      this._socialPostImageZoomResetTransform();
      img.src = src;
      overlay.hidden = false;
      document.documentElement.classList.add('odq-social-post-image-zoom-active');
      document.body.classList.add('odq-social-post-image-zoom-active');
    }

    closeSocialPostImageZoom() {
      const overlay = document.getElementById('socialPostImageZoom');
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      document.documentElement.classList.remove('odq-social-post-image-zoom-active');
      document.body.classList.remove('odq-social-post-image-zoom-active');
      this._socialPostImageZoomResetTransform();
      overlay.querySelector('.social-post-image-zoom__image')?.removeAttribute('src');
    }

    async initializeSocialPostsFeedScreen() {
      if (!this.guardSocialPostsAccess()) return;
      this.bindSocialPostsFeedControls();
      if (this._socialPostsFeedLoaded) {
        return;
      }
      this.setSocialPostsFeedStatus('Loading posts…', true);
      try {
        const page = await this.fetchSocialPostsFeedPage();
        this._socialPostsFeedPosts = page.posts || [];
        this._socialPostsFeedCursor = page.cursorPostId || '';
        this._socialPostsFeedHasMore = !!page.hasMore;
        this.renderSocialPostFeedEntries(this._socialPostsFeedPosts);
        this._socialPostsFeedLoaded = true;
        const loadMoreBtn = document.getElementById('socialPostsLoadMore');
        if (loadMoreBtn) loadMoreBtn.hidden = !this._socialPostsFeedHasMore;
      } catch (error) {
        this.setSocialPostsFeedStatus(error.message || 'Could not load posts');
      }
    }

    bindSocialPostsFeedControls() {
      if (this._socialPostsFeedControlsBound) return;
      this.ensureSocialPostImageZoomOverlay();
      this.bindSocialPostsPullToRefresh();
      const loadMoreBtn = document.getElementById('socialPostsLoadMore');
      loadMoreBtn?.addEventListener('click', async () => {
        if (!this._socialPostsFeedHasMore || this._socialPostsFeedLoading) return;
        this._socialPostsFeedLoading = true;
        loadMoreBtn.disabled = true;
        try {
          const page = await this.fetchSocialPostsFeedPage(this._socialPostsFeedCursor);
          const nextPosts = page.posts || [];
          this._socialPostsFeedPosts = (this._socialPostsFeedPosts || []).concat(nextPosts);
          this._socialPostsFeedCursor = page.cursorPostId || this._socialPostsFeedCursor;
          this._socialPostsFeedHasMore = !!page.hasMore;
          this.renderSocialPostFeedEntries(this._socialPostsFeedPosts);
        } catch (error) {
          this.uiService.showToast(error.message || 'Could not load more posts');
        } finally {
          this._socialPostsFeedLoading = false;
          loadMoreBtn.disabled = false;
          loadMoreBtn.hidden = !this._socialPostsFeedHasMore;
        }
      });
      this._socialPostsFeedControlsBound = true;
    }
  }

  root.SimplifiedQuiltAppV2Social = SimplifiedQuiltAppV2Social;
})(typeof globalThis !== 'undefined' ? globalThis : window);
