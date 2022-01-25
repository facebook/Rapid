import * as PIXI from 'pixi.js';

import { presetManager } from '../presets';
import { getIconSpriteHelper } from './pixiHelpers';


export function pixiPoints(context, featureCache) {
  let _textures = {};
  let _didInit = false;

  //
  // prepare template geometry
  //
  function initPointTextures() {
    const marker = new PIXI.Graphics()         //              [0,-23]
      .lineStyle(1, 0x444444)                  //              _,-+-,_
      .beginFill(0xffffff, 1)                  //            /'       `\
      .moveTo(0, 0)                            //           :           :
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)    // [-8,-15]  :           :  [8,-15]
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)    //            \         /
      .bezierCurveTo(4,-23, 8,-19, 8,-15)      //             \       /
      .bezierCurveTo(8,-10, 2,-2, 0,0)         //              \     /
      .closePath()                             //               \   /      -y
      .endFill();                              //                `+`        |
                                               //               [0,0]       +-- +x

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
    const SHOWBBOX = false;

    function isPoint(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'point';
    }

    // enter/update
    entities
      .filter(isPoint)
      .forEach(function preparePoints(node) {
        let feature = featureCache.get(node.id);

        if (!feature) {   // make point if needed
          const container = new PIXI.Container();
          container.name = node.id;
          layer.addChild(container);

          const marker = new PIXI.Sprite(_textures.marker);
          marker.name = 'marker';
          marker.anchor.set(0.5, 1);  // middle, bottom
          container.addChild(marker);

          const bounds = new PIXI.Rectangle();

          const bbox = new PIXI.Graphics();
          bbox.name = node.id + '-bbox';
          bbox.visible = SHOWBBOX;
          container.addChild(bbox);

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

          feature = {
            displayObject: container,
            bounds: bounds,
            loc: node.loc,
            marker: marker,
            bbox: bbox
          };

          featureCache.set(node.id, feature);
        }

        // Remember scale and reproject only when it changes
        if (k === feature.k) return;
        feature.k = k;

        // Reproject and recalculate the bounding box
        const [x, y] = projection.project(feature.loc);
        feature.displayObject.position.set(x, y);

        // `getLocalBounds` will do the math for us and store it into the rect we provide
        // TODO: account for viewfields
        feature.marker.getLocalBounds(feature.bounds);

        if (SHOWBBOX) {
          feature.bbox
            .clear()
            .lineStyle(1, 0x66ff66)
            .drawShape(feature.bounds);
        }
      });
  }


  return renderPoints;
}
