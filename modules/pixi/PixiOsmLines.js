import * as PIXI from 'pixi.js';

import { PixiFeatureLine } from './PixiFeatureLine';
import { styleMatch } from './styles';

/**
 * PixiOsmLines
 * @class
 */
export class PixiOsmLines {

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
   * getLevelContainer
   * @param container   parent PIXI.Container()
   * @param level       numeric level that the feature should be on
   */
  getLevelContainer(container, level) {
    let levelContainer = container.getChildByName(level);
    if (!levelContainer) {
      levelContainer = new PIXI.Container();
      levelContainer.name = level.toString();
      levelContainer.interactive = false;
      levelContainer.interactiveChildren = true;
      levelContainer.sortableChildren = true;
      levelContainer.zIndex = level;
      container.addChild(levelContainer);
    }
    return levelContainer;
  }


  /**
   * render
   * @param container   parent PIXI.Container
   * @param projection  a pixi projection
   * @param zoom        the effective zoom to use for rendering
   * @param entities    Array of OSM entities
   */
  render(container, projection, zoom, entities) {
    const context = this.context;
    const scene = this.scene;
    const graph = context.graph();
    const thiz = this;

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
      .forEach(function prepareLines(entity) {
        let feature = scene.get(entity.id);

        // This feature used to be part of the rapid layer... need to redraw it!
        if (feature && feature.rapidFeature) {
          feature.displayObject.visible = false;
          scene.delete(entity.id);
          feature = null;
        }

        if (!feature) {   // make line if needed
          const geojson = entity.asGeoJSON(graph);
          const coords = geojson.coordinates;
          const style = styleMatch(entity.tags);

          const showOneWay = entity.isOneWay();
          const reversePoints = (entity.tags.oneway === '-1');

          feature = new PixiFeatureLine(context, entity.id, coords, style, showOneWay, reversePoints);

          const dObj = feature.displayObject;
          dObj.zIndex = getzIndex(entity.tags);
          dObj.__data__ = entity;

          // Add this line to the correct level container (bridge/tunnel/etc)
          const lvl = entity.layer().toString();
          const level = thiz.getLevelContainer(container, lvl);
          level.addChild(dObj);

          scene.add(feature);
        }

        feature.update(projection, zoom);
     });
  }
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

