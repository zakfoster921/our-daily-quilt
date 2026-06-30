/**
 * SimplifiedQuiltAppV2 admin slice: archive, admin menu, simulation, debug (Phase C5).
 * Methods merged onto SimplifiedQuiltAppV2.prototype in the main app module.
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2Admin {
      setupArchiveEventHandlers() {
        document.addEventListener('screenChange', (e) => {
          if (e.detail.screenId === 'screen-reflection-themes-archive') {
            this.initializeReflectionThemesArchiveScreen();
          }
        });
      }

      // Create archive snapshot from current quilt
      async createArchiveSnapshot() {
        // Use UTC to determine the date for this quilt
        const utcNow = new Date();
        const quiltDate = utcNow.toISOString().split('T')[0];
        const currentQuote = this.quoteService.getQuoteForDate(quiltDate);
        const blockCount = this.quiltEngine.blocks.length;
        
        this.logger.log(`🖼️ Generating thumbnail for ${blockCount} blocks...`);
        
        // Generate thumbnail and full quilt image
        const thumbnail = await this.archiveService.generateThumbnail();
        const fullQuiltImage = await this.archiveService.generateFullQuiltImage(this.quiltEngine.blocks);
        
        // Create archive entry
        const archiveEntry = this.archiveService.createArchiveEntry(
          quiltDate,
          { blocks: this.quiltEngine.blocks }, // Current quilt state
          currentQuote,
          Math.max(blockCount, 12) // Use actual block count or minimum 12
        );
        
        // Set the generated images
        archiveEntry.thumbnail = thumbnail;
        archiveEntry.fullQuiltImage = fullQuiltImage;
        
        // Add to archive
        await this.archiveService.addArchive(archiveEntry);
        
        // Note: Archive feed will be re-rendered when switching to archive screen
        
        this.logger.log(`✅ Created archive snapshot for ${quiltDate} with ${blockCount} blocks and thumbnail`);
        return archiveEntry;
      }

      // Archive current quilt (renamed from createTestArchivePosts)
      async createTestArchivePosts() {
        this.logger.log('📦 Archiving current quilt as test...');
        
        try {
          // Check if there's a current quilt to archive
          if (!this.quiltEngine.blocks || this.quiltEngine.blocks.length <= 1) {
            this.logger.warn('📦 No quilt to archive (only initial block or no blocks)');
            this.uiService.showToast('No quilt to archive - add some blocks first!');
            return;
          }
          
          // Create archive of current quilt
          const archiveEntry = await this.createArchiveSnapshot();
          
          this.logger.log(`✅ Archived current quilt with ${this.quiltEngine.blocks.length} blocks`);
          this.uiService.showToast(`Current quilt archived with ${this.quiltEngine.blocks.length} blocks!`);
          await this.archiveService.loadArchivesFromFirestore();
        } catch (error) {
          this.logger.error('❌ Failed to archive current quilt:', error);
          this.uiService.showToast('Failed to archive current quilt');
        }
      }

      // Manual archive trigger for testing
      async triggerManualArchive() {
        this.logger.log('🔧 Manual archive triggered for testing...');
        try {
          const result = await this.performDailyArchive();
          this.logger.log(`🔧 Manual archive result: ${result ? 'SUCCESS' : 'FAILED'}`);
          return result;
        } catch (error) {
          this.logger.error('🔧 Manual archive error:', error);
          return false;
        }
      }

      isCurrentUserAdmin() {
        if (!CONFIG.APP.enableAdminTools) {
          return false;
        }

        const currentUserId = this.currentUserId;
        const isAdminFlag = localStorage.getItem('ourDailyIsAdmin') === 'true';
        
        // Check if admin flag is set (you can enable this via console)
        if (isAdminFlag) {
          return true;
        }
        
        // Admin mode disabled by default - use long-press on title to enable
        return false;
      }

      enableAdminMode() {
        if (!CONFIG.APP.enableAdminTools) {
          return;
        }
        localStorage.setItem('ourDailyIsAdmin', 'true');
        void this.refreshDailyQuotePushRegistration?.();
      }

      showAdminPasscodeModal() {
        return new Promise((resolve) => {
          const existing = document.querySelector('.odq-admin-passcode-modal');
          if (existing) existing.remove();
          const overlay = document.createElement('div');
          overlay.className = 'odq-admin-passcode-modal';
          overlay.style.cssText =
            'position:fixed;inset:0;z-index:100090;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;';
          const panel = document.createElement('div');
          panel.style.cssText =
            'background:#fff;border:2px solid #000;border-radius:8px;padding:14px;width:min(320px,100%);box-sizing:border-box;';
          panel.innerHTML = `
            <p style="margin:0 0 10px;font-size:15px;font-weight:600;">Admin passcode</p>
            <input type="password" id="odq-admin-passcode-input" autocomplete="off" inputmode="text" style="width:100%;padding:10px 8px;font-size:16px;border:1px solid #999;border-radius:4px;box-sizing:border-box;" />
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
              <button type="button" data-action="cancel" style="padding:8px 12px;border:1px solid #000;background:#fff;border-radius:4px;font-size:14px;">Cancel</button>
              <button type="button" data-action="ok" style="padding:8px 12px;border:1px solid #000;background:#222;color:#fff;border-radius:4px;font-size:14px;">OK</button>
            </div>
          `;
          overlay.appendChild(panel);
          const finish = (value) => {
            overlay.remove();
            resolve(value);
          };
          panel.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(null));
          panel.querySelector('[data-action="ok"]').addEventListener('click', () => {
            const input = panel.querySelector('#odq-admin-passcode-input');
            finish(String(input?.value || ''));
          });
          overlay.addEventListener('click', (e) => {
            if (e.target === overlay) finish(null);
          });
          document.body.appendChild(overlay);
          const input = panel.querySelector('#odq-admin-passcode-input');
          if (input) {
            input.focus();
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                finish(String(input.value || ''));
              }
            });
          }
        });
      }

      async requestAdminAccess() {
        try {
          if (!CONFIG.APP.enableAdminTools) {
            this.uiService.showToast('Admin tools disabled on this host');
            return false;
          }

          if (this.isCurrentUserAdmin()) {
            this.showAdminMenu();
            return true;
          }

          let passcode = null;
          const useNativeModal =
            (typeof odqIsCapacitorNative === 'function' && odqIsCapacitorNative()) ||
            typeof window.prompt !== 'function';
          if (useNativeModal) {
            passcode = await this.showAdminPasscodeModal();
          } else {
            passcode = window.prompt('Enter admin passcode:');
          }
          if (passcode === null) {
            return false;
          }

          if (passcode === 'odqodqodq') {
            this.enableAdminMode();
            this.uiService.showToast('Admin mode enabled');
            this.showAdminMenu();
            return true;
          }

          localStorage.removeItem('ourDailyIsAdmin');
          this.uiService.showToast('Admin access denied');
          return false;
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          this.uiService.showToast('Admin error: ' + msg.slice(0, 80), 5000);
          return false;
        }
      }

      disableAdminMode() {
        if (!confirm('Are you sure you want to disable admin mode? You can re-enable it with enableAdmin().')) {
          return;
        }
        
        localStorage.removeItem('ourDailyIsAdmin');
        this.uiService.showToast('Admin mode disabled');
        const adminBtn = document.getElementById('floatingAdminBtn');
        if (adminBtn) {
          adminBtn.style.display = 'none';
        }
      }

      // Clear admin flag from localStorage (for debugging)
      clearAdminFlag() {
        localStorage.removeItem('ourDailyIsAdmin');
        console.log('🔧 Admin flag cleared from localStorage');
        this.setupFloatingAdminButton();
      }

      // Secret function to enable admin mode - call from console: app.enableAdminSecret()
      enableAdminSecret() {
        return this.requestAdminAccess();
      }

      buildAdminReflectionResponseRowHtml(index = 0) {
        const rowNum = index + 1;
        return `
          <div class="admin-reflection-response-row" data-row-index="${index}">
            <div class="admin-reflection-response-row__head">
              <span class="admin-reflection-response-row__label">Response ${rowNum}</span>
              <button type="button" class="admin-reflection-response-row__remove" aria-label="Remove response ${rowNum}">Remove</button>
            </div>
            <label class="admin-reflection-response-row__field">
              <span class="admin-reflection-response-row__field-label">Name on patch</span>
              <input
                type="text"
                class="admin-reflection-response-name"
                maxlength="80"
                placeholder="e.g. Maria"
                autocomplete="name"
              />
            </label>
            <label class="admin-reflection-response-row__field">
              <span class="admin-reflection-response-row__field-label">Reflection (200 characters max)</span>
              <textarea
                class="admin-reflection-response-text"
                rows="3"
                maxlength="200"
                placeholder="Paste or type the response text"
              ></textarea>
            </label>
          </div>
        `;
      }

      bindAdminReflectionResponseRow(rowEl, { rowsList, onRowsChanged }) {
        if (!rowEl) return;
        rowEl.querySelector('.admin-reflection-response-row__remove')?.addEventListener('click', () => {
          const rows = rowsList?.querySelectorAll('.admin-reflection-response-row') || [];
          if (rows.length <= 1) {
            rowEl.querySelector('.admin-reflection-response-text')?.focus();
            return;
          }
          rowEl.remove();
          onRowsChanged?.();
        });
        const text = rowEl.querySelector('.admin-reflection-response-text');
        text?.addEventListener('input', () => {
          const len = String(text.value || '').length;
          rowEl.classList.toggle('is-over-limit', len > 200);
        });
      }

      addAdminReflectionResponseRow(rowsList, { onRowsChanged, focus = true } = {}) {
        if (!rowsList) return null;
        const index = rowsList.querySelectorAll('.admin-reflection-response-row').length;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = this.buildAdminReflectionResponseRowHtml(index);
        const row = wrapper.firstElementChild;
        if (!row) return null;
        rowsList.appendChild(row);
        this.bindAdminReflectionResponseRow(row, { rowsList, onRowsChanged });
        onRowsChanged?.();
        if (focus) row.querySelector('.admin-reflection-response-name')?.focus();
        return row;
      }

      relabelAdminReflectionResponseRows(rowsList) {
        (rowsList?.querySelectorAll('.admin-reflection-response-row') || []).forEach((row, index) => {
          row.dataset.rowIndex = String(index);
          const label = row.querySelector('.admin-reflection-response-row__label');
          if (label) label.textContent = `Response ${index + 1}`;
          row.querySelector('.admin-reflection-response-row__remove')?.setAttribute(
            'aria-label',
            `Remove response ${index + 1}`
          );
        });
      }

      collectAdminReflectionResponseEntries(rowsList) {
        const entries = [];
        (rowsList?.querySelectorAll('.admin-reflection-response-row') || []).forEach((row) => {
          const text = String(row.querySelector('.admin-reflection-response-text')?.value || '')
            .replace(/\s+/g, ' ')
            .trim();
          if (!text) return;
          const name = String(row.querySelector('.admin-reflection-response-name')?.value || '')
            .replace(/\s+/g, ' ')
            .trim();
          entries.push({ text, displayName: name || 'Friend' });
        });
        return entries;
      }

      handleAdminSubmitReflectionResponses() {
        if (!this.isCurrentUserAdmin()) {
          this.uiService?.showToast?.('Admin mode required');
          return;
        }

        document.querySelectorAll('.admin-reflection-responses-menu').forEach((el) => el.remove());
        document.querySelectorAll('.admin-menu').forEach((el) => el.remove());

        const todayQuote = this.quoteService?.getTodayQuote?.() || null;
        const promptText = this.getQuiltReflectionPromptText(todayQuote);
        const menu = document.createElement('div');
        menu.className = 'admin-reflection-responses-menu';
        menu.innerHTML = `
          <div class="admin-reflection-responses-content">
            <h2 class="admin-reflection-responses-title">Upload reflection responses</h2>
            <p class="admin-reflection-responses-prompt">
              <strong>Today&rsquo;s prompt:</strong> ${this.escapeQuiltFortuneText(promptText)}
            </p>
            <p class="admin-reflection-responses-hint">Add one or more responses. Each needs a name (shown on the wall patch) and the response text.</p>
            <div class="admin-reflection-responses-rows" id="adminReflectionResponsesRows" role="list"></div>
            <div class="admin-reflection-responses-toolbar">
              <button type="button" id="adminReflectionResponsesAdd">+ Add another response</button>
            </div>
            <p id="adminReflectionResponsesStatus" class="admin-reflection-responses-status" aria-live="polite"></p>
            <div class="admin-reflection-responses-actions">
              <button type="button" id="adminReflectionResponsesCancel">Cancel</button>
              <button type="button" id="adminReflectionResponsesSubmit">Publish responses</button>
            </div>
          </div>
        `;

        const close = () => menu.remove();
        const rowsList = menu.querySelector('#adminReflectionResponsesRows');
        const status = menu.querySelector('#adminReflectionResponsesStatus');
        const submitBtn = menu.querySelector('#adminReflectionResponsesSubmit');
        const onRowsChanged = () => this.relabelAdminReflectionResponseRows(rowsList);

        this.addAdminReflectionResponseRow(rowsList, { onRowsChanged, focus: false });
        this.addAdminReflectionResponseRow(rowsList, { onRowsChanged, focus: false });

        menu.querySelector('#adminReflectionResponsesAdd')?.addEventListener('click', () => {
          this.addAdminReflectionResponseRow(rowsList, { onRowsChanged, focus: true });
        });
        menu.querySelector('#adminReflectionResponsesCancel')?.addEventListener('click', close);
        menu.addEventListener('click', (event) => {
          if (event.target === menu) close();
        });

        submitBtn?.addEventListener('click', async () => {
          const entries = this.collectAdminReflectionResponseEntries(rowsList);
          const tooLong = entries.find((entry) => entry.text.length > 200);

          if (!entries.length) {
            status.textContent = 'Add at least one response with text.';
            rowsList?.querySelector('.admin-reflection-response-text')?.focus();
            return;
          }
          if (tooLong) {
            status.textContent = `One response is ${tooLong.text.length} characters. Keep each to 200 or fewer.`;
            return;
          }

          submitBtn.disabled = true;
          submitBtn.textContent = 'Publishing...';
          status.textContent = `Publishing ${entries.length} ${entries.length === 1 ? 'response' : 'responses'}...`;

          const baseClientId = this.currentUserId || Utils.getOrCreateUserId();
          const batchId = Date.now();
          let submittedCount = 0;
          try {
            for (let index = 0; index < entries.length; index += 1) {
              const entry = entries[index];
              await this.submitReflectionResponse(entry.text, {
                clientId: `${baseClientId}:admin-reflection:${batchId}:${index}`,
                displayName: entry.displayName
              });
              submittedCount += 1;
              status.textContent = `Published ${submittedCount}/${entries.length}...`;
            }
          } catch (error) {
            this.logger?.warn?.('Admin reflection response submit failed:', error);
            status.textContent =
              error?.message ||
              `Published ${submittedCount}/${entries.length}; stopped after an error.`;
            submitBtn.textContent = 'Try remaining again';
            submitBtn.disabled = false;
            return;
          }

          status.textContent = `Published ${submittedCount} ${submittedCount === 1 ? 'response' : 'responses'}.`;
          this.uiService?.showToast?.(`Published ${submittedCount} reflection responses`);
          if (typeof window.refreshReflectionThemesNow === 'function') {
            window.refreshReflectionThemesNow();
          } else {
            this.loadReflectionThemesForToday?.();
          }
          setTimeout(close, 900);
        });

        document.body.appendChild(menu);
        setTimeout(() => {
          rowsList?.querySelector('.admin-reflection-response-row .admin-reflection-response-name')?.focus();
        }, 0);
      }

      // Reveal image management functions
      async loadRevealImageOptions() {
        try {
          // Enable Firebase for image storage
          await this.initializeFirebaseForImages();
          
          const optionsContainer = document.getElementById('revealImageOptions');
          if (!optionsContainer) return;
          
          // Check if Firebase is available
          if (!window.firebaseApp || !window.firebaseStorage) {
            optionsContainer.innerHTML = '<p>Firebase not available. Please try again.</p>';
            return;
          }
          
          // Load images from Firebase Storage
          const { ref, listAll, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
          const storage = window.firebaseStorage;
          
          // Try to get images from quilt-reveals folder
          const revealsRef = ref(storage, 'quilt-reveals');
          const result = await listAll(revealsRef);
          
          if (result.items.length === 0) {
            optionsContainer.innerHTML = '<p>No reveal images found. Upload one to get started!</p>';
            return;
          }
          
          // Build HTML for image options
          let optionsHTML = '';
          
          for (let i = 0; i < result.items.length; i++) {
            const item = result.items[i];
            const downloadURL = await getDownloadURL(item);
            const imageId = `revealImage${i}`;
            
            optionsHTML += `
              <div class="image-option" style="margin: 10px 0; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
                <input type="radio" name="revealImage" value="${downloadURL}" id="${imageId}">
                <label for="${imageId}" style="display: flex; align-items: center; gap: 10px;">
                  <img src="${downloadURL}" alt="Reveal Image ${i + 1}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;">
                  <span>${item.name}</span>
                </label>
              </div>
            `;
          }
          
          optionsHTML += '<button onclick="app.handleSelectRevealImage()" style="margin-top: 10px;">Apply Selected Image</button>';
          
          optionsContainer.innerHTML = optionsHTML;
          
        } catch (error) {
          console.error('Error loading reveal image options:', error);
          const optionsContainer = document.getElementById('revealImageOptions');
          if (optionsContainer) {
            optionsContainer.innerHTML = '<p>Error loading images. Please try again.</p>';
          }
        }
      }

      async ensureFirebaseAuthForFirestore(options = {}) {
        const timeoutMs = Math.max(15000, Number(options.timeoutMs) || 45000);
        const existingUser = window.firebaseAuth?.currentUser || window.odqFirebaseAuthUser || null;
        if (existingUser?.uid && typeof existingUser.getIdToken === 'function') {
          try {
            window.odqFirebaseAuthIdToken = await odqPromiseWithTimeout(
              existingUser.getIdToken(false),
              12000,
              'Firebase ID token refresh'
            );
            window.odqFirebaseAuthUser = existingUser;
            return existingUser;
          } catch (_) {
            /* re-sign below */
          }
        }

        const authMod = await odqPromiseWithTimeout(
          import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'),
          20000,
          'Firebase Auth SDK'
        );
        const appMod = await odqPromiseWithTimeout(
          import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),
          15000,
          'Firebase app SDK'
        );
        const { getAuth, signInAnonymously } = authMod;
        const { getApp, getApps, initializeApp } = appMod;
        const firebaseApp =
          getApps().length > 0 ? getApp() : initializeApp(CONFIG.FIREBASE);
        const auth = getAuth(firebaseApp);
        window.firebaseApp = window.firebaseApp || firebaseApp;
        window.firebaseAuth = auth;

        if (typeof auth.authStateReady === 'function') {
          await odqPromiseWithTimeout(auth.authStateReady(), 15000, 'Firebase auth state').catch(
            () => {}
          );
        }
        if (auth.currentUser?.uid) {
          window.odqFirebaseAuthUser = auth.currentUser;
          window.odqFirebaseAuthIdToken = await odqPromiseWithTimeout(
            auth.currentUser.getIdToken(false),
            12000,
            'Firebase ID token'
          );
          return auth.currentUser;
        }

        const signInOnce = () => signInAnonymously(auth);
        let credential = null;
        try {
          credential = await odqPromiseWithTimeout(signInOnce(), timeoutMs, 'Firebase anonymous sign-in');
        } catch (firstErr) {
          credential = await odqPromiseWithTimeout(
            signInOnce(),
            timeoutMs,
            'Firebase anonymous sign-in retry'
          );
        }
        const authUser = credential?.user || auth.currentUser || null;
        if (!authUser?.uid || typeof authUser.getIdToken !== 'function') {
          throw new Error('Firebase anonymous sign-in returned no user');
        }
        window.odqFirebaseAuthUser = authUser;
        window.odqFirebaseAuthIdToken = await odqPromiseWithTimeout(
          authUser.getIdToken(true),
          15000,
          'Firebase ID token'
        );
        return authUser;
      }

      async initializeFirebaseForImages() {
        try {
          const initStep = async (label, promise, timeoutMs) => {
            try {
              const result = await odqPromiseWithTimeout(promise, timeoutMs, label);
              return result;
            } catch (err) {
              throw err;
            }
          };

          const appMod = await initStep(
            'Firebase app SDK',
            import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),
            15000
          );
          const storageMod = await initStep(
            'Firebase Storage SDK',
            import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'),
            20000
          );
          const { initializeApp, getApp, getApps } = appMod;
          const { getStorage } = storageMod;

          /** Reuse [DEFAULT] app from Firestore init — avoid duplicate initializeApp() throw. */
          const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(CONFIG.FIREBASE);
          const storage = getStorage(firebaseApp);
          const authUser = await this.ensureFirebaseAuthForFirestore({ timeoutMs: 45000 });

          window.firebaseApp = firebaseApp;
          window.firebaseStorage = storage;
          return firebaseApp;
        } catch (error) {
          console.error('Failed to initialize Firebase for images:', error);
          throw error;
        }
      }

      async handleUploadRevealImage() {
        const fileInput = document.getElementById('revealImageUpload');
        const file = fileInput?.files[0];
        
        if (!file) {
          alert('Please select an image file first.');
          return;
        }
        
        try {
          await this.initializeFirebaseForImages();
          
          // Show loading message
          const uploadButton = document.querySelector('button[onclick="app.handleUploadRevealImage()"]');
          const originalText = uploadButton.textContent;
          uploadButton.textContent = 'Resizing & Uploading...';
          uploadButton.disabled = true;
          
          // Resize image to quilt dimensions (412 x 800)
          const resizedImageBlob = await this.resizeImageToQuiltDimensions(file);
          
          // Check authentication status before upload
          if (!window.firebaseAuth) {
            await this.initializeFirebaseForImages();
          }
          
          const auth = window.firebaseAuth;
          
          // Upload to Firebase Storage
          const { ref, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
          const storage = window.firebaseStorage;
          
          // Create unique filename with timestamp
          const timestamp = Date.now();
          const filename = `quilt-reveal-${timestamp}.png`;
          const imageRef = ref(storage, `quilt-reveals/${filename}`);
          
          // Upload the resized image
          let downloadURL;
          try {
            await uploadBytes(imageRef, resizedImageBlob);
            downloadURL = await getDownloadURL(imageRef);
          } catch (uploadError) {
            console.error('Upload failed:', uploadError);
            
            // If upload fails due to permissions, show helpful message
            if (uploadError.code === 'storage/unauthorized') {
              
              this.uiService.showToast('❌ Upload failed: Authentication issue. Please check Firebase Console settings.');
              throw new Error('Firebase authentication issue. Please enable Anonymous Authentication in Firebase Console.');
            }
            
            throw uploadError;
          }
          
          // Store image info
          const imageInfo = {
            name: filename,
            url: downloadURL,
            uploadedAt: timestamp
          };
          
          // Add to available images
          if (!this.availableRevealImages) {
            this.availableRevealImages = [];
          }
          this.availableRevealImages.push(imageInfo);
          
          // Refresh the image options display
          this.loadRevealImageOptions();
          
          // Clear the file input
          fileInput.value = '';
          
          // Reset button
          uploadButton.textContent = originalText;
          uploadButton.disabled = false;
          
          this.uiService.showToast('✅ Image uploaded and resized successfully!');
          console.log('Image uploaded:', imageInfo);
          
        } catch (error) {
          console.error('Error uploading image:', error);
          this.uiService.showToast('❌ Error uploading image. Please try again.');
          
          // Reset button on error
          const uploadButton = document.querySelector('button[onclick="app.handleUploadRevealImage()"]');
          if (uploadButton) {
            uploadButton.textContent = 'Upload Image';
            uploadButton.disabled = false;
          }
        }
      }

      async resizeImageToQuiltDimensions(file) {
        return new Promise((resolve, reject) => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          // Set target dimensions (quilt size)
          const targetWidth = 412;
          const targetHeight = 800;
          
          img.onload = () => {
            try {
              // Set canvas size to target dimensions
              canvas.width = targetWidth;
              canvas.height = targetHeight;
              
              // Calculate scaling to fill the entire target area (crop approach)
              const imageAspect = img.width / img.height;
              const targetAspect = targetWidth / targetHeight;
              
              let sourceX, sourceY, sourceWidth, sourceHeight;
              
              if (imageAspect > targetAspect) {
                // Image is wider than target - scale to height and crop width
                const scaledWidth = img.height * targetAspect;
                sourceWidth = scaledWidth;
                sourceHeight = img.height;
                sourceX = (img.width - scaledWidth) / 2; // Center crop
                sourceY = 0;
              } else {
                // Image is taller than target - scale to width and crop height
                const scaledHeight = img.width / targetAspect;
                sourceWidth = img.width;
                sourceHeight = scaledHeight;
                sourceX = 0;
                sourceY = (img.height - scaledHeight) / 2; // Center crop
              }
              
              // Draw the cropped portion of the image to fill the entire canvas
              ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
              
              // Convert to blob
              canvas.toBlob((blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Failed to create image blob'));
                }
              }, 'image/png', 0.9);
              
            } catch (error) {
              reject(error);
            }
          };
          
          img.onerror = () => {
            reject(new Error('Failed to load image for resizing'));
          };
          
          // Load image from file
          const reader = new FileReader();
          reader.onload = (e) => {
            img.src = e.target.result;
          };
          reader.onerror = () => {
            reject(new Error('Failed to read image file'));
          };
          reader.readAsDataURL(file);
        });
      }

      async handleSelectRevealImage() {
        const selectedImageURL = document.querySelector('input[name="revealImage"]:checked')?.value;
        
        if (!selectedImageURL) {
          alert('Please select an image first.');
          return;
        }
        
        try {
          // Create image info object
          const imageInfo = {
            name: 'Selected Reveal Image',
            url: selectedImageURL
          };
          
          // Store the selected image preference
          localStorage.setItem('selectedRevealImage', selectedImageURL);
          
          // Apply the image to the quilt
          await this.applyImageToQuilt(imageInfo);
          
          this.uiService.showToast('✅ Reveal image applied successfully!');
          
        } catch (error) {
          console.error('Error applying reveal image:', error);
          this.uiService.showToast('❌ Error applying image. Please try again.');
        }
      }

      async applyRevealImageToQuilt(imageName) {
        console.log('Applying reveal image:', imageName);
        
        // Store the selection
        this.currentRevealImage = imageName;
        
        // Apply image to flipped blocks
        await this.applyImageToQuilt(this.currentRevealImage);
      }

      async loadRandomRevealImage() {
        try {
          // Always try to initialize Firebase first
          await this.initializeFirebaseForImages();
          
          // Check if Firebase is available after initialization
          if (!window.firebaseApp || !window.firebaseStorage) {
            console.log('Firebase still not available after initialization, using fallback images');
            return this.loadFallbackImages();
          }
          
          await this.initializeFirebaseForImages();
          
          // Get list of images from Firebase Storage
          const { ref, listAll, getDownloadURL, getBlob } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
          const storage = window.firebaseStorage;
          
          // Try different possible folder names
          const possibleFolders = ['quilt-reveals', 'quilt reveals', 'quiltreveals', 'reveals', 'images'];
          let result = null;
          let folderName = null;
          
          for (const folder of possibleFolders) {
            try {
              console.log(`🖼️ Trying Firebase folder: "${folder}"`);
              const revealsRef = ref(storage, folder);
              result = await listAll(revealsRef);
              if (result.items.length > 0) {
                folderName = folder;
                console.log(`✅ Found ${result.items.length} images in Firebase folder: "${folder}"`);
                break;
              } else {
                console.log(`📁 Folder "${folder}" exists but is empty`);
              }
            } catch (error) {
              console.log(`❌ Folder "${folder}" not found:`, error.message);
            }
          }
          
          if (!result || result.items.length === 0) {
            console.log('No images found in Firebase, using fallback images');
            return this.loadFallbackImages();
          }
          
          // Randomly select an image
          const randomIndex = Math.floor(Math.random() * result.items.length);
          const selectedImageRef = result.items[randomIndex];
          
          // Try to get the image URL (may fail due to CORS when running locally)
          console.log('🖼️ Getting Firebase image URL...');
          let imageUrl;
          let blob = null;
          
          try {
            // Try blob first (better for CORS)
            blob = await getBlob(selectedImageRef);
            imageUrl = URL.createObjectURL(blob);
            console.log('🎲 Randomly selected Firebase image:', selectedImageRef.name, 'blob URL created');
          } catch (blobError) {
            console.log('🔄 Blob failed, trying direct URL:', blobError.message);
            try {
              // Fallback to direct URL
              imageUrl = await getDownloadURL(selectedImageRef);
              console.log('🎲 Randomly selected Firebase image:', selectedImageRef.name, 'direct URL created');
            } catch (urlError) {
              console.log('❌ Both blob and direct URL failed:', urlError.message);
              if (urlError.message.includes('CORS') || urlError.message.includes('Access-Control-Allow-Origin')) {
                console.log('🔄 CORS issue detected - this is normal when running locally');
                console.log('💡 Firebase images will work when deployed to a proper server');
                throw new Error('CORS blocked Firebase image (normal when running locally)');
              } else {
                throw new Error('Could not load Firebase image: ' + urlError.message);
              }
            }
          }
          
          // Store the selected image info
          this.currentRevealImage = {
            name: selectedImageRef.name,
            url: imageUrl,
            blob: blob // Keep reference to clean up later
          };
          
          console.log('🖼️ Stored currentRevealImage:', this.currentRevealImage);
          
          // Apply the image to the quilt
          await this.applyImageToQuilt(this.currentRevealImage);
          
          return this.currentRevealImage;
          
        } catch (error) {
          console.error('Error loading Firebase image:', error);
          console.log('Firebase image loading failed - no fallback');
          throw error; // Don't fall back, let the error propagate
        }
      }

      async loadFallbackImages() {
        // Use CORS-friendly test images as fallback
        const testImages = [
          {
            name: 'sunset-gradient',
            url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxyYWRpYWxHcmFkaWVudCBpZD0ic3Vuc2V0IiBjeD0iNDAwIiBjeT0iMzAwIiByPSI0MDAiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZmY2YjZiO3N0b3Atb3BhY2l0eToxIiAvPgogICAgICA8c3RvcCBvZmZzZXQ9IjUwJSIgc3R5bGU9InN0b3AtY29sb3I6I2ZmYzc0O3N0b3Atb3BhY2l0eToxIiAvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmZmViM2I7c3RvcC1vcGFjaXR5OjEiIC8+CiAgICA8L3JhZGlhbEdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI3N1bnNldCkiIC8+CiAgPHRleHQgeD0iNDAwIiB5PSIzMDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0OCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkRhaWx5IFN1bnNldDwvdGV4dD4KPC9zdmc+Cg=='
          },
          {
            name: 'ocean-waves', 
            url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0ib2NlYW4iIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojNGVjZGM0O3N0b3Atb3BhY2l0eToxIiAvPgogICAgICA8c3RvcCBvZmZzZXQ9IjUwJSIgc3R5bGU9InN0b3AtY29sb3I6IzAwNzNhYTtzdG9wLW9wYWNpdHk6MSIgLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojMDA0ZGRkO3N0b3Atb3BhY2l0eToxIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNvY2VhbikiIC8+CiAgPHRleHQgeD0iNDAwIiB5PSIzMDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0OCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk9jZWFuIFdhdmVzPC90ZXh0Pgo8L3N2Zz4K'
          },
          {
            name: 'forest-greens',
            url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZm9yZXN0IiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3R5bGU9InN0b3AtY29sb3I6IzJkNzQzNDtzdG9wLW9wYWNpdHk6MSIgLz4KICAgICAgPHN0b3Agb2Zmc2V0PSI1MCUiIHN0eWxlPSJzdG9wLWNvbG9yOjM4YTg1MzN0b3Atb3BhY2l0eToxIiAvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOjQyYjY4MmE7c3RvcC1vcGFjaXR5OjEiIC8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2ZvcmVzdCkiIC8+CiAgPHRleHQgeD0iNDAwIiB5PSIzMDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0OCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkZvcmVzdCBHcmVlbnM8L3RleHQ+Cjwvc3ZnPgo='
          }
        ];
        
        // Randomly select a test image
        const randomIndex = Math.floor(Math.random() * testImages.length);
        const selectedImage = testImages[randomIndex];
        
        console.log('🎲 Randomly selected fallback image:', selectedImage.name);
        
        // Store the selected image info
        this.currentRevealImage = selectedImage;
        
        // Apply the image to the quilt
        await this.applyImageToQuilt(this.currentRevealImage);
        
        return this.currentRevealImage;
      }

      async forceLoadFirebaseImage() {
        try {
          const result = await this.loadRandomRevealImage();
          if (result) {
            this.uiService.showToast('✅ Firebase image loaded successfully!');
          } else {
            this.uiService.showToast('❌ Failed to load Firebase image');
          }
        } catch (error) {
          console.error('Error force loading Firebase image:', error);
          this.uiService.showToast('❌ Error loading Firebase image');
        }
      }

      async applyImageToQuilt(imageInfo) {
        // console.log('🖼️ applyImageToQuilt called with:', imageInfo);
        
        if (!imageInfo) {
          console.log('❌ No imageInfo provided');
          return;
        }
        
        if (!imageInfo.url) {
          console.log('❌ No imageInfo.url provided');
          return;
        }
        
        // console.log('🖼️ Image URL type:', typeof imageInfo.url);
        // console.log('🖼️ Image URL value:', imageInfo.url);
        
        console.log('Applying image to quilt:', imageInfo.name);
        
        // Create image pattern for the quilt
        await this.createImagePattern(imageInfo);
        

      }

      async createImagePattern(imageInfo) {
        // console.log('🖼️ Creating image pattern for:', imageInfo.name);
        
        // Create a canvas to load and process the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        return new Promise((resolve, reject) => {
          img.onload = () => {
            console.log('🖼️ Image loaded, dimensions:', img.width, 'x', img.height);
            
            // Get quilt dimensions
            const blocks = this.quiltEngine.blocks;
            if (blocks.length === 0) {
              reject('No blocks in quilt');
              return;
            }
            
            const minX = Math.min(...blocks.map(b => b.x));
            const minY = Math.min(...blocks.map(b => b.y));
            const maxX = Math.max(...blocks.map(b => b.x + b.width));
            const maxY = Math.max(...blocks.map(b => b.y + b.height));
            const quiltWidth = maxX - minX;
            const quiltHeight = maxY - minY;
            
            console.log('🖼️ Quilt dimensions:', quiltWidth, 'x', quiltHeight);
            
            // Scale the image to fit the quilt while maintaining aspect ratio
            const imageAspect = img.width / img.height;
            const quiltAspect = quiltWidth / quiltHeight;
            
            let scaledWidth, scaledHeight, offsetX, offsetY;
            
            if (imageAspect > quiltAspect) {
              // Image is wider than quilt - fit to width
              scaledWidth = quiltWidth;
              scaledHeight = quiltWidth / imageAspect;
              offsetX = 0;
              offsetY = (quiltHeight - scaledHeight) / 2;
            } else {
              // Image is taller than quilt - fit to height
              scaledWidth = quiltHeight * imageAspect;
              scaledHeight = quiltHeight;
              offsetX = (quiltWidth - scaledWidth) / 2;
              offsetY = 0;
            }
            
            // Set canvas size to match quilt dimensions
            canvas.width = quiltWidth;
            canvas.height = quiltHeight;
            
            // Draw the scaled image centered in the quilt area
            ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
            
            // Convert to data URL for SVG pattern
            const imageDataUrl = canvas.toDataURL('image/png');
            
            // Store the processed image data
            this.processedImageData = {
              dataUrl: imageDataUrl,
              quiltWidth: quiltWidth,
              quiltHeight: quiltHeight,
              minX: minX,
              minY: minY,
              imageWidth: scaledWidth,  // Use actual scaled image dimensions
              imageHeight: scaledHeight, // Use actual scaled image dimensions
              offsetX: offsetX,         // Store offset for positioning
              offsetY: offsetY          // Store offset for positioning
            };
            
            console.log('✅ Image pattern created for quilt, data URL length:', imageDataUrl.length);
            resolve();
          };
          
          img.onerror = (error) => {
            console.error('🖼️ Failed to load image:', error);
            reject('Failed to load image');
          };
          
          // Ensure we have a valid URL
          if (!imageInfo.url || typeof imageInfo.url !== 'string') {
            console.error('Invalid image URL:', imageInfo.url);
            reject('Invalid image URL');
            return;
          }
          
          // Handle CORS for Firebase images
          if (imageInfo.url.includes('firebasestorage.googleapis.com')) {
            // console.log('🖼️ Loading Firebase image with CORS handling');
            img.crossOrigin = 'anonymous';
            
            // Try to load with credentials
            img.crossOrigin = 'use-credentials';
            
            // Add error handler for CORS issues
            img.onerror = (error) => {
                      // console.log('🖼️ CORS error loading Firebase image, trying alternative method');
        // console.log('🖼️ Error details:', error);
              
              // Try without crossOrigin as fallback
              img.crossOrigin = null;
              img.src = imageInfo.url;
            };
          } else {
            // console.log('🖼️ Loading local/SVG image');
          }
          
          // console.log('🖼️ Loading image from URL:', imageInfo.url);
          
          // Add timeout for Firebase images to handle CORS issues
          if (imageInfo.url.includes('firebasestorage.googleapis.com')) {
            const timeout = setTimeout(() => {
              // console.log('🖼️ Timeout loading Firebase image, likely CORS issue');
              img.onerror = null; // Remove error handler to prevent double handling
              reject(new Error('Timeout loading Firebase image (CORS issue)'));
            }, 5000); // 5 second timeout
            
            img.onload = () => {
              clearTimeout(timeout);
              resolve();
            };
            
            img.onerror = (error) => {
              clearTimeout(timeout);
              console.log('🖼️ CORS error loading Firebase image, falling back to test image');
              console.log('🖼️ Error details:', error);
              reject(new Error('CORS blocked Firebase image'));
            };
          }
          
          img.src = imageInfo.url;
        });
      }

      createQuiltImagePattern(patternId, imageDataUrl) {
        console.log('🖼️ Creating quilt image pattern:', patternId);
        
        // Remove existing pattern if it exists
        const existingPattern = document.getElementById(patternId);
        if (existingPattern) {
          existingPattern.remove();
        }
        
        // Create new pattern
        const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pattern.setAttribute('id', patternId);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        pattern.setAttribute('x', -this.processedImageData.minX);
        pattern.setAttribute('y', -this.processedImageData.minY);
        pattern.setAttribute('width', this.processedImageData.quiltWidth);
        pattern.setAttribute('height', this.processedImageData.quiltHeight);
        
        // Add image to pattern
        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        image.setAttribute('href', imageDataUrl);
        image.setAttribute('width', this.processedImageData.quiltWidth);
        image.setAttribute('height', this.processedImageData.quiltHeight);
        image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        
        pattern.appendChild(image);
        
        // Add to SVG defs - ensure defs exists
        let defs = document.querySelector('#quilt defs');
        if (!defs) {
          defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          const quilt = document.querySelector('#quilt');
          quilt.insertBefore(defs, quilt.firstChild);
        }
        defs.appendChild(pattern);
        
        console.log('✅ Quilt image pattern created and added to defs:', patternId);
      }

      createBlockImagePattern(patternId, imageDataUrl, x, y, width, height) {
                    console.log('🖼️ Creating pattern:', patternId, 'for block at', x, y, 'size', width, height);
        
        // Remove existing pattern if it exists
        const existingPattern = document.getElementById(patternId);
        if (existingPattern) {
          existingPattern.remove();
        }
        
        // Create new pattern
        const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pattern.setAttribute('id', patternId);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        pattern.setAttribute('x', 0);
        pattern.setAttribute('y', 0);
        pattern.setAttribute('width', width);
        pattern.setAttribute('height', height);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        pattern.setAttribute('patternContentUnits', 'userSpaceOnUse');
        
        // Add image to pattern - positioned to show only the relevant portion
        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        image.setAttribute('href', imageDataUrl);
        image.setAttribute('width', this.processedImageData.imageWidth);
        image.setAttribute('height', this.processedImageData.imageHeight);
        image.setAttribute('x', -x);
        image.setAttribute('y', -y);
        image.setAttribute('preserveAspectRatio', 'none');
        image.setAttribute('style', 'shape-rendering: crispEdges; image-rendering: pixelated;');
        
        pattern.appendChild(image);
        
        // Add to SVG defs - ensure defs exists
        let defs = document.querySelector('#quilt defs');
        if (!defs) {
          defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          const quilt = document.querySelector('#quilt');
          quilt.insertBefore(defs, quilt.firstChild);
        }
        defs.appendChild(pattern);
        
        console.log('✅ Pattern created and added to defs:', patternId);
      }

      createColorPattern(patternId) {
        const quiltSVG = document.getElementById('quilt');
        if (!quiltSVG) {
          console.error('Quilt SVG not found');
          return;
        }
        
        console.log('Creating color pattern for:', patternId);
        
        // Remove existing pattern if it exists
        const existingPattern = quiltSVG.querySelector(`#pattern-${patternId}`);
        if (existingPattern) {
          existingPattern.remove();
          console.log('Removed existing pattern');
        }
        
        // Create defs if it doesn't exist
        let defs = quiltSVG.querySelector('defs');
        if (!defs) {
          defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          quiltSVG.insertBefore(defs, quiltSVG.firstChild);
          console.log('Created defs element');
        }
        
        // Create pattern with a solid color
        const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pattern.setAttribute('id', `pattern-${patternId}`);
        pattern.setAttribute('patternUnits', 'objectBoundingBox');
        pattern.setAttribute('width', '1');
        pattern.setAttribute('height', '1');
        
        // Create a rect with the color
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', '100%');
        rect.setAttribute('height', '100%');
        rect.setAttribute('fill', patternId === 'image1' ? '#ff6b6b' : '#4ecdc4'); // Red or teal
        
        pattern.appendChild(rect);
        defs.appendChild(pattern);
        
        console.log(`Created color pattern: pattern-${patternId}`);
        console.log('Pattern element:', pattern);
      }

      // OLD createImagePattern function removed - using new async version instead

      // Debug function to test admin button - call from console: app.debugAdminButton()
      debugAdminButton() {
        const adminBtn = document.getElementById('floatingAdminBtn');
        console.log('🔧 Admin button debug:', {
          element: adminBtn,
          display: adminBtn ? adminBtn.style.display : 'not found',
          isAdmin: this.isCurrentUserAdmin(),
          hasClickListeners: adminBtn ? adminBtn.onclick : 'no element',
          pointerEvents: adminBtn ? adminBtn.style.pointerEvents : 'no element'
        });
        
        if (adminBtn) {
          // Force re-setup
          this.setupFloatingAdminButton();
          console.log('🔧 Admin button re-setup complete');
        }
      }

      // Check for secret admin access via URL parameter
      checkSecretAdminAccess() {
        const urlParams = new URLSearchParams(window.location.search);
        const secretAdmin = urlParams.get('admin');
        
        if (secretAdmin === 'odqodqodq') {
          localStorage.setItem('ourDailyIsAdmin', 'true');
          this.uiService.showToast('🔧 Admin mode enabled via URL!');
          console.log('🔧 Admin mode enabled via secret URL parameter');
          
          // Remove the parameter from URL without reloading
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        }
      }

      // Setup long-press admin access on top-right corner (away from the bottom
      // footer icon strip and horizontal swipe paths that overlapped the old
      // bottom-right hit target).
      setupFloatingAdminButton() {
        const adminBtn = document.getElementById('floatingAdminBtn');
        if (adminBtn) adminBtn.style.display = 'none';
      }

      setupLongPressAdminAccess() {
        if (globalThis.__ODQ_ADMIN_CORNER_BOUND__) return;
        globalThis.__ODQ_ADMIN_CORNER_BOUND__ = true;

        const app = this;
        const cornerW = 120;
        const cornerH = 120;
        const holdMs = 1800;
        const cornerMoveCancelPx = 48;
        let pressTimer = null;
        let touchCornerStart = null;
        let cornerHoldStartedAt = 0;
        let activeTouchId = null;
        let cornerTapCount = 0;
        let cornerTapResetTimer = 0;
        let adminCornerTriggerLock = false;
        let adminCornerScrollLock = false;

        const readOdqSafeTopPx = () => {
          const rootStyle = getComputedStyle(document.documentElement);
          const parsed = Number.parseFloat(rootStyle.getPropertyValue('--odq-safe-top'));
          if (Number.isFinite(parsed) && parsed >= 0) return parsed;
          if (!globalThis.__ODQ_SAFE_TOP_PROBE__) {
            const probe = document.createElement('div');
            probe.setAttribute('aria-hidden', 'true');
            probe.style.cssText =
              'position:fixed;top:0;left:0;width:0;height:0;padding-top:var(--odq-safe-top);visibility:hidden;pointer-events:none';
            document.documentElement.appendChild(probe);
            globalThis.__ODQ_SAFE_TOP_PROBE__ = probe;
          }
          return Math.max(0, globalThis.__ODQ_SAFE_TOP_PROBE__.getBoundingClientRect().height);
        };

        const isCornerPoint = (clientX, clientY) => {
          const safeTop = readOdqSafeTopPx();
          return (
            clientX >= window.innerWidth - cornerW &&
            clientY >= 0 &&
            clientY <= safeTop + cornerH
          );
        };

        const setAdminCornerScrollLock = (locked) => {
          if (adminCornerScrollLock === locked) return;
          adminCornerScrollLock = locked;
          document.documentElement.classList.toggle('odq-admin-corner-scroll-lock', locked);
        };

        const clearNativeSelection = () => {
          try {
            window.getSelection?.()?.removeAllRanges?.();
          } catch (_) {
            /* ignore */
          }
        };

        const eventStartsInCorner = (e) => {
          const t = e?.changedTouches?.[0] || e?.touches?.[0] || e;
          if (!Number.isFinite(Number(t?.clientX)) || !Number.isFinite(Number(t?.clientY))) return false;
          return isCornerPoint(Number(t.clientX), Number(t.clientY));
        };

        const blockNativeSelectionGesture = (e) => {
          if (!CONFIG.APP.enableAdminTools) return;
          const quiltScreen = document.getElementById('screen-quilt');
          const onQuiltScreen = !!(
            quiltScreen?.classList?.contains('active') &&
            e?.target instanceof Element &&
            quiltScreen.contains(e.target)
          );
          if (!adminCornerScrollLock && !eventStartsInCorner(e) && !onQuiltScreen) return;
          clearNativeSelection();
          if (e?.cancelable) e.preventDefault();
        };

        const clearPressTimer = (keepTouchId = false) => {
          if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
          }
          touchCornerStart = null;
          if (!keepTouchId) {
            activeTouchId = null;
            setAdminCornerScrollLock(false);
          }
        };

        const triggerAdminAccess = (reason = 'hold') => {
          if (adminCornerTriggerLock) return;
          adminCornerTriggerLock = true;
          setTimeout(() => {
            adminCornerTriggerLock = false;
          }, 1200);
          clearPressTimer();
          try {
            localStorage.setItem(
              'odq.lastAdminMenuTap',
              JSON.stringify({ action: 'long-press-corner', reason, at: new Date().toISOString() })
            );
          } catch (_) {
            /* ignore */
          }
          void app.requestAdminAccess();
        };

        const beginCornerHold = (x, y, touchId = null, event = null) => {
          if (!CONFIG.APP.enableAdminTools) return;
          clearPressTimer();
          activeTouchId = touchId;
          touchCornerStart = { x, y };
          cornerHoldStartedAt = Date.now();
          if (touchId != null) {
            setAdminCornerScrollLock(true);
            if (event?.cancelable) event.preventDefault();
          }
          pressTimer = setTimeout(() => triggerAdminAccess('timer'), holdMs);
        };

        const cornerTouchList = (e) => {
          if (e.changedTouches?.length) return e.changedTouches;
          if (e.touches?.length) return e.touches;
          return [];
        };

        const noteCornerTap = () => {
          cornerTapCount += 1;
          clearTimeout(cornerTapResetTimer);
          cornerTapResetTimer = setTimeout(() => {
            cornerTapCount = 0;
          }, 1200);
          if (cornerTapCount < 5) {
            return;
          }
          cornerTapCount = 0;
          triggerAdminAccess('5tap');
        };

        // Invisible hit target keeps iOS long-press from treating quilt-screen text as selectable.
        document.getElementById('admin-corner')?.remove();
        const adminCorner = document.createElement('div');
        adminCorner.id = 'admin-corner';
        adminCorner.setAttribute('aria-hidden', 'true');
        adminCorner.style.cssText = [
          'position:fixed',
          'top:0',
          'right:0',
          `width:${cornerW}px`,
          `height:calc(var(--odq-safe-top, 0px) + ${cornerH}px)`,
          'z-index:100040',
          'background:transparent',
          'opacity:0',
          'pointer-events:auto',
          'touch-action:none',
          '-webkit-user-select:none',
          'user-select:none',
          '-webkit-touch-callout:none'
        ].join(';');
        document.body.appendChild(adminCorner);

        if (!globalThis.__ODQ_ADMIN_CORNER_DOC_MOUSE__) {
          globalThis.__ODQ_ADMIN_CORNER_DOC_MOUSE__ = true;
          document.addEventListener(
            'mousedown',
            (e) => {
              if (!CONFIG.APP.enableAdminTools || e.button !== 0) return;
              // iOS/WKWebView emits synthetic mouse events during touch; don't clobber touch holds.
              if (activeTouchId != null) return;
              if (!isCornerPoint(e.clientX, e.clientY)) return;
              e.preventDefault();
              beginCornerHold(e.clientX, e.clientY);
            },
            { capture: true }
          );
          document.addEventListener(
            'mouseup',
            () => {
              if (activeTouchId != null) return;
              clearPressTimer();
            },
            { capture: true }
          );
          document.addEventListener(
            'mousemove',
            (e) => {
              if (activeTouchId != null) return;
              if (!pressTimer || !touchCornerStart) return;
              const moved = Math.hypot(e.clientX - touchCornerStart.x, e.clientY - touchCornerStart.y);
              if (moved > cornerMoveCancelPx) clearPressTimer();
            },
            { capture: true }
          );
        }

        if (!globalThis.__ODQ_ADMIN_CORNER_DOC_TOUCH__) {
          globalThis.__ODQ_ADMIN_CORNER_DOC_TOUCH__ = true;
          document.addEventListener('selectstart', blockNativeSelectionGesture, { capture: true });
          document.addEventListener('contextmenu', blockNativeSelectionGesture, { capture: true });
          document.addEventListener(
            'selectionchange',
            () => {
              if (adminCornerScrollLock) clearNativeSelection();
            },
            { capture: true }
          );
          document.addEventListener(
            'touchstart',
            (e) => {
              if (!CONFIG.APP.enableAdminTools) return;
              const touches = cornerTouchList(e);
              for (let i = 0; i < touches.length; i += 1) {
                const t = touches[i];
                if (!isCornerPoint(t.clientX, t.clientY)) continue;
                beginCornerHold(t.clientX, t.clientY, t.identifier, e);
                break;
              }
            },
            { capture: true, passive: false }
          );
          document.addEventListener(
            'touchmove',
            (e) => {
              if (!pressTimer || !touchCornerStart || activeTouchId == null) return;
              if (e.cancelable) e.preventDefault();
              for (let i = 0; i < e.touches.length; i += 1) {
                const t = e.touches[i];
                if (t.identifier !== activeTouchId) continue;
                const moved = Math.hypot(t.clientX - touchCornerStart.x, t.clientY - touchCornerStart.y);
                if (moved > cornerMoveCancelPx) clearPressTimer();
                return;
              }
            },
            { capture: true, passive: false }
          );
          document.addEventListener(
            'touchend',
            (e) => {
              for (let i = 0; i < e.changedTouches.length; i += 1) {
                const t = e.changedTouches[i];
                if (t.identifier !== activeTouchId) continue;
                const elapsed = Date.now() - cornerHoldStartedAt;
                if (elapsed >= holdMs - 80) {
                  triggerAdminAccess('touchend-duration');
                } else if (pressTimer) {
                  noteCornerTap();
                  clearPressTimer();
                } else {
                  clearPressTimer();
                }
                break;
              }
            },
            { capture: true, passive: true }
          );
          document.addEventListener(
            'touchcancel',
            (e) => {
              for (let i = 0; i < e.changedTouches.length; i += 1) {
                if (e.changedTouches[i].identifier === activeTouchId) clearPressTimer();
              }
            },
            { capture: true, passive: true }
          );
        }
      }

      // Quote Management Functions
      showQuoteManager() {
        console.log('📝 showQuoteManager called');
        
        // Check if a quote manager modal is already open
        const existingModal = document.querySelector('.quote-manager-modal');
        if (existingModal) {
          console.log('⚠️ Quote manager modal already open, removing existing one');
          existingModal.remove();
        }
        
        // Get next 7 days of quotes
        console.log('📝 Getting next 7 days of quotes...');
        const next7Days = this.getNext7DaysQuotes();
        console.log('📝 Next 7 days data:', next7Days);
        let quotesHTML = '';
        
        next7Days.forEach((dayData, index) => {
          const { date, quote, dayName } = dayData;
          
          // Safety check for undefined quote
          if (!quote || !quote.text || !quote.author) {
            console.warn(`⚠️ Missing quote data for ${dayName} (${date}):`, quote);
            quotesHTML += `
              <div class="quote-day-item" data-index="${dayData.originalIndex}">
                <div class="day-header">
                  <span class="day-name">${dayName}</span>
                  <span class="day-date">${date}</span>
                </div>
                <div class="quote-content">
                  <div class="quote-text">"No quote available"</div>
                  <div class="quote-author">— Unknown</div>
                </div>
                <div class="quote-actions">
                  <button onclick="app.editQuoteForDay(${index})" class="edit-btn">Edit</button>
                  <button onclick="app.skipQuoteForDay(${index})" class="skip-btn">Skip</button>
                  <button onclick="app.deleteQuoteForDay(${index})" class="delete-btn">Delete</button>
                  <button onclick="app.swapWithPrevious(${index})" class="swap-btn" ${index === 0 ? 'disabled' : ''}>↑</button>
                  <button onclick="app.swapWithNext(${index})" class="swap-btn" ${index === 6 ? 'disabled' : ''}>↓</button>
                </div>
              </div>
            `;
          } else {
            quotesHTML += `
              <div class="quote-day-item" data-index="${dayData.originalIndex}">
                <div class="day-header">
                  <span class="day-name">${dayName}</span>
                  <span class="day-date">${date}</span>
                </div>
                <div class="quote-content">
                  <div class="quote-text">"${quote.text}"</div>
                  <div class="quote-author">— ${quote.author}</div>
                </div>
                <div class="quote-actions">
                  <button onclick="app.editQuoteForDay(${index})" class="edit-btn">Edit</button>
                  <button onclick="app.skipQuoteForDay(${index})" class="skip-btn">Skip</button>
                  <button onclick="app.deleteQuoteForDay(${index})" class="delete-btn">Delete</button>
                  <button onclick="app.swapWithPrevious(${index})" class="swap-btn" ${index === 0 ? 'disabled' : ''}>↑</button>
                  <button onclick="app.swapWithNext(${index})" class="swap-btn" ${index === 6 ? 'disabled' : ''}>↓</button>
                </div>
              </div>
            `;
          }
        });
        
        const modal = document.createElement('div');
        modal.className = 'quote-manager-modal';
        modal.innerHTML = `
          <div class="quote-manager-content">
            <h3>Next 7 Days Quotes</h3>
            <div class="quote-list">
              ${quotesHTML}
            </div>
            <div class="quote-manager-actions">
              <button onclick="app.saveQuotesToFirestore()" class="save-btn">Save Changes</button>
              <button onclick="this.parentElement.parentElement.parentElement.remove()" class="close-btn">Close</button>
            </div>
          </div>
        `;
        
        modal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.8);
          z-index: 1002;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        `;
        
        const content = modal.querySelector('.quote-manager-content');
        content.style.cssText = `
          background: white;
          border-radius: 8px;
          padding: 20px;
          max-width: 600px;
          max-height: 80vh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
          overscroll-behavior-y: contain;
          width: 100%;
        `;
        
        document.body.appendChild(modal);
        console.log('📝 Quote manager modal created and appended to body');
        
        // Add CSS for quote items
        const style = document.createElement('style');
        style.textContent = `
          .quote-day-item {
            border: 1px solid #ddd;
            margin: 15px 0;
            padding: 15px;
            border-radius: 8px;
            background: #f9f9f9;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .day-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid #eee;
          }
          .day-name {
            font-weight: bold;
            color: #333;
            font-size: 16px;
          }
          .day-date {
            color: #666;
            font-size: 14px;
            background: #e0e0e0;
            padding: 2px 8px;
            border-radius: 12px;
          }
          .quote-content {
            margin-bottom: 10px;
          }
          .quote-text {
            font-style: italic;
            margin-bottom: 5px;
            font-size: 14px;
            line-height: 1.4;
          }
          .quote-author {
            font-weight: bold;
            color: #666;
            font-size: 12px;
          }
          .quote-actions {
            display: flex;
            gap: 5px;
            justify-content: flex-end;
          }
          .quote-actions button {
            padding: 4px 8px;
            font-size: 11px;
            border: 1px solid #ccc;
            background: white;
            cursor: pointer;
            border-radius: 3px;
            transition: all 0.2s;
          }
          .quote-actions button:hover {
            background: #f0f0f0;
            transform: translateY(-1px);
          }
          .quote-actions button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
          }
          .edit-btn { color: #0066cc; }
          .skip-btn { color: #ff8800; }
          .delete-btn { color: #cc0000; }
          .swap-btn { color: #666; }
          .save-btn { background: #2196F3; color: white; padding: 8px 16px; }
          .close-btn { background: #666; color: white; padding: 8px 16px; }
          .quote-manager-actions {
            margin-top: 20px;
            display: flex;
            gap: 10px;
            justify-content: center;
          }
          .subtitle {
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
            text-align: center;
          }
        `;
        document.head.appendChild(style);
      }

      editQuote(index) {
        const quote = this.quoteService.quotes[index];
        const newText = prompt('Edit quote text:', quote.text);
        if (newText !== null) {
          const newAuthor = prompt('Edit author:', quote.author.replace('— ', ''));
          if (newAuthor !== null) {
            this.quoteService.quotes[index] = {
              text: newText,
              author: newAuthor.startsWith('— ') ? newAuthor : `— ${newAuthor}`
            };
            this.uiService.showToast(`Quote updated`);
            this.showQuoteManager(); // Refresh the manager
          }
        }
      }

      // Edit quote for a specific day (used by the 7-day manager)
      editQuoteForDay(dayIndex) {
        const next7Days = this.getNext7DaysQuotes();
        const dayData = next7Days[dayIndex];
        const quote = dayData.quote;
        
        const newText = prompt('Edit quote text:', quote.text);
        if (newText !== null) {
          const newAuthor = prompt('Edit author:', quote.author.replace('— ', ''));
          if (newAuthor !== null) {
            // Update the quote in the quotes array using the original index
            this.quoteService.quotes[dayData.originalIndex] = {
              text: newText,
              author: newAuthor.startsWith('— ') ? newAuthor : `— ${newAuthor}`
            };
            
            this.uiService.showToast(`Quote for ${dayData.dayName} updated`);
            // Don't refresh immediately - let user save first
          }
        }
      }

      async removeQuote(index) {
        if (confirm(`Are you sure you want to remove this quote?\n\n"${this.quoteService.quotes[index].text}"\n— ${this.quoteService.quotes[index].author}`)) {
          this.quoteService.quotes.splice(index, 1);
          
          // Regenerate shuffled indexes to ensure they're valid for the new quotes array
          await this.quoteService.regenerateShuffledIndexes();
          this.quoteService.invalidatePinnedAssignments();
          await this.quoteService.primeQuoteAssignmentsNearTerm();
          
          this.uiService.showToast(`Quote ${index + 1} removed`);
          this.showQuoteManager(); // Refresh the manager
        }
      }

      moveQuoteUp(index) {
        if (index > 0) {
          const temp = this.quoteService.quotes[index];
          this.quoteService.quotes[index] = this.quoteService.quotes[index - 1];
          this.quoteService.quotes[index - 1] = temp;
          this.uiService.showToast(`Quote moved up`);
          this.showQuoteManager(); // Refresh the manager
        }
      }

      moveQuoteDown(index) {
        if (index < this.quoteService.quotes.length - 1) {
          const temp = this.quoteService.quotes[index];
          this.quoteService.quotes[index] = this.quoteService.quotes[index + 1];
          this.quoteService.quotes[index + 1] = temp;
          this.uiService.showToast(`Quote moved down`);
          this.showQuoteManager(); // Refresh the manager
        }
      }

      replaceQuote(index) {
        const currentQuote = this.quoteService.quotes[index];
        const newText = prompt('Enter new quote text:', currentQuote.text);
        if (newText !== null) {
          const newAuthor = prompt('Enter new author:', currentQuote.author.replace('— ', ''));
          if (newAuthor !== null) {
            this.quoteService.quotes[index] = {
              text: newText,
              author: newAuthor.startsWith('— ') ? newAuthor : `— ${newAuthor}`
            };
            this.uiService.showToast(`Quote replaced`);
            this.showQuoteManager(); // Refresh the manager
          }
        }
      }

      // Delete quote for a specific day (used by the 7-day manager)
      async deleteQuoteForDay(dayIndex) {
        const next7Days = this.getNext7DaysQuotes();
        const dayData = next7Days[dayIndex];
        const quote = dayData.quote;
        
        console.log(`🗑️ Delete request for dayIndex ${dayIndex}:`, {
          dayName: dayData.dayName,
          quote: quote,
          originalIndex: dayData.originalIndex
        });
        
        if (confirm(`Are you sure you want to delete this quote?\n\n"${quote.text}"\n${quote.author}\n\nThis will remove it from the rotation and another quote will automatically appear for ${dayData.dayName}.`)) {
          // Remove the quote from the quotes array
          this.quoteService.quotes.splice(dayData.originalIndex, 1);
          
          // Regenerate shuffled indexes to ensure they're valid for the new quotes array
          await this.quoteService.regenerateShuffledIndexes();
          this.quoteService.invalidatePinnedAssignments();
          await this.quoteService.primeQuoteAssignmentsNearTerm();
          
          // If we deleted today's quote, refresh the quote display on the quilt screen
          if (dayData.dayName === 'Today') {
            this.quoteService.displayQuote();
          }
          
          this.uiService.showToast(`Quote deleted. New quote will appear for ${dayData.dayName}.`);
          this.showQuoteManager(); // Refresh the manager
        }
      }

      // Skip quote for a specific day (keeps quote in array but assigns new one for that day)
      async skipQuoteForDay(dayIndex) {
        const next7Days = this.getNext7DaysQuotes();
        const dayData = next7Days[dayIndex];
        const quote = dayData.quote;
        
        console.log(`⏭️ Skip request for dayIndex ${dayIndex}:`, {
          dayName: dayData.dayName,
          quote: quote,
          originalIndex: dayData.originalIndex
        });
        
        if (confirm(`Are you sure you want to skip this quote for ${dayData.dayName}?\n\n"${quote.text}"\n${quote.author}\n\nThis will keep the quote in your collection but assign a different quote for ${dayData.dayName}.`)) {
          const dateKey = this.quoteService.getQuoteCalendarKeyUtc7FromAdjustedToday(dayData.dayIndex);
          const dayIndexForShuffled = QuoteService._dayIndexFromCalendarKey(dateKey);

          let newQuote = dayData.quote;
          let tries = 0;
          while (tries < 80 && this.quoteService.quotes.length > 1) {
            const ni = Math.floor(Math.random() * this.quoteService.quotes.length);
            const cand = this.quoteService.quotes[ni];
            tries++;
            const same =
              cand === dayData.quote ||
              (cand.sourceId &&
                dayData.quote.sourceId &&
                String(cand.sourceId) === String(dayData.quote.sourceId)) ||
              (String(cand.text) === String(dayData.quote.text) && String(cand.author) === String(dayData.quote.author));
            if (!same) {
              newQuote = cand;
              break;
            }
          }

          await this.quoteService.setPinnedQuoteForCalendarKey(dateKey, newQuote);
          const newQuoteIndex = this.quoteService.quotes.indexOf(newQuote);
          if (newQuoteIndex >= 0) {
            this.quoteService.shuffledIndexes[dayIndexForShuffled % this.quoteService.shuffledIndexes.length] = newQuoteIndex;
          }
          await this.quoteService.saveShuffledIndexes();
          
          // If we skipped today's quote, refresh the quote display on the quilt screen
          if (dayData.dayName === 'Today') {
            this.quoteService.displayQuote();
          }
          
          this.uiService.showToast(`Quote skipped for ${dayData.dayName}. New quote assigned.`);
          this.showQuoteManager(); // Refresh the manager
        }
      }

      async swapWithPrevious(dayIndex) {
        if (dayIndex <= 0) return; // Can't swap the first day
        
        const next7Days = this.getNext7DaysQuotes();
        const currentDay = next7Days[dayIndex];
        const previousDay = next7Days[dayIndex - 1];

        const keyCurr = this.quoteService.getQuoteCalendarKeyUtc7FromAdjustedToday(currentDay.dayIndex);
        const keyPrev = this.quoteService.getQuoteCalendarKeyUtc7FromAdjustedToday(previousDay.dayIndex);
        const qCurr = currentDay.quote;
        const qPrev = previousDay.quote;

        await this.quoteService.setPinnedQuoteForCalendarKey(keyCurr, qPrev);
        await this.quoteService.setPinnedQuoteForCalendarKey(keyPrev, qCurr);

        const currentDayIndex = QuoteService._dayIndexFromCalendarKey(keyCurr);
        const previousDayIndex = QuoteService._dayIndexFromCalendarKey(keyPrev);
        const tempIndex = this.quoteService.shuffledIndexes[currentDayIndex % this.quoteService.shuffledIndexes.length];
        this.quoteService.shuffledIndexes[currentDayIndex % this.quoteService.shuffledIndexes.length] =
          this.quoteService.shuffledIndexes[previousDayIndex % this.quoteService.shuffledIndexes.length];
        this.quoteService.shuffledIndexes[previousDayIndex % this.quoteService.shuffledIndexes.length] = tempIndex;

        await this.quoteService.saveShuffledIndexes();
        
        this.uiService.showToast(`Swapped quotes for ${previousDay.dayName} and ${currentDay.dayName}`);
        
        // If we swapped today's quote, refresh the quote display on the quilt screen
        if (currentDay.dayName === 'Today' || previousDay.dayName === 'Today') {
          this.quoteService.displayQuote();
        }
        
        this.showQuoteManager(); // Refresh the manager
      }

      async swapWithNext(dayIndex) {
        if (dayIndex >= 6) return; // Can't swap the last day
        
        const next7Days = this.getNext7DaysQuotes();
        const currentDay = next7Days[dayIndex];
        const nextDay = next7Days[dayIndex + 1];

        const keyCurr = this.quoteService.getQuoteCalendarKeyUtc7FromAdjustedToday(currentDay.dayIndex);
        const keyNext = this.quoteService.getQuoteCalendarKeyUtc7FromAdjustedToday(nextDay.dayIndex);
        const qCurr = currentDay.quote;
        const qNext = nextDay.quote;

        await this.quoteService.setPinnedQuoteForCalendarKey(keyCurr, qNext);
        await this.quoteService.setPinnedQuoteForCalendarKey(keyNext, qCurr);

        const currentDayIndex = QuoteService._dayIndexFromCalendarKey(keyCurr);
        const nextDayIndex = QuoteService._dayIndexFromCalendarKey(keyNext);
        const tempIndex = this.quoteService.shuffledIndexes[currentDayIndex % this.quoteService.shuffledIndexes.length];
        this.quoteService.shuffledIndexes[currentDayIndex % this.quoteService.shuffledIndexes.length] =
          this.quoteService.shuffledIndexes[nextDayIndex % this.quoteService.shuffledIndexes.length];
        this.quoteService.shuffledIndexes[nextDayIndex % this.quoteService.shuffledIndexes.length] = tempIndex;

        await this.quoteService.saveShuffledIndexes();
        
        this.uiService.showToast(`Swapped quotes for ${currentDay.dayName} and ${nextDay.dayName}`);
        
        // If we swapped today's quote, refresh the quote display on the quilt screen
        if (currentDay.dayName === 'Today' || nextDay.dayName === 'Today') {
          this.quoteService.displayQuote();
        }
        
        this.showQuoteManager(); // Refresh the manager
      }

      addNewQuote() {
        const text = prompt('Enter new quote text:');
        if (text) {
          const author = prompt('Enter author:');
          if (author) {
            this.quoteService.quotes.push({
              text: text,
              author: author.startsWith('— ') ? author : `— ${author}`
            });
            this.uiService.showToast('New quote added');
            this.showQuoteManager(); // Refresh the manager
          }
        }
      }

      async saveQuotesToFirestore() {
        try {
          console.log('💾 Starting save to Firestore...');
          console.log('💾 QuoteService Firebase available:', !!this.quoteService.firebase);
          console.log('💾 Global Firebase available:', !!window.firebaseApp);
          console.log('💾 Quotes to save:', this.quoteService.quotes.length);
          
          // Show loading state
          this.uiService.showToast('Saving quotes to database...');
          
          // Use QuoteService Firebase or fallback to global Firebase
          const firebaseInstance = this.quoteService.firebase || window.firebaseApp;
          if (!firebaseInstance) {
            throw new Error('No Firebase instance available');
          }
          
          // Use the global Firestore functions
          if (!window.db) {
            throw new Error('Firestore database not available');
          }
          
          // Save to Firestore using the global functions
          await window.firestore.setDoc(window.firestore.doc(window.db, 'quotes', 'daily'), {
            quotes: this.quoteService.quotes,
            shuffledIndexes: this.quoteService.shuffledIndexes,
            updatedAt: new Date(),
            updatedBy: this.currentUserId
          });
          
          this.uiService.showToast('✅ Quotes saved to database! All users will see changes.');
          console.log('💾 Quotes saved to Firestore:', this.quoteService.quotes.length, 'quotes');
          
          // Close the quote admin panel by removing all modals
          const modals = document.querySelectorAll('.quote-manager-modal');
          modals.forEach(modal => modal.remove());
          console.log(`🗑️ Removed ${modals.length} quote manager modals`);
          
        } catch (error) {
          console.error('❌ Error saving quotes to Firestore:', error);
          this.uiService.showToast('❌ Error saving quotes to database');
          
          // Fallback to localStorage
          try {
            localStorage.setItem('ourDailyQuotes', JSON.stringify(this.quoteService.quotes));
            this.uiService.showToast('⚠️ Saved to localStorage as fallback');
            console.log('💾 Saved to localStorage as fallback');
          } catch (localError) {
            console.error('Error saving to localStorage:', localError);
          }
        }
      }

      showTodayQuote() {
        const todayQuote = this.quoteService.getTodayQuote();
        alert(`Today's Quote:\n\n"${todayQuote.text}"\n${todayQuote.author}`);
      }

      // Get today and next 7 days of quotes (8 days total)
      getNext7DaysQuotes() {
        const next7Days = [];
        const now = new Date();
        
        // Use the same date calculation logic as getTodayQuote() for consistency
        const utcHours = now.getUTCHours();
        const adjustedToday = new Date(now);
        if (utcHours < 7) {
          // Before 7 AM UTC, use yesterday's date
          adjustedToday.setUTCDate(adjustedToday.getUTCDate() - 1);
        }
        
        console.log(`🔍 getNext7DaysQuotes - Raw Today: ${now.toDateString()}, Adjusted Today: ${adjustedToday.toDateString()}`);
        console.log(`🔍 Current quotes array length: ${this.quoteService.quotes.length}`);
        
        for (let i = 0; i <= 7; i++) { // Start from today (i=0) to include today's quote
          const futureDate = new Date(adjustedToday);
          futureDate.setDate(adjustedToday.getDate() + i);
          
          const year = futureDate.getFullYear();
          const month = String(futureDate.getMonth() + 1).padStart(2, '0');
          const day = String(futureDate.getDate()).padStart(2, '0');
          const dateString = `${year}-${month}-${day}`;
          
          console.log(`🔍 Day ${i}: ${futureDate.toDateString()} → ${dateString}`);
          
          const dateKeyUtc = this.quoteService.getQuoteCalendarKeyUtc7FromAdjustedToday(i);
          const pinned = this.quoteService._pinnedByDateKey[dateKeyUtc];

          const dayIndex = Math.floor(futureDate.getTime() / (1000 * 60 * 60 * 24));
          const quoteIndex = this.quoteService.shuffledIndexes[dayIndex % this.quoteService.shuffledIndexes.length];
          
          let finalQuoteIndex = quoteIndex;
          if (quoteIndex >= this.quoteService.quotes.length) {
            console.warn(`⚠️ QuoteIndex ${quoteIndex} out of bounds for ${this.quoteService.quotes.length} quotes. Using fallback index.`);
            finalQuoteIndex = quoteIndex % this.quoteService.quotes.length;
            console.log(`🔍 Day ${i}: dayIndex=${dayIndex}, quoteIndex=${finalQuoteIndex} (fallback), quotes.length=${this.quoteService.quotes.length}, shuffledIndexes.length=${this.quoteService.shuffledIndexes.length}`);
          } else {
            console.log(`🔍 Day ${i}: dayIndex=${dayIndex}, quoteIndex=${quoteIndex}, quotes.length=${this.quoteService.quotes.length}, shuffledIndexes.length=${this.quoteService.shuffledIndexes.length}`);
          }
          
          const quote = pinned || this.quoteService.quotes[finalQuoteIndex];
          const originalIndex = pinned
            ? this.quoteService.quotes.findIndex((q) => q === pinned || (q.sourceId && pinned.sourceId && q.sourceId === pinned.sourceId))
            : finalQuoteIndex;
          console.log(`🔍 Day ${i}: final quote=`, quote);
          
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const dayName = i === 0 ? 'Today' : dayNames[futureDate.getDay()];
          
          next7Days.push({
            date: `${month}/${day}`,
            dayName: dayName,
            quote: quote,
            originalIndex: originalIndex >= 0 ? originalIndex : finalQuoteIndex,
            dayIndex: i // Use the loop index (1-7) instead of the absolute day index
          });
        }
        
        return next7Days;
      }

      // Reset quotes to defaults
      async resetQuotesToDefaults() {
        if (confirm('Are you sure you want to reset all quotes to the original defaults? This will remove all custom quotes.')) {
          // Reset to original quotes array
          this.quoteService.quotes = [
            { text: "Art washes away from the soul the dust of everyday life.", author: "— Pablo Picasso" },
            { text: "Creativity takes courage.", author: "— Henri Matisse" },
            { text: "Every artist was first an amateur.", author: "— Ralph Waldo Emerson" },
            { text: "Color is the keyboard, the eyes are the harmonies, the soul is the piano with many strings.", author: "— Wassily Kandinsky" },
            { text: "Great things are done by a series of small things brought together.", author: "— Vincent Van Gogh" },
            { text: "You can't use up creativity. The more you use, the more you have.", author: "Maya Angelou" },
            { text: "Every time I have had a problem, I have confronted it with the ax of art.", author: "Yayoi Kusama" },
            { text: "I found I could say things with color and shapes that I couldn't say any other way – things I had no words for.", author: "Georgia O'Keeffe" },
            { text: "I love creation more than life, and I must express myself before disappearing.", author: "Sonia Delaunay" },
            { text: "The job of the artist is always to deepen the mystery.", author: "Francis Bacon" },
            { text: "The most important relationship in your life is the relationship you have with yourself.", author: "Diane von Furstenberg" },
            { text: "There is a vitality, a life force, an energy, a quickening that is translated through you into action, and because there is only one of you in all time, this expression is unique.", author: "Martha Graham" },
            { text: "If there is a book that you want to read, but it hasn't been written yet, you must be the one to write it.", author: "Toni Morrison" },
            { text: "Creativity doesn't wait for that perfect moment. It fashions its own perfect moments out of ordinary ones.", author: "Elizabeth Gilbert" },
            { text: "I think, at a child's birth, if a mother could ask a fairy godmother to endow it with the most useful gift, that gift would be curiosity.", author: "Eleanor Roosevelt" },
            { text: "Imagination is more important than knowledge. Knowledge is limited. Imagination encircles the world.", author: "Albert Einstein" },
            { text: "The beauty of a living thing is not the atoms that go into it, but the way those atoms are put together.", author: "Carl Sagan" },
            { text: "Let your curiosity be greater than your fear.", author: "Pema Chödrön" },
            { text: "Study hard what interests you the most in the most undisciplined, irreverent and original manner possible.", author: "Richard Feynman" },
            { text: "Research is formalized curiosity. It is poking and prying with a purpose.", author: "Zora Neale Hurston" },
            { text: "It is always with excitement that I wake up in the morning wondering what my intuition will toss up to me, like gifts from the sea.", author: "Jonas Salk" },
            { text: "The only thing that makes life possible is permanent, intolerable uncertainty; not knowing what comes next.", author: "Ursula K. Le Guin" },
            { text: "Curiosity is the engine of achievement.", author: "Sir Ken Robinson" },
            { text: "Let the beauty of what you love be what you do. There are a thousand ways to kneel and kiss the earth.", author: "Rumi" },
            { text: "I'm very interested in, 'What does it mean for us to cultivate together?' Community that allows for risk, the risk of knowing someone outside your own boundaries, the risk that is love.", author: "bell hooks" },
            { text: "A nation's culture resides in the hearts and in the soul of its people.", author: "Mahatma Gandhi" },
            { text: "Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.", author: "Antoine de Saint-Exupéry" },
            { text: "The butterfly counts not months but moments, and has time enough.", author: "Rabindranath Tagore" },
            { text: "To fly, we have to have resistance.", author: "Maya Lin" },
            { text: "Not everything that is faced can be changed, but nothing can be changed until it is faced.", author: "James Baldwin" },
            { text: "There's nothing new under the sun, but there are new suns.", author: "Octavia Butler" },
            { text: "Never doubt that a small group of thoughtful, committed citizens can change the world; indeed, it's the only thing that ever has.", author: "Margaret Mead" },
            { text: "There is no such thing as a single-issue struggle because we do not live single-issue lives.", author: "Audre Lorde" },
            { text: "Every moment is an organizing opportunity, every person a potential activist, every minute a chance to change the world.", author: "Dolores Huerta" },
            { text: "We don't have to engage in grand, heroic actions to participate in the process of change. Small acts, when multiplied by millions of people, can transform the world.", author: "Howard Zinn" },
            { text: "When the whole world is silent, even one voice becomes powerful.", author: "Malala Yousafzai" },
            { text: "Activism is my rent for living on the planet.", author: "Alice Walker" },
            { text: "We are the leaders we've been waiting for.", author: "Grace Lee Boggs" },
            { text: "Do your little bit of good where you are; it's those little bits of good put together that overwhelm the world.", author: "Desmond Tutu" },
            { text: "What you do makes a difference, and you have to decide what kind of difference you want to make.", author: "Jane Goodall" },
            { text: "You never change things by fighting the existing reality. To change something, build a new model that makes the existing model obsolete.", author: "Buckminster Fuller" },
            { text: "Like what you do, and then you will do your best.", author: "Katherine Johnson" },
            { text: "The present is theirs; the future, for which I really worked, is mine.", author: "Nikola Tesla" },
            { text: "Cities have the capability of providing something for everybody, only because, and only when, they are created by everybody.", author: "Jane Jacobs" },
            { text: "In every outthrust headland, in every curving beach, in every grain of sand there is the story of the earth.", author: "Rachel Carson" },
            { text: "What the people want is very simple - they want an America as good as its promise.", author: "Barbara Jordan" },
            { text: "In nature's economy the currency is not money, it is life.", author: "Vandana Shiva" },
            { text: "When we plant trees, we plant the seeds of peace and seeds of hope.", author: "Wangari Maathai" },
            { text: "No one is born fully-formed: it is through self-experience in the world that we become what we are.", author: "Paulo Freire" },
            { text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
            { text: "Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying 'I will try again tomorrow.'", author: "Mary Anne Radmacher" },
            { text: "I fight pain, anxiety, and fear every day, and the only method I have found that relieves my illness is to keep creating art.", author: "Yayoi Kusama" },
            { text: "To heal is to touch with love that which we previously touched with fear.", author: "Stephen Levine" },
            { text: "I am better off healed than I ever was unbroken.", author: "Beth Moore" },
            { text: "Everything can be taken from a man but one thing: the last of the human freedoms—to choose one's attitude in any given set of circumstances.", author: "Viktor Frankl" },
            { text: "The purpose of life is not to be happy. It is to be useful, to be honorable, to be compassionate, to have it make some difference that you have lived and lived well.", author: "Ralph Waldo Emerson" },
            { text: "Let yourself be silently drawn by the strange pull of what you really love. It will not lead you astray.", author: "Rumi" },
            { text: "Follow your bliss and the universe will open doors where there were only walls.", author: "Joseph Campbell" },
            { text: "A musician must make music, an artist must paint, a poet must write, if he is to be ultimately happy. What a man can be, he must be.", author: "Abraham Maslow" },
            { text: "At every moment you choose yourself. But do you choose your self? Body and soul contain a thousand possibilities out of which you can build many I's.", author: "Dag Hammarskjöld" },
            { text: "We are the myths we tell ourselves about ourselves.", author: "Jean Houston" },
            { text: "A vocation is not a career that you choose for yourself. A vocation is a calling that you discover by listening to the voice of vocation within you.", author: "Parker Palmer" },
            { text: "Attention is the rarest and purest form of generosity.", author: "Simone Weil" },
            { text: "Waking up this morning, I smile. Twenty-four brand new hours are before me. I vow to live fully in each moment.", author: "Thích Nhất Hạnh" },
            { text: "The privilege of a lifetime is to become who you truly are.", author: "Carl Jung" },
            { text: "I define connection as the energy that exists between people when they feel seen, heard, and valued; when they can give and receive without judgment.", author: "Brené Brown" },
            { text: "Perhaps the secret of living well is not in having all the answers but in pursuing unanswerable questions in good company.", author: "Rachel Naomi Remen" },
            { text: "All real living is meeting.", author: "Martin Buber" },
            { text: "We humans are social beings. We come into the world as the result of others' actions. We survive here in dependence on others.", author: "The Dalai Lama" },
            { text: "Sometimes people try to destroy you, precisely because they recognize your power.", author: "bell hooks" },
            { text: "When you understand that being connected to others is one of life's greatest joys, you realize that life's best comes when you initiate and invest in solid relationships.", author: "John C. Maxwell" },
            { text: "Healing yourself is connected with healing others.", author: "Yoko Ono" },
            { text: "Relationships are all there is. Everything in the universe only exists because it is in relationship to everything else.", author: "Margaret J. Wheatley" },
            { text: "When you take one step to reach out to people, when you meet with others and share their thoughts and sufferings, infinite compassion and wisdom well up within your heart.", author: "Daisaku Ikeda" },
            { text: "We now accept the fact that learning is a lifelong process of keeping abreast of change. And the most pressing task is to teach people how to learn.", author: "Peter Drucker" },
            { text: "The illiterate of the 21st century will not be those who cannot read and write, but those who cannot learn, unlearn, and relearn.", author: "Alvin Toffler" },
            { text: "Those people who develop the ability to continuously acquire new and better forms of knowledge that they can apply to their work and to their lives will be the movers and shakers in our society for the indefinite future.", author: "Brian Tracy" },
            { text: "The purpose of learning is growth, and our minds, unlike our bodies, can continue growing as we continue to live.", author: "Mortimer Adler" },
            { text: "The good thing about science is that it's true whether or not you believe in it. But the great thing about learning is that it makes you more capable of reducing the suffering of others.", author: "Neil deGrasse Tyson" },
            { text: "I have learned that each and every piece of cloth embodies the spirit, skill, and personal history of an individual weaver… It ties together with an endless thread the emotional life of my people.", author: "Nilda Callañaupa Alvarez" },
            { text: "I wanted to tell my story through fabric because it was a medium that was accessible to me as a woman and as an African American.", author: "Faith Ringgold" },
            { text: "Come stitch next to me, and I'll tell you a story.", author: "Sonya Clark" },
            { text: "Fabric is a material that forgives. You can always mend, patch, darn, and transform it into something new.", author: "Louise Bourgeois" },
            { text: "We must learn inner solitude wherever or with whomsoever we may be. We must learn to penetrate things and find God in them.", author: "Anni Albers" },
            { text: "Thread has the potential to unite, to heal, to provide a soft structure in a hard world.", author: "Sheila Hicks" },
            { text: "The loom is the universe in miniature—warp and weft, the essential crossing that creates all structure, all meaning.", author: "Lenore Tawney" },
            { text: "Western art tradition values fine art practices such as painting, mostly done by men and on canvas. Bringing these techniques into the gallery space allows me to question the hierarchy in the Western art world.", author: "Hale Ekinci" },
            { text: "The true measure of our commitment to justice, the character of our society, our commitment to the rule of law, fairness, and equality cannot be measured by how we treat the rich, the powerful, the privileged, and the respected among us.", author: "Bryan Stevenson" },
            { text: "We cannot seek achievement for ourselves and forget about the progress and prosperity for our community.", author: "Dolores Huerta" },
            { text: "If you see something that is not right, not fair, not just, you have a moral obligation to do something about it.", author: "John Lewis" },
            { text: "Trauma happens in relationship, so does healing.", author: "Tarana Burke" },
            { text: "Real change requires real relationships. And real relationships require that we tell the truth about our experiences.", author: "Alicia Garza" },
            { text: "Care is the strategy. Care is what we need more of in this world. Care is revolutionary.", author: "Ai-jen Poo" },
            { text: "We accomplish nothing if we say nothing. We accomplish nothing if we do nothing. And we accomplish nothing if we know nothing.", author: "Stacey Abrams" }
          ];
          
          // Save to Firestore
          await this.saveQuotesToFirestore();
          this.quoteService.invalidatePinnedAssignments();
          await this.quoteService.primeQuoteAssignmentsNearTerm();
          this.quoteService.displayQuote();
          this.uiService.showToast('✅ Quotes reset to defaults and saved to database');
        }
      }

      showRevealImageManager() {
        const menu = document.createElement('div');
        menu.className = 'reveal-image-manager';
        menu.innerHTML = `
          <div class="reveal-image-manager-content">
            <h3 style="margin: 0 0 15px 0; text-align: center;">Quilt Reveal Image Manager</h3>
            <div class="image-upload-section">
              <h4 style="margin: 0 0 8px 0;">Upload New Reveal Image</h4>
              <p style="font-size: 12px; color: #666; margin: 5px 0 10px 0;">Images will be automatically resized to 412 x 800 pixels</p>
              <input type="file" id="revealImageUpload" accept="image/*" style="margin: 0 0 10px 0; width: 100%;">
              <button onclick="app.handleUploadRevealImage()">Upload Image</button>
            </div>
            <div class="image-selection-section">
              <h4 style="margin: 15px 0 8px 0;">Select Active Reveal Image</h4>
              <div id="revealImageOptions">
                <p>Loading available images...</p>
              </div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()">Close</button>
          </div>
        `;
        
        menu.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          border: 2px solid #000;
          border-radius: 8px;
          padding: 20px;
          z-index: 1001;
          box-shadow: 0 8px 16px rgba(0,0,0,0.3);
          min-width: 300px;
          max-height: 80vh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
          overscroll-behavior-y: contain;
        `;
        
        const content = menu.querySelector('.reveal-image-manager-content');
        content.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 8px;
        `;
        
        const buttons = menu.querySelectorAll('button');
        buttons.forEach(btn => {
          btn.style.cssText = `
            padding: 8px 16px;
            border: 1px solid #000;
            background: #fff;
            cursor: pointer;
            font-size: 14px;
            border-radius: 4px;
          `;
        });
        
        menu.addEventListener('click', (e) => {
          if (e.target === menu) {
            menu.remove();
          }
        });
        
        document.body.appendChild(menu);
        
        // Load available images
        this.loadRevealImageOptions();
      }

      closeAdminMenu() {
        document.querySelectorAll('.admin-menu').forEach((el) => el.remove());
      }

      showAdminMenu() {
        // Prevent stacked panels: each open used to append another .admin-menu. A later save disables
        // buttons on ALL panels; closing the top one leaves older panels with disabled buttons forever.
        document.querySelectorAll('.admin-menu').forEach((el) => el.remove());

        let adminTapDebugLine = '';
        try {
          const lastTap = JSON.parse(localStorage.getItem('odq.lastAdminMenuTap') || 'null');
          if (lastTap?.action) {
            adminTapDebugLine = `<br><span style="font-size:11px;font-weight:normal;">Last admin tap: ${String(lastTap.action)} @ ${String(lastTap.at || '').slice(11, 19)}</span>`;
          }
          const ring = JSON.parse(localStorage.getItem('odq.debugRing') || '[]');
          const lastLog = ring[ring.length - 1];
          if (lastLog?.location) {
            adminTapDebugLine += `<br><span style="font-size:11px;font-weight:normal;">Last log: ${String(lastLog.location)} ${String(lastLog.message || '').slice(0, 40)}</span>`;
          }
        } catch (_) {
          /* ignore */
        }

        const menu = document.createElement('div');
        menu.className = 'admin-menu';
        
/** Dot suffix on the story speaker button when a non-AUTO cutout preset is saved for today. */
        const speakerCutoutPresetDot = (() => {
          try {
            const todayKey = Utils.getTodayKey();
            const storyTweak = odqReadSpeakerCutoutTweakFromLocal(todayKey, 'story');
            const postTweak = odqReadSpeakerCutoutTweakFromLocal(todayKey, 'post');
            const customized =
              (storyTweak.preset && storyTweak.preset !== 'AUTO') ||
              (postTweak.preset && postTweak.preset !== 'AUTO') ||
              storyTweak.nudgeCx ||
              storyTweak.nudgeCy ||
              storyTweak.nudgeRotateDeg ||
              postTweak.nudgeCx ||
              postTweak.nudgeCy ||
              postTweak.nudgeRotateDeg;
            return customized ? ' •' : '';
          } catch (_) {
            return '';
          }
        })();

        menu.innerHTML = `
          <div class="admin-menu-content">
            <div class="admin-menu-quick-actions">
              <button type="button" onclick="document.querySelectorAll('.admin-menu').forEach(el=>el.remove());app.handleNameTodaysQuilt()">✏️ Name today&rsquo;s quilt</button>
              <button type="button" data-admin-action="tune-speaker-cutout">🎯 Tune Layout B (story &amp; post)</button>
              <button type="button" onclick="app.handleAdminPreviewTomorrowQuiltScreen()">Preview tomorrow&rsquo;s quilt screen</button>
              <button type="button" onclick="window.app &amp;&amp; window.app.handleRunAsFirstTimeUser()">Run as First-Time User</button>
              <button type="button" onclick="window.app &amp;&amp; window.app.handleAdminResetQuiltMoodSelection()">Reset today&rsquo;s mood pick</button>
            </div>
            <div class="admin-menu-groups">
              <div class="admin-menu-group">
                <button type="button" class="admin-menu-group-toggle" aria-expanded="false">Quilt tools</button>
                <div class="admin-menu-group-panel" hidden>
                  <button data-admin-quilt-action="true" onclick="app.handleSplitLargestBlockWithPopularColor()">Split Largest Block (Popular Color)</button>
                  <button data-admin-quilt-action="true" onclick="app.handleAdminAddHstSample()">Add half-square triangle (largest cell)</button>
                  <button data-admin-quilt-action="true" onclick="app.handleAdminInsertCircle()">Insert circle (largest cell)</button>
                  <button data-admin-quilt-action="true" onclick="app.handleTestAddBlock()">Add Random Block</button>
                  <button data-admin-quilt-action="true" onclick="app.handleAdd25ColorFamilyBlocks()">Add 25 Color Variations</button>
                  <button data-admin-quilt-action="true" onclick="app.handleAdminSimulateQuiltVariants()">Simulate Quilt Progression</button>
                  <button data-admin-quilt-action="true" onclick="app.handleResetQuilt()">Reset Quilt</button>
                  <button type="button" id="admin-quilt-undo-btn" data-admin-quilt-action="true" onclick="app.handleAdminUndo()" disabled>Undo last change</button>
                </div>
              </div>
              <div class="admin-menu-group" id="admin-replay-group">
                <button type="button" class="admin-menu-group-toggle" aria-expanded="false">Quilt replay</button>
                <div class="admin-menu-group-panel" hidden>
                  <div class="admin-replay-bar" id="adminReplayBar">
                    <button type="button" class="admin-replay-play-btn" id="adminReplayPlayBtn" aria-label="Play time-lapse">&#9654;</button>
                    <input type="range" class="admin-replay-scrubber" id="adminReplayScrubber" min="0" max="0" value="0" step="1" aria-label="Replay position" style="flex:1;margin:0 8px;">
                    <span class="admin-replay-time" id="adminReplayTime" style="font-size:11px;white-space:nowrap;min-width:42px;text-align:right;"></span>
                  </div>
                  <button type="button" id="adminReplayRestoreBtn">Restore live view</button>
                  <p id="adminReplayStatus" style="font-size:11px;margin:4px 0 0;color:#888;"></p>
                </div>
              </div>
              <div class="admin-menu-group">
                <button type="button" class="admin-menu-group-toggle" aria-expanded="false">STUDIO FLOOR</button>
                <div class="admin-menu-group-panel" hidden>
                  <button type="button" onclick="window.app &amp;&amp; window.app.loadDeferredSocialSlice().then(() => window.app.openSocialPostComposeScreen())">Compose post</button>
                  <button type="button" onclick="window.app &amp;&amp; window.app.loadDeferredSocialSlice().then(() => window.app.openSocialPostsFeedScreen())">Studio floor</button>
                  <button type="button" onclick="window.app &amp;&amp; window.app.loadDeferredSocialSlice().then(() => window.app.openSocialPostManageScreen())">Manage posts</button>
                </div>
              </div>
              <div class="admin-menu-group">
                <button type="button" class="admin-menu-group-toggle" aria-expanded="false">Content &amp; sync</button>
                <div class="admin-menu-group-panel" hidden>
                  <button type="button" onclick="window.app &amp;&amp; window.app.handleAdminSubmitReflectionResponses()">Upload reflection responses</button>
                  <button onclick="app.showQuoteManager()">Manage Quotes</button>
                  <button type="button" id="admin-notion-sync-btn" title="Choose sync window (1–10 days or All). Shift+click to clear saved token.">🗂️ Sync Notion ↔ Firestore</button>
                </div>
              </div>
            </div>
            <button type="button" class="admin-menu-close" onclick="this.closest('.admin-menu').remove()">Close</button>
            <div id="admin-menu-feedback" role="alert" aria-live="assertive" hidden></div>
          </div>
        `;
        
        document.body.appendChild(menu);

        const content = menu.querySelector('.admin-menu-content');
        const toggleAdminMenuGroup = (group, expand) => {
          const toggle = group.querySelector('.admin-menu-group-toggle');
          const panel = group.querySelector('.admin-menu-group-panel');
          if (!toggle || !panel) return;
          const shouldExpand = typeof expand === 'boolean' ? expand : panel.hidden;
          panel.hidden = !shouldExpand;
          toggle.setAttribute('aria-expanded', shouldExpand ? 'true' : 'false');
          group.classList.toggle('admin-menu-group--open', shouldExpand);
        };
        content.querySelectorAll('.admin-menu-group-toggle').forEach((toggle) => {
          toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const group = toggle.closest('.admin-menu-group');
            if (!group) return;
            const panel = group.querySelector('.admin-menu-group-panel');
            const willOpen = !!panel?.hidden;
            content.querySelectorAll('.admin-menu-group').forEach((other) => {
              if (other !== group) toggleAdminMenuGroup(other, false);
            });
            toggleAdminMenuGroup(group, willOpen);
          });
        });
        
        menu.addEventListener('click', (e) => {
          if (e.target === menu) {
            menu.remove();
          }
        });

        // Wire up quilt replay controls
        (() => {
          const events = this.quiltEngine?.colorReplayEvents || [];
          const statusEl = menu.querySelector('#adminReplayStatus');
          const scrubber = menu.querySelector('#adminReplayScrubber');
          const playBtn = menu.querySelector('#adminReplayPlayBtn');
          const timeEl = menu.querySelector('#adminReplayTime');
          const restoreBtn = menu.querySelector('#adminReplayRestoreBtn');
          const replayGroup = menu.querySelector('#admin-replay-group');

          if (!replayGroup) return;

          if (events.length < 2) {
            if (statusEl) statusEl.textContent = events.length === 0
              ? 'No replay data yet — submit a color to start recording.'
              : 'Need at least 2 submissions to replay.';
            if (scrubber) scrubber.disabled = true;
            if (playBtn) playBtn.disabled = true;
            return;
          }

          const maxSeq = events.length - 1;
          scrubber.max = maxSeq;
          scrubber.value = maxSeq;
          if (statusEl) statusEl.textContent = `${events.length} events recorded`;

          const formatTime = (iso) => {
            if (!iso) return '';
            try {
              return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch (_) { return ''; }
          };

          const buildSnapshot = (upToIndex) => {
            // Start with the parent of the very first event as the initial block
            const firstEvent = events[0];
            const initialBlock = { ...firstEvent.parent };
            const blockMap = new Map([[initialBlock.id, initialBlock]]);
            for (let i = 0; i <= upToIndex && i < events.length; i++) {
              const ev = events[i];
              if (ev.parent?.id) blockMap.delete(ev.parent.id);
              (ev.children || []).forEach((child) => blockMap.set(child.id, child));
            }
            return Array.from(blockMap.values());
          };

          const renderAtIndex = (index) => {
            const snapshot = buildSnapshot(index);
            this.renderer?.renderBlocks(snapshot, [], index + 1);
            timeEl.textContent = formatTime(events[index]?.iso);
          };

          scrubber.addEventListener('input', () => {
            renderAtIndex(Number(scrubber.value));
          });

          let playTimer = null;
          let currentPlayIndex = 0;
          const stopPlay = () => {
            if (playTimer !== null) { clearInterval(playTimer); playTimer = null; }
            playBtn.textContent = '▶';
          };
          playBtn.addEventListener('click', () => {
            if (playTimer !== null) { stopPlay(); return; }
            currentPlayIndex = Number(scrubber.value);
            if (currentPlayIndex >= maxSeq) currentPlayIndex = 0;
            playBtn.textContent = '⏸';
            playTimer = setInterval(() => {
              currentPlayIndex++;
              scrubber.value = currentPlayIndex;
              renderAtIndex(currentPlayIndex);
              if (currentPlayIndex >= maxSeq) stopPlay();
            }, 120);
          });

          restoreBtn.addEventListener('click', () => {
            stopPlay();
            scrubber.value = maxSeq;
            timeEl.textContent = '';
            this.renderQuilt?.();
          });

          new MutationObserver(() => { if (!document.contains(menu)) stopPlay(); })
            .observe(document.body, { childList: true, subtree: false });
        })();

        let lastAdminMenuActionAt = 0;
        let lastAdminMenuAction = '';
        const runAdminMenuAction = (action) => {
          const now = Date.now();
          if (action && action === lastAdminMenuAction && now - lastAdminMenuActionAt < 600) return;
          lastAdminMenuActionAt = now;
          lastAdminMenuAction = action || '';
          try {
            localStorage.setItem(
              'odq.lastAdminMenuTap',
              JSON.stringify({ action: action || '', at: new Date().toISOString() })
            );
          } catch (_) {
            /* ignore */
          }
          if (action === 'tune-speaker-cutout') {
            document.querySelectorAll('.admin-menu').forEach((el) => el.remove());
            void this.handleAdminTuneSpeakerCutout();
          }
          else if (action === 'verify-layout-b-tune') void this.handleAdminVerifyLayoutBTuneSettings();
          else if (action === 'push-ig-firestore') void this.handlePushInstagramAssetsToFirestore();
        };
        const handleAdminMenuActionEvent = (e) => {
          const btn = e.target.closest('[data-admin-action]');
          if (!btn || !content.contains(btn)) return;
          e.preventDefault();
          e.stopPropagation();
          runAdminMenuAction(btn.dataset.adminAction);
        };
        content.addEventListener('click', handleAdminMenuActionEvent, { capture: true });

        const notionSyncBtn = menu.querySelector('#admin-notion-sync-btn');
        if (notionSyncBtn) {
          notionSyncBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleManualNotionFirestoreSync(e);
          });
        }

        this._updateAdminUndoButtonState();
      }

      // Helper method to get admin stats HTML
      getAdminStatsHTML() {
        const currentBlockCount = this.quiltEngine ? this.quiltEngine.blocks.length : 0;
        return `
          📊 Current Blocks: ${currentBlockCount}<br>
          ⏰ Archive: 6:30 AM UTC | Reset: 7:00 AM UTC<br>
          📸 OUR DAILY QUILT: Instagram upload is handled by Zapier before reset
        `;
      }

      // Method to update admin stats display
      updateAdminStats() {
        const statsDisplay = document.getElementById('admin-stats-display');
        if (statsDisplay) {
          statsDisplay.innerHTML = this.getAdminStatsHTML();
        }
      }
      /**
       * Largest quilt cell for admin HST / circle insert. Uses each block's bounding rect only
       * (same inputs createHalfSquareTriangle / createInsetCircle use). Prefer a cell that is not
       * already the target shape; otherwise replace the largest cell anyway.
       */
      _adminPickLargestCellForSpecialInsert(blocks, kind = 'hst') {
        if (!Array.isArray(blocks) || !blocks.length) return null;
        const hasSize = (b) => b && Number(b.width) > 0 && Number(b.height) > 0;
        const isHst = (b) =>
          b?.specialPatternType === 'hst' ||
          (b?.patternType === 'special' && b?.specialPatternType === 'hst');
        const isInset = (b) =>
          b?.specialPatternType === 'insetCircle' ||
          (typeof SimpleQuiltEngine !== 'undefined' &&
            SimpleQuiltEngine.hasPersistedInsetCircleGeometry?.(b));
        const isAlreadyTarget = kind === 'circle' ? isInset : isHst;
        const layerOf = (b) => {
          const v = Number(b?.visualLayerIndex);
          return Number.isFinite(v) ? v : 0;
        };
        const area = (b) => Number(b.width) * Number(b.height);

        let candidates = blocks.filter((b) => hasSize(b) && !isAlreadyTarget(b));
        if (!candidates.length) candidates = blocks.filter(hasSize);
        if (!candidates.length) return null;

        const topLayer = candidates.reduce((max, b) => Math.max(max, layerOf(b)), -Infinity);
        const topLayerCandidates = candidates.filter((b) => layerOf(b) === topLayer);
        const pool = topLayerCandidates.length ? topLayerCandidates : candidates;
        const block = pool.reduce((best, b) => (area(b) > area(best) ? b : best));
        const index = blocks.indexOf(block);
        if (index === -1) return null;
        return { block, index };
      }

      async handleAdminAddHstSample() {
        return this.runAdminQuiltMutation('Add HST sample', async () => {
          const engine = this.quiltEngine;
          const blocks = engine?.blocks;
          if (!Array.isArray(blocks) || blocks.length === 0) {
            this.uiService?.showToast?.('Add at least one block before inserting an HST.');
            return;
          }
          const picked = this._adminPickLargestCellForSpecialInsert(blocks, 'hst');
          if (!picked) {
            this.uiService?.showToast?.('No blocks with size to convert — add a block first.');
            return;
          }
          const { block: largest, index: idx } = picked;
          const { c1, c2 } = this._pickAdminSpecialInsertColorPair(blocks, largest);
          const [hst] = engine.createHalfSquareTriangle({ ...largest, color: c1 }, c2);
          blocks.splice(idx, 1, hst);
          this.renderQuilt();
          await this.saveAdminQuiltMutation('Add HST sample');
        });
      }

      async handleAdminInsertCircle() {
        return this.runAdminQuiltMutation('Insert circle', async () => {
          const engine = this.quiltEngine;
          const blocks = engine?.blocks;
          if (!Array.isArray(blocks) || blocks.length === 0) {
            this.uiService?.showToast?.('Add at least one block before inserting a circle.');
            return;
          }
          const picked = this._adminPickLargestCellForSpecialInsert(blocks, 'circle');
          if (!picked) {
            this.uiService?.showToast?.('No blocks with size to convert — add a block first.');
            return;
          }
          const { block: largest, index: idx } = picked;
          const { c1, c2 } = this._pickAdminSpecialInsertColorPair(blocks, largest);
          const [circle] = engine.createInsetCircle({ ...largest, color: c1 }, c2);
          blocks.splice(idx, 1, circle);
          this.renderQuilt();
          await this.saveAdminQuiltMutation('Insert circle');
        });
      }

      _getUniqueColorsPresentInQuilt(blocks = this.quiltEngine?.blocks || []) {
        const seen = new Set();
        const out = [];
        const push = (color) => {
          const hex = this.normalizeHexColor(color);
          if (!hex || seen.has(hex)) return;
          seen.add(hex);
          out.push(hex);
        };
        (Array.isArray(blocks) ? blocks : []).forEach((block) => {
          push(block?.color);
          push(block?.insetInnerColor);
          push(block?.hstColorB);
          if (Array.isArray(block?.hstTriangles)) {
            block.hstTriangles.forEach((tri) => push(tri?.color));
          }
          if (Array.isArray(block?.polygonPieces)) {
            block.polygonPieces.forEach((piece) => push(piece?.color));
          }
        });
        return out;
      }

      /** Same tonal nudge used by Add Color Variations — keeps hue family, shifts L/S slightly. */
      _createSubtleQuiltColorVariant(hex) {
        const normalized = this.normalizeHexColor(hex);
        if (!normalized) return null;
        const hsl = this.hexToHsl(normalized);
        const direction = Math.random() < 0.5 ? -1 : 1;
        const deltaL = direction * (0.06 + Math.random() * 0.06);
        let newLightness = hsl.l + deltaL;
        newLightness = Math.max(0.12, Math.min(0.9, newLightness));
        let newSaturation = hsl.s + (Math.random() - 0.5) * 0.08;
        newSaturation = Math.max(0.08, Math.min(1, newSaturation));
        return Utils.hslToHex(hsl.h, newSaturation * 100, newLightness * 100);
      }

      /** Two subtle tones sampled from colors already on the quilt (HST / inset circle). */
      _pickAdminSpecialInsertColorPair(blocks = this.quiltEngine?.blocks || [], anchorBlock = null) {
        const palette = this._getUniqueColorsPresentInQuilt(blocks);
        const fallback =
          this.normalizeHexColor(CONFIG.APP.defaultColor) ||
          '#8b5cf6';

        if (!palette.length) {
          const c1 = this._createSubtleQuiltColorVariant(fallback) || fallback;
          let c2 = this._createSubtleQuiltColorVariant(fallback) || fallback;
          if (c2 === c1) {
            const hsl = this.hexToHsl(c1);
            const delta = Math.random() < 0.5 ? -0.08 : 0.08;
            const newL = Math.max(0.12, Math.min(0.9, hsl.l + delta));
            c2 = Utils.hslToHex(hsl.h, hsl.s * 100, newL * 100);
          }
          return { c1, c2 };
        }

        const anchorHex = this.normalizeHexColor(anchorBlock?.color);
        const base1 =
          anchorHex && palette.includes(anchorHex)
            ? anchorHex
            : palette[Math.floor(Math.random() * palette.length)];
        const otherBases = palette.filter((c) => c !== base1);
        const base2Pool = otherBases.length ? otherBases : palette;
        const base2 = base2Pool[Math.floor(Math.random() * base2Pool.length)];

        let c1 = this._createSubtleQuiltColorVariant(base1) || base1;
        let c2 = this._createSubtleQuiltColorVariant(base2) || base2;

        if (c1 === c2) {
          const hsl = this.hexToHsl(base2);
          const delta = Math.random() < 0.5 ? -0.08 : 0.08;
          const newL = Math.max(0.12, Math.min(0.9, hsl.l + delta));
          c2 = Utils.hslToHex(hsl.h, hsl.s * 100, newL * 100);
        }

        return { c1, c2 };
      }

      async handleAdminUndo() {
        return this.runAdminQuiltMutation(
          'Undo',
          async () => {
            const snap = this._adminQuiltUndoStack?.pop();
            if (!snap?.blocks) {
              this.uiService?.showToast?.('Nothing to undo');
              this._updateAdminUndoButtonState();
              return;
            }
            this.quiltEngine.blocks = JSON.parse(JSON.stringify(snap.blocks));
            if (typeof snap.submissionCount === 'number') {
              this.quiltEngine.submissionCount = snap.submissionCount;
            }
            this.renderQuilt();
            this.updateSquareCounter?.();
            this.updateAdminStats?.();
            await this.saveAdminQuiltMutation(`Undo (${snap.label})`);
            this._updateAdminUndoButtonState();
          },
          { skipUndoSnapshot: true }
        );
      }

      getExpandedRumiColors() {
        const fullRumiSet = Array.isArray(window.__ODQ_RUMI_COLORS__) ? window.__ODQ_RUMI_COLORS__ : [];
        const validatedFullSet = fullRumiSet.filter((color) => Utils.validateHexColor(color));
        if (validatedFullSet.length) return validatedFullSet;

        // Fallback representative colors if the full Rumi response set is unavailable.
        return [
          // Original 50 colors
          "#ea9b9a", "#de6c61", "#df9368", "#d57d39", "#d8a746", 
          "#caa22b", "#f6eed5", "#decd61", "#dbcc57", "#ded561",
          "#9ab125", "#6ade61", "#1f931f", "#61de61", "#61de76", 
          "#209750", "#1f938a", "#61dedb", "#2bcaca", "#61c9de",
          "#61c9de", "#70cae1", "#61c3de", "#61c1de", "#4aa9d9", 
          "#61b2de", "#afd8ee", "#3177d3", "#6182de", "#617cde",
          "#1f2193", "#7e7de3", "#251f93", "#6c61de", "#4024a8", 
          "#8061de", "#8461de", "#9361de", "#ae61de", "#b261de",
          "#c961de", "#cb61de", "#ce2cb0", "#de61ba", "#eba2ce", 
          "#de6193", "#de618f", "#bd283c", "#931f25", "#de6165",
          // Additional 50 tonal variants
          "#f0a5a4", "#e67a6f", "#e5a076", "#d98a4f", "#e0b55c",
          "#d4b03b", "#f8f2e5", "#e6d771", "#e3d667", "#e6d771",
          "#a8c135", "#7ae671", "#3fa33f", "#71e671", "#71e686",
          "#30a760", "#3fa39a", "#71e6eb", "#3bcaca", "#71c9ee",
          "#71c9ee", "#80dae1", "#71c3ee", "#71c1ee", "#5ab9e9",
          "#71b2ee", "#bfd8ee", "#4177e3", "#7182ee", "#717cee",
          "#3f3193", "#8e7de3", "#351f93", "#7c61ee", "#5024b8",
          "#9061ee", "#9461ee", "#a361ee", "#be61ee", "#c261ee",
          "#d961ee", "#db61ee", "#de2cc0", "#ee61ca", "#fba2de",
          "#ee6193", "#ee618f", "#cd283c", "#a31f35", "#ee6165"
        ];
      }

      addRandomAdminBlock() {
        const blocks = this.quiltEngine?.blocks;
        const quiltColorPool = Array.isArray(blocks)
          ? blocks.map((b) => b && b.color).filter((c) => c && Utils.validateHexColor(c))
          : [];

        let randomColor;
        if (quiltColorPool.length > 0) {
          const hex = quiltColorPool[Math.floor(Math.random() * quiltColorPool.length)];
          randomColor = this._createSubtleQuiltColorVariant(hex);
        } else {
          const expandedRumiColors = this.getExpandedRumiColors();
          randomColor = expandedRumiColors[Math.floor(Math.random() * expandedRumiColors.length)];
        }

        const result = this.quiltEngine.addColor(randomColor);

        if (!result) {
          return null;
        }

        // Find the new block for animation
        let newBlockIndex = -1;
        if (result.newBlocks && result.newBlocks.length > 0) {
          // If splitting occurred, find the new block (the one with the new color)
          const newBlock = result.newBlocks.find(block => block.color === randomColor);
          if (newBlock) {
            newBlockIndex = this.quiltEngine.blocks.findIndex(block => block.id === newBlock.id);
          }
        } else if (result.id) {
          // If it's a single new block
          newBlockIndex = this.quiltEngine.blocks.findIndex(block => block.id === result.id);
        }

        // Set the last added index for animation
        if (newBlockIndex !== -1) {
          this.renderer.setLastAddedIndex(newBlockIndex);
        }

        this.recordAdminGeneratedContributor();
        return randomColor;
      }

      async handleTestAddBlock() {
        return this.runAdminQuiltMutation('Add Random Block', async () => {
          try {
            const randomColor = this.addRandomAdminBlock();

            if (randomColor) {
              this.renderQuilt();
              await this.saveAdminQuiltMutation('Add Random Block');

              // Update admin stats if menu is open
              this.updateAdminStats();

              this.uiService.showToast(`Added test block: ${randomColor}`);
            } else {
              this.uiService.showToast('Could not add block — no splittable area (quilt may be too fragmented).');
            }
          } catch (error) {
            this.errorHandler.handleError(error, 'testAddBlock');
          }
        });
      }

      async handleTestAdd100Blocks() {
        return this.runAdminQuiltMutation('Add 100 Random Blocks', async () => {
          try {
            const targetCount = 100;
            let successfulAdds = 0;

            for (let i = 0; i < targetCount; i++) {
              const randomColor = this.addRandomAdminBlock();
              if (!randomColor) break;

              successfulAdds++;
              if (successfulAdds % 10 === 0) {
                this.renderQuilt();
                await this.saveAdminQuiltMutation('Add 100 Random Blocks');
              }
            }

            if (successfulAdds > 0) {
              if (successfulAdds % 10 !== 0) {
                this.renderQuilt();
                await this.saveAdminQuiltMutation('Add 100 Random Blocks');
              }
              this.updateAdminStats();
              this.uiService.showToast(`Added ${successfulAdds} random blocks`);
            } else {
              this.uiService.showToast('Could not add blocks — no splittable area (quilt may be too fragmented).');
            }
          } catch (error) {
            this.errorHandler.handleError(error, 'testAdd100Blocks');
          }
        });
      }

      createSeededRandom(seed) {
        let h = 2166136261 >>> 0;
        const s = String(seed || 'odq-sim');
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return () => {
          h += 0x6D2B79F5;
          let t = h;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      async composeMirroredQuiltFieldBlob(quiltBlob, opts = {}) {
        if (!quiltBlob) return null;
        const bitmap = await createImageBitmap(quiltBlob);
        try {
          const maxEdge = Math.max(320, Number(opts.maxEdge) || 960);
          const outW = Math.round(maxEdge * 9 / 16);
          const outH = maxEdge;
          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.fillStyle = '#f6f4f1';
          ctx.fillRect(0, 0, outW, outH);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = opts.imageSmoothingQuality || 'medium';

          const dateKey =
            String(opts.dateKey || '').trim() ||
            (typeof Utils !== 'undefined' && typeof Utils.getTodayKey === 'function'
              ? Utils.getTodayKey()
              : '');

          if (
            typeof QuiltMirrorLayout !== 'undefined' &&
            typeof QuiltMirrorLayout.computeComposePlacements === 'function'
          ) {
            const p = QuiltMirrorLayout.computeComposePlacements(
              outW,
              outH,
              bitmap.width,
              bitmap.height,
              dateKey
            );
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, p.mirrorY, outW, p.drawH);
            ctx.clip();
            ctx.translate(p.startX + p.drawW, p.mirrorY + p.drawH);
            ctx.scale(-1, -1);
            ctx.drawImage(bitmap, 0, 0, p.drawW, p.drawH);
            ctx.restore();
            ctx.drawImage(bitmap, p.startX, p.primaryY, p.drawW, p.drawH);
          } else {
            const fit = opts.quiltFit === 'cover' ? 'cover' : 'meet';
            const scale =
              fit === 'cover'
                ? Math.max(outW / Math.max(1, bitmap.width), outH / (Math.max(1, bitmap.height) * 2))
                : Math.min(outW / Math.max(1, bitmap.width), outH / (Math.max(1, bitmap.height) * 2));
            const drawW = bitmap.width * scale;
            const drawH = bitmap.height * scale;
            const startY = (outH - drawH * 2) / 2;
            const startX = (outW - drawW) / 2;
            const placements = [
              { y: startY, flipX: false, flipY: false },
              { y: startY + drawH, flipX: true, flipY: true }
            ];
            placements.forEach((placement) => {
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, placement.y, outW, drawH);
              ctx.clip();
              if (placement.flipX || placement.flipY) {
                ctx.translate(
                  placement.flipX ? startX + drawW : startX,
                  placement.flipY ? placement.y + drawH : placement.y
                );
                ctx.scale(placement.flipX ? -1 : 1, placement.flipY ? -1 : 1);
                ctx.drawImage(bitmap, 0, 0, drawW, drawH);
              } else {
                ctx.drawImage(bitmap, startX, placement.y, drawW, drawH);
              }
              ctx.restore();
            });
          }

          const mimeType = opts.mimeType || 'image/jpeg';
          const quality = typeof opts.quality === 'number' ? opts.quality : 0.88;
          return await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
        } finally {
          if (typeof bitmap.close === 'function') bitmap.close();
        }
      }

      async buildSimulatedQuiltProgressionAsync(targetBlockCounts, seed, onProgress, simOptions = null) {
        const originalRandom = Math.random;
        const originalLog = console.log;
        Math.random = this.createSeededRandom(seed);
        console.log = () => {};
        try {
          const engine = new SimpleQuiltEngine(`admin-sim-${seed}`);
          engine.simulatorFullFidelity = simOptions?.simulatorFullFidelity === true;
          engine.simulatorMirrorPreFreeze = simOptions?.simulatorMirrorPreFreeze !== false;
          engine.initialize();
          const expandedRumiColors = this.getExpandedRumiColors();
          const targets = [...targetBlockCounts]
            .map((count) => Math.max(1, Number(count) || 1))
            .sort((a, b) => a - b);
          const snapshots = new Map();
          const maxTarget = targets[targets.length - 1] || 1;
          const maxAttempts = Math.max(500, maxTarget * 4);
          let attempts = 0;
          let nextTargetIndex = 0;

          while (
            nextTargetIndex < targets.length &&
            engine.blocks.length < maxTarget &&
            attempts < maxAttempts
          ) {
            const randomColor =
              expandedRumiColors[Math.floor(Math.random() * expandedRumiColors.length)];
            engine.addColor(randomColor);
            attempts++;

            while (
              nextTargetIndex < targets.length &&
              engine.blocks.length >= targets[nextTargetIndex]
            ) {
              const target = targets[nextTargetIndex];
              snapshots.set(target, {
                blocks: engine.blocks.map((block) => ({ ...block })),
                submissionCount: engine.submissionCount,
                attempts,
                target
              });
              nextTargetIndex++;
            }

            if (attempts === 1 || attempts % 32 === 0) {
              if (typeof onProgress === 'function') {
                try {
                  onProgress({
                    attempts,
                    blockCount: engine.blocks.length,
                    maxTarget,
                    nextMilestone:
                      nextTargetIndex < targets.length ? targets[nextTargetIndex] : null
                  });
                } catch (_) {}
              }
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }

          return {
            simulations: targets.map((target) => (
              snapshots.get(target) || {
                blocks: engine.blocks.map((block) => ({ ...block })),
                submissionCount: engine.submissionCount,
                attempts,
                target
              }
            )),
            macroStructureFrozen: engine.macroStructureFrozen === true,
            macroRegionCount:
              engine.macroStructureFrozen === true
                ? new Set(
                    engine.blocks.map((b) => (b && b.macroRegionId != null ? Number(b.macroRegionId) : null)).filter(
                      (id) => id != null && Number.isFinite(id)
                    )
                  ).size
                : 0,
            macroFrozenOutlineCount:
              engine.macroStructureFrozen === true
                ? engine.blocks.filter((b) => engine._normalizeMacroFrozenOutline(b?.macroFrozenOutline)).length
                : 0,
            macroFrozenColorCount:
              engine.macroStructureFrozen === true
                ? engine.blocks.filter((b) => typeof b?.macroFrozenColor === 'string' && b.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)).length
                : 0,
            macroFreezeHstParentsExploded: Number(engine.macroFreezeHstParentsExplodedCount) || 0
          };
        } finally {
          Math.random = originalRandom;
          console.log = originalLog;
        }
      }

      closeAdminQuiltSimulationModal(modal) {
        if (modal && Array.isArray(modal._odqObjectUrls)) {
          modal._odqObjectUrls.forEach((url) => URL.revokeObjectURL(url));
        }
        if (modal) {
          modal.remove();
        }
      }

      async handleAdminSimulateQuiltVariants() {
        const existing = document.querySelector('.admin-quilt-simulation-modal');
        if (existing) this.closeAdminQuiltSimulationModal(existing);

        const targets = [100, 200, 500, 1000, 2000];
        const modal = document.createElement('div');
        modal.className = 'admin-quilt-simulation-modal';
        modal._odqObjectUrls = [];
        modal.style.cssText = `
          position: fixed;
          inset: 18px;
          z-index: 3000;
          background: #f6f4f1;
          color: #1f1b16;
          border: 2px solid #1f1b16;
          border-radius: 12px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.28);
          padding: 16px;
          overflow: auto;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        `;
        modal.innerHTML = `
          <div style="position: sticky; top: 0; z-index: 1; background: #f6f4f1; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.18); display: flex; gap: 10px; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-weight: 800; font-size: 18px;">Quilt Growth Simulator</div>
              <div style="font-size: 13px; opacity: 0.75;">One fresh random quilt shown at 100, 200, 500, 1000, and 2000 blocks. Before freeze, optional <strong>mirrored symmetry</strong> duplicates splits into matching counterpart blocks; after freeze, growth returns to single additions. Optional <strong>Full fidelity merges</strong> runs the same neighbor-combine pass as production (slower; no localStorage remap). <strong>Click Start simulation</strong> when ready—nothing runs until then. Nothing is saved.</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
              <label style="font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; cursor: pointer; max-width: 280px; text-align: left;">
                <input type="checkbox" id="admin-sim-mirror-prefreeze" checked />
                <span>Mirrored pre-freeze symmetry experiment</span>
              </label>
              <label style="font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; cursor: pointer; max-width: 280px; text-align: left;">
                <input type="checkbox" id="admin-sim-full-fidelity" />
                <span>Full fidelity merges (slower — same combine-neighbors pass as live; does not write contribution remap)</span>
              </label>
              <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
              <button type="button" id="admin-sim-start">Start simulation</button>
              <button type="button" id="download-all-simulated-quilts" disabled>Download all JPEGs</button>
              <button type="button" id="close-simulated-quilts">Close</button>
              </div>
            </div>
          </div>
          <div id="admin-quilt-simulation-status" style="padding: 12px 0; font-size: 13px;">Optional: adjust symmetry/merge options, then click <strong>Start simulation</strong>.</div>
          <div id="admin-quilt-simulation-grid" style="display: grid; grid-template-columns: repeat(${targets.length}, minmax(180px, 1fr)); gap: 12px; align-items: start;"></div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#close-simulated-quilts').addEventListener('click', () => {
          this.closeAdminQuiltSimulationModal(modal);
        });

        const grid = modal.querySelector('#admin-quilt-simulation-grid');
        const status = modal.querySelector('#admin-quilt-simulation-status');
        const downloadAll = modal.querySelector('#download-all-simulated-quilts');
        const startBtn = modal.querySelector('#admin-sim-start');
        const fullFiInput = modal.querySelector('#admin-sim-full-fidelity');
        const mirrorInput = modal.querySelector('#admin-sim-mirror-prefreeze');

        targets.forEach((target) => {
          const card = document.createElement('div');
          card.id = `sim-card-${target}`;
          card.style.cssText = `
            background: #fff;
            border: 1px solid rgba(0,0,0,0.16);
            border-radius: 8px;
            padding: 8px;
            min-height: 170px;
            font-size: 12px;
          `;
          card.innerHTML = `<div style="font-weight: 800; text-align: center; margin-bottom: 6px;">${target} blocks</div><div style="opacity:0.85;">Click <strong>Start simulation</strong></div>`;
          grid.appendChild(card);
        });

        startBtn.addEventListener('click', async () => {
          if (modal._odqSimRunning) return;
          modal._odqSimRunning = true;
          startBtn.disabled = true;
          if (fullFiInput) fullFiInput.disabled = true;
          if (mirrorInput) mirrorInput.disabled = true;
          downloadAll.disabled = true;
          downloadAll.onclick = null;
          if (Array.isArray(modal._odqObjectUrls)) {
            modal._odqObjectUrls.forEach((u) => URL.revokeObjectURL(u));
            modal._odqObjectUrls = [];
          }

          const downloads = [];
          const runSeed = `sim-${Date.now()}`;
          try {
          const fullFi = fullFiInput?.checked === true;
          const mirrorPreFreeze = mirrorInput?.checked !== false;
          status.textContent = fullFi
            ? `Growing quilt (${mirrorPreFreeze ? 'mirrored pre-freeze, ' : ''}full fidelity — merge on, slower)…`
            : `Growing quilt toward 2000 blocks${mirrorPreFreeze ? ' with mirrored pre-freeze symmetry' : ''}…`;
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const {
            simulations,
            macroStructureFrozen,
            macroRegionCount,
            macroFrozenOutlineCount,
            macroFrozenColorCount,
            macroFreezeHstParentsExploded
          } = await this.buildSimulatedQuiltProgressionAsync(
            targets,
            runSeed,
            (p) => {
            const cap =
              p.nextMilestone != null
                ? `next snapshot ≤ ${p.nextMilestone}`
                : 'milestones captured';
            status.textContent = `Growing quilt… ${p.blockCount} blocks, ${p.attempts} color adds (${cap}). JPEG preview comes next.`;
          },
            { simulatorFullFidelity: fullFi, simulatorMirrorPreFreeze: mirrorPreFreeze }
          );

          const rasterOpts = fullFi
            ? {
                maxEdge: 1152,
                mimeType: 'image/jpeg',
                quality: 0.88,
                imageSmoothingQuality: 'medium'
              }
            : {
                maxEdge: 768,
                mimeType: 'image/jpeg',
                quality: 0.82,
                imageSmoothingQuality: 'low'
              };

          for (const simulation of simulations) {
            const target = simulation.target;
            const card = modal.querySelector(`#sim-card-${target}`);
            status.textContent = `Rendering ${target}-block snapshot...`;
            card.innerHTML = `<div style="font-weight: 800; text-align: center; margin-bottom: 6px;">${target} blocks</div><div>Rendering...</div>`;
            await new Promise((resolve) => setTimeout(resolve, 0));

            let blob = await this.archiveService.generateQuiltRasterBlobFromBlocks(
              simulation.blocks,
              rasterOpts
            );
            if (blob && mirrorPreFreeze) {
              blob = await this.composeMirroredQuiltFieldBlob(blob, {
                ...rasterOpts,
                maxEdge: fullFi ? 1440 : 960,
                imageSmoothingQuality: fullFi ? 'medium' : 'low'
              });
            }
            if (!blob) throw new Error(`Could not render ${target}-block snapshot`);
            const url = URL.createObjectURL(blob);
            modal._odqObjectUrls.push(url);
            const filename = `our-daily-quilt-sim-progression-${target}-blocks${mirrorPreFreeze ? '-mirrored-field' : ''}${fullFi ? '-fullfi' : ''}.jpg`;
            downloads.push({ url, filename });

            card.innerHTML = `
              <div style="font-weight: 800; text-align: center; margin-bottom: 6px;">${target} blocks</div>
              <img decoding="async" loading="lazy" src="${url}" alt="${target}-block quilt progression snapshot" style="width: 100%; aspect-ratio: ${mirrorPreFreeze ? '9 / 16' : '4 / 5'}; object-fit: contain; background: #f6f4f1; border-radius: 4px; display: block;">
              <div style="margin-top: 6px; opacity: 0.78;">Actual: ${simulation.blocks.length} blocks · ${simulation.submissionCount} adds</div>
              <a href="${url}" download="${filename}" style="display: inline-block; margin-top: 6px;">Download JPEG</a>
            `;
          }

          const hstShardNote =
            macroFreezeHstParentsExploded > 0
              ? ` ${macroFreezeHstParentsExploded} HST patch(es) split into separate triangle shards at freeze (block model); JPEGs may still look unchanged until later splits diverge.`
              : '';

          const freezeSuffix =
            macroStructureFrozen && macroRegionCount > 0
              ? ` Macro layout locked (${macroRegionCount} macro regions at freeze; ${macroFrozenOutlineCount} outlines, ${macroFrozenColorCount} color anchors); inner mosaic still grows—zoom previews.${hstShardNote}`
              : macroStructureFrozen
                ? ` Macro layout lock applied.${hstShardNote}`
                : ' Macro lock did not trigger (patch count stayed outside the 100–148 snapshot window this run).';

          const fiNote = fullFi
            ? ' Full fidelity: production-style neighbor merges + higher-res exports (~1152px); sim does not remap localStorage contributions.'
            : ' Fast mode: merges off (enable Full fidelity merges for block layout closer to live).';

          status.textContent = `Generated ${downloads.length} quilt JPEGs.${fiNote}${freezeSuffix}`;
          downloadAll.disabled = false;
          downloadAll.onclick = () => {
            downloads.forEach((item, index) => {
              setTimeout(() => {
                const a = document.createElement('a');
                a.href = item.url;
                a.download = item.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }, index * 120);
            });
          };
        } catch (error) {
          status.textContent = 'Simulation failed. Check the console for details.';
          this.errorHandler.handleError(error, 'adminSimulateQuiltVariants');
        } finally {
          modal._odqSimRunning = false;
          startBtn.disabled = false;
          if (fullFiInput) fullFiInput.disabled = false;
        }
        });
      }

      /**
       * Synthetic “quilt forming” reel for Stories/Reels testing: canvas + MediaRecorder (WebM).
       * Tries reverse-merge reconstruction (one block → splits → final); falls back to staggered fade if geometry cannot merge cleanly.
       */
      async handleAdminSyntheticQuiltReel() {
        try {
          const blocks = this.quiltEngine?.blocks;
          if (!Array.isArray(blocks) || blocks.length < 2) {
            this.uiService.showToast('Need at least 2 blocks for a reel');
            return;
          }
          if (typeof MediaRecorder === 'undefined') {
            this.uiService.showToast('MediaRecorder not available in this browser');
            return;
          }

          this.uiService.showToast('Recording reel — keep this tab focused');

          const qt = this.quoteService?.getTodayQuote?.() || { text: '', body: '', author: '' };
          const reelDateKey = Utils.getTodayKey();
          const { blob, mode } = await this._buildSyntheticQuiltReelWebm(blocks, {
            width: 1080,
            height: 1920,
            durationSec: 8,
            fps: 30,
            bg: '#f6f4f1',
            quoteText: String(qt.text ?? qt.body ?? '').trim(),
            quoteAuthor: String(qt.author ?? '').trim(),
            dateKey: reelDateKey
          });

          if (!blob || blob.size < 200) {
            this.uiService.showToast('Reel export failed — try Chrome desktop');
            return;
          }

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `quilt-reel-synthetic-${Utils.getTodayKey()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          this.uiService.showToast(
            mode === 'replay'
              ? 'Synthetic reel saved (WebM · split replay from log)'
              : mode === 'split'
                ? 'Synthetic reel saved (WebM · split build)'
                : 'Synthetic reel saved (WebM · fade — split merge unavailable)'
          );
        } catch (error) {
          this.errorHandler.handleError(error, 'syntheticReel');
        }
      }

      /**
       * Reverse-merge axis-aligned blocks until one rectangle; records merges for split-forward reel.
       * Uses integer-snapped geometry + multi-strategy greedy + bounded DFS (greedy alone often gets stuck).
       * @returns {{ mergeHistory: { parent: object, childA: object, childB: object }[], root: object } | null}
       */
      _reconstructQuiltMergeHistory(blocks) {
        const EPS = 6;
        const AREA_TOL = 48;

        const snapClone = (b) => ({
          x: Math.round(b.x),
          y: Math.round(b.y),
          width: Math.max(1, Math.round(b.width)),
          height: Math.max(1, Math.round(b.height)),
          color: typeof b.color === 'string' ? b.color : '#c8c4bf',
          id: b.id || ''
        });
        const clone = (b) => ({
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          color: typeof b.color === 'string' ? b.color : '#c8c4bf',
          id: b.id || ''
        });
        const area = (b) => Math.max(0, b.width) * Math.max(0, b.height);
        const unionRect = (a, b) => {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const rx = Math.max(a.x + a.width, b.x + b.width);
          const ry = Math.max(a.y + a.height, b.y + b.height);
          return { x, y, width: rx - x, height: ry - y };
        };
        const canMergePair = (a, b) => {
          const u = unionRect(a, b);
          const ua = u.width * u.height;
          const sum = area(a) + area(b);
          if (Math.abs(ua - sum) > AREA_TOL) return false;
          const inU = (r) =>
            r.x >= u.x - EPS &&
            r.y >= u.y - EPS &&
            r.x + r.width <= u.x + u.width + EPS &&
            r.y + r.height <= u.y + u.height + EPS;
          return inU(a) && inU(b);
        };

        const listMergeablePairs = (work) => {
          const out = [];
          for (let i = 0; i < work.length; i++) {
            for (let j = i + 1; j < work.length; j++) {
              if (canMergePair(work[i], work[j])) {
                const sum = area(work[i]) + area(work[j]);
                out.push({ i, j, sum, ij: i + j });
              }
            }
          }
          return out;
        };

        const applyMergeToWork = (work, i, j) => {
          const a = work[i];
          const b = work[j];
          const parent = unionRect(a, b);
          parent.color = area(a) >= area(b) ? a.color : b.color;
          parent.id = `synth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const hi = Math.max(i, j);
          const lo = Math.min(i, j);
          const next = work.slice();
          next.splice(hi, 1);
          next.splice(lo, 1);
          next.push(parent);
          return {
            next,
            record: {
              parent: clone(parent),
              childA: clone(a),
              childB: clone(b)
            }
          };
        };

        const greedyWithPicker = (workInit, pickFrom) => {
          const mergeHistory = [];
          let work = workInit.map(snapClone);
          const cap = work.length * 6 + 32;
          let steps = 0;
          while (work.length > 1 && steps < cap) {
            steps++;
            const cands = listMergeablePairs(work);
            if (!cands.length) return null;
            const hit = pickFrom(cands);
            if (!hit) return null;
            const { next, record } = applyMergeToWork(work, hit.i, hit.j);
            mergeHistory.push(record);
            work = next;
          }
          if (work.length !== 1) return null;
          const last = mergeHistory[mergeHistory.length - 1];
          return { root: clone(last.parent), mergeHistory };
        };

        const base = blocks
          .filter((b) => b && typeof b.x === 'number' && b.width > 0 && b.height > 0)
          .map(snapClone);
        if (base.length < 2) return null;

        const pickers = [
          (c) => [...c].sort((a, b) => a.sum - b.sum || a.ij - b.ij)[0],
          (c) => [...c].sort((a, b) => b.sum - a.sum || a.ij - b.ij)[0],
          (c) => [...c].sort((a, b) => a.ij - b.ij || a.sum - b.sum)[0],
          (c) =>
            [...c].sort(
              (a, b) => Math.abs(a.i - a.j) - Math.abs(b.i - b.j) || a.sum - b.sum
            )[0]
        ];

        for (const pick of pickers) {
          const g = greedyWithPicker(base, pick);
          if (g && g.mergeHistory.length === base.length - 1) return g;
        }
        for (let r = 0; r < 20; r++) {
          const g = greedyWithPicker(base, (c) => c[Math.floor(Math.random() * c.length)]);
          if (g && g.mergeHistory.length === base.length - 1) return g;
        }

        /** Bounded DFS when greedy orderings fail (common on irregular merge trees). */
        const dfsBudget = Math.min(90000, 4000 + base.length * base.length * 80);
        const fail = new Set();
        const workKey = (work) =>
          work
            .map((b) => `${b.x},${b.y},${b.width},${b.height}`)
            .sort()
            .join('|');

        let dfsCalls = 0;
        const dfs = (work, history) => {
          dfsCalls++;
          if (dfsCalls > dfsBudget) return null;
          if (work.length === 1) {
            return { root: clone(work[0]), mergeHistory: history };
          }
          const k = workKey(work);
          if (fail.has(k)) return null;
          const cands = listMergeablePairs(work);
          if (!cands.length) {
            fail.add(k);
            return null;
          }
          cands.sort((a, b) => a.sum - b.sum || a.ij - b.ij);
          const branch = Math.min(28, cands.length);
          for (let t = 0; t < branch; t++) {
            const hit = cands[t];
            const { next, record } = applyMergeToWork(work, hit.i, hit.j);
            const sub = dfs(next, history.concat([record]));
            if (sub) return sub;
          }
          fail.add(k);
          return null;
        };

        return dfs(base.map(snapClone), []);
      }

      /** Blocks visible after applying the last `k` splits from a merge plan (k = 0 → root only). */
      _quiltBlocksAfterSplitSteps(root, mergeHistory, k) {
        const EPS = 3;
        const K = mergeHistory.length;
        const kk = Math.max(0, Math.min(K, k));
        const clone = (b) => ({
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          color: b.color,
          id: b.id || ''
        });
        const geomMatch = (a, p) =>
          Math.abs(a.x - p.x) < EPS &&
          Math.abs(a.y - p.y) < EPS &&
          Math.abs(a.width - p.width) < EPS &&
          Math.abs(a.height - p.height) < EPS;

        const cur = [clone(root)];
        for (let i = 0; i < kk; i++) {
          const sp = mergeHistory[K - 1 - i];
          const idx = cur.findIndex((b) => geomMatch(b, sp.parent));
          if (idx === -1) return cur;
          cur.splice(idx, 1, clone(sp.childA), clone(sp.childB));
        }
        return cur;
      }

      /** Stable multiset key for replay validation (rounded geometry + lowercased hex). */
      _quiltFingerprintForReplay(blocks) {
        if (!blocks || !blocks.length) return '';
        return blocks
          .map((b) => {
            const c = String(b.color || '').trim().toLowerCase();
            return `${Math.round(b.x)}:${Math.round(b.y)}:${Math.round(b.width)}:${Math.round(b.height)}:${c}`;
          })
          .sort()
          .join('|');
      }

      _orderReplayEvents(events) {
        if (!Array.isArray(events)) return [];
        return events
          .filter((e) => e && e.parent && e.parent.id && Array.isArray(e.children) && e.children.length)
          .slice()
          .sort((a, b) => {
            const sa = typeof a.seq === 'number' ? a.seq : 0;
            const sb = typeof b.seq === 'number' ? b.seq : 0;
            if (sa !== sb) return sa - sb;
            return String(a.iso || '').localeCompare(String(b.iso || ''));
          });
      }

      /**
       * Rebuild block list after the first `appliedCount` persisted split events (0 → parent of first event only).
       * @param {Array<{parent:object,children:object[]}>} events
       */
      _replayQuiltStateAfterColorEvents(events, appliedCount) {
        if (!events || events.length === 0) return [];
        const clone = (b) => ({ ...b });
        if (appliedCount <= 0) {
          return [clone(events[0].parent)];
        }
        let state = [clone(events[0].parent)];
        const n = Math.min(appliedCount, events.length);
        for (let i = 0; i < n; i++) {
          const ev = events[i];
          if (!ev || !ev.parent || !ev.children || !ev.children.length) return state;
          const pid = ev.parent.id;
          const idx = state.findIndex((b) => b.id === pid);
          if (idx === -1) return state;
          state.splice(idx, 1, ...ev.children.map(clone));
        }
        return state;
      }

      /**
       * @returns {{ events: object[] } | null}
       */
      _validateColorReplayPlan(events, finalBlocks) {
        const ordered = this._orderReplayEvents(events);
        if (ordered.length === 0) return null;
        if (!Array.isArray(finalBlocks) || finalBlocks.length < 2) return null;
        const end = this._replayQuiltStateAfterColorEvents(ordered, ordered.length);
        if (!end || end.length < 2) return null;
        if (this._quiltFingerprintForReplay(end) !== this._quiltFingerprintForReplay(finalBlocks)) {
          this.logger.warn('Synthetic reel: colorReplayEvents fingerprint mismatch; falling back');
          return null;
        }
        return { events: ordered };
      }

      /**
       * @param {Array<{x:number,y:number,width:number,height:number,color:string}>} blocks
       * @returns {Promise<{ blob: Blob, mode: 'split'|'fade'|'replay' }>}
       */
      async _buildSyntheticQuiltReelWebm(blocks, opts) {
        const W = opts.width;
        const H = opts.height;
        const durationSec = opts.durationSec;
        const fps = opts.fps;
        const bg = opts.bg || '#f6f4f1';
        const quoteText = String(opts.quoteText || '').trim();
        const quoteAuthor = String(opts.quoteAuthor || '').trim();
        const quoteDateKey = String(opts.dateKey || Utils.getTodayKey()).trim();
        const pad = 0;
        /** Fills sub-pixel / organic-path gaps so cracks never read as transparent holes. */
        const WARM_QUILT_MATTE = '#f6f4f1';

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const b of blocks) {
          if (!b || typeof b.x !== 'number') continue;
          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width);
          maxY = Math.max(maxY, b.y + b.height);
        }
        if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
          throw new Error('Invalid quilt bounds for reel');
        }

        const bw = maxX - minX;
        const bh = maxY - minY;
        /**
         * Center primary quilt, then fill top/bottom with mirrored copies.
         */
        const scale = Math.max((W - pad * 2) / bw, (H - pad * 2) / (3 * bh));
        const copyHeightPx = bh * scale;
        const baseTopPx = (H - copyHeightPx) / 2;
        const copyPlacements = [
          { yPx: baseTopPx - copyHeightPx, mirrored: true },
          { yPx: baseTopPx, mirrored: false },
          { yPx: baseTopPx + copyHeightPx, mirrored: true }
        ];

        const replayEvents =
          opts && Array.isArray(opts.colorReplayEvents)
            ? opts.colorReplayEvents
            : this.quiltEngine && typeof this.quiltEngine.getColorReplayEvents === 'function'
              ? this.quiltEngine.getColorReplayEvents()
              : [];
        const replayPlan = this._validateColorReplayPlan(replayEvents, blocks);
        const mergePlan = replayPlan ? null : this._reconstructQuiltMergeHistory(blocks);
        const reelMode = replayPlan ? 'replay' : mergePlan ? 'split' : 'fade';
        if (replayPlan) {
          this.logger.log('Synthetic reel: using persisted colorReplayEvents', {
            events: replayPlan.events.length
          });
        } else if (mergePlan) {
          this.logger.log('Synthetic reel: using split-reconstruction', {
            merges: mergePlan.mergeHistory.length
          });
        } else {
          this.logger.warn('Synthetic reel: merge reconstruction failed, using fade stagger');
        }

        const sorted = blocks
          .filter((b) => b && typeof b.color === 'string' && b.width > 0 && b.height > 0)
          .slice()
          .sort((a, b) => b.width * b.height - a.width * a.height);

        const n = sorted.length;
        if (n < 1) {
          throw new Error('No drawable blocks for reel');
        }
        const smoothstep = (t) => t * t * (3 - 2 * t);
        const FONT_BODY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const FONT_AUTHOR = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const QUOTE_LINE_LEAD = 1.12;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;

        const hash01 = (str) => {
          let h = 2166136261 >>> 0;
          for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          return (h >>> 0) / 4294967295;
        };
        const jitterPxForBlock = (b) => {
          const m = Math.min(Math.max(1, b.width), Math.max(1, b.height));
          return Math.max(0.45, Math.min(2.2, m * 0.018));
        };
        const traceOrganicBlockPath = (ctx, b, copyIdx) => {
          const seedBase = `${b.id || ''}|${Math.round(b.x)}|${Math.round(b.y)}|${Math.round(b.width)}|${Math.round(b.height)}|${copyIdx}`;
          const j = jitterPxForBlock(b);
          const left = b.x - minX;
          const top = b.y - minY;
          const right = left + b.width;
          const bottom = top + b.height;
          const n = (k) => (hash01(`${seedBase}|${k}`) - 0.5) * 2 * j;
          const pTopA = { x: left + b.width * 0.33 + n('tax'), y: top + n('tay') };
          const pTopB = { x: left + b.width * 0.66 + n('tbx'), y: top + n('tby') };
          const pRightA = { x: right + n('rax'), y: top + b.height * 0.33 + n('ray') };
          const pRightB = { x: right + n('rbx'), y: top + b.height * 0.66 + n('rby') };
          const pBottomA = { x: left + b.width * 0.66 + n('bax'), y: bottom + n('bay') };
          const pBottomB = { x: left + b.width * 0.33 + n('bbx'), y: bottom + n('bby') };
          const pLeftA = { x: left + n('lax'), y: top + b.height * 0.66 + n('lay') };
          const pLeftB = { x: left + n('lbx'), y: top + b.height * 0.33 + n('lby') };
          const c1 = { x: left + n('c1x'), y: top + n('c1y') };
          const c2 = { x: right + n('c2x'), y: top + n('c2y') };
          const c3 = { x: right + n('c3x'), y: bottom + n('c3y') };
          const c4 = { x: left + n('c4x'), y: bottom + n('c4y') };

          ctx.beginPath();
          ctx.moveTo(c1.x, c1.y);
          ctx.lineTo(pTopA.x, pTopA.y);
          ctx.lineTo(pTopB.x, pTopB.y);
          ctx.lineTo(c2.x, c2.y);
          ctx.lineTo(pRightA.x, pRightA.y);
          ctx.lineTo(pRightB.x, pRightB.y);
          ctx.lineTo(c3.x, c3.y);
          ctx.lineTo(pBottomA.x, pBottomA.y);
          ctx.lineTo(pBottomB.x, pBottomB.y);
          ctx.lineTo(c4.x, c4.y);
          ctx.lineTo(pLeftA.x, pLeftA.y);
          ctx.lineTo(pLeftB.x, pLeftB.y);
          ctx.closePath();
        };
        const drawHstBlockReel = (ctx, b) => {
          const left = b.x - minX;
          const top = b.y - minY;
          const tris = Utils.getHstOrganicRenderTriangles(b, 1);
          tris.forEach((t) => {
            const pts = t.points || [];
            if (pts.length < 3) return;
            const col = /^#[0-9A-Fa-f]{6}$/.test(String(t.color || '').trim()) ? t.color : '#c8c4bf';
            ctx.beginPath();
            ctx.moveTo(left + pts[0][0], top + pts[0][1]);
            for (let k = 1; k < pts.length; k++) {
              ctx.lineTo(left + pts[k][0], top + pts[k][1]);
            }
            ctx.closePath();
            ctx.fillStyle = col;
            ctx.fill();
          });
        };
        const drawInsetBlockReel = (ctx, b, copyIdx) => {
          const left = b.x - minX;
          const top = b.y - minY;
          ctx.beginPath();
          traceOrganicBlockPath(ctx, b, copyIdx);
          const bg = /^#[0-9A-Fa-f]{6}$/.test(String(b.color || '').trim()) ? b.color : '#c8c4bf';
          ctx.fillStyle = bg;
          ctx.fill();
          const innerHex = typeof b.insetInnerColor === 'string' ? b.insetInnerColor : bg;
          const inner = /^#[0-9A-Fa-f]{6}$/.test(String(innerHex || '').trim()) ? innerHex : '#c8c4bf';
          const spec = Utils.insetCircleOrganicSectorPointsLocal(b, 1);
          const mapToWorld = (p) => [left + p[0], top + p[1]];
          if (spec.kind === 'none' || !(spec.points && spec.points.length >= 3)) {
            return;
          }
          const pts = spec.points.map(mapToWorld);
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();
          ctx.fillStyle = inner;
          ctx.fill();
        };
        const drawOrganicBlock = (ctx, b, copyIdx) => {
          SimpleQuiltEngine.ensureInsetClassificationFromGeometry(b);
          if (b.patternType === 'special' && b.specialPatternType === 'hst') {
            drawHstBlockReel(ctx, b);
            return;
          }
          if (b.patternType === 'special' && b.specialPatternType === 'insetCircle') {
            drawInsetBlockReel(ctx, b, copyIdx);
            return;
          }
          traceOrganicBlockPath(ctx, b, copyIdx);
          ctx.fill();
        };
        const hexToRgb = (hex) => {
          const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
          if (!m) return { r: 200, g: 196, b: 191 };
          const h = m[1];
          return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16)
          };
        };
        const watercolorDarknessFactor = (hex) => {
          const { r, g, b } = hexToRgb(hex);
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          if (luminance <= 72) return 0.5;    // very dark colors: strongly reduce watercolor
          if (luminance <= 96) return 0.66;   // dark colors: reduce noticeably
          if (luminance <= 124) return 0.82;  // dark-mid colors: reduce a bit
          return 1;
        };
        const darkEdgeBoostForColor = (hex) => {
          const { r, g, b } = hexToRgb(hex);
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          if (luminance <= 72) return 1;
          if (luminance <= 96) return 0.65;
          return 0;
        };
        /** HST: one wash per organic triangle, centroid-based (matches SVG). */
        const applyWatercolorWashHstPieces = (ctx, b, copyIdx, intensity = 1) => {
          const base = Math.max(0, Math.min(1, intensity));
          const minDim = Math.max(1, Math.min(Math.abs(b.width), Math.abs(b.height)));
          const sizeFactor = minDim <= 44 ? 0.45 : minDim <= 72 ? 0.7 : 1;
          const left0 = b.x - minX;
          const top0 = b.y - minY;
          const tris = Utils.getHstOrganicRenderTriangles(b, 1);
          tris.forEach((tri, ti) => {
            const pts = tri.points || [];
            if (pts.length < 3) return;
            const colTri = /^#[0-9a-f]{6}$/i.test(String(tri.color || '').trim())
              ? String(tri.color).trim()
              : /^#[0-9a-f]{6}$/i.test(String(b.color || '').trim())
                ? String(b.color).trim()
                : '#c8c4bf';
            const t0 = base * sizeFactor * watercolorDarknessFactor(colTri);
            const t = Math.max(0, Math.min(1, t0));
            if (t <= 0.001) return;
            const an = Utils.hstOrganicTriangleRadialAnchorLocal(pts);
            if (!an || !(an.span > 0)) return;
            const jitter = an.span * 0.11;
            const triSeed = `${b.id || ''}|hstwc|${ti}|${copyIdx}`;
            const cx = left0 + an.cx + (hash01(`${triSeed}|cx`) - 0.5) * 2 * jitter;
            const cy = top0 + an.cy + (hash01(`${triSeed}|cy`) - 0.5) * 2 * jitter;
            const gSpan = Math.max(an.span, 1e-6);
            const gMin = Math.min(gSpan, Math.min(Math.abs(b.width), Math.abs(b.height)));
            let bx0 = Infinity;
            let by0 = Infinity;
            let bx1 = -Infinity;
            let by1 = -Infinity;
            for (let k = 0; k < pts.length; k++) {
              const wx = left0 + Number(pts[k][0]);
              const wy = top0 + Number(pts[k][1]);
              bx0 = Math.min(bx0, wx);
              by0 = Math.min(by0, wy);
              bx1 = Math.max(bx1, wx);
              by1 = Math.max(by1, wy);
            }
            const bw = bx1 - bx0;
            const bh = by1 - by0;
            const c = hexToRgb(colTri);
            const darkBoost = darkEdgeBoostForColor(colTri);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(left0 + pts[0][0], top0 + pts[0][1]);
            for (let k = 1; k < pts.length; k++) {
              ctx.lineTo(left0 + pts[k][0], top0 + pts[k][1]);
            }
            ctx.closePath();
            ctx.clip();

            const centerGrad = ctx.createRadialGradient(
              cx,
              cy,
              gMin * 0.08,
              cx,
              cy,
              gSpan * 0.72
            );
            centerGrad.addColorStop(0, `rgba(255,255,255,${Math.min(0.92, 0.16 * t).toFixed(3)})`);
            centerGrad.addColorStop(0.55, `rgba(255,255,255,${Math.min(0.45, 0.05 * t).toFixed(3)})`);
            centerGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = centerGrad;
            ctx.fillRect(bx0 - 2, by0 - 2, bw + 4, bh + 4);

            const edgeGrad = ctx.createRadialGradient(cx, cy, gMin * 0.18, cx, cy, gSpan * 0.92);
            edgeGrad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0)`);
            edgeGrad.addColorStop(
              0.65,
              `rgba(${c.r},${c.g},${c.b},${Math.min(0.35, 0.03 * t).toFixed(3)})`
            );
            edgeGrad.addColorStop(
              1,
              `rgba(${c.r},${c.g},${c.b},${Math.min(0.75, 0.19 * t).toFixed(3)})`
            );
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = edgeGrad;
            ctx.fillRect(bx0 - 2, by0 - 2, bw + 4, bh + 4);

            if (darkBoost > 0.001) {
              const darkEdge = ctx.createRadialGradient(cx, cy, gMin * 0.2, cx, cy, gSpan * 0.96);
              darkEdge.addColorStop(0, 'rgba(0,0,0,0)');
              darkEdge.addColorStop(0.74, `rgba(0,0,0,${Math.min(0.4, 0.012 * darkBoost * t).toFixed(3)})`);
              darkEdge.addColorStop(
                1,
                `rgba(0,0,0,${Math.min(0.55, 0.085 * darkBoost * t).toFixed(3)})`
              );
              ctx.fillStyle = darkEdge;
              ctx.fillRect(bx0 - 2, by0 - 2, bw + 4, bh + 4);
            }

            ctx.restore();
          });
        };

        const applyWatercolorWashInsetPieces = (ctx, b, copyIdx, intensity = 1) => {
          const base = Math.max(0, Math.min(1, intensity));
          const minDim = Math.max(1, Math.min(Math.abs(b.width), Math.abs(b.height)));
          const sizeFactor = minDim <= 44 ? 0.45 : minDim <= 72 ? 0.7 : 1;
          const left0 = b.x - minX;
          const top0 = b.y - minY;
          const bw = Math.max(1, b.width);
          const bh = Math.max(1, b.height);

          const fieldHex = /^#[0-9a-f]{6}$/i.test(String(b.color || '').trim())
            ? String(b.color).trim()
            : '#c8c4bf';
          const tField0 = base * sizeFactor * watercolorDarknessFactor(fieldHex);
          const tField = Math.max(0, Math.min(1, tField0));
          if (tField > 0.001) {
            const jitter = Math.min(bw, bh) * 0.06;
            const fcx =
              left0 +
              bw * 0.5 +
              (hash01(`${b.id || ''}|inf|${copyIdx}|tcx`) - 0.5) * 2 * jitter;
            const fcy =
              top0 +
              bh * 0.5 +
              (hash01(`${b.id || ''}|inf|${copyIdx}|tcy`) - 0.5) * 2 * jitter;
            const gSpanF = Math.max(bw, bh);
            const gMinF = Math.min(bw, bh);
            const cF = hexToRgb(fieldHex);
            const darkF = darkEdgeBoostForColor(fieldHex);

            ctx.save();
            ctx.beginPath();
            traceOrganicBlockPath(ctx, b, copyIdx);
            ctx.clip();

            const cg = ctx.createRadialGradient(
              fcx,
              fcy,
              gMinF * 0.08,
              fcx,
              fcy,
              gSpanF * 0.72
            );
            cg.addColorStop(0, `rgba(255,255,255,${Math.min(0.92, 0.16 * tField).toFixed(3)})`);
            cg.addColorStop(0.55, `rgba(255,255,255,${Math.min(0.45, 0.05 * tField).toFixed(3)})`);
            cg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = cg;
            ctx.fillRect(left0 - 2, top0 - 2, bw + 4, bh + 4);

            const eg = ctx.createRadialGradient(fcx, fcy, gMinF * 0.18, fcx, fcy, gSpanF * 0.92);
            eg.addColorStop(0, `rgba(${cF.r},${cF.g},${cF.b},0)`);
            eg.addColorStop(
              0.65,
              `rgba(${cF.r},${cF.g},${cF.b},${Math.min(0.35, 0.03 * tField).toFixed(3)})`
            );
            eg.addColorStop(
              1,
              `rgba(${cF.r},${cF.g},${cF.b},${Math.min(0.75, 0.19 * tField).toFixed(3)})`
            );
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = eg;
            ctx.fillRect(left0 - 2, top0 - 2, bw + 4, bh + 4);

            if (darkF > 0.001) {
              const dg = ctx.createRadialGradient(fcx, fcy, gMinF * 0.2, fcx, fcy, gSpanF * 0.96);
              dg.addColorStop(0, 'rgba(0,0,0,0)');
              dg.addColorStop(0.74, `rgba(0,0,0,${Math.min(0.4, 0.012 * darkF * tField).toFixed(3)})`);
              dg.addColorStop(
                1,
                `rgba(0,0,0,${Math.min(0.55, 0.085 * darkF * tField).toFixed(3)})`
              );
              ctx.fillStyle = dg;
              ctx.fillRect(left0 - 2, top0 - 2, bw + 4, bh + 4);
            }

            ctx.restore();
          }

          const spec = Utils.insetCircleOrganicSectorPointsLocal(b, 1);
          if (spec.kind === 'none' || !(spec.points && spec.points.length >= 3)) return;
          const innerHex = /^#[0-9a-f]{6}$/i.test(String(b.insetInnerColor || '').trim())
            ? String(b.insetInnerColor).trim()
            : fieldHex;
          const tDisk0 = base * sizeFactor * watercolorDarknessFactor(innerHex);
          const tDisk = Math.max(0, Math.min(1, tDisk0));
          if (tDisk <= 0.001) return;

          const dpts = spec.points.map((p) => [left0 + Number(p[0]), top0 + Number(p[1])]);
          const an = Utils.polygonRadialAnchorFromPoints(dpts);
          if (!an || !(an.span > 0)) return;
          const jitterD = an.span * 0.11;
          const dSeed = `${b.id || ''}|inDisk|${copyIdx}`;
          const cx = an.cx + (hash01(`${dSeed}|cx`) - 0.5) * 2 * jitterD;
          const cy = an.cy + (hash01(`${dSeed}|cy`) - 0.5) * 2 * jitterD;
          const gSpan = Math.max(an.span, 1e-6);
          const gMin = Math.min(gSpan, Math.min(bw, bh));

          let bx0 = Infinity;
          let by0 = Infinity;
          let bx1 = -Infinity;
          let by1 = -Infinity;
          for (const q of dpts) {
            bx0 = Math.min(bx0, q[0]);
            by0 = Math.min(by0, q[1]);
            bx1 = Math.max(bx1, q[0]);
            by1 = Math.max(by1, q[1]);
          }
          const bbw = bx1 - bx0;
          const bbh = by1 - by0;

          const cI = hexToRgb(innerHex);
          const darkI = darkEdgeBoostForColor(innerHex);

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(dpts[0][0], dpts[0][1]);
          for (let k = 1; k < dpts.length; k++) {
            ctx.lineTo(dpts[k][0], dpts[k][1]);
          }
          ctx.closePath();
          ctx.clip();

          const cgc = ctx.createRadialGradient(cx, cy, gMin * 0.08, cx, cy, gSpan * 0.72);
          cgc.addColorStop(0, `rgba(255,255,255,${Math.min(0.92, 0.16 * tDisk).toFixed(3)})`);
          cgc.addColorStop(0.55, `rgba(255,255,255,${Math.min(0.45, 0.05 * tDisk).toFixed(3)})`);
          cgc.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = cgc;
          ctx.fillRect(bx0 - 2, by0 - 2, bbw + 4, bbh + 4);

          const egc = ctx.createRadialGradient(cx, cy, gMin * 0.18, cx, cy, gSpan * 0.92);
          egc.addColorStop(0, `rgba(${cI.r},${cI.g},${cI.b},0)`);
          egc.addColorStop(0.65, `rgba(${cI.r},${cI.g},${cI.b},${Math.min(0.35, 0.03 * tDisk).toFixed(3)})`);
          egc.addColorStop(1, `rgba(${cI.r},${cI.g},${cI.b},${Math.min(0.75, 0.19 * tDisk).toFixed(3)})`);
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = egc;
          ctx.fillRect(bx0 - 2, by0 - 2, bbw + 4, bbh + 4);

          if (darkI > 0.001) {
            const dgc = ctx.createRadialGradient(cx, cy, gMin * 0.2, cx, cy, gSpan * 0.96);
            dgc.addColorStop(0, 'rgba(0,0,0,0)');
            dgc.addColorStop(
              0.74,
              `rgba(0,0,0,${Math.min(0.4, 0.012 * darkI * tDisk).toFixed(3)})`
            );
            dgc.addColorStop(1, `rgba(0,0,0,${Math.min(0.55, 0.085 * darkI * tDisk).toFixed(3)})`);
            ctx.fillStyle = dgc;
            ctx.fillRect(bx0 - 2, by0 - 2, bbw + 4, bbh + 4);
          }

          ctx.restore();
        };

        const applyWatercolorWash = (ctx, b, col, copyIdx, intensity = 1) => {
          if (b.patternType === 'special' && b.specialPatternType === 'insetCircle') {
            applyWatercolorWashInsetPieces(ctx, b, copyIdx, intensity);
            return;
          }
          if (b.patternType === 'special' && b.specialPatternType === 'hst') {
            applyWatercolorWashHstPieces(ctx, b, copyIdx, intensity);
            return;
          }
          const base = Math.max(0, Math.min(1, intensity));
          // Soften watercolor on very small blocks to avoid over-texturing.
          const minDim = Math.max(1, Math.min(Math.abs(b.width), Math.abs(b.height)));
          const sizeFactor = minDim <= 44 ? 0.45 : minDim <= 72 ? 0.7 : 1;
          const t0 = base * sizeFactor * watercolorDarknessFactor(col);
          const t = Math.max(0, Math.min(1, t0));
          if (t <= 0.001) return;
          const c = hexToRgb(col);
          const left = b.x - minX;
          const top = b.y - minY;
          const w = Math.max(1, b.width);
          const h = Math.max(1, b.height);
          const cx = left + w * (0.38 + hash01(`${b.id}|wcx`) * 0.24);
          const cy = top + h * (0.38 + hash01(`${b.id}|wcy`) * 0.24);

          ctx.save();
          ctx.beginPath();
          traceOrganicBlockPath(ctx, b, copyIdx);
          ctx.clip();

          // Center translucency / wash (slightly lighter, lower visual density).
          const centerGrad = ctx.createRadialGradient(
            cx,
            cy,
            Math.min(w, h) * 0.08,
            cx,
            cy,
            Math.max(w, h) * 0.72
          );
          centerGrad.addColorStop(0, `rgba(255,255,255,${Math.min(0.92, 0.16 * t).toFixed(3)})`);
          centerGrad.addColorStop(0.55, `rgba(255,255,255,${Math.min(0.45, 0.05 * t).toFixed(3)})`);
          centerGrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = centerGrad;
          ctx.fillRect(left - 2, top - 2, w + 4, h + 4);

          // Edge pigment concentration (slightly richer color near boundaries).
          const edgeGrad = ctx.createRadialGradient(
            cx,
            cy,
            Math.min(w, h) * 0.18,
            cx,
            cy,
            Math.max(w, h) * 0.92
          );
          edgeGrad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0)`);
          edgeGrad.addColorStop(0.65, `rgba(${c.r},${c.g},${c.b},${Math.min(0.35, 0.03 * t).toFixed(3)})`);
          edgeGrad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},${Math.min(0.75, 0.19 * t).toFixed(3)})`);
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = edgeGrad;
          ctx.fillRect(left - 2, top - 2, w + 4, h + 4);

          // For darkest shapes only, add a subtle extra dark edge pigment ring.
          const darkBoost = darkEdgeBoostForColor(col);
          if (darkBoost > 0.001) {
            const darkEdge = ctx.createRadialGradient(
              cx,
              cy,
              Math.min(w, h) * 0.2,
              cx,
              cy,
              Math.max(w, h) * 0.96
            );
            darkEdge.addColorStop(0, 'rgba(0,0,0,0)');
            darkEdge.addColorStop(0.74, `rgba(0,0,0,${Math.min(0.4, 0.012 * darkBoost * t).toFixed(3)})`);
            darkEdge.addColorStop(1, `rgba(0,0,0,${Math.min(0.55, 0.085 * darkBoost * t).toFixed(3)})`);
            ctx.fillStyle = darkEdge;
            ctx.fillRect(left - 2, top - 2, w + 4, h + 4);
          }

          ctx.restore();
        };

        const getCameraDrift = (tSec) => {
          const u = Math.max(0, Math.min(1, tSec / durationSec));
          const driftEase = 0.35 + 0.65 * smoothstep(u); // keep visible from frame 1, then gently build
          return {
            x: W * 0.0075 * driftEase * Math.sin(u * Math.PI * 1.55 + 0.9),
            y:
              -H * 0.0065 * u +
              H * 0.0055 * driftEase * Math.sin(u * Math.PI * 1.85 + 1.15)
          };
        };
        const wrapTextLines = (ctx, text, maxWidth) => {
          const words = String(text || '').split(/\s+/).filter(Boolean);
          const lines = [];
          let line = '';
          for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (!line || ctx.measureText(candidate).width <= maxWidth) {
              line = candidate;
            } else {
              lines.push(line);
              line = word;
            }
          }
          if (line) lines.push(line);
          return lines;
        };
        const stripEaseOut = (t) => 1 - Math.pow(1 - t, 3);
        const stripHash = (s) => hash01(`strip|${s}`);
        const buildHandCutStripPath = (ctx, w, h, seed) => {
          const hw = w / 2;
          const hh = h / 2;
          const amp = Math.max(1.4, Math.min(4.2, Math.min(w, h) * 0.05));
          const n = (k) => (stripHash(`${seed}|${k}`) - 0.5) * 2 * amp;
          const pts = [
            { x: -hw + n('c1x'), y: -hh + n('c1y') },
            { x: hw + n('c2x'), y: -hh + n('c2y') },
            { x: hw + n('c3x'), y: hh + n('c3y') },
            { x: -hw + n('c4x'), y: hh + n('c4y') }
          ];
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 0; i < 4; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % 4];
            const mx = (a.x + b.x) / 2 + n(`m${i}x`);
            const my = (a.y + b.y) / 2 + n(`m${i}y`);
            ctx.quadraticCurveTo(mx, my, b.x, b.y);
          }
          ctx.closePath();
        };
        const drawPaperStrip = (ctx, strip, alpha = 1) => {
          ctx.save();
          ctx.translate(strip.x, strip.y);
          ctx.rotate(strip.angle);
          ctx.globalAlpha = alpha;
          ctx.shadowColor = 'rgba(0,0,0,0.14)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetX = 1.5;
          ctx.shadowOffsetY = 2.5;
          buildHandCutStripPath(ctx, strip.w, strip.h, strip.seed);
          ctx.fillStyle = '#ebe8e3';
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillStyle = '#3f3a35';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.font = strip.font;
          const tx = -strip.w / 2 + strip.padX;
          const lines = Array.isArray(strip.lines) && strip.lines.length ? strip.lines : [strip.text];
          const lh = Number(strip.lh) > 0 ? Number(strip.lh) : 0;
          if (lines.length > 1 && lh > 0) {
            const totalTextH = (lines.length - 1) * lh;
            let ty = -totalTextH / 2;
            for (const ln of lines) {
              ctx.fillText(ln, tx, ty);
              ty += lh;
            }
          } else {
            ctx.fillText(lines[0] || '', tx, 1);
          }
          ctx.restore();
        };
        let cachedStripPlan = null;
        const getQuoteStripPlan = (ctx) => {
          if (cachedStripPlan) return cachedStripPlan;
          if (!quoteText && !quoteAuthor) {
            cachedStripPlan = [];
            return cachedStripPlan;
          }
          const strips = getLayoutBStoryQuotePlan(ctx, {
            quoteText,
            quoteAuthor,
            layoutW: W,
            layoutH: H,
            dateKey: quoteDateKey,
            usePostQuoteLayout: true
          }).map((s, i) => ({
            ...s,
            text: (s.lines || []).join(' ').trim(),
            fromSide: s.role === 'author' ? 1 : ((i % 2 === 0) ? -1 : 1),
            start: i * 0.07,
            end: 0.24 + i * 0.13
          }));
          cachedStripPlan = normalizeQuoteStripTiming(strips);
          return cachedStripPlan;
        };
        const drawQuoteOverlay = (ctx, revealProgress) => {
          const strips = getQuoteStripPlan(ctx);
          if (!strips.length) return;
          const rp = Math.max(0, Math.min(1, revealProgress));
          for (const s of strips) {
            const localRaw = Math.max(0, Math.min(1, (rp - s.start) / Math.max(0.001, s.end - s.start)));
            if (localRaw <= 0.001) continue;
            // Choppy stop-motion entrance: step-quantized movement + per-step jitter.
            const steps = 8;
            const stepIdx = Math.max(0, Math.min(steps, Math.floor(localRaw * steps)));
            const stepT = stepIdx / steps;
            const e = stripEaseOut(stepT);
            const offscreenX = s.fromSide < 0 ? -s.w * 0.9 : W + s.w * 0.9;
            const crawlAmpX = (1 - e) * (W * 0.045);
            const crawlAmpY = (1 - e) * (H * 0.017);
            const zigSign = stepIdx % 2 === 0 ? -1 : 1;
            const jitterX = (stripHash(`${s.seed}|sx|${stepIdx}`) - 0.5) * W * 0.014 * (1 - e);
            const jitterY = (stripHash(`${s.seed}|sy|${stepIdx}`) - 0.5) * H * 0.011 * (1 - e);
            const seesaw = Math.sin(stepIdx * 1.15 + stripHash(`${s.seed}|phase`) * Math.PI * 2);
            const crabX = (1 - e) * W * 0.014 * seesaw;
            const x = offscreenX + (s.x - offscreenX) * e + crawlAmpX * zigSign + jitterX + crabX;
            const y = s.y + crawlAmpY * zigSign * 0.8 + jitterY;
            const swing = (1 - e) * 0.09 * seesaw + (1 - e) * 0.035 * zigSign;
            const angle = s.angle + swing;
            const alpha = 1; // no fade; stop-motion movement only
            const drawStrip = { ...s, x, y, angle };
            drawPaperStrip(ctx, drawStrip, alpha);
          }
        };

        const drawQuiltCopyMatteUnderBlocks = (ctx) => {
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.fillStyle = WARM_QUILT_MATTE;
          ctx.fillRect(0, 0, bw, bh);
          ctx.restore();
        };

        const drawFrameBlockItems = (drawItems, tSec = 0, options = {}) => {
          const {
            clear = true,
            applyGrain = true,
            globalAlpha = 1,
            zoom = 1,
            rotationDeg = 0,
            translateX = 0,
            translateY = 0,
            clipRect = null,
            matteColor = ''
          } = options || {};
          const ctx = canvas.getContext('2d');
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (clear) {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);
          }
          ctx.save();
          if (clipRect && typeof clipRect === 'object') {
            const cx = Number(clipRect.x || 0);
            const cy = Number(clipRect.y || 0);
            const cw = Math.max(0, Number(clipRect.w || 0));
            const ch = Math.max(0, Number(clipRect.h || 0));
            if (cw > 0 && ch > 0) {
              ctx.beginPath();
              ctx.rect(cx, cy, cw, ch);
              ctx.clip();
            }
          }
          const drift = getCameraDrift(tSec);
          ctx.globalAlpha = Math.max(0, Math.min(1, Number(globalAlpha) || 0));
          if (Math.abs(Number(translateX) || 0) > 1e-5 || Math.abs(Number(translateY) || 0) > 1e-5) {
            ctx.translate(Number(translateX) || 0, Number(translateY) || 0);
          }
          if (Math.abs((Number(rotationDeg) || 0)) > 1e-5 || Math.abs((Number(zoom) || 1) - 1) > 1e-5) {
            ctx.translate(W / 2, H / 2);
            ctx.rotate(((Number(rotationDeg) || 0) * Math.PI) / 180);
            ctx.scale(Number(zoom) || 1, Number(zoom) || 1);
            ctx.translate(-W / 2, -H / 2);
          }
          if (typeof matteColor === 'string' && matteColor.trim()) {
            // Extra canvas backing during sheet slide/rotate (in addition to per-copy quilt matte).
            ctx.fillStyle = matteColor.trim();
            ctx.fillRect(-W * 0.35, -H * 0.35, W * 1.7, H * 1.7);
          }
          ctx.translate(drift.x, drift.y);
          for (let copyIdx = 0; copyIdx < copyPlacements.length; copyIdx++) {
            const placement = copyPlacements[copyIdx];
            ctx.save();
            ctx.translate(0, placement.yPx);
            ctx.scale(scale, scale);
            if (placement.mirrored) {
              // Mirror top/bottom copies both vertically and horizontally.
              ctx.translate(bw, bh);
              ctx.scale(-1, -1);
            }
            drawQuiltCopyMatteUnderBlocks(ctx);
            for (const item of drawItems) {
              const b = item.block;
              const col = /^#[0-9A-Fa-f]{6}$/.test(String(b.color || '').trim())
                ? b.color
                : '#c8c4bf';
              ctx.fillStyle = col;
              ctx.globalAlpha = Math.max(0, Math.min(1, Number(item.alpha ?? 1)));
              const sc = Math.max(0.01, Number(item.scale ?? 1));
              const watercolor = Math.max(0, Math.min(1, Number(item.watercolor ?? 1)));
              const offsetX = Number(item.offsetX || 0);
              const offsetY = Number(item.offsetY || 0);
              const itemRotationDeg = Number(item.rotationDeg || 0);
              const needsTransform =
                Math.abs(sc - 1) > 1e-4 ||
                Math.abs(offsetX) > 1e-4 ||
                Math.abs(offsetY) > 1e-4 ||
                Math.abs(itemRotationDeg) > 1e-4;
              if (needsTransform) {
                const cx = b.x - minX + b.width / 2;
                const cy = b.y - minY + b.height / 2;
                ctx.save();
                ctx.translate(cx, cy);
                if (Math.abs(itemRotationDeg) > 1e-4) {
                  ctx.rotate((itemRotationDeg * Math.PI) / 180);
                }
                ctx.scale(sc, sc);
                if (Math.abs(offsetX) > 1e-4 || Math.abs(offsetY) > 1e-4) {
                  ctx.translate(offsetX, offsetY);
                }
                ctx.translate(-cx, -cy);
                drawOrganicBlock(ctx, b, copyIdx);
                applyWatercolorWash(ctx, b, col, copyIdx, watercolor);
                ctx.restore();
              } else {
                drawOrganicBlock(ctx, b, copyIdx);
                applyWatercolorWash(ctx, b, col, copyIdx, watercolor);
              }
            }
            ctx.restore();
          }
          ctx.restore();
          if (applyGrain) {
            Utils.applyFilmGrain(ctx, W, H, tSec);
          }
        };
        const drawFrameBlocks = (drawBlocks) =>
          drawFrameBlockItems((drawBlocks || []).map((b) => ({ block: b, alpha: 1, scale: 1 })));

        const buildReplayTransitionItems = (events, progress) => {
          const Kk = events.length;
          if (Kk <= 0) return [];
          if (progress >= Kk) {
            const finalBlocks = this._replayQuiltStateAfterColorEvents(events, Kk);
            return finalBlocks.map((b) => ({ block: b, alpha: 1, scale: 1 }));
          }
          const idx = Math.max(0, Math.min(Kk - 1, Math.floor(progress)));
          const frac = Math.max(0, Math.min(1, progress - idx));
          const eased = smoothstep(frac);
          const base = this._replayQuiltStateAfterColorEvents(events, idx);
          const ev = events[idx];
          if (!ev || !ev.parent || !Array.isArray(ev.children) || ev.children.length === 0) {
            return base.map((b) => ({ block: b, alpha: 1, scale: 1 }));
          }
          const parentId = ev.parent.id;
          const parentInBase = base.find((b) => b.id === parentId);
          if (!parentInBase) {
            return base.map((b) => ({ block: b, alpha: 1, scale: 1 }));
          }
          const rest = base.filter((b) => b.id !== parentId).map((b) => ({ block: b, alpha: 1, scale: 1 }));
          const pop = Math.max(0, Math.min(1, (eased - 0.15) / 0.85));
          const popEase = smoothstep(pop);
          const parentAlpha = pop < 0.75 ? 1 : Math.max(0, 1 - (pop - 0.75) / 0.25);
          const items = rest.concat([{ block: parentInBase, alpha: parentAlpha, scale: 1 }]);
          for (const child of ev.children) {
            const childScale = 0.9 + 0.1 * popEase;
            const childAlpha = 0.12 + 0.88 * popEase;
            items.push({ block: child, alpha: childAlpha, scale: childScale });
          }
          return items;
        };

        const drawFrameFade = (tSec) => {
          const ctx = canvas.getContext('2d');
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, W, H);
          const drift = getCameraDrift(tSec);
          ctx.save();
          ctx.translate(drift.x, drift.y);
          const u = Math.max(0, Math.min(1, tSec / durationSec));
          for (let copyIdx = 0; copyIdx < copyPlacements.length; copyIdx++) {
            const placement = copyPlacements[copyIdx];
            ctx.save();
            ctx.translate(0, placement.yPx);
            ctx.scale(scale, scale);
            if (placement.mirrored) {
              // Mirror top/bottom copies both vertically and horizontally.
              ctx.translate(bw, bh);
              ctx.scale(-1, -1);
            }
            drawQuiltCopyMatteUnderBlocks(ctx);
            for (let i = 0; i < n; i++) {
              const b = sorted[i];
              const col = /^#[0-9A-Fa-f]{6}$/.test(String(b.color || '').trim())
                ? b.color
                : '#c8c4bf';
              const wave = u * (n + 10) + 0.35 - i * 0.95;
              const p = Math.max(0, Math.min(1, wave));
              const e = smoothstep(p);
              if (e <= 0.001) continue;

              const cx = b.x - minX + b.width / 2;
              const cy = b.y - minY + b.height / 2;
              ctx.save();
              ctx.globalAlpha = e;
              ctx.translate(cx, cy);
              const sc = 0.82 + 0.18 * e;
              ctx.scale(sc, sc);
              ctx.translate(-cx, -cy);
              ctx.fillStyle = col;
              drawOrganicBlock(ctx, b, copyIdx);
              ctx.restore();
            }
            ctx.restore();
          }
          ctx.restore();
          Utils.applyFilmGrain(ctx, W, H, tSec);
        };

        /**
         * Adds meditative "hold" plateaus along split progress while preserving total duration.
         * Example: hold briefly every N splits, then continue.
         */
        const applyHoldMomentsToProgress = (uNorm, maxSteps) => {
          if (!Number.isFinite(maxSteps) || maxSteps < 2) {
            return Math.max(0, Math.min(maxSteps || 0, (uNorm || 0) * (maxSteps || 0)));
          }
          const holdEvery = 7; // hold after every 7 splits
          const holdDurationInSteps = 0.24; // brief plateau length in "split units"
          const markers = [];
          for (let m = holdEvery; m < maxSteps; m += holdEvery) markers.push(m);
          if (!markers.length) return Math.max(0, Math.min(maxSteps, uNorm * maxSteps));

          const totalVirtualSteps = maxSteps + markers.length * holdDurationInSteps;
          let raw = Math.max(0, Math.min(1, uNorm)) * totalVirtualSteps;
          let accumulatedHold = 0;
          for (const marker of markers) {
            const holdStart = marker + accumulatedHold;
            const holdEnd = holdStart + holdDurationInSteps;
            if (raw < holdStart) break;
            if (raw <= holdEnd) return marker;
            raw -= holdDurationInSteps;
            accumulatedHold += holdDurationInSteps;
          }
          return Math.max(0, Math.min(maxSteps, raw));
        };

        const K = replayPlan ? replayPlan.events.length : mergePlan ? mergePlan.mergeHistory.length : 0;
        // Cover behavior: start on a clean final quilt frame (no text), then run build animation.
        // ~0.3s static hold is a good balance for IG cover + early slide start (see durationSec in reel opts).
        const COVER_HOLD_SEC = 0.3;
        const COVER_HOLD_RATIO =
          durationSec > 0
            ? Math.max(0, Math.min(0.45, COVER_HOLD_SEC / durationSec))
            : 0;
        // Handcrafted transition: cover zig-zags off; keep this window short so main animation has more time.
        const COVER_TRANSITION_SEC = Math.min(0.55, Math.max(0.32, durationSec * 0.055));
        const COVER_TRANSITION_RATIO =
          durationSec > 0
            ? Math.max(
                0.07,
                Math.min(0.24, COVER_TRANSITION_SEC / Math.max(0.001, durationSec * (1 - COVER_HOLD_RATIO)))
              )
            : 0.12;
        // Reserve tail time so quote strips finish settling before the reel ends.
        const QUOTE_SETTLE_TAIL = 0.22;
        const getFinalReelItems = () => {
          if (replayPlan) {
            const finalBlocks = this._replayQuiltStateAfterColorEvents(replayPlan.events, K);
            return (finalBlocks || []).map((b) => ({ block: b, alpha: 1, scale: 1 }));
          }
          if (mergePlan) {
            const finalBlocks = this._quiltBlocksAfterSplitSteps(mergePlan.root, mergePlan.mergeHistory, K);
            return (finalBlocks || []).map((b) => ({ block: b, alpha: 1, scale: 1 }));
          }
          return sorted.map((b) => ({ block: b, alpha: 1, scale: 1 }));
        };
        const drawCoverSheetSlideOverlay = (progress, tSec, transitionEase) => {
          const p = Math.max(0, Math.min(1, progress));
          const eased = smoothstep(p);
          // Tighter beat ladder = faster visual exit; each step is a clear stop-motion pose.
          const beatTable = [0, 0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.8, 0.92, 1];
          let beatIdx = 0;
          for (let i = 0; i < beatTable.length; i++) {
            if (eased >= beatTable[i]) beatIdx = i;
          }
          // Cumulative zig-zag: alternates L/R while drifting down+right, then final shove off-screen.
          const exitY = H + 110;
          const zx = (n) => W * n;
          const zy = (n) => H * n;
          const zigZagStops = [
            { x: 0, y: 0, rot: 0 },
            { x: zx(0.034), y: zy(0.04), rot: -0.22 },
            { x: -zx(0.042), y: zy(0.11), rot: 0.18 },
            { x: zx(0.05), y: zy(0.2), rot: -0.14 },
            { x: -zx(0.03), y: zy(0.3), rot: 0.12 },
            { x: zx(0.06), y: zy(0.42), rot: -0.1 },
            { x: -zx(0.025), y: zy(0.55), rot: 0.08 },
            { x: zx(0.08), y: zy(0.68), rot: -0.06 },
            { x: zx(0.11), y: zy(0.82), rot: 0.04 },
            { x: zx(0.14), y: exitY, rot: 0 }
          ];
          const si = Math.min(beatIdx, zigZagStops.length - 1);
          const z = zigZagStops[si];
          const moveEase = 0.22 * transitionEase;
          drawFrameBlockItems(getFinalReelItems(), tSec, {
            clear: false,
            applyGrain: false,
            globalAlpha: 1,
            zoom: 1 + 0.018 * transitionEase,
            rotationDeg: z.rot + moveEase,
            translateX: z.x,
            translateY: z.y,
            matteColor: WARM_QUILT_MATTE
          });
        };
        const settleQuoteProgress = (baseProgress) => {
          const q = Math.max(0, Math.min(1, Number(baseProgress) || 0));
          const cutoff = Math.max(0.55, 1 - QUOTE_SETTLE_TAIL);
          return Math.max(0, Math.min(1, q / Math.max(0.001, cutoff)));
        };
        const normalizeQuoteStripTiming = (strips) => {
          if (!Array.isArray(strips) || strips.length === 0) return strips || [];
          const maxEnd = strips.reduce((m, s) => Math.max(m, Number(s?.end) || 0), 0);
          const targetMaxEnd = 0.9;
          if (maxEnd <= targetMaxEnd + 1e-6) return strips;
          const k = targetMaxEnd / Math.max(0.001, maxEnd);
          return strips.map((s) => ({
            ...s,
            start: (Number(s.start) || 0) * k,
            end: (Number(s.end) || 0) * k
          }));
        };
        const drawFrame = (tSec) => {
          const tClamped = Math.max(0, Math.min(durationSec, tSec));
          const normalizedTime = durationSec > 0 ? tClamped / durationSec : 1;
          if (normalizedTime <= COVER_HOLD_RATIO) {
            // Opening cover frame: final quilt background only (no quote strips yet).
            drawFrameBlockItems(getFinalReelItems(), tClamped);
            return;
          }
          const activeNorm = Math.max(
            0,
            Math.min(1, (normalizedTime - COVER_HOLD_RATIO) / Math.max(0.001, 1 - COVER_HOLD_RATIO))
          );
          const transitionRaw = Math.max(0, Math.min(1, activeNorm / Math.max(0.001, COVER_TRANSITION_RATIO)));
          const transitionEase = smoothstep(transitionRaw);
          const inCoverTransition = transitionRaw < 0.999;
          if (!replayPlan && !mergePlan) {
            drawFrameFade(activeNorm * durationSec);
            drawQuoteOverlay(canvas.getContext('2d'), inCoverTransition ? 0 : activeNorm);
            if (inCoverTransition) {
              drawCoverSheetSlideOverlay(transitionRaw, tClamped, transitionEase);
            }
            return;
          }
          const uRaw = activeNorm;
          // Slightly slower opening, then recover to current overall timing.
          const introCut = 0.22;
          const introProgress = 0.15;
          const u = uRaw < introCut
            ? (uRaw / introCut) * introProgress
            : introProgress + ((uRaw - introCut) / (1 - introCut)) * (1 - introProgress);
          /** Hold full quilt visible in the last ~10% so the recorder captures the final frame cleanly */
          const uMap = u < 0.9 ? u / 0.9 : 1;
          const heldProgress = applyHoldMomentsToProgress(uMap, K);
          if (replayPlan) {
            const progress = Math.max(0, Math.min(K, heldProgress));
            const items = buildReplayTransitionItems(replayPlan.events, progress);
            drawFrameBlockItems(items, tClamped);
            const baseQuoteProgress = inCoverTransition
              ? 0
              : K > 0
                ? Math.max(0, Math.min(1, heldProgress / K))
                : uMap;
            const quoteProgress = settleQuoteProgress(baseQuoteProgress);
            drawQuoteOverlay(canvas.getContext('2d'), quoteProgress);
            if (inCoverTransition) {
              drawCoverSheetSlideOverlay(transitionRaw, tClamped, transitionEase);
            }
            return;
          }
          const k = Math.min(K, Math.max(0, Math.ceil(heldProgress - 1e-9)));
          const drawBlocks = this._quiltBlocksAfterSplitSteps(mergePlan.root, mergePlan.mergeHistory, k);
          drawFrameBlockItems((drawBlocks || []).map((b) => ({ block: b, alpha: 1, scale: 1 })), tClamped);
          const baseQuoteProgress = inCoverTransition
            ? 0
            : K > 0
              ? Math.max(0, Math.min(1, heldProgress / K))
              : uMap;
          const quoteProgress = settleQuoteProgress(baseQuoteProgress);
          drawQuoteOverlay(canvas.getContext('2d'), quoteProgress);
          if (inCoverTransition) {
            drawCoverSheetSlideOverlay(transitionRaw, tClamped, transitionEase);
          }
        };

        drawFrame(0);

        const mimeCandidates = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm'
        ];
        const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
        if (!mimeType) {
          throw new Error('No supported WebM mime type');
        }

        const stream = canvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size) chunks.push(e.data);
        };

        const totalFrames = Math.round(durationSec * fps);
        const frameDt = 1 / fps;

        return new Promise((resolve, reject) => {
          recorder.onerror = (ev) => reject(ev.error || new Error('MediaRecorder error'));
          recorder.onstop = () => {
            try {
              const blob = new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' });
              resolve({ blob, mode: reelMode });
            } catch (err) {
              reject(err);
            }
          };

          recorder.start(100);
          let frame = 0;

          const step = () => {
            try {
              if (frame >= totalFrames) {
                drawFrame(durationSec);
                setTimeout(() => {
                  try {
                    if (typeof recorder.requestData === 'function') {
                      recorder.requestData();
                    }
                    recorder.stop();
                  } catch (e) {
                    reject(e);
                  }
                }, 220);
                return;
              }
              drawFrame(frame * frameDt);
              frame += 1;
              setTimeout(step, 1000 / fps);
            } catch (err) {
              try {
                recorder.stop();
              } catch (_) {
                /* */
              }
              reject(err);
            }
          };

          step();
        });
      }

      // Test Instagram image: feed post 4:5 Layout B (includes speaker cutout when available)

      async handleAddColorFamilyBlocks() {
        return this.runAdminQuiltMutation('Add Color Variations', () => this.handleAddColorFamilyBlocksByCount(10));
      }

      async handleAdd25ColorFamilyBlocks() {
        return this.runAdminQuiltMutation('Add 25 Color Variations', () => this.handleAddColorFamilyBlocksByCount(25));
      }

      async handleAddColorFamilyBlocksByCount(blockCount = 10) {
        try {
          // Fallback only when the quilt has no valid colors to sample (empty / corrupt state).
          const expandedRumiColors = [
            // Original 50 colors
            "#ea9b9a", "#de6c61", "#df9368", "#d57d39", "#d8a746", 
            "#caa22b", "#f6eed5", "#decd61", "#dbcc57", "#ded561",
            "#9ab125", "#6ade61", "#1f931f", "#61de61", "#61de76", 
            "#209750", "#1f938a", "#61dedb", "#2bcaca", "#61c9de",
            "#61c9de", "#70cae1", "#61c3de", "#61c1de", "#4aa9d9", 
            "#61b2de", "#afd8ee", "#3177d3", "#6182de", "#617cde",
            "#1f2193", "#7e7de3", "#251f93", "#6c61de", "#4024a8", 
            "#8061de", "#8461de", "#9361de", "#ae61de", "#b261de",
            "#c961de", "#cb61de", "#ce2cb0", "#de61ba", "#eba2ce", 
            "#de6193", "#de618f", "#bd283c", "#931f25", "#de6165",
            // Additional 50 tonal variants
            "#f0a5a4", "#e67a6f", "#e5a076", "#d98a4f", "#e0b55c",
            "#d4b03b", "#f8f2e5", "#e6d771", "#e3d667", "#e6d771",
            "#a8c135", "#7ae671", "#3fa33f", "#71e671", "#71e686",
            "#30a760", "#3fa39a", "#71e6eb", "#3bcaca", "#71c9ee",
            "#71c9ee", "#80dae1", "#71c3ee", "#71c1ee", "#5ab9e9",
            "#71b2ee", "#bfd8ee", "#4177e3", "#7182ee", "#717cee",
            "#3f3193", "#8e7de3", "#351f93", "#7c61ee", "#5024b8",
            "#9061ee", "#9461ee", "#a361ee", "#be61ee", "#c261ee",
            "#d961ee", "#db61ee", "#de2cc0", "#ee61ca", "#fba2de",
            "#ee6193", "#ee618f", "#cd283c", "#a31f35", "#ee6165"
          ];

          const normalizedCount = Math.max(1, Math.min(blockCount, expandedRumiColors.length));

          const blocks = this.quiltEngine?.blocks;
          const quiltColorPool = Array.isArray(blocks)
            ? blocks.map((b) => b && b.color).filter((c) => c && Utils.validateHexColor(c))
            : [];

          /** Frequency-weighted: colors that occupy more blocks are chosen more often. */
          let selectedColors;

          if (quiltColorPool.length > 0) {
            selectedColors = [];
            for (let i = 0; i < normalizedCount; i++) {
              const hex = quiltColorPool[Math.floor(Math.random() * quiltColorPool.length)];
              selectedColors.push(this._createSubtleQuiltColorVariant(hex));
            }
          } else {
            const shuffled = [...expandedRumiColors].sort(() => 0.5 - Math.random());
            selectedColors = shuffled.slice(0, normalizedCount);
          }

          // Add blocks using sampled colors
          let successfulAdds = 0;
          for (let i = 0; i < normalizedCount; i++) {
            const result = this.quiltEngine.addColor(selectedColors[i]);
            
            if (result) {
              successfulAdds++;
              // Find the new block for animation
              let newBlockIndex = -1;
              if (result.newBlocks && result.newBlocks.length > 0) {
                const newBlock = result.newBlocks.find(block => block.color === selectedColors[i]);
                if (newBlock) {
                  newBlockIndex = this.quiltEngine.blocks.findIndex(block => block.id === newBlock.id);
                }
              } else if (result.id) {
                newBlockIndex = this.quiltEngine.blocks.findIndex(block => block.id === result.id);
              }
              
              // Set the last added index for animation
              if (newBlockIndex !== -1) {
                this.renderer.setLastAddedIndex(newBlockIndex);
              }
              this.recordAdminGeneratedContributor();

              if (successfulAdds % 5 === 0) {
                this.renderQuilt();
                await this.saveAdminQuiltMutation('Add Color Variations');
              }
            }
          }
          
          if (successfulAdds % 5 !== 0) {
            this.renderQuilt();
            await this.saveAdminQuiltMutation('Add Color Variations');
          }

          // Update admin stats if menu is open
          this.updateAdminStats();
          
          this.uiService.showToast(`Added ${normalizedCount} subtle color variations`);
          
        } catch (error) {
          this.errorHandler.handleError(error, 'addColorFamilyBlocks');
        }
      }

      async handleSplitLargestBlockWithPopularColor() {
        return this.runAdminQuiltMutation('Split Largest Block', async () => {
        try {
          const blocks = Array.isArray(this.quiltEngine?.blocks) ? this.quiltEngine.blocks : [];
          if (!blocks.length) {
            this.uiService.showToast('No quilt blocks available to split');
            return;
          }
          const largest = [...blocks]
            .filter((b) => b && b.width > 0 && b.height > 0)
            .sort((a, b) => b.width * b.height - a.width * a.height)[0];
          if (!largest) {
            this.uiService.showToast('No eligible block found');
            return;
          }

          const counts = new Map();
          for (const b of blocks) {
            const c = b && typeof b.color === 'string' ? b.color : '';
            if (!c || !Utils.validateHexColor(c)) continue;
            counts.set(c, (counts.get(c) || 0) + 1);
          }
          let ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
          if (!ranked.length) {
            this.uiService.showToast('No valid quilt colors to sample');
            return;
          }

          // Prefer a popular color that is not identical to the block's current color.
          let popularHex = (ranked.find(([hex]) => hex !== largest.color) || ranked[0])[0];
          if (popularHex === largest.color) {
            // If every block has same color, create a subtle variation so split remains visible.
            const hsl = this.hexToHsl(popularHex);
            const delta = Math.random() < 0.5 ? -0.08 : 0.08;
            const newL = Math.max(0.12, Math.min(0.9, hsl.l + delta));
            popularHex = Utils.hslToHex(hsl.h, hsl.s * 100, newL * 100);
          }

          const split = this.quiltEngine.splitSpecificBlock(largest, popularHex);
          if (!split) {
            this.uiService.showToast('Could not split largest block');
            return;
          }

          if (split.newBlocks && split.newBlocks.length > 0) {
            const newest = split.newBlocks[split.newBlocks.length - 1];
            const newBlockIndex = this.quiltEngine.blocks.findIndex((b) => b.id === newest.id);
            if (newBlockIndex !== -1) this.renderer.setLastAddedIndex(newBlockIndex);
          }

          this.recordAdminGeneratedContributor();
          this.renderQuilt();
          await this.saveAdminQuiltMutation('Split Largest Block');
          this.updateAdminStats();
          this.uiService.showToast('Split largest block with a popular quilt color');
        } catch (error) {
          this.errorHandler.handleError(error, 'splitLargestBlockWithPopularColor');
        }
        });
      }

      analyzeColorFamilies() {
        const colorCounts = {};
        const familyCounts = {};
        
        // Count each color and determine its family
        this.quiltEngine.blocks.forEach(block => {
          const color = block.color;
          colorCounts[color] = (colorCounts[color] || 0) + 1;
          
          const family = this.getColorFamily(color);
          if (!familyCounts[family.name]) {
            familyCounts[family.name] = {
              name: family.name,
              baseColor: family.baseColor,
              count: 0,
              colors: []
            };
          }
          familyCounts[family.name].count += 1;
          if (!familyCounts[family.name].colors.includes(color)) {
            familyCounts[family.name].colors.push(color);
          }
        });
        
        // Convert to array and sort by count
        const families = Object.values(familyCounts).sort((a, b) => b.count - a.count);
        
        return families;
      }

      getColorFamily(color) {
        // Convert hex to HSL for better color family detection
        const hsl = this.hexToHsl(color);
        const hue = hsl.h;
        const saturation = hsl.s;
        const lightness = hsl.l;
        
        // Define color families based on hue ranges
        if (hue >= 0 && hue < 30) return { name: 'Red', baseColor: '#ff6b6b' };
        if (hue >= 30 && hue < 60) return { name: 'Orange', baseColor: '#ffa726' };
        if (hue >= 60 && hue < 90) return { name: 'Yellow', baseColor: '#ffeb3b' };
        if (hue >= 90 && hue < 150) return { name: 'Green', baseColor: '#4caf50' };
        if (hue >= 150 && hue < 210) return { name: 'Cyan', baseColor: '#00bcd4' };
        if (hue >= 210 && hue < 270) return { name: 'Blue', baseColor: '#2196f3' };
        if (hue >= 270 && hue < 330) return { name: 'Magenta', baseColor: '#e91e63' };
        if (hue >= 330 && hue < 360) return { name: 'Pink', baseColor: '#ff9ff3' };
        
        // Fallback for grays/whites/blacks
        if (saturation < 0.1) {
          if (lightness > 0.8) return { name: 'White', baseColor: '#ffffff' };
          if (lightness < 0.2) return { name: 'Black', baseColor: '#000000' };
          return { name: 'Gray', baseColor: '#9e9e9e' };
        }
        
        return { name: 'Other', baseColor: color };
      }

      async _fetchQuiltNameWordsFromServer() {
        const blocks = this.quiltEngine?.blocks || [];
        const families = this.analyzeColorFamilies();
        const baseUrl = this._getQuiltNameApiBaseUrl();
        const dateKey = (() => {
          const d = new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        })();
        const res = await fetch(`${baseUrl}/api/quilt-name-words`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            colorFamilies: families.slice(0, 5),
            blockCount: blocks.length,
            dateKey
          })
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = await res.json();
        if (!data.success || !Array.isArray(data.words)) throw new Error(data.error || 'No words returned');
        return data.words;
      }

      _getQuiltNameApiBaseUrl() {
        const configured = String(
          (typeof CONFIG !== 'undefined' && CONFIG.BACKEND?.baseUrl) ||
            ''
        ).replace(/\/$/, '');
        const origin = String(window.location?.origin || '').replace(/\/$/, '');
        if (configured) return configured;
        return /^https?:\/\//i.test(origin) ? origin : '';
      }

      _generateQuiltWordCloud() {
        const blocks = this.quiltEngine?.blocks || [];
        const total = blocks.length;
        const pick = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

        const families = this.analyzeColorFamilies();
        const topFamily = families[0]?.name || 'Gray';
        const secondFamily = families[1]?.name;
        const colorWords = {
          Red:     ['Crimson', 'Scarlet', 'Ember', 'Rust', 'Cardinal', 'Blaze', 'Cinnabar'],
          Orange:  ['Amber', 'Copper', 'Harvest', 'Flame', 'Ochre', 'Terracotta', 'Persimmon'],
          Yellow:  ['Saffron', 'Gilt', 'Goldenrod', 'Straw', 'Flax', 'Haze', 'Beeswax'],
          Green:   ['Sage', 'Moss', 'Fern', 'Verdant', 'Juniper', 'Celadon', 'Verdigris'],
          Cyan:    ['Teal', 'Seafoam', 'Lagoon', 'Mist', 'Brine', 'Shoal', 'Glacial'],
          Blue:    ['Indigo', 'Cobalt', 'Dusk', 'Cerulean', 'Periwinkle', 'Slate', 'Woad'],
          Magenta: ['Plum', 'Violet', 'Mauve', 'Twilight', 'Orchid', 'Heather', 'Mulberry'],
          Pink:    ['Blush', 'Rose', 'Petal', 'Bloom', 'Carnation', 'Flush', 'Quartz'],
          White:   ['Linen', 'Chalk', 'Snow', 'Ivory', 'Alabaster', 'Birch', 'Calico'],
          Black:   ['Onyx', 'Midnight', 'Ink', 'Coal', 'Pitch', 'Crow', 'Raven'],
          Gray:    ['Ash', 'Stone', 'Pewter', 'Fog', 'Flint', 'Graphite', 'Pumice'],
        };
        const primary = pick(colorWords[topFamily] || ['Neutral'], 4);
        const secondary = secondFamily && colorWords[secondFamily]
          ? pick(colorWords[secondFamily], 2)
          : pick(colorWords.Gray, 2);

        const feelWords =
          total < 10 ? ['Sparse', 'Open', 'Still', 'Thin', 'Early'] :
          total < 25 ? ['Settled', 'Even', 'Gathered', 'Whole', 'Calm'] :
                       ['Dense', 'Layered', 'Full', 'Stacked', 'Crowded'];
        const feel = pick(feelWords, 2);

        const nouns = pick([
          'Almost', 'Leftover', 'Borrowed', 'Wrong', 'Overhead',
          'Tuesday', 'Nervous', 'Secondhand', 'Nearby', 'Overnight',
          'Sideways', 'Offhand', 'Familiar', 'Spare', 'Crooked',
          'Passing', 'Overdue', 'Stuck', 'Found', 'Loose',
          'Halfway', 'Waiting', 'Taken', 'Broken', 'Soft',
          'Careful', 'Missing', 'Early', 'Shared', 'Given',
        ], 12);

        return [...primary, ...secondary, ...feel, ...nouns].sort(() => Math.random() - 0.5);
      }

      handleNameTodaysQuilt() {
        document.querySelectorAll('.admin-name-quilt-modal').forEach((el) => el.remove());

        const d = new Date();
        const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const contributorCount = this.quiltEngine?.submissionCount ?? 0;
        const baseUrl = this._getQuiltNameApiBaseUrl();
        const voteKey = `quiltNameVote_${dateKey}`;
        let myVote = localStorage.getItem(voteKey) || null;
        let firestoreUnsub = null;
        let currentNameDoc = null;
        const isBallotCalibrate = (() => {
          try {
            return new URLSearchParams(window.location.search || '').get('nameBallotCalibrate') === '1';
          } catch (_) {
            return false;
          }
        })();

        const modal = document.createElement('div');
        modal.className = `admin-name-quilt-modal${isBallotCalibrate ? ' admin-name-quilt-modal--calibrate' : ''}`;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', "Name today's quilt");

        modal.innerHTML = `
          <div class="admin-name-quilt-inner">
            <div class="admin-name-quilt-header">
              <h2 class="admin-name-quilt-title">What shall we call our quilt?</h2>
              <button type="button" class="admin-name-quilt-cancel-x" onclick="this.closest('.admin-name-quilt-modal').remove()" aria-label="Close">✕</button>
            </div>
            <p class="admin-name-quilt-helper">Tap your vote</p>
            <div class="admin-name-cloud" id="adminNameCloud"><span class="admin-name-cloud-loading">Loading…</span></div>
            <p class="admin-name-quilt-status" id="adminNameStatus" hidden></p>
            ${isBallotCalibrate ? '<div class="admin-name-ballot-calibration" id="adminNameBallotCalibration"></div>' : ''}
            <div class="admin-name-quilt-actions">
              <button type="button" class="admin-name-quilt-cancel" onclick="this.closest('.admin-name-quilt-modal').remove()">Close</button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        const cloud = modal.querySelector('#adminNameCloud');
        const statusEl = modal.querySelector('#adminNameStatus');
        const calibrationEl = modal.querySelector('#adminNameBallotCalibration');

        const setupBallotCalibration = () => {
          if (!calibrationEl || !cloud) return;
          const defaults = {
            top: 31.6,
            right: 18,
            bottom: 8,
            left: 15.1,
            gap: 4,
            rowGap: -100,
            rowHeight: 7.3,
            wordPad: 2,
            font: 2.45,
            stamp: 64
          };
          const saved = (() => {
            try {
              return JSON.parse(localStorage.getItem('odq.nameBallotCalibration') || '{}');
            } catch (_) {
              return {};
            }
          })();
          const values = { ...defaults, ...saved };
          const controls = [
            ['top', 'Top', 20, 36, 0.1, '%'],
            ['right', 'Right', 6, 18, 0.1, '%'],
            ['bottom', 'Bottom', 4, 16, 0.1, '%'],
            ['left', 'Left', 8, 22, 0.1, '%'],
            ['gap', 'Col gap', 4, 16, 0.1, '%'],
            ['rowGap', 'Row gap', -100, 4, 0.1, '%'],
            ['rowHeight', 'Row ht', 3, 12, 0.1, '%'],
            ['wordPad', 'Word pad', 0, 10, 0.5, 'px'],
            ['font', 'Font', 1.6, 3.2, 0.05, 'vw'],
            ['stamp', 'Stamp', 40, 120, 1, '%']
          ];
          calibrationEl.innerHTML = `
            ${controls.map(([key, label, min, max, step, unit]) => `
              <label>
                <span>${label}</span>
                <input type="range" data-cal="${key}" min="${min}" max="${max}" step="${step}" value="${values[key]}">
                <output data-cal-output="${key}">${values[key]}${unit}</output>
              </label>
            `).join('')}
            <button type="button" data-copy-calibration>Copy CSS values</button>
            <pre class="admin-name-ballot-calibration-output" data-calibration-output></pre>
          `;
          const output = calibrationEl.querySelector('[data-calibration-output]');
          const formatCss = () =>
            `--admin-name-ballot-top: ${values.top.toFixed(1)}%;\n` +
            `--admin-name-ballot-right: ${values.right.toFixed(1)}%;\n` +
            `--admin-name-ballot-bottom: ${values.bottom.toFixed(1)}%;\n` +
            `--admin-name-ballot-left: ${values.left.toFixed(1)}%;\n` +
            `--admin-name-ballot-gap: ${values.gap.toFixed(1)}%;\n` +
            `--admin-name-ballot-row-gap: ${values.rowGap.toFixed(1)}%;\n` +
            `--admin-name-ballot-row-height: ${values.rowHeight.toFixed(1)}%;\n` +
            `--admin-name-ballot-word-pad: ${values.wordPad.toFixed(1)}px;\n` +
            `--admin-name-ballot-font: ${values.font.toFixed(2)}vw;\n` +
            `--admin-name-ballot-stamp: ${Math.round(values.stamp)}%;`;
          const apply = () => {
            cloud.style.setProperty('--admin-name-ballot-top', `${values.top}%`);
            cloud.style.setProperty('--admin-name-ballot-right', `${values.right}%`);
            cloud.style.setProperty('--admin-name-ballot-bottom', `${values.bottom}%`);
            cloud.style.setProperty('--admin-name-ballot-left', `${values.left}%`);
            cloud.style.setProperty('--admin-name-ballot-gap', `${values.gap}%`);
            cloud.style.setProperty('--admin-name-ballot-row-gap', `${values.rowGap}%`);
            cloud.style.setProperty('--admin-name-ballot-row-height', `${values.rowHeight}%`);
            cloud.style.setProperty('--admin-name-ballot-word-pad', `${values.wordPad}px`);
            cloud.style.setProperty('--admin-name-ballot-font', `${values.font}vw`);
            cloud.style.setProperty('--admin-name-ballot-stamp', `${values.stamp}%`);
            controls.forEach(([key,,,,,unit]) => {
              const out = calibrationEl.querySelector(`[data-cal-output="${key}"]`);
              if (out) out.textContent = `${values[key]}${unit}`;
            });
            if (output) output.textContent = formatCss();
            try {
              localStorage.setItem('odq.nameBallotCalibration', JSON.stringify(values));
            } catch (_) {
              /* ignore */
            }
          };
          calibrationEl.addEventListener('input', (e) => {
            const key = e.target?.dataset?.cal;
            if (!key || !(key in values)) return;
            values[key] = Number(e.target.value);
            apply();
          });
          calibrationEl.querySelector('[data-copy-calibration]')?.addEventListener('click', async () => {
            const css = formatCss();
            try {
              await navigator.clipboard?.writeText(css);
              if (output) output.textContent = `${css}\n\nCopied.`;
            } catch (_) {
              if (output) output.textContent = css;
            }
          });
          apply();
        };
        setupBallotCalibration();

        const renderCloud = (words) => {
          const slots = (Array.isArray(words) ? words : []).slice(0, 20);
          while (slots.length < 20) slots.push({ word: '', votes: 0, eliminated: true });
          const active = slots.filter((w) => !w.eliminated && w.word);
          const isFinal = active.length <= 4;
          return slots.map((w) => {
            if (!w?.word || w.eliminated) {
              return '<span class="admin-name-card-slot admin-name-card-slot--empty" aria-hidden="true"></span>';
            }
            const isVoted = w.word === myVote;
            const cls = [
              'admin-name-card-slot',
              'admin-name-cloud-word',
              isVoted ? 'admin-name-cloud-word--selected' : ''
            ].filter(Boolean).join(' ');
            return `<button type="button" class="${cls}" data-word="${w.word}">${w.word}</button>`;
          }).join('') + (isFinal ? '<p class="admin-name-cloud-final-note">Final 4 — voting closes end of day</p>' : '');
        };

        const renderDoc = (doc) => {
          if (!doc || !Array.isArray(doc.words)) {
            cloud.innerHTML = '<span class="admin-name-cloud-loading">Loading…</span>';
            return;
          }
          currentNameDoc = doc;
          cloud.innerHTML = renderCloud(doc.words);
          if (myVote) {
            statusEl.textContent = 'Change your mind? Tap another word.';
            statusEl.hidden = false;
          } else {
            statusEl.hidden = true;
          }
        };

        const renderLocalFallbackWords = () => {
          const words = this._generateQuiltWordCloud()
            .slice(0, 20)
            .map((word) => ({
              word: String(word || '').trim(),
              votes: 0,
              eliminated: false
            }))
            .filter((item) => item.word);
          renderDoc({ words, status: 'local-fallback' });
          statusEl.textContent = 'Using local word suggestions for now.';
          statusEl.hidden = false;
        };

        const startListening = () => {
          if (!window.firestore || !window.db) return;
          const fs = window.firestore;
          const ref = fs.doc(window.db, 'quiltNames', dateKey);
          firestoreUnsub = fs.onSnapshot(ref, (snap) => {
            if (snap.exists()) renderDoc(snap.data());
          });
        };

        const castVote = async (word) => {
          const previousWord = myVote && myVote !== word ? myVote : '';
          if (myVote === word) {
            statusEl.textContent = 'Change your mind? Tap another word.';
            statusEl.hidden = false;
            return;
          }
          myVote = word;
          localStorage.setItem(voteKey, word);
          cloud.querySelectorAll('.admin-name-cloud-word').forEach((b) => {
            b.classList.toggle('admin-name-cloud-word--selected', b.dataset.word === word);
          });
          try {
            if (!baseUrl) throw new Error('No API base URL configured');
            const res = await fetch(`${baseUrl}/api/quilt-vote`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dateKey, word, previousWord, words: currentNameDoc?.words || [] })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) throw new Error(data?.error || `Vote API returned ${res.status}`);
            if (data.doc?.words) renderDoc(data.doc);
          } catch (err) {
            console.warn('Name today quilt vote failed:', err);
          }
        };

        cloud.addEventListener('click', (e) => {
          const btn = e.target.closest('.admin-name-cloud-word');
          if (!btn) return;
          if (isBallotCalibrate) {
            myVote = btn.dataset.word;
            if (currentNameDoc) renderDoc(currentNameDoc);
            statusEl.textContent = `Stamp preview: ${myVote}`;
            statusEl.hidden = false;
            return;
          }
          castVote(btn.dataset.word);
        });

        modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.remove(); });
        modal.addEventListener('remove', () => { firestoreUnsub?.(); });
        const origRemove = modal.remove.bind(modal);
        modal.remove = () => { firestoreUnsub?.(); origRemove(); };

        const init = async () => {
          if (contributorCount < 5) {
            cloud.innerHTML = `<p class="admin-name-cloud-pending">Come back later and help us choose a name for this quilt.<br><span class="admin-name-cloud-pending-count">${contributorCount} so far</span></p>`;
            return;
          }

          cloud.innerHTML = '<span class="admin-name-cloud-loading">Generating words…</span>';
          try {
            const colorFamilies = this.analyzeColorFamilies().slice(0, 5);
            const res = await fetch(`${baseUrl}/api/quilt-name-generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dateKey, colorFamilies, blockCount: contributorCount })
            });
            const text = await res.text();
            let data = null;
            try {
              data = text ? JSON.parse(text) : null;
            } catch (_) {
              throw new Error(`API returned ${res.status}: ${text.slice(0, 120)}`);
            }
            if (!res.ok) throw new Error(data?.error || `API returned ${res.status}`);
            if (!data.success) throw new Error(data.error);
            renderDoc({ words: data.words, status: 'active' });
            startListening();
          } catch (err) {
            console.warn('Name today quilt words failed; using local fallback:', err);
            renderLocalFallbackWords();
            statusEl.textContent = `Using local word suggestions for now. API error: ${String(err?.message || err).slice(0, 140)}`;
            statusEl.hidden = false;
          }
        };

        init();
      }

      hexToHsl(hex) {
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Convert hex to RGB
        const r = parseInt(hex.substr(0, 2), 16) / 255;
        const g = parseInt(hex.substr(2, 2), 16) / 255;
        const b = parseInt(hex.substr(4, 2), 16) / 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
          h = s = 0; // achromatic
        } else {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }
        
        return {
          h: h * 360,
          s: s,
          l: l
        };
      }

      generateColorFamilyShades(baseColor, count) {
        const hsl = this.hexToHsl(baseColor);
        const shades = [];
        
        for (let i = 0; i < count; i++) {
          // Generate variations by adjusting lightness and saturation
          const variation = i / (count - 1); // 0 to 1
          
          let newLightness = hsl.l + (variation - 0.5) * 0.4; // Vary lightness by ±20%
          newLightness = Math.max(0.1, Math.min(0.9, newLightness)); // Clamp between 10% and 90%
          
          let newSaturation = hsl.s + (Math.random() - 0.5) * 0.3; // Vary saturation by ±15%
          newSaturation = Math.max(0.1, Math.min(1.0, newSaturation)); // Clamp between 10% and 100%
          
          // Convert back to hex
          const newColor = Utils.hslToHex(hsl.h, newSaturation * 100, newLightness * 100);
          shades.push(newColor);
        }
        
        // Shuffle the shades for variety
        return shades.sort(() => Math.random() - 0.5);
      }

      hslToHex(h, s, l) {
        h /= 360;
        s /= 100;
        l /= 100;
        
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h * 6) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;
        
        if (0 <= h && h < 1/6) {
          r = c; g = x; b = 0;
        } else if (1/6 <= h && h < 2/6) {
          r = x; g = c; b = 0;
        } else if (2/6 <= h && h < 3/6) {
          r = 0; g = c; b = x;
        } else if (3/6 <= h && h < 4/6) {
          r = 0; g = x; b = c;
        } else if (4/6 <= h && h < 5/6) {
          r = x; g = 0; b = c;
        } else if (5/6 <= h && h < 1) {
          r = c; g = 0; b = x;
        }
        
        const rHex = Math.round((r + m) * 255).toString(16).padStart(2, '0');
        const gHex = Math.round((g + m) * 255).toString(16).padStart(2, '0');
        const bHex = Math.round((b + m) * 255).toString(16).padStart(2, '0');
        
        return `#${rHex}${gHex}${bHex}`;
      }
      handleTestDifferentUser() {
        this.currentUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('ourDailyUserId', this.currentUserId);
        
        // Update the quilt engine with the new user ID
        this.quiltEngine.deviceId = this.currentUserId;
        
        this.uiService.showToast('Switched to different user');
      }

      async handleResetQuilt() {
        return this.runAdminQuiltMutation('Reset Quilt', async () => {
          const confirmed = confirm('Are you sure you want to reset today’s quilt? This will clear all blocks and cannot be undone.');
          if (!confirmed) return;

          const baseUrl = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
          if (!baseUrl) {
            this.uiService.showToast('Admin reset failed: backend URL is not configured.');
            return;
          }

          const storageKey = 'ourDailyResetToken';
          let token = '';
          try {
            token = String(localStorage.getItem(storageKey) || '').trim();
          } catch (_) {
            token = '';
          }
          if (!token) {
            const entered = window.prompt('Paste the Railway RESET_TOKEN for manual admin reset. It will be saved in this browser.');
            if (entered === null) return;
            token = String(entered || '').trim();
            if (!token) {
              this.uiService.showToast('Admin reset cancelled: missing token.');
              return;
            }
            try {
              localStorage.setItem(storageKey, token);
            } catch (_) {
              /* private mode/storage blocked: use token for this request only */
            }
          }

          const dateKey = Utils.getTodayKey();
          this.uiService.showToast(`Resetting quilt for ${dateKey} on server…`, 8000);

          let res;
          let data = {};
          try {
            res = await fetch(`${baseUrl}/api/daily-reset`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-reset-token': token
              },
              body: JSON.stringify({
                date: dateKey,
                source: 'admin-manual',
                force: true
              })
            });
            try {
              data = await res.json();
            } catch (_) {
              data = {};
            }
          } catch (error) {
            this.errorHandler.handleError(error, 'adminServerReset');
            this.uiService.showToast('Admin reset failed: could not reach server.');
            return;
          }

          if (res.status === 401) {
            try {
              localStorage.removeItem(storageKey);
            } catch (_) {
              /* ignore */
            }
            this.uiService.showToast('Admin reset failed: unauthorized. Saved token cleared.');
            console.error('Admin reset unauthorized:', data);
            return;
          }
          if (!res.ok || !data.success) {
            const detail = data.error || res.statusText || `HTTP ${res.status}`;
            this.uiService.showToast(`Admin reset failed: ${detail}`);
            console.error('Admin reset failed:', res.status, data);
            return;
          }
          if (data.force !== true || data.resetApiVersion !== 'manual-force-reset-1') {
            this.uiService.showToast('Admin reset did not run: Railway needs the latest server deploy.');
            console.error('Admin reset endpoint is old or did not force reset:', data);
            return;
          }

          this.quiltEngine.initialize();
          this.dailyContributors = [];
          localStorage.removeItem('ourDailyQuilt');
          localStorage.removeItem('quiltContributions');
          this._loadedSharedQuiltDateKey = dateKey;
          await this.loadQuilt();
          this.renderQuilt();
          this.updateSquareCounter();
          this.renderQuiltContributorList();
          this.updateAdminStats();
          Utils.extinguishReflectionPatchStar();
          this.uiService.showToast('Quilt reset successfully on server.');
          this.logger.log('🧵 Quilt reset by admin via server', data);
        });
      }

      async handleCreateArchive() {
        try {
          const archiveEntry = await this.createArchiveSnapshot();
          this.uiService.showToast(`Archive created for today with ${archiveEntry.userCount} contributors!`);
        } catch (error) {
          this.errorHandler.handleError(error, 'createArchive');
        }
      }

      async handleCreateTestArchives() {
        try {
          await this.createTestArchivePosts();
          // Toast message is now handled within createTestArchivePosts
        } catch (error) {
          this.errorHandler.handleError(error, 'createTestArchives');
        }
      }

      async handleTestDailyReset() {
        try {
          await this.performDailyReset();
          this.uiService.showToast('Test daily reset completed!');
        } catch (error) {
          this.errorHandler.handleError(error, 'testDailyReset');
        }
      }

      ensureAdminPreviewBanner(dateKey, previewMeta = {}) {
        this.removeAdminPreviewBanner();
        const banner = document.createElement('div');
        banner.className = 'odq-admin-preview-banner';
        banner.setAttribute('role', 'status');
        const resolution = String(previewMeta.resolution || previewMeta.assignmentSource || 'fallback');
        const sourceNote =
          resolution === 'notion_schedule' || resolution === 'notion_live'
            ? 'Quote from Notion date_scheduled (catalog)'
            : resolution === 'assignment' || resolution === 'assignment_resolve'
              ? 'Quote from dailyQuoteAssignments'
              : resolution === 'no_schedule'
                ? 'No quote scheduled — placeholder shown'
              : previewMeta.assignmentSource === 'firestore'
                ? 'Quote from Firestore'
                : 'Quote from shuffled fallback';
        banner.innerHTML = `
          <span class="odq-admin-preview-banner__text">
            Preview: ${dateKey} — ${sourceNote}
          </span>
          <button type="button" class="odq-admin-preview-banner__exit">Exit preview</button>
        `;
        banner.querySelector('.odq-admin-preview-banner__exit').addEventListener('click', () => {
          void this.exitAdminDatePreview();
        });
        document.body.appendChild(banner);
      }

      removeAdminPreviewBanner() {
        document.querySelectorAll('.odq-admin-preview-banner').forEach((el) => el.remove());
      }

      async _resolveQuoteForAdminDatePreview(dateKey) {
        const dk = String(dateKey || '').trim();
        const qs = this.quoteService;
        if (!dk || !qs) {
          return { quote: null, assignmentSource: 'fallback', resolution: 'fallback' };
        }

        let quote = null;
        let assignmentSource = 'fallback';
        let resolution = 'fallback';
        try {
          if (typeof qs.resolveQuoteForCalendarKeyFresh === 'function') {
            const resolved = await qs.resolveQuoteForCalendarKeyFresh(dk);
            quote = resolved?.quote || null;
            assignmentSource = resolved?.source === 'firestore' ? 'firestore' : 'fallback';
            resolution = resolved?.resolution || assignmentSource;
          } else if (typeof qs.getQuoteResolvedForInstagramDateKey === 'function') {
            delete qs._pinnedByDateKey?.[dk];
            qs._clearLocalAssignmentCache?.(dk);
            quote = await qs.getQuoteResolvedForInstagramDateKey(dk, { requireLive: true });
            if (quote && typeof qs.hydrateMoodFieldsForCalendarKey === 'function') {
              quote = (await qs.hydrateMoodFieldsForCalendarKey(dk, quote)) || quote;
            }
          }
          if (!quote && typeof qs.getQuoteForDate === 'function') {
            quote = qs.getQuoteForDate(dk);
          }
        } catch (error) {
          this.logger.warn('Admin date preview quote fetch failed:', error);
        }

        if (quote && resolution) {
          quote._pinResolution = String(quote._pinResolution || resolution).trim() || resolution;
        }

        return { quote, assignmentSource, resolution };
      }

      /**
       * Pin a calendar date and render the quilt screen in preview mode (empty starter quilt).
       * Used by admin UI and Playwright week-preview automation.
       */
      async activateAdminDatePreview(dateKey, options = {}) {
        const {
          requireAdmin = true,
          showBanner = false,
          navigateToQuilt = true,
          showToast = false
        } = options;

        if (requireAdmin && !this.isCurrentUserAdmin()) {
          return { ok: false, reason: 'not-admin' };
        }

        const dk = String(dateKey || '').trim();
        if (!dk) return { ok: false, reason: 'missing-date-key' };

        const qs = this.quoteService;
        if (!qs) {
          return { ok: false, reason: 'no-quote-service', message: 'Quote service unavailable.' };
        }

        this._adminPreviewPreviousLivePending =
          typeof document !== 'undefined' &&
          document.body?.classList?.contains?.('odq-live-daily-pending');
        this._adminPreview = {
          dateKey: dk,
          quote: null,
          assignmentSource: 'loading',
          resolution: 'loading'
        };
        this._clearConnectionProblemSlowDelay?.();
        document.body?.classList?.remove?.('odq-live-daily-pending');
        this.detachQuiltLiveListener?.();
        this._invalidateQuiltChromeForAdminDatePreview?.();

        try {
          const loadTask = qs.loadQuotesFromFirestore?.({ requireServer: true });
          if (loadTask && typeof loadTask.then === 'function') {
            await (typeof qs._withTimeout === 'function'
              ? qs._withTimeout(loadTask, 1500, 'admin preview quote catalog refresh')
              : loadTask);
          }
        } catch (_) {
          /* catalog refresh best-effort before preview */
        }

        const { quote, assignmentSource, resolution } = await this._resolveQuoteForAdminDatePreview(dk);
        if (!quote?.text) {
          this._adminPreview = null;
          if (this._adminPreviewPreviousLivePending && !this._liveDailyDataConfirmed) {
            document.body?.classList?.add?.('odq-live-daily-pending');
          }
          if (this._liveDailyDataConfirmed) {
            this.attachQuiltLiveListener?.(Utils.getTodayKey());
          }
          this._adminPreviewPreviousLivePending = false;
          return {
            ok: false,
            reason: 'no-quote',
            message: `Could not load quote for ${dk}.`,
            dateKey: dk,
            assignmentSource,
            resolution
          };
        }

        this._adminPreview = {
          dateKey: dk,
          quote,
          assignmentSource,
          resolution
        };
        this._syncAdminPreviewQuoteFromPin?.();
        this._beforeYouGoHydratedDateKey = null;

        this._isPersonalQuiltMode = false;
        this._personalQuiltState = null;
        this._isBacksidePreviewMode = false;
        this.updatePersonalQuiltToggleButton?.();
        this.updateBacksidePreviewToggleButton?.();
        this.quiltEngine.initialize();
        this.dailyContributors = [];
        this._invalidateQuiltChromeForAdminDatePreview?.();

        await this._primeQuiltQuoteChrome?.();
        this._syncAdminPreviewQuoteFromPin?.();

        if (showBanner) {
          this.ensureAdminPreviewBanner(dk, { assignmentSource, resolution });
        }

        if (navigateToQuilt) {
          this.uiService.showScreen('screen-quilt');
          await this.renderQuilt();
          this.updateBeforeYouGoSection();
          this._syncAdminPreviewQuoteFromPin?.();
          await this._refreshQuoteSpeakerWidgetEntry?.(this.getEffectiveQuiltQuote?.());
          this.scheduleLayoutBStoryPreviewRefresh?.({ force: true });
          await this.loadReflectionThemesForToday?.().catch((error) => {
            this.logger.warn('Preview reflection themes load failed:', error);
          });
        }

        if (showToast) {
          const author = String(quote.author || '').trim();
          const toastNote =
            resolution === 'no_schedule'
              ? `Previewing ${dk} — no quote scheduled (placeholder shown)`
              : resolution === 'shuffled_index'
                ? `Previewing ${dk} — shuffled fallback (no Firestore schedule found)`
                : assignmentSource === 'firestore'
                  ? `Previewing ${dk}${author ? ` — ${author}` : ''} (${resolution})`
                  : `Previewing ${dk} (fallback quote — sync Notion for final assignment)`;
          this.uiService.showToast(toastNote);
        }

        this.logger.log('Admin date quilt preview active', {
          dateKey: dk,
          assignmentSource,
          resolution,
          author: String(quote.author || '').trim(),
          text: String(quote.text || '').slice(0, 80)
        });

        return { ok: true, dateKey: dk, quote, assignmentSource, resolution };
      }

      async handleAdminPreviewTomorrowQuiltScreen() {
        if (!this.isCurrentUserAdmin()) return;
        if (this.isAdminTomorrowPreviewActive()) {
          await this.exitAdminDatePreview();
          return;
        }

        const qs = this.quoteService;
        if (!qs || typeof qs.getQuoteCalendarKeyUtc7FromAdjustedToday !== 'function') {
          this.uiService.showToast('Quote service unavailable.');
          return;
        }

        document.querySelectorAll('.admin-menu').forEach((el) => el.remove());

        const tomorrowKey = qs.getQuoteCalendarKeyUtc7FromAdjustedToday(1);
        let result = null;
        try {
          result = await this.activateAdminDatePreview(tomorrowKey, {
            showBanner: true,
            navigateToQuilt: true,
            showToast: true
          });
        } catch (error) {
          this.logger?.warn?.('Admin tomorrow preview failed:', error);
          this.uiService.showToast('Could not preview tomorrow. Check Xcode console.');
          return;
        }
        if (!result?.ok) {
          this.uiService.showToast(result?.message || 'Could not load tomorrow\'s quote.');
        }
      }

      async exitAdminDatePreview(options = {}) {
        const { showToast = true } = options;
        if (!this.isAdminTomorrowPreviewActive()) return;

        this._adminPreview = null;
        this.removeAdminPreviewBanner();
        this._invalidateQuiltChromeForAdminDatePreview?.();

        try {
          await this.loadQuilt();
          await this.renderQuilt();
          await this._primeQuiltQuoteChrome?.();
          await this._refreshQuoteSpeakerWidgetEntry?.(this.getEffectiveQuiltQuote?.());
          this.updateSquareCounter();
          this.renderQuiltContributorList();
          if (this._liveDailyDataConfirmed) {
            this.attachQuiltLiveListener?.(Utils.getTodayKey());
          }
          if (showToast) {
            this.uiService.showToast('Back to today\'s quilt');
          }
          if (this._adminPreviewPreviousLivePending && !this._liveDailyDataConfirmed) {
            document.body?.classList?.add?.('odq-live-daily-pending');
          } else {
            document.body?.classList?.remove?.('odq-live-daily-pending');
          }
          this._adminPreviewPreviousLivePending = false;
        } catch (error) {
          this.logger.warn('Exit admin preview failed:', error);
          if (showToast) {
            this.uiService.showToast('Preview ended — reload if the quilt looks wrong.');
          }
        }
      }

      async exitAdminTomorrowPreview() {
        return this.exitAdminDatePreview();
      }

      showNextWeekQuotes() {
        const modal = document.createElement('div');
        modal.className = 'quote-preview-modal';
        modal.innerHTML = `
          <div class="quote-preview-content">
            <h3>Today & Next 7 Days Quotes</h3>
            <div class="quote-list"></div>
            <button onclick="this.parentElement.parentElement.remove()">Close</button>
          </div>
        `;
        
        modal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1002;
        `;
        
        const content = modal.querySelector('.quote-preview-content');
        content.style.cssText = `
          background: white;
          border: 2px solid #000;
          border-radius: 8px;
          padding: 20px;
          max-width: 600px;
          max-height: 80vh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
          overscroll-behavior-y: contain;
          box-shadow: 0 8px 16px rgba(0,0,0,0.3);
        `;
        
        const quoteList = modal.querySelector('.quote-list');
        quoteList.style.cssText = `
          margin: 20px 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        `;
        
        // Get today and next 7 days quotes
        const today = new Date();
        for (let i = 0; i <= 7; i++) {
          const futureDate = new Date(today);
          futureDate.setDate(today.getDate() + i);
          
          const year = futureDate.getFullYear();
          const month = String(futureDate.getMonth() + 1).padStart(2, '0');
          const day = String(futureDate.getDate()).padStart(2, '0');
          const dateString = `${year}-${month}-${day}`;
          
          const dayIndex = Math.floor(new Date(dateString).getTime() / (1000 * 60 * 60 * 24));
          const quoteIndex = this.quoteService.shuffledIndexes[dayIndex % this.quoteService.shuffledIndexes.length];
          const quote = this.quoteService.quotes[quoteIndex];
          
          console.log(`🔍 NextWeek Day ${i}: ${dateString} → dayIndex=${dayIndex}, quoteIndex=${quoteIndex}, quotes.length=${this.quoteService.quotes.length}, shuffledIndexes.length=${this.quoteService.shuffledIndexes.length}, quote=`, quote);
          
          const quoteElement = document.createElement('div');
          quoteElement.style.cssText = `
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 15px;
            background: #f9f9f9;
          `;
          
          const dateElement = document.createElement('div');
          dateElement.style.cssText = `
            font-weight: bold;
            color: #333;
            margin-bottom: 8px;
            font-size: 14px;
          `;
          dateElement.textContent = i === 0 ? 'Today' : futureDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'short', 
            day: 'numeric' 
          });
          
          const textElement = document.createElement('div');
          textElement.style.cssText = `
            font-style: italic;
            margin-bottom: 8px;
            line-height: 1.4;
          `;
          textElement.textContent = quote && quote.text ? `"${quote.text}"` : "No quote available";
          
          const authorElement = document.createElement('div');
          authorElement.style.cssText = `
            font-weight: bold;
            color: #666;
            font-size: 14px;
          `;
          authorElement.textContent = quote && quote.author ? quote.author : "— Unknown";
          
          quoteElement.appendChild(dateElement);
          quoteElement.appendChild(textElement);
          quoteElement.appendChild(authorElement);
          quoteList.appendChild(quoteElement);
        }
        
        const closeButton = modal.querySelector('button');
        closeButton.style.cssText = `
          padding: 8px 16px;
          border: 1px solid #000;
          background: #fff;
          cursor: pointer;
          font-size: 14px;
          border-radius: 4px;
          margin-top: 10px;
        `;
        
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.remove();
          }
        });
        
        document.body.appendChild(modal);
      }
  }

  root.SimplifiedQuiltAppV2Admin = SimplifiedQuiltAppV2Admin;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
