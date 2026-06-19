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

    buildSocialPostCarouselHtml(items, { classPrefix = 'social-post' } = {}) {
      const media = Array.isArray(items) ? items : [];
      if (!media.length) {
        return `<div class="${classPrefix}-media-frame ${classPrefix}-media-frame--empty">No media</div>`;
      }
      if (media.length === 1) {
        const item = media[0];
        const safeUrl = this.escapeQuiltFortuneText(item.url || item.previewUrl || '');
        const isVideo = item.type === 'video' || String(item.mime || item.file?.type || '').toLowerCase().startsWith('video/');
        if (isVideo) {
          return `<div class="${classPrefix}-media-frame"><video class="${classPrefix}-media" src="${safeUrl}" controls playsinline preload="metadata"></video></div>`;
        }
        return `<div class="${classPrefix}-media-frame"><img class="${classPrefix}-media" src="${safeUrl}" alt="" loading="lazy" /></div>`;
      }
      const slides = media
        .map((item, index) => {
          const safeUrl = this.escapeQuiltFortuneText(item.url || item.previewUrl || '');
          const isVideo = item.type === 'video' || String(item.mime || item.file?.type || '').toLowerCase().startsWith('video/');
          const inner = isVideo
            ? `<video class="${classPrefix}-media" src="${safeUrl}" controls playsinline preload="metadata"></video>`
            : `<img class="${classPrefix}-media" src="${safeUrl}" alt="" loading="lazy" />`;
          return `<div class="${classPrefix}-carousel-slide${index === 0 ? ` ${classPrefix}-carousel-slide--active` : ''}" data-slide-index="${index}">${inner}</div>`;
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
          carousel._touchStartX = event.changedTouches?.[0]?.clientX ?? null;
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
      if (typeof root.odqBackendBaseUrl === 'function') {
        return root.odqBackendBaseUrl();
      }
      return String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
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
          'Paste the server admin token (RESET_TOKEN) to publish social posts. It will be saved in this browser.'
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

    async ensureFirebaseForSocialUpload() {
      if (typeof this.initializeFirebaseForImages === 'function') {
        await this.initializeFirebaseForImages();
        return;
      }
      throw new Error('Firebase image upload is unavailable');
    }

    readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
    }

    async uploadSocialPostMediaFile(postId, file, index) {
      const token = await this.getSocialPostAdminToken({ promptIfMissing: false });
      const baseUrl = this.getSocialPostApiBaseUrl();
      if (token && baseUrl) {
        try {
          const dataUrl = await this.readFileAsDataUrl(file);
          const res = await fetch(`${baseUrl}/api/social-posts/upload-media`, {
            method: 'POST',
            headers: this.buildSocialPostAdminHeaders(token),
            body: JSON.stringify({ postId, index, dataUrl })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success && data.media?.url) {
            return data.media;
          }
          const apiError = data.error || res.statusText || `HTTP ${res.status}`;
          throw new Error(apiError);
        } catch (serverError) {
          const detail = String(serverError?.message || serverError || 'server upload failed');
          throw new Error(detail);
        }
      }

      await this.ensureFirebaseForSocialUpload();
      const { ref, uploadBytes, getDownloadURL } = await import(
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'
      );
      const storage = root.firebaseStorage;
      if (!storage) throw new Error('Firebase Storage is not initialized');

      const mime = String(file.type || '').toLowerCase();
      const isVideo = mime.startsWith('video/');
      const ext = isVideo ? 'mp4' : mime.includes('png') ? 'png' : 'jpg';
      const objectPath = `social-posts/${postId}/${index}.${ext}`;
      const objectRef = ref(storage, objectPath);
      await uploadBytes(objectRef, file, { contentType: mime || (isVideo ? 'video/mp4' : 'image/jpeg') });
      const url = await getDownloadURL(objectRef);
      return {
        type: isVideo ? 'video' : 'image',
        url
      };
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
        files: [],
        caption: '',
        publishing: false,
        previewUrls: []
      };
    }

    initializeSocialPostComposeScreen() {
      if (!this.guardSocialPostsAccess()) return;
      if (!this._socialComposeState) {
        this.resetSocialComposeState();
      }
      this.bindSocialPostComposeControls();
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
      const remaining = Math.max(0, 10 - state.files.length);
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
      const state = this._socialComposeState || { files: [], caption: '' };
      if (captionInput && captionInput.value !== state.caption) {
        captionInput.value = state.caption;
      }
      const mediaHtml = state.files.length
        ? this.buildSocialPostCarouselHtml(
            state.files.map((entry) => ({
              previewUrl: entry.previewUrl,
              type: String(entry.file?.type || '').toLowerCase().startsWith('video/') ? 'video' : 'image',
              mime: entry.file?.type || ''
            })),
            { classPrefix: 'social-post-compose' }
          )
        : '<p class="social-post-compose-preview-empty">Add an image or video to preview your post.</p>';
      const caption = this.escapeQuiltFortuneText(state.caption || '');
      preview.innerHTML = `
        <div class="social-post-compose-preview-card">
          <div class="social-post-compose-preview-media-frame">${mediaHtml}</div>
          <p class="social-post-compose-preview-caption">${caption || '<span class="social-post-compose-preview-caption--placeholder">Caption will appear here</span>'}</p>
        </div>
      `;
      this.bindSocialPostCarouselSwipe(preview);
    }

    async buildSocialPostMediaPayload(postId) {
      const state = this._socialComposeState;
      if (!state?.files?.length) return [];
      const media = [];
      for (let i = 0; i < state.files.length; i += 1) {
        const entry = state.files[i];
        try {
          const uploaded = await this.uploadSocialPostMediaFile(postId, entry.file, i);
          media.push(uploaded);
        } catch (error) {
          const detail = String(error?.message || error || 'upload failed');
          throw new Error(`Media upload failed: ${detail}`);
        }
      }
      return media;
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
        this.uiService.showToast(status === 'published' ? 'Publishing post…' : 'Saving draft…', 5000);
        const media = await this.buildSocialPostMediaPayload(state.postId);
        if (status === 'published' && !media.length) {
          this.uiService.showToast('Add at least one image or video before publishing');
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

    openSocialPostComposeScreen() {
      if (!this.guardSocialPostsAccess()) return;
      this.resetSocialComposeState();
      this.uiService.showScreen('screen-social-post-compose');
    }

    openSocialPostsFeedScreen() {
      if (!this.guardSocialPostsAccess()) return;
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

    renderSocialPostMedia(post) {
      return this.buildSocialPostCarouselHtml(Array.isArray(post.media) ? post.media : [], {
        classPrefix: 'social-post'
      });
    }

    renderSocialPostComment(comment, { isReply = false } = {}) {
      const author = String(comment.displayName || '').trim();
      const byline = author
        ? `<span class="social-post-comment-author">${this.escapeQuiltFortuneText(author)}</span>`
        : '<span class="social-post-comment-author social-post-comment-author--anon">Friend</span>';
      const text = this.escapeQuiltFortuneText(comment.text || '');
      const date = this.escapeQuiltFortuneText(this.formatSocialPostDate(comment.createdAtIso));
      const replyBtn =
        !isReply && comment.depth === 0
          ? `<button type="button" class="social-post-comment-reply-btn" data-comment-id="${this.escapeQuiltFortuneText(comment.commentId)}">Reply</button>`
          : '';
      const clientId = UtilsCore.getOrCreateUserId();
      const isOwn = String(comment.clientId || '') === clientId;
      const ownActions = isOwn
        ? `<button type="button" class="social-post-comment-edit-btn" data-comment-id="${this.escapeQuiltFortuneText(comment.commentId)}">Edit</button>
           <button type="button" class="social-post-comment-delete-btn" data-comment-id="${this.escapeQuiltFortuneText(comment.commentId)}">Delete</button>`
        : '';
      return `
        <article class="social-post-comment${isReply ? ' social-post-comment--reply' : ''}" data-comment-id="${this.escapeQuiltFortuneText(comment.commentId)}">
          <div class="social-post-comment-head">${byline}<span class="social-post-comment-date">${date}</span></div>
          <p class="social-post-comment-text">${text}</p>
          <form class="social-post-comment-edit-form" hidden>
            <textarea class="social-post-comment-edit-input" rows="2" maxlength="500">${text}</textarea>
            <div class="social-post-comment-edit-actions">
              <button type="button" class="social-post-comment-edit-cancel">Cancel</button>
              <button type="submit" class="social-post-comment-edit-save">Save</button>
            </div>
          </form>
          <div class="social-post-comment-actions">${replyBtn}${ownActions}</div>
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
          <form class="social-post-comment-form" data-post-id="${this.escapeQuiltFortuneText(postId)}">
            <label class="social-post-comment-form-label" for="socialPostCommentInput-${this.escapeQuiltFortuneText(postId)}">Add a comment</label>
            <textarea id="socialPostCommentInput-${this.escapeQuiltFortuneText(postId)}" class="social-post-comment-input" rows="2" maxlength="500" placeholder="Share a thought…"></textarea>
            <p class="social-post-comment-helper" hidden></p>
            <button type="submit" class="social-post-comment-submit">Post comment</button>
          </form>
          <form class="social-post-reply-form" data-post-id="${this.escapeQuiltFortuneText(postId)}" hidden>
            <p class="social-post-reply-label">Replying to a comment</p>
            <textarea class="social-post-reply-input" rows="2" maxlength="500" placeholder="Write a reply…"></textarea>
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
          const caption = this.escapeQuiltFortuneText(post.caption || '');
          const author = this.escapeQuiltFortuneText(post.authorLabel || 'Our Daily');
          const date = this.escapeQuiltFortuneText(this.formatSocialPostDate(post.publishedAtIso || post.createdAtIso));
          const commentLabel = Number(post.commentCount) === 1 ? '1 comment' : `${Number(post.commentCount) || 0} comments`;
          return `
            <article class="social-post-entry" data-post-id="${this.escapeQuiltFortuneText(postId)}">
              <div class="social-post-entry-header">
                <p class="social-post-entry-author">${author}</p>
                <p class="social-post-entry-date">${date}</p>
              </div>
              ${this.renderSocialPostMedia(post)}
              <p class="social-post-entry-caption">${caption}</p>
              <button type="button" class="social-post-entry-toggle" aria-expanded="false" aria-controls="${detailsId}">
                <span>${this.escapeQuiltFortuneText(commentLabel)}</span>
                <span class="social-post-entry-toggle-chevron" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img" focusable="false">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                </span>
              </button>
              <div class="social-post-entry-comments" id="${detailsId}" hidden>
                <div class="social-post-comments" data-post-id="${this.escapeQuiltFortuneText(postId)}"></div>
              </div>
            </article>
          `;
        })
        .join('');
      this.bindSocialPostFeedInteractions();
      this.bindSocialPostCarouselSwipe(feed);
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

        const editBtn = event.target.closest('.social-post-comment-edit-btn');
        if (editBtn) {
          const comment = editBtn.closest('.social-post-comment');
          const form = comment?.querySelector('.social-post-comment-edit-form');
          const textEl = comment?.querySelector('.social-post-comment-text');
          if (form && textEl) {
            textEl.hidden = true;
            form.hidden = false;
            form.querySelector('.social-post-comment-edit-input')?.focus();
          }
          return;
        }

        const editCancel = event.target.closest('.social-post-comment-edit-cancel');
        if (editCancel) {
          const comment = editCancel.closest('.social-post-comment');
          const form = comment?.querySelector('.social-post-comment-edit-form');
          const textEl = comment?.querySelector('.social-post-comment-text');
          if (form && textEl) {
            form.hidden = true;
            textEl.hidden = false;
          }
          return;
        }

        const toggle = event.target.closest('.social-post-entry-toggle');
        if (toggle) {
          const entry = toggle.closest('.social-post-entry');
          const details = entry?.querySelector('.social-post-entry-comments');
          const commentsHost = details?.querySelector('.social-post-comments');
          const postId = entry?.getAttribute('data-post-id') || '';
          const expanded = toggle.getAttribute('aria-expanded') === 'true';
          if (expanded) {
            toggle.setAttribute('aria-expanded', 'false');
            entry?.classList.remove('social-post-entry--open');
            if (details) details.hidden = true;
            return;
          }
          toggle.setAttribute('aria-expanded', 'true');
          entry?.classList.add('social-post-entry--open');
          if (details) details.hidden = false;
          if (commentsHost && !commentsHost.dataset.loaded) {
            commentsHost.dataset.loaded = '1';
            await this.loadSocialPostThread(postId, commentsHost);
          }
          return;
        }

        const replyBtn = event.target.closest('.social-post-comment-reply-btn');
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

    async submitSocialPostComment(postId, { text, parentCommentId = '', form, entry, isReply = false } = {}) {
      const trimmed = String(text || '').replace(/\s+/g, ' ').trim();
      const helper = form?.querySelector('.social-post-comment-helper') || form?.querySelector('.social-post-reply-actions');
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
          const input = form?.querySelector('.social-post-comment-input');
          if (input) input.value = '';
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
