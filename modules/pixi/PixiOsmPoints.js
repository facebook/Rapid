import * as PIXI from 'pixi.js';

import { PixiFeaturePoint } from './PixiFeaturePoint';
import { presetManager } from '../presets';


export function PixiOsmPoints(context, featureCache) {

  //
  // render
  //
  function renderPoints(layer, projection, entities) {
    const graph = context.graph();
    const k = projection.scale();
    const effectiveZoom = context.map().effectiveZoom();
    const SHOWBBOX = false;

    function isPoint(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'point';
    }

// todo: actually add some point styling options
//    // Special style for Wikidata-tagged items
//    function hasWikidata(entity) {
//      return (
//        entity.tags.wikidata ||
//        entity.tags['flag:wikidata'] ||
//        entity.tags['brand:wikidata'] ||
//        entity.tags['network:wikidata'] ||
//        entity.tags['operator:wikidata']
//      );
//    }


    // enter/update
    entities
      .filter(isPoint)
      .forEach(function preparePoints(node) {
        let feature = featureCache.get(node.id);
//        const hasWd = hasWikidata(node);

        if (!feature) {   // make point if needed
          const preset = presetManager.match(node, graph);
          const iconName = preset && preset.icon;

          feature = new PixiFeaturePoint(context, node.id, node.loc, iconName);

          const marker = feature.displayObject;
          marker.__data__ = node;
          layer.addChild(marker);

          featureCache.set(node.id, feature);
        }

        feature.update(projection, effectiveZoom);

//
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


  return renderPoints;
}
