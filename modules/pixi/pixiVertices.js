import * as PIXI from 'pixi.js';

import { presetManager } from '../presets';
import { getIconSpriteHelper, getViewfieldContainerHelper } from './pixiHelpers';


export function pixiVertices(context, featureCache) {
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

    const taggedPlain = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x000000, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    const iconPlain = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 8)
      .endFill();

    // convert graphics to textures/sprites for performance
    // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    _textures.plain = renderer.generateTexture(plain, options);
    _textures.taggedPlain = renderer.generateTexture(taggedPlain, options);
    _textures.iconPlain = renderer.generateTexture(iconPlain, options);

    _didInit = true;
  }


  //
  // render
  //
  function renderVertices(layer, projection, entities) {
    if (!_didInit) initVertexTextures();

    const graph = context.graph();
    const k = projection.scale();
    const SHOWBBOX = false;

    function isInterestingVertex(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'vertex' && (
        graph.isShared(entity) || entity.hasInterestingTags() || entity.isEndpoint(graph)
      );
    }

    // enter/update
    entities
      .filter(isInterestingVertex)
      .forEach(function prepareVertices(node) {
        let feature = featureCache.get(node.id);

        if (!feature) {   // make point if needed
          const container = new PIXI.Container();
          container.name = node.id;
          container.zIndex = -node.loc[1];  // sort by latitude ascending
          layer.addChild(container);

          const preset = presetManager.match(node, graph);
          const picon = preset && preset.icon;
          const isJunction = graph.isShared(node);

          // Add viewfields, if any are required.
          const directions = node.directions(graph, context.projection);
          if (directions.length > 0) {
            const vfContainer = getViewfieldContainerHelper(context, directions);
            container.addChild(vfContainer);
          }

          let t;
          if (picon) {
            t = 'iconPlain';
          } else if (node.hasInterestingTags()) {
            t = 'taggedPlain';
          } else {
            t = 'plain';
          }

          const marker = new PIXI.Sprite(_textures[t]);
          marker.name = t;
          marker.anchor.set(0.5, 0.5);  // middle, middle
          marker.tint = isJunction ? 0xffffff : 0xbbbbbb;
          container.addChild(marker);

          if (picon) {
            let icon = getIconSpriteHelper(context, picon);
            const iconsize = 11;
            icon.width = iconsize;
            icon.height = iconsize;
            container.addChild(icon);
          }
          const bounds = new PIXI.Rectangle();

          const bbox = new PIXI.Graphics();
          bbox.name = node.id + '-bbox';
          bbox.visible = SHOWBBOX;
          container.addChild(bbox);

          feature = {
            type: 'vertex',
            displayObject: container,
            localBounds: new PIXI.Rectangle(),
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

// Refresh the tint
// note that whether a thing is a junction can change as more geometry loads
// TODO : figure out a way to invalidate and redo geometry as we load more stuff from the OSM API.
        feature.marker.tint = graph.isShared(node) ? 0xbbbbbb : 0xffffff;

        // TODO: account for viewfields
        feature.marker.getLocalBounds(feature.localBounds);    // where 0,0 is the origin of the object
        feature.sceneBounds = feature.localBounds.clone();     // where 0,0 is the origin of the scene
        feature.sceneBounds.x += x;
        feature.sceneBounds.y += y;

        if (SHOWBBOX) {
          feature.bbox
            .clear()
            .lineStyle({
              width: 1,
              color: 0x66ff66,
              alignment: 0   // inside
            })
            .drawShape(feature.bounds);
        }
      });
  }


  return renderVertices;
}
