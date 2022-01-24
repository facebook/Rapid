import geojsonRewind from '@mapbox/geojson-rewind';

import * as PIXI from 'pixi.js';
import { getPixiTagPatternKey } from './pixiHelpers';

const PARTIALFILLWIDTH = 32;


export function pixiAreas(context, featureCache) {
  //
  // render
  //
  function renderAreas(layer, projection, entities) {

    const graph = context.graph();
    const k = projection.scale();

    function isPolygon(entity) {
      return (entity.type === 'way' || entity.type === 'relation') && entity.geometry(graph) === 'area';
    }

    // enter/update
    entities
      .filter(isPolygon)
      .forEach(function prepareAreas(entity) {
        let feature = featureCache.get(entity.id);

        if (!feature) {   // make poly if needed
          const style = styleMatch(entity.tags);
          const geojson = geojsonRewind(entity.asGeoJSON(graph), true);
          const coords = (geojson.type === 'Polygon') ? geojson.coordinates[0]
            : (geojson.type === 'MultiPolygon') ? geojson.coordinates[0][0] : [];   // outer ring only
          if (!coords.length) return;

          const polygon = new PIXI.Polygon();
          const bounds = new PIXI.Rectangle();
          const colorMatrix = new PIXI.filters.AlphaFilter(style.alpha || 0.25);

          const container = new PIXI.Container();
          container.name = entity.id;
          layer.addChild(container);

          const stroke = new PIXI.Graphics();
          stroke.name = entity.id + '-stroke';

          const mask = new PIXI.Graphics();
          mask.name = entity.id + '-mask';

          const fill = new PIXI.Graphics();
          fill.name = entity.id + '-fill';
          fill.blendMode = PIXI.BLEND_MODES.NORMAL;

          const bbox = new PIXI.Graphics();
          bbox.name = entity.id + '-bbox';

          container.addChild(fill);
          container.addChild(stroke);
          container.addChild(mask);
          container.addChild(bbox);

          const pattern = getPixiTagPatternKey(context, entity.tags);
          const texture = pattern && context.pixi.rapidTextures.get(pattern);

          feature = {
            displayObject: container,
            polygon: polygon,
            bounds: bounds,
            colorMatrix: colorMatrix,
            style: style,
            coords: coords,
            fill: fill,
            stroke: stroke,
            mask: mask,
            bbox: bbox,
            texture: texture
          };

          featureCache.set(entity.id, feature);
        }

        // Remember scale and reproject only when it changes
        if (k === feature.k) return;
        feature.k = k;

        // Reproject and recalculate the bounding box
        let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
        let path = [];

        feature.coords.forEach(coord => {
          const [x, y] = projection.project(coord);
          path.push(x, y);

          [minX, minY] = [Math.min(x, minX), Math.min(y, minY)];
          [maxX, maxY] = [Math.max(x, maxX), Math.max(y, maxY)];
        });

        feature.polygon.points = path;

        const [w, h] = [maxX - minX, maxY - minY];
        feature.bounds.x = minX;
        feature.bounds.y = minY;
        feature.bounds.width = w;
        feature.bounds.height = h;


        // Determine style info
        let color = feature.style.color || 0xaaaaaa;
        let alpha = feature.style.alpha || 0.25;
        let texture = feature.texture || PIXI.Texture.WHITE;  // WHITE turns off the texture
        let doPartialFill = true;

        // If this shape is so small that partial filling makes no sense, fill fully (faster?)
        const cutoff = (2 * PARTIALFILLWIDTH) + 5;
        if (w < cutoff || h < cutoff) {
          doPartialFill = false;
        }
        // If this shape is so small that texture filling makes no sense, skip it (faster?)
        if (w < 32 || h < 32) {
          texture = PIXI.Texture.WHITE;
        }


        // update shapes
        feature.bbox
          .clear()
          .lineStyle(1, doPartialFill ? 0x66ff66 : 0xffff00)
          .drawShape(feature.bounds);

        feature.stroke
          .clear()
          .lineStyle({
            alpha: 1,
            width: feature.style.width || 2,
            color: color
          })
          .drawShape(feature.polygon);


        if (doPartialFill) {
          feature.mask.visible = true;
          feature.mask
            .clear()
            .beginFill(0x000000, 1)
            .drawPolygon(path)
            .endFill();

          feature.fill
            .clear()
            .lineTextureStyle({
              alpha: 1,
              alignment: 0,  // inside
              width: PARTIALFILLWIDTH,
              color: color,
              texture: texture
            })
            .drawShape(feature.polygon);

          feature.fill.filters = [feature.colorMatrix];
          feature.fill.mask = feature.mask;

        } else {  // full fill
          feature.mask.visible = false;
          feature.fill
            .clear()
            .beginTextureFill({
              alpha: alpha,
              color: color,
              texture: texture
            })
            .drawPolygon(path)
            .endFill();

          feature.fill.filters = null;
          feature.fill.mask = null;
        }
      });
  }

  return renderAreas;
}


