import * as PIXI from 'pixi.js';
// import { CanvasTextureAllocator } from '@pixi-essentials/texture-allocator';
import RBush from 'rbush';
import { vecAdd, vecAngle, vecScale, vecSubtract, geomRotatePoints } from '@id-sdk/math';

import { localizer } from '../core/localizer';
import { utilDisplayName } from '../util';
import { getLineSegments, getDebugBBox } from './helpers.js';


export function PixiLabels(context, scene) {
  let _strings = new Map();      // map of OSM ID -> label string
  let _texts = new Map();        // map of label -> Pixi Texture
  let _avoids = new Set();       // set of OSM ID we are avoiding

  // let _drawn = new RBush();
  // let _skipped = new RBush();
  let _placement = new RBush();
  let _lastk = 0;

  let _didInit = false;
  let _textStyle;

  // Create a render-texture allocator to create an on-the-fly texture atlas for
  // all our label rendering needs.
  // const _allocator = new CanvasTextureAllocator();

  function initLabels(context, layer) {
    _textStyle = new PIXI.TextStyle({
      fill: 0x333333,
      fontSize: 11,
      fontWeight: 600,
      miterLimit: 1,
      stroke: 0xeeeeee,
      strokeThickness: 3
    });

    const debugContainer = new PIXI.ParticleContainer(50000);
    debugContainer.interactiveChildren = false;
    debugContainer.sortableChildren = false;
    debugContainer.roundPixels = false;
    debugContainer.name = 'label-debug';
    layer.addChild(debugContainer);

    _didInit = true;
  }



  function renderLabels(layer, projection, zoom, entities) {
    if (!_didInit) initLabels(context, layer);

    const textDirection = localizer.textDirection();
    const SHOWBBOX = false;
    const debugContainer = layer.getChildByName('label-debug');

    const graph = context.graph();
    const k = projection.scale();
    let redoPlacement = false;   // we'll redo all the labels when scale changes


//// // debug
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


    if (k !== _lastk) {   // reset
      _avoids.clear();
      _placement.clear();
      debugContainer.removeChildren();
      redoPlacement = true;
      _lastk = k;
    }

    gatherAvoids();
    placePointLabels();
    placeLineLabels();
    placeAreaLabels();


    function getLabel(entity) {
      if (!_strings.has(entity.id)) {
        const str = utilDisplayName(entity);
        _strings.set(entity.id, str);   // save display name in `_strings` cache
        return str;
      }
      return _strings.get(entity.id);
    }

    function hasLineLabel(entity) {
      return (entity.geometry(graph) === 'line' && getLabel(entity));
    }
    function hasAreaLabel(entity) {
      return (entity.geometry(graph) === 'area' && getLabel(entity));
    }
    function hasPointLabel(entity) {
      const geom = entity.geometry(graph);
      return ((geom === 'vertex' || geom === 'point') && getLabel(entity));
    }


    //
    // Gather bounding boxes to avoid
    //
    function gatherAvoids() {
      const stage = context.pixi.stage;
      let avoids = [];
      const osmLayer = stage.getChildByName('osm');
      osmLayer.getChildByName('vertices').children.forEach(checkAvoid);
      osmLayer.getChildByName('points').children.forEach(checkAvoid);
      if (avoids.length) {
        _placement.load(avoids);  // bulk insert
      }

      function checkAvoid(sourceObject) {
        // if (!sourceObject.visible) return;

        const entityID = sourceObject.name;
        if (_avoids.has(entityID)) return;  // seen it already
        _avoids.add(entityID);

        const sourceFeature = scene.get(entityID);
        const rect = sourceFeature && sourceFeature.sceneBounds;
        if (!rect) return;

        // boxes here are in "scene" coordinates
        const fuzz = 0.01;
        avoids.push({
          id: entityID,
          minX: rect.x + fuzz,
          minY: rect.y + fuzz,
          maxX: rect.x + rect.width - fuzz,
          maxY: rect.y + rect.height - fuzz
        });

        if (SHOWBBOX) {
          const bbox = getDebugBBox(rect.x, rect.y, rect.width, rect.height, 0xbb3333, 0.75, `avoid-${entityID}`);
          debugContainer.addChild(bbox);
        }
      }
    }


    function createLabelSprite(str) {

// OLD just make more textures
      let sprite;
      let existing = _texts.get(str);
      if (existing) {
        sprite = new PIXI.Sprite(existing.texture);
      } else {
        sprite = new PIXI.Text(str, _textStyle);
        sprite.resolution = 2;
        sprite.updateText(false);  // force update it so its texture is ready to be reused on a sprite
        _texts.set(str, sprite);
      }
      sprite.name = str;
      sprite.anchor.set(0.5, 0.5);   // middle, middle
      return sprite;

// NEW with allocator
//
//      let sprite;
//      let texture = _texts.get(str);
//
//      if (!texture) {
//        const text = new PIXI.Text(str, _textStyle);
//        text.resolution = 2;
//        text.updateText(false);  // force update it so the texture is prepared
//
//        const srcBaseTexture = text.texture.baseTexture;
//        const srcCanvas = srcBaseTexture.resource.source;
//        const [w, h] = [srcBaseTexture.realWidth, srcBaseTexture.realHeight];
//
//        // Allocate space in the texture atlas
//        const padding = 0;
//        texture = _allocator.allocate(w, h, padding);
//
//        // The allocator automatically creates internal BaseTextures in "slabs".
//        // Now is the time change anything about the BaseTexture that got created
//        texture.baseTexture.resolution = 2;
//        texture.baseTexture.mipmap = false;
//
//        // copy the texture from source canvas -> destination canvas
//        const frame = texture.frame;
//        const destCanvas = texture.baseTexture.resource.source;
//        const destContext = destCanvas.getContext('2d');
//        destContext.drawImage(srcCanvas, frame.x, frame.y, frame.width, frame.height);
//
//        _texts.set(str, texture);
//        text.destroy();  //?
//      }
//
//      sprite = new PIXI.Sprite(texture);
//      sprite.name = str;
//      // sprite.scale.set(0.5, 0.5);
//      sprite.anchor.set(0.5, 0.5);   // middle, middle
//      return sprite;
    }


    //
    // Place point labels
    //
    function placePointLabels() {
      const points = entities
        .filter(hasPointLabel)
        .sort((a, b) => b.loc[1] - a.loc[1]);

      points
        .forEach(function preparePointLabels(entity) {
          let feature = scene.get(entity.id);
          if (!feature) return;

          if (!feature.label) {
            const str = _strings.get(entity.id);

            const sprite = createLabelSprite(str);
            layer.addChild(sprite);

            feature.label = {
              displayObject: sprite,
              localBounds: sprite.getLocalBounds(),
              string: str
            };
          }

          // Remember scale and reproject only when it changes
          if (!redoPlacement && k === feature.label.k) return;
          feature.label.k = k;

          feature.label.displayObject.visible = false;
          placePointLabel(feature, entity.id);
        });
    }


    //
    // Point labels are placed somewhere near the marker.
    // We generate several placement regions around the marker,
    // try them until we find one that doesn't collide with something.
    //
    function placePointLabel(feature, entityID) {
      if (!feature || !feature.sceneBounds) return;

      // `f` - feature, these bounds are in "scene" coordinates
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
      const lRect = feature.label.localBounds.clone().pad(0, -1);
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
        const where = preferences[i];
        const [x, y] = placements[where];
        const fuzz = 0.01;
        const box = {
          id: `${entityID}-${where}`,
          minX: x - lWidthHalf + fuzz,
          minY: y - lHeightHalf + fuzz,
          maxX: x + lWidthHalf - fuzz,
          maxY: y + lHeightHalf - fuzz
        };

        if (!_placement.collides(box)) {
          _placement.insert(box);
          feature.label.displayObject.position.set(x, y);
          picked = where;
          break;
        }
      }

      feature.label.displayObject.visible = !!picked;

      if (SHOWBBOX) {
        // const arr = Object.values(placements);         // show all possible boxes, or
        const arr = picked ? [placements[picked]] : [];   // show the one we picked
        arr.forEach(([x,y]) => {
          const bbox = getDebugBBox(x - lWidthHalf, y - lHeightHalf, lWidth, lHeight, 0xffff33, 0.75, `${entityID}-${picked}`);
          debugContainer.addChild(bbox);
        });
      }
    }


    //
    // Place line labels
    //
    function placeLineLabels() {
      const lines = entities
        .filter(hasLineLabel)
        .sort((a, b) => b.layer() - a.layer());

      lines
        .forEach(function prepareLineLabels(entity) {
          let feature = scene.get(entity.id);
          if (!feature) return;

          if (!feature.label) {
            const str = _strings.get(entity.id);
            const sprite = createLabelSprite(str);
            // note: we won't add it to container,
            // we just need its size and texture

            const container = new PIXI.Container();
            container.name = str;
            layer.addChild(container);

            feature.label = {
              displayObject: container,
              sprite: sprite,
              localBounds: sprite.getLocalBounds(),
              str: str
            };
          }

          // Remember scale and reproject only when it changes
          if (!redoPlacement && k === feature.label.k) return;
          feature.label.k = k;

          feature.label.displayObject.visible = false;
          placeLineLabel(feature, entity.id);
        });
    }


    //
    // Line labels are placed along a line.
    // We generate chains of bounding boxes along the line,
    // then add the labels in spaces along the line wherever they fit
    //
    function placeLineLabel(feature, entityID) {
      feature.label.displayObject.removeChildren();   // start fresh

      // `l` = label, these bounds are in "local" coordinates to the label,
      // 0,0 is the center of the label
      const lRect = feature.label.localBounds;
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
          const fuzz = 0.01;
          const box = {
            id: `${entityID}-${segindex}-${coordindex}`,
            minX: x - boxhalf + fuzz,
            minY: y - boxhalf + fuzz,
            maxX: x + boxhalf - fuzz,
            maxY: y + boxhalf - fuzz
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


      if (candidates.length) {  // we will label this line
        feature.label.displayObject.visible = true;
      }

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
        const rope = new PIXI.SimpleRope(feature.label.sprite.texture, points);
        rope.name = `${entityID}-rope-${chainIndex}`;
        rope.autoUpdate = false;
        rope.interactiveChildren = false;
        rope.sortableChildren = false;
        feature.label.displayObject.addChild(rope);
      });


      if (SHOWBBOX) {
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

          const bbox = getDebugBBox(box.minX, box.minY, boxsize, boxsize, color, alpha, box.id);
          debugContainer.addChild(bbox);
        });
      }
    }



    //
    // Place area labels
    //
    function placeAreaLabels() {
      return;  // not yet
    }


    //
    // Area labels are placed at the centroid along with an icon.
    // Can also consider:
    //   placing at pole-of-inaccessability instead of centroid?
    //   placing label along edge of area stroke?
    //
    function placeAreaLabel(feature, entityID) {
      return;  // not yet
    }


  }

  return renderLabels;
}


