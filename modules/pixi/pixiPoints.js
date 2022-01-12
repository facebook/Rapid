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
  function renderPoints(layer, projection, entities) {
    if (!_didInit) initPointTextures();

    const graph = context.graph();
    const k = projection.scale();

    function isPoint(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'point';
    }

    const data = entities.filter(isPoint);

    // gather ids to keep
    let visible = {};
    data.forEach(node => visible[node.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullPoints([id, datum]) {
      datum.container.visible = !!visible[id];
    });

    // enter/update
    data
      .forEach(function preparePoints(node) {
        let datum = _cache.get(node.id);

        if (!datum) {   // make point if needed
          const container = new PIXI.Container();
          container.name = node.id;
          layer.addChild(container);

          const marker = new PIXI.Sprite(_textures.marker);
          marker.name = 'marker';
          marker.anchor.set(0.5, 1);  // middle, bottom
          container.addChild(marker);

          const preset = presetManager.match(node, graph);
          const picon = preset && preset.icon;

          if (picon) {
            let icon = getIconSpriteHelper(context, picon);
            const iconsize = 11;
            // mathematically 0,-15 is center of marker, move down slightly
            icon.position.set(0, -14);
            icon.width = iconsize;
            icon.height = iconsize;
            container.addChild(icon);
          }

          datum = {
            loc: node.loc,
            container: container
          };

          _cache.set(node.id, datum);
        }

        // remember scale and reproject only when it changes
        if (k === datum.k) return;
        datum.k = k;

        const coord = projection.project(datum.loc);
        datum.container.position.set(coord[0], coord[1]);
      });
  }


  return renderPoints;
}
