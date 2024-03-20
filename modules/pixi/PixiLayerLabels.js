import * as PIXI from 'pixi.js';
import RBush from 'rbush';
import { HALF_PI, RAD2DEG, TAU, Extent, numWrap, vecAdd, vecAngle, vecScale, vecSubtract, geomRotatePoints
} from '@rapid-sdk/math';

import { AbstractLayer } from './AbstractLayer.js';
import { getLineSegments, getDebugBBox, lineToPoly } from './helpers.js';


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
 *
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

    groupContainer.addChild(debugContainer, labelContainer);

    // A RBush spatial index that stores all the placement boxes
    this._rbush = new RBush();

    // These Maps store "Boxes" which are indexed in the label placement RBush.
    // We store them in several maps because some features (like vertices)
    // can be both an avoidance but also have a label placed by it.
    this._avoidBoxes = new Map();   // Map (featureID -> Array[avoid Boxes] )
    this._labelBoxes = new Map();   // Map (featureID -> Array[label Boxes] )

    // After working out the placement math, we don't automatically render display objects,
    // since many objects would get placed far offscreen
    this._labels = new Map();    // Map (labelID -> Label Object)
    // Display Objects includes anything managed by this layer: labels and debug boxes
    this._dObjs = new Map();     // Map (dObjID -> Display Object)

    // We reset the labeling when scale or rotation change
    this._tPrev = { x: 0, y: 0, k: 256 / Math.PI, r: 0 };

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

