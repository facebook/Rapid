import * as PIXI from 'pixi.js';

const AreaOrientation = {
  HORIZONTAL: 0,
  VERTICAL: 1
};

const SPLIT_ORIENTATION = {
  HOR: 0,
  VERT: 1,
  NONE: 2
};


/**
 * An area represents an oriented rectangular region. It is implemented as a 31-bit field. The open/close edges are
 * specified along its parent's orientation axis, i.e. if the parent is horizontal, the left and right edges are defined,
 * else if the parent is vertical, the top and bottom edges are defined. Similarly, the open/close edges of its
 * children will be along its own orientation axis.
 *
 * The orientation axes flip-flop along the hierarchy, i.e. an area's parent's orientation is always opposite to
 * the area's own orientation. This is because if the orientation were to be same, the area's children could be
 * "pulled up" to the parent making itself redundant.
 *
 * All four edges of an area can be retrieved from it and its parent.
 *
 *  - OPEN_OFFSET (bits 0-14)
 *     The offset along the parent's axis at which the area begins. If orientation is horizontal,
 *     this is the left edge. If orientation is vertical, this is the top edge.
 *  - CLOSE_OFFSET (bits 15-29)
 *     The offset along the parent's axis at which the area ends. If orientation is horizontal,
 *     this is the right edge. If orientation is vertical, this is the bottom edge.
 *  - ORIENTATION (bit 30)
 *     The orientation of the area, which indicates the axis along it is split. The open and close
 *     offsets of its children are along this axis
 */
class Area {

  static makeArea(openOffset, closeOffset, orientation) {
    return openOffset | (closeOffset << 15) | (orientation << 30);
  }

  static getOpenOffset(area) {
    return area & ((1 << 15) - 1);
  }

  static getCloseOffset(area) {
    return (area >> 15) & ((1 << 15) - 1);
  }

  static getOrientation(area) {
    return (area >> 30) & 1;
  }

  static setOpenOffset(area, offset) {
    return Area.makeArea(
      offset,
      Area.getCloseOffset(area),
      Area.getOrientation(area)
    );
  }

  static setCloseOffset(area, offset) {
    return Area.makeArea(
      Area.getOpenOffset(offset),
      offset,
      Area.getOrientation(area)
    );
  }
}



///**
// * Pointer to guillotene node.
// *
// * @public
// * @ignore
// */
//export type AreaPtr = { __mem_area: AreaNode };


export class GuilloteneAllocator {

  constructor(width, height) {
    this._tempRect = new PIXI.Rectangle();
    this._width = width;
    this._height = height;

    // An allocator node is represented as a tuple. The zeroth element is the parent of the node. The first element
    // always exists and is the texture area it wholly represents. The second element is whether the rectangle
    // is allocated or free. The last element is optional and is the list of its children.
    // NOTE: getFrame assumes root node is always horizontal!
    this._root = [
      null,
      Area.makeArea(0, this._height, AreaOrientation.HORIZONTAL),
      false
    ];
  }

  /**
   * Allocates an area of the given `width` and `height`.
   * @param width - The width required for the allocated area.
   * @param height - The height required for the allocated area.
   * @return The rectangle frame of the area allocated.
   */
  allocate(width, height) {
    const area = this.findArea(width, height);
    if (!area) return null;

    const rect = new PIXI.Rectangle();

    this.getFrame(area, rect);

    const hole = new PIXI.Rectangle(rect.x, rect.y, width, height);
    const node = this.split(area, rect, hole);

    rect.copyFrom(hole);
    rect.__mem_area = node;

    return rect;
  }

  /**
   * Frees the area represented by the given area pointer. The original rectangle returned by
   * {@link GuilloteneAllocator#allocate} included this pointer (the `__mem_area` property).
   * @param rect
   */
  free(rect) {
    const area = rect.__mem_area;
    area[2] = false;
    this._merge(area);
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }

  /**
   * Returns the parent of the area node.
   * @param node
   * @return The parent of `node`
   */
  getParent(node) {
    return node[0];
  }

  /**
   * Returns the [area]{@link Area} data for the node.
   * @param node
   * @returns The area data for the node.
   */
  getAreaField(node) {
    return node[1];
  }