//// Listed from highest to lowest priority
//const LABELSTACK = [
//  ['line', 'aeroway', '*', 12],
//  ['line', 'highway', 'motorway', 12],
//  ['line', 'highway', 'trunk', 12],
//  ['line', 'highway', 'primary', 12],
//  ['line', 'highway', 'secondary', 12],
//  ['line', 'highway', 'tertiary', 12],
//  ['line', 'highway', '*', 12],
//  ['line', 'railway', '*', 12],
//  ['line', 'waterway', '*', 12],
//  ['area', 'aeroway', '*', 12],
//  ['area', 'amenity', '*', 12],
//  ['area', 'building', '*', 12],
//  ['area', 'historic', '*', 12],
//  ['area', 'leisure', '*', 12],
//  ['area', 'man_made', '*', 12],
//  ['area', 'natural', '*', 12],
//  ['area', 'shop', '*', 12],
//  ['area', 'tourism', '*', 12],
//  ['area', 'camp_site', '*', 12],
//  ['point', 'aeroway', '*', 10],
//  ['point', 'amenity', '*', 10],
//  ['point', 'building', '*', 10],
//  ['point', 'historic', '*', 10],
//  ['point', 'leisure', '*', 10],
//  ['point', 'man_made', '*', 10],
//  ['point', 'natural', '*', 10],
//  ['point', 'shop', '*', 10],
//  ['point', 'tourism', '*', 10],
//  ['point', 'camp_site', '*', 10],
//  ['line', 'name', '*', 12],
//  ['area', 'name', '*', 12],
//  ['point', 'name', '*', 10]
//];
