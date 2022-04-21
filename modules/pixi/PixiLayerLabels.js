import * as PIXI from 'pixi.js';
// import { CanvasTextureAllocator } from '@pixi-essentials/texture-allocator';
import RBush from 'rbush';
import { vecAdd, vecAngle, vecScale, vecSubtract, geomRotatePoints } from '@id-sdk/math';

import { PixiLayer } from './PixiLayer';
import { localizer } from '../core/localizer';
import { getLineSegments, getDebugBBox } from './helpers.js';

const LAYERID = 'labels';
const MINZOOM = 12;


/**
 * PixiLayerLabels
 * @class
 */
export class PixiLayerLabels extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param scene
   * @param layerZ
   */
  constructor(context, scene, layerZ) {
    super(context, LAYERID, layerZ);
    this.scene = scene;
    this._enabled = true;   // labels should be enabled by default

    // Items in this layer don't actually need to be interactive
    const layerContainer = this.container;
    layerContainer.buttonMode = false;
    layerContainer.interactive = false;
    layerContainer.interactiveChildren = false;

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

    layerContainer.addChild(debugContainer, labelContainer);


    this._texts = new Map();        // Map of label -> Pixi Texture
    this._avoidBoxes = new Map();   // Map of featureID -> avoid boxes
    this._labelBoxes = new Map();   // Map of featureID -> label boxes
    this._labelDObjs = new Map();   // Map of featureID -> Pixi displayObjects
    this._placement = new RBush();
    this._oldk = 0;

    // Create a render-texture allocator to create an on-the-fly texture atlas for
    // all our label rendering needs.
    // const _allocator = new CanvasTextureAllocator();

    this._textstyle = new PIXI.TextStyle({
      fill: 0x333333,
      fontSize: 11,
      fontWeight: 600,
      miterLimit: 1,
      stroke: 0xeeeeee,
      strokeThickness: 3
    });

  }


  /**
   * render
   * Draw all the labels
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   */
  render(timestamp, projection, zoom) {
    if (this._enabled && zoom >= MINZOOM) {
      this.visible = true;
      this.renderLabels(projection);
    } else {
      this.visible = false;
    }
  }


  /**
   * getLabelSprite
   * @param  str  String for the label
   */
  getLabelSprite(str) {
// BAD just make more textures
    let sprite;
    let existing = this._texts.get(str);
    if (existing) {
      sprite = new PIXI.Sprite(existing.texture);
    } else {
      sprite = new PIXI.Text(str, this._textstyle);
      sprite.resolution = 2;
      sprite.updateText(false);  // force update it so its texture is ready to be reused on a sprite
      this._texts.set(str, sprite);
    }
    sprite.name = str;
    sprite.anchor.set(0.5, 0.5);   // middle, middle
    return sprite;

// BETTER with texture allocator
//    let sprite;
//    let texture = this._textures.get(str);
//
//    if (!texture) {
//      const text = new PIXI.Text(str, this._textstyle);
//      text.resolution = 2;
//      text.updateText(false);  // force update it so the texture is prepared
//
//      const srcBaseTexture = text.texture.baseTexture;
//      const srcCanvas = srcBaseTexture.resource.source;
//      const [w, h] = [srcBaseTexture.realWidth, srcBaseTexture.realHeight];
//
//      // Allocate space in the texture atlas
//      const padding = 0;
//      texture = _allocator.allocate(w, h, padding);
//
//      // The allocator automatically creates internal BaseTextures in "slabs".
//      // Now is the time change anything about the BaseTexture that got created
//      texture.baseTexture.resolution = 2;
//      texture.baseTexture.mipmap = false;
//
//      // copy the texture from source canvas -> destination canvas
//      const frame = texture.frame;
//      const destCanvas = texture.baseTexture.resource.source;
//      const destContext = destCanvas.getContext('2d');
//      destContext.drawImage(srcCanvas, frame.x, frame.y, frame.width, frame.height);
//
//      this._textures.set(str, texture);
//      text.destroy();  //?
//    }
//
//    sprite = new PIXI.Sprite(texture);
//    sprite.name = str;
//    // sprite.scale.set(0.5, 0.5);
//    sprite.anchor.set(0.5, 0.5);   // middle, middle
//    return sprite;
  }


  /**
   * removeLabels
   * If this feature has any existing labels, remove them and any data related to them
   * @param  featureID  the feature ID to remove the labels
   */
  removeLabels(featureID) {
    // Remove any existing labeling data for this feature.
    const removeBoxes = this._labelBoxes.get(featureID) || [];
    removeBoxes.forEach(box => this._placement.remove(box));
    this._labelBoxes.delete(featureID);

    // Destroy any display objects for these labels
    const removeDObjs = this._labelDObjs.get(featureID) || [];
    removeDObjs.forEach(dObj => dObj.destroy({ children: true, texture: false, baseTexture: false }));
    this._labelDObjs.delete(featureID);
  }

  /**
   * Do we need a removeAvoids function?
   * I think if an avoidable object gets changed, we would need to handle that change in our _avoidBoxes
   * structure, however by the time we've reached the labeling code, that changed object isn't dirty anyhmore.
   * An idea I've been considering is to just have the scene hold all the avoidables, so that objects or layers
   * are responsible for adding themselves to a different rbush, rather than having the labeling code
   * deal with the problem of collecting all the avoidables.
   */



  /**
   * gatherAvoidables
   * Gather the avoidable features, create boxes for them,
   * and insert them into the placement Rbush.
   * If a new avoidable collides with an already placed label,
   * destroy the label and flag the feature as labeldirty for relabeling
   */
  gatherAvoidables() {
    const SHOWDEBUG = this.context.getDebug('label');
    const stage = this.context.pixi.stage;
    const avoidObjectFn = avoidObject.bind(this);

    // Gather the layers that have avoidable stuff on them
    const avoidLayers = [];
    const osmLayer = stage.getChildByName('osm');
    if (osmLayer) {
      osmLayer.children.forEach(layer => {
        if (layer.name === 'osm-points' || layer.name === 'osm-vertices') {
          avoidLayers.push(layer);
        }
      });
    }
    const rapidLayer = stage.getChildByName('rapid');
    if (rapidLayer) {
      rapidLayer.children.forEach(dataset => {
        const dsname = dataset.name;
        dataset.children.forEach(layer => {
          if (layer.name === `${dsname}-points` || layer.name === `${dsname}-vertices`) {
            avoidLayers.push(layer);
          }
        });
      });
    }

    // For each layer, gather the avoid boxes
    let toInsert = [];
    avoidLayers.forEach(layer => layer.children.forEach(avoidObjectFn));

    if (toInsert.length) {
      this._placement.load(toInsert);  // bulk insert
    }


    // Adds the given object as an avoidable
    function avoidObject(sourceObject) {
      if (!sourceObject.visible || !sourceObject.renderable) return;
      const featureID = sourceObject.name;

      if (this._avoidBoxes.has(featureID)) return;  // we've processed this avoidance already

      const feature = this.scene.get(featureID);
      const rect = feature && feature.sceneBounds;
      if (!rect) return;

      // boxes here are in "scene" coordinates
      const boxID = `${featureID}-avoid`;
      const EPSILON = 0.01;
      const box = {
        type: 'avoid',
        boxID: boxID,
        featureID: featureID,
        minX: rect.x + EPSILON,
        minY: rect.y + EPSILON,
        maxX: rect.x + rect.width - EPSILON,
        maxY: rect.y + rect.height - EPSILON
      };

      this._avoidBoxes.set(featureID, box);
      toInsert.push(box);

      if (SHOWDEBUG) {
        const sprite = getDebugBBox(rect.x, rect.y, rect.width, rect.height, 0xbb3333, 0.75, boxID);
        this.debugContainer.addChild(sprite);
      }

      // If there is already a label where this avoid box is, we will need to redo that label.
      // This is somewhat common that a label will be placed somewhere, then as more map loads,
      // we learn that some of those junctions become important and we need to avoid them.
      const existingBoxes = this._placement.search(box);
      existingBoxes.forEach(existingBox => {
        if (existingBox.type !== 'label') return;

        this.removeLabels(existingBox.featureID);

        const existingFeature = this.scene.get(existingBox.featureID);
        if (existingFeature) {
          existingFeature._labelDirty = true;
        }
      });

    }
  }



  /**
   * renderLabels
   * @param  projection  The Pixi projection
   */
  renderLabels(projection) {
    const context = this.context;
    const textDirection = localizer.textDirection();

    const labelContainer = this.labelContainer;
    const debugContainer = this.debugContainer;

    const SHOWDEBUG = context.getDebug('label');
    debugContainer.visible = SHOWDEBUG;

    // fix later: make some closure variables for now to avoid dealing with `this`
    let thiz = this;
    let _labelBoxes = this._labelBoxes;
    let _labelDObjs = this._labelDObjs;
    let _placement = this._placement;

// DEBUG - show the allocator spritesheet
//let stage = context.pixi.stage;
//let sprite = stage.getChildByName('allocator');
//if (!sprite) {
//  sprite = new PIXI.Sprite();
//  sprite.width = 1024;
//  sprite.height = 1024;
//  sprite.name = 'allocator';
//  stage.addChild(sprite);
//}
//if (_allocator.textureSlabs.length) {
//  let baseTexture = _allocator.textureSlabs[0].slab.castToBaseTexture();
//  sprite.texture = new PIXI.Texture(baseTexture);
//}


    // Reset all labels and avoidables when scale changes
    const k = projection.scale();
    if (k !== this._oldk) {
      this._avoidBoxes.clear();
      this._labelBoxes.clear();
      this._labelDObjs.clear();
      this._placement.clear();

      // important gotcha:
      // Can not iterate over `.children` to destroy them because this changes them during iteration
      // Need to `.removeChildren()` first and then iterate to destroy.
      this.debugContainer.removeChildren()
        .forEach(child => child.destroy({ children: true }));
      this.labelContainer.removeChildren()
        .forEach(child => child.destroy({ children: true, texture: false, baseTexture: false }));
      this._oldk = k;
    }

    // Collect features to avoid..
    this.gatherAvoidables();

    // Collect features to label..
    let points = [];
    let lines = [];

    // Remove any labeling data for dirty features
    this.scene._features.forEach(feature => {
      if (!feature._labelDirty) return;

      const featureID = feature.id;
      this.removeLabels(featureID);

      // If the feature can be labeled, add it to the list.
      if (feature.label && feature.visible) {
        if (feature.type === 'point') {
          points.push(feature);
        } else if (feature.type === 'line') {
          lines.push(feature);
        } else {
          // no label for now
          feature._labelDirty = false;
        }
      } else {
        feature._labelDirty = false;
      }
    });

    // Points first, then lines (so line labels can avoid point labels)
    placePointLabels(points);
    placeLineLabels(lines);
//    placeAreaLabels();



    //
    // Place point labels
    //
    function placePointLabels(features) {
      features.sort((a, b) => b.geometry[1] - a.geometry[1]);

      features
        .forEach(feature => {
          const featureID = feature.id;
          feature._labelDirty = false;

          if (_labelBoxes.has(featureID)) return;  // processed it already
          _labelBoxes.set(featureID, []);
          _labelDObjs.set(featureID, []);

          if (!feature.label) return;
          const sprite = thiz.getLabelSprite(feature.label);
          placePointLabel(feature, sprite);
        });
    }


    //
    // Point labels are placed somewhere near the marker.
    // We generate several placement regions around the marker,
    // try them until we find one that doesn't collide with something.
    //
    function placePointLabel(feature, sprite) {
      if (!feature || !feature.sceneBounds) return;

      const dObj = feature.displayObject;
      if (!dObj.visible || !dObj.renderable) return;

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
      const lRect = sprite.getLocalBounds().clone().pad(0, -1);
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
      if (textDirection === 'ltr') {
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
      for (let i = 0; i < preferences.length; i++) {
        const placement = preferences[i];
        const [x, y] = placements[placement];
        const boxID = `${featureID}-${placement}`;
        const EPSILON = 0.01;
        const box = {
          type: 'label',
          boxID: boxID,
          featureID: featureID,
          minX: x - lWidthHalf + EPSILON,
          minY: y - lHeightHalf + EPSILON,
          maxX: x + lWidthHalf - EPSILON,
          maxY: y + lHeightHalf - EPSILON
        };

        if (!_placement.collides(box)) {
          _labelBoxes.get(featureID).push(box);
          _labelDObjs.get(featureID).push(sprite);
          _placement.insert(box);
          sprite.tint = feature.style.labelTint || 0xffffff;
          sprite.position.set(x, y);
          sprite.visible = true;
          labelContainer.addChild(sprite);
          picked = placement;
          break;
        }
      }

      // if (!picked) {
      //   sprite.destroy({ children: true });  // didn't place it
      // }

      if (SHOWDEBUG) {
        Object.entries(placements).forEach(([placement, coord]) => {
          if (placement !== picked) return;   // comment this line to show all placements around the point

          const [x, y] = coord;
          const color = (placement === picked ? 0xff3333 : 0xffff33);
          const debugbox = getDebugBBox(x - lWidthHalf, y - lHeightHalf, lWidth, lHeight, color, 0.75, `${featureID}-${placement}`);
          _labelDObjs.get(featureID).push(debugbox);
          debugContainer.addChild(debugbox);
        });
      }
    }


    //
    // Place line labels
    //
    function placeLineLabels(features) {

      // This is hacky, but we can sort the line labels by their parent container name.
      // It might be a level container with a name like "1", "-1", or just a name like "lines"
      // If `parseInt` fails, just sort the label above everything.
      function level(feature) {
        const lvl = parseInt(feature.displayObject.parent.name, 10);
        return isNaN(lvl) ? 999 : lvl;
      }

      features.sort((a, b) => level(b) - level(a));

      features
        .forEach(feature => {
          const featureID = feature.id;
          feature._labelDirty = false;

          if (_labelBoxes.has(featureID)) return;  // processed it already
          _labelBoxes.set(featureID, []);
          _labelDObjs.set(featureID, []);

          if (!feature.label) return;
          const sprite = thiz.getLabelSprite(feature.label);
          placeLineLabel(feature, sprite);
        });
    }


    //
    // Line labels are placed along a line.
    // We generate chains of bounding boxes along the line,
    // then add the labels in spaces along the line wherever they fit
    //
    function placeLineLabel(feature, sprite) {
      if (!feature || !feature.points) return;

      const dObj = feature.displayObject;
      if (!dObj.visible || !dObj.renderable) return;

      // `f` - feature, these bounds are in "scene" coordinates
      const featureID = feature.id;
      const fRect = feature.sceneBounds;
      const fWidth = fRect.width;
      const fHeight = fRect.height;
      if (fWidth < 40 && fHeight < 40) return;  // too small in both dimensions to even waste time labeling

      // `l` = label, these bounds are in "local" coordinates to the label,
      // 0,0 is the center of the label
      const lRect = sprite.getLocalBounds();
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
      const segments = getLineSegments(feature.points, boxsize);

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
      segments.forEach(function nextSegment(segment, segindex) {
        let currAngle = segment.angle;
        if (currAngle < 0) {
          currAngle += Math.PI;   // normalize to 0…2π
        }

        segment.coords.forEach(function nextCoord(coord, coordindex) {
          const [x,y] = coord;
          const boxID = `${featureID}-${segindex}-${coordindex}`;
          const EPSILON = 0.01;
          const box = {
            type: 'label',
            boxID: boxID,
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

          } else if (_placement.collides(box)) {
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
      // and insert into the `_placement` rbush.
      candidates.forEach(function addLabelToChain(chain, chainIndex) {
        // Set aside half any extra boxes at the beginning of the chain
        // (This centers the label along the chain)
        const startIndex = Math.floor((chain.length - numBoxes) / 2);

        let coords = [];
        for (let i = startIndex; i < startIndex + numBoxes; i++) {
          coords.push(chain[i].coord);
          _placement.insert(chain[i].box);
          _labelBoxes.get(featureID).push(chain[i].box);
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
        const centroid = vecScale(sum, 1 / coords.length);  // aka "average" the points

        coords = coords.map(coord => vecSubtract(coord, centroid));  // to local coords
        coords = geomRotatePoints(coords, -angle, [0,0]);            // rotate to x axis
        coords = coords.map(([x,y]) => [x * scaleX, y]);             // apply `scaleX`
        coords = geomRotatePoints(coords, angle, [0,0]);             // rotate back
        coords = coords.map(coord => vecAdd(coord, centroid));       // back to scene coords

        // make a rope
        const points = coords.map(([x,y]) => new PIXI.Point(x, y));
        const rope = new PIXI.SimpleRope(sprite.texture, points);
        rope.name = `${featureID}-rope-${chainIndex}`;
        rope.autoUpdate = false;
        rope.interactiveChildren = false;
        rope.sortableChildren = false;
        rope.tint = feature.style.labelTint || 0xffffff;
        rope.visible = true;
        labelContainer.addChild(rope);
        _labelDObjs.get(featureID).push(rope);
      });

      // we can destroy the sprite now, it's texture will remain on the rope
      // sprite.destroy({ children: true });

      if (SHOWDEBUG) {
        boxes.forEach(function makeBBox(box) {
          const alpha = 0.75;
          let color;
          if (box.bendy) {
            color = 0xff33ff;
          } else if (box.collides) {
            color = 0xff3333;
          } else if (box.candidate) {
            color = 0x33ff33;
          } else {
            color = 0xffff33;
          }

          const debugBox = getDebugBBox(box.minX, box.minY, boxsize, boxsize, color, alpha, box.boxID);
          debugContainer.addChild(debugBox);
          _labelDObjs.get(featureID).push(debugBox);
        });
      }
    }



//    //
//    // Place area labels
//    //
//    function placeAreaLabels() {
//      return;  // not yet
//    }
//
//
//    //
//    // Area labels are placed at the centroid along with an icon.
//    // Can also consider:
//    //   placing at pole-of-inaccessability instead of centroid?
//    //   placing label along edge of area stroke?
//    //
//    function placeAreaLabel(feature, sprite) {
//      return;  // not yet
//    }

  }
}
