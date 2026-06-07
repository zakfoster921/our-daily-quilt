/**
 * SimplifiedQuiltAppV2 shell slice: fortune share, personal quilt, resize handler (Phase C9).
 * Methods merged onto SimplifiedQuiltAppV2.prototype in the main app module.
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2Shell {
      async shareQuiltFortuneStoryImage() {
        const dateStr = new Date().toISOString().split('T')[0];
        const highRes = await this.getHighResQuiltBlobForShare();
        const blob = await this.createFortuneStoryShareBlob(highRes);
        await this.shareBlobWithSystem(
          blob,
          `our-daily-quilt-blessing-story-${dateStr}.png`,
          'OUR DAILY QUILT — Blessing story',
          'Your quilt blessing from OUR DAILY QUILT'
        );
      }

      isPersonalQuiltEnabled() {
        return false;
      }

      renderSettingsPersonalQuiltPreview() {
        const svg = document.getElementById('settingsPersonalQuiltSvg');
        const description = document.getElementById('settingsPersonalQuiltDescription');
        if (!svg) return;

        if (!this.isPersonalQuiltEnabled()) {
          svg.innerHTML = '';
          svg.setAttribute('viewBox', '0 0 800 600');
          svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
          if (description) {
            description.textContent = 'Personal quilt coming soon.';
          }
          return;
        }

        const personal = this.buildPersonalQuiltStateFromDeviceHistory();
        const dimensions =
          typeof Utils !== 'undefined' && typeof Utils.getQuiltDimensions === 'function'
            ? Utils.getQuiltDimensions()
            : { width: 800, height: 600 };
        const width = Math.max(1, Number(dimensions.width) || 800);
        const height = Math.max(1, Number(dimensions.height) || 600);
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        svg.innerHTML = '';

        const makeRect = (x, y, w, h, fill) => {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', String(x));
          rect.setAttribute('y', String(y));
          rect.setAttribute('width', String(w));
          rect.setAttribute('height', String(h));
          rect.setAttribute('fill', fill);
          return rect;
        };

        if (!personal || !Array.isArray(personal.blocks) || !personal.blocks.length) {
          svg.appendChild(makeRect(0, 0, width, height, '#ebe8e3'));
          if (description) {
            description.textContent = 'Every color you have ever added will gather here into one quilt.';
          }
          return;
        }

        if (this.renderer && typeof this.renderer.renderBlocks === 'function') {
          const previousSvg = this.renderer.quiltSVG;
          const previousUserPieces = this.renderer.userPieces;
          const previousLastAddedIndex = this.renderer.lastAddedIndex;
          const previousBacksidePreview = this.renderer.backsidePreviewEnabled;
          try {
            this.renderer.quiltSVG = svg;
            this.renderer.lastAddedIndex = null;
            this.renderer.setBacksidePreviewEnabled(false);
            this.renderer.renderBlocks(
              personal.blocks.map((block) => ({ ...block })),
              [],
              personal.submissionCount || 0
            );
          } finally {
            this.renderer.quiltSVG = previousSvg;
            this.renderer.userPieces = previousUserPieces;
            this.renderer.lastAddedIndex = previousLastAddedIndex;
            this.renderer.setBacksidePreviewEnabled(previousBacksidePreview);
          }
          if (description) {
            const n = Math.max(0, Number(personal.colorCount || 0));
            description.textContent = `Every color you've ever added—all ${n} of them—gathered into one quilt`;
          }
          return;
        }

        personal.blocks.forEach((block) => {
          svg.appendChild(
            makeRect(
              Number(block.x) || 0,
              Number(block.y) || 0,
              Math.max(0, Number(block.width) || 0),
              Math.max(0, Number(block.height) || 0),
              Utils.validateHexColor(block.color) ? block.color : '#d8d4cf'
            )
          );
        });
        if (description) {
          const n = Math.max(0, Number(personal.colorCount || 0));
          description.textContent = `Every color you've ever added—all ${n} of them—gathered into one quilt`;
        }
      }

      handleWindowResize() {
        // Debounce resize events to prevent excessive re-rendering
        if (this.resizeTimeout) {
          clearTimeout(this.resizeTimeout);
        }
        
        this.resizeTimeout = setTimeout(() => {
          if (this.quiltEngine.blocks && this.quiltEngine.blocks.length > 0) {
            // Recalculate dimensions for new viewport size
            this.quiltEngine.recalculateDimensionsForCurrentViewport();
            this.renderQuilt({ viewportOnly: true });
          }
          if (this.isColorPickerActive()) {
            this._hsvWheelCanvasKey = '';
            this.updateColorWheel();
          }
          const quoteScreen = document.getElementById('screen-quote');
          if (quoteScreen && quoteScreen.classList.contains('active')) {
            this.quoteService?.scheduleQuoteLayoutBPreviewLayoutRefresh?.();
          }
          const quiltScreen = document.getElementById('screen-quilt');
          if (quiltScreen && quiltScreen.classList.contains('active')) {
            this.syncQuiltFilmGrainOverlay();
            this.ensureFooterIconStripHandCut?.();
            this.flushFooterIconPaperChrome?.();
            this.scheduleFooterIconChromeUpdate?.();
          }
        }, 250); // 250ms debounce
      }


      async handleTogglePersonalQuilt() {
        if (!this.isPersonalQuiltEnabled()) {
          this._isPersonalQuiltMode = false;
          this._personalQuiltState = null;
          this.updatePersonalQuiltToggleButton();
          this.uiService?.showToast?.('Personal quilt coming soon.');
          return;
        }
        if (this._isPersonalQuiltMode) {
          this._isPersonalQuiltMode = false;
          this._personalQuiltState = null;
          this.updatePersonalQuiltToggleButton();
          await this.renderQuilt();
          return;
        }

        const personal = this.buildPersonalQuiltStateFromDeviceHistory();
        if (!personal || !Array.isArray(personal.blocks) || personal.blocks.length <= 1) {
          return;
        }

        this._isPersonalQuiltMode = true;
        this._personalQuiltState = personal;
        this.updatePersonalQuiltToggleButton();
        await this.renderQuilt();
      }
  }

  root.SimplifiedQuiltAppV2Shell = SimplifiedQuiltAppV2Shell;
})(typeof globalThis !== 'undefined' ? globalThis : window);
