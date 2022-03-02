import geojsonRewind from '@mapbox/geojson-rewind';

import { PixiFeaturePolygon } from './PixiFeaturePolygon';
import { styleMatch } from './styles';


export function PixiOsmAreas(context, featureCache) {

  //
  // render
  //
  function renderAreas(layer, projection, zoom, entities) {
    const graph = context.graph();

    function isPolygon(entity) {
      return (entity.type === 'way' || entity.type === 'relation') && entity.geometry(graph) === 'area';
    }

    // enter/update
    entities
      .filter(isPolygon)
      .forEach(function prepareAreas(entity) {
        let feature = featureCache.get(entity.id);

        //This feature used to be part of the rapid layer... need to redraw it!
        if (feature && feature.rapidFeature) {
          feature.displayObject.visible = false;
          featureCache.delete(entity.id);
          feature = null;
        }

        if (!feature) {   // make poly if needed
          const geojson = geojsonRewind(entity.asGeoJSON(graph), true);
          const polygons = (geojson.type === 'Polygon') ? [geojson.coordinates]
            : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];
          const style = styleMatch(entity.tags);

          feature = new PixiFeaturePolygon(context, entity.id, polygons, style);

          // bind data and add to scene
          const container = feature.displayObject;
          const area = entity.extent(graph).area();  // estimate area from extent for speed
          container.zIndex = -area;                  // sort by area descending (small things above big things)
          container.__data__ = entity;
          layer.addChild(container);

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
//            .drawShape(feature.localBounds);
//        }
      });
  }

  return renderAreas;
}
