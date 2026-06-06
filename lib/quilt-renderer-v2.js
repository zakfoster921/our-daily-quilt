/**
 * SVG/canvas quilt rendering for portal and share flows.
 * Exposes globalThis.QuiltRendererV2.
 */
(function (root) {
  'use strict';

class QuiltRendererV2 {
  constructor(logger) {
    this.logger = logger;
    this.quiltSVG = null;
    this.lastAddedIndex = null;
    this.userPieces = new Set();
    this.mirrorSeamOffsetRatio = null;
    this.mirrorSeamOffsetKey = null;
    this.backsidePreviewEnabled = false;
  }

  setBacksidePreviewEnabled(enabled) {
    this.backsidePreviewEnabled = enabled === true;
  }

  seededUnit(seed) {
    let h = 2166136261 >>> 0;
    const input = String(seed || '');
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }

  _mirrorBacksidePoint(point, width) {
    if (Array.isArray(point)) {
      return [width - Number(point[0] || 0), Number(point[1] || 0)];
    }
    if (point && typeof point === 'object') {
      return { ...point, x: width - Number(point.x || 0), y: Number(point.y || 0) };
    }
    return point;
  }

  _normalizeBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') return null;
    const x = Number(bounds.x);
    const y = Number(bounds.y);
    const width = Number(bounds.width);
    const height = Number(bounds.height);
    if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
      return { x, y, width, height };
    }
    return null;
  }

  _unionBounds(blocks) {
    const valid = (Array.isArray(blocks) ? blocks : [])
      .map((block) => this._normalizeBounds(block))
      .filter(Boolean);
    if (!valid.length) return null;
    const minX = Math.min(...valid.map((b) => b.x));
    const minY = Math.min(...valid.map((b) => b.y));
    const maxX = Math.max(...valid.map((b) => b.x + b.width));
    const maxY = Math.max(...valid.map((b) => b.y + b.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  _visualLayerIndexForRenderBlock(block) {
    const explicit = Number(block?.visualLayerIndex);
    return Number.isFinite(explicit) ? explicit : 0;
  }

  _backsideSpecialFamilyKey(block) {
    if (!block || block.patternType !== 'special') return null;
    if (!block.specialPatternType || block.specialPatternType === 'diagonalAxis') return null;
    return `${block.specialPatternType}:${block.originalPatternId || block.id}`;
  }

  _backsideRestoreFamilyKey(block) {
    if (!block || block.backsideRestoreId == null) return null;
    if (!this._normalizeBounds(block.backsideRestoreBounds)) return null;
    if (typeof block.backsideRestoreColor !== 'string') return null;
    return `restore:${block.backsideRestoreId}`;
  }

  _boundsSameEnough(a, b) {
    const A = this._normalizeBounds(a);
    const B = this._normalizeBounds(b);
    if (!A || !B) return false;
    const eps = 0.75;
    return (
      Math.abs(A.x - B.x) <= eps &&
      Math.abs(A.y - B.y) <= eps &&
      Math.abs(A.width - B.width) <= eps &&
      Math.abs(A.height - B.height) <= eps
    );
  }

  /** Two HST records in one grid cell (freeze shards, clipped splits) — merge for one draw pass. */
  /** Nudge HST verts slightly past the cell box so 1.16× field scale + clip AA don't show the neighbor through a 1px seam. */
  _bleedHstVertsToCell(verts, bx, by, bw, bh, bleed) {
    const right = bx + bw;
    const bottom = by + bh;
    const near = (value, target) => Math.abs(value - target) <= 0.5;
    return verts.map(([px, py]) => {
      let x = px;
      let y = py;
      if (near(px, bx)) x -= bleed;
      if (near(px, right)) x += bleed;
      if (near(py, by)) y -= bleed;
      if (near(py, bottom)) y += bleed;
      return [x, y];
    });
  }

  _hstSameCellCoalesceKey(block) {
    if (
      !block ||
      block.specialPatternType !== 'hst' ||
      !Array.isArray(block.hstTriangles) ||
      block.hstTriangles.length !== 1
    ) {
      return null;
    }
    return `hstcell|${Math.round(Number(block.x) || 0)}|${Math.round(Number(block.y) || 0)}|${Math.round(Number(block.width) || 0)}|${Math.round(Number(block.height) || 0)}`;
  }

  _coalesceHstSameCellShardsForDisplay(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return blocks;
    const buckets = new Map();
    for (const block of blocks) {
      const key = this._hstSameCellCoalesceKey(block);
      if (!key) continue;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(block);
    }
    const emitted = new Set();
    const out = [];
    for (const block of blocks) {
      const key = this._hstSameCellCoalesceKey(block);
      if (!key) {
        out.push(block);
        continue;
      }
      if (emitted.has(key)) continue;
      emitted.add(key);
      const group = buckets.get(key) || [block];
      if (group.length === 1) {
        out.push(block);
        continue;
      }
      const primary = group[0];
      const mergedTris = group.flatMap((b) =>
        Array.isArray(b.hstTriangles) ? b.hstTriangles : []
      );
      out.push({
        ...primary,
        hstTriangles: mergedTris.map((t) => ({
          color: t.color,
          points: (t.points || []).map((p) => {
            if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
            if (p && typeof p === 'object') return [Number(p.x), Number(p.y)];
            return [0, 0];
          })
        })),
        hstColorB: group.map((b) => b.hstColorB).find((c) => typeof c === 'string') || primary.hstColorB
      });
    }
    return out;
  }

  _buildBacksideSpecialFamilyBlocks(blocks) {
    const sourceBlocks = Array.isArray(blocks) ? blocks : [];
    const restoreGroups = new Map();
    sourceBlocks.forEach((block) => {
      const key = this._backsideRestoreFamilyKey(block);
      if (!key) return;
      const existing = restoreGroups.get(key) || [];
      existing.push(block);
      restoreGroups.set(key, existing);
    });
    const groups = new Map();
    sourceBlocks.forEach((block) => {
      const key = this._backsideSpecialFamilyKey(block);
      if (!key) return;
      const existing = groups.get(key) || [];
      existing.push(block);
      groups.set(key, existing);
    });

    const suppressIds = new Set();
    const additions = [];
    restoreGroups.forEach((familyBlocks, key) => {
      if (!familyBlocks.length) return;
      const seed = [...familyBlocks].sort(
        (a, b) => (Number(a.submissionIndex) || 0) - (Number(b.submissionIndex) || 0)
      )[0];
      const restoreBounds = this._normalizeBounds(seed.backsideRestoreBounds);
      if (!restoreBounds) return;
      if (familyBlocks.length === 1 && this._boundsSameEnough(seed, restoreBounds)) return;
      const layer = Math.min(...familyBlocks.map((block) => this._visualLayerIndexForRenderBlock(block))) - 0.002;
      familyBlocks.forEach((block) => suppressIds.add(block.id));
      additions.push({
        ...seed,
        id: `${key}__backside_restored`,
        x: restoreBounds.x,
        y: restoreBounds.y,
        width: restoreBounds.width,
        height: restoreBounds.height,
        color: seed.backsideRestoreColor,
        patternType: 'regular',
        specialPatternType: undefined,
        originalPatternId: undefined,
        visualLayerIndex: layer,
        _backsideRestoredFamily: true
      });
    });
    groups.forEach((familyBlocks, key) => {
      if (!familyBlocks.length) return;
      const type = familyBlocks[0].specialPatternType;
      const layer = Math.min(...familyBlocks.map((block) => this._visualLayerIndexForRenderBlock(block))) - 0.001;
      const originalBounds =
        familyBlocks.map((block) => this._normalizeBounds(block.specialOriginalBounds)).find(Boolean) ||
        familyBlocks.map((block) => this._normalizeBounds(block.macroOriginalBounds)).find(Boolean) ||
        this._unionBounds(familyBlocks);

      if (type === 'insetCircle' && originalBounds) {
        const seed = [...familyBlocks].sort(
          (a, b) => (Number(a.submissionIndex) || 0) - (Number(b.submissionIndex) || 0)
        )[0];
        const insetCx = Number(seed.insetCx);
        const insetCy = Number(seed.insetCy);
        const insetR = Number(seed.specialOriginalInsetR ?? seed.insetR);
        familyBlocks.forEach((block) => suppressIds.add(block.id));
        additions.push({
          ...seed,
          id: `${key}__backside_restored`,
          x: originalBounds.x,
          y: originalBounds.y,
          width: originalBounds.width,
          height: originalBounds.height,
          color: seed.specialOriginalColor || seed.color,
          insetInnerColor: seed.specialOriginalInnerColor || seed.insetInnerColor,
          insetCx: Number.isFinite(insetCx) ? insetCx : originalBounds.x + originalBounds.width / 2,
          insetCy: Number.isFinite(insetCy) ? insetCy : originalBounds.y + originalBounds.height / 2,
          insetR: Number.isFinite(insetR) ? insetR : Math.min(originalBounds.width, originalBounds.height) * 0.45,
          patternType: 'special',
          specialPatternType: 'insetCircle',
          visualLayerIndex: layer,
          _backsideRestoredFamily: true
        });
        return;
      }

      if (familyBlocks.length < 2) return;
      familyBlocks.forEach((block) => {
        suppressIds.add(block.id);
        additions.push({
          ...block,
          id: `${block.id}__backside_restored`,
          visualLayerIndex: layer,
          _backsideRestoredFamily: true
        });
      });
    });

    if (!suppressIds.size && !additions.length) return sourceBlocks;
    return sourceBlocks.filter((block) => !suppressIds.has(block.id)).concat(additions);
  }

  _mirrorBlockForBackside(block, minX, maxX) {
    const width = Math.max(0, Number(block?.width) || 0);
    const mirrored = {
      ...block,
      x: minX + maxX - (Number(block?.x || 0) + width)
    };
    if (Array.isArray(block?.polygonPieces)) {
      mirrored.polygonPieces = block.polygonPieces.map((piece) => ({
        ...piece,
        points: (piece.points || []).map((point) => this._mirrorBacksidePoint(point, width)).reverse()
      }));
    }
    if (Array.isArray(block?.hstTriangles)) {
      mirrored.hstTriangles = block.hstTriangles.map((tri) => ({
        ...tri,
        points: (tri.points || []).map((point) => this._mirrorBacksidePoint(point, width)).reverse()
      }));
    }
    if (typeof block?.hstDiagonal === 'string') {
      if (block.hstDiagonal === 'tl-br') mirrored.hstDiagonal = 'tr-bl';
      else if (block.hstDiagonal === 'tr-bl') mirrored.hstDiagonal = 'tl-br';
    }
    if (typeof block?.insetCx === 'number') {
      mirrored.insetCx = minX + maxX - block.insetCx;
    }
    if (typeof block?.diagonalAxisUx === 'number') {
      mirrored.diagonalAxisUx = -block.diagonalAxisUx;
    }
    return mirrored;
  }

  getMirrorSeamOffsetRatio() {
    const seamKey = 'mirror-seam:strong-symmetry';
    if (this.mirrorSeamOffsetKey === seamKey && typeof this.mirrorSeamOffsetRatio === 'number') {
      return this.mirrorSeamOffsetRatio;
    }
    // Keep the mirror fold in the overlapping, strongly symmetrical state on every load.
    this.mirrorSeamOffsetRatio = 0.68;
    this.mirrorSeamOffsetKey = seamKey;
    return this.mirrorSeamOffsetRatio;
  }
  
  // Calculate progressive jitter decrease based on number of blocks
  calculateJitterMultiplier(blockWidth, blockHeight) {
    const blockArea = blockWidth * blockHeight;
    const minBlockSize = 20; // Minimum size for reference
    const maxBlockSize = 200; // Maximum size for reference
    
    // Normalize block size to 0-1 range
    const normalizedSize = Math.min(1, Math.max(0, (blockArea - minBlockSize * minBlockSize) / (maxBlockSize * maxBlockSize - minBlockSize * minBlockSize)));
    
    // Larger blocks get more jitter, smaller blocks get less jitter
    // Range from 0.1 (tiny blocks) to 1.0 (large blocks)
    return 0.1 + (normalizedSize * 0.9);
  }
  
  // Calculate rotation jitter multiplier based on block size (like checkerboard approach)
  calculateRotationMultiplier(blockWidth, blockHeight) {
    const blockArea = blockWidth * blockHeight;
    const minBlockSize = 20; // Minimum size for reference
    const maxBlockSize = 200; // Maximum size for reference
    
    // Normalize block size to 0-1 range
    const normalizedSize = Math.min(1, Math.max(0, (blockArea - minBlockSize * minBlockSize) / (maxBlockSize * maxBlockSize - minBlockSize * minBlockSize)));
    
    // Larger blocks get more rotation, smaller blocks get less rotation
    // Range from 0.05 (tiny blocks) to 1.0 (large blocks)
    return 0.05 + (normalizedSize * 0.95);
  }

  initialize() {
    this.quiltSVG = document.getElementById('quilt');
    if (!this.quiltSVG) {
      throw new Error('Quilt SVG element not found');
    }
    
    // Set initial viewBox to viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    this.quiltSVG.setAttribute('viewBox', `0 0 ${viewportWidth} ${viewportHeight}`);
    this.quiltSVG.setAttribute('width', viewportWidth);
    this.quiltSVG.setAttribute('height', viewportHeight);
    this.quiltSVG.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  }

  renderBlocks(blocks, userPieces = [], submissionCount = 0) {
    if (!this.quiltSVG) {
      this.logger.warn('Quilt SVG not found');
      return;
    }

    this.quiltSVG.innerHTML = '';
    this.userPieces = new Set(userPieces.map(b => b.id));

    if (blocks.length === 0) {
      console.log('🔧 renderBlocks: No blocks to render, showing placeholder');
      // Add a placeholder when no blocks exist
      this.quiltSVG.innerHTML = `
        <rect x="0" y="0" width="100%" height="100%" fill="#f0f0f0" opacity="0.5"/>
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" 
              font-family="Arial, sans-serif" font-size="24" fill="#666">
          No quilt blocks to display (blocks.length: ${blocks.length})
        </text>
      `;
      this.quiltSVG.setAttribute('viewBox', '0 0 400 300');
      this.quiltSVG.setAttribute('width', '100%');
      this.quiltSVG.setAttribute('height', '100%');
      return;
    }

    // Calculate actual quilt bounds from blocks
    const minX = Math.min(...blocks.map(b => b.x));
    const minY = Math.min(...blocks.map(b => b.y));
    const maxX = Math.max(...blocks.map(b => b.x + b.width));
    const maxY = Math.max(...blocks.map(b => b.y + b.height));
    
    const actualQuiltWidth = maxX - minX;
    const actualQuiltHeight = maxY - minY;
    const backsideSourceBlocks = this.backsidePreviewEnabled
      ? this._buildBacksideSpecialFamilyBlocks(blocks)
      : blocks;
    const displayBlocks = this.backsidePreviewEnabled
      ? backsideSourceBlocks.map((block) => this._mirrorBlockForBackside(block, minX, maxX))
      : backsideSourceBlocks;
    
    const renderMirroredField = true;

    // Keep the mirrored presentation full-bleed without hiding blocks: include the full
    // mirrored field in the viewBox, then let SVG slice slightly instead of letterboxing.
    const padding = renderMirroredField ? -Math.max(6, actualQuiltWidth * 0.02) : 4;
    const visibleY = minY;
    const mirrorSeamOffset = renderMirroredField ? actualQuiltHeight * this.getMirrorSeamOffsetRatio() : actualQuiltHeight;
    const mirroredFieldHeight = renderMirroredField ? actualQuiltHeight + mirrorSeamOffset : actualQuiltHeight;
    const mirrorSeamOverlap = renderMirroredField ? 8 : 0;
    const horizontalStretch = renderMirroredField ? 1.16 : 1;
    const mirroredFieldWidth = actualQuiltWidth * horizontalStretch;
    const viewBoxWidth = mirroredFieldWidth + (padding * 2);
    const viewBoxHeight = mirroredFieldHeight + (padding * 2);
    
    // Set viewBox to actual quilt content with padding
    this.quiltSVG.setAttribute('viewBox', `${minX - padding} ${visibleY - padding} ${viewBoxWidth} ${viewBoxHeight}`);
    
    // Set SVG dimensions to fill container
    this.quiltSVG.setAttribute('width', '100%');
    this.quiltSVG.setAttribute('height', '100%');
    
    console.log('🔧 USING ACTUAL QUILT DIMENSIONS:', actualQuiltWidth, 'x', actualQuiltHeight);
    
    // Fill the quilt container edge-to-edge; crop vertically if the viewport demands it.
    this.quiltSVG.setAttribute('preserveAspectRatio', 'xMidYMin slice');
    
    // Make SVG fill the entire container with !important
    this.quiltSVG.style.setProperty('width', '100%', 'important');
    this.quiltSVG.style.setProperty('height', '100%', 'important');
    this.quiltSVG.style.setProperty('max-width', '100%', 'important');
    this.quiltSVG.style.setProperty('max-height', '100%', 'important');
    
    // Debug: Log SVG dimensions
    console.log('🔧 SVG dimensions set to:', {
      width: this.quiltSVG.style.width,
      height: this.quiltSVG.style.height,
      viewBox: this.quiltSVG.getAttribute('viewBox'),
      preserveAspectRatio: this.quiltSVG.getAttribute('preserveAspectRatio')
    });
    
    // No global flip - individual blocks will be flipped when touched

    // No complex filters - we'll use a simple approach for sharp edges
    const fieldLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    fieldLayer.setAttribute('id', 'quiltFieldLayer');
    if (horizontalStretch !== 1) {
      fieldLayer.setAttribute('transform', `translate(${minX} 0) scale(${horizontalStretch} 1) translate(${-minX} 0)`);
    }
    this.quiltSVG.appendChild(fieldLayer);

    const parallaxLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    parallaxLayer.setAttribute('id', 'quiltParallaxLayer');
    fieldLayer.appendChild(parallaxLayer);

    const debugBlocksEnabled = (() => {
      try {
        const params = new URLSearchParams(window.location.search || '');
        return params.get('debugBlocks') === '1' || localStorage.getItem('odqDebugBlocks') === '1';
      } catch (_) {
        return false;
      }
    })();
    
    // Function to create inward feathering shadow filter for each block
    const createInwardShadowFilter = (blockColor, blockId) => {
      // Convert hex to darker version (about 30% darker)
      const hex = blockColor.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      
      // Make color darker by reducing RGB values
      const darkerR = Math.max(0, Math.floor(r * 0.7));
      const darkerG = Math.max(0, Math.floor(g * 0.7));
      const darkerB = Math.max(0, Math.floor(b * 0.7));
      
      const darkerColor = `rgb(${darkerR}, ${darkerG}, ${darkerB})`;
      
      const filterId = `inwardShadow-${blockId}`;
      const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.setAttribute('id', filterId);
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%');
      filter.setAttribute('height', '200%');
      
      // Create inner shadow effect using feMorphology and feOffset
      const morphology = document.createElementNS('http://www.w3.org/2000/svg', 'feMorphology');
      morphology.setAttribute('operator', 'erode');
      morphology.setAttribute('radius', '2');
      
      const offset = document.createElementNS('http://www.w3.org/2000/svg', 'feOffset');
      offset.setAttribute('dx', '0');
      offset.setAttribute('dy', '0');
      
      const flood = document.createElementNS('http://www.w3.org/2000/svg', 'feFlood');
      flood.setAttribute('flood-color', darkerColor);
      flood.setAttribute('flood-opacity', '0.3');
      
      const composite = document.createElementNS('http://www.w3.org/2000/svg', 'feComposite');
      composite.setAttribute('operator', 'in');
      
      const gaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
      gaussianBlur.setAttribute('stdDeviation', '1.5');
      
      filter.appendChild(morphology);
      filter.appendChild(offset);
      filter.appendChild(flood);
      filter.appendChild(composite);
      filter.appendChild(gaussianBlur);
      
      return filter;
    };

    // Calculate jitter per block based on individual block size
    // We'll calculate these inside the block loop since each block has different dimensions
    
    // Pattern selection function
    const getPatternForColor = (color) => {
      // Safety check: ensure color is valid
      if (!color || typeof color !== 'string') {
        console.warn('Invalid color passed to getPatternForColor:', color);
        return 'geometric'; // Default fallback pattern
      }
      
      // Convert hex to HSL to determine color family
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16) / 255;
      const g = parseInt(hex.substr(2, 2), 16) / 255;
      const b = parseInt(hex.substr(4, 2), 16) / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      
      let h = 0;
      if (max !== min) {
        const d = max - min;
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      
      const hue = h * 360;
      const saturation = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
      
      // Pattern selection based on color characteristics
      if (saturation < 0.3) return 'geometric'; // Low saturation = neutral
      if (hue < 60 || hue > 300) return 'dots'; // Warm colors (red, orange, yellow, pink)
      if (hue < 180) return 'stripes'; // Cool colors (green, blue)
      return 'floral'; // Purple and other colors
    };

    const defsNode = (() => {
      let defs = this.quiltSVG.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        this.quiltSVG.appendChild(defs);
      }
      return defs;
    })();
    const renderToken = `wc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const risoTexturePatternId = `${renderToken}_riso_ink_texture`;
    const risoPaperKnockoutPatternId = `${renderToken}_riso_paper_knockout`;
    const risoDotSoftenFilterId = `${renderToken}_riso_dot_soften`;
    {
      const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.setAttribute('id', risoDotSoftenFilterId);
      filter.setAttribute('x', '-6%');
      filter.setAttribute('y', '-6%');
      filter.setAttribute('width', '112%');
      filter.setAttribute('height', '112%');
      const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
      blur.setAttribute('stdDeviation', '0.85');
      filter.appendChild(blur);
      defsNode.appendChild(filter);
    }
    {
      const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      pattern.setAttribute('id', risoTexturePatternId);
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('width', '14');
      pattern.setAttribute('height', '14');
      pattern.setAttribute('patternTransform', 'rotate(-18)');
      [
        ['circle', { cx: '3.5', cy: '3.5', r: '1.65', fill: 'rgba(255, 244, 220, 0.42)' }],
        ['circle', { cx: '10.5', cy: '10.5', r: '1.65', fill: 'rgba(255, 244, 220, 0.42)' }],
        ['circle', { cx: '10.5', cy: '3.5', r: '0.82', fill: 'rgba(39, 31, 25, 0.13)' }],
        ['circle', { cx: '3.5', cy: '10.5', r: '0.82', fill: 'rgba(39, 31, 25, 0.1)' }]
      ].forEach(([tag, attrs]) => {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        pattern.appendChild(node);
      });
      defsNode.appendChild(pattern);
    }
    {
      const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      pattern.setAttribute('id', risoPaperKnockoutPatternId);
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('width', '32');
      pattern.setAttribute('height', '32');
      pattern.setAttribute('patternTransform', 'rotate(11)');
      [
        ['circle', { cx: '5.4', cy: '6.2', r: '1.85', fill: 'rgba(250, 244, 226, 0.86)' }],
        ['circle', { cx: '17.8', cy: '10.6', r: '1.18', fill: 'rgba(250, 244, 226, 0.7)' }],
        ['circle', { cx: '26.4', cy: '21.2', r: '2.05', fill: 'rgba(250, 244, 226, 0.74)' }],
        ['circle', { cx: '10.8', cy: '27.1', r: '1.0', fill: 'rgba(250, 244, 226, 0.66)' }],
        ['rect', { x: '22.2', y: '4.8', width: '3.4', height: '1.05', rx: '0.5', fill: 'rgba(250, 244, 226, 0.62)' }]
      ].forEach(([tag, attrs]) => {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        pattern.appendChild(node);
      });
      defsNode.appendChild(pattern);
    }
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
    const hash01 = (str) => {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0) / 4294967295;
    };
    const watercolorStrengthForSize = (w, h) => {
      const minDim = Math.max(1, Math.min(Math.abs(w), Math.abs(h)));
      if (minDim <= 44) return 0.45;
      if (minDim <= 72) return 0.7;
      return 1;
    };
    const watercolorDarknessFactor = (hex) => {
      const { r, g, b } = hexToRgb(hex);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luminance <= 72) return 0.5;    // very dark colors: strongly reduce watercolor
      if (luminance <= 96) return 0.66;   // dark colors: reduce noticeably
      if (luminance <= 124) return 0.82;  // dark-mid colors: reduce a bit
      return 1;
    };
    const darkEdgeBoostForLuminance = (hex) => {
      const { r, g, b } = hexToRgb(hex);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luminance <= 72) return 1;
      if (luminance <= 96) return 0.65;
      return 0;
    };
    const createWatercolorOverlay = (
      shapeNode,
      blockRect,
      colorHex,
      idx,
      strength = 1,
      seedKey = '',
      washRadialOpts = null,
      textureOpts = null
    ) => {
      const hstWedgeTexture = textureOpts?.profile === 'hstWedge';
      if (hstWedgeTexture) return null;
      const t = Math.max(0, Math.min(1, strength * watercolorDarknessFactor(colorHex)));
      if (t <= 0.001) return null;
      const rgb = hexToRgb(colorHex);
      const radial =
        washRadialOpts &&
        typeof washRadialOpts.cx === 'number' &&
        typeof washRadialOpts.cy === 'number' &&
        typeof washRadialOpts.span === 'number' &&
        washRadialOpts.span > 0
          ? washRadialOpts
          : null;
      const { x, y, width, height } = blockRect;
      const seed = `${seedKey || idx}|${Math.round(x)}|${Math.round(y)}|${Math.round(width)}|${Math.round(height)}`;
      const minDim = Math.max(1, Math.min(Math.abs(width), Math.abs(height)));
      const risoTextureCoverage = Math.max(0.55, Math.min(1.55, (minDim - 34) / 122));
      const paperKnockoutCoverage = Math.max(0, Math.min(1.35, (minDim - 56) / 112));
      const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
      const paperKnockoutToneFactor =
        luminance <= 72 ? 0.36 :
          luminance <= 108 ? 0.56 :
            luminance <= 150 ? 0.78 :
              1;

      let cx;
      let cy;
      let edgeR;
      let centerR;

      if (radial) {
        const jitter = radial.span * 0.11;
        const triSeed = `${seed}|tri|${Math.round(radial.cx)}:${Math.round(radial.cy)}`;
        cx = radial.cx + (hash01(`${triSeed}|cx`) - 0.5) * 2 * jitter;
        cy = radial.cy + (hash01(`${triSeed}|cy`) - 0.5) * 2 * jitter;
        centerR = radial.span * 0.72;
        edgeR = radial.span * 0.92;
      } else {
        cx = x + width * (0.38 + hash01(`${seed}|cx`) * 0.24);
        cy = y + height * (0.38 + hash01(`${seed}|cy`) * 0.24);
        edgeR = Math.max(width, height) * 0.92;
        centerR = Math.max(width, height) * 0.72;
      }
      const centerId = `${renderToken}_center_${idx}`;
      const edgeId = `${renderToken}_edge_${idx}`;

      const centerGrad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      centerGrad.setAttribute('id', centerId);
      centerGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
      centerGrad.setAttribute('cx', String(cx));
      centerGrad.setAttribute('cy', String(cy));
      centerGrad.setAttribute('r', String(centerR));
      const c0 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      c0.setAttribute('offset', '0%');
      c0.setAttribute('stop-color', '#ffffff');
      c0.setAttribute('stop-opacity', String(0.055 * t));
      const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      c1.setAttribute('offset', '55%');
      c1.setAttribute('stop-color', '#ffffff');
      c1.setAttribute('stop-opacity', String(0.018 * t));
      const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      c2.setAttribute('offset', '100%');
      c2.setAttribute('stop-color', '#ffffff');
      c2.setAttribute('stop-opacity', '0');
      centerGrad.appendChild(c0);
      centerGrad.appendChild(c1);
      centerGrad.appendChild(c2);
      defsNode.appendChild(centerGrad);

      const edgeGrad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      edgeGrad.setAttribute('id', edgeId);
      edgeGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
      edgeGrad.setAttribute('cx', String(cx));
      edgeGrad.setAttribute('cy', String(cy));
      edgeGrad.setAttribute('r', String(edgeR));
      const e0 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      e0.setAttribute('offset', '0%');
      e0.setAttribute('stop-color', `rgb(${rgb.r},${rgb.g},${rgb.b})`);
      e0.setAttribute('stop-opacity', '0');
      const e1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      e1.setAttribute('offset', '65%');
      e1.setAttribute('stop-color', `rgb(${rgb.r},${rgb.g},${rgb.b})`);
      e1.setAttribute('stop-opacity', String(0.045 * t));
      const e2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      e2.setAttribute('offset', '100%');
      e2.setAttribute('stop-color', `rgb(${rgb.r},${rgb.g},${rgb.b})`);
      e2.setAttribute('stop-opacity', String(0.24 * t));
      edgeGrad.appendChild(e0);
      edgeGrad.appendChild(e1);
      edgeGrad.appendChild(e2);
      defsNode.appendChild(edgeGrad);

      const overlayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlayGroup.setAttribute('style', 'mix-blend-mode: normal; pointer-events: none;');
      const stripOverlayMetadata = (node) => {
        try {
          node.removeAttribute('data-block-id');
          node.classList.remove('user-piece-highlight');
        } catch (_) {
          /* ignore */
        }
      };
      const inkSpreadPoly = shapeNode.cloneNode(true);
      const spreadShiftX = (hash01(`${seed}|risoSpreadX`) - 0.5) * 2.6;
      const spreadShiftY = (hash01(`${seed}|risoSpreadY`) - 0.5) * 2.6;
      inkSpreadPoly.setAttribute('fill', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(0.13 * risoTextureCoverage * t).toFixed(3)})`);
      inkSpreadPoly.setAttribute('stroke', 'none');
      inkSpreadPoly.setAttribute('transform', `translate(${spreadShiftX.toFixed(3)} ${spreadShiftY.toFixed(3)})`);
      stripOverlayMetadata(inkSpreadPoly);
      const risoTexturePoly = shapeNode.cloneNode(true);
      risoTexturePoly.setAttribute('fill', `url(#${risoTexturePatternId})`);
      risoTexturePoly.setAttribute('opacity', String(Math.min(0.48, 0.15 * risoTextureCoverage * t)));
      risoTexturePoly.setAttribute('stroke', 'none');
      risoTexturePoly.setAttribute('filter', `url(#${risoDotSoftenFilterId})`);
      risoTexturePoly.style.mixBlendMode = 'overlay';
      stripOverlayMetadata(risoTexturePoly);
      const centerPoly = shapeNode.cloneNode(true);
      centerPoly.setAttribute('fill', `url(#${centerId})`);
      centerPoly.setAttribute('opacity', '1');
      centerPoly.setAttribute('stroke', 'none');
      stripOverlayMetadata(centerPoly);
      const edgePoly = shapeNode.cloneNode(true);
      edgePoly.setAttribute('fill', `url(#${edgeId})`);
      edgePoly.setAttribute('opacity', '1');
      edgePoly.setAttribute('stroke', 'none');
      stripOverlayMetadata(edgePoly);
      const paperKnockoutPoly = shapeNode.cloneNode(true);
      paperKnockoutPoly.setAttribute('fill', `url(#${risoPaperKnockoutPatternId})`);
      paperKnockoutPoly.setAttribute('opacity', String(Math.min(0.48, 0.32 * paperKnockoutCoverage * paperKnockoutToneFactor * t)));
      paperKnockoutPoly.setAttribute('stroke', 'none');
      stripOverlayMetadata(paperKnockoutPoly);
      const inkBloomPoly = shapeNode.cloneNode(true);
      inkBloomPoly.setAttribute('fill', 'none');
      inkBloomPoly.setAttribute('stroke', `rgb(${rgb.r},${rgb.g},${rgb.b})`);
      inkBloomPoly.setAttribute('stroke-width', String((1.45 + 1.05 * risoTextureCoverage).toFixed(2)));
      inkBloomPoly.setAttribute('stroke-opacity', String(Math.min(0.34, 0.14 * risoTextureCoverage * t)));
      inkBloomPoly.setAttribute('stroke-linejoin', 'round');
      inkBloomPoly.setAttribute('stroke-linecap', 'round');
      inkBloomPoly.setAttribute('vector-effect', 'non-scaling-stroke');
      stripOverlayMetadata(inkBloomPoly);
      const paperToothPoly = shapeNode.cloneNode(true);
      const toothShiftX = (hash01(`${seed}|paperToothX`) - 0.5) * 1.6;
      const toothShiftY = (hash01(`${seed}|paperToothY`) - 0.5) * 1.6;
      paperToothPoly.setAttribute('fill', 'none');
      paperToothPoly.setAttribute('stroke', 'rgba(246, 239, 224, 0.5)');
      paperToothPoly.setAttribute('stroke-width', String((0.72 + 0.36 * risoTextureCoverage).toFixed(2)));
      paperToothPoly.setAttribute('stroke-opacity', String(Math.min(0.46, 0.2 * risoTextureCoverage * t)));
      paperToothPoly.setAttribute('stroke-linejoin', 'round');
      paperToothPoly.setAttribute('stroke-linecap', 'round');
      paperToothPoly.setAttribute('stroke-dasharray', '1.3 5.8');
      paperToothPoly.setAttribute('stroke-dashoffset', String((hash01(`${seed}|paperDash`) * 7).toFixed(2)));
      paperToothPoly.setAttribute('transform', `translate(${toothShiftX.toFixed(3)} ${toothShiftY.toFixed(3)})`);
      paperToothPoly.setAttribute('vector-effect', 'non-scaling-stroke');
      stripOverlayMetadata(paperToothPoly);
      overlayGroup.appendChild(inkSpreadPoly);
      overlayGroup.appendChild(risoTexturePoly);
      overlayGroup.appendChild(centerPoly);
      overlayGroup.appendChild(edgePoly);
      if (paperKnockoutCoverage > 0.001) overlayGroup.appendChild(paperKnockoutPoly);
      overlayGroup.appendChild(inkBloomPoly);
      overlayGroup.appendChild(paperToothPoly);

      const darkEdgeBoost = darkEdgeBoostForLuminance(colorHex);
      if (darkEdgeBoost > 0.001) {
        const darkEdgeId = `${renderToken}_darkedge_${idx}`;
        const darkEdgeGrad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        darkEdgeGrad.setAttribute('id', darkEdgeId);
        darkEdgeGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
        darkEdgeGrad.setAttribute('cx', String(cx));
        darkEdgeGrad.setAttribute('cy', String(cy));
        darkEdgeGrad.setAttribute('r', String(edgeR));
        const d0 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        d0.setAttribute('offset', '0%');
        d0.setAttribute('stop-color', '#000000');
        d0.setAttribute('stop-opacity', '0');
        const d1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        d1.setAttribute('offset', '72%');
        d1.setAttribute('stop-color', '#000000');
        d1.setAttribute('stop-opacity', String(Math.min(0.4, 0.014 * darkEdgeBoost * t)));
        const d2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        d2.setAttribute('offset', '100%');
        d2.setAttribute('stop-color', '#000000');
        d2.setAttribute('stop-opacity', String(Math.min(0.55, 0.105 * darkEdgeBoost * t)));
        darkEdgeGrad.appendChild(d0);
        darkEdgeGrad.appendChild(d1);
        darkEdgeGrad.appendChild(d2);
        defsNode.appendChild(darkEdgeGrad);

        const darkEdgePoly = shapeNode.cloneNode(true);
        darkEdgePoly.setAttribute('fill', `url(#${darkEdgeId})`);
        darkEdgePoly.setAttribute('opacity', '1');
        darkEdgePoly.setAttribute('stroke', 'none');
        overlayGroup.appendChild(darkEdgePoly);
      }
      return overlayGroup;
    };

    const paperDepthStrengthForSize = (w, h) => {
      const minDim = Math.max(1, Math.min(Math.abs(w), Math.abs(h)));
      if (minDim < 42) return 0;
      if (minDim < 78) return (minDim - 42) / 36 * 0.34;
      if (minDim < 180) return 0.34 + ((minDim - 78) / 102) * 0.26;
      return 0.6;
    };
    const stripCloneBlockMetadata = (node) => {
      try {
        node.removeAttribute('data-block-id');
        node.classList.remove('user-piece-highlight');
      } catch (_) {
        /* ignore */
      }
    };
    const createPaperDepthLayers = (shapeNode, blockRect, idx, seedKey = '', options = {}) => {
      if (!shapeNode || !blockRect) return null;
      const { x, y, width, height } = blockRect;
      const strength = paperDepthStrengthForSize(width, height);
      if (strength <= 0.001) return null;
      const includeEdge = options.edge === true;
      const seed = `${seedKey || idx}|paper|${Math.round(x)}|${Math.round(y)}|${Math.round(width)}|${Math.round(height)}`;
      const lift = 0.28 + hash01(`${seed}|lift`) * 0.28;
      const shadowDx = 0.28 * lift;
      const shadowDy = 0.38 * lift;
      const strokeW = Math.max(0.65, Math.min(1.65, Math.min(Math.abs(width), Math.abs(height)) * 0.016));
      let edgeId = null;

      if (includeEdge) {
        edgeId = `${renderToken}_paperedge_${idx}`;
        const edgeGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        edgeGrad.setAttribute('id', edgeId);
        edgeGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
        edgeGrad.setAttribute('x1', String(x));
        edgeGrad.setAttribute('y1', String(y));
        edgeGrad.setAttribute('x2', String(x + width));
        edgeGrad.setAttribute('y2', String(y + height));
        [
          ['0%', '#ffffff', (0.29 * strength).toFixed(3)],
          ['34%', '#ffffff', (0.1 * strength).toFixed(3)],
          ['58%', '#6f5a45', '0'],
          ['100%', '#3b2f25', (0.24 * strength).toFixed(3)]
        ].forEach(([offset, color, opacity]) => {
          const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
          stop.setAttribute('offset', offset);
          stop.setAttribute('stop-color', color);
          stop.setAttribute('stop-opacity', opacity);
          edgeGrad.appendChild(stop);
        });
        defsNode.appendChild(edgeGrad);
      }

      const under = shapeNode.cloneNode(true);
      stripCloneBlockMetadata(under);
      under.setAttribute('fill', '#2d241d');
      under.setAttribute('fill-opacity', (0.025 * strength).toFixed(3));
      under.setAttribute('stroke', 'none');
      under.setAttribute('transform', `translate(${shadowDx.toFixed(3)} ${shadowDy.toFixed(3)})`);

      let over = null;
      if (includeEdge && edgeId) {
        over = shapeNode.cloneNode(true);
        stripCloneBlockMetadata(over);
        over.setAttribute('fill', 'none');
        over.setAttribute('stroke', `url(#${edgeId})`);
        over.setAttribute('stroke-width', strokeW.toFixed(3));
        over.setAttribute('stroke-linejoin', 'round');
        over.setAttribute('stroke-linecap', 'round');
        over.setAttribute('pointer-events', 'none');
        over.setAttribute('vector-effect', 'non-scaling-stroke');
      }
      return { under, over };
    };
    
    const blocksForRender = this._coalesceHstSameCellShardsForDisplay(displayBlocks);
    const renderQueue = blocksForRender
      .map((block, originalIndex) => ({ block, originalIndex }))
      .sort((a, b) => {
        const addedA = a.originalIndex === this.lastAddedIndex;
        const addedB = b.originalIndex === this.lastAddedIndex;
        if (addedA !== addedB) return addedA ? 1 : -1;
        const protectedAnchor = (block) => block && block.protectedAnchorId != null;
        const protectedA = protectedAnchor(a.block);
        const protectedB = protectedAnchor(b.block);
        if (protectedA !== protectedB) return protectedA ? 1 : -1;
        const visualLayerIndex = (block) => {
          const explicit = Number(block?.visualLayerIndex);
          if (Number.isFinite(explicit)) return explicit;
          return 0;
        };
        const layerA = visualLayerIndex(a.block);
        const layerB = visualLayerIndex(b.block);
        if (Math.abs(layerA - layerB) > 1e-6) {
          return this.backsidePreviewEnabled ? layerB - layerA : layerA - layerB;
        }
        return this.backsidePreviewEnabled
          ? b.originalIndex - a.originalIndex
          : a.originalIndex - b.originalIndex;
      });

    const diagonalAxisRenderKey = (block) =>
      String(block?.axisOriginId || block?.starterAxisRegionId || block?.originalPatternId || block?.id || '');
    const diagonalAxisRenderByKey = new Map();
    renderQueue.forEach(({ block }) => {
      if (!block || block.specialPatternType !== 'diagonalAxis' || !Array.isArray(block.polygonPieces)) return;
      if (block.axisLayerMode !== 'collage') return;
      const key = diagonalAxisRenderKey(block);
      const x = Number(block.x) || 0;
      const y = Number(block.y) || 0;
      const w = Math.max(1, Number(block.width) || 1);
      const h = Math.max(1, Number(block.height) || 1);
      const prev = diagonalAxisRenderByKey.get(key);
      if (!prev) {
        diagonalAxisRenderByKey.set(key, { x, y, x2: x + w, y2: y + h });
      } else {
        prev.x = Math.min(prev.x, x);
        prev.y = Math.min(prev.y, y);
        prev.x2 = Math.max(prev.x2, x + w);
        prev.y2 = Math.max(prev.y2, y + h);
      }
    });
    diagonalAxisRenderByKey.forEach((group, key) => {
      const groupW = Math.max(1, group.x2 - group.x);
      const groupH = Math.max(1, group.y2 - group.y);
      const jitterMultiplier = this.calculateJitterMultiplier(groupW, groupH);
      const rotationMultiplier = this.calculateRotationMultiplier(groupW, groupH);
      const axisSeed = `diagonal-axis:${key}:${Math.round(group.x)}:${Math.round(group.y)}:${Math.round(groupW)}:${Math.round(groupH)}`;
      group.jitterX = (this.seededUnit(`${axisSeed}:x`) - 0.5) * 6 * jitterMultiplier;
      group.jitterY = (this.seededUnit(`${axisSeed}:y`) - 0.5) * 6 * jitterMultiplier;
      group.jitterRotation = (this.seededUnit(`${axisSeed}:rot`) - 0.5) * 2.2 * rotationMultiplier;
      group.centerX = group.x + groupW / 2 + group.jitterX;
      group.centerY = group.y + groupH / 2 + group.jitterY;
      diagonalAxisRenderByKey.set(key, group);
    });

    const deferredHstGroups = [];

    renderQueue.forEach(({ block, originalIndex }, i) => {
      // Safety check: ensure block has valid color
      if (!block || !block.color || typeof block.color !== 'string') {
        console.warn('Invalid block found, skipping:', block);
        return; // Skip this block
      }
      
      SimpleQuiltEngine.ensureInsetClassificationFromGeometry(block);
      const renderSeed = [
        block.id || `idx_${originalIndex}`,
        Math.round(Number(block.x) || 0),
        Math.round(Number(block.y) || 0),
        Math.round(Number(block.width) || 0),
        Math.round(Number(block.height) || 0),
        block.patternType || '',
        block.specialPatternType || ''
      ].join('|');
      const randForBlock = (salt) => this.seededUnit(`quilt-render:${renderSeed}:${salt}`);

      // Special handling for special pattern cells - render as organic polygons
      if (
        (block.patternType === 'special' && block.specialPatternType) ||
        block.specialPatternType === 'hst' ||
        (block.specialPatternType === 'diagonalAxis' && Array.isArray(block.polygonPieces))
      ) {
        // Ensure positive dimensions to prevent SVG errors
        const safeWidth = Math.max(1, block.width);
        const safeHeight = Math.max(1, block.height);
        const isNewestSubmissionBlock = Number(block.submissionIndex) === Number(submissionCount) && Number(submissionCount) > 0;
        const submissionAge = Number(submissionCount) - (Number(block.submissionIndex) || 0);
        const isRecentSubmissionBlock = Number(block.submissionIndex) > 0 && submissionAge >= 0 && submissionAge <= SimpleQuiltEngine.RECENT_VISIBLE_SUBMISSION_WINDOW;
        const isAxisCollageLayer = block.axisLayerMode === 'collage' && !isRecentSubmissionBlock;
        
        if (block.specialPatternType === 'diagonalAxis' && Array.isArray(block.polygonPieces)) {
          const w = safeWidth;
          const h = safeHeight;
          const axisRender = isAxisCollageLayer ? diagonalAxisRenderByKey.get(diagonalAxisRenderKey(block)) : null;
          const jitterX = Number(axisRender?.jitterX) || 0;
          const jitterY = Number(axisRender?.jitterY) || 0;
          const jitterRotation = Number(axisRender?.jitterRotation) || 0;
          const renderX = block.x + jitterX;
          const renderY = block.y + jitterY;
          const blockRect = { x: renderX, y: renderY, width: w, height: h };
          const watercolorStrength = watercolorStrengthForSize(w, h);
          const specialGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          specialGroup.classList.add('quilt-parallax-block');
          const centerX = Number(axisRender?.centerX) || (renderX + w / 2);
          const centerY = Number(axisRender?.centerY) || (renderY + h / 2);
          const baseTransform = `rotate(${jitterRotation} ${centerX} ${centerY})`;
          specialGroup.setAttribute('transform', baseTransform);
          specialGroup.dataset.baseTransform = baseTransform;
          specialGroup.dataset.parallaxPhase = String(i);
          specialGroup.dataset.parallaxCx = String(centerX);
          specialGroup.dataset.parallaxCy = String(centerY);
          block.polygonPieces.forEach((piece, pi) => {
            const pts = (piece.points || [])
              .map((p) => {
                const x = Number(Array.isArray(p) ? p[0] : p?.x);
                const y = Number(Array.isArray(p) ? p[1] : p?.y);
                return `${renderX + x},${renderY + y}`;
              })
              .join(' ');
            if (!pts) return;
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', pts);
            const fillC = piece.color || block.color;
            poly.setAttribute('fill', fillC);
            poly.setAttribute('stroke', fillC);
            poly.setAttribute('stroke-width', '1.2');
            poly.setAttribute('stroke-linejoin', 'round');
            poly.setAttribute('stroke-linecap', 'round');
            poly.setAttribute('vector-effect', 'non-scaling-stroke');
            poly.setAttribute('data-block-id', block.id);
            if (this.userPieces.has(block.id)) {
              poly.classList.add('user-piece-highlight');
            }
            const paperDepth = createPaperDepthLayers(
              poly,
              blockRect,
              `diag_${i}_${pi}`,
              `${block.id || 'block'}_diag_${pi}`,
              { edge: false }
            );
            if (paperDepth?.under) specialGroup.appendChild(paperDepth.under);
            specialGroup.appendChild(poly);
            const watercolorOverlay = createWatercolorOverlay(
              poly,
              blockRect,
              fillC,
              `diag_${i}_${pi}`,
              watercolorStrength,
              `${block.id || 'block'}_diag_${pi}`
            );
            if (watercolorOverlay) specialGroup.appendChild(watercolorOverlay);
            if (paperDepth?.over) specialGroup.appendChild(paperDepth.over);
          });
          if (originalIndex === this.lastAddedIndex) {
            specialGroup.dataset.newBlock = '1';
          }
          parallaxLayer.appendChild(specialGroup);
          return;
        }

        if (block.specialPatternType === 'hst') {
          const w = safeWidth;
          const h = safeHeight;
          /** All HST: cell-locked classic halves. Group rotate/jitter separates the shared diagonal and shows the quilt background as a "shadow" strip. */
          const renderX = block.x;
          const renderY = block.y;
          const tris = Utils.getHstDrawTriangles(block, {
            exactPlacement: true,
            forceClassicPair: true
          });
          const specialGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          specialGroup.classList.add('quilt-parallax-block', 'quilt-parallax-block--hst');
          /** Cover fractional grid seams (especially after quiltFieldLayer scale 1.16×). */
          const hstEdgeBleed = horizontalStretch > 1 ? 1.35 : 0.75;
          /** Never drop-shadow HST groups — collage used inline filter that overrode .quilt-parallax-block--hst and read as a side strip. */
          const centerX = renderX + w / 2;
          const centerY = renderY + h / 2;
          const baseTransform = '';
          if (baseTransform) {
            specialGroup.setAttribute('transform', baseTransform);
          }
          specialGroup.dataset.baseTransform = baseTransform;
          specialGroup.dataset.parallaxPhase = String(i);
          specialGroup.dataset.parallaxCx = String(centerX);
          specialGroup.dataset.parallaxCy = String(centerY);
          const hstUserHighlight =
            this.userPieces.has(block.id) ||
            (block.id != null && this.userPieces.has(`${block.id}__freezeTriB`));
          const underpaint = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          underpaint.setAttribute('x', String(block.x - hstEdgeBleed));
          underpaint.setAttribute('y', String(block.y - hstEdgeBleed));
          underpaint.setAttribute('width', String(w + hstEdgeBleed * 2));
          underpaint.setAttribute('height', String(h + hstEdgeBleed * 2));
          underpaint.setAttribute('fill', block.color);
          underpaint.setAttribute('stroke', 'none');
          underpaint.setAttribute('pointer-events', 'none');
          specialGroup.appendChild(underpaint);
          const hstTriArea = (pts) => {
            let a = 0;
            for (let pi = 0; pi < pts.length; pi++) {
              const p0 = pts[pi];
              const p1 = pts[(pi + 1) % pts.length];
              a += p0[0] * p1[1] - p1[0] * p0[1];
            }
            return Math.abs(a * 0.5);
          };
          const trisPaintOrder = tris
            .map((t, ti) => ({
              t,
              ti,
              area: hstTriArea((t.points || []).map((p) => [Number(p[0]), Number(p[1])]))
            }))
            .sort((a, b) => b.area - a.area);
          trisPaintOrder.forEach(({ t, ti }) => {
            const absVerts = this._bleedHstVertsToCell(
              (t.points || []).map((p) => [renderX + Number(p[0]), renderY + Number(p[1])]),
              block.x,
              block.y,
              w,
              h,
              hstEdgeBleed
            );
            const ptsStr = absVerts.map((p) => `${p[0]},${p[1]}`).join(' ');
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', ptsStr);
            const fillC = t.color || block.color;
            poly.setAttribute('fill', fillC);
            poly.setAttribute('stroke', 'none');
            poly.setAttribute('shape-rendering', 'geometricPrecision');
            poly.setAttribute('data-block-id', block.id);
            poly.setAttribute('data-hst-wedge', String(ti));
            poly.setAttribute('pointer-events', 'all');
            if (hstUserHighlight) {
              poly.classList.add('user-piece-highlight');
            }
            specialGroup.appendChild(poly);
          });
          if (originalIndex === this.lastAddedIndex) {
            specialGroup.dataset.newBlock = '1';
          }
          deferredHstGroups.push(specialGroup);
          return;
        }

        if (block.specialPatternType === 'insetCircle') {
          const w = safeWidth;
          const h = safeHeight;
          const jitterMultiplier = this.calculateJitterMultiplier(w, h) * (isAxisCollageLayer ? 1.14 : 1);
          const rotationMultiplier = this.calculateRotationMultiplier(w, h);
          const jitterX = (randForBlock('inset:x') - 0.5) * 6 * jitterMultiplier;
          const jitterY = (randForBlock('inset:y') - 0.5) * 6 * jitterMultiplier;
          const jitterRotation = (randForBlock('inset:rot') - 0.5) * (isAxisCollageLayer ? 4.2 : 3) * rotationMultiplier;
          const rotationRadians = (jitterRotation * Math.PI) / 180;
          const rawMaxExtension = Math.max(w, h) * Math.abs(Math.sin(rotationRadians)) * (isAxisCollageLayer ? 0.42 : 0.3);
          const maxExtension = isAxisCollageLayer
            ? Math.min(rawMaxExtension, SimpleQuiltEngine.AXIS_COLLAGE_MAX_VISUAL_EXTENSION)
            : rawMaxExtension;
          const renderX = block.x + jitterX - maxExtension * 0.5;
          const renderY = block.y + jitterY - maxExtension * 0.5;
          const blockRect = { x: renderX, y: renderY, width: w, height: h };
          const watercolorStrength = watercolorStrengthForSize(w, h);
          const specialGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          specialGroup.classList.add('quilt-parallax-block');
          if (isAxisCollageLayer) {
            specialGroup.setAttribute('style', 'filter: drop-shadow(0.9px 1.4px 1.5px rgba(42, 33, 24, 0.18));');
          }
          const centerX = renderX + w / 2;
          const centerY = renderY + h / 2;
          const baseTransform = `rotate(${jitterRotation} ${centerX} ${centerY})`;
          specialGroup.setAttribute('transform', baseTransform);
          specialGroup.dataset.baseTransform = baseTransform;
          specialGroup.dataset.parallaxPhase = String(i);
          specialGroup.dataset.parallaxCx = String(centerX);
          specialGroup.dataset.parallaxCy = String(centerY);

          const handCutPolygon = this.createHandCutPolygon(renderX, renderY, w, h, jitterMultiplier, `${renderSeed}:inset:bg`);
          handCutPolygon.setAttribute('fill', block.color);
          handCutPolygon.setAttribute('stroke', 'none');
          handCutPolygon.setAttribute('data-block-id', block.id);
          if (this.userPieces.has(block.id)) {
            handCutPolygon.classList.add('user-piece-highlight');
          }
          const bgPaperDepth = createPaperDepthLayers(
            handCutPolygon,
            blockRect,
            `inset_bg_${i}`,
            `${block.id || 'block'}_inset_bg`,
            { edge: false }
          );
          if (bgPaperDepth?.under) specialGroup.appendChild(bgPaperDepth.under);
          specialGroup.appendChild(handCutPolygon);
          const bgPtsAttr = handCutPolygon.getAttribute('points');
          const bgVerts = Utils.parseSvgPolygonPointsAttr(bgPtsAttr || '');
          const bgPolyRad = Utils.polygonRadialAnchorFromPoints(bgVerts);
          const bgOverlay = createWatercolorOverlay(
            handCutPolygon,
            blockRect,
            block.color,
            `inset_bg_${i}`,
            watercolorStrength,
            `${block.id || 'block'}_inset_bg`,
            bgPolyRad &&
              ({
                cx: bgPolyRad.cx,
                cy: bgPolyRad.cy,
                span: bgPolyRad.span
              })
          );
          if (bgOverlay) specialGroup.appendChild(bgOverlay);
          if (bgPaperDepth?.over) specialGroup.appendChild(bgPaperDepth.over);

          const innerC = typeof block.insetInnerColor === 'string' ? block.insetInnerColor : block.color;
          const sw = Utils.insetCircleSectorPointsWorld(block, renderX, renderY);
          if (sw.kind !== 'none' && sw.points && sw.points.length >= 3) {
            const innerVerts = sw.points.map((p) => [Number(p[0]), Number(p[1])]);
            const innerPolyRad = Utils.polygonRadialAnchorFromPoints(innerVerts);
            const innerPtsStr = sw.points.map((p) => `${p[0]},${p[1]}`).join(' ');
            const innerPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            innerPoly.setAttribute('points', innerPtsStr);
            innerPoly.setAttribute('fill', innerC);
            innerPoly.setAttribute('stroke', 'none');
            innerPoly.setAttribute('data-block-id', block.id);
            if (this.userPieces.has(block.id)) {
              innerPoly.classList.add('user-piece-highlight');
            }
            const innerPaperDepth = createPaperDepthLayers(
              innerPoly,
              blockRect,
              `inset_inner_${i}`,
              `${block.id || 'block'}_inset_inner`,
              { edge: false }
            );
            if (innerPaperDepth?.under) specialGroup.appendChild(innerPaperDepth.under);
            specialGroup.appendChild(innerPoly);
            const innerOverlay = createWatercolorOverlay(
              innerPoly,
              blockRect,
              innerC,
              `inset_inner_${i}`,
              watercolorStrength,
              `${block.id || 'block'}_inset_inner`,
              innerPolyRad &&
                ({
                  cx: innerPolyRad.cx,
                  cy: innerPolyRad.cy,
                  span: innerPolyRad.span
                })
            );
            if (innerOverlay) specialGroup.appendChild(innerOverlay);
            if (innerPaperDepth?.over) specialGroup.appendChild(innerPaperDepth.over);
          }

          if (originalIndex === this.lastAddedIndex) {
            specialGroup.dataset.newBlock = '1';
          }
          parallaxLayer.appendChild(specialGroup);
          return;
        }
        
        // Tiling patterns need shared, exact edges; independent hand-cut edges can expose white slivers.
        const isGaplessTilingPattern = ['checkerboard', 'stripes', 'railfence'].includes(block.specialPatternType);
        const jitterMultiplier = isGaplessTilingPattern
          ? 0
          : this.calculateJitterMultiplier(block.width, block.height) * (isAxisCollageLayer ? 1.14 : 1);
        const handCutPolygon = isGaplessTilingPattern
          ? (() => {
              const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
              poly.setAttribute(
                'points',
                `${block.x},${block.y} ${block.x + safeWidth},${block.y} ${block.x + safeWidth},${block.y + safeHeight} ${block.x},${block.y + safeHeight}`
              );
              return poly;
            })()
          : this.createHandCutPolygon(block.x, block.y, safeWidth, safeHeight, jitterMultiplier, `${renderSeed}:special-main`);
        handCutPolygon.setAttribute('fill', block.color);
        handCutPolygon.setAttribute('stroke', 'none');
        
        const watercolorStrength = watercolorStrengthForSize(safeWidth, safeHeight);
        const watercolorOverlay = createWatercolorOverlay(
          handCutPolygon,
          { x: block.x, y: block.y, width: safeWidth, height: safeHeight },
          block.color,
          `special_${i}`,
        watercolorStrength,
        block.id || `special_${i}`
        );
        const specialGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        specialGroup.classList.add('quilt-parallax-block');
        if (isAxisCollageLayer) {
          specialGroup.setAttribute('style', 'filter: drop-shadow(0.9px 1.4px 1.5px rgba(42, 33, 24, 0.18));');
        }
        specialGroup.dataset.baseTransform = '';
        specialGroup.dataset.parallaxPhase = String(i);
        specialGroup.dataset.parallaxCx = String(block.x + safeWidth / 2);
        specialGroup.dataset.parallaxCy = String(block.y + safeHeight / 2);
        const paperDepth = createPaperDepthLayers(
          handCutPolygon,
          { x: block.x, y: block.y, width: safeWidth, height: safeHeight },
          `special_${i}`,
          block.id || `special_${i}`,
          { edge: false }
        );
        if (paperDepth?.under) specialGroup.appendChild(paperDepth.under);
        specialGroup.appendChild(handCutPolygon);
        if (watercolorOverlay) specialGroup.appendChild(watercolorOverlay);
        if (paperDepth?.over) specialGroup.appendChild(paperDepth.over);

        // Add new block animation for special pattern cells
        if (originalIndex === this.lastAddedIndex) {
          specialGroup.dataset.newBlock = '1';
        }
        
        parallaxLayer.appendChild(specialGroup);
        return; // Skip the rest of the block rendering logic
      }
      
      const regularSubmissionAge = Number(submissionCount) - (Number(block.submissionIndex) || 0);
      const isNewestRegularSubmissionBlock = Number(block.submissionIndex) === Number(submissionCount) && Number(submissionCount) > 0;
      const isRecentRegularSubmissionBlock =
        Number(block.submissionIndex) > 0 &&
        regularSubmissionAge >= 0 &&
        regularSubmissionAge <= SimpleQuiltEngine.RECENT_VISIBLE_SUBMISSION_WINDOW;

      // Recent top-layer blocks draw slightly inset so they read as additions without blanketing older patches.
      const regularVisibilityScale = isNewestRegularSubmissionBlock
        ? SimpleQuiltEngine.NEW_VISIBLE_REGULAR_RENDER_SCALE
        : isRecentRegularSubmissionBlock
          ? SimpleQuiltEngine.RECENT_VISIBLE_REGULAR_RENDER_SCALE
          : 1;

      // Calculate jitter based on this specific block's size
      const jitterMultiplier = this.calculateJitterMultiplier(block.width, block.height) * (isRecentRegularSubmissionBlock ? 0.55 : 1);
      const rotationMultiplier = this.calculateRotationMultiplier(block.width, block.height);
      
      const jitterX = (randForBlock('regular:x') - 0.5) * 6 * jitterMultiplier;
      const jitterY = (randForBlock('regular:y') - 0.5) * 6 * jitterMultiplier;
      const jitterRotation = (randForBlock('regular:rot') - 0.5) * 3 * rotationMultiplier * (isRecentRegularSubmissionBlock ? 0.55 : 1);
      
      // Calculate gap compensation for rotation
      const rotationRadians = jitterRotation * Math.PI / 180;
      const maxExtension = Math.max(block.width, block.height) * Math.abs(Math.sin(rotationRadians)) * (isRecentRegularSubmissionBlock ? 0.08 : 0.3);
      
      const jitteredBlock = {
        x: block.x + jitterX - (maxExtension * 0.5),
        y: block.y + jitterY - (maxExtension * 0.5),
        width: block.width,
        height: block.height,
        color: block.color,
        rotation: jitterRotation
      };
      
                        // Calculate if this block should be scaled (large blocks get 1% bigger)
      const blockArea = jitteredBlock.width * jitteredBlock.height;
      const areaFactor = Math.sqrt(blockArea) / 100;
      const blockScale = regularVisibilityScale < 1 ? regularVisibilityScale : areaFactor >= 2 ? 1.01 : 1.0;
      const scaledWidth = Math.max(1, jitteredBlock.width * blockScale);
      const scaledHeight = Math.max(1, jitteredBlock.height * blockScale);
      const scaledX = jitteredBlock.x + (jitteredBlock.width - scaledWidth) / 2;
      const scaledY = jitteredBlock.y + (jitteredBlock.height - scaledHeight) / 2;
      
      const baseUnderlayPolygon = regularVisibilityScale < 1
        ? this.createHandCutPolygon(jitteredBlock.x, jitteredBlock.y, jitteredBlock.width, jitteredBlock.height, jitterMultiplier * 0.45, `${renderSeed}:regular-base`)
        : null;
      if (baseUnderlayPolygon) {
        baseUnderlayPolygon.setAttribute('fill', jitteredBlock.color);
        baseUnderlayPolygon.setAttribute('fill-opacity', isNewestRegularSubmissionBlock ? '0.9' : '0.82');
        baseUnderlayPolygon.setAttribute('stroke', 'none');
        baseUnderlayPolygon.setAttribute('pointer-events', 'none');
      }
      const seamUnderpaintBleed = regularVisibilityScale < 1
        ? 0
        : Math.min(2.8125, (0.65 + jitterMultiplier * 1.05 + Math.min(0.55, maxExtension * 0.08)) * 1.25);
      const seamUnderpaintPolygon = seamUnderpaintBleed > 0
        ? this.createHandCutPolygon(
            scaledX - seamUnderpaintBleed,
            scaledY - seamUnderpaintBleed,
            scaledWidth + seamUnderpaintBleed * 2,
            scaledHeight + seamUnderpaintBleed * 2,
            jitterMultiplier * 0.28,
            `${renderSeed}:regular-seam-underpaint`
          )
        : null;
      if (seamUnderpaintPolygon) {
        seamUnderpaintPolygon.setAttribute('fill', jitteredBlock.color);
        seamUnderpaintPolygon.setAttribute('fill-opacity', '0.9');
        seamUnderpaintPolygon.setAttribute('stroke', 'none');
        seamUnderpaintPolygon.setAttribute('pointer-events', 'none');
      }

      // Create hand-cut polygon instead of perfect rectangle
      const handCutPolygon = this.createHandCutPolygon(scaledX, scaledY, scaledWidth, scaledHeight, jitterMultiplier, `${renderSeed}:regular-main`);
      handCutPolygon.setAttribute('fill', jitteredBlock.color);
      
               // Create individual pattern elements for this block instead of using tiling patterns
     const basePatternType = getPatternForColor(jitteredBlock.color);
     const patternVariations = {
       dots: ['dots1', 'dots2', 'dots3', 'dots4', 'dots5', 'dots6', 'dots7'],
       stripes: ['stripes1', 'stripes2', 'stripes3', 'stripes4', 'stripes5', 'stripes6', 'stripes7'],
       floral: ['floral1', 'floral2', 'floral3', 'floral4', 'floral5', 'floral6'],
       geometric: ['geometric1', 'geometric2', 'geometric3', 'geometric4', 'geometric5', 'geometric6']
     };
     
     // Randomly select a variation of the pattern type
     const variations = patternVariations[basePatternType];
     const randomVariation = variations[Math.floor(randForBlock('pattern:variation') * variations.length)];
     
     // Add organic randomness to pattern opacity, positioning, and scale
     const opacityVariation = 0.7 + (randForBlock('pattern:opacity') * 0.6); // 0.7 to 1.3 (more variation)
     
     // Calculate safe offset limits to keep pattern within block bounds
     const maxOffsetX = Math.min(3, jitteredBlock.width * 0.1); // 10% of block width max
     const maxOffsetY = Math.min(3, jitteredBlock.height * 0.1); // 10% of block height max
     const patternOffsetX = (randForBlock('pattern:offset-x') - 0.5) * maxOffsetX * 2; // -maxOffset to +maxOffset
     const patternOffsetY = (randForBlock('pattern:offset-y') - 0.5) * maxOffsetY * 2; // -maxOffset to +maxOffset
     
     // Calculate safe scale to ensure pattern fills block but doesn't overflow
     const scaleVariation = 0.9 + (randForBlock('pattern:scale') * 0.2); // 0.9 to 1.1 (smaller scale range)
     
     // Calculate safe rotation to prevent overflow
     const maxRotation = Math.min(4, 15 / Math.max(jitteredBlock.width, jitteredBlock.height)); // Smaller blocks get less rotation
     const rotationVariation = (randForBlock('pattern:rotation') - 0.5) * maxRotation * 2; // -maxRotation to +maxRotation

     // Create individual pattern elements for this block
     const patternGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
     patternGroup.setAttribute('opacity', opacityVariation);
     
     patternGroup.setAttribute('transform', `translate(${jitteredBlock.x + patternOffsetX}, ${jitteredBlock.y + patternOffsetY}) scale(${scaleVariation}) rotate(${rotationVariation} ${jitteredBlock.width/2} ${jitteredBlock.height/2})`);
     
     // Create clipping path for this block
     const clipPathId = `clip-${i}`;
     const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
     clipPath.setAttribute('id', clipPathId);
     const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
     clipRect.setAttribute('x', 0);
     clipRect.setAttribute('y', 0);
     clipRect.setAttribute('width', Math.max(1, jitteredBlock.width));
     clipRect.setAttribute('height', Math.max(1, jitteredBlock.height));
     clipPath.appendChild(clipRect);
     this.quiltSVG.appendChild(clipPath);
     
     patternGroup.setAttribute('clip-path', `url(#${clipPathId})`);
     
     // Create pattern elements based on the selected variation
     this.createPatternElements(patternGroup, randomVariation, jitteredBlock.width, jitteredBlock.height);
     
     // Add the pattern group to the SVG
      

      
      const centerX = jitteredBlock.x + jitteredBlock.width / 2;
      const centerY = jitteredBlock.y + jitteredBlock.height / 2;
      
      handCutPolygon.setAttribute('data-block-id', block.id);
      
      // Add user piece highlighting
      if (this.userPieces.has(block.id)) {
        handCutPolygon.classList.add('user-piece-highlight');
      }
      
      const watercolorStrength = watercolorStrengthForSize(scaledWidth, scaledHeight);
      const watercolorOverlay = createWatercolorOverlay(
        handCutPolygon,
        { x: scaledX, y: scaledY, width: scaledWidth, height: scaledHeight },
        jitteredBlock.color,
        `regular_${i}`,
        watercolorStrength,
        block.id || `regular_${i}`
      );
      const blockGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const baseTransform = `rotate(${jitterRotation} ${centerX} ${centerY})`;
      blockGroup.classList.add('quilt-parallax-block');
      blockGroup.dataset.baseTransform = baseTransform;
      blockGroup.dataset.parallaxPhase = String(i);
      blockGroup.dataset.parallaxCx = String(centerX);
      blockGroup.dataset.parallaxCy = String(centerY);
      blockGroup.setAttribute('transform', baseTransform);
      const paperDepth = createPaperDepthLayers(
        handCutPolygon,
        { x: scaledX, y: scaledY, width: scaledWidth, height: scaledHeight },
        `regular_${i}`,
        block.id || `regular_${i}`
      );
      if (baseUnderlayPolygon) blockGroup.appendChild(baseUnderlayPolygon);
      if (seamUnderpaintPolygon) blockGroup.appendChild(seamUnderpaintPolygon);
      if (paperDepth?.under) blockGroup.appendChild(paperDepth.under);
      blockGroup.appendChild(handCutPolygon);
      if (watercolorOverlay) blockGroup.appendChild(watercolorOverlay);
      if (paperDepth?.over) blockGroup.appendChild(paperDepth.over);

      // Add new block animation
      if (originalIndex === this.lastAddedIndex) {
        blockGroup.dataset.newBlock = '1';
      }
      
      parallaxLayer.appendChild(blockGroup);
    });

    deferredHstGroups.forEach((group) => parallaxLayer.appendChild(group));

    if (renderMirroredField) {
      const addMirroredLayer = (id, transform) => {
        const mirroredLayer = parallaxLayer.cloneNode(true);
        mirroredLayer.setAttribute('id', id);
        mirroredLayer.setAttribute('aria-hidden', 'true');
        mirroredLayer.setAttribute('pointer-events', 'none');
        mirroredLayer.setAttribute('transform', transform);
        fieldLayer.appendChild(mirroredLayer);
      };

      addMirroredLayer('quiltMirroredFieldLayer', `translate(${minX + actualQuiltWidth} ${minY + actualQuiltHeight + mirrorSeamOffset - mirrorSeamOverlap}) scale(-1 -1)`);
    }

    parallaxLayer.querySelectorAll('[data-new-block="1"]').forEach((node) => {
      this._applyNewBlockAnimation(node);
    });

    if (debugBlocksEnabled) {
      const debugLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      debugLayer.setAttribute('id', 'quiltDebugBlockLayer');
      debugLayer.setAttribute('pointer-events', 'none');
      debugLayer.setAttribute('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace');
      blocks.forEach((block, index) => {
        if (!block) return;
        const x = Number(block.x);
        const y = Number(block.y);
        const w = Number(block.width);
        const h = Number(block.height);
        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
        const isNewest = Number(block.submissionIndex) === Number(submissionCount) && Number(submissionCount) > 0;
        const color =
          isNewest ? '#ff006e' :
            block.specialPatternType === 'hst' ? '#7b2cff' :
              block.axisLayerMode === 'collage' ? '#ff9f1c' :
                block.specialPatternType === 'diagonalAxis' ? '#00a6ff' :
                  block.patternType === 'special' ? '#7b2cff' :
                    '#111111';
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
        rect.setAttribute('fill', 'rgba(255,255,255,0.03)');
        rect.setAttribute('stroke', color);
        rect.setAttribute('stroke-width', isNewest ? '4' : '2');
        rect.setAttribute('stroke-dasharray', block.axisLayerMode === 'collage' ? '10 6' : 'none');
        rect.setAttribute('vector-effect', 'non-scaling-stroke');
        debugLayer.appendChild(rect);

        if (Array.isArray(block.polygonPieces) && block.polygonPieces.length) {
          block.polygonPieces.forEach((piece) => {
            const pts = (piece.points || [])
              .map((p) => {
                const px = Number(Array.isArray(p) ? p[0] : p?.x);
                const py = Number(Array.isArray(p) ? p[1] : p?.y);
                return Number.isFinite(px) && Number.isFinite(py) ? `${x + px},${y + py}` : '';
              })
              .filter(Boolean)
              .join(' ');
            if (!pts) return;
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', pts);
            poly.setAttribute('fill', 'none');
            poly.setAttribute('stroke', color);
            poly.setAttribute('stroke-width', '1.5');
            poly.setAttribute('stroke-dasharray', '5 5');
            poly.setAttribute('vector-effect', 'non-scaling-stroke');
            debugLayer.appendChild(poly);
          });
        }

        if (block.specialPatternType === 'hst') {
          const dbgTris = Utils.getHstDrawTriangles(block, {
            exactPlacement: true,
            forceClassicPair: true
          });
          dbgTris.forEach((tri, ti) => {
            const pts = (tri.points || [])
              .map((p) => {
                const px = Number(Array.isArray(p) ? p[0] : p?.x);
                const py = Number(Array.isArray(p) ? p[1] : p?.y);
                return Number.isFinite(px) && Number.isFinite(py) ? `${x + px},${y + py}` : '';
              })
              .filter(Boolean)
              .join(' ');
            if (!pts) return;
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', pts);
            poly.setAttribute('fill', 'none');
            poly.setAttribute('stroke', '#00e5ff');
            poly.setAttribute('stroke-width', '2');
            poly.setAttribute('vector-effect', 'non-scaling-stroke');
            debugLayer.appendChild(poly);
            const triLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            const cx =
              (tri.points || []).reduce((s, p) => s + Number(Array.isArray(p) ? p[0] : p?.x), 0) /
              Math.max(1, (tri.points || []).length);
            const cy =
              (tri.points || []).reduce((s, p) => s + Number(Array.isArray(p) ? p[1] : p?.y), 0) /
              Math.max(1, (tri.points || []).length);
            triLabel.setAttribute('x', String(x + cx));
            triLabel.setAttribute('y', String(y + cy));
            triLabel.setAttribute('fill', '#00e5ff');
            triLabel.setAttribute('font-size', '11');
            triLabel.setAttribute('text-anchor', 'middle');
            triLabel.setAttribute('dominant-baseline', 'middle');
            triLabel.textContent = `tri${ti}`;
            debugLayer.appendChild(triLabel);
          });
        }

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(x + 6));
        label.setAttribute('y', String(y + 18));
        label.setAttribute('fill', color);
        label.setAttribute('font-size', '18');
        label.setAttribute('paint-order', 'stroke');
        label.setAttribute('stroke', 'rgba(255,255,255,0.88)');
        label.setAttribute('stroke-width', '4');
        label.setAttribute('vector-effect', 'non-scaling-stroke');
        label.textContent = `${index}: #${block.submissionIndex ?? '?'} ${block.specialPatternType || block.patternType || 'regular'}`;
        debugLayer.appendChild(label);
      });
      fieldLayer.appendChild(debugLayer);
    }

    // Show newly added blocks (only when there are new blocks)
    const newBlocks = displayBlocks.filter(b => b.submissionIndex === submissionCount);
    if (newBlocks.length > 0) {
      console.log(`🆕 Added ${newBlocks.length} new block(s):`, newBlocks.map(b => ({
        color: b.color,
        size: `${Math.round(b.width)}×${Math.round(b.height)}`,
        area: Math.round(b.width * b.height),
        type: b.specialPatternType || 'regular'
      })));
    }

    this.lastAddedIndex = null;
  }

  setLastAddedIndex(index) {
    this.lastAddedIndex = index;
  }

  _applyNewBlockAnimation(group) {
    if (!group) return;
    group.setAttribute('opacity', '0');
    group.classList.add('new-block');
    group.addEventListener('animationend', () => {
      group.classList.remove('new-block');
      group.removeAttribute('opacity');
      delete group.dataset.newBlock;
    }, { once: true });
  }

  _applyNewBlockAnimationToMirroredLayer(mirroredLayer) {
    if (!mirroredLayer) return;
    mirroredLayer.querySelectorAll('[data-new-block="1"]').forEach((node) => {
      this._applyNewBlockAnimation(node);
    });
  }
  
  // Create hand-cut polygon with progressive edge variation based on size
  createHandCutPolygon(x, y, width, height, jitterMultiplier, seedKey = '') {
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const rand = (salt) => seedKey ? this.seededUnit(`${seedKey}:${salt}`) : Math.random();
    
    // Calculate progressive edge variation based on block size
    const blockArea = width * height;
    const minVariation = 1; // Minimum 1px variation for tiny blocks
    const maxVariation = 8; // Medium/large blocks need a little more hand-cut character
    
    // More selective scaling - large blocks get moderate variation, not dramatic
    const areaFactor = Math.sqrt(blockArea) / 100; // Normalize to 100px² blocks
    
    // Use a threshold system: small/medium blocks stay subtle, large ones get moderate variation
    let sizeAdjustedVariation;
    if (areaFactor < 2) {
      // Small/medium blocks: subtle variation (1-4px)
      sizeAdjustedVariation = Math.min(4, Math.max(minVariation, areaFactor * 2));
    } else {
      // Large blocks: moderate variation (4-8px) without making the edges wobbly
      sizeAdjustedVariation = Math.min(maxVariation, 4 + (areaFactor - 2) * 1.35);
    }
    
    // Apply jitter multiplier to the size-adjusted variation
    const handCutVariation = sizeAdjustedVariation * jitterMultiplier;;
    
    // Progressive segments - also more selective
    const minSegments = 1; // Minimal segments for tiny blocks
    const maxSegments = 5; // A single extra segment helps larger edges stop reading as square
    
    let segments;
    if (areaFactor < 2) {
      // Small/medium blocks: minimal segments (1-3)
      segments = Math.max(minSegments, Math.min(3, Math.floor(areaFactor * 1.5)));
    } else {
      // Large blocks: moderate segments (3-5) - still restrained, but less boxy
      segments = Math.max(3, Math.min(maxSegments, Math.floor(3 + (areaFactor - 2) * 0.7)));
    }
    
    const points = [];
    const cornerNudgeAmount = areaFactor < 1.4
      ? 0
      : Math.min(3, 0.9 + (areaFactor - 1.4) * 0.9) * jitterMultiplier;
    const cornerOffsets = cornerNudgeAmount > 0
      ? {
          tl: {
            x: (rand('corner:tl:x') - 0.5) * cornerNudgeAmount,
            y: (rand('corner:tl:y') - 0.5) * cornerNudgeAmount
          },
          tr: {
            x: (rand('corner:tr:x') - 0.5) * cornerNudgeAmount,
            y: (rand('corner:tr:y') - 0.5) * cornerNudgeAmount
          },
          br: {
            x: (rand('corner:br:x') - 0.5) * cornerNudgeAmount,
            y: (rand('corner:br:y') - 0.5) * cornerNudgeAmount
          },
          bl: {
            x: (rand('corner:bl:x') - 0.5) * cornerNudgeAmount,
            y: (rand('corner:bl:y') - 0.5) * cornerNudgeAmount
          }
        }
      : {
          tl: { x: 0, y: 0 },
          tr: { x: 0, y: 0 },
          br: { x: 0, y: 0 },
          bl: { x: 0, y: 0 }
        };
    const cornerOffsetForPoint = (baseX, baseY) => {
      if (baseX === 0 && baseY === 0) return cornerOffsets.tl;
      if (baseX === width && baseY === 0) return cornerOffsets.tr;
      if (baseX === width && baseY === height) return cornerOffsets.br;
      if (baseX === 0 && baseY === height) return cornerOffsets.bl;
      return { x: 0, y: 0 };
    };
    
    // Top edge (left to right)
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const baseX = t * width;
      const baseY = 0;
      const cornerOffset = cornerOffsetForPoint(baseX, baseY);
      const variationX = (rand(`top:${i}:x`) - 0.5) * handCutVariation;
      const variationY = (rand(`top:${i}:y`) - 0.5) * handCutVariation;
      points.push(`${baseX + cornerOffset.x + variationX + x},${baseY + cornerOffset.y + variationY + y}`);
    }
    
    // Right edge (top to bottom)
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const baseX = width;
      const baseY = t * height;
      const cornerOffset = cornerOffsetForPoint(baseX, baseY);
      const variationX = (rand(`right:${i}:x`) - 0.5) * handCutVariation;
      const variationY = (rand(`right:${i}:y`) - 0.5) * handCutVariation;
      points.push(`${baseX + cornerOffset.x + variationX + x},${baseY + cornerOffset.y + variationY + y}`);
    }
    
    // Bottom edge (right to left)
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const baseX = width - (t * width);
      const baseY = height;
      const cornerOffset = cornerOffsetForPoint(baseX, baseY);
      const variationX = (rand(`bottom:${i}:x`) - 0.5) * handCutVariation;
      const variationY = (rand(`bottom:${i}:y`) - 0.5) * handCutVariation;
      points.push(`${baseX + cornerOffset.x + variationX + x},${baseY + cornerOffset.y + variationY + y}`);
    }
    
    // Left edge (bottom to top)
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const baseX = 0;
      const baseY = height - (t * height);
      const cornerOffset = cornerOffsetForPoint(baseX, baseY);
      const variationX = (rand(`left:${i}:x`) - 0.5) * handCutVariation;
      const variationY = (rand(`left:${i}:y`) - 0.5) * handCutVariation;
      points.push(`${baseX + cornerOffset.x + variationX + x},${baseY + cornerOffset.y + variationY + y}`);
    }
    
    polygon.setAttribute('points', points.join(' '));
    return polygon;
  }
  
  createPatternElements(patternGroup, variation, blockWidth, blockHeight) {
    // Create individual pattern elements based on the variation type
    const patternData = this.getPatternData(variation);
    
    // Scale pattern to fit block size
    const scaleX = blockWidth / patternData.width;
    const scaleY = blockHeight / patternData.height;
    const scale = Math.min(scaleX, scaleY) * 0.8; // 80% to ensure it fits within block
    
    // Create pattern elements
    patternData.elements.forEach(element => {
      const elementNode = document.createElementNS('http://www.w3.org/2000/svg', element.type);
      
      // Set attributes based on element type
      if (element.type === 'circle') {
        elementNode.setAttribute('cx', element.cx * scale);
        elementNode.setAttribute('cy', element.cy * scale);
        elementNode.setAttribute('r', Math.max(0.1, element.r * scale));
      } else if (element.type === 'ellipse') {
        elementNode.setAttribute('cx', element.cx * scale);
        elementNode.setAttribute('cy', element.cy * scale);
        elementNode.setAttribute('rx', Math.max(0.1, element.rx * scale));
        elementNode.setAttribute('ry', Math.max(0.1, element.ry * scale));
      } else if (element.type === 'line') {
        elementNode.setAttribute('x1', element.x1 * scale);
        elementNode.setAttribute('y1', element.y1 * scale);
        elementNode.setAttribute('x2', element.x2 * scale);
        elementNode.setAttribute('y2', element.y2 * scale);
      } else if (element.type === 'path') {
        // Scale path coordinates
        const scaledPath = element.d.replace(/(\d+(?:\.\d+)?)/g, (match) => {
          return parseFloat(match) * scale;
        });
        elementNode.setAttribute('d', scaledPath);
      } else if (element.type === 'polygon') {
        const scaledPoints = element.points.split(' ').map(point => {
          const [x, y] = point.split(',').map(Number);
          return `${x * scale},${y * scale}`;
        }).join(' ');
        elementNode.setAttribute('points', scaledPoints);
      }
      
      // Set common attributes
      if (element.fill) elementNode.setAttribute('fill', element.fill);
      if (element.stroke) elementNode.setAttribute('stroke', element.stroke);
      if (element.strokeWidth) elementNode.setAttribute('stroke-width', element.strokeWidth * scale);
      
      patternGroup.appendChild(elementNode);
    });
  }
  
  getPatternData(variation) {
    // Define pattern data for each variation
    const patterns = {
      dots1: {
        width: 12, height: 12,
        elements: [
          { type: 'circle', cx: 6, cy: 6, r: 1.5, fill: 'rgba(255,255,255,0.25)' },
          { type: 'circle', cx: 2, cy: 2, r: 1, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 10, cy: 10, r: 1, fill: 'rgba(255,255,255,0.15)' }
        ]
      },
      dots2: {
        width: 14, height: 14,
        elements: [
          { type: 'circle', cx: 7, cy: 7, r: 1.8, fill: 'rgba(255,255,255,0.2)' },
          { type: 'circle', cx: 3, cy: 3, r: 0.8, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 11, cy: 11, r: 0.8, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 7, cy: 3, r: 0.6, fill: 'rgba(255,255,255,0.1)' }
        ]
      },
      dots3: {
        width: 10, height: 10,
        elements: [
          { type: 'circle', cx: 5, cy: 5, r: 1.2, fill: 'rgba(255,255,255,0.18)' },
          { type: 'circle', cx: 2, cy: 2, r: 0.7, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 8, cy: 8, r: 0.7, fill: 'rgba(255,255,255,0.12)' }
        ]
      },
      dots4: {
        width: 12, height: 24,
        elements: [
          // Row 1
          { type: 'circle', cx: 6, cy: 6, r: 1.5, fill: 'rgba(255,255,255,0.25)' },
          { type: 'circle', cx: 2, cy: 2, r: 1, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 10, cy: 10, r: 1, fill: 'rgba(255,255,255,0.15)' },
          // Row 2 (offset)
          { type: 'circle', cx: 0, cy: 18, r: 1.5, fill: 'rgba(255,255,255,0.25)' },
          { type: 'circle', cx: 8, cy: 14, r: 1, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 4, cy: 22, r: 1, fill: 'rgba(255,255,255,0.15)' }
        ]
      },
      dots5: {
        width: 14, height: 28,
        elements: [
          // Row 1
          { type: 'circle', cx: 7, cy: 7, r: 1.8, fill: 'rgba(255,255,255,0.2)' },
          { type: 'circle', cx: 3, cy: 3, r: 0.8, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 11, cy: 11, r: 0.8, fill: 'rgba(255,255,255,0.12)' },
          // Row 2 (offset)
          { type: 'circle', cx: 0, cy: 21, r: 1.8, fill: 'rgba(255,255,255,0.2)' },
          { type: 'circle', cx: 10, cy: 17, r: 0.8, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 4, cy: 25, r: 0.8, fill: 'rgba(255,255,255,0.12)' }
        ]
      },
      dots6: {
        width: 16, height: 16,
        elements: [
          { type: 'ellipse', cx: 4, cy: 4, rx: 1.8, ry: 1.2, fill: 'rgba(255,255,255,0.25)' },
          { type: 'ellipse', cx: 12, cy: 6, rx: 1.2, ry: 1.6, fill: 'rgba(255,255,255,0.18)' },
          { type: 'ellipse', cx: 8, cy: 12, rx: 1.5, ry: 1.1, fill: 'rgba(255,255,255,0.22)' },
          { type: 'ellipse', cx: 2, cy: 10, rx: 0.9, ry: 1.3, fill: 'rgba(255,255,255,0.15)' },
          { type: 'ellipse', cx: 14, cy: 14, rx: 1.1, ry: 0.8, fill: 'rgba(255,255,255,0.12)' }
        ]
      },
      dots7: {
        width: 18, height: 18,
        elements: [
          { type: 'circle', cx: 3, cy: 3, r: 1.1, fill: 'rgba(255,255,255,0.2)' },
          { type: 'circle', cx: 15, cy: 5, r: 0.8, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 9, cy: 9, r: 1.4, fill: 'rgba(255,255,255,0.25)' },
          { type: 'circle', cx: 5, cy: 15, r: 0.6, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 12, cy: 12, r: 1.0, fill: 'rgba(255,255,255,0.18)' },
          { type: 'circle', cx: 7, cy: 7, r: 0.7, fill: 'rgba(255,255,255,0.1)' }
        ]
      },
      stripes1: {
        width: 8, height: 8,
        elements: [
          { type: 'line', x1: 0, y1: 4, x2: 8, y2: 4, stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 },
          { type: 'line', x1: 4, y1: 0, x2: 4, y2: 8, stroke: 'rgba(255,255,255,0.15)', strokeWidth: 0.5 }
        ]
      },
      stripes2: {
        width: 12, height: 12,
        elements: [
          { type: 'line', x1: 0, y1: 6, x2: 12, y2: 6, stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1.2 },
          { type: 'line', x1: 6, y1: 0, x2: 6, y2: 12, stroke: 'rgba(255,255,255,0.12)', strokeWidth: 0.8 },
          { type: 'line', x1: 0, y1: 3, x2: 12, y2: 3, stroke: 'rgba(255,255,255,0.1)', strokeWidth: 0.4 }
        ]
      },
      stripes3: {
        width: 10, height: 10,
        elements: [
          { type: 'line', x1: 0, y1: 5, x2: 10, y2: 5, stroke: 'rgba(255,255,255,0.15)', strokeWidth: 0.8 },
          { type: 'line', x1: 5, y1: 0, x2: 5, y2: 10, stroke: 'rgba(255,255,255,0.12)', strokeWidth: 0.6 }
        ]
      },
      stripes4: {
        width: 8, height: 16,
        elements: [
          // Row 1
          { type: 'line', x1: 0, y1: 4, x2: 8, y2: 4, stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 },
          { type: 'line', x1: 4, y1: 0, x2: 4, y2: 8, stroke: 'rgba(255,255,255,0.15)', strokeWidth: 0.5 },
          // Row 2 (offset)
          { type: 'line', x1: 4, y1: 12, x2: 12, y2: 12, stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 },
          { type: 'line', x1: 8, y1: 8, x2: 8, y2: 16, stroke: 'rgba(255,255,255,0.15)', strokeWidth: 0.5 }
        ]
      },
      stripes5: {
        width: 12, height: 24,
        elements: [
          // Row 1
          { type: 'line', x1: 0, y1: 6, x2: 12, y2: 6, stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1.2 },
          { type: 'line', x1: 6, y1: 0, x2: 6, y2: 12, stroke: 'rgba(255,255,255,0.12)', strokeWidth: 0.8 },
          { type: 'line', x1: 0, y1: 3, x2: 12, y2: 3, stroke: 'rgba(255,255,255,0.1)', strokeWidth: 0.4 },
          // Row 2 (offset)
          { type: 'line', x1: 6, y1: 18, x2: 18, y2: 18, stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1.2 },
          { type: 'line', x1: 12, y1: 12, x2: 12, y2: 24, stroke: 'rgba(255,255,255,0.12)', strokeWidth: 0.8 },
          { type: 'line', x1: 6, y1: 15, x2: 18, y2: 15, stroke: 'rgba(255,255,255,0.1)', strokeWidth: 0.4 }
        ]
      },
      stripes6: {
        width: 16, height: 16,
        elements: [
          { type: 'path', d: 'M0,4 Q4,2 8,4 T16,4', stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 },
          { type: 'path', d: 'M0,12 Q4,10 8,12 T16,12', stroke: 'rgba(255,255,255,0.15)', strokeWidth: 0.8 },
          { type: 'path', d: 'M4,0 Q6,4 4,8 T4,16', stroke: 'rgba(255,255,255,0.12)', strokeWidth: 0.6 }
        ]
      },
      stripes7: {
        width: 20, height: 20,
        elements: [
          { type: 'path', d: 'M0,5 L20,6', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1.2 },
          { type: 'path', d: 'M0,15 L20,14', stroke: 'rgba(255,255,255,0.15)', strokeWidth: 0.9 },
          { type: 'path', d: 'M5,0 L6,20', stroke: 'rgba(255,255,255,0.12)', strokeWidth: 0.7 },
          { type: 'path', d: 'M15,0 L14,20', stroke: 'rgba(255,255,255,0.1)', strokeWidth: 0.5 }
        ]
      },
      floral1: {
        width: 24, height: 24,
        elements: [
          { type: 'circle', cx: 12, cy: 12, r: 3, fill: 'rgba(255,255,255,0.2)' },
          { type: 'circle', cx: 9, cy: 9, r: 1.5, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 15, cy: 9, r: 1.5, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 12, cy: 6, r: 1.5, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 12, cy: 18, r: 1.5, fill: 'rgba(255,255,255,0.15)' }
        ]
      },
      floral2: {
        width: 28, height: 28,
        elements: [
          { type: 'circle', cx: 14, cy: 14, r: 3.5, fill: 'rgba(255,255,255,0.18)' },
          { type: 'circle', cx: 11, cy: 11, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 17, cy: 11, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 14, cy: 8, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 14, cy: 20, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 11, cy: 17, r: 1.2, fill: 'rgba(255,255,255,0.08)' }
        ]
      },
      floral3: {
        width: 24, height: 48,
        elements: [
          // Row 1
          { type: 'circle', cx: 12, cy: 12, r: 3, fill: 'rgba(255,255,255,0.2)' },
          { type: 'circle', cx: 9, cy: 9, r: 1.5, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 15, cy: 9, r: 1.5, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 12, cy: 6, r: 1.5, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 12, cy: 18, r: 1.5, fill: 'rgba(255,255,255,0.15)' },
          // Row 2 (offset)
          { type: 'circle', cx: 0, cy: 36, r: 3, fill: 'rgba(255,255,255,0.2)' },
          { type: 'circle', cx: 21, cy: 33, r: 1.5, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 3, cy: 33, r: 1.5, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 0, cy: 30, r: 1.5, fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 0, cy: 42, r: 1.5, fill: 'rgba(255,255,255,0.15)' }
        ]
      },
      floral4: {
        width: 28, height: 56,
        elements: [
          // Row 1
          { type: 'circle', cx: 14, cy: 14, r: 3.5, fill: 'rgba(255,255,255,0.18)' },
          { type: 'circle', cx: 11, cy: 11, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 17, cy: 11, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 14, cy: 8, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 14, cy: 20, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 11, cy: 17, r: 1.2, fill: 'rgba(255,255,255,0.08)' },
          // Row 2 (offset)
          { type: 'circle', cx: 0, cy: 42, r: 3.5, fill: 'rgba(255,255,255,0.18)' },
          { type: 'circle', cx: 25, cy: 39, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 3, cy: 39, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 0, cy: 36, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 0, cy: 48, r: 2, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 25, cy: 45, r: 1.2, fill: 'rgba(255,255,255,0.08)' }
        ]
      },
      floral5: {
        width: 32, height: 32,
        elements: [
          { type: 'ellipse', cx: 16, cy: 16, rx: 4, ry: 3, fill: 'rgba(255,255,255,0.2)' },
          { type: 'ellipse', cx: 12, cy: 12, rx: 2.5, ry: 1.8, fill: 'rgba(255,255,255,0.15)' },
          { type: 'ellipse', cx: 20, cy: 14, rx: 1.8, ry: 2.2, fill: 'rgba(255,255,255,0.15)' },
          { type: 'ellipse', cx: 16, cy: 8, rx: 1.5, ry: 2.5, fill: 'rgba(255,255,255,0.12)' },
          { type: 'ellipse', cx: 14, cy: 22, rx: 2.2, ry: 1.5, fill: 'rgba(255,255,255,0.12)' },
          { type: 'circle', cx: 16, cy: 16, r: 1.2, fill: 'rgba(255,255,255,0.08)' }
        ]
      },
      floral6: {
        width: 36, height: 36,
        elements: [
          { type: 'ellipse', cx: 8, cy: 8, rx: 2.5, ry: 1.8, fill: 'rgba(255,255,255,0.18)' },
          { type: 'ellipse', cx: 28, cy: 12, rx: 1.8, ry: 2.2, fill: 'rgba(255,255,255,0.15)' },
          { type: 'ellipse', cx: 18, cy: 24, rx: 2.2, ry: 1.5, fill: 'rgba(255,255,255,0.16)' },
          { type: 'ellipse', cx: 12, cy: 30, rx: 1.5, ry: 2.0, fill: 'rgba(255,255,255,0.12)' },
          { type: 'ellipse', cx: 24, cy: 6, rx: 1.8, ry: 1.6, fill: 'rgba(255,255,255,0.14)' },
          { type: 'circle', cx: 18, cy: 18, r: 0.8, fill: 'rgba(255,255,255,0.08)' }
        ]
      },
      geometric1: {
        width: 10, height: 10,
        elements: [
          { type: 'polygon', points: '5,2 7,5 5,8 3,5', fill: 'rgba(255,255,255,0.2)' },
          { type: 'circle', cx: 5, cy: 5, r: 1, fill: 'rgba(255,255,255,0.1)' }
        ]
      },
      geometric2: {
        width: 12, height: 12,
        elements: [
          { type: 'polygon', points: '6,3 8,6 6,9 4,6', fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 6, cy: 6, r: 1.2, fill: 'rgba(255,255,255,0.08)' },
          { type: 'polygon', points: '3,3 5,6 3,9 1,6', fill: 'rgba(255,255,255,0.1)' }
        ]
      },
      geometric3: {
        width: 10, height: 20,
        elements: [
          // Row 1
          { type: 'polygon', points: '5,2 7,5 5,8 3,5', fill: 'rgba(255,255,255,0.2)' },
          { type: 'circle', cx: 5, cy: 5, r: 1, fill: 'rgba(255,255,255,0.1)' },
          // Row 2 (offset)
          { type: 'polygon', points: '0,12 2,15 0,18 -2,15', fill: 'rgba(255,255,255,0.2)' },
          { type: 'circle', cx: 0, cy: 15, r: 1, fill: 'rgba(255,255,255,0.1)' }
        ]
      },
      geometric4: {
        width: 12, height: 24,
        elements: [
          // Row 1
          { type: 'polygon', points: '6,3 8,6 6,9 4,6', fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 6, cy: 6, r: 1.2, fill: 'rgba(255,255,255,0.08)' },
          { type: 'polygon', points: '3,3 5,6 3,9 1,6', fill: 'rgba(255,255,255,0.1)' },
          // Row 2 (offset)
          { type: 'polygon', points: '0,15 2,18 0,21 -2,18', fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 0, cy: 18, r: 1.2, fill: 'rgba(255,255,255,0.08)' },
          { type: 'polygon', points: '9,15 11,18 9,21 7,18', fill: 'rgba(255,255,255,0.1)' }
        ]
      },
      geometric5: {
        width: 20, height: 20,
        elements: [
          { type: 'path', d: 'M5,2 Q8,1 11,2 T17,2 L15,8 Q12,9 9,8 T3,8 Z', fill: 'rgba(255,255,255,0.18)' },
          { type: 'path', d: 'M2,12 Q5,11 8,12 T14,12 L12,18 Q9,19 6,18 T0,18 Z', fill: 'rgba(255,255,255,0.15)' },
          { type: 'circle', cx: 10, cy: 10, r: 1.5, fill: 'rgba(255,255,255,0.08)' }
        ]
      },
      geometric6: {
        width: 24, height: 24,
        elements: [
          { type: 'ellipse', cx: 6, cy: 6, rx: 3, ry: 2, fill: 'rgba(255,255,255,0.16)' },
          { type: 'polygon', points: '18,8 20,12 18,16 16,12', fill: 'rgba(255,255,255,0.14)' },
          { type: 'path', d: 'M4,18 Q8,16 12,18 T20,18', stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 },
          { type: 'circle', cx: 12, cy: 12, r: 1.8, fill: 'rgba(255,255,255,0.08)' }
        ]
      }
    };
    
    return patterns[variation] || patterns.dots1;
  }
  

}

  root.QuiltRendererV2 = QuiltRendererV2;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
