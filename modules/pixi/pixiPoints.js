import * as PIXI from 'pixi.js';
import { presetManager } from '../presets';


export function pixiPoints(context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
  let _templates = {};
  let _sprites = {};
  let _didInit = false;

  let _makiSheet;
  let _temakiSheet;
  let _fontAwesomeSheet;

  function initPoints() {
    // prepare template geometry
    _templates.point = new PIXI.Graphics();
    _templates.point
      .lineStyle(1.5, 0x000000)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 10)
      .endFill();

    _didInit = true;
  }

//       _sprites.cafe = new PIXI.Sprite(_makiSheet.textures['cafe-11.svg']);
//       _sprites.feesh = new PIXI.Sprite(_makiSheet.textures['aquarium-11.svg']);
//       _sprites.tree = new PIXI.Sprite(_makiSheet.textures['park-11.svg']);
//       _sprites.accounting = new PIXI.Sprite(_temakiSheet.textures['accounting.svg']);
//       _sprites.ambulance = new PIXI.Sprite(_fontAwesomeSheet.textures['fas-ambulance.svg']);
// //      _sprites.feesh.anchor.set(0.5);


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
          const preset = presetManager.match(entity, graph);
          const picon = preset && preset.icon;


          const container = new PIXI.Container();
          container.name = entity.id;
          container.addChild(graphic);

          if (picon) {
            const isMaki = /^maki-/.test(picon);
            let iconName = picon + (isMaki ? '-11' : '') + '.svg';
            let spritesheet = isMaki ? context._makiSheet : context._temakiSheet;
            let spriteName = isMaki ? iconName.slice(5) : iconName.slice(7);
            let thisSprite = new PIXI.Sprite(spritesheet.textures[spriteName]);

            let iconsize = 10;
            thisSprite.x = -0.5 *iconsize;  //?
            thisSprite.y = -0.5 *iconsize;  //?
            thisSprite.width = iconsize;
            thisSprite.height = iconsize;
            container.addChild(thisSprite);
          }

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
