/**
 * SimplifiedQuiltAppV2 share slice: share/IG, Layout B tune, exit chamber (Phase C4).
 * Methods merged onto SimplifiedQuiltAppV2.prototype in the main app module.
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2Share {
      /** Tune modal only — low-res quilt matte; layout still composes at 1080×1920 / 1080×1350. */
      static TUNE_PREVIEW_QUILT_MAX_EDGE = 540;

      /** Tune modal — instagram-images quilt-screen from previous save (often one block behind). */
      _tuneStoredQuiltFingerprintBlockCount(fingerprint) {
        const m = String(fingerprint || '').match(/^qfp-v1-(\d+)-/);
        return m ? Number(m[1]) : NaN;
      }

      _tuneCacheBustStorageUrl(url, data = {}) {
        const raw = String(url || '').trim();
        if (!raw) return raw;
        const bustKey =
          Date.parse(String(data.lastUpdated || data.lastIgPushCompletedAt || data.lastNightlyIgImagesAt || '').trim()) ||
          Number(data.blockCount) ||
          Date.now();
        const busted =
          typeof Utils.cacheBustInstagramStorageUrl === 'function'
            ? Utils.cacheBustInstagramStorageUrl(raw)
            : raw.includes('?')
              ? `${raw}&odq_t=${bustKey}`
              : `${raw}?odq_t=${bustKey}`;
        return busted.replace(/([?&]odq_t=)\d+/, `$1${bustKey}`);
      }

      async _resolveStoredQuiltScreenBlobForTune(dateKey, blocks) {
        if (typeof this._fetchInstagramImageDocRest !== 'function') return null;
        if (typeof this._fetchLayoutBStoryPreviewImageBlob !== 'function') return null;
        const dk = String(dateKey || '').trim();
        const currentBlockCount = Array.isArray(blocks) ? blocks.length : 0;
        if (!dk || currentBlockCount <= 1) return null;
        let data = null;
        try {
          data = await (typeof globalThis.odqPromiseWithTimeout === 'function'
            ? globalThis.odqPromiseWithTimeout(
                this._fetchInstagramImageDocRest(dk),
                6000,
                `Tune stored quilt-screen ${dk}`
              )
            : this._fetchInstagramImageDocRest(dk));
        } catch (fetchErr) {
          this.logger?.warn?.('Tune modal: stored quilt-screen doc skipped', fetchErr);
          return null;
        }
        if (!data || typeof data !== 'object') return null;
        const storedBlockCount = Number(data.blockCount);
        const storedFpBlockCount = this._tuneStoredQuiltFingerprintBlockCount(data.quiltFingerprint);
        const effectiveStoredBlocks = Number.isFinite(storedFpBlockCount)
          ? storedFpBlockCount
          : storedBlockCount;
        const currentFingerprint =
          typeof Utils.computeQuiltFingerprint === 'function' ? Utils.computeQuiltFingerprint(blocks) : '';
        const storedFingerprint = String(data.quiltFingerprint || '').trim();
        const fingerprintMatches =
          !!currentFingerprint && !!storedFingerprint && storedFingerprint === currentFingerprint;
        const oneBlockBehind =
          Number.isFinite(effectiveStoredBlocks) &&
          effectiveStoredBlocks > 0 &&
          effectiveStoredBlocks === currentBlockCount - 1;
        const blockCountMatches =
          Number.isFinite(effectiveStoredBlocks) &&
          effectiveStoredBlocks > 0 &&
          effectiveStoredBlocks === currentBlockCount;
        if (!blockCountMatches && !oneBlockBehind) return null;
        const quiltScreenUrl = this._tuneCacheBustStorageUrl(
          String(
            data.quiltScreen9x16ImageStorageUrl ||
              data.quiltScreen9x16Url ||
              data.quiltScreenUrl ||
              data.quiltStoryImageStorageUrl ||
              data.quiltStoryUrl ||
              data.storyQuiltImageStorageUrl ||
              data.storyQuiltUrl ||
              ''
          ).trim(),
          data
        );
        if (!quiltScreenUrl) return null;
        const blob = await this._fetchLayoutBStoryPreviewImageBlob(quiltScreenUrl);
        if (!blob?.size) return null;
        const isPlaceholder = oneBlockBehind || (!fingerprintMatches && !blockCountMatches);
        return {
          blob,
          quiltSource: isPlaceholder ? 'stored-quilt-screen-one-behind' : 'stored-quilt-screen',
          storedBlockCount: effectiveStoredBlocks,
          blockCount: currentBlockCount
        };
      }

      async _exportLiveQuiltScreenBlobForTune(blocks, dk, options = {}) {
        if (!this.archiveService?.getInstagramQuiltSourceBlob) return null;
        if (typeof this._waitForQuiltSvgReadyForStoryPreview === 'function') {
          await this._waitForQuiltSvgReadyForStoryPreview(blocks, 4500);
        }
        const blob = await this.archiveService.getInstagramQuiltSourceBlob(blocks, {
          dateKey: dk,
          exportModeLabel: options.carouselPostPreview
            ? 'tune_carousel_post_quilt_screen_cover_source'
            : 'tune_story_quilt_screen_source',
          maxEdge: options.maxEdge,
          imageSmoothingQuality: 'low',
          skipFilmGrain: true,
          skipTunePrefetch: true,
          skipDeferredAdminSlice: true,
          tunePreviewExport: true
        });
        if (!blob) return null;
        const meta = this.archiveService._igQuiltSourceExportMeta || {};
        return {
          blob,
          quiltSource: meta.quiltBlobFromLiveSvg ? 'quilt-screen-live' : 'quilt-screen',
          blockCount: blocks.length
        };
      }

      async getQuiltBlobForTunePreview(options = {}) {
        const tuneFast = options.tunePreviewFast !== false;
        const carouselPostPreview = options.carouselPostPreview === true;
        const blocks = this.quiltEngine?.blocks;
        if (!blocks?.length) return { blob: null, quiltSource: 'none' };
        const maxEdge = Math.min(
          720,
          Math.max(
            360,
            Number(options.maxEdge) ||
              (tuneFast ? SimplifiedQuiltAppV2Share.TUNE_PREVIEW_QUILT_MAX_EDGE : 1080)
          )
        );
        const dk =
          this.quoteService && typeof this.quoteService.getQuoteCalendarKeyNow === 'function'
            ? this.quoteService.getQuoteCalendarKeyNow()
            : Utils.getTodayKey();
        const blocksFastMirror = async () => {
          const blockBlob = await this.archiveService.generateQuiltRasterBlobFromBlocks(blocks, {
            backgroundColor: '#ebe8e3',
            maxEdge,
            imageSmoothingQuality: 'low',
            skipFilmGrain: true
          });
          if (!blockBlob) return { blob: null, quiltSource: 'blocks-fast' };
          try {
            const mirrored = await this.archiveService.composeMirroredQuiltFieldBlob(blockBlob, {
              maxEdge,
              dateKey: dk,
              blocks,
              imageSmoothingQuality: 'low'
            });
            if (mirrored) {
              return { blob: mirrored, quiltSource: 'blocks-mirror-fast' };
            }
          } catch (mirrorErr) {
            this.logger.warn('Tune preview mirror compose failed, using flat blocks:', mirrorErr);
          }
          return { blob: blockBlob, quiltSource: 'blocks-fast' };
        };
        if (tuneFast) {
          const storedPack = await this._resolveStoredQuiltScreenBlobForTune(dk, blocks);
          if (storedPack?.blob) return storedPack;
          const livePack = await this._exportLiveQuiltScreenBlobForTune(blocks, dk, {
            maxEdge,
            carouselPostPreview
          });
          if (livePack?.blob) return livePack;
          return (await blocksFastMirror()) || { blob: null, quiltSource: 'none' };
        }
        const shareOpts = options.maxEdge != null ? { maxEdge: options.maxEdge } : {};
        try {
          const svgBlob = await this.getHighResQuiltBlobForShare(shareOpts);
          if (svgBlob) {
            return { blob: svgBlob, quiltSource: 'svg' };
          }
        } catch (svgErr) {
          this.logger.warn('Tune preview SVG raster failed, trying blocks:', svgErr);
        }
        const blob = await this.archiveService.generateQuiltRasterBlobFromBlocks(blocks, {
          backgroundColor: '#ebe8e3',
          maxEdge,
          imageSmoothingQuality: 'low'
        });
        return { blob, quiltSource: 'blocks' };
      }

      async getHighResQuiltBlobForShare(options = {}) {
        const blocks = this.quiltEngine?.blocks;
        if (!Array.isArray(blocks) || blocks.length === 0) {
          throw new Error('No quilt blocks for share export');
        }
        const dk =
          this.quoteService && typeof this.quoteService.getQuoteCalendarKeyNow === 'function'
            ? this.quoteService.getQuoteCalendarKeyNow()
            : Utils.getTodayKey();
        const blobOpts = {
          dateKey: dk,
          exportModeLabel: 'share_quilt_screen_9x16'
        };
        if (options.maxEdge != null) {
          blobOpts.maxEdge = options.maxEdge;
        }
        const blob = await this.archiveService.getInstagramQuiltSourceBlob(blocks, blobOpts);
        if (!blob) {
          throw new Error('Failed to generate rendered share image');
        }
        return blob;
      }

      async createOriginalStoryShareBlob(highResBlob) {
        return new Promise((resolve, reject) => {
          const STORY_W = 1080;
          const STORY_H = 1920;
          const padX = 48;
          const padY = 40;
          const topImagePad = 52;
          const quiltRegionH = Math.round(STORY_H * 0.62);
          const quoteTop = quiltRegionH + 40;
          const vw = STORY_W;
          const TITLE_SCALE = 1.2;
          const portalTitleLine1Px = Math.round(
            Math.min(56, Math.max(40, Math.round(vw * 0.05))) * TITLE_SCALE
          );
          const portalTitleLine2Px = Math.round(
            Math.min(128, Math.max(72, Math.round(vw * 0.08))) * TITLE_SCALE
          );
          const titleAreaH = Math.round(
            portalTitleLine1Px + portalTitleLine2Px * 1.05 - 6 + 20
          );
          const QUOTE_LINE_LEAD = 1.4 * 0.8;
          const gapTitleQuilt = 18;
          const quiltSlotTop = topImagePad + titleAreaH + gapTitleQuilt;
          const gapQuiltQuote = 32;
          const quiltSlotH = Math.max(160, quoteTop - quiltSlotTop - gapQuiltQuote);

          const quoteObj = this.quoteService?.getTodayQuote?.() || { text: '', author: '' };
          const quoteText = String(quoteObj.text ?? quoteObj.body ?? '').trim();
          const quoteAuthor = String(quoteObj.author ?? '').trim();

          const loadQuiltImage = () => new Promise((res, rej) => {
            const url = URL.createObjectURL(highResBlob);
            const im = new Image();
            im.onload = () => {
              URL.revokeObjectURL(url);
              res(im);
            };
            im.onerror = () => {
              URL.revokeObjectURL(url);
              rej(new Error('Failed to load quilt image for story composite'));
            };
            im.src = url;
          });

          /** Same wordmark as the portal screen (`portal-title-graphic`). */
          const STORY_MODERN_TITLE_SRC = 'assets/portal-our-daily-quilt.png';
          const loadStoryModernTitleGraphic = () =>
            new Promise((res, rej) => {
              const im = new Image();
              im.onload = () => res(im);
              im.onerror = () => rej(new Error('Failed to load story title graphic'));
              im.src = new URL(STORY_MODERN_TITLE_SRC, window.location.href).href;
            });

          const FONT_BODY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          const FONT_AUTHOR = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

          const wrapLines = (ctx, text, maxWidth) => {
            const breakLongWord = (word) => {
              const out = [];
              let piece = '';
              for (const ch of word) {
                const next = piece + ch;
                if (ctx.measureText(next).width <= maxWidth || piece === '') piece = next;
                else {
                  out.push(piece);
                  piece = ch;
                }
              }
              if (piece) out.push(piece);
              return out;
            };
            const words = text.split(/\s+/).filter(Boolean);
            const lines = [];
            let line = '';
            for (const word of words) {
              const test = line ? `${line} ${word}` : word;
              if (ctx.measureText(test).width <= maxWidth) {
                line = test;
              } else {
                if (line) lines.push(line);
                if (ctx.measureText(word).width <= maxWidth) {
                  line = word;
                } else {
                  const chunks = breakLongWord(word);
                  for (let c = 0; c < chunks.length - 1; c++) lines.push(chunks[c]);
                  line = chunks[chunks.length - 1] || '';
                }
              }
            }
            if (line) lines.push(line);
            return lines;
          };

          Promise.all([
            loadQuiltImage(),
            loadStoryModernTitleGraphic().catch((err) => {
              this.logger.warn('Story Modern title image unavailable; using text title.', err);
              return null;
            })
          ])
            .then(([quiltImg, titleGraphic]) => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = STORY_W;
              canvas.height = STORY_H;
              ctx.fillStyle = '#f6f4f1';
              ctx.fillRect(0, 0, STORY_W, STORY_H);

              const titleSlotMaxW = STORY_W - padX * 2;
              const titleSlotInsetY = 8;
              const titleSlotMaxH = Math.max(80, titleAreaH - titleSlotInsetY * 2);

              if (titleGraphic && titleGraphic.naturalWidth > 0 && titleGraphic.naturalHeight > 0) {
                const iw = titleGraphic.naturalWidth;
                const ih = titleGraphic.naturalHeight;
                const scale = Math.min(titleSlotMaxW / iw, titleSlotMaxH / ih);
                const dw = Math.round(iw * scale);
                const dh = Math.round(ih * scale);
                const tx = Math.round((STORY_W - dw) / 2);
                const ty = Math.round(topImagePad + (titleAreaH - dh) / 2);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(titleGraphic, tx, ty, dw, dh);
              } else {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = '#000';
                try {
                  ctx.letterSpacing = `${Math.round(portalTitleLine1Px * 0.02)}px`;
                } catch (e) { /* older canvas */ }
                ctx.font = `500 ${portalTitleLine1Px}px ${FONT_BODY}`;
                let titleY = topImagePad + 12;
                ctx.fillText('OUR DAILY', STORY_W / 2, titleY);
                titleY += portalTitleLine1Px * 0.92 - 8;
                try {
                  ctx.letterSpacing = `${Math.round(portalTitleLine2Px * 0.05)}px`;
                } catch (e) { /* older canvas */ }
                ctx.font = `900 ${portalTitleLine2Px}px ${FONT_BODY}`;
                ctx.fillText('QUILT', STORY_W / 2, titleY);
                try { ctx.letterSpacing = '0px'; } catch (e) { /* */ }
              }

              const slotW = STORY_W - padX * 2;
              const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
              const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
              const scale = Math.min(slotW / iw, quiltSlotH / ih);
              const dw = Math.round(iw * scale);
              const dh = Math.round((ih / iw) * dw);
              const qx = Math.round((STORY_W - dw) / 2);
              const qy = Math.round(quiltSlotTop + (quiltSlotH - dh) / 2);
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(quiltImg, qx, qy, dw, dh);

              const textMaxW = Math.max(120, dw);
              const textX = qx;

              let bodySize = 50;
              let authorSize = 42;
              const bodySizeMin = 32;
              let bodyLines = [];
              let authorLines = [];
              if (quoteText) {
                for (let attempt = 0; attempt < 12; attempt++) {
                  ctx.font = `italic 300 ${bodySize}px ${FONT_BODY}`;
                  bodyLines = wrapLines(ctx, quoteText, textMaxW);
                  let authorH = 0;
                  if (quoteAuthor) {
                    ctx.font = `italic 300 ${authorSize}px ${FONT_AUTHOR}`;
                    authorLines = wrapLines(ctx, `— ${quoteAuthor}`, textMaxW);
                    authorH = authorLines.length * (authorSize * QUOTE_LINE_LEAD) + (bodyLines.length ? 16 : 0);
                  }
                  const lineH = bodySize * QUOTE_LINE_LEAD;
                  const needed = quoteTop + bodyLines.length * lineH + authorH + padY;
                  if (needed <= STORY_H - 24 || bodySize <= bodySizeMin) break;
                  bodySize -= 2;
                  authorSize = Math.max(34, Math.round(bodySize * 0.86));
                }
              } else if (quoteAuthor) {
                ctx.font = `italic 300 ${authorSize}px ${FONT_AUTHOR}`;
                authorLines = wrapLines(ctx, `— ${quoteAuthor}`, textMaxW);
              }

              const lineHeight = bodySize * QUOTE_LINE_LEAD;
              const textRightX = textX + textMaxW;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'top';
              ctx.fillStyle = '#404040';
              ctx.font = `italic 300 ${bodySize}px ${FONT_BODY}`;
              let ty = quoteTop;
              bodyLines.forEach((ln) => {
                ctx.fillText(ln, textX, ty);
                ty += lineHeight;
              });

              if (authorLines.length) {
                ty += bodyLines.length ? 16 : 0;
                ctx.fillStyle = '#404040';
                ctx.font = `italic 300 ${authorSize}px ${FONT_AUTHOR}`;
                const authorLineH = authorSize * QUOTE_LINE_LEAD;
                ctx.textAlign = 'right';
                authorLines.forEach((ln) => {
                  ctx.fillText(ln, textRightX, ty);
                  ty += authorLineH;
                });
                ctx.textAlign = 'left';
              }

              canvas.toBlob((blob) => {
                if (!blob) {
                  reject(new Error('Could not create story image blob'));
                  return;
                }
                resolve(blob);
              }, 'image/png', 0.95);
            })
            .catch(reject);
        });
      }

      shareBlobWithSystem(blob, filename, shareTitle, shareText) {
        const imageFile = new File([blob], filename, { type: 'image/png' });
        const shareData = {
          title: shareTitle,
          text: shareText,
          files: [imageFile]
        };
        const canShareFiles =
          typeof navigator !== 'undefined' &&
          typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare(shareData);
        if (!canShareFiles) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.uiService.showToast('Image saved to your camera roll');
          return Promise.resolve();
        }
        this.uiService.showToast('Choose “Save Image” to add to Photos');
        return navigator.share(shareData).then(() => {
          this.uiService.showToast('Image saved to your camera roll');
        });
      }

      /**
       * Long-press opens a save modal — WKWebView blocks navigator.share(files) from
       * timer callbacks; a direct tap on "Save to Photos" keeps user activation.
       */
      async shareLayoutBStoryPreviewFromLongPress() {
        let shareBlob = this._resolveLayoutBStoryPreviewShareBlobSync?.();
        if (!shareBlob?.size) {
          shareBlob = await this._ensureLayoutBStoryPreviewShareBlob?.();
        }
        if (!shareBlob?.size) {
          await this.ensureLayoutBComposeReady?.();
          const blocks = this.quiltEngine?.blocks;
          const dk = Utils.getTodayKey();
          const arch = this.archiveService;
          const quote =
            (this.quoteService &&
            typeof this.quoteService.getQuoteResolvedForInstagramDateKey === 'function'
              ? await this.quoteService.getQuoteResolvedForInstagramDateKey(dk)
              : null) ||
            this.quoteService?.getTodayQuote?.() ||
            { text: '', author: '' };
          if (arch?.generateInstagramStoryLayoutBBlob) {
            shareBlob = await arch.generateInstagramStoryLayoutBBlob(blocks, quote, dk);
          }
        }
        if (shareBlob?.size) {
          this._reportStoryPreviewShareOnce?.();
          this.showLayoutBStoryPreviewSaveModal(shareBlob);
          return;
        }
        this.uiService.showToast('Story image not ready — try again');
      }

      /** Fire-and-forget anonymous story-preview share count (once per device/day). */
      _reportStoryPreviewShareOnce() {
        const dk = String(Utils.getTodayKey?.() || '').trim();
        if (!dk) return;
        const storageKey = 'ourDailyQuiltStoryPreviewShareV1';
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (String(parsed?.dateKey || '') === dk && parsed?.reported === true) return;
          }
        } catch (_) {
          /* continue */
        }
        if (this._storyPreviewShareReportInFlightKey === dk) return;
        const clientId = String(this.currentUserId || Utils.getOrCreateUserId?.() || '').trim();
        if (!clientId) return;
        const baseUrl = String(
          (typeof this._getPublicQuiltNameApiBaseUrl === 'function'
            ? this._getPublicQuiltNameApiBaseUrl()
            : '') ||
            (typeof CONFIG !== 'undefined' && CONFIG.BACKEND?.baseUrl) ||
            ''
        ).replace(/\/$/, '');
        if (!baseUrl) return;

        this._storyPreviewShareReportInFlightKey = dk;
        void fetch(`${baseUrl}/api/story-preview-share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appDateKey: dk,
            clientId
          }),
          keepalive: true
        })
          .then((res) => {
            if (!res.ok) return;
            try {
              localStorage.setItem(storageKey, JSON.stringify({ dateKey: dk, reported: true }));
            } catch (_) {
              /* ignore */
            }
          })
          .catch(() => {
            /* non-blocking */
          })
          .finally(() => {
            if (this._storyPreviewShareReportInFlightKey === dk) {
              this._storyPreviewShareReportInFlightKey = '';
            }
          });
      }

      showLayoutBStoryPreviewSaveModal(shareBlob) {
        if (!shareBlob?.size || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
          return;
        }
        try {
          document
            .querySelectorAll('.odq-story-preview-save-modal')
            .forEach((node) => {
              try {
                node.remove();
              } catch (_) {
                /* ignore */
              }
            });
        } catch (_) {
          /* ignore */
        }

        const pngUrl = URL.createObjectURL(shareBlob);
        const overlay = document.createElement('div');
        overlay.className = 'odq-personal-quilt-modal odq-story-preview-save-modal';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Save story collage');

        const scrim = document.createElement('div');
        scrim.className = 'odq-personal-quilt-modal__scrim';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'odq-personal-quilt-modal__close';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '\u2715';

        const dialog = document.createElement('div');
        dialog.className = 'odq-personal-quilt-modal__dialog';

        const imageWrap = document.createElement('div');
        imageWrap.className = 'odq-personal-quilt-modal__image-wrap odq-story-preview-save-modal__image-wrap';

        const img = document.createElement('img');
        img.className = 'odq-personal-quilt-modal__image odq-story-preview-save-modal__image';
        img.alt = "Today's OUR DAILY QUILT story collage";
        img.src = pngUrl;
        img.decoding = 'async';

        const msg = document.createElement('p');
        msg.className = 'odq-personal-quilt-modal__message';
        msg.textContent = 'Tap Save to Photos, or press and hold the image to share on Instagram.';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'odq-personal-quilt-modal__save';
        saveBtn.textContent = 'Save to Photos';

        imageWrap.appendChild(img);
        dialog.appendChild(imageWrap);
        dialog.appendChild(msg);
        dialog.appendChild(saveBtn);
        overlay.appendChild(scrim);
        overlay.appendChild(closeBtn);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        let dismissed = false;
        const onKey = (event) => {
          if (event.key === 'Escape') dismiss();
        };

        const dismiss = () => {
          if (dismissed) return;
          dismissed = true;
          overlay.classList.remove('odq-personal-quilt-modal--shown');
          overlay.classList.add('odq-personal-quilt-modal--leaving');
          document.removeEventListener('keydown', onKey);
          window.setTimeout(() => {
            try {
              overlay.remove();
            } catch (_) {
              /* ignore */
            }
            try {
              URL.revokeObjectURL(pngUrl);
            } catch (_) {
              /* ignore */
            }
          }, 420);
        };

        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `our-daily-quilt-story-collage-${dateStr}.png`;
        const shareText = `Today's OUR DAILY QUILT has ${this.quiltEngine?.submissionCount ?? 0} contributors — take a look!`;

        saveBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (saveBtn.disabled) return;
          saveBtn.disabled = true;
          const originalLabel = saveBtn.textContent;
          this.shareBlobWithSystem(
            shareBlob,
            filename,
            'OUR DAILY QUILT — Story collage',
            shareText
          )
            .then(() => {
              if (typeof window.odqTrack === 'function') {
                window.odqTrack('download_story_image', { method: 'story_preview_save_modal' });
              }
              if (!dismissed) saveBtn.textContent = 'Shared ♡';
            })
            .catch((error) => {
              this.errorHandler.handleError(error, 'layoutBPreviewShare');
              if (!dismissed) {
                saveBtn.textContent = originalLabel;
                saveBtn.disabled = false;
              }
            });
        });

        scrim.addEventListener('click', dismiss);
        closeBtn.addEventListener('click', dismiss);
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) dismiss();
        });
        document.addEventListener('keydown', onKey);
        requestAnimationFrame(() => {
          overlay.classList.add('odq-personal-quilt-modal--shown');
          saveBtn.focus();
        });
      }

      async createFortuneStoryShareBlob(highResBlob) {
        await this.ensureLayoutBComposeReady?.();
        await ensureOdqCanvasFontsReady();
        return new Promise((resolve, reject) => {
          const STORY_W = 1080;
          const STORY_H = 1920;
          const quote = this.quoteService?.getTodayQuote?.() || null;
          const blessing = this.getQuiltBlessingShareText(quote);
          const backingColor = '#eae7e1';
          const inkColor = this.getReadableTextColorForHex(backingColor);

          const loadQuiltImage = () => new Promise((res, rej) => {
            const url = URL.createObjectURL(highResBlob);
            const im = new Image();
            im.onload = () => {
              URL.revokeObjectURL(url);
              res(im);
            };
            im.onerror = () => {
              URL.revokeObjectURL(url);
              rej(new Error('Failed to load quilt image for blessing story'));
            };
            im.src = url;
          });

          const roundedRect = (ctx, x, y, w, h, r) => {
            const radius = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + h - radius);
            ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
          };

          loadQuiltImage()
            .then((quiltImg) => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = STORY_W;
              canvas.height = STORY_H;
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';

              const iw = Math.max(1, quiltImg.naturalWidth || quiltImg.width);
              const ih = Math.max(1, quiltImg.naturalHeight || quiltImg.height);
              const coverScale = Math.max(STORY_W / iw, STORY_H / ih);
              const dw = Math.ceil(iw * coverScale);
              const dh = Math.ceil(ih * coverScale);
              const dx = Math.round((STORY_W - dw) / 2);
              const dy = Math.round((STORY_H - dh) / 2);
              ctx.drawImage(quiltImg, dx, dy, dw, dh);

              ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
              ctx.fillRect(0, 0, STORY_W, STORY_H);

              const cardW = 760;
              const cardPadX = 72;
              const cardPadY = 64;
              let fontSize = 54;
              let lineHeight = fontSize * 1.36;
              const maxTextW = cardW - cardPadX * 2;
              const balanced = this.balanceQuiltDisplayLines(blessing, 2);
              let lines = balanced
                ? balanced.split(/\n+/).map((l) => l.trim()).filter(Boolean)
                : [];
              if (!lines.length) {
                lines = [String(blessing || '').trim() || "Today's blessing is still being stitched."];
              }
              for (let attempt = 0; attempt < 20; attempt++) {
                ctx.font = `italic 400 ${fontSize}px 'Libre Baskerville', Georgia, serif`;
                const maxLineW = Math.max(0, ...lines.map((line) => ctx.measureText(line).width));
                if (maxLineW <= maxTextW || fontSize <= 24) break;
                fontSize -= 2;
                lineHeight = fontSize * 1.36;
              }
              const textH = lines.length * lineHeight;
              const cardH = Math.max(330, Math.ceil(textH + cardPadY * 2));
              const cardX = -cardW / 2;
              const cardY = -cardH / 2;

              ctx.save();
              ctx.translate(STORY_W / 2, STORY_H * 0.52);
              ctx.rotate((-5 * Math.PI) / 180);

              ctx.save();
              ctx.shadowColor = 'rgba(28, 20, 14, 0.28)';
              ctx.shadowBlur = 34;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 20;
              roundedRect(ctx, cardX, cardY, cardW, cardH, 22);
              ctx.fillStyle = backingColor;
              ctx.fill();
              ctx.restore();

              roundedRect(ctx, cardX, cardY, cardW, cardH, 22);
              ctx.fillStyle = backingColor;
              ctx.fill();

              ctx.save();
              ctx.globalAlpha = 0.18;
              ctx.fillStyle = '#ffffff';
              roundedRect(ctx, cardX + 16, cardY + 16, cardW - 32, cardH - 32, 14);
              ctx.strokeStyle = 'rgba(194, 159, 91, 0.72)';
              ctx.lineWidth = 3;
              ctx.setLineDash([]);
              ctx.stroke();
              ctx.restore();

              ctx.fillStyle = inkColor;
              ctx.font = `italic 400 ${fontSize}px 'Libre Baskerville', Georgia, serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const startY = -textH / 2 + lineHeight / 2;
              lines.forEach((line, idx) => {
                ctx.fillText(line, 0, startY + idx * lineHeight);
              });
              ctx.restore();

              ctx.save();
              const handleText = '@ourdailyquilt';
              const handleFontSize = 34;
              ctx.font = `600 ${handleFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
              const handlePadX = 28;
              const handlePadY = 15;
              const handleW = Math.ceil(ctx.measureText(handleText).width + handlePadX * 2);
              const handleH = handleFontSize + handlePadY * 2;
              const handleX = STORY_W - handleW - 42;
              const handleY = STORY_H - handleH - 52;
              ctx.translate(handleX + handleW / 2, handleY + handleH / 2);
              ctx.rotate((-2.5 * Math.PI) / 180);
              ctx.shadowColor = 'rgba(28, 20, 14, 0.18)';
              ctx.shadowBlur = 16;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 8;
              roundedRect(ctx, -handleW / 2, -handleH / 2, handleW, handleH, 4);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
              ctx.fill();
              ctx.shadowColor = 'transparent';
              ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(handleText, 0, 1);
              ctx.restore();

              canvas.toBlob((blob) => {
                if (!blob) {
                  reject(new Error('Could not create blessing story image blob'));
                  return;
                }
                resolve(blob);
              }, 'image/png', 0.95);
            })
            .catch(reject);
        });
      }

      async buildShareChooserPreviews(highResBlob) {
        await this.ensureLayoutBComposeReady?.();
        const dk = Utils.getTodayKey();
        const qt = this.quoteService?.getTodayQuote?.() || { text: '', author: '' };
        const qText = String(qt.text ?? qt.body ?? '').trim();
        const qAuthor = String(qt.author ?? '').trim();

        /** Same pixel dimensions as the downloaded share (1080×1920); UI scales with CSS only. */
        const [origStoryBlob, lbStoryBlob] = await Promise.all([
          this.createOriginalStoryShareBlob(highResBlob),
          composeInstagramLayoutBFromQuiltBlob(highResBlob, qText, qAuthor, 1080, 1920, dk)
        ]);

        return {
          storyModernUrl: URL.createObjectURL(origStoryBlob),
          storyCollageUrl: URL.createObjectURL(lbStoryBlob)
        };
      }

      closeShareChooserModal() {
        if (this._shareChooserRevoke) {
          this._shareChooserRevoke.forEach((u) => {
            try {
              URL.revokeObjectURL(u);
            } catch (e) { /* */ }
          });
          this._shareChooserRevoke = null;
        }
        const el = document.getElementById('shareChooserModal');
        if (el) el.remove();
        if (this._shareChooserKeyEsc) {
          document.removeEventListener('keydown', this._shareChooserKeyEsc);
          this._shareChooserKeyEsc = null;
        }
      }

      showShareChooserModal(previews) {
        this.closeShareChooserModal();
        const revoke = [];
        const track = (u) => {
          if (u) revoke.push(u);
        };
        track(previews.storyModernUrl);
        track(previews.storyCollageUrl);
        this._shareChooserRevoke = revoke;

        const wrap = document.createElement('div');
        wrap.id = 'shareChooserModal';
        wrap.className = 'share-chooser-modal';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-label', 'Share');

        const cards = [
          {
            variant: 'story-modern',
            src: previews.storyModernUrl,
            label: 'STORY MODERN'
          },
          {
            variant: 'story-collage',
            src: previews.storyCollageUrl,
            label: 'STORY COLLAGE'
          }
        ];

        wrap.innerHTML = `
          <div class="share-chooser-backdrop" data-share-close="1"></div>
          <div class="share-chooser-panel">
            <div class="share-chooser-grid"></div>
            <button type="button" class="btn stack-btn-like stack-btn-like--back share-chooser-back-btn" data-share-close="1" aria-label="Back to quilt">
              <span class="stack-btn-content">
                <span class="stack-btn-chevron" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img" focusable="false">
                    <path d="M15 5l-7 7 7 7"></path>
                  </svg>
                </span>
                <span>Back to quilt</span>
              </span>
            </button>
          </div>
        `;
        const grid = wrap.querySelector('.share-chooser-grid');
        for (const c of cards) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'share-chooser-card';
          btn.dataset.variant = c.variant;
          const img = document.createElement('img');
          img.src = c.src || '';
          img.alt = c.label;
          if (!c.src) img.style.opacity = '0.3';
          const lab = document.createElement('span');
          lab.className = 'share-chooser-label';
          lab.textContent = c.label;
          btn.appendChild(img);
          btn.appendChild(lab);
          btn.addEventListener('click', async () => {
            this.closeShareChooserModal();
            try {
              await this.executeShareVariant(c.variant);
            } catch (err) {
              this.errorHandler.handleError(err, 'shareFlow');
            }
          });
          grid.appendChild(btn);
        }

        wrap.addEventListener('click', (e) => {
          if (e.target && e.target.dataset && e.target.dataset.shareClose === '1') {
            this.closeShareChooserModal();
          }
        });

        this._shareChooserKeyEsc = (e) => {
          if (e.key === 'Escape') this.closeShareChooserModal();
        };
        document.addEventListener('keydown', this._shareChooserKeyEsc);

        document.body.appendChild(wrap);
        const firstBtn = wrap.querySelector('.share-chooser-card');
        if (firstBtn) firstBtn.focus();
      }

      async executeShareVariant(variant) {
        const dateStr = new Date().toISOString().split('T')[0];
        const sub = this.quiltEngine.submissionCount;
        const shareText = `Today's OUR DAILY QUILT has ${sub} contributors — take a look!`;
        switch (variant) {
          case 'story-modern': {
            const highRes = await this.getHighResQuiltBlobForShare();
            const blob = await this.createOriginalStoryShareBlob(highRes);
            await this.shareBlobWithSystem(
              blob,
              `our-daily-quilt-story-modern-${dateStr}.png`,
              'OUR DAILY QUILT — Story (modern)',
              shareText
            );
            break;
          }
          case 'story-collage':
            await this.exportLayoutBShareImage(1920, 'OUR DAILY QUILT — Story collage', 'our-daily-quilt-story-collage');
            break;
          default:
            break;
        }
      }

      async handleShare() {
        try {
          if (!this.quiltEngine.blocks || this.quiltEngine.blocks.length <= 1) {
            return;
          }

          const highResBlob = await this.getHighResQuiltBlobForShare();
          const previews = await this.buildShareChooserPreviews(highResBlob);
          this.showShareChooserModal(previews);
        } catch (error) {
          this.errorHandler.handleError(error, 'shareFlow');
        }
      }

      /**
       * Layout B share: full-bleed quilt + quote strips (9:16 story or 4:5 post canvas).
       * Share chooser uses this for STORY COLLAGE (9:16); experimental handlers use post/story sizes too.
       * On success, shows a single toast (camera roll wording) for both native share and download fallback.
       */
      async exportLayoutBShareImage(layoutH, shareTitle, filenameStem) {
        await this.ensureLayoutBComposeReady?.();
        const blocks = this.quiltEngine?.blocks;
        const dk = Utils.getTodayKey();
        const arch = this.archiveService;
        const quote =
          (this.quoteService && typeof this.quoteService.getQuoteResolvedForInstagramDateKey === 'function'
            ? await this.quoteService.getQuoteResolvedForInstagramDateKey(dk)
            : null) ||
          this.quoteService?.getTodayQuote?.() ||
          { text: '', author: '' };
        let outBlob = null;
        if (layoutH === 1920 && arch?.generateInstagramStoryLayoutBBlob) {
          outBlob = await arch.generateInstagramStoryLayoutBBlob(blocks, quote, dk);
        } else if (layoutH === 1350 && arch?.generateInstagramPostLayoutBBlob) {
          outBlob = await arch.generateInstagramPostLayoutBBlob(blocks, quote, dk);
        } else {
          const highResBlob = await this.getHighResQuiltBlobForShare();
          const shareAspect = layoutH === 1350 ? 'post' : 'story';
          const { qText, qAuthor, composeExtras } = await this.resolveLayoutBStoryQuoteAndComposeOptions(
            dk,
            blocks,
            shareAspect
          );
          if (composeExtras?.speakerOverlay) {
            const presetTransform = await odqSpeakerCutoutTransformForDateAsync(dk, shareAspect);
            if (presetTransform) composeExtras.speakerOverlay.transform = presetTransform;
          }
          outBlob = await composeInstagramLayoutBFromQuiltBlob(
            highResBlob,
            qText,
            qAuthor,
            1080,
            layoutH,
            dk,
            composeExtras
          );
        }
        if (!outBlob) {
          throw new Error('Could not build Layout B share image');
        }
        const filename = `${filenameStem}-${new Date().toISOString().split('T')[0]}.png`;
        const imageFile = new File([outBlob], filename, { type: 'image/png' });
        const shareData = {
          title: shareTitle,
          text: `Today's OUR DAILY QUILT has ${this.quiltEngine.submissionCount} contributors — take a look!`,
          files: [imageFile]
        };
        const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare(shareData);
        if (navigator.share && canShareFiles) {
          await navigator.share(shareData);
          if (layoutH === 1920 && typeof window.odqTrack === 'function') {
            window.odqTrack('download_story_image', { method: 'share_sheet' });
          }
          this.uiService.showToast('Image saved to your camera roll');
          return;
        }
        const url = URL.createObjectURL(outBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (layoutH === 1920 && typeof window.odqTrack === 'function') {
          window.odqTrack('download_story_image', { method: 'download_fallback' });
        }
        this.uiService.showToast('Image saved to your camera roll');
      }

      async createDedicationPostBlob(blockId, message) {
        await this.ensureLayoutBComposeReady?.();
        const focusOptions = this.getDedicationFocusOptions(blockId);
        if (!focusOptions) {
          throw new Error('Could not find the block to dedicate');
        }
        const highResBlob = await this.getHighResQuiltBlobForShare();
        const qt = this.quoteService?.getTodayQuote?.() || { text: '', author: '' };
        const qText = String(qt.text ?? qt.body ?? '').trim();
        const qAuthor = String(qt.author ?? '').trim();
        return composeInstagramLayoutBFromQuiltBlob(
          highResBlob,
          qText,
          qAuthor,
          1080,
          1350,
          Utils.getTodayKey(),
          {
            ...focusOptions,
            dedicationMessage: message
          }
        );
      }

      async handleDedicationSubmit(blockId) {
        const input = document.getElementById('dedicationMessageInput');
        const status = document.getElementById('dedicationStatus');
        const btn = document.getElementById('dedicationShareBtn');
        const panel = document.querySelector('#dedicationModal .dedication-modal-panel');
        const originalBtnHtml = btn?.innerHTML || '';
        const message = String(input?.value || '').replace(/\s+/g, ' ').trim();
        if (!message) {
          if (status) status.textContent = 'Add a short message first.';
          return;
        }
        if (input) input.readOnly = true;
        if (panel) panel.classList.add('is-building');
        if (btn) {
          btn.disabled = true;
          btn.setAttribute('aria-busy', 'true');
          btn.innerHTML = '<span class="stack-btn-content"><span><span class="dedication-busy-dot" aria-hidden="true"></span>Creating image...</span></span>';
        }
        if (status) status.textContent = 'Creating your dedication image...';
        try {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const blob = await this.createDedicationPostBlob(blockId, message);
          if (status) status.textContent = 'Opening share options...';
          const dateStr = new Date().toISOString().split('T')[0];
          await this.shareBlobWithSystem(
            blob,
            `our-daily-quilt-dedication-${dateStr}.png`,
            'OUR DAILY QUILT - Dedication',
            "A block from today's OUR DAILY QUILT."
          );
          this.closeDedicationModal();
        } catch (error) {
          this.errorHandler.handleError(error, 'dedicationShare');
          if (status) status.textContent = 'Could not create the dedication image. Please try again.';
        } finally {
          if (input) input.readOnly = false;
          if (panel) panel.classList.remove('is-building');
          if (btn) {
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
            if (originalBtnHtml) btn.innerHTML = originalBtnHtml;
          }
        }
      }

      async handleShareStoryExperimental() {
        try {
          await this.exportLayoutBShareImage(
            1920,
            'OUR DAILY QUILT (layout B)',
            'our-daily-quilt-story-b'
          );
        } catch (error) {
          this.errorHandler.handleError(error, 'shareFlowExperimental');
        }
      }

      async handleSharePostLayoutExperimental() {
        try {
          await this.exportLayoutBShareImage(
            1350,
            'OUR DAILY QUILT (layout B · 4:5 post)',
            'our-daily-quilt-post-b'
          );
        } catch (error) {
          this.errorHandler.handleError(error, 'shareFlowExperimental');
        }
      }
      async handleTestInstagramImage() {
        try {
          if (!this.quiltEngine.blocks || this.quiltEngine.blocks.length <= 1) {
            return;
          }

          if (!this.archiveService.generateInstagramPostLayoutBImage) {
            this.logger.warn('Layout B post generator not available');
            return;
          }

          const todayKey = Utils.getTodayKey();
          const quote = this.quoteService?.getTodayQuote?.() || null;
          const imageDataUrl = await this.archiveService.generateInstagramPostLayoutBImage(
            this.quiltEngine.blocks,
            quote,
            todayKey
          );

          if (imageDataUrl) {
            const link = document.createElement('a');
            link.href = imageDataUrl;
            link.download = `instagram-layout-b-post-${todayKey}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            await this.saveQuilt();

            this.uiService.showToast('Image saved to your camera roll');
            this.logger.log('✅ Instagram Layout B post image generated and downloaded');
          } else {
            this.logger.warn('Failed to generate Layout B post image');
          }
        } catch (error) {
          this.errorHandler.handleError(error, 'testInstagramImage');
        }
      }

      // Test Instagram image: feed post 4:5 Layout B with speaker portrait overlay.
      async handleTestInstagramSpeakerImage() {
        try {
          if (!this.quiltEngine.blocks || this.quiltEngine.blocks.length <= 1) {
            return;
          }

          if (!this.archiveService.generateInstagramPostLayoutBSpeakerImage) {
            this.logger.warn('Layout B speaker post generator not available');
            return;
          }

          const todayKey = Utils.getTodayKey();
          const quote =
            (this.quoteService && typeof this.quoteService.getQuoteResolvedForInstagramDateKey === 'function'
              ? await this.quoteService.getQuoteResolvedForInstagramDateKey(todayKey)
              : this.quoteService?.getTodayQuote?.()) || null;
          const speakerImageUrl = String(
            quote?.speakerCutoutUrl ??
            quote?.speaker_cutout_url ??
            quote?.speakerCutoutUrlSnapshot ??
            quote?.speakerImageUrl ??
            quote?.speaker_image_url ??
            quote?.speakerImageUrlSnapshot ??
            ''
          ).trim();
          if (!speakerImageUrl) {
            this.uiService.showToast("Today's quote has no speaker image");
            this.logger.warn('Layout B speaker test skipped: no speaker image on today quote');
            return;
          }
          let speakerImageForCanvas = speakerImageUrl;
          if (/^https?:\/\//i.test(speakerImageUrl)) {
            const baseUrl =
              typeof CONFIG !== 'undefined' && CONFIG.BACKEND && CONFIG.BACKEND.baseUrl
                ? String(CONFIG.BACKEND.baseUrl).replace(/\/$/, '')
                : '';
            if (!baseUrl) {
              this.uiService.showToast('Speaker image needs backend proxy for canvas export');
              this.logger.warn('Layout B speaker test skipped: CONFIG.BACKEND.baseUrl is not set');
              return;
            }
            const proxyUrl = `${baseUrl}/api/proxy-image?url=${encodeURIComponent(speakerImageUrl)}`;
            try {
              const res = await fetch(proxyUrl, { cache: 'no-store' });
              if (!res.ok) {
                throw new Error(`Proxy returned ${res.status}`);
              }
              const blob = await res.blob();
              if (!String(blob.type || '').startsWith('image/')) {
                throw new Error(`Proxy returned ${blob.type || 'unknown content type'}`);
              }
              speakerImageForCanvas = await Utils.blobToDataUrl(blob);
            } catch (proxyError) {
              this.uiService.showToast('Speaker proxy is not live yet — deploy server.js first');
              this.logger.warn('Layout B speaker test skipped: proxy image fetch failed', {
                proxyUrl,
                sourceUrl: speakerImageUrl,
                error: proxyError?.message || proxyError
              });
              return;
            }
          }
          const quoteForCanvas = {
            ...quote,
            speakerCutoutUrl: speakerImageForCanvas,
            speaker_cutout_url: speakerImageForCanvas,
            speakerCutoutUrlSnapshot: speakerImageForCanvas
          };

          const imageDataUrl = await this.archiveService.generateInstagramPostLayoutBSpeakerImage(
            this.quiltEngine.blocks,
            quoteForCanvas,
            todayKey
          );

          if (imageDataUrl) {
            const link = document.createElement('a');
            link.href = imageDataUrl;
            link.download = `instagram-layout-b-speaker-post-${todayKey}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            await this.saveQuilt();

            this.uiService.showToast('Speaker image saved to your camera roll');
            this.logger.log('✅ Instagram Layout B speaker post image generated and downloaded');
          } else {
            this.logger.warn('Failed to generate Layout B speaker post image');
            this.uiService.showToast('Failed to generate speaker post image');
          }
        } catch (error) {
          this.errorHandler.handleError(error, 'testInstagramSpeakerImage');
        }
      }

      // Test Instagram image: story 9:16 Layout B (downloads directly like post button)
      async handleTestInstagramStoryImage() {
        await this.ensureLayoutBComposeReady?.();
        try {
          if (!this.quiltEngine.blocks || this.quiltEngine.blocks.length <= 1) {
            return;
          }

          const todayKey = Utils.getTodayKey();
          const quote = this.quoteService?.getTodayQuote?.() || { text: '', author: '' };
          const qText = String(quote.text ?? quote.body ?? '').trim();
          const qAuthor = String(quote.author ?? '').trim();
          const highResBlob = await this.getHighResQuiltBlobForShare();
          const outBlob = await composeInstagramLayoutBFromQuiltBlob(
            highResBlob,
            qText,
            qAuthor,
            1080,
            1920,
            todayKey
          );
          if (!outBlob) {
            this.logger.warn('Failed to generate Layout B story image');
            return;
          }

          const url = URL.createObjectURL(outBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `instagram-layout-b-story-${todayKey}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          await this.saveQuilt();
          this.uiService.showToast('Image saved to your camera roll');
          this.logger.log('✅ Instagram Layout B story image generated and downloaded');
        } catch (error) {
          this.errorHandler.handleError(error, 'testInstagramStoryImage');
        }
      }

      // Test Instagram image: story 9:16 Layout B with speaker portrait overlay.
      async handleTestInstagramStorySpeakerImage() {
        await this.ensureLayoutBComposeReady?.();
        try {
          if (!this.quiltEngine.blocks || this.quiltEngine.blocks.length <= 1) {
            return;
          }

          const todayKey = Utils.getTodayKey();
          const quote =
            (this.quoteService && typeof this.quoteService.getQuoteResolvedForInstagramDateKey === 'function'
              ? await this.quoteService.getQuoteResolvedForInstagramDateKey(todayKey)
              : this.quoteService?.getTodayQuote?.()) || { text: '', author: '' };
          const speakerImageForCanvas = await odqResolveSpeakerImageForTune(quote, this.archiveService);
          if (!speakerImageForCanvas) {
            this.uiService.showToast("Today's quote has no speaker image");
            this.logger.warn('Layout B speaker story test skipped: no speaker image on today quote');
            return;
          }

          const qText = String(quote.text ?? quote.body ?? '').trim();
          const qAuthor = String(quote.author ?? '').trim();
          const speakerName = String(quote.speakerName ?? quote.speaker_name ?? qAuthor).replace(/^\s*[—-]\s*/, '').trim();
          const washColor = String(
            window.app?.getSpeakerCutoutWashColor?.() ||
              window.app?.getMostPopularQuiltColor?.(this.quiltEngine.blocks)?.color ||
            CONFIG.APP.defaultColor ||
            '#ea9b9a'
          ).trim();
          const highResBlob = await this.getHighResQuiltBlobForShare();
          const speakerCutoutPreset = odqReadSpeakerCutoutPreset(todayKey, 'story');
          const speakerCutoutTransform = await odqSpeakerCutoutTransformForDateAsync(todayKey, 'story');
          const outBlob = await composeInstagramLayoutBFromQuiltBlob(
            highResBlob,
            qText,
            qAuthor,
            1080,
            1920,
            todayKey,
            {
              tuneAspect: 'story',
              speakerCutoutQuote: quote,
              speakerOverlay: {
                enabled: true,
                imageUrl: speakerImageForCanvas,
                cutoutSourceUrl: String(globalThis.odqSpeakerImageUrlFromQuote?.(quote) || '').trim(),
                name: speakerName,
                washColor,
                transform: speakerCutoutTransform || undefined
              }
            }
          );
          if (!outBlob) {
            this.logger.warn('Failed to generate Layout B speaker story image');
            return;
          }

          const url = URL.createObjectURL(outBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `instagram-layout-b-speaker-story-${todayKey}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          await this.saveQuilt();
          this.uiService.showToast('Speaker story image saved to your camera roll');
          this.logger.log('✅ Instagram Layout B speaker story image generated and downloaded');
        } catch (error) {
          this.errorHandler.handleError(error, 'testInstagramStorySpeakerImage');
        }
      }

      _getQuoteForTuneModalSync(todayKey) {
        const qs = this.quoteService;
        const dk = String(todayKey || '').trim();
        if (!qs) return { text: '', author: '' };
        const pinned = qs._pinnedByDateKey?.[dk];
        if (pinned) return pinned;
        const today = typeof qs.getTodayQuote === 'function' ? qs.getTodayQuote() : null;
        if (today) return today;
        return (typeof qs.getQuoteForDate === 'function' ? qs.getQuoteForDate(dk) : null) || { text: '', author: '' };
      }

      async _getQuoteForTuneModal(todayKey) {
        let quote = this._getQuoteForTuneModalSync(todayKey);
        if (odqQuoteMayHaveSpeakerImage(quote, this.archiveService)) return quote;
        const qs = this.quoteService;
        if (!qs || typeof qs.getQuoteResolvedForInstagramDateKey !== 'function') return quote;
        try {
          const resolved = await odqPromiseWithTimeout(
            qs.getQuoteResolvedForInstagramDateKey(todayKey),
            6000,
            'Quote load'
          );
          if (resolved) return resolved;
        } catch (resolveErr) {
          this.logger.warn('Tune modal: using cached quote (Firestore resolve skipped)', resolveErr);
        }
        return quote;
      }

      /** Drop stale tune-modal guard flags when DOM/state disagree (e.g. hung prefetch). */
      _syncSpeakerTuneModalGuard() {
        const modalInDom = !!document.querySelector('.odq-speaker-tune-modal');
        this._speakerTuneModalOpen = modalInDom;
        const openingAt = Number(this._speakerTuneModalOpeningAt) || 0;
        if (this._speakerTuneModalOpening && openingAt && Date.now() - openingAt > 45000) {
          this._speakerTuneModalOpening = false;
          this._speakerTuneModalOpeningAt = 0;
        }
      }

      _showSpeakerTunePrepOverlay() {
        this._hideSpeakerTunePrepOverlay();
        const el = document.createElement('div');
        el.className = 'odq-speaker-tune-prep-overlay';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-busy', 'true');
        el.innerHTML =
          '<div class="odq-speaker-tune-prep-overlay__panel">' +
          '<div class="loading-spinner odq-speaker-tune-prep-overlay__spinner" aria-hidden="true"></div>' +
          '<span class="odq-speaker-tune-prep-overlay__label">Opening tune…</span></div>';
        document.body.appendChild(el);
      }

      _hideSpeakerTunePrepOverlay() {
        document.querySelectorAll('.odq-speaker-tune-prep-overlay').forEach((el) => el.remove());
      }

      /**
       * Admin: live-preview modal for Layout B story (9:16) and post (4:5).
       * Speaker placement, keyword emphasis, and text-strip layout are persisted per aspect (localStorage + Firestore).
       */
      async handleAdminTuneSpeakerCutout() {
        this._syncSpeakerTuneModalGuard();
        if (this._speakerTuneModalOpen) return;
        if (this._speakerTuneModalOpening) {
          const openingAt = Number(this._speakerTuneModalOpeningAt) || 0;
          if (openingAt && Date.now() - openingAt < 4000) {
            this.uiService.showToast('Opening tune…');
          }
          return;
        }
        this._speakerTuneModalOpening = true;
        this._speakerTuneModalOpeningAt = Date.now();
        const dismissTuneModal = () => {
          document.querySelectorAll('.odq-speaker-tune-modal').forEach((el) => el.remove());
          this._speakerTuneModalOpen = false;
          globalThis.odqClearTuneComposeSpeakerImgCache?.();
        };
        try {
          document.querySelectorAll('.odq-speaker-tune-modal').forEach((el) => el.remove());
          this._speakerTuneModalOpen = false;

          if (!this.quiltEngine.blocks || this.quiltEngine.blocks.length <= 1) {
            this.uiService.showToast('Add some blocks to the quilt first');
            return;
          }

          await this.ensureLayoutBComposeReady?.();

          this._showSpeakerTunePrepOverlay();

          if (typeof this.ensureFirebaseAuthForFirestore === 'function') {
            void this.ensureFirebaseAuthForFirestore({ timeoutMs: 45000 }).catch((authErr) => {
              this.logger?.warn?.('Tune modal: Firebase auth prewarm failed', authErr);
            });
          }
          const tuneBackendBase =
            typeof globalThis.odqBackendBaseUrl === 'function'
              ? globalThis.odqBackendBaseUrl()
              : String(globalThis.CONFIG?.BACKEND?.baseUrl || '').replace(/\/$/, '');
          if (tuneBackendBase) {
            void fetch(`${tuneBackendBase}/api/push-layout-b-tune`, { method: 'OPTIONS' }).catch(() => {});
          }

          const todayKey =
            (this.quoteService && typeof this.quoteService.getQuoteCalendarKeyNow === 'function'
              ? this.quoteService.getQuoteCalendarKeyNow()
              : Utils.getTodayKey());

          try {
            if (globalThis.LiveDailyDataSync?.waitForFirebaseReady) {
              await odqPromiseWithTimeout(
                globalThis.LiveDailyDataSync.waitForFirebaseReady(4000),
                4500,
                'Firebase ready for tune prefetch'
              );
            }
            if (typeof globalThis.odqPrefetchLayoutBTuneFields === 'function') {
              await odqPromiseWithTimeout(
                globalThis.odqPrefetchLayoutBTuneFields(todayKey, 8000),
                9000,
                'Tune prefetch'
              );
            } else {
              await odqPromiseWithTimeout(odqPrefetchSpeakerCutoutTweak(todayKey), 8000, 'Tune prefetch');
            }
          } catch (prefetchErr) {
            this.logger.warn('Tune modal: prefetch skipped', prefetchErr);
          }

          let quote = this._getQuoteForTuneModalSync(todayKey);
          let qText = String(quote.text ?? quote.body ?? '').trim();
          let qAuthor = String(quote.author ?? '').trim();
          let speakerName = String(quote.speakerName ?? quote.speaker_name ?? qAuthor).replace(/^\s*[—-]\s*/, '').trim();
          const washColor = String(
            window.app?.getSpeakerCutoutWashColor?.() ||
              window.app?.getMostPopularQuiltColor?.(this.quiltEngine.blocks)?.color ||
            CONFIG.APP.defaultColor ||
            '#ea9b9a'
          ).trim();

          let speakerImageForCanvas = '';
          let highResBlob = null;
          let postHighResBlob = null;
          let tuneQuiltSource = 'unknown';
          let postTuneQuiltSource = 'unknown';
          let tuneAssetsReady = false;
          let postPreviewPrefetchPromise = null;
          let allowBackdropClose = false;
          let enableBackdropCloseTimer = 0;
          let savedKeywordEmphasis = null;
          const selfRef = this;
          const modal = document.createElement('div');
          modal.className = 'odq-speaker-tune-modal';
          modal.innerHTML = `
            <div class="odq-speaker-tune-panel" role="dialog" aria-modal="true" aria-label="Tune today's speaker cutout">
              <div class="odq-speaker-tune-preview-wrap">
                <div class="odq-speaker-tune-preview-composite">
                  <div class="odq-speaker-tune-preview-slide1-wrap">
                    <img class="odq-speaker-tune-preview" alt="Layout B preview" />
                  </div>
                </div>
                <div class="odq-speaker-tune-spinner">Loading quilt and speaker…</div>
              </div>
              <div class="odq-speaker-tune-aspect">
                <span>Preview:</span>
                <button type="button" data-aspect="story" class="is-active">Story 9:16</button>
                <button type="button" data-aspect="post">Post 4:5</button>
                <button type="button" data-aspect="feed">Feed slide 1</button>
              </div>
              <div class="odq-speaker-tune-drag-mode">
                <span>Drag on preview:</span>
                <button type="button" data-drag-mode="speaker" class="is-active">Speaker</button>
                <button type="button" data-drag-mode="text">Text</button>
                <button type="button" data-drag-mode="strip" hidden>Strip</button>
                <button type="button" data-drag-mode="off">Off</button>
                <span class="odq-speaker-tune-drag-hint" data-drag-hint></span>
              </div>
              <details class="odq-speaker-tune-details">
                <summary>Speaker placement</summary>
                <div class="odq-speaker-tune-status"><span data-nudge-label></span></div>
                <div class="odq-speaker-tune-nudge" aria-label="Nudge speaker position">
                  <div class="odq-speaker-tune-nudge-row">
                    <span class="odq-speaker-tune-nudge-label">Nudge</span>
                    <button type="button" data-nudge="left" aria-label="Nudge left">←</button>
                    <button type="button" data-nudge="up" aria-label="Nudge up">↑</button>
                    <button type="button" data-nudge="down" aria-label="Nudge down">↓</button>
                    <button type="button" data-nudge="right" aria-label="Nudge right">→</button>
                  </div>
                  <div class="odq-speaker-tune-nudge-row">
                    <span class="odq-speaker-tune-nudge-label">Big nudge</span>
                    <button type="button" data-big-nudge="left" aria-label="Big nudge left">⇐</button>
                    <button type="button" data-big-nudge="up" aria-label="Big nudge up">⇑</button>
                    <button type="button" data-big-nudge="down" aria-label="Big nudge down">⇓</button>
                    <button type="button" data-big-nudge="right" aria-label="Big nudge right">⇒</button>
                  </div>
                  <div class="odq-speaker-tune-nudge-row">
                    <span class="odq-speaker-tune-nudge-label">Rotate</span>
                    <button type="button" data-rotate="ccw" aria-label="Rotate counter-clockwise">↺</button>
                    <button type="button" data-rotate="cw" aria-label="Rotate clockwise">↻</button>
                    <span class="odq-speaker-tune-nudge-label">Size</span>
                    <button type="button" data-speaker-scale="shrink" aria-label="Shrink speaker">Shrink</button>
                    <button type="button" data-speaker-scale="enlarge" aria-label="Enlarge speaker">Enlarge</button>
                    <button type="button" data-action="reset-nudge">Reset tweaks</button>
                  </div>
                </div>
              </details>
              <details class="odq-speaker-tune-details">
                <summary>Quilt background</summary>
                <div class="odq-speaker-tune-quilt-zoom">
                  <div data-quilt-bg-zoom-status>Zoom: <strong data-quilt-bg-zoom-label>Default</strong></div>
                  <div class="odq-speaker-tune-quilt-zoom-actions">
                    <button type="button" data-action="quilt-zoom-out" aria-label="Zoom quilt background out">Zoom out</button>
                    <button type="button" data-action="quilt-zoom-in" aria-label="Zoom quilt background in">Zoom in</button>
                    <button type="button" data-action="quilt-zoom-reset">Reset zoom</button>
                  </div>
                  <div data-quilt-bg-offset-status>Position: <strong data-quilt-bg-offset-label>Centered</strong></div>
                  <div class="odq-speaker-tune-quilt-offset" aria-label="Shift quilt background up or down">
                    <div class="odq-speaker-tune-nudge-row">
                      <span class="odq-speaker-tune-nudge-label">Shift</span>
                      <button type="button" data-quilt-offset="up" aria-label="Shift quilt background up">↑</button>
                      <button type="button" data-quilt-offset="down" aria-label="Shift quilt background down">↓</button>
                      <button type="button" data-action="quilt-offset-reset">Reset position</button>
                    </div>
                    <div class="odq-speaker-tune-nudge-row">
                      <span class="odq-speaker-tune-nudge-label">Big shift</span>
                      <button type="button" data-quilt-big-offset="up" aria-label="Shift quilt background up more">⇑</button>
                      <button type="button" data-quilt-big-offset="down" aria-label="Shift quilt background down more">⇓</button>
                    </div>
                  </div>
                </div>
              </details>
              <details class="odq-speaker-tune-details odq-speaker-tune-keywords-details">
                <summary>Keyword emphasis</summary>
                <div class="odq-speaker-tune-keywords">
                  <label for="odq-kw-input">Keywords (comma-separated, up to 3)</label>
                  <input type="text" id="odq-kw-input" placeholder="through, invincible summer" autocomplete="off" />
                  <div class="odq-speaker-tune-kw-styles">
                    <label><input type="checkbox" data-style="bold" /> Bold</label>
                    <label><input type="checkbox" data-style="italic" /> Italic</label>
                    <label><input type="checkbox" data-style="underline" /> Underline</label>
                    <label><input type="checkbox" data-style="caps" /> All caps</label>
                    <label><input type="checkbox" data-style="angle-up" /> Angle up</label>
                    <label><input type="checkbox" data-style="angle-down" /> Angle down</label>
                    <label><input type="checkbox" data-style="scale" /> Scale up</label>
                  </div>
                  <div class="odq-speaker-tune-kw-hint" hidden></div>
                </div>
              </details>
              <details class="odq-speaker-tune-details odq-speaker-tune-strip-details">
                <summary data-strip-section-summary>Text strip layout</summary>
                <div class="odq-speaker-tune-strip-layout">
                  <div class="odq-speaker-tune-nudge-row odq-speaker-tune-selected-strip-rotate" hidden data-selected-strip-rotate-row>
                    <span class="odq-speaker-tune-nudge-label">Selected</span>
                    <strong data-selected-strip-label>—</strong>
                    <span class="odq-speaker-tune-nudge-label">Rotate</span>
                    <button type="button" data-strip-rotate="ccw" aria-label="Rotate selected strip counter-clockwise">↺</button>
                    <button type="button" data-strip-rotate="cw" aria-label="Rotate selected strip clockwise">↻</button>
                    <button type="button" data-strip-split aria-label="Split last word into a new strip">Split</button>
                  </div>
                  <div data-strip-layout-status>Arrangement: <strong data-strip-layout-label>#1</strong></div>
                  <button type="button" data-action="shuffle-strips">New arrangement</button>
                  <div data-quote-strip-offset-status>Position: <strong data-quote-strip-offset-label>Centered</strong></div>
                  <div class="odq-speaker-tune-strip-offset" aria-label="Move all quote strips">
                    <div class="odq-speaker-tune-nudge-row">
                      <span class="odq-speaker-tune-nudge-label" data-strip-offset-move-label>Move strips</span>
                      <button type="button" data-strip-offset="left" aria-label="Move quote strips left">←</button>
                      <button type="button" data-strip-offset="up" aria-label="Move quote strips up">↑</button>
                      <button type="button" data-strip-offset="down" aria-label="Move quote strips down">↓</button>
                      <button type="button" data-strip-offset="right" aria-label="Move quote strips right">→</button>
                    </div>
                    <div class="odq-speaker-tune-nudge-row">
                      <span class="odq-speaker-tune-nudge-label">Big move</span>
                      <button type="button" data-strip-big-offset="left" aria-label="Move quote strips left more">⇐</button>
                      <button type="button" data-strip-big-offset="up" aria-label="Move quote strips up more">⇑</button>
                      <button type="button" data-strip-big-offset="down" aria-label="Move quote strips down more">⇓</button>
                      <button type="button" data-strip-big-offset="right" aria-label="Move quote strips right more">⇒</button>
                      <button type="button" data-action="reset-strip-offset">Reset position</button>
                    </div>
                  </div>
                  <button type="button" data-action="reset-strip-plan" hidden>Reset individual strip positions</button>
                </div>
              </details>
              <div class="odq-speaker-tune-actions">
                <button type="button" data-action="reset">Reset</button>
                <button type="button" data-action="save">Save</button>
                <button type="button" data-action="close">Close</button>
              </div>
            </div>
          `;
          modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100060;display:flex;align-items:center;justify-content:center;padding:10px;';
          const panel = modal.querySelector('.odq-speaker-tune-panel');
          panel.style.cssText = 'background:#fff;border-radius:8px;padding:10px;max-width:520px;width:100%;max-height:96vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;-webkit-overflow-scrolling:touch;';
          const previewWrap = modal.querySelector('.odq-speaker-tune-preview-wrap');
          previewWrap.style.cssText =
            'position:relative;background:#222;border-radius:6px;overflow:hidden;width:min(100%,34.875vh);max-width:100%;margin:0 auto;aspect-ratio:9/16;flex:0 0 auto;max-height:62vh;';
          const previewComposite = modal.querySelector('.odq-speaker-tune-preview-composite');
          previewComposite.style.cssText =
            'display:flex;flex-direction:row;align-items:stretch;width:100%;height:100%;min-height:0;gap:0;';
          const previewSlide1Wrap = modal.querySelector('.odq-speaker-tune-preview-slide1-wrap');
          previewSlide1Wrap.style.cssText =
            'position:relative;display:block;flex:1 1 auto;width:100%;height:100%;min-width:0;overflow:hidden;';
          const stripHitLayer = document.createElement('div');
          stripHitLayer.className = 'odq-speaker-tune-strip-hit-layer';
          stripHitLayer.hidden = true;
          stripHitLayer.style.cssText =
            'position:absolute;inset:0;z-index:2;pointer-events:none;';
          previewSlide1Wrap.appendChild(stripHitLayer);
          let syncStripHitOverlay = () => {};
          const previewImg = modal.querySelector('.odq-speaker-tune-preview');
          previewImg.style.cssText = 'display:block;width:100%;height:100%;min-width:0;object-fit:contain;';
          const spinner = modal.querySelector('.odq-speaker-tune-spinner');
          spinner.style.cssText =
            'position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#888;font-size:12px;background:transparent;pointer-events:none;';
          const nudgeWrap = modal.querySelector('.odq-speaker-tune-nudge');
          const nudgeBtnStyle =
            'padding:6px 10px;border:1px solid #aaa;background:#fff;cursor:pointer;border-radius:3px;font-size:14px;line-height:1;touch-action:manipulation;min-width:36px;';
          if (nudgeWrap) {
            nudgeWrap.style.cssText =
              'display:flex;flex-direction:column;gap:6px;margin-top:6px;';
            for (const row of nudgeWrap.querySelectorAll('.odq-speaker-tune-nudge-row')) {
              row.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
            }
            for (const label of nudgeWrap.querySelectorAll('.odq-speaker-tune-nudge-label')) {
              label.style.cssText = 'font-size:10px;font-weight:600;color:#666;margin-right:2px;';
            }
            for (const btn of nudgeWrap.querySelectorAll('button')) {
              btn.style.cssText = nudgeBtnStyle;
            }
            const resetNudgeBtn = nudgeWrap.querySelector('button[data-action="reset-nudge"]');
            if (resetNudgeBtn) {
              resetNudgeBtn.style.fontSize = '10px';
              resetNudgeBtn.style.padding = '4px 8px';
              resetNudgeBtn.style.minWidth = '0';
            }
          }
          const nudgeBtns = nudgeWrap
            ? [
                ...nudgeWrap.querySelectorAll(
                  'button[data-nudge], button[data-big-nudge], button[data-rotate], button[data-speaker-scale]'
                )
              ]
            : [];
          const actionsWrap = modal.querySelector('.odq-speaker-tune-actions');
          actionsWrap.style.cssText = 'display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap;';
          const aspectWrap = modal.querySelector('.odq-speaker-tune-aspect');
          aspectWrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:11px;';
          const statusEl = modal.querySelector('.odq-speaker-tune-status');
          if (statusEl) statusEl.style.cssText = 'font-size:10px;margin:4px 0 0;';
          const aspectBtns = [...modal.querySelectorAll('.odq-speaker-tune-aspect button[data-aspect]')];
          for (const btn of aspectBtns) {
            btn.style.cssText = 'padding:2px 6px;border:1px solid #aaa;background:#fff;cursor:pointer;border-radius:3px;font-size:11px;line-height:1.2;touch-action:manipulation;';
          }
          const dragModeWrap = modal.querySelector('.odq-speaker-tune-drag-mode');
          if (dragModeWrap) {
            dragModeWrap.style.cssText =
              'display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:11px;';
            const dragHintEl = dragModeWrap.querySelector('[data-drag-hint]');
            if (dragHintEl) {
              dragHintEl.style.cssText = 'flex:1 1 100%;font-size:10px;color:#666;margin:0;';
            }
            for (const btn of dragModeWrap.querySelectorAll('button[data-drag-mode]')) {
              btn.style.cssText =
                'padding:2px 6px;border:1px solid #aaa;background:#fff;cursor:pointer;border-radius:3px;font-size:11px;line-height:1.2;touch-action:manipulation;';
            }
          }
          previewSlide1Wrap.setAttribute('data-preview-drag-surface', 'true');
          for (const detailsEl of modal.querySelectorAll('.odq-speaker-tune-details')) {
            detailsEl.style.cssText = 'margin:0;';
            const summaryEl = detailsEl.querySelector('summary');
            if (summaryEl) {
              summaryEl.style.cssText = 'padding:2px 6px;border:1px solid #ccc;border-radius:3px;background:#f8f8f8;cursor:pointer;font-size:11px;line-height:1.2;list-style:none;user-select:none;';
            }
          }
          const kwSection = modal.querySelector('.odq-speaker-tune-keywords');
          kwSection.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:11px;margin-top:4px;';
          const kwInput = modal.querySelector('#odq-kw-input');
          kwInput.style.cssText = 'width:100%;padding:8px 6px;border:1px solid #ccc;border-radius:3px;font-size:16px;line-height:1.2;box-sizing:border-box;touch-action:manipulation;';
          const kwStylesWrap = modal.querySelector('.odq-speaker-tune-kw-styles');
          kwStylesWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 8px;font-size:10px;';
          const kwHintEl = modal.querySelector('.odq-speaker-tune-kw-hint');
          if (kwHintEl) kwHintEl.style.cssText = 'font-size:11px;line-height:1.3;color:#a33;margin:0;';
          const setTuneDebug = (_msg) => {
            /* debug line removed from modal UI */
          };

          const stripLayoutSection = modal.querySelector('.odq-speaker-tune-strip-layout');
          if (stripLayoutSection) {
            stripLayoutSection.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:4px;';
            const stripStatusEl = stripLayoutSection.querySelector('[data-strip-layout-status]');
            if (stripStatusEl) stripStatusEl.style.cssText = 'font-size:10px;';
            const stripOffsetStatusEl = stripLayoutSection.querySelector('[data-quote-strip-offset-status]');
            if (stripOffsetStatusEl) stripOffsetStatusEl.style.cssText = 'font-size:10px;';
            const shuffleBtn = stripLayoutSection.querySelector('button[data-action="shuffle-strips"]');
            if (shuffleBtn) {
              shuffleBtn.style.cssText = 'padding:4px 8px;border:1px solid #000;background:#fff;cursor:pointer;border-radius:3px;font-size:11px;line-height:1.2;align-self:flex-start;';
            }
            const resetStripPlanBtnEl = stripLayoutSection.querySelector('button[data-action="reset-strip-plan"]');
            if (resetStripPlanBtnEl) {
              resetStripPlanBtnEl.style.cssText =
                'padding:4px 8px;border:1px solid #888;background:#fff;cursor:pointer;border-radius:3px;font-size:11px;line-height:1.2;align-self:flex-start;';
            }
            const selectedStripRotateRow = stripLayoutSection.querySelector('[data-selected-strip-rotate-row]');
            if (selectedStripRotateRow) {
              selectedStripRotateRow.style.cssText =
                'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
              for (const label of selectedStripRotateRow.querySelectorAll('.odq-speaker-tune-nudge-label')) {
                label.style.cssText = 'font-size:10px;font-weight:600;color:#666;margin-right:2px;';
              }
              for (const btn of selectedStripRotateRow.querySelectorAll('button[data-strip-rotate]')) {
                btn.style.cssText = nudgeBtnStyle;
              }
              const splitBtn = selectedStripRotateRow.querySelector('button[data-strip-split]');
              if (splitBtn) {
                splitBtn.style.cssText =
                  'padding:4px 8px;border:1px solid #000;background:#fff;cursor:pointer;border-radius:3px;font-size:11px;line-height:1.2;min-width:0;';
              }
            }
            const stripOffsetWrap = stripLayoutSection.querySelector('.odq-speaker-tune-strip-offset');
            if (stripOffsetWrap) {
              stripOffsetWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
              for (const row of stripOffsetWrap.querySelectorAll('.odq-speaker-tune-nudge-row')) {
                row.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
              }
              for (const label of stripOffsetWrap.querySelectorAll('.odq-speaker-tune-nudge-label')) {
                label.style.cssText = 'font-size:10px;font-weight:600;color:#666;margin-right:2px;';
              }
              for (const btn of stripOffsetWrap.querySelectorAll('button')) {
                btn.style.cssText = nudgeBtnStyle;
              }
              const resetStripOffsetBtn = stripOffsetWrap.querySelector('button[data-action="reset-strip-offset"]');
              if (resetStripOffsetBtn) {
                resetStripOffsetBtn.style.fontSize = '10px';
                resetStripOffsetBtn.style.padding = '4px 8px';
                resetStripOffsetBtn.style.minWidth = '0';
              }
            }
          }
          const quiltZoomSection = modal.querySelector('.odq-speaker-tune-quilt-zoom');
          const quiltZoomBtnStyle =
            'padding:4px 8px;border:1px solid #aaa;background:#fff;cursor:pointer;border-radius:3px;font-size:11px;line-height:1.2;touch-action:manipulation;';
          if (quiltZoomSection) {
            quiltZoomSection.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:4px;';
            const quiltZoomStatus = quiltZoomSection.querySelector('[data-quilt-bg-zoom-status]');
            if (quiltZoomStatus) quiltZoomStatus.style.cssText = 'font-size:10px;';
            const quiltOffsetStatus = quiltZoomSection.querySelector('[data-quilt-bg-offset-status]');
            if (quiltOffsetStatus) quiltOffsetStatus.style.cssText = 'font-size:10px;';
            const quiltZoomActions = quiltZoomSection.querySelector('.odq-speaker-tune-quilt-zoom-actions');
            if (quiltZoomActions) {
              quiltZoomActions.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
              for (const btn of quiltZoomActions.querySelectorAll('button')) {
                btn.style.cssText = quiltZoomBtnStyle;
              }
            }
            const quiltOffsetWrap = quiltZoomSection.querySelector('.odq-speaker-tune-quilt-offset');
            if (quiltOffsetWrap) {
              quiltOffsetWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
              for (const row of quiltOffsetWrap.querySelectorAll('.odq-speaker-tune-nudge-row')) {
                row.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
              }
              for (const label of quiltOffsetWrap.querySelectorAll('.odq-speaker-tune-nudge-label')) {
                label.style.cssText = 'font-size:10px;font-weight:600;color:#666;margin-right:2px;';
              }
              for (const btn of quiltOffsetWrap.querySelectorAll('button')) {
                btn.style.cssText = quiltZoomBtnStyle;
              }
              const resetQuiltOffsetBtn = quiltOffsetWrap.querySelector('button[data-action="quilt-offset-reset"]');
              if (resetQuiltOffsetBtn) {
                resetQuiltOffsetBtn.style.fontSize = '10px';
                resetQuiltOffsetBtn.style.padding = '4px 8px';
                resetQuiltOffsetBtn.style.minWidth = '0';
              }
            }
          }
          const styleChecks = [...kwStylesWrap.querySelectorAll('input[data-style]')];

          for (const btn of actionsWrap.querySelectorAll('button')) {
            btn.style.cssText = 'padding:3px 8px;border:1px solid #000;background:#fff;cursor:pointer;border-radius:3px;font-size:11px;line-height:1.2;touch-action:manipulation;';
          }

          const applyTuneKeywordForm = (kwEmphasis) => {
            if (kwEmphasis?.keywords?.length) {
              kwInput.value = kwEmphasis.keywords.join(', ');
            } else if (!String(kwInput.value || '').trim()) {
              const notionKeywordRaw = String(quote.keyword ?? quote.keywordSnapshot ?? '').trim();
              if (notionKeywordRaw) {
                const QKE = globalThis.QuoteKeywordEmphasis;
                const parsedKeywords = QKE?.parseEmphasisWordsInput
                  ? QKE.parseEmphasisWordsInput(notionKeywordRaw, qText)
                  : notionKeywordRaw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
                kwInput.value = parsedKeywords.length ? parsedKeywords.join(', ') : (QKE?.parseEmphasisWordsInput ? '' : notionKeywordRaw);
              }
            }
            const savedStyleSet = new Set(kwEmphasis?.styles || []);
            for (const cb of styleChecks) {
              cb.checked = savedStyleSet.has(cb.dataset.style);
            }
          };
          const storyTweakInit = odqReadSpeakerCutoutTweakFromLocal(todayKey, 'story');
          const postTweakInit = odqReadSpeakerCutoutTweakFromLocal(todayKey, 'post');
          const storyStripOffsetInit =
            odqGetCachedLayoutBQuoteStripOffset?.(todayKey, 'story') || { x: 0, y: 0 };
          const postStripOffsetInit =
            odqGetCachedLayoutBQuoteStripOffset?.(todayKey, 'post') || { x: 0, y: 0 };
          const clippingOffsetInit =
            (typeof odqGetCachedLayoutBCarouselClippingOffset === 'function'
              ? odqGetCachedLayoutBCarouselClippingOffset(todayKey)
              : null) || { x: 0, y: 0 };
          const storyQuiltOffsetInit = odqGetCachedLayoutBQuiltBgOffsetY?.(todayKey, 'story') ?? 0;
          const postQuiltOffsetInit = odqGetCachedLayoutBQuiltBgOffsetY?.(todayKey, 'post') ?? 0;
          const normalizeClippingOffset =
            typeof odqNormalizeCarouselClippingOffset === 'function'
              ? odqNormalizeCarouselClippingOffset
              : odqNormalizeQuoteStripOffset;
          /** Modal tabs: story | post | feed. Feed is UI-only; drafts share Post speaker/quilt. */
          const normalizePreviewAspect = (aspect) => {
            const a = String(aspect || '').trim().toLowerCase();
            if (a === 'post' || a === 'feed') return a;
            return 'story';
          };
          const draftAspectFor = (aspect) => {
            const a = normalizePreviewAspect(aspect);
            return a === 'feed' ? 'post' : a;
          };
          const isFeedPreview = (aspect) => normalizePreviewAspect(aspect) === 'feed';
          const isPostLikePreview = (aspect) => {
            const a = normalizePreviewAspect(aspect);
            return a === 'post' || a === 'feed';
          };
          const tuneDraftByAspect = {
            story: {
              preset: storyTweakInit.preset,
              nudgeCx: storyTweakInit.nudgeCx,
              nudgeCy: storyTweakInit.nudgeCy,
              nudgeRotateDeg: storyTweakInit.nudgeRotateDeg,
              nudgeScale: odqNormalizeSpeakerScaleMul(storyTweakInit.nudgeScale),
              stripLayoutSeed: odqGetCachedLayoutBStripLayoutSeed(todayKey, 'story') ?? 0,
              quiltBgZoom: odqGetCachedLayoutBQuiltBgZoom(todayKey, 'story') ?? ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN,
              quiltBgOffsetY: odqNormalizeQuiltBgOffsetY?.(storyQuiltOffsetInit) ?? 0,
              quoteStripOffset: odqNormalizeQuoteStripOffset?.(storyStripOffsetInit) || { x: 0, y: 0 },
              keywordEmphasis: null
            },
            post: {
              preset: postTweakInit.preset,
              nudgeCx: postTweakInit.nudgeCx,
              nudgeCy: postTweakInit.nudgeCy,
              nudgeRotateDeg: postTweakInit.nudgeRotateDeg,
              nudgeScale: odqNormalizeSpeakerScaleMul(postTweakInit.nudgeScale),
              stripLayoutSeed: odqGetCachedLayoutBStripLayoutSeed(todayKey, 'post') ?? 0,
              quiltBgZoom: odqGetCachedLayoutBQuiltBgZoom(todayKey, 'post') ?? ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN,
              quiltBgOffsetY: odqNormalizeQuiltBgOffsetY?.(postQuiltOffsetInit) ?? 0,
              quoteStripOffset: odqNormalizeQuoteStripOffset?.(postStripOffsetInit) || { x: 0, y: 0 },
              carouselClippingOffset: normalizeClippingOffset?.(clippingOffsetInit) || { x: 0, y: 0 },
              keywordEmphasis: null
            }
          };

          const copyStoryQuoteStyleToPost = () => {
            const s = tuneDraftByAspect.story;
            tuneDraftByAspect.post.stripLayoutSeed = odqNormalizeStripLayoutSeed(s.stripLayoutSeed);
            tuneDraftByAspect.post.keywordEmphasis = s.keywordEmphasis
              ? {
                  keywords: [...(s.keywordEmphasis.keywords || [])],
                  styles: [...(s.keywordEmphasis.styles || [])]
                }
              : null;
          };

          const syncKeywordEmphasisFromUi = () => {
            if (isFeedPreview(previewAspect)) return;
            const kw = getKeywordEmphasisFromForm();
            const kwCopy = kw
              ? { keywords: [...(kw.keywords || [])], styles: [...(kw.styles || [])] }
              : null;
            const a = draftAspectFor(previewAspect);
            /** Post inherits Story quote style — form edits apply to Story first. */
            if (a === 'post' && !postQuoteStyleIndependent) {
              tuneDraftByAspect.story.keywordEmphasis = kwCopy;
              copyStoryQuoteStyleToPost();
              return;
            }
            tuneDraftByAspect[a].keywordEmphasis = kwCopy;
            if (a === 'story' && !postQuoteStyleIndependent) {
              copyStoryQuoteStyleToPost();
            }
          };

          const syncQuoteStyleDraftsFromUi = () => {
            if (isFeedPreview(previewAspect)) return;
            const seed = odqNormalizeStripLayoutSeed(stripLayoutSeed);
            syncKeywordEmphasisFromUi();
            const a = draftAspectFor(previewAspect);
            tuneDraftByAspect[a].stripLayoutSeed = seed;
            if (a === 'story') {
              if (!postQuoteStyleIndependent) copyStoryQuoteStyleToPost();
              invalidateStoryStripPlanCache();
            }
          };

          const lockPostTuneIndependent = () => {
            if (normalizePreviewAspect(previewAspect) === 'post' || isFeedPreview(previewAspect)) {
              postQuoteStyleIndependent = true;
              storyRefStripPlan = null;
              storyRefStripPlanKey = '';
            }
          };

          const maybeLockPostTuneIndependent = () => {
            const preview = normalizePreviewAspect(previewAspect);
            if (preview === 'post' || preview === 'feed') lockPostTuneIndependent();
          };

          /** Speaker preset/nudge/rotate are aspect-specific; Feed reuses the Post draft. */
          const loadSpeakerDraftIntoUi = (aspect = previewAspect) => {
            const s = tuneDraftByAspect[draftAspectFor(aspect)] || tuneDraftByAspect.story;
            currentPreset = s.preset || 'AUTO';
            nudgeCx = odqNormalizeSpeakerNudgeComponent(s.nudgeCx);
            nudgeCy = odqNormalizeSpeakerNudgeComponent(s.nudgeCy);
            nudgeRotateDeg = odqNormalizeSpeakerRotateDeg(s.nudgeRotateDeg);
            nudgeScale = odqNormalizeSpeakerScaleMul(s.nudgeScale);
          };

          const mirrorStorySpeakerToPostDraft = () => {
            const s = tuneDraftByAspect.story;
            const p = tuneDraftByAspect.post;
            p.preset = s.preset;
            p.nudgeCx = s.nudgeCx;
            p.nudgeCy = s.nudgeCy;
            p.nudgeRotateDeg = s.nudgeRotateDeg;
            p.nudgeScale = s.nudgeScale;
          };

          const mirrorPostSpeakerToStoryDraft = () => {
            const s = tuneDraftByAspect.story;
            const p = tuneDraftByAspect.post;
            s.preset = p.preset;
            s.nudgeCx = p.nudgeCx;
            s.nudgeCy = p.nudgeCy;
            s.nudgeRotateDeg = p.nudgeRotateDeg;
            s.nudgeScale = p.nudgeScale;
          };

          const syncLinkedSpeakerDrafts = (sourceAspect = previewAspect) => {
            if (postQuoteStyleIndependent) return;
            if (postDraftDiffersFromStoryDraft()) return;
            const a = draftAspectFor(sourceAspect);
            if (a === 'story') mirrorStorySpeakerToPostDraft();
            else mirrorPostSpeakerToStoryDraft();
          };

          /** Copy live speaker UI into one aspect draft. Skip cross-aspect mirroring on Save. */
          const saveSpeakerDraftFromUi = (aspect = previewAspect, options = {}) => {
            const a = draftAspectFor(aspect);
            if (a === 'post') lockPostTuneIndependent();
            const s = tuneDraftByAspect[a];
            s.preset = currentPreset;
            s.nudgeCx = nudgeCx;
            s.nudgeCy = nudgeCy;
            s.nudgeRotateDeg = odqNormalizeSpeakerRotateDeg(nudgeRotateDeg);
            s.nudgeScale = nudgeScale;
            if (options.linkDrafts !== false) {
              syncLinkedSpeakerDrafts(a);
            }
          };

          const captureLayoutDraftFromUi = (aspect) => {
            const preview = normalizePreviewAspect(aspect);
            const a = draftAspectFor(preview);
            if (a === 'post' || preview === 'feed') lockPostTuneIndependent();
            tuneDraftByAspect[a].quiltBgZoom = odqNormalizeQuiltBgZoom(quiltBgZoom);
            tuneDraftByAspect[a].quiltBgOffsetY = odqNormalizeQuiltBgOffsetY?.(quiltBgOffsetY) ?? 0;
            if (preview === 'feed') {
              tuneDraftByAspect.post.carouselClippingOffset =
                normalizeClippingOffset?.(quoteStripOffset) || { x: 0, y: 0 };
              return;
            }
            tuneDraftByAspect[a].stripLayoutSeed = odqNormalizeStripLayoutSeed(stripLayoutSeed);
            const kw = getKeywordEmphasisFromForm();
            const kwCopy = kw
              ? { keywords: [...(kw.keywords || [])], styles: [...(kw.styles || [])] }
              : null;
            if (a === 'post' && !postQuoteStyleIndependent) {
              tuneDraftByAspect.story.keywordEmphasis = kwCopy;
              copyStoryQuoteStyleToPost();
            } else {
              tuneDraftByAspect[a].keywordEmphasis = kwCopy;
            }
            tuneDraftByAspect[a].quoteStripOffset =
              odqNormalizeQuoteStripOffset?.(quoteStripOffset) || { x: 0, y: 0 };
            if (a === 'story' && !postQuoteStyleIndependent) {
              copyStoryQuoteStyleToPost();
            }
          };

          const captureDraftFromUi = (aspect) => {
            saveSpeakerDraftFromUi(aspect);
            captureLayoutDraftFromUi(aspect);
          };

          const storyQuoteStyleDraft = () => ({
            keywordEmphasis: tuneDraftByAspect.story.keywordEmphasis,
            stripLayoutSeed: odqNormalizeStripLayoutSeed(tuneDraftByAspect.story.stripLayoutSeed),
            quoteStripOffset:
              odqNormalizeQuoteStripOffset?.(tuneDraftByAspect.story.quoteStripOffset) || { x: 0, y: 0 }
          });

          const quoteStyleForAspect = (aspect) => {
            const a = odqNormalizeTuneAspect(aspect);
            if (a === 'post' && !postQuoteStyleIndependent) {
              return {
                ...storyQuoteStyleDraft(),
                quoteStripOffset:
                  odqNormalizeQuoteStripOffset?.(tuneDraftByAspect.post.quoteStripOffset) || { x: 0, y: 0 }
              };
            }
            if (a === odqNormalizeTuneAspect(previewAspect)) {
              return {
                keywordEmphasis: getKeywordEmphasisFromForm(),
                stripLayoutSeed: odqNormalizeStripLayoutSeed(stripLayoutSeed),
                quoteStripOffset: odqNormalizeQuoteStripOffset?.(quoteStripOffset) || { x: 0, y: 0 }
              };
            }
            const d = tuneDraftByAspect[a];
            return {
              keywordEmphasis: d.keywordEmphasis,
              stripLayoutSeed: odqNormalizeStripLayoutSeed(d.stripLayoutSeed),
              quoteStripOffset: odqNormalizeQuoteStripOffset?.(d.quoteStripOffset) || { x: 0, y: 0 }
            };
          };

          const applyDraftToUi = (aspect) => {
            const preview = normalizePreviewAspect(aspect);
            const a = draftAspectFor(preview);
            loadSpeakerDraftIntoUi(a);
            const d = tuneDraftByAspect[a];
            if (preview !== 'feed' && a === 'post' && !postQuoteStyleIndependent && !postDraftDiffersFromStoryDraft()) {
              copyStoryQuoteStyleToPost();
              const s = storyQuoteStyleDraft();
              stripLayoutSeed = s.stripLayoutSeed;
              applyTuneKeywordForm(s.keywordEmphasis);
            } else if (preview !== 'feed') {
              stripLayoutSeed = odqNormalizeStripLayoutSeed(d.stripLayoutSeed);
              applyTuneKeywordForm(d.keywordEmphasis);
            }
            quiltBgZoom = odqNormalizeQuiltBgZoom(d.quiltBgZoom);
            quiltBgOffsetY = odqNormalizeQuiltBgOffsetY?.(d.quiltBgOffsetY) ?? 0;
            if (preview === 'feed') {
              quoteStripOffset = normalizeClippingOffset?.(d.carouselClippingOffset) || { x: 0, y: 0 };
            } else {
              quoteStripOffset = odqNormalizeQuoteStripOffset?.(d.quoteStripOffset) || { x: 0, y: 0 };
            }
            updateActiveButton();
            updateStripLayoutLabel();
            updateQuiltBgZoomLabel();
            updateQuiltBgOffsetLabel();
            updateQuoteStripOffsetLabel();
            syncFeedSlide1TuneControls();
          };

          let currentPreset = tuneDraftByAspect.story.preset;
          let nudgeCx = tuneDraftByAspect.story.nudgeCx;
          let nudgeCy = tuneDraftByAspect.story.nudgeCy;
          let nudgeRotateDeg = tuneDraftByAspect.story.nudgeRotateDeg;
          let nudgeScale = odqNormalizeSpeakerScaleMul(tuneDraftByAspect.story.nudgeScale);
          let stripLayoutSeed = tuneDraftByAspect.story.stripLayoutSeed;
          let quiltBgZoom = tuneDraftByAspect.story.quiltBgZoom;
          let quiltBgOffsetY = tuneDraftByAspect.story.quiltBgOffsetY ?? 0;
          let quoteStripOffset =
            odqNormalizeQuoteStripOffset?.(tuneDraftByAspect.story.quoteStripOffset) || { x: 0, y: 0 };
          let previewAspect = 'story';
          /** Cached preview blobs per aspect — Post/Feed built lazily on first tab switch. */
          const previewBlobUrlByAspect = { story: null, post: null, feed: null };
          const previewBlobCacheKeyByAspect = { story: '', post: '', feed: '' };
          const previewStaleByAspect = { story: true, post: true, feed: true };
          let postPreviewEverOpened = false;
          /** Story 9:16 strip plan scaled to post when quote style is inherited from Story. */
          let storyRefStripPlan = null;
          let storyRefStripPlanKey = '';
          /** Final post strip plan (X/Y positions) captured from last post preview render. */
          let capturedPostStripPlan = null;
          let capturedPostStripPlanKey = '';
          /** Post strip plan pre-loaded from Firestore at modal open (used for story before post renders). */
          let preloadedPostStripPlan = null;
          let manualPostStripPlanActive = false;
          let manualPostStripPlan = null;
          let selectedStripIndex = -1;
          let postQuoteStyleIndependent = false;
          const applySpeakerTweakToTuneDraft = (draft, tweak) => {
            if (!draft || !tweak) return;
            draft.preset = tweak.preset || 'AUTO';
            draft.nudgeCx = odqNormalizeSpeakerNudgeComponent(tweak.nudgeCx);
            draft.nudgeCy = odqNormalizeSpeakerNudgeComponent(tweak.nudgeCy);
            draft.nudgeRotateDeg = odqNormalizeSpeakerRotateDeg(tweak.nudgeRotateDeg);
            draft.nudgeScale = odqNormalizeSpeakerScaleMul(tweak.nudgeScale);
          };
          const restoreSavedPostStripPlan = (plan) => {
            if (!Array.isArray(plan) || !plan.length) return false;
            manualPostStripPlan =
              globalThis.odqCloneLayoutBStripPlan?.(plan) || plan.map((s) => ({ ...s }));
            manualPostStripPlanActive = true;
            /** Any saved post strip arrangement (tilts, splits, positions) locks Post independently. */
            postQuoteStyleIndependent = true;
            markPreviewStale(['post', 'feed']);
            return true;
          };
          const resolvePostQuoteStyleIndependent = (igDoc, stripPost, stripStory, kwPost, kwStory) => {
            if (igDoc?.layoutBPostTuneIndependent === true) return true;
            if (igDoc && typeof globalThis.odqLayoutBPostQuoteStyleIndependent === 'function') {
              if (globalThis.odqLayoutBPostQuoteStyleIndependent(igDoc)) return true;
            }
            return (
              odqNormalizeStripLayoutSeed(stripPost) !== odqNormalizeStripLayoutSeed(stripStory) ||
              JSON.stringify(kwPost || null) !== JSON.stringify(kwStory || null)
            );
          };
          const postDraftDiffersFromStoryDraft = () => {
            const p = tuneDraftByAspect.post;
            const s = tuneDraftByAspect.story;
            return (
              manualPostStripPlanActive ||
              p.preset !== s.preset ||
              p.nudgeCx !== s.nudgeCx ||
              p.nudgeCy !== s.nudgeCy ||
              p.nudgeRotateDeg !== s.nudgeRotateDeg ||
              p.nudgeScale !== s.nudgeScale ||
              p.quiltBgZoom !== s.quiltBgZoom ||
              (p.quiltBgOffsetY ?? 0) !== (s.quiltBgOffsetY ?? 0) ||
              JSON.stringify(p.quoteStripOffset || { x: 0, y: 0 }) !==
                JSON.stringify(s.quoteStripOffset || { x: 0, y: 0 })
            );
          };
          const postTuneDiffersFromStory = () =>
            postQuoteStyleIndependent || postDraftDiffersFromStoryDraft();
          if (postDraftDiffersFromStoryDraft()) {
            postQuoteStyleIndependent = true;
          }
          const resetStripPlanBtn = modal.querySelector('button[data-action="reset-strip-plan"]');
          const stripDragModeBtn = dragModeWrap?.querySelector('button[data-drag-mode="strip"]');
          /** True after any placement/keyword/strip edit; blocks async load from resetting the UI. */
          let tuneUiDirty = false;
          const revokeAspectPreviewBlob = (aspect) => {
            const a = normalizePreviewAspect(aspect);
            const url = previewBlobUrlByAspect[a];
            if (url) {
              try { URL.revokeObjectURL(url); } catch (_) { /* */ }
              previewBlobUrlByAspect[a] = null;
            }
          };
          const revokeAllPreviewBlobs = () => {
            revokeAspectPreviewBlob('story');
            revokeAspectPreviewBlob('post');
            revokeAspectPreviewBlob('feed');
          };
          const invalidateStoryStripPlanCache = () => {
            storyRefStripPlan = null;
            storyRefStripPlanKey = '';
            capturedPostStripPlan = null;
            capturedPostStripPlanKey = '';
          };
          const clearManualPostStripPlan = () => {
            manualPostStripPlanActive = false;
            manualPostStripPlan = null;
            selectedStripIndex = -1;
          };
          const stripPlainText = (spec) => {
            if (!spec) return '';
            if (Array.isArray(spec.textRuns) && spec.textRuns.length) {
              return spec.textRuns
                .map((r) => String(r?.text || ''))
                .join('')
                .replace(/\s+/g, ' ')
                .trim();
            }
            if (Array.isArray(spec.lines) && spec.lines.length) {
              return spec.lines
                .map((ln) => (typeof ln === 'string' ? ln : String(ln?.text || '')))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            }
            return String(spec.text || '')
              .replace(/\s+/g, ' ')
              .trim();
          };
          const canSplitLastWordFromStrip = (spec) => {
            if (!spec || spec.role === 'author') return false;
            const words = stripPlainText(spec).split(/\s+/).filter(Boolean);
            return words.length >= 2;
          };
          /** Peel final word into its own strip text; returns null when not splittable. */
          const peelLastWordFromStripText = (spec) => {
            const plain = stripPlainText(spec);
            const m = plain.match(/^(.*\S)\s+(\S+)$/);
            if (!m) return null;
            return { rest: m[1].trim(), lastWord: m[2] };
          };
          const clearStripPairMeta = (spec) => {
            if (!spec) return;
            delete spec.rowGroup;
            delete spec.rowSlot;
            delete spec.textRuns;
            delete spec.emphasisMeasureFlags;
            delete spec.isKeywordEmphasis;
            delete spec.keywordAngle;
            delete spec.isKeywordConnector;
            delete spec.extraPaperPadX;
            delete spec.text;
          };
          const refitManualStripPair = (restSpec, lastSpec) => {
            const refit = globalThis.refitLayoutBStripPlanToText;
            if (typeof refit !== 'function') return [restSpec, lastSpec];
            let ctx = null;
            try {
              const c = document.createElement('canvas');
              ctx = c.getContext('2d');
            } catch (_) {
              ctx = null;
            }
            if (!ctx) return [restSpec, lastSpec];
            const maxW = Math.max(
              120,
              Number(restSpec.w) || 0,
              Number(lastSpec.w) || 0,
              980
            );
            const fontSerif = globalThis.ODQ_CANVAS_SERIF_FONT || undefined;
            return refit([restSpec, lastSpec], ctx, maxW, fontSerif);
          };
          const manualStripPlanFingerprint = () => {
            if (!manualPostStripPlanActive || !manualPostStripPlan?.length) return '';
            return manualPostStripPlan
              .map((s) => {
                const text = stripPlainText(s);
                return `${s.role || 'quote'}:${text}:${Math.round(Number(s.x) || 0)}:${Math.round(Number(s.y) || 0)}:${Math.round((Number(s.angle) || 0) * 1000)}`;
              })
              .join('|');
          };
          const stripPlanAxisRect = (spec, pad = 6) => {
            if (typeof globalThis.odqStripPlanAxisRect === 'function') {
              return globalThis.odqStripPlanAxisRect(spec, pad);
            }
            const angle = Number(spec.angle || 0);
            const cos = Math.abs(Math.cos(angle));
            const sin = Math.abs(Math.sin(angle));
            const hw = Math.max(10, Number(spec.w || 20) / 2);
            const hh = Math.max(8, Number(spec.h || 20) / 2);
            const ex = hw * cos + hh * sin + pad;
            const ey = hw * sin + hh * cos + pad;
            const cx = Number(spec.x || 0);
            const cy = Number(spec.y || 0);
            return { left: cx - ex, right: cx + ex, top: cy - ey, bottom: cy + ey };
          };
          const stripDisplayLabel = (spec, index) => {
            if (spec?.role === 'author') {
              const lines = spec?.lines;
              if (Array.isArray(lines) && lines.length) {
                const t = typeof lines[0] === 'string' ? lines[0] : lines[0]?.text;
                if (t) {
                  const oneLine = String(t).replace(/\s+/g, ' ').trim();
                  return oneLine.length > 28 ? `${oneLine.slice(0, 26)}…` : oneLine;
                }
              }
              return spec?.authorCutoutLabel ? 'Name strip' : 'Author';
            }
            const lines = spec?.lines;
            if (Array.isArray(lines) && lines.length) {
              const t = typeof lines[0] === 'string' ? lines[0] : lines[0]?.text;
              if (t) {
                const oneLine = String(t).replace(/\s+/g, ' ').trim();
                return oneLine.length > 28 ? `${oneLine.slice(0, 26)}…` : oneLine;
              }
            }
            return `Strip ${index + 1}`;
          };
          const activeStripPlanForOverlay = () => {
            if (manualPostStripPlanActive && manualPostStripPlan?.length) return manualPostStripPlan;
            if (capturedPostStripPlan?.length) return capturedPostStripPlan;
            return [];
          };
          const ensureManualStripPlanFromCapture = () => {
            if (manualPostStripPlanActive && manualPostStripPlan?.length) return true;
            if (!capturedPostStripPlan?.length) return false;
            const clone = globalThis.odqCloneLayoutBStripPlan?.(capturedPostStripPlan) || capturedPostStripPlan.map((s) => ({ ...s }));
            manualPostStripPlan = clone;
            manualPostStripPlanActive = true;
            return true;
          };
          /** Fingerprint of draft state used for each aspect preview — tab switch reuses blob when this matches. */
          const aspectPreviewCacheKey = (aspect) => {
            const preview = normalizePreviewAspect(aspect);
            const draftKey = draftAspectFor(preview);
            const speakerDraft = tuneDraftByAspect[draftKey] || tuneDraftByAspect.story;
            const layoutDraft =
              draftKey === 'post' && !postQuoteStyleIndependent
                ? tuneDraftByAspect.story
                : tuneDraftByAspect[draftKey];
            const clippingOff =
              normalizeClippingOffset?.(tuneDraftByAspect.post.carouselClippingOffset) || { x: 0, y: 0 };
            const stripOff =
              preview === 'feed'
                ? clippingOff
                : odqNormalizeQuoteStripOffset?.(
                    (preview === 'post' ? tuneDraftByAspect.post : layoutDraft).quoteStripOffset
                  ) || { x: 0, y: 0 };
            return [
              preview,
              speakerDraft.preset,
              speakerDraft.nudgeCx,
              speakerDraft.nudgeCy,
              speakerDraft.nudgeRotateDeg,
              odqNormalizeSpeakerScaleMul(speakerDraft.nudgeScale),
              preview === 'feed' ? 0 : odqNormalizeStripLayoutSeed(layoutDraft.stripLayoutSeed),
              stripOff.x || 0,
              stripOff.y || 0,
              preview === 'feed' ? '' : JSON.stringify(layoutDraft.keywordEmphasis),
              odqNormalizeQuiltBgZoom(tuneDraftByAspect[draftKey].quiltBgZoom),
              odqNormalizeQuiltBgOffsetY?.(tuneDraftByAspect[draftKey].quiltBgOffsetY) ?? 0,
              preview === 'feed' ? 'clip' : postQuoteStyleIndependent ? 1 : 0,
              preview === 'post' ? manualStripPlanFingerprint() : ''
            ].join('\0');
          };
          const previewCacheHit = (aspect) => {
            const a = normalizePreviewAspect(aspect);
            const url = previewBlobUrlByAspect[a];
            if (!url || previewStaleByAspect[a]) return false;
            return previewBlobCacheKeyByAspect[a] === aspectPreviewCacheKey(a);
          };
          const markPreviewStale = (aspects) => {
            for (const aspect of aspects) {
              const a = normalizePreviewAspect(aspect);
              previewStaleByAspect[a] = true;
              previewBlobCacheKeyByAspect[a] = '';
            }
          };
          /** Story speaker/quote edits invalidate inherited Post + Feed previews. */
          const markTunePreviewStaleForEdit = (opts = {}) => {
            previewStaleByAspect.story = true;
            previewBlobCacheKeyByAspect.story = '';
            if (!postQuoteStyleIndependent) {
              previewStaleByAspect.post = true;
              previewBlobCacheKeyByAspect.post = '';
              previewStaleByAspect.feed = true;
              previewBlobCacheKeyByAspect.feed = '';
              if (opts.invalidateStripPlan !== false) {
                invalidateStoryStripPlanCache();
              }
            } else if (previewAspect === 'post' || previewAspect === 'feed') {
              previewStaleByAspect.post = true;
              previewBlobCacheKeyByAspect.post = '';
              previewStaleByAspect.feed = true;
              previewBlobCacheKeyByAspect.feed = '';
            }
          };
          const showCachedPreview = (aspect) => {
            const a = normalizePreviewAspect(aspect);
            if (!previewCacheHit(a)) return false;
            previewImg.removeAttribute('hidden');
            previewImg.src = previewBlobUrlByAspect[a];
            spinner.hidden = true;
            spinner.style.display = 'none';
            syncPreviewWrapAspect();
            syncStripHitOverlay();
            return true;
          };
          const markTuneUiDirty = () => {
            tuneUiDirty = true;
          };
          /** Render token guards against out-of-order results when the user spam-clicks presets. */
          let renderToken = 0;
          let resetPreviewStripDragState = () => {};
          let kwRenderTimer = 0;
          let nudgeRenderTimer = 0;
          const persistSpeakerDraftToLocal = (aspect = previewAspect) => {
            saveSpeakerDraftFromUi(aspect);
            const a = draftAspectFor(aspect);
            const d = tuneDraftByAspect[a];
            if (typeof odqWriteSpeakerCutoutPreset !== 'function') return;
            odqWriteSpeakerCutoutPreset(todayKey, d.preset || currentPreset, a, {
              cx: d.nudgeCx,
              cy: d.nudgeCy,
              rotateDeg: d.nudgeRotateDeg,
              nudgeScale: d.nudgeScale,
              updatedAt: new Date().toISOString()
            });
          };
          const syncQuiltScreenStoryPreviewFromTune = () => {
            selfRef._layoutBStoryPreviewHeavyDoneThisVisit = false;
            selfRef._layoutBStoryPreviewSkipStoredOnce = true;
            selfRef._layoutBStoryPreviewAllowLiveCompose = true;
            selfRef.scheduleLayoutBStoryPreviewRefresh?.({ force: true, delayMs: 400 });
          };
          const scheduleNudgePreview = () => {
            if (nudgeRenderTimer) clearTimeout(nudgeRenderTimer);
            nudgeRenderTimer = setTimeout(() => {
              nudgeRenderTimer = 0;
              persistSpeakerDraftToLocal();
              captureLayoutDraftFromUi(previewAspect);
              markTunePreviewStaleForEdit({ invalidateStripPlan: false });
              renderPreview(currentPreset);
              syncQuiltScreenStoryPreviewFromTune();
            }, 200);
          };
          const stripPlanCacheKey = () => {
            const parts = [
              tuneDraftByAspect.story.stripLayoutSeed,
              qText,
              qAuthor,
              tuneDraftByAspect.story.preset,
              tuneDraftByAspect.story.nudgeCx,
              tuneDraftByAspect.story.nudgeCy,
              tuneDraftByAspect.story.nudgeRotateDeg,
              odqNormalizeSpeakerScaleMul(tuneDraftByAspect.story.nudgeScale)
            ];
            if (postQuoteStyleIndependent) {
              const p = tuneDraftByAspect.post;
              parts.push(
                'post',
                p.preset,
                p.nudgeCx,
                p.nudgeCy,
                p.nudgeRotateDeg,
                odqNormalizeSpeakerScaleMul(p.nudgeScale),
                manualStripPlanFingerprint()
              );
            }
            return parts.join('\0');
          };
          const resolvePostStripPlanForSave = () => {
            let plan = null;
            if (manualPostStripPlanActive && manualPostStripPlan?.length) {
              plan = manualPostStripPlan;
            } else if (
              capturedPostStripPlan &&
              capturedPostStripPlan.length &&
              capturedPostStripPlanKey === stripPlanCacheKey()
            ) {
              plan = capturedPostStripPlan;
            }
            if (!plan?.length) return null;
            const clone =
              globalThis.odqCloneLayoutBStripPlan?.(plan) || plan.map((s) => ({ ...s }));
            return clone.map((s) => {
              const row = { ...s };
              if (row.angle != null && Number.isFinite(Number(row.angle))) {
                row.angle = Number(row.angle);
              }
              return row;
            });
          };
          const updateStripLayoutLabel = () => {
            const label = modal.querySelector('[data-strip-layout-label]');
            if (label) {
              label.textContent = stripLayoutSeed === 0 ? '#1 (default)' : `#${stripLayoutSeed + 1}`;
            }
          };
          const updateQuiltBgZoomLabel = () => {
            const label = modal.querySelector('[data-quilt-bg-zoom-label]');
            if (label) label.textContent = odqFormatQuiltBgZoomLabel(quiltBgZoom);
            const zoomOutBtn = modal.querySelector('button[data-action="quilt-zoom-out"]');
            if (zoomOutBtn) {
              zoomOutBtn.disabled = quiltBgZoom <= ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN + 0.0005;
              zoomOutBtn.style.opacity = zoomOutBtn.disabled ? '0.45' : '1';
            }
            const zoomResetBtn = modal.querySelector('button[data-action="quilt-zoom-reset"]');
            if (zoomResetBtn) {
              zoomResetBtn.disabled = quiltBgZoom <= ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN + 0.0005;
              zoomResetBtn.style.opacity = zoomResetBtn.disabled ? '0.45' : '1';
            }
            const zoomInBtn = modal.querySelector('button[data-action="quilt-zoom-in"]');
            if (zoomInBtn) {
              zoomInBtn.disabled = quiltBgZoom >= ODQ_LAYOUT_B_QUILT_BG_ZOOM_MAX - 0.0005;
              zoomInBtn.style.opacity = zoomInBtn.disabled ? '0.45' : '1';
            }
          };
          const updateQuiltBgOffsetLabel = () => {
            const label = modal.querySelector('[data-quilt-bg-offset-label]');
            if (label) {
              label.textContent = odqFormatQuiltBgOffsetYLabel
                ? odqFormatQuiltBgOffsetYLabel(quiltBgOffsetY)
                : 'Centered';
            }
            const resetBtn = modal.querySelector('button[data-action="quilt-offset-reset"]');
            if (resetBtn) {
              const y = odqNormalizeQuiltBgOffsetY?.(quiltBgOffsetY) ?? 0;
              resetBtn.disabled = !y;
              resetBtn.style.opacity = resetBtn.disabled ? '0.45' : '1';
            }
          };
          const updateQuoteStripOffsetLabel = () => {
            const feed = isFeedPreview(previewAspect);
            const offset = feed
              ? normalizeClippingOffset?.(quoteStripOffset) || { x: 0, y: 0 }
              : odqNormalizeQuoteStripOffset?.(quoteStripOffset) || { x: 0, y: 0 };
            const label = modal.querySelector('[data-quote-strip-offset-label]');
            if (label) {
              const x = Math.round((offset.x || 0) * 100);
              const y = Math.round((offset.y || 0) * 100);
              label.textContent = x || y ? `${x >= 0 ? '+' : ''}${x}% / ${y >= 0 ? '+' : ''}${y}%` : 'Centered';
            }
            const resetBtn = modal.querySelector('button[data-action="reset-strip-offset"]');
            if (resetBtn) {
              resetBtn.disabled = !offset.x && !offset.y;
              resetBtn.style.opacity = resetBtn.disabled ? '0.45' : '1';
            }
          };
          const keywordsDetailsEl = modal.querySelector('.odq-speaker-tune-keywords-details');
          const stripDetailsEl = modal.querySelector('.odq-speaker-tune-strip-details');
          const stripSectionSummaryEl = modal.querySelector('[data-strip-section-summary]');
          const stripLayoutStatusEl = modal.querySelector('[data-strip-layout-status]');
          const shuffleStripsBtn = modal.querySelector('button[data-action="shuffle-strips"]');
          const stripOffsetMoveLabelEl = modal.querySelector('[data-strip-offset-move-label]');
          const stripOffsetWrapEl = modal.querySelector('.odq-speaker-tune-strip-offset');
          const selectedStripRotateRowEl = modal.querySelector('[data-selected-strip-rotate-row]');
          const selectedStripLabelEl = modal.querySelector('[data-selected-strip-label]');
          const STRIP_ROTATE_STEP_RAD = (3 * Math.PI) / 180;
          let syncPreviewDragUi = () => {};
          const syncSelectedStripRotateUi = () => {
            const postTab = normalizePreviewAspect(previewAspect) === 'post';
            const plan = activeStripPlanForOverlay();
            const stripMode = previewDragMode === 'strip';
            const show = postTab && stripMode && plan.length > 0;
            const hasSelection = selectedStripIndex >= 0 && !!plan[selectedStripIndex];
            const canSplit =
              hasSelection && canSplitLastWordFromStrip(plan[selectedStripIndex]);
            if (selectedStripRotateRowEl) selectedStripRotateRowEl.hidden = !show;
            if (selectedStripLabelEl) {
              selectedStripLabelEl.textContent = hasSelection
                ? stripDisplayLabel(plan[selectedStripIndex], selectedStripIndex)
                : 'Tap a strip on preview';
            }
            for (const btn of modal.querySelectorAll('button[data-strip-rotate]')) {
              btn.disabled = !hasSelection;
              btn.style.opacity = hasSelection ? '1' : '0.45';
              btn.style.cursor = hasSelection ? 'pointer' : 'not-allowed';
            }
            const splitBtn = modal.querySelector('button[data-strip-split]');
            if (splitBtn) {
              splitBtn.disabled = !canSplit;
              splitBtn.style.opacity = canSplit ? '1' : '0.45';
              splitBtn.style.cursor = canSplit ? 'pointer' : 'not-allowed';
              splitBtn.title = canSplit
                ? 'Split last word into a new strip'
                : hasSelection
                  ? 'Need at least two words on this strip'
                  : 'Select a quote strip first';
            }
          };
          const syncFeedSlide1TuneControls = () => {
            const feed = isFeedPreview(previewAspect);
            if (keywordsDetailsEl) keywordsDetailsEl.hidden = feed;
            if (stripLayoutStatusEl) stripLayoutStatusEl.hidden = feed;
            if (shuffleStripsBtn) shuffleStripsBtn.hidden = feed;
            if (stripSectionSummaryEl) {
              stripSectionSummaryEl.textContent = feed ? 'Quote clipping' : 'Text strip layout';
            }
            if (stripOffsetMoveLabelEl) {
              stripOffsetMoveLabelEl.textContent = feed ? 'Move clipping' : 'Move strips';
            }
            if (stripOffsetWrapEl) {
              stripOffsetWrapEl.setAttribute(
                'aria-label',
                feed ? 'Move quote clipping' : 'Move all quote strips'
              );
            }
            if (stripDetailsEl) stripDetailsEl.open = feed ? true : stripDetailsEl.open;
            syncPreviewDragUi();
          };
          updateStripLayoutLabel();
          updateQuiltBgZoomLabel();
          updateQuiltBgOffsetLabel();
          updateQuoteStripOffsetLabel();
          syncFeedSlide1TuneControls();

          const getKeywordEmphasisFromForm = () => {
            const QKE = globalThis.QuoteKeywordEmphasis;
            const LBKE = globalThis.LayoutBKeywordEmphasis;
            const rawInput = String(kwInput.value || '').trim();
            let keywords = [];
            if (QKE?.parseEmphasisWordsInput) {
              keywords = QKE.parseEmphasisWordsInput(rawInput, qText);
            }
            let styles = LBKE?.normalizeStyleList
              ? LBKE.normalizeStyleList(styleChecks.filter((cb) => cb.checked).map((cb) => cb.dataset.style))
              : styleChecks.filter((cb) => cb.checked).map((cb) => cb.dataset.style);
            const out = keywords.length ? { keywords, styles } : null;
            if (!keywords.length) return null;
            return out;
          };

          const keywordValidationHint = () => {
            const rawInput = String(kwInput.value || '').trim();
            if (!rawInput) return '';
            const QKE = globalThis.QuoteKeywordEmphasis;
            if (!QKE?.parseEmphasisWordsInput) return 'Keyword checker is still loading — try again in a moment.';
            const keywords = QKE?.parseEmphasisWordsInput
              ? QKE.parseEmphasisWordsInput(rawInput, qText)
              : [];
            if (keywords.length) return '';
            const bad =
              QKE?.keywordsNotInQuote?.(rawInput.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean), qText) ||
              [];
            if (bad.length) {
              return `Not in quote: ${bad.join(', ')} — use exact words from the quote.`;
            }
            return 'Enter exact words or phrases from the quote.';
          };

          const formatNudgePct = (v) => {
            const n = odqNormalizeSpeakerNudgeComponent(v);
            if (!n) return '0';
            const pct = Math.round(n * 100);
            return pct > 0 ? `+${pct}` : String(pct);
          };

          const updateActiveButton = () => {
            const nudgeLabelEl = modal.querySelector('[data-nudge-label]');
            if (nudgeLabelEl) {
              const parts = [];
              if (nudgeCx || nudgeCy) {
                parts.push(`nudge ${formatNudgePct(nudgeCx)}% / ${formatNudgePct(nudgeCy)}%`);
              }
              if (nudgeRotateDeg) {
                const r = Math.round(nudgeRotateDeg * 10) / 10;
                parts.push(`rotate ${r > 0 ? '+' : ''}${r}°`);
              }
              if (odqNormalizeSpeakerScaleMul(nudgeScale) !== 1) {
                const pct = Math.round((nudgeScale - 1) * 100);
                parts.push(`size ${pct > 0 ? '+' : ''}${pct}%`);
              }
              nudgeLabelEl.textContent = parts.length ? parts.join(' · ') : '';
            }
            for (const btn of nudgeBtns) {
              btn.disabled = false;
              btn.style.opacity = '1';
              btn.style.cursor = 'pointer';
            }
            const resetNudgeBtn = nudgeWrap?.querySelector('button[data-action="reset-nudge"]');
            if (resetNudgeBtn) {
              resetNudgeBtn.disabled =
                !nudgeCx && !nudgeCy && !nudgeRotateDeg && odqNormalizeSpeakerScaleMul(nudgeScale) === 1;
              resetNudgeBtn.style.opacity = resetNudgeBtn.disabled ? '0.45' : '1';
            }
          };

          const syncPreviewWrapAspect = () => {
            const isPost = isPostLikePreview(previewAspect);
            previewWrap.style.width = isPost ? 'min(100%,49.6vh)' : 'min(100%,34.875vh)';
            previewWrap.style.height = 'auto';
            previewWrap.style.maxHeight = '62vh';
            previewWrap.style.minHeight = '';
            previewWrap.style.marginLeft = 'auto';
            previewWrap.style.marginRight = 'auto';
            previewWrap.style.flex = '0 0 auto';
            previewWrap.style.aspectRatio = isPost ? '4 / 5' : '9 / 16';
            previewWrap.style.maxWidth = '';
            previewComposite.style.width = '100%';
            previewComposite.style.maxWidth = '';
            previewSlide1Wrap.style.display = 'block';
            previewSlide1Wrap.style.flex = '1 1 auto';
            previewSlide1Wrap.style.width = '100%';
            previewSlide1Wrap.style.height = '100%';
            previewSlide1Wrap.style.aspectRatio = 'auto';
            previewImg.style.width = '100%';
            previewImg.style.height = '100%';
            previewImg.style.objectFit = 'contain';
            previewImg.style.minWidth = '0';
          };

          const updateAspectButtons = () => {
            for (const btn of aspectBtns) {
              const active = btn.dataset.aspect === previewAspect;
              btn.classList.toggle('is-active', active);
              btn.style.background = active ? '#222' : '#fff';
              btn.style.color = active ? '#fff' : '#000';
              btn.style.borderColor = active ? '#222' : '#aaa';
            }
            syncPreviewWrapAspect();
          };
          applyDraftToUi('story');

          const scheduleKeywordPreview = () => {
            if (isFeedPreview(previewAspect)) return;
            const hint = keywordValidationHint();
            if (kwHintEl) {
              if (hint) {
                kwHintEl.textContent = hint;
                kwHintEl.hidden = false;
              } else {
                kwHintEl.textContent = '';
                kwHintEl.hidden = true;
              }
            }
            if (kwRenderTimer) clearTimeout(kwRenderTimer);
            kwRenderTimer = setTimeout(() => {
              kwRenderTimer = 0;
              syncKeywordEmphasisFromUi();
              const aspect = normalizePreviewAspect(previewAspect);
              if (previewCacheHit(aspect)) return;
              markTunePreviewStaleForEdit({ invalidateStripPlan: false });
              renderPreview(currentPreset);
            }, 400);
          };

          /** Live speaker UI for the active tab; stored drafts for the other aspect. */
          const speakerTuneForAspect = (aspectKey) => {
            const a = odqNormalizeTuneAspect(aspectKey);
            if (a === draftAspectFor(previewAspect)) {
              return {
                preset: currentPreset,
                nudgeCx,
                nudgeCy,
                nudgeRotateDeg: odqNormalizeSpeakerRotateDeg(nudgeRotateDeg),
                nudgeScale: odqNormalizeSpeakerScaleMul(nudgeScale)
              };
            }
            const d = tuneDraftByAspect[a] || tuneDraftByAspect.story;
            return {
              preset: d.preset,
              nudgeCx: d.nudgeCx,
              nudgeCy: d.nudgeCy,
              nudgeRotateDeg: odqNormalizeSpeakerRotateDeg(d.nudgeRotateDeg),
              nudgeScale: odqNormalizeSpeakerScaleMul(d.nudgeScale)
            };
          };
          const fmtStripPlanTiltSummary = (plan) => {
            if (!Array.isArray(plan) || !plan.length) return '';
            const tilts = plan
              .map((s, i) => ({
                i,
                deg: Math.round(((Number(s.angle) || 0) * 180) / Math.PI)
              }))
              .filter((t) => Math.abs(t.deg) >= 1);
            if (!tilts.length) return '';
            const sample = tilts
              .slice(0, 3)
              .map((t) => `#${t.i + 1} ${t.deg > 0 ? '+' : ''}${t.deg}°`)
              .join(' ');
            const extra = tilts.length > 3 ? ` +${tilts.length - 3}` : '';
            return ` strip-tilt ${sample}${extra}`;
          };

          const buildTuneComposeOpts = (presetName, aspect, extra = {}) => {
            const a = odqNormalizeTuneAspect(aspect);
            const quoteStyle = quoteStyleForAspect(a);
            const composeOpts = {
              tuneAspect: a,
              tunePreviewFast: true,
              exportMime: 'image/jpeg',
              exportQuality: 0.82,
              keywordEmphasis: quoteStyle.keywordEmphasis,
              keywordEmphasisExplicit: true,
              stripLayoutSeed: quoteStyle.stripLayoutSeed,
              stripLayoutSeedExplicit: true,
              quoteStripOffset: quoteStyle.quoteStripOffset,
              quoteStripOffsetExplicit: true,
              quiltBgZoom: odqNormalizeQuiltBgZoom(tuneDraftByAspect[a].quiltBgZoom),
              quiltBgZoomExplicit: true,
              quiltBgOffsetY: odqNormalizeQuiltBgOffsetY?.(tuneDraftByAspect[a].quiltBgOffsetY) ?? 0,
              quiltBgOffsetYExplicit: true,
              ...extra
            };
            if (a === 'post') {
              /** Carousel slide 1: story-style speaker seam; strip plan independent when Post is locked. */
              composeOpts.carouselStoryStyle = true;
              if (!postQuoteStyleIndependent) {
                composeOpts.postStripLayoutFromStory = true;
              }
              composeOpts.carouselShortQuote =
                typeof selfRef.archiveService?._isShortCarouselQuote === 'function'
                  ? selfRef.archiveService._isShortCarouselQuote(quote)
                  : qText.length <= 90 || qText.split(/\s+/).filter(Boolean).length <= 14;
              if (postQuoteStyleIndependent) {
                composeOpts.postQuoteStyleIndependent = true;
              } else if (storyRefStripPlan && storyRefStripPlanKey === stripPlanCacheKey()) {
                composeOpts.storyRefStripPlan = storyRefStripPlan;
              }
              composeOpts.onPostStripPlan = (plan) => {
                if (manualPostStripPlanActive && manualPostStripPlan?.length) {
                  /** Keep manual x/y/angle — compose already replays manualPostStripPlan for preview. */
                  previewBlobCacheKeyByAspect.story = '';
                  syncStripHitOverlay();
                  syncSelectedStripRotateUi();
                  return;
                }
                capturedPostStripPlan = plan;
                capturedPostStripPlanKey = stripPlanCacheKey();
                previewBlobCacheKeyByAspect.story = '';
                syncStripHitOverlay();
                syncSelectedStripRotateUi();
              };
              if (manualPostStripPlanActive && manualPostStripPlan?.length) {
                composeOpts.savedPostStripPlan =
                  globalThis.odqCloneLayoutBStripPlan?.(manualPostStripPlan) ||
                  manualPostStripPlan.map((s) => ({ ...s }));
                composeOpts.replaySavedCarouselStripPlan = true;
              }
              if (speakerImageForCanvas) {
                const postSpeaker = speakerTuneForAspect('post');
                composeOpts.speakerCutoutQuote = quote;
                composeOpts.speakerOverlay = {
                  enabled: true,
                  imageUrl: speakerImageForCanvas,
                  cutoutSourceUrl: String(globalThis.odqSpeakerImageUrlFromQuote?.(quote) || '').trim(),
                  name: speakerName,
                  washColor,
                  transform:
                    odqSpeakerCutoutTransformResolved(postSpeaker.preset || presetName, {
                      cx: postSpeaker.nudgeCx,
                      cy: postSpeaker.nudgeCy,
                      rotateDeg: postSpeaker.nudgeRotateDeg,
                      nudgeScale: postSpeaker.nudgeScale
                    }) || undefined
                };
              }
              return composeOpts;
            }
            composeOpts.captureStoryRefStripPlan = true;
            composeOpts.onStoryRefStripPlan = (plan) => {
              storyRefStripPlan = plan;
              storyRefStripPlanKey = stripPlanCacheKey();
            };
            if (speakerImageForCanvas) {
              const storySpeaker = speakerTuneForAspect('story');
              composeOpts.speakerCutoutQuote = quote;
              composeOpts.speakerOverlay = {
                enabled: true,
                imageUrl: speakerImageForCanvas,
                cutoutSourceUrl: String(globalThis.odqSpeakerImageUrlFromQuote?.(quote) || '').trim(),
                name: speakerName,
                washColor,
                transform:
                  odqSpeakerCutoutTransformResolved(storySpeaker.preset || presetName, {
                    cx: storySpeaker.nudgeCx,
                    cy: storySpeaker.nudgeCy,
                    rotateDeg: storySpeaker.nudgeRotateDeg,
                    nudgeScale: storySpeaker.nudgeScale
                  }) || undefined
              };
            }
            return composeOpts;
          };

          const ensureStoryStripPlanCache = async (presetName, token) => {
            if (postQuoteStyleIndependent) return false;
            const pk = stripPlanCacheKey();
            if (storyRefStripPlan && storyRefStripPlanKey === pk) return true;
            const seedOpts = buildTuneComposeOpts(presetName, 'story', {
              stripPlanCaptureOnly: true,
              exportQuality: 0.5
            });
            delete seedOpts.captureStoryRefStripPlan;
            seedOpts.onStoryRefStripPlan = (plan) => {
              if (token !== renderToken) return;
              storyRefStripPlan = plan;
              storyRefStripPlanKey = pk;
            };
            await composeInstagramLayoutBFromQuiltBlob(
              highResBlob,
              qText,
              qAuthor,
              1080,
              1920,
              todayKey,
              seedOpts
            );
            return !!(storyRefStripPlan && storyRefStripPlan.length);
          };

          const schedulePostPreviewPrefetch = (presetName) => {
            if (previewCacheHit('post') || postPreviewPrefetchPromise) return;
            postPreviewPrefetchPromise = renderPreview(presetName, { aspect: 'post', prefetch: true })
              .catch((prefetchErr) => {
                selfRef.logger?.warn?.('Tune modal: post prefetch skipped', prefetchErr);
              })
              .finally(() => {
                postPreviewPrefetchPromise = null;
              });
          };

          let cachedTuneClippingDataUrl = '';
          let cachedTuneClippingMeta = null;
          let cachedTuneClippingKey = '';
          let tuneClippingPrefetchPromise = null;
          const readQuoteScreenClippingDataUrl = () => {
            try {
              const img = document.querySelector('#screen-quote .quote-screen-clipping__image');
              const src = String(img?.currentSrc || img?.src || '').trim();
              if (src.startsWith('data:image/')) return src;
            } catch (_) {
              /* ignore */
            }
            return '';
          };
          const ensureTuneClippingAssets = async () => {
            const cacheKey = `${todayKey}:${String(qText || '').slice(0, 80)}:${qAuthor || ''}`;
            if (cachedTuneClippingDataUrl && cachedTuneClippingKey === cacheKey) {
              return {
                dataUrl: cachedTuneClippingDataUrl,
                meta: cachedTuneClippingMeta
              };
            }
            const fromQuoteScreen = readQuoteScreenClippingDataUrl();
            if (fromQuoteScreen) {
              cachedTuneClippingDataUrl = fromQuoteScreen;
              cachedTuneClippingMeta =
                selfRef.archiveService?._lastNewspaperClippingComposeMeta || null;
              cachedTuneClippingKey = cacheKey;
              return { dataUrl: cachedTuneClippingDataUrl, meta: cachedTuneClippingMeta };
            }
            if (typeof selfRef.archiveService?.generateNewspaperClippingImageData !== 'function') {
              throw new Error('Newspaper clipping compose unavailable');
            }
            const dataUrl = await selfRef.archiveService.generateNewspaperClippingImageData(
              todayKey,
              { tunePreview: true }
            );
            if (!dataUrl) throw new Error('Could not build quote clipping');
            cachedTuneClippingDataUrl = dataUrl;
            cachedTuneClippingMeta =
              selfRef.archiveService._lastNewspaperClippingComposeMeta || null;
            cachedTuneClippingKey = cacheKey;
            return { dataUrl: cachedTuneClippingDataUrl, meta: cachedTuneClippingMeta };
          };
          const prefetchTuneClippingAssets = () => {
            if (tuneClippingPrefetchPromise || cachedTuneClippingDataUrl) return;
            tuneClippingPrefetchPromise = ensureTuneClippingAssets()
              .catch((err) => {
                selfRef.logger?.warn?.('Tune modal: clipping prefetch skipped', err);
              })
              .finally(() => {
                tuneClippingPrefetchPromise = null;
              });
          };

          const dataUrlToBlob = (dataUrl) =>
            new Promise((resolve, reject) => {
              const src = String(dataUrl || '');
              const comma = src.indexOf(',');
              if (!src.startsWith('data:') || comma < 0) {
                reject(new Error('Invalid preview data URL'));
                return;
              }
              try {
                const mime = src.slice(5, src.indexOf(';')) || 'image/png';
                const bin = atob(src.slice(comma + 1));
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                resolve(new Blob([bytes], { type: mime }));
              } catch (err) {
                reject(err);
              }
            });
          const blobToDataUrl = (blob) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(new Error('Failed to read preview blob'));
              reader.readAsDataURL(blob);
            });

          const composeFeedSlide1ClippingPreview = async (presetName, previewQuiltBlob) => {
            const composeOpts = buildTuneComposeOpts(presetName, 'post');
            composeOpts.omitQuoteStrips = true;
            composeOpts.savedPostStripPlan = null;
            composeOpts.storyRefStripPlan = null;
            composeOpts.postStripLayoutFromStory = false;
            composeOpts.carouselStoryStyle = true;
            delete composeOpts.onPostStripPlan;
            const overlay = selfRef.archiveService?._overlayQuoteClippingOnCarouselSlide1;
            if (typeof overlay !== 'function') {
              throw new Error('Carousel slide 1 clipping overlay unavailable');
            }
            const [baseBlob, clipping] = await Promise.all([
              composeInstagramLayoutBFromQuiltBlob(
                previewQuiltBlob,
                qText,
                qAuthor,
                1080,
                1350,
                todayKey,
                composeOpts
              ),
              ensureTuneClippingAssets()
            ]);
            if (!baseBlob) return null;
            const baseDataUrl = await blobToDataUrl(baseBlob);
            const offset =
              normalizeClippingOffset?.(tuneDraftByAspect.post.carouselClippingOffset) || {
                x: 0,
                y: 0
              };
            const outDataUrl = await overlay.call(
              selfRef.archiveService,
              baseDataUrl,
              clipping.dataUrl,
              clipping.meta,
              { offset }
            );
            if (!outDataUrl) return null;
            return await dataUrlToBlob(outDataUrl);
          };

          const renderPreview = async (presetName, opts = {}) => {
            if (!tuneAssetsReady || !highResBlob) {
              return;
            }
            const aspect = normalizePreviewAspect(opts.aspect ?? previewAspect);
            const draftAspect = draftAspectFor(aspect);
            const isPrefetch = opts.prefetch === true;
            const updatesVisibleTab = aspect === normalizePreviewAspect(previewAspect);
            const previewQuiltBlob = isPostLikePreview(aspect)
              ? postHighResBlob || highResBlob
              : highResBlob;
            if (previewCacheHit(aspect)) {
              if (updatesVisibleTab) showCachedPreview(aspect);
              return;
            }
            if (!isPrefetch) {
              captureDraftFromUi(previewAspect);
            }
            if (!isPrefetch) {
              renderToken += 1;
            }
            const myToken = isPrefetch ? 0 : renderToken;
            if (updatesVisibleTab) {
              resetPreviewStripDragState();
              spinner.hidden = false;
              spinner.style.display = 'flex';
              spinner.textContent =
                aspect === 'feed'
                  ? 'Rendering feed slide 1…'
                  : aspect === 'post'
                    ? 'Rendering Post preview…'
                    : 'Rendering preview…';
            }
            try {
              const layoutW = 1080;
              const layoutH = isPostLikePreview(aspect) ? 1350 : 1920;
              let outBlob = null;
              if (aspect === 'feed') {
                outBlob = await odqPromiseWithTimeout(
                  composeFeedSlide1ClippingPreview(presetName, previewQuiltBlob),
                  45000,
                  'Feed slide 1 preview'
                );
              } else {
                if (aspect === 'post' && !postQuoteStyleIndependent) {
                  await ensureStoryStripPlanCache(presetName, myToken || renderToken);
                  if (!isPrefetch && myToken !== renderToken) return;
                }
                const composeOpts = buildTuneComposeOpts(presetName, draftAspect);
                outBlob = await odqPromiseWithTimeout(
                  composeInstagramLayoutBFromQuiltBlob(
                    previewQuiltBlob,
                    qText,
                    qAuthor,
                    layoutW,
                    layoutH,
                    todayKey,
                    composeOpts
                  ),
                  25000,
                  'Layout B preview'
                );
              }
              if (!isPrefetch && myToken !== renderToken) {
                return;
              }
              if (!outBlob) {
                if (updatesVisibleTab) {
                  this.uiService.showToast('Render failed');
                  setTuneDebug(`render fail ${layoutW}×${layoutH}`);
                  spinner.textContent = 'Render failed — try Close and reopen tune';
                }
                return;
              }
              const finalBlob = outBlob;
              const newUrl = URL.createObjectURL(finalBlob);
              revokeAspectPreviewBlob(aspect);
              previewBlobUrlByAspect[aspect] = newUrl;
              previewBlobCacheKeyByAspect[aspect] = aspectPreviewCacheKey(aspect);
              previewStaleByAspect[aspect] = false;
              if (!isPrefetch && (myToken !== renderToken || !updatesVisibleTab)) {
                return;
              }
              if (updatesVisibleTab) {
                previewImg.removeAttribute('hidden');
                previewImg.src = newUrl;
                syncPreviewWrapAspect();
              }
              const clipOff =
                normalizeClippingOffset?.(tuneDraftByAspect.post.carouselClippingOffset) || {
                  x: 0,
                  y: 0
                };
              setTuneDebug(
                `ok ${layoutW}×${layoutH} ${aspect}${aspect === 'feed' ? ` feed-clip ${clipOff.x}/${clipOff.y}` : aspect === 'post' ? ' carousel-story' : ''}${isPrefetch ? ' prefetch' : ''} seed story:${tuneDraftByAspect.story.stripLayoutSeed} post:${tuneDraftByAspect.post.stripLayoutSeed} ${isPostLikePreview(aspect) ? postTuneQuiltSource || tuneQuiltSource : tuneQuiltSource} tok ${myToken}/${renderToken}`
              );
            } catch (renderErr) {
              if (updatesVisibleTab) {
                const errMsg = String(renderErr?.message || renderErr).slice(0, 120);
                setTuneDebug(`err ${errMsg.slice(0, 60)}`);
                spinner.textContent = `${errMsg} — tap Close`;
                this.errorHandler.handleError(renderErr, 'adminTuneSpeakerCutout:render');
              } else {
                throw renderErr;
              }
            } finally {
              if (!updatesVisibleTab) return;
              if (myToken !== renderToken) return;
              resetPreviewStripDragState();
              if (previewImg.src && previewImg.src.startsWith('blob:')) {
                spinner.hidden = true;
                spinner.style.display = 'none';
              }
              syncStripHitOverlay();
              syncPreviewDragUi();
            }
          };

          const applySpeakerNudge = (dir, stepMul = 1) => {
            markTuneUiDirty();
            maybeLockPostTuneIndependent();
            const baseStep = globalThis.ODQ_SPEAKER_NUDGE_STEP || 0.02;
            const step = baseStep * stepMul;
            if (dir === 'left') nudgeCx -= step;
            else if (dir === 'right') nudgeCx += step;
            else if (dir === 'up') nudgeCy -= step;
            else if (dir === 'down') nudgeCy += step;
            nudgeCx = odqNormalizeSpeakerNudgeComponent(nudgeCx);
            nudgeCy = odqNormalizeSpeakerNudgeComponent(nudgeCy);
            updateActiveButton();
            scheduleNudgePreview();
          };

          let previewDragMode = 'speaker';
          let previewDragModeAtStart = 'speaker';
          let previewDragActive = false;
          let previewDragPointerId = null;
          let previewDragStartClient = { x: 0, y: 0 };
          let previewDragStartSpeaker = { cx: 0, cy: 0 };
          let previewDragStartStrip = { x: 0, y: 0 };
          let previewDragPanelOverflow = '';
          let previewDragStripIndex = -1;
          let previewDragStripStartXY = { x: 0, y: 0 };
          resetPreviewStripDragState = () => {
            if (previewDragActive && stripHitLayer && previewDragPointerId != null) {
              try {
                stripHitLayer.releasePointerCapture(previewDragPointerId);
              } catch (_) {
                /* ignore */
              }
            }
            previewDragActive = false;
            previewDragPointerId = null;
            previewDragStripIndex = -1;
            if (panel && previewDragPanelOverflow !== '') {
              panel.style.overflow = previewDragPanelOverflow;
              previewDragPanelOverflow = '';
            }
          };
          const dragModeBtns = dragModeWrap
            ? [...dragModeWrap.querySelectorAll('button[data-drag-mode]')]
            : [];
          const dragHintEl = dragModeWrap?.querySelector('[data-drag-hint]');

          const getPreviewImageLayoutRect = () => {
            if (!previewSlide1Wrap || !previewImg) return null;
            const wrapR = previewSlide1Wrap.getBoundingClientRect();
            const nw = previewImg.naturalWidth || 1080;
            const nh =
              previewImg.naturalHeight || (isPostLikePreview(previewAspect) ? 1350 : 1920);
            if (!nw || !nh || wrapR.width < 1 || wrapR.height < 1) return null;
            const scale = Math.min(wrapR.width / nw, wrapR.height / nh);
            const dispW = nw * scale;
            const dispH = nh * scale;
            return { wrapR, dispW, dispH, scale };
          };

          /** Strip plan x/y/w/h are always in full compose pixels — not tunePreviewFast JPEG size. */
          const tunePreviewLogicalLayoutSize = (aspect = previewAspect) => ({
            w: 1080,
            h: isPostLikePreview(aspect) ? 1350 : 1920
          });

          const scheduleSpeakerDragPreview = () => {
            if (nudgeRenderTimer) clearTimeout(nudgeRenderTimer);
            nudgeRenderTimer = setTimeout(() => {
              nudgeRenderTimer = 0;
              persistSpeakerDraftToLocal();
              markTunePreviewStaleForEdit({ invalidateStripPlan: false });
              renderPreview(currentPreset);
              syncQuiltScreenStoryPreviewFromTune();
            }, 200);
          };

          const scheduleStripPlanPreview = () => {
            if (nudgeRenderTimer) clearTimeout(nudgeRenderTimer);
            nudgeRenderTimer = setTimeout(() => {
              nudgeRenderTimer = 0;
              captureLayoutDraftFromUi(previewAspect);
              markTunePreviewStaleForEdit({ invalidateStripPlan: false });
              renderPreview(currentPreset);
              syncQuiltScreenStoryPreviewFromTune();
            }, 200);
          };

          const previewDragFractionDelta = (clientX, clientY) => {
            const m = getPreviewImageLayoutRect();
            if (!m || m.dispW < 1 || m.dispH < 1) return null;
            return {
              dxFrac: (clientX - previewDragStartClient.x) / m.dispW,
              dyFrac: (clientY - previewDragStartClient.y) / m.dispH
            };
          };

          const updateSpeakerDragLiveLabel = (clientX, clientY) => {
            const delta = previewDragFractionDelta(clientX, clientY);
            if (!delta) return;
            const nudgeLabelEl = modal.querySelector('[data-nudge-label]');
            if (!nudgeLabelEl) return;
            const cx = odqNormalizeSpeakerNudgeComponent(previewDragStartSpeaker.cx + delta.dxFrac);
            const cy = odqNormalizeSpeakerNudgeComponent(previewDragStartSpeaker.cy + delta.dyFrac);
            const parts = [`nudge ${formatNudgePct(cx)}% / ${formatNudgePct(cy)}%`];
            if (nudgeRotateDeg) {
              const r = Math.round(nudgeRotateDeg * 10) / 10;
              parts.push(`rotate ${r > 0 ? '+' : ''}${r}°`);
            }
            if (odqNormalizeSpeakerScaleMul(nudgeScale) !== 1) {
              const pct = Math.round((nudgeScale - 1) * 100);
              parts.push(`size ${pct > 0 ? '+' : ''}${pct}%`);
            }
            nudgeLabelEl.textContent = parts.join(' · ');
          };

          const formatQuoteStripOffsetLabelText = (offset) => {
            const x = Math.round((offset.x || 0) * 100);
            const y = Math.round((offset.y || 0) * 100);
            return x || y ? `${x >= 0 ? '+' : ''}${x}% / ${y >= 0 ? '+' : ''}${y}%` : 'Centered';
          };

          const updateTextDragLiveLabel = (clientX, clientY) => {
            const delta = previewDragFractionDelta(clientX, clientY);
            if (!delta) return;
            const feed = isFeedPreview(previewAspect);
            const norm = feed ? normalizeClippingOffset : odqNormalizeQuoteStripOffset;
            const offset = norm({
              x: previewDragStartStrip.x + delta.dxFrac,
              y: previewDragStartStrip.y + delta.dyFrac
            });
            const label = modal.querySelector('[data-quote-strip-offset-label]');
            if (label) label.textContent = formatQuoteStripOffsetLabelText(offset);
          };

          syncStripHitOverlay = () => {
            if (!stripHitLayer) return;
            const postTab = normalizePreviewAspect(previewAspect) === 'post';
            const plan = activeStripPlanForOverlay();
            const show =
              postTab && previewDragMode === 'strip' && !!previewImg.src;
            if (!show || !plan.length) {
              stripHitLayer.hidden = true;
              stripHitLayer.innerHTML = '';
              stripHitLayer.style.pointerEvents = 'none';
              return;
            }
            const m = getPreviewImageLayoutRect();
            if (!m || m.dispW < 1 || m.dispH < 1) return;
            const { w: layoutW, h: layoutH } = tunePreviewLogicalLayoutSize();
            const insetX = (m.wrapR.width - m.dispW) / 2;
            const insetY = (m.wrapR.height - m.dispH) / 2;
            stripHitLayer.hidden = false;
            stripHitLayer.style.pointerEvents = 'auto';
            stripHitLayer.innerHTML = '';
            plan.forEach((spec, index) => {
              const axis = stripPlanAxisRect(spec, spec?.authorCutoutLabel ? 4 : 6);
              const left = insetX + (axis.left / layoutW) * m.dispW;
              const top = insetY + (axis.top / layoutH) * m.dispH;
              const width = ((axis.right - axis.left) / layoutW) * m.dispW;
              const height = ((axis.bottom - axis.top) / layoutH) * m.dispH;
              const hit = document.createElement('button');
              hit.type = 'button';
              hit.dataset.stripIndex = String(index);
              hit.title = stripDisplayLabel(spec, index);
              const selected = selectedStripIndex === index;
              hit.style.cssText = [
                'position:absolute',
                `left:${left}px`,
                `top:${top}px`,
                `width:${Math.max(10, width)}px`,
                `height:${Math.max(10, height)}px`,
                `border:2px solid ${selected ? '#4a90e2' : 'rgba(255,255,255,0.55)'}`,
                `background:${selected ? 'rgba(74,144,226,0.2)' : 'rgba(255,255,255,0.08)'}`,
                'border-radius:3px',
                'padding:0',
                'margin:0',
                'cursor:grab',
                'touch-action:none'
              ].join(';');
              stripHitLayer.appendChild(hit);
            });
          };

          const updateStripDragLiveHint = (index) => {
            if (!dragHintEl || index < 0) return;
            const plan = manualPostStripPlan || capturedPostStripPlan;
            const spec = plan?.[index];
            if (!spec) return;
            dragHintEl.textContent = `Moving: ${stripDisplayLabel(spec, index)} — release to apply`;
          };

          syncPreviewDragUi = () => {
            const enabled = previewDragMode !== 'off' && previewDragMode !== 'strip';
            const feed = isFeedPreview(previewAspect);
            const postTab = normalizePreviewAspect(previewAspect) === 'post';
            if (stripDragModeBtn) stripDragModeBtn.hidden = !postTab;
            if (resetStripPlanBtn) {
              resetStripPlanBtn.hidden =
                !postTab || (!manualPostStripPlanActive && !capturedPostStripPlan?.length);
            }
            if (!postTab && previewDragMode === 'strip') previewDragMode = 'speaker';
            if (dragHintEl) {
              if (previewDragMode === 'strip' && postTab) {
                dragHintEl.textContent = manualPostStripPlanActive
                  ? 'Tap a quote or name strip, drag to move, or use Rotate in Text strip layout'
                  : 'Switch to Post and wait for preview, then drag individual strips';
              } else if (!enabled && previewDragMode !== 'strip') dragHintEl.textContent = '';
              else if (previewDragMode === 'speaker') {
                dragHintEl.textContent = 'Drag to nudge speaker — quilt and text stay put until release';
              } else if (enabled) {
                dragHintEl.textContent = feed
                  ? 'Drag to move clipping — quilt stays put until release'
                  : 'Drag to move text — quilt and speaker stay put until release';
              }
            }
            const textBtn = dragModeWrap?.querySelector('button[data-drag-mode="text"]');
            if (textBtn) textBtn.textContent = feed ? 'Clipping' : 'Text';
            if (previewSlide1Wrap) {
              previewSlide1Wrap.style.cursor =
                enabled && previewDragMode !== 'strip'
                  ? previewDragActive
                    ? 'grabbing'
                    : 'grab'
                  : '';
              previewSlide1Wrap.style.touchAction =
                enabled && previewDragMode !== 'strip' ? 'none' : '';
              previewSlide1Wrap.setAttribute(
                'aria-label',
                previewDragMode === 'strip'
                  ? 'Drag individual quote and name strips'
                  : enabled
                    ? previewDragMode === 'speaker'
                      ? 'Drag to move speaker'
                      : feed
                        ? 'Drag to move quote clipping'
                        : 'Drag to move text strips'
                    : 'Layout B preview'
              );
            }
            for (const btn of dragModeBtns) {
              const active = btn.dataset.dragMode === previewDragMode;
              btn.classList.toggle('is-active', active);
              btn.style.fontWeight = active ? '600' : 'normal';
              btn.style.background = active ? '#e8f0fe' : '#fff';
            }
            if (postTab && previewDragMode === 'strip' && stripDetailsEl) {
              stripDetailsEl.open = true;
            }
            syncStripHitOverlay();
            syncSelectedStripRotateUi();
          };

          const commitPreviewDrag = (clientX, clientY) => {
            const delta = previewDragFractionDelta(clientX, clientY);
            if (!delta) return;
            const { dxFrac, dyFrac } = delta;
            const mode = previewDragModeAtStart;
            if (mode === 'strip') {
              if (Math.abs(dxFrac) < 0.001 && Math.abs(dyFrac) < 0.001) return;
              markTuneUiDirty();
              scheduleStripPlanPreview();
              return;
            }
            if (Math.abs(dxFrac) < 0.001 && Math.abs(dyFrac) < 0.001) return;
            markTuneUiDirty();
            if (mode === 'speaker') {
              maybeLockPostTuneIndependent();
              nudgeCx = odqNormalizeSpeakerNudgeComponent(previewDragStartSpeaker.cx + dxFrac);
              nudgeCy = odqNormalizeSpeakerNudgeComponent(previewDragStartSpeaker.cy + dyFrac);
              updateActiveButton();
              scheduleSpeakerDragPreview();
              return;
            }
            if (mode === 'text') {
              const feed = isFeedPreview(previewAspect);
              const norm = feed ? normalizeClippingOffset : odqNormalizeQuoteStripOffset;
              quoteStripOffset = norm({
                x: previewDragStartStrip.x + dxFrac,
                y: previewDragStartStrip.y + dyFrac
              });
              captureLayoutDraftFromUi(previewAspect);
              if (feed) markPreviewStale(['feed']);
              else markTunePreviewStaleForEdit({ invalidateStripPlan: false });
              updateQuoteStripOffsetLabel();
              scheduleNudgePreview();
              return;
            }
            if (mode === 'strip') {
              scheduleStripPlanPreview();
            }
          };

          const endStripDrag = (e) => {
            if (!previewDragActive || previewDragModeAtStart !== 'strip') return;
            const pointerId = previewDragPointerId;
            previewDragActive = false;
            previewDragPointerId = null;
            previewDragStripIndex = -1;
            if (panel) {
              panel.style.overflow = previewDragPanelOverflow;
              previewDragPanelOverflow = '';
            }
            if (stripHitLayer && pointerId != null) {
              try {
                stripHitLayer.releasePointerCapture(pointerId);
              } catch (_) {
                /* ignore */
              }
            }
            syncPreviewDragUi();
            if (e && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
              commitPreviewDrag(e.clientX, e.clientY);
            }
          };

          const endPreviewDrag = (e) => {
            if (previewDragModeAtStart === 'strip') {
              endStripDrag(e);
              return;
            }
            if (!previewDragActive) return;
            const pointerId = previewDragPointerId;
            previewDragActive = false;
            previewDragPointerId = null;
            if (previewImg) previewImg.style.transform = '';
            if (panel) {
              panel.style.overflow = previewDragPanelOverflow;
              previewDragPanelOverflow = '';
            }
            if (previewSlide1Wrap && pointerId != null) {
              try {
                previewSlide1Wrap.releasePointerCapture(pointerId);
              } catch (_) {
                /* ignore */
              }
            }
            syncPreviewDragUi();
            if (e && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
              commitPreviewDrag(e.clientX, e.clientY);
            } else if (previewDragModeAtStart === 'speaker') {
              updateActiveButton();
            } else if (previewDragModeAtStart === 'text') {
              updateQuoteStripOffsetLabel();
            }
          };

          const onPreviewDragPointerDown = (e) => {
            if (previewDragMode === 'off' || previewDragMode === 'strip') return;
            if (e.button !== 0) return;
            if (!previewImg.src || !spinner.hidden) return;
            e.preventDefault();
            maybeLockPostTuneIndependent();
            previewDragActive = true;
            previewDragModeAtStart = previewDragMode;
            previewDragPointerId = e.pointerId;
            previewDragStartClient = { x: e.clientX, y: e.clientY };
            previewDragStartSpeaker = { cx: nudgeCx, cy: nudgeCy };
            previewDragStartStrip = {
              x: quoteStripOffset.x || 0,
              y: quoteStripOffset.y || 0
            };
            if (previewDragModeAtStart === 'text' && stripDetailsEl) stripDetailsEl.open = true;
            if (panel) {
              previewDragPanelOverflow = panel.style.overflow || '';
              panel.style.overflow = 'hidden';
            }
            try {
              previewSlide1Wrap.setPointerCapture(e.pointerId);
            } catch (_) {
              /* ignore */
            }
            syncPreviewDragUi();
          };

          const onPreviewDragPointerMove = (e) => {
            if (!previewDragActive || e.pointerId !== previewDragPointerId) return;
            e.preventDefault();
            if (previewDragModeAtStart === 'speaker') {
              updateSpeakerDragLiveLabel(e.clientX, e.clientY);
              return;
            }
            if (previewDragModeAtStart === 'text') {
              updateTextDragLiveLabel(e.clientX, e.clientY);
            }
          };

          if (previewSlide1Wrap) {
            previewSlide1Wrap.addEventListener('pointerdown', onPreviewDragPointerDown, { passive: false });
            previewSlide1Wrap.addEventListener('pointermove', onPreviewDragPointerMove, { passive: false });
            previewSlide1Wrap.addEventListener('pointerup', endPreviewDrag);
            previewSlide1Wrap.addEventListener('pointercancel', endPreviewDrag);
          }

          if (stripHitLayer) {
            stripHitLayer.addEventListener('pointerdown', (e) => {
              const hit = e.target.closest('button[data-strip-index]');
              if (!hit || previewDragMode !== 'strip') return;
              if (!previewImg.src) return;
              if (!ensureManualStripPlanFromCapture()) return;
              e.preventDefault();
              e.stopPropagation();
              const idx = Number(hit.dataset.stripIndex);
              if (!Number.isFinite(idx) || !manualPostStripPlan?.[idx]) return;
              markTuneUiDirty();
              lockPostTuneIndependent();
              selectedStripIndex = idx;
              previewDragActive = true;
              previewDragModeAtStart = 'strip';
              previewDragStripIndex = idx;
              previewDragPointerId = e.pointerId;
              previewDragStartClient = { x: e.clientX, y: e.clientY };
              previewDragStripStartXY = {
                x: Number(manualPostStripPlan[idx].x) || 0,
                y: Number(manualPostStripPlan[idx].y) || 0
              };
              if (stripDetailsEl) stripDetailsEl.open = true;
              if (panel) {
                previewDragPanelOverflow = panel.style.overflow || '';
                panel.style.overflow = 'hidden';
              }
              try {
                stripHitLayer.setPointerCapture(e.pointerId);
              } catch (_) {
                /* ignore */
              }
              syncPreviewDragUi();
              updateStripDragLiveHint(idx);
            }, { passive: false });
            stripHitLayer.addEventListener('pointermove', (e) => {
              if (!previewDragActive || previewDragModeAtStart !== 'strip') return;
              if (e.pointerId !== previewDragPointerId || previewDragStripIndex < 0) return;
              e.preventDefault();
              const delta = previewDragFractionDelta(e.clientX, e.clientY);
              if (!delta || !manualPostStripPlan?.[previewDragStripIndex]) return;
              const { w: layoutW, h: layoutH } = tunePreviewLogicalLayoutSize();
              manualPostStripPlan[previewDragStripIndex].x =
                previewDragStripStartXY.x + delta.dxFrac * layoutW;
              manualPostStripPlan[previewDragStripIndex].y =
                previewDragStripStartXY.y + delta.dyFrac * layoutH;
              syncStripHitOverlay();
              updateStripDragLiveHint(previewDragStripIndex);
            }, { passive: false });
            stripHitLayer.addEventListener('pointerup', endStripDrag);
            stripHitLayer.addEventListener('pointercancel', endStripDrag);
          }

          if (dragModeWrap) {
            dragModeWrap.addEventListener('click', (e) => {
              const btn = e.target.closest('button[data-drag-mode]');
              if (!btn) return;
              previewDragMode = btn.dataset.dragMode || 'off';
              syncPreviewDragUi();
            });
          }

          syncPreviewDragUi();

          if (nudgeWrap) {
            nudgeWrap.addEventListener('click', (e) => {
              const nudgeBtn = e.target.closest('button[data-nudge]');
              if (nudgeBtn) {
                applySpeakerNudge(nudgeBtn.dataset.nudge, 1);
                return;
              }
              const bigNudgeBtn = e.target.closest('button[data-big-nudge]');
              if (bigNudgeBtn) {
                const mul = globalThis.ODQ_SPEAKER_BIG_NUDGE_MUL || 5;
                applySpeakerNudge(bigNudgeBtn.dataset.bigNudge, mul);
                return;
              }
              const scaleBtn = e.target.closest('button[data-speaker-scale]');
              if (scaleBtn) {
                markTuneUiDirty();
                maybeLockPostTuneIndependent();
                const step = globalThis.ODQ_SPEAKER_SCALE_STEP || 0.12;
                if (scaleBtn.dataset.speakerScale === 'enlarge') {
                  nudgeScale = odqNormalizeSpeakerScaleMul(nudgeScale + step);
                } else if (scaleBtn.dataset.speakerScale === 'shrink') {
                  nudgeScale = odqNormalizeSpeakerScaleMul(nudgeScale - step);
                }
                updateActiveButton();
                scheduleNudgePreview();
                return;
              }
              const rotateBtn = e.target.closest('button[data-rotate]');
              if (rotateBtn) {
                markTuneUiDirty();
                maybeLockPostTuneIndependent();
                const step = Number(globalThis.ODQ_SPEAKER_ROTATE_STEP_DEG) || 3;
                if (rotateBtn.dataset.rotate === 'cw') nudgeRotateDeg += step;
                else if (rotateBtn.dataset.rotate === 'ccw') nudgeRotateDeg -= step;
                nudgeRotateDeg = odqNormalizeSpeakerRotateDeg(nudgeRotateDeg);
                saveSpeakerDraftFromUi(previewAspect);
                if (draftAspectFor(previewAspect) === 'post') {
                  postQuoteStyleIndependent = true;
                }
                updateActiveButton();
                scheduleNudgePreview();
                return;
              }
              const resetNudge = e.target.closest('button[data-action="reset-nudge"]');
              if (resetNudge) {
                markTuneUiDirty();
                nudgeCx = 0;
                nudgeCy = 0;
                nudgeRotateDeg = 0;
                nudgeScale = 1;
                saveSpeakerDraftFromUi(previewAspect);
                updateActiveButton();
                scheduleNudgePreview();
              }
            });
          }

          const switchPreviewAspect = async (nextAspect) => {
            const next = normalizePreviewAspect(nextAspect);
            if (next === previewAspect) return;
            if (!tuneAssetsReady) {
              this.uiService.showToast('Still loading saved tune…', 2000);
              return;
            }
            if (kwRenderTimer) {
              clearTimeout(kwRenderTimer);
              kwRenderTimer = 0;
            }
            if (nudgeRenderTimer) {
              clearTimeout(nudgeRenderTimer);
              nudgeRenderTimer = 0;
            }
            renderToken += 1;
            saveSpeakerDraftFromUi(previewAspect, { linkDrafts: false });
            captureLayoutDraftFromUi(previewAspect);
            if (next === 'post' && !postQuoteStyleIndependent && !postDraftDiffersFromStoryDraft()) {
              copyStoryQuoteStyleToPost();
            }
            if (next === 'post' || next === 'feed') {
              postPreviewEverOpened = true;
            }
            previewAspect = next;
            applyDraftToUi(previewAspect);
            updateAspectButtons();
            if (showCachedPreview(previewAspect)) {
              return;
            }
            if (next === 'post' && postPreviewPrefetchPromise) {
              spinner.hidden = false;
              spinner.style.display = 'flex';
              spinner.textContent = 'Loading Post preview…';
              try {
                await postPreviewPrefetchPromise;
              } catch (_) {
                /* renderPreview will retry */
              }
              if (showCachedPreview(previewAspect)) {
                spinner.hidden = true;
                spinner.style.display = 'none';
                return;
              }
            }
            renderPreview(currentPreset);
          };
          for (const btn of aspectBtns) {
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              switchPreviewAspect(btn.dataset.aspect);
            });
          }

          if (stripLayoutSection) {
            stripLayoutSection.addEventListener('click', (e) => {
              const btn = e.target.closest(
                'button[data-action], button[data-strip-offset], button[data-strip-big-offset], button[data-strip-rotate], button[data-strip-split]'
              );
              if (!btn) return;
              const feed = isFeedPreview(previewAspect);
              const stripOffsetDir = btn.dataset.stripOffset || btn.dataset.stripBigOffset || '';
              if (stripOffsetDir) {
                markTuneUiDirty();
                const step = btn.dataset.stripBigOffset ? 0.05 : 0.01;
                const offset = feed
                  ? normalizeClippingOffset?.(quoteStripOffset) || { x: 0, y: 0 }
                  : odqNormalizeQuoteStripOffset?.(quoteStripOffset) || { x: 0, y: 0 };
                if (stripOffsetDir === 'left') offset.x -= step;
                else if (stripOffsetDir === 'right') offset.x += step;
                else if (stripOffsetDir === 'up') offset.y -= step;
                else if (stripOffsetDir === 'down') offset.y += step;
                quoteStripOffset = feed
                  ? normalizeClippingOffset?.(offset) || { x: 0, y: 0 }
                  : odqNormalizeQuoteStripOffset?.(offset) || { x: 0, y: 0 };
                captureLayoutDraftFromUi(previewAspect);
                if (feed) {
                  markPreviewStale(['feed']);
                } else {
                  markTunePreviewStaleForEdit({ invalidateStripPlan: false });
                }
                updateQuoteStripOffsetLabel();
                scheduleNudgePreview();
                return;
              }
              if (btn.dataset.action === 'reset-strip-offset') {
                markTuneUiDirty();
                quoteStripOffset = { x: 0, y: 0 };
                captureLayoutDraftFromUi(previewAspect);
                if (feed) {
                  markPreviewStale(['feed']);
                } else {
                  markTunePreviewStaleForEdit({ invalidateStripPlan: false });
                }
                updateQuoteStripOffsetLabel();
                scheduleNudgePreview();
                return;
              }
              if (
                feed ||
                (btn.dataset.action !== 'shuffle-strips' &&
                  !btn.dataset.stripRotate &&
                  btn.dataset.stripSplit == null)
              ) {
                if (btn.dataset.action === 'reset-strip-plan') {
                  markTuneUiDirty();
                  clearManualPostStripPlan();
                  markTunePreviewStaleForEdit({ invalidateStripPlan: false });
                  syncPreviewDragUi();
                  renderPreview(currentPreset);
                }
                return;
              }
              if (btn.dataset.stripRotate) {
                if (!ensureManualStripPlanFromCapture()) return;
                if (selectedStripIndex < 0 || !manualPostStripPlan?.[selectedStripIndex]) return;
                markTuneUiDirty();
                const spec = manualPostStripPlan[selectedStripIndex];
                const cur = Number(spec.angle) || 0;
                spec.angle =
                  btn.dataset.stripRotate === 'cw'
                    ? cur + STRIP_ROTATE_STEP_RAD
                    : cur - STRIP_ROTATE_STEP_RAD;
                lockPostTuneIndependent();
                syncSelectedStripRotateUi();
                syncStripHitOverlay();
                scheduleStripPlanPreview();
                return;
              }
              if (btn.dataset.stripSplit != null) {
                if (!ensureManualStripPlanFromCapture()) return;
                const idx = selectedStripIndex;
                const spec = manualPostStripPlan?.[idx];
                if (!spec || !canSplitLastWordFromStrip(spec)) return;
                const peeled = peelLastWordFromStripText(spec);
                if (!peeled) return;
                markTuneUiDirty();
                const angle = Number(spec.angle) || 0;
                const font = String(spec.font || '');
                const lh = Number(spec.lh) || 0;
                clearStripPairMeta(spec);
                spec.role = 'quote';
                spec.lines = [peeled.rest];
                let lastSpec = {
                  role: 'quote',
                  lines: [peeled.lastWord],
                  x: Number(spec.x) || 0,
                  y: Number(spec.y) || 0,
                  angle,
                  font,
                  lh,
                  w: Number(spec.w) || 120,
                  h: Number(spec.h) || 40
                };
                const fitted = refitManualStripPair(spec, lastSpec);
                Object.assign(spec, fitted[0]);
                lastSpec = fitted[1];
                const gap = 14;
                const restHalfH = Math.max(8, Number(spec.h) || 20) / 2;
                const lastHalfH = Math.max(8, Number(lastSpec.h) || 20) / 2;
                lastSpec.x = Number(spec.x) || 0;
                lastSpec.y = (Number(spec.y) || 0) + restHalfH + gap + lastHalfH;
                manualPostStripPlan.splice(idx + 1, 0, lastSpec);
                selectedStripIndex = idx + 1;
                lockPostTuneIndependent();
                syncPreviewDragUi();
                syncSelectedStripRotateUi();
                syncStripHitOverlay();
                scheduleStripPlanPreview();
                return;
              }
              markTuneUiDirty();
              clearManualPostStripPlan();
              stripLayoutSeed = odqNormalizeStripLayoutSeed(stripLayoutSeed + 1);
              if (stripLayoutSeed <= 0) stripLayoutSeed = 1;
              markTunePreviewStaleForEdit();
              if (previewAspect === 'post' && !postQuoteStyleIndependent) {
                tuneDraftByAspect.story.stripLayoutSeed = stripLayoutSeed;
                copyStoryQuoteStyleToPost();
              } else {
                if (previewAspect === 'post') lockPostTuneIndependent();
                syncQuoteStyleDraftsFromUi();
              }
              updateStripLayoutLabel();
              renderPreview(currentPreset);
            });
          }

          if (quiltZoomSection) {
            quiltZoomSection.addEventListener('click', (e) => {
              const quiltOffsetBtn = e.target.closest(
                'button[data-quilt-offset], button[data-quilt-big-offset], button[data-action="quilt-offset-reset"]'
              );
              if (quiltOffsetBtn) {
                markTuneUiDirty();
                maybeLockPostTuneIndependent();
                if (quiltOffsetBtn.dataset.action === 'quilt-offset-reset') {
                  quiltBgOffsetY = 0;
                } else {
                  const step = quiltOffsetBtn.dataset.quiltBigOffset
                    ? ODQ_LAYOUT_B_QUILT_BG_OFFSET_Y_BIG_STEP
                    : ODQ_LAYOUT_B_QUILT_BG_OFFSET_Y_STEP;
                  const dir = quiltOffsetBtn.dataset.quiltOffset || quiltOffsetBtn.dataset.quiltBigOffset;
                  const y = odqNormalizeQuiltBgOffsetY?.(quiltBgOffsetY) ?? 0;
                  if (dir === 'up') quiltBgOffsetY = odqNormalizeQuiltBgOffsetY(y - step);
                  else if (dir === 'down') quiltBgOffsetY = odqNormalizeQuiltBgOffsetY(y + step);
                }
                markPreviewStale(
                  isPostLikePreview(previewAspect) ? ['post', 'feed'] : [previewAspect]
                );
                captureDraftFromUi(previewAspect);
                updateQuiltBgOffsetLabel();
                scheduleNudgePreview();
                return;
              }
              const btn = e.target.closest('button[data-action]');
              if (!btn) return;
              const action = btn.dataset.action;
              if (action === 'quilt-zoom-in') {
                markTuneUiDirty();
                maybeLockPostTuneIndependent();
                quiltBgZoom = odqNormalizeQuiltBgZoom(quiltBgZoom + ODQ_LAYOUT_B_QUILT_BG_ZOOM_STEP);
              } else if (action === 'quilt-zoom-out') {
                markTuneUiDirty();
                maybeLockPostTuneIndependent();
                quiltBgZoom = odqNormalizeQuiltBgZoom(quiltBgZoom - ODQ_LAYOUT_B_QUILT_BG_ZOOM_STEP);
              } else if (action === 'quilt-zoom-reset') {
                markTuneUiDirty();
                maybeLockPostTuneIndependent();
                quiltBgZoom = ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
              } else {
                return;
              }
              markPreviewStale(
                isPostLikePreview(previewAspect) ? ['post', 'feed'] : [previewAspect]
              );
              captureDraftFromUi(previewAspect);
              updateQuiltBgZoomLabel();
              scheduleNudgePreview();
            });
          }

          kwInput.addEventListener('input', () => {
            markTuneUiDirty();
            maybeLockPostTuneIndependent();
            scheduleKeywordPreview();
          });
          kwInput.addEventListener('change', () => {
            markTuneUiDirty();
            maybeLockPostTuneIndependent();
            scheduleKeywordPreview();
          });
          kwInput.addEventListener('blur', () => {
            try {
              previewWrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
            } catch (_) {
              /* ignore */
            }
          });
          kwStylesWrap.addEventListener('change', (e) => {
            const cb = e.target.closest('input[data-style]');
            if (!cb) return;
            markTuneUiDirty();
            maybeLockPostTuneIndependent();
            if (cb.dataset.style === 'angle-up' && cb.checked) {
              const down = styleChecks.find((x) => x.dataset.style === 'angle-down');
              if (down) down.checked = false;
            } else if (cb.dataset.style === 'angle-down' && cb.checked) {
              const up = styleChecks.find((x) => x.dataset.style === 'angle-up');
              if (up) up.checked = false;
            }
            scheduleKeywordPreview();
          });

          const close = () => {
            if (enableBackdropCloseTimer) {
              clearTimeout(enableBackdropCloseTimer);
              enableBackdropCloseTimer = 0;
            }
            if (kwRenderTimer) {
              clearTimeout(kwRenderTimer);
              kwRenderTimer = 0;
            }
            if (nudgeRenderTimer) {
              clearTimeout(nudgeRenderTimer);
              nudgeRenderTimer = 0;
            }
            revokeAllPreviewBlobs();
            this._speakerTuneModalOpen = false;
            this._speakerTuneModalOpening = false;
            this._speakerTuneModalOpeningAt = 0;
            modal.remove();
          };

          actionsWrap.addEventListener('click', (e) => {
            const action = e.target.closest('button[data-action]')?.dataset?.action;
            if (action === 'close') {
              close();
            } else if (action === 'reset') {
              markTuneUiDirty();
              const preview = normalizePreviewAspect(previewAspect);
              const a = draftAspectFor(preview);
              tuneDraftByAspect[a].preset = 'AUTO';
              tuneDraftByAspect[a].nudgeCx = 0;
              tuneDraftByAspect[a].nudgeCy = 0;
              tuneDraftByAspect[a].nudgeRotateDeg = 0;
              tuneDraftByAspect[a].nudgeScale = 1;
              tuneDraftByAspect[a].quiltBgZoom = ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
              tuneDraftByAspect[a].quiltBgOffsetY = 0;
              if (preview === 'feed') {
                tuneDraftByAspect.post.carouselClippingOffset = { x: 0, y: 0 };
              } else {
                tuneDraftByAspect[a].stripLayoutSeed = 0;
                tuneDraftByAspect[a].quoteStripOffset = { x: 0, y: 0 };
                tuneDraftByAspect[a].keywordEmphasis = null;
              }
              if (a === 'story' && !postQuoteStyleIndependent) {
                copyStoryQuoteStyleToPost();
                mirrorStorySpeakerToPostDraft();
              }
              markPreviewStale(['story', 'post', 'feed']);
              invalidateStoryStripPlanCache();
              currentPreset = 'AUTO';
              nudgeCx = 0;
              nudgeCy = 0;
              nudgeRotateDeg = 0;
              nudgeScale = 1;
              if (preview !== 'feed') {
                stripLayoutSeed = 0;
                kwInput.value = '';
                for (const cb of styleChecks) cb.checked = false;
                applyTuneKeywordForm(null);
              }
              quiltBgZoom = ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
              quiltBgOffsetY = 0;
              quoteStripOffset = { x: 0, y: 0 };
              updateActiveButton();
              updateStripLayoutLabel();
              updateQuiltBgZoomLabel();
              updateQuiltBgOffsetLabel();
              updateQuoteStripOffsetLabel();
              syncFeedSlide1TuneControls();
              renderPreview('AUTO');
            } else if (action === 'save') {
              void (async () => {
                const saveBtn = actionsWrap.querySelector('button[data-action="save"]');
                const saveDateKey =
                  (this.quoteService && typeof this.quoteService.getQuoteCalendarKeyNow === 'function'
                    ? this.quoteService.getQuoteCalendarKeyNow()
                    : Utils.getTodayKey());
                if (saveBtn) saveBtn.disabled = true;
                setTuneDebug('save…');
                try {
                  if (nudgeRenderTimer) {
                    clearTimeout(nudgeRenderTimer);
                    nudgeRenderTimer = 0;
                  }
                  /** Snapshot Post speaker before flush — Save must not re-link Story over a tuned Post. */
                  const postSpeakerBeforeSave = {
                    preset: tuneDraftByAspect.post.preset,
                    nudgeCx: tuneDraftByAspect.post.nudgeCx,
                    nudgeCy: tuneDraftByAspect.post.nudgeCy,
                    nudgeRotateDeg: odqNormalizeSpeakerRotateDeg(tuneDraftByAspect.post.nudgeRotateDeg),
                    nudgeScale: odqNormalizeSpeakerScaleMul(tuneDraftByAspect.post.nudgeScale)
                  };
                  saveSpeakerDraftFromUi(previewAspect, { linkDrafts: false });
                  captureLayoutDraftFromUi(previewAspect);
                  if (
                    typeof globalThis.odqPostSpeakerTuneDiffersFromStory === 'function' &&
                    globalThis.odqPostSpeakerTuneDiffersFromStory(tuneDraftByAspect)
                  ) {
                    postQuoteStyleIndependent = true;
                  } else if (
                    postSpeakerBeforeSave.nudgeRotateDeg ||
                    postSpeakerBeforeSave.nudgeCx ||
                    postSpeakerBeforeSave.nudgeCy ||
                    postSpeakerBeforeSave.preset !== tuneDraftByAspect.story.preset ||
                    odqNormalizeSpeakerScaleMul(postSpeakerBeforeSave.nudgeScale) !==
                      odqNormalizeSpeakerScaleMul(tuneDraftByAspect.story.nudgeScale)
                  ) {
                    postQuoteStyleIndependent = true;
                    Object.assign(tuneDraftByAspect.post, postSpeakerBeforeSave);
                  }
                  if (postDraftDiffersFromStoryDraft()) {
                    postQuoteStyleIndependent = true;
                  }
                  const savePreview = normalizePreviewAspect(previewAspect);
                  if (savePreview === 'post' || savePreview === 'feed') {
                    lockPostTuneIndependent();
                  }
                  if (!isFeedPreview(previewAspect)) {
                    syncKeywordEmphasisFromUi();
                  }
                  if (!postQuoteStyleIndependent) {
                    copyStoryQuoteStyleToPost();
                  }
                  /** Always persist both aspects — drafts stay isolated in memory when Post is locked. */
                  const saveAspects = ['story', 'post'];
                  const rawKw = String(kwInput.value || '').trim();
                  const formKw = getKeywordEmphasisFromForm();
                  if (
                    !isFeedPreview(previewAspect) &&
                    rawKw &&
                    !formKw?.keywords?.length
                  ) {
                    const hint = keywordValidationHint();
                    this.uiService.showToast(hint || 'Fix keywords for this preview (Story or Post)');
                    setTuneDebug('save blocked: keywords');
                    if (saveBtn) saveBtn.disabled = false;
                    return;
                  }
                  const tuneSavedAt = new Date().toISOString();
                  for (const aspect of saveAspects) {
                    const d = tuneDraftByAspect[aspect];
                    odqWriteSpeakerCutoutPreset(saveDateKey, d.preset, aspect, {
                      cx: d.nudgeCx,
                      cy: d.nudgeCy,
                      rotateDeg: d.nudgeRotateDeg,
                      nudgeScale: d.nudgeScale,
                      updatedAt: tuneSavedAt
                    });
                    odqSetCachedLayoutBKeywordEmphasis(saveDateKey, d.keywordEmphasis, aspect);
                    odqSetCachedLayoutBStripLayoutSeed(saveDateKey, d.stripLayoutSeed, aspect);
                    odqSetCachedLayoutBQuiltBgZoom(saveDateKey, d.quiltBgZoom, aspect);
                    odqSetCachedLayoutBQuiltBgOffsetY?.(saveDateKey, d.quiltBgOffsetY, aspect);
                    odqSetCachedLayoutBQuoteStripOffset?.(saveDateKey, d.quoteStripOffset, aspect);
                  }
                  if (saveAspects.includes('post') && typeof odqSetCachedLayoutBCarouselClippingOffset === 'function') {
                    odqSetCachedLayoutBCarouselClippingOffset(
                      saveDateKey,
                      tuneDraftByAspect.post.carouselClippingOffset
                    );
                  }
                  const postStripPlanLocal = resolvePostStripPlanForSave();
                  if (
                    postStripPlanLocal?.length &&
                    typeof globalThis.odqSetCachedLayoutBPostStripPlan === 'function'
                  ) {
                    globalThis.odqSetCachedLayoutBPostStripPlan(
                      saveDateKey,
                      postStripPlanLocal,
                      tuneSavedAt
                    );
                  }
                  if (typeof globalThis.odqSetLayoutBTuneLocalUpdatedAt === 'function') {
                    globalThis.odqSetLayoutBTuneLocalUpdatedAt(saveDateKey, tuneSavedAt);
                  }
                  let cloudOk = false;
                  let serverVerify = null;
                  const firebaseReady = globalThis.LiveDailyDataSync?.waitForFirebaseReady
                    ? await globalThis.LiveDailyDataSync.waitForFirebaseReady(20000)
                    : !!(window.db && window.firestore);

                  const writeTuneToClientFirestore = async () => {
                    if (typeof this.ensureFirebaseAuthForFirestore === 'function') {
                      await odqPromiseWithTimeout(
                        this.ensureFirebaseAuthForFirestore({ timeoutMs: 20000 }),
                        25000,
                        'Firebase auth for tune save fallback'
                      );
                    } else if (typeof this.initializeFirebaseForImages === 'function') {
                      await odqPromiseWithTimeout(
                        this.initializeFirebaseForImages(),
                        30000,
                        'Firebase sign-in for tune save fallback'
                      );
                    }
                    await Promise.all(
                      saveAspects.map(async (aspect) => {
                        const d = tuneDraftByAspect[aspect];
                        await odqPromiseWithTimeout(
                          odqWriteLayoutBKeywordEmphasis(saveDateKey, d.keywordEmphasis, aspect, {
                            updatedAt: tuneSavedAt
                          }),
                          12000,
                          `Keyword save (${aspect})`
                        );
                        await odqPromiseWithTimeout(
                          odqWriteLayoutBStripLayoutSeed(saveDateKey, d.stripLayoutSeed, aspect, {
                            updatedAt: tuneSavedAt
                          }),
                          12000,
                          `Layout save (${aspect})`
                        );
                        await odqPromiseWithTimeout(
                          odqWriteLayoutBSpeakerCutoutPresetFirestore(saveDateKey, d.preset, aspect, {
                            cx: d.nudgeCx,
                            cy: d.nudgeCy,
                            rotateDeg: d.nudgeRotateDeg,
                            nudgeScale: d.nudgeScale
                          }),
                          12000,
                          `Speaker save (${aspect})`
                        );
                        await odqPromiseWithTimeout(
                          odqWriteLayoutBQuiltBgZoom(saveDateKey, d.quiltBgZoom, aspect, {
                            updatedAt: tuneSavedAt
                          }),
                          12000,
                          `Quilt zoom save (${aspect})`
                        );
                        await odqPromiseWithTimeout(
                          odqWriteLayoutBQuiltBgOffsetY(saveDateKey, d.quiltBgOffsetY, aspect, {
                            updatedAt: tuneSavedAt
                          }),
                          12000,
                          `Quilt position save (${aspect})`
                        );
                        await odqPromiseWithTimeout(
                          odqWriteLayoutBQuoteStripOffset(saveDateKey, d.quoteStripOffset, aspect, {
                            updatedAt: tuneSavedAt
                          }),
                          12000,
                          `Strip position save (${aspect})`
                        );
                      })
                    );
                    if (saveAspects.includes('post') && typeof odqWriteLayoutBCarouselClippingOffset === 'function') {
                      await odqPromiseWithTimeout(
                        odqWriteLayoutBCarouselClippingOffset(
                          saveDateKey,
                          tuneDraftByAspect.post.carouselClippingOffset,
                          { updatedAt: tuneSavedAt }
                        ),
                        12000,
                        'Feed clipping position save'
                      );
                    }
                    // Save post strip plan if captured from preview (ensures nightly render matches preview)
                    const stripPlanToSave = resolvePostStripPlanForSave();
                    if (stripPlanToSave?.length && typeof globalThis.odqWriteLayoutBPostStripPlan === 'function') {
                      await odqPromiseWithTimeout(
                        globalThis.odqWriteLayoutBPostStripPlan(saveDateKey, stripPlanToSave, {
                          updatedAt: tuneSavedAt
                        }),
                        12000,
                        'Post strip plan save'
                      ).catch(() => {});
                    }
                  };

                  let serverApiOk = false;
                  let serverApiMeta = null;
                  let serverSaveErr = null;
                  const postStripPlanForSave = resolvePostStripPlanForSave();
                  const effectivePostTuneIndependent =
                    postQuoteStyleIndependent ||
                    manualPostStripPlanActive ||
                    (typeof globalThis.odqPostSpeakerTuneDiffersFromStory === 'function' &&
                      globalThis.odqPostSpeakerTuneDiffersFromStory(tuneDraftByAspect));

                  try {
                    if (typeof globalThis.odqWriteLayoutBTuneViaServer === 'function') {
                      serverApiMeta = await odqPromiseWithTimeout(
                        globalThis.odqWriteLayoutBTuneViaServer(
                          saveDateKey,
                          tuneDraftByAspect,
                          tuneSavedAt,
                          {
                            postStripPlan: postStripPlanForSave,
                            aspects: saveAspects,
                            postTuneIndependent: effectivePostTuneIndependent
                          }
                        ),
                        22000,
                        'Layout B tune server save'
                      );
                      serverApiOk = serverApiMeta?.success !== false;
                    } else {
                      throw new Error('Server tune save unavailable');
                    }
                  } catch (serverErr) {
                    serverSaveErr = serverErr;
                    this.logger.warn('Tune save: server path failed, trying client Firestore', serverErr);
                    if (firebaseReady && window.db && window.firestore) {
                      try {
                        await writeTuneToClientFirestore();
                        serverApiOk = true;
                        serverApiMeta = { success: true, layoutBTuneUpdatedAt: tuneSavedAt, source: 'client-firestore' };
                      } catch (clientErr) {
                        serverVerify = {
                          ok: false,
                          reason: `${String(serverErr?.message || serverErr)}; client: ${String(clientErr?.message || clientErr)}`
                        };
                        this.logger.warn(
                          'Tune save: client Firestore fallback failed, kept local cache',
                          clientErr
                        );
                      }
                    } else {
                      serverVerify = { ok: false, reason: String(serverErr?.message || serverErr) };
                    }
                  }

                  if (serverApiOk) {
                    /**
                     * Railway push-layout-b-tune already wrote Firestore via Admin SDK.
                     * Do not block the Save UX on a device Firestore read/verify — iOS WebView
                     * auth/reads often time out and falsely show “phone only” after a real save.
                     */
                    cloudOk = true;
                    serverVerify = {
                      ok: true,
                      layoutBTuneUpdatedAt: serverApiMeta?.layoutBTuneUpdatedAt || tuneSavedAt,
                      fields: postStripPlanForSave
                        ? ['layoutB*Story/Post', 'layoutBPostStripPlan']
                        : ['layoutB*Story/Post'],
                      source: serverApiMeta?.source || 'server-api'
                    };
                    void (async () => {
                      try {
                        if (typeof globalThis.odqVerifyLayoutBTuneOnServer !== 'function') return;
                        let verifyResult = await odqPromiseWithTimeout(
                          globalThis.odqVerifyLayoutBTuneOnServer(saveDateKey, tuneDraftByAspect),
                          10000,
                          'Verify tune on server'
                        );
                        if (verifyResult?.ok) return;
                        this.logger.warn('Tune save: background verify mismatch', verifyResult);
                        if (!firebaseReady || !window.db || !window.firestore) return;
                        await writeTuneToClientFirestore();
                        verifyResult = await odqPromiseWithTimeout(
                          globalThis.odqVerifyLayoutBTuneOnServer(saveDateKey, tuneDraftByAspect),
                          10000,
                          'Verify tune after client fallback'
                        );
                        if (!verifyResult?.ok) {
                          this.logger.warn('Tune save: background verify still mismatched', verifyResult);
                        }
                      } catch (verifyErr) {
                        this.logger?.warn?.('Tune save: background verify skipped', verifyErr);
                      }
                    })();
                  } else if (!serverVerify && !firebaseReady) {
                    serverVerify = {
                      ok: false,
                      reason: serverSaveErr
                        ? String(serverSaveErr?.message || serverSaveErr)
                        : 'Firestore not ready — reload and try again'
                    };
                  }
                  setTuneDebug(
                    cloudOk
                      ? `save ok server ${saveDateKey}`
                      : `save local ${serverVerify?.reason || 'no-server'}`
                  );
                  const fmtKw = (d) =>
                    d.keywordEmphasis?.keywords?.length
                      ? d.keywordEmphasis.keywords.join(', ')
                      : 'none';
                  const fmtStrip = (n) => (n === 0 ? '#1' : `#${n + 1}`);
                  const fmtNudge = (d) => {
                    const bits = [];
                    if (d.nudgeCx || d.nudgeCy) {
                      const x = Math.round((d.nudgeCx || 0) * 100);
                      const y = Math.round((d.nudgeCy || 0) * 100);
                      bits.push(`nudge ${x >= 0 ? '+' : ''}${x}/${y >= 0 ? '+' : ''}${y}%`);
                    }
                    if (d.nudgeRotateDeg) {
                      const r = Math.round(d.nudgeRotateDeg * 10) / 10;
                      bits.push(`rot ${r > 0 ? '+' : ''}${r}°`);
                    }
                    if (odqNormalizeSpeakerScaleMul(d.nudgeScale) !== 1) {
                      const pct = Math.round((d.nudgeScale - 1) * 100);
                      bits.push(`size ${pct > 0 ? '+' : ''}${pct}%`);
                    }
                    return bits.length ? ` ${bits.join(' ')}` : '';
                  };
                  const fmtQuiltZoom = (d) => {
                    const label = odqFormatQuiltBgZoomLabel(d.quiltBgZoom);
                    return label === 'Default' ? '' : ` quilt ${label}`;
                  };
                  const fmtQuiltOffset = (d) => {
                    const label = odqFormatQuiltBgOffsetYLabel
                      ? odqFormatQuiltBgOffsetYLabel(d.quiltBgOffsetY)
                      : 'Centered';
                    return label === 'Centered' ? '' : ` quilt ${label}`;
                  };
                  const fmtStripOffset = (d) => {
                    const off = odqNormalizeQuoteStripOffset?.(d.quoteStripOffset) || { x: 0, y: 0 };
                    const x = Math.round((off.x || 0) * 100);
                    const y = Math.round((off.y || 0) * 100);
                    return x || y ? ` strips ${x >= 0 ? '+' : ''}${x}/${y >= 0 ? '+' : ''}${y}%` : '';
                  };
                  const fmtClippingOffset = (d) => {
                    const off = normalizeClippingOffset?.(d.carouselClippingOffset) || { x: 0, y: 0 };
                    const x = Math.round((off.x || 0) * 100);
                    const y = Math.round((off.y || 0) * 100);
                    return x || y ? ` clipping ${x >= 0 ? '+' : ''}${x}/${y >= 0 ? '+' : ''}${y}%` : '';
                  };
                  const saveSummary = `Story: ${tuneDraftByAspect.story.preset}${fmtNudge(tuneDraftByAspect.story)}${fmtQuiltZoom(tuneDraftByAspect.story)}${fmtQuiltOffset(tuneDraftByAspect.story)}${fmtStripOffset(tuneDraftByAspect.story)}, ${fmtKw(tuneDraftByAspect.story)}, ${fmtStrip(tuneDraftByAspect.story.stripLayoutSeed)} · Post: ${tuneDraftByAspect.post.preset}${fmtNudge(tuneDraftByAspect.post)}${fmtQuiltZoom(tuneDraftByAspect.post)}${fmtQuiltOffset(tuneDraftByAspect.post)}${fmtStripOffset(tuneDraftByAspect.post)}${fmtStripPlanTiltSummary(postStripPlanForSave)}, ${fmtKw(tuneDraftByAspect.post)}, ${fmtStrip(tuneDraftByAspect.post.stripLayoutSeed)} · Feed slide 1:${fmtClippingOffset(tuneDraftByAspect.post)}`;
                  if (cloudOk) {
                    const serverTuneAt = String(serverVerify?.layoutBTuneUpdatedAt || tuneSavedAt || '').trim();
                    if (serverTuneAt) {
                      for (const aspect of ['story', 'post']) {
                        const d = tuneDraftByAspect[aspect];
                        odqWriteSpeakerCutoutPreset(saveDateKey, d.preset, aspect, {
                          cx: d.nudgeCx,
                          cy: d.nudgeCy,
                          rotateDeg: d.nudgeRotateDeg,
                          nudgeScale: d.nudgeScale,
                          updatedAt: serverTuneAt
                        });
                      }
                    }
                    const fieldHint = (serverVerify?.fields || []).slice(0, 4).join(', ') || 'layoutB*Story/Post fields';
                    this.uiService.showToast(
                      `On Firestore: instagram-images/${saveDateKey} — ${fieldHint}. ${saveSummary}`,
                      16000
                    );
                  } else if (serverVerify?.reason === 'doc-missing') {
                    this.uiService.showToast(
                      `Saved on this device, but instagram-images/${saveDateKey} is missing on Firestore (Zapier/nightly won't see it until that doc exists). ${saveSummary}`,
                      16000
                    );
                  } else {
                    const syncReason = String(serverVerify?.reason || 'not verified');
                    this.uiService.showToast(
                      `Saved on this phone only — server/Firestore: ${syncReason}. Stay on Wi‑Fi and tap Save again. ${saveSummary}`,
                      16000
                    );
                    if (saveBtn) saveBtn.disabled = false;
                    return;
                  }
                  void this.markAdminDailyTaskCompleted?.('igPost', { source: 'layout_b_tune_save' });
                  close();
                  try {
                    this._invalidateLayoutBStoryPreviewAfterTuneSave?.();
                    this._layoutBStoryPreviewHeavyDoneThisVisit = false;
                    this._layoutBStoryPreviewSkipStoredOnce = true;
                    this._layoutBStoryPreviewAllowLiveCompose = true;
                    this.scheduleLayoutBStoryPreviewRefresh?.({ force: true, delayMs: 0 });
                    this.quoteService?.forceRefreshQuoteScreenLayoutBFromTuneSave?.();
                    if (cloudOk && typeof this.refreshStoredStorySnapshotAfterServerColorSubmission === 'function') {
                      void this.refreshStoredStorySnapshotAfterServerColorSubmission({
                        dateKey: saveDateKey,
                        afterTuneSave: true
                      });
                    }
                  } catch (invalidateErr) {
                    this.logger?.warn?.('Layout B preview invalidate after save failed:', invalidateErr);
                  }
                } catch (saveErr) {
                  setTuneDebug(`save err ${String(saveErr?.message || saveErr).slice(0, 48)}`);
                  this.errorHandler.handleError(saveErr, 'adminTuneSpeakerCutout:save');
                  if (saveBtn) saveBtn.disabled = false;
                }
              })();
            }
          });

          modal.addEventListener('click', (e) => {
            if (e.target === modal && allowBackdropClose) close();
          });
          panel.addEventListener('click', (e) => e.stopPropagation());

          document.querySelectorAll('.admin-menu').forEach((el) => el.remove());
          this._hideSpeakerTunePrepOverlay();
          document.body.appendChild(modal);
          this._speakerTuneModalOpen = true;
          this._speakerTuneModalOpening = false;
          this._speakerTuneModalOpeningAt = 0;
          enableBackdropCloseTimer = setTimeout(() => {
            allowBackdropClose = true;
            enableBackdropCloseTimer = 0;
          }, 500);
          updateActiveButton();
          updateAspectButtons();

          const loadTuneAssets = async () => {
            try {
              spinner.hidden = false;
              spinner.style.display = 'flex';
              spinner.textContent = 'Loading quilt and speaker…';
              try {
                const resolvedQuote = await odqPromiseWithTimeout(
                  this._getQuoteForTuneModal(todayKey),
                  2500,
                  'Tune quote refresh'
                );
                if (resolvedQuote?.text || resolvedQuote?.body) {
                  quote = resolvedQuote;
                  qText = String(quote.text ?? quote.body ?? '').trim();
                  qAuthor = String(quote.author ?? '').trim();
                  speakerName = String(quote.speakerName ?? quote.speaker_name ?? qAuthor)
                    .replace(/^\s*[—-]\s*/, '')
                    .trim();
                }
              } catch (quoteErr) {
                this.logger.warn('Tune modal: quote refresh skipped', quoteErr);
              }
              const loadSpeakerImageForTune = async () => {
                let imageUrl = '';
                try {
                  imageUrl = await odqPromiseWithTimeout(
                    odqResolveSpeakerImageForTune(quote, this.archiveService),
                    7000,
                    'Speaker image'
                  );
                } catch (speakerErr) {
                  this.logger.warn('Tune modal: speaker resolve failed', speakerErr);
                }
                if (!imageUrl) return '';
                if (!/^data:/i.test(imageUrl) && this.archiveService?._prepareSpeakerImageUrlForCanvas) {
                  try {
                    const prepared = await odqPromiseWithTimeout(
                      this.archiveService._prepareSpeakerImageUrlForCanvas(imageUrl, {
                        quote,
                        skipCutoutExportFinalize: true
                      }),
                      10000,
                      'Speaker canvas prep'
                    );
                    if (prepared) imageUrl = prepared;
                  } catch (prepErr) {
                    this.logger.warn('Tune modal: speaker canvas prep skipped', prepErr);
                  }
                }
                return imageUrl;
              };
              const [
                quiltBlob,
                speakerForCanvas,
                kwStory,
                stripStory,
                zoomStory,
                quiltOffsetStory,
                offsetStory,
                kwPost,
                stripPost,
                zoomPost,
                quiltOffsetPost,
                offsetPost,
                clippingOffset,
                storySpeaker,
                postSpeaker,
                savedPostStripPlan,
                igDocRead
              ] = await Promise.all([
                this.getQuiltBlobForTunePreview({ tunePreviewFast: true }).then((r) =>
                  r && typeof r === 'object' ? r : { blob: r, quiltSource: 'legacy' }
                ),
                loadSpeakerImageForTune(),
                odqPromiseWithTimeout(odqReadLayoutBKeywordEmphasis(todayKey, 'story'), 5000, 'Story keywords').catch(
                  () => null
                ),
                odqPromiseWithTimeout(odqReadLayoutBStripLayoutSeed(todayKey, 'story'), 5000, 'Story layout').catch(
                  () => odqGetCachedLayoutBStripLayoutSeed(todayKey, 'story') ?? 0
                ),
                odqPromiseWithTimeout(odqReadLayoutBQuiltBgZoom(todayKey, 'story'), 5000, 'Story quilt zoom').catch(
                  () => odqGetCachedLayoutBQuiltBgZoom(todayKey, 'story') ?? ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN
                ),
                odqPromiseWithTimeout(odqReadLayoutBQuiltBgOffsetY?.(todayKey, 'story'), 5000, 'Story quilt position').catch(
                  () => odqGetCachedLayoutBQuiltBgOffsetY?.(todayKey, 'story') ?? 0
                ),
                odqPromiseWithTimeout(odqReadLayoutBQuoteStripOffset?.(todayKey, 'story'), 5000, 'Story strip position').catch(
                  () => odqGetCachedLayoutBQuoteStripOffset?.(todayKey, 'story') || { x: 0, y: 0 }
                ),
                odqPromiseWithTimeout(odqReadLayoutBKeywordEmphasis(todayKey, 'post'), 5000, 'Post keywords').catch(
                  () => null
                ),
                odqPromiseWithTimeout(odqReadLayoutBStripLayoutSeed(todayKey, 'post'), 5000, 'Post layout').catch(
                  () => odqGetCachedLayoutBStripLayoutSeed(todayKey, 'post') ?? 0
                ),
                odqPromiseWithTimeout(odqReadLayoutBQuiltBgZoom(todayKey, 'post'), 5000, 'Post quilt zoom').catch(
                  () => odqGetCachedLayoutBQuiltBgZoom(todayKey, 'post') ?? ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN
                ),
                odqPromiseWithTimeout(odqReadLayoutBQuiltBgOffsetY?.(todayKey, 'post'), 5000, 'Post quilt position').catch(
                  () => odqGetCachedLayoutBQuiltBgOffsetY?.(todayKey, 'post') ?? 0
                ),
                odqPromiseWithTimeout(odqReadLayoutBQuoteStripOffset?.(todayKey, 'post'), 5000, 'Post strip position').catch(
                  () => odqGetCachedLayoutBQuoteStripOffset?.(todayKey, 'post') || { x: 0, y: 0 }
                ),
                odqPromiseWithTimeout(
                  typeof odqReadLayoutBCarouselClippingOffset === 'function'
                    ? odqReadLayoutBCarouselClippingOffset(todayKey)
                    : Promise.resolve({ x: 0, y: 0 }),
                  5000,
                  'Feed clipping position'
                ).catch(
                  () =>
                    (typeof odqGetCachedLayoutBCarouselClippingOffset === 'function'
                      ? odqGetCachedLayoutBCarouselClippingOffset(todayKey)
                      : null) || { x: 0, y: 0 }
                ),
                odqPromiseWithTimeout(
                  (globalThis.odqReadSpeakerCutoutTweak || odqReadSpeakerCutoutTweakFromLocal)(
                    todayKey,
                    'story'
                  ),
                  5000,
                  'Story speaker'
                ).catch(() => odqReadSpeakerCutoutTweakFromLocal(todayKey, 'story')),
                odqPromiseWithTimeout(
                  (globalThis.odqReadSpeakerCutoutTweak || odqReadSpeakerCutoutTweakFromLocal)(
                    todayKey,
                    'post'
                  ),
                  5000,
                  'Post speaker'
                ).catch(() => odqReadSpeakerCutoutTweakFromLocal(todayKey, 'post')),
                typeof globalThis.odqReadLayoutBPostStripPlan === 'function'
                  ? odqPromiseWithTimeout(
                      globalThis.odqReadLayoutBPostStripPlan(todayKey),
                      5000,
                      'Saved post strip plan'
                    ).catch(
                      () => globalThis.odqGetCachedLayoutBPostStripPlan?.(todayKey) || null
                    )
                  : Promise.resolve(
                      globalThis.odqGetCachedLayoutBPostStripPlan?.(todayKey) || null
                    ),
                typeof globalThis.odqReadInstagramImagesDocWithFallback === 'function'
                  ? odqPromiseWithTimeout(
                      globalThis.odqReadInstagramImagesDocWithFallback(todayKey, 5000),
                      5500,
                      'Tune instagram-images doc'
                    ).catch(() => null)
                  : Promise.resolve(null)
              ]);
              const igDoc = igDocRead?.data || null;
              const cachedStripPlan =
                globalThis.odqGetCachedLayoutBPostStripPlan?.(todayKey) || null;
              const docStripPlan =
                Array.isArray(igDoc?.layoutBPostStripPlan) && igDoc.layoutBPostStripPlan.length
                  ? igDoc.layoutBPostStripPlan
                  : null;
              const localTuneAt =
                typeof globalThis.odqGetLayoutBTuneLocalUpdatedAt === 'function'
                  ? String(globalThis.odqGetLayoutBTuneLocalUpdatedAt(todayKey) || '').trim()
                  : '';
              const remoteTuneAt = String(igDoc?.layoutBTuneUpdatedAt || '').trim();
              const remotePlanAt = String(igDoc?.layoutBPostStripPlanUpdatedAt || '').trim();
              const isoNewer = (a, b) => {
                const aStr = String(a || '').trim();
                const bStr = String(b || '').trim();
                if (!aStr) return false;
                if (!bStr) return true;
                const aMs = Date.parse(aStr);
                const bMs = Date.parse(bStr);
                if (Number.isFinite(aMs) && Number.isFinite(bMs)) return aMs > bMs;
                return aStr > bStr;
              };
              /**
               * Speaker restore already falls back to local on timeout; strips must too.
               * Prefer phone cache when this device’s save is current, or when cloud tune
               * moved (speaker) but strip-plan timestamp did not.
               */
              let stripPlanToRestore =
                (Array.isArray(savedPostStripPlan) && savedPostStripPlan.length
                  ? savedPostStripPlan
                  : null) ||
                docStripPlan ||
                (Array.isArray(cachedStripPlan) && cachedStripPlan.length ? cachedStripPlan : null);
              if (Array.isArray(cachedStripPlan) && cachedStripPlan.length && localTuneAt) {
                const cloudStripIsNewer = remotePlanAt && isoNewer(remotePlanAt, localTuneAt);
                const cloudTuneIsNewer = remoteTuneAt && isoNewer(remoteTuneAt, localTuneAt);
                if (!cloudStripIsNewer && (!cloudTuneIsNewer || !remotePlanAt)) {
                  stripPlanToRestore = cachedStripPlan;
                }
              }
              preloadedPostStripPlan = stripPlanToRestore;
              const quiltPack = quiltBlob && typeof quiltBlob === 'object' ? quiltBlob : { blob: quiltBlob, quiltSource: 'unknown' };
              highResBlob = quiltPack.blob;
              postHighResBlob = highResBlob;
              tuneQuiltSource = quiltPack.quiltSource || 'unknown';
              postTuneQuiltSource = tuneQuiltSource;
              if (!highResBlob) throw new Error('Could not build quilt image');
              speakerImageForCanvas = String(speakerForCanvas || '').trim();
              if (!speakerImageForCanvas) throw new Error("Today's quote has no speaker image");
              setTuneDebug(`assets ${tuneQuiltSource}/${postTuneQuiltSource} q:${String(qText).slice(0, 20)}…`);
              if (!tuneUiDirty) {
                applySpeakerTweakToTuneDraft(tuneDraftByAspect.story, storySpeaker);
                applySpeakerTweakToTuneDraft(tuneDraftByAspect.post, postSpeaker);
                tuneDraftByAspect.story.keywordEmphasis = kwStory;
                tuneDraftByAspect.story.stripLayoutSeed = odqNormalizeStripLayoutSeed(stripStory);
                tuneDraftByAspect.story.quiltBgZoom = odqNormalizeQuiltBgZoom(zoomStory);
                tuneDraftByAspect.story.quiltBgOffsetY = odqNormalizeQuiltBgOffsetY?.(quiltOffsetStory) ?? 0;
                tuneDraftByAspect.story.quoteStripOffset =
                  odqNormalizeQuoteStripOffset?.(offsetStory) || { x: 0, y: 0 };
                tuneDraftByAspect.post.keywordEmphasis = kwPost;
                tuneDraftByAspect.post.stripLayoutSeed = odqNormalizeStripLayoutSeed(stripPost);
                tuneDraftByAspect.post.quiltBgZoom = odqNormalizeQuiltBgZoom(zoomPost);
                tuneDraftByAspect.post.quiltBgOffsetY = odqNormalizeQuiltBgOffsetY?.(quiltOffsetPost) ?? 0;
                tuneDraftByAspect.post.quoteStripOffset =
                  odqNormalizeQuoteStripOffset?.(offsetPost) || { x: 0, y: 0 };
                tuneDraftByAspect.post.carouselClippingOffset =
                  normalizeClippingOffset?.(clippingOffset) || { x: 0, y: 0 };
                postQuoteStyleIndependent =
                  igDoc?.layoutBPostTuneIndependent === true ||
                  resolvePostQuoteStyleIndependent(
                    igDoc,
                    stripPost,
                    stripStory,
                    kwPost,
                    kwStory
                  );
                restoreSavedPostStripPlan(stripPlanToRestore);
                if (!postQuoteStyleIndependent && postDraftDiffersFromStoryDraft()) {
                  postQuoteStyleIndependent = true;
                }
                if (!postQuoteStyleIndependent) {
                  copyStoryQuoteStyleToPost();
                }
                storyRefStripPlan = null;
                storyRefStripPlanKey = '';
                capturedPostStripPlan = null;
                capturedPostStripPlanKey = '';
                savedKeywordEmphasis = kwStory;
                if (postTuneDiffersFromStory()) {
                  previewAspect = 'post';
                }
                applyDraftToUi(previewAspect);
                updateAspectButtons();
              } else {
                captureDraftFromUi(previewAspect);
              }
              tuneAssetsReady = true;
              spinner.hidden = true;
              spinner.style.display = 'none';
              void ensureOdqCanvasFontsReady();
              prefetchTuneClippingAssets();
              void renderPreview(currentPreset).then(() => schedulePostPreviewPrefetch(currentPreset));
            } catch (loadErr) {
              spinner.hidden = false;
              spinner.style.display = 'flex';
              const msg = String(loadErr?.message || loadErr || 'Load failed');
              spinner.textContent = `${msg} — tap Close`;
              this.uiService.showToast(msg);
              this.logger.warn('Tune modal asset load failed:', loadErr);
            }
          };
          void loadTuneAssets();
        } catch (error) {
          dismissTuneModal();
          this.errorHandler.handleError(error, 'adminTuneSpeakerCutout');
        } finally {
          this._hideSpeakerTunePrepOverlay();
          this._speakerTuneModalOpening = false;
          if (!this._speakerTuneModalOpen) this._speakerTuneModalOpeningAt = 0;
        }
      }

      // Save current quilt to Firestore
      async handleSaveToFirestore() {
        try {
          if (!this.quiltEngine.blocks || this.quiltEngine.blocks.length <= 1) {
            this.uiService.showToast('Add some blocks to the quilt first!');
            return;
          }

          this.uiService.showToast('Saving to Firestore...');
          
          // Save the current quilt to Firestore
          const success = await this.saveQuilt();
          
          if (success) {
            this.uiService.showToast('✅ Quilt saved to Firestore!');
            this.logger.log('✅ Quilt successfully saved to Firestore');
          } else {
            this.uiService.showToast('❌ Failed to save to Firestore');
            this.logger.log('❌ Failed to save quilt to Firestore');
          }
        } catch (error) {
          this.errorHandler.handleError(error, 'saveToFirestore');
        }
      }

      /**
       * Modal: how many app-days to sync (1–10) or full Notion catalog (All).
       * @returns {Promise<{ fullCatalog: true } | { fullCatalog: false, windowDays: number } | null>}
       */
      promptNotionSyncWindowChoice() {
        const STORAGE_KEY = 'ourDailyNotionSyncWindow';
        const saved = String(localStorage.getItem(STORAGE_KEY) || '').trim();
        const defaultVal =
          saved === 'all'
            ? 'all'
            : String(
                Math.min(10, Math.max(1, Number.parseInt(saved, 10) || 7))
              );

        return new Promise((resolve) => {
          const existing = document.querySelector('.odq-notion-sync-window-modal');
          if (existing) existing.remove();

          const overlay = document.createElement('div');
          overlay.className = 'odq-notion-sync-window-modal';
          overlay.style.cssText =
            'position:fixed;inset:0;z-index:100095;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;';

          const panel = document.createElement('div');
          panel.style.cssText =
            'background:#fff;border:2px solid #000;border-radius:8px;padding:14px;width:min(340px,100%);box-sizing:border-box;';

          const dayOptions = Array.from({ length: 10 }, (_, i) => {
            const n = i + 1;
            const selected = defaultVal === String(n) ? ' selected' : '';
            return `<option value="${n}"${selected}>${n} day${n === 1 ? '' : 's'}</option>`;
          }).join('');

          panel.innerHTML = `
            <p style="margin:0 0 8px;font-size:15px;font-weight:600;">Notion ↔ Firestore sync</p>
            <p style="margin:0 0 10px;font-size:13px;line-height:1.35;color:#444;">How many app-days to sync from today?</p>
            <label for="odq-notion-sync-window-select" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Sync window</label>
            <select id="odq-notion-sync-window-select" style="width:100%;padding:10px 8px;font-size:16px;border:1px solid #999;border-radius:4px;box-sizing:border-box;background:#fff;">
              ${dayOptions}
              <option value="all"${defaultVal === 'all' ? ' selected' : ''}>All (full catalog)</option>
            </select>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
              <button type="button" data-action="cancel" style="padding:8px 12px;border:1px solid #000;background:#fff;border-radius:4px;font-size:14px;">Cancel</button>
              <button type="button" data-action="ok" style="padding:8px 12px;border:1px solid #000;background:#222;color:#fff;border-radius:4px;font-size:14px;">Sync</button>
            </div>
          `;

          overlay.appendChild(panel);

          const finish = (value) => {
            overlay.remove();
            resolve(value);
          };

          const readChoice = () => {
            const select = panel.querySelector('#odq-notion-sync-window-select');
            const val = String(select?.value || '1').trim();
            try {
              localStorage.setItem(STORAGE_KEY, val);
            } catch (_) {
              /* ignore */
            }
            if (val === 'all') {
              return { fullCatalog: true };
            }
            const n = Number.parseInt(val, 10);
            return { fullCatalog: false, windowDays: Math.min(10, Math.max(1, n || 1)) };
          };

          panel.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(null));
          panel.querySelector('[data-action="ok"]').addEventListener('click', () => finish(readChoice()));
          overlay.addEventListener('click', (e) => {
            if (e.target === overlay) finish(null);
          });

          document.body.appendChild(overlay);
          const select = panel.querySelector('#odq-notion-sync-window-select');
          if (select) select.focus();
        });
      }

      /**
       * Runs the same Notion ↔ Firestore jobs as GitHub Actions (quotes from Notion, then usage back to Notion).
       * Server: POST /api/sync-notion-firestore with header x-notion-sync-token (NOTION_SYNC_TOKEN or RESET_TOKEN on Railway).
       * Body: { windowDays: 1..10 } or { fullCatalog: true } / { scope: "all" }.
       * Token is stored in localStorage as soon as you submit the prompt (this browser only). Cleared on 401 or Shift+click.
       * @param {MouseEvent} [evt]
       */
      async handleManualNotionFirestoreSync(evt) {
        const STORAGE_KEY = 'ourDailyNotionSyncToken';
        const toastErr = (msg) => this.uiService.showToast(msg, 12000);
        try {
          const baseUrl = (CONFIG.BACKEND && CONFIG.BACKEND.baseUrl) || '';
          if (!baseUrl) {
            toastErr('CONFIG.BACKEND.baseUrl is not set');
            return;
          }

          if (evt && evt.shiftKey) {
            localStorage.removeItem(STORAGE_KEY);
            this.uiService.showToast('Saved sync token cleared — paste a new one', 5000);
          }

          let trimmed = (localStorage.getItem(STORAGE_KEY) || '').trim();
          if (!trimmed) {
            const token = window.prompt(
              'Paste the server sync token (Railway: NOTION_SYNC_TOKEN, or RESET_TOKEN if NOTION_SYNC_TOKEN is unset). It is saved in this browser as soon as you confirm. Cancel to abort.'
            );
            if (token === null) {
              return;
            }
            trimmed = String(token).trim();
            if (!trimmed) {
              this.uiService.showToast('Sync cancelled');
              return;
            }
            try {
              localStorage.setItem(STORAGE_KEY, trimmed);
            } catch (storageErr) {
              toastErr(
                'Could not save token in this browser (private mode or storage blocked). Sync can still run this once.'
              );
              console.warn(storageErr);
            }
          }

          const syncScope = await this.promptNotionSyncWindowChoice();
          if (!syncScope) {
            this.uiService.showToast('Sync cancelled');
            return;
          }

          const scopeLabel = syncScope.fullCatalog
            ? 'all quotes'
            : `${syncScope.windowDays} day${syncScope.windowDays === 1 ? '' : 's'}`;
          const postBody = syncScope.fullCatalog
            ? { fullCatalog: true }
            : { windowDays: syncScope.windowDays };

          const url = `${baseUrl.replace(/\/$/, '')}/api/sync-notion-firestore`;
          this.uiService.showToast(`Running Notion ↔ Firestore sync (${scopeLabel})…`, 8000);
          console.log('Notion sync POST', url, postBody);

          const controller = new AbortController();
          const timeoutMs = 180000;
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          let res;
          try {
            res = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-notion-sync-token': trimmed
              },
              body: JSON.stringify(postBody),
              signal: controller.signal
            });
          } finally {
            clearTimeout(timeoutId);
          }

          let data = {};
          try {
            data = await res.json();
          } catch (_) {
            data = {};
          }

          if (res.status === 401) {
            localStorage.removeItem(STORAGE_KEY);
            toastErr('Sync failed: unauthorized — wrong token or not set on Railway. Saved token cleared.');
            console.error('Notion ↔ Firestore sync 401:', data);
            return;
          }

          if (!res.ok || !data.success) {
            const msg =
              (data && (data.error || data.step)) ||
              res.statusText ||
              `HTTP ${res.status}`;
            toastErr(`Sync failed: ${msg}`);
            console.error('Notion ↔ Firestore sync failed:', url, res.status, data);
            return;
          }

          try {
            localStorage.setItem(STORAGE_KEY, trimmed);
          } catch (_) {
            /* already saved after prompt; ignore */
          }

          this.uiService.showToast(`✅ Notion ↔ Firestore sync finished (${scopeLabel})`, 6000);
          if (data.stdout) {
            console.log('Notion sync stdout:\n', data.stdout);
          }
          const stderrText = (data.stderr || '').trim();
          const stderrMeaningful = stderrText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !/^-{3,}$/.test(l))
            .join('\n')
            .trim();
          if (stderrMeaningful) {
            console.warn('Notion sync stderr:\n', data.stderr);
          }
        } catch (error) {
          const isAbort = error && error.name === 'AbortError';
          const detail = isAbort
            ? 'Timed out after 3 minutes — check Railway logs and Notion API.'
            : error && error.message
              ? error.message
              : String(error);
          toastErr(`Notion sync: ${detail}`);
          console.error('Notion ↔ Firestore sync exception:', error);
          if (isAbort || (error && /Failed to fetch|NetworkError|Load failed/i.test(String(error.message)))) {
            window.alert(
              `Could not reach the sync server.\n\n${detail}\n\nURL tried: ${(CONFIG.BACKEND && CONFIG.BACKEND.baseUrl) || '(no base URL)'} — open DevTools → Network and confirm the POST is not blocked (CORS, ad blocker, or wrong host).`
            );
          }
        }
      }

      /**
       * Admin: tune bottom mirror field flip X / flip Y for today's quilt screen.
       * Persisted per dateKey (localStorage + Firestore quilts/{dateKey}).
       */
      async handleAdminTuneQuiltMirror() {
        if (this._mirrorTuneModalOpen) return;
        document.querySelectorAll('.admin-menu').forEach((el) => el.remove());

        if (!this.quiltEngine?.blocks || this.quiltEngine.blocks.length <= 1) {
          this.uiService?.showToast?.('Add some blocks to the quilt first');
          return;
        }

        const todayKey =
          (this.quoteService && typeof this.quoteService.getQuoteCalendarKeyNow === 'function'
            ? this.quoteService.getQuoteCalendarKeyNow()
            : Utils.getTodayKey());

        // Build the modal from the local cache immediately; refresh from Firestore
        // in the background once it's already on screen (see below appendChild),
        // rather than making the admin wait on a network round-trip to open it.

        const readSavedTune = () =>
          typeof globalThis.odqReadMirrorTuneFromLocal === 'function'
            ? globalThis.odqReadMirrorTuneFromLocal(todayKey)
            : { flipX: true, flipY: true, bottomLayout: 'single', updatedAt: '' };
        const modeLabel = (tune) =>
          typeof globalThis.odqMirrorTuneModeLabel === 'function'
            ? globalThis.odqMirrorTuneModeLabel(tune)
            : 'Mirror';

        const normalizeBottomLayout = (value) =>
          typeof QuiltMirrorLayout !== 'undefined' &&
          typeof QuiltMirrorLayout.odqNormalizeMirrorBottomLayout === 'function'
            ? QuiltMirrorLayout.odqNormalizeMirrorBottomLayout(value)
            : (() => {
                const raw = String(value || '').trim();
                if (raw === 'doubleSideBySide') return 'doubleSideBySide';
                if (raw === 'quadSideBySide') return 'quadSideBySide';
                return 'single';
              })();
        const isDoubleLayout = (tune) => normalizeBottomLayout(tune?.bottomLayout) === 'doubleSideBySide';
        const isQuadLayout = (tune) => normalizeBottomLayout(tune?.bottomLayout) === 'quadSideBySide';
        const usesDupTileControls = (tune) => isDoubleLayout(tune) || isQuadLayout(tune);

        const tuneToDraft = (tune) => ({
          bottomLayout: normalizeBottomLayout(tune.bottomLayout),
          flipX: tune.flipX !== false,
          flipY: tune.flipY !== false,
          leftFlipX: tune.leftFlipX === true,
          leftFlipY: tune.leftFlipY === true,
          rightFlipX: tune.rightFlipX === true,
          rightFlipY: tune.rightFlipY === true,
          nudgeSeamY: Number(tune.nudgeSeamY) || 0,
          nudgeMirrorY: Number(tune.nudgeMirrorY) || 0,
          nudgeTileSeamX: Number(tune.nudgeTileSeamX) || 0,
          nudgeLeftTileX: Number(tune.nudgeLeftTileX) || 0,
          nudgeLeftTileY: Number(tune.nudgeLeftTileY) || 0,
          nudgeRightTileY: Number(tune.nudgeRightTileY) || 0
        });
        const savedTune = readSavedTune();
        let draftTune = tuneToDraft(savedTune);
        let dirty = false;
        const nudgeStep = (big) =>
          typeof globalThis.odqMirrorSeamNudgeStep === 'function'
            ? globalThis.odqMirrorSeamNudgeStep(!!big)
            : 0.02 * (big ? 5 : 1);
        const clampSeamNudge = (value) =>
          typeof QuiltMirrorLayout !== 'undefined' &&
          typeof QuiltMirrorLayout.odqNormalizeMirrorSeamNudge === 'function'
            ? QuiltMirrorLayout.odqNormalizeMirrorSeamNudge(value)
            : Math.max(-0.35, Math.min(0.35, Number(value) || 0));
        const clampTileNudge = (value) =>
          typeof QuiltMirrorLayout !== 'undefined' &&
          typeof QuiltMirrorLayout.odqNormalizeMirrorTileNudge === 'function'
            ? QuiltMirrorLayout.odqNormalizeMirrorTileNudge(value)
            : Math.max(-1, Math.min(1, Number(value) || 0));
        const formatNudge = (value, clamp = clampSeamNudge) => {
          const n = clamp(value);
          if (Math.abs(n) < 0.0005) return '0';
          return (n > 0 ? '+' : '') + n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
        };

        const modal = document.createElement('div');
        modal.className = 'odq-mirror-tune-modal';
        modal.innerHTML = `
          <div class="odq-mirror-tune-panel" role="dialog" aria-modal="true" aria-label="Tune quilt mirror">
            <style>
              .odq-mirror-tune-panel * { box-sizing: border-box; }
              .odq-mirror-tune-head {
                display:flex;align-items:baseline;justify-content:space-between;gap:12px;
                margin:0 0 8px;flex-wrap:wrap;
              }
              .odq-mirror-tune-head h2 { margin:0;font-size:16px; }
              .odq-mirror-tune-head .odq-mirror-tune-sub { margin:0;font-size:12px;opacity:.75; }
              .odq-mirror-tune-body {
                display:grid;grid-template-columns:minmax(140px,220px) minmax(0,1fr);
                gap:14px;align-items:start;
              }
              .odq-mirror-tune-preview-wrap {
                position:relative;background:#f6f4f1;border-radius:8px;overflow:hidden;
                width:100%;margin:0;
              }
              .odq-mirror-tune-controls { min-width:0;display:flex;flex-direction:column;gap:6px; }
              .odq-mirror-tune-details { margin:0;border-top:1px solid #eceae6;padding-top:6px; }
              .odq-mirror-tune-details > summary {
                cursor:pointer;font-size:12px;font-weight:600;list-style:none;
                display:flex;align-items:center;gap:6px;user-select:none;
              }
              .odq-mirror-tune-details > summary::-webkit-details-marker { display:none; }
              .odq-mirror-tune-details > summary::before { content:'▸'; font-size:10px;opacity:.55; }
              .odq-mirror-tune-details[open] > summary::before { content:'▾'; }
              .odq-mirror-tune-details > summary + * { margin-top:6px; }
              .odq-mt-row {
                display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;
              }
              .odq-mt-row label {
                display:inline-flex;align-items:center;gap:5px;margin:0;font-size:13px;white-space:nowrap;
              }
              .odq-mt-cols {
                display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;align-items:start;
              }
              .odq-mt-col-title { font-size:11px;font-weight:600;margin:0 0 2px;opacity:.85; }
              .odq-mt-status { font-size:11px;opacity:.72;margin:0 0 4px;line-height:1.25; }
              .odq-mirror-tune-nudge-row {
                display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:0;
              }
              .odq-mirror-tune-nudge-row button {
                min-width:28px;padding:3px 7px;font-size:13px;line-height:1.2;
              }
              .odq-mirror-tune-nudge-row button[data-action] { font-size:11px; }
              .odq-mirror-tune-actions {
                display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;align-items:center;
              }
              .odq-mirror-tune-actions button { padding:6px 12px;font-size:13px; }
              .odq-mirror-tune-panel [data-status] {
                margin-top:2px;font-size:11px;opacity:.7;min-height:14px;
              }
              @media (max-width:560px) {
                .odq-mirror-tune-body { grid-template-columns:1fr; }
                .odq-mirror-tune-preview-wrap { max-width:220px;margin:0 auto; }
              }
            </style>
            <div class="odq-mirror-tune-head">
              <h2>Tune quilt mirror</h2>
              <p class="odq-mirror-tune-sub">${todayKey} · Mode: <strong data-mode-label></strong></p>
            </div>
            <div class="odq-mirror-tune-body">
              <div class="odq-mirror-tune-preview-wrap">
                <svg id="odqMirrorTunePreviewSvg" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" style="display:block;"></svg>
              </div>
              <div class="odq-mirror-tune-controls">
                <details class="odq-mirror-tune-details" open>
                  <summary>Layout</summary>
                  <div class="odq-mt-row">
                    <label><input type="radio" name="odq-mirror-bottom-layout" value="single" data-bottom-layout="single" /> Single</label>
                    <label><input type="radio" name="odq-mirror-bottom-layout" value="doubleSideBySide" data-bottom-layout="doubleSideBySide" /> Dup ×2</label>
                    <label><input type="radio" name="odq-mirror-bottom-layout" value="quadSideBySide" data-bottom-layout="quadSideBySide" /> Dup ×4</label>
                  </div>
                </details>
                <details class="odq-mirror-tune-details" data-single-flip-section open>
                  <summary>Flip</summary>
                  <div class="odq-mt-row">
                    <label><input type="checkbox" data-flip="x" /> Flip X</label>
                    <label><input type="checkbox" data-flip="y" /> Flip Y</label>
                  </div>
                </details>
                <details class="odq-mirror-tune-details" data-double-flip-section hidden open>
                  <summary>Tile flips</summary>
                  <div class="odq-mt-cols">
                    <div>
                      <div class="odq-mt-col-title">Left</div>
                      <div class="odq-mt-row">
                        <label><input type="checkbox" data-tile-flip="left-x" /> X</label>
                        <label><input type="checkbox" data-tile-flip="left-y" /> Y</label>
                      </div>
                    </div>
                    <div>
                      <div class="odq-mt-col-title">Right</div>
                      <div class="odq-mt-row">
                        <label><input type="checkbox" data-tile-flip="right-x" /> X</label>
                        <label><input type="checkbox" data-tile-flip="right-y" /> Y</label>
                      </div>
                    </div>
                  </div>
                </details>
                <details class="odq-mirror-tune-details" data-tile-position-section hidden open>
                  <summary>Tile position</summary>
                  <div class="odq-mt-cols">
                    <div>
                      <div class="odq-mt-col-title">Left</div>
                      <div class="odq-mt-status" data-left-tile-x-nudge-status></div>
                      <div class="odq-mt-status" data-left-tile-nudge-status></div>
                      <div class="odq-mirror-tune-nudge" aria-label="Nudge left tile left, right, up or down">
                        <div class="odq-mirror-tune-nudge-row">
                          <button type="button" data-left-tile-x-nudge="left" aria-label="Nudge left tile left">←</button>
                          <button type="button" data-left-tile-x-nudge="right" aria-label="Nudge left tile right">→</button>
                          <button type="button" data-left-tile-x-big-nudge="left" aria-label="Big nudge left tile left">⇐</button>
                          <button type="button" data-left-tile-x-big-nudge="right" aria-label="Big nudge left tile right">⇒</button>
                          <button type="button" data-left-tile-nudge="up" aria-label="Nudge left tile up">↑</button>
                          <button type="button" data-left-tile-nudge="down" aria-label="Nudge left tile down">↓</button>
                          <button type="button" data-left-tile-big-nudge="up" aria-label="Big nudge left tile up">⇑</button>
                          <button type="button" data-left-tile-big-nudge="down" aria-label="Big nudge left tile down">⇓</button>
                          <button type="button" data-action="reset-left-tile">Reset</button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div class="odq-mt-col-title">Right</div>
                      <div class="odq-mt-status" data-tile-seam-nudge-status></div>
                      <div class="odq-mt-status" data-right-tile-nudge-status></div>
                      <div class="odq-mirror-tune-nudge" aria-label="Nudge right tile left, right, up or down">
                        <div class="odq-mirror-tune-nudge-row">
                          <button type="button" data-tile-seam-nudge="left" aria-label="Nudge right tile left">←</button>
                          <button type="button" data-tile-seam-nudge="right" aria-label="Nudge right tile right">→</button>
                          <button type="button" data-tile-seam-big-nudge="left" aria-label="Big nudge right tile left">⇐</button>
                          <button type="button" data-tile-seam-big-nudge="right" aria-label="Big nudge right tile right">⇒</button>
                          <button type="button" data-right-tile-nudge="up" aria-label="Nudge right tile up">↑</button>
                          <button type="button" data-right-tile-nudge="down" aria-label="Nudge right tile down">↓</button>
                          <button type="button" data-right-tile-big-nudge="up" aria-label="Big nudge right tile up">⇑</button>
                          <button type="button" data-right-tile-big-nudge="down" aria-label="Big nudge right tile down">⇓</button>
                          <button type="button" data-action="reset-right-tile">Reset</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </details>
                <div class="odq-mt-cols">
                  <details class="odq-mirror-tune-details" open>
                    <summary>Seam</summary>
                    <div class="odq-mt-status" data-seam-nudge-status></div>
                    <div class="odq-mirror-tune-nudge" aria-label="Nudge seam up or down">
                      <div class="odq-mirror-tune-nudge-row">
                        <button type="button" data-seam-nudge="up" aria-label="Nudge seam up">↑</button>
                        <button type="button" data-seam-nudge="down" aria-label="Nudge seam down">↓</button>
                        <button type="button" data-seam-big-nudge="up" aria-label="Big nudge seam up">⇑</button>
                        <button type="button" data-seam-big-nudge="down" aria-label="Big nudge seam down">⇓</button>
                        <button type="button" data-action="reset-seam-nudge">Reset</button>
                      </div>
                    </div>
                  </details>
                  <details class="odq-mirror-tune-details" open>
                    <summary>Mirror field</summary>
                    <div class="odq-mt-status" data-mirror-nudge-status></div>
                    <div class="odq-mirror-tune-nudge" aria-label="Move mirrored half up or down">
                      <div class="odq-mirror-tune-nudge-row">
                        <button type="button" data-mirror-nudge="up" aria-label="Move mirrored half up">↑</button>
                        <button type="button" data-mirror-nudge="down" aria-label="Move mirrored half down">↓</button>
                        <button type="button" data-mirror-big-nudge="up" aria-label="Big move mirrored half up">⇑</button>
                        <button type="button" data-mirror-big-nudge="down" aria-label="Big move mirrored half down">⇓</button>
                        <button type="button" data-action="reset-mirror-nudge">Reset</button>
                      </div>
                    </div>
                  </details>
                </div>
                <div class="odq-mirror-tune-actions">
                  <button type="button" data-action="reset">Reset all</button>
                  <button type="button" data-action="save">Save</button>
                  <button type="button" data-action="close">Close</button>
                </div>
                <div data-status></div>
              </div>
            </div>
          </div>
        `;
        modal.style.cssText =
          'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:100060;display:flex;align-items:center;justify-content:center;padding:12px;';
        const panel = modal.querySelector('.odq-mirror-tune-panel');
        panel.style.cssText =
          'background:#fff;border-radius:10px;padding:12px 14px;max-width:min(720px,96vw);width:100%;max-height:96vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.35);';

        const previewWrap = modal.querySelector('.odq-mirror-tune-preview-wrap');
        const previewSvg = modal.querySelector('#odqMirrorTunePreviewSvg');
        const flipXInput = modal.querySelector('[data-flip="x"]');
        const flipYInput = modal.querySelector('[data-flip="y"]');
        const layoutSingleInput = modal.querySelector('[data-bottom-layout="single"]');
        const layoutDoubleInput = modal.querySelector('[data-bottom-layout="doubleSideBySide"]');
        const layoutQuadInput = modal.querySelector('[data-bottom-layout="quadSideBySide"]');
        const singleFlipSection = modal.querySelector('[data-single-flip-section]');
        const doubleFlipSection = modal.querySelector('[data-double-flip-section]');
        const tilePositionSection = modal.querySelector('[data-tile-position-section]');
        const leftFlipXInput = modal.querySelector('[data-tile-flip="left-x"]');
        const leftFlipYInput = modal.querySelector('[data-tile-flip="left-y"]');
        const rightFlipXInput = modal.querySelector('[data-tile-flip="right-x"]');
        const rightFlipYInput = modal.querySelector('[data-tile-flip="right-y"]');
        const modeLabelEl = modal.querySelector('[data-mode-label]');
        const statusEl = modal.querySelector('[data-status]');
        const seamNudgeStatusEl = modal.querySelector('[data-seam-nudge-status]');
        const mirrorNudgeStatusEl = modal.querySelector('[data-mirror-nudge-status]');
        const tileSeamNudgeStatusEl = modal.querySelector('[data-tile-seam-nudge-status]');
        const leftTileXNudgeStatusEl = modal.querySelector('[data-left-tile-x-nudge-status]');
        const leftTileNudgeStatusEl = modal.querySelector('[data-left-tile-nudge-status]');
        const rightTileNudgeStatusEl = modal.querySelector('[data-right-tile-nudge-status]');

        const applyDraftToUi = () => {
          const layout = normalizeBottomLayout(draftTune.bottomLayout);
          const dupTiles = usesDupTileControls(draftTune);
          if (layoutSingleInput) layoutSingleInput.checked = layout === 'single';
          if (layoutDoubleInput) layoutDoubleInput.checked = layout === 'doubleSideBySide';
          if (layoutQuadInput) layoutQuadInput.checked = layout === 'quadSideBySide';
          if (singleFlipSection) singleFlipSection.hidden = dupTiles;
          if (doubleFlipSection) doubleFlipSection.hidden = !dupTiles;
          if (tilePositionSection) tilePositionSection.hidden = !dupTiles;
          flipXInput.checked = !!draftTune.flipX;
          flipYInput.checked = !!draftTune.flipY;
          if (leftFlipXInput) leftFlipXInput.checked = !!draftTune.leftFlipX;
          if (leftFlipYInput) leftFlipYInput.checked = !!draftTune.leftFlipY;
          if (rightFlipXInput) rightFlipXInput.checked = !!draftTune.rightFlipX;
          if (rightFlipYInput) rightFlipYInput.checked = !!draftTune.rightFlipY;
          if (modeLabelEl) modeLabelEl.textContent = modeLabel(draftTune);
          if (seamNudgeStatusEl) {
            seamNudgeStatusEl.textContent = `Seam offset ${formatNudge(draftTune.nudgeSeamY)}`;
          }
          if (mirrorNudgeStatusEl) {
            mirrorNudgeStatusEl.textContent = `Mirror field offset ${formatNudge(draftTune.nudgeMirrorY)}`;
          }
          if (tileSeamNudgeStatusEl) {
            tileSeamNudgeStatusEl.textContent = `Horizontal offset ${formatNudge(draftTune.nudgeTileSeamX, clampTileNudge)}`;
          }
          if (leftTileXNudgeStatusEl) {
            leftTileXNudgeStatusEl.textContent = `Horizontal offset ${formatNudge(draftTune.nudgeLeftTileX, clampTileNudge)}`;
          }
          if (leftTileNudgeStatusEl) {
            leftTileNudgeStatusEl.textContent = `Vertical offset ${formatNudge(draftTune.nudgeLeftTileY, clampTileNudge)}`;
          }
          if (rightTileNudgeStatusEl) {
            rightTileNudgeStatusEl.textContent = `Vertical offset ${formatNudge(draftTune.nudgeRightTileY, clampTileNudge)}`;
          }
        };

        const writeDraftTuneLocal = () => {
          if (typeof globalThis.odqWriteMirrorTuneLocal === 'function') {
            globalThis.odqWriteMirrorTuneLocal(todayKey, {
              bottomLayout: draftTune.bottomLayout,
              flipX: draftTune.flipX,
              flipY: draftTune.flipY,
              leftFlipX: draftTune.leftFlipX,
              leftFlipY: draftTune.leftFlipY,
              rightFlipX: draftTune.rightFlipX,
              rightFlipY: draftTune.rightFlipY,
              nudgeSeamY: draftTune.nudgeSeamY,
              nudgeMirrorY: draftTune.nudgeMirrorY,
              nudgeTileSeamX: draftTune.nudgeTileSeamX,
              nudgeLeftTileX: draftTune.nudgeLeftTileX,
              nudgeLeftTileY: draftTune.nudgeLeftTileY,
              nudgeRightTileY: draftTune.nudgeRightTileY,
              updatedAt: savedTune.updatedAt || ''
            });
          }
        };

        /** Live quilt container size — same aspect the phone quilt screen uses. */
        const getLiveQuiltViewport = () => {
          if (typeof this.archiveService?.getLiveQuiltScreenAspect === 'function') {
            const aspect = this.archiveService.getLiveQuiltScreenAspect();
            const container =
              document.querySelector('#screen-quilt .quilt-container') ||
              document.querySelector('.quilt-container');
            const rect = container?.getBoundingClientRect?.();
            if (rect && rect.width > 0 && rect.height > 0) {
              return { w: rect.width, h: rect.height, aspect };
            }
            if (Number.isFinite(aspect) && aspect > 0 && typeof window !== 'undefined') {
              const h = Math.max(480, window.innerHeight);
              return { w: h * aspect, h, aspect };
            }
          }
          const ref =
            typeof QuiltMirrorLayout !== 'undefined' && QuiltMirrorLayout.CANVAS_HEIGHT_REFERENCE
              ? QuiltMirrorLayout.CANVAS_HEIGHT_REFERENCE
              : { width: 273, height: 720 };
          return {
            w: ref.width,
            h: ref.height,
            aspect: ref.width / ref.height
          };
        };

        /** Size preview box to live quilt aspect (fits the left column). */
        const sizeMirrorTunePreviewWrap = () => {
          const live = getLiveQuiltViewport();
          const aspect = live.aspect || live.w / live.h;
          const body = modal.querySelector('.odq-mirror-tune-body');
          const bodyW = body?.clientWidth || panel?.clientWidth || 680;
          const stacked = bodyW < 560;
          const maxW = stacked
            ? Math.min(220, Math.max(140, bodyW - 8))
            : Math.min(220, Math.max(140, Math.round(bodyW * 0.32)));
          const maxH =
            typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.72, 640) : 520;
          let w = maxW;
          let h = w / aspect;
          if (h > maxH) {
            h = maxH;
            w = h * aspect;
          }
          w = Math.max(120, Math.round(w));
          h = Math.max(160, Math.round(h));
          if (previewWrap) {
            previewWrap.style.width = `${w}px`;
            previewWrap.style.height = `${h}px`;
            previewWrap.style.maxWidth = '100%';
          }
          return { w, h };
        };

        const refreshMirrorTunePreview = () => {
          if (!this.renderer || typeof this.renderer.renderBlocks !== 'function' || !previewSvg) return;
          const state = this.quiltEngine?.getState?.() || {};
          const blocks = Array.isArray(state.blocks) ? state.blocks : this.quiltEngine?.blocks;
          if (!Array.isArray(blocks) || !blocks.length) return;
          writeDraftTuneLocal();
          const { w: viewportW, h: viewportH } = sizeMirrorTunePreviewWrap();
          const previousSvg = this.renderer.quiltSVG;
          const previousOverride = this.renderer._renderViewportOverride;
          const previousUserPieces = this.renderer.userPieces;
          const previousLastAddedIndex = this.renderer.lastAddedIndex;
          const previousBacksidePreview = this.renderer.backsidePreviewEnabled;
          try {
            this.renderer._renderViewportOverride = { w: viewportW, h: viewportH };
            this.renderer.quiltSVG = previewSvg;
            this.renderer.lastAddedIndex = null;
            this.renderer.setBacksidePreviewEnabled?.(false);
            this.renderer.renderBlocks(blocks, state.userPieces || [], state.submissionCount || 0);
          } finally {
            this.renderer.quiltSVG = previousSvg;
            this.renderer._renderViewportOverride = previousOverride;
            this.renderer.userPieces = previousUserPieces;
            this.renderer.lastAddedIndex = previousLastAddedIndex;
            this.renderer.setBacksidePreviewEnabled?.(previousBacksidePreview);
          }
        };

        const applyDraftPreview = () => {
          refreshMirrorTunePreview();
        };

        const refreshMainQuilt = () => {
          if (typeof this.renderQuilt === 'function') {
            this.renderQuilt({ viewportOnly: true });
          }
        };

        const revertDraft = () => {
          if (!dirty) return;
          if (typeof globalThis.odqWriteMirrorTuneLocal === 'function') {
            globalThis.odqWriteMirrorTuneLocal(todayKey, savedTune);
          }
          refreshMainQuilt();
        };

        const dismissModal = () => {
          revertDraft();
          modal.remove();
          this._mirrorTuneModalOpen = false;
        };

        const applyLayoutChoice = (bottomLayout) => {
          draftTune = {
            ...draftTune,
            bottomLayout: normalizeBottomLayout(bottomLayout)
          };
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
        };

        layoutSingleInput?.addEventListener('change', () => {
          if (layoutSingleInput.checked) applyLayoutChoice('single');
        });
        layoutDoubleInput?.addEventListener('change', () => {
          if (layoutDoubleInput.checked) applyLayoutChoice('doubleSideBySide');
        });
        layoutQuadInput?.addEventListener('change', () => {
          if (layoutQuadInput.checked) applyLayoutChoice('quadSideBySide');
        });

        flipXInput.addEventListener('change', () => {
          draftTune = { ...draftTune, flipX: flipXInput.checked };
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
        });
        flipYInput.addEventListener('change', () => {
          draftTune = { ...draftTune, flipY: flipYInput.checked };
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
        });

        const bindTileFlipInput = (input, key) => {
          input?.addEventListener('change', () => {
            draftTune = { ...draftTune, [key]: input.checked };
            dirty = true;
            applyDraftToUi();
            applyDraftPreview();
          });
        };
        bindTileFlipInput(leftFlipXInput, 'leftFlipX');
        bindTileFlipInput(leftFlipYInput, 'leftFlipY');
        bindTileFlipInput(rightFlipXInput, 'rightFlipX');
        bindTileFlipInput(rightFlipYInput, 'rightFlipY');

        const applySeamNudge = (direction, big) => {
          const step = nudgeStep(big);
          if (direction === 'up') draftTune.nudgeSeamY = clampSeamNudge(draftTune.nudgeSeamY - step);
          else if (direction === 'down') draftTune.nudgeSeamY = clampSeamNudge(draftTune.nudgeSeamY + step);
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
        };

        modal.querySelectorAll('[data-seam-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applySeamNudge(btn.dataset.seamNudge, false));
        });
        modal.querySelectorAll('[data-seam-big-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applySeamNudge(btn.dataset.seamBigNudge, true));
        });
        modal.querySelector('[data-action="reset-seam-nudge"]')?.addEventListener('click', () => {
          draftTune.nudgeSeamY = 0;
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
          statusEl.textContent = 'Seam nudge reset. Save to persist.';
        });

        const applyMirrorFieldNudge = (direction, big) => {
          const step = nudgeStep(big);
          if (direction === 'up') draftTune.nudgeMirrorY = clampSeamNudge(draftTune.nudgeMirrorY + step);
          else if (direction === 'down') draftTune.nudgeMirrorY = clampSeamNudge(draftTune.nudgeMirrorY - step);
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
        };

        modal.querySelectorAll('[data-mirror-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applyMirrorFieldNudge(btn.dataset.mirrorNudge, false));
        });
        modal.querySelectorAll('[data-mirror-big-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applyMirrorFieldNudge(btn.dataset.mirrorBigNudge, true));
        });
        modal.querySelector('[data-action="reset-mirror-nudge"]')?.addEventListener('click', () => {
          draftTune.nudgeMirrorY = 0;
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
          statusEl.textContent = 'Mirror field reset. Save to persist.';
        });

        const applyTileHorizontalNudge = (key, direction, big) => {
          const step = nudgeStep(big);
          if (direction === 'left') draftTune[key] = clampTileNudge(draftTune[key] - step);
          else if (direction === 'right') draftTune[key] = clampTileNudge(draftTune[key] + step);
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
        };

        modal.querySelectorAll('[data-tile-seam-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applyTileHorizontalNudge('nudgeTileSeamX', btn.dataset.tileSeamNudge, false));
        });
        modal.querySelectorAll('[data-tile-seam-big-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applyTileHorizontalNudge('nudgeTileSeamX', btn.dataset.tileSeamBigNudge, true));
        });

        modal.querySelectorAll('[data-left-tile-x-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applyTileHorizontalNudge('nudgeLeftTileX', btn.dataset.leftTileXNudge, false));
        });
        modal.querySelectorAll('[data-left-tile-x-big-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applyTileHorizontalNudge('nudgeLeftTileX', btn.dataset.leftTileXBigNudge, true));
        });

        const applyTileVerticalNudge = (key, direction, big) => {
          const step = nudgeStep(big);
          if (direction === 'up') draftTune[key] = clampTileNudge(draftTune[key] - step);
          else if (direction === 'down') draftTune[key] = clampTileNudge(draftTune[key] + step);
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
        };

        modal.querySelectorAll('[data-left-tile-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applyTileVerticalNudge('nudgeLeftTileY', btn.dataset.leftTileNudge, false));
        });
        modal.querySelectorAll('[data-left-tile-big-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applyTileVerticalNudge('nudgeLeftTileY', btn.dataset.leftTileBigNudge, true));
        });
        modal.querySelector('[data-action="reset-left-tile"]')?.addEventListener('click', () => {
          draftTune.nudgeLeftTileX = 0;
          draftTune.nudgeLeftTileY = 0;
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
          statusEl.textContent = 'Left tile position reset. Save to persist.';
        });

        modal.querySelectorAll('[data-right-tile-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applyTileVerticalNudge('nudgeRightTileY', btn.dataset.rightTileNudge, false));
        });
        modal.querySelectorAll('[data-right-tile-big-nudge]').forEach((btn) => {
          btn.addEventListener('click', () => applyTileVerticalNudge('nudgeRightTileY', btn.dataset.rightTileBigNudge, true));
        });
        modal.querySelector('[data-action="reset-right-tile"]')?.addEventListener('click', () => {
          draftTune.nudgeTileSeamX = 0;
          draftTune.nudgeRightTileY = 0;
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
          statusEl.textContent = 'Right tile position reset. Save to persist.';
        });

        modal.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
          draftTune = {
            bottomLayout: 'single',
            flipX: true,
            flipY: true,
            leftFlipX: false,
            leftFlipY: false,
            rightFlipX: false,
            rightFlipY: false,
            nudgeSeamY: 0,
            nudgeMirrorY: 0,
            nudgeTileSeamX: 0,
            nudgeLeftTileX: 0,
            nudgeLeftTileY: 0,
            nudgeRightTileY: 0
          };
          dirty = true;
          applyDraftToUi();
          applyDraftPreview();
          statusEl.textContent = 'Reset to default (Mirror, centered seam). Save to persist.';
        });

        const snapshotDraftTune = (tune) => ({
          bottomLayout: normalizeBottomLayout(tune?.bottomLayout),
          flipX: tune?.flipX !== false,
          flipY: tune?.flipY !== false,
          leftFlipX: tune?.leftFlipX === true,
          leftFlipY: tune?.leftFlipY === true,
          rightFlipX: tune?.rightFlipX === true,
          rightFlipY: tune?.rightFlipY === true,
          nudgeSeamY: Number(tune?.nudgeSeamY) || 0,
          nudgeMirrorY: Number(tune?.nudgeMirrorY) || 0,
          nudgeTileSeamX: Number(tune?.nudgeTileSeamX) || 0,
          nudgeLeftTileX: Number(tune?.nudgeLeftTileX) || 0,
          nudgeLeftTileY: Number(tune?.nudgeLeftTileY) || 0,
          nudgeRightTileY: Number(tune?.nudgeRightTileY) || 0
        });

        modal.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
          const saveBtn = modal.querySelector('[data-action="save"]');
          if (saveBtn) saveBtn.disabled = true;
          statusEl.textContent = 'Saving…';
          const updatedAt = new Date().toISOString();
          const previousTune = snapshotDraftTune(savedTune);
          const blockCount = Array.isArray(this.blocks) ? this.blocks.length : null;
          const writeOptions = {
            previous: previousTune,
            blockCount,
            action:
              typeof globalThis.odqMirrorTuneIsCustomized === 'function' &&
              !globalThis.odqMirrorTuneIsCustomized(draftTune)
                ? 'reset'
                : 'save'
          };
          const appendLocalHistory = () => {
            if (typeof globalThis.odqBuildMirrorTuneHistoryEntry !== 'function') return;
            const entry = globalThis.odqBuildMirrorTuneHistoryEntry(previousTune, draftTune, {
              at: updatedAt,
              action: writeOptions.action,
              blockCount
            });
            if (typeof globalThis.odqAppendMirrorTuneHistoryLocal === 'function') {
              globalThis.odqAppendMirrorTuneHistoryLocal(todayKey, entry);
            }
          };
          try {
            if (typeof globalThis.odqWriteMirrorTuneViaServer === 'function') {
              await globalThis.odqWriteMirrorTuneViaServer(
                todayKey,
                {
                  ...snapshotDraftTune(draftTune),
                  updatedAt
                },
                writeOptions
              );
            } else if (typeof globalThis.odqWriteMirrorTuneLocal === 'function') {
              globalThis.odqWriteMirrorTuneLocal(todayKey, {
                ...snapshotDraftTune(draftTune),
                updatedAt
              });
              appendLocalHistory();
            }
            Object.assign(savedTune, snapshotDraftTune(draftTune), { updatedAt });
            dirty = false;
            this.uiService?.showToast?.(`Mirror saved: ${modeLabel(draftTune)}`);
            modal.remove();
            this._mirrorTuneModalOpen = false;
            refreshMainQuilt();
            try {
              this.archiveService?.clearInstagramQuiltSourceCache?.();
              this._layoutBStoryPreviewHeavyDoneThisVisit = false;
              this._layoutBStoryPreviewFrozenDateKey = '';
              this._invalidateLayoutBStoryPreviewForAppDayChange?.();
              this.scheduleLayoutBStoryPreviewRefresh?.();
            } catch (invalidateErr) {
              this.logger?.warn?.('Story preview invalidate after mirror save failed:', invalidateErr);
            }
          } catch (err) {
            statusEl.textContent = err?.message || 'Save failed';
            if (typeof globalThis.odqWriteMirrorTuneLocal === 'function') {
              globalThis.odqWriteMirrorTuneLocal(todayKey, {
                ...snapshotDraftTune(draftTune),
                updatedAt
              });
              appendLocalHistory();
              Object.assign(savedTune, snapshotDraftTune(draftTune), { updatedAt });
              dirty = false;
              this.uiService?.showToast?.(`Saved on device only: ${modeLabel(draftTune)}`);
              modal.remove();
              this._mirrorTuneModalOpen = false;
              refreshMainQuilt();
              try {
                this.archiveService?.clearInstagramQuiltSourceCache?.();
                this._layoutBStoryPreviewHeavyDoneThisVisit = false;
                this._layoutBStoryPreviewFrozenDateKey = '';
                this._invalidateLayoutBStoryPreviewForAppDayChange?.();
                this.scheduleLayoutBStoryPreviewRefresh?.();
              } catch (invalidateErr) {
                this.logger?.warn?.('Story preview invalidate after mirror save failed:', invalidateErr);
              }
            }
          } finally {
            if (saveBtn) saveBtn.disabled = false;
          }
        });

        modal.querySelector('[data-action="close"]')?.addEventListener('click', dismissModal);
        modal.addEventListener('click', (event) => {
          if (event.target === modal) dismissModal();
        });

        document.body.appendChild(modal);
        this._mirrorTuneModalOpen = true;
        requestAnimationFrame(() => {
          applyDraftToUi();
          refreshMirrorTunePreview();
        });

        if (typeof globalThis.odqReadMirrorTune === 'function') {
          globalThis.odqReadMirrorTune(todayKey)
            .then((remoteTune) => {
              if (dirty || !document.body.contains(modal)) return;
              if (!remoteTune || remoteTune.updatedAt === savedTune.updatedAt) return;
              Object.assign(savedTune, remoteTune);
              draftTune = tuneToDraft(remoteTune);
              applyDraftToUi();
              refreshMirrorTunePreview();
            })
            .catch((refreshErr) => {
              this.logger?.warn?.('Mirror tune background refresh failed', refreshErr);
            });
        }
      }

      /** Read device + server tune settings (instagram-images/{dateKey}). */
      async handleAdminVerifyLayoutBTuneSettings() {
        await this.ensureLayoutBComposeReady?.();
        const dk =
          (this.quoteService && typeof this.quoteService.getQuoteCalendarKeyNow === 'function'
            ? this.quoteService.getQuoteCalendarKeyNow()
            : Utils.getTodayKey());
        const storyTweak = odqReadSpeakerCutoutTweakFromLocal(dk, 'story');
        const postTweak = odqReadSpeakerCutoutTweakFromLocal(dk, 'post');
        const storyKw = odqGetCachedLayoutBKeywordEmphasis(dk, 'story');
        const postKw = odqGetCachedLayoutBKeywordEmphasis(dk, 'post');
        const storyStrip = odqGetCachedLayoutBStripLayoutSeed(dk, 'story') ?? 0;
        const postStrip = odqGetCachedLayoutBStripLayoutSeed(dk, 'post') ?? 0;
        const storyQuiltZoom = odqGetCachedLayoutBQuiltBgZoom(dk, 'story') ?? ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
        const postQuiltZoom = odqGetCachedLayoutBQuiltBgZoom(dk, 'post') ?? ODQ_LAYOUT_B_QUILT_BG_ZOOM_MIN;
        const storyQuiltOffsetY = odqGetCachedLayoutBQuiltBgOffsetY?.(dk, 'story') ?? 0;
        const postQuiltOffsetY = odqGetCachedLayoutBQuiltBgOffsetY?.(dk, 'post') ?? 0;
        const storyStripOffset = odqGetCachedLayoutBQuoteStripOffset?.(dk, 'story') || { x: 0, y: 0 };
        const postStripOffset = odqGetCachedLayoutBQuoteStripOffset?.(dk, 'post') || { x: 0, y: 0 };
        const clippingOffset =
          (typeof odqGetCachedLayoutBCarouselClippingOffset === 'function'
            ? odqGetCachedLayoutBCarouselClippingOffset(dk)
            : null) || { x: 0, y: 0 };
        const fmtKw = (kw) => (kw?.keywords?.length ? kw.keywords.join(', ') : 'none');
        const fmtStrip = (n) => (n === 0 ? '#1' : `#${n + 1}`);
        const fmtQuiltZoom = (zoom) => {
          const label = odqFormatQuiltBgZoomLabel(zoom);
          return label === 'Default' ? '' : ` quilt ${label}`;
        };
        const fmtQuiltOffset = (offsetY) => {
          const label = odqFormatQuiltBgOffsetYLabel ? odqFormatQuiltBgOffsetYLabel(offsetY) : 'Centered';
          return label === 'Centered' ? '' : ` quilt ${label}`;
        };
        const fmtNudge = (t) => {
          const bits = [];
          if (t.nudgeCx || t.nudgeCy) {
            const x = Math.round(t.nudgeCx * 100);
            const y = Math.round(t.nudgeCy * 100);
            bits.push(`nudge ${x >= 0 ? '+' : ''}${x}/${y >= 0 ? '+' : ''}${y}%`);
          }
          if (t.nudgeRotateDeg) {
            const r = Math.round(t.nudgeRotateDeg * 10) / 10;
            bits.push(`rot ${r > 0 ? '+' : ''}${r}°`);
          }
          if (odqNormalizeSpeakerScaleMul(t.nudgeScale) !== 1) {
            const pct = Math.round((t.nudgeScale - 1) * 100);
            bits.push(`size ${pct > 0 ? '+' : ''}${pct}%`);
          }
          return bits.length ? ` ${bits.join(' ')}` : '';
        };
        const fmtStripOffset = (offset) => {
          const off = odqNormalizeQuoteStripOffset?.(offset) || { x: 0, y: 0 };
          const x = Math.round((off.x || 0) * 100);
          const y = Math.round((off.y || 0) * 100);
          return x || y ? ` strips ${x >= 0 ? '+' : ''}${x}/${y >= 0 ? '+' : ''}${y}%` : '';
        };
        const fmtClippingOffset = (offset) => {
          const normalize =
            typeof odqNormalizeCarouselClippingOffset === 'function'
              ? odqNormalizeCarouselClippingOffset
              : odqNormalizeQuoteStripOffset;
          const off = normalize?.(offset) || { x: 0, y: 0 };
          const x = Math.round((off.x || 0) * 100);
          const y = Math.round((off.y || 0) * 100);
          return x || y ? ` clipping ${x >= 0 ? '+' : ''}${x}/${y >= 0 ? '+' : ''}${y}%` : '';
        };
        const deviceLine = `Device: Story ${storyTweak.preset}${fmtNudge(storyTweak)}${fmtQuiltZoom(storyQuiltZoom)}${fmtQuiltOffset(storyQuiltOffsetY)}${fmtStripOffset(storyStripOffset)}, ${fmtKw(storyKw)}, ${fmtStrip(storyStrip)} · Post ${postTweak.preset}${fmtNudge(postTweak)}${fmtQuiltZoom(postQuiltZoom)}${fmtQuiltOffset(postQuiltOffsetY)}${fmtStripOffset(postStripOffset)}, ${fmtKw(postKw)}, ${fmtStrip(postStrip)} · Feed${fmtClippingOffset(clippingOffset)}`;
        let serverLine = 'Server: (Firestore not ready)';
        try {
          if (window.db && window.firestore) {
            const { data, source, serverError } = await odqReadInstagramImagesDocWithFallback(dk, 18000);
            const srcTag = source === 'cache' ? ' (device cache — server slow)' : '';
            if (!data) {
              serverLine = `Server: no doc instagram-images/${dk}${srcTag}`;
            } else {
              const sk = data.layoutBKeywordEmphasisStory || data.layoutBKeywordEmphasis;
              const pk = data.layoutBKeywordEmphasisPost;
              const ss = data.layoutBSpeakerCutoutPresetStory || data.speakerCutoutPreset || 'AUTO';
              const ps = data.layoutBSpeakerCutoutPresetPost || 'AUTO';
              const snCx = odqNormalizeSpeakerNudgeComponent(data.layoutBSpeakerCutoutNudgeCxStory);
              const snCy = odqNormalizeSpeakerNudgeComponent(data.layoutBSpeakerCutoutNudgeCyStory);
              const snRot = odqNormalizeSpeakerRotateDeg(data.layoutBSpeakerCutoutNudgeRotateDegStory);
              const pnCx = odqNormalizeSpeakerNudgeComponent(data.layoutBSpeakerCutoutNudgeCxPost);
              const pnCy = odqNormalizeSpeakerNudgeComponent(data.layoutBSpeakerCutoutNudgeCyPost);
              const pnRot = odqNormalizeSpeakerRotateDeg(data.layoutBSpeakerCutoutNudgeRotateDegPost);
              const sStrip = data.layoutBStripLayoutSeedStory ?? data.layoutBStripLayoutSeed ?? 0;
              const pStrip = data.layoutBStripLayoutSeedPost ?? 0;
              const sQuiltZoom = odqNormalizeQuiltBgZoom(data.layoutBQuiltBgZoomStory);
              const pQuiltZoom = odqNormalizeQuiltBgZoom(data.layoutBQuiltBgZoomPost);
              const sQuiltOffsetY = odqNormalizeQuiltBgOffsetY?.(data.layoutBQuiltBgOffsetYStory) ?? 0;
              const pQuiltOffsetY = odqNormalizeQuiltBgOffsetY?.(data.layoutBQuiltBgOffsetYPost) ?? 0;
              const sStripOffset = {
                x: data.layoutBQuoteStripOffsetXStory,
                y: data.layoutBQuoteStripOffsetYStory
              };
              const pStripOffset = {
                x: data.layoutBQuoteStripOffsetXPost,
                y: data.layoutBQuoteStripOffsetYPost
              };
              const serverClippingOffset = {
                x: data.layoutBCarouselClippingOffsetX,
                y: data.layoutBCarouselClippingOffsetY
              };
              const serverTweak = (cx, cy, rot) => {
                const bits = [];
                if (cx || cy) {
                  const x = Math.round(cx * 100);
                  const y = Math.round(cy * 100);
                  bits.push(`nudge ${x >= 0 ? '+' : ''}${x}/${y >= 0 ? '+' : ''}${y}%`);
                }
                if (rot) {
                  const r = Math.round(rot * 10) / 10;
                  bits.push(`rot ${r > 0 ? '+' : ''}${r}°`);
                }
                return bits.length ? ` ${bits.join(' ')}` : '';
              };
              serverLine = `Server instagram-images/${dk}${srcTag}: Story ${ss}${serverTweak(snCx, snCy, snRot)}${fmtQuiltZoom(sQuiltZoom)}${fmtQuiltOffset(sQuiltOffsetY)}${fmtStripOffset(sStripOffset)}, ${fmtKw(sk)}, ${fmtStrip(sStrip)} · Post ${ps}${serverTweak(pnCx, pnCy, pnRot)}${fmtQuiltZoom(pQuiltZoom)}${fmtQuiltOffset(pQuiltOffsetY)}${fmtStripOffset(pStripOffset)}, ${fmtKw(pk)}, ${fmtStrip(pStrip)} · Feed${fmtClippingOffset(serverClippingOffset)}`;
              if (serverError) {
                serverLine += ` · server read: ${String(serverError).slice(0, 48)}`;
              }
            }
          }
        } catch (err) {
          serverLine = `Server: ${String(err?.message || err).slice(0, 80)}`;
        }
        let debugLine = '';
        try {
          const ring = JSON.parse(localStorage.getItem('odq.debugRing') || '[]');
          const tail = ring.slice(-4).map((e) => `${e.location}:${e.message}`.slice(0, 36));
          if (tail.length) debugLine = ` Logs: ${tail.join(' | ')}`;
        } catch (_) {
          /* ignore */
        }
        const summary = `Tune check · ${deviceLine} · ${serverLine}${debugLine}`;
        this.uiService.showToast(summary, 20000);
      }

      /**
       * Writes `instagram-images/{today}` to Firestore (classic 4:5 + layout B 4:5 when available).
       * Reel capture is currently disabled to avoid daily video storage growth.
       * Railway POST /api/generate-instagram reads this doc so Zapier can use carouselSlide1Url (or imageUrl).
       * Doc also includes `blockCount` and `contributorCount` for Zapier mapping.
       */
      async handlePushInstagramAssetsToFirestore() {
        if (this._igPushInProgress) {
          return;
        }
        this._igPushInProgress = true;
        try {
          if (!window.db || !window.firestore) {
            for (let i = 0; i < 120 && (!window.db || !window.firestore); i++) {
              await new Promise((r) => setTimeout(r, 100));
            }
          }
          if (!window.db || !window.firestore) {
            this.uiService.showToast(
              'Firestore not ready — check network, ad blocker, or refresh the page'
            );
            console.warn('pushInstagramAssetsToFirestore: window.db / window.firestore missing');
            return;
          }
          const blocks = this.quiltEngine?.blocks;
          if (!blocks || blocks.length <= 1) {
            this.uiService.showToast('Need more than one block on the quilt');
            return;
          }
          const arch = this.archiveService;
          if (!arch?.generateInstagramCarouselSlideImageData) {
            this.uiService.showToast('ArchiveService not ready');
            return;
          }
          const today = Utils.getTodayKey();
          const quiltFingerprint = Utils.computeQuiltFingerprint(blocks);
          const zapierBlockCount = blocks.length;
          const zapierContributorCount = Math.max(
            1,
            Number(this.quiltEngine?.submissionCount) || 1
          );
          let todayQuote = this.quoteService?.getTodayQuote?.() || null;
          if (this.quoteService && typeof this.quoteService.getQuoteResolvedForInstagramDateKey === 'function') {
            try {
              const resolved = await odqPromiseWithTimeout(
                this.quoteService.getQuoteResolvedForInstagramDateKey(today, { requireLive: true }),
                10000,
                'Quote for IG push'
              );
              if (resolved) todayQuote = resolved;
            } catch (quoteErr) {
              this.logger.warn('IG push: live quote resolve failed, using cached today quote', quoteErr);
            }
          }
          this.uiService.showToast('Generating and uploading Instagram assets…');
          const contributors = Array.isArray(this.dailyContributors) ? this.dailyContributors : [];
          let winningQuiltName = '';
          try {
            const nameSnap = await window.firestore.getDoc(
              window.firestore.doc(window.db, 'quiltNames', today)
            );
            if (nameSnap.exists()) {
              const nameData = nameSnap.data() || {};
              const rawWords = nameData.words;
              if (Array.isArray(rawWords) && rawWords.length > 0) {
                const winner = rawWords
                  .filter((w) => !w.eliminated && w.word)
                  .sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0))[0];
                if (winner?.word) {
                  winningQuiltName = String(winner.word).trim().toUpperCase();
                }
              }
            }
          } catch (nameErr) {
            this.logger.warn('IG push: could not fetch winning quilt name', nameErr);
          }
          const carouselOpts = { winningQuiltName };
          let carouselSlide1ImageData = null;
          let carouselSlide2ImageData = null;
          let carouselSlide3ImageData = null;
          if (arch.buildIntegratedInstagramCarouselImageData) {
            const integrated = await odqPromiseWithTimeout(
              arch.buildIntegratedInstagramCarouselImageData(blocks, contributors, todayQuote, today, carouselOpts),
              180000,
              'Integrated IG carousel generation'
            );
            carouselSlide1ImageData = integrated?.carouselSlide1 || null;
            carouselSlide2ImageData = integrated?.carouselSlide2 || null;
            carouselSlide3ImageData = integrated?.carouselSlide3 || null;
          } else {
            const quiltCarouselSlides = await odqPromiseWithTimeout(
              arch.generateInstagramCarouselSlideImageData(blocks, contributors, today, carouselOpts),
              120000,
              'IG quilt carousel slide generation'
            );
            let postLayoutBImageData = null;
            if (arch.generateInstagramPostLayoutBImage) {
              postLayoutBImageData = await odqPromiseWithTimeout(
                arch.generateInstagramPostLayoutBImage(blocks, todayQuote, today),
                120000,
                'Layout B carousel slide 1 generation'
              );
            }
            carouselSlide1ImageData = postLayoutBImageData;
            carouselSlide2ImageData = quiltCarouselSlides?.slide1 || null;
            carouselSlide3ImageData = quiltCarouselSlides?.slide2 || null;
          }
          let quiltScreen9x16ImageData = null;
          if (arch.generateInstagramQuiltScreen9x16ImageData) {
            quiltScreen9x16ImageData = await odqPromiseWithTimeout(
              arch.generateInstagramQuiltScreen9x16ImageData(blocks, today),
              90000,
              'Quilt screen 9:16 generation'
            );
          }
          let postLayoutBSpeakerImageData = null;
          if (arch.generateInstagramPostLayoutBSpeakerImage) {
            postLayoutBSpeakerImageData = await odqPromiseWithTimeout(
              arch.generateInstagramPostLayoutBSpeakerImage(blocks, todayQuote, today),
              120000,
              'Layout B speaker hero post generation'
            ).catch((err) => {
              this.logger.warn('Layout B speaker hero post skipped:', err?.message || err);
              return null;
            });
          }
          let storyLayoutBImageData = null;
          if (arch.generateInstagramStoryLayoutBImage) {
            storyLayoutBImageData = await odqPromiseWithTimeout(
              arch.generateInstagramStoryLayoutBImage(blocks, todayQuote, today),
              120000,
              'Layout B story image generation'
            );
          }
          let storyLayoutBOverlayImageData = null;
          if (arch.generateInstagramStoryLayoutBOverlayImage) {
            storyLayoutBOverlayImageData = await odqPromiseWithTimeout(
              arch.generateInstagramStoryLayoutBOverlayImage(blocks, todayQuote, today),
              120000,
              'Layout B story overlay generation'
            ).catch((err) => {
              this.logger.warn('Layout B story overlay skipped:', err?.message || err);
              return null;
            });
          }
          let contributorCloudImageData = null;
          if (arch.generateInstagramContributorCloudImage) {
            const contributors = Array.isArray(this.dailyContributors) ? this.dailyContributors : [];
            contributorCloudImageData = await odqPromiseWithTimeout(
              arch.generateInstagramContributorCloudImage(blocks, contributors, today),
              90000,
              'Contributor cloud IG image generation'
            ).catch((err) => {
              this.logger.warn('Contributor cloud post skipped:', err?.message || err);
              return null;
            });
          }
          const layoutBAliasesSpeaker = false;
          if (
            !carouselSlide1ImageData &&
            !carouselSlide2ImageData &&
            !carouselSlide3ImageData &&
            !storyLayoutBImageData &&
            !storyLayoutBOverlayImageData &&
            !quiltScreen9x16ImageData
          ) {
            this.uiService.showToast('Failed to generate images');
            return;
          }
          let exportDebug = arch._igQuiltSourceExportMeta
            ? { quiltScreen9x16: { ...arch._igQuiltSourceExportMeta } }
            : null;
          let debugRawQuiltImage = null;
          const skipDebugCapture =
            typeof odqIsCapacitorNative === 'function' && odqIsCapacitorNative();
          if (!skipDebugCapture) {
            try {
              await odqPromiseWithTimeout(
                (async () => {
                  const quiltSVG = typeof document !== 'undefined' ? document.getElementById('quilt') : null;
                  const debugBlob = quiltSVG
                    ? await arch.rasterizeVisibleQuiltSvgToPngBlob(quiltSVG, blocks)
                    : null;
                  exportDebug = {
                    ...(exportDebug || {}),
                    ...(arch.lastQuiltExportDebug
                      ? { dedicatedZapierDebug: { ...arch.lastQuiltExportDebug, diagnosticSource: 'dedicated_zapier_debug_export' } }
                      : {})
                  };
                  debugRawQuiltImage = debugBlob ? await Utils.blobToDataUrl(debugBlob) : null;
                })(),
                12000,
                'Debug quilt capture'
              );
            } catch (debugErr) {
              console.warn('Zapier export debug capture failed:', debugErr);
            }
          }

          let docPayload = null;
          const uploadPayload = {
            dateKey: today,
            carouselSlide1ImageData,
            carouselSlide2ImageData,
            carouselSlide3ImageData,
            quiltScreen9x16ImageData,
            postLayoutBSpeakerImageData,
            storyLayoutBImageData,
            storyLayoutBOverlayImageData,
            contributorCloudImageData,
            aliasLayoutBSpeakerUrl: layoutBAliasesSpeaker,
            zapierCaption: Utils.formatZapierCaptionFromQuote(todayQuote),
            quiltFingerprint,
            exportDebug,
            debugRawQuiltImage,
            blockCount: zapierBlockCount,
            contributorCount: zapierContributorCount
          };
          try {
            docPayload = await odqPromiseWithTimeout(
              Utils.writeInstagramImagesDocForZapier(uploadPayload),
              180000,
              'Firestore + Storage upload'
            );
          } catch (clientUploadErr) {
            this.logger.warn('IG push: client upload failed, trying backend', clientUploadErr);
            docPayload = await odqPromiseWithTimeout(
              Utils.writeInstagramImagesDocForZapierViaServer(uploadPayload),
              180000,
              'Backend IG upload'
            );
          }

          const zapierReelCaptureEnabled = false;
          const reelLockedSkip = true;
          let reelWebmBlob = null;
          let transcodedMp4 = false;
          if (zapierReelCaptureEnabled && !reelLockedSkip) {
            this.uiService.showToast('Recording reel for Zapier (~8s, keep tab focused)…');
            await Utils.enqueueZapierReelCapture(async () => {
              if (await Utils.shouldSkipZapierReelCapture(today)) return;
              if (typeof MediaRecorder === 'undefined') return;
              try {
                const qt =
                  todayQuote ||
                  this.quoteService?.getTodayQuote?.() ||
                  { text: '', body: '', author: '' };
                const { blob } = await this._buildSyntheticQuiltReelWebm(blocks, {
                  width: 1080,
                  height: 1920,
                  durationSec: 8,
                  fps: 30,
                  bg: '#f6f4f1',
                  quoteText: String(qt.text ?? qt.body ?? '').trim(),
                  quoteAuthor: String(qt.author ?? '').trim(),
                  dateKey: today
                });
                if (blob && blob.size > 200) {
                  reelWebmBlob = blob;
                }
              } catch (reelErr) {
                console.warn('Reel generation for Zapier skipped:', reelErr);
              }
              if (!reelWebmBlob) return;
              this.uiService.showToast('Converting reel to MP4 for Instagram…');
              await Utils.writeInstagramImagesDocForZapier({
                dateKey: today,
                instagramImage: null,
                postLayoutBImageData: null,
                reelWebmBlob,
                zapierCaption: Utils.formatZapierCaptionFromQuote(
                  todayQuote || this.quoteService?.getTodayQuote?.()
                ),
                quiltFingerprint,
                blockCount: zapierBlockCount,
                contributorCount: zapierContributorCount
              });
              Utils.markSyncedZapierReelForDate(today);
              const baseUrl =
                typeof CONFIG !== 'undefined' && CONFIG.BACKEND && CONFIG.BACKEND.baseUrl
                  ? String(CONFIG.BACKEND.baseUrl).replace(/\/$/, '')
                  : '';
              if (baseUrl) {
                try {
                  const tr = await fetch(`${baseUrl}/api/transcode-instagram-reel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: today })
                  });
                  const trJson = await tr.json().catch(() => ({}));
                  if (tr.ok && trJson.success && trJson.reelMp4Url) {
                    transcodedMp4 = true;
                  } else if (!tr.ok) {
                    console.warn('transcode-instagram-reel:', tr.status, trJson);
                  }
                } catch (e) {
                  console.warn('transcode-instagram-reel fetch failed:', e);
                }
              }
            });
          }

          const parts = [
            instagramImage ? 'classic' : null,
            postLayoutBImageData ? 'layout B' : null,
            layoutBAliasesSpeaker ? 'layout B speaker' : null,
            reelWebmBlob ? 'reel WebM' : null,
            transcodedMp4 ? 'reel MP4' : null
          ].filter(Boolean);
          const reelNote =
            !zapierReelCaptureEnabled
              ? ' — reel capture disabled'
              : reelLockedSkip && !reelWebmBlob
                ? ' — reel already captured today (images updated)'
              : '';
          this.uiService.showToast(
            `Saved instagram-images/${today} (${parts.join(' + ') || 'images'}) via Storage${reelNote}`
          );
          void this.markAdminDailyTaskCompleted?.('igPost', { source: 'instagram_assets_push' });
          this.logger.log('Instagram assets pushed to Firestore for Zapier', {
            docPath: `instagram-images/${today}`,
            hasClassic: !!instagramImage,
            hasPostLayoutB: !!postLayoutBImageData,
            hasPostLayoutBSpeaker: layoutBAliasesSpeaker,
            hasReelWebm: !!reelWebmBlob,
            transcodedMp4,
            reelCaptureEnabled: zapierReelCaptureEnabled,
            reelSkipBecauseAlreadyToday: zapierReelCaptureEnabled && reelLockedSkip && !reelWebmBlob,
            storage: {
              imageStorageUrl: !!docPayload.imageStorageUrl,
              postLayoutBImageStorageUrl: !!docPayload.postLayoutBImageStorageUrl,
              postLayoutBSpeakerImageStorageUrl: !!docPayload.postLayoutBSpeakerImageStorageUrl,
              reelWebmStorageUrl: !!(docPayload.reelWebmStorageUrl || reelWebmBlob)
            }
          });
        } catch (error) {
          this.errorHandler.handleError(error, 'pushInstagramAssetsToFirestore');
          const code = error && error.code;
          let msg = error?.message || 'Firestore upload failed';
          if (code === 'permission-denied') {
            msg = 'Firestore permission denied — security rules must allow writes to instagram-images';
          } else if (code === 'storage/unauthorized') {
            msg =
              'Firebase Storage blocked the upload — allow writes to instagram-zapier/ in Storage rules';
          } else if (
            /invalid|size|too large|exceed/i.test(msg) ||
            code === 'invalid-argument'
          ) {
            msg = 'Document too large for Firestore (max ~1 MB) or invalid data';
          }
          console.error('pushInstagramAssetsToFirestore', code, error);
          this.uiService.showToast(msg);
        } finally {
          this._igPushInProgress = false;
        }
      }
      _prefersSimpleQuiltSpotlight() {
        return (
          document.documentElement.classList.contains('odq-capacitor-native') ||
          window.matchMedia?.('(max-width: 768px)')?.matches === true
        );
      }

      _ensureQuiltHtmlDim() {
        const container = document.querySelector('#screen-quilt .quilt-container');
        if (!container) return null;
        let dim = document.getElementById('quiltHtmlSpotlightDim');
        if (!dim) {
          dim = document.createElement('div');
          dim.id = 'quiltHtmlSpotlightDim';
          dim.setAttribute('aria-hidden', 'true');
          container.appendChild(dim);
        }
        return dim;
      }

      _ensureQuiltSpotlightDimRect(svg = document.getElementById('quilt')) {
        if (!svg) return null;
        const overlay = this._ensureQuiltSpotlightOverlay(svg);
        if (!overlay) return null;
        const NS = 'http://www.w3.org/2000/svg';
        let dim = overlay.querySelector('#quiltSpotlightDim');
        if (!dim) {
          dim = document.createElementNS(NS, 'rect');
          dim.setAttribute('id', 'quiltSpotlightDim');
          dim.setAttribute('fill', '#000000');
          dim.setAttribute('fill-opacity', '0');
          dim.setAttribute('opacity', '0');
          dim.setAttribute('pointer-events', 'none');
          overlay.insertBefore(dim, overlay.firstChild);
        }

        let x = 0;
        let y = 0;
        let width = 0;
        let height = 0;
        try {
          const viewBox = svg.viewBox.baseVal;
          x = viewBox.x;
          y = viewBox.y;
          width = viewBox.width;
          height = viewBox.height;
        } catch (_) {
          /* ignore */
        }
        if (!(width > 0 && height > 0)) {
          const parts = String(svg.getAttribute('viewBox') || '')
            .trim()
            .split(/\s+/)
            .map(Number);
          if (parts.length === 4 && parts.every((part) => Number.isFinite(part))) {
            [x, y, width, height] = parts;
          }
        }
        if (width > 0 && height > 0) {
          dim.setAttribute('x', String(x));
          dim.setAttribute('y', String(y));
          dim.setAttribute('width', String(width));
          dim.setAttribute('height', String(height));
        } else {
          const fallbackW = Math.max(1, svg.clientWidth || 0);
          const fallbackH = Math.max(1, svg.clientHeight || 0);
          dim.setAttribute('x', '0');
          dim.setAttribute('y', '0');
          dim.setAttribute('width', String(fallbackW));
          dim.setAttribute('height', String(fallbackH));
        }
        return dim;
      }

      _setQuiltHtmlDimActive(active, fadeMs = 500, options = {}) {
        const dim = this._ensureQuiltHtmlDim();
        if (!dim) return;
        const delayMs = Math.max(0, Number(options.handoffDelayMs) || 0);
        dim.style.setProperty('--quilt-spotlight-dim-duration', `${Math.max(0, Number(fadeMs) || 0)}ms`);
        dim.style.setProperty('--quilt-spotlight-dim-delay', `${delayMs}ms`);
        dim.classList.toggle('is-instant', fadeMs <= 0);
        dim.classList.toggle('is-lighten', !!active && !!this._myBlockSpotlightLightenDim);
        if (active && fadeMs > 0) {
          dim.style.removeProperty('opacity');
          dim.classList.add('is-active');
          return;
        }
        dim.classList.toggle('is-active', !!active);
        dim.style.opacity = active ? '1' : '0';
      }

      _setQuiltSpotlightDimActive(active, fadeMs = 500, options = {}) {
        const svg = document.getElementById('quilt');
        if (!svg) return;
        const dim = svg.querySelector('#quiltSpotlightDim');
        const alreadyActive =
          svg.classList.contains('quilt-spotlight-active') ||
          document.getElementById('quiltHtmlSpotlightDim')?.classList.contains('is-active');
        if (!active && !alreadyActive && !dim) {
          this._setQuiltHtmlDimActive(false, fadeMs, options);
          return;
        }

        const dimEl = dim || this._ensureQuiltSpotlightDimRect(svg);
        const lighten =
          options.lightenDim != null ? !!options.lightenDim : !!this._myBlockSpotlightLightenDim;
        const delayMs = Math.max(0, Number(options.handoffDelayMs) || 0);
        const fadeIn = !!active && fadeMs > 0;
        svg.style.setProperty('--quilt-spotlight-dim-duration', `${Math.max(0, Number(fadeMs) || 0)}ms`);
        svg.style.setProperty('--quilt-spotlight-dim-delay', `${delayMs}ms`);
        svg.classList.toggle('quilt-spotlight-dim-instant', fadeMs <= 0);
        svg.classList.toggle('quilt-spotlight-lighten', !!active && lighten);

        const targetOpacity = active ? '1' : '0';
        const targetFillOpacity = active ? (lighten ? '0.44' : '0.36') : '0';
        if (dimEl) {
          dimEl.setAttribute('fill', lighten ? '#ffffff' : '#000000');
          if (fadeIn) {
            dimEl.style.removeProperty('opacity');
            dimEl.style.removeProperty('fill-opacity');
            dimEl.removeAttribute('opacity');
            dimEl.removeAttribute('fill-opacity');
          } else {
            dimEl.style.opacity = targetOpacity;
            dimEl.style.fillOpacity = targetFillOpacity;
            dimEl.setAttribute('opacity', targetOpacity);
            dimEl.setAttribute('fill-opacity', targetFillOpacity);
          }
        }

        const useHtmlDim =
          options.useHtmlDim === true ||
          (options.useHtmlDim !== false &&
            !!active &&
            this._prefersSimpleQuiltSpotlight() &&
            this._myBlockSpotlightUseHtmlDim === true);

        const applyActive = () => {
          svg.classList.toggle('quilt-spotlight-active', !!active);
          if (useHtmlDim || !active) {
            this._setQuiltHtmlDimActive(active, fadeMs, options);
          }
        };

        if (fadeIn) {
          svg.classList.remove('quilt-spotlight-active');
          if (useHtmlDim) {
            this._setQuiltHtmlDimActive(false, 0, options);
          }
          requestAnimationFrame(() => {
            requestAnimationFrame(applyActive);
          });
          return;
        }

        applyActive();
      }

      _clearMyBlockSpotlightTimers() {
        if (this._myBlockSpotlightHoldTimer) {
          clearTimeout(this._myBlockSpotlightHoldTimer);
          this._myBlockSpotlightHoldTimer = null;
        }
        if (this._myBlockSpotlightFadeTimer) {
          clearTimeout(this._myBlockSpotlightFadeTimer);
          this._myBlockSpotlightFadeTimer = null;
        }
      }

      _finishMyBlockSpotlight() {
        const pending = this._myBlockSpotlightRestore;
        const hadTimers = !!(this._myBlockSpotlightHoldTimer || this._myBlockSpotlightFadeTimer);
        const svg = document.getElementById('quilt');
        const dimActive = svg?.classList.contains('quilt-spotlight-active');
        if (!pending?.group && !hadTimers && !dimActive) {
          return;
        }

        this._clearMyBlockSpotlightTimers();
        const fadeMs = this._myBlockSpotlightFadeMs || 0;
        this._setQuiltSpotlightDimActive(false, fadeMs);
        this._setQuiltHtmlDimActive(false, 0);
        this._myBlockSpotlightFadeMs = 0;
        this._myBlockSpotlightUseHtmlDim = false;
        this._myBlockSpotlightLightenDim = false;
        this._myBlockSpotlightRestore = null;
        if (pending?.group) {
          pending.group.classList.remove('quilt-my-block-spotlight', 'quilt-my-block-spotlight-in-place');
          pending.clone?.classList?.remove?.('quilt-my-block-spotlight', 'quilt-my-block-spotlight-in-place');
          if (pending.mode === 'clone') {
            pending.clone?.remove();
            if (pending.state?.prevOpacity != null) {
              pending.group.setAttribute('opacity', pending.state.prevOpacity);
            } else {
              pending.group.removeAttribute('opacity');
            }
          } else if (pending.mode === 'in-place') {
            /* class removed above */
          } else if (pending.synthetic) {
            pending.group.remove();
          } else {
            this._restoreFromSpotlightOverlay(pending.group, pending.state);
          }
        }

        const overlay = svg?.querySelector('#quiltSpotlightOverlay');
        if (overlay) {
          overlay.querySelectorAll(':scope > g:not(#quiltSpotlightDim)').forEach((node) => {
            if (node !== pending?.group && node !== pending?.clone) node.remove();
          });
        }
        svg?.classList.remove('quilt-spotlight-active', 'quilt-spotlight-dim-instant', 'quilt-spotlight-lighten');
      }

      _escapeBlockIdForSelector(blockId) {
        const id = String(blockId ?? '');
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
          return CSS.escape(id);
        }
        return id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      }

      _getPrimaryQuiltMarkerRoot() {
        const root = document.getElementById('quilt');
        if (!root) return null;
        const primaryParallax = root.querySelector('#quiltPrimaryBand #quiltParallaxLayer');
        if (primaryParallax) return primaryParallax;
        const fieldParallax = root.querySelector('#quiltFieldLayer > #quiltParallaxLayer');
        if (fieldParallax) return fieldParallax;
        const anyParallax = root.querySelector('#quiltParallaxLayer');
        if (anyParallax && !anyParallax.closest('#quiltMirrorBand')) return anyParallax;
        if (!this._isSplitBandQuilt()) return root;
        return root.querySelector('#quiltPrimaryBand') || null;
      }

      _isSplitBandQuilt() {
        const root = document.getElementById('quilt');
        return root?.getAttribute('data-quilt-split-band') === '1';
      }

      _isMirroredQuiltMarker(node) {
        if (!node || typeof node.closest !== 'function') return false;
        return !!(
          node.closest('#quiltMirrorBand') ||
          node.closest('#quiltMirroredFieldLayer') ||
          node.closest('#quiltMirrorBandClipGroup') ||
          node.closest('#quiltDuplicateBottomLayer1') ||
          node.closest('#quiltDuplicateBottomLayer2') ||
          node.closest('[data-duplicate-no-mirror]') ||
          node.closest('[data-duplicate-flip-y]') ||
          node.closest('[data-duplicate-flip-x]') ||
          node.closest('[data-duplicate-fit-bottom]') ||
          node.closest('[data-quadrant-tr]') ||
          node.closest('[data-quadrant-bl]') ||
          node.closest('[data-quadrant-br]')
        );
      }

      _isPrimaryQuiltMarker(node) {
        if (!node || this._isMirroredQuiltMarker(node)) return false;
        if (!this._isSplitBandQuilt()) return true;
        return !!node.closest('#quiltPrimaryBand');
      }

      _markerScreenCenter(node) {
        if (!node || typeof node.getBoundingClientRect !== 'function') {
          return { x: NaN, y: NaN };
        }
        try {
          const rect = node.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        } catch (_) {
          return { x: NaN, y: NaN };
        }
      }

      _isMarkerInPrimaryScreenHalf(node) {
        if (!node || !this._isSplitBandQuilt()) return true;
        const svg = document.getElementById('quilt');
        if (!svg) return true;
        const quiltRect = svg.getBoundingClientRect();
        if (!quiltRect.height) return true;
        const center = this._markerScreenCenter(node);
        if (!Number.isFinite(center.y)) return true;
        return center.y <= quiltRect.top + quiltRect.height * 0.54;
      }

      _pickTopPrimaryScreenMarker(markers = []) {
        const pool = (markers || []).filter((node) => this._isPrimaryQuiltMarker(node));
        if (!pool.length) return null;
        let candidates = pool;
        if (this._isSplitBandQuilt()) {
          const topHalf = pool.filter((node) => this._isMarkerInPrimaryScreenHalf(node));
          if (topHalf.length) candidates = topHalf;
        }
        candidates.sort((a, b) => this._markerScreenCenter(a).y - this._markerScreenCenter(b).y);
        return candidates[0] || null;
      }

      findQuiltBlockMarker(blockId) {
        const id = String(blockId ?? '').trim();
        if (!id) return null;
        const root = document.getElementById('quilt');
        if (!root) return null;
        const searchRoot = root.querySelector('#quiltPrimaryBand') || this._getPrimaryQuiltMarkerRoot() || root;
        const candidates = [];
        for (const el of searchRoot.querySelectorAll('[data-block-id]')) {
          if (!this._isPrimaryQuiltMarker(el)) continue;
          const markerId = String(el.getAttribute('data-block-id') || '').trim();
          if (markerId === id || this._spotlightBlockIdsRelated(markerId, id)) candidates.push(el);
        }
        return this._pickTopPrimaryScreenMarker(candidates);
      }

      _spotlightNormalizeColor(color) {
        const raw = String(color || '').trim();
        if (!raw) return '';
        if (Utils.validateHexColor(raw)) return raw.toLowerCase();
        const rgbMatch = raw.match(/^rgba?\(([^)]+)\)$/i);
        if (!rgbMatch) return raw.toLowerCase();
        const parts = rgbMatch[1].split(',').map((part) => Number(String(part).trim()));
        if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return raw.toLowerCase();
        const hex = (channel) =>
          Math.min(255, Math.max(0, Math.round(channel)))
            .toString(16)
            .padStart(2, '0');
        return `#${hex(parts[0])}${hex(parts[1])}${hex(parts[2])}`;
      }

      _spotlightRelativeLuminance(color) {
        const hex = this._spotlightNormalizeColor(color);
        if (!Utils.validateHexColor(hex)) return 1;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      }

      /** Dark blocks disappear under a black dim — wash the quilt lighter instead. */
      _spotlightPrefersLightenDim(color) {
        return this._spotlightRelativeLuminance(color) <= 0.38;
      }

      _spotlightBlockColor(block, submissionColor = '') {
        if (!block) return this._spotlightNormalizeColor(submissionColor);
        const saved = Utils.validateHexColor(block.contributorColor) ? String(block.contributorColor).trim() : '';
        const onQuilt = Utils.validateHexColor(block.color) ? String(block.color).trim() : '';
        const display =
          typeof SimpleQuiltEngine?.displayColorForBlock === 'function'
            ? SimpleQuiltEngine.displayColorForBlock(block)
            : '';
        return this._spotlightNormalizeColor(saved || onQuilt || display || submissionColor);
      }

      _spotlightBlockIdsRelated(a, b) {
        const left = String(a || '').trim();
        const right = String(b || '').trim();
        if (!left || !right) return false;
        if (left === right) return true;
        return left.startsWith(`${right}_`) || right.startsWith(`${left}_`);
      }

      _listQuiltBlockMarkers() {
        const scope = this._getPrimaryQuiltMarkerRoot();
        if (!scope) return [];
        return Array.from(scope.querySelectorAll('[data-block-id]')).filter((node) =>
          this._isPrimaryQuiltMarker(node)
        );
      }

      _groupFromSpotlightMarker(marker) {
        if (!marker) return null;
        const group =
          (typeof marker.closest === 'function' && marker.closest('.quilt-parallax-block')) ||
          marker.parentElement;
        if (!group || String(group.tagName).toLowerCase() !== 'g') return null;
        return group;
      }

      _findEngineBlockForSpotlight(blockId, submission = null) {
        const blocks = Array.isArray(this.quiltEngine?.blocks) ? this.quiltEngine.blocks : [];
        const targetId = String(blockId || '').trim();
        if (targetId) {
          const exact = blocks.find((block) => String(block?.id || '').trim() === targetId);
          if (exact) return exact;
          const related = blocks.find((block) => this._spotlightBlockIdsRelated(block?.id, targetId));
          if (related) return related;
        }
        const data = this.getExitChamberTodayPieceData?.();
        if (data?.block) return data.block;
        const submissionColor = this._spotlightNormalizeColor(submission?.color || data?.color || '');
        const ids = this._devicePersonalColorUserIds();
        const belongs = (block) => this._todayPieceBelongsToDevice(block, ids);
        if (submissionColor) {
          const byColor = blocks
            .filter((block) => {
              if (!block) return false;
              if (belongs(block)) return true;
              return this._spotlightBlockColor(block, submissionColor) === submissionColor;
            })
            .sort((a, b) => (Number(a.submissionIndex) || 0) - (Number(b.submissionIndex) || 0));
          if (byColor.length) return byColor[byColor.length - 1];
        }
        const mine = blocks
          .filter(belongs)
          .sort((a, b) => (Number(a.submissionIndex) || 0) - (Number(b.submissionIndex) || 0));
        return mine.length ? mine[mine.length - 1] : null;
      }

      _findRenderedMarkerForBlock(block, submissionColor = '') {
        if (!block) return null;
        const blockId = String(block.id || '').trim();
        const direct = this.findQuiltBlockMarker(blockId);
        if (direct) return direct;

        const targetColor = this._spotlightBlockColor(block, submissionColor);
        const ids = this._devicePersonalColorUserIds();
        const belongs = (entry) => this._todayPieceBelongsToDevice(entry, ids);
        const blockById = new Map(
          (this.quiltEngine?.blocks || []).map((entry) => [String(entry?.id || '').trim(), entry])
        );

        const relatedMarkers = [];
        for (const marker of this._listQuiltBlockMarkers()) {
          const markerId = String(marker.getAttribute('data-block-id') || '').trim();
          if (!markerId) continue;
          if (this._spotlightBlockIdsRelated(markerId, blockId)) {
            relatedMarkers.push(marker);
            continue;
          }
          const engineBlock = blockById.get(markerId);
          if (!engineBlock) continue;
          if (engineBlock === block || belongs(engineBlock)) {
            relatedMarkers.push(marker);
            continue;
          }
          if (targetColor && this._spotlightBlockColor(engineBlock, submissionColor) === targetColor) {
            relatedMarkers.push(marker);
          }
        }
        const relatedPick = this._pickTopPrimaryScreenMarker(relatedMarkers);
        if (relatedPick) return relatedPick;

        if (targetColor) {
          const colorMatches = this._listQuiltBlockMarkers().filter(
            (marker) => this._spotlightNormalizeColor(marker.getAttribute('fill')) === targetColor
          );
          return this._pickTopPrimaryScreenMarker(colorMatches);
        }
        return null;
      }

      _ensureQuiltSpotlightOverlay(svg = document.getElementById('quilt')) {
        if (!svg) return null;
        const NS = 'http://www.w3.org/2000/svg';
        let overlay = svg.querySelector('#quiltSpotlightOverlay');
        if (!overlay) {
          overlay = document.createElementNS(NS, 'g');
          overlay.setAttribute('id', 'quiltSpotlightOverlay');
          overlay.setAttribute('pointer-events', 'none');
          svg.appendChild(overlay);
        } else if (overlay.parentNode === svg) {
          svg.appendChild(overlay);
        }
        return overlay;
      }

      _domMatrixFromSvgMatrix(matrix) {
        if (!matrix) return null;
        try {
          return new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);
        } catch (_) {
          return null;
        }
      }

      _applySpotlightOverlayMatrix(node, overlay, worldMatrix) {
        if (!node || !overlay || !worldMatrix) return false;
        try {
          const svg = overlay.ownerSVGElement || document.getElementById('quilt');
          svg?.getBoundingClientRect?.();
          const overlayMatrix = overlay.getScreenCTM?.() || overlay.getCTM?.() || null;
          if (!overlayMatrix) return false;
          const localDom = this._domMatrixFromSvgMatrix(overlayMatrix);
          const worldDom = this._domMatrixFromSvgMatrix(worldMatrix);
          if (localDom && worldDom) {
            localDom.invertSelf();
            localDom.multiplySelf(worldDom);
            node.setAttribute(
              'transform',
              `matrix(${localDom.a} ${localDom.b} ${localDom.c} ${localDom.d} ${localDom.e} ${localDom.f})`
            );
            return true;
          }
          if (overlayMatrix.inverse && overlayMatrix.multiply) {
            const local = overlayMatrix.inverse().multiply(worldMatrix);
            node.setAttribute(
              'transform',
              `matrix(${local.a} ${local.b} ${local.c} ${local.d} ${local.e} ${local.f})`
            );
            return true;
          }
        } catch (_) {
          /* ignore */
        }
        return false;
      }

      _reparentToSpotlightOverlay(group) {
        const svg = group?.ownerSVGElement || document.getElementById('quilt');
        const overlay = this._ensureQuiltSpotlightOverlay(svg);
        if (!svg || !overlay || !group) return null;

        let worldMatrix = null;
        try {
          worldMatrix = group.getScreenCTM?.() || group.getCTM?.() || null;
        } catch (_) {
          worldMatrix = null;
        }
        const state = {
          mode: 'overlay',
          parent: group.parentNode,
          nextSibling: group.nextSibling,
          transform: group.getAttribute('transform') || '',
          baseTransform: group.dataset.baseTransform || ''
        };

        overlay.appendChild(group);
        if (this._applySpotlightOverlayMatrix(group, overlay, worldMatrix)) {
          state.localMatrix = true;
        }

        return state;
      }

      _prepareSpotlightCloneLift(group) {
        const svg = group?.ownerSVGElement || document.getElementById('quilt');
        const overlay = this._ensureQuiltSpotlightOverlay(svg);
        if (!svg || !overlay || !group) return null;

        let worldMatrix = null;
        try {
          worldMatrix = group.getScreenCTM?.() || group.getCTM?.() || null;
        } catch (_) {
          worldMatrix = null;
        }
        if (!worldMatrix) return null;

        const clone = group.cloneNode(true);
        clone.classList.add('quilt-my-block-spotlight-clone');
        clone.removeAttribute('id');
        overlay.appendChild(clone);
        if (!this._applySpotlightOverlayMatrix(clone, overlay, worldMatrix)) {
          clone.remove();
          return null;
        }

        const prevOpacity = group.getAttribute('opacity');
        group.setAttribute('opacity', '0');
        return {
          mode: 'clone',
          group,
          clone,
          state: { prevOpacity }
        };
      }

      async _prepareSpotlightBlockLift(group, synthetic = false) {
        return new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const reparentState = this._reparentToSpotlightOverlay(group);
              if (reparentState?.localMatrix) {
                resolve({ mode: 'overlay', group, state: reparentState, synthetic });
                return;
              }
              if (reparentState) {
                this._restoreFromSpotlightOverlay(group, reparentState);
              }

              const cloneLift = this._prepareSpotlightCloneLift(group);
              if (cloneLift) {
                resolve({ ...cloneLift, synthetic });
                return;
              }

              group.classList.add('quilt-my-block-spotlight-in-place');
              resolve({ mode: 'in-place', group, state: {}, synthetic });
            });
          });
        });
      }

      _restoreFromSpotlightOverlay(group, state) {
        if (!group || !state?.parent) return;
        try {
          if (state.nextSibling && state.nextSibling.parentNode === state.parent) {
            state.parent.insertBefore(group, state.nextSibling);
          } else {
            state.parent.appendChild(group);
          }
        } catch (_) {
          try {
            state.parent.appendChild(group);
          } catch (_) {
            /* ignore */
          }
        }
        const nextTransform = state.baseTransform || state.transform;
        if (nextTransform) group.setAttribute('transform', nextTransform);
        else group.removeAttribute('transform');
      }

      _createSyntheticSpotlightTarget(block, submissionColor = '') {
        const svg = document.getElementById('quilt');
        if (!svg || !block) return null;
        const layer = this._getPrimaryQuiltMarkerRoot() || svg.querySelector('#quiltParallaxLayer') || svg;
        const NS = 'http://www.w3.org/2000/svg';
        const group = document.createElementNS(NS, 'g');
        group.classList.add('quilt-parallax-block', 'quilt-my-block-spotlight-synthetic');
        group.setAttribute('data-spotlight-synthetic', '1');
        if (block.id != null) group.setAttribute('data-block-id', String(block.id));

        const x = Number(block.x) || 0;
        const y = Number(block.y) || 0;
        const width = Math.max(1, Number(block.width) || 1);
        const height = Math.max(1, Number(block.height) || 1);
        group.dataset.parallaxMinSide = String(Math.min(width, height));
        if (block.macroRegionId != null) {
          const regionPhase = Number(block.macroRegionId);
          group.dataset.parallaxPhase = String(
            Number.isFinite(regionPhase) && regionPhase > 0 ? regionPhase : 0
          );
          group.dataset.macroRegionId = String(block.macroRegionId);
        }
        const marker = document.createElementNS(NS, 'rect');
        marker.setAttribute('x', String(x));
        marker.setAttribute('y', String(y));
        marker.setAttribute('width', String(width));
        marker.setAttribute('height', String(height));
        marker.setAttribute('fill', this._spotlightBlockColor(block, submissionColor) || '#df9368');
        marker.setAttribute('opacity', '0.72');
        marker.setAttribute('stroke', 'none');
        marker.setAttribute('pointer-events', 'none');
        if (block.id != null) marker.setAttribute('data-block-id', String(block.id));
        group.appendChild(marker);
        layer.appendChild(group);
        return { marker, group, block, blockId: String(block.id || ''), synthetic: true };
      }

      async _resolveMySpotlightTarget(options = {}) {
        const rerender = options.rerender !== false;
        const pieceData = this.getExitChamberTodayPieceData?.() || null;
        const submission = pieceData?.submission || this.getDevicePersonalColorSubmissionForDate?.() || null;
        const submissionColor = pieceData?.color || submission?.color || '';
        let block =
          pieceData?.block ||
          this._findEngineBlockForSpotlight(submission?.blockId, submission) ||
          null;

        const buildTarget = (buildOptions = {}) => {
          const allowSynthetic = buildOptions.allowSynthetic === true;
          if (block) {
            const marker = this._findRenderedMarkerForBlock(block, submissionColor);
            if (marker) {
              const group = this._groupFromSpotlightMarker(marker);
              if (group) {
                return {
                  marker,
                  group,
                  block,
                  blockId: String(block.id || marker.getAttribute('data-block-id') || ''),
                  synthetic: false
                };
              }
            }
            if (allowSynthetic) {
              return this._createSyntheticSpotlightTarget(block, submissionColor);
            }
            return null;
          }

          const colorMarker = submissionColor
            ? this._pickTopPrimaryScreenMarker(
                this._listQuiltBlockMarkers().filter(
                  (marker) =>
                    this._spotlightNormalizeColor(marker.getAttribute('fill')) ===
                    this._spotlightNormalizeColor(submissionColor)
                )
              )
            : null;
          if (colorMarker) {
            const group = this._groupFromSpotlightMarker(colorMarker);
            if (group) {
              return {
                marker: colorMarker,
                group,
                block,
                blockId: String(colorMarker.getAttribute('data-block-id') || block?.id || ''),
                synthetic: false
              };
            }
          }
          return null;
        };

        let target = buildTarget({ allowSynthetic: false });
        if (target || !rerender) {
          if (target) return target;
          if (block) return this._createSyntheticSpotlightTarget(block, submissionColor);
          return null;
        }

        await this.renderQuilt?.();
        if (!block) {
          block = this._findEngineBlockForSpotlight(submission?.blockId, submission);
        }
        target = buildTarget({ allowSynthetic: false });
        if (target) return target;
        if (block) return this._createSyntheticSpotlightTarget(block, submissionColor);
        return null;
      }

      findQuiltBlockGroup(blockId) {
        const marker = this.findQuiltBlockMarker(blockId);
        if (!marker) return null;
        const group = this._groupFromSpotlightMarker(marker);
        if (!group) return null;
        return { marker, group };
      }

      getMyBlockGroupElement() {
        const pieceData = this.getExitChamberTodayPieceData?.() || null;
        const submission = pieceData?.submission || this.getDevicePersonalColorSubmissionForDate?.() || null;
        const submissionColor = pieceData?.color || submission?.color || '';
        const block =
          pieceData?.block ||
          this._findEngineBlockForSpotlight(submission?.blockId, submission) ||
          null;
        if (block) {
          const marker = this._findRenderedMarkerForBlock(block, submissionColor);
          const group = this._groupFromSpotlightMarker(marker);
          if (group) return group;
        }
        const colorMarker = submissionColor
          ? this._pickTopPrimaryScreenMarker(
              this._listQuiltBlockMarkers().filter(
                (marker) =>
                  this._spotlightNormalizeColor(marker.getAttribute('fill')) ===
                  this._spotlightNormalizeColor(submissionColor)
              )
            )
          : null;
        return this._groupFromSpotlightMarker(colorMarker);
      }

      setMyBlockShimmerActive(active) {
        const next = !!active;
        if (this._myBlockShimmerActive === next) return;
        this._myBlockShimmerActive = next;

        const clearPrevious = () => {
          if (this._myBlockShimmerGroup) {
            this._myBlockShimmerGroup.classList.remove('quilt-my-block-shimmer');
            this._myBlockShimmerGroup = null;
          }
        };

        if (!next) {
          clearPrevious();
          return;
        }

        clearPrevious();
        const g = this.getMyBlockGroupElement();
        if (!g) return;
        g.classList.add('quilt-my-block-shimmer');
        this._myBlockShimmerGroup = g;
      }

      /** Raw dedicated-block id from memory/localStorage (no quilt/spotlight lookup). */
      _storedDedicatedBlockId() {
        let fromStorage = '';
        try {
          fromStorage = String(localStorage.getItem('ourDailyLatestDedicatedBlockId') || '').trim();
        } catch (_) {
          /* ignore */
        }
        return String(this._latestDedicatedBlockId || fromStorage || '').trim();
      }

      /** Latest block id tied to this device / app user (contributions or block contributorId). */
      getMySpotlightBlockId() {
        const pieceData = this.getExitChamberTodayPieceData?.();
        if (pieceData?.block?.id) return String(pieceData.block.id);
        const submission = pieceData?.submission || this.getDevicePersonalColorSubmissionForDate?.();
        const block = this._findEngineBlockForSpotlight(submission?.blockId, submission);
        return block?.id != null ? String(block.id) : null;
      }

      getDedicatedBlockId() {
        const latest = this._storedDedicatedBlockId();
        const blocks = Array.isArray(this.quiltEngine?.blocks) ? this.quiltEngine.blocks : [];
        if (latest && blocks.some((b) => b?.id === latest)) {
          return latest;
        }
        // Do not call getMySpotlightBlockId() here: that path goes through
        // getExitChamberTodayPieceData → _todayPieceFromDedicatedBlock → getDedicatedBlockId
        // and overflows the stack, which also aborts sat/value slider track updates.
        const submission = this.getDevicePersonalColorSubmissionForDate?.();
        const block = this._findEngineBlockForSpotlight?.(submission?.blockId, submission);
        return block?.id != null ? String(block.id) : null;
      }

      getDedicationFocusOptions(blockId) {
        const block = this.quiltEngine.blocks.find((b) => b.id === blockId);
        if (!block) return null;
        const quiltSVG = document.getElementById('quilt');
        let viewBox = null;
        const rawViewBox = (quiltSVG?.getAttribute('viewBox') || '').trim();
        if (rawViewBox) {
          const parts = rawViewBox.split(/\s+/).map(Number);
          if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
            viewBox = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
          }
        }
        if (!viewBox) {
          const blocks = this.quiltEngine.blocks || [];
          const minX = Math.min(...blocks.map((b) => b.x));
          const minY = Math.min(...blocks.map((b) => b.y));
          const maxX = Math.max(...blocks.map((b) => b.x + b.width));
          const maxY = Math.max(...blocks.map((b) => b.y + b.height));
          const padding = 20;
          viewBox = {
            x: minX - padding,
            y: minY - padding,
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2
          };
        }
        return {
          focusBlockRect: {
            x: Number(block.x),
            y: Number(block.y),
            width: Number(block.width),
            height: Number(block.height)
          },
          focusSourceViewBox: viewBox
        };
      }

      closeDedicationModal() {
        const el = document.getElementById('dedicationModal');
        if (el) el.remove();
        if (this._dedicationKeyEsc) {
          document.removeEventListener('keydown', this._dedicationKeyEsc);
          this._dedicationKeyEsc = null;
        }
      }

      showDedicationModal(blockId) {
        this.closeDedicationModal();
        const wrap = document.createElement('div');
        wrap.id = 'dedicationModal';
        wrap.className = 'dedication-modal';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-label', 'Dedicate this block');
        wrap.innerHTML = `
          <div class="dedication-modal-backdrop" data-dedication-close="1"></div>
          <form class="dedication-modal-panel" id="dedicationForm">
            <h2 class="dedication-modal-title">Dedicate this block</h2>
            <p class="dedication-modal-copy">Write a short note to bake into the image with your block.</p>
            <label class="first-name-label" for="dedicationMessageInput">Dedication message</label>
            <textarea
              id="dedicationMessageInput"
              class="dedication-message-input"
              maxlength="180"
              required
              spellcheck="true"
              placeholder="For someone who helped me see today's color."
            ></textarea>
            <div class="dedication-modal-actions">
              <button type="submit" class="btn stack-btn-like stack-btn-like--center" id="dedicationShareBtn">
                <span class="stack-btn-content"><span>Create dedication image</span></span>
              </button>
              <button type="button" class="btn stack-btn-like stack-btn-like--back" data-dedication-close="1" aria-label="Back to quilt">
                <span class="stack-btn-content">
                  <span class="stack-btn-chevron" aria-hidden="true">
                    <svg viewBox="0 0 24 24" role="img" focusable="false">
                      <path d="M15 5l-7 7 7 7"></path>
                    </svg>
                  </span>
                  <span>Back to quilt</span>
                </span>
              </button>
            </div>
            <p class="dedication-status" id="dedicationStatus" role="status" aria-live="polite"></p>
          </form>
        `;
        wrap.addEventListener('click', (e) => {
          if (e.target?.dataset?.dedicationClose === '1') this.closeDedicationModal();
        });
        const form = wrap.querySelector('#dedicationForm');
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await this.handleDedicationSubmit(blockId);
        });
        this._dedicationKeyEsc = (e) => {
          if (e.key === 'Escape') this.closeDedicationModal();
        };
        document.addEventListener('keydown', this._dedicationKeyEsc);
        document.body.appendChild(wrap);
        setTimeout(() => wrap.querySelector('#dedicationMessageInput')?.focus(), 60);
      }

      handleDedicateBlock() {
        const blockId = this.getDedicatedBlockId();
        if (!blockId) {
          this.uiService.showToast('Add your color first, then you can dedicate your block.');
          return;
        }
        this.showDedicationModal(blockId);
      }

      async handleShowMyBlock(options = {}) {
        const now = Date.now();
        if (now - (this._lastMyBlockSpotlightAt || 0) < 350) return false;
        this._lastMyBlockSpotlightAt = now;

        const pieceData = this.getExitChamberTodayPieceData?.();
        if (!pieceData?.color && !pieceData?.block && !this.getDevicePersonalColorSubmissionForDate?.()) {
          this.uiService.showToast('Add your color first — your square will show up here once you join the quilt.');
          return false;
        }

        const target = await this._resolveMySpotlightTarget({ rerender: false });
        if (!target?.group || !target?.marker) {
          this.uiService.showToast('Your square is not on the quilt right now.');
          return false;
        }

        const sourceGroup = target.group;
        const synthetic = target.synthetic === true;

        this._finishMyBlockSpotlight();

        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const defaultFadeMs = reduceMotion ? 0 : 500;
        const coachHandoffMs =
          options.fromCoach && typeof this.getBlockSpotlightCoachHandoffFadeMs === 'function'
            ? this.getBlockSpotlightCoachHandoffFadeMs()
            : null;
        const fadeMs =
          options.fadeMs != null
            ? Math.max(0, Number(options.fadeMs) || 0)
            : coachHandoffMs != null
              ? coachHandoffMs
              : defaultFadeMs;
        const holdMs = reduceMotion ? 900 : 1400;
        this._myBlockSpotlightFadeMs = fadeMs;

        if (!sourceGroup.parentNode) {
          if (synthetic) sourceGroup.remove();
          return false;
        }

        if (this._isSplitBandQuilt() && !this._isMarkerInPrimaryScreenHalf(sourceGroup)) {
          if (synthetic) sourceGroup.remove();
          this.uiService.showToast('Your square is not on the quilt right now.');
          return false;
        }

        const lift = await this._prepareSpotlightBlockLift(sourceGroup, synthetic);
        if (!lift?.group) {
          if (synthetic) sourceGroup.remove();
          return false;
        }

        const highlightNode = lift.mode === 'clone' ? lift.clone : lift.group;
        highlightNode?.classList.add('quilt-my-block-spotlight');
        if (lift.mode === 'in-place') {
          highlightNode?.classList.add('quilt-my-block-spotlight-in-place');
        }
        this._myBlockSpotlightRestore = lift;
        this._myBlockSpotlightUseHtmlDim =
          this._prefersSimpleQuiltSpotlight() && lift.mode === 'in-place';
        const submissionColor =
          pieceData?.color || pieceData?.submission?.color || this.getDevicePersonalColorSubmissionForDate?.()?.color || '';
        const blockColor =
          this._spotlightBlockColor(target.block, submissionColor) ||
          this._spotlightNormalizeColor(target.marker?.getAttribute?.('fill') || '');
        this._myBlockSpotlightLightenDim = this._spotlightPrefersLightenDim(blockColor);

        if (options.fromCoach && !options.coachFadeStarted) {
          this.fadeOutBlockSpotlightCoach?.(fadeMs);
        }
        this._setQuiltSpotlightDimActive(true, fadeMs, {
          handoffDelayMs: options.fromCoach ? 280 : 0
        });

        this._myBlockSpotlightHoldTimer = setTimeout(() => {
          this._myBlockSpotlightHoldTimer = null;
          this._setQuiltSpotlightDimActive(false, fadeMs);
          this._myBlockSpotlightFadeTimer = setTimeout(() => {
            this._myBlockSpotlightFadeTimer = null;
            this._finishMyBlockSpotlight();
          }, fadeMs);
        }, fadeMs + holdMs);
        return true;
      }

      handleShowMyPiece() {
        this.handleShowMyBlock();
      }

      isMilestoneQuiltsEnabled() {
        return CONFIG.APP.milestoneQuiltsEnabled === true;
      }

      ensureMilestoneQuiltsDisabled() {
        if (this.isMilestoneQuiltsEnabled()) return;
        document.documentElement.dataset.milestoneQuiltsDisabled = '1';
        const item = document.getElementById('settingsMilestoneQuiltsItem');
        const link = document.getElementById('settingsMilestoneQuiltsLink');
        if (item) {
          item.hidden = true;
          item.setAttribute('aria-hidden', 'true');
        }
        if (link) {
          link.hidden = true;
          link.disabled = true;
          link.setAttribute('aria-hidden', 'true');
          link.style.display = 'none';
          link.style.visibility = 'hidden';
          link.style.pointerEvents = 'none';
        }
        const screen = document.getElementById('screen-milestone-quilts');
        if (screen) {
          screen.hidden = true;
          screen.setAttribute('aria-hidden', 'true');
          screen.style.display = 'none';
          screen.style.visibility = 'hidden';
          screen.style.pointerEvents = 'none';
        }
      }

      ensureDedicateBlockButton() {
        // Temporarily disabled; keep the dedication code path intact so it can be restored later.
        const dedicateBtn = document.getElementById('dedicateBlockBtn');
        let dedicateGroup = dedicateBtn ? dedicateBtn.closest('.button-group') : null;
        if (dedicateGroup) {
          dedicateGroup.hidden = true;
          dedicateGroup.style.display = 'none';
          dedicateGroup.setAttribute('aria-hidden', 'true');
        }
        if (dedicateBtn) {
          dedicateBtn.hidden = true;
          dedicateBtn.style.display = 'none';
          dedicateBtn.style.visibility = 'hidden';
          dedicateBtn.style.opacity = '0';
          dedicateBtn.setAttribute('aria-hidden', 'true');
        }
        return null;
      }

      updatePersonalQuiltToggleButton() {
        const btn = document.getElementById('showPersonalQuiltBtn');
        const label = document.getElementById('personalQuiltBtnLabel');
        if (!btn || !label) return;
        if (!this.isPersonalQuiltEnabled()) {
          this._isPersonalQuiltMode = false;
          this._personalQuiltState = null;
          label.textContent = 'Personal quilt coming soon';
          btn.setAttribute('aria-label', 'Personal quilt coming soon');
          btn.setAttribute('aria-disabled', 'true');
          return;
        }
        if (this._isPersonalQuiltMode) {
          label.textContent = 'Back to OUR DAILY QUILT';
          btn.setAttribute('aria-label', 'Back to OUR DAILY QUILT');
        } else {
          label.textContent = 'View my colors over time';
          btn.setAttribute('aria-label', 'View my colors over time');
        }
        this.ensureDedicateBlockButton();
      }

      updateBacksidePreviewToggleButton() {
        const btn = document.getElementById('backsidePreviewToggleBtn');
        if (!btn) return;
        const on = this._isBacksidePreviewMode === true;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.setAttribute('aria-label', on ? 'Show front of quilt' : 'Show backside preview');
        btn.textContent = on ? 'Front' : 'Backside';
      }

      async handleToggleBacksidePreview(event) {
        event?.preventDefault?.();
        this._isBacksidePreviewMode = !this._isBacksidePreviewMode;
        this.updateBacksidePreviewToggleButton();
        await this.renderQuilt();
      }

      getDevicePersonalColorHistory() {
        const contributions = this.quiltEngine.getLifetimeUserContributions();
        const submissions = Array.isArray(contributions?.submissions) ? contributions.submissions : [];
        const ids = new Set(
          [this.currentUserId, this.quiltEngine?.deviceId]
            .map((v) => (v == null ? '' : String(v).trim()))
            .filter(Boolean)
        );
        return submissions
          .filter((c) => c && ids.has(String(c.userId || '').trim()))
          .map((c) => String(c.color || '').trim())
          .filter((hex) => Utils.validateHexColor(hex));
      }

      _devicePersonalColorUserIds() {
        let storedUserId = '';
        let storedDeviceId = '';
        try {
          storedUserId = String(localStorage.getItem('ourDailyUserId') || '').trim();
          storedDeviceId = String(localStorage.getItem('quiltDeviceId') || '').trim();
        } catch (_) {
          /* ignore */
        }
        return new Set(
          [this.currentUserId, this.quiltEngine?.deviceId, storedUserId, storedDeviceId]
            .map((v) => (v == null ? '' : String(v).trim()))
            .filter(Boolean)
        );
      }

      getDevicePersonalColorSubmissions() {
        const ids = this._devicePersonalColorUserIds();
        const fromStore = (payload) => {
          const submissions = Array.isArray(payload?.submissions) ? payload.submissions : [];
          return submissions.filter((c) => {
            if (!c) return false;
            const userId = String(c.userId || '').trim();
            if (!ids.has(userId)) return false;
            const color = String(c.color || '').trim();
            return Utils.validateHexColor(color);
          });
        };
        const lifetime = fromStore(this.quiltEngine?.getLifetimeUserContributions?.());
        const session = fromStore(this.quiltEngine?.getUserContributions?.());
        const seen = new Set();
        const merged = [];
        for (const submission of [...lifetime, ...session]) {
          const key = [
            submission.submissionIndex,
            submission.timestamp,
            submission.color,
            submission.blockId
          ].join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(submission);
        }
        return merged;
      }

      buildColorByAppDateKey() {
        const submissions = this.getDevicePersonalColorSubmissions();
        const map = new Map();
        for (const submission of submissions) {
          const ts = submission?.timestamp;
          if (!ts) continue;
          const date = new Date(ts);
          if (Number.isNaN(date.getTime())) continue;
          const dateKey = Utils.getAppDateKeyForDate(date);
          if (!dateKey) continue;
          const color = String(submission.color || '').trim();
          if (!Utils.validateHexColor(color)) continue;
          const idx = Number.isFinite(Number(submission.submissionIndex))
            ? Number(submission.submissionIndex)
            : -1;
          const existing = map.get(dateKey);
          if (!existing || idx >= existing.submissionIndex) {
            map.set(dateKey, { color, submissionIndex: idx });
          }
        }
        const result = {};
        for (const [key, value] of map.entries()) {
          result[key] = value.color;
        }
        return result;
      }

      getColorCalendarCellJitter(dateKey) {
        const seed = Utils.hashStringToUint(`odq-cal-cell:${dateKey}`);
        const rng = Utils._mulberry32(seed || 1);
        const r = () => rng();
        const rangeSigned = (mag) => (r() * 2 - 1) * mag;
        return {
          rotate: rangeSigned(2.6),
          shiftX: rangeSigned(1.6),
          shiftY: rangeSigned(1.6),
          scale: 1.04 + r() * 0.04
        };
      }

      buildColorCalendarCellJitterStyle(dateKey) {
        const j = this.getColorCalendarCellJitter(dateKey);
        return (
          `--cell-rotate:${j.rotate.toFixed(2)}deg;` +
          `--cell-shift-x:${j.shiftX.toFixed(2)}px;` +
          `--cell-shift-y:${j.shiftY.toFixed(2)}px;` +
          `--cell-scale:${j.scale.toFixed(3)};`
        );
      }

      getCurrentAppMonthDate() {
        const todayKey = Utils.getTodayKey();
        const [yStr, mStr] = String(todayKey || '').split('-');
        const year = Number(yStr);
        const month = Number(mStr);
        if (Number.isFinite(year) && Number.isFinite(month)) {
          return new Date(Date.UTC(year, month - 1, 1));
        }
        const now = new Date();
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      }

      getDevicePersonalColorSubmissionForDate(dateKey = Utils.getTodayKey()) {
        const targetKey = String(dateKey || '').trim();
        if (!targetKey) return null;
        const submissions = this.getDevicePersonalColorSubmissions();
        return submissions
          .filter((submission) => {
            const date = new Date(submission?.timestamp || '');
            if (Number.isNaN(date.getTime())) return false;
            return Utils.getAppDateKeyForDate(date) === targetKey;
          })
          .sort((a, b) => {
            const ai = Number.isFinite(Number(a.submissionIndex)) ? Number(a.submissionIndex) : -1;
            const bi = Number.isFinite(Number(b.submissionIndex)) ? Number(b.submissionIndex) : -1;
            if (ai !== bi) return ai - bi;
            return (Date.parse(a.timestamp || '') || 0) - (Date.parse(b.timestamp || '') || 0);
          })
          .pop() || null;
      }

      getDevicePersonalColorForDate(dateKey = Utils.getTodayKey()) {
        const submission = this.getDevicePersonalColorSubmissionForDate(dateKey);
        const color = String(submission?.color || '').trim();
        return Utils.validateHexColor(color) ? color : '';
      }

      /** Restore exact picks on loaded blocks when Firestore only has cohesion-dampened `color`. */
      backfillContributorColorsOnLoadedBlocks() {
        const submissions = this.getDevicePersonalColorSubmissions();
        if (!submissions.length || !Array.isArray(this.quiltEngine?.blocks)) return;
        const colorByBlockId = new Map();
        for (const submission of submissions) {
          const blockId = String(submission?.blockId || '').trim();
          const color = String(submission?.color || '').trim();
          if (!blockId || !Utils.validateHexColor(color)) continue;
          colorByBlockId.set(blockId, color);
        }
        if (!colorByBlockId.size) return;
        for (const block of this.quiltEngine.blocks) {
          if (!block) continue;
          if (
            typeof block.contributorColor === 'string' &&
            block.contributorColor.match(/^#[0-9A-Fa-f]{6}$/)
          ) {
            continue;
          }
          const fromSubmission = colorByBlockId.get(String(block.id || ''));
          if (fromSubmission) block.contributorColor = fromSubmission;
        }
      }

      /** Saved pick for display (color card, triptych) — submission color matches Settings calendar. */
      _displayColorFromSubmissionAndBlock(submission, block) {
        const saved = Utils.validateHexColor(submission?.color) ? String(submission.color).trim() : '';
        const onQuilt = Utils.validateHexColor(block?.contributorColor)
          ? String(block.contributorColor).trim()
          : (Utils.validateHexColor(block?.color) ? String(block.color).trim() : '');
        return saved || onQuilt;
      }

      _todayPieceBelongsToDevice(block, ids = this._devicePersonalColorUserIds()) {
        if (!block) return false;
        if (ids.has(String(block.contributorId || '').trim())) return true;
        const contributorIds = Array.isArray(block.contributorIds) ? block.contributorIds : [];
        return contributorIds.some((id) => ids.has(String(id || '').trim()));
      }

      _todayPieceFromDedicatedBlock(blocks = this.quiltEngine?.blocks || [], dateKey = Utils.getTodayKey()) {
        const submission = this.getDevicePersonalColorSubmissionForDate(dateKey);
        const list = Array.isArray(blocks) ? blocks : [];
        const ids = this._devicePersonalColorUserIds();
        const belongsToDevice = (block) => this._todayPieceBelongsToDevice(block, ids);

        let block = null;
        if (submission?.blockId) {
          block = list.find((b) => String(b?.id || '') === String(submission.blockId)) || null;
        }
        // Use stored id only — getDedicatedBlockId() can fall back into today's-piece
        // helpers and re-enter this method.
        const dedicatedId = this._storedDedicatedBlockId();
        if (!block && dedicatedId) {
          const candidate = list.find((b) => String(b?.id || '') === dedicatedId) || null;
          if (candidate && belongsToDevice(candidate)) block = candidate;
        }
        if (!block) {
          const mine = list
            .filter(belongsToDevice)
            .sort((a, b) => (Number(a.submissionIndex) || 0) - (Number(b.submissionIndex) || 0));
          block = mine.length ? mine[mine.length - 1] : null;
        }

        const color = this._displayColorFromSubmissionAndBlock(submission, block);
        if (!Utils.validateHexColor(color)) return null;
        return { submission: submission || null, block, color };
      }

      getExitChamberTodayPieceData(dateKey = Utils.getTodayKey()) {
        const targetKey = String(dateKey || '').trim() || Utils.getTodayKey();
        const submission = this.getDevicePersonalColorSubmissionForDate(targetKey);
        const blocks = Array.isArray(this.quiltEngine?.blocks) ? this.quiltEngine.blocks : [];
        const ids = this._devicePersonalColorUserIds();
        const belongsToDevice = (block) => this._todayPieceBelongsToDevice(block, ids);

        if (submission) {
          const subIndex = Number(submission.submissionIndex);
          let block =
            blocks.find((b) => String(b?.id || '') === String(submission.blockId || '')) ||
            blocks.find((b) => String(b?.id || '') === String(this._latestDedicatedBlockId || '')) ||
            null;
          if (!block && submission.blockId) {
            block =
              blocks.find((b) => this._spotlightBlockIdsRelated(b?.id, submission.blockId)) || null;
          }
          if (!block && Number.isFinite(subIndex)) {
            block = blocks.find((b) => Number(b?.submissionIndex) === subIndex && belongsToDevice(b)) || null;
          }
          if (!block) {
            const submissionColor = this._spotlightNormalizeColor(submission.color);
            block = blocks
              .filter(
                (b) =>
                  b &&
                  belongsToDevice(b) &&
                  this._spotlightBlockColor(b, submission.color) === submissionColor
              )
              .sort((a, b) => (Number(a.submissionIndex) || 0) - (Number(b.submissionIndex) || 0))
              .pop() || null;
          }
          if (!block) {
            const submissionColor = this._spotlightNormalizeColor(submission.color);
            block = blocks
              .filter((b) => b && this._spotlightBlockColor(b, submission.color) === submissionColor)
              .sort((a, b) => (Number(a.submissionIndex) || 0) - (Number(b.submissionIndex) || 0))
              .pop() || null;
          }
          const color = this._displayColorFromSubmissionAndBlock(submission, block);
          if (Utils.validateHexColor(color)) {
            return { submission, block, color };
          }
        }

        if (targetKey === Utils.getTodayKey()) {
          return this._todayPieceFromDedicatedBlock(blocks, targetKey);
        }
        return null;
      }

      playQuiltUserColorCardBounce() {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        const wrap = document.getElementById('quiltUserColorCardWrap');
        if (!wrap || wrap.hidden || wrap.hasAttribute('hidden')) return;
        if (this._quiltUserColorCardBounceTimer != null) {
          clearTimeout(this._quiltUserColorCardBounceTimer);
          this._quiltUserColorCardBounceTimer = null;
        }
        // IMPORTANT: The quilt-load color card peek keeps regressing. Clear every
        // class that can own this animation, then force reflow so the bounce replays.
        const startBounce = () => {
          wrap.classList.remove('is-color-card-bounce', 'is-triptych-peek-hint');
          void wrap.offsetWidth;
          wrap.classList.add('is-color-card-bounce');
          const done = () => {
            wrap.classList.remove('is-color-card-bounce', 'is-triptych-peek-hint');
            this._quiltUserColorCardBounceTimer = null;
          };
          wrap.addEventListener('animationend', done, { once: true });
          const screenStyle =
            typeof getComputedStyle === 'function'
              ? getComputedStyle(document.getElementById('screen-quilt') || document.documentElement)
              : null;
          const bounceDurationMs =
            parseFloat(screenStyle?.getPropertyValue('--quilt-color-card-bounce-duration') || '') *
            1000;
          this._quiltUserColorCardBounceTimer = window.setTimeout(
            done,
            Number.isFinite(bounceDurationMs) && bounceDurationMs > 0 ? bounceDurationMs + 80 : 2200
          );
        };
        // Double rAF helps iOS WebKit commit the class toggle before painting.
        requestAnimationFrame(() => {
          requestAnimationFrame(startBounce);
        });
      }

      _ensureQuiltUserColorNameFitObserver() {
        if (this._quiltUserColorNameFitObserver) return;
        const wrap = document.getElementById('quiltUserColorCardWrap');
        if (!wrap || typeof ResizeObserver === 'undefined') return;
        this._quiltUserColorNameFitObserver = new ResizeObserver(() => {
          this._fitQuiltUserColorNameLine();
        });
        this._quiltUserColorNameFitObserver.observe(wrap);
      }

      /** Shrink long paint-sample names onto one line; short names keep the default size. */
      _fitQuiltUserColorNameLine() {
        const label = document.getElementById('quiltUserShapeColorLabel');
        const nameSpan = label?.querySelector('.quilt-user-shape-card__color-name');
        if (!label || !nameSpan || !String(nameSpan.textContent || '').trim()) return;

        const width = label.clientWidth;
        if (width < 8) return;

        const maxScale = 1;
        const minScale = 0.55;
        nameSpan.style.setProperty('--quilt-color-name-fit', '1');
        if (nameSpan.scrollWidth <= width) return;

        let lo = minScale;
        let hi = maxScale;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          nameSpan.style.setProperty('--quilt-color-name-fit', String(mid));
          if (nameSpan.scrollWidth > width) hi = mid;
          else lo = mid;
        }
        nameSpan.style.setProperty('--quilt-color-name-fit', String(lo));
      }

      refreshQuiltUserShapeCard() {
        const wrap = document.getElementById('quiltUserColorCardWrap');
        const card = document.getElementById('quiltUserShapeCard');
        const swatch = document.getElementById('quiltUserShapeSwatch');
        const colorLabelEl = document.getElementById('quiltUserShapeColorLabel');
        if (!wrap || !card) return;
        const data = this.getExitChamberTodayPieceData();
        if (!data) {
          wrap.hidden = true;
          wrap.setAttribute('aria-hidden', 'true');
          if (colorLabelEl) colorLabelEl.textContent = '';
          swatch?.style.removeProperty('--quilt-user-piece-color');
          card.style.removeProperty('--quilt-user-piece-color');
          card.style.removeProperty('--quilt-color-swatch-tab');
          return;
        }
        const wasHidden = wrap.hidden || wrap.hasAttribute('hidden');
        const displayName = Utils.getNameThanksDisplayName();
        const safeHex = this.normalizeHexColor(data.color) || String(data.color || '').trim();
        const colorSampleName = this.getPaintSampleColorName(safeHex);
        if (swatch) {
          swatch.style.setProperty('--quilt-user-piece-color', safeHex);
        }
        card.style.setProperty('--quilt-user-piece-color', safeHex);
        const cardstockPaper = Utils.colorCardstockPaperFromUserColor(safeHex);
        card.style.setProperty('--quilt-color-swatch-tab', cardstockPaper);
        if (colorLabelEl) {
          colorLabelEl.replaceChildren();
          const nameSpan = document.createElement('span');
          nameSpan.className = 'quilt-user-shape-card__color-name';
          nameSpan.textContent = colorSampleName;
          const hexSpan = document.createElement('span');
          hexSpan.className = 'quilt-user-shape-card__color-hex';
          hexSpan.textContent = safeHex;
          colorLabelEl.append(nameSpan, hexSpan);
          this._ensureQuiltUserColorNameFitObserver();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => this._fitQuiltUserColorNameLine());
          });
        }
        wrap.hidden = false;
        wrap.removeAttribute('hidden');
        wrap.removeAttribute('aria-hidden');
        if (wasHidden && document.getElementById('screen-quilt')?.classList.contains('active')) {
          this._quiltScrollCuePlayed = false;
          this._quiltFabricPeekHintPlayed = false;
          if (this.shouldDeferQuiltScrollHintsForCoach?.()) {
            this.scheduleBlockSpotlightCoach?.();
          } else {
            this.playQuiltUserColorCardBounce?.();
            this.scheduleFabricScrollPeekHint?.();
          }
        }
        card.setAttribute(
          'aria-label',
          `${displayName}'s color today, ${colorSampleName}, ${safeHex}`
        );
        const dk =
          Utils.getTodayKey?.() ||
          this.quoteService?.getQuoteCalendarKeyNow?.() ||
          'odq';
        requestAnimationFrame(() => {
          globalThis.OdqScannerBed?.bootstrapQuiltPaper?.(document, dk);
          document.getElementById('quiltMoodSpread')?._moodSpreadWidget?.remeasure?.();
        });
      }

      ensureColorCalendarViewMonth() {
        const current = this._calendarViewMonth;
        if (current instanceof Date && !Number.isNaN(current.getTime())) {
          return current;
        }
        const fallback = this.getCurrentAppMonthDate();
        this._calendarViewMonth = fallback;
        return fallback;
      }

      bindColorCalendarNavForContainer(container) {
        if (!container || container.dataset.colorCalendarNavBound === '1') return;
        const prev = container.querySelector('.settings-color-calendar__nav-btn--prev');
        const next = container.querySelector('.settings-color-calendar__nav-btn--next');
        if (!prev || !next) return;
        prev.addEventListener('click', (e) => {
          e.preventDefault();
          this.shiftColorCalendarMonth(-1);
        });
        next.addEventListener('click', (e) => {
          e.preventDefault();
          this.shiftColorCalendarMonth(1);
        });
        container.dataset.colorCalendarNavBound = '1';
      }

      shiftColorCalendarMonth(direction) {
        const base = this.ensureColorCalendarViewMonth();
        const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + Number(direction || 0), 1));
        const currentMonth = this.getCurrentAppMonthDate();
        // Don't let the user navigate past the current app-month into the future.
        if (next.getTime() > currentMonth.getTime()) {
          this._calendarViewMonth = currentMonth;
        } else {
          this._calendarViewMonth = next;
        }
        this.renderColorCalendar();
      }

      renderColorCalendar() {
        const containers = document.querySelectorAll('.settings-color-calendar');
        if (!containers.length) return;

        const view = this.ensureColorCalendarViewMonth();
        const year = view.getUTCFullYear();
        const month = view.getUTCMonth();
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthLabelText = `${monthNames[month].toUpperCase()} ${year}`;

        const todayKey = Utils.getTodayKey();
        const currentMonth = this.getCurrentAppMonthDate();
        const isCurrentMonthView = view.getTime() === currentMonth.getTime();
        const nextDisabled = view.getTime() >= currentMonth.getTime();

        const colorByDate = this.buildColorByAppDateKey();
        const totalDays = Object.keys(colorByDate).length;

        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();

        // One-shot animation flag is consumed once across all containers so the
        // user sees the bloom on the screen they navigated to (others animate
        // invisibly in the background, which is fine).
        const animateTodayCell = this._animateTodayCellOnNextRender === true;
        this._animateTodayCellOnNextRender = false;

        const cells = [];
        for (let i = 0; i < firstWeekday; i++) {
          cells.push('<div class="settings-color-calendar__cell settings-color-calendar__cell--placeholder" aria-hidden="true"></div>');
        }
        for (let day = 1; day <= daysInMonth; day++) {
          const mm = String(month + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const dateKey = `${year}-${mm}-${dd}`;
          const color = colorByDate[dateKey];
          const isFuture = isCurrentMonthView && dateKey > todayKey;
          const isToday = dateKey === todayKey;
          const isJustAdded = isToday && animateTodayCell && !!color;
          const classes = ['settings-color-calendar__cell'];
          if (color) classes.push('settings-color-calendar__cell--filled');
          if (isFuture) classes.push('settings-color-calendar__cell--future');
          if (isToday) classes.push('settings-color-calendar__cell--today');
          if (isJustAdded) classes.push('settings-color-calendar__cell--just-added');
          const jitterStyle = this.buildColorCalendarCellJitterStyle(dateKey);
          const colorVar = isJustAdded && color ? `--cell-color:${color};` : '';
          const cellStyle = ` style="${colorVar}${jitterStyle}"`;
          const fillHtml = color
            ? `<span class="settings-color-calendar__cell-fill" style="background:${color}" aria-hidden="true"></span>`
            : '';
          const ritualHtml = isJustAdded
            ? `<span class="settings-color-calendar__cell-aura" aria-hidden="true"></span>` +
              `<span class="settings-color-calendar__cell-sparkles" aria-hidden="true">` +
                `<span class="settings-color-calendar__cell-spark" style="--spark-angle:18deg;--spark-distance:26px;--spark-delay:780ms"></span>` +
                `<span class="settings-color-calendar__cell-spark" style="--spark-angle:74deg;--spark-distance:32px;--spark-delay:860ms"></span>` +
                `<span class="settings-color-calendar__cell-spark" style="--spark-angle:138deg;--spark-distance:28px;--spark-delay:940ms"></span>` +
                `<span class="settings-color-calendar__cell-spark" style="--spark-angle:208deg;--spark-distance:30px;--spark-delay:820ms"></span>` +
                `<span class="settings-color-calendar__cell-spark" style="--spark-angle:262deg;--spark-distance:24px;--spark-delay:900ms"></span>` +
                `<span class="settings-color-calendar__cell-spark" style="--spark-angle:322deg;--spark-distance:28px;--spark-delay:760ms"></span>` +
              `</span>`
            : '';
          const labelParts = [`${monthNames[month]} ${day}, ${year}`];
          if (color) labelParts.push(`your color was ${color}`);
          else if (isFuture) labelParts.push('upcoming');
          else labelParts.push('no color added');
          const ariaLabel = labelParts.join(' — ');
          cells.push(
            `<div class="${classes.join(' ')}" role="gridcell"${cellStyle} aria-label="${ariaLabel}">` +
              ritualHtml +
              fillHtml +
              `<span class="settings-color-calendar__cell-date">${day}</span>` +
            `</div>`
          );
        }
        const gridHtml = cells.join('');

        let summaryText;
        if (totalDays === 0) {
          summaryText = 'No colors yet — your first color will appear here.';
        } else if (totalDays === 1) {
          summaryText = '1 day of color so far';
        } else {
          summaryText = `${totalDays} days of color so far`;
        }

        containers.forEach((container) => {
          this.bindColorCalendarNavForContainer(container);
          const grid = container.querySelector('.settings-color-calendar__grid');
          const monthLabel = container.querySelector('.settings-color-calendar__month');
          const summary = container.querySelector('.settings-color-calendar__summary');
          const prevBtn = container.querySelector('.settings-color-calendar__nav-btn--prev');
          const nextBtn = container.querySelector('.settings-color-calendar__nav-btn--next');
          if (monthLabel) monthLabel.textContent = monthLabelText;
          if (nextBtn) nextBtn.disabled = nextDisabled;
          if (prevBtn) prevBtn.disabled = false;
          if (grid) grid.innerHTML = gridHtml;
          if (summary) summary.textContent = summaryText;
        });
      }

      getPersonalQuiltCacheKey() {
        const userId = String(this.currentUserId || this.quiltEngine?.deviceId || 'device').trim() || 'device';
        return `ourDailyPersonalQuiltPreview:${userId}`;
      }

      clonePersonalQuiltState(state) {
        if (!state || !Array.isArray(state.blocks)) return null;
        return {
          blocks: state.blocks.map((block) => ({ ...block })),
          submissionCount: Math.max(0, Number(state.submissionCount) || 0),
          colorCount: Math.max(0, Number(state.colorCount) || 0),
          colorSignature: String(state.colorSignature || '')
        };
      }

      readPersonalQuiltPreviewCache(colorSignature) {
        const memory = this.clonePersonalQuiltState(this._personalQuiltPreviewCache);
        if (memory && memory.colorSignature === colorSignature) return memory;
        try {
          const raw = localStorage.getItem(this.getPersonalQuiltCacheKey());
          const parsed = raw ? JSON.parse(raw) : null;
          const cached = this.clonePersonalQuiltState(parsed);
          if (cached && cached.colorSignature === colorSignature) {
            this._personalQuiltPreviewCache = cached;
            return this.clonePersonalQuiltState(cached);
          }
        } catch (_) {
          /* ignore corrupt cache */
        }
        return null;
      }

      writePersonalQuiltPreviewCache(state) {
        const cached = this.clonePersonalQuiltState(state);
        if (!cached) return;
        this._personalQuiltPreviewCache = cached;
        try {
          localStorage.setItem(this.getPersonalQuiltCacheKey(), JSON.stringify(cached));
        } catch (_) {
          /* cache is optional */
        }
      }

      schedulePersonalQuiltPreviewCacheWarmup(delayMs = 1400) {
        if (!this.isPersonalQuiltEnabled()) {
          return;
        }
        if (this._personalQuiltPreviewWarmupTimer) {
          clearTimeout(this._personalQuiltPreviewWarmupTimer);
          this._personalQuiltPreviewWarmupTimer = null;
        }
        if (
          this._personalQuiltPreviewWarmupIdleId &&
          typeof cancelIdleCallback === 'function'
        ) {
          cancelIdleCallback(this._personalQuiltPreviewWarmupIdleId);
          this._personalQuiltPreviewWarmupIdleId = null;
        }
        const warmup = () => {
          try {
            const colors = this.getDevicePersonalColorHistory();
            if (!colors.length) return;
            if (this.readPersonalQuiltPreviewCache(colors.join('|'))) return;
            this.buildPersonalQuiltStateFromDeviceHistory();
          } catch (error) {
            this.logger?.warn?.('Personal quilt preview cache warmup failed:', error);
          } finally {
            this._personalQuiltPreviewWarmupIdleId = null;
          }
        };
        this._personalQuiltPreviewWarmupTimer = setTimeout(() => {
          this._personalQuiltPreviewWarmupTimer = null;
          if (typeof requestIdleCallback === 'function') {
            this._personalQuiltPreviewWarmupIdleId = requestIdleCallback(warmup, { timeout: 1800 });
          } else {
            warmup();
          }
        }, Math.max(0, Number(delayMs) || 0));
      }

      buildPersonalQuiltStateFromDeviceHistory() {
        const colors = this.getDevicePersonalColorHistory();
        if (!colors.length) return null;
        const colorSignature = colors.join('|');
        const exactCache = this.readPersonalQuiltPreviewCache(colorSignature);
        if (exactCache) return exactCache;

        const tempUserId = this.currentUserId || this.quiltEngine?.deviceId || null;
        const personalEngine = new SimpleQuiltEngine(tempUserId, { recordColorReplayEvents: false });
        // Personal quilt should be deterministic from local history only; don't mutate shared contribution storage.
        personalEngine.recordUserContribution = () => {};
        // Preview replay can legitimately run out of safe split targets before history is exhausted.
        personalEngine._suppressSplitWarnings = true;

        const previous = this.clonePersonalQuiltState(this._personalQuiltPreviewCache);
        const canExtendPrevious =
          previous &&
          previous.colorSignature &&
          colorSignature.startsWith(`${previous.colorSignature}|`) &&
          Array.isArray(previous.blocks) &&
          previous.blocks.length > 0;
        const colorsToApply = canExtendPrevious
          ? colors.slice(Math.max(0, Number(previous.colorCount) || 0))
          : colors;

        if (canExtendPrevious) {
          personalEngine.blocks = previous.blocks.map((block) => ({ ...block }));
          personalEngine.submissionCount = Math.max(0, Number(previous.submissionCount) || 0);
        } else {
          personalEngine.initialize();
        }

        for (const hex of colorsToApply) {
          const added = personalEngine.addColor(hex);
          if (!added) {
            break;
          }
        }

        personalEngine.blocks.forEach((block) => {
          if (
            typeof block.contributorColor === 'string' &&
            block.contributorColor.match(/^#[0-9A-Fa-f]{6}$/)
          ) {
            block.color = block.contributorColor;
          }
        });

        const state = {
          blocks: personalEngine.blocks.map((b) => ({ ...b })),
          submissionCount: personalEngine.submissionCount,
          colorCount: colors.length,
          colorSignature
        };
        this.writePersonalQuiltPreviewCache(state);
        return this.clonePersonalQuiltState(state);
      }

      /**
       * Build a personal-quilt state for an arbitrary slice of device colors,
       * without touching the device-history cache. Used by the Milestone Quilts
       * archive to render snapshots at each milestone (5, 10, 25, ...).
       */
      buildPersonalQuiltStateForColors(colors) {
        const list = (Array.isArray(colors) ? colors : [])
          .map((c) => String(c || '').trim())
          .filter((hex) => Utils.validateHexColor(hex));
        if (!list.length) return null;

        const tempUserId = this.currentUserId || this.quiltEngine?.deviceId || null;
        const personalEngine = new SimpleQuiltEngine(tempUserId, { recordColorReplayEvents: false });
        personalEngine.recordUserContribution = () => {};
        personalEngine._suppressSplitWarnings = true;
        personalEngine.initialize();

        for (const hex of list) {
          const added = personalEngine.addColor(hex);
          if (!added) break;
        }

        personalEngine.blocks.forEach((block) => {
          if (
            typeof block.contributorColor === 'string' &&
            block.contributorColor.match(/^#[0-9A-Fa-f]{6}$/)
          ) {
            block.color = block.contributorColor;
          }
        });

        return {
          blocks: personalEngine.blocks.map((b) => ({ ...b })),
          submissionCount: personalEngine.submissionCount,
          colorCount: list.length,
          colorSignature: list.join('|')
        };
      }

      /**
       * Render a personal-quilt state into a target SVG element using the same
       * renderer used by the home quilt. Mirrors the swap pattern in
       * `renderSettingsPersonalQuiltPreview`. Returns true on success.
       */
      renderPersonalQuiltStateIntoSvg(svg, state) {
        if (!svg || !state || !Array.isArray(state.blocks) || !state.blocks.length) {
          return false;
        }
        const dimensions =
          typeof Utils !== 'undefined' && typeof Utils.getQuiltDimensions === 'function'
            ? Utils.getQuiltDimensions()
            : { width: 800, height: 600 };
        const width = Math.max(1, Number(dimensions.width) || 800);
        const height = Math.max(1, Number(dimensions.height) || 600);
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        svg.innerHTML = '';

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
              state.blocks.map((b) => ({ ...b })),
              [],
              state.submissionCount || 0
            );
          } finally {
            this.renderer.quiltSVG = previousSvg;
            this.renderer.userPieces = previousUserPieces;
            this.renderer.lastAddedIndex = previousLastAddedIndex;
            this.renderer.setBacksidePreviewEnabled(previousBacksidePreview);
          }
          return true;
        }

        state.blocks.forEach((block) => {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', String(Number(block.x) || 0));
          rect.setAttribute('y', String(Number(block.y) || 0));
          rect.setAttribute('width', String(Math.max(0, Number(block.width) || 0)));
          rect.setAttribute('height', String(Math.max(0, Number(block.height) || 0)));
          rect.setAttribute(
            'fill',
            Utils.validateHexColor(block.color) ? block.color : '#d8d4cf'
          );
          svg.appendChild(rect);
        });
        return true;
      }

      /**
       * Numeric, sorted milestone counts derived from CONFIG.COLOR_MILESTONES.
       * Falls back to the canonical list if config is missing/invalid.
       */
      getMilestoneCounts() {
        const fallback = [5, 10, 25, 50, 100, 250, 365, 500, 1000];
        const map = CONFIG?.COLOR_MILESTONES;
        if (!map || typeof map !== 'object') return fallback;
        const counts = Object.keys(map)
          .map((k) => Number(k))
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b);
        return counts.length ? counts : fallback;
      }

      /**
       * Format a Date as e.g. "May 14, 2026" for milestone entry captions.
       */
      formatMilestoneEntryDate(value) {
        if (!value) return '';
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        try {
          return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        } catch (_) {
          return date.toISOString().slice(0, 10);
        }
      }

      /**
       * Render the Milestone Quilts archive feed: one entry per milestone the
       * device has reached, plus a single "next milestone" preview entry that
       * shows what's still ahead.
       */
      renderMilestoneQuiltsFeed() {
        const feed = document.getElementById('milestoneQuiltsFeed');
        if (!feed) return;

        const status = (text) => {
          feed.innerHTML = '';
          const div = document.createElement('div');
          div.className = 'milestone-quilts-status';
          div.id = 'milestoneQuiltsStatus';
          div.textContent = text;
          feed.appendChild(div);
        };

        let submissions = [];
        try {
          submissions = (typeof this.getDevicePersonalColorSubmissions === 'function'
            ? this.getDevicePersonalColorSubmissions()
            : []) || [];
        } catch (error) {
          this.logger?.warn?.('Milestone quilts: could not read submissions', error);
        }

        const colors = submissions
          .map((s) => String(s?.color || '').trim())
          .filter((hex) => Utils.validateHexColor(hex));

        const milestones = this.getMilestoneCounts();
        const reached = milestones.filter((m) => m <= colors.length);
        const nextMilestone = milestones.find((m) => m > colors.length) || null;

        if (!reached.length) {
          const firstMilestone = milestones[0] || 5;
          const remaining = Math.max(0, firstMilestone - colors.length);
          const lines = [
            `Your first milestone quilt arrives at ${firstMilestone} colors.`,
            colors.length === 0
              ? 'Add a color today to start your archive.'
              : remaining === 1
                ? '1 more color to go.'
                : `${remaining} more colors to go.`
          ];
          status(lines.join(' '));
          return;
        }

        feed.innerHTML = '';

        const milestoneCopy = (count) => {
          const map = CONFIG?.COLOR_MILESTONES || {};
          return map[String(count)] || map[count] || '';
        };

        reached.forEach((count) => {
          const slice = colors.slice(0, count);
          const state = this.buildPersonalQuiltStateForColors(slice);
          const reachedAt = submissions[count - 1]?.timestamp || null;
          const dateText = this.formatMilestoneEntryDate(reachedAt);
          const message = milestoneCopy(count);

          const entry = document.createElement('article');
          entry.className = 'milestone-quilt-entry';
          entry.setAttribute('data-milestone', String(count));

          const countLabel = document.createElement('p');
          countLabel.className = 'milestone-quilt-entry__count';
          countLabel.textContent = `${count} COLORS`;
          entry.appendChild(countLabel);

          const frame = document.createElement('div');
          frame.className = 'milestone-quilt-entry__frame';
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('class', 'milestone-quilt-entry__svg');
          svg.setAttribute('role', 'img');
          svg.setAttribute('aria-label', `Personal quilt at ${count} colors`);
          frame.appendChild(svg);
          entry.appendChild(frame);

          if (state) {
            this.renderPersonalQuiltStateIntoSvg(svg, state);
          }

          if (message) {
            const msg = document.createElement('p');
            msg.className = 'milestone-quilt-entry__message';
            msg.textContent = message;
            entry.appendChild(msg);
          }

          if (dateText) {
            const dateEl = document.createElement('p');
            dateEl.className = 'milestone-quilt-entry__date';
            dateEl.textContent = `Reached ${dateText}`;
            entry.appendChild(dateEl);
          }

          feed.appendChild(entry);
        });

        if (nextMilestone) {
          const remaining = Math.max(0, nextMilestone - colors.length);
          const locked = document.createElement('article');
          locked.className = 'milestone-quilt-entry milestone-quilt-entry--locked';
          locked.setAttribute('data-milestone', String(nextMilestone));

          const countLabel = document.createElement('p');
          countLabel.className = 'milestone-quilt-entry__count';
          countLabel.textContent = `Next: ${nextMilestone} COLORS`;
          locked.appendChild(countLabel);

          const msg = document.createElement('p');
          msg.className = 'milestone-quilt-entry__message';
          msg.textContent =
            remaining === 1
              ? '1 more color and a new quilt unlocks here.'
              : `${remaining} more colors and a new quilt unlocks here.`;
          locked.appendChild(msg);

          feed.appendChild(locked);
        }
      }

      /**
       * Called just before #screen-milestone-quilts is shown.
       */
      prepareMilestoneQuiltsScreen() {
        if (!this.isMilestoneQuiltsEnabled()) return;
        try {
          this.renderMilestoneQuiltsFeed();
        } catch (error) {
          this.logger?.warn?.('Milestone quilts render failed:', error);
          const feed = document.getElementById('milestoneQuiltsFeed');
          if (feed) {
            feed.innerHTML =
              '<div class="milestone-quilts-status" id="milestoneQuiltsStatus">' +
              'Could not load your milestone quilts. Try again in a moment.' +
              '</div>';
          }
        }
      }
  }

  root.SimplifiedQuiltAppV2Share = SimplifiedQuiltAppV2Share;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
