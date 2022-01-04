import * as PIXI from 'pixi.js';
import { vecAngle, vecInterp } from '@id-sdk/math';


export function pixiMidpoints(projection, context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
  let _textures = {};
  let _didInit = false;

  //
  // prepare template geometry
  //
  function initMidpointTextures() {
    const midpoint = new PIXI.Graphics()
      .lineStyle(1, 0x000000)
      .beginFill(0xffffff, 1)
      .drawPolygon([-3,4, 5,0, -3,-4])
      .endFill();

    // convert graphics to textures/sprites for performance
    // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    _textures.midpoint = renderer.generateTexture(midpoint, options);

    _didInit = true;
  }


  //
  // render
  //
  function renderMidpoints(layer, graph, entities) {
    if (!_didInit) initMidpointTextures();

    let ways = entities
      .filter(entity => entity.geometry(graph) === 'line');

    // gather ids to keep
    let visible = {};
    ways.forEach(way => visible[way.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullMidpoints([id, datum]) {
      datum.container.visible = !!visible[id];
    });

    // enter/update
    ways.forEach(way => {
      let nodes = graph.childNodes(way);

      nodes.slice(0, -1).forEach((_, i) => {
        const a = nodes[i];
        const b = nodes[i + 1];

        const nodeId = [a.id, b.id].sort().join('-');
        let datum = _cache.get(nodeId);

        if (!datum) {
          const midpoint = new PIXI.Sprite(_textures.midpoint);
          midpoint.name = nodeId;
          midpoint.anchor.set(0.5, 0.5);

          const container = new PIXI.Container();
          container.name = nodeId;
          container.addChild(midpoint);
          container.alpha = 0.5;

          layer.addChild(container);
          datum = {
            container: container,
          };

          _cache.set(nodeId, datum);
        }

        // update
        const aProj = projection(a.loc);
        const bProj = projection(b.loc);
        const rotation = vecAngle(aProj, bProj);
        const midPoint = vecInterp(aProj, bProj, 0.5);

        datum.container.x = midPoint[0];
        datum.container.y = midPoint[1];
        datum.container.rotation = rotation;
        datum.container.visible = true;
      });
    });
  }

  return renderMidpoints;
}