const STYLES = {
  red: {
    width: 2,
    color: 0xe06e5f,  // rgba(224, 110, 95)
    alpha: 0.3
  },
  green: {
    width: 2,
    color: 0x8cd05f,  // rgb(140, 208, 95)
    alpha: 0.3
  },
  blue: {
    width: 2,
    color: 0x77d4de,  // rgb(119, 211, 222)
    alpha: 0.3
  },
  yellow: {
    width: 2,
    color: 0xffff94,  // rgb(255, 255, 148)
    alpha: 0.25
  },
  gold: {
    width: 2,
    color: 0xc4be19,  // rgb(196, 189, 25)
    alpha: 0.3
  },
  orange: {
    width: 2,
    color: 0xd6881a,  // rgb(214, 136, 26)
    alpha: 0.3
  },
  pink: {
    width: 2,
    color: 0xe3a4f5,  // rgb(228, 164, 245)
    alpha: 0.3
  },
  teal: {
    width: 2,
    color: 0x99e1aa,  // rgb(153, 225, 170)
    alpha: 0.3
  },
  lightgreen: {
    width: 2,
    color: 0xbee83f,  // rgb(191, 232, 63)
    alpha: 0.3
  },
  tan: {
    width: 2,
    color: 0xf5dcba,  // rgb(245, 220, 186)
    alpha: 0.3
  },
  darkgray: {
    width: 2,
    color: 0x8c8c8c,  // rgb(140, 140, 140)
    alpha: 0.5
  },
  lightgray: {
    width: 2,
    color: 0xaaaaaa,  // rgb(170, 170, 170)
    alpha: 0.3
  }
};

const TAGSTYLES = {
  amenity: {
    fountain: 'blue',
    childcare: 'yellow',
    kindergarten: 'yellow',
    school: 'yellow',
    college: 'yellow',
    university: 'yellow',
    research_institute: 'yellow',
    parking: 'darkgray'
  },
  building: {
    '*': 'red'
  },
  construction: {
    '*': 'gold'
  },
  barrier: {
    hedge: 'green'
  },
  golf: {
    'green': 'lightgreen'
  },
  landuse: {
    flowerbed: 'green',
    forest: 'green',
    grass: 'green',
    recreation_ground: 'green',
    village_green: 'green',
    residential: 'gold',
    retail: 'orange',
    commercial: 'orange',
    landfill: 'orange',
    military: 'orange',
    industrial: 'pink',
    cemetery: 'lightgreen',
    farmland: 'lightgreen',
    meadow: 'lightgreen',
    orchard: 'lightgreen',
    vineyard: 'lightgreen',
    farmyard: 'tan',
    railway: 'darkgray',
    quarry: 'darkgray'
  },
  leisure: {
    garden: 'green',
    golf_course: 'green',
    nature_reserve: 'green',
    park: 'green',
    pitch: 'green',
    track: 'yellow',
    swimming_pool: 'blue'
  },
  man_made: {
    adit: 'darkgray',
    groyne: 'darkgray',
    breakwater: 'darkgray'
  },
  military: {
    '*': 'orange'
  },
  natural: {
    bay: 'blue',
    water: 'blue',
    beach: 'yellow',
    sand: 'yellow',
    scrub: 'yellow',
    wetland: 'teal',
    bare_rock: 'darkgray',
    cave_entrance: 'darkgray',
    cliff: 'darkgray',
    rock: 'darkgray',
    scree: 'darkgray',
    stone: 'darkgray',
    shingle: 'darkgray',
    glacier: 'lightgray',
    '*': 'green'
  },
  power: {
    'plant': 'pink'
  },
  sport: {
    beachvolleyball: 'yellow',
    baseball: 'yellow',
    softball: 'yellow',
    basketball: 'darkgray',
    skateboard: 'darkgray'
  },
  waterway: {
    dam: 'darkgray',
    weir: 'darkgray'
  }
};


export function styleMatch(tags) {
  let style = STYLES.lightgray;  // default
  let selectivity = 999;

  for (const k in tags) {
    const v = tags[k];
    const group = TAGSTYLES[k];
    if (!group || !v) continue;

    // smaller groups are more selective
    let groupsize = Object.keys(group).length;
    let stylename = group[v];
    if (!stylename) stylename = group['*'];  // fallback value

    if (stylename && groupsize < selectivity) {
      style = STYLES[stylename];
      selectivity = groupsize;
      if (selectivity === 1) break;  // no need to keep looking at tags
    }
  }

  return style;
}
