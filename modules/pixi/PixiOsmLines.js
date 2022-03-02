import * as PIXI from 'pixi.js';
// import { DashLine } from 'pixi-dashed-line';

// import { getLineSegments, lineToPolygon } from './helpers';

import { PixiFeatureLine } from './PixiFeatureLine';
import { styleMatch } from './styles';


export function PixiOsmLines(context, featureCache) {
  let _didInit = false;

  // initialize levels (bridge/tunnel/etc)
  function init(layer) {
    for (let i = -10; i <= 10; i++) {
      const lvl = new PIXI.Container();
      lvl.name = i.toString();
      lvl.interactive = false;
      lvl.sortableChildren = true;
      lvl.zIndex = i;
      layer.addChild(lvl);
    }
    _didInit = true;
  }


  //
  // render
  //
  function renderLines(layer, projection, zoom, entities) {
    if (!_didInit) init(layer);

    const graph = context.graph();
    // const SHOWBBOX = false;

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

        //This feature used to be part of the rapid layer... need to redraw it!
        if (feature && feature.rapidFeature) {
          feature.displayObject.visible = false;
          featureCache.delete(entity.id);
          feature = null;
        }

        if (!feature) {   // make line if needed
          const geojson = entity.asGeoJSON(graph);
          const coords = geojson.coordinates;
          const style = styleMatch(entity.tags);

          const showOneWay = entity.isOneWay();
          const reversePoints = (entity.tags.oneway === '-1');

          feature = new PixiFeatureLine(context, entity.id, coords, style, showOneWay, reversePoints);
          const container = feature.displayObject;
          container.zIndex = getzIndex(entity.tags);
          container.__data__ = entity;

          // Place this line on the correct level (bridge/tunnel/etc)
          const lvl = entity.layer().toString();
          const level = layer.getChildByName(lvl);
          level.addChild(container);

          featureCache.set(entity.id, feature);
        }

        feature.update(projection, zoom);

//        if (SHOWBBOX) {
//          feature.bbox
//            .clear()
//            .lineStyle({
//              width: 1,
//              color: 0x66ff66,
//              alignment: 0   // inside
//            })
//            .drawShape(this.sceneBounds);
//        }
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

