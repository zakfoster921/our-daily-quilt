/**
 * Quilt Manager
 * Handles all quilt-related operations including rendering, saving, and loading
 */

import { CONFIG } from './config.js';
import { 
  hslToHex, 
  validateHexColor, 
  getTodayKey, 
  handleError, 
  showToast,
  showLoading,
  deepClone
} from './utils.js';

export class QuiltManager {
  constructor() {
    this.blocks = [{ 
      x: 0, 
      y: 0, 
      width: CONFIG.APP.quiltSize, 
      height: CONFIG.APP.quiltSize, 
      color: CONFIG.APP.defaultColor 
    }];
    this.lastAddedIndex = null;
    this.quiltSVG = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the quilt manager
   * @param {string} quiltId - ID of the quilt SVG element
   */
  initialize(quiltId = 'quilt') {
    try {
      this.quiltSVG = document.getElementById(quiltId);
      if (!this.quiltSVG) {
        throw new Error(`Quilt SVG element with id '${quiltId}' not found`);
      }
      
      this.quiltSVG.style.background = '#f6f4f1';
      this.isInitialized = true;
      
      console.log('QuiltManager initialized successfully');
    } catch (error) {
      handleError(error, 'QuiltManager.initialize');
      throw error;
    }
  }

  /**
   * Render all quilt blocks with wavy edges
   */
  renderBlocks() {
    if (!this.isInitialized) {
      console.warn('QuiltManager not initialized');
      return;
    }

    try {
      // Clear existing content
      this.quiltSVG.innerHTML = '';
      
      // Create SVG definitions for wavy edges filter
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = `
        <filter id="wavyEdges" x="0" y="0" width="200%" height="200%">
          <feTurbulence baseFrequency="0.012" numOctaves="3" result="turb"/>
          <feDisplacementMap in="SourceGraphic" in2="turb" scale="3"/>
        </filter>`;
      this.quiltSVG.appendChild(defs);

      // Render each block
      this.blocks.forEach((block, index) => {
        this.renderBlock(block, index);
      });

      this.lastAddedIndex = null;
    } catch (error) {
      handleError(error, 'QuiltManager.renderBlocks');
    }
  }

  /**
   * Render a single quilt block
   * @param {Object} block - Block data
   * @param {number} index - Block index
   */
  renderBlock(block, index) {
    try {
      const wobble = 6;
      
      // Add jitter to coordinates for organic feel
      const jitter = (val) => val + (Math.random() - 0.5) * wobble;
      
      const pathData = `M ${jitter(block.x)},${jitter(block.y)}
                        L ${jitter(block.x + block.width)},${jitter(block.y)}
                        L ${jitter(block.x + block.width)},${jitter(block.y + block.height)}
                        L ${jitter(block.x)},${jitter(block.y + block.height)} Z`;
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', block.color);
      path.setAttribute('filter', 'url(#wavyEdges)');
      
      // Add animation for newly added blocks
      if (index === this.lastAddedIndex) {
        path.classList.add('new-block');
        path.addEventListener('animationend', () => {
          path.classList.remove('new-block');
        }, { once: true });
      }
      
      this.quiltSVG.appendChild(path);
    } catch (error) {
      console.error('Error rendering block:', error);
    }
  }

  /**
   * Split a block and add a new color
   * @param {number} blockIndex - Index of block to split
   * @param {string} newColor - New color to add
   * @returns {boolean} Success status
   */
  splitBlock(blockIndex, newColor) {
    try {
      // Validate inputs
      if (blockIndex < 0 || blockIndex >= this.blocks.length) {
        throw new Error(`Invalid block index: ${blockIndex}`);
      }
      
      if (!validateHexColor(newColor)) {
        throw new Error(`Invalid color format: ${newColor}`);
      }

      const block = this.blocks[blockIndex];
      const splitVertically = block.width >= block.height;
      const splitRatio = 0.3 + Math.random() * 0.4; // 30% to 70% split
      
      let block1, block2;
      
      if (splitVertically) {
        const splitX = block.width * splitRatio;
        block1 = { ...block, width: splitX };
        block2 = { 
          ...block, 
          x: block.x + splitX, 
          width: block.width - splitX, 
          color: newColor 
        };
      } else {
        const splitY = block.height * splitRatio;
        block1 = { ...block, height: splitY };
        block2 = { 
          ...block, 
          y: block.y + splitY, 
          height: block.height - splitY, 
          color: newColor 
        };
      }
      
      // Replace the original block with two new blocks
      this.blocks.splice(blockIndex, 1, block1, block2);
      this.lastAddedIndex = blockIndex + 1;
      
      return true;
    } catch (error) {
      handleError(error, 'QuiltManager.splitBlock');
      return false;
    }
  }

  /**
   * Add a new color to the quilt
   * @param {string} color - Color to add (hex format)
   * @returns {boolean} Success status
   */
  addColor(color) {
    try {
      if (!validateHexColor(color)) {
        showToast('Invalid color format');
        return false;
      }

      // Find eligible blocks (those large enough to split)
      const eligibleBlocks = this.blocks.filter(block => 
        block.width > CONFIG.APP.minBlockSize && 
        block.height > CONFIG.APP.minBlockSize
      );

      let indexToSplit;
      
      if (eligibleBlocks.length > 0) {
        // Find the largest eligible block
        const largestEligible = eligibleBlocks.reduce((largest, current) => {
          const largestArea = largest.width * largest.height;
          const currentArea = current.width * current.height;
          return currentArea > largestArea ? current : largest;
        });
        
        indexToSplit = this.blocks.indexOf(largestEligible);
      } else {
        // If no eligible blocks, find the largest block overall
        let maxArea = 0;
        indexToSplit = 0;
        
        this.blocks.forEach((block, index) => {
          const area = block.width * block.height;
          if (area > maxArea) {
            maxArea = area;
            indexToSplit = index;
          }
        });
      }

      // Split the block and add the new color
      const success = this.splitBlock(indexToSplit, color);
      
      if (success) {
        this.renderBlocks();
        showToast('Color added to quilt!');
      }
      
      return success;
    } catch (error) {
      handleError(error, 'QuiltManager.addColor');
      return false;
    }
  }

  /**
   * Get current quilt data
   * @returns {Object} Quilt data
   */
  getQuiltData() {
    return {
      blocks: deepClone(this.blocks),
      date: getTodayKey()
    };
  }

  /**
   * Set quilt data
   * @param {Object} data - Quilt data
   */
  setQuiltData(data) {
    try {
      if (data && data.blocks && Array.isArray(data.blocks)) {
        this.blocks = deepClone(data.blocks);
        this.renderBlocks();
        return true;
      }
      return false;
    } catch (error) {
      handleError(error, 'QuiltManager.setQuiltData');
      return false;
    }
  }

  /**
   * Reset quilt to default state
   */
  reset() {
    this.blocks = [{ 
      x: 0, 
      y: 0, 
      width: CONFIG.APP.quiltSize, 
      height: CONFIG.APP.quiltSize, 
      color: CONFIG.APP.defaultColor 
    }];
    this.lastAddedIndex = null;
    this.renderBlocks();
  }

  /**
   * Get quilt statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      totalBlocks: this.blocks.length,
      uniqueColors: new Set(this.blocks.map(block => block.color)).size,
      averageBlockSize: this.blocks.reduce((sum, block) => 
        sum + (block.width * block.height), 0) / this.blocks.length
    };
  }

  /**
   * Export quilt as SVG string
   * @returns {string} SVG string
   */
  exportSVG() {
    if (!this.quiltSVG) return '';
    
    const clonedSVG = this.quiltSVG.cloneNode(true);
    clonedSVG.removeAttribute('id');
    clonedSVG.setAttribute('width', '800');
    clonedSVG.setAttribute('height', '800');
    
    return clonedSVG.outerHTML;
  }
} 