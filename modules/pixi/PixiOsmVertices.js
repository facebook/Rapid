import { PixiFeaturePoint } from './PixiFeaturePoint';
import { presetManager } from '../presets';


export function PixiOsmVertices(context, featureCache) {

  //
  // render
  //
  function renderVertices(layer, projection, zoom, entities) {
    const graph = context.graph();

    function isLine(entity) {
      return entity.type === 'way' && entity.geometry(graph) === 'line';
    }
    function isInterestingVertex(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'vertex' && (
        graph.isShared(entity) || entity.hasInterestingTags() || entity.isEndpoint(graph)
      );
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

    // Gather all interesting child nodes of visible lines
    let vertices = new Set();
    entities
      .filter(isLine)
      .forEach(line => {
        graph.childNodes(line).forEach(node => {
          if (vertices.has(node)) return;
          if (!isInterestingVertex(node)) return;
          vertices.add(node);
        });
      });

    // enter/update
    vertices
      .forEach(function prepareVertices(node) {
        let feature = featureCache.get(node.id);

        if (!feature) {
          const preset = presetManager.match(node, graph);
          const iconName = preset && preset.icon;
          const directions = node.directions(graph, context.projection);

          // set marker style
          let markerStyle = {
            markerName: 'smallCircle',
            markerTint: 0xffffff,
            viewfieldName: 'viewfieldDark',
            viewfieldTint: 0xffffff,
            iconName: iconName,
            iconAlpha: 1
          };

          if (iconName) {
            markerStyle.markerName = 'largeCircle';
            markerStyle.iconName = iconName;
          } else if (node.hasInterestingTags()) {
            markerStyle.markerName = 'taggedCircle';
          }

          if (hasWikidata(node)) {
            markerStyle.markerTint = 0xdddddd;
            markerStyle.iconAlpha = 0.6;
          }
          if (graph.isShared(node)) {     // shared nodes / junctions are more grey
            markerStyle.markerTint = 0xbbbbbb;
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


  return renderVertices;
}

