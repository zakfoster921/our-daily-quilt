/**
 * Main Application
 * Orchestrates all modules and handles the application lifecycle
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

import { CONFIG } from './config.js';
import { 
  formatDate, 
  showToast, 
  showLoading, 
  handleError,
  safeAddEventListener,
  getTodayKey
} from './utils.js';
import { QuiltManager } from './quilt-manager.js';
import { ColorPicker } from './color-picker.js';

class OurDailyApp {
  constructor() {
    this.quiltManager = new QuiltManager();
    this.colorPicker = new ColorPicker();
    this.db = null;
    this.quiltDoc = null;
    this.currentScreen = 'screen-portal';
    this.isInitialized = false;
    
    // Quote data
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
   * Initialize the application
   */
  async initialize() {
    try {
      showLoading(true);
      
      // Initialize Firebase
      await this.initializeFirebase();
      
      // Initialize modules
      this.quiltManager.initialize();
      this.colorPicker.initialize();
      
      // Set up navigation and event listeners
      this.setupNavigation();
      this.setupEventListeners();
      
      // Initialize UI
      this.initializeUI();
      
      // Load quilt data
      await this.loadQuilt();
      
      this.isInitialized = true;
      showLoading(false);
      
      console.log('OurDailyApp initialized successfully');
    } catch (error) {
      handleError(error, 'OurDailyApp.initialize');
      showLoading(false);
      showToast('Failed to initialize app. Please refresh.');
    }
  }

  /**
   * Initialize Firebase
   */
  async initializeFirebase() {
    try {
      const app = initializeApp(CONFIG.FIREBASE);
      this.db = getFirestore(app);
      this.quiltDoc = doc(this.db, "quilts", "main");
      
      console.log('Firebase initialized successfully');
    } catch (error) {
      handleError(error, 'Firebase initialization');
      throw error;
    }
  }

  /**
   * Set up navigation between screens
   */
  setupNavigation() {
    try {
      const navigationButtons = document.querySelectorAll(".btn[data-next]");
      
      navigationButtons.forEach(btn => {
        safeAddEventListener(btn, "click", (e) => {
          e.preventDefault();
          const targetId = btn.getAttribute("data-next");
          if (targetId) {
            this.showScreen(targetId);
          }
        });
      });
    } catch (error) {
      handleError(error, 'Navigation setup');
    }
  }

  /**
   * Set up application event listeners
   */
  setupEventListeners() {
    try {
      // Add color button
      const addColorBtn = document.getElementById('addColorBtn');
      if (addColorBtn) {
        safeAddEventListener(addColorBtn, 'click', this.handleAddColor.bind(this));
      }

      // Share button
      const shareBtnCompleted = document.getElementById('shareBtnCompleted');
      if (shareBtnCompleted) {
        safeAddEventListener(shareBtnCompleted, 'click', this.handleShare.bind(this));
      }

      // Keyboard navigation
      safeAddEventListener(document, 'keydown', this.handleKeyDown.bind(this));
    } catch (error) {
      handleError(error, 'Event listener setup');
    }
  }

  /**
   * Initialize UI elements
   */
  initializeUI() {
    try {
      // Set current date
      const dateText = document.getElementById("date-text");
      if (dateText) {
        dateText.textContent = formatDate();
      }

      // Display today's quote
      this.displayQuote();

      // Show initial screen
      this.showScreen('screen-portal');
    } catch (error) {
      handleError(error, 'UI initialization');
    }
  }

  /**
   * Show a specific screen
   * @param {string} screenId - ID of the screen to show
   */
  showScreen(screenId) {
    try {
      // Hide all screens
      document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
      });

      // Show target screen
      const targetScreen = document.getElementById(screenId);
      if (targetScreen) {
        targetScreen.classList.add("active");
        this.currentScreen = screenId;
        
        // Update focus for accessibility
        const firstFocusable = targetScreen.querySelector('button, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
          firstFocusable.focus();
        }
      }
    } catch (error) {
      handleError(error, 'Screen navigation');
    }
  }

  /**
   * Load quilt data from Firebase
   */
  async loadQuilt() {
    try {
      showLoading(true);
      
      const todayKey = getTodayKey();
      const quiltDocSnap = await getDoc(this.quiltDoc);
      
      if (!quiltDocSnap.exists() || quiltDocSnap.data().date !== todayKey) {
        // Start fresh for today
        this.quiltManager.reset();
        await this.saveQuilt();
      } else {
        // Load existing data
        const data = quiltDocSnap.data();
        if (data.blocks) {
          this.quiltManager.setQuiltData(data);
        }
      }
      
      showLoading(false);
    } catch (error) {
      handleError(error, 'loadQuilt');
      showLoading(false);
      // Fallback to default state
      this.quiltManager.reset();
    }
  }

  /**
   * Save quilt data to Firebase
   */
  async saveQuilt() {
    try {
      const quiltData = this.quiltManager.getQuiltData();
      await setDoc(this.quiltDoc, quiltData);
    } catch (error) {
      handleError(error, 'saveQuilt');
      throw error;
    }
  }

  /**
   * Handle adding a color to the quilt
   */
  async handleAddColor() {
    try {
      const selectedColor = this.colorPicker.getSelectedColor();
      
      if (!selectedColor) {
        showToast('Please select a color first');
        return;
      }

      const success = this.quiltManager.addColor(selectedColor);
      
      if (success) {
        await this.saveQuilt();
        this.showScreen('screen-quilt');
      }
    } catch (error) {
      handleError(error, 'handleAddColor');
      showToast('Failed to add color. Please try again.');
    }
  }

  /**
   * Handle sharing the quilt
   */
  async handleShare() {
    try {
      const shareBtn = document.getElementById('shareBtnCompleted');
      if (shareBtn) {
        shareBtn.disabled = true;
      }
      
      showToast("Preparing flyer...");
      await this.shareFlow();
      
      if (shareBtn) {
        shareBtn.disabled = false;
      }
    } catch (error) {
      handleError(error, 'handleShare');
      showToast('Share failed. Saving instead.');
      
      const shareBtn = document.getElementById('shareBtnCompleted');
      if (shareBtn) {
        shareBtn.disabled = false;
      }
    }
  }

  /**
   * Share flow implementation
   */
  async shareFlow() {
    try {
      // Clone the quilt SVG
      const quiltElement = document.getElementById('quilt');
      const clonedSVG = quiltElement.cloneNode(true);
      clonedSVG.removeAttribute('id');
      clonedSVG.setAttribute('width', '800');
      clonedSVG.setAttribute('height', '800');
      clonedSVG.style.transform = "rotate(-5deg)";

      // Create flyer wrapper
      const wrapper = document.createElement('div');
      wrapper.style.width = `${CONFIG.SHARE.imageWidth}px`;
      wrapper.style.height = `${CONFIG.SHARE.imageHeight}px`;
      wrapper.style.background = CONFIG.SHARE.backgroundColor;
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.alignItems = 'center';
      wrapper.style.padding = '100px 60px 80px 60px';
      wrapper.style.fontFamily = "system-ui, sans-serif";

      // Header
      const title = document.createElement('h1');
      title.textContent = "OUR DAILY";
      title.style.fontSize = '96px';
      title.style.fontWeight = '900';
      title.style.margin = '0';

      const date = document.createElement('p');
      date.textContent = formatDate();
      date.style.fontSize = '48px';
      date.style.margin = '10px 0 40px 0';

      // Quote card
      const quoteCard = document.createElement('div');
      quoteCard.style.border = '4px solid #000';
      quoteCard.style.borderRadius = '16px';
      quoteCard.style.padding = '20px 30px';
      quoteCard.style.marginBottom = '60px';
      quoteCard.style.maxWidth = '800px';
      quoteCard.style.textAlign = 'left';

      const quoteLine = document.createElement('p');
      quoteLine.textContent = `"${this.getTodayQuote().text}"`;
      quoteLine.style.fontSize = '60px';
      quoteLine.style.fontStyle = 'italic';
      quoteLine.style.fontWeight = '600';
      quoteLine.style.margin = '0 0 10px 0';

      const quoteAuthor = document.createElement('p');
      quoteAuthor.textContent = this.getTodayQuote().author;
      quoteAuthor.style.fontSize = '60px';
      quoteAuthor.style.fontWeight = '500';
      quoteAuthor.style.margin = '0';

      quoteCard.appendChild(quoteLine);
      quoteCard.appendChild(quoteAuthor);

      // Quilt container
      const quiltContainer = document.createElement('div');
      quiltContainer.style.width = '800px';
      quiltContainer.style.height = '800px';
      quiltContainer.style.transform = "rotate(-5deg)";
      quiltContainer.appendChild(clonedSVG);

      // Footer
      const footer = document.createElement('div');
      footer.style.width = '100%';
      footer.style.display = 'flex';
      footer.style.flexDirection = 'column';
      footer.style.alignItems = 'flex-end';
      footer.style.marginTop = '60px';
      footer.style.paddingRight = '40px';

      const bigLine = document.createElement('span');
      bigLine.textContent = 'ADD YOUR COLOR!';
      bigLine.style.fontSize = '55px';
      bigLine.style.fontWeight = '900';

      const smallLine = document.createElement('span');
      smallLine.innerHTML = 'Visit <strong>@zakfoster.quilts</strong> bio links';
      smallLine.style.fontSize = '44px';
      smallLine.style.fontWeight = '400';

      footer.appendChild(bigLine);
      footer.appendChild(smallLine);

      // Assemble flyer
      const headerGroup = document.createElement('div');
      headerGroup.style.alignSelf = 'flex-start';
      headerGroup.style.textAlign = 'left';
      headerGroup.style.marginLeft = '60px';

      headerGroup.appendChild(title);
      headerGroup.appendChild(date);
      headerGroup.appendChild(quoteCard);

      wrapper.appendChild(headerGroup);
      wrapper.appendChild(quiltContainer);
      wrapper.appendChild(footer);

      document.body.appendChild(wrapper);

      // Convert to canvas
      const canvas = await html2canvas(wrapper, {
        scale: CONFIG.SHARE.scale,
        backgroundColor: CONFIG.SHARE.backgroundColor,
        useCORS: true
      });

      document.body.removeChild(wrapper);

      // Share or download
      canvas.toBlob(async (blob) => {
        const filesArray = [new File([blob], 'community-quilt.png', { type: 'image/png' })];
        const shareData = {
          files: filesArray,
          title: "Today's Community Quilt",
          text: "Tag me on Instagram if you're sharing! @zakfoster.quilts 🌈✨"
        };

        if (navigator.canShare && navigator.canShare(shareData)) {
          await navigator.share(shareData);
          showToast("Thanks for sharing!");
        } else {
          const link = document.createElement('a');
          link.download = 'community-quilt.png';
          link.href = canvas.toDataURL('image/png');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          showToast("Image saved! Check your downloads.");
        }
      });

    } catch (error) {
      handleError(error, 'shareFlow');
      throw error;
    }
  }

  /**
   * Get today's quote
   * @returns {Object} Quote object with text and author
   */
  getTodayQuote() {
    const today = new Date().toISOString().split('T')[0];
    const dayIndex = Math.floor(new Date(today).getTime() / (1000 * 60 * 60 * 24));
    const quoteIndex = this.shuffledIndexes[dayIndex % this.shuffledIndexes.length];
    return this.quotes[quoteIndex];
  }

  /**
   * Display today's quote
   */
  displayQuote() {
    try {
      const { text, author } = this.getTodayQuote();
      const quoteLine = document.querySelector('.quote-line');
      const quoteAuthor = document.querySelector('.quote-author');
      
      if (quoteLine) quoteLine.textContent = text;
      if (quoteAuthor) quoteAuthor.textContent = author;
    } catch (error) {
      handleError(error, 'displayQuote');
    }
  }

  /**
   * Handle keyboard navigation
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    // Escape key to go back
    if (event.key === 'Escape') {
      if (this.currentScreen === 'screen-quote') {
        this.showScreen('screen-portal');
      } else if (this.currentScreen === 'screen-color') {
        this.showScreen('screen-quote');
      } else if (this.currentScreen === 'screen-quilt') {
        this.showScreen('screen-color');
      }
    }
  }

  /**
   * Clean up application resources
   */
  destroy() {
    try {
      this.colorPicker.destroy();
      // Add any other cleanup needed
    } catch (error) {
      handleError(error, 'App cleanup');
    }
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  const app = new OurDailyApp();
  
  try {
    await app.initialize();
    
    // Make app available globally for debugging
    if (CONFIG.APP.debug) {
      window.ourDailyApp = app;
    }
  } catch (error) {
    handleError(error, 'App initialization');
    showToast('Failed to start app. Please refresh the page.');
  }
}); 