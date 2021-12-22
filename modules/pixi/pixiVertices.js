import * as PIXI from 'pixi.js';
import { presetManager } from '../presets';
import { getIconSpriteHelper } from './pixiHelpers';


export function pixiVertices(context) {
  let _cache = new Map();   // map of OSM ID -> Pixi data
  let _templates = {};
  let _didInit = false;


  function initVertices() {
    _templates.plain = new PIXI.Graphics();
    _templates.plain
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .endFill();

    _templates.junction = new PIXI.Graphics();
    _templates.junction
      .lineStyle(1, 0x666666)
      .beginFill(0xbbbbbb, 1)
      .drawCircle(0, 0, 4.5)
      .endFill();

    _templates.taggedPlain = new PIXI.Graphics();
    _templates.taggedPlain
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x000000, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    _templates.taggedJunction = new PIXI.Graphics();
    _templates.taggedJunction
      .lineStyle(1, 0x666666)
      .beginFill(0xbbbbbb, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x000000, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    _templates.iconPlain = new PIXI.Graphics();
    _templates.iconPlain
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 8)
      .endFill();

    _templates.iconJunction = new PIXI.Graphics();
    _templates.iconJunction
      .lineStyle(1, 0x666666)
      .beginFill(0xbbbbbb, 1)
      .drawCircle(0, 0, 8)
      .endFill();

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

          let template;
          if (picon) {
            template = isJunction ? _templates.iconJunction : _templates.iconPlain;
          } else if (entity.hasInterestingTags()) {
            template = isJunction ? _templates.taggedJunction : _templates.taggedPlain;
          } else {
            template = isJunction ? _templates.junction : _templates.plain;
          }
          const graphic = new PIXI.Graphics(template.geometry);

          const container = new PIXI.Container();
          container.name = entity.id;
          container.addChild(graphic);

          if (picon) {
            let thisSprite = getIconSpriteHelper(context, picon);
            const iconsize = 11;
            thisSprite.anchor.set(0.5, 0.5);
            thisSprite.x = 0;
            thisSprite.y = 0;
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


  return renderVertices;
}
