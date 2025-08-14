// ===== QUILT ENGINE - Core Data Models and Logic =====

// ===== CONFIGURATION =====
const QUILT_CONFIG = {
  FREEZE_THRESHOLD: 20, // Submission count that triggers phase change
  MIN_SHAPE_SIZE: 40, // Minimum dimension in pixels
  COLOR_SIMILARITY_THRESHOLD: 35, // Maximum color difference for similarity
  DEFAULT_COLOR: '#f7b733',
  QUILT_SIZE: 1000 // Base size for calculations
};

// ===== CORE DATA MODELS =====

/**
 * Main application state
 */
class QuiltAppState {
  constructor() {
    this.submissionCount = 0;
    this.phase = 'PRE_FREEZE'; // 'PRE_FREEZE' | 'POST_FREEZE'
    this.keyShapesColorArray = []; // Set at freeze, used for similarity matching
    this.shapes = []; // Array of shape objects
    this.colorFamilies = new Map(); // Maps color family names to arrays of shape IDs
  }

  /**
   * Add a new submission and handle phase transitions
   */
  addSubmission() {
    this.submissionCount++;
    
    // Check for phase transition
    if (this.submissionCount === QUILT_CONFIG.FREEZE_THRESHOLD) {
      this.freezePhase();
    }
    
    return this.submissionCount;
  }

  /**
   * Transition from PRE_FREEZE to POST_FREEZE phase
   */
  freezePhase() {
    this.phase = 'POST_FREEZE';
    
    // Label all current shapes as KEY_SHAPES
    this.shapes.forEach(shape => {
      shape.type = 'KEY_SHAPE';
    });
    
    // Extract colors from KEY_SHAPES for similarity matching
    this.keyShapesColorArray = this.shapes.map(shape => shape.color);
    
    // Assign color family labels
    this.assignColorFamilies();
    
    console.log('🧵 Phase frozen! Key shapes:', this.shapes.length);
  }

  /**
   * Assign color family names to KEY_SHAPES
   */
  assignColorFamilies() {
    const colorGroups = this.groupSimilarColors(this.keyShapesColorArray);
    
    colorGroups.forEach((group, familyName) => {
      // Find shapes with colors in this group
      const familyShapes = this.shapes.filter(shape => 
        group.some(color => ColorUtils.isColorSimilar(shape.color, color))
      );
      
      // Store family mapping
      this.colorFamilies.set(familyName, familyShapes.map(s => s.id));
      
      // Label shapes with family name
      familyShapes.forEach(shape => {
        shape.colorFamily = familyName;
      });
    });
    
    console.log('🎨 Color families assigned:', Array.from(this.colorFamilies.keys()));
  }

  /**
   * Group similar colors into families
   */
  groupSimilarColors(colors) {
    const groups = new Map();
    const processed = new Set();
    
    colors.forEach(color => {
      if (processed.has(color)) return;
      
      const familyName = ColorUtils.getColorFamilyName(color);
      const similarColors = [color];
      
      colors.forEach(otherColor => {
        if (otherColor !== color && !processed.has(otherColor)) {
          if (ColorUtils.isColorSimilar(color, otherColor)) {
            similarColors.push(otherColor);
            processed.add(otherColor);
          }
        }
      });
      
      groups.set(familyName, similarColors);
      processed.add(color);
    });
    
    return groups;
  }
}

/**
 * Shape object structure
 */
class QuiltShape {
  constructor(options = {}) {
    this.id = options.id || QuiltEngine.generateId();
    this.type = options.type || 'KEY_SHAPE'; // 'KEY_SHAPE' | 'BORDER_SHAPE'
    this.color = options.color || QUILT_CONFIG.DEFAULT_COLOR;
    this.position = options.position || { x: 0, y: 0, width: QUILT_CONFIG.QUILT_SIZE, height: QUILT_CONFIG.QUILT_SIZE };
    this.parentId = options.parentId || null; // For tracking split lineage
    this.contributorId = options.contributorId || null; // Device fingerprint ID
    this.submissionIndex = options.submissionIndex || 0; // Which submission created this
    this.colorFamily = options.colorFamily || null; // Color family label
  }

