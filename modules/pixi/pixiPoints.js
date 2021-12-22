import * as PIXI from 'pixi.js';
import { presetManager } from '../presets';
import { getIconSpriteHelper } from './pixiHelpers';

export function pixiPoints(context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
  let _templates = {};
  let _didInit = false;

  function initPoints() {
    // prepare template geometry

    // was:  (off by a half pixel!)
    // .attr('transform', 'translate(-8, -23)')
    // .attr('d', 'M 17,8 C 17,13 11,21 8.5,23.5 C 6,21 0,13 0,8 C 0,4 4,-0.5 8.5,-0.5 C 13,-0.5 17,4 17,8 z');

    _templates.point = new PIXI.Graphics();
    _templates.point
      .lineStyle(1.5, 0x000000)
      .beginFill(0xffffff, 1)
      .moveTo(0, 0)
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)
      .bezierCurveTo(4,-23, 8,-19, 8,-15)
      .bezierCurveTo(8,-10, 2,-2, 0,0)
      .closePath()
      .endFill();

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
          const preset = presetManager.match(entity, graph);
          const picon = preset && preset.icon;


          const container = new PIXI.Container();
          container.name = entity.id;
          container.addChild(graphic);

          if (picon) {
            let thisSprite = getIconSpriteHelper(context, picon);

            let iconsize = 10;
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
