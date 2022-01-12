import * as PIXI from 'pixi.js';
import { vecAngle, vecInterp } from '@id-sdk/math';


export function pixiMidpoints(context) {
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
  function renderMidpoints(layer, projection, entities) {
    if (!_didInit) initMidpointTextures();

    const graph = context.graph();
    const k = projection.scale();

    function isLine(entity) {
      return (entity.type === 'way' || entity.type === 'relation') &&
        (entity.geometry(graph) === 'line' || entity.geometry(graph) === 'area');
    }

    const data = entities.filter(isLine);

    // gather ids to keep
    let visible = {};
    data.forEach(way => visible[way.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullMidpoints([id, datum]) {
      datum.container.visible = !!visible[id];
    });

    // enter/update
    data
      .forEach(function prepareMidpoints(way) {
        let datum = _cache.get(way.id);

        if (!datum) {
          const container = new PIXI.Container();
          container.name = way.id;
          container.alpha = 0.5;
          layer.addChild(container);

          datum = {
            nodes: graph.childNodes(way),
            container: container
          };

          _cache.set(way.id, datum);
        }

        // remember scale and reproject only when it changes
        if (k === datum.k) return;
        datum.k = k;

        datum.container.removeChildren();

        let nodeData = datum.nodes.map(node => {
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

          const midpoint = new PIXI.Sprite(_textures.midpoint);
          midpoint.name = [a.id, b.id].sort().join('-');
          midpoint.anchor.set(0.5, 0.5);  // middle, middle
          midpoint.position.set(pos[0], pos[1]);
          midpoint.rotation = rot;

          datum.container.addChild(midpoint);
        });
      });
  }

  return renderMidpoints;
}