  /**
   * Check if this shape can be split in the given direction
   */
  canSplit(direction) {
    if (direction === 'horizontal') {
      return this.position.height >= QUILT_CONFIG.MIN_SHAPE_SIZE * 2;
    } else {
      return this.position.width >= QUILT_CONFIG.MIN_SHAPE_SIZE * 2;
    }
  }

  /**
   * Get valid split directions for this shape
   */
  getValidSplitDirections() {
    const directions = [];
    if (this.canSplit('horizontal')) directions.push('horizontal');
    if (this.canSplit('vertical')) directions.push('vertical');
    return directions;
  }

  /**
   * Split this shape and return the two resulting shapes
   */
  split(newColor, direction, contributorId, submissionIndex) {
    if (!this.canSplit(direction)) {
      throw new Error(`Cannot split shape ${this.id} in ${direction} direction`);
    }

    const splitRatio = 0.3 + Math.random() * 0.4; // 30-70% split
    let shape1, shape2;

    if (direction === 'horizontal') {
      const splitHeight = this.position.height * splitRatio;
      
      shape1 = new QuiltShape({
        id: QuiltEngine.generateId(),
        type: this.type,
        color: this.color,
        position: {
          x: this.position.x,
          y: this.position.y,
          width: this.position.width,
          height: splitHeight
        },
        parentId: this.id,
        contributorId: this.contributorId,
        submissionIndex: this.submissionIndex,
        colorFamily: this.colorFamily
      });

      shape2 = new QuiltShape({
        id: QuiltEngine.generateId(),
        type: this.type,
        color: newColor,
        position: {
          x: this.position.x,
          y: this.position.y + splitHeight,
          width: this.position.width,
          height: this.position.height - splitHeight
        },
        parentId: this.id,
        contributorId: contributorId,
        submissionIndex: submissionIndex,
        colorFamily: this.colorFamily
      });
    } else {
      const splitWidth = this.position.width * splitRatio;
      
      shape1 = new QuiltShape({
        id: QuiltEngine.generateId(),
        type: this.type,
        color: this.color,
        position: {
          x: this.position.x,
          y: this.position.y,
          width: splitWidth,
          height: this.position.height
        },
        parentId: this.id,
        contributorId: this.contributorId,
        submissionIndex: this.submissionIndex,
        colorFamily: this.colorFamily
      });

      shape2 = new QuiltShape({
        id: QuiltEngine.generateId(),
        type: this.type,
        color: newColor,
        position: {
          x: this.position.x + splitWidth,
          y: this.position.y,
          width: this.position.width - splitWidth,
          height: this.position.height
        },
        parentId: this.id,
        contributorId: contributorId,
        submissionIndex: submissionIndex,
        colorFamily: this.colorFamily
      });
    }

    return [shape1, shape2];
  }
}

// ===== UTILITY CLASSES =====

/**
 * Color utility functions
 */
class ColorUtils {
  /**
   * Convert hex color to RGB
   */
  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  /**
   * Convert RGB to hex
   */
  static rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * Calculate color difference using RGB distance
   */
  static getColorDifference(color1, color2) {
    const rgb1 = this.hexToRgb(color1);
    const rgb2 = this.hexToRgb(color2);
    
    if (!rgb1 || !rgb2) return Infinity;
    
    const dr = rgb1.r - rgb2.r;
    const dg = rgb1.g - rgb2.g;
    const db = rgb1.b - rgb2.b;
    
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /**
   * Check if two colors are similar
   */
  static isColorSimilar(color1, color2) {
    const difference = this.getColorDifference(color1, color2);
    return difference <= QUILT_CONFIG.COLOR_SIMILARITY_THRESHOLD;
  }

  /**
   * Get color family name based on dominant hue
   */
  static getColorFamilyName(hexColor) {
    const rgb = this.hexToRgb(hexColor);
    if (!rgb) return 'unknown';
    
    const { r, g, b } = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    if (delta === 0) return 'gray';
    
    let hue;
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
    
    // Map hue to color family names
    if (hue >= 0 && hue < 30) return 'red';
    if (hue >= 30 && hue < 60) return 'orange';
    if (hue >= 60 && hue < 90) return 'yellow';
    if (hue >= 90 && hue < 150) return 'green';
    if (hue >= 150 && hue < 210) return 'cyan';
    if (hue >= 210 && hue < 270) return 'blue';
    if (hue >= 270 && hue < 330) return 'purple';
    return 'pink';
  }
}

/**
 * User tracking utilities
 */
class UserTracker {
  /**
   * Generate device fingerprint for anonymous tracking
   */
  static generateDeviceId() {
    const fingerprint = btoa(
      screen.width + screen.height + 
      navigator.userAgent.slice(0, 20) + 
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    return fingerprint.slice(0, 16);
  }

  /**
   * Get or create device ID from localStorage
   */
  static getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('quiltDeviceId');
    if (!deviceId) {
      deviceId = this.generateDeviceId();
      localStorage.setItem('quiltDeviceId', deviceId);
    }
    return deviceId;
  }

