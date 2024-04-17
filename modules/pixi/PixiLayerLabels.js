import * as PIXI from 'pixi.js';
import RBush from 'rbush';
import { HALF_PI, TAU, numWrap, vecAdd, vecAngle, vecScale, vecSubtract, geomRotatePoints } from '@rapid-sdk/math';

import { AbstractLayer } from './AbstractLayer.js';
import { getLineSegments, /*getDebugBBox,*/ lineToPoly } from './helpers.js';


const MINZOOM = 12;

const TEXT_NORMAL = {
  fill: 0x333333,
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: 11,
  fontWeight: 600,
  lineJoin: 'round',
  stroke: 0xffffff,
  strokeThickness: 2.7
};

const TEXT_ITALIC = {
  fill: 0x333333,
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: 11,
  fontStyle: 'italic',
  fontWeight: 600,
  lineJoin: 'round',
  stroke: 0xffffff,
  strokeThickness: 2.7
};



/**
 *  These 'Labels' are placeholders for where a label can go.
 *  The display objects are added to the scene lazily only after the user
 *  has scrolled the placement box into view - see `renderObjects()`
 */
class Label {
  constructor(id, type, options) {
    this.id = id;
    this.type = type;
    this.options = options;
    this.dObjID = null;    // Display Object ID
  }
}


/**
 * PixiLayerLabels
 * @class
 */
