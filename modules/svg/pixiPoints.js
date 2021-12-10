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
    loader.add('dist/img/maki-spritesheet.json');
    loader.load((loader, resources) => {
      let sheet = loader.resources['dist/img/maki-spritesheet.json'];
      sprites.cafe = new PIXI.Sprite(sheet.textures['cafe-11.svg']);
      sprites.feesh = new PIXI.Sprite(sheet.textures['aquarium-11.svg']);
      sprites.tree = new PIXI.Sprite(sheet.textures['park-11.svg']);
      sprites.feesh.x = window.innerWidth / 2;
      sprites.feesh.y = window.innerHeight / 2;
//      sprites.feesh.anchor.set(0.5);
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
          const container = new PIXI.Container();
          graphic.name = entity.id;

          point = {
            loc: entity.loc,
            graphic: graphic,
            container: container
          };

          scene.set(entity.id, point);
        }

        // update
        const coord = context.projection(point.loc);
        point.graphic
          .clear()
          .lineStyle(1.5, 0x000000)
          .beginFill(0xffffff, 0.7)
          .drawCircle(7, 7, 15)
          .endFill();

        point.container.x = coord[0];
        point.container.y = coord[1];
        sprites.feesh.x = 0;
        sprites.feesh.y = 0;
        point.container.addChild(point.graphic);
        point.container.addChild(sprites.feesh);
        pixi.stage.addChild(point.container);

      });


  }


  return render;
}
