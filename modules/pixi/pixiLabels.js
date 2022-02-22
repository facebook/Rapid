import * as PIXI from 'pixi.js';
import RBush from 'rbush';
import { vecAdd, vecAngle, vecScale, vecSubtract, geomRotatePoints } from '@id-sdk/math';

import { localizer } from '../core/localizer';
import { utilDisplayName } from '../util';
import { getLineSegments, getDebugBBox } from './pixiHelpers.js';
import { RenderTextureAllocator } from '@pixi-essentials/texture-allocator';


export function pixiLabels(context, featureCache) {
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
  const _allocator = new RenderTextureAllocator();

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



  function renderLabels(layer, projection, entities) {
    if (!_didInit) initLabels(context, layer);

    const textDirection = localizer.textDirection();
    const SHOWBBOX = false;
    const debugContainer = layer.getChildByName('label-debug');

    const graph = context.graph();
    const k = projection.scale();
    let redoPlacement = false;   // we'll redo all the labels when scale changes


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
      stage.getChildByName('vertices').children.forEach(checkAvoid);
      stage.getChildByName('points').children.forEach(checkAvoid);
      if (avoids.length) {
        _placement.load(avoids);  // bulk insert
      }

      function checkAvoid(sourceObject) {
        // if (!sourceObject.visible) return;

        const entityID = sourceObject.name;
        if (_avoids.has(entityID)) return;  // seen it already
        _avoids.add(entityID);

        const sourceFeature = featureCache.get(entityID);
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
      let sprite;
      let existing = _texts.get(str);
      if (existing) {
        sprite = new PIXI.Sprite(existing);
      } else {
        let tempSprite = new PIXI.Text(str, _textStyle);

        let texture = _allocator.allocate(tempSprite.width, tempSprite.height);
        const renderer = context.pixi.renderer;

        renderer.render(tempSprite, texture);
        tempSprite.resolution = 2;
        tempSprite.updateText(false);  // force update it so its texture is ready to be reused on a sprite
        _texts.set(str, texture);
        tempSprite.destroy();
        sprite = new PIXI.Sprite(texture);
      }
      sprite.name = str;
      sprite.anchor.set(0.5, 0.5);   // middle, middle
      return sprite;
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
          let feature = featureCache.get(entity.id);
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
          let feature = featureCache.get(entity.id);
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
 return; // not yet
//      const areas = entities
//        .filter(hasAreaLabel);
//
//      areas
//        .forEach(function prepareAreaLabels(entity) {
//          let feature = featureCache.get(entity.id);
//          if (!feature) return;
//
//          if (!feature.label) {
//            feature.label = createLabelData(entity.id);
//          }
//
//          // Remember scale and reproject only when it changes
//          if (!redoPlacement && k === feature.label.k) return;
//          feature.label.k = k;
//
//          placeAreaLabel(feature, entity.id);
//        });
    }


    //
    // Area labels are placed at the centroid along with an icon.
    // Can also consider:
    //   placing at pole-of-inaccessability instead of centroid?
    //   placing label along edge of area stroke?
    //
    function placeAreaLabel(feature, entityID) {
       // nah
    }

//
//    // place line labels
//    lines
//      .forEach(function prepareLineLabels(entity) {
//        let feature = featureCache.get(entity.id);
//        if (!feature) return;
//
//        // Add the label to an existing feature.
//        if (!feature.label) {
//          const container = new PIXI.Container();
//          const label = _strings.get(entity.id);
//          container.name = label;
//          layer.addChild(container);
//
//          // for now
//          const target = entity.extent(graph).center();
//
//          let sprite;
//          let existing = _texts.get(label);
//          if (existing) {
//            sprite = new PIXI.Sprite(existing.texture);
//          } else {
//            sprite = new PIXI.Text(label, _textStyle);
//            _texts.set(label, sprite);
//          }
//
//          sprite.name = label;
//          sprite.anchor.set(0.5, 0.5);  // middle, middle
//          // sprite.angle = 40;
//          // sprite.position.set(0, 8);    // move below pin
//          container.addChild(sprite);
//
//          const rect = new PIXI.Rectangle();
//          sprite.getLocalBounds(rect);
//
//
//// experiments
//
//          const debug = new PIXI.Container();
//          debug.name = label + '-debug';
//          container.addChild(debug);
//
//          const bbox = new PIXI.Graphics()
//            .lineStyle(1, 0x00ffaa)
//            .drawShape(rect);
//          bbox.name = entity.id + '-bbox';
//          debug.addChild(bbox);
//
//
//          // try a rope?
//          let points = [];
//          let count = 10;
//          let span = rect.width / count;
//          for (let i = 0; i < count + 1; i++) {  // count+1 extra point at end
//            const x = span * i;
//            const y = Math.sin(i / Math.PI) * 10;
//            points.push(new PIXI.Point(x, y));
//          }
//          const rope = new PIXI.SimpleRope(sprite.texture, points);
//          rope.name = label + '-rope';
//          rope.position.set(-rect.width/2, 10);    // move below
//          container.addChild(rope);
//
////          // cover the text in small collision boxes
////          let rects = [];
////          const pad = 2;
////          const startx = -(rect.width / 2) - pad;
////          const endx = (rect.width / 2) + pad;
////          const starty = -(rect.height / 2) - pad;
////          const size = (rect.height + pad + pad);
////          const half = size / 2;
////          for (let x = startx, y = starty; x < (endx - half); x += half) {
////            const rect = new PIXI.Rectangle(x, y, size, size);
////            rects.push(rect);
////
////            const g = new PIXI.Graphics()
////              .lineStyle(1, 0xffff66)
////              .drawShape(rect);
////            g.name = entity.id + '-' + x.toString();
////            debug.addChild(g);
////          }
//
//
//          feature.label = {
//            displayObject: container,
//            debug: debug,
//            loc: target,
//            label: label,
//            sprite: sprite
//            // bbox: bbox
//          };
//        }
//
//        // remember scale and reproject only when it changes
//        if (k === feature.label.k) return;
//        feature.label.k = k;
//
//        const [x, y] = projection.project(feature.label.loc);
//        feature.label.displayObject.position.set(x, y);
//
//        // const offset = stage.position;
//        // feature.bbox.position.set(-offset.x, -offset.y);
//
//        // const rect = feature.displayObject.getBounds();
//        // feature.bbox
//        //   .clear()
//        //   .lineStyle(1, 0x66ff66)
//        //   .drawRect(rect.x, rect.y, rect.width, rect.height);
//      });
//


//
//
//  function shouldSkipIcon(preset) {
//    const noIcons = ['building', 'landuse', 'natural'];
//    return noIcons.some(function(s) {
//      return preset.id.indexOf(s) >= 0;
//    });
//  }
//
//
//
//
//
//
//
//
//
//
//
//
//  function drawLineLabels(layer, graph, cache, entities, labels) {
//    drawPointLabels(layer, graph, cache, entities, labels, false);
//  }
//
//
//  function drawPointLabels(layer, graph, cache, entities, labels, drawIcons) {
//      let data = entities;
//
//      // gather ids to keep
//      let keep = {};
//      data.forEach(entity => keep[entity.id] = true);
//
//
//      // exit
//      [...cache.entries()].forEach(([id, data]) => {
//      if (!keep[id]) {
//          layer.removeChild(data.container);
//          cache.delete(id);
//      }
//      });
//
//      data.forEach((entity, i) => {
//          let feature = cache.get(entity.id);
//
//          if (!feature) {
//              const str = utilDisplayName(entity, true)
//              const text = new PIXI.Text(str, _textStyle);
//              text.name = str;
//              // text.width = labels[i].width || 100;
//              // text.height = labels[i].height || 18;
//              // text.x = 0;
//              // text.y = 0;
//              const container = new PIXI.Container();
//              container.name = str;
//
//              if (drawIcons) {
//                  const preset = presetManager.match(entity, graph);
//                  const picon = preset && preset.icon;
//
//                  if (picon) {
//                      let thisSprite = getIconSpriteHelper(context, picon);
//
//                      let iconsize = 16;
//                      thisSprite.x = text.width * 0.5 + -0.5 *iconsize;  //?
//                      thisSprite.y = -text.height -0.5 *iconsize;  //?
//                      thisSprite.width = iconsize;
//                      thisSprite.height = iconsize;
//                      container.addChild(thisSprite);
//                  }
//
//
//              container.addChild(text);
//              }
//              layer.addChild(container);
//
//              feature = {
//                  loc: [labels[i].x, labels[i].y],
//                  height: labels[i].height || 18,
//                  width: labels[i].width || 100,
//                  rotation: labels[i].rotation,
//                  container: container
//              };
//
//              cache.set(entity.id, feature);
//          }
//
//          feature.container.x = labels[i].x - Math.cos(feature.container.width) / 2;
//          feature.container.y = labels[i].y - Math.sin(feature.container.height) / 2;
//          feature.container.rotation = feature.rotation || 0;
//          // feature.container.height = feature.height;
//          // feature.container.width = feature.width;
//      });
//
//  }
//
//
//  function drawAreaLabels(layer, graph, entities, labels) {
//      let filteredEntities = entities.filter( (entity, i) => labels[i].hasOwnProperty('x') && labels[i].hasOwnProperty('y'));
//      let filteredLabels = labels.filter( label => label.hasOwnProperty('x') && label.hasOwnProperty('y'));
//      drawPointLabels(layer, graph, _areacache, filteredEntities, filteredLabels, true);
//  }


  // function drawAreaIcons(selection, entities, labels) {
  //     var icons = selection.selectAll('use.' + classes)
  //         .filter(filter)
  //         .data(entities, osmEntity.key);

  //     // exit
  //     icons.exit()
  //         .remove();

  //     // enter/update
  //     icons.enter()
  //         .append('use')
  //         .attr('class', 'icon ' + classes)
  //         .attr('width', '17px')
  //         .attr('height', '17px')
  //         .merge(icons)
  //         .attr('transform', get(labels, 'transform'))
  //         .attr('xlink:href', function(d) {
  //             var preset = presetManager.match(d, context.graph());
  //             var picon = preset && preset.icon;

  //             if (!picon) {
  //                 return '';
  //             } else {
  //                 var isMaki = /^maki-/.test(picon);
  //                 return '#' + picon + (isMaki ? '-15' : '');
  //             }
  //         });
  //
  //   function get(array, prop) {
  //     return function(d, i) { return array[i][prop]; };
  //   }

  // }

//       var labelable = [];
//       var renderNodeAs = {};
//       var i, j, k, entity, geometry;

//       for (i = 0; i < LABELSTACK.length; i++) {
//           labelable.push([]);
//       }

//       _rdrawn.clear();
//       _rskipped.clear();
//       _entitybboxes = {};


//       // Loop through all the entities to do some preprocessing
//       for (i = 0; i < entities.length; i++) {
//           entity = entities[i];
//           geometry = entity.geometry(graph);

//           // Insert collision boxes around interesting points/vertices
//           if (geometry === 'point' || (geometry === 'vertex' && isInterestingVertex(entity))) {
//               var hasDirections = entity.directions(graph, projection).length;
//               var markerPadding;

//               if (geometry === 'point') {
//                   renderNodeAs[entity.id] = 'point';
//                   markerPadding = 20;   // extra y for marker height
//               } else {
//                   renderNodeAs[entity.id] = 'vertex';
//                   markerPadding = 0;
//               }

//               var coord = projection(entity.loc);
//               var nodePadding = 10;
//               var bbox = {
//                   minX: coord[0] - nodePadding,
//                   minY: coord[1] - nodePadding - markerPadding,
//                   maxX: coord[0] + nodePadding,
//                   maxY: coord[1] + nodePadding
//               };

//               doInsert(bbox, entity.id + 'P');
//           }

//           // From here on, treat vertices like points
//           if (geometry === 'vertex') {
//               geometry = 'point';
//           }

//           // Determine which entities are label-able
//           var preset = geometry === 'area' && presetManager.match(entity, graph);
//           var icon = preset && !shouldSkipIcon(preset) && preset.icon;

//           if (!icon && !utilDisplayName(entity)) continue;

//           for (k = 0; k < LABELSTACK.length; k++) {
//               var matchGeom = LABELSTACK[k][0];
//               var matchKey = LABELSTACK[k][1];
//               var matchVal = LABELSTACK[k][2];
//               var hasVal = entity.tags[matchKey];

//               if (geometry === matchGeom && hasVal && (matchVal === '*' || matchVal === hasVal)) {
//                   labelable[k].push(entity);
//                   break;
//               }
//           }
//       }

//       var positions = {
//           point: [],
//           line: [],
//           area: []
//       };

//       var labelled = {
//           point: [],
//           line: [],
//           area: []
//       };

//       // Try and find a valid label for labellable entities
//       for (k = 0; k < labelable.length; k++) {
//           var fontSize = LABELSTACK[k][3];

//           for (i = 0; i < labelable[k].length; i++) {
//               entity = labelable[k][i];
//               geometry = entity.geometry(graph);

//               var getName = (geometry === 'line') ? utilDisplayNameForPath : utilDisplayName;
//               var name = getName(entity);
//               var width = 100;  // just guess  // name && textWidth(name, fontSize);
//               var p = null;

//               if (geometry === 'point' || geometry === 'vertex') {
//                   // no point or vertex labels in wireframe mode
//                   // no vertex labels at low zooms (vertices have no icons)
//                   if (wireframe) continue;
//                   var renderAs = renderNodeAs[entity.id];
//                   if (renderAs === 'vertex' && zoom < 17) continue;

//                   p = getPointLabel(entity, width, fontSize, renderAs);

//               } else if (geometry === 'line') {
//                   p = getLineLabel(entity, width, fontSize);

//               } else if (geometry === 'area') {
//                   p = getAreaLabel(entity, width, fontSize);
//               }

//               if (p) {
//                   if (geometry === 'vertex') { geometry = 'point'; }  // treat vertex like point
//                   p.classes = geometry + ' tag-' + LABELSTACK[k][1];
//                   positions[geometry].push(p);
//                   labelled[geometry].push(entity);
//               }
//           }
//       }


//       function isInterestingVertex(entity) {
//           var selectedIDs = context.selectedIDs();

//           return entity.hasInterestingTags() ||
//               entity.isEndpoint(graph) ||
//               entity.isConnected(graph) ||
//               selectedIDs.indexOf(entity.id) !== -1 ||
//               graph.parentWays(entity).some(function(parent) {
//                   return selectedIDs.indexOf(parent.id) !== -1;
//               });
//       }

//       function getPointLabel(entity, width, height, geometry) {
//           var y = (geometry === 'point' ? -12 : 0);
//           var pointOffsets = {
//               ltr: [15, y, 'start'],
//               rtl: [-15, y, 'end']
//           };

//           var textDirection = localizer.textDirection();

//           var coord = projection(entity.loc);
//           var textPadding = 2;
//           var offset = pointOffsets[textDirection];
//           var p = {
//               height: height,
//               width: width,
//               x: coord[0] + offset[0],
//               y: coord[1] + offset[1],
//               textAnchor: offset[2]
//           };

//           // insert a collision box for the text label..
//           var bbox;
//           if (textDirection === 'rtl') {
//               bbox = {
//                   minX: p.x - width - textPadding,
//                   minY: p.y - (height / 2) - textPadding,
//                   maxX: p.x + textPadding,
//                   maxY: p.y + (height / 2) + textPadding
//               };
//           } else {
//               bbox = {
//                   minX: p.x - textPadding,
//                   minY: p.y - (height / 2) - textPadding,
//                   maxX: p.x + width + textPadding,
//                   maxY: p.y + (height / 2) + textPadding
//               };
//           }

//           if (tryInsert([bbox], entity.id, true)) {
//               return p;
//           }
//       }


//       function getLineLabel(entity, width, height) {
//           var rect = context.projection.clipExtent();
//           var viewport = new Extent(rect[0], rect[1]).polygon();
//           var points = graph.childNodes(entity)
//               .map(function(node) { return projection(node.loc); });
//           var length = geomPathLength(points);

//           if (length < width + 20) return;

//           // % along the line to attempt to place the label
//           var lineOffsets = [50, 45, 55, 40, 60, 35, 65, 30, 70,
//                              25, 75, 20, 80, 15, 95, 10, 90, 5, 95];
//           var padding = 3;

//           for (var i = 0; i < lineOffsets.length; i++) {
//               var offset = lineOffsets[i];
//               var middle = offset / 100 * length;
//               var start = middle - width / 2;

//               if (start < 0 || start + width > length) continue;

//               // generate subpath and ignore paths that are invalid or don't cross viewport.
//               var sub = subpath(points, start, start + width);
//               if (!sub || !geomPolygonIntersectsPolygon(viewport, sub, true)) {
//                   continue;
//               }

//               var isReverse = reverse(sub);
//               if (isReverse) {
//                   sub = sub.reverse();
//               }

//               var bboxes = [];
//               var boxsize = (height + 2) / 2;

//               let longestCoordPair = [];
//               let longestLength = 0;
//               for (var j = 0; j < sub.length - 1; j++) {
//                   var a = sub[j];
//                   var b = sub[j + 1];

//                   let length = vecLength(a, b);
//                   if (longestLength < length) {
//                       longestLength = length;
//                       longestCoordPair = [a, b];
//                   }

//                   // split up the text into small collision boxes
//                   var num = Math.max(1, Math.floor(length / boxsize / 2));

//                   for (var box = 0; box < num; box++) {
//                       var p = vecInterp(a, b, box / num);
//                       var x0 = p[0] - boxsize - padding;
//                       var y0 = p[1] - boxsize - padding;
//                       var x1 = p[0] + boxsize + padding;
//                       var y1 = p[1] + boxsize + padding;

//                       bboxes.push({
//                           minX: Math.min(x0, x1),
//                           minY: Math.min(y0, y1),
//                           maxX: Math.max(x0, x1),
//                           maxY: Math.max(y0, y1)
//                       });
//                   }
//               }

//               // We've just calculated the longest way inside the sub geometry.
//               // Now, calculate that way's angle.
//               // This gives us our rotation for rendering.
//               var angle = Math.atan2(longestCoordPair[1][1] - longestCoordPair[0][1], longestCoordPair[1][0] - longestCoordPair[0][0]);


//               if (tryInsert(bboxes, entity.id, false)) {   // accept this one
//                   return {
//                       'font-size': height + 2,
//                       lineString: lineString(sub),
//                       x: sub[0][0],
//                       y: sub[0][1],
//                       length: longestLength,
//                       rotation: angle,
//                       startOffset: offset + '%'
//                   };
//               }
//           }

//           function reverse(p) {
//               var angle = Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
//               return !(p[0][0] < p[p.length - 1][0] && angle < Math.PI/2 && angle > -Math.PI/2);
//           }

//           function lineString(points) {
//               return 'M' + points.join('L');
//           }

//           function subpath(points, from, to) {
//               var sofar = 0;
//               var start, end, i0, i1;

//               for (var i = 0; i < points.length - 1; i++) {
//                   var a = points[i];
//                   var b = points[i + 1];
//                   var current = vecLength(a, b);
//                   var portion;
//                   if (!start && sofar + current >= from) {
//                       portion = (from - sofar) / current;
//                       start = [
//                           a[0] + portion * (b[0] - a[0]),
//                           a[1] + portion * (b[1] - a[1])
//                       ];
//                       i0 = i + 1;
//                   }
//                   if (!end && sofar + current >= to) {
//                       portion = (to - sofar) / current;
//                       end = [
//                           a[0] + portion * (b[0] - a[0]),
//                           a[1] + portion * (b[1] - a[1])
//                       ];
//                       i1 = i + 1;
//                   }
//                   sofar += current;
//               }

//               var result = points.slice(i0, i1);
//               result.unshift(start);
//               result.push(end);
//               return result;
//           }
//       }



//       function getAreaLabel(entity, width, height) {
//           var centroid = path.centroid(entity.asGeoJSON(graph));
//           var extent = entity.extent(graph);
//           var areaWidth = projection(extent.max)[0] - projection(extent.min)[0];

//           if (isNaN(centroid[0]) || areaWidth < 20) return;

//           var preset = presetManager.match(entity, context.graph());
//           var picon = preset && preset.icon;
//           var iconSize = 17;
//           var padding = 2;
//           var p = {};

//           if (picon) {  // icon and label..
//               if (addIcon()) {
//                   addLabel(iconSize + padding);
//                   return p;
//               }
//           } else {   // label only..
//               if (addLabel(0)) {
//                   return p;
//               }
//           }


//           function addIcon() {
//               var iconX = centroid[0] - (iconSize / 2);
//               var iconY = centroid[1] - (iconSize / 2);
//               var bbox = {
//                   minX: iconX,
//                   minY: iconY,
//                   maxX: iconX + iconSize,
//                   maxY: iconY + iconSize
//               };

//               if (tryInsert([bbox], entity.id + 'I', true)) {
//                   p.transform = 'translate(' + iconX + ',' + iconY + ')';
//                   return true;
//               }
//               return false;
//           }

//           function addLabel(yOffset) {
//               if (width && areaWidth >= width + 20) {
//                   var labelX = centroid[0];
//                   var labelY = centroid[1] + yOffset;
//                   var bbox = {
//                       minX: labelX - (width / 2) - padding,
//                       minY: labelY - (height / 2) - padding,
//                       maxX: labelX + (width / 2) + padding,
//                       maxY: labelY + (height / 2) + padding
//                   };

//                   if (tryInsert([bbox], entity.id, true)) {
//                       p.x = labelX;
//                       p.y = labelY;
//                       p.textAnchor = 'middle';
//                       p.height = height;
//                       return true;
//                   }
//               }
//               return false;
//           }
//       }


//       // force insert a singular bounding box
//       // singular box only, no array, id better be unique
//       function doInsert(bbox, id) {
//           bbox.id = id;

//           var oldbox = _entitybboxes[id];
//           if (oldbox) {
//               _rdrawn.remove(oldbox);
//           }
//           _entitybboxes[id] = bbox;
//           _rdrawn.insert(bbox);
//       }


//       function tryInsert(bboxes, id, saveSkipped) {
//           var skipped = false;

//           for (var i = 0; i < bboxes.length; i++) {
//               var bbox = bboxes[i];
//               bbox.id = id;

//               // Check that label is visible
//               if (bbox.minX < 0 || bbox.minY < 0 || bbox.maxX > dimensions[0] || bbox.maxY > dimensions[1]) {
//                   skipped = true;
//                   break;
//               }
//               if (_rdrawn.collides(bbox)) {
//                   skipped = true;
//                   break;
//               }
//           }

//           _entitybboxes[id] = bboxes;

//           if (skipped) {
//               if (saveSkipped) {
//                   _rskipped.load(bboxes);
//               }
//           } else {
//               _rdrawn.load(bboxes);
//           }

//           return !skipped;
//       }

//       drawPointLabels(layer, graph, _pointcache, labelled.point, positions.point);
//       drawLineLabels(layer, graph, _linecache, labelled.line, positions.line);
//       drawAreaLabels(layer, graph, labelled.area,  positions.area);
//       // drawAreaLabels(halo, labelled.area, filter, 'arealabel-halo', positions.area);
// //         drawAreaIcons(layer, labelled.area,  positions.area);
//       // drawAreaIcons(halo, labelled.area, filter, 'areaicon-halo', positions.area);

//   }

  }

  return renderLabels;
}


