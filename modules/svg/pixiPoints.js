import * as PIXI from 'pixi.js';

import deepEqual from 'fast-deep-equal';
import { geoScaleToZoom } from '@id-sdk/geo';
import { osmEntity } from '../osm';
import { svgPointTransform } from './helpers';
import { presetManager } from '../presets';


export function pixiPoints(projection, context) {
  let scene = new Map();   // map of OSM ID -> Pixi Graphic
  let sprites = {};

  let _didInit = false;

  function init(context) {
    const pixi = context.pixi;
    const loader = PIXI.Loader.shared;
    loader.add('maki', context.imagePath('maki-sprite.svg'));
    loader.load((loader, resources) => {
      debugger;
      // sprites.bunny = new PIXI.TilingSprite(resources.bunny.texture);
      // sprites.spaceship = new PIXI.TilingSprite(resources.spaceship.texture);
      // sprites.scoreFont = new PIXI.TilingSprite(resources.scoreFont.texture);
    });
    _didInit = true;
  }


  function render(graph, entities) {
    if (!_didInit) init(context);

    const pixi = context.pixi;
    let data = entities
      .filter(entity => entity.geometry(graph) === 'point')
      .sort((a, b) => b.loc[1] - a.loc[1]);

    // gather ids to keep
    let keep = {};
    data
      .forEach(entity => keep[entity.id] = true);

    // exit
    [...scene.entries()].forEach(([id, data]) => {
      if (!keep[id]) {
        pixi.stage.removeChild(data.graphic);
        scene.delete(id);
      }
    });

    // enter/update
    data
      .forEach(entity => {
        let point = scene.get(entity.id);

        if (!point) {   // make point if needed
          const graphic = new PIXI.Graphics();
          graphic.name = entity.id;
          pixi.stage.addChild(graphic);

          point = {
            loc: entity.loc,
            graphic: graphic
          };

          scene.set(entity.id, point);
        }

        // update
        const coord = context.projection(point.loc);
        point.graphic
          .clear()
          .lineStyle(2, 0x000000)
          .beginFill(0xffffff, 0.9)
          .drawCircle(coord[0], coord[1], 10)
          .endFill();
      });
  }


  return render;
}
