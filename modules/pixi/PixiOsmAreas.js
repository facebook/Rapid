import geojsonRewind from '@mapbox/geojson-rewind';

import { PixiFeaturePolygon } from './PixiFeaturePolygon';
import { styleMatch } from './styles';


/**
 * PixiOsmAreas
 * @class
 */
export class PixiOsmAreas {

  /**
   * @constructor
   * @param context
   * @param scene
   */
  constructor(context, scene) {
    this.context = context;
    this.scene = scene;
  }


  /**
   * render
   * @param container       parent PIXI.Container
   * @param projection  a pixi projection
   * @param zoom        the effective zoom to use for rendering
   * @param entities    Array of OSM entities
   */
  render(container, projection, zoom, entities) {
    const context = this.context;
    const scene = this.scene;
    const graph = context.graph();

    function isPolygon(entity) {
      return (entity.type === 'way' || entity.type === 'relation') && entity.geometry(graph) === 'area';
    }

    // enter/update
    entities
      .filter(isPolygon)
      .forEach(function prepareAreas(entity) {
        let feature = scene.get(entity.id);

        //This feature used to be part of the rapid layer... need to redraw it!
        if (feature && feature.rapidFeature) {
          feature.displayObject.visible = false;
          scene.delete(entity.id);
          feature = null;
        }

        if (!feature) {   // make poly if needed
          const geojson = geojsonRewind(entity.asGeoJSON(graph), true);
          const polygons = (geojson.type === 'Polygon') ? [geojson.coordinates]
            : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];
          const style = styleMatch(entity.tags);

          feature = new PixiFeaturePolygon(context, entity.id, polygons, style);

          // bind data and add to scene
          const dObj = feature.displayObject;
          const area = entity.extent(graph).area();  // estimate area from extent for speed
          dObj.zIndex = -area;                       // sort by area descending (small things above big things)
          dObj.__data__ = entity;
          container.addChild(dObj);

          scene.add(feature);
        }

        feature.update(projection, zoom);
      });
  }
}