// not yet
return;

    // The label group should be kept unrotated so that it stays screen-up not north-up.
    // The origin of this container will still be the origin of the Pixi scene.
    const bearing = viewport.transform.rotation;  // map might not be north-up
    const groupContainer = this.scene.groups.get('labels');
    groupContainer.rotation = -bearing;

    if (this.enabled && zoom >= MINZOOM) {
      this.labelContainer.visible = true;
      this.debugContainer.visible = true;  // this.context.getDebug('label');

      // Reset labels
      const tPrev = this._tPrev;
      const tCurr = viewport.transform;
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

      // Collect features to avoid.
      this.gatherAvoids(viewport);

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

///      // Points first, then lines (so line labels can avoid point labels)
///      this.labelPoints(points, viewport);
///      this.labelLines(lines, viewport);
///      this.labelPolygons(polygons, viewport);
///
///      this.renderObjects(viewport);

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
  gatherAvoids(viewport) {
    const renderer = this.renderer.stage.position;
    const bearing = viewport.transform.rotation;  // map might not be north-up
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


    // Adds the given object as an avoidance
    function _avoidObject(sourceObject) {
      if (!sourceObject.visible || !sourceObject.renderable) return;
      const featureID = sourceObject.name;
      if (this._avoidBoxes.has(featureID)) return;  // we've processed this avoidance already

      const feature = this.scene.features.get(featureID);
      const fRect = feature?.sceneBounds;
      if (!fRect) return;

      // The rectangle is in "scene" coordinates (i.e. north-up, origin stored in pixi stage)
      // We need to rotate it to the coordintes used by the labels (screen-up)
      const EPSILON = 0.01;
      const fMin = [fRect.x + EPSILON, fRect.y + EPSILON];
      const fMax = [fRect.x + fRect.width - EPSILON, fRect.y + fRect.height - EPSILON];

      let coords = [fMin, fMax];
      coords = coords.map(coord => vecSubtract(coord, origin));  // to local coords
      coords = geomRotatePoints(coords, -bearing, [0, 0]);       // undo map bearing
      coords = coords.map(coord => vecAdd(coord, origin));       // back to scene coords

      const [[minX, minY], [maxX, maxY]] = coords;
      const [w, h] = [maxX - minX, maxY - minY];

      const boxID = `${featureID}-avoid`;
const sprite = getDebugBBox(minX, minY, w, h, 0xff0000, 0.75, boxID);
this.debugContainer.addChild(sprite);
this._dObjs.set(boxID, sprite);

      const box = {
        type: 'avoid',
        boxID: boxID,
        dObjID: boxID,
        featureID: featureID,
        minX: minX,
        minY: minY,
        maxX: maxX,
        maxY: maxY
      };

      this._avoidBoxes.set(featureID, [box]);
      toInsert.push(box);


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
  labelPoints(features, viewport) {
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

      this.placeTextLabel(feature, labelObj, viewport);
    }
  }


  /**
   * labelLines
   * Lines are labeled with PIXI.SimpleRope that run along the line.
   * This calculates the placement, but does not actually add the rope label to the scene.
   * @param  features  The features to place line labels on
   */
  labelLines(features, viewport) {
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

      this.placeRopeLabel(feature, labelObj, feature.geometry.coords, viewport);
    }
  }


  /**
   * labelPolygons
   * Polygons are labeled with PIXI.SimpleRope that run along the inside of the perimeter.
   * This calculates the placement, but does not actually add the rope label to the scene.
   * @param  features  The features to place line labels on
   */
  labelPolygons(features, viewport) {
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
this.placeRopeLabel(feature, labelObj, coords, viewport);

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
  placeTextLabel(feature, labelObj, viewport) {
    if (!feature || !feature.sceneBounds) return;

    const container = feature.container;
    if (!container.visible || !container.renderable) return;

    // `f` - feature, these bounds are in "scene" coordinates
    const featureID = feature.id;
    const fRect = feature.sceneBounds.clone().pad(1, 0);
    const fLeft = fRect.x;
    const fTop = fRect.y;
    const fWidth = fRect.width;
    const fHeight = fRect.height;
    const fRight = fRect.x + fWidth;
    const fMidX = fRect.x + (fWidth * 0.5);
    const fBottom = fRect.y + fHeight;
    const fMidY = (feature.type === 'point') ? (fRect.y + fHeight - 14)  // next to marker
      : (fRect.y + (fHeight * 0.5));

const doDebug = feature.label === 'Jurassic Park';
let i;
if (doDebug) {
  i = 1;
}

    // Apply anti-rotation to keep labels facing up
    const bearing = viewport.transform.rotation;  // map might not be north-up
    const localRect = labelObj.getLocalBounds();
    // labelObj.pivot.set(localRect.x, 0);  // pivot around left, not center
    labelObj.rotation = -bearing;

    // `l` = label, these bounds are in "local" coordinates to the label,
    // 0,0 is the center of the label
    // (padY -1, because for some reason, calculated height seems higher than necessary)
    // `getBounds` applies rotation - this can be slow for objects with a lot of descendants
    // but in this case there is no tree, it's just a single label with no descendants.
    const lRect = labelObj.getBounds().clone().pad(0, -1);
    const some = 5;
    const more = 10;
    const lWidth = lRect.width;
    const lHeight = lRect.height;
    const lWidthHalf = lWidth * 0.5;
    const lHeightHalf = lHeight * 0.5;

    // Attempt several placements (these are calculated in scene coordinates)
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
    let preferences;
    const isRTL = this.context.systems.l10n.isRTL();

    if (isRTL) {   // right to left
      preferences = [
        'l3', 'l4', 'l2',
        'b3', 'b2', 'b4', 'b1', 'b5',
        't3', 't2', 't4', 't1', 't5',
        'r3', 'r4', 'r2',
        'l5', 'l1',
        'r5', 'r1'
      ];
    } else {   // left to right
      preferences = [
        'r3', 'r4', 'r2',
        'b3', 'b4', 'b2', 'b5', 'b1',
        'l3', 'l4', 'l2',
        't3', 't4', 't2', 't5', 't1',
        'r5', 'r1',
        'l5', 'l1'
      ];
    }

    let picked = null;
    for (let i = 0; !picked && i < preferences.length; i++) {
      const placement = preferences[i];
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

      if (!this._rbush.collides(box)) {
        // We can render the label in this box..
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
        picked = placement;
      }
    }

    // if (!picked) {
    //   labelObj.destroy({ children: true });  // didn't place it
    // }
  }


  /**
   * placeRopeLabel
   * Rope labels are placed along a string of coordinates.
   * We generate chains of bounding boxes along the line,
   * then add the labels in spaces along the line wherever they fit.
   *
   * @param  feature   The feature to place point labels on
   * @param  labelObj  a PIXI.Sprite to use as the label
   */
  placeRopeLabel(feature, labelObj, coords, viewport) {
    if (!feature || !labelObj || !coords) return;
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
        const [x, y] = coord;
        const EPSILON = 0.01;
        const box = {
          type: 'label',
          boxID: `${featureID}-${segmentIndex}-${coordIndex}`,
          featureID: featureID,
          minX: x - boxhalf + EPSILON,
          minY: y - boxhalf + EPSILON,
          maxX: x + boxhalf - EPSILON,
          maxY: y + boxhalf - EPSILON
        };

        // Check bend angle and avoid placing labels where the line bends too much..
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
      });
    });

    finishChain();


    // Compute a label in the middle of each chain,
    // and insert into the `_rbush` rbush.
    candidates.forEach((chain, chainIndex) => {
      // Set aside half any extra boxes at the beginning of the chain
      // (This centers the label along the chain)
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

      const bearing = viewport.transform.rotation;  // map might not be north-up
      const sum = coords.reduce((acc, coord) => vecAdd(acc, coord), [0,0]);
      const origin = vecScale(sum, 1 / coords.length);  // pick local origin as the average of the points
      let angle = vecAngle(coords.at(0), coords.at(-1)) + bearing;
      angle = numWrap(angle, 0, TAU);  // angle from x-axis, normalize to 0…2π
      if (angle > HALF_PI && angle < (3 * HALF_PI)) {  // rope is upside down, flip it
        angle -= Math.PI;
        coords.reverse();
      }

      // The `coords` array follows our bounding box chain, however it will be a little
      // longer than the label needs to be, which can cause stretching of small labels.
      // Here we will scale the points down to the desired label width.
      angle -= bearing;   // remove map bearing for this part
      coords = coords.map(coord => vecSubtract(coord, origin));  // to local coords
      coords = geomRotatePoints(coords, -angle, [0,0]);          // rotate to x axis
      coords = coords.map(([x,y]) => [x * scaleX, y]);           // apply `scaleX`
      coords = geomRotatePoints(coords, angle, [0,0]);           // rotate back
      coords = coords.map(coord => vecAdd(coord, origin));       // back to scene coords

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

// figure you out later
//    if (SHOWDEBUG) {
//      boxes.forEach(box => {
//        const alpha = 0.75;
//        let color;
//        if (box.bendy) {
//          color = 0xff33ff;
//        } else if (box.collides) {
//          color = 0xff3333;
//        } else if (box.candidate) {
//          color = 0x33ff33;
//        } else {
//          color = 0xffff33;
//        }
//
//        const sprite = getDebugBBox(box.minX, box.minY, boxsize, boxsize, color, alpha, box.boxID);
//        this.debugContainer.addChild(sprite);
//        this._labelDObjs.get(featureID).push(sprite);
//      });
//    }
  }


  /**
   * renderObjects
   * This renders any of the Label objects in the view
   * @param  viewport  The Pixi viewport
   */
  renderObjects(viewport) {
    const context = this.context;
    // const SHOWDEBUG = context.getDebug('label');

    // Get the viewport bounds in pixi scene coordinates.
    const screen = context.pixi.screen;
    const offset = context.pixi.stage.position;
    const mapExtent = new Extent(
      [screen.x - offset.x,      screen.y - offset.y],        // min
      [screen.width - offset.x,  screen.height - offset.y]    // max
    );

    // Collect labels in view
    const labelIDs = new Set();
    const visible = this._rbush.search(mapExtent.bbox());
    for (const box of visible) {
      if (box.labelID) {
        labelIDs.add(box.labelID);
      }
    }

    // Create and add labels to the scene, if needed
    for (const labelID of labelIDs) {
      const label = this._labels.get(labelID);
      if (!label) continue;  // bad labelID - shouldn't happen?

      const options = label.options;
      if (label.dObjID) continue;   // done already

      if (label.type === 'text') {
        const labelObj = options.labelObj;  // a PIXI.Sprite, PIXI.Text, or PIXI.BitmapText
        labelObj.tint = options.tint || 0xffffff;
        labelObj.position.set(options.x, options.y);

this._dObjs.set(labelObj.name, labelObj);
label.dObjID = labelObj.name;
        // label.displayObject = labelObj;
        this.labelContainer.addChild(labelObj);

//const box = options.box;
//const x = box.minX;
//const y = box.minY;
//const w = box.maxX - box.minX;
//const h = box.maxY - box.minY;
//const sprite = getDebugBBox(x, y, w, h, options.tint, 0.75, labelID);
//label.debugObject = sprite;
//this.debugContainer.addChild(sprite);

      } else if (label.type === 'rope') {
        const labelObj = options.labelObj;  // a PIXI.Sprite, or PIXI.Text
        const points = options.coords.map(([x,y]) => new PIXI.Point(x, y));
        const rope = new PIXI.SimpleRope(labelObj.texture, points);
        rope.name = labelID;
        rope.autoUpdate = false;
        rope.sortableChildren = false;
        rope.tint = options.tint || 0xffffff;

this._dObjs.set(rope.name, rope);
label.dObjID = rope.name;

        // label.displayObject = rope;
        this.labelContainer.addChild(rope);
      }
    }
  }

}
