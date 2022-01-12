import * as PIXI from 'pixi.js';
import RBush from 'rbush';

import { Extent, geoScaleToZoom, geomPolygonIntersectsPolygon, geomPathLength, vecInterp, vecLength } from '@id-sdk/math';
import { utilEntitySelector } from '@id-sdk/util';
import { localizer } from '../core/localizer';

import { presetManager } from '../presets';
import { getIconSpriteHelper } from './pixiHelpers';
import { utilDisplayName, utilDisplayNameForPath } from '../util';


export function pixiLabels(context) {
  let _labelCache = new Map();   // map of OSM ID -> Pixi data
  let _avoidCache = new Map();   // map of OSM ID -> Pixi data
  let _labels = new Map();       // map of OSM ID -> label string

  let _rdrawn = new RBush();
  let _rskipped = new RBush();
  let _entitybboxes = {};

  let _didInit = false;
  let _textStyle;

  let SHOWDEBUG = true;

  function initLabels(context) {
    _textStyle = new PIXI.TextStyle({
      fill: 0x333333,
      fontSize: 12,
      fontWeight: 600,
      miterLimit: 1,
      stroke: 0xeeeeee,
      strokeThickness: 3
    });
    _didInit = true;
  }
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
//          let datum = cache.get(entity.id);
//
//          if (!datum) {
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
//              datum = {
//                  loc: [labels[i].x, labels[i].y],
//                  height: labels[i].height || 18,
//                  width: labels[i].width || 100,
//                  rotation: labels[i].rotation,
//                  container: container
//              };
//
//              cache.set(entity.id, datum);
//          }
//
//          datum.container.x = labels[i].x - Math.cos(datum.container.width) / 2;
//          datum.container.y = labels[i].y - Math.sin(datum.container.height) / 2;
//          datum.container.rotation = datum.rotation || 0;
//          // datum.container.height = datum.height;
//          // datum.container.width = datum.width;
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



  function renderLabels(layer, projection, entities) {
    if (!_didInit) initLabels(context);

    const graph = context.graph();
    const k = projection.scale();


    function isInterestingVertex(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'vertex' && (
        graph.isShared(entity) || entity.hasInterestingTags() || entity.isEndpoint(graph)
      );
    }

    function isPoint(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'point';
    }

    function isLabelable(entity) {
      if (!_labels.has(entity.id)) {
        let name = utilDisplayName(entity);   // save display name in `_labels` cache
        _labels.set(entity.id, name);
        return name;
      }
      return _labels.get(entity.id);
    }

    // gather labels
    const data = entities.filter(isLabelable);
    const avoids = entities.filter(e => (isPoint(e) || isInterestingVertex(e)));

    // gather ids to keep
    let visible = {};
    data.forEach(entity => visible[entity.id] = true);
    avoids.forEach(entity => visible[entity.id] = true);

    // exit
    [..._labelCache.entries()].forEach(function cullLabels([id, datum]) {
      datum.container.visible = !!visible[id];
    });

    // enter/update
    data
      .forEach(function prepareLabels(entity) {
        let datum = _labelCache.get(entity.id);

        if (!datum) {
          const container = new PIXI.Container();
          const label = _labels.get(entity.id);
          container.name = label;
          layer.addChild(container);

          const text = new PIXI.Text(label, _textStyle);
          text.name = label;
          container.addChild(text);

          // for now
          const center = entity.extent(graph).center();

          datum = {
            loc: center,
            label: label,
            container: container
          };

          _labelCache.set(entity.id, datum);
        }

        // remember scale and reproject only when it changes
        if (k === datum.k) return;
        datum.k = k;

        const coord = projection.project(datum.loc);
        datum.container.position.set(coord[0], coord[1]);
      });


//  AVOIDS - for now draw a box

    // exit
    [..._avoidCache.entries()].forEach(function cullAvoids([id, datum]) {
      datum.graphics.visible = !!visible[id];
    });

    // enter/update
    avoids
      .forEach(function prepareAvoids(node) {
        let datum = _avoidCache.get(node.id);

        if (!datum) {
          const graphics = new PIXI.Graphics();
          graphics.name = node.id;
          layer.addChild(graphics);

          datum = {
            loc: node.loc,
            graphics: graphics
          };

          _avoidCache.set(node.id, datum);
        }

        // remember scale and reproject only when it changes
        if (k === datum.k) return;
        datum.k = k;

        const coord = projection.project(datum.loc);

        let x, y, w, h;
        if (isPoint(node)) {   // avoid the pin
          x = coord[0] - 9;
          y = coord[1] - 25;
          w = 18;
          h = 26;
        } else {               // avoid the vertex
          x = coord[0] - 9;
          y = coord[1] - 9;
          w = 18;
          h = 18;
        }

        datum.graphics
          .clear()
          .lineStyle(1, 0xffff00)
          .drawRect(x, y, w, h);
      });
  }



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
//           var bounds = context.projection.clipExtent();
//           var viewport = new Extent(bounds[0], bounds[1]).polygon();
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
