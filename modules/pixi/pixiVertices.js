import { Projection } from '@id-sdk/math';
import * as PIXI from 'pixi.js';

import { presetManager } from '../presets';
import { getIconSpriteHelper } from './pixiHelpers';


export function pixiVertices(context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
  let _textures = {};
  let _didInit = false;

  //
  // prepare template geometry
  //
  function initVertexTextures() {
    const plain = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .endFill();

    const junction = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xbbbbbb, 1)
      .drawCircle(0, 0, 4.5)
      .endFill();

    const taggedPlain = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x000000, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    const taggedJunction = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xbbbbbb, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x000000, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    const iconPlain = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 8)
      .endFill();

    const iconJunction = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xbbbbbb, 1)
      .drawCircle(0, 0, 8)
      .endFill();

    // convert graphics to textures/sprites for performance
    // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    _textures.plain = renderer.generateTexture(plain, options);
    _textures.junction = renderer.generateTexture(junction, options);
    _textures.taggedPlain = renderer.generateTexture(taggedPlain, options);
    _textures.taggedJunction = renderer.generateTexture(taggedJunction, options);
    _textures.iconPlain = renderer.generateTexture(iconPlain, options);
    _textures.iconJunction = renderer.generateTexture(iconJunction, options);

    _didInit = true;
  }


  //
  // render
  //
  function renderVertices(layer, graph, entities) {
    if (!_didInit) initVertexTextures();

    const k = context.projection.scale();
    const toMercator = new Projection(0, 0, k);

    let data = entities
      .filter(entity => {
        return entity.geometry(graph) === 'vertex' && (
          graph.isShared(entity) || entity.hasInterestingTags() || entity.isEndpoint(graph)
        );
      });

    // gather ids to keep
    let visible = {};
    data.forEach(entity => visible[entity.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullVertices([id, datum]) {
      datum.container.visible = !!visible[id];
    });

    // enter/update
    data
      .forEach(function prepareVertices(entity) {
        let datum = _cache.get(entity.id);

        if (!datum) {   // make point if needed
          const container = new PIXI.Container();
          container.name = entity.id;
          layer.addChild(container);

          const preset = presetManager.match(entity, graph);
          const picon = preset && preset.icon;
          const isJunction = graph.isShared(entity);

          let t;
          if (picon) {
            t = isJunction ? 'iconJunction' : 'iconPlain';
          } else if (entity.hasInterestingTags()) {
            t = isJunction ? 'taggedJunction' : 'taggedPlain';
          } else {
            t = isJunction ? 'junction' : 'plain';
          }
          const marker = new PIXI.Sprite(_textures[t]);
          marker.name = t;
          marker.anchor.set(0.5, 0.5);  // middle, middle
          container.addChild(marker);

          if (picon) {
            let icon = getIconSpriteHelper(context, picon);
            const iconsize = 11;
            icon.width = iconsize;
            icon.height = iconsize;
            container.addChild(icon);
          }

          datum = {
            loc: entity.loc,
            container: container
          };

          _cache.set(entity.id, datum);
        }

// reproject only if zoom changed
//        if (k && k === datum.k) return;
//
//        const coord = toMercator.project(datum.loc);

// reproject every time
        const coord = context.projection(datum.loc);

        datum.container.position.set(coord[0], coord[1]);
        datum.k = k;
      });
  }


  return renderVertices;
}
