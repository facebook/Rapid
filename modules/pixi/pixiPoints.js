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
    loader.add('dist/img/icons/maki-spritesheet.json');
    loader.add('dist/img/icons/temaki-spritesheet.json');
    loader.add('dist/img/icons/fontawesome-spritesheet.json');
    loader.load(loader => {
      let sheet = loader.resources['dist/img/icons/maki-spritesheet.json'];
      let temakiSheet = loader.resources['dist/img/icons/temaki-spritesheet.json'];
      let fontawesomesheet = loader.resources['dist/img/icons/fontawesome-spritesheet.json'];
      _sprites.cafe = new PIXI.Sprite(sheet.textures['cafe-11.svg']);
      _sprites.feesh = new PIXI.Sprite(sheet.textures['aquarium-11.svg']);
      _sprites.tree = new PIXI.Sprite(sheet.textures['park-11.svg']);
      _sprites.accounting = new PIXI.Sprite(temakiSheet.textures['accounting.svg']);
      _sprites.ambulance = new PIXI.Sprite(fontawesomesheet.textures['fas-ambulance.svg']);
//      _sprites.feesh.anchor.set(0.5);
    });
    _didInit = true;
  }


  function renderPoints(layer, graph, entities) {
    if (!_didInit) initPoints();

    let data = entities
      .filter(entity => entity.geometry(graph) === 'point');

    // gather ids to keep
    let visible = {};
    data.forEach(entity => visible[entity.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullPoints([id, datum]) {
      datum.container.visible = !!visible[id];
    });

    // enter/update
    data
      .forEach(function preparePoints(entity) {
        let datum = _cache.get(entity.id);

        if (!datum) {   // make point if needed
          const template = _templates.point;
          const graphic = new PIXI.Graphics(template.geometry);

          const container = new PIXI.Container();
          container.name = entity.id;
          container.addChild(graphic);
          let thisSprite = _sprites.feesh;
          container.addChild(thisSprite);

          let iconsize = 10;
          thisSprite.x = -0.5 *iconsize;  //?
          thisSprite.y = -0.5 *iconsize;  //?
          thisSprite.width = iconsize;
          thisSprite.height = iconsize;
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


  return renderPoints;
}
