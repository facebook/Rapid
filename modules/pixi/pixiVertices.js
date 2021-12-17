import * as PIXI from 'pixi.js';


export function pixiVertices(context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
  let _templates = {};
  let _didInit = false;


  function initVertices() {
    // prepare template geometry
    _templates.plainVertex = new PIXI.Graphics();
    _templates.plainVertex
      .lineStyle(1, 0x000000)
      .beginFill(0xaaaaaa, 1)
      .drawCircle(0, 0, 4)
      .endFill();

    // prepare template geometry
    _templates.interestingVertex = new PIXI.Graphics();
    _templates.interestingVertex
      .lineStyle(1, 0x000000)
      .beginFill(0xdddddd, 1)
      .drawCircle(0, 0, 6)
      .endFill();

    _didInit = true;
  }


  function renderVertices(layer, graph, entities) {
    if (!_didInit) initVertices();

    let data = entities
      .filter(entity => entity.geometry(graph) === 'vertex');

    // gather ids to keep
    let visible = {};
    data.forEach(entity => visible[entity.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullVertices([id, datum]) {
      datum.container.visible = !!visible[id];
    });

    // enter/update
    data
      .forEach(function prepareVertices(entity) {
        let datum = _cache.get(entity.id);

        if (!datum) {   // make point if needed
          const template = entity.hasInterestingTags() ? _templates.interestingVertex : _templates.plainVertex;
          const graphic = new PIXI.Graphics(template.geometry);

          const container = new PIXI.Container();
          container.name = entity.id;
          container.addChild(graphic);
          layer.addChild(container);

          datum = {
            loc: entity.loc,
            container: container
          };

          _cache.set(entity.id, datum);
        }

        // update
        const coord = context.projection(datum.loc);
        datum.container.x = coord[0];
        datum.container.y = coord[1];
        datum.container.visible = true;
      });
  }


  return renderVertices;
}
