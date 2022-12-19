import * as PIXI from 'pixi.js';
import { AtlasAllocator } from 'texture-allocator';
import RBush from 'rbush';
import { Extent, vecAdd, vecAngle, vecScale, vecSubtract, geomRotatePoints } from '@id-sdk/math';

import { AbstractLayer } from './AbstractLayer';
import { localizer } from '../core/localizer';
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
    this.displayObject = null;
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
    this._enabled = true;   // labels should be enabled by default

    // Items in this layer don't actually need to be interactive
    const groupContainer = this.scene.groups.get('labels');
    groupContainer.buttonMode = false;
    groupContainer.interactive = false;
    groupContainer.interactiveChildren = false;

    const debugContainer = new PIXI.ParticleContainer(50000);
    debugContainer.name = 'debug';
    debugContainer.roundPixels = false;
    debugContainer.buttonMode = false;
    debugContainer.interactive = false;
    debugContainer.interactiveChildren = false;
    debugContainer.sortableChildren = false;
    this.debugContainer = debugContainer;

    const labelContainer = new PIXI.Container();
    labelContainer.name = 'labels';
    labelContainer.buttonMode = false;
    labelContainer.interactive = false;
    labelContainer.interactiveChildren = false;
    labelContainer.sortableChildren = true;
    this.labelContainer = labelContainer;

    groupContainer.addChild(debugContainer, labelContainer);

    this._atlasAllocator = new AtlasAllocator();

    // Map of strings to Pixi textures
    this._textures = new Map();   // Map (String -> Pixi Texture)

    // A RBush spatial index that stores all the placement boxes
    this._rbush = new RBush();

    // These Maps store "Boxes" which are indexed in the label placement RBush.
    // We store them separately in 2 Maps because some features (like vertices)
    // can be both an avoidance but also have a label placed by it.
    this._avoidBoxes = new Map();   // Map (featureID -> Array[avoid Boxes] )
    this._labelBoxes = new Map();   // Map (featureID -> Array[label Boxes] )

    // After working out the placement math, we don't automatically render display objects,
    // since many objects would get placed far offscreen
    this._labels = new Map();   // Map (labelID -> Label object)

    // Old map scale (aka zoom) - we reset the labeling when the scale changes.
    this._oldk = 0;

    // For ascii-only labels, we can use PIXI.BitmapText to avoid generating label textures
    PIXI.BitmapFont.from('label-normal', TEXT_NORMAL, { chars: PIXI.BitmapFont.ASCII, padding: 0, resolution: 2 });
    // not actually used
    // PIXI.BitmapFont.from('label-italic', TEXT_ITALIC, { chars: PIXI.BitmapFont.ASCII, padding: 0, resolution: 2 });

    // For all other labels, generate it on the fly in a PIXI.Text or PIXI.Sprite
    this._textStyleNormal = new PIXI.TextStyle(TEXT_NORMAL);
    this._textStyleItalic = new PIXI.TextStyle(TEXT_ITALIC);
  }


  /**
   * resetAll
   * Remove all label and debug objects from the scene and from all caches
   */
  resetAll() {
    for (const label of this._labels.values()) {
      if (label.displayObject) {
        label.displayObject.destroy({ children: true, texture: false, baseTexture: false });
        label.displayObject = null;
      }
    }

    this._avoidBoxes.clear();
    this._labelBoxes.clear();
    this._labels.clear();
    this._rbush.clear();
  }


  /**
   * resetFeature
   * Remove all label and debug objects from the scene and from all caches for the given feature
   * @param  featureID  the feature ID to remove the label data
   */
  resetFeature(featureID) {
    let boxes = new Set();
    let labelIDs = new Set();

    // gather boxes related to this feature
    (this._labelBoxes.get(featureID) || []).forEach(box => boxes.add(box));
    (this._avoidBoxes.get(featureID) || []).forEach(box => boxes.add(box));

    // gather labels and remove boxes
    for (const box of boxes.values()) {
      this._rbush.remove(box);
      if (box.labelID) {
        labelIDs.add(box.labelID);
      }
    }
    this._labelBoxes.delete(featureID);
    this._avoidBoxes.delete(featureID);

    // remove labels
    for (const labelID of labelIDs.values()) {
      let label = this._labels.get(labelID);
      if (label && label.displayObject) {
        label.displayObject.destroy({ children: true, texture: false, baseTexture: false });
        label.displayObject = null;
      }
      this._labels.delete(labelID);
    }
  }


  /**
   * render
   * Render all the labels. This is a multi-step process:
   * - gather avoids - these are places in the scene that we don't want a label
   * - label placement - do the math of figuring our where labels should be
   * - label rendering - show or hide labels based on their visibility
   *
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    if (this._enabled && zoom >= MINZOOM) {
      this.labelContainer.visible = true;
      this.debugContainer.visible = this.context.getDebug('label');

      // Reset all labels and avoids when scale changes
      const k = projection.scale();
      if (k !== this._oldk) {
        this.resetAll();
        this._oldk = k;
      }

      // Check for any features which have changed and need recalculation.
      for (const feature of this.scene.features.values()) {
        if (feature._labelDirty) {
          this.resetFeature(feature.id);
          feature._labelDirty = false;
        }
      }

      // Collect features to avoid.
      this.gatherAvoids();

      // Collect features to place labels on.
      let points = [];
      let lines = [];
      let polygons = [];
      for (const feature of this.scene.features.values()) {
        // If the feature can be labeled, and hasn't yet been, add it to the list for placement.
        if (feature.label && feature.visible && !this._labelBoxes.has(feature.id)) {
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

      this.renderObjects(projection);

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
    let texture = this._textures.get(textureID);

    if (!texture) {
      // Add some extra padding if we detect unicode combining marks in the text - see #653
      let pad = 0;
      const marks = str.match(/\p{M}/gu);     // add /u to get a unicode-aware regex
      if (marks && marks.length > 0)  pad = 10;  // Text with a few ascenders/descenders?
      if (marks && marks.length > 20) pad = 50;  // Zalgotext?

      let textStyle;
      if (pad) {   // make a new style
        const props = Object.assign({}, (style === 'normal' ? TEXT_NORMAL : TEXT_ITALIC), { padding: pad });
        textStyle = new PIXI.TextStyle(props);
      } else {             // use a cached style
        textStyle = (style === 'normal' ? this._textStyleNormal : this._textStyleItalic);
      }

      // Generate the Text
      const text = new PIXI.Text(str, textStyle);
      text.resolution = 2;
      text.updateText(false);  // force update it so the texture is prepared

      // Copy the texture data into the atlas.
      // Also remove x-padding, as this will only end up pushing the label away from the pin.
      // (We are mostly interested in y-padding diacritics, see #653)
      // Note: Whatever padding we set before got doubled because resolution = 2
      const [x, y] = [pad * 2, 0];
      const [w, h] = [text.canvas.width - (pad * 4), text.canvas.height];
      const data = text.context.getImageData(x, y, w, h);

      const ATLAS_PADDING = 0;
      texture = this._atlasAllocator.allocate(w, h, ATLAS_PADDING, data);

      // These textures are overscaled, but `orig` Rectangle stores the original width/height
      // (i.e. the dimensions that a PIXI.Sprite using this texture will want to make itself)
      // We need to manually adjust these values so that the Sprites or Ropes know how big to be.
      texture.orig = text.texture.orig.clone();
      texture.orig.width = w / 2;
      texture.orig.height = h / 2;

      this._textures.set(textureID, texture);
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
    const SHOWDEBUG = this.context.getDebug('label');
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
    avoidContainers.forEach(container => container.children.forEach(avoidObject));

    if (toInsert.length) {
      this._rbush.load(toInsert);  // bulk insert
    }


    // Adds the given object as an avoidance
    function _avoidObject(sourceObject) {
      if (!sourceObject.visible || !sourceObject.renderable) return;
      const featureID = sourceObject.name;

      if (this._avoidBoxes.has(featureID)) return;  // we've processed this avoidance already

      const feature = this.scene.features.get(featureID);
      const rect = feature && feature.sceneBounds;
      if (!rect) return;

      // Boxes here are in "scene" coordinates
      const EPSILON = 0.01;
      const box = {
        type: 'avoid',
        boxID: `${featureID}-avoid`,
        featureID: featureID,
        minX: rect.x + EPSILON,
        minY: rect.y + EPSILON,
        maxX: rect.x + rect.width - EPSILON,
        maxY: rect.y + rect.height - EPSILON
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
        labelObj.letterSpacing = -0.4;   // to adjust for lack of kerning

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

    const container = feature.container;
    if (!container.visible || !container.renderable) return;

    const TEXTDIRECTION = localizer.textDirection();

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
    if (TEXTDIRECTION === 'ltr') {
      preferences = [
        'r3', 'r4', 'r2',
        'b3', 'b4', 'b2', 'b5', 'b1',
        'l3', 'l4', 'l2',
        't3', 't4', 't2', 't5', 't1',
        'r5', 'r1',
        'l5', 'l1'
      ];
    } else {
      preferences = [
        'l3', 'l4', 'l2',
        'b3', 'b2', 'b4', 'b1', 'b5',
        't3', 't2', 't4', 't1', 't5',
        'r3', 'r4', 'r2',
        'l5', 'l1',
        'r5', 'r1'
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
          labelObj: labelObj,
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
  placeRopeLabel(feature, labelObj, coords) {
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
      let currAngle = segment.angle;
      if (currAngle < 0) {
        currAngle += Math.PI;   // normalize to 0…2π
      }

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
          tooBendy = Math.min((2 * Math.PI) - diff, diff) > BENDLIMIT;
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

      if (coords[0][0] > coords[coords.length-1][0]) {    // rope is backwards, flip it
        coords.reverse();
      }

      // The `coords` array follows our bounding box chain, however it will be a little
      // longer than the label needs to be, which can cause stretching of small labels.
      // Here we will scale the points down to the desired label width.
      const angle = vecAngle(coords[0], coords[coords.length-1]);
      const sum = coords.reduce((acc, coord) => vecAdd(acc, coord), [0,0]);
      const origin = vecScale(sum, 1 / coords.length);  // pick local origin as the average of the points

      coords = coords.map(coord => vecSubtract(coord, origin));  // to local coords
      coords = geomRotatePoints(coords, -angle, [0,0]);          // rotate to x axis
      coords = coords.map(([x,y]) => [x * scaleX, y - 2]);       // apply `scaleX`
        // also `y-2` to move labels up slightly, see #625
      coords = geomRotatePoints(coords, angle, [0,0]);           // rotate back
      coords = coords.map(coord => vecAdd(coord, origin));       // back to scene coords

      const label = new Label(labelID, 'rope', {
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
   * This renders any of the Lable objects in the view
   * @param  projection  The Pixi projection
   */
  renderObjects(projection) {
    const context = this.context;
    const SHOWDEBUG = context.getDebug('label');

    // Get the viewport bounds in pixi scene coordinates.
    const screen = context.pixi.screen;
    const offset = context.pixi.stage.position;
    const mapExtent = new Extent(
      [screen.x - offset.x,      screen.y - offset.y],        // min
      [screen.width - offset.x,  screen.height - offset.y]    // max
    );

    // Collect labels in view
    let labelIDs = new Set();
    const visible = this._rbush.search(mapExtent.bbox());
    for (const box of visible) {
      if (box.labelID) {
        labelIDs.add(box.labelID);
      }
    }

    // Create and add labels to the scene, if needed
    for (const labelID of labelIDs.values()) {
      const label = this._labels.get(labelID);
      if (!label) continue;  // bad labelID - shouldn't happen?

      const options = label.options;

      if (label.displayObject) continue;   // done already

      if (label.type === 'text') {
        const labelObj = options.labelObj;  // a PIXI.Sprite, PIXI.Text, or PIXI.BitmapText
        labelObj.tint = options.tint || 0xffffff;
        labelObj.position.set(options.x, options.y);

        label.displayObject = labelObj;
        this.labelContainer.addChild(labelObj);

      } else if (label.type === 'rope') {
        const labelObj = options.labelObj;  // a PIXI.Sprite, or PIXI.Text
        const points = options.coords.map(([x,y]) => new PIXI.Point(x, y));
        const rope = new PIXI.SimpleRope(labelObj.texture, points);
        rope.name = labelID;
        rope.autoUpdate = false;
        rope.interactiveChildren = false;
        rope.sortableChildren = false;
        rope.tint = options.tint || 0xffffff;

        label.displayObject = rope;
        this.labelContainer.addChild(rope);
      }

//      if (SHOWDEBUG && options.type === 'debug') {
//        const box = options.box;
//        const x = box.minX;
//        const y = box.minY;
//        const w = box.maxX - box.minX;
//        const h = box.maxY - box.minY;
//        const sprite = getDebugBBox(x, y, w, h, options.tint, 0.75, labelID);
//        renderable.displayObject = sprite;
//        this.debugContainer.addChild(sprite);
//      }
    }
  }

}