  /**
   * Record user contribution
   */
  static recordContribution(shapeId, color, submissionIndex) {
    const deviceId = this.getOrCreateDeviceId();
    const contribution = {
      submissionIndex,
      shapeId,
      color,
      timestamp: new Date().toISOString()
    };
    
    const stored = JSON.parse(localStorage.getItem('quiltContributions') || '{"submissions": []}');
    stored.submissions.push(contribution);
    localStorage.setItem('quiltContributions', JSON.stringify(stored));
  }

  /**
   * Get all user contributions
   */
  static getUserContributions() {
    const stored = localStorage.getItem('quiltContributions');
    return stored ? JSON.parse(stored) : { submissions: [] };
  }

  /**
   * Find all shapes descended from user's contributions
   */
  static findUserPieces(shapes) {
    const contributions = this.getUserContributions();
    const userShapeIds = new Set();
    
    // Get all original shape IDs from user contributions
    contributions.submissions.forEach(contrib => {
      userShapeIds.add(contrib.shapeId);
    });
    
    // Find all descendant shapes
    const descendantShapes = [];
    shapes.forEach(shape => {
      if (this.isDescendantOf(shape, userShapeIds, shapes)) {
        descendantShapes.push(shape);
      }
    });
    
    return descendantShapes;
  }

  /**
   * Check if a shape is descended from any of the given shape IDs
   */
  static isDescendantOf(shape, ancestorIds, allShapes) {
    if (ancestorIds.has(shape.id)) {
      return true;
    }
    
    if (shape.parentId) {
      const parent = allShapes.find(s => s.id === shape.parentId);
      if (parent) {
        return this.isDescendantOf(parent, ancestorIds, allShapes);
      }
    }
    
    return false;
  }
}

// ===== MAIN QUILT ENGINE =====

/**
 * Main quilt engine class
 */
class QuiltEngine {
  constructor() {
    this.appState = new QuiltAppState();
    this.deviceId = UserTracker.getOrCreateDeviceId();
  }

  /**
   * Initialize the quilt with a default shape
   */
  initialize() {
    const initialShape = new QuiltShape({
      color: QUILT_CONFIG.DEFAULT_COLOR,
      contributorId: this.deviceId,
      submissionIndex: 0
    });
    
    this.appState.shapes = [initialShape];
    this.appState.submissionCount = 0;
    this.appState.phase = 'PRE_FREEZE';
    
    console.log('🧵 Quilt engine initialized');
    return this.appState;
  }

  /**
   * Add a new color to the quilt
   */
  addColor(newColor) {
    try {
      // Validate color
      if (!ColorUtils.hexToRgb(newColor)) {
        throw new Error(`Invalid color: ${newColor}`);
      }

      // Add submission
      const submissionIndex = this.appState.addSubmission();
      
      // Select block to split based on phase
      const selectedShape = this.selectShapeToSplit(newColor);
      
      if (!selectedShape) {
        throw new Error('No suitable shape found for splitting');
      }

      // Determine split direction
      const splitDirection = this.getSplitDirection(selectedShape);
      
      // Split the shape
      const [shape1, shape2] = selectedShape.split(newColor, splitDirection, this.deviceId, submissionIndex);
      
      // Remove original shape and add new shapes
      const shapeIndex = this.appState.shapes.findIndex(s => s.id === selectedShape.id);
      this.appState.shapes.splice(shapeIndex, 1, shape1, shape2);
      
      // Record user contribution
      UserTracker.recordContribution(shape2.id, newColor, submissionIndex);
      
      // Handle phase-specific logic
      if (this.appState.phase === 'POST_FREEZE') {
        this.handlePostFreezeLogic(shape2, newColor);
      }
      
      // Ensure no gaps exist after adding new shape
      this.ensureNoGaps();
      
      console.log(`🧵 Added color ${newColor} (submission ${submissionIndex})`);
      return { shape1, shape2, submissionIndex };
      
    } catch (error) {
      console.error('❌ Error adding color:', error);
      throw error;
    }
  }

