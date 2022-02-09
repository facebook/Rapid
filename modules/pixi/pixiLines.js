import * as PIXI from 'pixi.js';
import { DashLine } from 'pixi-dashed-line';
import { geoScaleToZoom } from '@id-sdk/math';

import { osmPavedTags } from '../osm/tags';
import { getLineSegments } from './pixiHelpers';
import { styleMatch } from './pixiStyles';


export function pixiLines(context, featureCache) {
  const ONEWAY_SPACING = 35;
  let _textures = {};
  let _didInit = false;

  //
  // prepare template geometry
  //
  function init(layer) {
    const midpoint = new PIXI.Graphics()
      .lineStyle(1, 0x000000)
      .beginFill(0xffffff, 1)
      .drawPolygon([-3,4, 5,0, -3,-4])
      .endFill();

    const oneway = new PIXI.Graphics()
      .beginFill(0x030303, 1)
      .drawPolygon([5,3, 0,3, 0,2, 5,2, 5,0, 10,2.5, 5,5])
      .endFill();

    // convert graphics to textures/sprites for performance
    // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    _textures.midpoint = renderer.generateTexture(midpoint, options);
    _textures.oneway = renderer.generateTexture(oneway, options);

    // initialize levels (bridge/tunnel/etc)
    for (let i = -10; i <= 10; i++) {
      const lvl = new PIXI.Container();
      lvl.name = i.toString();
      lvl.zIndex = i;
      lvl.sortableChildren = true;
      layer.addChild(lvl);
    }

    _didInit = true;
  }


  //
  // render
  //
  function renderLines(layer, projection, entities) {
    if (!_didInit) init(layer);

    const graph = context.graph();
    const k = projection.scale();
    const zoom = geoScaleToZoom(k);
    const SHOWBBOX = false;

    function isUntaggedMultipolygonRing(entity) {
      if (entity.hasInterestingTags()) return false;
      return graph.parentRelations(entity)
        .some(relation => relation.isMultipolygon());
    }


    function isLine(entity) {
      return entity.type === 'way' &&
        entity.geometry(graph) === 'line' &&
        !isUntaggedMultipolygonRing(entity);
    }

    // enter/update
    entities
      .filter(isLine)
      .forEach(function prepareLine(entity) {
        let feature = featureCache.get(entity.id);

        if (!feature) {   // make line if needed
          const geojson = entity.asGeoJSON(graph);
          const coords = geojson.coordinates;

          // Place this line on the correct level (bridge/tunnel/etc)
          const lvl = entity.layer().toString();
          const level = layer.getChildByName(lvl);

          const container = new PIXI.Container();
          container.name = entity.id;
          container.zIndex = getzIndex(entity.tags);
          level.addChild(container);

          const casing = new PIXI.Graphics();
          casing.name = entity.id + '-casing';
          container.addChild(casing);

          const stroke = new PIXI.Graphics();
          stroke.name = entity.id + '-stroke';
          container.addChild(stroke);

          const style = styleMatch(entity.tags);

          const bounds = new PIXI.Rectangle();

          const bbox = new PIXI.Graphics();
          bbox.name = entity.id + '-bbox';
          bbox.visible = SHOWBBOX;
          container.addChild(bbox);

          feature = {
            type: 'line',
            displayObject: container,
            bounds: bounds,
            coords: coords,
            casing: casing,
            stroke: stroke,
            bbox: bbox,
            style: style
          };

          if (entity.isOneWay()) {
            const oneways = new PIXI.Container();
            oneways.name = entity.id + '-oneways';
            container.addChild(oneways);
            feature.oneways = oneways;
          }

          featureCache.set(entity.id, feature);
        }

        // Remember scale and reproject only when it changes
        if (k === feature.k) return;
        feature.k = k;

        // Reproject and recalculate the bounding box
        let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
        feature.points = [];

        feature.coords.forEach(coord => {
          const [x, y] = projection.project(coord);
          feature.points.push([x, y]);

          [minX, minY] = [Math.min(x, minX), Math.min(y, minY)];
          [maxX, maxY] = [Math.max(x, maxX), Math.max(y, maxY)];
        });
        if (entity.tags.oneway === '-1') {
          feature.points.reverse();
        }

        const [w, h] = [maxX - minX, maxY - minY];
        feature.bounds.x = minX;
        feature.bounds.y = minY;
        feature.bounds.width = w;
        feature.bounds.height = h;

        updateGraphic('casing', feature.casing);
        updateGraphic('stroke', feature.stroke);


        if (feature.oneways) {
          const segments = getLineSegments(feature.points, ONEWAY_SPACING);
          feature.oneways.removeChildren();

          segments.forEach(segment => {
            segment.coords.forEach(([x, y]) => {
              const arrow = new PIXI.Sprite(_textures.oneway);
              arrow.anchor.set(0.5, 0.5);  // middle, middle
              arrow.position.set(x, y);
              arrow.rotation = segment.angle;
              feature.oneways.addChild(arrow);
            });
          });
        }

        if (SHOWBBOX) {
          feature.bbox
            .clear()
            .lineStyle({
              width: 1,
              color: 0x66ff66,
              alignment: 0   // inside
            })
            .drawShape(feature.bounds);
        }

        function updateGraphic(which, graphic) {
          const minwidth = (which === 'casing' ? 3 : 2);
          let width = feature.style[which].width;
          if (zoom < 17) width -= 2;
          if (zoom < 15) width -= 2;
          if (width < minwidth) width = minwidth;

          let g = graphic.clear();
          if (feature.style[which].alpha === 0) return;

          if (feature.style[which].dash) {
            g = new DashLine(g, {
              dash: feature.style[which].dash,
              color: feature.style[which].color,
              width: width,
              alpha: feature.style[which].alpha || 1.0,
              join: feature.style[which].join || PIXI.LINE_JOIN.ROUND,
              cap: feature.style[which].cap || PIXI.LINE_CAP.ROUND
            });
          } else {
            g = g.lineStyle({
              color: feature.style[which].color,
              width: width,
              alpha: feature.style[which].alpha || 1.0,
              join: feature.style[which].join || PIXI.LINE_JOIN.ROUND,
              cap: feature.style[which].cap || PIXI.LINE_CAP.ROUND
            });
          }

          feature.points.forEach(([x, y], i) => {
            if (i === 0) {
              g.moveTo(x, y);
            } else {
              g.lineTo(x, y);
            }
          });
        }
      });
  }

  return renderLines;
}

const HIGHWAYSTACK = {
  motorway: 0,
  motorway_link: -1,
  trunk: -2,
  trunk_link: -3,
  primary: -4,
  primary_link: -5,
  secondary: -6,
  tertiary: -7,
  unclassified: -8,
  residential: -9,
  service: -10,
  track: -11,
  footway: -12
};


function getzIndex(tags) {
  return HIGHWAYSTACK[tags.highway] || 0;
}

