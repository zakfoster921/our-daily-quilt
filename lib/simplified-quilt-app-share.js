/**
 * SimplifiedQuiltAppV2 share slice: share/IG, Layout B tune, exit chamber (Phase C4).
 * Methods merged onto SimplifiedQuiltAppV2.prototype in the main app module.
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2Share {
      async getQuiltBlobForTunePreview(options = {}) {
        const shareOpts = options.maxEdge != null ? { maxEdge: options.maxEdge } : {};
        try {
          const svgBlob = await this.getHighResQuiltBlobForShare(shareOpts);
          if (svgBlob) {
            return { blob: svgBlob, quiltSource: 'svg' };
          }
        } catch (svgErr) {
          this.logger.warn('Tune preview SVG raster failed, trying blocks:', svgErr);
        }
        const blocks = this.quiltEngine?.blocks;
        if (!blocks?.length) return { blob: null, quiltSource: 'none' };
        const maxEdge = Math.min(4096, Math.max(360, Number(options.maxEdge) || 1080));
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

      async shareBlobWithSystem(blob, filename, shareTitle, shareText) {
        const imageFile = new File([blob], filename, { type: 'image/png' });
        const shareData = {
          title: shareTitle,
          text: shareText,
          files: [imageFile]
        };
        const canShareFiles =
          typeof navigator.canShare === 'function' && navigator.canShare(shareData);
        if (navigator.share && canShareFiles) {
          await navigator.share(shareData);
          this.uiService.showToast('Image saved to your camera roll');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.uiService.showToast('Image saved to your camera roll');
      }

      async createFortuneStoryShareBlob(highResBlob) {
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
        this.uiService.showToast('Image saved to your camera roll');
      }

      async createDedicationPostBlob(blockId, message) {
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
            (typeof window !== 'undefined' && window.app?.getMostPopularQuiltColor?.(this.quiltEngine.blocks)?.color) ||
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
              speakerOverlay: {
                enabled: true,
                imageUrl: speakerImageForCanvas,
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

      /**
       * Admin: live-preview modal for Layout B story (9:16) and post (4:5).
       * Speaker placement, keyword emphasis, and text-strip layout are persisted per aspect (localStorage + Firestore).
       */
      async handleAdminTuneSpeakerCutout() {
        if (this._speakerTuneModalOpening || this._speakerTuneModalOpen) return;
        this._speakerTuneModalOpening = true;
        const dismissTuneModal = () => {
          document.querySelectorAll('.odq-speaker-tune-modal').forEach((el) => el.remove());
          this._speakerTuneModalOpen = false;
        };
        try {
          document.querySelectorAll('.odq-speaker-tune-modal').forEach((el) => el.remove());
          this._speakerTuneModalOpen = false;

          if (!this.quiltEngine.blocks || this.quiltEngine.blocks.length <= 1) {
            this.uiService.showToast('Add some blocks to the quilt first');
            return;
          }

          const todayKey =
            (this.quoteService && typeof this.quoteService.getQuoteCalendarKeyNow === 'function'
              ? this.quoteService.getQuoteCalendarKeyNow()
              : Utils.getTodayKey());

          await odqPrefetchSpeakerCutoutTweak(todayKey);

          document.querySelectorAll('.admin-menu').forEach((el) => el.remove());

          const quoteSync = this._getQuoteForTuneModalSync(todayKey);
          const quote = await this._getQuoteForTuneModal(todayKey);
          const quoteSource =
            odqSpeakerImageUrlFromQuote(quoteSync) && quote === quoteSync
              ? 'sync'
              : quoteSync === quote
                ? 'sync'
                : 'resolved';
          const qText = String(quote.text ?? quote.body ?? '').trim();
          const qAuthor = String(quote.author ?? '').trim();
          const speakerName = String(quote.speakerName ?? quote.speaker_name ?? qAuthor).replace(/^\s*[—-]\s*/, '').trim();
          const washColor = String(
            (typeof window !== 'undefined' && window.app?.getMostPopularQuiltColor?.(this.quiltEngine.blocks)?.color) ||
            CONFIG.APP.defaultColor ||
            '#ea9b9a'
          ).trim();

          let speakerImageForCanvas = await odqResolveSpeakerImageForTune(quote, this.archiveService);
          if (!speakerImageForCanvas) {
            this.uiService.showToast("Today's quote has no speaker image");
            return;
          }
          let highResBlob = null;
          let tuneQuiltSource = 'unknown';
          let tuneAssetsReady = false;
          let allowBackdropClose = false;
          let enableBackdropCloseTimer = 0;
          let savedKeywordEmphasis = null;
          const modal = document.createElement('div');
          modal.className = 'odq-speaker-tune-modal';
          modal.innerHTML = `
            <div class="odq-speaker-tune-panel" role="dialog" aria-modal="true" aria-label="Tune today's speaker cutout">
              <div class="odq-speaker-tune-preview-wrap">
                <img class="odq-speaker-tune-preview" alt="Layout B preview" />
                <div class="odq-speaker-tune-spinner">Loading quilt and speaker…</div>
              </div>
              <div data-tune-debug-status style="font-size:9px;line-height:1.3;color:#666;margin:2px 0 0;word-break:break-word;"></div>
              <div class="odq-speaker-tune-aspect">
                <span>Preview:</span>
                <button type="button" data-aspect="story" class="is-active">Story 9:16</button>
                <button type="button" data-aspect="post">Post 4:5</button>
              </div>
              <p class="odq-speaker-tune-aspect-hint" style="font-size:10px;line-height:1.3;color:#555;margin:0;">Post 4:5 is quote-only (no speaker). Keyword and strip edits on Story apply to Post too; Post-only quote edits stay on Post. Speaker placement is Story only.</p>
              <details class="odq-speaker-tune-details" open>
                <summary>Speaker placement</summary>
                <div class="odq-speaker-tune-status">Current preset: <strong data-preset-label>AUTO</strong> <span data-nudge-label></span></div>
                <div class="odq-speaker-tune-presets"></div>
                <div class="odq-speaker-tune-nudge" aria-label="Nudge speaker position">
                  <span class="odq-speaker-tune-nudge-label">Nudge</span>
                  <button type="button" data-nudge="left" aria-label="Nudge left">←</button>
                  <button type="button" data-nudge="up" aria-label="Nudge up">↑</button>
                  <button type="button" data-nudge="down" aria-label="Nudge down">↓</button>
                  <button type="button" data-nudge="right" aria-label="Nudge right">→</button>
                  <span class="odq-speaker-tune-nudge-label">Rotate</span>
                  <button type="button" data-rotate="ccw" aria-label="Rotate counter-clockwise">↺</button>
                  <button type="button" data-rotate="cw" aria-label="Rotate clockwise">↻</button>
                  <button type="button" data-action="reset-nudge">Reset tweaks</button>
                </div>
              </details>
              <details class="odq-speaker-tune-details">
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
              <details class="odq-speaker-tune-details">
                <summary>Text strip layout</summary>
                <div class="odq-speaker-tune-strip-layout">
                  <div data-strip-layout-status>Arrangement: <strong data-strip-layout-label>#1</strong></div>
                  <button type="button" data-action="shuffle-strips">New arrangement</button>
                </div>
              </details>
              <div class="odq-speaker-tune-actions">
                <button type="button" data-action="reset">Reset (AUTO)</button>
                <button type="button" data-action="save">Save</button>
                <button type="button" data-action="close">Close</button>
              </div>
            </div>
          `;
          modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100060;display:flex;align-items:center;justify-content:center;padding:10px;';
          const panel = modal.querySelector('.odq-speaker-tune-panel');
          panel.style.cssText = 'background:#fff;border-radius:8px;padding:10px;max-width:520px;width:100%;max-height:96vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;-webkit-overflow-scrolling:touch;';
          const previewWrap = modal.querySelector('.odq-speaker-tune-preview-wrap');
          previewWrap.style.cssText = 'position:relative;background:#222;border-radius:6px;overflow:hidden;aspect-ratio:9/16;width:100%;flex:1 1 auto;min-height:42vh;max-height:62vh;';
          const previewImg = modal.querySelector('.odq-speaker-tune-preview');
          previewImg.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;';
          const spinner = modal.querySelector('.odq-speaker-tune-spinner');
          spinner.style.cssText =
            'position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#888;font-size:12px;background:transparent;pointer-events:none;';
          const presetsWrap = modal.querySelector('.odq-speaker-tune-presets');
          presetsWrap.style.cssText = 'display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;justify-content:space-between;';
          const nudgeWrap = modal.querySelector('.odq-speaker-tune-nudge');
          const nudgeBtnStyle =
            'padding:6px 10px;border:1px solid #aaa;background:#fff;cursor:pointer;border-radius:3px;font-size:14px;line-height:1;touch-action:manipulation;min-width:36px;';
          if (nudgeWrap) {
            nudgeWrap.style.cssText =
              'display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:6px;';
            const nudgeLabel = nudgeWrap.querySelector('.odq-speaker-tune-nudge-label');
            if (nudgeLabel) {
              nudgeLabel.style.cssText = 'font-size:10px;font-weight:600;color:#666;margin-right:2px;';
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
            ? [...nudgeWrap.querySelectorAll('button[data-nudge], button[data-rotate]')]
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
          const tuneDebugStatus = modal.querySelector('[data-tune-debug-status]');
          const setTuneDebug = (msg) => {
            if (tuneDebugStatus) tuneDebugStatus.textContent = String(msg || '');
          };

          const stripLayoutSection = modal.querySelector('.odq-speaker-tune-strip-layout');
          if (stripLayoutSection) {
            stripLayoutSection.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:4px;';
            const stripStatusEl = stripLayoutSection.querySelector('[data-strip-layout-status]');
            if (stripStatusEl) stripStatusEl.style.cssText = 'font-size:10px;';
            const shuffleBtn = stripLayoutSection.querySelector('button[data-action="shuffle-strips"]');
            if (shuffleBtn) {
              shuffleBtn.style.cssText = 'padding:4px 8px;border:1px solid #000;background:#fff;cursor:pointer;border-radius:3px;font-size:11px;line-height:1.2;align-self:flex-start;';
            }
          }
          const styleChecks = [...kwStylesWrap.querySelectorAll('input[data-style]')];

          /** One column per edge/center so TOP/BOTTOM/LEFT/RIGHT presets stay grouped. */
          const presetColumns = [
            { label: 'Top', presets: ['SMALL_TOP', 'BIG_TOP'] },
            { label: 'Bottom', presets: ['SMALL_BOTTOM', 'BIG_BOTTOM'] },
            { label: 'Left', presets: ['SMALL_LEFT', 'BIG_LEFT', 'HUGE_LEFT'] },
            { label: 'Center', presets: ['AUTO', 'BIG_CENTER', 'HUGE_CENTER'] },
            { label: 'Right', presets: ['SMALL_RIGHT', 'BIG_RIGHT', 'HUGE_RIGHT'] }
          ];
          const presetButtons = new Map();
          const presetBtnStyle =
            'padding:2px 4px;border:1px solid #aaa;background:#fff;cursor:pointer;border-radius:3px;font-size:10px;line-height:1.15;touch-action:manipulation;width:100%;';
          for (const { label, presets } of presetColumns) {
            const col = document.createElement('div');
            col.className = 'odq-speaker-tune-preset-col';
            col.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex:1 1 0;min-width:52px;';
            const colLabel = document.createElement('div');
            colLabel.textContent = label;
            colLabel.style.cssText =
              'font-size:9px;font-weight:600;text-transform:uppercase;color:#666;text-align:center;line-height:1.1;';
            col.appendChild(colLabel);
            for (const name of presets) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.dataset.preset = name;
              btn.textContent = name.replace(/_(TOP|BOTTOM|LEFT|RIGHT|CENTER)$/i, '').replace(/_/g, ' ');
              btn.style.cssText = presetBtnStyle;
              presetButtons.set(name, btn);
              col.appendChild(btn);
            }
            presetsWrap.appendChild(col);
          }
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
                kwInput.value = parsedKeywords.length ? parsedKeywords.join(', ') : notionKeywordRaw;
              }
            }
            const savedStyleSet = new Set(kwEmphasis?.styles || []);
            for (const cb of styleChecks) {
              cb.checked = savedStyleSet.has(cb.dataset.style);
            }
            if (
              (kwEmphasis?.keywords?.length || String(kwInput.value || '').trim()) &&
              !savedStyleSet.size
            ) {
              const boldCb = styleChecks.find((cb) => cb.dataset.style === 'bold');
              if (boldCb) boldCb.checked = true;
            }
          };
          const storyTweakInit = odqReadSpeakerCutoutTweakFromLocal(todayKey, 'story');
          const postTweakInit = odqReadSpeakerCutoutTweakFromLocal(todayKey, 'post');
          const tuneDraftByAspect = {
            story: {
              preset: storyTweakInit.preset,
              nudgeCx: storyTweakInit.nudgeCx,
              nudgeCy: storyTweakInit.nudgeCy,
              nudgeRotateDeg: storyTweakInit.nudgeRotateDeg,
              stripLayoutSeed: odqGetCachedLayoutBStripLayoutSeed(todayKey, 'story') ?? 0,
              keywordEmphasis: null
            },
            post: {
              preset: postTweakInit.preset,
              nudgeCx: postTweakInit.nudgeCx,
              nudgeCy: postTweakInit.nudgeCy,
              nudgeRotateDeg: postTweakInit.nudgeRotateDeg,
              stripLayoutSeed: odqGetCachedLayoutBStripLayoutSeed(todayKey, 'post') ?? 0,
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

          const syncQuoteStyleDraftsFromUi = () => {
            const kw = getKeywordEmphasisFromForm();
            const seed = odqNormalizeStripLayoutSeed(stripLayoutSeed);
            const kwCopy = kw
              ? { keywords: [...(kw.keywords || [])], styles: [...(kw.styles || [])] }
              : null;
            const a = odqNormalizeTuneAspect(previewAspect);
            tuneDraftByAspect[a].stripLayoutSeed = seed;
            tuneDraftByAspect[a].keywordEmphasis = kwCopy;
            if (a === 'story') {
              copyStoryQuoteStyleToPost();
              postQuoteStyleIndependent = false;
              storyRefStripPlan = null;
              storyRefStripPlanKey = '';
            }
          };

          const markPostQuoteStyleEdited = () => {
            if (odqNormalizeTuneAspect(previewAspect) === 'post') {
              postQuoteStyleIndependent = true;
              storyRefStripPlan = null;
              storyRefStripPlanKey = '';
            }
          };

          const captureDraftFromUi = (aspect) => {
            const a = odqNormalizeTuneAspect(aspect);
            tuneDraftByAspect[a].preset = currentPreset;
            tuneDraftByAspect[a].nudgeCx = nudgeCx;
            tuneDraftByAspect[a].nudgeCy = nudgeCy;
            tuneDraftByAspect[a].nudgeRotateDeg = nudgeRotateDeg;
            tuneDraftByAspect[a].stripLayoutSeed = odqNormalizeStripLayoutSeed(stripLayoutSeed);
            tuneDraftByAspect[a].keywordEmphasis = getKeywordEmphasisFromForm();
            if (a === 'story') {
              copyStoryQuoteStyleToPost();
              postQuoteStyleIndependent = false;
              storyRefStripPlan = null;
              storyRefStripPlanKey = '';
            }
          };

          const storyQuoteStyleDraft = () => ({
            keywordEmphasis: tuneDraftByAspect.story.keywordEmphasis,
            stripLayoutSeed: odqNormalizeStripLayoutSeed(tuneDraftByAspect.story.stripLayoutSeed)
          });

          const quoteStyleForAspect = (aspect) => {
            const a = odqNormalizeTuneAspect(aspect);
            if (a === 'post' && !postQuoteStyleIndependent) {
              return storyQuoteStyleDraft();
            }
            if (a === odqNormalizeTuneAspect(previewAspect)) {
              return {
                keywordEmphasis: getKeywordEmphasisFromForm(),
                stripLayoutSeed: odqNormalizeStripLayoutSeed(stripLayoutSeed)
              };
            }
            const d = tuneDraftByAspect[a];
            return {
              keywordEmphasis: d.keywordEmphasis,
              stripLayoutSeed: odqNormalizeStripLayoutSeed(d.stripLayoutSeed)
            };
          };

          const applyDraftToUi = (aspect) => {
            const a = odqNormalizeTuneAspect(aspect);
            const d = tuneDraftByAspect[a];
            currentPreset = d.preset || 'AUTO';
            nudgeCx = odqNormalizeSpeakerNudgeComponent(d.nudgeCx);
            nudgeCy = odqNormalizeSpeakerNudgeComponent(d.nudgeCy);
            nudgeRotateDeg = odqNormalizeSpeakerRotateDeg(d.nudgeRotateDeg);
            if (a === 'post' && !postQuoteStyleIndependent) {
              copyStoryQuoteStyleToPost();
              const s = storyQuoteStyleDraft();
              stripLayoutSeed = s.stripLayoutSeed;
              applyTuneKeywordForm(s.keywordEmphasis);
            } else {
              stripLayoutSeed = odqNormalizeStripLayoutSeed(d.stripLayoutSeed);
              applyTuneKeywordForm(d.keywordEmphasis);
            }
            updateActiveButton();
            updateStripLayoutLabel();
          };

          let currentPreset = tuneDraftByAspect.story.preset;
          let nudgeCx = tuneDraftByAspect.story.nudgeCx;
          let nudgeCy = tuneDraftByAspect.story.nudgeCy;
          let nudgeRotateDeg = tuneDraftByAspect.story.nudgeRotateDeg;
          let stripLayoutSeed = tuneDraftByAspect.story.stripLayoutSeed;
          let previewAspect = 'story';
          let currentBlobUrl = null;
          /** True after any placement/keyword/strip edit; blocks async load from resetting the UI. */
          let tuneUiDirty = false;
          const markTuneUiDirty = () => {
            tuneUiDirty = true;
          };
          /** Render token guards against out-of-order results when the user spam-clicks presets. */
          let renderToken = 0;
          let kwRenderTimer = 0;
          /** Story 9:16 strip plan scaled to post when quote style is inherited from Story. */
          let storyRefStripPlan = null;
          let storyRefStripPlanKey = '';
          let postQuoteStyleIndependent = false;
          const stripPlanCacheKey = () =>
            [
              tuneDraftByAspect.story.stripLayoutSeed,
              qText,
              qAuthor,
              tuneDraftByAspect.story.preset,
              tuneDraftByAspect.story.nudgeCx,
              tuneDraftByAspect.story.nudgeCy,
              tuneDraftByAspect.story.nudgeRotateDeg,
              JSON.stringify(tuneDraftByAspect.story.keywordEmphasis)
            ].join('\0');
          const updateStripLayoutLabel = () => {
            const label = modal.querySelector('[data-strip-layout-label]');
            if (label) {
              label.textContent = stripLayoutSeed === 0 ? '#1 (default)' : `#${stripLayoutSeed + 1}`;
            }
          };
          updateStripLayoutLabel();

          const getKeywordEmphasisFromForm = () => {
            const QKE = globalThis.QuoteKeywordEmphasis;
            const LBKE = globalThis.LayoutBKeywordEmphasis;
            const rawInput = String(kwInput.value || '').trim();
            let keywords = [];
            if (QKE?.parseEmphasisWordsInput) {
              keywords = QKE.parseEmphasisWordsInput(rawInput, qText);
            }
            if (!keywords.length && rawInput) {
              keywords = rawInput
                .split(/[,;\n]+/)
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 3);
            }
            let styles = LBKE?.normalizeStyleList
              ? LBKE.normalizeStyleList(styleChecks.filter((cb) => cb.checked).map((cb) => cb.dataset.style))
              : styleChecks.filter((cb) => cb.checked).map((cb) => cb.dataset.style);
            if (keywords.length && !styles.length) styles = ['bold'];
            const out = keywords.length ? { keywords, styles } : null;
            if (!keywords.length) return null;
            return out;
          };

          const keywordValidationHint = () => {
            const rawInput = String(kwInput.value || '').trim();
            if (!rawInput) return '';
            const QKE = globalThis.QuoteKeywordEmphasis;
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
            const nudgeDisabled = currentPreset === 'AUTO';
            for (const [name, btn] of presetButtons) {
              const active = name === currentPreset;
              btn.style.background = active ? '#222' : '#fff';
              btn.style.color = active ? '#fff' : '#000';
              btn.style.borderColor = active ? '#222' : '#aaa';
            }
            const label = modal.querySelector('[data-preset-label]');
            if (label) label.textContent = currentPreset;
            const nudgeLabelEl = modal.querySelector('[data-nudge-label]');
            if (nudgeLabelEl) {
              const parts = [];
              if (!nudgeDisabled && (nudgeCx || nudgeCy)) {
                parts.push(`nudge ${formatNudgePct(nudgeCx)}% / ${formatNudgePct(nudgeCy)}%`);
              }
              if (!nudgeDisabled && nudgeRotateDeg) {
                const r = Math.round(nudgeRotateDeg * 10) / 10;
                parts.push(`rotate ${r > 0 ? '+' : ''}${r}°`);
              }
              nudgeLabelEl.textContent = parts.length ? ` · ${parts.join(' · ')}` : '';
            }
            for (const btn of nudgeBtns) {
              btn.disabled = nudgeDisabled;
              btn.style.opacity = nudgeDisabled ? '0.45' : '1';
              btn.style.cursor = nudgeDisabled ? 'not-allowed' : 'pointer';
            }
            const resetNudgeBtn = nudgeWrap?.querySelector('button[data-action="reset-nudge"]');
            if (resetNudgeBtn) {
              resetNudgeBtn.disabled = nudgeDisabled || (!nudgeCx && !nudgeCy && !nudgeRotateDeg);
              resetNudgeBtn.style.opacity = resetNudgeBtn.disabled ? '0.45' : '1';
            }
          };

          const updateAspectButtons = () => {
            for (const btn of aspectBtns) {
              const active = btn.dataset.aspect === previewAspect;
              btn.classList.toggle('is-active', active);
              btn.style.background = active ? '#222' : '#fff';
              btn.style.color = active ? '#fff' : '#000';
              btn.style.borderColor = active ? '#222' : '#aaa';
            }
            previewWrap.style.aspectRatio = previewAspect === 'post' ? '4/5' : '9/16';
          };
          applyDraftToUi('story');

          const scheduleKeywordPreview = () => {
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
              syncQuoteStyleDraftsFromUi();
              renderPreview(currentPreset);
            }, 400);
          };

          const buildTuneComposeOpts = (presetName, aspect) => {
            const a = odqNormalizeTuneAspect(aspect);
            const quoteStyle = quoteStyleForAspect(a);
            const composeOpts = {
              tuneAspect: a,
              keywordEmphasis: quoteStyle.keywordEmphasis,
              keywordEmphasisExplicit: true,
              stripLayoutSeed: quoteStyle.stripLayoutSeed,
              stripLayoutSeedExplicit: true
            };
            if (a === 'post') {
              composeOpts.quiltFit = 'cover';
              if (postQuoteStyleIndependent) {
                composeOpts.postQuoteStyleIndependent = true;
              } else {
                composeOpts.postStripLayoutFromStory = true;
                if (storyRefStripPlan && storyRefStripPlanKey === stripPlanCacheKey()) {
                  composeOpts.storyRefStripPlan = storyRefStripPlan;
                }
              }
              return composeOpts;
            }
            composeOpts.captureStoryRefStripPlan = true;
            composeOpts.onStoryRefStripPlan = (plan) => {
              storyRefStripPlan = plan;
              storyRefStripPlanKey = stripPlanCacheKey();
            };
            if (speakerImageForCanvas) {
              composeOpts.speakerOverlay = {
                enabled: true,
                imageUrl: speakerImageForCanvas,
                name: speakerName,
                washColor,
                transform:
                  odqSpeakerCutoutTransformResolved(presetName, {
                    cx: nudgeCx,
                    cy: nudgeCy,
                    rotateDeg: nudgeRotateDeg
                  }) || undefined
              };
            }
            return composeOpts;
          };

          const ensureStoryStripPlanCache = async (presetName, token) => {
            if (postQuoteStyleIndependent) return false;
            const pk = stripPlanCacheKey();
            if (storyRefStripPlan && storyRefStripPlanKey === pk) return true;
            const seedOpts = buildTuneComposeOpts(presetName, 'story');
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

          const renderPreview = async (presetName) => {
            if (!tuneAssetsReady || !highResBlob) {
              return;
            }
            syncQuoteStyleDraftsFromUi();
            renderToken += 1;
            const myToken = renderToken;
            try {
              const layoutW = 1080;
              const layoutH = previewAspect === 'post' ? 1350 : 1920;
              if (previewAspect === 'post' && !postQuoteStyleIndependent) {
                await ensureStoryStripPlanCache(presetName, myToken);
                if (myToken !== renderToken) return;
              }
              const composeOpts = buildTuneComposeOpts(presetName, previewAspect);
              const outBlob = await composeInstagramLayoutBFromQuiltBlob(
                highResBlob,
                qText,
                qAuthor,
                layoutW,
                layoutH,
                todayKey,
                composeOpts
              );
              if (myToken !== renderToken) {
                return;
              }
              if (!outBlob) {
                this.uiService.showToast('Render failed');
                setTuneDebug(`render fail ${layoutW}×${layoutH}`);
                return;
              }
              const newUrl = URL.createObjectURL(outBlob);
              if (currentBlobUrl) {
                try { URL.revokeObjectURL(currentBlobUrl); } catch (_) { /* */ }
              }
              currentBlobUrl = newUrl;
              previewImg.removeAttribute('hidden');
              previewImg.src = newUrl;
              setTuneDebug(
                `ok ${layoutW}×${layoutH} ${previewAspect} seed story:${tuneDraftByAspect.story.stripLayoutSeed} post:${tuneDraftByAspect.post.stripLayoutSeed}${postQuoteStyleIndependent ? ' post-indep' : ''} ${tuneQuiltSource} tok ${myToken}/${renderToken}`
              );
            } catch (renderErr) {
              setTuneDebug(`err ${String(renderErr?.message || renderErr).slice(0, 60)}`);
              this.errorHandler.handleError(renderErr, 'adminTuneSpeakerCutout:render');
            }
          };

          presetsWrap.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-preset]');
            if (!btn) return;
            const name = btn.dataset.preset;
            if (!name || !Object.prototype.hasOwnProperty.call(globalThis.ODQ_SPEAKER_PRESETS, name)) return;
            markTuneUiDirty();
            currentPreset = name;
            storyRefStripPlan = null;
            storyRefStripPlanKey = '';
            nudgeCx = 0;
            nudgeCy = 0;
            nudgeRotateDeg = 0;
            updateActiveButton();
            renderPreview(name);
          });

          if (nudgeWrap) {
            nudgeWrap.addEventListener('click', (e) => {
              const nudgeBtn = e.target.closest('button[data-nudge]');
              if (nudgeBtn) {
                if (currentPreset === 'AUTO') return;
                markTuneUiDirty();
                const dir = nudgeBtn.dataset.nudge;
                const step = globalThis.ODQ_SPEAKER_NUDGE_STEP;
                if (dir === 'left') nudgeCx -= step;
                else if (dir === 'right') nudgeCx += step;
                else if (dir === 'up') nudgeCy -= step;
                else if (dir === 'down') nudgeCy += step;
                nudgeCx = odqNormalizeSpeakerNudgeComponent(nudgeCx);
                nudgeCy = odqNormalizeSpeakerNudgeComponent(nudgeCy);
                updateActiveButton();
                renderPreview(currentPreset);
                return;
              }
              const rotateBtn = e.target.closest('button[data-rotate]');
              if (rotateBtn) {
                if (currentPreset === 'AUTO') return;
                markTuneUiDirty();
                const step = globalThis.ODQ_SPEAKER_ROTATE_STEP_DEG;
                if (rotateBtn.dataset.rotate === 'cw') nudgeRotateDeg += step;
                else if (rotateBtn.dataset.rotate === 'ccw') nudgeRotateDeg -= step;
                nudgeRotateDeg = odqNormalizeSpeakerRotateDeg(nudgeRotateDeg);
                updateActiveButton();
                renderPreview(currentPreset);
                return;
              }
              const resetNudge = e.target.closest('button[data-action="reset-nudge"]');
              if (resetNudge) {
                markTuneUiDirty();
                nudgeCx = 0;
                nudgeCy = 0;
                nudgeRotateDeg = 0;
                updateActiveButton();
                renderPreview(currentPreset);
              }
            });
          }

          const switchPreviewAspect = (nextAspect) => {
            const next = nextAspect === 'post' ? 'post' : 'story';
            if (next === previewAspect) return;
            if (kwRenderTimer) {
              clearTimeout(kwRenderTimer);
              kwRenderTimer = 0;
            }
            captureDraftFromUi(previewAspect);
            if (next === 'post' && !postQuoteStyleIndependent) {
              copyStoryQuoteStyleToPost();
            }
            previewAspect = next;
            applyDraftToUi(previewAspect);
            updateAspectButtons();
            setTuneDebug(`aspect→${previewAspect}`);
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
              const btn = e.target.closest('button[data-action="shuffle-strips"]');
              if (!btn) return;
              markTuneUiDirty();
              stripLayoutSeed = odqNormalizeStripLayoutSeed(stripLayoutSeed + 1);
              if (stripLayoutSeed <= 0) stripLayoutSeed = 1;
              if (previewAspect === 'post' && !postQuoteStyleIndependent) {
                tuneDraftByAspect.story.stripLayoutSeed = stripLayoutSeed;
                copyStoryQuoteStyleToPost();
                storyRefStripPlan = null;
                storyRefStripPlanKey = '';
              } else {
                if (previewAspect === 'post') markPostQuoteStyleEdited();
                syncQuoteStyleDraftsFromUi();
              }
              updateStripLayoutLabel();
              renderPreview(currentPreset);
            });
          }

          kwInput.addEventListener('input', () => {
            markTuneUiDirty();
            markPostQuoteStyleEdited();
            scheduleKeywordPreview();
          });
          kwInput.addEventListener('change', () => {
            markTuneUiDirty();
            markPostQuoteStyleEdited();
            scheduleKeywordPreview();
          });
          kwInput.addEventListener('blur', () => {
            markTuneUiDirty();
            markPostQuoteStyleEdited();
            scheduleKeywordPreview();
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
            markPostQuoteStyleEdited();
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
            if (currentBlobUrl) {
              try { URL.revokeObjectURL(currentBlobUrl); } catch (_) { /* */ }
              currentBlobUrl = null;
            }
            this._speakerTuneModalOpen = false;
            modal.remove();
          };

          actionsWrap.addEventListener('click', (e) => {
            const action = e.target.closest('button[data-action]')?.dataset?.action;
            if (action === 'close') {
              close();
            } else if (action === 'reset') {
              markTuneUiDirty();
              const a = odqNormalizeTuneAspect(previewAspect);
              tuneDraftByAspect[a].preset = 'AUTO';
              tuneDraftByAspect[a].nudgeCx = 0;
              tuneDraftByAspect[a].nudgeCy = 0;
              tuneDraftByAspect[a].nudgeRotateDeg = 0;
              tuneDraftByAspect[a].stripLayoutSeed = 0;
              tuneDraftByAspect[a].keywordEmphasis = null;
              if (a === 'story') {
                copyStoryQuoteStyleToPost();
                postQuoteStyleIndependent = false;
              }
              storyRefStripPlan = null;
              storyRefStripPlanKey = '';
              currentPreset = 'AUTO';
              nudgeCx = 0;
              nudgeCy = 0;
              nudgeRotateDeg = 0;
              stripLayoutSeed = 0;
              kwInput.value = '';
              for (const cb of styleChecks) cb.checked = false;
              applyTuneKeywordForm(null);
              updateActiveButton();
              updateStripLayoutLabel();
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
                  captureDraftFromUi(previewAspect);
                  if (!postQuoteStyleIndependent) {
                    copyStoryQuoteStyleToPost();
                  } else if (odqNormalizeTuneAspect(previewAspect) === 'story') {
                    copyStoryQuoteStyleToPost();
                    postQuoteStyleIndependent = false;
                  }
                  const rawKw = String(kwInput.value || '').trim();
                  const activeKw = tuneDraftByAspect[odqNormalizeTuneAspect(previewAspect)].keywordEmphasis;
                  if (rawKw && !activeKw?.keywords?.length) {
                    const hint = keywordValidationHint();
                    this.uiService.showToast(hint || 'Fix keywords for this preview (Story or Post)');
                    setTuneDebug('save blocked: keywords');
                    if (saveBtn) saveBtn.disabled = false;
                    return;
                  }
                  const tuneSavedAt = new Date().toISOString();
                  for (const aspect of ['story', 'post']) {
                    const d = tuneDraftByAspect[aspect];
                    odqWriteSpeakerCutoutPreset(saveDateKey, d.preset, aspect, {
                      cx: d.nudgeCx,
                      cy: d.nudgeCy,
                      rotateDeg: d.nudgeRotateDeg,
                      updatedAt: tuneSavedAt
                    });
                    odqSetCachedLayoutBKeywordEmphasis(saveDateKey, d.keywordEmphasis, aspect);
                    odqSetCachedLayoutBStripLayoutSeed(saveDateKey, d.stripLayoutSeed, aspect);
                  }
                  let cloudOk = false;
                  let serverVerify = null;
                  if (window.db && window.firestore) {
                    try {
                      if (typeof this.initializeFirebaseForImages === 'function') {
                        await odqPromiseWithTimeout(
                          this.initializeFirebaseForImages(),
                          30000,
                          'Firebase sign-in for tune save'
                        );
                      }
                      await Promise.all(
                        ['story', 'post'].map(async (aspect) => {
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
                              rotateDeg: d.nudgeRotateDeg
                            }),
                            12000,
                            `Speaker save (${aspect})`
                          );
                        })
                      );
                      serverVerify = await odqPromiseWithTimeout(
                        odqVerifyLayoutBTuneOnServer(saveDateKey, tuneDraftByAspect),
                        10000,
                        'Verify tune on server'
                      );
                      cloudOk = !!serverVerify?.ok;
                    } catch (cloudErr) {
                      cloudOk = false;
                      serverVerify = { ok: false, reason: String(cloudErr?.message || cloudErr) };
                      this.logger.warn('Tune save: Firestore write/verify failed, kept local cache', cloudErr);
                    }
                  } else {
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
                    return bits.length ? ` ${bits.join(' ')}` : '';
                  };
                  const saveSummary = `Story: ${tuneDraftByAspect.story.preset}${fmtNudge(tuneDraftByAspect.story)}, ${fmtKw(tuneDraftByAspect.story)}, ${fmtStrip(tuneDraftByAspect.story.stripLayoutSeed)} · Post: ${tuneDraftByAspect.post.preset}${fmtNudge(tuneDraftByAspect.post)}, ${fmtKw(tuneDraftByAspect.post)}, ${fmtStrip(tuneDraftByAspect.post.stripLayoutSeed)}`;
                  if (cloudOk) {
                    const serverTuneAt = String(serverVerify?.layoutBTuneUpdatedAt || tuneSavedAt || '').trim();
                    if (serverTuneAt) {
                      for (const aspect of ['story', 'post']) {
                        const d = tuneDraftByAspect[aspect];
                        odqWriteSpeakerCutoutPreset(saveDateKey, d.preset, aspect, {
                          cx: d.nudgeCx,
                          cy: d.nudgeCy,
                          rotateDeg: d.nudgeRotateDeg,
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
                      `Saved on device only — instagram-images/${saveDateKey} not on server yet. ${saveSummary}`,
                      16000
                    );
                  } else {
                    this.uiService.showToast(
                      `Saved on device — server: ${serverVerify?.reason || 'not verified'}. ${saveSummary}`,
                      16000
                    );
                  }
                  close();
                  try {
                    this._layoutBStoryPreviewHeavyDoneThisVisit = false;
                    this._invalidateLayoutBStoryPreviewForAppDayChange?.();
                    this.scheduleLayoutBStoryPreviewRefresh?.();
                    this.quoteService?.forceRefreshQuoteScreenLayoutBFromTuneSave?.();
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

          document.body.appendChild(modal);
          this._speakerTuneModalOpen = true;
          this._speakerTuneModalOpening = false;
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
              const [quiltBlob, kwStory, stripStory, kwPost, stripPost] = await Promise.all([
                odqPromiseWithTimeout(this.getQuiltBlobForTunePreview(), 45000, 'Quilt preview').then((r) =>
                  r && typeof r === 'object' ? r : { blob: r, quiltSource: 'legacy' }
                ),
                odqPromiseWithTimeout(odqReadLayoutBKeywordEmphasis(todayKey, 'story'), 5000, 'Story keywords').catch(
                  () => null
                ),
                odqPromiseWithTimeout(odqReadLayoutBStripLayoutSeed(todayKey, 'story'), 5000, 'Story layout').catch(
                  () => odqGetCachedLayoutBStripLayoutSeed(todayKey, 'story') ?? 0
                ),
                odqPromiseWithTimeout(odqReadLayoutBKeywordEmphasis(todayKey, 'post'), 5000, 'Post keywords').catch(
                  () => null
                ),
                odqPromiseWithTimeout(odqReadLayoutBStripLayoutSeed(todayKey, 'post'), 5000, 'Post layout').catch(
                  () => odqGetCachedLayoutBStripLayoutSeed(todayKey, 'post') ?? 0
                )
              ]);
              const quiltPack = quiltBlob && typeof quiltBlob === 'object' ? quiltBlob : { blob: quiltBlob, quiltSource: 'unknown' };
              highResBlob = quiltPack.blob;
              tuneQuiltSource = quiltPack.quiltSource || 'unknown';
              if (!highResBlob) throw new Error('Could not build quilt image');
              setTuneDebug(`assets ${tuneQuiltSource} q:${String(qText).slice(0, 20)}…`);
              if (!tuneUiDirty) {
                tuneDraftByAspect.story.keywordEmphasis = kwStory;
                tuneDraftByAspect.story.stripLayoutSeed = odqNormalizeStripLayoutSeed(stripStory);
                tuneDraftByAspect.post.keywordEmphasis = kwPost;
                tuneDraftByAspect.post.stripLayoutSeed = odqNormalizeStripLayoutSeed(stripPost);
                postQuoteStyleIndependent = false;
                copyStoryQuoteStyleToPost();
                storyRefStripPlan = null;
                storyRefStripPlanKey = '';
                savedKeywordEmphasis = kwStory;
                applyDraftToUi(previewAspect);
              } else {
                captureDraftFromUi(previewAspect);
              }
              tuneAssetsReady = true;
              spinner.hidden = true;
              spinner.style.display = 'none';
              void ensureOdqCanvasFontsReady();
              scheduleKeywordPreview();
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
          this._speakerTuneModalOpening = false;
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
       * Runs the same Notion ↔ Firestore jobs as GitHub Actions (quotes from Notion, then usage back to Notion).
       * Server: POST /api/sync-notion-firestore with header x-notion-sync-token (NOTION_SYNC_TOKEN or RESET_TOKEN on Railway).
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

          const url = `${baseUrl.replace(/\/$/, '')}/api/sync-notion-firestore`;
          this.uiService.showToast('Running Notion ↔ Firestore sync…', 8000);
          console.log('Notion sync POST', url);

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
              body: '{}',
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

          this.uiService.showToast('✅ Notion ↔ Firestore sync finished', 6000);
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

      /** Read device + server tune settings (instagram-images/{dateKey}). */
      async handleAdminVerifyLayoutBTuneSettings() {
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
        const fmtKw = (kw) => (kw?.keywords?.length ? kw.keywords.join(', ') : 'none');
        const fmtStrip = (n) => (n === 0 ? '#1' : `#${n + 1}`);
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
          return bits.length ? ` ${bits.join(' ')}` : '';
        };
        const deviceLine = `Device: Story ${storyTweak.preset}${fmtNudge(storyTweak)}, ${fmtKw(storyKw)}, ${fmtStrip(storyStrip)} · Post ${postTweak.preset}${fmtNudge(postTweak)}, ${fmtKw(postKw)}, ${fmtStrip(postStrip)}`;
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
              serverLine = `Server instagram-images/${dk}${srcTag}: Story ${ss}${serverTweak(snCx, snCy, snRot)}, ${fmtKw(sk)}, ${fmtStrip(sStrip)} · Post ${ps}${serverTweak(pnCx, pnCy, pnRot)}, ${fmtKw(pk)}, ${fmtStrip(pStrip)}`;
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
       * Railway POST /api/generate-instagram reads this doc so Zapier can use imageUrl and postLayoutBImageUrl.
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
          if (!arch?.generateInstagramImage) {
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
          const instagramImage = await odqPromiseWithTimeout(
            arch.generateInstagramImage(blocks),
            90000,
            'Classic IG image generation'
          );
          let quiltScreen9x16ImageData = null;
          if (arch.generateInstagramQuiltScreen9x16ImageData) {
            quiltScreen9x16ImageData = await odqPromiseWithTimeout(
              arch.generateInstagramQuiltScreen9x16ImageData(blocks, today),
              90000,
              'Quilt screen 9:16 generation'
            );
          }
          let postLayoutBImageData = null;
          if (arch.generateInstagramPostLayoutBImage) {
            postLayoutBImageData = await odqPromiseWithTimeout(
              arch.generateInstagramPostLayoutBImage(blocks, todayQuote, today),
              120000,
              'Layout B IG image generation'
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
          const layoutBAliasesSpeaker = false;
          if (!instagramImage && !postLayoutBImageData && !storyLayoutBImageData && !quiltScreen9x16ImageData) {
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
            instagramImage,
            quiltScreen9x16ImageData,
            postLayoutBImageData,
            postLayoutBSpeakerImageData,
            storyLayoutBImageData,
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
      _createMyBlockSparkleBurst(g, bbox, cx, cy, pad) {
        if (!g || !bbox) return null;
        const NS = 'http://www.w3.org/2000/svg';
        const burst = document.createElementNS(NS, 'g');
        burst.setAttribute('class', 'quilt-my-block-sparkle-burst');
        burst.setAttribute('aria-hidden', 'true');

        const starD =
          'M0,-11 L3.2,-3.2 L11,0 L3.2,3.2 L0,11 L-3.2,3.2 L-11,0 L-3.2,-3.2 Z';

        const spots = [
          { x: cx, y: bbox.y - pad },
          { x: cx, y: bbox.y + bbox.height + pad },
          { x: bbox.x - pad * 0.9, y: cy },
          { x: bbox.x + bbox.width + pad * 0.9, y: cy },
          { x: bbox.x - pad * 0.35, y: bbox.y - pad * 0.5 },
          { x: bbox.x + bbox.width + pad * 0.35, y: bbox.y - pad * 0.5 },
          { x: bbox.x - pad * 0.35, y: bbox.y + bbox.height + pad * 0.5 },
          { x: bbox.x + bbox.width + pad * 0.35, y: bbox.y + bbox.height + pad * 0.5 }
        ];

        spots.forEach((p, i) => {
          const shell = document.createElementNS(NS, 'g');
          shell.setAttribute('transform', `translate(${p.x}, ${p.y})`);
          const path = document.createElementNS(NS, 'path');
          path.setAttribute('d', starD);
          path.setAttribute('fill', 'rgba(255, 250, 220, 0.97)');
          path.setAttribute('stroke', 'rgba(255, 175, 40, 0.92)');
          path.setAttribute('stroke-width', '0.85');
          shell.appendChild(path);
          burst.appendChild(shell);

          const endRot = (i % 2 === 0 ? 1 : -1) * (22 + (i % 4) * 10);
          try {
            shell.animate(
              [
                { opacity: 0, transform: 'scale(0.12) rotate(0deg)' },
                { opacity: 1, transform: 'scale(1.35) rotate(22deg)', offset: 0.22 },
                { opacity: 1, transform: 'scale(1.05) rotate(40deg)', offset: 0.42 },
                { opacity: 0, transform: `scale(0.3) rotate(${endRot}deg)`, offset: 1 }
              ],
              {
                duration: 2100,
                delay: i * 60,
                fill: 'none',
                easing: 'cubic-bezier(0.2, 0.85, 0.36, 1)'
              }
            );
          } catch (e) {
            /* ignore */
          }
        });

        g.appendChild(burst);
        return burst;
      }

      /** Latest block id tied to this device / app user (contributions or block contributorId). */
      getMySpotlightBlockId() {
        const ids = this._devicePersonalColorUserIds();
        const belongs = (block) => this._todayPieceBelongsToDevice(block, ids);
        const subs = [
          ...(this.quiltEngine.getLifetimeUserContributions?.()?.submissions || []),
          ...(this.quiltEngine.getUserContributions?.()?.submissions || [])
        ];
        let lastContribId = null;
        for (const c of subs) {
          if (c && ids.has(String(c.userId || '').trim())) {
            lastContribId = c.blockId;
          }
        }
        if (lastContribId && this.quiltEngine.blocks.some((b) => b.id === lastContribId)) {
          return lastContribId;
        }
        const mine = this.quiltEngine.blocks.filter(belongs);
        if (mine.length) {
          return mine[mine.length - 1].id;
        }
        return null;
      }

      getDedicatedBlockId() {
        const latest = String(this._latestDedicatedBlockId || localStorage.getItem('ourDailyLatestDedicatedBlockId') || '').trim();
        if (latest && this.quiltEngine.blocks.some((b) => b.id === latest)) {
          return latest;
        }
        return this.getMySpotlightBlockId();
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

      handleShowMyBlock() {
        const blockId = this.getMySpotlightBlockId();
        if (!blockId) {
          this.uiService.showToast('Add your color first — your square will show up here once you join the quilt.');
          return;
        }

        const esc =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(String(blockId))
            : String(blockId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const poly = document.querySelector(`#quilt [data-block-id="${esc}"]`);
        if (!poly) {
          this.uiService.showToast('Your square is not on the quilt right now.');
          return;
        }

        const g = poly.parentElement;
        if (!g || String(g.tagName).toLowerCase() !== 'g') {
          return;
        }

        g.querySelectorAll('.quilt-my-block-sparkle-burst').forEach(el => el.remove());

        if (this._myBlockSpotlightAnim) {
          try {
            this._myBlockSpotlightAnim.cancel();
          } catch (e) {
            /* ignore */
          }
          this._myBlockSpotlightAnim = null;
        }

        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) {
          poly.classList.add('user-piece-highlight');
          poly.classList.add('wiggle');
          setTimeout(() => poly.classList.remove('wiggle'), 1300);
          this.uiService.showToast('Your square is highlighted.');
          return;
        }

        const svg = g.parentNode;
        if (!svg) {
          return;
        }

        const nextSibling = g.nextSibling;
        const restoreOrder = () => {
          try {
            if (nextSibling && nextSibling.parentNode === svg) {
              svg.insertBefore(g, nextSibling);
            }
          } catch (e) {
            /* ignore */
          }
        };

        svg.appendChild(g);
        g.classList.add('quilt-my-block-spotlight');

        let bbox;
        try {
          bbox = g.getBBox();
        } catch (e) {
          bbox = { x: 0, y: 0, width: 80, height: 80 };
        }
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;

        const compose = (scale, ty, rotDeg) => {
          const r = rotDeg || 0;
          return `translate(0px, ${ty}px) scale(${scale}) rotate(${r}deg)`;
        };
        g.style.transformBox = 'fill-box';
        g.style.transformOrigin = 'center';

        const pad = Math.max(10, Math.min(bbox.width, bbox.height) * 0.12);
        const sparkleBurst = this._createMyBlockSparkleBurst(g, bbox, cx, cy, pad);

        const keyframes = [
          { transform: compose(1, 0, 0), easing: 'cubic-bezier(0.18, 0.9, 0.32, 1.15)' },
          { transform: compose(1.18, -12, 0), offset: 0.11 },
          { transform: compose(1.18, -12, -3.2), offset: 0.16, easing: 'ease-in-out' },
          { transform: compose(1.18, -12, 3.3), offset: 0.22, easing: 'ease-in-out' },
          { transform: compose(1.18, -12, -2.8), offset: 0.28, easing: 'ease-in-out' },
          { transform: compose(1.18, -12, 2.8), offset: 0.34, easing: 'ease-in-out' },
          { transform: compose(1.18, -12, -2.2), offset: 0.4, easing: 'ease-in-out' },
          { transform: compose(1.18, -12, 2.2), offset: 0.46, easing: 'ease-in-out' },
          { transform: compose(1.18, -12, -1.5), offset: 0.52, easing: 'ease-in-out' },
          { transform: compose(1.18, -12, 1.5), offset: 0.58, easing: 'ease-in-out' },
          { transform: compose(1.18, -12, 0), offset: 0.64 },
          { transform: compose(1.06, -3, 0), offset: 0.8, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
          { transform: compose(1, 0, 0), offset: 1 }
        ];

        const anim = g.animate(keyframes, { duration: 5600, fill: 'none' });
        this._myBlockSpotlightAnim = anim;

        const done = () => {
          g.classList.remove('quilt-my-block-spotlight');
          if (sparkleBurst && sparkleBurst.parentNode) {
            sparkleBurst.remove();
          }
          restoreOrder();
          this._myBlockSpotlightAnim = null;
        };

        anim.onfinish = done;
        anim.oncancel = done;
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

      /** Saved pick for display (color card, triptych) — submission color matches Settings calendar. */
      _displayColorFromSubmissionAndBlock(submission, block) {
        const saved = Utils.validateHexColor(submission?.color) ? String(submission.color).trim() : '';
        const onQuilt = Utils.validateHexColor(block?.color) ? String(block.color).trim() : '';
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
        const dedicatedId = String(this.getDedicatedBlockId?.() || '').trim();
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
          if (!block && Number.isFinite(subIndex)) {
            block = blocks.find((b) => Number(b?.submissionIndex) === subIndex && belongsToDevice(b)) || null;
          }
          if (!block) {
            const submissionColor = String(submission.color || '').trim().toLowerCase();
            block = blocks
              .filter(
                (b) =>
                  belongsToDevice(b) &&
                  String(b?.color || '').trim().toLowerCase() === submissionColor
              )
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

      refreshQuiltUserShapeCard() {
        const wrap = document.getElementById('quiltUserColorCardWrap');
        const card = document.getElementById('quiltUserShapeCard');
        const togetherNoteWrap = document.getElementById('quiltUserColorTogetherNoteWrap');
        const togetherPaper = togetherNoteWrap?.querySelector('.quilt-user-color-together-note__paper');
        const swatch = document.getElementById('quiltUserShapeSwatch');
        const colorNameEl = document.getElementById('quiltUserShapeColorName');
        const colorHexEl = document.getElementById('quiltUserShapeColorHex');
        if (!wrap || !card) return;
        const data = this.getExitChamberTodayPieceData();
        if (!data) {
          wrap.hidden = true;
          wrap.setAttribute('aria-hidden', 'true');
          if (togetherNoteWrap) {
            togetherNoteWrap.hidden = true;
            togetherNoteWrap.setAttribute('aria-hidden', 'true');
          }
          if (colorNameEl) colorNameEl.textContent = '';
          if (colorHexEl) colorHexEl.textContent = '';
          card.style.removeProperty('--quilt-color-card-paper');
          swatch?.style.removeProperty('--quilt-user-piece-color');
          card.style.removeProperty('--quilt-user-piece-color');
          togetherPaper?.style.removeProperty('--quilt-together-paper-bg');
          return;
        }
        const displayName = Utils.getNameThanksDisplayName();
        const safeHex = this.normalizeHexColor(data.color) || String(data.color || '').trim();
        const colorSampleName = this.getPaintSampleColorName(safeHex);
        if (swatch) {
          swatch.style.setProperty('--quilt-user-piece-color', safeHex);
        }
        card.style.setProperty('--quilt-user-piece-color', safeHex);
        const cardstockPaper = Utils.colorCardstockPaperFromUserColor(safeHex);
        card.style.setProperty('--quilt-color-card-paper', cardstockPaper);
        if (togetherPaper) {
          togetherPaper.style.setProperty('--quilt-together-paper-bg', cardstockPaper);
        }
        if (colorNameEl) colorNameEl.textContent = colorSampleName;
        if (colorHexEl) colorHexEl.textContent = safeHex;
        wrap.hidden = false;
        wrap.removeAttribute('aria-hidden');
        if (togetherNoteWrap) {
          togetherNoteWrap.hidden = false;
          togetherNoteWrap.removeAttribute('aria-hidden');
          requestAnimationFrame(() => {
            this._maybeQuiltTogetherNoteWobble?.();
          });
        }
        card.setAttribute(
          'aria-label',
          `${displayName}'s color today, thank you for adding this color, ${colorSampleName}, ${safeHex}`
        );
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
        const personalEngine = new SimpleQuiltEngine(tempUserId);
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
        const personalEngine = new SimpleQuiltEngine(tempUserId);
        personalEngine.recordUserContribution = () => {};
        personalEngine._suppressSplitWarnings = true;
        personalEngine.initialize();

        for (const hex of list) {
          const added = personalEngine.addColor(hex);
          if (!added) break;
        }

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
