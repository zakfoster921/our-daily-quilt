/**
 * Archive Application
 * Handles loading and displaying daily quilts in an archive format
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

import { CONFIG } from './config.js';
import { 
  formatDate, 
  showToast, 
  showLoading, 
  handleError,
  safeAddEventListener,
  getTodayKey,
  deepClone
} from './utils.js';

class ArchiveApp {
  constructor() {
    this.db = null;
    this.archiveEntries = [];
    this.currentShareEntry = null;
    this.isInitialized = false;
    
    // Quote data (same as main app)
    this.quotes = [
      { text: "Art washes away from the soul the dust of everyday life.", author: "— Pablo Picasso" },
      { text: "Creativity takes courage.", author: "— Henri Matisse" },
      { text: "Every artist was first an amateur.", author: "— Ralph Waldo Emerson" },
      { text: "Color is the keyboard, the eyes are the harmonies, the soul is the piano with many strings.", author: "— Wassily Kandinsky" },
      { text: "Great things are done by a series of small things brought together.", author: "— Vincent Van Gogh" },
      { text: "You can't use up creativity. The more you use, the more you have.", author: "— Maya Angelou" }
    ];
    
    // Manual shuffle for consistent daily quotes
    this.shuffledIndexes = [2, 4, 0, 5, 3, 1];
  }

  /**
   * Initialize the archive application
   */
  async initialize() {
    try {
      showLoading(true, 'archive-loading');
      
      // Initialize Firebase
      await this.initializeFirebase();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Load archive data
      await this.loadArchiveData();
      
      // Render archive entries
      this.renderArchiveEntries();
      
      this.isInitialized = true;
      showLoading(false, 'archive-loading');
      
      console.log('ArchiveApp initialized successfully');
    } catch (error) {
      handleError(error, 'ArchiveApp.initialize');
      showLoading(false, 'archive-loading');
      showToast('Failed to load archive. Please refresh.', 'archive-toast');
    }
  }

  /**
   * Initialize Firebase
   */
  async initializeFirebase() {
    try {
      const app = initializeApp(CONFIG.FIREBASE);
      this.db = getFirestore(app);
      
      console.log('Firebase initialized successfully for archive');
    } catch (error) {
      handleError(error, 'Firebase initialization');
      throw error;
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    try {
      // Close share modal
      const closeShareBtn = document.getElementById('close-share-modal');
      if (closeShareBtn) {
        safeAddEventListener(closeShareBtn, 'click', () => {
          this.closeShareModal();
        });
      }

      // Download share image
      const downloadShareBtn = document.getElementById('download-share');
      if (downloadShareBtn) {
        safeAddEventListener(downloadShareBtn, 'click', () => {
          this.downloadShareImage();
        });
      }

      // Copy share link
      const copyShareLinkBtn = document.getElementById('copy-share-link');
      if (copyShareLinkBtn) {
        safeAddEventListener(copyShareLinkBtn, 'click', () => {
          this.copyShareLink();
        });
      }

      // Close modal on backdrop click
      const shareModal = document.getElementById('share-modal');
      if (shareModal) {
        safeAddEventListener(shareModal, 'click', (e) => {
          if (e.target === shareModal) {
            this.closeShareModal();
          }
        });
      }

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeShareModal();
        }
      });

    } catch (error) {
      handleError(error, 'ArchiveApp.setupEventListeners');
    }
  }

  /**
   * Load archive data from Firebase
   */
  async loadArchiveData() {
    try {
      console.log('Loading archive data...');
      
      // Get all quilt documents from Firestore
      const quiltsRef = collection(this.db, "quilts");
      const q = query(quiltsRef, orderBy("date", "desc"), limit(50));
      const querySnapshot = await getDocs(q);
      
      this.archiveEntries = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data && data.blocks && data.blocks.length > 0) {
          const entry = {
            id: doc.id,
            date: data.date || doc.id,
            blocks: data.blocks,
            quote: this.getQuoteForDate(data.date || doc.id),
            contributorCount: this.calculateContributorCount(data.blocks)
          };
          this.archiveEntries.push(entry);
        }
      });
      
      // If no real data found, add placeholder entries for testing
      if (this.archiveEntries.length === 0) {
        console.log('No real data found, adding placeholder entries for testing');
        this.addPlaceholderEntries();
      }
      
      console.log(`Loaded ${this.archiveEntries.length} archive entries`);
      
    } catch (error) {
      handleError(error, 'ArchiveApp.loadArchiveData');
      console.log('Error loading data, adding placeholder entries for testing');
      this.addPlaceholderEntries();
    }
  }

  /**
   * Add placeholder entries for testing
   */
  addPlaceholderEntries() {
    const placeholderBlocks = [
      { x: 0, y: 0, width: 300, height: 300, color: '#f7b733' },
      { x: 300, y: 0, width: 300, height: 300, color: '#667eea' },
      { x: 0, y: 300, width: 300, height: 300, color: '#764ba2' },
      { x: 300, y: 300, width: 300, height: 300, color: '#f093fb' }
    ];

    const placeholderEntries = [
      {
        id: '2025-01-15',
        date: '2025-01-15',
        blocks: placeholderBlocks,
        quote: { text: "Art washes away from the soul the dust of everyday life.", author: "— Pablo Picasso" },
        contributorCount: 42
      },
      {
        id: '2025-01-14',
        date: '2025-01-14',
        blocks: [
          { x: 0, y: 0, width: 200, height: 200, color: '#ff6b6b' },
          { x: 200, y: 0, width: 200, height: 200, color: '#4ecdc4' },
          { x: 400, y: 0, width: 200, height: 200, color: '#45b7d1' },
          { x: 0, y: 200, width: 200, height: 200, color: '#96ceb4' },
          { x: 200, y: 200, width: 200, height: 200, color: '#feca57' },
          { x: 400, y: 200, width: 200, height: 200, color: '#ff9ff3' },
          { x: 0, y: 400, width: 200, height: 200, color: '#54a0ff' },
          { x: 200, y: 400, width: 200, height: 200, color: '#5f27cd' },
          { x: 400, y: 400, width: 200, height: 200, color: '#00d2d3' }
        ],
        quote: { text: "Creativity takes courage.", author: "— Henri Matisse" },
        contributorCount: 28
      },
      {
        id: '2025-01-13',
        date: '2025-01-13',
        blocks: [
          { x: 0, y: 0, width: 150, height: 150, color: '#ff9ff3' },
          { x: 150, y: 0, width: 150, height: 150, color: '#54a0ff' },
          { x: 300, y: 0, width: 150, height: 150, color: '#5f27cd' },
          { x: 450, y: 0, width: 150, height: 150, color: '#00d2d3' },
          { x: 0, y: 150, width: 150, height: 150, color: '#ff6b6b' },
          { x: 150, y: 150, width: 150, height: 150, color: '#4ecdc4' },
          { x: 300, y: 150, width: 150, height: 150, color: '#45b7d1' },
          { x: 450, y: 150, width: 150, height: 150, color: '#96ceb4' },
          { x: 0, y: 300, width: 150, height: 150, color: '#feca57' },
          { x: 150, y: 300, width: 150, height: 150, color: '#ff9ff3' },
          { x: 300, y: 300, width: 150, height: 150, color: '#54a0ff' },
          { x: 450, y: 300, width: 150, height: 150, color: '#5f27cd' },
          { x: 0, y: 450, width: 150, height: 150, color: '#00d2d3' },
          { x: 150, y: 450, width: 150, height: 150, color: '#ff6b6b' },
          { x: 300, y: 450, width: 150, height: 150, color: '#4ecdc4' },
          { x: 450, y: 450, width: 150, height: 150, color: '#45b7d1' }
        ],
        quote: { text: "Every artist was first an amateur.", author: "— Ralph Waldo Emerson" },
        contributorCount: 16
      }
    ];

    this.archiveEntries = placeholderEntries;
  }

  /**
   * Get quote for a specific date
   */
  getQuoteForDate(dateString) {
    try {
      const date = new Date(dateString);
      const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
      const quoteIndex = this.shuffledIndexes[dayOfYear % this.quotes.length];
      return this.quotes[quoteIndex];
    } catch (error) {
      console.warn('Error getting quote for date:', error);
      return this.quotes[0]; // Fallback to first quote
    }
  }

  /**
   * Calculate contributor count from blocks
   */
  calculateContributorCount(blocks) {
    if (!blocks || !Array.isArray(blocks)) return 0;
    
    // Count unique contributors (blocks with different colors)
    const uniqueColors = new Set();
    blocks.forEach(block => {
      if (block.color) {
        uniqueColors.add(block.color);
      }
    });
    
    return uniqueColors.size;
  }

  /**
   * Render archive entries
   */
  renderArchiveEntries() {
    try {
      const archiveContent = document.getElementById('archive-content');
      if (!archiveContent) {
        throw new Error('Archive content element not found');
      }

      if (this.archiveEntries.length === 0) {
        archiveContent.innerHTML = `
          <div class="archive-empty">
            <h3>No quilts yet</h3>
            <p>Check back tomorrow to see the first community quilt!</p>
          </div>
        `;
        archiveContent.style.display = 'block';
        return;
      }

      const entriesHTML = this.archiveEntries.map((entry, index) => {
        return this.createArchiveEntryHTML(entry, index);
      }).join('');

      archiveContent.innerHTML = entriesHTML;
      archiveContent.style.display = 'block';

      // Add event listeners to share buttons
      this.setupShareButtons();

    } catch (error) {
      handleError(error, 'ArchiveApp.renderArchiveEntries');
    }
  }

  /**
   * Create HTML for a single archive entry
   */
  createArchiveEntryHTML(entry, index) {
    const formattedDate = formatDate(entry.date);
    const quiltSVG = this.createQuiltSVG(entry.blocks);
    
    return `
      <article class="archive-entry" data-entry-id="${entry.id}">
        <div class="archive-entry-header">
          <div class="archive-entry-date">${formattedDate}</div>
          <p class="archive-entry-quote">"${entry.quote.text}"</p>
          <p class="archive-entry-author">${entry.quote.author}</p>
        </div>
        
        <div class="archive-entry-quilt">
          <div class="archive-quilt-container">
            ${quiltSVG}
          </div>
        </div>
        
        <div class="archive-entry-stats">
          <div class="archive-contributors">
            <svg class="archive-contributors-icon" viewBox="0 0 24 24">
              <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.5 1.5 0 0 0 18.54 8H17c-.8 0-1.54.37-2.01 1l-2.7 3.6c-.39.52-.59 1.14-.59 1.76V18h2v-4.36c0-.2.12-.38.31-.46.19-.08.4-.04.55.1l2.1 2.1V18h2zm-8-2c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm-6 8c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
            </svg>
            <span>${entry.contributorCount} contributors</span>
          </div>
          
          <button class="archive-share-btn" data-entry-id="${entry.id}">
            <svg class="share-icon" viewBox="0 0 24 24">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
            </svg>
            Share
          </button>
        </div>
      </article>
    `;
  }

  /**
   * Create SVG for quilt blocks
   */
  createQuiltSVG(blocks) {
    try {
      const viewBox = "0 0 600 600";
      const svgContent = blocks.map(block => {
        const wobble = 6;
        const jitter = (val) => val + (Math.random() - 0.5) * wobble;
        
        const pathData = `M ${jitter(block.x)},${jitter(block.y)}
                          L ${jitter(block.x + block.width)},${jitter(block.y)}
                          L ${jitter(block.x + block.width)},${jitter(block.y + block.height)}
                          L ${jitter(block.x)},${jitter(block.y + block.height)} Z`;
        
        return `<path d="${pathData}" fill="${block.color}" filter="url(#wavyEdges)"/>`;
      }).join('');

      return `
        <svg class="archive-quilt-svg" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="wavyEdges" x="0" y="0" width="200%" height="200%">
              <feTurbulence baseFrequency="0.012" numOctaves="3" result="turb"/>
              <feDisplacementMap in="SourceGraphic" in2="turb" scale="3"/>
            </filter>
          </defs>
          ${svgContent}
        </svg>
      `;
    } catch (error) {
      handleError(error, 'ArchiveApp.createQuiltSVG');
      return '<div>Error rendering quilt</div>';
    }
  }

  /**
   * Set up share button event listeners
   */
  setupShareButtons() {
    const shareButtons = document.querySelectorAll('.archive-share-btn');
    shareButtons.forEach(button => {
      const entryId = button.getAttribute('data-entry-id');
      safeAddEventListener(button, 'click', () => {
        this.openShareModal(entryId);
      });
    });
  }

  /**
   * Open share modal for a specific entry
   */
  async openShareModal(entryId) {
    try {
      const entry = this.archiveEntries.find(e => e.id === entryId);
      if (!entry) {
        throw new Error('Entry not found');
      }

      this.currentShareEntry = entry;
      
      // Generate share image
      await this.generateShareImage(entry);
      
      // Show modal
      const modal = document.getElementById('share-modal');
      if (modal) {
        modal.style.display = 'flex';
      }

    } catch (error) {
      handleError(error, 'ArchiveApp.openShareModal');
      showToast('Failed to open share modal', 'archive-toast');
    }
  }

  /**
   * Close share modal
   */
  closeShareModal() {
    const modal = document.getElementById('share-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.currentShareEntry = null;
  }

  /**
   * Generate Instagram story-friendly share image
   */
  async generateShareImage(entry) {
    try {
      const canvas = document.getElementById('share-canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size for Instagram story (9:16 ratio)
      canvas.width = 1080;
      canvas.height = 1920;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#f6f4f1');
      gradient.addColorStop(1, '#e8e4e0');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Title
      ctx.fillStyle = '#2c2c2c';
      ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OUR DAILY', canvas.width / 2, 200);
      
      // Date
      ctx.fillStyle = '#666';
      ctx.font = '32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(formatDate(entry.date), canvas.width / 2, 280);
      
      // Quote
      ctx.fillStyle = '#2c2c2c';
      ctx.font = 'italic 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      
      // Word wrap for quote
      const maxWidth = canvas.width - 100;
      const words = entry.quote.text.split(' ');
      let line = '';
      let y = 400;
      
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line, canvas.width / 2, y);
          line = words[i] + ' ';
          y += 60;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, canvas.width / 2, y);
      
      // Author
      y += 80;
      ctx.fillStyle = '#666';
      ctx.font = '32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(entry.quote.author, canvas.width / 2, y);
      
      // Quilt
      const quiltSize = 800;
      const quiltX = (canvas.width - quiltSize) / 2;
      const quiltY = y + 100;
      
      // Create temporary SVG for quilt
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.createQuiltSVG(entry.blocks);
      const quiltSVG = tempDiv.firstElementChild;
      
      // Convert SVG to image
      const svgData = new XMLSerializer().serializeToString(quiltSVG);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, quiltX, quiltY, quiltSize, quiltSize);
        URL.revokeObjectURL(url);
      };
      img.src = url;
      
      // Contributors count
      ctx.fillStyle = '#666';
      ctx.font = '28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${entry.contributorCount} contributors`, canvas.width / 2, quiltY + quiltSize + 80);
      
      // Website URL
      ctx.fillStyle = '#999';
      ctx.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('ourdaily.community', canvas.width / 2, canvas.height - 100);
      
    } catch (error) {
      handleError(error, 'ArchiveApp.generateShareImage');
    }
  }

  /**
   * Download share image
   */
  downloadShareImage() {
    try {
      const canvas = document.getElementById('share-canvas');
      const link = document.createElement('a');
      link.download = `our-daily-${this.currentShareEntry?.date || 'quilt'}.png`;
      link.href = canvas.toDataURL();
      link.click();
      
      showToast('Image downloaded!', 'archive-toast');
    } catch (error) {
      handleError(error, 'ArchiveApp.downloadShareImage');
      showToast('Failed to download image', 'archive-toast');
    }
  }

  /**
   * Copy share link
   */
  copyShareLink() {
    try {
      const url = `${window.location.origin}/archive.html?date=${this.currentShareEntry?.date}`;
      navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied to clipboard!', 'archive-toast');
      }).catch(() => {
        showToast('Failed to copy link', 'archive-toast');
      });
    } catch (error) {
      handleError(error, 'ArchiveApp.copyShareLink');
      showToast('Failed to copy link', 'archive-toast');
    }
  }

  /**
   * Destroy the application
   */
  destroy() {
    try {
      // Clean up event listeners
      document.removeEventListener('keydown', this.handleKeyDown);
      
      console.log('ArchiveApp destroyed');
    } catch (error) {
      handleError(error, 'ArchiveApp.destroy');
    }
  }
}

// Initialize the archive application
const archiveApp = new ArchiveApp();

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  archiveApp.initialize();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  archiveApp.destroy();
}); 