import { PixiFeaturePoint } from './PixiFeaturePoint';
import { presetManager } from '../presets';


export function PixiOsmPoints(context, featureCache) {

  //
  // render
  //
  function renderPoints(layer, projection, zoom, entities) {
    const graph = context.graph();
    // const SHOWBBOX = false;

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
          const marker = feature.displayObject;
          marker.__data__ = node;
          layer.addChild(marker);

          featureCache.set(node.id, feature);
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


  return renderPoints;
}
