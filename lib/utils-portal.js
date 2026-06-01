/**
 * Portal greeting, first-name flow, friend-term skip, reflection patch star.
 * Extends UtilsCore static methods. Requires lib/utils-core.js first.
 */
(function (root) {
  'use strict';

  const UtilsCore = root.UtilsCore;
  if (!UtilsCore) {
    throw new Error('lib/utils-core.js must load before lib/utils-portal.js');
  }

  Object.assign(UtilsCore, {
    USER_FIRST_NAME_KEY: 'ourDailyUserFirstName',
    FIRST_NAME_SKIPPED_KEY: 'ourDailyFirstNameSkipped',
    FRIEND_TERM_QUEUE_KEY: 'ourDailyFriendTermQueue',
    FRIEND_TERM_PENDING_KEY: 'ourDailyFriendTermPending',
    PORTAL_GREETING_INDEX_KEY: 'ourDailyPortalGreetingPhraseIndex',
    PORTAL_GREETING_BANK: [
      '[timeOfDay], [name]',
      'Welcome back, [name]',
      'Good to see you again, [name]',
      'There you are, [name] !',
      'Well hey there, [name]',
      "Look who's here!, [name]",
      'Come on in, [name]',
      "Oh good, it's [name]",
      'You came back, [name] !',
      'Happy [weekday], [name]'
    ],
    REFLECTION_THANK_YOU_MESSAGE: 'Thank you for sharing, [name]',
    /** Lit after a reflection submit for the current app day; cleared on quilt reset. */
    REFLECTION_PATCH_STAR_DAY_KEY: 'ourDailyReflectionPatchStarDay',
    /** Reader mood pick (good / rough) for today — restored after refresh. */
    QUILT_MOOD_PICK_KEY: 'ourDailyQuiltMoodPick',
    _portalGreetingTemplate: '',
    FRIEND_TERM_BANK: [
      { name: 'Tomodachi', language: 'Japanese' },
      { name: 'Pengyou', language: 'Mandarin' },
      { name: 'Chingu', language: 'Korean' },
      { name: 'Mitra', language: 'Hindi' },
      { name: 'Dost', language: 'Urdu' },
      { name: 'Phuean', language: 'Thai' },
      { name: 'Ban', language: 'Vietnamese' },
      { name: 'Sahabat', language: 'Malay' },
      { name: 'Kaibigan', language: 'Filipino' },
      { name: 'Bondhu', language: 'Bengali' },
      { name: 'Doost', language: 'Farsi' },
      { name: 'Sadiq', language: 'Arabic' },
      { name: 'Arkadas', language: 'Turkish' },
      { name: 'Yar', language: 'Kurdish' },
      { name: 'Dost', language: 'Uzbek' },
      { name: 'Ami', language: 'French' },
      { name: 'Freund', language: 'German' },
      { name: 'Vriend', language: 'Dutch' },
      { name: 'Van', language: 'Swedish' },
      { name: 'Ven', language: 'Danish' },
      { name: 'Ystavae', language: 'Finnish' },
      { name: 'Barat', language: 'Hungarian' },
      { name: 'Przyjaciel', language: 'Polish' },
      { name: 'Draugs', language: 'Latvian' },
      { name: 'Draugas', language: 'Lithuanian' },
      { name: 'Prieten', language: 'Romanian' },
      { name: 'Cara', language: 'Irish' },
      { name: 'Rafiki', language: 'Swahili' },
      { name: 'Umhlobo', language: 'Xhosa' },
      { name: 'Enyi', language: 'Igbo' },
      { name: 'Ore', language: 'Yoruba' },
      { name: 'Mitr', language: 'Sanskrit' },
      { name: 'Teman', language: 'Indonesian' },
      { name: 'Namuun', language: 'Mongolian' },
      { name: 'Amiko', language: 'Esperanto' },
      { name: 'Hoa', language: 'Maori' },
      { name: 'Prijatelj', language: 'Croatian' },
      { name: 'Priatel', language: 'Slovak' },
      { name: 'Filos', language: 'Greek' },
      { name: 'Caraid', language: 'Scottish Gaelic' },
      { name: 'Pang-yu', language: 'Cantonese' },
      { name: 'Xolo', language: 'Ewe' },
      { name: 'Phral', language: 'Romani' },
      { name: 'Odogu', language: 'Igbo' },
      { name: 'Sahib', language: 'Swahili' },
      { name: 'Tol', language: 'Khmer' }
    ],
    getUserFirstName() {
      try {
        return (root.localStorage.getItem(UtilsCore.USER_FIRST_NAME_KEY) || '').trim();
      } catch (_) {
        return '';
      }
    },
    /** Shown in portal: real first name, or "friend" if they skipped the name step. */
    getPortalGreetingName() {
      const name = UtilsCore.getUserFirstName();
      if (name) return name;
      try {
        if (root.localStorage.getItem(UtilsCore.FIRST_NAME_SKIPPED_KEY) === '1') {
          return 'friend';
        }
      } catch (_) {
        /* */
      }
      return '';
    },
    /** One line for the post-name welcome screen: "Welcome to ODQ Zak" / "Welcome to ODQ Friend". */
    formatNameThanksFullLine() {
      const g = UtilsCore.getPortalGreetingName();
      const frag = !g ? 'Friend' : g === 'friend' ? 'Friend' : g;
      return `Welcome to ODQ ${frag}`;
    },
    getNameThanksDisplayName() {
      const g = UtilsCore.getPortalGreetingName();
      return !g ? 'Friend' : g === 'friend' ? 'Friend' : g;
    },
    /**
     * Display-only: keep the daily blessing unpersonalized on the quilt UI.
     * Does not change stored quote data.
     */
    formatBlessingWithDisplayName(blessingBody) {
      const body = String(blessingBody || '').trim();
      if (!body) return '';
      const name = UtilsCore.getPortalGreetingName();
      const rest = /^may\b/i.test(body) ? body.replace(/^may\b/i, 'May') : body;
      if (!name) return rest;
      const label = name === 'friend' ? 'Friend' : name;
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return rest.replace(new RegExp(`,\\s*${escapedLabel}\\s*([.!?])?$`, 'i'), '$1').trim();
    },
    /**
     * Normalize first name for storage: first character upper, rest lower.
     * Exceptions — initials: (1) two letters both already uppercase → keep (e.g. AJ);
     * (2) letter + dot(s) + letter + optional trailing dot → A.J. style (e.g. a.j → A.J).
     */
    normalizeStoredFirstName(raw) {
      const trimmed = String(raw || '').trim();
      if (!trimmed) return '';
      const compact = trimmed.replace(/\s+/g, '');
    
      const dotted = compact.match(/^([A-Za-z])(\.+)([A-Za-z])(\.?)$/);
      if (dotted) {
        const a = dotted[1].toLocaleUpperCase(undefined);
        const b = dotted[3].toLocaleUpperCase(undefined);
        const trail = dotted[4] === '.' ? '.' : '';
        return `${a}.${b}${trail}`;
      }
    
      if (/^[A-Z]{2}$/.test(trimmed)) {
        return trimmed;
      }
    
      const lower = trimmed.toLocaleLowerCase(undefined);
      const first = lower.charAt(0).toLocaleUpperCase(undefined);
      return first + lower.slice(1);
    },
    hashStringToUint(str) {
      let h = 2166136261;
      const s = String(str || '');
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    },
    shuffledFriendTermIndexes(seed) {
      const indexes = UtilsCore.FRIEND_TERM_BANK.map((_, i) => i);
      let state = UtilsCore.hashStringToUint(seed) || 1;
      const nextRand = () => {
        state = Math.imul(state ^ (state >>> 15), 2246822507);
        state = Math.imul(state ^ (state >>> 13), 3266489909);
        return ((state ^= state >>> 16) >>> 0) / 4294967296;
      };
      for (let i = indexes.length - 1; i > 0; i--) {
        const j = Math.floor(nextRand() * (i + 1));
        [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
      }
      return indexes;
    },
    readFriendTermQueue() {
      try {
        const raw = root.localStorage.getItem(UtilsCore.FRIEND_TERM_QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed) && parsed.every((n) => Number.isInteger(n))) {
          return parsed.filter((n) => n >= 0 && n < UtilsCore.FRIEND_TERM_BANK.length);
        }
      } catch (_) {
        /* */
      }
      return [];
    },
    writeFriendTermQueue(queue) {
      try {
        root.localStorage.setItem(UtilsCore.FRIEND_TERM_QUEUE_KEY, JSON.stringify(queue));
      } catch (_) {
        /* */
      }
    },
    refillFriendTermQueue() {
      const seed = `${UtilsCore.getOrCreateUserId()}:${Date.now()}:${Math.random()}`;
      const queue = UtilsCore.shuffledFriendTermIndexes(seed);
      UtilsCore.writeFriendTermQueue(queue);
      return queue;
    },
    getPendingFriendTerm() {
      try {
        const raw = root.localStorage.getItem(UtilsCore.FRIEND_TERM_PENDING_KEY);
        const idx = raw == null ? -1 : Number(raw);
        if (Number.isInteger(idx) && idx >= 0 && idx < UtilsCore.FRIEND_TERM_BANK.length) {
          return { ...UtilsCore.FRIEND_TERM_BANK[idx], index: idx };
        }
      } catch (_) {
        /* */
      }
    
      let queue = UtilsCore.readFriendTermQueue();
      if (!queue.length) queue = UtilsCore.refillFriendTermQueue();
      const idx = queue[0];
      try {
        root.localStorage.setItem(UtilsCore.FRIEND_TERM_PENDING_KEY, String(idx));
      } catch (_) {
        /* */
      }
      return { ...UtilsCore.FRIEND_TERM_BANK[idx], index: idx };
    },
    consumePendingFriendTerm() {
      const term = UtilsCore.getPendingFriendTerm();
      let queue = UtilsCore.readFriendTermQueue();
      if (queue[0] === term.index) {
        queue = queue.slice(1);
      } else {
        queue = queue.filter((idx) => idx !== term.index);
      }
      UtilsCore.writeFriendTermQueue(queue);
      try {
        root.localStorage.removeItem(UtilsCore.FRIEND_TERM_PENDING_KEY);
      } catch (_) {
        /* */
      }
      return term;
    },
    clearPendingFriendTerm() {
      try {
        root.localStorage.removeItem(UtilsCore.FRIEND_TERM_PENDING_KEY);
      } catch (_) {
        /* */
      }
    },
    formatFriendTermHelper(term = UtilsCore.getPendingFriendTerm()) {
      const name = String(term?.name || 'Friend').trim() || 'Friend';
      const language = String(term?.language || '').trim();
      return language ? `Skip and appear as ${name} (friend in ${language})` : `Skip and appear as ${name}`;
    },
    getPendingFriendTermName() {
      const term = UtilsCore.getPendingFriendTerm();
      return String(term?.name || 'Friend').trim() || 'Friend';
    },
    formatFriendTermExplainerHtml(term = UtilsCore.getPendingFriendTerm()) {
      const language = String(term?.language || '').trim();
      return language
        ? `Rather not use your real name?<br>Here&rsquo;s the ${language} word for <em>friend</em>`
        : 'Rather not use your real name?<br>Here&rsquo;s a word for <em>friend</em>';
    },
    formatFriendTermInputValue(term = UtilsCore.getPendingFriendTerm()) {
      const name = String(term?.name || 'Friend').trim() || 'Friend';
      const language = String(term?.language || '').trim();
      return language ? `${name} (friend in ${language})` : name;
    },
    isPendingFriendTermInputValue(value) {
      const v = String(value || '').replace(/\s+/g, ' ').trim();
      if (!v) return false;
      const term = UtilsCore.getPendingFriendTerm();
      const name = String(term?.name || 'Friend').trim() || 'Friend';
      return v === name || v === UtilsCore.formatFriendTermInputValue(term);
    },
    setUserFirstName(name) {
      try {
        const t = UtilsCore.normalizeStoredFirstName(name);
        if (t) {
          root.localStorage.setItem(UtilsCore.USER_FIRST_NAME_KEY, t);
          root.localStorage.removeItem(UtilsCore.FIRST_NAME_SKIPPED_KEY);
        }
      } catch (_) {
        /* */
      }
    },
    /**
     * Older builds only set `FIRST_NAME_SKIPPED_KEY` and left the name key empty.
     * Persist the skip choice as a real stored value so “empty name” can mean “needs prompt”.
     */
    migrateLegacyFirstNameSkipToStorage() {
      try {
        if (root.localStorage.getItem(UtilsCore.FIRST_NAME_SKIPPED_KEY) !== '1') return;
        const existing = (root.localStorage.getItem(UtilsCore.USER_FIRST_NAME_KEY) || '').trim();
        if (existing) {
          root.localStorage.removeItem(UtilsCore.FIRST_NAME_SKIPPED_KEY);
          return;
        }
        UtilsCore.setUserFirstName('friend');
      } catch (_) {
        /* */
      }
    },
    /** True when there is no stored first name (after legacy skip migration). */
    needsFirstNamePrompt() {
      UtilsCore.migrateLegacyFirstNameSkipToStorage();
      return !UtilsCore.getUserFirstName().trim();
    },
    /** Active skip: store the same default we would show (“Friend”) so storage stays explicit. */
    markFirstNameSkipped() {
      const term = UtilsCore.consumePendingFriendTerm();
      UtilsCore.setUserFirstName(term?.name || 'Friend');
    },
    /** One portal layout; `portal-mode--first-visit` = Welcome in greeting mount + join line below. */
    syncPortalVisitMode() {
      const portal = root.document.getElementById('screen-portal');
      if (!portal) return;
      const first = UtilsCore.needsFirstNamePrompt();
      portal.classList.add('portal-mode--returning');
      portal.classList.toggle('portal-mode--first-visit', first);
      if (first) {
        UtilsCore.applyPortalFirstVisitJoinContent();
        root.app?._setPortalJoinCountAwaiting?.();
      }
    },
    getPortalFirstVisitGreetingLine() {
      return 'Welcome';
    },
    /** Join line only (You're joining / count) — Welcome paints in `#portalGreetingMount`. */
    applyPortalFirstVisitJoinContent() {
      const joinLine = root.document.getElementById('portalJoinLine');
      if (!joinLine) return;
      const shell =
        '<span class="portal-join-line__lead">You\'re joining</span>' +
        '<span class="portal-join-line__count-row">' +
        '<span class="portal-join-line__middle" id="portalJoinMiddle" aria-hidden="true"></span>' +
        '<span class="portal-join-line__trail">others today</span>' +
        '</span>';
      const joinLead = joinLine.querySelector('.portal-join-line__lead');
      if (
        !joinLead ||
        joinLead.textContent?.trim() !== "You're joining" ||
        !joinLine.querySelector('.portal-join-line__count-row')
      ) {
        joinLine.className = 'portal-join-line portal-join-line--split';
        joinLine.innerHTML = shell;
        return;
      }
      joinLine.className = 'portal-join-line portal-join-line--split';
      joinLead.textContent = "You're joining";
    },
    setPortalGreetingReady(isReady) {
      const portal = root.document.getElementById('screen-portal');
      if (!portal) return;
      portal.classList.toggle('portal-greeting-ready', !!isReady);
    },
    getTimeOfDayPortalGreetingLead(date = new Date()) {
      const h = date.getHours();
      let part = 'Hello';
      if (h < 5) part = 'Hello';
      else if (h < 12) part = 'Good morning';
      else if (h < 17) part = 'Good afternoon';
      else part = 'Good evening';
      return part;
    },
    getPortalGreetingTemplate() {
      if (UtilsCore._portalGreetingTemplate) return UtilsCore._portalGreetingTemplate;
      const bank = Array.isArray(UtilsCore.PORTAL_GREETING_BANK)
        ? UtilsCore.PORTAL_GREETING_BANK.filter(Boolean)
        : [];
      if (!bank.length) return '[timeOfDay], [name]';
    
      let idx = 0;
      try {
        const stored = Number.parseInt(root.localStorage.getItem(UtilsCore.PORTAL_GREETING_INDEX_KEY) || '0', 10);
        idx = Number.isFinite(stored) && stored >= 0 ? stored : 0;
      } catch (_) {
        idx = 0;
      }
    
      const template = bank[idx % bank.length];
      UtilsCore._portalGreetingTemplate = template;
      try {
        root.localStorage.setItem(UtilsCore.PORTAL_GREETING_INDEX_KEY, String((idx + 1) % bank.length));
      } catch (_) {
        /* */
      }
      return template;
    },
    formatPortalGreetingTemplate(template, displayName, date = new Date()) {
      const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
      return String(template || '[timeOfDay], [name]')
        .replace(/\[(?:name)\]|\{(?:name)\}/gi, displayName)
        .replace(/\[(?:weekday|day of the week)\]|\{(?:weekday|day of the week)\}/gi, weekday)
        .replace(/\[(?:timeOfDay)\]|\{(?:timeOfDay)\}/gi, UtilsCore.getTimeOfDayPortalGreetingLead(date))
        .replace(/\s+/g, ' ')
        .trim();
    },
    getPortalGreetingDisplayLine() {
      const name = UtilsCore.getPortalGreetingName();
      if (!name) return '';
      const displayName = name === 'friend' ? 'Friend' : name;
      return UtilsCore.formatPortalGreetingTemplate(UtilsCore.getPortalGreetingTemplate(), displayName);
    },
    /** One line after a successful reflection submit (inline helper only). */
    getReflectionThankYouMessage() {
      const displayName = UtilsCore.getNameThanksDisplayName();
      return String(UtilsCore.REFLECTION_THANK_YOU_MESSAGE || 'Thank you for sharing.')
        .replace(/\[(?:name)\]|\{(?:name)\}/gi, displayName)
        .replace(/\s+/g, ' ')
        .trim();
    },
    /**
     * Per-app-day placement on the theme-cards stack top rim (hash of date key).
     * Star sits only along the top edge — biased away from left-aligned slide text.
     */
    applyReflectionPatchStarPlacement(el, dateKey) {
      if (!el) return;
      const key = String(dateKey || UtilsCore.getTodayKey() || '').trim() || 'nodate';
      const h = UtilsCore.hashStringToUint(`odq-reflection-patch-star:${key}`) || 1;
      const slots = [
        { top: '-3%', left: '5%', right: 'auto', bottom: 'auto', tx: '-50%', ty: '-52%' },
        { top: '-2%', left: '20%', right: 'auto', bottom: 'auto', tx: '-52%', ty: '-50%' },
        { top: '-4%', left: '36%', right: 'auto', bottom: 'auto', tx: '-50%', ty: '-54%' },
        { top: '-2%', left: '52%', right: 'auto', bottom: 'auto', tx: '-48%', ty: '-52%' },
        { top: '-3%', left: '68%', right: 'auto', bottom: 'auto', tx: '-50%', ty: '-50%' },
        { top: '-4%', right: '-2%', left: 'auto', bottom: 'auto', tx: '56%', ty: '-52%' },
        { top: '-2%', right: '10%', left: 'auto', bottom: 'auto', tx: '54%', ty: '-48%' },
        { top: '0%', right: '24%', left: 'auto', bottom: 'auto', tx: '52%', ty: '-50%' }
      ];
      const s = slots[h % slots.length];
      el.style.top = s.top;
      el.style.right = s.right;
      el.style.bottom = s.bottom;
      el.style.left = s.left;
      el.style.setProperty('--odq-star-tx', s.tx);
      el.style.setProperty('--odq-star-ty', s.ty);
      const jx = ((h >>> 8) % 5) - 2;
      const jy = ((h >>> 16) % 5) - 2;
      el.style.setProperty('--odq-star-jx', `${jx}px`);
      el.style.setProperty('--odq-star-jy', `${jy}px`);
    },
    removeLegacyReflectionWallHeadings() {
      root.document.getElementById('quiltReflectionWallTitle')?.remove();
      const wall = root.document.getElementById('quiltReflectionWall');
      if (!wall) return;
      wall.querySelectorAll('.quilt-reflection-wall-kicker, .quilt-reflection-wall-helper').forEach((el) => el.remove());
    },
    syncReflectionPatchStarElement() {
      const el = root.document.getElementById('quiltReflectionPatchStar');
      if (!el) return;
      const today = UtilsCore.getTodayKey();
      UtilsCore.applyReflectionPatchStarPlacement(el, today);
      let stored = '';
      try {
        stored = (root.localStorage.getItem(UtilsCore.REFLECTION_PATCH_STAR_DAY_KEY) || '').trim();
      } catch (_) {
        stored = '';
      }
      if (stored && stored !== today) {
        try {
          root.localStorage.removeItem(UtilsCore.REFLECTION_PATCH_STAR_DAY_KEY);
        } catch (_) {
          /* */
        }
        stored = '';
      }
      const shouldShow = Boolean(stored && stored === today);
      if (shouldShow) {
        el.removeAttribute('hidden');
        if (!el.classList.contains('is-visible')) {
          root.requestAnimationFrame(() => {
            root.requestAnimationFrame(() => el.classList.add('is-visible'));
          });
        }
      } else {
        el.classList.remove('is-visible');
        el.setAttribute('hidden', 'hidden');
      }
    },
    lightReflectionPatchStarForToday() {
      try {
        root.localStorage.setItem(UtilsCore.REFLECTION_PATCH_STAR_DAY_KEY, UtilsCore.getTodayKey());
      } catch (_) {
        /* */
      }
      UtilsCore.syncReflectionPatchStarElement();
    },
    extinguishReflectionPatchStar() {
      try {
        root.localStorage.removeItem(UtilsCore.REFLECTION_PATCH_STAR_DAY_KEY);
      } catch (_) {
        /* */
      }
      UtilsCore.syncReflectionPatchStarElement();
    },
    async refreshPortalGreeting() {
      UtilsCore.syncPortalVisitMode();
      const portal = root.document.getElementById('screen-portal');
      if (portal?.classList.contains('portal-mode--first-visit')) {
        await root.app?.quoteService?.mountPortalGreetingStrips?.(
          UtilsCore.getPortalFirstVisitGreetingLine()
        );
        return;
      }
      const line = UtilsCore.getPortalGreetingDisplayLine();
      if (!line) {
        UtilsCore.setPortalGreetingReady(true);
        await root.app?.quoteService?.mountPortalGreetingStrips?.('');
        return;
      }
      await root.app?.quoteService?.mountPortalGreetingStrips?.(line);
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
