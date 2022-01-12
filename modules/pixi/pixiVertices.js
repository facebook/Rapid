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
  function renderVertices(layer, projection, entities) {
    if (!_didInit) initVertexTextures();

    const graph = context.graph();
    const k = projection.scale();

    function isInterestingVertex(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'vertex' && (
        graph.isShared(entity) || entity.hasInterestingTags() || entity.isEndpoint(graph)
      );
    }

    const data = entities.filter(isInterestingVertex);

    // gather ids to keep
    let visible = {};
    data.forEach(node => visible[node.id] = true);

    // exit
    [..._cache.entries()].forEach(function cullVertices([id, datum]) {
      datum.container.visible = !!visible[id];
    });

    // enter/update
    data
      .forEach(function prepareVertices(node) {
        let datum = _cache.get(node.id);

        if (!datum) {   // make point if needed
          const container = new PIXI.Container();
          container.name = node.id;
          layer.addChild(container);

          const preset = presetManager.match(node, graph);
          const picon = preset && preset.icon;
          const isJunction = graph.isShared(node);

          let t;
          if (picon) {
            t = isJunction ? 'iconJunction' : 'iconPlain';
          } else if (node.hasInterestingTags()) {
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


  return renderVertices;
}
