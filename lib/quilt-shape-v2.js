/**
 * Quilt block shape tree for SimpleQuiltEngine splits. Loaded before the main app module.
 * Exposes globalThis.QuiltShapeV2. Uses CONFIG at runtime.
 */
(function (root) {
  'use strict';

class QuiltShapeV2 {
  constructor(options = {}) {
    this.id = options.id || this.generateId();
    this.type = options.type || 'KEY_SHAPE';
    this.color = options.color || CONFIG.APP.defaultColor;
    this.position = options.position || { x: 0, y: 0, width: 1000, height: 1000 };
    this.parentId = options.parentId || null;
    this.contributorId = options.contributorId || null;
    this.submissionIndex = options.submissionIndex || 0;
    this.colorFamily = options.colorFamily || null;
    this.descendants = [];
  }
  
  generateId() {
    return 'shape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  canSplit(direction) {
    if (direction === 'horizontal') {
      return this.position.height >= CONFIG.QUILT_V2.MIN_SHAPE_SIZE * 2;
    } else {
      return this.position.width >= CONFIG.QUILT_V2.MIN_SHAPE_SIZE * 2;
    }
  }
  
  getValidSplitDirections() {
    const directions = [];
    if (this.canSplit('horizontal')) directions.push('horizontal');
    if (this.canSplit('vertical')) directions.push('vertical');
    return directions;
  }
  
  split(newColor, direction, contributorId, submissionIndex) {
    if (!this.canSplit(direction)) {
      throw new Error(`Cannot split shape ${this.id} in ${direction} direction`);
    }

    const splitRatio = 0.3 + Math.random() * 0.4;
    let shape1, shape2;

    if (direction === 'horizontal') {
      const splitHeight = this.position.height * splitRatio;
      
      shape1 = new QuiltShapeV2({
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

      shape2 = new QuiltShapeV2({
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
      
      shape1 = new QuiltShapeV2({
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

      shape2 = new QuiltShapeV2({
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

    this.descendants.push(shape2.id);
    
    return [shape1, shape2];
  }
  
  getAllDescendants(allShapes) {
    const descendants = [...this.descendants];
    this.descendants.forEach(descId => {
      const desc = allShapes.find(s => s.id === descId);
      if (desc) {
        descendants.push(...desc.getAllDescendants(allShapes));
      }
    });
    return descendants;
  }
}

  root.QuiltShapeV2 = QuiltShapeV2;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
