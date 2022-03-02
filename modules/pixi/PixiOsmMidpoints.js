import * as PIXI from 'pixi.js';
import { vecAngle, vecInterp } from '@id-sdk/math';


export function PixiOsmMidpoints(context, featureCache) {

  //
  // render
  //
  function renderMidpoints(layer, projection, zoom, entities) {
    const graph = context.graph();
    const k = projection.scale();

    function isLine(entity) {
      return (entity.type === 'way' || entity.type === 'relation') &&
        (entity.geometry(graph) === 'line' || entity.geometry(graph) === 'area');
    }

    const data = entities.filter(isLine);
    const midpointTexture = context.pixi.rapidTextures.get('midpoint');


    // gather ids to keep
    let visible = {};
    data.forEach(way => visible[way.id] = true);

    // exit
    [...featureCache.entries()].forEach(function cullMidpoints([id, feature]) {
      feature.container.visible = !!visible[id];
    });

    // enter/update
    data
      .forEach(function prepareMidpoints(way) {
        let feature = featureCache.get(way.id);

        if (!feature) {
          const container = new PIXI.Container();
          container.name = way.id;
          container.alpha = 0.5;
          layer.addChild(container);

          feature = {
            nodes: graph.childNodes(way),
            container: container
          };

          featureCache.set(way.id, feature);
        }

        // remember scale and reproject only when it changes
        if (k === feature.k) return;
        feature.k = k;

        feature.container.removeChildren();

        let nodeData = feature.nodes.map(node => {
          return {
            id: node.id,
            point: projection.project(node.loc)
          };
        });

        if (way.tags.oneway === '-1') {
          nodeData.reverse();
        }

        nodeData.slice(0, -1).forEach((_, i) => {
          const a = nodeData[i];
          const b = nodeData[i + 1];
          const pos = vecInterp(a.point, b.point, 0.5);
          const rot = vecAngle(a.point, b.point);

          const midpoint = new PIXI.Sprite(midpointTexture);
          midpoint.name = [a.id, b.id].sort().join('-');
          midpoint.anchor.set(0.5, 0.5);  // middle, middle
          midpoint.position.set(pos[0], pos[1]);
          midpoint.rotation = rot;

          feature.container.addChild(midpoint);
        });
      });
  }

  return renderMidpoints;
}
