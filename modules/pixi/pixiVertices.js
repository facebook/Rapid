import * as PIXI from 'pixi.js';
import { presetManager } from '../presets';
import { getIconSpriteHelper } from './pixiHelpers';


export function pixiVertices(context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
  let _textures = {};
  let _didInit = false;


  function initVertices() {
    let plain = new PIXI.Graphics();
    plain
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .endFill();

    let junction = new PIXI.Graphics();
    junction
      .lineStyle(1, 0x666666)
      .beginFill(0xbbbbbb, 1)
      .drawCircle(0, 0, 4.5)
      .endFill();

    let taggedPlain = new PIXI.Graphics();
    taggedPlain
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x000000, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    let taggedJunction = new PIXI.Graphics();
    taggedJunction
      .lineStyle(1, 0x666666)
      .beginFill(0xbbbbbb, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x000000, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    let iconPlain = new PIXI.Graphics();
    iconPlain
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 8)
      .endFill();

    let iconJunction = new PIXI.Graphics();
    iconJunction
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


  function renderVertices(layer, graph, entities) {
    if (!_didInit) initVertices();

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
          const preset = presetManager.match(entity, graph);
          const picon = preset && preset.icon;
          const isJunction = graph.isShared(entity);

          // let template;
          // if (picon) {
          //   template = isJunction ? _textures.iconJunction : _textures.iconPlain;
          // } else if (entity.hasInterestingTags()) {
          //   template = isJunction ? _textures.taggedJunction : _textures.taggedPlain;
          // } else {
          //   template = isJunction ? _textures.junction : _textures.plain;
          // }
          // const marker = new PIXI.Graphics(template.geometry);

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
          marker.anchor.set(0.5, 0.5);

          const container = new PIXI.Container();
          container.name = entity.id;
          container.addChild(marker);

          if (picon) {
            let icon = getIconSpriteHelper(context, picon);
            const iconsize = 11;
            icon.anchor.set(0.5, 0.5);
            icon.width = iconsize;
            icon.height = iconsize;
            container.addChild(icon);
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


  return renderVertices;
}
