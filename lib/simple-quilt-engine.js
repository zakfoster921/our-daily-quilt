/**
 * Quilt block engine (split/merge/color logic)
 * Exposes globalThis.SimpleQuiltEngine.
 */
(function (root) {
  'use strict';

class SimpleQuiltEngine {
  /** Diagonal HST works for any rectangle; cap is UX-only. Portrait strips often exceed 1.35:1. */
  static HST_ELIGIBLE_MIN_SHORT = 72;
  static HST_ELIGIBLE_MAX_ASPECT = 2.75;
  static HST_MAX_FAMILY_BLOCKS = 5;
  static STARTER_AXIS_SECOND_LINE_CHANCE = 0.42;
  static STARTER_AXIS_MAX_DEGREES = 33;
  static RECENT_VISIBLE_SUBMISSION_WINDOW = 4;
  static AXIS_COLLAGE_MAX_VISUAL_EXTENSION = 32;
  static NEW_VISIBLE_REGULAR_RENDER_SCALE = 1;
  static RECENT_VISIBLE_REGULAR_RENDER_SCALE = 1;
  static OVERSIZED_SPLIT_START_BLOCKS = 18;
  static OVERSIZED_SPLIT_EVERY_ADDS = 3;
  static OVERSIZED_SPLIT_MAX_AREA_FRACTION = 0.12;
  static OVERSIZED_SPLIT_MAX_AVG_BLOCK_MULTIPLIER = 3.2;
  static SIZE_PRESSURE_RANK_WEIGHT = 0.34;
  static OVERSIZED_SPLIT_NEW_COLOR_MIN = 0.16;
  static OVERSIZED_SPLIT_NEW_COLOR_MAX = 0.24;
  static PROTECTED_ANCHOR_PICK_MIN_SUBMISSION = 2;
  static PROTECTED_ANCHOR_PICK_MAX_SUBMISSION = 4;
  static PROTECTED_ANCHOR_MIN_AREA_FRACTION = 0.08;
  static PROTECTED_ANCHOR_MAX_AREA_FRACTION = 0.38;
  static PROTECTED_ANCHOR_COLOR_SIMILARITY_MIN = 0.76;
  static SPECIAL_PATTERN_MAX_AREA_FRACTION = 0.2;
  /** Beyond this block count, new-special roulette + forced HST/inset odds taper toward STRUCTURE_SCALE_FLOOR (never hard-off). Existing specials still split normally. */
  static SPECIAL_STRUCTURE_TAPER_START_BLOCKS = 100;
  static SPECIAL_STRUCTURE_TAPER_END_BLOCKS = 300;
  static SPECIAL_STRUCTURE_SCALE_FLOOR = 0.1;
  /** First snapshot of macro regions when leaf count is in [MACRO_FREEZE_AT_BLOCK_COUNT, MACRO_FREEZE_SNAPSHOT_MAX_BLOCKS]; merges never cross regions after. */
  static MACRO_FREEZE_AT_BLOCK_COUNT = 25;
  static MACRO_FREEZE_SNAPSHOT_MAX_BLOCKS = 148;
  /** Early regular splits persist slight seam angles so later splits inherit handmade geometry. */
  static CANONICAL_HANDCUT_SPLIT_UNTIL_BLOCKS = 25;
  static CANONICAL_HANDCUT_SPLIT_MAX_DEGREES = 4;
  /** Late regular splits favor a thin new-color slice so most of the cell stays one field (72→190 blocks). */
  static STRUCTURE_ACCENT_START_BLOCKS = 72;
  static STRUCTURE_ACCENT_FULL_BLOCKS = 190;
  static STRUCTURE_ACCENT_PROB = 0.68;
  /** Pull chosen paint toward neighbor + quilt palette in OKLab (45→195 blocks, cap HARMONY_BLEND_MAX). */
  static HARMONY_BLEND_START_BLOCKS = 45;
  static HARMONY_BLEND_FULL_BLOCKS = 195;
  static HARMONY_BLEND_MAX = 0.36;
  /** Adjacent axis-aligned regular blocks merge when perceptual similarity meets this floor (OKLab via getColorSimilarity). */
  static MERGE_COLOR_SIMILARITY_MIN = 0.92;
  /** World-space tolerance for shared-edge detection (floating splits). */
  static MERGE_EPS_PX = 1.25;
  static INSET_CIRCLE_MIN_SHORT = 76;
  static INSET_CIRCLE_MAX_ASPECT = 2.6;
  static INSET_CIRCLE_MIN_AREA = 12000;
  static INSET_CIRCLE_MIN_HALF = 40;
  /** Disk diameter as a fraction of the shorter side (0.9 → ~sample 90% width disk). */
  static INSET_CIRCLE_DIAMETER_FRAC = 0.9;
  /** Field vs new-color similarity: stricter on large cells, looser as pieces shrink (see `_insetCircleMaxSimilarityForSplit`). */
  static INSET_SPLIT_SIM_SIDE_LO = 48;
  static INSET_SPLIT_SIM_SIDE_HI = 220;
  static INSET_SPLIT_SIM_STRICT = 0.7;
  static INSET_SPLIT_SIM_LOOSE = 0.988;
  static INSET_CIRCLE_PREFREEZE_MAX_SPLIT_TIER = 3;

  /** World-space circle params saved on descendants of an inset-circle split. */
  static hasPersistedInsetCircleGeometry(block) {
    if (!block) return false;
    const cx = Number(block.insetCx);
    const cy = Number(block.insetCy);
    const r = Number(block.insetR);
    return Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r) && r > 0;
  }

  /**
   * If inset geometry exists but labels were stripped (e.g. nested-pattern strip),
   * restore so render/split use clip-to-rect inset again.
   */
  static ensureInsetClassificationFromGeometry(block) {
    if (!SimpleQuiltEngine.hasPersistedInsetCircleGeometry(block)) return false;
    if (block.patternType === 'special' && block.specialPatternType === 'insetCircle') return false;
    block.patternType = 'special';
    block.specialPatternType = 'insetCircle';
    return true;
  }

  /** When `rumi-colors.js` did not load; keep hues distinct from page paper. */
  static _fallbackRumiPaletteForStarter() {
    return [
      '#ea9b9a', '#de6c61', '#61c9de', '#61de61', '#6182de', '#8061de',
      '#caa22b', '#2bcaca', '#1f931f', '#bd283c', '#4024a8', '#ce2cb0',
      '#3177d3', '#9ab125', '#df9368', '#7e7de3'
    ];
  }

  /**
   * Full-canvas starter must not match page paper (`#f6f4f1` / `#ebe8e3`): same hex + similarity routing
   * makes large remnants look like UI voids and rarely win `rankByColorFit` for vivid picks.
   */
  /** Pre-first-user canvas: page paper, not a community color. */
  static getEmptyDayPlaceholderColorHex() {
    return '#f6f4f1';
  }

  static pickStarterFieldColorHex() {
    const paperAnchors = ['#f6f4f1', '#ebe8e3'];
    const raw = Array.isArray(window.__ODQ_RUMI_COLORS__) ? window.__ODQ_RUMI_COLORS__ : [];
    const fromWindow = raw
      .filter((c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/i.test(c.trim()))
      .map((c) => c.trim().toLowerCase());
    const palette = fromWindow.length ? [...new Set(fromWindow)] : SimpleQuiltEngine._fallbackRumiPaletteForStarter();
    let probe;
    try {
      probe = new SimpleQuiltEngine('__starter_color_probe');
    } catch (_) {
      return (typeof CONFIG !== 'undefined' && CONFIG.APP && CONFIG.APP.defaultColor) || '#ea9b9a';
    }
    const notPaperLike = (hex) => {
      const h = String(hex).toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(h)) return false;
      return paperAnchors.every((p) => probe.getColorSimilarity(h, p) < 0.88);
    };
    const candidates = palette.filter(notPaperLike);
    const pool = candidates.length ? candidates : palette;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (typeof pick === 'string' && /^#[0-9a-f]{6}$/.test(pick)) return pick;
    return (typeof CONFIG !== 'undefined' && CONFIG.APP && CONFIG.APP.defaultColor) || '#ea9b9a';
  }

  constructor(userId = null) {
    this.blocks = [];
    this.submissionCount = 0;
    this.deviceId = userId || this.getOrCreateDeviceId();
    /** @type {Array<{seq:number,iso:string,newHex:string,parent:object,children:object[]}>} */
    this.colorReplayEvents = [];
    /** Exact split replay is only needed for synthetic reels; keep it off to avoid storage bloat. */
    this.recordColorReplayEvents = false;
    /** Once true, neighbor merges only combine blocks with the same macroRegionId (composition outlines preserved). */
    this.macroStructureFrozen = false;
    /** Populated when macro freeze runs: number of unified HST cells split into two triangle shards (sim / diagnostics). */
    this.macroFreezeHstParentsExplodedCount = 0;
    /** Admin simulator only: run neighbor merge pass like production (slower); remap stays disabled so localStorage is untouched. */
    this.simulatorFullFidelity = false;
    /** Admin simulator experiment: mirror pre-freeze splits into counterpart blocks for symmetric structure. */
    this.simulatorMirrorPreFreeze = false;
    /** Pick exactly one early protected anchor on a stable add number for this engine run. */
    this.protectedAnchorTargetSubmission =
      SimpleQuiltEngine.PROTECTED_ANCHOR_PICK_MIN_SUBMISSION +
      Math.floor(
        Math.random() *
        (SimpleQuiltEngine.PROTECTED_ANCHOR_PICK_MAX_SUBMISSION - SimpleQuiltEngine.PROTECTED_ANCHOR_PICK_MIN_SUBMISSION + 1)
      );
  }

  _simMirroredPreFreezeEnabled() {
    return (
      this.simulatorMirrorPreFreeze === true &&
      String(this.deviceId || '').startsWith('admin-sim') &&
      !this.macroStructureFrozen
    );
  }

  _simRectAlmostEqual(a, b, eps = 0.75) {
    if (!a || !b) return false;
    return (
      Math.abs(Number(a.x) - Number(b.x)) <= eps &&
      Math.abs(Number(a.y) - Number(b.y)) <= eps &&
      Math.abs(Number(a.width) - Number(b.width)) <= eps &&
      Math.abs(Number(a.height) - Number(b.height)) <= eps
    );
  }

  _simMirrorBlockGeometry(block, mirrorH, mirrorV, suffix) {
    const dims = Utils.getQuiltDimensions();
    const width = Math.max(1, Number(block.width) || 1);
    const height = Math.max(1, Number(block.height) || 1);
    const out = {
      ...block,
      id: `${block.id}_${suffix}`,
      x: mirrorH ? dims.width - Number(block.x || 0) - width : Number(block.x || 0),
      y: mirrorV ? dims.height - Number(block.y || 0) - height : Number(block.y || 0)
    };
    if (mirrorH && typeof out.insetCx === 'number') out.insetCx = dims.width - out.insetCx;
    if (mirrorV && typeof out.insetCy === 'number') out.insetCy = dims.height - out.insetCy;
    if ((mirrorH || mirrorV) && typeof out.hstDiagonal === 'string' && mirrorH !== mirrorV) {
      out.hstDiagonal = out.hstDiagonal === 'ne-sw' ? 'nw-se' : 'ne-sw';
    }
    if (Array.isArray(out.hstTriangles)) {
      out.hstTriangles = out.hstTriangles.map((tri) => ({
        ...tri,
        points: (tri.points || []).map((p) => {
          const x = Number(Array.isArray(p) ? p[0] : p?.x);
          const y = Number(Array.isArray(p) ? p[1] : p?.y);
          return [mirrorH ? width - x : x, mirrorV ? height - y : y];
        })
      }));
    }
    if (Array.isArray(out.polygonPieces)) {
      out.polygonPieces = out.polygonPieces.map((piece) => ({
        ...piece,
        points: (piece.points || []).map((p) => {
          const x = Number(Array.isArray(p) ? p[0] : p?.x);
          const y = Number(Array.isArray(p) ? p[1] : p?.y);
          return [mirrorH ? width - x : x, mirrorV ? height - y : y];
        })
      }));
    }
    if (typeof out.diagonalAxisUx === 'number') out.diagonalAxisUx = mirrorH ? -out.diagonalAxisUx : out.diagonalAxisUx;
    if (typeof out.diagonalAxisUy === 'number') out.diagonalAxisUy = mirrorV ? -out.diagonalAxisUy : out.diagonalAxisUy;
    return out;
  }

  _simMirroredPreFreezeReplacements(parentBlock, splitResult) {
    if (!this._simMirroredPreFreezeEnabled()) return [];
    if (!parentBlock || !Array.isArray(splitResult) || !splitResult.length) return [];
    const transforms = [
      { h: true, v: false, suffix: 'mh' },
      { h: false, v: true, suffix: 'mv' },
      { h: true, v: true, suffix: 'mhv' }
    ];
    const replacements = [];
    const seenTargetIds = new Set();
    transforms.forEach((tx) => {
      const mirroredParentRect = this._simMirrorBlockGeometry(parentBlock, tx.h, tx.v, tx.suffix);
      if (this._simRectAlmostEqual(parentBlock, mirroredParentRect)) return;
      const target = this.blocks.find(
        (block) =>
          block &&
          block.id !== parentBlock.id &&
          !seenTargetIds.has(block.id) &&
          this._simRectAlmostEqual(block, mirroredParentRect)
      );
      if (!target) return;
      seenTargetIds.add(target.id);
      replacements.push({
        targetId: target.id,
        children: splitResult.map((child) => this._simMirrorBlockGeometry(child, tx.h, tx.v, tx.suffix))
      });
    });
    return replacements;
  }
  
  _growthSpecialStructureScale() {
    const n = this.blocks.length;
    const t0 = SimpleQuiltEngine.SPECIAL_STRUCTURE_TAPER_START_BLOCKS;
    if (n < t0) return 1;
    const t1 = SimpleQuiltEngine.SPECIAL_STRUCTURE_TAPER_END_BLOCKS;
    const lo = SimpleQuiltEngine.SPECIAL_STRUCTURE_SCALE_FLOOR;
    if (n >= t1) return lo;
    return 1 + (lo - 1) * ((n - t0) / (t1 - t0));
  }

  _sharesAxisAlignedFullEdge(A, B, eps) {
    if (!A || !B) return false;
    const ox = Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x);
    const oy = Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y);
    if (ox <= eps || oy <= eps) return false;
    if (Math.abs(A.x + A.width - B.x) < eps && oy > eps) return true;
    if (Math.abs(B.x + B.width - A.x) < eps && oy > eps) return true;
    if (Math.abs(A.y + A.height - B.y) < eps && ox > eps) return true;
    if (Math.abs(B.y + B.height - A.y) < eps && ox > eps) return true;
    return false;
  }

  _harmonyNeighborHexes(selectedBlock) {
    const eps = SimpleQuiltEngine.MERGE_EPS_PX * 2;
    const colors = [];
    for (const b of this.blocks) {
      if (!b || b.id === selectedBlock.id) continue;
      if (!b.color || typeof b.color !== 'string' || !b.color.match(/^#[0-9A-Fa-f]{6}$/)) continue;
      if (!this._sharesAxisAlignedFullEdge(selectedBlock, b, eps)) continue;
      colors.push(b.color);
    }
    return colors;
  }

  _averageOklabFromHexColors(hexList) {
    if (!hexList || !hexList.length) return null;
    let L = 0;
    let a = 0;
    let bc = 0;
    for (const h of hexList) {
      const o = this.hexToOklab(h);
      L += o.l;
      a += o.a;
      bc += o.b;
    }
    const n = hexList.length;
    return { l: L / n, a: a / n, b: bc / n };
  }

  _sampledQuiltHarmonyOklab(maxN) {
    const list = [];
    const blocks = this.blocks;
    const cap = Math.min(maxN, Math.max(8, blocks.length));
    const step = Math.max(1, Math.floor(blocks.length / cap));
    for (let i = 0; i < blocks.length && list.length < cap; i += step) {
      const h = blocks[i]?.color;
      if (h && /^#[0-9A-Fa-f]{6}$/.test(h)) list.push(h);
    }
    return this._averageOklabFromHexColors(list);
  }

  _harmonyTargetOklabForSplit(selectedBlock) {
    const neigh = this._harmonyNeighborHexes(selectedBlock);
    const nOklab = this._averageOklabFromHexColors(neigh);
    const gOklab = this._sampledQuiltHarmonyOklab(96);
    if (nOklab && gOklab) {
      return {
        l: nOklab.l * 0.62 + gOklab.l * 0.38,
        a: nOklab.a * 0.62 + gOklab.a * 0.38,
        b: nOklab.b * 0.62 + gOklab.b * 0.38
      };
    }
    return nOklab || gOklab || this.hexToOklab(selectedBlock.color);
  }

  _harmonyBlendStrength() {
    return 0;
    const n = this.blocks.length;
    const s0 = SimpleQuiltEngine.HARMONY_BLEND_START_BLOCKS;
    if (n < s0) return 0;
    const s1 = SimpleQuiltEngine.HARMONY_BLEND_FULL_BLOCKS;
    const cap = SimpleQuiltEngine.HARMONY_BLEND_MAX;
    if (n >= s1) return cap;
    return cap * ((n - s0) / (s1 - s0));
  }

  _harmonyAdjustedSplitColor(selectedBlock, userHex) {
    const w = this._harmonyBlendStrength();
    if (w <= 0) return userHex;
    const oU = this.hexToOklab(userHex);
    const oT = this._harmonyTargetOklabForSplit(selectedBlock);
    return this.oklabToHex(
      oU.l * (1 - w) + oT.l * w,
      oU.a * (1 - w) + oT.a * w,
      oU.b * (1 - w) + oT.b * w
    );
  }

  _regularSplitAccentBias() {
    const n = this.blocks.length;
    const s0 = SimpleQuiltEngine.STRUCTURE_ACCENT_START_BLOCKS;
    if (n < s0) return 0;
    const s1 = SimpleQuiltEngine.STRUCTURE_ACCENT_FULL_BLOCKS;
    if (n >= s1) return 1;
    return (n - s0) / (s1 - s0);
  }

  _stampMacroRegionFromParent(children, parent) {
    if (!parent || parent.macroRegionId == null) return;
    const id = parent.macroRegionId;
    const outline = this._normalizeMacroFrozenOutline(parent.macroFrozenOutline);
    const originalBounds = this._normalizeMacroOriginalBounds(parent.macroOriginalBounds);
    const color =
      typeof parent.macroFrozenColor === 'string' && parent.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)
        ? parent.macroFrozenColor
        : undefined;
    const arr = Array.isArray(children) ? children : [];
    arr.forEach((c) => {
      if (!c || typeof c !== 'object') return;
      c.macroRegionId = id;
      if (outline) c.macroFrozenOutline = outline;
      if (color) c.macroFrozenColor = color;
      if (parent.macroVisibleFlattened === true) c.macroVisibleFlattened = true;
      if (originalBounds) c.macroOriginalBounds = originalBounds;
    });
  }

  _normalizeMacroOriginalBounds(bounds) {
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

  _normalizeMacroFrozenOutline(outline) {
    if (!outline || typeof outline !== 'object') return null;
    if (outline.type === 'rect') {
      const x = Number(outline.x);
      const y = Number(outline.y);
      const width = Number(outline.width);
      const height = Number(outline.height);
      if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
        return { type: 'rect', x, y, width, height };
      }
    }
    if (outline.type === 'polygon' && Array.isArray(outline.points)) {
      const points = outline.points
        .map((p) => ({
          x: Number(Array.isArray(p) ? p[0] : p?.x),
          y: Number(Array.isArray(p) ? p[1] : p?.y)
        }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (points.length >= 3) return { type: 'polygon', points };
    }
    if (outline.type === 'polygons' && Array.isArray(outline.pieces)) {
      const pieces = outline.pieces
        .map((piece) => ({
          points: (piece?.points || [])
            .map((p) => ({
              x: Number(Array.isArray(p) ? p[0] : p?.x),
              y: Number(Array.isArray(p) ? p[1] : p?.y)
            }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        }))
        .filter((piece) => piece.points.length >= 3);
      if (pieces.length === 1) return { type: 'polygon', points: pieces[0].points };
      if (pieces.length > 1) return { type: 'polygons', pieces };
    }
    if (outline.type === 'circle') {
      const cx = Number(outline.cx);
      const cy = Number(outline.cy);
      const r = Number(outline.r);
      if ([cx, cy, r].every(Number.isFinite) && r > 0) {
        return { type: 'circle', cx, cy, r };
      }
    }
    return null;
  }

  _buildMacroFrozenOutline(block) {
    if (!block) return null;
    if (block.patternType === 'special' && block.specialPatternType === 'hst') {
      const tris = Utils.getHstRenderTriangles(block);
      if (Array.isArray(tris) && tris.length === 1 && Array.isArray(tris[0].points)) {
        const bx = Number(block.x) || 0;
        const by = Number(block.y) || 0;
        const points = tris[0].points
          .map((p) => ({
            x: bx + Number(Array.isArray(p) ? p[0] : p?.x),
            y: by + Number(Array.isArray(p) ? p[1] : p?.y)
          }))
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        if (points.length >= 3) return { type: 'polygon', points };
      }
    }
    if (Array.isArray(block.polygonPieces) && block.polygonPieces.length) {
      const pieces = this._polygonPiecesWorld(block)
        .map((piece) => ({
          points: (piece.points || [])
            .map((p) => ({ x: Number(p[0]), y: Number(p[1]) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        }))
        .filter((piece) => piece.points.length >= 3);
      if (pieces.length === 1) return { type: 'polygon', points: pieces[0].points };
      if (pieces.length > 1) return { type: 'polygons', pieces };
    }
    if (
      block.patternType === 'special' &&
      block.specialPatternType === 'insetCircle' &&
      SimpleQuiltEngine.hasPersistedInsetCircleGeometry(block)
    ) {
      return {
        type: 'circle',
        cx: Number(block.insetCx),
        cy: Number(block.insetCy),
        r: Number(block.insetR)
      };
    }
    const x = Number(block.x);
    const y = Number(block.y);
    const width = Number(block.width);
    const height = Number(block.height);
    if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
      return { type: 'rect', x, y, width, height };
    }
    return null;
  }

  _stampMacroFrozenMetadataOnLeaves() {
    this.blocks.forEach((block) => {
      if (!block || block.macroRegionId == null) return;
      const outline = this._buildMacroFrozenOutline(block);
      if (outline) block.macroFrozenOutline = outline;
      const frozenColor =
        block.patternType === 'special' &&
        block.specialPatternType === 'insetCircle' &&
        typeof block.insetInnerColor === 'string' &&
        block.insetInnerColor.match(/^#[0-9A-Fa-f]{6}$/)
          ? block.insetInnerColor
          : block.color;
      if (typeof frozenColor === 'string' && frozenColor.match(/^#[0-9A-Fa-f]{6}$/)) {
        block.macroFrozenColor = frozenColor;
      }
    });
  }

  _macroRegionsMergeCompatible(a, b) {
    if (!this.macroStructureFrozen) return true;
    const ia = a?.macroRegionId;
    const ib = b?.macroRegionId;
    if (ia == null || ib == null) return true;
    return ia === ib;
  }

  _starterAxisRegionsMergeCompatible(a, b) {
    const ia = a?.starterAxisRegionId;
    const ib = b?.starterAxisRegionId;
    if (ia == null && ib == null) return true;
    return ia != null && ib != null && String(ia) === String(ib);
  }

  _visualLayersMergeCompatible(a, b) {
    return Math.abs(this._visualLayerIndexForBlock(a) - this._visualLayerIndexForBlock(b)) < 1e-6;
  }

  _protectedAnchorsMergeCompatible(a, b) {
    const ia = a?.protectedAnchorId;
    const ib = b?.protectedAnchorId;
    if (ia == null && ib == null) return true;
    return ia != null && ib != null && String(ia) === String(ib);
  }

  _isProtectedAnchorBlock(block) {
    return !!(block && block.protectedAnchorId != null);
  }

  _hasProtectedAnchor() {
    return this.blocks.some((block) => this._isProtectedAnchorBlock(block));
  }

  _protectedAnchorColorCompatible(block, newColor) {
    if (!this._isProtectedAnchorBlock(block)) return true;
    if (typeof newColor !== 'string' || !newColor.match(/^#[0-9A-Fa-f]{6}$/)) return false;
    const candidates = [block.color, block.macroFrozenColor, block.insetInnerColor, block.hstColorB]
      .filter((color) => typeof color === 'string' && color.match(/^#[0-9A-Fa-f]{6}$/));
    return candidates.some(
      (color) => this.getColorSimilarity(color, newColor) >= SimpleQuiltEngine.PROTECTED_ANCHOR_COLOR_SIMILARITY_MIN
    );
  }

  _stampProtectedAnchorFromParent(children, parent) {
    if (!Array.isArray(children) || !this._isProtectedAnchorBlock(parent)) return children;
    const protectedAnchorId = String(parent.protectedAnchorId);
    const protectedAnchorRootId = String(parent.protectedAnchorRootId || protectedAnchorId);
    children.forEach((child) => {
      if (!child || typeof child !== 'object') return;
      child.protectedAnchorId = protectedAnchorId;
      child.protectedAnchorRootId = protectedAnchorRootId;
    });
    return children;
  }

  _isFrozenHstMacroShard(block) {
    if (!this.macroStructureFrozen || !block) return false;
    const outline = this._normalizeMacroFrozenOutline(block.macroFrozenOutline);
    return (
      outline?.type === 'polygon' &&
      block.patternType === 'special' &&
      block.specialPatternType === 'hst'
    );
  }

  _isFrozenInsetCircleMacroRegion(block) {
    if (!this.macroStructureFrozen || !block) return false;
    const outline = this._normalizeMacroFrozenOutline(block.macroFrozenOutline);
    return (
      outline?.type === 'circle' &&
      block.patternType === 'special' &&
      block.specialPatternType === 'insetCircle'
    );
  }

  _isProtectedSpecialMacroRegionBlock(block) {
    return (
      this._isFrozenHstMacroShard(block) ||
      this._isFrozenInsetCircleMacroRegion(block) ||
      (
        this.macroStructureFrozen &&
        typeof block.specialPatternType === 'string' &&
        block.specialPatternType.length > 0 &&
        block.macroVisibleFlattened !== true
      )
    );
  }

  _regularSplitColorForFrozenSpecialBlock(block, fallbackColor) {
    return fallbackColor;
  }

  _isInsetCirclePreFreezeSplitCapped(block) {
    if (
      this.macroStructureFrozen ||
      block?.patternType !== 'special' ||
      block?.specialPatternType !== 'insetCircle'
    ) {
      return false;
    }
    const maxSplits = SimpleQuiltEngine.INSET_CIRCLE_PREFREEZE_MAX_SPLIT_TIER;
    if (Number(block.insetTier || 0) >= maxSplits) return true;
    const familyId = block.originalPatternId || block.id;
    const familyBlockCount = this.blocks.filter(
      (b) => b && b.specialPatternType === 'insetCircle' && (b.originalPatternId || b.id) === familyId
    ).length;
    return familyBlockCount >= maxSplits + 1;
  }

  _protectedSpecialMacroColorSimilarityMin() {
    return 0.9;
  }

  _protectedSpecialMacroColorCompatible(block, newColor) {
    if (!this._isProtectedSpecialMacroRegionBlock(block)) return true;
    if (typeof newColor !== 'string' || !newColor.match(/^#[0-9A-Fa-f]{6}$/)) return false;
    const anchor =
      typeof block.macroFrozenColor === 'string' && block.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)
        ? block.macroFrozenColor
        : block.color;
    if (typeof anchor !== 'string' || !anchor.match(/^#[0-9A-Fa-f]{6}$/)) return false;
    return this.getColorSimilarity(anchor, newColor) >= this._protectedSpecialMacroColorSimilarityMin();
  }

  _macroRegionColorCompatible(block, newColor) {
    if (!this.macroStructureFrozen || !block || block.macroRegionId == null) return true;
    if (typeof newColor !== 'string' || !newColor.match(/^#[0-9A-Fa-f]{6}$/)) return false;
    const anchor =
      typeof block.macroFrozenColor === 'string' && block.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)
        ? block.macroFrozenColor
        : block.color;
    if (typeof anchor !== 'string' || !anchor.match(/^#[0-9A-Fa-f]{6}$/)) return false;
    return this.getColorSimilarity(anchor, newColor) >= this._protectedSpecialMacroColorSimilarityMin();
  }

  _filterMacroCandidatesByColorOrValue(blocks, newColor) {
    if (!this.macroStructureFrozen || !Array.isArray(blocks) || blocks.length <= 1) return blocks;
    const strictColorMatches = blocks.filter((block) => this._macroRegionColorCompatible(block, newColor));
    return strictColorMatches.length ? strictColorMatches : blocks;
  }

  _macroValueDistanceForBlock(block, newColor) {
    const blockL = this._oklabLightnessForHex(block?.macroFrozenColor || block?.color);
    const newL = this._oklabLightnessForHex(newColor);
    if (blockL == null || newL == null) return Number.POSITIVE_INFINITY;
    return Math.abs(blockL - newL);
  }

  _macroRegionAnchorColor(block) {
    if (!this.macroStructureFrozen || !block || block.macroRegionId == null) return '';
    const candidates = [block.macroFrozenColor, block.color].filter(
      (color) => typeof color === 'string' && color.match(/^#[0-9A-Fa-f]{6}$/)
    );
    return candidates[0] || '';
  }

  _tonalSplitColorForMacroRegion(block, candidateColor) {
    if (typeof candidateColor !== 'string' || !candidateColor.match(/^#[0-9A-Fa-f]{6}$/)) return candidateColor;
    const anchor = this._macroRegionAnchorColor(block);
    if (!anchor) return candidateColor;
    if (this.getColorSimilarity(anchor, candidateColor) < 0.965) return candidateColor;
    const hsl = this.hexToHsl(candidateColor);
    const anchorHsl = this.hexToHsl(anchor);
    const shouldDarken = hsl.l >= anchorHsl.l || hsl.l > 58;
    const amount = 0.045 + Math.random() * 0.025;
    const tweaked = shouldDarken
      ? this.darkenColorHsl(hsl, amount)
      : this.lightenColorHsl(hsl, amount);
    const out = Utils.hslToHex(tweaked.h, tweaked.s, tweaked.l);
    return typeof out === 'string' && out.match(/^#[0-9A-Fa-f]{6}$/) ? out : candidateColor;
  }

  _macroValueRoutingStartBlocks() {
    return 700;
  }

  _macroRegularStrongColorSimilarityMin() {
    return 0.72;
  }

  _macroHueFallbackMaxDistance() {
    return 0.8;
  }

  _macroSaturatedColorChromaMin() {
    return 0.045;
  }

  _protectedSpecialCompetitiveSimilarityMargin() {
    return 0.03;
  }

  _protectedSpecialBoundarySimilarityMax() {
    return 0.88;
  }

  _oklabLightnessForHex(hex) {
    if (typeof hex !== 'string' || !hex.match(/^#[0-9A-Fa-f]{6}$/)) return null;
    return this.hexToOklab(hex).l;
  }

  _oklabHueProfileForHex(hex) {
    if (typeof hex !== 'string' || !hex.match(/^#[0-9A-Fa-f]{6}$/)) return null;
    const lab = this.hexToOklab(hex);
    const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    const hue = Math.atan2(lab.b, lab.a);
    return { l: lab.l, chroma, hue };
  }

  _oklabHueDistance(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const diff = Math.abs(a.hue - b.hue);
    return Math.min(diff, Math.PI * 2 - diff);
  }

  _protectedSpecialNeighborSimilarity(block, newColor) {
    if (!this.macroStructureFrozen || !block || this._isProtectedSpecialMacroRegionBlock(block)) return -1;
    if (typeof newColor !== 'string' || !newColor.match(/^#[0-9A-Fa-f]{6}$/)) return -1;
    const eps = SimpleQuiltEngine.MERGE_EPS_PX * 2;
    let maxSim = -1;
    for (const other of this.blocks) {
      if (!other || other.macroRegionId === block.macroRegionId) continue;
      if (!this._isProtectedSpecialMacroRegionBlock(other)) continue;
      if (!this._sharesAxisAlignedFullEdge(block, other, eps)) continue;
      const anchor =
        typeof other.macroFrozenColor === 'string' && other.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)
          ? other.macroFrozenColor
          : other.color;
      if (typeof anchor !== 'string' || !anchor.match(/^#[0-9A-Fa-f]{6}$/)) continue;
      maxSim = Math.max(maxSim, this.getColorSimilarity(anchor, newColor));
    }
    return maxSim;
  }

  _preserveFrozenHstMacroShardInsteadOfRegularFallback(block, reason) {
    if (!this._isFrozenHstMacroShard(block)) return null;
    block.macroHstSplitExhausted = true;
    console.log(`🎯 HST FREEZE: Frozen triangle shard ${block.id || 'unknown'} is too tight to split; preserving boundary (${reason}).`);
    return [];
  }

  _frozenHstMacroMinSplitPart() {
    return 18;
  }

  _blockMeetsMacroAwareSplitArea(block) {
    if (!block) return false;
    const blockArea = Math.max(0, Number(block.width) || 0) * Math.max(0, Number(block.height) || 0);
    return blockArea > (this._isFrozenHstMacroShard(block) ? 400 : 1600);
  }

  _oversizedSplitAreaLimit() {
    const dims = Utils.getQuiltDimensions();
    const quiltW = Math.max(1, Number(dims?.width) || 1070);
    const quiltH = Math.max(1, Number(dims?.height) || 1340);
    const quiltArea = quiltW * quiltH;
    const avgBlockArea = quiltArea / Math.max(1, this.blocks.length || 1);
    return Math.min(
      quiltArea * SimpleQuiltEngine.OVERSIZED_SPLIT_MAX_AREA_FRACTION,
      avgBlockArea * SimpleQuiltEngine.OVERSIZED_SPLIT_MAX_AVG_BLOCK_MULTIPLIER
    );
  }

  _blockSizePressureScore(block) {
    if (!block) return 0;
    const area = Math.max(0, Number(block.width) || 0) * Math.max(0, Number(block.height) || 0);
    const limit = this._oversizedSplitAreaLimit();
    if (!(area > 0) || !(limit > 0)) return 0;
    return Math.min(1, Math.max(0, (area / limit) - 1));
  }

  _oversizedSplittableBlocks(blocks) {
    if ((this.blocks.length || 0) < SimpleQuiltEngine.OVERSIZED_SPLIT_START_BLOCKS) return [];
    return (Array.isArray(blocks) ? blocks : [])
      .filter((block) => this._blockSizePressureScore(block) > 0)
      .sort((a, b) => {
        const pressureDiff = this._blockSizePressureScore(b) - this._blockSizePressureScore(a);
        if (Math.abs(pressureDiff) > 1e-6) return pressureDiff;
        return ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0));
      });
  }

  _shouldForceOversizedSplit() {
    if ((this.blocks.length || 0) < SimpleQuiltEngine.OVERSIZED_SPLIT_START_BLOCKS) return false;
    const every = Math.max(1, SimpleQuiltEngine.OVERSIZED_SPLIT_EVERY_ADDS);
    return ((this.submissionCount + 1) % every) === 0;
  }

  _visualLayerIndexForBlock(block) {
    const explicit = Number(block?.visualLayerIndex);
    if (Number.isFinite(explicit)) return explicit;
    return 0;
  }

  _stampVisualLayerFromParent(children, parent) {
    if (!Array.isArray(children)) return children;
    const visualLayerIndex = this._visualLayerIndexForBlock(parent);
    children.forEach((child) => {
      if (child && typeof child === 'object') {
        child.visualLayerIndex = visualLayerIndex;
      }
    });
    return children;
  }

  _protectedAnchorCandidateBlocks(relaxAreaCap = false) {
    const dims = Utils.getQuiltDimensions();
    const quiltArea = Math.max(1, (Number(dims?.width) || 1070) * (Number(dims?.height) || 1340));
    const minArea = quiltArea * SimpleQuiltEngine.PROTECTED_ANCHOR_MIN_AREA_FRACTION;
    const maxArea = quiltArea * SimpleQuiltEngine.PROTECTED_ANCHOR_MAX_AREA_FRACTION;
    return this.blocks
      .filter((block) => {
        if (!block || this._isProtectedAnchorBlock(block)) return false;
        const area = Math.max(0, Number(block.width) || 0) * Math.max(0, Number(block.height) || 0);
        if (area < minArea) return false;
        if (!relaxAreaCap && area > maxArea) return false;
        if (block.patternType === 'special' && block.specialPatternType !== 'diagonalAxis') return false;
        return this._isBlockSafelySplittableForFrozenMacro(block);
      })
      .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  }

  _maybeChooseProtectedAnchorAfterMutation() {
    if (this._hasProtectedAnchor()) return null;
    const minPick = SimpleQuiltEngine.PROTECTED_ANCHOR_PICK_MIN_SUBMISSION;
    const maxPick = SimpleQuiltEngine.PROTECTED_ANCHOR_PICK_MAX_SUBMISSION;
    if (this.submissionCount < minPick || this.submissionCount > maxPick) return null;
    if (this.submissionCount < this.protectedAnchorTargetSubmission) return null;

    let candidates = this._protectedAnchorCandidateBlocks(false);
    if (!candidates.length && this.submissionCount >= maxPick) {
      candidates = this._protectedAnchorCandidateBlocks(true);
    }
    if (!candidates.length) return null;

    const top = candidates.slice(0, Math.min(4, candidates.length));
    const anchor = top[Math.floor(Math.random() * top.length)];
    const safeId = String(anchor.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28) || 'shape';
    const anchorId = `anchor_${this.submissionCount}_${safeId}`;
    anchor.protectedAnchorId = anchorId;
    anchor.protectedAnchorRootId = anchor.id;
    console.log(`🛡️ PROTECTED ANCHOR: ${anchor.id} selected at submission ${this.submissionCount}`);
    return anchor;
  }

  _isBlockSafelySplittableForFrozenMacro(block) {
    if (!block) return false;
    if (this._isInsetCirclePreFreezeSplitCapped(block)) return false;
    if (!this.macroStructureFrozen) return true;
    if (block.macroHstSplitExhausted === true) return false;
    if (this._isFrozenHstMacroShard(block)) {
      const w = Number(block.width);
      const h = Number(block.height);
      if (!(w > 0 && h > 0)) return false;
      return (w > h ? w : h) >= this._frozenHstMacroMinSplitPart() * 2;
    }
    return true;
  }

  _routeSplittableBlocksByMacroColor(newColor, candidateBlocks) {
    if (!this.macroStructureFrozen || !Array.isArray(candidateBlocks) || candidateBlocks.length <= 1) {
      return candidateBlocks;
    }
    const groups = new Map();
    candidateBlocks.forEach((block) => {
      if (!block || block.macroRegionId == null) return;
      const key = String(block.macroRegionId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(block);
    });
    if (!groups.size) return candidateBlocks;

    const ranked = [...groups.entries()]
      .map(([regionId, blocks]) => {
        const anchor =
          blocks.find((b) => typeof b.macroFrozenColor === 'string' && b.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/))
            ?.macroFrozenColor || blocks[0]?.color;
        const similarity =
          typeof anchor === 'string' && anchor.match(/^#[0-9A-Fa-f]{6}$/)
            ? this.getColorSimilarity(anchor, newColor)
            : -1;
        const anchorL = this._oklabLightnessForHex(anchor);
        const newL = this._oklabLightnessForHex(newColor);
        const valueDistance =
          anchorL != null && newL != null
            ? Math.abs(anchorL - newL)
            : Number.POSITIVE_INFINITY;
        const anchorHue = this._oklabHueProfileForHex(anchor);
        const newHue = this._oklabHueProfileForHex(newColor);
        const hueDistance = this._oklabHueDistance(anchorHue, newHue);
        const area = blocks.reduce((sum, b) => sum + Math.max(0, Number(b.width) || 0) * Math.max(0, Number(b.height) || 0), 0);
        const protectedSpecial = blocks.some((b) => this._isProtectedSpecialMacroRegionBlock(b));
        const protectedNeighborSimilarity = protectedSpecial
          ? -1
          : blocks.reduce((maxSim, b) => Math.max(maxSim, this._protectedSpecialNeighborSimilarity(b, newColor)), -1);
        return { regionId, blocks, similarity, valueDistance, hueDistance, newChroma: newHue?.chroma ?? 0, area, protectedSpecial, protectedNeighborSimilarity };
      })
      .filter((entry) => entry.blocks.length)
      .sort((a, b) => {
        if (Math.abs(b.similarity - a.similarity) > 1e-6) return b.similarity - a.similarity;
        return b.area - a.area;
      });
    if (!ranked.length) return candidateBlocks;
    const protectedFloor = this._protectedSpecialMacroColorSimilarityMin();
    const boundaryMax = this._protectedSpecialBoundarySimilarityMax();
    const safeNonProtected = ranked.filter(
      (entry) => !entry.protectedSpecial && entry.protectedNeighborSimilarity < boundaryMax
    );
    const nonProtected = ranked.filter((entry) => !entry.protectedSpecial);
    const strongRegularFloor = this._macroRegularStrongColorSimilarityMin();
    const strongSafeNonProtected = safeNonProtected.filter((entry) => entry.similarity >= strongRegularFloor);
    const hasStrictColorMatch = ranked.some((entry) => entry.similarity >= protectedFloor);
    const useValueFallback = this.blocks.length >= this._macroValueRoutingStartBlocks();
    const valueRankedSafeNonProtected = [...safeNonProtected].sort((a, b) => {
      if (Math.abs(a.valueDistance - b.valueDistance) > 1e-6) return a.valueDistance - b.valueDistance;
      if (Math.abs(b.similarity - a.similarity) > 1e-6) return b.similarity - a.similarity;
      return b.area - a.area;
    });
    const hueRankedSafeNonProtected = [...safeNonProtected].sort((a, b) => {
      if (Math.abs(a.hueDistance - b.hueDistance) > 1e-6) return a.hueDistance - b.hueDistance;
      if (Math.abs(a.valueDistance - b.valueDistance) > 1e-6) return a.valueDistance - b.valueDistance;
      return b.area - a.area;
    });
    const newColorIsSaturated = (ranked[0]?.newChroma || 0) >= this._macroSaturatedColorChromaMin();
    const hueMatchedSafeNonProtected = hueRankedSafeNonProtected.filter(
      (entry) => entry.hueDistance <= this._macroHueFallbackMaxDistance()
    );
    const useHueFallback = useValueFallback && newColorIsSaturated;
    const useNeutralValueFallback = useValueFallback && !newColorIsSaturated;
    const bestNonProtected = safeNonProtected[0] || nonProtected[0] || null;
    const matchingProtected = ranked.filter((entry) => {
      if (!entry.protectedSpecial || entry.similarity < protectedFloor) return false;
      if (newColorIsSaturated && entry.hueDistance > this._macroHueFallbackMaxDistance()) return false;
      if (!bestNonProtected) return true;
      return entry.similarity >= bestNonProtected.similarity - this._protectedSpecialCompetitiveSimilarityMargin();
    });
    const eligible = !hasStrictColorMatch
      ? (valueRankedSafeNonProtected.length ? valueRankedSafeNonProtected : nonProtected.length ? nonProtected : ranked)
      : matchingProtected.length
      ? matchingProtected
      : strongSafeNonProtected.length
        ? strongSafeNonProtected
        : useHueFallback && hueMatchedSafeNonProtected.length
          ? hueMatchedSafeNonProtected
          : useNeutralValueFallback && valueRankedSafeNonProtected.length
            ? valueRankedSafeNonProtected
            : safeNonProtected.length
              ? safeNonProtected
              : nonProtected.length
                ? nonProtected
                : ranked;
    const selected = eligible[0];
    console.log(
      `🎯 MACRO COLOR ROUTE: ${newColor} → region ${selected.regionId} (similarity ${selected.similarity.toFixed(3)}, ${selected.blocks.length} candidate blocks)`
    );
    return selected.blocks;
  }

  /**
   * At macro freeze, replace each unified HST cell (two triangles in one block) with two blocks that each
   * carry a single clipped triangle in local coords—so later splits cannot strip both halves via one regular split.
   * Uses exact geometry from Utils.getHstRenderTriangles (not organic jitter); first shard keeps parent id for contributions.
   */
  _explodeHstBlocksIntoIndependentTriangleShardsAtMacroFreeze() {
    const out = [];
    let explodedParentCount = 0;
    for (const block of this.blocks) {
      if (
        !block ||
        block.patternType !== 'special' ||
        block.specialPatternType !== 'hst'
      ) {
        out.push(block);
        continue;
      }
      const tris = Utils.getHstRenderTriangles(block);
      if (!Array.isArray(tris) || tris.length !== 2) {
        out.push(block);
        continue;
      }
      const bx = Number(block.x);
      const by = Number(block.y);
      const bw = Number(block.width);
      const bh = Number(block.height);
      if (!(bw > 0 && bh > 0)) {
        out.push(block);
        continue;
      }
      const baseOrig = block.originalPatternId || block.id;
      const mkShard = (tri, shardSuffix, shardId) => {
        const pts = (tri.points || []).map((p) => [
          Number(Array.isArray(p) ? p[0] : p.x),
          Number(Array.isArray(p) ? p[1] : p.y)
        ]);
        if (pts.length < 3) return null;
        const fill = typeof tri.color === 'string' ? tri.color : block.color;
        return {
          id: shardId,
          x: bx,
          y: by,
          width: bw,
          height: bh,
          color: fill,
          patternType: 'special',
          specialPatternType: 'hst',
          hstTriangles: [{ color: fill, points: pts }],
          contributorId: block.contributorId,
          contributorIds: Array.isArray(block.contributorIds)
            ? [...block.contributorIds]
            : undefined,
          submissionIndex: block.submissionIndex,
          originalPatternId: `${baseOrig}__freezeShard_${shardSuffix}`
        };
      };
      const idA = String(block.id != null ? block.id : `hst_${Date.now()}`);
      const idB = `${idA}__freezeTriB`;
      const a = mkShard(tris[0], 'a', idA);
      const b = mkShard(tris[1], 'b', idB);
      if (!a || !b) {
        out.push(block);
        continue;
      }
      out.push(a, b);
      explodedParentCount++;
    }
    this.blocks = out;
    return explodedParentCount;
  }

  _polygonSignedArea(points) {
    let area = 0;
    const pts = points || [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      area += (Number(a?.[0]) || 0) * (Number(b?.[1]) || 0) - (Number(b?.[0]) || 0) * (Number(a?.[1]) || 0);
    }
    return area / 2;
  }

  _polygonArea(points) {
    return Math.abs(this._polygonSignedArea(points));
  }

  _coloredPolygonArea(pieces) {
    return (pieces || []).reduce((sum, piece) => sum + this._polygonArea(piece.points || []), 0);
  }

  _blockRectWorldPiece(block) {
    const x = Number(block?.x);
    const y = Number(block?.y);
    const w = Number(block?.width);
    const h = Number(block?.height);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return [];
    return [{
      color: block.color,
      points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    }];
  }

  _blockCanonicalWorldPiecesForMacroFreeze(block) {
    if (!block) return [];
    if (Array.isArray(block.polygonPieces) && block.polygonPieces.length) {
      return this._polygonPiecesWorld(block).filter((piece) => (piece.points || []).length >= 3);
    }
    if (block.patternType === 'special' && block.specialPatternType === 'hst') {
      const tris = Utils.getHstRenderTriangles(block);
      if (Array.isArray(tris) && tris.length) {
        const bx = Number(block.x) || 0;
        const by = Number(block.y) || 0;
        const pieces = tris
          .map((tri) => ({
            color: tri.color || block.color,
            points: (tri.points || []).map((p) => [
              bx + Number(Array.isArray(p) ? p[0] : p?.x),
              by + Number(Array.isArray(p) ? p[1] : p?.y)
            ])
          }))
          .filter((piece) => piece.points.length >= 3);
        if (pieces.length) return pieces;
      }
    }
    return this._blockRectWorldPiece(block);
  }

  _clipConvexPolygonByDirectedEdge(poly, a, b, keepInside, orientationSign) {
    const sign = orientationSign >= 0 ? 1 : -1;
    const side = (pt) => sign * ((b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]));
    return this._clipConvexPolygonHalfPlane(
      poly,
      (pt) => keepInside ? side(pt) >= -1e-9 : side(pt) <= 1e-9,
      (p0, p1) => {
        const d0 = side(p0);
        const d1 = side(p1);
        const denom = d0 - d1;
        if (Math.abs(denom) < 1e-9) return null;
        const t = d0 / denom;
        if (t < -1e-6 || t > 1 + 1e-6) return null;
        return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
      }
    );
  }

  _subtractConvexCoverFromPiece(subjectPiece, coverPiece) {
    const cover = (coverPiece?.points || []).filter((p) => Number.isFinite(Number(p?.[0])) && Number.isFinite(Number(p?.[1])));
    const subject = (subjectPiece?.points || []).filter((p) => Number.isFinite(Number(p?.[0])) && Number.isFinite(Number(p?.[1])));
    if (cover.length < 3 || subject.length < 3) return subject.length >= 3 ? [subjectPiece] : [];
    const orientation = this._polygonSignedArea(cover) >= 0 ? 1 : -1;
    let remainders = [{ color: subjectPiece.color, points: subject }];
    const outsidePieces = [];
    for (let i = 0; i < cover.length; i++) {
      const a = cover[i];
      const b = cover[(i + 1) % cover.length];
      const nextRemainders = [];
      remainders.forEach((piece) => {
        const inside = this._clipConvexPolygonByDirectedEdge(piece.points, a, b, true, orientation);
        const outside = this._clipConvexPolygonByDirectedEdge(piece.points, a, b, false, orientation);
        if (outside.length >= 3 && this._polygonArea(outside) > 0.5) {
          outsidePieces.push({ color: piece.color, points: outside });
        }
        if (inside.length >= 3 && this._polygonArea(inside) > 0.5) {
          nextRemainders.push({ color: piece.color, points: inside });
        }
      });
      remainders = nextRemainders;
      if (!remainders.length) break;
    }
    return outsidePieces;
  }

  _subtractCoverPiecesFromPieces(subjectPieces, coverPieces) {
    let visible = (subjectPieces || []).map((piece) => ({
      color: piece.color,
      points: (piece.points || []).map((p) => [Number(p[0]), Number(p[1])])
    }));
    (coverPieces || []).forEach((cover) => {
      const next = [];
      visible.forEach((piece) => {
        next.push(...this._subtractConvexCoverFromPiece(piece, cover));
      });
      visible = next;
    });
    return visible.filter((piece) => (piece.points || []).length >= 3 && this._polygonArea(piece.points) > 0.5);
  }

  _macroFreezeRenderOrder(blocks) {
    return [...(blocks || [])]
      .map((block, originalIndex) => ({ block, originalIndex }))
      .sort((a, b) => {
        const protectedA = this._isProtectedAnchorBlock(a.block);
        const protectedB = this._isProtectedAnchorBlock(b.block);
        if (protectedA !== protectedB) return protectedA ? 1 : -1;
        const layerA = this._visualLayerIndexForBlock(a.block);
        const layerB = this._visualLayerIndexForBlock(b.block);
        if (Math.abs(layerA - layerB) > 1e-6) return layerA - layerB;
        return a.originalIndex - b.originalIndex;
      });
  }

  _flattenMacroFreezeToVisibleOwnership() {
    const ordered = this._macroFreezeRenderOrder(this.blocks);
    const visibleById = new Map();
    let coveredPieces = [];
    const cloneWorldPieces = (pieces) =>
      (pieces || []).map((piece) => ({
        color: piece.color,
        points: (piece.points || []).map((p) => [Number(p[0]), Number(p[1])])
      }));
    for (let i = ordered.length - 1; i >= 0; i--) {
      const block = ordered[i].block;
      const originalPieces = this._blockCanonicalWorldPiecesForMacroFreeze(block);
      if (!originalPieces.length) continue;
      const visiblePieces = this._subtractCoverPiecesFromPieces(originalPieces, coveredPieces);
      const origArea = this._coloredPolygonArea(originalPieces);
      let finalPieces = visiblePieces;
      let clipped = this._coloredPolygonArea(visiblePieces) < origArea - 1;
      if (!visiblePieces.length || this._coloredPolygonArea(visiblePieces) < 1) {
        // Subtraction can wipe a leaf when overlap math / ordering disagrees with real paint;
        // dropping the block leaves warm-paper "voids" that never accept new splits.
        finalPieces = cloneWorldPieces(originalPieces);
        clipped = false;
      }
      visibleById.set(block.id, {
        pieces: finalPieces,
        clipped
      });
      coveredPieces = coveredPieces.concat(finalPieces);
    }

    this.blocks = this.blocks
      .map((block) => {
        const visible = visibleById.get(block?.id);
        if (!visible) return null;
        if (!visible.clipped && !Array.isArray(block.polygonPieces)) return block;
        const bounds = this._polygonWorldBounds(visible.pieces);
        if (!bounds) return null;
        const out = {
          ...block,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          patternType: 'regular',
          specialPatternType: 'diagonalAxis',
          originalPatternId: block.originalPatternId || block.id,
          polygonPieces: this._localPolygonPiecesFromWorldPieces(visible.pieces, bounds),
          diagonalAxisUx: Number.isFinite(Number(block.diagonalAxisUx)) ? Number(block.diagonalAxisUx) : 1,
          diagonalAxisUy: Number.isFinite(Number(block.diagonalAxisUy)) ? Number(block.diagonalAxisUy) : 0,
          macroVisibleFlattened: true,
          macroOriginalBounds: {
            x: Number(block.x),
            y: Number(block.y),
            width: Number(block.width),
            height: Number(block.height)
          }
        };
        if (block.specialPatternType === 'diagonalAxis') {
          out.macroVisibleFlattened = true;
        }
        delete out.hstTriangles;
        delete out.insetCx;
        delete out.insetCy;
        delete out.insetR;
        delete out.insetInnerColor;
        return out;
      })
      .filter(Boolean);
  }

  _assignSortedMacroRegionIdsToLeaves() {
    const sorted = [...this.blocks].sort((p, q) => {
      const dy = (Number(p.y) || 0) - (Number(q.y) || 0);
      if (Math.abs(dy) > 1e-6) return dy;
      const dx = (Number(p.x) || 0) - (Number(q.x) || 0);
      if (Math.abs(dx) > 1e-6) return dx;
      return String(p.id || '').localeCompare(String(q.id || ''));
    });
    sorted.forEach((blk, idx) => {
      blk.macroRegionId = idx + 1;
    });
  }

  _applyMacroStructureFreeze() {
    if (this.macroStructureFrozen) return;
    this.macroFreezeHstParentsExplodedCount = this._explodeHstBlocksIntoIndependentTriangleShardsAtMacroFreeze();
    this._flattenMacroFreezeToVisibleOwnership();
    this._assignSortedMacroRegionIdsToLeaves();
    this._stampMacroFrozenMetadataOnLeaves();
    this.macroStructureFrozen = true;
  }

  /** Call after splits/merges when growing an unfrozen quilt. */
  maybeApplyMacroStructureFreezeAfterMutation() {
    if (this.macroStructureFrozen) return;
    const n = this.blocks.length;
    if (n < SimpleQuiltEngine.MACRO_FREEZE_AT_BLOCK_COUNT) return;
    if (n > SimpleQuiltEngine.MACRO_FREEZE_SNAPSHOT_MAX_BLOCKS) return;
    this._applyMacroStructureFreeze();
  }

  hydrateMacroFreezeFromPersistence(wasFrozen) {
    if (wasFrozen === true) this.macroStructureFrozen = true;
  }

  /** One-time snapshot after loading legacy quilts that are already in the freeze window but have no ids yet. */
  maybeApplyMacroFreezeAfterHydrate() {
    if (this.macroStructureFrozen) return;
    if (this.blocks.some((b) => b && b.macroRegionId != null)) return;
    const n = this.blocks.length;
    if (n < SimpleQuiltEngine.MACRO_FREEZE_AT_BLOCK_COUNT) return;
    if (n > SimpleQuiltEngine.MACRO_FREEZE_SNAPSHOT_MAX_BLOCKS) return;
    this._applyMacroStructureFreeze();
  }

  /** Frozen docs from older saves may lack macroRegionId; re-assign deterministically without toggling freeze. */
  repairMacroRegionIdsAfterLoadIfFrozen() {
    if (!this.macroStructureFrozen || !this.blocks.length) return;
    const idsComplete = this.blocks.every(
      (b) => b && typeof b.macroRegionId === 'number' && Number.isFinite(b.macroRegionId)
    );
    if (!idsComplete) this._assignSortedMacroRegionIdsToLeaves();
    const metadataByRegion = new Map();
    this.blocks.forEach((block) => {
      if (!block || block.macroRegionId == null) return;
      const key = String(block.macroRegionId);
      const existing = metadataByRegion.get(key) || {};
      const outline = this._normalizeMacroFrozenOutline(block.macroFrozenOutline);
      if (outline && !existing.outline) existing.outline = outline;
      if (
        typeof block.macroFrozenColor === 'string' &&
        block.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/) &&
        !existing.color
      ) {
        existing.color = block.macroFrozenColor;
      }
      metadataByRegion.set(key, existing);
    });
    this.blocks.forEach((block) => {
      if (!block || block.macroRegionId == null) return;
      const regionMeta = metadataByRegion.get(String(block.macroRegionId)) || {};
      const outline =
        this._normalizeMacroFrozenOutline(block.macroFrozenOutline) ||
        regionMeta.outline ||
        this._buildMacroFrozenOutline(block);
      if (outline) block.macroFrozenOutline = outline;
      if (typeof block.macroFrozenColor !== 'string' || !block.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)) {
        if (regionMeta.color) {
          block.macroFrozenColor = regionMeta.color;
        } else if (
          block.patternType === 'special' &&
          block.specialPatternType === 'insetCircle' &&
          typeof block.insetInnerColor === 'string' &&
          block.insetInnerColor.match(/^#[0-9A-Fa-f]{6}$/)
        ) {
          block.macroFrozenColor = block.insetInnerColor;
        } else if (typeof block.color === 'string' && block.color.match(/^#[0-9A-Fa-f]{6}$/)) {
          block.macroFrozenColor = block.color;
        }
      }
    });
  }

  _mergeEligibleRegularBlock(block) {
    if (!block) return false;
    if (block.patternType === 'special') return false;
    if (block.specialPatternType) return false;
    if (SimpleQuiltEngine.hasPersistedInsetCircleGeometry(block)) return false;
    return true;
  }

  _isRecentMergeProtectedBlock(block) {
    const si = Number(block?.submissionIndex) || 0;
    if (si <= 0 || this.submissionCount <= 0) return false;
    const age = this.submissionCount - si;
    return age >= 0 && age <= SimpleQuiltEngine.RECENT_VISIBLE_SUBMISSION_WINDOW;
  }

  _mergeContributorIdsFromBlocks(a, b) {
    const ordered = [a, b].sort(
      (p, q) => (Number(p.submissionIndex) || 0) - (Number(q.submissionIndex) || 0)
    );
    const out = [];
    const push = (id) => {
      const s = id != null ? String(id).trim() : '';
      if (s && !out.includes(s)) out.push(s);
    };
    ordered.forEach((blk) => {
      if (Array.isArray(blk.contributorIds)) blk.contributorIds.forEach(push);
      else push(blk.contributorId);
    });
    return out;
  }

  _boundsSnapshot(block) {
    if (!block) return null;
    const x = Number(block.x);
    const y = Number(block.y);
    const width = Number(block.width);
    const height = Number(block.height);
    if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
      return { x, y, width, height };
    }
    return null;
  }

  _backsideRestoreMetadataForExistingPatch(block) {
    const bounds = this._normalizeMacroOriginalBounds(block?.backsideRestoreBounds) || this._boundsSnapshot(block);
    if (!block || !bounds) return {};
    return {
      backsideRestoreId: block.backsideRestoreId || block.id,
      backsideRestoreBounds: bounds,
      backsideRestoreColor: block.backsideRestoreColor || block.color
    };
  }

  _backsideRestoreMetadataForNewPatch(block) {
    const bounds = this._boundsSnapshot(block);
    if (!block || !bounds) return {};
    return {
      backsideRestoreId: block.id,
      backsideRestoreBounds: bounds,
      backsideRestoreColor: block.color
    };
  }

  _mergeTwoRegularBlocks(a, b) {
    const eps = SimpleQuiltEngine.MERGE_EPS_PX;
    const ids = this._mergeContributorIdsFromBlocks(a, b);
    let x;
    let y;
    let w;
    let h;
    if (
      Math.abs(a.x + a.width - b.x) < eps &&
      Math.abs(a.y - b.y) < eps &&
      Math.abs(a.height - b.height) < eps
    ) {
      x = a.x;
      y = a.y;
      w = a.width + b.width;
      h = a.height;
    } else if (
      Math.abs(b.x + b.width - a.x) < eps &&
      Math.abs(a.y - b.y) < eps &&
      Math.abs(a.height - b.height) < eps
    ) {
      x = b.x;
      y = b.y;
      w = a.width + b.width;
      h = a.height;
    } else if (
      Math.abs(a.y + a.height - b.y) < eps &&
      Math.abs(a.x - b.x) < eps &&
      Math.abs(a.width - b.width) < eps
    ) {
      x = a.x;
      y = a.y;
      w = a.width;
      h = a.height + b.height;
    } else if (
      Math.abs(b.y + b.height - a.y) < eps &&
      Math.abs(a.x - b.x) < eps &&
      Math.abs(a.width - b.width) < eps
    ) {
      x = a.x;
      y = b.y;
      w = a.width;
      h = a.height + b.height;
    } else {
      return null;
    }
    const siA = Number(a.submissionIndex) || 0;
    const siB = Number(b.submissionIndex) || 0;
    const mergedIds = ids.length ? ids : [String(this.deviceId)];
    const macroId =
      a.macroRegionId != null ? a.macroRegionId : b.macroRegionId != null ? b.macroRegionId : undefined;
    const macroOutline =
      this._normalizeMacroFrozenOutline(a.macroFrozenOutline) ||
      this._normalizeMacroFrozenOutline(b.macroFrozenOutline);
    const macroColor =
      typeof a.macroFrozenColor === 'string' && a.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)
        ? a.macroFrozenColor
        : typeof b.macroFrozenColor === 'string' && b.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)
          ? b.macroFrozenColor
          : undefined;
    return {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      x,
      y,
      width: w,
      height: h,
      color: siA >= siB ? a.color : b.color,
      patternType: 'regular',
      contributorId: mergedIds[mergedIds.length - 1],
      contributorIds: mergedIds,
      submissionIndex: Math.max(siA, siB),
      visualLayerIndex: this._visualLayerIndexForBlock(a),
      ...(a.protectedAnchorId != null ? { protectedAnchorId: String(a.protectedAnchorId) } : {}),
      ...(a.protectedAnchorRootId != null ? { protectedAnchorRootId: String(a.protectedAnchorRootId) } : {}),
      ...(macroId != null ? { macroRegionId: macroId } : {}),
      ...(macroColor ? { macroFrozenColor: macroColor } : {}),
      ...(macroOutline ? { macroFrozenOutline: macroOutline } : {}),
      ...((a.macroVisibleFlattened === true || b.macroVisibleFlattened === true) ? { macroVisibleFlattened: true } : {}),
      ...(this._normalizeMacroOriginalBounds(a.macroOriginalBounds) || this._normalizeMacroOriginalBounds(b.macroOriginalBounds)
        ? { macroOriginalBounds: this._normalizeMacroOriginalBounds(a.macroOriginalBounds) || this._normalizeMacroOriginalBounds(b.macroOriginalBounds) }
        : {})
    };
  }

  remapContributionBlockIds(oldIds, newId) {
    // Simulator never touches persisted contributions / remap payloads.
    if (String(this.deviceId || '').startsWith('admin-sim')) return;
    const oldSet = new Set((oldIds || []).map(String));
    if (!oldSet.size || !newId) return;
    const remapPayload = (payload) => {
      if (!payload?.submissions) return;
      payload.submissions.forEach((c) => {
        if (c && oldSet.has(String(c.blockId))) c.blockId = newId;
      });
    };
    for (const key of ['quiltContributions', 'quiltContributionsLifetime']) {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : { submissions: [] };
        if (!Array.isArray(parsed.submissions)) parsed.submissions = [];
        remapPayload(parsed);
        localStorage.setItem(key, JSON.stringify(parsed));
      } catch (_) {
        /* ignore */
      }
    }
    try {
      const latest = localStorage.getItem('ourDailyLatestDedicatedBlockId');
      if (latest && oldSet.has(String(latest))) {
        localStorage.setItem('ourDailyLatestDedicatedBlockId', String(newId));
      }
    } catch (_) {
      /* ignore */
    }
    try {
      window.dispatchEvent(
        new CustomEvent('odq-contribution-block-remap', {
          detail: { oldIds: [...oldSet], newId: String(newId) }
        })
      );
    } catch (_) {
      /* ignore */
    }
  }

  swapContributionBlockIdsForColorSettling(aId, bId) {
    // Simulator snapshots do not own persisted contribution pointers.
    if (String(this.deviceId || '').startsWith('admin-sim')) return;
    const idA = aId != null ? String(aId) : '';
    const idB = bId != null ? String(bId) : '';
    if (!idA || !idB || idA === idB) return;
    const swapPayload = (payload) => {
      if (!payload?.submissions) return;
      payload.submissions.forEach((c) => {
        if (!c) return;
        const blockId = String(c.blockId || '');
        if (blockId === idA) c.blockId = idB;
        else if (blockId === idB) c.blockId = idA;
      });
    };
    for (const key of ['quiltContributions', 'quiltContributionsLifetime']) {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : { submissions: [] };
        if (!Array.isArray(parsed.submissions)) parsed.submissions = [];
        swapPayload(parsed);
        localStorage.setItem(key, JSON.stringify(parsed));
      } catch (_) {
        /* ignore */
      }
    }
    try {
      const latest = localStorage.getItem('ourDailyLatestDedicatedBlockId');
      if (latest === idA) localStorage.setItem('ourDailyLatestDedicatedBlockId', idB);
      else if (latest === idB) localStorage.setItem('ourDailyLatestDedicatedBlockId', idA);
    } catch (_) {
      /* ignore */
    }
    try {
      window.dispatchEvent(
        new CustomEvent('odq-contribution-block-swap', {
          detail: { aId: idA, bId: idB }
        })
      );
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Merge adjacent regular rectangles when colors are similar — simplifies fragmentation and preserves provenance on merged cell.
   */
  runAdjacentSimilarMergePass() {
    // Simulator skips merge unless simulatorFullFidelity (much slower).
    if (String(this.deviceId || '').startsWith('admin-sim') && !this.simulatorFullFidelity) return false;
    const simMin = SimpleQuiltEngine.MERGE_COLOR_SIMILARITY_MIN;
    let mergedAny = false;
    for (let sweep = 0; sweep < 80; sweep++) {
      let pairMerged = false;
      const blocks = this.blocks;
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const A = blocks[i];
          const B = blocks[j];
          if (!this._mergeEligibleRegularBlock(A) || !this._mergeEligibleRegularBlock(B)) continue;
          if (this._isRecentMergeProtectedBlock(A) || this._isRecentMergeProtectedBlock(B)) continue;
          if (!this._visualLayersMergeCompatible(A, B)) continue;
          if (!this._protectedAnchorsMergeCompatible(A, B)) continue;
          if (!this._starterAxisRegionsMergeCompatible(A, B)) continue;
          if (!this._macroRegionsMergeCompatible(A, B)) continue;
          if (this.getColorSimilarity(A.color, B.color) < simMin) continue;
          const merged = this._mergeTwoRegularBlocks(A, B);
          if (!merged) continue;
          const ia = this.blocks.indexOf(A);
          const ib = this.blocks.indexOf(B);
          if (ia === -1 || ib === -1) continue;
          const hi = Math.max(ia, ib);
          const lo = Math.min(ia, ib);
          this.blocks.splice(hi, 1);
          this.blocks.splice(lo, 1, merged);
          this.remapContributionBlockIds([A.id, B.id], merged.id);
          mergedAny = pairMerged = true;
          break;
        }
        if (pairMerged) break;
      }
      if (!pairMerged) break;
    }
    return mergedAny;
  }

  _colorSettleStartBlocks() {
    return 700;
  }

  _colorSettleEveryAdds() {
    return 25;
  }

  _colorSettlingEnabled() {
    return true;
  }

  _colorSettlingEligibleBlock(block) {
    if (!this.macroStructureFrozen || !block) return false;
    if (this._isProtectedSpecialMacroRegionBlock(block)) return false;
    if (block.patternType === 'special') return false;
    if (block.specialPatternType) return false;
    if (SimpleQuiltEngine.hasPersistedInsetCircleGeometry(block)) return false;
    return typeof block.color === 'string' && block.color.match(/^#[0-9A-Fa-f]{6}$/);
  }

  _colorPacketForBlock(block) {
    return {
      color: block.color,
      contributorId: block.contributorId,
      contributorIds: Array.isArray(block.contributorIds) ? [...block.contributorIds] : undefined,
      submissionIndex: block.submissionIndex
    };
  }

  _applyColorPacketToBlock(block, packet) {
    block.color = packet.color;
    block.contributorId = packet.contributorId;
    if (Array.isArray(packet.contributorIds)) block.contributorIds = [...packet.contributorIds];
    else delete block.contributorIds;
    block.submissionIndex = packet.submissionIndex;
  }

  _neighborColorFitness(block, candidateColor, peers, eps) {
    let score = 0;
    let n = 0;
    for (const other of peers) {
      if (!other || other.id === block.id) continue;
      if (!this._sharesAxisAlignedFullEdge(block, other, eps)) continue;
      if (typeof other.color !== 'string' || !other.color.match(/^#[0-9A-Fa-f]{6}$/)) continue;
      score += this.getColorSimilarity(candidateColor, other.color);
      n++;
    }
    if (n === 0) return -0.25;
    return score / n;
  }

  runColorSettlingPass() {
    if (!this._colorSettlingEnabled()) return false;
    if (!this.macroStructureFrozen) return false;
    if (this.blocks.length < this._colorSettleStartBlocks()) return false;
    const every = this._colorSettleEveryAdds();
    if (every > 1 && (Math.floor(Number(this.submissionCount) || 0) % every) !== 0) return false;
    const eps = SimpleQuiltEngine.MERGE_EPS_PX * 2;
    let swapped = false;
    const byRegion = new Map();
    this.blocks.forEach((block) => {
      if (!this._colorSettlingEligibleBlock(block) || block.macroRegionId == null) return;
      const key = String(block.macroRegionId);
      if (!byRegion.has(key)) byRegion.set(key, []);
      byRegion.get(key).push(block);
    });

    for (const peers of byRegion.values()) {
      if (peers.length < 4) continue;
      const ordered = [...peers].sort((a, b) => (b.width * b.height) - (a.width * a.height));
      const limit = Math.min(20, ordered.length);
      for (let i = 0; i < limit; i++) {
        const a = ordered[i];
        let best = null;
        let bestGain = 0.08;
        const fitA = this._neighborColorFitness(a, a.color, peers, eps);
        for (let j = i + 1; j < ordered.length; j++) {
          const b = ordered[j];
          if (!b || a.id === b.id) continue;
          const fitB = this._neighborColorFitness(b, b.color, peers, eps);
          const swappedFit =
            this._neighborColorFitness(a, b.color, peers, eps) +
            this._neighborColorFitness(b, a.color, peers, eps);
          const currentFit = fitA + fitB;
          const gain = swappedFit - currentFit;
          if (gain > bestGain) {
            bestGain = gain;
            best = b;
          }
        }
        if (best) {
          const aPacket = this._colorPacketForBlock(a);
          const bPacket = this._colorPacketForBlock(best);
          this._applyColorPacketToBlock(a, bPacket);
          this._applyColorPacketToBlock(best, aPacket);
          this.swapContributionBlockIdsForColorSettling(a.id, best.id);
          swapped = true;
        }
      }
    }
    return swapped;
  }

  getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('quiltDeviceId');
    if (!deviceId) {
      deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('quiltDeviceId', deviceId);
    }
    return deviceId;
  }

  _starterAxisRatio(lo = 0.34, hi = 0.66) {
    return lo + Math.random() * (hi - lo);
  }

  /**
   * First starter-axis split used to keep `CONFIG.APP.defaultColor` on the non-contributor half.
   * That made every quilt start with the same pink. Use a tonal companion of the first pick instead.
   */
  _starterAxisNonContributorColor(firstPickHex) {
    if (typeof firstPickHex !== 'string' || !firstPickHex.match(/^#[0-9A-Fa-f]{6}$/)) {
      return typeof CONFIG !== 'undefined' && CONFIG.APP?.defaultColor
        ? CONFIG.APP.defaultColor
        : '#ea9b9a';
    }
    const hsl = this.hexToHsl(firstPickHex);
    const preferLighten = hsl.l < 58;
    const primary = preferLighten ? this.lightenColorHsl(hsl, 0.16) : this.darkenColorHsl(hsl, 0.11);
    let out = Utils.hslToHex(primary.h, primary.s, primary.l);
    if (typeof Utils.validateHexColor === 'function' && !Utils.validateHexColor(out)) {
      return firstPickHex;
    }
    if (this.getColorSimilarity(out, firstPickHex) > 0.88) {
      const alt = preferLighten ? this.darkenColorHsl(hsl, 0.11) : this.lightenColorHsl(hsl, 0.14);
      out = Utils.hslToHex(alt.h, alt.s, alt.l);
    }
    return typeof Utils.validateHexColor === 'function' && Utils.validateHexColor(out) ? out : firstPickHex;
  }

  _inferStarterAxisOrientation() {
    if (!Array.isArray(this.blocks) || this.blocks.length !== 2) return null;
    const [a, b] = this.blocks;
    const eps = SimpleQuiltEngine.MERGE_EPS_PX * 2;
    const sameY = Math.abs(a.y - b.y) <= eps && Math.abs(a.height - b.height) <= eps;
    const sameX = Math.abs(a.x - b.x) <= eps && Math.abs(a.width - b.width) <= eps;
    if (sameY) return 'vertical';
    if (sameX) return 'horizontal';
    return null;
  }

  _makeStarterAxisChild(parent, partial, color, submissionIndex, suffix) {
    const isNewColorChild = suffix === 'b';
    return {
      ...parent,
      ...partial,
      id: `${parent.id}_axis_${submissionIndex}_${suffix}`,
      color,
      contributorId: isNewColorChild ? this.deviceId : parent.contributorId,
      submissionIndex: isNewColorChild ? submissionIndex : parent.submissionIndex,
      visualLayerIndex: this._visualLayerIndexForBlock(parent),
      patternType: 'regular',
      starterAxisRegion: true,
      starterAxisRegionId: `${parent.starterAxisRegionId || parent.id}_axis_${submissionIndex}_${suffix}`
    };
  }

  /**
   * First human color of the day: fill the whole canvas (no split).
   */
  _tryApplyFirstSubmissionFill(newColor) {
    if (this.macroStructureFrozen) return null;
    if (this.submissionCount !== 0 || this.blocks.length !== 1) return null;
    const parent = this.blocks[0];
    const x = Number(parent?.x);
    const y = Number(parent?.y);
    const width = Number(parent?.width);
    const height = Number(parent?.height);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      return null;
    }
    const originalBlock = { ...parent };
    const nextSubmission = 1;
    parent.color = newColor;
    parent.contributorId = this.deviceId;
    parent.submissionIndex = nextSubmission;
    parent.patternType = parent.patternType || 'regular';
    delete parent.starterAxisRegion;
    delete parent.starterAxisRegionId;
    this.submissionCount = nextSubmission;
    this.recordUserContribution(parent.id, newColor, nextSubmission);
    return {
      originalBlock,
      newBlocks: [parent],
      dedicatedBlockId: parent.id,
      appliedColor: newColor,
      submissionIndex: nextSubmission
    };
  }

  _tryApplySubmissionAxis(newColor) {
    if (this.macroStructureFrozen) return null;
    if (this.submissionCount === 0 && this.blocks.length === 1) {
      const parent = this.blocks[0];
      const axisBase = this._starterAxisNonContributorColor(newColor);
      const parentTinted = { ...parent, color: axisBase };
      const nextSubmission = this.submissionCount + 1;
      this.submissionCount = nextSubmission;
      const axisBlocks = this.createDiagonalAxisPattern(parentTinted, newColor);
      if (
        Array.isArray(axisBlocks) &&
        axisBlocks.length === 2 &&
        axisBlocks.every((block) => block?.specialPatternType === 'diagonalAxis')
      ) {
        this.blocks = axisBlocks;
        this.recordUserContribution(axisBlocks[1].id, newColor, this.submissionCount);
        return {
          originalBlock: parent,
          newBlocks: axisBlocks,
          dedicatedBlockId: axisBlocks[1].id,
          appliedColor: newColor,
          submissionIndex: this.submissionCount
        };
      }
      this.submissionCount = 0;
      const vertical = Math.random() < 0.5;
      const ratio = this._starterAxisRatio();
      const children = vertical
        ? [
            this._makeStarterAxisChild(parent, { width: parent.width * ratio }, axisBase, nextSubmission, 'a'),
            this._makeStarterAxisChild(
              parent,
              { x: parent.x + parent.width * ratio, width: parent.width * (1 - ratio) },
              newColor,
              nextSubmission,
              'b'
            )
          ]
        : [
            this._makeStarterAxisChild(parent, { height: parent.height * ratio }, axisBase, nextSubmission, 'a'),
            this._makeStarterAxisChild(
              parent,
              { y: parent.y + parent.height * ratio, height: parent.height * (1 - ratio) },
              newColor,
              nextSubmission,
              'b'
            )
          ];
      this.submissionCount = nextSubmission;
      this.blocks = children;
      this.recordUserContribution(children[1].id, newColor, this.submissionCount);
      return {
        originalBlock: parent,
        newBlocks: children,
        dedicatedBlockId: children[1].id,
        appliedColor: newColor,
        submissionIndex: this.submissionCount
      };
    }

    if (this.submissionCount !== 1 || this.blocks.length !== 2) return null;
    if (Math.random() >= SimpleQuiltEngine.STARTER_AXIS_SECOND_LINE_CHANCE) return null;

    const firstOrientation = this._inferStarterAxisOrientation();
    if (!firstOrientation) return null;
    const secondOrientation = Math.random() < 0.62
      ? (firstOrientation === 'vertical' ? 'horizontal' : 'vertical')
      : firstOrientation;
    const nextSubmission = this.submissionCount + 1;
    const ratio = secondOrientation === firstOrientation
      ? this._starterAxisRatio(0.58, 0.76)
      : this._starterAxisRatio();
    const nextBlocks = [];
    const sortedBlocks = [...this.blocks].sort((a, b) => a.x - b.x || a.y - b.y);
    const leastSimilarToNewColor = (blocks) =>
      [...blocks].sort((a, b) => {
        const simA = this.getColorSimilarity(a.color, newColor);
        const simB = this.getColorSimilarity(b.color, newColor);
        if (Math.abs(simA - simB) > 1e-6) return simA - simB;
        return (b.width * b.height) - (a.width * a.height);
      })[0] || null;

    if (secondOrientation === 'vertical') {
      const target = firstOrientation === 'vertical' ? leastSimilarToNewColor(sortedBlocks) : null;
      sortedBlocks.forEach((block) => {
        if (target && block.id !== target.id) {
          nextBlocks.push(block);
          return;
        }
        const w1 = block.width * ratio;
        nextBlocks.push(this._makeStarterAxisChild(block, { width: w1 }, block.color, nextSubmission, 'a'));
        nextBlocks.push(this._makeStarterAxisChild(
          block,
          { x: block.x + w1, width: block.width - w1 },
          newColor,
          nextSubmission,
          'b'
        ));
      });
    } else {
      const target = firstOrientation === 'horizontal' ? leastSimilarToNewColor(sortedBlocks) : null;
      sortedBlocks.forEach((block) => {
        if (target && block.id !== target.id) {
          nextBlocks.push(block);
          return;
        }
        const h1 = block.height * ratio;
        nextBlocks.push(this._makeStarterAxisChild(block, { height: h1 }, block.color, nextSubmission, 'a'));
        nextBlocks.push(this._makeStarterAxisChild(
          block,
          { y: block.y + h1, height: block.height - h1 },
          newColor,
          nextSubmission,
          'b'
        ));
      });
    }

    const newContributionBlock = nextBlocks.find((block) => block.submissionIndex === nextSubmission && block.color === newColor) || nextBlocks[nextBlocks.length - 1];
    this.submissionCount = nextSubmission;
    this.blocks = nextBlocks;
    if (newContributionBlock) {
      this.recordUserContribution(newContributionBlock.id, newColor, this.submissionCount);
    }
    return {
      originalBlock: sortedBlocks[0],
      newBlocks: nextBlocks,
      dedicatedBlockId: newContributionBlock?.id || '',
      appliedColor: newColor,
      submissionIndex: this.submissionCount
    };
  }
  

  initialize() {
    // Use 4:5 dimensions from getQuiltDimensions
    const dimensions = Utils.getQuiltDimensions();
    const initialWidth = dimensions.width;
    const initialHeight = dimensions.height;
    
    
    this.blocks = [{
      id: 'initial',
      x: 0,
      y: 0,
      width: initialWidth,
      height: initialHeight,
      color: SimpleQuiltEngine.getEmptyDayPlaceholderColorHex(),
      contributorId: this.deviceId,
      submissionIndex: 0,
      visualLayerIndex: 0,
      patternType: 'regular'
    }];
    
    this.submissionCount = 0;
    this.colorReplayEvents = [];
    this.recordColorReplayEvents = false;
    this.macroStructureFrozen = false;
    this.macroFreezeHstParentsExplodedCount = 0;
    this.simulatorFullFidelity = false;
  }

  /** Plain block snapshot for persisted split replay (Firestore-safe). */
  _serializeBlockForReplay(block) {
    if (!block) return null;
    const o = {
      id: String(block.id != null ? block.id : ''),
      x: Number(block.x),
      y: Number(block.y),
      width: Number(block.width),
      height: Number(block.height),
      color: typeof block.color === 'string' ? block.color : '#c8c4bf'
    };
    if (block.patternType) o.patternType = block.patternType;
    if (block.originalPatternId) o.originalPatternId = block.originalPatternId;
    if (block.specialPatternType) o.specialPatternType = block.specialPatternType;
    if (block.backsideRestoreId != null) o.backsideRestoreId = String(block.backsideRestoreId);
    const backsideRestoreBounds = this._normalizeMacroOriginalBounds(block.backsideRestoreBounds);
    if (backsideRestoreBounds) o.backsideRestoreBounds = backsideRestoreBounds;
    if (typeof block.backsideRestoreColor === 'string') o.backsideRestoreColor = block.backsideRestoreColor;
    const specialOriginalBounds = this._normalizeMacroOriginalBounds(block.specialOriginalBounds);
    if (specialOriginalBounds) o.specialOriginalBounds = specialOriginalBounds;
    if (typeof block.specialOriginalColor === 'string') o.specialOriginalColor = block.specialOriginalColor;
    if (typeof block.specialOriginalInnerColor === 'string') o.specialOriginalInnerColor = block.specialOriginalInnerColor;
    if (typeof block.specialOriginalInsetR === 'number' && Number.isFinite(block.specialOriginalInsetR)) {
      o.specialOriginalInsetR = block.specialOriginalInsetR;
    }
    if (typeof block.hstColorB === 'string') o.hstColorB = block.hstColorB;
    if (typeof block.hstDiagonal === 'string') o.hstDiagonal = block.hstDiagonal;
    if (Array.isArray(block.hstTriangles) && block.hstTriangles.length) {
      o.hstTriangles = Utils.hstTrianglesForFirestore(block.hstTriangles);
    }
    if (Array.isArray(block.polygonPieces) && block.polygonPieces.length) {
      o.polygonPieces = Utils.polygonPiecesForFirestore(block.polygonPieces);
    }
    if (typeof block.diagonalAxisAccentColor === 'string') o.diagonalAxisAccentColor = block.diagonalAxisAccentColor;
    if (typeof block.diagonalAxisUx === 'number' && Number.isFinite(block.diagonalAxisUx)) o.diagonalAxisUx = block.diagonalAxisUx;
    if (typeof block.diagonalAxisUy === 'number' && Number.isFinite(block.diagonalAxisUy)) o.diagonalAxisUy = block.diagonalAxisUy;
    if (block.axisLayerMode === 'collage') o.axisLayerMode = 'collage';
    if (block.axisOriginId != null) o.axisOriginId = String(block.axisOriginId);
    if (block.axisSourceBlockId != null) o.axisSourceBlockId = String(block.axisSourceBlockId);
    if (typeof block.axisSourceSubmissionIndex === 'number' && Number.isFinite(block.axisSourceSubmissionIndex)) {
      o.axisSourceSubmissionIndex = block.axisSourceSubmissionIndex;
    }
    if (typeof block.insetTier === 'number') o.insetTier = block.insetTier;
    if (block.insetFrozen === true) o.insetFrozen = true;
    if (typeof block.insetInnerColor === 'string') o.insetInnerColor = block.insetInnerColor;
    if (typeof block.insetCx === 'number') o.insetCx = block.insetCx;
    if (typeof block.insetCy === 'number') o.insetCy = block.insetCy;
    if (typeof block.insetR === 'number') o.insetR = block.insetR;
    if (typeof block.insetMask === 'string') o.insetMask = block.insetMask;
    if (block.insetFirstCutVertical === true || block.insetFirstCutVertical === false) {
      o.insetFirstCutVertical = block.insetFirstCutVertical;
    }
    if (block.insetNextCutVertical === true || block.insetNextCutVertical === false) {
      o.insetNextCutVertical = block.insetNextCutVertical;
    }
    if (block.contributorId) o.contributorId = block.contributorId;
    if (Array.isArray(block.contributorIds) && block.contributorIds.length) {
      o.contributorIds = block.contributorIds.map((id) => String(id || '').trim()).filter(Boolean);
    }
    if (typeof block.submissionIndex === 'number') o.submissionIndex = block.submissionIndex;
    if (typeof block.visualLayerIndex === 'number' && Number.isFinite(block.visualLayerIndex)) {
      o.visualLayerIndex = block.visualLayerIndex;
    }
    if (block.protectedAnchorId != null) o.protectedAnchorId = String(block.protectedAnchorId);
    if (block.protectedAnchorRootId != null) o.protectedAnchorRootId = String(block.protectedAnchorRootId);
    if (block.starterAxisRegion === true) o.starterAxisRegion = true;
    if (block.starterAxisRegionId != null) o.starterAxisRegionId = String(block.starterAxisRegionId);
    if (typeof block.macroRegionId === 'number' && Number.isFinite(block.macroRegionId)) {
      o.macroRegionId = block.macroRegionId;
    }
    if (typeof block.macroFrozenColor === 'string' && block.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)) {
      o.macroFrozenColor = block.macroFrozenColor;
    }
    const macroOutline = this._normalizeMacroFrozenOutline(block.macroFrozenOutline);
    if (macroOutline) o.macroFrozenOutline = macroOutline;
    if (block.macroVisibleFlattened === true) o.macroVisibleFlattened = true;
    const macroOriginalBounds = this._normalizeMacroOriginalBounds(block.macroOriginalBounds);
    if (macroOriginalBounds) o.macroOriginalBounds = macroOriginalBounds;
    return o;
  }

  _stripHstFromSplitChildren(block1, block2, parent) {
    if (!parent || parent.specialPatternType !== 'hst') return;
    [block1, block2].forEach((b) => {
      if (!b) return;
      delete b.patternType;
      delete b.specialPatternType;
      delete b.hstColorB;
      delete b.hstDiagonal;
      delete b.hstTriangles;
      delete b.originalPatternId;
    });
  }

  _stripStripesFromSplitChildren(block1, block2, parent) {
    if (!parent || parent.specialPatternType !== 'stripes') return;
    if (this.macroStructureFrozen) return;
    [block1, block2].forEach((b) => {
      if (!b) return;
      if (SimpleQuiltEngine.hasPersistedInsetCircleGeometry(b)) {
        SimpleQuiltEngine.ensureInsetClassificationFromGeometry(b);
        return;
      }
      delete b.patternType;
      delete b.specialPatternType;
      delete b.originalPatternId;
    });
  }

  _hstFamilyBlockCount(block) {
    if (!block || block.specialPatternType !== 'hst') return 0;
    const familyId = block.originalPatternId || block.id;
    return this.blocks.filter((b) => (
      b &&
      b.specialPatternType === 'hst' &&
      (b.originalPatternId || b.id) === familyId
    )).length;
  }

  /**
   * Second inset-shard field: near parent fabric `color`, nudged ~15–28% toward the picker so corners
   * gain tonal variation without reading like a unrelated half (unlike plain `performRegularSplit`).
   */
  _insetAdjacentFieldColor(parentBg, pickerHex) {
    const bgRaw = typeof parentBg === 'string' && /^#[0-9a-f]{6}$/i.test(parentBg.trim())
      ? parentBg.trim()
      : '#c8c4bf';
    const hint =
      typeof pickerHex === 'string' && /^#[0-9a-f]{6}$/i.test(String(pickerHex).trim())
        ? String(pickerHex).trim()
        : bgRaw;
    const a = this.hexToHsl(bgRaw);
    const b = this.hexToHsl(hint);
    const t = 0.14 + Math.random() * 0.14;
    let hOut;
    let sOut;
    let lOut;
    const parentWeak = !(a.s > 3) || Number.isNaN(a.s);
    if (parentWeak) {
      lOut = Math.max(10, Math.min(90, a.l + (b.l - a.l) * t));
      hOut = a.h;
      sOut = Math.max(0, Math.min(100, a.s + (b.s - a.s) * t * 0.6));
    } else {
      const dh = ((b.h - a.h + 540) % 360) - 180;
      hOut = ((a.h + dh * t) % 360 + 360) % 360;
      sOut = Math.max(0, Math.min(100, a.s + (b.s - a.s) * t));
      lOut = Math.max(10, Math.min(90, a.l + (b.l - a.l) * t));
    }
    let out = Utils.hslToHex(hOut, sOut, lOut);
    if (typeof out !== 'string' || out.toLowerCase() === bgRaw.toLowerCase()) {
      const nudge = Math.random() < 0.5 ? this.lightenColorHsl(a, 0.045) : this.darkenColorHsl(a, 0.045);
      out = Utils.hslToHex(nudge.h, nudge.s, nudge.l);
    }
    return out;
  }

  /**
   * Regular split uses raw `newColor` on block2's field; inset uses tonal field split + picker-driven inner disk.
   */
  _applyInsetCircleRegularSplitChildren(parent, block1, block2, newColor) {
    if (!parent || parent.specialPatternType !== 'insetCircle' || !block1 || !block2) return;
    const bg = typeof parent.color === 'string' ? parent.color : '#c8c4bf';
    const inner1 =
      typeof parent.insetInnerColor === 'string' && parent.insetInnerColor.startsWith('#')
        ? parent.insetInnerColor
        : bg;
    const inner2 = this._ensureDistinctHstPartner(inner1, newColor);
    const tierNext = (parent.insetTier ?? 0) + 1;
    block1.color = bg;
    block2.color = this._insetAdjacentFieldColor(bg, newColor);
    block1.insetInnerColor = inner1;
    block2.insetInnerColor = inner2;
    block1.insetTier = tierNext;
    block2.insetTier = tierNext;
  }

  _blockMeetsHstGeometry(block) {
    if (!block || block.width <= 0 || block.height <= 0) return false;
    const minS = SimpleQuiltEngine.HST_ELIGIBLE_MIN_SHORT;
    const maxAr = SimpleQuiltEngine.HST_ELIGIBLE_MAX_ASPECT;
    const hstShort = Math.min(block.width, block.height);
    const hstLong = Math.max(block.width, block.height);
    const hstAr = hstLong / Math.max(1, hstShort);
    return hstShort >= minS && hstAr <= maxAr;
  }

  _blockMeetsInsetCircleGeometry(block) {
    if (!block || block.width <= 0 || block.height <= 0) return false;
    const blockArea = block.width * block.height;
    const insetShort = Math.min(block.width, block.height);
    const insetLong = Math.max(block.width, block.height);
    const insetAr = insetLong / Math.max(1, insetShort);
    return (
      insetShort >= SimpleQuiltEngine.INSET_CIRCLE_MIN_SHORT &&
      insetAr <= SimpleQuiltEngine.INSET_CIRCLE_MAX_ASPECT &&
      blockArea >= SimpleQuiltEngine.INSET_CIRCLE_MIN_AREA
    );
  }

  /**
   * Max allowed color similarity (field vs incoming) to keep an inset split.
   * Large min-side → lower cap (need more contrast); small pieces → allow near-matching colors.
   */
  _insetCircleMaxSimilarityForSplit(minSide) {
    const lo = SimpleQuiltEngine.INSET_SPLIT_SIM_SIDE_LO;
    const hi = SimpleQuiltEngine.INSET_SPLIT_SIM_SIDE_HI;
    const a = SimpleQuiltEngine.INSET_SPLIT_SIM_STRICT;
    const b = SimpleQuiltEngine.INSET_SPLIT_SIM_LOOSE;
    const s = Math.max(lo, Math.min(hi, minSide));
    const u = (hi - s) / (hi - lo);
    return a + (b - a) * u;
  }

  /** Next axis for inset split: vertical line vs horizontal. Prefers `insetNextCutVertical`; infers legacy blocks. */
  _resolveInsetNextCutVertical(block) {
    if (typeof block.insetNextCutVertical === 'boolean') {
      return block.insetNextCutVertical;
    }
    const tier = block.insetTier ?? 0;
    if (tier <= 0) {
      return Math.random() < 0.5;
    }
    if (block.insetFirstCutVertical !== true && block.insetFirstCutVertical !== false) {
      return Math.random() < 0.5;
    }
    const fv = block.insetFirstCutVertical === true;
    return fv === (tier % 2 === 0);
  }

  _isRegularQuiltCellForHstRoll(block) {
    if (!block) return false;
    if (block.patternType === 'special') return false;
    if (block.id && String(block.id).includes('_pattern_')) return false;
    if (block.originalPatternId) return false;
    return true;
  }

  /**
   * Whether another special may run this turn — same caps and early
   * back-to-back rule as the main special-pattern roulette, without its random %.
   */
  _anotherSpecialAllowedThisTurnBeforeSplit() {
    const uniquePatternIds = new Set();
    this.blocks.forEach((block) => {
      if (block.specialPatternType === 'diagonalAxis') {
        return;
      }
      if (block.originalPatternId) {
        uniquePatternIds.add(block.originalPatternId);
      } else if (block.patternType === 'special') {
        uniquePatternIds.add(block.id);
      }
    });
    const specialPatternsCreated = uniquePatternIds.size;
    const maxSpecialPatterns = Math.min(
      Math.max(2, Math.floor(this.submissionCount * 0.6)),
      Math.floor(this.submissionCount * 0.75)
    );
    const nextAddNumber = this.submissionCount + 1;
    if (nextAddNumber >= 2 && nextAddNumber <= 6) {
      const wasLastSplitSpecialPattern = this.blocks.some(
        (block) =>
          block.submissionIndex === this.submissionCount &&
          block.specialPatternType !== 'diagonalAxis' &&
          (block.patternType === 'special' || String(block.id || '').includes('_pattern_'))
      );
      if (wasLastSplitSpecialPattern) {
        return false;
      }
      return true;
    }
    if (specialPatternsCreated >= maxSpecialPatterns) {
      return false;
    }
    return nextAddNumber >= 7 && nextAddNumber <= 24;
  }

  getColorReplayEvents() {
    if (!this.recordColorReplayEvents) return [];
    const mapBlockForFirestore = (snap) => {
      if (!snap || typeof snap !== 'object') return snap;
      const o = { ...snap };
      const ft = Utils.hstTrianglesForFirestore(o.hstTriangles);
      if (ft) o.hstTriangles = ft;
      else delete o.hstTriangles;
      const fp = Utils.polygonPiecesForFirestore(o.polygonPieces);
      if (fp) o.polygonPieces = fp;
      else delete o.polygonPieces;
      return o;
    };
    return (this.colorReplayEvents || []).map((e) => ({
      seq: e.seq,
      iso: e.iso,
      newHex: e.newHex,
      parent: mapBlockForFirestore(e.parent),
      children: (e.children || []).map(mapBlockForFirestore)
    }));
  }

  setColorReplayEvents(events) {
    if (!this.recordColorReplayEvents) {
      this.colorReplayEvents = [];
      return;
    }
    if (!Array.isArray(events) || events.length === 0) {
      this.colorReplayEvents = [];
      return;
    }
    const mapBlockFromFirestore = (snap) => {
      if (!snap || typeof snap !== 'object') return snap;
      const o = { ...snap };
      const nt = Utils.normalizeHstTrianglesFromFirestore(o.hstTriangles);
      if (nt) o.hstTriangles = nt;
      else delete o.hstTriangles;
      const np = Utils.normalizePolygonPiecesFromFirestore(o.polygonPieces);
      if (np) o.polygonPieces = np;
      else delete o.polygonPieces;
      return o;
    };
    this.colorReplayEvents = events
      .filter((e) => e && e.parent && e.parent.id && Array.isArray(e.children) && e.children.length)
      .map((e) => ({
        seq: typeof e.seq === 'number' ? e.seq : 0,
        iso: typeof e.iso === 'string' ? e.iso : '',
        newHex: typeof e.newHex === 'string' ? e.newHex : '',
        parent: mapBlockFromFirestore(e.parent),
        children: e.children.map(mapBlockFromFirestore)
      }))
      .sort((a, b) => {
        if ((a.seq || 0) !== (b.seq || 0)) return (a.seq || 0) - (b.seq || 0);
        return String(a.iso || '').localeCompare(String(b.iso || ''));
      });
  }
  
  addSubmission() {
    this.submissionCount++;
    return this.submissionCount;
  }

  _contributionBlockFromCandidates(blocks, color, submissionIndex) {
    const candidates = (blocks || []).filter((block) => {
      if (!block) return false;
      const ids = Array.isArray(block.contributorIds) ? block.contributorIds : [];
      const belongsToDevice = block.contributorId === this.deviceId || ids.some((id) => id === this.deviceId);
      return belongsToDevice && Number(block.submissionIndex) === Number(submissionIndex);
    });
    if (!candidates.length) return null;
    const exact = candidates.find((block) => this._hexSame(block.color, color));
    if (exact) return exact;
    return [...candidates].sort((a, b) => {
      const simA = this.getColorSimilarity(a.color, color);
      const simB = this.getColorSimilarity(b.color, color);
      if (Math.abs(simB - simA) > 1e-6) return simB - simA;
      return (b.width * b.height) - (a.width * a.height);
    })[0];
  }

  _currentContributionBlock(color, submissionIndex) {
    return this._contributionBlockFromCandidates(this.blocks, color, submissionIndex);
  }
  
  addColor(newColor, retryDepth = 0, rejectedSplitIds = null) {
    // Safety check: ensure newColor is valid
    if (!newColor || typeof newColor !== 'string' || !newColor.match(/^#[0-9A-Fa-f]{6}$/)) {
      console.error('Invalid color provided to addColor:', newColor);
      return false;
    }
    const rejectedIds = rejectedSplitIds instanceof Set ? rejectedSplitIds : new Set();
    const canTrySplit = (block) => {
      const id = String(block?.id || '').trim();
      return !!id && !rejectedIds.has(id);
    };

    const validGeometryBlocks = this.blocks.filter((block) => {
      const x = Number(block?.x);
      const y = Number(block?.y);
      const width = Number(block?.width);
      const height = Number(block?.height);
      return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;
    });
    if (validGeometryBlocks.length === 0) {
      console.warn('addColor: quilt had no valid blocks; reinitializing starter block before add');
      this.initialize();
    } else if (validGeometryBlocks.length !== this.blocks.length) {
      console.warn(`addColor: dropping ${this.blocks.length - validGeometryBlocks.length} invalid block(s) before add`);
      this.blocks = validGeometryBlocks;
    }

    const firstFillResult = this._tryApplyFirstSubmissionFill(newColor);
    if (firstFillResult) {
      return firstFillResult;
    }

    const structuralAxisResult = this._tryApplySubmissionAxis(newColor);
    if (structuralAxisResult) {
      return structuralAxisResult;
    }
    
    // Find blocks that can be split, prioritizing larger blocks
    // This prevents small blocks from being split when huge blocks are available
    let splittableBlocks = this.blocks.filter(block => {
      return canTrySplit(block) && this._blockMeetsMacroAwareSplitArea(block) && this._isBlockSafelySplittableForFrozenMacro(block);
    });
    const protectedAnchorCanSplitForColor = (block) =>
      !this._isProtectedAnchorBlock(block) || this._protectedAnchorColorCompatible(block, newColor);
    splittableBlocks = splittableBlocks
      .filter(protectedAnchorCanSplitForColor);
    splittableBlocks = this._filterMacroCandidatesByColorOrValue(splittableBlocks, newColor);
    
    const rankByColorFit = (blocks) => {
      const useValueFallback =
        this.macroStructureFrozen &&
        Array.isArray(blocks) &&
        blocks.length > 0 &&
        !blocks.some((block) => this._macroRegionColorCompatible(block, newColor));
      return [...blocks].sort((a, b) => {
        if (useValueFallback) {
          const valueA = this._macroValueDistanceForBlock(a, newColor);
          const valueB = this._macroValueDistanceForBlock(b, newColor);
          if (Math.abs(valueA - valueB) > 1e-6) return valueA - valueB;
        }
        const simA = this.getColorSimilarity(a.color, newColor);
        const simB = this.getColorSimilarity(b.color, newColor);
        const scoreA = simA + this._blockSizePressureScore(a) * SimpleQuiltEngine.SIZE_PRESSURE_RANK_WEIGHT;
        const scoreB = simB + this._blockSizePressureScore(b) * SimpleQuiltEngine.SIZE_PRESSURE_RANK_WEIGHT;
        if (Math.abs(scoreB - scoreA) > 1e-6) return scoreB - scoreA;
        if (Math.abs(simB - simA) > 1e-6) return simB - simA;
        return (b.width * b.height) - (a.width * a.height);
      });
    };

    // Sort by size before macro routing so region capacity still has a stable tie-breaker.
    splittableBlocks.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const macroValueFallbackActive =
      this.macroStructureFrozen &&
      splittableBlocks.length > 0 &&
      !splittableBlocks.some((block) => this._macroRegionColorCompatible(block, newColor));
    const oversizedBlocks = this._oversizedSplittableBlocks(splittableBlocks);
    const forceOversizedSplit =
      !macroValueFallbackActive &&
      oversizedBlocks.length > 0 &&
      this._shouldForceOversizedSplit();
    if (forceOversizedSplit) {
      splittableBlocks = oversizedBlocks;
      console.log(`🎯 SIZE PRESSURE: Forcing split among ${oversizedBlocks.length} oversized block(s); largest ${oversizedBlocks[0]?.id || 'unknown'}`);
    } else {
      splittableBlocks = this._routeSplittableBlocksByMacroColor(newColor, splittableBlocks);
    }

    const structureScale = this.macroStructureFrozen || forceOversizedSplit ? 0 : this._growthSpecialStructureScale();

    let selectedBlock;
    let selectedToPreserveSpecialPattern = false;
    
    // Always split existing blocks - never add new blocks at edges
    if (splittableBlocks.length === 0) {
      // If no blocks meet the minimum size, just use all blocks
      let allBlocks = this.blocks.filter((block) => canTrySplit(block) && this._isBlockSafelySplittableForFrozenMacro(block));
      allBlocks = allBlocks.filter(protectedAnchorCanSplitForColor);
      allBlocks = this._filterMacroCandidatesByColorOrValue(allBlocks, newColor);
      allBlocks = this._routeSplittableBlocksByMacroColor(newColor, allBlocks);
      selectedBlock = rankByColorFit(allBlocks)[0];
    }
    
    // Separate special pattern blocks from regular blocks
    // Handle backward compatibility: blocks without patternType are treated as regular
    const specialPatternBlocks = splittableBlocks.filter(block =>
      block.specialPatternType !== 'diagonalAxis' &&
      (
        block.patternType === 'special' ||
        block.id.includes('_pattern_') ||
        block.originalPatternId // Blocks derived from special patterns
      )
    );
    const regularBlocks = splittableBlocks.filter(block =>
      block.specialPatternType === 'diagonalAxis' ||
      block.patternType === 'regular' ||
      (!block.patternType && !block.id.includes('_pattern_') && !block.originalPatternId)
    );
    
    // First priority: Check if we should split a special pattern block
    if (specialPatternBlocks.length > 0 && !macroValueFallbackActive) {
      
      // Check if new color is very similar to any special pattern colors
      const hasSimilarColor = specialPatternBlocks.some(block => {
        const similarity = this.getColorSimilarity(block.color, newColor);
        const minSide = Math.min(block.width, block.height);
        return similarity > this._hstSplitColorMatchMinSimilarity(minSide);
      });
      
      if (hasSimilarColor) {
        // Only then prioritize special pattern blocks to preserve pattern integrity
        const colorSimilarityScores = specialPatternBlocks.map(block => {
          const similarity = this.getColorSimilarity(block.color, newColor);
          return { block, similarity };
        });
        
        // Sort by HIGHEST similarity (most similar colors first) - preserve pattern
        colorSimilarityScores.sort((a, b) => b.similarity - a.similarity);
        
        // Always pick the most similar block for predictable behavior
        selectedBlock = colorSimilarityScores[0].block;
        selectedToPreserveSpecialPattern = true;
      } else {
      }
      // If no similar colors in special patterns, fall through to regular block logic
    }
    
    if (!selectedBlock) {
      // Special rules for pattern creation before macro freeze:
      // 1) Adds 2-6: 75% chance, unless the previous add was special
      // 2) Adds 7-24: 35% chance, unless blocked by the special-pattern cap
      // 3) Reserve minimum 30% of blocks as regular (prevent all-special quilt)
      
      // Count how many special patterns have been created so far
      // Count both originalPatternIds and blocks with patternType: 'special'
      const uniquePatternIds = new Set();
      this.blocks.forEach(block => {
        if (block.specialPatternType === 'diagonalAxis') {
          return;
        }
        if (block.originalPatternId) {
          uniquePatternIds.add(block.originalPatternId);
        } else if (block.patternType === 'special') {
          // Count blocks that are special patterns but don't have originalPatternId
          uniquePatternIds.add(block.id);
        }
      });
      
      const specialPatternsCreated = uniquePatternIds.size;
      // More conservative limit: allow up to 60% of submissions to be special patterns, with a hard cap
      const maxSpecialPatterns = Math.min(Math.max(2, Math.floor(this.submissionCount * 0.60)), Math.floor(this.submissionCount * 0.75));
      
      // Debug logging for pattern counting
      
      let shouldCreateSpecialPattern = false;

      if (structureScale > 0) {
      
      const nextAddNumber = this.submissionCount + 1;

      if (nextAddNumber >= 2 && nextAddNumber <= 6) {
        // Adds 2-6 have 75% chance unless the previous add was special.
        // Before incrementing for this add, submissionCount is the last completed submission.
        const wasLastSplitSpecialPattern = this.blocks.some(block => 
          block.submissionIndex === this.submissionCount && 
          block.specialPatternType !== 'diagonalAxis' &&
          (block.patternType === 'special' || block.id.includes('_pattern_'))
        );
        
        // Debug: Log what blocks we're checking
        const previousBlocks = this.blocks.filter(block => block.submissionIndex === this.submissionCount);
        if (previousBlocks.length > 0) {
          console.log(`🎯 DEBUG: Previous blocks detail:`, previousBlocks.map(block => ({
            id: block.id,
            submissionIndex: block.submissionIndex,
            patternType: block.patternType,
            hasPattern: block.id.includes('_pattern_'),
            isSpecial: block.specialPatternType !== 'diagonalAxis' && (block.patternType === 'special' || block.id.includes('_pattern_'))
          })));
        }
        if (wasLastSplitSpecialPattern) {
          // No back-to-back special patterns in the early window.
          shouldCreateSpecialPattern = false;
        } else {
          shouldCreateSpecialPattern = Math.random() < 0.75 * structureScale;
        }
      } else if (nextAddNumber >= 7 && nextAddNumber <= 24) {
        // Adds 7-24 have 35% chance unless blocked by the special-pattern cap.
        shouldCreateSpecialPattern = specialPatternsCreated < maxSpecialPatterns && Math.random() < 0.35 * structureScale;
      }

      }

      if (shouldCreateSpecialPattern) {
        
        // For special patterns, still choose the closest color match inside the chosen macro region.
        const colorSimilarityScores = regularBlocks.map(block => {
          const similarity = this.getColorSimilarity(block.color, newColor);
          return { block, similarity };
        });

        colorSimilarityScores.sort((a, b) => b.similarity - a.similarity);
        const topBlocks = colorSimilarityScores.slice(0, Math.min(6, colorSimilarityScores.length));
        
        // Safety check: if no regular blocks available, fall back to regular block selection
        if (topBlocks.length === 0) {
          console.log(`🎯 NO REGULAR BLOCKS: Falling back to regular block selection`);
          selectedBlock = null; // Will trigger regular block selection below
        } else {
          const eligibleTopBlocks = topBlocks.filter(
            ({ block }) =>
              !this._isProtectedAnchorBlock(block)
          );
          selectedBlock = (eligibleTopBlocks[0] || topBlocks.find(({ block }) => !this._isProtectedAnchorBlock(block)) || topBlocks[0]).block;
          // Mark this block for special pattern creation
          if (this._isProtectedAnchorBlock(selectedBlock)) {
            console.log(`🛡️ PROTECTED ANCHOR: ${selectedBlock.id} cannot receive an overlapping special; using regular split`);
          } else {
            selectedBlock._shouldCreateSpecialPattern = true;
          }
        }
      } else {
        // Logging is already handled in the conditional blocks above
        // Regular splitting for regular blocks only: pick the closest color match inside the routed region.
        
        // Safety check: ensure we have regular blocks to work with
        if (regularBlocks.length === 0) {
          console.log(`🎯 NO REGULAR BLOCKS: No regular blocks available for selection`);
          selectedBlock = null; // Will trigger fallback logic
        } else {
          const rankedRegular = rankByColorFit(regularBlocks);
          selectedBlock = rankedRegular[0];
          if (selectedBlock) {
            console.log(`🎯 REGULAR SELECTION: Selected closest color match (${regularBlocks.length} blocks) - chosen: ${selectedBlock.id} (${selectedBlock.width.toFixed(1)}x${selectedBlock.height.toFixed(1)})`);
          } else {
            console.log(`🎯 REGULAR SELECTION: Ranked regular blocks but got undefined block`);
          }
        }
      }
    }
    
    // Fallback to random if something goes wrong
    if (!selectedBlock) {
      console.log(`🎯 FALLBACK: No block selected, using random fallback from ${regularBlocks.length} regular blocks (protecting ${specialPatternBlocks.length} special pattern blocks)`);
      if (regularBlocks.length > 0) {
        selectedBlock = rankByColorFit(regularBlocks)[0];
      } else if (specialPatternBlocks.length > 0) {
        // Never no-op on add: if only special blocks remain, split the largest available one.
        const rankedSpecial = rankByColorFit(specialPatternBlocks);
        selectedBlock = rankedSpecial[0];
        console.log(`🎯 FALLBACK: No regular blocks; using best-fit special block ${selectedBlock?.id || 'unknown'}`);
      } else {
        const allBlocks = this.blocks
          .filter((b) => b && canTrySplit(b) && b.width > 0 && b.height > 0 && this._isBlockSafelySplittableForFrozenMacro(b))
          .filter(protectedAnchorCanSplitForColor)
          .sort((a, b) => b.width * b.height - a.width * a.height);
        const routedAllBlocks = this._filterMacroCandidatesByColorOrValue(allBlocks, newColor);
        selectedBlock = this._routeSplittableBlocksByMacroColor(newColor, routedAllBlocks)[0];
        if (!selectedBlock) {
          selectedBlock = this.blocks
            .filter((b) => b && canTrySplit(b) && Number(b.width) > 0 && Number(b.height) > 0)
            .filter(protectedAnchorCanSplitForColor)
            .sort((a, b) => (Number(b.width) || 0) * (Number(b.height) || 0) - (Number(a.width) || 0) * (Number(a.height) || 0))[0];
        }
        if (!selectedBlock) {
          console.log(`🎯 FALLBACK: No eligible blocks available`);
          return false;
        }
        console.log(`🎯 FALLBACK: Using largest remaining block ${selectedBlock.id}`);
      }
    }
    
    const parentSnapshot = this.recordColorReplayEvents ? this._serializeBlockForReplay(selectedBlock) : null;
    if (forceOversizedSplit && selectedBlock) {
      selectedBlock._forceOversizedAccentSplit = true;
    }

    // Increment submission count right before creating blocks
    this.submissionCount++;

    const appliedSplitColor =
      this.macroStructureFrozen && selectedBlock?.macroRegionId != null
        ? newColor
        : this._harmonyAdjustedSplitColor(selectedBlock, newColor);
    const splitResult = this.splitBlock(selectedBlock, appliedSplitColor);
    if (!Array.isArray(splitResult) || splitResult.length === 0) {
      this.submissionCount = Math.max(0, this.submissionCount - 1);
      const rejectedId = String(selectedBlock?.id || '').trim();
      if (rejectedId) rejectedIds.add(rejectedId);
      if (!this._suppressSplitWarnings) {
        console.warn(`🔧 SPLIT SKIPPED: Block ${selectedBlock.id} could not split safely`);
      }
      if (retryDepth < 3 && rejectedIds.size < this.blocks.length) {
        return this.addColor(newColor, retryDepth + 1, rejectedIds);
      }
      return false;
    }
    
    // Debug: Log the split result
    console.log(`🔧 SPLIT RESULT: Block ${selectedBlock.id} split into ${splitResult.length} blocks:`, splitResult.map(b => b.id));
    
    const mirroredPreFreezeReplacements = this._simMirroredPreFreezeReplacements(selectedBlock, splitResult);

    // Replace the original block with the split result
    const blockIndex = this.blocks.findIndex(b => b.id === selectedBlock.id);
    const beforeCount = this.blocks.length;
    this.blocks.splice(blockIndex, 1, ...splitResult);
    mirroredPreFreezeReplacements.forEach((replacement) => {
      const idx = this.blocks.findIndex((block) => block && block.id === replacement.targetId);
      if (idx !== -1) this.blocks.splice(idx, 1, ...replacement.children);
    });
    const afterCount = this.blocks.length;
    
    console.log(`🔧 BLOCK COUNT: Before: ${beforeCount}, After: ${afterCount}, Net change: ${afterCount - beforeCount}`);
    
    const contributionBlock =
      this._contributionBlockFromCandidates(splitResult, appliedSplitColor, this.submissionCount) ||
      splitResult.find((block) => Number(block?.submissionIndex) === Number(this.submissionCount)) ||
      splitResult[splitResult.length - 1];
    if (contributionBlock) {
      this.recordUserContribution(contributionBlock.id, appliedSplitColor, this.submissionCount);
    }

    if (this.recordColorReplayEvents && blockIndex !== -1 && splitResult.length > 0) {
      this.colorReplayEvents.push({
        seq: this.submissionCount,
        iso: new Date().toISOString(),
        newHex: appliedSplitColor,
        parent: parentSnapshot,
        children: splitResult.map((c) => this._serializeBlockForReplay(c))
      });
    }

    this.runAdjacentSimilarMergePass();
    this.runColorSettlingPass();
    this._maybeChooseProtectedAnchorAfterMutation();
    this.maybeApplyMacroStructureFreezeAfterMutation();
    const finalContributionBlock =
      this._currentContributionBlock(appliedSplitColor, this.submissionCount) ||
      this.blocks.find((block) => block && block.id === contributionBlock?.id) ||
      null;

    return {
      originalBlock: selectedBlock,
      newBlocks: splitResult,
      dedicatedBlockId: finalContributionBlock?.id || contributionBlock?.id || '',
      appliedColor: appliedSplitColor,
      submissionIndex: this.submissionCount
    };
  }

  /** Force-split a specific block using the provided color (admin utility). */
  splitSpecificBlock(selectedBlock, newColor) {
    if (!selectedBlock || !selectedBlock.id) {
      console.error('splitSpecificBlock: missing target block');
      return false;
    }
    if (!newColor || typeof newColor !== 'string' || !newColor.match(/^#[0-9A-Fa-f]{6}$/)) {
      console.error('splitSpecificBlock: invalid color', newColor);
      return false;
    }
    const blockIndex = this.blocks.findIndex((b) => b && b.id === selectedBlock.id);
    if (blockIndex === -1) {
      console.error('splitSpecificBlock: target block not found in quilt', selectedBlock.id);
      return false;
    }
    if (!this._isBlockSafelySplittableForFrozenMacro(selectedBlock)) {
      console.warn('splitSpecificBlock: target block is protected by frozen macro geometry', selectedBlock.id);
      return false;
    }

    const parentSnapshot = this.recordColorReplayEvents ? this._serializeBlockForReplay(selectedBlock) : null;
    this.submissionCount++;

    const splitResult = this.splitBlock(selectedBlock, newColor);
    if (!Array.isArray(splitResult) || splitResult.length === 0) {
      this.submissionCount = Math.max(0, this.submissionCount - 1);
      console.log(`splitSpecificBlock: target block could not split safely ${selectedBlock.id}`);
      return false;
    }
    this.blocks.splice(blockIndex, 1, ...splitResult);

    if (splitResult.length >= 2) {
      this.recordUserContribution(splitResult[1].id, newColor, this.submissionCount);
    } else if (splitResult.length === 1) {
      this.recordUserContribution(splitResult[0].id, newColor, this.submissionCount);
    }

    if (this.recordColorReplayEvents) {
      this.colorReplayEvents.push({
        seq: this.submissionCount,
        iso: new Date().toISOString(),
        newHex: newColor,
        parent: parentSnapshot,
        children: splitResult.map((c) => this._serializeBlockForReplay(c))
      });
    }

    this.runAdjacentSimilarMergePass();
    this.runColorSettlingPass();
    this._maybeChooseProtectedAnchorAfterMutation();
    this.maybeApplyMacroStructureFreezeAfterMutation();

    return {
      originalBlock: selectedBlock,
      newBlocks: splitResult,
      submissionIndex: this.submissionCount
    };
  }
  
  // Regular splitting logic without pattern creation (prevents recursion)
  performRegularSplit(block, newColor) {
    const isWider = block.width > block.height;
    const splitDirection = isWider ? 'vertical' : 'horizontal';
    const minBlockSize = 80;
    const splitColor = this._tonalSplitColorForMacroRegion(
      block,
      this._regularSplitColorForFrozenSpecialBlock(block, newColor)
    );
    const preservedParentColor = this._regularSplitColorForFrozenSpecialBlock(block, block.color);
    const forceOversizedAccentSplit = block._forceOversizedAccentSplit === true;
    delete block._forceOversizedAccentSplit;

    const pickPrimaryExtent = (extent) => {
      if (forceOversizedAccentSplit) {
        const accentRatio =
          SimpleQuiltEngine.OVERSIZED_SPLIT_NEW_COLOR_MIN +
          Math.random() * (SimpleQuiltEngine.OVERSIZED_SPLIT_NEW_COLOR_MAX - SimpleQuiltEngine.OVERSIZED_SPLIT_NEW_COLOR_MIN);
        const accentExtent = Math.max(minBlockSize, extent * accentRatio);
        return Math.max(minBlockSize, Math.min(extent - minBlockSize, extent - accentExtent));
      }
      const accentBias = this._regularSplitAccentBias();
      const ratio =
        Math.random() < accentBias * SimpleQuiltEngine.STRUCTURE_ACCENT_PROB
          ? 0.7 + Math.random() * 0.16
          : 0.4 + Math.random() * 0.2;
      let primary = extent * ratio;
      if (primary < minBlockSize) primary = minBlockSize;
      if (extent - primary < minBlockSize) primary = extent - minBlockSize;
      if (primary <= 0 || primary >= extent) primary = extent / 2;
      return primary;
    };

    const canonicalHandcutSplit = this._tryCanonicalHandcutRegularSplit(block, newColor, {
      splitDirection,
      minBlockSize,
      preservedParentColor,
      splitColor,
      pickPrimaryExtent
    });
    if (canonicalHandcutSplit) {
      return canonicalHandcutSplit;
    }

    if (splitDirection === 'horizontal') {
      let splitHeight = pickPrimaryExtent(block.height);
      
      const originalPatternId = block.originalPatternId || (block.patternType === 'special' ? block.id : undefined);
      if (originalPatternId) {
        console.log(`🎯 INHERITANCE: Block ${block.id} splitting - child blocks will inherit originalPatternId: ${originalPatternId}`);
      }
      
      const block1 = {
        ...block,
        id: block.id + '_1',
        height: splitHeight,
        color: preservedParentColor, // Ensure color is preserved
        ...this._backsideRestoreMetadataForExistingPatch(block),
        // Preserve special pattern properties
        originalPatternId: originalPatternId,
        patternType: block.patternType,
        specialPatternType: block.specialPatternType
      };
      
      const block2 = {
        ...block,
        id: block.id + '_2',
        y: block.y + splitHeight,
        height: block.height - splitHeight,
        color: splitColor,
        contributorId: this.deviceId,
        submissionIndex: this.submissionCount,
        ...this._backsideRestoreMetadataForNewPatch({
          ...block,
          id: block.id + '_2',
          y: block.y + splitHeight,
          height: block.height - splitHeight,
          color: splitColor
        }),
        // Preserve special pattern properties
        originalPatternId: originalPatternId,
        patternType: block.patternType,
        specialPatternType: block.specialPatternType
      };
      
      console.log(`🔧 REGULAR SPLIT: Block ${block.id} split into 2 blocks: ${block1.id}, ${block2.id}`);
      console.log(`🔧 BLOCK1: x=${block1.x}, y=${block1.y}, w=${block1.width}, h=${block1.height}, color=${block1.color}`);
      console.log(`🔧 BLOCK2: x=${block2.x}, y=${block2.y}, w=${block2.width}, h=${block2.height}, color=${block2.color}`);
      this._applyInsetCircleRegularSplitChildren(block, block1, block2, newColor);
      this._stripHstFromSplitChildren(block1, block2, block);
      this._stripStripesFromSplitChildren(block1, block2, block);
      SimpleQuiltEngine.ensureInsetClassificationFromGeometry(block1);
      SimpleQuiltEngine.ensureInsetClassificationFromGeometry(block2);
      return [block1, block2];
    } else {
      let splitWidth = pickPrimaryExtent(block.width);
      
      const originalPatternId = block.originalPatternId || (block.patternType === 'special' ? block.id : undefined);
      if (originalPatternId) {
        console.log(`🎯 INHERITANCE: Block ${block.id} splitting - child blocks will inherit originalPatternId: ${originalPatternId}`);
      }
      
      const block1 = {
        ...block,
        id: block.id + '_1',
        width: splitWidth,
        color: preservedParentColor,
        ...this._backsideRestoreMetadataForExistingPatch(block),
        // Preserve special pattern properties
        originalPatternId: originalPatternId,
        patternType: block.patternType,
        specialPatternType: block.specialPatternType
      };
      
      const block2 = {
        ...block,
        id: block.id + '_2',
        x: block.x + splitWidth,
        width: block.width - splitWidth,
        color: splitColor,
        contributorId: this.deviceId,
        submissionIndex: this.submissionCount,
        ...this._backsideRestoreMetadataForNewPatch({
          ...block,
          id: block.id + '_2',
          x: block.x + splitWidth,
          width: block.width - splitWidth,
          color: splitColor
        }),
        // Preserve special pattern properties
        originalPatternId: originalPatternId,
        patternType: block.patternType,
        specialPatternType: block.specialPatternType
      };
      
      console.log(`🔧 REGULAR SPLIT: Block ${block.id} split into 2 blocks: ${block1.id}, ${block2.id}`);
      console.log(`🔧 BLOCK1: x=${block1.x}, y=${block1.y}, w=${block1.width}, h=${block1.height}, color=${block1.color}`);
      console.log(`🔧 BLOCK2: x=${block2.x}, y=${block2.y}, w=${block2.width}, h=${block2.height}, color=${block2.color}`);
      this._applyInsetCircleRegularSplitChildren(block, block1, block2, newColor);
      this._stripHstFromSplitChildren(block1, block2, block);
      this._stripStripesFromSplitChildren(block1, block2, block);
      SimpleQuiltEngine.ensureInsetClassificationFromGeometry(block1);
      SimpleQuiltEngine.ensureInsetClassificationFromGeometry(block2);
      return [block1, block2];
    }
  }

  splitVisibleFlattenedMacroBlock(block, newColor) {
    const world = this._polygonPiecesWorld(block);
    if (!Array.isArray(world) || !world.length) return [];
    const originalBounds = this._normalizeMacroOriginalBounds(block.macroOriginalBounds);
    const referenceWidth = originalBounds?.width || block.width;
    const referenceHeight = originalBounds?.height || block.height;
    const splitDirection = referenceWidth > referenceHeight ? 'vertical' : 'horizontal';
    const minPart = this.macroStructureFrozen ? 24 : 42;
    const forceOversizedAccentSplit = block._forceOversizedAccentSplit === true;
    delete block._forceOversizedAccentSplit;
    const splitColor = this._tonalSplitColorForMacroRegion(
      block,
      this._regularSplitColorForFrozenSpecialBlock(block, newColor)
    );
    const preservedParentColor = this._regularSplitColorForFrozenSpecialBlock(block, block.color);
    const originalPatternId = block.originalPatternId || block.id;
    const recolorPieces = (pieces, color) =>
      pieces.map((piece) => ({
        color,
        points: piece.points
      }));
    const mk = (suffix, pieces, color, contributorId, submissionIndex) => {
      const bounds = this._polygonWorldBounds(pieces);
      if (!bounds) return null;
      const child = {
        ...block,
        id: `${block.id}_${suffix}`,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        color,
        patternType: 'regular',
        specialPatternType: 'diagonalAxis',
        originalPatternId,
        polygonPieces: this._localPolygonPiecesFromWorldPieces(recolorPieces(pieces, color), bounds),
        contributorId,
        submissionIndex,
        macroVisibleFlattened: true,
        macroOriginalBounds: originalBounds || {
          x: Number(block.x),
          y: Number(block.y),
          width: Number(block.width),
          height: Number(block.height)
        }
      };
      delete child._shouldCreateSpecialPattern;
      delete child._forceHalfSquareTriangle;
      delete child._forceInsetCircle;
      return child;
    };
    const splitBy = (direction) => {
      const span = direction === 'vertical' ? Number(block.width) : Number(block.height);
      if (!Number.isFinite(span) || span < minPart * 2) return null;
      const ratio = forceOversizedAccentSplit
        ? 1 - (
          SimpleQuiltEngine.OVERSIZED_SPLIT_NEW_COLOR_MIN +
          Math.random() * (SimpleQuiltEngine.OVERSIZED_SPLIT_NEW_COLOR_MAX - SimpleQuiltEngine.OVERSIZED_SPLIT_NEW_COLOR_MIN)
        )
        : 0.4 + Math.random() * 0.2;
      const cut = (direction === 'vertical' ? Number(block.x) : Number(block.y)) + span * ratio;
      const aPieces = direction === 'vertical'
        ? this._clipPolygonPiecesByProjection(world, 1, 0, cut, true)
        : this._clipPolygonPiecesByProjection(world, 0, 1, cut, true);
      const bPieces = direction === 'vertical'
        ? this._clipPolygonPiecesByProjection(world, 1, 0, cut, false)
        : this._clipPolygonPiecesByProjection(world, 0, 1, cut, false);
      if (!aPieces.length || !bPieces.length) return null;
      const a = mk('1', aPieces, preservedParentColor, block.contributorId, block.submissionIndex);
      const b = mk('2', bPieces, splitColor, this.deviceId, this.submissionCount);
      return a && b ? [a, b] : null;
    };
    return splitBy(splitDirection) || splitBy(splitDirection === 'vertical' ? 'horizontal' : 'vertical') || [];
  }

  /**
   * Same intent as {@link performRegularSplit}: ~40–60% cuts (not strict halves) when there is room,
   * so HST rectangles vary in width/height like the rest of the quilt.
   */
  _hstAsymmetricParts(totalSpan, minPart = 40) {
    const t = Number(totalSpan);
    const m = Math.max(1, Number(minPart) || 40);
    if (!Number.isFinite(t) || t <= 0) {
      const half = t / 2;
      return [half, t - half];
    }
    if (t + 1e-9 < 2 * m) {
      const half = t / 2;
      return [half, t - half];
    }
    const splitRatio = 0.4 + Math.random() * 0.2;
    let first = t * splitRatio;
    if (first < m) first = m;
    if (t - first < m) first = t - m;
    if (first <= 0 || first >= t) {
      first = t / 2;
    }
    return [first, t - first];
  }
  
  splitBlock(block, newColor) {
    SimpleQuiltEngine.ensureInsetClassificationFromGeometry(block);
    const finishSplit = (result) => {
      this._stampVisualLayerFromParent(result, block);
      this._stampProtectedAnchorFromParent(result, block);
      this._stampMacroRegionFromParent(result, block);
      if (Array.isArray(result)) {
        result.forEach((child) => {
          if (child) delete child._forceOversizedAccentSplit;
        });
      }
      return result;
    };
    // Debug: Track special pattern flag state
    if (block._shouldCreateSpecialPattern) {
      console.log(`🎯 SPLIT: Block ${block.id} has special pattern flag - creating special pattern`);
    }

    if (this._isProtectedAnchorBlock(block)) {
      delete block._shouldCreateSpecialPattern;
      delete block._forceHalfSquareTriangle;
      delete block._forceInsetCircle;
      if (!this._protectedAnchorColorCompatible(block, newColor)) {
        console.log(`🛡️ PROTECTED ANCHOR: ${block.id} skipped; ${newColor} is not similar enough`);
        return [];
      }
      if (block.macroVisibleFlattened === true && Array.isArray(block.polygonPieces) && block.polygonPieces.length) {
        return finishSplit(this.splitVisibleFlattenedMacroBlock(block, newColor));
      }
      if (block.specialPatternType === 'diagonalAxis') {
        return finishSplit(this.splitDiagonalAxisPattern(block, newColor));
      }
      return finishSplit(this.performRegularSplit(block, newColor));
    }
    
    // Never create special patterns on the first split - let the quilt develop naturally
    if (this.submissionCount <= 1) {
      delete block._forceHalfSquareTriangle;
      delete block._forceInsetCircle;
      if (block.patternType === 'special' && block.specialPatternType === 'hst') {
        if (this._hstFamilyBlockCount(block) >= SimpleQuiltEngine.HST_MAX_FAMILY_BLOCKS) {
          console.log(`🎯 HST CAP: Family reached ${SimpleQuiltEngine.HST_MAX_FAMILY_BLOCKS}; using regular split for ${block.id}`);
          return finishSplit(this.performRegularSplit(block, newColor));
        }
        return finishSplit(this.splitHalfSquareTriangle(block, newColor));
      }
      if (block.patternType === 'special' && block.specialPatternType === 'insetCircle') {
        return finishSplit(this.splitInsetCircle(block, newColor));
      }
      return finishSplit(this.performRegularSplit(block, newColor));
    }
    
    if (block._forceHalfSquareTriangle) {
      delete block._forceHalfSquareTriangle;
      console.log(`🎯 SPLIT: Forced HST for block ${block.id}`);
      return finishSplit(this.createHalfSquareTriangle(block, newColor));
    }

    if (block._forceInsetCircle) {
      delete block._forceInsetCircle;
      console.log(`🎯 SPLIT: Forced inset circle for block ${block.id}`);
      return finishSplit(this.createInsetCircle(block, newColor));
    }

    if (block.patternType === 'special' && block.specialPatternType === 'insetCircle') {
      delete block._shouldCreateSpecialPattern;
      return finishSplit(this.splitInsetCircle(block, newColor));
    }
    
    if (block.patternType === 'special' && block.specialPatternType === 'hst') {
      delete block._shouldCreateSpecialPattern;
      if (this._isFrozenHstMacroShard(block)) {
        return finishSplit(this.splitHalfSquareTriangle(block, newColor));
      }
      if (this._hstFamilyBlockCount(block) >= SimpleQuiltEngine.HST_MAX_FAMILY_BLOCKS) {
        console.log(`🎯 HST CAP: Family reached ${SimpleQuiltEngine.HST_MAX_FAMILY_BLOCKS}; using regular split for ${block.id}`);
        return finishSplit(this.performRegularSplit(block, newColor));
      }
      return finishSplit(this.splitHalfSquareTriangle(block, newColor));
    }

    if (block.macroVisibleFlattened === true && Array.isArray(block.polygonPieces) && block.polygonPieces.length) {
      delete block._shouldCreateSpecialPattern;
      return finishSplit(this.splitVisibleFlattenedMacroBlock(block, newColor));
    }

    if (block.specialPatternType === 'diagonalAxis' && !block._shouldCreateSpecialPattern) {
      delete block._shouldCreateSpecialPattern;
      return finishSplit(this.splitDiagonalAxisPattern(block, newColor));
    }
    
    // Check if this block is part of a special pattern
    const isSpecialPatternBlock = block.patternType === 'special' && block.specialPatternType !== 'diagonalAxis';
    
    if (isSpecialPatternBlock) {
      // For existing special pattern blocks, require VERY SIMILAR colors to preserve pattern
      const colorSimilarity = this.getColorSimilarity(block.color, newColor);
      const minSide = Math.min(block.width, block.height);
      if (colorSimilarity > this._hstSplitColorMatchMinSimilarity(minSide)) {
        console.log(`🎯 NO NESTED PATTERNS: Special pattern block ${block.id} has similar color (${colorSimilarity.toFixed(3)}) - using regular split to prevent nested patterns`);
        return finishSplit(this.performRegularSplit(block, newColor));
      }
    } else if (block._shouldCreateSpecialPattern) {
      // This block was selected for special pattern creation in addColor()
      console.log(`🎯 SPECIAL: Creating special pattern for ${block.id} (${block.color}) with ${newColor}`);
      // Clean up the flag
      delete block._shouldCreateSpecialPattern;
      const isAxisCollageSource = block.specialPatternType === 'diagonalAxis';
      const patternBase = isAxisCollageSource
        ? (() => {
            const clean = { ...block, patternType: 'regular' };
            delete clean.specialPatternType;
            delete clean.originalPatternId;
            delete clean.polygonPieces;
            delete clean.diagonalAxisAccentColor;
            delete clean.diagonalAxisUx;
            delete clean.diagonalAxisUy;
            return clean;
          })()
        : block;
      const specialBlocks = this.createSpecialPattern(patternBase, newColor);
      return finishSplit(isAxisCollageSource ? this._applyAxisCollageMetadata(specialBlocks, block) : specialBlocks);
    }
    
    // If no pattern is created, perform regular split
    return finishSplit(this.performRegularSplit(block, newColor));
  }
  
  createSpecialPattern(block, newColor) {
    // Generic pattern creation system
    // Select which pattern type to create based on block characteristics and randomness
    
    const blockArea = block.width * block.height;
    const availablePatterns = this.getAvailablePatterns(block, newColor);
    
    if (availablePatterns.length === 0) {
      console.log(`🎯 NO PATTERNS: No suitable patterns available for block ${block.id} - falling back to regular split`);
      return this.performRegularSplit(block, newColor);
    }
    
    // Select pattern type (currently only checkerboard, but extensible)
    const selectedPatternType = this.selectPatternType(availablePatterns, block, newColor);
    
    console.log(`🎯 PATTERN SELECTION: Creating ${selectedPatternType} pattern for block ${block.id}`);
    
    // Create the selected pattern
    switch (selectedPatternType) {
      case 'checkerboard':
        return this.createOrganicCheckerboard(block, newColor);
      case 'stripes':
        return this.createOrganicStripes(block, newColor);
      case 'logcabin':
        return this.createLogCabin(block, newColor);
      case 'framed':
        return this.createFramedPattern(block, newColor);
      case 'railfence':
        return this.createRailFencePattern(block, newColor);
      case 'cross':
        return this.createCrossPattern(block, newColor);
      case 'hst':
        return this.createHalfSquareTriangle(block, newColor);
      case 'insetCircle':
        return this.createInsetCircle(block, newColor);
      // Future patterns can be added here:
      // case 'dots':
      //   return this.createDotsPattern(block, newColor);
      default:
        console.log(`🎯 UNKNOWN PATTERN: ${selectedPatternType} not implemented - falling back to regular split`);
        return this.performRegularSplit(block, newColor);
    }
  }
  
  getAvailablePatterns(block, newColor) {
    // Determine which patterns are suitable for this block
    const blockArea = block.width * block.height;
    const quiltDims = Utils.getQuiltDimensions();
    const quiltArea = Math.max(1, (Number(quiltDims?.width) || 1070) * (Number(quiltDims?.height) || 1340));
    const maxSpecialPatternArea = quiltArea * SimpleQuiltEngine.SPECIAL_PATTERN_MAX_AREA_FRACTION;
    if (blockArea > maxSpecialPatternArea) {
      return [];
    }
    const minSpecialPatternArea = 50000; // 50,000 square pixels minimum for special patterns
    
    const availablePatterns = [];
    
    // All special patterns require blocks of 50,000 square pixels or larger
    if (blockArea >= minSpecialPatternArea) {
      // Checkerboard is available for large blocks
      const minBlockSize = 20;
      const avgCellSize = Math.sqrt(blockArea) / 2; // Rough estimate for 2x2 grid
      if (avgCellSize >= minBlockSize) {
        availablePatterns.push('checkerboard');
      }
      
      // Stripes pattern is available for large blocks with good aspect ratio
      if (block.width > 80 && block.height > 80) {
        availablePatterns.push('stripes');
      }
      
      // Log Cabin temporarily disabled; keep renderer below for existing saved quilts.
      // if (block.width > 120 && block.height > 120 && this.submissionCount <= 4) {
      //   availablePatterns.push('logcabin');
      // }
      
      // Framed pattern is available for medium-large blocks
      if (block.width > 60 && block.height > 60) {
        availablePatterns.push('framed');
      }
      
      // Rail fence temporarily disabled; keep renderer below for existing saved quilts.
      // if (block.width > 100 && block.height > 100) {
      //   const aspectRatio = Math.max(block.width, block.height) / Math.min(block.width, block.height);
      //   if (aspectRatio <= 1.5) {
      //     availablePatterns.push('railfence');
      //   }
      // }
      
      // Cross pattern is available for large blocks (needs space for 3x3 grid)
      // Also requires square-ish aspect ratio (not too rectangular)
      if (block.width > 90 && block.height > 90) {
        const aspectRatio = Math.max(block.width, block.height) / Math.min(block.width, block.height);
        if (aspectRatio <= 1.5) { // Max 1.5:1 ratio (e.g., 150x100 is OK, 200x100 is not)
          availablePatterns.push('cross');
        }
      }
    }
    
    // Half-square triangle: any modest-sized cell (no huge area gate); elongated OK on portrait quilts
    const hstMin = SimpleQuiltEngine.HST_ELIGIBLE_MIN_SHORT;
    const hstMaxAr = SimpleQuiltEngine.HST_ELIGIBLE_MAX_ASPECT;
    const hstShort = Math.min(block.width, block.height);
    const hstLong = Math.max(block.width, block.height);
    const hstAr = hstLong / Math.max(1, hstShort);
    if (hstShort >= hstMin && hstAr <= hstMaxAr) {
      availablePatterns.push('hst');
    }

    const insetShort = Math.min(block.width, block.height);
    const insetLong = Math.max(block.width, block.height);
    const insetAr = insetLong / Math.max(1, insetShort);
    if (this._blockMeetsInsetCircleGeometry(block)) {
      availablePatterns.push('insetCircle');
    }
    
    return availablePatterns;
  }
  
  selectPatternType(availablePatterns, block, newColor) {
    if (availablePatterns.length === 1) {
      return availablePatterns[0];
    }
    return availablePatterns[Math.floor(Math.random() * availablePatterns.length)];
  }
  
  /**
   * One square, diagonal split, two solid colors (classic half-square triangle).
   * Persists as patternType/special + hstColorB + hstDiagonal ('nw-se' | 'ne-sw').
   */
  createHalfSquareTriangle(block, newColor) {
    const diagonal = Math.random() < 0.5 ? 'nw-se' : 'ne-sw';
    const rawB =
      typeof newColor === 'string' && newColor.startsWith('#') ? newColor : block.color;
    const safeColorB = this._ensureDistinctHstPartner(block.color, rawB);
    const hst = {
      id: block.id,
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
      color: block.color,
      hstColorB: safeColorB,
      hstDiagonal: diagonal,
      patternType: 'special',
      specialPatternType: 'hst',
      contributorId: block.contributorId || this.deviceId,
      submissionIndex: this.submissionCount,
      visualLayerIndex: this._visualLayerIndexForBlock(block),
      originalPatternId: block.originalPatternId || block.id
    };
    return [hst];
  }

  /**
   * Centered wonky circle inset: `color` = square field, `insetInnerColor` = disk.
   * Splits indefinitely on alternating axes (clip disk to each child rect). Similar field/new color
   * only allowed as the cell gets smaller (`_insetCircleMaxSimilarityForSplit`).
   */
  createInsetCircle(block, newColor) {
    const inner = this._ensureDistinctHstPartner(block.color, newColor);
    const w = Number(block.width);
    const h = Number(block.height);
    const cx = block.x + w / 2;
    const cy = block.y + h / 2;
    const r = (Math.min(w, h) * SimpleQuiltEngine.INSET_CIRCLE_DIAMETER_FRAC) / 2;
    return [
      {
        id: block.id,
        x: block.x,
        y: block.y,
        width: w,
        height: h,
        color: block.color,
        insetTier: 0,
        insetNextCutVertical: Math.random() < 0.5,
        insetInnerColor: inner,
        insetCx: cx,
        insetCy: cy,
        insetR: r,
        specialOriginalBounds: { x: block.x, y: block.y, width: w, height: h },
        specialOriginalColor: block.color,
        specialOriginalInnerColor: inner,
        specialOriginalInsetR: r,
        patternType: 'special',
        specialPatternType: 'insetCircle',
        contributorId: block.contributorId || this.deviceId,
        submissionIndex: this.submissionCount,
        visualLayerIndex: this._visualLayerIndexForBlock(block),
        originalPatternId: block.originalPatternId || block.id
      }
    ];
  }

  splitInsetCircle(block, newColor) {
    const w = Number(block.width);
    const h = Number(block.height);
    const minSide = Math.min(w, h);
    const maxSim = this._insetCircleMaxSimilarityForSplit(minSide);
    const freezeDiskColor = this._isFrozenInsetCircleMacroRegion(block);
    if (!freezeDiskColor && this.getColorSimilarity(block.color, newColor) > maxSim) {
      return this.performRegularSplit(block, newColor);
    }
    const minHalf = SimpleQuiltEngine.INSET_CIRCLE_MIN_HALF;
    const bg = typeof block.color === 'string' ? block.color : '#c8c4bf';
    const cx = Number(block.insetCx);
    const cy = Number(block.insetCy);
    const r = Number(block.insetR);
    const originalPatternId = block.originalPatternId || (block.patternType === 'special' ? block.id : undefined);
    const tierNext = (block.insetTier ?? 0) + 1;
    const mk = (partial) => {
      const pc = partial && typeof partial.color === 'string' ? partial.color : null;
      const o = {
        ...block,
        ...partial,
        patternType: 'special',
        specialPatternType: 'insetCircle',
        originalPatternId,
        color: pc != null ? pc : bg,
        insetCx: cx,
        insetCy: cy,
        insetR: r,
        insetTier: tierNext
      };
      delete o._shouldCreateSpecialPattern;
      delete o._forceHalfSquareTriangle;
      delete o._forceInsetCircle;
      delete o.insetMask;
      delete o.insetFrozen;
      delete o.insetFirstCutVertical;
      return o;
    };

    const useVertical = this._resolveInsetNextCutVertical(block);
    const nextAxisVertical = !useVertical;
    const frozenInnerColor =
      freezeDiskColor &&
      typeof block.macroFrozenColor === 'string' &&
      block.macroFrozenColor.match(/^#[0-9A-Fa-f]{6}$/)
        ? block.macroFrozenColor
        : block.insetInnerColor;

    const field2 = freezeDiskColor ? this._tonalSplitColorForMacroRegion(block, newColor) : this._insetAdjacentFieldColor(bg, newColor);

    if (useVertical) {
      const w1 = w / 2;
      const w2 = w - w1;
      if (w1 < minHalf || w2 < minHalf) return freezeDiskColor ? [] : this.performRegularSplit(block, newColor);
      const inner1 = freezeDiskColor ? frozenInnerColor : block.insetInnerColor;
      const inner2 = freezeDiskColor ? frozenInnerColor : this._ensureDistinctHstPartner(inner1, newColor);
      return [
        mk({
          id: block.id + '_1',
          x: block.x,
          y: block.y,
          width: w1,
          height: h,
          color: bg,
          insetNextCutVertical: nextAxisVertical,
          insetInnerColor: inner1,
          contributorId: block.contributorId,
          submissionIndex: block.submissionIndex
        }),
        mk({
          id: block.id + '_2',
          x: block.x + w1,
          y: block.y,
          width: w2,
          height: h,
          color: field2,
          insetNextCutVertical: nextAxisVertical,
          insetInnerColor: inner2,
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount
        })
      ];
    }
    const h1 = h / 2;
    const h2 = h - h1;
    if (h1 < minHalf || h2 < minHalf) return freezeDiskColor ? [] : this.performRegularSplit(block, newColor);
    const inner1 = freezeDiskColor ? frozenInnerColor : block.insetInnerColor;
    const inner2 = freezeDiskColor ? frozenInnerColor : this._ensureDistinctHstPartner(inner1, newColor);
    return [
      mk({
        id: block.id + '_1',
        x: block.x,
        y: block.y,
        width: w,
        height: h1,
        color: bg,
        insetNextCutVertical: nextAxisVertical,
        insetInnerColor: inner1,
        contributorId: block.contributorId,
        submissionIndex: block.submissionIndex
      }),
      mk({
        id: block.id + '_2',
        x: block.x,
        y: block.y + h1,
        width: w,
        height: h2,
        color: field2,
        insetNextCutVertical: nextAxisVertical,
        insetInnerColor: inner2,
        contributorId: this.deviceId,
        submissionIndex: this.submissionCount
      })
    ];
  }

  _hstLegacyLocalTriangles(block) {
    const w = Number(block.width);
    const h = Number(block.height);
    const c1 = typeof block.color === 'string' ? block.color : '#c8c4bf';
    const c2 = typeof block.hstColorB === 'string' ? block.hstColorB : c1;
    const diag = block.hstDiagonal === 'ne-sw' ? 'ne-sw' : 'nw-se';
    if (diag === 'nw-se') {
      return [
        { color: c1, points: [[0, 0], [0, h], [w, h]] },
        { color: c2, points: [[0, 0], [w, 0], [w, h]] }
      ];
    }
    return [
      { color: c1, points: [[0, 0], [w, 0], [0, h]] },
      { color: c2, points: [[w, 0], [w, h], [0, h]] }
    ];
  }

  _hstColoredTrianglesWorld(block) {
    if (Array.isArray(block.hstTriangles) && block.hstTriangles.length) {
      return block.hstTriangles.map((t) => ({
        color: t.color,
        points: (t.points || []).map((p) => {
          const lx = Array.isArray(p) ? Number(p[0]) : Number(p.x);
          const ly = Array.isArray(p) ? Number(p[1]) : Number(p.y);
          return [lx + block.x, ly + block.y];
        })
      }));
    }
    return this._hstLegacyLocalTriangles(block).map((t) => ({
      color: t.color,
      points: t.points.map((p) => [p[0] + block.x, p[1] + block.y])
    }));
  }

  _dedupePolyVertices(pts, eps) {
    const out = [];
    for (const q of pts) {
      if (!q || q.length < 2) continue;
      if (
        !out.length ||
        Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) > eps
      ) {
        out.push([q[0], q[1]]);
      }
    }
    if (
      out.length > 1 &&
      Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps
    ) {
      out.pop();
    }
    return out;
  }

  _clipSegVertical(x0, A, B) {
    const [x1, y1] = A;
    const [x2, y2] = B;
    const d = x2 - x1;
    if (Math.abs(d) < 1e-12) return null;
    const t = (x0 - x1) / d;
    if (t < -1e-6 || t > 1 + 1e-6) return null;
    return [x0, y1 + t * (y2 - y1)];
  }

  _clipSegHorizontal(y0, A, B) {
    const [x1, y1] = A;
    const [x2, y2] = B;
    const d = y2 - y1;
    if (Math.abs(d) < 1e-12) return null;
    const t = (y0 - y1) / d;
    if (t < -1e-6 || t > 1 + 1e-6) return null;
    return [x1 + t * (x2 - x1), y0];
  }

  _clipConvexPolygonHalfPlane(poly, insideFn, intersectFn) {
    const eps = 1e-9;
    const out = [];
    if (!poly || poly.length < 2) return out;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const prev = poly[(i + n - 1) % n];
      const curr = poly[i];
      const prevIn = insideFn(prev);
      const currIn = insideFn(curr);
      if (currIn) {
        if (!prevIn) {
          const is = intersectFn(prev, curr);
          if (is) out.push(is);
        }
        out.push([curr[0], curr[1]]);
      } else if (prevIn) {
        const is = intersectFn(prev, curr);
        if (is) out.push(is);
      }
    }
    return this._dedupePolyVertices(out, eps);
  }

  _clipConvexPolygonToRect(polyRaw, rx, ry, rw, rh) {
    const eps = 1e-9;
    const minX = rx;
    const maxX = rx + rw;
    const minY = ry;
    const maxY = ry + rh;
    let poly = (polyRaw || []).map((p) => [Number(p[0]), Number(p[1])]);
    poly = this._clipConvexPolygonHalfPlane(
      poly,
      (pt) => pt[0] >= minX - eps,
      (A, B) => this._clipSegVertical(minX, A, B)
    );
    poly = this._clipConvexPolygonHalfPlane(
      poly,
      (pt) => pt[0] <= maxX + eps,
      (A, B) => this._clipSegVertical(maxX, A, B)
    );
    poly = this._clipConvexPolygonHalfPlane(
      poly,
      (pt) => pt[1] >= minY - eps,
      (A, B) => this._clipSegHorizontal(minY, A, B)
    );
    poly = this._clipConvexPolygonHalfPlane(
      poly,
      (pt) => pt[1] <= maxY + eps,
      (A, B) => this._clipSegHorizontal(maxY, A, B)
    );
    return poly;
  }

  _triangulateConvexPolygon(poly) {
    if (!poly || poly.length < 3) return [];
    if (poly.length === 3) return [poly.map((p) => [...p])];
    const tris = [];
    const p0 = poly[0];
    for (let i = 1; i < poly.length - 1; i++) {
      tris.push([[...p0], [...poly[i]], [...poly[i + 1]]]);
    }
    return tris;
  }

  _worldTrisClippedToRect(coloredWorldTris, rx, ry, rw, rh) {
    const out = [];
    for (const tri of coloredWorldTris || []) {
      const pts = tri.points;
      if (!pts || pts.length < 3) continue;
      const clipped = this._clipConvexPolygonToRect(pts, rx, ry, rw, rh);
      if (clipped.length < 3) continue;
      for (const t of this._triangulateConvexPolygon(clipped)) {
        out.push({ color: tri.color, points: t });
      }
    }
    return out;
  }

  _polygonPiecesWorld(block) {
    return (block?.polygonPieces || []).map((piece) => ({
      color: piece.color,
      points: (piece.points || []).map((p) => {
        const lx = Array.isArray(p) ? Number(p[0]) : Number(p.x);
        const ly = Array.isArray(p) ? Number(p[1]) : Number(p.y);
        return [lx + block.x, ly + block.y];
      })
    }));
  }

  _axisCollageMetadataFromBlock(block) {
    if (!block || block.specialPatternType !== 'diagonalAxis') return null;
    const ux = Number(block.diagonalAxisUx);
    const uy = Number(block.diagonalAxisUy);
    return {
      axisLayerMode: 'collage',
      axisOriginId: String(block.starterAxisRegionId || block.originalPatternId || block.id),
      axisSourceBlockId: String(block.id),
      axisSourceSubmissionIndex: typeof block.submissionIndex === 'number' ? block.submissionIndex : undefined,
      diagonalAxisUx: Number.isFinite(ux) ? ux : undefined,
      diagonalAxisUy: Number.isFinite(uy) ? uy : undefined
    };
  }

  _applyAxisCollageMetadata(blocks, axisBlock) {
    const meta = this._axisCollageMetadataFromBlock(axisBlock);
    if (!meta || !Array.isArray(blocks)) return blocks;
    return blocks.map((b) => {
      if (!b || typeof b !== 'object') return b;
      const out = { ...b, ...meta };
      Object.keys(out).forEach((key) => {
        if (out[key] === undefined) delete out[key];
      });
      return out;
    });
  }

  _clipPolygonPiecesToRect(pieces, rx, ry, rw, rh) {
    return this._worldTrisClippedToRect(pieces, rx, ry, rw, rh);
  }

  _polygonWorldBounds(pieces) {
    const pts = [];
    (pieces || []).forEach((piece) => (piece.points || []).forEach((p) => pts.push(p)));
    if (!pts.length) return null;
    const xs = pts.map((p) => Number(p[0]));
    const ys = pts.map((p) => Number(p[1]));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (![minX, maxX, minY, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  _localPolygonPiecesFromWorldPieces(pieces, bounds) {
    return (pieces || []).map((piece) => ({
      color: piece.color,
      points: (piece.points || []).map((p) => [p[0] - bounds.x, p[1] - bounds.y])
    }));
  }

  _clipConvexPolygonByProjection(poly, nx, ny, cut, keepLess) {
    return this._clipConvexPolygonHalfPlane(
      poly,
      (pt) => {
        const d = pt[0] * nx + pt[1] * ny;
        return keepLess ? d <= cut + 1e-9 : d >= cut - 1e-9;
      },
      (p0, p1) => {
        const d0 = p0[0] * nx + p0[1] * ny - cut;
        const d1 = p1[0] * nx + p1[1] * ny - cut;
        const denom = d0 - d1;
        if (Math.abs(denom) < 1e-9) return null;
        const t = d0 / denom;
        if (t < -1e-6 || t > 1 + 1e-6) return null;
        return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
      }
    );
  }

  _clipPolygonPiecesByProjection(pieces, nx, ny, cut, keepLess) {
    const out = [];
    for (const piece of pieces || []) {
      const clipped = this._clipConvexPolygonByProjection(piece.points || [], nx, ny, cut, keepLess);
      if (clipped.length >= 3) out.push({ color: piece.color, points: clipped });
    }
    return out;
  }

  _localColoredTrisFromWorld(worldTris, ox, oy) {
    return worldTris.map((t) => ({
      color: t.color,
      points: t.points.map((p) => [p[0] - ox, p[1] - oy])
    }));
  }

  _regularBlockWorldPieces(block, color) {
    if (Array.isArray(block?.polygonPieces) && block.polygonPieces.length) {
      return this._polygonPiecesWorld(block)
        .map((piece) => ({
          color,
          points: (piece.points || []).map((p) => [Number(p[0]), Number(p[1])])
        }))
        .filter((piece) => piece.points.length >= 3);
    }
    const x = Number(block?.x);
    const y = Number(block?.y);
    const w = Number(block?.width);
    const h = Number(block?.height);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return [];
    return [{
      color,
      points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    }];
  }

  _shouldUseCanonicalHandcutRegularSplit(block) {
    if (this.macroStructureFrozen || !block) return false;
    if ((this.blocks?.length || 0) >= SimpleQuiltEngine.CANONICAL_HANDCUT_SPLIT_UNTIL_BLOCKS) return false;
    if (block.patternType === 'special') return false;
    if (block.specialPatternType && block.specialPatternType !== 'diagonalAxis') return false;
    if (['checkerboard', 'stripes', 'railfence'].includes(block.specialPatternType)) return false;
    const w = Number(block.width);
    const h = Number(block.height);
    return [w, h].every(Number.isFinite) && w > 0 && h > 0;
  }

  _tryCanonicalHandcutStripPieces(block, isHorizontal, a, b, preservedParentColor, splitColor) {
    if (Array.isArray(block?.polygonPieces) && block.polygonPieces.length) return null;
    const x = Number(block.x);
    const y = Number(block.y);
    const w = Number(block.width);
    const h = Number(block.height);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    const span = isHorizontal ? w : h;
    const maxKink = Math.max(1.5, Math.min(12, span * 0.018));
    const innerCount = span > 420 && Math.random() < 0.55 ? 2 : 1;
    const ts = innerCount === 2 ? [0.34, 0.67] : [0.5 + (Math.random() - 0.5) * 0.16];
    const seamPoints = [
      a,
      ...ts.map((t, idx) => {
        const base = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const bend = (Math.random() - 0.5) * 2 * maxKink * (idx % 2 === 0 ? 1 : 0.75);
        return isHorizontal ? [base[0], base[1] + bend] : [base[0] + bend, base[1]];
      }),
      b
    ];
    const makePiece = (color, points) => ({
      color,
      points: this._dedupePolyVertices(points, 1e-7)
    });
    const aPieces = [];
    const bPieces = [];
    for (let i = 0; i < seamPoints.length - 1; i++) {
      const p0 = seamPoints[i];
      const p1 = seamPoints[i + 1];
      if (isHorizontal) {
        const leftX = p0[0];
        const rightX = p1[0];
        aPieces.push(makePiece(preservedParentColor, [[leftX, y], [rightX, y], p1, p0]));
        bPieces.push(makePiece(splitColor, [p0, p1, [rightX, y + h], [leftX, y + h]]));
      } else {
        const topY = p0[1];
        const bottomY = p1[1];
        aPieces.push(makePiece(preservedParentColor, [[x, topY], p0, p1, [x, bottomY]]));
        bPieces.push(makePiece(splitColor, [p0, [x + w, topY], [x + w, bottomY], p1]));
      }
    }
    const validA = aPieces.filter((piece) => piece.points.length >= 3);
    const validB = bPieces.filter((piece) => piece.points.length >= 3);
    return validA.length && validB.length ? { worldA: validA, worldB: validB } : null;
  }

  _tryCanonicalHandcutRegularSplit(block, newColor, options) {
    if (!this._shouldUseCanonicalHandcutRegularSplit(block)) return null;
    const splitDirection = options?.splitDirection;
    const pickPrimaryExtent = options?.pickPrimaryExtent;
    const minBlockSize = Math.max(1, Number(options?.minBlockSize) || 80);
    const preservedParentColor = options?.preservedParentColor || block.color;
    const splitColor = options?.splitColor || newColor;
    if (typeof pickPrimaryExtent !== 'function') return null;

    const x = Number(block.x);
    const y = Number(block.y);
    const w = Number(block.width);
    const h = Number(block.height);
    if (![x, y, w, h].every(Number.isFinite) || w < minBlockSize * 2 || h < minBlockSize * 2) {
      return null;
    }

    const isHorizontal = splitDirection === 'horizontal';
    const primaryExtent = pickPrimaryExtent(isHorizontal ? h : w);
    if (!(primaryExtent > minBlockSize && primaryExtent < (isHorizontal ? h : w) - minBlockSize)) {
      return null;
    }

    const maxAngle = SimpleQuiltEngine.CANONICAL_HANDCUT_SPLIT_MAX_DEGREES;
    const angle = (0.75 + Math.random() * Math.max(0.25, maxAngle - 0.75)) * Math.PI / 180;
    const sign = Math.random() < 0.5 ? -1 : 1;
    let a;
    let b;
    let sideAPoint;
    if (isHorizontal) {
      const seamY = y + primaryExtent;
      const rawDrift = Math.tan(angle) * w * sign;
      const maxDrift = Math.max(0, Math.min(
        primaryExtent - minBlockSize * 0.55,
        h - primaryExtent - minBlockSize * 0.55,
        h * 0.08,
        28
      ));
      const dy = Math.max(-maxDrift, Math.min(maxDrift, rawDrift));
      a = [x, seamY - dy / 2];
      b = [x + w, seamY + dy / 2];
      sideAPoint = [x + w / 2, y];
    } else {
      const seamX = x + primaryExtent;
      const rawDrift = Math.tan(angle) * h * sign;
      const maxDrift = Math.max(0, Math.min(
        primaryExtent - minBlockSize * 0.55,
        w - primaryExtent - minBlockSize * 0.55,
        w * 0.08,
        28
      ));
      const dx = Math.max(-maxDrift, Math.min(maxDrift, rawDrift));
      a = [seamX - dx / 2, y];
      b = [seamX + dx / 2, y + h];
      sideAPoint = [x, y + h / 2];
    }

    const axisDx = b[0] - a[0];
    const axisDy = b[1] - a[1];
    const axisLen = Math.max(1e-9, Math.hypot(axisDx, axisDy));
    const ux = axisDx / axisLen;
    const uy = axisDy / axisLen;
    const nx = -uy;
    const ny = ux;
    const cut = a[0] * nx + a[1] * ny;
    const keepLessForA = (sideAPoint[0] * nx + sideAPoint[1] * ny) <= cut;
    const world = this._regularBlockWorldPieces(block, preservedParentColor);
    const stripSplit = this._tryCanonicalHandcutStripPieces(
      block,
      isHorizontal,
      a,
      b,
      preservedParentColor,
      splitColor
    );
    const childAxisUx = stripSplit && isHorizontal ? 1 : ux;
    const childAxisUy = stripSplit && isHorizontal ? 0 : uy;
    const worldA = stripSplit
      ? stripSplit.worldA
      : this._clipPolygonPiecesByProjection(world, nx, ny, cut, keepLessForA);
    const worldB = stripSplit
      ? stripSplit.worldB
      : this._clipPolygonPiecesByProjection(world, nx, ny, cut, !keepLessForA)
        .map((piece) => ({ color: splitColor, points: piece.points }));
    const boundsA = this._polygonWorldBounds(worldA);
    const boundsB = this._polygonWorldBounds(worldB);
    if (!boundsA || !boundsB) return null;

    const originalPatternId = block.originalPatternId || block.id;
    const makeChild = (suffix, pieces, bounds, color, contributorId, submissionIndex, backsideMeta) => {
      const child = {
        ...block,
        ...backsideMeta,
        id: `${block.id}_hc_${this.submissionCount}_${suffix}`,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        color,
        patternType: 'regular',
        specialPatternType: 'diagonalAxis',
        originalPatternId,
        polygonPieces: this._localPolygonPiecesFromWorldPieces(pieces, bounds),
        diagonalAxisUx: childAxisUx,
        diagonalAxisUy: childAxisUy,
        diagonalAxisAccentColor: newColor,
        contributorId,
        submissionIndex,
        visualLayerIndex: this._visualLayerIndexForBlock(block),
        starterAxisRegion: true,
        starterAxisRegionId: `${block.starterAxisRegionId || block.id}_hc_${this.submissionCount}_${suffix}`
      };
      delete child._shouldCreateSpecialPattern;
      delete child._forceHalfSquareTriangle;
      delete child._forceInsetCircle;
      delete child._forceOversizedAccentSplit;
      return child;
    };

    const childA = makeChild(
      'a',
      worldA,
      boundsA,
      preservedParentColor,
      block.contributorId,
      block.submissionIndex,
      this._backsideRestoreMetadataForExistingPatch(block)
    );
    const childB = makeChild(
      'b',
      worldB,
      boundsB,
      splitColor,
      this.deviceId,
      this.submissionCount,
      this._backsideRestoreMetadataForNewPatch({
        ...block,
        id: `${block.id}_hc_${this.submissionCount}_b`,
        x: boundsB.x,
        y: boundsB.y,
        width: boundsB.width,
        height: boundsB.height,
        color: splitColor
      })
    );
    return [childA, childB];
  }

  _hexSame(a, b) {
    return String(a || '')
      .trim()
      .toLowerCase() === String(b || '').trim().toLowerCase();
  }

  /**
   * Minimum getColorSimilarity score to treat two colors as the same HST "accent" when splitting.
   * Larger blocks → lower floor (wider perceptual range counts as a match); smaller → stricter.
   */
  _hstSplitColorMatchMinSimilarity(minSide) {
    const lo = SimpleQuiltEngine.HST_ELIGIBLE_MIN_SHORT;
    const hi = 280;
    const strict = 0.92;
    const relaxed = 0.78;
    const s = Math.max(1, Number(minSide) || 1);
    if (s <= lo) return strict;
    const t = Math.min(1, (s - lo) / (hi - lo));
    return strict + t * (relaxed - strict);
  }

  /**
   * Whether a triangle color should be treated as the parent's HST accent for split recoloring
   * (OKLab when valid hex; falls back to exact hex match).
   */
  _colorsMatchForHstAccent(triColor, accentHex, parentMinSide) {
    if (this._hexSame(triColor, accentHex)) return true;
    const a = typeof triColor === 'string' ? triColor.trim() : '';
    const b = typeof accentHex === 'string' ? accentHex.trim() : '';
    if (!/^#[0-9A-Fa-f]{6}$/.test(a) || !/^#[0-9A-Fa-f]{6}$/.test(b)) return false;
    const floor = this._hstSplitColorMatchMinSimilarity(parentMinSide);
    return this.getColorSimilarity(a, b) > floor;
  }

  /**
   * Second HST triangle color: match regular splits—use the pick when it differs by hex.
   * Only when hex matches (invalid pick / fallback) apply a soft lightness nudge so the seam stays visible.
   */
  _ensureDistinctHstPartner(baseHex, candidateHex) {
    const base = typeof baseHex === 'string' && baseHex.startsWith('#') ? baseHex : '#c8c4bf';
    const candRaw =
      typeof candidateHex === 'string' && candidateHex.startsWith('#') ? candidateHex : base;
    if (!this._hexSame(base, candRaw)) {
      return candRaw;
    }
    const hsl = this.hexToHsl(base);
    const tweaked =
      hsl.l > 52
        ? this.darkenColorHsl(hsl, 0.07)
        : this.lightenColorHsl(hsl, 0.07);
    return Utils.hslToHex(tweaked.h, tweaked.s, tweaked.l);
  }

  _secondaryHstColor(block) {
    const base = typeof block.color === 'string' ? block.color : '#c8c4bf';
    if (typeof block.hstColorB === 'string' && !this._hexSame(block.hstColorB, base)) {
      return block.hstColorB;
    }
    const tris = Utils.getHstRenderTriangles(block);
    for (const t of tris) {
      if (t && typeof t.color === 'string' && !this._hexSame(t.color, base)) {
        return t.color;
      }
    }
    if (typeof block.hstColorB === 'string') {
      return block.hstColorB;
    }
    return base;
  }

  /** When parent is classic corner-diagonal HST (legacy or inferable hstTriangles), sub-cells stay two real HSTs. */
  _tryInferLegacyHstDiagonal(block) {
    if (typeof block.hstDiagonal === 'string') {
      return block.hstDiagonal === 'ne-sw' ? 'ne-sw' : 'nw-se';
    }
    const w = Number(block.width);
    const h = Number(block.height);
    const cA = typeof block.color === 'string' ? block.color : '#c8c4bf';
    const cB = this._secondaryHstColor(block);
    const actual = Utils.hstClassicTwoTriSignature(Utils.getHstRenderTriangles(block));
    if (!actual) return null;
    for (const d of ['nw-se', 'ne-sw']) {
      if (Utils.syntheticLegacyHstSignature(w, h, cA, cB, d) === actual) {
        return d;
      }
    }
    return null;
  }

  /**
   * Split HST by clipping world-space triangles (non-classic parents or deeply deformed hstTriangles).
   */
  _splitHalfSquareTriangleClipped(block, newColor) {
    const w = Number(block.width);
    const h = Number(block.height);
    const minHalf = this._isFrozenHstMacroShard(block) ? this._frozenHstMacroMinSplitPart() : 40;
    const accent = this._secondaryHstColor(block);
    const parentMinSide = Math.min(w, h);
    const world = this._hstColoredTrianglesWorld(block);
    const originalPatternId = block.originalPatternId || (block.patternType === 'special' ? block.id : undefined);

    const mk = (partial) => {
      const o = {
        ...block,
        ...partial,
        patternType: 'special',
        specialPatternType: 'hst',
        originalPatternId,
        color: block.color
      };
      delete o.hstDiagonal;
      delete o.hstColorB;
      delete o._shouldCreateSpecialPattern;
      delete o._forceHalfSquareTriangle;
      return o;
    };

    if (w > h) {
      const [w1, w2] = this._hstAsymmetricParts(w, minHalf);
      if (w1 < minHalf || w2 < minHalf) {
        const preserved = this._preserveFrozenHstMacroShardInsteadOfRegularFallback(block, 'width below min split');
        if (preserved) return preserved;
        return this.performRegularSplit(block, newColor);
      }
      const r1 = { x: block.x, y: block.y, w: w1, h };
      const r2 = { x: block.x + w1, y: block.y, w: w2, h };
      const t1 = this._worldTrisClippedToRect(world, r1.x, r1.y, r1.w, r1.h);
      const t2 = this._worldTrisClippedToRect(world, r2.x, r2.y, r2.w, r2.h);
      const loc1 = this._localColoredTrisFromWorld(t1, r1.x, r1.y);
      const loc2 = this._localColoredTrisFromWorld(t2, r2.x, r2.y).map((t) => ({
        color: this._colorsMatchForHstAccent(t.color, accent, parentMinSide) ? newColor : t.color,
        points: t.points
      }));
      if (loc1.length === 0 || loc2.length === 0) {
        const preserved = this._preserveFrozenHstMacroShardInsteadOfRegularFallback(block, 'empty clipped vertical child');
        if (preserved) return preserved;
        return this.performRegularSplit(block, newColor);
      }
      return [
        mk({
          id: block.id + '_1',
          x: r1.x,
          y: r1.y,
          width: r1.w,
          height: r1.h,
          hstTriangles: loc1,
          contributorId: block.contributorId,
          submissionIndex: block.submissionIndex
        }),
        mk({
          id: block.id + '_2',
          x: r2.x,
          y: r2.y,
          width: r2.w,
          height: r2.h,
          hstTriangles: loc2,
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount
        })
      ];
    }

    const [h1, h2] = this._hstAsymmetricParts(h, minHalf);
    if (h1 < minHalf || h2 < minHalf) {
      const preserved = this._preserveFrozenHstMacroShardInsteadOfRegularFallback(block, 'height below min split');
      if (preserved) return preserved;
      return this.performRegularSplit(block, newColor);
    }
    const r1 = { x: block.x, y: block.y, w, h: h1 };
    const r2 = { x: block.x, y: block.y + h1, w, h: h2 };
    const t1 = this._worldTrisClippedToRect(world, r1.x, r1.y, r1.w, r1.h);
    const t2 = this._worldTrisClippedToRect(world, r2.x, r2.y, r2.w, r2.h);
    const loc1 = this._localColoredTrisFromWorld(t1, r1.x, r1.y);
    const loc2 = this._localColoredTrisFromWorld(t2, r2.x, r2.y).map((t) => ({
      color: this._colorsMatchForHstAccent(t.color, accent, parentMinSide) ? newColor : t.color,
      points: t.points
    }));
    if (loc1.length === 0 || loc2.length === 0) {
      const preserved = this._preserveFrozenHstMacroShardInsteadOfRegularFallback(block, 'empty clipped horizontal child');
      if (preserved) return preserved;
      return this.performRegularSplit(block, newColor);
    }
    return [
      mk({
        id: block.id + '_1',
        x: r1.x,
        y: r1.y,
        width: r1.w,
        height: r1.h,
        hstTriangles: loc1,
        contributorId: block.contributorId,
        submissionIndex: block.submissionIndex
      }),
      mk({
        id: block.id + '_2',
        x: r2.x,
        y: r2.y,
        width: r2.w,
        height: r2.h,
        hstTriangles: loc2,
        contributorId: this.deviceId,
        submissionIndex: this.submissionCount
      })
    ];
  }

  /**
   * Split an HST: two child rectangles, each a corner-to-corner HST (same diagonal as parent).
   * First half keeps (base, accent); second gets accent = newColor — same contract as performRegularSplit.
   */
  splitHalfSquareTriangle(block, newColor) {
    const diag = this._tryInferLegacyHstDiagonal(block);
    if (!diag) {
      return this._splitHalfSquareTriangleClipped(block, newColor);
    }
    const w = Number(block.width);
    const h = Number(block.height);
    const minHalf = this._isFrozenHstMacroShard(block) ? this._frozenHstMacroMinSplitPart() : 40;
    const accentRaw = this._secondaryHstColor(block);
    const accentPartner = this._ensureDistinctHstPartner(block.color, accentRaw);
    const newPartner = this._ensureDistinctHstPartner(block.color, newColor);
    const originalPatternId = block.originalPatternId || (block.patternType === 'special' ? block.id : undefined);
    const mkLegacy = (partial) => {
      const o = {
        ...block,
        ...partial,
        patternType: 'special',
        specialPatternType: 'hst',
        originalPatternId,
        color: block.color
      };
      delete o.hstTriangles;
      delete o._shouldCreateSpecialPattern;
      delete o._forceHalfSquareTriangle;
      return o;
    };
    if (w > h) {
      const [w1, w2] = this._hstAsymmetricParts(w, minHalf);
      if (w1 < minHalf || w2 < minHalf) {
        const preserved = this._preserveFrozenHstMacroShardInsteadOfRegularFallback(block, 'legacy width below min split');
        if (preserved) return preserved;
        return this.performRegularSplit(block, newColor);
      }
      return [
        mkLegacy({
          id: block.id + '_1',
          x: block.x,
          y: block.y,
          width: w1,
          height: h,
          hstDiagonal: diag,
          hstColorB: accentPartner,
          contributorId: block.contributorId,
          submissionIndex: block.submissionIndex
        }),
        mkLegacy({
          id: block.id + '_2',
          x: block.x + w1,
          y: block.y,
          width: w2,
          height: h,
          hstDiagonal: diag,
          hstColorB: newPartner,
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount
        })
      ];
    }
    const [h1, h2] = this._hstAsymmetricParts(h, minHalf);
    if (h1 < minHalf || h2 < minHalf) {
      const preserved = this._preserveFrozenHstMacroShardInsteadOfRegularFallback(block, 'legacy height below min split');
      if (preserved) return preserved;
      return this.performRegularSplit(block, newColor);
    }
    return [
      mkLegacy({
        id: block.id + '_1',
        x: block.x,
        y: block.y,
        width: w,
        height: h1,
        hstDiagonal: diag,
        hstColorB: accentPartner,
        contributorId: block.contributorId,
        submissionIndex: block.submissionIndex
      }),
      mkLegacy({
        id: block.id + '_2',
        x: block.x,
        y: block.y + h1,
        width: w,
        height: h2,
        hstDiagonal: diag,
        hstColorB: newPartner,
        contributorId: this.deviceId,
        submissionIndex: this.submissionCount
      })
    ];
  }

  splitDiagonalAxisPattern(block, newColor) {
    const world = this._polygonPiecesWorld(block);
    if (!Array.isArray(world) || world.length === 0) {
      return [];
    }
    const originalPatternId = block.originalPatternId || (block.patternType === 'special' ? block.id : undefined);
    const forceOversizedAccentSplit = block._forceOversizedAccentSplit === true;
    delete block._forceOversizedAccentSplit;
    const splitColor = this._tonalSplitColorForMacroRegion(
      block,
      this._regularSplitColorForFrozenSpecialBlock(block, newColor)
    );
    const recolorPieces = (pieces) =>
      pieces.map((piece) => ({
        color: splitColor,
        points: piece.points
      }));
    const rawUx = Number(block.diagonalAxisUx);
    const rawUy = Number(block.diagonalAxisUy);
    const axisLen = Math.hypot(rawUx, rawUy);
    const ux = axisLen > 1e-6 ? rawUx / axisLen : 1;
    const uy = axisLen > 1e-6 ? rawUy / axisLen : 0;
    const vx = -uy;
    const vy = ux;
    const projections = [];
    world.forEach((piece) => (piece.points || []).forEach((p) => {
      projections.push({ u: p[0] * ux + p[1] * uy, v: p[0] * vx + p[1] * vy });
    }));
    if (!projections.length) return [];
    const minU = Math.min(...projections.map((p) => p.u));
    const maxU = Math.max(...projections.map((p) => p.u));
    const minV = Math.min(...projections.map((p) => p.v));
    const maxV = Math.max(...projections.map((p) => p.v));
    const spanU = maxU - minU;
    const spanV = maxV - minV;
    const splitAlongU = spanU >= spanV;
    const minPart = this.macroStructureFrozen ? 24 : 42;
    const span = splitAlongU ? spanU : spanV;
    if (span < minPart * 2) return [];
    const ratio = forceOversizedAccentSplit
      ? 1 - (
        SimpleQuiltEngine.OVERSIZED_SPLIT_NEW_COLOR_MIN +
        Math.random() * (SimpleQuiltEngine.OVERSIZED_SPLIT_NEW_COLOR_MAX - SimpleQuiltEngine.OVERSIZED_SPLIT_NEW_COLOR_MIN)
      )
      : 0.4 + Math.random() * 0.2;
    const cut = (splitAlongU ? minU : minV) + span * ratio;
    let nx = splitAlongU ? ux : vx;
    let ny = splitAlongU ? uy : vy;
    let adjustedCut = cut;
    if (this._shouldUseCanonicalHandcutRegularSplit(block)) {
      const driftRadians = (0.65 + Math.random() * 2.35) * Math.PI / 180 * (Math.random() < 0.5 ? -1 : 1);
      const cos = Math.cos(driftRadians);
      const sin = Math.sin(driftRadians);
      const driftNx = nx * cos - ny * sin;
      const driftNy = nx * sin + ny * cos;
      const cx = (minU + maxU) / 2 * ux + (minV + maxV) / 2 * vx;
      const cy = (minU + maxU) / 2 * uy + (minV + maxV) / 2 * vy;
      const anchorOffset = cut - (cx * nx + cy * ny);
      const anchorX = cx + nx * anchorOffset;
      const anchorY = cy + ny * anchorOffset;
      nx = driftNx;
      ny = driftNy;
      adjustedCut = anchorX * nx + anchorY * ny;
    }
    const worldA = this._clipPolygonPiecesByProjection(world, nx, ny, adjustedCut, true);
    const worldB = recolorPieces(this._clipPolygonPiecesByProjection(world, nx, ny, adjustedCut, false));
    const boundsA = this._polygonWorldBounds(worldA);
    const boundsB = this._polygonWorldBounds(worldB);
    if (!boundsA || !boundsB) return [];
    const mk = (partial) => {
      const o = {
        ...block,
        ...partial,
        patternType: 'regular',
        specialPatternType: 'diagonalAxis',
        originalPatternId
      };
      delete o._shouldCreateSpecialPattern;
      delete o._forceHalfSquareTriangle;
      delete o._forceInsetCircle;
      delete o._forceOversizedAccentSplit;
      return o;
    };
    return [
      mk({
        id: block.id + '_1',
        x: boundsA.x,
        y: boundsA.y,
        width: boundsA.width,
        height: boundsA.height,
        polygonPieces: this._localPolygonPiecesFromWorldPieces(worldA, boundsA),
        contributorId: block.contributorId,
        submissionIndex: block.submissionIndex
      }),
      mk({
        id: block.id + '_2',
        x: boundsB.x,
        y: boundsB.y,
        width: boundsB.width,
        height: boundsB.height,
        polygonPieces: this._localPolygonPiecesFromWorldPieces(worldB, boundsB),
        contributorId: this.deviceId,
        submissionIndex: this.submissionCount
      })
    ];
  }

  _signedDistanceFromLine(point, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.max(1e-9, Math.hypot(dx, dy));
    return (dx * (point[1] - a[1]) - dy * (point[0] - a[0])) / len;
  }

  _clipConvexPolygonByLineDistance(poly, a, b, keepFn, boundaryDistance) {
    return this._clipConvexPolygonHalfPlane(
      poly,
      (pt) => keepFn(this._signedDistanceFromLine(pt, a, b)),
      (p0, p1) => {
        const d0 = this._signedDistanceFromLine(p0, a, b) - boundaryDistance;
        const d1 = this._signedDistanceFromLine(p1, a, b) - boundaryDistance;
        const denom = d0 - d1;
        if (Math.abs(denom) < 1e-9) return null;
        const t = d0 / denom;
        if (t < -1e-6 || t > 1 + 1e-6) return null;
        return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
      }
    );
  }

  createDiagonalAxisPattern(block, newColor) {
    const w = Number(block.width);
    const h = Number(block.height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 140 || h < 140) {
      return this.performRegularSplit(block, newColor);
    }
    const rect = [[0, 0], [w, 0], [w, h], [0, h]];
    const edgeInset = 0.04;
    const maxAngle = SimpleQuiltEngine.STARTER_AXIS_MAX_DEGREES;
    const angleDegrees = Math.floor(Math.random() * (maxAngle + 1));
    const angle = angleDegrees * Math.PI / 180;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const useLeftRight = Math.random() < 0.5;
    let a;
    let b;
    if (useLeftRight) {
      const dy = Math.tan(angle) * w * sign;
      const half = Math.abs(dy) / 2;
      const lo = Math.max(h * edgeInset + half, half);
      const hi = Math.min(h * (1 - edgeInset) - half, h - half);
      if (hi <= lo) return this.performRegularSplit(block, newColor);
      const mid = lo + Math.random() * (hi - lo);
      a = [0, mid - dy / 2];
      b = [w, mid + dy / 2];
    } else {
      const dx = Math.tan(angle) * h * sign;
      const half = Math.abs(dx) / 2;
      const lo = Math.max(w * edgeInset + half, half);
      const hi = Math.min(w * (1 - edgeInset) - half, w - half);
      if (hi <= lo) return this.performRegularSplit(block, newColor);
      const mid = lo + Math.random() * (hi - lo);
      a = [mid - dx / 2, 0];
      b = [mid + dx / 2, h];
    }

    const axisDx = b[0] - a[0];
    const axisDy = b[1] - a[1];
    const axisLen = Math.max(1e-9, Math.hypot(axisDx, axisDy));
    const ux = axisDx / axisLen;
    const uy = axisDy / axisLen;
    const makePiece = (color, points) => ({ color, points: this._dedupePolyVertices(points, 1e-7) });
    const stripSplit = this._tryCanonicalHandcutStripPieces(
      block,
      useLeftRight,
      [block.x + a[0], block.y + a[1]],
      [block.x + b[0], block.y + b[1]],
      block.color,
      newColor
    );
    const localToWorldPiece = (color, points) => ({
      color,
      points: this._dedupePolyVertices(points, 1e-7).map((p) => [block.x + p[0], block.y + p[1]])
    });
    const worldA = stripSplit
      ? stripSplit.worldA
      : [localToWorldPiece(block.color, this._clipConvexPolygonByLineDistance(rect, a, b, (d) => d <= 1e-9, 0))];
    const worldB = stripSplit
      ? stripSplit.worldB
      : [localToWorldPiece(newColor, this._clipConvexPolygonByLineDistance(rect, a, b, (d) => d >= -1e-9, 0))];
    if (!worldA.some((piece) => piece.points.length >= 3) || !worldB.some((piece) => piece.points.length >= 3)) {
      return this.performRegularSplit(block, newColor);
    }
    const childAxisUx = stripSplit && useLeftRight ? 1 : ux;
    const childAxisUy = stripSplit && useLeftRight ? 0 : uy;
    const originalPatternId = block.originalPatternId || block.id;
    const makeAxisChild = (suffix, color, pieces, contributorId, submissionIndex) => {
      const validPieces = (pieces || [])
        .map((piece) => makePiece(color, piece.points || []))
        .filter((piece) => piece.points.length >= 3);
      const worldBounds = this._polygonWorldBounds(validPieces);
      if (!worldBounds || worldBounds.width <= 0 || worldBounds.height <= 0) return null;
      return {
        ...block,
        id: `${block.id}_axis_${this.submissionCount}_${suffix}`,
        x: worldBounds.x,
        y: worldBounds.y,
        width: worldBounds.width,
        height: worldBounds.height,
        color,
        patternType: 'regular',
        specialPatternType: 'diagonalAxis',
        originalPatternId,
        polygonPieces: this._localPolygonPiecesFromWorldPieces(validPieces, worldBounds),
        diagonalAxisUx: childAxisUx,
        diagonalAxisUy: childAxisUy,
        diagonalAxisAccentColor: newColor,
        contributorId,
        submissionIndex,
        visualLayerIndex: this._visualLayerIndexForBlock(block),
        starterAxisRegion: true,
        starterAxisRegionId: `${block.starterAxisRegionId || block.id}_axis_${this.submissionCount}_${suffix}`
      };
    };
    const children = [
      makeAxisChild('a', block.color, worldA, block.contributorId || this.deviceId, block.submissionIndex),
      makeAxisChild('b', newColor, worldB, this.deviceId, this.submissionCount)
    ];
    return children.every(Boolean) ? children : this.performRegularSplit(block, newColor);
  }

  createOrganicCheckerboard(block, newColor) {
    // Create a dynamic organic checkerboard pattern (2x2, 3x3, or 4x4 based on block size)
    // Each square will have slightly irregular edges to maintain the hand-cut vibe
    // Grid size: 4x4 for very large blocks (250px+), 3x3 for medium (100px+), 2x2 for small (50px+)
    // Uses tonal variants for richer color palette
    
    // Classic checkerboard: strictly alternate the parent color and submitted color.
    const colorPalette = [block.color, newColor];
    
    const minBlockSize = 20; // Further reduced minimum size to allow smaller checkerboards
    const blockArea = block.width * block.height;
    
    // Determine grid size based on block dimensions for proportional checkerboards
    // Use the smaller dimension to determine grid size for better proportions
    const minDimension = Math.min(block.width, block.height);
    const maxDimension = Math.max(block.width, block.height);
    const aspectRatio = maxDimension / minDimension;
    
    let gridSize = 2; // Default to 2x2 for small blocks
    
    // More conservative sizing based on block dimensions
    if (minDimension >= 250) {
      // Very large blocks: 4x4 grid for biggest blocks only
      gridSize = 4;
    } else if (minDimension >= 100) {
      // Medium blocks: 3x3 grid for medium blocks (most common)
      gridSize = 3;
    } else if (minDimension >= 50) {
      // Small blocks: 2x2 grid for small blocks
      gridSize = 2;
    } else {
      // Very small blocks: fall back to regular split
      console.log(`🎯 CHECKERBOARD: Block too small (${minDimension}px) - falling back to regular split`);
      return this.performRegularSplit(block, newColor);
    }
    
    // Adjust for extreme aspect ratios - if very wide/tall, reduce grid size
    if (aspectRatio > 3) {
      gridSize = Math.max(2, gridSize - 1);
      console.log(`🎯 CHECKERBOARD: Extreme aspect ratio (${aspectRatio.toFixed(1)}) - reducing grid size to ${gridSize}x${gridSize}`);
    }
    
    console.log(`🎯 CHECKERBOARD: Block ${block.id} (${block.width}x${block.height}, min: ${minDimension}px) → ${gridSize}x${gridSize} grid`);
    
    // Generate variable column widths and row heights for organic feel
    const columnWidths = this.generateVariableDimensions(block.width, gridSize);
    const rowHeights = this.generateVariableDimensions(block.height, gridSize);
    
    // Calculate average cell size for minimum size check
    const avgCellWidth = block.width / gridSize;
    const avgCellHeight = block.height / gridSize;
    
    // Dynamic minimum cell size based on grid size - larger grids can have smaller cells
    const dynamicMinSize = Math.max(15, minBlockSize - (gridSize - 2) * 2); // 15px minimum, reduces for larger grids
    
    // Ensure minimum cell size - if cells would be too small, don't create checkerboard
    if (avgCellWidth < dynamicMinSize || avgCellHeight < dynamicMinSize) {
      console.log(`🎯 CHECKERBOARD: Cells too small (${avgCellWidth.toFixed(1)}x${avgCellHeight.toFixed(1)} < ${dynamicMinSize}px) - falling back to regular split`);
      return this.performRegularSplit(block, newColor);
    }
    
    console.log(`🎯 CHECKERBOARD: Cell size check passed (${avgCellWidth.toFixed(1)}x${avgCellHeight.toFixed(1)} >= ${dynamicMinSize}px)`);                                                                  
    
    const cells = [];
    // Use 2-color alternating pattern for proper checkerboard
    
    const columnPositions = this._positionsFromDimensions(columnWidths);
    const rowPositions = this._positionsFromDimensions(rowHeights);
    
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const cellIndex = row * gridSize + col;
        const colorIndex = (row + col) % 2;
        
        const finalX = block.x + columnPositions[col];
        const finalY = block.y + rowPositions[row];
        const finalWidth = columnPositions[col + 1] - columnPositions[col];
        const finalHeight = rowPositions[row + 1] - rowPositions[row];
        
        const cell = {
          id: block.id + '_pattern_checkerboard_' + cellIndex,
          x: finalX,
          y: finalY,
          width: finalWidth,
          height: finalHeight,
          color: colorPalette[colorIndex],
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount,
          patternType: 'special',
          specialPatternType: 'checkerboard',
          originalPatternId: block.id
        };
        
        cells.push(cell);
      }
    }
    
    console.log(`🔧 CHECKERBOARD: Created ${cells.length} cells for block ${block.id}`);
    const specialOriginalBounds = { x: block.x, y: block.y, width: block.width, height: block.height };
    cells.forEach((cell) => {
      cell.specialOriginalBounds = specialOriginalBounds;
      cell.specialOriginalColor = block.color;
    });
    return cells;
  }
  
  generateVariableDimensions(totalSize, gridSize) {
    const total = Math.max(1, Number(totalSize) || 1);
    const count = Math.max(1, Math.floor(Number(gridSize) || 1));
    const weights = Array.from({ length: count }, () => 0.75 + Math.random() * 0.5);
    const sum = weights.reduce((acc, value) => acc + value, 0) || 1;
    return weights.map((weight) => (weight / sum) * total);
  }

  _positionsFromDimensions(dimensions) {
    const positions = [0];
    for (let i = 0; i < dimensions.length; i++) {
      positions.push(positions[i] + dimensions[i]);
    }
    return positions;
  }
  
  createOrganicStripes(block, newColor) {
    // Create organic stripes pattern with variable column/row widths
    // Stripes can be either horizontal or vertical based on block aspect ratio
    // Uses tonal variants for richer color palette
    
    // Generate 3-color palette with tonal variants for organic stripes
    const colorPalette = this.generateColorPalette(block.color, newColor, 3);
    
    const minBlockSize = 20;
    const blockArea = block.width * block.height;
    
    // Determine if stripes should be horizontal or vertical based on aspect ratio
    const aspectRatio = block.width / block.height;
    const isHorizontal = aspectRatio > 1.2; // Wider blocks get horizontal stripes
    const isVertical = aspectRatio < 0.8;   // Taller blocks get vertical stripes
    const isSquare = !isHorizontal && !isVertical; // Square blocks get random orientation
    
    // Choose stripe orientation
    let stripeOrientation;
    if (isSquare) {
      stripeOrientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
    } else if (isHorizontal) {
      stripeOrientation = 'horizontal';
    } else {
      stripeOrientation = 'vertical';
    }
    
    // Determine number of stripes based on block size (max 4 stripes)
    let numStripes = 3; // Default to 3 stripes
    if (blockArea > 20000) numStripes = 4;
    // Cap at 4 stripes maximum
    numStripes = Math.min(numStripes, 4);
    
    const cells = [];
    // Use tonal variants from the 4-color palette for richer stripes
    
    if (stripeOrientation === 'horizontal') {
      // Create horizontal stripes with variable heights
      const stripeHeights = this.generateVariableDimensions(block.height, numStripes);
      const stripePositions = this._positionsFromDimensions(stripeHeights);
      
      for (let i = 0; i < numStripes; i++) {
        const colorIndex = Math.floor(Math.random() * 3); // Random organic distribution
        const finalY = block.y + stripePositions[i];
        const finalHeight = stripePositions[i + 1] - stripePositions[i];
        
        const cell = {
          id: block.id + '_pattern_stripes_' + i,
          x: block.x,
          y: finalY,
          width: block.width,
          height: finalHeight,
          color: colorPalette[colorIndex],
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount,
          patternType: 'special',
          specialPatternType: 'stripes',
          originalPatternId: block.id
        };
        
        cells.push(cell);
      }
    } else {
      // Create vertical stripes with variable widths
      const stripeWidths = this.generateVariableDimensions(block.width, numStripes);
      const stripePositions = this._positionsFromDimensions(stripeWidths);
      
      for (let i = 0; i < numStripes; i++) {
        const colorIndex = Math.floor(Math.random() * 3); // Random organic distribution
        const finalX = block.x + stripePositions[i];
        const finalWidth = stripePositions[i + 1] - stripePositions[i];
        
        const cell = {
          id: block.id + '_pattern_stripes_' + i,
          x: finalX,
          y: block.y,
          width: finalWidth,
          height: block.height,
          color: colorPalette[colorIndex],
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount,
          patternType: 'special',
          specialPatternType: 'stripes',
          originalPatternId: block.id
        };
        
        cells.push(cell);
      }
    }
    
    const specialOriginalBounds = { x: block.x, y: block.y, width: block.width, height: block.height };
    cells.forEach((cell) => {
      cell.specialOriginalBounds = specialOriginalBounds;
      cell.specialOriginalColor = block.color;
    });
    return cells;
  }
  
  createLogCabin(block, newColor) {
    // Create Log Cabin pattern with proper spiral construction
    // Classic Log Cabin: center square + 8 strips in counterclockwise spiral
    // Must fill the entire original block dimensions
    
    // Generate 5-color palette from the 2 input colors
    const colorPalette = this.generateColorPalette(block.color, newColor, 5);
    
    const cells = [];
    
    // Calculate dimensions to fill the entire block
    // For a Log Cabin with 8 strips, we need to work backwards from the final size
    // Each strip adds to the building area, so we need to calculate strip thickness
    // to ensure the final Log Cabin fills the entire block
    
    // Calculate how much space we have for strips on each side
    const availableWidth = block.width;
    const availableHeight = block.height;
    
    // For 8 strips in spiral: 2 strips per side (right, up, left, down, right, up, left, down)
    // Each side gets 2 strips, so we divide by 4 (sides) * 2 (strips per side) = 8 total strips
    const stripThickness = Math.min(availableWidth, availableHeight) / 6; // 6 gives us good proportions
    
    // Center square should be about 2x strip thickness
    const centerSize = stripThickness * 2;
    const centerX = block.x + (block.width - centerSize) / 2;
    const centerY = block.y + (block.height - centerSize) / 2;
    
    // Create center square (Piece 1)
    const centerCell = {
      id: block.id + '_pattern_logcabin_1',
      x: centerX,
      y: centerY,
      width: centerSize,
      height: centerSize,
      color: colorPalette[0], // Use first color for center
      contributorId: this.deviceId,
      submissionIndex: this.submissionCount,
      patternType: 'special',
      specialPatternType: 'logcabin',
      originalPatternId: block.id
    };
    cells.push(centerCell);
    
    // Track the current "building area" - starts as just the center square
    let buildingLeft = centerX;
    let buildingTop = centerY;
    let buildingRight = centerX + centerSize;
    let buildingBottom = centerY + centerSize;
    
    // Add subtle jitter
    const jitterMultiplier = 0.05;
    
    // Create 8 strips in spiral order: Right, Up, Left, Down, Right, Up, Left, Down
    const stripSequence = [
      { side: 'right', colorIndex: 1 },
      { side: 'up', colorIndex: 2 },
      { side: 'left', colorIndex: 3 },
      { side: 'down', colorIndex: 4 },
      { side: 'right', colorIndex: 1 },
      { side: 'up', colorIndex: 2 },
      { side: 'left', colorIndex: 3 },
      { side: 'down', colorIndex: 4 }
    ];
    
    for (let i = 0; i < stripSequence.length; i++) {
      const { side, colorIndex } = stripSequence[i];
      let stripX, stripY, stripWidth, stripHeight;
      
      // Add jitter
      const jitterX = (Math.random() - 0.5) * jitterMultiplier * stripThickness;
      const jitterY = (Math.random() - 0.5) * jitterMultiplier * stripThickness;
      
      switch (side) {
        case 'right':
          // Add strip to the right side
          stripX = buildingRight + jitterX;
          stripY = buildingTop + jitterY;
          stripWidth = stripThickness;
          stripHeight = buildingBottom - buildingTop;
          // Expand building area to include this strip
          buildingRight += stripThickness;
          break;
          
        case 'up':
          // Add strip to the top
          stripX = buildingLeft + jitterX;
          stripY = buildingTop - stripThickness + jitterY;
          stripWidth = buildingRight - buildingLeft;
          stripHeight = stripThickness;
          // Expand building area to include this strip
          buildingTop -= stripThickness;
          break;
          
        case 'left':
          // Add strip to the left side
          stripX = buildingLeft - stripThickness + jitterX;
          stripY = buildingTop + jitterY;
          stripWidth = stripThickness;
          stripHeight = buildingBottom - buildingTop;
          // Expand building area to include this strip
          buildingLeft -= stripThickness;
          break;
          
        case 'down':
          // Add strip to the bottom
          stripX = buildingLeft + jitterX;
          stripY = buildingBottom + jitterY;
          stripWidth = buildingRight - buildingLeft;
          stripHeight = stripThickness;
          // Expand building area to include this strip
          buildingBottom += stripThickness;
          break;
      }
      
      // Ensure positive dimensions
      stripWidth = Math.max(1, stripWidth);
      stripHeight = Math.max(1, stripHeight);
      
      // Ensure strip stays within block boundaries
      stripX = Math.max(block.x, Math.min(stripX, block.x + block.width - stripWidth));
      stripY = Math.max(block.y, Math.min(stripY, block.y + block.height - stripHeight));
      
      const strip = {
        id: block.id + '_pattern_logcabin_' + (i + 2), // Start from piece 2
        x: stripX,
        y: stripY,
        width: stripWidth,
        height: stripHeight,
        color: colorPalette[colorIndex % colorPalette.length],
        contributorId: this.deviceId,
        submissionIndex: this.submissionCount,
        patternType: 'special',
        specialPatternType: 'logcabin',
        originalPatternId: block.id
      };
      
      cells.push(strip);
    }
    
    // Add spacer blocks to fill any remaining space
    // Check if we need to fill gaps on the left or right sides
    const finalLeft = buildingLeft;
    const finalRight = buildingRight;
    const finalTop = buildingTop;
    const finalBottom = buildingBottom;
    
    // Fill left gap if needed
    if (finalLeft > block.x) {
      const leftGapWidth = finalLeft - block.x;
      if (leftGapWidth > 1) { // Only add if gap is significant
        const spacerLeft = {
          id: block.id + '_pattern_logcabin_spacer_left',
          x: block.x,
          y: finalTop,
          width: leftGapWidth,
          height: finalBottom - finalTop,
          color: colorPalette[0], // Use first color for spacers
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount,
          patternType: 'special',
          specialPatternType: 'logcabin',
          originalPatternId: block.id
        };
        cells.push(spacerLeft);
      }
    }
    
    // Fill right gap if needed
    if (finalRight < block.x + block.width) {
      const rightGapWidth = (block.x + block.width) - finalRight;
      if (rightGapWidth > 1) { // Only add if gap is significant
        const spacerRight = {
          id: block.id + '_pattern_logcabin_spacer_right',
          x: finalRight,
          y: finalTop,
          width: rightGapWidth,
          height: finalBottom - finalTop,
          color: colorPalette[1], // Use second color for spacers
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount,
          patternType: 'special',
          specialPatternType: 'logcabin',
          originalPatternId: block.id
        };
        cells.push(spacerRight);
      }
    }
    
    // Fill top gap if needed
    if (finalTop > block.y) {
      const topGapHeight = finalTop - block.y;
      if (topGapHeight > 1) { // Only add if gap is significant
        const spacerTop = {
          id: block.id + '_pattern_logcabin_spacer_top',
          x: finalLeft,
          y: block.y,
          width: finalRight - finalLeft,
          height: topGapHeight,
          color: colorPalette[2], // Use third color for spacers
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount,
          patternType: 'special',
          specialPatternType: 'logcabin',
          originalPatternId: block.id
        };
        cells.push(spacerTop);
      }
    }
    
    // Fill bottom gap if needed
    if (finalBottom < block.y + block.height) {
      const bottomGapHeight = (block.y + block.height) - finalBottom;
      if (bottomGapHeight > 1) { // Only add if gap is significant
        const spacerBottom = {
          id: block.id + '_pattern_logcabin_spacer_bottom',
          x: finalLeft,
          y: finalBottom,
          width: finalRight - finalLeft,
          height: bottomGapHeight,
          color: colorPalette[3], // Use fourth color for spacers
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount,
          patternType: 'special',
          specialPatternType: 'logcabin',
          originalPatternId: block.id
        };
        cells.push(spacerBottom);
      }
    }
    
    return cells;
  }
  
  createFramedPattern(block, newColor) {
    // Create a framed pattern: outer frame with inner square
    // Frame thickness is 15% of the smaller dimension
    
    const frameThickness = Math.min(block.width, block.height) * 0.15;
    const innerSize = Math.min(block.width, block.height) - (frameThickness * 2);
    
    // Center the inner square
    const innerX = block.x + (block.width - innerSize) / 2;
    const innerY = block.y + (block.height - innerSize) / 2;
    
    // Generate color palette for frame and inner square with tonal variants
    const colorPalette = this.generateColorPalette(block.color, newColor, 3);
    
    // Add jitter for organic feel
    const jitterMultiplier = 0.05;
    
    const cells = [];
    
    // Create outer frame (4 rectangular pieces)
    const frameJitterX = (Math.random() - 0.5) * jitterMultiplier * frameThickness;
    const frameJitterY = (Math.random() - 0.5) * jitterMultiplier * frameThickness;
    
    // Top frame
    const topFrame = {
      id: block.id + '_pattern_framed_top',
      x: block.x + frameJitterX,
      y: block.y + frameJitterY,
      width: block.width,
      height: frameThickness,
      color: colorPalette[0],
      contributorId: this.deviceId,
      submissionIndex: this.submissionCount,
      patternType: 'special',
      specialPatternType: 'framed',
      originalPatternId: block.id
    };
    cells.push(topFrame);
    
    // Bottom frame
    const bottomFrame = {
      id: block.id + '_pattern_framed_bottom',
      x: block.x + frameJitterX,
      y: block.y + block.height - frameThickness + frameJitterY,
      width: block.width,
      height: frameThickness,
      color: colorPalette[2], // Use third color for variety
      contributorId: this.deviceId,
      submissionIndex: this.submissionCount,
      patternType: 'special',
      specialPatternType: 'framed',
      originalPatternId: block.id
    };
    cells.push(bottomFrame);
    
    // Left frame
    const leftFrame = {
      id: block.id + '_pattern_framed_left',
      x: block.x + frameJitterX,
      y: block.y + frameThickness + frameJitterY,
      width: frameThickness,
      height: block.height - (frameThickness * 2),
      color: colorPalette[0],
      contributorId: this.deviceId,
      submissionIndex: this.submissionCount,
      patternType: 'special',
      specialPatternType: 'framed',
      originalPatternId: block.id
    };
    cells.push(leftFrame);
    
    // Right frame
    const rightFrame = {
      id: block.id + '_pattern_framed_right',
      x: block.x + block.width - frameThickness + frameJitterX,
      y: block.y + frameThickness + frameJitterY,
      width: frameThickness,
      height: block.height - (frameThickness * 2),
      color: colorPalette[2], // Use third color for variety
      contributorId: this.deviceId,
      submissionIndex: this.submissionCount,
      patternType: 'special',
      specialPatternType: 'framed',
      originalPatternId: block.id
    };
    cells.push(rightFrame);
    
    // Create inner rectangle that fills the entire frame area
    const innerJitterX = (Math.random() - 0.5) * jitterMultiplier * frameThickness;
    const innerJitterY = (Math.random() - 0.5) * jitterMultiplier * frameThickness;
    
    const innerRectangle = {
      id: block.id + '_pattern_framed_inner',
      x: block.x + frameThickness + innerJitterX,
      y: block.y + frameThickness + innerJitterY,
      width: block.width - (frameThickness * 2),
      height: block.height - (frameThickness * 2),
      color: colorPalette[1],
      contributorId: this.deviceId,
      submissionIndex: this.submissionCount,
      patternType: 'special',
      specialPatternType: 'framed',
      originalPatternId: block.id
    };
    cells.push(innerRectangle);

    const specialOriginalBounds = { x: block.x, y: block.y, width: block.width, height: block.height };
    cells.forEach((cell) => {
      cell.specialOriginalBounds = specialOriginalBounds;
      cell.specialOriginalColor = block.color;
    });
    
    return cells;
  }

  createRailFencePattern(block, newColor) {
    const colorPalette = this.generateColorPalette(block.color, newColor, 3);
    const quadrantWidth = block.width / 2;
    const quadrantHeight = block.height / 2;
    const cells = [];
    const quadrants = [
      { name: 'top-left', x: block.x, y: block.y, orientation: 'vertical' },
      { name: 'top-right', x: block.x + quadrantWidth, y: block.y, orientation: 'horizontal' },
      { name: 'bottom-left', x: block.x, y: block.y + quadrantHeight, orientation: 'horizontal' },
      { name: 'bottom-right', x: block.x + quadrantWidth, y: block.y + quadrantHeight, orientation: 'vertical' }
    ];

    quadrants.forEach((quadrant) => {
      const stripDimensions = this.generateVariableDimensions(
        quadrant.orientation === 'vertical' ? quadrantWidth : quadrantHeight,
        3
      );
      const positions = [0];
      for (let i = 0; i < stripDimensions.length; i++) {
        positions.push(positions[i] + stripDimensions[i]);
      }

      for (let stripIndex = 0; stripIndex < 3; stripIndex++) {
        const colorIndex =
          quadrant.name === 'top-left' || quadrant.name === 'bottom-right'
            ? stripIndex === 1 ? 1 : stripIndex === 0 ? 0 : 2
            : stripIndex === 1 ? 0 : 1;
        const isVertical = quadrant.orientation === 'vertical';
        const stripStart = positions[stripIndex];
        const stripEnd = positions[stripIndex + 1];
        const stripSize = stripEnd - stripStart;

        cells.push({
          id: `${block.id}_pattern_railfence_${quadrant.name}_${stripIndex}`,
          x: isVertical ? quadrant.x + stripStart : quadrant.x,
          y: isVertical ? quadrant.y : quadrant.y + stripStart,
          width: isVertical ? stripSize : quadrantWidth,
          height: isVertical ? quadrantHeight : stripSize,
          color: colorPalette[colorIndex],
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount,
          patternType: 'special',
          specialPatternType: 'railfence',
          originalPatternId: block.id
        });
      }
    });

    const specialOriginalBounds = { x: block.x, y: block.y, width: block.width, height: block.height };
    cells.forEach((cell) => {
      cell.specialOriginalBounds = specialOriginalBounds;
      cell.specialOriginalColor = block.color;
    });
    return cells;
  }
  
  // COMMENTED OUT: Rail fence pattern disabled
  // createRailFencePattern(block, newColor) {
  //   // Create a rail fence pattern: 2x2 quadrants, each with 3 parallel strips
  //   // Alternating orientations create pinwheel effect
  //   
  //   // Generate 3-color palette
  //   const colorPalette = this.generateColorPalette(block.color, newColor, 3);
  //   
  //   // Calculate quadrant dimensions
  //   const quadrantWidth = block.width / 2;
  //   const quadrantHeight = block.height / 2;
  //   
  //   // Add jitter for organic feel
  //   const jitterMultiplier = 0.05;
  //   
  //   const cells = [];
  //   
  //   // Define quadrants with their orientations
  //   const quadrants = [
  //     { name: 'top-left', x: block.x, y: block.y, orientation: 'vertical' },
  //     { name: 'top-right', x: block.x + quadrantWidth, y: block.y, orientation: 'horizontal' },
  //     { name: 'bottom-left', x: block.x, y: block.y + quadrantHeight, orientation: 'horizontal' },
  //     { name: 'bottom-right', x: block.x + quadrantWidth, y: block.y + quadrantHeight, orientation: 'vertical' }
  //   ];
  //   
  //   quadrants.forEach((quadrant, quadrantIndex) => {
  //     // Generate variable strip dimensions
  //     let stripDimensions;
  //     if (quadrant.orientation === 'vertical') {
  //       // Vertical strips: variable widths, fixed height
  //       stripDimensions = this.generateVariableDimensions(quadrantWidth, 3);
  //     } else {
  //       // Horizontal strips: fixed width, variable heights
  //       stripDimensions = this.generateVariableDimensions(quadrantHeight, 3);
  //     }
  //     
  //     // Calculate cumulative positions
  //     const positions = [0];
  //     for (let i = 0; i < stripDimensions.length; i++) {
  //       positions.push(positions[i] + stripDimensions[i]);
  //     }
  //     
  //     // Create 3 strips in this quadrant
  //     for (let stripIndex = 0; stripIndex < 3; stripIndex++) {
  //       // Create cross pattern: new color (index 1) forms the cross like in reference
  //       // Use all 3 colors: original (0), new (1), darker (2)
  //       let colorIndex;
  //       if (quadrant.name === 'top-left' || quadrant.name === 'bottom-right') {
  //         // Vertical quadrants: middle strip is new color (forms vertical cross)
  //         colorIndex = stripIndex === 1 ? 1 : (stripIndex === 0 ? 0 : 2); // middle = new, outer = original/dark
  //       } else {
  //         // Horizontal quadrants: outer strips are new color (forms horizontal cross)
  //         colorIndex = stripIndex === 1 ? 0 : 1; // middle = original, outer = new
  //       }
  //       
  //       const color = colorPalette[colorIndex];
  //       
  //       // Add jitter
  //       const jitterX = (Math.random() - 0.5) * jitterMultiplier * stripDimensions[stripIndex];
  //       const jitterY = (Math.random() - 0.5) * jitterMultiplier * stripDimensions[stripIndex];
  //       
  //       let stripX, stripY, stripWidth, stripHeight;
  //       
  //       if (quadrant.orientation === 'vertical') {
  //         // Vertical strips
  //         stripX = quadrant.x + positions[stripIndex] + jitterX;
  //         stripY = quadrant.y + jitterY;
  //         stripWidth = stripDimensions[stripIndex];
  //         stripHeight = quadrantHeight;
  //       } else {
  //         // Horizontal strips
  //         stripX = quadrant.x + jitterX;
  //         stripY = quadrant.y + positions[stripIndex] + jitterY;
  //         stripWidth = quadrantWidth;
  //         stripHeight = stripDimensions[stripIndex];
  //       }
  //       
  //       const strip = {
  //         id: block.id + '_pattern_railfence_' + quadrant.name + '_' + stripIndex,
  //         x: stripX,
  //         y: stripY,
  //         width: stripWidth,
  //         height: stripHeight,
  //         color: color,
  //         contributorId: this.deviceId,
  //         submissionIndex: this.submissionCount,
  //         patternType: 'special',
  //         specialPatternType: 'railfence',
  //         originalPatternId: block.id
  //       };
  //       
  //       cells.push(strip);
  //     }
  //   });
  //   
  //   return cells;
  // }
  
  createCrossPattern(block, newColor) {
    // Create a 3x3 cross pattern: center + 4 cross arms + 4 corners
    // Center and cross arms form the cross, corners are different color
    
    // Generate 4-color palette (need 4 colors: original, new, third, fourth for center)
    const colorPalette = this.generateColorPalette(block.color, newColor, 4);
    
    // Calculate cell dimensions for 3x3 grid
    const cellWidth = block.width / 3;
    const cellHeight = block.height / 3;
    
    // Generate variable dimensions for organic feel
    const columnWidths = this.generateVariableDimensions(block.width, 3);
    const rowHeights = this.generateVariableDimensions(block.height, 3);
    
    // Calculate cumulative positions
    const columnPositions = [0];
    const rowPositions = [0];
    for (let i = 0; i < 3; i++) {
      columnPositions.push(columnPositions[i] + columnWidths[i]);
      rowPositions.push(rowPositions[i] + rowHeights[i]);
    }
    
    // Add jitter for organic feel
    const jitterMultiplier = 0.05;
    
    const cells = [];
    
    // Create 3x3 grid
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cellIndex = row * 3 + col;
        
        // Determine if this cell is part of the cross
        const isCenter = (row === 1 && col === 1);
        const isCrossArm = (row === 1 && col !== 1) || (col === 1 && row !== 1);
        const isCorner = (row === 0 || row === 2) && (col === 0 || col === 2);
        
        // Assign colors: center = fourth color, cross arms = new color, corners = third color
        let color;
        if (isCenter) {
          color = colorPalette[3]; // Fourth color for center (distinct from corners)
        } else if (isCrossArm) {
          color = colorPalette[1]; // New color for cross arms
        } else {
          color = colorPalette[2]; // Third color for corners
        }
        
        // Add jitter
        const jitterX = (Math.random() - 0.5) * jitterMultiplier * columnWidths[col];
        const jitterY = (Math.random() - 0.5) * jitterMultiplier * rowHeights[row];
        
        // Calculate cell position and dimensions
        const cellX = block.x + columnPositions[col] + jitterX;
        const cellY = block.y + rowPositions[row] + jitterY;
        const cellWidth = columnWidths[col];
        const cellHeight = rowHeights[row];
        
        const cell = {
          id: block.id + '_pattern_cross_' + cellIndex,
          x: cellX,
          y: cellY,
          width: cellWidth,
          height: cellHeight,
          color: color,
          contributorId: this.deviceId,
          submissionIndex: this.submissionCount,
          patternType: 'special',
          specialPatternType: 'cross',
          originalPatternId: block.id
        };
        
        cells.push(cell);
      }
    }
    
    return cells;
  }
  
  generateColorPalette(baseColor1, baseColor2, numColors = 5) {
    // Generate a palette of colors from 2 base colors
    // Creates lighter and darker versions for patterns that need multiple colors
    // Uses ±15% lightness variations for subtle, harmonious colors
    
    const colors = [baseColor1, baseColor2];
    
    if (numColors <= 2) {
      return colors.slice(0, numColors);
    }
    
    // Convert base colors to HSL for better color manipulation
    const hsl1 = this.hexToHsl(baseColor1);
    const hsl2 = this.hexToHsl(baseColor2);
    
    // Generate additional colors by lightening and darkening
    const additionalColors = [];
    
    // Create lighter versions of both colors (±15% lightness)
    const light1 = this.lightenColorHsl(hsl1, 0.15);
    const light2 = this.lightenColorHsl(hsl2, 0.15);
    
    // Create darker versions of both colors (±15% lightness)
    const dark1 = this.darkenColorHsl(hsl1, 0.15);
    const dark2 = this.darkenColorHsl(hsl2, 0.15);
    
    // Add colors to palette in a logical order
    additionalColors.push(Utils.hslToHex(light1.h, light1.s, light1.l));
    additionalColors.push(Utils.hslToHex(light2.h, light2.s, light2.l));
    additionalColors.push(Utils.hslToHex(dark1.h, dark1.s, dark1.l));
    additionalColors.push(Utils.hslToHex(dark2.h, dark2.s, dark2.l));
    
    // Combine and return the requested number of colors
    const fullPalette = [...colors, ...additionalColors];
    return fullPalette.slice(0, numColors);
  }
  
  lightenColorHsl(hsl, amount) {
    // Lighten a color by increasing lightness, but don't go too light (max 85%)
    return {
      h: hsl.h,
      s: hsl.s,
      l: Math.min(85, hsl.l + (amount * 100))
    };
  }
  
  darkenColorHsl(hsl, amount) {
    // Darken a color by decreasing lightness, but don't go too dark (min 15%)
    return {
      h: hsl.h,
      s: hsl.s,
      l: Math.max(15, hsl.l - (amount * 100))
    };
  }
  
  getColorSimilarity(color1, color2) {
    // Convert hex colors to OKLab for perceptually uniform color similarity
    const oklab1 = this.hexToOklab(color1);
    const oklab2 = this.hexToOklab(color2);
    
    // Calculate Euclidean distance in OKLab space (perceptually uniform)
    const lDiff = oklab1.l - oklab2.l;
    const aDiff = oklab1.a - oklab2.a;
    const bDiff = oklab1.b - oklab2.b;
    
    // OKLab distance (delta E in OKLab space)
    const deltaE = Math.sqrt(lDiff * lDiff + aDiff * aDiff + bDiff * bDiff);
    
    // Convert to similarity (0-1 scale, where 1 = identical)
    // Using strict threshold: deltaE < 1.0 = 90%+ similar
    const similarity = Math.max(0, 1 - (deltaE / 1.0));
    
    return similarity;
  }
  
  hexToHsl(hex) {
    // Fix the RGB parsing bug
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;  // Fixed: was slice(2, 4)
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    
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
      s: s * 100,
      l: l * 100
    };
  }
  
  hexToOklab(hex) {
    // Convert hex to sRGB (0-1 range)
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    
    // Convert sRGB to linear RGB
    const linearR = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const linearG = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const linearB = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    
    // Convert linear RGB to OKLab
    // Using the OKLab transformation matrix
    const l = 0.4122214708 * linearR + 0.5363325363 * linearG + 0.0514459929 * linearB;
    const m = 0.2119034982 * linearR + 0.6806995451 * linearG + 0.1073969566 * linearB;
    const s = 0.0883024619 * linearR + 0.2817188376 * linearG + 0.6299787005 * linearB;
    
    // Apply cube root
    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);
    
    // Convert to OKLab
    const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const bChannel = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
    
    return { l: L, a: a, b: bChannel };
  }

  oklabToHex(L, a, bChannel) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * bChannel;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * bChannel;
    const s_ = L - 0.0894841775 * a - 1.291485548 * bChannel;
    const l = l_ * l_ * l_;
    const m = m_ * m_;
    const s = s_ * s_;
    let rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    const clamp01 = (x) => Math.min(1, Math.max(0, x));
    rLin = clamp01(rLin);
    gLin = clamp01(gLin);
    bLin = clamp01(bLin);
    const enc = (x) =>
      x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    const h = (v) =>
      Math.min(255, Math.max(0, Math.round(enc(v) * 255)))
        .toString(16)
        .padStart(2, '0');
    return `#${h(rLin)}${h(gLin)}${h(bLin)}`;
  }

  
  recordUserContribution(blockId, color, submissionIndex) {
    const contribution = {
      submissionIndex,
      blockId,
      color,
      userId: this.deviceId, // Add user ID to track who contributed
      timestamp: new Date().toISOString()
    };

    const read = (key) => {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && Array.isArray(parsed.submissions)) return parsed;
      } catch (_) {
        /* */
      }
      return { submissions: [] };
    };
    const write = (key, payload) => {
      try {
        localStorage.setItem(key, JSON.stringify(payload));
      } catch (_) {
        /* */
      }
    };

    // Session/day-local store (existing behavior; reset daily by app logic)
    const stored = read('quiltContributions');
    stored.submissions.push(contribution);
    write('quiltContributions', stored);

    // Lifetime store for device personal quilt (NOT cleared by reset handlers).
    const lifetime = read('quiltContributionsLifetime');
    lifetime.submissions.push(contribution);
    write('quiltContributionsLifetime', lifetime);
  }
  
  findUserPieces() {
    const contributions = this.getUserContributions();
    const userBlockIds = new Set();
    
    // Filter contributions by current user ID
    contributions.submissions.forEach(contrib => {
      if (contrib.userId === this.deviceId) {
        userBlockIds.add(contrib.blockId);
      }
    });
    
    return this.blocks.filter((block) => {
      if (userBlockIds.has(block.id)) return true;
      if (block.contributorId === this.deviceId) return true;
      const ids = Array.isArray(block.contributorIds) ? block.contributorIds : [];
      return ids.some((id) => id === this.deviceId);
    });
  }
  
  getUserContributions() {
    const stored = localStorage.getItem('quiltContributions');
    try {
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed && Array.isArray(parsed.submissions)) return parsed;
    } catch (_) {
      /* */
    }
    return { submissions: [] };
  }

  getLifetimeUserContributions() {
    const stored = localStorage.getItem('quiltContributionsLifetime');
    try {
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed && Array.isArray(parsed.submissions)) return parsed;
    } catch (_) {
      /* */
    }
    return { submissions: [] };
  }
  
  getState() {
    return {
      submissionCount: this.submissionCount,
      blocks: this.blocks,
      userPieces: this.findUserPieces()
    };
  }
  
  // Individual block flip state is now handled by the renderer
  
  // ===== RESPONSIVE QUILT DIMENSIONS =====
  recalculateDimensionsForCurrentViewport() {
    if (this.blocks.length === 0) return;
    
    // Get current viewport dimensions
    const currentViewportWidth = window.innerWidth;
    const currentViewportHeight = window.innerHeight;
    
    // Calculate current quilt bounds (don't modify the blocks!)
    const minX = Math.min(...this.blocks.map(b => b.x));
    const minY = Math.min(...this.blocks.map(b => b.y));
    const maxX = Math.max(...this.blocks.map(b => b.x + b.width));
    const maxY = Math.max(...this.blocks.map(b => b.y + b.height));
    
    const currentQuiltWidth = maxX - minX;
    const currentQuiltHeight = maxY - minY;
    
    // Store the original quilt bounds for viewBox calculation
    this.quiltBounds = {
      minX: minX,
      minY: minY,
      width: currentQuiltWidth,
      height: currentQuiltHeight
    };
    
    // Determine target dimensions based on current viewport
    let targetWidth, targetHeight;
    
    // Instagram-friendly: Use 4:5 aspect ratio for consistent experience
    const targetAspectRatio = 4/5; // 4:5 ratio for Instagram portrait format
    
    if (window.innerWidth >= 768) {
      // Desktop: Use mobile aspect ratio, account for button container
      const availableWidth = currentViewportWidth * 0.7; // 70% for quilt container
      const availableHeight = currentViewportHeight;
      
      if (availableWidth / availableHeight > targetAspectRatio) {
        // Viewport is wider than target ratio
        targetHeight = availableHeight;
        targetWidth = availableHeight * targetAspectRatio;
      } else {
        // Viewport is taller than target ratio
        targetWidth = availableWidth;
        targetHeight = availableWidth / targetAspectRatio;
      }
    } else {
      // Mobile: Use 4:5 aspect ratio with breathing room
      const breathingRoom = 0.95; // 95% of viewport for quilt, 5% for breathing room
      const availableWidth = currentViewportWidth * breathingRoom;
      const availableHeight = currentViewportHeight * breathingRoom;
      
      if (availableWidth / availableHeight > targetAspectRatio) {
        // Viewport is wider than target ratio
        targetHeight = availableHeight;
        targetWidth = availableHeight * targetAspectRatio;
      } else {
        // Viewport is taller than target ratio
        targetWidth = availableWidth;
        targetHeight = availableWidth / targetAspectRatio;
      }
    }
    
    // Store target dimensions for rendering
    this.targetDimensions = {
      width: targetWidth,
      height: targetHeight,
      viewport: { width: currentViewportWidth, height: currentViewportHeight }
    };
    
    // console.log('🧵 Quilt viewBox recalculated for current viewport');
  }
}

  root.SimpleQuiltEngine = SimpleQuiltEngine;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
