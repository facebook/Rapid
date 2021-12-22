import * as PIXI from 'pixi.js';
import { Extent, vecAngle, vecInterp, vecLength, geomLineIntersection } from '@id-sdk/math';


export function pixiMidpoints(projection, context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
    let midPointRadius = 4;

  let _templates = {};
  let _didInit = false;

  function initMidpoints() {
    // prepare template geometry
    _templates.point = new PIXI.Graphics();
    _templates.point
      .lineStyle(1, 0x000000)
      .beginFill(0xffffff, 1)
      .drawPolygon([-3,4,5,0,-3,-4])
      .endFill();

    _didInit = true;
  }

    function renderMidpoints(layer, graph, entities) {
        if (!_didInit) initMidpoints();

        let ways = entities
            .filter(entity => entity.geometry(graph) === 'line');

        // gather ids to keep
        let visible = {};

        // exit
        [..._cache.entries()].forEach(function cullPoints([id, datum]) {
            datum.container.visible = !!visible[id];
        });

        // enter/update
        ways.forEach(way => {

            let nodes = graph.childNodes(way);

            nodes.slice(0, -1).forEach((_, i) => {
                var a = nodes[i];
                var b = nodes[i + 1];

                let nodeId = [a.id, b.id].sort().join('-');

                let datum = _cache.get(nodeId);

                if (!datum) {
                    const template = _templates.point;
                    const graphic = new PIXI.Graphics(template.geometry);

                    const container = new PIXI.Container();
                    container.name = nodeId;
                    container.addChild(graphic);
                    container.alpha = 0.5;
                    // calculate rotation
                    layer.addChild(container);
                    datum = {
                        container: container,
                    };

                    _cache.set(nodeId, datum);
                }
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