  /**
   * Returns the rectangle covered by the area node.
   * @param node - The node whose covered rectangular area is needed.
   * @param rect - An optional `Rectangle` instance to put the data in.
   * @return The rectangle covered by `node`.
   */
  getFrame(node, rect) {
    if (!rect) {
      rect = new PIXI.Rectangle();
    }

    const nodeArea = this.getAreaField(node);
    const nodeParent = this.getParent(node);
    const nodeOrientation = Area.getOrientation(nodeArea);
    const nodeOpen = Area.getOpenOffset(nodeArea);
    const nodeClose = Area.getCloseOffset(nodeArea);
    const parentOpen = nodeParent ? Area.getOpenOffset(nodeParent[1]) : 0;
    const parentClose = nodeParent ? Area.getCloseOffset(nodeParent[1]) : this._width;// (because root node is horizontal)

    if (nodeOrientation) {  // VERTICAL
      rect.x = nodeOpen;
      rect.y = parentOpen;
      rect.width = nodeClose - rect.x;
      rect.height = parentClose - parentOpen;
    } else {                // HORIZONTAL
      rect.x = parentOpen;
      rect.y = nodeOpen;
      rect.width = parentClose - rect.x;
      rect.height = nodeClose - rect.y;
    }

    return rect;
  }


  /**
   * Returns whether the given node has any children.
   * @param node
   * @return Whether the given node has any children.
   */
  hasChildren(node) {
    return (Array.isArray(node[2]) && (node[2].length !== 0));
  }

  /**
   * Returns the children of the passed node, if any.
   * @param node
   */
  getChildren(node) {
    if (!Array.isArray(node[2])) {
      throw new Error('Children do not exist');
    }
    return node[2];
  }

  addChild(parent, ...nodes) {
    parent[2] = Array.isArray(parent[2]) ? parent[2] : [];
    parent[2].push(...nodes);
  }


  /**
   * Finds an area node with minimum width `aw` and minimum height `ah`.
   * @param aw
   * @param ah
   */
  findArea(aw, ah) {
    return this.findAreaRecursive(this._root, aw, ah);
  }

  /**
   * @param node
   * @param aw
   * @param ah
   */
  findAreaRecursive(node, aw, ah) {
    const frame = this.getFrame(node, this._tempRect);
    if (frame.width < aw || frame.height < ah) return null;

    if (!this.hasChildren(node)) {
      const dx = frame.width - aw;
      const dy = frame.height - ah;
      if (dx < 0 || dy < 0 || node[2]) {
        return null;
      }
      return node;
    }

    const children = this.getChildren(node);

    let bestCandidate = null;
    let bestCandidateScore = Infinity;

    for (const child of children) {
      const candidate = this.findAreaRecursive(child, aw, ah);
      if (!candidate) continue;

      const candidateFrame = this.getFrame(candidate, this._tempRect);
      const dx = candidateFrame.width - aw;
      const dy = candidateFrame.height - ah;
      if (dx < 0 || dy < 0) continue;

      if (!dx && !dy) { // Perfect fit!
        return candidate;
      }

      const score = Math.min(dx, dy);
      if (bestCandidateScore > score) {
        bestCandidate = candidate;
        bestCandidateScore = score;
      }
    }

    return bestCandidate;
  }


  /**
   * Returns the orientation of the primary split of host.
   * @param {PIXI.Rectangle} host
   * @param {PIXI.Rectangle} hole
   * @returns  {number} the SPLIT_ORIENTATION value
   */
  splitOrientation(host, hole) {
    if (hole.width === host.width && hole.height === host.height) {
      return SPLIT_ORIENTATION.NONE;
    }
    if (hole.width === host.width) {
      return SPLIT_ORIENTATION.VERT;
    }
    if (hole.height === host.height) {
      return SPLIT_ORIENTATION.HOR;
    }

    // ____________________
    // |        |         |
    // |  hole  |         |
    // |________| Primary |
    // |        |         |
    // |  Sec.  |         |
    // |________|_________|
    const horAreaDiff = Math.abs(
      // (Primary) Right
      (host.width - hole.width) * host.height -
      // (Secondary) Bottom
      hole.width * (host.height - hole.height)
    );

    // ____________________
    // |        |         |
    // |  hole  |  Sec.   |
    // |________|_________|
    // |                  |
    // |    Primary       |
    // |__________________|
    const verAreaDiff = Math.abs(
      // (Primary) Bottom
      host.width * (host.height - hole.height) -
      (host.width - hole.width) * hole.height
    );

    if (horAreaDiff > verAreaDiff) {
      return SPLIT_ORIENTATION.HOR;
    } else {
      return SPLIT_ORIENTATION.VERT;
    }
  }


  /**
   * Splits (or deallocates) an area, returning the area
   * @param {AreaNode} area
   * @param {PIXI.Rectangle} areaFrame
   * @param {PIXI.Rectangle} holeFrame
   * @param {number} orientation - SPLIT_ORIENTATION value
   * @returns {AreaNode}
   */
  split(area, areaFrame, holeFrame, orientation) {
    if (!orientation) {
      orientation = this.getParent(area) ? this.splitOrientation(areaFrame, holeFrame) : SPLIT_ORIENTATION.HOR;
    }

    if (area[2] === true) {
      throw new Error('Cannot deallocate');
    }

    if (orientation === SPLIT_ORIENTATION.NONE) {
      area[2] = true;
      return area;

    } else if (orientation === SPLIT_ORIENTATION.HOR) {
      return this._splitPrimaryHorizontal(area, areaFrame, holeFrame);

    } else {
      return this._splitPrimaryVertical(area, areaFrame, holeFrame);
    }
  }


