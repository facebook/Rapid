import * as PIXI from 'pixi.js';
import { presetManager } from '../presets';
import { getIconSpriteHelper } from './pixiHelpers';

export function pixiPoints(context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
  let _textures = {};
  let _didInit = false;

  //
  // prepare template geometry
  //
  function initPointTextures() {
    const marker = new PIXI.Graphics()
      .lineStyle(1, 0x444444)
      .beginFill(0xffffff, 1)
      .moveTo(0, 0)
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)
      .bezierCurveTo(4,-23, 8,-19, 8,-15)
      .bezierCurveTo(8,-10, 2,-2, 0,0)
      .closePath()
      .endFill();

    // convert graphics to textures/sprites for performance
    // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    _textures.marker = renderer.generateTexture(marker, options);

    _didInit = true;
  }


  //
  // render
  //
  function renderPoints(layer, graph, entities) {
    if (!_didInit) initPointTextures();

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
          const preset = presetManager.match(entity, graph);
          const picon = preset && preset.icon;

          // const template = _textures.point;
          // const marker = new PIXI.Graphics(template.geometry);

          const marker = new PIXI.Sprite(_textures.marker);
          marker.name = 'marker';
          marker.anchor.set(0.5, 1);  // note: middle, bottom

          const container = new PIXI.Container();
          container.name = entity.id;
          container.addChild(marker);

          if (picon) {
            let thisSprite = getIconSpriteHelper(context, picon);
            const iconsize = 11;
            thisSprite.anchor.set(0.5, 0.5);
            // mathematically 0,-15 is center of marker, move down slightly
            thisSprite.x = 0;
            thisSprite.y = -14;
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