  /**
   * Select which shape to split based on current phase
   */
  selectShapeToSplit(newColor) {
    if (this.appState.phase === 'PRE_FREEZE') {
      // Random selection from all shapes
      return this.getRandomSplittableShape(this.appState.shapes);
    } else {
      // POST_FREEZE: Check similarity and select accordingly
      const isSimilar = this.appState.keyShapesColorArray.some(keyColor => 
        ColorUtils.isColorSimilar(newColor, keyColor)
      );
      
      if (isSimilar) {
        // Find most similar KEY_SHAPE from same color family
        const keyShape = this.findMostSimilarKeyShape(newColor);
        if (keyShape) {
          return keyShape;
        }
        // If no splittable key shapes found, create border
        return this.selectBorderShape(newColor);
      } else {
        // Dissimilar color - always create or split border
        return this.selectBorderShape(newColor);
      }
    }
  }

  /**
   * Get a random shape that can be split
   */
  getRandomSplittableShape(shapes) {
    const splittableShapes = shapes.filter(shape => 
      shape.getValidSplitDirections().length > 0
    );
    
    if (splittableShapes.length === 0) {
      return null;
    }
    
    return splittableShapes[Math.floor(Math.random() * splittableShapes.length)];
  }

  /**
   * Find the most similar KEY_SHAPE from the same color family
   */
  findMostSimilarKeyShape(newColor) {
    const newColorFamily = ColorUtils.getColorFamilyName(newColor);
    const keyShapes = this.appState.shapes.filter(shape => 
      shape.type === 'KEY_SHAPE' && 
      shape.colorFamily === newColorFamily &&
      shape.getValidSplitDirections().length > 0
    );
    
    if (keyShapes.length === 0) {
      // No splittable key shapes found - return null to trigger border creation
      return null;
    }
    
    // Find most similar color
    let mostSimilar = keyShapes[0];
    let smallestDifference = ColorUtils.getColorDifference(newColor, mostSimilar.color);
    
    keyShapes.forEach(shape => {
      const difference = ColorUtils.getColorDifference(newColor, shape.color);
      if (difference < smallestDifference) {
        smallestDifference = difference;
        mostSimilar = shape;
      }
    });
    
    return mostSimilar;
  }

  /**
   * Select a border shape or create new border
   */
  selectBorderShape(newColor) {
    const borderShapes = this.appState.shapes.filter(shape => 
      shape.type === 'BORDER_SHAPE' &&
      shape.getValidSplitDirections().length > 0
    );
    
    if (borderShapes.length === 0) {
      // Create new border shape inside current quilt
      return this.createNewBorderShape(newColor);
    }
    
    // Find most similar border shape (within 35 LAB diff)
    const similarBorderShapes = borderShapes.filter(shape => 
      ColorUtils.isColorSimilar(newColor, shape.color)
    );
    
    if (similarBorderShapes.length > 0) {
      // Split with most similar border shape
      return this.findMostSimilarBorderShape(similarBorderShapes, newColor);
    } else {
      // Split with largest border shape available
      return this.findLargestBorderShape(borderShapes);
    }
  }

  /**
   * Create a new border shape that compresses existing shapes inward
   */
  createNewBorderShape(newColor) {
    // Calculate current quilt bounds
    const bounds = this.getQuiltBounds();
    
    // Randomly select a side (top, right, bottom, left)
    const sides = ['top', 'right', 'bottom', 'left'];
    const selectedSide = sides[Math.floor(Math.random() * sides.length)];
    
    // Calculate border thickness
    const borderThickness = Math.min(40, Math.min(bounds.width, bounds.height) * 0.1);
    
    // Create border shape
    const borderShape = this.createBorderShapeForSide(selectedSide, bounds, newColor, borderThickness);
    
    // Add border shape to the quilt
    this.appState.shapes.push(borderShape);
    
    // Let the gap detection system handle any issues
    // The ensureNoGaps() function will be called after this
    
    return borderShape;
  }