  _splitPrimaryHorizontal(area, areaFrame, holeFrame) {
    const field = this.getAreaField(area);
    const axis = Area.getOrientation(field);
    const parent = this.getParent(area);

    if (this.hasChildren(area)) {
      throw new Error('Cannot split non-leaf node');
    }

    const firstChild = [
      area,
      Area.makeArea(areaFrame.left, areaFrame.x + holeFrame.width, AreaOrientation.VERTICAL),
      []
    ];
    const secondChild = [
      area,
      Area.makeArea(areaFrame.x + holeFrame.width, areaFrame.right, AreaOrientation.VERTICAL),
      false
    ];

    if (axis === AreaOrientation.HORIZONTAL) {
      this.addChild(area, firstChild, secondChild);

    } else {
      const i = this.getChildren(parent).indexOf(area);
      firstChild[0] = parent;
      secondChild[0] = parent;
      this.getChildren(parent).splice(i, 1, firstChild, secondChild);
    }

    if (holeFrame.height !== areaFrame.height) {
      const secondaryFirstChild = [
        firstChild,
        Area.makeArea(areaFrame.top, areaFrame.y + holeFrame.height, AreaOrientation.HORIZONTAL),
        true
      ];
      const secondarySecondChild = [
        firstChild,
        Area.makeArea(areaFrame.y + holeFrame.height, areaFrame.bottom, AreaOrientation.HORIZONTAL),
        false
      ];

      this.addChild(firstChild, secondaryFirstChild, secondarySecondChild);
      return secondaryFirstChild;

    } else {
      firstChild[2] = true;
    }

    return firstChild;
  }


  _splitPrimaryVertical(area, areaFrame, holeFrame) {
    const field = this.getAreaField(area);
    const axis = Area.getOrientation(field);
    const parent = this.getParent(area);

    if (this.hasChildren(area)) {
      throw new Error('Cannot split non-leaf node');
    }

    const primaryFirstChild = [
      area,
      Area.makeArea(areaFrame.top, areaFrame.y + holeFrame.height, AreaOrientation.HORIZONTAL),
      []
    ];
    const primarySecondChild = [
      area,
      Area.makeArea(areaFrame.y + holeFrame.height, areaFrame.bottom, AreaOrientation.HORIZONTAL),
      false
    ];

    if (axis === AreaOrientation.VERTICAL) {
      this.addChild(area, primaryFirstChild, primarySecondChild);

    } else {
      const i = this.getChildren(parent).indexOf(area);
      primaryFirstChild[0] = parent;
      primarySecondChild[0] = parent;
      this.getChildren(parent).splice(i, 1, primaryFirstChild, primarySecondChild);
    }

    if (holeFrame.width !== areaFrame.height) {
      const secondaryFirstChild = [
        primaryFirstChild,
        Area.makeArea(areaFrame.left, areaFrame.x + holeFrame.width, AreaOrientation.VERTICAL),
        true
      ];
      const secondarySecondChild = [
        primaryFirstChild,
        Area.makeArea(areaFrame.x + holeFrame.width, areaFrame.right, AreaOrientation.VERTICAL),
        false
      ];

      this.addChild(primaryFirstChild, secondaryFirstChild, secondarySecondChild);
      return secondaryFirstChild;

    } else {
      primaryFirstChild[2] = true;
    }

    return primaryFirstChild;
  }


  _merge(area) {
    if (this.hasChildren(area)) {
      throw new Error('Cannot merge a non-leaf node');
    }

    const parent = this.getParent(area);
    if (!parent) return;

    const siblings = this.getChildren(parent);
    const i = siblings.indexOf(area);

    const leftSibling = siblings[i - 1];
    const rightSibling = siblings[i + 1];

    if (rightSibling && rightSibling[2] === false) {
      // Merge rightSibling into area
      area[1] = Area.setCloseOffset(area[1], Area.getCloseOffset(rightSibling[1]));
      siblings.splice(i + 1, 1);
    }

    if (leftSibling && leftSibling[2] === false) {
      // Merge leftSibling into area
      area[1] = Area.setOpenOffset(area[1], Area.getOpenOffset(leftSibling[1]));
      siblings.splice(i - 1, 1);
    }

    if (siblings.length === 1) {
      parent[2] = false;
      this._merge(parent);
    }
  }


  printState(area) {
    if (!this.hasChildren(area)) {
      console.log({ ...this.getFrame(area) }, area[2]);  // eslint-disable-line no-console
    } else {
      this.getChildren(area).forEach(n => this.printState(n));
    }
  }
}
