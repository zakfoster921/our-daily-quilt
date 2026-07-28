/**
 * SimplifiedQuiltAppV2 quilt name leaderboard slice (inline on quilt screen).
 */
(function (root) {
  'use strict';

  const QNLB_VOTING_ENTRY_CAP = 10;

  class SimplifiedQuiltAppV2QuiltNameLeaderboard {
    quiltNameLeaderboardWrap() {
      return document.getElementById('quiltNameLeaderboardWrap');
    }

    quiltNameLeaderboardApiBaseUrl() {
      const configured = String(
        (typeof CONFIG !== 'undefined' && CONFIG.BACKEND?.baseUrl) || ''
      ).replace(/\/$/, '');
      const origin = String(root.location?.origin || '').replace(/\/$/, '');
      if (configured) return configured;
      return /^https?:\/\//i.test(origin) ? origin : '';
    }

    quiltNameLeaderboardClientId() {
      if (typeof Utils !== 'undefined' && typeof Utils.getOrCreateUserId === 'function') {
        return Utils.getOrCreateUserId();
      }
      if (typeof UtilsCore !== 'undefined' && typeof UtilsCore.getOrCreateUserId === 'function') {
        return UtilsCore.getOrCreateUserId();
      }
      return this.currentUserId || 'anonymous';
    }

    quiltNameLeaderboardDateKey() {
      if (typeof Utils !== 'undefined' && typeof Utils.getTodayKey === 'function') {
        return Utils.getTodayKey();
      }
      if (typeof UtilsCore !== 'undefined' && typeof UtilsCore.getTodayKey === 'function') {
        return UtilsCore.getTodayKey();
      }
      return '';
    }

    quiltNameLeaderboardVoteStorageKey(dateKey) {
      return `quiltNameLeaderboardVote_${dateKey || 'unknown'}`;
    }

    quiltNameLeaderboardCacheStorageKey(dateKey) {
      return `odqQuiltNameLeaderboardCache_${dateKey || 'unknown'}`;
    }

    _readLocalQuiltNameLeaderboardCache(dateKey) {
      const key = String(dateKey || '').trim();
      if (!key) return null;
      try {
        const raw = localStorage.getItem(this.quiltNameLeaderboardCacheStorageKey(key));
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (!entry || typeof entry !== 'object' || Number(entry.schemaVersion) !== 1) return null;
        if (!entry.payload || typeof entry.payload !== 'object') return null;
        return entry.payload;
      } catch (_) {
        return null;
      }
    }

    _writeLocalQuiltNameLeaderboardCache(dateKey, payload) {
      const key = String(dateKey || '').trim();
      if (!key || !payload || typeof payload !== 'object') return;
      if (payload.demo || payload.preview) return;
      try {
        localStorage.setItem(
          this.quiltNameLeaderboardCacheStorageKey(key),
          JSON.stringify({
            schemaVersion: 1,
            cachedAt: Date.now(),
            payload
          })
        );
      } catch (_) {
        /* */
      }
    }

    _paintQuiltNameLeaderboardBootstrap() {
      const dateKey = this.quiltNameLeaderboardDateKey();
      const cached = this._readLocalQuiltNameLeaderboardCache(dateKey);
      if (!cached) return false;
      this._qnlbLastPayload = cached;
      this.renderQuiltNameLeaderboard(cached, { forceImmediate: true });
      return true;
    }

    /** Show the taped card immediately even with no cache/API yet — never leave a blank scroll gap. */
    _paintQuiltNameLeaderboardShell() {
      if (this._paintQuiltNameLeaderboardBootstrap()) return true;
      const dateKey = this.quiltNameLeaderboardDateKey();
      const shell = {
        success: true,
        shell: true,
        dateKey,
        phase: 'submissions',
        entries: [],
        myVote: null,
        canSubmit: true,
        canVote: false,
        submissionsCloseAt: null,
        votingEndsAt: null
      };
      this._qnlbLastPayload = shell;
      this.renderQuiltNameLeaderboard(shell, { forceImmediate: true });
      this.setQuiltNameLeaderboardStatus?.('Loading…');
      return true;
    }

    quiltNameLeaderboardPreviewPhaseFromQuery() {
      try {
        const params = new URLSearchParams(root.location?.search || '');
        const explicit = String(
          params.get('qnlbPreview') || params.get('qnlbPhase') || ''
        ).trim().toLowerCase();
        if (explicit === 'submissions' || explicit === 'submission') return 'submissions';
        if (explicit === 'voting' || explicit === 'vote') return 'voting';
        if (explicit === 'empty' || explicit === 'none') return 'empty';
        const qnlb = String(params.get('qnlb') || '').trim().toLowerCase();
        if (qnlb === 'submissions' || qnlb === 'submission') return 'submissions';
        if (qnlb === 'voting' || qnlb === 'vote') return 'voting';
        if (qnlb === 'empty' || qnlb === 'none') return 'empty';
      } catch (_) {
        /* ignore */
      }
      return '';
    }

    quiltNameLeaderboardDebugFromQuery() {
      try {
        const value = String(
          new URLSearchParams(root.location?.search || '').get('qnlbDebug') || ''
        ).trim().toLowerCase();
        return value === '1' || value === 'true' || value === 'debug';
      } catch (_) {
        return false;
      }
    }

    applyQuiltNameLeaderboardDebugLayout() {
      const wrap = this.quiltNameLeaderboardWrap();
      if (!wrap) return;
      const on = this.quiltNameLeaderboardDebugFromQuery();
      wrap.classList.toggle('qnlb-debug', on);
      const existing = wrap.querySelector('.qnlb-debug-legend');
      if (!on) {
        existing?.remove();
        return;
      }
      if (existing) return;
      const legend = document.createElement('div');
      legend.className = 'qnlb-debug-legend';
      legend.setAttribute('aria-hidden', 'true');
      legend.innerHTML = [
        '<p class="qnlb-debug-legend__title">QN layout debug</p>',
        '<ul class="qnlb-debug-legend__list">',
        '<li><span class="qnlb-debug-swatch qnlb-debug-swatch--card"></span>Card outer edge</li>',
        '<li><span class="qnlb-debug-swatch qnlb-debug-swatch--panel"></span>Submit panel (padding box)</li>',
        '<li><span class="qnlb-debug-swatch qnlb-debug-swatch--inset"></span>Dot border frame (::after inset)</li>',
        '<li><span class="qnlb-debug-swatch qnlb-debug-swatch--content"></span>Content safe area (inset + text pad)</li>',
        '<li><span class="qnlb-debug-swatch qnlb-debug-swatch--tape"></span>Top/bottom tape (25% width, half off)</li>',
        '</ul>'
      ].join('');
      wrap.appendChild(legend);
    }

    getQuiltNameLeaderboardSubmissionsPreviewPayload() {
      const dateKey = this.quiltNameLeaderboardDateKey();
      const dayOpen = Date.parse(`${dateKey}T07:00:00.000Z`);
      const votingEndsAt = new Date(dayOpen + 24 * 60 * 60 * 1000).toISOString();
      const submissionsCloseAt = new Date(Date.now() + 95 * 60 * 1000).toISOString();
      const samples = [
        { word: 'Facet', source: 'community' },
        { word: 'Together', source: 'community' },
        { word: 'Future', source: 'community' },
        { word: 'Mutual', source: 'community' },
        { word: 'Parallel', source: 'community' },
        { word: 'Link', source: 'community' },
        { word: 'Gyre', source: 'community' },
        { word: 'Indra', source: 'community' },
        { word: 'Forward', source: 'community', isMine: true }
      ];
      return {
        success: true,
        preview: true,
        dateKey,
        phase: 'submissions',
        submissionsCloseAt,
        votingEndsAt,
        entries: samples.map((item, index) => ({
          id: `preview-${index}`,
          word: item.word,
          votes: 0,
          source: item.source,
          isMine: !!item.isMine
        })),
        myVote: null,
        canSubmit: false,
        canVote: false
      };
    }

    loadQuiltNameLeaderboardPreview(phase = 'submissions') {
      const normalized = String(phase || 'submissions').trim().toLowerCase();
      this._qnlbPreviewPhase = normalized === 'voting'
        ? 'voting'
        : normalized === 'empty'
          ? 'empty'
          : 'submissions';
      this._qnlbDemoMode = this._qnlbPreviewPhase === 'voting';
      const wrap = this.quiltNameLeaderboardWrap();
      if (wrap) wrap.dataset.qnlbExpanded = '0';
      this._qnlbLastPayload = this._qnlbPreviewPhase === 'voting'
        ? this.getQuiltNameLeaderboardDemoPayload()
        : this._qnlbPreviewPhase === 'empty'
          ? this.getQuiltNameLeaderboardEmptyPayload()
          : this.getQuiltNameLeaderboardSubmissionsPreviewPayload();
      this.renderQuiltNameLeaderboard(this._qnlbLastPayload);
    }

    openQuiltNameLeaderboard() {
      document.querySelectorAll('.admin-menu').forEach((el) => el.remove());
      const wrap = this.quiltNameLeaderboardWrap();
      this.setupQuiltNameLeaderboardScreen();
      this.uiService?.showScreen?.('screen-quilt');
      const previewPhase = this._qnlbPreviewPhase || this.quiltNameLeaderboardPreviewPhaseFromQuery();
      if (previewPhase) {
        this.loadQuiltNameLeaderboardPreview(previewPhase);
      } else {
        void this.refreshQuiltNameLeaderboard();
      }
      this.scheduleQuiltNameLeaderboardVisibleRefit();
      if (wrap) {
        requestAnimationFrame(() => {
          wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }

    mountQuiltNameLeaderboard() {
      this.setupQuiltNameLeaderboardScreen();
      const previewPhase = this._qnlbPreviewPhase || this.quiltNameLeaderboardPreviewPhaseFromQuery();
      if (previewPhase) this._qnlbPreviewPhase = previewPhase;
      if (this._qnlbMounted && !previewPhase) {
        this.applyQuiltNameLeaderboardDebugLayout();
        this.scheduleQuiltNameLeaderboardVisibleRefit();
        return;
      }
      this._qnlbMounted = true;
      if (previewPhase) {
        this.loadQuiltNameLeaderboardPreview(previewPhase);
        this.applyQuiltNameLeaderboardDebugLayout();
        this.scheduleQuiltNameLeaderboardVisibleRefit();
        return;
      }
      // Paint card immediately (cache or empty shell) — do not wait for API / scroll settle.
      this._paintQuiltNameLeaderboardShell();
      void this.refreshQuiltNameLeaderboard();
      this.applyQuiltNameLeaderboardDebugLayout();
      this.scheduleQuiltNameLeaderboardVisibleRefit();
    }

    scheduleQuiltNameLeaderboardVisibleRefit(retriesLeft = 48) {
      const list = document.getElementById('qnlbEntryList');
      if (!list || list.classList.contains('qnlb-name-cloud')) return;

      const run = () => {
        const quiltScreen = document.getElementById('screen-quilt');
        if (!quiltScreen?.classList.contains('active')) return false;
        if (!list.querySelector('.qnlb-entry-slab')) return false;
        const slab = list.querySelector('.qnlb-entry-slab');
        if (!slab || slab.offsetWidth <= 0) return false;
        this.fitQuiltNameLeaderboardVoting(list);
        return true;
      };

      if (run()) return;
      if (retriesLeft <= 0) return;
      requestAnimationFrame(() => this.scheduleQuiltNameLeaderboardVisibleRefit(retriesLeft - 1));
    }

    setupQuiltNameLeaderboardScreen() {
      const wrap = this.quiltNameLeaderboardWrap();
      const form = document.getElementById('qnlbSubmitForm');
      if (!wrap || !form || wrap.dataset.qnlbBound === '1') return;
      wrap.dataset.qnlbBound = '1';

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await this.submitQuiltNameLeaderboardEntry();
      });

      const nameInput = document.getElementById('qnlbNameInput');
      nameInput?.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Spacebar') event.preventDefault();
      });
      nameInput?.addEventListener('paste', (event) => {
        const pasted = String(event.clipboardData?.getData('text') || '');
        if (/\s/.test(pasted)) {
          event.preventDefault();
          this.setQuiltNameLeaderboardStatus('Please choose just one word.', 'error');
        }
      });
      nameInput?.addEventListener('input', () => {
        const cleaned = String(nameInput.value || '').replace(/[^A-Za-z]/g, '');
        if (cleaned !== nameInput.value) nameInput.value = cleaned;
      });

      const list = document.getElementById('qnlbEntryList');
      list?.addEventListener('click', async (event) => {
        const deleteBtn = event.target?.closest?.('[data-qnlb-delete-word]');
        if (deleteBtn) {
          event.preventDefault();
          event.stopPropagation();
          const deleteWord = String(deleteBtn.getAttribute('data-qnlb-delete-word') || '').trim();
          if (deleteWord) await this.deleteQuiltNameLeaderboardEntry(deleteWord);
          return;
        }
        const row = event.target?.closest?.('.qnlb-entry[data-qnlb-vote-word]');
        if (!row) return;
        const word = String(row.getAttribute('data-qnlb-vote-word') || '').trim();
        if (!word) return;
        if (String(this._qnlbLastPayload?.myVote || '').trim() === word) return;
        if (this._qnlbDemoMode || this._qnlbLastPayload?.demo) {
          this.applyQuiltNameLeaderboardDemoVote(word);
          return;
        }
        await this.castQuiltNameLeaderboardVote(word);
      });

      list?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target?.closest?.('[data-qnlb-delete-word]')) return;
        const row = event.target?.closest?.('.qnlb-entry[data-qnlb-vote-word]');
        if (!row) return;
        event.preventDefault();
        const word = String(row.getAttribute('data-qnlb-vote-word') || '').trim();
        if (!word) return;
        if (String(this._qnlbLastPayload?.myVote || '').trim() === word) return;
        if (this._qnlbDemoMode || this._qnlbLastPayload?.demo) {
          this.applyQuiltNameLeaderboardDemoVote(word);
          return;
        }
        await this.castQuiltNameLeaderboardVote(word);
      });

      const expandBtn = document.getElementById('qnlbExpandBtn');
      expandBtn?.addEventListener('click', () => {
        wrap.dataset.qnlbExpanded = '1';
        void this.refreshQuiltNameLeaderboard({ renderOnly: true });
      });

      const refreshBtn = document.getElementById('qnlbRefreshBtn');
      refreshBtn?.addEventListener('click', () => {
        this._qnlbDemoMode = false;
        void this.refreshQuiltNameLeaderboard();
      });

      const demoBtn = document.getElementById('qnlbDemoBtn');
      demoBtn?.addEventListener('click', () => {
        this.loadQuiltNameLeaderboardDemo();
      });

      const infoBtn = document.getElementById('qnlbInfoBtn');
      const infoModal = document.getElementById('qnlbInfoModal');
      if (infoBtn && infoModal) {
        const closeInfoModalOnScroll = () => {
          infoModal.setAttribute('hidden', '');
          document.removeEventListener('scroll', closeInfoModalOnScroll, true);
        };
        infoBtn.addEventListener('click', () => {
          infoModal.removeAttribute('hidden');
          document.addEventListener('scroll', closeInfoModalOnScroll, true);
        });
        infoModal.addEventListener('click', (event) => {
          if (
            event.target.closest('.admin-name-ballot-info-close') ||
            event.target.classList?.contains('admin-name-ballot-info-modal')
          ) {
            infoModal.setAttribute('hidden', '');
            document.removeEventListener('scroll', closeInfoModalOnScroll, true);
          }
        });
      }

      this.applyQuiltNameLeaderboardSubmitStyle();
      this.applyQuiltNameLeaderboardDebugLayout();
    }

    applyQuiltNameLeaderboardInfoModal(phase = 'submissions') {
      const title = document.getElementById('qnlbInfoModalTitle');
      const text = document.getElementById('qnlbInfoModalText');
      if (!title || !text) return;

      if (phase === 'voting') {
        title.innerHTML = '<strong>How voting works</strong>';
        text.textContent =
          `The submission window for quilt titles is open for the first 8 hours of every day. Then voting opens: ${QNLB_VOTING_ENTRY_CAP} names are pulled at random. Title with most votes wins.`;
        return;
      }

      title.innerHTML = '<strong>How submissions work</strong>';
      text.textContent =
        `For the first 8 hours of each quilt day, anyone can suggest one word to name today's quilt. Names show up below as they come in. When that window closes, ${QNLB_VOTING_ENTRY_CAP} names are picked at random for the vote.`;
    }

    getQuiltNameLeaderboardEmptyPayload() {
      const dateKey = this.quiltNameLeaderboardDateKey();
      const dayOpen = Date.parse(`${dateKey}T07:00:00.000Z`);
      const submissionsCloseAt = new Date(dayOpen + 8 * 60 * 60 * 1000).toISOString();
      const votingEndsAt = new Date(dayOpen + 24 * 60 * 60 * 1000).toISOString();
      return {
        success: true,
        dateKey,
        phase: 'submissions',
        submissionsCloseAt,
        votingEndsAt,
        entries: [],
        myVote: null,
        canSubmit: true,
        canVote: false
      };
    }

    async deleteQuiltNameLeaderboardEntry(rawWord) {
      const word = String(rawWord || '').trim();
      if (!word) return;
      if (!this.isCurrentUserAdmin?.()) {
        this.setQuiltNameLeaderboardStatus('Admin only.', 'error');
        return;
      }
      if (!window.confirm(`Delete “${word}”?`)) return;

      const isDemo = !!(this._qnlbDemoMode || this._qnlbLastPayload?.demo || this._qnlbLastPayload?.preview);
      if (isDemo) {
        const entries = (this._qnlbLastPayload?.entries || []).filter(
          (entry) => String(entry?.word || '').trim().toLowerCase() !== word.toLowerCase()
        );
        this._qnlbLastPayload = { ...(this._qnlbLastPayload || {}), entries };
        this.renderQuiltNameLeaderboard(this._qnlbLastPayload);
        this.setQuiltNameLeaderboardStatus(`Deleted “${word}”.`, 'success');
        return;
      }

      const baseUrl = this.quiltNameLeaderboardApiBaseUrl();
      if (!baseUrl) {
        this.setQuiltNameLeaderboardStatus('API base URL is not configured.', 'error');
        return;
      }

      const token = await this.getAdminServerMutationToken?.();
      if (!token) {
        this.setQuiltNameLeaderboardStatus('Admin token required to delete names.', 'error');
        return;
      }

      this.setQuiltNameLeaderboardStatus(`Deleting “${word}”…`);
      try {
        const res = await fetch(`${baseUrl}/api/quilt-name-leaderboard-delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-reset-token': token
          },
          body: JSON.stringify({
            dateKey: this.quiltNameLeaderboardDateKey(),
            word
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (res.status === 401) {
          try {
            localStorage.removeItem('ourDailyResetToken');
          } catch (_) {
            /* ignore */
          }
          throw new Error('Unauthorized — check your RESET_TOKEN');
        }
        if (!res.ok || !payload.success) {
          throw new Error(payload.error || `HTTP ${res.status}`);
        }
        if (String(this._qnlbLastPayload?.myVote || '').trim().toLowerCase() === word.toLowerCase()) {
          try {
            localStorage.removeItem(this.quiltNameLeaderboardVoteStorageKey(this.quiltNameLeaderboardDateKey()));
          } catch (_) {
            /* ignore */
          }
        }
        await this.refreshQuiltNameLeaderboard();
        this.setQuiltNameLeaderboardStatus(`Deleted “${word}”.`, 'success');
      } catch (error) {
        const message = String(error?.message || 'Delete failed');
        if (/failed to fetch/i.test(message)) {
          this.setQuiltNameLeaderboardStatus(
            'Could not reach the server — wait for deploy or check CORS/API URL.',
            'error'
          );
        } else {
          this.setQuiltNameLeaderboardStatus(message, 'error');
        }
      }
    }

    quiltNameLeaderboardFakeVoteCount(word, salt) {
      const hash = this.qnlbCloudHashString(`${salt}|${word}`);
      return 1 + (hash % 24);
    }

    getQuiltNameLeaderboardDemoPayload() {
      const dateKey = this.quiltNameLeaderboardDateKey();
      const dayOpen = Date.parse(`${dateKey}T07:00:00.000Z`);
      const submissionsCloseAt = new Date(dayOpen + 8 * 60 * 60 * 1000).toISOString();
      const votingEndsAt = new Date(dayOpen + 24 * 60 * 60 * 1000).toISOString();
      const myVote = String(this._qnlbLastPayload?.myVote || '').trim()
        || localStorage.getItem(this.quiltNameLeaderboardVoteStorageKey(dateKey))
        || '';
      const voteSalt = String(this._qnlbFakeVoteSalt || Date.now());
      const samples = [
        { word: 'Confluence', source: 'community', votes: 24 },
        { word: 'Weave', source: 'community', votes: 22 },
        { word: 'Ember', source: 'community', votes: 17 },
        { word: 'Velvet', source: 'community', votes: 14 },
        { word: 'Prism', source: 'community', votes: 9 },
        { word: 'Indigo', source: 'ai', votes: 8 },
        { word: 'Pulse', source: 'ai', votes: 7 },
        { word: 'Threshold', source: 'community', votes: 7 },
        { word: 'Glimmer', source: 'community', votes: 3 },
        { word: 'Meridian', source: 'community', votes: 3, isMine: true }
      ];
      return {
        success: true,
        demo: true,
        dateKey,
        phase: 'voting',
        submissionsCloseAt,
        votingEndsAt,
        entries: this.sortQuiltNameLeaderboardEntries(
          samples.map((item, index) => ({
            id: `demo-${index}`,
            word: item.word,
            votes: Number(item.votes) || this.quiltNameLeaderboardFakeVoteCount(item.word, voteSalt),
            source: item.source,
            isMine: !!item.isMine
          })),
          'voting'
        ),
        myVote: myVote || null,
        canSubmit: false,
        canVote: true,
        votingCap: QNLB_VOTING_ENTRY_CAP
      };
    }

    loadQuiltNameLeaderboardDemo() {
      this._qnlbDemoMode = true;
      this._qnlbFakeVoteSalt = Date.now();
      const wrap = this.quiltNameLeaderboardWrap();
      if (wrap) wrap.dataset.qnlbExpanded = '0';
      this._qnlbLastPayload = this.getQuiltNameLeaderboardDemoPayload();
      this.renderQuiltNameLeaderboard(this._qnlbLastPayload);
      this.setQuiltNameLeaderboardStatus('Sample names only — Refresh to load the real list.', 'success');
    }

    applyQuiltNameLeaderboardDemoVote(word) {
      if (!this._qnlbLastPayload?.demo || !Array.isArray(this._qnlbLastPayload.entries)) return;
      const previous = String(this._qnlbLastPayload.myVote || '').trim();
      if (previous === word) return;
      const entries = this._qnlbLastPayload.entries.map((entry) => ({ ...entry }));
      if (previous && previous !== word) {
        const prevEntry = entries.find((entry) => entry.word === previous);
        if (prevEntry) prevEntry.votes = Math.max(0, (Number(prevEntry.votes) || 0) - 1);
      }
      const nextEntry = entries.find((entry) => entry.word === word);
      if (nextEntry && previous !== word) nextEntry.votes = (Number(nextEntry.votes) || 0) + 1;
      this._qnlbLastPayload = {
        ...this._qnlbLastPayload,
        entries: this.sortQuiltNameLeaderboardEntries(entries, 'voting'),
        myVote: word
      };
      const dateKey = this.quiltNameLeaderboardDateKey();
      localStorage.setItem(this.quiltNameLeaderboardVoteStorageKey(dateKey), word);
      this.renderQuiltNameLeaderboard(this._qnlbLastPayload, { animateReorder: true });
      this.setQuiltNameLeaderboardStatus('Sample vote saved. Tap another name to change your mind.', 'success');
    }

    sortQuiltNameLeaderboardEntries(entries, phase) {
      const sorted = Array.isArray(entries) ? [...entries] : [];
      if (phase === 'voting' || phase === 'final') {
        sorted.sort((a, b) => {
          const voteDiff = (Number(b.votes) || 0) - (Number(a.votes) || 0);
          if (voteDiff !== 0) return voteDiff;
          return String(a.word || '').localeCompare(String(b.word || ''));
        });
      }
      return sorted;
    }

    qnlbCloudHashString(value) {
      const str = String(value || '');
      let hash = 5381;
      for (let i = 0; i < str.length; i += 1) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
      }
      return Math.abs(hash);
    }

    qnlbEntryCloudTransform(row) {
      if (!row) return '';
      const x = row.style.getPropertyValue('--tag-nudge-x') || '0';
      const y = row.style.getPropertyValue('--tag-nudge-y') || '0';
      const rot = row.style.getPropertyValue('--cloud-rot') || '0deg';
      return `translate(${x}, ${y}) rotate(${rot})`;
    }

    applyQuiltNameLeaderboardCloudScatter(row, word, index) {
      const styleHash = this.qnlbCloudHashString(`${word}|${this.quiltNameLeaderboardDateKey()}|${index}`);
      const tilt = (styleHash % 13) - 6;
      const nudgeX = ((styleHash % 9) - 4) * 0.38;
      const nudgeY = ((Math.floor(styleHash / 3) % 7) - 3) * 0.3;
      row.style.setProperty('--cloud-rot', `${tilt}deg`);
      row.style.setProperty('--tag-nudge-x', `${nudgeX}px`);
      row.style.setProperty('--tag-nudge-y', `${nudgeY}px`);
      row.style.transform = this.qnlbEntryCloudTransform(row);
    }

    /** Soft tilt/nudge on voting strips only — rank badges stay square. */
    applyQuiltNameLeaderboardStripJitter(slab, word, index) {
      if (!slab) return;
      const styleHash = this.qnlbCloudHashString(`strip|${word}|${this.quiltNameLeaderboardDateKey()}|${index}`);
      const tilt = ((styleHash % 9) - 4) * 0.3;
      const nudgeX = ((styleHash % 7) - 3) * 0.5;
      const nudgeY = ((Math.floor(styleHash / 5) % 5) - 2) * 0.4;
      slab.style.setProperty('--qnlb-strip-rot', `${tilt.toFixed(2)}deg`);
      slab.style.setProperty('--qnlb-strip-nudge-x', `${nudgeX.toFixed(2)}px`);
      slab.style.setProperty('--qnlb-strip-nudge-y', `${nudgeY.toFixed(2)}px`);
    }

    qnlbCardMaxHeightPx(wrap) {
      const viewportH = Math.floor(
        (root.visualViewport && root.visualViewport.height) || root.innerHeight || 0
      );
      if (!viewportH) return 0;
      const ratio = wrap
        ? Number.parseFloat(getComputedStyle(wrap).getPropertyValue('--qnlb-card-max-vh')) || 0.75
        : 0.75;
      const clamped = Math.min(1, Math.max(0.35, ratio));
      return Math.floor(viewportH * clamped);
    }

    qnlbFitScaleToCard(wrap, options = {}) {
      if (!wrap) return;
      const maxHeight = this.qnlbCardMaxHeightPx(wrap);
      if (!maxHeight) return;

      const minScale = options.minScale ?? 0.38;
      const maxScale = options.maxScale ?? 1.2;
      const applyScale = options.applyScale;
      if (typeof applyScale !== 'function') return;

      const overflows = () => wrap.scrollHeight > maxHeight + 2;
      const fitsAtScale = (scale) => {
        applyScale(scale);
        void wrap.offsetHeight;
        return !overflows();
      };

      let lo = minScale;
      let hi = maxScale;
      let bestScale = maxScale;
      for (let i = 0; i < 24 && hi - lo > 0.01; i += 1) {
        const mid = (lo + hi) / 2;
        if (fitsAtScale(mid)) {
          bestScale = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }

      applyScale(bestScale);
      if (overflows()) {
        let scale = bestScale;
        let guard = 0;
        while (scale > minScale && overflows() && guard < 18) {
          scale = Math.max(minScale, scale * 0.96);
          applyScale(scale);
          guard += 1;
        }
      }
    }

    fitQuiltNameLeaderboardCloud(list) {
      if (!list) return;
      const wrap = list.closest('.quilt-name-leaderboard-wrap');
      if (!wrap) return;

      this.qnlbFitScaleToCard(wrap, {
        minScale: 0.38,
        maxScale: 1.2,
        applyScale: (value) => {
          wrap.style.setProperty('--qnlb-cloud-base-size', String(value));
          const gapScale = value < 0.72 ? Math.max(0.72, value + 0.08) : 1;
          wrap.style.setProperty('--qnlb-cloud-gap-scale', String(gapScale));
        }
      });
    }

    fitQuiltNameLeaderboardVoting(list) {
      if (!list) return;
      const slab = list.closest('.qnlb-rank-board__slab');
      if (!slab) return;

      // Voting card grows with its rows; keep natural scale so the paper edge and tape track content.
      slab.style.setProperty('--qnlb-rank-scale-fit', '1');
      this.syncQuiltNameLeaderboardStripWidths(list);
    }

    bindQuiltNameLeaderboardLayoutResize() {
      if (this._qnlbLayoutResizeBound) return;
      this._qnlbLayoutResizeBound = true;
      const refit = () => {
        const list = document.getElementById('qnlbEntryList');
        if (!list) return;
        this.scheduleFitQuiltNameLeaderboardLayout(list);
      };
      root.addEventListener('resize', refit, { passive: true });
      root.visualViewport?.addEventListener('resize', refit, { passive: true });
    }

    scheduleFitQuiltNameLeaderboardLayout(list) {
      if (!list) return;
      const run = () => {
        if (list.classList.contains('qnlb-name-cloud')) {
          this.fitQuiltNameLeaderboardCloud(list);
        } else {
          this.fitQuiltNameLeaderboardVoting(list);
        }
      };
      requestAnimationFrame(() => {
        run();
        if (document.fonts?.ready) {
          document.fonts.ready.then(run).catch(() => {});
        }
      });
    }

    shouldAnimateQuiltNameLeaderboardReorder(options = {}) {
      if (!options.animateReorder) return false;
      if (root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
      return true;
    }

    captureQuiltNameLeaderboardFlipState(list) {
      const map = new Map();
      if (!list) return map;
      list.querySelectorAll('.qnlb-entry[data-qnlb-entry-word]').forEach((item) => {
        map.set(item.dataset.qnlbEntryWord, item.getBoundingClientRect());
      });
      return map;
    }

    runQuiltNameLeaderboardFlip(list, beforeRects) {
      if (!list || !beforeRects?.size) return;
      list.querySelectorAll('.qnlb-entry[data-qnlb-entry-word]').forEach((item) => {
        const key = item.dataset.qnlbEntryWord;
        const before = beforeRects.get(key);
        if (!before) return;
        const after = item.getBoundingClientRect();
        const dy = before.top - after.top;
        const dx = before.left - after.left;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

        item.classList.add('qnlb-entry--moving');
        item.style.transform = `translate(${dx}px, ${dy}px) ${this.qnlbEntryCloudTransform(item)}`;
        item.style.transition = 'transform 0s';

        requestAnimationFrame(() => {
          item.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
          item.style.transform = this.qnlbEntryCloudTransform(item);
        });

        const onEnd = (event) => {
          if (event.propertyName !== 'transform') return;
          item.removeEventListener('transitionend', onEnd);
          item.classList.remove('qnlb-entry--moving');
          item.style.transition = '';
          item.style.transform = this.qnlbEntryCloudTransform(item);
        };
        item.addEventListener('transitionend', onEnd);
      });
    }

    paintQuiltNameLeaderboardStripRow(row, entry, index, viewState) {
      const { phase, myVote, winningVoteCount, winningColor, showVotes, canVote, demo } = viewState;
      const word = String(entry.word || '').trim();
      const safeWord = this.escapeQuiltNameLeaderboardHtml(word);
      const votes = Number(entry.votes);
      const showVoteCounts = phase === 'voting' || phase === 'final' || demo;
      const isSelected = myVote && word === myVote;
      const isWinning = showVoteCounts && winningVoteCount > 0 && votes === winningVoteCount;

      row.className = [
        'qnlb-entry',
        'qnlb-name-strip',
        isSelected ? 'qnlb-entry--selected' : '',
        isWinning ? 'qnlb-entry--winning' : ''
      ].filter(Boolean).join(' ');
      row.dataset.qnlbEntryWord = this.normalizeLeaderboardEntryKey(word);
      if (isWinning && winningColor) {
        row.style.setProperty('--qnlb-winning-color', winningColor);
      } else {
        row.style.removeProperty('--qnlb-winning-color');
      }
      this.applyQuiltNameLeaderboardCloudScatter(row, word, index);

      row.innerHTML = `
        ${this.quiltNameLeaderboardAdminDeleteMarkup(word)}
        <span class="qnlb-entry__word">${safeWord}</span>
        ${showVoteCounts ? this.quiltNameLeaderboardTallyMarkup(votes) : ''}
      `;

      if (canVote) {
        row.setAttribute('data-qnlb-vote-word', word);
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        row.setAttribute(
          'aria-label',
          isSelected
            ? `Voted for ${word}. Tap another name to change your vote.`
            : `Vote for ${word}`
        );
      } else {
        row.removeAttribute('data-qnlb-vote-word');
        row.removeAttribute('role');
        row.removeAttribute('tabindex');
        row.removeAttribute('aria-pressed');
        row.removeAttribute('aria-label');
      }
    }

    paintQuiltNameLeaderboardListRow(row, entry, index, viewState) {
      const { myVote, winningVoteCount, winningColor, showVotes, canVote, demo, badgeTones } = viewState;
      const word = String(entry.word || '').trim();
      const safeWord = this.escapeQuiltNameLeaderboardHtml(word);
      const votes = Number(entry.votes);
      const showVoteCounts = showVotes || demo;
      const isSelected = myVote && word === myVote;
      const isWinning = showVoteCounts && winningVoteCount > 0 && votes === winningVoteCount;
      const position = index + 1;

      row.className = [
        'qnlb-entry',
        'qnlb-entry-card',
        isSelected ? 'qnlb-entry--selected' : '',
        isWinning ? 'qnlb-entry--winning' : ''
      ].filter(Boolean).join(' ');
      row.dataset.qnlbEntryWord = this.normalizeLeaderboardEntryKey(word);
      row.style.removeProperty('--cloud-rot');
      row.style.removeProperty('--tag-nudge-x');
      row.style.removeProperty('--tag-nudge-y');
      row.style.removeProperty('transform');
      if (isWinning && winningColor) {
        row.style.setProperty('--qnlb-winning-color', winningColor);
      } else {
        row.style.removeProperty('--qnlb-winning-color');
      }

      const tones = Array.isArray(badgeTones) ? badgeTones : [];
      const tone = tones.length ? tones[index % tones.length] : '';
      if (tone) {
        const luminance = this.qnlbHexLuminance(tone);
        const fg = luminance !== null && luminance < 140 ? '#f6f1e8' : '#241f19';
        row.style.setProperty('--qnlb-position-badge-bg', tone);
        row.style.setProperty('--qnlb-position-badge-fg', fg);
      } else {
        row.style.removeProperty('--qnlb-position-badge-bg');
        row.style.removeProperty('--qnlb-position-badge-fg');
      }

      row.innerHTML = `
        <span class="qnlb-entry__position" aria-hidden="true">${position}</span>
        <div class="quilt-before-you-go__slab quilt-before-you-go__slab--art qnlb-entry-slab">
          <div class="quilt-before-you-go__slab-body">
            <div class="qnlb-entry-card__inner">
              <span class="qnlb-entry__word">${safeWord}</span>
              ${showVoteCounts || canVote
    ? `<span class="qnlb-entry__vote-group">
              ${showVoteCounts
    ? this.quiltNameLeaderboardTallyMarkup(votes, { hasVoteIcon: canVote })
    : '<span class="qnlb-entry__tally qnlb-entry__tally--empty" aria-hidden="true"></span>'}
              ${canVote ? '<span class="qnlb-entry__vote" aria-hidden="true"></span>' : ''}
            </span>`
    : ''}
              ${this.quiltNameLeaderboardAdminDeleteMarkup(word)}
            </div>
          </div>
        </div>
      `;

      this.applyQuiltNameLeaderboardStripJitter(row.querySelector('.qnlb-entry-slab'), word, index);

      if (canVote) {
        row.setAttribute('data-qnlb-vote-word', word);
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        row.setAttribute(
          'aria-label',
          isSelected
            ? `#${position} ${word}. Voted for this name. Tap another to change your vote.`
            : `#${position} ${word}. Vote for this name.`
        );
      } else {
        row.removeAttribute('data-qnlb-vote-word');
        row.removeAttribute('role');
        row.removeAttribute('tabindex');
        row.removeAttribute('aria-pressed');
        row.removeAttribute('aria-label');
      }
    }

    paintQuiltNameLeaderboardEntryRow(row, entry, index, viewState) {
      if (!this.usesQuiltNameLeaderboardCloudLayout(viewState.phase)) {
        this.paintQuiltNameLeaderboardListRow(row, entry, index, viewState);
        return;
      }
      this.paintQuiltNameLeaderboardStripRow(row, entry, index, viewState);
    }

    usesQuiltNameLeaderboardCloudLayout(phase) {
      return String(phase || '') === 'submissions';
    }

    updateQuiltNameLeaderboardList(list, visibleEntries, viewState, options = {}) {
      const animate = this.shouldAnimateQuiltNameLeaderboardReorder(options);
      const beforeRects = animate ? this.captureQuiltNameLeaderboardFlipState(list) : null;

      if (!visibleEntries.length) {
        list.innerHTML = '';
        return;
      }

      const existing = new Map();
      list.querySelectorAll('.qnlb-entry[data-qnlb-entry-word]').forEach((node) => {
        existing.set(node.dataset.qnlbEntryWord, node);
      });

      const nextRows = [];
      visibleEntries.forEach((entry, index) => {
        const key = this.normalizeLeaderboardEntryKey(entry.word);
        let row = existing.get(key);
        if (!row) {
          row = document.createElement('li');
          row.dataset.qnlbEntryWord = key;
        }
        this.paintQuiltNameLeaderboardEntryRow(row, entry, index, viewState);
        nextRows.push(row);
      });

      list.textContent = '';
      nextRows.forEach((row) => list.appendChild(row));

      const useCloudLayout = this.usesQuiltNameLeaderboardCloudLayout(viewState.phase);
      if (!useCloudLayout) {
        // Settle pill widths now, synchronously — before the FLIP reads "after" rects —
        // so the reorder transition never gets its width changed out from under it
        // a couple of frames into the slide (was reading as a stutter/delay).
        this.syncQuiltNameLeaderboardStripWidths(list);
      }

      if (animate && beforeRects?.size) {
        this.runQuiltNameLeaderboardFlip(list, beforeRects);
      }
      if (useCloudLayout) {
        this.bindQuiltNameLeaderboardLayoutResize();
        this.scheduleFitQuiltNameLeaderboardLayout(list);
        list.closest('.qnlb-rank-board__slab')?.style.removeProperty('--qnlb-strip-width');
        list.closest('.qnlb-rank-board__slab')?.style.removeProperty('--qnlb-rank-scale-fit');
      } else {
        list.closest('.quilt-name-leaderboard-wrap')?.style.removeProperty('--qnlb-cloud-base-size');
        list.closest('.quilt-name-leaderboard-wrap')?.style.removeProperty('--qnlb-cloud-gap-scale');
        this.bindQuiltNameLeaderboardLayoutResize();
        this.scheduleFitQuiltNameLeaderboardLayout(list);
      }
    }

    syncQuiltNameLeaderboardStripWidths(list, retriesLeft = 20) {
      const slabWrap = list?.closest('.qnlb-rank-board__slab');
      if (!list?.classList.contains('qnlb-entry-list--final')) {
        slabWrap?.style.removeProperty('--qnlb-strip-width');
        slabWrap?.style.removeProperty('--qnlb-voting-row-width');
        return;
      }

      const slabs = [...list.querySelectorAll('.qnlb-entry-slab')];
      if (!slabs.length) {
        slabWrap?.style.removeProperty('--qnlb-strip-width');
        slabWrap?.style.removeProperty('--qnlb-voting-row-width');
        return;
      }

      // Clear any width from a previous render first — otherwise every slab is
      // already pinned to its old assigned width and reports that instead of its
      // own natural (word + votes) width, so the "longest word" measurement goes stale.
      slabWrap.style.removeProperty('--qnlb-strip-width');
      slabWrap.style.removeProperty('--qnlb-voting-row-width');
      slabs.forEach((slab) => {
        slab.style.removeProperty('width');
        slab.style.width = 'max-content';
      });
      void list.offsetWidth;

      let maxWidth = 0;
      for (const slab of slabs) {
        // offsetWidth ignores row tilt transforms; getBoundingClientRect does not.
        maxWidth = Math.max(maxWidth, slab.offsetWidth);
      }
      slabs.forEach((slab) => slab.style.removeProperty('width'));
      if (maxWidth <= 0) {
        // The card is still collapsed to zero size (e.g. the screen hasn't finished
        // becoming visible yet on first paint) — everything measures as 0. Retry a
        // few frames later instead of silently giving up forever.
        if (retriesLeft > 0 && typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => this.syncQuiltNameLeaderboardStripWidths(list, retriesLeft - 1));
        }
        return;
      }

      // Longest entry defines the reference width, plus a modest gap before its vote count.
      const QNLB_STRIP_EXTRA_PAD_PX = 20;
      const QNLB_STRIP_WIDTH_SCALE = 1.129;
      const target = Math.ceil((maxWidth + QNLB_STRIP_EXTRA_PAD_PX) * QNLB_STRIP_WIDTH_SCALE);
      slabWrap.style.setProperty('--qnlb-strip-width', `${target}px`);

      for (const slab of slabs) {
        slab.style.width = `${target}px`;
      }

      const rowWidth = this.qnlbVotingRowWidthPx(slabWrap, target);
      slabWrap.style.setProperty('--qnlb-voting-row-width', `${rowWidth}px`);
    }

    qnlbVotingRowWidthPx(slabWrap, stripWidthPx) {
      const list = slabWrap?.querySelector('.qnlb-entry-list--final');
      const position = list?.querySelector('.qnlb-entry__position');
      const rankColPx = position?.offsetWidth || 0;
      const entry = list?.querySelector('.qnlb-entry');
      if (!entry) return Math.ceil(stripWidthPx);
      const gap = parseFloat(getComputedStyle(entry).columnGap) || 0;
      return Math.ceil(rankColPx + gap + stripWidthPx);
    }

    normalizeLeaderboardEntryKey(word) {
      return String(word || '').trim().toLowerCase();
    }

    isQuiltNameLeaderboardSingleWord(value) {
      const word = String(value || '').trim();
      return /^[A-Za-z]+$/.test(word);
    }

    canQuiltNameLeaderboardSubmit(data = {}) {
      if (String(data.phase || 'submissions') !== 'submissions') return false;
      if (data.demo) return false;
      if (data.preview) return true;
      if (data.canSubmit === false) return false;
      if (data.canSubmit) return true;
      return !!this.isCurrentUserAdmin?.();
    }

    applyQuiltNameLeaderboardSubmitStyle() {
      const submit = document.getElementById('qnlbSubmitBtn');
      if (!submit) return;
      const label = 'Suggest';
      const markerColor = String(
        this.getBrightQuiltMarkerColor?.() ||
          (typeof CONFIG !== 'undefined' && CONFIG.APP?.defaultColor) ||
          '#ea9b9a'
      ).trim();
      const match = /^#?([0-9a-f]{6})$/i.exec(markerColor);
      if (match) {
        const hex = match[1];
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        submit.style.setProperty('--speaker-guide-marker-rgb', `${r}, ${g}, ${b}`);
        submit.style.setProperty('--speaker-guide-marker-opacity', '0.48');
      }
      const SGM = globalThis.SpeakerGuideMarker;
      if (SGM?.buildSpeakerGuideMarkerHtml) {
        const html = SGM.buildSpeakerGuideMarkerHtml(label, label);
        if (html.includes('<mark')) {
          submit.innerHTML = html;
          const runSync = () => SGM.syncMarkerStrokeWidths?.(submit);
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(runSync));
          } else {
            runSync();
          }
          return;
        }
      }
      submit.textContent = label;
    }

    setQuiltNameLeaderboardStatus(message, tone = '') {
      const el = document.getElementById('qnlbStatus');
      if (!el) return;
      el.textContent = String(message || '');
      el.dataset.tone = tone;
      el.hidden = !el.textContent;
    }

    formatQuiltNameLeaderboardCountdown(targetIso) {
      const targetMs = Date.parse(targetIso || '');
      if (!Number.isFinite(targetMs)) return '';
      const diffMs = Math.max(0, targetMs - Date.now());
      const totalMinutes = Math.ceil(diffMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }

    quiltNameLeaderboardTallyMarkup(votes, { hasVoteIcon = false } = {}) {
      if (votes > 0) {
        return `<span class="qnlb-entry__tally" aria-label="${votes} votes">${votes}</span>`;
      }
      if (hasVoteIcon) {
        // A separate clickable heart already renders alongside this tally — don't double up.
        return '<span class="qnlb-entry__tally qnlb-entry__tally--empty" aria-hidden="true"></span>';
      }
      return '<span class="qnlb-entry__tally qnlb-entry__tally--zero" aria-label="No votes yet">&#9825;</span>';
    }

    quiltNameLeaderboardAdminDeleteMarkup(word) {
      if (!this.isCurrentUserAdmin?.()) return '';
      const safeWord = this.escapeQuiltNameLeaderboardHtml(word);
      const attrWord = String(word || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
      return `<button type="button" class="qnlb-entry__delete" data-qnlb-delete-word="${attrWord}" aria-label="Delete ${safeWord}">×</button>`;
    }

    escapeQuiltNameLeaderboardHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }

    /** Base color the rank-badge tones are derived from (orange sticky-note mockup). */
    qnlbPositionBadgeBaseColor() {
      return '#e9a23d';
    }

    /** Winning-entry highlight: today's bright quilt marker color (same source as speaker highlights), desaturated for a softer wash. */
    qnlbWinningHighlightColor() {
      const bright = String(this.getBrightQuiltMarkerColor?.() || '#ffe566').trim();
      const match = /^#?([0-9a-f]{6})$/i.exec(bright);
      const safe = match ? `#${match[1]}` : '#ffe566';
      if (typeof Utils === 'undefined' || !Utils.hexToHsv || !Utils.hsvToHex) return safe;
      const hsv = Utils.hexToHsv(safe);
      return Utils.hsvToHex(hsv.h, hsv.s * 0.35, Math.min(98, hsv.v + 20));
    }

    /** Perceived luminance (ITU-R BT.601) for a #rrggbb hex string, or null if unparseable. */
    qnlbHexLuminance(hex) {
      const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
      if (!match) return null;
      const value = match[1];
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    /** Same-hue tonal variants of a base color, cycled across rank badges for variety. */
    qnlbGenerateBadgeTones(baseHex) {
      const match = /^#?([0-9a-f]{6})$/i.exec(String(baseHex || '').trim());
      const safe = match ? `#${match[1]}` : '#e9a23d';
      if (typeof Utils === 'undefined' || !Utils.hexToHsv || !Utils.hsvToHex) return [safe];
      const hsv = Utils.hexToHsv(safe);
      const lightSat = Math.max(10, hsv.s * 0.28);
      const lightValue = Math.min(97, hsv.v + 22);
      const valueDeltas = [0, -5, 4, -9, 2, -13];
      return valueDeltas.map((delta) => Utils.hsvToHex(hsv.h, lightSat, Math.max(28, Math.min(97, lightValue + delta))));
    }

    renderQuiltNameLeaderboard(data = {}, options = {}) {
      const wrap = this.quiltNameLeaderboardWrap();
      const badgeTones = this.qnlbGenerateBadgeTones(this.qnlbPositionBadgeBaseColor());
      const phaseBanner = document.getElementById('qnlbPhaseBanner');
      const countdown = document.getElementById('qnlbCountdown');
      const titleCountdown = document.getElementById('qnlbTitleCountdown');
      const form = document.getElementById('qnlbSubmitForm');
      const formControls = document.getElementById('qnlbFormControls');
      const submitThanks = document.getElementById('qnlbSubmitThanks');
      const submitBtn = document.getElementById('qnlbSubmitBtn');
      const nameInput = document.getElementById('qnlbNameInput');
      const list = document.getElementById('qnlbEntryList');
      const listKicker = document.getElementById('qnlbListKicker');
      const expandWrap = document.getElementById('qnlbExpandWrap');
      const expandBtn = document.getElementById('qnlbExpandBtn');
      const infoBtn = document.getElementById('qnlbInfoBtn');
      const cloudStage = wrap?.querySelector('.qnlb-name-cloud-stage');
      if (!phaseBanner || !countdown || !form || !list) return;

      const phase = String(data.phase || 'submissions');
      const votingCap = Math.max(
        1,
        Number(data.votingCap) > 0 ? Number(data.votingCap) : QNLB_VOTING_ENTRY_CAP
      );
      let entries = this.sortQuiltNameLeaderboardEntries(
        Array.isArray(data.entries) ? data.entries : [],
        phase
      );
      if (phase === 'voting' || phase === 'final') {
        entries = entries.slice(0, votingCap);
      }
      const myVote = String(data.myVote || '').trim();
      const expanded = wrap?.dataset.qnlbExpanded === '1';
      const collapse = phase === 'submissions' && entries.length > votingCap && !expanded;
      const visibleEntries = collapse ? entries.slice(0, votingCap) : entries;
      const showVotes = (phase !== 'submissions' && !!myVote) || !!data.demo;
      const winningVoteCount = entries.reduce((best, entry) => {
        const votes = Number(entry.votes) || 0;
        return votes > best ? votes : best;
      }, 0);
      const viewState = {
        phase,
        myVote,
        winningVoteCount,
        winningColor: this.qnlbWinningHighlightColor(),
        showVotes,
        canVote: phase === 'voting',
        demo: !!data.demo,
        badgeTones
      };

      const canSubmit = this.canQuiltNameLeaderboardSubmit(data);
      const isShell = data.shell === true;
      const showSubmitThanks = phase === 'submissions' && !canSubmit && !data.demo && !isShell;

      form.hidden = phase !== 'submissions';
      if (formControls) {
        formControls.hidden = !canSubmit && !isShell;
      }
      if (submitBtn) {
        submitBtn.disabled = isShell || !canSubmit;
      }
      if (nameInput) {
        nameInput.disabled = isShell;
      }
      if (submitThanks) {
        submitThanks.textContent = 'Thank you !';
        submitThanks.hidden = !showSubmitThanks;
      }
      if (listKicker) {
        listKicker.hidden = phase !== 'submissions';
      }
      if (nameInput) {
        nameInput.placeholder = '???';
        nameInput.setAttribute('aria-label', 'Quilt name — one word');
      }

      const useCloudLayout = this.usesQuiltNameLeaderboardCloudLayout(phase);
      list.classList.toggle('qnlb-name-cloud', useCloudLayout);
      list.classList.toggle('qnlb-entry-list--final', !useCloudLayout);
      if (cloudStage) {
        cloudStage.classList.toggle('qnlb-name-cloud-stage--final', !useCloudLayout);
      }
      const isAdmin = !!this.isCurrentUserAdmin?.();
      if (wrap) {
        wrap.classList.toggle('qnlb-wrap--submissions', phase === 'submissions');
        wrap.classList.toggle('qnlb-wrap--voting', phase === 'voting');
        wrap.classList.toggle('qnlb-wrap--admin', isAdmin);
      }
      if (infoBtn) {
        /* Lives on the submit "name this quilt" card (submissions only). */
        infoBtn.hidden = phase !== 'submissions';
      }
      this.applyQuiltNameLeaderboardInfoModal(phase);

      if (phase === 'submissions') {
        phaseBanner.textContent = 'Suggest a name for today\'s quilt.';
        phaseBanner.hidden = true;
        const countdownText = data.submissionsCloseAt
          ? `Voting opens in ${this.formatQuiltNameLeaderboardCountdown(data.submissionsCloseAt)}`
          : '';
        countdown.textContent = countdownText;
        countdown.hidden = !countdownText;
        if (titleCountdown) {
          titleCountdown.textContent = '';
          titleCountdown.hidden = true;
        }
        if (listKicker) listKicker.textContent = '↓ Names submitted so far ↓';
      } else if (phase === 'voting') {
        phaseBanner.textContent = 'All our entries are in! Tap to vote';
        phaseBanner.hidden = false;
        countdown.textContent = '';
        countdown.hidden = true;
        if (titleCountdown) {
          titleCountdown.textContent = '';
          titleCountdown.hidden = true;
        }
      } else {
        phaseBanner.textContent = 'Today\'s naming is closed.';
        phaseBanner.hidden = false;
        countdown.textContent = '';
        countdown.hidden = true;
        if (titleCountdown) {
          titleCountdown.textContent = '';
          titleCountdown.hidden = true;
        }
        if (listKicker) listKicker.textContent = 'Final names';
      }

      if (data.demo && listKicker && phase === 'submissions') {
        listKicker.textContent = 'Sample names (preview)';
      }

      if (collapse && expandWrap && expandBtn) {
        expandWrap.hidden = false;
        expandBtn.textContent = `See all ${entries.length} names`;
      } else if (expandWrap) {
        expandWrap.hidden = true;
      }

      if (!entries.length) {
        if (cloudStage) cloudStage.hidden = true;
        if (listKicker && phase !== 'submissions') listKicker.hidden = true;
        list.innerHTML = '';
        list.hidden = true;
        if (expandWrap) expandWrap.hidden = true;
        this.applyQuiltNameLeaderboardDebugLayout();
        return;
      }

      if (cloudStage) cloudStage.hidden = false;
      list.hidden = false;

      this.updateQuiltNameLeaderboardList(list, visibleEntries, viewState, options);
      this.applyQuiltNameLeaderboardDebugLayout();
    }

    async refreshQuiltNameLeaderboard(options = {}) {
      const previewPhase = this._qnlbPreviewPhase || this.quiltNameLeaderboardPreviewPhaseFromQuery();
      if (previewPhase && !options.renderOnly) {
        this.loadQuiltNameLeaderboardPreview(previewPhase);
        return;
      }
      const dateKey = this.quiltNameLeaderboardDateKey();
      const clientId = this.quiltNameLeaderboardClientId();
      if (options.renderOnly && this._qnlbLastPayload) {
        this.renderQuiltNameLeaderboard(this._qnlbLastPayload);
        return;
      }
      const baseUrl = this.quiltNameLeaderboardApiBaseUrl();
      if (!baseUrl) {
        this.setQuiltNameLeaderboardStatus('API base URL is not configured.', 'error');
        return;
      }

      if (!options.renderOnly && !this._qnlbLastPayload) {
        this.setQuiltNameLeaderboardStatus('Loading…');
      }

      try {
        const params = new URLSearchParams({ dateKey, clientId });
        const res = await fetch(`${baseUrl}/api/quilt-name-leaderboard?${params.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload.success) {
          throw new Error(payload.error || `HTTP ${res.status}`);
        }

        const storedVote = localStorage.getItem(this.quiltNameLeaderboardVoteStorageKey(dateKey));
        if (!payload.myVote && storedVote) {
          payload.myVote = storedVote;
        } else if (payload.myVote) {
          localStorage.setItem(this.quiltNameLeaderboardVoteStorageKey(dateKey), payload.myVote);
        }

        this._qnlbLastPayload = payload;
        this._writeLocalQuiltNameLeaderboardCache(dateKey, payload);
        this.renderQuiltNameLeaderboard(payload, options);
        this.setQuiltNameLeaderboardStatus('');
      } catch (error) {
        if (!this._qnlbLastPayload) {
          this.setQuiltNameLeaderboardStatus(error.message || 'Could not load leaderboard', 'error');
        } else {
          this.setQuiltNameLeaderboardStatus('');
        }
      }
    }

    async submitQuiltNameLeaderboardEntry() {
      const input = document.getElementById('qnlbNameInput');
      const submitBtn = document.getElementById('qnlbSubmitBtn');
      const word = String(input?.value || '').trim();
      if (!word) {
        this.setQuiltNameLeaderboardStatus('Please choose just one word.', 'error');
        return;
      }
      if (!this.isQuiltNameLeaderboardSingleWord(word)) {
        this.setQuiltNameLeaderboardStatus('Please choose just one word.', 'error');
        return;
      }

      if (this._qnlbPreviewPhase === 'submissions' || this._qnlbPreviewPhase === 'empty' || this._qnlbLastPayload?.preview) {
        const entries = Array.isArray(this._qnlbLastPayload?.entries)
          ? this._qnlbLastPayload.entries.map((entry) => ({ ...entry }))
          : [];
        const exists = entries.some(
          (entry) => String(entry.word || '').toLowerCase() === word.toLowerCase()
        );
        if (!exists) {
          entries.push({
            id: `preview-${entries.length}`,
            word,
            votes: 0,
            source: 'community',
            isMine: true
          });
        }
        this._qnlbLastPayload = {
          ...(this._qnlbLastPayload || this.getQuiltNameLeaderboardSubmissionsPreviewPayload()),
          entries,
          canSubmit: true,
          preview: true,
          phase: 'submissions'
        };
        if (input) input.value = '';
        this.renderQuiltNameLeaderboard(this._qnlbLastPayload);
        return;
      }

      const baseUrl = this.quiltNameLeaderboardApiBaseUrl();
      if (submitBtn) submitBtn.disabled = true;
      this.setQuiltNameLeaderboardStatus('Submitting…');

      try {
        const headers = {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        };
        if (this.isCurrentUserAdmin?.()) {
          const token = await this.getAdminServerMutationToken?.();
          if (!token) {
            throw new Error('Admin token required to submit more names.');
          }
          headers['x-reset-token'] = token;
        }
        const res = await fetch(`${baseUrl}/api/quilt-name-submit`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            dateKey: this.quiltNameLeaderboardDateKey(),
            clientId: this.quiltNameLeaderboardClientId(),
            word
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (res.status === 401) {
          try {
            localStorage.removeItem('ourDailyResetToken');
          } catch (_) {
            /* ignore */
          }
          throw new Error('Unauthorized — check your RESET_TOKEN');
        }
        if (!res.ok || !payload.success) {
          throw new Error(payload.error || `HTTP ${res.status}`);
        }
        if (input) input.value = '';
        this.setQuiltNameLeaderboardStatus('Name submitted.', 'success');
        await this.refreshQuiltNameLeaderboard();
      } catch (error) {
        this.setQuiltNameLeaderboardStatus(error.message || 'Submit failed', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    async castQuiltNameLeaderboardVote(word) {
      const baseUrl = this.quiltNameLeaderboardApiBaseUrl();
      const dateKey = this.quiltNameLeaderboardDateKey();
      this.setQuiltNameLeaderboardStatus('Saving vote…');

      try {
        const res = await fetch(`${baseUrl}/api/quilt-name-leaderboard-vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            dateKey,
            clientId: this.quiltNameLeaderboardClientId(),
            word
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload.success) {
          throw new Error(payload.error || `HTTP ${res.status}`);
        }
        localStorage.setItem(this.quiltNameLeaderboardVoteStorageKey(dateKey), word);
        const doc = payload.doc || {};
        const entries = this.sortQuiltNameLeaderboardEntries(
          (doc.entries || []).map((entry) => ({
            id: entry.id,
            word: entry.word,
            votes: Number(entry.votes) || 0,
            source: entry.source === 'ai' ? 'ai' : 'community',
            isMine: String(entry.submittedByClientId || '') === this.quiltNameLeaderboardClientId()
          })),
          doc.phase || 'voting'
        );
        this._qnlbLastPayload = {
          ...(this._qnlbLastPayload || {}),
          phase: doc.phase || 'voting',
          entries,
          myVote: payload.myVote || word,
          canSubmit: false,
          canVote: (doc.phase || 'voting') === 'voting',
          submissionsCloseAt: doc.submissionsCloseAt || this._qnlbLastPayload?.submissionsCloseAt,
          votingEndsAt: doc.votingEndsAt || this._qnlbLastPayload?.votingEndsAt
        };
        this.renderQuiltNameLeaderboard(this._qnlbLastPayload, { animateReorder: true });
        this.setQuiltNameLeaderboardStatus('Vote saved. Tap another name to change your mind.', 'success');
      } catch (error) {
        this.setQuiltNameLeaderboardStatus(error.message || 'Vote failed', 'error');
      }
    }
  }

  root.SimplifiedQuiltAppV2QuiltNameLeaderboard = SimplifiedQuiltAppV2QuiltNameLeaderboard;
})(typeof window !== 'undefined' ? window : globalThis);
