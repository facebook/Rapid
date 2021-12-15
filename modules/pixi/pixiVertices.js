import * as PIXI from 'pixi.js';


export function pixiVertices(projection, context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
  let _templates = {};
  let _didInit = false;


  function initVertices(context) {
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


  function renderVertices(graph, entities) {
    if (!_didInit) initVertices(context);

    const pixi = context.pixi;
    let data = entities
      .filter(entity => entity.geometry(graph) === 'vertex')
      .sort((a, b) => b.loc[1] - a.loc[1]);

    // gather ids to keep
    let keep = {};
    data
      .forEach(entity => keep[entity.id] = true);

    // exit
    [..._cache.entries()].forEach(([id, data]) => {
      if (!keep[id]) {
        pixi.stage.removeChild(data.container);
        _cache.delete(id);
      }
    });

    // enter/update
    data
      .forEach(entity => {
        let datum = _cache.get(entity.id);

        if (!datum) {   // make point if needed
          const template = entity.hasInterestingTags() ? _templates.interestingVertex : _templates.plainVertex;
          const graphic = new PIXI.Graphics(template.geometry);
          graphic.name = entity.id;

          const container = new PIXI.Container();
          container.addChild(graphic);
          pixi.stage.addChild(container);

          datum = {
            loc: entity.loc,
            graphic: graphic,
            container: container
          };

          _cache.set(entity.id, datum);
        }

        // update
        const coord = context.projection(datum.loc);
        datum.container.x = coord[0];
        datum.container.y = coord[1];
      });
  }


  return renderVertices;
}