// Listed from highest to lowest priority
const LABELSTACK = [
  ['line', 'aeroway', '*', 12],
  ['line', 'highway', 'motorway', 12],
  ['line', 'highway', 'trunk', 12],
  ['line', 'highway', 'primary', 12],
  ['line', 'highway', 'secondary', 12],
  ['line', 'highway', 'tertiary', 12],
  ['line', 'highway', '*', 12],
  ['line', 'railway', '*', 12],
  ['line', 'waterway', '*', 12],
  ['area', 'aeroway', '*', 12],
  ['area', 'amenity', '*', 12],
  ['area', 'building', '*', 12],
  ['area', 'historic', '*', 12],
  ['area', 'leisure', '*', 12],
  ['area', 'man_made', '*', 12],
  ['area', 'natural', '*', 12],
  ['area', 'shop', '*', 12],
  ['area', 'tourism', '*', 12],
  ['area', 'camp_site', '*', 12],
  ['point', 'aeroway', '*', 10],
  ['point', 'amenity', '*', 10],
  ['point', 'building', '*', 10],
  ['point', 'historic', '*', 10],
  ['point', 'leisure', '*', 10],
  ['point', 'man_made', '*', 10],
  ['point', 'natural', '*', 10],
  ['point', 'shop', '*', 10],
  ['point', 'tourism', '*', 10],
  ['point', 'camp_site', '*', 10],
  ['line', 'name', '*', 12],
  ['area', 'name', '*', 12],
  ['point', 'name', '*', 10]
];