  /**
   * Get current quilt bounds
   */
  getQuiltBounds() {
    const shapes = this.appState.shapes;
    const minX = Math.min(...shapes.map(s => s.position.x));
    const minY = Math.min(...shapes.map(s => s.position.y));
    const maxX = Math.max(...shapes.map(s => s.position.x + s.position.width));
    const maxY = Math.max(...shapes.map(s => s.position.y + s.position.height));
    
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Create border shape for a specific side
   */
  createBorderShapeForSide(side, bounds, newColor, borderThickness) {
    let position;
    switch (side) {
      case 'top':
        position = {
          x: bounds.minX,
          y: bounds.minY - borderThickness, // Create above existing quilt
          width: bounds.width,
          height: borderThickness
        };
        break;
      case 'right':
        position = {
          x: bounds.maxX, // Create to the right of existing quilt
          y: bounds.minY,
          width: borderThickness,
          height: bounds.height
        };
        break;
      case 'bottom':
        position = {
          x: bounds.minX,
          y: bounds.maxY, // Create below existing quilt
          width: bounds.width,
          height: borderThickness
        };
        break;
      case 'left':
        position = {
          x: bounds.minX - borderThickness, // Create to the left of existing quilt
          y: bounds.minY,
          width: borderThickness,
          height: bounds.height
        };
        break;
    }
    
    return new QuiltShape(
      'BORDER_SHAPE',
      newColor,
      position,
      null,
      this.userTracker.getCurrentUserId(),
      this.appState.submissionCount
    );
  }



  /**
   * Find most similar border shape from a list
   */
  findMostSimilarBorderShape(borderShapes, newColor) {
    let mostSimilar = borderShapes[0];
    let smallestDifference = ColorUtils.getColorDifference(newColor, mostSimilar.color);
    
    borderShapes.forEach(shape => {
      const difference = ColorUtils.getColorDifference(newColor, shape.color);
      if (difference < smallestDifference) {
        smallestDifference = difference;
        mostSimilar = shape;
      }
    });
    
    return mostSimilar;
  }

  /**
   * Find largest border shape from a list
   */
  findLargestBorderShape(borderShapes) {
    let largest = borderShapes[0];
    let largestArea = largest.position.width * largest.position.height;
    
    borderShapes.forEach(shape => {
      const area = shape.position.width * shape.position.height;
      if (area > largestArea) {
        largestArea = area;
        largest = shape;
      }
    });
    
    return largest;
  }

  /**
   * Get split direction for a shape
   */
  getSplitDirection(shape) {
    const validDirections = shape.getValidSplitDirections();
    
    if (validDirections.length === 0) {
      throw new Error(`Shape ${shape.id} cannot be split in any direction`);
    }
    
    if (validDirections.length === 1) {
      return validDirections[0];
    }
    
    // Random direction with preference for longest edge
    const isWider = shape.position.width > shape.position.height;
    const preferredDirection = isWider ? 'vertical' : 'horizontal';
    
    // 80% chance to use preferred direction
    if (Math.random() < 0.8) {
      return preferredDirection;
    } else {
      return validDirections.find(d => d !== preferredDirection);
    }
  }

  /**
   * Handle POST_FREEZE specific logic
   */
  handlePostFreezeLogic(newShape, newColor) {
    const isSimilar = this.appState.keyShapesColorArray.some(keyColor => 
      ColorUtils.isColorSimilar(newColor, keyColor)
    );
    
    if (isSimilar) {
      // Keep as KEY_SHAPE, assign color family
      newShape.type = 'KEY_SHAPE';
      newShape.colorFamily = ColorUtils.getColorFamilyName(newColor);
    } else {
      // Mark as BORDER_SHAPE
      newShape.type = 'BORDER_SHAPE';
    }
  }

  /**
   * Find user's pieces
   */
  findUserPieces() {
    return UserTracker.findUserPieces(this.appState.shapes);
  }

  /**
   * Get current quilt state
   */
  getState() {
    return {
      submissionCount: this.appState.submissionCount,
      phase: this.appState.phase,
      shapes: this.appState.shapes,
      colorFamilies: Array.from(this.appState.colorFamilies.entries()),
      userPieces: this.findUserPieces()
    };
  }

  /**
   * Ensure no gaps exist in the quilt
   */
  ensureNoGaps() {
    const bounds = this.getQuiltBounds();
    const tolerance = 0.1; // Reduced tolerance for more precise gap detection
    
    console.log('🔍 Checking for gaps...');
    console.log('Quilt bounds:', bounds);
    
    // Check for gaps and fix them
    this.appState.shapes.forEach((shape, index) => {
      const originalX = shape.position.x;
      const originalY = shape.position.y;
      const originalWidth = shape.position.width;
      const originalHeight = shape.position.height;
      
      // Ensure shape doesn't extend beyond quilt bounds
      if (shape.position.x < bounds.minX) {
        console.log(`⚠️ Shape ${index} x too small: ${shape.position.x} < ${bounds.minX}`);
        shape.position.x = bounds.minX;
      }
      if (shape.position.y < bounds.minY) {
        console.log(`⚠️ Shape ${index} y too small: ${shape.position.y} < ${bounds.minY}`);
        shape.position.y = bounds.minY;
      }
      if (shape.position.x + shape.position.width > bounds.maxX + tolerance) {
        console.log(`⚠️ Shape ${index} extends beyond right edge: ${shape.position.x + shape.position.width} > ${bounds.maxX}`);
        shape.position.width = bounds.maxX - shape.position.x;
      }
      if (shape.position.y + shape.position.height > bounds.maxY + tolerance) {
        console.log(`⚠️ Shape ${index} extends beyond bottom edge: ${shape.position.y + shape.position.height} > ${bounds.maxY}`);
        shape.position.height = bounds.maxY - shape.position.y;
      }
      
      // Ensure minimum size
      if (shape.position.width < QUILT_CONFIG.MIN_SHAPE_SIZE) {
        console.log(`⚠️ Shape ${index} width too small: ${shape.position.width} < ${QUILT_CONFIG.MIN_SHAPE_SIZE}`);
        shape.position.width = QUILT_CONFIG.MIN_SHAPE_SIZE;
      }
      if (shape.position.height < QUILT_CONFIG.MIN_SHAPE_SIZE) {
        console.log(`⚠️ Shape ${index} height too small: ${shape.position.height} < ${QUILT_CONFIG.MIN_SHAPE_SIZE}`);
        shape.position.height = QUILT_CONFIG.MIN_SHAPE_SIZE;
      }
      
      // Log if any changes were made
      if (originalX !== shape.position.x || originalY !== shape.position.y || 
          originalWidth !== shape.position.width || originalHeight !== shape.position.height) {
        console.log(`🔧 Fixed shape ${index}:`, {
          before: { x: originalX, y: originalY, width: originalWidth, height: originalHeight },
          after: { x: shape.position.x, y: shape.position.y, width: shape.position.width, height: shape.position.height }
        });
      }
    });
    
    // Check for overlapping shapes
    this.checkForOverlaps();
    
    // Check for actual gaps between shapes
    this.checkForGaps();
    
    console.log('✅ Gap check complete');
  }

  /**
   * Check for actual gaps between shapes
   */
  checkForGaps() {
    const bounds = this.getQuiltBounds();
    const tolerance = 0.1;
    
    // Check if shapes completely fill the quilt area
    let totalShapeArea = 0;
    this.appState.shapes.forEach(shape => {
      totalShapeArea += shape.position.width * shape.position.height;
    });
    
    const quiltArea = bounds.width * bounds.height;
    const coverageRatio = totalShapeArea / quiltArea;
    
    console.log(`📊 Quilt coverage: ${(coverageRatio * 100).toFixed(2)}% (${totalShapeArea.toFixed(1)} / ${quiltArea.toFixed(1)})`);
    
    if (coverageRatio < 0.99) {
      console.log(`⚠️ Low coverage detected! Expected ~100%, got ${(coverageRatio * 100).toFixed(2)}%`);
      
      // Try to identify and fix gaps
      this.fillGaps();
    }
  }

  /**
   * Fill gaps by expanding adjacent shapes
   */
  fillGaps() {
    const bounds = this.getQuiltBounds();
    const tolerance = 0.1;
    
    // Check each shape's edges for gaps
    this.appState.shapes.forEach((shape, index) => {
      // Check right edge
      const rightEdge = shape.position.x + shape.position.width;
      if (Math.abs(rightEdge - bounds.maxX) < tolerance) {
        // Shape touches right edge, check if there's a gap to the left
        const shapesToLeft = this.appState.shapes.filter(s => 
          s !== shape && 
          Math.abs(s.position.y + s.position.height - shape.position.y) < tolerance &&
          Math.abs(s.position.x + s.position.width - shape.position.x) < tolerance
        );
        
        if (shapesToLeft.length === 0) {
          console.log(`🔧 Expanding shape ${index} to fill gap on left`);
          shape.position.x = bounds.minX;
          shape.position.width = rightEdge - bounds.minX;
        }
      }
      
      // Check bottom edge
      const bottomEdge = shape.position.y + shape.position.height;
      if (Math.abs(bottomEdge - bounds.maxY) < tolerance) {
        // Shape touches bottom edge, check if there's a gap above
        const shapesAbove = this.appState.shapes.filter(s => 
          s !== shape && 
          Math.abs(s.position.x + s.position.width - shape.position.x) < tolerance &&
          Math.abs(s.position.y + s.position.height - shape.position.y) < tolerance
        );
        
        if (shapesAbove.length === 0) {
          console.log(`🔧 Expanding shape ${index} to fill gap above`);
          shape.position.y = bounds.minY;
          shape.position.height = bottomEdge - bounds.minY;
        }
      }
    });
  }

  /**
   * Check for overlapping shapes and fix them
   */
  checkForOverlaps() {
    const shapes = this.appState.shapes;
    let overlapsFixed = 0;
    
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const shape1 = shapes[i];
        const shape2 = shapes[j];
        
        // Check if shapes overlap
        const overlapX = Math.max(0, 
          Math.min(shape1.position.x + shape1.position.width, shape2.position.x + shape2.position.width) - 
          Math.max(shape1.position.x, shape2.position.x)
        );
        const overlapY = Math.max(0, 
          Math.min(shape1.position.y + shape1.position.height, shape2.position.y + shape2.position.height) - 
          Math.max(shape1.position.y, shape2.position.y)
        );
        
        if (overlapX > 0 && overlapY > 0) {
          console.log(`⚠️ Overlap detected between shapes ${i} and ${j}:`, {
            overlapX, overlapY,
            shape1: { x: shape1.position.x, y: shape1.position.y, w: shape1.position.width, h: shape1.position.height },
            shape2: { x: shape2.position.x, y: shape2.position.y, w: shape2.position.width, h: shape2.position.height }
          });
          
          // Fix overlap by adjusting the second shape
          const originalWidth = shape2.position.width;
          const originalHeight = shape2.position.height;
          
          if (overlapX > overlapY) {
            // Horizontal overlap - adjust width
            shape2.position.width = Math.max(QUILT_CONFIG.MIN_SHAPE_SIZE, shape2.position.width - overlapX);
            console.log(`🔧 Fixed horizontal overlap: shape ${j} width ${originalWidth} → ${shape2.position.width}`);
          } else {
            // Vertical overlap - adjust height
            shape2.position.height = Math.max(QUILT_CONFIG.MIN_SHAPE_SIZE, shape2.position.height - overlapY);
            console.log(`🔧 Fixed vertical overlap: shape ${j} height ${originalHeight} → ${shape2.position.height}`);
          }
          
          overlapsFixed++;
        }
      }
    }
    
    if (overlapsFixed > 0) {
      console.log(`🔧 Fixed ${overlapsFixed} overlaps`);
    }
  }

  /**
   * Generate unique ID
   */
  static generateId() {
    return 'shape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

// ===== EXPORT FOR TESTING =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    QuiltEngine,
    QuiltAppState,
    QuiltShape,
    ColorUtils,
    UserTracker,
    QUILT_CONFIG
  };
} else {
  // Browser environment - attach to window
  window.QuiltEngine = QuiltEngine;
  window.QuiltAppState = QuiltAppState;
  window.QuiltShape = QuiltShape;
  window.ColorUtils = ColorUtils;
  window.UserTracker = UserTracker;
  window.QUILT_CONFIG = QUILT_CONFIG;
}

console.log('🧵 Quilt Engine loaded successfully!'); 