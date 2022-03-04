import { PixiFeaturePoint } from './PixiFeaturePoint';
import { presetManager } from '../presets';

/**
 * PixiOsmPoints
 * @class
 */
export class PixiOsmPoints {

  /**
   * @constructor
   * @param context
   * @param featureCache
   */
  constructor(context, featureCache) {
    this.context = context;
    this.featureCache = featureCache;
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
    const featureCache = this.featureCache;
    const graph = context.graph();

    function isPoint(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'point';
    }

    // Special style for Wikidata-tagged items
    function hasWikidata(entity) {
      return (
        entity.tags.wikidata ||
        entity.tags['flag:wikidata'] ||
        entity.tags['brand:wikidata'] ||
        entity.tags['network:wikidata'] ||
        entity.tags['operator:wikidata']
      );
    }

    // enter/update
    entities
      .filter(isPoint)
      .forEach(function preparePoints(node) {
        let feature = featureCache.get(node.id);

        if (!feature) {
          const preset = presetManager.match(node, graph);
          const iconName = preset && preset.icon;
          const directions = node.directions(graph, context.projection);

          // set marker style
          let markerStyle = {
            markerName: 'pin',
            markerTint: 0xffffff,
            viewfieldName: 'viewfieldDark',
            viewfieldTint: 0xffffff,
            iconName: iconName,
            iconAlpha: 1
          };
          if (hasWikidata(node)) {
            markerStyle.markerName = 'boldPin';
            markerStyle.markerTint = 0xdddddd;
            markerStyle.iconAlpha = 0.6;
          }

          feature = new PixiFeaturePoint(context, node.id, node.loc, directions, markerStyle);

          // bind data and add to scene
          const dObj = feature.displayObject;
          dObj.__data__ = node;
          container.addChild(dObj);

          featureCache.set(node.id, feature);
        }

        feature.update(projection, zoom);
      });
  }
}
