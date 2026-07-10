/**
 * SimplifiedQuiltAppV2 feature feedback slice.
 * Hidden launch only: ?featureFeedback=1 or window.openFeatureFeedback().
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2FeatureFeedback {
    getFeatureFeedbackDefinitions() {
      return [
        { id: 'color-card', label: 'Color Card' },
        { id: 'name-ballot', label: 'Name the Quilt Ballot' },
        { id: 'quote-duos', label: 'Scratch-Off Card' },
        { id: 'speaker-section', label: 'Speaker Section' },
        { id: 'reflection-section', label: 'Reflection Section' },
        { id: 'ig-story-share', label: 'IG Story Share' },
        { id: 'before-you-go-watch-for', label: 'Watch For' },
        { id: 'before-you-go-companion', label: 'Companion Piece' },
        { id: 'reminders-screen', label: 'Reminders Screen' },
        { id: 'studio-floor', label: 'Studio Floor' }
      ];
    }

    featureFeedbackStorageKey() {
      return 'ourDailyFeatureFeedbackState_v1';
    }

    readFeatureFeedbackState() {
      try {
        const raw = localStorage.getItem(this.featureFeedbackStorageKey());
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== 'object') return { selectedFeatureIds: [], note: '', submittedAtIso: '' };
        return {
          selectedFeatureIds: Array.isArray(parsed.selectedFeatureIds)
            ? parsed.selectedFeatureIds.map(String).filter(Boolean)
            : [],
          note: String(parsed.note || ''),
          submittedAtIso: String(parsed.submittedAtIso || '')
        };
      } catch (_) {
        return { selectedFeatureIds: [], note: '', submittedAtIso: '' };
      }
    }

    writeFeatureFeedbackState(patch = {}) {
      const current = this.readFeatureFeedbackState();
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(this.featureFeedbackStorageKey(), JSON.stringify(next));
      } catch (_) {
        /* ignore storage failures */
      }
      return next;
    }

    setupFeatureFeedbackFeed() {
      const screen = document.getElementById('screen-feature-feedback');
      const feed = document.getElementById('featureFeedbackFeed');
      const form = document.getElementById('featureFeedbackForm');
      if (!screen || !feed || !form || screen.dataset.featureFeedbackBound === '1') return;
      screen.dataset.featureFeedbackBound = '1';

      feed.addEventListener('click', (event) => {
        const btn = event.target?.closest?.('[data-feature-heart]');
        if (!btn) return;
        event.preventDefault();
        const card = btn.closest('[data-feature-id]');
        const featureId = String(card?.getAttribute('data-feature-id') || '').trim();
        if (!featureId) return;
        const nextPressed = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', nextPressed ? 'true' : 'false');
        btn.textContent = nextPressed ? '♥' : '♡';
        this.persistFeatureFeedbackDraft();
      });

      const note = document.getElementById('featureFeedbackNote');
      note?.addEventListener('input', () => this.persistFeatureFeedbackDraft());

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await this.submitFeatureFeedback();
      });

      const summaryRefresh = document.getElementById('featureFeedbackSummaryRefresh');
      summaryRefresh?.addEventListener('click', async () => {
        await this.loadFeatureFeedbackSummary();
      });

      root.openFeatureFeedback = () => this.openFeatureFeedbackFeed();
      root.openFeatureFeedbackSummary = () => this.openFeatureFeedbackSummary();

      const params = new URLSearchParams(root.location?.search || '');
      const hash = String(root.location?.hash || '').toLowerCase();
      if (params.get('featureFeedback') === '1' || params.get('feedback') === 'features' || hash === '#feature-feedback') {
        this._featureFeedbackLaunchRequested = true;
        document.addEventListener('screenChange', () => this._scheduleHiddenFeatureFeedbackOpen(350));
        this._scheduleHiddenFeatureFeedbackOpen(6000);
      }
      if (
        params.get('featureFeedbackSummary') === '1' ||
        params.get('feedbackSummary') === 'features' ||
        hash === '#feature-feedback-summary'
      ) {
        this._featureFeedbackSummaryLaunchRequested = true;
        document.addEventListener('screenChange', () => this._scheduleHiddenFeatureFeedbackSummaryOpen(350));
        this._scheduleHiddenFeatureFeedbackSummaryOpen(6000);
      }
    }

    _scheduleHiddenFeatureFeedbackOpen(delayMs = 2200) {
      if (this._featureFeedbackOpenTimer) {
        window.clearTimeout(this._featureFeedbackOpenTimer);
      }
      this._featureFeedbackOpenTimer = window.setTimeout(() => {
        this._featureFeedbackOpenTimer = null;
        if (!this._featureFeedbackLaunchRequested || this._featureFeedbackOpenedFromLaunch) return;
        this._featureFeedbackOpenedFromLaunch = true;
        this.openFeatureFeedbackFeed();
      }, Math.max(0, Number(delayMs) || 0));
    }

    _scheduleHiddenFeatureFeedbackSummaryOpen(delayMs = 2200) {
      if (this._featureFeedbackSummaryOpenTimer) {
        window.clearTimeout(this._featureFeedbackSummaryOpenTimer);
      }
      this._featureFeedbackSummaryOpenTimer = window.setTimeout(() => {
        this._featureFeedbackSummaryOpenTimer = null;
        if (!this._featureFeedbackSummaryLaunchRequested || this._featureFeedbackSummaryOpenedFromLaunch) return;
        this._featureFeedbackSummaryOpenedFromLaunch = true;
        void this.openFeatureFeedbackSummary();
      }, Math.max(0, Number(delayMs) || 0));
    }

    openFeatureFeedbackFeed() {
      document.querySelectorAll('.admin-menu').forEach((el) => el.remove());
      const screen = this.revealFeatureFeedbackScreen('screen-feature-feedback');
      this.prepareFeatureFeedbackScreen();
      this.uiService?.showScreen?.('screen-feature-feedback');
      if (screen) screen.scrollTop = 0;
      if (typeof root.odqTrack === 'function') {
        root.odqTrack('feature_feedback_open', { source: 'hidden' });
      }
    }

    prepareFeatureFeedbackScreen() {
      const state = this.readFeatureFeedbackState();
      const selected = new Set(state.selectedFeatureIds || []);
      document.querySelectorAll('#featureFeedbackFeed [data-feature-id]').forEach((card) => {
        const featureId = String(card.getAttribute('data-feature-id') || '').trim();
        const pressed = selected.has(featureId);
        const btn = card.querySelector('[data-feature-heart]');
        if (btn) {
          btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
          btn.textContent = pressed ? '♥' : '♡';
        }
      });
      const note = document.getElementById('featureFeedbackNote');
      if (note) note.value = state.note || '';
      const submit = document.getElementById('featureFeedbackSubmit');
      if (submit) submit.textContent = state.submittedAtIso ? 'Update' : 'Submit';
      this.setFeatureFeedbackStatus(
        state.submittedAtIso ? 'Thanks. You can update your hearts and submit again.' : ''
      );
    }

    async ensureFeatureFeedbackSummaryAdmin() {
      if (!root.CONFIG?.APP?.enableAdminTools) {
        this.uiService?.showToast?.('Admin tools disabled on this host');
        return false;
      }
      await this.loadDeferredAdminSlice?.();
      let isAdmin = false;
      try {
        isAdmin = localStorage.getItem('ourDailyIsAdmin') === 'true';
      } catch (_) {
        /* ignore */
      }
      if (!isAdmin && typeof this.isCurrentUserAdmin === 'function') {
        isAdmin = this.isCurrentUserAdmin();
      }
      if (isAdmin) return true;
      if (typeof this.requestAdminAccess === 'function') {
        const ok = await this.requestAdminAccess();
        document.querySelectorAll('.admin-menu').forEach((el) => el.remove());
        return !!(ok && this.isCurrentUserAdmin?.());
      }
      return false;
    }

    revealFeatureFeedbackScreen(screenId) {
      const screen = document.getElementById(screenId);
      if (!screen) return null;
      screen.hidden = false;
      screen.removeAttribute('hidden');
      screen.setAttribute('aria-hidden', 'false');
      return screen;
    }

    async openFeatureFeedbackSummary() {
      document.querySelectorAll('.admin-menu').forEach((el) => el.remove());
      const ok = await this.ensureFeatureFeedbackSummaryAdmin();
      if (!ok) {
        this.uiService?.showToast?.('Admin access required');
        return false;
      }
      const screen = this.revealFeatureFeedbackScreen('screen-feature-feedback-summary');
      this.uiService?.showScreen?.('screen-feature-feedback-summary');
      if (screen) screen.scrollTop = 0;
      await this.loadFeatureFeedbackSummary();
      return true;
    }

    setFeatureFeedbackSummaryStatus(message, kind = '') {
      const status = document.getElementById('featureFeedbackSummaryStatus');
      if (!status) return;
      status.textContent = message || '';
      status.classList.toggle('is-error', kind === 'error');
    }

    escapeFeatureFeedbackHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }

    formatFeatureFeedbackSummaryTime(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      try {
        return new Date(raw).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      } catch (_) {
        return raw;
      }
    }

    async waitForFeatureFeedbackFirestoreReady(timeoutMs = 8000) {
      if (root.db && root.firestore?.collection && root.firestore?.getDocs) return true;
      return new Promise((resolve) => {
        let settled = false;
        const finish = (ready) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          document.removeEventListener('firebaseReady', onReady);
          resolve(ready);
        };
        const onReady = () =>
          finish(!!(root.db && root.firestore?.collection && root.firestore?.getDocs));
        const timer = window.setTimeout(
          () => finish(!!(root.db && root.firestore?.collection && root.firestore?.getDocs)),
          Math.max(0, Number(timeoutMs) || 0)
        );
        document.addEventListener('firebaseReady', onReady, { once: true });
      });
    }

    async fetchFeatureFeedbackSummaryEntries() {
      const canReadViaApi = !!(this.featureFeedbackApiBaseUrl() && typeof fetch === 'function');
      const readFromFirestore = async () => {
        const snap = await root.firestore.getDocs(
          root.firestore.collection(root.db, 'featureFeedbackResponses')
        );
        const docs = [];
        snap.forEach((docSnap) => {
          docs.push(docSnap.data() || {});
        });
        return docs;
      };

      if (this.shouldUseFeatureFeedbackApiFirst()) {
        if (!canReadViaApi) throw new Error('Feature feedback summary API unavailable');
        const res = await fetch(`${this.featureFeedbackApiBaseUrl()}/api/feature-feedback-summary`, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || data?.success === false) {
          throw new Error(data?.error || `Feature feedback summary API failed (${res.status})`);
        }
        return Array.isArray(data?.responses) ? data.responses : [];
      }

      await this.waitForFeatureFeedbackFirestoreReady();
      if (root.db && root.firestore?.collection && root.firestore?.getDocs) {
        try {
          return await readFromFirestore();
        } catch (firestoreError) {
          this.logger?.warn?.('Feature feedback Firestore read failed; trying API fallback:', firestoreError);
        }
      }
      if (!canReadViaApi) throw new Error('Feature feedback summary unavailable');
      const res = await fetch(`${this.featureFeedbackApiBaseUrl()}/api/feature-feedback-summary`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Feature feedback summary API failed (${res.status})`);
      }
      return Array.isArray(data?.responses) ? data.responses : [];
    }

    renderFeatureFeedbackSummary(docs = []) {
      const metaEl = document.getElementById('featureFeedbackSummaryMeta');
      const listEl = document.getElementById('featureFeedbackSummaryList');
      const notesEl = document.getElementById('featureFeedbackSummaryNotes');
      if (!metaEl || !listEl || !notesEl) return false;

      const definitions = this.getFeatureFeedbackDefinitions();
        const counts = new Map(definitions.map((item) => [item.id, 0]));
        let latestIso = '';
        const notes = [];

        docs.forEach((entry) => {
          const ids = Array.isArray(entry.selectedFeatureIds) ? entry.selectedFeatureIds.map(String) : [];
          new Set(ids).forEach((id) => {
            counts.set(id, (counts.get(id) || 0) + 1);
          });
          const updated = String(entry.updatedAtIso || entry.submittedAtIso || '').trim();
          if (updated && (!latestIso || updated > latestIso)) latestIso = updated;
          const note = String(entry.note || '').trim();
          if (note) notes.push({ note, updated });
        });

        const total = docs.length;
        const ranked = definitions
          .map((item) => ({
            ...item,
            count: counts.get(item.id) || 0,
            pct: total > 0 ? Math.round(((counts.get(item.id) || 0) / total) * 100) : 0
          }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

        metaEl.textContent = total
          ? `${total} submission${total === 1 ? '' : 's'}${latestIso ? ` · updated ${this.formatFeatureFeedbackSummaryTime(latestIso)}` : ''}`
          : 'No submissions yet.';

        listEl.innerHTML = ranked.map((item) => `
          <div class="feature-feedback-summary-row" role="listitem">
            <p class="feature-feedback-summary-row__label">${this.escapeFeatureFeedbackHtml(item.label)}</p>
            <span class="feature-feedback-summary-row__count">${item.count} · ${item.pct}%</span>
            <span class="feature-feedback-summary-row__bar" aria-hidden="true">
              <span class="feature-feedback-summary-row__bar-fill" style="--feature-feedback-summary-pct:${item.pct}%"></span>
            </span>
          </div>
        `).join('');

        notes
          .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
        notesEl.innerHTML = notes.length
          ? notes.map((entry) => `
            <p class="feature-feedback-summary-note">${this.escapeFeatureFeedbackHtml(entry.note)}</p>
          `).join('')
          : '<p class="feature-feedback-summary-empty">No notes yet.</p>';

      this.setFeatureFeedbackSummaryStatus('');
      return true;
    }

    async loadFeatureFeedbackSummary() {
      const metaEl = document.getElementById('featureFeedbackSummaryMeta');
      const listEl = document.getElementById('featureFeedbackSummaryList');
      const notesEl = document.getElementById('featureFeedbackSummaryNotes');
      if (!metaEl || !listEl || !notesEl) return false;

      this.setFeatureFeedbackSummaryStatus('Loading…');
      try {
        const docs = await this.fetchFeatureFeedbackSummaryEntries();
        return this.renderFeatureFeedbackSummary(docs);
      } catch (error) {
        this.logger?.warn?.('Feature feedback summary failed:', error);
        this.setFeatureFeedbackSummaryStatus('Could not load feedback results.', 'error');
        return false;
      }
    }

    getSelectedFeatureFeedbackIds() {
      return Array.from(document.querySelectorAll('#featureFeedbackFeed [data-feature-heart][aria-pressed="true"]'))
        .map((btn) => String(btn.closest('[data-feature-id]')?.getAttribute('data-feature-id') || '').trim())
        .filter(Boolean);
    }

    persistFeatureFeedbackDraft() {
      const note = String(document.getElementById('featureFeedbackNote')?.value || '');
      this.writeFeatureFeedbackState({
        selectedFeatureIds: this.getSelectedFeatureFeedbackIds(),
        note
      });
    }

    setFeatureFeedbackStatus(message, kind = '') {
      const status = document.getElementById('featureFeedbackStatus');
      if (!status) return;
      status.textContent = message || '';
      status.classList.toggle('is-error', kind === 'error');
    }

    featureFeedbackDocId(clientId, dateKey) {
      const base = `${clientId || 'unknown'}_${dateKey || 'unknown'}`;
      return base.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
    }

    featureFeedbackApiBaseUrl() {
      const configured = String(root.CONFIG?.BACKEND?.baseUrl || root.CONFIG?.APP?.baseUrl || '')
        .trim()
        .replace(/\/+$/, '');
      const origin = String(root.location?.origin || '').trim();
      if (/^https?:/i.test(origin)) return origin;
      return configured;
    }

    shouldUseFeatureFeedbackApiFirst() {
      const protocol = String(root.location?.protocol || '').toLowerCase();
      return protocol === 'capacitor:' || protocol === 'file:';
    }

    async saveFeatureFeedbackViaApi(payload) {
      const baseUrl = this.featureFeedbackApiBaseUrl();
      if (!baseUrl || typeof fetch !== 'function') {
        throw new Error('Feature feedback API unavailable');
      }
      const res = await fetch(`${baseUrl}/api/feature-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `Feature feedback API failed (${res.status})`);
      }
      return data;
    }

    async submitFeatureFeedback() {
      const submit = document.getElementById('featureFeedbackSubmit');
      const note = String(document.getElementById('featureFeedbackNote')?.value || '').trim().slice(0, 600);
      const selectedFeatureIds = this.getSelectedFeatureFeedbackIds();
      const definitions = this.getFeatureFeedbackDefinitions();
      const selectedFeatureLabels = selectedFeatureIds
        .map((id) => definitions.find((item) => item.id === id)?.label || id)
        .filter(Boolean);
      if (!selectedFeatureIds.length && !note) {
        this.setFeatureFeedbackStatus('Heart at least one card or leave a note first.', 'error');
        return false;
      }
      const canSaveDirectly = !!(root.db && root.firestore?.setDoc && root.firestore?.doc);
      const canSaveViaApi = !!(this.featureFeedbackApiBaseUrl() && typeof fetch === 'function');
      if (!canSaveDirectly && !canSaveViaApi) {
        this.setFeatureFeedbackStatus('Could not save yet. Check your connection and try again.', 'error');
        return false;
      }

      const nowIso = new Date().toISOString();
      const clientId =
        String(this.quiltEngine?.deviceId || this.currentUserId || '').trim() ||
        (typeof root.Utils?.getOrCreateUserId === 'function' ? root.Utils.getOrCreateUserId() : '');
      const dateKey =
        (typeof this.getEffectiveAppDateKey === 'function' && this.getEffectiveAppDateKey()) ||
        (typeof root.Utils?.getTodayKey === 'function' ? root.Utils.getTodayKey() : '') ||
        nowIso.slice(0, 10);
      const firebaseUid = String(root.firebaseAuth?.currentUser?.uid || root.odqFirebaseAuthUser?.uid || '').trim();
      const docId = this.featureFeedbackDocId(clientId || firebaseUid || 'anonymous', dateKey);

      const payload = {
        source: 'hidden_visual_feed',
        appDateKey: dateKey,
        selectedFeatureIds,
        selectedFeatureLabels,
        note,
        clientId,
        firebaseUid,
        appVersion: root.CONFIG?.APP?.version || '',
        buildId: root.CONFIG?.APP?.buildId || '',
        userAgent: navigator.userAgent || '',
        submitted: true,
        hasSubmittedFeatureFeedback: true,
        submittedAtIso: nowIso,
        updatedAtIso: nowIso,
        featureCount: definitions.length
      };

      submit?.setAttribute('disabled', 'disabled');
      this.setFeatureFeedbackStatus('Saving…');
      let saveTimeoutId = 0;
      try {
        try {
          if (this.shouldUseFeatureFeedbackApiFirst()) throw new Error('Native app uses API save first');
          if (!canSaveDirectly) throw new Error('Firestore not ready');
          const savePromise = root.firestore.setDoc(
            root.firestore.doc(root.db, 'featureFeedbackResponses', docId),
            payload,
            { merge: true }
          );
          await Promise.race(
            [
              savePromise,
              new Promise((_, reject) => {
                saveTimeoutId = window.setTimeout(() => {
                  reject(new Error('Feature feedback save timed out'));
                }, 6000);
              })
            ]
          );
        } catch (firestoreError) {
          if (saveTimeoutId) {
            window.clearTimeout(saveTimeoutId);
            saveTimeoutId = 0;
          }
          this.logger?.warn?.('Feature feedback Firestore save failed; trying API fallback:', firestoreError);
          await this.saveFeatureFeedbackViaApi(payload);
        }
        this.writeFeatureFeedbackState({ selectedFeatureIds, note, submittedAtIso: nowIso });
        this.setFeatureFeedbackStatus('Thank you for taking the time to help me with ODQ ! <3');
        if (submit) submit.textContent = 'Update';
        window.clearTimeout(this._featureFeedbackReturnTimer);
        this._featureFeedbackReturnTimer = window.setTimeout(() => {
          this._featureFeedbackReturnTimer = null;
          this.uiService?.showScreen?.('screen-quilt');
        }, 1500);
        if (typeof root.odqTrack === 'function') {
          root.odqTrack('feature_feedback_submit', {
            selected_count: selectedFeatureIds.length,
            has_note: note ? 1 : 0
          });
        }
        return true;
      } catch (error) {
        this.logger?.warn?.('Feature feedback save failed:', error);
        const code = String(error?.code || error?.message || '').toLowerCase();
        const message = code.includes('permission')
          ? 'Could not save yet. Firestore rules need the latest update.'
          : 'Could not save yet. Check your connection and try again.';
        this.setFeatureFeedbackStatus(message, 'error');
        return false;
      } finally {
        if (saveTimeoutId) window.clearTimeout(saveTimeoutId);
        submit?.removeAttribute('disabled');
      }
    }
  }

  root.SimplifiedQuiltAppV2FeatureFeedback = SimplifiedQuiltAppV2FeatureFeedback;
})(globalThis);
