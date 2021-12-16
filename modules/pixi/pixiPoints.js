import * as PIXI from 'pixi.js';


export function pixiPoints(context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
  let _templates = {};
  let _sprites = {};
  let _didInit = false;


  function initPoints() {
    // prepare template geometry
    _templates.point = new PIXI.Graphics();
    _templates.point
      .lineStyle(1.5, 0x000000)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 10)
      .endFill();

    // prepare sprites
    const loader = PIXI.Loader.shared;
    loader.add('dist/img/maki-spritesheet.json');
    loader.load(loader => {
      let sheet = loader.resources['dist/img/maki-spritesheet.json'];
      _sprites.cafe = new PIXI.Sprite(sheet.textures['cafe-11.svg']);
      _sprites.feesh = new PIXI.Sprite(sheet.textures['aquarium-11.svg']);
      _sprites.tree = new PIXI.Sprite(sheet.textures['park-11.svg']);
//      _sprites.feesh.anchor.set(0.5);
    });
    _didInit = true;
  }


  function renderPoints(graph, entities) {
    if (!_didInit) initPoints();

    const pixi = context.pixi;
    let data = entities
      .filter(entity => entity.geometry(graph) === 'point');

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
          const template = _templates.point;
          const graphic = new PIXI.Graphics(template.geometry);
          graphic.name = entity.id;

          const container = new PIXI.Container();
          container.addChild(graphic);
          container.addChild(_sprites.feesh);

          _sprites.feesh.x = -5;  //?
          _sprites.feesh.y = -5;

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


  return renderPoints;
}