export class PixiLayerLabels extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);
    this.enabled = true;   // labels should be enabled by default

    // Items in this layer don't actually need to be interactive
    const groupContainer = this.scene.groups.get('labels');
    groupContainer.eventMode = 'none';

    const labelOriginContainer = new PIXI.Container();
    labelOriginContainer.name = 'labelorigin';
    labelOriginContainer.eventMode = 'none';
    this.labelOriginContainer = labelOriginContainer;

    const debugContainer = new PIXI.Container();  //PIXI.ParticleContainer(50000);
    debugContainer.name = 'debug';
    debugContainer.eventMode = 'none';
    debugContainer.roundPixels = false;
    debugContainer.sortableChildren = false;
    this.debugContainer = debugContainer;

    const labelContainer = new PIXI.Container();
    labelContainer.name = 'labels';
    labelContainer.eventMode = 'none';
    labelContainer.sortableChildren = true;
    this.labelContainer = labelContainer;

    groupContainer.addChild(labelOriginContainer);
    labelOriginContainer.addChild(debugContainer, labelContainer);


    // A RBush spatial index that stores all the placement boxes
    this._rbush = new RBush();

    // These Maps store "Boxes" which are indexed in the label placement RBush.
    // We store them in several maps because some features (like vertices)
    // can be both an avoidance but also have a label placed by it.
    this._avoidBoxes = new Map();   // Map (featureID -> Array[avoid Boxes] )
    this._labelBoxes = new Map();   // Map (featureID -> Array[label Boxes] )

    // After working out the placement math, we don't automatically render display objects,
    // since many objects would get placed far offscreen.
    this._labels = new Map();    // Map (labelID -> Label Object)
    // Display Objects includes anything managed by this layer: labels and debug boxes
    this._dObjs = new Map();     // Map (dObjID -> Display Object)

    // We reset the labeling when scale or rotation change
    this._tPrev = { x: 0, y: 0, k: 256 / Math.PI, r: 0 };
    // Tracks the difference between the top left corner of the screen and the parent "origin" container
    this._labelOffset = new PIXI.Point();

    // For ascii-only labels, we can use PIXI.BitmapText to avoid generating label textures
    PIXI.BitmapFont.from('label-normal', TEXT_NORMAL, { chars: PIXI.BitmapFont.ASCII, padding: 0, resolution: 2 });
    // not actually used
    // PIXI.BitmapFont.from('label-italic', TEXT_ITALIC, { chars: PIXI.BitmapFont.ASCII, padding: 0, resolution: 2 });

    // For all other labels, generate it on the fly in a PIXI.Text or PIXI.Sprite
    this._textStyleNormal = new PIXI.TextStyle(TEXT_NORMAL);
    this._textStyleItalic = new PIXI.TextStyle(TEXT_ITALIC);
  }


  /**
   * reset
   * Every Layer should have a reset function to clear out any state when a reset occurs.
   */
  reset() {
    super.reset();

    this.labelContainer.removeChildren();
    this.debugContainer.removeChildren();

    for (const dObj of this._dObjs.values()) {
      dObj.destroy({ children: true, texture: false, baseTexture: false });
    }
    for (const label of this._labels.values()) {
      label.dObjID = null;
//      if (textureManager.get('text', label.str)) {
//        textureManager.free('text', label.str);
//      }
    }

    this._avoidBoxes.clear();
    this._labelBoxes.clear();
    this._dObjs.clear();
    this._labels.clear();
    this._rbush.clear();

    for (const feature of this.scene.features.values()) {
      feature._labelDirty = false;
    }
  }


  /**
   * resetFeature
   * Remove all data from the scene and from all caches for the given feature
   * @param  featureID  the feature ID to remove the label data
   */
  resetFeature(featureID) {
    const boxes = new Set();
    const labelIDs = new Set();
    const dObjIDs = new Set();

    // Gather all boxes related to this feature
    (this._avoidBoxes.get(featureID) || []).forEach(box => boxes.add(box));
    (this._labelBoxes.get(featureID) || []).forEach(box => boxes.add(box));

    // Remove Boxes, and gather Labels and Display Objects
    for (const box of boxes) {
      this._rbush.remove(box);
      if (box.labelID) {
        labelIDs.add(box.labelID);
        box.labelID = null;
      }
      if (box.dObjID)  {
        dObjIDs.add(box.dObjID);
        box.dObjID = null;
      }
    }

    this._avoidBoxes.delete(featureID);
    this._labelBoxes.delete(featureID);

    // Remove Labels, and gather Display Objects
    for (const labelID of labelIDs) {
      const label = this._labels.get(labelID);
      if (label?.dObjID)  {
        dObjIDs.add(label.dObjID);
        label.dObjID = null;
      }
      this._labels.delete(labelID);
    }

    // Remove Display Objects (they automatically remove from parent containers)
    for (const dObjID of dObjIDs) {
      const dObj = this._dObjs.get(dObjID);
      if (dObj) {
        dObj.destroy({ children: true, texture: false, baseTexture: false });
      }
      this._dObjs.delete(dObjID);
    }
  }


  /**
   * render
   * Render all the labels. This is a multi-step process:
   * - gather avoids - these are places in the scene that we don't want a label
   * - label placement - do the math of figuring out where labels should be
   * - label rendering - show or hide labels based on their visibility
   *
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {

    if (this.enabled && zoom >= MINZOOM) {
      this.labelContainer.visible = true;
      this.debugContainer.visible = true;  // this.context.getDebug('label');

      // Reset labels
      const tPrev = this._tPrev;
      const tCurr = viewport.transform.props;
      if (tCurr.k !== tPrev.k || tCurr.r !== tPrev.r) {  // zoom or rotation changed
        this.reset();                                    // reset all labels
      } else {
        for (const [featureID, feature] of this.scene.features) {
          if (feature._labelDirty) {       // reset only the changed labels
            this.resetFeature(featureID);
            feature._labelDirty = false;
          }
        }
      }
      this._tPrev = tCurr;


      // The label container should be kept unrotated so that it stays screen-up not north-up.
      // We need to counter the effects of the 'stage' and 'origin' containers that we are underneath.
      const stage = this.renderer.stage.position;
      const origin = this.renderer.origin.position;
      const bearing = viewport.transform.rotation;

      // Determine the difference between the global/screen coordinate system (where [0,0] is top left)
      // and the `origin` coordinate system (which can be panned around or be under a rotation).
      // We need to save this labeloffset for use elsewhere, it is the basis for having a consistent coordinate
      // system to track labels to place and objects to avoid. (we apply it to values we get from `getBounds`)
      const labelOffset = this._labelOffset;
      this.renderer.origin.toGlobal({ x: 0, y: 0 }, labelOffset);

      const groupContainer = this.scene.groups.get('labels');
      groupContainer.position.set(-origin.x, -origin.y);     // undo origin - [0,0] is now center
      groupContainer.rotation = -bearing;                    // undo rotation

      const labelOriginContainer = this.labelOriginContainer;
      labelOriginContainer.position.set(-stage.x + labelOffset.x, -stage.y + labelOffset.y);  // replace origin

      // Collect features to avoid.
      this.gatherAvoids();

      // Collect features to place labels on.
      let points = [];
      let lines = [];
      let polygons = [];
      for (const [featureID, feature] of this.scene.features) {
        // If the feature can be labeled, and hasn't yet been, add it to the list for placement.
        if (feature.label && feature.visible && !this._labelBoxes.has(featureID)) {
          if (feature.type === 'point') {
            points.push(feature);
          } else if (feature.type === 'line') {
            lines.push(feature);
          } else if (feature.type === 'polygon') {
            polygons.push(feature);
          }
        }
      }

      // Points first, then lines (so line labels can avoid point labels)
      this.labelPoints(points);
      this.labelLines(lines);
      this.labelPolygons(polygons);

      this.renderObjects();

    } else {
      this.labelContainer.visible = false;
      this.debugContainer.visible = false;
    }
  }


  /**
   * getLabelSprite
   * @param  str    String for the label
   * @param  style  'normal' or 'italic'
   */
  getLabelSprite(str, style = 'normal') {
    const textureID = `${str}-${style}`;
    const textureManager = this.renderer.textures;

    let texture = textureManager.getTexture('text', textureID);

    if (!texture) {
      // Add some extra padding if we detect unicode combining marks in the text - see Rapid#653
      let pad = 0;
      const marks = str.match(/\p{M}/gu);        // add /u to get a unicode-aware regex
      if (marks && marks.length > 0)  pad = 10;  // Text with a few ascenders/descenders?
      if (marks && marks.length > 20) pad = 50;  // Zalgotext?

      let textStyle;
      if (pad) {   // make a new style
        const props = Object.assign({}, (style === 'normal' ? TEXT_NORMAL : TEXT_ITALIC), { padding: pad });
        textStyle = new PIXI.TextStyle(props);
      } else {     // use a cached style
        textStyle = (style === 'normal' ? this._textStyleNormal : this._textStyleItalic);
      }

      // Generate the Text
      const text = new PIXI.Text(str, textStyle);
      text.resolution = 2;
      text.updateText(false);  // force update it so the texture is prepared

      // Copy the texture data into the atlas.
      // Also remove x-padding, as this will only end up pushing the label away from the pin.
      // (We are mostly interested in y-padding diacritics, see Rapid#653)
      // Note: Whatever padding we set before got doubled because resolution = 2
      const [x, y] = [pad * 2, 0];
      const [w, h] = [text.canvas.width - (pad * 4), text.canvas.height];
      const data = text.context.getImageData(x, y, w, h);

      texture = textureManager.allocate('text', str, w, h, data);

      // These textures are overscaled, but `orig` Rectangle stores the original width/height
      // (i.e. the dimensions that a PIXI.Sprite using this texture will want to make itself)
      // We need to manually adjust these values so that the Sprites or Ropes know how big to be.
      texture.orig = text.texture.orig.clone();
      texture.orig.width = w / 2;
      texture.orig.height = h / 2;

      text.destroy();  // safe to destroy, the texture is copied to the atlas
    }

    const sprite = new PIXI.Sprite(texture);
    sprite.name = str;
    sprite.anchor.set(0.5, 0.5);   // middle, middle
    return sprite;
  }


  /**
   * gatherAvoids
   * Gather the avoidable features, create boxes for them,
   *  and insert them into the placement Rbush.
   * If a new avoidance collides with an already placed label,
   *  destroy the label and flag the feature as labeldirty for relabeling
   */
  gatherAvoids() {
    const avoidObject = _avoidObject.bind(this);

    // Gather the containers that have avoidable stuff on them
    const avoidContainers = [];

    const mapUIContainer = this.scene.layers.get('map-ui').container;
    const selectedContainer = mapUIContainer.getChildByName('selected');
    if (selectedContainer) {
      avoidContainers.push(selectedContainer);
    }
    const pointsContainer = this.scene.groups.get('points');
    if (pointsContainer) {
      avoidContainers.push(pointsContainer);
    }

    // For each container, gather the avoid boxes
    let toInsert = [];
    for (const container of avoidContainers) {
      for (const child of container.children) {
        avoidObject(child);
      }
    }

    if (toInsert.length) {
      this._rbush.load(toInsert);  // bulk insert
    }


    // Adds the given display object as an avoidance
    function _avoidObject(sourceObject) {
      if (!sourceObject.visible || !sourceObject.renderable) return;
      const featureID = sourceObject.name;
      if (this._avoidBoxes.has(featureID)) return;  // we've processed this avoidance already

      // The rectangle is in global/screen coordinates (where [0,0] is top left).
      // To work in a coordinate system that is consistent, remove the label offset.
      // If we didn't do this, as the user pans or rotates the map, the objects that leave
      // and re-enter the scene would end up with different coordinates each time!
      const fRect = sourceObject.getBounds();
      fRect.x -= this._labelOffset.x;
      fRect.y -= this._labelOffset.y;

      const EPSILON = 0.01;
      const boxID = `${featureID}-avoid`;

      const box = {
        type: 'avoid',
        boxID: boxID,
        dObjID: boxID,   // for the debug sprite, if shown
        featureID: featureID,
        minX: fRect.x + EPSILON,
        minY: fRect.y + EPSILON,
        maxX: fRect.x + fRect.width - EPSILON,
        maxY: fRect.y + fRect.height - EPSILON
      };

      this._avoidBoxes.set(featureID, [box]);
      toInsert.push(box);

//const tint = 0xff0000;
//const sprite = getDebugBBox(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY, tint, 0.75, boxID);
//this.debugContainer.addChild(sprite);
//this._dObjs.set(boxID, sprite);

      // If there is already a label where this avoid box is, we will need to redo that label.
      // This is somewhat common that a label will be placed somewhere, then as more map loads,
      // we learn that some of those junctions become important and we need to avoid them.
      const existingBoxes = this._rbush.search(box);
      for (const existingBox of existingBoxes) {
        if (existingBox.type === 'label') {
          const existingFeature = this.scene.features.get(existingBox.featureID);
          if (existingFeature) {
            existingFeature._labelDirty = true;
          }
        }
      }

    }
  }


  /**
   * labelPoints
   * This calculates the placement, but does not actually add the label to the scene.
   * @param  features  The features to place point labels on
   */
  labelPoints(features) {
    features.sort((a, b) => b.geometry.origCoords[1] - a.geometry.origCoords[1]);

    for (const feature of features) {
      if (this._labelBoxes.has(feature.id)) continue;  // processed it already
      this._labelBoxes.set(feature.id, []);

      if (!feature.label) continue;  // nothing to do

      let labelObj;
      if (/^[\x20-\x7E]*$/.test(feature.label)) {   // is it in the printable ASCII range?
        labelObj = new PIXI.BitmapText(feature.label, { fontName: 'label-normal' });
        labelObj.updateText();           // force update it so its texture is ready to be reused on a sprite
        labelObj.name = feature.label;
        // labelObj.anchor.set(0.5, 0.5);   // middle, middle
        labelObj.anchor.set(0.5, 1);     // middle, bottom  - why??
      } else {
        labelObj = this.getLabelSprite(feature.label, 'normal');
      }

      this.placeTextLabel(feature, labelObj);
    }
  }


  /**
   * labelLines
   * Lines are labeled with PIXI.SimpleRope that run along the line.
   * This calculates the placement, but does not actually add the rope label to the scene.
   * @param  features  The features to place line labels on
   */
  labelLines(features) {
    // This is hacky, but we can sort the line labels by their parent container name.
    // It might be a level container with a name like "1", "-1", or just a name like "lines"
    // If `parseInt` fails, just sort the label above everything.
    function level(feature) {
      const lvl = parseInt(feature.container.parent.name, 10);
      return isNaN(lvl) ? 999 : lvl;
    }

    features.sort((a, b) => level(b) - level(a));

    for (const feature of features) {
      const featureID = feature.id;

      if (this._labelBoxes.has(featureID)) continue;  // processed it already
      this._labelBoxes.set(featureID, []);

      if (!feature.label) continue;                                                 // no label
      if (!feature.geometry.coords) continue;                                       // no points
      if (!feature.container.visible || !feature.container.renderable) continue;    // not visible
      if (feature.geometry.width < 40 && feature.geometry.height < 40) continue;    // too small

      const labelObj = this.getLabelSprite(feature.label, 'normal');

      this.placeRopeLabel(feature, labelObj, feature.geometry.coords);
    }
  }


  /**
   * labelPolygons
   * Polygons are labeled with PIXI.SimpleRope that run along the inside of the perimeter.
   * This calculates the placement, but does not actually add the rope label to the scene.
   * @param  features  The features to place line labels on
   */
  labelPolygons(features) {
    for (const feature of features) {
      const featureID = feature.id;

      if (this._labelBoxes.has(featureID)) continue;  // processed it already
      this._labelBoxes.set(featureID, []);

      if (!feature.label) continue;                                                 // no label
      if (!feature.geometry.flatOuter) continue;                                    // no points
      if (!feature.container.visible || !feature.container.renderable) continue;    // not visible
      if (feature.geometry.width < 600 && feature.geometry.height < 600) continue;  // too small

      const labelObj = this.getLabelSprite(feature.label, 'italic');

// precompute a line buffer in geometry maybe?
const hitStyle = {
  alignment: 0.5,  // middle of line
  color: 0x0,
  width: 24,
  alpha: 1.0,
  join: PIXI.LINE_JOIN.BEVEL,
  cap: PIXI.LINE_CAP.BUTT
};
const bufferdata = lineToPoly(feature.geometry.flatOuter, hitStyle);
if (!bufferdata.inner) continue;
let coords = new Array(bufferdata.inner.length / 2);  // un-flatten :(
for (let i = 0; i < bufferdata.inner.length / 2; ++i) {
  coords[i] = [ bufferdata.inner[(i * 2)], bufferdata.inner[(i * 2) + 1] ];
}
this.placeRopeLabel(feature, labelObj, coords);

    }
  }


  /**
   * placeTextLabel
   * Text labels are used to label point features like map pins.
   * We generate several placement regions around the marker,
   * try them until we find one that doesn't collide with something.
   *
   * @param  feature   The feature to place point labels on
   * @param  labelObj  a PIXI.Sprite, PIXI.Text, or PIXI.BitmapText to use as the label
   */
  placeTextLabel(feature, labelObj) {
    if (!feature || !feature.sceneBounds) return;

    const featureID = feature.id;
    const container = feature.container;
    if (!container.visible || !container.renderable) return;

    // `f` - feature, these bounds are in "global" coordinates
    // The rectangle is in global/screen coordinates (where [0,0] is top left).
    // To work in a coordinate system that is consistent, remove the label offset.
    // If we didn't do this, as the user pans or rotates the map, the objects that leave
    // and re-enter the scene would end up with different coordinates each time!
    const fRect = container.getBounds().clone().pad(1, 0);
    fRect.x -= this._labelOffset.x;
    fRect.y -= this._labelOffset.y;

    const fLeft = fRect.x;
    const fTop = fRect.y;
    const fWidth = fRect.width;
    const fHeight = fRect.height;
    const fRight = fRect.x + fWidth;
    const fMidX = fRect.x + (fWidth * 0.5);
    const fBottom = fRect.y + fHeight;
    const fMidY = (feature.type === 'point') ? (fRect.y + fHeight - 14)  // next to marker
      : (fRect.y + (fHeight * 0.5));

    // `l` = label, these bounds are in "local" coordinates to the label,
    // 0,0 is the center of the label
    // (padY -1, because for some reason, calculated height seems higher than necessary)
    const lRect = labelObj.getLocalBounds().clone().pad(0, -1);
    const some = 5;
    const more = 10;
    const lWidth = lRect.width;
    const lHeight = lRect.height;
    const lWidthHalf = lWidth * 0.5;
    const lHeightHalf = lHeight * 0.5;

    // Attempt several placements (these are calculated in "global" coordinates)
    const placements = {
      t1: [fMidX - more,  fTop - lHeightHalf],       //    t1 t2 t3 t4 t5
      t2: [fMidX - some,  fTop - lHeightHalf],       //      +---+---+
      t3: [fMidX,         fTop - lHeightHalf],       //      |       |
      t4: [fMidX + some,  fTop - lHeightHalf],       //      |       |
      t5: [fMidX + more,  fTop - lHeightHalf],       //      +---+---+

      b1: [fMidX - more,  fBottom + lHeightHalf],    //      +---+---+
      b2: [fMidX - some,  fBottom + lHeightHalf],    //      |       |
      b3: [fMidX,         fBottom + lHeightHalf],    //      |       |
      b4: [fMidX + some,  fBottom + lHeightHalf],    //      +---+---+
      b5: [fMidX + more,  fBottom + lHeightHalf],    //    b1 b2 b3 b4 b5

      r1: [fRight + lWidthHalf,  fMidY - more],      //      +---+---+  r1
      r2: [fRight + lWidthHalf,  fMidY - some],      //      |       |  r2
      r3: [fRight + lWidthHalf,  fMidY],             //      |       |  r3
      r4: [fRight + lWidthHalf,  fMidY + some],      //      |       |  r4
      r5: [fRight + lWidthHalf,  fMidY + more],      //      +---+---+  r5

      l1: [fLeft - lWidthHalf,  fMidY - more],       //  l1  +---+---+
      l2: [fLeft - lWidthHalf,  fMidY - some],       //  l2  |       |
      l3: [fLeft - lWidthHalf,  fMidY],              //  l3  |       |
      l4: [fLeft - lWidthHalf,  fMidY + some],       //  l4  |       |
      l5: [fLeft - lWidthHalf,  fMidY + more]        //  l5  +---+---+
    };

    // In order of preference (If left-to-right language, prefer the right of the pin)
    // Prefer placements that are more "visually attached" to the pin (right,bottom,left,top)
    // over placements that are further away (corners)
    let attempts;
    const isRTL = this.context.systems.l10n.isRTL();

    if (isRTL) {   // right to left
      attempts = [
        'l3', 'l4', 'l2',
        'b3', 'b2', 'b4', 'b1', 'b5',
        't3', 't2', 't4', 't1', 't5',
        'r3', 'r4', 'r2',
        'l5', 'l1',
        'r5', 'r1'
      ];
    } else {   // left to right
      attempts = [
        'r3', 'r4', 'r2',
        'b3', 'b4', 'b2', 'b5', 'b1',
        'l3', 'l4', 'l2',
        't3', 't4', 't2', 't5', 't1',
        'r5', 'r1',
        'l5', 'l1'
      ];
    }

//    let picked = null;
    for (const placement of attempts) {
      const [x, y] = placements[placement];
      const EPSILON = 0.01;
      const box = {
        type: 'label',
        boxID: `${featureID}-${placement}`,
        featureID: featureID,
        labelID: featureID,
        minX: x - lWidthHalf + EPSILON,
        minY: y - lHeightHalf + EPSILON,
        maxX: x + lWidthHalf - EPSILON,
        maxY: y + lHeightHalf - EPSILON
      };

      // If we can render the label in this box..
      // Create a new Label placeholder, and insert the box
      // into the rbush so nothing else gets placed there.
      if (!this._rbush.collides(box)) {
        const label = new Label(featureID, 'text', {
          str: feature.label,
          labelObj: labelObj,
          box: box,
          x: x,
          y: y,
          tint: feature.style.labelTint || 0xeeeeee
        });

        this._labels.set(featureID, label);
        this._labelBoxes.get(featureID).push(box);
        this._rbush.insert(box);
//        picked = placement;
        break;
      }
    }

//    if (!picked) {
//      labelObj.destroy({ children: true });  // didn't place it
//    }
  }


  /**
   * placeRopeLabel
   * Rope labels are placed along a string of coordinates.
   * We generate chains of bounding boxes along the line,
   * then add the labels in spaces along the line wherever they fit.
   *
   * @param  feature   The feature to place point labels on
   * @param  labelObj  a PIXI.Sprite to use as the label
   * @param  origCoords    The coordinates to place a rope on (these are coords relative to 'origin' container)
   */
  placeRopeLabel(feature, labelObj, origCoords) {
    if (!feature || !labelObj || !origCoords) return;
    if (!feature.container.visible || !feature.container.renderable) return;

    const featureID = feature.id;

    // `l` = label, these bounds are in "local" coordinates to the label,
    // 0,0 is the center of the label
    const lRect = labelObj.getLocalBounds();
    const lWidth = lRect.width;
    const lHeight = lRect.height;
    const BENDLIMIT = Math.PI / 8;

    // The size of the collision test bounding boxes, in pixels.
    // Higher numbers will be faster but yield less granular placement
    const boxsize = lHeight + 4;
    const boxhalf = boxsize * 0.5;

    // # of boxes needed to provide enough length for this label
    const numBoxes = Math.ceil(lWidth / boxsize) + 1;
    // Labels will be stretched across boxes slightly, this will scale them back to `lWidth` pixels
    const scaleX = lWidth / ((numBoxes-1) * boxsize);
    // We'll break long chains into smaller regions and center a label within each region
    const maxChainLength = numBoxes + 15;


    // Convert from original projected coords to global coords..
    const origin = this.renderer.origin;
    const labelOffset = this._labelOffset;
    const temp = new PIXI.Point();
    const coords = origCoords.map(([x, y]) => {
      origin.toGlobal({x: x, y: y}, temp, true /* skip updates ok? - we called toGlobal already */);
      return [temp.x - labelOffset.x, temp.y - labelOffset.y];
    });

    // Cover the line in bounding boxes
    const segments = getLineSegments(coords, boxsize);

    let boxes = [];
    let candidates = [];
    let currChain = [];
    let prevAngle = null;


    // Finish current chain of bounding boxes, if any.
    // It will be saved as a label candidate if it is long enough.
    function finishChain() {
      const isCandidate = (currChain.length >= numBoxes);
      if (isCandidate) {
        candidates.push(currChain);
      }
      currChain.forEach(link => {
        link.box.candidate = isCandidate;
        boxes.push(link.box);
      });

      currChain = [];   // reset chain
    }


    // Walk the line, creating chains of bounding boxes,
    // and testing for candidate chains where labels can go.
    segments.forEach((segment, segmentIndex) => {
      const currAngle = numWrap(segment.angle, 0, TAU);  // normalize to 0…2π

      segment.coords.forEach((coord, coordIndex) => {
        const boxID = `${featureID}-${segmentIndex}-${coordIndex}`;
        const [x, y] = coord;
        const EPSILON = 0.01;
        const box = {
          type: 'label',
          boxID: boxID,
          dObjID: boxID,   // for the debug sprite, if shown
          featureID: featureID,
          minX: x - boxhalf + EPSILON,
          minY: y - boxhalf + EPSILON,
          maxX: x + boxhalf - EPSILON,
          maxY: y + boxhalf - EPSILON
        };

        // Avoid placing labels where the line bends too much..
        let tooBendy = false;
        if (prevAngle !== null) {
          // compare angles properly: https://stackoverflow.com/a/1878936/7620
          const diff = Math.abs(currAngle - prevAngle);
          tooBendy = Math.min(TAU - diff, diff) > BENDLIMIT;
        }
        prevAngle = currAngle;

        if (tooBendy) {
          finishChain();
          box.bendy = true;
          boxes.push(box);

        } else if (this._rbush.collides(box)) {
          finishChain();
          box.collides = true;
          boxes.push(box);

        } else {   // Label can go here..
          currChain.push({ box: box, coord: coord, angle: currAngle });
          if (currChain.length === maxChainLength) {
            finishChain();
          }
        }

//const tint = box.collides ? 0xff0000 : box.bendy ? 0xff33ff : 0x00ff00;
//const sprite = getDebugBBox(box.minX, box.minY, box.maxX-box.minX, box.maxY-box.minY, tint, 0.75, boxID);
//this.debugContainer.addChild(sprite);
//this._dObjs.set(boxID, sprite);

      });
    });

    finishChain();


    // Compute a Label placement in the middle of each chain,
    // and insert the boxes into the rbush so nothing else gets placed there.
    candidates.forEach((chain, chainIndex) => {
      // Set aside half any extra boxes at the beginning of the chain
      // (This centers the label within the chain)
      const startIndex = Math.floor((chain.length - numBoxes) / 2);
      const labelID = `${featureID}-rope-${chainIndex}`;

      let coords = [];
      for (let i = startIndex; i < startIndex + numBoxes; i++) {
        coords.push(chain[i].coord);
        let box = chain[i].box;
        box.labelID = labelID;
        this._rbush.insert(box);
        this._labelBoxes.get(featureID).push(box);
      }

      if (!coords.length) return;  // shouldn't happen, min numBoxes is 2 boxes

      const sum = coords.reduce((acc, coord) => vecAdd(acc, coord), [0,0]);
      const origin = vecScale(sum, 1 / coords.length);  // pick local origin as the average of the points
      let angle = vecAngle(coords.at(0), coords.at(-1));
      angle = numWrap(angle, 0, TAU);  // angle from x-axis, normalize to 0…2π
      if (angle > HALF_PI && angle < (3 * HALF_PI)) {  // rope is upside down, flip it
        angle -= Math.PI;
        coords.reverse();
      }

      // The `coords` array follows our bounding box chain, however it will be a little
      // longer than the label needs to be, which can cause stretching of small labels.
      // Here we will scale the points down to the desired label width.
      coords = coords.map(coord => vecSubtract(coord, origin));  // to local coords
      coords = geomRotatePoints(coords, -angle, [0,0]);          // rotate to x axis
      coords = coords.map(([x,y]) => [x * scaleX, y]);           // apply `scaleX`
      coords = geomRotatePoints(coords, angle, [0,0]);           // rotate back
      coords = coords.map(coord => vecAdd(coord, origin));       // back to global coords

      const label = new Label(labelID, 'rope', {
        str: feature.label,
        coords: coords,
        labelObj: labelObj,
        tint: feature.style.labelTint || 0xeeeeee
      });
      this._labels.set(labelID, label);

    });

    // we can destroy the sprite now, it's texture will remain on the rope?
    // sprite.destroy({ children: true });
  }


  /**
   * renderObjects
   * This renders any of the Label objects in the view
   */
  renderObjects() {
    const context = this.context;

    // Get the display bounds in screen/global coordinates
    const screen = context.pixi.screen;
    const labelOffset = this._labelOffset;
    const screenBounds = {
      minX: screen.x - labelOffset.x,
      minY: screen.y - labelOffset.y,
      maxX: screen.width - labelOffset.x,
      maxY: screen.height - labelOffset.y
    };

    // Collect Labels in view
    const labelIDs = new Set();
    const visible = this._rbush.search(screenBounds);
    for (const box of visible) {
      if (box.labelID) {
        labelIDs.add(box.labelID);
      }
    }

    // Create and add Labels to the scene, if needed
    for (const labelID of labelIDs) {
      const label = this._labels.get(labelID);
      if (!label) continue;         // unknown labelID - shouldn't happen?
      if (label.dObjID) continue;   // done already

      const options = label.options;
      const dObjID = labelID;

      if (label.type === 'text') {
        const labelObj = options.labelObj;  // a PIXI.Sprite, PIXI.Text, or PIXI.BitmapText
        labelObj.tint = options.tint || 0xffffff;
        labelObj.position.set(options.x, options.y);

        this._dObjs.set(dObjID, labelObj);
        label.dObjID = dObjID;
        this.labelContainer.addChild(labelObj);

      } else if (label.type === 'rope') {
        const labelObj = options.labelObj;  // a PIXI.Sprite, or PIXI.Text
        const points = options.coords.map(([x,y]) => new PIXI.Point(x, y));
        const rope = new PIXI.SimpleRope(labelObj.texture, points);
        rope.name = labelID;
        rope.autoUpdate = false;
        rope.sortableChildren = false;
        rope.tint = options.tint || 0xffffff;

        this._dObjs.set(dObjID, rope);
        label.dObjID = dObjID;
        this.labelContainer.addChild(rope);
      }
    }
  }

}
